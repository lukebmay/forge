// @ts-check
/**
 * Mark 2 OpSet — directional Move/Join + structural rules on the TOM.
 */

import { paneRect, wrapWouldViolateMin } from "../presenter/index.js";
import {
  coerceDifferentType as rulesetCoerce,
  coerceSameTypeUnder as rulesetCoerceSame,
  mark2CleanupForest as rulesetCleanupForest,
  mark2CleanupUnder as rulesetCleanupUnder,
  preferredSplitVsParent as splitVsParent,
  settleForest,
} from "../rulesets/mark2.js";
import { sessionOf } from "../session/index.js";
import {
  ancestorMonitor,
  appendChild,
  breakout as breakoutTreeOp,
  children,
  dirDelta,
  dirSide,
  equalizeChildren,
  extraShareWouldViolate,
  fail,
  findConTarget,
  focusNode,
  insertAfter,
  insertBefore,
  isBagLayout,
  isInAxis,
  isUnder,
  isUnderFloats,
  markOpenLeaf,
  ok,
  parent,
  redistributeShare,
  replaceChildren,
  rightmostLeaf,
  rotateChild,
  selectionNode,
  setFocus,
  siblingInDir,
  swapSiblings,
  setLayout,
  setLastTabFocus,
  walk,
} from "../tom/index.js";
import { isAtMonitorEdge, neighborMonitor, monitorsSiblingAxis } from "../world/neighbors.js";
import { transferLeafToMonitor } from "./transfer.js";
import { MARK2_POINTER } from "./mark2-pointer.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Layout} Layout */
/** @typedef {import('../tom/kernel.js').Node} Node */
/** @typedef {import('../tom/api.js').TomApi} TomApi */
/** @typedef {import('../tom/kernel.js').Dir} Dir */

/**
 * @typedef {{ onto?: string, insertIndex?: number, place?: "end" }} Mark2PointerArgs
 */

export const LAYOUT_CYCLE = /** @type {const} */ (["HSPLIT", "VSPLIT", "TABBED", "STACKED"]);

/**
 * @param {Forest} f
 * @returns {import('../session/index.js').Decisions}
 */
export function ensureMark2Decisions(f) {
  const s = sessionOf(f);
  const d = s.decisions || {};
  let edgeMove = d.edgeMove ?? "wrap";
  if (edgeMove === "noop" && d.policyEnabled !== false && !d._edgeNoopMigrated) {
    edgeMove = "wrap";
  }
  s.decisions = {
    peelModel: d.peelModel ?? "B",
    edgeMove,
    aspectTieBreak: d.aspectTieBreak ?? "HSPLIT",
    defaultJoinContainer: d.defaultJoinContainer ?? "SPLIT",
    policyEnabled: d.policyEnabled ?? true,
    opsetId: "mark2",
    _edgeNoopMigrated: true,
  };
  return s.decisions;
}

/** @param {Forest} f */
function tieOf(f) {
  return ensureMark2Decisions(f).aspectTieBreak || "HSPLIT";
}

/** @param {Layout|undefined} parentLayout @param {Forest} f */
export function preferredSplitVsParent(parentLayout, f) {
  return splitVsParent(parentLayout, tieOf(f));
}

/**
 * @param {Layout|undefined} parentLayout
 * @param {Layout} childLayout
 * @param {Forest} f
 * @param {{ parentKind?: string }} [opts]
 */
export function coerceDifferentType(parentLayout, childLayout, f, opts = {}) {
  return rulesetCoerce(parentLayout, childLayout, tieOf(f), opts);
}

/** @param {Forest} f @param {import('../tom/kernel.js').Node} root */
export function coerceSameTypeUnder(f, root) {
  return rulesetCoerceSame(f, root, tieOf(f));
}

/** @param {Forest} f @param {import('../tom/kernel.js').Node} root */
export function mark2CleanupUnder(f, root) {
  return rulesetCleanupUnder(f, root, tieOf(f));
}

/** @param {Forest} f */
export function mark2CleanupForest(f) {
  return rulesetCleanupForest(f, tieOf(f));
}

/** @param {Layout|undefined} parentLayout @param {Forest} f */
export function preferredJoinLayout(parentLayout, f) {
  const d = ensureMark2Decisions(f);
  if (d.defaultJoinContainer === "TAB") return "TABBED";
  return preferredSplitVsParent(parentLayout, f);
}

/**
 * @param {Node} parentCon parent container that will contain the wrap
 * @param {Node[]} kids
 * @param {Forest} f
 * @param {{ inventVsLayout?: Layout }} [opts]
 */
export function layoutForJoinWrap(parentCon, kids, f, opts = {}) {
  const vs = opts.inventVsLayout ?? parentCon.layout;
  let layout = preferredJoinLayout(vs, f);
  for (const ch of kids) {
    if (ch.kind === "CON" && ch.layout === layout) {
      layout = "TABBED";
      break;
    }
  }
  layout = coerceDifferentType(parentCon.layout, layout, f, {
    parentKind: parentCon.kind,
  });
  if (layout === "TABBED" || layout === "STACKED") {
    for (const ch of kids) {
      if (ch.kind === "CON" && ch.layout === layout) {
        layout = preferredSplitVsParent(vs, f);
        layout = coerceDifferentType(parentCon.layout, layout, f, {
          parentKind: parentCon.kind,
        });
        break;
      }
    }
  }
  return layout;
}

/** @param {Forest} f @param {TomApi} api */
export function mark2Remove(f, api) {
  if (!ensureMark2Decisions(f).policyEnabled) {
    return fail("Mark 2 policy off");
  }
  const before = selectionNode(f) || focusNode(f);
  const mon = before ? ancestorMonitor(f, before) : null;
  const r = api.deleteNode(f);
  if (!r?.ok) return r || fail("delete failed");
  let cleaned = 0;
  if (mon && f.nodes[mon.id]) {
    const c = mark2CleanupUnder(f, mon);
    cleaned = c.pruned + c.collapsed;
  } else {
    const c = mark2CleanupForest(f);
    cleaned = c.pruned + c.collapsed;
  }
  return ok("Remove", { deleted: r.id, cleaned });
}

