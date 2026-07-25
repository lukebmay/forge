import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SESSION_LAYOUT_VERSION,
  toPortableForest,
  toLiveForest,
  indexWindowsById,
  matchStats,
  isSessionLayoutFresh,
  isMatchGoodEnough,
  makeEnvelope,
  parseEnvelope,
  windowStableId,
  isPortableWindow,
  resolveStrictMonitor,
  planWindowMonitorHomes,
  createWindowResolver,
  matchStatsAgainstWindows,
  forestRichness,
  frameDistanceScore,
} from "../../../lib/extension/session-layout.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { createTreeFixture, getWorkspaceAndMonitor } from "../../mocks/helpers/index.js";
import { createMockWindow } from "../../mocks/helpers/mockWindow.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { Bin } from "../../mocks/gnome/St.js";

/**
 * Session layout: portable forest for disable→enable (install/update) survival.
 */
describe("session-layout pure helpers", () => {
  it("windowStableId prefers get_id()", () => {
    const w = createMockWindow({ id: 42 });
    expect(windowStableId(w)).toBe(42);
  });

  it("isSessionLayoutFresh rejects reboot (monotonic regression + old wall time)", () => {
    const env = makeEnvelope({ version: 1, monitors: [] }, 1_000_000, Date.now() - 86_400_000);
    expect(isSessionLayoutFresh(env, 500_000)).toBe(false);
  });

  it("isSessionLayoutFresh accepts mono mismatch when wall age is still fresh (CLI stamp)", () => {
    const env = makeEnvelope({ version: 1, monitors: [] }, 9_000_000_000, Date.now() - 1000);
    // GLib mono lower than Python mono stamp, but wall age ~1s.
    expect(isSessionLayoutFresh(env, 1_000_000)).toBe(true);
  });

  it("isSessionLayoutFresh rejects age beyond max", () => {
    const env = makeEnvelope({ version: 1, monitors: [] }, 0);
    const max = 60 * 1000 * 1000;
    expect(isSessionLayoutFresh(env, max + 1, max)).toBe(false);
    expect(isSessionLayoutFresh(env, max, max)).toBe(true);
  });

  it("isMatchGoodEnough requires half the windows", () => {
    expect(isMatchGoodEnough({ total: 4, matched: 2 })).toBe(true);
    expect(isMatchGoodEnough({ total: 4, matched: 1 })).toBe(false);
    expect(isMatchGoodEnough({ total: 0, matched: 0 })).toBe(false);
  });

  it("parseEnvelope rejects wrong kind/version", () => {
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope({ kind: "nope", sessionVersion: 1, forest: { monitors: [] } })).toBeNull();
    expect(
      parseEnvelope({
        kind: "forge-session-layout",
        sessionVersion: 999,
        savedMonotonicUs: 1,
        forest: { monitors: [] },
      })
    ).toBeNull();
  });

  it("parseEnvelope accepts a valid envelope", () => {
    const env = makeEnvelope(
      { version: 1, monitors: [{ id: "mo0ws0", layout: "HSPLIT", children: [] }] },
      123
    );
    const parsed = parseEnvelope(env);
    expect(parsed).toBeTruthy();
    expect(parsed.sessionVersion).toBe(SESSION_LAYOUT_VERSION);
  });
});

