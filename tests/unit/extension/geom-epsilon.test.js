import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  edgeDeltas,
  classifyEpsilonSample,
  buildGeomEpsilonFields,
  logGeomEpsilonSample,
  GEOM_EPSILON_TOKEN,
} from "../../../lib/extension/geom-epsilon.js";

describe("geom-epsilon", () => {
  it("edgeDeltas computes per-edge and dMax", () => {
    const d = edgeDeltas(
      { x: 10, y: 20, width: 100, height: 200 },
      { x: 12, y: 18, width: 104, height: 200 }
    );
    expect(d).toEqual({ dx: 2, dy: -2, dw: 4, dh: 0, dMax: 4 });
  });

  it("edgeDeltas returns null on bad rects", () => {
    expect(edgeDeltas(null, { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it("classify agree / near / far", () => {
    expect(classifyEpsilonSample({ dMax: 3, epsilon: 4 })).toBe("agree");
    expect(classifyEpsilonSample({ dMax: 8, epsilon: 4, nearBand: 12 })).toBe("near");
    expect(
      classifyEpsilonSample({
        dMax: 40,
        epsilon: 4,
        nearBand: 12,
        sentSize: { width: 100, height: 100 },
        dw: 2,
        dh: 2,
      })
    ).toBe("far");
  });

  it("classify min-known when sent below known mins", () => {
    expect(
      classifyEpsilonSample({
        dMax: 50,
        epsilon: 4,
        knownMin: { width: 400, height: 200 },
        sentSize: { width: 300, height: 200 },
      })
    ).toBe("min-known");
  });

  it("classify ambiguous on large size miss without mins", () => {
    expect(
      classifyEpsilonSample({
        dMax: 80,
        epsilon: 4,
        nearBand: 12,
        sentSize: { width: 200, height: 200 },
        dw: 80,
        dh: 0,
      })
    ).toBe("ambiguous");
  });

  it("buildGeomEpsilonFields includes greppable tag and edges", () => {
    const f = buildGeomEpsilonFields({
      phase: "post-write-settle",
      sent: { x: 0, y: 0, width: 100, height: 100 },
      observed: { x: 0, y: 0, width: 103, height: 100 },
      windowId: 9,
      wmClass: "Ghostty",
      wrote: true,
      epsilon: 4,
    });
    expect(f.phase).toBe("post-write-settle");
    expect(f.tag).toBe("agree");
    expect(f.dMax).toBe(3);
    expect(f.wmClass).toBe("Ghostty");
    expect(f.wrote).toBe(true);
  });

  describe("logGeomEpsilonSample", () => {
    let spy;
    beforeEach(() => {
      spy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("emits geom-epsilon token", () => {
      logGeomEpsilonSample(
        buildGeomEpsilonFields({
          phase: "post-write-immediate",
          sent: { x: 1, y: 2, width: 3, height: 4 },
          observed: { x: 1, y: 2, width: 3, height: 4 },
          wrote: true,
        })
      );
      expect(spy).toHaveBeenCalled();
      const title = String(spy.mock.calls[0][0] ?? "");
      expect(title.includes(GEOM_EPSILON_TOKEN)).toBe(true);
    });
  });
});
