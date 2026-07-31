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
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import { NODE_TYPES } from "./tree.js";
import * as Compat from "./compat.js";
import { collectSplitChromeTargets } from "./layout-chrome.js";

/**
 * DecorationManager owns the decoration/border rendering for tiled windows.
 * Extracted from window.js (WindowManager) to keep the rendering cluster in one
 * place. Shared WindowManager state (_freezeRender, focusMetaWindow, currentWsNode,
 * ext.settings, calculate'd helpers) is read LIVE via this._extWm so behavior is
 * preserved. _alignToBufferScale intentionally stays on WindowManager (also used by
 * move()) and is invoked through this._extWm.
 */
export class DecorationManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./tree.js').Tree} */
  _tree;

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
  }

  hideActorBorder(actor) {
    // Ensure borders are hidden regardless of state (#268)
    if (actor && actor.border) {
      try {
        actor.border.hide();
      } catch (e) {
        Logger.warn(`Failed to hide border: ${e}`);
      }
    }
    this._hideSplitBorders(actor);
  }

  /**
   * Hide legacy `splitBorder` plus multi-level `splitBorders` (C3).
   * @param {object|null|undefined} actor
   */
  _hideSplitBorders(actor) {
    if (!actor) return;
    const list = [];
    if (Array.isArray(actor.splitBorders)) list.push(...actor.splitBorders);
    if (actor.splitBorder && !list.includes(actor.splitBorder)) list.push(actor.splitBorder);
    for (const border of list) {
      try {
        border.hide();
      } catch (e) {
        Logger.warn(`Failed to hide splitBorder: ${e}`);
      }
    }
  }

  hideWindowBorders() {
    // Ensure we iterate even if tree is in unexpected state (#268)
    const nodeWindows = this._tree.nodeWindows || [];
    nodeWindows.forEach((nodeWindow) => {
      let actor = nodeWindow.windowActor;
      if (actor) {
        this._extWm.hideActorBorder(actor);
      }
      if (nodeWindow.parentNode && nodeWindow.parentNode.isStackedOrTabbed()) {
        if (nodeWindow.tab && !nodeWindow.tab._destroyed && nodeWindow.tab.get_parent()) {
          nodeWindow.tab.remove_style_class_name("window-tabbed-tab-active");
        }
      }
    });
  }

  showWindowBorders() {
    let metaWindow = this._extWm.focusMetaWindow;
    if (!metaWindow) return;
    let windowActor = metaWindow.get_compositor_private();
    if (!windowActor) return;
    let nodeWindow = this._extWm.findNodeWindow(metaWindow);
    if (!nodeWindow) return;
    if (metaWindow.get_wm_class() === null) return;

    let borders = [];
    let focusBorderEnabled = this._extWm.ext.settings.get_boolean("focus-border-toggle");
    let focusBorderHiddenOnSingle = this._extWm.ext.settings.get_boolean(
      "focus-border-hidden-on-single"
    );
    let splitBorderEnabled = this._extWm.ext.settings.get_boolean("split-border-toggle");
    let tilingModeEnabled = this._extWm.ext.settings.get_boolean("tiling-mode-enabled");
    let gap = this._extWm.calculateGaps(nodeWindow);
    let maximized = () => Compat.isMaximized(metaWindow) || metaWindow.is_fullscreen() || gap === 0;
    let monitorCount = global.display.get_n_monitors();
    let monitorNode = this._tree.findAncestorMonitor(nodeWindow);
    let tiledChildren = this._extWm._tiledWindowsOnMonitor(monitorNode);
    // forge-hcbz: the border's CSS border-width (3px) is scaled to physical px by
    // St (6 at 2x), but this inset positions the border actor in physical coords —
    // a raw 3 leaves the border painting over window content at integer HiDPI.
    // Scale to match, consistent with splitRadius below.
    let inset = 3 * Utils.dpi();
    let parentNode = nodeWindow.parentNode;

    const floatingWindow = nodeWindow.isFloat();
    const tiledBorder = windowActor.border;

    if (parentNode.isStackedOrTabbed()) {
      if (nodeWindow.tab) {
        nodeWindow.tab.add_style_class_name("window-tabbed-tab-active");
      }
    }

    // Feature #262: Skip focus border if single window and setting enabled
    let isSingleWindow = tiledChildren.length === 1 && monitorCount === 1;
    let skipBorderForSingle = focusBorderHiddenOnSingle && isSingleWindow && !floatingWindow;

    if (tiledBorder && focusBorderEnabled && !skipBorderForSingle) {
      if (
        !maximized() ||
        (gap === 0 && tiledChildren.length === 1 && monitorCount > 1) ||
        (gap === 0 && tiledChildren.length > 1)
      ) {
        if (tilingModeEnabled) {
          if (parentNode.isStacked()) {
            if (!floatingWindow) {
              tiledBorder.set_style_class_name("window-stacked-border");
            } else {
              tiledBorder.set_style_class_name("window-floated-border");
            }
          } else if (parentNode.isTabbed()) {
            if (!floatingWindow) {
              tiledBorder.set_style_class_name("window-tabbed-border");
              if (nodeWindow.backgroundTab) {
                tiledBorder.add_style_class_name("window-tabbed-bg");
              }
            } else {
              tiledBorder.set_style_class_name("window-floated-border");
            }
          } else {
            if (!floatingWindow) {
              tiledBorder.set_style_class_name("window-tiled-border");
            } else {
              tiledBorder.set_style_class_name("window-floated-border");
            }
          }
          borders.push(tiledBorder);
        }
        // Feature #297: Don't show floating border when tiling is disabled
      }
    }

    if (gap === 0 || Compat.isMaximized(metaWindow)) {
      inset = 0;
    }

    // C3: split chrome via collectSplitChromeTargets (ancestry | all | drag force-all)
    const showAllSetting = this._extWm.ext.settings.get_boolean("split-chrome-show-all");
    const forceShowAll = !!this._extWm._splitChromeForceShowAll;
    const chromeMode = forceShowAll || showAllSetting ? "all" : "ancestry";
    const canSplitChrome =
      splitBorderEnabled &&
      focusBorderEnabled &&
      tilingModeEnabled &&
      !nodeWindow.isFloat() &&
      !maximized();

    /** @type {Map<object, Array<"H"|"V">>} windowNode -> axes to paint */
    const paintByWindow = new Map();
    if (canSplitChrome) {
      const targets = collectSplitChromeTargets(nodeWindow, {
        mode: chromeMode,
        getTiledChildren: (items) => this._tree.getTiledChildren(items),
      });
      for (const t of targets) {
        const leaf = this._pickSplitChromeLeaf(t.con, nodeWindow);
        if (!leaf || leaf.isFloat?.()) continue;
        if (!paintByWindow.has(leaf)) paintByWindow.set(leaf, []);
        paintByWindow.get(leaf).push(t.axis);
      }
    }

    // Focus-window focus border layout (split borders applied after, per leaf)
    let rect = metaWindow.get_frame_rect();

    // Bug #164 fix: align the border rect to buffer scale on Wayland HiDPI, the
    // same alignment move() applies to the window itself (see _alignToBufferScale).
    // Without this the border is sourced from the unaligned frame rect and ends up
    // offset/smaller than the window it outlines on fractional/2x scaling.
    if (rect && Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
      const scale = Utils.dpi();
      if (scale > 1) {
        rect = {
          x: this._extWm._alignToBufferScale(rect.x, scale),
          y: this._extWm._alignToBufferScale(rect.y, scale),
          width: this._extWm._alignToBufferScale(rect.width, scale),
          height: this._extWm._alignToBufferScale(rect.height, scale),
        };
      }
    }

    // Bug #164 fix: Validate rect has valid dimensions before setting border size
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const splitRadius = this._extWm.ext.settings.get_uint("focus-border-radius") * Utils.dpi();

    borders.forEach((border) => {
      // Ensure positive dimensions after inset adjustment
      const width = Math.max(rect.width + inset * 2, 1);
      const height = Math.max(rect.height + inset * 2, 1);
      border.set_size(width, height);
      border.set_position(rect.x - inset, rect.y - inset);
      if (metaWindow.appears_focused && !metaWindow.minimized) {
        border.show();
      }
      if (global.window_group && global.window_group.contains(border)) {
        global.window_group.remove_child(border);
        let compositor = metaWindow.get_compositor_private();
        if (compositor) {
          global.window_group.insert_child_above(border, compositor);
        }
      }
    });

    // Paint split chrome (multi-level on focus; show-all may use sibling leaves)
    for (const [leaf, axes] of paintByWindow) {
      this._paintSplitChromeOnWindow(leaf, axes, {
        inset,
        splitRadius,
        isFocus: leaf === nodeWindow,
      });
    }

    // Ensure split border(s) on focus sit above the focus border
    if (
      windowActor.splitBorder &&
      windowActor.border &&
      global.window_group &&
      global.window_group.contains(windowActor.splitBorder) &&
      global.window_group.contains(windowActor.border)
    ) {
      global.window_group.set_child_above_sibling(windowActor.splitBorder, windowActor.border);
    }
    if (Array.isArray(windowActor.splitBorders) && windowActor.border && global.window_group) {
      for (const sb of windowActor.splitBorders) {
        if (global.window_group.contains(sb) && global.window_group.contains(windowActor.border)) {
          global.window_group.set_child_above_sibling(sb, windowActor.border);
        }
      }
    }
  }

  /**
   * Prefer focused window when under `con`; else first tiled window leaf.
   * @param {object} con
   * @param {object} focusNode
   * @returns {object|null}
   */
  _pickSplitChromeLeaf(con, focusNode) {
    if (!con || !focusNode) return null;
    if (this._nodeIsUnder(focusNode, con)) {
      if (typeof focusNode.isWindow === "function" && focusNode.isWindow()) return focusNode;
      const under = this._firstTiledWindowUnder(focusNode);
      if (under) return under;
    }
    return this._firstTiledWindowUnder(con);
  }

  /**
   * @param {object} node
   * @param {object} ancestor
   * @returns {boolean}
   */
  _nodeIsUnder(node, ancestor) {
    let n = node;
    while (n) {
      if (n === ancestor) return true;
      n = n.parentNode;
    }
    return false;
  }

  /**
   * @param {object} root
   * @returns {object|null}
   */
  _firstTiledWindowUnder(root) {
    if (!root) return null;
    if (typeof root.isWindow === "function" && root.isWindow()) return root;
    const tiled = this._tree.getTiledChildren(root.childNodes || []);
    for (const c of tiled) {
      if (typeof c.isWindow === "function" && c.isWindow()) return c;
      const w = this._firstTiledWindowUnder(c);
      if (w) return w;
    }
    return null;
  }

  /**
   * Create/position one split-border actor per axis on a window node.
   * @param {object} nodeWindow
   * @param {Array<"H"|"V">} axes
   * @param {{ inset: number, splitRadius: number, isFocus: boolean }} opts
   */
  _paintSplitChromeOnWindow(nodeWindow, axes, opts) {
    if (!nodeWindow || !axes?.length) return;
    const metaWindow = nodeWindow.nodeValue;
    if (!metaWindow) return;
    let windowActor = null;
    try {
      windowActor = metaWindow.get_compositor_private?.() ?? nodeWindow.windowActor;
    } catch (_e) {
      return;
    }
    if (!windowActor) return;
    if (metaWindow.minimized) return;
    if (Compat.isMaximized(metaWindow) || metaWindow.is_fullscreen?.()) return;

    let rect = metaWindow.get_frame_rect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    if (Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
      const scale = Utils.dpi();
      if (scale > 1) {
        rect = {
          x: this._extWm._alignToBufferScale(rect.x, scale),
          y: this._extWm._alignToBufferScale(rect.y, scale),
          width: this._extWm._alignToBufferScale(rect.width, scale),
          height: this._extWm._alignToBufferScale(rect.height, scale),
        };
      }
    }

    const { inset, splitRadius } = opts;
    if (!Array.isArray(windowActor.splitBorders)) {
      windowActor.splitBorders = windowActor.splitBorder ? [windowActor.splitBorder] : [];
    }

    // Ensure enough actors
    while (windowActor.splitBorders.length < axes.length) {
      const splitBorder = new St.Bin({ style_class: "window-split-border" });
      global.window_group.add_child(splitBorder);
      windowActor.splitBorders.push(splitBorder);
    }

    // Hide surplus actors from a previous deeper nest
    for (let i = axes.length; i < windowActor.splitBorders.length; i++) {
      try {
        windowActor.splitBorders[i].hide();
      } catch (_e) {
        // destroyed
      }
    }

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const border = windowActor.splitBorders[i];
      border.remove_style_class_name("window-split-vertical");
      border.remove_style_class_name("window-split-horizontal");
      if (axis === "V") {
        border.add_style_class_name("window-split-vertical");
      } else {
        border.add_style_class_name("window-split-horizontal");
      }

      // forge-36le: shorten the drawn edge by focus radius so it sits inside corners
      let x = rect.x - inset;
      let y = rect.y - inset;
      let width = rect.width + inset * 2;
      let height = rect.height + inset * 2;
      if (axis === "V") {
        x += splitRadius;
        width -= splitRadius * 2;
      } else {
        y += splitRadius;
        height -= splitRadius * 2;
      }
      border.set_size(Math.max(width, 1), Math.max(height, 1));
      border.set_position(x, y);
      border.show();

      if (global.window_group && global.window_group.contains(border)) {
        global.window_group.remove_child(border);
        const compositor = metaWindow.get_compositor_private?.();
        if (compositor) {
          global.window_group.insert_child_above(border, compositor);
        }
      }
    }

    // Legacy single pointer for destroy/hide paths
    windowActor.splitBorder = windowActor.splitBorders[0] || null;
  }

  updateBorderLayout() {
    this._extWm.hideWindowBorders();
    this._extWm.showWindowBorders();
  }

  calculateGaps(node) {
    if (!node) return 0;

    let settings = this._extWm.ext.settings;
    let gapSize = settings.get_uint("window-gap-size");
    let gapIncrement = settings.get_uint("window-gap-size-increment");
    // forge-2s37: gaps are applied to physical-pixel work-area rects, so scale the
    // logical gap setting by dpi() — otherwise gaps visually halve at integer HiDPI
    // while tab bars/borders on the same screen stay dpi-scaled. (Margins/resize-amount
    // are left unscaled: separate, intent-ambiguous settings.)
    let gap = gapSize * gapIncrement * Utils.dpi();

    if (!node.isRoot()) {
      let hideGapWhenSingle = settings.get_boolean("window-gap-hidden-on-single");
      let parentNode = this._tree.findAncestorMonitor(node);
      if (parentNode) {
        let tiled = this._extWm._tiledWindowsOnMonitor(parentNode);
        if (tiled.length == 1 && hideGapWhenSingle) gap = 0;
      }
    }

    return gap;
  }

  _destroyActorBorder(actor, propName) {
    if (!actor) return;
    if (propName === "splitBorder") {
      const list = [];
      if (Array.isArray(actor.splitBorders)) list.push(...actor.splitBorders);
      if (actor.splitBorder && !list.includes(actor.splitBorder)) list.push(actor.splitBorder);
      for (const border of list) {
        if (!border || !global.window_group) continue;
        global.window_group.remove_child(border);
        border.hide();
      }
      return;
    }
    const border = actor[propName];
    if (border && global.window_group) {
      global.window_group.remove_child(border);
      border.hide();
    }
  }

  /**
   * Place a stacked/tabbed CON decoration just above its tiled members' window
   * actors so the strip receives pointer events without relying on global focus.
   * @param {import('./tree.js').Node} con
   * @param {import('./tree.js').Node[]} tiled - direct tiled children (win or con)
   */
  _restackDecorationAboveGroup(con, tiled) {
    if (!con?.decoration || !global.window_group?.contains?.(con.decoration)) return;

    const actors = [];
    const collect = (node) => {
      if (!node) return;
      if (typeof node.isWindow === "function" && node.isWindow()) {
        try {
          const a = node.nodeValue?.get_compositor_private?.();
          if (a && global.window_group.contains(a)) actors.push(a);
        } catch (_e) {
          // finalized
        }
        return;
      }
      // Nested CON tab: all descendant windows share the group chrome.
      if (typeof node.getNodeByType === "function") {
        for (const w of node.getNodeByType(NODE_TYPES.WINDOW)) {
          try {
            const a = w.nodeValue?.get_compositor_private?.();
            if (a && global.window_group.contains(a)) actors.push(a);
          } catch (_e) {
            // finalized
          }
        }
      }
    };
    for (const n of tiled || []) collect(n);

    try {
      global.window_group.remove_child(con.decoration);
      if (actors.length === 0) {
        global.window_group.add_child(con.decoration);
        return;
      }
      // Bottom→top among siblings; pick the topmost group member.
      let top = actors[0];
      let topIdx = -1;
      const children = global.window_group.get_children?.() ?? [];
      for (const a of actors) {
        const idx = children.indexOf(a);
        if (idx >= topIdx) {
          top = a;
          topIdx = idx;
        }
      }
      if (top && global.window_group.contains(top)) {
        global.window_group.insert_child_above(con.decoration, top);
      } else {
        global.window_group.add_child(con.decoration);
      }
    } catch (e) {
      Logger.warn(`_restackDecorationAboveGroup: ${e}`);
      try {
        if (!global.window_group.contains(con.decoration)) {
          global.window_group.add_child(con.decoration);
        }
      } catch (_e2) {
        // ignore
      }
    }
  }

  updateDecorationLayout() {
    if (this._extWm._freezeRender) return;
    let activeWsNode = this._extWm.currentWsNode;
    let allCons = this._tree.getNodeByType(NODE_TYPES.CON);

    allCons.forEach((con) => {
      if (con.decoration) {
        con.decoration.hide();
      }
    });

    // Next, handle showing-desktop usually by Super + D
    if (!activeWsNode) return;
    let allWindows = activeWsNode.getNodeByType(NODE_TYPES.WINDOW);
    let allHiddenWindows = allWindows.filter((w) => {
      let metaWindow = w.nodeValue;
      return !metaWindow.showing_on_its_workspace() || metaWindow.minimized;
    });

    if (allWindows.length === allHiddenWindows.length) return;

    // Show the decoration where on all monitors of active workspace
    // But not on the monitor where there is a maximized or fullscreen window
    // Note, that when multi-display, user can have multi maximized windows,
    // So it needs to be fully filtered:
    let monWsNoMaxWindows = activeWsNode.getNodeByType(NODE_TYPES.MONITOR).filter((monitor) => {
      return (
        monitor
          .getNodeByType(NODE_TYPES.WINDOW)
          // forge-iwi: a minimized maximized/fullscreen window covers nothing, so
          // it must not keep tab/stack decorations hidden (they never returned).
          .filter(
            (w) =>
              !w.nodeValue.minimized &&
              (Compat.isMaximized(w.nodeValue) || w.nodeValue.is_fullscreen())
          ).length === 0
      );
    });

    monWsNoMaxWindows.forEach((monitorWs) => {
      let activeMonWsCons = monitorWs.getNodeByType(NODE_TYPES.CON);
      activeMonWsCons.forEach((con) => {
        let tiled = this._tree.getTiledChildren(con.childNodes);
        let showTabs = this._extWm.ext.settings.get_boolean("showtab-decoration-enabled");
        if (con.decoration && tiled.length > 0 && showTabs) {
          con.decoration.show();
          // Stack the tab strip above this CON's window actors so tabs stay
          // clickable even when global focus is on another monitor/window.
          // (Previously insert_child_below(focus) buried the strip under sibling
          // group actors and clicks only worked after focusing the active tab.)
          this._restackDecorationAboveGroup(con, tiled);
          con.childNodes.forEach((cn) => {
            cn.render();
          });
        }
      });
    });
  }
}
