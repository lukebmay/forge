/*
 * This file is part of the Forge extension for GNOME
 *
 * Full in-memory tiling-tree snapshot / restore (T6).
 * Pure helpers — unit-testable without Mutter. Tree thin-wraps createCon.
 *
 * Descriptor schema version 1 (in-memory only; disk is workon later):
 *   Forest:  { version: 1, monitors: MonitorDesc[] }
 *   Monitor: { id: "moNwsW", stableKey?, layout, children: NodeDesc[] }
 *   CON:     { layout, percent, userSized, lastTabFocus?, children: NodeDesc[] }
 *   WINDOW:  { window: Meta.Window, percent, userSized }
 *
 * T7: optional stableKey on mon descriptors; resolveTargetMonitor prefers it
 * when moN index is stale (see monitor-identity.js).
 */

import * as MonitorIdentity from "./monitor-identity.js";

export const SNAPSHOT_VERSION = 1;

/** @param {any} descriptor */
export function isWindowDescriptor(descriptor) {
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, "window");
}

/**
 * Capture a WINDOW or CON node recursively.
 * @param {any} node - Tree Node
 */
export function captureNode(node) {
  if (!node) return null;
  if (typeof node.isWindow === "function" ? node.isWindow() : false) {
    return {
      window: node.nodeValue,
      percent: node.percent ?? 0,
      userSized: !!node.userSized,
    };
  }
  const out = {
    layout: node.layout,
    percent: node.percent ?? 0,
    userSized: !!node.userSized,
    children: (node.childNodes || []).map((c) => captureNode(c)).filter(Boolean),
  };
  // Preserve tab focus when present (TABBED; harmless on other layouts).
  if (node.lastTabFocus !== undefined) {
    out.lastTabFocus = node.lastTabFocus ?? null;
  }
  return out;
}

/**
 * Capture one MONITOR node (id + layout + recursive children).
 * @param {any} monNode
 * @param {{ liveMap?: import('./monitor-identity.js').LiveMap|null }} [options]
 */
export function captureMonitor(monNode, options = {}) {
  if (!monNode) return null;
  const out = {
    id: monNode.nodeValue,
    layout: monNode.layout,
    children: (monNode.childNodes || []).map((c) => captureNode(c)).filter(Boolean),
  };
  const liveMap = options.liveMap;
  if (liveMap?.byIndex) {
    const idx = MonitorIdentity.monIndexFromId(monNode.nodeValue);
    const key = idx >= 0 ? liveMap.byIndex.get(idx) : undefined;
    if (key) out.stableKey = key;
  }
  return out;
}

/**
 * Capture the tiling forest (monitors that currently hold children).
 * @param {Iterable<any>} monitorNodes
 * @param {{ liveMap?: import('./monitor-identity.js').LiveMap|null }} [options]
 * @returns {{ version: number, monitors: object[] }}
 */
export function captureForest(monitorNodes, options = {}) {
  const monitors = [];
  for (const mon of monitorNodes || []) {
    if (!mon?.childNodes?.length) continue;
    const desc = captureMonitor(mon, options);
    if (desc) monitors.push(desc);
  }
  return { version: SNAPSHOT_VERSION, monitors };
}

/**
 * Flatten a descriptor to leaf Meta.Window objects (order: DFS pre-order).
 * @param {any} descriptor
 * @returns {any[]}
 */
export function collectWindows(descriptor) {
  if (!descriptor) return [];
  if (isWindowDescriptor(descriptor)) return [descriptor.window];
  return (descriptor.children || []).flatMap((c) => collectWindows(c));
}

/**
 * True when `node` is `ancestor` or a descendant of it.
 * @param {any} node
 * @param {any} ancestor
 */
export function hasAncestor(node, ancestor) {
  let p = node;
  while (p) {
    if (p === ancestor) return true;
    p = p.parentNode;
  }
  return false;
}

/**
 * Nearest MONITOR ancestor of `node` (or the node itself if it is a MONITOR).
 * @param {any} node
 * @returns {any|null}
 */
export function findMonitorAncestor(node) {
  let p = node;
  while (p) {
    if (typeof p.isMonitor === "function" && p.isMonitor()) return p;
    p = p.parentNode;
  }
  return null;
}

/**
 * Pick the live MONITOR to apply a monDesc onto after thrash/rehome.
 * Prefer the snapshot mon when survivors still live there; when moN index is
 * stale, prefer stableKey remap over pure majority; else majority mon of
 * surviving windows (mon-agnostic regroup — layout-group style).
 *
 * @param {any} monDesc
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (win: any) => any,
 *   findMonitorByStableKey?: (stableKey: string, monDescId?: string) => any,
 * }} ctx
 * @returns {any|null}
 */
