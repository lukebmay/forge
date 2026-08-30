/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure GObject tree → JSON for DBus GetTree / CLI (Surface; not Apply IR).
 * No Gio/DBus; unit-testable with mock nodes.
 */

import * as MonitorIdentity from "./monitor-identity.js";
import { isPlaceholderNode } from "./layout-placeholder.js";
import { assertApplyForestWorkspace } from "../shared/assert.js";

export const TREE_QUERY_API_VERSION = 1;

/**
 * @param {any} r
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function projectRect(r) {
  if (!r || typeof r !== "object") return null;
  const x = Number(r.x);
  const y = Number(r.y);
  const width = Number(r.width);
  const height = Number(r.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}

/**
 * Extract plain window fields; never return Meta.Window.
 * @param {any} nodeValue
 * @returns {{
 *   id?: number|string|null,
 *   wmClass: string|null,
 *   title: string|null,
 *   pid?: number|null,
 *   monitor?: number|null,
 * }}
 */
export function windowMetaFields(nodeValue) {
  const out = { wmClass: null, title: null, id: null, pid: null, monitor: null };
  if (!nodeValue || typeof nodeValue !== "object") return out;

  try {
    if (typeof nodeValue.get_wm_class === "function") {
      out.wmClass = nodeValue.get_wm_class() || null;
    } else if (typeof nodeValue.wm_class === "string") {
      out.wmClass = nodeValue.wm_class;
    }
  } catch (_e) {
    out.wmClass = null;
  }

  try {
    if (typeof nodeValue.get_title === "function") {
      out.title = nodeValue.get_title() || null;
    } else if (typeof nodeValue.title === "string") {
      out.title = nodeValue.title;
    }
  } catch (_e) {
    out.title = null;
  }

  try {
    if (typeof nodeValue.get_wm_class_instance === "function") {
      out.wmClassInstance = nodeValue.get_wm_class_instance() || null;
    } else if (typeof nodeValue.wm_class_instance === "string") {
      out.wmClassInstance = nodeValue.wm_class_instance;
    }
  } catch (_e) {
    out.wmClassInstance = null;
  }

  try {
    if (typeof nodeValue.get_id === "function") {
      out.id = nodeValue.get_id();
    } else if (nodeValue.id != null) {
      out.id = nodeValue.id;
    }
  } catch (_e) {
    out.id = null;
  }

  try {
    if (typeof nodeValue.get_pid === "function") {
      const pid = nodeValue.get_pid();
      if (pid > 0) out.pid = pid;
    } else if (typeof nodeValue.pid === "number" && nodeValue.pid > 0) {
      out.pid = nodeValue.pid;
    }
  } catch (_e) {
    out.pid = null;
  }

  try {
    if (typeof nodeValue.get_monitor === "function") {
      const mon = nodeValue.get_monitor();
      if (typeof mon === "number" && mon >= 0) out.monitor = mon;
    } else if (typeof nodeValue._monitor === "number") {
      out.monitor = nodeValue._monitor;
    }
  } catch (_e) {
    out.monitor = null;
  }

  return out;
}

/**
 * @param {any} node
 * @param {{
 *   maxDepth?: number|null,
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 * }} [options]
 * @param {number} [depth]
 * @returns {object|null}
 */
export function projectNode(node, options = {}, depth = 0) {
  if (!node) return null;
  const maxDepth = options.maxDepth;
  if (maxDepth != null && depth > maxDepth) return null;

  const nodeType = node.nodeType ?? null;
  const isWindow =
    nodeType === "WINDOW" || (typeof node.isWindow === "function" && node.isWindow());
  const isMonitor =
    nodeType === "MONITOR" || (typeof node.isMonitor === "function" && node.isMonitor());

  /** @type {Record<string, any>} */
  const out = {
    nodeType,
    layout: node.layout ?? null,
    rect: projectRect(node.rect),
    percent: typeof node.percent === "number" ? node.percent : 0,
    userSized: !!node.userSized,
    children: [],
  };

  if (isMonitor) {
    const id = typeof node.nodeValue === "string" ? node.nodeValue : null;
    out.id = id;
    const liveMap = options.liveMap;
    if (liveMap?.byIndex && id) {
      const idx = MonitorIdentity.monIndexFromId(id);
      const key = idx >= 0 ? liveMap.byIndex.get(idx) : undefined;
      if (key) out.stableKey = key;
    } else if (node.stableKey) {
      out.stableKey = node.stableKey;
    }
  }

  if (isWindow) {
    const meta = windowMetaFields(node.nodeValue);
    out.wmClass = meta.wmClass;
    if (meta.wmClassInstance != null) out.wmClassInstance = meta.wmClassInstance;
    out.title = meta.title;
    if (meta.id != null) out.windowId = meta.id;
    if (meta.pid != null) out.pid = meta.pid;
    if (meta.monitor != null) out.monitor = meta.monitor;
    out.mode = node.mode ?? null;
    if (node.zoomMode) out.zoomMode = node.zoomMode;
    // AC4: CLI/debug GetTree — reserved thrash/fail-open slot.
    if (isPlaceholderNode(node) || node.placeholder === true) {
      out.placeholder = true;
      if (node.placeholderReason != null) out.placeholderReason = node.placeholderReason;
      // CT1: slot-tagged skeleton PHs for bind claim.
      const layoutSlot =
        node.layoutSlot ?? (meta && typeof meta === "object" ? meta.layoutSlot : null);
      const layoutRole =
        node.layoutRole ?? (meta && typeof meta === "object" ? meta.layoutRole : null);
      if (layoutSlot != null) out.layoutSlot = String(layoutSlot);
      if (layoutRole != null) out.layoutRole = String(layoutRole);
    }
  } else if (node.lastTabFocus) {
    // Which tab/stack leaf is raised (Meta.Window or id).
    try {
      const tf = node.lastTabFocus;
      const meta = windowMetaFields(typeof tf === "object" ? tf : { id: tf });
      if (meta.id != null) out.lastTabFocusId = meta.id;
      else if (tf != null && typeof tf !== "object") out.lastTabFocusId = tf;
    } catch (_e) {
      // optional
    }
  }

  if (maxDepth != null && depth === maxDepth) {
    // Cap: include this node but do not descend.
    return out;
  }

  const kids = node.childNodes || [];
  out.children = kids.map((c) => projectNode(c, options, depth + 1)).filter((c) => c != null);

  return out;
}

