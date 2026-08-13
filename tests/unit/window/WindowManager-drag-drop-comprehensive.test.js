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
 * Comprehensive tests for moveWindowToPointer()
 *
 * This file covers edge cases and scenarios not covered in the basic tests:
 * - Nested container (CON) parents vs monitor parents
 * - Tabbed container edge drops
 * - Monitor as stacked/tabbed parent
 * - Window ordering for LEFT/TOP drops
 * - createCon logic variations
 * - detachWindow + split() path
 * - Multiple windows in various layouts
 */

describe("WindowManager - moveWindowToPointer Comprehensive", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "dnd-center-layout": "SWAP",
        "preview-hint-enabled": true,
      },
    });
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  /**
   * Helper to create a window node with frame rect
   */
  function createWindowWithRect(parent, rect, mode = WINDOW_MODES.TILE) {
    const metaWindow = createMockWindow({
      rect: new Rectangle(rect),
      workspace: workspace0(),
    });
    const nodeWindow = ctx.tree.createNode(parent.nodeValue, NODE_TYPES.WINDOW, metaWindow);
    nodeWindow.mode = mode;
    return { nodeWindow, metaWindow };
  }

  // createContainer uses imported createContainerNode helper
  const createContainer = createContainerNode;

  /**
   * Helper to get monitor node
   */
  function getMonitor() {
    return getWorkspaceAndMonitor(ctx).monitor;
  }

  // ============================================================================
  // SECTION 1: Early Exit Conditions
  // ============================================================================

  describe("Early Exit Conditions", () => {
    it("should do nothing when focusNodeWindow is null", () => {
      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      // Should not throw
      expect(() => wm().moveWindowToPointer(null, false)).not.toThrow();
    });

    it("should do nothing when focusNodeWindow mode is not GRAB_TILE", () => {
      const monitor = getMonitor();

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.TILE // Not GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      const initialParent = dragged.parentNode;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode).toBe(initialParent);
    });

    it("should do nothing when nodeWinAtPointer is null", () => {
      const monitor = getMonitor();

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = null;

      const initialParent = dragged.parentNode;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode).toBe(initialParent);
    });

    it("should return early when nodeWinAtPointer has invalid structure", () => {
      const monitor = getMonitor();

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Create invalid node (missing nodeValue)
      const invalidNode = { parentNode: monitor, nodeValue: null };

      setPointer(100, 540);
      wm().nodeWinAtPointer = invalidNode;

      const initialParent = dragged.parentNode;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode).toBe(initialParent);
    });
  });

  // ============================================================================
  // SECTION 2: Window Ordering (LEFT/TOP should be BEFORE target)
  // ============================================================================

  describe("Window Ordering", () => {
    it("should place dragged window BEFORE target when dropping LEFT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Left edge (0-30% of width)
      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const parent = dragged.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idxTarget = children.indexOf(target);
      const idxDragged = children.indexOf(dragged);

      expect(idxDragged).toBeLessThan(idxTarget);
    });

    it("should place dragged window BEFORE target when dropping TOP", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Top edge (0-30% of height)
      setPointer(960, 100);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const parent = dragged.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idxTarget = children.indexOf(target);
      const idxDragged = children.indexOf(dragged);

      expect(idxDragged).toBeLessThan(idxTarget);
    });

    it("should place dragged window AFTER target when dropping RIGHT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Right edge (70-100% of width)
      setPointer(1800, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const parent = dragged.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idxTarget = children.indexOf(target);
      const idxDragged = children.indexOf(dragged);

      expect(idxDragged).toBeGreaterThan(idxTarget);
    });

    it("should place dragged window AFTER target when dropping BOTTOM", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Bottom edge (70-100% of height)
      setPointer(960, 1000);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const parent = dragged.parentNode;
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      const idxTarget = children.indexOf(target);
      const idxDragged = children.indexOf(dragged);

      expect(idxDragged).toBeGreaterThan(idxTarget);
    });
  });

  // ============================================================================
  // SECTION 3: Tabbed Container Edge Drops
  // ============================================================================

  describe("Tabbed Container Edge Drops", () => {
    it("should detach window from tabbed container when dropping on LEFT edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Peel: remaining tabs stay on the TABBED mon; dragged is left of them.
      expect(target.parentNode).toBe(monitor);
      expect(other.parentNode).toBe(monitor);
      expect(monitor.childNodes).toContain(target);
      expect(monitor.childNodes).toContain(other);
      expect(monitor.childNodes).not.toContain(dragged);
      const peeled = dragged.parentNode;
      expect(peeled).not.toBe(monitor);
      expect(peeled.nodeType).toBe(NODE_TYPES.CON);
      expect(peeled.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(peeled.childNodes).toContain(dragged);
      expect(monitor.childNodes).toContain(peeled);
      expect(monitor.childNodes.indexOf(peeled)).toBeLessThan(monitor.childNodes.indexOf(target));
      expect(monitor.childNodes.indexOf(peeled)).toBeLessThan(monitor.childNodes.indexOf(other));
    });

    it("should detach window from tabbed container when dropping on RIGHT edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(1800, 540);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
    });

    it("should detach window from tabbed container when dropping on TOP edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 100);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
    });

    it("should detach window from tabbed container when dropping on BOTTOM edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 1000);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
    });

    it("should add window to tabbed container when dropping on CENTER", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Center region
      setPointer(960, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should stay in same tabbed container
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(dragged.parentNode).toBe(target.parentNode);
    });

    it("BOTTOM edge on nested TABBED CON under mon HSPLIT wraps into VSPLIT (not mon sibling HSPLIT)", () => {
      // Daily path: mon HSPLIT [TABBED half-height tabs | sibling]. Dropping on the
      // bottom of the tab group must become VSPLIT(TABBED, dragged) in place.
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const metaB = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      target.mode = WINDOW_MODES.TILE;
      const otherTab = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaB);
      otherTab.mode = WINDOW_MODES.TILE;

      const { nodeWindow: sibling } = createWindowWithRect(monitor, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 400, y: 400, width: 400, height: 300 },
        WINDOW_MODES.GRAB_TILE
      );

      // Bottom-center of the left tab group (avoid corner nearest-edge LEFT).
      setPointer(480, 1000);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const wrap = dragged.parentNode;
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(wrap.parentNode).toBe(monitor);
      expect(tabCon.parentNode).toBe(wrap);
      expect(tabCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(tabCon.childNodes).toContain(target);
      expect(tabCon.childNodes).toContain(otherTab);
      expect(wrap.childNodes).toContain(tabCon);
      expect(wrap.childNodes).toContain(dragged);
      expect(wrap.childNodes.indexOf(tabCon)).toBeLessThan(wrap.childNodes.indexOf(dragged));
      // Right sibling stays a mon-level peer of the new wrap, not of dragged alone.
      expect(sibling.parentNode).toBe(monitor);
      expect(monitor.childNodes).toContain(wrap);
      expect(monitor.childNodes).toContain(sibling);
    });

    it("LEFT edge on nested TABBED CON under mon HSPLIT wraps into HSPLIT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const metaA = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      target.mode = WINDOW_MODES.TILE;

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(50, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const wrap = dragged.parentNode;
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(tabCon.parentNode).toBe(wrap);
      expect(wrap.childNodes.indexOf(dragged)).toBeLessThan(wrap.childNodes.indexOf(tabCon));
    });

    it("no-op when already bottom of VSPLIT and drop BOTTOM on top sibling", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const split = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const metaTop = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const metaBot = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const top = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaTop);
      top.mode = WINDOW_MODES.TILE;
      const bot = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaBot);
      bot.mode = WINDOW_MODES.GRAB_TILE;

      // Bottom-center of the top sibling (same relative place).
      setPointer(480, 500);
      wm().nodeWinAtPointer = top;
      const orderBefore = split.childNodes.slice();

      wm().moveWindowToPointer(bot, false);

      expect(split.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(split.childNodes).toEqual(orderBefore);
      expect(bot.parentNode).toBe(split);
    });
  });

  // ============================================================================
  // SECTION 3b: CENTER group on 2-child VSPLIT (D024)
  // ============================================================================

  describe("CENTER group on 2-child VSPLIT", () => {
    function vsplitPair(dragBottom) {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "tabbed";
        return "";
      });
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const split = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const metaTop = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const metaBot = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const top = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaTop);
      const bot = ctx.tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, metaBot);
      top.mode = dragBottom ? WINDOW_MODES.TILE : WINDOW_MODES.GRAB_TILE;
      bot.mode = dragBottom ? WINDOW_MODES.GRAB_TILE : WINDOW_MODES.TILE;
      return { split, top, bot };
    }

    it("CENTER B onto A becomes TABBED (same parent, both children)", () => {
      const { split, top, bot } = vsplitPair(true);
      const mergeSpy = vi.spyOn(ctx.tree, "mergeWindowsIntoGroup");

      setPointer(480, 270);
      wm().nodeWinAtPointer = top;
      wm().moveWindowToPointer(bot, false);

      expect(mergeSpy).toHaveBeenCalledWith(bot, top, LAYOUT_TYPES.TABBED);
      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(top.parentNode).toBe(split);
      expect(bot.parentNode).toBe(split);
      expect(split.childNodes).toEqual(expect.arrayContaining([top, bot]));
      expect(split.childNodes).toHaveLength(2);
    });

    it("CENTER A onto B becomes TABBED (same parent, both children)", () => {
      const { split, top, bot } = vsplitPair(false);
      const mergeSpy = vi.spyOn(ctx.tree, "mergeWindowsIntoGroup");

      setPointer(480, 810);
      wm().nodeWinAtPointer = bot;
      wm().moveWindowToPointer(top, false);

      expect(mergeSpy).toHaveBeenCalledWith(top, bot, LAYOUT_TYPES.TABBED);
      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(top.parentNode).toBe(split);
      expect(bot.parentNode).toBe(split);
      expect(split.childNodes).toEqual(expect.arrayContaining([top, bot]));
      expect(split.childNodes).toHaveLength(2);
    });
  });

  // ============================================================================
  // SECTION 4: Nested Container (CON) Parent
  // ============================================================================

  describe("Nested Container (CON) Parent", () => {
    it("should create HSPLIT when dropping LEFT in CON with VSPLIT layout", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create a nested container with VSPLIT
      const container = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const other = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      other.mode = WINDOW_MODES.TILE;

      // Create dragged window outside container
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop on left edge of target
      setPointer(50, 270);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should create a new container with HSPLIT containing target and dragged
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should create VSPLIT when dropping TOP in CON with HSPLIT layout", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      // Create a nested container with HSPLIT
      const container = createContainer(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 540,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 540 }),
        workspace: workspace0(),
      });
      const other = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      other.mode = WINDOW_MODES.TILE;

      // Create dragged window outside container
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 540, width: 1920, height: 540 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop on top edge of target
      setPointer(480, 50);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should create a new container with VSPLIT
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("BOTTOM on MONITOR HSPLIT nests VSPLIT — does not flatten to 3-wide (R023)", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: left } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: right } = createWindowWithRect(monitor, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 400, y: 400, width: 200, height: 200 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(480, 1000);
      wm().nodeWinAtPointer = left;
      wm().moveWindowToPointer(dragged, false);

      expect(monitor.childNodes.length).toBe(2);
      expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(right.parentNode).toBe(monitor);
      const nest = dragged.parentNode;
      expect(nest).not.toBe(monitor);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(nest.childNodes).toContain(left);
      expect(nest.childNodes).toContain(dragged);
      expect(nest.childNodes).not.toContain(right);
    });

    it("should reuse existing CON when only one window remains", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create a nested container
      const container = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      // Create dragged window outside container
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop on left edge of target (only window in container)
      setPointer(50, 540);
      wm().nodeWinAtPointer = target;

      const childCountBefore = container.childNodes.length;

      wm().moveWindowToPointer(dragged, false);

      // Container should be reused, not nested further
      expect(dragged.parentNode).toBe(container);
      expect(target.parentNode).toBe(container);
    });
  });

  // ============================================================================
  // SECTION 5: Monitor as Stacked/Tabbed Parent
  // ============================================================================

  describe("Monitor as Stacked/Tabbed Parent", () => {
    it("should prepend window when dropping LEFT on stacked monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.STACKED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      // Should call split to detach from stacked
      expect(splitSpy).toHaveBeenCalled();
      // A LEFT drop prepends: the dragged window is detached into a new CON
      // that lands BEFORE target in the monitor (split-called alone passed for
      // an append too — assert the ordering the test name promises).
      const leftMonitor = target.parentNode;
      expect(leftMonitor.childNodes.indexOf(dragged.parentNode)).toBeLessThan(
        leftMonitor.childNodes.indexOf(target)
      );
    });

    it("should append window when dropping RIGHT on stacked monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.STACKED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(1800, 540);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
      // A RIGHT drop appends: the detached dragged CON lands AFTER target.
      const rightMonitor = target.parentNode;
      expect(rightMonitor.childNodes.indexOf(dragged.parentNode)).toBeGreaterThan(
        rightMonitor.childNodes.indexOf(target)
      );
    });

    it("should prepend window when dropping TOP on tabbed monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 100);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
      // A TOP drop prepends: the detached dragged CON lands BEFORE target.
      const topMonitor = target.parentNode;
      expect(topMonitor.childNodes.indexOf(dragged.parentNode)).toBeLessThan(
        topMonitor.childNodes.indexOf(target)
      );
    });

    it("should append window when dropping BOTTOM on tabbed monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 1000);
      wm().nodeWinAtPointer = target;

      const splitSpy = vi.spyOn(ctx.tree, "split");

      wm().moveWindowToPointer(dragged, false);

      expect(splitSpy).toHaveBeenCalled();
      // A BOTTOM drop appends: the detached dragged CON lands AFTER target.
      const bottomMonitor = target.parentNode;
      expect(bottomMonitor.childNodes.indexOf(dragged.parentNode)).toBeGreaterThan(
        bottomMonitor.childNodes.indexOf(target)
      );
    });
  });

  // ============================================================================
  // SECTION 6: Center Drop Adds to Existing Container
  // ============================================================================

  describe("Center Drop into Existing Stacked/Tabbed", () => {
    it("should add window to existing stacked container on center drop", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "STACKED";
        return "";
      });
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return true;
        if (key === "tabbed-tiling-mode-enabled") return true;
        if (key === "preview-hint-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create a stacked container
      const container = createContainer(monitor, LAYOUT_TYPES.STACKED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      // Create dragged window outside container
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Center drop
      setPointer(480, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should be added to existing stacked container
      expect(dragged.parentNode).toBe(container);
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.STACKED);
    });

    it("should add window to existing tabbed container on center drop", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create a tabbed container
      const container = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      // Create dragged window outside container
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Center drop
      setPointer(480, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should be added to existing tabbed container
      expect(dragged.parentNode).toBe(container);
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    });

    it("stack mode off + dnd-center-layout stacked: center drop creates TABBED never STACKED", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "stacked";
        return "";
      });
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return false;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 540);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(dragged.parentNode.layout).not.toBe(LAYOUT_TYPES.STACKED);
    });

    it("stack mode off: center drop onto STACKED parent converts to TABBED and joins", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "stacked";
        return "";
      });
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return false;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container = createContainer(monitor, LAYOUT_TYPES.STACKED, {
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
      const target = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;
      const sibling = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      sibling.mode = WINDOW_MODES.TILE;

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(480, 540);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode).toBe(container);
      expect(container.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(container.childNodes).toEqual(expect.arrayContaining([target, sibling, dragged]));
      expect(container.childNodes).toHaveLength(3);
    });

    it("stack mode off + dnd-center-layout tabbed: center drop is TABBED", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "tabbed";
        return "";
      });
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return false;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });

      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 540);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  // ============================================================================
  // SECTION 7: createCon Logic Variations
  // ============================================================================

  describe("createCon Logic", () => {
    it("should create new container when dropping LEFT in VSPLIT with 2+ windows", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      // Create multiple windows in VSPLIT
      const { nodeWindow: win1 } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: win2 } = createWindowWithRect(monitor, {
        x: 0,
        y: 360,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: win3 } = createWindowWithRect(monitor, {
        x: 0,
        y: 720,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 360 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop LEFT on win2
      setPointer(100, 540);
      wm().nodeWinAtPointer = win2;

      wm().moveWindowToPointer(dragged, false);

      // Should create new HSPLIT container for win2 and dragged
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(dragged.parentNode.nodeType).toBe(NODE_TYPES.CON);
    });

    it("should create new container when dropping TOP in HSPLIT with 2+ windows", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create multiple windows in HSPLIT
      const { nodeWindow: win1 } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: win2 } = createWindowWithRect(monitor, {
        x: 640,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: win3 } = createWindowWithRect(monitor, {
        x: 1280,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 640, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop TOP on win2
      setPointer(960, 100);
      wm().nodeWinAtPointer = win2;

      wm().moveWindowToPointer(dragged, false);

      // Should create new VSPLIT container for win2 and dragged
      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(dragged.parentNode.nodeType).toBe(NODE_TYPES.CON);
    });

    it("TOP on a 2-wide MONITOR HSPLIT wraps a VSPLIT (R023, no MONITOR reuse)", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(480, 100);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      const nest = dragged.parentNode;
      expect(nest).not.toBe(monitor);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(nest.childNodes).toContain(target);
      expect(nest.childNodes).toContain(dragged);
    });
  });

  // ============================================================================
  // SECTION 8: Multiple Windows (3+ in layout)
  // ============================================================================

  describe("Multiple Windows in Layout", () => {
    it("should handle dropping 4th window into 3-window HSPLIT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: win1 } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: win2 } = createWindowWithRect(monitor, {
        x: 640,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: win3 } = createWindowWithRect(monitor, {
        x: 1280,
        y: 0,
        width: 640,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 640, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop RIGHT on win3
      setPointer(1800, 540);
      wm().nodeWinAtPointer = win3;

      wm().moveWindowToPointer(dragged, false);

      // Should still have 4 windows total in tree
      const allWindows = monitor.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(allWindows.length).toBe(4);
      expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should handle dropping into middle of 3-window VSPLIT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: win1 } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: win2 } = createWindowWithRect(monitor, {
        x: 0,
        y: 360,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: win3 } = createWindowWithRect(monitor, {
        x: 0,
        y: 720,
        width: 1920,
        height: 360,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 360 },
        WINDOW_MODES.GRAB_TILE
      );

      // Drop TOP on win2 (middle window)
      setPointer(960, 400);
      wm().nodeWinAtPointer = win2;

      wm().moveWindowToPointer(dragged, false);

      // Dropping TOP on the middle window inserts the dragged node ahead of win2
      // within a VSPLIT parent (mirror of the LEFT/TOP ordering tests above).
      const parent = dragged.parentNode;
      expect(parent.layout).toBe(LAYOUT_TYPES.VSPLIT);
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(children.indexOf(dragged)).toBeLessThan(children.indexOf(win2));
    });
  });

  // ============================================================================
  // SECTION 9: Tab Decoration Handling
  // ============================================================================

  describe("Tab Decoration Handling", () => {
    it("should handle tab decoration removal gracefully", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Add a mock tab with a stable parent so we can assert cleanup.
      const tabParent = { remove_child: vi.fn() };
      const mockTab = {
        get_parent: vi.fn(() => tabParent),
      };
      dragged.tab = mockTab;

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Bug #328: the dragged window's tab decoration is detached from its parent.
      expect(tabParent.remove_child).toHaveBeenCalledWith(mockTab);
    });

    it("should handle tab decoration removal when parent is null", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Add a mock tab with null parent. remove_child must NOT be invoked when
      // there is no parent (the `if (decoParent)` guard), otherwise a null deref
      // would be swallowed by the try/catch and silently skip the drop side effects.
      const remove_child = vi.fn();
      const mockTab = {
        get_parent: vi.fn(() => null),
        remove_child,
      };
      dragged.tab = mockTab;

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // No parent => no detach attempt.
      expect(remove_child).not.toHaveBeenCalled();

      // The drop still completed: dragged dropped LEFT on target, so it is parented
      // in an HSPLIT and ordered before target.
      const parent = dragged.parentNode;
      expect(parent).toBeTruthy();
      expect(parent.layout).toBe(LAYOUT_TYPES.HSPLIT);
      const children = parent.childNodes.filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(children.indexOf(dragged)).toBeLessThan(children.indexOf(target));
    });

    it("should handle tab decoration removal error gracefully", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Add a mock tab that throws on get_parent
      const mockTab = {
        get_parent: vi.fn(() => {
          throw new Error("Mock error");
        }),
      };
      dragged.tab = mockTab;

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      // Should not throw - error is caught internally
      expect(() => wm().moveWindowToPointer(dragged, false)).not.toThrow();
    });
  });

  // ============================================================================
  // SECTION 10: Preview Hint Styling
  // ============================================================================

  describe("Preview Hint Styling", () => {
    function setupPreviewTest(extraBooleans = {}) {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return true;
        if (key in extraBooleans) return extraBooleans[key];
        // Keep layout modes on so STACKED/TABBED center previews exercise
        // the enabled path unless a test overrides.
        if (key === "stacked-tiling-mode-enabled") return true;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });
    }

    it("should show tiled preview class for LEFT edge drop", () => {
      setupPreviewTest();
      const monitor = getMonitor();

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-tiled");
    });

    it("should show stacked preview class for CENTER drop on stacked container", () => {
      setupPreviewTest();
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "STACKED";
        return "";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.STACKED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;

      setPointer(960, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-stacked");
    });

    it("should show tabbed preview class for CENTER drop on tabbed container", () => {
      setupPreviewTest();
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.TABBED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;

      setPointer(960, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-tabbed");
    });

    it("Super (tile mod) shows hints when preview-hint-enabled is false", () => {
      setupPreviewTest();
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return false;
        if (key === "stacked-tiling-mode-enabled") return true;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return key === "tiling-mode-enabled";
      });
      // DragDropManager._previewHintsWanted → allowDragDropTile (tile mod / Super).
      vi.spyOn(wm().dragDrop, "allowDragDropTile").mockReturnValue(true);

      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;
      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.show).toHaveBeenCalled();
      expect(previewHint.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-tiled");
    });

    it("setting off + no tile mod does not paint hints", () => {
      setupPreviewTest();
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "preview-hint-enabled") return false;
        return key === "tiling-mode-enabled";
      });
      vi.spyOn(wm().dragDrop, "allowDragDropTile").mockReturnValue(false);

      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;
      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.show).not.toHaveBeenCalled();
    });

    it("should hide preview when no targetRect", () => {
      setupPreviewTest();
      const monitor = getMonitor();

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      dragged.previewHint = previewHint;

      // No nodeWinAtPointer set
      wm().nodeWinAtPointer = null;

      wm().moveWindowToPointer(dragged, true);

      // Preview should not be shown since there's no target
      expect(previewHint.show).not.toHaveBeenCalled();
    });

    it("paints all five zones with hover emphasis (multi-actor path)", () => {
      setupPreviewTest();
      const monitor = getMonitor();
      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      const makeZoneActor = () => ({
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      });
      const zoneActors = {
        TOP: makeZoneActor(),
        RIGHT: makeZoneActor(),
        BOTTOM: makeZoneActor(),
        LEFT: makeZoneActor(),
        CENTER: makeZoneActor(),
      };
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        remove_child: vi.fn(),
        add_child: vi.fn(),
      };
      dragged.previewHint = previewHint;
      dragged.previewZoneActors = zoneActors;

      setPointer(100, 540); // LEFT
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.show).toHaveBeenCalled();
      expect(previewHint.set_position).toHaveBeenCalledWith(0, 0);
      expect(previewHint.set_size).toHaveBeenCalledWith(1920, 1080);

      for (const z of ["TOP", "RIGHT", "BOTTOM", "LEFT", "CENTER"]) {
        expect(zoneActors[z].show).toHaveBeenCalled();
        expect(zoneActors[z].set_style_class_name).toHaveBeenCalled();
      }
      expect(zoneActors.LEFT.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-tiled");
      expect(zoneActors.TOP.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-zone");
      expect(zoneActors.CENTER.set_style_class_name).toHaveBeenCalledWith(
        "window-tilepreview-zone"
      );
    });

    it("clearAllPreviewHints destroys multi-zone actors", () => {
      setupPreviewTest();
      const monitor = getMonitor();
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 100, height: 100 },
        WINDOW_MODES.GRAB_TILE
      );
      const zone = { hide: vi.fn(), destroy: vi.fn() };
      const container = { hide: vi.fn(), destroy: vi.fn() };
      dragged.previewHint = container;
      dragged.previewZoneActors = { LEFT: zone, TOP: zone };
      wm()._draggedNodeWindow = dragged;

      wm().dragDrop.clearAllPreviewHints();

      expect(zone.destroy).toHaveBeenCalled();
      expect(container.destroy).toHaveBeenCalled();
      expect(dragged.previewHint).toBeNull();
      expect(dragged.previewZoneActors).toBeNull();
    });
  });

  // ============================================================================
  // SECTION 11: Reset Sibling Percent
  // ============================================================================

  describe("Reset Sibling Percent", () => {
    it("should call resetSiblingPercent on both old and new parent", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container1 = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const container2 = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container1.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const dragged = ctx.tree.createNode(container2.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      dragged.mode = WINDOW_MODES.GRAB_TILE;

      const resetSpy = vi.spyOn(ctx.tree, "resetSiblingPercent");

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Should be called for both the new container and the old parent
      expect(resetSpy).toHaveBeenCalled();
      expect(resetSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // SECTION 12: Stacked Container with Non-Monitor Parent
  // ============================================================================

  describe("Stacked Container with CON Parent", () => {
    it("LEFT edge on nested STACKED CON wraps into HSPLIT in place", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      // Create a stacked container inside a HSPLIT
      const stackedCon = createContainer(monitor, LAYOUT_TYPES.STACKED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(stackedCon.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const other = ctx.tree.createNode(stackedCon.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      other.mode = WINDOW_MODES.TILE;

      // Create dragged window elsewhere
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const wrap = dragged.parentNode;
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(stackedCon.parentNode).toBe(wrap);
      expect(wrap.childNodes.indexOf(dragged)).toBeLessThan(wrap.childNodes.indexOf(stackedCon));
      expect(stackedCon.childNodes).toContain(target);
      expect(stackedCon.childNodes).toContain(other);
    });

    it("TOP edge on nested STACKED CON wraps into VSPLIT with dragged first", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      // Create a stacked container
      const stackedCon = createContainer(monitor, LAYOUT_TYPES.STACKED, {
        x: 0,
        y: 540,
        width: 1920,
        height: 540,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(stackedCon.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 540, width: 1920, height: 540 }),
        workspace: workspace0(),
      });
      const other = ctx.tree.createNode(stackedCon.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      other.mode = WINDOW_MODES.TILE;

      // Create dragged window at top
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 540 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 600);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const wrap = dragged.parentNode;
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(stackedCon.parentNode).toBe(wrap);
      expect(wrap.childNodes.indexOf(dragged)).toBeLessThan(wrap.childNodes.indexOf(stackedCon));
    });
  });

  // ============================================================================
  // SECTION 13: SWAP Center Mode
  // ============================================================================

  describe("SWAP Center Mode", () => {
    beforeEach(() => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "SWAP";
        return "";
      });
    });

    it("should swap windows when center drop with SWAP mode in HSPLIT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(480, 540);
      wm().nodeWinAtPointer = target;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(dragged, false);

      expect(swapSpy).toHaveBeenCalledWith(target, dragged);
    });

    it("should swap windows when center drop with SWAP mode in VSPLIT", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 540,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 540, width: 1920, height: 540 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 270);
      wm().nodeWinAtPointer = target;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(dragged, false);

      expect(swapSpy).toHaveBeenCalledWith(target, dragged);
    });

    it("should swap windows in nested containers", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container1 = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const container2 = createContainer(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });

      const metaWindow1 = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const target = ctx.tree.createNode(container1.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
      target.mode = WINDOW_MODES.TILE;

      const metaWindow2 = createMockWindow({
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });
      const dragged = ctx.tree.createNode(container2.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      dragged.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(480, 540);
      wm().nodeWinAtPointer = target;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(dragged, false);

      expect(swapSpy).toHaveBeenCalledWith(target, dragged);
    });
  });

  // ============================================================================
  // SECTION 14: Edge Cases for Region Detection
  // ============================================================================

  describe("Region Detection Edge Cases", () => {
    it("should detect left region at exact boundary (30%)", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1000, height: 1000 },
        WINDOW_MODES.GRAB_TILE
      );

      // Exactly at 30% boundary (should be left region)
      setPointer(299, 500);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should detect center region at 31% (just past left boundary)", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "SWAP";
        return "";
      });

      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1000, height: 1000 },
        WINDOW_MODES.GRAB_TILE
      );

      // Just past 30% (should be center region if also past top/bottom)
      setPointer(350, 500);
      wm().nodeWinAtPointer = target;

      const swapSpy = vi.spyOn(ctx.tree, "swapPairs");

      wm().moveWindowToPointer(dragged, false);

      expect(swapSpy).toHaveBeenCalled();
    });

    it("top-left fan: above UL→cUL diagonal is TOP (VSPLIT), not left-band HSPLIT", () => {
      const monitor = getMonitor();

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1000, height: 1000 },
        WINDOW_MODES.GRAB_TILE
      );

      // D0 trapezoids: (100,100) is above the UL→center diagonal → TOP → VSPLIT
      setPointer(100, 100);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("top-left fan: below UL→cUL diagonal is LEFT (HSPLIT)", () => {
      const monitor = getMonitor();

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1000, height: 1000 },
        WINDOW_MODES.GRAB_TILE
      );

      // (10,50) is below the diagonal → LEFT → HSPLIT
      setPointer(10, 50);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });
  });

  // ============================================================================
  // SECTION 15: Cleanup After Operations
  // ============================================================================

  describe("Cleanup After Operations", () => {
    /**
     * Regression guard for the createCon reset path.
     *
     * The drop logic resets the createCon flag on focusNodeWindow (the dragged
     * node) once the operation completes. A previous bug reset the flag on a
     * reassigned childNode instead, leaving the dragged node's flag stale.
     */
    it("should reset createCon flag on focusNodeWindow after operation", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 540,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 540,
        width: 1920,
        height: 540,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 540 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 270);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // The createCon flag is reset on focusNodeWindow (the dragged node),
      // not on a reassigned childNode.
      expect(dragged.createCon).toBe(false);
    });

    it("should reset detachWindow flag after operation", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.STACKED;

      const { nodeWindow: target } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      expect(dragged.detachWindow).toBe(false);
    });
  });
});
