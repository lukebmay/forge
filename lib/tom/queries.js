// @ts-check
/**
 * TOM topology queries — axis, neighbors in a parent, preferred leaf.
 * No tiling policy. Geometry is the world bag, not Node.geom.
 */

import { children, parent } from "./kernel.js";

/** @typedef {import('./kernel.js').Forest} Forest */
/** @typedef {import('./kernel.js').Node} Node */
/** @typedef {import('./kernel.js').Dir} Dir */
/** @typedef {import('./kernel.js').Layout} Layout */

/** @param {Node} p */
export function parentAxis(p) {
  if (p.layout === "VSPLIT" || p.layout === "STACKED") return "v";
  return "h";
}

/**
 * Structural in-axis (not focus M4). TAB/STACK strip is L/R; U/D is cross.
 * @param {Node} parentNode
 * @param {Dir} dir
 */
export function isInAxis(parentNode, dir) {
  if (parentNode.layout === "TABBED" || parentNode.layout === "STACKED") {
    return dir === "left" || dir === "right";
  }
  if (parentNode.layout === "HSPLIT" || parentNode.kind === "MONITOR") {
    return dir === "left" || dir === "right";
  }
  if (parentNode.layout === "VSPLIT") {
    return dir === "up" || dir === "down";
  }
  return dir === "left" || dir === "right";
}

/** @param {Dir} dir */
export function dirDelta(dir) {
  if (dir === "left" || dir === "up") return -1;
  return 1;
}

/** @param {Dir} dir @returns {'before'|'after'} */
export function dirSide(dir) {
  return dirDelta(dir) < 0 ? "before" : "after";
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} cur
 * @param {Dir} dir
 * @returns {Node|null}
 */
export function siblingInDir(f, parentNode, cur, dir) {
  const idx = parentNode.childIds.indexOf(cur.id);
  if (idx < 0) return null;
  const j = idx + dirDelta(dir);
  if (j < 0 || j >= parentNode.childIds.length) return null;
  return f.nodes[parentNode.childIds[j]] ?? null;
}

/** @param {Forest} f @param {Node} n */
export function ancestorMonitor(f, n) {
  let cur = n;
  while (cur && cur.kind !== "MONITOR") {
    cur = cur.parentId ? f.nodes[cur.parentId] : null;
  }
  return cur?.kind === "MONITOR" ? cur : null;
}

/**
 * @param {Forest} f
 * @param {Node} n
 * @returns {Node}
 */
export function preferredLeaf(f, n) {
  if (n.kind === "WINDOW") return n;
  if (n.kind === "CON" && (n.layout === "TABBED" || n.layout === "STACKED")) {
    if (n.lastTabFocusId && f.nodes[n.lastTabFocusId]) {
      return preferredLeaf(f, f.nodes[n.lastTabFocusId]);
    }
  }
  const kids = children(f, n);
  if (!kids.length) return n;
  return preferredLeaf(f, kids[0]);
}

/** @param {Forest} f @param {Node} root */
export function rightmostLeaf(f, root) {
  let cur = root;
  let guard = 0;
  while (guard++ < 64) {
    const kids = children(f, cur);
    if (!kids.length) return cur.kind === "MONITOR" ? null : cur;
    cur = kids[kids.length - 1];
  }
  return cur;
}

/** @param {Forest} f @param {Node} n */
export function findConTarget(f, n) {
  if (n.kind === "CON") return n;
  const p = parent(f, n);
  return p && p.kind === "CON" ? p : null;
}
