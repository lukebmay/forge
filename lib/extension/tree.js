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
import { assert } from "../shared/assert.js";

// App imports
import * as Utils from "./utils.js";
import { WINDOW_MODES } from "./window-modes.js";
import { MonitorManager } from "./monitor.js";
import { WorkspaceManager } from "./workspace.js";
import * as TreeSnapshot from "./tree-snapshot.js";
import * as MonitorIdentity from "./monitor-identity.js";
import * as TreeLayout from "./tree-layout.js";
import * as PresentChrome from "./present-chrome.js";
import * as NodeChrome from "./node-chrome.js";
import { Queue } from "./queue.js";
import { isDingDesktopIconsSurface } from "../shared/float-reason.js";
import { swapWouldOverflowMins } from "./drop-intent.js";
import { zoomRect } from "./zoom.js";
import { initWindowApp, makeLiveHandle } from "./live-handle.js";
import { ensureLiveListMutators } from "./live-compat.js";
import { treeMonitorIndexOfNode } from "./layout-verify.js";
import { recordFallback, recordInvariant } from "./metrics.js";
import { mark2CleanupUnder } from "../rulesets/mark2.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES, POSITION } from "./tree-types.js";
import {
  forestIdFromLive,
  forestMergeWindowsIntoGroup,
  forestRemoveWindow,
  forestSlotSplit,
  forestSplit,
  forestSwapWindows,
  liveBagId,
  liveWindowFromMeta,
  paintWmForest,
  syncForestFromTree,
} from "./tom-live.js";
import {
  captureForestFromTom,
  restoreWmForest,
  restoreWmForestIfNeeded,
} from "./forest-restore.js";
import {
  createPlaceholderStub,
  isPlaceholderNode,
  isPlaceholderValue,
  markPlaceholderNode,
} from "./layout-placeholder.js";

export { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES, POSITION };

/** G8j: deny TILES list mutate when Forest is SoT (return true = block). */
function blockSeededTilesListMutate(parent, child, op) {
  const wm = parent?._resolveExtWm?.() || child?._resolveExtWm?.();
  if (!wm?._liveForestSeeded) return false;
  if (wm._allowGObjectCreateNode) return false;
  if (wm._presentPaintMirror) return false;

  if (parent && child) {
    if (parent.nodeType === NODE_TYPES.ROOT && child.nodeType === NODE_TYPES.WORKSPACE) {
      return false;
    }
    if (parent.nodeType === NODE_TYPES.WORKSPACE && child.nodeType === NODE_TYPES.MONITOR) {
      return false;
    }
  }

  if (
    child &&
    parent?.nodeType === NODE_TYPES.MONITOR &&
    (child.isFloat?.() || child.mode === WINDOW_MODES.FLOAT)
  ) {
    return false;
  }

  if (op === "removeChild" && child) {
    const id = liveBagId(wm, child);
    if (!id || !wm.forest?.nodes?.[id]) return false;
  }

  recordFallback(`node-${op}`, "seeded-tiles-list-mutate");
  recordInvariant("gobject-topology-forbidden", op, "seeded-tiles");
  return true;
}

function childFields(parent, child) {
  // Never touch Meta property reads without try — finalized GJS wrappers throw
  // on any get (pruneDeadWindows tests / live destroy races).
  let windowId;
  try {
    const v = child?.nodeValue;
    if (typeof v === "string" || typeof v === "number") {
      windowId = v;
    } else if (v != null) {
      try {
        if (typeof v.get_id === "function") windowId = v.get_id();
        else if (v.id != null) windowId = v.id;
      } catch (_e) {
        windowId = "dead";
      }
    }
  } catch (_e) {
    windowId = "dead";
  }
  let slot;
  try {
    slot = typeof parent?.nodeValue === "string" ? parent.nodeValue : parent?.nodeType || undefined;
  } catch (_e) {
    slot = parent?.nodeType || undefined;
  }
  return { slot, windowId };
}

