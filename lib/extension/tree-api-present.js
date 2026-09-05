// @ts-check
/**
 * Present/render peel off class Tree (G8n-s5 start).
 * processNode/processGap already live in PresentChrome.
 */

import { Logger } from "../shared/logger.js";
import * as Utils from "./utils.js";
import { WINDOW_MODES } from "./window-modes.js";
import { LAYOUT_TYPES, NODE_TYPES } from "./tree-types.js";
import * as TreeLayout from "./tree-layout.js";
import * as PresentChrome from "./present-chrome.js";
import { zoomRect } from "./zoom.js";
import { forestRemoveWindow } from "./tom-live.js";
import * as TreeSnapshot from "./tree-snapshot.js";
import * as MonitorIdentity from "./monitor-identity.js";
import {
  captureForestFromTom,
  restoreWmForest,
  restoreWmForestIfNeeded,
} from "./forest-restore.js";

/** Names createLiveTree must not copy from Node/Tree.prototype. */
export const PRESENT_NAMES = new Set([
  "render",
  "apply",
  "paintRectForWindow",
  "pruneDeadWindows",
  "resetSiblingPercent",
  "insertChildPercent",
  "redistributeSiblingPercent",
  "getTiledChildren",
  "processNode",
  "processGap",
  "computeSizes",
  "stackedBarHeight",
  "tabPosition",
  "decorationLayout",
  "_decorationOnActiveWorkspace",
  "invalidateMinTabWidthCache",
  "measureMinTabWidth",
  "_tabTitleFontDesc",
  "_avgTabGlyphPx",
  "_tabChromePx",
  "applyMargins",
  "processSplit",
  "_applyDecorationRect",
  "_ensureTabRowHosts",
  "_ensureDecoration",
  "processStacked",
  "processTabbed",
  "snapshotTree",
  "restoreTree",
  "restoreTreeIfNeeded",
  "snapshotLayoutGroups",
  "_snapshotNode",
  "_hasStackedOrTabbedAncestor",
  "setLayout",
  "resetLayoutSingleChild",
  "singleOrNoChild",
  "_descriptorWindows",
  "_reorientOnClose",
  "_treeSnapshotCtx",
  "_rebuildGroup",
  "restoreLayoutGroups",
  "restoreLayoutGroupsIfUnwrapped",
]);

export function nodeSetLayout(node, layout, opts = {}) {
  if (!layout) return false;
  if (!node?.isCon?.() && !node?.isMonitor?.()) return false;
  const allowed =
    layout === LAYOUT_TYPES.HSPLIT ||
    layout === LAYOUT_TYPES.VSPLIT ||
    layout === LAYOUT_TYPES.TABBED ||
    layout === LAYOUT_TYPES.STACKED;
  if (!allowed) return false;
  node.layout = layout;
  if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocus")) {
    node.lastTabFocus = opts.lastTabFocus;
  }
  return true;
}

export function nodeSingleOrNoChild(node) {
  return (node?.childNodes?.length ?? 0) <= 1;
}

export function nodeResetLayoutSingleChild(node) {
  if (node?.isStackedOrTabbed?.() && nodeSingleOrNoChild(node)) {
    node.setLayout(LAYOUT_TYPES.HSPLIT);
  }
}

export function treeSetLayout(tree, con, layout, opts = {}) {
  if (!con || typeof con.setLayout !== "function") return false;
  if (!con.setLayout(layout, opts)) return false;
  const enteringBag = layout === LAYOUT_TYPES.TABBED || layout === LAYOUT_TYPES.STACKED;
  if (opts.resetPercents || enteringBag) {
    try {
      tree.resetSiblingPercent(con);
    } catch (_e) {
      /* best-effort */
    }
  }
  return true;
}

/** @param {any} _tree @param {any} descriptor */
export function treeDescriptorWindows(_tree, descriptor) {
  return TreeSnapshot.collectWindows(descriptor);
}

export function treeReorientOnClose(tree, parentNode) {
  if (!tree.settings?.get_boolean("auto-reorient-on-close")) return;
  if (!parentNode || parentNode.nodeType !== NODE_TYPES.CON) return;
  if (parentNode.layout !== LAYOUT_TYPES.HSPLIT && parentNode.layout !== LAYOUT_TYPES.VSPLIT) {
    return;
  }
  tree.setLayout(parentNode, tree.extWm.determineSplitLayoutForRect(parentNode.rect));
}

/**
 * Shared ctx for T6 restore. `createCon` stays on Tree (`new Node`) — invent.
 * @param {any} tree
 * @param {() => any} createCon
 */
