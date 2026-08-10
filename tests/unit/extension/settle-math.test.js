import { describe, it, expect } from "vitest";
import {
  PAD,
  ROLLING_N,
  lastRollingLatencies,
  softTimeoutFromLatencies,
} from "../../../lib/extension/settle-math.js";

/**
 * Golden rows shared with tests/unit/cli/test_settle_heuristics.py SoftTimeoutKernel.
 * JS Math.trunc must match Python int(...) toward zero for positive values.
 */
export const SETTLE_MATH_GOLDEN = [
  { latenciesMs: [], pad: 1.25, floor: 400, clamp: 3000, expect: 400 },
  { latenciesMs: [100], pad: 1.25, floor: 400, clamp: 3000, expect: 400 },
  { latenciesMs: [800], pad: 1.25, floor: 400, clamp: 3000, expect: 1000 },
  { latenciesMs: [100, 2000], pad: 1.25, floor: 400, clamp: 3000, expect: 2500 },
  { latenciesMs: [10000], pad: 1.25, floor: 400, clamp: 3000, expect: 3000 },
  // last 15: outlier ages out of window; max in last 10 is 400 → 500
  {
    latenciesMs: [9000, 1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400],
    pad: 1.25,
    floor: 0,
    clamp: 99999,
    expect: 500,
    rolling: true,
  },
  // fractional pad product: 50 * 1.25 = 62.5 → trunc 62
  { latenciesMs: [50], pad: 1.25, floor: 0, clamp: 5000, expect: 62 },
  // bad inputs skipped → empty → floor
  {
    latenciesMs: [null, undefined, NaN, -5, "x", Infinity, -Infinity],
    pad: 1.25,
    floor: 400,
    clamp: 3000,
    expect: 400,
  },
];

describe("settle-math constants", () => {
  it("exports locked ROLLING_N and PAD", () => {
    expect(ROLLING_N).toBe(10);
    expect(PAD).toBe(1.25);
  });
});

describe("lastRollingLatencies", () => {
  it("returns empty for non-array / empty", () => {
    expect(lastRollingLatencies(null)).toEqual([]);
    expect(lastRollingLatencies(undefined)).toEqual([]);
    expect(lastRollingLatencies("100")).toEqual([]);
    expect(lastRollingLatencies([])).toEqual([]);
  });

  it("keeps non-negative finite ints; skips invalid", () => {
    expect(lastRollingLatencies([100, -1, NaN, "x", 200.9, Infinity, 0])).toEqual([100, 200, 0]);
  });

  it("trims to last N (default ROLLING_N)", () => {
    const vals = Array.from({ length: ROLLING_N + 5 }, (_, i) => i * 10);
    const out = lastRollingLatencies(vals);
    expect(out).toHaveLength(ROLLING_N);
    expect(out[0]).toBe(5 * 10);
    expect(out[out.length - 1]).toBe((ROLLING_N + 4) * 10);
  });

  it("honors custom n", () => {
    expect(lastRollingLatencies([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
    expect(lastRollingLatencies([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

describe("softTimeoutFromLatencies", () => {
  it("empty → floor", () => {
    expect(softTimeoutFromLatencies([], { floor: 400, clamp: 3000 })).toBe(400);
    expect(softTimeoutFromLatencies(null, { floor: 200, clamp: 5000 })).toBe(200);
  });

  it("single sample below floor stays at floor", () => {
    expect(softTimeoutFromLatencies([100], { pad: 1.25, floor: 400, clamp: 3000 })).toBe(400);
  });

  it("pads max and clamps", () => {
    expect(softTimeoutFromLatencies([800], { pad: 1.25, floor: 400, clamp: 3000 })).toBe(1000);
    expect(softTimeoutFromLatencies([10000], { pad: 1.25, floor: 400, clamp: 3000 })).toBe(3000);
  });

  it("uses Math.trunc toward zero (match Python int)", () => {
    expect(softTimeoutFromLatencies([50], { pad: 1.25, floor: 0, clamp: 5000 })).toBe(62);
    expect(softTimeoutFromLatencies([333], { pad: 1.25, floor: 0, clamp: 99999 })).toBe(416);
  });

  it("skips bad inputs", () => {
    expect(
      softTimeoutFromLatencies([null, "bad", -10, 800], {
        pad: 1.25,
        floor: 0,
        clamp: 5000,
      })
    ).toBe(1000);
  });

  it("defaults pad to PAD when invalid", () => {
    expect(softTimeoutFromLatencies([800], { pad: 0, floor: 0, clamp: 5000 })).toBe(1000);
    expect(softTimeoutFromLatencies([800], { pad: -1, floor: 0, clamp: 5000 })).toBe(1000);
  });
});

describe("golden parity (JS ↔ CLI)", () => {
  it.each(SETTLE_MATH_GOLDEN)(
    "row %# → $expect",
    ({ latenciesMs, pad, floor, clamp, expect: want, rolling }) => {
      const samples = rolling ? lastRollingLatencies(latenciesMs, ROLLING_N) : latenciesMs;
      expect(softTimeoutFromLatencies(samples, { pad, floor, clamp })).toBe(want);
    }
  );
});
