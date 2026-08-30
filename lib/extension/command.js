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
import GObject from "gi://GObject";
import Meta from "gi://Meta";

// Shared state
import { Logger } from "../shared/logger.js";
import { getOpSet } from "../opsets/index.js";
import { fail } from "../tom/index.js";

// App imports
import { NODE_TYPES, LAYOUT_TYPES } from "./tree.js";
import * as Utils from "./utils.js";
import { runLiveForest, runMark2 } from "./forest-run.js";
import { recordFallback } from "./metrics.js";
import { forestSwapWindows } from "./tom-live.js";

const DIRS = new Set(["left", "down", "up", "right"]);

const SIZE_SHARE_SPECS = Object.freeze({
  "size.share": Object.freeze({ self: true }),
  "size.shareSiblings": Object.freeze({ self: true, siblings: true }),
  "size.shareSiblingsOnly": Object.freeze({ siblings: true }),
  "size.shareSelfSiblingsParent": Object.freeze({
    self: true,
    siblings: true,
    parent: true,
  }),
  "size.shareParent": Object.freeze({ parent: true }),
  "size.shareParentGroup": Object.freeze({ parent: true, parentSiblings: true }),
  "size.shareParentSiblingsOnly": Object.freeze({ parentSiblings: true }),
  "size.shareBothGroups": Object.freeze({
    self: true,
    siblings: true,
    parent: true,
    parentSiblings: true,
  }),
});

const SIZE_NUDGE = Object.freeze({
  "size.nudge.x-": Object.freeze(["x", -1]),
  "size.nudge.x+": Object.freeze(["x", 1]),
  "size.nudge.y-": Object.freeze(["y", -1]),
  "size.nudge.y+": Object.freeze(["y", 1]),
});

/** @param {Object} action */
function canonicalCommandName(action) {
  const name = action?.name;
  if (!name || typeof name !== "string") return name;
  const dotted = /^(focus|move|join)\.(left|down|up|right|parent|child)$/i.exec(name);
  if (dotted) return `${dotted[1].toLowerCase()}.${dotted[2].toLowerCase()}`;
  if (name === "FocusParent") return "focus.parent";
  if (name === "FocusChild") return "focus.child";
  if (name === "LayoutToggle" || name === "Split") return "toggleSplit";
  if (
    name === "LayoutStackTabToggle" ||
    name === "LayoutStackedToggle" ||
    name === "LayoutTabbedToggle"
  ) {
    return "toggleTabStack";
  }
  if (name === "WindowUngroup") return "promote";
  const dir = action.direction != null ? String(action.direction).toLowerCase() : "";
  if (DIRS.has(dir)) {
    if (name === "Focus" || name === "focus") return `focus.${dir}`;
    if (name === "Move" || name === "move") return `move.${dir}`;
    if (name === "Swap" || name === "swap") return `join.${dir}`;
  }
  return name;
}

/** @param {Object} action */
function dirFromAction(action) {
  const m = /^(?:focus|move|join)\.(left|down|up|right)$/i.exec(action?.name || "");
  if (m) return m[1].toLowerCase();
  if (action?.direction) return String(action.direction).toLowerCase();
  return null;
}

/** @param {import('./window.js').WindowManager} wm @param {any} focusNodeWindow */
function runToggleTabStack(wm, focusNodeWindow) {
  const stackOn = !!wm.ext?.settings?.get_boolean?.("stacked-tiling-mode-enabled");
  const tabOn = !!wm.ext?.settings?.get_boolean?.("tabbed-tiling-mode-enabled");
  if (!stackOn && !tabOn) return;
  runLiveForest(
    wm,
    focusNodeWindow,
    (draft, api) => {
      const r = getOpSet("mark2").ops.toggleTabStack(draft, api);
      if (!r?.ok) return r;
      if (r.layout === "TABBED" && !tabOn) return fail("tabbed disabled");
      if (r.layout === "STACKED" && !stackOn) return fail("stacked disabled");
      return r;
    },
    "toggleTabStack"
  );
}

