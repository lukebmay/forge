// @ts-check
/**
 * ForgeAdapterGnome projection: GObject (or duck) Node ↔ TOM Forest.
 * No Mark 2 policy, Mutter, epochs restore, or proto imports.
 */

import St from "gi://St";

import { createHostBag } from "../host/index.js";
import { attachSession } from "../session/index.js";
import { mark2CleanupUnder } from "../rulesets/mark2.js";
import { Logger } from "../shared/logger.js";
import { isFloatOrIgnoreClassToken, windowMatchesRoleToken } from "../shared/layout-plan.js";
import {
  ancestorMonitor,
  appendChild,
  breakout,
  children,
  createEnvelope,
  createTomApi,
  destroyNode,
  equalizeChildren,
  floatsOf,
  insertAfter,
  insertBefore,
  inventConUnder,
  inventWindowUnder,
  isUnder,
  isUnderFloats,
  isUnderTiles,
  layoutUnit,
  makeIdFactory,
  monDirectAncestor,
  moveWindowToFloats,
  moveWindowToTiles,
  parent as tomParent,
  promoteChildren,
  replaceChildren,
  setLastTabFocus,
  setLayout,
  siblingCon,
  swapSiblings,
  tilesOf,
  tilesParentBeforeFloat,
  unwrapUnarySplit,
  windowIsFloating,
  wrapNodes,
} from "../tom/index.js";
import { attachWorld } from "../world/index.js";
import { recordInvariant } from "./metrics.js";
import { NODE_TYPES, Node } from "./tree.js";
import {
  createPlaceholderStub,
  isPlaceholderNode,
  layoutPlaceholderTitle,
  markPlaceholderNode,
  PLACEHOLDER_SKELETON_LAYOUT_REASON,
  PLACEHOLDER_WM_CLASS,
} from "./layout-placeholder.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} TomNode */

const KINDS = new Set(["ROOT", "WORKSPACE", "MONITOR", "CON", "WINDOW"]);
const LAYOUTS = new Set(["HSPLIT", "VSPLIT", "TABBED", "STACKED"]);

/**
 * @param {any} node
 * @returns {string|null}
 */
export function liveKind(node) {
  if (!node) return null;
  if (typeof node.isWindow === "function" && node.isWindow()) return "WINDOW";
  if (typeof node.isCon === "function" && node.isCon()) return "CON";
  if (typeof node.isMonitor === "function" && node.isMonitor()) return "MONITOR";
  if (typeof node.isWorkspace === "function" && node.isWorkspace()) return "WORKSPACE";
  if (typeof node.isRoot === "function" && node.isRoot()) return "ROOT";
  const t = node.nodeType || node.kind;
  return KINDS.has(t) ? t : null;
}

/** @param {any} node */
export function childrenOf(node) {
  if (!node) return [];
  const list = node.childNodes;
  return Array.isArray(list) ? [...list] : [];
}

/** Live parent is a TILES CON/MONITOR (not FLOATS / detached). */
export function liveTilesParented(live) {
  const k = liveKind(live?.parentNode);
  return k === "CON" || k === "MONITOR";
}

/** @param {any} node */
function liveMonitorAncestor(node) {
  let p = node;
  while (p) {
    if (liveKind(p) === "MONITOR") return p;
    p = p.parentNode;
  }
  return null;
}

/**
 * Leftover empty CON: detach. Leftover WINDOW: MONITOR.
 * @param {any} bagLive
 * @param {any[]} extras
 */
function rehomeBagExtras(bagLive, extras) {
  const mon = liveMonitorAncestor(bagLive);
  for (const extra of extras) liftLiveOntoMonitor(extra, mon);
}

/**
 * @param {any} node
 * @param {any} mon
 */
function liftLiveOntoMonitor(node, mon) {
  const kind = liveKind(node);
  if (kind === "WINDOW") {
    if (mon && typeof mon.appendChild === "function") mon.appendChild(node);
    return;
  }
  if (kind !== "CON") return;
  for (const c of childrenOf(node)) liftLiveOntoMonitor(c, mon);
  if (typeof node._destroyDecoration === "function") {
    try {
      node._destroyDecoration();
    } catch (_e) {
      /* disposed chrome */
    }
  }
  const p = node.parentNode;
  if (p && typeof p.removeChild === "function" && childrenOf(p).includes(node)) {
    try {
      p.removeChild(node);
    } catch (_e) {
      /* already detached */
    }
  }
}

/**
 * FLOAT always belongs in FLOATS. GRAB_TILE does too unless
 * `treatGrabTileAsTiles` (DnD commit — still on the tiling spine).
 * @param {any} live
 * @param {{ treatGrabTileAsTiles?: boolean }} [opts]
 */
export function isUnmanagedWindow(live, opts = {}) {
  if (!live) return false;
  if (typeof live.isFloat === "function" && live.isFloat()) return true;
  if (live.mode === "FLOAT") return true;
  const grab =
    (typeof live.isGrabTile === "function" && live.isGrabTile()) || live.mode === "GRAB_TILE";
  if (!grab) return false;
  return !opts.treatGrabTileAsTiles;
}

/** @param {any} node */
function liveLayout(node) {
  const l = node?.layout;
  return LAYOUTS.has(l) ? l : "HSPLIT";
}

/**
 * @param {any} node
 * @param {{ windowIdOf?: (n: any) => string|null }} hooks
 */
function windowIdOf(node, hooks) {
  if (typeof hooks.windowIdOf === "function") {
    const id = hooks.windowIdOf(node);
    if (id != null && id !== "") return String(id);
  }
  const v = node?.nodeValue;
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v.id != null) return String(v.id);
  return null;
}

/** @param {any} node @param {any} hooks */
function lastTabFocusIdOf(node, hooks) {
  if (node?.lastTabFocusId != null && node.lastTabFocusId !== "") {
    return String(node.lastTabFocusId);
  }
  const meta = node?.lastTabFocus;
  if (meta == null) return undefined;
  if (typeof meta === "string" || typeof meta === "number") return String(meta);
  if (typeof hooks.windowIdOf === "function") {
    const fake = { nodeValue: meta };
    const id = hooks.windowIdOf(fake);
    if (id != null && id !== "") return String(id);
  }
  if (meta.id != null) return String(meta.id);
  return undefined;
}

/**
 * @param {object[]} workareas
 * @param {string} monId
 * @param {number} index
 */
function geomFor(workareas, monId, index) {
  const list = Array.isArray(workareas) ? workareas : [];
  const hit = list.find((w) => w && String(w.id) === String(monId));
  const g = hit || list[index] || {};
  return {
    id: monId,
    x: Number.isFinite(g.x) ? g.x : index * 1920,
    y: Number.isFinite(g.y) ? g.y : 0,
    width: Number.isFinite(g.width) ? g.width : 1920,
    height: Number.isFinite(g.height) ? g.height : 1080,
    primary: g.primary != null ? !!g.primary : index === 0,
  };
}

/**
 * @param {any} liveRoot
 * @param {{
 *   windowIdOf: (node: any) => string|null,
 *   createCon?: () => any,
 *   workareas?: object[],
 *   focusId?: string|null,
 *   treatGrabTileAsTiles?: boolean,
 * }} hooks
 * @returns {{ forest: Forest, liveById: Map<string, any>, api: object }|null}
 */
export function projectLiveForest(liveRoot, hooks) {
  if (!liveRoot || !hooks || typeof hooks.windowIdOf !== "function") return null;
  if (liveKind(liveRoot) !== "ROOT") return null;

  const ids = makeIdFactory(1);
  const forest = createEnvelope(() => ids.nid());
  /** @type {Map<string, any>} */
  const liveById = new Map();
  let wsSeq = 0;
  let monSeq = 0;
  const floatBag = floatsOf(forest);

  /**
   * @param {any} live
   * @param {string|null} parentId
   * @returns {TomNode|null}
   */
  function visit(live, parentId) {
    const kind = liveKind(live);
    if (!kind) return null;

    const unmanaged = kind === "WINDOW" && isUnmanagedWindow(live, hooks);
    const homeId = unmanaged && floatBag ? floatBag.id : parentId;

    let id;
    if (kind === "ROOT") {
      id = "ROOT";
    } else if (kind === "WINDOW") {
      id = windowIdOf(live, hooks);
      if (id == null || id === "") return null;
    } else if (kind === "WORKSPACE") {
      const v = live.nodeValue;
      id = typeof v === "string" && v ? v : `ws${wsSeq++}`;
    } else if (kind === "MONITOR") {
      const v = live.nodeValue;
      id = typeof v === "string" && v ? v : `mo${monSeq++}`;
    } else {
      id = ids.nid();
    }

    const existing = forest.nodes[id];
    if (existing) {
      liveById.set(id, live);
      if (kind === "MONITOR" && !forest.monitors.includes(existing)) {
        forest.monitors.push(existing);
      }
      if (unmanaged && floatBag && !floatBag.childIds.includes(id)) {
        floatBag.childIds.push(id);
        existing.parentId = floatBag.id;
      }
      for (const ch of childrenOf(live)) {
        const child = visit(ch, existing.id);
        if (child && child.parentId === existing.id && !existing.childIds.includes(child.id)) {
          existing.childIds.push(child.id);
        }
      }
      return existing;
    }

    /** @type {TomNode} */
    const tom = {
      id,
      kind,
      parentId: homeId,
      childIds: [],
      percent: Number.isFinite(live.percent) ? live.percent : 0,
      userSized: !!live.userSized,
    };
    if (kind === "CON" || kind === "MONITOR") tom.layout = liveLayout(live);
    if (kind === "WINDOW") {
      const v = live.nodeValue;
      if (v && typeof v === "object") {
        if (v.wm_class) tom.wmClass = String(v.wm_class);
        if (v.title) tom.label = String(v.title);
      }
    }
    const tabId = lastTabFocusIdOf(live, hooks);
    if (tabId) tom.lastTabFocusId = tabId;

    forest.nodes[id] = tom;
    liveById.set(id, live);
    if (kind === "MONITOR") forest.monitors.push(tom);
    if (unmanaged && floatBag && !floatBag.childIds.includes(id)) {
      floatBag.childIds.push(id);
    }

    for (const ch of childrenOf(live)) {
      const child = visit(ch, id);
      if (child && child.parentId === tom.id && !tom.childIds.includes(child.id)) {
        tom.childIds.push(child.id);
      }
    }
    return tom;
  }

  const root = visit(liveRoot, null);
  if (!root) return null;
  forest.rootId = root.id;
  forest.tilesId = root.id;

  const api = createTomApi();
  api.hydrateSeq(forest);

  /** @type {Record<string, import('../world/index.js').MonitorGeom>} */
  const geoms = {};
  forest.monitors.forEach((m, i) => {
    geoms[m.id] = geomFor(hooks.workareas || [], m.id, i);
  });
  attachWorld(forest, { geoms });
  attachSession(forest, {
    decisions: {
      policyEnabled: true,
      opsetId: "mark2",
      edgeMove: "wrap",
    },
  });

  const focusId = hooks.focusId != null && hooks.focusId !== "" ? String(hooks.focusId) : null;
  if (focusId && forest.nodes[focusId]) {
    forest.focusId = focusId;
    forest.selectionId = focusId;
  }

  return { forest, liveById, api };
}

/**
 * @param {any} live
 * @param {string} layout
 */
function writeLayout(live, layout) {
  if (!live || !layout) return;
  if (typeof live.setLayout === "function") {
    live.setLayout(layout);
    return;
  }
  live.layout = layout;
}

/**
 * Default Meta/windowId extractor for seed / focus bridge.
 * @param {any} node
 * @returns {string|null}
 */
function defaultWindowIdOf(node) {
  const v = node?.nodeValue;
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  try {
    if (typeof v.get_id === "function") {
      const id = v.get_id();
      if (id !== undefined && id !== null) return String(id);
    }
  } catch (_e) {
    /* disposed */
  }
  if (v.id != null) return String(v.id);
  return null;
}

