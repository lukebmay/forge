import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  observeReality,
  resyncWmAndPaint,
  resyncWmToReality,
} from "../../../lib/extension/observe-reality.js";
import { resetMetrics } from "../../../lib/extension/metrics.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";
import { children, floatsOf, serializeForest, windowIsFloating } from "../../../lib/tom/index.js";

describe("observeReality / resyncWmToReality", () => {
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

  it("observeReality reports exists + floating from bag", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const metaA = { id: "A", get_id: () => "A" };
    const metaB = { id: "B", get_id: () => "B" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          if (id === byLabel.A.id) return { meta: metaA, floating: false };
          if (id === byLabel.B.id) return { meta: metaB, floating: true };
          return undefined;
        },
      },
      liveById: new Map(),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id]).toMatchObject({ exists: true, floating: false });
    expect(facts.windows[byLabel.B.id].exists).toBe(true);
    expect(facts.windows[byLabel.B.id].floating).toBeUndefined();
  });

  it("resyncWmToReality collapses singleton TAB and logs hunt tokens", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A)");
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    api.wrapNodes(f, f.monitors[0], [byLabel.A], tab);
    const metaA = { id: "A", get_id: () => "A" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map(),
    };
    const r = resyncWmToReality(wm, "apply-done");
    expect(r?.ok).toBe(true);
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric agree");
    expect(texts).toContain("metric drift");
    expect(texts).toContain("metric resync");
  });

  it("resyncWmToReality is a no-op when Forest is unseeded", () => {
    const { f } = buildGiven("Mon1(A)");
    expect(resyncWmToReality({ forest: f, _liveForestSeeded: false }, "x")).toBeNull();
    expect(resyncWmAndPaint({ forest: f, _liveForestSeeded: false }, "window-map")).toBeNull();
  });

  it("resyncWmAndPaint keeps bag.floating over live FLOAT mode", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A", get_monitor: () => 0 };
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: null };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id]).toMatchObject({ exists: true, floating: false });
    const r = resyncWmAndPaint(wm, "window-map");
    expect(r?.ok).toBe(true);
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric resync");
    const resyncCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric resync");
    expect(resyncCall[1].fields.reason).toBe("window-map");
  });

  function tilesParent(kind) {
    return {
      nodeType: kind,
      kind,
      isCon: () => kind === "CON",
      isMonitor: () => kind === "MONITOR",
    };
  }

  it("entered-monitor FLOAT mode with bag.floating false stays on TILES", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A", get_monitor: () => 0 };
    const parent = tilesParent("CON");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: parent };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id]).toMatchObject({ exists: true, floating: false });
    const r = resyncWmAndPaint(wm, "entered-monitor");
    expect(r?.ok).toBe(true);
    expect(r.steps.filter((s) => String(s).startsWith("moveWindowToFloats"))).toEqual([]);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(floatsOf(f).childIds).not.toContain(byLabel.A.id);
    expect(liveA.parentNode).toBe(parent);
  });

  it("bag-miss FLOAT mode under MONITOR is unknown floating, not FLOATS", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const parent = tilesParent("MONITOR");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: parent };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get() {
          return undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id].exists).toBe(true);
    expect(facts.windows[byLabel.A.id].floating).toBeUndefined();
    const r = resyncWmAndPaint(wm, "entered-monitor");
    expect(r?.ok).toBe(true);
    expect(r.steps.filter((s) => String(s).startsWith("moveWindowToFloats"))).toEqual([]);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(floatsOf(f).childIds).not.toContain(byLabel.A.id);
    expect(liveA.parentNode).toBe(parent);
  });

  it("bag-miss FLOAT mode under CON does not treat isFloat as host-unmanaged", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A" };
    const parent = tilesParent("CON");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: parent };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA } : undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id].floating).toBeUndefined();
    const r = resyncWmToReality(wm, "window-map");
    expect(r?.ok).toBe(true);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(liveA.parentNode).toBe(parent);
  });

  it("entered-monitor bag-miss FLOAT mode with TILES forest parent does not moveWindowToFloats", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: null, float: true };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get() {
          return undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id].exists).toBe(true);
    expect(facts.windows[byLabel.A.id].floating).toBeUndefined();
    const r = resyncWmAndPaint(wm, "entered-monitor");
    expect(r?.ok).toBe(true);
    expect(r.steps.filter((s) => String(s).startsWith("moveWindowToFloats"))).toEqual([]);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(floatsOf(f).childIds).not.toContain(byLabel.A.id);
    // Stuck live.mode FLOAT under TILES is repaired (GetTree must not lie FLOAT).
    expect(liveA.mode).toBe("TILE");
    expect(liveA.float).toBe(false);
    const warnTexts = Logger.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnTexts.some((t) => t.includes("metric warn float-promote-denied"))).toBe(true);
  });

  it("denies injected floating:true for TILES Forest without bag.floating", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: null };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get() {
          return undefined;
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const r = resyncWmToReality(wm, "entered-monitor", {
      facts: {
        windows: {
          [byLabel.A.id]: { exists: true, floating: true },
        },
      },
    });
    expect(r?.ok).toBe(true);
    expect(r.steps.filter((s) => String(s).startsWith("moveWindowToFloats"))).toEqual([]);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    const warnTexts = Logger.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnTexts.some((t) => t.includes("metric warn float-promote-denied"))).toBe(true);
    const driftCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric drift");
    expect(driftCall?.[1]?.fields).toMatchObject({
      kind: "float-mismatch",
      expected: false,
      actual: true,
    });
    expect(driftCall[1].fields.bagFloating).toBeDefined();
    expect(driftCall[1].fields.forestParent).toBeDefined();
    expect(driftCall[1].fields.liveMode).toBeDefined();
  });

  it("Forest TILES plus bag.floating true repairs bag and does not moveWindowToFloats", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A" };
    const parent = tilesParent("MONITOR");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: parent };
    const bags = {
      [byLabel.A.id]: { meta: metaA, floating: true },
    };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return bags[id];
        },
        set(id, partial) {
          bags[id] = { ...(bags[id] || {}), ...partial };
          return bags[id];
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const facts = observeReality(wm);
    expect(facts.windows[byLabel.A.id].floating).not.toBe(true);
    const r = resyncWmToReality(wm, "entered-monitor");
    expect(r?.ok).toBe(true);
    expect(r.steps.filter((s) => String(s).startsWith("moveWindowToFloats"))).toEqual([]);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(floatsOf(f).childIds).not.toContain(byLabel.A.id);
    expect(bags[byLabel.A.id].floating).toBe(false);
    expect(liveA.mode).toBe("TILE");
    const warnTexts = Logger.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnTexts.some((t) => t.includes("metric warn float-promote-denied"))).toBe(true);
  });

  it("repairs live.mode FLOAT stuck under TILES when bag already false", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const liveA = { mode: "FLOAT", isFloat: () => true, parentNode: null, float: true };
    const bags = {
      [byLabel.A.id]: { floating: false },
    };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return bags[id];
        },
        set(id, partial) {
          bags[id] = { ...(bags[id] || {}), ...partial };
          return bags[id];
        },
      },
      liveById: new Map([[byLabel.A.id, liveA]]),
    };
    const r = resyncWmToReality(wm, "entered-monitor");
    expect(r?.ok).toBe(true);
    expect(liveA.mode).toBe("TILE");
    expect(liveA.float).toBe(false);
    const warnTexts = Logger.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnTexts.some((t) => t.includes("metric warn float-promote-denied"))).toBe(true);
  });

  it("omits mins unless includeMins", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map(),
    };
    const getMins = () => ({ width: 300, height: 200 });
    expect(observeReality(wm, { getMins }).windows[byLabel.A.id].mins).toBeUndefined();
    const withMins = observeReality(wm, { includeMins: true, getMins });
    expect(withMins.windows[byLabel.A.id].mins).toEqual({ width: 300, height: 200 });
  });

  it("includeMins share-adjusts starved slots before FLOAT", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.1;
    byLabel.A.userSized = true;
    byLabel.B.percent = 0.9;
    byLabel.B.userSized = true;
    const metaA = { id: "A", get_id: () => "A" };
    const metaB = { id: "B", get_id: () => "B" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          if (id === byLabel.A.id) return { meta: metaA, floating: false };
          if (id === byLabel.B.id) return { meta: metaB, floating: false };
          return undefined;
        },
      },
      liveById: new Map(),
    };
    const r = resyncWmToReality(wm, "mark2-gate", {
      includeMins: true,
      getMins: (id) =>
        id === byLabel.A.id ? { width: 300, height: 0 } : { width: 100, height: 0 },
    });
    expect(r?.ok).toBe(true);
    expect(r.steps.some((s) => s.startsWith("tryAdjustShareForMins:"))).toBe(true);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
  });

  it("skipSingletonSettle leaves a unary TAB for Mark 2 Join", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A)");
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    api.wrapNodes(f, f.monitors[0], [byLabel.A], tab);
    const metaA = { id: "A", get_id: () => "A" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map(),
    };
    const r = resyncWmToReality(wm, "mark2-gate", { skipSingletonSettle: true });
    expect(r?.ok).toBe(true);
    expect(f.nodes[tab.id]?.layout).toBe("TABBED");
    expect(tab.childIds).toEqual([byLabel.A.id]);
  });

  it("refuses remaining DRIFT after max rounds (orphan-host)", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const metaA = { id: "A", get_id: () => "A" };
    const wm = {
      forest: f,
      _liveForestSeeded: true,
      hostBag: {
        get(id) {
          return id === byLabel.A.id ? { meta: metaA, floating: false } : undefined;
        },
      },
      liveById: new Map(),
    };
    const r = resyncWmToReality(wm, "mark2-gate", {
      includeMins: true,
      facts: {
        windows: {
          [byLabel.A.id]: { exists: true },
          ghost: { exists: true },
        },
      },
    });
    expect(r?.ok).toBe(false);
    expect(r.drifts.some((d) => d.kind === "orphan-host" && d.id === "ghost")).toBe(true);
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric drift");
    expect(f.nodes.ghost).toBeUndefined();
  });
});