export function resolveTargetMonitor(monDesc, ctx) {
  if (!monDesc || !ctx) return null;
  const preferred = monDesc.id ? ctx.findMonitor(monDesc.id) : null;
  let byStable = null;
  if (monDesc.stableKey && typeof ctx.findMonitorByStableKey === "function") {
    byStable = ctx.findMonitorByStableKey(monDesc.stableKey, monDesc.id) || null;
  }

  const allWins = [];
  for (const c of monDesc.children || []) {
    allWins.push(...collectWindows(c));
  }
  const nodes = allWins.map((w) => ctx.findNode(w)).filter(Boolean);
  if (nodes.length === 0) return byStable || preferred;

  const counts = new Map();
  for (const n of nodes) {
    const mon = findMonitorAncestor(n);
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
    const onPreferred = nodes.filter((n) => hasAncestor(n, preferred)).length;
    // Survivors still under snapshot mon id → keep, unless stableKey remaps to
    // a different mon that holds more of the cohort (index renumber).
    if (onPreferred > 0 && onPreferred >= best) {
      if (byStable && byStable !== preferred) {
        const onStable = nodes.filter((n) => hasAncestor(n, byStable)).length;
        if (onStable > onPreferred) return byStable;
      }
      return preferred;
    }
  }

  // Index id stale/empty: stableKey before pure majority.
  if (byStable) {
    const onStable = nodes.filter((n) => hasAncestor(n, byStable)).length;
    if (onStable > 0 || best === 0) return byStable;
  }
  return majority || byStable || preferred;
}

/**
 * All WINDOW nodes under `root` (DFS). Includes root when it is a WINDOW.
 * @param {any} root
 * @returns {any[]}
 */
export function windowsUnder(root) {
  if (!root) return [];
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (typeof n.isWindow === "function" && n.isWindow()) {
      out.push(n);
      return;
    }
    for (const c of n.childNodes || []) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Renormalize sibling percents after survivors collapse.
 * Preserves userSized ratios when any child is userSized; otherwise keeps
 * automatic zeros (equal split) when none had weight, or scales remaining.
 * @param {any[]} children
 */
export function renormalizeChildPercents(children) {
  if (!children || children.length === 0) return;
  const anyUser = children.some((c) => c.userSized);
  const sum = children.reduce((s, c) => s + (c.percent || 0), 0);

  if (!anyUser) {
    // Magic-zero equal split when empty/zero, or when a sibling has 0 while
    // another has weight (e.g. collapsed VSPLIT left a lone child at percent=1
    // next to TABBED at 0 → full-width terminal, zero-width tabs).
    const allPositive = children.every((c) => (c.percent || 0) > 0);
    if (sum <= 0 || !allPositive) {
      children.forEach((c) => {
        c.percent = 0;
        c.userSized = false;
      });
      return;
    }
    children.forEach((c) => {
      c.percent = (c.percent || 0) / sum;
    });
    return;
  }

  if (sum <= 0) {
    const each = 1 / children.length;
    children.forEach((c) => {
      c.percent = each;
    });
    return;
  }
  children.forEach((c) => {
    c.percent = (c.percent || 0) / sum;
  });
}

/**
 * Rebuild one descriptor under a cohort of surviving window nodes.
 *
 * @param {any} descriptor
 * @param {{
 *   findNode: (win: any) => any,
 *   cohortSet: Set<any>,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 * }} ctx
 * @returns {any|null}
 */
export function rebuildNode(descriptor, ctx) {
  if (!descriptor || !ctx) return null;

  if (isWindowDescriptor(descriptor)) {
    const node = ctx.findNode(descriptor.window);
    if (!node || !ctx.cohortSet.has(node)) return null;
    node.percent = descriptor.percent ?? 0;
    node.userSized = !!descriptor.userSized;
    return node;
  }

  const children = (descriptor.children || []).map((c) => rebuildNode(c, ctx)).filter((n) => n);
  if (children.length === 0) return null;
  // Collapse degenerate single-child CONs (closed sibling / wrap).
  // Use the CON's weight among its siblings, not the sole child's internal percent
  // (e.g. VSPLIT with one window at percent=1 would steal the whole mon).
  if (children.length === 1) {
    const only = children[0];
    only.percent = descriptor.percent ?? 0;
    only.userSized = !!descriptor.userSized;
    return only;
  }

  const con = ctx.createCon();
  con.layout = descriptor.layout;
  con.percent = descriptor.percent ?? 0;
  con.userSized = !!descriptor.userSized;
  // appendChild detaches each child from its current parent.
  children.forEach((child) => con.appendChild(child));
  renormalizeChildPercents(children);

  if (descriptor.lastTabFocus !== undefined || descriptor.layout === ctx.tabbedLayout) {
    const focusSurvived = children.some((n) => n.nodeValue === descriptor.lastTabFocus);
    con.lastTabFocus = focusSurvived ? descriptor.lastTabFocus : children[0]?.nodeValue ?? null;
  }
  return con;
}

/**
 * Live topology token for structure comparison (no percents).
 * @param {any} node
 */
export function liveTopology(node) {
  if (!node) return null;
  if (typeof node.isWindow === "function" && node.isWindow()) {
    return { w: true, ref: node.nodeValue };
  }
  return {
    w: false,
    layout: node.layout,
    children: (node.childNodes || []).map((c) => liveTopology(c)),
  };
}

/**
 * Expected topology from a descriptor, only including windows under `mon`.
 * Collapses single-child CONs the same way rebuild does.
 *
 * @param {any} descriptor
 * @param {(win: any) => any} findNode
 * @param {(node: any) => boolean} underMon
 */
export function expectedTopology(descriptor, findNode, underMon) {
  if (!descriptor) return null;
  if (isWindowDescriptor(descriptor)) {
    const n = findNode(descriptor.window);
    if (!n || !underMon(n)) return null;
    return { w: true, ref: descriptor.window };
  }
  const children = (descriptor.children || [])
    .map((c) => expectedTopology(c, findNode, underMon))
    .filter(Boolean);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { w: false, layout: descriptor.layout, children };
}

/**
 * @param {any} a
 * @param {any} b
 */
export function topologyEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.w || b.w) return !!(a.w && b.w && a.ref === b.ref);
  if (a.layout !== b.layout) return false;
  if ((a.children?.length || 0) !== (b.children?.length || 0)) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!topologyEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}

