// @ts-check
/**
 * Host world bag — MONITOR workareas, not TOM.
 */

/** @typedef {import('../tom/kernel.js').Forest} Forest */

/**
 * @typedef {Object} MonitorGeom
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} [primary]
 *
 * @typedef {Object} ForestWorld
 * @property {Record<string, MonitorGeom>} geoms
 */

/** @type {WeakMap<Forest, ForestWorld>} */
const bags = new WeakMap();

const DEFAULT_W = 1920;
const DEFAULT_H = 1080;

/**
 * @param {string} id
 * @param {number} index
 * @returns {MonitorGeom}
 */
function defaultGeom(id, index) {
  return {
    id,
    x: index * DEFAULT_W,
    y: 0,
    width: DEFAULT_W,
    height: DEFAULT_H,
    primary: index === 0,
  };
}

/**
 * @param {string} id
 * @param {Partial<MonitorGeom>} g
 * @param {number} index
 * @returns {MonitorGeom}
 */
function normalizeGeom(id, g, index) {
  const d = defaultGeom(id, index);
  return {
    id,
    x: Number.isFinite(g.x) ? /** @type {number} */ (g.x) : d.x,
    y: Number.isFinite(g.y) ? /** @type {number} */ (g.y) : d.y,
    width: Number.isFinite(g.width) ? /** @type {number} */ (g.width) : d.width,
    height: Number.isFinite(g.height) ? /** @type {number} */ (g.height) : d.height,
    primary: g.primary != null ? !!g.primary : d.primary,
  };
}

/**
 * @param {ForestWorld} src
 * @returns {ForestWorld}
 */
function cloneBag(src) {
  /** @type {Record<string, MonitorGeom>} */
  const geoms = {};
  for (const [id, g] of Object.entries(src.geoms)) {
    geoms[id] = { ...g };
  }
  return { geoms };
}

/** @param {any} n */
function peelNodeGeom(n) {
  if (!n || typeof n !== "object") return undefined;
  const raw = n.geom;
  delete n.geom;
  return raw && typeof raw === "object" ? raw : undefined;
}

/**
 * Pull leftover Node.geom (old dumps) then delete it.
 * @param {Forest} f
 * @returns {ForestWorld}
 */
function takeAttached(f) {
  /** @type {Record<string, MonitorGeom>} */
  const geoms = {};
  const seen = new Set();
  (f.monitors || []).forEach((m, i) => {
    if (!m) return;
    seen.add(m.id);
    const leftover = peelNodeGeom(m);
    geoms[m.id] = leftover ? normalizeGeom(m.id, leftover, i) : defaultGeom(m.id, i);
  });
  for (const n of Object.values(f.nodes || {})) {
    if (!n || n.kind !== "MONITOR") continue;
    const leftover = peelNodeGeom(n);
    if (seen.has(n.id)) continue;
    const i = Object.keys(geoms).length;
    geoms[n.id] = leftover ? normalizeGeom(n.id, leftover, i) : defaultGeom(n.id, i);
  }
  return { geoms };
}

/**
 * @param {Forest} f
 * @returns {ForestWorld}
 */
export function worldOf(f) {
  let w = bags.get(f);
  if (!w) {
    w = takeAttached(f);
    bags.set(f, w);
  }
  return w;
}

/**
 * @param {Forest} f
 * @param {Partial<ForestWorld>} [bag]
 * @returns {ForestWorld}
 */
export function attachWorld(f, bag = {}) {
  /** @type {Record<string, MonitorGeom>} */
  const geoms = {};
  const src = bag.geoms || {};
  (f.monitors || []).forEach((m, i) => {
    if (!m) return;
    const g = src[m.id];
    geoms[m.id] = g ? normalizeGeom(m.id, g, i) : defaultGeom(m.id, i);
  });
  for (const [id, g] of Object.entries(src)) {
    if (geoms[id] || !g) continue;
    geoms[id] = normalizeGeom(id, g, 0);
  }
  const w = { geoms };
  bags.set(f, w);
  takeAttached(f);
  return w;
}

/**
 * @param {Forest} from
 * @param {Forest} to
 * @returns {ForestWorld}
 */
export function copyWorld(from, to) {
  const src = bags.get(from) || takeAttached(from);
  if (!bags.has(from)) bags.set(from, src);
  const dst = cloneBag(src);
  bags.set(to, dst);
  takeAttached(to);
  return dst;
}

/**
 * @param {Forest} f
 * @param {string|{ id: string }|null|undefined} monOrId
 * @returns {MonitorGeom|null}
 */
export function geomOf(f, monOrId) {
  const id = typeof monOrId === "string" ? monOrId : monOrId?.id;
  if (!id) return null;
  const w = worldOf(f);
  if (!w.geoms[id]) {
    const idx = (f.monitors || []).findIndex((m) => m && m.id === id);
    w.geoms[id] = defaultGeom(id, idx >= 0 ? idx : 0);
  }
  return w.geoms[id];
}

export {
  dirInParentAxis,
  isAtMonitorEdge,
  monitorsSiblingAxis,
  neighborMonitor,
  orderedMonitors,
} from "./neighbors.js";
