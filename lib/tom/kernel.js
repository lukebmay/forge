// @ts-check
/**
 * TOM kernel — forest data, factories, queries of structure.
 * No tiling policy. Geometry is the world bag, not Node.geom. No keybinds.
 */

/**
 * @typedef {'ROOT'|'WORKSPACE'|'MONITOR'|'CON'|'WINDOW'} NodeKind
 * @typedef {'HSPLIT'|'VSPLIT'|'TABBED'|'STACKED'} Layout
 * @typedef {'left'|'right'|'up'|'down'} Dir
 *
 * @typedef {Object} Node
 * @property {string} id
 * @property {NodeKind} kind
 * @property {Layout} [layout]
 * @property {string} [label]
 * @property {string} [wmClass]
 * @property {number} [percent]
 * @property {boolean} [userSized]
 * @property {string|null} parentId
 * @property {string[]} childIds
 * @property {string} [lastTabFocusId]
 * @property {Node[]} [_pendingChildren]
 *
 * @typedef {Object} Forest
 * @property {string} [rootId]
 * @property {Node[]} monitors
 * @property {Record<string, Node>} nodes
 * @property {string|null} focusId
 * @property {string|null} selectionId
 * @property {number} _seq
 *
 * @typedef {{ ok: true, op: string, [k: string]: any }} Ok
 * @typedef {{ ok: false, reason: string }} Fail
 * @typedef {Ok | Fail} Result
 */

/** @param {string} op @param {object} [detail] @returns {Ok} */
export function ok(op, detail = {}) {
  return { ok: true, op, ...detail };
}

/** @param {string} reason @returns {Fail} */
export function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {number} [start]
 */
export function makeIdFactory(start = 1) {
  let seq = start;
  return {
    nid() {
      return `n${seq++}`;
    },
    get seq() {
      return seq;
    },
    set seq(n) {
      seq = n;
    },
    /**
     * @param {Forest} f
     */
    hydrate(f) {
      let max = 0;
      for (const id of Object.keys(f.nodes)) {
        const m = /^n(\d+)$/.exec(id);
        if (m) max = Math.max(max, Number(m[1]));
      }
      seq = Math.max(seq, max + 1);
      f._seq = seq;
    },
  };
}

/**
 * @param {() => string} nid
 * @param {Partial<Node> & { kind: NodeKind }} partial
 * @returns {Node}
 */
export function makeNode(nid, partial) {
  return {
    id: partial.id ?? nid(),
    kind: partial.kind,
    layout: partial.layout,
    label: partial.label,
    wmClass: partial.wmClass,
    percent: partial.percent ?? 1,
    userSized: partial.userSized ?? false,
    parentId: partial.parentId ?? null,
    childIds: partial.childIds ? [...partial.childIds] : [],
    lastTabFocusId: partial.lastTabFocusId,
  };
}

/**
 * @param {() => string} nid
 * @param {string} label
 * @param {string} [wmClass]
 */
export function makeWindow(nid, label, wmClass = "app") {
  return makeNode(nid, { kind: "WINDOW", label, wmClass });
}

/**
 * @param {() => string} nid
 * @param {Layout} layout
 * @param {Node[]} [children]
 */
export function makeCon(nid, layout, children = []) {
  const con = makeNode(nid, { kind: "CON", layout, childIds: [] });
  /** @type {Node[]} */
  const pending = [];
  for (const ch of children) {
    ch.parentId = con.id;
    con.childIds.push(ch.id);
    pending.push(ch);
  }
  con._pendingChildren = pending;
  return con;
}

/**
 * @param {Forest} forest
 * @param {Node} node
 */
export function registerTree(forest, node) {
  forest.nodes[node.id] = node;
  const pending = node._pendingChildren;
  if (pending) {
    for (const ch of pending) registerTree(forest, ch);
    delete node._pendingChildren;
  }
}

/**
 * `geoms` is monitor count + ids only. Workarea lives in lib/world/.
 * @param {{ id?: string }[]} geoms
 * @param {() => string} nid
 * @returns {Forest}
 */
export function createForest(geoms, nid) {
  /** @type {Forest} */
  const forest = {
    rootId: "ROOT",
    monitors: [],
    nodes: {},
    focusId: null,
    selectionId: null,
    _seq: 1,
  };
  const root = makeNode(nid, { kind: "ROOT", id: "ROOT", label: "ROOT" });
  const ws = makeNode(nid, { kind: "WORKSPACE", id: "WS1", label: "WS1" });
  forest.nodes[root.id] = root;
  forest.nodes[ws.id] = ws;
  ws.parentId = root.id;
  root.childIds = [ws.id];
  for (const g of geoms) {
    const mon = makeNode(nid, {
      kind: "MONITOR",
      id: g.id || nid(),
      label: g.id || "mon",
      layout: "HSPLIT",
    });
    forest.nodes[mon.id] = mon;
    forest.monitors.push(mon);
    mon.parentId = ws.id;
    ws.childIds.push(mon.id);
  }
  return forest;
}

/**
 * Attach ROOT → WS1 → monitors if a saved/cloned TOM is missing the spine.
 * @param {Forest} f
 * @param {() => string} nid
 */
