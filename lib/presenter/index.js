// @ts-check
/**
 * Slot AABB from TOM shares + world workarea. Not topology.
 */

import { children, parent } from "../tom/kernel.js";
import { ancestorMonitor } from "../tom/queries.js";
import { isBagLayout, SIZE_MIN, splitAxis } from "../tom/sizing.js";
import { geomOf } from "../world/index.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */

const EPS = 1e-6;

/**
 * Pane rect from world workarea + in-axis percents. TAB/STACK fill the slot.
 * @param {Forest} f
 * @param {Node} node
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function paneRect(f, node) {
  const mon = ancestorMonitor(f, node);
  const geom = mon ? geomOf(f, mon) : null;
  if (!mon || !geom) return null;
  /** @type {{ x: number, y: number, w: number, h: number }} */
  let rect = {
    x: geom.x,
    y: geom.y,
    w: geom.width,
    h: geom.height,
  };
  /** @type {Node[]} */
  const chain = [];
  let cur = node;
  while (cur && cur.kind !== "MONITOR") {
    chain.push(cur);
    cur = parent(f, cur);
  }
  chain.reverse();
  let p = mon;
  for (const child of chain) {
    const fill = p.kind === "MONITOR" || isBagLayout(p);
    if (fill) {
      p = child;
      continue;
    }
    const axis = splitAxis(p);
    const kids = children(f, p);
    if (!axis || !kids.length) {
      p = child;
      continue;
    }
    const total = kids.reduce((s, k) => s + (k.percent ?? 0), 0) || 1;
    let acc = 0;
    for (const k of kids) {
      const share = (k.percent ?? 0) / total;
      if (k.id === child.id) {
        if (axis === "x") {
          rect = {
            x: rect.x + acc * rect.w,
            y: rect.y,
            w: share * rect.w,
            h: rect.h,
          };
        } else {
          rect = {
            x: rect.x,
            y: rect.y + acc * rect.h,
            w: rect.w,
            h: share * rect.h,
          };
        }
        break;
      }
      acc += share;
    }
    p = child;
  }
  return rect;
}

/**
 * True if a 50/50 wrap of `slot` along `wrapLayout` would be under 10% of
 * the MONITOR on that wrap's in-axis.
 * @param {Forest} f
 * @param {Node} slot
 * @param {import('../tom/kernel.js').Layout} wrapLayout
 */
export function wrapWouldViolateMin(f, slot, wrapLayout) {
  if (wrapLayout !== "HSPLIT" && wrapLayout !== "VSPLIT") return false;
  const mon = ancestorMonitor(f, slot);
  const geom = mon ? geomOf(f, mon) : null;
  const rect = paneRect(f, slot);
  if (!geom || !rect) return false;
  if (wrapLayout === "HSPLIT") {
    return rect.w / 2 + EPS < SIZE_MIN * geom.width;
  }
  return rect.h / 2 + EPS < SIZE_MIN * geom.height;
}
