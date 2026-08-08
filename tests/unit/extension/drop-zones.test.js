import { describe, it, expect } from "vitest";
import {
  DROP_ZONES,
  buildDropZones,
  hitTestDropZone,
  hitTestDropZoneAt,
  pointInPolygon,
  rectContainsPoint,
  polygonBoundingRect,
  zonePaintRects,
  zonePaintRect,
  PAINT_ZONE_ORDER,
} from "../../../lib/extension/drop-zones.js";
import { DROP_ZONES as UTILS_DROP_ZONES } from "../../../lib/extension/utils.js";

/** Midpoint of polygon (simple average of vertices). */
function polyCentroid(polygon) {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of polygon) {
    sx += x;
    sy += y;
  }
  return [sx / polygon.length, sy / polygon.length];
}

describe("DROP_ZONES", () => {
  it("matches utils re-export (same string values)", () => {
    expect(DROP_ZONES).toEqual(UTILS_DROP_ZONES);
    expect(DROP_ZONES.LEFT).toBe("LEFT");
    expect(DROP_ZONES.RIGHT).toBe("RIGHT");
    expect(DROP_ZONES.TOP).toBe("TOP");
    expect(DROP_ZONES.BOTTOM).toBe("BOTTOM");
    expect(DROP_ZONES.CENTER).toBe("CENTER");
    expect(DROP_ZONES.NONE).toBe("NONE");
    expect(Object.isFrozen(DROP_ZONES)).toBe(true);
  });
});

