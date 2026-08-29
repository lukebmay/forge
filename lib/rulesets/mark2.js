// @ts-check
/**
 * Mark 2 RuleSet — core settle + same-type coerce + MONITOR max-1.
 */

import { children, makeCon, makeIdFactory, registerTree, walk } from "../tom/kernel.js";
import { wrapNodes } from "../tom/composed.js";
import { collapseUnary, pruneEmptyCons } from "./core.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */
/** @typedef {import('../tom/kernel.js').Layout} Layout */

/**
 * Opposite split vs parent; aspectTieBreak when parent is not H/V.
 * @param {Layout|undefined} parentLayout
 * @param {string} [aspectTieBreak]
 */
export function preferredSplitVsParent(parentLayout, aspectTieBreak = "HSPLIT") {
  if (parentLayout === "HSPLIT") return "VSPLIT";
  if (parentLayout === "VSPLIT") return "HSPLIT";
  return aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
}

/**
 * @param {Layout|undefined} parentLayout
 * @param {Layout} childLayout
 * @param {string} [aspectTieBreak]
 * @param {{ parentKind?: string }} [opts]
 */
export function coerceDifferentType(
  parentLayout,
  childLayout,
  aspectTieBreak = "HSPLIT",
  opts = {}
) {
  if (
    opts.parentKind === "MONITOR" ||
    opts.parentKind === "WORKSPACE" ||
    opts.parentKind === "ROOT"
  ) {
    return childLayout;
  }
  if (!parentLayout || parentLayout !== childLayout) return childLayout;
  if (childLayout === "HSPLIT" || childLayout === "VSPLIT") return "TABBED";
  return preferredSplitVsParent(parentLayout, aspectTieBreak);
}

/** @param {Forest} f @param {Node} root @param {string} [aspectTieBreak] */
export function coerceSameTypeUnder(f, root, aspectTieBreak = "HSPLIT") {
  let n = 0;
  walk(f, root, (node) => {
    if (node.kind !== "CON") return;
    for (const ch of children(f, node)) {
      if (ch.kind !== "CON" || !ch.layout || !node.layout) continue;
      const next = coerceDifferentType(node.layout, ch.layout, aspectTieBreak, {
        parentKind: node.kind,
      });
      if (next !== ch.layout) {
        ch.layout = next;
        n++;
      }
    }
  });
  return n;
}

/**
 * Wrap each n-child MONITOR under `root` once. Empty MONITOR stays empty.
 * @param {Forest} f
 * @param {Node} root
 */
export function wrapMonitorMax1(f, root) {
  /** @type {Node[]} */
  const mons = [];
  walk(f, root, (n) => {
    if (n.kind === "MONITOR" && n.childIds.length > 1) mons.push(n);
  });
  let wrapped = 0;
  for (const mon of mons) {
    if (!f.nodes[mon.id] || mon.childIds.length <= 1) continue;
    const kids = children(f, mon);
    const layout = mon.layout || "HSPLIT";
    const ids = makeIdFactory(1);
    ids.hydrate(f);
    const wrap = makeCon(() => ids.nid(), layout, []);
    f._seq = ids.seq;
    registerTree(f, wrap);
    const r = wrapNodes(f, mon, kids, wrap);
    if (r.ok) wrapped++;
  }
  return wrapped;
}

/**
 * Mark 2 settle: prune empty, collapse unary, coerce same-type, MONITOR max-1.
 * @param {Forest} f
 * @param {Node} root
 * @param {string} [aspectTieBreak]
 */
export function settle(f, root, aspectTieBreak = "HSPLIT") {
  let pruned = 0;
  let collapsed = 0;
  for (let guard = 0; guard < 32; guard++) {
    const p = pruneEmptyCons(f, root);
    const c = collapseUnary(f, root);
    coerceSameTypeUnder(f, root, aspectTieBreak);
    const w = wrapMonitorMax1(f, root);
    pruned += p;
    collapsed += c;
    if (!p && !c && !w) break;
  }
  return { pruned, collapsed };
}

/** @param {Forest} f @param {string} [aspectTieBreak] */
export function settleForest(f, aspectTieBreak = "HSPLIT") {
  let pruned = 0;
  let collapsed = 0;
  for (const mon of f.monitors) {
    const r = settle(f, mon, aspectTieBreak);
    pruned += r.pruned;
    collapsed += r.collapsed;
  }
  return { pruned, collapsed };
}

export const mark2CleanupUnder = settle;
export const mark2CleanupForest = settleForest;
