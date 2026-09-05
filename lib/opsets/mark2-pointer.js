// @ts-check
/**
 * Mark 2 OpSet.pointer — five-zone + zone→op (D101). No TOM write on hover.
 */

import { parent } from "../tom/kernel.js";
import { ancestorMonitor, isInAxis } from "../tom/queries.js";
import { geomOf } from "../world/index.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */
/** @typedef {import('../tom/kernel.js').Dir} Dir */

/** @typedef {"center"|"left"|"right"|"top"|"bottom"} Mark2Zone */
/** @typedef {"tabbed"|"stacked"|"tiled"|"invalid"|"none"} PreviewStyle */

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
 * }} Mark2Zones
 */

/**
 * @typedef {{
 *   world: { x: number, y: number },
 *   grab: { id: string, kind: "window", mins?: { width?: number, height?: number } },
 *   hit:
 *     | { tag: "window", id: string, paneRect: Rect }
 *     | { tag: "empty-monitor", id: string, workArea: Rect }
 *     | { tag: "strip", id: string, axis: "x"|"y", insertIndex: number }
 *     | { tag: "none" },
 * }} PointerEv
 */

/**
 * @typedef {{
 *   paint: "tile-zones"|"empty-monitor"|"strip"|"none",
 *   zone: Mark2Zone|null,
 *   preview: { rect: Rect|null, style: PreviewStyle },
 *   refuse: boolean,
 *   would: { op: string, args: { dir: Dir, onto?: string, insertIndex?: number, place?: "end" } }|null,
 * }} HoverDesc
 */

/**
 * @param {Rect|null|undefined} rect
 * @param {Point|null|undefined} point
 */
function rectContainsPoint(rect, point) {
  if (!(rect && point)) return false;
  const [px, py] = point;
  return rect.x <= px && px <= rect.x + rect.width && rect.y <= py && py <= rect.y + rect.height;
}

/**
 * @param {Point} point
 * @param {Polygon} polygon
 */
function pointInPolygon(point, polygon) {
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
 * Five-zone geometry for paneRect U (Mark 2 data).
 * @param {Rect} rect
 * @returns {Mark2Zones|null}
 */
export function buildMark2Zones(rect) {
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
    top: { polygon: [uUL, uUR, cUR, cUL] },
    right: { polygon: [uUR, uBR, cBR, cUR] },
    bottom: { polygon: [uBR, uBL, cBL, cBR] },
    left: { polygon: [uBL, uUL, cUL, cBL] },
  };
}

/** @param {Rect} unit @param {Point} point @returns {Mark2Zone} */
function nearestEdgeZone(unit, point) {
  const [px, py] = point;
  const distLeft = px - unit.x;
  const distRight = unit.x + unit.width - px;
  const distTop = py - unit.y;
  const distBottom = unit.y + unit.height - py;
  const w = unit.width > 0 ? unit.width : 1;
  const h = unit.height > 0 ? unit.height : 1;
  /** @type {[Mark2Zone, number][]} */
  const candidates = [
    ["left", distLeft / w],
    ["right", distRight / w],
    ["top", distTop / h],
    ["bottom", distBottom / h],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0][0];
}

/**
 * @param {Mark2Zones|null|undefined} zones
 * @param {Point|null|undefined} point
 * @returns {Mark2Zone|null}
 */
export function hitTestMark2Zone(zones, point) {
  if (!zones || !point || point.length < 2) return null;
  if (!rectContainsPoint(zones.unit, point)) return null;
  if (rectContainsPoint(zones.center, point)) return "center";
  if (pointInPolygon(point, zones.top.polygon)) return "top";
  if (pointInPolygon(point, zones.right.polygon)) return "right";
  if (pointInPolygon(point, zones.bottom.polygon)) return "bottom";
  if (pointInPolygon(point, zones.left.polygon)) return "left";
  return nearestEdgeZone(zones.unit, point);
}

/**
 * AABB paint partition for tile chrome (host may map to St bins).
 * @param {Mark2Zones|null|undefined} zones
 * @returns {Record<Mark2Zone, Rect>|null}
 */
