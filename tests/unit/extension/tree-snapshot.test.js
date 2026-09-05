import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SNAPSHOT_VERSION,
  captureNode,
  captureMonitor,
  collectWindows,
  rebuildNode,
  monitorTopologyMatches,
  renormalizeChildPercents,
  hasAncestor,
  isWindowDescriptor,
  extractOuterLayoutGroups,
  resolveTargetMonitor,
  applyMonitorSnapshot,
  restoreForestIfNeeded,
} from "../../../lib/extension/tree-snapshot.js";
import { buildLiveMap } from "../../../lib/extension/monitor-identity.js";
import { Node, NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { treeSnapshotCtx } from "../../../lib/extension/tree-api-present.js";
import { appendChild } from "../../../lib/tom/index.js";
import { forestRemoveWindow, seedLiveForest } from "../../../lib/extension/tom-live.js";
import {
  createTreeFixture,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { createMockWindow } from "../../mocks/helpers/mockWindow.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { Bin } from "../../mocks/gnome/St.js";

/**
 * T6: full in-memory tree snapshot — pure helpers + Tree-backed round-trip.
 */
describe("tree-snapshot pure helpers", () => {
  it("isWindowDescriptor detects window leaves", () => {
    expect(isWindowDescriptor({ window: {} })).toBe(true);
    expect(isWindowDescriptor({ layout: "HSPLIT", children: [] })).toBe(false);
  });

  it("renormalizeChildPercents scales userSized ratios", () => {
    const kids = [
      { percent: 0.6, userSized: true },
      { percent: 0.4, userSized: true },
    ];
    // Drop a third (simulate collapse) — remaining already sum to 1.
    renormalizeChildPercents(kids);
    expect(kids[0].percent).toBeCloseTo(0.6);
    expect(kids[1].percent).toBeCloseTo(0.4);
  });

  it("renormalizeChildPercents equalizes when a non-userSized sibling has zero share", () => {
    // Session-layout after bad collapse: ghostty percent=1, tabs percent=0.
    const kids = [
      { percent: 1, userSized: false },
      { percent: 0, userSized: false },
    ];
    renormalizeChildPercents(kids);
    expect(kids.map((k) => k.percent)).toEqual([0, 0]);
  });

  it("renormalizeChildPercents equalizes when no weight and not userSized", () => {
    const kids = [
      { percent: 0, userSized: false },
      { percent: 0, userSized: false },
    ];
    renormalizeChildPercents(kids);
    expect(kids.every((k) => k.percent === 0 && !k.userSized)).toBe(true);
  });

  it("renormalizeChildPercents reweights after a missing sibling", () => {
    const kids = [
      { percent: 0.5, userSized: true },
      { percent: 0.25, userSized: true },
      // third 0.25 gone
    ];
    renormalizeChildPercents(kids);
    expect(kids[0].percent + kids[1].percent).toBeCloseTo(1);
    expect(kids[0].percent / kids[1].percent).toBeCloseTo(2);
  });
});

describe("tree-snapshot capture / restore with WindowManager (Forest G7)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function wm() {
    return ctx.windowManager;
  }

  function makeWindow(i) {
    return createMockWindow({
      id: `t6-w${i}`,
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
    });
  }

  function createCon(parentValue, layout) {
    const con = ctx.tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  /** Drop non-survivors; flatten survivors under MONITOR in Forest + paint mirror. */
  function flattenUnderMonitor(monitor, windows, allCreated = null) {
    const forest = wm().forest;
    const monTom = forest.nodes[monitor.nodeValue];
    const keep = new Set(windows);
    if (allCreated) {
      for (const meta of allCreated) {
        if (keep.has(meta)) continue;
        forestRemoveWindow(wm(), meta);
        const live = ctx.tree.findNode(meta);
        if (live?.parentNode) live.parentNode.removeChild(live);
      }
    }
    for (const meta of windows) {
      const id = wm().hostBag.idFromMeta(meta);
      if (!id || !forest.nodes[id]) continue;
      appendChild(forest, monTom, forest.nodes[id]);
      const live = ctx.tree.findNode(meta);
      if (live) monitor.appendChild(live);
    }
  }

  it("snapshotTree version and nested H/V with percents + userSized round-trip", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;

    const left = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    left.percent = 0.6;
    left.userSized = true;

    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const w2 = makeWindow(2);
    const n0 = ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w2);
    n0.percent = 0.3;
    n0.userSized = true;
    n1.percent = 0.7;
    n1.userSized = true;
    n2.percent = 0.4;
    n2.userSized = true;

    seedLiveForest(wm());
    const id0 = wm().hostBag.idFromMeta(w0);
    const id1 = wm().hostBag.idFromMeta(w1);
    const id2 = wm().hostBag.idFromMeta(w2);
    const leftId = wm().forest.nodes[id0].parentId;
    wm().forest.nodes[id0].percent = 0.3;
    wm().forest.nodes[id0].userSized = true;
    wm().forest.nodes[id1].percent = 0.7;
    wm().forest.nodes[id1].userSized = true;
    wm().forest.nodes[id2].percent = 0.4;
    wm().forest.nodes[id2].userSized = true;
    wm().forest.nodes[leftId].percent = 0.6;
    wm().forest.nodes[leftId].userSized = true;

    const snap = ctx.tree.snapshotTree();
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.monitors.length).toBeGreaterThanOrEqual(1);
    const monDesc = snap.monitors.find((m) => m.id === monitor.nodeValue);
    expect(monDesc).toBeTruthy();
    expect(monDesc.children).toHaveLength(2);
    expect(monDesc.children[0].percent).toBeCloseTo(0.6);
    expect(monDesc.children[0].children[0].percent).toBeCloseTo(0.3);
    expect(monDesc.children[0].children[1].percent).toBeCloseTo(0.7);

    flattenUnderMonitor(monitor, [w0, w1, w2], [w0, w1, w2]);

    ctx.tree.restoreTree(snap);

    const vsplit = ctx.tree.getNodeByLayout(LAYOUT_TYPES.VSPLIT);
    expect(vsplit).toHaveLength(1);
    const inner = vsplit[0];
    expect(parentOf(wm(), inner)).toBe(monitor);
    expect(kidsOf(wm(), inner).map((n) => n.nodeValue)).toEqual([w0, w1]);
    expect(inner.percent).toBeCloseTo(0.6);
    expect(inner.userSized).toBe(true);
    expect(kidsOf(wm(), inner)[0].percent).toBeCloseTo(0.3);
    expect(kidsOf(wm(), inner)[0].userSized).toBe(true);
    expect(kidsOf(wm(), inner)[1].percent).toBeCloseTo(0.7);
    expect(kidsOf(wm(), inner)[1].userSized).toBe(true);

    const right = kidsOf(wm(), monitor).find((n) => n.isWindow?.() && n.nodeValue === w2);
    expect(right).toBeTruthy();
    expect(right.percent).toBeCloseTo(0.4);
    expect(right.userSized).toBe(true);
  });

  it("restores TABBED with lastTabFocus and nested HSPLIT", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const inner = createCon(outer.nodeValue, LAYOUT_TYPES.HSPLIT);
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const w2 = makeWindow(2);
    ctx.tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, w1);
    ctx.tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, w2);
    outer.lastTabFocus = w2;

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, [w0, w1, w2]);
    ctx.tree.restoreTree(snap);

    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(tabbed[0].lastTabFocus).toBe(w2);
    expect(kidsOf(wm(), tabbed[0])[0].layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(kidsOf(wm(), tabbed[0])[1].nodeValue).toBe(w2);
  });

  it("restores STACKED groups", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createCon(monitor.nodeValue, LAYOUT_TYPES.STACKED);
    const windows = [0, 1, 2].map((i) => makeWindow(i));
    for (const w of windows) {
      ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w);
    }

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, windows);
    ctx.tree.restoreTree(snap);

    const stacked = ctx.tree.getNodeByLayout(LAYOUT_TYPES.STACKED);
    expect(stacked).toHaveLength(1);
    expect(kidsOf(wm(), stacked[0]).map((n) => n.nodeValue)).toEqual(windows);
  });

  it("collapses closed windows cleanly", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const left = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const w2 = makeWindow(2);
    ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w1);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w2);

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, [w0, w2], [w0, w1, w2]);
    ctx.tree.restoreTree(snap);

    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.VSPLIT)).toHaveLength(0);
    expect(kidsOf(wm(), monitor).map((n) => n.nodeValue)).toEqual([w0, w2]);
    expect(kidsOf(wm(), monitor).every((n) => n.isWindow())).toBe(true);
  });

  it("collapsed single-child CON keeps CON percent not sole child percent=1", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const wrap = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    wrap.percent = 0;
    wrap.userSized = false;
    const ghost = makeWindow(0);
    const nGhost = ctx.tree.createNode(wrap.nodeValue, NODE_TYPES.WINDOW, ghost);
    nGhost.percent = 1;
    nGhost.userSized = false;
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    tab.percent = 0;
    tab.userSized = false;
    const chrome = makeWindow(1);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, chrome);

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, [ghost, chrome]);
    ctx.tree.restoreTree(snap);

    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.VSPLIT)).toHaveLength(0);
    expect(kidsOf(wm(), monitor)).toHaveLength(2);
    expect(kidsOf(wm(), monitor)[0].percent).toBe(0);
    expect(kidsOf(wm(), monitor)[1].percent).toBe(0);
  });

  it("restoreTreeIfNeeded skips intact topology and re-applies percents", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const n0 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.percent = 0.7;
    n0.userSized = true;
    n1.percent = 0.3;
    n1.userSized = true;

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    const id0 = wm().hostBag.idFromMeta(w0);
    const id1 = wm().hostBag.idFromMeta(w1);
    wm().forest.nodes[id0].percent = 0;
    wm().forest.nodes[id0].userSized = false;
    wm().forest.nodes[id1].percent = 0;
    wm().forest.nodes[id1].userSized = false;
    n0.percent = 0;
    n0.userSized = false;
    n1.percent = 0;
    n1.userSized = false;

    ctx.tree.restoreTreeIfNeeded(snap);
    expect(kidsOf(wm(), monitor).map((n) => n.nodeValue)).toEqual([w0, w1]);
    expect(n0.percent).toBeCloseTo(0.7);
    expect(n0.userSized).toBe(true);
    expect(n1.percent).toBeCloseTo(0.3);
    expect(n1.userSized).toBe(true);
  });

  it("restoreTreeIfNeeded rebuilds when flattened", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, [w0, w1]);

    ctx.tree.restoreTreeIfNeeded(snap);
    expect(ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);
  });

  it("renormalizes mon-level percents after a collapsed mon child", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;

    const left = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    left.percent = 0.6;
    left.userSized = true;
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const w2 = makeWindow(2);
    ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w2);
    n2.percent = 0.4;
    n2.userSized = true;

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();
    flattenUnderMonitor(monitor, [w2], [w0, w1, w2]);
    ctx.tree.restoreTree(snap);

    expect(kidsOf(wm(), monitor)).toHaveLength(1);
    expect(kidsOf(wm(), monitor)[0].nodeValue).toBe(w2);
    expect(kidsOf(wm(), monitor)[0].percent).toBeCloseTo(1);
    expect(kidsOf(wm(), monitor)[0].userSized).toBe(true);
  });

  it("extractOuterLayoutGroups finds outermost tab/stack only", () => {
    const forest = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: LAYOUT_TYPES.HSPLIT,
          children: [
            {
              layout: LAYOUT_TYPES.TABBED,
              children: [
                { window: "a", percent: 0, userSized: false },
                {
                  layout: LAYOUT_TYPES.STACKED,
                  children: [
                    { window: "b", percent: 0, userSized: false },
                    { window: "c", percent: 0, userSized: false },
                  ],
                },
              ],
            },
            { window: "d", percent: 0, userSized: false },
          ],
        },
      ],
    };
    const groups = extractOuterLayoutGroups(forest, LAYOUT_TYPES.STACKED, LAYOUT_TYPES.TABBED);
    expect(groups).toHaveLength(1);
    expect(groups[0].layout).toBe(LAYOUT_TYPES.TABBED);
  });

  it("captureNode / rebuildNode work as pure building blocks", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createCon(monitor.nodeValue, LAYOUT_TYPES.HSPLIT);
    const w0 = makeWindow(0);
    const w1 = makeWindow(1);
    const n0 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.percent = 0.55;
    n0.userSized = true;
    n1.percent = 0.45;
    n1.userSized = true;

    const desc = captureNode(con);
    expect(collectWindows(desc)).toEqual([w0, w1]);

    // Flatten then rebuild via quarantined GObject helper.
    monitor.appendChild(n0);
    monitor.appendChild(n1);
    const cohortSet = new Set(monitor.childNodes);
    const rebuilt = rebuildNode(desc, {
      findNode: (w) => ctx.tree.findNode(w),
      cohortSet,
      createCon: () => {
        const c = new Node(NODE_TYPES.CON, new Bin());
        c.settings = ctx.tree.settings;
        return c;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    });
    expect(rebuilt.isCon()).toBe(true);
    expect(rebuilt.childNodes[0].percent).toBeCloseTo(0.55);
    expect(rebuilt.childNodes[0].userSized).toBe(true);
  });

  it("hasAncestor walks parent chain", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createCon(monitor.nodeValue, LAYOUT_TYPES.HSPLIT);
    const w = makeWindow(9);
    const n = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w);
    expect(hasAncestor(n, monitor)).toBe(true);
    expect(hasAncestor(n, con)).toBe(true);
    expect(hasAncestor(monitor, n)).toBe(false);
  });
});

