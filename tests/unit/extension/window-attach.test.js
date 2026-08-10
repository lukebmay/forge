import { describe, it, expect, beforeEach, vi } from "vitest";
import { WindowAttach } from "../../../lib/extension/window-attach.js";
import { Lifetime } from "../../../lib/extension/lifetime.js";

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
 * Fake GObject-like target for SignalBag residual checks.
 */
function createFakeTarget() {
  let nextId = 1;
  /** @type {Map<number, { name: string, cb: Function }>} */
  const live = new Map();

  return {
    live,
    connect(name, cb) {
      const id = nextId++;
      live.set(id, { name, cb });
      return id;
    },
    disconnect(id) {
      live.delete(id);
    },
    residualIds() {
      return [...live.keys()];
    },
  };
}

/** Minimal fake MetaWindow. */
function fakeWindow(id) {
  return {
    id,
    get_id() {
      return id;
    },
  };
}

describe("WindowAttach", () => {
  /** @type {ReturnType<typeof createFakeGLib>} */
  let glib;
  /** @type {WindowAttach} */
  let attach;
  let clock;

  beforeEach(() => {
    glib = createFakeGLib();
    clock = 1000;
    attach = new WindowAttach({
      label: "wm-win",
      schedule: (d, cb) => glib.schedule(d, cb),
      cancel: (id) => glib.cancel(id),
      scheduleIdle: (cb) => glib.scheduleIdle(cb),
      nowMs: () => clock,
    });
  });

  it("attach creates Lifetime; second attach returns same", () => {
    const mw = fakeWindow(7);
    const a = attach.attach(mw);
    const b = attach.attach(mw);
    expect(a).toBeInstanceOf(Lifetime);
    expect(b).toBe(a);
    expect(attach.size).toBe(1);
    expect(attach.get(mw)).toBe(a);
  });

  it("get returns null for unknown or non-object", () => {
    expect(attach.get(fakeWindow(1))).toBeNull();
    expect(attach.get(null)).toBeNull();
    expect(attach.get(undefined)).toBeNull();
  });

  it("attach ignores non-object key", () => {
    expect(attach.attach(null)).toBeNull();
    expect(attach.attach(undefined)).toBeNull();
    expect(attach.size).toBe(0);
  });

  it("label includes window id by default; opts.label overrides", () => {
    const mw = fakeWindow(42);
    const lt = attach.attach(mw);
    expect(lt.label).toBe("wm-win:42");
    expect(lt.sources.label).toBe("wm-win:42");

    const mw2 = fakeWindow(99);
    const custom = attach.attach(mw2, { label: "stack-pin:99" });
    expect(custom.label).toBe("stack-pin:99");
  });

  it("independent bags per window identity", () => {
    const a = fakeWindow(1);
    const b = fakeWindow(2);
    const ltA = attach.attach(a);
    const ltB = attach.attach(b);
    expect(ltA).not.toBe(ltB);
    ltA.sources.set("stack", 50, () => {});
    expect(ltA.sources.size).toBe(1);
    expect(ltB.sources.size).toBe(0);
    expect(attach.size).toBe(2);
  });

  it("dispose one window residual 0; other window intact", () => {
    const target = createFakeTarget();
    const a = fakeWindow(1);
    const b = fakeWindow(2);
    const ltA = attach.attach(a);
    const ltB = attach.attach(b);
    ltA.sources.set("stack", 50, () => {});
    ltA.signals.connect(target, "unmanaged", () => {});
    ltB.sources.set("stack", 50, () => {});

    expect(attach.dispose(a)).toBe(true);
    expect(attach.get(a)).toBeNull();
    expect(ltA.disposed).toBe(true);
    expect(glib.residualIds().length).toBe(1); // only B's timer
    expect(target.residualIds()).toEqual([]);
    expect(attach.get(b)).toBe(ltB);
    expect(ltB.disposed).toBe(false);
    expect(attach.size).toBe(1);

    expect(attach.dispose(a)).toBe(false); // already gone
  });

  it("disposeAll residual 0 on fakes", () => {
    const target = createFakeTarget();
    const wins = [fakeWindow(1), fakeWindow(2), fakeWindow(3)];
    for (const mw of wins) {
      const lt = attach.attach(mw);
      lt.sources.set("stack", 50, () => {});
      lt.sources.setIdle("idle", () => {});
      lt.signals.connect(target, "focus", () => {});
    }
    expect(attach.size).toBe(3);
    expect(glib.residualIds().length).toBe(6);

    const n = attach.disposeAll();
    expect(n).toBe(3);
    expect(attach.size).toBe(0);
    expect(glib.residualIds()).toEqual([]);
    expect(target.residualIds()).toEqual([]);
    expect(attach.disposeAll()).toBe(0);
  });

  it("attach after dispose creates a fresh Lifetime", () => {
    const mw = fakeWindow(5);
    const first = attach.attach(mw);
    first.sources.set("stack", 10, () => {});
    attach.dispose(mw);
    expect(first.disposed).toBe(true);

    const second = attach.attach(mw);
    expect(second).not.toBe(first);
    expect(second.disposed).toBe(false);
    expect(attach.get(mw)).toBe(second);
    second.sources.set("stack", 10, () => {});
    expect(glib.residualIds().length).toBe(1);
    attach.dispose(mw);
    expect(glib.residualIds()).toEqual([]);
  });

  it("snapshot lists tracked windows + counters", () => {
    const a = fakeWindow(2);
    const b = fakeWindow(1);
    clock = 2000;
    attach.attach(a).sources.set("stack", 50, () => {});
    attach.attach(b);
    clock = 2050;
    const snap = attach.snapshot();
    expect(snap.label).toBe("wm-win");
    expect(snap.size).toBe(2);
    expect(snap.attachCount).toBe(2);
    expect(snap.disposeCount).toBe(0);
    // Sorted by windowId
    expect(snap.windows.map((w) => w.windowId)).toEqual(["1", "2"]);
    expect(snap.windows[1].lifetime).toMatchObject({
      label: "wm-win:2",
      disposed: false,
      sources: expect.objectContaining({ size: 1 }),
    });
    expect(snap.windows[1].lifetime.sources.slots[0]).toMatchObject({
      name: "stack",
      delayMs: 50,
      ageMs: 50,
    });

    attach.disposeAll();
    const after = attach.snapshot();
    expect(after.size).toBe(0);
    expect(after.windows).toEqual([]);
    expect(after.disposeCount).toBe(2);
  });

  it("per-window sources.set replaces stack slot without dual fields", () => {
    const mw = fakeWindow(8);
    const lt = attach.attach(mw);
    const id1 = lt.sources.set("stack", 50, () => {});
    const id2 = lt.sources.set("stack", 50, () => {});
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(lt.sources.size).toBe(1);
    expect(glib.residualIds()).toEqual([id2]);
    attach.dispose(mw);
    expect(glib.residualIds()).toEqual([]);
  });
});
