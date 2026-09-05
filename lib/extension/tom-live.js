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
  hasWindowDescendant,
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
  walk,
  windowIsFloating,
  wrapNodes,
} from "../tom/index.js";
import { attachWorld, geomOf } from "../world/index.js";
import { recordInvariant, recordPresent } from "./metrics.js";
import { forestSlotRect } from "./reconcile.js";
import {
  minTabWidthFromChars,
  planTabbedWrap,
  processGap as layoutProcessGap,
  stackedChildRect,
  tabbedChildRect,
} from "./tree-layout.js";
import { NODE_TYPES } from "./tree-types.js";
import { makeLiveHandle } from "./live-handle.js";
import { ensureLiveListMutators } from "./live-compat.js";
import * as NodeChrome from "./node-chrome.js";
import { zoomRect } from "./zoom.js";
import * as Utils from "./utils.js";
import {
  createMonWsId,
  monIndexFromId,
  monWsIdFromMeta,
  workspaceFromId,
} from "./monitor-identity.js";
import {
  createPlaceholderStub,
  isPlaceholderNode,
  isPlaceholderValue,
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
export function liveTilesParented(live, wm) {
  const extWm = wm || live?.wm || null;
  if (extWm?.forest?.nodes) {
    const id = forestIdFromLive(extWm, live);
    const tom = id ? extWm.forest.nodes[id] : null;
    if (tom) {
      const p = tomParent(extWm.forest, tom);
      return p?.kind === "CON" || p?.kind === "MONITOR";
    }
  }
  const parent = extWm ? liveParentForPresent(extWm, live) : live?.parentNode;
  const k = liveKind(parent);
  return k === "CON" || k === "MONITOR";
}

/**
 * Chrome present kids: Forest childIds → liveById when seeded.
 * Empty Forest list is SoT (no GObject leftover kids). Spine boot may
 * fall back to GObject only when Forest still lists unmapped childIds.
 * @param {any} wm
 * @param {any} liveParent
 * @returns {any[]}
 */
export function liveChildrenForPresent(wm, liveParent) {
  if (!liveParent) return [];
  const gKids = childrenOf(liveParent);
  if (!wm?._liveForestSeeded || !wm.forest?.nodes || !(wm.liveById instanceof Map)) {
    return gKids;
  }
  const id = forestIdFromLive(wm, liveParent);
  const tom = id ? wm.forest.nodes[id] : null;
  if (!tom || !Array.isArray(tom.childIds)) return gKids;
  const out = [];
  for (const cid of tom.childIds) {
    const ch = wm.liveById.get(cid);
    if (ch) out.push(ch);
  }
  if (out.length) return out;
  // Spine boot: Forest lists kids that liveById has not caught yet.
  // Empty Forest list is SoT — do not resurrect GObject leftover children.
  if (
    tom.childIds.length > 0 &&
    (tom.kind === "ROOT" || tom.kind === "WORKSPACE" || tom.kind === "MONITOR")
  ) {
    return gKids;
  }
  if (gKids.length) {
    Logger.trace(`present skip-gobject-kids id=${tom.id} gKids=${gKids.length}`);
  }
  return out;
}

/**
 * Present parent: Forest tomParent → liveById when seeded with WINDOW nodes;
 * else GObject parentNode.
 * @param {any} wm
 * @param {any} live
 * @returns {any|null}
 */
export function liveParentForPresent(wm, live) {
  if (!live) return null;
  const gParent = live.parentNode ?? null;
  if (!wm?._liveForestSeeded || !wm.forest?.nodes || !(wm.liveById instanceof Map)) {
    return gParent;
  }
  const id = forestIdFromLive(wm, live);
  const tom = id ? wm.forest.nodes[id] : null;
  if (!tom) return gParent;
  const p = tomParent(wm.forest, tom);
  if (!p) return gParent;
  return wm.liveById.get(p.id) ?? gParent;
}

function forestSeededWithWindows(wm) {
  if (!wm?._liveForestSeeded || !wm.forest?.nodes || !(wm.liveById instanceof Map)) return false;
  return Object.values(wm.forest.nodes).some((n) => n?.kind === "WINDOW");
}

/**
 * Live TABBED/STACKED CONs for chrome restack. Forest when seeded; else GObject.
 * @param {any} wm
 * @param {{ root?: any }} [opts]
 * @returns {any[]}
 */
export function liveStackedOrTabbedConsForPresent(wm, opts = {}) {
  const root = opts.root ?? wm?.currentWsNode ?? null;
  if (forestSeededWithWindows(wm)) {
    const rootId = root ? forestIdFromLive(wm, root) : null;
    const start = (rootId && wm.forest.nodes[rootId]) || wm.forest.nodes[wm.forest.rootId];
    if (!start) return [];
    const out = [];
    const seen = new Set();
    walk(wm.forest, start, (tom) => {
      if (!tom || tom.kind !== "CON") return;
      if (tom.layout !== "TABBED" && tom.layout !== "STACKED") return;
      const live = wm.liveById.get(tom.id);
      if (!live || seen.has(live)) return;
      seen.add(live);
      out.push(live);
    });
    return out;
  }
  let cons = [];
  try {
    cons = root
      ? root.getNodeByType?.(NODE_TYPES.CON)
      : wm?.tree?.getNodeByType?.(NODE_TYPES.CON) || [];
  } catch (_e) {
    cons = [];
  }
  return (Array.isArray(cons) ? cons : []).filter((c) => c?.isStackedOrTabbed?.());
}

/**
 * WINDOW live for a Forest id: liveById, else host-bag meta match.
 * @param {any} wm
 * @param {string} id
 * @returns {any|null}
 */
function liveWindowForForestId(wm, id) {
  if (!id || !wm) return null;
  const live = wm.liveById?.get?.(id);
  if (live && liveKind(live) === "WINDOW") return live;
  const meta = wm.hostBag?.get?.(id)?.meta;
  if (!meta || typeof meta !== "object") return null;
  if (wm.liveById instanceof Map) {
    for (const n of wm.liveById.values()) {
      if (liveKind(n) === "WINDOW" && n.nodeValue === meta) return n;
    }
  }
  return null;
}

/**
 * Open leaf of a TABBED/STACKED CON: Forest lastTabFocusId / kids, else GObject.
 * Seeded Forest CON: lastTabFocusId → liveById / bag; never duck lastTabFocus / contains.
 * @param {any} wm
 * @param {any} con
 * @returns {any|null}
 */
export function liveTabOpenLeafForPresent(wm, con) {
  if (!con) return null;
  if (forestSeededWithWindows(wm)) {
    const id = forestIdFromLive(wm, con);
    const tom = id ? wm.forest.nodes[id] : null;
    if (tom) {
      if (tom.lastTabFocusId) {
        const focusLive = liveWindowForForestId(wm, tom.lastTabFocusId);
        if (focusLive) return focusLive;
      }
      const kids = liveChildrenForPresent(wm, con);
      for (const child of kids) {
        if (liveKind(child) === "WINDOW") return child;
      }
      return null;
    }
  }
  if (con.lastTabFocus) {
    const n = wm?.tree?.findNode?.(con.lastTabFocus);
    if (n && (n.parentNode === con || con.contains?.(n))) return n;
  }
  const tiled =
    typeof wm?.tree?.getTiledChildren === "function"
      ? wm.tree.getTiledChildren(con.childNodes || [])
      : con.childNodes || [];
  for (const child of tiled) {
    if (child?.isWindow?.()) return child;
    if (child?.isCon?.()) {
      const w = child.getNodeByType?.(NODE_TYPES.WINDOW)?.[0];
      if (w) return w;
    }
  }
  return null;
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
  const kidsOfLive = (live) => {
    const g = childrenOf(live);
    if (g.length) return g;
    return hooks.wm ? liveChildrenForPresent(hooks.wm, live) : [];
  };

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
      for (const ch of kidsOfLive(live)) {
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

    for (const ch of kidsOfLive(live)) {
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
  const projected = projectLiveForest(wm.tree, { ...hooks, windowIdOf, wm });
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
 * Quarantined (D096/G4): rebuild Forest from GObject spine.
 * Production callers removed — tests / rare recovery only. Prefer RESYNC.
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
 * Forest ancestor MONITOR id (`moNwsW`), then live parent walk.
 * PlaceNext dest must use this — monitor index alone aliases every workspace.
 * @param {any} wm
 * @param {any} live
 * @returns {string|null}
 */
export function liveAncestorMonitorId(wm, live) {
  if (!live) return null;
  if (wm?._liveForestSeeded && wm.forest?.nodes) {
    const id = forestIdFromLive(wm, live);
    const tom = id ? wm.forest.nodes[id] : null;
    if (tom) {
      const mon = ancestorMonitor(wm.forest, tom);
      if (mon?.id) return mon.id;
    }
  }
  let n = live;
  const seen = new Set();
  while (n && !seen.has(n)) {
    seen.add(n);
    if (liveKind(n) === "MONITOR") {
      const v = n.nodeValue;
      if (typeof v === "string" && v) return v;
    }
    n = (wm ? liveParentForPresent(wm, n) : null) || n.parentNode;
  }
  return liveMonitorId(live);
}

/**
 * True when `live` sits on PlaceNext's monitor+workspace (fail-closed on unknown desk).
 * @param {any} wm
 * @param {any} live
 * @param {number} [homeMonitor]
 * @param {number|null} [workspace]
 * @returns {boolean}
 */
export function placeDeskMatches(wm, live, homeMonitor = -1, workspace = null) {
  if (!live) return false;
  const mid = liveAncestorMonitorId(wm, live);
  if (!mid) return workspace == null || workspace === "";
  if (homeMonitor >= 0) {
    const monIdx = monIndexFromId(mid);
    if (monIdx >= 0 && monIdx !== homeMonitor) return false;
  }
  if (workspace != null && workspace !== "" && Number.isFinite(Number(workspace))) {
    if (workspaceFromId(mid) !== Math.floor(Number(workspace))) return false;
  }
  return true;
}

/**
 * Reparent a mapped window onto PlaceNext's Forest monitor-ws when bind landed elsewhere.
 * @param {any} wm
 * @param {any} nodeWindow
 * @param {{ homeMonitor?: number, workspace?: number|null, attachLft?: any }} [openPlan]
 * @returns {boolean}
 */
export function forestEnsureOnPlaceWorkspace(wm, nodeWindow, openPlan) {
  if (!wm?._liveForestSeeded || !nodeWindow || !openPlan) return false;
  const ws = openPlan.workspace;
  if (ws == null || ws === "" || !Number.isFinite(Number(ws))) return false;
  const home = openPlan.homeMonitor >= 0 ? openPlan.homeMonitor : 0;
  const wantWs = Math.floor(Number(ws));
  const wantId = createMonWsId(home, wantWs);
  const curId = liveAncestorMonitorId(wm, nodeWindow);
  if (curId === wantId) {
    Logger.debug(`place-hint forest desk already ${wantId}`);
    return false;
  }

  let dest = null;
  const pin = openPlan.attachLft;
  if (pin && placeDeskMatches(wm, pin, home, wantWs)) {
    const parent = liveParentForPresent(wm, pin) || pin.parentNode;
    if (parent && placeDeskMatches(wm, parent, home, wantWs)) dest = parent;
    else if (liveKind(pin) === "MONITOR" || liveKind(pin) === "CON") dest = pin;
  }
  if (!dest) dest = wm.liveById?.get?.(wantId) || null;
  if (!dest) return false;
  if (!forestReparent(wm, nodeWindow, dest)) return false;
  Logger.info(`place-hint forest desk ${curId || "?"}→${wantId}`);
  return true;
}

/**
 * Envelope + bag ready for Forest-first spine invent (boot before GObject seed).
 * @param {any} wm
 * @returns {Forest|null}
 */
function ensureForestSpineReady(wm) {
  if (!wm) return null;
  if (!wm.hostBag) wm.hostBag = createHostBag();
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
  if (!wm.forest) {
    wm.forest = createEnvelope(() => makeIdFactory().nid());
  }
  wm._liveForestSeeded = true;
  return wm.forest;
}

/**
 * Live Tree root for spine attach — prefer opts.tree (Tree ctor) over wm.tree getter.
 * @param {any} wm
 * @param {any} [tree]
 */
function spineTreeRoot(wm, tree) {
  if (tree) return tree;
  if (wm?._tree) return wm._tree;
  return null;
}

/**
 * Parent scaffold bin into window_group (idempotent).
 * @param {any} actorBin
 */
function parentSpineBin(actorBin) {
  if (!actorBin || !global.window_group) return;
  try {
    if (!global.window_group.contains(actorBin)) global.window_group.add_child(actorBin);
  } catch (_e) {
    /* disposed */
  }
}

/** liveById then WINDOW tab / CON deco. Call after invent, not per present. */
function registerInventedLive(wm, id, live) {
  if (!wm || !id || !live) return live;
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
  const kind = liveKind(live);
  if (kind === "WORKSPACE" || kind === "MONITOR" || kind === "CON") {
    ensureLiveListMutators(live);
  }
  wm.liveById.set(id, live);
  if (typeof live.isWindow === "function" && live.isWindow() && !live.isPlaceholder()) {
    NodeChrome.createWindowTab(live);
  } else if (typeof live.isCon === "function" && live.isCon()) {
    NodeChrome.createDecoration(live);
  }
  return live;
}

/**
 * Mirror WORKSPACE / MONITOR live spine into Forest (stable string ids).
 * Register/mirror helper — invent authority is forestAdmitWorkspace/Monitor.
 * @param {any} wm
 * @param {any} liveNode
 * @returns {string|null}
 */
export function forestEnsureSpineNode(wm, liveNode) {
  if (!wm || !liveNode) return null;
  const forest = ensureForestSpineReady(wm);
  if (!forest) return null;

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
    if (liveNode.actorBin) wm.hostBag.set(id, { actor: liveNode.actorBin });
    return id;
  }

  if (kind === "MONITOR") {
    const id = typeof liveNode.nodeValue === "string" ? liveNode.nodeValue : null;
    if (!id) return null;
    let parentLive = liveParentForPresent(wm, liveNode);
    if (liveKind(parentLive) !== "WORKSPACE") {
      const existing = forest.nodes[id];
      parentLive = existing?.parentId ? wm.liveById?.get?.(existing.parentId) : null;
    }
    if (liveKind(parentLive) !== "WORKSPACE" && liveKind(liveNode.parentNode) === "WORKSPACE") {
      parentLive = liveNode.parentNode;
    }
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
    if (liveNode.actorBin) wm.hostBag.set(id, { actor: liveNode.actorBin });
    return id;
  }

  return null;
}

/**
 * Invent / refresh WORKSPACE in Forest + bag; live Node is chrome mirror (D096 / G3).
 * @param {any} wm
 * @param {number} wsIndex
 * @param {{ layout?: string, tree?: any }} [opts]
 * @returns {{ id: string, live: any, created: boolean }|null}
 */
export function forestAdmitWorkspace(wm, wsIndex, opts = {}) {
  if (!wm || !Number.isFinite(wsIndex) || wsIndex < 0) return null;
  const forest = ensureForestSpineReady(wm);
  if (!forest) return null;
  const id = `ws${wsIndex}`;
  const root = tilesOf(forest) || forest.nodes[forest.rootId];
  if (!root) return null;

  const layout = opts.layout != null ? opts.layout : "HSPLIT";
  let tom = forest.nodes[id];
  let created = false;
  if (!tom || tom.kind !== "WORKSPACE") {
    /** @type {TomNode} */
    tom = {
      id,
      kind: "WORKSPACE",
      parentId: root.id,
      childIds: tom?.kind === "WORKSPACE" ? tom.childIds || [] : [],
      percent: 1,
      userSized: false,
    };
    forest.nodes[id] = tom;
    if (!root.childIds.includes(id)) root.childIds.push(id);
    created = true;
  }

  let live = wm.liveById.get(id);
  if (!live) {
    const treeRoot = spineTreeRoot(wm, opts.tree);
    if (treeRoot) wm.liveById.set("ROOT", treeRoot);
    live = makeLiveHandle(NODE_TYPES.WORKSPACE, id, {
      wm,
      settings: treeRoot?.settings,
      layout,
    });
    live.actorBin = new St.Bin({ style_class: "workspace-actor-bg" });
    parentSpineBin(live.actorBin);
    registerInventedLive(wm, id, live);
    created = true;
  } else {
    if (live.layout == null) live.layout = layout;
    if (!live.actorBin) {
      live.actorBin = new St.Bin({ style_class: "workspace-actor-bg" });
    }
    parentSpineBin(live.actorBin);
  }

  wm.hostBag.set(id, { actor: live.actorBin });
  wm.liveById.set(id, live);
  return { id, live, created };
}

/**
 * Invent / refresh MONITOR in Forest + bag; live Node is chrome mirror (D096 / G3).
 * Ensures parent WORKSPACE via forestAdmitWorkspace when missing.
 * @param {any} wm
 * @param {number} wsIndex
 * @param {number} monIndex
 * @param {{ layout?: string, tree?: any }} [opts]
 * @returns {{ id: string, live: any, created: boolean }|null}
 */
export function forestAdmitMonitor(wm, wsIndex, monIndex, opts = {}) {
  if (!wm || !Number.isFinite(wsIndex) || wsIndex < 0) return null;
  if (!Number.isFinite(monIndex) || monIndex < 0) return null;
  const forest = ensureForestSpineReady(wm);
  if (!forest) return null;

  const wsAdmitted = forestAdmitWorkspace(wm, wsIndex, { tree: opts.tree });
  if (!wsAdmitted) return null;
  const wsId = wsAdmitted.id;
  const parentTom = forest.nodes[wsId];
  if (!parentTom) return null;

  const id = Utils.createMonitorWorkspaceId(monIndex, wsIndex);
  const layout = opts.layout != null ? opts.layout : "HSPLIT";
  let tom = forest.nodes[id];
  let created = false;
  if (!tom || tom.kind !== "MONITOR") {
    /** @type {TomNode} */
    tom = {
      id,
      kind: "MONITOR",
      layout,
      parentId: wsId,
      childIds: tom?.kind === "MONITOR" ? tom.childIds || [] : [],
      percent: 1,
      userSized: false,
    };
    forest.nodes[id] = tom;
    if (!parentTom.childIds.includes(id)) parentTom.childIds.push(id);
    if (!forest.monitors.includes(tom)) forest.monitors.push(tom);
    created = true;
  } else {
    if (tom.parentId !== wsId) {
      const oldParent = tom.parentId ? forest.nodes[tom.parentId] : null;
      if (oldParent?.childIds) {
        oldParent.childIds = oldParent.childIds.filter((cid) => cid !== id);
      }
      tom.parentId = wsId;
      if (!parentTom.childIds.includes(id)) parentTom.childIds.push(id);
    }
    if (tom.layout == null) tom.layout = layout;
    if (!forest.monitors.includes(tom)) forest.monitors.push(tom);
  }

  let live = wm.liveById.get(id);
  const wsLive = wm.liveById.get(wsId);
  if (!live) {
    const treeRoot = spineTreeRoot(wm, opts.tree);
    live = makeLiveHandle(NODE_TYPES.MONITOR, id, {
      wm,
      settings: treeRoot?.settings || wsLive?.settings,
      layout,
    });
    live.actorBin = new St.Bin();
    parentSpineBin(live.actorBin);
    registerInventedLive(wm, id, live);
    created = true;
  } else {
    if (live.layout == null) live.layout = layout;
    else if (opts.layout != null) live.layout = layout;
    if (tom.layout !== live.layout) tom.layout = live.layout;
    if (!live.actorBin) live.actorBin = new St.Bin();
    parentSpineBin(live.actorBin);
  }

  wm.hostBag.set(id, { actor: live.actorBin });
  wm.liveById.set(id, live);
  return { id, live, created };
}

/**
 * Drop WORKSPACE/MONITOR from Forest + bag + liveById (destroyNode forbids spine).
 * Cascades MONITOR children when removing a WORKSPACE.
 * @param {any} wm
 * @param {string} id
 * @returns {boolean}
 */
export function forestRemoveSpine(wm, id) {
  const forest = wm?.forest;
  if (!forest || !id || !forest.nodes[id]) return false;
  const tom = forest.nodes[id];
  if (tom.kind !== "WORKSPACE" && tom.kind !== "MONITOR") return false;

  if (tom.kind === "WORKSPACE") {
    for (const cid of [...(tom.childIds || [])]) {
      const ch = forest.nodes[cid];
      if (ch?.kind === "MONITOR") forestRemoveSpine(wm, cid);
    }
  }

  const parentTom = tom.parentId ? forest.nodes[tom.parentId] : null;
  if (parentTom?.childIds) {
    parentTom.childIds = parentTom.childIds.filter((cid) => cid !== id);
  }
  if (tom.kind === "MONITOR") {
    forest.monitors = (forest.monitors || []).filter((m) => m && m.id !== id);
  }
  delete forest.nodes[id];
  wm.hostBag?.delete?.(id);
  wm.liveById?.delete?.(id);
  return true;
}

/**
 * Rekey a spine id in Forest / bag / liveById (dynamic WS renumber).
 * @param {any} wm
 * @param {string} oldId
 * @param {string} newId
 * @returns {boolean}
 */
export function forestRekeySpine(wm, oldId, newId) {
  const forest = wm?.forest;
  if (!forest || !oldId || !newId || oldId === newId) return false;
  const tom = forest.nodes[oldId];
  if (!tom || (tom.kind !== "WORKSPACE" && tom.kind !== "MONITOR")) return false;
  if (forest.nodes[newId] && forest.nodes[newId] !== tom) return false;

  tom.id = newId;
  delete forest.nodes[oldId];
  forest.nodes[newId] = tom;

  const parentTom = tom.parentId ? forest.nodes[tom.parentId] : null;
  if (parentTom?.childIds) {
    parentTom.childIds = parentTom.childIds.map((cid) => (cid === oldId ? newId : cid));
  }
  for (const cid of tom.childIds || []) {
    const ch = forest.nodes[cid];
    if (ch) ch.parentId = newId;
  }

  if (wm.liveById instanceof Map) {
    const live = wm.liveById.get(oldId);
    if (live) {
      wm.liveById.delete(oldId);
      if (typeof live.nodeValue === "string") live.nodeValue = newId;
      wm.liveById.set(newId, live);
    }
  }
  if (wm.hostBag?.has?.(oldId)) {
    const entry = wm.hostBag.get(oldId);
    wm.hostBag.delete(oldId);
    if (entry) wm.hostBag.set(newId, entry);
  }
  return true;
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
 * Resolve Forest CON/MONITOR/FLOATS parent for Meta WINDOW admit (D096 / G1).
 * Does not invent WS/MONITOR.
 * @param {any} wm
 * @param {Forest} forest
 * @param {{
 *   parentId?: string,
 *   underFloats?: boolean,
 *   monitorId?: string|null,
 * }} opts
 * @returns {import('../tom/kernel.js').Node|null}
 */
function forestAdmitParent(wm, forest, opts) {
  if (opts.underFloats) return floatsOf(forest);
  if (opts.parentId) {
    const p = forest.nodes[opts.parentId];
    if (p && (p.kind === "CON" || p.kind === "MONITOR")) return p;
  }
  const monId = opts.monitorId || null;
  let mon = monId ? forest.nodes[monId] : null;
  if (!mon || mon.kind !== "MONITOR") mon = forest.monitors[0] || null;
  return mon && mon.kind === "MONITOR" ? mon : null;
}

/**
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} destParent
 * @param {import('../tom/kernel.js').Node} win
 * @param {string|null|undefined} beforeId
 */
function forestAdmitPlace(forest, destParent, win, beforeId) {
  if (beforeId) {
    const before = forest.nodes[beforeId];
    if (before && before.parentId === destParent.id && before.id !== win.id) {
      insertBefore(forest, destParent, win, before);
      return;
    }
  }
  appendChild(forest, destParent, win);
}

/**
 * @param {any} meta
 * @returns {{ label: string, wmClass: string }}
 */
function metaWindowLabelClass(meta) {
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
  return { label: label || "win", wmClass: wmClass || "app" };
}

/**
 * Invent / refresh WINDOW in Forest + hostBag only (D096 / G1).
 * Live Node is a chrome mirror via liveById + paint — not tree.createNode invent.
 * @param {any} wm
 * @param {any} metaWindow
 * @param {{
 *   parentId?: string,
 *   beforeId?: string,
 *   underFloats?: boolean,
 *   monitorId?: string|null,
 *   mode?: string,
 * }} [opts]
 * @returns {{ id: string, live: any }|null}
 */
export function forestAdmitMetaWindow(wm, metaWindow, opts = {}) {
  if (!wm || !metaWindow || typeof metaWindow !== "object") return null;
  const forest = ensureLiveForest(wm);
  if (!forest || !wm.hostBag) return null;
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();

  const underFloats = !!opts.underFloats;
  const mode = opts.mode != null ? opts.mode : "FLOAT";
  const existing =
    wm.hostBag.idFromMeta(metaWindow) ||
    wm.hostBag.idFromWindowId(defaultWindowIdOf({ nodeValue: metaWindow }) || "");

  const destParent = forestAdmitParent(wm, forest, {
    parentId: opts.parentId,
    underFloats,
    monitorId: opts.monitorId,
  });

  if (existing && forest.nodes[existing]?.kind === "WINDOW") {
    const tom = forest.nodes[existing];
    let live = wm.liveById.get(existing);
    if (!live) {
      live = makeLiveHandle(NODE_TYPES.WINDOW, metaWindow, {
        wm,
        settings: wm.tree?.settings,
        mode,
      });
      registerInventedLive(wm, existing, live);
    }
    const wid = defaultWindowIdOf({ nodeValue: metaWindow });
    wm.hostBag.set(existing, {
      meta: metaWindow,
      windowId: wid != null && wid !== "" ? String(wid) : undefined,
      floating: underFloats,
    });
    if (destParent) {
      if (tom.parentId !== destParent.id) {
        forestAdmitPlace(forest, destParent, tom, opts.beforeId);
      } else if (opts.beforeId) {
        forestAdmitPlace(forest, destParent, tom, opts.beforeId);
      }
    }
    paintWmForest(wm);
    return { id: existing, live: wm.liveById.get(existing) || live };
  }

  if (!destParent) return null;

  const { label, wmClass } = metaWindowLabelClass(metaWindow);
  const api = createTomApi();
  api.hydrateSeq(forest);
  const win = api.makeWindow(label, wmClass);
  api._registerTree(forest, win);
  forestAdmitPlace(forest, destParent, win, opts.beforeId);

  const wid = defaultWindowIdOf({ nodeValue: metaWindow });
  wm.hostBag.set(win.id, {
    meta: metaWindow,
    windowId: wid != null && wid !== "" ? String(wid) : undefined,
    floating: underFloats,
  });

  const live = makeLiveHandle(NODE_TYPES.WINDOW, metaWindow, {
    wm,
    settings: wm.tree?.settings,
    mode,
  });
  registerInventedLive(wm, win.id, live);
  paintWmForest(wm);
  return { id: win.id, live: wm.liveById.get(win.id) || live };
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
  if (typeof liveOrMeta === "string" && liveOrMeta) {
    id = liveOrMeta;
    meta = bag.get(id)?.meta ?? wm.liveById?.get?.(id)?.nodeValue ?? null;
  } else if (liveOrMeta && liveKind(liveOrMeta) === "WINDOW") {
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

  const entry = bag.get(id);
  if (entry?.border) {
    try {
      const b = entry.border;
      if (typeof global !== "undefined" && global.window_group?.contains?.(b)) {
        global.window_group.remove_child(b);
      }
      b.hide?.();
      b.destroy?.();
    } catch (_e) {
      /* disposed */
    }
    const actor = entry.meta?.get_compositor_private?.();
    if (actor && actor.border === entry.border) actor.border = undefined;
  }

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
 * Live WINDOW for a compositor actor (GObject walk may miss detached lives).
 * @param {any} wm
 * @param {any} actor
 * @returns {any|null}
 */
export function liveWindowFromActor(wm, actor) {
  if (!actor || typeof actor !== "object") return null;
  let meta = null;
  try {
    meta = actor.meta_window ?? actor.get_meta_window?.() ?? null;
  } catch (_e) {
    meta = null;
  }
  const fromMeta = liveWindowFromMeta(wm, meta);
  if (fromMeta) return fromMeta;
  if (!(wm?.liveById instanceof Map)) return null;
  for (const live of wm.liveById.values()) {
    if (!live) continue;
    const isWin =
      live.nodeType === "WINDOW" || (typeof live.isWindow === "function" && live.isWindow());
    if (!isWin) continue;
    if (live.actor === actor || live.windowActor === actor) return live;
    try {
      if (live.nodeValue?.get_compositor_private?.() === actor) return live;
    } catch (_e) {
      /* disposed */
    }
  }
  if (wm.hostBag?.entries) {
    for (const [id, entry] of wm.hostBag.entries()) {
      if (!entry) continue;
      if (entry.actor === actor) return wm.liveById?.get?.(id) ?? null;
      try {
        if (entry.meta?.get_compositor_private?.() === actor) {
          return wm.liveById?.get?.(id) ?? null;
        }
      } catch (_e) {
        /* disposed */
      }
    }
  }
  return null;
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
function stickyHomeMonitorIndex(meta) {
  const until = meta?._forgeDockStickyUntil ?? 0;
  if (until && Date.now() > until) return -1;
  const mon = meta?._forgeDockStickyMon;
  return typeof mon === "number" && mon >= 0 ? mon : -1;
}

function resolveRetileParent(wm, forest, liveNode) {
  const meta = liveNode?.nodeValue;
  const stickyMon = stickyHomeMonitorIndex(meta);
  if (stickyMon >= 0) {
    let ws = -1;
    try {
      const wso = meta?.get_workspace?.();
      if (wso && typeof wso.index === "function") ws = Number(wso.index());
    } catch (_e) {
      ws = -1;
    }
    if (!(ws >= 0)) {
      try {
        const idx = global.display?.get_workspace_manager?.()?.get_active_workspace_index?.();
        if (Number.isFinite(idx)) ws = Number(idx);
      } catch (_e) {
        ws = -1;
      }
    }
    const stickyId = createMonWsId(stickyMon, ws >= 0 ? ws : 0);
    const stickyNode = forest.nodes[stickyId];
    if (stickyNode?.kind === "MONITOR") {
      let hasTile = false;
      walk(forest, stickyNode, (n) => {
        if (n.kind === "WINDOW" && !windowIsFloating(forest, n)) hasTile = true;
      });
      // Empty dest head (D027): FLOAT→TILE must not dump onto Meta's occupied mon.
      // Occupied sticky dest (PlaceNext/dock) keeps LFT/slot attach via the Meta path.
      if (!hasTile) return stickyNode;
    }
  }
  const wantId = monWsIdFromMeta(meta);
  if (wantId && forest.nodes[wantId]?.kind === "MONITOR") return forest.nodes[wantId];
  let wantWs = wantId ? workspaceFromId(wantId) : -1;
  if (!(wantWs >= 0)) {
    try {
      const wmgr = global.display?.get_workspace_manager?.();
      const idx = wmgr?.get_active_workspace_index?.();
      if (Number.isFinite(idx)) wantWs = idx;
    } catch (_e) {
      wantWs = -1;
    }
  }

  const liveParent = liveNode?.parentNode;
  if (liveParent && wm.liveById instanceof Map) {
    for (const [id, live] of wm.liveById) {
      const node = forest.nodes[id];
      if (live !== liveParent || !node || !isUnderTiles(forest, node)) continue;
      const mon = node.kind === "MONITOR" ? node : ancestorMonitor(forest, node);
      if (wantWs >= 0 && mon && workspaceFromId(mon.id) !== wantWs) continue;
      return node;
    }
  }
  const focusId = forest.focusId || forest.selectionId;
  if (focusId && forest.nodes[focusId]) {
    const focus = forest.nodes[focusId];
    if (!isUnderFloats(forest, focus)) {
      const p = tomParent(forest, focus);
      const mon = ancestorMonitor(forest, focus);
      const wsOk = !(wantWs >= 0 && mon && workspaceFromId(mon.id) !== wantWs);
      if (wsOk && p && (p.kind === "MONITOR" || p.kind === "CON") && isUnderTiles(forest, p)) {
        return p;
      }
      if (wsOk && mon) return mon;
    }
  }
  if (wantWs >= 0) {
    const hit = (forest.monitors || []).find((m) => m && workspaceFromId(m.id) === wantWs);
    if (hit) return hit;
  }
  return forest.monitors[0] || null;
}

/**
 * D032 insert unit for FLOAT→TILE: a TILE whose H/V parent already has
 * siblings. Empty dest / lone TILE return null (append, do not wrap).
 * @param {any} wm
 * @param {any} forest
 * @param {any} liveNode
 * @param {any} tilesParent
 */
function resolveRetileSlotUnit(wm, forest, liveNode, tilesParent) {
  if (!forest || !tilesParent) return null;
  const destMon =
    tilesParent.kind === "MONITOR" ? tilesParent : ancestorMonitor(forest, tilesParent);
  /** @type {any[]} */
  const candidates = [];
  const lft = wm.lftMru?.globalHead?.() || wm.lastFocusedWindow;
  if (lft && lft !== liveNode) candidates.push(lft);
  const focusId = forest.focusId || forest.selectionId;
  if (focusId && wm.liveById instanceof Map) {
    const focused = wm.liveById.get(focusId);
    if (focused && focused !== liveNode) candidates.push(focused);
  }
  const seen = new Set();
  for (const live of candidates) {
    if (!live || seen.has(live)) continue;
    seen.add(live);
    const uid = forestIdFromLive(wm, live);
    const tom = uid ? forest.nodes[uid] : null;
    if (!tom || tom.kind !== "WINDOW" || windowIsFloating(forest, tom)) continue;
    const unitMon = ancestorMonitor(forest, tom);
    if (destMon && unitMon && unitMon.id !== destMon.id) continue;
    const parent = tomParent(forest, tom);
    if (!parent || (parent.layout !== "HSPLIT" && parent.layout !== "VSPLIT")) continue;
    if ((parent.childIds || []).length < 2) continue;
    return live;
  }
  return null;
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
      if (liveNode.mode !== "FLOAT") liveNode.mode = "FLOAT";
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
    if (liveNode.mode !== "FLOAT") liveNode.mode = "FLOAT";
  } else {
    if (!isUnderFloats(forest, tom) && isUnderTiles(forest, tom)) {
      wm.hostBag.set(id, { floating: false });
      try {
        liveNode.float = false;
      } catch (_e) {
        /* duck has no float setter */
      }
      if (liveNode.mode !== "TILE") liveNode.mode = "TILE";
      return true;
    }
    const tilesParent =
      (opts.tilesParentId && forest.nodes[opts.tilesParentId]) ||
      resolveRetileParent(wm, forest, liveNode);
    if (!tilesParent || tilesParent.kind === "FLOATS") return false;
    const slotLive = resolveRetileSlotUnit(wm, forest, liveNode, tilesParent);
    if (slotLive) {
      const orient =
        typeof wm._orientationFromUnit === "function"
          ? wm._orientationFromUnit(slotLive)
          : "VERTICAL";
      if (forestSlotSplit(wm, slotLive, orient, { insertLive: liveNode })) {
        const placed = forest.nodes[id];
        const splitMon = placed ? ancestorMonitor(forest, placed) : null;
        if (splitMon) mark2CleanupUnder(forest, splitMon);
        wm.hostBag.set(id, { floating: false });
        try {
          liveNode.float = false;
        } catch (_e) {
          /* duck has no float setter */
        }
        if (liveNode.mode !== "TILE") liveNode.mode = "TILE";
        return true;
      }
    }
    const r = moveWindowToTiles(forest, tom, tilesParent);
    if (!r?.ok) return false;
    const mon = ancestorMonitor(forest, tom);
    if (mon) mark2CleanupUnder(forest, mon);
    wm.hostBag.set(id, { floating: false });
    try {
      liveNode.float = false;
    } catch (_e) {
      /* duck has no float setter */
    }
    if (liveNode.mode !== "TILE") liveNode.mode = "TILE";
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
  if (live) {
    const deco = live.decoration && !live.decoration._forgeDisposed ? live.decoration : null;
    if (deco && hooks.hostBag) {
      hooks.hostBag.set(id, { decoration: deco, tabStrip: deco });
    }
    return live;
  }
  const entry = hooks.hostBag?.get?.(id);
  if (entry?.actor) {
    const root = liveById.get("ROOT");
    live = liveFromActor(liveById, entry.actor, root);
    if (!live && typeof hooks.createConFromActor === "function") {
      live = hooks.createConFromActor(entry.actor);
    }
    if (!live) {
      live = makeLiveHandle(NODE_TYPES.CON, entry.actor, {
        wm: hooks.wm,
        settings: hooks.wm?.tree?.settings,
      });
    }
    if (live) {
      if (live.wm == null && hooks.wm) live.wm = hooks.wm;
      ensureLiveListMutators(live);
      liveById.set(id, live);
      NodeChrome.createDecoration(live);
      const deco = live.decoration && !live.decoration._forgeDisposed ? live.decoration : null;
      if (deco && hooks.hostBag) {
        hooks.hostBag.set(id, { decoration: deco, tabStrip: deco, actor: entry.actor });
      } else {
        hooks.hostBag?.set(id, { actor: entry.actor });
      }
      return live;
    }
  }
  live = hooks.createCon();
  if (live?.wm == null && hooks.wm) live.wm = hooks.wm;
  ensureLiveListMutators(live);
  liveById.set(id, live);
  NodeChrome.createDecoration(live);
  const actor = live?.nodeValue;
  const deco = live?.decoration && !live.decoration._forgeDisposed ? live.decoration : null;
  hooks.hostBag?.set(id, {
    actor: actor && typeof actor === "object" ? actor : undefined,
    ...(deco ? { decoration: deco, tabStrip: deco } : {}),
  });
  return live;
}

/**
 * Paint / reconcile live actors from Forest + host bag (Forest already mutated).
 * Does not mirror TILES topology onto GObject child-lists (D096 G8e).
 * @param {Forest} forest
 * @param {Map<string, any>} liveById
 * @param {{
 *   createCon: () => any,
 *   windowIdOf?: (n: any) => string|null,
 *   hostBag?: import('../host/bag.js').HostBag,
 *   findNode?: (meta: any) => any,
 * }} hooks
 */
export function paintLiveForest(forest, liveById, hooks) {
  if (!forest || !liveById || typeof hooks?.createCon !== "function") return;

  const floatBag = floatsOf(forest);
  for (const [id, tom] of Object.entries(forest.nodes)) {
    let live = liveById.get(id);
    if (!live) {
      if (tom.kind === "CON" && hasWindowDescendant(forest, tom)) {
        live = ensureLiveCon(id, liveById, hooks);
      } else {
        continue;
      }
    }
    if (tom.kind === "CON" || tom.kind === "MONITOR") {
      if (tom.layout) writeLayout(live, tom.layout);
    }
    if (Number.isFinite(tom.percent)) live.percent = tom.percent;
    live.userSized = !!tom.userSized;
  }

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

      if (liveTilesParented(liveFloat, hooks.wm) && hooks.hostBag?.get?.(cid)?.floating !== true) {
        recordInvariant("paint-detach-tiles", cid, `id=${cid}`);
        continue;
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
    if (liveKind(live) !== "CON") continue;
    const tom = forest.nodes[id];
    const unaryBag =
      !!tom &&
      tom.kind === "CON" &&
      (tom.layout === "TABBED" || tom.layout === "STACKED") &&
      tom.childIds?.length === 1;
    if (unaryBag) {
      Logger.trace(`chrome-unary teardown id=${id} reason=unary`);
      try {
        NodeChrome.destroyDecoration(live);
      } catch (_e) {
        /* disposed chrome */
      }
      continue;
    }
    if (tom && tom.kind === "CON" && hasWindowDescendant(forest, tom)) continue;
    try {
      NodeChrome.destroyDecoration(live);
    } catch (_e) {
      /* disposed chrome */
    }
    liveById.delete(id);
    if (!tom || tom.kind === "CON") {
      try {
        hooks.hostBag?.delete?.(id);
      } catch (_e) {
        /* duck bag */
      }
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
    wm,
    createCon: () => {
      return makeLiveHandle(NODE_TYPES.CON, new St.Bin(), {
        wm,
        settings: wm?.tree?.settings,
      });
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
  // Paint may still run GObject leftover cleanup; G8j allow-list uses this flag.
  const wasMirror = !!wm._presentPaintMirror;
  wm._presentPaintMirror = true;
  try {
    paintLiveForest(wm.forest, liveById, h);
  } finally {
    wm._presentPaintMirror = wasMirror;
  }
  wm.liveById = liveById;
  return true;
}

/**
 * Refresh Forest world geoms from Meta workareas (+ window margins).
 * @param {any} wm
 * @returns {boolean}
 */
export function refreshWmWorldGeoms(wm) {
  const forest = wm?.forest;
  if (!forest?.monitors?.length) return false;
  const settings = wm.ext?.settings || wm.tree?.settings;
  const margins = {
    top: settings?.get_uint?.("window-margin-top") || 0,
    bottom: settings?.get_uint?.("window-margin-bottom") || 0,
    left: settings?.get_uint?.("window-margin-left") || 0,
    right: settings?.get_uint?.("window-margin-right") || 0,
  };
  /** @type {Record<string, import('../world/index.js').MonitorGeom>} */
  const geoms = {};
  let workspaceMgr = null;
  try {
    workspaceMgr = global.display?.get_workspace_manager?.();
  } catch (_e) {
    workspaceMgr = null;
  }
  forest.monitors.forEach((m, i) => {
    if (!m?.id) return;
    const live = wm.liveById?.get?.(m.id);
    const monVal = live?.nodeValue != null ? live.nodeValue : m.id;
    const monIdx = Utils.monitorIndex(String(monVal));
    const wsIdx = Utils.workspaceIndex(String(monVal));
    let area = null;
    try {
      const ws =
        wsIdx >= 0
          ? workspaceMgr?.get_workspace_by_index?.(wsIdx)
          : workspaceMgr?.get_active_workspace?.();
      if (ws && monIdx >= 0 && typeof ws.get_work_area_for_monitor === "function") {
        area = ws.get_work_area_for_monitor(monIdx);
      }
    } catch (_e) {
      area = null;
    }
    if (!area) {
      const prev = geomOf(forest, m.id);
      if (prev) {
        geoms[m.id] = { ...prev, id: m.id };
        return;
      }
      area = { x: i * 1920, y: 0, width: 1920, height: 1080 };
    }
    const inset = {
      x: area.x + margins.left,
      y: area.y + margins.top,
      width: area.width - margins.left - margins.right,
      height: area.height - margins.top - margins.bottom,
    };
    geoms[m.id] = {
      id: m.id,
      x: inset.x,
      y: inset.y,
      width: inset.width,
      height: inset.height,
      primary: i === 0,
    };
  });
  attachWorld(forest, { geoms });
  return true;
}

/**
 * TABBED/STACKED tiled WINDOWs under a bag CON (not placeholders).
 * @param {any} wm
 * @param {Forest} forest
 * @param {TomNode} parent
 * @returns {TomNode[]}
 */
function forestBagTiledWindows(wm, forest, parent) {
  /** @type {TomNode[]} */
  const out = [];
  for (const ch of children(forest, parent)) {
    if (!ch || ch.kind !== "WINDOW") continue;
    if (forestNodeIsPlaceholder(wm, ch)) continue;
    if (windowIsFloating(forest, ch)) continue;
    out.push(ch);
  }
  return out;
}

/**
 * Meta content rect inside a TABBED/STACKED slot. Forest paneRect fills the bag;
 * Forge chrome paints on top — inset so app chrome (e.g. Google Chrome tabs)
 * is not covered by the strip.
 * @param {any} wm
 * @param {Forest} forest
 * @param {TomNode} node
 * @param {{ x: number, y: number, width: number, height: number }} slot
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function forestBagChromeContentRect(wm, forest, node, slot) {
  const p = tomParent(forest, node);
  if (!p || (p.layout !== "TABBED" && p.layout !== "STACKED")) return slot;
  const tiled = forestBagTiledWindows(wm, forest, p);
  if (tiled.length < 2) return slot;
  const settings = wm.tree?.settings || wm.ext?.settings;
  if (settings && typeof settings.get_boolean === "function") {
    if (settings.get_boolean("showtab-decoration-enabled") === false) return slot;
  }
  const dpi = Utils.dpi() || 1;
  let rowH = 35 * dpi;
  if (settings && typeof settings.get_uint === "function") {
    const cfg = Number(settings.get_uint("stacked-tab-bar-height"));
    if (cfg >= 1) rowH = cfg * dpi;
  }
  const pos =
    settings &&
    typeof settings.get_string === "function" &&
    settings.get_string("tab-position") === "bottom"
      ? "bottom"
      : "top";
  if (p.layout === "STACKED") {
    return stackedChildRect(slot, rowH, tiled.length, pos).rect;
  }
  const maxPerLine =
    settings && typeof settings.get_uint === "function"
      ? Number(settings.get_uint("max-tabs-per-line")) || 0
      : 0;
  const minChars =
    settings && typeof settings.get_uint === "function"
      ? Number(settings.get_uint("min-tab-label-chars")) || 0
      : 0;
  const maxRows =
    settings && typeof settings.get_uint === "function"
      ? Number(settings.get_uint("max-tab-rows")) || 0
      : 0;
  const minTabWidth =
    minChars > 0
      ? minTabWidthFromChars(minChars, 0.55 * 11 * dpi, Math.round((24 + 30 + 12) * dpi))
      : 0;
  const plan = planTabbedWrap({
    count: tiled.length,
    rowInnerWidth: slot.width,
    minTabWidth,
    maxPerLine,
    maxRows,
  });
  const rows = Math.max(1, plan.rowCount || 1);
  return tabbedChildRect(slot, rowH * rows, pos, true);
}

/**
 * Seeded TILE dest: Forest paneRect + gap + zoom (same as presentWmSlots).
 * @param {any} wm
 * @param {any} liveOrId live WINDOW or Forest id
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function forestSlotPaintRect(wm, liveOrId) {
  const forest = wm?.forest;
  if (!wm?._liveForestSeeded || !forest) return null;
  const id = typeof liveOrId === "string" ? liveOrId : forestIdFromLive(wm, liveOrId);
  if (!id) return null;
  const node = forest.nodes[id];
  if (!node) return null;
  const slot = forestSlotRect(forest, node);
  if (!slot || !(slot.width > 0) || !(slot.height > 0)) return null;
  const content = forestBagChromeContentRect(wm, forest, node, slot);
  const live = typeof liveOrId === "object" && liveOrId ? liveOrId : wm.liveById?.get?.(id);
  const meta = wm.hostBag?.get?.(id)?.meta || live?.nodeValue;
  const gap =
    typeof wm.calculateGaps === "function" ? wm.calculateGaps(live || { nodeValue: meta }) : 0;
  let dest = layoutProcessGap({ rect: content, nodeValue: meta, isWindow: () => true }, gap);
  if (live?.zoomMode) {
    const mon = ancestorMonitor(forest, node);
    const monGeom = mon ? geomOf(forest, mon) : null;
    if (monGeom) {
      const workarea = layoutProcessGap(
        {
          rect: {
            x: monGeom.x,
            y: monGeom.y,
            width: monGeom.width,
            height: monGeom.height,
          },
        },
        gap
      );
      dest = zoomRect(dest, workarea, live.zoomMode) || dest;
    }
  }
  return dest;
}

/**
 * First TILE present: move Meta to Forest slot AABB when known (SG4).
 * @param {any} wm
 * @param {any} meta
 * @param {any} liveOrId
 * @returns {boolean}
 */
export function moveLiveToForestSlot(wm, meta, liveOrId) {
  if (!wm?._liveForestSeeded || !wm.forest || !meta || typeof wm.move !== "function") {
    return false;
  }
  refreshWmWorldGeoms(wm);
  const dest = forestSlotPaintRect(wm, liveOrId);
  if (!dest || !(dest.width > 0) || !(dest.height > 0)) return false;
  wm.move(meta, dest);
  return true;
}

/**
 * Buried tab/stack peer: Forest parent TABBED/STACKED and not lastTabFocusId.
 * No GObject parentNode / duck lastTabFocus when Forest parent exists.
 * @param {Forest} forest
 * @param {TomNode} node
 * @returns {boolean}
 */
export function forestSlotPresentBuried(forest, node) {
  if (!forest?.nodes || !node) return false;
  const p = tomParent(forest, node);
  if (!p) return false;
  if (p.layout !== "TABBED" && p.layout !== "STACKED") return false;
  if (p.lastTabFocusId == null || p.lastTabFocusId === "") return false;
  return node.id !== p.lastTabFocusId;
}

/**
 * Present tiled Meta slots from Forest paneRect (+ gap/zoom). No GObject invent.
 * D069: open leaf before buried; bag open leaf is issued again last so Mutter
 * does not keep the buried peer's configure (join from a V-split).
 * @param {any} wm
 * @param {string} [from]
 * @returns {{ ok: boolean, moved: number, skipped: number }}
 */
export function presentWmSlots(wm, from = "present") {
  const forest = wm?.forest;
  const bag = wm?.hostBag;
  if (!wm?._liveForestSeeded || !forest || !bag) {
    return { ok: false, moved: 0, skipped: 0 };
  }
  const t0 = Date.now();
  refreshWmWorldGeoms(wm);

  // Empty shares → equal fill so paneRect is non-zero (admit without insertChildPercent).
  for (const mon of forest.monitors || []) {
    walk(forest, mon, (n) => {
      if (!n || (n.kind !== "CON" && n.kind !== "MONITOR")) return;
      if (n.kind === "CON" && !hasWindowDescendant(forest, n)) {
        Logger.trace(`present empty-con id=${n.id} parent=${n.parentId || "-"}`);
      }
      const kids = children(forest, n);
      if (!kids.length) return;
      if (kids.every((k) => !(Number(k.percent) > 0))) equalizeChildren(forest, n);
    });
  }

  wm?._suppressRehome?.enter?.();
  wm?._suppressGeom?.enter?.();
  let moved = 0;
  let skipped = 0;
  /** @type {any[]} */
  const open = [];
  /** @type {any[]} */
  const buried = [];
  /** @type {any[]} */
  const bagOpen = [];

  try {
    const root = tilesOf(forest) || forest.nodes[forest.rootId];
    if (root) {
      walk(forest, root, (node) => {
        if (!node || node.kind !== "WINDOW") return;
        if (!isUnderTiles(forest, node)) return;
        const entry = bag.get?.(node.id);
        const meta = entry?.meta;
        const live = wm.liveById?.get?.(node.id);
        if (!meta || typeof meta !== "object") {
          skipped += 1;
          return;
        }
        if (isPlaceholderValue(meta) || (live && isPlaceholderNode(live))) {
          skipped += 1;
          return;
        }
        try {
          if (typeof meta.is_fullscreen === "function" && meta.is_fullscreen()) {
            skipped += 1;
            return;
          }
        } catch (_e) {
          skipped += 1;
          return;
        }
        if (
          live &&
          !live.zoomMode &&
          !meta.firstRender &&
          typeof wm._isLoneMaximizedTile === "function" &&
          wm._isLoneMaximizedTile(live)
        ) {
          skipped += 1;
          return;
        }
        const dest = forestSlotPaintRect(wm, node.id);
        if (!dest || !(dest.width > 0) || !(dest.height > 0)) {
          skipped += 1;
          return;
        }
        const slot = forestSlotRect(forest, node);
        if (live && slot) {
          live.rect = { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
          live.renderRect = dest;
        }
        const item = { meta, dest, live, zoom: !!live?.zoomMode };
        if (forestSlotPresentBuried(forest, node)) {
          buried.push(item);
        } else {
          open.push(item);
          const p = tomParent(forest, node);
          if (p && (p.layout === "TABBED" || p.layout === "STACKED")) {
            bagOpen.push(item);
          }
        }
      });
    }

    const presentItem = (item) => {
      if (typeof wm.move !== "function") {
        skipped += 1;
        return;
      }
      wm.move(item.meta, item.dest);
      moved += 1;
      if (item.zoom) {
        try {
          item.meta.raise?.();
        } catch (_e) {
          /* disposed */
        }
      }
      if (item.meta.firstRender) item.meta.firstRender = false;
    };

    for (const item of [...open, ...buried]) presentItem(item);
    // Same-turn buried configure otherwise wins; replay the bag open leaf last.
    for (const item of bagOpen) presentItem(item);
  } finally {
    wm?._suppressGeom?.leave?.();
    wm?._suppressRehome?.leave?.();
  }

  recordPresent({ from, moved, skipped, ms: Date.now() - t0 });
  return { ok: true, moved, skipped };
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

/** liveById reverse lookup even when Forest node is already gone (chrome detach). */
export function liveBagId(wm, live) {
  if (!wm || !live) return null;
  try {
    const id = forestIdFromLive(wm, live);
    if (id) return id;
  } catch (_e) {
    /* */
  }
  if (wm.liveById instanceof Map) {
    for (const [id, n] of wm.liveById) {
      if (n === live) return id;
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
 * GObject parentNode is not TILES SoT (D096). FLOATS heal is alignForestFloatsToLiveTiles.
 * @param {any} _wm
 * @param {import('../tom/kernel.js').Forest} _forest
 * @param {any} _live
 */
function alignForestToLiveConParent(_wm, _forest, _live) {}

/**
 * Heal float-class / bag.floating WINDOW stuck under TILES back to FLOATS.
 * @param {any} wm
 * @param {import('../tom/kernel.js').Forest} forest
 */
function alignForestFloatsToLiveTiles(wm, forest) {
  for (const id of Object.keys(forest.nodes || {})) {
    const tom = forest.nodes[id];
    if (!tom || tom.kind !== "WINDOW") continue;
    if (!isUnderTiles(forest, tom)) continue;
    const floatClass = skeletonWinIsFloatClass(wm, tom);
    const bagFloat = wm.hostBag?.get?.(id)?.floating === true;
    if (!floatClass && !bagFloat) continue;
    if (!moveWindowToFloats(forest, tom)?.ok) continue;
    wm.hostBag?.set?.(id, { floating: true });
    Logger.info("heal-float-in-tiles", {
      fields: { id, reason: floatClass ? "float-class" : "bag" },
    });
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
  wm.hostBag?.set?.(win.id, { floating: false });
  if (winLive) winLive.mode = "TILE";
  Logger.info(
    `place-bind ok win=${win.id} phParent=${destParent.id} ` +
      `desk=${ancestorMonitor(forest, destParent)?.id || destParent.id}`
  );
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
/**
 * Dissolve a CON (or WINDOW's parent CON) by promoting children to grandparent.
 * @param {any} wm
 * @param {any} live
 * @returns {any|null} live grandparent
 */
export function forestUngroup(wm, live) {
  const forest = forestForWrite(wm);
  if (!forest || !live) return null;
  alignForestToLiveConParent(wm, forest, live);
  const id = forestIdFromLive(wm, live);
  let tom = id ? forest.nodes[id] : null;
  if (!tom) return null;
  if (tom.kind === "WINDOW") {
    tom = tomParent(forest, tom);
  }
  if (!tom || tom.kind !== "CON") return null;
  const grand = tomParent(forest, tom);
  if (!grand) return null;
  const r = promoteChildren(forest, tom);
  if (!r?.ok) return null;
  if (!paintWmForest(wm)) return null;
  return wm.liveById?.get?.(grand.id) ?? null;
}

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

  const liveParent = liveParentForPresent(wm, live) || live?.parentNode;
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
  const parent = liveParentForPresent(wm, live) || live.parentNode;
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

/** Join WINDOW into a sibling TABBED/STACKED CON when one exists. */
function forestJoinExistingTabBag(forest, win, parentTom) {
  if (!parentTom) return parentTom;
  const bagSib = children(forest, parentTom).find(
    (c) => c.kind === "CON" && (c.layout === "TABBED" || c.layout === "STACKED")
  );
  if (!bagSib) return parentTom;
  appendChild(forest, bagSib, win);
  return bagSib;
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
  if (!parentTom || (parentTom.kind !== "CON" && parentTom.kind !== "MONITOR")) {
    return { ok: false, fallback: true };
  }

  if (isTabOrStack) {
    let info = forestLayoutParentInfo(forest, parentTom);
    if (info.hasNestedCon) {
      parentTom = forestJoinExistingTabBag(forest, win, parentTom);
      info = forestLayoutParentInfo(forest, parentTom);
    }
    if (info.hasNestedCon && !info.isMon) {
      const mon = ancestorMonitor(forest, win);
      if (mon && mon.kind === "MONITOR" && parentTom !== mon) {
        appendChild(forest, mon, win);
        parentTom = mon;
        info = forestLayoutParentInfo(forest, parentTom);
        if (info.hasNestedCon) {
          parentTom = forestJoinExistingTabBag(forest, win, parentTom);
          info = forestLayoutParentInfo(forest, parentTom);
        }
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
  const live = makeLiveHandle(NODE_TYPES.WINDOW, stub, {
    wm,
    settings: wm?.tree?.settings,
    mode: "TILE",
    placeholder: true,
    layoutSlot: slot || undefined,
    layoutRole: role || undefined,
  });
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
  registerInventedLive(wm, win.id, live);
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
  const hostKids = children(forest, host);
  const wrappingAllHostKids =
    tomParent(forest, partner) === host &&
    hostKids.length === 2 &&
    hostKids.some((c) => c.id === focus.id) &&
    hostKids.some((c) => c.id === partner.id);
  if (wrappingAllHostKids) {
    wrap.percent = host.kind === "MONITOR" ? 1 : Number(host.percent) || 1;
    wrap.userSized = !!host.userSized;
  } else {
    wrap.percent = Number(focus.percent) || 0;
    wrap.userSized = !!focus.userSized;
  }
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

/**
 * Promote unary H/V CONs in place (Forest); paint. Fail-closed if no Forest id.
 * @param {any} wm
 * @param {any} live
 * @returns {any} live after unwrap (same ref when no-op / fail-closed)
 */
export function forestUnwrapUnaryLive(wm, live) {
  if (!live) return live;
  const forest = forestForWrite(wm);
  if (!forest) return live;
  const id = forestIdFromLive(wm, live);
  const n = id ? forest.nodes[id] : null;
  if (!n) return live;
  const beforeId = n.id;
  const after = unwrapUnarySplit(forest, n);
  if (!after || after.id === beforeId) return live;
  if (!paintWmForest(wm)) return live;
  return wm.liveById?.get(after.id) || live;
}

/**
 * Hoist nested mon H/V wrapper panes onto MONITOR (Forest + paint).
 * @param {any} wm
 * @param {any[]} winLives
 * @returns {{ ok: true, monDirects: any[], parent: any } | { ok: false }}
 */
export function forestHoistNestedMonPanesLive(wm, winLives) {
  const forest = forestForWrite(wm);
  if (!forest || !Array.isArray(winLives) || winLives.length < 2) {
    return { ok: false };
  }
  for (const live of winLives) alignForestToLiveConParent(wm, forest, live);
  /** @type {import('../tom/kernel.js').Node[]} */
  const wins = [];
  for (const live of winLives) {
    const id = forestIdFromLive(wm, live);
    const n = id ? forest.nodes[id] : null;
    if (!n) return { ok: false };
    wins.push(n);
  }
  const panes = forestHoistNestedMonPanes(forest, wins);
  if (panes.length < 2) return { ok: false };
  if (!paintWmForest(wm)) return { ok: false };
  /** @type {any[]} */
  const monDirects = [];
  for (const p of panes) {
    const live = wm.liveById?.get(p.id);
    if (!live) return { ok: false };
    monDirects.push(live);
  }
  const monTom = tomParent(forest, panes[0]);
  const parent = monTom ? wm.liveById?.get(monTom.id) : null;
  if (!parent) return { ok: false };
  return { ok: true, monDirects, parent };
}
