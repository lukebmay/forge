// @ts-check
/**
 * Apply planner snapshot: TOM Forest + host bag → planReconcile IR (C6).
 * DBus GetTree stays on tree-query projectForest (Surface only).
 */

import { floatsOf } from "../tom/index.js";
import { geomOf } from "../world/index.js";
import { monIndexFromId, workspaceFromId } from "./monitor-identity.js";
import { isPlaceholderNode } from "./layout-placeholder.js";
import { TREE_QUERY_API_VERSION, projectRect, windowMetaFields } from "./tree-query.js";

/**
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {string} id
 * @returns {import('../tom/kernel.js').Node|null}
 */
function nodeOf(forest, id) {
  if (!forest || id == null || id === "") return null;
  return forest.nodes?.[id] || null;
}

/**
 * @param {any} meta
 * @returns {object|null}
 */
function metaFrameRect(meta) {
  if (!meta || typeof meta !== "object") return null;
  try {
    if (typeof meta.get_frame_rect === "function") {
      return projectRect(meta.get_frame_rect());
    }
  } catch (_e) {
    /* disposed */
  }
  if (meta._rect) return projectRect(meta._rect);
  return null;
}

/**
 * @param {any} live
 * @param {object|undefined} bag
 * @param {boolean} underFloats
 * @returns {string|null}
 */
function windowMode(live, bag, underFloats) {
  if (underFloats || bag?.floating === true) return "FLOAT";
  if (live?.mode != null && live.mode !== "") return String(live.mode);
  if (typeof live?.isFloat === "function" && live.isFloat()) return "FLOAT";
  if (typeof live?.isGrabTile === "function" && live.isGrabTile()) return "GRAB_TILE";
  return "TILE";
}

/**
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {import('../tom/kernel.js').Node} node
 * @param {{
 *   hostBag?: import('../host/bag.js').HostBag|null,
 *   liveById?: Map<string, any>|null,
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 *   underFloats?: boolean,
 * }} ctx
 * @returns {object|null}
 */
function projectTomNode(forest, node, ctx) {
  if (!node) return null;
  const kind = node.kind;
  if (kind === "WINDOW") {
    return projectTomWindow(forest, node, ctx);
  }
  if (kind !== "CON" && kind !== "MONITOR" && kind !== "WORKSPACE" && kind !== "ROOT") {
    return null;
  }

  /** @type {Record<string, any>} */
  const out = {
    nodeType: kind === "ROOT" ? "CON" : kind,
    layout: node.layout ?? null,
    rect: null,
    percent: typeof node.percent === "number" ? node.percent : 0,
    userSized: !!node.userSized,
    children: [],
  };

  if (kind === "MONITOR") {
    out.id = node.id;
    out.nodeType = "MONITOR";
    const liveMap = ctx.liveMap;
    if (liveMap?.byIndex && node.id) {
      const idx = monIndexFromId(node.id);
      const key = idx >= 0 ? liveMap.byIndex.get(idx) : undefined;
      if (key) out.stableKey = key;
    }
    const g = geomOf(forest, node.id);
    if (g) {
      out.rect = projectRect({
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
      });
    }
  }

  if (node.lastTabFocusId != null && node.lastTabFocusId !== "") {
    out.lastTabFocusId = String(node.lastTabFocusId);
  }

  const kids = [];
  for (const cid of node.childIds || []) {
    const child = nodeOf(forest, cid);
    if (!child) continue;
    const proj = projectTomNode(forest, child, ctx);
    if (proj) kids.push(proj);
  }
  out.children = kids;
  return out;
}

/**
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {import('../tom/kernel.js').Node} node
 * @param {{
 *   hostBag?: import('../host/bag.js').HostBag|null,
 *   liveById?: Map<string, any>|null,
 *   underFloats?: boolean,
 * }} ctx
 * @returns {object|null}
 */
