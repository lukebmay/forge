// @ts-check
/**
 * Cross-monitor neighbor / edge queries. Tie-break is a string (D082).
 */

import { parent } from "../tom/kernel.js";
import { geomOf } from "./index.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */
/** @typedef {import('../tom/kernel.js').Dir} Dir */

/** MONITOR peers of `mon` on the same WORKSPACE (not other ws clones of this output). */
function monitorsOnWorkspace(f, mon) {
  const ws = parent(f, mon);
  if (!ws || ws.kind !== "WORKSPACE") return f.monitors;
  return f.monitors.filter((m) => parent(f, m)?.id === ws.id);
}

/**
 * Implicit sibling layout of the monitor row/column from geometry.
 * Side-by-side (larger horizontal spread of centers) → HSPLIT;
 * stacked (larger vertical spread) → VSPLIT; tie → aspectTieBreak / HSPLIT.
 * @param {Forest} f
 * @param {string} [aspectTieBreak]
 * @returns {'HSPLIT'|'VSPLIT'}
 */
export function monitorsSiblingAxis(f, aspectTieBreak = "HSPLIT") {
  const mons = f.monitors.filter((m) => geomOf(f, m));
  if (mons.length < 2) {
    return aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of mons) {
    const g = geomOf(f, m);
    if (!g) continue;
    const cx = g.x + g.width / 2;
    const cy = g.y + g.height / 2;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  if (dx > dy) return "HSPLIT";
  if (dy > dx) return "VSPLIT";
  return aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
}

/**
 * Monitors sorted along the sibling axis (then the other axis as tiebreak).
 * @param {Forest} f
 * @param {string} [aspectTieBreak]
 * @returns {Node[]}
 */
export function orderedMonitors(f, aspectTieBreak = "HSPLIT", fromMon = null) {
  const axis = monitorsSiblingAxis(f, aspectTieBreak);
  const mons = fromMon ? [...monitorsOnWorkspace(f, fromMon)] : [...f.monitors];
  mons.sort((a, b) => {
    const ga = geomOf(f, a) || { x: 0, y: 0, width: 0, height: 0 };
    const gb = geomOf(f, b) || { x: 0, y: 0, width: 0, height: 0 };
    const cax = ga.x + ga.width / 2;
    const cay = ga.y + ga.height / 2;
    const cbx = gb.x + gb.width / 2;
    const cby = gb.y + gb.height / 2;
    if (axis === "HSPLIT") return cax - cbx || cay - cby;
    return cay - cby || cax - cbx;
  });
  return mons;
}

/**
 * Neighbor monitor in `dir` when that dir is in-axis for the sibling layout
 * (or always try geometric neighbor for that dir).
 * @param {Forest} f
 * @param {Node} mon
 * @param {Dir} dir
 * @param {string} [aspectTieBreak]
 * @returns {Node|null}
 */
export function neighborMonitor(f, mon, dir, aspectTieBreak = "HSPLIT") {
  const axis = monitorsSiblingAxis(f, aspectTieBreak);
  const inAxis =
    (axis === "HSPLIT" && (dir === "left" || dir === "right")) ||
    (axis === "VSPLIT" && (dir === "up" || dir === "down"));
  if (!inAxis) {
    return geometricNeighborMonitor(f, mon, dir);
  }
  const ordered = orderedMonitors(f, aspectTieBreak, mon);
  const i = ordered.findIndex((m) => m.id === mon.id);
  if (i < 0) return null;
  const delta = dir === "left" || dir === "up" ? -1 : 1;
  return ordered[i + delta] ?? null;
}

/**
 * @param {Forest} f
 * @param {Node} mon
 * @param {Dir} dir
 * @returns {Node|null}
 */
function geometricNeighborMonitor(f, mon, dir) {
  const g = geomOf(f, mon);
  if (!g) return null;
  const cx = g.x + g.width / 2;
  const cy = g.y + g.height / 2;
  /** @type {Node|null} */
  let best = null;
  let bestDist = Infinity;
  for (const o of monitorsOnWorkspace(f, mon)) {
    if (o.id === mon.id) continue;
    const og = geomOf(f, o);
    if (!og) continue;
    const ocx = og.x + og.width / 2;
    const ocy = og.y + og.height / 2;
    let ok = false;
    let dist = Infinity;
    if (dir === "left" && ocx < cx) {
      ok = rangesOverlap(g.y, g.y + g.height, og.y, og.y + og.height);
      dist = cx - ocx;
    } else if (dir === "right" && ocx > cx) {
      ok = rangesOverlap(g.y, g.y + g.height, og.y, og.y + og.height);
      dist = ocx - cx;
    } else if (dir === "up" && ocy < cy) {
      ok = rangesOverlap(g.x, g.x + g.width, og.x, og.x + og.width);
      dist = cy - ocy;
    } else if (dir === "down" && ocy > cy) {
      ok = rangesOverlap(g.x, g.x + g.width, og.x, og.x + og.width);
      dist = ocy - cy;
    }
    if (ok && dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }
  return best;
}

/** @param {number} a0 @param {number} a1 @param {number} b0 @param {number} b1 */
function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/**
 * Whether `dir` is in-axis for this parent's layout (MONITOR chrome = H row).
 * @param {Node} parentNode
 * @param {Dir} dir
 */
export function dirInParentAxis(parentNode, dir) {
  if (parentNode.layout === "TABBED" || parentNode.layout === "STACKED") {
    return dir === "left" || dir === "right";
  }
  if (parentNode.layout === "VSPLIT") {
    return dir === "up" || dir === "down";
  }
  return dir === "left" || dir === "right";
}

/**
 * True when `node` is at the extreme of its monitor tree in `dir`
 * (every ancestor step is first/last child **in-axis** that way).
 * Cross-axis steps do not count as reaching the monitor edge.
 * @param {Forest} f
 * @param {Node} node
 * @param {Dir} dir
 */
export function isAtMonitorEdge(f, node, dir) {
  let cur = node;
  const delta = dir === "left" || dir === "up" ? -1 : 1;
  while (cur && cur.kind !== "MONITOR") {
    const p = parent(f, cur);
    if (!p) return false;
    if (!dirInParentAxis(p, dir)) return false;
    const idx = p.childIds.indexOf(cur.id);
    if (idx < 0) return false;
    if (delta < 0 && idx !== 0) return false;
    if (delta > 0 && idx !== p.childIds.length - 1) return false;
    cur = p;
  }
  return cur?.kind === "MONITOR";
}
