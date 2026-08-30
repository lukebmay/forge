import { describe, expect, it } from "vitest";
import { createHostBag } from "../../../lib/host/bag.js";
import {
  appendChild,
  createForest,
  floatsOf,
  makeCon,
  makeIdFactory,
  makeWindow,
  registerTree,
} from "../../../lib/tom/index.js";
import { moveWindowToFloats } from "../../../lib/tom/membership.js";
import { attachWorld } from "../../../lib/world/index.js";
import { projectForestFromTom } from "../../../lib/extension/forest-apply-snapshot.js";
import { collectWindows, planReconcile } from "../../../lib/shared/layout-plan.js";
import { portableWindowKeys } from "../../../lib/extension/tree-snapshot.js";
import { toPortableForest, createWindowResolver } from "../../../lib/extension/session-layout.js";

const GEOMS = [{ id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true }];

function seededForest() {
  const ids = makeIdFactory(1);
  const forest = createForest(GEOMS, () => ids.nid());
  attachWorld(forest, {
    geoms: {
      mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    },
  });
  const a = makeWindow(() => ids.nid(), "A", "AppA");
  const b = makeWindow(() => ids.nid(), "B", "AppB");
  registerTree(forest, a);
  registerTree(forest, b);
  const split = makeCon(() => ids.nid(), "HSPLIT", []);
  registerTree(forest, split);
  appendChild(forest, split, a);
  appendChild(forest, split, b);
  appendChild(forest, forest.monitors[0], split);
  a.percent = 0.5;
  b.percent = 0.5;
  forest.focusId = a.id;
  return { forest, a, b, ids };
}

describe("projectForestFromTom (C6 Apply IR)", () => {
  it("emits GetTree-shaped monitors with WINDOW.windowId = Forest nanoid", () => {
    const { forest, a, b } = seededForest();
    const bag = createHostBag();
    const metaA = {
      id: 101,
      get_id: () => 101,
      get_wm_class: () => "AppA",
      get_title: () => "A",
      get_pid: () => 1001,
      get_monitor: () => 0,
      get_frame_rect: () => ({ x: 0, y: 0, width: 960, height: 1080 }),
    };
    const metaB = {
      id: 202,
      get_id: () => 202,
      get_wm_class: () => "AppB",
      get_title: () => "B",
      get_pid: () => 1002,
      get_monitor: () => 0,
      get_frame_rect: () => ({ x: 960, y: 0, width: 960, height: 1080 }),
    };
    bag.set(a.id, { meta: metaA, windowId: "101" });
    bag.set(b.id, { meta: metaB, windowId: "202" });

    const snap = projectForestFromTom(forest, bag, {
      liveById: new Map([
        [a.id, { mode: "TILE", nodeValue: metaA }],
        [b.id, { mode: "TILE", nodeValue: metaB }],
      ]),
      workspace: 0,
    });

    expect(snap.apiVersion).toBe(1);
    expect(snap.monitors).toHaveLength(1);
    expect(snap.monitors[0].id).toBe("mo0ws0");
    expect(snap.monitors[0].nodeType).toBe("MONITOR");
    expect(snap.focusWindowId).toBe(a.id);

    const wins = collectWindows(snap);
    expect(wins.map((w) => w.windowId).sort()).toEqual([a.id, b.id].sort());
    const wa = wins.find((w) => w.windowId === a.id);
    expect(wa.wmClass).toBe("AppA");
    expect(wa.metaWindowId).toBe("101");
    expect(wa.mode).toBe("TILE");
    expect(wa.pid).toBe(1001);
    expect(wa.rect).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
  });

  it("puts FLOATS windows in orphanWindows with mode FLOAT", () => {
    const { forest, a, b } = seededForest();
    const bag = createHostBag();
    bag.set(a.id, { windowId: "1", floating: true });
    bag.set(b.id, { windowId: "2" });
    moveWindowToFloats(forest, a);

    const snap = projectForestFromTom(forest, bag, { workspace: 0 });
    const orphans = snap.orphanWindows || [];
    expect(orphans.some((w) => w.windowId === a.id && w.mode === "FLOAT")).toBe(true);
    const tiled = collectWindows(snap).filter((w) => w.windowId === b.id);
    expect(tiled).toHaveLength(1);
  });

  it("planReconcile accepts Forest→IR snapshot (adapter boundary)", () => {
    const { forest, a } = seededForest();
    const bag = createHostBag();
    bag.set(a.id, {
      meta: {
        get_id: () => 7,
        get_wm_class: () => "AppA",
        get_title: () => "A",
        get_pid: () => 9,
        get_monitor: () => 0,
      },
      windowId: "7",
    });
    const snap = projectForestFromTom(forest, bag, { workspace: 0 });
    const profile = {
      mode: "reconcile",
      layout: {
        mon0: {
          split: "hsplit",
          children: [{ id: "term", roles: ["term"] }],
        },
      },
      roles: [
        {
          id: "term",
          slot: "mon0.term",
          match: { class: "AppA" },
          open: { app: "appa" },
        },
      ],
      overflow: { slot: "mon0.term" },
    };
    const plan = planReconcile(profile, snap, { workspace: 0, clean: false });
    expect(plan.ok).not.toBe(false);
    const term = (plan.roles || []).find((r) => r.id === "term");
    expect(term?.windowId).toBe(a.id);
  });
});

describe("portable WINDOW key = nanoid (C6.4)", () => {
  it("portableWindowKeys prefers hostBag nanoid and keeps Meta as metaWindowId", () => {
    const bag = createHostBag();
    const meta = { get_id: () => 55, id: 55 };
    bag.set("nidABC", { meta, windowId: "55" });
    const keys = portableWindowKeys(meta, bag);
    expect(keys.windowId).toBe("nidABC");
    expect(keys.metaWindowId).toBe(55);
  });

  it("toPortableForest keeps nanoid id and metaWindowId match aid", () => {
    const live = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              kind: "WINDOW",
              windowId: "nanoLeaf1",
              metaWindowId: "88",
              percent: 1,
              userSized: false,
              wmClass: "X",
              title: "t",
              pid: 3,
              monitor: 0,
            },
          ],
        },
      ],
    };
    const portable = toPortableForest(live);
    expect(portable.monitors[0].children[0].id).toBe("nanoLeaf1");
    expect(portable.monitors[0].children[0].metaWindowId).toBe("88");
  });

  it("createWindowResolver matches metaWindowId before class heuristics", () => {
    const meta = {
      id: 88,
      get_id: () => 88,
      get_wm_class: () => "X",
      get_title: () => "other",
      get_pid: () => 3,
      get_monitor: () => 0,
      get_frame_rect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    };
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              kind: "WINDOW",
              id: "nanoLeaf1",
              metaWindowId: 88,
              wmClass: "X",
              title: "saved",
              pid: 3,
              monitor: 0,
              frame: { x: 0, y: 0, width: 100, height: 100 },
            },
          ],
        },
      ],
    };
    const resolve = createWindowResolver([meta], portable);
    const hit = resolve(portable.monitors[0].children[0]);
    expect(hit).toBe(meta);
  });
});

describe("FLOATS bag present for orphans", () => {
  it("floatsOf exists on seeded envelope", () => {
    const { forest } = seededForest();
    expect(floatsOf(forest)?.kind).toBe("FLOATS");
  });
});
