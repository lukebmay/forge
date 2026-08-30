/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure drop-intent (D0 + D024). No GObject.
 * No-op only when parent + order + layout already match.
 * Min-overflow refuse for DnD preview/commit.
 */

import { readWindowMinSize } from "./tree-layout.js";

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isHSplit(node) {
  return !!(node?.isHSplit?.() || node?.layout === "HSPLIT");
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isVSplit(node) {
  return !!(node?.isVSplit?.() || node?.layout === "VSPLIT");
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isGrouped(node) {
  return !!(
    node?.isStackedOrTabbed?.() ||
    node?.isTabbed?.() ||
    node?.isStacked?.() ||
    node?.layout === "TABBED" ||
    node?.layout === "STACKED"
  );
}

/**
 * CENTER into an already TABBED/STACKED parent of both nodes.
 * @param {object} parent
 * @param {object} operation
 * @param {object} [ctx]
 * @returns {boolean}
 */
function isSameGroupParent(parent, operation, ctx) {
  if (ctx?.stackedOrTabbed && parent === operation.containerNode) return true;
  return isGrouped(parent);
}

/**
 * D0+D024: true when the drop would change parent, order, or layout.
 * CENTER on H/V siblings is a group op — never “already after target.”
 *
 * @param {object|null|undefined} source dragged WINDOW node
 * @param {object|null|undefined} target WINDOW node under the pointer
 * @param {object|null|undefined} operation from _buildDropOperation
 * @param {object} [ctx]
 * @returns {boolean}
 */
export function dropChangesStructure(source, target, operation, ctx) {
  if (!source || !target || !operation) return false;
  if (source === target) return false;

  const parent = source.parentNode;
  if (!parent || parent !== target.parentNode) return true;

  if (operation.isCenter) {
    if (operation.isSwap) return true;
    if (isSameGroupParent(parent, operation, ctx)) return false;
    return true;
  }

  if (operation.isSwap) return true;
  if (operation.shouldWrapTargetCon || operation.shouldDetachWindow) return true;

  if (operation.shouldCreateCon) {
    if ((parent.childNodes?.length ?? 0) !== 2) return true;
    const wantH = !!operation.isHorizontal;
    if (wantH && !isHSplit(parent)) return true;
    if (!wantH && !isVSplit(parent)) return true;
  } else if (operation.isHorizontal && isVSplit(parent)) {
    return true;
  } else if (!operation.isHorizontal && isHSplit(parent)) {
    return true;
  }

  if (operation.isBefore) {
    return source.nextSibling !== target;
  }
  return target.nextSibling !== source;
}

/**
 * CENTER that groups two H/V CON siblings via mergeWindowsIntoGroup.
 * @param {object|null|undefined} source
 * @param {object|null|undefined} target
 * @param {object|null|undefined} operation
 * @returns {boolean}
 */
export function shouldMergeCenterGroup(source, target, operation) {
  if (!source || !target || !operation?.isCenter || operation.isSwap) return false;
  const parent = source.parentNode;
  if (!parent || parent !== target.parentNode) return false;
  if (parent.nodeType && parent.nodeType !== "CON") return false;
  return isHSplit(parent) || isVSplit(parent);
}

/**
 * @param {unknown} meta
 * @param {(m: unknown) => {width:number,height:number}} getMin
 */
function minsOf(meta, getMin) {
  try {
    const m = getMin(meta) || { width: 0, height: 0 };
    return {
      width: Number(m.width) > 0 ? Number(m.width) : 0,
      height: Number(m.height) > 0 ? Number(m.height) : 0,
    };
  } catch (_e) {
    return { width: 0, height: 0 };
  }
}

/**
 * Max min-size across a window or tab/stack group's members.
 * @param {object|null|undefined} node
 * @param {(m: unknown) => {width:number,height:number}} [getMin]
 * @returns {{ width: number, height: number }}
 */
export function unitMins(node, getMin = readWindowMinSize) {
  if (!node) return { width: 0, height: 0 };
  if (isGrouped(node)) {
    let width = 0;
    let height = 0;
    for (const child of node.childNodes || []) {
      const m = unitMins(child, getMin);
      if (m.width > width) width = m.width;
      if (m.height > height) height = m.height;
    }
    return { width, height };
  }
  if (node.nodeValue) return minsOf(node.nodeValue, getMin);
  return { width: 0, height: 0 };
}

function exceeds(min, size) {
  return min > 0 && size > 0 && min > size;
}

/**
 * True when the drop would leave any involved app below its min.
 * Involved = dragged + destination window/group. Zero mins → false.
 *
 * @param {object|null|undefined} source dragged WINDOW node
 * @param {object|null|undefined} target WINDOW node under pointer (or null for empty-mon)
 * @param {object|null|undefined} operation from _buildDropOperation
 * @param {object} [ctx] must include targetRect for tile drops; workArea for empty-mon
 * @param {(m: unknown) => {width:number,height:number}} [getMin]
 * @returns {boolean}
 */
export function dropWouldOverflowMins(
  source,
  target,
  operation,
  ctx = {},
  getMin = readWindowMinSize
) {
  if (!source || !operation) return false;
  const drag = unitMins(source, getMin);
  const destUnit =
    operation.shouldWrapTargetCon && isGrouped(target?.parentNode)
      ? target.parentNode
      : isGrouped(target?.parentNode) && operation.isCenter
      ? target.parentNode
      : target;
  const dest = unitMins(destUnit, getMin);
  if (drag.width <= 0 && drag.height <= 0 && dest.width <= 0 && dest.height <= 0) {
    return false;
  }

  // Empty-mon: full work area must fit dragged mins.
  if (ctx.emptyMonitor && ctx.workArea) {
    const wa = ctx.workArea;
    const w = Number(wa.width) || 0;
    const h = Number(wa.height) || 0;
    return exceeds(drag.width, w) || exceeds(drag.height, h);
  }

  const slot = ctx.targetRect || operation.previewRect;
  if (!slot) return false;
  const slotW = Number(slot.width) || 0;
  const slotH = Number(slot.height) || 0;
  if (!(slotW > 0) || !(slotH > 0)) return false;

  // CENTER / swap / tab join: everyone shares the full pane.
  if (operation.isCenter || operation.isSwap) {
    return (
      exceeds(drag.width, slotW) ||
      exceeds(drag.height, slotH) ||
      exceeds(dest.width, slotW) ||
      exceeds(dest.height, slotH)
    );
  }

  // Edge split: ~half on the split axis; full size on the cross axis.
  const horizontal = !!operation.isHorizontal;
  if (horizontal) {
    const halfW = slotW / 2;
    return (
      exceeds(drag.width, halfW) ||
      exceeds(dest.width, halfW) ||
      exceeds(drag.height, slotH) ||
      exceeds(dest.height, slotH)
    );
  }

  const halfH = slotH / 2;
  return (
    exceeds(drag.height, halfH) ||
    exceeds(dest.height, halfH) ||
    exceeds(drag.width, slotW) ||
    exceeds(dest.width, slotW)
  );
}

function isMonNode(node) {
  return !!(node && (node.nodeType === "MONITOR" || node.isMonitor?.()));
}

function splitAxis(parent) {
  if (isVSplit(parent) || parent?.layout === "STACKED" || parent?.isStacked?.()) return "v";
  return "h";
}

function childIndex(parent, child) {
  const kids = parent?.childNodes;
  if (!Array.isArray(kids)) return -1;
  return kids.indexOf(child);
}

/** @param {object|null|undefined} parent @param {number} srcIdx @param {number} tgtIdx */
function dirFromIndices(parent, srcIdx, tgtIdx) {
  if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return null;
  if (splitAxis(parent) === "v") return srcIdx < tgtIdx ? "down" : "up";
  return srcIdx < tgtIdx ? "right" : "left";
}

function nodeRect(node) {
  return node?.renderRect || node?.rect || node?.nodeValue?.get_frame_rect?.() || null;
}

/** @param {object} source @param {object} target */
function dirFromGeometry(source, target) {
  const a = nodeRect(source);
  const b = nodeRect(target);
  if (!a || !b) return null;
  const ax = (Number(a.x) || 0) + (Number(a.width) || 0) / 2;
  const ay = (Number(a.y) || 0) + (Number(a.height) || 0) / 2;
  const bx = (Number(b.x) || 0) + (Number(b.width) || 0) / 2;
  const by = (Number(b.y) || 0) + (Number(b.height) || 0) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

function monitorOf(node) {
  let n = node;
  while (n) {
    if (isMonNode(n)) return n;
    n = n.parentNode;
  }
  return null;
}

function isAdjacentSibling(parent, source, target, dir) {
  const i = childIndex(parent, source);
  const j = childIndex(parent, target);
  if (i < 0 || j < 0) return false;
  if (dir === "left" || dir === "up") return j === i - 1;
  if (dir === "right" || dir === "down") return j === i + 1;
  return false;
}

function edgeDir(operation) {
  if (operation?.isCenter) return null;
  if (operation.isHorizontal) return operation.isBefore ? "left" : "right";
  return operation.isBefore ? "up" : "down";
}

/**
 * Adjacent H/V CON siblings: SWAP is Mark 2 Move (in-axis neighbor swap).
 * MONITOR parent stays Host swapPairs (max-1 wrap would change the live tree).
 * TAB/STACK in-axis is left/right; splitAxis would pick up/down for STACKED.
 *
 * @param {object} source
 * @param {object} target
 * @returns {{ op: "move", dir: "left"|"right"|"up"|"down" }|null}
 */
function resolveSwapAsMove(source, target) {
  const srcParent = source.parentNode;
  if (!srcParent || srcParent !== target.parentNode) return null;
  if (isMonNode(srcParent) || isGrouped(srcParent)) return null;
  if (!(isHSplit(srcParent) || isVSplit(srcParent))) return null;
  const dir =
    dirFromIndices(srcParent, childIndex(srcParent, source), childIndex(srcParent, target)) ||
    dirFromGeometry(source, target);
  if (!dir || !isAdjacentSibling(srcParent, source, target, dir)) return null;
  return { op: "move", dir };
}

/**
 * Map a built drop onto Mark 2 Join/Move when the product tree matches.
 * Null = named Host SurfaceOp (`resolveDropSurface`) or empty-mon.
 *
 * @param {object|null|undefined} source dragged WINDOW
 * @param {object|null|undefined} target WINDOW under the pointer
 * @param {object|null|undefined} operation from _buildDropOperation
 * @param {object} [ctx]
 * @returns {{ op: "join"|"move", dir: "left"|"right"|"up"|"down" }|null}
 */
export function resolveDropMark2(source, target, operation, ctx = {}) {
  if (!source || !target || !operation) return null;
  if (source === target) return null;
  if (operation.shouldWrapTargetCon || operation.shouldDetachWindow) return null;
  if (operation.shouldCreateCon) return null;
  if (ctx.emptyMonitor) return null;

  const srcMon = monitorOf(source);
  const tgtMon = monitorOf(target);
  if (srcMon && tgtMon && srcMon !== tgtMon) return null;

  const srcParent = source.parentNode;
  const tgtParent = target.parentNode;
  if (!srcParent || !tgtParent) return null;

  if (operation.isSwap) return resolveSwapAsMove(source, target);

  if (operation.isCenter) {
    const group = tgtParent;
    // MONITOR parent: wrapMonitorMax1 would wrap every live mon child first.
    if (isGrouped(group) && srcParent === group.parentNode && !isMonNode(srcParent)) {
      const dir =
        dirFromIndices(srcParent, childIndex(srcParent, source), childIndex(srcParent, group)) ||
        dirFromGeometry(source, group);
      if (dir && isAdjacentSibling(srcParent, source, group, dir)) {
        return { op: "join", dir };
      }
    }
    return null;
  }

  if (srcParent !== tgtParent) return null;
  if (isMonNode(srcParent)) return null;
  const dir = edgeDir(operation);
  if (!dir) return null;
  const wantH = !!operation.isHorizontal;
  if ((splitAxis(srcParent) === "h") !== wantH) return null;
  if (!isAdjacentSibling(srcParent, source, target, dir)) return null;
  return { op: "move", dir };
}

/**
 * Named Host SurfaceOp for a drop Mark 2 does not own.
 * Catalog names only: swapPairs / group / slotSplit / split / wrap / insert.
 *
 * @param {object|null|undefined} source
 * @param {object|null|undefined} target
 * @param {object|null|undefined} operation
 * @param {object} [ctx]
 * @returns {{ op: "swapPairs"|"group"|"slotSplit"|"split"|"wrap"|"insert"|"emptyMonitorDrop" }|null}
 */
export function resolveDropSurface(source, target, operation, ctx = {}) {
  if (!source || !operation) return null;
  if (ctx.emptyMonitor) return { op: "emptyMonitorDrop" };
  if (!target || source === target) return null;
  if (operation.isSwap) return { op: "swapPairs" };
  if (shouldMergeCenterGroup(source, target, operation)) return { op: "group" };
  if (operation.shouldWrapTargetCon) return { op: "slotSplit" };
  if (operation.shouldDetachWindow) return { op: "split" };
  if (operation.shouldCreateCon) return { op: "wrap" };
  return { op: "insert" };
}

/**
 * True when swapping two window nodes would put either below its min
 * in the other's slot rect.
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @param {(m:any)=>{width:number,height:number}} [getMin]
 */
export function swapWouldOverflowMins(a, b, getMin = readWindowMinSize) {
  if (!a || !b) return false;
  const minA = unitMins(a, getMin);
  const minB = unitMins(b, getMin);
  if (minA.width <= 0 && minA.height <= 0 && minB.width <= 0 && minB.height <= 0) {
    return false;
  }
  const rectA = a.renderRect || a.rect || a.nodeValue?.get_frame_rect?.();
  const rectB = b.renderRect || b.rect || b.nodeValue?.get_frame_rect?.();
  if (!rectA || !rectB) return false;
  const aw = Number(rectA.width) || 0;
  const ah = Number(rectA.height) || 0;
  const bw = Number(rectB.width) || 0;
  const bh = Number(rectB.height) || 0;
  // A moves into B's slot; B into A's.
  return (
    exceeds(minA.width, bw) ||
    exceeds(minA.height, bh) ||
    exceeds(minB.width, aw) ||
    exceeds(minB.height, ah)
  );
}
