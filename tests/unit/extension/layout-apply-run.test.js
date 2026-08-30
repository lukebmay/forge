import { describe, it, expect, vi } from "vitest";
import {
  ASSERT_FAILED_CODE,
  assert,
  resetAssertForTests,
  setAssertActiveForTests,
} from "../../../lib/shared/assert.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLY_LAYOUT_PHASES,
  LAYOUT_APPLY_RUN_HARD_MS,
  LayoutApplyRunBag,
  busyResult,
  donePayload,
  focusAfterAllHardAllowed,
  newApplyId,
  parseApplyLayoutRequest,
  progressPayload,
  snapshotRun,
  startResult,
} from "../../../lib/extension/layout-apply-run.js";
import { ApplyChromeController } from "../../../lib/extension/layout-apply-chrome.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = join(__dirname, "../cli/fixtures/layout/expected");

function loadExpected(id) {
  return JSON.parse(readFileSync(join(EXPECTED, `${id}.json`), "utf8"));
}

describe("parseApplyLayoutRequest", () => {
  it("requires profile object", () => {
    expect(parseApplyLayoutRequest("{}").ok).toBe(false);
    expect(parseApplyLayoutRequest({ profile: [] }).ok).toBe(false);
    expect(parseApplyLayoutRequest("not-json").ok).toBe(false);
  });

  it("defaults product clean=true and accepts flags", () => {
    const r = parseApplyLayoutRequest({
      profile: { version: 2, roles: [] },
      name: "dev",
      hostJobId: "j1",
      workspace: 1,
      flags: { keepOthers: true, safe: true },
    });
    expect(r.ok).toBe(true);
    expect(r.request.name).toBe("dev");
    expect(r.request.hostJobId).toBe("j1");
    expect(r.request.workspace).toBe(1);
    expect(r.request.flags.clean).toBe(true);
    expect(r.request.flags.keepOthers).toBe(true);
    expect(r.request.flags.safe).toBe(true);
    expect(r.request.flags.waitTreeStable).toBe(false);
  });

  it("parses JSON string", () => {
    const r = parseApplyLayoutRequest(
      JSON.stringify({ profile: { roles: [] }, flags: { clean: false } })
    );
    expect(r.ok).toBe(true);
    expect(r.request.flags.clean).toBe(false);
  });

  it("refuses float-class roles in tiles before apply start", () => {
    const r = parseApplyLayoutRequest({
      profile: { tiles: ["ghostty", "Guake"] },
    });
    expect(r.ok).toBe(false);
    expect(String(r.error || "")).toMatch(/float\/ignore-class/i);
  });

  it("normalizes tiles sugar so mon tab slots have layout for hard machines", () => {
    const r = parseApplyLayoutRequest({
      profile: {
        tiles: [
          [{ tab: ["chrome", "Grok"], active: "Grok" }, "ghostty"],
          [
            "ghostty",
            {
              tab: ["YouTube", "Gmail", "Voice"],
              active: "YouTube",
            },
          ],
        ],
      },
    });
    expect(r.ok).toBe(true);
    const mon1 = r.request.profile?.layout?.mon1;
    expect(mon1).toBeTruthy();
    const tabChild = (mon1.children || []).find(
      (c) => c && String(c.layout || "").toLowerCase() === "tabbed"
    );
    expect(tabChild).toBeTruthy();
    expect(tabChild.id).toBeTruthy();
  });
});

describe("payload shapes", () => {
  it("busy / start / progress / done", () => {
    expect(busyResult("al-1")).toMatchObject({
      ok: false,
      code: "busy",
      applyId: "al-1",
    });
    expect(startResult("al-2", "skeleton")).toEqual({
      ok: true,
      applyId: "al-2",
      started: true,
      phase: "skeleton",
    });
    expect(progressPayload({ applyId: "a", phase: "open", event: "enter" })).toMatchObject({
      applyId: "a",
      phase: "open",
      event: "enter",
    });
    expect(donePayload({ applyId: "a", ok: false, phase: "bind", code: "cancel" })).toMatchObject({
      ok: false,
      code: "cancel",
      phase: "bind",
    });
  });

  it("newApplyId is unique-ish", () => {
    const a = newApplyId();
    const b = newApplyId();
    expect(a).not.toBe(b);
    expect(a.startsWith("al-")).toBe(true);
  });

  it("APPLY_LAYOUT_PHASES is D008 spine", () => {
    expect(APPLY_LAYOUT_PHASES[0]).toBe("skeleton");
    expect(APPLY_LAYOUT_PHASES).toContain("hard-ready");
    expect(APPLY_LAYOUT_PHASES[APPLY_LAYOUT_PHASES.length - 1]).toBe("verify");
    const hard = APPLY_LAYOUT_PHASES.indexOf("hard-ready");
    const focus = APPLY_LAYOUT_PHASES.indexOf("focus");
    const soft = APPLY_LAYOUT_PHASES.indexOf("soft");
    expect(hard).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(hard);
    expect(soft).toBeGreaterThan(focus);
  });

  it("focusAfterAllHardAllowed requires hardReadyRan when hard-ready is on the list", () => {
    expect(focusAfterAllHardAllowed({ hardReadyRan: false })).toBe(false);
    expect(focusAfterAllHardAllowed({ hardReadyRan: true })).toBe(true);
    expect(focusAfterAllHardAllowed({}, ["skeleton", "focus"])).toBe(true);
    expect(focusAfterAllHardAllowed(null)).toBe(false);
  });

  it("LAYOUT_APPLY_RUN_HARD_MS is job-class ceiling (~300s)", () => {
    expect(LAYOUT_APPLY_RUN_HARD_MS).toBeGreaterThanOrEqual(120_000);
    expect(LAYOUT_APPLY_RUN_HARD_MS).toBeLessThanOrEqual(600_000);
  });
});

