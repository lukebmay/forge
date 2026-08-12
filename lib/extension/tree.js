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
import Shell from "gi://Shell";
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import { createEnum } from "./enum.js";
import * as Utils from "./utils.js";
import * as Window from "./window.js";
import { MonitorManager } from "./monitor.js";
import { WorkspaceManager } from "./workspace.js";
import * as TreeSnapshot from "./tree-snapshot.js";
import * as MonitorIdentity from "./monitor-identity.js";
import * as TreeLayout from "./tree-layout.js";
import * as Compat from "./compat.js";
import { preferChromePwaApp } from "./place-hint.js";
import {
  createPlaceholderStub,
  isPlaceholderNode,
  isPlaceholderValue,
  markPlaceholderNode,
} from "./layout-placeholder.js";

export const NODE_TYPES = createEnum([
  "ROOT",
  "MONITOR", //Output in i3
  "CON", //Container in i3
  "WINDOW",
  "WORKSPACE",
]);

export const LAYOUT_TYPES = createEnum(["STACKED", "TABBED", "ROOT", "HSPLIT", "VSPLIT", "PRESET"]);

export const ORIENTATION_TYPES = createEnum(["NONE", "HORIZONTAL", "VERTICAL"]);

export const POSITION = createEnum(["BEFORE", "AFTER", "UNKNOWN"]);

// Tuning factor for the stacked/tabbed decoration placement (forge-u8ni): it
// divides the border+gap contribution into the width and x adjustments, and
// doubles as the flat y-offset that lifts the header strip over the bordered
// content. Empirically tuned to keep the strip aligned with the content below.
const DECORATION_ADJUST_FACTOR = 4;

/**
 * The Node data representation of the following elements in the user's display:
 *
 * Monitor,
 * Window,
 * Container (generic),
 * Workspace
 *
 */
export class Node extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  constructor(type, data) {
    super();
    // Internal properties - kept as simple instance properties rather than GObject properties
    // because _data can be heterogeneous (Meta.Window, strings, or St.Bin) and the current
    // pattern is consistent with the rest of this codebase.
    this._type = type; // see NODE_TYPES
    // _data: Meta.Window, unique id strings (Monitor,
    // Workspace or St.Bin - a representation of Container)
    this._data = data;
    this._parent = null;
    this._nodes = []; // Child elements of this node
    this.mode = Window.WINDOW_MODES.DEFAULT;
    this.percent = 0.0;
    // T4: true only after explicit user size (resize / expand / golden).
    // Automatic percents (normalize, min-size write-back) leave this false.
    this.userSized = false;
    this._rect = null;
    this.tab = null;
    this.decoration = null;
    this.app = null;
    this.pointer = null;
    // AC4: first-class placeholder TILE leaf (tree stub or forge-placeholder class).
    this.placeholder = false;

    if (this.isWindow()) {
      // When destroy() is called on Meta.Window, it might not be
      // available so we store it immediately
      if (isPlaceholderValue(this._data)) {
        this.placeholder = true;
        this.app = null;
        this._actor =
          typeof this._data.get_compositor_private === "function"
            ? this._data.get_compositor_private()
            : null;
        // No real Meta/tab chrome for tree-only stubs; remove path is explicit API.
      } else {
        this._initMetaWindow();
        this._actor =
          typeof this._data?.get_compositor_private === "function"
            ? this._data.get_compositor_private()
            : null;
        this._createWindowTab();
      }
    }

