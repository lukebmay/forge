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
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

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
import { forgeConfigDir } from "../shared/forge-config-home.js";
import { CommandHandler } from "./command.js";
import { DecorationManager } from "./decoration.js";
import { DragDropManager, collectDragDropTargetMetaWindows } from "./drag-drop.js";
import { FocusManager } from "./focus.js";
import {
  afterFocus as afterFocusPipeline,
  commitLayout as commitLayoutPipeline,
  settleTabFocus as settleTabFocusPipeline,
  revealGroupChild as revealGroupChildPipeline,
} from "./action-pipeline.js";
import { SessionLayoutRestoreManager } from "./session-layout-restore.js";
import {
  ENTERED_MONITOR_REHOME_DEFER_MS,
  MonitorRecoveryManager,
  safeMoveToMonitor,
} from "./monitor-recovery.js";
import { LayoutController, glibSchedule, glibCancel } from "./layout-controller.js";
import { SourceBag, glibIdleSchedule } from "./sources.js";
import { WindowAttach } from "./window-attach.js";
import { SignalBag, disconnectSignals } from "./signals.js";
import { SuppressFlag } from "./suppress.js";
import { LayoutBatchDepth } from "./layout-batch-depth.js";
import { OpenCommitManager } from "./open-commit-manager.js";
import {
  AppThrashCatalog,
  extractWmClass,
  parseSettleHeuristicsJson,
} from "./app-thrash-catalog.js";
import {
  LAYOUT_OPEN_LEAF_PIN_MS,
  layoutOpenLeafPinActive,
  makeLayoutOpenLeafPin,
  shouldRestoreLayoutOpenLeaf,
} from "./layout-open-leaf-pin.js";
import { pickFocusAfterClose } from "./focus-after-close.js";
import {
  isForgeCausedGeometrySignal,
  shouldChromeOnlyGeometry,
  shouldRestoreTileSlot,
  LAYOUT_VERIFY_EPSILON_PX,
} from "./layout-sensors.js";
import { LayoutCommandEpoch } from "./layout-epoch.js";
import {
  executeIsolateThrash,
  executeRemovePlaceholder,
  isPlaceholderNode,
  PLACEHOLDER_ISOLATE_LAYOUT_REASON,
  PLACEHOLDER_REMOVE_LAYOUT_REASON,
  shouldSkipThrashIsolate,
} from "./layout-placeholder.js";
import { computeOpenMinQuietMs, isFirstOpenOfClass } from "./layout-open.js";
import {
  createDeferredOpenStore,
  hideDeferredActor,
  isDeferredOpen,
  markDeferredOpen,
  rehideDeferredIfNeeded,
  shouldDeferHiddenOpen,
  shouldStickyMoveHomeMonitor,
  showDeferredActor,
  takeAllDeferredOpens,
  takeDeferredOpen,
} from "./layout-deferred-open.js";
import { LayoutDebugOverlay } from "./layout-debug-overlay.js";
import { LayoutApplyChrome } from "./layout-apply-chrome.js";
import * as Compat from "./compat.js";
import {
  LftMru,
  aspectOrientationFromRect,
  isTabOrStackParent,
  shouldTabInsteadOfSplit,
  resolveOpenAppPlacement,
  matchPendingDockLaunch,
  monitorIndexFromPoint,
  DOCK_LAUNCH_TTL_MS,
  DOCK_STICKY_GRACE_MS,
} from "./lft-mru.js";
import {
  consumePlaceHint,
  enqueuePlaceHint,
  metaWmClass,
  normalizePlaceHint,
  pruneExpiredPlaceHints,
  resolvePlaceMonitorIndex,
} from "./place-hint.js";
import { parseSelector, matchNodes, matchWindows, pickMatch } from "./tile-select.js";
import * as MonitorIdentity from "./monitor-identity.js";
import { applyOneZoomPerMonitor, resolveZoomToggle } from "./zoom.js";

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
    // for live thrash checks (entered-monitor / monitor-recovery consult them).
    this.sessionLayoutRestore = new SessionLayoutRestoreManager(this._tree, this);
    // Owns workareas settle + monitor-recovery (H1). Thrash/last-good flags stay on WM.
    this.monitorRecovery = new MonitorRecoveryManager(this._tree, this);
    // CL3/SE6: thrash catalog; seed geom minQuiet once from settle-heuristics.
    this.appThrashCatalog = new AppThrashCatalog();
    this._seedThrashCatalogFromSettleHeuristics();
    // CL0–CL6: debounced layout/verify (sensor-only) + optional debug interval.
    this.layoutController = new LayoutController(this, {
      catalog: this.appThrashCatalog,
    });
    // AC2: per-window command echo epochs (post-apply residual attribution).
    this.layoutEpoch = new LayoutCommandEpoch();
    this._syncLayoutVerifyInterval();
    // CL4 / L8: per-window open quiet → one layout commit (open = batch N=1).
    /** Injectable for unit tests (installOpenFakeClock). */
    this._openCommitSchedule = glibSchedule;
    this._openCommitCancel = glibCancel;
    this._openCommit = new OpenCommitManager({
      schedule: (delayMs, cb) => this._openCommitSchedule(delayMs, cb),
      cancel: (id) => this._openCommitCancel(id),
      onFire: (mw) => this._fireOpenCommit(mw),
    });
    // L1 W1: WM-global timers (queue, renderTree, settle, …). cancelAll on disable;
    // do not dispose (bag lives across enable cycles like open-commit).
    /** Injectable for unit tests. */
    this._wmSchedule = glibSchedule;
    this._wmCancel = glibCancel;
    this._wmScheduleIdle = glibIdleSchedule;
    this._wmSources = new SourceBag({
      label: "wm",
      schedule: (delayMs, cb) => this._wmSchedule(delayMs, cb),
      cancel: (id) => this._wmCancel(id),
      scheduleIdle: (cb) => this._wmScheduleIdle(cb),
    });
    // W5: WM-global GObject signals (display/wm/wsm/settings/overview).
    // disconnectAll on disable; do not dispose (re-bind on enable).
    this._wmSignals = new SignalBag({ label: "wm" });
    // L4 W2: per-window Lifetime bags (Wayland stack-pin slot "stack", …).
    // dispose(mw) on unmanaged; disposeAll on disable. Reuses WM inject.
    this._windowAttach = new WindowAttach({
      label: "wm-window",
      schedule: (delayMs, cb) => this._wmSchedule(delayMs, cb),
      cancel: (id) => this._wmCancel(id),
      scheduleIdle: (cb) => this._wmScheduleIdle(cb),
    });
    // CL5 / L11: multi-open layout batch depth + deferred-commit latch.
    this._layoutBatch = new LayoutBatchDepth();
    // Layout focus pins: CON → { meta, until } open leaf (Chrome late activate).
    /** @type {WeakMap<object, { meta: object, until: number }>} */
    this._layoutOpenLeafPins = new WeakMap();
    // CL8: will-tile maps during LayoutBatch stay FLOAT+hidden until release.
    this._deferredOpenStore = createDeferredOpenStore();
    // Owns grab-tile / drag-drop. grabOp, _draggedNodeWindow, freeze stay on WM.
    this.dragDrop = new DragDropManager(this._tree, this);
    this.layoutDebugOverlay = new LayoutDebugOverlay(this);
    // CL10: optional LayoutBatch dim scrim (default off; hard-clears ≤8s).
    this.layoutApplyChrome = new LayoutApplyChrome(this);
    this.eventQueue = new Queue();
    this.theme = this.ext.theme;
    this.lastFocusedWindow = null;
    // FC2: after explicit unfocus, skip hover-refocus of this Meta until pointer leaves.
    this._unfocusHoverSuppressMeta = null;
    // OP1: global + per-monitor last-focused-tile MRU (floats never enter).
    this.lftMru = new LftMru();
    /** @type {Array<{ monitor: number, appId?: string|null, ts: number }>} */
    this._pendingDockLaunches = [];
    /** @type {import('./place-hint.js').PlaceHint[]} FC2 PlaceNext one-shots */
    this._pendingPlaceHints = [];
    this._dockLaunchHooked = false;
    this.shouldFocusOnHover = this.ext.settings.get_boolean("focus-on-hover-enabled");

    this._commandHandler = new CommandHandler(this);

    // Last quiet placement per Meta.Window (monitor index + frame) for monitor-recovery.
    this._lastGoodHomes = new WeakMap();
    // R016: last quiet workareas fingerprint (no-op short-circuit).
    this._lastQuietWorkareasFp = null;
    this._workareasThrashPending = false;
    /** @type {number} monotonic µs — suppress entered-monitor after display settle */
    this._displayReconfigGraceUntilUs = 0;
    // unlock-dialog: tree stays loaded; Meta/DPMS thrash must not monitor-recovery.
    this._sessionLocked = false;
    // After unlock, use longer workareas settle (colord / dual-head probe).
    this._unlockWorkareasSettleBoost = false;
    // Session restore: suppress entered-monitor rehome; monitor-recovery defers until clear.
    this._sessionLayoutRestoring = false;
    // L5: nestable suppress (throw-safe). Readers must use `.active` (object is always truthy).
    this._suppressRehome = new SuppressFlag({ label: "rehome" });
    this._suppressGeom = new SuppressFlag({ label: "geom" });
    this._suppressAbove = new SuppressFlag({ label: "above" });
    // CT1: skeleton→bind wave; suppress entered-monitor rehome until binds settle.
    this._layoutBindPending = false;
    // After restore: hold liveForest so thrash monitor-recovery cannot snapshot a broken tree.
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

    // Paced drain: one event per interval. SourceBag is one-shot, so re-arm
    // while the queue still has work (same effect as the old return-true GLib loop).
    if (!this._wmSources.has("queue")) {
      const drain = () => {
        const currEventObj = this.eventQueue.dequeue();
        if (currEventObj) {
          try {
            currEventObj.callback();
          } catch (e) {
            // Bug #531: throw must not wedge the queue forever.
            Logger.warn(`queueEvent: ${currEventObj.name} callback failed: ${e}`);
          }
        }
        if (this.eventQueue.length !== 0) {
          this._wmSources.set("queue", interval, drain);
        }
      };
      this._wmSources.set("queue", interval, drain);
    }
  }

  /**
   * This is the central place to bind all the non-window signals.
   */
  _bindSignals() {
    if (this._signalsBound) return;

    const display = global.display;
    const shellWm = global.window_manager;
    const globalWsm = global.workspace_manager;
    const bag = this._wmSignals;
    const gDisplay = { group: "display" };
    const gWm = { group: "windowManager" };
    const gWsm = { group: "workspaceManager" };
    const gSettings = { group: "settings" };
    const gOverview = { group: "overview" };

    bag.connect(display, "window-created", this.trackWindow.bind(this), gDisplay);
    bag.connect(display, "grab-op-begin", this._handleGrabOpBegin.bind(this), gDisplay);
    bag.connect(
      display,
      "window-entered-monitor",
      this._onWindowEnteredMonitor.bind(this),
      gDisplay
    );
    bag.connect(display, "grab-op-end", this._handleGrabOpEnd.bind(this), gDisplay);
    bag.connect(
      display,
      "showing-desktop-changed",
      () => {
        this.hideWindowBorders();
        this.updateDecorationLayout();
      },
      gDisplay
    );
    bag.connect(
      display,
      "in-fullscreen-changed",
      () => {
        // forge-zo4: renderTree's pipeline reconciles fullscreen float demotion
        // (after processFloats), so floats drop below a newly-fullscreen window.
        this.renderTree("full-screen-changed");
      },
      gDisplay
    );
    bag.connect(display, "workareas-changed", this._onWorkareasChanged.bind(this), gDisplay);

    bag.connect(
      shellWm,
      "minimize",
      (_shellwm, actor) =>
        this._onMinimizeChange("minimize", {
          hideBorders: true,
          resetGrandparentIfEmpty: true,
          metaWindow: actor?.meta_window,
        }),
      gWm
    );
    bag.connect(
      shellWm,
      "unminimize",
      (_shellwm, actor) => this._onMinimizeChange("unminimize", { metaWindow: actor?.meta_window }),
      gWm
    );
    bag.connect(
      shellWm,
      "show-tile-preview",
      (_, _metaWindow, _rect, _num) => {
        // Empty
      },
      gWm
    );

    bag.connect(
      globalWsm,
      "showing-desktop-changed",
      () => {
        this.hideWindowBorders();
        this.updateDecorationLayout();
      },
      gWsm
    );
    bag.connect(
      globalWsm,
      "workspace-added",
      (_, wsIndex) => {
        // If a node with this index already exists, shift existing nodes up first
        if (this.tree.findNode(`ws${wsIndex}`)) {
          this.tree.workspaceManager.renumberWorkspacesAfterAddition(wsIndex);
        }
        this.tree.addWorkspace(wsIndex);
        this.trackCurrentMonWs();
        this.workspaceAdded = true;
        this.renderTree("workspace-added");
      },
      gWsm
    );
    bag.connect(
      globalWsm,
      "workspace-removed",
      (_, wsIndex) => {
        // forge-ojew: re-home surviving windows off the doomed workspace BEFORE
        // removeChild splices the subtree out, otherwise they are stranded.
        this._rehomeWorkspaceWindowsBeforeRemoval(wsIndex);
        this.tree.removeWorkspace(wsIndex);
        this.tree.workspaceManager.renumberWorkspacesAfterRemoval(wsIndex);
        this.trackCurrentMonWs();
        this.workspaceRemoved = true;
        this.updateDecorationLayout();
        this.renderTree("workspace-removed");
      },
      gWsm
    );
    // forge-2s5b: reorder_workspace() renumbers workspace indices WITHOUT
    // emitting workspace-added/removed or per-window workspace-changed, so the
    // tree's index-keyed nodes (ws{n}, mo{m}ws{n}) go stale and point at the
    // wrong Meta workspaces. The reorder signal carries no permutation args, so
    // a targeted rekey would need identity tracking; instead reload the tree,
    // which rebuilds the index-keyed scaffold from live workspace indices and
    // re-homes every window by its current workspace. Reorders are rare, so the
    // reload cost is acceptable (same recovery path as the no-meta-monws case).
    bag.connect(
      globalWsm,
      "workspaces-reordered",
      () => {
        // forge-gw2c: a reorder permutes index<->object with no add/remove signal,
        // leaving the index-keyed signal map stale (bindWorkspaceSignals then
        // early-returns for every index, so reload alone never rebinds it). Tear the
        // map down first — object-anchored disconnect makes this reliable — then the
        // reload rebinds each workspace against its current index.
        this.tree.workspaceManager.destroy();
        this.reloadTree("workspaces-reordered");
      },
      gWsm
    );
    bag.connect(
      globalWsm,
      "active-workspace-changed",
      () => {
        // Bug #374 fix: Set flag to prevent focus jumping during workspace transitions
        this._workspaceChanging = true;
        this.hideWindowBorders();
        this.trackCurrentMonWs();
        this.updateDecorationLayout();
        this.renderTree("active-workspace-changed");
        // Clear previous timer to avoid races on rapid workspace switches
        this._wmSources.set("workspaceChanging", 300, () => {
          this._workspaceChanging = false;
        });
      },
      gWsm
    );

    let numberOfWorkspaces = globalWsm.get_n_workspaces();

    for (let i = 0; i < numberOfWorkspaces; i++) {
      let workspace = globalWsm.get_workspace_by_index(i);
      this.bindWorkspaceSignals(workspace);
    }

    let settings = this.ext.settings;

    bag.connect(
      settings,
      "changed",
      (_, settingName) => this._onSettingsChanged(settingName),
      gSettings
    );

    bag.connect(
      Main.overview,
      "hiding",
      () => {
        this.fromOverview = true;
        const eventObj = {
          name: "focus-after-overview",
          callback: () => {
            const focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
            this.afterFocus(focusNodeWindow, { source: "overview" });
          },
        };
        this.queueEvent(eventObj);
      },
      gOverview
    );
    bag.connect(
      Main.overview,
      "showing",
      () => {
        this.toOverview = true;
      },
      gOverview
    );

    this._signalsBound = true;
  }

  /**
   * window-entered-monitor: re-home unless thrash, restore, or post-restore shield.
   * R017: rehomes are deferred briefly so ApplyMonitorsConfig can arm thrash-pending
   * (Mutter often fires entered-monitor before geometry/workareas update).
   */
  _onWindowEnteredMonitor(_display, monitor, metaWindow) {
    // Thrash / session restore / shield / mid-apply: restore forest owns placement.
    // apply→move_resize can spuriously fire entered-monitor and rehome+redistribute
    // wipes mon-level userSized shares (CON percent → 1).
    if (
      this._sessionLocked ||
      this._workareasThrashPending ||
      this._sessionLayoutRestoring ||
      this._suppressRehome.active ||
      this._layoutBindPending ||
      this._openLayoutBatchDepth > 0 ||
      this._sessionLayoutShieldActive() ||
      this.monitorRecovery.inDisplayReconfigGrace()
    ) {
      return;
    }
    // R017: scale/mode/pos mid-reconfig — arm settle; do not rehome.
    if (this.monitorRecovery.displayGeometryChangedFromQuiet()) {
      this._queueMonitorRecoveryOnWorkareas();
      return;
    }
    // R012: drop owns placement while GRAB_TILE (skip mid-drag mon rehome).
    if (this._isGrabTileDragWindow(metaWindow)) {
      return;
    }
    // Coalesce rehomes across the ApplyMonitorsConfig storm window.
    if (!this._pendingEnteredMons) this._pendingEnteredMons = new Map();
    this._pendingEnteredMons.set(metaWindow, monitor);
    this._wmSources.set("enteredMonRehome", ENTERED_MONITOR_REHOME_DEFER_MS, () => {
      this._flushDeferredEnteredMonitorRehomes();
    });
  }

  /**
   * Apply deferred entered-monitor rehomes unless thrash / display reconfig armed.
   * @private
   */
  _flushDeferredEnteredMonitorRehomes() {
    const pending = this._pendingEnteredMons;
    this._pendingEnteredMons = null;
    if (!pending || pending.size === 0) return;
    if (
      this._sessionLocked ||
      this._workareasThrashPending ||
      this._sessionLayoutRestoring ||
      this._suppressRehome.active ||
      this._layoutBindPending ||
      this._openLayoutBatchDepth > 0 ||
      this._sessionLayoutShieldActive() ||
      this.monitorRecovery.inDisplayReconfigGrace()
    ) {
      return;
    }
    if (this.monitorRecovery.displayGeometryChangedFromQuiet()) {
      this._queueMonitorRecoveryOnWorkareas();
      return;
    }
    for (const [metaWindow, monitor] of pending) {
      if (!metaWindow) continue;
      if (this._isGrabTileDragWindow(metaWindow)) continue;
      try {
        this.updateMetaWorkspaceMonitor("window-entered-monitor", monitor, metaWindow);
      } catch (e) {
        Logger.debug(`entered-monitor deferred rehome: ${e}`);
      }
    }
    this.trackCurrentMonWs();
  }

  /** @param {Meta.Window|null|undefined} metaWindow */
  _isGrabTileDragWindow(metaWindow) {
    if (!metaWindow) return false;
    if (this._draggedNodeWindow?.nodeValue === metaWindow) return true;
    const node = this.tree?.findNode?.(metaWindow) || this.findNodeWindow?.(metaWindow);
    if (!node) return false;
    if (typeof node.isGrabTile === "function" && node.isGrabTile()) return true;
    return node.mode === WINDOW_MODES.GRAB_TILE;
  }

  /** @returns {boolean} */
  _sessionLayoutShieldActive() {
    return this.sessionLayoutRestore.sessionLayoutShieldActive();
  }

  /**
   * Re-apply the post-install restored forest (Meta mon + tree + last-good seed).
   * Used while the shield is active so monitor-recovery cannot freeze a thrash snapshot.
   * @returns {boolean}
   */
  _reapplySessionLayoutShield(from = "session-layout-shield") {
    return this.sessionLayoutRestore.reapplySessionLayoutShield(from);
  }

  /** unlock-dialog entered — arm lock forest shield. */
  onSessionLocked() {
    return this.sessionLayoutRestore.onSessionLocked();
  }

  /** user session after lock — short shield + settle. */
  onSessionUnlocked() {
    return this.sessionLayoutRestore.onSessionUnlocked();
  }

  /** @param {{ monitors?: any[] }} liveForest @param {string} tag */
  _traceSessionLayoutHomes(liveForest, tag) {
    return this.sessionLayoutRestore.traceSessionLayoutHomes(liveForest, tag);
  }

  /**
   * Handle the display's "workareas-changed" signal. The monitor-count guard keeps
   * windows attached to the tree during transient monitor loss (KVM switch, lock).
   * Geometry thrash (blank/wake) is debounced into monitor-recovery so windows are not
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
        this._queueMonitorRecoveryOnWorkareas();
      }
    }
  }

  /** Debounce workareas thrash, then monitor-recovery once geometries settle. */
  _queueMonitorRecoveryOnWorkareas() {
    return this.monitorRecovery.queueMonitorRecoveryOnWorkareas();
  }

  /**
   * Restore windows to last-good monitors after workareas settle (H1).
   * Body lives on MonitorRecoveryManager; thin wrapper keeps spies/tests on WM.
   */
  _recoverAfterWorkareas() {
    return this.monitorRecovery.recoverAfterWorkareas();
  }

  /**
   * Align monitor-recovery targets for outermost STACKED/TABBED groups (majority mon).
   * @param {Map<object, number>} targets
   * @param {number} nMonitors
   */
  _alignMonitorRecoveryGroupTargets(targets, nMonitors) {
    return this.monitorRecovery.alignMonitorRecoveryGroupTargets(targets, nMonitors);
  }

  /**
   * Pick monitor index for a window during monitor-recovery.
   * @param {object} wNode
   * @param {object[]} geometries
   * @param {number} nMonitors
   */
  _resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors) {
    return this.monitorRecovery.resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors);
  }

  /** Record last quiet monitor + frame for each live window (used after thrash). */
  _snapshotLastGoodHomes() {
    return this.monitorRecovery.snapshotLastGoodHomes();
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
    return this._suppressAbove.run(fn);
  }

  /** forge-zo4: dialogs/transients are always-above by design — never demote them. */
  _isDialogLike(metaWindow) {
    return (
      metaWindow.get_window_type() === Meta.WindowType.DIALOG ||
      metaWindow.get_window_type() === Meta.WindowType.MODAL_DIALOG ||
      metaWindow.get_transient_for() !== null
    );
  }

  /**
   * Snapshot sortedWindows for drag-target resolution.
   * All TILE windows on the **active workspace** (every monitor) are eligible
   * drop targets so cross-monitor DnD can hit + paint. Dragged / GRAB_TILE /
   * FLOAT excluded. Call again from _handleMoving so targets stay live when
   * the pointer crosses heads (do not gate on get_current_monitor()).
   * @param {any} [forWindow] Prefer this Meta.Window when focus lags (tab grab).
   */
  trackCurrentMonWs(forWindow = null) {
    let metaWindow = forWindow || this.focusMetaWindow;
    if (!metaWindow) return;
    const currentWorkspace = global.display.get_workspace_manager().get_active_workspace_index();
    let currentWsNode = this.tree.findNode(`ws${currentWorkspace}`);

    if (!currentWsNode) {
      this.sortedWindows = [];
      return;
    }

    // Workspace subtree includes every monitor head — no mon-index filter.
    const monWindows = collectDragDropTargetMetaWindows(
      currentWsNode.getNodeByType(NODE_TYPES.WINDOW),
      metaWindow
    );

    try {
      this.sortedWindows = global.display.sort_windows_by_stacking(monWindows).reverse();
    } catch (_e) {
      this.sortedWindows = monWindows;
    }
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

  resize(grabOp, amount) {
    let metaWindow = this.focusMetaWindow;
    if (!metaWindow) return;
    let display = global.display;

    // forge-h6z9: the debounced grab-end is a single instance-wide timer. If a
    // pending end belongs to a DIFFERENT window than the one now focused (focus
    // drifted between two keyboard resizes), flush that window's grab first so
    // its node isn't left with grabMode/initRect stranded forever. The end-fire
    // path reads this.focusMetaWindow, so clean the prior node directly here.
    if (this._wmSources.has("manualResizeEnd") && this._manualResizeEndWindow !== metaWindow) {
      this._wmSources.cancel("manualResizeEnd");
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
    // forge-h6z9: remember which window the pending end belongs to so a later
    // cross-window resize can flush it (above), and a real pointer grab
    // beginning within the debounce can cancel it (see _handleGrabOpBegin).
    this._manualResizeEndWindow = metaWindow;
    this._wmSources.set("manualResizeEnd", 120, () => {
      this._manualResizeEndWindow = null;
      this._handleGrabOpEnd(display, metaWindow, grabOp);
    });
  }

  /**
   * forge-gm0z: grow (or, with a negative amount, shrink) the focused tiled
   * window on BOTH axes.
   *
   * This replaces the old WindowExpand/WindowShrink path that fired four
   * overlapping wm.resize() grabs (N, S, W, E). Those calls all wrote the single
   * shared this.grabOp, and _handleResizing is async/signal-driven, so by the
   * time the signals fired only the last op (RESIZING_E) survived — the window
   * never grew vertically, and a rightmost-column window with no right sibling
   * did not grow at all.
   *
   * The grab machinery is bypassed entirely: percents are adjusted directly
   * against the focused node's split pair in its parent (one axis) and, when
   * nested, against the enclosing container's split pair in the grandparent (the
   * other axis), then the tree is re-rendered. This is the two-axis behavior the
   * 4-call burst INTENDED.
   *
   * @param {number} amount - pixels to grow each affected edge by (negative shrinks).
   */
  expand(amount) {
    if (!amount) return;
    let focusNodeWindow = this.findNodeWindow(this.focusMetaWindow);
    if (!focusNodeWindow || !focusNodeWindow.isTile()) return;

    // Grow the focused window in its own split (one orientation), and the
    // enclosing container in the grandparent split (the other orientation), so
    // the window claims space on both axes like the original 4-call burst meant.
    let changed = this._expandNodeAgainstPair(focusNodeWindow, amount);
    let container = focusNodeWindow.parentNode;
    if (container && container.isCon()) {
      changed = this._expandNodeAgainstPair(container, amount) || changed;
    }

    if (changed) this.commitLayout("window-expand", { force: true });
  }

  /** forge-gm0z: WindowShrink is WindowExpand with a negative amount. */
  shrink(amount) {
    this.expand(-amount);
  }

  /**
   * forge-gm0z: grow `node` by `deltaPx` against its split pair within its
   * parent, debiting the pair, then normalize — mirroring the sameParent branch
   * of _handleResizing (window.js:3158+) so manual resize and expand/shrink stay
   * consistent. The split pair is the next tiled sibling, or the previous one
   * when `node` is the last child. Returns true when a percent was changed.
   */
  _expandNodeAgainstPair(node, deltaPx) {
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
    // Pair with the next tiled sibling, or the previous one when `node` is last.
    const pair = index + 1 < tiled.length ? tiled[index + 1] : tiled[index - 1];
    if (!pair) return false;

    const delta = deltaPx / parentSize;
    node.percent = this._effectivePercent(node, orientation, parentSize) + delta;
    pair.percent = this._effectivePercent(pair, orientation, parentSize) - delta;
    node.userSized = true;
    pair.userSized = true;
    this._normalizeSiblingPercents(parent);
    return true;
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
      this.commitLayout("window-golden-ratio", { force: true });
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
    // CL10: never leave apply chrome / hard-clear timer after disable.
    this.layoutApplyChrome?.destroy();
    this._cancelAllOpenCommits();
    this._releaseAllDeferredOpens();
    this._layoutBatch?.reset();
    this._layoutBindPending = false;
    this.layoutController?.cancel();
    this._removeSignals();
    // Persist topology for install/update reload (Meta.Window refs die with us).
    this._saveSessionLayoutForReload({ immediate: true });
    // forge-zo4: re-pin any floats demoted for a fullscreen window before the
    // tree is dropped, so they aren't stranded below after Forge is disabled.
    // Done after _removeSignals so the make_above notify::above can't re-render.
    this._restoreAllDemotedFloats();
    // Release any preview hint left over from an in-progress drag before dropping the tree.
    this.dragDrop?.clearAllPreviewHints?.();
    // LX4: stage captured-event arm must not outlive disable.
    this.dragDrop?.cancelTabDrag?.();
    this.allNodeWindows.forEach((node) => this._grabCleanup(node));
    this._draggedNodeWindow = null;
    // forge-ph7f / W2: cancel per-window attach sources (stack pin slot) then
    // unpin transiently-pinned windows so none is stranded "Always on Top"
    // after the tree is dropped (skips genuine user/float pins).
    this._windowAttach?.disposeAll();
    this.allNodeWindows.forEach((node) => {
      const mw = node.nodeValue;
      if (!mw) return;
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
    // disable() cancels the controller (incl. CL6 periodic); re-arm from gsettings.
    this._syncLayoutVerifyInterval();
    this.reloadTree("enable");
    Logger.debug(`extension:enable`);
  }

  /**
   * SE6: load settle-heuristics.json once into thrash catalog (geom minQuiet).
   * No write path here — CLI flushes after top-level layout apply.
   */
  _seedThrashCatalogFromSettleHeuristics() {
    try {
      const path = GLib.build_filenamev([forgeConfigDir(), "settle-heuristics.json"]);
      const file = Gio.File.new_for_path(path);
      if (!file.query_exists(null)) return;
      const [, bytes] = file.load_contents(null);
      const text = new TextDecoder().decode(bytes);
      const store = parseSettleHeuristicsJson(text);
      if (!store) return;
      const n = this.appThrashCatalog?.applySettleHeuristicsStore?.(store) ?? 0;
      if (n > 0) {
        Logger.debug(`app-thrash-catalog: seeded ${n} geom entries from settle-heuristics`);
      }
    } catch (e) {
      Logger.debug(`app-thrash-catalog: settle-heuristics seed skipped: ${e}`);
    }
  }

  /**
   * CL6: apply `layout-verify-interval-ms` (0 = off) to LayoutController.
   */
  _syncLayoutVerifyInterval() {
    let ms = 0;
    try {
      ms = this.ext?.settings?.get_uint?.("layout-verify-interval-ms") ?? 0;
    } catch (_e) {
      ms = 0;
    }
    this.layoutController?.setVerifyIntervalMs(ms);
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

  /**
   * layoutManager::monitors-changed → refresh identity + arm workareas settle.
   * R017: arms thrash-pending early so deferred entered-monitor rehomes abort.
   */
  _bindLayoutMonitorsChanged() {
    if (this._layoutMonitorsChangedId) return;
    try {
      if (!Main.layoutManager?.connect) return;
      this._layoutMonitorsChangedId = Main.layoutManager.connect("monitors-changed", () => {
        this._refreshMonitorIdentityMap();
        // Always queue: shouldSkipWorkareasAsNoop short-circuits true no-ops.
        // Early arm suppresses entered-monitor during scale/mode reconfig.
        try {
          this._queueMonitorRecoveryOnWorkareas();
        } catch (_e) {
          /* ignore */
        }
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

  /**
   * Presentation zoom (D030). Any current zoomMode + any chord clears.
   * @param {"full"|"horizontal"|"vertical"} mode
   */
  toggleZoom(mode) {
    const node = this.findNodeWindow(this.focusMetaWindow);
    if (!node || node.mode !== WINDOW_MODES.TILE) return;
    const next = resolveZoomToggle(node.zoomMode, mode);
    if (next) {
      const mon = this.tree.findAncestorMonitor(node);
      const peers = this._tiledWindowsOnMonitor(mon);
      if (!peers.includes(node)) peers.push(node);
      applyOneZoomPerMonitor(peers, node, next);
    } else {
      node.zoomMode = null;
    }
    this.commitLayout("zoom", { force: true });
  }

  /**
   * Feature #287: Toggle monocle mode - tab all windows on current workspace
   * When enabled, all tiled windows move to a single tabbed container
   * When disabled, returns to normal tiled layout
   */
  toggleWorkspaceMonocle() {
    const workspaceIndex = global.display.get_workspace_manager().get_active_workspace_index();
    const workspaceNode = this.tree.findNode(`ws${workspaceIndex}`);
    if (!workspaceNode) return;

    // Find the first monitor container in this workspace
    const monitorNodes = workspaceNode.getNodeByType(NODE_TYPES.MONITOR);
    if (!monitorNodes || monitorNodes.length === 0) return;

    const monitorNode = monitorNodes[0];
    const tiledWindows = this.tree.getTiledChildren(monitorNode.childNodes);

    if (tiledWindows.length === 0) return;

    // forge-wf49: collect the tiled leaf windows to move into the monocle. INCLUDE
    // minimized windows: leaving them behind strands a nested CON that the prune
    // loop can't empty, so the monitor keeps 2 CONs and the user can never exit
    // monocle. (Float/grab-tile are still excluded — they aren't part of the grid.)
    const collectMonocleLeaves = () =>
      monitorNode.getNodeByType(NODE_TYPES.WINDOW).filter((w) => !w.isFloat() && !w.isGrabTile());

    // Check if we're already in monocle mode (single tabbed container holding ALL
    // tiled windows). forge-wf49: the last two clauses require the single CON to be
    // the monitor's ONLY tiled child — otherwise a loose tiled window beside a
    // user-made tabbed group is misread as monocle and the toggle destructively
    // flattens the group instead of entering monocle.
    const containerNodes = monitorNode.getNodeByType(NODE_TYPES.CON);
    const isMonocle =
      containerNodes.length === 1 &&
      containerNodes[0].layout === LAYOUT_TYPES.TABBED &&
      containerNodes[0].childNodes.length > 1 &&
      tiledWindows.length === 1 &&
      tiledWindows[0] === containerNodes[0];

    if (isMonocle) {
      // Exit monocle: change container to split layout
      containerNodes[0].layout = this.determineSplitLayout();
      this.tree.resetSiblingPercent(containerNodes[0]);
    } else {
      // Enter monocle: gather all tiled LEAF windows (recursively, across any
      // existing containers) and move them into one tabbed container.
      //
      // forge-a34.7: the original code called the non-existent
      // this.tree.moveNode and threw. A naive fix using
      // getTiledChildren(monitorNode.childNodes) is also wrong: that returns the
      // monitor's *direct* children, which for a nested layout is the CON node
      // itself (not the windows inside it) — appending that CON into itself
      // makes a self-referential cycle and renderTree recurses forever. So we
      // collect leaf WINDOW nodes (getNodeByType is recursive) and never append
      // a container into itself.
      let leafWindows = collectMonocleLeaves();
      if (leafWindows.length === 0) return;

      let targetContainer = containerNodes[0];
      if (!targetContainer) {
        // No container yet: push the first window down into a fresh container.
        // split() replaces the window node with a new one inside the container,
        // so re-collect the leaf set afterwards.
        this.tree.split(leafWindows[0], ORIENTATION_TYPES.HORIZONTAL, true);
        targetContainer = leafWindows[0].parentNode;
        leafWindows = collectMonocleLeaves();
      }

      // Node.appendChild reparents (removing from the previous parent first).
      for (const window of leafWindows) {
        if (window.parentNode !== targetContainer) {
          targetContainer.appendChild(window);
        }
      }

      // Prune containers left empty by the moves so the monitor keeps exactly
      // one container — the exit path detects monocle via
      // containerNodes.length === 1, and a surviving empty/nested CON would
      // make the next toggle re-enter instead of restoring the split. Loop
      // until stable because removing a child CON can empty its parent.
      let prunedAny = true;
      while (prunedAny) {
        prunedAny = false;
        for (const con of monitorNode.getNodeByType(NODE_TYPES.CON)) {
          if (con !== targetContainer && con.childNodes.length === 0 && con.parentNode) {
            con.parentNode.removeChild(con);
            prunedAny = true;
          }
        }
      }

      // The container may carry a partial-width percent (e.g. inherited from the
      // split above); reset its siblings so the monocle container fills the
      // monitor work area instead of rendering at the pre-monocle width.
      this.tree.resetSiblingPercent(targetContainer.parentNode);
      targetContainer.layout = LAYOUT_TYPES.TABBED;
      targetContainer.lastTabFocus = this.focusMetaWindow;
    }

    this.renderTree("workspace-monocle-toggle");
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

  move(metaWindow, rect, workArea = null, { skipOffscreenClamp = false, force = false } = {}) {
    if (!metaWindow) return;
    if (metaWindow.grabbed) return;
    // Dead/finalized wrappers: later Meta calls SEGV; try/catch is not enough.
    if (!Utils.isWindowAlive(metaWindow)) return;

    // Suppress size/position → retile feedback while we commit geometry.
    // Nestable with tree.apply (depth counter). Post-commit startEcho covers client snap.
    this._suppressGeom.run(() => {
      const committed = this._moveImpl(metaWindow, rect, workArea, {
        skipOffscreenClamp,
        force,
      });
      if (committed) {
        this.layoutEpoch?.startEcho(metaWindow, { targetRect: rect });
      }
    });
  }

  /**
   * Geometry commit body for move(); callers use move() for suppress wrap.
   * @returns {boolean} true when move_resize_frame was issued
   */
  _moveImpl(metaWindow, rect, workArea = null, { skipOffscreenClamp = false, force = false } = {}) {
    let x = rect.x;
    let y = rect.y;
    let width = rect.width;
    let height = rect.height;

    // Tree reparent alone leaves Meta on the old mon. Align Mutter before
    // clamp/resize. safeMoveToMonitor no-ops when mon is -1 / unmapped.
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
    // force=true (verify give-up recovery) always commits move_resize_frame.
    const frame = metaWindow.get_frame_rect();
    const targetW = Math.max(width, minW);
    const targetH = Math.max(height, minH);
    const eps = 4;
    if (
      !force &&
      Compat.getMaximizeFlags(metaWindow) === 0 &&
      Math.abs(frame.x - x) <= eps &&
      Math.abs(frame.y - y) <= eps &&
      Math.abs(frame.width - targetW) <= eps &&
      Math.abs(frame.height - targetH) <= eps &&
      (destMon < 0 || metaWindow.get_monitor?.() === destMon)
    ) {
      return false;
    }

    Compat.unmaximize(metaWindow);

    let windowActor = metaWindow.get_compositor_private();
    if (!windowActor) return false;
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
    return true;
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
    let nextWorkArea = null;
    try {
      nextWorkArea = node.nodeValue.get_work_area_for_monitor(targetMonitor);
    } catch (_e) {
      return null;
    }

    if (currentWorkArea && nextWorkArea) {
      // Prefer tree slot; fall back to live frame for TILE with unset rect
      // (pre-render peel) so cross-mon move does not throw on null.rect.
      let src = node.rect;
      if (!src || src.width == null || src.height == null) {
        try {
          src = node.nodeValue.get_frame_rect?.();
        } catch (_e) {
          return null;
        }
      }
      if (!src || !(src.width > 0) || !(src.height > 0)) return null;

      const hRatio = nextWorkArea.height / currentWorkArea.height;
      const wRatio = nextWorkArea.width / currentWorkArea.width;

      // Clone — do not mutate node.rect before reparent commits (e3k1 throw path).
      const rect = {
        x: src.x,
        y: src.y,
        width: src.width * wRatio,
        height: src.height * hRatio,
      };

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

  _removeSignals() {
    if (!this._signalsBound) return;

    this._unbindLayoutMonitorsChanged();

    // W5: global display/wm/wsm/settings/overview connects (not dispose — re-enable rebinds).
    this._wmSignals?.disconnectAll();

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

      if (windowActor && windowActor.border) {
        windowActor.border.hide();
        if (global.window_group) {
          global.window_group.remove_child(windowActor.border);
        }
        windowActor.border = undefined;
      }

      if (windowActor && windowActor.splitBorder) {
        windowActor.splitBorder.hide();
        if (global.window_group) {
          global.window_group.remove_child(windowActor.splitBorder);
        }
        windowActor.splitBorder = undefined;
      }
    }

    // W1: WM-global timers owned by SourceBag (cancelAll; bag lives across enable).
    this._wmSources?.cancelAll();
    this._wsWindowAddQueue = null; // forge-wqlx: drop pending re-home queue
    this._manualResizeEndWindow = null;
    this._workareasThrashPending = false;
    // Drop pending layout/verify timers; controller stays for re-enable.
    this.layoutController?.cancel();

    this._signalsBound = false;
  }

  /**
   * Debounced layout commit (CL0). Prefer over raw renderTree for sensor storms.
   * CL5: while open-layout batch is active, latch need-commit only (no mid-batch fire).
   * @param {string} [reason]
   */
  requestLayout(reason) {
    if (this._layoutBatch?.active) {
      this._layoutBatch.latchCommit();
      return;
    }
    this.layoutController?.requestLayout(reason);
  }

  /** @returns {number} CL5 batch nest depth (compat + session-api). */
  get _openLayoutBatchDepth() {
    return this._layoutBatch?.depth ?? 0;
  }

  /** @param {number} v */
  set _openLayoutBatchDepth(v) {
    if (!this._layoutBatch) return;
    const n = Math.max(0, Math.floor(Number(v) || 0));
    this._layoutBatch.reset();
    for (let i = 0; i < n; i++) this._layoutBatch.begin();
  }

  /** @returns {boolean} deferred commit latched while batch active. */
  get _openLayoutBatchNeedsCommit() {
    return !!this._layoutBatch?.needsCommit;
  }

  /** @param {boolean} v */
  set _openLayoutBatchNeedsCommit(v) {
    this._layoutBatch?.setNeedsCommit(!!v);
  }

  /**
   * AC4: thrash / fail-open isolation — float mapped client, insert PLACEHOLDER
   * in reserved slot, one layout commit. Never reassert/mismatch war.
   *
   * @param {object|null|undefined} metaOrNode Meta.Window or WINDOW node
   * @param {{ reason?: string|null, parentNode?: object|null, hasMappedClient?: boolean }} [opts]
   * @returns {{
   *   ok: boolean,
   *   reason: string,
   *   placeholder: object|null,
   *   clientNode: object|null,
   *   floated: boolean,
   *   layoutReason: string|null,
   * }}
   */
  isolateThrashWindow(metaOrNode, opts = {}) {
    let clientNode = null;
    let parentNode = opts.parentNode ?? null;

    if (metaOrNode && typeof metaOrNode === "object") {
      if (metaOrNode.nodeType === NODE_TYPES.WINDOW || typeof metaOrNode.isWindow === "function") {
        clientNode = metaOrNode;
      } else {
        clientNode = this.findNodeWindow(metaOrNode) ?? this.tree?.findNode?.(metaOrNode) ?? null;
      }
    }

    if (clientNode && shouldSkipThrashIsolate(clientNode)) {
      Logger.debug("isolateThrashWindow: skip placeholder (no thrash loop)");
      return {
        ok: false,
        reason: "is-placeholder",
        placeholder: null,
        clientNode,
        floated: false,
        layoutReason: null,
      };
    }

    if (!parentNode && clientNode) parentNode = clientNode.parentNode ?? null;

    const result = executeIsolateThrash(
      {
        clientNode,
        parentNode,
        reason: opts.reason ?? "thrash",
        hasMappedClient: opts.hasMappedClient,
        floatMode: WINDOW_MODES.FLOAT,
      },
      {
        floatClient: (node) => {
          // Mode FLOAT keeps membership; frees slot among tiled siblings.
          try {
            node.float = true;
          } catch (_e) {
            node.mode = WINDOW_MODES.FLOAT;
          }
          // Stop fighting residual for this client.
          try {
            this.layoutEpoch?.clearEpoch?.(node.nodeValue);
          } catch (_e2) {
            // ignore
          }
        },
        createPlaceholder: ({ parentNode: p, beforeNode, percent, userSized, reason }) => {
          if (!this.tree?.createPlaceholderLeaf || !p) return null;
          // Host is the container (CON/MONITOR), never a WINDOW.
          const host = p.isWindow?.() ? p.parentNode : p;
          if (!host) return null;
          return this.tree.createPlaceholderLeaf(host, {
            beforeNode: beforeNode ?? null,
            percent,
            userSized,
            reason,
          });
        },
        requestLayout: (reason) => {
          this.requestLayout(reason || PLACEHOLDER_ISOLATE_LAYOUT_REASON);
        },
        clearEpoch: (meta) => {
          this.layoutEpoch?.clearEpoch?.(meta);
        },
      }
    );

    if (result.ok) {
      Logger.info(
        `isolateThrashWindow: ${result.reason} floated=${result.floated} ph=${!!result.placeholder}`
      );
    } else {
      Logger.debug(`isolateThrashWindow: failed ${result.reason}`);
    }
    return result;
  }

  /**
   * AC4: close/remove placeholder → drop leaf + one reflow (product close path).
   *
   * @param {object|null|undefined} nodeOrStub WINDOW node, stub value, or id
   * @returns {{ ok: boolean, reason: string, layoutReason: string|null }}
   */
  removePlaceholder(nodeOrStub) {
    let node = null;
    if (nodeOrStub && typeof nodeOrStub === "object") {
      if (isPlaceholderNode(nodeOrStub) || nodeOrStub.nodeType === NODE_TYPES.WINDOW) {
        node = nodeOrStub.nodeType != null ? nodeOrStub : null;
      }
      if (!node && this.tree) {
        node = this.tree.findNode?.(nodeOrStub) ?? null;
      }
    }
    if (!node && this.tree && nodeOrStub != null) {
      const windows = this.tree.getNodeByType?.(NODE_TYPES.WINDOW) ?? [];
      node =
        windows.find(
          (w) =>
            isPlaceholderNode(w) &&
            (w.nodeValue === nodeOrStub ||
              w.nodeValue?.id === nodeOrStub ||
              (typeof nodeOrStub === "object" && w.nodeValue?.id === nodeOrStub?.id))
        ) ?? null;
    }

    if (!node || !isPlaceholderNode(node)) {
      return { ok: false, reason: node ? "not-placeholder" : "no-node", layoutReason: null };
    }

    const result = executeRemovePlaceholder(
      { node },
      {
        removeNode: (n) => {
          this.tree?.removeNode?.(n);
        },
        requestLayout: (reason) => {
          this.requestLayout(reason || PLACEHOLDER_REMOVE_LAYOUT_REASON);
        },
      }
    );

    if (result.ok) {
      Logger.info("removePlaceholder: leaf dropped + reflow");
    }
    return result;
  }

  /**
   * CL5: start multi-open / layout-CLI batch — no per-app layout commit until end.
   * Nestable depth counter. Pair with endOpenLayoutBatch.
   * @param {string|null|undefined} [layoutName] optional profile name for apply chrome
   */
  beginOpenLayoutBatch(layoutName) {
    const { depth } = this._layoutBatch.begin();
    // AC2: each batch begin advances layout wave id for command epochs.
    this.layoutEpoch?.beginWave();
    // CL10: show apply chrome on begin when setting on (depth ≥ 1).
    this.layoutApplyChrome?.syncFromBatch(depth, {
      layoutName: layoutName ?? null,
    });
    return {
      ok: true,
      depth,
      layoutName:
        layoutName != null && String(layoutName).trim() ? String(layoutName).trim() : null,
      waveId: this.layoutEpoch?.waveId ?? 0,
    };
  }

  /**
   * CL5: end multi-open batch. When depth hits 0 and a deferred commit is latched
   * (and residual RunSteps has not already scheduled C), one Cq (or Cf if no LC).
   *
   * Apply chrome stays until clearLayoutApplyChrome() — CLI clears after
   * focus/soft (finally). end() itself does not clear chrome.
   * @param {string} [reason]
   */
  endOpenLayoutBatch(reason) {
    const r = reason == null || reason === "" ? "open-batch" : String(reason);
    const step = this._layoutBatch.end();
    if (!step.wasActive) {
      return { ok: true, depth: 0, committed: false, wasActive: false };
    }
    if (step.depth > 0) {
      this.layoutApplyChrome?.syncFromBatch(step.depth);
      return {
        ok: true,
        depth: step.depth,
        committed: false,
        wasActive: true,
      };
    }
    // Depth 0: do not clear apply chrome here (CLI chrome-clear after residual).
    // CL8: unhide deferred maps before residual / batch commit layout.
    this._releaseAllDeferredOpens();
    try {
      this.processFloats();
    } catch (_e) {
      // best-effort — commit still needed
    }
    // CT1: never leave sticky entered-monitor suppress across a completed batch.
    this._layoutBindPending = false;
    // Always force-paint after release. Mid-batch RunSteps renderTree clears
    // the latch so shouldCommit can be false while just-released maps are
    // still at FLOAT geometry (R024 / green first apply).
    this.commitLayout(r, { force: true });
    return {
      ok: true,
      depth: 0,
      committed: true,
      wasActive: true,
    };
  }

  /**
   * Show layout-apply chrome without beginning a LayoutBatch (no-open apply).
   * @param {string|null|undefined} [layoutName]
   * @returns {{ ok: boolean, shown?: boolean, reason?: string, error?: string }}
   */
  showLayoutApplyChrome(layoutName) {
    if (layoutName !== undefined) {
      try {
        this.layoutApplyChrome?.setLayoutName?.(layoutName);
      } catch (_e) {
        /* ignore */
      }
    }
    let enabled = false;
    try {
      enabled = !!this.ext?.settings?.get_boolean?.("layout-apply-chrome-enabled");
    } catch (_e) {
      enabled = false;
    }
    if (!enabled) {
      return { ok: true, shown: false, reason: "disabled" };
    }
    try {
      this.layoutApplyChrome?.show?.();
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    return { ok: true, shown: !!this.layoutApplyChrome?.visible };
  }

  /**
   * Clear layout-apply chrome (after focus/soft / error/finally).
   * Hard timeout and disable() also clear.
   * @returns {{ ok: true, cleared: boolean }}
   */
  clearLayoutApplyChrome() {
    const was = !!this.layoutApplyChrome?.visible;
    try {
      this.layoutApplyChrome?.setLayoutName?.(null);
      this.layoutApplyChrome?.clear?.();
    } catch (_e) {
      // chrome may already be gone
    }
    return { ok: true, cleared: was };
  }

  get openLayoutBatchActive() {
    return !!this._layoutBatch?.active;
  }

  /**
   * Pin TABBED/STACKED open leaf for soft-focus wall residual (D018/SE5).
   * Meta late-activate (Chrome PWA) must not rewrite lastTabFocus while pinned.
   * @param {import('./tree.js').Node|null|undefined} parentCon
   * @param {object|null|undefined} meta
   * @param {number} [residualMs]
   */
  pinLayoutOpenLeaf(parentCon, meta, residualMs = LAYOUT_OPEN_LEAF_PIN_MS) {
    if (!parentCon || !meta) return;
    if (typeof parentCon.isStackedOrTabbed === "function" && !parentCon.isStackedOrTabbed()) {
      return;
    }
    const pin = makeLayoutOpenLeafPin(meta, residualMs, Date.now());
    if (!pin) return;
    parentCon.lastTabFocus = meta;
    this._layoutOpenLeafPins.set(parentCon, pin);
  }

  /**
   * @param {import('./tree.js').Node|null|undefined} parentCon
   * @returns {{ meta: object, until: number }|null}
   */
  getLayoutOpenLeafPin(parentCon) {
    if (!parentCon || !this._layoutOpenLeafPins) return null;
    const pin = this._layoutOpenLeafPins.get(parentCon);
    if (!layoutOpenLeafPinActive(pin, Date.now())) {
      if (pin) this._layoutOpenLeafPins.delete(parentCon);
      return null;
    }
    return pin;
  }

  /**
   * If meta-focus landed on a non-pinned tab sibling, restore pinned open leaf.
   * @param {import('./tree.js').Node|null|undefined} focusNode
   * @returns {boolean} true when steal was corrected (skip adopting stealer)
   */
  restoreLayoutOpenLeafIfStolen(focusNode) {
    if (!focusNode?.parentNode) return false;
    const parent = focusNode.parentNode;
    if (typeof parent.isStackedOrTabbed === "function" && !parent.isStackedOrTabbed()) {
      return false;
    }
    const pin = this.getLayoutOpenLeafPin(parent);
    if (!shouldRestoreLayoutOpenLeaf(pin, focusNode.nodeValue, Date.now())) {
      return false;
    }

    const pinNode = this.tree?.findNode?.(pin.meta);
    if (pinNode) {
      try {
        if (typeof this.revealGroupChild === "function") {
          this.revealGroupChild(pinNode);
        } else {
          parent.lastTabFocus = pin.meta;
          pin.meta.raise?.();
          this.settleTabFocus?.(pinNode);
        }
      } catch (_e) {
        /* best-effort */
      }
    } else {
      parent.lastTabFocus = pin.meta;
      try {
        pin.meta.raise?.();
      } catch (_e) {
        /* finalized */
      }
    }
    return true;
  }

  /**
   * Debounced Meta↔slot verify (CL1 scanner + agreement).
   * @param {string} [reason]
   */
  requestVerify(reason) {
    this.layoutController?.requestVerify(reason);
  }

  renderTree(from, force = false) {
    let wasFrozen = this._freezeRender;
    if (force && wasFrozen) this.unfreezeRender();
    if (this._freezeRender || !this.ext.settings.get_boolean("tiling-mode-enabled")) {
      this.updateDecorationLayout();
      this.updateBorderLayout();
      this.layoutDebugOverlay?.update();
    } else {
      // Force replaces a stale idle so first layout apply cannot no-op behind
      // a leftover grab-end renderTree slot (R024).
      if (force && this._wmSources.has("renderTree")) {
        this._wmSources.cancel("renderTree");
      }
      if (!this._wmSources.has("renderTree")) {
        // Bug #531: SourceBag clears the slot on fire (before cb); throw cannot wedge.
        this._wmSources.setIdle("renderTree", () => {
          let renderOk = false;
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
            // Skip while locked — DPMS thrash would poison last-good / session-layout.json.
            if (!this._sessionLocked) {
              this._snapshotLastGoodHomes();
              // Keep last-good topology on disk (install/HUP often skips clean disable).
              this._queueSessionLayoutSave();
            }
            renderOk = true;
          } finally {
            if (wasFrozen) this.freezeRender();
          }
          // Post-render verify only after a successful body (CL0 hook for CL1).
          if (renderOk) {
            // CL5: residual already applied (also cleared at schedule time).
            if (this._layoutBatch?.active) {
              this._layoutBatch.clearNeedsCommit();
            }
            this.layoutController?.onRenderComplete(from);
          }
        });
      }
      // CL5: residual/force owns the commit while batch open — clear at schedule
      // so endOpenLayoutBatch before idle does not double requestLayout.
      if (this._layoutBatch?.active) {
        this._layoutBatch.clearNeedsCommit();
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
      // CL8: deferred LayoutBatch admits stay FLOAT (no mid-batch tile carve).
      if (this._isDeferredOpen(metaWindow)) {
        nodeWindow.float = true;
        this.lftMru?.remove(nodeWindow);
        return;
      }
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
        // New map tiles / unfloat: if focused, become LFT for the next open.
        if (wasFloat && this.focusMetaWindow === metaWindow) {
          this._lftTouchIfTile(nodeWindow);
        }
      }
    });
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
    if (this._suppressAbove.active) return;
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
    // Coalesce reloads onto one idle slot (SourceBag auto-clears on fire / throw).
    // Note: was PRIORITY_LOW; bag idle is DEFAULT — coalesce semantics unchanged.
    if (!this._wmSources.has("reloadTree")) {
      this._wmSources.setIdle("reloadTree", () => {
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
      // mode: "ignore" — never create a tree node (stronger than float).
      if (this.isWindowIgnored(metaWindow)) {
        Logger.debug(
          `Ignore override: skip track for ${metaWindow.get_title()} (${metaWindow.get_wm_class()})`
        );
        return;
      }
      let existNodeWindow = this.tree.findNode(metaWindow);
      Logger.debug(`Meta Window ${metaWindow.get_title()} ${metaWindow.get_window_type()}`);
      if (!existNodeWindow) {
        const openPlan = this._planOpenAppPlacement(metaWindow);
        // forge-3hsv / CL8: willTile before aspect-split so LayoutBatch skips carve.
        const willTile = !this.isFloatingExempt(metaWindow);
        const deferHidden = shouldDeferHiddenOpen({
          openLayoutBatchActive: this.openLayoutBatchActive,
          willTile,
        });

        // D032 wrap even mid-batch (CL8 only skips percent carve / open commit).
        const insertUnit = this._resolveInsertUnit(openPlan.attachLft);
        const leftoverSlot = this._hvSlotToJoin(insertUnit);
        if (willTile) {
          if (leftoverSlot) {
            leftoverSlot.layout = this._layoutFromOrientation(
              this._orientationFromUnit(leftoverSlot)
            );
          } else {
            if (!deferHidden) this._maybeAspectSplitForOpen(openPlan.attachLft);
            this.slotSplitForInsert(insertUnit);
          }
        }

        const activeWorkspace = global.display.get_workspace_manager().get_active_workspace_index();
        let metaMonWs = Utils.createMonitorWorkspaceId(openPlan.homeMonitor, activeWorkspace);

        let metaMonWsNode = this.tree.findNode(metaMonWs);
        if (!metaMonWsNode) {
          this.reloadTree("no-meta-monws");
          return;
        }

        let windowNodes = metaMonWsNode.getNodeByType(NODE_TYPES.WINDOW);
        let hasWindows = windowNodes.length > 0;

        // Leftover 1-child H/V is the slot (join it). Else bag attach is the
        // wrap CON — createNode(bag) would append a tab.
        const attachTarget = leftoverSlot
          ? leftoverSlot
          : insertUnit && !insertUnit.isWindow?.()
          ? insertUnit.parentNode || metaMonWsNode
          : this._resolveAttachTarget(metaMonWsNode, windowNodes, hasWindows, openPlan.attachLft);

        let nodeWindow = this.tree.createNode(
          attachTarget.nodeValue,
          NODE_TYPES.WINDOW,
          metaWindow,
          WINDOW_MODES.FLOAT
        );

        metaWindow.firstRender = true;

        // Sticky planned mon when we intentionally chose a home (dock / empty
        // head / LFT / PlaceNext). Wayland often maps on mon0 then enters the
        // real mon; without grace, entered-monitor rehome flattens attach.
        // Do not sticky bare mon-root fallback — Meta rehome must win.
        if (
          openPlan.homeMonitor >= 0 &&
          (openPlan.isDock || openPlan.isEmptyHead || openPlan.attachLft || openPlan.fromPlaceHint)
        ) {
          this._applyOpenStickyHome(metaWindow, openPlan.homeMonitor, {
            move:
              openPlan.isDock ||
              openPlan.isEmptyHead ||
              (deferHidden && shouldStickyMoveHomeMonitor(openPlan.homeMonitor)),
          });
        }

        let windowActor = metaWindow.get_compositor_private();

        this._bindWindowSignals(metaWindow, windowActor);

        if (!windowActor.border) {
          let border = new St.Bin({ style_class: "window-tiled-border" });

          if (global.window_group) global.window_group.add_child(border);

          windowActor.border = border;
          border.show();
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
        // CL8 LayoutBatch: FLOAT deferred — no insertChildPercent / open commit.
        if (willTile && !deferHidden) {
          this.tree.insertChildPercent(nodeWindow.parentNode, nodeWindow);
        }

        // CL4: open = batch N=1 — wait client quiet (catalog / dock floor /
        // default), then one requestLayout (or force renderTree if frozen).
        // CL8: LayoutBatch defers hidden; residual / batch end admits later.
        if (willTile && !deferHidden) {
          this._scheduleOpenCommit(metaWindow, openPlan);
        } else if (deferHidden) {
          this._markDeferredOpen(metaWindow, windowActor);
          this._layoutBatch?.latchCommit();
        }
      }
    }
  }

  /**
   * CL8: true while meta is a deferred LayoutBatch map (hidden FLOAT).
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _isDeferredOpen(metaWindow) {
    return isDeferredOpen(this._deferredOpenStore, metaWindow);
  }

  /**
   * CL8: mark + hide actor/border for deferred LayoutBatch admit.
   * SL2: snapshot mappedAt so release can stamp settle t0 from map time.
   * @param {Meta.Window} metaWindow
   * @param {object|null|undefined} windowActor
   */
  _markDeferredOpen(metaWindow, windowActor) {
    if (!metaWindow) return;
    const actor = windowActor || metaWindow.get_compositor_private?.();
    const snap = hideDeferredActor(actor);
    markDeferredOpen(this._deferredOpenStore, metaWindow, {
      ...snap,
      mappedAt: Date.now(),
    });
  }

  /**
   * CL11: re-hide deferred map when actor was late/null or opacity restored.
   * @param {Meta.Window|null|undefined} metaWindow
   */
  _rehideDeferredIfNeeded(metaWindow) {
    if (!metaWindow || !this._isDeferredOpen(metaWindow)) return;
    let actor = null;
    try {
      actor = metaWindow.get_compositor_private?.();
    } catch (_e) {
      actor = null;
    }
    rehideDeferredIfNeeded(this._deferredOpenStore, metaWindow, actor);
  }

  /**
   * CL8: unhide one deferred map and clear mark.
   * SL2: note settle pending (mappedAt or now) for time-to-stable.
   * @param {Meta.Window} metaWindow
   */
  _releaseDeferredOpen(metaWindow) {
    if (!metaWindow) return;
    const snap = takeDeferredOpen(this._deferredOpenStore, metaWindow);
    if (!snap) return;
    let actor = null;
    try {
      actor = metaWindow.get_compositor_private?.();
    } catch (_e) {
      actor = null;
    }
    showDeferredActor(actor, snap);
    this._noteDeferredReleaseForSettle(metaWindow, snap);
  }

  /**
   * SL2: stamp settle pending after deferred LayoutBatch release.
   * Idempotent vs open-commit note (earliest t0 wins).
   * @param {Meta.Window|null|undefined} metaWindow
   * @param {{ mappedAt?: number }|null|undefined} state
   */
  _noteDeferredReleaseForSettle(metaWindow, state) {
    if (!metaWindow) return;
    const mapped = Number(state?.mappedAt);
    const t0 = Number.isFinite(mapped) ? mapped : Date.now();
    this.layoutController?.noteOpenPendingForSettle?.(metaWindow, t0);
  }

  /** CL8: unhide every deferred map (batch end / disable / CL9 pre-residual). */
  _releaseAllDeferredOpens() {
    const released = takeAllDeferredOpens(this._deferredOpenStore);
    for (const { meta, state } of released) {
      let actor = null;
      try {
        actor = meta?.get_compositor_private?.();
      } catch (_e) {
        actor = null;
      }
      showDeferredActor(actor, state);
      this._noteDeferredReleaseForSettle(meta, state);
    }
    return released.length;
  }

  /**
   * CL9: unhide deferred LayoutBatch maps without ending the batch.
   * Residual RunSteps can then TILE/place; endOpenLayoutBatch still runs after.
   * processFloats so just-opened leave FLOAT before residual layout/move
   * (batch still blocks requestLayout; without this residual structure no-ops).
   * @returns {{ ok: true, released: number, depth: number }}
   */
  releaseDeferredOpens() {
    const released = this._releaseAllDeferredOpens();
    try {
      this.processFloats();
    } catch (e) {
      Logger.warn?.(`releaseDeferredOpens processFloats: ${e}`);
    }
    return {
      ok: true,
      released,
      depth: this._openLayoutBatchDepth || 0,
    };
  }

  /** @returns {Map<object, object>|undefined} pending open-commit map (tests + debug). */
  get _openCommitPending() {
    return this._openCommit?._pending;
  }

  /** @returns {import("./sources.js").SourceBag|undefined} */
  get _openCommitSources() {
    return this._openCommit?.sources;
  }

  /**
   * CL4: schedule open layout commit after quiet (or max wait).
   * recordOpen on catalog; external geom resets quiet timer.
   * @param {Meta.Window} metaWindow
   * @param {{ isDock?: boolean }} openPlan
   */
  _scheduleOpenCommit(metaWindow, openPlan) {
    if (!metaWindow || !this._openCommit) return;

    const catalog = this.appThrashCatalog;
    const wmClass = extractWmClass(metaWindow);
    let entry = null;
    let firstOpen = true;
    if (wmClass && catalog) {
      firstOpen = isFirstOpenOfClass(catalog.lookup(wmClass));
      entry = catalog.recordOpen(wmClass);
    }

    const isDock = !!openPlan?.isDock;
    const minQuietMs = computeOpenMinQuietMs({
      isDock,
      catalogMinQuietMs: entry?.minQuietMs ?? 0,
      // Dock keeps short floor; skip first-open extra so sticky mon stays snappy.
      firstOpen: isDock ? false : firstOpen,
    });

    const now = Date.now();
    this._openCommit.schedule(metaWindow, {
      minQuietMs,
      isDock,
      wmClass: wmClass || null,
      firstOpen,
    });
    // SL1: time-to-stable from open stamp until first Meta↔slot agreement.
    this.layoutController?.noteOpenPendingForSettle?.(metaWindow, now);
  }

  /**
   * CL4: cancel pending open commit for one window (destroy / re-schedule).
   * @param {Meta.Window} metaWindow
   */
  _cancelOpenCommit(metaWindow) {
    this._openCommit?.cancel(metaWindow);
  }

  /** CL4: cancel all pending open commits (disable / teardown). */
  _cancelAllOpenCommits() {
    this._openCommit?.cancelAll({
      clearSettle: (mw) => this.layoutController?.clearOpenPendingForSettle?.(mw),
    });
  }

  /**
   * CL4: external size/pos for a window with pending open — reset quiet.
   * Also records identity when wm_class lands late.
   * @param {Meta.Window} metaWindow
   * @returns {boolean} true if this window had a pending open commit
   */
  _touchOpenCommitExternalGeometry(metaWindow) {
    if (!metaWindow || !this._openCommit?.has(metaWindow)) return false;
    this._refreshOpenCommitIdentity(metaWindow);
    return this._openCommit.touchExternalGeometry(metaWindow);
  }

  /**
   * CL4: when wm_class was null at map, update catalog / minQuiet once it lands.
   * @param {Meta.Window} metaWindow
   * @param {object} [state]
   */
  _refreshOpenCommitIdentity(metaWindow, state) {
    const st = state || this._openCommit?.get(metaWindow);
    if (!st || !metaWindow) return;
    const cls = extractWmClass(metaWindow);
    if (!cls) return;
    if (st.wmClass === cls) return;

    const catalog = this.appThrashCatalog;
    let entry = null;
    if (catalog) {
      // First usable class for this open: count as an open observation.
      const firstOpen = isFirstOpenOfClass(catalog.lookup(cls));
      entry = catalog.recordOpen(cls);
      if (entry && !st.isDock && firstOpen) {
        const raised = computeOpenMinQuietMs({
          isDock: false,
          catalogMinQuietMs: entry.minQuietMs,
          firstOpen: true,
        });
        if (raised > st.minQuietMs) st.minQuietMs = raised;
      } else if (entry) {
        const raised = computeOpenMinQuietMs({
          isDock: st.isDock,
          catalogMinQuietMs: entry.minQuietMs,
          firstOpen: false,
        });
        if (raised > st.minQuietMs) st.minQuietMs = raised;
      }
    }
    st.wmClass = cls;
  }

  /**
   * @param {Meta.Window} metaWindow
   */
  _armOpenCommitTimer(metaWindow) {
    this._openCommit?.arm(metaWindow);
  }

  /**
   * CL4/CL5: quiet met or max-wait — unmaximize + layout commit.
   *
   * OpenApp: Cq via commitLayout (requestLayout); Cf when frozen or no LC.
   * LayoutBatch: unmaximize only + latch need-commit — residual one Cf at end.
   *
   * @param {Meta.Window} metaWindow
   */
  _fireOpenCommit(metaWindow) {
    if (!this._openCommit?.has(metaWindow)) return;
    this._cancelOpenCommit(metaWindow);

    const node = this.findNodeWindow?.(metaWindow) ?? this.tree?.findNode?.(metaWindow);
    if (!node) return;

    // queueEvent: serialize with other WM work; unmaximize + commit after quiet.
    this.queueEvent(
      {
        name: "window-create-queue",
        callback: () => {
          const still = this.findNodeWindow?.(metaWindow) ?? this.tree?.findNode?.(metaWindow);
          if (!still) return;
          try {
            Compat.unmaximize(metaWindow);
          } catch (_e) {
            // window may be disposing
          }
          // Multi-open batch: admit + quiet per window, one commit at batch end.
          if (this._openLayoutBatchDepth > 0) {
            this._openLayoutBatchNeedsCommit = true;
            return;
          }
          // OpenApp Cq; Cf when frozen (or no layoutController fallback).
          this.commitLayout("window-create", {
            force: !!this._freezeRender || !this.layoutController,
          });
        },
      },
      0
    );
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
    let monLft = dockMonitor >= 0 ? this.lftMru?.monHead?.(dockMonitor) ?? null : null;
    // LFT mon ring can be empty after layout if that mon was never focused —
    // fall back to last tiled leaf under the mon (end of mon tree), not mon-root
    // (mon-root as 3rd HSPLIT sibling "covers" the left tab group).
    if (dockMonitor >= 0 && !monLft) {
      monLft = this._lastTileOnMonitor(dockMonitor);
    }
    const windowMonitor = metaWindow?.get_monitor?.() ?? -1;
    const pointerMonitor = this._pointerMonitorIndex();
    const emptyMonitors = this._emptyTileMonitorIndices();
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
      pointerMonitor,
      emptyMonitors,
      placement,
    });

    // Empty mon LFT ring / no global LFT: still attach end-of-tree on home mon.
    if (!plan.attachLft && plan.homeMonitor >= 0) {
      const last = this._lastTileOnMonitor(plan.homeMonitor);
      if (last) {
        plan.attachLft = last;
        plan.attachMode = "after-lft";
      }
    }

    // Re-resolve attach LFT against the live tree when possible.
    if (plan.attachLft?.nodeValue) {
      const live = this.tree.findNode(plan.attachLft.nodeValue);
      if (live) plan.attachLft = live;
    }

    // Prefer the currently focused tile (user "selected" that unit). LFT can be
    // a different mon (agent terminal / layout restore); open-under-focus must
    // follow focus, not stale cross-mon LFT. Dock / empty-head home is never
    // rehomed by focus (right-head open while focus is on left must stay).
    const focusMeta = this.focusMetaWindow;
    if (focusMeta && !plan.isDock && !plan.isEmptyHead) {
      const focusNode = this.tree.findNode(focusMeta);
      if (focusNode?.isWindow?.() && focusNode.isTile?.() && !focusNode.isFloat?.()) {
        const focusMon = this._monitorIndexOfNode(focusNode);
        if (focusMon >= 0) {
          plan.homeMonitor = focusMon;
          plan.attachLft = focusNode;
          plan.attachMode = "after-lft";
        }
      }
    } else if (focusMeta && plan.isDock) {
      // Same mon only: upgrade attach to the focused tile under dock mon.
      const focusNode = this.tree.findNode(focusMeta);
      if (focusNode?.isWindow?.() && focusNode.isTile?.() && !focusNode.isFloat?.()) {
        const focusMon = this._monitorIndexOfNode(focusNode);
        if (focusMon >= 0 && focusMon === plan.homeMonitor) {
          plan.attachLft = focusNode;
          plan.attachMode = "after-lft";
        }
      }
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

    // 1-child H/V toggle only. 2+ siblings are slotSplitForInsert (D032).
    if (live.parentNode.childNodes.length !== 1) return;
    this.tree.split(live, orientation);
  }

  /**
   * Focused unit for insert A: the TABBED/STACKED bag, else the leaf.
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {import('./tree.js').Node|null}
   */
  _resolveInsertUnit(node) {
    if (!node) return null;
    const live =
      node.nodeType != null ? node : node.nodeValue ? this.tree.findNode(node.nodeValue) : null;
    if (!live) return null;
    if (isTabOrStackParent(live.parentNode, LAYOUT_TYPES)) return live.parentNode;
    let unit = live;
    for (let i = 0; i < 8 && unit?.parentNode; i++) {
      const parent = unit.parentNode;
      if (!this._isHvCon(parent) || (parent.childNodes?.length ?? 0) !== 1) break;
      unit = parent;
    }
    return unit;
  }

  /** 1-child H/V CON already occupies the slot — join it, do not wrap again. */
  _hvSlotToJoin(unit) {
    if (!this._isHvCon(unit)) return null;
    if ((unit.childNodes?.length ?? 0) !== 1) return null;
    return unit;
  }

  _isHvCon(node) {
    return !!(node?.isCon?.() && (node.isHSplit?.() || node.isVSplit?.()));
  }

  _layoutFromOrientation(orientation) {
    return orientation === ORIENTATION_TYPES.VERTICAL ? LAYOUT_TYPES.VSPLIT : LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Aspect of the unit's slot rect (same helper as auto-split).
   * @param {import('./tree.js').Node|null|undefined} unit
   * @returns {string}
   */
  _orientationFromUnit(unit) {
    if (!unit) return ORIENTATION_TYPES.HORIZONTAL;
    const slot = unit.rect;
    if (slot && slot.width > 0 && slot.height > 0) {
      return aspectOrientationFromRect(slot) === "vertical"
        ? ORIENTATION_TYPES.VERTICAL
        : ORIENTATION_TYPES.HORIZONTAL;
    }
    const meta = unit.nodeValue;
    const rect = typeof meta?.get_frame_rect === "function" ? meta.get_frame_rect() : null;
    return aspectOrientationFromRect(rect) === "vertical"
      ? ORIENTATION_TYPES.VERTICAL
      : ORIENTATION_TYPES.HORIZONTAL;
  }

  /**
   * D032: wrap the insert unit when its H/V parent already has siblings.
   * Pass the resolved unit (bag or leaf). Do not re-walk after a tiny-pane wrap.
   * @param {import('./tree.js').Node|null|undefined} unit
   * @returns {import('./tree.js').Node|null}
   */
  slotSplitForInsert(unit) {
    if (!unit) return null;
    return this.tree.slotSplitUnit(unit, this._orientationFromUnit(unit));
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
   * Mark a short sticky grace so map-time mon thrash cannot rehome the open.
   * Optionally force Meta onto the planned mon (dock / deferred PlaceNext).
   * @param {Meta.Window} metaWindow
   * @param {number} monitorIndex
   * @param {{ move?: boolean }} [opts]
   */
  _applyOpenStickyHome(metaWindow, monitorIndex, opts = {}) {
    if (!metaWindow || monitorIndex < 0) return;
    metaWindow._forgeDockStickyMon = monitorIndex;
    metaWindow._forgeDockStickyUntil = Date.now() + DOCK_STICKY_GRACE_MS;
    if (opts.move) {
      safeMoveToMonitor(metaWindow, monitorIndex, "open sticky move_to_monitor");
    }
  }

  /** @deprecated use _applyOpenStickyHome */
  _applyDockStickyHome(metaWindow, monitorIndex) {
    this._applyOpenStickyHome(metaWindow, monitorIndex, { move: true });
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
   * Last tiled WINDOW under mon M (active workspace) — end-of-mon-tree attach.
   * Used when LFT(m) is empty after layout (no focus touch on that mon yet).
   * @param {number} monIndex
   * @returns {import('./tree.js').Node|null}
   */
  _lastTileOnMonitor(monIndex) {
    if (monIndex == null || monIndex < 0 || !this.tree) return null;
    let ws = 0;
    try {
      ws = global.display.get_workspace_manager().get_active_workspace_index();
    } catch (_e) {
      ws = 0;
    }
    const monId = Utils.createMonitorWorkspaceId?.(monIndex, ws);
    const monNode = monId ? this.tree.findNode(monId) : null;
    if (!monNode) return null;
    let last = null;
    const walk = (n) => {
      if (!n) return;
      if (n.isWindow?.() && n.isTile?.() && !n.isFloat?.()) {
        last = n;
      }
      const kids = n.childNodes || [];
      for (const c of kids) walk(c);
    };
    walk(monNode);
    return last;
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
   * Monitor under the pointer, or -1 if geometry is unknown.
   * Empty-head open must not invent mon 0 from a stale current-mon fallback.
   * @returns {number}
   */
  _pointerMonitorIndex() {
    try {
      const ptr = typeof global.get_pointer === "function" ? global.get_pointer() : null;
      if (ptr && (Array.isArray(ptr) || typeof ptr.length === "number") && ptr.length >= 2) {
        const n = global.display?.get_n_monitors?.() ?? 0;
        if (n > 0 && typeof global.display.get_monitor_geometry === "function") {
          const geos = [];
          for (let i = 0; i < n; i++) {
            geos.push(global.display.get_monitor_geometry(i));
          }
          const idx = monitorIndexFromPoint(ptr[0], ptr[1], geos);
          if (idx >= 0) return idx;
        }
      }
    } catch (_e) {
      /* unknown */
    }
    return -1;
  }

  /**
   * Active-ws monitor indices that exist in the tree and have no TILE leaf.
   * Missing mon nodes are not "empty heads" (do not home there / reloadTree).
   * @returns {number[]}
   */
  _emptyTileMonitorIndices() {
    const out = [];
    let n = 0;
    let ws = 0;
    try {
      n = global.display?.get_n_monitors?.() ?? 0;
    } catch (_e) {
      n = 0;
    }
    try {
      ws = global.display.get_workspace_manager().get_active_workspace_index();
    } catch (_e) {
      ws = 0;
    }
    for (let i = 0; i < n; i++) {
      const monId = Utils.createMonitorWorkspaceId?.(i, ws);
      if (!monId || !this.tree?.findNode(monId)) continue;
      if (!this._lastTileOnMonitor(i)) out.push(i);
    }
    return out;
  }

  /**
   * Monitor for dock sticky notes: pointer geometry first, else current mon.
   * Focus mon is wrong here — left-dock click while focus is on the right must
   * still note the left mon under the cursor.
   * @returns {number}
   */
  _resolveDockLaunchMonitor() {
    const ptrMon = this._pointerMonitorIndex();
    if (ptrMon >= 0) return ptrMon;
    try {
      const cur = global.display?.get_current_monitor?.();
      if (typeof cur === "number" && cur >= 0) return cur;
    } catch (_e) {
      /* fall through */
    }
    return 0;
  }

  /**
   * Best-effort: wrap Shell.App activate / open_new_window / activate_full so
   * dock/favorites launches record sticky mon (pointer mon; overview skipped).
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
              const mon =
                typeof wmRef._resolveDockLaunchMonitor === "function"
                  ? wmRef._resolveDockLaunchMonitor()
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
      wrap("activate_full");
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
    if (!metaWindow.windowSignals) {
      let windowSignals = [
        metaWindow.connect("position-changed", (_metaWindow) => {
          let from = "position-changed";
          this.updateMetaPositionSize(_metaWindow, from);
        }),
        metaWindow.connect("size-changed", (_metaWindow) => {
          // CL11: late compositor actor / client map can unhide deferred opens.
          this._rehideDeferredIfNeeded(_metaWindow);
          let from = "size-changed";
          this.updateMetaPositionSize(_metaWindow, from);
        }),
        metaWindow.connect("notify::fullscreen", (_metaWindow) => {
          this.updateMetaPositionSize(_metaWindow, "notify::fullscreen");
        }),
        metaWindow.connect("unmanaged", (_metaWindow) => {
          this.hideActorBorder(windowActor);
          // forge-ph7f / W2: dispose per-window attach bag (cancels stack pin)
          // so a pending unpin can't fire against a destroyed MetaWindow.
          this._windowAttach?.dispose(_metaWindow);
          _metaWindow._forgeTransientAbove = false;
        }),
        metaWindow.connect("focus", (_metaWindowFocus) => {
          // CL8: deferred LayoutBatch maps must not raise / thrash focus chrome.
          if (
            this._isDeferredOpen(_metaWindowFocus) ||
            this._isDeferredOpen(this.focusMetaWindow)
          ) {
            return;
          }
          this.queueEvent({
            name: "focus-update",
            callback: () => {
              // FocusChanged: F → Dfocus → B → P → A (no renderTree / Dfull).
              let focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
              this.afterFocus(focusNodeWindow, { source: "meta-focus" });
            },
          });
          let focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
          if (focusNodeWindow) {
            // A early (before 220ms queue) so open-under-focus is current.
            this.tree.attachNode = focusNodeWindow;
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
                  if (this._isDeferredOpen(fw)) return;
                  const fwNode = fw ? this.tree.findNode(fw) : null;
                  if (fwNode && this.floatingWindow(fwNode) && !fwNode._aboveDemotedForFullscreen)
                    fw.raise();
                  this.renderTree("raise-float-queue");
                },
              });
            }
          }
          // No full renderTree on focus: TABBED/STACKED rects are not
          // focus-dependent; chrome/restack runs via focus-update above.
          // Full apply on Wayland reflowed Chrome PWAs (~¼ → full tile).
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
        metaWindow.connect("notify::wm-class", (_metaWindow) => {
          // Late class may match mode: "ignore" — drop the node instead of re-tiling.
          if (this._dropIfIgnored(_metaWindow)) return;
          // forge-3qq (#482): some apps (Anki, Opera, many Flatpaks) report a
          // null wm_class at map time, so isFloatingExempt floats them and they
          // never auto-tile. Re-render once the class lands so processFloats can
          // re-evaluate; renderTree debounces to a single idle pass.
          // forge-2uc0: those same apps had a null Shell app at map time, so the
          // node never built a tab. Refresh the node's app + tab before render.
          this.tree.findNode(_metaWindow)?.refreshApp();
          // CL4: late identity → catalog + possibly raised minQuiet while pending.
          if (this._openCommitPending?.has(_metaWindow)) {
            this._refreshOpenCommitIdentity(_metaWindow);
            this._armOpenCommitTimer(_metaWindow);
          }
          this.renderTree("wm-class-changed");
        }),
        metaWindow.connect("notify::title", (_metaWindow) => {
          if (this._dropIfIgnored(_metaWindow)) return;
          this.tree.findNode(_metaWindow)?.refreshApp();
          if (this._openCommitPending?.has(_metaWindow)) {
            this._refreshOpenCommitIdentity(_metaWindow);
            this._armOpenCommitTimer(_metaWindow);
          }
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

  /**
   * FocusChanged pipeline: F → Dfocus → B → P → A.
   * Only body for ordinary focus entries (Meta / cmd / tab / DBus / overview).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ source?: string, forcePointer?: boolean }} [opts]
   */
  afterFocus(node, opts = {}) {
    return afterFocusPipeline(this, node, opts);
  }

  /**
   * Exit a transient Forge mode (selection / grab UI). Stable API for FC2 Esc.
   * @returns {boolean} true if a mode was active and exited (skip unfocus)
   */
  exitForgeMode() {
    // No selection/grab modes yet — always no-op.
    return false;
  }

  /** Clear TILE keyboard focus (best-effort). See FocusManager.unfocusTiles. */
  unfocusTiles() {
    return this.focusManager.unfocusTiles();
  }

  /**
   * StructureChanged / SizeOnly: one C (Cq or Cf). See docs/dev/actions.md.
   * @param {string} [reason]
   * @param {{ force?: boolean }} [opts]
   */
  commitLayout(reason, opts = {}) {
    return commitLayoutPipeline(this, reason, opts);
  }

  /**
   * Post-structure tab/stack open leaf without a second full commit.
   * @param {import('./tree.js').Node|null|undefined} node
   */
  settleTabFocus(node) {
    return settleTabFocusPipeline(this, node);
  }

  /**
   * Show this child as the TABBED/STACKED open leaf. See docs/dev/contracts.md.
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ keyboard?: boolean, pin?: boolean, source?: string }} [opts]
   */
  revealGroupChild(node, opts = {}) {
    return revealGroupChildPipeline(this, node, opts);
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
    // Release any resources on the window
    this._destroyActorBorder(actor, "border");
    this._destroyActorBorder(actor, "splitBorder");

    let nodeWindow;
    nodeWindow = this.tree.findNodeByActor(actor);

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
    // CL4: drop pending open quiet timer before tree detach.
    if (metaWindow) this._cancelOpenCommit(metaWindow);
    // SL1: no settle sample if window dies before first agreement.
    if (metaWindow) this.layoutController?.clearOpenPendingForSettle?.(metaWindow);
    // CL8: drop deferred mark (window is gone; no unhide needed).
    if (metaWindow) takeDeferredOpen(this._deferredOpenStore, metaWindow);
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
   * Bug #470 / #258: snapshot focus-restore inputs before removeNode detaches.
   * FC1: ids for pickFocusAfterClose (LFT → next/prev sibling → workspace).
   */
  _captureFocusRestore(closedNodeWindow) {
    const parent = closedNodeWindow.parentNode;
    const windowChildren = parent
      ? parent.childNodes.filter((node) => node.isWindow() && node.nodeValue)
      : [];
    const closedMeta = closedNodeWindow.nodeValue;
    const closedId = this._metaWindowId(closedMeta);
    const preCloseChildIds = windowChildren.map((n) => this._metaWindowId(n.nodeValue));
    const siblingIds = windowChildren
      .filter((node) => node !== closedNodeWindow)
      .map((n) => this._metaWindowId(n.nodeValue))
      .filter((id) => id != null);
    // Closed node already dropped from lftMru in windowDestroy.
    const lftMruIds = (this.lftMru?.globalOrder?.() ?? [])
      .map((n) => this._metaWindowId(n?.nodeValue))
      .filter((id) => id != null);
    const workspaceNode = this.tree.findAncestor(closedNodeWindow, NODE_TYPES.WORKSPACE);
    return {
      closedId,
      closedNodeWindow,
      siblingIds,
      preCloseChildIds,
      lftMruIds,
      workspaceNode,
    };
  }

  /** Stable Meta id for focus-after-close policy (stringable). */
  _metaWindowId(metaWindow) {
    if (!metaWindow) return null;
    try {
      if (typeof metaWindow.get_id === "function") return metaWindow.get_id();
    } catch (_e) {
      /* disposed */
    }
    return metaWindow;
  }

  _findMetaWindowById(id) {
    if (id == null || !this.tree) return null;
    const want = String(id);
    const nodes = this.tree.getNodeByType?.(NODE_TYPES.WINDOW) ?? [];
    for (const node of nodes) {
      const meta = node?.nodeValue;
      if (!meta) continue;
      if (String(this._metaWindowId(meta)) === want) return meta;
    }
    return null;
  }

  _restoreFocusAfterWindowClosed(restore) {
    if (!restore) return;

    Logger.debug(`Restoring focus after window closed`);

    const activate = (metaWindow) => {
      if (!metaWindow || metaWindow.minimized) return false;
      // CL8: never raise/activate a still-hidden deferred map.
      if (this._isDeferredOpen(metaWindow)) return false;
      metaWindow.raise();
      metaWindow.focus(global.display.get_current_time());
      metaWindow.activate(global.display.get_current_time());
      return true;
    };

    const workspaceCandidateIds = [];
    const wsNode = restore.workspaceNode;
    if (wsNode) {
      for (const node of wsNode.getNodeByType(NODE_TYPES.WINDOW)) {
        if (node === restore.closedNodeWindow || !node.nodeValue) continue;
        try {
          if (node.nodeValue.get_window_type() !== Meta.WindowType.NORMAL) continue;
        } catch (_e) {
          continue;
        }
        const id = this._metaWindowId(node.nodeValue);
        if (id != null) workspaceCandidateIds.push(id);
      }
    }

    const pick = pickFocusAfterClose({
      closedId: restore.closedId,
      siblingIds: restore.siblingIds,
      preCloseChildIds: restore.preCloseChildIds,
      lftMruIds: restore.lftMruIds,
      workspaceCandidateIds,
    });
    if (!pick?.id) return;

    const meta = this._findMetaWindowById(pick.id);
    if (meta && activate(meta)) return;

    // Stale id after collapse: fall back to first live workspace NORMAL.
    for (const id of workspaceCandidateIds) {
      if (String(id) === String(pick.id)) continue;
      const m = this._findMetaWindowById(id);
      if (m && activate(m)) return;
    }
  }

  /**
   * Handles any workspace/monitor update for the Meta.Window.
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
      // R012: drop owns mon while GRAB_TILE (workspace/track paths too).
      if (
        existNodeWindow &&
        (existNodeWindow.isGrabTile?.() ||
          existNodeWindow.mode === WINDOW_MODES.GRAB_TILE ||
          this._draggedNodeWindow === existNodeWindow)
      ) {
        return;
      }
      let metaMonWs = Utils.createMonitorWorkspaceId(
        metaWindow.get_monitor(),
        metaWindow.get_workspace().index()
      );
      let metaMonWsNode = this.tree.findNode(metaMonWs);
      if (existNodeWindow) {
        if (existNodeWindow.parentNode && metaMonWsNode) {
          // Uses the existing workspace, monitor that the metaWindow
          // belongs to.
          let containsWindow = metaMonWsNode.contains(existNodeWindow);
          if (!containsWindow) {
            this.lftMru?.dropMonRings?.(existNodeWindow);
            this._rehomeWindowPreservingContainer(existNodeWindow, metaWindow, metaMonWsNode);

            // Ensure that the workspace tiling is honored
            if (this.isActiveWindowWorkspaceTiled(metaWindow)) {
              if (this.grabOp !== Meta.GrabOp.WINDOW_BASE) this.updateTabbedFocus(existNodeWindow);
              this.updateStackedFocus(existNodeWindow);
            } else {
              // forge-5l9b: skip floats demoted under a fullscreen window —
              // raise() would silently undo _reconcileFullscreenFloatDemotion.
              if (
                this.floatingWindow(existNodeWindow) &&
                !existNodeWindow._aboveDemotedForFullscreen &&
                !this._isDeferredOpen(metaWindow)
              ) {
                existNodeWindow.nodeValue.raise();
              }
            }
          }
        }
      }
      this.renderTree(from);
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
   * window moves. Lone-window rehomes prefer after dest-mon LFT (not mon root)
   * so open-under-focus / dock map thrash does not flatten to mon-root end.
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

    // Lone window: attach after dest mon LFT when present (keeps open-under-focus).
    if (
      nodeToMove === existNodeWindow &&
      this._rehomeAttachAfterMonLft(existNodeWindow, destNode)
    ) {
      if (!sourceFullyMigrates && sourceParent) {
        this.tree.redistributeSiblingPercent(sourceParent);
      }
      return;
    }

    destNode.appendChild(nodeToMove);
    // Only rebalance the source if it keeps windows. A fully-migrating source is
    // emptying, and rescaling it would corrupt the proportions the departing
    // windows carry to the destination.
    if (!sourceFullyMigrates) {
      this.tree.redistributeSiblingPercent(sourceParent);
    }
  }

  /**
   * Insert a rehomed window after dest-mon LFT (or focused tile on that mon).
   * @param {Node} existNodeWindow
   * @param {Node} destMonNode
   * @returns {boolean} true if reparented after LFT
   */
  _rehomeAttachAfterMonLft(existNodeWindow, destMonNode) {
    if (!existNodeWindow || !destMonNode || !destMonNode.contains) return false;
    if (destMonNode.contains(existNodeWindow)) return false;

    const monIdx = this._monitorIndexOfNode(destMonNode);
    let attachLft = monIdx >= 0 ? this.lftMru?.monHead?.(monIdx) ?? null : null;
    if (attachLft?.nodeValue) {
      const live = this.tree.findNode(attachLft.nodeValue);
      if (live) attachLft = live;
    }
    // Focused tile on dest mon beats stale mon LFT.
    const focusMeta = this.focusMetaWindow;
    if (focusMeta) {
      const focusNode = this.tree.findNode(focusMeta);
      if (
        focusNode?.isWindow?.() &&
        focusNode.isTile?.() &&
        !focusNode.isFloat?.() &&
        focusNode !== existNodeWindow &&
        destMonNode.contains(focusNode)
      ) {
        attachLft = focusNode;
      }
    }
    if (!attachLft || attachLft === existNodeWindow) return false;
    if (!destMonNode.contains(attachLft)) return false;

    // Same insert-A helper as trackWindow (residual / rehome admit).
    const unit = this._resolveInsertUnit(attachLft) || attachLft;
    const leftoverSlot = this._hvSlotToJoin(unit);
    if (leftoverSlot) {
      leftoverSlot.layout = this._layoutFromOrientation(this._orientationFromUnit(leftoverSlot));
      leftoverSlot.appendChild(existNodeWindow);
    } else {
      this._maybeAspectSplitForOpen(attachLft);
      this.slotSplitForInsert(unit);
      if (!unit?.parentNode) return false;
      unit.parentNode.insertBefore(existNodeWindow, unit.nextSibling);
    }
    try {
      this.tree.insertChildPercent(existNodeWindow.parentNode, existNodeWindow);
    } catch (_e) {
      /* best-effort share */
    }
    return true;
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
    if (this._wmSources.has("windowHomeReconcile")) return;
    this._wmSources.setIdle("windowHomeReconcile", () => {
      this._reconcileWindowHomes();
      this.trackCurrentMonWs();
      this.renderTree("workspace-changed-reconcile");
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
   *
   * CL2 / D026 attribution:
   *  - Stack suppress OR active command echo epoch → chrome only
   *  - TILE already in slot → chrome only
   *  - Unsolicited TILE max / Meta-fs / size → slot restore
   *  - Other external drift → markUnsettled + diagnostic requestVerify
   */
  updateMetaPositionSize(_metaWindow, from) {
    // Our move/apply re-fires size/position; do not treat as external thrash.
    // Stack suppress covers in-call re-entrancy; echo epoch covers residual snap.
    // Borders only — full decoration hide/show would thrash every mon's tab
    // strip after each forge move (tab reassert / render apply).
    if (isForgeCausedGeometrySignal(this, _metaWindow)) {
      this.updateBorderLayout();
      return;
    }

    // CL4: external geom on a pending open resets quiet; no early requestLayout.
    // Runs before focus gates so thrashy clients (Ghostty) still extend quiet.
    if (_metaWindow && this._openCommitPending?.has(_metaWindow)) {
      this._touchOpenCommitExternalGeometry(_metaWindow);
      const cls = extractWmClass(_metaWindow);
      if (cls && this.appThrashCatalog && /size/i.test(from || "")) {
        this.appThrashCatalog.recordPostMapSizeChange(cls);
      }
      this.updateBorderLayout();
      return;
    }

    let focusMetaWindow = this.focusMetaWindow;
    let focusNodeWindow = focusMetaWindow ? this.findNodeWindow(focusMetaWindow) : null;
    let tilingModeEnabled = this.ext.settings.get_boolean("tiling-mode-enabled");
    let changedNode = this.findNodeWindow(_metaWindow);

    if (focusNodeWindow?.grabMode && tilingModeEnabled) {
      // forge-v4wh: max/fs inside the keyboard-resize debounce must not feed
      // _handleResizing (that bakes the full-monitor frame into split percents).
      if (this._shouldRejectExternalMaximize(focusNodeWindow, focusMetaWindow)) {
        this._wmSources.cancel("manualResizeEnd");
        this._manualResizeEndWindow = null;
        this._grabCleanup(focusNodeWindow);
        this._restoreTileToSlot(focusNodeWindow, focusMetaWindow);
      } else if (
        focusNodeWindow.grabMode === GRAB_TYPES.RESIZING &&
        Compat.getMaximizeFlags(focusMetaWindow) === 0 &&
        !(focusMetaWindow.is_fullscreen && focusMetaWindow.is_fullscreen())
      ) {
        this._handleResizing(focusNodeWindow);
      } else if (focusNodeWindow.grabMode === GRAB_TYPES.MOVING) {
        this._handleMoving(focusNodeWindow);
      }
    } else if (this._shouldRestoreTileSlot(changedNode, _metaWindow)) {
      this._restoreTileToSlot(changedNode, _metaWindow);
    } else if (focusNodeWindow && Compat.isNotMaximized(focusMetaWindow)) {
      if (!this._tiledWindowAtTreeSlot(changedNode, _metaWindow)) {
        if (this.layoutController) {
          this.layoutController.onExternalGeometry(from || "external-geometry", _metaWindow);
        } else {
          this.renderTree(from);
        }
      }
    }
    this.updateBorderLayout();
    // Full decoration hide/show is expensive (all mons). Skip when:
    //  - grab path needs live strip (below), or covering max/fs needs hide;
    //  - otherwise renderTree owns strip restack after layout, and in-slot
    //    external geom must not flash the other monitor's TABBED group.
    const grabLive = !!(focusNodeWindow?.grabMode && tilingModeEnabled);
    const covering =
      !!focusMetaWindow &&
      (Compat.isMaximized(focusMetaWindow) ||
        !!(focusMetaWindow.is_fullscreen && focusMetaWindow.is_fullscreen()));
    if (grabLive || covering) {
      this.updateDecorationLayout();
    }
  }

  /**
   * True when a TILE node frame already matches its tree slot (renderRect/rect)
   * within LAYOUT_VERIFY_EPSILON_PX. Full re-layout is unnecessary then.
   */
  _tiledWindowAtTreeSlot(node, metaWindow) {
    return shouldChromeOnlyGeometry(node, metaWindow, LAYOUT_VERIFY_EPSILON_PX, {
      isMaximized: (mw) => Compat.getMaximizeFlags(mw) !== 0,
    });
  }

  /**
   * Reassert one TILE node to its tree slot via move(). No processNode.
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ force?: boolean }} [opts]
   * @returns {boolean} true when move was attempted
   */
  reassertNodeToSlot(node, opts = {}) {
    if (!node) return false;
    const mode = node.mode;
    if (mode != null && mode !== WINDOW_MODES.TILE && mode !== "TILE") return false;
    const meta = node.nodeValue;
    if (!meta) return false;
    const slot = node.renderRect || node.rect;
    if (!slot || !(slot.width > 0) || !(slot.height > 0)) return false;
    const force = !!opts.force;
    if (!force && this._tiledWindowAtTreeSlot(node, meta)) return false;
    this.move(meta, slot, null, { force });
    return true;
  }

  /**
   * Targeted Meta↔slot reassert by Meta window id (verify recovery).
   * @param {Array<string|number|null|undefined>} ids
   * @param {{ force?: boolean }} [opts]
   * @returns {number} how many nodes were reasserted
   */
  reassertTilesByIds(ids, opts = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const want = new Set(ids.filter((id) => id != null).map((id) => String(id)));
    if (want.size === 0) return 0;
    let nodes = [];
    if (Array.isArray(this.allNodeWindows)) {
      nodes = this.allNodeWindows;
    } else if (this.tree && typeof this.tree.getNodeByType === "function") {
      try {
        nodes = this.tree.getNodeByType(NODE_TYPES.WINDOW) ?? [];
      } catch (_e) {
        nodes = [];
      }
    }
    let n = 0;
    for (const node of nodes) {
      if (!node) continue;
      const meta = node.nodeValue;
      if (!meta) continue;
      let id = null;
      try {
        if (typeof meta.get_id === "function") id = meta.get_id();
        else if (meta.id != null) id = meta.id;
      } catch (_e) {
        id = null;
      }
      if (id == null || !want.has(String(id))) continue;
      if (this.reassertNodeToSlot(node, opts)) n += 1;
    }
    return n;
  }

  /**
   * Grab-time max/fs: restore instead of feeding _handleResizing.
   * Lone-tile maximize-on-single is left alone.
   */
  _shouldRejectExternalMaximize(node, metaWindow) {
    return this._shouldRestoreTileSlot(node, metaWindow, { forGrab: true });
  }

  _shouldRestoreTileSlot(node, metaWindow, extra = null) {
    return shouldRestoreTileSlot(node, metaWindow, LAYOUT_VERIFY_EPSILON_PX, {
      isMaximized: (mw) => Compat.getMaximizeFlags(mw) !== 0,
      isLoneMaximized: (n) => this._isLoneMaximizedTile(n),
      tilingEnabled: this.ext.settings.get_boolean("tiling-mode-enabled"),
      ...(extra || {}),
    });
  }

  _restoreTileToSlot(node, metaWindow) {
    if (!node || !metaWindow) return;
    this._suppressGeom.run(() => {
      if (typeof metaWindow.unmake_fullscreen === "function" && metaWindow.is_fullscreen?.()) {
        metaWindow.unmake_fullscreen();
      }
      if (Compat.getMaximizeFlags(metaWindow) !== 0) {
        Compat.unmaximize(metaWindow);
      }
      this.reassertNodeToSlot(node, { force: true });
    });
  }

  /**
   * Lone TILE maximize-on-single. Signal restore and tree.apply leave this
   * alone. Fullscreen is not lone-max (IC3 restores it).
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
        this.renderTree(settingName);
        break;
      case "layout-debug-overlay-enabled":
        if (settings.get_boolean(settingName)) {
          this.layoutDebugOverlay?.update();
        } else {
          this.layoutDebugOverlay?.destroyAll();
        }
        break;
      case "preview-hint-enabled":
        // Never leave a dim overlay when the user turns hints off mid-drag.
        if (!settings.get_boolean(settingName)) {
          this.dragDrop?.clearAllPreviewHints?.();
        }
        break;
      case "layout-verify-interval-ms":
        this._syncLayoutVerifyInterval();
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
        // Restyle existing borders/tabs after theme sheet swap.
        this.updateDecorationLayout();
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

  /** R015 empty-mon grab-end rehome (session-api / live matrix). */
  _commitEmptyMonitorDrop(...a) {
    return this.dragDrop._commitEmptyMonitorDrop(...a);
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
   * mode: "ignore" — user config: Forge never manages this window (no tree node,
   * no float decorations/process, no session layout claim). Stronger than float.
   * Match rules share _matchesFloatRule (class / title / id). No hard-coded brands.
   */
  isWindowIgnored(metaWindow) {
    if (!metaWindow) return false;
    const overrides = this.windowProps?.overrides;
    if (!overrides?.length) return false;
    return overrides.some((kf) => kf.mode === "ignore" && this._matchesFloatRule(kf, metaWindow));
  }

  isFloatingExempt(metaWindow) {
    if (!metaWindow) return true;
    // Safety: if an ignored window is somehow still in the tree, never tile it.
    if (this.isWindowIgnored(metaWindow)) return true;
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
      // Drop already-tracked matches. Use _tree (not tree getter): constructor
      // calls reload before assigning this._tree; the getter would create a
      // throwaway Tree and double-bind workspace signals (forge-gw2c).
      if (this._tree) this._dropAllIgnoredWindows();
    }
  }

  /**
   * Drop every currently tracked window that matches a mode: "ignore" override.
   * Snapshot the list first — removeNode mutates the tree while we walk it.
   */
  _dropAllIgnoredWindows() {
    if (!this._tree) return;
    const windows = this._tree.getNodeByType(NODE_TYPES.WINDOW) ?? [];
    for (const node of [...windows]) {
      const meta = node?.nodeValue;
      if (meta) this._dropIfIgnored(meta);
    }
  }

  /**
   * If metaWindow matches mode: "ignore", remove it from the tree (no float
   * node, no decorations, no further layout). Window may still be alive —
   * disconnect forge window signals so we stay hands-off.
   * @returns {boolean} true when ignored (whether or not a node existed)
   */
  _dropIfIgnored(metaWindow) {
    if (!metaWindow || !this.isWindowIgnored(metaWindow)) return false;

    const nodeWindow = this.tree.findNode(metaWindow);
    if (!nodeWindow) return true;

    if (this.lastFocusedWindow === nodeWindow) {
      this.lastFocusedWindow = null;
    }
    this.lftMru?.remove(nodeWindow);
    this._cancelOpenCommit(metaWindow);
    this.layoutController?.clearOpenPendingForSettle?.(metaWindow);
    takeDeferredOpen(this._deferredOpenStore, metaWindow);

    const windowActor = metaWindow.get_compositor_private?.();
    if (windowActor) {
      this._destroyActorBorder(windowActor, "border");
      this._destroyActorBorder(windowActor, "splitBorder");
    }

    if (metaWindow.windowSignals) {
      for (const id of metaWindow.windowSignals) {
        try {
          metaWindow.disconnect(id);
        } catch (_e) {
          /* already disconnected */
        }
      }
      metaWindow.windowSignals = null;
    }

    this.tree.removeNode(nodeWindow);
    this.renderTree("window-ignored", true);
    Logger.info(
      `Ignore override: dropped ${metaWindow.get_title?.()} (${metaWindow.get_wm_class?.()})`
    );
    return true;
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
