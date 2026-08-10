import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignalBag, disconnectSignals } from "../../../lib/extension/signals.js";

/**
 * Fake GObject-like target: residual live ids after dispose = leak.
 * finalize() makes disconnect throw (Bug #328).
 */
function createFakeTarget() {
  let nextId = 1;
  /** @type {Map<number, { name: string, cb: Function }>} */
  const live = new Map();
  let finalized = false;

  return {
    live,
    connect(name, cb) {
      if (finalized) throw new Error("Object finalized");
      const id = nextId++;
      live.set(id, { name, cb });
      return id;
    },
    disconnect(id) {
      if (finalized) {
        throw new Error("Object 0xdead has been already deallocated");
      }
      live.delete(id);
    },
    finalize() {
      finalized = true;
    },
    residualIds() {
      return [...live.keys()];
    },
  };
}

describe("disconnectSignals helper", () => {
  it("disconnects each id and clears the array", () => {
    const t = createFakeTarget();
    const a = t.connect("x", () => {});
    const b = t.connect("y", () => {});
    const signals = [a, b];
    disconnectSignals(t, signals);
    expect(t.residualIds()).toEqual([]);
    expect(signals).toEqual([]);
  });

  it("no-ops when target or signals missing", () => {
    expect(() => disconnectSignals(null, [1])).not.toThrow();
    expect(() => disconnectSignals(createFakeTarget(), null)).not.toThrow();
  });

  it("swallows per-id disconnect throws (Bug #328) and still clears array", () => {
    const t = createFakeTarget();
    const a = t.connect("a", () => {});
    const b = t.connect("b", () => {});
    t.finalize();
    const signals = [a, b];
    expect(() => disconnectSignals(t, signals)).not.toThrow();
    expect(signals).toEqual([]);
  });
});

describe("SignalBag", () => {
  /** @type {ReturnType<typeof createFakeTarget>} */
  let target;
  /** @type {SignalBag} */
  let bag;
  let clock;

  beforeEach(() => {
    target = createFakeTarget();
    clock = 1000;
    bag = new SignalBag({
      label: "test",
      nowMs: () => clock,
    });
  });

  it("connect tracks multi connections and returns ids", () => {
    const cb = vi.fn();
    const id1 = bag.connect(target, "window-created", cb);
    const id2 = bag.connect(target, "changed", cb);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(bag.size).toBe(2);
    expect(target.live.has(id1)).toBe(true);
    expect(target.live.has(id2)).toBe(true);
  });

  it("disconnect removes one id", () => {
    const id = bag.connect(target, "changed", () => {});
    expect(bag.disconnect(id)).toBe(true);
    expect(bag.disconnect(id)).toBe(false);
    expect(bag.size).toBe(0);
    expect(target.live.has(id)).toBe(false);
  });

  it("disconnectTarget clears only that target", () => {
    const other = createFakeTarget();
    const idA = bag.connect(target, "a", () => {});
    const idB = bag.connect(other, "b", () => {});
    expect(bag.disconnectTarget(target)).toBe(1);
    expect(bag.size).toBe(1);
    expect(target.live.has(idA)).toBe(false);
    expect(other.live.has(idB)).toBe(true);
  });

  it("disconnectGroup leaves other groups", () => {
    const idSettings = bag.connect(target, "changed", () => {}, { group: "settings" });
    const idDisplay = bag.connect(target, "window-created", () => {}, { group: "display" });
    const idNone = bag.connect(target, "workareas-changed", () => {});
    expect(bag.disconnectGroup("settings")).toBe(1);
    expect(bag.size).toBe(2);
    expect(target.live.has(idSettings)).toBe(false);
    expect(target.live.has(idDisplay)).toBe(true);
    expect(target.live.has(idNone)).toBe(true);
  });

  it("disconnectAll residual live ids = 0", () => {
    bag.connect(target, "a", () => {});
    bag.connect(target, "b", () => {});
    expect(bag.disconnectAll()).toBe(2);
    expect(bag.size).toBe(0);
    expect(target.residualIds()).toEqual([]);
    expect(bag.disconnectAll()).toBe(0);
  });

  it("dispose residual 0 and is idempotent", () => {
    bag.connect(target, "a", () => {});
    bag.dispose();
    expect(bag.disposed).toBe(true);
    expect(bag.size).toBe(0);
    expect(target.residualIds()).toEqual([]);

    bag.dispose();
    expect(target.residualIds()).toEqual([]);
  });

  it("safe after finalize: dispose does not throw; bag clears tracking", () => {
    bag.connect(target, "a", () => {});
    bag.connect(target, "b", () => {});
    target.finalize();
    expect(() => bag.dispose()).not.toThrow();
    expect(bag.size).toBe(0);
    expect(bag.disposed).toBe(true);
  });

  it("connect after dispose no-ops (returns null)", () => {
    bag.dispose();
    const id = bag.connect(target, "x", () => {});
    expect(id).toBeNull();
    expect(bag.size).toBe(0);
    expect(target.residualIds()).toEqual([]);
  });

  it("rejects bad target / non-function cb", () => {
    // @ts-expect-error intentional
    expect(bag.connect(null, "x", () => {})).toBeNull();
    // @ts-expect-error intentional
    expect(bag.connect(target, "x", null)).toBeNull();
    expect(bag.size).toBe(0);
    expect(target.residualIds()).toEqual([]);
  });

  it("snapshot reports live connections and counters", () => {
    clock = 5000;
    bag.connect(target, "changed", () => {}, { group: "settings" });
    clock = 5120;
    const snap = bag.snapshot();
    expect(snap.label).toBe("test");
    expect(snap.disposed).toBe(false);
    expect(snap.size).toBe(1);
    expect(snap.connectCount).toBe(1);
    expect(snap.connections).toHaveLength(1);
    expect(snap.connections[0]).toMatchObject({
      signal: "changed",
      group: "settings",
      ageMs: 120,
    });
  });

  it("multi-target disconnectAll leaves no residual on either registry", () => {
    const t2 = createFakeTarget();
    bag.connect(target, "a", () => {});
    bag.connect(t2, "b", () => {});
    bag.disconnectAll();
    expect(target.residualIds()).toEqual([]);
    expect(t2.residualIds()).toEqual([]);
  });
});