describe("buildDropZones geometry", () => {
  it("builds center half-size and centered (plan formulas)", () => {
    const U = { x: 0, y: 0, width: 1000, height: 800 };
    const z = buildDropZones(U);
    expect(z).not.toBeNull();
    expect(z.unit).toEqual(U);
    expect(z.center.x).toBe(250); // 0 + 1000/4
    expect(z.center.y).toBe(200); // 0 + 800/4
    expect(z.center.width).toBe(500); // 1000/2
    expect(z.center.height).toBe(400); // 800/2
  });

  it("handles offset rects", () => {
    const U = { x: 100, y: 50, width: 400, height: 200 };
    const z = buildDropZones(U);
    expect(z.center.x).toBe(100 + 100); // + w/4
    expect(z.center.y).toBe(50 + 50); // + h/4
    expect(z.center.width).toBe(200);
    expect(z.center.height).toBe(100);
  });

  it("returns null for invalid rects", () => {
    expect(buildDropZones(null)).toBeNull();
    expect(buildDropZones({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
    expect(buildDropZones({ x: 0, y: 0, width: 10, height: -1 })).toBeNull();
  });

  it("exposes four trapezoid polygons with 4 vertices each", () => {
    const z = buildDropZones({ x: 0, y: 0, width: 100, height: 100 });
    for (const key of ["top", "right", "bottom", "left"]) {
      expect(z[key].polygon).toHaveLength(4);
    }
    expect(z.center.polygon).toHaveLength(4);
  });

  it("top polygon uses U top edge and C top edge", () => {
    const U = { x: 0, y: 0, width: 100, height: 80 };
    const z = buildDropZones(U);
    // uUL, uUR, cUR, cUL
    expect(z.top.polygon[0]).toEqual([0, 0]);
    expect(z.top.polygon[1]).toEqual([100, 0]);
    expect(z.top.polygon[2]).toEqual([75, 20]); // C top-right
    expect(z.top.polygon[3]).toEqual([25, 20]); // C top-left
  });
});

describe("pointInPolygon / rectContainsPoint", () => {
  it("rectContainsPoint inclusive edges", () => {
    const r = { x: 10, y: 20, width: 30, height: 40 };
    expect(rectContainsPoint(r, [10, 20])).toBe(true);
    expect(rectContainsPoint(r, [40, 60])).toBe(true);
    expect(rectContainsPoint(r, [9, 20])).toBe(false);
    expect(rectContainsPoint(r, [25, 40])).toBe(true);
  });

  it("pointInPolygon square", () => {
    const sq = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([15, 5], sq)).toBe(false);
  });
});

describe("hitTestDropZone", () => {
  const landscape = { x: 0, y: 0, width: 1000, height: 800 };
  const portrait = { x: 0, y: 0, width: 600, height: 1200 };
  const offset = { x: 200, y: 100, width: 400, height: 300 };

  it("returns NONE for missing args or outside unit", () => {
    const z = buildDropZones(landscape);
    expect(hitTestDropZone(null, [0, 0])).toBe(DROP_ZONES.NONE);
    expect(hitTestDropZone(z, null)).toBe(DROP_ZONES.NONE);
    expect(hitTestDropZone(z, [-1, 400])).toBe(DROP_ZONES.NONE);
    expect(hitTestDropZone(z, [1001, 400])).toBe(DROP_ZONES.NONE);
    expect(hitTestDropZone(z, [500, -1])).toBe(DROP_ZONES.NONE);
    expect(hitTestDropZone(z, [500, 801])).toBe(DROP_ZONES.NONE);
  });

  it("center wins at unit midpoint and throughout C", () => {
    const z = buildDropZones(landscape);
    // C: x 250–750, y 200–600
    expect(hitTestDropZone(z, [500, 400])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [250, 200])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [750, 600])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [300, 300])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [700, 500])).toBe(DROP_ZONES.CENTER);
  });

  it("detects edge zone midpoints (landscape)", () => {
    const z = buildDropZones(landscape);
    // Mid of outer edges, outside C
    expect(hitTestDropZone(z, [500, 50])).toBe(DROP_ZONES.TOP); // above C
    expect(hitTestDropZone(z, [500, 750])).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, [50, 400])).toBe(DROP_ZONES.LEFT);
    expect(hitTestDropZone(z, [950, 400])).toBe(DROP_ZONES.RIGHT);
  });

  it("trapezoid centroids map to their zones", () => {
    const z = buildDropZones(landscape);
    expect(hitTestDropZone(z, polyCentroid(z.top.polygon))).toBe(DROP_ZONES.TOP);
    expect(hitTestDropZone(z, polyCentroid(z.right.polygon))).toBe(DROP_ZONES.RIGHT);
    expect(hitTestDropZone(z, polyCentroid(z.bottom.polygon))).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, polyCentroid(z.left.polygon))).toBe(DROP_ZONES.LEFT);
  });

  it("clear corner interiors (inset from U corners)", () => {
    const z = buildDropZones(landscape);
    // Near U corners but clearly in one trapezoid (toward mid-edge of corner fan)
    // Top-left fan: closer to top edge → TOP; use high-y-near-top mid-x-left-of-diagonal
    // Point just inside U near top-left, above the UL→cUL diagonal → TOP-ish
    // Diagonal from (0,0) to (250,200): line y = (200/250)x = 0.8x
    // Point (50, 10): y=10 < 0.8*50=40 → above diagonal → TOP region
    expect(hitTestDropZone(z, [50, 10])).toBe(DROP_ZONES.TOP);
    // Point (10, 50): y=50 > 0.8*10=8 → below diagonal → LEFT
    expect(hitTestDropZone(z, [10, 50])).toBe(DROP_ZONES.LEFT);

    // Top-right: diagonal (1000,0)→(750,200): from UR left-down
    // param: x from 1000 to 750, y 0 to 200. Point (950, 10) near top → TOP
    expect(hitTestDropZone(z, [950, 10])).toBe(DROP_ZONES.TOP);
    // Point (990, 50) near right → RIGHT
    expect(hitTestDropZone(z, [990, 50])).toBe(DROP_ZONES.RIGHT);

    // Bottom-left
    expect(hitTestDropZone(z, [50, 790])).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, [10, 750])).toBe(DROP_ZONES.LEFT);

    // Bottom-right
    expect(hitTestDropZone(z, [950, 790])).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, [990, 750])).toBe(DROP_ZONES.RIGHT);
  });

  it("portrait unit keeps center and edge bands correct", () => {
    const z = buildDropZones(portrait);
    // C: x 150–450, y 300–900
    expect(z.center).toMatchObject({ x: 150, y: 300, width: 300, height: 600 });
    expect(hitTestDropZone(z, [300, 600])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [300, 100])).toBe(DROP_ZONES.TOP);
    expect(hitTestDropZone(z, [300, 1100])).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, [50, 600])).toBe(DROP_ZONES.LEFT);
    expect(hitTestDropZone(z, [550, 600])).toBe(DROP_ZONES.RIGHT);
  });

  it("offset landscape unit", () => {
    const z = buildDropZones(offset);
    // C: x=200+100=300, y=100+75=175, w=200, h=150 → to 500, 325
    expect(hitTestDropZone(z, [400, 250])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [400, 120])).toBe(DROP_ZONES.TOP);
    expect(hitTestDropZone(z, [400, 380])).toBe(DROP_ZONES.BOTTOM);
    expect(hitTestDropZone(z, [220, 250])).toBe(DROP_ZONES.LEFT);
    expect(hitTestDropZone(z, [580, 250])).toBe(DROP_ZONES.RIGHT);
    expect(hitTestDropZone(z, [0, 0])).toBe(DROP_ZONES.NONE);
  });

  it("hitTestDropZoneAt matches build + hit", () => {
    expect(hitTestDropZoneAt(landscape, [500, 400])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZoneAt(landscape, [50, 400])).toBe(DROP_ZONES.LEFT);
    expect(hitTestDropZoneAt(landscape, [-10, 0])).toBe(DROP_ZONES.NONE);
  });

  it("independent of grab origin (only pointer + unit matter)", () => {
    // Same pointer/zone regardless of any fictional grab offset
    const z = buildDropZones(landscape);
    const p = [50, 400];
    expect(hitTestDropZone(z, p)).toBe(DROP_ZONES.LEFT);
    expect(hitTestDropZone(z, p)).toBe(hitTestDropZoneAt(landscape, p));
  });

  it("partitions unit without interior gaps (dense sample)", () => {
    const U = { x: 0, y: 0, width: 200, height: 160 };
    const z = buildDropZones(U);
    const counts = {
      [DROP_ZONES.CENTER]: 0,
      [DROP_ZONES.TOP]: 0,
      [DROP_ZONES.RIGHT]: 0,
      [DROP_ZONES.BOTTOM]: 0,
      [DROP_ZONES.LEFT]: 0,
      [DROP_ZONES.NONE]: 0,
    };
    for (let x = 0; x <= U.width; x += 2) {
      for (let y = 0; y <= U.height; y += 2) {
        const zone = hitTestDropZone(z, [x, y]);
        counts[zone] = (counts[zone] || 0) + 1;
        expect(zone).not.toBe(DROP_ZONES.NONE);
      }
    }
    // All five zones appear
    expect(counts[DROP_ZONES.CENTER]).toBeGreaterThan(0);
    expect(counts[DROP_ZONES.TOP]).toBeGreaterThan(0);
    expect(counts[DROP_ZONES.RIGHT]).toBeGreaterThan(0);
    expect(counts[DROP_ZONES.BOTTOM]).toBeGreaterThan(0);
    expect(counts[DROP_ZONES.LEFT]).toBeGreaterThan(0);
    expect(counts[DROP_ZONES.NONE]).toBe(0);
  });

  it("center wins over trapezoids when inside C", () => {
    const z = buildDropZones(landscape);
    // Points inside C near its border must be CENTER, not edge
    expect(hitTestDropZone(z, [260, 400])).toBe(DROP_ZONES.CENTER);
    expect(hitTestDropZone(z, [500, 210])).toBe(DROP_ZONES.CENTER);
    // Just outside C on left → LEFT
    expect(hitTestDropZone(z, [240, 400])).toBe(DROP_ZONES.LEFT);
    // Just outside C on top → TOP
    expect(hitTestDropZone(z, [500, 190])).toBe(DROP_ZONES.TOP);
  });
});

