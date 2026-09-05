// @ts-check
/**
 * Forest-first topology peel off class Tree (G8n-s3 start).
 * Seeded split/slotSplit/group live here. GObject invent stays on Tree.
 */

import { Logger } from "../shared/logger.js";
import { assert } from "../shared/assert.js";
import * as Utils from "./utils.js";
import { LAYOUT_TYPES, NODE_TYPES } from "./tree-types.js";
import { WINDOW_MODES } from "./window-modes.js";
import { swapWouldOverflowMins } from "./drop-intent.js";
import {
  forestIdFromLive,
  forestMergeWindowsIntoGroup,
  forestRemoveWindow,
  forestUngroup,
  forestSlotSplit,
  forestSplit,
  forestSwapWindows,
  paintWmForest,
  syncForestFromTree,
} from "./tom-live.js";
import { mark2CleanupUnder } from "../rulesets/mark2.js";
import { recordFallback } from "./metrics.js";
import * as TreeSnapshot from "./tree-snapshot.js";
import { isDingDesktopIconsSurface } from "../shared/float-reason.js";

/** Names createLiveTree must not copy from Node/Tree.prototype. */
export const TOPO_NAMES = new Set([
  "split",
  "slotSplitUnit",
  "group",
  "_resolveGroupLayout",
  "removeNode",
  "_removeNodeGObject",
  "cleanTree",
  "_cleanTreeGObject",
  "swap",
  "swapPairs",
  "_swapPairsGObject",
  "_swappable",
  "_afterMergeGroup",
  "insertWindowIntoGroup",
  "mergeWindowsIntoGroup",
  "_syncForestIfSeeded",
  "createNode",
  "ungroup",
  "_ungroupGObject",
]);

/**
 * @param {any} tree
 * @param {any} node
 * @param {any} orientation
 * @param {boolean} [forceSplit]
 */
export function treeSplit(tree, node, orientation, forceSplit = false) {
  if (!node) return null;
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
    if (!forestSplit(wm, node, orientation, { force: !!forceSplit })) return null;
    return node.parentNode || null;
  }
  return tree._splitGObject?.(node, orientation, forceSplit) ?? null;
}

/**
 * D032: wrap `unit` when its H/V parent already has siblings.
 * @param {any} tree
 * @param {any} unit
 * @param {any} orientation
 */
export function treeSlotSplitUnit(tree, unit, orientation) {
  if (!unit?.parentNode) return null;
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
    if (!forestSlotSplit(wm, unit, orientation)) return null;
    return unit.parentNode || null;
  }
  const parent = unit.parentNode;
  if (!parent.isHSplit?.() && !parent.isVSplit?.()) return null;
  if ((parent.childNodes?.length ?? 0) < 2) return null;
  Logger.trace(`tree.slotSplit orient=${orientation} parentKids=${parent.childNodes.length}`);
  return treeSplit(tree, unit, orientation);
}

/**
 * @param {any} tree
 * @param {any} [layout]
 * @param {{ layout?: string, stacked?: boolean }} [opts]
 * @returns {string}
 */
export function resolveGroupLayout(tree, layout, opts = {}) {
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
    const settings = tree.settings;
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
 * @param {any} tree
 * @param {any} focusNode
 * @param {any} partnerNode
 * @param {any} [layout]
 * @param {object} [opts]
 */
export function treeGroup(tree, focusNode, partnerNode, layout, opts = {}) {
  const mode = resolveGroupLayout(tree, layout, opts);
  return treeMergeWindowsIntoGroup(tree, focusNode, partnerNode, mode, opts);
}

/**
 * Production ROOT: no GObject invent unless `_allowGObjectCreateNode`.
 * Invent body stays `_createNodeGObject`.
 */
/**
 * Forest-first dissolve. GObject lists stay `_ungroupGObject`.
 * @param {any} tree
 * @param {any} node
 * @returns {any|null}
 */
export function treeUngroup(tree, node) {
  if (!node) return null;
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
    return forestUngroup(wm, node);
  }
  return treeUngroupGObject(tree, node);
}

