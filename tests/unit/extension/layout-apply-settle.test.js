/**
 * AL7 / D019 / SM2: in-slot hard-ready, soft residual, verify once.
 * Done.ok = forest-match (not focus-only). Belt deleted (D042/SM6).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARD_TIMEOUT_MS,
  HEURISTICS_SCHEMA_VERSION,
  HeuristicsMemorySession,
  applyFocusSteps,
  collectHardReadyWindowIds,
  emptyHeuristicsStore,
  focusActionWindowId,
  focusActionsFromPlan,
  focusActionsStillNeeded,
  heuristicsRelPath,
  makeHeuristicsKey,
  parseHeuristicsStore,
  recordSoftFocusHeuristics,
  resolveFocusSoftTimeoutMs,
  resolveSettleHost,
  runSoftFocusBarrierOnSignals,
  serializeHeuristicsStore,
  softFocusWallMs,
  softTimeoutForKey,
  verifyFocusOnce,
  waitHardReadyOnSignals,
  waitTreeFingerprintQuietOnSignals,
  windowIsSettled,
  windowSettleFailureReasons,
  withoutFocusActions,
  hardReadyStatus,
  wmClassesForWindowIds,
  matchRequiredTileSlots,
  collectHardReadySlotTargets,
  isRequiredTileRole,
  desiredMonitorFromSlot,
  syncRolePinsFromForest,
} from "../../../lib/extension/layout-apply-settle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = join(__dirname, "../cli/fixtures/layout/expected");

function loadExpected(id) {
  return JSON.parse(readFileSync(join(EXPECTED, `${id}.json`), "utf8"));
}

function tileWin(id, extra = {}) {
  return {
    windowId: id,
    mode: "TILE",
    monitor: 0,
    rect: { x: 0, y: 0, width: 100, height: 80 },
    wmClass: "term",
    ...extra,
  };
}

function timerBag() {
  const timers = [];
  let nextId = 1;
  return {
    timers,
    schedule(ms, cb) {
      const id = nextId++;
      timers.push({ id, ms, cb });
      return id;
    },
    cancel(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    fire(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i < 0) return;
      const t = timers[i];
      timers.splice(i, 1);
      t.cb();
    },
    fireMs(ms) {
      const due = timers.filter((t) => t.ms === ms);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
    },
  };
}

describe("windowIsSettled / hardReadyStatus", () => {
  it("rejects float, missing id, zero rect, negative monitor", () => {
    expect(windowIsSettled(null)).toBe(false);
    expect(windowIsSettled({ mode: "TILE", rect: { width: 10, height: 10 } })).toBe(false);
    expect(
      windowIsSettled({
        windowId: 1,
        mode: "FLOAT",
        monitor: 0,
        rect: { width: 10, height: 10 },
      })
    ).toBe(false);
    expect(
      windowIsSettled({
        windowId: 1,
        mode: "TILE",
        monitor: 0,
        rect: { width: 0, height: 10 },
      })
    ).toBe(false);
    expect(
      windowIsSettled({
        windowId: 1,
        mode: "TILE",
        monitor: -1,
        rect: { width: 10, height: 10 },
      })
    ).toBe(false);
  });

  it("accepts TILE (or GRAB_TILE) + sane rect + mon ≥ 0", () => {
    expect(windowIsSettled(tileWin(13))).toBe(true);
    expect(windowIsSettled({ windowId: 13, mode: "TILE" })).toBe(true);
    expect(windowIsSettled(tileWin(2, { mode: "GRAB_TILE" }))).toBe(true);
    expect(
      windowIsSettled(
        { windowId: 1, mode: "FLOAT", rect: { width: 10, height: 10 } },
        { requireTile: false }
      )
    ).toBe(true);
  });

  it("classifies unique ids; HARD_TIMEOUT_MS is 5s call clock", () => {
    expect(HARD_TIMEOUT_MS).toBe(5000);
    const wins = [tileWin("1"), { windowId: "2", mode: "FLOAT" }];
    const st = hardReadyStatus(wins, ["1", "2", "2"]);
    expect(st).toEqual({ ok: false, settled: ["1"], pending: ["2"] });
    expect(hardReadyStatus([tileWin("a"), tileWin("b")], ["a", "b"]).ok).toBe(true);
  });

  it("TILE on the wrong mon is pending when desired mon is set", () => {
    const win = tileWin("201", { monitor: 0 });
    expect(windowIsSettled(win)).toBe(true);
    expect(windowIsSettled(win, { monitor: 1 })).toBe(false);
    const st = hardReadyStatus([win], ["201"], { slots: { 201: { monitor: 1 } } });
    expect(st).toEqual({ ok: false, settled: [], pending: ["201"] });
    expect(desiredMonitorFromSlot("mon1.term")).toBe(1);
  });

  it("windowSettleFailureReasons names mode / mon / parent / ε", () => {
    const slot = {
      monitor: 1,
      parentId: "con-a",
      parentLayout: "TABBED",
      slotRect: { x: 0, y: 0, width: 100, height: 80 },
    };
    expect(windowSettleFailureReasons(null, slot)).toEqual(["missing"]);
    expect(
      windowSettleFailureReasons(
        tileWin("1", { mode: "FLOAT", monitor: 0, parentId: "x", parentLayout: "HSPLIT" }),
        slot
      ).join(" ")
    ).toMatch(/mode=FLOAT/);
    expect(
      windowSettleFailureReasons(
        tileWin("1", { monitor: 0, parentId: "con-a", parentLayout: "TABBED" }),
        slot
      )
    ).toEqual(expect.arrayContaining([expect.stringMatching(/^mon=/)]));
    expect(
      windowSettleFailureReasons(
        tileWin("1", {
          monitor: 1,
          parentId: "con-a",
          parentLayout: "TABBED",
          rect: { x: 9, y: 9, width: 10, height: 10 },
        }),
        slot
      )
    ).toContain("rect-ε");
  });

  it("in-slot requires TILE|grab + desired mon + parent CON + ε rect", () => {
    const slot = {
      monitor: 1,
      parentId: "mo1ws0/1",
      parentLayout: "TABBED",
      parentType: "CON",
      slotRect: { x: 10, y: 20, width: 400, height: 300 },
    };
    const inSlot = tileWin("202", {
      monitor: 1,
      parentId: "mo1ws0/1",
      parentLayout: "TABBED",
      parentType: "CON",
      rect: { x: 11, y: 21, width: 398, height: 302 },
    });
    expect(windowIsSettled(inSlot, slot)).toBe(true);
    expect(windowIsSettled(tileWin("202", { ...inSlot, monitor: 0 }), slot)).toBe(false);
    expect(
      windowIsSettled(
        tileWin("202", { ...inSlot, parentLayout: "HSPLIT", parentType: "CON" }),
        slot
      )
    ).toBe(false);
    expect(
      windowIsSettled(
        tileWin("202", { ...inSlot, rect: { x: 80, y: 20, width: 400, height: 300 } }),
        slot
      )
    ).toBe(false);
    expect(windowIsSettled(tileWin("202", { ...inSlot, mode: "GRAB_TILE" }), slot)).toBe(true);
  });
});

describe("matchRequiredTileSlots (D041)", () => {
  it("empty required mon fails; FLOAT/ignore are not required", () => {
    const d = loadExpected("wrong-mon-clean");
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
    });
    expect(match.ok).toBe(false);
    expect(match.failed.some((s) => String(s).startsWith("mon1"))).toBe(true);

    expect(isRequiredTileRole({ id: "voice", slot: "mon1.comms" }, d.profile)).toBe(true);
    expect(isRequiredTileRole({ id: "kooha", mode: "float" }, d.profile)).toBe(false);
    expect(isRequiredTileRole({ id: "mpv", mode: "ignore" }, d.profile)).toBe(false);
    const floatProf = { ...d.profile, floating: ["kooha"] };
    expect(isRequiredTileRole({ id: "kooha", slot: "mon0.term" }, floatProf)).toBe(false);
  });

  it("hard-ready timeout pending is not a match", () => {
    const d = loadExpected("perfect-clean");
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
      hardReady: { ok: false, timedOut: true, pending: ["201"] },
    });
    expect(match.ok).toBe(false);
    expect(match.failed.length).toBeGreaterThan(0);
  });

  it("stale hardReady pending ids after late-adopt remap do not veto match", () => {
    const d = loadExpected("perfect-clean");
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
      // Pre-adopt ids no longer in rolePins / plan.roles
      hardReady: { ok: false, timedOut: true, pending: ["858367299", "858367300"] },
    });
    expect(match.pending.every((id) => !["858367299", "858367300"].includes(String(id)))).toBe(
      true
    );
  });

  it("syncRolePinsFromForest remaps pins to identity-matched windows", () => {
    const d = loadExpected("perfect-clean");
    const run = {
      profile: d.profile,
      flags: d.flags,
      workspace: 0,
      rolePins: {
        "chrome-luke": 999,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
    };
    const out = syncRolePinsFromForest(run, d.forest);
    expect(out.changed).toBe(true);
    expect(out.remaps.some((r) => r.role === "chrome-luke" && r.to === "101")).toBe(true);
    expect(String(run.rolePins["chrome-luke"])).toBe("101");
  });

  it("collectHardReadySlotTargets attaches desired mon for ApplyLayout", () => {
    const d = loadExpected("perfect-clean");
    const { ids, slots } = collectHardReadySlotTargets(
      {
        profile: d.profile,
        flags: d.flags,
        residualPlan: { actions: [{ op: "focus", selector: "id:201" }] },
      },
      d.forest
    );
    expect(ids).toEqual(["201"]);
    expect(slots["201"].monitor).toBe(1);
    expect(slots["201"].slot).toBe("mon1.term");
  });
});

describe("focusActionsStillNeeded", () => {
  const forest = {
    focusWindowId: 99,
    monitors: [
      {
        nodeType: "MONITOR",
        layout: "HSPLIT",
        children: [
          {
            nodeType: "CON",
            layout: "TABBED",
            lastTabFocusId: 10,
            children: [
              { nodeType: "WINDOW", windowId: 10 },
              { nodeType: "WINDOW", windowId: 20 },
            ],
          },
          {
            nodeType: "CON",
            layout: "TABBED",
            lastTabFocusId: 30,
            children: [
              { nodeType: "WINDOW", windowId: 30 },
              { nodeType: "WINDOW", windowId: 31 },
            ],
          },
        ],
      },
    ],
  };
  const actions = [
    { op: "focus", selector: "id:20", role: "b", reason: "active" },
    { op: "focus", selector: "id:30", role: "c", reason: "active" },
    { op: "focus", selector: "id:99", role: "term", reason: "profile" },
  ];

  it("open-leaf mismatch only (stolen lastTabFocus)", () => {
    expect(focusActionsStillNeeded(forest, actions).map((a) => a.role)).toEqual(["b"]);
  });

  it("profile keyboard mismatch is extra", () => {
    const badKbd = { ...forest, focusWindowId: 10 };
    expect(focusActionsStillNeeded(badKbd, actions).map((a) => a.role)).toEqual(["b", "term"]);
  });

  it("all match → empty", () => {
    const ok = {
      focusWindowId: 99,
      monitors: [
        {
          nodeType: "MONITOR",
          children: [
            {
              nodeType: "CON",
              layout: "TABBED",
              lastTabFocusId: 20,
              children: [
                { nodeType: "WINDOW", windowId: 10 },
                { nodeType: "WINDOW", windowId: 20 },
              ],
            },
            {
              nodeType: "CON",
              layout: "TABBED",
              lastTabFocusId: 30,
              children: [
                { nodeType: "WINDOW", windowId: 30 },
                { nodeType: "WINDOW", windowId: 31 },
              ],
            },
          ],
        },
      ],
    };
    expect(focusActionsStillNeeded(ok, actions)).toEqual([]);
  });
});

describe("focusActionsFromPlan / applyFocusSteps", () => {
  const actions = [
    { op: "ensure_layout", slot: "mon0.s0", mode: "tabbed", windowIds: [10, 20] },
    { op: "ensure_order", slot: "mon0", mode: "hsplit", windowIds: [1, 2] },
    { op: "move", role: "Grok", windowId: 20, slot: "mon0.s0" },
    { op: "focus", selector: "id:20", role: "Grok", reason: "active" },
    { op: "focus", selector: "id:1", role: "ghostty", reason: "profile" },
    { op: "park", windowId: 5, slot: "mon1" },
  ];

  it("extracts focus actions; withoutFocus strips them", () => {
    expect(focusActionsFromPlan(actions)).toHaveLength(2);
    expect(withoutFocusActions(actions).every((a) => a.op !== "focus")).toBe(true);
    expect(focusActionWindowId({ selector: "id:20" })).toBe("20");
  });

  it("applyFocusSteps runs focus ops only", () => {
    const ran = [];
    const r = applyFocusSteps(
      [
        { op: "focus", selector: "id:9", reason: "active" },
        { op: "move", role: "x" },
      ],
      (steps, ctx) => {
        ran.push({ ops: steps.map((s) => s.op), phase: ctx.phase });
        return { ok: true };
      },
      { phase: "verify" }
    );
    expect(r.ok).toBe(true);
    expect(ran).toEqual([{ ops: ["focus"], phase: "verify" }]);
  });
});

describe("heuristics file shape + soft timeout", () => {
  it("path is config/settle-heuristics.json under forgeConfigHome", () => {
    expect(heuristicsRelPath()).toBe("config/settle-heuristics.json");
  });

  it("FORGE_HOST wins; else short hostname", () => {
    expect(resolveSettleHost({ env: { FORGE_HOST: "Black-Sub-Forge" } })).toBe("black-sub-forge");
    expect(resolveSettleHost({ hostname: "black.lan" })).toBe("black");
  });

  it("schema v1; bad version → empty; keys are host|class|kind only", () => {
    expect(parseHeuristicsStore(null)).toEqual(emptyHeuristicsStore());
    expect(parseHeuristicsStore({ version: 99, entries: { x: {} } })).toEqual(
      emptyHeuristicsStore()
    );
    const key = makeHeuristicsKey("black", "Google-chrome", "focus-phase", "focus");
    expect(key).toBe("black|google-chrome|focus-phase|focus");
    const store = {
      version: HEURISTICS_SCHEMA_VERSION,
      entries: {
        [key]: {
          host: "black",
          class: "Google-chrome",
          processKind: "focus-phase",
          residualKind: "focus",
          latenciesMs: [800],
          trialCount: 2,
          zeroResidualCount: 1,
        },
      },
    };
    const text = serializeHeuristicsStore(store);
    expect(text).toContain('"version": 1');
    expect(text).not.toMatch(/Grok|YouTube|title/i);
    const again = parseHeuristicsStore(text);
    expect(again.entries[key].class).toBe("google-chrome");
    expect(again.entries[key].latenciesMs).toEqual([800]);
  });

  it("first-ever uses learning trial; learned uses settle-math floor", () => {
    const store = emptyHeuristicsStore();
    const key = makeHeuristicsKey("h", "term", "focus-phase", "focus");
    expect(softTimeoutForKey(store, key, "focus")).toBe(6000);
    store.entries[key] = {
      host: "h",
      class: "term",
      processKind: "focus-phase",
      residualKind: "focus",
      latenciesMs: [200],
      trialCount: 3,
      zeroResidualCount: 1,
    };
    expect(softTimeoutForKey(store, key, "focus")).toBe(400);
    expect(resolveFocusSoftTimeoutMs(store, { host: "h", wmClasses: ["term"] })).toBe(400);
    expect(softFocusWallMs(400)).toBe(3000);
    expect(softFocusWallMs(10_000)).toBe(15000);
  });

  it("session records residuals and serializes on flush", () => {
    let written = null;
    const session = new HeuristicsMemorySession({
      read: () => null,
      write: (text) => {
        written = text;
      },
    });
    recordSoftFocusHeuristics(session, {
      host: "h",
      wmClasses: ["Term"],
      residuals: [{ latencyMs: 250 }],
      softSettled: true,
    });
    expect(session.flush()).toEqual({ persist: "ok" });
    expect(written).toContain("h|term|focus-phase|focus");
    expect(written).toContain("250");
  });

  it("does not learn residuals when soft did not settle", () => {
    let written = null;
    const session = new HeuristicsMemorySession({
      read: () => null,
      write: (text) => {
        written = text;
      },
    });
    recordSoftFocusHeuristics(session, {
      host: "h",
      wmClasses: ["Term"],
      residuals: [{ latencyMs: 3002 }],
      softSettled: false,
    });
    expect(session.dirty).toBe(false);
    expect(session.flush().persist).toBe("skipped");
    expect(written).toBeNull();
  });
});

describe("waitHardReadyOnSignals", () => {
  it("does not export a GetTree poll twin", async () => {
    const settle = await import("../../../lib/extension/layout-apply-settle.js");
    expect(settle.wait_until_hard_ready).toBeUndefined();
    expect(typeof settle.waitHardReadyOnSignals).toBe("function");
  });

  it("already TILE → done without scheduling a poll loop", () => {
    const done = [];
    const t = timerBag();
    waitHardReadyOnSignals(
      ["1"],
      {
        loadWindows: () => [tileWin("1")],
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        timeoutMs: HARD_TIMEOUT_MS,
      },
      (out) => done.push(out)
    );
    expect(done[0].ok).toBe(true);
    expect(done[0].settled).toEqual(["1"]);
    expect(t.timers).toHaveLength(0);
  });

  it("wakes on injected TILE/rect/mon event (one timeout timer)", () => {
    const wins = [{ windowId: "1", mode: "FLOAT", monitor: 0, rect: { width: 10, height: 10 } }];
    let listener = null;
    const done = [];
    const t = timerBag();
    waitHardReadyOnSignals(
      ["1"],
      {
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 10,
        timeoutMs: HARD_TIMEOUT_MS,
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0].ms).toBe(HARD_TIMEOUT_MS);
    wins[0] = tileWin("1");
    listener();
    expect(done[0].ok).toBe(true);
    expect(listener).toBeNull();
    expect(t.timers).toHaveLength(0);
  });

  it("hard timeout continues with pending (no throw)", () => {
    const done = [];
    const t = timerBag();
    waitHardReadyOnSignals(
      ["9"],
      {
        loadWindows: () => [{ windowId: "9", mode: "FLOAT" }],
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        timeoutMs: 50,
      },
      (out) => done.push(out)
    );
    t.fireMs(50);
    expect(done[0].ok).toBe(false);
    expect(done[0].timedOut).toBe(true);
    expect(done[0].pending).toEqual(["9"]);
  });

  it("empty ids skip", () => {
    const done = [];
    waitHardReadyOnSignals([], { nowMs: () => 0 }, (out) => done.push(out));
    expect(done[0]).toMatchObject({ ok: true, skipped: true });
  });
});

describe("runSoftFocusBarrierOnSignals", () => {
  it("quiet with no residual → settled", () => {
    const done = [];
    const t = timerBag();
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => [],
        applyCorrect: () => {
          throw new Error("should not correct");
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        softTimeoutMs: 150,
        maxWallMs: 5000,
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    t.fireMs(150);
    expect(done[0].ok).toBe(true);
    expect(done[0].softSettled).toBe(true);
    expect(done[0].corrections).toBe(0);
    expect(done[0].residuals).toEqual([]);
  });

  it("steal → pin restore + correct + reset quiet", () => {
    let steal = true;
    const pin = { n: 0 };
    const corrects = [];
    const done = [];
    const t = timerBag();
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => (steal ? [{ op: "focus", selector: "id:1" }] : []),
        applyCorrect: (needed) => {
          corrects.push(needed.length);
          steal = false;
        },
        restorePin: () => {
          pin.n += 1;
          return true;
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        softTimeoutMs: 100,
        maxWallMs: 5000,
      },
      (out) => done.push(out)
    );
    expect(pin.n).toBe(1);
    expect(corrects).toEqual([1]);
    t.fireMs(100);
    expect(done[0].ok).toBe(true);
    expect(done[0].corrections).toBe(1);
    expect(done[0].residuals).toHaveLength(1);
  });

  it("focus event during quiet re-checks", () => {
    let listener = null;
    let steal = false;
    const done = [];
    const t = timerBag();
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => (steal ? [{ op: "focus", selector: "id:2" }] : []),
        applyCorrect: () => {
          steal = false;
        },
        onFocusEvent: (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        softTimeoutMs: 80,
        maxWallMs: 1000,
      },
      (out) => done.push(out)
    );
    steal = true;
    listener();
    t.fireMs(80);
    expect(done[0].corrections).toBe(1);
    expect(done[0].softSettled).toBe(true);
  });

  it("quiet-expiry correction does not record softMs as residual latency", () => {
    let pending = false;
    let corrects = 0;
    const done = [];
    const t = timerBag();
    let now = 0;
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => (pending ? [{ op: "focus", selector: "id:9" }] : []),
        applyCorrect: () => {
          corrects += 1;
          pending = false;
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => now,
        softTimeoutMs: 3000,
        maxWallMs: 9000,
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    expect(corrects).toBe(0);
    pending = true;
    now = 3000;
    t.fireMs(3000);
    expect(corrects).toBe(1);
    now = 6000;
    t.fireMs(3000);
    expect(done[0].ok).toBe(true);
    expect(done[0].softSettled).toBe(true);
    expect(done[0].corrections).toBe(1);
    expect(done[0].residuals).toEqual([]);
  });

  it("sync reentry from applyCorrect does not burn max corrections", () => {
    let listener = null;
    let corrects = 0;
    const done = [];
    const t = timerBag();
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => [{ op: "focus", selector: "id:1" }],
        applyCorrect: () => {
          corrects += 1;
          // Meta focus signals often fire while reveal is still in-stack.
          if (typeof listener === "function") listener();
        },
        onFocusEvent: (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        softTimeoutMs: 50,
        maxWallMs: 5000,
        maxCorrections: 32,
      },
      (out) => done.push(out)
    );
    // One correct on start; nested ticks ignored; quiet then re-check once more.
    expect(corrects).toBe(1);
    expect(done).toHaveLength(0);
    t.fireMs(50);
    expect(corrects).toBe(2);
    expect(done).toHaveLength(0);
    // Still needed after second correct → another quiet cycle (not 32).
    t.fireMs(50);
    expect(corrects).toBe(3);
    expect(done).toHaveLength(0);
  });
});

describe("verifyFocusOnce + waitTreeFingerprintQuietOnSignals", () => {
  it("corrects at most once", () => {
    const n = { c: 0 };
    const forest = {
      focusWindowId: 1,
      monitors: [
        {
          children: [
            {
              layout: "TABBED",
              lastTabFocusId: 1,
              children: [
                { nodeType: "WINDOW", windowId: 1 },
                { nodeType: "WINDOW", windowId: 2 },
              ],
            },
          ],
        },
      ],
    };
    const acts = [{ op: "focus", selector: "id:2", reason: "active" }];
    const v = verifyFocusOnce({
      forest,
      focusActions: acts,
      applyCorrect: () => {
        n.c += 1;
      },
    });
    expect(v).toMatchObject({ ok: true, corrected: true, neededCount: 1, skipped: false });
    expect(n.c).toBe(1);
    expect(
      verifyFocusOnce({
        forest: {
          ...forest,
          monitors: [
            {
              children: [
                {
                  layout: "TABBED",
                  lastTabFocusId: 2,
                  children: forest.monitors[0].children[0].children,
                },
              ],
            },
          ],
        },
        focusActions: acts,
        applyCorrect: () => {
          n.c += 1;
        },
      }).skipped
    ).toBe(true);
    expect(n.c).toBe(1);
  });

  it("LF6 fingerprint quiet is signal-driven (opt-in helper)", () => {
    const wins = [tileWin(1)];
    let listener = null;
    const done = [];
    const t = timerBag();
    waitTreeFingerprintQuietOnSignals(
      {
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        schedule: t.schedule,
        cancel: t.cancel,
        nowMs: () => 0,
        samples: 3,
        timeoutMs: 7000,
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    listener();
    listener();
    expect(done[0]).toMatchObject({ ok: true, stable: true, samples: 3 });
  });
});

describe("matchRequiredTileSlots forest-match (wrong mon / flat mon1)", () => {
  it("wrong-mon-clean fails required forest match (not belt repair)", () => {
    const d = loadExpected("wrong-mon-clean");
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
      rolePins: { "ghostty-right": 201, youtube: 202 },
    });
    expect(match.ok).toBe(false);
    expect(match.failed.length).toBeGreaterThan(0);
  });

  it("flat mon1 tabs without TABBED CON fails forest match", () => {
    // R013 residual class: mon1 tab roles flat as mon HSPLIT siblings.
    const d = loadExpected("perfect-clean");
    const forest = structuredClone(d.forest);
    const mon1 = (forest.monitors || []).find((m) => m.id === "mo1ws0");
    expect(mon1).toBeTruthy();
    mon1.children = [
      {
        nodeType: "WINDOW",
        windowId: 201,
        wmClass: "com.mitchellh.ghostty",
        title: "Ghostty",
        mode: "TILE",
        monitor: 1,
      },
      {
        nodeType: "WINDOW",
        windowId: 202,
        wmClass: "Google-chrome",
        title: "YouTube",
        mode: "TILE",
        monitor: 1,
      },
      {
        nodeType: "WINDOW",
        windowId: 203,
        wmClass: "Google-chrome",
        title: "Gmail - Inbox - Gmail",
        mode: "TILE",
        monitor: 1,
      },
      {
        nodeType: "WINDOW",
        windowId: 204,
        wmClass: "Google-chrome",
        title: "Google Voice - Messages",
        mode: "TILE",
        monitor: 1,
      },
    ];
    mon1.layout = "HSPLIT";
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest,
      flags: d.flags,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
    });
    expect(match.ok).toBe(false);
    expect(match.failed.length).toBeGreaterThan(0);
  });

  const PERFECT_PINS = {
    "chrome-luke": 101,
    grok: 102,
    "ghostty-left": 103,
    "ghostty-right": 201,
    youtube: 202,
    gmail: 203,
    voice: 204,
  };

  function wrapMonMax1(mon) {
    const kids = mon.children || [];
    mon.children = [
      {
        nodeType: "CON",
        layout: mon.layout || "HSPLIT",
        children: kids,
        percent: 1,
        userSized: false,
      },
    ];
  }

  it("MONITOR max-1 HSPLIT wrap still forest-matches (not nested-mon collapse)", () => {
    const d = loadExpected("perfect-clean");
    const forest = structuredClone(d.forest);
    for (const mon of forest.monitors || []) {
      if ((mon.children || []).length >= 2) wrapMonMax1(mon);
    }
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest,
      flags: d.flags,
      rolePins: PERFECT_PINS,
    });
    expect(match.ok).toBe(true);
    expect(match.failed).toEqual([]);
  });

  it("TABBED wrapping a TABBED CON fails forest-match (double tab chrome)", () => {
    const d = loadExpected("perfect-clean");
    const forest = structuredClone(d.forest);
    const mon1 = (forest.monitors || []).find((m) => m.id === "mo1ws0");
    expect(mon1).toBeTruthy();
    const ghost = mon1.children[0];
    const inner = mon1.children[1];
    mon1.children = [
      {
        nodeType: "CON",
        layout: "TABBED",
        percent: 1,
        userSized: false,
        children: [ghost, inner],
      },
    ];
    const match = matchRequiredTileSlots({
      profile: d.profile,
      forest,
      flags: d.flags,
      rolePins: PERFECT_PINS,
    });
    expect(match.ok).toBe(false);
    expect(match.failed.length).toBeGreaterThan(0);
  });
});

describe("collectHardReadyWindowIds", () => {
  it("pins + focus targets", () => {
    const ids = collectHardReadyWindowIds({
      rolePins: { a: 10, b: "11" },
      residualPlan: {
        actions: [
          { op: "focus", selector: "id:20" },
          { op: "move", role: "a" },
        ],
      },
      structureBuckets: { focus: [{ op: "focus", selector: "id:10" }] },
    });
    expect(ids).toEqual(["10", "11", "20"]);
  });

  it("wmClassesForWindowIds falls back to unknown", () => {
    expect(wmClassesForWindowIds([tileWin(1, { wmClass: "Term" })], [1])).toEqual(["term"]);
    expect(wmClassesForWindowIds([], [1])).toEqual(["unknown"]);
  });
});