/**
 * Whether live mon structure matches the snapshot for co-located survivors.
 * @param {any} mon
 * @param {any} monDesc
 * @param {(win: any) => any} findNode
 */
export function monitorTopologyMatches(mon, monDesc, findNode) {
  if (!mon || !monDesc) return false;
  const underMon = (n) => hasAncestor(n, mon);
  const expectedChildren = (monDesc.children || [])
    .map((c) => expectedTopology(c, findNode, underMon))
    .filter(Boolean);
  // Collapse mon-level single child like rebuild would for a CON — mon itself stays.
  const liveChildren = (mon.childNodes || []).map((c) => liveTopology(c));
  if (expectedChildren.length !== liveChildren.length) return false;
  if (monDesc.layout && mon.layout && monDesc.layout !== mon.layout) return false;
  for (let i = 0; i < expectedChildren.length; i++) {
    if (!topologyEqual(expectedChildren[i], liveChildren[i])) return false;
  }
  return true;
}

/**
 * Apply size policy by matching window sets (tolerates collapse asymmetry).
 * @param {any} liveNode
 * @param {any} descriptor
 * @param {(win: any) => any} findNode
 */
export function applyPercentsByWindows(liveNode, descriptor, findNode) {
  if (!liveNode || !descriptor) return;

  if (isWindowDescriptor(descriptor)) {
    const n = findNode(descriptor.window);
    if (n && n === liveNode) {
      n.percent = descriptor.percent ?? 0;
      n.userSized = !!descriptor.userSized;
    }
    return;
  }

  // Apply onto liveNode if it is a CON with same layout and covers same windows.
  if (typeof liveNode.isWindow === "function" && liveNode.isWindow()) {
    // Live collapsed to a window; size policy lives on the window from its leaf desc.
    const wins = collectWindows(descriptor);
    if (wins.length === 1 && liveNode.nodeValue === wins[0]) {
      // Prefer leaf percent from the surviving window descriptor inside.
      const leaf = findLeafDescForWindow(descriptor, liveNode.nodeValue);
      if (leaf) {
        liveNode.percent = leaf.percent ?? 0;
        liveNode.userSized = !!leaf.userSized;
      }
    }
    return;
  }

  if (typeof liveNode.isCon === "function" && liveNode.isCon()) {
    liveNode.percent = descriptor.percent ?? 0;
    liveNode.userSized = !!descriptor.userSized;
    if (descriptor.lastTabFocus !== undefined) {
      const focusSurvived = (liveNode.childNodes || []).some(
        (c) => c.nodeValue === descriptor.lastTabFocus
      );
      if (focusSurvived) liveNode.lastTabFocus = descriptor.lastTabFocus;
    }
  }

  // Pair live children with desc children by first surviving window identity.
  const descs = descriptor.children || [];
  for (const liveChild of liveNode.childNodes || []) {
    const liveWins = new Set(windowsUnder(liveChild).map((w) => w.nodeValue));
    const match = descs.find((d) => {
      const dw = collectWindows(d);
      return dw.some((w) => liveWins.has(w));
    });
    if (match) applyPercentsByWindows(liveChild, match, findNode);
  }
}

