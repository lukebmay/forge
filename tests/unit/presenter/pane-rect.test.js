import { describe, expect, it } from "vitest";
import { paneRect, wrapWouldViolateMin } from "../../../lib/presenter/index.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

describe("presenter paneRect", () => {
  it("Mon1(H(A,B)) default 1920×1080 world: A is ~960×1080 without node.geom", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    for (const n of Object.values(f.nodes)) {
      expect(n).not.toHaveProperty("geom");
    }
    const r = paneRect(f, byLabel.A);
    expect(r).not.toBeNull();
    expect(r.w).toBeCloseTo(960);
    expect(r.h).toBeCloseTo(1080);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    const b = paneRect(f, byLabel.B);
    expect(b.x).toBeCloseTo(960);
    expect(b.w).toBeCloseTo(960);
  });

  it("wrapWouldViolateMin is true when a 50/50 wrap is under 10% of the monitor", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.15;
    byLabel.B.percent = 0.85;
    expect(wrapWouldViolateMin(f, byLabel.A, "HSPLIT")).toBe(true);
    expect(wrapWouldViolateMin(f, byLabel.A, "VSPLIT")).toBe(false);
    expect(wrapWouldViolateMin(f, byLabel.B, "HSPLIT")).toBe(false);
  });
});