/**
 * Cross-mon thrash: mon-keyed snapshot alone no-ops when cohort rehomes away
 * from monDesc.id — restore must remap / regroup mon-agnostically.
 */
describe("tree-snapshot cross-mon monitor-recovery recovery", () => {
  let ctx;

  const dualGeoms = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  beforeEach(() => {
    ctx = createWindowManagerFixture({
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

  function wm() {
    return ctx.windowManager;
  }

  function makeWindow(i, monIdx) {
    return createMockWindow({
      id: `t6-xmon-${i}`,
      workspace: ctx.workspaces[0],
      monitor: monIdx,
      rect: new Rectangle({
        x: monIdx * 1920,
        y: 0,
        width: 900,
        height: 900,
      }),
    });
  }

  function createCon(parentValue, layout) {
    const con = ctx.tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  it("resolveTargetMonitor remaps to majority mon when snapshot mon is empty", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = createCon(mon1.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = makeWindow(0, 1);
    const w1 = makeWindow(1, 1);
    ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w1);

    const snap = ctx.tree.snapshotTree();
    const monDesc = snap.monitors.find((m) => m.id === mon1.nodeValue);
    expect(monDesc).toBeTruthy();

    // Thrash: flat under mon0 (snapshot mon empty).
    mon0.appendChild(ctx.tree.findNode(w0));
    mon0.appendChild(ctx.tree.findNode(w1));

    const ctxSnap = {
      findMonitor: (id) => ctx.tree.findNode(id),
      findNode: (w) => ctx.tree.findNode(w),
    };
    expect(resolveTargetMonitor(monDesc, ctxSnap)).toBe(mon0);
  });

  it("restoreTreeIfNeeded regroups TABBED after flatten under a different mon", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const foreign = makeWindow(9, 0);
    const foreignNode = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, foreign);

    const tabs = createCon(mon1.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = makeWindow(0, 1);
    const w1 = makeWindow(1, 1);
    const n0 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w1);

    seedLiveForest(wm());
    const snap = ctx.tree.snapshotTree();

    const forest = wm().forest;
    const mon0Tom = forest.nodes[mon0.nodeValue];
    for (const meta of [w0, w1]) {
      const id = wm().hostBag.idFromMeta(meta);
      appendChild(forest, mon0Tom, forest.nodes[id]);
    }
    mon0.appendChild(n0);
    mon0.appendChild(n1);
    expect(n0.parentNode).toBe(mon0);
    expect(n1.parentNode).toBe(mon0);

    ctx.tree.restoreTreeIfNeeded(snap);

    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(kidsOf(wm(), tabbed[0]).map((c) => c.nodeValue)).toEqual([w0, w1]);
    expect(parentOf(wm(), tabbed[0])).toBe(mon0);
    expect(parentOf(wm(), foreignNode)).toBe(mon0);
  });

  it("applyMonitorSnapshot renormalizes mon-level sibling percents on collapse", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const w0 = makeWindow(0, 0);
    const w1 = makeWindow(1, 0);
    const n0 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.percent = 0.55;
    n0.userSized = true;
    n1.percent = 0.45;
    n1.userSized = true;

    const monDesc = {
      id: monitor.nodeValue,
      layout: LAYOUT_TYPES.HSPLIT,
      children: [
        { window: w0, percent: 0.55, userSized: true },
        { window: w1, percent: 0.45, userSized: true },
      ],
    };

    // Only w0 survives.
    monitor.removeChild(n1);
    applyMonitorSnapshot(monitor, monDesc, {
      findNode: (w) => ctx.tree.findNode(w),
      createCon: () => {
        const c = new Node(NODE_TYPES.CON, new Bin());
        c.settings = ctx.tree.settings;
        return c;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    });

    expect(monitor.childNodes).toHaveLength(1);
    expect(monitor.childNodes[0].nodeValue).toBe(w0);
    expect(monitor.childNodes[0].percent).toBeCloseTo(1);
  });

  function applyCtx() {
    return {
      findNode: (w) => ctx.tree.findNode(w),
      createCon: () => {
        const c = new Node(NODE_TYPES.CON, new Bin());
        c.settings = ctx.tree.settings;
        return c;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    };
  }

  // R018: install restore on a mixed mon (extra sibling). insertBefore(first,
  // first) is a no-op so a same-anchor loop swapped term|tabs → tabs|term.
  it("applyMonitorSnapshot keeps term|tab order when an extra sits after the cohort", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const ghost = makeWindow(0);
    const c0 = makeWindow(1);
    const c1 = makeWindow(2);
    const extra = makeWindow(9);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c0);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c1);
    const extraNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, extra);

    applyMonitorSnapshot(
      monitor,
      {
        id: monitor.nodeValue,
        layout: LAYOUT_TYPES.HSPLIT,
        children: [
          { window: ghost, percent: 0, userSized: false },
          {
            layout: LAYOUT_TYPES.TABBED,
            percent: 0,
            userSized: false,
            children: [
              { window: c0, percent: 0, userSized: false },
              { window: c1, percent: 0, userSized: false },
            ],
          },
        ],
      },
      applyCtx()
    );

    expect(monitor.childNodes).toHaveLength(3);
    expect(monitor.childNodes[0].nodeValue).toBe(ghost);
    expect(monitor.childNodes[1].layout).toBe(LAYOUT_TYPES.TABBED);
    expect(monitor.childNodes[1].childNodes.map((n) => n.nodeValue)).toEqual([c0, c1]);
    expect(monitor.childNodes[2]).toBe(extraNode);
  });

  it("applyMonitorSnapshot keeps extras before the cohort span", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const extra = makeWindow(9);
    const ghost = makeWindow(0);
    const c0 = makeWindow(1);
    const c1 = makeWindow(2);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, extra);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c0);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c1);

    applyMonitorSnapshot(
      monitor,
      {
        id: monitor.nodeValue,
        layout: LAYOUT_TYPES.HSPLIT,
        children: [
          { window: ghost, percent: 0, userSized: false },
          {
            layout: LAYOUT_TYPES.TABBED,
            percent: 0,
            userSized: false,
            children: [
              { window: c0, percent: 0, userSized: false },
              { window: c1, percent: 0, userSized: false },
            ],
          },
        ],
      },
      applyCtx()
    );

    expect(monitor.childNodes[0].nodeValue).toBe(extra);
    expect(monitor.childNodes[1].nodeValue).toBe(ghost);
    expect(monitor.childNodes[2].layout).toBe(LAYOUT_TYPES.TABBED);
  });

  it("applyMonitorSnapshot keeps tab|term order with a trailing extra", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const ghost = makeWindow(0);
    const c0 = makeWindow(1);
    const c1 = makeWindow(2);
    const extra = makeWindow(9);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c0);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, c1);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, extra);

    applyMonitorSnapshot(
      monitor,
      {
        id: monitor.nodeValue,
        layout: LAYOUT_TYPES.HSPLIT,
        children: [
          {
            layout: LAYOUT_TYPES.TABBED,
            percent: 0,
            userSized: false,
            children: [
              { window: c0, percent: 0, userSized: false },
              { window: c1, percent: 0, userSized: false },
            ],
          },
          { window: ghost, percent: 0, userSized: false },
        ],
      },
      applyCtx()
    );

    expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.TABBED);
    expect(monitor.childNodes[1].nodeValue).toBe(ghost);
    expect(monitor.childNodes[2].nodeValue).toBe(extra);
  });
});