/** @param {Forest} f @param {TomApi} api */
export function mark2ToggleSplit(f, api) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const con = targetCon(f);
  if (!con) return fail("no CON");
  const p = parent(f, con);
  const parentLayout = p?.kind === "CON" || p?.kind === "MONITOR" ? p.layout : undefined;

  if (con.layout === "HSPLIT") con.layout = "VSPLIT";
  else if (con.layout === "VSPLIT") con.layout = "HSPLIT";
  else con.layout = preferredSplitVsParent(parentLayout, f);
  con.layout = coerceDifferentType(parentLayout, con.layout, f, {
    parentKind: p?.kind,
  });
  return ok("ToggleSplit", { id: con.id, layout: con.layout });
}

/** @param {Forest} f @param {TomApi} api */
export function mark2ToggleTabStack(f, api) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const con = targetCon(f);
  if (!con) return fail("no CON");
  const p = parent(f, con);
  const parentLayout = p?.kind === "CON" || p?.kind === "MONITOR" ? p.layout : undefined;

  if (con.layout === "TABBED") con.layout = "STACKED";
  else if (con.layout === "STACKED") con.layout = "TABBED";
  else con.layout = "TABBED";

  con.layout = coerceDifferentType(parentLayout, con.layout, f, {
    parentKind: p?.kind,
  });
  return ok("ToggleTabStack", { id: con.id, layout: con.layout });
}

/** @param {Forest} f @param {TomApi} api */
export function mark2Promote(f, api) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const con = targetCon(f);
  if (!con) return fail("no CON");
  const grand = parent(f, con);
  if (!grand) return fail("no parent");
  if (grand.kind === "MONITOR" && grand.childIds.length === 1 && grand.childIds[0] === con.id) {
    return fail("no breakout of mon sole child");
  }

  const kids = children(f, con);
  for (const k of kids) {
    if (k.kind === "CON" && k.layout && grand.kind === "CON" && grand.layout) {
      k.layout = coerceDifferentType(grand.layout, k.layout, f, {
        parentKind: grand.kind,
      });
    }
  }
  const r = api.promoteChildren(f, con);
  if (!r.ok) return r;
  const cleaned = mark2CleanupUnder(f, grand.kind === "MONITOR" ? grand : f.monitors[0] || grand);
  if (kids[0]) {
    f.selectionId = kids[0].id;
    if (kids[0].kind === "WINDOW") f.focusId = kids[0].id;
  }
  return ok("Promote", { n: kids.length, cleaned });
}

/** @param {Forest} f @param {TomApi} api */
export function mark2PromoteRecursive(f, api) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  let rounds = 0;
  let promoted = 0;
  const start = selectionNode(f);
  const roots =
    start && start.kind !== "MONITOR" ? [ancestorMonitor(f, start) || start] : f.monitors;

  for (let guard = 0; guard < 32; guard++) {
    /** @type {Node[]} */
    const cons = [];
    for (const root of roots) {
      if (!root) continue;
      walk(f, root, (n) => {
        if (n.kind === "CON" && n.childIds.length >= 2) cons.push(n);
      });
    }
    cons.sort((a, b) => depthOf(f, b) - depthOf(f, a));
    let did = false;
    for (const con of cons) {
      const grand = parent(f, con);
      if (!grand || grand.kind === "MONITOR") continue;
      f.selectionId = con.id;
      const r = mark2Promote(f, api);
      if (r.ok) {
        promoted += r.n || 0;
        did = true;
        rounds++;
        break;
      }
    }
    if (!did) break;
  }
  const cleaned = mark2CleanupForest(f);
  return ok("PromoteRecursive", { rounds, promoted, cleaned });
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Dir} dir
 * @param {Mark2PointerArgs} [ptr]
 */
export function mark2Move(f, api, dir, ptr) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const cur = leafSelection(f);
  if (!cur) return fail("select a window leaf");
  if (isUnderFloats(f, cur)) return fail("not in TILES");
  const p = parent(f, cur);
  if (!p) return fail("no parent");
  const tie = tieOf(f);

  // Pointer: onto MONITOR → transfer (skip inner-edge gate).
  if (ptr?.onto) {
    const onto = f.nodes[ptr.onto];
    if (!onto) return fail("move: onto missing");
    if (onto.kind === "MONITOR") {
      const oldMon = ancestorMonitor(f, cur);
      if (oldMon?.id === onto.id) return fail("move: same monitor");
      const r = transferLeafToMonitor(f, api, cur, onto, dir, {
        join: false,
        aspectTieBreak: tie,
      });
      if (!r.ok) return r;
      if (oldMon && f.nodes[oldMon.id]) mark2CleanupUnder(f, oldMon);
      if (f.nodes[onto.id]) mark2CleanupUnder(f, onto);
      keepLeafFocus(f, cur);
      return {
        ...r,
        ok: true,
        op: "Move",
        dir,
        mode: "cross-mon",
        onto: onto.id,
        siblingAxis: monitorsSiblingAxis(f, tie),
      };
    }
    // Same-strip reorder: onto = TAB/STACK CON + insertIndex (insert-before gap).
    if (
      onto.kind === "CON" &&
      (onto.layout === "TABBED" || onto.layout === "STACKED") &&
      p.id === onto.id &&
      Number.isFinite(ptr.insertIndex)
    ) {
      const from = p.childIds.indexOf(cur.id);
      if (from < 0) return fail("move: leaf not in strip");
      const ids = p.childIds.slice();
      const [item] = ids.splice(from, 1);
      let to = Number(ptr.insertIndex);
      if (to > from) to -= 1;
      if (to < 0) to = 0;
      if (to > ids.length) to = ids.length;
      ids.splice(to, 0, item);
      let same = ids.length === p.childIds.length;
      if (same) {
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] !== p.childIds[i]) {
            same = false;
            break;
          }
        }
      }
      if (same) {
        keepLeafFocus(f, cur);
        return ok("Move", { dir, mode: "strip-noop", onto: onto.id });
      }
      replaceChildren(f, p, ids.map((id) => f.nodes[id]).filter(Boolean));
      equalizeChildren(f, p, { force: false });
      keepLeafFocus(f, cur);
      return ok("Move", { dir, mode: "strip-reorder", onto: onto.id });
    }
    // Pointer in-axis adjacent: one-hop swap with onto sibling.
    if (parent(f, onto) === p && isInAxis(p, dir)) {
      const i = p.childIds.indexOf(cur.id);
      const j = p.childIds.indexOf(onto.id);
      if (i >= 0 && j >= 0 && Math.abs(i - j) === 1) {
        swapSiblings(f, cur, onto);
        keepLeafFocus(f, cur);
        return ok("Move", { dir, mode: "swap", onto: onto.id });
      }
    }
  }

  if (isInAxis(p, dir)) {
    const sib = siblingInDir(f, p, cur, dir);
    if (sib) {
      swapSiblings(f, cur, sib);
      keepLeafFocus(f, cur);
      return ok("Move", { dir, mode: "swap" });
    }
    const edge = ensureMark2Decisions(f).edgeMove || "wrap";
    if (edge === "noop") {
      return fail("edge noop (Settings → Edge move: wrap)");
    }
    if (edge === "wrap") {
      if (p.childIds.length >= 2) {
        const to = dirDelta(dir) < 0 ? "end" : "start";
        rotateChild(f, p, cur, to);
        keepLeafFocus(f, cur);
        return ok("Move", { dir, mode: "wrap" });
      }
    }
  }

  if (isAtMonitorEdge(f, cur, dir)) {
    const mon = ancestorMonitor(f, cur);
    const dest = mon ? neighborMonitor(f, mon, dir, tie) : null;
    if (dest) {
      const oldMon = mon;
      const r = transferLeafToMonitor(f, api, cur, dest, dir, {
        join: false,
        aspectTieBreak: tie,
      });
      if (!r.ok) return r;
      if (oldMon && f.nodes[oldMon.id]) mark2CleanupUnder(f, oldMon);
      if (f.nodes[dest.id]) mark2CleanupUnder(f, dest);
      keepLeafFocus(f, cur);
      return {
        ...r,
        ok: true,
        op: "Move",
        dir,
        mode: "cross-mon",
        siblingAxis: monitorsSiblingAxis(f, tie),
      };
    }
  }

  const br = breakoutLeaf(f, api, cur, dir);
  if (!br.ok) return br;
  const mon = ancestorMonitor(f, cur);
  if (mon) mark2CleanupUnder(f, mon);
  keepLeafFocus(f, cur);
  return ok("Move", { dir, mode: "breakout" });
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Dir} dir
 * @param {Mark2PointerArgs} [ptr]
 */
