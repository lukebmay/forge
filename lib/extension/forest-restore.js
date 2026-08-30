// @ts-check
/**
 * Session / H1 restore: mutate live Forest, then paint chrome.
 */

import {
  ancestorMonitor,
  appendChild,
  children,
  destroyNode,
  isUnder,
  makeCon,
  registerTree,
  replaceChildren,
  tilesOf,
} from "../tom/index.js";
import { nanoid as nid } from "../tom/nanoid.js";
import {
  collectWindowIds,
  isWindowDescriptor,
  renormalizeChildPercents,
  SNAPSHOT_VERSION,
  topologyEqual,
} from "../epochs/index.js";
import * as MonitorIdentity from "./monitor-identity.js";
import { resolveStrictMonitor } from "./session-layout.js";
import { portableWindowKeys } from "./tree-snapshot.js";
import { ensureLiveForest, paintWmForest } from "./tom-live.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} TomNode */

/** @param {any} desc */
function isWinShape(desc) {
  if (!desc || typeof desc !== "object") return false;
  if (Array.isArray(desc.children) && desc.children.length) return false;
  if (desc.kind === "CON" || desc.kind === "MONITOR" || desc.kind === "WORKSPACE") return false;
  if (desc.kind === "WINDOW") return true;
  if (isWindowDescriptor(desc)) return true;
  if (desc.window != null) return true;
  if ((desc.windowId != null && desc.windowId !== "") || (desc.id != null && desc.id !== "")) {
    return !Array.isArray(desc.children);
  }
  return false;
}

/**
 * @param {any} wm
 * @param {any} desc
 * @returns {string|null}
 */
export function forestFindWindowId(wm, desc) {
  const forest = wm?.forest;
  if (!desc || !forest?.nodes) return null;
  const bag = wm.hostBag;
  const tryId = (raw) => {
    if (raw == null || raw === "") return null;
    const s = String(raw);
    if (forest.nodes[s]?.kind === "WINDOW") return s;
    const fromBag = bag?.idFromWindowId?.(s);
    if (fromBag && forest.nodes[fromBag]?.kind === "WINDOW") return fromBag;
    return null;
  };
  const fromDoc = tryId(desc.windowId) || tryId(desc.id);
  if (fromDoc) return fromDoc;
  const meta = desc.window;
  if (meta && typeof meta === "object") {
    const fromMeta = bag?.idFromMeta?.(meta);
    if (fromMeta && forest.nodes[fromMeta]?.kind === "WINDOW") return fromMeta;
    try {
      if (typeof meta.get_id === "function") {
        const hit = tryId(meta.get_id());
        if (hit) return hit;
      }
    } catch (_e) {
      /* disposed */
    }
    if (meta.id != null) {
      const hit = tryId(meta.id);
      if (hit) return hit;
    }
  }
  return tryId(desc.metaWindowId);
}

/**
 * @param {any} wm
 * @param {any} descriptor
 * @returns {string[]}
 */
function collectForestWindowIds(wm, descriptor) {
  if (!descriptor) return [];
  if (Array.isArray(descriptor.monitors)) {
    return descriptor.monitors.flatMap((m) => collectForestWindowIds(wm, m));
  }
  if (isWinShape(descriptor)) {
    const id = forestFindWindowId(wm, descriptor);
    return id ? [id] : [];
  }
  const fromKids = (descriptor.children || []).flatMap((c) => collectForestWindowIds(wm, c));
  if (fromKids.length) return fromKids;
  return collectWindowIds(descriptor).map((id) => forestFindWindowId(wm, { windowId: id }) || id);
}

/** @param {Forest} forest @param {TomNode} root */
function forestWindowsUnder(forest, root) {
  /** @type {TomNode[]} */
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.kind === "WINDOW") {
      out.push(n);
      return;
    }
    for (const c of children(forest, n)) walk(c);
  };
  walk(root);
  return out;
}

/** @param {Forest} forest @param {TomNode} node @param {TomNode} mon */
function forestMonLevelChild(forest, node, mon) {
  let p = node;
  while (p && p.parentId && p.parentId !== mon.id) {
    p = forest.nodes[p.parentId];
  }
  if (!p || p.parentId !== mon.id) return null;
  return p;
}

