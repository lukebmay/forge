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
 * P6a: Move is Mark 2 OpSet + one commitLayout. The 220ms queueEvent callback
 * class (#324 stale node) is gone — do not keep a dead queue.
 */
describe("forge-ne1 (#324): Move has no delayed stale-node callback", () => {
  let ctx;
  let pending;
  const realTimeoutAdd = GLib.timeout_add;

  beforeEach(() => {
    pending = [];
    GLib.timeout_add = (priority, interval, cb) => {
      pending.push(cb);
      return pending.length;
    };
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    GLib.timeout_add = realTimeoutAdd;
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  function tiledPair() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createMockWindow({ id: "A", wm_class: "AppA" });
    const b = createMockWindow({ id: "B", wm_class: "AppB" });
    const nodeA = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, a);
    const nodeB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, b);
    nodeA.mode = WINDOW_MODES.TILE;
    nodeB.mode = WINDOW_MODES.TILE;
    return { monitor, winA: a, nodeA, nodeB };
  }

  it("does not queue a GLib timeout for Move", () => {
    const { winA } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);
    ctx.windowManager.renderTree = vi.fn();
    ctx.windowManager.command({ name: "Move", direction: "Right" });
    expect(pending).toHaveLength(0);
  });

  it("commits at most once and swaps sibling order", () => {
    const { monitor, winA, nodeA, nodeB } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);
    ctx.windowManager.renderTree = vi.fn();
    const commitSpy = vi.spyOn(ctx.windowManager, "commitLayout");

    ctx.windowManager.command({ name: "Move", direction: "Right" });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith("move-window", { force: true });
    expect(monitor.childNodes).toHaveLength(1);
    expect(monitor.childNodes[0].childNodes).toEqual([nodeB, nodeA]);
  });
});