export function mark2ZonePaintRects(zones) {
  if (!zones?.unit || !zones.center) return null;
  const U = zones.unit;
  const C = zones.center;
  const topH = C.y - U.y;
  const botY = C.y + C.height;
  const botH = U.y + U.height - botY;
  const leftW = C.x - U.x;
  const rightX = C.x + C.width;
  const rightW = U.x + U.width - rightX;
  return {
    center: { x: C.x, y: C.y, width: C.width, height: C.height },
    top: { x: U.x, y: U.y, width: U.width, height: topH },
    bottom: { x: U.x, y: botY, width: U.width, height: botH },
    left: { x: U.x, y: C.y, width: leftW, height: C.height },
    right: { x: rightX, y: C.y, width: rightW, height: C.height },
  };
}

/** @param {Mark2Zones|null|undefined} zones @param {Mark2Zone|null|undefined} zone */
export function mark2ZonePaintRect(zones, zone) {
  if (!zones || !zone) return null;
  return mark2ZonePaintRects(zones)?.[zone] ?? null;
}

/**
 * Harness: place world inside a named Mark 2 zone of paneRect (nest / session-api).
 * @param {Rect|null|undefined} paneRect
 * @param {string|null|undefined} zone center|left|right|top|bottom (case-insensitive)
 * @returns {{ x: number, y: number }|null}
 */
export function worldPointInMark2Zone(paneRect, zone) {
  if (!paneRect || !(paneRect.width > 0) || !(paneRect.height > 0)) return null;
  const z = String(zone || "")
    .trim()
    .toLowerCase();
  const x = Number(paneRect.x) || 0;
  const y = Number(paneRect.y) || 0;
  const w = Number(paneRect.width) || 0;
  const h = Number(paneRect.height) || 0;
  if (z === "center") return { x: x + w / 2, y: y + h / 2 };
  if (z === "left") return { x: x + 1, y: y + h / 2 };
  if (z === "right") return { x: x + w - 1, y: y + h / 2 };
  if (z === "top") return { x: x + w / 2, y: y + 1 };
  if (z === "bottom") return { x: x + w / 2, y: y + h - 1 };
  return null;
}

/** @param {Node|null|undefined} n */
function isSplit(n) {
  return !!(n && (n.layout === "HSPLIT" || n.layout === "VSPLIT"));
}

/** @param {Node|null|undefined} n */
function isBag(n) {
  return !!(n && (n.layout === "TABBED" || n.layout === "STACKED"));
}

/**
 * @param {Forest} f
 * @param {Node} a
 * @param {Node} b
 * @returns {Dir|null}
 */
export function dirTowardNodes(f, a, b) {
  const pa = parent(f, a);
  const pb = parent(f, b);
  if (pa && pa === pb) {
    const ia = pa.childIds.indexOf(a.id);
    const ib = pa.childIds.indexOf(b.id);
    if (ia >= 0 && ib >= 0 && ia !== ib) {
      if (pa.layout === "VSPLIT" || pa.layout === "STACKED") {
        return ia < ib ? "down" : "up";
      }
      return ia < ib ? "right" : "left";
    }
  }
  return dirFromRects(nodeRect(f, a), nodeRect(f, b));
}

/** @param {Forest} f @param {Node} n @returns {Rect|null} */
function nodeRect(f, n) {
  if (!n) return null;
  if (n.kind === "MONITOR") {
    const g = geomOf(f, n);
    if (g && Number(g.width) > 0 && Number(g.height) > 0) {
      return {
        x: Number(g.x) || 0,
        y: Number(g.y) || 0,
        width: Number(g.width),
        height: Number(g.height),
      };
    }
  }
  return null;
}