/**
 * Rewrite projected WINDOW Meta-windowId keys → nanoids; fill hostBag.
 * When `preserve`, reuse bag reverse-index nanoids (stable across spine sync).
 * @param {Forest} forest
 * @param {Map<string, any>} liveById
 * @param {import('../host/bag.js').HostBag} hostBag
 * @param {(node: any) => string|null} windowIdOf
 * @param {{ preserve?: boolean }} [opts]
 * @returns {Map<string, any>}
 */
function remapProjectedWindows(forest, liveById, hostBag, windowIdOf, opts = {}) {
  const ids = makeIdFactory(1);
  const preserve = !!opts.preserve;
  /** @type {Map<string, string>} */
  const oldToNew = new Map();
  /** @type {Map<string, any>} */
  const nextLive = new Map();
  /** @type {Set<string>} */
  const keptWindowIds = new Set();

  for (const [oldId, live] of liveById) {
    if (liveKind(live) !== "WINDOW") {
      nextLive.set(oldId, live);
      continue;
    }
    const meta = live.nodeValue;
    const wid = windowIdOf(live);
    let newId = null;
    if (preserve) {
      if (meta && typeof meta === "object") newId = hostBag.idFromMeta(meta) || null;
      if (!newId && wid != null && wid !== "") newId = hostBag.idFromWindowId(wid) || null;
    }
    if (!newId) newId = ids.nid();
    oldToNew.set(oldId, newId);
    keptWindowIds.add(newId);

    const tom = forest.nodes[oldId];
    if (tom) {
      if (oldId !== newId) {
        delete forest.nodes[oldId];
        tom.id = newId;
        forest.nodes[newId] = tom;
      }
    }
    nextLive.set(newId, live);
    hostBag.set(newId, {
      meta: meta && typeof meta === "object" ? meta : undefined,
      windowId: wid != null && wid !== "" ? String(wid) : String(oldId),
      floating: !!(tom && isUnderFloats(forest, tom)),
    });
  }

  if (preserve) {
    for (const [id, entry] of [...hostBag.entries()]) {
      if (entry?.windowId == null || entry.windowId === "") continue;
      if (keptWindowIds.has(id)) continue;
      if (!forest.nodes[id] || forest.nodes[id].kind === "WINDOW") {
        hostBag.delete(id);
      }
    }
  }

  if (oldToNew.size === 0) return nextLive;

  for (const tom of Object.values(forest.nodes)) {
    if (Array.isArray(tom.childIds) && tom.childIds.length) {
      tom.childIds = tom.childIds.map((cid) => oldToNew.get(cid) ?? cid);
    }
    if (tom.parentId && oldToNew.has(tom.parentId)) {
      tom.parentId = oldToNew.get(tom.parentId);
    }
    if (tom.lastTabFocusId && oldToNew.has(tom.lastTabFocusId)) {
      tom.lastTabFocusId = oldToNew.get(tom.lastTabFocusId);
    }
  }

  if (forest.focusId && oldToNew.has(forest.focusId)) {
    forest.focusId = oldToNew.get(forest.focusId);
  }
  if (forest.selectionId && oldToNew.has(forest.selectionId)) {
    forest.selectionId = oldToNew.get(forest.selectionId);
  }

  return nextLive;
}

/**
 * One-shot seed: project GObject tree → durable wm.forest; WINDOW ids = nanoid in hostBag.
 * Pass `preserveHostIds: true` to keep existing WINDOW nanoids (spine sync / re-attach).
 * @param {any} wm
 * @param {{
 *   windowIdOf?: (node: any) => string|null,
 *   createCon?: () => any,
 *   workareas?: object[],
 *   focusId?: string|null,
 *   treatGrabTileAsTiles?: boolean,
 *   preserveHostIds?: boolean,
 * }} [hooks]
 * @returns {{ forest: Forest, liveById: Map<string, any>, api: object }|null}
 */
export function seedLiveForest(wm, hooks = {}) {
  if (!wm?.tree) return null;
  const windowIdOf = typeof hooks.windowIdOf === "function" ? hooks.windowIdOf : defaultWindowIdOf;
  const projected = projectLiveForest(wm.tree, { ...hooks, windowIdOf });
  if (!projected) return null;

  const preserve = !!hooks.preserveHostIds && !!wm.hostBag && wm.hostBag.size > 0;
  if (!wm.hostBag) wm.hostBag = createHostBag();
  else if (!preserve) wm.hostBag.clear();

  const liveById = remapProjectedWindows(
    projected.forest,
    projected.liveById,
    wm.hostBag,
    windowIdOf,
    { preserve }
  );

  if (hooks.focusId != null && hooks.focusId !== "") {
    const want = String(hooks.focusId);
    let fid = projected.forest.focusId;
    if (!fid || !projected.forest.nodes[fid]) {
      fid = wm.hostBag.idFromWindowId(want);
    }
    if (fid && projected.forest.nodes[fid]) {
      projected.forest.focusId = fid;
      projected.forest.selectionId = fid;
    }
  }

  wm.forest = projected.forest;
  wm.liveById = liveById;
  wm._liveForestSeeded = true;

  return { forest: projected.forest, liveById, api: projected.api };
}

/**
 * Return wm.forest when already seeded; otherwise one-shot seed.
 * @param {any} wm
 * @param {object} [hooks]
 * @returns {Forest|null}
 */
export function ensureLiveForest(wm, hooks = {}) {
  if (wm?.forest && wm._liveForestSeeded) return wm.forest;
  const seeded = seedLiveForest(wm, hooks);
  return seeded ? seeded.forest : wm?.forest || null;
}

/**
 * Rebuild Forest from GObject spine (id-miss / unseeded / tests only).
 * Preserve WINDOW nanoids via hostBag reverse index. Not a post-write live step.
 * @param {any} wm
 * @param {object} [hooks]
 * @returns {Forest|null}
 */
export function syncForestFromTree(wm, hooks = {}) {
  if (!wm?.tree) return null;
  if (wm.forest && wm._liveForestSeeded && wm.hostBag?.size > 0) {
    const seeded = seedLiveForest(wm, { ...hooks, preserveHostIds: true });
    return seeded ? seeded.forest : wm.forest;
  }
  return ensureLiveForest(wm, hooks);
}

/** @param {any} live */
function liveMonitorId(live) {
  let n = live;
  while (n) {
    if (liveKind(n) === "MONITOR") {
      const v = n.nodeValue;
      return typeof v === "string" && v ? v : null;
    }
    n = n.parentNode;
  }
  return null;
}

/**
 * Mirror WORKSPACE / MONITOR live spine into Forest (stable string ids).
 * No-op until Forest is seeded — avoids Tree ctor ↔ seed recursion.
 * @param {any} wm
 * @param {any} liveNode
 * @returns {string|null}
 */
export function forestEnsureSpineNode(wm, liveNode) {
  if (!wm || !liveNode) return null;
  if (!wm._tree || !wm.forest || !wm._liveForestSeeded) return null;
  const forest = wm.forest;
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();

  const kind = liveKind(liveNode);
  if (kind === "WORKSPACE") {
    const id = typeof liveNode.nodeValue === "string" ? liveNode.nodeValue : null;
    if (!id) return null;
    if (!forest.nodes[id]) {
      const root = tilesOf(forest) || forest.nodes[forest.rootId];
      if (!root) return null;
      /** @type {TomNode} */
      const tom = {
        id,
        kind: "WORKSPACE",
        parentId: root.id,
        childIds: [],
        percent: 1,
        userSized: false,
      };
      forest.nodes[id] = tom;
      if (!root.childIds.includes(id)) root.childIds.push(id);
    }
    wm.liveById.set(id, liveNode);
    return id;
  }

  if (kind === "MONITOR") {
    const id = typeof liveNode.nodeValue === "string" ? liveNode.nodeValue : null;
    if (!id) return null;
    const parentLive = liveNode.parentNode;
    if (parentLive && liveKind(parentLive) === "WORKSPACE") {
      forestEnsureSpineNode(wm, parentLive);
    }
    const parentId =
      parentLive && typeof parentLive.nodeValue === "string" ? parentLive.nodeValue : forest.rootId;
    const parentTom = forest.nodes[parentId];
    if (!parentTom) return null;
    if (!forest.nodes[id]) {
      /** @type {TomNode} */
      const tom = {
        id,
        kind: "MONITOR",
        layout: liveLayout(liveNode),
        parentId,
        childIds: [],
        percent: 1,
        userSized: false,
      };
      forest.nodes[id] = tom;
      if (!parentTom.childIds.includes(id)) parentTom.childIds.push(id);
      if (!forest.monitors.includes(tom)) forest.monitors.push(tom);
    } else if (forest.nodes[id].layout == null) {
      forest.nodes[id].layout = liveLayout(liveNode);
    }
    wm.liveById.set(id, liveNode);
    return id;
  }

  return null;
}

/**
 * TILES/FLOATS parent for open insert: live CON/MONITOR when present, else MONITOR.
 * @param {any} wm
 * @param {Forest} forest
 * @param {any} liveNode
 * @param {{ underFloats?: boolean, monitorId?: string|null }} opts
 */
function forestInsertParent(wm, forest, liveNode, opts) {
  if (opts.underFloats) return floatsOf(forest);
  const liveParent = liveNode?.parentNode;
  const pk = liveKind(liveParent);
  if (pk === "CON" || pk === "MONITOR") {
    const pid = forestIdFromLive(wm, liveParent);
    const p = pid ? forest.nodes[pid] : null;
    if (p && (p.kind === "CON" || p.kind === "MONITOR")) return p;
  }
  const monId = opts.monitorId || liveMonitorId(liveNode);
  let mon = monId ? forest.nodes[monId] : null;
  if (!mon || mon.kind !== "MONITOR") mon = forest.monitors[0] || null;
  return mon && mon.kind === "MONITOR" ? mon : null;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} destParent
 * @param {import('../tom/kernel.js').Node} win
 * @param {any} liveNode
 */
function forestPlaceUnder(wm, forest, destParent, win, liveNode) {
  const nextLive = liveNode?.nextSibling;
  if (nextLive) {
    const nextId = forestIdFromLive(wm, nextLive);
    const next = nextId ? forest.nodes[nextId] : null;
    if (next && next.parentId === destParent.id && next.id !== win.id) {
      insertBefore(forest, destParent, win, next);
      return;
    }
  }
  appendChild(forest, destParent, win);
}

/**
 * Insert WINDOW into Forest under live CON/MONITOR (or FLOATS); bag + liveById.
 * Idempotent on meta; reparents if the live parent already exists in Forest.
 * @param {any} wm
 * @param {any} liveNode
 * @param {{
 *   underFloats?: boolean,
 *   monitorId?: string|null,
 *   treatGrabTileAsTiles?: boolean,
 * }} [opts]
 * @returns {string|null} nanoid
 */
export function forestInsertWindow(wm, liveNode, opts = {}) {
  if (!wm || !liveNode || liveKind(liveNode) !== "WINDOW") return null;
  const forest = ensureLiveForest(wm);
  if (!forest || !wm.hostBag) return null;
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();

  const meta = liveNode.nodeValue;
  const existing =
    (meta && typeof meta === "object" && wm.hostBag.idFromMeta(meta)) ||
    wm.hostBag.idFromWindowId(defaultWindowIdOf(liveNode) || "");
  const underFloats =
    typeof opts.underFloats === "boolean" ? opts.underFloats : isUnmanagedWindow(liveNode, opts);
  if (existing && forest.nodes[existing]) {
    wm.liveById.set(existing, liveNode);
    const destParent = forestInsertParent(wm, forest, liveNode, {
      underFloats,
      monitorId: opts.monitorId,
    });
    const tom = forest.nodes[existing];
    if (destParent && tom && tom.parentId !== destParent.id) {
      forestPlaceUnder(wm, forest, destParent, tom, liveNode);
    }
    wm.hostBag.set(existing, { floating: underFloats });
    return existing;
  }

  const monLive = (() => {
    let n = liveNode.parentNode;
    while (n) {
      if (liveKind(n) === "MONITOR") return n;
      n = n.parentNode;
    }
    return null;
  })();
  if (monLive) forestEnsureSpineNode(wm, monLive);

  const destParent = forestInsertParent(wm, forest, liveNode, {
    underFloats,
    monitorId: opts.monitorId,
  });
  if (!destParent) return null;

  const api = createTomApi();
  api.hydrateSeq(forest);
  let label = "";
  let wmClass = "app";
  try {
    if (meta && typeof meta === "object") {
      if (meta.title) label = String(meta.title);
      else if (typeof meta.get_title === "function") label = String(meta.get_title() || "");
      if (meta.wm_class) wmClass = String(meta.wm_class);
      else if (typeof meta.get_wm_class === "function") {
        wmClass = String(meta.get_wm_class() || "app");
      }
    }
  } catch (_e) {
    /* disposed */
  }
  const win = api.makeWindow(label || "win", wmClass || "app");
  api._registerTree(forest, win);
  forestPlaceUnder(wm, forest, destParent, win, liveNode);

  const wid = defaultWindowIdOf(liveNode);
  wm.hostBag.set(win.id, {
    meta: meta && typeof meta === "object" ? meta : undefined,
    windowId: wid != null && wid !== "" ? String(wid) : undefined,
    floating: underFloats,
  });
  wm.liveById.set(win.id, liveNode);
  return win.id;
}

