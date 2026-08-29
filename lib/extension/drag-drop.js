/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Gnome imports
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";
import { assert, assertionFailed } from "../shared/assert.js";

// App imports
import * as Utils from "./utils.js";
import { DROP_ZONES, isHorizontalZone, isBeforeZone } from "./utils.js";
import {
  buildDropZones,
  hitTestDropZone,
  zonePaintRect,
  zonePaintRects,
  PAINT_ZONE_ORDER,
} from "./drop-zones.js";
import {
  dropChangesStructure,
  dropWouldOverflowMins,
  resolveDropMark2,
  shouldMergeCenterGroup,
} from "./drop-intent.js";
import { runMark2 } from "./forest-run.js";
import { Node, LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree.js";
import { WINDOW_MODES, GRAB_TYPES } from "./window.js";
import * as Compat from "./compat.js";
import { safeMoveToMonitor } from "./monitor-recovery.js";

/** Hard cap: preview actors must never outlive a stuck drag (ms). */
const PREVIEW_HINT_FAILSAFE_MS = 4000;

/** Light outline fill for non-hovered zones during drag. */
const ZONE_PREVIEW_CLASS = "window-tilepreview-zone";

/** Primary-tab press → move-grab only after this many pixels of travel. */
export const TAB_DRAG_THRESHOLD_PX = 8;

/**
 * Pure: whether pointer travel from press origin exceeds the tab-drag threshold.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} [threshold=TAB_DRAG_THRESHOLD_PX]
 * @returns {boolean}
 */
export function tabDragExceededThreshold(x0, y0, x1, y1, threshold = TAB_DRAG_THRESHOLD_PX) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy >= threshold * threshold;
}

/** Strip hit slop so slight drift still counts as on-strip. */
const TAB_STRIP_HIT_PAD_PX = 4;

/** Sibling slide duration while REORDER preview updates (ms). */
export const TAB_REORDER_SLIDE_MS = 150;

/** Product default when min-tab-label-chars is unavailable (matches schema after PR5). */
const TAB_DRAG_CHIP_MIN_CHARS_DEFAULT = 20;

const TAB_PRESSED_CLASS = "window-tabbed-tab-pressed";
const TAB_DRAGGING_CLASS = "window-tabbed-tab-dragging";

/**
 * Pure: pointer coordinate along a strip axis.
 * @param {number|{x?:number,y?:number}|number[]|null|undefined} pointer
 * @param {"x"|"y"} axis
 * @returns {number}
 */
function _pointerAlongAxis(pointer, axis) {
  if (pointer == null) return 0;
  if (typeof pointer === "number") return pointer;
  if (Array.isArray(pointer)) {
    return axis === "y" ? Number(pointer[1]) || 0 : Number(pointer[0]) || 0;
  }
  if (axis === "y") return Number(pointer.y) || 0;
  return Number(pointer.x) || 0;
}

/**
 * Pure: [start, end) along axis for a tab segment or rect.
 * @param {{start?:number,end?:number,x?:number,y?:number,width?:number,height?:number}|null} tab
 * @param {"x"|"y"} axis
 * @returns {{start:number,end:number}|null}
 */
function _tabSegment(tab, axis) {
  if (!tab) return null;
  if (typeof tab.start === "number" && typeof tab.end === "number") {
    return { start: tab.start, end: tab.end };
  }
  if (axis === "y") {
    const start = Number(tab.y) || 0;
    const end = start + (Number(tab.height) || 0);
    return { start, end };
  }
  const start = Number(tab.x) || 0;
  const end = start + (Number(tab.width) || 0);
  return { start, end };
}

/**
 * Pure: insert index for strip reorder from pointer along axis.
 * Index is the slot to insert before (0..tabs.length); midpoint rule.
 * TABBED uses axis `"x"`; STACKED uses `"y"`.
 *
 * @param {{
 *   tabs: Array<{start?:number,end?:number,x?:number,y?:number,width?:number,height?:number}>,
 *   pointer: number|{x?:number,y?:number}|number[],
 *   axis?: "x"|"y",
 * }} opts
 * @returns {number}
 */
export function tabStripInsertIndex({ tabs, pointer, axis = "x" } = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (list.length === 0) return 0;
  const ax = axis === "y" ? "y" : "x";
  const coord = _pointerAlongAxis(pointer, ax);
  for (let i = 0; i < list.length; i++) {
    const seg = _tabSegment(list[i], ax);
    if (!seg) continue;
    const mid = (seg.start + seg.end) / 2;
    if (coord < mid) return i;
  }
  return list.length;
}

/**
 * Pure: gap insert-before among remaining siblings from pointer × center.
 * Scoot when the pointer crosses a sibling center (PR15). `dragDirection` is
 * accepted for callers but does not change the index (no edge hysteresis).
 * Chip is unused for the index; pass `pointer` (chip center is the fallback).
 *
 * @param {{
 *   tabs?: Array<{start?:number,end?:number,x?:number,y?:number,width?:number,height?:number,skip?:boolean}>,
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   pointer?: number|{x?:number,y?:number}|number[]|null,
 *   axis?: "x"|"y",
 *   dragDirection?: number,
 * }} [opts]
 * @returns {{ index: number }} insert-before in 0..tabs.length (remaining)
 */
export function tabStripGapFromFloatingChip({
  tabs,
  chip,
  pointer = null,
  axis = "x",
  dragDirection: _dragDirection = 1,
} = {}) {
  const list = (Array.isArray(tabs) ? tabs : []).filter((t) => t && !t.skip);
  if (list.length === 0) return { index: 0 };
  const ax = axis === "y" ? "y" : "x";

  let coord;
  if (pointer != null) {
    coord = _pointerAlongAxis(pointer, ax);
  } else if (chip) {
    // No pointer: chip center (not leading edge) so index 0 stays reachable.
    if (ax === "y") {
      coord = (Number(chip.y) || 0) + (Number(chip.height) || 0) / 2;
    } else {
      coord = (Number(chip.x) || 0) + (Number(chip.width) || 0) / 2;
    }
  } else {
    coord = 0;
  }

  for (let i = 0; i < list.length; i++) {
    const seg = _tabSegment(list[i], ax);
    if (!seg) continue;
    const center = (seg.start + seg.end) / 2;
    if (coord < center) return { index: i };
  }
  return { index: list.length };
}

/**
 * Pure: map remaining-list gap index + fromIndex → applyTabStripReorder insertIndex.
 * @param {number} fromIndex dragged index in full child list
 * @param {number} gapIndex insert-before among remaining (0..n-1 remaining)
 * @returns {number}
 */
export function tabStripInsertIndexFromGap(fromIndex, gapIndex) {
  const from = Number(fromIndex);
  const gap = Number(gapIndex);
  if (!(gap >= 0)) return 0;
  if (!(from >= 0)) return gap;
  return gap < from ? gap : gap + 1;
}

/**
 * Pure: pack remaining tab sizes along axis with a chip-sized gap at gapIndex.
 * @param {{
 *   sizes: number[],
 *   gapIndex: number,
 *   chipSize: number,
 *   origin?: number,
 * }} opts
 * @returns {Array<{ start: number, end: number }>}
 */
export function tabStripFlowLayoutWithGap({ sizes, gapIndex, chipSize, origin = 0 } = {}) {
  const list = Array.isArray(sizes) ? sizes : [];
  const gapAt = Math.max(0, Math.min(list.length, Number(gapIndex) || 0));
  const gap = Math.max(0, Number(chipSize) || 0);
  let cursor = Number(origin) || 0;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (i === gapAt) cursor += gap;
    const size = Math.max(0, Number(list[i]) || 0);
    out.push({ start: cursor, end: cursor + size });
    cursor += size;
  }
  if (gapAt >= list.length) cursor += gap;
  return out;
}

/**
 * Pure: equal-fill sizes for remaining tabs with a reserved chip-sized gap.
 * Gap is not included in returned sizes; sum(sizes) === max(0, available − chipSize).
 * @param {{
 *   count: number,
 *   available: number,
 *   chipSize?: number,
 * }} opts
 * @returns {number[]}
 */
export function tabStripEqualFillSizesWithGap({ count, available, chipSize = 0 } = {}) {
  const n = Math.max(0, Number(count) | 0);
  if (n === 0) return [];
  const avail = Math.max(0, Math.round(Number(available) || 0));
  const chip = Math.max(0, Math.round(Number(chipSize) || 0));
  const space = Math.max(0, avail - chip);
  const base = Math.floor(space / n);
  let rem = space - base * n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem--;
    out[i] = base + extra;
  }
  return out;
}

/**
 * @param {{x?:number,y?:number,width?:number,height?:number,skip?:boolean}|null|undefined} t
 * @returns {boolean}
 */
function _tabSlotIsReal(t) {
  if (!t) return false;
  const w = Number(t.width) || 0;
  const h = Number(t.height) || 0;
  return w > 0 && h > 0;
}

/**
 * Child-list slots for 2D: never compact; missing/zero → placeholder with inherited Y.
 * @param {Array<{x?:number,y?:number,width?:number,height?:number,skip?:boolean}|null|undefined>} tabs
 * @param {{y?:number,height?:number}|null|undefined} decoration
 * @returns {Array<{x:number,y:number,width:number,height:number,skip:boolean}>}
 */
function _normalizeTabSlots2D(tabs, decoration) {
  const list = Array.isArray(tabs) ? tabs : [];
  const n = list.length;
  /** @type {Array<{x:number,y:number,width:number,height:number,skip:boolean}>} */
  const slots = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = list[i];
    if (_tabSlotIsReal(t)) {
      slots[i] = {
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        width: Number(t.width) || 0,
        height: Number(t.height) || 0,
        skip: !!t.skip,
      };
    } else {
      slots[i] = null;
    }
  }
  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    let y = null;
    let height = null;
    if (i > 0 && slots[i - 1]) {
      y = slots[i - 1].y;
      height = slots[i - 1].height;
    } else {
      for (let j = i + 1; j < n; j++) {
        if (slots[j]) {
          y = slots[j].y;
          height = slots[j].height;
          break;
        }
        if (_tabSlotIsReal(list[j])) {
          y = Number(list[j].y) || 0;
          height = Number(list[j].height) || 0;
          break;
        }
      }
      if (y == null && decoration && Number(decoration.height) > 0) {
        y = Number(decoration.y) || 0;
        height = Number(decoration.height) || 0;
      }
    }
    // Never invent a top-of-stage band when real geometry is known above.
    if (y == null) {
      y = 0;
      height = 1;
    }
    const prev = i > 0 ? slots[i - 1] : null;
    const x = prev ? prev.x + prev.width : 0;
    slots[i] = {
      x,
      y,
      width: 1,
      height: Math.max(1, height || 1),
      skip: true,
    };
  }
  return slots;
}

/**
 * Greedy Y-band rows (sort by y, join on >half smaller-height overlap).
 * @param {Array<{y:number,height:number}>} slots
 * @returns {Array<{ indices: number[], minY: number, maxY: number }>}
 */
function _clusterTabRows2D(slots) {
  const n = slots.length;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => {
    const dy = slots[a].y - slots[b].y;
    if (dy !== 0) return dy;
    return a - b;
  });
  /** @type {Array<{ indices: number[], minY: number, maxY: number }>} */
  const rows = [];
  for (const i of order) {
    const s = slots[i];
    const sy = s.y;
    const sh = Math.max(1, s.height);
    const sEnd = sy + sh;
    let joined = false;
    for (const row of rows) {
      const bandH = Math.max(1, row.maxY - row.minY);
      const overlap = Math.min(row.maxY, sEnd) - Math.max(row.minY, sy);
      const smaller = Math.min(sh, bandH);
      if (overlap > smaller / 2) {
        row.indices.push(i);
        row.minY = Math.min(row.minY, sy);
        row.maxY = Math.max(row.maxY, sEnd);
        joined = true;
        break;
      }
    }
    if (!joined) {
      rows.push({ indices: [i], minY: sy, maxY: sEnd });
    }
  }
  rows.sort((a, b) => a.minY - b.minY || a.indices[0] - b.indices[0]);
  for (const row of rows) {
    row.indices.sort((a, b) => a - b);
  }
  return rows;
}

/**
 * Map remaining-list gap (skip-filtered) → insert-before in full row slots.
 * @param {Array<{skip?:boolean}>} rowSlots
 * @param {number} remainingGap
 * @returns {number}
 */
function _rowLocalFromRemainingGap(rowSlots, remainingGap) {
  const gap = Math.max(0, Number(remainingGap) || 0);
  let seen = 0;
  let anyReal = false;
  for (let i = 0; i < rowSlots.length; i++) {
    if (rowSlots[i]?.skip) continue;
    anyReal = true;
    if (seen === gap) return i;
    seen++;
  }
  // All placeholders (e.g. single dragged on empty row band): stay at 0.
  if (!anyReal) return 0;
  return rowSlots.length;
}

/**
 * Pure: TABBED multi-row insert-before via row pick + pointer×center gap.
 * `tabs` is one entry per childNodes slot (never compact). STACKED must use
 * `tabStripGapFromFloatingChip({ axis: "y" })` instead — never call this.
 *
 * @param {{
 *   tabs?: Array<{x?:number,y?:number,width?:number,height?:number,skip?:boolean}|null|undefined>,
 *   pointer?: number|{x?:number,y?:number}|number[],
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   dragDirection?: number,
 *   decoration?: {y?:number,height?:number,x?:number,width?:number}|null,
 * }} [opts]
 * @returns {{ index: number }}
 */
export function tabStripInsertIndex2D({
  tabs,
  pointer,
  chip,
  dragDirection = 1,
  decoration = null,
} = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (list.length === 0) return { index: 0 };

  const slots = _normalizeTabSlots2D(list, decoration);
  const rows = _clusterTabRows2D(slots);
  if (rows.length === 0) return { index: 0 };

  // Row pick: pointer Y when present, else chip center Y.
  let pickY;
  if (pointer != null) {
    pickY = _pointerAlongAxis(pointer, "y");
  } else if (chip) {
    pickY = (Number(chip.y) || 0) + (Number(chip.height) || 0) / 2;
  } else {
    pickY = 0;
  }

  let picked = null;
  for (const row of rows) {
    if (pickY >= row.minY && pickY <= row.maxY) {
      picked = row;
      break;
    }
  }
  if (!picked) {
    let best = Infinity;
    for (const row of rows) {
      let dist = 0;
      if (pickY < row.minY) dist = row.minY - pickY;
      else if (pickY > row.maxY) dist = pickY - row.maxY;
      if (dist < best) {
        best = dist;
        picked = row;
      }
    }
  }
  if (!picked) return { index: 0 };

  const rowSlots = picked.indices.map((i) => slots[i]);
  const { index: remainingLocal } = tabStripGapFromFloatingChip({
    tabs: rowSlots,
    chip,
    pointer,
    axis: "x",
    dragDirection,
  });
  const rowLocal = _rowLocalFromRemainingGap(rowSlots, remainingLocal);

  let above = 0;
  for (const row of rows) {
    if (row === picked) break;
    above += row.indices.length;
  }
  return { index: above + rowLocal };
}

/**
 * Pure: reorder `children` moving `fromIndex` to land at `insertIndex`
 * (insert-before index in the pre-remove array).
 * @param {any[]} children
 * @param {number} fromIndex
 * @param {number} insertIndex
 * @returns {any[]}
 */
export function applyTabStripReorder(children, fromIndex, insertIndex) {
  const next = Array.isArray(children) ? children.slice() : [];
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const [item] = next.splice(fromIndex, 1);
  let to = insertIndex;
  if (to > fromIndex) to -= 1;
  if (to < 0) to = 0;
  if (to > next.length) to = next.length;
  next.splice(to, 0, item);
  return next;
}

/**
 * Pure: insert-before index on a foreign strip (no dragged hole).
 * TABBED uses 2D + chip centerline; STACKED uses Y-axis chip gap only.
 * @param {{
 *   tabs?: Array<{x?:number,y?:number,width?:number,height?:number}|null|undefined>,
 *   pointer?: number|{x?:number,y?:number}|number[],
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   dragDirection?: number,
 *   axis?: "x"|"y",
 *   decoration?: {y?:number,height?:number,x?:number,width?:number}|null,
 * }} [opts]
 * @returns {{ index: number }}
 */
export function foreignStripInsertIndex({
  tabs,
  pointer,
  chip,
  dragDirection = 1,
  axis = "x",
  decoration = null,
} = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (axis === "y") {
    return tabStripGapFromFloatingChip({
      tabs: list,
      chip,
      pointer,
      axis: "y",
      dragDirection,
    });
  }
  return tabStripInsertIndex2D({
    tabs: list,
    pointer,
    chip,
    dragDirection,
    decoration,
  });
}

/**
 * Pure: whether any part of the chip overlaps the strip-band AABB (+ pad).
 * @param {{
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   tabs?: Array<{x?:number,y?:number,width?:number,height?:number}|null|undefined>,
 *   pad?: number,
 * }} [opts]
 * @returns {boolean}
 */
export function chipIntersectsTabStrip({ chip, tabs, pad = TAB_STRIP_HIT_PAD_PX } = {}) {
  if (!chip) return false;
  const list = (Array.isArray(tabs) ? tabs : []).filter(
    (r) => r && (Number(r.width) > 0 || Number(r.height) > 0)
  );
  if (list.length === 0) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of list) {
    const x = Number(r.x) || 0;
    const y = Number(r.y) || 0;
    const w = Number(r.width) || 0;
    const h = Number(r.height) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  const cx = Number(chip.x) || 0;
  const cy = Number(chip.y) || 0;
  const cw = Math.max(0, Number(chip.width) || 0);
  const ch = Math.max(0, Number(chip.height) || 0);
  const p = Number(pad) || 0;
  return cx < maxX + p && cx + cw > minX - p && cy < maxY + p && cy + ch > minY - p;
}

/**
 * Pure: first strip whose band intersects the chip (any overlap).
 * @param {{
 *   strips?: Array<{group?:any,rects?:any[]}|null|undefined>,
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   excludeGroup?: any,
 *   pad?: number,
 * }} [opts]
 * @returns {any|null} strip.group
 */
export function findTabStripIntersectingChip({
  strips,
  chip,
  excludeGroup = null,
  pad = TAB_STRIP_HIT_PAD_PX,
} = {}) {
  const list = Array.isArray(strips) ? strips : [];
  for (const s of list) {
    if (!s || s.group == null || s.group === excludeGroup) continue;
    if (chipIntersectsTabStrip({ chip, tabs: s.rects, pad })) return s.group;
  }
  return null;
}

