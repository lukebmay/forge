import { describe, it, expect, beforeEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";

/**
 * WindowManager drag-and-drop tiling tests
 *
 * Tests for drag-drop behaviors including:
 * - moveWindowToPointer(): Tile windows by dragging to edges
 * - Region detection (left, right, top, bottom, center)
 * - Center layout modes (SWAP, STACKED, TABBED)
 * - Stacked/tabbed container handling
 * - Edge cases (self-drop, minimized, floating targets)
 */
describe("WindowManager - Drag and Drop Tiling", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "dnd-center-layout": "SWAP",
      },
    });
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  describe("moveWindowToPointer - LEFT Edge Drop", () => {
    it("should tile window to the left when dragged to left edge", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      // Target window (drop target)
      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      // Dragged window
      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point to left edge region (0-30% of width)
      setPointer(100, 540); // Left region

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      // After drop, the parent should be HSPLIT
      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
      // A LEFT drop also dictates order: the dragged window lands BEFORE the
      // target. Without this a RIGHT drop (same HSPLIT result) would pass too,
      // mirroring the dedicated "...after target when dropping right" test.
      const leftChildren = nodeWindow2.parentNode.childNodes.filter(
        (c) => c.nodeType === NODE_TYPES.WINDOW
      );
      expect(leftChildren.indexOf(nodeWindow2)).toBeLessThan(leftChildren.indexOf(nodeWindow1));
    });

    it("should create horizontal split container when dropping left in vertical layout", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const metaWindow3 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 540 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;

      const nodeWindow3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow3);
      nodeWindow3.mode = WINDOW_MODES.GRAB_TILE;

      // Point to left edge of window1
      setPointer(100, 270);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow3, false);

      const nest = nodeWindow3.parentNode;
      expect(nest.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.childNodes).toEqual(expect.arrayContaining([nodeWindow1, nodeWindow3]));
      expect(nest.childNodes).not.toContain(nodeWindow2);
      expect(nest.childNodes.indexOf(nodeWindow3)).toBeLessThan(
        nest.childNodes.indexOf(nodeWindow1)
      );
      expect(nodeWindow2.parentNode).toBe(monitor);
      expect(monitor.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(monitor.childNodes).toContain(nest);
      expect(monitor.childNodes).toContain(nodeWindow2);
    });
  });

  describe("moveWindowToPointer - RIGHT Edge Drop", () => {
    it("should tile window to the right when dragged to right edge", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point to right edge region (70-100% of width)
      setPointer(1800, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should place dragged window after target when dropping right", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(1800, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      // Window 2 should come after window 1 in the tree
      const parent = nodeWindow2.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idx1 = children.indexOf(nodeWindow1);
      const idx2 = children.indexOf(nodeWindow2);
      expect(idx2).toBeGreaterThan(idx1);
    });
  });

  describe("moveWindowToPointer - TOP Edge Drop", () => {
    it("should tile window above target when dragged to top edge", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point to top edge region (0-30% of height)
      setPointer(960, 100);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      // Should create vertical split
      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should create vertical split container when dropping top in horizontal layout", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow3 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;

      const nodeWindow3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow3);
      nodeWindow3.mode = WINDOW_MODES.GRAB_TILE;

      // Point to top edge of window1
      setPointer(480, 100);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow3, false);

      // A new container should have been created with VSPLIT
      expect(nodeWindow3.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });
  });

  describe("moveWindowToPointer - BOTTOM Edge Drop", () => {
    it("should tile window below target when dragged to bottom edge", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point to bottom edge region (70-100% of height)
      setPointer(960, 1000);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should place dragged window after target when dropping bottom", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(960, 1000);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      const parent = nodeWindow2.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idx1 = children.indexOf(nodeWindow1);
      const idx2 = children.indexOf(nodeWindow2);
      expect(idx2).toBeGreaterThan(idx1);
    });
  });

  describe("moveWindowToPointer - CENTER Drop (SWAP mode)", () => {
    it("should swap windows when center drop with SWAP mode", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "SWAP";
        return "";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point to center region (30-70% of both dimensions)
      setPointer(480, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(swapSpy).toHaveBeenCalledWith(nodeWindow1, nodeWindow2);
    });
  });

  describe("moveWindowToPointer - CENTER Drop (STACKED mode)", () => {
    it("should create stacked container when center drop with STACKED mode", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "STACKED";
        return "";
      });
      // Product default is stack-off; enable for this STACKED-path test.
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return true;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(960, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      // Windows should now share a STACKED container
      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.STACKED);
    });
  });

  describe("moveWindowToPointer - CENTER Drop (TABBED mode)", () => {
    it("should create tabbed container when center drop with TABBED mode", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(960, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("moveWindowToPointer - CENTER Drop (stack mode disabled)", () => {
    function disableStackMode(dndCenterLayout) {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return dndCenterLayout;
        return "";
      });
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return false;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });
    }

    it("never creates STACKED when dnd-center-layout is stacked and stack mode is off", () => {
      disableStackMode("stacked");

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;
      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(960, 540);
      wm().nodeWinAtPointer = nodeWindow1;
      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(nodeWindow2.parentNode.layout).not.toBe(LAYOUT_TYPES.STACKED);
    });

    it("converts existing STACKED parent to TABBED on center join when stack mode is off", () => {
      disableStackMode("tabbed");

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const stackCon = createContainerNode(monitor, LAYOUT_TYPES.STACKED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(stackCon.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;
      const sibling = ctx.tree.createNode(stackCon.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      sibling.mode = WINDOW_MODES.TILE;

      const metaWindow3 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const dragged = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow3);
      dragged.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(480, 540);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode).toBe(stackCon);
      expect(stackCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(stackCon.childNodes).toEqual(expect.arrayContaining([target, sibling, dragged]));
      expect(stackCon.childNodes).toHaveLength(3);
    });
  });

  describe("moveWindowToPointer - Preview Mode", () => {
    it("should not modify tree when preview is true", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;
      nodeWindow2.previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };

      setPointer(100, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      const childCountBefore = monitor.childNodes.length;

      wm().moveWindowToPointer(nodeWindow2, true);

      // Tree should not be modified in preview mode
      const childCountAfter = monitor.childNodes.length;
      expect(childCountAfter).toBe(childCountBefore);
    });

    it("should show preview hint when dragging", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      nodeWindow2.previewHint = previewHint;

      setPointer(100, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, true);

      expect(previewHint.show).toHaveBeenCalled();
    });
  });

  describe("moveWindowToPointer - Stacked Container Edge Drops", () => {
    it("should detach window from stacked container when dropping on left edge", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow3 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.STACKED;

      // Create stacked windows
      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;

      const nodeWindow3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow3);
      nodeWindow3.mode = WINDOW_MODES.GRAB_TILE;

      // Point to left edge
      setPointer(100, 540);

      wm().nodeWinAtPointer = nodeWindow1;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(nodeWindow3, false);

      // Should have called split to detach window
      expect(splitSpy).toHaveBeenCalled();
    });

    it("should keep stacked container valid after window detachment", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });
      const metaWindow3 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.STACKED;

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;

      const nodeWindow3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow3);
      nodeWindow3.mode = WINDOW_MODES.GRAB_TILE;

      // Set detachWindow flag
      nodeWindow3.detachWindow = true;

      setPointer(100, 540);
      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow3, false);

      // The dragged window is detached into a new HSPLIT container under the
      // monitor (the drop re-creates the node, so locate it by metaWindow).
      const draggedNode = ctx.tree.findNode(metaWindow3);
      expect(draggedNode).not.toBeNull();
      expect(draggedNode.parentNode.nodeType).toBe(NODE_TYPES.CON);
      expect(draggedNode.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);

      // The stacked container keeps exactly the two non-dragged windows and stays
      // a direct-child parent of both (not collapsed into a 1-child invalid state).
      expect(monitor.layout).toBe(LAYOUT_TYPES.STACKED);
      const stackedWindows = monitor.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(stackedWindows).toEqual([nodeWindow1, nodeWindow2]);
    });
  });

  describe("moveWindowToPointer - Edge Cases", () => {
    it("should do nothing when dropping window onto itself", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(960, 540);

      // Window pointing to itself
      wm().nodeWinAtPointer = nodeWindow1;

      const initialParent = nodeWindow1.parentNode;
      const initialChildCount = initialParent.childNodes.length;

      wm().moveWindowToPointer(nodeWindow1, false);

      // Nothing should change
      expect(nodeWindow1.parentNode).toBe(initialParent);
      expect(initialParent.childNodes.length).toBe(initialChildCount);
    });
  });

  describe("Region Detection", () => {
    it("should detect left region correctly (0-30% of width)", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point at 29% of width (within left region)
      setPointer(290, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should detect right region correctly (70-100% of width)", () => {
      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point at 71% of width (within right region)
      setPointer(710, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(nodeWindow2.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should detect center region correctly (30-70% of both dimensions)", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "SWAP";
        return "";
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });
      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const nodeWindow1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      nodeWindow1.mode = WINDOW_MODES.TILE;

      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.GRAB_TILE;

      // Point at 50% of both dimensions (center region)
      setPointer(500, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(nodeWindow2, false);

      expect(swapSpy).toHaveBeenCalled();
    });
  });

  describe("moveWindowToPointer - min-size refuse", () => {
    it("preview paints invalid and execute does not reparent", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const metaTarget = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
        workspace: workspace0(),
      });
      const metaDrag = createMockWindow({
        rect: new Rectangle({ x: 800, y: 0, width: 800, height: 600 }),
        workspace: workspace0(),
        size_hints: { min_width: 0, min_height: 400 },
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const target = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaTarget);
      target.mode = WINDOW_MODES.TILE;
      target.rect = { x: 0, y: 0, width: 800, height: 600 };
      target.renderRect = target.rect;

      const dragged = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaDrag);
      dragged.mode = WINDOW_MODES.GRAB_TILE;
      dragged.previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewZoneActors = {
        TOP: {
          set_style_class_name: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(),
          set_position: vi.fn(),
          set_size: vi.fn(),
        },
        BOTTOM: {
          set_style_class_name: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(),
          set_position: vi.fn(),
          set_size: vi.fn(),
        },
        LEFT: {
          set_style_class_name: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(),
          set_position: vi.fn(),
          set_size: vi.fn(),
        },
        RIGHT: {
          set_style_class_name: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(),
          set_position: vi.fn(),
          set_size: vi.fn(),
        },
        CENTER: {
          set_style_class_name: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(),
          set_position: vi.fn(),
          set_size: vi.fn(),
        },
      };

      // TOP edge of target (half height 300 < min 400)
      setPointer(400, 80);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, true);

      // VSPLIT edges (TOP/BOTTOM) invalid; HSPLIT (LEFT/RIGHT) and TAB (CENTER) ok.
      expect(dragged.previewZoneActors.TOP.set_style_class_name).toHaveBeenCalledWith(
        "window-tilepreview-invalid"
      );
      expect(dragged.previewZoneActors.BOTTOM.set_style_class_name).toHaveBeenCalledWith(
        "window-tilepreview-invalid"
      );
      const leftCalls = dragged.previewZoneActors.LEFT.set_style_class_name.mock.calls.map(
        (c) => c[0]
      );
      const centerCalls = dragged.previewZoneActors.CENTER.set_style_class_name.mock.calls.map(
        (c) => c[0]
      );
      expect(leftCalls.every((c) => c !== "window-tilepreview-invalid")).toBe(true);
      expect(centerCalls.every((c) => c !== "window-tilepreview-invalid")).toBe(true);

      const parentBefore = dragged.parentNode;
      wm().moveWindowToPointer(dragged, false);
      expect(dragged.parentNode).toBe(parentBefore);
      expect(dragged.parentNode.layout).not.toBe(LAYOUT_TYPES.VSPLIT);
    });
  });

  describe("titlebar grab from TABBED", () => {
    it("WINDOW_BASE grab sets GRAB_TILE and arms pointer track", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;

      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const tabCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const a = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(wm().dragDrop._grabPointerTrack).toBeTruthy();

      wm()._grabStartPointer = [100, 100];
      setPointer(100, 100); // parked at grab start
      wm().dragDrop._grabPointerTrack.lastX = 1440;
      wm().dragDrop._grabPointerTrack.lastY = 540;
      const ptr = wm().dragDrop.getDragPointer(b);
      expect(ptr[0]).toBe(1440);
      expect(ptr[1]).toBe(540);

      // Live pointer moved → prefer it over stale track.
      setPointer(500, 500);
      const live = wm().dragDrop.getDragPointer(b);
      expect(live[0]).toBe(500);
      expect(live[1]).toBe(500);
    });

    it("grab-begin does not start min-size probe during MOVING grab", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      b.mode = WINDOW_MODES.TILE;

      const probe = vi.fn();
      wm().ensureWindowMinSizeKnown = probe;
      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(probe).not.toHaveBeenCalled();
      expect(metaB._forgeMinProbing).toBeFalsy();
    });

    it("preview motion does not queue dest min probes", () => {
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const a = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.GRAB_TILE;
      b.mode = WINDOW_MODES.TILE;
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };
      b.renderRect = b.rect;

      const queue = vi.spyOn(wm(), "_queueMinSizeProbe");
      setPointer(1000, 540);
      wm().nodeWinAtPointer = b;
      wm().moveWindowToPointer(a, true);
      expect(queue).not.toHaveBeenCalled();
    });

    it("grab-begin cancels in-flight min probes", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      b.mode = WINDOW_MODES.TILE;

      const cancel = vi.spyOn(wm(), "_cancelMinSizeProbes");
      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(cancel).toHaveBeenCalled();
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
    });

    it("grab-end queues only dragged window with delayed flush (no immediate flush)", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const a = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;

      wm()._handleGrabOpBegin(global.display, metaA, GrabOp.WINDOW_BASE);
      const queue = vi.spyOn(wm(), "_queueMinSizeProbe");
      const flush = vi.spyOn(wm(), "_flushMinSizeProbeQueue");
      // Leftover dest in queue must be cleared; only dragged is re-queued.
      wm()._minSizeProbeQueue.add(metaB);
      wm()._handleGrabOpEnd(global.display, metaA, GrabOp.WINDOW_BASE);

      expect(queue).toHaveBeenCalledTimes(1);
      expect(queue.mock.calls[0][0]).toBe(metaA);
      expect(queue.mock.calls[0][1]?.delayMs).toBeGreaterThanOrEqual(400);
      expect(flush).not.toHaveBeenCalled();
      expect(wm()._minSizeProbeQueue.has(metaB)).toBe(false);
      expect(wm()._minSizeProbeQueue.has(metaA)).toBe(true);
    });

    it("failed shrink probe sets gave-up so ensure does not retry", () => {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);

      const pending = [];
      wm()._wmSchedule = (_ms, cb) => {
        pending.push(cb);
        return pending.length;
      };
      wm()._wmCancel = () => {};

      // Frame never shrinks (Chrome/Wayland ignore tiny resize).
      meta.move_resize_frame = vi.fn();
      meta.get_frame_rect = vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }));

      wm().ensureWindowMinSizeKnown(meta);
      expect(meta._forgeMinProbing).toBe(true);
      expect(pending.length).toBeGreaterThanOrEqual(1);
      // Fire probe settle timer.
      pending[0]();
      expect(meta._forgeMinProbeGaveUp).toBe(true);

      // Clear flags as clear timer would.
      meta._forgeMinProbing = false;
      meta._forgeMinProbePending = false;
      const before = meta.move_resize_frame.mock.calls.length;
      wm().ensureWindowMinSizeKnown(meta);
      expect(meta.move_resize_frame.mock.calls.length).toBe(before);
      expect(meta._forgeMinProbing).toBeFalsy();
    });

    it("peels TABBED leaf onto foreign TILE via titlebar-style GRAB_TILE", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });

      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaC = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const tabCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const a = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaB);
      const c = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaC);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.GRAB_TILE;
      c.mode = WINDOW_MODES.TILE;
      c.rect = { x: 960, y: 0, width: 960, height: 1080 };
      c.renderRect = c.rect;

      // LEFT edge of C → HSPLIT peel out of tab group
      setPointer(1000, 540);
      wm().nodeWinAtPointer = c;
      wm().moveWindowToPointer(b, false);

      expect(b.parentNode).not.toBe(tabCon);
      expect(tabCon.childNodes.includes(b)).toBe(false);
      expect(b.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });
  });
});