describe("zone paint partition (D2)", () => {
  const landscape = { x: 0, y: 0, width: 1000, height: 800 };

  it("zonePaintRects covers full unit without overlap area", () => {
    const z = buildDropZones(landscape);
    const rects = zonePaintRects(z);
    expect(rects).not.toBeNull();
    expect(rects[DROP_ZONES.CENTER]).toMatchObject({ x: 250, y: 200, width: 500, height: 400 });
    expect(rects[DROP_ZONES.TOP]).toMatchObject({ x: 0, y: 0, width: 1000, height: 200 });
    expect(rects[DROP_ZONES.BOTTOM]).toMatchObject({ x: 0, y: 600, width: 1000, height: 200 });
    expect(rects[DROP_ZONES.LEFT]).toMatchObject({ x: 0, y: 200, width: 250, height: 400 });
    expect(rects[DROP_ZONES.RIGHT]).toMatchObject({ x: 750, y: 200, width: 250, height: 400 });

    // Area of five rects equals unit area (non-overlapping partition).
    let area = 0;
    for (const zKey of PAINT_ZONE_ORDER) {
      const r = rects[zKey];
      area += r.width * r.height;
    }
    expect(area).toBe(landscape.width * landscape.height);
  });

  it("zonePaintRect picks one zone; NONE/null safe", () => {
    const z = buildDropZones(landscape);
    expect(zonePaintRect(z, DROP_ZONES.LEFT)).toMatchObject({
      x: 0,
      y: 200,
      width: 250,
      height: 400,
    });
    expect(zonePaintRect(z, DROP_ZONES.NONE)).toBeNull();
    expect(zonePaintRect(null, DROP_ZONES.TOP)).toBeNull();
  });

  it("polygonBoundingRect of center matches C", () => {
    const z = buildDropZones(landscape);
    const bb = polygonBoundingRect(z.center.polygon);
    expect(bb).toMatchObject({ x: 250, y: 200, width: 500, height: 400 });
  });
});