/**
 * Pure: first foreign strip whose rect union contains the pointer.
 * Pointer is treated as a 1×1 chip (titlebar / no-float path).
 * @param {{
 *   strips?: Array<{group?:any,rects?:any[]}|null|undefined>,
 *   pointer?: {x?:number,y?:number}|number[],
 *   excludeGroup?: any,
 *   pad?: number,
 * }} [opts]
 * @returns {any|null} strip.group
 */
export function findForeignTabStripAtPointer({
  strips,
  pointer,
  excludeGroup = null,
  pad = TAB_STRIP_HIT_PAD_PX,
} = {}) {
  const [x, y] = _pointerXY(pointer);
  return findTabStripIntersectingChip({
    strips,
    chip: { x, y, width: 1, height: 1 },
    excludeGroup,
    pad,
  });
}

/**
 * Pure: [x, y] from a pointer array or object.
 * @param {number|{x?:number,y?:number}|number[]|null|undefined} pointer
 * @returns {[number, number]}
 */
function _pointerXY(pointer) {
  if (Array.isArray(pointer)) return [Number(pointer[0]) || 0, Number(pointer[1]) || 0];
  if (pointer && typeof pointer === "object") {
    return [Number(pointer.x) || 0, Number(pointer.y) || 0];
  }
  return [0, 0];
}

/** Pointer over the union of strip rects (optional pad). */
export function pointerOnTabStrip({ tabs, pointer, pad = TAB_STRIP_HIT_PAD_PX } = {}) {
  const list = (Array.isArray(tabs) ? tabs : []).filter(
    (r) => r && (Number(r.width) > 0 || Number(r.height) > 0)
  );
  if (list.length === 0) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of list) {
    const x = Number(r.x) || 0;
    const y = Number(r.y) || 0;
    const w = Number(r.width) || 0;
    const h = Number(r.height) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  const px = Array.isArray(pointer) ? Number(pointer[0]) || 0 : Number(pointer?.x) || 0;
  const py = Array.isArray(pointer) ? Number(pointer[1]) || 0 : Number(pointer?.y) || 0;
  const p = Number(pad) || 0;
  return px >= minX - p && px <= maxX + p && py >= minY - p && py <= maxY + p;
}

/**
 * Screen rect for a tab (or decoration) actor. Prefers transformed position.
 * @param {any} actor
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function tabActorScreenRect(actor) {
  if (!actor) return null;
  try {
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    if (typeof actor.get_transformed_position === "function") {
      const pos = actor.get_transformed_position();
      if (Array.isArray(pos) && pos.length >= 2) {
        x = Number(pos[0]) || 0;
        y = Number(pos[1]) || 0;
      }
    } else {
      x = Number(actor.x) || 0;
      y = Number(actor.y) || 0;
    }
    if (typeof actor.get_transformed_size === "function") {
      const size = actor.get_transformed_size();
      if (Array.isArray(size) && size.length >= 2) {
        width = Number(size[0]) || 0;
        height = Number(size[1]) || 0;
      }
    } else if (typeof actor.get_size === "function") {
      const size = actor.get_size();
      if (Array.isArray(size) && size.length >= 2) {
        width = Number(size[0]) || 0;
        height = Number(size[1]) || 0;
      }
    } else {
      width = Number(actor.width) || 0;
      height = Number(actor.height) || 0;
    }
    if (!(width > 0 || height > 0)) return null;
    return { x, y, width, height };
  } catch (_e) {
    return null;
  }
}

/**
 * Pure: TILE leaf eligible as a DnD drop target (any monitor on the active ws).
 * Excludes the dragged meta, GRAB_TILE, FLOAT, minimized, and dead wrappers.
 * @param {any} node tree WINDOW node
 * @param {any} [excludeMeta] Meta.Window being dragged
 * @returns {boolean}
 */
export function isEligibleDragDropTargetNode(node, excludeMeta = null) {
  if (!node?.nodeValue || node.nodeValue === excludeMeta) return false;
  if (node.isGrabTile?.() || node.mode === WINDOW_MODES.GRAB_TILE) return false;
  if (!node.isTile?.() && node.mode !== WINDOW_MODES.TILE) return false;
  try {
    if (node.nodeValue.minimized) return false;
  } catch (_e) {
    return false;
  }
  return Utils.isWindowAlive(node.nodeValue);
}

/**
 * Pure: Meta.Window list for sortedWindows / hit-test (workspace-wide, all mons).
 * @param {any[]} windowNodes WINDOW nodes under the active workspace
 * @param {any} [excludeMeta]
 * @returns {any[]}
 */
export function collectDragDropTargetMetaWindows(windowNodes, excludeMeta = null) {
  const list = Array.isArray(windowNodes) ? windowNodes : [];
  return list.filter((n) => isEligibleDragDropTargetNode(n, excludeMeta)).map((n) => n.nodeValue);
}

/**
 * Tree slot for a TILE drop target (renderRect → initRect → rect).
 * Prefer this over Meta frame for hit + zone paint: inactive tabs and some
 * Chrome Wayland clients keep a stale/tiny frame while the slot is full-size.
 * @param {any} node
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function dropTargetSlotRect(node) {
  if (!node) return null;
  const slot = node.renderRect || node.initRect || node.rect;
  if (slot && slot.width > 0 && slot.height > 0) return slot;
  return null;
}

/**
 * Hit / zone unit rect for a drop target.
 * During grab prefer the tree slot so a dragged live frame cannot mask the
 * destination and so zone paint matches the tile (not a lagging Meta frame).
 * @param {any} node
 * @param {any} metaWindow
 * @param {boolean} duringGrab
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function dropTargetHitRect(node, metaWindow, duringGrab) {
  if (duringGrab) {
    const slot = dropTargetSlotRect(node);
    if (slot) return slot;
  }
  try {
    return metaWindow?.get_frame_rect?.() ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Pure: when grab-tile has no TILE under the pointer, decide whether to rehome
 * onto the pointer's monitor (empty mon or gap). R012 blocks mid-drag rehome,
 * so grab-end must own this — otherwise commitLayout snaps the window back.
 *
 * @param {{
 *   hasWindowTarget: boolean,
 *   pointerMonIndex: number,
 *   sourceTreeMonIndex: number,
 * }} p
 * @returns {{ destMonIndex: number } | null}
 */
export function resolveEmptyMonitorDrop(p) {
  if (!p || p.hasWindowTarget) return null;
  const dest = p.pointerMonIndex;
  const src = p.sourceTreeMonIndex;
  if (typeof dest !== "number" || dest < 0) return null;
  if (typeof src !== "number" || src < 0) return null;
  if (dest === src) return null;
  return { destMonIndex: dest };
}

/**
 * @param {any} event Clutter.Event-like
 * @returns {[number, number] | null}
 */
function _eventCoords(event) {
  if (!event || typeof event.get_coords !== "function") return null;
  try {
    const coords = event.get_coords();
    if (Array.isArray(coords) && coords.length >= 2) {
      // GJS: [x, y]. Some bindings may yield [ok, x, y].
      if (coords.length >= 3 && typeof coords[0] === "boolean") {
        return [coords[1], coords[2]];
      }
      return [coords[0], coords[1]];
    }
  } catch (_e) {
    // finalized event
  }
  return null;
}

/**
 * DragDropManager owns grab-tile / drag-drop tiling for WindowManager.
 * Shared grab state (grabOp, _draggedNodeWindow, _grabStartPointer, nodeWinAtPointer,
 * freeze/unfreeze) stays on WM and is read LIVE via this._extWm. Cross-calls go
 * through this._extWm so unit spies on WindowManager still intercept.
 */
