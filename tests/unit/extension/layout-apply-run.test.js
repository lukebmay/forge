import { describe, it, expect, vi } from "vitest";
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
