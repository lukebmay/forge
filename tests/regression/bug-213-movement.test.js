import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  kidsOf,
} from "../mocks/helpers/index.js";
import { MotionDirection } from "../mocks/gnome/Meta.js";

/**
 * Bug #213: keyboard Move directions. Product TILES path is
 * wm.command({ name: "Move" }) → Mark 2, not tree.move.
 */

describe("Bug #213: keyboard Move (product TILES)", () => {
  let ctx;
  const wm = () => ctx.windowManager;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
        "tabbed-tiling-mode-enabled": true,
      },
    });
    wm().renderTree = vi.fn();
    wm().movePointerWith = vi.fn();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  function tiledOnMonitor(ids) {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const nodes = ids.map((id) => {
      const win = createMockWindow({ id, wm_class: `App${id}` });
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
      node.mode = WINDOW_MODES.TILE;
      return { win, node };
    });
    return { monitor, nodes };
  }

  it("in-axis Move swaps adjacent siblings (wrap + order)", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B"]);
    const [a, b] = nodes;
    ctx.display.get_focus_window.mockReturnValue(a.win);

    wm().command({ name: "Move", direction: "right" });

    const wrapRight = kidsOf(wm(), monitor);
    expect(wrapRight).toHaveLength(1);
    expect(kidsOf(wm(), wrapRight[0])).toEqual([b.node, a.node]);
  });

  it("in-axis Move left wrap-rotates the leftmost leaf", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B"]);
    const [a, b] = nodes;
    ctx.display.get_focus_window.mockReturnValue(a.win);

    wm().command({ name: "Move", direction: "left" });

    const wrapLeft = kidsOf(wm(), monitor);
    expect(wrapLeft).toHaveLength(1);
    expect(kidsOf(wm(), wrapLeft[0])).toEqual([b.node, a.node]);
  });

  it("in-axis Move swaps the middle of three", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B", "C"]);
    const [a, b, c] = nodes;
    ctx.display.get_focus_window.mockReturnValue(b.win);

    wm().command({ name: "Move", direction: "right" });

    const wrapMid = kidsOf(wm(), monitor);
    expect(wrapMid).toHaveLength(1);
    expect(kidsOf(wm(), wrapMid[0])).toEqual([a.node, c.node, b.node]);
  });

  it("in-axis edge wrap-rotates last→first (does not pairwise-swap)", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B", "C"]);
    const [a, b, c] = nodes;
    ctx.display.get_focus_window.mockReturnValue(c.win);

    wm().command({ name: "Move", direction: "right" });

    const wrapEdge = kidsOf(wm(), monitor);
    expect(wrapEdge).toHaveLength(1);
    expect(kidsOf(wm(), wrapEdge[0])).toEqual([c.node, a.node, b.node]);
  });

  it("does not Move a FLOAT window", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B"]);
    const [a, b] = nodes;
    a.node.mode = WINDOW_MODES.FLOAT;
    ctx.display.get_focus_window.mockReturnValue(a.win);

    wm().command({ name: "Move", direction: "right" });

    expect(kidsOf(wm(), monitor)).toEqual([a.node, b.node]);
  });

  it("does not Move a minimized window", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B"]);
    const [a, b] = nodes;
    a.win.minimized = true;
    ctx.display.get_focus_window.mockReturnValue(a.win);

    wm().command({ name: "Move", direction: "right" });

    expect(kidsOf(wm(), monitor)).toEqual([a.node, b.node]);
  });

  it("no-ops without focus", () => {
    const { monitor, nodes } = tiledOnMonitor(["A", "B"]);
    ctx.display.get_focus_window.mockReturnValue(null);
    const before = [...kidsOf(wm(), monitor)];

    wm().command({ name: "Move", direction: "right" });

    expect(kidsOf(wm(), monitor)).toEqual(before);
    expect(kidsOf(wm(), monitor)).toEqual([nodes[0].node, nodes[1].node]);
  });
});

describe("Bug #213: tree.next (Host/helper)", () => {
  let ctx;
  let tree;
  let monitorNode;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    tree = ctx.tree;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitorNode = monitor;
    monitorNode.layout = LAYOUT_TYPES.HSPLIT;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("returns the adjacent sibling for matching orientation", () => {
    const nodeA = tree.createNode(
      monitorNode.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "A" })
    );
    const nodeB = tree.createNode(
      monitorNode.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "B" })
    );
    nodeA.mode = WINDOW_MODES.TILE;
    nodeB.mode = WINDOW_MODES.TILE;

    expect(tree.next(nodeA, MotionDirection.RIGHT)).toBe(nodeB);
  });

  it("returns null/-1 for perpendicular orientation with no parent sibling", () => {
    const nodeA = tree.createNode(
      monitorNode.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "A" })
    );
    tree.createNode(monitorNode.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: "B" }));
    nodeA.mode = WINDOW_MODES.TILE;

    const next = tree.next(nodeA, MotionDirection.UP);
    expect(next === null || next === undefined || next === -1).toBe(true);
  });
});
