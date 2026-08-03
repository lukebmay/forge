import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CommandHandler } from "../../../lib/extension/command.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import {
  createMockWindow,
  installGnomeGlobals,
  createMockSettings,
} from "../../mocks/helpers/index.js";
import { GrabOp } from "../../mocks/gnome/Meta.js";

/**
 * CommandHandler unit tests
 *
 * Tests for the CommandHandler class which processes keyboard and action commands.
 * Uses mocked WindowManager/Tree to verify CommandHandler calls the right methods.
 */
describe("CommandHandler", () => {
  let commandHandler;
  let mockWm;
  let mockTree;
  let mockNodeWindow;
  let mockMetaWindow;
  let mockSettings;
  let mockExt;
  let ctx;

  /**
   * Creates a mock node window with parent chain
   */
  function createMockNodeWindow(metaWindow) {
    const node = {
      nodeValue: metaWindow,
      nodeType: NODE_TYPES.WINDOW,
      mode: WINDOW_MODES.TILE,
      rect: { x: 0, y: 0, width: 800, height: 600 },
      parentNode: {
        layout: LAYOUT_TYPES.HSPLIT,
        childNodes: [],
        lastChild: null,
        lastTabFocus: null,
        isMonitor: vi.fn(() => false),
        appendChild: vi.fn(),
        parentNode: { layout: LAYOUT_TYPES.HSPLIT },
      },
      isFloat: vi.fn(() => false),
    };
    node.parentNode.lastChild = node;
    return node;
  }

  /**
   * Creates a mock WindowManager with all required methods
   */
  function createMockWindowManager(ext, tree, nodeWindow) {
    return {
      ext,
      tree,
      focusMetaWindow: nodeWindow?.nodeValue,
      findNodeWindow: vi.fn(() => nodeWindow),
      toggleFloatingMode: vi.fn(),
      move: vi.fn(),
      renderTree: vi.fn(),
      unfreezeRender: vi.fn(),
      queueEvent: vi.fn(),
      updateStackedFocus: vi.fn(),
      updateTabbedFocus: vi.fn(),
      movePointerWith: vi.fn(),
      determineSplitLayout: vi.fn(() => LAYOUT_TYPES.HSPLIT),
      applyDefaultLayoutToContainer: vi.fn(),
      floatAllWindows: vi.fn(),
      unfloatAllWindows: vi.fn(),
      floatWorkspace: vi.fn(),
      unfloatWorkspace: vi.fn(),
      prefsTitle: "Forge Preferences",
      reloadWindowOverrides: vi.fn(),
      addFloatOverride: vi.fn(),
      resize: vi.fn(),
      expand: vi.fn(),
      shrink: vi.fn(),
      applyGoldenRatio: vi.fn(),
      moveCenter: vi.fn(),
      eventQueue: [],
    };
  }

  /**
   * Creates a mock Tree with all required methods
   */
  function createMockTree(nodeWindow) {
    return {
      getTiledChildren: vi.fn(() => [nodeWindow]),
      resetSiblingPercent: vi.fn(),
      move: vi.fn(() => true),
      focus: vi.fn(() => nodeWindow),
      focusSibling: vi.fn(() => nodeWindow),
      swapSibling: vi.fn(() => nodeWindow),
      swap: vi.fn(),
      swapPairs: vi.fn(),
      split: vi.fn(),
      processGap: vi.fn((node) => node.rect),
      findNode: vi.fn(() => nodeWindow),
      attachNode: null,
    };
  }

  beforeEach(() => {
    ctx = installGnomeGlobals();

    mockMetaWindow = createMockWindow({ wm_class: "TestApp", title: "Test Window" });
    ctx.display.get_current_time.mockReturnValue(12345);
    ctx.display.get_tab_next = vi.fn(() => mockMetaWindow);

    mockSettings = createMockSettings({
      "focus-border-toggle": true,
      "tiling-mode-enabled": true,
      "stacked-tiling-mode-enabled": true,
      "tabbed-tiling-mode-enabled": true,
      "showtab-decoration-enabled": true,
      "window-gap-size-increment": 4,
    });

    mockExt = {
      settings: mockSettings,
      openPreferences: vi.fn(),
    };

    mockNodeWindow = createMockNodeWindow(mockMetaWindow);
    mockTree = createMockTree(mockNodeWindow);
    mockWm = createMockWindowManager(mockExt, mockTree, mockNodeWindow);
    commandHandler = new CommandHandler(mockWm);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("WindowGoldenRatio command", () => {
    it("should delegate to wm.applyGoldenRatio", () => {
      commandHandler.execute({ name: "WindowGoldenRatio" });

      expect(mockWm.applyGoldenRatio).toHaveBeenCalledTimes(1);
    });
  });

  describe("WindowResetSizes command", () => {
    it("should reset sibling percentages for parent node", () => {
      commandHandler.execute({ name: "WindowResetSizes" });

      expect(mockTree.resetSiblingPercent).toHaveBeenCalledWith(mockNodeWindow.parentNode);
    });

    it("should reset sibling percentages for grandparent node", () => {
      commandHandler.execute({ name: "WindowResetSizes" });

      expect(mockTree.resetSiblingPercent).toHaveBeenCalledWith(
        mockNodeWindow.parentNode.parentNode
      );
    });

    it("should render tree after reset", () => {
      commandHandler.execute({ name: "WindowResetSizes" });

      expect(mockWm.renderTree).toHaveBeenCalledWith("window-reset-sizes");
    });

    it("should do nothing if no focus window node", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      commandHandler.execute({ name: "WindowResetSizes" });

      expect(mockTree.resetSiblingPercent).not.toHaveBeenCalled();
    });

    it("should handle missing grandparent gracefully", () => {
      mockNodeWindow.parentNode.parentNode = null;

      commandHandler.execute({ name: "WindowResetSizes" });

      // Should still reset parent
      expect(mockTree.resetSiblingPercent).toHaveBeenCalledWith(mockNodeWindow.parentNode);
    });
  });

  describe("LayoutStackedToggle command", () => {
    beforeEach(() => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return true;
        return false;
      });
    });

    it("should toggle from HSPLIT to STACKED", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.HSPLIT;

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.STACKED);
    });

    it("should toggle from STACKED to split layout", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.STACKED;

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockWm.determineSplitLayout).toHaveBeenCalled();
      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should not resetSiblingPercent when exiting STACKED (I1)", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.STACKED;
      mockNodeWindow.parentNode.childNodes = [
        { id: "a", percent: 0.6 },
        { id: "b", percent: 0.4 },
      ];

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockTree.resetSiblingPercent).not.toHaveBeenCalled();
      expect(mockNodeWindow.parentNode.childNodes[0].percent).toBe(0.6);
    });

    it("should split first if parent is monitor", () => {
      mockNodeWindow.parentNode.isMonitor.mockReturnValue(true);

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockTree.split).toHaveBeenCalledWith(
        mockNodeWindow,
        ORIENTATION_TYPES.HORIZONTAL,
        true
      );
    });

    it("should clear lastTabFocus when switching from tabbed", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockNodeWindow.parentNode.lastTabFocus).toBeNull();
    });

    it("should call unfreezeRender", () => {
      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockWm.unfreezeRender).toHaveBeenCalled();
    });

    it("should do nothing if stacked mode disabled", () => {
      mockSettings.get_boolean.mockReturnValue(false);

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should do nothing if no focus window", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      expect(() => {
        commandHandler.execute({ name: "LayoutStackedToggle" });
      }).not.toThrow();
    });
  });

  describe("LayoutTabbedToggle command", () => {
    beforeEach(() => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "tabbed-tiling-mode-enabled") return true;
        return false;
      });
    });

    it("should toggle from HSPLIT to TABBED", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.HSPLIT;

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    });

    it("should set lastTabFocus when enabling tabbed", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.HSPLIT;

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
    });

    it("should toggle from TABBED to split layout and clear lastTabFocus", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockWm.determineSplitLayout).toHaveBeenCalled();
      expect(mockNodeWindow.parentNode.lastTabFocus).toBeNull();
      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should not resetSiblingPercent when exiting TABBED (I1)", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;
      mockNodeWindow.parentNode.childNodes = [
        { id: "a", percent: 0.25 },
        { id: "nested", percent: 0.75 },
      ];

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockTree.resetSiblingPercent).not.toHaveBeenCalled();
      expect(mockNodeWindow.parentNode.childNodes).toHaveLength(2);
      expect(mockNodeWindow.parentNode.childNodes[1].percent).toBe(0.75);
    });

    it("should do nothing if tabbed mode disabled", () => {
      mockSettings.get_boolean.mockReturnValue(false);

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });
  });

  describe("LayoutStackTabToggle command", () => {
    beforeEach(() => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "stacked-tiling-mode-enabled") return true;
        if (key === "tabbed-tiling-mode-enabled") return true;
        return false;
      });
    });

    it("should switch STACKED to TABBED", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.STACKED;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
    });

    it("should switch TABBED to STACKED", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;
      mockNodeWindow.parentNode.lastChild = mockNodeWindow;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.STACKED);
      expect(mockNodeWindow.parentNode.lastTabFocus).toBeNull();
    });

    it("should no-op on split (groupify is a later op)", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.HSPLIT;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });

    it("should no-op on VSPLIT", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.VSPLIT;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });

    it("should do nothing if both modes disabled", () => {
      mockSettings.get_boolean.mockReturnValue(false);
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("WindowMergeGroup command", () => {
    let partnerMeta;
    let partnerNode;

    beforeEach(() => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "tabbed-tiling-mode-enabled") return true;
        return false;
      });
      partnerMeta = createMockWindow({ wm_class: "Partner", title: "Partner" });
      partnerNode = createMockNodeWindow(partnerMeta);
      partnerNode.parentNode = mockNodeWindow.parentNode;
      mockNodeWindow.parentNode.childNodes = [mockNodeWindow, partnerNode];
      mockTree.findNode.mockImplementation((win) => {
        if (win === partnerMeta) return partnerNode;
        if (win === mockMetaWindow) return mockNodeWindow;
        return null;
      });
      mockTree.mergeWindowsIntoGroup = vi.fn(() => mockNodeWindow.parentNode);
      mockTree.getTiledChildren.mockReturnValue([mockNodeWindow, partnerNode]);
      ctx.display.get_tab_next = vi.fn(() => partnerMeta);
    });

    it("should merge focus with last-active into a tabbed group", () => {
      commandHandler.execute({ name: "WindowMergeGroup" });

      expect(mockTree.mergeWindowsIntoGroup).toHaveBeenCalledWith(
        mockNodeWindow,
        partnerNode,
        LAYOUT_TYPES.TABBED
      );
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-merge-group");
    });

    it("should fall back to tiled sibling when last-active missing", () => {
      ctx.display.get_tab_next = vi.fn(() => null);

      commandHandler.execute({ name: "WindowMergeGroup" });

      expect(mockTree.mergeWindowsIntoGroup).toHaveBeenCalledWith(
        mockNodeWindow,
        partnerNode,
        LAYOUT_TYPES.TABBED
      );
    });

    it("should do nothing if tabbed mode disabled", () => {
      mockSettings.get_boolean.mockReturnValue(false);

      commandHandler.execute({ name: "WindowMergeGroup" });

      expect(mockTree.mergeWindowsIntoGroup).not.toHaveBeenCalled();
    });

    it("should do nothing if no partner", () => {
      ctx.display.get_tab_next = vi.fn(() => null);
      mockTree.getTiledChildren.mockReturnValue([mockNodeWindow]);

      commandHandler.execute({ name: "WindowMergeGroup" });

      expect(mockTree.mergeWindowsIntoGroup).not.toHaveBeenCalled();
    });
  });

  describe("WindowUngroup command", () => {
    it("should ungroup nearest parent CON", () => {
      const con = mockNodeWindow.parentNode;
      con.nodeType = NODE_TYPES.CON;
      con.isCon = () => true;
      const mon = { nodeType: NODE_TYPES.MONITOR, layout: LAYOUT_TYPES.HSPLIT };
      con.parentNode = mon;
      mockTree.ungroupContainer = vi.fn(() => mon);

      commandHandler.execute({ name: "WindowUngroup" });

      expect(mockTree.ungroupContainer).toHaveBeenCalledWith(con);
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-ungroup");
    });

    it("should no-op when focus has no CON parent", () => {
      mockNodeWindow.parentNode = {
        nodeType: NODE_TYPES.MONITOR,
        isCon: () => false,
        isMonitor: () => true,
        childNodes: [mockNodeWindow],
      };
      mockTree.ungroupContainer = vi.fn();

      commandHandler.execute({ name: "WindowUngroup" });

      expect(mockTree.ungroupContainer).not.toHaveBeenCalled();
    });
  });

  describe("FocusParent / FocusChild / ClearSelection (C4/S1)", () => {
    it("FocusParent sets attachNode to parent CON after activate", () => {
      const con = mockNodeWindow.parentNode;
      con.nodeType = NODE_TYPES.CON;
      con.isCon = () => true;
      con.contains = (n) => n === mockNodeWindow;
      con.childNodes = [mockNodeWindow];
      const mon = { nodeType: NODE_TYPES.MONITOR };
      con.parentNode = mon;
      mockNodeWindow.nodeValue.activate = vi.fn();
      mockNodeWindow.nodeValue.raise = vi.fn();
      mockTree.findNode = vi.fn();
      mockWm.updateBorderLayout = vi.fn();

      commandHandler.execute({ name: "FocusParent" });

      expect(mockTree.attachNode).toBe(con);
      expect(mockNodeWindow.nodeValue.activate).toHaveBeenCalled();
      expect(mockWm.updateBorderLayout).toHaveBeenCalled();
    });

    it("FocusParent no-ops under MONITOR", () => {
      mockNodeWindow.parentNode = {
        nodeType: NODE_TYPES.MONITOR,
        isCon: () => false,
        isMonitor: () => true,
      };
      mockTree.attachNode = undefined;

      commandHandler.execute({ name: "FocusParent" });

      expect(mockTree.attachNode).toBeUndefined();
    });

    it("ClearSelection snaps attachNode to focused leaf", () => {
      const con = mockNodeWindow.parentNode;
      con.nodeType = NODE_TYPES.CON;
      con.isCon = () => true;
      con.contains = (n) => n === mockNodeWindow;
      mockTree.attachNode = con;
      mockWm.updateBorderLayout = vi.fn();

      commandHandler.execute({ name: "ClearSelection" });

      expect(mockTree.attachNode).toBe(mockNodeWindow);
      expect(mockWm.updateBorderLayout).toHaveBeenCalled();
    });
  });

  describe("WindowMoveOut / WindowMoveIn (C4)", () => {
    it("WindowMoveOut calls tree.moveUnitOut", () => {
      const mon = { nodeType: NODE_TYPES.MONITOR };
      mockTree.moveUnitOut = vi.fn(() => mon);

      commandHandler.execute({ name: "WindowMoveOut" });

      expect(mockTree.moveUnitOut).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-move-out");
    });

    it("WindowMoveIn calls tree.moveUnitIn", () => {
      const target = { nodeType: NODE_TYPES.CON };
      mockTree.moveUnitIn = vi.fn(() => target);

      commandHandler.execute({ name: "WindowMoveIn" });

      expect(mockTree.moveUnitIn).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-move-in");
    });
  });

  describe("ConfigReload command", () => {
    it("should call reloadWindowOverrides", () => {
      commandHandler.execute({ name: "ConfigReload" });

      expect(mockWm.reloadWindowOverrides).toHaveBeenCalled();
    });
  });

  describe("MovePointerToFocus command", () => {
    it("should call movePointerWith with force option", () => {
      commandHandler.execute({ name: "MovePointerToFocus" });

      expect(mockWm.movePointerWith).toHaveBeenCalledWith(mockNodeWindow, { force: true });
    });

    it("should not call movePointerWith if no focus window", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      commandHandler.execute({ name: "MovePointerToFocus" });

      expect(mockWm.movePointerWith).not.toHaveBeenCalled();
    });
  });

  describe("WindowSwapLastActive command", () => {
    it("should swap with last active window", () => {
      const lastActiveWindow = createMockWindow({ title: "Last Active" });
      const lastActiveNode = { nodeValue: lastActiveWindow };

      ctx.display.get_tab_next.mockReturnValue(lastActiveWindow);
      mockTree.findNode.mockReturnValue(lastActiveNode);

      commandHandler.execute({ name: "WindowSwapLastActive" });

      expect(mockTree.swapPairs).toHaveBeenCalledWith(lastActiveNode, mockNodeWindow);
    });

    it("should move pointer after swap", () => {
      commandHandler.execute({ name: "WindowSwapLastActive" });

      expect(mockWm.movePointerWith).toHaveBeenCalledWith(mockNodeWindow);
    });

    it("should render tree after swap", () => {
      commandHandler.execute({ name: "WindowSwapLastActive" });

      expect(mockWm.renderTree).toHaveBeenCalledWith("swap-last-active");
    });

    it("should not swap if no focus window", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      commandHandler.execute({ name: "WindowSwapLastActive" });

      expect(mockTree.swapPairs).not.toHaveBeenCalled();
    });
  });

  describe("LayoutDebugOverlayToggle command", () => {
    it("should toggle layout-debug-overlay-enabled setting", () => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "layout-debug-overlay-enabled") return false;
        return false;
      });

      commandHandler.execute({ name: "LayoutDebugOverlayToggle" });

      expect(mockSettings.set_boolean).toHaveBeenCalledWith("layout-debug-overlay-enabled", true);
    });

    it("should flip enabled to disabled", () => {
      mockSettings.get_boolean.mockImplementation((key) => key === "layout-debug-overlay-enabled");

      commandHandler.execute({ name: "LayoutDebugOverlayToggle" });

      expect(mockSettings.set_boolean).toHaveBeenCalledWith("layout-debug-overlay-enabled", false);
    });
  });

  describe("ShowTabDecorationToggle command", () => {
    beforeEach(() => {
      mockSettings.get_boolean.mockImplementation((key) => {
        if (key === "tabbed-tiling-mode-enabled") return true;
        if (key === "showtab-decoration-enabled") return true;
        return false;
      });
    });

    it("should toggle showtab-decoration-enabled setting", () => {
      commandHandler.execute({ name: "ShowTabDecorationToggle" });

      expect(mockSettings.set_boolean).toHaveBeenCalledWith("showtab-decoration-enabled", false);
    });

    it("should call unfreezeRender", () => {
      commandHandler.execute({ name: "ShowTabDecorationToggle" });

      expect(mockWm.unfreezeRender).toHaveBeenCalled();
    });

    it("should do nothing if tabbed mode disabled", () => {
      mockSettings.get_boolean.mockReturnValue(false);

      commandHandler.execute({ name: "ShowTabDecorationToggle" });

      expect(mockSettings.set_boolean).not.toHaveBeenCalled();
    });

    it("should do nothing if no focus window", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      commandHandler.execute({ name: "ShowTabDecorationToggle" });

      expect(mockSettings.set_boolean).not.toHaveBeenCalled();
    });
  });

  describe("Window resize commands", () => {
    it("should resize right with amount", () => {
      commandHandler.execute({ name: "WindowResizeRight", amount: 50 });

      expect(mockWm.resize).toHaveBeenCalledWith(GrabOp.KEYBOARD_RESIZING_E, 50);
    });

    it("should resize left with amount", () => {
      commandHandler.execute({ name: "WindowResizeLeft", amount: 30 });

      expect(mockWm.resize).toHaveBeenCalledWith(GrabOp.KEYBOARD_RESIZING_W, 30);
    });

    it("should resize top with amount", () => {
      commandHandler.execute({ name: "WindowResizeTop", amount: 40 });

      expect(mockWm.resize).toHaveBeenCalledWith(GrabOp.KEYBOARD_RESIZING_N, 40);
    });

    it("should resize bottom with amount", () => {
      commandHandler.execute({ name: "WindowResizeBottom", amount: 60 });

      expect(mockWm.resize).toHaveBeenCalledWith(GrabOp.KEYBOARD_RESIZING_S, 60);
    });
  });

  describe("WindowExpand command", () => {
    it("should expand on both axes via wm.expand (forge-gm0z)", () => {
      commandHandler.execute({ name: "WindowExpand", amount: 20 });

      // forge-gm0z: a single two-axis expand replaces the four overlapping
      // grabs that clobbered this.grabOp.
      expect(mockWm.expand).toHaveBeenCalledWith(20);
      expect(mockWm.resize).not.toHaveBeenCalled();
    });
  });

  describe("WindowShrink command", () => {
    it("should shrink on both axes via wm.shrink (forge-gm0z)", () => {
      commandHandler.execute({ name: "WindowShrink", amount: 20 });

      expect(mockWm.shrink).toHaveBeenCalledWith(20);
      expect(mockWm.resize).not.toHaveBeenCalled();
    });
  });

  describe("SnapLayoutMove command", () => {
    beforeEach(() => {
      mockMetaWindow.get_work_area_current_monitor = vi.fn(() => ({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      }));
      mockMetaWindow.get_frame_rect = vi.fn(() => ({
        x: 100,
        y: 100,
        width: 800,
        height: 600,
      }));
    });

    it("should snap to left with layout amount", () => {
      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      expect(mockNodeWindow.rect.width).toBe(960); // 0.5 * 1920
      expect(mockNodeWindow.rect.x).toBe(0);
    });

    it("should snap to right with layout amount", () => {
      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "right",
        amount: 0.5,
      });

      expect(mockNodeWindow.rect.width).toBe(960);
      expect(mockNodeWindow.rect.x).toBe(960); // 1920 - 960
    });

    it("should add float override if window not floating", () => {
      mockNodeWindow.isFloat.mockReturnValue(false);

      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      // forge-qh2: snap floats the window instance (withWmId=true), not the whole
      // wm_class, so windowDestroy's per-window removal can clean it up.
      expect(mockWm.addFloatOverride).toHaveBeenCalledWith(mockMetaWindow, true);
    });

    it("should not add a float override if window is already floating", () => {
      mockNodeWindow.isFloat.mockReturnValue(true);

      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "right",
        amount: 0.5,
      });

      expect(mockWm.addFloatOverride).not.toHaveBeenCalled();
    });

    it("should call move with calculated rect", () => {
      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      expect(mockWm.move).toHaveBeenCalled();
    });

    it("should queue render event", () => {
      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      expect(mockWm.queueEvent).toHaveBeenCalledWith({
        name: "snap-layout-move",
        callback: expect.any(Function),
      });
    });

    it("should not snap if no focus window", () => {
      mockWm.findNodeWindow.mockReturnValue(null);

      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      expect(mockWm.move).not.toHaveBeenCalled();
    });
  });

  describe("Unknown command", () => {
    it("should handle unknown command gracefully", () => {
      expect(() => {
        commandHandler.execute({ name: "UnknownCommand" });
      }).not.toThrow();
    });
  });

  // forge-zrl: cyclic focus/swap dispatch.
  describe("FocusNext/FocusPrev/SwapNext/SwapPrev commands", () => {
    it("FocusNext cycles focus forward and updates stacked/tabbed focus", () => {
      commandHandler.execute({ name: "FocusNext" });
      expect(mockTree.focusSibling).toHaveBeenCalledWith(mockNodeWindow, 1);
      expect(mockWm.updateStackedFocus).toHaveBeenCalled();
      expect(mockWm.updateTabbedFocus).toHaveBeenCalled();
    });

    it("FocusPrev cycles focus backward", () => {
      commandHandler.execute({ name: "FocusPrev" });
      expect(mockTree.focusSibling).toHaveBeenCalledWith(mockNodeWindow, -1);
    });

    it("SwapNext swaps forward and re-renders when a swap happened", () => {
      commandHandler.execute({ name: "SwapNext" });
      expect(mockTree.swapSibling).toHaveBeenCalledWith(mockNodeWindow, 1);
      expect(mockWm.renderTree).toHaveBeenCalledWith("swap-sibling", true);
      expect(mockWm.movePointerWith).toHaveBeenCalledWith(mockNodeWindow);
    });

    it("SwapPrev swaps backward", () => {
      commandHandler.execute({ name: "SwapPrev" });
      expect(mockTree.swapSibling).toHaveBeenCalledWith(mockNodeWindow, -1);
    });

    it("SwapNext does not re-render when no swap target exists", () => {
      mockTree.swapSibling.mockReturnValue(null);
      commandHandler.execute({ name: "SwapNext" });
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });
  });
});
