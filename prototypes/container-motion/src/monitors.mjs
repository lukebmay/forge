// @ts-check
/**
 * Proto adapter: world neighbor queries + presenter focus helpers.
 */

import { sessionOf } from "./session.mjs";
import {
  dirInParentAxis,
  isAtMonitorEdge as worldIsAtMonitorEdge,
  monitorsSiblingAxis as worldMonitorsSiblingAxis,
  neighborMonitor as worldNeighborMonitor,
  orderedMonitors as worldOrderedMonitors,
} from "../../../lib/world/index.js";

/** @typedef {import('./tom/kernel.mjs').Forest} Forest */
/** @typedef {import('./tom/kernel.mjs').Node} Node */
/** @typedef {import('./tom/kernel.mjs').Dir} Dir */
/** @typedef {import('./tree.mjs').TreeApi} TreeApi */

export { dirInParentAxis };

/** @param {Forest} f @param {string} [aspectTieBreak] */
function tieOf(f, aspectTieBreak) {
  if (aspectTieBreak === "VSPLIT" || aspectTieBreak === "HSPLIT") return aspectTieBreak;
  return sessionOf(f).decisions.aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
}

/**
 * Implicit sibling layout of the monitor row/column from geometry.
 * @param {Forest} f
 * @param {string} [aspectTieBreak]
 * @returns {'HSPLIT'|'VSPLIT'}
 */
export function monitorsSiblingAxis(f, aspectTieBreak) {
  return worldMonitorsSiblingAxis(f, tieOf(f, aspectTieBreak));
}

/**
 * Monitors sorted along the sibling axis (then the other axis as tiebreak).
 * @param {Forest} f
 * @param {string} [aspectTieBreak]
 * @returns {Node[]}
 */
export function orderedMonitors(f, aspectTieBreak) {
  return worldOrderedMonitors(f, tieOf(f, aspectTieBreak));
}

/**
 * Neighbor monitor in `dir`.
 * @param {Forest} f
 * @param {Node} mon
 * @param {Dir} dir
 * @param {string} [aspectTieBreak]
 * @returns {Node|null}
 */
export function neighborMonitor(f, mon, dir, aspectTieBreak) {
  return worldNeighborMonitor(f, mon, dir, tieOf(f, aspectTieBreak));
}

/**
 * True when `node` is at the extreme of its monitor tree in `dir`.
 * @param {Forest} f
 * @param {TreeApi} _api
 * @param {Node} node
 * @param {Dir} dir
 */
export function isAtMonitorEdge(f, _api, node, dir) {
  return worldIsAtMonitorEdge(f, node, dir);
}

/**
 * First leaf on the near edge of a monitor for focus arrival.
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} mon
 * @param {Dir} dir — direction we were moving (arrival side)
 */
export function nearLeafOnMonitor(f, api, mon, dir) {
  const atStart = dir === "right" || dir === "down";
  let cur = mon;
  let guard = 0;
  while (guard++ < 64) {
    const kids = api.children(f, cur);
    if (!kids.length) return cur.kind === "WINDOW" ? cur : null;
    cur = atStart ? kids[0] : kids[kids.length - 1];
    if (cur.kind === "WINDOW") return cur;
  }
  return null;
}
