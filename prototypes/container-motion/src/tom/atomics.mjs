// @ts-check
/**
 * TOM atomics — DOM-like child-list + attribute writes.
 * No wrap/join/move policy. No unary collapse. No same-type coerce.
 */

import {
  fail,
  focusNode,
  get,
  ok,
  parent,
  registerTree,
  selectionNode,
  setFocus,
} from "./kernel.mjs";
import { preferredLeaf } from "./queries.mjs";
import { clearShareOnLeave, repairSharesAfterChildChange } from "./sizing.mjs";

/** @typedef {import('./kernel.mjs').Forest} Forest */
/** @typedef {import('./kernel.mjs').Node} Node */
/** @typedef {import('./kernel.mjs').Layout} Layout */
/** @typedef {import('./kernel.mjs').Result} Result */

/** @param {Forest} f @param {Node} node */
export function detach(f, node) {
  if (!node.parentId) return;
  const p = f.nodes[node.parentId];
  if (p) {
    const i = p.childIds.indexOf(node.id);
    if (i >= 0) p.childIds.splice(i, 1);
  }
  node.parentId = null;
  clearShareOnLeave(node);
  if (p) repairSharesAfterChildChange(f, p);
}

/** @param {Forest} f @param {Node} node */
function ensureInMap(f, node) {
  if (!f.nodes[node.id]) registerTree(f, node);
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} child
 */
export function appendChild(f, parentNode, child) {
  ensureInMap(f, child);
  if (child.parentId === parentNode.id) {
    const i = parentNode.childIds.indexOf(child.id);
    if (i >= 0) parentNode.childIds.splice(i, 1);
  } else {
    detach(f, child);
  }
  parentNode.childIds.push(child.id);
  child.parentId = parentNode.id;
  repairSharesAfterChildChange(f, parentNode);
  return ok("appendChild", { parent: parentNode.id, child: child.id });
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} child
 * @param {Node|null} [refChild]
 */
export function insertBefore(f, parentNode, child, refChild = null) {
  ensureInMap(f, child);
  if (refChild && refChild.parentId !== parentNode.id) {
    return fail("refChild not in parent");
  }
  if (child.parentId === parentNode.id) {
    const i = parentNode.childIds.indexOf(child.id);
    if (i >= 0) parentNode.childIds.splice(i, 1);
  } else {
    detach(f, child);
  }
  if (!refChild) {
    parentNode.childIds.push(child.id);
  } else {
    const i = parentNode.childIds.indexOf(refChild.id);
    parentNode.childIds.splice(i < 0 ? parentNode.childIds.length : i, 0, child.id);
  }
  child.parentId = parentNode.id;
  repairSharesAfterChildChange(f, parentNode);
  return ok("insertBefore", { parent: parentNode.id, child: child.id });
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} child
 * @param {Node|null} [refChild]
 */
export function insertAfter(f, parentNode, child, refChild = null) {
  if (!refChild) return appendChild(f, parentNode, child);
  const kids = parentNode.childIds;
  const i = kids.indexOf(refChild.id);
  const nextId = i >= 0 ? kids[i + 1] : null;
  const next = nextId ? f.nodes[nextId] : null;
  return insertBefore(f, parentNode, child, next);
}

/**
 * Unlink only — node stays in the map.
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} child
 */
export function removeChild(f, parentNode, child) {
  const i = parentNode.childIds.indexOf(child.id);
  if (i < 0) return fail("not a child");
  parentNode.childIds.splice(i, 1);
  if (child.parentId === parentNode.id) child.parentId = null;
  clearShareOnLeave(child);
  repairSharesAfterChildChange(f, parentNode);
  return ok("removeChild", { parent: parentNode.id, child: child.id });
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node[]} nextKids
 */
export function replaceChildren(f, parentNode, nextKids) {
  const keep = new Set(nextKids.map((n) => n.id));
  for (const id of [...parentNode.childIds]) {
    if (keep.has(id)) continue;
    const n = f.nodes[id];
    if (n && n.parentId === parentNode.id) n.parentId = null;
    if (n) clearShareOnLeave(n);
  }
  for (const ch of nextKids) {
    ensureInMap(f, ch);
    if (ch.parentId && ch.parentId !== parentNode.id) detach(f, ch);
  }
  parentNode.childIds = nextKids.map((c) => c.id);
  for (const ch of nextKids) ch.parentId = parentNode.id;
  repairSharesAfterChildChange(f, parentNode);
  return ok("replaceChildren", { parent: parentNode.id, n: nextKids.length });
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} oldNode
 * @param {Node} newNode
 */
