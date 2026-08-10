import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DebouncedRequest,
  LayoutController,
  LAYOUT_REQUEST_DEBOUNCE_MS,
  VERIFY_REQUEST_DEBOUNCE_MS,
  LAYOUT_VERIFY_EPSILON_PX,
  LAYOUT_VERIFY_AGREEMENT_NEEDED,
  PERIODIC_VERIFY_REASON,
} from "../../../lib/extension/layout-controller.js";
import {
  AppThrashCatalog,
  GHOSTTY_MIN_QUIET_MS,
  SETTLE_LEARN_PAD,
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

describe("LayoutController verify sensor (apply-contract AC1)", () => {
  let clock;
  let wm;

  beforeEach(() => {
    clock = createFakeClock();
    wm = {
      renderTree: vi.fn(),
      reassertTilesByIds: vi.fn(() => 0),
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

  it("exports verify constants (single-ok settle; no mismatch war exports)", () => {
    expect(LAYOUT_VERIFY_EPSILON_PX).toBe(4);
    expect(LAYOUT_VERIFY_AGREEMENT_NEEDED).toBe(1);
  });

  it("single verify ok → SETTLED without agreement-confirm or thrash-extra", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
    });
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
    expect(lc.agreementCount).toBe(1);
    expect(lc.settled).toBe(true);
    expect(lc.pendingVerifyReasons).not.toContain("agreement-confirm");
    expect(lc.pendingVerifyReasons).not.toContain("thrash-extra");
    expect(wm.reassertTilesByIds).not.toHaveBeenCalled();
    expect(wm.renderTree).not.toHaveBeenCalled();

    // No auto second fire once SETTLED
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS * 2);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("post-render path alone SETTLED on first ok", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 2, mismatches: [] }),
    });
    lc.onRenderComplete("tree-apply");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    expect(lc.settled).toBe(true);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("mismatch resets agreement/settled and never reasserts or requestLayout", () => {
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
    expect(lc.settled).toBe(true);

    ok = false;
    lc.requestVerify("mismatch");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);
    expect(lc.lastVerifyResult.ok).toBe(false);
    expect(wm.reassertTilesByIds).not.toHaveBeenCalled();
    expect(wm.renderTree).not.toHaveBeenCalled();
    expect(lc.layoutPending).toBe(false);
    expect(lc.pendingVerifyReasons).not.toContain("verify-mismatch-reassert");
    expect(lc.pendingLayoutReasons).not.toContain("verify-mismatch");

    ok = true;
    lc.requestVerify("recover");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    expect(lc.settled).toBe(true);
    lc.markUnsettled("external-size");
    expect(lc.agreementCount).toBe(0);
    expect(lc.settled).toBe(false);
    expect(lc.lastUnsettledReason).toBe("external-size");
  });

  it("onExternalGeometry unsettles + diagnostic verify only (no layout)", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
    });
    lc.settled = true;
    lc.agreementCount = 1;

    lc.onExternalGeometry("size-changed", null);

    expect(lc.settled).toBe(false);
    expect(lc.agreementCount).toBe(0);
    expect(lc.lastUnsettledReason).toBe("size-changed");
    expect(lc.layoutPending).toBe(false);
    expect(lc.verifyPending).toBe(true);
    expect(lc.pendingLayoutReasons).not.toContain("size-changed");
    expect(lc.pendingVerifyReasons).toContain("size-changed");
    expect(wm.reassertTilesByIds).not.toHaveBeenCalled();
  });

  it("rect-mismatch sensor: no reassert, no give-up storm, no layout", () => {
    const lc = make({
      scan: () => ({
        ok: false,
        checked: 2,
        mismatches: [{ id: 1, reasons: ["rect-mismatch"] }],
      }),
    });

    for (let i = 0; i < 12; i++) {
      lc.cancel();
      lc.requestVerify(`m${i}`);
      clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
      expect(lc.settled).toBe(false);
      expect(lc.agreementCount).toBe(0);
    }
    expect(wm.reassertTilesByIds).not.toHaveBeenCalled();
    expect(wm.renderTree).not.toHaveBeenCalled();
    expect(lc.layoutPending).toBe(false);
  });

  it("mon-mismatch does not request full layout re-apply", () => {
    const lc = make({
      scan: () => ({
        ok: false,
        checked: 1,
        mismatches: [{ id: 9, reasons: ["mon-mismatch"] }],
      }),
    });

    lc.requestVerify("mon");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(wm.reassertTilesByIds).not.toHaveBeenCalled();
    clock.advance(LAYOUT_REQUEST_DEBOUNCE_MS);
    expect(wm.renderTree).not.toHaveBeenCalled();
    expect(lc.settled).toBe(false);
    expect(lc.lastVerifyResult.ok).toBe(false);
  });

  it("no thrash-extra schedule after SETTLED even with thrashy class catalog", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
    });
    expect(lc.catalog.needsExtraVerify("ghostty")).toBe(true);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.settled).toBe(true);
    expect(lc.pendingVerifyReasons).toEqual([]);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS * 4);
    expect(lc.verifyFireCount).toBe(1);
  });

  it("does not auto-fire a second verify after single ok", () => {
    const lc = make({
      scan: () => ({ ok: true, checked: 0, mismatches: [] }),
    });
    lc.requestVerify("once");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.agreementCount).toBe(1);
    expect(lc.settled).toBe(true);
    expect(lc.verifyFireCount).toBe(1);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
  });
});

