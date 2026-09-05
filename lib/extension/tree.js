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
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";
import { assert } from "../shared/assert.js";

// App imports
import * as Utils from "./utils.js";
import { WINDOW_MODES } from "./window-modes.js";
import * as RootSpine from "./tree-api-root.js";
import * as TreeQuery from "./tree-api-query.js";
import * as TreeTopo from "./tree-api-topo.js";
import * as TreeNav from "./tree-api-nav.js";
import * as TreePresent from "./tree-api-present.js";
import * as TreeInvent from "./tree-api-invent.js";

import * as PresentChrome from "./present-chrome.js";
import * as NodeChrome from "./node-chrome.js";
import * as TreeChrome from "./tree-api-chrome.js";
import { recordFallback, recordInvariant } from "./metrics.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES, POSITION } from "./tree-types.js";
import { liveBagId } from "./tom-live.js";
import { isPlaceholderNode, isPlaceholderValue } from "./layout-placeholder.js";

export { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES, POSITION };
export { createLiveTree } from "./create-live-tree.js";

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
    return TreeQuery.nodeContains(this, node);
  }

  getNodeByLayout(layout) {
    return TreeQuery.nodeGetNodeByLayout(this, layout);
  }

  getNodeByMode(mode) {
    return TreeQuery.nodeGetNodeByMode(this, mode);
  }

  getNodeByValue(value) {
    return TreeQuery.nodeGetNodeByValue(this, value);
  }

  getNodeByType(type) {
    return TreeQuery.treeGetNodeByType(this, type);
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
    return TreeQuery.nodeIsLayout(this, name);
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
    return TreeQuery.nodeIsType(this, name);
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
    return TreeQuery.nodeIsMode(this, name);
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
    return TreeQuery.searchNode(this, term, criteria);
  }

  _traverseBreadthFirst(callback) {
    TreeQuery.traverseBreadthFirst(this, callback);
  }

  _traverseDepthFirst(callback) {
    TreeQuery.traverseDepthFirst(this, callback);
  }

  _walk(callback, traversal) {
    TreeQuery.walkNode(this, callback, traversal);
  }

  _initMetaWindow() {
    return TreeChrome.nodeInitMetaWindow(this);
  }

  refreshApp() {
    return TreeChrome.nodeRefreshApp(this);
  }

  _buildTabBase(app, labelText) {
    return TreeChrome.nodeBuildTabBase(app, labelText);
  }

  _createWindowTab() {
    return TreeChrome.nodeCreateWindowTab(this);
  }

  _ensureConTab() {
    return TreeChrome.nodeEnsureConTab(this);
  }

  /** @returns {import('./forge-adapter-gnome.js').ForgeAdapterGnome | null} */
  _resolveExtWm() {
    return TreeQuery.nodeResolveExtWm(this);
  }

  /** Arm tab chrome drag — DragDropManager owns the gesture after this. */
  _armTabDragForWindow(metaWin, event) {
    return TreeChrome.nodeArmTabDragForWindow(this, metaWin, event);
  }

  _cancelTabDragIfWindow(metaWin) {
    return TreeChrome.nodeCancelTabDragIfWindow(this, metaWin);
  }

  /**
   * Activate a window from a tab click: raise, focus, restack stack/tab group.
   * @param {any} metaWin - Meta.Window
   */
  _activateFromTab(metaWin) {
    return TreeChrome.nodeActivateFromTab(this, metaWin);
  }

  _destroyTab() {
    return TreeChrome.nodeDestroyTab(this);
  }

  _resetTabForReparent() {
    return TreeChrome.nodeResetTabForReparent(this);
  }

  _createDecoration() {
    return TreeChrome.nodeCreateDecoration(this);
  }

  _releaseDecorationActor() {
    return TreeChrome.nodeReleaseDecorationActor(this);
  }

  _destroyDecoration() {
    return TreeChrome.nodeDestroyDecoration(this);
  }

  _getTitle() {
    return TreeChrome.nodeGetTitle(this);
  }

  _titleForMeta(metaWin, app) {
    return TreeChrome.nodeTitleForMeta(metaWin, app);
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
    return TreePresent.nodeSetLayout(this, layout, opts);
  }

  resetLayoutSingleChild() {
    TreePresent.nodeResetLayoutSingleChild(this);
  }

  singleOrNoChild() {
    return TreePresent.nodeSingleOrNoChild(this);
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

    RootSpine.attachRootManagers(this, extWm);

    /** @type {Node|null|undefined} elevated focus unit (C4 focus parent/child) */
    this.focusUnit = null;

    this._initWorkspaces();
  }

  get monitorManager() {
    return RootSpine.rootMonitorManager(this);
  }

  get workspaceManager() {
    return RootSpine.rootWorkspaceManager(this);
  }

  get extWm() {
    return RootSpine.rootExtWm(this);
  }

  _initWorkspaces() {
    RootSpine.initWorkspaces(this);
  }

  /** @param {number} wsIndex */
  addMonitor(wsIndex) {
    RootSpine.addMonitor(this, wsIndex);
  }

  /** @param {number} wsIndex */
  addWorkspace(wsIndex) {
    return RootSpine.addWorkspace(this, wsIndex);
  }

  /** @param {number} wsIndex */
  removeWorkspace(wsIndex) {
    return RootSpine.removeWorkspace(this, wsIndex);
  }

  get nodeWorkpaces() {
    return RootSpine.nodeWorkpaces(this);
  }

  getNodeByType(type) {
    return TreeQuery.treeGetNodeByType(this, type);
  }

  get nodeWindows() {
    return RootSpine.nodeWindows(this);
  }

  /**
   * Reloads the tree structure. This is an expensive operation.
   * Useful when using dynamic workspaces in GNOME-shell.
   *
   * Note: Caller is responsible for tracking current windows and rendering
   * after this method completes.
   */
  reload() {
    RootSpine.rootReload(this);
  }

  _removeScaffoldBins() {
    RootSpine.removeScaffoldBins(this);
  }

  destroy() {
    RootSpine.rootDestroy(this);
  }

  /**
   * T6: full in-memory forest snapshot (MONITOR roots → CONs + WINDOW leaves).
   * WINDOW leaves keyed by windowId; adapter may also attach live window refs.
   */
  snapshotTree() {
    return TreePresent.snapshotTree(this);
  }

  restoreTree(snapshot) {
    return TreePresent.restoreTree(this, snapshot);
  }

  restoreTreeIfNeeded(snapshot) {
    return TreePresent.restoreTreeIfNeeded(this, snapshot);
  }

  /** GObject CON invent for T6 restore / group rebuild. Not Forest. */
  _snapshotCreateCon() {
    return TreeInvent.treeSnapshotCreateCon(this, Node);
  }

  /** Shared ctx for T6 restore (St.Bin CONs live here). */
  _treeSnapshotCtx() {
    return TreePresent.treeSnapshotCtx(this, () => this._snapshotCreateCon());
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
    return TreePresent.snapshotLayoutGroups(this);
  }

  _snapshotNode(node) {
    return TreePresent.snapshotNode(this, node);
  }

  _hasStackedOrTabbedAncestor(node) {
    return TreePresent.hasStackedOrTabbedAncestor(node);
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
    return TreePresent.restoreLayoutGroups(this, snapshot);
  }

  /**
   * Monitor-recovery path: rejoin or re-apply snapshot only for groups that were
   * unwrapped. Intact groups are left alone. Partial peel (some still under the
   * original STACKED/TABBED CON) re-appends orphans into that CON — never nests
   * a fresh CON via restoreLayoutGroups (which assumes a flat cohort).
   */
  restoreLayoutGroupsIfUnwrapped(snapshot) {
    return TreePresent.restoreLayoutGroupsIfUnwrapped(this, snapshot);
  }

  /** Flatten a descriptor to its leaf Meta.Window objects. */
  _descriptorWindows(descriptor) {
    return TreePresent.treeDescriptorWindows(this, descriptor);
  }

  /**
   * Rebuild a descriptor sub-tree from surviving window nodes. Window leaves not
   * in `cohortSet` (closed or scattered to another parent) are dropped. A CON
   * with fewer than two surviving children collapses to that child (or null), so
   * the rebuilt tree never carries degenerate single-child containers.
   */
  _rebuildGroup(descriptor, cohortSet) {
    return TreePresent.treeRebuildGroup(this, descriptor, cohortSet, () =>
      this._snapshotCreateCon()
    );
  }

  /**
   * Creates a new Node and attaches it to a parent toData.
   * Parent can be MONITOR or CON types only.
   */
  createNode(parentObj, type, value, mode = WINDOW_MODES.TILE) {
    return TreeTopo.treeCreateNode(this, parentObj, type, value, mode);
  }

  /** Unseeded / invent-lock GObject invent. Production ROOT returns null. */
  _createNodeGObject(parentObj, type, value, mode = WINDOW_MODES.TILE) {
    return TreeInvent.treeCreateNodeGObject(this, Node, parentObj, type, value, mode);
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
    return TreeQuery.treeFindNode(this, data);
  }

  findNodeByActor(windowActor) {
    return TreeQuery.treeFindNodeByActor(this, windowActor);
  }

  /**
   * Eligible tiled WINDOW leaves under a container (for focus selection).
   * @param {Node} container
   * @returns {Node[]}
   */
  _tiledWindowsIn(container) {
    return TreeNav.tiledWindowsIn(container);
  }

  stackedFocusWindow(container) {
    return TreeNav.stackedFocusWindow(container);
  }

  _selectFocusWindow(container, previous) {
    return TreeNav.selectFocusWindow(container, previous);
  }

  /**
   * Focuses on the next node, if metaWindow and tiled, raise it
   */
  focus(node, direction) {
    return TreeNav.treeFocus(this, node, direction);
  }

  /**
   * Raise/focus a resolved target WINDOW node and apply the focus-follow pointer
   * policy. Shared by directional focus() and the cyclic focusSibling() so both
   * paths get identical activation + Wayland stacking behavior (forge-zrl).
   */
  _activateWindowNode(next, direction) {
    return TreeNav.activateWindowNode(this, next, direction);
  }

  /**
   * Resolve the cyclic neighbour of `node` among its immediate tiled siblings
   * (i3 "focus/move next|prev"), wrapping around. `offset` is +1 (next) or -1
   * (prev). A CON sibling resolves to one of its tiled windows. Returns a WINDOW
   * node, or null when `node` is floating/has no parent or is the only tiled
   * sibling. Shared by focusSibling()/swapSibling() so both cycle identically.
   */
  _cyclicSiblingWindow(node, offset) {
    return TreeNav.cyclicSiblingWindow(this, node, offset);
  }

  /**
   * Cyclically focus the next/previous tiled sibling, wrapping around (forge-zrl).
   * @param {Node} node - the currently focused window node
   * @param {number} offset - +1 for next, -1 for previous
   */
  focusSibling(node, offset) {
    return TreeNav.treeFocusSibling(this, node, offset);
  }

  /**
   * Cyclically swap with the next/previous tiled sibling, wrapping around
   * (forge-zrl). Returns the moved node, or null when there is no valid target.
   * @param {Node} node - the currently focused window node
   * @param {number} offset - +1 for next, -1 for previous
   */
  swapSibling(node, offset) {
    return TreeNav.treeSwapSibling(this, node, offset);
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
    return TreeNav.nextMoveCandidate(this, node, direction);
  }

  /** Id-miss / Host-helper GObject write only — never after a Forest-first success. */
  _syncForestIfSeeded(op = "tree", reason = "gobject-ahead") {
    TreeTopo.syncForestIfSeeded(this, op, reason);
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

  // Shared epilogue for a structural move: renormalize percents + LX2 pair layout.
  _finishMove(parentNode, parentTarget) {
    return TreeNav.treeFinishMove(this, parentNode, parentTarget);
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
    return TreeNav.treeNext(this, node, direction);
  }

  nextMonitor(nodeWindow, position, orientation) {
    return TreeNav.treeNextMonitor(this, nodeWindow, position, orientation);
  }

  _neighborMonitorByGeometry(currentMonitor, direction) {
    return TreeNav.neighborMonitorByGeometry(currentMonitor, direction);
  }

  findAncestorMonitor(node) {
    return TreeQuery.treeFindAncestorMonitor(this, node);
  }

  findAncestor(node, ancestorType) {
    return TreeQuery.treeFindAncestor(this, node, ancestorType);
  }

  nextVisible(node, direction) {
    return TreeNav.treeNextVisible(this, node, direction);
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
    return TreePresent.treeSetLayout(this, con, layout, opts);
  }

  /**
   * Tree MONITOR index for a TABBED/STACKED CON (or any node). D044 home.
   * @param {Node|null|undefined} node
   * @returns {number}
   */
  groupHomeMonitor(node) {
    return TreeQuery.treeGroupHomeMonitor(this, node);
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
    return TreeTopo.treeInsertWindowIntoGroup(this, group, windowNode, insertIndex);
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
    return TreeTopo.treeMergeWindowsIntoGroup(this, focusNode, partnerNode, layout, opts);
  }

  /** Unseeded GObject invent. Seeded path is forestMergeWindowsIntoGroup. */
  _mergeWindowsIntoGroupGObject(focusNode, partnerNode, layout = LAYOUT_TYPES.TABBED, opts = {}) {
    return TreeInvent.treeMergeWindowsIntoGroupGObject(
      this,
      Node,
      focusNode,
      partnerNode,
      layout,
      opts
    );
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
    return TreeTopo.treeGroup(this, focusNode, partnerNode, layout, opts);
  }

  /**
   * @param {string} [layout]
   * @param {{ layout?: string, stacked?: boolean }} [opts]
   * @returns {string}
   */
  _resolveGroupLayout(layout, opts = {}) {
    return TreeTopo.resolveGroupLayout(this, layout, opts);
  }

  /**
   * I2: dissolve a CON by promoting children to the grandparent (order preserved).
   * No-op MONITOR/ROOT/WORKSPACE. Does not peel Meta windows off a monitor.
   * WINDOW argument uses its parent CON. One CON only — not recursive flatten.
   * @param {Node} node
   * @returns {Node|null} grandparent when dissolved, else null
   */
  ungroup(node) {
    return TreeTopo.treeUngroup(this, node);
  }

  /** Unseeded GObject lists. Seeded path is forestUngroup. */
  _ungroupGObject(node) {
    return TreeTopo.treeUngroupGObject(this, node);
  }

  /**
   * True when node is MONITOR / ROOT / WORKSPACE (focus/move ceiling).
   * @param {Node|null|undefined} node
   * @returns {boolean}
   */
  _isFocusMoveCeiling(node) {
    return TreeNav.isFocusMoveCeiling(node);
  }

  /**
   * Nav unit for focus parent/child: elevated focusUnit when still valid for node.
   * @param {Node|null|undefined} node
   * @returns {Node|null}
   */
  _resolveNavUnit(node) {
    return TreeNav.resolveNavUnit(this, node);
  }

  _windowForFocusUnit(unit, prefer) {
    return TreeNav.windowForFocusUnit(this, unit, prefer);
  }

  focusParent(node) {
    return TreeNav.treeFocusParent(this, node);
  }

  focusChild(node) {
    return TreeNav.treeFocusChild(this, node);
  }

  /**
   * Layout unit for move-in/out (honors elevated focusUnit when related).
   * @param {Node|null|undefined} node
   * @returns {Node|null}
   */
  _moveUnit(node) {
    return TreeNav.moveUnit(this, node);
  }

  _siblingConForMoveIn(unit) {
    return TreeNav.siblingConForMoveIn(this, unit);
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
    return TreeNav.layoutUnit(node);
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
    return TreeNav.resolveOwningSplit(this, unit, axisOrEdge, opts);
  }

  _owningSplitAxis(axisOrEdge) {
    return TreeNav.owningSplitAxis(this, axisOrEdge);
  }

  _owningSplitDirection(value) {
    return TreeNav.owningSplitDirection(value);
  }

  _isHvOnAxis(node, axis) {
    return TreeNav.isHvOnAxis(node, axis);
  }

  _isOwningSplitCeiling(node) {
    return TreeNav.isOwningSplitCeiling(node);
  }

  _owningSplitPair(tiled, target, direction) {
    return TreeNav.owningSplitPair(tiled, target, direction);
  }

  /** D044: Meta mon follows group home after structure merge. */
  _afterMergeGroup(group) {
    TreeTopo.treeAfterMergeGroup(this, group);
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
    return TreeTopo.treeSplit(this, node, orientation, forceSplit);
  }

  _splitGObject(node, orientation, forceSplit = false) {
    return TreeInvent.treeSplitGObject(this, Node, node, orientation, forceSplit);
  }

  /**
   * D032: wrap `unit` when its H/V parent already has siblings.
   * No-op for a lone child (2nd window) or a tab/stack parent.
   */
  slotSplitUnit(unit, orientation) {
    return TreeTopo.treeSlotSplitUnit(this, unit, orientation);
  }

  swap(node, direction) {
    return TreeTopo.treeSwap(this, node, direction);
  }

  /** Host/helper pair swap. Live path is forestSwapWindows. */
  swapPairs(fromNode, toNode, focus = true) {
    return TreeTopo.treeSwapPairs(this, fromNode, toNode, focus);
  }

  _swapPairsGObject(fromNode, toNode, focus = true) {
    return TreeTopo.treeSwapPairsGObject(this, fromNode, toNode, focus);
  }

  _swappable(node) {
    return TreeTopo.treeSwappable(this, node);
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
    return TreeTopo.treeRemoveNode(this, node);
  }

  _removeNodeGObject(node) {
    return TreeTopo.treeRemoveNodeGObject(this, node);
  }

  /**
   * forge-nl8: opt-in re-orientation of a split container after a child closes.
   * Reads `auto-reorient-on-close` (default false). Only acts on a real split
   * container (HSPLIT/VSPLIT) so an explicit TABBED/STACKED layout is preserved.
   * determineSplitLayoutForRect is null-safe (falls back to monitor orientation).
   */
  _reorientOnClose(parentNode) {
    TreePresent.treeReorientOnClose(this, parentNode);
  }

  render(from) {
    return TreePresent.treeRender(this, from);
  }

  apply(node) {
    return TreePresent.treeApply(this, node);
  }

  paintRectForWindow(w) {
    return TreePresent.paintRectForWindow(this, w);
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
    return TreePresent.pruneDeadWindows(this);
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
    return TreeInvent.treeCreatePlaceholderLeaf(this, Node, parentObj, opts);
  }

  cleanTree() {
    return TreeTopo.treeCleanTree(this);
  }

  _cleanTreeGObject() {
    return TreeTopo.treeCleanTreeGObject(this);
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

  /** True when chrome's Forest `moNwsW` pair is the live pair. */
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
    return TreeQuery.findFirstNodeWindowFrom(node);
  }

  resetSiblingPercent(parentNode) {
    return TreePresent.resetSiblingPercent(parentNode);
  }

  insertChildPercent(parentNode, newChild) {
    return TreePresent.insertChildPercent(this, parentNode, newChild);
  }

  redistributeSiblingPercent(parentNode) {
    return TreePresent.redistributeSiblingPercent(parentNode);
  }

  /** Walk ancestors + node for Logger.debug (no-op when debug off). */
  debugParentNodes(node) {
    return TreeQuery.treeDebugParentNodes(this, node);
  }

  debugNode(node) {
    return TreeQuery.treeDebugNode(this, node);
  }

  findParent(childNode, parentNodeType) {
    return TreeQuery.treeFindParent(this, childNode, parentNodeType);
  }
}
