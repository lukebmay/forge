// @ts-check
/**
 * In-axis size on HSPLIT/VSPLIT children: percent or share (D090).
 * userSized false = share (leftover splits equally). Cross-axis is the
 * parent's in-axis size in its split.
 */

import { children, fail, ok, parent, selectionNode } from "./kernel.js";

/** @typedef {import('./kernel.js').Forest} Forest */
/** @typedef {import('./kernel.js').Node} Node */
/** @typedef {'x'|'y'} SizeAxis */

export const SIZE_MIN = 0.1;
export const SIZE_MAX = 1;
export const SIZE_STEP = 0.05;
export const SIZE_PRESETS = {
  7: 0.75,
  8: 2 / 3,
  9: 0.5,
  0: 1 / 3,
};

const EPS = 1e-6;

/** @param {Node} p */
export function splitAxis(p) {
  if (p.layout === "VSPLIT") return "y";
  if (p.layout === "HSPLIT") return "x";
  return null;
}

/** @param {Node|null|undefined} n */
export function isBagLayout(n) {
  return n?.layout === "TABBED" || n?.layout === "STACKED";
}

/**
 * Node whose in-axis share is this start node's share in the nearest H/V split.
 * TAB/STACK are skipped (peers share one pane).
 * @param {Forest} f
 * @param {Node} start
 */
export function containingSplit(f, start) {
  let n = start;
  while (n) {
    const p = parent(f, n);
    if (!p || p.kind === "ROOT" || p.kind === "WORKSPACE") return null;
    if (isBagLayout(p)) {
      n = p;
      continue;
    }
    // MONITOR HSPLIT/VSPLIT is a real size parent (layout mon-direct kids).
    if (p.layout === "HSPLIT" || p.layout === "VSPLIT") {
      return { target: n, parent: p, axis: splitAxis(p) };
    }
    if (p.kind === "MONITOR") return null;
    n = p;
  }
  return null;
}

/**
 * Ancestor whose share controls `start`'s cross-axis size.
 * @param {Forest} f
 * @param {Node} start
 */
export function crossAxisSplit(f, start) {
  const inAx = containingSplit(f, start);
  if (!inAx?.axis) return null;
  const other = /** @type {SizeAxis} */ (inAx.axis === "x" ? "y" : "x");
  return splitForAxis(f, start, other);
}

/** True if adding one share child would put a share child below 10%. */
export function extraShareWouldViolate(f, parentNode) {
  if (parentNode.layout !== "HSPLIT" && parentNode.layout !== "VSPLIT") {
    return false;
  }
  const kids = children(f, parentNode);
  const sized = kids.filter((k) => k.userSized);
  const sharing = kids.filter((k) => !k.userSized);
  let used = 0;
  for (const k of sized) used += k.percent ?? 0;
  const remain = 1 - used;
  const nShare = sharing.length + 1;
  if (nShare <= 0) return true;
  return remain / nShare + EPS < SIZE_MIN;
}

/**
 * Climb until the parent split's in-axis matches `axis`.
 * @param {Forest} f
 * @param {Node} start
 * @param {SizeAxis} axis
 */