export function mark2Join(f, api, dir, ptr) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const cur = leafSelection(f);
  if (!cur) return fail("select a window leaf");
  if (isUnderFloats(f, cur)) return fail("not in TILES");
  let p = parent(f, cur);
  if (!p) return fail("no parent");
  const tie = tieOf(f);

  // Pointer onto WINDOW off-monitor → transfer then continue as join toward onto.
  if (ptr?.onto) {
    const onto = f.nodes[ptr.onto];
    if (!onto || onto.kind !== "WINDOW") return fail("join: onto must be window");
    const curMon = ancestorMonitor(f, cur);
    const ontoMon = ancestorMonitor(f, onto);
    if (curMon && ontoMon && curMon.id !== ontoMon.id) {
      const r = transferLeafToMonitor(f, api, cur, ontoMon, dir, {
        join: true,
        aspectTieBreak: tie,
      });
      if (!r.ok) return r;
      if (f.nodes[curMon.id]) mark2CleanupUnder(f, curMon);
      if (f.nodes[ontoMon.id]) mark2CleanupUnder(f, ontoMon);
      p = parent(f, cur);
      if (!p) return fail("join: lost parent after transfer");
      // Fall through: if onto is now a sibling, wrap/enter below via dir path.
    }
  }

  // Pointer edge onto a WINDOW in a sibling CON (tab slot-split; H/V enter/flatten).
  if (ptr?.onto) {
    const onto = f.nodes[ptr.onto];
    const ontoP = onto?.kind === "WINDOW" ? parent(f, onto) : null;
    if (ontoP && ontoP.kind === "CON" && parent(f, ontoP) === p) {
      if (ontoP.layout === "TABBED" || ontoP.layout === "STACKED") {
        const r = slotSplitBagSibling(f, api, cur, ontoP, p, dir);
        if (!r.ok) return r;
        keepLeafFocus(f, cur);
        return { ok: true, op: "Join", dir, ...r };
      }
      const r = joinLeafIntoCon(f, api, cur, p, ontoP, dir);
      if (!r.ok) return r;
      keepLeafFocus(f, cur);
      return { ok: true, op: "Join", dir, ...r };
    }
  }

  if (isAtMonitorEdge(f, cur, dir)) {
    const mon = ancestorMonitor(f, cur);
    const dest = mon ? neighborMonitor(f, mon, dir, tie) : null;
    if (dest) {
      const oldMon = mon;
      const r = transferLeafToMonitor(f, api, cur, dest, dir, {
        join: true,
        aspectTieBreak: tie,
      });
      if (!r.ok) return r;
      if (oldMon && f.nodes[oldMon.id]) mark2CleanupUnder(f, oldMon);
      if (f.nodes[dest.id]) mark2CleanupUnder(f, dest);
      keepLeafFocus(f, cur);
      return {
        ...r,
        ok: true,
        op: "Join",
        dir,
        mode: "cross-mon",
        siblingAxis: monitorsSiblingAxis(f, tie),
      };
    }
  }

  const pairSib = soleOtherWindowSibling(f, p, cur);
  if (pairSib && cannotBreakoutLeaf(f, cur)) {
    const r = wrapTwoLeaves(f, api, cur, pairSib, p);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    return { ok: true, op: "Join", dir, mode: "wrap-pair", ...r };
  }

  // Prefer pointer onto when it is already a sibling; otherwise break out toward it.
  let preferred = null;
  let forceBreakout = false;
  if (ptr?.onto) {
    const onto = f.nodes[ptr.onto];
    if (onto && parent(f, onto) === p) preferred = onto;
    else if (onto) forceBreakout = true;
  }

  // Pointer onto a sibling WINDOW when breakout is illegal → wrap that pair
  // (DnD invents toward the hit even with >2 siblings under a mon-child CON).
  if (preferred?.kind === "WINDOW" && cannotBreakoutLeaf(f, cur)) {
    const r = wrapTwoLeaves(f, api, cur, preferred, p);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    return { ok: true, op: "Join", dir, mode: "wrap-pair", ...r };
  }

  const inAxis = isInAxis(p, dir);
  if (inAxis && !forceBreakout) {
    const sib = preferred || siblingInDir(f, p, cur, dir);
    if (sib) {
      if (sib.kind === "WINDOW") {
        const r = wrapTwoLeaves(f, api, cur, sib, p);
        if (!r.ok) return r;
        keepLeafFocus(f, cur);
        return { ok: true, op: "Join", dir, mode: "wrap-pair", ...r };
      }
      if (sib.kind === "CON") {
        const r = joinLeafIntoCon(f, api, cur, p, sib, dir);
        if (!r.ok) return r;
        keepLeafFocus(f, cur);
        return { ok: true, op: "Join", dir, ...r };
      }
    }
    const br = breakoutLeaf(f, api, cur, dir);
    if (!br.ok) return br;
  } else {
    const br = breakoutLeaf(f, api, cur, dir);
    if (!br.ok) return br;
  }

  {
    const mon = ancestorMonitor(f, cur);
    if (mon) mark2CleanupUnder(f, mon);
  }
  p = parent(f, cur);
  if (!p) return fail("breakout lost parent");

  const sib =
    (ptr?.onto && f.nodes[ptr.onto] && parent(f, f.nodes[ptr.onto]) === p
      ? f.nodes[ptr.onto]
      : null) || siblingInDir(f, p, cur, dir);
  if (!sib) {
    keepLeafFocus(f, cur);
    return ok("Join", { dir, mode: "breakout-only" });
  }
  if (sib.kind === "WINDOW") {
    const r = wrapTwoLeaves(f, api, cur, sib, p);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    return { ok: true, op: "Join", dir, mode: "breakout-wrap", ...r };
  }
  if (sib.kind === "CON") {
    const r = joinLeafIntoCon(f, api, cur, p, sib, dir);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    const mode = `breakout-${r.mode}`;
    return { ok: true, op: "Join", dir, ...r, mode };
  }
  return fail("cannot join sibling kind");
}