/** @param {Rect|null} a @param {Rect|null} b @returns {Dir|null} */
function dirFromRects(a, b) {
  if (!a || !b) return null;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/**
 * In-axis adjacent siblings on a matching H/V split (zone axis must match).
 * @param {Forest} f
 * @param {Node} grab
 * @param {Node} onto
 * @param {Dir} zoneDir
 */
function isInAxisAdjacentMove(f, grab, onto, zoneDir) {
  const p = parent(f, grab);
  if (!p || p !== parent(f, onto)) return false;
  if (!isSplit(p)) return false;
  if (!isInAxis(p, zoneDir)) return false;
  const i = p.childIds.indexOf(grab.id);
  const j = p.childIds.indexOf(onto.id);
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
}

/**
 * @param {number} min
 * @param {number} size
 */
function exceeds(min, size) {
  return min > 0 && size > 0 && min > size;
}

/**
 * @param {{ width?: number, height?: number }|null|undefined} mins
 * @param {Rect|null|undefined} slot
 * @param {string|null|undefined} op
 * @param {Dir|null|undefined} dir
 */
function minsRefuse(mins, slot, op, dir) {
  if (!mins || !slot) return false;
  const mw = Number(mins.width) || 0;
  const mh = Number(mins.height) || 0;
  if (mw <= 0 && mh <= 0) return false;
  const w = Number(slot.width) || 0;
  const h = Number(slot.height) || 0;
  if (!(w > 0) || !(h > 0)) return false;
  // Join edge invent ≈ half on the split axis; group/move share the full pane.
  if (op === "join" && dir) {
    const horizontal = dir === "left" || dir === "right";
    if (horizontal) return exceeds(mw, w / 2) || exceeds(mh, h);
    return exceeds(mh, h / 2) || exceeds(mw, w);
  }
  return exceeds(mw, w) || exceeds(mh, h);
}

/**
 * Zone → named op (no TOM write).
 * @param {Forest} f
 * @param {PointerEv} ev
 * @returns {{ op: string, args: { dir: Dir, onto?: string, insertIndex?: number, place?: "end" } }|null}
 */
export function resolvePointerWould(f, ev) {
  if (!f || !ev?.grab?.id || !ev.hit) return null;
  const grab = f.nodes[ev.grab.id];
  if (!grab || grab.kind !== "WINDOW") return null;
  const hit = ev.hit;

  if (hit.tag === "none") return null;

  if (hit.tag === "empty-monitor") {
    const dest = f.nodes[hit.id];
    if (!dest || dest.kind !== "MONITOR") return null;
    const srcMon = ancestorMonitor(f, grab);
    if (!srcMon || srcMon.id === dest.id) return null;
    const srcRect = nodeRect(f, srcMon) || nodeRect(f, grab);
    const destRect = hit.workArea || nodeRect(f, dest);
    const dir = dirFromRects(srcRect, destRect) || "right";
    return { op: "move", args: { dir, onto: dest.id } };
  }

  if (hit.tag === "strip") {
    const con = f.nodes[hit.id];
    if (!con || con.kind !== "CON" || !isBag(con)) return null;
    const grabParent = parent(f, grab);
    const dir = dirTowardNodes(f, grab, con) || (hit.axis === "y" ? "down" : "right");
    if (grabParent && grabParent.id === con.id) {
      return {
        op: "move",
        args: { dir, onto: con.id, insertIndex: hit.insertIndex },
      };
    }
    return { op: "group", args: { dir, onto: con.id, insertIndex: hit.insertIndex } };
  }

  if (hit.tag === "window") {
    const onto = f.nodes[hit.id];
    if (!onto || onto.kind !== "WINDOW") return null;
    if (onto.id === grab.id) return null;

    const point = /** @type {Point} */ ([ev.world?.x ?? 0, ev.world?.y ?? 0]);
    const zones = buildMark2Zones(hit.paneRect);
    const zone = hitTestMark2Zone(zones, point);
    if (!zone) return null;

    if (zone === "center") {
      const ontoParent = parent(f, onto);
      const grabParent = parent(f, grab);
      // Hit a leaf inside a sibling TAB/STACK → Group enter that CON.
      if (ontoParent && isBag(ontoParent) && grabParent && parent(f, ontoParent) === grabParent) {
        const dir = dirTowardNodes(f, grab, ontoParent) || "right";
        return { op: "group", args: { dir, onto: ontoParent.id, place: "end" } };
      }
      const dir = dirTowardNodes(f, grab, onto) || "right";
      return { op: "group", args: { dir, onto: onto.id, place: "end" } };
    }

    /** @type {Dir} */
    const zoneDir = zone === "top" ? "up" : zone === "bottom" ? "down" : zone;
    if (isInAxisAdjacentMove(f, grab, onto, zoneDir)) {
      const dir = dirTowardNodes(f, grab, onto) || zoneDir;
      return { op: "move", args: { dir, onto: onto.id } };
    }
    return { op: "join", args: { dir: zoneDir, onto: onto.id } };
  }

  return null;
}

/**
 * Preview style for a would-op.
 * @param {{ op: string }|null} would
 * @param {Forest} f
 * @param {string|undefined} ontoId
 * @returns {PreviewStyle}
 */
function styleForWould(would, f, ontoId) {
  if (!would) return "none";
  if (would.op === "group") {
    if (ontoId) {
      const onto = f.nodes[ontoId];
      if (onto?.layout === "STACKED") return "stacked";
      const p = onto ? parent(f, onto) : null;
      if (p?.layout === "STACKED") return "stacked";
    }
    return "tabbed";
  }
  return "tiled";
}

/**
 * @param {Forest} f
 * @param {PointerEv} ev
 * @returns {HoverDesc}
 */
export function mark2PointerHover(f, ev) {
  const none = /** @type {HoverDesc} */ ({
    paint: "none",
    zone: null,
    preview: { rect: null, style: "none" },
    refuse: false,
    would: null,
  });
  if (!f || !ev?.hit) return none;

  const hit = ev.hit;
  if (hit.tag === "none") return none;

  const would = resolvePointerWould(f, ev);

  if (hit.tag === "empty-monitor") {
    const slot = hit.workArea || null;
    const refuse = !!(would && minsRefuse(ev.grab?.mins, slot, would.op, would.args.dir));
    return {
      paint: "empty-monitor",
      zone: null,
      preview: {
        rect: slot,
        style: refuse ? "invalid" : would ? "tiled" : "none",
      },
      refuse,
      would: refuse ? null : would,
    };
  }

  if (hit.tag === "strip") {
    const refuse = false;
    return {
      paint: "strip",
      zone: null,
      preview: {
        rect: null,
        style: refuse ? "invalid" : would ? styleForWould(would, f, would.args.onto) : "none",
      },
      refuse,
      would: refuse ? null : would,
    };
  }

  if (hit.tag === "window") {
    const zones = buildMark2Zones(hit.paneRect);
    const point = /** @type {Point} */ ([ev.world?.x ?? 0, ev.world?.y ?? 0]);
    const zone = hitTestMark2Zone(zones, point);
    const previewRect = zone ? mark2ZonePaintRect(zones, zone) : null;
    // Join/group/move mins are vs the onto pane (edge join halves that pane).
    // Zone paint rect is chrome only — using it double-halves join and false-refuses.
    const refuse = !!(would && minsRefuse(ev.grab?.mins, hit.paneRect, would.op, would.args.dir));
    /** @type {Record<string, boolean>|undefined} */
    let zoneOverflow;
    if (ev.grab?.mins) {
      zoneOverflow = {};
      for (const z of /** @type {Mark2Zone[]} */ (["top", "right", "bottom", "left", "center"])) {
        const probeWorld =
          z === "center"
            ? {
                x: hit.paneRect.x + hit.paneRect.width / 2,
                y: hit.paneRect.y + hit.paneRect.height / 2,
              }
            : z === "left"
            ? { x: hit.paneRect.x + 1, y: hit.paneRect.y + hit.paneRect.height / 2 }
            : z === "right"
            ? {
                x: hit.paneRect.x + hit.paneRect.width - 1,
                y: hit.paneRect.y + hit.paneRect.height / 2,
              }
            : z === "top"
            ? { x: hit.paneRect.x + hit.paneRect.width / 2, y: hit.paneRect.y + 1 }
            : {
                x: hit.paneRect.x + hit.paneRect.width / 2,
                y: hit.paneRect.y + hit.paneRect.height - 1,
              };
        const probe = resolvePointerWould(f, { ...ev, world: probeWorld });
        zoneOverflow[z] = !!(
          probe && minsRefuse(ev.grab.mins, hit.paneRect, probe.op, probe.args.dir)
        );
      }
    }
    return {
      paint: "tile-zones",
      zone,
      preview: {
        rect: previewRect || hit.paneRect,
        style: refuse ? "invalid" : would ? styleForWould(would, f, would.args.onto) : "none",
      },
      refuse,
      would: refuse ? null : would,
      ...(zoneOverflow ? { zoneOverflow } : {}),
    };
  }

  return none;
}

/**
 * @param {Forest} f
 * @param {PointerEv} ev
 * @returns {{ op: string|null, args?: { dir: Dir, onto?: string, insertIndex?: number, place?: "end" } }}
 */
export function mark2PointerRelease(f, ev) {
  const desc = mark2PointerHover(f, ev);
  if (desc.refuse || !desc.would?.op) return { op: null };
  return { op: desc.would.op, args: desc.would.args };
}

export const MARK2_POINTER = {
  hover: mark2PointerHover,
  release: mark2PointerRelease,
};
