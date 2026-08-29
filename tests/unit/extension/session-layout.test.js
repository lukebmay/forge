import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  planLastGoodHomes,
  createWindowResolver,
  matchStatsAgainstWindows,
  forestRichness,
  frameDistanceScore,
  geometryMatchScore,
  assignByScore,
  syncLastTabFocusFromFocus,
  resolveFocusMetaForSessionSave,
} from "../../../lib/extension/session-layout.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createTreeFixture,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
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

  it("makeEnvelope stores focusWindowId for install/update refocus", () => {
    const env = makeEnvelope(
      { version: 1, monitors: [{ id: "mo0ws0", layout: "HSPLIT", children: [] }] },
      123,
      Date.now(),
      { focusWindowId: 42 }
    );
    expect(env.focusWindowId).toBe(42);
    const parsed = parseEnvelope(env);
    expect(parsed.focusWindowId).toBe(42);
  });

  it("makeEnvelope omits empty focusWindowId", () => {
    const env = makeEnvelope({ version: 1, monitors: [] }, 1, Date.now(), {
      focusWindowId: null,
    });
    expect(env.focusWindowId).toBeUndefined();
  });

  it("resolveFocusMetaForSessionSave prefers Mutter focus over LFT", () => {
    const chrome = { id: 10 };
    const grok = { id: 11 };
    const wm = {
      focusMetaWindow: chrome,
      lastFocusedWindow: { nodeValue: grok },
      lftMru: { globalHead: () => ({ nodeValue: grok }) },
    };
    expect(resolveFocusMetaForSessionSave(wm)).toBe(chrome);
  });

  it("resolveFocusMetaForSessionSave falls back to LFT when focus null", () => {
    const grok = { id: 11 };
    const wm = {
      focusMetaWindow: null,
      lastFocusedWindow: { nodeValue: grok },
    };
    expect(resolveFocusMetaForSessionSave(wm)).toBe(grok);
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

  it("syncLastTabFocusFromFocus keeps live open leaf when Mutter focus diverges (D018)", () => {
    // Voice steal: keyboard=Voice must not rewrite LTF=YouTube on session save.
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wYouTube = createMockWindow({ id: 1, title: "YouTube", wm_class: "Google-chrome" });
    const wVoice = createMockWindow({ id: 2, title: "Voice", wm_class: "Google-chrome" });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wYouTube);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wVoice);
    tab.lastTabFocus = wYouTube;

    expect(syncLastTabFocusFromFocus(ctx.tree, wVoice)).toBe(false);
    expect(tab.lastTabFocus).toBe(wYouTube);

    const portable = toPortableForest(ctx.tree.snapshotTree());
    const tabPortable = portable.monitors[0].children[0];
    expect(tabPortable.lastTabFocusId).toBe(1);
    const env = makeEnvelope(portable, 1, Date.now(), { focusWindowId: 2 });
    expect(env.focusWindowId).toBe(2);
    expect(env.forest.monitors[0].children[0].lastTabFocusId).toBe(1);
  });

  it("syncLastTabFocusFromFocus fills empty open leaf from focus", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wGrok = createMockWindow({ id: 1, title: "Grok", wm_class: "Google-chrome" });
    const wChrome = createMockWindow({ id: 2, title: "Docs", wm_class: "Google-chrome" });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wGrok);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wChrome);
    tab.lastTabFocus = null;

    expect(syncLastTabFocusFromFocus(ctx.tree, wChrome)).toBe(true);
    expect(tab.lastTabFocus).toBe(wChrome);
  });

  it("syncLastTabFocusFromFocus replaces dead open leaf not in group", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wLive = createMockWindow({ id: 1, title: "Live" });
    const wGone = createMockWindow({ id: 99, title: "Gone" });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wLive);
    tab.lastTabFocus = wGone;

    expect(syncLastTabFocusFromFocus(ctx.tree, wLive)).toBe(true);
    expect(tab.lastTabFocus).toBe(wLive);
  });

  it("syncLastTabFocusFromFocus is no-op when focus not in tree", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = createMockWindow({ id: 1 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w0);
    tab.lastTabFocus = w0;
    const orphan = createMockWindow({ id: 99 });
    expect(syncLastTabFocusFromFocus(ctx.tree, orphan)).toBe(false);
    expect(tab.lastTabFocus).toBe(w0);
  });

  it("toPortableForest on windowId-only epoch forest; toLiveForest emits kind + windowId", () => {
    const wA = createMockWindow({ id: 42, wm_class: "App", title: "Alpha" });
    const wB = createMockWindow({ id: 43, wm_class: "App", title: "Beta" });
    const epochForest = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            { kind: "WINDOW", windowId: "42", percent: 0.6, userSized: true },
            {
              kind: "CON",
              layout: "TABBED",
              percent: 0.4,
              userSized: false,
              lastTabFocusId: "43",
              children: [{ kind: "WINDOW", windowId: "43", percent: 1, userSized: false }],
            },
          ],
        },
      ],
    };
    const portable = toPortableForest(epochForest);
    const leafA = portable.monitors[0].children[0];
    expect(isPortableWindow(leafA)).toBe(true);
    expect(leafA.id).toBe("42");
    expect(leafA.percent).toBeCloseTo(0.6);
    expect(leafA.userSized).toBe(true);
    expect(leafA.window).toBeUndefined();
    const tabP = portable.monitors[0].children[1];
    expect(tabP.lastTabFocusId).toBe("43");
    expect(tabP.children[0].id).toBe("43");

    const live = toLiveForest(portable, createWindowResolver([wA, wB], portable));
    const liveA = live.monitors[0].children[0];
    expect(liveA.kind).toBe("WINDOW");
    expect(liveA.windowId).toBe("42");
    expect(liveA.window).toBe(wA);
    const liveTab = live.monitors[0].children[1];
    expect(liveTab.kind).toBe("CON");
    expect(liveTab.lastTabFocusId).toBe("43");
    expect(liveTab.lastTabFocus).toBe(wB);
    expect(liveTab.children[0].kind).toBe("WINDOW");
    expect(liveTab.children[0].windowId).toBe("43");
    expect(liveTab.children[0].window).toBe(wB);

    // On-disk leaves (`id`, no kind) must still parse.
    const oldDisk = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [{ id: 42, percent: 1, userSized: false }],
        },
      ],
    };
    expect(isPortableWindow(oldDisk.monitors[0].children[0])).toBe(true);
    const liveOld = toLiveForest(oldDisk, createWindowResolver([wA], oldDisk));
    expect(liveOld.monitors[0].children[0].kind).toBe("WINDOW");
    expect(liveOld.monitors[0].children[0].windowId).toBe("42");
    expect(liveOld.monitors[0].children[0].window).toBe(wA);
  });

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

  it("omits DING Desktop Icons from portable forest and renormalizes shares", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wChrome = createMockWindow({
      id: 1,
      wm_class: "google-chrome",
      title: "Grok",
    });
    const wGhostty = createMockWindow({
      id: 2,
      wm_class: "com.mitchellh.ghostty",
      title: "Ghostty",
    });
    const wDing = createMockWindow({
      id: 3,
      wm_class: "gjs",
      title: "Desktop Icons 1",
    });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wChrome);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wGhostty);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wDing);
    tab.percent = 0.5;
    tab.userSized = true;
    const ghosttyNode = ctx.tree.findNode(wGhostty);
    const dingNode = ctx.tree.findNode(wDing);
    ghosttyNode.percent = 1 / 3;
    ghosttyNode.userSized = true;
    dingNode.percent = 1 / 6;

    const portable = toPortableForest(ctx.tree.snapshotTree());
    const ids = [];
    const walk = (d) => {
      if (isPortableWindow(d)) ids.push(d.id);
      else (d.children || []).forEach(walk);
    };
    portable.monitors.forEach((m) => (m.children || []).forEach(walk));
    expect(ids.sort((a, b) => a - b)).toEqual([1, 2]);

    const monKids = portable.monitors[0].children;
    const sum = monKids.reduce((s, c) => s + (c.percent || 0), 0);
    expect(sum).toBeCloseTo(1, 6);

    // Poisoned on-disk leaf (old save) is dropped on toLiveForest too.
    const poisoned = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            { id: 1, percent: 0.5, userSized: true, wmClass: "google-chrome", title: "Grok" },
            {
              id: 2,
              percent: 1 / 3,
              userSized: true,
              wmClass: "com.mitchellh.ghostty",
              title: "Ghostty",
            },
            {
              id: 3,
              percent: 1 / 6,
              userSized: false,
              wmClass: "gjs",
              title: "Desktop Icons 1",
            },
          ],
        },
      ],
    };
    const live = toLiveForest(poisoned, indexWindowsById([wChrome, wGhostty, wDing]));
    expect(live.monitors[0].children).toHaveLength(2);
    const liveSum = live.monitors[0].children.reduce((s, c) => s + (c.percent || 0), 0);
    expect(liveSum).toBeCloseTo(1, 6);
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

  it("planLastGoodHomes seeds mon + frame from live leaves (toLiveForest preserves portable)", () => {
    const left = createMockWindow({
      id: 9101,
      pid: 4452,
      wm_class: "com.mitchellh.ghostty",
      title: "grok",
      monitor: 1,
    });
    const right = createMockWindow({
      id: 9102,
      pid: 4452,
      wm_class: "com.mitchellh.ghostty",
      title: " me",
      monitor: 1,
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          stableKey: "conn:DP-1",
          children: [
            {
              id: 1,
              pid: 4452,
              wmClass: "com.mitchellh.ghostty",
              title: "saved-left",
              monitor: 0,
              frame: { x: 100, y: 50, width: 2400, height: 2800 },
            },
          ],
        },
        {
          id: "mo1ws0",
          stableKey: "conn:DP-2",
          children: [
            {
              id: 2,
              pid: 4452,
              wmClass: "com.mitchellh.ghostty",
              title: "saved-right",
              monitor: 1,
              frame: { x: 5200, y: 50, width: 2500, height: 2800 },
            },
          ],
        },
      ],
    };
    const live = toLiveForest(portable, createWindowResolver([left, right], portable));
    const seeds = planLastGoodHomes(live);
    expect(seeds).toHaveLength(2);
    const byWin = new Map(seeds.map((s) => [s.window, s]));
    expect(byWin.get(left).monitorIndex).toBe(0);
    expect(byWin.get(left).frame).toEqual({ x: 100, y: 50, width: 2400, height: 2800 });
    expect(byWin.get(left).stableKey).toBe("conn:DP-1");
    expect(byWin.get(right).monitorIndex).toBe(1);
    expect(byWin.get(right).frame).toEqual({ x: 5200, y: 50, width: 2500, height: 2800 });
    expect(byWin.get(right).stableKey).toBe("conn:DP-2");
  });

  it("planLastGoodHomes can enrich from portableForest when live leaves lack frames", () => {
    const left = { id: "L" };
    const right = { id: "R" };
    const live = {
      monitors: [
        { id: "mo0ws0", children: [{ window: left, percent: 0 }] },
        { id: "mo1ws0", children: [{ window: right, percent: 0 }] },
      ],
    };
    // Without portable, frames null but mon from id still works.
    const bare = planLastGoodHomes(live);
    expect(bare.map((s) => [s.window.id, s.monitorIndex, s.frame])).toEqual([
      ["L", 0, null],
      ["R", 1, null],
    ]);

    // With portable + matching windows, frames fill in (via resolver on live wins).
    const leftWin = createMockWindow({
      id: 77,
      pid: 9,
      wm_class: "com.mitchellh.ghostty",
      title: "L",
      monitor: 1,
    });
    const rightWin = createMockWindow({
      id: 78,
      pid: 9,
      wm_class: "com.mitchellh.ghostty",
      title: "R",
      monitor: 1,
    });
    const liveMatched = {
      monitors: [
        { id: "mo0ws0", children: [{ window: leftWin, percent: 0 }] },
        { id: "mo1ws0", children: [{ window: rightWin, percent: 0 }] },
      ],
    };
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          children: [
            {
              id: 1,
              pid: 9,
              wmClass: "com.mitchellh.ghostty",
              title: "L",
              monitor: 0,
              frame: { x: 10, y: 20, width: 100, height: 200 },
            },
          ],
        },
        {
          id: "mo1ws0",
          children: [
            {
              id: 2,
              pid: 9,
              wmClass: "com.mitchellh.ghostty",
              title: "R",
              monitor: 1,
              frame: { x: 3000, y: 20, width: 100, height: 200 },
            },
          ],
        },
      ],
    };
    const enriched = planLastGoodHomes(liveMatched, portable);
    const byWin = new Map(enriched.map((s) => [s.window, s]));
    expect(byWin.get(leftWin).frame).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    expect(byWin.get(rightWin).frame).toEqual({ x: 3000, y: 20, width: 100, height: 200 });
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
    const live = toLiveForest(portable, createWindowResolver([wA, wB], portable));
    expect(live.monitors[0].children.map((c) => c.window)).toEqual([wA, wB]);
  });

  it("resolves focusWindowId / lastTabFocusId after Meta id churn (install HUP)", () => {
    // Pre-HUP ids 111/222; post-HUP live windows have new ids 9991/9992.
    const wFocus = createMockWindow({
      id: 9991,
      wm_class: "Google-chrome",
      title: "Grok",
    });
    const wOther = createMockWindow({
      id: 9992,
      wm_class: "Google-chrome",
      title: "Gmail",
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              layout: "TABBED",
              lastTabFocusId: 111,
              percent: 1,
              userSized: false,
              children: [
                {
                  id: 111,
                  wmClass: "Google-chrome",
                  title: "Grok",
                  percent: 0,
                  userSized: false,
                },
                {
                  id: 222,
                  wmClass: "Google-chrome",
                  title: "Gmail",
                  percent: 0,
                  userSized: false,
                },
              ],
            },
          ],
        },
      ],
    };
    const resolve = createWindowResolver([wFocus, wOther], portable);
    // Synthetic leaf must hit leafAssign (not byId — live ids differ).
    expect(resolve({ id: 111 })).toBe(wFocus);
    expect(resolve({ id: 222 })).toBe(wOther);
    expect(resolve({ id: "111" })).toBe(wFocus);
    const live = toLiveForest(portable, resolve);
    const tab = live.monitors[0].children[0];
    expect(tab.lastTabFocus).toBe(wFocus);
    expect(tab.children.map((c) => c.window)).toEqual([wFocus, wOther]);
  });

  it("preserves tab sibling order + open leaf when same-pid frames match (install HUP)", () => {
    // Chrome tabs: one pid, identical frames; ids churn; titles stay unique.
    // Live candidate order is reversed vs forest children — title match must win.
    const sameFrame = new Rectangle({ x: 100, y: 150, width: 2494, height: 2714 });
    const wGmail = createMockWindow({
      id: 8002,
      pid: 6139,
      wm_class: "Google-chrome",
      title: "Gmail - Inbox",
      monitor: 0,
      rect: sameFrame,
    });
    const wGrok = createMockWindow({
      id: 8001,
      pid: 6139,
      wm_class: "Google-chrome",
      title: "Grok - chat",
      monitor: 0,
      rect: sameFrame,
    });
    const wVoice = createMockWindow({
      id: 8003,
      pid: 6139,
      wm_class: "Google-chrome",
      title: "Google Voice",
      monitor: 0,
      rect: sameFrame,
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              layout: "TABBED",
              lastTabFocusId: 11,
              percent: 1,
              userSized: false,
              children: [
                {
                  id: 10,
                  pid: 6139,
                  wmClass: "Google-chrome",
                  title: "Grok - chat",
                  monitor: 0,
                  frame: { x: 100, y: 150, width: 2494, height: 2714 },
                  percent: 0,
                  userSized: false,
                },
                {
                  id: 11,
                  pid: 6139,
                  wmClass: "Google-chrome",
                  title: "Gmail - Inbox",
                  monitor: 0,
                  frame: { x: 100, y: 150, width: 2494, height: 2714 },
                  percent: 0,
                  userSized: false,
                },
                {
                  id: 12,
                  pid: 6139,
                  wmClass: "Google-chrome",
                  title: "Google Voice",
                  monitor: 0,
                  frame: { x: 100, y: 150, width: 2494, height: 2714 },
                  percent: 0,
                  userSized: false,
                },
              ],
            },
          ],
        },
      ],
    };
    // Candidates listed out of forest order intentionally.
    const resolve = createWindowResolver([wVoice, wGmail, wGrok], portable);
    const live = toLiveForest(portable, resolve);
    const tab = live.monitors[0].children[0];
    expect(tab.children.map((c) => c.window)).toEqual([wGrok, wGmail, wVoice]);
    expect(tab.lastTabFocus).toBe(wGmail);
  });

  it("preserves STACKED sibling order + open leaf after id churn", () => {
    const sameFrame = new Rectangle({ x: 200, y: 80, width: 2000, height: 2500 });
    const wA = createMockWindow({
      id: 9001,
      pid: 100,
      wm_class: "App",
      title: "Alpha",
      monitor: 0,
      rect: sameFrame,
    });
    const wB = createMockWindow({
      id: 9002,
      pid: 100,
      wm_class: "App",
      title: "Beta",
      monitor: 0,
      rect: sameFrame,
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              layout: "STACKED",
              lastTabFocusId: 2,
              percent: 1,
              userSized: false,
              children: [
                {
                  id: 1,
                  pid: 100,
                  wmClass: "App",
                  title: "Alpha",
                  monitor: 0,
                  frame: { x: 200, y: 80, width: 2000, height: 2500 },
                  percent: 0,
                  userSized: false,
                },
                {
                  id: 2,
                  pid: 100,
                  wmClass: "App",
                  title: "Beta",
                  monitor: 0,
                  frame: { x: 200, y: 80, width: 2000, height: 2500 },
                  percent: 0,
                  userSized: false,
                },
              ],
            },
          ],
        },
      ],
    };
    const resolve = createWindowResolver([wB, wA], portable);
    const live = toLiveForest(portable, resolve);
    const stack = live.monitors[0].children[0];
    expect(stack.layout).toBe("STACKED");
    expect(stack.children.map((c) => c.window)).toEqual([wA, wB]);
    expect(stack.lastTabFocus).toBe(wB);
  });

  it("matches two same-pid Ghosttys by frame distance after thrash pile (side-by-side)", () => {
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
    const stats = matchStatsAgainstWindows(portable, [leftLive, rightLive]);
    expect(stats).toEqual({ total: 2, matched: 2 });
    const live = toLiveForest(portable, createWindowResolver([leftLive, rightLive], portable));
    expect(live.monitors).toHaveLength(2);
    expect(live.monitors[0].children[0].window).toBe(leftLive);
    expect(live.monitors[1].children[0].window).toBe(rightLive);
  });

  it("matches both same-pid Ghosttys when thrash stacks identical frames", () => {
    // Greedy pickByGeometry returned null on score ties → both unmatched.
    const stackedRect = new Rectangle({ x: 5400, y: 10, width: 2500, height: 2800 });
    const a = createMockWindow({
      id: 7001,
      pid: 9001,
      wm_class: "com.mitchellh.ghostty",
      title: "churn-a",
      monitor: 1,
      rect: stackedRect,
    });
    const b = createMockWindow({
      id: 7002,
      pid: 9001,
      wm_class: "com.mitchellh.ghostty",
      title: "churn-b",
      monitor: 1,
      rect: new Rectangle({ x: 5400, y: 10, width: 2500, height: 2800 }),
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
              pid: 9001,
              wmClass: "com.mitchellh.ghostty",
              title: "old-left",
              monitor: 0,
              frame: { x: 2500, y: 50, width: 2500, height: 2800 },
            },
          ],
        },
        {
          id: "mo1ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 2,
              pid: 9001,
              wmClass: "com.mitchellh.ghostty",
              title: "old-right",
              monitor: 1,
              frame: { x: 5200, y: 50, width: 2500, height: 2800 },
            },
          ],
        },
      ],
    };
    const leaf0 = portable.monitors[0].children[0];
    const leaf1 = portable.monitors[1].children[0];
    // Scores tie across candidates for each leaf (identical live frames).
    expect(geometryMatchScore(leaf0, a)).toBe(geometryMatchScore(leaf0, b));
    expect(geometryMatchScore(leaf1, a)).toBe(geometryMatchScore(leaf1, b));

    const stats = matchStatsAgainstWindows(portable, [a, b]);
    expect(stats).toEqual({ total: 2, matched: 2 });
    const live = toLiveForest(portable, createWindowResolver([a, b], portable));
    expect(live.monitors).toHaveLength(2);
    const matched = new Set([
      live.monitors[0].children[0].window,
      live.monitors[1].children[0].window,
    ]);
    expect(matched.has(a)).toBe(true);
    expect(matched.has(b)).toBe(true);
    // Deterministic: walk order + stable x/y/id pairs lower id to earlier leaf when tied.
    expect(live.monitors[0].children[0].window).toBe(a);
    expect(live.monitors[1].children[0].window).toBe(b);
  });

  it("assignByScore prefers max total over greedy first-leaf pick", () => {
    // leaf0 slightly closer to candB; leaf1 much closer to candB — greedy leaf0→B is wrong.
    const leaves = [
      { id: "L0", frame: { x: 0, y: 0, width: 100, height: 100 } },
      { id: "L1", frame: { x: 1000, y: 0, width: 100, height: 100 } },
    ];
    const cA = createMockWindow({
      id: 1,
      rect: new Rectangle({ x: 50, y: 0, width: 100, height: 100 }),
    });
    const cB = createMockWindow({
      id: 2,
      rect: new Rectangle({ x: 980, y: 0, width: 100, height: 100 }),
    });
    const map = assignByScore(leaves, [cA, cB], geometryMatchScore);
    expect(map.get(leaves[0])).toBe(cA);
    expect(map.get(leaves[1])).toBe(cB);
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
    const live = toLiveForest(portable, createWindowResolver([left, right], portable));
    expect(live.monitors[0].children[0].window).toBe(left);
    expect(live.monitors[1].children[0].window).toBe(right);
  });

  it("rehome asserts Meta get_monitor after same-pid dual-mon thrash", () => {
    // Good layout: mo0 Ghostty | mo1 Ghostty (same pid), different frames.
    // Thrash: both flat under mon1, Meta mon=1, side-by-side pile.
    const leftGhost = createMockWindow({
      id: 8001,
      pid: 4242,
      wm_class: "com.mitchellh.ghostty",
      title: "live-left",
      monitor: 0,
      rect: new Rectangle({ x: 2600, y: 50, width: 2500, height: 2800 }),
    });
    const rightGhost = createMockWindow({
      id: 8002,
      pid: 4242,
      wm_class: "com.mitchellh.ghostty",
      title: "live-right",
      monitor: 1,
      rect: new Rectangle({ x: 5200, y: 50, width: 2500, height: 2800 }),
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 11,
              pid: 4242,
              wmClass: "com.mitchellh.ghostty",
              title: "saved-left",
              monitor: 0,
              frame: { x: 2600, y: 50, width: 2500, height: 2800 },
            },
          ],
        },
        {
          id: "mo1ws0",
          layout: "HSPLIT",
          children: [
            {
              id: 12,
              pid: 4242,
              wmClass: "com.mitchellh.ghostty",
              title: "saved-right",
              monitor: 1,
              frame: { x: 5200, y: 50, width: 2500, height: 2800 },
            },
          ],
        },
      ],
    };

    // Thrash: both piled on mon1 with distinct x (side-by-side).
    leftGhost._monitor = 1;
    rightGhost._monitor = 1;
    leftGhost._rect = new Rectangle({ x: 5300, y: 10, width: 2400, height: 2700 });
    rightGhost._rect = new Rectangle({ x: 7700, y: 10, width: 2400, height: 2700 });

    const resolve = createWindowResolver([leftGhost, rightGhost], portable);
    const liveForest = toLiveForest(portable, resolve);
    expect(liveForest.monitors).toHaveLength(2);
    expect(liveForest.monitors[0].children[0].window).toBe(leftGhost);
    expect(liveForest.monitors[1].children[0].window).toBe(rightGhost);

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.childNodes.length = 0;
    mon1.childNodes.length = 0;
    for (const w of [leftGhost, rightGhost]) {
      ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w);
    }

    // Mirror window.js _rehomeWindowsForSessionForest
    const homes = planWindowMonitorHomes(liveForest);
    const snapCtx = ctx.tree._treeSnapshotCtx();
    for (const { window: metaWin, monIndex, monId } of homes) {
      if (metaWin.get_monitor() !== monIndex) metaWin.move_to_monitor(monIndex);
      const node = ctx.tree.findNode(metaWin);
      const mon = resolveStrictMonitor({ id: monId }, snapCtx);
      if (mon && node && !mon.childNodes.includes(node)) mon.appendChild(node);
    }

    expect(leftGhost.get_monitor()).toBe(0);
    expect(rightGhost.get_monitor()).toBe(1);
    expect(mon0.childNodes.map((n) => n.nodeValue)).toEqual([leftGhost]);
    expect(mon1.childNodes.map((n) => n.nodeValue)).toEqual([rightGhost]);
  });

  it("rehome Meta mon after identical stacked thrash frames", () => {
    const a = createMockWindow({
      id: 8101,
      pid: 5151,
      wm_class: "com.mitchellh.ghostty",
      title: "a",
      monitor: 1,
      rect: new Rectangle({ x: 6000, y: 0, width: 2000, height: 2000 }),
    });
    const b = createMockWindow({
      id: 8102,
      pid: 5151,
      wm_class: "com.mitchellh.ghostty",
      title: "b",
      monitor: 1,
      rect: new Rectangle({ x: 6000, y: 0, width: 2000, height: 2000 }),
    });
    const portable = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          children: [
            {
              id: 1,
              pid: 5151,
              wmClass: "com.mitchellh.ghostty",
              title: "L",
              monitor: 0,
              frame: { x: 100, y: 0, width: 2000, height: 2000 },
            },
          ],
        },
        {
          id: "mo1ws0",
          children: [
            {
              id: 2,
              pid: 5151,
              wmClass: "com.mitchellh.ghostty",
              title: "R",
              monitor: 1,
              frame: { x: 5000, y: 0, width: 2000, height: 2000 },
            },
          ],
        },
      ],
    };
    const liveForest = toLiveForest(portable, createWindowResolver([a, b], portable));
    expect(liveForest.monitors).toHaveLength(2);
    const w0 = liveForest.monitors[0].children[0].window;
    const w1 = liveForest.monitors[1].children[0].window;
    expect(new Set([w0, w1])).toEqual(new Set([a, b]));

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.childNodes.length = 0;
    mon1.childNodes.length = 0;
    for (const w of [a, b]) ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w);

    for (const { window: metaWin, monIndex, monId } of planWindowMonitorHomes(liveForest)) {
      if (metaWin.get_monitor() !== monIndex) metaWin.move_to_monitor(monIndex);
      const node = ctx.tree.findNode(metaWin);
      const mon = resolveStrictMonitor({ id: monId }, ctx.tree._treeSnapshotCtx());
      if (mon && node && !mon.childNodes.includes(node)) mon.appendChild(node);
    }

    expect(w0.get_monitor()).toBe(0);
    expect(w1.get_monitor()).toBe(1);
    expect(mon0.childNodes.map((n) => n.nodeValue)).toEqual([w0]);
    expect(mon1.childNodes.map((n) => n.nodeValue)).toEqual([w1]);
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