/**
 * Enter a CON at the near edge (arrive from right/bottom → append).
 * Strip `insertIndex` wins; CENTER `place:end` appends; else dir.
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Node} parentNode
 * @param {Node} sib
 * @param {Dir} dir
 * @param {Mark2PointerArgs|null|undefined} [ptr]
 */
function enterConNearEdge(f, api, cur, parentNode, sib, dir, ptr) {
  const i = parentNode.childIds.indexOf(cur.id);
  if (i < 0) return fail("leaf not in parent");
  api.removeChild(f, parentNode, cur);
  enterBagChild(f, sib, cur, dir, ptr);
  equalizeChildren(f, sib, { force: false });
  equalizeChildren(f, parentNode, { force: false });
  const mon = ancestorMonitor(f, cur);
  if (mon) mark2CleanupUnder(f, mon);
  markOpenLeaf(f, cur);
  return { ok: true, mode: "enter-con", into: sib.id };
}

function joinLeafIntoCon(f, api, cur, parentNode, sib, dir) {
  const i = parentNode.childIds.indexOf(cur.id);
  if (i < 0) return fail("leaf not in parent");

  if (isInAxis(sib, dir)) {
    return enterConNearEdge(f, api, cur, parentNode, sib, dir);
  }

  const list = [];
  const kidNodes = children(f, sib);
  for (const id of parentNode.childIds) {
    if (id === cur.id) continue;
    if (id === sib.id) list.push(...kidNodes);
    else {
      const n = f.nodes[id];
      if (n) list.push(n);
    }
  }
  const sidx = list.indexOf(kidNodes[0]);
  const at = dirDelta(dir) < 0 ? sidx + kidNodes.length : sidx;
  list.splice(at, 0, cur);
  replaceChildren(f, parentNode, list);
  delete f.nodes[sib.id];
  if (f.selectionId === sib.id) f.selectionId = cur.id;
  equalizeChildren(f, parentNode, { force: false });
  const mon = ancestorMonitor(f, cur);
  if (mon) mark2CleanupUnder(f, mon);
  markOpenLeaf(f, cur);
  return { ok: true, mode: "promote-join", promoted: kidNodes.map((k) => k.id) };
}

/**
 * Mark 2 Group(dir) — tab intent (D101). Enter TAB/STACK from any dir;
 * wrap/flip WINDOW siblings as TABBED; pointer onto a nested WINDOW
 * wrap-tabs at the dest slot. Never promote-join flatten.
 *
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Dir} dir
 * @param {Mark2PointerArgs} [ptr]
 */
export function mark2Group(f, api, dir, ptr) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const cur = leafSelection(f);
  if (!cur) return fail("select a window leaf");
  if (isUnderFloats(f, cur)) return fail("not in TILES");
  let p = parent(f, cur);
  if (!p) return fail("no parent");

  /** @type {Node|null} */
  let target = null;
  if (ptr?.onto) {
    const onto = f.nodes[ptr.onto];
    if (!onto) return fail("group: onto missing");
    // onto WINDOW → that window; onto TAB/STACK CON → that CON.
    if (onto.kind === "WINDOW") target = onto;
    else if (onto.kind === "CON" && (onto.layout === "TABBED" || onto.layout === "STACKED")) {
      target = onto;
    } else {
      return fail("group: onto not a window or tab/stack");
    }
  }

  const bagAlready = groupBagOf(f, target);
  if (bagAlready && p === bagAlready) {
    applyBagChildOrder(f, bagAlready, cur, ptr);
    keepLeafFocus(f, cur);
    markOpenLeaf(f, cur);
    return { ok: true, op: "Group", dir, mode: "enter-con", into: bagAlready.id };
  }

  const sib = target || siblingInDir(f, p, cur, dir);
  if (!sib) return fail("group: no sibling in dir");

  if (isBag(sib)) {
    const sibParent = parent(f, sib);
    if (sibParent && sibParent === p) {
      const r = enterConNearEdge(f, api, cur, p, sib, dir, ptr);
      if (!r.ok) return r;
      keepLeafFocus(f, cur);
      return { ok: true, op: "Group", dir, ...r };
    }
    if (ptr?.onto) {
      const r = enterForeignBag(f, api, cur, sib, dir, ptr);
      if (!r.ok) return r;
      keepLeafFocus(f, cur);
      return { ok: true, op: "Group", dir, ...r };
    }
  }

  if (sib.kind === "WINDOW") {
    if (parent(f, sib) !== p) {
      const r = groupNonSiblingWindow(f, api, cur, sib, dir, ptr);
      if (!r.ok) return r;
      keepLeafFocus(f, cur);
      return { ok: true, op: "Group", dir, ...r };
    }
    if (
      (p.layout === "HSPLIT" || p.layout === "VSPLIT") &&
      p.childIds.length === 2 &&
      children(f, p).every((c) => c.kind === "WINDOW")
    ) {
      setLayout(p, "TABBED");
      setLastTabFocus(p, cur.id);
      equalizeChildren(f, p, { force: true });
      const grand = parent(f, p);
      if (p.kind === "CON" && grand && grand.kind === "MONITOR" && grand.childIds.length === 1) {
        p.percent = 1;
        p.userSized = false;
      }
      markOpenLeaf(f, cur);
      keepLeafFocus(f, cur);
      return { ok: true, op: "Group", dir, mode: "flip-tab", into: p.id };
    }
    const prev = ensureMark2Decisions(f).defaultJoinContainer;
    ensureMark2Decisions(f).defaultJoinContainer = "TAB";
    const r = wrapTwoLeaves(f, api, cur, sib, p);
    ensureMark2Decisions(f).defaultJoinContainer = prev;
    if (!r.ok) return r;
    const wrap = f.nodes[r.wrap];
    if (wrap && wrap.layout !== "TABBED" && wrap.layout !== "STACKED") {
      setLayout(wrap, "TABBED");
      setLastTabFocus(wrap, cur.id);
    }
    keepLeafFocus(f, cur);
    return { ok: true, op: "Group", dir, mode: "wrap-tab", ...r };
  }

  if (sib.kind === "CON" && (sib.layout === "TABBED" || sib.layout === "STACKED")) {
    const r = enterConNearEdge(f, api, cur, p, sib, dir, ptr);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    return { ok: true, op: "Group", dir, ...r };
  }

  return fail("group: sibling is not a window or tab/stack");
}

