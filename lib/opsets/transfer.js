// @ts-check
/**
 * Place a leaf onto another MONITOR. Caller runs Mark 2 settle (max-1).
 */

import { ancestorMonitor } from "../tom/queries.js";
import { monitorsSiblingAxis } from "../world/neighbors.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */
/** @typedef {import('../tom/kernel.js').Dir} Dir */
/** @typedef {import('../tom/kernel.js').Layout} Layout */
/** @typedef {import('../tom/api.js').TomApi} TomApi */

/**
 * Detach leaf and place on destination monitor at the near edge for `dir`
 * (arriving from the left → leftmost / start; from the right → end).
 * Respects monitor max-1 child (wrap or enter existing CON).
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} leaf
 * @param {Node} destMon
 * @param {Dir} dir
 * @param {{ join?: boolean, aspectTieBreak?: string }} [opts] — join: enter CON / wrap with window like join-into-sibling-container
 */
export function transferLeafToMonitor(f, api, leaf, destMon, dir, opts = {}) {
  const join = !!opts.join;
  const aspectTieBreak = opts.aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
  const oldParent = api.parent(f, leaf);
  const oldMon = ancestorMonitor(f, leaf);
  if (!oldParent || destMon.kind !== "MONITOR") {
    return { ok: false, reason: "bad transfer" };
  }
  if (oldMon?.id === destMon.id) {
    return { ok: false, reason: "same monitor" };
  }

  const gone = api.removeChild(f, oldParent, leaf);
  if (!gone.ok) return gone;

  // Arrive from left/up → near = start; from right/down → near = end
  const atStart = dir === "right" || dir === "down";

  const kids = api.children(f, destMon);
  if (kids.length === 0) {
    api.appendChild(f, destMon, leaf);
  } else if (kids.length === 1 && kids[0].kind === "CON") {
    const con = kids[0];
    if (atStart) {
      const first = api.children(f, con)[0] ?? null;
      api.insertBefore(f, con, leaf, first);
    } else {
      api.appendChild(f, con, leaf);
    }
  } else if (kids.length === 1 && kids[0].kind === "WINDOW") {
    const other = kids[0];
    let layout = /** @type {Layout} */ (
      monitorsSiblingAxis(f, aspectTieBreak) === "HSPLIT" ? "VSPLIT" : "HSPLIT"
    );
    const wrap = api.makeCon(layout, []);
    api._registerTree(f, wrap);
    api.replaceChild(f, destMon, other, wrap);
    if (atStart) {
      api.appendChild(f, wrap, leaf);
      api.appendChild(f, wrap, other);
    } else {
      api.appendChild(f, wrap, other);
      api.appendChild(f, wrap, leaf);
    }
    wrap.percent = 1;
  } else if (atStart) {
    api.insertBefore(f, destMon, leaf, kids[0]);
  } else {
    api.appendChild(f, destMon, leaf);
  }

  void join; // join vs move currently same placement into mon; enter-CON path above covers join-into-container
  return {
    ok: true,
    op: join ? "transferJoinMonitor" : "transferMoveMonitor",
    from: oldMon?.id,
    to: destMon.id,
  };
}