    if (this.isCon()) {
      this._createDecoration();
    }
  }

  get windowActor() {
    return this._actor;
  }

  get actor() {
    switch (this.nodeType) {
      case NODE_TYPES.WINDOW:
        // A Meta.Window was assigned during creation
        // But obtain the Clutter.Actor
        return this._actor;
      case NODE_TYPES.CON:
      case NODE_TYPES.ROOT:
        // A St.Bin was assigned during creation
        return this.nodeValue;
      case NODE_TYPES.MONITOR:
      case NODE_TYPES.WORKSPACE:
        // A separate St.Bin was assigned on another attribute during creation
        return this.actorBin;
    }
  }

  set rect(rect) {
    this._rect = rect;
    if (!rect) return;
    switch (this.nodeType) {
      case NODE_TYPES.WINDOW:
        break;
      case NODE_TYPES.CON:
      case NODE_TYPES.MONITOR:
      case NODE_TYPES.ROOT:
      case NODE_TYPES.WORKSPACE:
        if (this.actor) {
          this.actor.set_size(rect.width, rect.height);
          this.actor.set_position(rect.x, rect.y);
        }
        break;
    }
  }

  get rect() {
    return this._rect;
  }

  get childNodes() {
    return this._nodes;
  }

  set childNodes(nodes) {
    this._nodes = nodes;
  }

  get firstChild() {
    if (this._nodes && this._nodes.length >= 1) {
      return this._nodes[0];
    }
    return null;
  }

  get level() {
    let _level = 0;
    let refNode = this.parentNode;
    while (refNode) {
      _level += 1;
      refNode = refNode.parentNode;
    }

    return _level;
  }

  /**
   * Find the index of this relative to the siblings
   */
  get index() {
    if (this.parentNode) {
      let childNodes = this.parentNode.childNodes;
      for (let i = 0; i < childNodes.length; i++) {
        if (childNodes[i] === this) {
          return i;
        }
      }
    }
    return null;
  }

  get lastChild() {
    if (this._nodes && this._nodes.length >= 1) {
      return this._nodes[this._nodes.length - 1];
    }
    return null;
  }

  get nextSibling() {
    if (this.parentNode) {
      if (this.parentNode.lastChild !== this) {
        return this.parentNode.childNodes[this.index + 1];
      }
    }
    return null;
  }

  get nodeType() {
    return this._type;
  }

  get nodeValue() {
    return this._data;
  }

  set nodeValue(value) {
    this._data = value;
  }

  get parentNode() {
    return this._parent;
  }

  set parentNode(node) {
    this._parent = node;
  }

  get previousSibling() {
    if (this.parentNode) {
      if (this.parentNode.firstChild !== this) {
        return this.parentNode.childNodes[this.index - 1];
      }
    }
    return null;
  }

  appendChild(node) {
    if (!node) return null;
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  /**
   * Checks if node is a descendant of this,
   * or a descendant of its childNodes, etc
   */
  contains(node) {
    if (!node) return false;
    let searchNode = this.getNodeByValue(node.nodeValue);
    return searchNode ? true : false;
  }

  getNodeByLayout(layout) {
    let results = this._search(layout, "LAYOUT");
    return results;
  }

  getNodeByMode(mode) {
    let results = this._search(mode, "MODE");
    return results;
  }

  getNodeByValue(value) {
    let results = this._search(value, "VALUE");
    return results && results.length >= 1 ? results[0] : null;
  }

  getNodeByType(type) {
    let results = this._search(type, "TYPE");
    return results;
  }

  /**
   * @param childNode - is a child of this
   */
  insertBefore(newNode, childNode) {
    if (!newNode) return null;
    if (newNode === childNode) return null;
    if (!childNode) {
      this.appendChild(newNode);
      return newNode;
    }
    if (childNode.parentNode !== this) return null;
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    let index = childNode.index;

    if (childNode.index === 0) {
      this.childNodes.unshift(newNode);
    } else if (childNode.index > 0) {
      this.childNodes.splice(index, 0, newNode);
    }
    newNode.parentNode = this;

    return newNode;
  }

  /**
   * Replace this node's child list with `ordered` (deduped, stable).
   * Drops children not listed; reparents listed nodes via appendChild.
   * @param {any[]} ordered
   * @returns {Node}
   */
  replaceChildren(ordered) {
    const next = [];
    const seen = new Set();
    for (const n of ordered || []) {
      if (!n || seen.has(n)) continue;
      seen.add(n);
      next.push(n);
    }
    for (const c of [...this.childNodes]) {
      if (!seen.has(c)) this.removeChild(c);
    }
    for (const n of next) {
      this.appendChild(n);
    }
    return this;
  }

  isLayout(name) {
    let layout = this.layout;
    if (!layout) return false;

    return name === layout;
  }

  isHSplit() {
    return this.isLayout(LAYOUT_TYPES.HSPLIT);
  }

  isVSplit() {
    return this.isLayout(LAYOUT_TYPES.VSPLIT);
  }

  isStacked() {
    return this.isLayout(LAYOUT_TYPES.STACKED);
  }

  isTabbed() {
    return this.isLayout(LAYOUT_TYPES.TABBED);
  }

  isStackedOrTabbed() {
    return this.isStacked() || this.isTabbed();
  }

  isType(name) {
    const type = this.nodeType;
    if (!type) return false;

    return name === type;
  }

  isWindow() {
    return this.isType(NODE_TYPES.WINDOW);
  }

  isCon() {
    return this.isType(NODE_TYPES.CON);
  }

  isMonitor() {
    return this.isType(NODE_TYPES.MONITOR);
  }

  isWorkspace() {
    return this.isType(NODE_TYPES.WORKSPACE);
  }

  isRoot() {
    return this.isType(NODE_TYPES.ROOT);
  }

  isMode(name) {
    const mode = this.mode;
    if (!name) return false;

    return name === mode;
  }

  isFloat() {
    return this.isMode(Window.WINDOW_MODES.FLOAT);
  }

  isTile() {
    return this.isMode(Window.WINDOW_MODES.TILE);
  }

  isGrabTile() {
    return this.isMode(Window.WINDOW_MODES.GRAB_TILE);
  }

  /** AC4: reserved thrash/fail-open slot leaf (never thrash-isolated). */
  isPlaceholder() {
    return isPlaceholderNode(this);
  }

  removeChild(node) {
    if (node.isStackedOrTabbed() && node.decoration) {
      node.decoration.hide();
      // forge-6asv: a stacked/tabbed CON's decoration holds its DIRECT children's
      // tab actors. removeChild is the reparent-detach primitive (appendChild /
      // insertBefore both reach here), so a reparented intact CON's direct children
      // survive and migrate inside it — but destroy_all_children() below finalizes
      // their tab actors, leaving each child's .tab/._tabRep dangling so the next
      // render throws on the deallocated St.BoxLayout. Reset each DIRECT child's tab
      // BEFORE the destroy (mirrors the forge-gdsz flatten guard). Direct children
      // only: nested CONs own untouched decorations and destroy_all_children() is
      // non-recursive, so their actors stay live.
      for (const child of node.childNodes) {
        if (child.tab) child._resetTabForReparent();
      }
      node.decoration.destroy_all_children();
      node.decoration.destroy();
      node.decoration = null;
    }

    // Bug #57 (forge-37r): a removed CON may own a header tab in its parent's
    // decoration — tear it down so it does not dangle. WINDOW-node tab teardown
    // is NOT done here: removeChild is also the reparent-detach primitive
    // (appendChild/insertBefore), where a moved window must keep its tab. The
    // window-tab leak on genuine removal (forge-wrot) is handled in removeNode.
    if (node.isCon() && node.tab) {
      node._destroyTab();
    }

    // Resolve the child by identity (the index getter), not the value-based
    // contains(): split() leaves a stale original-node reference whose nodeValue
    // still matches a fresh sibling, so contains() returns true while index is
    // null. splice(null, 1) coerces to splice(0, 1) and evicts the WRONG child
    // (forge-mo27). The index getter is the single source of truth for "is this
    // a direct child of its own parent", and is null for a detached/stale node.
    let refNode;
    const childIndex = node.index;
    if (childIndex !== null) {
      refNode = node.parentNode.childNodes.splice(childIndex, 1);
      node.parentNode = null;
    }
    if (!refNode) {
      throw `NodeNotFound ${node}`;
    }
    return refNode;
  }

  /**
   * Backend for getNodeBy[attribute]. It is similar to DOM.getElementBy functions
   */
  _search(term, criteria) {
    let results = [];
    let searchFn = (candidate) => {
      if (criteria) {
        switch (criteria) {
          case "VALUE":
            if (candidate.nodeValue === term) {
              results.push(candidate);
            }
            break;
          case "TYPE":
            if (candidate.nodeType === term) {
              results.push(candidate);
            }
            break;
          case "MODE":
            if (candidate.mode === term) {
              results.push(candidate);
            }
            break;
          case "LAYOUT":
            if (candidate.layout && candidate.layout === term) {
              results.push(candidate);
            }
        }
      } else {
        if (candidate === term) {
          results.push(candidate);
        }
      }
    };

    this._walk(searchFn, this._traverseBreadthFirst);
    return results;
  }

  // start walking from root and all child nodes
  _traverseBreadthFirst(callback) {
    let queue = new Queue();
    queue.enqueue(this);

    let currentNode = queue.dequeue();

    while (currentNode) {
      for (let i = 0, length = currentNode.childNodes.length; i < length; i++) {
        queue.enqueue(currentNode.childNodes[i]);
      }

      callback(currentNode);
      currentNode = queue.dequeue();
    }
  }

  // start walking from bottom to root
  _traverseDepthFirst(callback) {
    let recurse = (currentNode) => {
      for (let i = 0, length = currentNode.childNodes.length; i < length; i++) {
        recurse(currentNode.childNodes[i]);
      }

      callback(currentNode);
    };
    recurse(this);
  }

  _walk(callback, traversal) {
    traversal.call(this, callback);
  }

  _initMetaWindow() {
    if (this.isWindow()) {
      let windowTracker = Shell.WindowTracker.get_default();
      let metaWin = this.nodeValue;
      let app = windowTracker.get_window_app(metaWin);
      // Chrome PWAs: Meta often reports chrome-<id>-Default while .desktop
      // StartupWMClass is crx_<id>. WindowTracker then returns bare Chrome (or
      // a sibling PWA). Prefer the matching chrome-<id>-Default desktop.
      try {
        const wmClass =
          typeof metaWin?.get_wm_class === "function" ? metaWin.get_wm_class() : metaWin?.wm_class;
        const appSys = Shell.AppSystem?.get_default?.();
        const pwa = preferChromePwaApp(wmClass, app, appSys);
        if (pwa) app = pwa;
      } catch (_e) {
        // AppSystem / class unavailable in fixtures
      }
      this.app = app;
    }
  }

  /**
   * forge-2uc0: Shell.WindowTracker.get_window_app() can return null at map time
   * for apps that report wm_class late (Anki, Opera, many Flatpaks). this.app is
   * snapshotted once in _initMetaWindow at construction. Re-snapshot and rebuild
   * when the class lands — upgrade a T1 fallback tab (`_tabFallback`) to a real
   * app icon, or fill a missing tab.
   * Also rebuild when the resolved Shell.App id changes (wrong Chrome → PWA).
   */
  refreshApp() {
    const prevId = this.app?.get_id?.() ?? null;
    const wasFallback = !!this._tabFallback;
    this._initMetaWindow();
    const newId = this.app?.get_id?.() ?? null;
    if (wasFallback || !this.tab || prevId !== newId) {
      this._destroyTab();
    }
    this._createWindowTab();
  }

  /**
   * Shared header-tab scaffold (icon + title in a styled box). The title button
   * stays at child index 1 so Node.render() can refresh it uniformly for window
   * and CON (forge-37r) tabs. Callers append any extra controls (e.g. a close
   * button) and wire their own click handlers. Null `app` uses a generic icon so
   * tabs still exist when WindowTracker has not resolved yet (T1 empty-gap).
   */
  _buildTabBase(app, labelText) {
    let tabContents = new St.BoxLayout({
      style_class: "window-tabbed-tab",
      x_expand: true,
    });
    let iconBin = new St.Button({ style_class: "window-tabbed-tab-icon" });
    // forge-qy65: Shell.App.create_icon_texture(size) takes a LOGICAL icon-size
    // that St scales by scale_factor internally. Passing 24*dpi() double-scales it
    // (96 physical at 2x) and distorts the tab bar. Pass the logical 24 and let St
    // scale — unlike the raw layout constants (stackedBarHeight etc.) which do need dpi().
    iconBin.child = app
      ? app.create_icon_texture(24)
      : new St.Icon({ icon_name: "application-x-executable-symbolic", icon_size: 24 });
    let titleButton = new St.Button({ x_expand: true, label: `${labelText ?? ""}` });
    tabContents.add_child(iconBin);
    tabContents.add_child(titleButton);
    return { tabContents, iconBin, titleButton };
  }

  _createWindowTab() {
    // Null app is OK — fallback icon/label so processNode never attaches zero tabs
    // while reserving bar height (T1; supersedes forge-v4u0 skip-on-null).
    if (this.tab || !this.isWindow()) return;

    let metaWin = this.nodeValue;
    let { tabContents, iconBin, titleButton } = this._buildTabBase(this.app, this._getTitle());
    this._tabFallback = !this.app;
    let closeButton = new St.Button({
      style_class: "window-tabbed-tab-close",
      child: new St.Icon({ icon_name: "window-close-symbolic" }),
    });
    tabContents.add_child(closeButton);

    let clickFn = () => {
      this.parentNode?.childNodes?.forEach((c) => {
        if (c.tab) {
          c.tab.remove_style_class_name("window-tabbed-tab-active");
          c.render();
        }
      });
      tabContents.add_style_class_name("window-tabbed-tab-active");
      this._activateFromTab(metaWin);
    };

    let closeFn = () => {
      metaWin.delete(global.get_current_time());
    };

    let middleClickCloseFn = (_, event) => {
      if (event.get_button() === Clutter.BUTTON_MIDDLE) {
        metaWin.delete(global.get_current_time());
      }
    };

    // Close on primary/middle press + STOP so strip activate/restack cannot
    // steal the gesture before St.Button "clicked" (last-tab restack race).
    const isCloseControl = (source) => {
      if (!source || !closeButton) return false;
      if (source === closeButton) return true;
      try {
        if (closeButton.contains?.(source)) return true;
      } catch (_e) {
        // finalized
      }
      let a = source;
      for (let i = 0; i < 8 && a; i++) {
        if (a === closeButton) return true;
        a = typeof a.get_parent === "function" ? a.get_parent() : a._parent;
      }
      return false;
    };

    closeButton.connect("button-press-event", (_, event) => {
      const btn = event.get_button();
      if (btn === Clutter.BUTTON_PRIMARY || btn === Clutter.BUTTON_MIDDLE) {
        closeFn();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    closeButton.connect("clicked", closeFn);
    closeButton.connect("button-release-event", middleClickCloseFn);

    // Whole tab strip is clickable (not only icon/title buttons). Primary press
    // activates (LF2); travel past threshold arms grab-tile relocate (LX4).
    tabContents.reactive = true;
    tabContents.connect("button-press-event", (_, event) => {
      const source = typeof event.get_source === "function" ? event.get_source() : null;
      if (isCloseControl(source)) return Clutter.EVENT_PROPAGATE;
      const btn = event.get_button();
      if (btn === Clutter.BUTTON_PRIMARY) {
        clickFn();
        this._armTabDragForWindow(metaWin, event);
        return Clutter.EVENT_STOP;
      }
      if (btn === Clutter.BUTTON_MIDDLE) {
        metaWin.delete(global.get_current_time());
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    // Motion/release on the tab itself when stage capture is unavailable.
    tabContents.connect("motion-event", (_, event) => {
      this._noteTabDragFromEvent(event);
      return Clutter.EVENT_PROPAGATE;
    });
    tabContents.connect("button-release-event", (_, event) => {
      if (event.get_button() === Clutter.BUTTON_PRIMARY) {
        this._finishTabDragFromEvent();
      }
      return Clutter.EVENT_PROPAGATE;
    });
    iconBin.connect("clicked", clickFn);
    iconBin.connect("button-release-event", middleClickCloseFn);
    titleButton.connect("clicked", clickFn);
    titleButton.connect("button-release-event", middleClickCloseFn);

    if (metaWin === global.display.get_focus_window()) {
      tabContents.add_style_class_name("window-tabbed-tab-active");
    }
    this.tab = tabContents;
    // Clear our ref if the tab actor is destroyed by ANY path — notably the parent
    // decoration's destroy()/destroy_all_children() finalizing its children. Otherwise
    // this.tab dangles and removeNode/_destroyTab/render() touch a disposed St.BoxLayout,
    // logging "Object St.BoxLayout has been already disposed" and risking a crash
    // (forge-v2yz). The 'destroy' signal is the reliable source of truth (the old
    // `_destroyed` flag was never set). Guarded so a stale OLD tab's destroy can't null a
    // freshly-rebuilt one.
    tabContents.connect("destroy", () => {
      if (this.tab === tabContents) this.tab = null;
      this._cancelTabDragIfWindow(metaWin);
    });
  }

  /**
   * Bug #57 (forge-37r): build (or rebuild) a header tab for a CON child of a
   * tabbed parent so the nested split renders as a single i3-style tab item.
   * The representative (first descendant) window supplies the icon/title and is
   * the activation target; clicking raises the whole sub-tree so its split shows
   * above the other tabs. Rebuilt when the representative changes (windows
   * opened/closed/moved); torn down when the CON has no windows.
   */
  _ensureConTab() {
    if (!this.isCon()) return;
    let rep = this.getNodeByType(NODE_TYPES.WINDOW)[0];
    if (!rep) {
      this._destroyTab();
      this._tabRep = null;
      return;
    }
    // Rebuild when rep changes, or upgrade a null-app fallback once rep.app lands.
    if (this.tab && this._tabRep === rep && !(this._tabFallback && rep.app)) return;
    this._destroyTab();
    this._tabRep = rep;

    let { tabContents, iconBin, titleButton } = this._buildTabBase(rep.app, this._getTitle());
    this._tabFallback = !rep.app;

    let clickFn = () => {
      this.parentNode?.childNodes.forEach((c) => {
        if (c.tab) {
          c.tab.remove_style_class_name("window-tabbed-tab-active");
          c.render();
        }
      });
      tabContents.add_style_class_name("window-tabbed-tab-active");
      // Resolve the representative live (the captured one may have since closed).
      let windows = this.getNodeByType(NODE_TYPES.WINDOW);
      windows.forEach((w) => {
        try {
          w.nodeValue?.raise();
        } catch (_e) {
          // finalized
        }
      });
      const target = windows[0]?.nodeValue;
      if (target) this._activateFromTab(target);
    };

    tabContents.reactive = true;
    tabContents.connect("button-press-event", (_, event) => {
      if (event.get_button() === Clutter.BUTTON_PRIMARY) {
        clickFn();
        // CON tab unit: grab the live representative window (same as titlebar).
        const win = this.getNodeByType(NODE_TYPES.WINDOW)[0]?.nodeValue;
        if (win) this._armTabDragForWindow(win, event);
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    tabContents.connect("motion-event", (_, event) => {
      this._noteTabDragFromEvent(event);
      return Clutter.EVENT_PROPAGATE;
    });
    tabContents.connect("button-release-event", (_, event) => {
      if (event.get_button() === Clutter.BUTTON_PRIMARY) {
        this._finishTabDragFromEvent();
      }
      return Clutter.EVENT_PROPAGATE;
    });
    iconBin.connect("clicked", clickFn);
    titleButton.connect("clicked", clickFn);

    this.tab = tabContents;
    // See _createWindowTab: clear the CON tab ref (and representative, so the next
    // render rebuilds) if the actor is destroyed externally, so it can't dangle (forge-v2yz).
    tabContents.connect("destroy", () => {
      if (this.tab === tabContents) {
        this.tab = null;
        this._tabRep = null;
      }
      const win = this.getNodeByType?.(NODE_TYPES.WINDOW)?.[0]?.nodeValue;
      if (win) this._cancelTabDragIfWindow(win);
    });
  }

  /** @returns {import('./window.js').WindowManager | null} */
  _resolveExtWm() {
    let root = this;
    while (root.parentNode) root = root.parentNode;
    return root.extWm || root._extWm || null;
  }

  /** LX4: arm tab chrome drag → grab-tile for metaWin. */
  _armTabDragForWindow(metaWin, event) {
    try {
      const wm = this._resolveExtWm();
      wm?.dragDrop?.armTabDrag?.(metaWin, event);
    } catch (e) {
      Logger.warn(`_armTabDragForWindow: ${e}`);
    }
  }

  _noteTabDragFromEvent(event) {
    try {
      const wm = this._resolveExtWm();
      const dd = wm?.dragDrop;
      if (!dd?.noteTabDragMotion || !event?.get_coords) return;
      const coords = event.get_coords();
      if (!Array.isArray(coords) || coords.length < 2) return;
      const x = coords.length >= 3 && typeof coords[0] === "boolean" ? coords[1] : coords[0];
      const y = coords.length >= 3 && typeof coords[0] === "boolean" ? coords[2] : coords[1];
      dd.noteTabDragMotion(x, y);
    } catch (_e) {
      // ignore
    }
  }

  _finishTabDragFromEvent() {
    try {
      this._resolveExtWm()?.dragDrop?.finishTabDragRelease?.();
    } catch (_e) {
      // ignore
    }
  }

  _cancelTabDragIfWindow(metaWin) {
    try {
      const dd = this._resolveExtWm()?.dragDrop;
      if (!dd?._tabDrag || dd._tabDrag.metaWindow !== metaWin) return;
      dd.cancelTabDrag?.();
    } catch (_e) {
      // ignore
    }
  }

  /**
   * Activate a window from a tab click: raise, focus, restack stack/tab group.
   * Must match keyboard `_activateWindowNode` (focus+activate) — activate-only
   * fails to take desk focus on X11 after multi-mon focus / layout apply (LF2).
   * @param {any} metaWin - Meta.Window
   */
  _activateFromTab(metaWin) {
    if (!metaWin) return;
    try {
      if (this.parentNode) this.parentNode.lastTabFocus = metaWin;
      // Same order as Tree._activateWindowNode: raise → focus → activate.
      const now = global.display.get_current_time();
      metaWin.raise?.();
      metaWin.focus?.(now);
      metaWin.activate?.(now);
    } catch (e) {
      Logger.warn(`_activateFromTab: activate failed: ${e}`);
      return;
    }
    // Immediate FocusChanged (afterFocus): raise buries the strip; focus may
    // not change so Meta focus-update (~220ms) never runs.
    try {
      let root = this;
      while (root.parentNode) root = root.parentNode;
      const wm = root.extWm || root._extWm;
      if (!wm?.tree) return;
      const node = wm.tree.findNode(metaWin) || this;
      if (typeof wm.afterFocus === "function") {
        wm.afterFocus(node, { source: "tab-click" });
      } else {
        // Fallback if afterFocus not wired (tests / partial mocks).
        wm.unfreezeRender?.();
        wm.updateTabbedFocus?.(node);
        wm.updateStackedFocus?.(node);
        wm.updateDecorationLayout?.({ scope: "focus", focusNode: node });
        wm.updateBorderLayout?.();
      }
    } catch (e) {
      Logger.warn(`_activateFromTab: restack failed: ${e}`);
    }
  }

  _destroyTab() {
    if (!this.tab) return;
    // The tab actor may already have been destroyed via the parent decoration's
    // destroy_all_children() (removeChild) or a prior _destroyTab. Forge never
    // set the old `_destroyed` flag this guarded on, so it was vacuous — touching
    // a finalized Clutter actor (get_parent/destroy) throws (forge-5r0j). Wrap in
    // try/catch and null the ref either way so the op is idempotent and the next
    // render rebuilds a fresh tab.
    try {
      let parent = this.tab.get_parent ? this.tab.get_parent() : null;
      if (parent) parent.remove_child(this.tab);
      if (this.tab.destroy) this.tab.destroy();
    } catch (e) {
      Logger.warn(`_destroyTab: tab actor already finalized: ${e}`);
    }
    this.tab = null;
  }

  /**
   * Drop a (possibly soon-to-be-deallocated) tab reference and rebuild it so the
   * next render is safe. Used when a stacked/tabbed CON's decoration is torn down
   * — its child tab actors get destroyed wholesale, leaving each surviving child's
   * `.tab`/`._tabRep` dangling. Nulling first is required: _createWindowTab and
   * _ensureConTab both early-return while `.tab`/`._tabRep` still point at the dead
   * actor. WINDOW children rebuild eagerly here; CON children regenerate via
   * _ensureConTab on the next render once `._tabRep` is cleared (forge-gdsz/6asv).
   */
  _resetTabForReparent() {
    this.tab = null;
    this._tabRep = null;
    if (this.isWindow()) this._createWindowTab();
  }

  _createDecoration() {
    if (this.decoration) return;
    let decoration = new St.BoxLayout();
    // Default horizontal row; processStacked flips to a vertical column per render.
    // Use Compat: GNOME 45–47 need .vertical (see setBoxOrientation).
    Compat.setBoxOrientation(decoration, Clutter.Orientation.HORIZONTAL);
    decoration.type = "forge-deco";
    decoration.parentNode = this;
    // Tabs must receive pointer events; non-reactive parents can swallow picks.
    decoration.reactive = true;
    let globalWinGrp = global.window_group;
    decoration.style_class = "window-tabbed-bg";

    if (!globalWinGrp.contains(decoration)) {
      globalWinGrp.add_child(decoration);
    }

    decoration.hide();
    this.decoration = decoration;
  }

  /**
   * Tear down this node's decoration St.BoxLayout and null the reference so the
   * next render rebuilds a fresh one via _createDecoration. Used by the
   * processStacked/processTabbed self-heal catch blocks and auto-exit-tabbed:
   * nulling alone stranded the old header in window_group (forge-ogmd). Wrapped
   * so a second throw on an already-finalized actor can't escape the render loop.
   *
   * Child tabs use _destroyTab (not _resetTabForReparent): rebuild would leave
   * unparented tab actors after exit from TABBED/STACKED, and self-heal recreates
   * tabs on the next processTabbed/processStacked pass.
   */
  _destroyDecoration() {
    if (!this.decoration) return;
    try {
      // Destroy each child's tab FIRST so refs don't dangle into a later render
      // after dispose (Gjs-CRITICAL on close, forge-v2yz).
      for (const child of this.childNodes) {
        if (child.tab) child._destroyTab();
      }
      this._tabRowHosts = null;
      const parent = this.decoration.get_parent ? this.decoration.get_parent() : null;
      if (parent) parent.remove_child(this.decoration);
      if (this.decoration.destroy) this.decoration.destroy();
    } catch (e) {
      Logger.warn(`_destroyDecoration: decoration actor already finalized: ${e}`);
    }
    this.decoration = null;
  }

  _getTitle() {
    // Prefer a non-blank label: title → app name → wm_class → "Window" (T1).
    if (this.isWindow() && this.nodeValue) {
      return this._titleForMeta(this.nodeValue, this.app);
    }
    // Bug #57 (forge-37r): a CON header tab borrows the title of its representative
    // (first descendant) window so a nested split reads as one collapsible item.
    if (this.isCon()) {
      let rep = this.getNodeByType(NODE_TYPES.WINDOW)[0];
      if (rep && rep.nodeValue) {
        return this._titleForMeta(rep.nodeValue, rep.app);
      }
    }
    return "Window";
  }

  _titleForMeta(metaWin, app) {
    if (metaWin.title) return metaWin.title;
    let appName = app && typeof app.get_name === "function" ? app.get_name() : null;
    if (appName) return appName;
    let wmClass =
      typeof metaWin.get_wm_class === "function" ? metaWin.get_wm_class() : metaWin.wm_class;
    if (wmClass) return wmClass;
    return "Window";
  }

  render() {
    // Always update the title for the tab
    if (this.tab !== null && this.tab !== undefined) {
      let titleLabel = this.tab.get_child_at_index(1);
      let title = this._getTitle();
      if (titleLabel) titleLabel.label = title;
    }
  }

  set float(value) {
    if (this.isWindow()) {
      let metaWindow = this.nodeValue;
      // Placeholders stay TILE reservation; never float or Meta-pin.
      if (this.isPlaceholder() || isPlaceholderValue(metaWindow)) {
        this.mode = Window.WINDOW_MODES.TILE;
        return;
      }
      let floatAlwaysOnTop = this.settings.get_boolean("float-always-on-top-enabled");
      if (value) {
        this.mode = Window.WINDOW_MODES.FLOAT;
        // Bug #289 fix: Don't apply always-on-top to fullscreen windows
        const isFullscreen =
          typeof metaWindow?.is_fullscreen === "function" ? metaWindow.is_fullscreen() : false;
        // Only pin floats when the user opted into always-on-top. Dialogs are
        // kept above the tiled grid by raise-on-focus (WindowManager focus
        // handler), not a global make_above pin — a permanent pin used to strand
        // a popup above every other float so clicking a sibling never raised it.
        if (
          typeof metaWindow?.is_above === "function" &&
          !metaWindow.is_above() &&
          floatAlwaysOnTop &&
          !isFullscreen
        ) {
          metaWindow.make_above();
          this._forgeSetAbove = true; // Track that Forge set this
        }
      } else {
        this.mode = Window.WINDOW_MODES.TILE;
        // Only remove always-on-top if Forge was the one who set it
        if (
          typeof metaWindow?.is_above === "function" &&
          metaWindow.is_above() &&
          this._forgeSetAbove
        ) {
          metaWindow.unmake_above();
          this._forgeSetAbove = false;
        }
      }
    }
  }

  set tile(value) {
    this.float = !value;
  }

  resetLayoutSingleChild() {
    if (this.isStackedOrTabbed() && this.singleOrNoChild()) {
      this.layout = LAYOUT_TYPES.HSPLIT;
    }
  }

  singleOrNoChild() {
    return this.childNodes.length <= 1;
  }
}

/**
 * An implementation of Queue using arrays
 */
export class Queue extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  constructor() {
    super();
    this._elements = [];
  }

  get length() {
    return this._elements.length;
  }

  enqueue(item) {
    this._elements.push(item);
  }

  dequeue() {
    return this._elements.shift();
  }
}

export class Tree extends Node {
  static {
    GObject.registerClass(this);
  }

  /** @param {Window.WindowManager} extWm */
  constructor(extWm) {
    let rootBin = new St.Bin();
    super(NODE_TYPES.ROOT, rootBin);
    this._extWm = extWm;
    this.settings = this.extWm.ext.settings;
    this.layout = LAYOUT_TYPES.ROOT;
    if (!global.window_group.contains(rootBin)) global.window_group.add_child(rootBin);

    // Create monitor manager for monitor-related operations
    this._monitorManager = new MonitorManager(this, extWm);

    // Create workspace manager for workspace-related operations
    this._workspaceManager = new WorkspaceManager(this, extWm);

    this._initWorkspaces();
  }

  /** @type {MonitorManager} */
  get monitorManager() {
    return this._monitorManager;
  }

  /** @type {WorkspaceManager} */
  get workspaceManager() {
    return this._workspaceManager;
  }

  /** @type {Window.WindowManager} */
  get extWm() {
    return this._extWm;
  }

  /**
   * Handles new and existing workspaces in the tree
   */
  _initWorkspaces() {
    let wsManager = global.display.get_workspace_manager();
    let workspaces = wsManager.get_n_workspaces();
    for (let i = 0; i < workspaces; i++) {
      this.addWorkspace(i);
    }
  }

  /**
   * Add monitor nodes for a workspace.
   * Delegates to MonitorManager.
   * @param {number} wsIndex - Workspace index
   */
  addMonitor(wsIndex) {
    this._monitorManager.addMonitor(wsIndex);
  }

  /**
   * Add a workspace to the tree structure.
   * Delegates to WorkspaceManager.
   * @param {number} wsIndex - Workspace index
   * @returns {boolean} True if workspace was added
   */
  addWorkspace(wsIndex) {
    return this._workspaceManager.addWorkspace(wsIndex);
  }

  /**
   * Remove a workspace from the tree structure.
   * Delegates to WorkspaceManager.
   * @param {number} wsIndex - Workspace index
   * @returns {boolean} True if workspace was removed
   */
  removeWorkspace(wsIndex) {
    return this._workspaceManager.removeWorkspace(wsIndex);
  }

  get nodeWorkpaces() {
    let nodeWorkspaces = this.getNodeByType(NODE_TYPES.WORKSPACE);
    return nodeWorkspaces;
  }

  get nodeWindows() {
    let nodeWindows = this.getNodeByType(NODE_TYPES.WINDOW);
    return nodeWindows;
  }

  /**
   * Reloads the tree structure. This is an expensive operation.
   * Useful when using dynamic workspaces in GNOME-shell.
   *
   * Note: Caller is responsible for tracking current windows and rendering
   * after this method completes.
   */
  reload() {
    Utils._disableDecorations();
    // forge-h6jc: tear down the existing generation of workspace/monitor
    // scaffold bins before dropping the nodes, otherwise reload() orphans them
    // in global.window_group and leaks an St.Bin per workspace+monitor.
    this._removeScaffoldBins();
    this.childNodes.length = 0;
    this.attachNode = undefined;
    // Re-initialize the workspaces and monitors
    this._initWorkspaces();
  }

  /**
   * forge-h6jc: remove the current workspace/monitor scaffold bins from
   * global.window_group. The root bin is intentionally left in place so it can
   * be reused; destroy() handles the root bin on teardown. Mirrors the
   * contains()-guarded remove_child used in WorkspaceManager.removeWorkspace.
   */
  _removeScaffoldBins() {
    const nodeBins = [
      ...this.getNodeByType(NODE_TYPES.WORKSPACE),
      ...this.getNodeByType(NODE_TYPES.MONITOR),
    ];
    for (const node of nodeBins) {
      const bin = node.actorBin;
      if (bin && global.window_group.contains(bin)) global.window_group.remove_child(bin);
    }
  }

  /**
   * forge-h6jc: full scaffold teardown for disable(). Removes every
   * workspace/monitor actorBin and the root bin from global.window_group so no
   * St.Bins are leaked when the tree is dropped.
   */
  destroy() {
    this._removeScaffoldBins();
    const rootBin = this.nodeValue;
    if (rootBin && global.window_group.contains(rootBin)) global.window_group.remove_child(rootBin);
  }

  /**
   * T6: full in-memory forest snapshot (MONITOR roots → CONs + WINDOW leaves).
   * Captures H/V/TABBED/STACKED, child order, percent, userSized, lastTabFocus.
   * WINDOW leaves are keyed by live Meta.Window (survives reload).
   * T7: mon descriptors get stableKey from WindowManager live map when available.
   */
  snapshotTree() {
    const liveMap =
      typeof this.extWm?.getMonitorLiveMap === "function" ? this.extWm.getMonitorLiveMap() : null;
    return TreeSnapshot.captureForest(this.getNodeByType(NODE_TYPES.MONITOR), { liveMap });
  }

  /**
   * T6: force-rebuild each monitor from a full forest snapshot after flat reload.
   * Co-located survivors only; closed windows collapse; percents/userSized restored.
   */
  restoreTree(snapshot) {
    TreeSnapshot.restoreForest(snapshot, this._treeSnapshotCtx());
  }

  /**
   * T6: monitor-recovery path — rebuild only monitors whose topology diverged;
   * intact monitors get percent/userSized re-applied only.
   */
  restoreTreeIfNeeded(snapshot) {
    TreeSnapshot.restoreForestIfNeeded(snapshot, this._treeSnapshotCtx());
  }

  /** Shared ctx for pure tree-snapshot helpers (St.Bin CONs live here). */
  _treeSnapshotCtx() {
    return {
      findMonitor: (id) => this.findNode(id),
      findNode: (win) => this.findNode(win),
      findMonitorByStableKey: (stableKey, monDescId) => {
        const liveMap =
          typeof this.extWm?.getMonitorLiveMap === "function"
            ? this.extWm.getMonitorLiveMap()
            : null;
        const id = MonitorIdentity.resolveMonWsIdByStableKey({ id: monDescId, stableKey }, liveMap);
        return id ? this.findNode(id) : null;
      },
      createCon: () => {
        const con = new Node(NODE_TYPES.CON, new St.Bin());
        con.settings = this.settings;
        return con;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    };
  }

  /**
   * forge-bqa: capture the STACKED/TABBED groupings before a destructive
   * reload() so they can be re-applied afterwards. node.layout lives only in
   * memory, so reload() (which clears the tree) otherwise loses every stack/tab
   * grouping and the windows come back as a flat split. Windows are keyed by
   * their live Meta.Window object, which survives reload().
   *
   * forge-4y80: groups whose children include a nested sub-split CON (the Bug
   * #57 shape) are captured as a recursive descriptor tree rather than skipped,
   * so the nested structure survives the reload instead of being flattened.
   * Only the OUTERMOST stacked/tabbed group is captured at top level; nested
   * stacked/tabbed cons are folded into their ancestor's descriptor.
   *
   * T6: descriptors also carry percent/userSized (via captureNode). Full forest
   * restore (snapshotTree) is preferred on reload/monitor-recovery; this remains for
   * layout-group-only callers and forge-bqa regression tests.
   */
  snapshotLayoutGroups() {
    const groups = [];
    for (const layout of [LAYOUT_TYPES.STACKED, LAYOUT_TYPES.TABBED]) {
      for (const con of this.getNodeByLayout(layout)) {
        if (con.childNodes.length < 2) continue;
        if (this._hasStackedOrTabbedAncestor(con)) continue;
        groups.push(this._snapshotNode(con));
      }
    }
    return groups;
  }

  /** Recursive descriptor: WINDOW leaves keyed by Meta.Window, CONs by layout. */
  _snapshotNode(node) {
    return TreeSnapshot.captureNode(node);
  }

  _hasStackedOrTabbedAncestor(node) {
    let p = node.parentNode;
    while (p && p.nodeType === NODE_TYPES.CON) {
      if (p.isStackedOrTabbed()) return true;
      p = p.parentNode;
    }
    return false;
  }

  /**
   * forge-bqa / forge-4y80: re-apply the groupings captured by
   * snapshotLayoutGroups() after the tree has been rebuilt with the windows
   * flat under their monitor. For each group, resolve the surviving leaf
   * windows; when at least two landed back under one common parent, rebuild the
   * captured (possibly nested) sub-tree in place at the cohort's original
   * position.
   *
   * Rebuilt CONs get a fresh St.Bin (the original Bin died with the old tree, so
   * CONs cannot be matched by identity — only WINDOW leaves can). T6: percents
   * and userSized are restored from the descriptor when present (no blanket
   * equalize wipe of the rebuilt CON's children).
   */
  restoreLayoutGroups(snapshot) {
    if (!snapshot || snapshot.length === 0) return;
    for (const descriptor of snapshot) {
      const winNodes = this._descriptorWindows(descriptor)
        .map((win) => this.findNode(win))
        .filter((node) => node);
      if (winNodes.length < 2) continue;
      // Only regroup windows that all landed back under the same parent; a
      // scattered group (windows moved monitors, or some closed) is skipped.
      const parent = winNodes[0].parentNode;
      const cohort = winNodes.filter((node) => node.parentNode === parent);
      if (cohort.length < 2) continue;

      // insertIndex is the cohort's first position in the original flat parent.
      // rebuild detaches the cohort windows (via appendChild) as it builds,
      // and every node before insertIndex is a non-cohort sibling that keeps its
      // place — so splicing the rebuilt CON in afterwards lands it correctly.
      const insertIndex = Math.min(...cohort.map((node) => node.index));
      const cohortSet = new Set(cohort);
      const extraChildren = parent.childNodes.filter((c) => !cohortSet.has(c));
      const extrasBefore = extraChildren.filter((c) => c.index < insertIndex);
      const extrasAfter = extraChildren.filter((c) => c.index >= insertIndex);
      const rebuilt = this._rebuildGroup(descriptor, cohortSet);
      // A degenerate group that collapsed to a single surviving window needs no
      // wrapping CON; leave it where the reload placed it.
      if (!rebuilt || rebuilt.isWindow()) continue;

      parent.replaceChildren([...extrasBefore, rebuilt, ...extrasAfter]);
      // Do not resetSiblingPercent(parent): that would wipe sibling size policy.
      // Only equalize parent siblings when none of the inserted structure carried
      // userSized weights (reload flat case often has percent 0 on survivors).
      const parentKids = parent.childNodes;
      const anyUser = parentKids.some((n) => n.userSized);
      if (!anyUser) {
        this.resetSiblingPercent(parent);
      }
    }
  }

  /**
   * Monitor-recovery path: rejoin or re-apply snapshot only for groups that were
   * unwrapped. Intact groups are left alone. Partial peel (some still under the
   * original STACKED/TABBED CON) re-appends orphans into that CON — never nests
   * a fresh CON via restoreLayoutGroups (which assumes a flat cohort).
   */
  restoreLayoutGroupsIfUnwrapped(snapshot) {
    if (!snapshot || snapshot.length === 0) return;
    const fullyFlat = [];
    for (const descriptor of snapshot) {
      const winNodes = this._descriptorWindows(descriptor)
        .map((win) => this.findNode(win))
        .filter((node) => node);
      if (winNodes.length < 2) continue;

      const parent0 = winNodes[0].parentNode;
      const intact =
        parent0 &&
        parent0.isStackedOrTabbed() &&
        parent0.layout === descriptor.layout &&
        winNodes.every((n) => n.parentNode === parent0);
      if (intact) continue;

      // Rejoin peeled members into an existing matching group CON when present.
      let existing = null;
      for (const n of winNodes) {
        const p = n.parentNode;
        if (p && p.isStackedOrTabbed() && p.layout === descriptor.layout) {
          existing = p;
          break;
        }
      }
      if (existing) {
        for (const n of winNodes) {
          if (n.parentNode !== existing) {
            existing.appendChild(n);
          }
        }
        this.resetSiblingPercent(existing);
        continue;
      }

      fullyFlat.push(descriptor);
    }
    this.restoreLayoutGroups(fullyFlat);
  }

  /** Flatten a descriptor to its leaf Meta.Window objects. */
  _descriptorWindows(descriptor) {
    return TreeSnapshot.collectWindows(descriptor);
  }

  /**
   * Rebuild a descriptor sub-tree from surviving window nodes. Window leaves not
   * in `cohortSet` (closed or scattered to another parent) are dropped. A CON
   * with fewer than two surviving children collapses to that child (or null), so
   * the rebuilt tree never carries degenerate single-child containers.
   */
  _rebuildGroup(descriptor, cohortSet) {
    return TreeSnapshot.rebuildNode(descriptor, {
      findNode: (win) => this.findNode(win),
      cohortSet,
      createCon: () => {
        const con = new Node(NODE_TYPES.CON, new St.Bin());
        con.settings = this.settings;
        return con;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    });
  }

  /**
   * Creates a new Node and attaches it to a parent toData.
   * Parent can be MONITOR or CON types only.
   */
  createNode(parentObj, type, value, mode = Window.WINDOW_MODES.TILE) {
    let parentNode = this.findNode(parentObj);
    let child;

    if (parentNode) {
      child = new Node(type, value);
      child.settings = this.settings;

      if (child.isWindow()) child.mode = mode;

      // Append after a window
      if (parentNode.isWindow()) {
        const grandParentNode = parentNode.parentNode;
        grandParentNode.insertBefore(child, parentNode.nextSibling);
        Logger.debug(
          `Parent is a window, attaching to this window's parent ${grandParentNode.nodeType}`
        );
      } else {
        // Append as the last item of the container
        parentNode.appendChild(child);
      }
    }
    return child;
  }

  /**
   * Finds any Node in the tree using data
   * Data types can be in the form of Meta.Window or unique id strings
   * for Workspace, Monitor and Container
   *
   * Workspace id strings takes the form `ws{n}`.
   * Monitor id strings takes the form `mo{m}ws{n}`
   * Container id strings takes the form `mo{m}ws{n}c{x}`
   *
   */
  findNode(data) {
    let searchNode = this.getNodeByValue(data);
    return searchNode;
  }

  /**
   * Find the NodeWindow using the Meta.WindowActor
   */
  findNodeByActor(windowActor) {
    let searchNode;
    let criteriaMatchFn = (node) => {
      if (node.isWindow() && node.actor === windowActor) {
        searchNode = node;
      }
    };

    this._walk(criteriaMatchFn, this._traverseDepthFirst);

    return searchNode;
  }

  /**
   * Eligible tiled WINDOW leaves under a container (for focus selection).
   * @param {Node} container
   * @returns {Node[]}
   */
  _tiledWindowsIn(container) {
    return container
      .getNodeByType(NODE_TYPES.WINDOW)
      .filter((w) => w.isTile() && !w.nodeValue?.minimized);
  }

  /**
   * Visible/focused window in a STACKED container. Order is stable (no focus
   * reordering); lastTabFocus picks which window is on top.
   * @param {Node} container
   * @returns {Node|null}
   */
  stackedFocusWindow(container) {
    if (!container) return null;
    const windows = this._tiledWindowsIn(container);
    if (windows.length === 0) return null;
    if (container.lastTabFocus) {
      const match = windows.find((w) => w.nodeValue === container.lastTabFocus);
      if (match) return match;
    }
    // No remembered focus: first label in chrome order (stable).
    return windows[0];
  }

  /**
   * Select the appropriate focus window from a container based on direction
   * @param {Node} container - The container node
   * @param {boolean} previous - Whether navigating to previous (before) position
   * @returns {Node|null} The selected window node
   */
  _selectFocusWindow(container, previous) {
    const windows = this._tiledWindowsIn(container);

    if (windows.length === 0) return null;
    // Stacked: lastTabFocus (stable chrome), not last child (no longer reordered).
    if (container.layout === LAYOUT_TYPES.STACKED) return this.stackedFocusWindow(container);
    if (windows.length > 1) {
      return previous ? windows[windows.length - 1] : windows[0];
    }
    return windows[0];
  }

  /**
   * Focuses on the next node, if metaWindow and tiled, raise it
   */
  focus(node, direction) {
    if (!node) return null;
    let next = this.next(node, direction);

    if (!next) return null;

    let type = next.nodeType;
    let position = Utils.positionFromDirection(direction);
    const previous = position === POSITION.BEFORE;

    switch (type) {
      case NODE_TYPES.WINDOW:
        break;
      case NODE_TYPES.CON:
        next = this._selectFocusWindow(next, previous);
        break;
      case NODE_TYPES.MONITOR:
        if (next.layout === LAYOUT_TYPES.STACKED) {
          next = this.stackedFocusWindow(next);
        } else {
          next = previous ? next.lastChild : next.firstChild;
        }

        if (next && next.nodeType === NODE_TYPES.CON) {
          next = this._selectFocusWindow(next, previous);
        }
        break;
    }

    return this._activateWindowNode(next, direction);
  }

  /**
   * Raise/focus a resolved target WINDOW node and apply the focus-follow pointer
   * policy. Shared by directional focus() and the cyclic focusSibling() so both
   * paths get identical activation + Wayland stacking behavior (forge-zrl). The
   * optional `direction` is passed only by the directional caller, which retries
   * past a minimized target; cyclic callers pass undefined and only ever resolve
   * to non-minimized windows.
   */
  _activateWindowNode(next, direction) {
    if (!next) return null;

    let metaWindow = next.nodeValue;
    if (!metaWindow) return null;
    const previousMetaWindow = this.extWm.focusMetaWindow;
    if (metaWindow.minimized) {
      // A direction of 0 is valid (MotionDirection.UP), so test for presence,
      // not truthiness. Cyclic callers pass undefined and bail here.
      next = direction !== undefined ? this.focus(next, direction) : null;
    } else {
      metaWindow.raise();
      metaWindow.focus(global.display.get_current_time());
      metaWindow.activate(global.display.get_current_time());

      // Bug #416 fix: Ensure proper stacking on Wayland (above desktop layer)
      if (Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
        try {
          const wasAbove = metaWindow.is_above();
          if (!wasAbove) {
            // Forge's own transient stacking pin. Suppress the notify::above so
            // it isn't read as the user toggling "Always on Top", and flag the
            // window so isFloatingExempt does not float-eject it while pinned
            // (forge-ph7f): rapid focus used to leak pins through a single
            // shared timer, stranding earlier windows above where processFloats
            // ejected them from the grid and they overlapped.
            this.extWm._withSuppressedAboveHandler(() => metaWindow.make_above());
            metaWindow._forgeTransientAbove = true;
            // Per-window attach bag slot "stack": each focused window unpins on
            // its own 50ms schedule (SourceBag set replaces prior slot on same
            // window; other windows keep their own Lifetime — forge-ph7f).
            const lt = this.extWm._windowAttach?.attach(metaWindow);
            lt?.sources.set("stack", 50, () => {
              try {
                // Never undo a pin the user/Forge genuinely owns: an always-on-top
                // float (_forgeSetAbove) or a fullscreen-demoted float.
                if (
                  Utils.isWindowAlive(metaWindow) &&
                  metaWindow._forgeTransientAbove &&
                  !next._forgeSetAbove &&
                  !next._aboveDemotedForFullscreen
                ) {
                  this.extWm._withSuppressedAboveHandler(() => metaWindow.unmake_above());
                }
              } catch (e) {
                // Window may have been destroyed
              } finally {
                metaWindow._forgeTransientAbove = false;
              }
            });
          }
        } catch (e) {
          Logger.warn(`Failed to adjust Wayland stacking: ${e}`);
        }
      }

      const monitorArea = Utils.getWorkAreaSafe(metaWindow);
      const ptr = this.extWm.getPointer();
      const pointerInside = monitorArea
        ? Utils.rectContainsPoint(monitorArea, [ptr[0], ptr[1]])
        : false;
      const monitorChanged =
        !!previousMetaWindow &&
        previousMetaWindow.get_monitor &&
        previousMetaWindow.get_monitor() !== metaWindow.get_monitor();

      if (this.settings.get_boolean("move-pointer-focus-enabled")) {
        this.extWm.movePointerWith(next);
      } else if (!pointerInside) {
        this.extWm.movePointerWith(next, { force: monitorChanged });
      }
    }
    return next;
  }

  /**
   * Resolve the cyclic neighbour of `node` among its immediate tiled siblings
   * (i3 "focus/move next|prev"), wrapping around. `offset` is +1 (next) or -1
   * (prev). A CON sibling resolves to one of its tiled windows. Returns a WINDOW
   * node, or null when `node` is floating/has no parent or is the only tiled
   * sibling. Shared by focusSibling()/swapSibling() so both cycle identically.
   */
  _cyclicSiblingWindow(node, offset) {
    if (!node || !node.parentNode) return null;
    const siblings = this.getTiledChildren(node.parentNode.childNodes);
    if (siblings.length <= 1) return null;
    const idx = siblings.indexOf(node);
    if (idx < 0) return null;
    let target = siblings[(idx + offset + siblings.length) % siblings.length];
    if (target && target.isCon()) target = this._selectFocusWindow(target, offset < 0);
    return target && target !== node ? target : null;
  }

  /**
   * Cyclically focus the next/previous tiled sibling, wrapping around (forge-zrl).
   * @param {Node} node - the currently focused window node
   * @param {number} offset - +1 for next, -1 for previous
   */
  focusSibling(node, offset) {
    return this._activateWindowNode(this._cyclicSiblingWindow(node, offset), undefined);
  }

  /**
   * Cyclically swap with the next/previous tiled sibling, wrapping around
   * (forge-zrl). Returns the moved node, or null when there is no valid target.
   * @param {Node} node - the currently focused window node
   * @param {number} offset - +1 for next, -1 for previous
   */
  swapSibling(node, offset) {
    const target = this._cyclicSiblingWindow(node, offset);
    if (!target) return null;
    this.swapPairs(node, target);
    return node;
  }

  /**
   * Obtains the non-floating, non-minimized list of nodes
   * Useful for calculating the rect areas
   */
  getTiledChildren(items) {
    let filterFn = (node) => {
      if (node.isWindow()) {
        // AC4: placeholder TILE leaves reserve slot space without Meta.
        if (node.isPlaceholder()) {
          return !node.isFloat() && !node.isGrabTile();
        }
        // A finalized Meta.Window wrapper throws on ANY property read
        // (.minimized included); a dead window is by definition not tiled
        // (forge-4b6 — also keeps removeNode's cleanUpParent safe while
        // pruneDeadWindows removes one of several dead siblings).
        if (!Utils.isWindowAlive(node.nodeValue)) return false;
        let floating = node.isFloat();
        let grabTiling = node.isGrabTile();
        // A Node[Window]._data is a Meta.Window
        if (!node.nodeValue.minimized && !(floating || grabTiling)) {
          return true;
        }
      }
      // handle split containers
      if (node.isCon()) {
        return this.getTiledChildren(node.childNodes).length > 0;
      }
      return false;
    };

    return items ? items.filter(filterFn) : [];
  }

  /**
   * Move a given node into a direction.
   * Skips operation for floating or minimized windows.
   */
  move(node, direction) {
    if (!node) return false;
    if (node.isFloat()) {
      Logger.debug("Skipping move for floating window");
      return false;
    }
    if (node.isWindow() && node.nodeValue && node.nodeValue.minimized) {
      Logger.debug("Skipping move for minimized window");
      return false;
    }

    let next = this.next(node, direction);
    let position = Utils.positionFromDirection(direction);

    // forge-s7ri: an edge-wrap or same-monitor fallback must keep the window on
    // its OWN monitor. extWm.currentMonWsNode is derived from get_current_monitor()
    // (the monitor under the POINTER), which teleports the window when the pointer
    // rests on a different monitor than the focused node. Resolve the node's own
    // monitor from the tree instead.
    const ownMonNode = this.findAncestorMonitor(node);

    if (!next || next === -1) {
      if (next === -1) {
        // Handle edge of monitor - wrap within the node's own monitor workspace
        if (ownMonNode) {
          // forge-qxqb: capture the old parent BEFORE the reparent, then run the
          // same sibling-reset epilogue every other structural-move path runs —
          // otherwise the old container's survivors keep stale percents and a
          // single-child stacked/tabbed parent keeps its layout.
          const priorParent = node.parentNode;
          if (position === POSITION.AFTER) {
            ownMonNode.appendChild(node);
          } else {
            // Prepend: insert before the first child of the monitor
            ownMonNode.insertBefore(node, ownMonNode.firstChild);
          }
          this._finishMove(priorParent, ownMonNode);
          return true;
        }
      }
      return false;
    }

    let parentNode = node.parentNode;
    let parentTarget;

    switch (next.nodeType) {
      case NODE_TYPES.WINDOW:
        // If same parent, swap
        if (next === node.previousSibling || next === node.nextSibling) {
          parentTarget = next.parentNode;
          this.swapPairs(node, next);
          if (this.settings.get_boolean("move-pointer-focus-enabled")) {
            this.extWm.movePointerWith(node);
          }
          // do not reset percent when swapped
          return true;
        } else {
          parentTarget = next.parentNode;
          if (parentTarget) {
            if (position === POSITION.AFTER) {
              parentTarget.insertBefore(node, next);
            } else {
              parentTarget.insertBefore(node, next.nextSibling);
            }
          }
        }
        break;
      case NODE_TYPES.CON:
        parentTarget = next;

        if (next.isStacked()) {
          next.appendChild(node);
        } else {
          if (position === POSITION.AFTER) {
            next.insertBefore(node, next.firstChild);
          } else {
            next.appendChild(node);
          }
        }
        break;
      case NODE_TYPES.MONITOR:
        parentTarget = next;

        // next() only yields a MONITOR when the walk exhausted same-orientation
        // siblings up to the monitor — the window is already at the directional
        // edge of its mon tree (nested or mon-level). Cross whenever `next` is a
        // real neighbor; do not require mon firstChild/lastChild (that blocked
        // nested peels and VSPLIT-mon middle panes from ever leaving the mon).
        // forge-s7ri: still reject when next already contains the node (same mon).
        // LX3: one gesture peels out of TABBED/nested CON and lands on the target mon.
        if (!next.contains(node)) {
          let targetMonitor = Utils.monitorIndex(next.nodeValue);
          let targetMonRect = this.extWm.rectForMonitor(node, targetMonitor);
          if (!targetMonRect) return false;
          // forge-e3k1: geometry move before reparent so a finalized MetaWindow
          // throw leaves the node on its origin mon with intact percents.
          let workArea = node.nodeValue.get_work_area_for_monitor(targetMonitor);
          this.extWm.move(node.nodeValue, targetMonRect, workArea);
          if (position === POSITION.AFTER) {
            next.insertBefore(node, next.firstChild);
          } else {
            next.appendChild(node);
          }
          this.extWm.movePointerWith(node);
        }
        break;
      default:
        break;
    }
    this._finishMove(parentNode, parentTarget);
    return true;
  }

  // Shared epilogue for a structural move: renormalize the percents of both the
  // vacated container and the target, and collapse a now-single-child
  // stacked/tabbed source back to a real split (forge-qxqb).
  // LX2: when peeling out of a multi-member TABBED/STACKED group into a
  // two-child parent of [group | extracted], set that parent's H/V from the
  // pre-peel group rect (square-ish panes; no thin vertical slivers by default).
  _finishMove(parentNode, parentTarget) {
    const wasTabOrStack = !!(parentNode && parentNode.isStackedOrTabbed());
    const groupRect = wasTabOrStack ? parentNode.rect : null;
    // Reparent already happened: group and extracted share parentTarget with
    // exactly two children (solo group peel). More siblings → leave layout.
    const peeledToPair =
      wasTabOrStack &&
      parentTarget &&
      parentNode.parentNode === parentTarget &&
      parentTarget.childNodes.length === 2 &&
      parentTarget.childNodes.includes(parentNode);

    this.resetSiblingPercent(parentNode);
    this.resetSiblingPercent(parentTarget);
    parentNode.resetLayoutSingleChild();

    if (peeledToPair && this.extWm?.determineSplitLayoutForRect) {
      parentTarget.layout = this.extWm.determineSplitLayoutForRect(groupRect);
    }
  }

  /**
   * Give the next sibling/parent/descendant on the tree based
   * on a given Meta.MotionDirection
   *
   * @param {Node} node
   * @param {Meta.MotionDirection} direction
   *
   * Credits: borrowed logic from tree.c of i3
   */
  next(node, direction) {
    if (!node) return null;
    let orientation = Utils.orientationFromDirection(direction);
    let position = Utils.positionFromDirection(direction);
    let previous = position === POSITION.BEFORE;

    const type = node.nodeType;

    switch (type) {
      case NODE_TYPES.ROOT:
        // Root is the top of the tree
        if (node.childNodes.length > 1) {
          if (previous) {
            return node.firstChild;
          } else {
            return node.lastChild;
          }
        } else {
          return node.firstChild;
        }
      case NODE_TYPES.WORKSPACE:
        // Let gnome-shell handle this?
        break;
      case NODE_TYPES.MONITOR:
        // Find the next monitor
        const nodeWindow = this.findFirstNodeWindowFrom(node);
        return this.nextMonitor(nodeWindow, position, orientation);
    }

    while (node && node.nodeType !== NODE_TYPES.WORKSPACE) {
      if (node.nodeType === NODE_TYPES.MONITOR) {
        return this.next(node, direction);
      }
      const parentNode = node.parentNode;
      // A detached/unrooted node (concurrent removal, malformed tree) can reach
      // the parent-walk without a WORKSPACE ancestor; reading parentNode.layout
      // would null-deref (forge-zyx3). Bail with null — every caller guards
      // `if (!next)`.
      if (!parentNode) return null;
      const parentOrientation = Utils.orientationFromLayout(parentNode.layout);

      if (parentNode.childNodes.length > 1 && orientation === parentOrientation) {
        const next = previous ? node.previousSibling : node.nextSibling;
        if (next) {
          return next;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  nextMonitor(nodeWindow, position, orientation) {
    if (!nodeWindow || !nodeWindow.nodeValue) return null;
    // Prefer the tree's MONITOR index over Meta.get_monitor() — after peel /
    // layout thrash Meta can lag the tree, and neighbor lookup then walks the
    // wrong head (or -1 → false edge wrap).
    let monitorDirection = Utils.directionFrom(position, orientation);
    let currentMonitor = -1;
    const ownMon = this.findAncestorMonitor(nodeWindow);
    if (ownMon) currentMonitor = Utils.monitorIndex(ownMon.nodeValue);
    if (currentMonitor < 0) currentMonitor = nodeWindow.nodeValue.get_monitor();
    if (currentMonitor < 0) return null;
    let targetMonitor = global.display.get_monitor_neighbor_index(currentMonitor, monitorDirection);
    // Bug #379 (forge-2zj): Mutter's neighbor lookup can return -1 for a monitor
    // that is geometrically adjacent (notably vertically-stacked monitors). Fall
    // back to a geometry-based neighbor before treating -1 as a true boundary.
    if (targetMonitor < 0) {
      targetMonitor = this._neighborMonitorByGeometry(currentMonitor, monitorDirection);
    }
    if (targetMonitor < 0) return targetMonitor;
    let wsIndex = 0;
    try {
      const ws = nodeWindow.nodeValue.get_workspace?.();
      if (ws && typeof ws.index === "function") wsIndex = ws.index();
    } catch (_e) {
      /* disposed Meta */
    }
    return this.findNode(Utils.createMonitorWorkspaceId(targetMonitor, wsIndex));
  }

  /**
   * Find the nearest monitor adjacent to `currentMonitor` in the given
   * Meta.DisplayDirection, computed purely from monitor geometries. Used as a
   * fallback when get_monitor_neighbor_index() returns -1 for a real neighbor.
   * Returns the neighbor monitor index, or -1 when there is none.
   */
  _neighborMonitorByGeometry(currentMonitor, direction) {
    const cur = global.display.get_monitor_geometry(currentMonitor);
    if (!cur) return -1;
    const count = global.display.get_n_monitors();
    const D = Meta.DisplayDirection;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      if (i === currentMonitor) continue;
      const c = global.display.get_monitor_geometry(i);
      if (!c) continue;
      const hOverlap = c.x < cur.x + cur.width && c.x + c.width > cur.x;
      const vOverlap = c.y < cur.y + cur.height && c.y + c.height > cur.y;
      let dist = -1;
      if (direction === D.UP && hOverlap && c.y < cur.y) dist = cur.y - c.y;
      else if (direction === D.DOWN && hOverlap && c.y > cur.y) dist = c.y - cur.y;
      else if (direction === D.LEFT && vOverlap && c.x < cur.x) dist = cur.x - c.x;
      else if (direction === D.RIGHT && vOverlap && c.x > cur.x) dist = c.x - cur.x;
      // Nearest edge wins; ties resolve to the lowest index (loop order).
      if (dist >= 0 && dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  findAncestorMonitor(node) {
    return this.findAncestor(node, NODE_TYPES.MONITOR);
  }

  findAncestor(node, ancestorType) {
    let ancestorNode;

    while (node && ancestorType && !node.isRoot()) {
      if (node.isType(ancestorType)) {
        ancestorNode = node;
        break;
      } else {
        node = node.parentNode;
      }
    }

    return ancestorNode;
  }

  nextVisible(node, direction) {
    if (!node) return null;
    let next = this.next(node, direction);
    // next() returns the numeric -1 sentinel at a monitor boundary (nextMonitor).
    // Normalize it to null so callers (e.g. _handleResizing) never mistake the
    // primitive -1 for a node and assign .percent on it.
    if (next === -1) return null;
    if (next && next.nodeType === NODE_TYPES.WINDOW && next.nodeValue && next.nodeValue.minimized) {
      next = this.nextVisible(next, direction);
    }
    return next;
  }

  /**
   * Merge two WINDOW nodes into one TABBED/STACKED group.
   * Same H/V parent with exactly those two tiled children → flip parent layout.
   * Otherwise wrap both in a new CON at focus's index.
   * @returns {Node|null} group CON (or flipped parent), or null
   */
  mergeWindowsIntoGroup(focusNode, partnerNode, layout = LAYOUT_TYPES.TABBED) {
    if (!focusNode || !partnerNode || focusNode === partnerNode) return null;
    if (focusNode.nodeType !== NODE_TYPES.WINDOW || partnerNode.nodeType !== NODE_TYPES.WINDOW) {
      return null;
    }
    // Allow FLOAT for structure merge (layout residual may still be FLOAT).
    // Interactive keybind path tiles first via processFloats.

    const parent = focusNode.parentNode;
    if (!parent) return null;

    const applyGroupLayout = (con) => {
      con.layout = layout;
      if (layout === LAYOUT_TYPES.TABBED) {
        con.lastTabFocus = focusNode.nodeValue;
      } else if (layout === LAYOUT_TYPES.STACKED) {
        con.lastTabFocus = null;
      }
    };

    // Already co-grouped
    if (
      partnerNode.parentNode === parent &&
      parent.isStackedOrTabbed() &&
      parent.nodeType === NODE_TYPES.CON
    ) {
      return parent;
    }

    // Two tiled siblings in a split → convert in place
    if (
      partnerNode.parentNode === parent &&
      (parent.isHSplit() || parent.isVSplit()) &&
      parent.nodeType === NODE_TYPES.CON
    ) {
      const tiled = this.getTiledChildren(parent.childNodes).filter(
        (n) => n.nodeType === NODE_TYPES.WINDOW
      );
      if (tiled.length === 2 && tiled.includes(focusNode) && tiled.includes(partnerNode)) {
        applyGroupLayout(parent);
        this.resetSiblingPercent(parent);
        this.attachNode = parent;
        return parent;
      }
    }

    const oldPartnerParent = partnerNode.parentNode;
    const container = new St.Bin();
    const con = new Node(NODE_TYPES.CON, container);
    con.settings = this.settings;
    con.percent = focusNode.percent;
    con.userSized = !!focusNode.userSized;
    con.rect = focusNode.rect;
    applyGroupLayout(con);

    parent.insertBefore(con, focusNode);
    con.appendChild(focusNode);
    con.appendChild(partnerNode);

    this.resetSiblingPercent(con);
    this.resetSiblingPercent(parent);
    if (oldPartnerParent && oldPartnerParent !== parent && oldPartnerParent !== con) {
      this.resetSiblingPercent(oldPartnerParent);
      if (oldPartnerParent.nodeType === NODE_TYPES.CON) {
        oldPartnerParent.resetLayoutSingleChild();
      }
    }

    this.attachNode = con;
    return con;
  }

  /**
   * Credits: i3-like split
   */
  // Returns the newly-created CON node when a container is actually created, and
  // null on every non-creating exit (FLOAT focus, single-child toggle, guards) so
  // callers can tell a real split from a no-op (forge-clsp).
  // forceSplit=true (structure ensure / mon-wrap): allow FLOAT — residual layout
  // often runs just after LayoutBatch unhide while mode is still FLOAT.
  split(node, orientation, forceSplit = false) {
    if (!node) return null;
    let type = node.nodeType;

    if (type === NODE_TYPES.WINDOW && node.mode === Window.WINDOW_MODES.FLOAT && !forceSplit) {
      return null;
    }

    if (!(type === NODE_TYPES.MONITOR || type === NODE_TYPES.CON || type === NODE_TYPES.WINDOW)) {
      return null;
    }

    let parentNode = node.parentNode;
    let numChildren = parentNode.childNodes.length;

    // toggle the split
    if (
      !forceSplit &&
      numChildren === 1 &&
      (parentNode.layout === LAYOUT_TYPES.HSPLIT || parentNode.layout === LAYOUT_TYPES.VSPLIT)
    ) {
      parentNode.layout =
        orientation === ORIENTATION_TYPES.HORIZONTAL ? LAYOUT_TYPES.HSPLIT : LAYOUT_TYPES.VSPLIT;
      this.attachNode = parentNode;
      return null;
    }

    // Push the existing node into a new CON (same object; no value-twin).
    const container = new St.Bin();
    const newConNode = new Node(NODE_TYPES.CON, container);
    newConNode.settings = this.settings;
    newConNode.layout =
      orientation === ORIENTATION_TYPES.HORIZONTAL ? LAYOUT_TYPES.HSPLIT : LAYOUT_TYPES.VSPLIT;
    newConNode.rect = node.rect;
    newConNode.percent = node.percent;
    newConNode.userSized = !!node.userSized;
    parentNode.insertBefore(newConNode, node);
    newConNode.appendChild(node);
    this.attachNode = newConNode;
    return newConNode;
  }

  swap(node, direction) {
    let nextSwapNode = this.next(node, direction);
    if (!nextSwapNode) {
      return;
    }
    let nodeSwapType = nextSwapNode.nodeType;

    switch (nodeSwapType) {
      case NODE_TYPES.WINDOW:
        break;
      case NODE_TYPES.CON:
      case NODE_TYPES.MONITOR:
        let childWindowNodes = nextSwapNode
          .getNodeByMode(Window.WINDOW_MODES.TILE)
          .filter((t) => t.nodeType === NODE_TYPES.WINDOW);
        if (nextSwapNode.layout === LAYOUT_TYPES.STACKED) {
          nextSwapNode =
            this.stackedFocusWindow(nextSwapNode) || childWindowNodes[childWindowNodes.length - 1];
        } else {
          nextSwapNode = childWindowNodes[0];
        }
        break;
    }

    let isNextNodeWin =
      nextSwapNode && nextSwapNode.nodeValue && nextSwapNode.nodeType === NODE_TYPES.WINDOW;
    if (isNextNodeWin) {
      if (!this.extWm.sameParentMonitor(node, nextSwapNode)) {
        // Cross-monitor swaps are not supported due to coordinate system complexity.
        // Attempting to swap windows across monitors can cause rendering issues.
        // This is a known limitation to ensure stability.
        return;
      }
      this.swapPairs(node, nextSwapNode);
    }
    return nextSwapNode;
  }

  swapPairs(fromNode, toNode, focus = true) {
    if (!(this._swappable(fromNode) && this._swappable(toNode))) return;

    // Bug #324 fix: Validate windows still exist (after sleep/resume).
    // A null nodeValue also skips now - it would crash on get_frame_rect below.
    if (!Utils.isWindowAlive(fromNode?.nodeValue)) {
      Logger.warn("swapPairs: fromNode window destroyed, skipping swap");
      return;
    }
    if (!Utils.isWindowAlive(toNode?.nodeValue)) {
      Logger.warn("swapPairs: toNode window destroyed, skipping swap");
      return;
    }

    // Swap the items in the array
    let parentForFrom = fromNode ? fromNode.parentNode : undefined;
    let parentForTo = toNode.parentNode;
    if (parentForTo && parentForFrom) {
      let nextIndex = toNode.index;
      let focusIndex = fromNode.index;

      let transferMode = fromNode.mode;
      fromNode.mode = toNode.mode;
      toNode.mode = transferMode;

      // forge-j9fo: a swap must never transfer GRAB_TILE to the stationary
      // target (the dragged node's mode belongs to the drag, not the slot).
      // _grabCleanup only resets the dragged node, so normalize any swapped-in
      // GRAB_TILE back to TILE here; TILE/FLOAT still exchange as before.
      if (fromNode.isGrabTile()) fromNode.mode = Window.WINDOW_MODES.TILE;
      if (toNode.isGrabTile()) toNode.mode = Window.WINDOW_MODES.TILE;

      // Bug #354 fix: Validate frame rects before swap
      let transferRect = fromNode.nodeValue.get_frame_rect();
      let transferToRect = toNode.nodeValue.get_frame_rect();
      if (!transferRect || !transferToRect) {
        Logger.warn("swapPairs: invalid frame rects");
        return;
      }
      let transferPercent = fromNode.percent;

      fromNode.percent = toNode.percent;
      toNode.percent = transferPercent;

      if (fromNode !== toNode) {
        if (parentForFrom === parentForTo) {
          const kids = [...parentForFrom.childNodes];
          kids[focusIndex] = toNode;
          kids[nextIndex] = fromNode;
          parentForFrom.replaceChildren(kids);
        } else {
          const fromNext = fromNode.nextSibling;
          const toNext = toNode.nextSibling;
          if (toNext) parentForTo.insertBefore(fromNode, toNext);
          else parentForTo.appendChild(fromNode);
          if (fromNext) parentForFrom.insertBefore(toNode, fromNext);
          else parentForFrom.appendChild(toNode);
        }
      }

      this.extWm.move(fromNode.nodeValue, transferToRect);
      this.extWm.move(toNode.nodeValue, transferRect);

      if (focus) {
        // The fromNode is now on the parent-target
        fromNode.nodeValue.raise();
        fromNode.nodeValue.focus(global.get_current_time());
      }
    }
  }

  _swappable(node) {
    if (!node) return false;
    if (node.nodeType === NODE_TYPES.WINDOW && !node.nodeValue.minimized) {
      return true;
    }
    return false;
  }

  /**
   * Performs cleanup of dangling parents in addition to removing the
   * node from the parent.
   */
  removeNode(node) {
    // Guard against an already-detached node: removeChild nulls parentNode after
    // detach, and a malformed/partially-built tree (or a reordered cleanup
    // sequence) can hand one in. Dereferencing node.parentNode.childNodes below
    // would throw mid-cleanup, aborting the destroy handler and leaving a
    // half-cleaned tree for the next render (forge-nmdo).
    if (!node || !node.parentNode) return false;

    // forge-wrot: a removed WINDOW owns a tab St.BoxLayout (+buttons +signals) in
    // its stacked/tabbed parent's decoration. This is the genuine-removal entry
    // (windowDestroy, cleanTree), as opposed to removeChild which also detaches
    // for reparenting — so tear the window tab down HERE so a window closed in a
    // multi-tab container doesn't leak it. _destroyTab no-ops when there's none.
    if (node.isWindow() && node.tab) node._destroyTab();

    let oldChild;

    let cleanUpParent = (existParent) => {
      if (this.getTiledChildren(existParent.childNodes).length === 0) {
        existParent.percent = 0.0;
        existParent.userSized = false;
        // Bug #470 fix: Don't reset sibling percents across workspace/monitor boundaries
        // This was causing tiling disruption in other workspaces when closing all windows
        if (
          existParent.parentNode &&
          !existParent.parentNode.isWorkspace() &&
          !existParent.parentNode.isMonitor()
        ) {
          this.resetSiblingPercent(existParent.parentNode);
        }
      }
      // Bug #470 fix: Only reset siblings within CON level, not workspace/monitor level
      if (!existParent.isWorkspace() && !existParent.isMonitor()) {
        this.resetSiblingPercent(existParent);
      }
    };

    let parentNode = node.parentNode;
    // The container that actually loses a child — reoriented below (forge-vw0l).
    let closedContainer;
    // If parent has only this window, remove the parent instead
    if (parentNode.childNodes.length === 1 && parentNode.nodeType !== NODE_TYPES.MONITOR) {
      let existParent = parentNode.parentNode;
      oldChild = existParent.removeChild(parentNode);
      cleanUpParent(existParent);
      closedContainer = existParent;
    } else {
      let existParent = node.parentNode;
      oldChild = existParent.removeChild(node);
      if (!this.extWm.floatingWindow(node)) cleanUpParent(existParent);
      closedContainer = existParent;
    }

    // If only a single tab remains, exit tabbed layout
    if (
      this.settings.get_boolean("auto-exit-tabbed") &&
      parentNode.nodeType === NODE_TYPES.CON &&
      parentNode.layout === LAYOUT_TYPES.TABBED &&
      parentNode.childNodes.length === 1
    ) {
      // forge-nl8: when auto-reorient-on-close is ON, derive the exit orientation
      // from the CONTAINER's own rect (portrait -> VSPLIT) instead of the focused
      // monitor's geometry. OFF keeps the prior monitor-based default exactly.
      parentNode.layout = this.settings.get_boolean("auto-reorient-on-close")
        ? this.extWm.determineSplitLayoutForRect(parentNode.rect)
        : this.extWm.determineSplitLayout();
      this.resetSiblingPercent(parentNode);
      parentNode.lastTabFocus = null;
      // Drop the tab strip: layout is no longer TABBED. Leaving decoration sized +
      // reactive over the remaining window ghosts a hit plate on native CSD
      // (× swallows clicks). _destroyDecoration tears decoration + child tabs
      // without rebuild (_destroyTab, not _resetTabForReparent).
      parentNode._destroyDecoration();
    }

    // forge-nl8 (opt-in, default OFF): after a child leaves a real split
    // container, re-derive its orientation from the container's current rect so
    // a now-portrait container splits vertically (and vice versa). Guarded to a
    // genuine HSPLIT/VSPLIT split — TABBED/STACKED/ROOT are explicit user choices
    // and are never touched. Note: this DOES override a manual
    // split-vertical/split-horizontal (which produce VSPLIT/HSPLIT) on close;
    // that aspect-driven re-orientation is the intended behavior, hence opt-in.
    // forge-vw0l: reorient the container that actually lost a child (in the
    // collapse branch parentNode is now DETACHED, so reorienting it is a dead
    // write), and never on a FLOAT removal — no tiled slot was freed.
    if (!this.extWm.floatingWindow(node)) this._reorientOnClose(closedContainer);

    // MONITOR nodes persist with the workspace. When the last window leaves,
    // reset the layout to this monitor's geometry-based default (forge-5ng:
    // portrait splits vertically, landscape horizontally) so the next windows
    // start from the right orientation instead of a leftover LayoutToggle.
    if (parentNode.nodeType === NODE_TYPES.MONITOR && parentNode.childNodes.length === 0) {
      parentNode.layout = this.extWm.determineSplitLayoutForRect(parentNode.rect);
    }

    if (node === this.attachNode) {
      this.attachNode = null;
    } else {
      // Find the next focus node as attachNode
      this.attachNode = this.findNode(this.extWm.focusMetaWindow);
    }

    return oldChild ? true : false;
  }

  /**
   * forge-nl8: opt-in re-orientation of a split container after a child closes.
   * Reads `auto-reorient-on-close` (default false). Only acts on a real split
   * container (HSPLIT/VSPLIT) so an explicit TABBED/STACKED layout is preserved.
   * determineSplitLayoutForRect is null-safe (falls back to monitor orientation).
   */
  _reorientOnClose(parentNode) {
    if (!this.settings.get_boolean("auto-reorient-on-close")) return;
    if (!parentNode || parentNode.nodeType !== NODE_TYPES.CON) return;
    if (parentNode.layout !== LAYOUT_TYPES.HSPLIT && parentNode.layout !== LAYOUT_TYPES.VSPLIT) {
      return;
    }
    parentNode.layout = this.extWm.determineSplitLayoutForRect(parentNode.rect);
  }

  render(from) {
    Logger.debug(`render tree ${from ? "from " + from : ""}`);
    this.processNode(this);
    this.apply(this);
    // cleanTree() may mutate the structure (orphan/invalid removal or single-child
    // CON flatten). When it does, own the single re-layout here so a flatten-only
    // mutation isn't left with stale renderRects (forge-tdap).
    if (this.cleanTree()) {
      this.processNode(this);
      this.apply(this);
    }
    Logger.debug(`*********************************************`);
  }

  apply(node) {
    if (!node) return;
    // Suppress rehome + geom retile while move_resize runs (nestable depth flags).
    const wm = this.extWm;
    wm?._suppressRehome?.enter();
    wm?._suppressGeom?.enter();
    try {
      let tiledChildren = node
        .getNodeByMode(Window.WINDOW_MODES.TILE)
        // forge-fw8: a fullscreen window keeps mode TILE; never re-slice it to its
        // split rect (that shifts/crops it over Mutter's full-monitor geometry).
        // forge-dyt2: likewise leave a lone tiled window's legitimate maximize alone
        // — move() would unmaximize it on every render, silently reverting it.
        // OP2: firstRender windows always place once (lone-maximize skip would leave
        // dock/new maps at Meta restore geometry until the user drags).
        // AC4: placeholders reserve slots only — no move_resize Meta commit.
        .filter(
          (t) =>
            t.nodeType === NODE_TYPES.WINDOW &&
            !t.isPlaceholder() &&
            !(t.nodeValue.is_fullscreen && t.nodeValue.is_fullscreen()) &&
            (t.nodeValue.firstRender || !this.extWm._isLoneMaximizedTile(t))
        );
      tiledChildren.forEach((w) => {
        if (w.renderRect) {
          if (w.renderRect.width > 0 && w.renderRect.height > 0) {
            let metaWin = w.nodeValue;
            this.extWm.move(metaWin, w.renderRect);
          } else {
            Logger.debug(`ignoring apply for ${w.renderRect.width}x${w.renderRect.height}`);
            // Keep firstRender when we never placed (zero rect); next render retries.
            return;
          }
        } else if (w.nodeValue.firstRender) {
          // No renderRect yet (monitor-less / pre-processNode): keep firstRender.
          return;
        }

        // firstRender is also cleared inside move() on a real placement.
        if (w.nodeValue.firstRender) w.nodeValue.firstRender = false;
      });
    } finally {
      wm?._suppressGeom?.leave();
      wm?._suppressRehome?.leave();
    }
  }

  /**
   * Self-heal against dead window nodes (found during the forge-4b6 sweep).
   * A missed actor-destroy (node removal lives in windowDestroy, racy vs
   * Mutter unref'ing the Meta.Window right after "unmanaged" on Wayland fast
   * close) can leave a WINDOW node whose wrapper is finalized. Any property
   * access on it throws, which would kill every subsequent render tree-wide
   * (processFloats/apply walk all workspaces) with no recovery path. GJS
   * cannot finalize a GObject mid-callback, so one prune at render start
   * makes the whole pass safe and converges any missed removal at the next
   * render.
   */
  pruneDeadWindows() {
    const dead = this.getNodeByType(NODE_TYPES.WINDOW).filter(
      (w) => !w.isPlaceholder() && !Utils.isWindowAlive(w.nodeValue)
    );
    dead.forEach((w) => this.removeNode(w));
    if (dead.length > 0) Logger.warn(`pruned ${dead.length} dead window node(s)`);
  }

  /**
   * AC4: insert a first-class placeholder TILE leaf under parent.
   * parentObj is monitor/CON nodeValue (same as createNode). When beforeNode
   * is set, leaf is inserted before it (reserved slot next to floated client).
   *
   * @param {any} parentObj
   * @param {{
   *   beforeNode?: any|null,
   *   percent?: number,
   *   userSized?: boolean,
   *   reason?: string|null,
   *   title?: string,
   *   id?: string|number,
   *   rect?: object|null,
   * }} [opts]
   * @returns {Node|null}
   */
  createPlaceholderLeaf(parentObj, opts = {}) {
    const parentNode =
      parentObj && typeof parentObj === "object" && parentObj.nodeType != null
        ? parentObj
        : this.findNode(parentObj);
    if (!parentNode) return null;

    const layoutSlot = opts.layoutSlot != null ? String(opts.layoutSlot) : null;
    const layoutRole = opts.layoutRole != null ? String(opts.layoutRole) : null;
    const stub = createPlaceholderStub({
      id: opts.id,
      title: opts.title,
      reason: opts.reason ?? null,
      layoutSlot,
      layoutRole,
    });
    const child = new Node(NODE_TYPES.WINDOW, stub);
    child.settings = this.settings;
    child.mode = Window.WINDOW_MODES.TILE;
    markPlaceholderNode(child, { reason: opts.reason ?? null });
    if (layoutSlot) child.layoutSlot = layoutSlot;
    if (layoutRole) child.layoutRole = layoutRole;
    if (typeof opts.percent === "number" && Number.isFinite(opts.percent)) {
      child.percent = opts.percent;
    }
    if (opts.userSized) child.userSized = true;
    if (opts.rect) child.rect = opts.rect;

    const before = opts.beforeNode ?? null;
    if (before && before.parentNode === parentNode) {
      parentNode.insertBefore(child, before);
    } else {
      parentNode.appendChild(child);
    }
    return child;
  }

  cleanTree() {
    // Phase 1: remove any cons with empty children
    const orphanCons = this.getNodeByType(NODE_TYPES.CON).filter((c) => c.childNodes.length === 0);
    const hasOrphanCons = orphanCons.length > 0;

    orphanCons.forEach((o) => {
      this.removeNode(o);
    });

    const invalidWindows = this.getNodeByType(NODE_TYPES.WINDOW).filter((w) => {
      const metaWindow = w.nodeValue;
      const title = metaWindow.title;
      const wmClass = metaWindow.wm_class;
      return wmClass === "gjs";
    });

    invalidWindows.forEach((w) => {
      this.removeNode(w);
    });

    // Phase 2: Flatten nested single-child containers
    // [con[con[con[window]]]] --> [con[window]]
    // `flattened` is the per-iteration loop control (always false on exit);
    // `didFlatten` accumulates whether ANY flatten happened, for the return below.
    let didFlatten = false;
    let flattened = true;
    while (flattened) {
      flattened = false;
      const nestedCons = this.getNodeByType(NODE_TYPES.CON).filter(
        (c) => c.childNodes.length === 1 && c.childNodes[0].nodeType === NODE_TYPES.CON
      );

      for (const parent of nestedCons) {
        const child = parent.childNodes[0];
        // forge-gdsz: a stacked/tabbed CON owns its child windows' tab actors in
        // its decoration. removeChild(child) below calls decoration.destroy_all_children(),
        // which would destroy the tab actors of grandchild windows that survive the
        // flatten (they are reparented to `parent`), leaving node.tab dangling so the
        // next render throws on the deallocated actor. Null each surviving window's
        // tab BEFORE removeChild so _createWindowTab (early-returns on this.tab)
        // rebuilds it fresh under the new parent on the next render. STACKED is
        // included because it shares the same decoration + tab-actor infrastructure
        // as TABBED, and removeChild now tears its decoration down too.
        const wasStackedOrTabbed = child.isStackedOrTabbed();
        // Move all grandchildren to parent
        const grandchildren = [...child.childNodes];
        for (const grandchild of grandchildren) {
          if (wasStackedOrTabbed && grandchild.tab) {
            // The tab actor lives in `child`'s decoration and is about to be
            // destroyed wholesale by removeChild below; drop the dangling
            // reference (else node.tab points at a deallocated actor and the next
            // render throws on it) and rebuild a fresh tab under the new parent.
            // Shared per-node logic with the forge-6asv reparent guard in removeChild.
            grandchild._resetTabForReparent();
          }
          parent.appendChild(grandchild);
        }
        // Inherit layout from child if it has one
        if (child.layout && child.layout !== LAYOUT_TYPES.ROOT) {
          parent.layout = child.layout;
        }
        // Remove the now-empty intermediate container
        parent.removeChild(child);
        flattened = true;
        didFlatten = true;
        break; // Restart the loop after modification
      }
    }

    // Report whether the structure changed so render() can re-layout exactly once.
    // Flatten-only mutations previously skipped re-layout, stranding stale
    // renderRects until an unrelated later render (forge-tdap).
    return hasOrphanCons || invalidWindows.length > 0 || didFlatten;
  }

  /**
   * Per-title-bar height (DPI-scaled) for stacked/tabbed decorations (forge-1a5).
   * Read live so the prefs spinner takes effect without an extension reload.
   * The schema clamps the value to >= 1 so it never collides with the
   * stackedHeight === 0 "decoration hidden" path.
   */
  stackedBarHeight() {
    return this.settings.get_uint("stacked-tab-bar-height") * Utils.dpi();
  }

  /**
   * Where the stacked/tabbed title bar sits within its container: "top"
   * (default) or "bottom" (forge-drf). Read live so the prefs dropdown takes
   * effect without an extension reload. Anything other than "bottom" is treated
   * as "top" so an empty/unknown value falls back safely.
   */
  tabPosition() {
    return this.settings.get_string("tab-position") === "bottom" ? "bottom" : "top";
  }

  /** Content/bar Y anchors for stacked/tabbed chrome. */
  decorationLayout(rectY, height, barSize, position) {
    return TreeLayout.decorationLayout(rectY, height, barSize, position);
  }

  /** True when CON lives on the Shell active workspace (hide chrome otherwise). */
  _decorationOnActiveWorkspace(node) {
    try {
      const mon = this.findAncestorMonitor?.(node) ?? null;
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
   *
   * Credits: Do the i3-like calculations
   *
   */
  processNode(node) {
    if (!node) return;

    // Render the Root, Workspace and Monitor
    // For now, we let them render their children recursively
    if (node.nodeType === NODE_TYPES.ROOT) {
      node.childNodes.forEach((child) => {
        this.processNode(child);
      });
    }

    if (node.nodeType === NODE_TYPES.WORKSPACE) {
      node.childNodes.forEach((child) => {
        this.processNode(child);
      });
    }

    let params = {};

    if (node.nodeType === NODE_TYPES.MONITOR || node.nodeType === NODE_TYPES.CON) {
      // The workarea from Meta.Window's assigned monitor
      // is important so it computes to `remove` the panel size
      // really well. However, this type of workarea would only
      // appear if there is window present on the monitor.
      if (node.childNodes.length === 0) {
        return;
      }

      // If monitor, get the workarea
      if (node.nodeType === NODE_TYPES.MONITOR) {
        let monitorIndex = Utils.monitorIndex(node.nodeValue);
        let wsIndex = Utils.workspaceIndex(node.nodeValue);
        let workspaceMgr = global.display.get_workspace_manager();
        // Use the workspace that this monitor node belongs to, not always the active workspace
        let workspace = workspaceMgr.get_workspace_by_index(wsIndex);
        if (!workspace) {
          // Fallback to active workspace if the index is invalid
          workspace = workspaceMgr.get_active_workspace();
        }
        let monitorArea = workspace.get_work_area_for_monitor(monitorIndex);
        if (!monitorArea) return; // there is no visible child window
        node.rect = this.applyMargins(monitorArea);
        node.rect = this.processGap(node);
      }

      let tiledChildren = this.getTiledChildren(node.childNodes);
      let sizes = this.computeSizes(node, tiledChildren);

      params.sizes = sizes;
      let showTabs = this.settings.get_boolean("showtab-decoration-enabled");
      params.stackedHeight = showTabs ? this.stackedBarHeight() : 0;
      params.tiledChildren = tiledChildren;
      params.maxTabsPerLine = this.settings.get_uint("max-tabs-per-line") || 0;

      let decoration = node.decoration;

      // Defense: a CON that left TABBED/STACKED may still hold a decoration
      // (layout toggle, incomplete teardown). Keep it non-pickable / zero-sized
      // so it cannot cover native CSD. Auto-exit also destroys it outright.
      if (decoration && !node.isStackedOrTabbed()) {
        try {
          decoration.hide();
          if (decoration.set_size) decoration.set_size(0, 0);
          if ("reactive" in decoration) decoration.reactive = false;
        } catch (_e) {
          /* finalized */
        }
      } else if (decoration) {
        // Detach tabs (and empty row hosts) so re-attach can reparent cleanly.
        let decoChildren = decoration.get_children().slice();
        decoChildren.forEach((decoChild) => {
          if (decoChild._forgeTabRow && decoChild.get_children) {
            decoChild
              .get_children()
              .slice()
              .forEach((tab) => {
                decoChild.remove_child(tab);
              });
          }
          decoration.remove_child(decoChild);
          if (decoChild._forgeTabRow && decoChild.destroy) {
            try {
              decoChild.destroy();
            } catch (_e) {
              /* finalized */
            }
          }
        });
        node._tabRowHosts = null;
      }

      tiledChildren.forEach((child, index) => {
        // A monitor can contain a window or container child
        if (node.layout === LAYOUT_TYPES.HSPLIT || node.layout === LAYOUT_TYPES.VSPLIT) {
          this.processSplit(node, child, params, index);
        } else if (node.layout === LAYOUT_TYPES.STACKED) {
          // T1: every tiled child needs a label before attach; CON via _ensureConTab,
          // WINDOW via _createWindowTab (heals tabs lost to reparent/destroy).
          if (child.isCon()) child._ensureConTab();
          else if (child.isWindow()) child._createWindowTab();
          this.processStacked(node, child, params, index);
        } else if (node.layout === LAYOUT_TYPES.TABBED) {
          if (child.isCon()) child._ensureConTab();
          else if (child.isWindow()) child._createWindowTab();
          this.processTabbed(node, child, params, index);
        }
        this.processNode(child);
      });
    }

    if (node.isWindow()) {
      if (!node.rect) {
        const wa = Utils.getWorkAreaSafe(node.nodeValue);
        if (wa) node.rect = wa;
      }
      // A monitor-less window (get_monitor() === -1) leaves node.rect unset;
      // processGap dereferences node.rect, so skip it and let a later render —
      // once Mutter assigns a monitor — produce the renderRect. forge-tpgh.
      if (node.rect) node.renderRect = this.processGap(node);
    }
  }

  /** Gap inset for non-Window and Window nodes. */
  processGap(node) {
    return TreeLayout.processGap(node, this.extWm.calculateGaps(node));
  }

  /** Screen-edge margins from settings. */
  applyMargins(rect) {
    return TreeLayout.applyMargins(rect, {
      top: this.settings.get_uint("window-margin-top"),
      bottom: this.settings.get_uint("window-margin-bottom"),
      left: this.settings.get_uint("window-margin-left"),
      right: this.settings.get_uint("window-margin-right"),
    });
  }

  processSplit(node, child, params, index) {
    child.rect = TreeLayout.splitChildRect(node.layout, node.rect, params.sizes, index);
  }

  /**
   * Size/position the stacked or tabbed decoration host and attach the child's
   * tab (forge-u8ni). Both layouts share the gap/border probe, the adjust math,
   * the guarded set_size/set_position + show/hide, the _destroyDecoration()
   * self-heal, and the tab add — they differ only in the decoration's bar
   * dimension (`barSize`) and whether the tab y-expands to fill a vertical
   * column (`tabExpand`). Optional `tabHost` is a multi-row row BoxLayout;
   * otherwise the tab attaches to the outer decoration. Orientation and the
   * child rect stay caller-side.
   */
  _applyDecorationRect(node, child, params, barSize, tabExpand, tabHost = null) {
    let gap = this.extWm.calculateGaps(node);
    let renderRect = this.processGap(node);
    let position = this.tabPosition();
    // Only window actors carry a themed border; a CON header tab contributes none
    // (forge-37r) — guard so CON children don't throw on a null border.
    let borderWidth =
      child.isWindow() && child.actor && child.actor.border
        ? child.actor.border.get_theme_node().get_border_width(St.Side.TOP)
        : 0;

    let adjust = DECORATION_ADJUST_FACTOR * Utils.dpi();
    let adjustWidth = renderRect.width + (borderWidth * 2 + gap) / adjust;
    let adjustX = renderRect.x - (gap + borderWidth * 2) / (adjust * 2);
    // Top keeps the original gap/adjust nuance (don't regress pixel placement);
    // bottom pins the bar to the container's lower edge (forge-drf). The helper
    // owns the bottom anchor; the top branch keeps its existing adjust term.
    let adjustY =
      position === "bottom"
        ? this.decorationLayout(renderRect.y, renderRect.height, barSize, position).decorationY
        : gap === 0
        ? renderRect.y
        : renderRect.y - adjust;

    // Callers reach this only inside `if (node.decoration && ...)`, so the host
    // is non-null here. The try/catch — not a null-check — is the Bug #303 /
    // forge-s7qo defense: a throw self-heals via _destroyDecoration so the tab
    // bar recreates next render instead of vanishing for the rest of the session.
    let decoration = node.decoration;
    // processNode walks every workspace; only show chrome on the active one so
    // strips do not follow the user across workspace switches.
    const onActiveWs = this._decorationOnActiveWorkspace(node);
    try {
      decoration.set_size(adjustWidth, barSize);
      decoration.set_position(adjustX, adjustY);
      if (params.tiledChildren.length > 0 && params.stackedHeight !== 0 && onActiveWs) {
        decoration.show();
      } else {
        decoration.hide();
      }
      // T1: one last ensure before attach if process path missed a missing tab.
      if (!child.tab) {
        if (child.isWindow()) child._createWindowTab();
        else if (child.isCon()) child._ensureConTab();
      }
      // Attach into row host (multi-line tabs) or outer decoration (single row / stack).
      const host = tabHost || decoration;
      if (child.tab && !host.contains(child.tab)) {
        // A keyboard swap (swapPairs) reparents the WINDOW node without detaching its
        // tab, so the tab may still be parented in the PREVIOUS container's decoration.
        // add_child asserts the child is unparented; the !contains() guard above only
        // rules out THIS host, so detach from any other parent first to avoid
        // "clutter_actor_add_child: assertion 'child->priv->parent == NULL'" (forge-bomy).
        const tabParent = child.tab.get_parent();
        if (tabParent) tabParent.remove_child(child.tab);
        child.tab.y_expand = tabExpand;
        host.add_child(child.tab);
      }
    } catch (e) {
      Logger.warn(`Failed to update decoration: ${e}`);
      // Destroy the orphaned header before nulling: _createDecoration's
      // contains() guard tests the NEW actor, so the old St.BoxLayout would
      // otherwise stay parented in window_group forever (forge-ogmd). A second
      // throw on a finalized actor must not escape the render loop.
      node._destroyDecoration();
    }
    child.render();
  }

  /** Horizontal row hosts under a vertical outer decoration (T9 multi-line tabs). */
  _ensureTabRowHosts(node, rowCount) {
    if (!node.decoration) return [];
    if (!node._tabRowHosts) node._tabRowHosts = [];
    const decoration = node.decoration;
    while (node._tabRowHosts.length < rowCount) {
      const row = new St.BoxLayout();
      Compat.setBoxOrientation(row, Clutter.Orientation.HORIZONTAL);
      row.x_expand = true;
      row.y_expand = false;
      row._forgeTabRow = true;
      row.reactive = true;
      decoration.add_child(row);
      node._tabRowHosts.push(row);
    }
    // Parent any existing hosts that processNode may have detached.
    for (const row of node._tabRowHosts) {
      if (!decoration.contains(row)) decoration.add_child(row);
    }
    return node._tabRowHosts;
  }

  /**
   * Ensure `node` has a decoration host laid out along `orientation`. Shared by
   * processStacked (VERTICAL column) and processTabbed (HORIZONTAL row).
   *
   * The _createDecoration call doubles as the forge-s7qo self-heal: it is
   * otherwise only invoked from the Node constructor, so without recreating it
   * here a single decoration throw (nulled in _applyDecorationRect's catch) would
   * leave the tab bar gone for the rest of the session. It early-returns when a
   * decoration already exists, so it is a no-op on the normal path.
   *
   * Setting the orientation every render also re-homes a host just toggled
   * between stacked and tabbed. GNOME 45–47 need `.vertical`; 48+ use
   * `.orientation` (Compat.setBoxOrientation).
   */
  _ensureDecoration(node, orientation) {
    if (!node.decoration) node._createDecoration();
    Compat.setBoxOrientation(node.decoration, orientation);
    // processNode may have cleared reactive on a leftover H/V decoration; re-arm
    // so tab/stack chrome receives picks after a layout toggle back.
    if (node.decoration && "reactive" in node.decoration) node.decoration.reactive = true;
  }

  processStacked(node, child, params, _index) {
    // i3 stacked: N title bars as a column; focused window fills the rest.
    this._ensureDecoration(node, Clutter.Orientation.VERTICAL);

    const barH = params.stackedHeight;
    const laid = TreeLayout.stackedChildRect(
      node.rect,
      barH,
      params.tiledChildren.length,
      this.tabPosition()
    );
    child.rect = laid.rect;

    if (node.decoration && (child.isWindow() || child.isCon())) {
      // Host height = N× barH. Pin each tab to barH explicitly — do not y_expand
      // to share the column. On some St.BoxLayout builds, expand allocates the
      // full column height to each child (N× a normal tab strip).
      this._applyDecorationRect(node, child, params, laid.totalBars, false);
      if (child.tab && barH > 0) {
        child.tab.y_expand = false;
        child.tab.set_height(barH);
      }
    }
  }

  processTabbed(node, child, params, index) {
    if (node.layout !== LAYOUT_TYPES.TABBED) return;

    const maxPerLine = params.maxTabsPerLine || 0;
    const count = params.tiledChildren ? params.tiledChildren.length : 0;
    const totalBar = TreeLayout.tabbedBarHeight(params.stackedHeight, count, maxPerLine);
    // max=0: single horizontal row (pre-T9). max>=1: vertical outer + row hosts.
    const multiRow = maxPerLine >= 1;

    if (multiRow) {
      this._ensureDecoration(node, Clutter.Orientation.VERTICAL);
      const { rowCount } = TreeLayout.planTabRows(count, maxPerLine);
      const hosts = this._ensureTabRowHosts(node, rowCount);
      const rowIndex = maxPerLine > 0 ? Math.floor(index / maxPerLine) : 0;
      child.rect = TreeLayout.tabbedChildRect(node.rect, totalBar, this.tabPosition(), true);
      if (node.decoration && (child.isWindow() || child.isCon())) {
        this._applyDecorationRect(node, child, params, totalBar, false, hosts[rowIndex] || null);
      }
    } else {
      this._ensureDecoration(node, Clutter.Orientation.HORIZONTAL);
      child.rect = TreeLayout.tabbedChildRect(
        node.rect,
        params.stackedHeight,
        this.tabPosition(),
        true
      );
      if (node.decoration && (child.isWindow() || child.isCon())) {
        this._applyDecorationRect(node, child, params, params.stackedHeight, false);
      }
    }
  }

  computeSizes(node, childItems) {
    return TreeLayout.computeSizes(node, childItems, (items) => this.getTiledChildren(items));
  }

  findFirstNodeWindowFrom(node) {
    let results = node.getNodeByType(NODE_TYPES.WINDOW);
    if (results.length > 0) {
      return results[0];
    }
    return null;
  }

  resetSiblingPercent(parentNode) {
    TreeLayout.resetSiblingPercent(parentNode);
  }

  /** Assign new child a percent share (may still be FLOAT). */
  insertChildPercent(parentNode, newChild) {
    if (!parentNode || !newChild) return;
    const existing = this.getTiledChildren(parentNode.childNodes).filter((n) => n !== newChild);
    let policy = "preserve";
    try {
      const raw = this.settings?.get_string?.("new-window-size-policy");
      if (raw === "equalize" || raw === "preserve") policy = raw;
    } catch (_e) {
      // settings unavailable in some unit fixtures
    }
    TreeLayout.insertChildPercent(existing, newChild, policy);
  }

  redistributeSiblingPercent(parentNode) {
    TreeLayout.redistributeSiblingPercent(parentNode);
  }

  /** Walk ancestors + node for Logger.debug (no-op when debug off). */
  debugParentNodes(node) {
    if (!Logger.isDebugEnabled() || !node) return;
    if (node.parentNode) this.debugParentNodes(node.parentNode);
    this.debugNode(node);
  }

  debugNode(node) {
    if (!Logger.isDebugEnabled() || !node) return;
    let spacing = "";
    let dashes = "-->";
    let level = node.level;
    for (let i = 0; i < level; i++) {
      let parentSpacing = i === 0 ? " " : "|";
      spacing += `${parentSpacing}   `;
    }
    let rootSpacing = level === 0 ? "#" : "*";

    let attributes = "";

    if (node.isWindow && node.isWindow()) {
      let metaWindow = node.nodeValue;
      attributes += `class:'${metaWindow.get_wm_class()}',title:'${
        metaWindow.title
      }',string:'${metaWindow}'${metaWindow === this.extWm.focusMetaWindow ? " FOCUS" : ""}`;
    } else if (node.isCon() || node.isMonitor() || node.isWorkspace()) {
      attributes += `${node.nodeValue}`;
      if (node.isCon() || node.isMonitor()) {
        attributes += `,layout:${node.layout}`;
      }
    }

    if (node.rect) {
      attributes += `,rect:${node.rect.width}x${node.rect.height}+${node.rect.x}+${node.rect.y}`;
      const pointerCoord = global.get_pointer();
      const pointerInside = Utils.rectContainsPoint(node.rect, pointerCoord) ? "yes" : "no";
      attributes += `,pointer:${pointerInside}`;
    }

    if (level !== 0) Logger.debug(`${spacing}|`);
    Logger.debug(
      `${spacing}${rootSpacing}${dashes} ${node.nodeType}#${
        node.index !== null ? node.index : "-"
      } @${attributes}`
    );
  }

  findParent(childNode, parentNodeType) {
    let parents = this.getNodeByType(parentNodeType);
    // Only get the first parent
    return parents.filter((p) => p.contains(childNode))[0];
  }
}
