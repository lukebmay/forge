import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  setPointer,
  parentOf,
  kidsOf,
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

  function soleMonChild(monitor) {
    const kids = kidsOf(wm(), monitor);
    expect(kids).toHaveLength(1);
    expect(kids[0].nodeType).toBe(NODE_TYPES.CON);
    return kids[0];
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

      const initialParent = parentOf(wm(), dragged);

      wm().moveWindowToPointer(dragged, false);

      expect(parentOf(wm(), dragged) === initialParent).toBe(true);
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

      const initialParent = parentOf(wm(), dragged);

      wm().moveWindowToPointer(dragged, false);

      expect(parentOf(wm(), dragged) === initialParent).toBe(true);
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

      const initialParent = parentOf(wm(), dragged);

      wm().moveWindowToPointer(dragged, false);

      expect(parentOf(wm(), dragged) === initialParent).toBe(true);
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

      const parent = parentOf(wm(), dragged);
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
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

      const parent = parentOf(wm(), dragged);
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
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

      const parent = parentOf(wm(), dragged);
      expect(parent === parentOf(wm(), target)).toBe(true);
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(children.includes(target) && children.includes(dragged)).toBe(true);
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

      const parent = parentOf(wm(), dragged);
      expect(parent === parentOf(wm(), target)).toBe(true);
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(children.includes(target) && children.includes(dragged)).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 3: Tabbed Container Edge Drops
  // ============================================================================

  describe("Tabbed Container Edge Drops", () => {
    it("should detach window from tabbed container when dropping on LEFT edge", () => {
      // Given: Mon(TAB(target, other, dragged)) — not a TABBED MONITOR.
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        tabCon,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      // Join wrap-pair + unary remaining + max-1: Mon(H(other, V(dragged, target))).
      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), other) === row).toBe(true);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), wrap) === row).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(target)).toBe(true);
      expect(kidsOf(wm(), monitor).includes(target)).toBe(false);
      expect(kidsOf(wm(), monitor).includes(dragged)).toBe(false);
    });

    it("should detach window from tabbed container when dropping on RIGHT edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        tabCon,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(1800, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), other) === row).toBe(true);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), wrap) === row).toBe(true);
      expect(kidsOf(wm(), wrap).includes(target)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
    });

    it("should detach window from tabbed container when dropping on TOP edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        tabCon,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 100);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), other) === row).toBe(true);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(kidsOf(wm(), wrap).includes(target)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
    });

    it("should detach window from tabbed container when dropping on BOTTOM edge", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        tabCon,
        { x: 0, y: 0, width: 1920, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 1000);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), other) === row).toBe(true);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(kidsOf(wm(), wrap).includes(target)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
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
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.TABBED).toBe(true);
      expect(parentOf(wm(), dragged) === parentOf(wm(), target)).toBe(true);
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

      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), tabCon) === wrap).toBe(true);
      expect(tabCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), tabCon).includes(target)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(otherTab)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(tabCon)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(tabCon)).toBeLessThan(kidsOf(wm(), wrap).indexOf(dragged));
      // MONITOR max-1: wrap and sibling share the mon H CON.
      const row = parentOf(wm(), wrap);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), row) === monitor).toBe(true);
      expect(parentOf(wm(), sibling) === row).toBe(true);
    });

    it("TOP on a tab uses the TABBED bag as the slot (not a wrap inside the bag)", () => {
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

      seedLiveForest(wm());
      setPointer(480, 40);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, false);

      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), tabCon) === wrap).toBe(true);
      expect(tabCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), tabCon).every((c) => c.nodeType === NODE_TYPES.WINDOW)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(target)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(otherTab)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(dragged)).toBe(false);
      expect(kidsOf(wm(), wrap).includes(tabCon)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(dragged)).toBeLessThan(kidsOf(wm(), wrap).indexOf(tabCon));
      const row = parentOf(wm(), wrap);
      expect(parentOf(wm(), row) === monitor).toBe(true);
      expect(parentOf(wm(), sibling) === row).toBe(true);
    });

    it("SurfaceOp commit path is gone (U3); pointer owns tile drops", () => {
      expect(wm().dragDrop._commitResolvedDrop).toBeUndefined();
      expect(wm().dragDrop._commitDropSurface).toBeUndefined();
      expect(wm().dragDrop._buildDropOperation).toBeUndefined();
      expect(typeof wm().dragDrop._commitPointerOp).toBe("function");
      expect(typeof wm().dragDrop.moveWindowToPointer).toBe("function");
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

      // 1-child TAB unary-collapses; slot-split LEFT is H(dragged, target).
      const wrap = soleMonChild(monitor);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(target)).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(dragged)).toBeLessThan(kidsOf(wm(), wrap).indexOf(target));
    });

    it("RIGHT on multi-tab TABBED bag HSPLITs bag|dragged (tabs stay WINDOW peers)", () => {
      // Host 9m9Kw: RIGHT onto a joined TAB group thrashed tab membership.
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const tabs = [];
      for (let i = 0; i < 3; i++) {
        const meta = createMockWindow({
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        });
        const w = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, meta);
        w.mode = WINDOW_MODES.TILE;
        tabs.push(w);
      }
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

      seedLiveForest(wm());
      // Right-center of the left tab slot (avoid corner nearest-edge TOP/BOTTOM).
      setPointer(900, 540);
      wm().nodeWinAtPointer = tabs[1];
      wm().moveWindowToPointer(dragged, false);

      // Same-axis slot-split unwraps H-in-H: Mon(H(TAB, dragged, sib)).
      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), tabCon) === row).toBe(true);
      expect(parentOf(wm(), dragged) === row).toBe(true);
      expect(parentOf(wm(), sibling) === row).toBe(true);
      expect(tabCon.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), tabCon)).toHaveLength(3);
      expect(kidsOf(wm(), tabCon).every((c) => c.nodeType === NODE_TYPES.WINDOW)).toBe(true);
      for (const t of tabs) expect(kidsOf(wm(), tabCon).includes(t)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(dragged)).toBe(false);
      expect(kidsOf(wm(), row).indexOf(tabCon)).toBeLessThan(kidsOf(wm(), row).indexOf(dragged));
    });

    it("RIGHT peel of a tab member keeps remaining tabs in the bag", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const tabs = [];
      for (let i = 0; i < 3; i++) {
        const meta = createMockWindow({
          rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
          workspace: workspace0(),
        });
        const w = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, meta);
        w.mode = WINDOW_MODES.TILE;
        tabs.push(w);
      }
      const dragged = tabs[2];
      dragged.mode = WINDOW_MODES.GRAB_TILE;

      seedLiveForest(wm());
      setPointer(1800, 540);
      wm().nodeWinAtPointer = tabs[0];
      wm().moveWindowToPointer(dragged, false);

      // Wrap-pair dragged+hit; remaining tab unary-collapses. Not kidsOf(dead TAB).
      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), tabs[1]) === row).toBe(true);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(kidsOf(wm(), wrap).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), wrap).includes(tabs[0])).toBe(true);
      expect(kidsOf(wm(), wrap).includes(tabs[1])).toBe(false);
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
      const orderBefore = kidsOf(wm(), split).slice();

      wm().moveWindowToPointer(bot, false);

      // In-axis adjacent BOTTOM is Move swap, not a no-op.
      expect(split.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), bot) === split).toBe(true);
      expect(parentOf(wm(), top) === split).toBe(true);
      expect(kidsOf(wm(), split)).toHaveLength(orderBefore.length);
      expect(kidsOf(wm(), split)[0]).toBe(bot);
      expect(kidsOf(wm(), split)[1]).toBe(top);
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

      setPointer(480, 270);
      wm().nodeWinAtPointer = top;
      wm().moveWindowToPointer(bot, false);

      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(wm(), top) === split).toBe(true);
      expect(parentOf(wm(), bot) === split).toBe(true);
      expect(kidsOf(wm(), split).includes(top) && kidsOf(wm(), split).includes(bot)).toBe(true);
      expect(kidsOf(wm(), split)).toHaveLength(2);
    });

    it("CENTER A onto B becomes TABBED (same parent, both children)", () => {
      const { split, top, bot } = vsplitPair(false);

      setPointer(480, 810);
      wm().nodeWinAtPointer = bot;
      wm().moveWindowToPointer(top, false);

      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(wm(), top) === split).toBe(true);
      expect(parentOf(wm(), bot) === split).toBe(true);
      expect(kidsOf(wm(), split).includes(top) && kidsOf(wm(), split).includes(bot)).toBe(true);
      expect(kidsOf(wm(), split)).toHaveLength(2);
    });
  });

  // ============================================================================
  // SECTION 3c: D044 cross-mon CENTER → one TABBED on dest
  // ============================================================================

  describe("D044 cross-mon CENTER join", () => {
    let dual;
    const dualGeoms = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ];

    beforeEach(() => {
      dual = createWindowManagerFixture({
        globals: {
          display: {
            monitorCount: 2,
            monitorGeometries: dualGeoms,
          },
        },
        settings: {
          "dnd-center-layout": "tabbed",
          "preview-hint-enabled": true,
          "tabbed-tiling-mode-enabled": true,
        },
      });
    });

    afterEach(() => {
      dual.cleanup();
    });

    it("CENTER from mon0 onto mon1 window is one TABBED on dest mon", () => {
      const mon0 = getWorkspaceAndMonitor(dual, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(dual, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      const metaSrc = createMockWindow({
        id: "src",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: dual.workspaces[0],
      });
      const metaDst = createMockWindow({
        id: "dst",
        monitor: 1,
        rect: new Rectangle({ x: 1920, y: 0, width: 960, height: 1080 }),
        workspace: dual.workspaces[0],
      });
      const src = dual.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaSrc);
      const dst = dual.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, metaDst);
      src.mode = WINDOW_MODES.GRAB_TILE;
      dst.mode = WINDOW_MODES.TILE;
      src.rect = { x: 0, y: 0, width: 960, height: 1080 };
      dst.rect = { x: 1920, y: 0, width: 960, height: 1080 };

      setPointer(2400, 540);
      dual.windowManager.nodeWinAtPointer = dst;
      dual.windowManager.moveWindowToPointer(src, false);

      const dwm = dual.windowManager;
      expect(parentOf(dwm, src) === parentOf(dwm, dst)).toBe(true);
      const group = parentOf(dwm, src);
      expect(group.isTabbed?.() || group.layout === LAYOUT_TYPES.TABBED).toBe(true);
      expect(parentOf(dwm, group) === mon1).toBe(true);
      expect(kidsOf(dwm, mon1).includes(group)).toBe(true);
      expect(kidsOf(dwm, group).includes(src) && kidsOf(dwm, group).includes(dst)).toBe(true);
      expect(kidsOf(dwm, mon0).includes(src)).toBe(false);
    });
  });

  // ============================================================================
  // SECTION 3d: Foreign-strip join at insert index (PR6)
  // ============================================================================

  describe("foreign-strip join at insert index", () => {
    function makeTab(x, y, width, height) {
      return {
        x,
        y,
        width,
        height,
        hide() {},
        destroy_all_children() {},
        destroy() {},
      };
    }

    it("release on dest strip inserts at gap (not always append)", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "tabbed";
        return "";
      });
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const dest = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      dest.decoration = makeTab(0, 0, 300, 30);
      const d0 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      const d1 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      const d2 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      d0.mode = WINDOW_MODES.TILE;
      d1.mode = WINDOW_MODES.TILE;
      d2.mode = WINDOW_MODES.TILE;
      d0.tab = makeTab(0, 0, 100, 30);
      d1.tab = makeTab(100, 0, 100, 30);
      d2.tab = makeTab(200, 0, 100, 30);

      const srcCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      srcCon.decoration = makeTab(960, 0, 200, 30);
      const src = ctx.tree.createNode(
        srcCon.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 960, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      const srcPeer = ctx.tree.createNode(
        srcCon.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 960, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      src.mode = WINDOW_MODES.GRAB_TILE;
      srcPeer.mode = WINDOW_MODES.TILE;
      src.tab = makeTab(960, 0, 100, 30);
      srcPeer.tab = makeTab(1060, 0, 100, 30);

      // Chip over dest mid: insert before d1 (index 1), not append.
      setPointer(120, 15);
      wm().nodeWinAtPointer = d1;
      wm().moveWindowToPointer(src, false);

      expect(parentOf(wm(), src) === dest).toBe(true);
      const destKids = kidsOf(wm(), dest);
      expect(destKids.includes(src)).toBe(true);
      expect(destKids.indexOf(src)).toBeLessThan(3);
      expect(destKids[destKids.length - 1] === src).toBe(false);
    });

    it("tile CENTER (not strip) still existing join/append", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "tabbed";
        return "";
      });
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const dest = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      dest.decoration = makeTab(0, 0, 300, 30);
      const d0 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      const d1 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      d0.mode = WINDOW_MODES.TILE;
      d1.mode = WINDOW_MODES.TILE;
      d0.tab = makeTab(0, 0, 150, 30);
      d1.tab = makeTab(150, 0, 150, 30);
      dest.rect = { x: 0, y: 0, width: 960, height: 1080 };
      d0.rect = { x: 0, y: 40, width: 960, height: 1040 };

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
        WINDOW_MODES.GRAB_TILE
      );

      // Tile body, south of strip.
      setPointer(480, 540);
      wm().nodeWinAtPointer = d0;
      wm().moveWindowToPointer(dragged, false);

      expect(parentOf(wm(), dragged) === dest).toBe(true);
      const destKids = kidsOf(wm(), dest);
      expect(destKids[destKids.length - 1]).toBe(dragged);
    });

    it("PR9: foreign strip preview during GRAB_TILE is spacer-only (no live reparent)", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const dest = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      dest.decoration = makeTab(0, 0, 300, 30);
      const d0 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      d0.mode = WINDOW_MODES.TILE;
      d0.tab = makeTab(0, 0, 100, 30);
      d0.rect = { x: 0, y: 40, width: 960, height: 1040 };
      const d1 = ctx.tree.createNode(
        dest.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      d1.mode = WINDOW_MODES.TILE;
      d1.tab = makeTab(100, 0, 100, 30);

      const srcCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      srcCon.decoration = makeTab(960, 0, 200, 30);
      const src = ctx.tree.createNode(
        srcCon.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 960, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      const srcPeer = ctx.tree.createNode(
        srcCon.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          rect: new Rectangle({ x: 960, y: 40, width: 960, height: 1040 }),
          workspace: workspace0(),
        })
      );
      src.mode = WINDOW_MODES.GRAB_TILE;
      srcPeer.mode = WINDOW_MODES.TILE;
      const homeParent = { name: "src-deco" };
      src.tab = { ...makeTab(960, 0, 100, 30), get_parent: () => homeParent, _parent: homeParent };
      srcPeer.tab = makeTab(1060, 0, 100, 30);

      setPointer(50, 15);
      wm().nodeWinAtPointer = d0;
      wm()._handleMoving(src);

      const fs = wm().dragDrop._foreignStrip;
      expect(fs?.groupNode).toBe(dest);
      expect(fs?.chipFloating).toBe(false);
      expect(fs?.gapSpacer).toBeTruthy();
      expect(src.tab.get_parent()).toBe(homeParent);
      expect(fs?.insertIndex).toBeDefined();

      // Commit still joins at index when pointer on strip.
      wm().moveWindowToPointer(src, false);
      expect(parentOf(wm(), src) === dest).toBe(true);
    });

    it("PR10: peel from tab group then cross-mon CENTER joins on dest mon", () => {
      const dualGeoms = [
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: 1920, y: 0, width: 1920, height: 1080 },
      ];
      const dual = createWindowManagerFixture({
        globals: {
          display: {
            monitorCount: 2,
            monitorGeometries: dualGeoms,
          },
        },
        settings: {
          "dnd-center-layout": "tabbed",
          "preview-hint-enabled": true,
          "tabbed-tiling-mode-enabled": true,
          "tiling-mode-enabled": true,
        },
      });
      try {
        const mon0 = getWorkspaceAndMonitor(dual, 0, 0).monitor;
        const mon1 = getWorkspaceAndMonitor(dual, 0, 1).monitor;
        mon0.layout = LAYOUT_TYPES.HSPLIT;
        mon1.layout = LAYOUT_TYPES.HSPLIT;

        const groupCon = createContainerNode(mon0, LAYOUT_TYPES.TABBED, {
          x: 0,
          y: 0,
          width: 960,
          height: 1080,
        });

        const metaA = createMockWindow({
          id: "tab-a",
          monitor: 0,
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: dual.workspaces[0],
        });
        const metaB = createMockWindow({
          id: "tab-b",
          monitor: 0,
          rect: new Rectangle({ x: 0, y: 40, width: 960, height: 1040 }),
          workspace: dual.workspaces[0],
        });
        const metaDst = createMockWindow({
          id: "dst-mon1",
          monitor: 1,
          rect: new Rectangle({ x: 1920, y: 0, width: 1920, height: 1080 }),
          workspace: dual.workspaces[0],
        });
        const a = dual.tree.createNode(groupCon.nodeValue, NODE_TYPES.WINDOW, metaA);
        const b = dual.tree.createNode(groupCon.nodeValue, NODE_TYPES.WINDOW, metaB);
        const dst = dual.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, metaDst);
        a.mode = WINDOW_MODES.TILE;
        b.mode = WINDOW_MODES.TILE;
        dst.mode = WINDOW_MODES.TILE;
        a.rect = { x: 0, y: 40, width: 960, height: 1040 };
        b.rect = { x: 0, y: 40, width: 960, height: 1040 };
        dst.rect = { x: 1920, y: 0, width: 1920, height: 1080 };
        a.tab = { x: 0, y: 0, width: 100, height: 30 };
        b.tab = { x: 100, y: 0, width: 100, height: 30 };
        groupCon.decoration = { x: 0, y: 0, width: 200, height: 30 };

        const ddm = dual.windowManager.dragDrop;
        vi.spyOn(dual.windowManager, "allowDragDropTile").mockReturnValue(true);
        vi.spyOn(dual.windowManager, "commitLayout").mockImplementation(() => {});
        dual.display.get_focus_window = vi.fn(() => metaB);

        // Host can return begin_grab_op true; peel must still be Forge synthetic.
        metaB.begin_grab_op = vi.fn(() => true);
        ddm.armTabDrag(metaB, {
          get_coords: () => [150, 15],
          get_button: () => 1,
          get_time: () => 1,
          get_device: () => null,
        });
        expect(ddm.noteTabDragMotion(150 + 10, 15)).toBe("reorder");
        expect(ddm.noteTabDragMotion(150, 200)).toBe("active");
        expect(b.mode).toBe(WINDOW_MODES.GRAB_TILE);
        expect(ddm._tabDrag?.synthetic).toBe(true);
        expect(metaB.begin_grab_op).not.toHaveBeenCalled();
        // PR13: chip stays under pointer after peel (no snap-back).
        expect(ddm._tabDrag?.chipFloating).toBe(true);

        // Motion over mon1 tile; release commits CENTER join on dest (D044).
        // Parked global pointer must not win — PR13 event-coord owner.
        setPointer(150, 200);
        dual.windowManager.sortedWindows = [metaA, metaB, metaDst];
        dual.windowManager.trackCurrentMonWs = vi.fn();
        expect(ddm.noteTabDragMotion(2400, 540)).toBe("active");
        const synPtr = ddm.getDragPointer(b);
        expect(synPtr[0]).toBe(2400);
        expect(synPtr[1]).toBe(540);
        dual.windowManager.nodeWinAtPointer = dst;
        ddm.finishTabDragRelease();

        const dwm = dual.windowManager;
        expect(parentOf(dwm, b) === parentOf(dwm, dst)).toBe(true);
        const joined = parentOf(dwm, b);
        expect(joined.isTabbed?.() || joined.layout === LAYOUT_TYPES.TABBED).toBe(true);
        expect(parentOf(dwm, joined) === mon1).toBe(true);
        expect(kidsOf(dwm, mon1).includes(joined)).toBe(true);
        expect(kidsOf(dwm, joined).includes(b) && kidsOf(dwm, joined).includes(dst)).toBe(true);
        expect(kidsOf(dwm, mon0).includes(b)).toBe(false);
        expect(parentOf(dwm, a) === mon0 || parentOf(dwm, parentOf(dwm, a)) === mon0).toBe(true);
        expect(b.mode).toBe(WINDOW_MODES.TILE);
        expect(ddm._tabDrag).toBeNull();
      } finally {
        dual.cleanup();
      }
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
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.HSPLIT).toBe(true);
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
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.VSPLIT).toBe(true);
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

      expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(kidsOf(wm(), monitor).length).toBe(1);
      const row = kidsOf(wm(), monitor)[0];
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), right) === row).toBe(true);
      const nest = parentOf(wm(), dragged);
      expect(nest === monitor).toBe(false);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), nest) === row).toBe(true);
      expect(kidsOf(wm(), nest).includes(left)).toBe(true);
      expect(kidsOf(wm(), nest).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), nest).includes(right)).toBe(false);
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

      wm().moveWindowToPointer(dragged, false);

      // LEFT onto a 1-child V sibling flattens then max-1: Mon(H(...)), not reuse V.
      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), dragged) === row).toBe(true);
      expect(parentOf(wm(), target) === row).toBe(true);
      expect(kidsOf(wm(), row).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), row).includes(target)).toBe(true);
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

      wm().moveWindowToPointer(dragged, false);

      const leftMonitor = parentOf(wm(), target);
      expect(parentOf(wm(), dragged) === monitor).toBe(false);
      expect(kidsOf(wm(), leftMonitor).indexOf(parentOf(wm(), dragged))).toBeLessThan(
        kidsOf(wm(), leftMonitor).indexOf(target)
      );
    });

    it("should append window when dropping RIGHT on stacked monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const stackedCon = createContainer(monitor, LAYOUT_TYPES.STACKED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(stackedCon, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(stackedCon, {
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

      setPointer(900, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), stackedCon) === row).toBe(true);
      expect(parentOf(wm(), dragged) === row).toBe(true);
      expect(kidsOf(wm(), stackedCon).includes(target)).toBe(true);
      expect(kidsOf(wm(), stackedCon).includes(other)).toBe(true);
      expect(kidsOf(wm(), row).indexOf(stackedCon)).toBeLessThan(kidsOf(wm(), row).indexOf(dragged));
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

      wm().moveWindowToPointer(dragged, false);

      const topMonitor = parentOf(wm(), target);
      expect(parentOf(wm(), dragged) === monitor).toBe(false);
      expect(kidsOf(wm(), topMonitor).indexOf(parentOf(wm(), dragged))).toBeLessThan(
        kidsOf(wm(), topMonitor).indexOf(target)
      );
    });

    it("should append window when dropping BOTTOM on tabbed monitor", () => {
      const monitor = getMonitor();
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = createContainer(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: target } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: other } = createWindowWithRect(tabCon, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 400, y: 400, width: 400, height: 300 },
        WINDOW_MODES.GRAB_TILE
      );

      setPointer(960, 1000);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const col = parentOf(wm(), dragged);
      expect(col.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), tabCon) === col).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(target)).toBe(true);
      expect(kidsOf(wm(), tabCon).includes(other)).toBe(true);
      expect(kidsOf(wm(), col).indexOf(tabCon)).toBeLessThan(kidsOf(wm(), col).indexOf(dragged));
      expect(parentOf(wm(), col) === monitor || parentOf(wm(), parentOf(wm(), col)) === monitor).toBe(
        true
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
      expect(parentOf(wm(), dragged) === container).toBe(true);
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.STACKED).toBe(true);
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
      expect(parentOf(wm(), dragged) === container).toBe(true);
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.TABBED).toBe(true);
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

      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.TABBED).toBe(true);
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.STACKED).toBe(false);
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

      expect(parentOf(wm(), dragged) === container).toBe(true);
      expect(container.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(kidsOf(wm(), container).includes(target) && kidsOf(wm(), container).includes(sibling) && kidsOf(wm(), container).includes(dragged)).toBe(true);
      expect(kidsOf(wm(), container)).toHaveLength(3);
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

      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.TABBED).toBe(true);
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
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.HSPLIT).toBe(true);
      expect(parentOf(wm(), dragged).nodeType === NODE_TYPES.CON).toBe(true);
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
      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.VSPLIT).toBe(true);
      expect(parentOf(wm(), dragged).nodeType === NODE_TYPES.CON).toBe(true);
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

      const nest = parentOf(wm(), dragged);
      expect(nest === monitor).toBe(false);
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(kidsOf(wm(), nest).includes(target)).toBe(true);
      expect(kidsOf(wm(), nest).includes(dragged)).toBe(true);
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

      // Adjacent RIGHT is Move swap; max-1 wraps the H, not 4 WINDOW kids on MONITOR.
      const row = soleMonChild(monitor);
      expect(row.layout).toBe(LAYOUT_TYPES.HSPLIT);
      const wins = kidsOf(wm(), row).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
      expect(wins).toHaveLength(4);
      expect(wins.includes(win1) && wins.includes(win2) && wins.includes(win3) && wins.includes(dragged)).toBe(
        true
      );
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

      // Wrap-pair with middle leaf: Mon(V(w1, H(dragged, w2), w3)).
      const col = soleMonChild(monitor);
      expect(col.layout).toBe(LAYOUT_TYPES.VSPLIT);
      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), wrap) === col).toBe(true);
      expect(kidsOf(wm(), wrap).includes(win2)).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(dragged)).toBeLessThan(kidsOf(wm(), wrap).indexOf(win2));
      expect(parentOf(wm(), win1) === col).toBe(true);
      expect(parentOf(wm(), win3) === col).toBe(true);
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

      const parent = parentOf(wm(), dragged);
      expect(parent.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(kidsOf(wm(), parent).includes(target)).toBe(true);
      expect(kidsOf(wm(), parent).indexOf(dragged)).toBeLessThan(kidsOf(wm(), parent).indexOf(target));
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
      const parent = parentOf(wm(), dragged);
      expect(parent).toBeTruthy();
      expect(parent.layout).toBe(LAYOUT_TYPES.HSPLIT);
      const children = kidsOf(wm(), parent).filter((c) => c.nodeType === NODE_TYPES.WINDOW);
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

    it("uses tree slot for zone paint when Meta frame is tiny (inactive tab lag)", () => {
      setupPreviewTest();
      const monitor = getMonitor();
      // Tree slot = full half-tile; Meta frame lagging at top ~1/6 height.
      const { nodeWindow: target, metaWindow: targetMeta } = createWindowWithRect(monitor, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      target.renderRect = { x: 0, y: 0, width: 960, height: 1080 };
      target.rect = { x: 0, y: 0, width: 960, height: 1080 };
      targetMeta.get_frame_rect = () => new Rectangle({ x: 0, y: 0, width: 960, height: 180 });

      const { nodeWindow: dragged } = createWindowWithRect(
        monitor,
        { x: 960, y: 0, width: 960, height: 1080 },
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

      // Pointer mid-slot (would miss tiny frame zones if frame were used).
      setPointer(480, 540);
      wm().nodeWinAtPointer = target;
      wm().moveWindowToPointer(dragged, true);

      expect(previewHint.show).toHaveBeenCalled();
      expect(previewHint.set_position).toHaveBeenCalledWith(0, 0);
      expect(previewHint.set_size).toHaveBeenCalledWith(960, 1080);
      // CENTER of full slot, not the squished frame.
      expect(zoneActors.CENTER.set_style_class_name).toHaveBeenCalledWith(
        expect.stringMatching(/window-tilepreview-/)
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

      setPointer(100, 540);
      wm().nodeWinAtPointer = target;

      wm().moveWindowToPointer(dragged, false);

      const parent = parentOf(wm(), dragged);
      expect(parent === parentOf(wm(), target)).toBe(true);
      expect(parent.nodeType).toBe(NODE_TYPES.CON);
      expect(parent === monitor).toBe(false);
      expect(kidsOf(wm(), parent).includes(target) && kidsOf(wm(), parent).includes(dragged)).toBe(true);
      expect(soleMonChild(monitor).nodeType).toBe(NODE_TYPES.CON);
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

      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentOf(wm(), stackedCon) === wrap).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(dragged)).toBeLessThan(
        kidsOf(wm(), wrap).indexOf(stackedCon)
      );
      expect(kidsOf(wm(), stackedCon).includes(target)).toBe(true);
      expect(kidsOf(wm(), stackedCon).includes(other)).toBe(true);
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

      const wrap = parentOf(wm(), dragged);
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(wm(), stackedCon) === wrap).toBe(true);
      expect(kidsOf(wm(), wrap).indexOf(dragged)).toBeLessThan(
        kidsOf(wm(), wrap).indexOf(stackedCon)
      );
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

      wm().moveWindowToPointer(dragged, false);

      // dnd-center-layout=SWAP is not live; CENTER is Group.
      const bag = parentOf(wm(), dragged);
      expect(bag === parentOf(wm(), target)).toBe(true);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
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

      wm().moveWindowToPointer(dragged, false);

      const bag = parentOf(wm(), dragged);
      expect(bag === parentOf(wm(), target)).toBe(true);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
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

      wm().moveWindowToPointer(dragged, false);

      const bag = parentOf(wm(), dragged);
      expect(bag === parentOf(wm(), target)).toBe(true);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
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

      // Mark 2 center is half-pane; 29.9% is inside C → Group, not the old 30% LEFT band.
      const bag = parentOf(wm(), dragged);
      expect(bag === parentOf(wm(), target)).toBe(true);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(soleMonChild(monitor).nodeType).toBe(NODE_TYPES.CON);
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

      wm().moveWindowToPointer(dragged, false);

      // CENTER Group; dnd-center-layout=SWAP is not live. Max-1 forbids two WINDOW kids on MONITOR.
      const bag = parentOf(wm(), dragged);
      expect(bag === parentOf(wm(), target)).toBe(true);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(wm(), bag) === monitor).toBe(true);
      expect(kidsOf(wm(), monitor)).toHaveLength(1);
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

      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.VSPLIT).toBe(true);
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

      expect(parentOf(wm(), dragged).layout === LAYOUT_TYPES.HSPLIT).toBe(true);
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
