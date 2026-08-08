import { describe, it, expect, vi } from "vitest";
import {
  LAYOUT_APPLY_CHROME_HARD_MS,
  LAYOUT_APPLY_CHROME_SCRIM_ALPHA,
  LAYOUT_APPLY_CHROME_TITLE,
  LAYOUT_APPLY_CHROME_TITLE_HEIGHT_RATIO,
  LAYOUT_APPLY_CHROME_DETAIL_TITLE_RATIO,
  applyChromeMetrics,
  formatApplyChromeStatus,
  createApplyChromeState,
  shouldShowChrome,
  transitionShow,
  transitionClear,
  withHardClearTimer,
  ApplyChromeController,
} from "../../../lib/extension/layout-apply-chrome.js";

describe("LAYOUT_APPLY_CHROME_HARD_MS", () => {
  it("is a firm cap covering multi-open + residual (≤60s, >8s)", () => {
    expect(LAYOUT_APPLY_CHROME_HARD_MS).toBeGreaterThan(8000);
    expect(LAYOUT_APPLY_CHROME_HARD_MS).toBeLessThanOrEqual(60000);
  });
});

describe("chrome presentation constants", () => {
  it("scrim alpha is ~80% (darker overlay)", () => {
    expect(LAYOUT_APPLY_CHROME_SCRIM_ALPHA).toBeGreaterThanOrEqual(0.75);
    expect(LAYOUT_APPLY_CHROME_SCRIM_ALPHA).toBeLessThanOrEqual(0.85);
  });

  it("title height ratio is in the 5–10% band; detail is half title", () => {
    expect(LAYOUT_APPLY_CHROME_TITLE_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.05);
    expect(LAYOUT_APPLY_CHROME_TITLE_HEIGHT_RATIO).toBeLessThanOrEqual(0.1);
    expect(LAYOUT_APPLY_CHROME_DETAIL_TITLE_RATIO).toBeCloseTo(0.5);
  });

  it("formats centered two-line status with layout name", () => {
    expect(LAYOUT_APPLY_CHROME_TITLE).toBe("Forge");
    expect(formatApplyChromeStatus("dev")).toEqual({
      title: "Forge",
      detail: 'Loading layout "dev"...',
    });
    expect(formatApplyChromeStatus(null)).toEqual({
      title: "Forge",
      detail: "Loading layout...",
    });
    expect(formatApplyChromeStatus("  ")).toEqual({
      title: "Forge",
      detail: "Loading layout...",
    });
  });
});

describe("applyChromeMetrics", () => {
  it("at scale 1, CSS title is ~7.5% of stage height", () => {
    const m1080 = applyChromeMetrics(1080, 1);
    expect(m1080.titlePx).toBe(Math.round(1080 * 0.075)); // 81
    expect(m1080.detailPx).toBe(Math.round(m1080.titlePx * 0.5));
    expect(m1080.spinnerStagePx).toBe(m1080.spinnerPx);
    expect(m1080.scale).toBe(1);

    const m2160 = applyChromeMetrics(2160, 1);
    expect(m2160.titlePx).toBe(Math.round(2160 * 0.075)); // 162
    expect(m2160.titlePx).toBeGreaterThan(m1080.titlePx);
  });

  it("divides by scale_factor so St does not double-scale HiDPI text", () => {
    // Stage height 2880 (e.g. 1440 logical × scale 2); want ~7.5% visual = 216 stage px
    // → CSS 108px so St renders 108×2 = 216.
    const m = applyChromeMetrics(2880, 2);
    expect(m.titlePx).toBe(Math.round((2880 * 0.075) / 2)); // 108
    expect(m.detailPx).toBe(Math.round(m.titlePx * 0.5)); // 54
    expect(m.spinnerStagePx).toBe(Math.round(m.spinnerPx * 2));
    // Visual title ≈ titlePx * scale ≈ 7.5% of stage height
    expect(m.titlePx * m.scale).toBeCloseTo(2880 * 0.075, 0);
  });

  it("clamps pathological heights and falls back when invalid", () => {
    const tiny = applyChromeMetrics(100, 1);
    expect(tiny.titlePx).toBeGreaterThanOrEqual(18);
    const huge = applyChromeMetrics(10000, 1);
    expect(huge.titlePx).toBeLessThanOrEqual(200);
    const bad = applyChromeMetrics(NaN, 1);
    expect(bad.titlePx).toBe(Math.round(1080 * 0.075));
    const badScale = applyChromeMetrics(1080, 0);
    expect(badScale.scale).toBe(1);
  });
});

