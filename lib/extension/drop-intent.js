/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure drop mins helpers. Zone→op policy lives in OpSet.pointer (D101).
 */

import { readWindowMinSize } from "./tree-layout.js";

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
 * Empty-mon uses workArea; tile uses operation/preview slot (legacy preview).
 *
 * @param {object|null|undefined} source dragged WINDOW node
 * @param {object|null|undefined} target WINDOW node under pointer (or null for empty-mon)
 * @param {object|null|undefined} operation preview/commit context flags
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
