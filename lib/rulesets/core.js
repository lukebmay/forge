// @ts-check
/**
 * Core RuleSet — prune empty CONs, unary collapse. No same-type coerce.
 */

import { removeChild, replaceChild } from "../tom/atomics.js";
import { equalizeChildren } from "../tom/composed.js";
import { parent, walk } from "../tom/kernel.js";
import { repairSharesAfterChildChange } from "../tom/sizing.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */

/**
 * @param {Forest} f
 * @param {Node} root
 */
export function pruneEmptyCons(f, root) {
  let pruned = 0;
  let guard = 0;
  while (guard++ < 64) {
    /** @type {Node[]} */
    const empties = [];
    walk(f, root, (n) => {
      if (n.kind === "CON" && n.childIds.length === 0) empties.push(n);
    });
    if (!empties.length) break;
    empties.sort((a, b) => depthOf(f, b) - depthOf(f, a));
    for (const con of empties) {
      if (!f.nodes[con.id] || con.childIds.length !== 0) continue;
      const p = parent(f, con);
      if (!p) continue;
      removeChild(f, p, con);
      delete f.nodes[con.id];
      if (f.selectionId === con.id) f.selectionId = p.id;
      equalizeChildren(f, p, { force: false });
      pruned++;
    }
  }
  return pruned;
}

/**
 * Unary collapse: if a CON has exactly one child, that child takes the CON's
 * place in the parent, and the CON is deleted. MONITOR / WORKSPACE / ROOT
 * never collapse this way.
 * @param {Forest} f
 * @param {Node} root
 */
export function collapseUnary(f, root) {
  let collapsed = 0;
  let guard = 0;
  while (guard++ < 64) {
    /** @type {Node[]} */
    const ones = [];
    walk(f, root, (n) => {
      if (n.kind === "CON" && n.childIds.length === 1) ones.push(n);
    });
    if (!ones.length) break;
    for (const con of ones) {
      const child = f.nodes[con.childIds[0]];
      const p = parent(f, con);
      if (!child || !p) continue;
      const share = con.percent;
      const sized = !!con.userSized;
      replaceChild(f, p, con, child);
      child.percent = share;
      child.userSized = sized;
      repairSharesAfterChildChange(f, p);
      delete f.nodes[con.id];
      if (f.selectionId === con.id) f.selectionId = child.id;
      collapsed++;
    }
  }
  return collapsed;
}

/**
 * Generic structural cleanup: prune empty, collapse unary. No coerce.
 * @param {Forest} f
 * @param {Node} root
 */
export function cleanupStructure(f, root) {
  let pruned = 0;
  let collapsed = 0;
  for (let guard = 0; guard < 32; guard++) {
    const p = pruneEmptyCons(f, root);
    const c = collapseUnary(f, root);
    pruned += p;
    collapsed += c;
    if (!p && !c) break;
  }
  return { pruned, collapsed };
}

export const settle = cleanupStructure;

/** @param {Forest} f @param {Node} n */
function depthOf(f, n) {
  let d = 0;
  let cur = n;
  while (cur?.parentId) {
    d++;
    cur = f.nodes[cur.parentId];
  }
  return d;
}