describe("LayoutApplyRunBag", () => {
  // production=false (setup-plog) would activate OH3; settle fixtures are multi-ws dumps.
  beforeEach(() => {
    resetAssertForTests();
    setAssertActiveForTests(false);
  });
  afterEach(() => {
    resetAssertForTests();
  });
  function bagWithQueue(hooks = {}) {
    const queue = [];
    const bag = new LayoutApplyRunBag({
      phaseDelayMs: 0,
      schedule: (_ms, cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancel: () => {
        queue.length = 0;
      },
      ...hooks,
    });
    return {
      bag,
      flushOne: () => {
        const cb = queue.shift();
        if (cb) cb();
      },
      flushAll: () => {
        while (queue.length) {
          const cb = queue.shift();
          cb();
        }
      },
      queue,
    };
  }

  it("skips start when assertionFailed is set", () => {
    setAssertActiveForTests(true);
    assert(false, "test-apply-stop");
    try {
      const { bag } = bagWithQueue();
      const a = bag.start({ profile: { roles: [] }, name: "t" });
      expect(a).toMatchObject({ ok: false, code: ASSERT_FAILED_CODE });
      expect(bag.live).toBeFalsy();
    } finally {
      resetAssertForTests();
    }
  });

  it("aborts a live run at the next phase when assertionFailed is set", () => {
    const { bag, flushOne } = bagWithQueue();
    const a = bag.start({ profile: { roles: [] }, name: "t" });
    expect(a.ok).toBe(true);
    expect(bag.live).toBeTruthy();
    setAssertActiveForTests(true);
    assert(false, "test-apply-mid");
    try {
      flushOne();
      expect(bag.live).toBeNull();
      expect(bag.lastTerminal?.terminal).toMatchObject({
        ok: false,
        code: ASSERT_FAILED_CODE,
      });
    } finally {
      resetAssertForTests();
    }
  });

  it("starts immediately and is single-flight busy", () => {
    const { bag, flushAll } = bagWithQueue();
    const a = bag.start({ profile: { roles: [] }, name: "t" });
    expect(a.ok).toBe(true);
    expect(a.started).toBe(true);
    expect(a.applyId).toBeTruthy();
    const b = bag.start({ profile: { roles: [] } });
    expect(b).toMatchObject({ ok: false, code: "busy", applyId: a.applyId });
    flushAll();
    expect(bag.live).toBeNull();
  });

  it("disconnect does not cancel — only CancelLayoutApply", () => {
    const { bag, flushOne, flushAll } = bagWithQueue();
    const a = bag.start({ profile: {} });
    // Simulate client disconnect: do nothing to the bag.
    expect(bag.get("").live).toBe(true);
    expect(bag.cancel(a.applyId)).toMatchObject({ ok: true, cancelRequested: true });
    flushOne(); // cooperative at phase boundary
    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal).toMatchObject({
      ok: false,
      code: "cancel",
    });
    flushAll();
  });

  it("onApplyLive enter at start and leave on Done (R036 rehome gate)", () => {
    const live = [];
    const { bag, flushAll } = bagWithQueue({
      onApplyLive: (active) => live.push(!!active),
    });
    bag.start({ profile: { roles: [] }, name: "dev" });
    expect(live).toEqual([true]);
    expect(bag.live).toBeTruthy();
    flushAll();
    expect(bag.live).toBeNull();
    expect(live).toEqual([true, false]);
  });

  it("cancel with code displays-changed finishes Done with that code (SM1)", () => {
    const done = [];
    const live = [];
    const { bag, flushOne } = bagWithQueue({
      onDone: (p) => done.push(p),
      onApplyLive: (active) => live.push(!!active),
    });
    const start = bag.start({ profile: { roles: [] }, name: "dev" });
    expect(start.ok).toBe(true);
    expect(live).toEqual([true]);
    expect(bag.cancel(start.applyId, { code: "displays-changed" })).toMatchObject({
      ok: true,
      cancelRequested: true,
      code: "displays-changed",
    });
    flushOne();
    expect(bag.live).toBeNull();
    expect(live).toEqual([true, false]);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      ok: false,
      code: "displays-changed",
      error: "displays changed",
    });
  });

  it("emits progress and done; chrome show/clear", () => {
    const progress = [];
    const done = [];
    const chrome = { show: 0, clear: 0, phases: [] };
    const { bag, flushAll } = bagWithQueue({
      onProgress: (p) => progress.push(p),
      onDone: (p) => done.push(p),
      onChromeShow: () => {
        chrome.show += 1;
      },
      onChromeClear: () => {
        chrome.clear += 1;
      },
      onPhaseEnter: ({ phase }) => chrome.phases.push(phase),
    });
    bag.start({ profile: { roles: [] }, name: "dev" });
    expect(chrome.show).toBe(1);
    flushAll();
    expect(chrome.clear).toBe(1);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
    expect(done[0].phase).toBe("verify");
    expect(progress.some((p) => p.event === "enter" && p.phase === "skeleton")).toBe(true);
    expect(chrome.phases[0]).toBe("skeleton");
    expect(chrome.phases).toContain("verify");
  });

  it("GetLayoutApply returns last terminal after done", () => {
    const { bag, flushAll } = bagWithQueue();
    const a = bag.start({ profile: {} });
    flushAll();
    const snap = bag.get("");
    expect(snap.live).toBe(false);
    expect(snap.applyId).toBe(a.applyId);
    expect(snap.terminal?.ok).toBe(true);
    expect(snapshotRun(null).live).toBe(false);
  });

  it("dispose cancels live and clears chrome", () => {
    const clear = vi.fn();
    const { bag } = bagWithQueue({ onChromeClear: clear });
    bag.start({ profile: {} });
    bag.dispose();
    expect(bag.live).toBeNull();
    expect(clear).toHaveBeenCalled();
    expect(bag.lastTerminal.terminal.code).toBe("disposed");
  });
});