/** Unseeded GObject lists. Seeded path is forestUngroup. */
export function treeUngroupGObject(tree, node) {
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
    con.nodeType === NODE_TYPES.MONITOR || (typeof con.isMonitor === "function" && con.isMonitor());
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

  if (tree.attachNode === con) {
    tree.attachNode = children[0] || parent;
  }
  return parent;
}

export function treeCreateNode(tree, parentObj, type, value, mode = WINDOW_MODES.TILE) {
  if (!tree.extWm?._allowGObjectCreateNode) return null;
  return tree._createNodeGObject?.(parentObj, type, value, mode);
}

/**
 * Forest-first merge. GObject invent stays `_mergeWindowsIntoGroupGObject`.
 * @param {any} tree
 * @param {any} focusNode
 * @param {any} partnerNode
 * @param {any} [layout]
 * @param {object} [opts]
 */
export function treeMergeWindowsIntoGroup(
  tree,
  focusNode,
  partnerNode,
  layout = LAYOUT_TYPES.TABBED,
  opts = {}
) {
  if (!focusNode || !partnerNode || focusNode === partnerNode) return null;
  if (focusNode.nodeType !== NODE_TYPES.WINDOW || partnerNode.nodeType !== NODE_TYPES.WINDOW) {
    return null;
  }
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
    return forestMergeWindowsIntoGroup(wm, focusNode, partnerNode, layout, opts);
  }
  return tree._mergeWindowsIntoGroupGObject?.(focusNode, partnerNode, layout, opts) ?? null;
}

/**
 * @param {any} tree
 * @param {any} node
 * @returns {boolean}
 */
export function treeRemoveNode(tree, node) {
  if (!node || !node.parentNode) return false;
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && !wm._allowGObjectCreateNode) {
    if (node.isWindow?.()) {
      const ok = forestRemoveWindow(wm, node);
      if (!ok) {
        recordFallback("tree-removeNode", "ids-miss");
        return false;
      }
      try {
        const forest = wm.forest;
        for (const m of forest?.monitors || []) {
          if (m && forest.nodes[m.id]) mark2CleanupUnder(forest, m);
        }
      } catch (_e) {}
      try {
        if (node.parentNode) node.parentNode.removeChild(node);
      } catch (_e) {}
      try {
        paintWmForest(wm);
      } catch (_e) {}
      return true;
    }
    recordFallback("tree-removeNode", "seeded-non-window");
    return false;
  }
  return treeRemoveNodeGObject(tree, node);
}

/** Unseeded GObject remove + parent cleanup. Seeded path is forestRemoveWindow. */
export function treeRemoveNodeGObject(tree, node) {
  if (!node || !node.parentNode) return false;

  if (node.isWindow() && node.tab) node._destroyTab();

  let oldChild;

  const cleanUpParent = (existParent) => {
    if (tree.getTiledChildren(existParent.childNodes).length === 0) {
      existParent.percent = 0.0;
      existParent.userSized = false;
      if (
        existParent.parentNode &&
        !existParent.parentNode.isWorkspace() &&
        !existParent.parentNode.isMonitor()
      ) {
        tree.resetSiblingPercent(existParent.parentNode);
      }
    }
    if (!existParent.isWorkspace() && !existParent.isMonitor()) {
      tree.resetSiblingPercent(existParent);
    } else if (existParent.isMonitor()) {
      TreeSnapshot.renormalizeChildPercents(existParent.childNodes);
    }
  };

  const parentNode = node.parentNode;
  let closedContainer;
  if (parentNode.childNodes.length === 1 && parentNode.nodeType !== NODE_TYPES.MONITOR) {
    const existParent = parentNode.parentNode;
    oldChild = existParent.removeChild(parentNode);
    cleanUpParent(existParent);
    closedContainer = existParent;
  } else {
    const existParent = node.parentNode;
    oldChild = existParent.removeChild(node);
    if (!tree.extWm.floatingWindow(node)) cleanUpParent(existParent);
    closedContainer = existParent;
  }

  if (
    tree.settings.get_boolean("auto-exit-tabbed") &&
    parentNode.nodeType === NODE_TYPES.CON &&
    parentNode.layout === LAYOUT_TYPES.TABBED &&
    parentNode.childNodes.length === 1
  ) {
    const exitLayout = tree.settings.get_boolean("auto-reorient-on-close")
      ? tree.extWm.determineSplitLayoutForRect(parentNode.rect)
      : tree.extWm.determineSplitLayout();
    tree.setLayout(parentNode, exitLayout, { lastTabFocus: null, resetPercents: true });
    parentNode._destroyDecoration();
  }

  if (!tree.extWm.floatingWindow(node)) tree._reorientOnClose(closedContainer);

  if (parentNode.nodeType === NODE_TYPES.MONITOR && parentNode.childNodes.length === 0) {
    tree.setLayout(parentNode, tree.extWm.determineSplitLayoutForRect(parentNode.rect));
  }

  if (node === tree.attachNode) {
    tree.attachNode = null;
  } else {
    tree.attachNode = tree.findNode(tree.extWm.focusMetaWindow);
  }

  return oldChild ? true : false;
}

