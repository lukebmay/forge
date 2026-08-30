import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  metricsSnapshot,
  recordAgree,
  recordApply,
  recordDrift,
  recordFallback,
  recordInvariant,
  recordPaint,
  recordResync,
  resetMetrics,
  recordWarn,
  scanForestInvariants,
} from "../../../lib/extension/metrics.js";
import { createTomApi } from "../../../lib/tom/index.js";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
    vi.spyOn(Logger, "info").mockImplementation(() => {});
    vi.spyOn(Logger, "warn").mockImplementation(() => {});
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMetrics();
  });

  it("recordFallback increments and emits greppable token", () => {
    recordFallback("size", "forest-miss");
    expect(metricsSnapshot().fallbacks).toBe(1);
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("metric fallback op=size reason=forest-miss"))).toBe(true);
  });

  it("recordInvariant warns once per kind+key", () => {
    recordInvariant("singleton-tab", "abc", "layout=TABBED kids=1 id=abc");
    recordInvariant("singleton-tab", "abc", "layout=TABBED kids=1 id=abc");
    expect(metricsSnapshot().invariants).toBe(2);
    expect(Logger.warn.mock.calls.length).toBe(1);
    expect(String(Logger.warn.mock.calls[0][0])).toContain("metric invariant singleton-tab");
  });

  it("recordApply emits metric apply fields", () => {
    recordApply({ applyId: "al-1", name: "dev", ok: false, ms: 12, phase: "size" });
    expect(metricsSnapshot().applies).toBe(1);
    expect(metricsSnapshot().applyFail).toBe(1);
    const call = Logger.info.mock.calls.find((c) => String(c[0]) === "metric apply");
    expect(call).toBeTruthy();
    expect(call[1].fields.ok).toBe(false);
    expect(call[1].fields.phase).toBe("size");
  });

  it("recordPaint only debugs slow paints", () => {
    recordPaint("window-added", 5);
    recordPaint("window-added", 25);
    expect(metricsSnapshot().paints).toBe(2);
    expect(metricsSnapshot().paintMs).toBe(30);
    expect(Logger.debug.mock.calls.length).toBe(1);
    expect(String(Logger.debug.mock.calls[0][0])).toContain("metric paint");
  });

  it("recordAgree / recordDrift / recordResync emit hunt tokens", () => {
    recordAgree({ ok: false, driftCount: 2, reason: "apply-done" });
    recordDrift({ kind: "singleton-tab", id: "tab1", reason: "apply-done" });
    recordResync({ ok: true, rounds: 1, steps: ["settleForest"], reason: "apply-done" });
    expect(metricsSnapshot().agrees).toBe(1);
    expect(metricsSnapshot().agreeFail).toBe(1);
    expect(metricsSnapshot().drifts).toBe(1);
    expect(metricsSnapshot().resyncs).toBe(1);
    expect(metricsSnapshot().resyncFail).toBe(0);
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric agree");
    expect(texts).toContain("metric drift");
    expect(texts).toContain("metric resync");
    const agreeCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric agree");
    expect(agreeCall[1].fields.ok).toBe(false);
    expect(agreeCall[1].fields.driftCount).toBe(2);
    const resyncCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric resync");
    expect(resyncCall[1].fields.steps).toBe("settleForest");
    recordDrift({
      kind: "float-mismatch",
      id: "w1",
      reason: "entered-monitor",
      expected: false,
      actual: true,
      bagFloating: true,
      forestParent: "Mon1",
      liveMode: "FLOAT",
    });
    const floatDrift = Logger.info.mock.calls.find(
      (c) => String(c[0]) === "metric drift" && c[1]?.fields?.kind === "float-mismatch"
    );
    expect(floatDrift[1].fields).toMatchObject({
      expected: false,
      actual: true,
      bagFloating: true,
      forestParent: "Mon1",
      liveMode: "FLOAT",
    });
  });

  it("scanForestInvariants flags singleton TABBED", () => {
    const api = createTomApi();
    const f = api.createForest([{ id: "mo0ws0", x: 0, y: 0, width: 100, height: 100 }]);
    const mon = f.monitors[0];
    const con = api.makeCon("TABBED");
    api._registerTree(f, con);
    const win = api.makeWindow("W");
    api._registerTree(f, win);
    api.appendChild(f, mon, con);
    api.appendChild(f, con, win);
    expect(scanForestInvariants(f)).toBe(1);
    expect(metricsSnapshot().invariants).toBe(1);
  });

  it("scanForestInvariants flags CON child under TABBED bag", () => {
    const api = createTomApi();
    const f = api.createForest([{ id: "mo0ws0", x: 0, y: 0, width: 100, height: 100 }]);
    const mon = f.monitors[0];
    const bag = api.makeCon("TABBED");
    const inner = api.makeCon("HSPLIT");
    const a = api.makeWindow("A");
    const b = api.makeWindow("B");
    for (const n of [bag, inner, a, b]) api._registerTree(f, n);
    api.appendChild(f, mon, bag);
    api.appendChild(f, bag, inner);
    api.appendChild(f, inner, a);
    api.appendChild(f, bag, b);
    expect(scanForestInvariants(f)).toBeGreaterThanOrEqual(1);
    const texts = Logger.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("metric invariant bag-con-child"))).toBe(true);
  });

  it("recordWarn emits greppable metric warn token", () => {
    recordWarn("settle-jitter", { applyId: "al-1", phase: "hard-ready", attempt: 2 });
    const call = Logger.warn.mock.calls.find((c) =>
      String(c[0]).startsWith("metric warn settle-jitter")
    );
    expect(call).toBeTruthy();
    expect(call[1].fields.applyId).toBe("al-1");
  });
});