describe("session-layout raise prefers focusWindowId over stale lastTab", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("activateSessionFocus / raiseAfterSessionRestore activates focusMeta last", () => {
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const ws = ctx.workspaces[0];
    const wGrok = createMockWindow({ id: 1, title: "Grok", workspace: ws });
    const wChrome = createMockWindow({ id: 2, title: "Docs", workspace: ws });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wGrok);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wChrome);
    // Stale open leaf (pre-SI1 bug): group thinks Grok is open while focus is Chrome.
    tab.lastTabFocus = wGrok;

    const focusChrome = vi.spyOn(wChrome, "focus");
    const raiseChrome = vi.spyOn(wChrome, "raise");
    const raiseGrok = vi.spyOn(wGrok, "raise");
    const awf = vi.spyOn(ws, "activate_with_focus");

    const liveForest = {
      monitors: [
        {
          id: monitor.nodeValue,
          layout: "HSPLIT",
          children: [
            {
              layout: "TABBED",
              lastTabFocus: wGrok,
              children: [{ window: wGrok }, { window: wChrome }],
            },
          ],
        },
      ],
    };

    wm._raiseAfterSessionRestore(liveForest, { focusMeta: wChrome });

    // Keyboard focus window becomes the open leaf (not stale Grok).
    expect(tab.lastTabFocus).toBe(wChrome);
    expect(awf).toHaveBeenCalledWith(wChrome, expect.anything());
    expect(focusChrome).toHaveBeenCalled();
    // Focus raise runs after group open-leaf raises (Grok then Chrome).
    const lastChromeRaise = raiseChrome.mock.invocationCallOrder.at(-1);
    const lastGrokRaise = raiseGrok.mock.invocationCallOrder.at(-1);
    expect(lastChromeRaise).toBeGreaterThan(lastGrokRaise);
  });
});
