import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLY_LAYOUT_PHASES,
  LAYOUT_APPLY_RUN_HARD_MS,
  LayoutApplyRunBag,
  busyResult,
  donePayload,
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
  });

  it("LAYOUT_APPLY_RUN_HARD_MS is job-class ceiling (~300s)", () => {
    expect(LAYOUT_APPLY_RUN_HARD_MS).toBeGreaterThanOrEqual(120_000);
    expect(LAYOUT_APPLY_RUN_HARD_MS).toBeLessThanOrEqual(600_000);
  });
});

describe("LayoutApplyRunBag", () => {
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

  it("perfect-clean: no steps; still walks phases and chrome clear", () => {
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
    expect(runSteps).not.toHaveBeenCalled();
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
    return { bag, timers, fireMs, flushZero };
  }

  function grokActiveMismatch() {
    const d = loadExpected("perfect-clean");
    const profile = JSON.parse(JSON.stringify(d.profile));
    const left = profile.layout.mon0.children.find((c) => c.id === "left-tab");
    left.active = "grok";
    const forest = JSON.parse(JSON.stringify(d.forest));
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

  it("hard → focus steps → soft quiet → verify; chrome up through soft, clear after soft", () => {
    const { profile, forest, flags } = grokActiveMismatch();
    const executed = [];
    const chrome = { show: 0, clear: 0, reasons: [] };
    const written = { text: null };
    let liveDuringSoft = null;
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
    expect(chrome.clear).toBe(0);
    liveDuringSoft = chrome.clear;
    expect(executed.some((e) => e.phase === "focus" && e.ops.includes("focus"))).toBe(true);
    expect(bag.live.hardReadyRan).toBe(true);
    expect(bag.live.hardReady.ok).toBe(true);

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
    expect(liveDuringSoft).toBe(0);
    // Soft settle clears chrome once; terminal Done must not double-clear.
    expect(chrome.clear).toBe(1);
    expect(chrome.reasons[0]).toBe("soft");
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
      }
    );
    bag.start({ profile, flags });
    flushZero();
    expect(bag.live.phase).toBe("hard-ready");
    expect(bag.live.settleHeld).toBe(true);
    expect(timers.some((t) => t.ms === 5000)).toBe(true);
    expect(timers.every((t) => t.ms === 0 || t.ms === 5000)).toBe(true);
    wins[0] = { ...wins[0], mode: "TILE", rect: { width: 100, height: 80 } };
    winCb();
    flushZero();
    expect(bag.live.phase).toBe("soft");
    const quietMs = Math.min(...timers.map((t) => t.ms).filter((ms) => ms > 0 && ms < 5000));
    fireMs(quietMs);
    flushZero();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.hardReady.ok).toBe(true);
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
