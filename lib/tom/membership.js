// @ts-check
/**
 * FLOATS ↔ TILES membership (D087/D092). One path for float toggle / fail-safe.
 */

import { appendChild, insertAfter, insertBefore } from "./atomics.js";
import { fail, floatsOf, isUnderFloats, isUnderTiles, ok, parent } from "./kernel.js";

/** @typedef {import('./kernel.js').Forest} Forest */
/** @typedef {import('./kernel.js').Node} Node */
/** @typedef {import('./kernel.js').Result} Result */

/**
 * Move WINDOW under FLOATS. Idempotent when already there.
 * @param {Forest} f
 * @param {Node} node
 * @returns {Result}
 */
export function moveWindowToFloats(f, node) {
  if (!node || node.kind !== "WINDOW") return fail("not a WINDOW");
  const bag = floatsOf(f);
  if (!bag) return fail("no FLOATS");
  if (node.parentId === bag.id) return ok("moveWindowToFloats", { id: node.id, noop: true });
  return appendChild(f, bag, node);
}

/**
 * Move WINDOW under a TILES parent (MONITOR/CON). Refuses FLOATS/META parents.
 * @param {Forest} f
 * @param {Node} node
 * @param {Node} tilesParent
 * @param {{ before?: Node|null, after?: Node|null }} [opts]
 * @returns {Result}
 */
export function moveWindowToTiles(f, node, tilesParent, opts = {}) {
  if (!node || node.kind !== "WINDOW") return fail("not a WINDOW");
  if (!tilesParent) return fail("no TILES parent");
  if (tilesParent.kind === "FLOATS" || tilesParent.kind === "META") {
    return fail("parent not in TILES");
  }
  if (!isUnderTiles(f, tilesParent) && tilesParent.kind !== "ROOT") {
    return fail("parent not in TILES");
  }
  if (opts.before) return insertBefore(f, tilesParent, node, opts.before);
  if (opts.after) return insertAfter(f, tilesParent, node, opts.after);
  if (node.parentId === tilesParent.id) {
    return ok("moveWindowToTiles", { id: node.id, parent: tilesParent.id, noop: true });
  }
  return appendChild(f, tilesParent, node);
}

/**
 * WINDOW floats iff parent is FLOATS.
 * @param {Forest} f
 * @param {Node} node
 */
export function windowIsFloating(f, node) {
  return !!(node && node.kind === "WINDOW" && isUnderFloats(f, node));
}

/**
 * @param {Forest} f
 * @param {Node} node
 * @returns {Node|null} prior parent before a FLOATS move (for settle)
 */
export function tilesParentBeforeFloat(f, node) {
  if (!node || isUnderFloats(f, node)) return null;
  const p = parent(f, node);
  return p && isUnderTiles(f, p) ? p : null;
}