/**
 * Remove WINDOW from Forest; clear hostBag + liveById.
 * @param {any} wm
 * @param {any} liveOrMeta live WINDOW node or Meta
 * @returns {boolean}
 */
export function forestRemoveWindow(wm, liveOrMeta) {
  const bag = wm?.hostBag;
  const forest = wm?.forest;
  if (!bag || !forest) return false;

  let id;
  let meta = null;
  if (liveOrMeta && liveKind(liveOrMeta) === "WINDOW") {
    meta = liveOrMeta.nodeValue;
    id = meta && typeof meta === "object" ? bag.idFromMeta(meta) : undefined;
    if (!id && wm.liveById instanceof Map) {
      for (const [nid, live] of wm.liveById) {
        if (live === liveOrMeta) {
          id = nid;
          break;
        }
      }
    }
  } else if (liveOrMeta && typeof liveOrMeta === "object") {
    meta = liveOrMeta;
    id = bag.idFromMeta(meta);
  }

  if (!id && meta) {
    const wid = defaultWindowIdOf({ nodeValue: meta });
    if (wid != null) id = bag.idFromWindowId(wid);
  }
  if (!id) return false;

  const tom = forest.nodes[id];
  if (tom && tom.kind === "WINDOW") {
    destroyNode(forest, id);
  }
  bag.delete(id);
  wm.liveById?.delete?.(id);
  return true;
}

/**
 * GObject WINDOW via host bag reverse index. Null if unseeded / bag miss / liveById miss.
 * @param {any} wm
 * @param {any} meta
 * @returns {any|null}
 */
export function liveWindowFromMeta(wm, meta) {
  if (!meta || typeof meta !== "object") return null;
  if (!wm?._liveForestSeeded || !wm.hostBag) return null;
  const id = wm.hostBag.idFromMeta(meta);
  if (!id) return null;
  return wm.liveById?.get?.(id) ?? null;
}

/**
 * Resolve Forest WINDOW id for a live node / Meta.
 * @param {any} wm
 * @param {any} liveOrMeta
 * @returns {string|null}
 */
export function forestWindowId(wm, liveOrMeta) {
  const bag = wm?.hostBag;
  if (!bag) return null;
  if (liveOrMeta && liveKind(liveOrMeta) === "WINDOW") {
    const fromFocus = resolveForestFocusId(wm, liveOrMeta);
    if (fromFocus) return fromFocus;
  }
  if (liveOrMeta && typeof liveOrMeta === "object" && liveKind(liveOrMeta) !== "WINDOW") {
    const fromMeta = bag.idFromMeta(liveOrMeta);
    if (fromMeta) return fromMeta;
    const wid = defaultWindowIdOf({ nodeValue: liveOrMeta });
    if (wid != null) {
      const fromWid = bag.idFromWindowId(wid);
      if (fromWid) return fromWid;
    }
  }
  return null;
}

/**
 * TILES parent for re-tile: live parent → focus parent → first MONITOR.
 * @param {any} wm
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {any} liveNode
 * @returns {import('../tom/kernel.js').Node|null}
 */
function resolveRetileParent(wm, forest, liveNode) {
  const liveParent = liveNode?.parentNode;
  if (liveParent && wm.liveById instanceof Map) {
    for (const [id, live] of wm.liveById) {
      if (live === liveParent && forest.nodes[id] && isUnderTiles(forest, forest.nodes[id])) {
        return forest.nodes[id];
      }
    }
  }
  const focusId = forest.focusId || forest.selectionId;
  if (focusId && forest.nodes[focusId]) {
    const focus = forest.nodes[focusId];
    if (!isUnderFloats(forest, focus)) {
      const p = tomParent(forest, focus);
      if (p && (p.kind === "MONITOR" || p.kind === "CON") && isUnderTiles(forest, p)) return p;
      const mon = ancestorMonitor(forest, focus);
      if (mon) return mon;
    }
  }
  return forest.monitors[0] || null;
}

/**
 * Forest FLOATS ↔ TILES membership, then bag `floating` bridge (until C7).
 * Does not paint — caller commits / paintLiveForest.
 * @param {any} wm
 * @param {any} liveNode
 * @param {boolean} floating
 * @param {{ tilesParentId?: string|null }} [opts]
 * @returns {boolean}
 */
export function forestSetWindowFloating(wm, liveNode, floating, opts = {}) {
  if (!wm || !liveNode || liveKind(liveNode) !== "WINDOW") return false;
  const forest = ensureLiveForest(wm);
  if (!forest || !wm.hostBag) return false;
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();

  let id = forestWindowId(wm, liveNode);
  if (!id || !forest.nodes[id]) {
    id = forestInsertWindow(wm, liveNode, { underFloats: !!floating });
  }
  if (!id) return false;
  const tom = forest.nodes[id];
  if (!tom || tom.kind !== "WINDOW") return false;

  wm.liveById.set(id, liveNode);

  if (floating) {
    if (isUnderFloats(forest, tom)) {
      wm.hostBag.set(id, { floating: true });
      return true;
    }
    const prior = tilesParentBeforeFloat(forest, tom);
    const r = moveWindowToFloats(forest, tom);
    if (!r?.ok) return false;
    const mon = prior ? ancestorMonitor(forest, prior) : null;
    if (mon) mark2CleanupUnder(forest, mon);
    else if (prior && (prior.kind === "MONITOR" || prior.kind === "CON")) {
      mark2CleanupUnder(forest, prior);
    }
    wm.hostBag.set(id, { floating: true });
  } else {
    if (!isUnderFloats(forest, tom) && isUnderTiles(forest, tom)) {
      wm.hostBag.set(id, { floating: false });
      return true;
    }
    const tilesParent =
      (opts.tilesParentId && forest.nodes[opts.tilesParentId]) ||
      resolveRetileParent(wm, forest, liveNode);
    if (!tilesParent || tilesParent.kind === "FLOATS") return false;
    const r = moveWindowToTiles(forest, tom, tilesParent);
    if (!r?.ok) return false;
    const mon = ancestorMonitor(forest, tom);
    if (mon) mark2CleanupUnder(forest, mon);
    wm.hostBag.set(id, { floating: false });
  }
  return true;
}

/**
 * mode↔FLOATS paint bridge until C7.
 * @param {any} live
 */
function paintFloatModeBridge(live) {
  if (!live) return;
  const grab =
    (typeof live.isGrabTile === "function" && live.isGrabTile()) || live.mode === "GRAB_TILE";
  if (grab) return;
  try {
    live.float = true;
  } catch (_e) {
    /* duck / disposed */
  }
  if (live.mode !== "FLOAT") live.mode = "FLOAT";
  if ("renderRect" in live) live.renderRect = null;
  if ("_rect" in live) live._rect = null;
}

/**
 * Resolve Mark 2 focus id via hostBag Meta/windowId → nanoid only.
 * @param {any} wm
 * @param {any} focusNodeWindow
 * @returns {string|null}
 */
export function resolveForestFocusId(wm, focusNodeWindow) {
  const bag = wm?.hostBag;
  if (!bag) return null;
  const meta = focusNodeWindow?.nodeValue;
  if (meta && typeof meta === "object") {
    const fromMeta = bag.idFromMeta(meta);
    if (fromMeta) return fromMeta;
  }
  const wid = defaultWindowIdOf(focusNodeWindow);
  if (wid != null) {
    const fromWid = bag.idFromWindowId(wid);
    if (fromWid) return fromWid;
  }
  return null;
}

/**
 * Find live node whose nodeValue is `actor` (CON chrome in hostBag).
 * @param {Map<string, any>|null|undefined} liveById
 * @param {any} actor
 * @param {any} [treeRoot]
 */
function liveFromActor(liveById, actor, treeRoot) {
  if (!actor || typeof actor !== "object") return null;
  if (liveById) {
    for (const live of liveById.values()) {
      if (live?.nodeValue === actor) return live;
    }
  }
  const root =
    treeRoot ||
    liveById?.get?.("ROOT") ||
    (liveById && [...liveById.values()].find((n) => liveKind(n) === "ROOT")) ||
    null;
  if (!root) return null;
  const walk = (n) => {
    if (!n) return null;
    if (n.nodeValue === actor) return n;
    for (const c of childrenOf(n)) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root);
}

/**
 * Build id→live map for paint.
 * WINDOW: liveById / bag meta → findNode; CON: liveById or hostBag.actor; spine: liveById.
 * @param {any} wm
 * @param {Forest} forest
 * @returns {Map<string, any>}
 */
export function rebuildLiveById(wm, forest) {
  /** @type {Map<string, any>} */
  const map = wm.liveById instanceof Map ? new Map(wm.liveById) : new Map();
  const bag = wm.hostBag;
  const tree = wm.tree;

  for (const [id, tom] of Object.entries(forest.nodes || {})) {
    if (tom.kind === "WINDOW") {
      const entry = bag?.get?.(id);
      let live = map.get(id) || liveWindowFromMeta(wm, entry?.meta) || null;
      if (!live && entry?.meta && typeof tree?.findNode === "function") {
        try {
          live = tree.findNode(entry.meta);
        } catch (_e) {
          live = null;
        }
      }
      if (live) map.set(id, live);
      continue;
    }
    if (tom.kind === "CON" && !map.has(id)) {
      const entry = bag?.get?.(id);
      const fromActor = entry?.actor ? liveFromActor(map, entry.actor, tree) : null;
      if (fromActor) map.set(id, fromActor);
      continue;
    }
    if (!map.has(id) && tom.kind === "ROOT" && tree) {
      map.set(id, tree);
    }
  }

  wm.liveById = map;
  return map;
}

/**
 * Ensure a live CON for Forest id — reuse hostBag.actor before inventing.
 * @param {string} id
 * @param {Map<string, any>} liveById
 * @param {{
 *   createCon: () => any,
 *   hostBag?: import('../host/bag.js').HostBag,
 * }} hooks
 */
function ensureLiveCon(id, liveById, hooks) {
  let live = liveById.get(id);
  if (live) return live;
  const entry = hooks.hostBag?.get?.(id);
  if (entry?.actor) {
    const root = liveById.get("ROOT");
    live = liveFromActor(liveById, entry.actor, root);
    if (live) {
      liveById.set(id, live);
      return live;
    }
  }
  live = hooks.createCon();
  liveById.set(id, live);
  const actor = live?.nodeValue;
  hooks.hostBag?.set(id, {
    actor: actor && typeof actor === "object" ? actor : undefined,
  });
  return live;
}

/**
 * Paint / reconcile live actors from Forest + host bag (Forest already mutated).
 * TILES child order may mirror via replaceChildren for chrome — not topology SoT.
 * @param {Forest} forest
 * @param {Map<string, any>} liveById
 * @param {{
 *   createCon: () => any,
 *   windowIdOf?: (n: any) => string|null,
 *   hostBag?: import('../host/bag.js').HostBag,
 * }} hooks
 */
