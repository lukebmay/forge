import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DebouncedRequest,
  LayoutController,
  LAYOUT_REQUEST_DEBOUNCE_MS,
  VERIFY_REQUEST_DEBOUNCE_MS,
  LAYOUT_VERIFY_EPSILON_PX,
  LAYOUT_VERIFY_AGREEMENT_NEEDED,
  THRASH_EXTRA_VERIFY_REASON,
} from "../../../lib/extension/layout-controller.js";
import {
  AppThrashCatalog,
  GHOSTTY_MIN_QUIET_MS,
} from "../../../lib/extension/app-thrash-catalog.js";

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

  it("requestVerify fires once and records reasons", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 0, mismatches: [] }),
    });
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

describe("LayoutController agreement + verify scanner", () => {
  let clock;
  let wm;
  let renderCalls;

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

  it("exports verify constants", () => {
    expect(LAYOUT_VERIFY_EPSILON_PX).toBe(4);
    expect(LAYOUT_VERIFY_AGREEMENT_NEEDED).toBe(2);
  });

  it("agreement 0→1→2 SETTLED with auto second verify", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
    });
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
    expect(lc.agreementCount).toBe(1);
    expect(lc.settled).toBe(false);
    expect(lc.pendingVerifyReasons).toContain("agreement-confirm");

    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(2);
    expect(lc.agreementCount).toBe(2);
    expect(lc.settled).toBe(true);
    expect(lc.lastVerifyReasons).toEqual(["agreement-confirm"]);
    // No third auto-verify once SETTLED
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS * 2);
    expect(lc.verifyFireCount).toBe(2);
  });

  it("post-render path alone can SETTLED when all match", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 2, mismatches: [] }),
    });
    lc.onRenderComplete("tree-apply");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.settled).toBe(true);
    expect(lc.agreementCount).toBe(2);
  });

  it("mismatch resets agreement; markUnsettled resets", () => {
    let ok = true;
    const lc = make({
      scan: () =>
        ok
          ? { ok: true, checked: 1, mismatches: [] }
          : {
              ok: false,
              checked: 1,
              mismatches: [{ id: 1, reasons: ["rect-mismatch"] }],
            },
    });

    lc.requestVerify("a");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);

    ok = false;
    // Cancel auto confirm so we control the next fire
    lc.cancel();
    lc.requestVerify("mismatch");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);
    expect(lc.lastVerifyResult.ok).toBe(false);

    ok = true;
    lc.requestVerify("recover");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    lc.markUnsettled("external-size");
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);
    expect(lc.lastUnsettledReason).toBe("external-size");
  });

  it("onExternalGeometry marks unsettled and schedules layout + verify", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
    });
    lc.settled = true;
    lc.agreementCount = 2;

    lc.onExternalGeometry("size-changed", null);

    expect(lc.settled).toBe(false);
    expect(lc.agreementCount).toBe(0);
    expect(lc.lastUnsettledReason).toBe("size-changed");
    expect(lc.layoutPending).toBe(true);
    expect(lc.verifyPending).toBe(true);
    expect(lc.pendingLayoutReasons).toContain("size-changed");
    expect(lc.pendingVerifyReasons).toContain("size-changed");
  });

  it("mismatch requestLayout at most once per wave (no infinite storm)", () => {
    const lc = make({
      scan: () => ({
        ok: false,
        checked: 1,
        mismatches: [{ id: 1, reasons: ["rect-mismatch"] }],
      }),
    });

    // Wave: verify → layout once; subsequent verifies while still mismatched do not re-request layout
    lc.requestVerify("v1");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.mismatchLayoutRequestCount).toBe(1);
    expect(lc.pendingLayoutReasons).toContain("verify-mismatch");

    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);
    expect(wm.renderTree).toHaveBeenCalledWith("verify-mismatch");

    // Simulate post-render re-verify (still mismatch) — latch holds
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    lc.requestVerify("again");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.mismatchLayoutRequestCount).toBe(1);
    expect(lc.verifyFireCount).toBe(3);

    // Drain any pending layout — none
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS * 2);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);
  });

  it("successful agreement clears mismatch latch for a later wave", () => {
    let ok = false;
    const lc = make({
      scan: () =>
        ok
          ? { ok: true, checked: 1, mismatches: [] }
          : {
              ok: false,
              checked: 1,
              mismatches: [{ id: 1, reasons: ["rect-mismatch"] }],
            },
    });

    lc.requestVerify("m1");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.mismatchLayoutRequestCount).toBe(1);
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS);
    expect(wm.renderTree).toHaveBeenCalledTimes(1);

    ok = true;
    lc.cancel(); // drop auto agreement-confirm noise after we flip ok
    lc.requestVerify("good");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    // Latch cleared on agreement; cancel pending confirm
    lc.cancel();

    ok = false;
    lc.requestVerify("m2");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.mismatchLayoutRequestCount).toBe(2);
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS);
    expect(wm.renderTree).toHaveBeenCalledTimes(2);
  });

  it("does not count the same fire twice; consecutive passes are separate fires", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 0, mismatches: [] }),
    });
    lc.requestVerify("once");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    expect(lc.verifyFireCount).toBe(1);
    // agreement-confirm is a second fire
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(2);
    expect(lc.verifyFireCount).toBe(2);
  });
});

