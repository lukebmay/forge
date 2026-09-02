// @ts-check
/**
 * Rebuild / percents / topology / prune on a T6 document + live ctx.
 * Quarantined for unit POJO tests (D096 G7). Live WM restore → forest-restore.js.
 */

import {
  collectWindowIds,
  findLeafDescForWindow,
  isWindowDescriptor,
  windowIdOf,
} from "./schema.js";
import { resolveTargetMonitor } from "./resolve-target.js";
import { hasAncestor, windowsUnder } from "./walk.js";

/**
 * Renormalize sibling percents after survivors collapse.
 * @param {any[]} children
 */
export function renormalizeChildPercents(children) {
  if (!children || children.length === 0) return;
  const anyUser = children.some((c) => c.userSized);
  const sum = children.reduce((s, c) => s + (c.percent || 0), 0);

  if (!anyUser) {
    // Magic-zero equal split when empty/zero, or mixed 0 + weight after collapse.
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
 * @param {any} descriptor
 * @param {{
 *   findNode: (windowId: string) => any,
 *   cohortSet: Set<any>,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 *   stackedLayout?: any,
 *   windowIdOf?: (node: any) => any,
 * }} ctx
 * @returns {any|null}
 */
export function rebuildNode(descriptor, ctx) {
  if (!descriptor || !ctx) return null;

  if (isWindowDescriptor(descriptor)) {
    const id = descriptor.windowId != null ? String(descriptor.windowId) : null;
    const node = id != null ? ctx.findNode(id) : null;
    if (!node || !ctx.cohortSet.has(node)) return null;
    node.percent = descriptor.percent ?? 0;
    node.userSized = !!descriptor.userSized;
    return node;
  }

  const children = (descriptor.children || []).map((c) => rebuildNode(c, ctx)).filter((n) => n);
  if (children.length === 0) return null;
  // Use the CON's sibling weight, not the sole child's internal percent.
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
  children.forEach((child) => con.appendChild(child));
  renormalizeChildPercents(children);

  const isTabOrStack =
    descriptor.layout === ctx.tabbedLayout ||
    descriptor.layout === ctx.stackedLayout ||
    descriptor.layout === "TABBED" ||
    descriptor.layout === "STACKED";
  const wantId = descriptor.lastTabFocusId != null ? String(descriptor.lastTabFocusId) : null;
  if (wantId != null || isTabOrStack) {
    const focus = wantId != null ? children.find((n) => windowIdOf(n, ctx) === wantId) : null;
    con.lastTabFocus = (focus ?? children[0])?.nodeValue ?? null;
  }
  return con;
}

/** @param {any} node @param {{ windowIdOf?: (node: any) => any }} [ctx] */
export function liveTopology(node, ctx) {
  if (!node) return null;
  if (typeof node.isWindow === "function" && node.isWindow()) {
    return { w: true, ref: windowIdOf(node, ctx) };
  }
  return {
    w: false,
    layout: node.layout,
    children: (node.childNodes || []).map((c) => liveTopology(c, ctx)),
  };
}

/**
 * @param {any} descriptor
 * @param {{ findNode: (windowId: string) => any, windowIdOf?: (node: any) => any }} ctx
 * @param {(node: any) => boolean} underMon
 */
export function expectedTopology(descriptor, ctx, underMon) {
  if (!descriptor || !ctx) return null;
  if (isWindowDescriptor(descriptor)) {
    if (descriptor.windowId == null || descriptor.windowId === "") return null;
    const id = String(descriptor.windowId);
    const n = ctx.findNode(id);
    if (!n || !underMon(n)) return null;
    return { w: true, ref: id };
  }
  const children = (descriptor.children || [])
    .map((c) => expectedTopology(c, ctx, underMon))
    .filter(Boolean);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { w: false, layout: descriptor.layout, children };
}

/** @param {any} a @param {any} b */
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
 * @param {any} mon
 * @param {any} monDesc
 * @param {{ findNode: (windowId: string) => any, windowIdOf?: (node: any) => any }} ctx
 */
export function monitorTopologyMatches(mon, monDesc, ctx) {
  if (!mon || !monDesc || !ctx) return false;
  const underMon = (n) => hasAncestor(n, mon);
  const expectedChildren = (monDesc.children || [])
    .map((c) => expectedTopology(c, ctx, underMon))
    .filter(Boolean);
  const liveChildren = (mon.childNodes || []).map((c) => liveTopology(c, ctx));
  if (expectedChildren.length !== liveChildren.length) return false;
  if (monDesc.layout && mon.layout && monDesc.layout !== mon.layout) return false;
  for (let i = 0; i < expectedChildren.length; i++) {
    if (!topologyEqual(expectedChildren[i], liveChildren[i])) return false;
  }
  return true;
}

/**
 * @param {any} liveNode
 * @param {any} descriptor
 * @param {{ findNode: (windowId: string) => any, windowIdOf?: (node: any) => any }} ctx
 */
export function applyPercentsByWindows(liveNode, descriptor, ctx) {
  if (!liveNode || !descriptor || !ctx) return;

  if (isWindowDescriptor(descriptor)) {
    const id = descriptor.windowId != null ? String(descriptor.windowId) : null;
    const n = id != null ? ctx.findNode(id) : null;
    if (n && n === liveNode) {
      n.percent = descriptor.percent ?? 0;
      n.userSized = !!descriptor.userSized;
    }
    return;
  }

  if (typeof liveNode.isWindow === "function" && liveNode.isWindow()) {
    const ids = collectWindowIds(descriptor);
    const liveId = windowIdOf(liveNode, ctx);
    if (ids.length === 1 && liveId != null && ids[0] === liveId) {
      const leaf = findLeafDescForWindow(descriptor, liveId);
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
    if (descriptor.lastTabFocusId !== undefined) {
      const want = descriptor.lastTabFocusId != null ? String(descriptor.lastTabFocusId) : null;
      if (want != null) {
        const focus = (liveNode.childNodes || []).find((c) => windowIdOf(c, ctx) === want);
        if (focus) liveNode.lastTabFocus = focus.nodeValue;
      }
    }
  }

  const descs = descriptor.children || [];
  for (const liveChild of liveNode.childNodes || []) {
    const liveIds = new Set(
      windowsUnder(liveChild)
        .map((w) => windowIdOf(w, ctx))
        .filter((id) => id != null)
    );
    const match = descs.find((d) => collectWindowIds(d).some((id) => liveIds.has(id)));
    if (match) applyPercentsByWindows(liveChild, match, ctx);
  }
}

/**
 * @param {any} mon
 * @param {any} monDesc
 * @param {{
 *   findNode: (windowId: string) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 *   stackedLayout?: any,
 *   windowIdOf?: (node: any) => any,
 * }} ctx
 * @returns {boolean}
 */
export function applyMonitorSnapshot(mon, monDesc, ctx) {
  if (!mon || !monDesc || !ctx) return false;

  const allIds = collectWindowIds(monDesc);
  const cohort = [];
  for (const id of allIds) {
    const n = ctx.findNode(id);
    if (n && hasAncestor(n, mon)) cohort.push(n);
  }
  if (cohort.length === 0) return false;

  const cohortSet = new Set(cohort);
  const snapWinSet = new Set(allIds);

  const monWins = windowsUnder(mon);
  const extras = monWins.filter((n) => {
    const id = windowIdOf(n, ctx);
    return id == null || !snapWinSet.has(id);
  });
  const monIsPureCohort = extras.length === 0;

  const childCtx = {
    findNode: ctx.findNode,
    cohortSet,
    createCon: ctx.createCon,
    tabbedLayout: ctx.tabbedLayout,
    stackedLayout: ctx.stackedLayout,
    windowIdOf: ctx.windowIdOf,
  };

  const insertIndex = Math.min(
    ...cohort.map((n) => monLevelChildIndex(n, mon) ?? mon.childNodes.length)
  );
  const extraPlacements = [];
  const extraSeen = new Set();
  for (const e of extras) {
    const child = monLevelChild(e, mon);
    if (!child || extraSeen.has(child)) continue;
    extraSeen.add(child);
    extraPlacements.push({ node: child, index: child.index });
  }
  const extrasBefore = extraPlacements.filter((p) => p.index < insertIndex).map((p) => p.node);
  const extrasAfter = extraPlacements.filter((p) => p.index >= insertIndex).map((p) => p.node);

  const rebuilt = [];
  for (const childDesc of monDesc.children || []) {
    const node = rebuildNode(childDesc, childCtx);
    if (node) rebuilt.push(node);
  }
  if (rebuilt.length === 0) return false;

  renormalizeChildPercents(rebuilt);

  if (monDesc.layout) mon.layout = monDesc.layout;
  const next = monIsPureCohort ? rebuilt : [...extrasBefore, ...rebuilt, ...extrasAfter];
  mon.replaceChildren(next);
  return true;
}

/** @param {any} node @param {any} mon */
function monLevelChild(node, mon) {
  let p = node;
  while (p && p.parentNode && p.parentNode !== mon) {
    p = p.parentNode;
  }
  if (!p || p.parentNode !== mon) return null;
  return p;
}

/** @param {any} node @param {any} mon @returns {number|null} */
function monLevelChildIndex(node, mon) {
  const child = monLevelChild(node, mon);
  return child ? child.index : null;
}

/**
 * @param {any} mon
 * @param {any} monDesc
 * @param {{ findNode: (windowId: string) => any, windowIdOf?: (node: any) => any }} ctx
 */
export function applyMonitorPercents(mon, monDesc, ctx) {
  if (!mon || !monDesc || !ctx) return;
  for (const childDesc of monDesc.children || []) {
    const ids = collectWindowIds(childDesc);
    if (ids.length === 0) continue;
    const idSet = new Set(ids);
    const liveChild = (mon.childNodes || []).find((c) =>
      windowsUnder(c).some((n) => {
        const id = windowIdOf(n, ctx);
        return id != null && idSet.has(id);
      })
    );
    if (liveChild) applyPercentsByWindows(liveChild, childDesc, ctx);
  }
}

/** @param {any} root */
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
 * @param {any} forest
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (windowId: string) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 *   stackedLayout?: any,
 *   findMonitorByStableKey?: (stableKey: string, monDescId?: string) => any,
 *   windowIdOf?: (node: any) => any,
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
 * @param {any} forest
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (windowId: string) => any,
 *   createCon: () => any,
 *   tabbedLayout?: any,
 *   stackedLayout?: any,
 *   findMonitorByStableKey?: (stableKey: string, monDescId?: string) => any,
 *   windowIdOf?: (node: any) => any,
 * }} ctx
 */
export function restoreForestIfNeeded(forest, ctx) {
  if (!forest?.monitors?.length || !ctx) return;
  for (const monDesc of forest.monitors) {
    const preferred = monDesc.id ? ctx.findMonitor(monDesc.id) : null;
    const mon = resolveTargetMonitor(monDesc, ctx);
    if (!mon) continue;
    if (monitorTopologyMatches(mon, monDesc, ctx)) {
      applyMonitorPercents(mon, monDesc, ctx);
      continue;
    }
    applyMonitorSnapshot(mon, monDesc, ctx);
    pruneEmptyConsUnder(mon);
    if (preferred && preferred !== mon) pruneEmptyConsUnder(preferred);
  }
}

/**
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
      if (collectWindowIds(desc).length >= 2) groups.push(desc);
      return;
    }
    for (const c of desc.children || []) walk(c, insideGroup || isGroup(desc.layout));
  };

  for (const mon of forest?.monitors || []) {
    for (const c of mon.children || []) walk(c, false);
  }
  return groups;
}