export function paintLiveForest(forest, liveById, hooks) {
  if (!forest || !liveById || typeof hooks?.createCon !== "function") return;

  const floatBag = floatsOf(forest);
  const floatIds = new Set(floatBag?.childIds || []);
  const claimed = new Set();
  const deferFloatLive = new Set();
  for (const [id, tom] of Object.entries(forest.nodes)) {
    let live = liveById.get(id);
    if (!live) {
      if (tom.kind === "CON") {
        live = ensureLiveCon(id, liveById, hooks);
      } else {
        continue;
      }
    }
    const deferFloat = floatIds.has(id) && hooks.hostBag?.get?.(id)?.floating !== true;
    if (deferFloat) deferFloatLive.add(live);
    else claimed.add(live);
    if (tom.kind === "CON" || tom.kind === "MONITOR") {
      if (tom.layout) writeLayout(live, tom.layout);
    }
    if (Number.isFinite(tom.percent)) live.percent = tom.percent;
    live.userSized = !!tom.userSized;
  }

  /**
   * Mirror Forest kids onto live chrome (paint only).
   * @param {TomNode} tom
   */
  function paintKids(tom) {
    const live = liveById.get(tom.id);
    if (!live || typeof live.replaceChildren !== "function") return;
    if (tom.kind === "WINDOW") return;

    const want = [];
    const wantSet = new Set();
    for (const cid of tom.childIds) {
      const ch = liveById.get(cid);
      if (!ch) continue;
      want.push(ch);
      wantSet.add(ch);
    }
    const extras = childrenOf(live).filter((c) => {
      if (wantSet.has(c) || claimed.has(c)) return false;
      if (deferFloatLive.has(c)) return true;
      return !isUnmanagedWindow(c, hooks);
    });
    const bagLayout = tom.layout === "TABBED" || tom.layout === "STACKED";
    if (bagLayout && tom.kind === "CON") {
      live.replaceChildren(want);
      rehomeBagExtras(live, extras);
    } else {
      live.replaceChildren([...want, ...extras]);
    }
    for (const cid of tom.childIds) {
      const chTom = forest.nodes[cid];
      if (chTom) paintKids(chTom);
    }
  }

  const root = tilesOf(forest) || forest.nodes[forest.rootId];
  if (root) paintKids(root);

  // FLOATS: detach from TILES, mode bridge via bag meta — no ROOT park / no tile slots.
  if (floatBag) {
    for (const cid of floatBag.childIds) {
      let liveFloat = liveById.get(cid);
      const entry = hooks.hostBag?.get?.(cid);
      if (!liveFloat && entry?.meta && typeof hooks.findNode === "function") {
        try {
          liveFloat = hooks.findNode(entry.meta);
        } catch (_e) {
          liveFloat = null;
        }
      }
      if (!liveFloat && entry?.meta) {
        const rootLive = liveById.get(forest.rootId || "ROOT");
        if (rootLive && typeof rootLive.findNode === "function") {
          try {
            liveFloat = rootLive.findNode(entry.meta);
          } catch (_e) {
            liveFloat = null;
          }
        }
      }
      if (!liveFloat) continue;
      liveById.set(cid, liveFloat);
      claimed.add(liveFloat);

      if (liveTilesParented(liveFloat) && hooks.hostBag?.get?.(cid)?.floating !== true) {
        recordInvariant("paint-detach-tiles", cid, `id=${cid}`);
        continue;
      }

      const p = liveFloat.parentNode;
      if (p && typeof p.removeChild === "function") {
        try {
          if (childrenOf(p).includes(liveFloat)) p.removeChild(liveFloat);
        } catch (_e) {
          // already detached
        }
      }

      paintFloatModeBridge(liveFloat);
      if (hooks.hostBag) hooks.hostBag.set(cid, { floating: true });
    }
  }

  for (const tom of Object.values(forest.nodes)) {
    if (tom.kind !== "CON" && tom.kind !== "MONITOR") continue;
    const live = liveById.get(tom.id);
    if (!live) continue;
    if (!tom.lastTabFocusId) {
      live.lastTabFocus = null;
      continue;
    }
    const focusLive = liveById.get(tom.lastTabFocusId);
    if (!focusLive) {
      live.lastTabFocus = null;
      continue;
    }
    if (liveKind(focusLive) === "WINDOW") {
      live.lastTabFocus = focusLive.nodeValue ?? null;
    } else {
      live.lastTabFocus = focusLive.lastTabFocus ?? null;
    }
  }

  for (const [id, live] of [...liveById]) {
    if (forest.nodes[id]) continue;
    if (liveKind(live) !== "CON") continue;
    const p = live.parentNode;
    if (!p || typeof p.removeChild !== "function") continue;
    if (!childrenOf(p).includes(live)) continue;
    const extras = childrenOf(live).filter((c) => !claimed.has(c));
    for (const e of extras) {
      if (typeof p.appendChild === "function") p.appendChild(e);
    }
    if (typeof live._destroyDecoration === "function") {
      try {
        live._destroyDecoration();
      } catch (_e) {
        /* disposed chrome */
      }
    }
    try {
      p.removeChild(live);
    } catch (_e) {
      // already detached
    }
  }
}

/** @deprecated use paintLiveForest — Forest is SoT; this is paint only */
export const applyLiveForest = paintLiveForest;

/**
 * Gnome paint hooks for Forest → live chrome.
 * @param {any} wm
 * @param {object} [extra]
 */
export function liveForestPaintHooks(wm, extra = {}) {
  return {
    windowIdOf: defaultWindowIdOf,
    hostBag: wm?.hostBag,
    createCon: () => {
      const con = new Node(NODE_TYPES.CON, new St.Bin());
      if (wm?.tree?.settings) con.settings = wm.tree.settings;
      return con;
    },
    findNode: (m) => wm?.tree?.findNode?.(m),
    ...extra,
  };
}

/**
 * Rebuild liveById and paint chrome from wm.forest.
 * @param {any} wm
 * @param {object} [hooks]
 * @returns {boolean}
 */
export function paintWmForest(wm, hooks) {
  if (!wm?.forest) return false;
  const h = hooks || liveForestPaintHooks(wm);
  const liveById = rebuildLiveById(wm, wm.forest);
  paintLiveForest(wm.forest, liveById, h);
  wm.liveById = liveById;
  return true;
}

/**
 * Forest id for a live WINDOW/CON/MONITOR/WORKSPACE/ROOT node.
 * @param {any} wm
 * @param {any} live
 * @returns {string|null}
 */
export function forestIdFromLive(wm, live) {
  if (!wm || !live) return null;
  const forest = wm.forest;
  if (!forest?.nodes) return null;
  const kind = liveKind(live);
  if (kind === "WINDOW") {
    const id = forestWindowId(wm, live);
    if (id && forest.nodes[id]) return id;
  }
  if (kind === "MONITOR" || kind === "WORKSPACE" || kind === "ROOT") {
    const v = live.nodeValue;
    if (typeof v === "string" && v && forest.nodes[v]) return v;
    if (kind === "ROOT" && forest.nodes[forest.rootId || "ROOT"]) {
      return forest.rootId || "ROOT";
    }
  }
  if (wm.liveById instanceof Map) {
    for (const [id, n] of wm.liveById) {
      if (n === live && forest.nodes[id]) return id;
    }
  }
  if (kind === "CON") {
    const actor = live.nodeValue;
    if (actor && typeof actor === "object" && wm.hostBag?.entries) {
      for (const [id, entry] of wm.hostBag.entries()) {
        if (entry?.actor === actor && forest.nodes[id]) return id;
      }
    }
  }
  return null;
}

/** @param {any} wm @param {object} [opts] */
function forestForWrite(wm, opts = {}) {
  if (!wm) return null;
  const hooks = { treatGrabTileAsTiles: true, ...opts };
  // Live Forest is topology SoT. FLOAT-mode TILES align only — not GObject rebuild.
  const forest = ensureLiveForest(wm, hooks);
  if (forest) alignForestFloatsToLiveTiles(wm, forest);
  return forest;
}

/**
 * @param {Forest} forest
 * @param {string} layout
 */
function forestInventCon(forest, layout) {
  const api = createTomApi();
  api.hydrateSeq(forest);
  const wrap = api.makeCon(layout);
  api._registerTree(forest, wrap);
  return wrap;
}

/** @param {string} orientation */
function layoutFromOrientation(orientation) {
  const s = String(orientation || "");
  if (s === "HORIZONTAL" || s === "HSPLIT" || s === "h") return "HSPLIT";
  return "VSPLIT";
}

/** Slot is the TABBED/STACKED bag, not a WINDOW leaf inside it. */
function forestBagSlot(forest, node) {
  if (!node || node.kind !== "WINDOW") return node;
  const p = tomParent(forest, node);
  if (p && p.kind === "CON" && (p.layout === "TABBED" || p.layout === "STACKED")) return p;
  return node;
}

/**
 * GObject-ahead layout/open may parent a FLOAT-mode WINDOW under a TILES CON
 * or MONITOR while Forest still has FLOATS. Pull it under that parent before a write.
 * @param {any} wm
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {any} live
 */
function alignForestToLiveConParent(wm, forest, live) {
  if (!live || liveKind(live) !== "WINDOW") return;
  const id = forestIdFromLive(wm, live);
  const tom = id ? forest.nodes[id] : null;
  if (!tom || tom.kind !== "WINDOW") return;
  const liveParent = live.parentNode;
  const pk = liveKind(liveParent);
  if (pk !== "CON" && pk !== "MONITOR") return;
  const parentId = forestIdFromLive(wm, liveParent);
  const destParent = parentId ? forest.nodes[parentId] : null;
  if (!destParent || (destParent.kind !== "CON" && destParent.kind !== "MONITOR")) return;
  if (tom.parentId === destParent.id) return;
  // Float-class (Guake): Forest FLOATS wins. GObject TILE parent is leftover.
  if (skeletonWinIsFloatClass(wm, tom)) return;
  const fromFloats = windowIsFloating(forest, tom);
  appendChild(forest, destParent, tom);
  if (fromFloats) {
    wm.hostBag?.set?.(id, { floating: false });
    Logger.info("align-floats-to-tiles", {
      fields: { id, destParent: destParent.id },
    });
  }
}

/**
 * Re-home every FLOATS WINDOW that is still live-parented under TILES.
 * @param {any} wm
 * @param {import('../tom/kernel.js').Forest} forest
 */
function alignForestFloatsToLiveTiles(wm, forest) {
  const bag = floatsOf(forest);
  if (!bag) return;
  for (const cid of [...bag.childIds]) {
    const live = wm.liveById?.get?.(cid);
    if (live) alignForestToLiveConParent(wm, forest, live);
  }
}

/**
 * Reparent `childLive` under dest (WINDOW → after dest; CON/MONITOR → append/start).
 * @param {any} wm
 * @param {any} childLive
 * @param {any} destLive
 * @param {{ position?: string|number, destIsWindow?: boolean }} [opts]
 * @returns {boolean}
 */
export function forestReparent(wm, childLive, destLive, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, childLive);
  alignForestToLiveConParent(wm, forest, destLive);

  const childId = forestIdFromLive(wm, childLive);
  const destId = forestIdFromLive(wm, destLive);
  const child = childId ? forest.nodes[childId] : null;
  const dest = destId ? forest.nodes[destId] : null;
  if (!child || !dest || child.id === dest.id) return false;
  if (isUnder(forest, dest, child)) return false;

  let destParent = dest;
  /** @type {import('../tom/kernel.js').Node|null} */
  let after = null;
  /** @type {import('../tom/kernel.js').Node|null} */
  let before = null;
  const destIsWindow = opts.destIsWindow === true || dest.kind === "WINDOW";
  const pos = opts.position;
  const wantBefore = pos === "before";
  const wantStart = pos === "start" || pos === "first" || pos === 0 || pos === "0";
  if (destIsWindow) {
    destParent = tomParent(forest, dest);
    if (!destParent) return false;
    if (wantBefore || wantStart) before = dest;
    else after = dest;
  } else if (dest.kind !== "CON" && dest.kind !== "MONITOR") {
    return false;
  }

  if (!destIsWindow && wantStart) {
    const first = children(forest, destParent)[0];
    if (first && first.id !== child.id) before = first;
  }

  if (before) insertBefore(forest, destParent, child, before);
  else if (after) insertAfter(forest, destParent, child, after);
  else appendChild(forest, destParent, child);

  return paintWmForest(wm);
}

