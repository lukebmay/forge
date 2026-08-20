/*
 * Free-open min-size placement: split → tab walk → float.
 * Pure; no GObject. DnD refuse stays in drop-intent.js.
 */

import { unitMins } from "./drop-intent.js";

/**
 * @param {{ width?: number, height?: number }|null|undefined} m
 * @returns {boolean}
 */
function hasMins(m) {
  return !!m && ((Number(m.width) || 0) > 0 || (Number(m.height) || 0) > 0);
}

/**
 * @param {number} min
 * @param {number} size
 */
function exceeds(min, size) {
  return min > 0 && size > 0 && min > size;
}

/**
 * @param {{ width?: number, height?: number }|null|undefined} a
 * @param {{ width?: number, height?: number }|null|undefined} b
 */
function maxMins(a, b) {
  return {
    width: Math.max(Number(a?.width) || 0, Number(b?.width) || 0),
    height: Math.max(Number(a?.height) || 0, Number(b?.height) || 0),
  };
}

/**
 * 50/50 edge split would leave new or dest below min.
 * @param {{ width?: number, height?: number }} newMins
 * @param {{ width?: number, height?: number }} destMins
 * @param {{ width?: number, height?: number }|null|undefined} slotRect
 * @param {"horizontal"|"vertical"} orientation
 * @returns {boolean}
 */
export function splitWouldOverflowMins(newMins, destMins, slotRect, orientation) {
  const slotW = Number(slotRect?.width) || 0;
  const slotH = Number(slotRect?.height) || 0;
  if (!(slotW > 0) || !(slotH > 0)) return false;
  const nw = Number(newMins?.width) || 0;
  const nh = Number(newMins?.height) || 0;
  const dw = Number(destMins?.width) || 0;
  const dh = Number(destMins?.height) || 0;
  if (orientation === "vertical") {
    const halfH = slotH / 2;
    return exceeds(nh, halfH) || exceeds(dh, halfH) || exceeds(nw, slotW) || exceeds(dw, slotW);
  }
  const halfW = slotW / 2;
  return exceeds(nw, halfW) || exceeds(dw, halfW) || exceeds(nh, slotH) || exceeds(dh, slotH);
}

/**
 * Slot cannot host `mins` on an axis (exceeds by more than ε).
 * Missing/zero rect → false (caller still owns D026 restore).
 * @param {{ width?: number, height?: number }|null|undefined} slotRect
 * @param {{ width?: number, height?: number }|null|undefined} mins
 * @param {number} [eps=4]
 * @returns {boolean}
 */
export function slotOverflowsMins(slotRect, mins, eps = 4) {
  const slotW = Number(slotRect?.width) || 0;
  const slotH = Number(slotRect?.height) || 0;
  if (!(slotW > 0) || !(slotH > 0)) return false;
  const e = Number.isFinite(Number(eps)) ? Math.abs(Number(eps)) : 4;
  const mw = Number(mins?.width) || 0;
  const mh = Number(mins?.height) || 0;
  return exceeds(mw, slotW + e) || exceeds(mh, slotH + e);
}

/**
 * Tab/join into full pane would leave new or dest below min.
 * @param {{ width?: number, height?: number }} newMins
 * @param {{ width?: number, height?: number }} destMins
 * @param {{ width?: number, height?: number }|null|undefined} slotRect
 * @returns {boolean}
 */
export function tabWouldOverflowMins(newMins, destMins, slotRect) {
  const slotW = Number(slotRect?.width) || 0;
  const slotH = Number(slotRect?.height) || 0;
  if (!(slotW > 0) || !(slotH > 0)) return false;
  const need = maxMins(newMins, destMins);
  return exceeds(need.width, slotW) || exceeds(need.height, slotH);
}

/**
 * Free-open: split if legal, else same-mon tab BFS, else float.
 * Zero mins → split. Tab-only mode skips the split try.
 *
 * @param {object} opts
 * @param {"horizontal"|"vertical"} [opts.orientation="horizontal"]
 * @param {{ width?: number, height?: number }} [opts.newMins]
 * @param {object|null|undefined} opts.lftUnit
 * @param {(unit: object) => ({ width?: number, height?: number }|null|undefined)} opts.slotRectFor
 * @param {object[]} [opts.candidates] BFS-ordered tab units (lft first)
 * @param {(unit: object) => ({ width: number, height: number })} [opts.unitMinsFor]
 * @param {"split-or-tab"|"tab-only"} [opts.mode="split-or-tab"]
 * @returns {{ kind: "split" } | { kind: "tab", targetUnit: object } | { kind: "float" }}
 */