export function treeSnapshotCtx(tree, createCon) {
  const hostBag = tree.extWm?.hostBag ?? null;
  return {
    findMonitor: (id) => tree.findNode(id),
    findNode: (key) => {
      const direct = tree.findNode(key);
      if (direct) return direct;
      if (hostBag && key != null && typeof key !== "object") {
        const entry = hostBag.get?.(String(key));
        if (entry?.meta) {
          const viaBag = tree.findNode(entry.meta);
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
            const viaMeta = tree.findNode(entry.meta);
            if (viaMeta) return viaMeta;
          }
        }
      }
      for (const n of tree.getNodeByType(NODE_TYPES.WINDOW)) {
        if (TreeSnapshot.windowIdFromMeta(n.nodeValue) === id) return n;
      }
      return null;
    },
    findMonitorByStableKey: (stableKey, monDescId) => {
      const liveMap =
        typeof tree.extWm?.getMonitorLiveMap === "function" ? tree.extWm.getMonitorLiveMap() : null;
      const id = MonitorIdentity.resolveMonWsIdByStableKey({ id: monDescId, stableKey }, liveMap);
      return id ? tree.findNode(id) : null;
    },
    createCon,
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

/** @param {any} tree @param {any} descriptor @param {Set<any>} cohortSet @param {() => any} createCon */
export function treeRebuildGroup(tree, descriptor, cohortSet, createCon) {
  return TreeSnapshot.rebuildNode(descriptor, {
    findNode: (win) => tree.findNode(win),
    cohortSet,
    createCon,
    tabbedLayout: LAYOUT_TYPES.TABBED,
  });
}

/** @param {any} tree */
export function snapshotTree(tree) {
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && wm.forest) {
    const fromTom = captureForestFromTom(wm);
    if (fromTom) return fromTom;
  }
  const liveMap = typeof wm?.getMonitorLiveMap === "function" ? wm.getMonitorLiveMap() : null;
  const hostBag = wm?.hostBag ?? null;
  return TreeSnapshot.captureForest(tree.getNodeByType(NODE_TYPES.MONITOR), {
    liveMap,
    hostBag,
  });
}

/** @param {any} tree @param {any} snapshot */
export function restoreTree(tree, snapshot) {
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && wm.forest && restoreWmForest(wm, snapshot)) return;
  TreeSnapshot.restoreForest(snapshot, tree._treeSnapshotCtx());
}

/** @param {any} node */
export function hasStackedOrTabbedAncestor(node) {
  let p = node?.parentNode;
  while (p && p.nodeType === NODE_TYPES.CON) {
    if (p.isStackedOrTabbed()) return true;
    p = p.parentNode;
  }
  return false;
}

/** @param {any} tree @param {any} node */
export function snapshotNode(tree, node) {
  return TreeSnapshot.captureNode(node, { hostBag: tree.extWm?.hostBag ?? null });
}

/** @param {any} tree */
export function snapshotLayoutGroups(tree) {
  const groups = [];
  for (const layout of [LAYOUT_TYPES.STACKED, LAYOUT_TYPES.TABBED]) {
    for (const con of tree.getNodeByLayout(layout)) {
      if (con.childNodes.length < 2) continue;
      if (hasStackedOrTabbedAncestor(con)) continue;
      groups.push(snapshotNode(tree, con));
    }
  }
  return groups;
}

/**
 * Re-apply STACKED/TABBED descriptors after a flat rebuild.
 * GObject lists; invent stays in `_snapshotCreateCon`.
 * @param {any} tree
 * @param {any[]} snapshot
 */
export function restoreLayoutGroups(tree, snapshot) {
  if (!snapshot || snapshot.length === 0) return;
  for (const descriptor of snapshot) {
    const winNodes = tree
      ._descriptorWindows(descriptor)
      .map((win) => tree.findNode(win))
      .filter((node) => node);
    if (winNodes.length < 2) continue;
    const parent = winNodes[0].parentNode;
    const cohort = winNodes.filter((node) => node.parentNode === parent);
    if (cohort.length < 2) continue;

    const insertIndex = Math.min(...cohort.map((node) => node.index));
    const cohortSet = new Set(cohort);
    const extraChildren = parent.childNodes.filter((c) => !cohortSet.has(c));
    const extrasBefore = extraChildren.filter((c) => c.index < insertIndex);
    const extrasAfter = extraChildren.filter((c) => c.index >= insertIndex);
    const rebuilt = tree._rebuildGroup(descriptor, cohortSet);
    if (!rebuilt || rebuilt.isWindow()) continue;

    parent.replaceChildren([...extrasBefore, rebuilt, ...extrasAfter]);
    const parentKids = parent.childNodes;
    const anyUser = parentKids.some((n) => n.userSized);
    if (!anyUser) {
      tree.resetSiblingPercent(parent);
    }
  }
}

