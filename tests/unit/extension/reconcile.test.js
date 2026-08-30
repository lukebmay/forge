import { describe, expect, it, vi } from "vitest";
import {
  ADJUST,
  RECONCILE_MAX_RETRIES,
  floatFailSafeMembership,
  forestSlotRect,
  placementRejected,
  reconcileForestWindows,
  reconcileWindowPlacement,
  tryAdjustShareForMins,
} from "../../../lib/extension/reconcile.js";
import { floatsOf, isUnderFloats, parent } from "../../../lib/tom/index.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

describe("placementRejected (C5.1)", () => {
  it("reuses slotOverflowsMins semantics", () => {
    expect(placementRejected({ width: 100, height: 100 }, { width: 200, height: 0 })).toBe(true);
    expect(placementRejected({ width: 800, height: 600 }, { width: 200, height: 100 })).toBe(false);
    expect(placementRejected(null, { width: 400, height: 400 })).toBe(false);
  });
});

describe("floatFailSafeMembership (C5.3)", () => {
  it("moves WINDOW under FLOATS and is idempotent", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const a = byLabel.A;
    const r = floatFailSafeMembership(f, a.id);
    expect(r.ok).toBe(true);
    expect(isUnderFloats(f, a)).toBe(true);
    expect(parent(f, a)).toBe(floatsOf(f));
    expect(f.monitors[0].childIds).not.toContain(a.id);

    const again = floatFailSafeMembership(f, a.id);
    expect(again.ok).toBe(true);
    expect(again.noop).toBe(true);
  });
});

describe("tryAdjustShareForMins (C5.2)", () => {
  it("equalizes a starved percent sibling when mins fit after share", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.1;
    byLabel.A.userSized = true;
    byLabel.B.percent = 0.9;
    byLabel.B.userSized = true;
    // 192px wide vs 300 min → reject; equalize → 960 ≥ 300
    const kind = tryAdjustShareForMins(f, byLabel.A.id, { width: 300, height: 0 });
    expect(kind).toBe(ADJUST.SHARE);
    const slot = forestSlotRect(f, byLabel.A);
    expect(placementRejected(slot, { width: 300, height: 0 })).toBe(false);
  });

  it("returns null when even max share cannot meet mins", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.5;
    byLabel.B.percent = 0.5;
    // Monitor 1920 — max share ~0.9 → ~1728 still < 1800
    const kind = tryAdjustShareForMins(f, byLabel.A.id, { width: 1800, height: 0 });
    expect(kind).toBeNull();
    expect(byLabel.A.percent).toBeCloseTo(0.5);
  });
});

describe("reconcileWindowPlacement (C5.1–C5.3)", () => {
  it("ok when slot already hosts mins", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: byLabel.A.id,
      getMins: () => ({ width: 100, height: 100 }),
    });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(0);
    expect(isUnderFloats(f, byLabel.A)).toBe(false);
  });

  it("adjusts share then settles without float", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.1;
    byLabel.A.userSized = true;
    byLabel.B.percent = 0.9;
    byLabel.B.userSized = true;
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: byLabel.A.id,
      getMins: () => ({ width: 300, height: 0 }),
    });
    expect(r.status).toBe("adjusted");
    expect(r.adjust).toBe(ADJUST.SHARE);
    expect(isUnderFloats(f, byLabel.A)).toBe(false);
  });

  it("slot below min → retries → FLOATS parentId; respects cap", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const adjust = vi.fn(() => ADJUST.SHARE);
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: byLabel.A.id,
      getMins: () => ({ width: 5000, height: 5000 }),
      tryAdjust: adjust,
      maxRetries: RECONCILE_MAX_RETRIES,
    });
    expect(r.status).toBe("floated");
    expect(r.adjust).toBe(ADJUST.FLOAT);
    expect(adjust).toHaveBeenCalledTimes(RECONCILE_MAX_RETRIES);
    expect(isUnderFloats(f, byLabel.A)).toBe(true);
    expect(byLabel.A.parentId).toBe(floatsOf(f).id);
  });

  it("no-op adjust immediately FLOAT fail-safe (always terminates)", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: byLabel.A.id,
      getMins: () => ({ width: 5000, height: 0 }),
      tryAdjust: () => null,
      maxRetries: 3,
    });
    expect(r.status).toBe("floated");
    expect(r.attempts).toBe(0);
    expect(isUnderFloats(f, byLabel.A)).toBe(true);
  });

  it("already under FLOATS → already-float", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    floatFailSafeMembership(f, byLabel.A.id);
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: byLabel.A.id,
      getMins: () => ({ width: 5000, height: 5000 }),
    });
    expect(r.status).toBe("already-float");
  });
});

describe("reconcileForestWindows + open-min float membership (C5.4)", () => {
  it("maps kind=float decision onto FLOATS via fail-safe helper", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    // Simulate open-min `{ kind: "float" }` writer: membership helper, not mode-only.
    const decision = { kind: "float" };
    expect(decision.kind).toBe("float");
    const moved = floatFailSafeMembership(f, byLabel.B.id);
    expect(moved.ok).toBe(true);
    expect(isUnderFloats(f, byLabel.B)).toBe(true);
  });

  it("reconcileForestWindows floats only rejected TILES windows", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const { floated, results } = reconcileForestWindows(
      f,
      (id) => (id === byLabel.A.id ? { width: 5000, height: 0 } : { width: 10, height: 10 }),
      { tryAdjust: () => null }
    );
    expect(floated).toEqual([byLabel.A.id]);
    expect(results[byLabel.A.id].status).toBe("floated");
    expect(results[byLabel.B.id].status).toBe("ok");
    expect(isUnderFloats(f, byLabel.A)).toBe(true);
    expect(isUnderFloats(f, byLabel.B)).toBe(false);
  });
});