/** @param {any} wm @returns {boolean} */
function forestSeeded(wm) {
  return !!(wm?._liveForestSeeded && wm.forest?.nodes);
}

/**
 * @param {any} wm
 * @param {string|null|undefined} id
 * @returns {TomNode|null}
 */
export function forestFindMonitor(wm, id) {
  if (!id) return null;
  const n = wm?.forest?.nodes?.[id];
  return n?.kind === "MONITOR" ? n : null;
}

/**
 * @param {any} wm
 * @param {string} stableKey
 * @param {string} [monDescId]
 * @returns {TomNode|null}
 */
function forestFindMonitorByStableKey(wm, stableKey, monDescId) {
  const liveMap =
    (typeof wm?.getMonitorLiveMap === "function" ? wm.getMonitorLiveMap() : null) ||
    wm?._monitorLiveMap ||
    null;
  const id = MonitorIdentity.resolveMonWsIdByStableKey({ id: monDescId, stableKey }, liveMap);
  return id ? forestFindMonitor(wm, id) : null;
}

/**
 * @param {any} wm
 * @param {any} monDesc
 * @returns {TomNode|null}
 */
export function forestResolveStrictMonitor(wm, monDesc) {
  if (!forestSeeded(wm) || !monDesc) return null;
  return resolveStrictMonitor(monDesc, {
    findMonitor: (id) => forestFindMonitor(wm, id),
    findMonitorByStableKey: (stableKey, monDescId) =>
      forestFindMonitorByStableKey(wm, stableKey, monDescId),
  });
}

/**
 * H1 dest: preferred survivors → stableKey → majority (do not merge with strict).
 * @param {any} wm
 * @param {any} monDesc
 * @returns {TomNode|null}
 */
export function forestResolveTargetMonitor(wm, monDesc) {
  if (!forestSeeded(wm) || !monDesc) return null;
  const forest = wm.forest;
  const preferred = monDesc.id ? forestFindMonitor(wm, monDesc.id) : null;
  let byStable = null;
  if (monDesc.stableKey) {
    byStable = forestFindMonitorByStableKey(wm, monDesc.stableKey, monDesc.id);
  }
  const ids = collectForestWindowIds(wm, monDesc);
  const nodes = ids.map((id) => forest.nodes[id]).filter((n) => n?.kind === "WINDOW");
  if (nodes.length === 0) return byStable || preferred;

  const counts = new Map();
  for (const n of nodes) {
    const mon = ancestorMonitor(forest, n);
    if (!mon) continue;
    counts.set(mon, (counts.get(mon) || 0) + 1);
  }
  let majority = null;
  let best = 0;
  for (const [mon, count] of counts) {
    if (count > best) {
      majority = mon;
      best = count;
    }
  }

  if (preferred) {
    const onPreferred = nodes.filter((n) => isUnder(forest, n, preferred)).length;
    if (onPreferred > 0 && onPreferred >= best) {
      if (byStable && byStable !== preferred) {
        const onStable = nodes.filter((n) => isUnder(forest, n, byStable)).length;
        if (onStable > onPreferred) return byStable;
      }
      return preferred;
    }
  }
  if (byStable) {
    const onStable = nodes.filter((n) => isUnder(forest, n, byStable)).length;
    if (onStable > 0 || best === 0) return byStable;
  }
  return majority || byStable || preferred;
}

/** @param {Forest} forest @param {TomNode} node */
function forestLiveTopology(forest, node) {
  if (!node) return null;
  if (node.kind === "WINDOW") return { w: true, ref: node.id };
  return {
    w: false,
    layout: node.layout,
    children: children(forest, node).map((c) => forestLiveTopology(forest, c)),
  };
}

/**
 * @param {any} wm
 * @param {any} descriptor
 * @param {(n: TomNode) => boolean} underMon
 */
function forestExpectedTopology(wm, descriptor, underMon) {
  if (!descriptor || !wm?.forest) return null;
  if (isWinShape(descriptor)) {
    const id = forestFindWindowId(wm, descriptor);
    if (!id) return null;
    const n = wm.forest.nodes[id];
    if (!n || !underMon(n)) return null;
    return { w: true, ref: id };
  }
  const kids = (descriptor.children || [])
    .map((c) => forestExpectedTopology(wm, c, underMon))
    .filter(Boolean);
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  return { w: false, layout: descriptor.layout, children: kids };
}