export function resolveOpenMinPlacement(opts = {}) {
  const newMins = opts.newMins || { width: 0, height: 0 };
  const lftUnit = opts.lftUnit;
  const slotRectFor = opts.slotRectFor;
  const unitMinsFor = opts.unitMinsFor || ((u) => unitMins(u));
  const mode = opts.mode === "tab-only" ? "tab-only" : "split-or-tab";
  const orientation = opts.orientation === "vertical" ? "vertical" : "horizontal";
  const candidates = Array.isArray(opts.candidates)
    ? opts.candidates.filter(Boolean)
    : lftUnit
    ? [lftUnit]
    : [];

  if (!lftUnit || typeof slotRectFor !== "function") {
    return { kind: "split" };
  }

  const lftMins = unitMinsFor(lftUnit);
  if (!hasMins(newMins) && !hasMins(lftMins)) {
    return { kind: "split" };
  }

  if (mode === "split-or-tab") {
    const lftRect = slotRectFor(lftUnit);
    // Unknown slot geom → split (D032 wrap). Only skip split when we can prove overflow.
    if (!lftRect || !splitWouldOverflowMins(newMins, lftMins, lftRect, orientation)) {
      return { kind: "split" };
    }
  }

  for (const unit of candidates) {
    const rect = slotRectFor(unit);
    if (!rect) continue;
    const dest = unitMinsFor(unit);
    if (!tabWouldOverflowMins(newMins, dest, rect)) {
      return { kind: "tab", targetUnit: unit };
    }
  }

  return { kind: "float" };
}

/**
 * Mid-session TILE overflow: tab-only BFS (never split). Skips `selfUnit`
 * and any candidate that already contains it.
 *
 * @param {object} opts same as resolveOpenMinPlacement plus
 * @param {object|null|undefined} [opts.selfUnit] overflowing unit (excluded)
 * @returns {{ kind: "tab", targetUnit: object } | { kind: "float" }}
 */
export function resolveTileOverflowPlacement(opts = {}) {
  const selfUnit = opts.selfUnit || opts.lftUnit;
  if (!selfUnit) return { kind: "float" };
  const raw = Array.isArray(opts.candidates)
    ? opts.candidates.filter(Boolean)
    : selfUnit
    ? [selfUnit]
    : [];
  const candidates = raw.filter((u) => {
    if (!u || u === selfUnit) return false;
    if (typeof u.contains === "function" && u.contains(selfUnit)) return false;
    return true;
  });
  const decision = resolveOpenMinPlacement({
    ...opts,
    lftUnit: opts.lftUnit || selfUnit,
    mode: "tab-only",
    candidates,
  });
  if (decision?.kind === "tab" && decision.targetUnit) return decision;
  return { kind: "float" };
}

/**
 * Normalize a tree node to a tab-join unit (TILE window or tab/stack CON).
 * @param {object|null|undefined} node
 * @param {object} [layoutTypes] LAYOUT_TYPES-like with TABBED/STACKED
 * @returns {object|null}
 */
export function tabJoinUnit(node, layoutTypes) {
  if (!node) return null;
  const tabbed = layoutTypes?.TABBED ?? "TABBED";
  const stacked = layoutTypes?.STACKED ?? "STACKED";
  const isGroup = (n) =>
    !!(n?.isStackedOrTabbed?.() || n?.layout === tabbed || n?.layout === stacked);
  if (isGroup(node)) return node;
  if (node.isWindow?.() || node.nodeType === "WINDOW") {
    if (node.isFloat?.() || node.isGrabTile?.()) return null;
    const parent = node.parentNode;
    if (parent && isGroup(parent)) return parent;
    return node;
  }
  return null;
}

/**
 * BFS same-monitor tab-join candidates starting at `start` (included first).
 * Climbs via siblings then parent so uncles are reached after local siblings.
 *
 * @param {object|null|undefined} start
 * @param {object|null|undefined} monitorNode
 * @param {object} [layoutTypes]
 * @returns {object[]}
 */
export function bfsOpenMinTabCandidates(start, monitorNode, layoutTypes) {
  if (!start) return [];
  const out = [];
  const seen = new Set();
  const queued = new Set();
  const q = [];

  const isCeiling = (n) =>
    !n ||
    n === monitorNode ||
    n.isMonitor?.() === true ||
    n.nodeType === "MONITOR" ||
    n.isRoot?.() === true ||
    n.nodeType === "ROOT" ||
    n.isWorkspace?.() === true ||
    n.nodeType === "WORKSPACE";

  const push = (n) => {
    if (!n || queued.has(n) || isCeiling(n)) return;
    queued.add(n);
    q.push(n);
  };

  push(start);

  while (q.length) {
    const n = q.shift();
    if (!n || seen.has(n) || isCeiling(n)) continue;
    seen.add(n);

    const unit = tabJoinUnit(n, layoutTypes);
    if (unit && !out.includes(unit)) out.push(unit);

    const parent = n.parentNode;
    if (parent) {
      // Siblings even when parent is MONITOR (same-head neighbors).
      for (const sib of parent.childNodes || []) {
        if (sib !== n) push(sib);
      }
      if (!isCeiling(parent)) push(parent);
    }

    // Expand H/V children so nested leaves become candidates.
    if (n.isCon?.() && !n.isStackedOrTabbed?.()) {
      for (const child of n.childNodes || []) push(child);
    }
  }

  return out;
}