/**
 * Monitor-recovery: rejoin or re-apply snapshot only for unwrapped groups.
 * @param {any} tree
 * @param {any[]} snapshot
 */
export function restoreLayoutGroupsIfUnwrapped(tree, snapshot) {
  if (!snapshot || snapshot.length === 0) return;
  const fullyFlat = [];
  for (const descriptor of snapshot) {
    const winNodes = tree
      ._descriptorWindows(descriptor)
      .map((win) => tree.findNode(win))
      .filter((node) => node);
    if (winNodes.length < 2) continue;

    const parent0 = winNodes[0].parentNode;
    const intact =
      parent0 &&
      parent0.isStackedOrTabbed() &&
      parent0.layout === descriptor.layout &&
      winNodes.every((n) => n.parentNode === parent0);
    if (intact) continue;

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
      tree.resetSiblingPercent(existing);
      continue;
    }

    fullyFlat.push(descriptor);
  }
  restoreLayoutGroups(tree, fullyFlat);
}

export function restoreTreeIfNeeded(tree, snapshot) {
  const wm = tree.extWm;
  if (wm?._liveForestSeeded && wm.forest && restoreWmForestIfNeeded(wm, snapshot)) return;
  TreeSnapshot.restoreForestIfNeeded(snapshot, tree._treeSnapshotCtx());
}

export function treeRender(tree, from) {
  Logger.trace(`render tree ${from ? "from " + from : ""}`);
  tree.processNode(tree);
  tree.apply(tree);
  if (tree.cleanTree()) {
    tree.processNode(tree);
    tree.apply(tree);
  }
  Logger.trace(`*********************************************`);
}

/**
 * @param {any} tree
 * @param {any} w
 */
export function paintRectForWindow(tree, w) {
  if (!w || w.isFloat?.()) return null;
  const slot = w.renderRect || w.rect;
  if (!w.zoomMode || !slot) return slot;
  const mon = tree.findAncestorMonitor(w);
  if (!mon?.rect) return slot;
  const gap = tree.extWm.calculateGaps(w);
  const workarea = TreeLayout.processGap({ rect: mon.rect }, gap);
  return zoomRect(slot, workarea, w.zoomMode);
}

/**
 * @param {any} tree
 * @param {any} node
 */
export function treeApply(tree, node) {
  if (!node) return;
  const wm = tree.extWm;
  wm?._suppressRehome?.enter();
  wm?._suppressGeom?.enter();
  try {
    let tiledChildren = node
      .getNodeByMode(WINDOW_MODES.TILE)
      .filter(
        (t) =>
          t.nodeType === NODE_TYPES.WINDOW &&
          !t.isPlaceholder() &&
          !(t.nodeValue.is_fullscreen && t.nodeValue.is_fullscreen()) &&
          (t.zoomMode || t.nodeValue.firstRender || !tree.extWm._isLoneMaximizedTile(t))
      );
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
          const dest = paintRectForWindow(tree, w);
          tree.extWm.move(metaWin, dest);
          if (w.zoomMode) {
            try {
              metaWin.raise();
            } catch (_e) {
              /* disposed */
            }
          }
        } else {
          Logger.debug(`ignoring apply for ${w.renderRect.width}x${w.renderRect.height}`);
          return;
        }
      } else if (w.nodeValue.firstRender) {
        return;
      }

      if (w.nodeValue.firstRender) w.nodeValue.firstRender = false;
    });
  } finally {
    wm?._suppressGeom?.leave();
    wm?._suppressRehome?.leave();
  }
}

/** @param {any} tree */
/** @param {any} parentNode */
export function resetSiblingPercent(parentNode) {
  TreeLayout.resetSiblingPercent(parentNode);
}

/** @param {any} tree @param {any} parentNode @param {any} newChild */
export function insertChildPercent(tree, parentNode, newChild) {
  if (!parentNode || !newChild) return;
  const existing = PresentChrome.getTiledChildren(tree, parentNode.childNodes).filter(
    (n) => n !== newChild
  );
  let policy = "preserve";
  try {
    const raw = tree.settings?.get_string?.("new-window-size-policy");
    if (raw === "equalize" || raw === "preserve") policy = raw;
  } catch (_e) {
    /* settings unavailable in some unit fixtures */
  }
  TreeLayout.insertChildPercent(existing, newChild, policy);
}

