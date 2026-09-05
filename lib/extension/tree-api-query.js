// @ts-check
/**
 * Query/walk API peeled off Node/Tree. Not GObject topology.
 */

import { Queue } from "./queue.js";
import { NODE_TYPES } from "./tree-types.js";
import { ancestorMonitor } from "../tom/queries.js";
import { forestIdFromLive, liveWindowFromMeta } from "./tom-live.js";
import { assert } from "../shared/assert.js";
import { Logger } from "../shared/logger.js";
import * as Utils from "./utils.js";
import { treeMonitorIndexOfNode } from "./layout-verify.js";

/** Names createLiveTree must not copy from Node/Tree.prototype. */
export const QUERY_NAMES = new Set([
  "contains",
  "getNodeByLayout",
  "getNodeByMode",
  "getNodeByValue",
  "getNodeByType",
  "_search",
  "_walk",
  "_traverseBreadthFirst",
  "_traverseDepthFirst",
  "findNode",
  "findNodeByActor",
  "findAncestor",
  "findAncestorMonitor",
  "findParent",
  "findFirstNodeWindowFrom",
  "groupHomeMonitor",
  "isLayout",
  "isType",
  "isMode",
  "_resolveExtWm",
  "isHSplit",
  "isVSplit",
  "isStacked",
  "isTabbed",
  "isStackedOrTabbed",
  "isWindow",
  "isCon",
  "isMonitor",
  "isWorkspace",
  "isRoot",
  "isFloat",
  "isTile",
  "isGrabTile",
  "isPlaceholder",
  "debugNode",
  "debugParentNodes",
]);

/** @param {any} node @param {Function} callback */
export function traverseBreadthFirst(node, callback) {
  const queue = new Queue();
  queue.enqueue(node);
  let currentNode = queue.dequeue();
  while (currentNode) {
    const kids = currentNode.childNodes || [];
    for (let i = 0, length = kids.length; i < length; i++) {
      queue.enqueue(kids[i]);
    }
    callback(currentNode);
    currentNode = queue.dequeue();
  }
}

/** @param {any} node @param {Function} callback */
export function traverseDepthFirst(node, callback) {
  const recurse = (currentNode) => {
    const kids = currentNode.childNodes || [];
    for (let i = 0, length = kids.length; i < length; i++) {
      recurse(kids[i]);
    }
    callback(currentNode);
  };
  recurse(node);
}

/** @param {any} node @param {Function} callback @param {Function} traversal */
export function walkNode(node, callback, traversal) {
  traversal.call(node, callback);
}

/** @param {any} node @param {any} term @param {string} [criteria] */
export function searchNode(node, term, criteria) {
  const results = [];
  const searchFn = (candidate) => {
    if (criteria) {
      switch (criteria) {
        case "VALUE":
          if (candidate.nodeValue === term) results.push(candidate);
          break;
        case "TYPE":
          if (candidate.nodeType === term) results.push(candidate);
          break;
        case "MODE":
          if (candidate.mode === term) results.push(candidate);
          break;
        case "LAYOUT":
          if (candidate.layout && candidate.layout === term) results.push(candidate);
          break;
      }
    } else if (candidate === term) {
      results.push(candidate);
    }
  };
  traverseBreadthFirst(node, searchFn);
  return results;
}

/** @param {any} node */
function wmOf(node) {
  return (
    node?.extWm ||
    node?._extWm ||
    node?.wm ||
    (typeof node?._resolveExtWm === "function" ? node._resolveExtWm() : null)
  );
}

/**
 * G8e: Forest restore paints liveById chrome, not GObject child-lists.
 * Layout/mode queries must see those lives (live-compat getNodeByLayout).
 * @param {any} node
 * @param {any[]} fromLists
 * @param {(live: any) => boolean} pred
 */
function mergeLiveById(node, fromLists, pred) {
  const wm = wmOf(node);
  if (!(wm?.liveById instanceof Map)) return fromLists;
  const seen = new Set(fromLists);
  const extra = [];
  for (const live of wm.liveById.values()) {
    if (!live || seen.has(live) || !pred(live)) continue;
    extra.push(live);
    seen.add(live);
  }
  return extra.length ? fromLists.concat(extra) : fromLists;
}