/** @param {any} n */
function isTiledWindowNode(n) {
  if (!n || n.nodeType !== NODE_TYPES.WINDOW) return false;
  if (typeof n.isFloat === "function" && n.isFloat()) return false;
  return true;
}

/** @param {any} focusNodeWindow @param {any} partner */
function joinDirTowardSibling(focusNodeWindow, partner) {
  const parent = focusNodeWindow?.parentNode;
  if (!parent || !partner || partner.parentNode !== parent) return null;
  const kids = parent.childNodes || [];
  const i = kids.indexOf(focusNodeWindow);
  const j = kids.indexOf(partner);
  if (i < 0 || j < 0 || i === j) return null;
  const vert = parent.layout === LAYOUT_TYPES.VSPLIT;
  return j < i ? (vert ? "up" : "left") : vert ? "down" : "right";
}

/** @param {import('./window.js').WindowManager} wm @param {any} focusNodeWindow */
function partnerForJoin(wm, focusNodeWindow) {
  const parent = focusNodeWindow?.parentNode;
  if (!parent || !wm?.tree) return null;
  const sibs = [];
  for (const n of parent.childNodes || []) {
    if (n !== focusNodeWindow && isTiledWindowNode(n)) sibs.push(n);
  }
  if (!sibs.length) return null;
  try {
    const last = global.display.get_tab_next(
      Meta.TabList.NORMAL,
      global.display.get_workspace_manager().get_active_workspace(),
      focusNodeWindow.nodeValue,
      false
    );
    if (last && last !== focusNodeWindow.nodeValue) {
      const node = wm.findNodeWindow(last);
      if (node && sibs.includes(node)) return node;
    }
  } catch (_e) {
    /* no tab list */
  }
  return sibs[0];
}

/** @param {any} n */
function isConNode(n) {
  return !!(n && (n.nodeType === NODE_TYPES.CON || n.isCon?.()));
}

/** @param {any} n */
function isMoveCeiling(n) {
  if (!n) return true;
  const t = n.nodeType;
  if (t === NODE_TYPES.MONITOR || t === NODE_TYPES.WORKSPACE || t === NODE_TYPES.ROOT) return true;
  return !!(n.isMonitor?.() || n.isWorkspace?.() || n.isRoot?.());
}

/** @param {any} focusNodeWindow */
function adjacentSiblingCon(focusNodeWindow) {
  const parent = focusNodeWindow?.parentNode;
  if (!parent) return null;
  const kids = parent.childNodes || [];
  const idx = kids.indexOf(focusNodeWindow);
  if (idx < 0) return null;
  for (const n of [kids[idx + 1], kids[idx - 1]]) {
    if (isConNode(n) && !isMoveCeiling(n)) return n;
  }
  return null;
}

/** @param {any} focusNodeWindow @param {number} offset */
function inAxisMoveDir(focusNodeWindow, offset) {
  const parent = focusNodeWindow?.parentNode;
  if (!parent) return null;
  const vert = parent.layout === LAYOUT_TYPES.VSPLIT;
  if (offset > 0) return vert ? "down" : "right";
  return vert ? "up" : "left";
}

/** @param {any} focusNodeWindow */
function crossAxisMoveDir(focusNodeWindow) {
  const parent = focusNodeWindow?.parentNode;
  if (!parent || isMoveCeiling(parent)) return null;
  return parent.layout === LAYOUT_TYPES.VSPLIT ? "right" : "down";
}

/**
 * CommandHandler processes keyboard and action commands for the window manager.
 */
