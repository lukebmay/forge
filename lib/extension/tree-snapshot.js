/*
 * Gnome adapter for lib/epochs T6 snapshot/restore.
 * Capture walks GObject Node; restore ctx maps windowId ↔ live window refs.
 */

import * as MonitorIdentity from "./monitor-identity.js";
import * as Epochs from "../epochs/index.js";

export const SNAPSHOT_VERSION = Epochs.SNAPSHOT_VERSION;

export {
  findMonitorAncestor,
  hasAncestor,
  pruneEmptyConsUnder,
  renormalizeChildPercents,
  topologyEqual,
  windowsUnder,
} from "../epochs/index.js";

/** @param {any} meta */
export function windowIdFromMeta(meta) {
  if (meta == null) return null;
  if (typeof meta === "string" || typeof meta === "number") return String(meta);
  try {
    if (typeof meta.get_id === "function") {
      const id = meta.get_id();
      if (id !== undefined && id !== null) return String(id);
    }
  } catch (_e) {
    // finalized window
  }
  if (meta.id !== undefined && meta.id !== null) return String(meta.id);
  return null;
}

/** @param {any} descriptor */
export function isWindowDescriptor(descriptor) {
  return (
    Epochs.isWindowDescriptor(descriptor) ||
    (!!descriptor && Object.prototype.hasOwnProperty.call(descriptor, "window"))
  );
}

function isWinShape(desc) {
  return (
    !!desc &&
    (desc.kind === "WINDOW" ||
      (desc.windowId != null && desc.windowId !== "") ||
      Object.prototype.hasOwnProperty.call(desc, "window"))
  );
}

function ensureNode(desc) {
  if (!desc) return desc;
  if (isWinShape(desc)) {
    desc.kind = "WINDOW";
    if ((desc.windowId == null || desc.windowId === "") && desc.window != null) {
      const id = windowIdFromMeta(desc.window);
      if (id != null) desc.windowId = id;
    } else if (desc.windowId != null) {
      desc.windowId = String(desc.windowId);
    }
    return desc;
  }
  desc.kind = "CON";
  if ((desc.lastTabFocusId == null || desc.lastTabFocusId === "") && desc.lastTabFocus != null) {
    const id = windowIdFromMeta(desc.lastTabFocus);
    if (id != null) desc.lastTabFocusId = id;
  } else if (desc.lastTabFocusId != null) {
    desc.lastTabFocusId = String(desc.lastTabFocusId);
  }
  for (const c of desc.children || []) ensureNode(c);
  return desc;
}

function ensureMonitor(monDesc) {
  if (!monDesc) return monDesc;
  for (const c of monDesc.children || []) ensureNode(c);
  return monDesc;
}

/** Fill kind / windowId / lastTabFocusId from adapter `.window` refs. */
export function ensureEpochFields(desc) {
  if (!desc) return desc;
  if (Array.isArray(desc.monitors)) {
    for (const m of desc.monitors) ensureMonitor(m);
    return desc;
  }
  if (isWinShape(desc) || desc.kind === "CON" || (desc.children && !desc.id)) {
    return ensureNode(desc);
  }
  return ensureMonitor(desc);
}

function collectMeta(desc, map) {
  if (!desc) return;
  if (Array.isArray(desc.monitors)) {
    for (const m of desc.monitors) collectMeta(m, map);
    return;
  }
  if (desc.window != null) {
    const id = desc.windowId != null ? String(desc.windowId) : windowIdFromMeta(desc.window);
    if (id != null) map.set(id, desc.window);
  }
  if (desc.lastTabFocus != null && typeof desc.lastTabFocus === "object") {
    const id =
      desc.lastTabFocusId != null
        ? String(desc.lastTabFocusId)
        : windowIdFromMeta(desc.lastTabFocus);
    if (id != null && !map.has(id)) map.set(id, desc.lastTabFocus);
  }
  for (const c of desc.children || []) collectMeta(c, map);
}