/**
 * @param {any} wm
 * @param {TomNode} mon
 * @param {any} monDesc
 */
function forestMonitorTopologyMatches(wm, mon, monDesc) {
  if (!mon || !monDesc || !wm?.forest) return false;
  const forest = wm.forest;
  const underMon = (n) => isUnder(forest, n, mon);
  const expectedChildren = (monDesc.children || [])
    .map((c) => forestExpectedTopology(wm, c, underMon))
    .filter(Boolean);
  const liveChildren = children(forest, mon).map((c) => forestLiveTopology(forest, c));
  if (expectedChildren.length !== liveChildren.length) return false;
  if (monDesc.layout && mon.layout && monDesc.layout !== mon.layout) return false;
  for (let i = 0; i < expectedChildren.length; i++) {
    if (!topologyEqual(expectedChildren[i], liveChildren[i])) return false;
  }
  return true;
}

/**
 * @param {any} wm
 * @param {any} descriptor
 * @param {Set<TomNode>} cohortSet
 * @returns {TomNode|null}
 */
function forestRebuildNode(wm, descriptor, cohortSet) {
  const forest = wm.forest;
  if (!descriptor || !forest) return null;
  if (isWinShape(descriptor)) {
    const id = forestFindWindowId(wm, descriptor);
    const node = id ? forest.nodes[id] : null;
    if (!node || !cohortSet.has(node)) return null;
    node.percent = descriptor.percent ?? 0;
    node.userSized = !!descriptor.userSized;
    return node;
  }
  const kids = (descriptor.children || [])
    .map((c) => forestRebuildNode(wm, c, cohortSet))
    .filter(Boolean);
  if (kids.length === 0) return null;
  if (kids.length === 1) {
    const only = kids[0];
    only.percent = descriptor.percent ?? 0;
    only.userSized = !!descriptor.userSized;
    return only;
  }
  const con = makeCon(() => nid(), descriptor.layout || "HSPLIT");
  registerTree(forest, con);
  con.percent = descriptor.percent ?? 0;
  con.userSized = !!descriptor.userSized;
  for (const k of kids) appendChild(forest, con, k);
  renormalizeChildPercents(kids);
  const isTabOrStack = descriptor.layout === "TABBED" || descriptor.layout === "STACKED";
  if (isTabOrStack || descriptor.lastTabFocusId != null || descriptor.lastTabFocus != null) {
    const fid =
      forestFindWindowId(wm, {
        windowId: descriptor.lastTabFocusId,
        window: descriptor.lastTabFocus,
      }) || kids[0]?.id;
    if (fid) con.lastTabFocusId = fid;
  }
  return con;
}

/**
 * @param {any} wm
 * @param {TomNode} liveNode
 * @param {any} descriptor
 */
function forestApplyPercentsByWindows(wm, liveNode, descriptor) {
  const forest = wm.forest;
  if (!liveNode || !descriptor || !forest) return;
  if (isWinShape(descriptor)) {
    if (liveNode.kind === "WINDOW" && forestFindWindowId(wm, descriptor) === liveNode.id) {
      liveNode.percent = descriptor.percent ?? 0;
      liveNode.userSized = !!descriptor.userSized;
    }
    return;
  }
  if (liveNode.kind === "WINDOW") {
    const ids = collectForestWindowIds(wm, descriptor);
    if (ids.length === 1 && ids[0] === liveNode.id) {
      liveNode.percent = descriptor.percent ?? 0;
      liveNode.userSized = !!descriptor.userSized;
    }
    return;
  }
  if (liveNode.kind === "CON") {
    liveNode.percent = descriptor.percent ?? 0;
    liveNode.userSized = !!descriptor.userSized;
    if (descriptor.lastTabFocusId != null || descriptor.lastTabFocus != null) {
      const fid = forestFindWindowId(wm, {
        windowId: descriptor.lastTabFocusId,
        window: descriptor.lastTabFocus,
      });
      if (fid && liveNode.childIds.includes(fid)) liveNode.lastTabFocusId = fid;
    }
  }
  const descs = descriptor.children || [];
  for (const liveChild of children(forest, liveNode)) {
    const liveIds = new Set(forestWindowsUnder(forest, liveChild).map((w) => w.id));
    const match = descs.find((d) => collectForestWindowIds(wm, d).some((id) => liveIds.has(id)));
    if (match) forestApplyPercentsByWindows(wm, liveChild, match);
  }
}

