import { describe, expect, it } from "vitest";
import { wrapNodes } from "../../../lib/tom/composed.js";
import { children } from "../../../lib/tom/kernel.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

describe("wrapNodes inherited slot share", () => {
  it("keeps wrap.percent and does not equalize a 50/50 host", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A,B)");
    const mon = f.monitors[0];
    const a = byLabel.A;
    const b = byLabel.B;
    a.percent = 0.5;
    a.userSized = false;
    b.percent = 0.5;
    b.userSized = true;
    const wrap = api.makeCon("VSPLIT", []);
    api._registerTree(f, wrap);
    wrap.percent = b.percent;
    wrap.userSized = !!b.userSized;

    const r = wrapNodes(f, mon, [b], wrap);
    expect(r.ok).toBe(true);

    const kids = children(f, mon);
    expect(kids).toHaveLength(2);
    expect(wrap.percent).toBeCloseTo(0.5, 6);
    expect(a.percent).toBeCloseTo(0.5, 6);
    expect(kids.map((n) => n.id).sort()).toEqual([a.id, wrap.id].sort());
  });

  it("does not 1/3-equalize host when wrapping one of two share siblings", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A,B)");
    const mon = f.monitors[0];
    for (const k of children(f, mon)) {
      k.percent = 0.5;
      k.userSized = false;
    }
    const wrap = api.makeCon("VSPLIT", []);
    api._registerTree(f, wrap);
    wrap.percent = byLabel.B.percent;
    wrap.userSized = false;

    wrapNodes(f, mon, [byLabel.B], wrap);

    expect(wrap.percent).toBeCloseTo(0.5, 6);
    expect(byLabel.A.percent).toBeCloseTo(0.5, 6);
    expect(children(f, mon)).toHaveLength(2);
  });
});
