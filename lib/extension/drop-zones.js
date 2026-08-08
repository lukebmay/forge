/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure five-zone drop geometry (D0). No GObject/Mutter — unit-testable.
 *
 * Target unit U → center rect C (half size, centered) + four trapezoids
 * TOP/RIGHT/BOTTOM/LEFT. Hit test is independent of grab origin.
 */

import { createEnum } from "./enum.js";

/** Drop zones for drag-and-drop tiling (string values stable for prefs/logs). */
export const DROP_ZONES = createEnum(["LEFT", "RIGHT", "TOP", "BOTTOM", "CENTER", "NONE"]);

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {[number, number]} Point
 * @typedef {Point[]} Polygon
 * @typedef {{
 *   unit: Rect,
 *   center: Rect & { polygon: Polygon },
 *   top: { polygon: Polygon },
 *   right: { polygon: Polygon },
 *   bottom: { polygon: Polygon },
 *   left: { polygon: Polygon },
 * }} DropZones
 */

/**
 * Whether rect contains point [x, y] (inclusive edges).
 * @param {Rect|null|undefined} rect
 * @param {Point|null|undefined} point
 * @returns {boolean}
 */
export function rectContainsPoint(rect, point) {
  if (!(rect && point)) return false;
  const [px, py] = point;
  return rect.x <= px && px <= rect.x + rect.width && rect.y <= py && py <= rect.y + rect.height;
}

/**
 * Ray-cast point-in-polygon (inclusive of typical edge hits; not robust on
 * vertices — callers prefer center / ordered zones for shared edges).
 * @param {Point} point
 * @param {Polygon} polygon
 * @returns {boolean}
 */
export function pointInPolygon(point, polygon) {
  if (!point || !polygon || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y;
    if (!crosses) continue;
    const xAtY = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < xAtY) inside = !inside;
  }
  return inside;
}

/**
 * Build five drop zones for a target unit frame rect U.
 *
 * Center C: half width/height of U, centered:
 *   C.w = U.w/2, C.h = U.h/2, C.x = U.x + U.w/4, C.y = U.y + U.h/4
 *
 * Trapezoids connect corresponding corners of C and U.
 *
 * @param {Rect} rect - Target unit frame {x, y, width, height}
 * @returns {DropZones|null}
 */
export function buildDropZones(rect) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;

  const x = rect.x;
  const y = rect.y;
  const w = rect.width;
  const h = rect.height;

  const cw = w / 2;
  const ch = h / 2;
  const cx = x + w / 4;
  const cy = y + h / 4;

  /** @type {Point} */
  const uUL = [x, y];
  /** @type {Point} */
  const uUR = [x + w, y];
  /** @type {Point} */
  const uBR = [x + w, y + h];
  /** @type {Point} */
  const uBL = [x, y + h];
  /** @type {Point} */
  const cUL = [cx, cy];
  /** @type {Point} */
  const cUR = [cx + cw, cy];
  /** @type {Point} */
  const cBR = [cx + cw, cy + ch];
  /** @type {Point} */
  const cBL = [cx, cy + ch];

  return {
    unit: { x, y, width: w, height: h },
    center: {
      x: cx,
      y: cy,
      width: cw,
      height: ch,
      polygon: [cUL, cUR, cBR, cBL],
    },
    // Outer U edge → inner C edge (CCW-ish); shared radials with neighbors.
    top: { polygon: [uUL, uUR, cUR, cUL] },
    right: { polygon: [uUR, uBR, cBR, cUR] },
    bottom: { polygon: [uBR, uBL, cBL, cBR] },
    left: { polygon: [uBL, uUL, cUL, cBL] },
  };
}

/**
 * Nearest outer edge when a unit interior point misses polygon ray-cast edges.
 * @param {Rect} unit
 * @param {Point} point
 * @returns {string} DROP_ZONES edge value
 */
function nearestEdgeZone(unit, point) {
  const [px, py] = point;
  const distLeft = px - unit.x;
  const distRight = unit.x + unit.width - px;
  const distTop = py - unit.y;
  const distBottom = unit.y + unit.height - py;
  // Normalize by axis so tall/wide units stay fair on corners.
  const w = unit.width > 0 ? unit.width : 1;
  const h = unit.height > 0 ? unit.height : 1;
  /** @type {[string, number][]} */
  const candidates = [
    [DROP_ZONES.LEFT, distLeft / w],
    [DROP_ZONES.RIGHT, distRight / w],
    [DROP_ZONES.TOP, distTop / h],
    [DROP_ZONES.BOTTOM, distBottom / h],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0][0];
}

/**
 * Hit-test pointer against five-zone geometry. Independent of grab origin.
 * Center wins inside C. Outside unit → NONE.
 *
 * @param {DropZones|null|undefined} zones - from buildDropZones()
 * @param {Point|null|undefined} point - [x, y]
 * @returns {string} DROP_ZONES value
 */
export function hitTestDropZone(zones, point) {
  if (!zones || !point || point.length < 2) return DROP_ZONES.NONE;
  if (!rectContainsPoint(zones.unit, point)) return DROP_ZONES.NONE;
  if (rectContainsPoint(zones.center, point)) return DROP_ZONES.CENTER;

  if (pointInPolygon(point, zones.top.polygon)) return DROP_ZONES.TOP;
  if (pointInPolygon(point, zones.right.polygon)) return DROP_ZONES.RIGHT;
  if (pointInPolygon(point, zones.bottom.polygon)) return DROP_ZONES.BOTTOM;
  if (pointInPolygon(point, zones.left.polygon)) return DROP_ZONES.LEFT;

  // Shared-edge / ray-cast residual still inside U.
  return nearestEdgeZone(zones.unit, point);
}

/**
 * Build zones for rect and hit-test in one call (D1 convenience).
 * @param {Rect} rect
 * @param {Point} point
 * @returns {string} DROP_ZONES value
 */
export function hitTestDropZoneAt(rect, point) {
  return hitTestDropZone(buildDropZones(rect), point);
}