/**
 * @param {any} wm
 * @param {TomNode} mon
 * @param {any} monDesc
 */
function forestApplyMonitorPercents(wm, mon, monDesc) {
  if (!mon || !monDesc || !wm?.forest) return;
  for (const childDesc of monDesc.children || []) {
    const ids = collectForestWindowIds(wm, childDesc);
    if (ids.length === 0) continue;
    const idSet = new Set(ids);
    const liveChild = children(wm.forest, mon).find((c) =>
      forestWindowsUnder(wm.forest, c).some((w) => idSet.has(w.id))
    );
    if (liveChild) forestApplyPercentsByWindows(wm, liveChild, childDesc);
  }
}

/** @param {Forest} forest @param {TomNode} root */
function forestPruneEmptyCons(forest, root) {
  if (!root) return;
  /** @type {TomNode[]} */
  const empties = [];
  const walk = (n) => {
    if (!n) return;
    for (const c of children(forest, n)) walk(c);
    if (n.kind === "CON" && n.childIds.length === 0) empties.push(n);
  };
  walk(root);
  for (const e of empties) {
    if (e.parentId && forest.nodes[e.parentId]) destroyNode(forest, e.id);
    else delete forest.nodes[e.id];
  }
}

/** Drop CON nodes no longer reachable from TILES / FLOATS. */
function forestDropOrphanCons(forest) {
  const keep = new Set();
  const mark = (n) => {
    if (!n || keep.has(n.id)) return;
    keep.add(n.id);
    for (const cid of n.childIds || []) mark(forest.nodes[cid]);
  };
  const tiles = tilesOf(forest);
  if (tiles) mark(tiles);
  if (forest.nodes.FLOATS) mark(forest.nodes.FLOATS);
  if (forest.nodes.META) keep.add("META");
  for (const id of Object.keys(forest.nodes)) {
    if (keep.has(id)) continue;
    if (forest.nodes[id]?.kind === "CON") delete forest.nodes[id];
  }
}

/**
 * Apply one T6 monitor descriptor onto a Forest MONITOR.
 * @param {any} wm
 * @param {TomNode} mon
 * @param {any} monDesc
 * @returns {boolean}
 */
export function forestApplyMonitorSnapshot(wm, mon, monDesc) {
  const forest = wm?.forest;
  if (!forest || !mon || mon.kind !== "MONITOR" || !monDesc) return false;

  const allIds = collectForestWindowIds(wm, monDesc);
  /** @type {TomNode[]} */
  const cohort = [];
  for (const id of allIds) {
    const n = forest.nodes[id];
    if (n?.kind === "WINDOW" && isUnder(forest, n, mon)) cohort.push(n);
  }
  if (cohort.length === 0) return false;

  const cohortSet = new Set(cohort);
  const snapWinSet = new Set(allIds);
  const monWins = forestWindowsUnder(forest, mon);
  const extras = monWins.filter((n) => !snapWinSet.has(n.id));
  const monIsPureCohort = extras.length === 0;

  const insertIndex = Math.min(
    ...cohort.map((n) => {
      const child = forestMonLevelChild(forest, n, mon);
      const i = child ? mon.childIds.indexOf(child.id) : -1;
      return i >= 0 ? i : mon.childIds.length;
    })
  );
  /** @type {{ node: TomNode, index: number }[]} */
  const extraPlacements = [];
  const extraSeen = new Set();
  for (const e of extras) {
    const child = forestMonLevelChild(forest, e, mon);
    if (!child || extraSeen.has(child.id)) continue;
    extraSeen.add(child.id);
    extraPlacements.push({ node: child, index: mon.childIds.indexOf(child.id) });
  }
  const extrasBefore = extraPlacements.filter((p) => p.index < insertIndex).map((p) => p.node);
  const extrasAfter = extraPlacements.filter((p) => p.index >= insertIndex).map((p) => p.node);

  const rebuilt = [];
  for (const childDesc of monDesc.children || []) {
    const node = forestRebuildNode(wm, childDesc, cohortSet);
    if (node) rebuilt.push(node);
  }
  if (rebuilt.length === 0) return false;
  renormalizeChildPercents(rebuilt);
  if (monDesc.layout) mon.layout = monDesc.layout;
  const next = monIsPureCohort ? rebuilt : [...extrasBefore, ...rebuilt, ...extrasAfter];
  replaceChildren(forest, mon, next);
  forestPruneEmptyCons(forest, mon);
  forestDropOrphanCons(forest);
  return true;
}