function assertChildParent(parent, child) {
  const fields = childFields(parent, child);
  assert(!!child && child.parentNode === parent, "tree-parent", fields);
  assert(!!parent && parent.childNodes.includes(child), "tree-child-list", fields);
}

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
    this.mode = WINDOW_MODES.DEFAULT;
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
    this.zoomMode = null;

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
    if (blockSeededTilesListMutate(this, node, "appendChild")) return null;
    if (node.parentNode === this) {
      // Same-parent reorder: skip tab chrome teardown.
      const i = this.childNodes.indexOf(node);
      if (i >= 0) this.childNodes.splice(i, 1);
    } else if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    this.childNodes.push(node);
    node.parentNode = this;
    assertChildParent(this, node);
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
    if (blockSeededTilesListMutate(this, newNode, "insertBefore")) return null;
    if (!childNode) {
      this.appendChild(newNode);
      return newNode;
    }
    if (childNode.parentNode !== this) return null;
    if (newNode.parentNode === this) {
      const i = this.childNodes.indexOf(newNode);
      if (i >= 0) this.childNodes.splice(i, 1);
    } else if (newNode.parentNode) {
      newNode.parentNode.removeChild(newNode);
    }
    let index = childNode.index;

    if (childNode.index === 0) {
      this.childNodes.unshift(newNode);
    } else if (childNode.index > 0) {
      this.childNodes.splice(index, 0, newNode);
    }
    newNode.parentNode = this;
    assertChildParent(this, newNode);

    return newNode;
  }

  /**
   * Replace this node's child list with `ordered` (deduped, stable).
   * Drops children not listed; reparents listed nodes via appendChild.
   * @param {any[]} ordered
   * @returns {Node}
   */
  replaceChildren(ordered) {
    if (blockSeededTilesListMutate(this, ordered?.[0] ?? null, "replaceChildren")) {
      return this;
    }
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
    for (const n of this.childNodes) {
      assertChildParent(this, n);
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
    return this.isMode(WINDOW_MODES.FLOAT);
  }

  isTile() {
    return this.isMode(WINDOW_MODES.TILE);
  }

  isGrabTile() {
    return this.isMode(WINDOW_MODES.GRAB_TILE);
  }

  /** AC4: reserved thrash/fail-open slot leaf (never thrash-isolated). */
  isPlaceholder() {
    return isPlaceholderNode(this);
  }

  removeChild(node) {
    if (blockSeededTilesListMutate(this, node, "removeChild")) return null;
    if (node.isCon?.() && node.decoration) {
      // forge-6asv: a stacked/tabbed CON's decoration holds its DIRECT children's
      // tab actors. removeChild is the reparent-detach primitive (appendChild /
      // insertBefore both reach here), so a reparented intact CON's direct children
      // survive and migrate inside it — but destroying the host finalizes those
      // tab actors. Reset each DIRECT child's tab BEFORE the destroy (mirrors the
      // forge-gdsz flatten guard). Direct children only: nested CONs own untouched
      // decorations. Every CON constructs a decoration; HSPLIT leftover chrome
      // must die here too or paint extras leave a disposed St.BoxLayout pointer.
      if (node.isStackedOrTabbed?.()) {
        for (const child of node.childNodes) {
          if (child.tab) child._resetTabForReparent();
        }
        node._releaseDecorationActor();
      } else {
        node._destroyDecoration();
      }
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
      assert(!this.childNodes.includes(node), "tree-child-list", childFields(this, node));
      assert(node.parentNode == null, "tree-parent", childFields(this, node));
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
    return initWindowApp(this);
  }

  refreshApp() {
    return NodeChrome.refreshApp(this);
  }

  _buildTabBase(app, labelText) {
    return NodeChrome.buildTabBase(app, labelText);
  }

  _createWindowTab() {
    return NodeChrome.createWindowTab(this);
  }

  _ensureConTab() {
    return NodeChrome.ensureConTab(this);
  }

  /** @returns {import('./forge-adapter-gnome.js').ForgeAdapterGnome | null} */
  _resolveExtWm() {
    let root = this;
    while (root.parentNode) root = root.parentNode;
    return root.extWm || root._extWm || null;
  }

  /** Arm tab chrome drag — DragDropManager owns the gesture after this. */
  _armTabDragForWindow(metaWin, event) {
    return NodeChrome.armTabDragForWindow(this._resolveExtWm(), this, metaWin, event);
  }

  _cancelTabDragIfWindow(metaWin) {
    return NodeChrome.cancelTabDragIfWindow(this._resolveExtWm(), this, metaWin);
  }

  /**
   * Activate a window from a tab click: raise, focus, restack stack/tab group.
   * @param {any} metaWin - Meta.Window
   */
  _activateFromTab(metaWin) {
    return NodeChrome.activateFromTab(this._resolveExtWm(), this, metaWin);
  }

  _destroyTab() {
    return NodeChrome.destroyTab(this);
  }

  _resetTabForReparent() {
    return NodeChrome.resetTabForReparent(this);
  }

  _createDecoration() {
    return NodeChrome.createDecoration(this);
  }

  _releaseDecorationActor() {
    return NodeChrome.releaseDecorationActor(this);
  }

  _destroyDecoration() {
    return NodeChrome.destroyDecoration(this);
  }

  _getTitle() {
    return NodeChrome.getTitle(this);
  }

  _titleForMeta(metaWin, app) {
    return NodeChrome.titleForMeta(metaWin, app);
  }

  render() {
    return NodeChrome.render(this);
  }

  set float(value) {
    if (this.isWindow()) {
      let metaWindow = this.nodeValue;
      // Placeholders stay TILE reservation; never float or Meta-pin.
      if (this.isPlaceholder() || isPlaceholderValue(metaWindow)) {
        this.mode = WINDOW_MODES.TILE;
        return;
      }
      // mode↔FLOATS bridge until C7 — Forest FLOATS is membership SoT (D092).
      let floatAlwaysOnTop = this.settings.get_boolean("float-always-on-top-enabled");
      if (value) {
        this.mode = WINDOW_MODES.FLOAT;
        // FLOAT is not a tile slot — drop stale paint rects (R031).
        this.renderRect = null;
        this._rect = null;
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
        this.mode = WINDOW_MODES.TILE;
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

  /**
   * I1: change CON/MONITOR layout mode without reparenting or flattening.
   * Child identity and order stay put. Optional chrome via opts only.
   * @param {string} layout - HSPLIT|VSPLIT|TABBED|STACKED
   * @param {{ lastTabFocus?: any }} [opts] - chrome; pass lastTabFocus to set/clear open leaf
   * @returns {boolean}
   */
  setLayout(layout, opts = {}) {
    if (!layout) return false;
    if (!this.isCon() && !this.isMonitor()) return false;
    const allowed =
      layout === LAYOUT_TYPES.HSPLIT ||
      layout === LAYOUT_TYPES.VSPLIT ||
      layout === LAYOUT_TYPES.TABBED ||
      layout === LAYOUT_TYPES.STACKED;
    if (!allowed) return false;

    this.layout = layout;
    if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocus")) {
      this.lastTabFocus = opts.lastTabFocus;
    }
    return true;
  }

  resetLayoutSingleChild() {
    if (this.isStackedOrTabbed() && this.singleOrNoChild()) {
      this.setLayout(LAYOUT_TYPES.HSPLIT);
    }
  }

  singleOrNoChild() {
    return this.childNodes.length <= 1;
  }
}

export class Tree extends Node {
  static {
    GObject.registerClass(this);
  }

  /** @param {import("./window.js").WindowManager} extWm */
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

    /** @type {Node|null|undefined} elevated focus unit (C4 focus parent/child) */
    this.focusUnit = null;

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

  /** @type {import("./window.js").WindowManager} */
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
    return this.getNodeByType(NODE_TYPES.WORKSPACE);
  }

  getNodeByType(type) {
    const fromLists = super.getNodeByType(type);
    const wm = this.extWm || this._extWm || this.wm;
    if (!(wm?.liveById instanceof Map)) return fromLists;
    const seen = new Set(fromLists);
    const extra = [];
    const consider = (n) => {
      if (!n || seen.has(n)) return;
      if (n.nodeType === type) {
        extra.push(n);
        seen.add(n);
      }
    };
    for (const live of wm.liveById.values()) {
      consider(live);
      if (!Array.isArray(live?.childNodes)) continue;
      const walk = (n) => {
        consider(n);
        for (const c of n.childNodes || []) walk(c);
      };
      for (const c of live.childNodes) walk(c);
    }
    return extra.length ? fromLists.concat(extra) : fromLists;
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
    Utils._disableDecorations(this.extWm?.decorationManager);
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
   * WINDOW leaves keyed by windowId; adapter may also attach live window refs.
   */
  snapshotTree() {
    const wm = this.extWm;
    if (wm?._liveForestSeeded && wm.forest) {
      const fromTom = captureForestFromTom(wm);
      if (fromTom) return fromTom;
    }
    const liveMap = typeof wm?.getMonitorLiveMap === "function" ? wm.getMonitorLiveMap() : null;
    const hostBag = wm?.hostBag ?? null;
    return TreeSnapshot.captureForest(this.getNodeByType(NODE_TYPES.MONITOR), {
      liveMap,
      hostBag,
    });
  }

  /**
   * T6: force-rebuild each monitor from a full forest snapshot after flat reload.
   * Co-located survivors only; closed windows collapse; percents/userSized restored.
   */
  restoreTree(snapshot) {
    const wm = this.extWm;
    if (wm?._liveForestSeeded && wm.forest && restoreWmForest(wm, snapshot)) return;
    TreeSnapshot.restoreForest(snapshot, this._treeSnapshotCtx());
  }

  /**
   * T6: monitor-recovery path — rebuild only monitors whose topology diverged;
   * intact monitors get percent/userSized re-applied only.
   */
  restoreTreeIfNeeded(snapshot) {
    const wm = this.extWm;
    if (wm?._liveForestSeeded && wm.forest && restoreWmForestIfNeeded(wm, snapshot)) return;
    TreeSnapshot.restoreForestIfNeeded(snapshot, this._treeSnapshotCtx());
  }

  /** Shared ctx for T6 restore (St.Bin CONs live here). */
  _treeSnapshotCtx() {
    const hostBag = this.extWm?.hostBag ?? null;
    return {
      findMonitor: (id) => this.findNode(id),
      findNode: (key) => {
        const direct = this.findNode(key);
        if (direct) return direct;
        if (hostBag && key != null && typeof key !== "object") {
          const entry = hostBag.get?.(String(key));
          if (entry?.meta) {
            const viaBag = this.findNode(entry.meta);
            if (viaBag) return viaBag;
          }
        }
        const id = TreeSnapshot.windowIdFromMeta(key);
        if (id == null) return null;
        if (hostBag) {
          const nid = hostBag.idFromWindowId?.(id);
          if (nid) {
            const entry = hostBag.get?.(nid);
            if (entry?.meta) {
              const viaMeta = this.findNode(entry.meta);
              if (viaMeta) return viaMeta;
            }
          }
        }
        for (const n of this.getNodeByType(NODE_TYPES.WINDOW)) {
          if (TreeSnapshot.windowIdFromMeta(n.nodeValue) === id) return n;
        }
        return null;
      },
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
      windowIdOf: (node) => {
        const meta = node?.nodeValue;
        if (hostBag && meta && typeof meta === "object") {
          const nid = hostBag.idFromMeta?.(meta);
          if (nid) return String(nid);
        }
        return TreeSnapshot.windowIdFromMeta(meta);
      },
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

  /** Recursive descriptor via captureNode. */
  _snapshotNode(node) {
    return TreeSnapshot.captureNode(node, { hostBag: this.extWm?.hostBag ?? null });
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
  createNode(parentObj, type, value, mode = WINDOW_MODES.TILE) {
    if (!this.extWm?._allowGObjectCreateNode) return null;
    let parentNode = this.findNode(parentObj);
    let child;

    if (parentNode) {
      child = new Node(type, value);
      child.settings = this.settings;

      if (child.isWindow()) child.mode = mode;

      if (typeof parentNode.appendChild !== "function") {
        ensureLiveListMutators(parentNode);
      }

      // Append after a window
      if (parentNode.isWindow()) {
        const grandParentNode = parentNode.parentNode;
        if (grandParentNode && typeof grandParentNode.insertBefore !== "function") {
          ensureLiveListMutators(grandParentNode);
        }
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
    if (data && typeof data === "object") {
      const fromBag = liveWindowFromMeta(this.extWm, data);
      if (fromBag) return fromBag;
    }
    if (typeof data === "string" && this.extWm?.liveById?.has?.(data)) {
      return this.extWm.liveById.get(data);
    }
    const fromG = this.getNodeByValue(data);
    if (fromG) return fromG;
    const liveById = this.extWm?.liveById;
    if (!(liveById instanceof Map)) return null;
    const walk = (n) => {
      if (!n) return null;
      if (n.nodeValue === data) return n;
      for (const c of n.childNodes || []) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    for (const live of liveById.values()) {
      if (live?.nodeValue === data) return live;
      const hit = walk(live);
      if (hit) return hit;
    }
    return null;
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
    const siblings = node?.parentNode ? this.getTiledChildren(node.parentNode.childNodes) : [];
    if (siblings.length <= 1) return null;
    let idx = siblings.indexOf(node);
    if (idx < 0) return null;
    const n = siblings.length;
    for (let step = 1; step < n; step++) {
      const target = siblings[(idx + offset * step + n * 16) % n];
      let win = target;
      if (win?.isCon?.()) win = this._selectFocusWindow(win, offset < 0);
      if (!win || win === node || win.nodeType !== NODE_TYPES.WINDOW) continue;
      if (swapWouldOverflowMins(node, win)) continue;
      this.swapPairs(node, win);
      return node;
    }
    return null;
  }

  /** Non-floating, non-minimized kids (slot area). */
  getTiledChildren(items) {
    return PresentChrome.getTiledChildren(this, items);
  }

  /**
   * Next move/swap target in `direction`, skipping slots that would overflow mins.
   * @param {Node} node
   * @param {any} direction
   * @returns {Node|-1|null}
   */
  _nextMoveCandidate(node, direction) {
    const visited = new Set();
    let cursor = node;
    for (let i = 0; i < 24; i++) {
      const next = this.next(cursor, direction);
      if (!next || next === -1) return next;
      if (visited.has(next)) return null;
      visited.add(next);

      let win = next;
      if (next.nodeType === NODE_TYPES.CON || next.nodeType === NODE_TYPES.MONITOR) {
        const kids = next
          .getNodeByMode?.(WINDOW_MODES.TILE)
          ?.filter((t) => t.nodeType === NODE_TYPES.WINDOW);
        win = kids?.[0] || null;
      }
      if (win && win.nodeType === NODE_TYPES.WINDOW && swapWouldOverflowMins(node, win)) {
        cursor = next;
        continue;
      }
      return next;
    }
    return null;
  }

  /** Id-miss / Host-helper GObject write only — never after a Forest-first success. */
  _syncForestIfSeeded(op = "tree", reason = "gobject-ahead") {
    if (!this.extWm?._liveForestSeeded) return;
    recordFallback(op, reason);
    syncForestFromTree(this.extWm);
  }

  /** Host/helper directional move. Live TILES is Mark 2. */
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

    let next = this._nextMoveCandidate(node, direction);
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
          this._syncForestIfSeeded("move", "gobject-ahead");
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
          // swapPairs already Forest-first or GObject+sync
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
        if (!(typeof next.contains === "function" && next.contains(node))) {
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
    this._syncForestIfSeeded("move", "gobject-ahead");
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
    parentNode.resetLayoutSingleChild?.();

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

    while (node && ancestorType && !(typeof node.isRoot === "function" && node.isRoot())) {
      const match =
        typeof node.isType === "function"
          ? node.isType(ancestorType)
          : node.nodeType === ancestorType;
      if (match) {
        ancestorNode = node;
        break;
      }
      node = node.parentNode;
    }

    return ancestorNode;
  }

  nextVisible(node, direction) {
    if (!node) return null;
    let next = this.next(node, direction);
    // next() returns the numeric -1 sentinel at a monitor boundary (nextMonitor).
    // Normalize it to null so callers never mistake the primitive -1 for a
    // node and assign .percent on it.
    if (next === -1) return null;
    if (next && next.nodeType === NODE_TYPES.WINDOW && next.nodeValue && next.nodeValue.minimized) {
      next = this.nextVisible(next, direction);
    }
    return next;
  }

  /**
   * I1: set CON/MONITOR layout mode only (no reparent/flatten).
   * Percent reset on H↔V is opt-in via opts.resetPercents (callers decide).
   * Entering TABBED/STACKED always clears sibling percents — peers share one
   * full content slot; stale 0.5 shares from a former split must not linger
   * (half-width tab class of bugs; proto + Meta peers).
   * @param {Node} con
   * @param {string} layout - HSPLIT|VSPLIT|TABBED|STACKED
   * @param {{ lastTabFocus?: any, resetPercents?: boolean }} [opts]
   * @returns {boolean}
   */
  setLayout(con, layout, opts = {}) {
    if (!con || typeof con.setLayout !== "function") return false;
    if (!con.setLayout(layout, opts)) return false;
    const enteringBag = layout === LAYOUT_TYPES.TABBED || layout === LAYOUT_TYPES.STACKED;
    if (opts.resetPercents || enteringBag) {
      try {
        this.resetSiblingPercent(con);
      } catch (_e) {
        /* best-effort */
      }
    }
    return true;
  }

  /**
   * Tree MONITOR index for a TABBED/STACKED CON (or any node). D044 home.
   * @param {Node|null|undefined} node
   * @returns {number}
   */
  groupHomeMonitor(node) {
    if (!node) return -1;
    let idx;
    if (
      node.nodeType === NODE_TYPES.MONITOR ||
      (typeof node.isMonitor === "function" && node.isMonitor())
    ) {
      idx = Utils.monitorIndex(node.nodeValue);
      idx = Number.isFinite(idx) ? idx : -1;
    } else {
      idx = treeMonitorIndexOfNode(node);
    }
    if (idx >= 0) {
      let n = null;
      try {
        n = global.display?.get_n_monitors?.();
      } catch (_e) {
        n = null;
      }
      if (typeof n === "number" && n > 0) {
        assert(idx < n, "mon-bounds", { mon: idx });
      }
    }
    return idx;
  }

  /**
   * Insert a WINDOW into an existing TABBED/STACKED CON at child index.
   * Default index appends. Already a member → reorder. D044 after.
   * @param {Node} group
   * @param {Node} windowNode
   * @param {number} [insertIndex]
   * @returns {Node|null}
   */
  insertWindowIntoGroup(group, windowNode, insertIndex) {
    if (!group || !windowNode || windowNode === group) return null;
    if (typeof group.isStackedOrTabbed !== "function" || !group.isStackedOrTabbed()) return null;
    if (group.nodeType !== NODE_TYPES.CON) return null;
    if (windowNode.nodeType !== NODE_TYPES.WINDOW) return null;

    const kids = [...(group.childNodes || [])];
    const existing = kids.indexOf(windowNode);
    let idx = insertIndex;
    if (idx == null || !Number.isFinite(Number(idx))) {
      idx = existing >= 0 ? existing : kids.length;
    } else {
      idx = Math.floor(Number(idx));
    }
    idx = Math.max(0, Math.min(kids.length, idx));

    if (existing >= 0) {
      if (idx === existing || idx === existing + 1) {
        this._afterMergeGroup(group);
        return group;
      }
      const next = kids.slice();
      next.splice(existing, 1);
      const to = idx > existing ? idx - 1 : idx;
      next.splice(Math.max(0, Math.min(next.length, to)), 0, windowNode);
      group.replaceChildren(next);
    } else {
      const ref = idx < kids.length ? kids[idx] : null;
      const oldParent = windowNode.parentNode;
      group.insertBefore(windowNode, ref);
      if (oldParent && oldParent !== group) {
        this.resetSiblingPercent(oldParent);
        if (oldParent.nodeType === NODE_TYPES.CON) {
          oldParent.resetLayoutSingleChild();
        }
      }
    }

    this.resetSiblingPercent(group);
    if (typeof group.isTabbed === "function" && group.isTabbed()) {
      group.lastTabFocus = windowNode.nodeValue;
    }
    this.attachNode = group;
    this._afterMergeGroup(group);
    const home = this.groupHomeMonitor(group);
    const winHome = this.groupHomeMonitor(windowNode);
    assert(home < 0 || winHome < 0 || home === winHome, "group-home-mon", {
      mon: home,
      windowId: childFields(group, windowNode).windowId,
    });
    return group;
  }

  /**
   * Merge two WINDOW nodes into one TABBED/STACKED group.
   * Same H/V parent with exactly those two tiled children → flip parent layout.
   * Otherwise wrap both in a new CON at focus's index (dest = focus mon).
   * `{ insertIndex, group }` joins partner into an existing dest group at index
   * (foreign-strip / D044 move-then-join). Default remains append.
   * Cross-mon partner reparents onto dest; Meta aligned via normalize.
   * @returns {Node|null} group CON (or flipped parent), or null
   */
  mergeWindowsIntoGroup(focusNode, partnerNode, layout = LAYOUT_TYPES.TABBED, opts = {}) {
    if (!focusNode || !partnerNode || focusNode === partnerNode) return null;
    if (focusNode.nodeType !== NODE_TYPES.WINDOW || partnerNode.nodeType !== NODE_TYPES.WINDOW) {
      return null;
    }
    const wm = this.extWm;
    if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
      return forestMergeWindowsIntoGroup(wm, focusNode, partnerNode, layout, opts);
    }
    // Allow FLOAT for structure merge (layout residual may still be FLOAT).
    // Interactive keybind path tiles first via processFloats.

    const parent = focusNode.parentNode;
    if (!parent) return null;

    const applyGroupLayout = (con) => {
      // Group create path may reparent; layout field still via setLayout (I1 field write).
      const chrome =
        layout === LAYOUT_TYPES.TABBED
          ? { lastTabFocus: focusNode.nodeValue }
          : layout === LAYOUT_TYPES.STACKED
          ? { lastTabFocus: null }
          : {};
      this.setLayout(con, layout, chrome);
    };

    const destGroup =
      opts.group ||
      (opts.insertIndex != null &&
      parent.isStackedOrTabbed?.() &&
      parent.nodeType === NODE_TYPES.CON
        ? parent
        : null);

    // Join partner into existing dest TABBED/STACKED at insertIndex.
    if (destGroup && partnerNode.parentNode !== destGroup) {
      const group = this.insertWindowIntoGroup(destGroup, partnerNode, opts.insertIndex);
      if (
        group &&
        layout &&
        group.layout !== layout &&
        (layout === LAYOUT_TYPES.TABBED || layout === LAYOUT_TYPES.STACKED)
      ) {
        const chrome =
          layout === LAYOUT_TYPES.TABBED
            ? { lastTabFocus: partnerNode.nodeValue }
            : { lastTabFocus: null };
        this.setLayout(group, layout, chrome);
      }
      return group;
    }

    // Already co-grouped
    if (
      partnerNode.parentNode === parent &&
      parent.isStackedOrTabbed() &&
      parent.nodeType === NODE_TYPES.CON
    ) {
      if (opts.insertIndex != null) {
        return this.insertWindowIntoGroup(parent, partnerNode, opts.insertIndex);
      }
      this._afterMergeGroup(parent);
      return parent;
    }

    // Two siblings in a split → convert in place.
    // DnD CENTER runs while the dragged leaf is GRAB_TILE (not in tiled).
    if (
      partnerNode.parentNode === parent &&
      (parent.isHSplit() || parent.isVSplit()) &&
      parent.nodeType === NODE_TYPES.CON
    ) {
      const tiled = this.getTiledChildren(parent.childNodes).filter(
        (n) => n.nodeType === NODE_TYPES.WINDOW
      );
      const members = new Set(tiled);
      if (focusNode.parentNode === parent) members.add(focusNode);
      if (partnerNode.parentNode === parent) members.add(partnerNode);
      if (members.size === 2 && members.has(focusNode) && members.has(partnerNode)) {
        applyGroupLayout(parent);
        this.resetSiblingPercent(parent);
        this.attachNode = parent;
        if (opts.insertIndex != null) {
          return this.insertWindowIntoGroup(parent, partnerNode, opts.insertIndex);
        }
        this._afterMergeGroup(parent);
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
    if (opts.insertIndex === 0) {
      con.replaceChildren([partnerNode, focusNode]);
    }

    this.resetSiblingPercent(con);
    this.resetSiblingPercent(parent);
    if (oldPartnerParent && oldPartnerParent !== parent && oldPartnerParent !== con) {
      this.resetSiblingPercent(oldPartnerParent);
      if (oldPartnerParent.nodeType === NODE_TYPES.CON) {
        oldPartnerParent.resetLayoutSingleChild();
      }
    }

    this.attachNode = con;
    this._afterMergeGroup(con);
    return con;
  }

  /**
   * I2 product group: wrap focus + partner via mergeWindowsIntoGroup.
   * Default TABBED; STACKED when stacked mode + dnd-center-layout stacked, or opts.
   * @param {Node} focusNode
   * @param {Node} partnerNode
   * @param {string} [layout]
   * @param {{ layout?: string, stacked?: boolean, insertIndex?: number, group?: Node }} [opts]
   * @returns {Node|null}
   */
  group(focusNode, partnerNode, layout, opts = {}) {
    const mode = this._resolveGroupLayout(layout, opts);
    return this.mergeWindowsIntoGroup(focusNode, partnerNode, mode, opts);
  }

  /**
   * @param {string} [layout]
   * @param {{ layout?: string, stacked?: boolean }} [opts]
   * @returns {string}
   */
  _resolveGroupLayout(layout, opts = {}) {
    const pick = (v) => {
      if (v === LAYOUT_TYPES.STACKED || v === "STACKED" || v === "stacked") {
        return LAYOUT_TYPES.STACKED;
      }
      if (v === LAYOUT_TYPES.TABBED || v === "TABBED" || v === "tabbed") {
        return LAYOUT_TYPES.TABBED;
      }
      return null;
    };
    const fromArg = pick(layout);
    if (fromArg) return fromArg;
    const fromOpts = pick(opts.layout);
    if (fromOpts) return fromOpts;
    if (opts.stacked === true) return LAYOUT_TYPES.STACKED;
    try {
      const settings = this.settings;
      if (settings && typeof settings.get_boolean === "function") {
        const stackOn = settings.get_boolean("stacked-tiling-mode-enabled");
        const raw =
          typeof settings.get_string === "function"
            ? String(settings.get_string("dnd-center-layout") || "").toLowerCase()
            : "";
        if (stackOn && raw === "stacked") return LAYOUT_TYPES.STACKED;
      }
    } catch (_e) {
      /* default tabbed */
    }
    return LAYOUT_TYPES.TABBED;
  }

  /**
   * I2: dissolve a CON by promoting children to the grandparent (order preserved).
   * No-op MONITOR/ROOT/WORKSPACE. Does not peel Meta windows off a monitor.
   * WINDOW argument uses its parent CON. One CON only — not recursive flatten.
   * @param {Node} node
   * @returns {Node|null} grandparent when dissolved, else null
   */
  ungroup(node) {
    if (!node) return null;

    let con = node;
    if (
      node.nodeType === NODE_TYPES.WINDOW ||
      (typeof node.isWindow === "function" && node.isWindow())
    ) {
      con = node.parentNode;
    }
    if (!con) return null;

    const isMon =
      con.nodeType === NODE_TYPES.MONITOR ||
      (typeof con.isMonitor === "function" && con.isMonitor());
    const isRoot =
      con.nodeType === NODE_TYPES.ROOT || (typeof con.isRoot === "function" && con.isRoot());
    const isWs =
      con.nodeType === NODE_TYPES.WORKSPACE ||
      (typeof con.isWorkspace === "function" && con.isWorkspace());
    if (isMon || isRoot || isWs) return null;
    if (con.nodeType !== NODE_TYPES.CON && !(typeof con.isCon === "function" && con.isCon())) {
      return null;
    }

    const parent = con.parentNode;
    if (!parent) return null;

    const children = [...(con.childNodes || [])];
    if (typeof con.isStackedOrTabbed === "function" && con.isStackedOrTabbed()) {
      for (const child of children) {
        if (child?.tab && typeof child._resetTabForReparent === "function") {
          child._resetTabForReparent();
        }
      }
    }

    const n = children.length;
    const slot = Number(con.percent) || 0;
    const share = n > 0 ? slot / n : 0;
    const userSized = !!con.userSized;
    for (const child of children) {
      parent.insertBefore(child, con);
      child.percent = share;
      child.userSized = userSized;
    }

    if (typeof con._destroyDecoration === "function") {
      con._destroyDecoration();
    }
    parent.removeChild(con);

    if (this.attachNode === con) {
      this.attachNode = children[0] || parent;
    }
    return parent;
  }

  /**
   * True when node is MONITOR / ROOT / WORKSPACE (focus/move ceiling).
   * @param {Node|null|undefined} node
   * @returns {boolean}
   */
  _isFocusMoveCeiling(node) {
    if (!node) return true;
    if (node.nodeType === NODE_TYPES.MONITOR || node.isMonitor?.()) return true;
    if (node.nodeType === NODE_TYPES.ROOT || node.isRoot?.()) return true;
    if (node.nodeType === NODE_TYPES.WORKSPACE || node.isWorkspace?.()) return true;
    return false;
  }

  /**
   * Nav unit for focus parent/child: elevated focusUnit when still valid for node.
   * @param {Node|null|undefined} node
   * @returns {Node|null}
   */
  _resolveNavUnit(node) {
    const unit = this.focusUnit;
    if (unit) {
      const inTree = !!unit.parentNode || unit.isRoot?.() === true;
      if (!inTree) {
        this.focusUnit = null;
      } else if (!node || unit === node || unit.contains?.(node)) {
        return unit;
      } else {
        this.focusUnit = null;
      }
    }
    return node || null;
  }

  /**
   * WINDOW leaf to activate for a focus unit (CON → lastTabFocus / first tiled).
   * @param {Node} unit
   * @param {Node|null|undefined} [prefer]
   * @returns {Node|null}
   */
  _windowForFocusUnit(unit, prefer) {
    if (!unit) return null;
    if (unit.nodeType === NODE_TYPES.WINDOW || unit.isWindow?.()) return unit;
    if (prefer && (unit === prefer || unit.contains?.(prefer))) {
      if (prefer.nodeType === NODE_TYPES.WINDOW || prefer.isWindow?.()) return prefer;
      const nested = this._windowForFocusUnit(prefer);
      if (nested) return nested;
    }
    if (typeof unit.isStacked === "function" && unit.isStacked()) {
      return this.stackedFocusWindow(unit);
    }
    if (typeof unit.isTabbed === "function" && unit.isTabbed()) {
      const wins = this._tiledWindowsIn(unit);
      if (unit.lastTabFocus) {
        const match = wins.find((w) => w.nodeValue === unit.lastTabFocus);
        if (match) return match;
      }
      return wins[0] || null;
    }
    return this._selectFocusWindow(unit, false);
  }

  /**
   * C4: elevate focus to parent CON. Sets focusUnit; returns WINDOW to activate.
   * No-op at MONITOR/ROOT/WORKSPACE.
   * @param {Node} node
   * @returns {Node|null}
   */
  focusParent(node) {
    const start = this._resolveNavUnit(node);
    if (!start) return null;
    const parent = start.parentNode;
    if (!parent || this._isFocusMoveCeiling(parent)) return null;
    this.focusUnit = parent;
    return this._windowForFocusUnit(parent, node);
  }

  /**
   * C4: descend into last-focused / first appropriate child. Sets focusUnit.
   * @param {Node} node
   * @returns {Node|null}
   */
  focusChild(node) {
    const start = this._resolveNavUnit(node);
    if (!start || this._isFocusMoveCeiling(start)) return null;
    if (start.nodeType === NODE_TYPES.WINDOW || start.isWindow?.()) return null;

    const tiled = this.getTiledChildren(start.childNodes || []);
    if (tiled.length === 0) return null;

    let child = null;
    // Prefer the child that still owns the Meta-focused leaf (climb-back).
    if (node && (node.nodeType === NODE_TYPES.WINDOW || node.isWindow?.())) {
      child = tiled.find((n) => n === node || n.contains?.(node)) || null;
    }
    if (!child && start.lastTabFocus) {
      const leaf = this.findNode?.(start.lastTabFocus);
      if (leaf) {
        child = tiled.find((n) => n === leaf || n.contains?.(leaf)) || null;
      }
    }
    if (!child && typeof start.isStackedOrTabbed === "function" && start.isStackedOrTabbed()) {
      child = this._windowForFocusUnit(start, node);
    }
    if (!child) child = tiled[0];
    if (!child) return null;

    this.focusUnit = child;
    return this._windowForFocusUnit(child, node);
  }

  /**
   * Layout unit for move-in/out (honors elevated focusUnit when related).
   * @param {Node|null|undefined} node
   * @returns {Node|null}
   */
  _moveUnit(node) {
    let start = node;
    if (this.focusUnit) {
      const u = this.focusUnit;
      const inTree = !!u.parentNode || u.isRoot?.() === true;
      if (!inTree) {
        this.focusUnit = null;
      } else if (!node || u === node || u.contains?.(node) || node.contains?.(u)) {
        start = u;
      }
    }
    return this.layoutUnit(start) || start || null;
  }

  /**
   * Next/prev sibling CON under the same parent (existing group only).
   * @param {Node} unit
   * @returns {Node|null}
   */
  _siblingConForMoveIn(unit) {
    const parent = unit?.parentNode;
    if (!parent) return null;
    const kids = parent.childNodes || [];
    const idx = kids.indexOf(unit);
    if (idx < 0) return null;
    for (let i = idx + 1; i < kids.length; i++) {
      const n = kids[i];
      if (n && (n.nodeType === NODE_TYPES.CON || n.isCon?.()) && !this._isFocusMoveCeiling(n)) {
        return n;
      }
    }
    for (let i = idx - 1; i >= 0; i--) {
      const n = kids[i];
      if (n && (n.nodeType === NODE_TYPES.CON || n.isCon?.()) && !this._isFocusMoveCeiling(n)) {
        return n;
      }
    }
    return null;
  }

  /**
   * C4: reparent layout unit into an existing sibling CON. D044 tab/stack mon-local
   * via caller normalize. Child list via Node methods only.
   * @param {Node} node
   * @param {{ dest?: Node }} [opts]
   * @returns {Node|null} destination CON
   */
  moveIn(node, opts = {}) {
    const unit = this._moveUnit(node);
    if (!unit || this._isFocusMoveCeiling(unit)) return null;

    const dest =
      opts.dest &&
      (opts.dest.nodeType === NODE_TYPES.CON || opts.dest.isCon?.()) &&
      !this._isFocusMoveCeiling(opts.dest)
        ? opts.dest
        : this._siblingConForMoveIn(unit);
    if (!dest || dest === unit || dest.contains?.(unit)) return null;
    // Sibling (or explicit dest under same parent) only — no invent-group.
    if (!opts.dest && dest.parentNode !== unit.parentNode) return null;

    const oldParent = unit.parentNode;
    if (!oldParent) return null;

    if (
      (unit.nodeType === NODE_TYPES.WINDOW || unit.isWindow?.()) &&
      typeof dest.isStackedOrTabbed === "function" &&
      dest.isStackedOrTabbed()
    ) {
      const group = this.insertWindowIntoGroup(dest, unit);
      if (!group) return null;
      this.focusUnit = unit;
      return group;
    }

    if (typeof unit._resetTabForReparent === "function" && unit.tab) {
      unit._resetTabForReparent();
    }

    dest.appendChild(unit);
    this.resetSiblingPercent(oldParent);
    this.resetSiblingPercent(dest);
    if (oldParent.nodeType === NODE_TYPES.CON) {
      oldParent.resetLayoutSingleChild?.();
    }
    this.attachNode = unit;
    this.focusUnit = unit;
    return dest;
  }

  /**
   * C4: reparent layout unit out to grandparent (sibling of former parent).
   * No-op when parent is MONITOR/ROOT/WORKSPACE. Prefer simple peel (not Model B).
   * @param {Node} node
   * @returns {Node|null} unit after move
   */
  moveOut(node) {
    const unit = this._moveUnit(node);
    if (!unit || this._isFocusMoveCeiling(unit)) return null;

    const parent = unit.parentNode;
    if (!parent || this._isFocusMoveCeiling(parent)) return null;

    const grand = parent.parentNode;
    if (!grand) return null;

    const wasTabOrStack =
      typeof parent.isStackedOrTabbed === "function" && parent.isStackedOrTabbed();
    if (wasTabOrStack && typeof unit._resetTabForReparent === "function" && unit.tab) {
      unit._resetTabForReparent();
    }

    const ref = parent.nextSibling;
    grand.insertBefore(unit, ref);
    this.resetSiblingPercent(parent);
    this.resetSiblingPercent(grand);
    if (parent.nodeType === NODE_TYPES.CON) {
      parent.resetLayoutSingleChild?.();
    }
    this.attachNode = unit;
    this.focusUnit = unit;
    return unit;
  }

  /**
   * I3: layout unit for resize — the window, or its tab/stack bag if inside one.
   * @param {Node|null|undefined} node
   * @returns {Node|null}
   */
  layoutUnit(node) {
    if (!node) return null;
    let unit = node;
    while (
      unit.parentNode &&
      typeof unit.parentNode.isStackedOrTabbed === "function" &&
      unit.parentNode.isStackedOrTabbed()
    ) {
      unit = unit.parentNode;
    }
    return unit;
  }

  /**
   * I3: lowest ancestor of `unit` whose parent is H/V on `axis` and has a tiled pair.
   * `axisOrEdge` is HORIZONTAL|VERTICAL, or LEFT|RIGHT|UP|DOWN (also sets pair side).
   * `opts.direction` overrides pair side. No sibling that way → keep walking.
   * @param {Node} unit
   * @param {string|number} axisOrEdge
   * @param {{ direction?: string|number }} [opts]
   * @returns {{ target: Node, pair: Node, parent: Node, axis: string } | null}
   */
  resolveOwningSplit(unit, axisOrEdge, opts = {}) {
    const axis = this._owningSplitAxis(axisOrEdge);
    if (!axis) return null;
    const start = this.layoutUnit(unit);
    if (!start) return null;
    const direction =
      opts.direction !== undefined
        ? this._owningSplitDirection(opts.direction)
        : this._owningSplitDirection(axisOrEdge);

    let candidate = start;
    while (candidate && !this._isOwningSplitCeiling(candidate)) {
      const parent = candidate.parentNode;
      if (!parent || this._isOwningSplitCeiling(parent)) return null;
      if (this._isHvOnAxis(parent, axis)) {
        const tiled = this.getTiledChildren(parent.childNodes);
        if (tiled.length >= 2 && tiled.includes(candidate)) {
          const pair = this._owningSplitPair(tiled, candidate, direction);
          if (pair) return { target: candidate, pair, parent, axis };
        }
      }
      candidate = parent;
    }
    return null;
  }

  _owningSplitAxis(axisOrEdge) {
    if (axisOrEdge === ORIENTATION_TYPES.HORIZONTAL || axisOrEdge === ORIENTATION_TYPES.VERTICAL) {
      return axisOrEdge;
    }
    const dir = this._owningSplitDirection(axisOrEdge);
    if (dir != null) return Utils.orientationFromDirection(dir);
    return null;
  }

  _owningSplitDirection(value) {
    if (value == null) return null;
    const md = Meta.MotionDirection;
    if (value === md.LEFT || value === md.RIGHT || value === md.UP || value === md.DOWN) {
      return value;
    }
    if (typeof value === "string") {
      const resolved = Utils.resolveDirection(value);
      if (resolved != null) return resolved;
    }
    return null;
  }

  _isHvOnAxis(node, axis) {
    if (!node) return false;
    if (axis === ORIENTATION_TYPES.HORIZONTAL) {
      return typeof node.isHSplit === "function" && node.isHSplit();
    }
    if (axis === ORIENTATION_TYPES.VERTICAL) {
      return typeof node.isVSplit === "function" && node.isVSplit();
    }
    return false;
  }

  _isOwningSplitCeiling(node) {
    if (!node) return true;
    return (
      node.nodeType === NODE_TYPES.WORKSPACE ||
      node.nodeType === NODE_TYPES.ROOT ||
      (typeof node.isWorkspace === "function" && node.isWorkspace()) ||
      (typeof node.isRoot === "function" && node.isRoot())
    );
  }

  _owningSplitPair(tiled, target, direction) {
    const i = tiled.indexOf(target);
    if (i < 0) return null;
    const md = Meta.MotionDirection;
    if (direction === md.LEFT || direction === md.UP) {
      return i > 0 ? tiled[i - 1] : null;
    }
    if (direction === md.RIGHT || direction === md.DOWN) {
      return i + 1 < tiled.length ? tiled[i + 1] : null;
    }
    return i + 1 < tiled.length ? tiled[i + 1] : i > 0 ? tiled[i - 1] : null;
  }

  /** D044: Meta mon follows group home after structure merge. */
  _afterMergeGroup(group) {
    if (!group) return;
    try {
      this.extWm?.normalizeGroupToHomeMonitor?.(group);
    } catch (_e) {
      /* best-effort */
    }
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
    const wm = this.extWm;
    if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
      if (!forestSplit(wm, node, orientation, { force: !!forceSplit })) return null;
      return node.parentNode || null; // live parent may lag; OK for defense path
    }
    let type = node.nodeType;

    if (type === NODE_TYPES.WINDOW && node.mode === WINDOW_MODES.FLOAT && !forceSplit) {
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
      Logger.trace(`tree.split branch=toggle orient=${orientation} kids=1`);
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
    Logger.trace(
      `tree.split branch=wrap orient=${orientation} kids=${numChildren} force=${!!forceSplit}`
    );
    return newConNode;
  }

  /**
   * D032: wrap `unit` when its H/V parent already has siblings.
   * No-op for a lone child (2nd window) or a tab/stack parent.
   */
  slotSplitUnit(unit, orientation) {
    if (!unit?.parentNode) return null;
    const wm = this.extWm;
    if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
      if (!forestSlotSplit(wm, unit, orientation)) return null;
      return unit.parentNode || null;
    }
    const parent = unit.parentNode;
    if (!parent.isHSplit?.() && !parent.isVSplit?.()) return null;
    if ((parent.childNodes?.length ?? 0) < 2) return null;
    Logger.trace(`tree.slotSplit orient=${orientation} parentKids=${parent.childNodes.length}`);
    return this.split(unit, orientation);
  }

  swap(node, direction) {
    const visited = new Set();
    let probe = node;
    for (let i = 0; i < 24; i++) {
      const cand = this.next(probe, direction);
      if (!cand || cand === -1) return;
      if (visited.has(cand)) return;
      visited.add(cand);
      probe = cand;

      let nextSwapNode = cand;
      if (cand.nodeType === NODE_TYPES.CON || cand.nodeType === NODE_TYPES.MONITOR) {
        const childWindowNodes = cand
          .getNodeByMode(WINDOW_MODES.TILE)
          .filter((t) => t.nodeType === NODE_TYPES.WINDOW);
        if (cand.layout === LAYOUT_TYPES.STACKED) {
          nextSwapNode =
            this.stackedFocusWindow(cand) || childWindowNodes[childWindowNodes.length - 1];
        } else {
          nextSwapNode = childWindowNodes[0];
        }
      }

      if (!nextSwapNode?.nodeValue || nextSwapNode.nodeType !== NODE_TYPES.WINDOW) continue;
      if (!this.extWm.sameParentMonitor(node, nextSwapNode)) return;
      if (swapWouldOverflowMins(node, nextSwapNode)) continue;
      this.swapPairs(node, nextSwapNode);
      return nextSwapNode;
    }
  }

  /** Host/helper pair swap. Live path is forestSwapWindows. */
  swapPairs(fromNode, toNode, focus = true) {
    const wm = this.extWm;
    if (wm?._liveForestSeeded) {
      const aId = forestIdFromLive(wm, fromNode);
      const bId = forestIdFromLive(wm, toNode);
      // Forest-backed pair: Forest-first; id-miss fails closed (no GObject twin).
      if (aId || bId) {
        if (!aId || !bId || !forestSwapWindows(wm, fromNode, toNode)) return false;
        if (focus && fromNode?.nodeValue) {
          try {
            fromNode.nodeValue.raise();
            fromNode.nodeValue.focus(global.get_current_time());
          } catch (_e) {
            /* disposed */
          }
        }
        return true;
      }
    }
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
      if (fromNode.isGrabTile()) fromNode.mode = WINDOW_MODES.TILE;
      if (toNode.isGrabTile()) toNode.mode = WINDOW_MODES.TILE;

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
      this._syncForestIfSeeded("swapPairs", "ids-miss");
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

    const wm = this.extWm;
    if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
      if (node.isWindow?.()) {
        const ok = forestRemoveWindow(wm, node);
        if (!ok) {
          recordFallback("tree-removeNode", "ids-miss");
          return false;
        }
        try {
          if (node.parentNode) node.parentNode.removeChild(node); // absent-Forest allow
        } catch (_e) {}
        try {
          paintWmForest(wm);
        } catch (_e) {}
        return true;
      }
      recordFallback("tree-removeNode", "seeded-non-window");
      return false;
    }

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
        // Bug #470: don't wipe sibling percents across workspace/monitor boundaries
        if (
          existParent.parentNode &&
          !existParent.parentNode.isWorkspace() &&
          !existParent.parentNode.isMonitor()
        ) {
          this.resetSiblingPercent(existParent.parentNode);
        }
      }
      if (!existParent.isWorkspace() && !existParent.isMonitor()) {
        this.resetSiblingPercent(existParent);
      } else if (existParent.isMonitor()) {
        // Scale remaining shares (preserve userSized ratios; do not equalize-wipe).
        TreeSnapshot.renormalizeChildPercents(existParent.childNodes);
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
      const exitLayout = this.settings.get_boolean("auto-reorient-on-close")
        ? this.extWm.determineSplitLayoutForRect(parentNode.rect)
        : this.extWm.determineSplitLayout();
      this.setLayout(parentNode, exitLayout, { lastTabFocus: null, resetPercents: true });
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
      this.setLayout(parentNode, this.extWm.determineSplitLayoutForRect(parentNode.rect));
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
    this.setLayout(parentNode, this.extWm.determineSplitLayoutForRect(parentNode.rect));
  }

  render(from) {
    Logger.trace(`render tree ${from ? "from " + from : ""}`);
    this.processNode(this);
    this.apply(this);
    // cleanTree() may mutate the structure (orphan/invalid removal or single-child
    // CON flatten). When it does, own the single re-layout here so a flatten-only
    // mutation isn't left with stale renderRects (forge-tdap).
    if (this.cleanTree()) {
      this.processNode(this);
      this.apply(this);
    }
    Logger.trace(`*********************************************`);
  }

  apply(node) {
    if (!node) return;
    // Suppress rehome + geom retile while move_resize runs (nestable depth flags).
    const wm = this.extWm;
    wm?._suppressRehome?.enter();
    wm?._suppressGeom?.enter();
    try {
      let tiledChildren = node
        .getNodeByMode(WINDOW_MODES.TILE)
        // Skip only while Meta-fs is still live — move() on that surface fights
        // Mutter. IC3 unfullscreens first; then apply places.
        // forge-dyt2: when maximize-on-single is on, leave that Meta max alone
        // (move() would unmaximize every render). Off → D026 / apply re-tile.
        // OP2: firstRender always places once (skip would leave dock/new maps
        // at Meta restore geometry until the user drags).
        // AC4: placeholders reserve slots only — no move_resize Meta commit.
        .filter(
          (t) =>
            t.nodeType === NODE_TYPES.WINDOW &&
            !t.isPlaceholder() &&
            !(t.nodeValue.is_fullscreen && t.nodeValue.is_fullscreen()) &&
            (t.zoomMode || t.nodeValue.firstRender || !this.extWm._isLoneMaximizedTile(t))
        );
      // D069/D095: open leaf before buried tab/stack peers (global buckets).
      const open = [];
      const buried = [];
      for (const w of tiledChildren) {
        const p = w.parentNode;
        if (p?.isStackedOrTabbed?.() && p.lastTabFocus != null && w.nodeValue !== p.lastTabFocus) {
          buried.push(w);
        } else {
          open.push(w);
        }
      }
      [...open, ...buried].forEach((w) => {
        if (w.renderRect) {
          if (w.renderRect.width > 0 && w.renderRect.height > 0) {
            let metaWin = w.nodeValue;
            const dest = this.paintRectForWindow(w);
            this.extWm.move(metaWin, dest);
            if (w.zoomMode) {
              try {
                metaWin.raise();
              } catch (_e) {
                /* disposed */
              }
            }
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

  /** Slot rect, or zoom overlay. Floats have no slot — caller uses Meta frame. */
  paintRectForWindow(w) {
    if (!w || w.isFloat?.()) return null;
    const slot = w.renderRect || w.rect;
    if (!w.zoomMode || !slot) return slot;
    const mon = this.findAncestorMonitor(w);
    if (!mon?.rect) return slot;
    const gap = this.extWm.calculateGaps(w);
    const workarea = TreeLayout.processGap({ rect: mon.rect }, gap);
    return zoomRect(slot, workarea, w.zoomMode);
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
    const wm = this.extWm;
    for (const w of dead) {
      if (wm?._liveForestSeeded) {
        try {
          forestRemoveWindow(wm, w);
        } catch (_e) {
          /* finalized Meta */
        }
      }
      this.removeNode(w);
    }
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
    child.mode = WINDOW_MODES.TILE;
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
    const wm = this.extWm;
    if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
      const forest = wm.forest;
      if (!forest) return false;
      for (const mon of forest.monitors || []) {
        try {
          mark2CleanupUnder(forest, mon);
        } catch (_e) {}
      }
      try {
        paintWmForest(wm);
      } catch (_e) {}
      return true;
    }
    // Phase 1: remove any cons with empty children
    const orphanCons = this.getNodeByType(NODE_TYPES.CON).filter((c) => c.childNodes.length === 0);
    const hasOrphanCons = orphanCons.length > 0;

    orphanCons.forEach((o) => {
      this.removeNode(o);
    });

    const invalidWindows = this.getNodeByType(NODE_TYPES.WINDOW).filter((w) => {
      const metaWindow = w.nodeValue;
      if (!metaWindow) return false;
      const wmClass =
        typeof metaWindow.get_wm_class === "function"
          ? metaWindow.get_wm_class()
          : metaWindow.wm_class;
      const title =
        typeof metaWindow.get_title === "function" ? metaWindow.get_title() : metaWindow.title;
      return isDingDesktopIconsSurface({ wmClass, title });
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

  /** Per-title-bar height (DPI-scaled). */
  stackedBarHeight() {
    return PresentChrome.stackedBarHeight(this);
  }

  /** "top" or "bottom" tab strip placement. */
  tabPosition() {
    return PresentChrome.tabPosition(this);
  }

  /** Content/bar Y anchors for stacked/tabbed chrome. */
  decorationLayout(rectY, height, barSize, position) {
    return PresentChrome.decorationLayout(rectY, height, barSize, position);
  }

  /** True when CON lives on the Shell active workspace. */
  _decorationOnActiveWorkspace(node) {
    return PresentChrome.decorationOnActiveWorkspace(this, node);
  }

  /** i3-like chrome slot walk. */
  processNode(node) {
    return PresentChrome.processNode(this, node);
  }

  /** Gap inset for non-Window and Window nodes. */
  processGap(node) {
    return PresentChrome.processGap(this, node);
  }

  /** Drop cached measureMinTabWidth results (css/dpi/font). */
  invalidateMinTabWidthCache() {
    return PresentChrome.invalidateMinTabWidthCache(this);
  }

  /**
   * Min tab slot width for readable-fill wrap. 0 when minChars===0 (no chrome floor).
   * Glyph measure uses "0"×minChars in the tab title font; cache key font+dpi+chars.
   */
  measureMinTabWidth({ minChars = 0, dpi = null, fontDesc = null } = {}) {
    return PresentChrome.measureMinTabWidth(this, { minChars, dpi, fontDesc });
  }

  _tabTitleFontDesc() {
    return PresentChrome.tabTitleFontDesc(this);
  }

  _avgTabGlyphPx(minChars, scale, fontDesc) {
    return PresentChrome.avgTabGlyphPx(this, minChars, scale, fontDesc);
  }

  _tabChromePx(scale) {
    return PresentChrome.tabChromePx(this, scale);
  }

  /** Screen-edge margins from settings. */
  applyMargins(rect) {
    return PresentChrome.applyMargins(this, rect);
  }

  processSplit(node, child, params, index) {
    return PresentChrome.processSplit(this, node, child, params, index);
  }

  /** Size/position stacked or tabbed decoration host and attach child tab. */
  _applyDecorationRect(node, child, params, barSize, tabExpand, tabHost = null) {
    return PresentChrome.applyDecorationRect(
      this,
      node,
      child,
      params,
      barSize,
      tabExpand,
      tabHost
    );
  }

  /** Horizontal row hosts under a vertical outer decoration. */
  _ensureTabRowHosts(node, rowCount) {
    return PresentChrome.ensureTabRowHosts(this, node, rowCount);
  }

  /** Ensure decoration host along orientation (self-heal if missing). */
  _ensureDecoration(node, orientation) {
    return PresentChrome.ensureDecoration(this, node, orientation);
  }

  processStacked(node, child, params, index) {
    return PresentChrome.processStacked(this, node, child, params, index);
  }

  processTabbed(node, child, params, index) {
    return PresentChrome.processTabbed(this, node, child, params, index);
  }

  computeSizes(node, childItems) {
    return PresentChrome.computeSizes(this, node, childItems);
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

/** Own fields on makeLiveHandle / live-compat — do not overlay Node getters. */
const LIVE_OWNED = new Set([
  "nodeType",
  "nodeValue",
  "parentNode",
  "childNodes",
  "firstChild",
  "lastChild",
  "mode",
  "percent",
  "userSized",
  "layout",
  "settings",
  "wm",
  "tab",
  "decoration",
  "app",
  "placeholder",
  "actorBin",
  "lastTabFocus",
  "isWindow",
  "isCon",
  "isMonitor",
  "isWorkspace",
  "isRoot",
  "isFloat",
  "isTile",
  "isGrabTile",
  "isTabbed",
  "isStacked",
  "isStackedOrTabbed",
  "isHSplit",
  "isVSplit",
  "isPlaceholder",
]);

const LIVE_OVERWRITE = new Set(["getNodeByType", "setLayout", "render"]);

function bindClassApi(target, ctor) {
  const proto = ctor.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor") continue;
    const exists = Object.prototype.hasOwnProperty.call(target, name);
    if (LIVE_OWNED.has(name) && exists) continue;
    if (exists && !LIVE_OVERWRITE.has(name)) continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc) continue;
    Object.defineProperty(target, name, desc);
  }
}

/**
 * Production ROOT: LiveHandle + Tree API. Not `class Tree` / GObject Node.
 * Tests may still `new Tree` (invent-lock / GObject list).
 * @param {any} extWm
 */
export function createLiveTree(extWm) {
  const rootBin = new St.Bin();
  const settings = extWm?.ext?.settings ?? null;
  const live = makeLiveHandle(NODE_TYPES.ROOT, rootBin, {
    wm: extWm,
    settings,
    layout: LAYOUT_TYPES.ROOT,
  });
  ensureLiveListMutators(live);
  live._extWm = extWm;
  live.settings = settings;
  live.layout = LAYOUT_TYPES.ROOT;
  live.focusUnit = null;
  live.attachNode = undefined;

  bindClassApi(live, Node);
  bindClassApi(live, Tree);

  try {
    if (global.window_group && !global.window_group.contains(rootBin)) {
      global.window_group.add_child(rootBin);
    }
  } catch (_e) {
    /* fixtures / disposed */
  }

  live._monitorManager = new MonitorManager(live, extWm);
  live._workspaceManager = new WorkspaceManager(live, extWm);

  if (extWm) {
    if (!(extWm.liveById instanceof Map)) extWm.liveById = new Map();
    extWm.liveById.set("ROOT", live);
    if (!extWm._tree) extWm._tree = live;
  }

  live._initWorkspaces();
  return live;
}
