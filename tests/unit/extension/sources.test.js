import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SourceBag,
  glibSchedule,
  glibCancel,
  glibIdleSchedule,
  sourceTraceInteresting,
} from "../../../lib/extension/sources.js";
import {
  glibSchedule as lcSchedule,
  glibCancel as lcCancel,
} from "../../../lib/extension/layout-controller.js";

/**
 * Fake GLib registry: residual ids after dispose = leak.
 */
function createFakeGLib() {
  let nextId = 1;
  /** @type {Map<number, { kind: string, delayMs: number, cb: () => void }>} */
  const live = new Map();

  return {
    live,
    schedule(delayMs, cb) {
      const id = nextId++;
      live.set(id, { kind: "timeout", delayMs, cb });
      return id;
    },
    scheduleIdle(cb) {
      const id = nextId++;
      live.set(id, { kind: "idle", delayMs: 0, cb });
      return id;
    },
    cancel(id) {
      live.delete(id);
    },
    fire(id) {
      const t = live.get(id);
      if (!t) return false;
      live.delete(id);
      t.cb();
      return true;
    },
    /** Fire all due timeouts (idle: delay 0 always due). */
    fireAll() {
      const ids = [...live.keys()];
      for (const id of ids) {
        this.fire(id);
      }
    },
    residualIds() {
      return [...live.keys()];
    },
  };
}

describe("sources re-export", () => {
  it("layout-controller re-exports the same glibSchedule/glibCancel", () => {
    expect(lcSchedule).toBe(glibSchedule);
    expect(lcCancel).toBe(glibCancel);
  });

  it("exports glibIdleSchedule", () => {
    expect(typeof glibIdleSchedule).toBe("function");
  });
});

describe("sourceTraceInteresting", () => {
  it("quiets high-churn names and keeps place-hint / hunt slots", () => {
    expect(sourceTraceInteresting("renderTree")).toBe(false);
    expect(sourceTraceInteresting("queue")).toBe(false);
    expect(sourceTraceInteresting("sessionLayoutSave")).toBe(false);
    expect(sourceTraceInteresting("wsWindowAdd")).toBe(false);
    expect(sourceTraceInteresting("tabDragPointer")).toBe(false);
    expect(sourceTraceInteresting("latePlaceHintApply:123")).toBe(true);
    expect(sourceTraceInteresting("windowHomeReconcile")).toBe(true);
  });
});

describe("SourceBag", () => {
  /** @type {ReturnType<typeof createFakeGLib>} */
  let glib;
  /** @type {SourceBag} */
  let bag;
  let clock;

  beforeEach(() => {
    glib = createFakeGLib();
    clock = 1000;
    bag = new SourceBag({
      label: "test",
      schedule: (d, cb) => glib.schedule(d, cb),
      cancel: (id) => glib.cancel(id),
      scheduleIdle: (cb) => glib.scheduleIdle(cb),
      nowMs: () => clock,
    });
  });

  it("set schedules a named slot and returns id", () => {
    const cb = vi.fn();
    const id = bag.set("queue", 50, cb);
    expect(id).toBeTruthy();
    expect(bag.has("queue")).toBe(true);
    expect(bag.getId("queue")).toBe(id);
    expect(bag.size).toBe(1);
    expect(glib.live.has(id)).toBe(true);
  });

  it("fire removes slot, invokes cb, leaves no residual id", () => {
    const cb = vi.fn();
    const id = bag.set("queue", 10, cb);
    expect(glib.fire(id)).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(bag.has("queue")).toBe(false);
    expect(bag.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
    expect(bag.snapshot().fireCount).toBe(1);
  });

  it("replace same name cancels prior source (no residual)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const id1 = bag.set("queue", 100, a);
    const id2 = bag.set("queue", 20, b);
    expect(id1).not.toBe(id2);
    expect(glib.live.has(id1)).toBe(false);
    expect(glib.live.has(id2)).toBe(true);
    expect(bag.size).toBe(1);
    expect(bag.snapshot().replaceCount).toBe(1);

    glib.fire(id2);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(glib.residualIds()).toEqual([]);
  });

  it("cancel removes one slot", () => {
    const cb = vi.fn();
    const id = bag.set("renderTree", 5, cb);
    expect(bag.cancel("renderTree")).toBe(true);
    expect(bag.cancel("renderTree")).toBe(false);
    expect(glib.live.has(id)).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(glib.residualIds()).toEqual([]);
  });

  it("cancelAll clears every slot with zero residual ids", () => {
    bag.set("a", 1, () => {});
    bag.set("b", 2, () => {});
    bag.setIdle("c", () => {});
    expect(bag.size).toBe(3);
    expect(bag.cancelAll()).toBe(3);
    expect(bag.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
    expect(bag.cancelAll()).toBe(0);
  });

  it("dispose seals bag and is idempotent", () => {
    bag.set("x", 1, () => {});
    bag.dispose();
    expect(bag.disposed).toBe(true);
    expect(glib.residualIds()).toEqual([]);

    const id = bag.set("y", 1, () => {});
    expect(id).toBeNull();
    expect(bag.size).toBe(0);

    bag.dispose(); // second dispose no throw
    expect(glib.residualIds()).toEqual([]);
  });

  it("sync schedule (idle mock) fires cb and leaves no residual slot", () => {
    const cb = vi.fn();
    const syncBag = new SourceBag({
      label: "sync",
      scheduleIdle: (wrapped) => {
        wrapped(); // fire before returning id (default GLib test mock)
        return 77;
      },
      cancel: () => {},
    });
    const id = syncBag.setIdle("renderTree", cb);
    expect(id).toBe(77);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(syncBag.has("renderTree")).toBe(false);
    expect(syncBag.size).toBe(0);
    expect(syncBag.snapshot().fireCount).toBe(1);
  });

  it("setIdle uses idle scheduler", () => {
    const cb = vi.fn();
    const id = bag.setIdle("idle-1", cb);
    expect(glib.live.get(id).kind).toBe("idle");
    glib.fire(id);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("callback throw is swallowed; bag stays consistent", () => {
    const id = bag.set("boom", 1, () => {
      throw new Error("boom");
    });
    expect(() => glib.fire(id)).not.toThrow();
    expect(bag.has("boom")).toBe(false);
    expect(glib.residualIds()).toEqual([]);
  });

  it("independent slots do not interfere", () => {
    const a = vi.fn();
    const b = vi.fn();
    const idA = bag.set("a", 1, a);
    const idB = bag.set("b", 1, b);
    bag.cancel("a");
    glib.fire(idB);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(glib.live.has(idA)).toBe(false);
    expect(glib.residualIds()).toEqual([]);
  });

  it("snapshot reports live slots and counters for failure dumps", () => {
    clock = 5000;
    bag.set("queue", 200, () => {});
    clock = 5120;
    const snap = bag.snapshot();
    expect(snap.label).toBe("test");
    expect(snap.disposed).toBe(false);
    expect(snap.size).toBe(1);
    expect(snap.setCount).toBe(1);
    expect(snap.slots).toHaveLength(1);
    expect(snap.slots[0]).toMatchObject({
      name: "queue",
      kind: "timeout",
      delayMs: 200,
      ageMs: 120,
    });
  });

  it("rejects non-function callbacks", () => {
    // @ts-expect-error intentional
    expect(bag.set("bad", 1, null)).toBeNull();
    expect(bag.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
  });
});
