// @ts-check
/**
 * Composed TreeOps — universal builds of atomics every OpSet needs.
 * Settle is RuleSet (`lib/rulesets/`). No OpSet policy here.
 */

import {
  appendChild,
  insertAfter,
  insertBefore,
  removeChild,
  replaceChild,
  replaceChildren,
  setLayout as setLayoutAtomic,
} from "./atomics.js";
import { children, fail, ok, makeCon, makeWindow, parent, registerTree } from "./kernel.js";
import { nanoid } from "./nanoid.js";

/** @typedef {import('./kernel.js').Forest} Forest */
/** @typedef {import('./kernel.js').Node} Node */
/** @typedef {import('./kernel.js').Layout} Layout */
/** @typedef {import('./kernel.js').Result} Result */

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
  if (
    p.kind === "MONITOR" ||
    p.kind === "WORKSPACE" ||
    p.kind === "ROOT" ||
    p.kind === "FLOATS" ||
    p.kind === "META"
  ) {
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
 * Promote a 1-child H/V CON in place (copy percent/userSized). Leaves
 * TABBED/STACKED and multi-child splits alone.
 * @param {Forest} f
 * @param {Node} node
 * @returns {Node}
 */
export function unwrapUnarySplit(f, node) {
  let cur = node;
  for (let guard = 0; guard < 8 && cur; guard++) {
    if (cur.kind !== "CON") break;
    if (cur.layout !== "HSPLIT" && cur.layout !== "VSPLIT") break;
    if (cur.childIds.length !== 1) break;
    const child = f.nodes[cur.childIds[0]];
    const p = parent(f, cur);
    if (!child || !p) break;
    const share = cur.percent;
    const sized = !!cur.userSized;
    replaceChild(f, p, cur, child);
    child.percent = share;
    child.userSized = sized;
    delete f.nodes[cur.id];
    if (f.selectionId === cur.id) f.selectionId = child.id;
    cur = child;
  }
  return cur;
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

/**
 * Invent an empty CON under a CON/MONITOR parent.
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Layout} layout
 * @returns {Result & { con?: Node }}
 */
export function inventConUnder(f, parentNode, layout) {
  if (!parentNode || (parentNode.kind !== "CON" && parentNode.kind !== "MONITOR")) {
    return fail("inventConUnder parent");
  }
  const con = makeCon(nanoid, layout);
  registerTree(f, con);
  appendChild(f, parentNode, con);
  return ok("inventConUnder", { id: con.id, parent: parentNode.id, con });
}

/**
 * Invent a WINDOW under a CON/MONITOR parent (placeholder / open insert).
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {string} [label]
 * @param {string} [wmClass]
 * @returns {Result & { win?: Node }}
 */
export function inventWindowUnder(f, parentNode, label = "win", wmClass = "app") {
  if (!parentNode || (parentNode.kind !== "CON" && parentNode.kind !== "MONITOR")) {
    return fail("inventWindowUnder parent");
  }
  const win = makeWindow(nanoid, label, wmClass);
  registerTree(f, win);
  appendChild(f, parentNode, win);
  return ok("inventWindowUnder", { id: win.id, parent: parentNode.id, win });
}
