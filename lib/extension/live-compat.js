// @ts-check
/**
 * Leftover list/walk shim until class Tree/Node die. Not topology SoT.
 * Production ROOT is createLiveTree (LiveHandle), not `new Tree`.
 * Do not grow live-handle.js.
 */

import * as NodeChrome from "./node-chrome.js";
import { LAYOUT_TYPES } from "./tree-types.js";

/**
 * @param {any} live
 * @returns {any}
 */
function seededTilesBlocked(parent, child) {
  const wm = parent?.wm || parent?._resolveExtWm?.() || child?.wm || child?._resolveExtWm?.();
  if (!wm?._liveForestSeeded) return false;
  if (wm._allowGObjectCreateNode) return false;
  if (wm._presentPaintMirror) return false;
  if (parent?.nodeType === "ROOT" && child?.nodeType === "WORKSPACE") return false;
  if (parent?.nodeType === "WORKSPACE" && child?.nodeType === "MONITOR") return false;
  return true;
}

export function ensureLiveListMutators(live) {
  if (!live || typeof live.appendChild === "function") return live;
  if (!Array.isArray(live.childNodes)) live.childNodes = [];
  if (!Object.prototype.hasOwnProperty.call(live, "parentNode")) live.parentNode = null;

  live.appendChild = function appendChild(node) {
    if (!node) return null;
    if (seededTilesBlocked(this, node)) return null;
    if (
      node.parentNode &&
      node.parentNode !== this &&
      typeof node.parentNode.removeChild === "function"
    ) {
      node.parentNode.removeChild(node);
    } else if (node.parentNode === this) {
      const i = this.childNodes.indexOf(node);
      if (i >= 0) this.childNodes.splice(i, 1);
    }
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  };

  live.removeChild = function removeChild(node) {
    if (seededTilesBlocked(this, node)) return null;
    const i = this.childNodes.indexOf(node);
    if (i < 0) return null;
    this.childNodes.splice(i, 1);
    node.parentNode = null;
    try {
      if (node.isCon?.() && node.decoration) {
        if (node.isStackedOrTabbed?.()) {
          for (const child of node.childNodes || []) {
            if (!child?.tab) continue;
            if (typeof child._resetTabForReparent === "function") child._resetTabForReparent();
            else NodeChrome.resetTabForReparent(child);
          }
          if (typeof node._releaseDecorationActor === "function") node._releaseDecorationActor();
          else NodeChrome.releaseDecorationActor(node);
        } else if (typeof node._destroyDecoration === "function") {
          node._destroyDecoration();
        } else {
          NodeChrome.destroyDecoration(node);
        }
      } else if (node.isCon?.() && node.tab) {
        if (typeof node._destroyTab === "function") node._destroyTab();
        else NodeChrome.destroyTab(node);
      }
    } catch (_e) {
      /* disposed */
    }
    return [node];
  };

  live.isType = function isType(name) {
    return this.nodeType === name;
  };

  live.contains = function contains(node) {
    if (!node) return false;
    const walk = (n) => {
      if (n === node) return true;
      for (const c of n.childNodes || []) {
        if (walk(c)) return true;
      }
      return false;
    };
    return walk(this);
  };

  live.resetLayoutSingleChild = function resetLayoutSingleChild() {
    if (this.isStackedOrTabbed?.() && (this.childNodes?.length ?? 0) <= 1) {
      this.layout = "HSPLIT";
    }
  };

  Object.defineProperty(live, "firstChild", {
    configurable: true,
    get() {
      return this.childNodes?.[0] ?? null;
    },
  });
  Object.defineProperty(live, "lastChild", {
    configurable: true,
    get() {
      const n = this.childNodes;
      return n && n.length ? n[n.length - 1] : null;
    },
  });

  live.replaceChildren = function replaceChildren(ordered) {
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
    for (const n of next) this.appendChild(n);
    return this;
  };

  live.insertBefore = function insertBefore(newNode, ref) {
    if (!newNode) return null;
    if (seededTilesBlocked(this, newNode)) return null;
    if (!ref) return this.appendChild(newNode);
    if (newNode.parentNode && typeof newNode.parentNode.removeChild === "function") {
      newNode.parentNode.removeChild(newNode);
    }
    const i = this.childNodes.indexOf(ref);
    if (i < 0) return this.appendChild(newNode);
    this.childNodes.splice(i, 0, newNode);
    newNode.parentNode = this;
    return newNode;
  };

  live.getNodeByType = function getNodeByType(type) {
    const out = [];
    const seen = new Set();
    const consider = (n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      if (n.nodeType === type) out.push(n);
    };
    const walkLists = (n) => {
      if (!n) return;
      consider(n);
      for (const c of n.childNodes || []) walkLists(c);
    };
    walkLists(this);
    const wm = this.wm;
    let id = typeof this.nodeValue === "string" && this.nodeValue ? this.nodeValue : null;
    if (!id && wm?.liveById instanceof Map) {
      for (const [k, n] of wm.liveById) {
        if (n === this) {
          id = k;
          break;
        }
      }
    }
    const tom = id && wm?.forest?.nodes?.[id];
    if (tom && wm.liveById instanceof Map) {
      const walkForest = (tid) => {
        const t = wm.forest.nodes[tid];
        if (!t) return;
        const n = wm.liveById.get(tid);
        consider(n);
        walkLists(n);
        for (const cid of t.childIds || []) walkForest(cid);
      };
      for (const cid of tom.childIds || []) walkForest(cid);
    }
    return out;
  };

  live.getNodeByMode = function getNodeByMode(mode) {
    const out = [];
    const seen = new Set();
    const consider = (n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      if (n.mode === mode) out.push(n);
    };
    const walkLists = (n) => {
      if (!n) return;
      consider(n);
      for (const c of n.childNodes || []) walkLists(c);
    };
    walkLists(this);
    for (const n of this.getNodeByType("WINDOW")) consider(n);
    return out;
  };

  live.getNodeByValue = function getNodeByValue(value) {
    if (this.nodeValue === value) return this;
    let found = null;
    const walk = (n) => {
      if (!n || found) return;
      if (n.nodeValue === value) {
        found = n;
        return;
      }
      for (const c of n.childNodes || []) walk(c);
    };
    for (const c of this.childNodes || []) walk(c);
    if (found) return found;
    const wm = this.wm || this._extWm;
    if (wm?.liveById instanceof Map) {
      for (const n of wm.liveById.values()) {
        if (n?.nodeValue === value) return n;
      }
    }
    return null;
  };

  live.getNodeByLayout = function getNodeByLayout(layout) {
    const out = [];
    const seen = new Set();
    const consider = (n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      if (n.layout === layout) out.push(n);
    };
    const walkLists = (n) => {
      if (!n) return;
      consider(n);
      for (const c of n.childNodes || []) walkLists(c);
    };
    walkLists(this);
    const wm = this.wm || this._extWm;
    if (wm?.liveById instanceof Map) {
      for (const n of wm.liveById.values()) consider(n);
    }
    return out;
  };

  live.setLayout = function setLayout(layout, opts = {}) {
    if (!layout) return false;
    if (!this.isCon?.() && !this.isMonitor?.()) return false;
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
  };

  live._resolveExtWm = function _resolveExtWm() {
    if (this.wm) return this.wm;
    if (this._extWm) return this._extWm;
    let root = this;
    while (root.parentNode) root = root.parentNode;
    return root.extWm || root._extWm || root.wm || null;
  };

  Object.defineProperty(live, "index", {
    configurable: true,
    get() {
      const p = this.parentNode;
      if (!p?.childNodes) return null;
      const i = p.childNodes.indexOf(this);
      return i >= 0 ? i : null;
    },
  });
  Object.defineProperty(live, "nextSibling", {
    configurable: true,
    get() {
      const p = this.parentNode;
      if (!p?.childNodes) return null;
      const i = p.childNodes.indexOf(this);
      if (i < 0 || i + 1 >= p.childNodes.length) return null;
      return p.childNodes[i + 1];
    },
  });
  Object.defineProperty(live, "previousSibling", {
    configurable: true,
    get() {
      const p = this.parentNode;
      if (!p?.childNodes) return null;
      const i = p.childNodes.indexOf(this);
      if (i <= 0) return null;
      return p.childNodes[i - 1];
    },
  });
  Object.defineProperty(live, "actor", {
    configurable: true,
    get() {
      switch (this.nodeType) {
        case "WINDOW":
          return this._actor ?? this.windowActor ?? null;
        case "CON":
        case "ROOT":
          return this.nodeValue;
        case "MONITOR":
        case "WORKSPACE":
          return this.actorBin;
        default:
          return null;
      }
    },
  });

  return live;
}
