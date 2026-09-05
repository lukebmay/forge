import { describe, expect, it } from "vitest";
import { destroyNode } from "../../../lib/tom/atomics.js";
import { children } from "../../../lib/tom/kernel.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";
import { repairSharesAfterChildChange } from "../../../lib/tom/sizing.js";

describe("repairSharesAfterChildChange MONITOR H/V", () => {
  it("MONITOR-direct 3 kids → destroy one fills remaining percents to 100%", () => {
    const { f, byLabel } = buildGiven("Mon1(A,B,C)");
    const mon = f.monitors[0];
    expect(mon.layout).toBe("HSPLIT");
    expect(children(f, mon)).toHaveLength(3);
    for (const k of children(f, mon)) k.percent = 1 / 3;

    destroyNode(f, byLabel.C.id);

    const left = children(f, mon);
    expect(left.map((n) => n.label).sort()).toEqual(["A", "B"]);
    const sum = left.reduce((s, n) => s + (n.percent ?? 0), 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(left[0].percent).toBeCloseTo(0.5, 6);
    expect(left[1].percent).toBeCloseTo(0.5, 6);
  });

  it("MONITOR VSPLIT 3 kids rescale like CON", () => {
    const { f, byLabel } = buildGiven("Mon1(A,B,C)");
    const mon = f.monitors[0];
    mon.layout = "VSPLIT";
    for (const k of children(f, mon)) {
      k.percent = 1 / 3;
      k.userSized = true;
    }

    destroyNode(f, byLabel.B.id);
    const r = repairSharesAfterChildChange(f, mon);
    expect(r.ok).toBe(true);
    expect(r.skipped).toBeUndefined();

    const left = children(f, mon);
    expect(left).toHaveLength(2);
    const sum = left.reduce((s, n) => s + (n.percent ?? 0), 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(left[0].percent).toBeCloseTo(0.5, 6);
    expect(left[1].percent).toBeCloseTo(0.5, 6);
  });

  it("MONITOR TABBED (child-CON hint) still skips", () => {
    const { f } = buildGiven("Mon1(TAB(A,B))");
    const mon = f.monitors[0];
    mon.layout = "TABBED";
    const r = repairSharesAfterChildChange(f, mon);
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
  });
});