/**
 * Project a single root (or any subtree).
 * @param {any} root
 * @param {{ maxDepth?: number|null, liveMap?: any }} [options]
 */
export function projectTree(root, options = {}) {
  return projectNode(root, options, 0);
}

/**
 * Whether a MONITOR node matches filter options.
 * @param {any} monNode
 * @param {{
 *   monitor?: number|string|null,
 *   workspace?: number|null,
 *   liveMap?: import('./monitor-identity.js').LiveMap|null,
 * }} options
 */
export function monitorMatches(monNode, options = {}) {
  if (!monNode) return false;
  const id = typeof monNode.nodeValue === "string" ? monNode.nodeValue : monNode.id ?? null;
  if (id == null) return false;

  const monIdx = MonitorIdentity.monIndexFromId(id);
  const wsIdx = MonitorIdentity.workspaceFromId(id);

  if (options.workspace != null && options.workspace !== "") {
    const wantWs = Number(options.workspace);
    if (Number.isFinite(wantWs) && wsIdx !== wantWs) return false;
  }

  if (options.monitor == null || options.monitor === "") return true;

  const mon = options.monitor;
  if (typeof mon === "number" || (typeof mon === "string" && /^-?\d+$/.test(mon))) {
    return monIdx === Number(mon);
  }
  if (typeof mon === "string") {
    if (mon === id) return true;
    // stableKey match via liveMap or node field
    if (monNode.stableKey && monNode.stableKey === mon) return true;
    const liveMap = options.liveMap;
    if (liveMap?.byIndex && monIdx >= 0) {
      const key = liveMap.byIndex.get(monIdx);
      if (key && key === mon) return true;
    }
    // conn:… / name:… / geom:… or bare connector token
    if (liveMap?.byKey?.has(mon)) {
      const idx = liveMap.byKey.get(mon);
      return monIdx === idx;
    }
  }
  return false;
}

/**
 * Project MONITOR nodes to GetTree JSON (Surface dump; not planner input).
 * @param {Iterable<any>} monitorNodes
 * @param {{
 *   maxDepth?: number|null,
 *   liveMap?: any,
 *   monitor?: number|string|null,
 *   workspace?: number|null,
 *   onlyWithChildren?: boolean,
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
 * }}
 */
export function projectForest(monitorNodes, options = {}) {
  const monitors = [];
  for (const mon of monitorNodes || []) {
    if (!monitorMatches(mon, options)) continue;
    if (options.onlyWithChildren && !(mon?.childNodes?.length > 0)) continue;
    const proj = projectNode(mon, options, 0);
    if (proj) monitors.push(proj);
  }
  /** @type {{
   *   apiVersion: number,
   *   monitors: object[],
   *   focusWindowId?: string|number,
   *   lastTileFocusWindowId?: string|number,
   *   activeWorkspace?: number,
   *   nWorkspaces?: number,
   * }} */
  const out = { apiVersion: TREE_QUERY_API_VERSION, monitors };
  if (options.focusWindowId !== undefined && options.focusWindowId !== null) {
    out.focusWindowId = options.focusWindowId;
  }
  if (options.lastTileFocusWindowId !== undefined && options.lastTileFocusWindowId !== null) {
    out.lastTileFocusWindowId = options.lastTileFocusWindowId;
  }
  // Session meta for layout CLI (WS1): 0-based Meta index + count.
  if (options.activeWorkspace !== undefined && options.activeWorkspace !== null) {
    const idx = Number(options.activeWorkspace);
    if (Number.isFinite(idx)) out.activeWorkspace = idx;
  }
  if (options.nWorkspaces !== undefined && options.nWorkspaces !== null) {
    const n = Number(options.nWorkspaces);
    if (Number.isFinite(n) && n >= 0) out.nWorkspaces = n;
  }
  if (options.workspace != null && options.workspace !== "") {
    assertApplyForestWorkspace(out, options.workspace);
  }
  return out;
}