export class DragDropManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./tree.js').Tree} */
  _tree;

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /** @type {null | {
   *   metaWindow: any,
   *   startX: number,
   *   startY: number,
   *   started: boolean,
   *   synthetic: boolean,
   *   grabOp: any,
   *   stageIds: number[],
   * }} */
  _tabDrag = null;

  /** Stage-tracked pointer while a real Mutter titlebar/CSD move grab is live. */
  _grabPointerTrack = null;

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
    this._foreignStrip = null;
    this._foreignStripCommit = null;
    this._originStripCommit = null;
    this._syntheticDragPointer = null;
  }

  swapWindowsUnderPointer(focusNodeWindow) {
    const wm = this._extWm;
    // Bug #354 fix: Validate nodes before swap
    if (!focusNodeWindow || !focusNodeWindow.nodeValue) {
      Logger.warn("swapWindowsUnderPointer: invalid focusNodeWindow");
      return;
    }
    let nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    if (!nodeWinAtPointer || !nodeWinAtPointer.nodeValue) {
      return;
    }
    if (!focusNodeWindow.parentNode || !nodeWinAtPointer.parentNode) {
      Logger.warn("swapWindowsUnderPointer: missing parent node");
      return;
    }
    this._tree.swapPairs(focusNodeWindow, nodeWinAtPointer);
  }

  /**
   * Execute a drop operation, modifying the tree structure.
   *
   * @param {Object} focusNodeWindow - The window node being dragged
   * @param {Object} operation - The drop operation object from _buildDropOperation
   * @param {Object} nodeWinAtPointer - The target window node under the pointer
   * @param {Object} ctx - Context with parent info (isMonParent, isConParent, centerLayout)
   */
  _executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx) {
    const wm = this._extWm;
    const { containerNode, referenceNode, isCenter, isHorizontal, isBefore } = operation;
    const { isConParent, centerLayout, parentNodeTarget, stackedOrTabbed } = ctx;
    Logger.trace(
      `dnd execute center=${!!isCenter} h=${!!isHorizontal} before=${!!isBefore} ` +
        `layout=${centerLayout || "-"} stackedOrTabbed=${!!stackedOrTabbed}`
    );

    const previousParent = focusNodeWindow.parentNode;
    // Slot-split wrap keeps the target's slot percent; do not zero dest first.
    if (!operation.shouldWrapTargetCon) {
      this._tree.resetSiblingPercent(containerNode);
      this._tree.resetSiblingPercent(previousParent);
    } else if (previousParent !== containerNode) {
      this._tree.resetSiblingPercent(previousParent);
    }

    // Bug #328 fix: Add try-catch around tab decoration removal
    if (focusNodeWindow.tab) {
      try {
        const decoParent = focusNodeWindow.tab.get_parent();
        if (decoParent) decoParent.remove_child(focusNodeWindow.tab);
      } catch (e) {
        Logger.warn(`Failed to remove tab decoration: ${e}`);
      }
    }

    if (operation.isSwap) {
      // M only — single C is grab-op-end commitLayout (AP2 StructureChanged).
      this._tree.swapPairs(referenceNode, focusNodeWindow);
    } else if (shouldMergeCenterGroup(focusNodeWindow, nodeWinAtPointer, operation)) {
      const layout = centerLayout === "STACKED" ? LAYOUT_TYPES.STACKED : LAYOUT_TYPES.TABBED;
      this._tree.mergeWindowsIntoGroup(focusNodeWindow, nodeWinAtPointer, layout);
    } else if (operation.shouldCreateCon) {
      const numWin = parentNodeTarget.childNodes.filter(
        (c) => c.nodeType === NODE_TYPES.WINDOW
      ).length;
      const numChild = parentNodeTarget.childNodes.length;
      const sameNumChild = numWin === numChild;

      let childNode;
      // Single-child CON: flip that CON's axis. Never reuse a MONITOR that
      // already has siblings — that flattens the new axis across them (R023).
      if (!isCenter && isConParent && numWin === 1 && sameNumChild) {
        childNode = parentNodeTarget;
      } else {
        childNode = new Node(NODE_TYPES.CON, new St.Bin());
        containerNode.insertBefore(childNode, referenceNode);
        childNode.appendChild(nodeWinAtPointer);
      }

      // Insert dragged window in correct position
      childNode.insertBefore(focusNodeWindow, isBefore ? nodeWinAtPointer : null);

      // Set layout based on edge direction
      if (isHorizontal) {
        childNode.layout = LAYOUT_TYPES.HSPLIT;
      } else if (!isCenter) {
        childNode.layout = LAYOUT_TYPES.VSPLIT;
      } else {
        childNode.layout = LAYOUT_TYPES[centerLayout];
      }
    } else if (operation.shouldWrapTargetCon) {
      // Tab/stack edge or D032 same-axis insert: wrap the target unit in place.
      const targetCon = referenceNode;
      const parent = containerNode;
      if (!targetCon || !parent || targetCon.parentNode !== parent) {
        Logger.warn("shouldWrapTargetCon: invalid target/parent");
      } else {
        const orientation = isHorizontal
          ? ORIENTATION_TYPES.HORIZONTAL
          : ORIENTATION_TYPES.VERTICAL;
        const wrap =
          this._tree.slotSplitUnit(targetCon, orientation) ||
          this._tree.split(targetCon, orientation, true);
        if (wrap) {
          if (isBefore) {
            wrap.insertBefore(focusNodeWindow, targetCon);
          } else {
            wrap.appendChild(focusNodeWindow);
          }
          this._tree.resetSiblingPercent(wrap);
        }
      }
    } else if (operation.shouldDetachWindow) {
      const orientation = isHorizontal ? ORIENTATION_TYPES.HORIZONTAL : ORIENTATION_TYPES.VERTICAL;
      this._tree.split(focusNodeWindow, orientation);
      containerNode.insertBefore(focusNodeWindow.parentNode, referenceNode);
    } else {
      // Simple insert without creating container
      containerNode.insertBefore(focusNodeWindow, referenceNode);
      if (isHorizontal) {
        containerNode.layout = LAYOUT_TYPES.HSPLIT;
      } else if (!isCenter) {
        if (!stackedOrTabbed) containerNode.layout = LAYOUT_TYPES.VSPLIT;
      } else if (containerNode.isHSplit() || containerNode.isVSplit()) {
        containerNode.layout = LAYOUT_TYPES[centerLayout];
      } else if (isCenter && containerNode.isStacked() && centerLayout === "TABBED") {
        // Join existing STACKED as TABBED when stack mode is off (or dnd prefers tabbed).
        containerNode.layout = LAYOUT_TYPES.TABBED;
      }
    }

    // Never leave a STACKED group after center drop when stack mode is disabled.
    if (
      isCenter &&
      !operation.isSwap &&
      !wm.ext.settings.get_boolean("stacked-tiling-mode-enabled")
    ) {
      const joined = focusNodeWindow.parentNode;
      if (joined && joined.isStacked()) {
        joined.layout = LAYOUT_TYPES.TABBED;
      }
    }

    previousParent.resetLayoutSingleChild();

    // D044: CENTER join lands on dest mon; Meta members follow group home.
    if (isCenter && !operation.isSwap) {
      const joined = focusNodeWindow.parentNode;
      if (joined?.isStackedOrTabbed?.()) {
        wm.normalizeGroupToHomeMonitor?.(joined);
      }
    }

    // Reset these flags on focusNodeWindow, not childNode — the two can differ.
    focusNodeWindow.createCon = false;
    focusNodeWindow.detachWindow = false;
  }

  /**
   * Destroy every live preview actor (node-owned + registry). Safe if already gone.
   * Call on grab end, disable, setting off, and failsafe timeout — never leave dim.
   */
  clearAllPreviewHints() {
    this._clearForeignStripPreview();
    const wm = this._extWm;
    wm._wmSources.cancel("previewHintFailsafe");
    const seen = new Set();
    const destroyActor = (actor) => {
      if (!actor || seen.has(actor)) return;
      seen.add(actor);
      try {
        actor.hide?.();
        if (global.window_group?.contains?.(actor)) {
          global.window_group.remove_child(actor);
        }
        actor.destroy?.();
      } catch (e) {
        Logger.warn(`clearAllPreviewHints: ${e}`);
      }
    };
    const destroyOne = (node) => {
      if (!node) return;
      if (node.previewZoneActors) {
        for (const a of Object.values(node.previewZoneActors)) {
          destroyActor(a);
        }
        node.previewZoneActors = null;
      }
      if (node.previewHint) {
        destroyActor(node.previewHint);
        node.previewHint = null;
      }
    };
    if (wm._draggedNodeWindow) destroyOne(wm._draggedNodeWindow);
    if (wm.allNodeWindows) {
      for (const n of wm.allNodeWindows) destroyOne(n);
    }
    if (wm._previewHintRegistry) {
      for (const actor of wm._previewHintRegistry) {
        destroyActor(actor);
      }
      wm._previewHintRegistry.clear();
    }
  }

  _armPreviewHintFailsafe() {
    const wm = this._extWm;
    // Never leave a dim overlay after a missed grab-end (Wayland/session ruin).
    // set replaces prior slot; fire → clearAll cancels already-cleared slot (miss OK).
    wm._wmSources.set("previewHintFailsafe", PREVIEW_HINT_FAILSAFE_MS, () => {
      this.clearAllPreviewHints();
    });
  }

  /**
   * Show the drop preview hint for a drag operation.
   *
   * @param {Object} focusNodeWindow - The window node being dragged
   * @param {Object} operation - The drop operation object with previewRect and previewClass
   */
  /**
   * Whether to paint drop-zone hints during a grab.
   * Setting on → always (while tiling). Setting off → only while tile mod held
   * (default Super), so operators can leave hints off and still Super-peek.
   */
  _previewHintsWanted() {
    const wm = this._extWm;
    try {
      if (wm.ext.settings.get_boolean("preview-hint-enabled")) return true;
    } catch (_e) {
      /* schema */
    }
    return this.allowDragDropTile();
  }

  /**
   * Create container + five zone bins on the dragged node (live path).
   * Tests may inject a single mock previewHint without zone children.
   */
  _ensurePreviewActors(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow) return null;
    if (focusNodeWindow.previewHint && focusNodeWindow.previewZoneActors) {
      return focusNodeWindow.previewHint;
    }
    if (focusNodeWindow.previewHint && !focusNodeWindow.previewZoneActors) {
      // Injected single-bin mock or legacy — keep as-is.
      return focusNodeWindow.previewHint;
    }
    try {
      // St.Widget hosts multiple zone bins; St.Bin is single-child only.
      const container = new St.Widget({ reactive: false, style_class: "" });
      global.window_group.add_child(container);
      focusNodeWindow.previewHint = container;
      const zoneActors = {};
      for (const z of PAINT_ZONE_ORDER) {
        const bin = new St.Bin({ reactive: false });
        container.add_child(bin);
        zoneActors[z] = bin;
      }
      focusNodeWindow.previewZoneActors = zoneActors;
      if (!wm._previewHintRegistry) wm._previewHintRegistry = new Set();
      wm._previewHintRegistry.add(container);
      return container;
    } catch (e) {
      Logger.warn(`_ensurePreviewActors: ${e}`);
      return null;
    }
  }

  _showDropPreview(focusNodeWindow, operation) {
    if (!this._previewHintsWanted()) {
      this.clearAllPreviewHints();
      return;
    }
    // Always ensure — callers must not depend on a prior tab peel warming actors.
    const previewHint = this._ensurePreviewActors(focusNodeWindow);
    if (!previewHint) return;
    if (!operation || !operation.previewRect) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }

    const zoneActors = focusNodeWindow.previewZoneActors;
    const dropZones = operation.dropZones;
    const paintRects = dropZones ? zonePaintRects(dropZones) : null;

    if (zoneActors && paintRects && dropZones?.unit) {
      const unit = dropZones.unit;
      previewHint.set_position(unit.x, unit.y);
      previewHint.set_size(unit.width, unit.height);
      previewHint.set_style_class_name?.("");
      const zoneOverflow = operation.zoneOverflow || null;
      for (const z of PAINT_ZONE_ORDER) {
        const actor = zoneActors[z];
        const rect = paintRects[z];
        if (!actor || !rect) continue;
        actor.set_position(rect.x - unit.x, rect.y - unit.y);
        actor.set_size(rect.width, rect.height);
        const hover = z === operation.zone;
        const invalid = !!(zoneOverflow && zoneOverflow[z]);
        // Invalid zones stay red even when not hovered (H/V/TAB checked apart).
        let style = ZONE_PREVIEW_CLASS;
        if (invalid) style = "window-tilepreview-invalid";
        else if (hover) style = operation.previewClass || ZONE_PREVIEW_CLASS;
        actor.set_style_class_name(style);
        // Raise hovered zone above siblings so emphasis is not occluded.
        if (
          hover &&
          typeof previewHint.remove_child === "function" &&
          typeof previewHint.add_child === "function"
        ) {
          try {
            previewHint.remove_child(actor);
            previewHint.add_child(actor);
          } catch (_e) {
            /* mock / finalized */
          }
        }
        actor.show?.();
      }
      previewHint.show();
    } else {
      // Single-bin path (unit tests inject mock without zone children).
      previewHint.set_style_class_name(operation.previewClass || "");
      previewHint.set_position(operation.previewRect.x, operation.previewRect.y);
      previewHint.set_size(operation.previewRect.width, operation.previewRect.height);
      previewHint.show();
    }
    this._armPreviewHintFailsafe();
  }

  _hidePreviewActors(focusNodeWindow) {
    if (!focusNodeWindow) return;
    if (focusNodeWindow.previewZoneActors) {
      for (const a of Object.values(focusNodeWindow.previewZoneActors)) {
        a.hide?.();
      }
    }
    focusNodeWindow.previewHint?.hide?.();
  }

  /**
   * Build a declarative drop operation object based on the zone and context.
   *
   * @param {string} zone - DROP_ZONES value
   * @param {Object} ctx - Context object containing:
   *   - nodeWinAtPointer: target window node
   *   - parentNodeTarget: parent container of target
   *   - horizontal: boolean, is parent horizontal layout
   *   - isMonParent: boolean, is parent a monitor node
   *   - stackedOrTabbed: boolean, is parent stacked or tabbed
   *   - centerLayout: string, center layout preference (SWAP/STACKED/TABBED)
   *   - previewRegions: regions for preview display
   *   - tree: tree reference for processGap
   * @returns {Object|null} Operation object or null if no valid operation
   */
  _buildDropOperation(zone, ctx) {
    const wm = this._extWm;
    const {
      nodeWinAtPointer,
      parentNodeTarget,
      horizontal,
      isMonParent,
      stackedOrTabbed,
      stacked,
      centerLayout,
      dropZones,
      targetRect,
    } = ctx;

    // Precompute zone characteristics for use in operation
    const isCenter = zone === DROP_ZONES.CENTER;
    const isHorizontal = isHorizontalZone(zone);
    const isBefore = isBeforeZone(zone);
    const edgePreviewRect = zonePaintRect(dropZones, zone) || targetRect;

    // Handle CENTER zone
    if (isCenter) {
      const baseOp = { zone, isCenter, isHorizontal, isBefore, dropZones };
      if (centerLayout === "SWAP") {
        return {
          ...baseOp,
          isSwap: true,
          referenceNode: nodeWinAtPointer,
          previewRect: targetRect,
          previewClass: wm._getDragDropCenterPreviewStyle(),
        };
      }
      if (stackedOrTabbed) {
        // When stack mode is off, joining a STACKED parent converts to TABBED —
        // preview must match (never show stacked if we will force tabbed).
        const showStacked =
          stacked &&
          centerLayout !== "TABBED" &&
          wm.ext.settings.get_boolean("stacked-tiling-mode-enabled");
        return {
          ...baseOp,
          containerNode: parentNodeTarget,
          referenceNode: null,
          previewRect: targetRect,
          previewClass: showStacked ? "window-tilepreview-stacked" : "window-tilepreview-tabbed",
        };
      }
      if (isMonParent) {
        return {
          ...baseOp,
          shouldCreateCon: true,
          containerNode: parentNodeTarget,
          referenceNode: nodeWinAtPointer,
          previewRect: targetRect,
          previewClass: wm._getDragDropCenterPreviewStyle(),
        };
      }
      // CON parent
      return {
        ...baseOp,
        containerNode: parentNodeTarget,
        referenceNode: null,
        previewRect: this._tree.processGap(parentNodeTarget),
        previewClass: wm._getDragDropCenterPreviewStyle(),
      };
    }

    // Edge drops share common patterns
    const baseEdgeOp = {
      zone,
      isCenter,
      isHorizontal,
      isBefore,
      dropZones,
      previewRect: edgePreviewRect,
      previewClass: "window-tilepreview-tiled",
    };

    // Stacked/tabbed: mon-direct windows peel via detach; CON groups wrap in place.
    if (stackedOrTabbed) {
      if (!isMonParent) {
        // Wrap the whole tab/stack CON + dragged into H/VSPLIT where the CON sat.
        // Old path inserted a mon-level sibling under HSPLIT → TOP/BOTTOM never VSPLIT.
        return {
          ...baseEdgeOp,
          shouldWrapTargetCon: true,
          containerNode: parentNodeTarget.parentNode,
          referenceNode: parentNodeTarget,
        };
      }
      return {
        ...baseEdgeOp,
        shouldDetachWindow: true,
        containerNode: parentNodeTarget,
        referenceNode: isBefore ? parentNodeTarget.firstChild : null,
      };
    }

    // Same-axis edge onto a 2+ sibling row: wrap the target unless this is a reorder.
    const dragged = ctx.focusNodeWindow;
    const sameParent = !!(dragged && dragged.parentNode === parentNodeTarget);
    const destHasSiblings = (parentNodeTarget.childNodes?.length ?? 0) >= 2;
    if (destHasSiblings && !sameParent && isHorizontal === horizontal) {
      return {
        ...baseEdgeOp,
        shouldWrapTargetCon: true,
        containerNode: parentNodeTarget,
        referenceNode: nodeWinAtPointer,
      };
    }

    // Normal container: create con when orientation doesn't match edge direction
    return {
      ...baseEdgeOp,
      shouldCreateCon: isHorizontal !== horizontal,
      containerNode: parentNodeTarget,
      referenceNode: isBefore ? nodeWinAtPointer : nodeWinAtPointer.nextSibling,
    };
  }

  /**
   * Effective dnd-center-layout for drop/preview. STACKED is forced to TABBED
   * when stacked tiling mode is disabled.
   */
  _resolveDndCenterLayout() {
    const wm = this._extWm;
    const raw = wm.ext.settings.get_string("dnd-center-layout") || "tabbed";
    const layout = raw.toUpperCase();
    if (layout === "STACKED" && !wm.ext.settings.get_boolean("stacked-tiling-mode-enabled")) {
      return "TABBED";
    }
    return layout;
  }

  /**
   * Handle previewing and applying where a drag-drop window is going to be tiled.
   */
  moveWindowToPointer(focusNodeWindow, preview = false) {
    const wm = this._extWm;
    // Early exits
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;
    if (!preview) {
      assert(
        !wm._draggedNodeWindow || wm._draggedNodeWindow === focusNodeWindow,
        "dnd-grab-owner",
        {
          windowId: focusNodeWindow?.nodeValue?.get_id?.() ?? focusNodeWindow?.nodeValue?.id,
        }
      );
      if (assertionFailed()) return;
      if (this._commitOriginStripReorder(focusNodeWindow)) return;
      const pointer = wm.getDragPointer(focusNodeWindow);
      // Last-motion chip∩strip stash survives disarm (pointer-only can miss).
      const dest =
        this._foreignStripCommit?.group ||
        this._hitTestForeignTabStrip(focusNodeWindow, pointer, this._chipRectFromPointer(pointer));
      if (dest) {
        this._clearForeignStripPreview();
        if (this._commitForeignStripJoin(focusNodeWindow, dest, pointer)) return;
      }
    }

    const nodeWinAtPointer = wm.nodeWinAtPointer;
    if (!nodeWinAtPointer) {
      // R015: no TILE under pointer — empty mon / gap cross-mon drop.
      // Mid-drag rehome is skipped (R012); grab-end must commit mon move.
      if (preview) {
        this._previewEmptyMonitorDrop(focusNodeWindow);
      } else {
        // Log commit only after a real rehome (no-decision / refuse stay DEBUG inside).
        if (this._commitEmptyMonitorDrop(focusNodeWindow)) {
          Logger.debug("dnd commit empty-mon");
        }
      }
      return;
    }

    // Bug #328 fix: Validate node structure before accessing
    if (!nodeWinAtPointer.nodeValue || !nodeWinAtPointer.parentNode) {
      Logger.warn("moveWindowToPointer: invalid nodeWinAtPointer structure");
      return;
    }

    const parentNodeTarget = nodeWinAtPointer.parentNode;
    if (!parentNodeTarget.childNodes || !Array.isArray(parentNodeTarget.childNodes)) {
      Logger.warn("moveWindowToPointer: invalid parent structure");
      return;
    }

    // D0 five-zone hit (independent of grab origin). Not old edge-band regions.
    // Use tree slot (same as hit-test), not Meta frame: inactive tab / Chrome
    // Wayland frames can be tiny at the top of the group while the slot is full.
    const targetRect =
      dropTargetHitRect(nodeWinAtPointer, nodeWinAtPointer.nodeValue, true) ||
      nodeWinAtPointer.nodeValue.get_frame_rect?.() ||
      null;
    if (!targetRect || !(targetRect.width > 0) || !(targetRect.height > 0)) {
      if (preview) this._hidePreviewActors(focusNodeWindow);
      return;
    }
    const dropZones = buildDropZones(targetRect);
    const pointer = wm.getDragPointer(focusNodeWindow);
    const zone = hitTestDropZone(dropZones, pointer);
    if (zone === DROP_ZONES.NONE) {
      if (preview) this._hidePreviewActors(focusNodeWindow);
      else Logger.debug("dnd commit miss reason=zone-none");
      return;
    }

    // Build context for operation
    const ctx = {
      nodeWinAtPointer,
      parentNodeTarget,
      focusNodeWindow,
      horizontal: parentNodeTarget.isHSplit() || parentNodeTarget.isTabbed(),
      isMonParent: parentNodeTarget.nodeType === NODE_TYPES.MONITOR,
      isConParent: parentNodeTarget.nodeType === NODE_TYPES.CON,
      stacked: parentNodeTarget.isStacked(),
      stackedOrTabbed: parentNodeTarget.isStacked() || parentNodeTarget.isTabbed(),
      centerLayout: wm._resolveDndCenterLayout(),
      dropZones,
      targetRect,
    };

    const operation = wm._buildDropOperation(zone, ctx);
    if (!operation) return;

    // Per-zone overflow: HSPLIT / VSPLIT / TAB evaluated independently.
    if (preview) {
      const zoneOverflow = {};
      for (const z of PAINT_ZONE_ORDER) {
        const opZ = wm._buildDropOperation(z, ctx);
        zoneOverflow[z] = !!(
          opZ && dropWouldOverflowMins(focusNodeWindow, nodeWinAtPointer, opZ, ctx)
        );
      }
      operation.zoneOverflow = zoneOverflow;
    }

    // Same slot / already correct relative place → paint zone, skip structure change.
    if (this._isNoOpDrop(focusNodeWindow, nodeWinAtPointer, operation, ctx)) {
      if (preview) {
        wm._showDropPreview(focusNodeWindow, operation);
      }
      return;
    }

    if (dropWouldOverflowMins(focusNodeWindow, nodeWinAtPointer, operation, ctx)) {
      operation.blockedByMins = true;
      operation.previewClass = "window-tilepreview-invalid";
      if (preview) {
        wm._showDropPreview(focusNodeWindow, operation);
      } else {
        Logger.debug(`dnd refuse-mins zone=${zone}`);
      }
      // Refuse commit — snap back / leave structure unchanged.
      return;
    }

    // Execute or preview
    if (preview) {
      wm._showDropPreview(focusNodeWindow, operation);
    } else {
      Logger.debug(`dnd commit zone=${zone}`);
      const resolved = resolveDropMark2(focusNodeWindow, nodeWinAtPointer, operation, ctx);
      if (resolved && this._commitDropMark2(focusNodeWindow, operation, resolved)) return;
      if (!focusNodeWindow.parentNode) return;
      wm._executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx);
    }
  }

  /**
   * TILES Join/Move for a resolved drop. False → caller keeps `_executeDropOperation`.
   * @param {object} focusNodeWindow
   * @param {object} operation
   * @param {{ op: string, dir: string }} resolved
   * @returns {boolean}
   */
  _commitDropMark2(focusNodeWindow, operation, resolved) {
    const wm = this._extWm;
    let applied = false;
    try {
      applied = runMark2(wm, focusNodeWindow, resolved.op, resolved.dir, "dnd-drop", {
        treatGrabTileAsTiles: true,
      });
    } catch (_e) {
      applied = false;
    }
    if (!applied) return false;

    if (operation.isCenter && !operation.isSwap) {
      const joined = focusNodeWindow.parentNode;
      if (joined?.isStackedOrTabbed?.()) {
        if (
          joined.isStacked?.() &&
          !wm.ext?.settings?.get_boolean?.("stacked-tiling-mode-enabled")
        ) {
          if (typeof this._tree.setLayout === "function") {
            this._tree.setLayout(joined, LAYOUT_TYPES.TABBED);
          } else {
            joined.layout = LAYOUT_TYPES.TABBED;
          }
        }
        wm.normalizeGroupToHomeMonitor?.(joined);
      }
    }
    focusNodeWindow.createCon = false;
    focusNodeWindow.detachWindow = false;
    return true;
  }

  /**
   * True when drop would not change parent, order, or layout (D0 + D024).
   */
  _isNoOpDrop(focusNodeWindow, nodeWinAtPointer, operation, ctx) {
    return !dropChangesStructure(focusNodeWindow, nodeWinAtPointer, operation, ctx);
  }

  /**
   * Bug #151: reference coordinate for drag-target resolution. On Wayland,
   * touch/stylus drags move the window while global.get_pointer() (mouse
   * only) stays parked. While the pointer has not moved since grab start,
   * derive the coordinate from the dragged window's frame, which Mutter
   * moves with the touch point. A real pointer drag is untouched.
   */
  getDragPointer(focusNodeWindow) {
    const wm = this._extWm;
    const syn = this._syntheticDragPointer;
    if (
      Array.isArray(syn) &&
      syn.length >= 2 &&
      Number.isFinite(Number(syn[0])) &&
      Number.isFinite(Number(syn[1]))
    ) {
      return syn;
    }
    // Tab chrome peel: never derive from the parked frame interior.
    const tabDrag = this._tabDrag;
    if (tabDrag && tabDrag.lastX != null && tabDrag.lastY != null) {
      return [Number(tabDrag.lastX) || 0, Number(tabDrag.lastY) || 0, this._pointerMods()];
    }
    const pointerCoord = wm.getPointer();
    const start = wm._grabStartPointer;
    // Live pointer moved → trust it (normal titlebar/mouse DnD).
    if (!start || pointerCoord[0] !== start[0] || pointerCoord[1] !== start[1]) {
      return pointerCoord;
    }
    // Parked (Wayland CSD): stage track, else frame-interior (Bug #151).
    const gpt = this._grabPointerTrack;
    if (gpt && gpt.lastX != null && gpt.lastY != null) {
      if (gpt.lastX !== start[0] || gpt.lastY !== start[1]) {
        return [Number(gpt.lastX) || 0, Number(gpt.lastY) || 0, this._pointerMods()];
      }
    }
    const inside = wm.getPointerPositionInside(focusNodeWindow);
    return inside ? [inside.x, inside.y, pointerCoord[2]] : pointerCoord;
  }

  /**
   * Track stage pointer during real Mutter MOVING grabs (titlebar/CSD).
   * Skipped when tab-chrome already owns the gesture. Stage motion + poll both
   * drive `_handleMoving` (Meta geom alone is cold on Wayland Chrome/PWA).
   */
  _armGrabPointerTrack() {
    this._disarmGrabPointerTrack();
    if (this._tabDrag) return;
    const stage = global.stage;
    const track = { lastX: null, lastY: null, stageIds: [] };
    if (stage && typeof stage.connect === "function") {
      const id = stage.connect("captured-event", (_actor, ev) => {
        const t = typeof ev?.type === "function" ? ev.type() : ev?.type;
        const isMotion = t === Clutter.EventType.MOTION || t === Clutter.EventType.TOUCH_UPDATE;
        const isRelease =
          t === Clutter.EventType.BUTTON_RELEASE || t === Clutter.EventType.TOUCH_END;
        if (isMotion || isRelease) {
          const coords = _eventCoords(ev);
          if (coords) {
            track.lastX = coords[0];
            track.lastY = coords[1];
          }
        }
        // Titlebar: paint zones from stage motion (tab path already does this).
        if (isMotion && !this._tabDrag) {
          const wm = this._extWm;
          const dragged =
            wm?._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE ? wm._draggedNodeWindow : null;
          if (dragged) {
            try {
              this._handleMoving(dragged);
            } catch (_e) {
              /* ignore */
            }
          }
        }
        return Clutter.EVENT_PROPAGATE;
      });
      track.stageIds.push(id);
    }
    const ptr = this._extWm?.getPointer?.() || global.get_pointer?.();
    if (ptr && ptr.length >= 2) {
      track.lastX = ptr[0];
      track.lastY = ptr[1];
    }
    this._grabPointerTrack = track;
    this._armGrabPointerPoll();
  }

  /**
   * Poll while titlebar GRAB_TILE is live — Mutter grab often eats stage motion
   * on Wayland CSD; tab peel already has tabDragPointer. Skip when xy unchanged.
   */
  _armGrabPointerPoll() {
    const wm = this._extWm;
    const sources = wm?._wmSources;
    if (!sources?.set) return;
    sources.cancel?.("grabPointerPoll");
    const tick = () => {
      if (this._tabDrag) {
        sources.cancel?.("grabPointerPoll");
        return;
      }
      const dragged =
        wm?._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE ? wm._draggedNodeWindow : null;
      if (!dragged) {
        sources.cancel?.("grabPointerPoll");
        return;
      }
      let ptr = null;
      try {
        ptr = wm?.getPointer?.() || global.get_pointer?.();
      } catch (_e) {
        ptr = null;
      }
      const track = this._grabPointerTrack;
      if (Array.isArray(ptr) && ptr.length >= 2 && track) {
        const x = Number(ptr[0]) || 0;
        const y = Number(ptr[1]) || 0;
        if (x !== track.lastX || y !== track.lastY) {
          track.lastX = x;
          track.lastY = y;
          try {
            this._handleMoving(dragged);
          } catch (_e) {
            /* ignore */
          }
        }
      }
      if (
        !this._tabDrag &&
        wm?._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE &&
        this._grabPointerTrack
      ) {
        sources.set("grabPointerPoll", 8, tick);
      }
    };
    sources.set("grabPointerPoll", 8, tick);
  }

  _cancelGrabPointerPoll() {
    try {
      this._extWm?._wmSources?.cancel?.("grabPointerPoll");
    } catch (_e) {
      // bag gone
    }
  }

  _disarmGrabPointerTrack() {
    this._cancelGrabPointerPoll();
    const track = this._grabPointerTrack;
    this._grabPointerTrack = null;
    if (!track?.stageIds?.length) return;
    const stage = global.stage;
    for (const id of track.stageIds) {
      try {
        stage?.disconnect?.(id);
      } catch (_e) {
        // ignore
      }
    }
  }

  findNodeWindowAtPointer(focusNodeWindow) {
    const wm = this._extWm;
    let pointerCoord = wm.getDragPointer(focusNodeWindow);

    let nodeWinAtPointer = wm._findNodeWindowAtPointer(focusNodeWindow.nodeValue, pointerCoord);
    return nodeWinAtPointer;
  }

  /**
   * Resolve pointer mon vs source tree mon for empty-mon / gap drops (R015).
   * @param {Object} focusNodeWindow
   * @param {number|null} [destMonOverride] Synthetic path (session-api / live matrix)
   * @returns {{ destMonIndex: number } | null}
   */
  _resolveEmptyMonitorDropDecision(focusNodeWindow, destMonOverride = null) {
    const wm = this._extWm;
    if (!focusNodeWindow?.nodeValue) return null;
    const sourceMonNode = this._tree.findAncestorMonitor?.(focusNodeWindow);
    const sourceTreeMon =
      sourceMonNode?.nodeValue != null ? Utils.monitorIndex(sourceMonNode.nodeValue) : -1;
    let pointerMon = -1;
    if (typeof destMonOverride === "number" && destMonOverride >= 0) {
      pointerMon = destMonOverride;
    } else {
      const pointer = wm.getDragPointer(focusNodeWindow);
      if (!pointer || pointer.length < 2) return null;
      pointerMon =
        typeof wm._monitorIndexForRect === "function"
          ? wm._monitorIndexForRect({
              x: pointer[0],
              y: pointer[1],
              width: 1,
              height: 1,
            })
          : -1;
    }
    return resolveEmptyMonitorDrop({
      hasWindowTarget: false,
      pointerMonIndex: pointerMon,
      sourceTreeMonIndex: sourceTreeMon,
    });
  }

  /**
   * Preview full dest-mon work area when pointer is over another mon with no TILE hit.
   * @param {Object} focusNodeWindow
   */
  _previewEmptyMonitorDrop(focusNodeWindow) {
    const wm = this._extWm;
    if (!this._previewHintsWanted()) {
      this.clearAllPreviewHints();
      return;
    }
    const decision = this._resolveEmptyMonitorDropDecision(focusNodeWindow);
    if (!decision) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }
    const meta = focusNodeWindow.nodeValue;
    let workArea = null;
    try {
      workArea = meta?.get_work_area_for_monitor?.(decision.destMonIndex);
    } catch (_e) {
      workArea = null;
    }
    if (!workArea || !(workArea.width > 0) || !(workArea.height > 0)) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }
    this._ensurePreviewActors(focusNodeWindow);
    const overflow = dropWouldOverflowMins(
      focusNodeWindow,
      null,
      { isCenter: true, previewRect: workArea },
      { emptyMonitor: true, workArea }
    );
    // Single full-mon bin (no five-zone geometry without a unit tile).
    const operation = {
      zone: DROP_ZONES.CENTER,
      previewRect: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      },
      previewClass: overflow ? "window-tilepreview-invalid" : "window-tilepreview-tiled",
      blockedByMins: !!overflow,
      dropZones: null,
    };
    // Hide multi-zone bins if present; use container as one solid preview.
    if (focusNodeWindow.previewZoneActors) {
      for (const a of Object.values(focusNodeWindow.previewZoneActors)) {
        a.hide?.();
      }
    }
    const previewHint = focusNodeWindow.previewHint;
    if (!previewHint) return;
    previewHint.set_style_class_name?.(operation.previewClass);
    previewHint.set_position(operation.previewRect.x, operation.previewRect.y);
    previewHint.set_size(operation.previewRect.width, operation.previewRect.height);
    previewHint.show?.();
    this._armPreviewHintFailsafe();
  }

  /**
   * Grab-end: rehome GRAB_TILE onto pointer mon when no window target (R015).
   * @param {Object} focusNodeWindow
   * @param {number|null} [destMonOverride] Synthetic empty-mon drop (session-api)
   * @returns {boolean} true when rehomed
   */
  _commitEmptyMonitorDrop(focusNodeWindow, destMonOverride = null) {
    if (assertionFailed()) return false;
    const wm = this._extWm;
    const decision = this._resolveEmptyMonitorDropDecision(focusNodeWindow, destMonOverride);
    if (!decision) {
      // Same-mon gap / null pointer mon — no rehome (commitLayout snaps back).
      Logger.debug("dnd empty-mon no-decision");
      return false;
    }
    Logger.debug(`dnd empty-mon dest=${decision.destMonIndex}`);

    const meta = focusNodeWindow.nodeValue;
    if (!meta || !Utils.isWindowAlive(meta)) return false;

    let workArea = null;
    try {
      workArea = meta.get_work_area_for_monitor?.(decision.destMonIndex);
    } catch (_e) {
      workArea = null;
    }
    if (
      workArea &&
      dropWouldOverflowMins(
        focusNodeWindow,
        null,
        { isCenter: true, previewRect: workArea },
        { emptyMonitor: true, workArea }
      )
    ) {
      Logger.debug(`dnd empty-mon refuse-mins dest=${decision.destMonIndex}`);
      return false;
    }

    let wsIndex = 0;
    try {
      wsIndex = meta.get_workspace?.()?.index?.() ?? 0;
    } catch (_e) {
      wsIndex = 0;
    }
    const destId = Utils.createMonitorWorkspaceId(decision.destMonIndex, wsIndex);
    const destNode = this._tree.findNode(destId);
    if (!destNode) {
      Logger.warn(`empty-mon-dnd: missing mon node ${destId}`);
      return false;
    }
    // Already under dest mon (stale nodeWinAtPointer null mid-structure) — no-op.
    if (destNode.contains?.(focusNodeWindow)) return false;

    const previousParent = focusNodeWindow.parentNode;
    this._tree.resetSiblingPercent?.(previousParent);
    this._tree.resetSiblingPercent?.(destNode);

    // Meta mon first (when still on source); SEGV-safe no-op if already there / -1.
    safeMoveToMonitor(meta, decision.destMonIndex, "empty-mon-dnd");

    // Geometry onto dest work area before reparent (tree.move mon path).
    try {
      const targetMonRect =
        typeof wm.rectForMonitor === "function"
          ? wm.rectForMonitor(focusNodeWindow, decision.destMonIndex)
          : null;
      const workArea =
        typeof meta.get_work_area_for_monitor === "function"
          ? meta.get_work_area_for_monitor(decision.destMonIndex)
          : null;
      if (targetMonRect && typeof wm.move === "function") {
        wm.move(meta, targetMonRect, workArea);
      }
    } catch (e) {
      Logger.debug?.(`empty-mon-dnd geometry: ${e}`);
    }

    // User dragged one leaf — never walk up a CON (workspace-migrate helper).
    let attached = false;
    if (typeof wm._rehomeAttachAfterMonLft === "function") {
      attached = !!wm._rehomeAttachAfterMonLft(focusNodeWindow, destNode);
    }
    if (!attached) {
      destNode.appendChild?.(focusNodeWindow);
    }

    previousParent?.resetLayoutSingleChild?.();
    this._tree.resetSiblingPercent?.(previousParent);
    this._tree.resetSiblingPercent?.(focusNodeWindow.parentNode || destNode);
    Logger.debug?.(`empty-mon-dnd: rehomed → mo${decision.destMonIndex}ws${wsIndex}`);
    return true;
  }

  /**
   * Finds the NodeWindow under pointer coords using workspace-wide sortedWindows
   * (all monitors). Frame rects are stage-global, so mon1 at x≥1920 hits normally.
   * Excludes the dragged meta. During grab, hit the target tree slot so a moving
   * live frame cannot self-hit.
   */
  _findNodeWindowAtPointer(metaWindow, pointer) {
    const wm = this._extWm;
    if (!metaWindow) return undefined;

    let sortedWindows = wm.sortedWindows;

    if (!sortedWindows) {
      Logger.warn("No sorted windows");
      return;
    }

    const draggedNode = this._tree.getNodeByValue(metaWindow);
    const duringGrab = !!(
      wm._draggedNodeWindow ||
      draggedNode?.mode === WINDOW_MODES.GRAB_TILE ||
      draggedNode?.isGrabTile?.()
    );

    for (let i = 0, n = sortedWindows.length; i < n; i++) {
      const w = sortedWindows[i];
      // forge-xom3: sortedWindows is snapshotted at grab start and not pruned
      // when a window closes mid-drag; skip dead wrappers so get_frame_rect()
      // can't throw and a disposed window can't mask a live drop target beneath.
      if (w === metaWindow) continue;
      if (!Utils.isWindowAlive(w)) continue;
      const node = this._tree.getNodeByValue(w);
      if (!isEligibleDragDropTargetNode(node, metaWindow)) continue;
      const hitRect = dropTargetHitRect(node, w, duringGrab);
      if (hitRect && Utils.rectContainsPoint(hitRect, pointer)) return node;
    }

    return null;
  }

  _handleGrabOpBegin(_display, metaWindow, grabOp) {
    const wm = this._extWm;
    // forge-h6z9: cancel any pending debounced keyboard-resize end so a delayed
    // _handleGrabOpEnd can't fire into this grab (e.g. a real pointer grab that
    // begins <120ms after a keyboard resize, which would unfreeze/cleanup and
    // kill the live drag). The keyboard key-repeat path calls this from resize()
    // and immediately re-arms the timer afterward, so accumulation is preserved.
    wm._wmSources.cancel("manualResizeEnd");
    wm._manualResizeEndWindow = null;

    wm.grabOp = grabOp;
    // Prefer the grab signal's window (tab synthetic grab, focus lag) over
    // display focus — trackCurrentMonWs also needs a live Meta.Window.
    let focusMetaWindow =
      metaWindow && typeof wm.findNodeWindow === "function" && wm.findNodeWindow(metaWindow)
        ? metaWindow
        : wm.focusMetaWindow;
    // Snapshot sortedWindows for the grabbed window (focus may lag after tab arm).
    wm.trackCurrentMonWs(focusMetaWindow || null);
    // Bug #151: snapshot the pointer so getDragPointer() can tell a real
    // pointer drag (pointer moves) from a touch/stylus drag (pointer parked).
    wm._grabStartPointer = wm.getPointer();

    if (focusMetaWindow) {
      let focusNodeWindow = wm.findNodeWindow(focusMetaWindow);
      if (!focusNodeWindow) return;

      const frameRect = focusMetaWindow.get_frame_rect();
      const gaps = wm.calculateGaps(focusNodeWindow);

      focusNodeWindow.grabMode = Utils.grabMode(grabOp);
      focusNodeWindow.initGrabOp = grabOp;
      // Only set initRect if not already tracking a resize (preserves original during key repeat)
      if (!focusNodeWindow.initRect) {
        focusNodeWindow.initRect = Utils.removeGapOnRect(frameRect, gaps);
      }

      // Bug #497 (forge-pak): snapshot the enclosing tabbed/stacked container's
      // start slice so a tab resize maps onto the container consistently while
      // the tree re-renders mid-drag.
      // forge-ue92: record the exact ancestors we snapshot so _grabCleanup can
      // clear THESE nodes. _handleGrabOpEnd reparents the dragged node
      // (moveWindowToPointer) BEFORE cleanup, so re-walking parentNode at cleanup
      // time would clear the post-reparent chain and strand initRect on the
      // original container — skewing its next tab resize.
      const grabbedTabbedAncestors = [];
      let tabbedAncestor = focusNodeWindow.parentNode;
      while (tabbedAncestor && tabbedAncestor.isStackedOrTabbed()) {
        if (!tabbedAncestor.initRect) tabbedAncestor.initRect = { ...tabbedAncestor.rect };
        grabbedTabbedAncestors.push(tabbedAncestor);
        tabbedAncestor = tabbedAncestor.parentNode;
      }
      focusNodeWindow.grabbedTabbedAncestors = grabbedTabbedAncestors;

      // Before stage track: motion handler reads _draggedNodeWindow.
      wm._draggedNodeWindow = focusNodeWindow;
      assert(wm._draggedNodeWindow === focusNodeWindow, "dnd-grab-owner", {
        windowId: focusMetaWindow?.get_id?.() ?? focusMetaWindow?.id,
      });

      if (focusNodeWindow.grabMode === GRAB_TYPES.MOVING) {
        if (focusNodeWindow.mode === WINDOW_MODES.TILE) {
          Logger.debug(`dnd grab MOVING mode=TILE`);
          wm.freezeRender();
          focusNodeWindow.mode = WINDOW_MODES.GRAB_TILE;
          // Real Mutter titlebar/CSD move (not tab synthetic peel).
          if (!this._tabDrag) this._armGrabPointerTrack();
        } else {
          // FLOAT/DEFAULT: no zone UI (e.g. failed apply left slot FLOAT).
          const max = Compat.isMaximized(focusMetaWindow) ? " maximized" : "";
          const fs = focusMetaWindow?.is_fullscreen?.() ? " fullscreen" : "";
          Logger.debug(`dnd grab MOVING skip mode=${focusNodeWindow.mode}${max}${fs}`);
        }
      }
    }
  }

  _handleGrabOpEnd(_display, metaWindow, grabOp) {
    const wm = this._extWm;
    // Tab-drag arming ends with the Mutter grab (or our synthetic end).
    this._disarmTabDrag({ keepSynthetic: false });
    // Keep titlebar track through moveWindowToPointer, then clear.
    const endGrabPointer = this._grabPointerTrack
      ? { lastX: this._grabPointerTrack.lastX, lastY: this._grabPointerTrack.lastY }
      : null;
    this._disarmGrabPointerTrack();
    if (endGrabPointer && endGrabPointer.lastX != null) {
      this._grabPointerTrack = {
        lastX: endGrabPointer.lastX,
        lastY: endGrabPointer.lastY,
        stageIds: [],
      };
    }
    wm.unfreezeRender();
    // Prefer the grab-end window when still in the tree; else focus; else the
    // node we snapshotted at grab-begin (_draggedNodeWindow).
    let focusMetaWindow =
      (metaWindow && wm.findNodeWindow(metaWindow) && metaWindow) ||
      wm.focusMetaWindow ||
      wm._draggedNodeWindow?.nodeValue ||
      null;
    if (!focusMetaWindow) {
      // Focus lost mid-drag (window closed, monitor crossing): still release the
      // dragged window's preview hint so the overlay isn't orphaned on screen.
      if (wm._draggedNodeWindow) {
        wm._grabCleanup(wm._draggedNodeWindow);
        wm._draggedNodeWindow = null;
      }
      // forge-62ja: also clear the per-grab state the normal exit path clears
      // (below), so a stale grabOp from this finished drag can't defeat the
      // forge-leqs WINDOW_BASE guard in updateMetaWorkspaceMonitor on a later
      // cross-monitor/workspace re-home before the next grab re-sets it.
      wm.nodeWinAtPointer = null;
      wm.grabOp = null;
      this._disarmGrabPointerTrack();
      return;
    }
    let focusNodeWindow = wm.findNodeWindow(focusMetaWindow);

    // Capture before cleanup resets GRAB_TILE → TILE.
    const wasGrabTile =
      focusNodeWindow?.mode === WINDOW_MODES.GRAB_TILE ||
      wm._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE;
    const movingOp =
      grabOp === Meta.GrabOp.WINDOW_BASE ||
      grabOp === Meta.GrabOp.COMPOSITOR ||
      grabOp === Meta.GrabOp.MOVING_UNCONSTRAINED ||
      grabOp === Meta.GrabOp.MOVING;

    if (focusNodeWindow) {
      // WINDOW_BASE is when grabbing the window decoration
      // COMPOSITOR is when something like Overview requesting a grab, especially when Super is pressed.
      if (movingOp) {
        if (wasGrabTile && !assertionFailed() && wm.allowDragDropTile()) {
          // Fresh target at commit (stale motion / mid-drag mon thrash).
          wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);
          wm.nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
          wm.moveWindowToPointer(focusNodeWindow);
        }
      }
    }
    this._disarmGrabPointerTrack();

    // Bug #433 fix: Clean up preview hint from the originally dragged window
    // This handles cases where focus changed during drag (e.g., crossing monitors)
    if (wm._draggedNodeWindow && wm._draggedNodeWindow !== focusNodeWindow) {
      wm._grabCleanup(wm._draggedNodeWindow);
    }
    wm._draggedNodeWindow = null;

    wm._grabCleanup(focusNodeWindow);

    // StructureChanged only for armed TILE grabs (or resize). Skip FLOAT/Overview
    // moves so journal is not a lone `render tree from grab-op-end`.
    if (wasGrabTile) {
      if (Compat.isNotMaximized(focusMetaWindow)) {
        wm.commitLayout("grab-op-end", { force: true });
      }
    } else if (movingOp) {
      Logger.debug(`dnd grab-op-end skip reason=no-grab-tile`);
    } else if (Compat.isNotMaximized(focusMetaWindow)) {
      wm.commitLayout("grab-op-end", { force: true });
    }

    wm.settleTabFocus(focusNodeWindow);
    wm.nodeWinAtPointer = null;
    // forge-leqs: grabOp is the live grab; clear it once the grab ends so later
    // reads (e.g. the WINDOW_BASE guard in updateMetaWorkspaceMonitor) don't see
    // a stale op from a finished drag. A new grab re-sets it in _handleGrabOpBegin
    // before any size-changed handler runs.
    wm.grabOp = null;
  }

  _grabCleanup(focusNodeWindow) {
    // Always wipe every preview — not only focusNodeWindow — so a reparent/focus
    // race cannot leave a full-screen dim until logout.
    this.clearAllPreviewHints();

    if (!focusNodeWindow) return;
    focusNodeWindow.initRect = null;
    focusNodeWindow.grabMode = null;
    focusNodeWindow.initGrabOp = null;
    focusNodeWindow.pairInitRects = null;

    // Bug #497 (forge-pak): release any tabbed/stacked container snapshots too.
    // forge-ue92: clear the ancestors snapshotted at grab-begin, NOT the current
    // parentNode chain — the node may have been reparented (tab dragged out) or
    // left the tree before this runs, which would otherwise strand initRect on the
    // original container and skew/bake its next resize.
    if (focusNodeWindow.grabbedTabbedAncestors) {
      for (const ancestor of focusNodeWindow.grabbedTabbedAncestors) {
        ancestor.initRect = null;
      }
      focusNodeWindow.grabbedTabbedAncestors = null;
    }

    if (focusNodeWindow.mode === WINDOW_MODES.GRAB_TILE) {
      focusNodeWindow.mode = WINDOW_MODES.TILE;
    }
    this._foreignStripCommit = null;
    this._originStripCommit = null;
  }

  allowDragDropTile() {
    // kbd may be null mid-disable / partial test fixtures (bug-175).
    return !!this._extWm?.kbd?.allowDragDropTile?.();
  }

  /**
   * Arm a primary-button gesture on tab chrome. Short click = already activated
   * by the caller; travel past TAB_DRAG_THRESHOLD_PX on the same group's strip
   * reorders siblings; leaving the strip starts move grab (titlebar path).
   *
   * @param {any} metaWindow Meta.Window for the tile unit
   * @param {any} event Clutter button-press event
   * @returns {boolean} true if armed
   */
  armTabDrag(metaWindow, event) {
    const wm = this._extWm;
    if (!metaWindow || !event) return false;
    if (!wm?.ext?.settings?.get_boolean?.("tiling-mode-enabled")) return false;
    // Already mid grab-tile (titlebar or prior tab) — do not stack gestures.
    if (wm._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE) return false;

    this._disarmTabDrag({ keepSynthetic: false });
    this._syntheticDragPointer = null;

    const coords =
      _eventCoords(event) ||
      (() => {
        const p = wm.getPointer?.() || global.get_pointer?.() || [0, 0, 0];
        return [p[0], p[1]];
      })();
    const [startX, startY] = coords;

    const grabOp =
      Meta.GrabOp.MOVING_UNCONSTRAINED != null
        ? Meta.GrabOp.MOVING_UNCONSTRAINED
        : Meta.GrabOp.MOVING;

    // Pressed class on the strip unit tab (CON-rep → CON.tab).
    let pressedTab = null;
    try {
      const ctx = this._resolveTabStripReorderContext(metaWindow);
      pressedTab = ctx?.unit?.tab || null;
      if (pressedTab?.add_style_class_name) {
        pressedTab.add_style_class_name(TAB_PRESSED_CLASS);
      }
    } catch (_e) {
      pressedTab = null;
    }

    let device = null;
    try {
      device = typeof event.get_device === "function" ? event.get_device() : null;
    } catch (_e) {
      device = null;
    }

    this._tabDrag = {
      metaWindow,
      startX,
      startY,
      lastX: startX,
      lastY: startY,
      started: false,
      reorder: false,
      synthetic: false,
      grabOp,
      device,
      stageIds: [],
      groupNode: null,
      unitNode: null,
      axis: "x",
      insertIndex: null,
      fromIndex: null,
      previewGap: null,
      dragDirection: 1,
      grabOffsetX: 0,
      grabOffsetY: 0,
      chipW: 0,
      chipH: 0,
      chipFloating: false,
      chipHomeParent: null,
      pressedTab,
      siblingSnap: null,
      gapSpacer: null,
      stripOrigin: 0,
      stripCross: 0,
      // Poll finishes only after seeing primary-down in mods (then up).
      // Prefer press-event state; do not trust get_pointer here (can lag).
      seenPrimaryDown: (() => {
        if (event && typeof event.get_state === "function") {
          try {
            const st = event.get_state();
            if (st != null && (Number(st) & this._primaryButtonMask()) !== 0) return true;
          } catch (_e) {
            /* ignore */
          }
        }
        return false;
      })(),
    };

    const stage = global.stage;
    if (stage && typeof stage.connect === "function") {
      // Sole live motion/release path: stage capture (not the tab actor).
      // STOP so competing handlers cannot drop or desync the gesture.
      const id = stage.connect("captured-event", (_actor, ev) => {
        return this._onTabDragStageEvent(ev);
      });
      this._tabDrag.stageIds.push(id);
    }
    // Pointer poll: keep chip glued when motion events skip frames (fast drag).
    this._armTabDragPointerPoll();
    // Unit mocks without stage: drive via noteTabDragMotion / finishTabDragRelease.
    return true;
  }

  /**
   * Report pointer position while a tab drag is armed.
   * Called by the stage/poll owner (and unit tests). Not for tab-actor wiring.
   * @param {number} x
   * @param {number} y
   * @returns {"idle"|"armed"|"reorder"|"started"|"active"}
   */
  noteTabDragMotion(x, y) {
    const state = this._tabDrag;
    if (!state) return "idle";
    this._syncTabDragChipToPointer(state, x, y);
    if (state.started) {
      if (state.synthetic) {
        const node = this._extWm.findNodeWindow?.(state.metaWindow);
        if (node) this._handleMoving(node);
      }
      return state.synthetic ? "active" : "started";
    }

    // Strip reorder: stay while the chip intersects the origin strip band.
    if (state.reorder) {
      if (!this._tabDragChipIntersectsOriginStrip(state, x, y)) {
        this._clearTabReorderOriginGap(state);
        state.reorder = false;
        this._originStripCommit = null;
        this._startTabMoveGrab(state);
        if (state.started && state.synthetic) {
          this._syncTabDragChipToPointer(state, x, y);
          const node = this._extWm.findNodeWindow?.(state.metaWindow);
          if (node) this._handleMoving(node);
        }
        return state.started ? (state.synthetic ? "active" : "started") : "armed";
      }
      this._updateTabReorderFromPointer(state, x, y);
      return "reorder";
    }

    if (!tabDragExceededThreshold(state.startX, state.startY, x, y)) return "armed";

    // Past threshold on strip → reorder; else grab-tile (LX4).
    if (this._tryEnterTabStripReorder(state, x, y)) return "reorder";
    this._startTabMoveGrab(state);
    if (state.started && state.synthetic) {
      this._syncTabDragChipToPointer(state, x, y);
      const node = this._extWm.findNodeWindow?.(state.metaWindow);
      if (node) this._handleMoving(node);
    }
    return state.started ? (state.synthetic ? "active" : "started") : "armed";
  }

  /**
   * Primary button released while tab-drag armed, reorder, or synthetic.
   * Called by the stage owner (and unit tests). Not for tab-actor wiring.
   */
  finishTabDragRelease() {
    const state = this._tabDrag;
    if (!state) return;
    if (state.reorder && !state.started) {
      this._commitTabStripReorder(state);
      return;
    }
    if (state.started && state.synthetic) {
      this._endSyntheticTabMove(state);
      return;
    }
    // Click-only or Mutter-owned grab: one residual clear.
    this.clearTabDragResiduals();
  }

  /**
   * Sole gesture event sink while `_tabDrag` is live.
   * @param {any} event
   * @returns {number} Clutter.EVENT_STOP | EVENT_PROPAGATE
   */
  _onTabDragStageEvent(event) {
    const state = this._tabDrag;
    if (!state || !event) return Clutter.EVENT_PROPAGATE;

    let type = null;
    try {
      type = typeof event.type === "function" ? event.type() : event.type;
    } catch (_e) {
      return Clutter.EVENT_PROPAGATE;
    }

    const motionVal = Clutter.EventType?.MOTION;
    const releaseVal = Clutter.EventType?.BUTTON_RELEASE;
    const touchUpdateVal = Clutter.EventType?.TOUCH_UPDATE;
    const isMotion =
      type === motionVal ||
      type === "motion" ||
      type === "MOTION" ||
      (touchUpdateVal != null && type === touchUpdateVal) ||
      type === "touch-update";
    const isRelease =
      type === releaseVal ||
      type === "button-release" ||
      type === "BUTTON_RELEASE" ||
      type === "touch-end" ||
      (Clutter.EventType?.TOUCH_END != null && type === Clutter.EventType.TOUCH_END);

    if (isMotion) {
      if (this._pointerHasPrimaryButton(event)) state.seenPrimaryDown = true;
      const coords = _eventCoords(event) || this._tabDragPointerXY();
      if (coords) this.noteTabDragMotion(coords[0], coords[1]);
      return Clutter.EVENT_STOP;
    }

    if (isRelease) {
      const btn =
        typeof event.get_button === "function" ? event.get_button() : Clutter.BUTTON_PRIMARY;
      // Touch end has no button — treat as primary release.
      if (btn == null || btn === Clutter.BUTTON_PRIMARY || btn === 1 || btn === 0) {
        this.finishTabDragRelease();
        return Clutter.EVENT_STOP;
      }
    }

    return Clutter.EVENT_PROPAGATE;
  }

  /** @returns {[number, number]|null} */
  _tabDragPointerXY() {
    try {
      const p = this._extWm?.getPointer?.() || global.get_pointer?.();
      if (Array.isArray(p) && p.length >= 2) return [Number(p[0]) || 0, Number(p[1]) || 0];
    } catch (_e) {
      // no pointer
    }
    return null;
  }

  /** Clutter BUTTON1_MASK (256) — primary held / grabbed. */
  _primaryButtonMask() {
    return Clutter.ModifierType?.BUTTON1_MASK ?? 256;
  }

  /**
   * @param {any} [eventOrMods] Clutter event with get_state, or numeric mods
   * @returns {boolean}
   */
  _pointerHasPrimaryButton(eventOrMods = null) {
    const mask = this._primaryButtonMask();
    let mods = null;
    if (typeof eventOrMods === "number") {
      mods = eventOrMods;
    } else if (eventOrMods && typeof eventOrMods.get_state === "function") {
      try {
        mods = eventOrMods.get_state();
      } catch (_e) {
        mods = null;
      }
    }
    if (mods == null) {
      try {
        const p = this._extWm?.getPointer?.() || global.get_pointer?.();
        if (Array.isArray(p) && p.length >= 3) mods = p[2];
      } catch (_e) {
        mods = null;
      }
    }
    if (mods == null) return false;
    return (Number(mods) & mask) !== 0;
  }

  /**
   * Async pointer sync while armed: covers skipped stage motion frames.
   * Interval re-arms via SourceBag until clearTabDragResiduals cancels.
   */
  _armTabDragPointerPoll() {
    const wm = this._extWm;
    const sources = wm?._wmSources;
    if (!sources?.set) return;
    const tick = () => {
      const state = this._tabDrag;
      if (!state) {
        sources.cancel?.("tabDragPointer");
        return;
      }
      let ptr = null;
      try {
        ptr = wm?.getPointer?.() || global.get_pointer?.();
      } catch (_e) {
        ptr = null;
      }
      const mods = Array.isArray(ptr) && ptr.length >= 3 ? Number(ptr[2]) || 0 : null;
      if (mods != null) {
        if ((mods & this._primaryButtonMask()) !== 0) {
          state.seenPrimaryDown = true;
        } else if (state.seenPrimaryDown) {
          // Stage BUTTON_RELEASE can be lost under load; poll ends the gesture.
          this.finishTabDragRelease();
          return;
        }
      }
      if (Array.isArray(ptr) && ptr.length >= 2) {
        const x = Number(ptr[0]) || 0;
        const y = Number(ptr[1]) || 0;
        // Skip when already synced (stage path) — avoid 120Hz _handleMoving.
        if (x !== state.lastX || y !== state.lastY) {
          this.noteTabDragMotion(x, y);
        }
      }
      if (this._tabDrag) sources.set("tabDragPointer", 8, tick);
    };
    sources.set("tabDragPointer", 8, tick);
  }

  _cancelTabDragPointerPoll() {
    try {
      this._extWm?._wmSources?.cancel?.("tabDragPointer");
    } catch (_e) {
      // bag gone
    }
  }

  _startTabMoveGrab(state) {
    if (!state || state.started) return;
    const wm = this._extWm;
    const metaWindow = state.metaWindow;
    // Peel: close origin gap only. Chip stays under the pointer until release.
    this._clearTabReorderOriginGap(state);
    this._syncTabDragChipToPointer(state, state.lastX ?? state.startX, state.lastY ?? state.startY);
    if (!metaWindow) {
      this.clearTabDragResiduals();
      return;
    }

    // Ensure focus targets this window so grab begin / trackCurrentMonWs match.
    try {
      const now = global.display.get_current_time();
      metaWindow.raise?.();
      metaWindow.focus?.(now);
      metaWindow.activate?.(now);
    } catch (_e) {
      // tests / finalized
    }

    // Tab press is on St chrome, not the Meta frame. Calling begin_grab_op and
    // treating ok===true as ownership dropped stage listeners while Mutter often
    // never emits grab-op-begin → mode stayed TILE (no zone paint / no commit).
    // Tab peel always uses Forge synthetic GRAB_TILE (same as e2e fuzzDrag):
    // stage motion drives _handleMoving; release commits via grab-op-end path.
    // Titlebar moves still use real Mutter grabs; no second DnD engine.
    state.started = true;
    state.synthetic = true;
    this._beginSyntheticTabMove(metaWindow, state.grabOp);
  }

  /**
   * Resolve the TABBED/STACKED unit under drag (CON-rep → CON child, not inner leaf).
   * @param {any} metaWindow
   * @returns {{ group: any, unit: any, axis: "x"|"y", rects: any[] }|null}
   */
  _resolveTabStripReorderContext(metaWindow) {
    const wm = this._extWm;
    const winNode = wm?.findNodeWindow?.(metaWindow) || this._tree?.findNode?.(metaWindow) || null;
    if (!winNode) return null;

    let unit = winNode;
    let group = unit.parentNode;
    while (group && typeof group.isStackedOrTabbed === "function" && !group.isStackedOrTabbed()) {
      unit = group;
      group = group.parentNode;
    }
    if (!group || typeof group.isStackedOrTabbed !== "function" || !group.isStackedOrTabbed()) {
      return null;
    }
    if (unit.parentNode !== group) return null;

    const rects = this._collectGroupTabRects(group);
    // Need real tab actors for insert index; decoration-only → grab path.
    if (!rects.length) return null;

    const axis = typeof group.isStacked === "function" && group.isStacked() ? "y" : "x";
    return { group, unit, axis, rects };
  }

  /** Sibling tab actor rects in child order (skips missing tabs). */
  _collectGroupTabRects(group) {
    const rects = [];
    for (const c of group?.childNodes || []) {
      const r = tabActorScreenRect(c?.tab);
      if (r) rects.push(r);
    }
    return rects;
  }

  /** Peel/hit union: all tab rects + decoration (multi-row AABB + pad). */
  _collectGroupStripHitRects(group) {
    const rects = this._collectGroupTabRects(group);
    const d = tabActorScreenRect(group?.decoration);
    if (d) rects.push(d);
    return rects;
  }

  /**
   * @param {any} state
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  _tryEnterTabStripReorder(state, x, y) {
    const ctx = this._resolveTabStripReorderContext(state.metaWindow);
    if (!ctx) return false;
    const hitRects = this._collectGroupStripHitRects(ctx.group);
    if (!pointerOnTabStrip({ tabs: hitRects, pointer: [x, y] })) return false;

    const kids = [...(ctx.group.childNodes || [])];
    const fromIndex = kids.indexOf(ctx.unit);
    if (fromIndex < 0) return false;

    const tab = ctx.unit?.tab;
    const home = tabActorScreenRect(tab);
    if (!home) return false;

    state.reorder = true;
    state.groupNode = ctx.group;
    state.unitNode = ctx.unit;
    state.axis = ctx.axis;
    state.fromIndex = fromIndex;
    // Home gap among remaining == fromIndex (slots before the hole).
    state.previewGap = fromIndex;
    state.grabOffsetX = x - home.x;
    state.grabOffsetY = y - home.y;
    state.chipExpandX = tab?.x_expand;
    state.chipExpandY = tab?.y_expand;
    state.chipW = this._tabDragChipMinWidth(home.width);
    state.chipH = home.height > 0 ? home.height : this._tabDragChipMinWidth(0);
    state.lastX = x;
    state.lastY = y;
    state.dragDirection = 1;

    this._snapshotReorderSiblings(state);
    this._beginTabReorderFloat(state, x, y);
    this._updateTabReorderFromPointer(state, x, y);
    return true;
  }

  /**
   * Min floating-chip width: same floor as wrap planner (measureMinTabWidth).
   * @param {number} [_homeWidth] unused; prior bug left home ellipsis-sized
   * @returns {number}
   */
  _tabDragChipMinWidth(_homeWidth) {
    const tree = this._tree ?? this._extWm?.tree;
    const settings = tree?.settings ?? this._extWm?.ext?.settings;
    let minChars;
    try {
      if (settings && typeof settings.get_uint === "function") {
        minChars = settings.get_uint("min-tab-label-chars");
      }
    } catch (_e) {
      minChars = undefined;
    }
    // Product default when settings unavailable; 0 = wrap off → chrome floor.
    if (minChars == null || Number.isNaN(Number(minChars))) {
      minChars = TAB_DRAG_CHIP_MIN_CHARS_DEFAULT;
    } else {
      minChars = Math.max(0, minChars | 0);
    }

    let floor = 0;
    try {
      if (tree && typeof tree.measureMinTabWidth === "function") {
        // minChars=0 → measure returns 0; chip still needs icon+close+short label.
        floor = tree.measureMinTabWidth({ minChars: minChars > 0 ? minChars : 1 });
      }
    } catch (_e) {
      floor = 0;
    }

    if (!(floor > 0)) {
      let d = 1;
      try {
        d = typeof Utils.dpi === "function" ? Utils.dpi() : 1;
      } catch (_e) {
        d = 1;
      }
      if (!(d > 0)) d = 1;
      // Match Tree._tabChromePx (24+30+12) + glyph estimate (0.55*11).
      const chars = minChars > 0 ? minChars : 4;
      floor = Math.round((24 + 30 + 12 + chars * 0.55 * 11) * d);
    }

    return Math.max(Math.round(floor), 1);
  }

  /**
   * Freeze remaining sibling homes; equal-fill (strip − chip) so gap stays chip-sized.
   * @param {any} state
   */
  _snapshotReorderSiblings(state) {
    const group = state.groupNode;
    const unit = state.unitNode;
    const axis = state.axis === "y" ? "y" : "x";
    const snaps = [];
    // Include dragged home so origin is strip start when dragging the first tab.
    const unitHome = tabActorScreenRect(unit?.tab);
    const unitInGroup = !!(unit && (group?.childNodes || []).indexOf(unit) >= 0);
    let origin = unitHome != null ? (axis === "y" ? unitHome.y : unitHome.x) : null;
    let cross = unitHome != null ? (axis === "y" ? unitHome.x : unitHome.y) : null;
    let stripAvailable = 0;
    let dragHomeSize = 0;
    let dragHomeCross = null;
    let dragHomeCrossSize = 0;
    if (unitInGroup && unitHome) {
      dragHomeSize = Math.max(0, Math.round(axis === "y" ? unitHome.height : unitHome.width) || 0);
      dragHomeCross = axis === "y" ? unitHome.x : unitHome.y;
      dragHomeCrossSize = Math.max(
        1,
        Math.round(axis === "y" ? unitHome.width : unitHome.height) || 1
      );
      stripAvailable += dragHomeSize;
    }
    for (const c of group?.childNodes || []) {
      if (c === unit) continue;
      const r = tabActorScreenRect(c?.tab);
      const size = axis === "y" ? (r ? r.height : 1) : r ? r.width : 1;
      const start = r ? (axis === "y" ? r.y : r.x) : 0;
      const other = r ? (axis === "y" ? r.x : r.y) : 0;
      const otherSize = r ? (axis === "y" ? r.width : r.height) : 1;
      if (origin == null || start < origin) origin = start;
      if (cross == null) cross = other;
      const homeSize = Math.max(0, Math.round(size) || 0);
      stripAvailable += homeSize;
      snaps.push({
        node: c,
        tab: c?.tab || null,
        homeSize,
        size: homeSize,
        homeStart: start,
        // Stable row/strip pack origin (homeStart moves during gesture).
        layoutOrigin: start,
        cross: other,
        crossSize: Math.max(1, otherSize),
        expandX: c?.tab?.x_expand,
        expandY: c?.tab?.y_expand,
      });
      // Freeze expand so BoxLayout cannot swallow the gap mid-gesture.
      try {
        if (c?.tab) {
          if (axis === "y") c.tab.y_expand = false;
          else c.tab.x_expand = false;
        }
      } catch (_e) {
        // mock / disposed
      }
    }
    state.siblingSnap = snaps;
    state.stripOrigin = origin != null ? origin : 0;
    state.stripCross = cross != null ? cross : 0;
    state.stripAvailable = stripAvailable;
    state.dragHomeSize = dragHomeSize;
    state.dragHomeCross = dragHomeCross;
    state.dragHomeCrossSize = dragHomeCrossSize;
    this._equalFillReorderSiblings(state, Number(state.previewGap) || 0);
  }

  /**
   * Y-band rows for TABBED multi-row remaining snaps (child order within each band).
   * @param {Array<{cross?:number,crossSize?:number}>} snaps
   * @returns {{rowOf: number[], rowBands: Array<{indices:number[],minY:number,maxY:number}>}}
   */
  _tabReorderRowBands(snaps) {
    const list = Array.isArray(snaps) ? snaps : [];
    const rowOf = new Array(list.length);
    const rowBands = [];
    const order = list
      .map((_, i) => i)
      .sort((a, b) => {
        const dy = (list[a].cross || 0) - (list[b].cross || 0);
        if (dy !== 0) return dy;
        return a - b;
      });
    for (const i of order) {
      const s = list[i];
      const sy = Number(s.cross) || 0;
      const sh = Math.max(1, Number(s.crossSize) || 1);
      const sEnd = sy + sh;
      let joined = false;
      for (let r = 0; r < rowBands.length; r++) {
        const row = rowBands[r];
        const bandH = Math.max(1, row.maxY - row.minY);
        const overlap = Math.min(row.maxY, sEnd) - Math.max(row.minY, sy);
        if (overlap > Math.min(sh, bandH) / 2) {
          row.indices.push(i);
          row.minY = Math.min(row.minY, sy);
          row.maxY = Math.max(row.maxY, sEnd);
          rowOf[i] = r;
          joined = true;
          break;
        }
      }
      if (!joined) {
        rowOf[i] = rowBands.length;
        rowBands.push({ indices: [i], minY: sy, maxY: sEnd });
      }
    }
    for (const row of rowBands) {
      row.indices.sort((a, b) => a - b);
    }
    return { rowOf, rowBands };
  }

  /**
   * Whether the dragged home slot contributes to a remaining-only row band.
   * @param {any} state
   * @param {{minY:number,maxY:number}} row
   * @returns {boolean}
   */
  _dragHomeOnReorderRow(state, row) {
    if (!(Number(state.dragHomeSize) > 0) || !row) return false;
    const sy = Number(state.dragHomeCross) || 0;
    const sh = Math.max(1, Number(state.dragHomeCrossSize) || 1);
    const sEnd = sy + sh;
    const bandH = Math.max(1, row.maxY - row.minY);
    const overlap = Math.min(row.maxY, sEnd) - Math.max(row.minY, sy);
    return overlap > Math.min(sh, bandH) / 2;
  }

  /**
   * Apply working size onto a sibling snap (axis size; expand stays frozen).
   * @param {{tab?:any,size?:number,homeSize?:number}} snap
   * @param {number} size
   * @param {"x"|"y"} axis
   */
  _applyReorderSnapSize(snap, size, axis) {
    if (!snap) return;
    const s = Math.max(0, Math.round(Number(size) || 0));
    snap.size = s;
    const tab = snap.tab;
    if (!tab) return;
    try {
      if (axis === "y") {
        tab.y_expand = false;
        tab.set_height?.(s);
        if ("height" in tab) tab.height = s;
      } else {
        tab.x_expand = false;
        tab.set_width?.(s);
        if ("width" in tab) tab.width = s;
      }
    } catch (_e) {
      // mock / disposed
    }
  }

  /**
   * Resize remaining tabs to equal-fill (row/strip − chip) with gap reserved.
   * @param {any} state
   * @param {number} [gapAt]
   * @param {{rowOf?:number[],rowBands?:Array<{indices:number[],minY:number,maxY:number}>}|null} [bands]
   * @param {number} [gapRow]
   */
  _equalFillReorderSiblings(state, gapAt, bands = null, gapRow = 0) {
    const snaps = state.siblingSnap || [];
    if (!snaps.length) return;
    const axis = state.axis === "y" ? "y" : "x";
    const chipSize = axis === "y" ? state.chipH : state.chipW;
    const gapIndex = Math.max(0, Math.min(snaps.length, Number(gapAt) || 0));

    // STACKED or single band: one equal-fill over full stripAvailable.
    if (axis === "y") {
      const available =
        state.stripAvailable != null
          ? Number(state.stripAvailable) || 0
          : snaps.reduce((sum, s) => sum + (Number(s.homeSize) || 0), 0) +
            (Number(state.dragHomeSize) || 0);
      const sizes = tabStripEqualFillSizesWithGap({
        count: snaps.length,
        available,
        chipSize,
      });
      for (let i = 0; i < snaps.length; i++) {
        this._applyReorderSnapSize(snaps[i], sizes[i], axis);
      }
      return;
    }

    const packed = bands || this._tabReorderRowBands(snaps);
    const rowBands = packed.rowBands || [];
    const rowOf = packed.rowOf || [];
    if (rowBands.length <= 1) {
      const available =
        state.stripAvailable != null
          ? Number(state.stripAvailable) || 0
          : snaps.reduce((sum, s) => sum + (Number(s.homeSize) || 0), 0) +
            (Number(state.dragHomeSize) || 0);
      const sizes = tabStripEqualFillSizesWithGap({
        count: snaps.length,
        available,
        chipSize,
      });
      for (let i = 0; i < snaps.length; i++) {
        this._applyReorderSnapSize(snaps[i], sizes[i], axis);
      }
      return;
    }

    let gRow = Number(gapRow) || 0;
    if (bands == null) {
      if (gapIndex < snaps.length) gRow = rowOf[gapIndex] ?? 0;
      else if (snaps.length) gRow = rowOf[snaps.length - 1] ?? 0;
    }

    for (let r = 0; r < rowBands.length; r++) {
      const row = rowBands[r];
      let available = 0;
      for (const i of row.indices) {
        available += Number(snaps[i].homeSize) || 0;
      }
      if (this._dragHomeOnReorderRow(state, row)) {
        available += Number(state.dragHomeSize) || 0;
      }
      const sizes = tabStripEqualFillSizesWithGap({
        count: row.indices.length,
        available,
        chipSize: r === gRow ? chipSize : 0,
      });
      for (let j = 0; j < row.indices.length; j++) {
        this._applyReorderSnapSize(snaps[row.indices[j]], sizes[j], axis);
      }
    }
  }

  /**
   * Reparent real tab actor onto tab-chrome layer as the float chip.
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _beginTabReorderFloat(state, x, y) {
    const tab = state.unitNode?.tab;
    if (!tab) return;

    try {
      tab.add_style_class_name?.(TAB_DRAGGING_CLASS);
      if (!tab.style_class?.includes?.(TAB_PRESSED_CLASS)) {
        tab.add_style_class_name?.(TAB_PRESSED_CLASS);
      }
    } catch (_e) {
      // disposed
    }

    const parent = typeof tab.get_parent === "function" ? tab.get_parent() : tab._parent || null;
    state.chipHomeParent = parent;

    const layer =
      this._extWm?.decorationManager?.ensureTabChromeLayer?.() ||
      this._extWm?.decorationManager?.tabChromeLayer ||
      null;

    // Prefer reparent to chrome layer; stay in-place absolute if no layer (tests).
    try {
      if (parent && typeof parent.remove_child === "function") {
        parent.remove_child(tab);
      }
      if (layer && typeof layer.add_child === "function") {
        layer.add_child(tab);
        try {
          layer.set_child_above_sibling?.(tab, null);
        } catch (_e) {
          // some mocks lack raise
        }
      } else if (parent && typeof parent.add_child === "function") {
        // Fallback: keep on parent but float via position (unit mocks).
        parent.add_child(tab);
      }
    } catch (e) {
      Logger.warn(`tab reorder float reparent: ${e}`);
    }

    try {
      tab.x_expand = false;
      tab.y_expand = false;
      tab.set_width?.(state.chipW);
      tab.set_height?.(state.chipH);
      if ("width" in tab) tab.width = state.chipW;
      if ("height" in tab) tab.height = state.chipH;
    } catch (_e) {
      // disposed
    }

    state.chipFloating = true;
    this._positionTabReorderChip(state, x, y);
    this._ensureGapSpacer(state);
  }

  /**
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _positionTabReorderChip(state, x, y) {
    const tab = state.unitNode?.tab;
    if (!tab || !state.chipFloating) return;
    const px = x - (Number(state.grabOffsetX) || 0);
    const py = y - (Number(state.grabOffsetY) || 0);
    try {
      tab.set_position?.(px, py);
      if ("x" in tab) tab.x = px;
      if ("y" in tab) tab.y = py;
      tab.translation_x = 0;
      tab.translation_y = 0;
    } catch (_e) {
      // disposed
    }
  }

  /** @param {any} state */
  _ensureGapSpacer(state) {
    if (state.gapSpacer) return state.gapSpacer;
    const host = state.chipHomeParent;
    let spacer = null;
    try {
      spacer = new St.Widget({
        reactive: false,
        style_class: "window-tabbed-tab-reorder-gap",
      });
    } catch (_e) {
      spacer = {
        width: 0,
        height: 0,
        set_width(w) {
          this.width = w;
        },
        set_height(h) {
          this.height = h;
        },
        destroy() {},
      };
    }
    state.gapSpacer = spacer;
    this._sizeGapSpacer(state);
    try {
      if (host && typeof host.add_child === "function") {
        host.add_child(spacer);
      }
    } catch (_e) {
      // host disposed
    }
    return spacer;
  }

  /** @param {any} state */
  _sizeGapSpacer(state) {
    const spacer = state.gapSpacer;
    if (!spacer) return;
    const axis = state.axis === "y" ? "y" : "x";
    try {
      if (axis === "y") {
        spacer.set_width?.(state.siblingSnap?.[0]?.crossSize || state.chipW);
        spacer.set_height?.(state.chipH);
        if ("width" in spacer) spacer.width = state.siblingSnap?.[0]?.crossSize || state.chipW;
        if ("height" in spacer) spacer.height = state.chipH;
      } else {
        spacer.set_width?.(state.chipW);
        spacer.set_height?.(state.chipH);
        if ("width" in spacer) spacer.width = state.chipW;
        if ("height" in spacer) spacer.height = state.chipH;
      }
    } catch (_e) {
      // disposed
    }
  }

  /**
   * Origin strip membership: any chip∩band (PR15). Planned AABB, never the float.
   * @param {any} state
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  _tabDragChipIntersectsOriginStrip(state, x, y) {
    const ctx = this._resolveTabStripReorderContext(state.metaWindow);
    if (!ctx) return false;
    state.groupNode = ctx.group;
    state.unitNode = ctx.unit;
    state.axis = ctx.axis;
    const hitRects = this._plannedTabStripHitRects(state, ctx);
    return chipIntersectsTabStrip({
      chip: this._tabDragChipRect(state, x, y),
      tabs: hitRects,
    });
  }

  /**
   * Peel AABB from frozen sibling homes + planned strip bar.
   * @param {any} state
   * @param {{group?:any,unit?:any}} ctx
   * @returns {Array<{x:number,y:number,width:number,height:number}>}
   */
  _plannedTabStripHitRects(state, ctx) {
    const axis = state.axis === "y" ? "y" : "x";
    const hitRects = [];
    if (state.siblingSnap?.length) {
      for (const s of state.siblingSnap) {
        if (axis === "y") {
          hitRects.push({
            x: s.cross ?? state.stripCross,
            y: s.homeStart,
            width: s.crossSize || 1,
            height: s.size,
          });
        } else {
          hitRects.push({
            x: s.homeStart,
            y: s.cross ?? state.stripCross,
            width: s.size,
            height: s.crossSize || state.chipH || 1,
          });
        }
      }
    } else {
      for (const c of ctx?.group?.childNodes || []) {
        if (state.chipFloating && c === state.unitNode) continue;
        const r = tabActorScreenRect(c?.tab);
        if (r) hitRects.push(r);
      }
    }
    const planned = this._plannedStripBarRect(state);
    if (planned) hitRects.push(planned);
    return hitRects;
  }

  /**
   * Planned strip band from freeze origin/available (not decoration transform).
   * @param {any} state
   * @returns {{x:number,y:number,width:number,height:number}|null}
   */
  _plannedStripBarRect(state) {
    if (!state) return null;
    const axis = state.axis === "y" ? "y" : "x";
    const origin = Number(state.stripOrigin);
    const available = Number(state.stripAvailable);
    if (!(available > 0) || !Number.isFinite(origin)) return null;
    let cross = Number(state.stripCross) || 0;
    let crossSize = Number(state.dragHomeCrossSize) || 0;
    if (!(crossSize > 0)) {
      crossSize = axis === "y" ? Number(state.chipW) || 1 : Number(state.chipH) || 1;
    }
    if (axis !== "y" && state.siblingSnap?.length) {
      let minC = cross;
      let maxC = cross + crossSize;
      for (const s of state.siblingSnap) {
        const c0 = Number(s.cross) || 0;
        const c1 = c0 + (Number(s.crossSize) || 0);
        if (c0 < minC) minC = c0;
        if (c1 > maxC) maxC = c1;
      }
      return { x: origin, y: minC, width: available, height: Math.max(1, maxC - minC) };
    }
    if (axis === "y") {
      return { x: cross, y: origin, width: Math.max(1, crossSize), height: available };
    }
    return { x: origin, y: cross, width: available, height: Math.max(1, crossSize) };
  }

  /**
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _updateTabReorderFromPointer(state, x, y) {
    const group = state.groupNode;
    if (!group) return;

    const axis = state.axis === "y" ? "y" : "x";
    const prevX = Number(state.lastX);
    const prevY = Number(state.lastY);
    const delta = axis === "y" ? y - prevY : x - prevX;
    if (delta > 0) state.dragDirection = 1;
    else if (delta < 0) state.dragDirection = -1;
    state.lastX = x;
    state.lastY = y;

    this._positionTabReorderChip(state, x, y);

    const snaps = state.siblingSnap || [];
    const chip = {
      x: x - (Number(state.grabOffsetX) || 0),
      y: y - (Number(state.grabOffsetY) || 0),
      width: state.chipW,
      height: state.chipH,
    };

    // STACKED: Y-axis chip gap only — never tabStripInsertIndex2D.
    if (axis === "y") {
      const sizes = snaps.map((s) => s.size);
      const segs = tabStripFlowLayoutWithGap({
        sizes,
        gapIndex: state.previewGap ?? 0,
        chipSize: state.chipH,
        origin: state.stripOrigin,
      });
      const flowTabs = segs.map((seg, i) => ({
        x: snaps[i]?.cross ?? state.stripCross,
        y: seg.start,
        width: snaps[i]?.crossSize || 1,
        height: seg.end - seg.start,
      }));
      const { index: gapIndex } = tabStripGapFromFloatingChip({
        tabs: flowTabs,
        chip,
        pointer: { x, y },
        axis: "y",
        dragDirection: state.dragDirection,
      });
      const gapChanged = state.previewGap !== gapIndex;
      state.previewGap = gapIndex;
      state.insertIndex = tabStripInsertIndexFromGap(state.fromIndex, gapIndex);
      if (gapChanged || !state._reorderVisualInit) {
        state._reorderVisualInit = true;
        this._applyTabReorderGapVisual(state, gapChanged);
      }
      return;
    }

    // TABBED: always 2D row pick + chip centerline gap.
    const kids = group.childNodes || [];
    const from = Number(state.fromIndex);
    const tabs = [];
    let snapI = 0;
    for (let i = 0; i < kids.length; i++) {
      if (i === from) {
        tabs.push(null);
        continue;
      }
      const s = snaps[snapI++];
      if (s) {
        tabs.push({
          x: s.homeStart,
          y: s.cross ?? state.stripCross,
          width: s.size,
          height: s.crossSize || state.chipH || 1,
        });
      } else {
        tabs.push(tabActorScreenRect(kids[i]?.tab));
      }
    }
    const { index: insertIndex } = tabStripInsertIndex2D({
      tabs,
      pointer: { x, y },
      chip,
      dragDirection: state.dragDirection,
      decoration: tabActorScreenRect(group.decoration),
    });
    state.insertIndex = insertIndex;
    const gapIndex = insertIndex <= from ? insertIndex : Math.max(0, insertIndex - 1);
    const gapChanged = state.previewGap !== gapIndex;
    state.previewGap = gapIndex;
    if (gapChanged || !state._reorderVisualInit) {
      state._reorderVisualInit = true;
      this._applyTabReorderGapVisual(state, gapChanged);
    }
  }

  /**
   * One layout owner: flow homes + zero translation (no dual BoxLayout+translate).
   * Spacer + fixed widths own strip packing; hit-test uses refreshed homeStart.
   * @param {Array<{tab?:any,homeStart?:number,size?:number,cross?:number}>} snaps
   * @param {Array<{start:number,end:number}>} segs
   * @param {"x"|"y"} axis
   */
  _syncReorderSiblingPack(snaps, segs, axis) {
    const list = Array.isArray(snaps) ? snaps : [];
    const layout = Array.isArray(segs) ? segs : [];
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      const seg = layout[i];
      if (!snap || !seg) continue;
      snap.homeStart = seg.start;
      const tab = snap.tab;
      if (!tab) continue;
      try {
        tab.remove_all_transitions?.();
        tab.translation_x = 0;
        tab.translation_y = 0;
        if (tab._forgeReorderBaseX != null) {
          delete tab._forgeReorderBaseX;
          delete tab._forgeReorderBaseY;
        }
        // Mocks / non-layout parents: mirror allocation. Live BoxLayout ignores this.
        if (axis === "y") {
          tab.set_position?.(Number(tab.x) || snap.cross || 0, seg.start);
          if ("y" in tab) tab.y = seg.start;
        } else {
          tab.set_position?.(seg.start, Number(tab.y) || snap.cross || 0);
          if ("x" in tab) tab.x = seg.start;
        }
      } catch (_e) {
        // disposed
      }
    }
  }

  /**
   * Place spacer + pack siblings into slots with gap at previewGap.
   * BoxLayout (or mock pack) owns positions; translations stay 0 (PR12).
   * @param {any} state
   * @param {boolean} [_animate] unused — slide is spacer index, not dual translate
   */
  _applyTabReorderGapVisual(state, _animate) {
    const snaps = state.siblingSnap || [];
    const axis = state.axis === "y" ? "y" : "x";
    const chipSize = axis === "y" ? state.chipH : state.chipW;
    const gapAt = Math.max(0, Math.min(snaps.length, Number(state.previewGap) || 0));

    this._sizeGapSpacer(state);
    this._placeGapSpacerInHost(state);

    if (axis === "y" || snaps.length === 0) {
      this._equalFillReorderSiblings(state, gapAt);
      const segs = tabStripFlowLayoutWithGap({
        sizes: snaps.map((s) => s.size),
        gapIndex: gapAt,
        chipSize,
        origin: state.stripOrigin,
      });
      this._syncReorderSiblingPack(snaps, segs, axis);
      // Horizontal BoxLayout mock/host only — STACKED packs via sync Y above.
      return;
    }

    // TABBED: pack per Y-row so multi-row does not collapse to one line.
    const { rowOf, rowBands } = this._tabReorderRowBands(snaps);

    // Gap row: prefer remaining index; boundary → nearest row by last pointer Y.
    let gapRow = 0;
    if (gapAt < snaps.length) {
      gapRow = rowOf[gapAt] ?? 0;
    } else if (snaps.length) {
      gapRow = rowOf[snaps.length - 1] ?? 0;
    }
    if (rowBands.length > 1 && state.lastY != null) {
      const py = Number(state.lastY) || 0;
      // When gap sits on a row boundary index, re-pick by pointer Y.
      const atStartOfRow =
        gapAt < snaps.length &&
        rowBands.some((row, ri) => ri > 0 && row.indices[0] === gapAt && rowOf[gapAt] === ri);
      const atEndBoundary =
        gapAt > 0 &&
        gapAt <= snaps.length &&
        rowBands.some((row, ri) => {
          const last = row.indices[row.indices.length - 1];
          return last === gapAt - 1 && ri < rowBands.length - 1;
        });
      if (atStartOfRow || atEndBoundary || gapAt === snaps.length) {
        let best = Infinity;
        let pick = gapRow;
        for (let r = 0; r < rowBands.length; r++) {
          const row = rowBands[r];
          let dist = 0;
          if (py < row.minY) dist = row.minY - py;
          else if (py > row.maxY) dist = py - row.maxY;
          if (dist < best) {
            best = dist;
            pick = r;
          }
        }
        gapRow = pick;
      }
    }

    this._equalFillReorderSiblings(state, gapAt, { rowOf, rowBands }, gapRow);

    for (let r = 0; r < rowBands.length; r++) {
      const row = rowBands[r];
      const rowSnaps = row.indices.map((i) => snaps[i]);
      // Single-row: strip left. Multi-row: leftmost *snapshot* origin in that band
      // (not live homeStart — that moves after pack and would nest the gap).
      const origin =
        rowBands.length <= 1
          ? state.stripOrigin
          : rowSnaps.length > 0
          ? Math.min(
              ...rowSnaps.map((s) => Number(s.layoutOrigin ?? s.homeStart) || state.stripOrigin)
            )
          : state.stripOrigin;
      const localGap = r === gapRow ? row.indices.filter((i) => i < gapAt).length : rowSnaps.length;
      const segs = tabStripFlowLayoutWithGap({
        sizes: rowSnaps.map((s) => s.size),
        gapIndex: localGap,
        chipSize: r === gapRow ? chipSize : 0,
        origin,
      });
      this._syncReorderSiblingPack(rowSnaps, segs, axis);
    }
    // Relayout each distinct strip host (single-row deco or multi-row hosts).
    const hosts = new Set();
    for (const s of snaps) {
      const p =
        (s.tab && typeof s.tab.get_parent === "function" ? s.tab.get_parent() : null) ||
        s.tab?._parent ||
        state.chipHomeParent;
      if (p) hosts.add(p);
    }
    if (state.chipHomeParent) hosts.add(state.chipHomeParent);
    for (const host of hosts) {
      host._forgeRelayoutStrip?.();
    }
  }

  /**
   * Reorder spacer among host children to match previewGap.
   * @param {any} state
   */
  _placeGapSpacerInHost(state) {
    const spacer = state.gapSpacer;
    const snaps = state.siblingSnap || [];
    if (!spacer) return;

    const gapAt = Math.max(0, Math.min(snaps.length, Number(state.previewGap) || 0));
    // Multi-row: spacer follows the row host of the gap reference tab.
    let host = state.chipHomeParent;
    if (state.axis !== "y" && snaps.length) {
      const ref = gapAt < snaps.length ? snaps[gapAt] : snaps[snaps.length - 1];
      const tab = ref?.tab;
      const tabHost =
        (tab && typeof tab.get_parent === "function" ? tab.get_parent() : null) ||
        tab?._parent ||
        null;
      if (tabHost) host = tabHost;
    }
    if (!host) return;

    try {
      const curParent =
        typeof spacer.get_parent === "function" ? spacer.get_parent() : spacer._parent;
      if (curParent && curParent !== host && typeof curParent.remove_child === "function") {
        curParent.remove_child(spacer);
      } else if (typeof host.remove_child === "function" && host.contains?.(spacer)) {
        host.remove_child(spacer);
      } else if (typeof host.remove_child === "function") {
        try {
          host.remove_child(spacer);
        } catch (_e) {
          // not a child
        }
      }
    } catch (_e) {
      // disposed
    }

    // Among this host's snap tabs only (row-local index).
    const hostSnaps = snaps.filter((s) => {
      const p =
        (s.tab && typeof s.tab.get_parent === "function" ? s.tab.get_parent() : null) ||
        s.tab?._parent;
      return p === host || (!p && host === state.chipHomeParent);
    });
    let localGap = 0;
    if (hostSnaps.length) {
      // Global gapAt → how many host snaps appear before it in snaps order.
      const hostSet = new Set(hostSnaps);
      for (let i = 0; i < snaps.length && i < gapAt; i++) {
        if (hostSet.has(snaps[i])) localGap++;
      }
      // If gap host is a row entirely after gapAt, localGap stays 0.
      if (gapAt >= snaps.length) {
        localGap = hostSnaps.length;
      }
    } else {
      localGap = gapAt;
    }

    try {
      if (typeof host.insert_child_at_index === "function") {
        let insertAt = 0;
        const children = typeof host.get_children === "function" ? host.get_children() : [];
        let seen = 0;
        for (let i = 0; i < children.length; i++) {
          if (seen >= localGap) {
            insertAt = i;
            break;
          }
          const isSnapTab = hostSnaps.some((s) => s.tab === children[i]);
          if (isSnapTab) seen++;
          insertAt = i + 1;
        }
        host.insert_child_at_index(spacer, insertAt);
      } else if (typeof host.add_child === "function") {
        host.add_child(spacer);
      }
    } catch (_e) {
      try {
        host.add_child?.(spacer);
      } catch (_e2) {
        // give up
      }
    }
  }

  /**
   * @param {any} tab
   * @param {number} tx
   * @param {number} ty
   * @param {boolean} animate
   */
  _easeTabTranslation(tab, tx, ty, animate) {
    if (!tab) return;
    try {
      tab.remove_all_transitions?.();
    } catch (_e) {
      // none
    }
    const apply = () => {
      try {
        if ("translation_x" in tab || tab.translation_x !== undefined) {
          tab.translation_x = tx;
          tab.translation_y = ty;
        } else if (typeof tab.set_position === "function" && tabActorScreenRect(tab)) {
          // Mocks without translation: shift x/y from home via stored base.
          if (tab._forgeReorderBaseX == null) {
            tab._forgeReorderBaseX = Number(tab.x) || 0;
            tab._forgeReorderBaseY = Number(tab.y) || 0;
          }
          tab.set_position(tab._forgeReorderBaseX + tx, tab._forgeReorderBaseY + ty);
          tab.x = tab._forgeReorderBaseX + tx;
          tab.y = tab._forgeReorderBaseY + ty;
        }
      } catch (_e) {
        // disposed
      }
    };

    if (
      animate &&
      typeof tab.ease === "function" &&
      ("translation_x" in tab || tab.translation_x !== undefined)
    ) {
      try {
        tab.ease({
          translation_x: tx,
          translation_y: ty,
          duration: TAB_REORDER_SLIDE_MS,
          mode: Clutter.AnimationMode?.EASE_OUT_QUAD ?? 1,
        });
        return;
      } catch (_e) {
        // fall through
      }
    }
    apply();
  }

  /**
   * Clear fixed tab size so BoxLayout equal-fill can reclaim the row.
   * @param {any} tab
   * @param {"x"|"y"} axis
   */
  _clearTabReorderFixedSize(tab, axis) {
    if (!tab) return;
    try {
      if (axis === "y") {
        tab.set_height?.(-1);
        if ("height" in tab) tab.height = -1;
      } else {
        tab.set_width?.(-1);
        if ("width" in tab) tab.width = -1;
      }
    } catch (_e) {
      // disposed
    }
  }

  /**
   * Close origin gap/spacer and unfreeze remaining siblings. Chip stays put.
   * @param {any} [state]
   */
  _clearTabReorderOriginGap(state) {
    if (!state) return;
    const host = state.chipHomeParent;
    const axis = state.axis === "y" ? "y" : "x";

    if (state.gapSpacer) {
      try {
        const sp = state.gapSpacer;
        const p = typeof sp.get_parent === "function" ? sp.get_parent() : sp._parent;
        if (p?.remove_child) p.remove_child(sp);
        else host?.remove_child?.(sp);
        sp.destroy?.();
      } catch (_e) {
        // disposed
      }
      state.gapSpacer = null;
    }

    for (const snap of state.siblingSnap || []) {
      const t = snap.tab;
      if (!t) continue;
      try {
        t.remove_all_transitions?.();
        if ("translation_x" in t || t.translation_x !== undefined) {
          t.translation_x = 0;
          t.translation_y = 0;
        }
        if (t._forgeReorderBaseX != null) {
          t.set_position?.(t._forgeReorderBaseX, t._forgeReorderBaseY);
          t.x = t._forgeReorderBaseX;
          t.y = t._forgeReorderBaseY;
          delete t._forgeReorderBaseX;
          delete t._forgeReorderBaseY;
        }
        if (snap.expandX !== undefined) t.x_expand = snap.expandX;
        if (snap.expandY !== undefined) t.y_expand = snap.expandY;
        this._clearTabReorderFixedSize(t, axis);
      } catch (_e) {
        // disposed
      }
    }
    state.siblingSnap = null;
  }

  /**
   * Reparent float chip onto strip host and restore expand/size.
   * @param {any} [state]
   */
  _restoreTabReorderChip(state) {
    if (!state) return;
    const unit = state.unitNode;
    const tab = unit?.tab;
    const host = state.chipHomeParent;
    const axis = state.axis === "y" ? "y" : "x";

    if (state.chipFloating && tab) {
      try {
        tab.remove_style_class_name?.(TAB_DRAGGING_CLASS);
        const curParent = typeof tab.get_parent === "function" ? tab.get_parent() : tab._parent;
        if (curParent && curParent !== host && typeof curParent.remove_child === "function") {
          curParent.remove_child(tab);
        }
        if (host && typeof host.add_child === "function") {
          const already =
            typeof host.contains === "function" ? host.contains(tab) : host === curParent;
          if (!already) host.add_child(tab);
        }
      } catch (e) {
        Logger.warn?.(`tab reorder float restore: ${e}`);
      }
      state.chipFloating = false;
    }

    if (tab && !state.foreign) {
      try {
        if (state.chipExpandX !== undefined) tab.x_expand = state.chipExpandX;
        else tab.x_expand = true;
        if (state.chipExpandY !== undefined) tab.y_expand = state.chipExpandY;
        this._clearTabReorderFixedSize(tab, axis);
      } catch (_e) {
        // disposed
      }
    }
  }

  /**
   * Tear down float chip, spacer, sibling freezes — no tree mutate.
   * @param {any} [state]
   */
  _teardownTabReorderPreview(state) {
    if (!state) return;
    this._clearTabReorderOriginGap(state);
    this._restoreTabReorderChip(state);
  }

  /** Force equal-fill path after a strip reorder gesture (order change or not). */
  _relayoutAfterTabStripGesture(reason = "tab-strip-reorder") {
    const wm = this._extWm;
    try {
      if (typeof wm?.commitLayout === "function") {
        wm.commitLayout(reason, { force: true });
      } else {
        wm?.renderTree?.(reason, true);
      }
    } catch (e) {
      Logger.warn(`tab-strip-reorder layout: ${e}`);
    }
  }

  /** Commit strip reorder via replaceChildren; percents and open-leaf stay put. */
  _commitTabStripReorder(state) {
    const wm = this._extWm;
    const group = state?.groupNode;
    const unit = state?.unitNode;
    let insertIndex = state?.insertIndex;
    this._teardownTabReorderPreview(state);

    if (
      !group ||
      !unit ||
      unit.parentNode !== group ||
      typeof group.replaceChildren !== "function" ||
      insertIndex == null
    ) {
      this._disarmTabDrag({ keepSynthetic: false });
      // Frozen widths must not stick even when commit aborts early.
      this._relayoutAfterTabStripGesture("tab-strip-reorder");
      return;
    }

    const kids = [...(group.childNodes || [])];
    const fromIndex = kids.indexOf(unit);
    if (fromIndex < 0) {
      this._disarmTabDrag({ keepSynthetic: false });
      this._relayoutAfterTabStripGesture("tab-strip-reorder");
      return;
    }

    const next = applyTabStripReorder(kids, fromIndex, insertIndex);
    let same = next.length === kids.length;
    if (same) {
      for (let i = 0; i < kids.length; i++) {
        if (next[i] !== kids[i]) {
          same = false;
          break;
        }
      }
    }

    this._disarmTabDrag({ keepSynthetic: false });

    // D023: only Node.replaceChildren — do not resetSiblingPercent (percents travel).
    if (!same) {
      group.replaceChildren(next);
    }

    // Always re-layout (including same-order) so equal-fill recovers from freezes.
    this._relayoutAfterTabStripGesture("tab-strip-reorder");

    // Open leaf / pin stay on the dragged child — no surprise reveal.
    if (same) return;
    try {
      let settle = unit;
      if (unit && typeof unit.isWindow === "function" && !unit.isWindow()) {
        settle = unit.getNodeByType?.(NODE_TYPES.WINDOW)?.[0] || unit;
      }
      if (settle && typeof wm?.settleTabFocus === "function") {
        wm.settleTabFocus(settle);
      }
    } catch (_e) {
      // best-effort chrome
    }
  }

  _beginSyntheticTabMove(metaWindow, grabOp) {
    const wm = this._extWm;
    const display = global.display;
    wm._handleGrabOpBegin(display, metaWindow, grabOp);
  }

  _endSyntheticTabMove(state) {
    const wm = this._extWm;
    const metaWindow = state?.metaWindow;
    const grabOp = state?.grabOp ?? Meta.GrabOp.MOVING_UNCONSTRAINED;
    if (state?.lastX != null && state?.lastY != null) {
      this._stashSyntheticDragPointer(state.lastX, state.lastY);
    }
    // Clear arm before grab-end (grab-end also disarms — idempotent).
    this._disarmTabDrag({ keepSynthetic: false });
    try {
      wm._handleGrabOpEnd(global.display, metaWindow, grabOp);
    } finally {
      this._syntheticDragPointer = null;
    }
  }

  /**
   * Stage-event pointer for synthetic tab peel (survives disarm into grab-end).
   * @param {number} x
   * @param {number} y
   */
  _stashSyntheticDragPointer(x, y) {
    this._syntheticDragPointer = [Number(x) || 0, Number(y) || 0, this._pointerMods()];
  }

  /** @returns {number} */
  _pointerMods() {
    try {
      const p = this._extWm?.getPointer?.() || global.get_pointer?.();
      if (Array.isArray(p) && p.length >= 3) return p[2];
    } catch (_e) {
      // none
    }
    return 0;
  }

  /**
   * Chip stage rect from pointer + grab offset (1×1 if not yet floated).
   * @param {any} state
   * @param {number} x
   * @param {number} y
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  _tabDragChipRect(state, x, y) {
    const w = Math.max(1, Number(state?.chipW) || 1);
    const h = Math.max(1, Number(state?.chipH) || 1);
    return {
      x: (Number(x) || 0) - (Number(state?.grabOffsetX) || 0),
      y: (Number(y) || 0) - (Number(state?.grabOffsetY) || 0),
      width: w,
      height: h,
    };
  }

  /**
   * Chip for hit-test when `_tabDrag` may already be gone (grab-end).
   * @param {number|{x?:number,y?:number}|number[]|null} pointer
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  _chipRectFromPointer(pointer) {
    const [x, y] = _pointerXY(pointer);
    const tabDrag = this._tabDrag;
    if (tabDrag && (Number(tabDrag.chipW) > 0 || Number(tabDrag.chipH) > 0)) {
      return this._tabDragChipRect(tabDrag, x, y);
    }
    return { x, y, width: 1, height: 1 };
  }

  /**
   * One chip+coord owner: stash event coords and move the float.
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _syncTabDragChipToPointer(state, x, y) {
    if (!state) return;
    state.lastX = x;
    state.lastY = y;
    this._stashSyntheticDragPointer(x, y);
    this._positionTabReorderChip(state, x, y);
  }

  /**
   * Rebuild origin gap after peel when the chip re-intersects the home strip.
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _reenterOriginStripPreview(state, x, y) {
    if (!state) return;
    if (!state.siblingSnap) {
      this._snapshotReorderSiblings(state);
      this._ensureGapSpacer(state);
    }
    state.reorder = true;
    this._updateTabReorderFromPointer(state, x, y);
    this._originStripCommit = {
      group: state.groupNode,
      unit: state.unitNode,
      insertIndex: state.insertIndex,
    };
  }

  /**
   * Close origin re-entry gap (chip stays). Clears origin commit stash.
   * @param {any} [state]
   */
  _clearOriginStripPreview(state) {
    this._originStripCommit = null;
    if (!state) return;
    if (state.siblingSnap || state.gapSpacer) {
      this._clearTabReorderOriginGap(state);
    }
    if (state.started) state.reorder = false;
  }

  /**
   * Same-group reorder at grab-end when the last motion had chip∩origin strip.
   * @param {any} focusNodeWindow
   * @returns {boolean}
   */
  _commitOriginStripReorder(focusNodeWindow) {
    const stash = this._originStripCommit;
    this._originStripCommit = null;
    if (!stash?.group || stash.insertIndex == null) return false;
    const group = stash.group;
    let unit = stash.unit;
    if (!unit || unit.parentNode !== group) {
      let u = focusNodeWindow;
      while (u && u.parentNode !== group) u = u.parentNode;
      unit = u;
    }
    if (!unit || unit.parentNode !== group) return false;
    if (typeof group.replaceChildren !== "function") return false;
    const kids = [...(group.childNodes || [])];
    const fromIndex = kids.indexOf(unit);
    if (fromIndex < 0) return false;
    const next = applyTabStripReorder(kids, fromIndex, stash.insertIndex);
    let same = next.length === kids.length;
    if (same) {
      for (let i = 0; i < kids.length; i++) {
        if (next[i] !== kids[i]) {
          same = false;
          break;
        }
      }
    }
    if (!same) group.replaceChildren(next);
    return true;
  }

  /**
   * One button-release residual clear: pressed/dragging, reorder preview, zones.
   * Commit stashes (`_originStripCommit` / `_foreignStripCommit`) stay until
   * grab-end consumes them.
   */
  clearTabDragResiduals() {
    this._clearForeignStripPreview();
    this._cancelTabDragPointerPoll();
    const state = this._tabDrag;
    if (state) {
      this._teardownTabReorderPreview(state);
      this._clearTabPressedClasses(state);
      this._disconnectTabDragStage(state);
    }
    this._tabDrag = null;
    this.clearAllPreviewHints();
  }

  /**
   * @param {any} [state]
   */
  _clearTabPressedClasses(state) {
    const tabs = new Set();
    if (state?.pressedTab) tabs.add(state.pressedTab);
    if (state?.unitNode?.tab) tabs.add(state.unitNode.tab);
    let group = state?.groupNode;
    if (!group && state?.metaWindow) {
      try {
        group = this._resolveTabStripReorderContext(state.metaWindow)?.group;
      } catch (_e) {
        group = null;
      }
    }
    for (const c of group?.childNodes || []) {
      if (c?.tab) tabs.add(c.tab);
    }
    for (const tab of tabs) {
      try {
        tab.remove_style_class_name?.(TAB_PRESSED_CLASS);
        tab.remove_style_class_name?.(TAB_DRAGGING_CLASS);
      } catch (_e) {
        // disposed
      }
    }
  }

  /**
   * @param {{ keepSynthetic?: boolean }} [opts]
   *  keepSynthetic reserved; currently always clears full tab-drag state.
   */
  _disarmTabDrag(_opts = {}) {
    this.clearTabDragResiduals();
  }

  _disconnectTabDragStage(state) {
    if (!state?.stageIds?.length) return;
    const stage = global.stage;
    for (const id of state.stageIds) {
      try {
        stage?.disconnect?.(id);
      } catch (_e) {
        // stage gone
      }
    }
    state.stageIds = [];
  }

  /** Cancel an armed (not yet started), reorder, or synthetic tab drag. */
  cancelTabDrag() {
    const state = this._tabDrag;
    if (!state) return;
    if (state.started && state.synthetic) {
      this._endSyntheticTabMove(state);
      return;
    }
    const wasReorder = !!state.reorder;
    // Reorder cancel: drop arming without commit; still equal-fill restore.
    this._disarmTabDrag({ keepSynthetic: false });
    if (wasReorder) {
      this._relayoutAfterTabStripGesture("tab-strip-reorder-cancel");
    }
  }

  _handleMoving(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;

    const tabDrag = this._tabDrag;
    const pointer = wm.getDragPointer(focusNodeWindow);
    const [px, py] = _pointerXY(pointer);
    if (tabDrag?.synthetic) {
      this._syncTabDragChipToPointer(tabDrag, px, py);
    }

    // Refresh workspace-wide targets each motion (cross-mon + mid-drag maps).
    wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);

    const nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    wm.nodeWinAtPointer = nodeWinAtPointer;

    const chip = tabDrag
      ? this._tabDragChipRect(tabDrag, px, py)
      : this._chipRectFromPointer(pointer);

    // Chip∩origin strip → re-enter origin gap (same-group REORDER visual).
    if (tabDrag && this._tabDragChipIntersectsOriginStrip(tabDrag, px, py)) {
      this._foreignStripCommit = null;
      this._clearForeignStripPreview();
      this._reenterOriginStripPreview(tabDrag, px, py);
      this._hidePreviewActors(focusNodeWindow);
      return;
    }

    const dest = this._hitTestForeignTabStrip(focusNodeWindow, pointer, chip);
    if (dest) {
      this._clearOriginStripPreview(tabDrag);
      this._updateForeignStripPreview(focusNodeWindow, dest, pointer);
      this._hidePreviewActors(focusNodeWindow);
      return;
    }
    this._foreignStripCommit = null;
    this._clearForeignStripPreview();
    this._clearOriginStripPreview(tabDrag);

    // Hints: setting on always, or tile-mod (Super) when setting is off.
    // Drop commit still requires allowDragDropTile() at grab-end.
    const showHints = this._previewHintsWanted();
    if (!showHints) {
      this.clearAllPreviewHints();
      return;
    }

    if (nodeWinAtPointer) {
      this._ensurePreviewActors(focusNodeWindow);
      // Paint all five zones + emphasize hover; Super-only when setting is off
      // still reaches here via _previewHintsWanted → allowDragDropTile.
      wm.moveWindowToPointer(focusNodeWindow, true);
    } else {
      // R015: empty mon / gap on foreign mon — full work-area preview (or hide).
      wm.moveWindowToPointer(focusNodeWindow, true);
    }
  }

  _getDragDropCenterPreviewStyle() {
    return `window-tilepreview-${this._extWm._resolveDndCenterLayout().toLowerCase()}`;
  }

  /** TABBED/STACKED ancestor of a node, or null. */
  _originGroupOf(node) {
    let p = node?.parentNode;
    while (p && typeof p.isStackedOrTabbed === "function" && !p.isStackedOrTabbed()) {
      p = p.parentNode;
    }
    return p && typeof p.isStackedOrTabbed === "function" && p.isStackedOrTabbed() ? p : null;
  }

  /**
   * Chip (or 1×1 pointer) over another group's strip band. Origin excluded.
   * @param {any} focusNodeWindow
   * @param {number|{x?:number,y?:number}|number[]} pointer
   * @param {{x?:number,y?:number,width?:number,height?:number}|null} [chip]
   * @returns {any|null}
   */
  _hitTestForeignTabStrip(focusNodeWindow, pointer, chip = null) {
    if (!focusNodeWindow || (pointer == null && !chip)) return null;
    const exclude = this._originGroupOf(focusNodeWindow);
    const cons = this._tree?.getNodeByType?.(NODE_TYPES.CON) || [];
    const strips = [];
    for (const g of cons) {
      if (!g || g === exclude) continue;
      if (typeof g.isStackedOrTabbed !== "function" || !g.isStackedOrTabbed()) continue;
      if (g.contains?.(focusNodeWindow)) continue;
      strips.push({ group: g, rects: this._collectGroupStripHitRects(g) });
    }
    if (chip) {
      return findTabStripIntersectingChip({ strips, chip, excludeGroup: exclude });
    }
    return findForeignTabStripAtPointer({ strips, pointer, excludeGroup: exclude });
  }

  /**
   * @param {any} destGroup
   * @param {number} x
   * @param {number} y
   * @param {any} [focusNodeWindow]
   * @returns {number}
   */
  _computeForeignStripInsertIndex(destGroup, x, y, focusNodeWindow) {
    const axis = destGroup?.isStacked?.() ? "y" : "x";
    const tabs = [];
    for (const c of destGroup?.childNodes || []) {
      if (c === focusNodeWindow) continue;
      tabs.push(tabActorScreenRect(c?.tab));
    }
    const home = tabActorScreenRect(focusNodeWindow?.tab);
    const chipW = this._tabDragChipMinWidth(home?.width);
    const chipH = home?.height > 0 ? home.height : chipW;
    const grabX = this._foreignStrip?.grabOffsetX;
    const grabY = this._foreignStrip?.grabOffsetY;
    const chip = {
      x: x - (grabX != null ? grabX : chipW / 2),
      y: y - (grabY != null ? grabY : chipH / 2),
      width: chipW,
      height: chipH,
    };
    const dir = this._foreignStrip?.dragDirection ?? this._foreignStripCommit?.dragDirection ?? 1;
    const { index } = foreignStripInsertIndex({
      tabs,
      pointer: { x, y },
      chip,
      dragDirection: dir,
      axis,
      decoration: tabActorScreenRect(destGroup?.decoration),
    });
    return index;
  }

  /**
   * @param {any} focusNodeWindow
   * @param {any} destGroup
   * @param {number|{x?:number,y?:number}|number[]} pointer
   */
  _updateForeignStripPreview(focusNodeWindow, destGroup, pointer) {
    const [x, y] = _pointerXY(pointer);
    let state = this._foreignStrip;
    if (!state || state.groupNode !== destGroup) {
      this._clearForeignStripPreview();
      state = this._beginForeignStripPreview(focusNodeWindow, destGroup, x, y);
    }
    this._updateForeignStripFromPointer(state, x, y);
    this._foreignStripCommit = {
      group: destGroup,
      insertIndex: state.insertIndex,
      dragDirection: state.dragDirection,
    };
  }

  /**
   * @param {any} focusNodeWindow
   * @param {any} destGroup
   * @param {number} x
   * @param {number} y
   * @returns {any}
   */
  _beginForeignStripPreview(focusNodeWindow, destGroup, x, y) {
    const axis = destGroup?.isStacked?.() ? "y" : "x";
    const tab = focusNodeWindow?.tab;
    const home = tabActorScreenRect(tab);
    const chipW = this._tabDragChipMinWidth(home?.width);
    const chipH = home?.height > 0 ? home.height : this._tabDragChipMinWidth(0);
    const host = destGroup?.decoration || null;
    const armed = this._tabDrag;
    const grabOffsetX = armed?.grabOffsetX != null ? armed.grabOffsetX : chipW / 2;
    const grabOffsetY = armed?.grabOffsetY != null ? armed.grabOffsetY : chipH / 2;
    // Spacer-only: never reparent the live tab (Mutter-grab freeze class).
    const state = {
      groupNode: destGroup,
      unitNode: focusNodeWindow,
      axis,
      fromIndex: destGroup?.childNodes?.length ?? 0,
      previewGap: 0,
      insertIndex: destGroup?.childNodes?.length ?? 0,
      dragDirection: 1,
      lastX: x,
      lastY: y,
      grabOffsetX,
      grabOffsetY,
      chipW,
      chipH,
      chipFloating: false,
      chipHomeParent: host,
      siblingSnap: null,
      gapSpacer: null,
      stripOrigin: 0,
      stripCross: 0,
      foreign: true,
    };
    this._foreignStrip = state;
    this._snapshotReorderSiblings(state);
    this._ensureGapSpacer(state);
    return state;
  }

  /**
   * @param {any} state
   * @param {number} x
   * @param {number} y
   */
  _updateForeignStripFromPointer(state, x, y) {
    if (!state) return;
    const axis = state.axis === "y" ? "y" : "x";
    const prevX = Number(state.lastX);
    const prevY = Number(state.lastY);
    const delta = axis === "y" ? y - prevY : x - prevX;
    if (delta > 0) state.dragDirection = 1;
    else if (delta < 0) state.dragDirection = -1;
    state.lastX = x;
    state.lastY = y;
    this._positionTabReorderChip(state, x, y);

    const snaps = state.siblingSnap || [];
    const tabs = snaps.map((s) =>
      axis === "y"
        ? {
            x: s.cross ?? state.stripCross,
            y: s.homeStart,
            width: s.crossSize || 1,
            height: s.size,
          }
        : {
            x: s.homeStart,
            y: s.cross ?? state.stripCross,
            width: s.size,
            height: s.crossSize || state.chipH || 1,
          }
    );
    const chip = {
      x: x - (Number(state.grabOffsetX) || 0),
      y: y - (Number(state.grabOffsetY) || 0),
      width: state.chipW,
      height: state.chipH,
    };
    const { index } = foreignStripInsertIndex({
      tabs,
      pointer: { x, y },
      chip,
      dragDirection: state.dragDirection,
      axis,
      decoration: tabActorScreenRect(state.groupNode?.decoration),
    });
    const gapChanged = state.previewGap !== index;
    state.previewGap = index;
    state.insertIndex = index;
    if (gapChanged || !state._reorderVisualInit) {
      state._reorderVisualInit = true;
      this._applyTabReorderGapVisual(state, gapChanged);
    }
  }

  _clearForeignStripPreview() {
    const state = this._foreignStrip;
    if (!state) return;
    this._teardownTabReorderPreview(state);
    this._foreignStrip = null;
  }

  /**
   * Join dragged window into dest group at the strip gap index (D044).
   * @param {any} focusNodeWindow
   * @param {any} destGroup
   * @param {number|{x?:number,y?:number}|number[]} pointer
   * @returns {boolean}
   */
  _commitForeignStripJoin(focusNodeWindow, destGroup, pointer) {
    if (!focusNodeWindow || !destGroup) return false;
    if (focusNodeWindow.parentNode === destGroup) return false;

    const [x, y] = _pointerXY(pointer);
    const stash = this._foreignStripCommit;
    let insertIndex;
    if (stash?.group === destGroup && stash.insertIndex != null) {
      insertIndex = stash.insertIndex;
    } else {
      insertIndex = this._computeForeignStripInsertIndex(destGroup, x, y, focusNodeWindow);
    }
    this._foreignStripCommit = null;

    const destMember =
      destGroup.childNodes?.find(
        (n) => n.nodeType === NODE_TYPES.WINDOW && n !== focusNodeWindow
      ) || destGroup.getNodeByType?.(NODE_TYPES.WINDOW)?.[0];
    if (!destMember || destMember === focusNodeWindow) return false;

    const previousParent = focusNodeWindow.parentNode;
    if (focusNodeWindow.tab) {
      try {
        const decoParent = focusNodeWindow.tab.get_parent();
        if (decoParent) decoParent.remove_child(focusNodeWindow.tab);
      } catch (e) {
        Logger.warn(`Failed to remove tab decoration: ${e}`);
      }
    }

    const stackedOn =
      destGroup.isStacked?.() &&
      this._extWm?.ext?.settings?.get_boolean?.("stacked-tiling-mode-enabled");
    const layout = stackedOn
      ? LAYOUT_TYPES.STACKED
      : destGroup.isStacked?.()
      ? LAYOUT_TYPES.TABBED
      : destGroup.layout || LAYOUT_TYPES.TABBED;

    this._tree.mergeWindowsIntoGroup(destMember, focusNodeWindow, layout, {
      insertIndex,
      group: destGroup,
    });

    previousParent?.resetLayoutSingleChild?.();
    return focusNodeWindow.parentNode === destGroup;
  }
}
