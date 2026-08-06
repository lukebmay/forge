import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { Node, NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { GrabOp } from "../../mocks/gnome/Meta.js";

/**
 * AP2 StructureChanged: Move / Swap / drag-end → ≤1 full commit (renderTree) per gesture.
 * Formulas: docs/dev/actions.md StructureChanged.
 */
describe("AP2 StructureChanged one-commit", () => {
  let ctx;
  let pendingTimeouts;
  const realTimeoutAdd = GLib.timeout_add;

  beforeEach(() => {
    pendingTimeouts = [];
    GLib.timeout_add = (priority, interval, cb) => {
      pendingTimeouts.push(cb);
      return pendingTimeouts.length;
    };
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
        "tabbed-tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    GLib.timeout_add = realTimeoutAdd;
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function flushTimeouts() {
    while (pendingTimeouts.length) {
      const cb = pendingTimeouts.shift();
      if (cb() === true) pendingTimeouts.push(cb);
    }
  }

  function tiledPair() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const winA = createMockWindow({ id: 1, wm_class: "AppA", workspace: ctx.workspaces[0] });
    const winB = createMockWindow({ id: 2, wm_class: "AppB", workspace: ctx.workspaces[0] });
    const nodeA = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winA);
    const nodeB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winB);
    nodeA.mode = WINDOW_MODES.TILE;
    nodeB.mode = WINDOW_MODES.TILE;
    return { monitor, winA, winB, nodeA, nodeB };
  }

  function putInTabbedCon(nodeA, nodeB) {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = new Node(NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    monitor.appendChild(con);
    con.appendChild(nodeA);
    con.appendChild(nodeB);
    return con;
  }

  it("Move: ≤1 renderTree per gesture (incl. deferred tabbed settle)", () => {
    const { winA, nodeA, nodeB } = tiledPair();
    putInTabbedCon(nodeA, nodeB);
    ctx.display.get_focus_window.mockReturnValue(winA);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    vi.spyOn(ctx.tree, "move").mockReturnValue(true);

    wm().command({ name: "Move", direction: "Right" });
    flushTimeouts();

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith("move-window", { force: true });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith("move-window", true);
    expect(renderSpy.mock.calls.some((c) => String(c[0]).includes("move-tabbed-queue"))).toBe(
      false
    );
    expect(renderSpy.mock.calls.some((c) => String(c[0]).includes("move-stacked-queue"))).toBe(
      false
    );
  });

  it("Move tabbed: deferred settle sets lastTabFocus without second C", () => {
    const { winA, nodeA, nodeB } = tiledPair();
    const con = putInTabbedCon(nodeA, nodeB);
    ctx.display.get_focus_window.mockReturnValue(winA);

    vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    vi.spyOn(ctx.tree, "move").mockImplementation((node) => {
      // Stay in tabbed group for deferred path.
      if (node.parentNode !== con) con.appendChild(node);
      return true;
    });

    wm().command({ name: "Move", direction: "Right" });
    flushTimeouts();

    expect(con.lastTabFocus).toBe(winA);
    expect(wm().renderTree).toHaveBeenCalledTimes(1);
  });

  it("Swap: exactly one renderTree", () => {
    const { winA, nodeA, nodeB } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);
    vi.spyOn(ctx.tree, "swap").mockImplementation(() => {});

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().command({ name: "Swap", direction: "Right" });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith("swap", true);
    expect(wm().tree.swap).toHaveBeenCalledWith(nodeA, expect.anything());
    void nodeB;
  });

  it("SwapNext: exactly one renderTree when swapped", () => {
    const { winA, nodeA } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);
    vi.spyOn(ctx.tree, "swapSibling").mockReturnValue(nodeA);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().command({ name: "SwapNext" });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith("swap-sibling", true);
  });

  it("drag drop swap path: ≤1 renderTree for full grab-end gesture", () => {
    const { winA, nodeA, nodeB } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);

    // Drive drop op via dragDrop internals when available.
    const dd = wm().dragDrop;
    expect(dd).toBeTruthy();

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "findNodeWindow").mockReturnValue(nodeA);
    vi.spyOn(dd, "moveWindowToPointer").mockImplementation((focusNode) => {
      // Simulate swap drop: M only (no mid-drop C).
      ctx.tree.swapPairs(nodeB, focusNode);
    });

    // Grab begin freezes; end unfreezes + one commit.
    dd._handleGrabOpBegin?.(null, winA, GrabOp.WINDOW_BASE);
    dd._handleGrabOpEnd?.(null, winA, GrabOp.WINDOW_BASE);

    const reasons = renderSpy.mock.calls.map((c) => c[0]);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(["grab-op-end"]);
    expect(reasons).not.toContain("drag-swap");
  });
});