/** @param {any} descriptor @param {any} win */
function findLeafDescForWindow(descriptor, win) {
  if (!descriptor) return null;
  if (isWindowDescriptor(descriptor)) {
    return descriptor.window === win ? descriptor : null;
  }
  for (const c of descriptor.children || []) {
    const found = findLeafDescForWindow(c, win);
    if (found) return found;
  }
  return null;
}

/**
 * Apply a monitor descriptor onto a live MONITOR after flat rebuild / thrash.
 * Only windows currently under `mon` and present in the descriptor are regrouped
 * (same co-located cohort rule as layout-group restore). When the mon also holds
 * unrelated windows (cross-mon thrash pile), only the cohort is rebuilt in place
 * — non-cohort siblings are left alone (mon-agnostic, layout-group style).
 *
 * @param {any} mon - MONITOR node
 * @param {any} monDesc
 * @param {{
 *   findNode: (win: any) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 * }} ctx
 * @returns {boolean} true if any rebuild ran
 */
export function applyMonitorSnapshot(mon, monDesc, ctx) {
  if (!mon || !monDesc || !ctx) return false;

  const allWins = [];
  for (const c of monDesc.children || []) {
    allWins.push(...collectWindows(c));
  }

  const cohort = [];
  for (const w of allWins) {
    const n = ctx.findNode(w);
    if (n && hasAncestor(n, mon)) cohort.push(n);
  }
  if (cohort.length === 0) return false;

  const cohortSet = new Set(cohort);
  const snapWinSet = new Set(allWins);

  // Windows under mon that were not in this mon's snapshot (other mon's tiles,
  // mid-thrash opens). Full replace only when mon is pure snapshot cohort.
  const monWins = windowsUnder(mon);
  const extras = monWins.filter((n) => !snapWinSet.has(n.nodeValue));
  const monIsPureCohort = extras.length === 0;

  const childCtx = {
    findNode: ctx.findNode,
    cohortSet,
    createCon: ctx.createCon,
    tabbedLayout: ctx.tabbedLayout,
  };

  // Mon-level index before rebuild detaches cohort (nested windows → CON index).
  const insertIndex = Math.min(
    ...cohort.map((n) => monLevelChildIndex(n, mon) ?? mon.childNodes.length)
  );

  const rebuilt = [];
  for (const childDesc of monDesc.children || []) {
    const node = rebuildNode(childDesc, childCtx);
    if (node) rebuilt.push(node);
  }
  if (rebuilt.length === 0) return false;

  // Mon-level percents after collapse (closed sibling mon child).
  renormalizeChildPercents(rebuilt);

  if (monIsPureCohort) {
    while (mon.childNodes.length > 0) {
      mon.removeChild(mon.childNodes[0]);
    }
    if (monDesc.layout) mon.layout = monDesc.layout;
    for (const r of rebuilt) {
      mon.appendChild(r);
    }
    return true;
  }

  // Mixed mon: drop empty CONs left by detaching cohort; splice rebuilt roots
  // at the cohort's original mon-level position; leave non-cohort siblings.
  for (const c of [...mon.childNodes]) {
    if (typeof c.isCon === "function" && c.isCon() && c.childNodes.length === 0) {
      mon.removeChild(c);
    }
  }
  const anchor = insertIndex < mon.childNodes.length ? mon.childNodes[insertIndex] : null;
  for (const r of rebuilt) {
    if (anchor) mon.insertBefore(r, anchor);
    else mon.appendChild(r);
  }
  return true;
}

/**
 * Index of the mon-level child that owns `node` (node itself if direct child).
 * @param {any} node
 * @param {any} mon
 * @returns {number|null}
 */