/**
 * Insert `winLive` before PH, destroy PH in Forest, paint, drop leftover live PH.
 * @param {any} wm
 * @param {any} winLive
 * @param {any} phLive
 * @returns {boolean}
 */
export function forestBindWindow(wm, winLive, phLive) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, winLive);
  const winId = forestIdFromLive(wm, winLive);
  const phId = forestIdFromLive(wm, phLive);
  const win = winId ? forest.nodes[winId] : null;
  const ph = phId ? forest.nodes[phId] : null;
  if (!win || !ph || win.kind !== "WINDOW" || ph.kind !== "WINDOW") return false;
  const destParent = tomParent(forest, ph);
  if (!destParent) return false;

  insertBefore(forest, destParent, win, ph);
  destroyNode(forest, ph.id);
  wm.hostBag?.delete?.(ph.id);
  wm.liveById?.delete?.(ph.id);
  paintWmForest(wm);
  if (phLive?.parentNode && typeof wm.tree?.removeNode === "function") {
    try {
      wm.tree.removeNode(phLive);
    } catch (_e) {
      /* already detached */
    }
  } else if (phLive?.parentNode && typeof phLive.parentNode.removeChild === "function") {
    try {
      phLive.parentNode.removeChild(phLive);
    } catch (_e) {
      /* already detached */
    }
  }
  return true;
}

/**
 * Reorder mentioned windows (same-parent siblings, or mon-direct panes).
 * @param {any} wm
 * @param {any[]} winLives
 * @returns {{ ok: boolean, reordered?: boolean, reason?: string, count?: number, scope?: string, error?: string }}
 */
export function forestOrderWindows(wm, winLives) {
  const forest = forestForWrite(wm);
  if (!forest) return { ok: false, error: "Forest not available" };
  if (!Array.isArray(winLives) || winLives.length < 2) {
    return { ok: false, error: "order requires ≥2 windows" };
  }

  for (const live of winLives) alignForestToLiveConParent(wm, forest, live);

  /** @type {import('../tom/kernel.js').Node[]} */
  const wins = [];
  for (const live of winLives) {
    const id = forestIdFromLive(wm, live);
    const n = id ? forest.nodes[id] : null;
    if (!n) return { ok: false, error: "window missing from Forest" };
    wins.push(n);
  }

  const sharedParent = tomParent(forest, wins[0]);
  const sameParent = !!sharedParent && wins.every((n) => tomParent(forest, n) === sharedParent);
  if (sameParent && sharedParent) {
    const r = forestOrderUnder(forest, sharedParent, wins);
    if (!r.changed) {
      return { ok: true, reordered: false, count: wins.length, scope: "siblings" };
    }
    paintWmForest(wm);
    return { ok: true, reordered: true, count: wins.length, scope: "siblings" };
  }

  /** @type {import('../tom/kernel.js').Node[]} */
  let monDirects = [];
  const seen = new Set();
  for (const n of wins) {
    const md = monDirectAncestor(forest, n);
    if (!md) return { ok: false, error: "no mon-direct ancestor for window" };
    if (seen.has(md.id)) continue;
    seen.add(md.id);
    monDirects.push(md);
  }

  if (monDirects.length < 2) {
    const hoisted = forestHoistNestedMonPanes(forest, wins);
    if (hoisted.length >= 2) monDirects = hoisted;
    else {
      return { ok: true, reordered: false, reason: "fewer than 2 distinct mon children" };
    }
  }

  const monParent = tomParent(forest, monDirects[0]);
  if (!monParent || monParent.kind !== "MONITOR") {
    return { ok: false, error: "parent is not MONITOR" };
  }
  for (const md of monDirects) {
    if (tomParent(forest, md) !== monParent) {
      return { ok: true, reordered: false, reason: "mon-directs not under same MONITOR" };
    }
  }

  const unwrapped = [];
  const seenU = new Set();
  for (const md of monDirects) {
    const u = unwrapUnarySplit(forest, md);
    if (!u || seenU.has(u.id)) continue;
    seenU.add(u.id);
    unwrapped.push(u);
  }
  monDirects = unwrapped;
  if (monDirects.length < 2) {
    return { ok: true, reordered: false, reason: "fewer than 2 distinct mon children" };
  }

  const r = forestOrderUnder(forest, monParent, monDirects);
  if (!r.changed) {
    return { ok: true, reordered: false, count: wins.length, scope: "mon" };
  }
  paintWmForest(wm);
  return { ok: true, reordered: true, count: wins.length, scope: "mon" };
}

/**
 * Set sibling percent + userSized (same-parent leaves, or distinct mon-direct
 * panes). Duplicate mon-directs skip (same as order) — do not abort apply.
 * @param {any} wm
 * @param {any[]} winLives
 * @param {number[]} fracs renormalized shares (sum 1)
 * @returns {{ ok: boolean, sized?: boolean, reason?: string, count?: number, scope?: string, shares?: number[], error?: string }}
 */
export function forestSizeWindows(wm, winLives, fracs) {
  const forest = forestForWrite(wm);
  if (!forest) return { ok: false, error: "Forest not available" };
  if (!Array.isArray(winLives) || winLives.length < 2) {
    return { ok: false, error: "size requires ≥2 windows" };
  }
  if (!Array.isArray(fracs) || fracs.length !== winLives.length) {
    return { ok: false, error: "size requires shares[] matching windows length" };
  }

  for (const live of winLives) alignForestToLiveConParent(wm, forest, live);

  /** @type {import('../tom/kernel.js').Node[]} */
  const wins = [];
  for (const live of winLives) {
    const id = forestIdFromLive(wm, live);
    const n = id ? forest.nodes[id] : null;
    if (!n) return { ok: false, error: "window missing from Forest" };
    wins.push(n);
  }

  const sharedParent = tomParent(forest, wins[0]);
  const sameParent = !!sharedParent && wins.every((n) => tomParent(forest, n) === sharedParent);
  /** @type {import('../tom/kernel.js').Node[]} */
  let targets;
  /** @type {import('../tom/kernel.js').Node|null} */
  let parentNode;
  let scope = "siblings";
  if (sameParent && sharedParent) {
    targets = wins;
    parentNode = sharedParent;
  } else {
    /** @type {import('../tom/kernel.js').Node[]} */
    const monDirects = [];
    const seen = new Set();
    for (const n of wins) {
      const md = monDirectAncestor(forest, n);
      if (!md) return { ok: false, error: "no mon-direct ancestor for window" };
      if (seen.has(md.id)) continue;
      seen.add(md.id);
      monDirects.push(md);
    }
    if (monDirects.length !== fracs.length) {
      return {
        ok: true,
        sized: false,
        reason: "duplicate mon-direct for size targets",
        distinct: monDirects.length,
        n: wins.length,
      };
    }
    parentNode = tomParent(forest, monDirects[0]);
    if (!parentNode) return { ok: false, error: "mon-direct has no parent" };
    for (const md of monDirects) {
      if (tomParent(forest, md) !== parentNode) {
        return { ok: true, sized: false, reason: "size targets not under common parent" };
      }
    }
    targets = monDirects;
    scope = "mon";
  }

  for (let i = 0; i < targets.length; i++) {
    targets[i].percent = fracs[i];
    targets[i].userSized = true;
  }

  const kids = children(forest, parentNode);
  let sum = 0;
  let anyUnset = false;
  for (const k of kids) {
    const p = k.percent || 0;
    if (p > 0) sum += p;
    else anyUnset = true;
  }
  if (!(sum > 0 && anyUnset) && sum > 0 && Math.abs(sum - 1) > 0.001) {
    const scale = 1 / sum;
    for (const k of kids) {
      if ((k.percent || 0) > 0) k.percent = (k.percent || 0) * scale;
    }
  }

  paintWmForest(wm);
  return {
    ok: true,
    sized: true,
    count: targets.length,
    scope,
    shares: fracs,
  };
}

/**
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node[]} winNodes
 * @returns {import('../tom/kernel.js').Node[]}
 */
function forestHoistNestedMonPanes(forest, winNodes) {
  if (winNodes.length < 2) return [];
  let wrapper = null;
  for (const n of winNodes) {
    const md = monDirectAncestor(forest, n);
    if (!md) return [];
    if (wrapper == null) wrapper = md;
    else if (wrapper !== md) return [];
  }
  if (!wrapper) return [];
  const mon = tomParent(forest, wrapper);
  if (!mon || mon.kind !== "MONITOR") return [];
  const lay = wrapper.layout;
  if (wrapper.kind !== "CON" || (lay !== "HSPLIT" && lay !== "VSPLIT")) return [];
  if (wrapper.childIds.length < 2) return [];

  /** @type {import('../tom/kernel.js').Node[]} */
  const panes = [];
  const seenPane = new Set();
  for (const n of winNodes) {
    let cur = n;
    let pane = null;
    while (cur && cur !== wrapper) {
      if (cur.parentId === wrapper.id) {
        pane = cur;
        break;
      }
      cur = cur.parentId ? forest.nodes[cur.parentId] : null;
    }
    if (!pane) return [];
    if (seenPane.has(pane.id)) continue;
    seenPane.add(pane.id);
    panes.push(pane);
  }
  if (panes.length < 2) return [];

  const r = promoteChildren(forest, wrapper);
  if (!r?.ok) return [];

  return panes.map((pane) => unwrapUnarySplit(forest, pane));
}

/**
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} parentNode
 * @param {import('../tom/kernel.js').Node[]} orderedNodes
 */
function forestOrderUnder(forest, parentNode, orderedNodes) {
  const kids = children(forest, parentNode);
  const placed = new Set(orderedNodes.map((n) => n.id));
  const next = [...orderedNodes];
  for (const k of kids) {
    if (!placed.has(k.id)) next.push(k);
  }
  let same = kids.length === next.length;
  if (same) {
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].id !== next[i].id) {
        same = false;
        break;
      }
    }
  }
  if (same) return { changed: false };
  replaceChildren(forest, parentNode, next);
  return { changed: true };
}

/**
 * Swap two WINDOW nodes (siblings or cross-parent). Percents follow the nodes.
 * @param {any} wm
 * @param {any} aLive
 * @param {any} bLive
 * @returns {boolean}
 */
export function forestSwapWindows(wm, aLive, bLive) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, aLive);
  alignForestToLiveConParent(wm, forest, bLive);
  const aId = forestIdFromLive(wm, aLive);
  const bId = forestIdFromLive(wm, bLive);
  const a = aId ? forest.nodes[aId] : null;
  const b = bId ? forest.nodes[bId] : null;
  if (!a || !b || a.id === b.id) return false;
  if (a.kind !== "WINDOW" || b.kind !== "WINDOW") return false;
  const pa = tomParent(forest, a);
  const pb = tomParent(forest, b);
  if (!pa || !pb) return false;

  if (pa === pb) {
    const r = swapSiblings(forest, a, b);
    if (!r?.ok) return false;
  } else {
    const aNextId = pa.childIds[pa.childIds.indexOf(a.id) + 1];
    const bNextId = pb.childIds[pb.childIds.indexOf(b.id) + 1];
    const aNext = aNextId ? forest.nodes[aNextId] : null;
    const bNext = bNextId ? forest.nodes[bNextId] : null;
    if (bNext) insertBefore(forest, pb, a, bNext);
    else appendChild(forest, pb, a);
    if (aNext) insertBefore(forest, pa, b, aNext);
    else appendChild(forest, pa, b);
  }
  return paintWmForest(wm);
}

/**
 * Reparent layout unit into an existing sibling CON.
 * @param {any} wm
 * @param {any} live
 * @returns {any|null} dest live CON
 */
