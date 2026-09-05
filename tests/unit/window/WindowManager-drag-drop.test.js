import { describe, it, expect, beforeEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  setPointer,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
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
      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.HSPLIT);
      // A LEFT drop also dictates order: the dragged window lands BEFORE the
      // target. Without this a RIGHT drop (same HSPLIT result) would pass too,
      // mirroring the dedicated "...after target when dropping right" test.
      const leftChildren = kidsOf(wm(), parentOf(wm(), nodeWindow2)).filter(
        (c) => c.nodeType === NODE_TYPES.WINDOW
      );
      expect(leftChildren.indexOf(nodeWindow2)).toBeLessThan(leftChildren.indexOf(nodeWindow1));
    });

    it("should join left edge in vertical layout into a new CON with target", () => {
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

      // Mark 2 Join invents wrap layout (aspect / preferredJoin) — not host zone→H.
      const nest = parentOf(wm(), nodeWindow3);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT, LAYOUT_TYPES.TABBED]).toContain(
        nest.layout
      );
      expect(kidsOf(wm(), nest)).toEqual(expect.arrayContaining([nodeWindow1, nodeWindow3]));
      expect(kidsOf(wm(), nest)).not.toContain(nodeWindow2);
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

      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("adjacent right-edge drop moves (swap) rather than inventing", () => {
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

      // In-axis adjacent → Mark 2 Move (swap). Both still share one parent.
      const parent = parentOf(wm(), nodeWindow2);
      expect(parent).toBe(parentOf(wm(), nodeWindow1));
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(children).toEqual(expect.arrayContaining([nodeWindow1, nodeWindow2]));
      expect(children).toHaveLength(2);
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
      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should join top edge in horizontal layout into a new CON with target", () => {
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

      const nest = parentOf(wm(), nodeWindow3);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT, LAYOUT_TYPES.TABBED]).toContain(
        nest.layout
      );
      expect(kidsOf(wm(), nest)).toEqual(expect.arrayContaining([nodeWindow1, nodeWindow3]));
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

      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("adjacent bottom-edge drop shares a parent (Move or Join)", () => {
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

      const parent = parentOf(wm(), nodeWindow2);
      expect(parent).toBeTruthy();
      expect(kidsOf(wm(), parent)).toEqual(expect.arrayContaining([nodeWindow1, nodeWindow2]));
    });
  });

  describe("moveWindowToPointer - CENTER Drop (SWAP pref ignored)", () => {
    it("CENTER always Groups even when dnd-center-layout=SWAP", () => {
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

      wm().moveWindowToPointer(nodeWindow2, false);

      // D101: CENTER is always Group (TAB) — SWAP is not a live mapping.
      expect(parentOf(wm(), nodeWindow1)).toBe(parentOf(wm(), nodeWindow2));
      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("moveWindowToPointer - CENTER Drop (STACKED pref → Group tab)", () => {
    it("CENTER Groups as TABBED even when dnd-center-layout=STACKED", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "STACKED";
        return "";
      });
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

      // Mark 2 Group always invents/flips TABBED (not STACKED from prefs).
      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.TABBED);
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

      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.TABBED);
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

      expect(parentOf(wm(), nodeWindow2).layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(wm(), nodeWindow2).layout).not.toBe(LAYOUT_TYPES.STACKED);
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

      expect(parentOf(wm(), dragged)).toBe(stackCon);
      expect(stackCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), stackCon)).toEqual(expect.arrayContaining([target, sibling, dragged]));
      expect(kidsOf(wm(), stackCon)).toHaveLength(3);
    });
  });

  describe("moveWindowToPointer - Mark 2 mapped drops", () => {
    it("same-parent HSPLIT adjacent RIGHT reorders siblings", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const split = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const a = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.GRAB_TILE;
      b.mode = WINDOW_MODES.TILE;
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      setPointer(1800, 540);
      wm().nodeWinAtPointer = b;
      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const commitPtr = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      wm().moveWindowToPointer(a, false);

      expect(kidsOf(wm(), split)).toEqual([b, a]);
      expect(parentOf(wm(), a)).toBe(split);
      expect(parentOf(wm(), b)).toBe(split);
      expect(commitMark2).toHaveBeenCalled();
      expect(commitPtr).toHaveBeenCalled();
    });

    it("CENTER into TABBED CON from adjacent CON sibling joins the group", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const row = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const tabCon = createContainerNode(row, LAYOUT_TYPES.TABBED, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      target.mode = WINDOW_MODES.TILE;
      target.rect = { x: 960, y: 0, width: 960, height: 1080 };
      const dragged = ctx.tree.createNode(row.nodeValue, NODE_TYPES.WINDOW, metaB);
      dragged.mode = WINDOW_MODES.GRAB_TILE;
      dragged.rect = { x: 0, y: 0, width: 960, height: 1080 };

      setPointer(1440, 540);
      wm().nodeWinAtPointer = target;
      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const commitPtr = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      wm().moveWindowToPointer(dragged, false);

      expect(parentOf(wm(), dragged)).toBe(tabCon);
      expect(kidsOf(wm(), tabCon)).toContain(target);
      expect(kidsOf(wm(), tabCon)).toContain(dragged);
      expect(commitMark2).toHaveBeenCalled();
      expect(commitPtr).toHaveBeenCalled();
    });
  });

  describe("synthetic dnd-drop — Mark 2 mapped", () => {
    function api() {
      return new SessionApi({
        extWm: ctx.windowManager,
        settings: ctx.settings,
      });
    }

    it("RIGHT adjacent HSPLIT reorders via Mark 2, not SurfaceOp", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const split = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        id: "dnd-move-a",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        id: "dnd-move-b",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const a = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const commitPtr = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      const out = api()._dndDropOp("id:dnd-move-a", "id:dnd-move-b", "RIGHT", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("move");
      expect(kidsOf(wm(), split)).toEqual([b, a]);
      expect(parentOf(wm(), a)).toBe(split);
      expect(parentOf(wm(), b)).toBe(split);
      expect(commitMark2).toHaveBeenCalledWith(
        a,
        expect.anything(),
        expect.objectContaining({ op: "move", dir: "right" })
      );
      expect(commitPtr).toHaveBeenCalled();
    });

    it("CENTER from below a TABBED CON groups via Mark 2 (enter, not promote-join)", () => {
      // Host bug: Nautilus below Ghostty-in-TAB — Join flattened; Group enters.
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const col = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaG = createMockWindow({
        id: "dnd-below-g",
        rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const metaN = createMockWindow({
        id: "dnd-below-n",
        rect: new Rectangle({ x: 0, y: 540, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const tabCon = createContainerNode(col, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 540,
      });
      const ghostty = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaG);
      ghostty.mode = WINDOW_MODES.TILE;
      ghostty.rect = { x: 0, y: 0, width: 1920, height: 540 };
      const nautilus = ctx.tree.createNode(col.nodeValue, NODE_TYPES.WINDOW, metaN);
      nautilus.mode = WINDOW_MODES.TILE;
      nautilus.rect = { x: 0, y: 540, width: 1920, height: 540 };

      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const commitPtr = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      const out = api()._dndDropOp("id:dnd-below-n", "id:dnd-below-g", "CENTER", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("group");
      expect(parentOf(wm(), nautilus)).toBe(tabCon);
      expect(parentOf(wm(), ghostty)).toBe(tabCon);
      expect(tabCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), tabCon)).toEqual(expect.arrayContaining([ghostty, nautilus]));
      expect(commitMark2).toHaveBeenCalledWith(
        nautilus,
        expect.anything(),
        expect.objectContaining({ op: "group", dir: "up" })
      );
      expect(commitPtr).toHaveBeenCalled();
    });

    it("CENTER into TABBED CON from adjacent sibling groups via Mark 2, not SurfaceOp", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const row = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        id: "dnd-join-t",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        id: "dnd-join-s",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const dragged = ctx.tree.createNode(row.nodeValue, NODE_TYPES.WINDOW, metaB);
      dragged.mode = WINDOW_MODES.TILE;
      dragged.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const tabCon = createContainerNode(row, LAYOUT_TYPES.TABBED, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      const target = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      target.mode = WINDOW_MODES.TILE;
      target.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const commitPtr = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      const out = api()._dndDropOp("id:dnd-join-s", "id:dnd-join-t", "CENTER", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("group");
      expect(parentOf(wm(), dragged)).toBe(tabCon);
      expect(kidsOf(wm(), tabCon)).toContain(target);
      expect(kidsOf(wm(), tabCon)).toContain(dragged);
      expect(commitMark2).toHaveBeenCalledWith(
        dragged,
        expect.anything(),
        expect.objectContaining({ op: "group", dir: "right" })
      );
      expect(commitPtr).toHaveBeenCalled();
    });

    it("CENTER ignores dnd-center-layout=SWAP (always Group)", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "SWAP";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const split = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        id: "dnd-swap-a",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        id: "dnd-swap-b",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const a = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const out = api()._dndDropOp("id:dnd-swap-a", "id:dnd-swap-b", "CENTER", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("group");
      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), split)).toEqual(expect.arrayContaining([a, b]));
      expect(commitMark2).toHaveBeenCalledWith(
        a,
        expect.anything(),
        expect.objectContaining({ op: "group", dir: "right" })
      );
    });

    it("CENTER HSPLIT pair groups via Mark 2 group", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const split = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        id: "dnd-group-a",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        id: "dnd-group-b",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const a = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaA);
      const b = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaB);
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const commitMark2 = vi.spyOn(wm().dragDrop, "_commitDropMark2");
      const out = api()._dndDropOp("id:dnd-group-a", "id:dnd-group-b", "CENTER", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("group");
      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), split)).toEqual(expect.arrayContaining([a, b]));
      expect(parentOf(wm(), a)).toBe(split);
      expect(parentOf(wm(), b)).toBe(split);
      expect(commitMark2).toHaveBeenCalledWith(
        a,
        expect.anything(),
        expect.objectContaining({ op: "group", dir: "right" })
      );
    });

    it("empty-mon synthetic drop uses host Meta transfer when Forest mon miss", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const meta = createMockWindow({
        id: "dnd-empty-src",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const src = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
      src.mode = WINDOW_MODES.TILE;

      expect(wm().dragDrop._commitResolvedDrop).toBeUndefined();
      expect(wm().dragDrop._commitDropSurface).toBeUndefined();
      const empty = vi.spyOn(wm().dragDrop, "_commitEmptyMonitorDrop").mockReturnValue(true);
      const out = api()._dndEmptyMonDropOp(src, { match: { node: src, id: "dnd-empty-src" } }, 1, {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      expect(out.op).toBe("move");
      expect(empty).toHaveBeenCalledWith(src, 1);
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

      const childCountBefore = kidsOf(wm(), monitor).length;

      wm().moveWindowToPointer(nodeWindow2, true);

      // Tree should not be modified in preview mode
      const childCountAfter = kidsOf(wm(), monitor).length;
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
    it("left-edge drop joins onto target (Mark 2; not host detach)", () => {
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

      setPointer(100, 540);
      wm().nodeWinAtPointer = nodeWindow1;
      wm().moveWindowToPointer(nodeWindow3, false);

      const nest = parentOf(wm(), nodeWindow3);
      expect(nest?.nodeType).toBe(NODE_TYPES.CON);
      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT, LAYOUT_TYPES.TABBED]).toContain(
        nest.layout
      );
      expect(kidsOf(wm(), nest).map((c) => c.nodeType)).toContain(NODE_TYPES.WINDOW);
    });

    it("detachWindow flag is cleared after pointer join", () => {
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
      nodeWindow3.detachWindow = true;

      setPointer(100, 540);
      wm().nodeWinAtPointer = nodeWindow1;
      wm().moveWindowToPointer(nodeWindow3, false);

      const draggedNode = ctx.tree.findNode(metaWindow3);
      expect(draggedNode).not.toBeNull();
      expect(parentOf(wm(), draggedNode)?.nodeType).toBe(NODE_TYPES.CON);
      expect(draggedNode.detachWindow).toBe(false);
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

      const initialParent = parentOf(wm(), nodeWindow1);
      const initialChildCount = kidsOf(wm(), initialParent).length;

      wm().moveWindowToPointer(nodeWindow1, false);

      // Nothing should change
      expect(parentOf(wm(), nodeWindow1)).toBe(initialParent);
      expect(kidsOf(wm(), initialParent).length).toBe(initialChildCount);
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

      // Outer left of five-zone (center band is 25–75%)
      setPointer(50, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT, LAYOUT_TYPES.TABBED]).toContain(
        parentOf(wm(), nodeWindow2).layout
      );
    });

    it("should detect right region correctly (outer right of five-zone)", () => {
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

      setPointer(950, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT, LAYOUT_TYPES.TABBED]).toContain(
        parentOf(wm(), nodeWindow2).layout
      );
    });

    it("should detect center region as Group (TABBED)", () => {
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

      setPointer(500, 500);

      wm().nodeWinAtPointer = nodeWindow1;

      wm().moveWindowToPointer(nodeWindow2, false);

      const parent = parentOf(wm(), nodeWindow1);
      expect(parent?.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), parent).map((c) => c.nodeType)).toEqual([
        NODE_TYPES.WINDOW,
        NODE_TYPES.WINDOW,
      ]);
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

      // TOP edge refuses (half-height 300 < min 400).
      expect(dragged.previewZoneActors.TOP.set_style_class_name).toHaveBeenCalledWith(
        "window-tilepreview-invalid"
      );
      expect(dragged.previewZoneActors.BOTTOM.set_style_class_name).toHaveBeenCalledWith(
        "window-tilepreview-invalid"
      );

      const parentBefore = parentOf(wm(), dragged);
      wm().moveWindowToPointer(dragged, false);
      // Refuse commit — structure unchanged (avoid circular toBe on parent identity).
      expect(parentOf(wm(), dragged)?.nodeType).toBe(parentBefore?.nodeType);
      expect(parentOf(wm(), dragged)?.layout).toBe(parentBefore?.layout);
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
      expect(wm()._wmSources.has("grabPointerPoll")).toBe(true);

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

    it("titlebar poll paints zones without a prior tab peel (cold Wayland)", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "tiling-mode-enabled") return true;
        if (key === "preview-hint-enabled") return true;
        return false;
      });
      // Stage silent — poll alone must paint (Mutter grab often eats motion).
      global.stage = { connect: undefined, disconnect: () => {} };

      const metaGrok = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
        wm_class: "Google-chrome",
      });
      const metaGhost = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
        wm_class: "com.mitchellh.ghostty",
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const grok = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaGrok);
      const ghost = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaGhost);
      grok.mode = WINDOW_MODES.TILE;
      ghost.mode = WINDOW_MODES.TILE;
      grok.rect = { x: 0, y: 0, width: 960, height: 1080 };
      grok.renderRect = { ...grok.rect };
      ghost.rect = { x: 960, y: 0, width: 960, height: 1080 };
      ghost.renderRect = { ...ghost.rect };

      const setSpy = vi.spyOn(wm()._wmSources, "set");
      setPointer(100, 100);
      wm()._handleGrabOpBegin(global.display, metaGrok, GrabOp.WINDOW_BASE);
      expect(grok.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(grok.previewHint).toBeFalsy();
      expect(wm()._wmSources.has("grabPointerPoll")).toBe(true);

      const pollCall = setSpy.mock.calls.find((c) => c[0] === "grabPointerPoll");
      expect(pollCall).toBeTruthy();
      const tick = pollCall[2];

      // Poll sees pointer over Ghostty; cold path must create actors + show.
      wm()._grabStartPointer = [100, 100];
      setPointer(1440, 540);
      tick();

      expect(grok.previewHint).toBeTruthy();
      expect(grok.previewZoneActors).toBeTruthy();
      expect(Object.keys(grok.previewZoneActors).length).toBeGreaterThan(0);
    });

    it("titlebar position-changed paints when display focus lags drag node", async () => {
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
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      // Focus stays on A while B is grabbed (Wayland focus lag).
      Object.defineProperty(wm(), "focusMetaWindow", {
        configurable: true,
        get: () => metaA,
      });

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(wm()._draggedNodeWindow).toBe(b);

      setPointer(200, 540);
      const moving = vi.spyOn(wm().dragDrop, "_handleMoving");
      wm().updateMetaPositionSize(metaB, "position-changed");
      expect(moving).toHaveBeenCalledWith(b);
      moving.mockRestore();
    });

    it("grab-begin/end has no shrink-probe APIs (D049)", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      b.mode = WINDOW_MODES.TILE;

      expect(typeof wm().ensureWindowMinSizeKnown).toBe("undefined");
      expect(typeof wm()._queueMinSizeProbe).toBe("undefined");
      expect(typeof wm()._cancelMinSizeProbes).toBe("undefined");

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      wm()._handleGrabOpEnd(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(metaB._forgeMinProbing).toBeFalsy();
      expect(wm()._minSizeProbeQueue).toBeUndefined();
    });

    it("unmanaged mid-grab clears dragged node / GRAB_TILE / stage track", async () => {
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      b.mode = WINDOW_MODES.TILE;

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(wm()._draggedNodeWindow).toBe(b);
      expect(wm().dragDrop._grabPointerTrack).toBeTruthy();
      wm().freezeRender();

      wm()._clearGrabOnUnmanaged(metaB);
      expect(wm()._draggedNodeWindow).toBeNull();
      expect(wm().grabOp).toBeNull();
      expect(b.mode).toBe(WINDOW_MODES.TILE);
      expect(wm().dragDrop._grabPointerTrack).toBeFalsy();
      expect(wm()._freezeRender).toBe(false);
    });

    it("FLOAT titlebar MOVING skips GRAB_TILE / stage track / grab-op-end commit", async () => {
      const { Logger } = await import("../../../lib/shared/logger.js");
      const MetaMod = await import("../../mocks/gnome/Meta.js");
      const GrabOp = MetaMod.GrabOp;
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaB);
      b.mode = WINDOW_MODES.FLOAT;
      b.rect = null;

      const debugSpy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
      const commitSpy = vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.FLOAT);
      expect(wm()._draggedNodeWindow).toBe(b);
      expect(wm().dragDrop._grabPointerTrack).toBeFalsy();
      expect(
        debugSpy.mock.calls.some((c) => String(c[0]).includes("dnd grab MOVING skip mode=FLOAT"))
      ).toBe(true);

      wm()._handleGrabOpEnd(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(commitSpy).not.toHaveBeenCalled();
      expect(
        debugSpy.mock.calls.some((c) =>
          String(c[0]).includes("dnd grab-op-end skip reason=no-grab-tile")
        )
      ).toBe(true);
      expect(wm()._draggedNodeWindow).toBeNull();

      debugSpy.mockRestore();
      commitSpy.mockRestore();
    });

    it("TILE titlebar MOVING logs grab and commits grab-op-end", async () => {
      const { Logger } = await import("../../../lib/shared/logger.js");
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
      a.rect = { x: 0, y: 0, width: 960, height: 1080 };
      b.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const debugSpy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
      const commitSpy = vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});
      vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

      wm()._handleGrabOpBegin(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
      expect(wm()._draggedNodeWindow).toBe(b);
      expect(wm().dragDrop._grabPointerTrack).toBeTruthy();
      expect(
        debugSpy.mock.calls.some((c) => String(c[0]).includes("dnd grab MOVING mode=TILE"))
      ).toBe(true);

      setPointer(200, 540);
      wm().nodeWinAtPointer = a;
      wm()._handleGrabOpEnd(global.display, metaB, GrabOp.WINDOW_BASE);
      expect(commitSpy).toHaveBeenCalledWith("grab-op-end", { force: true });
      expect(wm()._draggedNodeWindow).toBeNull();

      debugSpy.mockRestore();
      commitSpy.mockRestore();
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
      b.mode = WINDOW_MODES.TILE;
      c.mode = WINDOW_MODES.TILE;
      c.rect = { x: 960, y: 0, width: 960, height: 1080 };
      c.renderRect = c.rect;
      seedLiveForest(wm());
      b.mode = WINDOW_MODES.GRAB_TILE;

      // LEFT edge of C → pointer.release maps Join with onto=C (Mark 2 peels in unit).
      setPointer(1000, 540);
      wm().nodeWinAtPointer = c;
      const commit = vi.spyOn(wm().dragDrop, "_commitPointerOp");
      wm().moveWindowToPointer(b, false);

      expect(commit).toHaveBeenCalled();
      const resolved = commit.mock.calls[0]?.[1];
      expect(resolved?.op).toBe("join");
      expect(resolved?.args?.onto).toBeTruthy();
    });
  });
});
