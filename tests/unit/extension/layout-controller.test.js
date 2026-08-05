import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DebouncedRequest,
  LayoutController,
  LAYOUT_REQUEST_DEBOUNCE_MS,
  VERIFY_REQUEST_DEBOUNCE_MS,
} from "../../../lib/extension/layout-controller.js";

/**
 * Fake clock: schedule(delayMs, cb) queues timers; flush advances time.
 */
function createFakeClock() {
  let nextId = 1;
  /** @type {Map<number, { due: number, cb: () => void }>} */
  const timers = new Map();
  let now = 0;

  return {
    get now() {
      return now;
    },
    schedule(delayMs, cb) {
      const id = nextId++;
      timers.set(id, { due: now + delayMs, cb });
      return id;
    },
    cancel(id) {
      timers.delete(id);
    },
    /** Fire all timers due at or before now+ms (in due order). */
    advance(ms) {
      now += ms;
      let progressed = true;
      while (progressed) {
        progressed = false;
        const due = [...timers.entries()]
          .filter(([, t]) => t.due <= now)
          .sort((a, b) => a[1].due - b[1].due);
        for (const [id, t] of due) {
          if (!timers.has(id)) continue;
          timers.delete(id);
          t.cb();
          progressed = true;
        }
      }
    },
    pendingCount() {
      return timers.size;
    },
  };
}

describe("layout-controller constants", () => {
  it("exports debounce defaults in the locked range", () => {
    expect(LAYOUT_REQUEST_DEBOUNCE_MS).toBeGreaterThanOrEqual(150);
    expect(LAYOUT_REQUEST_DEBOUNCE_MS).toBeLessThanOrEqual(300);
    expect(VERIFY_REQUEST_DEBOUNCE_MS).toBeGreaterThanOrEqual(50);
    expect(VERIFY_REQUEST_DEBOUNCE_MS).toBeLessThanOrEqual(300);
    expect(LAYOUT_REQUEST_DEBOUNCE_MS).toBe(200);
    expect(VERIFY_REQUEST_DEBOUNCE_MS).toBe(150);
  });
});

describe("DebouncedRequest", () => {
  let clock;
  let fires;

  beforeEach(() => {
    clock = createFakeClock();
    fires = [];
  });

  function make(delayMs = 200) {
    return new DebouncedRequest({
      delayMs,
      schedule: (d, cb) => clock.schedule(d, cb),
      cancel: (id) => clock.cancel(id),
      onFire: (reasons) => fires.push(reasons.slice()),
    });
  }

  it("fires once after N rapid requests", () => {
    const d = make(200);
    d.request("a");
    d.request("b");
    d.request("c");
    expect(fires).toHaveLength(0);
    clock.advance(199);
    expect(fires).toHaveLength(0);
    clock.advance(1);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toEqual(["a", "b", "c"]);
  });

  it("coalesces reasons unique with insertion order", () => {
    const d = make(100);
    d.request("window-created");
    d.request("size-changed");
    d.request("window-created");
    d.request("focus");
    clock.advance(100);
    expect(fires[0]).toEqual(["window-created", "size-changed", "focus"]);
  });

  it("trailing: new request during wait resets the timer", () => {
    const d = make(200);
    d.request("first");
    clock.advance(150);
    d.request("second");
    clock.advance(150);
    expect(fires).toHaveLength(0);
    clock.advance(50);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toEqual(["first", "second"]);
  });

  it("cancel prevents fire and clears reasons", () => {
    const d = make(200);
    d.request("x");
    d.cancel();
    clock.advance(500);
    expect(fires).toHaveLength(0);
    expect(d.pendingReasons).toEqual([]);
    expect(d.hasPending).toBe(false);
  });

  it("destroy prevents further requests", () => {
    const d = make(50);
    d.destroy();
    d.request("after-destroy");
    clock.advance(100);
    expect(fires).toHaveLength(0);
  });

  it("empty / null reason becomes unknown", () => {
    const d = make(10);
    d.request("");
    d.request(undefined);
    clock.advance(10);
    expect(fires[0]).toEqual(["unknown"]);
  });
});