export function forestMoveIn(wm, live) {
  const forest = forestForWrite(wm);
  if (!forest) return null;
  alignForestToLiveConParent(wm, forest, live);
  const id = forestIdFromLive(wm, live);
  const n = id ? forest.nodes[id] : null;
  if (!n) return null;
  const unit = layoutUnit(forest, n);
  if (!unit || unit.kind === "MONITOR" || unit.kind === "WORKSPACE" || unit.kind === "ROOT") {
    return null;
  }
  const dest = siblingCon(forest, unit);
  if (!dest || dest === unit || isUnder(forest, dest, unit)) return null;
  if (tomParent(forest, dest) !== tomParent(forest, unit)) return null;
  appendChild(forest, dest, unit);
  if (!paintWmForest(wm)) return null;
  return wm.liveById?.get?.(dest.id) ?? null;
}

/**
 * Peel layout unit to grandparent (after former parent).
 * @param {any} wm
 * @param {any} live
 * @returns {any|null} unit live node
 */
export function forestMoveOut(wm, live) {
  const forest = forestForWrite(wm);
  if (!forest) return null;
  alignForestToLiveConParent(wm, forest, live);
  const id = forestIdFromLive(wm, live);
  const n = id ? forest.nodes[id] : null;
  if (!n) return null;
  const unit = layoutUnit(forest, n);
  if (!unit) return null;
  const p = tomParent(forest, unit);
  if (!p || p.kind === "MONITOR" || p.kind === "WORKSPACE" || p.kind === "ROOT") return null;
  const r = breakout(forest, unit, "after");
  if (!r?.ok) return null;
  if (!paintWmForest(wm)) return null;
  return wm.liveById?.get?.(unit.id) ?? live;
}

/**
 * Set CON/MONITOR layout (and optional lastTabFocus / percent reset), then paint.
 * @param {any} wm
 * @param {any} liveCon
 * @param {string} layout
 * @param {{
 *   lastTabFocusLive?: any,
 *   lastTabFocusId?: string|null,
 *   resetPercents?: boolean,
 * }} [opts]
 * @returns {boolean}
 */
export function forestSetLayout(wm, liveCon, layout, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest || !layout) return false;
  const id = forestIdFromLive(wm, liveCon);
  const tom = id ? forest.nodes[id] : null;
  if (!tom || (tom.kind !== "CON" && tom.kind !== "MONITOR")) return false;
  const r = setLayout(tom, layout);
  if (!r?.ok) return false;
  if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocusLive")) {
    const focusLive = opts.lastTabFocusLive;
    if (!focusLive) setLastTabFocus(tom, null);
    else setLastTabFocus(tom, forestIdFromLive(wm, focusLive));
  } else if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocusId")) {
    setLastTabFocus(tom, opts.lastTabFocusId);
  }
  if (opts.resetPercents || layout === "TABBED" || layout === "STACKED") {
    equalizeChildren(forest, tom, { force: true });
  }
  return paintWmForest(wm);
}

/**
 * Reparent WINDOW to its MONITOR ancestor, then paint.
 * @param {any} wm
 * @param {any} liveWin
 * @returns {boolean}
 */
export function forestLiftToMonitor(wm, liveWin) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, liveWin);
  const id = forestIdFromLive(wm, liveWin);
  const n = id ? forest.nodes[id] : null;
  if (!n || n.kind !== "WINDOW") return false;
  const liveMon = (() => {
    let p = liveWin?.parentNode;
    while (p) {
      if (liveKind(p) === "MONITOR") return p;
      p = p.parentNode;
    }
    return null;
  })();
  let mon = null;
  if (liveMon) {
    const mid = forestIdFromLive(wm, liveMon);
    mon = mid ? forest.nodes[mid] : null;
  }
  if (!mon || mon.kind !== "MONITOR") mon = ancestorMonitor(forest, n);
  if (!mon || mon.kind !== "MONITOR") return false;
  if (tomParent(forest, n) === mon) return true;
  appendChild(forest, mon, n);
  return paintWmForest(wm);
}

/**
 * Wrap `live` (current host child) in a new CON of `layout`, then paint.
 * @param {any} wm
 * @param {any} live
 * @param {string} layout
 * @param {{ lastTabFocus?: boolean }} [opts]
 * @returns {any|null} live wrap CON
 */
export function forestWrapNode(wm, live, layout, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest || !layout) return null;
  alignForestToLiveConParent(wm, forest, live);
  const id = forestIdFromLive(wm, live);
  const n = id ? forest.nodes[id] : null;
  if (!n) return null;

  const liveParent = live?.parentNode;
  const pk = liveKind(liveParent);
  if (pk === "CON" || pk === "MONITOR") {
    const pid = forestIdFromLive(wm, liveParent);
    const hostWant = pid ? forest.nodes[pid] : null;
    if (hostWant && (hostWant.kind === "CON" || hostWant.kind === "MONITOR")) {
      if (tomParent(forest, n) !== hostWant) {
        if (isUnderFloats(forest, n)) moveWindowToTiles(forest, n, hostWant);
        else appendChild(forest, hostWant, n);
      }
    }
  }

  const host = tomParent(forest, n);
  if (!host || (host.kind !== "CON" && host.kind !== "MONITOR")) return null;

  const api = createTomApi();
  api.hydrateSeq(forest);
  const wrap = api.makeCon(layout);
  api._registerTree(forest, wrap);
  wrap.percent = n.percent;
  wrap.userSized = !!n.userSized;
  const r = wrapNodes(forest, host, [n], wrap);
  if (!r?.ok) return null;
  if (opts.lastTabFocus !== false && (layout === "TABBED" || layout === "STACKED")) {
    setLastTabFocus(wrap, n.id);
  }
  if (!paintWmForest(wm)) return null;
  return wm.liveById?.get?.(wrap.id) ?? null;
}

/**
 * Wrap a window in TABBED/STACKED (no-op if already in a bag).
 * @param {any} wm
 * @param {any} live
 * @param {string} [layout]
 * @returns {any|null} live bag CON
 */
export function forestWrapForTabStack(wm, live, layout = "TABBED") {
  if (!live) return null;
  const parent = live.parentNode;
  const parentLay = parent?.layout;
  if (
    parent &&
    liveKind(parent) === "CON" &&
    (parentLay === "TABBED" || parentLay === "STACKED" || parent.isStackedOrTabbed?.())
  ) {
    return parent;
  }
  const mode = layout === "STACKED" ? "STACKED" : "TABBED";
  return forestWrapNode(wm, live, mode);
}

/**
 * Parent child stats for tab/stack lift+wrap (REG-ensure-flatten).
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} parentTom
 */
function forestLayoutParentInfo(forest, parentTom) {
  const isMon = parentTom.kind === "MONITOR";
  const isHvCon =
    parentTom.kind === "CON" && (parentTom.layout === "HSPLIT" || parentTom.layout === "VSPLIT");
  let windowKids = 0;
  let hasNestedCon = false;
  for (const cid of parentTom.childIds) {
    const c = forest.nodes[cid];
    if (!c) continue;
    if (c.kind === "WINDOW") windowKids += 1;
    if (c.kind === "CON") hasNestedCon = true;
  }
  return { isMon, isHvCon, windowKids, hasNestedCon };
}

/**
 * Forest-first layout set / lift nested window / wrap for tab-stack.
 * @param {any} wm
 * @param {any} liveWin
 * @param {string} layout
 * @param {{
 *   structure?: boolean,
 * }} [opts]
 * @returns {{ ok: true, parentLive?: any } | { ok: false, fallback?: boolean, error?: string, code?: string }}
 */
export function forestApplyLayoutStructure(wm, liveWin, layout, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest) return { ok: false, fallback: true };
  alignForestToLiveConParent(wm, forest, liveWin);
  const winId = forestIdFromLive(wm, liveWin);
  const win = winId ? forest.nodes[winId] : null;
  if (!win || win.kind !== "WINDOW") return { ok: false, fallback: true };

  const isTabOrStack = layout === "TABBED" || layout === "STACKED";
  const structure = !!opts.structure;
  let parentTom = tomParent(forest, win);
  const liveParent = liveWin?.parentNode;
  const livePk = liveKind(liveParent);
  if (livePk === "CON" || livePk === "MONITOR") {
    const pid = forestIdFromLive(wm, liveParent);
    const liveHost = pid ? forest.nodes[pid] : null;
    if (liveHost && (liveHost.kind === "CON" || liveHost.kind === "MONITOR")) {
      if (parentTom !== liveHost) {
        if (isUnderFloats(forest, win)) moveWindowToTiles(forest, win, liveHost);
        else appendChild(forest, liveHost, win);
        parentTom = liveHost;
      }
    }
  }
  if (!parentTom || (parentTom.kind !== "CON" && parentTom.kind !== "MONITOR")) {
    return { ok: false, fallback: true };
  }

  if (isTabOrStack) {
    let info = forestLayoutParentInfo(forest, parentTom);
    if (info.hasNestedCon && !info.isMon) {
      const bagSib = children(forest, parentTom).find(
        (c) => c.kind === "CON" && (c.layout === "TABBED" || c.layout === "STACKED")
      );
      if (bagSib) {
        appendChild(forest, bagSib, win);
        parentTom = bagSib;
        info = forestLayoutParentInfo(forest, parentTom);
      }
    }
    if (info.hasNestedCon && !info.isMon) {
      const liveMon = (() => {
        let p = liveWin?.parentNode;
        while (p) {
          if (liveKind(p) === "MONITOR") return p;
          p = p.parentNode;
        }
        return null;
      })();
      let mon = null;
      if (liveMon) {
        const mid = forestIdFromLive(wm, liveMon);
        mon = mid ? forest.nodes[mid] : null;
      }
      if (!mon || mon.kind !== "MONITOR") mon = ancestorMonitor(forest, win);
      if (mon && mon.kind === "MONITOR" && parentTom !== mon) {
        appendChild(forest, mon, win);
        parentTom = mon;
        info = forestLayoutParentInfo(forest, parentTom);
      }
      if (info.hasNestedCon && !info.isMon) {
        return {
          ok: false,
          error: structure
            ? "ensure_layout needs flatten of nested CONs; refused (use skeleton/bind or fix structure)"
            : "layout needs flatten of nested CONs; refused (use ungroup or fix structure)",
          code: "ensure-flatten-refused",
        };
      }
    }
    const needWrap = info.isMon || (info.isHvCon && info.windowKids > 1);
    if (needWrap) {
      const api = createTomApi();
      api.hydrateSeq(forest);
      const wrap = api.makeCon("HSPLIT");
      api._registerTree(forest, wrap);
      wrap.percent = win.percent;
      wrap.userSized = !!win.userSized;
      const wr = wrapNodes(forest, parentTom, [win], wrap);
      if (!wr?.ok) {
        return {
          ok: false,
          error: structure ? "split before setLayout failed" : "split before layout failed",
        };
      }
      parentTom = wrap;
    }
  }

  const prev = parentTom.layout;
  setLayout(parentTom, layout);
  if (prev === "TABBED" && layout !== "TABBED") setLastTabFocus(parentTom, null);
  if (isTabOrStack) {
    const prevFocus = parentTom.lastTabFocusId;
    const stillChild = !!(prevFocus && parentTom.childIds.includes(prevFocus));
    if (!stillChild) setLastTabFocus(parentTom, win.id);
  }
  if (layout === "HSPLIT" || layout === "VSPLIT" || isTabOrStack) {
    equalizeChildren(forest, parentTom, { force: true });
  }

  if (!paintWmForest(wm)) return { ok: false, fallback: true };
  return { ok: true, parentLive: wm.liveById?.get?.(parentTom.id) ?? liveWin?.parentNode };
}

/**
 * @param {any} wm
 * @param {import('../tom/kernel.js').Node} tom
 */
function forestNodeIsPlaceholder(wm, tom) {
  if (!tom || tom.kind !== "WINDOW") return false;
  const live = wm.liveById?.get?.(tom.id);
  if (isPlaceholderNode(live)) return true;
  const entry = wm.hostBag?.get?.(tom.id);
  if (entry?.placeholder) return true;
  return tom.wmClass === PLACEHOLDER_WM_CLASS;
}

/**
 * @param {string} raw
 * @returns {"HSPLIT"|"VSPLIT"|"TABBED"|"STACKED"}
 */