/** @param {any} parentNode */
export function redistributeSiblingPercent(parentNode) {
  TreeLayout.redistributeSiblingPercent(parentNode);
}

export function pruneDeadWindows(tree) {
  const dead = tree
    .getNodeByType(NODE_TYPES.WINDOW)
    .filter((w) => !w.isPlaceholder() && !Utils.isWindowAlive(w.nodeValue));
  const wm = tree.extWm;
  for (const w of dead) {
    if (wm?._liveForestSeeded) {
      try {
        forestRemoveWindow(wm, w);
      } catch (_e) {
        /* finalized Meta */
      }
    }
    tree.removeNode(w);
  }
  if (dead.length > 0) Logger.warn(`pruned ${dead.length} dead window node(s)`);
}

const PRESENT_DESCRIPTORS = {
  render: {
    value: function presentRender(from) {
      return treeRender(this, from);
    },
    writable: true,
    configurable: true,
  },
  apply: {
    value: function presentApply(node) {
      return treeApply(this, node);
    },
    writable: true,
    configurable: true,
  },
  paintRectForWindow: {
    value: function presentPaintRectForWindow(w) {
      return paintRectForWindow(this, w);
    },
    writable: true,
    configurable: true,
  },
  pruneDeadWindows: {
    value: function presentPruneDeadWindows() {
      return pruneDeadWindows(this);
    },
    writable: true,
    configurable: true,
  },
  resetSiblingPercent: {
    value: function presentResetSiblingPercent(parentNode) {
      return resetSiblingPercent(parentNode);
    },
    writable: true,
    configurable: true,
  },
  insertChildPercent: {
    value: function presentInsertChildPercent(parentNode, newChild) {
      return insertChildPercent(this, parentNode, newChild);
    },
    writable: true,
    configurable: true,
  },
  redistributeSiblingPercent: {
    value: function presentRedistributeSiblingPercent(parentNode) {
      return redistributeSiblingPercent(parentNode);
    },
    writable: true,
    configurable: true,
  },
  getTiledChildren: {
    value: function presentGetTiledChildren(items) {
      return PresentChrome.getTiledChildren(this, items);
    },
    writable: true,
    configurable: true,
  },
  processNode: {
    value: function presentProcessNode(node) {
      return PresentChrome.processNode(this, node);
    },
    writable: true,
    configurable: true,
  },
  processGap: {
    value: function presentProcessGap(node) {
      return PresentChrome.processGap(this, node);
    },
    writable: true,
    configurable: true,
  },
  computeSizes: {
    value: function presentComputeSizes(node, childItems) {
      return PresentChrome.computeSizes(this, node, childItems);
    },
    writable: true,
    configurable: true,
  },
  stackedBarHeight: {
    value: function presentStackedBarHeight() {
      return PresentChrome.stackedBarHeight(this);
    },
    writable: true,
    configurable: true,
  },
  tabPosition: {
    value: function presentTabPosition() {
      return PresentChrome.tabPosition(this);
    },
    writable: true,
    configurable: true,
  },
  decorationLayout: {
    value: function presentDecorationLayout(rectY, height, barSize, position) {
      return PresentChrome.decorationLayout(rectY, height, barSize, position);
    },
    writable: true,
    configurable: true,
  },
  _decorationOnActiveWorkspace: {
    value: function presentDecorationOnActiveWorkspace(node) {
      return PresentChrome.decorationOnActiveWorkspace(this, node);
    },
    writable: true,
    configurable: true,
  },
  invalidateMinTabWidthCache: {
    value: function presentInvalidateMinTabWidthCache() {
      return PresentChrome.invalidateMinTabWidthCache(this);
    },
    writable: true,
    configurable: true,
  },
  measureMinTabWidth: {
    value: function presentMeasureMinTabWidth(opts = {}) {
      return PresentChrome.measureMinTabWidth(this, opts);
    },
    writable: true,
    configurable: true,
  },
  _tabTitleFontDesc: {
    value: function presentTabTitleFontDesc() {
      return PresentChrome.tabTitleFontDesc(this);
    },
    writable: true,
    configurable: true,
  },
  _avgTabGlyphPx: {
    value: function presentAvgTabGlyphPx(minChars, scale, fontDesc) {
      return PresentChrome.avgTabGlyphPx(this, minChars, scale, fontDesc);
    },
    writable: true,
    configurable: true,
  },
  _tabChromePx: {
    value: function presentTabChromePx(scale) {
      return PresentChrome.tabChromePx(this, scale);
    },
    writable: true,
    configurable: true,
  },
  applyMargins: {
    value: function presentApplyMargins(rect) {
      return PresentChrome.applyMargins(this, rect);
    },
    writable: true,
    configurable: true,
  },
  processSplit: {
    value: function presentProcessSplit(node, child, params, index) {
      return PresentChrome.processSplit(this, node, child, params, index);
    },
    writable: true,
    configurable: true,
  },
  _applyDecorationRect: {
    value: function presentApplyDecorationRect(
      node,
      child,
      params,
      barSize,
      tabExpand,
      tabHost = null
    ) {
      return PresentChrome.applyDecorationRect(
        this,
        node,
        child,
        params,
        barSize,
        tabExpand,
        tabHost
      );
    },
    writable: true,
    configurable: true,
  },
  _ensureTabRowHosts: {
    value: function presentEnsureTabRowHosts(node, rowCount) {
      return PresentChrome.ensureTabRowHosts(this, node, rowCount);
    },
    writable: true,
    configurable: true,
  },
  _ensureDecoration: {
    value: function presentEnsureDecoration(node, orientation) {
      return PresentChrome.ensureDecoration(this, node, orientation);
    },
    writable: true,
    configurable: true,
  },
  processStacked: {
    value: function presentProcessStacked(node, child, params, index) {
      return PresentChrome.processStacked(this, node, child, params, index);
    },
    writable: true,
    configurable: true,
  },
  processTabbed: {
    value: function presentProcessTabbed(node, child, params, index) {
      return PresentChrome.processTabbed(this, node, child, params, index);
    },
    writable: true,
    configurable: true,
  },
  snapshotTree: {
    value: function presentSnapshotTree() {
      return snapshotTree(this);
    },
    writable: true,
    configurable: true,
  },
  restoreTree: {
    value: function presentRestoreTree(snapshot) {
      return restoreTree(this, snapshot);
    },
    writable: true,
    configurable: true,
  },
  restoreTreeIfNeeded: {
    value: function presentRestoreTreeIfNeeded(snapshot) {
      return restoreTreeIfNeeded(this, snapshot);
    },
    writable: true,
    configurable: true,
  },
  snapshotLayoutGroups: {
    value: function presentSnapshotLayoutGroups() {
      return snapshotLayoutGroups(this);
    },
    writable: true,
    configurable: true,
  },
  _snapshotNode: {
    value: function presentSnapshotNode(node) {
      return snapshotNode(this, node);
    },
    writable: true,
    configurable: true,
  },
  _hasStackedOrTabbedAncestor: {
    value: function presentHasStackedOrTabbedAncestor(node) {
      return hasStackedOrTabbedAncestor(node);
    },
    writable: true,
    configurable: true,
  },
  setLayout: {
    value: function presentSetLayout(con, layout, opts) {
      return treeSetLayout(this, con, layout, opts);
    },
    writable: true,
    configurable: true,
  },
  resetLayoutSingleChild: {
    value: function presentResetLayoutSingleChild() {
      nodeResetLayoutSingleChild(this);
    },
    writable: true,
    configurable: true,
  },
  singleOrNoChild: {
    value: function presentSingleOrNoChild() {
      return nodeSingleOrNoChild(this);
    },
    writable: true,
    configurable: true,
  },
  _descriptorWindows: {
    value: function presentDescriptorWindows(descriptor) {
      return treeDescriptorWindows(this, descriptor);
    },
    writable: true,
    configurable: true,
  },
  _reorientOnClose: {
    value: function presentReorientOnClose(parentNode) {
      treeReorientOnClose(this, parentNode);
    },
    writable: true,
    configurable: true,
  },
  _treeSnapshotCtx: {
    value: function presentTreeSnapshotCtx() {
      return treeSnapshotCtx(this, () => this._snapshotCreateCon());
    },
    writable: true,
    configurable: true,
  },
  _rebuildGroup: {
    value: function presentRebuildGroup(descriptor, cohortSet) {
      return treeRebuildGroup(this, descriptor, cohortSet, () => this._snapshotCreateCon());
    },
    writable: true,
    configurable: true,
  },
  restoreLayoutGroups: {
    value: function presentRestoreLayoutGroups(snapshot) {
      restoreLayoutGroups(this, snapshot);
    },
    writable: true,
    configurable: true,
  },
  restoreLayoutGroupsIfUnwrapped: {
    value: function presentRestoreLayoutGroupsIfUnwrapped(snapshot) {
      restoreLayoutGroupsIfUnwrapped(this, snapshot);
    },
    writable: true,
    configurable: true,
  },
};

/** @param {any} root */
export function attachRootPresentApi(root) {
  Object.defineProperties(root, PRESENT_DESCRIPTORS);
}
