import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * Bug forge-ojew: lowering the workspace count strands windows when the removed
 * workspace held ALL tracked windows.
 *
 * Mutter relocates windows off the doomed workspace by emitting each window's
 * 'workspace-changed' (which Forge only QUEUES into an idle reconcile), THEN
 * synchronously emits 'workspace-removed'. The synchronous handler calls
 * removeWorkspace -> removeChild, which splices out the ENTIRE workspace subtree
 * INCLUDING its still-unreconciled WINDOW nodes. The later idle reconcile iterates
 * only tree nodes, so the detached windows can no longer be found — and the
 * _onWorkareasChanged recovery only retracks when the tree still has WINDOW nodes,
 * which it doesn't when every window lived on the removed workspace. Result: those
 * windows are permanently stranded until a full reloadTree.
 *
 * Fix: in the 'workspace-removed' handler, synchronously re-home the doomed
 * workspace's WINDOW descendants to the surviving workspace their Meta.Window now
 * reports (mirroring _reconcileWindowHomes), BEFORE removeChild splices the
 * subtree out.
 */
describe("Bug forge-ojew: workspace-removed re-homes windows instead of stranding them", () => {
  let ctx, tree, wm;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 2, activeWorkspaceIndex: 0 } },
    });
    tree = ctx.tree;
    wm = ctx.windowManager;
    vi.spyOn(wm, "renderTree").mockImplementation(() => {});
    vi.spyOn(wm, "trackCurrentMonWs").mockImplementation(() => {});

    for (let i = 0; i < 2; i++) {
      const { monitor } = getWorkspaceAndMonitor(ctx, i, 0);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    }
  });

  afterEach(() => ctx.cleanup());

  function addWindow(id, parent, wsObj) {
    const { nodeWindow: node, metaWindow: win } = createWindowNode(tree, parent, {
      mode: "TILE",
      windowOverrides: { id, workspace: wsObj, monitor: 0 },
    });
    win._workspace = wsObj;
    win._monitor = 0;
    return { win, node };
  }

  it("re-homes windows to the surviving workspace when ALL windows lived on the removed one", () => {
    const { monitor: mon0ws1 } = getWorkspaceAndMonitor(ctx, 1, 0);

    const { win: winA, node: nodeA } = addWindow("A", mon0ws1, ctx.workspaces[1]);
    const { win: winB, node: nodeB } = addWindow("B", mon0ws1, ctx.workspaces[1]);
    if (wm._liveForestSeeded) seedLiveForest(wm);

    const mo0ws0 = tree.findNode("mo0ws0");
    const leaves = (root) => {
      const out = [];
      const walk = (n) => {
        if (n?.isWindow?.()) out.push(n);
        for (const k of kidsOf(wm, n)) walk(k);
      };
      walk(root);
      return out;
    };
    expect(leaves(mo0ws0)).toHaveLength(0);
    expect(leaves(tree).length + leaves(mon0ws1).length).toBeGreaterThanOrEqual(2);
    expect(leaves(mon0ws1)).toHaveLength(2);

    winA._workspace = ctx.workspaces[0];
    winB._workspace = ctx.workspaces[0];

    wm._rehomeWorkspaceWindowsBeforeRemoval(1);
    tree.removeWorkspace(1);
    tree.workspaceManager.renumberWorkspacesAfterRemoval(1);
    if (wm._liveForestSeeded) seedLiveForest(wm);

    expect(parentOf(wm, nodeA)?.nodeValue).toBe("mo0ws0");
    expect(parentOf(wm, nodeB)?.nodeValue).toBe("mo0ws0");
    expect(kidsOf(wm, parentOf(wm, nodeA))).toEqual(expect.arrayContaining([nodeA, nodeB]));
  });
});