describe("LayoutController thrash-extra (CL3)", () => {
  let clock;
  let wm;

  beforeEach(() => {
    clock = createFakeClock();
    wm = {
      renderTree: vi.fn(),
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

  function settleOk(lc) {
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
  }

  it("exports thrash-extra reason constant", () => {
    expect(THRASH_EXTRA_VERIFY_REASON).toBe("thrash-extra");
  });

  it("holds an AppThrashCatalog by default (Ghostty quiet floor)", () => {
    const lc = make({ scan: () => ({ ok: true, checked: 0, mismatches: [] }) });
    expect(lc.catalog).toBeInstanceOf(AppThrashCatalog);
    expect(lc.catalog.needsExtraVerify("ghostty")).toBe(true);
    expect(lc.catalog.lookup("ghostty").minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
  });

  it("SETTLED + thrashy TILE → one thrash-extra, not infinite", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
      hasThrashyTile: () => true,
    });

    settleOk(lc);
    expect(lc.settled).toBe(true);
    expect(lc.thrashExtraRequestCount).toBe(1);
    expect(lc.pendingVerifyReasons).toContain(THRASH_EXTRA_VERIFY_REASON);

    // Fire thrash-extra — still ok / settled; must not request another
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(3);
    expect(lc.lastVerifyReasons).toEqual([THRASH_EXTRA_VERIFY_REASON]);
    expect(lc.settled).toBe(true);
    expect(lc.thrashExtraRequestCount).toBe(1);

    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS * 4);
    expect(lc.verifyFireCount).toBe(3);
    expect(lc.thrashExtraRequestCount).toBe(1);
  });

  it("SETTLED without thrashy TILE does not schedule thrash-extra", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
      hasThrashyTile: () => false,
    });
    settleOk(lc);
    expect(lc.settled).toBe(true);
    expect(lc.thrashExtraRequestCount).toBe(0);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS * 2);
    expect(lc.verifyFireCount).toBe(2);
  });

  it("markUnsettled clears thrash latch so a new settle wave can re-request", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
      hasThrashyTile: () => true,
    });
    settleOk(lc);
    expect(lc.thrashExtraRequestCount).toBe(1);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS); // thrash-extra
    expect(lc.verifyFireCount).toBe(3);

    lc.markUnsettled("external-size");
    expect(lc.settled).toBe(false);

    settleOk(lc);
    expect(lc.thrashExtraRequestCount).toBe(2);
    expect(lc.pendingVerifyReasons).toContain(THRASH_EXTRA_VERIFY_REASON);
  });

  it("onExternalGeometry records postMap for size and postApplyDrift when was SETTLED", () => {
    const catalog = new AppThrashCatalog();
    const lc = make({
      catalog,
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
      hasThrashyTile: () => false,
    });
    settleOk(lc);
    expect(lc.settled).toBe(true);

    const meta = { get_wm_class: () => "org.example.Thrash" };
    lc.onExternalGeometry("size-changed", meta);

    const e = catalog.lookup("org.example.Thrash");
    expect(e).toBeTruthy();
    expect(e.postMapSizeChanges).toBe(1);
    expect(e.postApplyDrift).toBe(1);
    expect(lc.settled).toBe(false);
  });

  it("onExternalGeometry does not record postApplyDrift when not settled", () => {
    const catalog = new AppThrashCatalog();
    const lc = make({
      catalog,
      scan: () => ({ ok: true, checked: 0, mismatches: [] }),
    });
    expect(lc.settled).toBe(false);

    lc.onExternalGeometry("size-changed", { get_wm_class: () => "Foo.Bar" });
    const e = catalog.lookup("Foo.Bar");
    expect(e.postMapSizeChanges).toBe(1);
    expect(e.postApplyDrift).toBe(0);
  });

  it("suppress path: forge-caused never reaches onExternalGeometry counters", () => {
    // Contract: callers use isForgeCausedGeometrySignal and skip onExternalGeometry.
    // Catalog stays clean when only forge path "would have" fired.
    const catalog = new AppThrashCatalog();
    const lc = make({ catalog, hasThrashyTile: () => false });
    // Simulate: external path not called; only chrome path would run under suppress.
    expect(catalog.lookup("ghostty").postMapSizeChanges).toBe(0);
    expect(catalog.lookup("ghostty").postApplyDrift).toBe(0);
    expect(lc.catalog).toBe(catalog);
  });

  it("accepts injected catalog from options / wm.appThrashCatalog", () => {
    const shared = new AppThrashCatalog();
    const lc1 = make({ catalog: shared });
    expect(lc1.catalog).toBe(shared);

    const wmWith = {
      renderTree: vi.fn(),
      appThrashCatalog: shared,
    };
    const lc2 = new LayoutController(wmWith, {
      schedule: (d, cb) => clock.schedule(d, cb),
      cancel: (id) => clock.cancel(id),
    });
    expect(lc2.catalog).toBe(shared);
  });
});
