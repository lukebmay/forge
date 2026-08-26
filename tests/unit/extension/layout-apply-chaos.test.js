/**
 * Layout open chaos slice 1 — seeded cocktail (shuffle + delays).
 */
import { describe, it, expect } from "vitest";
import {
  applyLayoutChaosCocktail,
  chaosSeedFrom,
  mulberry32,
} from "../../../lib/extension/layout-apply-open.js";

describe("layout chaos cocktail (slice 1)", () => {
  it("chaosSeedFrom is stable for the same string", () => {
    expect(chaosSeedFrom("abc")).toBe(chaosSeedFrom("abc"));
    expect(chaosSeedFrom("1")).toBe(1);
  });

  it("same seed → same shuffle + delay choices", () => {
    const actions = [
      { op: "open", role: "a" },
      { op: "open", role: "b" },
      { op: "open", role: "c" },
      { op: "open", role: "d" },
    ];
    const a = applyLayoutChaosCocktail(actions, { seed: 42 });
    const b = applyLayoutChaosCocktail(actions, { seed: 42 });
    expect(a.cocktail).toEqual(b.cocktail);
    expect(a.actions.map((x) => x.role)).toEqual(b.actions.map((x) => x.role));
  });

  it("mulberry32 is deterministic", () => {
    const r1 = mulberry32(99);
    const r2 = mulberry32(99);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it("forced strategies via rand script produce delays in range", () => {
    // Always pick delay path: first coin for shuffle false, second for delay true.
    let i = 0;
    const seq = [0.9, 0.1, 0.1, 0.2, 0.3]; // shuffle off, delay on, 2 delays, values
    const rand = () => seq[Math.min(i++, seq.length - 1)];
    const out = applyLayoutChaosCocktail([{ role: "a" }, { role: "b" }, { role: "c" }], {
      seed: 1,
      rand,
    });
    expect(out.cocktail.shuffle).toBe(false);
    expect(out.cocktail.strategies).toContain("inter-group-delay");
    expect(out.cocktail.delaysMs.length).toBeGreaterThanOrEqual(1);
    for (const d of out.cocktail.delaysMs) {
      expect(d).toBeGreaterThanOrEqual(50);
      expect(d).toBeLessThanOrEqual(400);
    }
  });
});