/** @param {any} tree @returns {boolean} */
/**
 * @param {any} tree
 * @param {any} fromNode
 * @param {any} toNode
 * @param {boolean} [focus]
 */
/**
 * Walker: next TILE window in `direction`, then swapPairs.
 * @param {any} tree
 * @param {any} node
 * @param {any} direction
 */
export function treeSwap(tree, node, direction) {
  const visited = new Set();
  let probe = node;
  for (let i = 0; i < 24; i++) {
    const cand = tree.next(probe, direction);
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
          tree.stackedFocusWindow(cand) || childWindowNodes[childWindowNodes.length - 1];
      } else {
        nextSwapNode = childWindowNodes[0];
      }
    }

    if (!nextSwapNode?.nodeValue || nextSwapNode.nodeType !== NODE_TYPES.WINDOW) continue;
    if (!tree.extWm.sameParentMonitor(node, nextSwapNode)) return;
    if (swapWouldOverflowMins(node, nextSwapNode)) continue;
    tree.swapPairs(node, nextSwapNode);
    return nextSwapNode;
  }
}

export function treeSwapPairs(tree, fromNode, toNode, focus = true) {
  const wm = tree.extWm;
  if (wm?._liveForestSeeded) {
    const aId = forestIdFromLive(wm, fromNode);
    const bId = forestIdFromLive(wm, toNode);
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
  return treeSwapPairsGObject(tree, fromNode, toNode, focus);
}

/** Host/helper pair swap. Live path is forestSwapWindows. */
export function treeSwapPairsGObject(tree, fromNode, toNode, focus = true) {
  if (!(tree._swappable(fromNode) && tree._swappable(toNode))) return;

  if (!Utils.isWindowAlive(fromNode?.nodeValue)) {
    Logger.warn("swapPairs: fromNode window destroyed, skipping swap");
    return;
  }
  if (!Utils.isWindowAlive(toNode?.nodeValue)) {
    Logger.warn("swapPairs: toNode window destroyed, skipping swap");
    return;
  }

  const parentForFrom = fromNode ? fromNode.parentNode : undefined;
  const parentForTo = toNode.parentNode;
  if (parentForTo && parentForFrom) {
    const nextIndex = toNode.index;
    const focusIndex = fromNode.index;

    const transferMode = fromNode.mode;
    fromNode.mode = toNode.mode;
    toNode.mode = transferMode;

    if (fromNode.isGrabTile()) fromNode.mode = WINDOW_MODES.TILE;
    if (toNode.isGrabTile()) toNode.mode = WINDOW_MODES.TILE;

    const transferRect = fromNode.nodeValue.get_frame_rect();
    const transferToRect = toNode.nodeValue.get_frame_rect();
    if (!transferRect || !transferToRect) {
      Logger.warn("swapPairs: invalid frame rects");
      return;
    }
    const transferPercent = fromNode.percent;

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

    tree.extWm.move(fromNode.nodeValue, transferToRect);
    tree.extWm.move(toNode.nodeValue, transferRect);

    if (focus) {
      fromNode.nodeValue.raise();
      fromNode.nodeValue.focus(global.get_current_time());
    }
    tree._syncForestIfSeeded("swapPairs", "ids-miss");
  }
}

/** @param {any} tree @returns {boolean} */
export function treeCleanTree(tree) {
  const wm = tree.extWm;
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
  return treeCleanTreeGObject(tree);
}

export function treeCleanTreeGObject(tree) {
  const orphanCons = tree.getNodeByType(NODE_TYPES.CON).filter((c) => c.childNodes.length === 0);
  const hasOrphanCons = orphanCons.length > 0;

  orphanCons.forEach((o) => {
    tree.removeNode(o);
  });

  const invalidWindows = tree.getNodeByType(NODE_TYPES.WINDOW).filter((w) => {
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
    tree.removeNode(w);
  });

  let didFlatten = false;
  let flattened = true;
  while (flattened) {
    flattened = false;
    const nestedCons = tree
      .getNodeByType(NODE_TYPES.CON)
      .filter((c) => c.childNodes.length === 1 && c.childNodes[0].nodeType === NODE_TYPES.CON);

    for (const parent of nestedCons) {
      const child = parent.childNodes[0];
      const wasStackedOrTabbed = child.isStackedOrTabbed();
      const grandchildren = [...child.childNodes];
      for (const grandchild of grandchildren) {
        if (wasStackedOrTabbed && grandchild.tab) {
          grandchild._resetTabForReparent();
        }
        parent.appendChild(grandchild);
      }
      if (child.layout && child.layout !== LAYOUT_TYPES.ROOT) {
        parent.layout = child.layout;
      }
      parent.removeChild(child);
      flattened = true;
      didFlatten = true;
      break;
    }
  }

  return hasOrphanCons || invalidWindows.length > 0 || didFlatten;
}

function windowIdForAssert(child) {
  try {
    const v = child?.nodeValue;
    if (typeof v === "string" || typeof v === "number") return v;
    if (v != null && typeof v.get_id === "function") return v.get_id();
    if (v?.id != null) return v.id;
  } catch (_e) {
    return "dead";
  }
  return undefined;
}

/**
 * Insert a WINDOW into an existing TABBED/STACKED CON at child index.
 * Default index appends. Already a member → reorder. D044 after.
 * @param {any} tree
 * @param {any} group
 * @param {any} windowNode
 * @param {number} [insertIndex]
 * @returns {any|null}
 */
export function treeInsertWindowIntoGroup(tree, group, windowNode, insertIndex) {
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
      tree._afterMergeGroup(group);
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
      tree.resetSiblingPercent(oldParent);
      if (oldParent.nodeType === NODE_TYPES.CON) {
        oldParent.resetLayoutSingleChild();
      }
    }
  }

  tree.resetSiblingPercent(group);
  if (typeof group.isTabbed === "function" && group.isTabbed()) {
    group.lastTabFocus = windowNode.nodeValue;
  }
  tree.attachNode = group;
  tree._afterMergeGroup(group);
  const home = tree.groupHomeMonitor(group);
  const winHome = tree.groupHomeMonitor(windowNode);
  assert(home < 0 || winHome < 0 || home === winHome, "group-home-mon", {
    mon: home,
    windowId: windowIdForAssert(windowNode),
  });
  return group;
}