describe("LayoutApplyRunBag structure (AL5)", () => {
  beforeEach(() => {
    resetAssertForTests();
    setAssertActiveForTests(false);
  });
  afterEach(() => {
    resetAssertForTests();
  });

  function bagWithStructure(structure, hooks = {}) {
    const queue = [];
    const bag = new LayoutApplyRunBag({
      phaseDelayMs: 0,
      structure,
      schedule: (_ms, cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancel: () => {
        queue.length = 0;
      },
      ...hooks,
    });
    return {
      bag,
      flushAll: () => {
        while (queue.length) {
          const cb = queue.shift();
          cb();
        }
      },
      queue,
    };
  }

  it("nested-hsplit expected plan → order steps via runSteps (no Meta)", () => {
    const d = loadExpected("nested-hsplit-clean");
    const executed = [];
    const progress = [];
    const { bag, flushAll } = bagWithStructure(
      {
        snapshotForest: () => d.forest,
        runSteps: (steps, ctx) => {
          executed.push({ phase: ctx.phase, steps: steps.map((s) => ({ ...s })) });
          return { ok: true, results: steps.map((_, i) => ({ ok: true, index: i })) };
        },
      },
      { onProgress: (p) => progress.push(p) }
    );
    bag.start({
      profile: d.profile,
      name: "_forge-test-nested",
      flags: d.flags,
      workspace: 0,
    });
    flushAll();
    // Max-1 HSPLIT wrap is settled TILES; order still runs for reversed panes.
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.structure).toBe(true);
    const orderBatch = executed.find((e) => e.phase === "order");
    expect(orderBatch).toBeTruthy();
    expect(orderBatch.steps).toEqual([{ op: "order", windowIds: ["id:101", "id:100"] }]);
    expect(executed.every((e) => e.steps.every((s) => s.op !== "open"))).toBe(true);
  });

  it("empty-clean: skeleton executed; opens deferred with progress (AL6)", () => {
    const d = loadExpected("empty-clean");
    const executed = [];
    const progress = [];
    const { bag, flushAll } = bagWithStructure(
      {
        snapshotForest: () => d.forest,
        runSteps: (steps, ctx) => {
          executed.push({ phase: ctx.phase, ops: steps.map((s) => s.op) });
          return { ok: true };
        },
      },
      { onProgress: (p) => progress.push(p) }
    );
    bag.start({ profile: d.profile, flags: d.flags, name: "_forge-test-empty" });
    flushAll();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.openDeferred).toBe(true);
    expect(bag.lastTerminal.terminal.result.openCount).toBe(7);
    expect(executed.some((e) => e.phase === "skeleton" && e.ops.includes("skeleton"))).toBe(true);
    expect(progress.some((p) => /open deferred \(AL6\)/i.test(p.message || ""))).toBe(true);
    expect(executed.every((e) => !e.ops.includes("open"))).toBe(true);
  });

  it("perfect-clean: equal size steps (R039); walks phases and chrome clear", () => {
    const d = loadExpected("perfect-clean");
    const runSteps = vi.fn(() => ({ ok: true }));
    const chrome = { show: 0, clear: 0 };
    const { bag, flushAll } = bagWithStructure(
      {
        snapshotForest: () => d.forest,
        runSteps,
      },
      {
        onChromeShow: () => {
          chrome.show += 1;
        },
        onChromeClear: () => {
          chrome.clear += 1;
        },
      }
    );
    bag.start({ profile: d.profile, flags: d.flags });
    flushAll();
    expect(runSteps).toHaveBeenCalled();
    const sizeCall = runSteps.mock.calls.find((c) => c[1]?.phase === "size");
    expect(sizeCall?.[0]?.every((s) => s.op === "size")).toBe(true);
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.hardReady).toMatchObject({
      skipped: true,
      reason: "no-settle-deps",
    });
    expect(bag.lastTerminal.terminal.result.soft).toMatchObject({
      skipped: true,
      reason: "no-settle-deps",
    });
    expect(chrome.show).toBe(1);
    expect(chrome.clear).toBe(1);
  });

  it("runSteps failure fails apply at that phase", () => {
    const d = loadExpected("nested-hsplit-clean");
    const { bag, flushAll } = bagWithStructure({
      snapshotForest: () => d.forest,
      runSteps: (steps, ctx) => {
        if (ctx.phase === "order") {
          return { ok: false, error: "order mocked fail", code: "steps-failed" };
        }
        return { ok: true };
      },
    });
    bag.start({ profile: d.profile, flags: d.flags });
    flushAll();
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.phase).toBe("order");
    expect(bag.lastTerminal.terminal.error).toMatch(/order mocked fail/);
  });

  it("snapshot failure fails at skeleton", () => {
    const { bag } = bagWithStructure({
      snapshotForest: () => {
        throw new Error("no tree");
      },
      runSteps: () => ({ ok: true }),
    });
    bag.start({ profile: { roles: [] } });
    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal).toMatchObject({
      ok: false,
      phase: "skeleton",
      code: "snapshot-error",
    });
  });

  it("layout steps recorded for residual ensure_layout (setLayout path at session layer)", () => {
    const d = loadExpected("residual-replan-pins");
    const layoutSteps = [];
    const { bag, flushAll } = bagWithStructure({
      snapshotForest: () => d.forest,
      runSteps: (steps) => {
        for (const s of steps) {
          if (s.op === "layout") layoutSteps.push(s);
        }
        return { ok: true };
      },
    });
    bag.start({ profile: d.profile, flags: d.flags });
    flushAll();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(layoutSteps.length).toBeGreaterThanOrEqual(1);
    expect(layoutSteps.every((s) => s.mode === "tabbed" || s.mode === "TABBED")).toBe(true);
  });
});