function monLevelChildIndex(node, mon) {
  let p = node;
  while (p && p.parentNode && p.parentNode !== mon) {
    p = p.parentNode;
  }
  if (!p || p.parentNode !== mon) return null;
  return p.index;
}

/**
 * Apply percents onto a matching live monitor without restructuring.
 * @param {any} mon
 * @param {any} monDesc
 * @param {(win: any) => any} findNode
 */
export function applyMonitorPercents(mon, monDesc, findNode) {
  if (!mon || !monDesc) return;
  for (const childDesc of monDesc.children || []) {
    const wins = collectWindows(childDesc);
    if (wins.length === 0) continue;
    // Find live child that covers any of these windows.
    const liveChild = (mon.childNodes || []).find((c) => {
      const under = new Set(windowsUnder(c).map((n) => n.nodeValue));
      return wins.some((w) => under.has(w));
    });
    if (liveChild) applyPercentsByWindows(liveChild, childDesc, findNode);
  }
}

/**
 * Remove empty CON nodes under `root` (bottom-up). After cross-mon rehome the
 * snapshot mon may keep hollow TABBED/STACKED CONs once windows were detached.
 * @param {any} root
 */
export function pruneEmptyConsUnder(root) {
  if (!root) return;
  const empties = [];
  const walk = (n) => {
    if (!n) return;
    for (const c of [...(n.childNodes || [])]) walk(c);
    if (typeof n.isCon === "function" && n.isCon() && (n.childNodes || []).length === 0) {
      empties.push(n);
    }
  };
  walk(root);
  for (const e of empties) {
    if (e.parentNode) e.parentNode.removeChild(e);
  }
}

/**
 * Restore a full forest snapshot. Force-rebuild each monitor with survivors.
 * Target mon is remapped to where the surviving cohort currently lives when the
 * snapshot mon is empty (soft rehome / thrash cross-mon pile).
 * @param {any} forest
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (win: any) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 * }} ctx
 */
export function restoreForest(forest, ctx) {
  if (!forest?.monitors?.length || !ctx) return;
  for (const monDesc of forest.monitors) {
    const preferred = monDesc.id ? ctx.findMonitor(monDesc.id) : null;
    const mon = resolveTargetMonitor(monDesc, ctx);
    if (!mon) continue;
    applyMonitorSnapshot(mon, monDesc, ctx);
    pruneEmptyConsUnder(mon);
    if (preferred && preferred !== mon) pruneEmptyConsUnder(preferred);
  }
}

/**
 * Restore only monitors whose live topology diverged from the snapshot.
 * Intact monitors get percent/userSized re-applied only. Cross-mon rehome uses
 * resolveTargetMonitor so empty snapshot-mon cohorts still regroup.
 * @param {any} forest
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (win: any) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 * }} ctx
 */
export function restoreForestIfNeeded(forest, ctx) {
  if (!forest?.monitors?.length || !ctx) return;
  for (const monDesc of forest.monitors) {
    const preferred = monDesc.id ? ctx.findMonitor(monDesc.id) : null;
    const mon = resolveTargetMonitor(monDesc, ctx);
    if (!mon) continue;
    if (monitorTopologyMatches(mon, monDesc, ctx.findNode)) {
      applyMonitorPercents(mon, monDesc, ctx.findNode);
      continue;
    }
    applyMonitorSnapshot(mon, monDesc, ctx);
    pruneEmptyConsUnder(mon);
    if (preferred && preferred !== mon) pruneEmptyConsUnder(preferred);
  }
}

/**
 * Outer STACKED/TABBED groups from a full forest (layout-group compatibility).
 * Nested stack/tab under an outer group is folded into that ancestor's children.
 *
 * @param {any} forest
 * @param {any} stackedLayout
 * @param {any} tabbedLayout
 * @returns {any[]}
 */
export function extractOuterLayoutGroups(forest, stackedLayout, tabbedLayout) {
  const groups = [];
  const isGroup = (layout) => layout === stackedLayout || layout === tabbedLayout;

  const walk = (desc, insideGroup) => {
    if (!desc || isWindowDescriptor(desc)) return;
    if (isGroup(desc.layout) && !insideGroup) {
      // Only capture groups with 2+ leaf windows (mirrors snapshotLayoutGroups).
      if (collectWindows(desc).length >= 2) groups.push(desc);
      // Nested groups stay inside this descriptor; do not push again.
      return;
    }
    for (const c of desc.children || []) walk(c, insideGroup || isGroup(desc.layout));
  };

  for (const mon of forest?.monitors || []) {
    for (const c of mon.children || []) walk(c, false);
  }
  return groups;
}