/**
 * @param {any} wm
 * @param {any} snapshot
 * @param {{ strict?: boolean }} [opts]
 * @returns {boolean}
 */
function forestRestoreMonitors(wm, snapshot, opts = {}) {
  if (!forestSeeded(wm) || !snapshot?.monitors?.length) return false;
  const forest = ensureLiveForest(wm);
  if (!forest) return false;
  let any = false;
  for (const monDesc of snapshot.monitors) {
    const preferred = monDesc.id ? forestFindMonitor(wm, monDesc.id) : null;
    const mon = opts.strict
      ? forestResolveStrictMonitor(wm, monDesc)
      : forestResolveTargetMonitor(wm, monDesc);
    if (!mon) continue;
    if (!opts.strict && forestMonitorTopologyMatches(wm, mon, monDesc)) {
      forestApplyMonitorPercents(wm, mon, monDesc);
      any = true;
      continue;
    }
    if (forestApplyMonitorSnapshot(wm, mon, monDesc)) any = true;
    forestPruneEmptyCons(forest, mon);
    if (preferred && preferred !== mon) forestPruneEmptyCons(forest, preferred);
  }
  forestDropOrphanCons(forest);
  return any;
}

/**
 * Force-rebuild Forest from a T6 snapshot, then paint.
 * @param {any} wm
 * @param {any} snapshot
 * @returns {boolean}
 */
export function restoreWmForest(wm, snapshot) {
  if (!forestRestoreMonitors(wm, snapshot, { strict: false })) return false;
  return paintWmForest(wm);
}

/**
 * Rebuild diverged monitors; intact monitors get percents only. Then paint.
 * @param {any} wm
 * @param {any} snapshot
 * @returns {boolean}
 */
export function restoreWmForestIfNeeded(wm, snapshot) {
  if (!forestSeeded(wm) || !snapshot?.monitors?.length) return false;
  forestRestoreMonitors(wm, snapshot, { strict: false });
  return paintWmForest(wm);
}

/**
 * Session restore: strict mon resolve (no majority pile remap), then paint.
 * @param {any} wm
 * @param {any} liveForest
 * @returns {boolean}
 */
export function restoreWmForestStrict(wm, liveForest) {
  if (!forestRestoreMonitors(wm, liveForest, { strict: true })) return false;
  return paintWmForest(wm);
}

/**
 * Reparent Forest WINDOWs onto planned MONITOR (Meta move is host).
 * @param {any} wm
 * @param {{ window: any, monIndex: number, monId: string }[]} homes
 * @param {any} liveForest
 * @returns {boolean}
 */
export function rehomeWmForestWindows(wm, homes, liveForest) {
  if (!forestSeeded(wm) || !Array.isArray(homes)) return false;
  const forest = ensureLiveForest(wm);
  if (!forest) return false;
  let any = false;
  for (const home of homes) {
    const meta = home?.window;
    const winId =
      (meta && wm.hostBag?.idFromMeta?.(meta)) || forestFindWindowId(wm, { window: meta });
    const win = winId ? forest.nodes[winId] : null;
    if (!win || win.kind !== "WINDOW") continue;
    const monDesc = (liveForest?.monitors || []).find((m) => m.id === home.monId) || {
      id: home.monId,
    };
    const mon = forestResolveStrictMonitor(wm, monDesc) || forestFindMonitor(wm, home.monId);
    if (!mon) continue;
    if (isUnder(forest, win, mon)) continue;
    appendChild(forest, mon, win);
    any = true;
  }
  if (any) paintWmForest(wm);
  return any;
}