function skeletonLayoutOf(raw) {
  const s = String(raw || "hsplit").toLowerCase();
  if (s === "vsplit" || s === "v" || s === "VSPLIT") return "VSPLIT";
  if (s === "tabbed" || s === "tab" || s === "TABBED") return "TABBED";
  if (s === "stacked" || s === "stack" || s === "STACKED") return "STACKED";
  return "HSPLIT";
}

/**
 * Invent a live PH WINDOW for a Forest WINDOW (paint does not invent WINDOWs).
 * @param {any} wm
 * @param {import('../tom/kernel.js').Node} win
 * @param {{ layoutSlot?: string, layoutRole?: string }} tags
 */
function forestBindPlaceholderLive(wm, win, tags) {
  const slot = tags.layoutSlot != null ? String(tags.layoutSlot) : "";
  const role = tags.layoutRole != null ? String(tags.layoutRole) : "";
  const stub = createPlaceholderStub({
    layoutSlot: slot,
    layoutRole: role,
    reason: PLACEHOLDER_SKELETON_LAYOUT_REASON,
    title: layoutPlaceholderTitle(slot, role),
  });
  const live = new Node(NODE_TYPES.WINDOW, stub);
  if (wm?.tree?.settings) live.settings = wm.tree.settings;
  live.mode = "TILE";
  markPlaceholderNode(live, { reason: PLACEHOLDER_SKELETON_LAYOUT_REASON });
  if (slot) live.layoutSlot = slot;
  if (role) live.layoutRole = role;
  wm.hostBag?.set(win.id, {
    meta: stub,
    windowId: stub.id != null ? String(stub.id) : undefined,
    placeholder: true,
    layoutSlot: slot,
    layoutRole: role,
  });
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
  wm.liveById.set(win.id, live);
  return live;
}

/**
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} node
 * @returns {import('../tom/kernel.js').Node[]}
 */
function forestCollectWindowsUnder(forest, node) {
  /** @type {import('../tom/kernel.js').Node[]} */
  const out = [];
  for (const cid of node.childIds || []) {
    const ch = forest.nodes[cid];
    if (!ch) continue;
    if (ch.kind === "WINDOW") out.push(ch);
    else if (ch.kind === "CON") out.push(...forestCollectWindowsUnder(forest, ch));
  }
  return out;
}

/**
 * @param {object} spec
 * @returns {string[]}
 */
function specRoleTokens(spec) {
  if (!spec || typeof spec !== "object") return [];
  if (Array.isArray(spec.children) && spec.children.length) {
    /** @type {string[]} */
    const out = [];
    for (const sub of spec.children) out.push(...specRoleTokens(sub));
    return out;
  }
  const roles = Array.isArray(spec.roles) ? spec.roles.map(String) : [];
  return roles.length ? roles : ["_slot"];
}

/**
 * @param {string[]} remaining
 * @param {string} role
 */
function consumeSpecRole(remaining, role) {
  if (!Array.isArray(remaining)) return;
  const want = String(role);
  const i = remaining.indexOf(want);
  if (i >= 0) remaining.splice(i, 1);
}

/**
 * @param {any} wm
 * @param {import('../tom/kernel.js').Node} tom
 */
function skeletonWinIdentity(wm, tom) {
  const live = wm?.liveById?.get?.(tom.id);
  const bag = wm?.hostBag?.get?.(tom.id);
  const meta = bag?.meta && typeof bag.meta === "object" ? bag.meta : live?.nodeValue;
  let wmClass = "";
  let title = "";
  let layoutRole = bag?.layoutRole || live?.layoutRole || "";
  if (meta && typeof meta === "object") {
    if (typeof meta.get_wm_class === "function") {
      try {
        wmClass = meta.get_wm_class() || "";
      } catch (_e) {
        wmClass = "";
      }
    }
    if (!wmClass) wmClass = meta.wm_class || meta.wmClass || "";
    if (typeof meta.get_title === "function") {
      try {
        title = meta.get_title() || "";
      } catch (_e2) {
        title = "";
      }
    }
    if (!title) title = meta.title || "";
    if (!layoutRole) layoutRole = meta.layoutRole || "";
  }
  if (!wmClass || wmClass === "app") wmClass = tom.wmClass || wmClass;
  if (!title) title = tom.label || "";
  return {
    wmClass: String(wmClass || ""),
    wm_class: String(wmClass || ""),
    title: String(title || ""),
    layoutRole: String(layoutRole || ""),
    windowId: bag?.windowId,
  };
}

/**
 * @param {any} wm
 * @param {import('../tom/kernel.js').Node} tom
 * @param {string} role
 */
function skeletonWinMatchesRole(wm, tom, role) {
  return windowMatchesRoleToken(skeletonWinIdentity(wm, tom), role);
}

/**
 * Guake / windows.json float-class: never a TILE layout role.
 * @param {any} wm
 * @param {import('../tom/kernel.js').Node} tom
 */
function skeletonWinIsFloatClass(wm, tom) {
  const id = skeletonWinIdentity(wm, tom);
  return isFloatOrIgnoreClassToken(id.wmClass) || isFloatOrIgnoreClassToken(id.title);
}

/**
 * Take a live WINDOW only when it matches this role. Unmatched extras stay
 * extras (or FLOATS); missing roles keep a PH so PlaceNext dest is a slot.
 * @param {import('../tom/kernel.js').Node[]} queue
 * @param {Forest} forest
 * @param {any} wm
 * @param {string} role
 * @param {string[]} [_remainingRoles]
 */
function takeSkeletonLiveWin(queue, forest, wm, role, _remainingRoles) {
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i];
    if (!w || forest.nodes[w.id]?.kind !== "WINDOW") continue;
    if (skeletonWinIsFloatClass(wm, w)) continue;
    if (skeletonWinMatchesRole(wm, w, role)) return queue.splice(i, 1)[0];
  }
  return null;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} parentTom
 * @param {string} slot
 * @param {string} role
 * @param {object[]} created
 * @param {import('../tom/kernel.js').Node[]} liveQueue
 * @param {string[]} remainingRoles
 * @returns {{ error?: string }|null}
 */
function forestSkeletonPlaceWin(
  wm,
  forest,
  parentTom,
  slot,
  role,
  created,
  liveQueue,
  remainingRoles
) {
  const existing = takeSkeletonLiveWin(liveQueue, forest, wm, role, remainingRoles);
  consumeSpecRole(remainingRoles, role);
  if (existing) {
    appendChild(forest, parentTom, existing);
    if (slot || role) {
      wm.hostBag?.set(existing.id, {
        layoutSlot: slot || undefined,
        layoutRole: role || undefined,
      });
    }
    Logger.info(`skeleton take role=${role} slot=${slot || ""}`);
    return null;
  }
  const r = inventWindowUnder(
    forest,
    parentTom,
    layoutPlaceholderTitle(slot, role),
    PLACEHOLDER_WM_CLASS
  );
  if (!r?.ok || !r.win) return { error: "failed to create placeholder" };
  const live = forestBindPlaceholderLive(wm, r.win, { layoutSlot: slot, layoutRole: role });
  created.push({ slot, role, id: live?.nodeValue?.id });
  Logger.info(`skeleton ph role=${role} slot=${slot || ""}`);
  return null;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} parentTom
 * @param {object} spec
 * @param {object[]} created
 * @param {import('../tom/kernel.js').Node[]} [liveQueue]
 * @param {string[]} [remainingRoles]
 * @returns {{ error?: string }|null}
 */
function forestSkeletonBuildChild(
  wm,
  forest,
  parentTom,
  spec,
  created,
  liveQueue = [],
  remainingRoles = []
) {
  if (!spec || typeof spec !== "object") return null;
  const nested = spec.children;
  if (Array.isArray(nested) && nested.length > 0) {
    const made = inventConUnder(forest, parentTom, skeletonLayoutOf(spec.split || "hsplit"));
    if (!made?.ok || !made.con) return { error: "failed to create nested CON" };
    for (const sub of nested) {
      const err = forestSkeletonBuildChild(
        wm,
        forest,
        made.con,
        sub,
        created,
        liveQueue,
        remainingRoles
      );
      if (err?.error) return err;
    }
    equalizeChildren(forest, made.con, { force: true });
    return null;
  }

  const roles = Array.isArray(spec.roles) ? spec.roles.map(String) : [];
  const mode = spec.mode != null ? String(spec.mode).toLowerCase() : null;
  const slot = spec.slot != null ? String(spec.slot) : "";

  if (mode === "tabbed" || mode === "stacked" || roles.length > 1) {
    const layout = mode === "stacked" ? "STACKED" : "TABBED";
    const made = inventConUnder(forest, parentTom, layout);
    if (!made?.ok || !made.con) return { error: "failed to create group CON" };
    const roleList = roles.length > 0 ? roles : ["_slot"];
    for (const role of roleList) {
      const err = forestSkeletonPlaceWin(
        wm,
        forest,
        made.con,
        slot,
        role,
        created,
        liveQueue,
        remainingRoles
      );
      if (err?.error) return err;
    }
    equalizeChildren(forest, made.con, { force: true });
    return null;
  }

  const role = roles[0] || "_slot";
  return forestSkeletonPlaceWin(
    wm,
    forest,
    parentTom,
    slot,
    role,
    created,
    liveQueue,
    remainingRoles
  );
}

/**
 * Forest-first mon skeleton: layout + invent CON/PH, then paint.
 * @param {any} wm
 * @param {any} monLive
 * @param {object} monSpec
 * @returns {{ ok: true, created: object[] } | { ok: false, fallback?: boolean, error?: string }}
 */
export function forestApplySkeletonMon(wm, monLive, monSpec) {
  const forest = forestForWrite(wm);
  if (!forest || !monSpec) return { ok: false, fallback: true };
  const monId = forestIdFromLive(wm, monLive);
  const mon = monId ? forest.nodes[monId] : null;
  if (!mon || mon.kind !== "MONITOR") return { ok: false, fallback: true };

  const splitRaw = String(monSpec.split || "hsplit").toLowerCase();
  setLayout(mon, splitRaw === "vsplit" || splitRaw === "v" ? "VSPLIT" : "HSPLIT");

  const liveWins = forestCollectWindowsUnder(forest, mon).filter(
    (n) => !forestNodeIsPlaceholder(wm, n)
  );
  for (const w of liveWins) {
    if (skeletonWinIsFloatClass(wm, w)) {
      if (moveWindowToFloats(forest, w)?.ok) {
        wm.hostBag?.set?.(w.id, { floating: true });
        Logger.info(`skeleton skip-float role-slot class=${skeletonWinIdentity(wm, w).wmClass}`);
      }
      continue;
    }
    if (w.parentId !== mon.id) appendChild(forest, mon, w);
  }

  for (const cid of [...mon.childIds]) {
    const n = forest.nodes[cid];
    if (!n) continue;
    if (n.kind === "WINDOW" && forestNodeIsPlaceholder(wm, n)) {
      destroyNode(forest, n.id);
      wm.hostBag?.delete?.(n.id);
      wm.liveById?.delete?.(n.id);
      continue;
    }
    if (n.kind !== "CON") continue;
    const kids = n.childIds.map((id) => forest.nodes[id]).filter(Boolean);
    for (const k of kids) {
      if (k.kind === "WINDOW" && forestNodeIsPlaceholder(wm, k)) {
        wm.hostBag?.delete?.(k.id);
        wm.liveById?.delete?.(k.id);
      }
    }
    destroyNode(forest, n.id);
    wm.hostBag?.delete?.(n.id);
  }

  /** @type {object[]} */
  const created = [];
  const liveQueue = liveWins.filter(
    (w) => forest.nodes[w.id] && !windowIsFloating(forest, w) && !skeletonWinIsFloatClass(wm, w)
  );
  const childrenSpec = monSpec.children || [];
  /** @type {string[]} */
  const remainingRoles = [];
  for (const ch of childrenSpec) remainingRoles.push(...specRoleTokens(ch));
  for (const ch of childrenSpec) {
    const err = forestSkeletonBuildChild(wm, forest, mon, ch, created, liveQueue, remainingRoles);
    if (err?.error) return { ok: false, error: err.error };
  }
  equalizeChildren(forest, mon, { force: true });
  if (!paintWmForest(wm)) return { ok: false, fallback: true };
  return { ok: true, created };
}

