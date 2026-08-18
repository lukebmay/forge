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
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import { NODE_TYPES } from "./tree.js";
import * as Compat from "./compat.js";
import {
  SPLIT_CHROME_MODE,
  resolveSplitChromeMode,
  collectSplitAncestry,
  splitChromeForWindow,
} from "./split-chrome.js";

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
    /** @type {St.Widget|null} untracked host above window_group */
    this._tabChromeLayer = null;
    /** @type {WeakSet<object>} strip decos already trackChrome'd (GNOME re-track throws) */
    this._trackedTabDecos = new WeakSet();
    this._windowGroupVisibleId = 0;
    this._overviewShowingId = 0;
    this._overviewHidingId = 0;
    /** I5: force show-all split chrome for grab duration */
    this._splitChromeForceShowAll = false;
  }

  /**
   * Drag/grab: force show-all split chrome; restore prior mode when cleared.
   * @param {boolean} on
   */
  setSplitChromeForceShowAll(on) {
    const next = !!on;
    if (this._splitChromeForceShowAll === next) return;
    this._splitChromeForceShowAll = next;
    this.updateBorderLayout();
  }

  /**
   * Ensure `#forge-tab-chrome` exists, parked above window_group / below top_window_group.
   * Host is untracked and non-reactive so it cannot steal tile clicks.
   * @returns {St.Widget|null}
   */
  ensureTabChromeLayer() {
    if (this._tabChromeLayer && !this._tabChromeLayer._destroyed) {
      this._parkTabChromeLayer();
      this._syncTabChromeVisibility();
      return this._tabChromeLayer;
    }

    const layer = new St.Widget({
      name: "forge-tab-chrome",
      reactive: false,
      clip_to_allocation: false,
    });
    try {
      if (Clutter?.ActorFlags?.NO_LAYOUT != null && typeof layer.set_flags === "function") {
        layer.set_flags(Clutter.ActorFlags.NO_LAYOUT);
      }
    } catch (_e) {
      // mock / older Clutter
    }

    this._tabChromeLayer = layer;
    this._parkTabChromeLayer();
    this._bindTabChromeVisibility();
    this._syncTabChromeVisibility();
    return layer;
  }

  /** @returns {St.Widget|null} */
  get tabChromeLayer() {
    return this._tabChromeLayer;
  }

  /**
   * Park host: uiGroup child immediately above window_group and below top_window_group.
   * Never leave a bare add_child at the end of uiGroup.
   */
  _parkTabChromeLayer() {
    const layer = this._tabChromeLayer;
    if (!layer) return;
    const uiGroup = Main?.layoutManager?.uiGroup;
    const windowGroup = global.window_group;
    const topGroup = global.top_window_group;
    if (!uiGroup || !windowGroup) {
      Logger.warn("ensureTabChromeLayer: missing uiGroup or window_group");
      return;
    }

    try {
      const parent = typeof layer.get_parent === "function" ? layer.get_parent() : layer._parent;
      if (parent !== uiGroup) {
        if (parent && typeof parent.remove_child === "function") {
          parent.remove_child(layer);
        }
        uiGroup.add_child(layer);
      }
      if (typeof uiGroup.set_child_above_sibling === "function") {
        uiGroup.set_child_above_sibling(layer, windowGroup);
      }
      if (topGroup && typeof uiGroup.set_child_below_sibling === "function") {
        uiGroup.set_child_below_sibling(layer, topGroup);
      }
    } catch (e) {
      Logger.warn(`_parkTabChromeLayer: ${e}`);
    }
  }

  _bindTabChromeVisibility() {
    if (this._windowGroupVisibleId) return;
    const wg = global.window_group;
    if (wg && typeof wg.connect === "function") {
      try {
        this._windowGroupVisibleId = wg.connect("notify::visible", () => {
          this._syncTabChromeVisibility();
        });
      } catch (e) {
        Logger.warn(`tab chrome notify::visible: ${e}`);
      }
    }
    // Overview is backup only; window_group.visible is the owner.
    const overview = Main?.overview;
    if (overview && typeof overview.connect === "function") {
      try {
        this._overviewShowingId = overview.connect("showing", () => {
          this._syncTabChromeVisibility();
        });
        this._overviewHidingId = overview.connect("hiding", () => {
          this._syncTabChromeVisibility();
        });
      } catch (_e) {
        // tests may lack overview signals
      }
    }
  }

  _syncTabChromeVisibility() {
    const layer = this._tabChromeLayer;
    if (!layer) return;
    const wg = global.window_group;
    const visible = wg ? !!wg.visible : true;
    try {
      layer.visible = visible;
    } catch (_e) {
      // finalized
    }
  }

  /**
   * Reparent CON strip onto the tab-chrome layer; trackChrome once (idempotent).
   * @param {import('./tree.js').Node} con
   */
  attachTabDecoration(con) {
    if (!con?.decoration) return;
    const decoration = con.decoration;
    const layer = this.ensureTabChromeLayer();
    if (!layer) {
      Logger.warn("attachTabDecoration: no tab chrome layer");
      return;
    }

    try {
      const parent =
        typeof decoration.get_parent === "function" ? decoration.get_parent() : decoration._parent;
      if (parent !== layer) {
        if (parent && typeof parent.remove_child === "function") {
          parent.remove_child(decoration);
        }
        layer.add_child(decoration);
      }
    } catch (e) {
      Logger.warn(`attachTabDecoration reparent: ${e}`);
      throw e;
    }

    if (!this._trackedTabDecos.has(decoration)) {
      const lm = Main?.layoutManager;
      if (lm && typeof lm.trackChrome === "function") {
        lm.trackChrome(decoration, {
          affectsStruts: false,
          trackFullscreen: false,
          affectsInputRegion: true,
        });
      }
      this._trackedTabDecos.add(decoration);
    }
  }

  /**
   * untrackChrome + forget WeakSet entry (destroy / orphan sweep).
   * @param {object|null|undefined} decoration
   */
  untrackTabDecoration(decoration) {
    if (!decoration) return;
    try {
      if (this._trackedTabDecos.has(decoration)) {
        const lm = Main?.layoutManager;
        if (lm && typeof lm.untrackChrome === "function") {
          lm.untrackChrome(decoration);
        }
        this._trackedTabDecos.delete(decoration);
      }
    } catch (e) {
      Logger.warn(`untrackTabDecoration: ${e}`);
      try {
        this._trackedTabDecos.delete(decoration);
      } catch (_e2) {
        // ignore
      }
    }
  }

  /** Destroy layer + children (disable / reload). */
  destroyTabChromeLayer() {
    const layer = this._tabChromeLayer;
    this._tabChromeLayer = null;

    if (this._windowGroupVisibleId && global.window_group?.disconnect) {
      try {
        global.window_group.disconnect(this._windowGroupVisibleId);
      } catch (_e) {
        // ignore
      }
      this._windowGroupVisibleId = 0;
    }
    const overview = Main?.overview;
    if (overview?.disconnect) {
      if (this._overviewShowingId) {
        try {
          overview.disconnect(this._overviewShowingId);
        } catch (_e) {
          // ignore
        }
        this._overviewShowingId = 0;
      }
      if (this._overviewHidingId) {
        try {
          overview.disconnect(this._overviewHidingId);
        } catch (_e) {
          // ignore
        }
        this._overviewHidingId = 0;
      }
    }

    if (!layer) return;
    let children = [];
    try {
      children = layer.get_children?.() ? [...layer.get_children()] : [...(layer.children || [])];
    } catch (_e) {
      children = [];
    }
    for (const child of children) {
      try {
        this.untrackTabDecoration(child);
        if (typeof layer.remove_child === "function") layer.remove_child(child);
        child.hide?.();
        child.destroy?.();
      } catch (e) {
        Logger.warn(`destroyTabChromeLayer child: ${e}`);
      }
    }
    try {
      const parent = typeof layer.get_parent === "function" ? layer.get_parent() : layer._parent;
      if (parent && typeof parent.remove_child === "function") parent.remove_child(layer);
      layer.destroy?.();
    } catch (e) {
      Logger.warn(`destroyTabChromeLayer: ${e}`);
    }
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
    if (actor && actor.splitBorder) {
      try {
        actor.splitBorder.hide();
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
      // Clear active on every tab actor (including leftover tabs after reparent).
      if (nodeWindow.tab && !nodeWindow.tab._destroyed) {
        try {
          nodeWindow.tab.remove_style_class_name("window-tabbed-tab-active");
        } catch (_e) {
          /* finalized */
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
    // Scale to match, consistent with splitRadius below (decoration.js:229).
    let inset = 3 * Utils.dpi();
    let parentNode = nodeWindow.parentNode;

    const floatingWindow = nodeWindow.isFloat();
    const tiledBorder = windowActor.border;

    // Tab active = open leaf (lastTabFocus), not only keyboard focus. Multi-mon
    // layout leaves mon1 open leaf unfocused while kbd is mon0; still mark open.
    if (parentNode.isStackedOrTabbed()) {
      this._syncTabActiveFromLastTabFocus(parentNode);
    }

    // Feature #262: Skip focus border if single window and setting enabled
    let isSingleWindow = tiledChildren.length === 1 && monitorCount === 1;
    let skipBorderForSingle =
      focusBorderHiddenOnSingle && isSingleWindow && !floatingWindow && !nodeWindow.zoomMode;

    if (tiledBorder && focusBorderEnabled && !skipBorderForSingle) {
      if (
        !maximized() ||
        (gap === 0 && tiledChildren.length === 1 && monitorCount > 1) ||
        (gap === 0 && tiledChildren.length > 1)
      ) {
        if (tilingModeEnabled) {
          if (nodeWindow.zoomMode && !floatingWindow) {
            tiledBorder.set_style_class_name("window-zoomed-border");
          } else if (parentNode.isStacked()) {
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

    // TILE/ZOOM: painted slot (Wayland frame lags). FLOAT: live Meta frame.
    let rect = this._borderRectForNode(nodeWindow, metaWindow, floatingWindow);

    // Bug #164 fix: Validate rect has valid dimensions before setting border size
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      this._paintSplitChromeBorders({
        focusNodeWindow: nodeWindow,
        splitBorderEnabled,
        focusBorderEnabled,
        tilingModeEnabled,
      });
      return;
    }

    borders.forEach((border) => {
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

    this._paintSplitChromeBorders({
      focusNodeWindow: nodeWindow,
      splitBorderEnabled,
      focusBorderEnabled,
      tilingModeEnabled,
    });
  }

  /**
   * I5: split borders on tiled leaves under ancestry H/V (default) or all H/V.
   * @param {{ focusNodeWindow: import('./tree.js').Node, splitBorderEnabled: boolean, focusBorderEnabled: boolean, tilingModeEnabled: boolean }} opts
   */
  _paintSplitChromeBorders({
    focusNodeWindow,
    splitBorderEnabled,
    focusBorderEnabled,
    tilingModeEnabled,
  }) {
    const mode = resolveSplitChromeMode({
      showAll: !!this._extWm.ext.settings.get_boolean("split-chrome-show-all"),
      forceShowAll: !!this._splitChromeForceShowAll,
    });
    const ancestry =
      mode === SPLIT_CHROME_MODE.ANCESTRY
        ? new Set(collectSplitAncestry(this._tree.layoutUnit(focusNodeWindow)))
        : null;

    const canPaint = splitBorderEnabled && focusBorderEnabled && tilingModeEnabled;

    const splitRadius = this._extWm.ext.settings.get_uint("focus-border-radius") * Utils.dpi();
    const nodeWindows = this._tree.nodeWindows || [];

    for (const nw of nodeWindows) {
      const actor = nw.windowActor;
      if (!actor) continue;
      const meta = nw.nodeValue;
      if (!meta) continue;

      let paint = null;
      if (
        canPaint &&
        !nw.isFloat?.() &&
        !nw.zoomMode &&
        !meta.minimized &&
        !Compat.isMaximized(meta) &&
        !(typeof meta.is_fullscreen === "function" && meta.is_fullscreen())
      ) {
        paint = splitChromeForWindow(nw, { mode, ancestry });
      }

      if (!paint) {
        if (actor.splitBorder) {
          try {
            actor.splitBorder.hide();
          } catch (_e) {
            /* finalized */
          }
        }
        continue;
      }

      if (!actor.splitBorder) {
        const splitBorder = new St.Bin({ style_class: "window-split-border" });
        global.window_group.add_child(splitBorder);
        actor.splitBorder = splitBorder;
      }

      const splitBorder = actor.splitBorder;
      splitBorder.remove_style_class_name("window-split-vertical");
      splitBorder.remove_style_class_name("window-split-horizontal");
      splitBorder.add_style_class_name(
        paint.isVertical ? "window-split-vertical" : "window-split-horizontal"
      );

      let gap = this._extWm.calculateGaps(nw);
      let inset = 3 * Utils.dpi();
      if (gap === 0 || Compat.isMaximized(meta)) inset = 0;

      let rect = this._borderRectForNode(nw, meta, false);
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        splitBorder.hide();
        continue;
      }

      let x = rect.x - inset;
      let y = rect.y - inset;
      let width = rect.width + inset * 2;
      let height = rect.height + inset * 2;
      // forge-36le: shorten the one-edge hint so it sits inside rounded focus corners
      if (paint.isVertical) {
        x += splitRadius;
        width -= splitRadius * 2;
      } else {
        y += splitRadius;
        height -= splitRadius * 2;
      }
      splitBorder.set_size(Math.max(width, 1), Math.max(height, 1));
      splitBorder.set_position(x, y);
      splitBorder.show();

      if (global.window_group && global.window_group.contains(splitBorder)) {
        global.window_group.remove_child(splitBorder);
        const compositor = meta.get_compositor_private?.() || actor;
        if (compositor) {
          global.window_group.insert_child_above(splitBorder, compositor);
        }
      }

      if (
        actor.border &&
        global.window_group &&
        global.window_group.contains(splitBorder) &&
        global.window_group.contains(actor.border)
      ) {
        global.window_group.set_child_above_sibling(splitBorder, actor.border);
      }
    }
  }

  /**
   * @param {import('./tree.js').Node} nodeWindow
   * @param {any} metaWindow
   * @param {boolean} floatingWindow
   * @returns {{ x: number, y: number, width: number, height: number } | null}
   */
  _borderRectForNode(nodeWindow, metaWindow, floatingWindow) {
    let rect = null;
    if (floatingWindow) {
      rect = metaWindow.get_frame_rect?.() ?? null;
    } else {
      const painted = this._tree.paintRectForWindow?.(nodeWindow);
      if (painted && painted.width > 0 && painted.height > 0) {
        rect = { x: painted.x, y: painted.y, width: painted.width, height: painted.height };
      } else {
        const slot = nodeWindow.renderRect || nodeWindow.rect;
        if (slot && slot.width > 0 && slot.height > 0) {
          rect = { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
        } else {
          rect = metaWindow.get_frame_rect?.() ?? null;
        }
      }
    }

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
    return rect;
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
    const border = actor[propName];
    if (border && global.window_group) {
      global.window_group.remove_child(border);
      border.hide();
    }
  }

  /**
   * Attach CON strip to the tab-chrome layer (pickability is parent + trackChrome,
   * not window_group sibling order vs Meta actors).
   * @param {import('./tree.js').Node} con
   * @param {import('./tree.js').Node[]} [_tiled] unused; kept for call-site compat
   */
  _restackDecorationAboveGroup(con, _tiled) {
    if (!con?.decoration) return;
    try {
      this.attachTabDecoration(con);
      this._parkTabChromeLayer();
    } catch (e) {
      Logger.warn(`_restackDecorationAboveGroup: ${e}`);
    }
  }

  /**
   * Tab/stack decoration show + restack.
   *
   * @param {{
   *   scope?: "full"|"focus",
   *   focusNode?: import('./tree.js').Node|null,
   * }=} [opts]
   * - full (default): hide every CON decoration, then re-show/restack eligible
   *   strips on all monitors (layout / workspace / maximize paths).
   * - focus: after tab/stack raise, restack **only** the focused CON's strip.
   *   No global hide/show — other monitors keep their chrome (cross-mon thrash).
   */
  updateDecorationLayout(opts) {
    if (this._extWm._freezeRender) return;
    const scope = opts && opts.scope === "focus" ? "focus" : "full";
    if (scope === "focus") {
      this._restackFocusedTabDecoration(opts?.focusNode ?? null);
      return;
    }

    let activeWsNode = this._extWm.currentWsNode;
    let allCons = this._tree.getNodeByType(NODE_TYPES.CON);

    allCons.forEach((con) => {
      if (con.decoration) {
        con.decoration.hide();
      }
    });
    // Orphan forge-deco actors (reparent thrash / failed teardown) stay in
    // window_group and follow workspace switches — destroy unreferenced ones.
    this._sweepOrphanDecorations(allCons);

    // Next, handle showing-desktop usually by Super + D
    if (!activeWsNode) return;
    // Only real Meta.Window leaves — placeholders lack showing_on_its_workspace
    // and used to throw TypeError, aborting paint/decoration restack.
    let allWindows = activeWsNode.getNodeByType(NODE_TYPES.WINDOW).filter((w) => {
      const metaWindow = w?.nodeValue;
      return metaWindow && typeof metaWindow.showing_on_its_workspace === "function";
    });
    let allHiddenWindows = allWindows.filter((w) => {
      let metaWindow = w.nodeValue;
      try {
        return !metaWindow.showing_on_its_workspace() || !!metaWindow.minimized;
      } catch (_e) {
        return true;
      }
    });

    if (!allWindows.length || allWindows.length === allHiddenWindows.length) return;

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
          .filter((w) => {
            const mw = w?.nodeValue;
            if (!mw || typeof mw.is_fullscreen !== "function") return false;
            try {
              return !mw.minimized && (Compat.isMaximized(mw) || mw.is_fullscreen());
            } catch (_e) {
              return false;
            }
          }).length === 0
      );
    });

    monWsNoMaxWindows.forEach((monitorWs) => {
      let activeMonWsCons = monitorWs.getNodeByType(NODE_TYPES.CON);
      activeMonWsCons.forEach((con) => {
        this._showAndRestackTabDecoration(con);
      });
    });
  }

  /**
   * Focus-scoped chrome: restack only the focused TABBED/STACKED CON so raise()
   * does not bury its strip. Leaves other monitors' decorations untouched.
   * @param {import('./tree.js').Node|null|undefined} focusNode
   */
  _restackFocusedTabDecoration(focusNode) {
    if (!focusNode) return;
    const parent = focusNode.parentNode;
    if (!parent || typeof parent.isStackedOrTabbed !== "function" || !parent.isStackedOrTabbed()) {
      return;
    }
    // Skip if this monitor has a covering max/fs window (full path would hide it).
    const mon = this._tree.findAncestorMonitor?.(focusNode) ?? null;
    if (mon && this._monitorHasCoveringMaxOrFullscreen(mon)) return;
    this._showAndRestackTabDecoration(parent);
  }

  /**
   * @param {import('./tree.js').Node} monitorNode
   * @returns {boolean}
   */
  _monitorHasCoveringMaxOrFullscreen(monitorNode) {
    if (!monitorNode || typeof monitorNode.getNodeByType !== "function") return false;
    return (
      monitorNode
        .getNodeByType(NODE_TYPES.WINDOW)
        .filter(
          (w) =>
            w?.nodeValue &&
            !w.nodeValue.minimized &&
            (Compat.isMaximized(w.nodeValue) || w.nodeValue.is_fullscreen())
        ).length > 0
    );
  }

  /**
   * Show + restack one CON's tab/stack strip when eligible.
   * @param {import('./tree.js').Node} con
   */
  _showAndRestackTabDecoration(con) {
    if (!con?.decoration) return;
    let tiled = this._tree.getTiledChildren(con.childNodes);
    let showTabs = this._extWm.ext.settings.get_boolean("showtab-decoration-enabled");
    // Gate on isStackedOrTabbed: after auto-exit-tabbed (or a layout toggle
    // off TABBED/STACKED) a CON may still hold a leftover decoration actor.
    // Re-showing + restacking it above the window creates an invisible
    // reactive hit plate over native CSD (× does nothing until content click).
    if (!(tiled.length > 0 && showTabs && con.isStackedOrTabbed())) return;
    // Never show chrome for another workspace (processNode sizes all mons).
    if (!this._conOnActiveWorkspace(con)) {
      con.decoration.hide();
      return;
    }
    con.decoration.show();
    // Stack the tab strip above this CON's window actors so tabs stay
    // clickable even when global focus is on another monitor/window.
    // (Previously insert_child_below(focus) buried the strip under sibling
    // group actors and clicks only worked after focusing the active tab.)
    this._restackDecorationAboveGroup(con, tiled);
    con.childNodes.forEach((cn) => {
      cn.render();
    });
    // Open leaf styling follows lastTabFocus (not keyboard-only).
    this._syncTabActiveFromLastTabFocus(con);
  }

  /**
   * Mark the lastTabFocus child tab as active; clear siblings.
   * If lastTabFocus unset, fall back to keyboard focus when it is a group child.
   * @param {import('./tree.js').Node} con
   */
  _syncTabActiveFromLastTabFocus(con) {
    if (!con || typeof con.isStackedOrTabbed !== "function" || !con.isStackedOrTabbed()) {
      return;
    }
    const kids = con.childNodes || [];
    let openMeta = con.lastTabFocus;
    if (openMeta == null) {
      const kbd = this._extWm?.focusMetaWindow;
      if (kbd) {
        for (const cn of kids) {
          if (cn?.nodeValue === kbd) {
            openMeta = kbd;
            break;
          }
        }
      }
    }
    for (const cn of kids) {
      if (!cn?.tab || cn.tab._destroyed) continue;
      try {
        const isOpen = openMeta != null && cn.nodeValue === openMeta;
        if (isOpen) {
          cn.tab.add_style_class_name("window-tabbed-tab-active");
        } else {
          cn.tab.remove_style_class_name("window-tabbed-tab-active");
        }
      } catch (_e) {
        /* finalized */
      }
    }
  }

  /**
   * @param {import('./tree.js').Node} con
   * @returns {boolean}
   */
  _conOnActiveWorkspace(con) {
    try {
      const mon = this._tree.findAncestorMonitor?.(con) ?? null;
      if (!mon?.nodeValue) return true;
      const wsIdx = Utils.workspaceIndex(mon.nodeValue);
      const active = global.display?.get_workspace_manager?.()?.get_active_workspace_index?.();
      if (typeof active !== "number" || typeof wsIdx !== "number") return true;
      return wsIdx === active;
    } catch (_e) {
      return true;
    }
  }

  /**
   * Destroy forge-deco actors on the tab-chrome layer not owned by any live CON.
   * @param {import('./tree.js').Node[]} allCons
   */
  _sweepOrphanDecorations(allCons) {
    const live = new Set();
    for (const con of allCons || []) {
      if (con?.decoration) live.add(con.decoration);
    }
    const layer = this._tabChromeLayer;
    if (!layer) return;
    let children;
    try {
      children = layer.get_children?.() ? [...layer.get_children()] : [...(layer.children || [])];
    } catch (_e) {
      return;
    }
    for (const actor of children) {
      if (!actor || actor.type !== "forge-deco" || live.has(actor)) continue;
      try {
        this.untrackTabDecoration(actor);
        if (typeof layer.remove_child === "function") layer.remove_child(actor);
        actor.hide?.();
        actor.destroy?.();
      } catch (e) {
        Logger.warn(`_sweepOrphanDecorations: ${e}`);
      }
    }
  }
}
