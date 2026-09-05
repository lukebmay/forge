import { describe, expect, it } from "vitest";
import { destroyNode } from "../../../lib/tom/atomics.js";
import { children, parent } from "../../../lib/tom/kernel.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";
import { settle } from "../../../lib/rulesets/mark2.js";

describe("unary collapse after close of slot-split peer", () => {
  it("H(V(A,C),B) Close(C) → H(A,B) with B still ~1/2", () => {
    const { f, byLabel } = buildGiven("Mon1(H(V(A,C),B))");
    const mon = f.monitors[0];
    const h = children(f, mon)[0];
    const v = children(f, h).find((n) => n.layout === "VSPLIT");
    const b = byLabel.B;
    b.percent = 0.5;
    b.userSized = false;
    v.percent = 0.5;
    v.userSized = true;

    destroyNode(f, byLabel.C.id);
    settle(f, mon);

    expect(f.nodes[byLabel.C.id]).toBeUndefined();
    expect(f.nodes[v.id]).toBeUndefined();
    const hNow = parent(f, byLabel.A);
    expect(hNow).toBeTruthy();
    const kids = children(f, hNow);
    expect(kids.map((n) => n.label).sort()).toEqual(["A", "B"]);
    expect(byLabel.B.percent).toBeCloseTo(0.5, 5);
    expect(byLabel.A.percent).toBeCloseTo(0.5, 5);
  });

  it("unary H around TAB collapses to TAB on the MONITOR", () => {
    const { f, byLabel } = buildGiven("Mon1(H(TAB(A,B)))");
    const mon = f.monitors[0];
    settle(f, mon);
    expect(parent(f, byLabel.A)?.layout).toBe("TABBED");
    expect(parent(f, parent(f, byLabel.A))?.kind).toBe("MONITOR");
  });
});