function wrapFindNode(origFindNode, desc) {
  const metaById = new Map();
  collectMeta(desc, metaById);
  return (key) => {
    if (key == null || typeof origFindNode !== "function") return null;
    const hit = origFindNode(key);
    if (hit) return hit;
    const id = typeof key === "object" ? windowIdFromMeta(key) : String(key);
    if (id == null || id === "") return null;
    const meta = metaById.get(id);
    if (meta != null && meta !== key) {
      const n = origFindNode(meta);
      if (n) return n;
    }
    return null;
  };
}

function wrapCtx(ctx, desc) {
  if (!ctx) return ctx;
  const origWid = ctx.windowIdOf;
  return {
    ...ctx,
    findNode: wrapFindNode(ctx.findNode, desc),
    windowIdOf: (node) => {
      if (typeof origWid === "function") {
        const id = origWid(node);
        if (id != null && id !== "") return String(id);
      }
      if (node?.windowId != null && node.windowId !== "") return String(node.windowId);
      return windowIdFromMeta(node?.nodeValue);
    },
  };
}

function asCtx(ctxOrFind, desc) {
  if (typeof ctxOrFind === "function") return wrapCtx({ findNode: ctxOrFind }, desc);
  return wrapCtx(ctxOrFind, desc);
}

/**
 * Portable WINDOW key: Forest nanoid when host bag knows the Meta, else Meta id.
 * @param {any} meta
 * @param {import('../host/bag.js').HostBag|null|undefined} hostBag
 * @returns {{ windowId: string|null, metaWindowId: string|null }}
 */
export function portableWindowKeys(meta, hostBag) {
  let metaId = null;
  if (meta != null) {
    try {
      if (typeof meta.get_id === "function") {
        const id = meta.get_id();
        if (id !== undefined && id !== null) metaId = id;
      } else if (meta.id !== undefined && meta.id !== null) {
        metaId = meta.id;
      }
    } catch (_e) {
      metaId = null;
    }
  }
  if (hostBag && meta && typeof meta === "object") {
    const nid = hostBag.idFromMeta?.(meta);
    if (nid) {
      return {
        windowId: String(nid),
        metaWindowId: metaId != null ? metaId : null,
      };
    }
  }
  return {
    windowId: metaId,
    metaWindowId: metaId,
  };
}

/**
 * Capture a WINDOW or CON node recursively.
 * @param {any} node - Tree Node
 * @param {{ hostBag?: import('../host/bag.js').HostBag|null }} [options]
 */
export function captureNode(node, options = {}) {
  if (!node) return null;
  if (typeof node.isWindow === "function" ? node.isWindow() : false) {
    const meta = node.nodeValue;
    const keys = portableWindowKeys(meta, options.hostBag);
    const out = {
      kind: "WINDOW",
      windowId: keys.windowId,
      percent: node.percent ?? 0,
      userSized: !!node.userSized,
    };
    if (
      keys.metaWindowId != null &&
      keys.windowId != null &&
      String(keys.metaWindowId) !== String(keys.windowId)
    ) {
      out.metaWindowId = keys.metaWindowId;
    }
    if (meta != null) out.window = meta;
    return out;
  }
  const out = {
    kind: "CON",
    layout: node.layout,
    percent: node.percent ?? 0,
    userSized: !!node.userSized,
    children: (node.childNodes || []).map((c) => captureNode(c, options)).filter(Boolean),
  };
  if (node.lastTabFocus !== undefined) {
    out.lastTabFocus = node.lastTabFocus ?? null;
    const ltfKeys = portableWindowKeys(node.lastTabFocus, options.hostBag);
    out.lastTabFocusId = ltfKeys.windowId;
  }
  return out;
}

/**
 * Capture one MONITOR node (id + layout + recursive children).
 * @param {any} monNode
 * @param {{
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 *   hostBag?: import('../host/bag.js').HostBag|null,
 * }} [options]
 */
