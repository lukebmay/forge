import { describe, expect, it } from "vitest";
import { paneRect, wrapWouldViolateMin } from "../../../lib/presenter/index.js";
import { children } from "../../../lib/tom/kernel.js";
import { containingSplit } from "../../../lib/tom/sizing.js";
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

  it("MONITOR-direct HSPLIT (layout profile shape): WINDOW + TABBED get half slots", () => {
    // Live `forge layout` mon1: MONITOR HSPLIT → [ghostty, TAB(...)] with no
    // intermediate CON. paneRect must honor MONITOR splitAxis (not always-fill).
    const { f, byLabel } = buildGiven("Mon1(A,TAB(B,C))");
    const mon = f.monitors[0];
    expect(mon.layout).toBe("HSPLIT");
    const kids = children(f, mon);
    expect(kids).toHaveLength(2);
    expect(kids[0].kind).toBe("WINDOW");
    expect(kids[1].layout).toBe("TABBED");
    for (const k of kids) k.percent = 0.5;

    const a = paneRect(f, byLabel.A);
    const b = paneRect(f, byLabel.B);
    expect(a).not.toBeNull();
    expect(a.w).toBeCloseTo(960);
    expect(a.h).toBeCloseTo(1080);
    expect(a.x).toBeCloseTo(0);
    expect(b.x).toBeCloseTo(960);
    expect(b.w).toBeCloseTo(960);
    expect(b.h).toBeCloseTo(1080);

    const split = containingSplit(f, byLabel.A);
    expect(split).not.toBeNull();
    expect(split.parent.kind).toBe("MONITOR");
    expect(split.axis).toBe("x");
  });

  it("empty CON sibling does not steal in-axis space from windows", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const host = children(f, f.monitors[0])[0];
    const empty = {
      id: "empty-con",
      kind: "CON",
      layout: "HSPLIT",
      parentId: host.id,
      childIds: [],
      percent: 0.5,
      userSized: true,
    };
    f.nodes[empty.id] = empty;
    host.childIds = [byLabel.A.id, empty.id, byLabel.B.id];
    byLabel.A.percent = 0.25;
    byLabel.B.percent = 0.25;

    const a = paneRect(f, byLabel.A);
    const b = paneRect(f, byLabel.B);
    expect(a.w).toBeCloseTo(960);
    expect(a.x).toBeCloseTo(0);
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