/** @param {Node|null|undefined} n */
function isBag(n) {
  return !!(n && n.kind === "CON" && isBagLayout(n));
}

/**
 * @param {Forest} f
 * @param {Node|null} target
 * @returns {Node|null}
 */
function groupBagOf(f, target) {
  if (!target) return null;
  if (isBag(target)) return target;
  if (target.kind === "WINDOW") {
    const p = parent(f, target);
    return isBag(p) ? p : null;
  }
  return null;
}

/**
 * Strip gap vs CENTER-end vs join dir for a TAB/STACK child list.
 * @param {Dir} dir
 * @param {Mark2PointerArgs|null|undefined} ptr
 * @returns {"index"|"end"|"start"}
 */
function bagChildPlace(dir, ptr) {
  if (Number.isFinite(ptr?.insertIndex)) return "index";
  if (ptr?.place === "end") return "end";
  if (dir === "left" || dir === "up") return "end";
  return "start";
}

/**
 * @param {Forest} f
 * @param {Node} bag
 * @param {Node} cur
 * @param {Dir} dir
 * @param {Mark2PointerArgs|null|undefined} ptr
 */
function enterBagChild(f, bag, cur, dir, ptr) {
  const place = bagChildPlace(dir, ptr);
  if (place === "start") insertBefore(f, bag, cur, children(f, bag)[0] ?? null);
  else appendChild(f, bag, cur);
  if (place === "index") applyBagInsertIndex(f, bag, cur, ptr);
}

/**
 * Honor strip insertIndex (insert-before gap) after enter.
 * @param {Forest} f
 * @param {Node} bag
 * @param {Node} cur
 * @param {Mark2PointerArgs|undefined} ptr
 */
function applyBagInsertIndex(f, bag, cur, ptr) {
  if (!bag || !Number.isFinite(ptr?.insertIndex)) return;
  const from = bag.childIds.indexOf(cur.id);
  if (from < 0) return;
  const ids = bag.childIds.slice();
  const [item] = ids.splice(from, 1);
  let to = Number(ptr.insertIndex);
  if (to < 0) to = 0;
  if (to > ids.length) to = ids.length;
  ids.splice(to, 0, item);
  let same = ids.length === bag.childIds.length;
  if (same) {
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== bag.childIds[i]) {
        same = false;
        break;
      }
    }
  }
  if (same) return;
  replaceChildren(f, bag, ids.map((id) => f.nodes[id]).filter(Boolean));
  equalizeChildren(f, bag, { force: false });
}

/**
 * Already in the bag: strip gap or CENTER last; keyboard dir does not reorder.
 * @param {Forest} f
 * @param {Node} bag
 * @param {Node} cur
 * @param {Mark2PointerArgs|null|undefined} ptr
 */
function applyBagChildOrder(f, bag, cur, ptr) {
  if (!bag) return;
  if (Number.isFinite(ptr?.insertIndex)) {
    applyBagInsertIndex(f, bag, cur, ptr);
    return;
  }
  if (ptr?.place !== "end") return;
  const from = bag.childIds.indexOf(cur.id);
  if (from < 0 || from === bag.childIds.length - 1) return;
  const ids = bag.childIds.slice();
  const [item] = ids.splice(from, 1);
  ids.push(item);
  replaceChildren(f, bag, ids.map((id) => f.nodes[id]).filter(Boolean));
  equalizeChildren(f, bag, { force: false });
}

/**
 * Insert grab into bag without first becoming a sibling of the bag.
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Node} bag
 * @param {Dir} dir
 * @param {Mark2PointerArgs|null|undefined} ptr
 */
function enterBagDirect(f, api, cur, bag, dir, ptr) {
  const pNow = parent(f, cur);
  if (!pNow) return fail("group: lost parent");
  if (pNow === bag) {
    applyBagChildOrder(f, bag, cur, ptr);
    markOpenLeaf(f, cur);
    return { ok: true, mode: "enter-con", into: bag.id };
  }
  const srcMon = ancestorMonitor(f, cur);
  if (pNow.childIds.indexOf(cur.id) < 0) return fail("leaf not in parent");
  api.removeChild(f, pNow, cur);
  enterBagChild(f, bag, cur, dir, ptr);
  equalizeChildren(f, bag, { force: false });
  equalizeChildren(f, pNow, { force: false });
  if (srcMon && f.nodes[srcMon.id]) mark2CleanupUnder(f, srcMon);
  const destMon = ancestorMonitor(f, bag);
  if (destMon && destMon !== srcMon && f.nodes[destMon.id]) mark2CleanupUnder(f, destMon);
  markOpenLeaf(f, cur);
  return { ok: true, mode: "enter-con", into: bag.id };
}

/**
 * Pointer onto a foreign TAB/STACK CON: peel next to the bag then enter,
 * or enter in place when the bag is the MONITOR's only child.
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Node} bag
 * @param {Dir} dir
 * @param {Mark2PointerArgs|undefined} ptr
 */
