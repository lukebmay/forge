/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Gnome imports
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import Shell from "gi://Shell";

// Gnome Shell imports
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import { createEnum } from "./enum.js";
import * as Utils from "./utils.js";
import { Tree, Queue, POSITION, LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree.js";
import { production } from "../shared/settings.js";
import { CommandHandler } from "./command.js";
import { DecorationManager } from "./decoration.js";
import { DragDropManager } from "./drag-drop.js";
import { FocusManager } from "./focus.js";
import { SessionLayoutRestoreManager } from "./session-layout-restore.js";
import { SoftRehomeManager, safeMoveToMonitor } from "./soft-rehome.js";
import { LayoutDebugOverlay } from "./layout-debug-overlay.js";
import * as Compat from "./compat.js";
import {
  LftMru,
  aspectOrientationFromRect,
  isTabOrStackParent,
  shouldTabInsteadOfSplit,
  resolveOpenAppPlacement,
  matchPendingDockLaunch,
  DOCK_LAUNCH_TTL_MS,
  DOCK_STICKY_GRACE_MS,
} from "./lft-mru.js";
import {
  consumePlaceHint,
  enqueuePlaceHint,
  normalizePlaceHint,
  pruneExpiredPlaceHints,
  resolvePlaceMonitorIndex,
} from "./place-hint.js";
import { parseSelector, matchNodes, matchWindows, pickMatch } from "./tile-select.js";
import * as MonitorIdentity from "./monitor-identity.js";
import { resolveOwningSplit, resolveOwningSplitsBothAxes } from "./layout-resize.js";
import { resolveResizeOpsSeed } from "./layout-unit.js";
import { resolveAttachOnFocusChange } from "./layout-unit.js";

/** @typedef {import('../../extension.js').default} ForgeExtension */

export const WINDOW_MODES = createEnum(["FLOAT", "TILE", "GRAB_TILE", "DEFAULT"]);

// Simplify the grab modes
export const GRAB_TYPES = createEnum(["RESIZING", "MOVING", "UNKNOWN"]);

// forge-zlg: golden-ratio reciprocal (1/φ). The focused window claims this share
// of its split pair; the pair gets the remainder (1 - GOLDEN).
const GOLDEN = 0.6180339887;

// Bug #351 fix: Window types that shouldn't be tiled (browser popups, tooltips, etc.)
const INVALID_WINDOW_TYPES = new Set([
  Meta.WindowType.UTILITY,
  Meta.WindowType.POPUP_MENU,
  Meta.WindowType.DROPDOWN_MENU,
  Meta.WindowType.TOOLTIP,
]);

const VALID_WINDOW_TYPES = new Set([
  Meta.WindowType.NORMAL,
  Meta.WindowType.MODAL_DIALOG,
  Meta.WindowType.DIALOG,
]);

/**
 * Disconnect all signals from a target and clear the array
 * @param {Object} target - The object to disconnect signals from
 * @param {number[]} signals - Array of signal IDs
 */
function disconnectSignals(target, signals) {
  if (!target || !signals) return;
  for (const signal of signals) {
    // Bug #328: a finalized GObject wrapper throws on disconnect; one bad
    // target must not abort cleanup of the remaining signals/targets.
    try {
      target.disconnect(signal);
    } catch (e) {
      Logger.debug(`disconnect on disposed target skipped: ${e}`);
    }
  }
  signals.length = 0;
}

export class WindowManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {ForgeExtension} */
  ext;

  /** @param {ForgeExtension} ext */
  constructor(ext) {
    super();
    this.ext = ext;
    this.prefsTitle = `Forge ${_("Settings")} - ${
      !production ? "DEV" : ext.metadata["version-name"] ?? "unknown"
    }`;
    this.reloadWindowOverrides();
    this._tree = new Tree(this);
    // Owns decoration/border rendering. Decoration methods are signal/render-driven
    // (never invoked during this constructor), so building it here is safe.
    this.decorationManager = new DecorationManager(this._tree, this);
    // Owns the focus/pointer-follow cluster. Constructed BEFORE the pointerLoopInit()
    // call below (which delegates to it when focus-on-hover is enabled), so it must
    // exist by then.
    this.focusManager = new FocusManager(this._tree, this);
    // Owns session-layout save/restore/rehome/shield. Flags stay on this instance
    // for live thrash checks (entered-monitor / soft rehome consult them).
    this.sessionLayoutRestore = new SessionLayoutRestoreManager(this._tree, this);
    // Owns workareas settle + soft rehome (H1). Thrash/last-good flags stay on WM.
    this.softRehome = new SoftRehomeManager(this._tree, this);
    // Owns grab-tile / drag-drop. grabOp, _draggedNodeWindow, freeze stay on WM.
    this.dragDrop = new DragDropManager(this._tree, this);
    // C3: set true during grab so decoration uses split-chrome mode "all"
    this._splitChromeForceShowAll = false;
    this.layoutDebugOverlay = new LayoutDebugOverlay(this);
    this.eventQueue = new Queue();
    this.theme = this.ext.theme;
    this.lastFocusedWindow = null;
    // OP1: global + per-monitor last-focused-tile MRU (floats never enter).
    this.lftMru = new LftMru();
    /** @type {Array<{ monitor: number, appId?: string|null, ts: number }>} */
    this._pendingDockLaunches = [];
    /** @type {import('./place-hint.js').PlaceHint[]} FC2 PlaceNext one-shots */
    this._pendingPlaceHints = [];
    this._dockLaunchHooked = false;
    this.shouldFocusOnHover = this.ext.settings.get_boolean("focus-on-hover-enabled");

    this._commandHandler = new CommandHandler(this);

    // Last quiet placement per Meta.Window (monitor index + frame) for soft rehome.
    this._lastGoodHomes = new WeakMap();
    this._workareasThrashPending = false;
    this._workareasSettleSrcId = 0;
    // unlock-dialog: hold thrash pending; settle only after user unlock.
    this._lockScreenThrashGuard = false;
    // mono µs + timer: thrash pending held after soft rehome settle (sliding).
    this._softRehomeCooldownUntilUs = 0;
    this._softRehomeCooldownSrcId = 0;
    // Fingerprint at settle arm; re-arm if mon geometry still moving.
    this._workareasSettleFingerprint = "";
    // Session restore: suppress entered-monitor rehome; soft rehome defers until clear.
    this._sessionLayoutRestoring = false;
    // tree.apply move_resize can emit window-entered-monitor mid-paint; rehome
    // then redistributeSiblingPercent collapses mon-level userSized shares to 1.
    this._suppressEnteredMonitorRehome = false;
    // apply/move → size/position-changed must not schedule another full renderTree.
    this._suppressGeometrySignalRetile = false;
    // After restore: hold liveForest so thrash soft-rehome cannot snapshot a broken tree.
    this._sessionLayoutShield = null;
    // T7: stableKey ↔ index map (refreshed on settle / monitors-changed).
    this._monitorLiveMap = null;
    this._monitorLiveMapPrevFingerprints = null;
    this._layoutMonitorsChangedId = 0;

    Logger.info("forge initialized");

    if (this.shouldFocusOnHover) {
      // Start the pointer loop to observe the pointer position
      // and change the focus window accordingly
      this.pointerLoopInit();
    }
  }

  pointerLoopInit() {
    return this.focusManager.pointerLoopInit();
  }

  /**
   * Load window overrides, apply an update function, then save.
   * @param {Function} updateFn - Receives (overrides, wmClass, wmId), returns updated overrides
   * @param {Meta.Window} metaWindow
   * @param {boolean} withWmId
   */
  _updateWindowOverrides(updateFn, metaWindow, withWmId) {
    // windowDestroy runs the remove path on EVERY close, and a fast/Wayland close
    // can finalize the wrapper before this runs — get_wm_class()/get_id() would
    // throw "already deallocated" and abort the rest of windowDestroy (forge-h7ba).
    if (!Utils.isWindowAlive(metaWindow)) return;
    let currentProps = this.ext.configMgr.windowProps;
    let wmClass = metaWindow.get_wm_class();
    let wmId = metaWindow.get_id();
    const beforeLength = currentProps.overrides.length;
    currentProps.overrides = updateFn(currentProps.overrides, wmClass, wmId, withWmId);
    // ALWAYS refresh the WM cache from this fresh config read: other writers
    // (prefs, the e2e bridge) update configMgr without touching this.windowProps,
    // and isFloatingExempt reads the cache — keeping a stale one misroutes the
    // next float toggle (caught on the F39 lane).
    this.windowProps = currentProps;
    // Both updateFns only add or remove entries; skip the DISK write when the
    // set is unchanged — windowDestroy runs the remove path on EVERY close.
    if (currentProps.overrides.length === beforeLength) return;
    this.ext.configMgr.windowProps = currentProps;
  }

  // Add a {wmClass, [wmId], mode} override for this window, de-duping against an
  // existing same-mode rule. Per-window (withWmId) and class-wide (!withWmId)
  // rules are kept distinct (Bug #172/#453).
  _addModeOverride(metaWindow, withWmId, mode) {
    this._updateWindowOverrides(
      (overrides, wmClass, wmId, withWmId) => {
        for (let override of overrides) {
          if (override.mode !== mode) continue;
          if (withWmId) {
            if (override.wmClass === wmClass && override.wmId === wmId) return overrides;
          } else {
            if (override.wmClass === wmClass && !override.wmId && !override.wmTitle)
              return overrides;
          }
        }
        overrides.push({
          wmClass: wmClass,
          wmId: withWmId ? wmId : undefined,
          mode: mode,
        });
        return overrides;
      },
      metaWindow,
      withWmId
    );
  }

  // Remove the {wmClass, [wmId], mode} overrides Forge writes for this window.
  // Title-bearing rules are user-authored and persistent, so they are left
  // alone; a per-window remove (withWmId) leaves class-wide rules intact (#172).
  _removeModeOverride(metaWindow, withWmId, mode) {
    this._updateWindowOverrides(
      (overrides, wmClass, wmId, withWmId) => {
        return overrides.filter(
          (override) =>
            !(
              override.mode === mode &&
              override.wmClass === wmClass &&
              !override.wmTitle &&
              (!withWmId || override.wmId === wmId)
            )
        );
      },
      metaWindow,
      withWmId
    );
  }

  addFloatOverride(metaWindow, withWmId) {
    this._addModeOverride(metaWindow, withWmId, "float");
  }

  removeFloatOverride(metaWindow, withWmId) {
    this._removeModeOverride(metaWindow, withWmId, "float");
  }

  addTileOverride(metaWindow, withWmId) {
    this._addModeOverride(metaWindow, withWmId, "tile");
  }

  removeTileOverride(metaWindow, withWmId) {
    this._removeModeOverride(metaWindow, withWmId, "tile");
  }

  toggleFloatingMode(action, metaWindow) {
    let nodeWindow = this.findNodeWindow(metaWindow);
    if (!nodeWindow || !action) return;
    if (nodeWindow.nodeType !== NODE_TYPES.WINDOW) return;

    let withWmId = action.name === "FloatToggle";

    if (this.isFloatingExempt(metaWindow)) {
      // Toggle toward TILED. Drop any float override this window owns; if it is
      // still exempt (forge-fxf #387: floated only by a broader class rule), add
      // a winning per-window tile override so just this window tiles, leaving the
      // class rule and its siblings untouched.
      this.removeFloatOverride(metaWindow, withWmId);
      if (this.isFloatingExempt(metaWindow)) {
        this.addTileOverride(metaWindow, withWmId);
      }
    } else {
      // Toggle toward FLOATING. Drop any tile override this window owns (clean
      // reversibility); if it is still tiled, add a float override.
      this.removeTileOverride(metaWindow, withWmId);
      if (!this.isFloatingExempt(metaWindow)) {
        this.addFloatOverride(metaWindow, withWmId);
      }
    }

    // Bug #319: use the float setter so _forgeSetAbove is handled. Mirror
    // processFloats so the node reflects the new decision before the trailing
    // renderTree reconciles the whole tree.
    nodeWindow.float =
      this.isFloatingExempt(metaWindow) ||
      !this.isActiveWindowWorkspaceTiled(metaWindow) ||
      !this.isActiveWindowMonitorTiled(metaWindow);
  }

  queueEvent(eventObj, interval = 220) {
    this.eventQueue.enqueue(eventObj);

    if (!this._queueSourceId) {
      this._queueSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        const currEventObj = this.eventQueue.dequeue();
        if (currEventObj) {
          try {
            currEventObj.callback();
          } catch (e) {
            // Bug #531: an uncaught throw would remove this source with
            // _queueSourceId still set, silencing the queue forever.
            Logger.warn(`queueEvent: ${currEventObj.name} callback failed: ${e}`);
          }
        }
        const result = this.eventQueue.length !== 0;
        if (!result) {
          this._queueSourceId = 0;
        }
        return result;
      });
    }
  }

  /**
   * This is the central place to bind all the non-window signals.
   */
  _bindSignals() {
    if (this._signalsBound) return;

    const display = global.display;
    const shellWm = global.window_manager;

    this._displaySignals = [
      display.connect("window-created", this.trackWindow.bind(this)),
      display.connect("grab-op-begin", this._handleGrabOpBegin.bind(this)),
      display.connect("window-entered-monitor", this._onWindowEnteredMonitor.bind(this)),
      display.connect("grab-op-end", this._handleGrabOpEnd.bind(this)),
      display.connect("showing-desktop-changed", () => {
        this.hideWindowBorders();
        this.updateDecorationLayout();
      }),
      display.connect("in-fullscreen-changed", () => {
        // forge-zo4: renderTree's pipeline reconciles fullscreen float demotion
        // (after processFloats), so floats drop below a newly-fullscreen window.
        this.renderTree("full-screen-changed");
      }),
      display.connect("workareas-changed", this._onWorkareasChanged.bind(this)),
    ];

    this._windowManagerSignals = [
      shellWm.connect("minimize", (_shellwm, actor) =>
        this._onMinimizeChange("minimize", {
          hideBorders: true,
          resetGrandparentIfEmpty: true,
          metaWindow: actor?.meta_window,
        })
      ),
      shellWm.connect("unminimize", (_shellwm, actor) =>
        this._onMinimizeChange("unminimize", { metaWindow: actor?.meta_window })
      ),
      shellWm.connect("show-tile-preview", (_, _metaWindow, _rect, _num) => {
        // Empty
      }),
    ];

    const globalWsm = global.workspace_manager;

    this._workspaceManagerSignals = [
      globalWsm.connect("showing-desktop-changed", () => {
        this.hideWindowBorders();
        this.updateDecorationLayout();
      }),
      globalWsm.connect("workspace-added", (_, wsIndex) => {
        // If a node with this index already exists, shift existing nodes up first
        if (this.tree.findNode(`ws${wsIndex}`)) {
          this.tree.workspaceManager.renumberWorkspacesAfterAddition(wsIndex);
        }
        this.tree.addWorkspace(wsIndex);
        this.trackCurrentMonWs();
        this.workspaceAdded = true;
        this.renderTree("workspace-added");
      }),
      globalWsm.connect("workspace-removed", (_, wsIndex) => {
        // forge-ojew: re-home surviving windows off the doomed workspace BEFORE
        // removeChild splices the subtree out, otherwise they are stranded.
        this._rehomeWorkspaceWindowsBeforeRemoval(wsIndex);
        this.tree.removeWorkspace(wsIndex);
        this.tree.workspaceManager.renumberWorkspacesAfterRemoval(wsIndex);
        this.trackCurrentMonWs();
        this.workspaceRemoved = true;
        this.updateDecorationLayout();
        this.renderTree("workspace-removed");
      }),
      // forge-2s5b: reorder_workspace() renumbers workspace indices WITHOUT
      // emitting workspace-added/removed or per-window workspace-changed, so the
      // tree's index-keyed nodes (ws{n}, mo{m}ws{n}) go stale and point at the
      // wrong Meta workspaces. The reorder signal carries no permutation args, so
      // a targeted rekey would need identity tracking; instead reload the tree,
      // which rebuilds the index-keyed scaffold from live workspace indices and
      // re-homes every window by its current workspace. Reorders are rare, so the
      // reload cost is acceptable (same recovery path as the no-meta-monws case).
      globalWsm.connect("workspaces-reordered", () => {
        // forge-gw2c: a reorder permutes index<->object with no add/remove signal,
        // leaving the index-keyed signal map stale (bindWorkspaceSignals then
        // early-returns for every index, so reload alone never rebinds it). Tear the
        // map down first — object-anchored disconnect makes this reliable — then the
        // reload rebinds each workspace against its current index.
        this.tree.workspaceManager.destroy();
        this.reloadTree("workspaces-reordered");
      }),
      globalWsm.connect("active-workspace-changed", () => {
        // Bug #374 fix: Set flag to prevent focus jumping during workspace transitions
        this._workspaceChanging = true;
        this.hideWindowBorders();
        this.trackCurrentMonWs();
        this.updateDecorationLayout();
        this.renderTree("active-workspace-changed");
        // Clear previous timer to avoid races on rapid workspace switches
        this._clearTimeoutId("_workspaceChangingTimeoutId");
        // Clear flag after workspace animation completes (300ms)
        this._workspaceChangingTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
          this._workspaceChangingTimeoutId = 0;
          this._workspaceChanging = false;
          return false;
        });
      }),
    ];

    let numberOfWorkspaces = globalWsm.get_n_workspaces();

    for (let i = 0; i < numberOfWorkspaces; i++) {
      let workspace = globalWsm.get_workspace_by_index(i);
      this.bindWorkspaceSignals(workspace);
    }

    let settings = this.ext.settings;

    this._settingsSignals = [];
    this._settingsSignals.push(
      settings.connect("changed", (_, settingName) => this._onSettingsChanged(settingName))
    );

    this._overviewSignals = [
      Main.overview.connect("hiding", () => {
        this.fromOverview = true;
        const eventObj = {
          name: "focus-after-overview",
          callback: () => {
            const focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
            this.updateStackedFocus(focusNodeWindow);
            this.updateTabbedFocus(focusNodeWindow);
            this.movePointerWith(focusNodeWindow);
          },
        };
        this.queueEvent(eventObj);
      }),
      Main.overview.connect("showing", () => {
        this.toOverview = true;
      }),
    ];

    this._signalsBound = true;
  }

  /**
   * window-entered-monitor: re-home unless thrash, restore, or post-restore shield.
   */
  _onWindowEnteredMonitor(_display, monitor, metaWindow) {
    // Thrash / lock / cooldown / session restore / shield / mid-apply: forest owns placement.
    // apply→move_resize can spuriously fire entered-monitor and rehome+redistribute
    // wipes mon-level userSized shares (CON percent → 1).
    // Lock+DPMS: Meta peels after thrash pending clears; entered-monitor was poisoning
    // last-good via the following renderTree snapshot.
    if (
      this._workareasThrashPending ||
      this._lockScreenThrashGuard ||
      this._softRehomeCooldownActive() ||
      this._sessionLayoutRestoring ||
      this._suppressEnteredMonitorRehome ||
      this._sessionLayoutShieldActive()
    ) {
      return;
    }
    this.updateMetaWorkspaceMonitor("window-entered-monitor", monitor, metaWindow);
    this.trackCurrentMonWs();
  }

  /** @param {boolean} locked */
  setLockScreenThrashGuard(locked) {
    return this.softRehome.setLockScreenThrashGuard(locked);
  }

  /** @returns {boolean} */
  _softRehomeCooldownActive() {
    return this.softRehome.isPostRehomeCooldownActive();
  }

  /** @returns {boolean} */
  _sessionLayoutShieldActive() {
    return this.sessionLayoutRestore.sessionLayoutShieldActive();
  }

  /**
   * Re-apply the post-install restored forest (Meta mon + tree + last-good seed).
   * Used while the shield is active so soft-rehome cannot freeze a thrash snapshot.
   * @returns {boolean}
   */
  _reapplySessionLayoutShield(from = "session-layout-shield") {
    return this.sessionLayoutRestore.reapplySessionLayoutShield(from);
  }

  /** @param {{ monitors?: any[] }} liveForest @param {string} tag */
  _traceSessionLayoutHomes(liveForest, tag) {
    return this.sessionLayoutRestore.traceSessionLayoutHomes(liveForest, tag);
  }

  /**
   * Handle the display's "workareas-changed" signal. The monitor-count guard keeps
   * windows attached to the tree during transient monitor loss (KVM switch, lock).
   * Geometry thrash (blank/wake) is debounced into soft rehome so windows are not
   * permanently piled onto the primary when both heads return.
   */
  _onWorkareasChanged(_display) {
    if (global.display.get_n_monitors() == 0) {
      Logger.debug(`workareas-changed: no monitors, ignoring signal`);
      return;
    }
    // Consume the flags unconditionally: a workspace change on an EMPTY tree
    // must not leave them set, or the next unrelated workareas-changed (dock
    // autohide, strut change) takes the expensive re-track branch instead of
    // a plain re-render.
    const needsRetrack = this.workspaceAdded || this.workspaceRemoved;
    this.workspaceAdded = false;
    this.workspaceRemoved = false;
    if (this.tree.getNodeByType("WINDOW").length > 0) {
      if (needsRetrack) {
        this.trackCurrentWindows();
      } else {
        this._queueSoftRehomeOnWorkareas();
      }
    }
  }

  /** Debounce workareas thrash, then soft-rehome once geometries settle. */
  _queueSoftRehomeOnWorkareas() {
    return this.softRehome.queueSoftRehomeOnWorkareas();
  }

  /**
   * Restore windows to last-good monitors after workareas settle (H1).
   * Body lives on SoftRehomeManager; thin wrapper keeps spies/tests on WM.
   */
  _softRehomeAfterWorkareas() {
    return this.softRehome.softRehomeAfterWorkareas();
  }

  /**
   * Align soft-rehome targets for outermost STACKED/TABBED groups (majority mon).
   * @param {Map<object, number>} targets
   * @param {number} nMonitors
   */
  _alignSoftRehomeGroupTargets(targets, nMonitors) {
    return this.softRehome.alignSoftRehomeGroupTargets(targets, nMonitors);
  }

  /**
   * Pick monitor index for a window during soft rehome.
   * @param {object} wNode
   * @param {object[]} geometries
   * @param {number} nMonitors
   */
  _resolveSoftRehomeMonitor(wNode, geometries, nMonitors) {
    return this.softRehome.resolveSoftRehomeMonitor(wNode, geometries, nMonitors);
  }

  /** Record last quiet monitor + frame for each live window (used after thrash). */
  _snapshotLastGoodHomes() {
    return this.softRehome.snapshotLastGoodHomes();
  }

  /**
   * Iterate the live FLOAT windows in the tree. Centralizes the mode filter and
   * the Utils.isWindowAlive() probe (forge-h7ba) so the always-on-top pin/unpin
   * paths can't throw on a finalized Meta.Window wrapper mid-forEach and leave
   * the remaining floats mis-pinned.
   */
  _forEachFloatNode(fn) {
    this.allNodeWindows.forEach((w) => {
      if (w.mode !== WINDOW_MODES.FLOAT) return;
      const metaWindow = w.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) return;
      fn(metaWindow, w);
    });
  }

  cleanupAlwaysFloat() {
    // Always-on-top was turned off: unpin every float, dialogs included. Dialogs
    // are kept above the tiled grid by raise-on-focus, not a global pin, so a
    // dialog exception here would only strand a popup above other floats.
    this._forEachFloatNode((metaWindow) => {
      metaWindow.is_above() && metaWindow.unmake_above();
    });
  }

  restoreAlwaysFloat() {
    this._forEachFloatNode((metaWindow) => {
      !metaWindow.is_above() && metaWindow.make_above();
    });
  }

  /**
   * forge-zo4 (#460): when a window goes fullscreen, Forge-pinned always-on-top
   * floats on the SAME monitor must drop below it instead of rendering over the
   * fullscreen surface. Recomputed from scratch on every (arg-less, infrequent)
   * in-fullscreen-changed, so no persistent per-monitor count is kept — the
   * per-node `_aboveDemotedForFullscreen` flag carries the "restore me once my
   * monitor has no fullscreen window" intent. Mirrors cleanupAlwaysFloat's
   * dialog/transient exclusion and only ever touches floats Forge itself pinned.
   */
  _reconcileFullscreenFloatDemotion() {
    if (!this.tree) return;
    // Only meaningful when Forge manages float stacking.
    if (!this.ext.settings.get_boolean("float-always-on-top-enabled")) {
      this._restoreAllDemotedFloats();
      return;
    }

    const nodes = this.allNodeWindows;
    // Count qualifying fullscreen windows per monitor (dialogs/transients are
    // forced above by design and never block floats).
    const fullscreenCounts = new Map();
    nodes.forEach((w) => {
      const metaWindow = w.nodeValue;
      if (!metaWindow || !metaWindow.is_fullscreen()) return;
      if (this._isDialogLike(metaWindow)) return;
      const monIdx = this._monitorIndexOfNode(w);
      fullscreenCounts.set(monIdx, (fullscreenCounts.get(monIdx) || 0) + 1);
    });

    this._withSuppressedAboveHandler(() => {
      nodes.forEach((w) => {
        if (w.mode !== WINDOW_MODES.FLOAT) return;
        const metaWindow = w.nodeValue;
        if (!metaWindow) return;
        const blocked = (fullscreenCounts.get(this._monitorIndexOfNode(w)) || 0) > 0;

        // Demote: a Forge-pinned float on a monitor that now has a fullscreen
        // window. Never the fullscreen window itself, a dialog, or a user pin.
        if (
          blocked &&
          w._forgeSetAbove &&
          metaWindow.is_above() &&
          !metaWindow.is_fullscreen() &&
          !this._isDialogLike(metaWindow)
        ) {
          metaWindow.unmake_above();
          // unmake_above() only drops the always-on-top pin; e2e
          // (test_fullscreen_demote_float) showed the float still stacks above
          // the fullscreen window in the normal layer, so lower it explicitly.
          metaWindow.lower();
          w._aboveDemotedForFullscreen = true;
          return;
        }

        // Restore: a previously-demoted float whose monitor is now clear.
        if (!blocked && w._aboveDemotedForFullscreen) {
          if (w._forgeSetAbove && !metaWindow.is_above()) metaWindow.make_above();
          w._aboveDemotedForFullscreen = false;
        }
      });
    });
  }

  /** forge-zo4: re-pin every float Forge demoted for a fullscreen window. */
  _restoreAllDemotedFloats() {
    if (!this.tree) return;
    this._withSuppressedAboveHandler(() => {
      this.allNodeWindows.forEach((w) => {
        if (!w._aboveDemotedForFullscreen) return;
        const metaWindow = w.nodeValue;
        if (w._forgeSetAbove && metaWindow && !metaWindow.is_above()) metaWindow.make_above();
        w._aboveDemotedForFullscreen = false;
      });
    });
  }

  /**
   * forge-zo4: run `fn` while suppressing _handleUserAboveChange so Forge's own
   * make_above/unmake_above (which emit notify::above) are not mistaken for the
   * user toggling "Always on Top".
   */
  _withSuppressedAboveHandler(fn) {
    const prev = this._suppressAboveHandler;
    this._suppressAboveHandler = true;
    try {
      fn();
    } finally {
      this._suppressAboveHandler = prev;
    }
  }

  /** forge-zo4: dialogs/transients are always-above by design — never demote them. */
  _isDialogLike(metaWindow) {
    return (
      metaWindow.get_window_type() === Meta.WindowType.DIALOG ||
      metaWindow.get_window_type() === Meta.WindowType.MODAL_DIALOG ||
      metaWindow.get_transient_for() !== null
    );
  }

  trackCurrentMonWs() {
    let metaWindow = this.focusMetaWindow;
    if (!metaWindow) return;
    const currentMonitor = global.display.get_current_monitor();
    const currentWorkspace = global.display.get_workspace_manager().get_active_workspace_index();

    let currentMonWs = Utils.createMonitorWorkspaceId(currentMonitor, currentWorkspace);
    let activeMetaMonWs = Utils.createMonitorWorkspaceId(
      metaWindow.get_monitor(),
      metaWindow.get_workspace().index()
    );
    let currentWsNode = this.tree.findNode(`ws${currentWorkspace}`);

    if (!currentWsNode) {
      return;
    }

    // Search for all the valid windows on the workspace
    const monWindows = currentWsNode.getNodeByType(NODE_TYPES.WORKSPACE).flatMap((ws) => {
      return ws
        .getNodeByType(NODE_TYPES.WINDOW)
        .filter(
          (w) =>
            !w.nodeValue.minimized &&
            w.isTile() &&
            w.nodeValue !== metaWindow &&
            // The searched window should be on the same monitor workspace
            // This ensures that Forge already updated the workspace node tree:
            currentMonWs === activeMetaMonWs
        )
        .map((w) => w.nodeValue);
    });

    this.sortedWindows = global.display.sort_windows_by_stacking(monWindows).reverse();
  }

  /**
   * Bind signals to a workspace for window tracking.
   * Delegates to WorkspaceManager.
   * @param {Meta.Workspace} metaWorkspace - The workspace to bind signals to
   */
  bindWorkspaceSignals(metaWorkspace) {
    if (this.tree && this.tree.workspaceManager) {
      this.tree.workspaceManager.bindWorkspaceSignals(metaWorkspace);
    }
  }

  /**
   * Execute a command action.
   * Delegates to CommandHandler.
   * @param {Object} action - The action to execute
   */
  command(action) {
    this._commandHandler.execute(action);
  }

  /**
   * Keyboard edge resize (WindowResizeLeft|Right|Top|Bottom / CLI amount).
   *
   * Tiled: R1b owning-split — resolve one axis (L/R → H, T/B → V), adjust
   * layout-unit percent vs pair via _applyOwningSplitDelta, renderTree.
   * Positive amount grows the focused unit’s share (same math as expand; no
   * L/R sign flip). No owning split on that axis → no-op (do not thrash Meta).
   * Bypass grab machinery for the pure percent path.
   *
   * Float / non-tile: Meta move_resize_frame + debounced grab end (legacy).
   * Mouse drag still uses _handleResizing (residual; not this path).
   *
   * @param {number} grabOp - Meta.GrabOp edge (KEYBOARD_RESIZING_* or RESIZING_*)
   * @param {number} amount - pixels; positive grows focused share when tiled
   */
  resize(grabOp, amount) {
    let metaWindow = this.focusMetaWindow;
    if (!metaWindow) return;

    // R1b: tiled → owning-split on the edge axis only (not dual like expand).
    // S2: elevated CON is the resize seed; else layoutUnit(focus) via resolver.
    const focusNodeWindow = this.findNodeWindow(metaWindow);
    if (focusNodeWindow && focusNodeWindow.isTile()) {
      if (!amount) return;
      const axis = Utils.orientationFromGrab(grabOp);
      if (axis !== ORIENTATION_TYPES.HORIZONTAL && axis !== ORIENTATION_TYPES.VERTICAL) {
        return;
      }
      const accessors = {
        getTiledChildren: (items) => this.tree.getTiledChildren(items),
      };
      const resizeSeed =
        resolveResizeOpsSeed(this.tree.attachNode, focusNodeWindow) || focusNodeWindow;
      const res = resolveOwningSplit(resizeSeed, axis, accessors);
      if (!res) return;
      if (this._applyOwningSplitDelta(res, amount)) {
        this.renderTree("window-resize");
      }
      return;
    }

    // Float / non-tile: Meta rect + grab debounce.
    let display = global.display;

    // forge-h6z9: the debounced grab-end is a single instance-wide timer. If a
    // pending end belongs to a DIFFERENT window than the one now focused (focus
    // drifted between two keyboard resizes), flush that window's grab first so
    // its node isn't left with grabMode/initRect stranded forever. The end-fire
    // path reads this.focusMetaWindow, so clean the prior node directly here.
    if (this._manualResizeEndId && this._manualResizeEndWindow !== metaWindow) {
      this._clearTimeoutId("_manualResizeEndId");
      const priorNode = this.findNodeWindow(this._manualResizeEndWindow);
      if (priorNode) {
        this.unfreezeRender();
        this._grabCleanup(priorNode);
      }
      this._manualResizeEndWindow = null;
    }

    this._handleGrabOpBegin(display, metaWindow, grabOp);

    let rect = metaWindow.get_frame_rect();
    let direction = Utils.directionFromGrab(grabOp);

    switch (direction) {
      case Meta.MotionDirection.RIGHT:
        rect.width = rect.width + amount;
        break;
      case Meta.MotionDirection.LEFT:
        rect.width = rect.width + amount;
        rect.x = rect.x - amount;
        break;
      case Meta.MotionDirection.UP:
        // forge-74em: N/UP grows the TOP edge, so shift y up (mirror of LEFT).
        rect.height = rect.height + amount;
        rect.y = rect.y - amount;
        break;
      case Meta.MotionDirection.DOWN:
        // S/DOWN grows the BOTTOM edge, so y stays put (mirror of RIGHT).
        rect.height = rect.height + amount;
        break;
    }
    this.move(metaWindow, rect, null, { skipOffscreenClamp: true });

    // Bug #532 (forge-5v6): on key auto-repeat each press calls resize() again.
    // Restart a single debounced grab-end instead of queueing one per press, so
    // the grab (and its frozen initRect) stays open for the whole hold and the
    // resize accumulates smoothly; the layout settles once the key is released.
    if (this._manualResizeEndId) {
      GLib.source_remove(this._manualResizeEndId);
    }
    // forge-h6z9: remember which window the pending end belongs to so a later
    // cross-window resize can flush it (above), and a real pointer grab
    // beginning within the debounce can cancel it (see _handleGrabOpBegin).
    this._manualResizeEndWindow = metaWindow;
    this._manualResizeEndId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
      this._manualResizeEndId = 0;
      this._manualResizeEndWindow = null;
      this._handleGrabOpEnd(display, metaWindow, grabOp);
      return false;
    });
  }

  /**
   * forge-gm0z / R1: grow (or, with a negative amount, shrink) the focused tiled
   * window on BOTH axes via dual owning-split applications (REG-expand-dual-axis).
   *
   * For each axis (horizontal, then vertical), resolve the lowest H/V ancestor
   * of the layout unit that has a tiled pair on that axis, then adjust target
   * percent vs pair. Grab machinery is bypassed; tree re-renders when any axis
   * changed. Layout unit is the tab/stack bag when focus is inside one.
   *
   * @param {number} amount - pixels to grow each owning edge by (negative shrinks).
   */
  expand(amount) {
    if (!amount) return;
    let focusNodeWindow = this.findNodeWindow(this.focusMetaWindow);
    if (!focusNodeWindow || !focusNodeWindow.isTile()) return;

    const accessors = {
      getTiledChildren: (items) => this.tree.getTiledChildren(items),
    };
    // S2: elevated CON preferred; else layoutUnit bag via resolveOwningSplit.
    const resizeSeed =
      resolveResizeOpsSeed(this.tree.attachNode, focusNodeWindow) || focusNodeWindow;
    // REG-expand-dual-axis: two independent owning-split steps (H then V).
    const splits = resolveOwningSplitsBothAxes(resizeSeed, accessors);
    let changed = false;
    for (const res of splits) {
      changed = this._applyOwningSplitDelta(res, amount) || changed;
    }

    if (changed) this.renderTree("window-expand");
  }

  /** forge-gm0z: WindowShrink is WindowExpand with a negative amount. */
  shrink(amount) {
    this.expand(-amount);
  }

  /**
   * Apply a pixel delta to a resolveOwningSplit result (target vs pair percents).
   * Shared math with _expandNodeAgainstPair so expand and legacy call sites match.
   *
   * @param {{ target: object, pair: object, parent: object, axis: string }} res
   * @param {number} deltaPx
   * @returns {boolean}
   */
  _applyOwningSplitDelta(res, deltaPx) {
    if (!res?.target || !res?.pair || !res?.parent) return false;
    const parent = res.parent;
    if (parent.isStackedOrTabbed?.()) return false;

    const orientation = res.axis || Utils.orientationFromLayout(parent.layout);
    const parentRect = parent.rect;
    if (!parentRect) return false;
    const parentSize =
      orientation === ORIENTATION_TYPES.HORIZONTAL ? parentRect.width : parentRect.height;
    if (!parentSize || parentSize <= 0) return false;

    const { target, pair } = res;
    const delta = deltaPx / parentSize;
    target.percent = this._effectivePercent(target, orientation, parentSize) + delta;
    pair.percent = this._effectivePercent(pair, orientation, parentSize) - delta;
    target.userSized = true;
    pair.userSized = true;
    this._normalizeSiblingPercents(parent);
    return true;
  }

  /**
   * Grow `node` by `deltaPx` against its immediate split pair (parent must be
   * H/V with a tiled sibling). Used by tests and call sites that already know
   * the node; expand() prefers resolveOwningSplit + _applyOwningSplitDelta.
   * Returns true when a percent was changed.
   */
  _expandNodeAgainstPair(node, deltaPx) {
    const parent = node.parentNode;
    if (!parent || parent.isStackedOrTabbed()) return false;

    const tiled = this.tree.getTiledChildren(parent.childNodes);
    if (tiled.length <= 1) return false;

    const orientation = Utils.orientationFromLayout(parent.layout);
    if (
      orientation !== ORIENTATION_TYPES.HORIZONTAL &&
      orientation !== ORIENTATION_TYPES.VERTICAL
    ) {
      return false;
    }

    const index = tiled.indexOf(node);
    if (index < 0) return false;
    const pair = index + 1 < tiled.length ? tiled[index + 1] : tiled[index - 1];
    if (!pair) return false;

    return this._applyOwningSplitDelta({ target: node, pair, parent, axis: orientation }, deltaPx);
  }

  /**
   * forge-gm0z: a node's share of its parent split. Prefer the stored percent;
   * fall back to its current rect proportion (as _normalizeSiblingPercents does)
   * so expand works even before any manual resize has set an explicit percent.
   */
  _effectivePercent(node, orientation, parentSize) {
    if (node.percent && node.percent > 0) return node.percent;
    if (node.rect && parentSize > 0) {
      const size =
        orientation === ORIENTATION_TYPES.HORIZONTAL ? node.rect.width : node.rect.height;
      return size / parentSize;
    }
    return 0;
  }

  /**
   * forge-zlg: resize the focused tiled window to the golden-ratio share of its
   * split, on demand. Unlike expand()/shrink() (a pixel delta applied on both
   * axes), this sets an ABSOLUTE ratio on a SINGLE axis — golden ratio is a
   * statement about one split, and a two-axis pass would compound to ~0.382 in
   * nested layouts. No-op (no render) when there is no focused tiled window.
   */
  applyGoldenRatio() {
    let focusNodeWindow = this.findNodeWindow(this.focusMetaWindow);
    if (!focusNodeWindow || !focusNodeWindow.isTile()) return;
    if (this._goldenRatioAgainstPair(focusNodeWindow)) {
      this.renderTree("window-golden-ratio");
    }
  }

  /**
   * forge-zlg: give `node` the golden share of the space it shares with its split
   * pair, debiting the pair — mirroring _expandNodeAgainstPair() (same guards and
   * pair-selection) but absolute instead of incremental. The pair is the next
   * tiled sibling, or the previous one when `node` is last, so the FOCUSED window
   * takes the larger (φ) share regardless of its position. Operating on the
   * pair's combined share (not the whole parent) leaves any other siblings in a
   * 3+ window split untouched. Returns true when a percent was changed.
   */
  _goldenRatioAgainstPair(node) {
    const parent = node.parentNode;
    if (!parent || parent.isStackedOrTabbed()) return false;

    const tiled = this.tree.getTiledChildren(parent.childNodes);
    if (tiled.length <= 1) return false;

    const orientation = Utils.orientationFromLayout(parent.layout);
    const parentRect = parent.rect;
    if (!parentRect) return false;
    const parentSize =
      orientation === ORIENTATION_TYPES.HORIZONTAL ? parentRect.width : parentRect.height;
    if (!parentSize || parentSize <= 0) return false;

    const index = tiled.indexOf(node);
    if (index < 0) return false;
    const pair = index + 1 < tiled.length ? tiled[index + 1] : tiled[index - 1];
    if (!pair) return false;

    const combined =
      this._effectivePercent(node, orientation, parentSize) +
      this._effectivePercent(pair, orientation, parentSize);
    node.percent = combined * GOLDEN;
    pair.percent = combined * (1 - GOLDEN);
    node.userSized = true;
    pair.userSized = true;
    this._normalizeSiblingPercents(parent);
    return true;
  }

  disable() {
    Utils._disableDecorations();
    this.layoutDebugOverlay?.destroyAll();
    this._removeSignals();
    // Persist topology for install/update reload (Meta.Window refs die with us).
    this._saveSessionLayoutForReload({ immediate: true });
    // forge-zo4: re-pin any floats demoted for a fullscreen window before the
    // tree is dropped, so they aren't stranded below after Forge is disabled.
    // Done after _removeSignals so the make_above notify::above can't re-render.
    this._restoreAllDemotedFloats();
    // Release any preview hint left over from an in-progress drag before dropping the tree.
    this.allNodeWindows.forEach((node) => this._grabCleanup(node));
    this._draggedNodeWindow = null;
    // forge-ph7f: cancel any pending per-window Wayland stacking pin and unpin
    // transiently-pinned windows so none is stranded "Always on Top" after the
    // tree is dropped (skips genuine user/float pins).
    this.allNodeWindows.forEach((node) => {
      const mw = node.nodeValue;
      if (!mw) return;
      if (mw._forgeStackTimeoutId) {
        GLib.Source.remove(mw._forgeStackTimeoutId);
        mw._forgeStackTimeoutId = 0;
      }
      if (mw._forgeTransientAbove) {
        try {
          if (Utils.isWindowAlive(mw) && mw.is_above() && !node._forgeSetAbove) {
            this._withSuppressedAboveHandler(() => mw.unmake_above());
          }
        } catch (e) {
          // Window may have been destroyed
        }
        mw._forgeTransientAbove = false;
      }
    });
    // forge-h6jc: remove the tree's scaffold bins from window_group before
    // dropping the tree, otherwise the root/workspace/monitor St.Bins leak.
    this._tree?.destroy();
    this._tree = null;
    // Drop shared dock-hook pointer so a disabled WM cannot note launches.
    try {
      if (Shell.App?.prototype?._forgeDockWm === this) {
        Shell.App.prototype._forgeDockWm = null;
      }
    } catch (_e) {
      // Shell.App unavailable
    }
    this.disabled = true;
    Logger.debug(`extension:disable`);
  }

  enable() {
    this._bindSignals();
    this._tryInstallDockLaunchHook();
    this._refreshMonitorIdentityMap();
    this._bindLayoutMonitorsChanged();
    this._holdSessionLayoutSave(12_000_000);
    this.reloadTree("enable");
    Logger.debug(`extension:enable`);
  }

  /**
   * Current stableKey ↔ monitor index map (T7). May be null before first refresh.
   * @returns {import('./monitor-identity.js').LiveMap|null}
   */
  getMonitorLiveMap() {
    return this._monitorLiveMap;
  }

  /**
   * Rebuild monitor identity map from live Mutter/Shell fields.
   * Keeps previous fingerprints for remapIndex across thrash.
   */
  _refreshMonitorIdentityMap() {
    let layoutMonitors = null;
    try {
      layoutMonitors = Main.layoutManager?.monitors ?? null;
    } catch (_e) {
      layoutMonitors = null;
    }
    const infos = this.tree?.monitorManager?.collectLiveMonitorsInfo?.(layoutMonitors) ?? [];
    if (this._monitorLiveMap?.fingerprints?.length) {
      this._monitorLiveMapPrevFingerprints = this._monitorLiveMap.fingerprints;
    }
    this._monitorLiveMap = MonitorIdentity.buildLiveMap(infos);
  }

  /** layoutManager::monitors-changed → cheap identity map refresh. */
  _bindLayoutMonitorsChanged() {
    if (this._layoutMonitorsChangedId) return;
    try {
      if (!Main.layoutManager?.connect) return;
      this._layoutMonitorsChangedId = Main.layoutManager.connect("monitors-changed", () => {
        this._refreshMonitorIdentityMap();
      });
    } catch (_e) {
      this._layoutMonitorsChangedId = 0;
    }
  }

  _unbindLayoutMonitorsChanged() {
    if (!this._layoutMonitorsChangedId) return;
    try {
      Main.layoutManager?.disconnect?.(this._layoutMonitorsChangedId);
    } catch (_e) {
      /* ignore */
    }
    this._layoutMonitorsChangedId = 0;
  }

  findNodeWindow(metaWindow) {
    return this.tree.findNode(metaWindow);
  }

  get focusMetaWindow() {
    return global.display.get_focus_window();
  }

  /**
   * Monitor for dock sticky / float-follow: focused Meta window's monitor when
   * valid, else pointer current monitor. Wayland often diverges pointer vs focus.
   * @returns {number}
   */
  resolveFocusMonitor() {
    try {
      const focus = this.focusMetaWindow;
      if (focus && typeof focus.get_monitor === "function") {
        const m = focus.get_monitor();
        if (typeof m === "number" && m >= 0) return m;
      }
    } catch (_e) {
      /* destroyed / unmapped focus */
    }
    try {
      return global.display.get_current_monitor();
    } catch (_e) {
      return 0;
    }
  }

  /**
   * Small allowlist of float dropdowns that should follow the focus monitor
   * (Guake F12). Case-insensitive equals or contains. Not LFT — floats only.
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _isFloatFollowWindow(metaWindow) {
    if (!metaWindow || typeof metaWindow.get_wm_class !== "function") return false;
    let cls;
    try {
      cls = metaWindow.get_wm_class();
    } catch (_e) {
      return false;
    }
    if (!cls || typeof cls !== "string") return false;
    const lower = cls.toLowerCase();
    return lower === "guake" || lower.includes("guake");
  }

  /**
   * Move float-follow windows (Guake) onto the focus monitor. Does not touch LFT.
   * @param {Meta.Window} metaWindow
   * @returns {boolean} true if allowlisted and move attempted
   */
  _applyFloatFollowMonitor(metaWindow) {
    if (!this._isFloatFollowWindow(metaWindow)) return false;
    const mon = this.resolveFocusMonitor();
    if (typeof mon !== "number" || mon < 0) return false;
    safeMoveToMonitor(metaWindow, mon, "float-follow move_to_monitor");
    return true;
  }

  get tree() {
    if (!this._tree) {
      this._tree = new Tree(this);
    }
    return this._tree;
  }

  get kbd() {
    // forge-3jx9: resolve live. The extension constructs WindowManager before
    // Keybindings, so snapshotting this.ext.keybindings in the constructor froze
    // an undefined value forever, making allowDragDropTile() throw on every drag.
    return this.ext.keybindings;
  }

  get windowsActiveWorkspace() {
    let wsManager = global.workspace_manager;
    return global.display.get_tab_list(Meta.TabList.NORMAL_ALL, wsManager.get_active_workspace());
  }

  get windowsAllWorkspaces() {
    let wsManager = global.workspace_manager;
    let windowsAll = [];

    for (let i = 0; i < wsManager.get_n_workspaces(); i++) {
      windowsAll.push(
        ...global.display.get_tab_list(Meta.TabList.NORMAL_ALL, wsManager.get_workspace_by_index(i))
      );
    }
    windowsAll.sort((w1, w2) => {
      return w1.get_stable_sequence() - w2.get_stable_sequence();
    });
    return windowsAll;
  }

  getWindowsOnWorkspace(workspaceIndex) {
    const workspaceNode = this.tree.findNode(`ws${workspaceIndex}`);
    const workspaceWindows = workspaceNode.getNodeByType(NODE_TYPES.WINDOW);
    return workspaceWindows;
  }

  _handleLayoutModeToggle(settingName, layoutType) {
    let settings = this.ext.settings;
    if (!settings.get_boolean(settingName)) {
      let nodes = this.tree.getNodeByLayout(layoutType);
      nodes.forEach((node) => {
        node.prevLayout = node.layout;
        // STACKED→TABBED preserves the group; TABBED (and others) ungroup to split.
        if (layoutType === LAYOUT_TYPES.STACKED) {
          node.layout = LAYOUT_TYPES.TABBED;
        } else {
          node.layout = this.determineSplitLayout();
        }
      });
    } else {
      // Re-enable STACKED: restore containers we converted to TABBED on disable.
      if (layoutType === LAYOUT_TYPES.STACKED) {
        this.tree.getNodeByLayout(LAYOUT_TYPES.TABBED).forEach((node) => {
          if (node.prevLayout === LAYOUT_TYPES.STACKED) {
            node.layout = LAYOUT_TYPES.STACKED;
          }
        });
      }
      let splitNodes = this.tree.getNodeByLayout(LAYOUT_TYPES.HSPLIT);
      splitNodes.push(...this.tree.getNodeByLayout(LAYOUT_TYPES.VSPLIT));
      splitNodes.forEach((node) => {
        if (node.prevLayout && node.prevLayout === layoutType) {
          node.layout = layoutType;
        }
      });
    }
    this.renderTree(settingName);
  }

  determineSplitLayout() {
    // if the monitor width is less than height, the monitor could be vertical orientation;
    let monitorRect = global.display.get_monitor_geometry(global.display.get_current_monitor());
    if (monitorRect.width < monitorRect.height) {
      return LAYOUT_TYPES.VSPLIT;
    }
    return LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Bug #311 fix: Determine split layout based on a given rect's dimensions
   * For nested splits, use the container's available space instead of monitor dimensions.
   * @param {Object} rect - Rectangle with width and height properties
   * @returns {string} LAYOUT_TYPES.VSPLIT or LAYOUT_TYPES.HSPLIT
   */
  determineSplitLayoutForRect(rect) {
    if (!rect) return this.determineSplitLayout();
    if (rect.width < rect.height) {
      return LAYOUT_TYPES.VSPLIT;
    }
    return LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Apply default layout to a container after creation
   * Called after tree.split() to set tabbed/stacked if configured
   */
  applyDefaultLayoutToContainer(container) {
    if (!container) return;
    const defaultLayout = this.ext.settings.get_string("default-window-layout");
    if (defaultLayout === "tabbed" && this.ext.settings.get_boolean("tabbed-tiling-mode-enabled")) {
      container.layout = LAYOUT_TYPES.TABBED;
    } else if (
      defaultLayout === "stacked" &&
      this.ext.settings.get_boolean("stacked-tiling-mode-enabled")
    ) {
      container.layout = LAYOUT_TYPES.STACKED;
    }
  }

  floatWorkspace(workspaceIndex) {
    const workspaceWindows = this.getWindowsOnWorkspace(workspaceIndex);
    if (!workspaceWindows) return;
    workspaceWindows.forEach((w) => {
      w.float = true;
    });
  }

  unfloatWorkspace(workspaceIndex) {
    const workspaceWindows = this.getWindowsOnWorkspace(workspaceIndex);
    if (!workspaceWindows) return;
    workspaceWindows.forEach((w) => {
      w.tile = true;
    });
  }

  hideActorBorder(...a) {
    return this.decorationManager.hideActorBorder(...a);
  }

  hideWindowBorders(...a) {
    return this.decorationManager.hideWindowBorders(...a);
  }

  // Window movement API
  // Bug #224 fix: Align dimension to buffer scale (for Wayland HiDPI)
  _alignToBufferScale(value, scale = 2) {
    return Math.round(value / scale) * scale;
  }

  // Bug #1: getWorkAreaSafe() returns the window's CURRENT monitor's work area,
  // so clamping a cross-monitor destination rect against it snaps the window back
  // onto the source monitor. Resolve the work area from the TARGET rect's monitor
  // instead. Falls back to the current-monitor work area when the per-rect APIs
  // are unavailable (keeps single-monitor behavior unchanged).
  _resolveTargetWorkArea(metaWindow, rect, workArea) {
    if (workArea) return workArea;
    try {
      const monitorIdx = this._monitorIndexForRect(rect);
      if (monitorIdx >= 0) {
        const ws = global.workspace_manager?.get_active_workspace?.();
        const wa = ws?.get_work_area_for_monitor?.(monitorIdx);
        if (wa) return wa;
      }
    } catch (e) {
      // fall through to the current-monitor work area
    }
    return Utils.getWorkAreaSafe(metaWindow);
  }

  /**
   * Monitor that owns most of `rect` (center sample). -1 if unknown.
   * @param {{ x: number, y: number, width: number, height: number }|null|undefined} rect
   * @returns {number}
   */
  _monitorIndexForRect(rect) {
    if (!rect) return -1;
    try {
      const idx = global.display?.get_monitor_index_for_rect?.(rect);
      if (typeof idx === "number" && idx >= 0) return idx;
    } catch (_e) {
      /* fall through */
    }
    // Geometry fallback when Mutter API missing / returns -1
    try {
      const n = global.display?.get_n_monitors?.() ?? 0;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      for (let i = 0; i < n; i++) {
        const g = global.display.get_monitor_geometry(i);
        if (!g) continue;
        if (cx >= g.x && cx < g.x + g.width && cy >= g.y && cy < g.y + g.height) {
          return i;
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return -1;
  }

  move(metaWindow, rect, workArea = null, { skipOffscreenClamp = false } = {}) {
    if (!metaWindow) return;
    if (metaWindow.grabbed) return;
    // Dead/finalized wrappers: later Meta calls SEGV; try/catch is not enough.
    if (!Utils.isWindowAlive(metaWindow)) return;

    // Suppress size/position → renderTree feedback while we commit geometry.
    // Nested apply already sets this; restore only if we raised it here.
    const prevGeomSuppress = this._suppressGeometrySignalRetile;
    this._suppressGeometrySignalRetile = true;
    try {
      this._moveImpl(metaWindow, rect, workArea, { skipOffscreenClamp });
    } finally {
      this._suppressGeometrySignalRetile = prevGeomSuppress;
    }
  }

  /** Geometry commit body for move(); callers use move() for suppress wrap. */
  _moveImpl(metaWindow, rect, workArea = null, { skipOffscreenClamp = false } = {}) {
    let x = rect.x;
    let y = rect.y;
    let width = rect.width;
    let height = rect.height;

    // Tree reparent alone leaves Meta on the old mon (YouTube stuck mon0 while
    // tree slot is mon1). Align Mutter before clamp/resize so work-area and
    // move_resize_frame target the destination head. safeMoveToMonitor no-ops
    // when mon is -1 / unmapped (Wayland close race) so apply cannot kill Shell.
    const destMon = this._monitorIndexForRect(rect);
    if (destMon >= 0) {
      safeMoveToMonitor(metaWindow, destMon, "move target mon");
    }

    // Keep a window that can't shrink to its slot within the work area, so its
    // controls (close button) stay reachable instead of spilling off the edge.
    const hints = metaWindow.get_size_hints?.();
    const minW = hints?.min_width ?? width;
    const minH = hints?.min_height ?? height;
    if (minW > width || minH > height) {
      const wa = this._resolveTargetWorkArea(metaWindow, rect, workArea);
      if (wa) {
        if (minW > width) x = Math.max(wa.x, Math.min(x, wa.x + wa.width - minW));
        if (minH > height) y = Math.max(wa.y, Math.min(y, wa.y + wa.height - minH));
      }
    }

    // Bug #224 fix: Align dimensions to buffer scale on Wayland
    if (Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
      const scale = Utils.dpi(); // Get display scale factor
      if (scale > 1) {
        x = this._alignToBufferScale(x, scale);
        y = this._alignToBufferScale(y, scale);
        width = this._alignToBufferScale(width, scale);
        height = this._alignToBufferScale(height, scale);
      }
    }

    // forge-aydd: keep the committed frame within the work area. Paths that bypass
    // computeSizes (keyboard resize() of a float, rectForMonitor() onto a smaller
    // monitor, a stale float rect) can hand move() a rect whose right/bottom runs
    // off-screen. Position-only — never shrink — so this generalizes the Bug #117
    // min-size clamp above rather than fighting it: Mutter commits max(width, minW),
    // so clamp by that effective size. A window larger than the whole work area pins
    // to the top-left (controls reachable). Runs after buffer-scale alignment (so it
    // can't be nudged back out) and before the frame-match early-return (so the early
    // return sees the clamped position).
    // A resize must change size only, never reposition (Bug #6), so it passes
    // skipOffscreenClamp to let the dragged edge grow off-screen instead of
    // shifting the whole window up/left.
    if (!skipOffscreenClamp) {
      const wa = this._resolveTargetWorkArea(metaWindow, rect, workArea);
      if (wa) {
        const ew = Math.max(width, minW);
        const eh = Math.max(height, minH);
        if (x + ew > wa.x + wa.width) x = Math.max(wa.x, wa.x + wa.width - ew);
        if (y + eh > wa.y + wa.height) y = Math.max(wa.y, wa.y + wa.height - eh);
      }
    }

    // forge-wsc (#351) / forge-05l (#454): skip no-op re-assert. Exact pixel
    // match was too strict — Wayland Chrome/YouTube often land 1–4px off the
    // tree slot, so every apply called move_resize_frame and reflowed the page.
    // Epsilon keeps real moves; maximized axes never skip (unmaximize path).
    const frame = metaWindow.get_frame_rect();
    const targetW = Math.max(width, minW);
    const targetH = Math.max(height, minH);
    const eps = 4;
    if (
      Compat.getMaximizeFlags(metaWindow) === 0 &&
      Math.abs(frame.x - x) <= eps &&
      Math.abs(frame.y - y) <= eps &&
      Math.abs(frame.width - targetW) <= eps &&
      Math.abs(frame.height - targetH) <= eps &&
      (destMon < 0 || metaWindow.get_monitor?.() === destMon)
    ) {
      return;
    }

    Compat.unmaximize(metaWindow);

    let windowActor = metaWindow.get_compositor_private();
    if (!windowActor) return;
    // Bug #530: keep the map/open effect (GNOME Shell's or an animation
    // extension's like Burn My Windows) on a new window's first placement.
    // Forge never adds actor transitions itself, so stripping is only needed
    // on later re-renders to cancel in-flight shell effects.
    if (metaWindow.firstRender) {
      metaWindow.firstRender = false;
    } else {
      windowActor.remove_all_transitions();
    }

    metaWindow.move_frame(true, x, y);
    metaWindow.move_resize_frame(true, x, y, width, height);
  }

  moveCenter(metaWindow) {
    if (!metaWindow) return;
    let frameRect = metaWindow.get_frame_rect();
    const rectRequest = {
      x: "center",
      y: "center",
      width: frameRect.width,
      height: frameRect.height,
    };

    this.move(metaWindow, Utils.resolveRect(rectRequest, metaWindow));
  }

  rectForMonitor(node, targetMonitor) {
    if (!node || (node && node.nodeType !== NODE_TYPES.WINDOW)) return null;
    if (targetMonitor < 0) return null;
    let currentWorkArea = Utils.getWorkAreaSafe(node.nodeValue);
    let nextWorkArea = node.nodeValue.get_work_area_for_monitor(targetMonitor);

    if (currentWorkArea && nextWorkArea) {
      let rect = node.rect;
      if (!rect && node.mode === WINDOW_MODES.FLOAT) {
        rect = node.nodeValue.get_frame_rect();
      }
      let hRatio = 1;
      let wRatio = 1;

      hRatio = nextWorkArea.height / currentWorkArea.height;
      wRatio = nextWorkArea.width / currentWorkArea.width;
      rect.height *= hRatio;
      rect.width *= wRatio;

      // forge-cm69: rect.{x,y} are ABSOLUTE stage coordinates, so the remap must
      // offset relative to the source work area before scaling and re-add the
      // destination origin. Using absolute coords directly placed the window
      // off-screen whenever the source monitor was not at the origin (3+ monitor
      // rows). One affine helper keeps both axes consistent (DRY).
      const remapAxis = (coord, curOrigin, curSize, nextOrigin, nextSize) =>
        ((coord - curOrigin) / curSize) * nextSize + nextOrigin;

      rect.y = remapAxis(
        rect.y,
        currentWorkArea.y,
        currentWorkArea.height,
        nextWorkArea.y,
        nextWorkArea.height
      );
      rect.x = remapAxis(
        rect.x,
        currentWorkArea.x,
        currentWorkArea.width,
        nextWorkArea.x,
        nextWorkArea.width
      );
      return rect;
    }
    return null;
  }

  _clearTimeoutId(propertyName) {
    if (this[propertyName]) {
      GLib.Source.remove(this[propertyName]);
      this[propertyName] = 0;
    }
  }

  _removeSignals() {
    if (!this._signalsBound) return;

    this._unbindLayoutMonitorsChanged();

    disconnectSignals(this.ext.settings, this._settingsSignals);
    this._settingsSignals = undefined;

    disconnectSignals(global.display, this._displaySignals);
    this._displaySignals = undefined;

    disconnectSignals(global.window_manager, this._windowManagerSignals);
    this._windowManagerSignals = undefined;

    const globalWsm = global.workspace_manager;

    disconnectSignals(globalWsm, this._workspaceManagerSignals);
    this._workspaceManagerSignals = undefined;

    // Clean up workspace signals via WorkspaceManager
    if (this.tree?.workspaceManager) {
      this.tree.workspaceManager.destroy();
    }

    // forge-lvhp: windowsAllWorkspaces (get_tab_list NORMAL_ALL) excludes
    // DIALOG/MODAL_DIALOG, but trackWindow connects windowSignals/actorSignals to
    // those window types too — so a still-open tracked dialog would keep live
    // handlers bound to this disabled manager. Union the tab list with the tree's
    // WINDOW nodes (which include dialogs) so every tracked window is
    // disconnected. The tree is still live here (nulled later in disable());
    // de-dup by metaWindow identity.
    const allWindows = new Set(this.windowsAllWorkspaces || []);
    for (const wNode of this._tree ? this._tree.getNodeByType(NODE_TYPES.WINDOW) : []) {
      if (wNode.nodeValue) allWindows.add(wNode.nodeValue);
    }

    for (const metaWindow of allWindows) {
      disconnectSignals(metaWindow, metaWindow.windowSignals);
      metaWindow.windowSignals = undefined;

      let windowActor = metaWindow.get_compositor_private();
      if (windowActor) {
        disconnectSignals(windowActor, windowActor.actorSignals);
        windowActor.actorSignals = undefined;
      }

      if (windowActor) {
        this.decorationManager._destroyActorBorder(windowActor, "border");
        this.decorationManager._destroyActorBorder(windowActor, "splitBorder");
      }
    }

    this.decorationManager?.destroyAllBorders?.();

    this._clearTimeoutId("_renderTreeSrcId");
    this._clearTimeoutId("_reloadTreeSrcId");
    this._clearTimeoutId("_wsWindowAddSrcId");
    this._wsWindowAddQueue = null; // forge-wqlx: drain the pending re-home queue
    this._clearTimeoutId("_windowHomeReconcileSrcId");
    this._clearTimeoutId("_queueSourceId");
    this._clearTimeoutId("_manualResizeEndId");
    this._clearTimeoutId("_pointerFocusTimeoutId");
    this._clearTimeoutId("_workspaceChangingTimeoutId");
    this._clearTimeoutId("_workareasSettleSrcId");
    this._clearTimeoutId("_softRehomeCooldownSrcId");
    this._clearTimeoutId("_sessionLayoutSaveSrcId");
    this._workareasThrashPending = false;
    this._lockScreenThrashGuard = false;
    this._softRehomeCooldownUntilUs = 0;
    this._softRehomeCooldownSrcId = 0;
    this._workareasSettleFingerprint = "";

    disconnectSignals(Main.overview, this._overviewSignals);
    this._overviewSignals = null;

    this._signalsBound = false;
  }

  renderTree(from, force = false) {
    let wasFrozen = this._freezeRender;
    if (force && wasFrozen) this.unfreezeRender();
    if (this._freezeRender || !this.ext.settings.get_boolean("tiling-mode-enabled")) {
      this.updateDecorationLayout();
      this.updateBorderLayout();
      this.layoutDebugOverlay?.update();
    } else {
      if (!this._renderTreeSrcId) {
        this._renderTreeSrcId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          try {
            // forge-4b6: must run before anything walks the tree — one dead
            // wrapper would throw out of this callback and abort the render.
            this.tree.pruneDeadWindows();
            this.processFloats();
            // forge-zo4: processFloats re-pins always-on-top floats via `set float`,
            // so the fullscreen demotion must run AFTER it to win, on every render.
            this._reconcileFullscreenFloatDemotion();
            this.tree.render(from);
            this.handleMaximizeOnSingle();
            this.updateDecorationLayout();
            this.updateBorderLayout();
            this.layoutDebugOverlay?.update();
            // Quiet render: remember per-window monitor + frame for blank/wake rehome.
            this._snapshotLastGoodHomes();
            // Keep last-good topology on disk (install/HUP often skips clean disable).
            this._queueSessionLayoutSave();
          } finally {
            // Bug #531: a throw above must not leave the id set, or every
            // future renderTree() no-ops and new windows stay floating.
            this._renderTreeSrcId = 0;
            if (wasFrozen) this.freezeRender();
          }
          return false;
        });
      }
    }
  }

  processFloats() {
    this.allNodeWindows.forEach((nodeWindow) => {
      let metaWindow = nodeWindow.nodeValue;
      // forge-te9o: never touch a node mid-drag. The float setter writes mode =
      // TILE, which would clobber GRAB_TILE and silently kill the in-flight drag.
      // Mirrors getTiledChildren's GRAB_TILE exclusion.
      if (nodeWindow.isGrabTile()) return;
      // Feature #295: Also check if monitor should be tiled
      if (
        this.isFloatingExempt(metaWindow) ||
        !this.isActiveWindowWorkspaceTiled(metaWindow) ||
        !this.isActiveWindowMonitorTiled(metaWindow)
      ) {
        nodeWindow.float = true;
        this.lftMru?.remove(nodeWindow);
        this._repositionOccludedDialog(metaWindow);
      } else {
        const wasFloat = nodeWindow.mode === WINDOW_MODES.FLOAT;
        nodeWindow.float = false;
        // Late FLOAT→TILE (empty title/class at map) never got insertChildPercent.
        if (wasFloat) this.ensureTileShare(nodeWindow);
        // New map tiles / unfloat: if focused, become LFT for the next open.
        if (wasFloat && this.focusMetaWindow === metaWindow) {
          this._lftTouchIfTile(nodeWindow);
        }
      }
    });
  }

  /** Carve a sibling share if a new tile would sit at percent 0 beside positive percents. */
  ensureTileShare(nodeWindow) {
    if (!nodeWindow?.parentNode) return;
    if (nodeWindow.percent && nodeWindow.percent > 0) return;
    const siblings = this.tree.getTiledChildren(nodeWindow.parentNode.childNodes);
    const others = siblings.filter((n) => n !== nodeWindow);
    if (others.length === 0) return;
    if (!others.some((n) => n.percent && n.percent > 0)) return;
    this.tree.insertChildPercent(nodeWindow.parentNode, nodeWindow);
  }

  /**
   * forge-2ew: A transient dialog can inherit Mutter placement that lands it
   * behind a tiled neighbor of its parent. When a dialog overlaps a tiled window
   * other than its own parent, recenter it over its parent (clamped to the work
   * area) so it is not occluded. Non-transient floats are left where the user
   * put them.
   */
  _repositionOccludedDialog(metaWindow) {
    const parent = metaWindow.get_transient_for && metaWindow.get_transient_for();
    if (!parent) return;

    const dialogRect = metaWindow.get_frame_rect();
    const occluded = this.allNodeWindows.some((n) => {
      const w = n.nodeValue;
      return n.isTile() && w && w !== parent && Utils.rectsOverlap(dialogRect, w.get_frame_rect());
    });
    if (!occluded) return;

    const parentRect = parent.get_frame_rect();
    let x = parentRect.x + Math.floor((parentRect.width - dialogRect.width) / 2);
    let y = parentRect.y + Math.floor((parentRect.height - dialogRect.height) / 2);

    const wa = Utils.getWorkAreaSafe(metaWindow);
    if (wa) {
      x = Math.max(wa.x, Math.min(x, wa.x + wa.width - dialogRect.width));
      y = Math.max(wa.y, Math.min(y, wa.y + wa.height - dialogRect.height));
    }

    this.move(metaWindow, { x, y, width: dialogRect.width, height: dialogRect.height });
  }

  /**
   * forge-w7e (#469): React to a window's "Always on Top" state changing.
   *
   * "Always on Top" is GNOME's Z-axis stacking pin (make_above). isFloatingExempt
   * treats an above window as floating, so a re-render is all that's needed to
   * move a newly-pinned window out of the tree (and retile it when unpinned).
   * Forge only ever pins windows it is already floating, so this stays a no-op
   * for normal tiled windows until the user toggles always-on-top.
   */
  _handleUserAboveChange(_metaWindow) {
    // forge-zo4: ignore the notify::above that Forge itself emits while demoting
    // or restoring floats around a fullscreen window — only react to user pins.
    if (this._suppressAboveHandler) return;
    this.renderTree("notify-above");
  }

  get allNodeWindows() {
    return this.tree.getNodeByType(NODE_TYPES.WINDOW);
  }

  /**
   * Reloads the tree. This is an expensive operation.
   * Useful when using dynamic workspaces in GNOME-shell.
   * Delegates tree operations to tree.reload().
   *
   * @param {string} from - Debug identifier for where reload was triggered
   */
  reloadTree(from) {
    if (!this._reloadTreeSrcId) {
      this._reloadTreeSrcId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
        try {
          // T6: snapshot before wipe; restore after flat re-track.
          // Empty live snapshot (enable / Shell HUP) → portable session-layout.
          const treeSnapshot = this.tree.snapshotTree();
          this.tree.reload();
          this.lftMru?.clear();
          this.trackCurrentWindows();
          this.tree.restoreTree(treeSnapshot);
          if (!treeSnapshot?.monitors?.length) {
            this._restoreSessionLayoutAfterTrack();
          }
          this._lftTouchFocusAfterRestore();
          this.renderTree(from);
        } finally {
          // Always clear the id; otherwise a throw mid-reload would leave it set
          // and the guard above would block every future reloadTree this session.
          this._reloadTreeSrcId = 0;
        }
        return false;
      });
    }
  }

  /** Debounced last-good topology write (Shell HUP may skip disable). */
  _queueSessionLayoutSave() {
    return this.sessionLayoutRestore.queueSessionLayoutSave();
  }

  /** @param {number} [holdUs] */
  _holdSessionLayoutSave(holdUs = 12_000_000) {
    return this.sessionLayoutRestore.holdSessionLayoutSave(holdUs);
  }

  /**
   * @param {{ immediate?: boolean, force?: boolean }} [opts]
   * @returns {boolean}
   */
  _saveSessionLayoutForReload(opts = {}) {
    return this.sessionLayoutRestore.saveSessionLayoutForReload(opts);
  }

  /** Cancel debounce and write now (install flush). */
  flushSessionLayout() {
    return this.sessionLayoutRestore.flushSessionLayout();
  }

  /** After flat track on enable: rehome + restore portable last-good. */
  _restoreSessionLayoutAfterTrack() {
    return this.sessionLayoutRestore.restoreSessionLayoutAfterTrack();
  }

  /**
   * Seed WeakMap last-good from portable frames after session restore (HUP empties it).
   * @param {{ monitors?: any[] }} liveForest
   * @param {{ monitors?: any[] }|null} [portableForest]
   */
  _seedLastGoodHomesFromSession(liveForest, portableForest = null) {
    return this.sessionLayoutRestore.seedLastGoodHomesFromSession(liveForest, portableForest);
  }

  /** @param {{ monitors: any[] }} liveForest */
  _rehomeWindowsForSessionForest(liveForest) {
    return this.sessionLayoutRestore.rehomeWindowsForSessionForest(liveForest);
  }

  /** Snapshot mon id/stableKey only (no majority pile remap). */
  _restoreSessionForestStrict(liveForest) {
    return this.sessionLayoutRestore.restoreSessionForestStrict(liveForest);
  }

  /** Raise tiles after restore so none stay buried under a sibling. */
  _raiseAfterSessionRestore(liveForest, opts = {}) {
    return this.sessionLayoutRestore.raiseAfterSessionRestore(liveForest, opts);
  }

  /**
   * After snapshot restore, re-touch the focused tiled window so LFT MRU stays
   * coherent with live focus (optional T6). Prefer session-restored focus —
   * Mutter may not have applied activate yet right after HUP.
   */
  _lftTouchFocusAfterRestore() {
    try {
      const focusWin =
        this._sessionRestoredFocusMeta ||
        this._sessionLayoutShield?.focusMeta ||
        this.focusMetaWindow;
      if (!focusWin) return;
      const node = this.tree.findNode(focusWin);
      this._lftTouchIfTile(node);
    } catch (_e) {
      // focus path best-effort only
    }
  }

  sameParentMonitor(firstNode, secondNode) {
    if (!firstNode || !secondNode) return false;
    if (!firstNode.nodeValue || !secondNode.nodeValue) return false;
    if (!firstNode.nodeValue.get_workspace()) return false;
    if (!secondNode.nodeValue.get_workspace()) return false;
    let firstMonWs = Utils.createMonitorWorkspaceId(
      firstNode.nodeValue.get_monitor(),
      firstNode.nodeValue.get_workspace().index()
    );
    let secondMonWs = Utils.createMonitorWorkspaceId(
      secondNode.nodeValue.get_monitor(),
      secondNode.nodeValue.get_workspace().index()
    );
    return firstMonWs === secondMonWs;
  }

  showWindowBorders(...a) {
    return this.decorationManager.showWindowBorders(...a);
  }

  updateBorderLayout(...a) {
    return this.decorationManager.updateBorderLayout(...a);
  }

  calculateGaps(...a) {
    return this.decorationManager.calculateGaps(...a);
  }

  /**
   * Bug #305 fix: Normalize sibling percentages to ensure they sum to 1.0
   * This prevents resize drift when resizing windows with 3+ siblings.
   * @param {Node} parentNode - The parent node containing children to normalize
   */
  _normalizeSiblingPercents(parentNode) {
    if (!parentNode) return;

    // Skip STACKED/TABBED - they don't use percent-based layout (children overlap)
    // Initializing from rect would produce invalid percents (each child rect = full container)
    // Guard against non-Node objects that might lack these methods
    if (parentNode.isStackedOrTabbed()) return;

    const children = this.tree.getTiledChildren(parentNode.childNodes);
    if (children.length <= 1) return;

    // Get parent size for calculating proportions
    const orientation = Utils.orientationFromLayout(parentNode.layout);
    const parentSize =
      orientation === ORIENTATION_TYPES.HORIZONTAL
        ? parentNode.rect?.width
        : parentNode.rect?.height;

    // First pass: initialize uninitialized children based on current rect
    children.forEach((child) => {
      if (!child.percent || child.percent <= 0) {
        // Calculate percent from current rect if available
        if (child.rect && parentSize && parentSize > 0) {
          const childSize =
            orientation === ORIENTATION_TYPES.HORIZONTAL ? child.rect.width : child.rect.height;
          child.percent = childSize / parentSize;
        } else {
          // Fallback to equal distribution
          child.percent = 1.0 / children.length;
        }
      }
    });

    // Second pass: normalize all percentages to sum to 1.0
    let totalPercent = 0;
    children.forEach((child) => {
      totalPercent += child.percent;
    });

    if (totalPercent > 0 && Math.abs(totalPercent - 1.0) > 0.001) {
      const scale = 1.0 / totalPercent;
      children.forEach((child) => {
        child.percent *= scale;
      });
    }
  }

  /**
   * Feature #315: Maximize single window when only one tiled window on monitor
   */
  /**
   * Tiled, non-minimized window nodes directly hosted on a monitor. Shared by
   * handleMaximizeOnSingle (the maximize-on-single feature) and the
   * external-maximize rejection in updateMetaPositionSize so the "sole tiled
   * window" predicate cannot drift between the two (drift would loop:
   * unmaximize -> render -> handleMaximizeOnSingle -> maximize -> ...).
   */
  _tiledWindowsOnMonitor(monitorNode) {
    if (!monitorNode) return [];
    return monitorNode
      .getNodeByMode(WINDOW_MODES.TILE)
      .filter((t) => t.isWindow() && !t.nodeValue.minimized);
  }

  handleMaximizeOnSingle() {
    let settings = this.ext.settings;
    if (!settings.get_boolean("window-maximize-on-single")) return;

    let activeWsNode = this.currentWsNode;
    if (!activeWsNode) return;

    let monitors = activeWsNode.getNodeByType(NODE_TYPES.MONITOR);
    monitors.forEach((monitor) => {
      let tiled = this._tiledWindowsOnMonitor(monitor);
      if (tiled.length === 1) {
        let metaWindow = tiled[0].nodeValue;
        // forge-fw8: a lone fullscreen window is "not maximized" — don't
        // force-maximize it, that fights the fullscreen surface.
        if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return;
        if (Compat.isNotMaximized(metaWindow)) {
          Compat.maximize(metaWindow);
        }
      }
    });
  }

  /**
   * Feature #462: Unmaximize other windows when a new window is tiled alongside
   */
  handleUnmaximizeForTiling(newNodeWindow) {
    if (!this.ext.settings.get_boolean("auto-unmaximize-for-tiling")) return;
    if (!newNodeWindow || newNodeWindow.isFloat()) return;

    // Find the monitor node for this window
    const monitorNode = this.tree.findParent(newNodeWindow, NODE_TYPES.MONITOR);
    if (!monitorNode) return;

    // Get all windows on this monitor
    const windows = monitorNode.getNodeByType(NODE_TYPES.WINDOW);

    windows.forEach((nodeWindow) => {
      if (nodeWindow === newNodeWindow) return;
      if (nodeWindow.isFloat()) return;

      const metaWindow = nodeWindow.nodeValue;
      if (!metaWindow || metaWindow.minimized) return;

      if (Compat.isMaximized(metaWindow)) {
        Compat.unmaximize(metaWindow);
      }
    });
  }

  /**
   * Track meta/mutter windows and append them to the tree.
   * Windows can be attached on any of the following Node Types:
   * MONITOR, CONTAINER
   *
   * OP1 open-app policy: home + attach from LFT MRU (global or dock mon);
   * tab-after / aspect split of LFT; dock sticky Meta force + grace.
   */
  trackWindow(_display, metaWindow) {
    // Make window types configurable
    if (this._validWindow(metaWindow)) {
      let existNodeWindow = this.tree.findNode(metaWindow);
      Logger.debug(`Meta Window ${metaWindow.get_title()} ${metaWindow.get_window_type()}`);
      if (!existNodeWindow) {
        const openPlan = this._planOpenAppPlacement(metaWindow);

        // W3: Guake (float-follow) homes on focus mon, not pointer-only current.
        if (this._isFloatFollowWindow(metaWindow)) {
          const focusMon = this.resolveFocusMonitor();
          if (typeof focusMon === "number" && focusMon >= 0) {
            openPlan.homeMonitor = focusMon;
          }
        }

        // Aspect split LFT before attach (not when LFT is already tabbed/stacked).
        // forge-mhje: only for genuinely new windows — never reload re-tracks.
        this._maybeAspectSplitForOpen(openPlan.attachLft);

        const activeWorkspace = global.display.get_workspace_manager().get_active_workspace_index();
        let metaMonWs = Utils.createMonitorWorkspaceId(openPlan.homeMonitor, activeWorkspace);

        let metaMonWsNode = this.tree.findNode(metaMonWs);
        if (!metaMonWsNode) {
          this.reloadTree("no-meta-monws");
          return;
        }

        let windowNodes = metaMonWsNode.getNodeByType(NODE_TYPES.WINDOW);
        let hasWindows = windowNodes.length > 0;

        // Permanent floats (Guake, dialogs): hang under MONITOR, not LFT/TABBED —
        // sibling under a tab group looks like a lowered/tabbed chrome target.
        const willTile = !this.isFloatingExempt(metaWindow);
        const attachTarget = willTile
          ? this._resolveAttachTarget(metaMonWsNode, windowNodes, hasWindows, openPlan.attachLft)
          : metaMonWsNode;

        let nodeWindow = this.tree.createNode(
          attachTarget.nodeValue,
          NODE_TYPES.WINDOW,
          metaWindow,
          WINDOW_MODES.FLOAT
        );

        metaWindow.firstRender = true;

        // Dock sticky + PlaceNext mon home: force Meta onto planned mon so
        // window-entered-monitor cannot rehome the tree off PlaceNext (W2).
        if (openPlan.isDock || (openPlan.fromPlaceHint && openPlan.homeMonitor >= 0)) {
          this._applyDockStickyHome(metaWindow, openPlan.homeMonitor);
        }

        // W3: Guake float-follow — Meta onto focus mon at map (allowlist only).
        // Mon move only; do not resize or reparent into tile slots.
        this._applyFloatFollowMonitor(metaWindow);

        let windowActor = metaWindow.get_compositor_private();
        // Keep Node._actor in sync so hideWindowBorders finds borders.
        if (windowActor && nodeWindow) nodeWindow._actor = windowActor;

        this._bindWindowSignals(metaWindow, windowActor);

        // Focus border always starts hidden — showWindowBorders owns visibility.
        // Never show at map (stale half-size rings during layout thrash).
        if (windowActor) {
          this.decorationManager.ensureFocusBorder(windowActor, nodeWindow);
        }

        this.postProcessWindow(nodeWindow);

        // Feature #462: Unmaximize other windows when new window tiled alongside
        this.handleUnmaximizeForTiling(nodeWindow);

        // forge-7m3: Give the new window a fair share while preserving the
        // existing windows' custom proportions, instead of zeroing every sibling
        // (which forced an equal re-split and discarded user resizes).
        // forge-3hsv: but only for windows that will actually tile. Permanently
        // float-exempt windows (dialogs, transients, always-on-top) are created
        // FLOAT and never tile, so carving them a share would leave the tiled
        // siblings summing < 1 and corrupt the split. isFloatingExempt reads the
        // window type/overrides available now; isFloat() can't be used here
        // because every new node is FLOAT until processFloats runs.
        if (willTile) {
          this.tree.insertChildPercent(nodeWindow.parentNode, nodeWindow);
        }

        // First tile pass: processFloats FLOAT→TILE + apply placement. Dock opens
        // use a shorter delay so mon sticky + first geometry land before the user
        // sees a loose Meta frame (OP2). Non-dock keeps ~200ms for map animation.
        if (willTile) {
          const createDelay = openPlan.isDock ? 50 : 200;
          this.queueEvent(
            {
              name: "window-create-queue",
              callback: () => {
                Compat.unmaximize(metaWindow);
                // processFloats runs inside renderTree; force past freeze.
                this.renderTree("window-create", true);
              },
            },
            createDelay
          );
        }
      }
    }
  }

  /**
   * OP1 + FC2: resolve monitor home + LFT attach (or PlaceNext hint).
   * Place hint wins over LFT/dock when the new window matches.
   * @param {Meta.Window} metaWindow
   */
  _planOpenAppPlacement(metaWindow) {
    const placePlan = this._tryPlanFromPlaceHint(metaWindow);
    if (placePlan) return placePlan;

    const dockMonitor = this.detectDockLaunchMonitor(metaWindow);
    const globalLft = this.lftMru?.globalHead?.() ?? null;
    const lftMonitor = this._monitorIndexOfNode(globalLft);
    const monLft = dockMonitor >= 0 ? this.lftMru?.monHead?.(dockMonitor) ?? null : null;
    const windowMonitor = metaWindow?.get_monitor?.() ?? -1;
    let placement = "pointer";
    try {
      placement = this.ext.settings.get_string("new-window-placement") || "pointer";
    } catch (_e) {
      // settings unavailable in some fixtures
    }

    const plan = resolveOpenAppPlacement({
      dockMonitor,
      monLft,
      globalLft,
      lftMonitor,
      windowMonitor,
      placement,
    });

    // Re-resolve attach LFT against the live tree when possible.
    if (plan.attachLft?.nodeValue) {
      const live = this.tree.findNode(plan.attachLft.nodeValue);
      if (live) plan.attachLft = live;
    }
    return plan;
  }

  /**
   * FC2: queue a one-shot PlaceNext hint (from DBus or tests).
   * @param {object} options
   * @returns {{ ok: true, hint: object } | { ok: false, error: string }}
   */
  placeNext(options) {
    const now = Date.now();
    const norm = normalizePlaceHint(options, now);
    if (!norm.ok) return norm;
    if (!this._pendingPlaceHints) this._pendingPlaceHints = [];
    enqueuePlaceHint(this._pendingPlaceHints, norm.hint, now);
    return { ok: true, hint: norm.hint };
  }

  /** Drop expired PlaceNext hints. */
  clearExpiredPlaceHints() {
    if (!this._pendingPlaceHints?.length) return;
    pruneExpiredPlaceHints(this._pendingPlaceHints, Date.now());
  }

  /**
   * If a PlaceNext hint matches this window, consume it and build a plan.
   * @param {Meta.Window} metaWindow
   * @returns {{ homeMonitor: number, isDock: boolean, attachLft: any, attachMode: string, fromPlaceHint: boolean }|null}
   */
  _tryPlanFromPlaceHint(metaWindow) {
    if (!this._pendingPlaceHints?.length) return null;
    const now = Date.now();
    const hint = consumePlaceHint(this._pendingPlaceHints, metaWindow, now);
    if (!hint) return null;

    let attachNode = null;
    if (hint.attachSelector) {
      attachNode = this._resolvePlaceAttachSelector(hint.attachSelector, !!hint.first);
    }
    if (!attachNode && hint.treePath) {
      const pathSel = hint.treePath.startsWith("path:") ? hint.treePath : `path:${hint.treePath}`;
      attachNode = this._resolvePlaceAttachSelector(pathSel, !!hint.first);
    }

    let homeMonitor = resolvePlaceMonitorIndex(hint.monitor, {
      liveMap: this._monitorLiveMap,
      primaryMonitor: this._primaryMonitorIndex(),
    });

    if (attachNode) {
      const monOfAttach = this._monitorIndexOfNode(attachNode);
      if (homeMonitor < 0 && monOfAttach >= 0) homeMonitor = monOfAttach;
      // Explicit monitor overrides path mon when both set.
      if (hint.monitor != null && hint.monitor !== "") {
        const explicit = resolvePlaceMonitorIndex(hint.monitor, {
          liveMap: this._monitorLiveMap,
          primaryMonitor: this._primaryMonitorIndex(),
        });
        if (explicit >= 0) homeMonitor = explicit;
      }
    }

    if (homeMonitor < 0) homeMonitor = 0;

    let attachLft = null;
    if (attachNode) {
      // Prefer attach under the planned home mon when path landed elsewhere.
      const monOfAttach = this._monitorIndexOfNode(attachNode);
      if (monOfAttach < 0 || monOfAttach === homeMonitor) {
        attachLft = attachNode;
      }
    }
    if (!attachLft) {
      attachLft = this.lftMru?.monHead?.(homeMonitor) ?? null;
    }

    return {
      homeMonitor,
      isDock: false,
      attachLft,
      attachMode: attachLft ? "after-lft" : "mon-root",
      fromPlaceHint: true,
    };
  }

  /**
   * @param {string} selector
   * @param {boolean} first
   * @returns {any|null}
   */
  _resolvePlaceAttachSelector(selector, first) {
    try {
      let descriptor = parseSelector(selector);
      if (first) descriptor = { ...descriptor, first: true };
      const forest =
        typeof this.tree?.getNodeByType === "function"
          ? this.tree.getNodeByType(NODE_TYPES.MONITOR) || []
          : [];
      if (!forest.length) return null;
      const ctx = this._placeSelectCtx();
      let matches;
      if (descriptor.kind === "path") {
        matches = matchNodes(forest, descriptor, ctx).matches;
      } else {
        matches = matchWindows(forest, descriptor, ctx).matches;
      }
      const picked = pickMatch(matches, { first: !!descriptor.first });
      return picked.ok ? picked.match.node : null;
    } catch (e) {
      Logger.debug(`place-hint attach resolve failed: ${e}`);
      return null;
    }
  }

  _placeSelectCtx() {
    return {
      getFocusWindow: () => {
        try {
          return this.focusMetaWindow ?? null;
        } catch (_e) {
          return null;
        }
      },
      getLftNode: () => {
        try {
          return this.lftMru?.globalHead?.() ?? null;
        } catch (_e) {
          return null;
        }
      },
      findNode: (val) => {
        try {
          return this.tree?.findNode?.(val) ?? null;
        } catch (_e) {
          return null;
        }
      },
      liveMap: this._monitorLiveMap,
      getActiveWorkspace: () => {
        try {
          return global.workspace_manager?.get_active_workspace_index?.() ?? null;
        } catch (_e) {
          return null;
        }
      },
    };
  }

  /** @returns {number} */
  _primaryMonitorIndex() {
    try {
      const n = global.display?.get_primary_monitor?.();
      if (n != null && n >= 0) return n;
    } catch (_e) {
      /* ignore */
    }
    return 0;
  }

  /**
   * Aspect-split LFT when auto-split is on and LFT is not in a tab/stack group.
   * Uses LFT rect (OP1), not the pointer focus window.
   * OP-opt: optional tiny-pane → TABBED instead of H/V split.
   * @param {import('./tree.js').Node|null} lftNode
   */
  _maybeAspectSplitForOpen(lftNode) {
    if (!lftNode || !this.ext.settings.get_boolean("auto-split-enabled")) return;
    const live = lftNode.nodeValue ? this.tree.findNode(lftNode.nodeValue) : lftNode;
    if (!live || !live.parentNode) return;
    // PlaceNext may attach to CON/MONITOR — only split real windows.
    if (
      typeof live.isWindow === "function" ? !live.isWindow() : live.nodeType !== NODE_TYPES.WINDOW
    ) {
      return;
    }
    if (isTabOrStackParent(live.parentNode, LAYOUT_TYPES)) return;
    if (live.isFloat?.()) return;

    const meta = live.nodeValue;
    const rect = meta?.get_frame_rect?.() || live.rect;
    const orientationStr = aspectOrientationFromRect(rect);
    const orientation =
      orientationStr === "vertical" ? ORIENTATION_TYPES.VERTICAL : ORIENTATION_TYPES.HORIZONTAL;

    const workareaMinEdge = this._workareaMinEdgeForNode(live);
    const hints = meta?.get_size_hints?.();
    const useTab =
      this.ext.settings.get_boolean("tabbed-tiling-mode-enabled") &&
      shouldTabInsteadOfSplit({
        lftWidth: rect?.width ?? 0,
        lftHeight: rect?.height ?? 0,
        workareaMinEdge,
        minEdgePx: this.ext.settings.get_uint("tiny-pane-min-edge"),
        appMinW: hints?.min_width ?? 0,
        appMinH: hints?.min_height ?? 0,
        enabled: this.ext.settings.get_boolean("tiny-pane-tab-fallback-enabled"),
        orientation: orientationStr,
      });

    if (useTab) {
      // forceSplit so LFT gets its own TABBED CON (new open joins as sibling tab).
      const tabCon = this.tree.split(live, orientation, true);
      if (tabCon) {
        tabCon.layout = LAYOUT_TYPES.TABBED;
        tabCon.lastTabFocus = meta;
      }
      return;
    }

    const newContainer = this.tree.split(live, orientation);
    if (newContainer) this.applyDefaultLayoutToContainer(newContainer);
  }

  /**
   * min(workarea.w, workarea.h) for LFT's monitor; 0 if unknown.
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {number}
   */
  _workareaMinEdgeForNode(node) {
    if (!node) return 0;
    try {
      const meta = node.nodeValue;
      const wa = Utils.getWorkAreaSafe(meta);
      if (wa && wa.width > 0 && wa.height > 0) {
        return Math.min(wa.width, wa.height);
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      const monIdx = this._monitorIndexOfNode(node);
      if (monIdx >= 0 && global.display?.get_monitor_geometry) {
        const g = global.display.get_monitor_geometry(monIdx);
        if (g && g.width > 0 && g.height > 0) return Math.min(g.width, g.height);
      }
    } catch (_e) {
      /* ignore */
    }
    return 0;
  }

  /**
   * Force Meta monitor for dock launches / PlaceNext mon home and mark a short
   * sticky grace so restore-geometry / entered-monitor cannot flip the home.
   * @param {Meta.Window} metaWindow
   * @param {number} monitorIndex
   */
  _applyDockStickyHome(metaWindow, monitorIndex) {
    if (!metaWindow || monitorIndex < 0) return;
    metaWindow._forgeDockStickyMon = monitorIndex;
    metaWindow._forgeDockStickyUntil = Date.now() + DOCK_STICKY_GRACE_MS;
    safeMoveToMonitor(metaWindow, monitorIndex, "dock sticky move_to_monitor");
  }

  /**
   * W2: late wm-class/title — re-consume PlaceNext if the window mapped with
   * null identity (hint not matched) and is still provisional (FLOAT / firstRender).
   * Reparents under plan.attachLft / path like first-map _resolveAttachTarget,
   * not only the mon root.
   * @param {Meta.Window} metaWindow
   * @returns {boolean}
   */
  _retryPlaceHintAfterIdentity(metaWindow) {
    if (!metaWindow || !this._pendingPlaceHints?.length) return false;
    const node = this.tree.findNode(metaWindow);
    if (!node) return false;
    const stillFloat =
      typeof node.isFloat === "function" ? node.isFloat() : node.mode === WINDOW_MODES.FLOAT;
    const provisional = metaWindow.firstRender === true || stillFloat;
    if (!provisional) return false;

    const plan = this._tryPlanFromPlaceHint(metaWindow);
    if (!plan?.fromPlaceHint) return false;

    if (plan.homeMonitor >= 0) {
      this._applyDockStickyHome(metaWindow, plan.homeMonitor);
    }

    const ws = metaWindow.get_workspace?.()?.index?.() ?? 0;
    const homeMon = plan.homeMonitor >= 0 ? plan.homeMonitor : this._monitorIndexOfNode(node);
    if (homeMon < 0) return true;

    const destId = Utils.createMonitorWorkspaceId(homeMon, ws);
    let dest = this.tree.findNode(destId);
    if (!dest) {
      this.reloadTree("place-hint-late-mon");
      dest = this.tree.findNode(destId);
    }
    if (!dest) return true;

    // Mirror first-map: attach under path/LFT, not mon root only.
    const windowNodes = dest.getNodeByType(NODE_TYPES.WINDOW).filter((w) => w !== node);
    const attachTarget = this._resolveAttachTarget(
      dest,
      windowNodes,
      windowNodes.length > 0,
      plan.attachLft
    );
    this._reparentForLatePlace(node, attachTarget || dest);
    return true;
  }

  /**
   * Reparent a provisional window to match createNode attach semantics:
   * WINDOW target → next sibling under grandparent; CON/MONITOR → append.
   * @param {import('./tree.js').Node} node
   * @param {import('./tree.js').Node} attachTarget
   */
  _reparentForLatePlace(node, attachTarget) {
    if (!node || !attachTarget || node === attachTarget) return;
    if (attachTarget.isWindow?.()) {
      const gp = attachTarget.parentNode;
      if (!gp) return;
      // Already next sibling of attach target.
      if (node.parentNode === gp && attachTarget.nextSibling === node) return;
      gp.insertBefore(node, attachTarget.nextSibling);
      return;
    }
    if (node.parentNode === attachTarget) return;
    attachTarget.appendChild(node);
  }

  /**
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {number}
   */
  _monitorIndexOfNode(node) {
    if (!node) return -1;
    const mon = this.tree.findAncestor?.(node, NODE_TYPES.MONITOR);
    if (mon?.nodeValue) {
      const idx = Utils.monitorIndex(mon.nodeValue);
      if (idx >= 0) return idx;
    }
    const meta = node.nodeValue;
    if (meta && typeof meta.get_monitor === "function") {
      const m = meta.get_monitor();
      return m >= 0 ? m : -1;
    }
    return -1;
  }

  /**
   * Touch LFT MRU when the node is a tiled window.
   * @param {import('./tree.js').Node|null|undefined} nodeWindow
   */
  _lftTouchIfTile(nodeWindow) {
    if (!nodeWindow || !this.lftMru) return;
    if (!nodeWindow.isWindow?.() || !nodeWindow.isTile?.()) return;
    const mon = this._monitorIndexOfNode(nodeWindow);
    this.lftMru.touch(nodeWindow, mon);
    // Keep attachNode aligned with the global LFT when practical.
    this.tree.attachNode = nodeWindow;
  }

  /**
   * Record a dock/favorites-style launch for sticky-mon matching.
   * @param {number} monitorIndex
   * @param {{ appId?: string|null }} [opts]
   */
  noteDockLaunch(monitorIndex, opts = {}) {
    if (monitorIndex == null || monitorIndex < 0) return;
    const now = Date.now();
    this._pendingDockLaunches = (this._pendingDockLaunches || []).filter(
      (e) => now - e.ts <= DOCK_LAUNCH_TTL_MS
    );
    this._pendingDockLaunches.push({
      monitor: monitorIndex,
      appId: opts.appId ?? null,
      ts: now,
    });
  }

  /**
   * Best-effort dock launch monitor for a new window.
   * Explicit metaWindow._forgeDockMonitor wins; else pending noteDockLaunch matches.
   * @param {Meta.Window} metaWindow
   * @returns {number} monitor index or -1
   */
  detectDockLaunchMonitor(metaWindow) {
    if (!metaWindow) return -1;
    if (typeof metaWindow._forgeDockMonitor === "number" && metaWindow._forgeDockMonitor >= 0) {
      return metaWindow._forgeDockMonitor;
    }

    let appId = metaWindow._forgeAppId || null;
    if (!appId) {
      try {
        const tracked = Shell.WindowTracker.get_default().get_window_app(metaWindow);
        appId = tracked?.get_id?.() || null;
      } catch (_e) {
        appId = null;
      }
    }

    const match = matchPendingDockLaunch(this._pendingDockLaunches, { appId });
    if (!match) return -1;
    this._pendingDockLaunches.splice(match.index, 1);
    return match.monitor;
  }

  /**
   * Best-effort: wrap Shell.App activate/open_new_window so dock/favorites
   * launches record sticky mon (focus mon when available; overview skipped).
   * Active WM is refreshed on each enable so disable/re-enable does not orphan
   * the shared prototype hook. Explicit: noteDockLaunch / _forgeDockMonitor.
   */
  _tryInstallDockLaunchHook() {
    try {
      const App = Shell.App;
      if (!App?.prototype) return;
      // Shared hook → live WM (new WindowManager each extension enable).
      App.prototype._forgeDockWm = this;
      this._dockLaunchHooked = true;
      if (App.prototype._forgeDockLaunchHooked) return;
      const wrap = (methodName) => {
        const orig = App.prototype[methodName];
        if (typeof orig !== "function") return;
        App.prototype[methodName] = function (...args) {
          try {
            const wmRef = App.prototype._forgeDockWm;
            if (!Main.overview?.visible && wmRef && !wmRef.disabled) {
              // W3: prefer focused window mon over pointer-only current mon.
              const mon =
                typeof wmRef.resolveFocusMonitor === "function"
                  ? wmRef.resolveFocusMonitor()
                  : global.display.get_current_monitor();
              const appId = typeof this.get_id === "function" ? this.get_id() : null;
              wmRef.noteDockLaunch(mon, { appId });
            }
          } catch (_e) {
            // never break app launch
          }
          return orig.apply(this, args);
        };
      };
      wrap("activate");
      wrap("open_new_window");
      App.prototype._forgeDockLaunchHooked = true;
    } catch (_e) {
      // Shell.App missing (unit mock) — noteDockLaunch remains the API.
    }
  }

  /**
   * Resolve the node a brand-new window should attach under, within the active
   * monitor/workspace container (metaMonWsNode). Precedence (OP1):
   *   1. attach LFT (global or mon head) under this mon;
   *   2. tree.attachNode when it still resolves under this mon (aspect split CON);
   *   3. mon root.
   * Cross-monitor attachNode must not shadow attachLft (dock LFT(m) case).
   */
  _resolveAttachTarget(metaMonWsNode, windowNodes, hasWindows, attachLft = null) {
    let attachTarget = null;

    if (attachLft) {
      const lftNode = attachLft.nodeValue ? this.tree.findNode(attachLft.nodeValue) : attachLft;
      if (lftNode && metaMonWsNode.contains(lftNode)) {
        attachTarget = lftNode;
      }
    }

    if (!attachTarget) {
      attachTarget = this.tree.attachNode;
      attachTarget = attachTarget ? this.tree.findNode(attachTarget.nodeValue) : null;
      if (attachTarget && !metaMonWsNode.contains(attachTarget)) {
        attachTarget = null;
      }
    }

    // Legacy: lastFocusedWindow if it is a tile under this mon (may be float-poisoned —
    // only use when still a tile). Prefer LFT path above.
    if (!attachTarget && this.lastFocusedWindow) {
      const lastFocusNode = this.tree.findNode(this.lastFocusedWindow.nodeValue);
      if (lastFocusNode && lastFocusNode.isTile?.() && metaMonWsNode.contains(lastFocusNode)) {
        attachTarget = lastFocusNode;
      }
    }

    if (!attachTarget) return metaMonWsNode;
    if (!hasWindows) return metaMonWsNode;
    return metaMonWsNode.contains(attachTarget) ? attachTarget : windowNodes[0] || metaMonWsNode;
  }

  /**
   * Bind the per-window and per-actor signals for a newly tracked window, once.
   * The handlers close over windowActor (border hiding) and `this`; they are
   * stored on metaWindow.windowSignals / windowActor.actorSignals for disable().
   */
  _bindWindowSignals(metaWindow, windowActor) {
    // Seed identity fingerprints so path/prompt spam is not a free full retile.
    if (metaWindow._forgeTitleForRetile === undefined) {
      metaWindow._forgeTitleForRetile = metaWindow.get_title();
    }
    if (metaWindow._forgeWmClassForRetile === undefined) {
      metaWindow._forgeWmClassForRetile = metaWindow.get_wm_class();
    }

    if (!metaWindow.windowSignals) {
      let windowSignals = [
        metaWindow.connect("position-changed", (_metaWindow) => {
          let from = "position-changed";
          this.updateMetaPositionSize(_metaWindow, from);
        }),
        metaWindow.connect("size-changed", (_metaWindow) => {
          let from = "size-changed";
          this.updateMetaPositionSize(_metaWindow, from);
        }),
        metaWindow.connect("unmanaged", (_metaWindow) => {
          this.hideActorBorder(windowActor);
          // forge-ph7f: drop any pending Wayland stacking-pin timer for a
          // closed window so it can't fire against a destroyed MetaWindow.
          if (_metaWindow._forgeStackTimeoutId) {
            GLib.Source.remove(_metaWindow._forgeStackTimeoutId);
            _metaWindow._forgeStackTimeoutId = 0;
          }
          _metaWindow._forgeTransientAbove = false;
        }),
        metaWindow.connect("focus", (_metaWindowFocus) => {
          this.queueEvent({
            name: "focus-update",
            callback: () => {
              this.unfreezeRender();
              // forge-d5mm: pass focused node (no-op on falsy). Raise first,
              // then restack chrome so tab strips stay above window actors.
              let focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
              this.updateStackedFocus(focusNodeWindow);
              this.updateTabbedFocus(focusNodeWindow);
              this.updateDecorationLayout();
              this.updateBorderLayout();
              this.movePointerWith(focusNodeWindow);
            },
          });
          let focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
          if (focusNodeWindow) {
            // S1: Meta focus change resets ops target to the new leaf; same-window
            // re-focus keeps elevated CON (focus-parent after raise/activate).
            this.tree.attachNode = resolveAttachOnFocusChange(
              this._lastFocusNodeWindow,
              focusNodeWindow,
              this.tree.attachNode
            );
            this._lastFocusNodeWindow = focusNodeWindow;
            if (this.floatingWindow(focusNodeWindow)) {
              this.queueEvent({
                name: "raise-float",
                callback: () => {
                  // Raise the focused float above the tiled grid (and other
                  // floats) instead of pinning dialogs always-on-top. Mutter
                  // raises transient children with their parent, so a focused
                  // window keeps its popup on top. Re-resolve focus live: the
                  // callback runs at idle and focus may have moved on.
                  // forge-5l9b: but never a float demoted under a fullscreen
                  // window — raise() would undo the reconcile's lower() without
                  // touching is_above(), so nothing would ever re-demote it.
                  const fw = this.focusMetaWindow;
                  const fwNode = fw ? this.tree.findNode(fw) : null;
                  if (fwNode && this.floatingWindow(fwNode) && !fwNode._aboveDemotedForFullscreen)
                    fw.raise();
                  // Raise only — do not full renderTree (that re-applies tile
                  // geometry and reflows Chrome/YouTube on every focus).
                  this.updateDecorationLayout();
                  this.updateBorderLayout();
                },
              });
            }
          }
          // Chrome-only: never renderTree/apply on focus. Full apply re-asserted
          // move_resize_frame on every tile (Wayland Chrome often differs by a
          // few px from the slot → constant reflow). Tabs/borders/raise above.
        }),
        metaWindow.connect("workspace-changed", (_metaWindow) => {
          // forge-6pe: coalesce bursts of workspace-changed (GNOME's
          // insertWorkspace moves many windows synchronously) into one
          // settled reconcile so nested layouts are not flattened.
          this._queueWindowHomeReconcile();
        }),
        metaWindow.connect("notify::above", (_metaWindow) => {
          // forge-w7e (#469): a user pinning a tiled window "Always on Top"
          // should float it out of the tree, and unsetting returns it to tile.
          this._handleUserAboveChange(_metaWindow);
        }),
        metaWindow.connect("notify::wm-class", () => {
          // forge-3qq (#482): late null→real class must retile once. Same-class
          // re-notify must not storm (mirror title gate).
          // Close over metaWindow: GObject notify passes (obj, pspec); mocks may
          // emit with no args — never rely on the signal payload alone.
          const needsRetile = this._wmClassChangeNeedsRetile(metaWindow);
          this.tree.findNode(metaWindow)?.refreshApp();
          if (!needsRetile) return;
          this._retryPlaceHintAfterIdentity(metaWindow);
          // W3: late Guake class — float-follow mon once identity is known.
          this._applyFloatFollowMonitor(metaWindow);
          this.renderTree("wm-class-changed");
        }),
        metaWindow.connect("notify::title", () => {
          // Wayland often maps with null/empty title; isFloatingExempt floats
          // those until the real title lands. Re-tile only when policy can flip
          // (empty↔non-empty or title-scoped overrides). Path/prompt spam does not.
          if (!this._titleChangeNeedsRetile(metaWindow)) {
            this.tree.findNode(metaWindow)?.refreshApp();
            return;
          }
          this.tree.findNode(metaWindow)?.refreshApp();
          this._retryPlaceHintAfterIdentity(metaWindow);
          this.renderTree("title-changed");
        }),
      ];
      metaWindow.windowSignals = windowSignals;
    }

    if (!windowActor.actorSignals) {
      let actorSignals = [windowActor.connect("destroy", this.windowDestroy.bind(this))];
      windowActor.actorSignals = actorSignals;
    }
  }

  postProcessWindow(nodeWindow) {
    let metaWindow = nodeWindow.nodeValue;
    if (metaWindow) {
      if (metaWindow.get_title() === this.prefsTitle) {
        metaWindow
          .get_workspace()
          .activate_with_focus(metaWindow, global.display.get_current_time());
        this.moveCenter(metaWindow);
      }
      // forge-f081: the old else-branch called movePointerWith(metaWindow), but
      // movePointerWith expects a tree Node (it guards on ._data) so the raw
      // Meta.Window made it a no-op since 2023. Pointer-follow for a new focus-
      // stealing window is already handled by the queued focus handler with a
      // proper Node — the dead call is removed rather than "fixed" into a warp
      // that would yank the pointer to non-focus-stealing new windows.
    }
  }

  updateStackedFocus(focusNodeWindow) {
    return this.focusManager.updateStackedFocus(focusNodeWindow);
  }

  updateTabbedFocus(focusNodeWindow) {
    return this.focusManager.updateTabbedFocus(focusNodeWindow);
  }

  _isInSkipList(settingKey, value) {
    let skipStr = this.ext.settings.get_string(settingKey);
    if (!skipStr || skipStr.trim() === "") return false;
    return skipStr.split(",").some((item) => item.trim() === `${value}`);
  }

  /**
   * Check if a given workspace index is skipped for tiling.
   * @param {number} wsIndex - Workspace index to check
   * @returns {boolean} True if workspace is skipped (not tiled)
   */
  _isWorkspaceSkipped(wsIndex) {
    return this._isInSkipList("workspace-skip-tile", wsIndex);
  }

  /**
   * Check if a Meta Window's workspace is skipped for tiling.
   */
  isActiveWindowWorkspaceTiled(metaWindow) {
    if (!metaWindow) return true;
    let activeWorkspaceForWin = metaWindow.get_workspace();
    if (!activeWorkspaceForWin) return true;
    return !this._isWorkspaceSkipped(activeWorkspaceForWin.index());
  }

  /**
   * Check the current active workspace's tiling mode
   */
  isCurrentWorkspaceTiled() {
    let wsMgr = global.workspace_manager;
    let wsIndex = wsMgr.get_active_workspace_index();
    return !this._isWorkspaceSkipped(wsIndex);
  }

  /**
   * Feature #295: Check if a window's monitor should be tiled
   */
  isActiveWindowMonitorTiled(metaWindow) {
    if (!metaWindow) return true;
    return !this._isInSkipList("monitor-skip-tile", metaWindow.get_monitor());
  }

  trackCurrentWindows() {
    this.tree.attachNode = null;
    let windowsAll = this.windowsAllWorkspaces;
    for (let i = 0; i < windowsAll.length; i++) {
      let metaWindow = windowsAll[i];
      this.trackWindow(global.display, metaWindow);
      // This updates and handles dynamic workspaces
      this.updateMetaWorkspaceMonitor(
        "track-current-windows",
        metaWindow.get_monitor(),
        metaWindow
      );
    }
    this.updateDecorationLayout();
  }

  _validWindow(metaWindow) {
    // Bug #309, #322 fix: Filter out XWayland Video Bridge and ddterm windows
    const wmClass = metaWindow.get_wm_class();
    if (wmClass && wmClass.toLowerCase().includes("xwaylandvideobridge")) {
      return false;
    }
    if (wmClass && wmClass.toLowerCase().includes("ddterm")) {
      return false;
    }

    const windowType = metaWindow.get_window_type();
    if (INVALID_WINDOW_TYPES.has(windowType)) return false;
    return VALID_WINDOW_TYPES.has(windowType);
  }

  _destroyActorBorder(...a) {
    return this.decorationManager._destroyActorBorder(...a);
  }

  windowDestroy(actor) {
    let nodeWindow;
    nodeWindow = this.tree.findNodeByActor(actor);

    // Release border actors (node + compositor props + registry)
    this.decorationManager._destroyActorBorder(actor, "border", nodeWindow);
    this.decorationManager._destroyActorBorder(actor, "splitBorder", nodeWindow);

    // forge-s02h: lastFocusedWindow is dereferenced inside deferred pointer
    // warps (storePointerLastPosition); clear it when its node closes so it
    // can't survive as a stale/disposed reference.
    if (nodeWindow && this.lastFocusedWindow === nodeWindow) {
      this.lastFocusedWindow = null;
    }
    // OP1: drop closed tiles from LFT MRU before detach.
    if (nodeWindow) this.lftMru?.remove(nodeWindow);

    // Check if this window has focus before removing (#258)
    const metaWindow = nodeWindow?.nodeValue;
    const hadFocus = metaWindow && this.focusMetaWindow === metaWindow;

    if (nodeWindow?.isWindow()) {
      // Bug #470 (forge-6qr) / #258: snapshot the focus-restoration context while
      // the tree is still intact — removeNode detaches the node (nulls parentNode),
      // after which neither its siblings nor its workspace can be resolved.
      const focusRestore =
        hadFocus && this.ext.settings.get_boolean("tiling-mode-enabled")
          ? this._captureFocusRestore(nodeWindow)
          : null;

      this.tree.removeNode(nodeWindow);
      // forge-zo4: a closing fullscreen window does not fire in-fullscreen-changed.
      // The node is already detached, so reconciling now restores floats that were
      // demoted for it (no-op when the closed window wasn't fullscreen).
      this._reconcileFullscreenFloatDemotion();
      this.renderTree("window-destroy-quick", true);
      this.removeFloatOverride(nodeWindow.nodeValue, true);

      if (focusRestore) this._restoreFocusAfterWindowClosed(focusRestore);
    }

    // find the next attachNode here
    let focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
    if (focusNodeWindow) {
      this.tree.attachNode = focusNodeWindow.parentNode;
    }

    this.queueEvent({
      name: "window-destroy",
      callback: () => {
        this.renderTree("window-destroy", true);
      },
    });
  }

  /**
   * Bug #470 (forge-6qr) / #258: snapshot focus-restoration candidates BEFORE the
   * closed node is detached. removeNode nulls parentNode, after which siblings and
   * the owning workspace are unrecoverable from the tree. Capturing the workspace
   * NODE (not the globally active workspace) keeps restoration on the workspace the
   * window actually closed on, so closing a window never pulls focus to another one.
   */
  _captureFocusRestore(closedNodeWindow) {
    const parent = closedNodeWindow.parentNode;
    const siblings = parent
      ? parent.childNodes.filter(
          (node) => node.isWindow() && node !== closedNodeWindow && node.nodeValue
        )
      : [];
    const workspaceNode = this.tree.findAncestor(closedNodeWindow, NODE_TYPES.WORKSPACE);
    return { closedNodeWindow, siblings, workspaceNode };
  }

  _restoreFocusAfterWindowClosed(restore) {
    if (!restore) return;

    Logger.debug(`Restoring focus after window closed`);

    const activate = (metaWindow) => {
      if (!metaWindow || metaWindow.minimized) return false;
      metaWindow.raise();
      metaWindow.focus(global.display.get_current_time());
      metaWindow.activate(global.display.get_current_time());
      return true;
    };

    // Prefer a sibling in the closed window's container.
    for (const sibling of restore.siblings) {
      if (activate(sibling.nodeValue)) return;
    }

    // Otherwise, a NORMAL window on the closed window's OWN workspace. The type
    // filter (preserved from the prior implementation) keeps focus off transient
    // dialogs/utility windows, which are also tracked as tree window nodes.
    const wsNode = restore.workspaceNode;
    if (!wsNode) return;
    const candidates = wsNode
      .getNodeByType(NODE_TYPES.WINDOW)
      .filter(
        (node) =>
          node !== restore.closedNodeWindow &&
          node.nodeValue &&
          node.nodeValue.get_window_type() === Meta.WindowType.NORMAL
      );
    for (const node of candidates) {
      if (activate(node.nodeValue)) return;
    }
  }

  /**
   * Handles any workspace/monitor update for the Meta.Window.
   * Full render only when rehome (or dock sticky) actually changes placement —
   * already-home entered-monitor must not storm renderTree.
   */
  updateMetaWorkspaceMonitor(from, _monitor, metaWindow) {
    if (this._validWindow(metaWindow)) {
      if (metaWindow.get_workspace() === null) return;

      // OP1 dock sticky: force Meta back to dock mon during grace; skip re-home.
      if (this._enforceDockStickyIfNeeded(metaWindow)) {
        this.renderTree(from);
        return;
      }

      let existNodeWindow = this.tree.findNode(metaWindow);
      let metaMonWs = Utils.createMonitorWorkspaceId(
        metaWindow.get_monitor(),
        metaWindow.get_workspace().index()
      );
      let metaMonWsNode = this.tree.findNode(metaMonWs);
      let rehomed = false;
      if (existNodeWindow) {
        if (existNodeWindow.parentNode && metaMonWsNode) {
          // Uses the existing workspace, monitor that the metaWindow
          // belongs to.
          let containsWindow = metaMonWsNode.contains(existNodeWindow);
          if (!containsWindow) {
            this.lftMru?.dropMonRings?.(existNodeWindow);
            this._rehomeWindowPreservingContainer(existNodeWindow, metaWindow, metaMonWsNode);
            rehomed = true;

            // Ensure that the workspace tiling is honored
            if (this.isActiveWindowWorkspaceTiled(metaWindow)) {
              if (this.grabOp !== Meta.GrabOp.WINDOW_BASE) this.updateTabbedFocus(existNodeWindow);
              this.updateStackedFocus(existNodeWindow);
            } else {
              // forge-5l9b: skip floats demoted under a fullscreen window —
              // raise() would silently undo _reconcileFullscreenFloatDemotion.
              if (
                this.floatingWindow(existNodeWindow) &&
                !existNodeWindow._aboveDemotedForFullscreen
              ) {
                existNodeWindow.nodeValue.raise();
              }
            }
          }
        } else if (!metaMonWsNode) {
          // mon/ws node not built yet — keep prior full-render behavior.
          rehomed = true;
        }
      } else {
        // Not tracked yet (rare); preserve prior always-render side effect.
        rehomed = true;
      }
      if (rehomed) this.renderTree(from);
    }
  }

  /**
   * During dock sticky grace, keep Meta on the dock monitor and refuse re-home.
   * @param {Meta.Window} metaWindow
   * @returns {boolean} true if sticky policy handled the event (caller should stop)
   */
  _enforceDockStickyIfNeeded(metaWindow) {
    const stickyMon = metaWindow?._forgeDockStickyMon;
    const until = metaWindow?._forgeDockStickyUntil ?? 0;
    if (typeof stickyMon !== "number" || stickyMon < 0) return false;
    if (Date.now() > until) {
      metaWindow._forgeDockStickyMon = undefined;
      metaWindow._forgeDockStickyUntil = undefined;
      return false;
    }
    safeMoveToMonitor(metaWindow, stickyMon, "dock sticky re-force");
    // Tree should already be on sticky mon from trackWindow; do not re-home away.
    const existNodeWindow = this.tree.findNode(metaWindow);
    if (!existNodeWindow) return true;
    const ws = metaWindow.get_workspace()?.index?.() ?? 0;
    const stickyId = Utils.createMonitorWorkspaceId(stickyMon, ws);
    const stickyNode = this.tree.findNode(stickyId);
    if (stickyNode && !stickyNode.contains(existNodeWindow)) {
      this._rehomeWindowPreservingContainer(existNodeWindow, metaWindow, stickyNode);
    }
    return true;
  }

  /**
   * forge-6pe: Re-home a window onto `destNode`, preserving an intact sub-tree.
   *
   * If the window's enclosing container is migrating in full to the same
   * destination, the whole container is moved (walking up to the highest such
   * ancestor) so nested sub-splits / proportions survive; otherwise just the
   * window moves (the normal single-window send-to-workspace behavior).
   *
   * @param {Node} existNodeWindow - The tracked window node to re-home.
   * @param {Meta.Window} metaWindow - Its Meta.Window (defines the destination).
   * @param {Node} destNode - The destination monitor node.
   */
  _rehomeWindowPreservingContainer(existNodeWindow, metaWindow, destNode) {
    let nodeToMove = existNodeWindow;
    let ancestor = existNodeWindow.parentNode;
    while (
      ancestor &&
      ancestor.nodeType === NODE_TYPES.CON &&
      this._containerFullyMigrates(ancestor, metaWindow)
    ) {
      nodeToMove = ancestor;
      ancestor = ancestor.parentNode;
    }

    let sourceParent = nodeToMove.parentNode;
    let sourceFullyMigrates = this._containerFullyMigrates(sourceParent, metaWindow);
    destNode.appendChild(nodeToMove);
    // Only rebalance the source if it keeps windows. A fully-migrating source is
    // emptying, and rescaling it would corrupt the proportions the departing
    // windows carry to the destination.
    if (!sourceFullyMigrates) {
      this.tree.redistributeSiblingPercent(sourceParent);
    }
  }

  /**
   * forge-6pe: GNOME's WindowManager.insertWorkspace moves many windows in one
   * synchronous burst (change_workspace_by_index per window), and Mutter emits
   * each window's workspace-changed synchronously mid-loop. Re-homing eagerly on
   * each event therefore sees a half-migrated tree and flattens nested layouts.
   * Coalesce the burst into a single idle pass that runs once the batch settles,
   * so whole sub-trees can be moved intact.
   */
  _queueWindowHomeReconcile() {
    if (this._windowHomeReconcileSrcId) return;
    this._windowHomeReconcileSrcId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._windowHomeReconcileSrcId = 0;
      this._reconcileWindowHomes();
      this.trackCurrentMonWs();
      this.renderTree("workspace-changed-reconcile");
      return false;
    });
  }

  /**
   * forge-6pe: Move every tracked window whose live (monitor, workspace) no longer
   * matches its tree position to the correct monitor node, preserving intact
   * sub-trees. Runs after a workspace-change burst has settled so the
   * "is the whole container migrating?" test reflects the final state.
   */
  _reconcileWindowHomes() {
    const windowNodes = this.tree.getNodeByType(NODE_TYPES.WINDOW);
    for (const wNode of windowNodes) {
      this._rehomeWindowToLiveLocation(wNode);
    }
  }

  /**
   * forge-6pe / forge-ojew: Re-home a single window node to the monitor node that
   * matches its Meta.Window's live (monitor, workspace), preserving an intact
   * sub-tree. No-op when the window is invalid, has no workspace, the destination
   * node doesn't exist, or it already lives there. Shared by the settled idle
   * reconcile and the synchronous workspace-removed rehome.
   *
   * @param {Node} wNode - The tracked window node to re-home.
   */
  _rehomeWindowToLiveLocation(wNode) {
    const metaWindow = wNode.nodeValue;
    // forge-c2yp: a finalized wrapper (missed-actor-destroy race) throws on the
    // first property read; _validWindow's get_wm_class() would abort the whole
    // workspace-removed handler. Skip dead nodes — the render prune collects them.
    if (!Utils.isWindowAlive(metaWindow)) return;
    if (!this._validWindow(metaWindow)) return;
    const ws = metaWindow.get_workspace();
    if (!ws) return;
    const destNode = this.tree.findNode(
      Utils.createMonitorWorkspaceId(metaWindow.get_monitor(), ws.index())
    );
    if (!destNode || destNode.contains(wNode)) return;
    this._rehomeWindowPreservingContainer(wNode, metaWindow, destNode);
  }

  /**
   * forge-ojew: Before a workspace subtree is spliced out (workspace-removed),
   * synchronously re-home its still-tracked window descendants to the surviving
   * workspace their Meta.Window now reports. Mutter emits each window's
   * 'workspace-changed' (queued for idle reconcile) BEFORE the synchronous
   * 'workspace-removed', so removeChild would otherwise detach those WINDOW nodes
   * and strand them — the idle reconcile, running later, can no longer find them.
   * Rehoming here keeps them tiled; the subsequent removeWorkspace then splices a
   * window-free subtree. Windows without a valid surviving destination are left for
   * the existing idle reconcile / workareas fallback.
   *
   * @param {number} wsIndex - Index of the workspace about to be removed.
   */
  _rehomeWorkspaceWindowsBeforeRemoval(wsIndex) {
    const wsNode = this.tree.findNode(`ws${wsIndex}`);
    if (!wsNode) return;
    // Snapshot: rehoming mutates the tree (moves nodes out of this subtree).
    const windowNodes = [...wsNode.getNodeByType(NODE_TYPES.WINDOW)];
    for (const wNode of windowNodes) {
      // forge-c2yp: never let one node abort the caller — removeWorkspace and the
      // index renumber MUST still run, or the ws-index scaffold desyncs for good.
      try {
        this._rehomeWindowToLiveLocation(wNode);
      } catch (e) {
        Logger.warn(`_rehomeWorkspaceWindowsBeforeRemoval: skipping node: ${e}`);
      }
    }
  }

  /**
   * forge-6pe: True when every *live* window beneath `node` now lives on the same
   * monitor + workspace as `metaWindow` — i.e. the whole sub-tree is migrating
   * together (as happens when GNOME shifts an entire workspace). Dead/finalized
   * siblings are ignored so they cannot unwrap a group. Used to move an intact
   * container instead of flattening windows one by one.
   *
   * @param {Node} node - A container (CON or MONITOR) node to test.
   * @param {Meta.Window} metaWindow - The migrating window defining the destination.
   * @returns {boolean}
   */
  _containerFullyMigrates(node, metaWindow) {
    if (!node) return false;
    // The _queueWindowHomeReconcile idle that reaches here has no try/catch; a
    // window closing during a multi-workspace shift can finalize the wrapper, so
    // probe liveness before get_workspace() (forge-7bry — consistent with the
    // per-node guard in the .every() below).
    if (!Utils.isWindowAlive(metaWindow)) return false;
    const destWs = metaWindow.get_workspace();
    if (!destWs) return false;
    const destWsIndex = destWs.index();
    const destMon = metaWindow.get_monitor();
    const windowNodes = node.getNodeByType(NODE_TYPES.WINDOW);
    if (!windowNodes || windowNodes.length === 0) return false;
    // Dead/finalized siblings must not block intact migration (one closing tab
    // should not unwrap the rest of a STACKED/TABBED or H/V group).
    const live = windowNodes.filter((wn) => Utils.isWindowAlive(wn.nodeValue));
    if (live.length === 0) return false;
    return live.every((wn) => {
      const mw = wn.nodeValue;
      // forge-c2yp: a finalized sibling throws when get_workspace() is CALLED, so
      // the method-exists truthiness check isn't enough — probe real liveness.
      const ws = mw.get_workspace();
      return ws && ws.index() === destWsIndex && mw.get_monitor() === destMon;
    });
  }

  /**
   * Handle any updates to the current focused window's position.
   * Useful for updating the active window border, etc.
   */
  updateMetaPositionSize(_metaWindow, from) {
    let focusMetaWindow = this.focusMetaWindow;
    if (!focusMetaWindow) return;

    let focusNodeWindow = this.findNodeWindow(focusMetaWindow);
    if (!focusNodeWindow) return;

    let tilingModeEnabled = this.ext.settings.get_boolean("tiling-mode-enabled");

    if (focusNodeWindow.grabMode && tilingModeEnabled) {
      // forge-v4wh: a maximize/fullscreen that lands inside the 120ms keyboard-resize
      // debounce arrives as a size-changed with grabMode still RESIZING. Feeding that
      // maximized frame to _handleResizing consumes ~half the monitor as a resize
      // delta and permanently skews the split percents. Handle via
      // _resolveExternalMaximize (end the grab first), never _handleResizing.
      if (this._shouldRejectExternalMaximize(focusNodeWindow, focusMetaWindow)) {
        this._clearTimeoutId("_manualResizeEndId");
        this._manualResizeEndWindow = null;
        this._grabCleanup(focusNodeWindow);
        this._resolveExternalMaximize(focusNodeWindow, focusMetaWindow, from);
      } else if (
        focusNodeWindow.grabMode === GRAB_TYPES.RESIZING &&
        Compat.getMaximizeFlags(focusMetaWindow) === 0 &&
        !(focusMetaWindow.is_fullscreen && focusMetaWindow.is_fullscreen())
      ) {
        this._handleResizing(focusNodeWindow);
      } else if (focusNodeWindow.grabMode === GRAB_TYPES.MOVING) {
        this._handleMoving(focusNodeWindow);
      }
    } else {
      // Bug #461 (forge-9yo): GNOME's native edge-snap/maximize on a tiled window
      // leaves it desynced from its tree slot. Resolve on the *changed* window
      // (not necessarily the focused one) before the regular render gate.
      let changedNode = this.findNodeWindow(_metaWindow);
      if (this._shouldRejectExternalMaximize(changedNode, _metaWindow)) {
        this._resolveExternalMaximize(changedNode, _metaWindow, from);
      } else if (Compat.isNotMaximized(focusMetaWindow)) {
        // apply/move feedback must not nest another full processFloats+apply.
        if (!this._suppressGeometrySignalRetile) {
          // TILE already at tree slot: chrome-only (no layout storm).
          // Real external drift (beyond epsilon) still full-renders.
          if (!this._tiledWindowAtTreeSlot(changedNode, _metaWindow)) {
            this.renderTree(from);
          }
        }
      }
    }
    this.updateBorderLayout();
    this.updateDecorationLayout();
  }

  /**
   * True when a TILE node frame already matches its tree slot (renderRect/rect)
   * within the same epsilon move() uses. Full re-layout is unnecessary then.
   */
  _tiledWindowAtTreeSlot(node, metaWindow) {
    if (!node || !metaWindow) return false;
    if (node.mode !== WINDOW_MODES.TILE) return false;
    if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return false;
    if (Compat.getMaximizeFlags(metaWindow) !== 0) return false;
    const slot = node.renderRect || node.rect;
    if (!slot || slot.width <= 0 || slot.height <= 0) return false;
    const frame = metaWindow.get_frame_rect();
    if (!frame) return false;
    const eps = 4;
    return (
      Math.abs(frame.x - slot.x) <= eps &&
      Math.abs(frame.y - slot.y) <= eps &&
      Math.abs(frame.width - slot.width) <= eps &&
      Math.abs(frame.height - slot.height) <= eps
    );
  }

  /**
   * Bug #461: should Forge override a native maximize/edge-snap on this window?
   * True only when the changed node is a tiled, non-fullscreen window that is NOT
   * the sole tiled window on its monitor (the lone-window case is the legitimate
   * window-maximize-on-single behavior and must be left alone — see
   * handleMaximizeOnSingle, which shares _tiledWindowsOnMonitor to avoid a loop).
   * Uses getMaximizeFlags (any axis) so single-axis edge-snaps are caught too.
   */
  _shouldRejectExternalMaximize(node, metaWindow) {
    if (!node || node.mode !== WINDOW_MODES.TILE) return false;
    if (!this.ext.settings.get_boolean("tiling-mode-enabled")) return false;
    if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return false;
    if (Compat.getMaximizeFlags(metaWindow) === 0) return false;
    let monitor = this.tree.findAncestorMonitor(node);
    return this._tiledWindowsOnMonitor(monitor).length > 1;
  }

  /**
   * Resolve a native maximize/edge-snap that would desync a multi-tile layout.
   *
   * - Full maximize (both axes, e.g. Super+Return / Super+Up): float the window
   *   so the maximize can stick. Tiled siblings keep their slots; the user can
   *   Super+Shift+0 (float toggle) to re-tile later.
   * - Single-axis edge-snap: still reject (unmaximize + re-tile) so half-snap
   *   does not leave a window desynced from its tree percent.
   */
  _resolveExternalMaximize(node, metaWindow, from) {
    if (Compat.isMaximized(metaWindow)) {
      // Pop out of the tile tree; leave maximized state intact.
      this.toggleFloatingMode({ name: "FloatToggle" }, metaWindow);
      this.renderTree(from || "external-maximize-float");
      return;
    }
    Compat.unmaximize(metaWindow);
    this.renderTree(from || "external-edge-snap-reject");
  }

  /**
   * forge-dyt2: a LONE tiled window may be legitimately maximized — an external
   * maximize the signal path intentionally leaves alone (the complement of
   * _shouldRejectExternalMaximize, which only fights the >1-window case), or
   * window-maximize-on-single. tree.apply must not re-slice it, because move()
   * doubles as the un-maximizer and would silently revert the maximize on the
   * next render. Shares _tiledWindowsOnMonitor with _shouldRejectExternalMaximize
   * and handleMaximizeOnSingle so the three never disagree — drift here risks an
   * unmaximize<->maximize render loop (this predicate only SKIPS an unmaximize, so
   * it cannot itself introduce one).
   */
  _isLoneMaximizedTile(node) {
    if (!node || node.mode !== WINDOW_MODES.TILE) return false;
    const metaWindow = node.nodeValue;
    if (!metaWindow) return false;
    if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return false;
    if (Compat.getMaximizeFlags(metaWindow) === 0) return false;
    const monitor = this.tree.findAncestorMonitor(node);
    return this._tiledWindowsOnMonitor(monitor).length === 1;
  }

  updateDecorationLayout(...a) {
    return this.decorationManager.updateDecorationLayout(...a);
  }

  freezeRender() {
    this._freezeRender = true;
  }

  unfreezeRender() {
    this._freezeRender = false;
  }

  /**
   * Temporarily unfreeze render state, render the tree, then restore.
   * @param {string} from - Debug identifier for the render call
   */
  _renderWithFreezeState(from) {
    let prevFrozen = this._freezeRender;
    if (prevFrozen) this.unfreezeRender();
    this.renderTree(from);
    if (prevFrozen) this.freezeRender();
  }

  /**
   * forge-4yl: shared handler for the minimize/unminimize signals. Both reset
   * the focused node's parent sibling percents and re-render under the freeze
   * state. Minimize additionally hides borders and, when the parent has no
   * tiled children left, resets the grandparent's percents too.
   */
  // Dispatch a GSettings "changed" signal. Extracted from the connect() closure so
  // the routing is unit-testable (the mock settings object emits no signals).
  _onSettingsChanged(settingName) {
    const settings = this.ext.settings;
    switch (settingName) {
      case "window-overrides-reload-trigger":
        // Reload window overrides when triggered by preferences
        // This prevents the main extension from overwriting changes made by preferences.
        // Keep live per-window (wmId) FloatToggle overrides from this session (forge-8rm6).
        this.reloadWindowOverrides(false);
        break;
      case "focus-border-toggle":
      case "focus-border-hidden-on-single":
      case "split-border-toggle":
      case "split-chrome-show-all":
        this.renderTree(settingName);
        break;
      case "layout-debug-overlay-enabled":
        if (settings.get_boolean(settingName)) {
          this.layoutDebugOverlay?.update();
        } else {
          this.layoutDebugOverlay?.destroyAll();
        }
        break;
      case "focus-on-hover-enabled":
        this.shouldFocusOnHover = settings.get_boolean(settingName);

        if (this.shouldFocusOnHover) {
          this.pointerLoopInit();
        }

        break;
      case "tiling-mode-enabled":
        this.renderTree(settingName);
        break;
      case "window-gap-size-increment":
      case "window-gap-size":
      case "window-gap-hidden-on-single":
      case "workspace-skip-tile":
      case "monitor-skip-tile":
      case "stacked-tab-bar-height":
      case "max-tabs-per-line":
      case "tab-position":
        this.renderTree(settingName, true);
        break;
      case "stacked-tiling-mode-enabled":
        this._handleLayoutModeToggle(settingName, LAYOUT_TYPES.STACKED);
        break;
      case "tabbed-tiling-mode-enabled":
        this._handleLayoutModeToggle(settingName, LAYOUT_TYPES.TABBED);
        break;
      case "css-updated":
        this.theme.reloadStylesheet();
        break;
      case "float-always-on-top-enabled":
        if (!settings.get_boolean(settingName)) {
          this.cleanupAlwaysFloat();
        } else {
          this.restoreAlwaysFloat();
        }
        break;
      default:
        break;
    }
  }

  _onMinimizeChange(
    reason,
    { hideBorders = false, resetGrandparentIfEmpty = false, metaWindow = null } = {}
  ) {
    if (hideBorders) this.hideWindowBorders();
    // forge-43zk: reset the container of the window the signal is actually about,
    // not whatever holds the display focus — a background (un)minimize (dock,
    // self-minimize, wmctrl) would otherwise wipe the focused container's ratios.
    let changedNodeWindow = this.tree.findNode(metaWindow || this.focusMetaWindow);
    if (changedNodeWindow) {
      if (
        resetGrandparentIfEmpty &&
        this.tree.getTiledChildren(changedNodeWindow.parentNode.childNodes).length === 0
      ) {
        this.tree.resetSiblingPercent(changedNodeWindow.parentNode.parentNode);
      }
      this.tree.resetSiblingPercent(changedNodeWindow.parentNode);
    }
    this._renderWithFreezeState(reason);
  }

  floatingWindow(node) {
    if (!node) return false;
    return node.nodeType === NODE_TYPES.WINDOW && node.mode === WINDOW_MODES.FLOAT;
  }

  /**
   * Moves the pointer along with the nodeWindow's meta
   *
   * This is useful for making sure that Forge calculates the attachNode
   * properly
   */
  movePointerWith(...args) {
    return this.focusManager.movePointerWith(...args);
  }

  warpPointerToNodeWindow(...args) {
    return this.focusManager.warpPointerToNodeWindow(...args);
  }

  getPointer() {
    return global.get_pointer();
  }

  minimizedWindow(node) {
    if (!node) return false;
    return node._type === NODE_TYPES.WINDOW && node._data && node._data.minimized;
  }

  swapWindowsUnderPointer(...a) {
    return this.dragDrop.swapWindowsUnderPointer(...a);
  }

  _executeDropOperation(...a) {
    return this.dragDrop._executeDropOperation(...a);
  }

  _showDropPreview(...a) {
    return this.dragDrop._showDropPreview(...a);
  }

  _buildDropOperation(...a) {
    return this.dragDrop._buildDropOperation(...a);
  }

  /** Effective dnd-center-layout; STACKED → TABBED when stack mode off. */
  _resolveDndCenterLayout(...a) {
    return this.dragDrop._resolveDndCenterLayout(...a);
  }

  /** Preview/apply drag-drop tile under pointer. */
  moveWindowToPointer(...a) {
    return this.dragDrop.moveWindowToPointer(...a);
  }

  canMovePointerInsideNodeWindow(nodeWindow) {
    if (nodeWindow && nodeWindow._data) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      const pointerCoord = global.get_pointer();
      return (
        metaRect &&
        // xdg-copy creates a 1x1 pixel window to capture mouse events.
        metaRect.width > 8 &&
        metaRect.height > 8 &&
        !Utils.rectContainsPoint(metaRect, pointerCoord) &&
        !metaWindow.minimized &&
        !Main.overview.visible &&
        !this.pointerIsOverParentDecoration(nodeWindow, pointerCoord)
      );
    }
    return false;
  }

  pointerIsOverParentDecoration(nodeWindow, pointerCoord) {
    if (pointerCoord && nodeWindow && nodeWindow.parentNode) {
      let node = nodeWindow.parentNode;
      if (node.isStackedOrTabbed()) {
        return Utils.rectContainsPoint(node.rect, pointerCoord);
      }
    }
    return false;
  }

  getPointerPositionInside(nodeWindow) {
    if (nodeWindow && nodeWindow._data) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      // on: last position of cursor inside window
      // on: titlebar: near to app toolbars, menubar, tabs, etc...
      let [wx, wy] = nodeWindow.pointer
        ? [nodeWindow.pointer.x, nodeWindow.pointer.y]
        : [metaRect.width / 2, 8];
      let px = wx >= metaRect.width ? metaRect.width - 8 : wx;
      let py = wy >= metaRect.height ? metaRect.height - 8 : wy;
      return {
        x: metaRect.x + px,
        y: metaRect.y + py,
      };
    }
    return null;
  }

  storePointerLastPosition(nodeWindow) {
    // forge-s02h: this.lastFocusedWindow can point at a disposed Meta.Window
    // (focused window closed / app exited across suspend) whose wrapper keeps
    // _data truthy; guard liveness so get_frame_rect() can't throw.
    if (nodeWindow && nodeWindow._data && Utils.isWindowAlive(nodeWindow.nodeValue)) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      const pointerCoord = global.get_pointer();
      if (Utils.rectContainsPoint(metaRect, pointerCoord)) {
        let px = pointerCoord[0] - metaRect.x;
        let py = pointerCoord[1] - metaRect.y;
        if (px > 0 && py > 0) {
          nodeWindow.pointer = { x: px, y: py };
          Logger.debug(`stored pointer for [${metaWindow.get_title()}] at (${px},${py})`);
        }
      }
    }
  }

  /** Bug #151: pointer for drag target (touch/stylus vs mouse). */
  getDragPointer(...a) {
    return this.dragDrop.getDragPointer(...a);
  }

  findNodeWindowAtPointer(...a) {
    return this.dragDrop.findNodeWindowAtPointer(...a);
  }

  /**
   * Focus the window under the pointer and raise it.
   *
   * @returns {boolean} true if we should continue polling, false otherwise
   */
  _focusWindowUnderPointer() {
    return this.focusManager._focusWindowUnderPointer();
  }

  /**
   * Get the Meta.Window at the pointer coordinates
   *
   * @param {[number, number]} pointer x and y coordinates
   * @returns null if no window is found, otherwise the Meta.Window
   */
  _getMetaWindowAtPointer(pointer) {
    const windows = global.get_window_actors();
    const [x, y] = pointer;

    // Iterate through the windows in reverse order to get the top-most window
    for (let i = windows.length - 1; i >= 0; i--) {
      let window = windows[i];
      let metaWindow = window.meta_window;

      // Feature #396: Skip notification windows and other non-focusable types
      const windowType = metaWindow.get_window_type();
      if (
        windowType === Meta.WindowType.NOTIFICATION ||
        windowType === Meta.WindowType.POPUP_MENU ||
        windowType === Meta.WindowType.DROPDOWN_MENU
      ) {
        continue;
      }

      let { x: wx, y: wy, width, height } = metaWindow.get_frame_rect();

      // Check if the position is within the window bounds
      if (x >= wx && x <= wx + width && y >= wy && y <= wy + height) {
        return metaWindow;
      }
    }

    // No window found at the pointer
    return null;
  }

  /** Finds NodeWindow under pointer coords (uses sortedWindows snapshot). */
  _findNodeWindowAtPointer(...a) {
    return this.dragDrop._findNodeWindowAtPointer(...a);
  }

  _handleGrabOpBegin(...a) {
    return this.dragDrop._handleGrabOpBegin(...a);
  }

  _handleGrabOpEnd(...a) {
    return this.dragDrop._handleGrabOpEnd(...a);
  }

  _grabCleanup(...a) {
    return this.dragDrop._grabCleanup(...a);
  }

  allowDragDropTile(...a) {
    return this.dragDrop.allowDragDropTile(...a);
  }

  /**
   * forge-pak (#497): resize a tabbed/stacked container against its split
   * sibling. The grabbed tab's frame delta drives the change, applied to the
   * container's start slice (snapshotted at grab begin, with a fallback to the
   * current slice) so it persists on re-render instead of mutating an
   * overlapping tab's percent.
   */
  _resizeContainerAgainstSibling(container, grabbedWindow, currentRect, orientation, direction) {
    const parent = container.parentNode;
    if (!parent) return;
    const pair = this.tree.nextVisible(container, direction);
    if (!pair || pair.parentNode !== parent) return;
    if (this.tree.getTiledChildren(parent.childNodes).length <= 1) return;

    const startRect = container.initRect || container.rect;
    const pairRect = pair.rect;
    const parentRect = parent.rect;
    const startWin = grabbedWindow.initRect;
    if (!startRect || !pairRect || !parentRect || !startWin) return;

    if (orientation === ORIENTATION_TYPES.HORIZONTAL) {
      const changePx = currentRect.width - startWin.width;
      container.percent = (startRect.width + changePx) / parentRect.width;
      pair.percent = (pairRect.width - changePx) / parentRect.width;
    } else if (orientation === ORIENTATION_TYPES.VERTICAL) {
      const changePx = currentRect.height - startWin.height;
      container.percent = (startRect.height + changePx) / parentRect.height;
      pair.percent = (pairRect.height - changePx) / parentRect.height;
    } else {
      return;
    }
    container.userSized = true;
    pair.userSized = true;
    this._normalizeSiblingPercents(parent);
  }

  /**
   * forge-12f (gh-305): start-of-grab anchor for the resize pair. On X11
   * (observed on Mutter 48) one move_resize_frame emits SEVERAL size-changed
   * events, so _handleResizing runs multiple times per step with a CUMULATIVE
   * changePx. The focused window is anchored on its frozen initRect; the pair
   * must be anchored the same way, or every extra pass re-debits its live,
   * already-debited node rect and the slack drifts into the other siblings on
   * normalize (the opposite boundary moves). Snapshots live on the focus node
   * and are released with the grab in _grabCleanup.
   */
  _pairInitRect(focusNodeWindow, resizePairForWindow) {
    if (!focusNodeWindow.pairInitRects) focusNodeWindow.pairInitRects = new Map();
    let init = focusNodeWindow.pairInitRects.get(resizePairForWindow);
    if (!init) {
      init = { ...resizePairForWindow.rect };
      focusNodeWindow.pairInitRects.set(resizePairForWindow, init);
    }
    return init;
  }

  _handleResizing(focusNodeWindow) {
    if (!focusNodeWindow || focusNodeWindow.isFloat()) return;
    let grabOps = Utils.decomposeGrabOp(this.grabOp);
    for (let grabOp of grabOps) {
      let initGrabOp = focusNodeWindow.initGrabOp;
      let direction = Utils.directionFromGrab(grabOp);
      let orientation = Utils.orientationFromGrab(grabOp);
      let parentNodeForFocus = focusNodeWindow.parentNode;
      let position = Utils.positionFromGrabOp(grabOp);
      // normalize the rect without gaps
      let frameRect = this.focusMetaWindow.get_frame_rect();
      let gaps = this.calculateGaps(focusNodeWindow);
      let currentRect = Utils.removeGapOnRect(frameRect, gaps);
      let firstRect;
      let secondRect;
      let parentRect;
      let resizePairForWindow;

      if (initGrabOp === Meta.GrabOp.RESIZING_UNKNOWN) {
        // the direction is null so do not process yet below.
        return;
      }

      // Bug #497 (forge-pak): a window inside a tabbed/stacked container shares
      // the container's rect, so a sibling tab is never a meaningful resize pair
      // (its percent is ignored on render). Resize the enclosing container
      // against ITS split sibling instead; the grabbed tab's frame delta equals
      // the container's.
      let tabbedContainer = focusNodeWindow;
      while (tabbedContainer.parentNode && tabbedContainer.parentNode.isStackedOrTabbed()) {
        tabbedContainer = tabbedContainer.parentNode;
      }
      if (tabbedContainer !== focusNodeWindow) {
        this._resizeContainerAgainstSibling(
          tabbedContainer,
          focusNodeWindow,
          currentRect,
          orientation,
          direction
        );
        continue;
      }

      resizePairForWindow = this.tree.nextVisible(focusNodeWindow, direction);

      let sameParent = resizePairForWindow
        ? resizePairForWindow.parentNode === focusNodeWindow.parentNode
        : false;

      // forge-0dhz: the horizontal and vertical resize math is identical except
      // for which rect dimension is read/divided by, so key it on sizeKey instead
      // of duplicating ~70 lines per axis. An unknown orientation still falls
      // through to _repositionDuringResize untouched (no final else).
      if (
        orientation === ORIENTATION_TYPES.HORIZONTAL ||
        orientation === ORIENTATION_TYPES.VERTICAL
      ) {
        const sizeKey = orientation === ORIENTATION_TYPES.HORIZONTAL ? "width" : "height";
        if (sameParent) {
          // use the window or con pairs
          if (this.tree.getTiledChildren(parentNodeForFocus.childNodes).length <= 1) {
            return;
          }

          firstRect = focusNodeWindow.initRect;
          if (resizePairForWindow) {
            // Find a valid (non-floating, non-minimized) resize pair
            let candidatePair = resizePairForWindow;
            while (
              candidatePair &&
              (this.floatingWindow(candidatePair) || this.minimizedWindow(candidatePair))
            ) {
              candidatePair = this.tree.nextVisible(candidatePair, direction);
            }
            if (
              candidatePair &&
              !this.floatingWindow(candidatePair) &&
              !this.minimizedWindow(candidatePair)
            ) {
              resizePairForWindow = candidatePair;
              secondRect = this._pairInitRect(focusNodeWindow, resizePairForWindow);
            }
          }

          if (!firstRect || !secondRect) {
            return;
          }

          parentRect = parentNodeForFocus.rect;
          let changePx = currentRect[sizeKey] - firstRect[sizeKey];
          let firstPercent = (firstRect[sizeKey] + changePx) / parentRect[sizeKey];
          let secondPercent = (secondRect[sizeKey] - changePx) / parentRect[sizeKey];
          focusNodeWindow.percent = firstPercent;
          resizePairForWindow.percent = secondPercent;
          focusNodeWindow.userSized = true;
          resizePairForWindow.userSized = true;
          // Bug #305 fix: Normalize to prevent drift
          this._normalizeSiblingPercents(parentNodeForFocus);
        } else {
          // use the parent pairs (con to another con or window)
          if (resizePairForWindow && resizePairForWindow.parentNode) {
            if (this.tree.getTiledChildren(resizePairForWindow.parentNode.childNodes).length <= 1) {
              return;
            }
            let firstWindowRect = focusNodeWindow.initRect;
            let index = resizePairForWindow.index;
            if (position === POSITION.BEFORE) {
              // Find the opposite node
              index = index + 1;
            } else {
              index = index - 1;
            }
            parentNodeForFocus = resizePairForWindow.parentNode.childNodes[index];
            // index = resizePairForWindow.index ± 1 can land at -1 or past the end
            // at a parent boundary; childNodes[index] is then undefined and the
            // .rect read below throws inside the live size-changed handler
            // (forge-34c6). Bail before dereferencing.
            if (!parentNodeForFocus) return;
            firstRect = parentNodeForFocus.rect;
            secondRect = resizePairForWindow.rect;
            if (!firstRect || !secondRect) {
              return;
            }

            parentRect = parentNodeForFocus.parentNode.rect;
            let changePx = currentRect[sizeKey] - firstWindowRect[sizeKey];
            let firstPercent = (firstRect[sizeKey] + changePx) / parentRect[sizeKey];
            let secondPercent = (secondRect[sizeKey] - changePx) / parentRect[sizeKey];
            parentNodeForFocus.percent = firstPercent;
            resizePairForWindow.percent = secondPercent;
            parentNodeForFocus.userSized = true;
            resizePairForWindow.userSized = true;
            // Bug #305 fix: Normalize to prevent drift
            this._normalizeSiblingPercents(parentNodeForFocus.parentNode);
          }
        }
      }
    }
    // Reposition focused window to prevent "traveling" during resize
    this._repositionDuringResize(focusNodeWindow);
  }

  /**
   * Repositions the focused window during resize to prevent "traveling".
   * Uses initRect as reference to calculate correct position based on which
   * edge is being dragged.
   */
  _repositionDuringResize(focusNodeWindow) {
    if (!focusNodeWindow || !focusNodeWindow.initRect) return;

    const metaWindow = focusNodeWindow.nodeValue;
    if (!metaWindow) return;

    const frameRect = metaWindow.get_frame_rect();
    const initRect = focusNodeWindow.initRect;
    const gaps = this.calculateGaps(focusNodeWindow);

    let grabOps = Utils.decomposeGrabOp(this.grabOp);
    let targetX = frameRect.x;
    let targetY = frameRect.y;

    for (const grabOp of grabOps) {
      const position = Utils.positionFromGrabOp(grabOp);
      const orientation = Utils.orientationFromGrab(grabOp);

      if (orientation === ORIENTATION_TYPES.HORIZONTAL) {
        if (position === POSITION.AFTER) {
          // Resizing right edge - x should stay fixed at initRect.x + gaps
          targetX = initRect.x + gaps;
        } else if (position === POSITION.BEFORE) {
          // Resizing left edge - x should adjust based on width change
          // initRect.x is without gaps, so add gaps for actual position
          targetX = initRect.x + gaps - (frameRect.width - (initRect.width - gaps * 2));
        }
      } else if (orientation === ORIENTATION_TYPES.VERTICAL) {
        if (position === POSITION.AFTER) {
          // Resizing bottom edge - y should stay fixed at initRect.y + gaps
          targetY = initRect.y + gaps;
        } else if (position === POSITION.BEFORE) {
          // Resizing top edge - y should adjust based on height change
          targetY = initRect.y + gaps - (frameRect.height - (initRect.height - gaps * 2));
        }
      }
    }

    // Only reposition if position actually differs
    if (targetX !== frameRect.x || targetY !== frameRect.y) {
      metaWindow.move_frame(true, targetX, targetY);
    }
  }

  _handleMoving(...a) {
    return this.dragDrop._handleMoving(...a);
  }

  /**
   * Whether a window's WM class matches an override's wmClass value. The override may
   * list several classes comma-separated; each is compared for exact equality.
   */
  _wmClassMatches(overrideWmClass, windowWmClass) {
    if (!overrideWmClass || !windowWmClass) return false;
    return overrideWmClass.split(",").some((c) => c.trim() === windowWmClass);
  }

  // Classify matching TILE overrides by specificity (forge-jbkg):
  //  - "specific" = targets this exact window via wmTitle or wmId (explicit intent)
  //  - "class-only" = matches on wmClass alone, so it matches EVERY window of the
  //    class — including the dialogs/transients/non-resizable windows the bundled
  //    config (Chrome, Evolution, Anki, ...) never meant to force into the grid.
  _classifyTileOverrides(metaWindow) {
    // Bug #294 fix: Check for explicit TILE override first (user preference takes precedence)
    const windowTitle = metaWindow.get_title();
    const wmClass = metaWindow.get_wm_class();
    const wmId = metaWindow.get_id();
    const allOverrides = this.windowProps.overrides;

    let hasSpecific = false;
    let hasClassOnly = false;
    for (const override of allOverrides) {
      if (override.mode !== "tile") continue;

      let matchTitle = true;
      let matchClass = true;
      let matchId = true;

      if (override.wmTitle) {
        matchTitle = windowTitle && windowTitle.includes(override.wmTitle);
      }
      if (override.wmClass) {
        matchClass = this._wmClassMatches(override.wmClass, wmClass);
      }
      if (override.wmId) {
        matchId = override.wmId === wmId;
      }

      if (!(matchTitle && matchClass && matchId)) continue;

      if (override.wmTitle || override.wmId) {
        hasSpecific = true;
      } else {
        hasClassOnly = true;
      }
    }

    return { hasSpecific, hasClassOnly };
  }

  /**
   * Whether a single float override (`kf`) matches `metaWindow`. Shared by
   * _matchesFloatOverride and _matchesSpecificFloatOverride so the per-rule
   * title/class/id matching logic lives in exactly one place (DRY).
   */
  _matchesFloatRule(kf, metaWindow) {
    const windowTitle = metaWindow.get_title();
    let matchTitle = false;
    let matchClass = false;
    let matchId = false;

    if (kf.wmTitle) {
      if (kf.wmTitle === " ") {
        matchTitle = kf.wmTitle === windowTitle;
      } else {
        // forge-11k: titles are matched by substring (.includes), never exact,
        // so lowercasing both sides is safe and gives locale/casing fidelity for
        // titles like "Picture-in-Picture". The !-negation and comma-split are
        // preserved.
        const haystack = windowTitle ? windowTitle.toLowerCase() : windowTitle;
        let titles = kf.wmTitle.split(",");
        matchTitle =
          titles.filter((t) => {
            if (windowTitle) {
              if (t.startsWith("!")) {
                return !haystack.includes(t.slice(1).toLowerCase());
              } else {
                return haystack.includes(t.toLowerCase());
              }
            }
            return false;
          }).length > 0;
      }
    }
    if (kf.wmClass) {
      matchClass = this._wmClassMatches(kf.wmClass, metaWindow.get_wm_class());
    }
    if (kf.wmId) {
      matchId = kf.wmId === metaWindow.get_id();
    }

    // Bug #172 fix: If override has wmId (per-window), REQUIRE it to match
    // If no wmId (class-based), match all windows of that class
    if (kf.wmId) {
      return matchId && matchClass;
    }
    // forge-n29i: a class-less float rule must be allowed to match on title
    // alone — when wmClass is absent, don't require matchClass. A rule with no
    // criteria at all (no wmClass, no wmTitle, no wmId) must match nothing.
    if (!kf.wmClass) {
      return Boolean(kf.wmTitle) && matchTitle;
    }
    return (!kf.wmTitle || matchTitle) && matchClass;
  }

  _matchesFloatOverride(metaWindow) {
    return this.windowProps.overrides.some(
      (kf) => kf.mode === "float" && this._matchesFloatRule(kf, metaWindow)
    );
  }

  // forge-11k: true iff some float override that carries a wmTitle OR wmId (i.e.
  // targets this specific window, not a bare class) matches. Lets a per-title PIP
  // float rule beat a bundled class-only tile rule for Chrome/Brave/Chromium.
  _matchesSpecificFloatOverride(metaWindow) {
    return this.windowProps.overrides.some(
      (kf) =>
        kf.mode === "float" && (kf.wmTitle || kf.wmId) && this._matchesFloatRule(kf, metaWindow)
    );
  }

  /**
   * Whether a title notify should full re-tile (empty→real, or title-scoped
   * overrides). Path/prompt spam with a stable non-empty title is a no-op.
   */
  _titleChangeNeedsRetile(metaWindow) {
    if (!metaWindow) return false;
    const title = metaWindow.get_title();
    const prev = metaWindow._forgeTitleForRetile;
    // Unseeded (tests calling helper directly): seed and re-eval once.
    if (prev === undefined) {
      metaWindow._forgeTitleForRetile = title;
      return true;
    }
    if (title === prev) return false;
    metaWindow._forgeTitleForRetile = title;

    const prevEmpty = prev === null || prev === undefined || prev === "";
    const nextEmpty = title === null || title === undefined || title === "";
    if (prevEmpty !== nextEmpty) return true;

    // Title-scoped float/tile overrides can flip without empty↔non-empty.
    const overrides = this.windowProps?.overrides;
    if (!overrides || overrides.length === 0) return false;
    return overrides.some((kf) => {
      if (!kf.wmTitle) return false;
      if (kf.wmClass && !this._wmClassMatches(kf.wmClass, metaWindow.get_wm_class())) {
        return false;
      }
      // Policy can flip only if match status vs this rule changed.
      const matchPrev = this._titleMatchesOverride(kf.wmTitle, prev);
      const matchNext = this._titleMatchesOverride(kf.wmTitle, title);
      return matchPrev !== matchNext;
    });
  }

  /** Substring title match used by override rules (includes / !negation). */
  _titleMatchesOverride(wmTitleRule, windowTitle) {
    if (!wmTitleRule) return false;
    if (wmTitleRule === " ") return wmTitleRule === windowTitle;
    if (!windowTitle) return false;
    const haystack = windowTitle.toLowerCase();
    return wmTitleRule.split(",").some((t) => {
      if (t.startsWith("!")) {
        return !haystack.includes(t.slice(1).toLowerCase());
      }
      return haystack.includes(t.toLowerCase());
    });
  }

  /**
   * Whether a wm-class notify should full re-tile. Late null→real still tiles
   * once (#482); same-class re-notify does not storm.
   */
  _wmClassChangeNeedsRetile(metaWindow) {
    if (!metaWindow) return false;
    const cls = metaWindow.get_wm_class();
    const prev = metaWindow._forgeWmClassForRetile;
    if (prev === undefined) {
      metaWindow._forgeWmClassForRetile = cls;
      return true;
    }
    if (cls === prev) return false;
    metaWindow._forgeWmClassForRetile = cls;
    return true;
  }

  isFloatingExempt(metaWindow) {
    if (!metaWindow) return true;
    let windowTitle = metaWindow.get_title();
    let windowType = metaWindow.get_window_type();

    const { hasSpecific, hasClassOnly } = this._classifyTileOverrides(metaWindow);

    // App-specific float rules (Steam #271, Blender #260, Firefox PIP #383) live in
    // config/windows.json — the canonical override mechanism — rather than hardcoded here,
    // so they stay user-editable and don't contradict the config (forge-khb).

    // forge-jbkg: windows that float because of their TYPE/role (dialogs,
    // modals, transients, overlays) — as opposed to merely being non-resizable.
    // A bare class-only tile rule (e.g. the bundled "evolution"/"Google-chrome"
    // rules) must NOT drag these into the tile grid; an explicit per-title/per-id
    // tile rule still can. A non-resizable NORMAL window (e.g. Neovide, Bug #294)
    // is not type-floated, so a class-only tile rule still tiles it.
    let floatByRole =
      windowType === Meta.WindowType.DIALOG ||
      windowType === Meta.WindowType.MODAL_DIALOG ||
      metaWindow.get_transient_for() !== null ||
      metaWindow.get_wm_class() === null ||
      windowTitle === null ||
      windowTitle === "" ||
      windowTitle.length === 0 ||
      // Bug #469 (forge-w7e): a window the user pins "Always on Top" is a
      // Z-axis overlay; float it out of the tile grid (Forge only pins windows
      // it already floats, so tiled windows are unaffected until the user acts).
      // forge-ph7f: skip the transient pin Forge sets during focus navigation,
      // otherwise rapid focus float-ejects tiled windows and they overlap.
      (metaWindow.is_above() && !metaWindow._forgeTransientAbove) ||
      // forge-yyum: a window the USER pinned "Always on Visible Workspace" is shown
      // on every workspace by Mutter, but the tree can only home it under one
      // workspace's container — leaving it tiled churns layouts as it is re-homed
      // onto each active workspace. Treat it as an overlay and float it, mirroring
      // the Always-on-Top rule above; un-pinning re-tiles it.
      // forge-16ms: test the user PIN (is_always_on_all_workspaces), NOT the
      // effective sticky state (is_on_all_workspaces). Under the GNOME default
      // workspaces-only-on-primary=true, Mutter makes every window on a NON-primary
      // monitor implicitly sticky with no user intent — using the effective state
      // float-ejected all such windows, so nothing ever tiled on secondary monitors.
      Compat.isAlwaysOnAllWorkspaces(metaWindow);

    let floatByType = floatByRole || !metaWindow.allows_resize();

    // forge-jbkg: explicit per-title/per-id tile intent always wins; a bare
    // class-only tile rule tiles ordinary windows of the class but leaves the
    // class's dialogs/transients/overlays to float by role.
    if (hasSpecific) return false;

    // forge-11k: a per-title/per-id float override beats a BARE class-only tile
    // rule. Checked AFTER hasSpecific (so an explicit per-title/per-id TILE still
    // force-tiles) but BEFORE the bare class-only tile check below — this is what
    // lets a "Picture-in-Picture" float rule win over the bundled class-only tile
    // rules for Chrome/Brave/Chromium.
    if (this._matchesSpecificFloatOverride(metaWindow)) return true;

    if (hasClassOnly && !floatByRole) return false;

    return floatByType || this._matchesFloatOverride(metaWindow);
  }

  _getDragDropCenterPreviewStyle(...a) {
    return this.dragDrop._getDragDropCenterPreviewStyle(...a);
  }

  get currentMonWsNode() {
    const monWs = this.currentMonWs;
    if (monWs) {
      return this.tree.findNode(monWs);
    }
    return null;
  }

  get currentWsNode() {
    const ws = this.currentWs;
    if (ws) {
      return this.tree.findNode(ws);
    }
    return null;
  }

  get currentMonWs() {
    const monWs = `${this.currentMon}${this.currentWs}`;
    return monWs;
  }

  get currentWs() {
    const display = global.display;
    const wsMgr = display.get_workspace_manager();
    return `ws${wsMgr.get_active_workspace_index()}`;
  }

  get currentMon() {
    const display = global.display;
    return `mo${display.get_current_monitor()}`;
  }

  /**
   * Reload window overrides from the configuration file
   * This is called when the preferences page modifies the overrides
   */
  /**
   * Reload window overrides from the configuration file.
   * @param {boolean} pruneStaleWmId - When true (startup), drop per-window (wmId)
   *   overrides whose ids are stale from a prior session. Runtime reloads (prefs
   *   edits, ConfigReload) pass false so live FloatToggle'd overrides survive (forge-8rm6).
   */
  reloadWindowOverrides(pruneStaleWmId = true) {
    // Get fresh data from the ConfigManager
    const freshProps = this.ext.configMgr.windowProps;
    if (freshProps) {
      this.windowProps = freshProps;
      if (pruneStaleWmId) {
        const beforeLength = this.windowProps.overrides.length;
        this.windowProps.overrides = this.windowProps.overrides.filter(
          (override) => !override.wmId
        );
        // forge-6c0e: persist the prune. configMgr.windowProps re-reads the file on
        // every access, so a cache-only prune is undone by the first
        // _updateWindowOverrides (window close / float toggle), which reads the
        // still-unpruned file back into the cache and resurrects every stale wmId row.
        if (this.windowProps.overrides.length !== beforeLength) {
          this.ext.configMgr.windowProps = this.windowProps;
        }
      }
      Logger.info(`Reloaded ${this.windowProps.overrides.length} window overrides from file`);
    }
  }

  floatAllWindows() {
    this.tree.getNodeByType(NODE_TYPES.WINDOW).forEach((w) => {
      if (w.isFloat()) {
        w.prevFloat = true;
      }
      w.mode = WINDOW_MODES.FLOAT;
    });
  }

  unfloatAllWindows() {
    this.tree.getNodeByType(NODE_TYPES.WINDOW).forEach((w) => {
      if (!w.prevFloat) {
        w.mode = WINDOW_MODES.TILE;
      } else {
        // Reset the float marker
        w.prevFloat = false;
      }
    });
  }
}
