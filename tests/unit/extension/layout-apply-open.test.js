/**
 * AL6: open-phase bag — LayoutBatch, chrome serialize, residual replan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LayoutApplyRunBag } from "../../../lib/extension/layout-apply-run.js";
import {
  applyOpenResultToRun,
  buildResidualPlan,
  startOpenPhase,
  waitPinsOnSignals,
} from "../../../lib/extension/layout-apply-open.js";
import { assignOpenRolePins } from "../../../lib/shared/layout-open.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = join(__dirname, "../cli/fixtures/layout/expected");

function loadExpected(id) {
  return JSON.parse(readFileSync(join(EXPECTED, `${id}.json`), "utf8"));
}

describe("waitPinsOnSignals", () => {
  it("assigns on first tick when windows already mapped", () => {
    const done = [];
    waitPinsOnSignals(
      [{ role: "a", wait_classes: ["A"] }],
      {
        usedIds: [],
        loadWindows: () => [{ windowId: 3, wmClass: "A", title: "A" }],
        admit: () => ({ ok: true }),
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
    expect(done[0].rolePins).toEqual({ a: 3 });
  });

  it("title wait then class leftover at timeout (no poll loop)", () => {
    const done = [];
    const timers = [];
    waitPinsOnSignals(
      [{ role: "Grok", wait_classes: ["Google-chrome"], title_contains: "Grok" }],
      {
        loadWindows: () => [
          { windowId: 9, wmClass: "Google-chrome", title: "New Tab - Google Chrome" },
        ],
        schedule: (ms, cb) => {
          timers.push({ ms, cb });
          return 1;
        },
        cancel: () => {
          timers.length = 0;
        },
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    expect(timers).toHaveLength(1);
    timers[0].cb();
    expect(done[0].ok).toBe(true);
    expect(done[0].rolePins).toEqual({ Grok: 9 });
  });

  it("fires on injected window events", () => {
    const wins = [];
    let listener = null;
    const done = [];
    waitPinsOnSignals(
      [{ role: "t", wait_classes: ["Term"] }],
      {
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        schedule: () => 1,
        cancel: () => {},
      },
      (out) => done.push(out)
    );
    expect(done).toHaveLength(0);
    wins.push({ windowId: 11, wmClass: "Term", title: "t" });
    listener();
    expect(done[0].rolePins).toEqual({ t: 11 });
    expect(listener).toBeNull();
  });
});

function phWin(id, role, slot) {
  return {
    nodeType: "WINDOW",
    windowId: id,
    wmClass: "forge-placeholder",
    placeholder: true,
    layoutRole: role,
    layoutSlot: slot,
  };
}

function emptyCleanPhForest() {
  return {
    monitors: [
      {
        nodeType: "MONITOR",
        id: "mo0ws0",
        children: [
          {
            nodeType: "CON",
            layout: "TABBED",
            children: [
              phWin("ph-chrome", "chrome-luke", "mon0.left-tab"),
              phWin("ph-grok", "grok", "mon0.left-tab"),
            ],
          },
          phWin("ph-gt-left", "ghostty-left", "mon0.term"),
        ],
      },
      {
        nodeType: "MONITOR",
        id: "mo1ws0",
        children: [
          phWin("ph-gt-right", "ghostty-right", "mon1.term"),
          {
            nodeType: "CON",
            layout: "TABBED",
            children: [
              phWin("ph-yt", "youtube", "mon1.comms"),
              phWin("ph-gmail", "gmail", "mon1.comms"),
              phWin("ph-voice", "voice", "mon1.comms"),
            ],
          },
        ],
      },
    ],
  };
}

describe("startOpenPhase", () => {
  function mockDeps(extra = {}) {
    const batch = { begin: 0, release: 0, end: 0, admit: 0 };
    const spawned = [];
    const placed = [];
    const windows = extra.windows || [];
    return {
      batch,
      spawned,
      placed,
      deps: {
        spawn: (fields, action) => {
          spawned.push({ app: fields.app, role: action.role, fields });
          return {
            ok: true,
            pid: 1000 + spawned.length,
            waitClasses: fields.wm_class ? [fields.wm_class] : null,
            acceptAnyNew: !fields.wm_class,
            timeoutMs: fields.timeout || 15000,
          };
        },
        placeNext: (opts) => {
          placed.push(opts);
          return { ok: true };
        },
        admit: () => {
          batch.admit += 1;
          return { ok: true, admitted: 0 };
        },
        loadWindows: () => windows,
        waitPins: (pending, _opts, done) => {
          const assigned = assignOpenRolePins(pending, windows, extra.used || new Set());
          done({
            ok: Object.keys(assigned).length === pending.length,
            rolePins: assigned,
            missing: pending.filter((p) => !(p.role in assigned)).map((p) => p.role),
          });
        },
        beginBatch: () => {
          batch.begin += 1;
          return { ok: true, depth: 1 };
        },
        releaseDeferred: () => {
          batch.release += 1;
          return { ok: true, released: 0 };
        },
        endBatch: () => {
          batch.end += 1;
          return { ok: true, depth: 0 };
        },
        snapshotForest: extra.snapshotForest || (() => extra.forest || { monitors: [] }),
        desiredForest: extra.desiredForest,
        census: () => extra.census || [],
        ...extra.deps,
      },
    };
  }

  it("begin → spawn/PlaceNext → release → end before residual", () => {
    const order = [];
    const windows = [{ windowId: 10, wmClass: "com.mitchellh.ghostty", title: "t" }];
    const { deps } = mockDeps({
      windows,
      forest: {
        monitors: [
          {
            nodeType: "MONITOR",
            id: "mo0ws0",
            children: [phWin("ph-gt-left", "ghostty-left", "mon0.term")],
          },
        ],
      },
      deps: {
        beginBatch: () => {
          order.push("begin");
          return { ok: true };
        },
        spawn: (fields, action) => {
          order.push(`spawn:${action.role}`);
          return { ok: true, waitClasses: ["com.mitchellh.ghostty"] };
        },
        placeNext: () => {
          order.push("place");
          return { ok: true };
        },
        releaseDeferred: () => {
          order.push("release");
          return { ok: true };
        },
        endBatch: () => {
          order.push("end");
          return { ok: true };
        },
        snapshotForest: () => {
          order.push("replan");
          return {
            monitors: [
              {
                nodeType: "MONITOR",
                id: "mo0ws0",
                children: [phWin("ph-gt-left", "ghostty-left", "mon0.term")],
              },
            ],
          };
        },
      },
    });
    const done = [];
    startOpenPhase({
      openActions: [
        {
          op: "open",
          role: "ghostty-left",
          slot: "mon0.term",
          open: { app: "ghostty", wmClass: "com.mitchellh.ghostty" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps,
      onComplete: (o) => done.push(o),
    });
    expect(done).toHaveLength(1);
    // snapshotForest once for R036 PH attach lookup, again for residual replan.
    expect(order).toEqual([
      "begin",
      "replan",
      "place",
      "spawn:ghostty-left",
      "release",
      "end",
      "replan",
    ]);
    expect(done[0].batch.ended).toBe(true);
  });

  it("PlaceNext attaches to layout PH id when skeleton PHs exist (R036)", () => {
    const placed = [];
    const phForest = {
      monitors: [
        {
          nodeType: "MONITOR",
          id: "mo0ws0",
          children: [
            {
              nodeType: "WINDOW",
              windowId: "forge-ph-term",
              wmClass: "forge-placeholder",
              placeholder: true,
              layoutRole: "ghostty-left",
              layoutSlot: "mon0.term",
            },
          ],
        },
      ],
    };
    startOpenPhase({
      openActions: [
        {
          op: "open",
          role: "ghostty-left",
          slot: "mon0.term",
          open: { app: "ghostty", wmClass: "com.mitchellh.ghostty" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps: {
        spawn: () => ({ ok: true, waitClasses: ["com.mitchellh.ghostty"] }),
        placeNext: (opts) => {
          placed.push(opts);
          return { ok: true };
        },
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        // First call during spawnOne (PH lookup); later residual replan.
        snapshotForest: () => phForest,
        waitPins: (pending, _opts, done) => {
          done({
            ok: true,
            rolePins: { "ghostty-left": 10 },
            missing: [],
          });
        },
      },
      onComplete: () => {},
    });
    expect(placed).toHaveLength(1);
    expect(placed[0].attachSelector).toBe("id:forge-ph-term");
    expect(placed[0].monitor).toBe(0);
    expect(placed[0].treePath).toBeUndefined();
  });

  it("fails the unit when dest is mon-root-only (no slot PH)", () => {
    const placed = [];
    const spawned = [];
    const done = [];
    startOpenPhase({
      openActions: [
        {
          op: "open",
          role: "ghostty-left",
          slot: "mon0.term",
          open: { app: "ghostty", wmClass: "com.mitchellh.ghostty" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps: {
        spawn: (_f, action) => {
          spawned.push(action.role);
          return { ok: true, waitClasses: ["com.mitchellh.ghostty"] };
        },
        placeNext: (opts) => {
          placed.push(opts);
          return { ok: true };
        },
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        snapshotForest: () => ({ monitors: [] }),
        waitPins: (_p, _o, d) => d({ ok: true, rolePins: {}, missing: [] }),
      },
      onComplete: (o) => done.push(o),
    });
    expect(placed).toHaveLength(0);
    expect(spawned).toHaveLength(0);
    expect(done[0].failures).toContain("ghostty-left");
    expect(done[0].opens[0].destKind).toBe("mon-root");
  });

  it("TABBED members PlaceNext the same CON/PH dest", () => {
    const placed = [];
    const tabForest = {
      monitors: [
        {
          nodeType: "MONITOR",
          id: "mo0ws0",
          children: [
            {
              nodeType: "CON",
              layout: "TABBED",
              children: [
                phWin("ph-chrome", "chrome-luke", "mon0.left-tab"),
                phWin("ph-grok", "grok", "mon0.left-tab"),
              ],
            },
          ],
        },
      ],
    };
    startOpenPhase({
      openActions: [
        {
          op: "open",
          role: "chrome-luke",
          slot: "mon0.left-tab",
          open: { app: "google-chrome", wmClass: "Google-chrome" },
        },
        {
          op: "open",
          role: "grok",
          slot: "mon0.left-tab",
          match: { "title~=": "Grok" },
          open: { app: "Grok", wmClass: "Google-chrome" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps: {
        spawn: () => ({ ok: true, waitClasses: ["Google-chrome"] }),
        placeNext: (opts) => {
          placed.push(opts);
          return { ok: true };
        },
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        snapshotForest: () => tabForest,
        waitPins: (pending, _o, d) =>
          d({
            ok: true,
            rolePins: Object.fromEntries(pending.map((p, i) => [p.role, 100 + i])),
            missing: [],
          }),
      },
      onComplete: () => {},
    });
    expect(placed).toHaveLength(2);
    expect(placed[0].attachSelector).toBe("id:ph-chrome");
    expect(placed[1].attachSelector).toBe("id:ph-chrome");
    expect(placed[0].treePath).toBeUndefined();
    expect(placed[1].treePath).toBeUndefined();
  });

  it("serializes chrome-family opens (no parallel Chrome+Grok)", () => {
    const windowsByTick = [
      [{ windowId: 101, wmClass: "Google-chrome", title: "Google Chrome" }],
      [
        { windowId: 101, wmClass: "Google-chrome", title: "Google Chrome" },
        { windowId: 102, wmClass: "Google-chrome", title: "Grok" },
      ],
    ];
    let tick = 0;
    const spawned = [];
    const waitCalls = [];
    startOpenPhase({
      openActions: [
        {
          op: "open",
          role: "chrome-luke",
          slot: "mon0",
          open: { app: "google-chrome", wmClass: "Google-chrome" },
        },
        {
          op: "open",
          role: "grok",
          slot: "mon0",
          match: { "title~=": "Grok" },
          open: { app: "Grok", wmClass: "Google-chrome" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps: {
        spawn: (_f, action) => {
          spawned.push(action.role);
          return { ok: true, waitClasses: ["Google-chrome"] };
        },
        placeNext: () => ({ ok: true }),
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        snapshotForest: () => ({
          monitors: [
            {
              nodeType: "MONITOR",
              id: "mo0ws0",
              children: [
                {
                  nodeType: "CON",
                  layout: "TABBED",
                  children: [
                    phWin("ph-chrome", "chrome-luke", "mon0"),
                    phWin("ph-grok", "grok", "mon0"),
                  ],
                },
              ],
            },
          ],
        }),
        waitPins: (pending, _opts, done) => {
          waitCalls.push(pending.map((p) => p.role));
          const wins = windowsByTick[Math.min(tick, windowsByTick.length - 1)];
          tick += 1;
          const assigned = assignOpenRolePins(pending, wins, new Set());
          done({
            ok: true,
            rolePins: assigned,
            missing: pending.filter((p) => !(p.role in assigned)).map((p) => p.role),
          });
        },
      },
      onComplete: () => {},
    });
    expect(spawned).toEqual(["chrome-luke", "grok"]);
    expect(waitCalls[0]).toEqual(["chrome-luke"]);
    expect(waitCalls.some((roles) => roles.includes("grok"))).toBe(true);
  });

  it("does not abort sibling spawns when one spawn fails", () => {
    const spawned = [];
    const done = [];
    startOpenPhase({
      openActions: [
        { op: "open", role: "bad", slot: "mon0", open: { app: "nope" } },
        {
          op: "open",
          role: "ghostty-left",
          slot: "mon0",
          open: { app: "ghostty", wmClass: "ghostty" },
        },
      ],
      profile: { version: 2, roles: [] },
      flags: { clean: true },
      deps: {
        spawn: (_f, action) => {
          spawned.push(action.role);
          if (action.role === "bad") return { ok: false, error: "boom" };
          return { ok: true, waitClasses: ["ghostty"] };
        },
        placeNext: () => ({ ok: true }),
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        snapshotForest: () => ({
          monitors: [
            {
              nodeType: "MONITOR",
              id: "mo0ws0",
              children: [phWin("ph-bad", "bad", "mon0"), phWin("ph-gt", "ghostty-left", "mon0")],
            },
          ],
        }),
        waitPins: (pending, _o, d) =>
          d({
            ok: true,
            rolePins: { "ghostty-left": 5 },
            missing: [],
          }),
      },
      onComplete: (o) => done.push(o),
    });
    expect(spawned).toEqual(["bad", "ghostty-left"]);
    expect(done[0].failures).toContain("bad");
    expect(done[0].rolePins["ghostty-left"]).toBe(5);
  });
});

describe("buildResidualPlan rolePins", () => {
  it("residual-replan-pins fixture plans without new opens", () => {
    const d = loadExpected("residual-replan-pins");
    const r = buildResidualPlan(d.profile, d.forest, d.flags, d.flags.rolePins);
    expect(r.ok).toBe(true);
    expect(r.openCount).toBe(0);
    expect(r.plan.actions.some((a) => a.op === "open")).toBe(false);
  });
});

describe("LayoutApplyRunBag open executor", () => {
  function bagWithOpen(structure, open, hooks = {}) {
    const queue = [];
    const bag = new LayoutApplyRunBag({
      phaseDelayMs: 0,
      structure,
      open,
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
    };
  }

  it("empty-clean: batch + residual pins; openDeferred false", () => {
    const d = loadExpected("empty-clean");
    const residual = loadExpected("residual-replan-pins");
    const batch = { begin: 0, release: 0, end: 0 };
    const spawned = [];
    const executed = [];
    const progress = [];
    const pinForest = structuredClone(residual.forest);
    const { bag, flushAll } = bagWithOpen(
      {
        snapshotForest: () => {
          if (spawned.length) return pinForest;
          return d.forest;
        },
        runSteps: (steps, ctx) => {
          executed.push({ phase: ctx.phase, ops: steps.map((s) => s.op) });
          return { ok: true };
        },
      },
      {
        spawn: (_f, action) => {
          spawned.push(action.role);
          return {
            ok: true,
            waitClasses: action.open?.wmClass ? [action.open.wmClass] : ["x"],
          };
        },
        placeNext: () => ({ ok: true }),
        beginBatch: () => {
          batch.begin += 1;
          return { ok: true };
        },
        releaseDeferred: () => {
          batch.release += 1;
          return { ok: true };
        },
        endBatch: () => {
          batch.end += 1;
          return { ok: true };
        },
        waitPins: (pending, _o, done) => {
          const pins = {};
          const map = residual.flags.rolePins;
          for (const p of pending) {
            if (map[p.role] != null) pins[p.role] = map[p.role];
          }
          done({ ok: true, rolePins: pins, missing: [] });
        },
        desiredForest: () => emptyCleanPhForest(),
        snapshotForest: () => pinForest,
      },
      { onProgress: (p) => progress.push(p) }
    );
    bag.start({ profile: d.profile, flags: d.flags, name: "_forge-test-empty" });
    flushAll();
    expect(bag.lastTerminal.terminal.ok).toBe(true);
    expect(bag.lastTerminal.terminal.result.openDeferred).toBe(false);
    expect(bag.lastTerminal.terminal.result.openCount).toBe(7);
    expect(bag.lastTerminal.terminal.result.openPinned).toBe(7);
    expect(spawned).toHaveLength(7);
    expect(batch.begin).toBe(1);
    expect(batch.release).toBe(1);
    expect(batch.end).toBe(1);
    expect(batch.end === 1 && batch.release === 1).toBe(true);
    expect(progress.some((p) => /chrome-family serialize/i.test(p.message || ""))).toBe(true);
    expect(progress.some((p) => /open deferred \(AL6\)/i.test(p.message || ""))).toBe(false);
    expect(executed.some((e) => e.phase === "skeleton")).toBe(true);
  });

  it("required-role miss after pin timeout fails the run (after residual)", () => {
    const d = loadExpected("empty-clean");
    const { bag, flushAll } = bagWithOpen(
      {
        snapshotForest: () => d.forest,
        runSteps: () => ({ ok: true }),
      },
      {
        spawn: () => ({ ok: true, waitClasses: ["Google-chrome"] }),
        placeNext: () => ({ ok: true }),
        beginBatch: () => ({ ok: true }),
        releaseDeferred: () => ({ ok: true }),
        endBatch: () => ({ ok: true }),
        waitPins: (pending, _o, done) =>
          done({
            ok: false,
            rolePins: {},
            missing: pending.map((p) => p.role),
          }),
        desiredForest: () => emptyCleanPhForest(),
        snapshotForest: () => d.forest,
      }
    );
    bag.start({ profile: d.profile, flags: d.flags, name: "_forge-test-empty" });
    flushAll();
    expect(bag.lastTerminal.terminal.ok).toBe(false);
    expect(bag.lastTerminal.terminal.phase).toBe("open");
    expect(String(bag.lastTerminal.terminal.error || "")).toMatch(/missing/i);
  });
});

describe("applyOpenResultToRun", () => {
  it("replaces buckets from residual plan", () => {
    const run = { executedSteps: [] };
    const residual = buildResidualPlan(
      loadExpected("residual-replan-pins").profile,
      loadExpected("residual-replan-pins").forest,
      loadExpected("residual-replan-pins").flags,
      loadExpected("residual-replan-pins").flags.rolePins
    );
    applyOpenResultToRun(run, {
      ok: true,
      rolePins: { grok: 102 },
      launched: 1,
      missing: [],
      residual,
      batch: { ended: true },
    });
    expect(run.openRan).toBe(true);
    expect(run.structureBuilt.openCount).toBe(0);
    expect(run.structureBuckets).toBeTruthy();
  });
});
