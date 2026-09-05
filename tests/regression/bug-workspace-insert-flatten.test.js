import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { Workspace } from "../mocks/gnome/Meta.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * Bug forge-6pe: Overview drag-to-insert-workspace scrambles tiling on shifted
 * workspaces.
 *
 * The issue originally blamed index-keyed tree nodes, but the real GNOME path
 * (`WindowManager.insertWorkspace`) appends the new workspace at the END and then,
 * in a SYNCHRONOUS loop, moves every window at index >= pos to index+1. Mutter
 * emits each window's `workspace-changed` synchronously mid-loop, so re-homing
 * eagerly per event sees a half-migrated tree and flattens nested sub-splits onto
 * the destination monitor node (confirmed in real GNOME via e2e).
 *
 * Fix: coalesce the workspace-changed burst and reconcile once it has settled
 * (`_reconcileWindowHomes`), moving an intact container when its whole sub-tree is
 * migrating to the same destination, instead of flattening windows one by one.
 */
describe("Bug forge-6pe: cross-workspace migration preserves nested layout", () => {
  let ctx, tree, wm;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 3, activeWorkspaceIndex: 0 } },
    });
    tree = ctx.tree;
    wm = ctx.windowManager;
    // We assert on tree structure only; skip render (unmocked workspace actors).
    vi.spyOn(wm, "renderTree").mockImplementation(() => {});
    vi.spyOn(wm, "trackCurrentMonWs").mockImplementation(() => {});

    for (let i = 0; i < 3; i++) {
      const { monitor } = getWorkspaceAndMonitor(ctx, i, 0);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    }
  });

  afterEach(() => ctx.cleanup());

  /** Build a window node under `parent` on workspace `wsObj`. */
  function addWindow(id, parent, wsObj, percent) {
    const { nodeWindow, metaWindow } = createWindowNode(tree, parent, {
      mode: "TILE",
      windowOverrides: { id, workspace: wsObj, monitor: 0 },
    });
    if (percent != null) nodeWindow.percent = percent;
    return { win: metaWindow, node: nodeWindow };
  }

  /**
   * Simulate GNOME insertWorkspace: append the new end workspace, reassign every
   * given window to its new workspace (the synchronous batch is already settled by
   * the time Forge's coalesced reconcile runs), then run the reconcile.
   */
  function simulateInsertShift(wins, newWsObj) {
    ctx.workspaces.push(newWsObj);
    tree.addWorkspace(newWsObj.index());
    // Spine admit marks Forest seeded without WINDOW nodes; reseed so rehome can Forest-write.
    if (wm._liveForestSeeded) seedLiveForest(wm);
    wins.forEach((w) => (w._workspace = newWsObj));
    wm._reconcileWindowHomes();
  }

  it("preserves a nested sub-split when the whole workspace shifts (insert before last)", () => {
    const { monitor: mon0ws2 } = getWorkspaceAndMonitor(ctx, 2, 0);

    // Nested VSPLIT container on ws2 holding two windows with custom proportions.
    const con = tree.createNode(mon0ws2.nodeValue, NODE_TYPES.CON, "con-ws2");
    con.layout = LAYOUT_TYPES.VSPLIT;
    const { win: winD, node: nodeD } = addWindow("D", con, ctx.workspaces[2], 0.7);
    const { win: winE, node: nodeE } = addWindow("E", con, ctx.workspaces[2], 0.3);
    if (wm._liveForestSeeded) seedLiveForest(wm);

    expect(parentOf(wm, nodeD)).toBe(con);

    simulateInsertShift([winD, winE], new Workspace({ index: 3 }));

    const mo0ws3 = tree.findNode("mo0ws3");
    expect(mo0ws3).not.toBeNull();
    // The sub-split is preserved: D and E remain siblings under a VSPLIT CON that
    // now lives under the destination monitor node, with proportions intact.
    const split = parentOf(wm, nodeD);
    expect(split.nodeType).toBe(NODE_TYPES.CON);
    expect(split).toBe(parentOf(wm, nodeE));
    expect(split.layout).toBe(LAYOUT_TYPES.VSPLIT);
    expect(parentOf(wm, split)?.nodeValue).toBe("mo0ws3");
    expect(nodeD.percent).toBe(0.7);
    expect(nodeE.percent).toBe(0.3);
    expect(kidsOf(wm, parentOf(wm, split))).not.toContain(nodeD);
  });

  it("preserves flat proportions when the whole workspace shifts", () => {
    const { monitor: mon0ws2 } = getWorkspaceAndMonitor(ctx, 2, 0);
    const { win: winA, node: nodeA } = addWindow("A", mon0ws2, ctx.workspaces[2], 0.6);
    const { win: winB, node: nodeB } = addWindow("B", mon0ws2, ctx.workspaces[2], 0.4);

    simulateInsertShift([winA, winB], new Workspace({ index: 3 }));

    expect(parentOf(wm, nodeA)?.nodeValue).toBe("mo0ws3");
    expect(parentOf(wm, nodeB)?.nodeValue).toBe("mo0ws3");
    expect(kidsOf(wm, parentOf(wm, nodeA))).toEqual(expect.arrayContaining([nodeA, nodeB]));
    // D090: percent without userSized is share — dest MONITOR leftover equalizes.
    expect(nodeA.userSized).toBe(false);
    expect(nodeB.userSized).toBe(false);
    expect(nodeA.percent).toBe(0.5);
    expect(nodeB.percent).toBe(0.5);
  });

  it("still flattens a single window sent to another workspace (partial migration)", () => {
    const { monitor: mon0ws2 } = getWorkspaceAndMonitor(ctx, 2, 0);
    const con = tree.createNode(mon0ws2.nodeValue, NODE_TYPES.CON, "con-ws2");
    con.layout = LAYOUT_TYPES.VSPLIT;
    const { win: winD, node: nodeD } = addWindow("D", con, ctx.workspaces[2]);
    const { node: nodeE } = addWindow("E", con, ctx.workspaces[2]);
    if (wm._liveForestSeeded) seedLiveForest(wm);

    // Only winD moves to the new workspace; winE stays on ws2.
    const wsNew = new Workspace({ index: 3 });
    ctx.workspaces.push(wsNew);
    tree.addWorkspace(3);
    if (wm._liveForestSeeded) seedLiveForest(wm);
    winD._workspace = wsNew;
    wm._reconcileWindowHomes();

    expect(parentOf(wm, nodeD)?.nodeValue).toBe("mo0ws3"); // flattened onto destination monitor
    expect(parentOf(wm, nodeE)).toBe(con); // winE stays nested on the source
  });
});