describe("shouldShowChrome", () => {
  it("true only when enabled and depth >= 1", () => {
    expect(shouldShowChrome({ enabled: true, depth: 1 })).toBe(true);
    expect(shouldShowChrome({ enabled: true, depth: 2 })).toBe(true);
    expect(shouldShowChrome({ enabled: true, depth: 0 })).toBe(false);
    expect(shouldShowChrome({ enabled: false, depth: 1 })).toBe(false);
    expect(shouldShowChrome({ enabled: true, depth: -1 })).toBe(false);
    expect(shouldShowChrome({})).toBe(false);
    expect(shouldShowChrome({ enabled: true })).toBe(false);
  });
});

describe("transitionShow / transitionClear", () => {
  it("show is idempotent; arms hard clear only once", () => {
    const s0 = createApplyChromeState();
    const t1 = transitionShow(s0);
    expect(t1.showActor).toBe(true);
    expect(t1.armHardClear).toBe(true);
    expect(t1.next.visible).toBe(true);

    const armed = withHardClearTimer(t1.next, 42);
    const t2 = transitionShow(armed);
    expect(t2.showActor).toBe(false);
    expect(t2.armHardClear).toBe(false);
    expect(t2.next.visible).toBe(true);
    expect(t2.next.hardClearTimerId).toBe(42);
  });

  it("clear is idempotent and cancels timer", () => {
    const armed = withHardClearTimer({ visible: true, hardClearTimerId: null }, 99);
    const t1 = transitionClear(armed);
    expect(t1.hideActor).toBe(true);
    expect(t1.cancelHardClear).toBe(true);
    expect(t1.cancelledTimerId).toBe(99);
    expect(t1.next).toEqual(createApplyChromeState());

    const t2 = transitionClear(t1.next);
    expect(t2.hideActor).toBe(false);
    expect(t2.cancelHardClear).toBe(false);
    expect(t2.cancelledTimerId).toBeNull();
  });

  it("clear with no prior show is a no-op", () => {
    const t = transitionClear(createApplyChromeState());
    expect(t.hideActor).toBe(false);
    expect(t.cancelHardClear).toBe(false);
    expect(t.next.visible).toBe(false);
  });
});

describe("ApplyChromeController", () => {
  function makeHarness() {
    const cancelled = [];
    let nextId = 1;
    /** @type {Map<number, { ms: number, cb: () => void }>} */
    const timers = new Map();
    const onShow = vi.fn();
    const onHide = vi.fn();
    const ctrl = new ApplyChromeController({
      hardMs: 100,
      schedule: (ms, cb) => {
        const id = nextId++;
        timers.set(id, { ms, cb });
        return id;
      },
      cancel: (id) => {
        cancelled.push(id);
        timers.delete(id);
      },
      onShow,
      onHide,
    });
    return { ctrl, onShow, onHide, timers, cancelled };
  }

  it("sync show on enabled depth 1; clear on depth 0", () => {
    const { ctrl, onShow, onHide, timers, cancelled } = makeHarness();
    ctrl.sync({ enabled: true, depth: 1 });
    expect(ctrl.visible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(1);

    ctrl.sync({ enabled: true, depth: 0 });
    expect(ctrl.visible).toBe(false);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveLength(1);
    expect(timers.size).toBe(0);
  });

  it("does not show when setting off", () => {
    const { ctrl, onShow } = makeHarness();
    ctrl.sync({ enabled: false, depth: 1 });
    expect(ctrl.visible).toBe(false);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("nested show is idempotent (no second arm or show)", () => {
    const { ctrl, onShow, timers } = makeHarness();
    ctrl.sync({ enabled: true, depth: 1 });
    const firstTimer = [...timers.keys()][0];
    ctrl.sync({ enabled: true, depth: 2 });
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(1);
    expect([...timers.keys()][0]).toBe(firstTimer);
  });

  it("hard timeout always clears even without batch end", () => {
    const { ctrl, onHide, timers } = makeHarness();
    ctrl.show();
    expect(ctrl.visible).toBe(true);
    const entry = [...timers.values()][0];
    expect(entry.ms).toBe(100);
    entry.cb();
    expect(ctrl.visible).toBe(false);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(ctrl.hardClearArmed).toBe(false);
  });

  it("destroy / clear twice is safe", () => {
    const { ctrl, onHide, cancelled } = makeHarness();
    ctrl.show();
    ctrl.destroy();
    ctrl.clear("again");
    ctrl.destroy();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveLength(1);
    expect(ctrl.visible).toBe(false);
  });

  it("show failure clears and does not leave visible", () => {
    const ctrl = new ApplyChromeController({
      hardMs: 50,
      schedule: () => 1,
      cancel: () => {},
      onShow: () => {
        throw new Error("boom");
      },
      onHide: vi.fn(),
    });
    ctrl.show();
    expect(ctrl.visible).toBe(false);
  });
});
