import { describe, it, expect, beforeEach, vi } from "vitest";
import { Lifetime } from "../../../lib/extension/lifetime.js";
import { SourceBag } from "../../../lib/extension/sources.js";
import { SignalBag } from "../../../lib/extension/signals.js";

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
    residualIds() {
      return [...live.keys()];
    },
  };
}

/**
 * Fake GObject-like target: residual live ids after dispose = leak.
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

describe("Lifetime", () => {
  /** @type {ReturnType<typeof createFakeGLib>} */
  let glib;
  /** @type {ReturnType<typeof createFakeTarget>} */
  let target;
  /** @type {Lifetime} */
  let lt;
  let clock;

  beforeEach(() => {
    glib = createFakeGLib();
    target = createFakeTarget();
    clock = 1000;
    lt = new Lifetime({
      label: "wm",
      schedule: (d, cb) => glib.schedule(d, cb),
      cancel: (id) => glib.cancel(id),
      scheduleIdle: (cb) => glib.scheduleIdle(cb),
      nowMs: () => clock,
    });
  });

  it("set + connect work before dispose", () => {
    const srcCb = vi.fn();
    const sigCb = vi.fn();
    const srcId = lt.sources.set("queue", 16, srcCb);
    const sigId = lt.signals.connect(target, "window-created", sigCb, {
      group: "display",
    });
    expect(srcId).toBeTruthy();
    expect(sigId).toBeTruthy();
    expect(lt.sources.size).toBe(1);
    expect(lt.signals.size).toBe(1);
    expect(glib.live.has(srcId)).toBe(true);
    expect(target.live.has(sigId)).toBe(true);
    expect(lt.disposed).toBe(false);
  });

  it("dispose residual 0 on fake glib and signal target", () => {
    lt.sources.set("queue", 16, () => {});
    lt.sources.setIdle("idle-1", () => {});
    lt.signals.connect(target, "changed", () => {}, { group: "settings" });
    lt.signals.connect(target, "window-created", () => {}, { group: "display" });

    lt.dispose();

    expect(lt.disposed).toBe(true);
    expect(lt.sources.disposed).toBe(true);
    expect(lt.signals.disposed).toBe(true);
    expect(lt.sources.size).toBe(0);
    expect(lt.signals.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
    expect(target.residualIds()).toEqual([]);
  });

  it("double dispose is safe", () => {
    lt.sources.set("x", 1, () => {});
    lt.signals.connect(target, "a", () => {});
    lt.dispose();
    expect(() => lt.dispose()).not.toThrow();
    expect(glib.residualIds()).toEqual([]);
    expect(target.residualIds()).toEqual([]);
    expect(lt.disposed).toBe(true);
  });

  it("after dispose sealed: set/connect no-op like child bags", () => {
    lt.dispose();
    const srcId = lt.sources.set("y", 1, () => {});
    const sigId = lt.signals.connect(target, "x", () => {});
    expect(srcId).toBeNull();
    expect(sigId).toBeNull();
    expect(lt.sources.size).toBe(0);
    expect(lt.signals.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
    expect(target.residualIds()).toEqual([]);
  });

  it("snapshot combines sources + signals + disposed", () => {
    clock = 5000;
    lt.sources.set("queue", 200, () => {});
    lt.signals.connect(target, "changed", () => {}, { group: "settings" });
    clock = 5120;
    const snap = lt.snapshot();
    expect(snap.label).toBe("wm");
    expect(snap.disposed).toBe(false);
    expect(snap.sources).toMatchObject({
      label: "wm",
      disposed: false,
      size: 1,
      setCount: 1,
    });
    expect(snap.sources.slots[0]).toMatchObject({
      name: "queue",
      kind: "timeout",
      delayMs: 200,
      ageMs: 120,
    });
    expect(snap.signals).toMatchObject({
      label: "wm",
      disposed: false,
      size: 1,
      connectCount: 1,
    });
    expect(snap.signals.connections[0]).toMatchObject({
      signal: "changed",
      group: "settings",
      ageMs: 120,
    });

    lt.dispose();
    const after = lt.snapshot();
    expect(after.disposed).toBe(true);
    expect(after.sources.disposed).toBe(true);
    expect(after.signals.disposed).toBe(true);
    expect(after.sources.size).toBe(0);
    expect(after.signals.size).toBe(0);
  });

  it("propagates label to child bags", () => {
    expect(lt.sources.label).toBe("wm");
    expect(lt.signals.label).toBe("wm");
  });

  it("accepts injected sources and signals bags", () => {
    const sources = new SourceBag({
      label: "inj-src",
      schedule: (d, cb) => glib.schedule(d, cb),
      cancel: (id) => glib.cancel(id),
      scheduleIdle: (cb) => glib.scheduleIdle(cb),
    });
    const signals = new SignalBag({ label: "inj-sig" });
    const wrapped = new Lifetime({
      label: "wrap",
      sources,
      signals,
    });
    expect(wrapped.sources).toBe(sources);
    expect(wrapped.signals).toBe(signals);

    sources.set("a", 1, () => {});
    signals.connect(target, "b", () => {});
    wrapped.dispose();
    expect(glib.residualIds()).toEqual([]);
    expect(target.residualIds()).toEqual([]);
    expect(sources.disposed).toBe(true);
    expect(signals.disposed).toBe(true);
  });

  it("dispose order: signals then sources (residual timer after signal arm)", () => {
    // Handler would have armed a timer if an event fired; residual source
    // from before disconnect must still clear on Lifetime.dispose.
    lt.sources.set("residual", 50, () => {});
    lt.signals.connect(target, "notify", () => {});
    expect(glib.residualIds().length).toBe(1);
    expect(target.residualIds().length).toBe(1);

    lt.dispose();
    expect(target.residualIds()).toEqual([]);
    expect(glib.residualIds()).toEqual([]);
  });
});