export function ensureSpine(f, nid) {
  let root = f.rootId ? f.nodes[f.rootId] : f.nodes.ROOT;
  if (!root || root.kind !== "ROOT") {
    root = makeNode(nid, { kind: "ROOT", id: "ROOT", label: "ROOT" });
    f.nodes[root.id] = root;
  }
  f.rootId = root.id;

  let ws = f.nodes.WS1;
  if (!ws || ws.kind !== "WORKSPACE") {
    ws = Object.values(f.nodes).find((n) => n.kind === "WORKSPACE") || null;
  }
  if (!ws) {
    ws = makeNode(nid, { kind: "WORKSPACE", id: "WS1", label: "WS1" });
    f.nodes[ws.id] = ws;
  }
  if (ws.parentId !== root.id) {
    ws.parentId = root.id;
    if (!root.childIds.includes(ws.id)) root.childIds = [ws.id, ...root.childIds];
  }

  for (const mon of f.monitors) {
    if (!mon) continue;
    if (mon.parentId && f.nodes[mon.parentId]) continue;
    mon.parentId = ws.id;
    if (!ws.childIds.includes(mon.id)) ws.childIds.push(mon.id);
  }
}

/** @param {Forest} f @param {string} id */
export function get(f, id) {
  return f.nodes[id] ?? null;
}

/** @param {Forest} f @param {Node} n */
export function parent(f, n) {
  return n.parentId ? f.nodes[n.parentId] ?? null : null;
}

/** @param {Forest} f @param {Node} n */
export function children(f, n) {
  return n.childIds.map((id) => f.nodes[id]).filter(Boolean);
}

/** @param {Forest} f */
export function focusNode(f) {
  return f.focusId ? f.nodes[f.focusId] ?? null : null;
}

/** @param {Forest} f */
export function selectionNode(f) {
  return f.selectionId ? f.nodes[f.selectionId] ?? null : focusNode(f);
}

/** @param {Forest} f @param {Node} n */
export function markOpenLeaf(f, n) {
  let cur = n;
  while (cur && cur.parentId) {
    const p = f.nodes[cur.parentId];
    if (!p) break;
    if (p.layout === "TABBED" || p.layout === "STACKED") p.lastTabFocusId = cur.id;
    cur = p;
  }
}

/** @param {Forest} f @param {string|null} id */
export function setFocus(f, id) {
  f.focusId = id;
  if (id) f.selectionId = id;
  const n = id ? f.nodes[id] : null;
  if (n) markOpenLeaf(f, n);
}

/** @param {Forest} f @param {string|null} id */
export function setSelection(f, id) {
  f.selectionId = id;
}

/** @param {Forest} f @param {Node} n @param {Node} ancestor */
export function isUnder(f, n, ancestor) {
  let cur = n;
  while (cur) {
    if (cur.id === ancestor.id) return true;
    cur = cur.parentId ? f.nodes[cur.parentId] : null;
  }
  return false;
}

/** @param {Forest} f @param {Node} n */
export function depth(f, n) {
  let d = 0;
  let cur = n;
  while (cur?.parentId) {
    d++;
    cur = f.nodes[cur.parentId];
  }
  return d;
}

/**
 * @param {Forest} f
 * @param {Node} root
 * @param {(n: Node) => void} fn
 */
export function walk(f, root, fn) {
  fn(root);
  for (const cid of root.childIds) {
    const ch = f.nodes[cid];
    if (ch) walk(f, ch, fn);
  }
}

/** @param {any} f */
function stripGeom(f) {
  for (const n of Object.values(f.nodes || {})) {
    if (n) delete n.geom;
  }
  for (const m of f.monitors || []) {
    if (m) delete m.geom;
  }
}

/** @param {Forest} f */
export function dumpForest(f) {
  const raw = JSON.parse(JSON.stringify(f));
  delete raw.mergeTags;
  delete raw.decisions;
  stripGeom(raw);
  return raw;
}

/** @param {Forest} f @returns {Forest} */
export function cloneForest(f) {
  /** @type {Forest} */
  const raw = JSON.parse(JSON.stringify(f));
  raw.monitors = (raw.monitors || []).map((m) => raw.nodes[m.id]).filter(Boolean);
  delete (/** @type {any} */ (raw).mergeTags);
  delete (/** @type {any} */ (raw).decisions);
  stripGeom(raw);
  return raw;
}

/**
 * @param {Forest} live
 * @param {Forest} draft
 * @param {{ hydrateSeq?: (f: Forest) => void }} [api]
 */
export function applyForestSnapshot(live, draft, api) {
  live.nodes = draft.nodes;
  live.monitors = (draft.monitors || []).map((m) => live.nodes[m.id]).filter(Boolean);
  live.focusId = draft.focusId;
  live.selectionId = draft.selectionId;
  live._seq = draft._seq;
  delete (/** @type {any} */ (live).mergeTags);
  delete (/** @type {any} */ (live).decisions);
  stripGeom(live);
  api?.hydrateSeq?.(live);
}

/** @param {Forest} forest */
export function nextAppLabel(forest) {
  const used = new Set();
  for (const n of Object.values(forest.nodes)) {
    if (n.kind === "WINDOW" && n.label) used.add(n.label);
  }
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i);
    if (!used.has(L)) return L;
  }
  return `W${Object.keys(forest.nodes).length}`;
}
