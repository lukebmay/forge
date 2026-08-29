// @ts-check
/**
 * ForgeAdapterGnome projection: GObject (or duck) Node ↔ TOM Forest.
 * No Mark 2 policy, Mutter, epochs restore, or proto imports.
 */

import { attachSession } from "../session/index.js";
import { createTomApi } from "../tom/index.js";
import { attachWorld } from "../world/index.js";

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

/** FLOAT / GRAB_TILE / minimized stay on the live tree as extras, not TOM. */
function skipUntiledWindow(live) {
  if (!live) return true;
  if (typeof live.isFloat === "function" && live.isFloat()) return true;
  if (typeof live.isGrabTile === "function" && live.isGrabTile()) return true;
  const mode = live.mode;
  if (mode === "FLOAT" || mode === "GRAB_TILE") return true;
  if (typeof live.isPlaceholder === "function" && live.isPlaceholder()) return false;
  try {
    if (live.nodeValue?.minimized) return true;
  } catch (_e) {
    return true;
  }
  return false;
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
 * }} hooks
 * @returns {{ forest: Forest, liveById: Map<string, any>, api: object }|null}
 */
export function projectLiveForest(liveRoot, hooks) {
  if (!liveRoot || !hooks || typeof hooks.windowIdOf !== "function") return null;
  if (liveKind(liveRoot) !== "ROOT") return null;

  /** @type {Forest} */
  const forest = {
    rootId: "ROOT",
    monitors: [],
    nodes: {},
    focusId: null,
    selectionId: null,
    _seq: 1,
  };
  /** @type {Map<string, any>} */
  const liveById = new Map();
  let conSeq = 1;
  let wsSeq = 0;
  let monSeq = 0;

  /**
   * @param {any} live
   * @param {string|null} parentId
   * @returns {TomNode|null}
   */
  function visit(live, parentId) {
    const kind = liveKind(live);
    if (!kind) return null;
    if (kind === "WINDOW" && skipUntiledWindow(live)) return null;

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
      id = `n${conSeq++}`;
    }

    if (forest.nodes[id]) return forest.nodes[id];

    /** @type {TomNode} */
    const tom = {
      id,
      kind,
      parentId,
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

    for (const ch of childrenOf(live)) {
      const child = visit(ch, id);
      if (child && !tom.childIds.includes(child.id)) tom.childIds.push(child.id);
    }
    return tom;
  }

  const root = visit(liveRoot, null);
  if (!root) return null;
  forest.rootId = root.id;

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
 * Write TOM topology onto the live tree (D023 methods only).
 * @param {Forest} forest
 * @param {Map<string, any>} liveById
 * @param {{ createCon: () => any, windowIdOf?: (n: any) => string|null }} hooks
 */
export function applyLiveForest(forest, liveById, hooks) {
  if (!forest || !liveById || typeof hooks?.createCon !== "function") return;

  const claimed = new Set();
  for (const [id, tom] of Object.entries(forest.nodes)) {
    let live = liveById.get(id);
    if (!live) {
      if (tom.kind === "CON") {
        live = hooks.createCon();
        liveById.set(id, live);
      } else {
        continue;
      }
    }
    claimed.add(live);
    if (tom.kind === "CON" || tom.kind === "MONITOR") {
      if (tom.layout) writeLayout(live, tom.layout);
    }
    if (Number.isFinite(tom.percent)) live.percent = tom.percent;
    live.userSized = !!tom.userSized;
  }

  /**
   * @param {TomNode} tom
   */
  function applyKids(tom) {
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
    const extras = childrenOf(live).filter((c) => !wantSet.has(c) && !claimed.has(c));
    live.replaceChildren([...want, ...extras]);
    for (const cid of tom.childIds) {
      const chTom = forest.nodes[cid];
      if (chTom) applyKids(chTom);
    }
  }

  const root = forest.nodes[forest.rootId];
  if (root) applyKids(root);

  for (const tom of Object.values(forest.nodes)) {
    if (!tom.lastTabFocusId) continue;
    const live = liveById.get(tom.id);
    const focusLive = liveById.get(tom.lastTabFocusId);
    if (!live || !focusLive) continue;
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
    try {
      p.removeChild(live);
    } catch (_e) {
      // already detached
    }
  }
}
