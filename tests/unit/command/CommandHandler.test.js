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
      updateDecorationLayout: vi.fn(),
      updateBorderLayout: vi.fn(),
      movePointerWith: vi.fn(),
      // AP1: FocusChanged body; mock mirrors stage composition for spy tests.
      afterFocus: vi.fn(function (node, opts) {
        this.updateStackedFocus(node);
        this.updateTabbedFocus(node);
        this.updateDecorationLayout?.({ scope: "focus", focusNode: node });
        this.updateBorderLayout?.();
        this.movePointerWith(node, { force: !!(opts && opts.forcePointer) });
        if (this.tree) this.tree.attachNode = node;
      }),
      // AP2: StructureChanged — one C via commitLayout; settle without 2nd C.
      commitLayout: vi.fn(function (reason, opts) {
        this.renderTree(reason, !!(opts && opts.force));
      }),
      settleTabFocus: vi.fn(function (node) {
        this.updateStackedFocus(node);
        this.updateTabbedFocus(node);
        this.updateDecorationLayout?.({ scope: "focus", focusNode: node });
        this.updateBorderLayout?.();
      }),
      revealGroupChild: vi.fn(function (node, opts) {
        const parent = node?.parentNode;
        if (parent) parent.lastTabFocus = node.nodeValue;
        this.settleTabFocus?.(node);
        if (opts?.keyboard) {
          node?.nodeValue?.activate?.();
          this.afterFocus?.(node, { source: opts.source || "reveal" });
        }
      }),
      determineSplitLayout: vi.fn(() => LAYOUT_TYPES.HSPLIT),
      applyDefaultLayoutToContainer: vi.fn(),
      floatAllWindows: vi.fn(),
      unfloatAllWindows: vi.fn(),
      floatWorkspace: vi.fn(),
      unfloatWorkspace: vi.fn(),
      _isWorkspaceSkipped: vi.fn(() => false),
      prefsTitle: "Forge Preferences",
      reloadWindowOverrides: vi.fn(),
      toggleWorkspaceMonocle: vi.fn(),
      toggleZoom: vi.fn(),
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

    it("should commit layout after reset", () => {
      commandHandler.execute({ name: "WindowResetSizes" });

      expect(mockWm.commitLayout).toHaveBeenCalledWith("window-reset-sizes", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-reset-sizes", true);
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

    it("should reveal lastChild when entering stacked from tabbed", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;
      mockNodeWindow.parentNode.lastChild = mockNodeWindow;

      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockWm.revealGroupChild).toHaveBeenCalledWith(mockNodeWindow, {
        keyboard: true,
        source: "command-layout",
      });
      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
    });

    it("should call unfreezeRender", () => {
      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockWm.unfreezeRender).toHaveBeenCalled();
    });

    it("should commit layout once after toggle", () => {
      commandHandler.execute({ name: "LayoutStackedToggle" });

      expect(mockWm.commitLayout).toHaveBeenCalledWith("layout-stacked-toggle", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
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

      expect(mockWm.revealGroupChild).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
    });

    it("should toggle from TABBED to split layout and clear lastTabFocus", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;

      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockWm.determineSplitLayout).toHaveBeenCalled();
      expect(mockNodeWindow.parentNode.lastTabFocus).toBeNull();
    });

    it("should commit layout once after toggle", () => {
      commandHandler.execute({ name: "LayoutTabbedToggle" });

      expect(mockWm.commitLayout).toHaveBeenCalledWith("layout-tabbed-toggle", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
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
      expect(mockWm.revealGroupChild).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
      expect(mockWm.commitLayout).toHaveBeenCalledWith("layout-stack-tab-toggle", { force: true });
    });

    it("should switch TABBED to STACKED", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.TABBED;
      mockNodeWindow.parentNode.lastTabFocus = mockMetaWindow;
      mockNodeWindow.parentNode.lastChild = mockNodeWindow;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.STACKED);
      expect(mockWm.revealGroupChild).toHaveBeenCalledWith(mockNodeWindow, {
        keyboard: true,
        source: "command-layout",
      });
      expect(mockNodeWindow.parentNode.lastTabFocus).toBe(mockMetaWindow);
      expect(mockWm.commitLayout).toHaveBeenCalledWith("layout-stack-tab-toggle", { force: true });
    });

    it("should no-op on split (groupify is a later op)", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.HSPLIT;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(mockWm.commitLayout).not.toHaveBeenCalled();
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });

    it("should no-op on VSPLIT", () => {
      mockNodeWindow.parentNode.layout = LAYOUT_TYPES.VSPLIT;

      commandHandler.execute({ name: "LayoutStackTabToggle" });

      expect(mockNodeWindow.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(mockWm.commitLayout).not.toHaveBeenCalled();
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
      expect(mockWm.commitLayout).toHaveBeenCalledWith("window-merge-group", { force: true });
      expect(mockWm.revealGroupChild).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
      expect(mockWm.renderTree).toHaveBeenCalledWith("window-merge-group", true);
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

  describe("WorkspaceMonocleToggle command", () => {
    it("should call toggleWorkspaceMonocle", () => {
      commandHandler.execute({ name: "WorkspaceMonocleToggle" });

      expect(mockWm.toggleWorkspaceMonocle).toHaveBeenCalled();
    });
  });

  describe("Zoom commands", () => {
    it("ZoomToggle / Horizontal / Vertical call toggleZoom", () => {
      commandHandler.execute({ name: "ZoomToggle" });
      commandHandler.execute({ name: "ZoomHorizontal" });
      commandHandler.execute({ name: "ZoomVertical" });
      expect(mockWm.toggleZoom).toHaveBeenNthCalledWith(1, "full");
      expect(mockWm.toggleZoom).toHaveBeenNthCalledWith(2, "horizontal");
      expect(mockWm.toggleZoom).toHaveBeenNthCalledWith(3, "vertical");
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

    it("should commit layout once after swap", () => {
      commandHandler.execute({ name: "WindowSwapLastActive" });

      expect(mockWm.commitLayout).toHaveBeenCalledWith("swap-last-active", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
      expect(mockWm.renderTree).toHaveBeenCalledWith("swap-last-active", true);
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

  describe("WindowUnfocus command (abandoned)", () => {
    it("is a no-op — keybind/command product path removed", () => {
      mockWm.exitForgeMode = vi.fn(() => false);
      mockWm.unfocusTiles = vi.fn();

      expect(() => commandHandler.execute({ name: "WindowUnfocus" })).not.toThrow();

      expect(mockWm.exitForgeMode).not.toHaveBeenCalled();
      expect(mockWm.unfocusTiles).not.toHaveBeenCalled();
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

    it("should commit layout once after toggle", () => {
      commandHandler.execute({ name: "ShowTabDecorationToggle" });

      expect(mockWm.commitLayout).toHaveBeenCalledWith("showtab-decoration-enabled", {
        force: true,
      });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
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

    it("should queue render event that commits layout once", () => {
      commandHandler.execute({
        name: "SnapLayoutMove",
        direction: "left",
        amount: 0.5,
      });

      expect(mockWm.queueEvent).toHaveBeenCalledWith({
        name: "snap-layout-move",
        callback: expect.any(Function),
      });
      const { callback } = mockWm.queueEvent.mock.calls[0][0];
      callback();
      expect(mockWm.commitLayout).toHaveBeenCalledWith("snap-layout-move", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
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

  // AP4: remaining StructureChanged / SizeOnly → one commitLayout Cf each.
  describe("AP4 structure handlers use commitLayout", () => {
    it.each([
      ["Split", { name: "Split", orientation: "horizontal" }, "split"],
      ["LayoutToggle", { name: "LayoutToggle" }, "layout-split-toggle"],
      ["WindowResetSizes", { name: "WindowResetSizes" }, "window-reset-sizes"],
      ["WorkspaceActiveTileToggle", { name: "WorkspaceActiveTileToggle" }, "workspace-toggle"],
    ])("%s commits once with force", (_label, action, reason) => {
      mockSettings.get_string.mockReturnValue("");
      commandHandler.execute(action);
      expect(mockWm.commitLayout).toHaveBeenCalledWith(reason, { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
      expect(mockWm.renderTree).toHaveBeenCalledWith(reason, true);
    });

    it("Focus still afterFocus only (no C)", () => {
      commandHandler.execute({ name: "Focus", direction: "right" });
      expect(mockWm.afterFocus).toHaveBeenCalled();
      expect(mockWm.commitLayout).not.toHaveBeenCalled();
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });
  });

  // forge-zrl: cyclic focus/swap dispatch.
  describe("FocusNext/FocusPrev/SwapNext/SwapPrev commands", () => {
    it("FocusNext cycles focus forward and runs afterFocus", () => {
      commandHandler.execute({ name: "FocusNext" });
      expect(mockTree.focusSibling).toHaveBeenCalledWith(mockNodeWindow, 1);
      expect(mockWm.afterFocus).toHaveBeenCalledWith(mockNodeWindow, {
        source: "command-focus-sibling",
      });
      expect(mockWm.updateStackedFocus).toHaveBeenCalled();
      expect(mockWm.updateTabbedFocus).toHaveBeenCalled();
    });

    it("FocusPrev cycles focus backward", () => {
      commandHandler.execute({ name: "FocusPrev" });
      expect(mockTree.focusSibling).toHaveBeenCalledWith(mockNodeWindow, -1);
    });

    it("SwapNext swaps forward and one-commits when a swap happened", () => {
      commandHandler.execute({ name: "SwapNext" });
      expect(mockTree.swapSibling).toHaveBeenCalledWith(mockNodeWindow, 1);
      expect(mockWm.commitLayout).toHaveBeenCalledWith("swap-sibling", { force: true });
      expect(mockWm.renderTree).toHaveBeenCalledTimes(1);
      expect(mockWm.renderTree).toHaveBeenCalledWith("swap-sibling", true);
      expect(mockWm.settleTabFocus).toHaveBeenCalledWith(mockNodeWindow);
      expect(mockWm.movePointerWith).toHaveBeenCalledWith(mockNodeWindow);
    });

    it("SwapPrev swaps backward", () => {
      commandHandler.execute({ name: "SwapPrev" });
      expect(mockTree.swapSibling).toHaveBeenCalledWith(mockNodeWindow, -1);
    });

    it("SwapNext does not commit when no swap target exists", () => {
      mockTree.swapSibling.mockReturnValue(null);
      commandHandler.execute({ name: "SwapNext" });
      expect(mockWm.commitLayout).not.toHaveBeenCalled();
      expect(mockWm.renderTree).not.toHaveBeenCalled();
    });
  });
});
