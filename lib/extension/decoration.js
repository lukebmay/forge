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
import { NODE_TYPES } from "./tree-types.js";
import * as Compat from "./compat.js";
import { isZoomMode } from "./zoom.js";
import { recordChromeZ, recordWarn } from "./metrics.js";
import { forestIdFromLive, liveChildrenForPresent } from "./tom-live.js";
import { actorAlive, chromeGroupEligible, render as renderChromeLabel } from "./node-chrome.js";

/**
 * Prefer hostBag tab/tabChip by Forest nanoid; fall back to Node.tab (D096 G8b/G8c).
 * Dual-write syncs Node.tab when bag wins.
 * @param {import('./window.js').WindowManager|null|undefined} extWm
 * @param {import('./tree.js').Node|null|undefined} node
 * @returns {any|null}
 */
export function tabForNode(extWm, node) {
  if (!node) return null;
  let id = null;
  try {
    id = forestIdFromLive(extWm, node) || null;
  } catch (_e) {
    id = null;
  }
  const bag = id ? extWm?.hostBag?.get?.(id) : null;
  const fromBag = bag?.tab || bag?.tabChip || null;
  if (fromBag && actorAlive(fromBag)) {
    if (node.tab !== fromBag) node.tab = fromBag;
    return fromBag;
  }
  if (fromBag && !actorAlive(fromBag)) {
    if (id && extWm?.hostBag) extWm.hostBag.set(id, { tab: undefined, tabChip: undefined });
    if (node.tab === fromBag) node.tab = null;
  }
  const tab = node.tab ?? null;
  if (!actorAlive(tab)) {
    if (tab) node.tab = null;
    return null;
  }
  return tab;
}

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
   * True when the St actor is still ours to touch. `_forgeDisposed` is set from
   * the actor destroy signal — do not probe GObject methods (Gjs-CRITICAL).
   * @param {object|null|undefined} actor
   * @returns {boolean}
   */
  decorationAlive(actor) {
    return actorAlive(actor);
  }

  /** Forest nanoid for a live CON, or null. */
  _conBagId(con) {
    try {
      return forestIdFromLive(this._extWm, con) || null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Prefer hostBag decoration/tabStrip by CON nanoid; fall back to Node.decoration.
   * @param {import('./tree.js').Node|null|undefined} con
   * @returns {any|null}
   */
  _decorationForCon(con) {
    if (!con) return null;
    const id = this._conBagId(con);
    const bag = id ? this._extWm?.hostBag?.get?.(id) : null;
    const fromBag = bag?.decoration || bag?.tabStrip || null;
    if (fromBag && actorAlive(fromBag)) {
      if (con.decoration !== fromBag) con.decoration = fromBag;
      return fromBag;
    }
    const nodeDeco = con.decoration ?? null;
    if ((fromBag && !actorAlive(fromBag)) || (nodeDeco && !actorAlive(nodeDeco))) {
      this.forgetDisposedDecoration(con, "lookup");
      return null;
    }
    return nodeDeco;
  }

  /** Clear bag chrome fields for a CON strip. */
  _clearConChromeBag(con) {
    const id = this._conBagId(con);
    const bag = this._extWm?.hostBag;
    if (id && bag?.has?.(id)) {
      bag.set(id, { decoration: undefined, tabStrip: undefined });
    }
  }

  /**
   * Prefer hostBag tab/tabChip by Forest nanoid; fall back to Node.tab (D096 G8b/G8c).
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {any|null}
   */
  _tabForNode(node) {
    return tabForNode(this._extWm, node);
  }

  /**
   * Drop a stale CON.decoration after the St actor died (paint/sweep/layer).
   * @param {import('./tree.js').Node|null|undefined} con
   * @param {string} [where]
   */
  forgetDisposedDecoration(con, where) {
    const id = this._conBagId(con);
    const bag = id ? this._extWm?.hostBag?.get?.(id) : null;
    const deco = con?.decoration || bag?.decoration || bag?.tabStrip || null;
    if (deco) deco._forgeDisposed = true;
    if (con) con.decoration = null;
    this._clearConChromeBag(con);
    try {
      this.untrackTabDecoration(deco);
    } catch (_e) {
      // ignore
    }
    recordWarn("deco-disposed", { where: String(where || "unknown") });
  }

  /**
   * Reparent CON strip onto the tab-chrome layer; trackChrome once (idempotent).
   * @param {import('./tree.js').Node} con
   */
  attachTabDecoration(con) {
    const decoration = this._decorationForCon(con);
    if (!decoration) return;
    if (!this.decorationAlive(decoration)) {
      this.forgetDisposedDecoration(con, "attach");
      return;
    }
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
      this.forgetDisposedDecoration(con, "attach");
      return;
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
        if (lm && typeof lm.untrackChrome === "function" && !decoration._forgeDisposed) {
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

    try {
      const cons = this._tree?.getNodeByType?.(NODE_TYPES.CON) || [];
      for (const con of cons) {
        if (con?.decoration) con.decoration = null;
        this._clearConChromeBag(con);
      }
    } catch (_e) {
      // tree already gone
    }
  }

  /**
   * Prefer hostBag border by WINDOW nanoid; fall back to compositor actor.
   * @param {any} metaWindow
   * @returns {any|null}
   */
  _borderForMeta(metaWindow) {
    if (!metaWindow) return null;
    const bag = this._extWm?.hostBag;
    const id = bag?.idFromMeta?.(metaWindow);
    const fromBag = id ? bag.get(id)?.border : undefined;
    if (fromBag) return fromBag;
    const actor = metaWindow.get_compositor_private?.();
    return actor?.border ?? null;
  }

  /**
   * Pair border immediately above this window's compositor in window_group (D096 G5d).
   * @param {any} metaWindow
   * @returns {boolean}
   */
  restackBorderForMeta(metaWindow) {
    if (!metaWindow || !global.window_group) return false;
    const border = this._borderForMeta(metaWindow);
    if (!border) return false;
    let compositor = null;
    try {
      compositor = metaWindow.get_compositor_private?.() ?? null;
    } catch (_e) {
      return false;
    }
    if (!compositor) return false;
    try {
      const wg = global.window_group;
      if (typeof wg.contains === "function" && wg.contains(border)) {
        wg.remove_child(border);
      }
      if (typeof wg.insert_child_above === "function") {
        wg.insert_child_above(border, compositor);
      } else if (typeof wg.add_child === "function") {
        wg.add_child(border);
      } else {
        return false;
      }
      const bagId = this._extWm?.hostBag?.idFromMeta?.(metaWindow);
      recordChromeZ({ kind: "border", id: bagId || "-", op: "restack" });
      return true;
    } catch (e) {
      Logger.warn(`restackBorderForMeta: ${e}`);
      return false;
    }
  }

  hideActorBorder(actor) {
    // Ensure borders are hidden regardless of state (#268)
    if (!actor) return;
    let border = actor.border;
    const bag = this._extWm?.hostBag;
    if (bag) {
      const meta = actor.meta_window || actor.get_meta_window?.();
      const id = meta ? bag.idFromMeta(meta) : undefined;
      const bagBorder = id ? bag.get(id)?.border : undefined;
      if (bagBorder) border = bagBorder;
    }
    if (border) {
      try {
        border.hide();
      } catch (e) {
        Logger.warn(`Failed to hide border: ${e}`);
      }
    }
    if (actor.splitBorder) {
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
      const tab = this._tabForNode(nodeWindow);
      if (tab && !tab._destroyed) {
        try {
          tab.remove_style_class_name("window-tabbed-tab-active");
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
    let tilingModeEnabled = this._extWm.ext.settings.get_boolean("tiling-mode-enabled");
    let gap = this._extWm.calculateGaps(nodeWindow);
    let maximized = () => Compat.isMaximized(metaWindow) || metaWindow.is_fullscreen() || gap === 0;
    let monitorCount = global.display.get_n_monitors();
    let monitorNode = this._tree.findAncestorMonitor(nodeWindow);
    let tiledChildren = this._extWm._tiledWindowsOnMonitor(monitorNode);
    // forge-hcbz: CSS border-width is St-scaled; inset is physical coords.
    let inset = 3 * Utils.dpi();
    let parentNode = nodeWindow.parentNode;

    const floatingWindow = nodeWindow.isFloat();
    const tiledBorder = this._borderForMeta(metaWindow) || windowActor.border;

    // FLOATS paint may null parentNode; borders still run for focus.
    if (
      parentNode &&
      typeof parentNode.isStackedOrTabbed === "function" &&
      parentNode.isStackedOrTabbed()
    ) {
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
          } else if (
            parentNode &&
            typeof parentNode.isStacked === "function" &&
            parentNode.isStacked()
          ) {
            if (!floatingWindow) {
              tiledBorder.set_style_class_name("window-stacked-border");
            } else {
              tiledBorder.set_style_class_name("window-floated-border");
            }
          } else if (
            parentNode &&
            typeof parentNode.isTabbed === "function" &&
            parentNode.isTabbed()
          ) {
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
    });
    if (borders.length) this.restackBorderForMeta(metaWindow);
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
    if (!actor || !propName) return;
    let border = actor[propName];
    let bagId;
    const bag = this._extWm?.hostBag;
    if (propName === "border" && bag) {
      const meta = actor.meta_window || actor.get_meta_window?.();
      bagId = meta ? bag.idFromMeta(meta) : undefined;
      if (!bagId && border) {
        for (const [id, entry] of bag.entries()) {
          if (entry?.border === border) {
            bagId = id;
            break;
          }
        }
      }
      const bagBorder = bagId ? bag.get(bagId)?.border : undefined;
      if (bagBorder) border = bagBorder;
    }
    if (border) {
      try {
        if (global.window_group?.contains?.(border)) {
          global.window_group.remove_child(border);
        }
        border.hide?.();
        border.destroy?.();
      } catch (e) {
        Logger.warn(`_destroyActorBorder: ${e}`);
      }
    }
    actor[propName] = undefined;
    if (propName === "border" && bagId && bag?.has?.(bagId)) {
      bag.set(bagId, { border: undefined });
    }
  }

  /** Tiled present kids: Forest order when seeded, else GObject childNodes. */
  _tiledKidsForPresent(con) {
    if (!con) return [];
    const kids = liveChildrenForPresent(this._extWm, con);
    if (this._tree?.getTiledChildren) return this._tree.getTiledChildren(kids);
    return kids.length ? kids : con.childNodes || [];
  }

  /**
   * Raise visible Meta window(s) for this CON before strip restack (G5d / R032).
   * @param {import('./tree.js').Node} con
   * @param {import('./tree.js').Node[]} [tiled]
   */
  _raiseGroupWindowsForChrome(con, tiled) {
    if (!con) return;
    const kids = Array.isArray(tiled) && tiled.length ? tiled : this._tiledKidsForPresent(con);
    const open = con.lastTabFocus;
    const tabbed = typeof con.isTabbed === "function" ? con.isTabbed() : false;
    if (tabbed) {
      let meta = open;
      if (!meta) {
        for (const child of kids) {
          const m = child?.nodeValue;
          if (m && !m.minimized) {
            meta = m;
            break;
          }
        }
      }
      if (meta && !meta.minimized) {
        try {
          meta.raise?.();
        } catch (_e) {
          /* finalized */
        }
      }
      return;
    }
    const others = [];
    for (const child of kids) {
      const meta = child?.nodeValue;
      if (!meta || meta.minimized) continue;
      if (open && meta === open) continue;
      others.push(meta);
    }
    for (const meta of others) {
      try {
        meta.raise?.();
      } catch (_e) {
        /* finalized */
      }
    }
    if (open && !open.minimized) {
      try {
        open.raise?.();
      } catch (_e) {
        /* finalized */
      }
    }
  }

  /** Prefer this strip above sibling strips on #forge-tab-chrome. */
  _raiseStripToChromeTop(decoration) {
    const layer = this._tabChromeLayer;
    if (!layer || !decoration) return;
    try {
      const parent =
        typeof decoration.get_parent === "function" ? decoration.get_parent() : decoration._parent;
      if (parent !== layer) return;
      if (typeof layer.set_child_above_sibling === "function") {
        layer.set_child_above_sibling(decoration, null);
        return;
      }
      if (typeof layer.remove_child === "function" && typeof layer.add_child === "function") {
        layer.remove_child(decoration);
        layer.add_child(decoration);
      }
    } catch (_e) {
      /* best-effort */
    }
  }

  /**
   * D046: strips stay on #forge-tab-chrome (not window_group). G5d = raise group
   * Meta before strip + focused strip on top so chrome sits as close as D046 allows.
   * @param {import('./tree.js').Node} con
   * @param {import('./tree.js').Node[]} [_tiled]
   */
  _restackDecorationAboveGroup(con, _tiled) {
    const decoration = this._decorationForCon(con);
    if (!decoration) return;
    if (!this.decorationAlive(decoration)) {
      this.forgetDisposedDecoration(con, "restack");
      return;
    }
    try {
      this._raiseGroupWindowsForChrome(con, _tiled);
      this.attachTabDecoration(con);
      this._raiseStripToChromeTop(decoration);
      this._parkTabChromeLayer();
      const bagId = this._conBagId(con);
      recordChromeZ({ kind: "strip", id: bagId || "-", op: "restack" });
    } catch (e) {
      Logger.warn(`_restackDecorationAboveGroup: ${e}`);
      const deco = this._decorationForCon(con);
      if (deco && !this.decorationAlive(deco)) {
        this.forgetDisposedDecoration(con, "restack");
      }
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
      this._hideConDecoration(con);
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

    // Show chrome on mons without a covering window (Meta max/fs or Forge zoom).
    activeWsNode.getNodeByType(NODE_TYPES.MONITOR).forEach((monitorWs) => {
      if (this._monitorHasCoveringMaxOrFullscreen(monitorWs)) return;
      monitorWs.getNodeByType(NODE_TYPES.CON).forEach((con) => {
        this._showAndRestackTabDecoration(con);
      });
    });
    // Focused group's strip above other strips on the chrome layer.
    const focusMeta = this._extWm.focusMetaWindow;
    const focusNode = focusMeta ? this._extWm.findNodeWindow?.(focusMeta) : null;
    const focusCon = focusNode?.parentNode;
    if (
      focusCon &&
      typeof focusCon.isStackedOrTabbed === "function" &&
      focusCon.isStackedOrTabbed()
    ) {
      this._raiseStripToChromeTop(this._decorationForCon(focusCon));
    }
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
    // Skip if this monitor has a covering window (full path would hide it).
    const mon = this._tree.findAncestorMonitor?.(focusNode) ?? null;
    if (mon && this._monitorHasCoveringMaxOrFullscreen(mon)) return;
    this._showAndRestackTabDecoration(parent);
  }

  /**
   * True when a visible window covers the mon for tab chrome (Meta max/fs or
   * Forge zoom). Minimized covers nothing (forge-iwi).
   * @param {import('./tree.js').Node} monitorNode
   * @returns {boolean}
   */
  _monitorHasCoveringMaxOrFullscreen(monitorNode) {
    if (!monitorNode || typeof monitorNode.getNodeByType !== "function") return false;
    return monitorNode.getNodeByType(NODE_TYPES.WINDOW).some((w) => {
      const mw = w?.nodeValue;
      if (!mw || mw.minimized) return false;
      try {
        if (isZoomMode(w.zoomMode)) return true;
        if (typeof mw.is_fullscreen !== "function") return false;
        return Compat.isMaximized(mw) || mw.is_fullscreen();
      } catch (_e) {
        return false;
      }
    });
  }

  /**
   * Hide one CON strip; drop the pointer if the St actor is already gone.
   * @param {import('./tree.js').Node} con
   */
  _hideConDecoration(con) {
    const deco = this._decorationForCon(con);
    if (!deco) return;
    if (!this.decorationAlive(deco)) {
      this.forgetDisposedDecoration(con, "hide");
      return;
    }
    try {
      deco.hide();
    } catch (_e) {
      this.forgetDisposedDecoration(con, "hide");
    }
  }

  /**
   * Show + restack one CON's tab/stack strip when eligible.
   * @param {import('./tree.js').Node} con
   */
  _showAndRestackTabDecoration(con) {
    const decoration = this._decorationForCon(con);
    if (!decoration) return;
    if (!this.decorationAlive(decoration)) {
      this.forgetDisposedDecoration(con, "show");
      return;
    }
    let tiled = this._tiledKidsForPresent(con);
    let showTabs = this._extWm.ext.settings.get_boolean("showtab-decoration-enabled");
    const kids = liveChildrenForPresent(this._extWm, con);
    if (!(tiled.length > 0 && showTabs && chromeGroupEligible(con, kids))) return;
    // Never show chrome for another workspace (processNode sizes all mons).
    if (!this._conOnActiveWorkspace(con)) {
      this._hideConDecoration(con);
      return;
    }
    try {
      decoration.show();
    } catch (_e) {
      this.forgetDisposedDecoration(con, "show");
      return;
    }
    // Stack the tab strip above this CON's window actors so tabs stay
    // clickable even when global focus is on another monitor/window.
    // (Previously insert_child_below(focus) buried the strip under sibling
    // group actors and clicks only worked after focusing the active tab.)
    this._restackDecorationAboveGroup(con, tiled);
    liveChildrenForPresent(this._extWm, con).forEach((cn) => {
      renderChromeLabel(cn);
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
    const kids = liveChildrenForPresent(this._extWm, con);
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
      const tab = this._tabForNode(cn);
      if (!tab || tab._destroyed) continue;
      try {
        const isOpen = openMeta != null && cn.nodeValue === openMeta;
        if (isOpen) {
          tab.add_style_class_name("window-tabbed-tab-active");
        } else {
          tab.remove_style_class_name("window-tabbed-tab-active");
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
      const deco = this._decorationForCon(con);
      if (deco) live.add(deco);
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
