// @ts-check
/**
 * Composed TreeOps — universal builds of atomics every OpSet needs.
 * Still no OpSet policy (no wrap-vs-cross-mon, no same-type coerce).
 */

import {
  appendChild,
  insertAfter,
  insertBefore,
  removeChild,
  replaceChild,
  replaceChildren,
  setLayout as setLayoutAtomic,
} from "./atomics.mjs";
import { children, fail, ok, parent, walk } from "./kernel.mjs";
import { repairSharesAfterChildChange } from "./sizing.mjs";

/** @typedef {import('./kernel.mjs').Forest} Forest */
/** @typedef {import('./kernel.mjs').Node} Node */
/** @typedef {import('./kernel.mjs').Layout} Layout */
/** @typedef {import('./kernel.mjs').Result} Result */

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {{ force?: boolean }} [opts]
 */
export function equalizeChildren(f, parentNode, opts = {}) {
  const force = !!opts.force;
  const kids = children(f, parentNode);
  if (!kids.length) return ok("equalizeChildren", { id: parentNode.id, n: 0 });
  if (!force && kids.some((k) => k.userSized)) {
    return ok("equalizeChildren", { id: parentNode.id, n: kids.length, skipped: true });
  }
  const n = kids.length;
  for (const ch of kids) {
    ch.percent = 1 / n;
    if (force) ch.userSized = false;
  }
  return ok("equalizeChildren", { id: parentNode.id, n });
}

/**
 * @param {Forest} f
 * @param {Node} a
 * @param {Node} b
 */
export function swapSiblings(f, a, b) {
  const p = parent(f, a);
  if (!p || parent(f, b) !== p) return fail("not siblings");
  const list = children(f, p);
  const i = list.findIndex((n) => n.id === a.id);
  const j = list.findIndex((n) => n.id === b.id);
  if (i < 0 || j < 0) return fail("not siblings");
  const next = [...list];
  next[i] = b;
  next[j] = a;
  replaceChildren(f, p, next);
  return ok("swapSiblings", { a: a.id, b: b.id });
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} child
 * @param {'start'|'end'} to
 */
export function rotateChild(f, parentNode, child, to) {
  if (parentNode.childIds.indexOf(child.id) < 0) return fail("not a child");
  if (parentNode.childIds.length < 2) return fail("cannot rotate");
  removeChild(f, parentNode, child);
  if (to === "start") {
    const first = children(f, parentNode)[0] ?? null;
    insertBefore(f, parentNode, child, first);
  } else {
    appendChild(f, parentNode, child);
  }
  return ok("rotateChild", { id: child.id, to });
}

/**
 * Breakout / promote: `node` becomes a sibling of its parent, inserted
 * `before` or `after` that parent. Unary collapse is a separate settle rule.
 * @param {Forest} f
 * @param {Node} node
 * @param {'before'|'after'} side
 */
export function breakout(f, node, side) {
  const p = parent(f, node);
  if (!p) return fail("no parent");
  if (p.kind === "MONITOR" || p.kind === "WORKSPACE" || p.kind === "ROOT") {
    return fail("no breakout of spine/monitor child");
  }
  const grand = parent(f, p);
  if (!grand) return fail("no grandparent");
  removeChild(f, p, node);
  if (side === "before") insertBefore(f, grand, node, p);
  else insertAfter(f, grand, node, p);
  equalizeChildren(f, p, { force: false });
  equalizeChildren(f, grand, { force: false });
  return ok("breakout", { id: node.id, side });
}

/**
 * Wrap `members` (current children of `host`) in an already-registered CON.
 * @param {Forest} f
 * @param {Node} host
 * @param {Node[]} members
 * @param {Node} wrap
 */
export function wrapNodes(f, host, members, wrap) {
  if (!members.length) return fail("no members");
  const idxs = members.map((m) => host.childIds.indexOf(m.id));
  if (idxs.some((i) => i < 0)) return fail("member not in host");
  const firstIdx = Math.min(...idxs);
  for (const m of members) removeChild(f, host, m);
  for (const m of members) appendChild(f, wrap, m);
  const at = Math.min(firstIdx, host.childIds.length);
  const ref = at < host.childIds.length ? f.nodes[host.childIds[at]] : null;
  insertBefore(f, host, wrap, ref);
  equalizeChildren(f, wrap, { force: true });
  equalizeChildren(f, host, { force: false });
  return ok("wrapNodes", { wrap: wrap.id, n: members.length });
}

/**
 * Dissolve `con`: children take its slot under grandparent. No coerce.
 * @param {Forest} f
 * @param {Node} con
 */
export function promoteChildren(f, con) {
  if (con.kind !== "CON") return fail("not a CON");
  const grand = parent(f, con);
  if (!grand) return fail("no parent");
  const kids = children(f, con);
  const list = [];
  for (const id of grand.childIds) {
    if (id === con.id) list.push(...kids);
    else {
      const n = f.nodes[id];
      if (n) list.push(n);
    }
  }
  replaceChildren(f, grand, list);
  delete f.nodes[con.id];
  equalizeChildren(f, grand, { force: false });
  return ok("promoteChildren", { dissolved: con.id, n: kids.length });
}

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
      if (f.mergeTags?.length) {
        const ti = f.mergeTags.indexOf(con.id);
        if (ti >= 0) f.mergeTags.splice(ti, 1);
      }
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

/**
 * Tiling convenience: set layout, equalize when entering a bag.
 * @param {Node} con
 * @param {Layout} layout
 * @param {Forest} [f]
 */
export function setLayoutTiling(con, layout, f) {
  const r = setLayoutAtomic(con, layout);
  if (!r.ok) return r;
  if (f && (layout === "TABBED" || layout === "STACKED")) {
    equalizeChildren(f, con, { force: true });
  }
  return r;
}

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