function enterForeignBag(f, api, cur, bag, dir, ptr) {
  const pNow = parent(f, cur);
  if (!pNow) return fail("group: lost parent");
  if (pNow === bag) {
    applyBagChildOrder(f, bag, cur, ptr);
    markOpenLeaf(f, cur);
    return { ok: true, mode: "enter-con", into: bag.id };
  }
  const bagParent = parent(f, bag);
  if (!bagParent) return fail("group: tab/stack not a sibling");
  const srcMon = ancestorMonitor(f, cur);
  const destMon = ancestorMonitor(f, bag);
  if (bagParent.kind === "MONITOR" || (srcMon && destMon && srcMon.id !== destMon.id)) {
    return enterBagDirect(f, api, cur, bag, dir, ptr);
  }
  if (pNow !== bagParent) {
    if (dir === "left" || dir === "up") insertBefore(f, bagParent, cur, bag);
    else insertAfter(f, bagParent, cur, bag);
    if (srcMon && f.nodes[srcMon.id]) mark2CleanupUnder(f, srcMon);
  }
  const p2 = parent(f, cur);
  if (p2 === bag) {
    applyBagChildOrder(f, bag, cur, ptr);
    markOpenLeaf(f, cur);
    return { ok: true, mode: "enter-con", into: bag.id };
  }
  if (p2 !== bagParent) return fail("group: tab/stack not a sibling");
  return enterConNearEdge(f, api, cur, p2, bag, dir, ptr);
}

/**
 * Pointer onto a non-sibling WINDOW: wrap-tab at dest slot (or enter dest bag).
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Node} onto
 * @param {Dir} dir
 * @param {Mark2PointerArgs|undefined} [ptr]
 */
function groupNonSiblingWindow(f, api, cur, onto, dir, ptr) {
  const destP = parent(f, onto);
  if (!destP) return fail("group: onto window not a sibling");

  if (isBag(destP)) {
    const bagParent = parent(f, destP);
    if (!bagParent) return fail("group: tab/stack not a sibling");
    const srcMon = ancestorMonitor(f, cur);
    const destMon = ancestorMonitor(f, destP);
    if (bagParent.kind === "MONITOR" || (srcMon && destMon && srcMon.id !== destMon.id)) {
      const r = enterBagDirect(f, api, cur, destP, dir, ptr);
      if (!r.ok) return r;
      keepLeafFocus(f, cur);
      return { ok: true, mode: r.mode || "enter-con", into: destP.id };
    }
    if (parent(f, cur) !== bagParent) {
      const srcMon = ancestorMonitor(f, cur);
      if (dir === "left" || dir === "up") insertBefore(f, bagParent, cur, destP);
      else insertAfter(f, bagParent, cur, destP);
      if (srcMon && f.nodes[srcMon.id]) mark2CleanupUnder(f, srcMon);
    }
    const pNow = parent(f, cur);
    if (pNow === destP) {
      keepLeafFocus(f, cur);
      markOpenLeaf(f, cur);
      return { ok: true, mode: "enter-con", into: destP.id };
    }
    if (pNow !== bagParent) return fail("group: tab/stack not a sibling");
    const r = enterConNearEdge(f, api, cur, pNow, destP, dir, ptr);
    if (!r.ok) return r;
    keepLeafFocus(f, cur);
    return { ok: true, mode: r.mode || "enter-con", into: destP.id };
  }

  const srcMon = ancestorMonitor(f, cur);
  const r = wrapSlotWithNew(f, api, onto, cur, "TABBED");
  if (!r.ok) return r;
  if (srcMon && f.nodes[srcMon.id]) mark2CleanupUnder(f, srcMon);
  const destMon = ancestorMonitor(f, cur);
  if (destMon && f.nodes[destMon.id]) mark2CleanupUnder(f, destMon);
  const wrap = parent(f, cur);
  if (!wrap || (wrap.layout !== "TABBED" && wrap.layout !== "STACKED")) {
    return fail("group: onto window not a sibling");
  }
  setLastTabFocus(wrap, cur.id);
  markOpenLeaf(f, cur);
  return { ok: true, mode: "wrap-tab-onto", wrap: wrap.id };
}

/** @param {Forest} f @param {Node} cur */
function cannotBreakoutLeaf(f, cur) {
  const p = parent(f, cur);
  if (!p) return true;
  // Cannot become a sibling of ROOT, WORKSPACE, or MONITOR.
  if (
    p.kind === "MONITOR" ||
    p.kind === "WORKSPACE" ||
    p.kind === "ROOT" ||
    p.kind === "FLOATS" ||
    p.kind === "META"
  ) {
    return true;
  }
  const grand = parent(f, p);
  if (!grand) return true;
  // MONITOR allows 0 or 1 child. The only way onto a MONITOR is unary collapse
  // of that one child CON — never a second sibling on the MONITOR.
  if (grand.kind === "MONITOR") return true;
  return false;
}

/**
 * Edge-join a leaf that is already a sibling of a TAB/STACK bag.
 * Flip the parent split to the zone axis when those two are the only kids;
 * otherwise wrap the bag's slot.
 *
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Node} bag
 * @param {Node} parentNode
 * @param {Dir} dir
 */
function slotSplitBagSibling(f, api, cur, bag, parentNode, dir) {
  if (parent(f, cur) !== parentNode || parent(f, bag) !== parentNode) {
    return fail("join: bag not a sibling");
  }
  const layout = dir === "left" || dir === "right" ? "HSPLIT" : "VSPLIT";
  const curFirst = dir === "left" || dir === "up";
  if (parentNode.childIds.length === 2) {
    if (parentNode.layout !== layout) setLayout(parentNode, layout);
    const iCur = parentNode.childIds.indexOf(cur.id);
    const iBag = parentNode.childIds.indexOf(bag.id);
    if (iCur < 0 || iBag < 0) return fail("join: bag not a sibling");
    if (curFirst !== iCur < iBag) swapSiblings(f, cur, bag);
    equalizeChildren(f, parentNode, { force: false });
    markOpenLeaf(f, cur);
    return { ok: true, mode: "slot-split-flip", layout };
  }
  const rem = api.removeChild(f, parentNode, cur);
  if (rem && rem.ok === false) return rem;
  const r = wrapSlotWithNew(f, api, bag, cur, layout);
  if (!r.ok) return r;
  const wrap = parent(f, cur);
  if (wrap && wrap.childIds.length === 2) {
    const curIsFirst = wrap.childIds[0] === cur.id;
    if (curFirst !== curIsFirst) swapSiblings(f, cur, bag);
  }
  const mon = ancestorMonitor(f, cur);
  if (mon) mark2CleanupUnder(f, mon);
  markOpenLeaf(f, cur);
  return { ok: true, mode: "slot-split-wrap", layout, wrap: wrap?.id };
}