describe("LayoutController catalog observe (no thrash-extra control loop)", () => {
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
  }

  it("holds an AppThrashCatalog by default (Ghostty quiet floor)", () => {
    const lc = make({ scan: () => ({ ok: true, checked: 0, mismatches: [] }) });
    expect(lc.catalog).toBeInstanceOf(AppThrashCatalog);
    expect(lc.catalog.needsExtraVerify("ghostty")).toBe(true);
    expect(lc.catalog.lookup("ghostty").minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
  });

  it("onExternalGeometry records postMap for size and postApplyDrift when was SETTLED", () => {
    const catalog = new AppThrashCatalog();
    const lc = make({
      catalog,
      scan: () => ({ ok: true, checked: 1, mismatches: [] }),
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
    expect(lc.layoutPending).toBe(false);
    expect(lc.verifyPending).toBe(true);
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
    const catalog = new AppThrashCatalog();
    const lc = make({ catalog });
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

  it("SL1: noteOpenPending + verify ok records settle sample", () => {
    const catalog = new AppThrashCatalog();
    const meta = {
      get_id: () => 42,
      get_wm_class: () => "org.example.Settle",
    };
    const openedAt = Date.now() - 350;
    const lc = make({
      catalog,
      scan: () => ({
        ok: true,
        checked: 1,
        mismatches: [],
        results: [{ id: 42, ok: true, reasons: [] }],
      }),
    });

    lc.noteOpenPendingForSettle(meta, openedAt);
    expect(lc._settlePending.size).toBe(1);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    const e = catalog.lookup("org.example.Settle");
    expect(e).toBeTruthy();
    expect(e.settleSampleCount).toBe(1);
    expect(e.settleMsLast).toBeGreaterThanOrEqual(350);
    expect(e.minQuietMs).toBe(Math.trunc(e.settleMsLast * SETTLE_LEARN_PAD));
    expect(lc._settlePending.size).toBe(0);
  });

  it("SL1: mismatch accumulates then first ok records once", () => {
    const catalog = new AppThrashCatalog();
    const meta = {
      get_id: () => 7,
      get_wm_class: () => "org.example.Mismatch",
    };
    let phase = 0;
    const lc = make({
      catalog,
      scan: () => {
        phase += 1;
        if (phase === 1) {
          return {
            ok: false,
            checked: 1,
            mismatches: [{ id: 7, reasons: ["rect-mismatch"] }],
            results: [{ id: 7, ok: false, reasons: ["rect-mismatch"] }],
          };
        }
        return {
          ok: true,
          checked: 1,
          mismatches: [],
          results: [{ id: 7, ok: true, reasons: [] }],
        };
      },
    });

    lc.noteOpenPendingForSettle(meta, Date.now() - 100);
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(catalog.lookup("org.example.Mismatch")).toBeFalsy();
    expect(lc._settlePending.get(meta)?.mismatches).toBe(1);
    expect(wm.renderTree).not.toHaveBeenCalled();

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    const e = catalog.lookup("org.example.Mismatch");
    expect(e.settleSampleCount).toBe(1);
    expect(e.mismatchBeforeSettle).toBe(1);
    expect(lc._settlePending.size).toBe(0);
  });

  it("SL1: clearOpenPendingForSettle drops observation", () => {
    const catalog = new AppThrashCatalog();
    const meta = { get_id: () => 1, get_wm_class: () => "org.example.Gone" };
    const lc = make({
      catalog,
      scan: () => ({
        ok: true,
        checked: 1,
        mismatches: [],
        results: [{ id: 1, ok: true, reasons: [] }],
      }),
    });
    lc.noteOpenPendingForSettle(meta, Date.now());
    lc.clearOpenPendingForSettle(meta);
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(catalog.lookup("org.example.Gone")).toBeFalsy();
  });

  it("SL1: forest ok without pending id in results does not sample", () => {
    const catalog = new AppThrashCatalog();
    const meta = {
      get_id: () => 42,
      get_wm_class: () => "org.example.FloatFirst",
    };
    let phase = 0;
    const lc = make({
      catalog,
      scan: () => {
        phase += 1;
        if (phase === 1) {
          return {
            ok: true,
            checked: 1,
            mismatches: [],
            results: [{ id: 99, ok: true, reasons: [] }],
          };
        }
        return {
          ok: true,
          checked: 2,
          mismatches: [],
          results: [
            { id: 99, ok: true, reasons: [] },
            { id: 42, ok: true, reasons: [] },
          ],
        };
      },
    });

    lc.noteOpenPendingForSettle(meta, Date.now() - 200);
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    expect(catalog.lookup("org.example.FloatFirst")).toBeFalsy();
    expect(lc._settlePending.size).toBe(1);
    expect(lc._settlePending.has(meta)).toBe(true);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    const e = catalog.lookup("org.example.FloatFirst");
    expect(e).toBeTruthy();
    expect(e.settleSampleCount).toBe(1);
    expect(lc._settlePending.size).toBe(0);
  });

  it("SL1: forest ok with empty results still samples (inject path)", () => {
    const catalog = new AppThrashCatalog();
    const meta = {
      get_id: () => 5,
      get_wm_class: () => "org.example.Inject",
    };
    const lc = make({
      catalog,
      scan: () => ({ ok: true, checked: 0, mismatches: [], results: [] }),
    });

    lc.noteOpenPendingForSettle(meta, Date.now() - 100);
    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    const e = catalog.lookup("org.example.Inject");
    expect(e).toBeTruthy();
    expect(e.settleSampleCount).toBe(1);
    expect(lc._settlePending.size).toBe(0);
  });

  it("SL2: double-note is idempotent (earliest openedAt; one sample)", () => {
    const catalog = new AppThrashCatalog();
    const meta = {
      get_id: () => 3,
      get_wm_class: () => "org.example.DoubleNote",
    };
    const early = Date.now() - 500;
    const late = Date.now() - 50;
    const lc = make({
      catalog,
      scan: () => ({
        ok: true,
        checked: 1,
        mismatches: [],
        results: [{ id: 3, ok: true, reasons: [] }],
      }),
    });

    lc.noteOpenPendingForSettle(meta, late);
    lc.noteOpenPendingForSettle(meta, early); // keep earliest
    expect(lc._settlePending.size).toBe(1);
    expect(lc._settlePending.get(meta).openedAt).toBe(early);

    lc._settlePending.get(meta).mismatches = 2;
    lc.noteOpenPendingForSettle(meta, Date.now());
    expect(lc._settlePending.get(meta).mismatches).toBe(2);
    expect(lc._settlePending.get(meta).openedAt).toBe(early);

    lc.requestVerify("post-render");
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);

    const e = catalog.lookup("org.example.DoubleNote");
    expect(e.settleSampleCount).toBe(1);
    expect(e.settleMsLast).toBeGreaterThanOrEqual(500);
    expect(e.mismatchBeforeSettle).toBe(2);
    expect(lc._settlePending.size).toBe(0);
  });
});

describe("LayoutController periodic verify (CL6)", () => {
  let clock;
  let verifyFires;

  beforeEach(() => {
    clock = createFakeClock();
    verifyFires = [];
  });

  function make(opts = {}) {
    return new LayoutController(null, {
      schedule: (d, cb) => clock.schedule(d, cb),
      cancel: (id) => clock.cancel(id),
      onLayout: () => {},
      onVerify: (reasons) => {
        verifyFires.push(reasons.slice());
      },
      ...opts,
    });
  }

  it("default interval is off (no timer)", () => {
    const lc = make();
    expect(lc.verifyIntervalMs).toBe(0);
    expect(lc.periodicPending).toBe(false);
    clock.advance(10_000);
    expect(lc.periodicFireCount).toBe(0);
    expect(verifyFires).toHaveLength(0);
  });

  it("interval > 0 arms repeating requestVerify(periodic)", () => {
    const lc = make();
    lc.setVerifyIntervalMs(500);
    expect(lc.verifyIntervalMs).toBe(500);
    expect(lc.periodicPending).toBe(true);

    clock.advance(499);
    expect(lc.periodicFireCount).toBe(0);
    expect(verifyFires).toHaveLength(0);

    clock.advance(1);
    expect(lc.periodicFireCount).toBe(1);
    // Periodic schedules requestVerify which debounces at verifyDelayMs
    expect(lc.pendingVerifyReasons).toContain(PERIODIC_VERIFY_REASON);

    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(verifyFires).toHaveLength(1);
    expect(verifyFires[0]).toContain(PERIODIC_VERIFY_REASON);

    // Second tick
    clock.advance(500);
    expect(lc.periodicFireCount).toBe(2);
    clock.advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(verifyFires).toHaveLength(2);
    expect(verifyFires[1]).toContain(PERIODIC_VERIFY_REASON);
  });

  it("constructor option verifyIntervalMs enables immediately", () => {
    const lc = make({ verifyIntervalMs: 200 });
    expect(lc.periodicPending).toBe(true);
    clock.advance(200);
    expect(lc.periodicFireCount).toBe(1);
  });

  it("set 0 cancels the timer", () => {
    const lc = make();
    lc.setVerifyIntervalMs(300);
    expect(lc.periodicPending).toBe(true);
    lc.setVerifyIntervalMs(0);
    expect(lc.verifyIntervalMs).toBe(0);
    expect(lc.periodicPending).toBe(false);
    clock.advance(1000);
    expect(lc.periodicFireCount).toBe(0);
    expect(verifyFires).toHaveLength(0);
  });

  it("interval change restarts the timer", () => {
    const lc = make();
    lc.setVerifyIntervalMs(1000);
    clock.advance(400);
    // Still pending first long interval; switch to 100ms from now
    lc.setVerifyIntervalMs(100);
    expect(lc.periodicPending).toBe(true);
    clock.advance(99);
    expect(lc.periodicFireCount).toBe(0);
    clock.advance(1);
    expect(lc.periodicFireCount).toBe(1);
  });

  it("cancel clears periodic arm (interval retained until set 0)", () => {
    const lc = make();
    lc.setVerifyIntervalMs(250);
    expect(lc.periodicPending).toBe(true);
    lc.cancel();
    expect(lc.periodicPending).toBe(false);
    expect(lc.verifyIntervalMs).toBe(250);
    clock.advance(1000);
    expect(lc.periodicFireCount).toBe(0);

    // Re-arm from stored interval (enable path calls setVerifyIntervalMs again)
    lc.setVerifyIntervalMs(lc.verifyIntervalMs);
    expect(lc.periodicPending).toBe(true);
    clock.advance(250);
    expect(lc.periodicFireCount).toBe(1);
  });

  it("destroy clears interval and refuses further set", () => {
    const lc = make();
    lc.setVerifyIntervalMs(100);
    lc.destroy();
    expect(lc.periodicPending).toBe(false);
    expect(lc.verifyIntervalMs).toBe(0);
    lc.setVerifyIntervalMs(500);
    expect(lc.verifyIntervalMs).toBe(0);
    clock.advance(1000);
    expect(lc.periodicFireCount).toBe(0);
  });

  it("exports PERIODIC_VERIFY_REASON as periodic", () => {
    expect(PERIODIC_VERIFY_REASON).toBe("periodic");
  });
});
