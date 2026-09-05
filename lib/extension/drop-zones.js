/*
 * This file is part of the Forge extension for GNOME
 *
 * Host paint helper over Mark 2 five-zone geometry (D101).
 * Zone→op policy lives in OpSet.pointer — not here.
 */

import { createEnum } from "./enum.js";
import {
  buildMark2Zones,
  hitTestMark2Zone,
  mark2ZonePaintRect,
  mark2ZonePaintRects,
} from "../opsets/mark2-pointer.js";

/** Drop zones for drag-and-drop tiling (string values stable for prefs/logs). */
export const DROP_ZONES = createEnum(["LEFT", "RIGHT", "TOP", "BOTTOM", "CENTER", "NONE"]);

const ZONE_TO_HOST = {
  center: DROP_ZONES.CENTER,
  left: DROP_ZONES.LEFT,
  right: DROP_ZONES.RIGHT,
  top: DROP_ZONES.TOP,
  bottom: DROP_ZONES.BOTTOM,
};

const HOST_TO_ZONE = {
  [DROP_ZONES.CENTER]: "center",
  [DROP_ZONES.LEFT]: "left",
  [DROP_ZONES.RIGHT]: "right",
  [DROP_ZONES.TOP]: "top",
  [DROP_ZONES.BOTTOM]: "bottom",
};

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
 * Build five drop zones for a target unit frame rect U (Mark 2 geometry).
 * @param {Rect} rect
 * @returns {DropZones|null}
 */
export function buildDropZones(rect) {
  return buildMark2Zones(rect);
}

/**
 * Hit-test pointer against five-zone geometry. Independent of grab origin.
 * @param {DropZones|null|undefined} zones
 * @param {Point|null|undefined} point
 * @returns {string} DROP_ZONES value
 */
export function hitTestDropZone(zones, point) {
  const z = hitTestMark2Zone(zones, point);
  return z ? ZONE_TO_HOST[z] : DROP_ZONES.NONE;
}

/**
 * @param {Rect} rect
 * @param {Point} point
 * @returns {string} DROP_ZONES value
 */
export function hitTestDropZoneAt(rect, point) {
  return hitTestDropZone(buildDropZones(rect), point);
}

/**
 * @param {Polygon|null|undefined} polygon
 * @returns {Rect|null}
 */
export function polygonBoundingRect(polygon) {
  if (!polygon || polygon.length < 1) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!(maxX > minX && maxY > minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Non-overlapping AABB paint partition of U for St.Bin previews.
 * @param {DropZones|null|undefined} zones
 * @returns {Record<string, Rect>|null} keys = DROP_ZONES edge/center values
 */
export function zonePaintRects(zones) {
  const rects = mark2ZonePaintRects(zones);
  if (!rects) return null;
  return {
    [DROP_ZONES.CENTER]: rects.center,
    [DROP_ZONES.TOP]: rects.top,
    [DROP_ZONES.BOTTOM]: rects.bottom,
    [DROP_ZONES.LEFT]: rects.left,
    [DROP_ZONES.RIGHT]: rects.right,
  };
}

/**
 * @param {DropZones|null|undefined} zones
 * @param {string} zone - DROP_ZONES value
 * @returns {Rect|null}
 */
export function zonePaintRect(zones, zone) {
  if (!zones || !zone || zone === DROP_ZONES.NONE) return null;
  const mark2 = HOST_TO_ZONE[zone];
  return mark2 ? mark2ZonePaintRect(zones, mark2) : null;
}

/** Zone keys painted as sibling previews (excludes NONE). */
export const PAINT_ZONE_ORDER = [
  DROP_ZONES.TOP,
  DROP_ZONES.RIGHT,
  DROP_ZONES.BOTTOM,
  DROP_ZONES.LEFT,
  DROP_ZONES.CENTER,
];