export class CommandHandler extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /**
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(extWm) {
    super();
    this._extWm = extWm;
    this._buildHandlers();
  }

  /**
   * Execute a command action
   * @param {Object} action - The action to execute
   * @param {string} action.name - The command name
   */
  execute(action) {
    const wm = this._extWm;
    const ctx = {
      wm,
      focusWindow: wm.focusMetaWindow,
      focusNodeWindow: wm.findNodeWindow(wm.focusMetaWindow),
    };
    const name = canonicalCommandName(action);
    const handler = this._handlers[name];
    // Unknown action names are a no-op.
    if (handler) handler({ ...action, name }, ctx);
  }

  /**
   * Build the action-name -> handler registry. Each handler receives
   * `(action, ctx)` where `ctx = { wm, focusWindow, focusNodeWindow }`. Handlers
   * that reassign `focusNodeWindow` destructure it as a local (`let`); no handler
   * reads another's reassignment, so the ctx field is never mutated in place.
   */
  _buildHandlers() {
    // Float toggles share one body and branch on action.name internally via
    // wm.toggleFloatingMode(action, ...).
    const floatToggle = (action, ctx) => {
      const { wm, focusWindow, focusNodeWindow } = ctx;
      // No tracked focus window (empty desktop, or focus on an untracked
      // window type): toggleFloatingMode would no-op, but the rect/parent
      // work below dereferences both — bail like the other cases do.
      if (!focusNodeWindow) return;
      wm.toggleFloatingMode(action, focusWindow);

      const rectRequest = {
        x: action.x,
        y: action.y,
        width: action.width,
        height: action.height,
      };

      wm.move(focusWindow, Utils.resolveRect(rectRequest, focusWindow));

      let existParent = focusNodeWindow.parentNode;
      // FLOATS members may already be detached from TILES (Forest SoT).
      if (existParent) {
        if (wm.tree.getTiledChildren(existParent.childNodes).length <= 1) {
          existParent.percent = 0.0;
          existParent.userSized = false;
          wm.tree.resetSiblingPercent(existParent.parentNode);
        }
        wm.tree.resetSiblingPercent(existParent);
      }
      // RunSteps/batch: freeze owns residual C — M only while frozen (no mid-batch Cf).
      if (!wm._freezeRender) {
        wm.commitLayout("float-toggle", { force: true });
      }
    };

    // Leaf activate only — focusParent/focusChild already set tree.focusUnit.
    const applyFocusTarget = (wm, win, source) => {
      if (!win) return;
      if (win.parentNode?.isStackedOrTabbed?.()) {
        wm.revealGroupChild(win, { keyboard: true, source });
      } else {
        if (typeof wm.tree?._activateWindowNode === "function") {
          wm.tree._activateWindowNode(win, undefined);
        }
        wm.afterFocus(win, { source });
      }
    };

    // FocusNext/FocusPrev share one body and branch on action.name internally.
    const focusSibling = (action, ctx) => {
      const { wm } = ctx;
      let { focusNodeWindow } = ctx;
      if (wm.tree) wm.tree.focusUnit = null;
      // Cyclic, non-directional focus among tiled siblings (forge-zrl).
      const offset = action.name === "FocusNext" ? 1 : -1;
      const focused = wm.tree.focusSibling(focusNodeWindow, offset);
      if (focused) focusNodeWindow = focused;
      if (!focusNodeWindow) {
        focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
      }
      if (wm.tree && focusNodeWindow) wm.tree.focusUnit = focusNodeWindow;
      wm.afterFocus(focusNodeWindow, { source: "command-focus-sibling" });
    };

    // SwapNext/SwapPrev: Host-picked in-axis Move (Mark 2 wrap at edge).
    const swapAlongAxis = (action, ctx) => {
      const { wm, focusNodeWindow } = ctx;
      if (!focusNodeWindow) return;
      const dir = inAxisMoveDir(focusNodeWindow, action.name === "SwapNext" ? 1 : -1);
      if (!dir) return;
      runMark2(wm, focusNodeWindow, "move", dir, "move-window");
    };

    this._handlers = {
      FloatNonPersistentToggle: floatToggle,
      FloatToggle: floatToggle,
      FloatClassToggle: floatToggle,

      Focus: (action, ctx) => {
        const { wm } = ctx;
        let { focusNodeWindow } = ctx;
        if (wm.tree) wm.tree.focusUnit = null;
        const focusDirection = Utils.resolveDirection(dirFromAction(action));
        focusNodeWindow = wm.tree.focus(focusNodeWindow, focusDirection);
        if (!focusNodeWindow) {
          focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
        }
        if (wm.tree && focusNodeWindow) wm.tree.focusUnit = focusNodeWindow;
        wm.afterFocus(focusNodeWindow, { source: "command-focus" });
      },

      // C4 / REG-focus-parent: i3 $mod+a class — elevate to parent CON unit.
      "focus.parent": (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || !wm.tree?.focusParent) return;
        const win = wm.tree.focusParent(focusNodeWindow);
        applyFocusTarget(wm, win, "command-focus-parent");
      },

      "focus.child": (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || !wm.tree?.focusChild) return;
        const win = wm.tree.focusChild(focusNodeWindow);
        applyFocusTarget(wm, win, "command-focus-child");
      },

      WindowMoveIn: (_action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || focusNodeWindow.isFloat?.()) return;
        const dir = joinDirTowardSibling(focusNodeWindow, adjacentSiblingCon(focusNodeWindow));
        if (!dir) return;
        runMark2(wm, focusNodeWindow, "join", dir, "join");
      },

      WindowMoveOut: (_action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || focusNodeWindow.isFloat?.()) return;
        const dir = crossAxisMoveDir(focusNodeWindow);
        if (!dir) return;
        runMark2(wm, focusNodeWindow, "move", dir, "move-window");
      },

      Move: (action, ctx) => {
        runMark2(ctx.wm, ctx.focusNodeWindow, "move", dirFromAction(action), "move-window");
      },
      Swap: (action, ctx) => {
        runMark2(ctx.wm, ctx.focusNodeWindow, "join", dirFromAction(action), "join");
      },

      FocusNext: focusSibling,
      FocusPrev: focusSibling,

      SwapNext: swapAlongAxis,
      SwapPrev: swapAlongAxis,

      toggleSplit: (_action, ctx) => {
        runLiveForest(
          ctx.wm,
          ctx.focusNodeWindow,
          (draft, api) => getOpSet("mark2").ops.toggleSplit(draft, api),
          "toggleSplit"
        );
      },

      FocusBorderToggle: (action, ctx) => {
        const { wm } = ctx;
        let focusBorderEnabled = wm.ext.settings.get_boolean("focus-border-toggle");
        wm.ext.settings.set_boolean("focus-border-toggle", !focusBorderEnabled);
      },

      LayoutDebugOverlayToggle: (action, ctx) => {
        const { wm } = ctx;
        const enabled = wm.ext.settings.get_boolean("layout-debug-overlay-enabled");
        wm.ext.settings.set_boolean("layout-debug-overlay-enabled", !enabled);
      },

      TilingModeToggle: (action, ctx) => {
        const { wm } = ctx;
        // This toggle preserves tree state while disabling tiling, unlike Extension.disable()
        // which completely tears down the extension. Useful for temporarily floating all windows.
        let tilingModeEnabled = wm.ext.settings.get_boolean("tiling-mode-enabled");
        wm.ext.settings.set_boolean("tiling-mode-enabled", !tilingModeEnabled);
        if (tilingModeEnabled) {
          wm.floatAllWindows();
        } else {
          wm.unfloatAllWindows();
        }
        wm.commitLayout(`tiling-mode-toggle ${!tilingModeEnabled}`, { force: true });
      },

      GapSize: (action, ctx) => {
        const { wm } = ctx;
        let gapIncrement = wm.ext.settings.get_uint("window-gap-size-increment");
        let amount = action.amount;
        gapIncrement = gapIncrement + amount;
        if (gapIncrement < 0) gapIncrement = 0;
        if (gapIncrement > 32) gapIncrement = 32;
        wm.ext.settings.set_uint("window-gap-size-increment", gapIncrement);
      },

      WindowResetSizes: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (focusNodeWindow && focusNodeWindow.parentNode) {
          wm.tree.resetSiblingPercent(focusNodeWindow.parentNode);
          if (focusNodeWindow.parentNode.parentNode) {
            wm.tree.resetSiblingPercent(focusNodeWindow.parentNode.parentNode);
          }
          wm.commitLayout("window-reset-sizes", { force: true });
        }
      },

      WorkspaceActiveTileToggle: (action, ctx) => {
        const { wm } = ctx;
        let activeWorkspace = global.workspace_manager.get_active_workspace_index();
        let skippedWorkspaces = wm.ext.settings.get_string("workspace-skip-tile");
        let skippedArr = skippedWorkspaces.length === 0 ? [] : skippedWorkspaces.split(",");

        if (wm._isWorkspaceSkipped(activeWorkspace)) {
          skippedArr.splice(skippedArr.indexOf(`${activeWorkspace}`), 1);
          wm.unfloatWorkspace(activeWorkspace);
        } else {
          skippedArr.push(`${activeWorkspace}`);
          wm.floatWorkspace(activeWorkspace);
        }
        wm.ext.settings.set_string("workspace-skip-tile", skippedArr.toString());
        wm.commitLayout("workspace-toggle", { force: true });
      },

      toggleTabStack: (_action, ctx) => {
        runToggleTabStack(ctx.wm, ctx.focusNodeWindow);
      },

      WindowMergeGroup: (_action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || focusNodeWindow.isFloat?.()) return;
        const dir = joinDirTowardSibling(focusNodeWindow, partnerForJoin(wm, focusNodeWindow));
        if (!dir) return;
        runMark2(wm, focusNodeWindow, "join", dir, "join");
      },

      promote: (_action, ctx) => {
        runLiveForest(
          ctx.wm,
          ctx.focusNodeWindow,
          (draft, api) => getOpSet("mark2").ops.promote(draft, api),
          "promote"
        );
      },

      promoteRecursive: (_action, ctx) => {
        runLiveForest(
          ctx.wm,
          ctx.focusNodeWindow,
          (draft, api) => getOpSet("mark2").ops.promoteRecursive(draft, api),
          "promoteRecursive"
        );
      },

      "layout.cycle+": (_action, ctx) => {
        runLiveForest(
          ctx.wm,
          ctx.focusNodeWindow,
          (draft, api) => api.cycleLayout(draft, 1),
          "layout.cycle+"
        );
      },

      "layout.cycle-": (_action, ctx) => {
        runLiveForest(
          ctx.wm,
          ctx.focusNodeWindow,
          (draft, api) => api.cycleLayout(draft, -1),
          "layout.cycle-"
        );
      },

      PrefsOpen: (action, ctx) => {
        const { wm } = ctx;
        let existWindow = Utils.findWindowWith(wm.prefsTitle);
        if (existWindow && existWindow.get_workspace()) {
          existWindow
            .get_workspace()
            .activate_with_focus(existWindow, global.display.get_current_time());
          wm.moveCenter(existWindow);
        } else {
          wm.ext.openPreferences();
        }
      },

      ConfigReload: (action, ctx) => {
        const { wm } = ctx;
        // Keep live per-window (wmId) FloatToggle overrides from this session (forge-8rm6).
        wm.reloadWindowOverrides(false);
        // Also reimport settings and keybindings if portable config is enabled
        if (wm.ext.configSync) {
          wm.ext.configSync.importAll();
          Logger.info("Configuration and portable settings reloaded from files");
        } else {
          Logger.info("Window configuration reloaded from files");
        }
        // Re-read user stylesheet (Appearance / ~/.config/forge) without shell restart.
        if (wm.theme?.reloadStylesheet) {
          wm.theme.reloadStylesheet();
        }
        wm.updateDecorationLayout?.();
      },

      ConfigExport: (action, ctx) => {
        const { wm } = ctx;
        if (wm.ext.configSync) {
          wm.ext.configSync.enablePortableConfig();
          Logger.info("Configuration exported to portable config files");
        }
      },

      MovePointerToFocus: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (focusNodeWindow) {
          wm.movePointerWith(focusNodeWindow, { force: true });
        }
      },

      ZoomToggle: (_action, ctx) => {
        ctx.wm.toggleZoom("full");
      },

      ZoomHorizontal: (_action, ctx) => {
        ctx.wm.toggleZoom("horizontal");
      },

      ZoomVertical: (_action, ctx) => {
        ctx.wm.toggleZoom("vertical");
      },

      // Host SurfaceOp: last-active swap (not Mark 2 Move/Join).
      WindowSwapLastActive: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (focusNodeWindow) {
          let lastActiveWindow = global.display.get_tab_next(
            Meta.TabList.NORMAL,
            global.display.get_workspace_manager().get_active_workspace(),
            focusNodeWindow.nodeValue,
            false
          );
          let lastActiveNodeWindow = wm.findNodeWindow(lastActiveWindow);
          if (!forestSwapWindows(wm, lastActiveNodeWindow, focusNodeWindow)) {
            recordFallback("swapLastActive", "ids-miss");
            wm.tree.swapPairs(lastActiveNodeWindow, focusNodeWindow);
          }
          wm.commitLayout("swap-last-active", { force: true });
          wm.settleTabFocus(focusNodeWindow);
          wm.movePointerWith(focusNodeWindow);
        }
      },

      SnapLayoutMove: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        // forge-9s8c: guard-clause + early return so a falsy focus can't fall
        // through into the next handler (ShowTabDecorationToggle).
        // NOTE: the inner switch's `break`s stay as `break` (they exit the inner
        // switch, not the handler).
        if (!focusNodeWindow) return;
        let workareaRect = Utils.getWorkAreaSafe(focusNodeWindow.nodeValue);
        if (!workareaRect) return;
        let layoutAmount = action.amount;
        let layoutDirection = action.direction.toUpperCase();
        let layout = {};
        let processGap = false;

        switch (layoutDirection) {
          case "LEFT":
            layout.width = layoutAmount * workareaRect.width;
            layout.height = workareaRect.height;
            layout.x = workareaRect.x;
            layout.y = workareaRect.y;
            processGap = true;
            break;
          case "RIGHT":
            layout.width = layoutAmount * workareaRect.width;
            layout.height = workareaRect.height;
            layout.x = workareaRect.x + (workareaRect.width - layout.width);
            layout.y = workareaRect.y;
            processGap = true;
            break;
          case "CENTER":
            let metaRect = wm.focusMetaWindow.get_frame_rect();
            layout.x = "center";
            layout.y = "center";
            layout = {
              x: Utils.resolveX(layout, wm.focusMetaWindow),
              y: Utils.resolveY(layout, wm.focusMetaWindow),
              width: metaRect.width,
              height: metaRect.height,
            };
            break;
          default:
            break;
        }
        focusNodeWindow.rect = layout;
        if (processGap) {
          focusNodeWindow.rect = wm.tree.processGap(focusNodeWindow);
        }
        if (!focusNodeWindow.isFloat()) {
          // Snap floats THIS window instance only (withWmId=true), matching how
          // windowDestroy cleans it up. Using a class-wide override (false) leaked
          // a persistent float for the whole wm_class that windowDestroy's
          // per-window removeFloatOverride could never clear (forge-qh2/forge-fc6).
          wm.addFloatOverride(focusNodeWindow.nodeValue, true);
        }
        wm.move(focusNodeWindow.nodeValue, focusNodeWindow.rect);
        wm.queueEvent({
          name: "snap-layout-move",
          callback: () => {
            // Size/float geometry settle: one Cf after move.
            wm.commitLayout("snap-layout-move", { force: true });
          },
        });
      },

      ShowTabDecorationToggle: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        if (!wm.ext.settings.get_boolean("tabbed-tiling-mode-enabled")) return;

        let showTabs = wm.ext.settings.get_boolean("showtab-decoration-enabled");
        wm.ext.settings.set_boolean("showtab-decoration-enabled", !showTabs);

        // Chrome height can change slot layout — keep one C (was renderTree).
        wm.unfreezeRender();
        wm.tree.attachNode = focusNodeWindow.parentNode;
        wm.commitLayout("showtab-decoration-enabled", { force: true });
      },

      WindowResizeRight: (action, ctx) => {
        ctx.wm.resize(Meta.GrabOp.KEYBOARD_RESIZING_E, action.amount);
      },

      WindowResizeLeft: (action, ctx) => {
        ctx.wm.resize(Meta.GrabOp.KEYBOARD_RESIZING_W, action.amount);
      },

      WindowResizeTop: (action, ctx) => {
        ctx.wm.resize(Meta.GrabOp.KEYBOARD_RESIZING_N, action.amount);
      },

      WindowResizeBottom: (action, ctx) => {
        ctx.wm.resize(Meta.GrabOp.KEYBOARD_RESIZING_S, action.amount);
      },

      // forge-gm0z: the old four overlapping wm.resize() grabs all clobbered the
      // single shared this.grabOp, so only RESIZING_E survived and the window
      // never grew/shrank vertically. wm.expand/shrink adjust percents directly
      // on both axes, bypassing the async grab/signal machinery.
      WindowExpand: (action, ctx) => {
        ctx.wm.expand(action.amount);
      },

      WindowShrink: (action, ctx) => {
        ctx.wm.shrink(action.amount);
      },

      // forge-zlg: resize the focused window to the golden-ratio share of its
      // split, on demand. Single-axis and absolute (not a pixel delta like
      // expand/shrink), so it doesn't fight manual resize.
      WindowGoldenRatio: (action, ctx) => {
        ctx.wm.applyGoldenRatio();
      },
    };

    const focusDir = this._handlers.Focus;
    const moveDir = this._handlers.Move;
    const joinDir = this._handlers.Swap;
    for (const dir of DIRS) {
      this._handlers[`focus.${dir}`] = focusDir;
      this._handlers[`move.${dir}`] = moveDir;
      this._handlers[`join.${dir}`] = joinDir;
    }
    this._handlers.FocusParent = this._handlers["focus.parent"];
    this._handlers.FocusChild = this._handlers["focus.child"];
    this._handlers.LayoutToggle = this._handlers.toggleSplit;
    this._handlers.Split = this._handlers.toggleSplit;
    this._handlers.LayoutStackTabToggle = this._handlers.toggleTabStack;
    this._handlers.LayoutStackedToggle = this._handlers.toggleTabStack;
    this._handlers.LayoutTabbedToggle = this._handlers.toggleTabStack;
    this._handlers.WindowUngroup = this._handlers.promote;

    const sizeHandler = (action, ctx) => {
      const name = action.name;
      runLiveForest(
        ctx.wm,
        ctx.focusNodeWindow,
        (draft, api) => {
          const nudge = SIZE_NUDGE[name];
          if (nudge) {
            const [axis, sign] = nudge;
            return api.nudgeSize(draft, axis, sign * api.sizeStep());
          }
          const share = SIZE_SHARE_SPECS[name];
          if (share) return api.shareCombo(draft, share);
          if (name === "size.shareAll") return api.shareAllSizes(draft);
          const preset = /^size\.preset\.(\d)$/.exec(name);
          if (preset) return api.sizePreset(draft, Number(preset[1]));
          return fail(`unknown size ${name}`);
        },
        name
      );
    };
    for (const id of [
      ...Object.keys(SIZE_NUDGE),
      ...Object.keys(SIZE_SHARE_SPECS),
      "size.shareAll",
    ]) {
      this._handlers[id] = sizeHandler;
    }
    for (const key of ["7", "8", "9", "0"]) {
      this._handlers[`size.preset.${key}`] = sizeHandler;
    }
  }
}