/** @param {any} node @param {any} other */
export function nodeContains(node, other) {
  if (!other) return false;
  return !!nodeGetNodeByValue(node, other.nodeValue);
}

/** @param {any} node @param {any} layout */
export function nodeGetNodeByLayout(node, layout) {
  return mergeLiveById(node, searchNode(node, layout, "LAYOUT"), (live) => live.layout === layout);
}

/** @param {any} node @param {any} mode */
export function nodeGetNodeByMode(node, mode) {
  return mergeLiveById(node, searchNode(node, mode, "MODE"), (live) => live.mode === mode);
}

/** @param {any} node @param {any} value */
export function nodeGetNodeByValue(node, value) {
  const results = searchNode(node, value, "VALUE");
  return results && results.length >= 1 ? results[0] : null;
}

/** @param {any} node @param {any} type */
export function nodeGetNodeByType(node, type) {
  return searchNode(node, type, "TYPE");
}

/** @param {any} tree @param {any} type */
export function treeGetNodeByType(tree, type) {
  const fromLists = nodeGetNodeByType(tree, type);
  const wm = tree.extWm || tree._extWm || tree.wm;
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

/** @param {any} tree @param {any} data */
export function treeFindNode(tree, data) {
  if (data && typeof data === "object") {
    const fromBag = liveWindowFromMeta(tree.extWm, data);
    if (fromBag) return fromBag;
  }
  if (typeof data === "string" && tree.extWm?.liveById?.has?.(data)) {
    return tree.extWm.liveById.get(data);
  }
  const fromG = nodeGetNodeByValue(tree, data);
  if (fromG) return fromG;
  const liveById = tree.extWm?.liveById;
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

/** @param {any} tree @param {any} windowActor */
export function treeFindNodeByActor(tree, windowActor) {
  let searchNode;
  traverseDepthFirst(tree, (node) => {
    if (node.isWindow?.() && node.actor === windowActor) {
      searchNode = node;
    }
  });
  return searchNode;
}

/** @param {any} tree @param {any} node @param {any} ancestorType */
export function treeFindAncestor(tree, node, ancestorType) {
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

/** @param {any} tree @param {any} node */
export function treeFindAncestorMonitor(tree, node) {
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && wm.forest && node) {
    const id = forestIdFromLive(wm, node);
    const tom = id ? wm.forest.nodes[id] : null;
    if (tom) {
      const tomMon = ancestorMonitor(wm.forest, tom);
      if (tomMon) {
        const liveMon = wm.liveById?.get?.(tomMon.id);
        if (liveMon) return liveMon;
      }
    }
  }
  return treeFindAncestor(tree, node, NODE_TYPES.MONITOR);
}

/** @param {any} node */
export function findFirstNodeWindowFrom(node) {
  if (!node?.getNodeByType) return null;
  const results = node.getNodeByType(NODE_TYPES.WINDOW);
  return results.length > 0 ? results[0] : null;
}

export function treeFindParent(tree, childNode, parentNodeType) {
  const parents = treeGetNodeByType(tree, parentNodeType);
  return parents.filter((p) => nodeContains(p, childNode))[0];
}

/** Tree MONITOR index for a TABBED/STACKED CON (or any node). D044 home. */
export function nodeIsLayout(node, name) {
  const layout = node?.layout;
  if (!layout) return false;
  return name === layout;
}

export function nodeIsType(node, name) {
  const type = node?.nodeType;
  if (!type) return false;
  return name === type;
}

export function nodeIsMode(node, name) {
  const mode = node?.mode;
  if (!name) return false;
  return name === mode;
}

export function nodeResolveExtWm(node) {
  let root = node;
  while (root?.parentNode) root = root.parentNode;
  return root?.extWm || root?._extWm || null;
}

/** Walk ancestors + node for Logger.debug (no-op when debug off). */
export function treeDebugParentNodes(tree, node) {
  if (!Logger.isDebugEnabled() || !node) return;
  if (node.parentNode) treeDebugParentNodes(tree, node.parentNode);
  treeDebugNode(tree, node);
}

export function treeDebugNode(tree, node) {
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
    }',string:'${metaWindow}'${metaWindow === tree.extWm.focusMetaWindow ? " FOCUS" : ""}`;
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

export function treeGroupHomeMonitor(_tree, node) {
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

const QUERY_DESCRIPTORS = {
  contains: {
    value: function queryContains(other) {
      return nodeContains(this, other);
    },
    writable: true,
    configurable: true,
  },
  getNodeByLayout: {
    value: function queryGetNodeByLayout(layout) {
      return nodeGetNodeByLayout(this, layout);
    },
    writable: true,
    configurable: true,
  },
  getNodeByMode: {
    value: function queryGetNodeByMode(mode) {
      return nodeGetNodeByMode(this, mode);
    },
    writable: true,
    configurable: true,
  },
  getNodeByValue: {
    value: function queryGetNodeByValue(value) {
      return nodeGetNodeByValue(this, value);
    },
    writable: true,
    configurable: true,
  },
  getNodeByType: {
    value: function queryGetNodeByType(type) {
      return treeGetNodeByType(this, type);
    },
    writable: true,
    configurable: true,
  },
  _search: {
    value: function querySearch(term, criteria) {
      return searchNode(this, term, criteria);
    },
    writable: true,
    configurable: true,
  },
  _traverseBreadthFirst: {
    value: function queryTraverseBreadthFirst(callback) {
      traverseBreadthFirst(this, callback);
    },
    writable: true,
    configurable: true,
  },
  _traverseDepthFirst: {
    value: function queryTraverseDepthFirst(callback) {
      traverseDepthFirst(this, callback);
    },
    writable: true,
    configurable: true,
  },
  _walk: {
    value: function queryWalk(callback, traversal) {
      walkNode(this, callback, traversal);
    },
    writable: true,
    configurable: true,
  },
  findNode: {
    value: function queryFindNode(data) {
      return treeFindNode(this, data);
    },
    writable: true,
    configurable: true,
  },
  findNodeByActor: {
    value: function queryFindNodeByActor(windowActor) {
      return treeFindNodeByActor(this, windowActor);
    },
    writable: true,
    configurable: true,
  },
  findAncestor: {
    value: function queryFindAncestor(node, ancestorType) {
      return treeFindAncestor(this, node, ancestorType);
    },
    writable: true,
    configurable: true,
  },
  findAncestorMonitor: {
    value: function queryFindAncestorMonitor(node) {
      return treeFindAncestorMonitor(this, node);
    },
    writable: true,
    configurable: true,
  },
  findParent: {
    value: function queryFindParent(childNode, parentNodeType) {
      return treeFindParent(this, childNode, parentNodeType);
    },
    writable: true,
    configurable: true,
  },
  findFirstNodeWindowFrom: {
    value: function queryFindFirstNodeWindowFrom(node) {
      return findFirstNodeWindowFrom(node);
    },
    writable: true,
    configurable: true,
  },
  groupHomeMonitor: {
    value: function queryGroupHomeMonitor(node) {
      return treeGroupHomeMonitor(this, node);
    },
    writable: true,
    configurable: true,
  },
  isLayout: {
    value: function queryIsLayout(name) {
      return nodeIsLayout(this, name);
    },
    writable: true,
    configurable: true,
  },
  isType: {
    value: function queryIsType(name) {
      return nodeIsType(this, name);
    },
    writable: true,
    configurable: true,
  },
  isMode: {
    value: function queryIsMode(name) {
      return nodeIsMode(this, name);
    },
    writable: true,
    configurable: true,
  },
  _resolveExtWm: {
    value: function queryResolveExtWm() {
      return nodeResolveExtWm(this);
    },
    writable: true,
    configurable: true,
  },
  debugNode: {
    value: function queryDebugNode(node) {
      treeDebugNode(this, node);
    },
    writable: true,
    configurable: true,
  },
  debugParentNodes: {
    value: function queryDebugParentNodes(node) {
      treeDebugParentNodes(this, node);
    },
    writable: true,
    configurable: true,
  },
};

/** @param {any} root */
export function attachRootQueryApi(root) {
  Object.defineProperties(root, QUERY_DESCRIPTORS);
}