export function treeAfterMergeGroup(tree, group) {
  if (!group) return;
  try {
    tree.extWm?.normalizeGroupToHomeMonitor?.(group);
  } catch (_e) {
    /* best-effort */
  }
}

/** Id-miss / Host-helper GObject write only — never after a Forest-first success. */
export function syncForestIfSeeded(tree, op = "tree", reason = "gobject-ahead") {
  if (!tree.extWm?._liveForestSeeded) return;
  recordFallback(op, reason);
  syncForestFromTree(tree.extWm);
}

export function treeSwappable(_tree, node) {
  if (!node) return false;
  if (node.nodeType === NODE_TYPES.WINDOW && !node.nodeValue.minimized) {
    return true;
  }
  return false;
}

const TOPO_DESCRIPTORS = {
  split: {
    value: function topoSplit(node, orientation, forceSplit = false) {
      return treeSplit(this, node, orientation, forceSplit);
    },
    writable: true,
    configurable: true,
  },
  slotSplitUnit: {
    value: function topoSlotSplitUnit(unit, orientation) {
      return treeSlotSplitUnit(this, unit, orientation);
    },
    writable: true,
    configurable: true,
  },
  group: {
    value: function topoGroup(focusNode, partnerNode, layout, opts = {}) {
      return treeGroup(this, focusNode, partnerNode, layout, opts);
    },
    writable: true,
    configurable: true,
  },
  _resolveGroupLayout: {
    value: function topoResolveGroupLayout(layout, opts = {}) {
      return resolveGroupLayout(this, layout, opts);
    },
    writable: true,
    configurable: true,
  },
  removeNode: {
    value: function topoRemoveNode(node) {
      return treeRemoveNode(this, node);
    },
    writable: true,
    configurable: true,
  },
  _removeNodeGObject: {
    value: function topoRemoveNodeGObject(node) {
      return treeRemoveNodeGObject(this, node);
    },
    writable: true,
    configurable: true,
  },
  cleanTree: {
    value: function topoCleanTree() {
      return treeCleanTree(this);
    },
    writable: true,
    configurable: true,
  },
  _cleanTreeGObject: {
    value: function topoCleanTreeGObject() {
      return treeCleanTreeGObject(this);
    },
    writable: true,
    configurable: true,
  },
  swap: {
    value: function topoSwap(node, direction) {
      return treeSwap(this, node, direction);
    },
    writable: true,
    configurable: true,
  },
  swapPairs: {
    value: function topoSwapPairs(fromNode, toNode, focus = true) {
      return treeSwapPairs(this, fromNode, toNode, focus);
    },
    writable: true,
    configurable: true,
  },
  _swapPairsGObject: {
    value: function topoSwapPairsGObject(fromNode, toNode, focus = true) {
      return treeSwapPairsGObject(this, fromNode, toNode, focus);
    },
    writable: true,
    configurable: true,
  },
  _swappable: {
    value: function topoSwappable(node) {
      return treeSwappable(this, node);
    },
    writable: true,
    configurable: true,
  },
  _afterMergeGroup: {
    value: function topoAfterMergeGroup(group) {
      treeAfterMergeGroup(this, group);
    },
    writable: true,
    configurable: true,
  },
  insertWindowIntoGroup: {
    value: function topoInsertWindowIntoGroup(group, windowNode, insertIndex) {
      return treeInsertWindowIntoGroup(this, group, windowNode, insertIndex);
    },
    writable: true,
    configurable: true,
  },
  mergeWindowsIntoGroup: {
    value: function topoMergeWindowsIntoGroup(focusNode, partnerNode, layout, opts) {
      return treeMergeWindowsIntoGroup(this, focusNode, partnerNode, layout, opts);
    },
    writable: true,
    configurable: true,
  },
  _syncForestIfSeeded: {
    value: function topoSyncForestIfSeeded(op, reason) {
      syncForestIfSeeded(this, op, reason);
    },
    writable: true,
    configurable: true,
  },
  createNode: {
    value: function topoCreateNode(parentObj, type, value, mode) {
      return treeCreateNode(this, parentObj, type, value, mode);
    },
    writable: true,
    configurable: true,
  },
  ungroup: {
    value: function topoUngroup(node) {
      return treeUngroup(this, node);
    },
    writable: true,
    configurable: true,
  },
  _ungroupGObject: {
    value: function topoUngroupGObject(node) {
      return treeUngroupGObject(this, node);
    },
    writable: true,
    configurable: true,
  },
};

/** @param {any} root */
export function attachRootTopoApi(root) {
  Object.defineProperties(root, TOPO_DESCRIPTORS);
}