function wrapTwoLeaves(f, api, a, b, parentNode) {
  const formerLayout = parentNode.layout;
  let host = parentNode;
  /** @type {Node|null} */
  let replaceEmpty = null;
  const insertAt = Math.min(parentNode.childIds.indexOf(a.id), parentNode.childIds.indexOf(b.id));
  const spine =
    parentNode.kind === "MONITOR" ||
    parentNode.kind === "WORKSPACE" ||
    parentNode.kind === "ROOT";

  api.removeChild(f, parentNode, a);
  api.removeChild(f, parentNode, b);

  const bag = parentNode.layout === "TABBED" || parentNode.layout === "STACKED";
  if (parentNode.childIds.length === 0 && !spine) {
    const grand = parent(f, parentNode);
    if (!grand) return fail("emptied CON has no parent");
    replaceEmpty = parentNode;
    host = grand;
  } else if (bag && !spine) {
    const grand = parent(f, parentNode);
    if (!grand) return fail("tab has no parent");
    host = grand;
  }

  const emptiedSplit = replaceEmpty && (formerLayout === "HSPLIT" || formerLayout === "VSPLIT");
  const emptiedSpine = spine && parentNode.childIds.length === 0;
  const layout = layoutForJoinWrap(host, [a, b], f, {
    inventVsLayout: emptiedSplit || emptiedSpine ? formerLayout : host.layout,
  });
  const wrap = api.makeCon(layout, []);
  api._registerTree(f, wrap);
  appendChild(f, wrap, a);
  appendChild(f, wrap, b);

  if (replaceEmpty) {
    wrap.percent = replaceEmpty.percent;
    if (replaceEmpty.userSized) wrap.userSized = true;
    api.replaceChild(f, host, replaceEmpty, wrap);
    delete f.nodes[replaceEmpty.id];
    if (f.selectionId === replaceEmpty.id) f.selectionId = wrap.id;
  } else if (bag && host !== parentNode) {
    const bagNode = parentNode;
    const bagIdx = host.childIds.indexOf(bagNode.id);
    const ref =
      bagIdx >= 0 && bagIdx + 1 < host.childIds.length ? f.nodes[host.childIds[bagIdx + 1]] : null;
    if (ref) api.insertBefore(f, host, wrap, ref);
    else appendChild(f, host, wrap);
  } else {
    const at = Math.max(
      0,
      insertAt < 0 ? host.childIds.length : Math.min(insertAt, host.childIds.length)
    );
    const ref = at < host.childIds.length ? f.nodes[host.childIds[at]] : null;
    api.insertBefore(f, host, wrap, ref);
  }

  equalizeChildren(f, wrap, { force: true });
  equalizeChildren(f, host, { force: false });
  const mon = ancestorMonitor(f, a);
  if (mon) mark2CleanupUnder(f, mon);
  markOpenLeaf(f, a);
  const settled = f.nodes[wrap.id] || parent(f, a);
  return {
    ok: true,
    wrap: settled?.id || wrap.id,
    layout: settled?.layout || layout,
  };
}

/** @param {Forest} f @param {Node} parentNode @param {Node} cur */
function soleOtherWindowSibling(f, parentNode, cur) {
  if (parentNode.childIds.length !== 2) return null;
  const otherId =
    parentNode.childIds[0] === cur.id ? parentNode.childIds[1] : parentNode.childIds[0];
  const other = f.nodes[otherId];
  return other?.kind === "WINDOW" ? other : null;
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Dir} dir
 */
