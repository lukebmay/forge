import { describe, it, expect, beforeEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { MotionDirection } from "../../mocks/gnome/Meta.js";

/**
 * WindowManager command() — product TILES via action ids + forest structure.
 */
describe("WindowManager - Command System", () => {
  let ctx;
  let metaWindow;
  let nodeWindow;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "focus-border-toggle": true,
        "window-gap-size-increment": 4,
      },
    });

    // Create a test window in the tree
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const result = createWindowNode(ctx.tree, monitor, {
      windowOverrides: {
        wm_class: "TestApp",
        title: "Test Window",
        allows_resize: true,
      },
      layout: "HSPLIT",
    });
    metaWindow = result.metaWindow;
    nodeWindow = result.nodeWindow;

    ctx.display.get_focus_window.mockReturnValue(metaWindow);

    // Mock layout commit surface (commitLayout → renderTree for force Cf)
    wm().renderTree = vi.fn();
    wm().move = vi.fn();
    wm().movePointerWith = vi.fn();
    wm().unfreezeRender = vi.fn();
    wm().updateTabbedFocus = vi.fn();
    wm().updateStackedFocus = vi.fn();
  });

  // Convenience accessor
  const wm = () => ctx.windowManager;

  describe("FloatToggle Command", () => {
    it("should toggle floating mode", () => {
      const action = {
        name: "FloatToggle",
        mode: WINDOW_MODES.FLOAT,
        x: 0,
        y: 0,
        width: "50%",
        height: "50%",
      };

      wm().command(action);

      expect(nodeWindow.mode).toBe(WINDOW_MODES.FLOAT);
    });

    it("should call move with resolved rect", () => {
      const action = {
        name: "FloatToggle",
        mode: WINDOW_MODES.FLOAT,
        x: 100,
        y: 100,
        width: 800,
        height: 600,
      };

      wm().command(action);

      expect(wm().move).toHaveBeenCalled();
    });

    it("should commit layout after float toggle", () => {
      const commitSpy = vi.spyOn(wm(), "commitLayout");
      const action = {
        name: "FloatToggle",
        mode: WINDOW_MODES.FLOAT,
        x: 0,
        y: 0,
        width: "50%",
        height: "50%",
      };

      wm().command(action);

      expect(commitSpy).toHaveBeenCalledWith("float-toggle", { force: true });
      expect(wm().renderTree).toHaveBeenCalledWith("float-toggle", true);
    });
  });

  describe("Move Command", () => {
    let nodeWindow2;

    beforeEach(() => {
      const metaWindow2 = createMockWindow({
        wm_class: "TestApp2",
        title: "Test Window 2",
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;
    });

    it("in-axis Move swaps sibling order (Mark 2)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      wm().command({ name: "Move", direction: "right" });

      expect(kidsOf(wm(), monitor)).toHaveLength(1);
      const wrap = kidsOf(wm(), monitor)[0];
      expect(kidsOf(wm(), wrap).map((n) => n.nodeValue)).toEqual([
        nodeWindow2.nodeValue,
        nodeWindow.nodeValue,
      ]);
      expect(kidsOf(wm(), wrap)[0]).toBe(nodeWindow2);
      expect(kidsOf(wm(), wrap)[1]).toBe(nodeWindow);
    });

    it("should call unfreezeRender before move", () => {
      wm().command({ name: "Move", direction: "left" });

      expect(wm().unfreezeRender).toHaveBeenCalled();
    });

    it("should commit layout after move", () => {
      const commitSpy = vi.spyOn(wm(), "commitLayout");

      wm().command({ name: "Move", direction: "right" });

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(commitSpy).toHaveBeenCalledWith("move-window", { force: true });
      expect(wm().renderTree).toHaveBeenCalled();
    });
  });

  describe("Focus Command", () => {
    beforeEach(() => {
      // Create second window for focus
      const metaWindow2 = createMockWindow({
        wm_class: "TestApp2",
        title: "Test Window 2",
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;
    });

    it("should change focus in direction", () => {
      const action = { name: "Focus", direction: "right" };
      const focusSpy = vi.spyOn(ctx.tree, "focus");

      wm().command(action);

      expect(focusSpy).toHaveBeenCalledWith(nodeWindow, MotionDirection.RIGHT);
    });

    it("should handle focus with all directions", () => {
      const focusSpy = vi.spyOn(ctx.tree, "focus");

      wm().command({ name: "Focus", direction: "up" });
      wm().command({ name: "Focus", direction: "down" });
      wm().command({ name: "Focus", direction: "left" });
      wm().command({ name: "Focus", direction: "right" });

      expect(focusSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe("Swap Command (Join)", () => {
    let nodeWindow2;

    beforeEach(() => {
      const metaWindow2 = createMockWindow({
        wm_class: "TestApp2",
        title: "Test Window 2",
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      nodeWindow2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
      nodeWindow2.mode = WINDOW_MODES.TILE;
    });

    it("directional Swap dispatches Join and wraps the pair", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      wm().command({ name: "Swap", direction: "right" });

      expect(kidsOf(wm(), monitor)).toHaveLength(1);
      const wrap = kidsOf(wm(), monitor)[0];
      expect(wrap.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(kidsOf(wm(), wrap)).toEqual([nodeWindow, nodeWindow2]);
    });

    it("should call unfreezeRender before join", () => {
      wm().command({ name: "Swap", direction: "left" });

      expect(wm().unfreezeRender).toHaveBeenCalled();
    });

    it("should raise window after join", () => {
      const raiseSpy = vi.spyOn(metaWindow, "raise");

      wm().command({ name: "Swap", direction: "right" });

      expect(raiseSpy).toHaveBeenCalled();
    });

    it("should update tabbed and stacked focus", () => {
      wm().command({ name: "Swap", direction: "right" });

      expect(wm().updateTabbedFocus).toHaveBeenCalled();
      expect(wm().updateStackedFocus).toHaveBeenCalled();
    });

    it("should commit layout after join", () => {
      const commitSpy = vi.spyOn(wm(), "commitLayout");

      wm().command({ name: "Swap", direction: "right" });

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(commitSpy).toHaveBeenCalledWith("join", { force: true });
      expect(wm().renderTree).toHaveBeenCalledWith("join", true);
    });

    it("should not join if no focus window", () => {
      global.display.get_focus_window.mockReturnValue(null);
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const before = [...kidsOf(wm(), monitor)];

      wm().command({ name: "Swap", direction: "right" });

      expect(kidsOf(wm(), monitor)).toEqual(before);
    });
  });

  describe("Split Command", () => {
    function pairOnMonitor() {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const other = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "OtherApp" },
      });
      other.nodeWindow.mode = WINDOW_MODES.TILE;
      return { monitor, other };
    }

    it("aliases toggleSplit and wraps the pair as VSPLIT", () => {
      const { monitor } = pairOnMonitor();

      wm().command({ name: "Split", orientation: "vertical" });

      expect(kidsOf(wm(), monitor)).toHaveLength(1);
      expect(kidsOf(wm(), monitor)[0].layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("ignores orientation (same as toggleSplit)", () => {
      const { monitor } = pairOnMonitor();
      wm().command({ name: "Split", orientation: "horizontal" });
      expect(kidsOf(wm(), monitor)[0].layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("commits as toggleSplit", () => {
      pairOnMonitor();
      const commitSpy = vi.spyOn(wm(), "commitLayout");
      wm().command({ name: "Split" });
      expect(commitSpy).toHaveBeenCalledWith("toggleSplit", { force: true });
      expect(wm().renderTree).toHaveBeenCalledWith("toggleSplit", true);
    });

    it("should not split if no focus window", () => {
      const { monitor } = pairOnMonitor();
      const before = [...kidsOf(wm(), monitor)];
      global.display.get_focus_window.mockReturnValue(null);
      wm().command({ name: "Split", orientation: "horizontal" });
      expect(kidsOf(wm(), monitor)).toEqual(before);
    });
  });

  describe("LayoutToggle Command", () => {
    function pairOnMonitor() {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const other = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "OtherApp" },
      });
      other.nodeWindow.mode = WINDOW_MODES.TILE;
      return { monitor, other };
    }

    it("should toggle from HSPLIT to VSPLIT", () => {
      const { monitor } = pairOnMonitor();
      const action = { name: "LayoutToggle" };

      wm().command(action);

      expect(kidsOf(wm(), monitor)).toHaveLength(1);
      expect(kidsOf(wm(), monitor)[0].layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should toggle from VSPLIT to HSPLIT", () => {
      const { monitor } = pairOnMonitor();
      monitor.layout = LAYOUT_TYPES.VSPLIT;
      const action = { name: "LayoutToggle" };

      wm().command(action);

      expect(kidsOf(wm(), monitor)[0].layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should commit layout after toggle", () => {
      pairOnMonitor();
      const commitSpy = vi.spyOn(wm(), "commitLayout");
      const action = { name: "LayoutToggle" };

      wm().command(action);

      expect(commitSpy).toHaveBeenCalledWith("toggleSplit", { force: true });
      expect(wm().renderTree).toHaveBeenCalledWith("toggleSplit", true);
    });

    it("should not toggle if no focus window", () => {
      global.display.get_focus_window.mockReturnValue(null);
      const action = { name: "LayoutToggle" };
      const layoutBefore = parentOf(wm(), nodeWindow).layout;

      wm().command(action);

      expect(parentOf(wm(), nodeWindow).layout).toBe(layoutBefore);
    });
  });

  describe("FocusBorderToggle Command", () => {
    it("should toggle focus border on", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "focus-border-toggle") return false;
        return false;
      });

      const action = { name: "FocusBorderToggle" };

      wm().command(action);

      expect(ctx.settings.set_boolean).toHaveBeenCalledWith("focus-border-toggle", true);
    });

    it("should toggle focus border off", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "focus-border-toggle") return true;
        return false;
      });

      const action = { name: "FocusBorderToggle" };

      wm().command(action);

      expect(ctx.settings.set_boolean).toHaveBeenCalledWith("focus-border-toggle", false);
    });
  });

  describe("TilingModeToggle Command", () => {
    it("should toggle tiling mode off and float all windows", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "tiling-mode-enabled") return true;
        return false;
      });

      const action = { name: "TilingModeToggle" };
      const floatSpy = vi.spyOn(wm(), "floatAllWindows").mockImplementation(() => {});

      wm().command(action);

      expect(ctx.settings.set_boolean).toHaveBeenCalledWith("tiling-mode-enabled", false);
      expect(floatSpy).toHaveBeenCalled();
    });

    it("should toggle tiling mode on and unfloat all windows", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "tiling-mode-enabled") return false;
        return false;
      });

      const action = { name: "TilingModeToggle" };
      const unfloatSpy = vi.spyOn(wm(), "unfloatAllWindows").mockImplementation(() => {});

      wm().command(action);

      expect(ctx.settings.set_boolean).toHaveBeenCalledWith("tiling-mode-enabled", true);
      expect(unfloatSpy).toHaveBeenCalled();
    });

    it("should commit layout after toggle", () => {
      const commitSpy = vi.spyOn(wm(), "commitLayout");
      const action = { name: "TilingModeToggle" };
      vi.spyOn(wm(), "floatAllWindows").mockImplementation(() => {});

      wm().command(action);

      expect(commitSpy).toHaveBeenCalledWith(expect.stringMatching(/^tiling-mode-toggle /), {
        force: true,
      });
      expect(wm().renderTree).toHaveBeenCalled();
    });
  });

  describe("GapSize Command", () => {
    it("should increase gap size", () => {
      const action = { name: "GapSize", amount: 1 };

      wm().command(action);

      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 5);
    });

    it("should decrease gap size", () => {
      const action = { name: "GapSize", amount: -1 };

      wm().command(action);

      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 3);
    });

    it("should not go below 0", () => {
      ctx.settings.get_uint.mockReturnValue(0);
      const action = { name: "GapSize", amount: -1 };

      wm().command(action);

      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 0);
    });

    it("should not go above 32", () => {
      ctx.settings.get_uint.mockReturnValue(32);
      const action = { name: "GapSize", amount: 1 };

      wm().command(action);

      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 32);
    });

    it("should handle large increment", () => {
      ctx.settings.get_uint.mockReturnValue(0);
      const action = { name: "GapSize", amount: 50 };

      wm().command(action);

      // Should cap at 32
      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 32);
    });

    it("should handle large decrement", () => {
      ctx.settings.get_uint.mockReturnValue(4);
      const action = { name: "GapSize", amount: -10 };

      wm().command(action);

      // Should cap at 0
      expect(ctx.settings.set_uint).toHaveBeenCalledWith("window-gap-size-increment", 0);
    });
  });

  describe("WorkspaceActiveTileToggle Command", () => {
    it("should skip workspace when not already skipped", () => {
      ctx.settings.get_string.mockReturnValue("");
      const action = { name: "WorkspaceActiveTileToggle" };
      const floatSpy = vi.spyOn(wm(), "floatWorkspace").mockImplementation(() => {});

      wm().command(action);

      expect(ctx.settings.set_string).toHaveBeenCalledWith("workspace-skip-tile", "0");
      expect(floatSpy).toHaveBeenCalledWith(0);
    });

    it("should unskip workspace when already skipped", () => {
      ctx.settings.get_string.mockReturnValue("0");
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      const action = { name: "WorkspaceActiveTileToggle" };
      const unfloatSpy = vi.spyOn(wm(), "unfloatWorkspace").mockImplementation(() => {});

      wm().command(action);

      expect(ctx.settings.set_string).toHaveBeenCalledWith("workspace-skip-tile", "");
      expect(unfloatSpy).toHaveBeenCalledWith(0);
    });

    it("should handle multiple skipped workspaces", () => {
      ctx.settings.get_string.mockReturnValue("1,2");
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      const action = { name: "WorkspaceActiveTileToggle" };

      wm().command(action);

      expect(ctx.settings.set_string).toHaveBeenCalledWith("workspace-skip-tile", "1,2,0");
    });

    it("should remove the active workspace from the middle of the skip list", () => {
      ctx.settings.get_string.mockReturnValue("0,1,2");
      global.workspace_manager.get_active_workspace_index.mockReturnValue(1);
      const action = { name: "WorkspaceActiveTileToggle" };
      const unfloatSpy = vi.spyOn(wm(), "unfloatWorkspace").mockImplementation(() => {});

      wm().command(action);

      expect(ctx.settings.set_string).toHaveBeenCalledWith("workspace-skip-tile", "0,2");
      expect(unfloatSpy).toHaveBeenCalledWith(1);
    });
  });
});