/**
 * T7: monDesc.stableKey survives index renumber when connectors flip.
 */
describe("tree-snapshot stableKey remap (T7)", () => {
  let ctx;

  const dualGeoms = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  beforeEach(() => {
    ctx = createWindowManagerFixture({
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

  function wm() {
    return ctx.windowManager;
  }

  function makeWindow(i, monIdx) {
    return createMockWindow({
      id: `t7-xmon-${i}`,
      monitor: monIdx,
      rect: new Rectangle({
        x: monIdx * 1920,
        y: 0,
        width: 900,
        height: 900,
      }),
    });
  }

  function createCon(parentValue, layout) {
    const con = ctx.tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  it("captureMonitor includes stableKey from liveMap", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w = makeWindow(0, 0);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w);
    const liveMap = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    const desc = captureMonitor(monitor, { liveMap });
    expect(desc.id).toBe(monitor.nodeValue);
    expect(desc.stableKey).toBe("conn:DP-1");
  });

  it("resolveTargetMonitor prefers stableKey when indices flip", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);

    // Quiet: tabs on mon0 (DP-1)
    const tabs = createCon(mon0.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = makeWindow(0, 0);
    const w1 = makeWindow(1, 0);
    const n0 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w1);

    const monDesc = {
      id: mon0.nodeValue, // mo0ws0 — stale after renumber
      stableKey: "conn:DP-1",
      layout: LAYOUT_TYPES.HSPLIT,
      children: [
        {
          layout: LAYOUT_TYPES.TABBED,
          percent: 0,
          userSized: false,
          children: [
            { window: w0, percent: 0, userSized: false },
            { window: w1, percent: 0, userSized: false },
          ],
        },
      ],
    };

    // After renumber: DP-1 is index 1. Monitor-recovery moved windows to mon1.
    mon1.appendChild(n0);
    mon1.appendChild(n1);

    const liveMap = buildLiveMap([
      { index: 0, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
    ]);

    const ctxSnap = {
      findMonitor: (id) => ctx.tree.findNode(id),
      findNode: (w) => ctx.tree.findNode(w),
      findMonitorByStableKey: (stableKey, monDescId) => {
        const idx = liveMap.byKey.get(stableKey);
        if (idx === undefined) return null;
        // workspace 0
        return ctx.tree.findNode(`mo${idx}ws0`);
      },
    };

    // mon0 still exists but is empty / wrong head; cohort lives under mon1.
    expect(resolveTargetMonitor(monDesc, ctxSnap)).toBe(mon1);
  });

  it("restoreForestIfNeeded uses stableKey when monDesc.id is stale", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = createCon(mon0.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = makeWindow(0, 0);
    const w1 = makeWindow(1, 0);
    const n0 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = ctx.tree.createNode(tabs.nodeValue, NODE_TYPES.WINDOW, w1);

    const snap = {
      version: SNAPSHOT_VERSION,
      monitors: [
        {
          id: mon0.nodeValue,
          stableKey: "conn:DP-1",
          layout: LAYOUT_TYPES.HSPLIT,
          children: [
            {
              layout: LAYOUT_TYPES.TABBED,
              percent: 0,
              userSized: false,
              lastTabFocus: w0,
              children: [
                { window: w0, percent: 0, userSized: false },
                { window: w1, percent: 0, userSized: false },
              ],
            },
          ],
        },
      ],
    };

    // Flatten under mon1 (new index for DP-1 after renumber)
    mon1.appendChild(n0);
    mon1.appendChild(n1);

    const liveMap = buildLiveMap([
      { index: 0, connector: "HDMI-1" },
      { index: 1, connector: "DP-1" },
    ]);

    restoreForestIfNeeded(snap, {
      findMonitor: (id) => ctx.tree.findNode(id),
      findNode: (w) => ctx.tree.findNode(w),
      findMonitorByStableKey: (stableKey) => {
        const idx = liveMap.byKey.get(stableKey);
        return idx === undefined ? null : ctx.tree.findNode(`mo${idx}ws0`);
      },
      createCon: () => {
        const c = new Node(NODE_TYPES.CON, new Bin());
        c.settings = ctx.tree.settings;
        return c;
      },
      tabbedLayout: LAYOUT_TYPES.TABBED,
    });

    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(kidsOf(wm(), tabbed[0]).map((c) => c.nodeValue)).toEqual([w0, w1]);
    // Dest-mon via stableKey under Forest paint is still soft; regroup identity is the L0 contract.
  });
});

describe("treeSnapshotCtx lookup (createCon stays invent)", () => {
  it("findNode prefers direct then hostBag meta then WINDOW id scan", () => {
    const meta = { id: "w1" };
    const win = { nodeType: "WINDOW", nodeValue: meta };
    const tree = {
      findNode: (key) => (key === meta ? win : key === "direct" ? win : null),
      getNodeByType: () => [win],
      extWm: {
        hostBag: {
          get: (k) => (k === "bag" ? { meta } : null),
          idFromWindowId: () => null,
          idFromMeta: () => null,
        },
      },
    };
    const ctx = treeSnapshotCtx(tree, () => ({ invented: true }));
    expect(ctx.findNode("direct")).toBe(win);
    expect(ctx.findNode("bag")).toBe(win);
    expect(ctx.createCon()).toEqual({ invented: true });
    expect(ctx.tabbedLayout).toBe(LAYOUT_TYPES.TABBED);
  });
});