export function captureMonitor(monNode, options = {}) {
  if (!monNode) return null;
  const out = {
    id: monNode.nodeValue,
    layout: monNode.layout,
    children: (monNode.childNodes || []).map((c) => captureNode(c, options)).filter(Boolean),
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
 * @param {{
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 *   hostBag?: import('../host/bag.js').HostBag|null,
 * }} [options]
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
 * Flatten a descriptor to leaf window refs when `.window` is present.
 * @param {any} descriptor
 * @returns {any[]}
 */
export function collectWindows(descriptor) {
  if (!descriptor) return [];
  if (Array.isArray(descriptor.monitors)) {
    return descriptor.monitors.flatMap((m) => collectWindows(m));
  }
  if (isWindowDescriptor(descriptor)) {
    return descriptor.window != null ? [descriptor.window] : [];
  }
  return (descriptor.children || []).flatMap((c) => collectWindows(c));
}

/** @param {any} monDesc @param {any} ctx */
export function resolveTargetMonitor(monDesc, ctx) {
  ensureEpochFields(monDesc);
  return Epochs.resolveTargetMonitor(monDesc, wrapCtx(ctx, monDesc));
}

/** @param {any} descriptor @param {any} ctx */
export function rebuildNode(descriptor, ctx) {
  ensureEpochFields(descriptor);
  return Epochs.rebuildNode(descriptor, wrapCtx(ctx, descriptor));
}

/** @param {any} mon @param {any} monDesc @param {any} ctx */
export function applyMonitorSnapshot(mon, monDesc, ctx) {
  ensureEpochFields(monDesc);
  return Epochs.applyMonitorSnapshot(mon, monDesc, wrapCtx(ctx, monDesc));
}

/** @param {any} liveNode @param {any} descriptor @param {any} ctxOrFind */
export function applyPercentsByWindows(liveNode, descriptor, ctxOrFind) {
  ensureEpochFields(descriptor);
  return Epochs.applyPercentsByWindows(liveNode, descriptor, asCtx(ctxOrFind, descriptor));
}

/** @param {any} mon @param {any} monDesc @param {any} ctxOrFind */
export function applyMonitorPercents(mon, monDesc, ctxOrFind) {
  ensureEpochFields(monDesc);
  return Epochs.applyMonitorPercents(mon, monDesc, asCtx(ctxOrFind, monDesc));
}

/** @param {any} mon @param {any} monDesc @param {any} ctxOrFind */
export function monitorTopologyMatches(mon, monDesc, ctxOrFind) {
  ensureEpochFields(monDesc);
  return Epochs.monitorTopologyMatches(mon, monDesc, asCtx(ctxOrFind, monDesc));
}

/** @param {any} node @param {any} [ctx] */
export function liveTopology(node, ctx) {
  const wrapped = ctx ? wrapCtx(ctx, null) : { windowIdOf: (n) => windowIdFromMeta(n?.nodeValue) };
  return Epochs.liveTopology(node, wrapped);
}

/** @param {any} descriptor @param {any} findNodeOrCtx @param {(node: any) => boolean} underMon */
export function expectedTopology(descriptor, findNodeOrCtx, underMon) {
  ensureEpochFields(descriptor);
  return Epochs.expectedTopology(descriptor, asCtx(findNodeOrCtx, descriptor), underMon);
}

/** @param {any} forest @param {any} ctx */
export function restoreForest(forest, ctx) {
  ensureEpochFields(forest);
  return Epochs.restoreForest(forest, wrapCtx(ctx, forest));
}

/** @param {any} forest @param {any} ctx */
export function restoreForestIfNeeded(forest, ctx) {
  ensureEpochFields(forest);
  return Epochs.restoreForestIfNeeded(forest, wrapCtx(ctx, forest));
}

/** @param {any} forest @param {any} stackedLayout @param {any} tabbedLayout */
export function extractOuterLayoutGroups(forest, stackedLayout, tabbedLayout) {
  ensureEpochFields(forest);
  return Epochs.extractOuterLayoutGroups(forest, stackedLayout, tabbedLayout);
}