describe("session-layout portable round-trip", () => {
  let ctx;

  const dualGeoms = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  beforeEach(() => {
    ctx = createTreeFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: dualGeoms,
        },
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function createCon(parentValue, layout) {
    const con = ctx.tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  function flattenUnderMonitor(monitor, windows) {
    monitor.childNodes.length = 0;
    return windows.map((meta) => ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta));
  }

  it("toPortableForest → toLiveForest preserves multi-mon topology and lastTabFocus", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);

    mon0.layout = LAYOUT_TYPES.HSPLIT;
    const w0 = createMockWindow({
      id: 100,
      rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
    });
    const w1 = createMockWindow({
      id: 101,
      rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
    });
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w1);

    const tab = createCon(mon1.nodeValue, LAYOUT_TYPES.TABBED);
    const w2 = createMockWindow({ id: 200 });
    const w3 = createMockWindow({ id: 201 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w2);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w3);
    tab.lastTabFocus = w3;

    const snap = ctx.tree.snapshotTree();
    const portable = toPortableForest(snap);
    expect(portable).toBeTruthy();
    expect(portable.monitors.length).toBe(2);

    const flatIds = [];
    const walk = (d) => {
      if (isPortableWindow(d)) flatIds.push(d.id);
      else (d.children || []).forEach(walk);
    };
    portable.monitors.forEach((m) => (m.children || []).forEach(walk));
    expect(flatIds.sort((a, b) => a - b)).toEqual([100, 101, 200, 201]);

    const idMap = indexWindowsById([w0, w1, w2, w3]);
    const stats = matchStats(portable, idMap);
    expect(stats).toEqual({ total: 4, matched: 4 });
    expect(isMatchGoodEnough(stats)).toBe(true);

    // Simulate disable→enable: flat re-track, then restore portable→live
    flattenUnderMonitor(mon0, [w0, w1]);
    flattenUnderMonitor(mon1, [w2, w3]);
    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(0);

    const liveForest = toLiveForest(portable, idMap);
    ctx.tree.restoreTree(liveForest);

    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);
    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)[0];
    expect(tabbed.lastTabFocus).toBe(w3);
    expect(tabbed.childNodes.map((n) => n.nodeValue)).toEqual([w2, w3]);

    // mon0 stays HSPLIT with both windows (not piled elsewhere)
    expect(mon0.childNodes.map((n) => n.nodeValue)).toEqual([w0, w1]);
    expect(
      mon1.childNodes.some((n) => n.isStackedOrTabbed?.() || n.layout === LAYOUT_TYPES.TABBED)
    ).toBe(true);
  });

  it("drops closed windows and still restores survivors", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = createMockWindow({ id: 10 });
    const w1 = createMockWindow({ id: 11 });
    const w2 = createMockWindow({ id: 12 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w1);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w2);

    const portable = toPortableForest(ctx.tree.snapshotTree());
    // w2 closed during install
    const idMap = indexWindowsById([w0, w1]);
    const stats = matchStats(portable, idMap);
    expect(stats).toEqual({ total: 3, matched: 2 });
    expect(isMatchGoodEnough(stats)).toBe(true);

    flattenUnderMonitor(monitor, [w0, w1]);
    ctx.tree.restoreTree(toLiveForest(portable, idMap));

    // Two survivors in a tab group still form TABBED
    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(tabbed[0].childNodes.map((n) => n.nodeValue)).toEqual([w0, w1]);
  });

  it("envelope round-trips kind and monotonic stamp", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w0 = createMockWindow({ id: 1 });
    const w1 = createMockWindow({ id: 2 });
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w1);
    const portable = toPortableForest(ctx.tree.snapshotTree());
    const env = makeEnvelope(portable, 999_000);
    const parsed = parseEnvelope(JSON.parse(JSON.stringify(env)));
    expect(parsed.savedMonotonicUs).toBe(999_000);
    expect(isSessionLayoutFresh(parsed, 999_000 + 1000)).toBe(true);
  });

  it("resolveStrictMonitor prefers stableKey then id (not majority pile)", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    const ctxSnap = {
      findMonitor: (id) => (id === mon0.nodeValue ? mon0 : id === mon1.nodeValue ? mon1 : null),
      findMonitorByStableKey: (key) => (key === "conn:DP-2" ? mon1 : null),
    };
    expect(resolveStrictMonitor({ id: mon0.nodeValue, stableKey: "conn:DP-2" }, ctxSnap)).toBe(
      mon1
    );
    expect(resolveStrictMonitor({ id: mon0.nodeValue }, ctxSnap)).toBe(mon0);
  });

  it("planWindowMonitorHomes maps windows to mon index from id", () => {
    const live = {
      monitors: [
        {
          id: "mo0ws0",
          children: [{ window: { id: 1 }, percent: 0 }],
        },
        {
          id: "mo1ws0",
          children: [
            {
              layout: "TABBED",
              children: [
                { window: { id: 2 }, percent: 0 },
                { window: { id: 3 }, percent: 0 },
              ],
            },
          ],
        },
      ],
    };
    const homes = planWindowMonitorHomes(live);
    expect(homes.map((h) => [h.window.id, h.monIndex])).toEqual([
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
  });

  it("createWindowResolver matches by class+title when ids churn after HUP", () => {
    const wA = createMockWindow({
      id: 9991,
      wm_class: "Google-chrome",
      title: "Gmail - Inbox",
    });
    const wB = createMockWindow({
      id: 9992,
      wm_class: "com.mitchellh.ghostty",
      title: "term",
    });
    // Portable leaves still carry pre-HUP ids
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 111,
              wmClass: "Google-chrome",
              title: "Gmail - Inbox",
              percent: 0,
              userSized: false,
            },
            {
              id: 222,
              wmClass: "com.mitchellh.ghostty",
              title: "term",
              percent: 0,
              userSized: false,
            },
          ],
        },
      ],
    };
    const stats = matchStatsAgainstWindows(portable, [wA, wB]);
    expect(stats).toEqual({ total: 2, matched: 2 });
    const live = toLiveForest(portable, createWindowResolver([wA, wB]));
    expect(live.monitors[0].children.map((c) => c.window)).toEqual([wA, wB]);
  });

  it("matches two same-pid Ghosttys by frame distance after thrash pile", () => {
    // Real Ghostty: one process, many windows; titles churn; both piled on mon1.
    const leftLive = createMockWindow({
      id: 5001,
      pid: 4452,
      wm_class: "com.mitchellh.ghostty",
      title: "spinner left",
      monitor: 1,
      rect: new Rectangle({ x: 5212, y: 8, width: 2510, height: 2864 }),
    });
    const rightLive = createMockWindow({
      id: 5002,
      pid: 4452,
      wm_class: "com.mitchellh.ghostty",
      title: "spinner right",
      monitor: 1,
      rect: new Rectangle({ x: 7722, y: 8, width: 2510, height: 2864 }),
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 1,
              pid: 4452,
              wmClass: "com.mitchellh.ghostty",
              title: "old left",
              monitor: 0,
              frame: { x: 2602, y: 72, width: 2510, height: 2800 },
              percent: 0,
              userSized: false,
            },
          ],
        },
        {
          id: "mo1ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 2,
              pid: 4452,
              wmClass: "com.mitchellh.ghostty",
              title: "old right",
              monitor: 1,
              frame: { x: 5212, y: 8, width: 2510, height: 2864 },
              percent: 0,
              userSized: false,
            },
          ],
        },
      ],
    };
    expect(
      frameDistanceScore(portable.monitors[0].children[0].frame, leftLive._rect)
    ).toBeGreaterThan(frameDistanceScore(portable.monitors[0].children[0].frame, rightLive._rect));
    const live = toLiveForest(portable, createWindowResolver([leftLive, rightLive]));
    expect(live.monitors).toHaveLength(2);
    expect(live.monitors[0].children[0].window).toBe(leftLive);
    expect(live.monitors[1].children[0].window).toBe(rightLive);
  });

  it("createWindowResolver uses frame when pid missing and titles churn", () => {
    const left = createMockWindow({
      id: 6001,
      wm_class: "com.mitchellh.ghostty",
      title: "churn-a",
      monitor: 0,
      rect: new Rectangle({ x: 100, y: 50, width: 2400, height: 2700 }),
    });
    const right = createMockWindow({
      id: 6002,
      wm_class: "com.mitchellh.ghostty",
      title: "churn-b",
      monitor: 1,
      rect: new Rectangle({ x: 5200, y: 50, width: 2400, height: 2700 }),
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          children: [
            {
              id: 9,
              wmClass: "com.mitchellh.ghostty",
              title: "was-left",
              monitor: 0,
              frame: { x: 90, y: 40, width: 2500, height: 2800 },
            },
          ],
        },
        {
          id: "mo1ws0",
          children: [
            {
              id: 10,
              wmClass: "com.mitchellh.ghostty",
              title: "was-right",
              monitor: 1,
              frame: { x: 5100, y: 40, width: 2500, height: 2800 },
            },
          ],
        },
      ],
    };
    const live = toLiveForest(portable, createWindowResolver([left, right]));
    expect(live.monitors[0].children[0].window).toBe(left);
    expect(live.monitors[1].children[0].window).toBe(right);
  });

  it("forestRichness ranks dual-mon tabs above flat pile", () => {
    const flat = {
      monitors: [
        {
          id: "mo1ws0",
          children: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }],
        },
      ],
    };
    const rich = {
      monitors: [
        {
          id: "mo0ws0",
          children: [
            {
              layout: "TABBED",
              children: [{ id: 1 }, { id: 2 }],
            },
            { id: 3 },
          ],
        },
        {
          id: "mo1ws0",
          children: [
            { id: 4 },
            {
              layout: "TABBED",
              children: [{ id: 5 }, { id: 6 }, { id: 7 }],
            },
          ],
        },
      ],
    };
    expect(forestRichness(rich)).toBeGreaterThan(forestRichness(flat) + 5);
  });

  it("strict rehome then restore recovers dual-mon tabs from a pile-up", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);

    mon0.layout = LAYOUT_TYPES.HSPLIT;
    const w0 = createMockWindow({ id: 100, monitor: 0 });
    const w1 = createMockWindow({ id: 101, monitor: 0 });
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w1);

    const tab = createCon(mon1.nodeValue, LAYOUT_TYPES.TABBED);
    const w2 = createMockWindow({ id: 200, monitor: 1 });
    const w3 = createMockWindow({ id: 201, monitor: 1 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w2);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w3);

    const portable = toPortableForest(ctx.tree.snapshotTree());
    const idMap = indexWindowsById([w0, w1, w2, w3]);
    const liveForest = toLiveForest(portable, idMap);

    // Simulate post-HUP pile: all windows flat under mon1 (right).
    mon0.childNodes.length = 0;
    mon1.childNodes.length = 0;
    for (const w of [w0, w1, w2, w3]) {
      ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w);
      w._monitor = 1;
    }
    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(0);

    // Rehome like window.js: move to planned mons then strict apply
    const homes = planWindowMonitorHomes(liveForest);
    const snapCtx = ctx.tree._treeSnapshotCtx();
    for (const { window: metaWin, monId } of homes) {
      const mon = resolveStrictMonitor({ id: monId }, snapCtx);
      const node = ctx.tree.findNode(metaWin);
      if (mon && node && !mon.childNodes.includes(node)) {
        mon.appendChild(node);
      }
    }
    for (const monDesc of liveForest.monitors) {
      const mon = resolveStrictMonitor(monDesc, snapCtx);
      if (!mon) continue;
      // use tree.restoreTree one mon at a time via full restore after rehome
    }
    // After rehome windows sit under correct mons; restoreTree majority works
    ctx.tree.restoreTree(liveForest);

    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);
    expect(mon0.childNodes.map((n) => n.nodeValue)).toEqual([w0, w1]);
    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)[0];
    expect(tabbed.childNodes.map((n) => n.nodeValue)).toEqual([w2, w3]);
  });
});