export function splitForAxis(f, start, axis) {
  let n = start;
  while (n) {
    const p = parent(f, n);
    if (!p || p.kind === "ROOT" || p.kind === "WORKSPACE") return null;
    if (isBagLayout(p)) {
      n = p;
      continue;
    }
    const pAxis = splitAxis(p);
    if (pAxis === axis) return { target: n, parent: p, axis };
    if (p.kind === "MONITOR") return null;
    n = p;
  }
  return null;
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {{ rescaleIfNoShare?: boolean }} [opts]
 */
export function redistributeShare(f, parentNode, opts = {}) {
  const kids = children(f, parentNode);
  if (!kids.length) return fail("no children");
  const sized = kids.filter((k) => k.userSized);
  const sharing = kids.filter((k) => !k.userSized);
  let used = 0;
  for (const k of sized) used += k.percent ?? 0;
  if (used > SIZE_MAX + EPS) return fail("percent children exceed 100%");
  const remain = 1 - used;
  if (!sharing.length) {
    if (opts.rescaleIfNoShare) return rescaleSizedToFill(f, parentNode);
    if (Math.abs(remain) > EPS) return fail("leftover with no share children");
    return ok("redistributeShare", { id: parentNode.id, n: 0 });
  }
  const share = remain / sharing.length;
  if (share + EPS < SIZE_MIN) return fail("share child below 10%");
  for (const k of sharing) k.percent = share;
  return ok("redistributeShare", { id: parentNode.id, n: sharing.length, share });
}

/** @param {Forest} f @param {Node} parentNode */
function rescaleSizedToFill(f, parentNode) {
  const kids = children(f, parentNode);
  const sized = kids.filter((k) => k.userSized);
  if (!sized.length) {
    const n = kids.length || 1;
    for (const k of kids) k.percent = 1 / n;
    return ok("rescaleSizedToFill", { id: parentNode.id, n, equal: true });
  }
  let used = 0;
  for (const k of sized) used += k.percent ?? 0;
  if (used < EPS) {
    const share = 1 / sized.length;
    for (const k of sized) k.percent = share;
    return ok("rescaleSizedToFill", { id: parentNode.id, n: sized.length, equal: true });
  }
  const scale = 1 / used;
  for (const k of sized) k.percent = (k.percent ?? 0) * scale;
  return ok("rescaleSizedToFill", { id: parentNode.id, n: sized.length, scale });
}

/**
 * After a child is added or removed from an H/V split: leftover to share
 * children, or rescale percent kids so they fill 100%.
 * @param {Forest} f
 * @param {Node} parentNode
 */
export function repairSharesAfterChildChange(f, parentNode) {
  if (!parentNode) return ok("repairSharesAfterChildChange");
  const isMonSplit =
    parentNode.kind === "MONITOR" &&
    (parentNode.layout === "HSPLIT" || parentNode.layout === "VSPLIT");
  if (parentNode.kind !== "CON" && !isMonSplit) {
    return ok("repairSharesAfterChildChange", { skipped: true });
  }
  if (
    parentNode.kind === "CON" &&
    parentNode.layout !== "HSPLIT" &&
    parentNode.layout !== "VSPLIT"
  ) {
    return ok("repairSharesAfterChildChange", { skipped: true });
  }
  const r = redistributeShare(f, parentNode, { rescaleIfNoShare: true });
  if (!r.ok) return ok("repairSharesAfterChildChange", { skipped: r.reason });
  return r;
}

/** @param {Node} node */
export function clearShareOnLeave(node) {
  node.userSized = false;
}

/**
 * @param {Forest} f
 * @param {Node} parentNode
 * @param {Node} target
 * @param {number} share
 */
export function setChildShare(f, parentNode, target, share) {
  if (share + EPS < SIZE_MIN || share - EPS > SIZE_MAX) {
    return fail("share outside 10%–100%");
  }
  const kids = children(f, parentNode);
  if (!kids.some((k) => k.id === target.id)) return fail("not a child");
  const snap = kids.map((k) => ({
    id: k.id,
    percent: k.percent,
    userSized: k.userSized,
  }));
  target.percent = share;
  target.userSized = true;
  const r = redistributeShare(f, parentNode);
  if (!r.ok) {
    for (const s of snap) {
      const k = f.nodes[s.id];
      if (!k) continue;
      k.percent = s.percent;
      k.userSized = s.userSized;
    }
    return r;
  }
  return ok("setChildShare", { id: target.id, share });
}

/**
 * @param {Forest} f
 * @param {Node} [node]
 * @param {number} share
 */
export function setInAxisShare(f, node, share) {
  const start = node || selectionNode(f);
  if (!start || start.kind === "ROOT" || start.kind === "WORKSPACE") {
    return fail("bad selection");
  }
  const found = containingSplit(f, start);
  if (!found) return fail("no H/V parent");
  return setChildShare(f, found.parent, found.target, share);
}

/**
 * @param {Forest} f
 * @param {SizeAxis} axis
 * @param {number} step
 * @param {Node} [node]
 */
export function nudgeSize(f, axis, step, node) {
  const start = node || selectionNode(f);
  if (!start || start.kind === "ROOT" || start.kind === "WORKSPACE") {
    return fail("bad selection");
  }
  const found = splitForAxis(f, start, axis);
  if (!found) return fail("no split on that axis");
  const cur = found.target.percent ?? 0;
  return setChildShare(f, found.parent, found.target, cur + step);
}

/**
 * Float in-axis and/or cross-axis ("parent") shares.
 * Parent = ancestor whose size controls this node's cross-axis.
 *
 * @param {Forest} f
 * @param {{
 *   self?: boolean,
 *   siblings?: boolean,
 *   parent?: boolean,
 *   parentSiblings?: boolean,
 * }} spec
 * @param {Node} [node]
 */
export function shareCombo(f, spec, node) {
  const start = node || selectionNode(f);
  if (!start || start.kind === "ROOT" || start.kind === "WORKSPACE") {
    return fail("bad selection");
  }
  const wantSelf = !!spec.self;
  const wantSib = !!spec.siblings;
  const wantParent = !!spec.parent;
  const wantParentSib = !!spec.parentSiblings;
  if (!wantSelf && !wantSib && !wantParent && !wantParentSib) {
    return fail("empty share combo");
  }

  const inAx = wantSelf || wantSib ? containingSplit(f, start) : null;
  const cross = wantParent || wantParentSib ? crossAxisSplit(f, start) : null;

  if ((wantSelf || wantSib) && !inAx) return fail("no H/V parent");
  if ((wantParent || wantParentSib) && !cross && !inAx) {
    return fail("no cross-axis parent");
  }
  if ((wantParent || wantParentSib) && !cross && !wantSelf && !wantSib) {
    return fail("no cross-axis parent");
  }

  /** @type {{ parentId: string, kids: { id: string, percent: number|undefined, userSized: boolean|undefined }[] }[]} */
  const snaps = [];
  const snap = (parentNode) => {
    if (!parentNode || snaps.some((s) => s.parentId === parentNode.id)) return;
    snaps.push({
      parentId: parentNode.id,
      kids: children(f, parentNode).map((k) => ({
        id: k.id,
        percent: k.percent,
        userSized: k.userSized,
      })),
    });
  };
  const restore = () => {
    for (const s of snaps) {
      for (const row of s.kids) {
        const k = f.nodes[row.id];
        if (!k) continue;
        k.percent = row.percent;
        k.userSized = row.userSized;
      }
    }
  };

  if (inAx) snap(inAx.parent);
  if (cross) snap(cross.parent);

  if (inAx) {
    for (const k of children(f, inAx.parent)) {
      const isSelf = k.id === inAx.target.id;
      if (isSelf && wantSelf) k.userSized = false;
      if (!isSelf && wantSib) k.userSized = false;
    }
    const r = redistributeShare(f, inAx.parent);
    if (!r.ok) {
      restore();
      return r;
    }
  }

  if (cross && (wantParent || wantParentSib)) {
    for (const k of children(f, cross.parent)) {
      const isP = k.id === cross.target.id;
      if (isP && wantParent) k.userSized = false;
      if (!isP && wantParentSib) k.userSized = false;
    }
    const r = redistributeShare(f, cross.parent);
    if (!r.ok) {
      restore();
      return r;
    }
  }

  return ok("shareCombo", {
    self: wantSelf,
    siblings: wantSib,
    parent: wantParent && !!cross,
    parentSiblings: wantParentSib && !!cross,
  });
}

/**
 * @param {Forest} f
 * @param {Node} [node]
 */
export function shareSize(f, node) {
  return shareCombo(f, { self: true }, node);
}

/**
 * @param {Forest} f
 * @param {Node} [node]
 */
export function shareSiblingSizes(f, node) {
  return shareCombo(f, { self: true, siblings: true }, node);
}

/**
 * Clear userSized on every node and equalize each H/V split.
 * @param {Forest} f
 */
export function shareAllSizes(f) {
  /** @type {Node[]} */
  const splits = [];
  for (const n of Object.values(f.nodes)) {
    if (!n) continue;
    n.userSized = false;
    if (n.kind === "CON" && (n.layout === "HSPLIT" || n.layout === "VSPLIT")) {
      splits.push(n);
    }
  }
  for (const p of splits) {
    const kids = children(f, p);
    const n = kids.length || 1;
    for (const k of kids) k.percent = 1 / n;
  }
  return ok("shareAllSizes", { splits: splits.length });
}
