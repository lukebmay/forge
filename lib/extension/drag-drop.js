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
import { dropChangesStructure, shouldMergeCenterGroup } from "./drop-intent.js";
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

/** Logical min chip width (icon+close+min label); scaled by dpi at runtime. */
const TAB_DRAG_CHIP_MIN_WIDTH_LOGICAL = 80;

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
 * Pure: gap insert-before among strip-flow tabs from floating chip leading edge.
 * `tabs` are remaining siblings (exclude dragged, or mark `{ skip: true }`) with
 * layout rects as if a chip-sized gap is already reserved.
 * Leading edge = max axis edge when dragDirection ≥ 0, else min edge.
 *
 * @param {{
 *   tabs?: Array<{start?:number,end?:number,x?:number,y?:number,width?:number,height?:number,skip?:boolean}>,
 *   chip?: {x?:number,y?:number,width?:number,height?:number}|null,
 *   axis?: "x"|"y",
 *   dragDirection?: number,
 * }} [opts]
 * @returns {{ index: number }} insert-before in 0..tabs.length (remaining)
 */
export function tabStripGapFromFloatingChip({ tabs, chip, axis = "x", dragDirection = 1 } = {}) {
  const list = (Array.isArray(tabs) ? tabs : []).filter((t) => t && !t.skip);
  if (list.length === 0) return { index: 0 };
  const ax = axis === "y" ? "y" : "x";
  const dir = Number(dragDirection);
  const positive = !(dir < 0);

  let leading = 0;
  if (chip) {
    if (ax === "y") {
      const y = Number(chip.y) || 0;
      const h = Number(chip.height) || 0;
      leading = positive ? y + h : y;
    } else {
      const x = Number(chip.x) || 0;
      const w = Number(chip.width) || 0;
      leading = positive ? x + w : x;
    }
  }

  for (let i = 0; i < list.length; i++) {
    const seg = _tabSegment(list[i], ax);
    if (!seg) continue;
    const center = (seg.start + seg.end) / 2;
    if (center > leading) return { index: i };
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
 * Pure: TABBED multi-row insert-before via row pick + chip centerline gap.
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
 * Pure: whether pointer is over the union of tab strip rects (optional pad).
 * @param {{
 *   tabs: Array<{x:number,y:number,width:number,height:number}|null|undefined>,
 *   pointer: {x?:number,y?:number}|number[]|[number,number],
 *   pad?: number,
 * }} opts
 * @returns {boolean}
 */
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

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
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
    const previewHint = focusNodeWindow?.previewHint;
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
      for (const z of PAINT_ZONE_ORDER) {
        const actor = zoneActors[z];
        const rect = paintRects[z];
        if (!actor || !rect) continue;
        actor.set_position(rect.x - unit.x, rect.y - unit.y);
        actor.set_size(rect.width, rect.height);
        const hover = z === operation.zone;
        actor.set_style_class_name(
          hover ? operation.previewClass || ZONE_PREVIEW_CLASS : ZONE_PREVIEW_CLASS
        );
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

    const nodeWinAtPointer = wm.nodeWinAtPointer;
    if (!nodeWinAtPointer) {
      // R015: no TILE under pointer — empty mon / gap cross-mon drop.
      // Mid-drag rehome is skipped (R012); grab-end must commit mon move.
      if (preview) {
        this._previewEmptyMonitorDrop(focusNodeWindow);
      } else {
        this._commitEmptyMonitorDrop(focusNodeWindow);
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

    // Same slot / already correct relative place → paint zone, skip structure change.
    if (this._isNoOpDrop(focusNodeWindow, nodeWinAtPointer, operation, ctx)) {
      if (preview) {
        wm._showDropPreview(focusNodeWindow, operation);
      }
      return;
    }

    // Execute or preview
    if (preview) {
      wm._showDropPreview(focusNodeWindow, operation);
    } else {
      wm._executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx);
    }
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
    const pointerCoord = wm.getPointer();
    const start = wm._grabStartPointer;
    if (!start || pointerCoord[0] !== start[0] || pointerCoord[1] !== start[1]) {
      return pointerCoord;
    }
    const inside = wm.getPointerPositionInside(focusNodeWindow);
    return inside ? [inside.x, inside.y, pointerCoord[2]] : pointerCoord;
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
    // Single full-mon bin (no five-zone geometry without a unit tile).
    const operation = {
      zone: DROP_ZONES.CENTER,
      previewRect: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      },
      previewClass: "window-tilepreview-tiled",
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
    const wm = this._extWm;
    const decision = this._resolveEmptyMonitorDropDecision(focusNodeWindow, destMonOverride);
    if (!decision) return false;

    const meta = focusNodeWindow.nodeValue;
    if (!meta || !Utils.isWindowAlive(meta)) return false;

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
      if (
        focusNodeWindow.grabMode === GRAB_TYPES.MOVING &&
        focusNodeWindow.mode === WINDOW_MODES.TILE
      ) {
        wm.freezeRender();
        focusNodeWindow.mode = WINDOW_MODES.GRAB_TILE;
      }

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

      // Bug #433 fix: Track the window being dragged for preview hint cleanup
      wm._draggedNodeWindow = focusNodeWindow;
    }
  }

  _handleGrabOpEnd(_display, metaWindow, grabOp) {
    const wm = this._extWm;
    // Tab-drag arming ends with the Mutter grab (or our synthetic end).
    this._disarmTabDrag({ keepSynthetic: false });
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
      return;
    }
    let focusNodeWindow = wm.findNodeWindow(focusMetaWindow);

    if (focusNodeWindow) {
      // WINDOW_BASE is when grabbing the window decoration
      // COMPOSITOR is when something like Overview requesting a grab, especially when Super is pressed.
      if (
        grabOp === Meta.GrabOp.WINDOW_BASE ||
        grabOp === Meta.GrabOp.COMPOSITOR ||
        grabOp === Meta.GrabOp.MOVING_UNCONSTRAINED ||
        grabOp === Meta.GrabOp.MOVING
      ) {
        if (wm.allowDragDropTile()) {
          // Fresh target at commit (stale motion / mid-drag mon thrash).
          wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);
          wm.nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
          wm.moveWindowToPointer(focusNodeWindow);
        }
      }
    }

    // Bug #433 fix: Clean up preview hint from the originally dragged window
    // This handles cases where focus changed during drag (e.g., crossing monitors)
    if (wm._draggedNodeWindow && wm._draggedNodeWindow !== focusNodeWindow) {
      wm._grabCleanup(wm._draggedNodeWindow);
    }
    wm._draggedNodeWindow = null;

    wm._grabCleanup(focusNodeWindow);

    // StructureChanged: exactly one C for the drop gesture (swap path no longer
    // commits in _executeDropOperation).
    if (Compat.isNotMaximized(focusMetaWindow)) {
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
    };

    const stage = global.stage;
    if (stage && typeof stage.connect === "function") {
      // Capture so motion still arrives after the pointer leaves the tab actor.
      const id = stage.connect("captured-event", (_actor, ev) => {
        this._onTabDragStageEvent(ev);
        return Clutter.EVENT_PROPAGATE;
      });
      this._tabDrag.stageIds.push(id);
    }
    // Without stage.connect (unit mocks), drive via noteTabDragMotion /
    // finishTabDragRelease; tab actors also wire motion/release.
    return true;
  }

  /**
   * Test / fallback entry: report pointer position while a tab drag is armed.
   * @param {number} x
   * @param {number} y
   * @returns {"idle"|"armed"|"reorder"|"started"|"active"}
   */
  noteTabDragMotion(x, y) {
    const state = this._tabDrag;
    if (!state) return "idle";
    if (state.started) {
      if (state.synthetic) {
        const node = this._extWm.findNodeWindow?.(state.metaWindow);
        if (node) this._handleMoving(node);
      }
      return state.synthetic ? "active" : "started";
    }

    // Strip reorder: stay until pointer leaves the group's tab strip.
    if (state.reorder) {
      if (!this._tabDragPointerOnStrip(state, x, y)) {
        this._teardownTabReorderPreview(state);
        state.reorder = false;
        this._startTabMoveGrab(state);
        return state.started ? (state.synthetic ? "active" : "started") : "armed";
      }
      this._updateTabReorderFromPointer(state, x, y);
      return "reorder";
    }

    if (!tabDragExceededThreshold(state.startX, state.startY, x, y)) return "armed";

    // Past threshold on strip → reorder; else grab-tile (LX4).
    if (this._tryEnterTabStripReorder(state, x, y)) return "reorder";
    this._startTabMoveGrab(state);
    return state.started ? (state.synthetic ? "active" : "started") : "armed";
  }

  /**
   * Test / fallback: primary button released while tab-drag armed, reorder, or synthetic.
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
    // Click-only or Mutter-owned grab: drop arming. Real grab-op-end also disarms.
    this._disarmTabDrag({ keepSynthetic: false });
  }

  _onTabDragStageEvent(event) {
    const state = this._tabDrag;
    if (!state || !event) return;

    let type = null;
    try {
      type = typeof event.type === "function" ? event.type() : event.type;
    } catch (_e) {
      return;
    }

    const isMotion =
      type === Clutter.EventType?.MOTION ||
      type === "motion" ||
      // Some GJS builds expose numeric EventType only.
      (Clutter.EventType && type === Clutter.EventType.MOTION);
    const isRelease =
      type === Clutter.EventType?.BUTTON_RELEASE ||
      type === "button-release" ||
      (Clutter.EventType && type === Clutter.EventType.BUTTON_RELEASE);

    if (isMotion) {
      const coords = _eventCoords(event);
      if (!coords) return;
      this.noteTabDragMotion(coords[0], coords[1]);
      return;
    }

    if (isRelease) {
      const btn =
        typeof event.get_button === "function" ? event.get_button() : Clutter.BUTTON_PRIMARY;
      if (btn === Clutter.BUTTON_PRIMARY || btn === 1) {
        this.finishTabDragRelease();
      }
    }
  }

  _startTabMoveGrab(state) {
    if (!state || state.started) return;
    const wm = this._extWm;
    const metaWindow = state.metaWindow;
    // Peel hands off strip float/gap; pressed clears on full disarm.
    this._teardownTabReorderPreview(state);
    if (!metaWindow) {
      this._disarmTabDrag({ keepSynthetic: false });
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

    let startedViaMutter = false;
    if (typeof metaWindow.begin_grab_op === "function") {
      try {
        // Mutter 46+: (op, device, sequence, timestamp, pos_hint) → bool
        const ok = metaWindow.begin_grab_op(
          state.grabOp,
          null,
          null,
          global.display.get_current_time(),
          null
        );
        // Require explicit true; undefined/void must not skip the synthetic path.
        startedViaMutter = ok === true;
      } catch (e) {
        Logger.warn(`tab drag begin_grab_op failed: ${e}`);
        startedViaMutter = false;
      }
    }

    if (startedViaMutter) {
      state.started = true;
      state.synthetic = false;
      // Mutter owns motion/release; drop our stage listeners.
      this._disconnectTabDragStage(state);
      return;
    }

    // Synthetic: same Forge grab-tile path as e2e fuzzDrag.
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

  /** @returns {number} */
  _tabDragChipMinWidth(homeWidth) {
    let d = 1;
    try {
      d = typeof Utils.dpi === "function" ? Utils.dpi() : 1;
    } catch (_e) {
      d = 1;
    }
    if (!(d > 0)) d = 1;
    const floor = Math.round(TAB_DRAG_CHIP_MIN_WIDTH_LOGICAL * d);
    const home = Number(homeWidth) || 0;
    // Never grow past the settled equal-fill width.
    if (home > 0) return Math.min(home, Math.max(floor, 1));
    return Math.max(floor, 1);
  }

  /**
   * Freeze remaining sibling sizes / home rects for gap packing.
   * @param {any} state
   */
  _snapshotReorderSiblings(state) {
    const group = state.groupNode;
    const unit = state.unitNode;
    const axis = state.axis === "y" ? "y" : "x";
    const snaps = [];
    // Include dragged home so origin is strip start when dragging the first tab.
    const unitHome = tabActorScreenRect(unit?.tab);
    let origin = unitHome != null ? (axis === "y" ? unitHome.y : unitHome.x) : null;
    let cross = unitHome != null ? (axis === "y" ? unitHome.x : unitHome.y) : null;
    for (const c of group?.childNodes || []) {
      if (c === unit) continue;
      const r = tabActorScreenRect(c?.tab);
      const size = axis === "y" ? (r ? r.height : 1) : r ? r.width : 1;
      const start = r ? (axis === "y" ? r.y : r.x) : 0;
      const other = r ? (axis === "y" ? r.x : r.y) : 0;
      const otherSize = r ? (axis === "y" ? r.width : r.height) : 1;
      if (origin == null || start < origin) origin = start;
      if (cross == null) cross = other;
      snaps.push({
        node: c,
        tab: c?.tab || null,
        size: Math.max(1, size),
        homeStart: start,
        cross: other,
        crossSize: Math.max(1, otherSize),
        expandX: c?.tab?.x_expand,
        expandY: c?.tab?.y_expand,
      });
      // Freeze equal-fill so siblings do not absorb the gap during the gesture.
      try {
        if (c?.tab) {
          if (axis === "y") {
            c.tab.y_expand = false;
            c.tab.set_height?.(snaps[snaps.length - 1].size);
          } else {
            c.tab.x_expand = false;
            c.tab.set_width?.(snaps[snaps.length - 1].size);
          }
        }
      } catch (_e) {
        // mock / disposed
      }
    }
    state.siblingSnap = snaps;
    state.stripOrigin = origin != null ? origin : 0;
    state.stripCross = cross != null ? cross : 0;
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
   * @param {any} state
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  _tabDragPointerOnStrip(state, x, y) {
    const ctx = this._resolveTabStripReorderContext(state.metaWindow);
    if (!ctx) return false;
    state.groupNode = ctx.group;
    state.unitNode = ctx.unit;
    state.axis = ctx.axis;
    // Union of all row tab rects + decoration (+ pad inside pointerOnTabStrip).
    const hitRects = this._collectGroupStripHitRects(ctx.group);
    // Home snaps keep multi-row bands when the float chip left the strip actors.
    if (state.siblingSnap?.length) {
      for (const s of state.siblingSnap) {
        const axis = state.axis === "y" ? "y" : "x";
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
    }
    return pointerOnTabStrip({ tabs: hitRects, pointer: [x, y] });
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
   * Place spacer + ease siblings into packed slots with gap at previewGap.
   * @param {any} state
   * @param {boolean} animate
   */
  _applyTabReorderGapVisual(state, animate) {
    const snaps = state.siblingSnap || [];
    const axis = state.axis === "y" ? "y" : "x";
    const chipSize = axis === "y" ? state.chipH : state.chipW;
    const gapAt = Math.max(0, Math.min(snaps.length, Number(state.previewGap) || 0));

    this._sizeGapSpacer(state);
    this._placeGapSpacerInHost(state);

    if (axis === "y" || snaps.length === 0) {
      const segs = tabStripFlowLayoutWithGap({
        sizes: snaps.map((s) => s.size),
        gapIndex: gapAt,
        chipSize,
        origin: state.stripOrigin,
      });
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        const seg = segs[i];
        if (!snap?.tab || !seg) continue;
        const targetStart = seg.start;
        const dx = 0;
        const dy = targetStart - snap.homeStart;
        this._easeTabTranslation(snap.tab, dx, dy, animate);
      }
      return;
    }

    // TABBED: pack per Y-row so multi-row does not collapse to one line.
    const rowOf = new Array(snaps.length);
    const rowBands = [];
    const order = snaps
      .map((_, i) => i)
      .sort((a, b) => {
        const dy = (snaps[a].cross || 0) - (snaps[b].cross || 0);
        if (dy !== 0) return dy;
        return a - b;
      });
    for (const i of order) {
      const s = snaps[i];
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

    for (let r = 0; r < rowBands.length; r++) {
      const row = rowBands[r];
      const rowSnaps = row.indices.map((i) => snaps[i]);
      const origin =
        rowSnaps.length > 0 ? Math.min(...rowSnaps.map((s) => s.homeStart)) : state.stripOrigin;
      const localGap = r === gapRow ? row.indices.filter((i) => i < gapAt).length : rowSnaps.length;
      const segs = tabStripFlowLayoutWithGap({
        sizes: rowSnaps.map((s) => s.size),
        gapIndex: localGap,
        chipSize: r === gapRow ? chipSize : 0,
        origin,
      });
      for (let j = 0; j < rowSnaps.length; j++) {
        const snap = rowSnaps[j];
        const seg = segs[j];
        if (!snap?.tab || !seg) continue;
        const dx = seg.start - snap.homeStart;
        this._easeTabTranslation(snap.tab, dx, 0, animate);
      }
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
   * Tear down float chip, spacer, sibling freezes — no tree mutate.
   * @param {any} [state]
   */
  _teardownTabReorderPreview(state) {
    if (!state) return;
    const unit = state.unitNode;
    const tab = unit?.tab;
    const host = state.chipHomeParent;

    // Spacer out first.
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

    // Reparent chip back onto strip host before layout commit (if any).
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

    // Clear sibling translations / restore expand.
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
      } catch (_e) {
        // disposed
      }
    }
    state.siblingSnap = null;
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
      return;
    }

    const kids = [...(group.childNodes || [])];
    const fromIndex = kids.indexOf(unit);
    if (fromIndex < 0) {
      this._disarmTabDrag({ keepSynthetic: false });
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
    if (same) return;

    // D023: only Node.replaceChildren — do not resetSiblingPercent (percents travel).
    group.replaceChildren(next);

    try {
      if (typeof wm?.commitLayout === "function") {
        wm.commitLayout("tab-strip-reorder", { force: true });
      } else {
        wm?.renderTree?.("tab-strip-reorder", true);
      }
    } catch (e) {
      Logger.warn(`tab-strip-reorder commit: ${e}`);
    }

    // Open leaf / pin stay on the dragged child — no surprise reveal.
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
    // Clear arm before grab-end (grab-end also disarms — idempotent).
    this._disarmTabDrag({ keepSynthetic: false });
    wm._handleGrabOpEnd(global.display, metaWindow, grabOp);
  }

  /**
   * @param {{ keepSynthetic?: boolean }} [opts]
   *  keepSynthetic reserved; currently always clears full tab-drag state.
   */
  _disarmTabDrag(_opts = {}) {
    const state = this._tabDrag;
    if (!state) return;
    this._teardownTabReorderPreview(state);
    try {
      state.pressedTab?.remove_style_class_name?.(TAB_PRESSED_CLASS);
      state.unitNode?.tab?.remove_style_class_name?.(TAB_PRESSED_CLASS);
      state.unitNode?.tab?.remove_style_class_name?.(TAB_DRAGGING_CLASS);
    } catch (_e) {
      // disposed
    }
    this._disconnectTabDragStage(state);
    this._tabDrag = null;
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
    // Reorder cancel: drop arming without commit.
    this._disarmTabDrag({ keepSynthetic: false });
  }

  _handleMoving(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;

    // Refresh workspace-wide targets each motion (cross-mon + mid-drag maps).
    wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);

    const nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    wm.nodeWinAtPointer = nodeWinAtPointer;

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
}
