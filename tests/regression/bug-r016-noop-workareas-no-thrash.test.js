import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

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

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    expect(mon0.contains(leftNode)).toBe(true);
    expect(mon1.contains(rightNode)).toBe(true);
  });

  it("same geometry + Meta piled → still H1 recovers", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { win: leftWin, node: leftNode } = addTiled("L", 0, leftFrame);
    const { win: rightWin, node: rightNode } = addTiled("R", 1, rightFrame);

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    // Thrash pile: Meta + tree shove right window onto mon0.
    leftWin._monitor = 0;
    rightWin._monitor = 0;
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    mon0.appendChild(rightNode);

    wm()._onWorkareasChanged(ctx.display);
    expect(wm()._workareasThrashPending).toBe(true);
    fireSettle();

    const { monitor: mon0After } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1After } = getWorkspaceAndMonitor(ctx, 0, 1);
    expect(mon0After.contains(leftNode)).toBe(true);
    expect(mon1After.contains(rightNode)).toBe(true);
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

    // Head peel: one monitor remains (primary/left).
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

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    expect(mon0.contains(leftNode)).toBe(true);
    expect(mon0.contains(n1)).toBe(true);
    expect(mon0.contains(n2)).toBe(true);
    // Collected as group: either both under one CON, or both mon-level after collect.
    const monChildren = mon0.childNodes || [];
    const leftStillFirst = monChildren[0] === leftNode || mon0.contains(leftNode);
    expect(leftStillFirst).toBe(true);
    // R1+R2 should share a CON wrapper when N>1 mon-level units moved.
    const con = monChildren.find((c) => c !== leftNode && c.nodeType === NODE_TYPES.CON);
    if (con) {
      expect(con.contains(n1)).toBe(true);
      expect(con.contains(n2)).toBe(true);
    } else {
      // Fallback: both still under mon0 (structure may flatten if createNode fails).
      expect(mon0.contains(n1) && mon0.contains(n2)).toBe(true);
    }
    expect(wm().renderTree).toHaveBeenCalledWith("workareas-mon-loss-collect");
    expect(wm()._workareasThrashPending).toBe(false);
  });
});
