import { describe, it, expect, beforeEach, vi } from "vitest";
import { OpenCommitManager } from "../../../lib/extension/open-commit-manager.js";
import { OPEN_COMMIT_MAX_WAIT_MS } from "../../../lib/extension/layout-open.js";

describe("OpenCommitManager", () => {
  /** @type {Array<{ id: number, delay: number, cb: () => void }>} */
  let scheduled;
  let nextId;
  /** @type {OpenCommitManager} */
  let mgr;
  /** @type {object[]} */
  let fires;

  beforeEach(() => {
    scheduled = [];
    nextId = 1;
    fires = [];
    mgr = new OpenCommitManager({
      schedule: (delay, cb) => {
        const id = nextId++;
        scheduled.push({ id, delay, cb });
        return id;
      },
      cancel: (id) => {
        scheduled = scheduled.filter((s) => s.id !== id);
      },
      nowMs: () => 1000,
      onFire: (mw) => fires.push(mw),
    });
  });

  it("schedule arms a timer and tracks pending", () => {
    const mw = { get_id: () => 7 };
    mgr.schedule(mw, { minQuietMs: 200, wmClass: "App", isDock: false });
    expect(mgr.has(mw)).toBe(true);
    expect(mgr.size).toBe(1);
    expect(mgr.get(mw).minQuietMs).toBe(200);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(200);
  });

  it("touchExternalGeometry re-arms quiet", () => {
    const mw = { get_id: () => 1 };
    mgr.schedule(mw, { minQuietMs: 100 });
    const firstId = scheduled[0].id;
    mgr.touchExternalGeometry(mw);
    expect(scheduled.some((s) => s.id === firstId)).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(100);
  });

  it("cancel removes pending and bag slot", () => {
    const mw = { get_id: () => 2 };
    mgr.schedule(mw, { minQuietMs: 50 });
    mgr.cancel(mw);
    expect(mgr.has(mw)).toBe(false);
    expect(scheduled).toHaveLength(0);
  });

  it("cancelAll clears all and optional settle callback", () => {
    const a = { get_id: () => 1 };
    const b = { get_id: () => 2 };
    const cleared = [];
    mgr.schedule(a, { minQuietMs: 10 });
    mgr.schedule(b, { minQuietMs: 10 });
    mgr.cancelAll({ clearSettle: (mw) => cleared.push(mw) });
    expect(mgr.size).toBe(0);
    expect(cleared).toHaveLength(2);
    expect(scheduled).toHaveLength(0);
  });

  it("fire callback runs when timer fires", () => {
    const mw = { get_id: () => 9 };
    mgr.schedule(mw, { minQuietMs: 0 });
    expect(scheduled[0].delay).toBe(0);
    scheduled[0].cb();
    expect(fires).toEqual([mw]);
  });

  it("slot names prefer window id", () => {
    const mw = { get_id: () => 42 };
    expect(mgr.slotName(mw)).toBe("oc:42");
    expect(mgr.slotName(mw)).toBe("oc:42");
  });

  it("snapshot exposes bag state", () => {
    const mw = { get_id: () => 3 };
    mgr.schedule(mw, { minQuietMs: 10 });
    const snap = mgr.snapshot();
    expect(snap.label).toBe("open-commit");
    expect(snap.size).toBe(1);
  });

  it("max wait caps delay", () => {
    let now = 1000;
    mgr = new OpenCommitManager({
      schedule: (delay, cb) => {
        const id = nextId++;
        scheduled.push({ id, delay, cb });
        return id;
      },
      cancel: (id) => {
        scheduled = scheduled.filter((s) => s.id !== id);
      },
      nowMs: () => now,
      onFire: (mw) => fires.push(mw),
    });
    const mw = { get_id: () => 5 };
    mgr.schedule(mw, { minQuietMs: 99999 });
    // Advance near max wait.
    now = 1000 + OPEN_COMMIT_MAX_WAIT_MS - 50;
    mgr.arm(mw);
    expect(scheduled[scheduled.length - 1].delay).toBeLessThanOrEqual(50);
  });
});
