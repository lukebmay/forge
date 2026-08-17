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

// App imports
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "./tree.js";
import * as Utils from "./utils.js";

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
    const handler = this._handlers[action.name];
    // Unknown action names are a no-op.
    if (handler) handler(action, ctx);
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
      // Hardening: a detached focus node (no parentNode) would throw on the
      // childNodes deref below — bail like WindowResetSizes does (forge-t1s9).
      if (!existParent) return;

      if (wm.tree.getTiledChildren(existParent.childNodes).length <= 1) {
        existParent.percent = 0.0;
        existParent.userSized = false;
        wm.tree.resetSiblingPercent(existParent.parentNode);
      }

      wm.tree.resetSiblingPercent(existParent);
      // RunSteps/batch: freeze owns residual C — M only while frozen (no mid-batch Cf).
      if (!wm._freezeRender) {
        wm.commitLayout("float-toggle", { force: true });
      }
    };

    // FocusNext/FocusPrev share one body and branch on action.name internally.
    const focusSibling = (action, ctx) => {
      const { wm } = ctx;
      let { focusNodeWindow } = ctx;
      // Cyclic, non-directional focus among tiled siblings (forge-zrl).
      const offset = action.name === "FocusNext" ? 1 : -1;
      const focused = wm.tree.focusSibling(focusNodeWindow, offset);
      if (focused) focusNodeWindow = focused;
      if (!focusNodeWindow) {
        focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
      }
      wm.afterFocus(focusNodeWindow, { source: "command-focus-sibling" });
    };

    // SwapNext/SwapPrev share one body and branch on action.name internally.
    const swapSibling = (action, ctx) => {
      const { wm, focusNodeWindow } = ctx;
      // Cyclic, non-directional swap with a tiled sibling (forge-zrl).
      if (!focusNodeWindow) return;
      wm.unfreezeRender();
      const offset = action.name === "SwapNext" ? 1 : -1;
      const swapped = wm.tree.swapSibling(focusNodeWindow, offset);
      if (swapped) {
        // StructureChanged: M done → one C → settle F (no second C).
        focusNodeWindow.nodeValue.raise();
        wm.commitLayout("swap-sibling", { force: true });
        wm.settleTabFocus(focusNodeWindow);
        wm.movePointerWith(focusNodeWindow);
      }
    };

    this._handlers = {
      FloatNonPersistentToggle: floatToggle,
      FloatToggle: floatToggle,
      FloatClassToggle: floatToggle,

      Move: (action, ctx) => {
        const { wm } = ctx;
        let { focusNodeWindow } = ctx;
        wm.unfreezeRender();
        let moveDirection = Utils.resolveDirection(action.direction);
        let prev = focusNodeWindow;
        let moved = wm.tree.move(focusNodeWindow, moveDirection);
        if (!focusNodeWindow) {
          focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
        }
        // Deferred: tab/stack open leaf + P only — never a second full commit
        // (AP2 StructureChanged: M → one C → settleTabFocus / P).
        wm.queueEvent({
          name: "move",
          callback: () => {
            if (wm.eventQueue.length <= 0) {
              wm.unfreezeRender();
              // forge-ne1 (#324): the node captured at queue time can be gone
              // by the time this fires (>=220ms): null focus fallback, window
              // closed (removeChild nulls parentNode), or MetaWindow disposed
              // after sleep/resume. Bail before touching parentNode/nodeValue.
              if (
                !focusNodeWindow ||
                !focusNodeWindow.parentNode ||
                !Utils.isWindowAlive(focusNodeWindow.nodeValue)
              ) {
                return;
              }
              const layout = focusNodeWindow.parentNode.layout;
              if (layout === LAYOUT_TYPES.STACKED || layout === LAYOUT_TYPES.TABBED) {
                // Activate + settle open leaf without move-*-queue renderTree.
                try {
                  focusNodeWindow.nodeValue.raise();
                  focusNodeWindow.nodeValue.activate(global.display.get_current_time());
                } catch (_e) {
                  /* disposed Meta — #324 */
                }
                wm.settleTabFocus(focusNodeWindow);
              }
              wm.movePointerWith(focusNodeWindow);
            }
          },
        });
        if (moved) {
          if (prev?.parentNode) prev.parentNode.lastTabFocus = prev.nodeValue;
          // Exactly one C for the gesture (interactive → Cf).
          wm.commitLayout("move-window", { force: true });
        }
      },

      Focus: (action, ctx) => {
        const { wm } = ctx;
        let { focusNodeWindow } = ctx;
        let focusDirection = Utils.resolveDirection(action.direction);
        focusNodeWindow = wm.tree.focus(focusNodeWindow, focusDirection);
        if (!focusNodeWindow) {
          focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
        }
        wm.afterFocus(focusNodeWindow, { source: "command-focus" });
      },

      Swap: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        wm.unfreezeRender();
        let swapDirection = Utils.resolveDirection(action.direction);
        wm.tree.swap(focusNodeWindow, swapDirection);
        // StructureChanged: one C then settle open leaf + P.
        focusNodeWindow.nodeValue.raise();
        wm.commitLayout("swap", { force: true });
        wm.settleTabFocus(focusNodeWindow);
        wm.movePointerWith(focusNodeWindow);
      },

      FocusNext: focusSibling,
      FocusPrev: focusSibling,

      SwapNext: swapSibling,
      SwapPrev: swapSibling,

      Split: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        let currentLayout = focusNodeWindow.parentNode.layout;
        if (currentLayout === LAYOUT_TYPES.STACKED || currentLayout === LAYOUT_TYPES.TABBED) {
          return;
        }
        let orientation = action.orientation
          ? action.orientation.toUpperCase()
          : ORIENTATION_TYPES.NONE;
        // Only stamp the default layout onto a container tree.split actually
        // created — a no-op split (FLOAT focus / single-child toggle) returns null,
        // and applying it to the pre-existing parent (often the monitor) would
        // wrongly turn it TABBED/STACKED (forge-clsp).
        const newContainer = wm.tree.split(focusNodeWindow, orientation);
        if (newContainer) wm.applyDefaultLayoutToContainer(newContainer);
        wm.commitLayout("split", { force: true });
      },

      LayoutToggle: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        const parent = focusNodeWindow.parentNode;
        let currentLayout = parent.layout;
        if (currentLayout === LAYOUT_TYPES.HSPLIT) {
          wm.tree.setLayout(parent, LAYOUT_TYPES.VSPLIT);
        } else if (currentLayout === LAYOUT_TYPES.VSPLIT) {
          wm.tree.setLayout(parent, LAYOUT_TYPES.HSPLIT);
        }
        wm.tree.attachNode = parent;
        wm.commitLayout("layout-split-toggle", { force: true });
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

      LayoutStackedToggle: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        if (!wm.ext.settings.get_boolean("stacked-tiling-mode-enabled")) return;

        if (focusNodeWindow.parentNode.isMonitor()) {
          wm.tree.split(focusNodeWindow, ORIENTATION_TYPES.HORIZONTAL, true);
        }

        const parent = focusNodeWindow.parentNode;
        let currentLayout = parent.layout;

        if (currentLayout === LAYOUT_TYPES.STACKED) {
          wm.tree.setLayout(parent, wm.determineSplitLayout(), { resetPercents: true });
        } else {
          wm.tree.setLayout(parent, LAYOUT_TYPES.STACKED);
          const lastChild = parent.lastChild;
          if (lastChild && lastChild.nodeType === NODE_TYPES.WINDOW) {
            wm.revealGroupChild(lastChild, { keyboard: true, source: "command-layout" });
          } else if (currentLayout === LAYOUT_TYPES.TABBED) {
            parent.lastTabFocus = null;
          }
        }
        wm.unfreezeRender();
        wm.tree.attachNode = parent;
        wm.commitLayout("layout-stacked-toggle", { force: true });
      },

      LayoutTabbedToggle: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow) return;
        if (!wm.ext.settings.get_boolean("tabbed-tiling-mode-enabled")) return;

        if (focusNodeWindow.parentNode.isMonitor()) {
          wm.tree.split(focusNodeWindow, ORIENTATION_TYPES.HORIZONTAL, true);
        }

        const parent = focusNodeWindow.parentNode;
        let currentLayout = parent.layout;

        if (currentLayout === LAYOUT_TYPES.TABBED) {
          wm.tree.setLayout(parent, wm.determineSplitLayout(), {
            lastTabFocus: null,
            resetPercents: true,
          });
        } else {
          wm.tree.setLayout(parent, LAYOUT_TYPES.TABBED);
          wm.revealGroupChild(focusNodeWindow);
        }
        wm.unfreezeRender();
        wm.tree.attachNode = parent;
        wm.commitLayout("layout-tabbed-toggle", { force: true });
      },

      // Cycle STACKED ↔ TABBED only (safe: groups are window-leaf bags today).
      // No-op on H/V/monitor — groupify-from-split is a later, lossier op.
      LayoutStackTabToggle: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || !focusNodeWindow.parentNode) return;

        const stackOn = wm.ext.settings.get_boolean("stacked-tiling-mode-enabled");
        const tabOn = wm.ext.settings.get_boolean("tabbed-tiling-mode-enabled");
        if (!stackOn && !tabOn) return;

        const parent = focusNodeWindow.parentNode;
        const current = parent.layout;

        if (current === LAYOUT_TYPES.STACKED) {
          if (!tabOn) return;
          wm.tree.setLayout(parent, LAYOUT_TYPES.TABBED);
          wm.revealGroupChild(focusNodeWindow);
        } else if (current === LAYOUT_TYPES.TABBED) {
          if (!stackOn) return;
          wm.tree.setLayout(parent, LAYOUT_TYPES.STACKED);
          const lastChild = parent.lastChild;
          if (lastChild && lastChild.nodeType === NODE_TYPES.WINDOW) {
            wm.revealGroupChild(lastChild, { keyboard: true, source: "command-layout" });
          } else {
            parent.lastTabFocus = null;
          }
        } else {
          return;
        }

        wm.unfreezeRender();
        wm.tree.attachNode = parent;
        wm.commitLayout("layout-stack-tab-toggle", { force: true });
      },

      // Create a tabbed group from focused + last-active (or tiled sibling).
      // D044: dest mon = focus; cross-mon partner rehomes then joins (no straddle).
      WindowMergeGroup: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (!focusNodeWindow || focusNodeWindow.isFloat()) return;
        if (!wm.ext.settings.get_boolean("tabbed-tiling-mode-enabled")) return;

        let partner = null;
        const lastActiveWindow = global.display.get_tab_next(
          Meta.TabList.NORMAL,
          global.display.get_workspace_manager().get_active_workspace(),
          focusNodeWindow.nodeValue,
          false
        );
        if (lastActiveWindow && lastActiveWindow !== focusNodeWindow.nodeValue) {
          partner = wm.tree.findNode(lastActiveWindow);
        }
        if (
          !partner ||
          partner.nodeType !== NODE_TYPES.WINDOW ||
          partner === focusNodeWindow ||
          partner.isFloat()
        ) {
          const parent = focusNodeWindow.parentNode;
          if (!parent) return;
          const siblings = wm.tree
            .getTiledChildren(parent.childNodes)
            .filter((n) => n.nodeType === NODE_TYPES.WINDOW && n !== focusNodeWindow);
          partner = siblings[0] || null;
        }
        if (!partner) return;

        // Prefer same-mon partner when last-active is cross-mon and a local sibling exists.
        const focusMon =
          typeof wm.tree.groupHomeMonitor === "function"
            ? wm.tree.groupHomeMonitor(focusNodeWindow)
            : -1;
        const partnerMon =
          typeof wm.tree.groupHomeMonitor === "function" ? wm.tree.groupHomeMonitor(partner) : -1;
        if (focusMon >= 0 && partnerMon >= 0 && focusMon !== partnerMon) {
          const parent = focusNodeWindow.parentNode;
          const localSib = parent
            ? wm.tree
                .getTiledChildren(parent.childNodes)
                .find(
                  (n) =>
                    n.nodeType === NODE_TYPES.WINDOW &&
                    n !== focusNodeWindow &&
                    !n.isFloat?.() &&
                    wm.tree.groupHomeMonitor?.(n) === focusMon
                )
            : null;
          if (localSib) partner = localSib;
        }

        const group = wm.tree.mergeWindowsIntoGroup(focusNodeWindow, partner, LAYOUT_TYPES.TABBED);
        if (!group) return;

        wm.normalizeGroupToHomeMonitor?.(group);
        wm.unfreezeRender();
        wm.tree.attachNode = group;
        wm.commitLayout("window-merge-group", { force: true });
        wm.revealGroupChild(focusNodeWindow);
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

      WindowSwapLastActive: (action, ctx) => {
        const { wm, focusNodeWindow } = ctx;
        if (focusNodeWindow) {
          let lastActiveWindow = global.display.get_tab_next(
            Meta.TabList.NORMAL,
            global.display.get_workspace_manager().get_active_workspace(),
            focusNodeWindow.nodeValue,
            false
          );
          let lastActiveNodeWindow = wm.tree.findNode(lastActiveWindow);
          wm.tree.swapPairs(lastActiveNodeWindow, focusNodeWindow);
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
  }
}