describe("LayoutApplyRunBag settle (AL7)", () => {
  beforeEach(() => {
    resetAssertForTests();
    setAssertActiveForTests(false);
  });
  afterEach(() => {
    resetAssertForTests();
  });

  function bagWithSettle(structure, settle, hooks = {}) {
    const timers = [];
    let nextId = 1;
    const bag = new LayoutApplyRunBag({
      phaseDelayMs: 0,
      structure,
      settle,
      schedule: (ms, cb) => {
        const id = nextId++;
        timers.push({ id, ms, cb });
        return id;
      },
      cancel: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      ...hooks,
    });
    const fireMs = (ms) => {
      const due = timers.filter((t) => t.ms === ms);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
    };
    const flushZero = (max = 64) => {
      let n = 0;
      while (n < max) {
        const zeros = timers.filter((t) => t.ms === 0);
        if (!zeros.length) return n;
        for (const t of zeros) {
          const i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
          t.cb();
        }
        n += 1;
      }
      return n;
    };
    const drainSlotHard = (max = 8) => {
      for (let i = 0; i < max && bag.live && bag.live.phase === "hard-ready"; i++) {
        const hard = timers.filter((t) => t.ms === 50 || t.ms === 2000 || t.ms === 5000);
        if (!hard.length) break;
        fireMs(Math.min(...hard.map((t) => t.ms)));
        flushZero();
      }
    };
    return { bag, timers, fireMs, flushZero, drainSlotHard };
  }

  function grokActiveMismatch() {
    const d = loadExpected("perfect-clean");
    const profile = JSON.parse(JSON.stringify(d.profile));
    const left = profile.layout.mon0.children.find((c) => c.id === "left-tab");
    left.active = "grok";
    const forest = JSON.parse(JSON.stringify(d.forest));
    // Apply default ws=0; fixture also has ws1 heads — drop them for OH3 filter.
    forest.monitors = (forest.monitors || []).filter(
      (m) => typeof m?.id !== "string" || !/^mo\d+ws\d+$/.test(m.id) || /ws0$/.test(m.id)
    );
    forest.monitors[0].children[0].lastTabFocusId = 102;
    return { profile, forest, flags: d.flags };
  }

  function learnedHeuristics() {
    return JSON.stringify({
      version: 1,
      entries: {
        "testhost|google-chrome|focus-phase|focus": {
          host: "testhost",
          class: "google-chrome",
          processKind: "focus-phase",
          residualKind: "focus",
          latenciesMs: [200],
          trialCount: 4,
          zeroResidualCount: 2,
        },
      },
    });
  }

  it("hard → focus steps → soft quiet → verify; chrome clears at Done (D071)", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const executed = [];
    const chrome = { show: 0, clear: 0, reasons: [] };
    const written = { text: null };
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          executed.push({ phase: ctx.phase, ops: steps.map((s) => s.op) });
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
          {
            windowId: 101,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: (text) => {
          written.text = text;
        },
        resolveHost: () => "testhost",
        restorePin: () => false,
      },
      {
        onChromeShow: () => {
          chrome.show += 1;
        },
        onChromeClear: ({ reason } = {}) => {
          chrome.clear += 1;
          if (reason) chrome.reasons.push(reason);
        },
      }
    );

    bag.start({ profile, flags, name: "_forge-test-settle" });
    flushZero();
    expect(bag.live).toBeTruthy();
    expect(bag.live.phase).toBe("soft");
    expect(chrome.show).toBe(1);
    // Chrome stays through soft + verify; clear only at Done (D071).
    expect(chrome.clear).toBe(0);
    expect(executed.some((e) => e.phase === "focus" && e.ops.includes("focus"))).toBe(true);
    expect(bag.live.hardReadyRan).toBe(true);
    expect(bag.live.hardReady.ok).toBe(true);
    expect(Array.isArray(bag.live.hardReady.machines)).toBe(true);
    expect(executed.some((e) => e.phase === "hard-ready" && e.ops.includes("focus"))).toBe(false);

    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    expect(Number.isFinite(quietMs)).toBe(true);
    fireMs(quietMs);
    flushZero();

    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.soft.softSettled).toBe(true);
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.heuristics.persist).toBe("ok");
    expect(written.text).toContain("testhost|google-chrome|focus-phase|focus");
    expect(chrome.clear).toBe(1);
    expect(chrome.reasons).toEqual(["done"]);
  });

  it("hard-ready waits for TILE signal then continues (no poll interval)", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const wins = [
      {
        windowId: 102,
        mode: "FLOAT",
        monitor: 0,
        rect: { width: 10, height: 10 },
        wmClass: "Google-chrome",
      },
    ];
    let winCb = null;
    const chrome = { show: 0, clear: 0, reasons: [] };
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      },
      {
        onChromeShow: () => {
          chrome.show += 1;
        },
        onChromeClear: ({ reason } = {}) => {
          chrome.clear += 1;
          if (reason) chrome.reasons.push(reason);
        },
      }
    );
    bag.start({ profile, flags });
    flushZero();
    expect(bag.live.phase).toBe("hard-ready");
    expect(bag.live.settleHeld).toBe(true);
    expect(timers.some((t) => t.ms === 5000)).toBe(true);
    expect(timers.every((t) => t.ms === 0 || t.ms === 5000)).toBe(true);
    // SM7: overlay stays up mid-place / mid-hard wait.
    expect(chrome.show).toBe(1);
    expect(chrome.clear).toBe(0);
    wins[0] = { ...wins[0], mode: "TILE", rect: { width: 100, height: 80 } };
    winCb();
    flushZero();
    expect(bag.live.phase).toBe("soft");
    expect(chrome.clear).toBe(0);
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    fireMs(quietMs);
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.hardReady.ok).toBe(true);
    expect(chrome.clear).toBe(1);
    expect(chrome.reasons).toEqual(["done"]);
  });

  it("steal during soft restores pin and verify corrects at most once", () => {
    const { profile, flags } = grokActiveMismatch();
    const forest = JSON.parse(JSON.stringify(loadExpected("perfect-clean").forest));
    forest.monitors[0].children[0].lastTabFocusId = 101;
    let pin = 0;
    let verifyCorrects = 0;
    let focusCb = null;
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          if (ctx.phase === "soft" || ctx.phase === "verify") {
            forest.monitors[0].children[0].lastTabFocusId = 102;
            if (ctx.phase === "verify") verifyCorrects += 1;
          }
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        onFocusEvent: (cb) => {
          focusCb = cb;
          return () => {
            focusCb = null;
          };
        },
        restorePin: () => {
          pin += 1;
          return true;
        },
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );
    bag.start({ profile, flags });
    flushZero();
    expect(bag.live.phase).toBe("soft");
    expect(pin).toBeGreaterThanOrEqual(1);
    forest.monitors[0].children[0].lastTabFocusId = 102;
    if (focusCb) focusCb();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    fireMs(quietMs);
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(verifyCorrects).toBeLessThanOrEqual(1);
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
  });

  it("soft max-corrections warns and continues to verify (does not abort)", () => {
    const { profile, flags } = grokActiveMismatch();
    const forest = JSON.parse(JSON.stringify(loadExpected("perfect-clean").forest));
    // Permanent LTF mismatch → soft keeps needing correct.
    forest.monitors[0].children[0].lastTabFocusId = 101;
    const progress = [];
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        restorePin: () => false,
        softTimeoutMs: 10,
        maxWallMs: 50,
      },
      {
        onProgress: (p) => {
          if (p?.message) progress.push(String(p.message));
        },
      }
    );
    bag.start({ profile, flags, name: "_forge-test-soft-continue" });
    flushZero();
    // Drain soft wall / quiet timers.
    for (let i = 0; i < 40; i++) {
      if (!bag.live) break;
      const ms = timers.map((t) => t.ms).filter((m) => m > 0);
      if (!ms.length) break;
      fireMs(Math.min(...ms));
      flushZero();
    }
    // Soft may still be held if wall not fired; force remaining timers.
    while (bag.live && timers.length) {
      const t = timers[0];
      fireMs(t.ms);
      flushZero();
    }
    expect(bag.live).toBeNull();
    // Must not hard-fail at soft with soft-error.
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.phase).not.toBe("soft");
    expect(
      progress.some((m) => m.includes("continuing to verify") || m.includes("soft settled"))
    ).toBe(true);
  });

  it("waitTreeStable stays opt-in (default off)", () => {
    const d = loadExpected("perfect-clean");
    const { bag, flushZero } = bagWithSettle(
      {
        snapshotForest: () => d.forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => d.forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 10, height: 10 },
          },
        ],
        readHeuristics: () => null,
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );
    bag.start({ profile: d.profile, flags: d.flags });
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.hardReady.skipped).toBe(true);
    expect(bag.lastTerminal.terminal.result.soft.skipped).toBe(true);
  });

  it("SM6: product path never emits belt / beltStructure progress", () => {
    const d = loadExpected("wrong-mon-clean");
    const progress = [];
    const forest = JSON.parse(JSON.stringify(d.forest));
    forest.monitors[0].children[0].lastTabFocusId = 102;
    const profile = JSON.parse(JSON.stringify(d.profile));
    const left = profile.layout?.mon0?.children?.find?.((c) => c.id === "left-tab");
    if (left) left.active = "grok";
    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          if (ctx.phase === "order" && ctx.run) {
            ctx.run.rolePins = { "ghostty-right": 201, youtube: 202 };
          }
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
          {
            windowId: 201,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "com.mitchellh.ghostty",
          },
          {
            windowId: 202,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        restorePin: () => false,
      },
      {
        onProgress: (p) => {
          progress.push({ phase: p?.phase, message: p?.message || "" });
        },
      }
    );

    bag.start({
      profile,
      flags: { ...d.flags, forestFailsafe: false },
      name: "_forge-test-no-belt",
    });
    flushZero();
    drainSlotHard();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();
    expect(progress.some((p) => /belt/i.test(String(p.message)))).toBe(false);
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
    expect(bag.lastTerminal.terminal.result.hardFailed.length).toBeGreaterThan(0);
    expect(bag.lastTerminal.terminal.result.belt).toBeUndefined();
    expect(bag.lastTerminal.terminal.result.forestMatch.ok).toBe(false);
    // Focus verify may still pass; it is not Done.ok.
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
  });

  it("SM6: soft Meta rehome wrong-mon fails forest-match Done.ok (no belt repair)", () => {
    // R036 residual class: pins look right at focus, Meta rehomes before Done.
    const d = loadExpected("wrong-mon-clean");
    const progress = [];

    const forestOk = JSON.parse(JSON.stringify(d.forest));
    {
      const mon0 = forestOk.monitors[0];
      const mon1 = forestOk.monitors[1];
      mon0.children[0].lastTabFocusId = 102;
      const w201 = mon0.children.find((c) => c.windowId === 201);
      const w202 = mon0.children.find((c) => c.windowId === 202);
      mon0.children = mon0.children.filter((c) => c.windowId !== 201 && c.windowId !== 202);
      if (w201) {
        w201.monitor = 1;
        mon1.children.unshift(w201);
      }
      if (w202) {
        w202.monitor = 1;
        mon1.children.push(w202);
      }
    }
    const forestWrong = JSON.parse(JSON.stringify(d.forest));
    forestWrong.monitors[0].children[0].lastTabFocusId = 102;

    let snapPhase = "focus";
    const snap = () => (snapPhase === "focus" ? forestOk : forestWrong);

    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: snap,
        runSteps: (steps, ctx) => {
          if (ctx.phase === "order" && ctx.run) {
            ctx.run.rolePins = { "ghostty-right": 201, youtube: 202 };
          }
          return { ok: true };
        },
      },
      {
        snapshotForest: snap,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
          {
            windowId: 201,
            mode: "TILE",
            monitor: snapPhase === "focus" ? 1 : 0,
            rect: { width: 100, height: 80 },
            wmClass: "com.mitchellh.ghostty",
          },
          {
            windowId: 202,
            mode: "TILE",
            monitor: snapPhase === "focus" ? 1 : 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        restorePin: () => false,
      },
      {
        onProgress: (p) => {
          const phase = p?.phase;
          const message = p?.message || "";
          progress.push({ phase, message });
          if (phase === "soft" && snapPhase === "focus") snapPhase = "verify";
        },
      }
    );

    bag.start({
      profile: d.profile,
      flags: { ...d.flags, forestFailsafe: false },
      name: "_forge-test-rehome-forest",
    });
    flushZero();
    drainSlotHard();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();

    expect(progress.some((p) => /belt/i.test(String(p.message)))).toBe(false);
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
    expect(bag.lastTerminal.terminal.result.forestMatch.ok).toBe(false);
    expect(bag.lastTerminal.terminal.result.hardFailed.length).toBeGreaterThan(0);
    expect(bag.lastTerminal.terminal.result.belt).toBeUndefined();
    // Verify-once is not the success contract (may still ok when focus leaf matches).
    expect(bag.lastTerminal.terminal.result.verify).toBeTruthy();
  });

  it("waitTreeStable flag runs LF6 fingerprint quiet before verify", () => {
    const d = loadExpected("perfect-clean");
    let winCb = null;
    const { bag, flushZero } = bagWithSettle(
      {
        snapshotForest: () => d.forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => d.forest,
        loadWindows: () => [
          {
            windowId: 101,
            mode: "TILE",
            monitor: 0,
            rect: { width: 10, height: 10 },
          },
        ],
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        readHeuristics: () => null,
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );
    bag.start({
      profile: d.profile,
      flags: { ...d.flags, waitTreeStable: true },
    });
    flushZero();
    expect(bag.live.phase).toBe("verify");
    expect(bag.live.settleHeld).toBe(true);
    winCb();
    winCb();
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
  });

  it("hard-ready retry then hard-failed is not Done success", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const progress = [];
    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "FLOAT",
            monitor: 0,
            rect: { width: 10, height: 10 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        hardTimeoutMs: 50,
        hardRetryTimeoutMs: 50,
      },
      {
        onProgress: (p) => {
          if (p?.message) progress.push(String(p.message));
        },
      }
    );
    bag.start({ profile, flags, name: "_forge-test-hard-timeout" });
    flushZero();
    expect(bag.live.phase).toBe("hard-ready");
    drainSlotHard();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();
    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
    expect(bag.lastTerminal.terminal.result.hardFailed.length).toBeGreaterThan(0);
    expect(progress.some((m) => m.includes("(continuing)"))).toBe(false);
    expect(progress.some((m) => m.includes("not success"))).toBe(true);
    expect(progress.filter((m) => /slot .+ place attempt=/.test(m)).length).toBeGreaterThanOrEqual(
      3
    );
    expect(bag.lastTerminal.terminal.result.verify).toBeTruthy();
  });

  it("TILE on the wrong mon stays pending (does not settle hard-ready)", () => {
    const d = loadExpected("wrong-mon-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    forest.monitors[0].children[0].lastTabFocusId = 102;
    const { bag, timers, flushZero } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          if (ctx.phase === "order" && ctx.run) {
            ctx.run.rolePins = { "ghostty-right": 201 };
          }
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 201,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "com.mitchellh.ghostty",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );
    bag.start({
      profile: d.profile,
      flags: d.flags,
      name: "_forge-test-wrong-mon-pending",
    });
    flushZero();
    expect(bag.live).toBeTruthy();
    expect(bag.live.phase).toBe("hard-ready");
    expect(bag.live.settleHeld).toBe(true);
    expect(timers.some((t) => t.ms === 5000)).toBe(true);
    expect(bag.lastTerminal).toBeFalsy();
    bag.cancel(bag.live.applyId);
    flushZero();
  });

  it("empty required mon fails Done even if focus verify passed", () => {
    const d = loadExpected("wrong-mon-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    forest.monitors[0].children[0].lastTabFocusId = 102;
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: () => ({ ok: true }),
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );
    bag.start({ profile: d.profile, flags: d.flags, name: "_forge-test-empty-mon1" });
    flushZero();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();
    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
    const failed = bag.lastTerminal.terminal.result.hardFailed;
    expect(failed.some((s) => String(s).startsWith("mon1"))).toBe(true);
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
  });

  it("SM5: focus ops only after all-hard; never mid open/place/hard-ready", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const executed = [];
    const { bag, timers, flushZero, fireMs } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          executed.push({
            phase: ctx.phase,
            ops: steps.map((s) => s.op),
            hardReadyRan: !!(ctx.run && ctx.run.hardReadyRan),
            focusRan: !!(ctx.run && ctx.run.focusRan),
          });
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
          {
            windowId: 101,
            mode: "TILE",
            monitor: 0,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        restorePin: () => false,
      }
    );

    bag.start({ profile, flags, name: "_forge-test-sm5-focus-order" });
    flushZero();
    expect(bag.live).toBeTruthy();
    expect(bag.live.hardReadyRan).toBe(true);
    expect(bag.live.focusRan).toBe(true);
    expect(bag.live.focusCallAt).not.toBeNull();
    expect(bag.live.phase).toBe("soft");

    const focusBatches = executed.filter((e) => e.ops.includes("focus"));
    expect(focusBatches.length).toBeGreaterThanOrEqual(1);
    expect(
      focusBatches.every((e) => e.phase === "focus" || e.phase === "soft" || e.phase === "verify")
    ).toBe(true);
    // Product first focus is the focus phase after all-hard (soft/verify only correct residual).
    expect(focusBatches[0].phase).toBe("focus");
    expect(focusBatches[0].hardReadyRan).toBe(true);
    expect(
      executed.some(
        (e) =>
          ["skeleton", "open", "bind", "order", "size", "hard-ready"].includes(e.phase) &&
          e.ops.includes("focus")
      )
    ).toBe(false);

    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    fireMs(quietMs);
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.soft).toBeTruthy();
    expect(bag.lastTerminal.terminal.result.verify.ok).toBe(true);
  });

  it("SM5: hard-failed slots still get post-hard focus + soft; Done.ok is forest-match", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const executed = [];
    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          executed.push({ phase: ctx.phase, ops: steps.map((s) => s.op) });
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 102,
            mode: "FLOAT",
            monitor: 0,
            rect: { width: 10, height: 10 },
            wmClass: "Google-chrome",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        hardTimeoutMs: 50,
        hardRetryTimeoutMs: 50,
      }
    );
    bag.start({
      profile,
      flags: { ...flags, forestFailsafe: false },
      name: "_forge-test-sm5-hard-fail-still-focus",
    });
    flushZero();
    expect(bag.live.phase).toBe("hard-ready");
    drainSlotHard();
    // After machines terminal, focus/soft continue on what landed.
    expect(bag.live === null || bag.live.hardReadyRan === true).toBe(true);
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();
    expect(bag.live).toBeNull();
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
    expect(executed.some((e) => e.phase === "focus" && e.ops.includes("focus"))).toBe(true);
    expect(
      executed.some(
        (e) =>
          ["open", "bind", "order", "size", "hard-ready"].includes(e.phase) &&
          e.ops.includes("focus")
      )
    ).toBe(false);
    // Verify ran; it does not define ok (forest-match does).
    expect(bag.lastTerminal.terminal.result.verify).toBeTruthy();
    expect(bag.lastTerminal.terminal.result.soft).toBeTruthy();
    expect(bag.lastTerminal.terminal.result.forestMatch.ok).toBe(false);
  });

  it("D070: prod forest-failsafe recovers R042 partial tab peel once", () => {
    // mon1.comms peers split: YouTube+Gmail in TABBED, Voice under MONITOR.
    const d = loadExpected("perfect-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    const mon1 = forest.monitors.find((m) => m.id === "mo1ws0");
    const tab = (mon1.children || []).find(
      (c) => c && c.nodeType === "CON" && String(c.layout).toUpperCase() === "TABBED"
    );
    const voice = (tab.children || []).find((c) => Number(c.windowId) === 204);
    tab.children = (tab.children || []).filter((c) => Number(c?.windowId) !== 204);
    mon1.children = [...(mon1.children || []), voice];

    const pins = {
      "chrome-luke": 101,
      grok: 102,
      "ghostty-left": 103,
      "ghostty-right": 201,
      youtube: 202,
      gmail: 203,
      voice: 204,
    };
    let forestLive = forest;
    const failsafePhases = [];
    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: () => forestLive,
        runSteps: (steps, ctx) => {
          if (ctx.run) ctx.run.rolePins = { ...pins };
          if (ctx.phase === "forest-failsafe") {
            failsafePhases.push(steps.map((s) => s.op));
            // Simulate ensure_layout regrouping Voice into the tab CON.
            const m1 = forestLive.monitors.find((m) => m.id === "mo1ws0");
            const t = (m1.children || []).find(
              (c) => c && c.nodeType === "CON" && String(c.layout).toUpperCase() === "TABBED"
            );
            const peeled = (m1.children || []).find((c) => Number(c?.windowId) === 204);
            if (t && peeled) {
              m1.children = (m1.children || []).filter((c) => Number(c?.windowId) !== 204);
              t.children = [...(t.children || []), peeled];
            }
            forestLive = JSON.parse(JSON.stringify(forestLive));
          }
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forestLive,
        loadWindows: () => {
          const wins = [];
          const walk = (n, parentLayout, parentType) => {
            if (!n) return;
            if (n.windowId != null) {
              wins.push({
                windowId: n.windowId,
                mode: n.mode || "TILE",
                monitor: n.monitor,
                rect: n.rect || { width: 100, height: 80 },
                wmClass: n.wmClass,
                parentLayout,
                parentType,
              });
            }
            const lay = n.layout != null ? String(n.layout) : parentLayout;
            const typ = n.nodeType != null ? String(n.nodeType) : parentType;
            for (const c of n.children || []) walk(c, lay, typ);
          };
          for (const m of forestLive.monitors || []) walk(m, null, "MONITOR");
          return wins;
        },
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
        restorePin: () => false,
      }
    );

    bag.start({
      profile: d.profile,
      flags: { ...d.flags, clean: false, forestFailsafe: true },
      name: "_forge-test-failsafe-r042",
    });
    flushZero();
    drainSlotHard();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();

    expect(failsafePhases.length).toBeGreaterThan(0);
    expect(failsafePhases.some((ops) => ops.includes("layout") || ops.includes("move"))).toBe(true);
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.failsafe?.recovered).toBe(true);
    expect(bag.lastTerminal.terminal.result.forestMatch.ok).toBe(true);
  });

  it("D070: forestFailsafe:false keeps loud hard-failed (dev primary path)", () => {
    const d = loadExpected("perfect-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    const mon1 = forest.monitors.find((m) => m.id === "mo1ws0");
    const tab = (mon1.children || []).find(
      (c) => c && c.nodeType === "CON" && String(c.layout).toUpperCase() === "TABBED"
    );
    const voice = (tab.children || []).find((c) => Number(c.windowId) === 204);
    tab.children = (tab.children || []).filter((c) => Number(c?.windowId) !== 204);
    mon1.children = [...(mon1.children || []), voice];

    const pins = {
      "chrome-luke": 101,
      grok: 102,
      "ghostty-left": 103,
      "ghostty-right": 201,
      youtube: 202,
      gmail: 203,
      voice: 204,
    };
    let failsafeRan = false;
    const { bag, timers, flushZero, fireMs, drainSlotHard } = bagWithSettle(
      {
        snapshotForest: () => forest,
        runSteps: (steps, ctx) => {
          if (ctx.run) ctx.run.rolePins = { ...pins };
          if (ctx.phase === "forest-failsafe") failsafeRan = true;
          return { ok: true };
        },
      },
      {
        snapshotForest: () => forest,
        loadWindows: () => [
          {
            windowId: 204,
            mode: "TILE",
            monitor: 1,
            rect: { width: 100, height: 80 },
            wmClass: "Google-chrome",
            parentLayout: "HSPLIT",
            parentType: "MONITOR",
          },
        ],
        readHeuristics: () => learnedHeuristics(),
        writeHeuristics: () => {},
        resolveHost: () => "testhost",
      }
    );

    bag.start({
      profile: d.profile,
      flags: { ...d.flags, clean: false, forestFailsafe: false },
    });
    flushZero();
    drainSlotHard();
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    if (Number.isFinite(quietMs)) fireMs(quietMs);
    flushZero();

    expect(failsafeRan).toBe(false);
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.code).toBe("hard-failed");
  });
});

describe("ApplyChromeController hardMs for apply run", () => {
  it("setHardMs + resetHardClear re-arms timer", () => {
    const timers = [];
    let nextId = 1;
    const ctrl = new ApplyChromeController({
      hardMs: 30_000,
      schedule: (ms, cb) => {
        const id = nextId++;
        timers.push({ id, ms, cb });
        return id;
      },
      cancel: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    ctrl.show();
    expect(ctrl.hardClearArmed).toBe(true);
    expect(timers[0].ms).toBe(30_000);
    ctrl.setHardMs(LAYOUT_APPLY_RUN_HARD_MS);
    ctrl.resetHardClear();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(LAYOUT_APPLY_RUN_HARD_MS);
    ctrl.clear();
    expect(ctrl.visible).toBe(false);
    expect(timers).toHaveLength(0);
  });
});