function projectTomWindow(forest, node, ctx) {
  const bag = ctx.hostBag?.get?.(node.id);
  const live = ctx.liveById?.get?.(node.id) ?? null;
  const meta = bag?.meta && typeof bag.meta === "object" ? bag.meta : live?.nodeValue;
  const fields = windowMetaFields(meta && typeof meta === "object" ? meta : null);

  /** @type {Record<string, any>} */
  const out = {
    nodeType: "WINDOW",
    layout: null,
    rect: metaFrameRect(meta),
    percent: typeof node.percent === "number" ? node.percent : 0,
    userSized: !!node.userSized,
    children: [],
    windowId: String(node.id),
    wmClass: fields.wmClass || node.wmClass || null,
    title: fields.title || node.label || null,
    mode: windowMode(live, bag, !!ctx.underFloats),
  };

  if (fields.wmClassInstance != null) out.wmClassInstance = fields.wmClassInstance;
  if (fields.pid != null) out.pid = fields.pid;
  if (fields.monitor != null) out.monitor = fields.monitor;

  const metaId =
    bag?.windowId != null && bag.windowId !== ""
      ? bag.windowId
      : fields.id != null
      ? fields.id
      : null;
  if (metaId != null && String(metaId) !== String(node.id)) {
    out.metaWindowId = metaId;
  }

  if (isPlaceholderNode(live) || live?.placeholder === true) {
    out.placeholder = true;
    if (live.placeholderReason != null) out.placeholderReason = live.placeholderReason;
    const layoutSlot =
      live.layoutSlot ?? (meta && typeof meta === "object" ? meta.layoutSlot : null);
    const layoutRole =
      live.layoutRole ?? (meta && typeof meta === "object" ? meta.layoutRole : null);
    if (layoutSlot != null) out.layoutSlot = String(layoutSlot);
    if (layoutRole != null) out.layoutRole = String(layoutRole);
  }

  if (live?.zoomMode) out.zoomMode = live.zoomMode;

  if (out.monitor == null) {
    let p = node.parentId ? nodeOf(forest, node.parentId) : null;
    while (p) {
      if (p.kind === "MONITOR") {
        const idx = monIndexFromId(p.id);
        if (idx >= 0) out.monitor = idx;
        break;
      }
      p = p.parentId ? nodeOf(forest, p.parentId) : null;
    }
  }

  return out;
}

/**
 * TOM Forest → planReconcile / collectWindows IR.
 * WINDOW.windowId = Forest nanoid; Meta id in metaWindowId when distinct.
 *
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {import('../host/bag.js').HostBag|null|undefined} hostBag
 * @param {{
 *   liveById?: Map<string, any>|null,
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 *   workspace?: number|null,
 *   focusWindowId?: string|number|null,
 *   lastTileFocusWindowId?: string|number|null,
 *   activeWorkspace?: number|null,
 *   nWorkspaces?: number|null,
 * }} [options]
 * @returns {{
 *   apiVersion: number,
 *   monitors: object[],
 *   focusWindowId?: string|number,
 *   lastTileFocusWindowId?: string|number,
 *   activeWorkspace?: number,
 *   nWorkspaces?: number,
 *   orphanWindows?: object[],
 * }}
 */
export function projectForestFromTom(forest, hostBag, options = {}) {
  if (!forest || typeof forest !== "object") {
    return { apiVersion: TREE_QUERY_API_VERSION, monitors: [] };
  }

  const workspace =
    options.workspace !== undefined && options.workspace != null ? Number(options.workspace) : null;
  const ctx = {
    hostBag: hostBag || null,
    liveById: options.liveById || null,
    liveMap: options.liveMap || null,
    underFloats: false,
  };

  /** @type {object[]} */
  const monitors = [];
  for (const mon of forest.monitors || []) {
    if (!mon || mon.kind !== "MONITOR") continue;
    if (workspace != null && Number.isFinite(workspace)) {
      const ws = workspaceFromId(mon.id);
      if (ws >= 0 && ws !== workspace) continue;
    }
    const proj = projectTomNode(forest, mon, ctx);
    if (proj) monitors.push(proj);
  }

  /** @type {Record<string, any>} */
  const out = { apiVersion: TREE_QUERY_API_VERSION, monitors };

  const focusId =
    options.focusWindowId !== undefined && options.focusWindowId !== null
      ? options.focusWindowId
      : forest.focusId;
  if (focusId !== undefined && focusId !== null && focusId !== "") {
    out.focusWindowId = focusId;
  }
  if (options.lastTileFocusWindowId !== undefined && options.lastTileFocusWindowId !== null) {
    out.lastTileFocusWindowId = options.lastTileFocusWindowId;
  }
  if (options.activeWorkspace !== undefined && options.activeWorkspace !== null) {
    const idx = Number(options.activeWorkspace);
    if (Number.isFinite(idx)) out.activeWorkspace = idx;
  }
  if (options.nWorkspaces !== undefined && options.nWorkspaces !== null) {
    const n = Number(options.nWorkspaces);
    if (Number.isFinite(n) && n >= 0) out.nWorkspaces = n;
  }

  const floats = floatsOf(forest);
  if (floats?.childIds?.length) {
    /** @type {object[]} */
    const orphans = [];
    const floatCtx = { ...ctx, underFloats: true };
    for (const cid of floats.childIds) {
      const win = nodeOf(forest, cid);
      if (!win || win.kind !== "WINDOW") continue;
      const proj = projectTomWindow(forest, win, floatCtx);
      if (proj) orphans.push(proj);
    }
    if (orphans.length) out.orphanWindows = orphans;
  }

  return out;
}
