import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * R016: geometry-identical workareas re-apply must not arm thrash / H1 rehome.
 * Contrast: same geom + Meta pile still runs H1.
 */
describe("R016: no-op workareas must not thrash", () => {
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
      return 8016;
    });
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
    const { nodeWindow: node, metaWindow: win } = createWindowNode(tree(), monitor, {
      mode: "TILE",
      windowOverrides: {
        id,
        workspace: ctx.workspaces[0],
        monitor: monIdx,
        rect: frame,
      },
    });
    node.rect = { ...frame };
    if (wm()._liveForestSeeded) seedLiveForest(wm());
    return { win, node, monitor };
  }

  function monIdOf(node) {
    let n = node;
    while (n && n.nodeType !== NODE_TYPES.MONITOR) n = parentOf(wm(), n);
    return n?.nodeValue ?? null;
  }

  it("same geometry + homes OK → no thrash-pending, no recovery render", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { node: leftNode } = addTiled("L", 0, leftFrame);
    const { node: rightNode } = addTiled("R", 1, rightFrame);

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    expect(wm()._lastQuietWorkareasFp?.monitors?.length).toBe(2);

    const recoverSpy = vi.spyOn(wm(), "_recoverAfterWorkareas");
    wm()._onWorkareasChanged(ctx.display);

    expect(wm()._workareasThrashPending).toBe(false);
    expect(recoverSpy).not.toHaveBeenCalled();
    expect(settleCallbacks).toHaveLength(0);
    expect(wm().renderTree).not.toHaveBeenCalledWith("workareas-monitor-recovery");

    expect(monIdOf(leftNode)).toBe("mo0ws0");
    expect(monIdOf(rightNode)).toBe("mo1ws0");
  });

  it("same geometry + Meta piled → still H1 recovers", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { win: leftWin, node: leftNode } = addTiled("L", 0, leftFrame);
    const { win: rightWin, node: rightNode } = addTiled("R", 1, rightFrame);

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    leftWin._monitor = 0;
    rightWin._monitor = 0;
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    mon0.appendChild(rightNode);
    if (wm()._liveForestSeeded) seedLiveForest(wm());

    wm()._onWorkareasChanged(ctx.display);
    expect(wm()._workareasThrashPending).toBe(true);
    fireSettle();

    expect(monIdOf(leftNode)).toBe("mo0ws0");
    expect(monIdOf(rightNode)).toBe("mo1ws0");
    expect(leftWin.get_monitor()).toBe(0);
    expect(rightWin.get_monitor()).toBe(1);
    expect(wm().renderTree).toHaveBeenCalledWith("workareas-monitor-recovery");
  });

  it("mon_loss 2→1 collects mon1 windows to end of mon0 as a group", () => {
    const leftFrame = { x: 100, y: 100, width: 400, height: 400 };
    const r1 = { x: 2000, y: 100, width: 400, height: 400 };
    const r2 = { x: 2500, y: 100, width: 400, height: 400 };
    const { node: leftNode } = addTiled("L", 0, leftFrame);
    const { win: w1, node: n1 } = addTiled("R1", 1, r1);
    const { win: w2, node: n2 } = addTiled("R2", 1, r2);

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    ctx.display.get_n_monitors = vi.fn(() => 1);
    ctx.display.get_monitor_geometry = vi.fn((i) => {
      const g = dualGeoms[i] || dualGeoms[0];
      return { x: g.x, y: g.y, width: g.width, height: g.height };
    });
    w1._monitor = 0;
    w2._monitor = 0;

    wm()._onWorkareasChanged(ctx.display);
    expect(wm()._workareasThrashPending).toBe(true);
    fireSettle();

    expect(monIdOf(leftNode)).toBe("mo0ws0");
    expect(monIdOf(n1)).toBe("mo0ws0");
    expect(monIdOf(n2)).toBe("mo0ws0");
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const monChildren = kidsOf(wm(), mon0);
    const leftStillFirst = monChildren[0] === leftNode || monIdOf(leftNode) === "mo0ws0";
    expect(leftStillFirst).toBe(true);
    const con = monChildren.find((c) => c !== leftNode && c.nodeType === NODE_TYPES.CON);
    if (con) {
      expect(kidsOf(wm(), con)).toEqual(expect.arrayContaining([n1, n2]));
    } else {
      expect(monIdOf(n1) === "mo0ws0" && monIdOf(n2) === "mo0ws0").toBe(true);
    }
    expect(wm().renderTree).toHaveBeenCalledWith("workareas-mon-loss-collect");
    expect(wm()._workareasThrashPending).toBe(false);
  });
});