/** @param {Forest} forest */
function forestMonitorList(forest) {
  /** @type {TomNode[]} */
  const out = [];
  const seen = new Set();
  for (const m of forest.monitors || []) {
    const n = m?.id ? forest.nodes[m.id] : m;
    if (n?.kind === "MONITOR" && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  for (const n of Object.values(forest.nodes || {})) {
    if (n?.kind === "MONITOR" && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}

/**
 * T6 snapshot from live Forest (WINDOW id = nanoid).
 * @param {any} wm
 * @returns {{ version: number, monitors: object[] }|null}
 */
export function captureForestFromTom(wm) {
  const forest = wm?.forest;
  if (!forest?.nodes) return null;
  const liveMap =
    (typeof wm.getMonitorLiveMap === "function" ? wm.getMonitorLiveMap() : null) ||
    wm._monitorLiveMap ||
    null;
  const monitors = [];
  for (const mon of forestMonitorList(forest)) {
    if (!forestWindowsUnder(forest, mon).length) continue;
    const desc = captureTomMonitor(wm, forest, mon, liveMap);
    if (desc) monitors.push(desc);
  }
  if (!monitors.length) return null;
  return { version: SNAPSHOT_VERSION, monitors };
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {TomNode} node
 */
function captureTomNode(wm, forest, node) {
  if (!node) return null;
  if (node.kind === "WINDOW") {
    const entry = wm.hostBag?.get?.(node.id);
    const meta = entry?.meta;
    const keys = portableWindowKeys(meta, wm.hostBag);
    const out = {
      kind: "WINDOW",
      windowId: node.id,
      percent: node.percent ?? 0,
      userSized: !!node.userSized,
    };
    const metaId = keys.metaWindowId ?? entry?.windowId ?? null;
    if (metaId != null && String(metaId) !== String(node.id)) out.metaWindowId = metaId;
    if (meta != null) out.window = meta;
    return out;
  }
  if (node.kind !== "CON" && node.kind !== "MONITOR") return null;
  const out = {
    kind: "CON",
    layout: node.layout,
    percent: node.percent ?? 0,
    userSized: !!node.userSized,
    children: children(forest, node)
      .map((c) => captureTomNode(wm, forest, c))
      .filter(Boolean),
  };
  if (node.lastTabFocusId) {
    out.lastTabFocusId = node.lastTabFocusId;
    const focusMeta = wm.hostBag?.get?.(node.lastTabFocusId)?.meta;
    if (focusMeta != null) out.lastTabFocus = focusMeta;
  }
  return out;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {TomNode} mon
 * @param {import('./monitor-identity.js').LiveMap|null} liveMap
 */
function captureTomMonitor(wm, forest, mon, liveMap) {
  const out = {
    id: mon.id,
    layout: mon.layout,
    children: children(forest, mon)
      .map((c) => captureTomNode(wm, forest, c))
      .filter(Boolean),
  };
  if (liveMap?.byIndex) {
    const idx = MonitorIdentity.monIndexFromId(mon.id);
    const key = idx >= 0 ? liveMap.byIndex.get(idx) : undefined;
    if (key) out.stableKey = key;
  }
  return out.children.length ? out : null;
}

/**
 * Mon-loss: append dead MONITOR children onto survivor, then paint.
 * @param {any} wm
 * @param {string} deadMonId
 * @param {string} survivorMonId
 * @returns {boolean}
 */
export function forestCollectMonLoss(wm, deadMonId, survivorMonId) {
  if (!forestSeeded(wm)) return false;
  const forest = ensureLiveForest(wm);
  if (!forest) return false;
  const dead = forestFindMonitor(wm, deadMonId);
  const survivor = forestFindMonitor(wm, survivorMonId);
  if (!dead || !survivor || dead.id === survivor.id) return false;
  const kids = children(forest, dead);
  if (kids.length === 0) return false;
  if (kids.length === 1) {
    appendChild(forest, survivor, kids[0]);
  } else {
    const con = makeCon(() => nid(), survivor.layout || "HSPLIT");
    registerTree(forest, con);
    appendChild(forest, survivor, con);
    for (const c of kids) appendChild(forest, con, c);
  }
  return paintWmForest(wm);
}