/**
 * Insert WINDOW into TABBED/STACKED at child index (append when omitted).
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} group
 * @param {import('../tom/kernel.js').Node} win
 * @param {number} [insertIndex]
 */
function forestInsertAt(forest, group, win, insertIndex) {
  const kids = [...group.childIds];
  const existing = kids.indexOf(win.id);
  let idx = insertIndex;
  if (idx == null || !Number.isFinite(Number(idx))) {
    idx = existing >= 0 ? existing : kids.length;
  } else {
    idx = Math.floor(Number(idx));
  }
  idx = Math.max(0, Math.min(kids.length, idx));
  if (existing >= 0) {
    if (idx === existing || idx === existing + 1) return true;
    kids.splice(existing, 1);
    const to = idx > existing ? idx - 1 : idx;
    kids.splice(Math.max(0, Math.min(kids.length, to)), 0, win.id);
    replaceChildren(forest, group, kids.map((id) => forest.nodes[id]).filter(Boolean));
    return true;
  }
  const refId = idx < kids.length ? kids[idx] : null;
  const ref = refId ? forest.nodes[refId] : null;
  if (ref) insertBefore(forest, group, win, ref);
  else appendChild(forest, group, win);
  return true;
}

/**
 * Merge two WINDOWs into TABBED/STACKED (flip 2-child H/V CON, else wrap).
 * `{ group, insertIndex }` joins partner into an existing dest bag.
 * @param {any} wm
 * @param {any} focusLive
 * @param {any} partnerLive
 * @param {string} [layout]
 * @param {{ group?: any, insertIndex?: number }} [opts]
 * @returns {any|null} live group CON
 */
export function forestMergeWindowsIntoGroup(
  wm,
  focusLive,
  partnerLive,
  layout = "TABBED",
  opts = {}
) {
  const forest = forestForWrite(wm);
  if (!forest) return null;
  alignForestToLiveConParent(wm, forest, focusLive);
  alignForestToLiveConParent(wm, forest, partnerLive);
  const focusId = forestIdFromLive(wm, focusLive);
  const partnerId = forestIdFromLive(wm, partnerLive);
  const focus = focusId ? forest.nodes[focusId] : null;
  const partner = partnerId ? forest.nodes[partnerId] : null;
  if (!focus || !partner || focus.id === partner.id) return null;
  if (focus.kind !== "WINDOW" || partner.kind !== "WINDOW") return null;

  const mode = layout === "STACKED" ? "STACKED" : "TABBED";
  const parentTom = tomParent(forest, focus);
  if (!parentTom) return null;

  let destGroup = null;
  if (opts.group) {
    const gid = forestIdFromLive(wm, opts.group);
    destGroup = gid ? forest.nodes[gid] : null;
  }

  const applyBag = (con, tabId) => {
    setLayout(con, mode);
    if (mode === "TABBED") setLastTabFocus(con, tabId);
    else setLastTabFocus(con, null);
    equalizeChildren(forest, con, { force: true });
  };

  if (destGroup && tomParent(forest, partner) !== destGroup) {
    if (destGroup.kind !== "CON") return null;
    forestInsertAt(forest, destGroup, partner, opts.insertIndex);
    applyBag(destGroup, partner.id);
    if (!paintWmForest(wm)) return null;
    return wm.liveById?.get?.(destGroup.id) ?? opts.group;
  }

  if (
    tomParent(forest, partner) === parentTom &&
    parentTom.kind === "CON" &&
    (parentTom.layout === "TABBED" || parentTom.layout === "STACKED")
  ) {
    if (opts.insertIndex != null) forestInsertAt(forest, parentTom, partner, opts.insertIndex);
    applyBag(parentTom, partner.id);
    if (!paintWmForest(wm)) return null;
    return wm.liveById?.get?.(parentTom.id) ?? focusLive?.parentNode;
  }

  if (
    tomParent(forest, partner) === parentTom &&
    parentTom.kind === "CON" &&
    (parentTom.layout === "HSPLIT" || parentTom.layout === "VSPLIT")
  ) {
    const kids = children(forest, parentTom);
    const windowKids = kids.filter((c) => c.kind === "WINDOW");
    const ids = new Set(windowKids.map((c) => c.id));
    ids.add(focus.id);
    ids.add(partner.id);
    if (ids.size === 2 && kids.every((c) => c.kind === "WINDOW")) {
      applyBag(parentTom, focus.id);
      if (opts.insertIndex != null) forestInsertAt(forest, parentTom, partner, opts.insertIndex);
      if (!paintWmForest(wm)) return null;
      return wm.liveById?.get?.(parentTom.id) ?? focusLive?.parentNode;
    }
  }

  const host = parentTom;
  if (host.kind !== "CON" && host.kind !== "MONITOR") return null;
  const wrap = forestInventCon(forest, mode);
  wrap.percent = focus.percent;
  wrap.userSized = !!focus.userSized;
  applyBag(wrap, focus.id);

  if (tomParent(forest, partner) === host) {
    const members = opts.insertIndex === 0 ? [partner, focus] : [focus, partner];
    const wr = wrapNodes(forest, host, members, wrap);
    if (!wr?.ok) return null;
  } else {
    insertBefore(forest, host, wrap, focus);
    if (opts.insertIndex === 0) {
      appendChild(forest, wrap, partner);
      appendChild(forest, wrap, focus);
    } else {
      appendChild(forest, wrap, focus);
      appendChild(forest, wrap, partner);
    }
    equalizeChildren(forest, wrap, { force: true });
  }
  if (!paintWmForest(wm)) return null;
  return wm.liveById?.get?.(wrap.id) ?? null;
}

/**
 * Wrap `hostChild` in a new CON (or reuse a lone H/V parent), then insert `insertLive`.
 * @param {any} wm
 * @param {any} hostChildLive
 * @param {any} insertLive
 * @param {string} layout
 * @param {{ before?: boolean, reuseHost?: boolean }} [opts]
 * @returns {boolean}
 */
export function forestWrapInsert(wm, hostChildLive, insertLive, layout, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest || !layout) return false;
  alignForestToLiveConParent(wm, forest, hostChildLive);
  alignForestToLiveConParent(wm, forest, insertLive);
  const hostId = forestIdFromLive(wm, hostChildLive);
  const insertId = forestIdFromLive(wm, insertLive);
  const hostChild = hostId ? forest.nodes[hostId] : null;
  const insert = insertId ? forest.nodes[insertId] : null;
  if (!hostChild || !insert) return false;

  let wrap;
  if (opts.reuseHost) {
    wrap = tomParent(forest, hostChild);
    if (!wrap || wrap.kind !== "CON") return false;
    setLayout(wrap, layout);
  } else {
    const parentTom = tomParent(forest, hostChild);
    if (!parentTom || (parentTom.kind !== "CON" && parentTom.kind !== "MONITOR")) return false;
    wrap = forestInventCon(forest, layout);
    wrap.percent = hostChild.percent;
    wrap.userSized = !!hostChild.userSized;
    const r = wrapNodes(forest, parentTom, [hostChild], wrap);
    if (!r?.ok) return false;
    setLayout(wrap, layout);
  }
  if (opts.before) insertBefore(forest, wrap, insert, hostChild);
  else appendChild(forest, wrap, insert);
  equalizeChildren(forest, wrap, { force: true });
  return paintWmForest(wm);
}

/**
 * Wrap `unit` when its H/V parent has siblings (or `force`); optionally insert a sibling.
 * @param {any} wm
 * @param {any} unitLive
 * @param {string} orientation
 * @param {{ insertLive?: any, before?: boolean, force?: boolean }} [opts]
 * @returns {boolean}
 */
export function forestSlotSplit(wm, unitLive, orientation, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, unitLive);
  if (opts.insertLive) alignForestToLiveConParent(wm, forest, opts.insertLive);
  const unitId = forestIdFromLive(wm, unitLive);
  const unit = forestBagSlot(forest, unitId ? forest.nodes[unitId] : null);
  if (!unit) return false;
  let insert = null;
  if (opts.insertLive) {
    const insertId = forestIdFromLive(wm, opts.insertLive);
    insert = insertId ? forest.nodes[insertId] : null;
    if (!insert) return false;
  }
  const parentTom = tomParent(forest, unit);
  if (!parentTom || (parentTom.kind !== "CON" && parentTom.kind !== "MONITOR")) return false;
  const canSlot =
    (parentTom.layout === "HSPLIT" || parentTom.layout === "VSPLIT") &&
    parentTom.childIds.length >= 2;
  if (!canSlot && !opts.force) return false;

  const layout = layoutFromOrientation(orientation);
  const wrap = forestInventCon(forest, layout);
  wrap.percent = unit.percent;
  wrap.userSized = !!unit.userSized;
  const r = wrapNodes(forest, parentTom, [unit], wrap);
  if (!r?.ok) return false;
  setLayout(wrap, layout);
  if (insert) {
    if (opts.before) insertBefore(forest, wrap, insert, unit);
    else appendChild(forest, wrap, insert);
    equalizeChildren(forest, wrap, { force: true });
  }
  return paintWmForest(wm);
}

/**
 * Wrap `live` in H/V (or flip a lone H/V CON parent). Optionally move the wrap.
 * @param {any} wm
 * @param {any} live
 * @param {string} orientation
 * @param {{ force?: boolean, moveToLive?: any, moveBeforeLive?: any }} [opts]
 * @returns {boolean}
 */
export function forestSplit(wm, live, orientation, opts = {}) {
  const forest = forestForWrite(wm);
  if (!forest) return false;
  alignForestToLiveConParent(wm, forest, live);
  const id = forestIdFromLive(wm, live);
  const n = forestBagSlot(forest, id ? forest.nodes[id] : null);
  if (!n) return false;
  const parentTom = tomParent(forest, n);
  if (!parentTom) return false;
  let dest = null;
  let before = null;
  if (opts.moveToLive) {
    const destId = forestIdFromLive(wm, opts.moveToLive);
    dest = destId ? forest.nodes[destId] : null;
    if (!dest || (dest.kind !== "CON" && dest.kind !== "MONITOR")) return false;
    if (opts.moveBeforeLive) {
      const beforeId = forestIdFromLive(wm, opts.moveBeforeLive);
      before = beforeId ? forest.nodes[beforeId] : null;
    }
  }
  const layout = layoutFromOrientation(orientation);
  const toggle =
    !opts.force &&
    parentTom.kind === "CON" &&
    parentTom.childIds.length === 1 &&
    (parentTom.layout === "HSPLIT" || parentTom.layout === "VSPLIT");

  let moveNode = parentTom;
  if (toggle) {
    setLayout(parentTom, layout);
  } else {
    const wrap = forestInventCon(forest, layout);
    wrap.percent = n.percent;
    wrap.userSized = !!n.userSized;
    const r = wrapNodes(forest, parentTom, [n], wrap);
    if (!r?.ok) return false;
    setLayout(wrap, layout);
    moveNode = wrap;
  }

  if (dest) {
    if (before && tomParent(forest, before) === dest) insertBefore(forest, dest, moveNode, before);
    else appendChild(forest, dest, moveNode);
  }
  return paintWmForest(wm);
}

/**
 * Replace parent children with `orderedLives` (same members, new order), then paint.
 * @param {any} wm
 * @param {any} parentLive
 * @param {any[]} orderedLives
 * @returns {boolean}
 */
export function forestOrderLiveChildren(wm, parentLive, orderedLives) {
  const forest = forestForWrite(wm);
  if (!forest || !Array.isArray(orderedLives)) return false;
  const pid = forestIdFromLive(wm, parentLive);
  const parentTom = pid ? forest.nodes[pid] : null;
  if (!parentTom) return false;
  /** @type {import('../tom/kernel.js').Node[]} */
  const next = [];
  for (const live of orderedLives) {
    const id = forestIdFromLive(wm, live);
    const n = id ? forest.nodes[id] : null;
    if (!n) return false;
    next.push(n);
  }
  const r = forestOrderUnder(forest, parentTom, next);
  if (!r.changed) return true;
  return paintWmForest(wm);
}
