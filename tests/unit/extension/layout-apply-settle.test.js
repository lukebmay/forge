/**
 * AL7 / D019: hard-ready, soft residual, verify once, belt moves-only.
 * Signal-driven — not a GetTree poll twin of wait_until_hard_ready.
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
  beltActionsFromPlan,
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
  runBeltMovesOnly,
  runSoftFocusBarrierOnSignals,
  serializeHeuristicsStore,
  softFocusWallMs,
  softTimeoutForKey,
  verifyFocusOnce,
  waitHardReadyOnSignals,
  waitTreeFingerprintQuietOnSignals,
  windowIsSettled,
  withoutFocusActions,
  hardReadyStatus,
  wmClassesForWindowIds,
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

describe("beltActionsFromPlan / applyFocusSteps", () => {
  const actions = [
    { op: "ensure_layout", slot: "mon0.s0", mode: "tabbed", windowIds: [10, 20] },
    { op: "ensure_order", slot: "mon0", mode: "hsplit", windowIds: [1, 2] },
    { op: "move", role: "Grok", windowId: 20, slot: "mon0.s0" },
    { op: "move", role: "other", windowId: 99, slot: "mon1.x" },
    { op: "focus", selector: "id:20", role: "Grok", reason: "active" },
    { op: "focus", selector: "id:1", role: "ghostty", reason: "profile" },
    { op: "park", windowId: 5, slot: "mon1" },
    { op: "bind", windowId: 20, layoutRole: "Grok" },
  ];

  it("D014: pin-role moves only (no structure / focus)", () => {
    const belt = beltActionsFromPlan(actions, { Grok: 20 });
    expect(belt.map((a) => a.op)).toEqual(["move"]);
    expect(belt[0].role).toBe("Grok");
    expect(
      belt.some((a) => ["park", "bind", "focus", "ensure_layout", "ensure_order"].includes(a.op))
    ).toBe(false);
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

describe("runBeltMovesOnly", () => {
  it("wrong-mon pins → move steps only", () => {
    const d = loadExpected("wrong-mon-clean");
    const ran = [];
    const out = runBeltMovesOnly({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
      rolePins: { "ghostty-right": 201, youtube: 202 },
      runSteps: (steps, ctx) => {
        ran.push({ ops: steps.map((s) => s.op), phase: ctx.phase });
        return { ok: true };
      },
    });
    expect(out.ok).toBe(true);
    if (!out.skipped) {
      expect(ran[0].ops.every((op) => op === "move")).toBe(true);
      expect(ran[0].phase).toBe("verify");
      expect(out.steps).toBeGreaterThan(0);
    }
  });

  it("no pins → skip", () => {
    const d = loadExpected("perfect-clean");
    const out = runBeltMovesOnly({
      profile: d.profile,
      forest: d.forest,
      flags: d.flags,
      rolePins: {},
      runSteps: () => ({ ok: true }),
    });
    expect(out).toMatchObject({ ok: true, skipped: true, reason: "no-pins" });
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