describe("LayoutController", () => {
  let clock;
  let renderCalls;
  let wm;

  beforeEach(() => {
    clock = createFakeClock();
    renderCalls = [];
    wm = {
      renderTree: vi.fn((from) => {
        renderCalls.push(from);
      }),
    };
  });

  function make(opts = {}) {
    return new LayoutController(wm, {
      schedule: (d, cb) => clock.schedule(d, cb),
      cancel: (id) => clock.cancel(id),
      layoutDelayMs: LAYOUT_REQUEST_DEBOUNCE_MS,
      verifyDelayMs: VERIFY_REQUEST_DEBOUNCE_MS,
      ...opts,
    });
  }

  it("requestLayout coalesces and calls renderTree once with joined reasons", () => {
    const lc = make();
    lc.requestLayout("a");
    lc.requestLayout("b");
    lc.requestLayout("a");
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS - 1);
    expect(wm.renderTree).not.toHaveBeenCalled();
    clock.advance(1);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);
    expect(wm.renderTree).toHaveBeenCalledWith("a,b");
    expect(lc.lastLayoutReasons).toEqual(["a", "b"]);
  });

  it("requestVerify stub fires once and records reasons", () => {
    const lc = make();
    lc.requestVerify("size-changed");
    lc.requestVerify("position-changed");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
    expect(lc.lastVerifyReasons).toEqual(["size-changed", "position-changed"]);
  });

  it("layout and verify channels are independent", () => {
    const lc = make();
    lc.requestLayout("layout-only");
    lc.requestVerify("verify-only");
    // Advance only layout delay; verify uses shorter delay so both may fire.
    // Fire layout at 200ms, verify at 150ms — after 150 only verify; after 200 both.
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
    expect(wm.renderTree).not.toHaveBeenCalled();
    expect(lc.pendingLayoutReasons).toEqual(["layout-only"]);
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS - VERIFY_REQUEST_DEBOUNCE_MS);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("layout fire does not clear pending verify", () => {
    const lc = make({ layoutDelayMs: 50, verifyDelayMs: 200 });
    lc.requestLayout("L");
    lc.requestVerify("V");
    clock.advance(50);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);
    expect(lc.verifyFireCount).toBe(0);
    expect(lc.pendingVerifyReasons).toEqual(["V"]);
    clock.advance(150);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("onRenderComplete schedules verify with post-render", () => {
    const lc = make();
    lc.onRenderComplete("tree-apply");
    expect(lc.pendingVerifyReasons).toContain("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.lastVerifyReasons).toEqual(["post-render"]);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("cancel / destroy prevent pending fires", () => {
    const lc = make();
    lc.requestLayout("x");
    lc.requestVerify("y");
    lc.cancel();
    clock.advance(1000);
    expect(wm.renderTree).not.toHaveBeenCalled();
    expect(lc.verifyFireCount).toBe(0);

    lc.requestLayout("again");
    lc.destroy();
    clock.advance(1000);
    expect(wm.renderTree).not.toHaveBeenCalled();
  });

  it("custom onLayout / onVerify hooks replace defaults", () => {
    const layouts = [];
    const verifies = [];
    const lc = make({
      onLayout: (r) => layouts.push(r),
      onVerify: (r) => verifies.push(r),
    });
    lc.requestLayout("L1");
    lc.requestVerify("V1");
    clock.advance(Math.max(LAYOUT_REQUEST_DEBOUNCE_MS, VERIFY_REQUEST_DEBOUNCE_MS));
    expect(layouts).toEqual([["L1"]]);
    expect(verifies).toEqual([["V1"]]);
    expect(wm.renderTree).not.toHaveBeenCalled();
  });

  it("missing wm.renderTree does not throw on layout fire", () => {
    const lc = new LayoutController(null, {
      schedule: (d, cb) => clock.schedule(d, cb),
      cancel: (id) => clock.cancel(id),
      layoutDelayMs: 10,
    });
    lc.requestLayout("orphan");
    expect(() => clock.advance(10)).not.toThrow();
  });
});