function breakoutLeaf(f, api, cur, dir) {
  if (cannotBreakoutLeaf(f, cur)) {
    const p = parent(f, cur);
    if (!p) return fail("no parent");
    if (p.kind === "MONITOR") return fail("no breakout onto workspace");
    if (p.kind === "WORKSPACE" || p.kind === "ROOT") {
      return fail("no breakout of spine node");
    }
    return fail("no breakout onto monitor");
  }
  return breakoutTreeOp(f, cur, dirSide(dir));
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {{ label: string, monIndex: number, wmClass?: string }} opts
 */
export function mark2Launch(f, api, opts) {
  if (!ensureMark2Decisions(f).policyEnabled) return fail("Mark 2 policy off");
  const mon = f.monitors[opts.monIndex];
  if (!mon) return fail("no monitor");
  const win = api.makeWindow(opts.label, opts.wmClass || "app");
  api._registerTree(f, win);

  const kids = children(f, mon);
  if (!kids.length) {
    appendChild(f, mon, win);
    keepLeafFocus(f, win);
    return ok("Launch", { id: win.id, mon: mon.id, mode: "empty" });
  }

  const slot = selectedSlotOnMonitor(f, mon);
  if (slot) {
    const r = launchNextTo(f, api, slot, win);
    if (!r.ok) return r;
    const m = ancestorMonitor(f, win);
    if (m) mark2CleanupUnder(f, m);
    keepLeafFocus(f, win);
    return ok("Launch", { id: win.id, mon: mon.id, mode: r.mode });
  }

  const last = rightmostLeaf(f, mon);
  if (!last || last.kind === "MONITOR") {
    appendChild(f, mon, win);
    keepLeafFocus(f, win);
    return ok("Launch", { id: win.id, mon: mon.id, mode: "empty" });
  }
  const r = launchAtEnd(f, api, last, win);
  if (!r.ok) return r;
  const m = ancestorMonitor(f, win);
  if (m) mark2CleanupUnder(f, m);
  keepLeafFocus(f, win);
  return ok("Launch", { id: win.id, mon: mon.id, mode: r.mode || "end" });
}

/** @param {Forest} f @param {Node} mon */
function selectedSlotOnMonitor(f, mon) {
  const cur = selectionNode(f);
  if (!cur || (cur.kind !== "WINDOW" && cur.kind !== "CON")) return null;
  if (!isUnder(f, cur, mon)) return null;
  return cur;
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} slot
 * @param {Node} win
 */
function launchNextTo(f, api, slot, win) {
  const p = parent(f, slot);
  if (!p) return fail("slot has no parent");

  if (p.kind === "MONITOR") {
    const layout = pickMonitorWrapLayout(f, slot);
    return wrapSlotWithNew(f, api, slot, win, layout);
  }
  if (p.layout === "TABBED" || p.layout === "STACKED") {
    return insertAsNextSibling(f, api, slot, win);
  }
  if (p.layout === "HSPLIT") {
    const rect = paneRect(f, slot);
    const wider = rect && rect.w > rect.h;
    if (wider) {
      if (extraShareWouldViolate(f, p)) {
        return wrapSlotWithNew(f, api, slot, win, "TABBED");
      }
      return insertAsNextSibling(f, api, slot, win);
    }
    const wrap = wrapWouldViolateMin(f, slot, "VSPLIT") ? "TABBED" : "VSPLIT";
    return wrapSlotWithNew(f, api, slot, win, wrap);
  }
  if (p.layout === "VSPLIT") {
    const rect = paneRect(f, slot);
    const taller = rect && rect.h > rect.w;
    if (taller) {
      if (extraShareWouldViolate(f, p)) {
        return wrapSlotWithNew(f, api, slot, win, "TABBED");
      }
      return insertAsNextSibling(f, api, slot, win);
    }
    const wrap = wrapWouldViolateMin(f, slot, "HSPLIT") ? "TABBED" : "HSPLIT";
    return wrapSlotWithNew(f, api, slot, win, wrap);
  }
  return insertAsNextSibling(f, api, slot, win);
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} last
 * @param {Node} win
 */
function launchAtEnd(f, api, last, win) {
  const p = parent(f, last);
  if (!p) return fail("end leaf has no parent");
  if (p.kind === "MONITOR") {
    const layout = pickMonitorWrapLayout(f, last);
    return wrapSlotWithNew(f, api, last, win, layout);
  }
  if ((p.layout === "HSPLIT" || p.layout === "VSPLIT") && extraShareWouldViolate(f, p)) {
    return wrapSlotWithNew(f, api, last, win, "TABBED");
  }
  return insertAsNextSibling(f, api, last, win);
}

/** @param {Forest} f @param {Node} slot */
function pickMonitorWrapLayout(f, slot) {
  const rect = paneRect(f, slot);
  /** @type {import('../tom/kernel.js').Layout} */
  let layout = tieOf(f);
  if (rect) {
    if (rect.w > rect.h) layout = "HSPLIT";
    else if (rect.h > rect.w) layout = "VSPLIT";
  }
  if (wrapWouldViolateMin(f, slot, layout)) return "TABBED";
  return layout;
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} slot
 * @param {Node} win
 * @param {import('../tom/kernel.js').Layout} layout
 */
function wrapSlotWithNew(f, api, slot, win, layout) {
  const p = parent(f, slot);
  if (!p) return fail("slot has no parent");
  // Same-type H/V wrap is illegal after settle.
  if (
    slot.kind === "CON" &&
    (layout === "HSPLIT" || layout === "VSPLIT") &&
    slot.layout === layout
  ) {
    if (p.kind === "MONITOR") {
      layout = layout === "HSPLIT" ? "VSPLIT" : "HSPLIT";
      if (wrapWouldViolateMin(f, slot, layout)) layout = "TABBED";
    } else if (slot.layout === "HSPLIT" || slot.layout === "VSPLIT") {
      return insertAsLastChild(f, api, slot, win);
    }
  }
  const wrap = api.makeCon(layout, []);
  api._registerTree(f, wrap);
  wrap.percent = slot.percent;
  wrap.userSized = !!slot.userSized;
  const swapped = api.replaceChild(f, p, slot, wrap);
  if (!swapped.ok) return swapped;
  appendChild(f, wrap, slot);
  appendChild(f, wrap, win);
  equalizeChildren(f, wrap, { force: true });
  return { ok: true, mode: layout === "TABBED" ? "wrap-tab" : "wrap-split" };
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} slot
 * @param {Node} win
 */
function insertAsLastChild(f, api, slot, win) {
  if (extraShareWouldViolate(f, slot)) {
    return wrapSlotWithNew(f, api, slot, win, "TABBED");
  }
  appendChild(f, slot, win);
  win.userSized = false;
  const r = redistributeShare(f, slot);
  if (!r.ok) return r;
  return { ok: true, mode: "sibling" };
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} slot
 * @param {Node} win
 */
function insertAsNextSibling(f, api, slot, win) {
  const p = parent(f, slot);
  if (!p) return fail("slot has no parent");
  if (p.kind === "MONITOR") return fail("no sibling on monitor");
  insertAfter(f, p, win, slot);
  win.userSized = false;
  if (p.layout === "HSPLIT" || p.layout === "VSPLIT") {
    const r = redistributeShare(f, p);
    if (!r.ok) return r;
  } else {
    equalizeChildren(f, p, { force: false });
  }
  return { ok: true, mode: "sibling" };
}

/** @param {Forest} f */
function leafSelection(f) {
  const cur = focusNode(f) || selectionNode(f);
  if (!cur || cur.kind !== "WINDOW") return null;
  return cur;
}

/** @param {Forest} f @param {Node} leaf */
function keepLeafFocus(f, leaf) {
  if (f.nodes[leaf.id]) setFocus(f, leaf.id);
}

/** @param {Forest} f */
function targetCon(f) {
  const cur = selectionNode(f);
  if (!cur) return null;
  return findConTarget(f, cur);
}

/** @param {Forest} f @param {Node} n */
function depthOf(f, n) {
  let d = 0;
  let cur = n;
  const seen = new Set();
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    d++;
    cur = f.nodes[cur.parentId];
  }
  return d;
}

/** @type {import('./index.js').OpSet} */
export const MARK2_OPSET = {
  id: "mark2",
  label: "Mark 2",
  description:
    "In-axis swap/wrap, cross-axis breakout, directional invent-join, aspect launch, unary/same-type settle",
  ops: {
    move: mark2Move,
    join: mark2Join,
    group: mark2Group,
    launch: mark2Launch,
    toggleSplit: mark2ToggleSplit,
    toggleTabStack: mark2ToggleTabStack,
    promote: mark2Promote,
    promoteRecursive: mark2PromoteRecursive,
    remove: mark2Remove,
  },
  pointer: MARK2_POINTER,
  settle(f) {
    return settleForest(f, tieOf(f));
  },
  defaults: {
    edgeMove: "wrap",
    aspectTieBreak: "HSPLIT",
    defaultJoinContainer: "SPLIT",
  },
};
