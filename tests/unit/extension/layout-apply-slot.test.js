/**
 * SM4 / D040: slot machines — parallel independent slots, group-as-one,
 * retry then hard-failed, late resume only while epoch is live.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SLOT_HARD_FIRST_WAIT_MS,
  SLOT_HARD_RETRY_N,
  SLOT_HARD_RETRY_WAIT_MS,
  SLOT_PLACE_ATTEMPTS,
  SLOT_STATE,
  applySlotEvent,
  canLateResumeSlot,
  collectSlotMachines,
  hardWaitMsForAttempt,
  isSlotTerminal,
  placeSlotWindows,
  remapSlotMachineWindowId,
  slotMachineKey,
  slotPlaceHollowSummary,
  startSlotMachines,
  syncSlotMachineRoleWindowIds,
} from "../../../lib/extension/layout-apply-slot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = join(__dirname, "../cli/fixtures/layout/expected");

function loadExpected(id) {
  return JSON.parse(readFileSync(join(EXPECTED, `${id}.json`), "utf8"));
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

function tileWin(id, extra = {}) {
  return {
    windowId: id,
    mode: "TILE",
    monitor: 0,
    rect: { x: 0, y: 0, width: 100, height: 80 },
    ...extra,
  };
}

describe("slot machine constants / stepper", () => {
  it("first wait 5s, retry 2s, N=2 extra (3 place attempts)", () => {
    expect(SLOT_HARD_FIRST_WAIT_MS).toBe(5000);
    expect(SLOT_HARD_RETRY_WAIT_MS).toBe(2000);
    expect(SLOT_HARD_RETRY_N).toBe(2);
    expect(SLOT_PLACE_ATTEMPTS).toBe(3);
    expect(hardWaitMsForAttempt(1)).toBe(5000);
    expect(hardWaitMsForAttempt(2)).toBe(2000);
    expect(hardWaitMsForAttempt(3)).toBe(2000);
  });

  it("open/map → place → hard wait → retry then hard-failed", () => {
    let m = { state: SLOT_STATE.OPEN, placeAttempts: 0 };
    m = applySlotEvent(m, { type: "mapped" });
    expect(m.state).toBe(SLOT_STATE.PLACE);
    m = applySlotEvent(m, { type: "placed", nowMs: 10 });
    expect(m.state).toBe(SLOT_STATE.HARD_WAIT);
    expect(m.placeAttempts).toBe(1);
    m = applySlotEvent(m, { type: "hard-timeout" });
    expect(m.state).toBe(SLOT_STATE.RETRY_PLACE);
    m = applySlotEvent(m, { type: "placed", nowMs: 20 });
    expect(m.placeAttempts).toBe(2);
    m = applySlotEvent(m, { type: "hard-timeout" });
    expect(m.state).toBe(SLOT_STATE.RETRY_PLACE);
    m = applySlotEvent(m, { type: "placed", nowMs: 30 });
    expect(m.placeAttempts).toBe(3);
    m = applySlotEvent(m, { type: "hard-timeout" });
    expect(m.state).toBe(SLOT_STATE.HARD_FAILED);
    expect(isSlotTerminal(m.state)).toBe(true);
  });

  it("late resume only while epoch is live", () => {
    const failed = { state: SLOT_STATE.HARD_FAILED, placeAttempts: 3 };
    expect(canLateResumeSlot(failed, true)).toBe(true);
    expect(canLateResumeSlot(failed, false)).toBe(false);
    expect(applySlotEvent(failed, { type: "late-meta", epochLive: false }).state).toBe(
      SLOT_STATE.HARD_FAILED
    );
    expect(applySlotEvent(failed, { type: "late-meta", epochLive: true }).state).toBe(
      SLOT_STATE.HARD_DONE
    );
    const ended = applySlotEvent(failed, { type: "epoch-end" });
    expect(ended.epochEnded).toBe(true);
    expect(canLateResumeSlot(ended, true)).toBe(false);
    expect(applySlotEvent(ended, { type: "late-meta", epochLive: true }).state).toBe(
      SLOT_STATE.HARD_FAILED
    );
  });
});

describe("collectSlotMachines", () => {
  it("TABBED/STACKED CON is one machine; TILE peers stay independent", () => {
    const d = loadExpected("perfect-clean");
    const run = {
      profile: d.profile,
      flags: d.flags,
      workspace: 0,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
    };
    const machines = collectSlotMachines(run, d.forest);
    expect(machines.length).toBe(4);
    const tab = machines.find((m) => m.key === "mon0.left-tab");
    expect(tab).toBeTruthy();
    expect(tab.kind).toBe("TABBED");
    expect(tab.windowIds.sort()).toEqual(["101", "102"]);
    const comms = machines.find((m) => m.key === "mon1.comms");
    expect(comms.kind).toBe("TABBED");
    expect(comms.windowIds.sort()).toEqual(["202", "203", "204"]);
    const terms = machines.filter((m) => m.kind === "TILE");
    expect(terms).toHaveLength(2);
    expect(terms.every((m) => m.windowIds.length === 1)).toBe(true);
    expect(slotMachineKey({ parentLayout: "TABBED", slot: "mon0.left-tab", windowId: 101 })).toBe(
      "mon0.left-tab"
    );
    expect(slotMachineKey({ windowId: 103, slot: "mon0.term" })).toBe("mon0.term");
    expect(terms.map((m) => m.key).sort()).toEqual(["mon0.term", "mon1.term"]);
  });
});

describe("late adopt remaps slot machine window id", () => {
  it("remapSlotMachineWindowId updates windowIds + slots map", () => {
    const machine = {
      key: "mon0.s0.YouTube",
      id: "mon0.s0.YouTube",
      kind: "TILE",
      roles: ["YouTube"],
      windowIds: ["858367299"],
      slots: {
        858367299: {
          windowId: "858367299",
          role: "YouTube",
          slot: "mon0.s0.YouTube",
          monitor: 0,
        },
      },
    };
    expect(remapSlotMachineWindowId(machine, "858367299", "858367307")).toBe(true);
    expect(machine.windowIds).toEqual(["858367307"]);
    expect(machine.slots["858367299"]).toBeUndefined();
    expect(machine.slots["858367307"].role).toBe("YouTube");
    expect(machine.slots["858367307"].windowId).toBe("858367307");
  });

  it("syncSlotMachineRoleWindowIds remaps TILE role after late adopt", () => {
    const machine = {
      key: "mon0.s0.ghostty",
      roles: ["ghostty"],
      windowIds: ["858367300"],
      slots: {
        858367300: {
          windowId: "858367300",
          role: "ghostty",
          slot: "mon0.s0.ghostty",
          monitor: 0,
        },
      },
    };
    expect(
      syncSlotMachineRoleWindowIds(
        machine,
        { ghostty: "858367308" },
        {
          858367308: {
            windowId: "858367308",
            role: "ghostty",
            slot: "mon0.s0.ghostty",
            monitor: 0,
          },
        }
      )
    ).toBe(true);
    expect(machine.windowIds).toEqual(["858367308"]);
    expect(machine.slots["858367308"].monitor).toBe(0);
  });

  it("startSlotMachines hard-wait tracks remapped id (not stale pre-adopt)", () => {
    const done = [];
    const timers = timerBag();
    let winCb = null;
    const wins = {
      stale: tileWin("299", { monitor: 1 }),
      live: tileWin("307", { monitor: 0 }),
    };
    const machine = {
      id: "mon0.s0.YouTube",
      key: "mon0.s0.YouTube",
      kind: "TILE",
      roles: ["YouTube"],
      windowIds: ["299"],
      slots: { 299: { windowId: "299", role: "YouTube", monitor: 0 } },
    };
    const session = startSlotMachines(
      [machine],
      {
        placeSlot: () => {},
        refreshMachineIds: (m) =>
          syncSlotMachineRoleWindowIds(
            m,
            { YouTube: "307" },
            {
              307: { windowId: "307", role: "YouTube", monitor: 0 },
            }
          ),
        loadWindows: () => [wins.stale, wins.live],
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
      },
      (out) => done.push(out)
    );
    expect(session.machines[0].windowIds).toEqual(["307"]);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
    expect(done[0].settled).toEqual(["307"]);
    expect(done[0].machines[0].windowIds).toEqual(["307"]);

    // Mid-wait remap: start on stale, adopt fires, then live settles.
    const done2 = [];
    const timers2 = timerBag();
    let winCb2 = null;
    let adopted = false;
    const m2 = {
      id: "mon0.s0.ghostty",
      key: "mon0.s0.ghostty",
      kind: "TILE",
      roles: ["ghostty"],
      windowIds: ["300"],
      slots: { 300: { windowId: "300", role: "ghostty", monitor: 0 } },
    };
    const live2 = {
      stale: tileWin("300", { monitor: 1 }),
      live: tileWin("308", { monitor: 0 }),
    };
    const session2 = startSlotMachines(
      [m2],
      {
        placeSlot: () => {},
        refreshMachineIds: (m) => {
          if (!adopted) return false;
          return syncSlotMachineRoleWindowIds(
            m,
            { ghostty: "308" },
            {
              308: { windowId: "308", role: "ghostty", monitor: 0 },
            }
          );
        },
        loadWindows: () => (adopted ? [live2.stale, live2.live] : [live2.stale]),
        onWindowEvent: (cb) => {
          winCb2 = cb;
          return () => {
            winCb2 = null;
          };
        },
        schedule: (ms, cb) => timers2.schedule(ms, cb),
        cancel: (id) => timers2.cancel(id),
      },
      (out) => done2.push(out)
    );
    expect(done2).toHaveLength(0);
    expect(session2.machines[0].windowIds).toEqual(["300"]);
    adopted = true;
    winCb2();
    expect(session2.machines[0].windowIds).toEqual(["308"]);
    expect(done2).toHaveLength(1);
    expect(done2[0].ok).toBe(true);
    expect(done2[0].settled).toEqual(["308"]);
    expect(winCb).toBeTruthy();
  });

  it("TAB peer hard-waits run in parallel (A done does not wait on B)", () => {
    const settled = [];
    const timers = timerBag();
    const wins = {
      a: tileWin("1"),
      b: tileWin("2", { mode: "FLOAT", rect: { width: 10, height: 10 } }),
    };
    const machine = {
      id: "mon0.tab",
      key: "mon0.tab",
      kind: "TABBED",
      roles: ["A", "B"],
      windowIds: ["1", "2"],
      slots: {
        1: { windowId: "1", role: "A", monitor: 0 },
        2: { windowId: "2", role: "B", monitor: 0 },
      },
    };
    const session = startSlotMachines(
      [machine],
      {
        placeSlot: () => {},
        loadWindows: () => [wins.a, wins.b],
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
        onWindowSettled: (_m, id) => settled.push(id),
      },
      () => {}
    );
    expect(settled).toEqual(["1"]);
    expect(session.machines[0].windowSettle["1"]).toBe(SLOT_STATE.HARD_DONE);
    expect(session.machines[0].windowSettle["2"]).not.toBe(SLOT_STATE.HARD_DONE);
    expect(session.machines[0].state).not.toBe(SLOT_STATE.HARD_DONE);
  });
});

describe("placeSlotWindows (SM5: no mid-place focus)", () => {
  it("runs place/structure steps only — never focus", () => {
    const d = loadExpected("perfect-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    // Push open leaf off profile so plan may emit focus; place must still drop it.
    forest.monitors[0].children[0].lastTabFocusId = 101;
    const ran = [];
    const out = placeSlotWindows({
      profile: d.profile,
      forest,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
      flags: d.flags,
      machine: {
        key: "mon0.left-tab",
        roles: ["chrome-luke", "grok"],
        windowIds: ["101", "102"],
      },
      runSteps: (steps, ctx) => {
        ran.push({ ops: steps.map((s) => s.op), phase: ctx.phase });
        return { ok: true };
      },
      phase: "hard-ready",
    });
    expect(out.ok).toBe(true);
    const allowed = new Set(["move", "layout", "order"]);
    for (const batch of ran) {
      expect(batch.ops.every((op) => allowed.has(String(op).toLowerCase()))).toBe(true);
      expect(batch.ops.includes("focus")).toBe(false);
      expect(batch.phase).toBe("hard-ready");
    }
  });

  it("slotPlaceHollowSummary names mode/mon for machine windows", () => {
    const summary = slotPlaceHollowSummary(
      { windowIds: ["9", "8"] },
      {
        monitors: [
          {
            children: [
              { windowId: 9, mode: "FLOAT", monitor: 1 },
              { windowId: 8, mode: "TILE", monitor: 0 },
            ],
          },
        ],
      }
    );
    expect(summary).toContain("9:mode=FLOAT,mon=1");
    expect(summary).toContain("8:mode=TILE,mon=0");
  });

  it("unsettled hollow calls ensureMetaInSlot (not a twin plan)", () => {
    const d = loadExpected("perfect-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    const ensured = [];
    const out = placeSlotWindows({
      profile: d.profile,
      forest,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
      flags: d.flags,
      workspace: 0,
      unsettled: true,
      machine: {
        key: "mon0.inkscape",
        roles: ["chrome-luke"],
        windowIds: ["101"],
        slots: { 101: { windowId: "101", monitor: 0 } },
      },
      runSteps: () => {
        throw new Error("runSteps must not run on hollow ensure-meta path");
      },
      ensureMetaInSlot: (machine) => {
        ensured.push(machine.key);
        return { ok: true, steps: 2 };
      },
      phase: "hard-ready",
    });
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("ensure-meta");
    expect(out.steps).toBe(2);
    expect(ensured).toEqual(["mon0.inkscape"]);
  });

  it("R042: same-mon tab peer as MONITOR sibling runs ensure_layout (not hollow meta)", () => {
    // Host thrash: mon1 = ghostty | TABBED(YouTube,Gmail) | Voice — Voice should
    // join mon1.comms. Replan emits ensure_layout (0 moves); old hollow path only
    // called ensureMetaInSlot and left a 3-column desk.
    const d = loadExpected("perfect-clean");
    const forest = JSON.parse(JSON.stringify(d.forest));
    const mon1 = (forest.monitors || []).find((m) => m.id === "mo1ws0");
    expect(mon1).toBeTruthy();
    const tab = (mon1.children || []).find(
      (c) => c && c.nodeType === "CON" && String(c.layout).toUpperCase() === "TABBED"
    );
    expect(tab).toBeTruthy();
    const voice = (tab.children || []).find((c) => c && Number(c.windowId) === 204);
    expect(voice).toBeTruthy();
    tab.children = (tab.children || []).filter((c) => Number(c?.windowId) !== 204);
    mon1.children = [...(mon1.children || []), voice];

    const ran = [];
    const ensured = [];
    const out = placeSlotWindows({
      profile: d.profile,
      forest,
      rolePins: {
        "chrome-luke": 101,
        grok: 102,
        "ghostty-left": 103,
        "ghostty-right": 201,
        youtube: 202,
        gmail: 203,
        voice: 204,
      },
      flags: { ...d.flags, clean: false },
      workspace: 0,
      unsettled: true,
      machine: {
        key: "mon1.comms",
        roles: ["youtube", "gmail", "voice"],
        windowIds: ["202", "203", "204"],
        slots: {
          202: { windowId: "202", monitor: 1, parentLayout: "TABBED", parentType: "CON" },
          203: { windowId: "203", monitor: 1, parentLayout: "TABBED", parentType: "CON" },
          204: { windowId: "204", monitor: 1, parentLayout: "TABBED", parentType: "CON" },
        },
      },
      runSteps: (steps) => {
        ran.push(...steps);
        return { ok: true };
      },
      ensureMetaInSlot: (machine) => {
        ensured.push(machine.key);
        return { ok: true, steps: 3 };
      },
      phase: "hard-ready",
    });
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("structure");
    expect(ensured).toEqual([]);
    expect(ran.some((s) => String(s.op).toLowerCase() === "layout")).toBe(true);
    expect(
      ran.some(
        (s) =>
          String(s.op).toLowerCase() === "move" &&
          String(s.tile || "").includes("204") &&
          String(s.dest || "").startsWith("id:")
      )
    ).toBe(true);
  });
});

describe("startSlotMachines", () => {
  it("independent slots place in parallel (two first-wait clocks)", () => {
    const placed = [];
    const done = [];
    const timers = timerBag();
    const wins = {
      a: tileWin("a", { monitor: 1 }),
      b: tileWin("b", { monitor: 1 }),
    };
    startSlotMachines(
      [
        {
          id: "sa",
          key: "sa",
          kind: "TILE",
          windowIds: ["a"],
          slots: { a: { windowId: "a", monitor: 0 } },
        },
        {
          id: "sb",
          key: "sb",
          kind: "TILE",
          windowIds: ["b"],
          slots: { b: { windowId: "b", monitor: 0 } },
        },
      ],
      {
        placeSlot: (m) => {
          placed.push(m.id);
        },
        loadWindows: () => [wins.a, wins.b],
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
      },
      (out) => done.push(out)
    );
    expect(placed).toEqual(["sa", "sb"]);
    expect(timers.timers.filter((t) => t.ms === 5000)).toHaveLength(2);
    expect(done).toHaveLength(0);
    wins.a = tileWin("a", { monitor: 0 });
    wins.b = tileWin("b", { monitor: 0 });
    timers.fireMs(5000);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
    expect(done[0].settled.sort()).toEqual(["a", "b"]);
  });

  it("shared TABBED is one machine (one place, one wait)", () => {
    const placed = [];
    const done = [];
    const timers = timerBag();
    startSlotMachines(
      [
        {
          id: "mon0.left-tab",
          key: "mon0.left-tab",
          kind: "TABBED",
          windowIds: ["101", "102"],
          slots: {
            101: { windowId: "101", monitor: 0, parentLayout: "TABBED" },
            102: { windowId: "102", monitor: 0, parentLayout: "TABBED" },
          },
        },
      ],
      {
        placeSlot: (m) => {
          placed.push(m.windowIds.slice());
        },
        loadWindows: () => [
          tileWin("101", { parentLayout: "TABBED", parentType: "CON" }),
          tileWin("102", { parentLayout: "TABBED", parentType: "CON" }),
        ],
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
      },
      (out) => done.push(out)
    );
    expect(placed).toEqual([["101", "102"]]);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
    expect(done[0].machines).toHaveLength(1);
    expect(timers.timers.filter((t) => t.ms === 5000)).toHaveLength(0);
  });

  it("retry then hard-failed (3 place acts; first 5s then 2s×2)", () => {
    const placed = [];
    const done = [];
    const timers = timerBag();
    const session = startSlotMachines(
      [
        {
          id: "ghost",
          key: "mon0.term",
          kind: "TILE",
          windowIds: ["9"],
          slots: { 9: { windowId: "9", monitor: 1 } },
        },
      ],
      {
        placeSlot: (m) => {
          placed.push(m.key);
        },
        loadWindows: () => [tileWin("9", { monitor: 0 })],
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
      },
      (out) => done.push(out)
    );
    expect(placed).toHaveLength(1);
    expect(timers.timers.some((t) => t.ms === 5000)).toBe(true);
    timers.fireMs(5000);
    expect(placed).toHaveLength(2);
    expect(timers.timers.some((t) => t.ms === 2000)).toBe(true);
    timers.fireMs(2000);
    expect(placed).toHaveLength(3);
    timers.fireMs(2000);
    expect(placed).toHaveLength(3);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(false);
    expect(done[0].timedOut).toBe(true);
    expect(done[0].machines[0].state).toBe(SLOT_STATE.HARD_FAILED);
    expect(done[0].machines[0].placeAttempts).toBe(3);
    expect(session.machines[0].state).toBe(SLOT_STATE.HARD_FAILED);
  });

  it("late Meta after hard-failed resumes only if epoch still live", () => {
    const done = [];
    const timers = timerBag();
    let epochLive = true;
    let winCb = null;
    const wins = [tileWin("9", { monitor: 0 })];
    const session = startSlotMachines(
      [
        {
          id: "ghost",
          key: "mon0.term",
          kind: "TILE",
          windowIds: ["9"],
          slots: { 9: { windowId: "9", monitor: 1 } },
        },
      ],
      {
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
        isEpochLive: () => epochLive,
      },
      (out) => done.push(out)
    );
    timers.fireMs(5000);
    timers.fireMs(2000);
    timers.fireMs(2000);
    expect(done[0].machines[0].state).toBe(SLOT_STATE.HARD_FAILED);

    epochLive = false;
    wins[0] = tileWin("9", { monitor: 1 });
    winCb();
    expect(session.machines[0].state).toBe(SLOT_STATE.HARD_FAILED);

    epochLive = true;
    winCb();
    expect(session.machines[0].state).toBe(SLOT_STATE.HARD_DONE);
    expect(session.machines[0].lateResume).toBe(true);
  });

  it("no resume after dispose / epoch end", () => {
    const done = [];
    const timers = timerBag();
    let winCb = null;
    const wins = [tileWin("9", { monitor: 0 })];
    const session = startSlotMachines(
      [
        {
          id: "ghost",
          key: "mon0.term",
          windowIds: ["9"],
          slots: { 9: { windowId: "9", monitor: 1 } },
        },
      ],
      {
        loadWindows: () => wins,
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
        isEpochLive: () => true,
      },
      (out) => done.push(out)
    );
    timers.fireMs(5000);
    timers.fireMs(2000);
    timers.fireMs(2000);
    applySlotEvent(session.machines[0], { type: "epoch-end" });
    Object.assign(session.machines[0], applySlotEvent(session.machines[0], { type: "epoch-end" }));
    session.dispose();
    wins[0] = tileWin("9", { monitor: 1 });
    if (winCb) winCb();
    expect(session.machines[0].state).toBe(SLOT_STATE.HARD_FAILED);
  });

  it("open/map then place (does not place before map)", () => {
    const placed = [];
    const done = [];
    const timers = timerBag();
    let mapped = false;
    let winCb = null;
    startSlotMachines(
      [
        {
          id: "need-map",
          key: "mon0.term",
          kind: "TILE",
          windowIds: [],
          state: SLOT_STATE.OPEN,
          slots: {},
        },
      ],
      {
        placeSlot: (m) => {
          placed.push(m.id);
        },
        resolveWindowIds: (m) => {
          if (!mapped) return [];
          m.slots = { 7: { windowId: "7", monitor: 0 } };
          return ["7"];
        },
        loadWindows: () => (mapped ? [tileWin("7")] : []),
        onWindowEvent: (cb) => {
          winCb = cb;
          return () => {
            winCb = null;
          };
        },
        schedule: (ms, cb) => timers.schedule(ms, cb),
        cancel: (id) => timers.cancel(id),
      },
      (out) => done.push(out)
    );
    expect(placed).toEqual([]);
    expect(done).toHaveLength(0);
    mapped = true;
    winCb();
    expect(placed).toEqual(["need-map"]);
    expect(done).toHaveLength(1);
    expect(done[0].ok).toBe(true);
  });
});
