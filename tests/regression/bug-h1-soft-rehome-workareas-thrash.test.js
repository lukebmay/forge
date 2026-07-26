import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * H1 soft rehome: overnight auto-lock / workareas thrash can shove Meta.Windows
 * onto the primary. Forge must restore tree placement from last-good geometry
 * without a full wipe when both heads are still present.
 */
describe("H1 soft rehome on workareas thrash", () => {
  let ctx;
  let settleCallbacks;

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
    settleCallbacks = [];
    vi.spyOn(GLib, "timeout_add").mockImplementation((_p, _i, cb) => {
      settleCallbacks.push(cb);
      return 7001;
    });
    // Structure-only assertions; skip real render actors.
    vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const tree = () => ctx.tree;

  function fireSettle() {
    const cbs = settleCallbacks.splice(0);
    for (const cb of cbs) cb();
  }

  function addTiled(id, monIdx, frame) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIdx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = dualGeoms[monIdx];
    const win = createMockWindow({
      id,
      workspace: ctx.workspaces[0],
      monitor: monIdx,
      rect: frame,
    });
    const node = tree().createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...frame };
    return { win, node, monitor };
  }

  it("maps each window to max-intersection monitor from last-good frame", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { win: leftWin, node: leftNode } = addTiled("L", 0, leftFrame);
    const { win: rightWin, node: rightNode } = addTiled("R", 1, rightFrame);

    // Quiet snapshot (as after a normal render).
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    // Thrash: Mutter piles both Meta.Windows onto primary; tree already wrong.
    leftWin._monitor = 0;
    rightWin._monitor = 0;
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    mon0.appendChild(rightNode);
    expect(mon0.contains(rightNode)).toBe(true);

    wm()._onWorkareasChanged(ctx.display);
    expect(wm()._workareasThrashPending).toBe(true);
    // window-entered-monitor would be suppressed while pending.
    fireSettle();

    const { monitor: mon0After } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1After } = getWorkspaceAndMonitor(ctx, 0, 1);
    expect(mon0After.contains(leftNode)).toBe(true);
    expect(mon1After.contains(rightNode)).toBe(true);
    expect(leftWin.get_monitor()).toBe(0);
    expect(rightWin.get_monitor()).toBe(1);
    expect(wm()._workareasThrashPending).toBe(false);
    expect(wm().renderTree).toHaveBeenCalledWith("workareas-soft-rehome");
  });

  it("suppresses window-entered-monitor rehome while thrash is pending", () => {
    const { win } = addTiled("A", 1, { x: 2000, y: 0, width: 400, height: 400 });
    wm()._snapshotLastGoodHomes();
    wm()._workareasThrashPending = true;

    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).not.toHaveBeenCalled();

    wm()._workareasThrashPending = false;
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).toHaveBeenCalledWith("window-entered-monitor", 0, win);
  });

  it("suppresses window-entered-monitor rehome during session layout restore", () => {
    const { win } = addTiled("S", 1, { x: 2000, y: 0, width: 400, height: 400 });
    wm()._sessionLayoutRestoring = true;

    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).not.toHaveBeenCalled();

    wm()._sessionLayoutRestoring = false;
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).toHaveBeenCalledWith("window-entered-monitor", 0, win);
  });

  it("seeded last-good from session frames keeps dual Ghosttys on mon0+mon1 after soft rehome", () => {
    // Mirrors HUP: thrash piles both on mon1; empty WeakMap would use thrash frames;
    // seed from portable mon0/mon1 frames so soft rehome does not undo session restore.
    const leftFrame = { x: 100, y: 50, width: 900, height: 1000 };
    const rightFrame = { x: 2000, y: 50, width: 900, height: 1000 };
    const thrashFrame = { x: 2100, y: 10, width: 800, height: 900 };

    const { win: leftWin, node: leftNode } = addTiled("G0", 1, thrashFrame);
    const { win: rightWin, node: rightNode } = addTiled("G1", 1, thrashFrame);
    // Both Meta + tree on mon1 (post-HUP thrash pile).
    leftWin._monitor = 1;
    rightWin._monitor = 1;
    leftNode.rect = { ...thrashFrame };
    rightNode.rect = { ...thrashFrame };

    // Empty last-good (new Meta.Window objects after HUP) → thrash frames win.
    expect(wm()._lastGoodHomes.get(leftWin)).toBeUndefined();
    const bareLeft = wm()._resolveSoftRehomeMonitor(leftNode, dualGeoms, 2);
    const bareRight = wm()._resolveSoftRehomeMonitor(rightNode, dualGeoms, 2);
    expect(bareLeft).toBe(1);
    expect(bareRight).toBe(1);

    // Session restore seeds saved frames (planLastGoodHomes path).
    wm()._seedLastGoodHomesFromSession({
      monitors: [
        {
          id: "mo0ws0",
          children: [{ window: leftWin, frame: leftFrame, monitor: 0 }],
        },
        {
          id: "mo1ws0",
          children: [{ window: rightWin, frame: rightFrame, monitor: 1 }],
        },
      ],
    });

    expect(wm()._resolveSoftRehomeMonitor(leftNode, dualGeoms, 2)).toBe(0);
    expect(wm()._resolveSoftRehomeMonitor(rightNode, dualGeoms, 2)).toBe(1);

    wm()._softRehomeAfterWorkareas();

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    expect(mon0.contains(leftNode)).toBe(true);
    expect(mon1.contains(rightNode)).toBe(true);
    expect(leftWin.get_monitor()).toBe(0);
    expect(rightWin.get_monitor()).toBe(1);
  });

  it("session-layout shield re-applies forest when soft rehome would freeze thrash tree", () => {
    // Live bug: restore builds dual Ghostty; Meta thrash peels left Ghostty to mon1;
    // soft rehome snapshotTree() freezes mo0=tabs-only + mo1=Ghostty|tabs|Ghostty(width0).
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const leftFrame = { x: 960, y: 50, width: 960, height: 1000 };
    const rightFrame = { x: 1920, y: 50, width: 960, height: 1000 };
    const thrashFrame = { x: 2100, y: 10, width: 800, height: 900 };

    // Good topology: mo0 = VSPLIT(ghostty) sibling of a chrome window; mo1 = ghostty | chrome
    const chromeL = createMockWindow({
      id: "cL",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 0, y: 50, width: 960, height: 1000 },
      wm_class: "Google-chrome",
      title: "Grok",
    });
    const chromeR = createMockWindow({
      id: "cR",
      workspace: ctx.workspaces[0],
      monitor: 1,
      rect: { x: 2880, y: 50, width: 960, height: 1000 },
      wm_class: "Google-chrome",
      title: "Gmail",
    });
    const gLeft = createMockWindow({
      id: "gL",
      pid: 4452,
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: leftFrame,
      wm_class: "com.mitchellh.ghostty",
      title: "grok",
    });
    const gRight = createMockWindow({
      id: "gR",
      pid: 4452,
      workspace: ctx.workspaces[0],
      monitor: 1,
      rect: rightFrame,
      wm_class: "com.mitchellh.ghostty",
      title: " me",
    });

    const nChromeL = tree().createNode(mon0.nodeValue, NODE_TYPES.WINDOW, chromeL);
    nChromeL.mode = WINDOW_MODES.TILE;
    const vsplit = tree().createNode(mon0.nodeValue, NODE_TYPES.CON, "vsplit-g");
    vsplit.layout = LAYOUT_TYPES.VSPLIT;
    const nGLeft = tree().createNode(vsplit.nodeValue, NODE_TYPES.WINDOW, gLeft);
    nGLeft.mode = WINDOW_MODES.TILE;
    nGLeft.rect = { ...leftFrame };

    const nGRight = tree().createNode(mon1.nodeValue, NODE_TYPES.WINDOW, gRight);
    nGRight.mode = WINDOW_MODES.TILE;
    nGRight.rect = { ...rightFrame };
    const nChromeR = tree().createNode(mon1.nodeValue, NODE_TYPES.WINDOW, chromeR);
    nChromeR.mode = WINDOW_MODES.TILE;

    // Live forest as after successful session restore (VSPLIT-wrapped left Ghostty).
    const liveForest = {
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            {
              window: chromeL,
              percent: 0,
              frame: { x: 0, y: 50, width: 960, height: 1000 },
              monitor: 0,
            },
            {
              layout: "VSPLIT",
              children: [{ window: gLeft, percent: 0, frame: leftFrame, monitor: 0 }],
            },
          ],
        },
        {
          id: "mo1ws0",
          layout: "HSPLIT",
          children: [
            { window: gRight, percent: 0.5, frame: rightFrame, monitor: 1 },
            {
              window: chromeR,
              percent: 0.5,
              frame: { x: 2880, y: 50, width: 960, height: 1000 },
              monitor: 1,
            },
          ],
        },
      ],
    };

    wm()._seedLastGoodHomesFromSession(liveForest);
    wm()._sessionLayoutShield = {
      liveForest,
      untilMonoUs:
        (typeof GLib.get_monotonic_time === "function"
          ? GLib.get_monotonic_time()
          : Date.now() * 1000) + 5_000_000,
    };

    // Simulate Meta thrash peeling left Ghostty onto mon1 (entered-monitor path).
    gLeft._monitor = 1;
    gLeft._rect = thrashFrame;
    nGLeft.rect = { ...thrashFrame };
    mon1.appendChild(nGLeft);
    // mo0 left with chrome only (empty VSPLIT may linger).
    expect(mon0.contains(nGLeft)).toBe(false);
    expect(mon1.contains(nGLeft)).toBe(true);

    // Soft rehome during shield must re-apply forest — not freeze thrash snapshot.
    wm()._softRehomeAfterWorkareas();

    expect(mon0.contains(nGLeft)).toBe(true);
    expect(mon1.contains(nGRight)).toBe(true);
    expect(gLeft.get_monitor()).toBe(0);
    expect(gRight.get_monitor()).toBe(1);
    // No third Ghostty column on mon1.
    const mon1Ghosttys = mon1
      .getNodeByType(NODE_TYPES.WINDOW)
      .filter((n) => n.nodeValue?.get_wm_class?.()?.includes("ghostty"));
    expect(mon1Ghosttys.map((n) => n.nodeValue)).toEqual([gRight]);
  });

  it("suppresses window-entered-monitor while session-layout shield is active", () => {
    const { win } = addTiled("sh", 1, { x: 2000, y: 0, width: 400, height: 400 });
    wm()._sessionLayoutShield = {
      liveForest: { monitors: [{ id: "mo0ws0", children: [] }] },
      untilMonoUs:
        (typeof GLib.get_monotonic_time === "function"
          ? GLib.get_monotonic_time()
          : Date.now() * 1000) + 5_000_000,
    };
    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).not.toHaveBeenCalled();
    wm()._sessionLayoutShield = null;
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).toHaveBeenCalled();
  });

  it("falls back to reloadTree when destination monitor node is missing", () => {
    const { win, node } = addTiled("orphan", 0, { x: 10, y: 10, width: 100, height: 100 });
    // Force last-good onto monitor 1, then remove mon1 node.
    wm()._lastGoodHomes.set(win, {
      monitorIndex: 1,
      frame: { x: 2000, y: 10, width: 100, height: 100 },
    });
    const mon1 = tree().findNode("mo1ws0");
    if (mon1 && mon1.parentNode) mon1.parentNode.removeChild(mon1);

    const reload = vi.spyOn(wm(), "reloadTree").mockImplementation(() => {});
    wm()._softRehomeAfterWorkareas();
    expect(reload).toHaveBeenCalledWith("workareas-soft-rehome-inconsistent");
    // Window node still exists (not wiped by soft path).
    expect(tree().getNodeByType(NODE_TYPES.WINDOW)).toContain(node);
  });

  it("preserves an intact CON when both children soft-rehome to the same monitor", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const con = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "con-right");
    con.layout = LAYOUT_TYPES.VSPLIT;

    const frames = [
      { x: 2000, y: 0, width: 900, height: 500 },
      { x: 2000, y: 500, width: 900, height: 500 },
    ];
    const nodes = frames.map((frame, i) => {
      const win = createMockWindow({
        id: `C${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });

    wm()._snapshotLastGoodHomes();

    // Thrash piles CON onto mon0.
    mon0.appendChild(con);
    for (const { win } of nodes) win._monitor = 0;

    wm()._softRehomeAfterWorkareas();

    expect(mon1.contains(con)).toBe(true);
    expect(con.childNodes).toContain(nodes[0].n);
    expect(con.childNodes).toContain(nodes[1].n);
    expect(nodes[0].win.get_monitor()).toBe(1);
    expect(nodes[1].win.get_monitor()).toBe(1);
  });

  it("keeps a TABBED group intact when one member's last-good frame is divergent", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-right");
    tabs.layout = LAYOUT_TYPES.TABBED;

    // Majority on mon1; one bogus frame on mon0 would peel the tab without align.
    const specs = [
      { id: "T0", frame: { x: 2000, y: 0, width: 900, height: 900 } },
      { id: "T1", frame: { x: 2100, y: 50, width: 800, height: 800 } },
      { id: "T2", frame: { x: 100, y: 100, width: 400, height: 400 } },
    ];
    const nodes = specs.map(({ id, frame }) => {
      const win = createMockWindow({
        id,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });

    wm()._snapshotLastGoodHomes();

    mon0.appendChild(tabs);
    for (const { win } of nodes) win._monitor = 0;

    wm()._softRehomeAfterWorkareas();

    expect(mon1.contains(tabs)).toBe(true);
    expect(tabs.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(tabs.childNodes).toContain(nodes[0].n);
    expect(tabs.childNodes).toContain(nodes[1].n);
    expect(tabs.childNodes).toContain(nodes[2].n);
    for (const { win } of nodes) {
      expect(win.get_monitor()).toBe(1);
    }
  });

  it("does not nest a second TABBED CON when the group already migrated intact", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-intact");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const frames = [
      { x: 2000, y: 0, width: 900, height: 900 },
      { x: 2100, y: 50, width: 800, height: 800 },
    ];
    const nodes = frames.map((frame, i) => {
      const win = createMockWindow({
        id: `I${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });

    wm()._snapshotLastGoodHomes();
    mon0.appendChild(tabs);
    for (const { win } of nodes) win._monitor = 0;

    wm()._softRehomeAfterWorkareas();

    expect(mon1.contains(tabs)).toBe(true);
    expect(nodes[0].n.parentNode).toBe(tabs);
    expect(nodes[1].n.parentNode).toBe(tabs);
    // restore-if-unwrapped must not wrap tabs inside another TABBED CON.
    expect(tabs.parentNode).toBe(mon1);
    expect(tree().getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);
  });

  it("restoreLayoutGroupsIfUnwrapped re-wraps flat siblings and skips intact groups", () => {
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-snap");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const wins = [0, 1].map((i) => {
      const win = createMockWindow({
        id: `S${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: { x: 2000, y: 0, width: 900, height: 900 },
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      return { win, n };
    });

    const snapshot = tree().snapshotLayoutGroups();
    expect(snapshot).toHaveLength(1);

    // Intact: no-op (would nest if restore always ran).
    tree().restoreLayoutGroupsIfUnwrapped(snapshot);
    expect(wins[0].n.parentNode).toBe(tabs);
    expect(tree().getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);

    // Flatten then restore.
    mon1.appendChild(wins[0].n);
    mon1.appendChild(wins[1].n);
    tree().restoreLayoutGroupsIfUnwrapped(snapshot);

    expect(wins[0].n.parentNode).toBe(wins[1].n.parentNode);
    expect(wins[0].n.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(mon1.contains(wins[0].n)).toBe(true);
  });

  it("restoreLayoutGroupsIfUnwrapped rejoins a partial peel without nesting", () => {
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-peel");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const wins = [0, 1, 2].map((i) => {
      const win = createMockWindow({
        id: `P${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: { x: 2000, y: 0, width: 900, height: 900 },
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      return { win, n };
    });

    const snapshot = tree().snapshotLayoutGroups();
    // Peel one member flat under the monitor; two remain under tabs.
    mon1.appendChild(wins[2].n);
    expect(tabs.childNodes).toHaveLength(2);

    tree().restoreLayoutGroupsIfUnwrapped(snapshot);

    expect(wins[0].n.parentNode).toBe(tabs);
    expect(wins[1].n.parentNode).toBe(tabs);
    expect(wins[2].n.parentNode).toBe(tabs);
    expect(tree().getNodeByLayout(LAYOUT_TYPES.TABBED)).toHaveLength(1);
    expect(tabs.parentNode).toBe(mon1);
  });

  it("soft rehome restores TABBED when thrash flattened under mon0 (cross-mon)", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-xmon");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const frames = [
      { x: 2000, y: 0, width: 900, height: 900 },
      { x: 2100, y: 50, width: 800, height: 800 },
    ];
    const nodes = frames.map((frame, i) => {
      const win = createMockWindow({
        id: `X${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });

    // Quiet last-good homes + full forest while structure is still on mon1.
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    const preThrashSnap = tree().snapshotTree();
    // Soft rehome snapshots at settle time (after thrash). Feed the pre-thrash
    // forest so restore sees mon1 TABBED while live windows may sit on mon0.
    vi.spyOn(tree(), "snapshotTree").mockReturnValue(preThrashSnap);

    // Thrash: unwrap TABBED and pile flat under mon0 (Meta + tree).
    mon0.appendChild(nodes[0].n);
    mon0.appendChild(nodes[1].n);
    for (const { win } of nodes) win._monitor = 0;
    expect(nodes[0].n.parentNode).toBe(mon0);
    expect(nodes[1].n.parentNode).toBe(mon0);

    wm()._softRehomeAfterWorkareas();

    // Last-good frames rehome Meta + nodes to mon1; restore rebuilds one TABBED.
    for (const { win } of nodes) {
      expect(win.get_monitor()).toBe(1);
    }
    const tabbed = tree().getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(tabbed[0].childNodes).toContain(nodes[0].n);
    expect(tabbed[0].childNodes).toContain(nodes[1].n);
    expect(mon1.contains(tabbed[0])).toBe(true);
  });

  it("restoreTreeIfNeeded regroups TABBED mon-agnostically when mon1 cohort is empty", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-agnostic");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const nodes = [0, 1].map((i) => {
      const win = createMockWindow({
        id: `A${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: { x: 2000, y: 0, width: 900, height: 900 },
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      return { win, n };
    });

    const snap = tree().snapshotTree();
    // Cohort lives on mon0; monDesc still keys mon1 → empty mon-keyed cohort.
    mon0.appendChild(nodes[0].n);
    mon0.appendChild(nodes[1].n);

    tree().restoreTreeIfNeeded(snap);

    const tabbed = tree().getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(tabbed[0].childNodes).toContain(nodes[0].n);
    expect(tabbed[0].childNodes).toContain(nodes[1].n);
    expect(mon0.contains(tabbed[0])).toBe(true);
  });
});