export function replaceChild(f, parentNode, oldNode, newNode) {
  const i = parentNode.childIds.indexOf(oldNode.id);
  if (i < 0) return fail("old child missing");
  ensureInMap(f, newNode);
  if (newNode.id !== oldNode.id) detach(f, newNode);
  parentNode.childIds[i] = newNode.id;
  newNode.parentId = parentNode.id;
  if (oldNode.id !== newNode.id && oldNode.parentId === parentNode.id) {
    oldNode.parentId = null;
    clearShareOnLeave(oldNode);
  }
  repairSharesAfterChildChange(f, parentNode);
  return ok("replaceChild", {
    parent: parentNode.id,
    old: oldNode.id,
    next: newNode.id,
  });
}

/**
 * Attribute write only — no percent equalize.
 * @param {Node} con
 * @param {Layout} layout
 */
export function setLayout(con, layout) {
  if (con.kind !== "CON" && con.kind !== "MONITOR") {
    return fail("setLayout on non-container");
  }
  con.layout = layout;
  return ok("setLayout", { id: con.id, mode: layout });
}

/** @param {Node} node @param {number} percent */
export function setPercent(node, percent) {
  node.percent = percent;
  return ok("setPercent", { id: node.id, percent });
}

/** @param {Node} node @param {boolean} userSized */
export function setUserSized(node, userSized) {
  node.userSized = userSized;
  return ok("setUserSized", { id: node.id, userSized });
}

/** @param {Node} con @param {string|null} id */
export function setLastTabFocus(con, id) {
  if (id) con.lastTabFocusId = id;
  else delete con.lastTabFocusId;
  return ok("setLastTabFocus", { id: con.id, lastTabFocusId: id });
}

/**
 * Unlink + drop from map. CON cascades descendants. No unary collapse.
 * @param {Forest} f
 * @param {string} [nodeId]
 */
export function destroyNode(f, nodeId) {
  const cur = nodeId ? get(f, nodeId) : selectionNode(f) || focusNode(f);
  if (!cur) return fail("no selection");
  if (cur.kind === "MONITOR") return fail("cannot delete monitor");
  if (cur.kind === "ROOT" || cur.kind === "WORKSPACE") {
    return fail("cannot delete spine node");
  }

  const p = parent(f, cur);
  if (!p) return fail("no parent");
  const idx = p.childIds.indexOf(cur.id);
  if (idx < 0) return fail("not a child");

  /** @type {string[]} */
  const removed = [];
  const drop = (n) => {
    for (const cid of [...n.childIds]) {
      const ch = f.nodes[cid];
      if (ch) drop(ch);
    }
    removed.push(n.id);
    delete f.nodes[n.id];
  };
  drop(cur);
  p.childIds.splice(idx, 1);
  repairSharesAfterChildChange(f, p);

  f.mergeTags = f.mergeTags.filter((id) => f.nodes[id]);
  if (f.focusId && !f.nodes[f.focusId]) f.focusId = null;
  if (f.selectionId && !f.nodes[f.selectionId]) f.selectionId = null;

  const sib = p.childIds[Math.min(idx, p.childIds.length - 1)];
  if (sib) {
    const leaf = preferredLeaf(f, f.nodes[sib]);
    if (leaf.kind === "WINDOW") setFocus(f, leaf.id);
    else {
      f.focusId = null;
      f.selectionId = leaf.id;
    }
  } else if (p.kind === "MONITOR") {
    f.focusId = null;
    f.selectionId = null;
  } else {
    f.selectionId = p.id;
    const leaf = preferredLeaf(f, p);
    f.focusId = leaf?.kind === "WINDOW" ? leaf.id : null;
  }
  return ok("destroyNode", { id: cur.id, removed: removed.length });
}

/**
 * Seed children on a parent (register + replaceChildren + equal percents).
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node[]} kids
 */
export function setChildren(f, parentNode, kids) {
  for (const ch of kids) registerTree(f, ch);
  replaceChildren(f, parentNode, kids);
  f.nodes[parentNode.id] = parentNode;
  const n = kids.length || 1;
  for (const ch of kids) {
    ch.percent = 1 / n;
    ch.userSized = false;
  }
  return parentNode;
}
