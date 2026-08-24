import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { WindowManager, WINDOW_MODES } from "../../../lib/extension/window.js";
import { Tree, NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Workspace, WindowType, Rectangle } from "../../mocks/gnome/Meta.js";
import { Bin } from "../../mocks/gnome/St.js";
import * as Utils from "../../../lib/extension/utils.js";
import { mockSeat } from "../../mocks/gnome/Clutter.js";

/**
 * WindowManager pointer & focus management tests
 *
 * Tests for focus-related operations including:
 * - findNodeWindowAtPointer(): Find window under pointer
 * - canMovePointerInsideNodeWindow(): Check if pointer can be moved inside window
 * - warpPointerToNodeWindow(): Warp pointer to window
 * - movePointerWith(): Move pointer with window focus
 * - _focusWindowUnderPointer(): Focus window under pointer (hover mode)
 * - pointerIsOverParentDecoration(): Check if pointer is over parent decoration
 */
describe("WindowManager - Pointer & Focus Management", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();

    // Clear the mockSeat spy history before each test
    mockSeat.warp_pointer.mockClear();

    // Reset overview visibility
    ctx.overview.visible = false;

    // Mock global.get_pointer
    setPointer(960, 540);
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  afterEach(() => {
    // Clean up any pointer-focus poll that may have been armed
    if (wm()._wmSources?.has("pointerFocus")) {
      wm()._wmSources.cancel("pointerFocus");
      vi.clearAllTimers();
    }
    ctx.cleanup();
  });

  describe("findNodeWindowAtPointer()", () => {
    it("should find window under pointer", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow: nodeWindow1, metaWindow: metaWindow1 } = createWindowNode(
        ctx.tree,
        monitor,
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
            workspace: workspace0(),
          },
        }
      );
      const { nodeWindow: nodeWindow2, metaWindow: metaWindow2 } = createWindowNode(
        ctx.tree,
        monitor,
        {
          windowOverrides: {
            rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
            workspace: workspace0(),
          },
        }
      );

      // Mock sortedWindows
      Object.defineProperty(wm(), "sortedWindows", {
        get: () => [metaWindow2, metaWindow1],
        configurable: true,
      });

      // Pointer at (970, 540) - inside second window
      global.get_pointer.mockReturnValue([970, 540]);

      const result = wm().findNodeWindowAtPointer(nodeWindow1);

      expect(result).toBe(nodeWindow2);
    });

    it("should return null when no window under pointer", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Mock sortedWindows
      Object.defineProperty(wm(), "sortedWindows", {
        get: () => [metaWindow],
        configurable: true,
      });

      // Pointer outside all windows
      global.get_pointer.mockReturnValue([1500, 540]);

      const result = wm().findNodeWindowAtPointer(nodeWindow);

      expect(result).toBe(null);
    });

    it("skips the dragged window and returns the tile beneath", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow: nodeWindow1, metaWindow: metaWindow1 } = createWindowNode(
        ctx.tree,
        monitor,
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 1000, height: 1000 }),
            workspace: workspace0(),
          },
        }
      );
      const { nodeWindow: nodeWindow2, metaWindow: metaWindow2 } = createWindowNode(
        ctx.tree,
        monitor,
        {
          windowOverrides: {
            rect: new Rectangle({ x: 100, y: 100, width: 800, height: 800 }),
            workspace: workspace0(),
          },
        }
      );

      Object.defineProperty(wm(), "sortedWindows", {
        get: () => [metaWindow2, metaWindow1],
        configurable: true,
      });

      global.get_pointer.mockReturnValue([500, 500]);

      const result = wm().findNodeWindowAtPointer(nodeWindow2);

      expect(result).toBe(nodeWindow1);
    });

    it("during grab prefers the target tree slot over a covering live frame", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow: nodeA, metaWindow: metaA } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 540, width: 960, height: 540 }),
          workspace: workspace0(),
        },
      });
      const { nodeWindow: nodeB, metaWindow: metaB } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
          workspace: workspace0(),
        },
      });
      nodeA.renderRect = { x: 0, y: 0, width: 960, height: 540 };
      nodeB.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = nodeB;

      Object.defineProperty(wm(), "sortedWindows", {
        get: () => [metaB, metaA],
        configurable: true,
      });

      global.get_pointer.mockReturnValue([480, 270]);

      expect(wm().findNodeWindowAtPointer(nodeB)).toBe(nodeA);
    });
  });

  describe("canMovePointerInsideNodeWindow()", () => {
    it("should return true when pointer is outside window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
          minimized: false,
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      const result = wm().canMovePointerInsideNodeWindow(nodeWindow);

      expect(result).toBe(true);
    });

    it("should return false when pointer is already inside window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
          minimized: false,
        },
      });

      // Pointer inside window
      global.get_pointer.mockReturnValue([480, 540]);

      const result = wm().canMovePointerInsideNodeWindow(nodeWindow);

      expect(result).toBe(false);
    });

    it("should return false when window is minimized", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
          minimized: true,
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      const result = wm().canMovePointerInsideNodeWindow(nodeWindow);

      expect(result).toBe(false);
    });

    it("should return false when window is too small (width or height <= 8)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      // Test small width
      const { nodeWindow: nodeWindow1 } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 5, height: 1080 }),
          workspace: workspace0(),
          minimized: false,
        },
      });
      global.get_pointer.mockReturnValue([100, 540]);
      expect(wm().canMovePointerInsideNodeWindow(nodeWindow1)).toBe(false);

      // Test small height
      const { nodeWindow: nodeWindow2 } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 5 }),
          workspace: workspace0(),
          minimized: false,
        },
      });
      global.get_pointer.mockReturnValue([1500, 540]);
      expect(wm().canMovePointerInsideNodeWindow(nodeWindow2)).toBe(false);
    });

    // forge-7u3: globalSetup now mutates the shared Main.overview in place, so
    // toggling visibility here is observed by window.js's module-namespace read.
    it("should return false when overview is visible", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
          minimized: false,
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      // Set overview visible
      global.Main.overview.visible = true;

      const result = wm().canMovePointerInsideNodeWindow(nodeWindow);

      expect(result).toBe(false);
    });

    it("should return false when pointer is over parent stacked decoration", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, null);
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const { nodeWindow } = createWindowNode(ctx.tree, container, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 30, width: 960, height: 1050 }),
          workspace: workspace0(),
          minimized: false,
        },
      });

      // Pointer in parent decoration area (above window, but in parent rect)
      global.get_pointer.mockReturnValue([480, 15]);

      const result = wm().canMovePointerInsideNodeWindow(nodeWindow);

      expect(result).toBe(false);
    });
  });

  describe("pointerIsOverParentDecoration()", () => {
    it("should return true when pointer is over stacked parent decoration", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, null);
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const { nodeWindow } = createWindowNode(ctx.tree, container, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 30, width: 960, height: 1050 }),
          workspace: workspace0(),
        },
      });

      // Pointer in parent decoration area
      const pointerCoord = [480, 15];

      const result = wm().pointerIsOverParentDecoration(nodeWindow, pointerCoord);

      expect(result).toBe(true);
    });

    it("should return true when pointer is over tabbed parent decoration", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, null);
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const { nodeWindow } = createWindowNode(ctx.tree, container, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 30, width: 960, height: 1050 }),
          workspace: workspace0(),
        },
      });

      // Pointer in parent decoration area
      const pointerCoord = [480, 15];

      const result = wm().pointerIsOverParentDecoration(nodeWindow, pointerCoord);

      expect(result).toBe(true);
    });

    it("should return false for non-stacked/tabbed parent", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, null);
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const { nodeWindow } = createWindowNode(ctx.tree, container, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer anywhere
      const pointerCoord = [480, 15];

      const result = wm().pointerIsOverParentDecoration(nodeWindow, pointerCoord);

      expect(result).toBe(false);
    });

    it("should return false when pointer is outside parent rect", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, null);
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const { nodeWindow } = createWindowNode(ctx.tree, container, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 30, width: 960, height: 1050 }),
          workspace: workspace0(),
        },
      });

      // Pointer outside parent rect
      const pointerCoord = [1500, 540];

      const result = wm().pointerIsOverParentDecoration(nodeWindow, pointerCoord);

      expect(result).toBe(false);
    });
  });

  describe("warpPointerToNodeWindow()", () => {
    it("should warp pointer to window center when no stored position", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      wm().warpPointerToNodeWindow(nodeWindow);

      expect(mockSeat.warp_pointer).toHaveBeenCalledWith(
        480, // x: 0 + 960/2
        8 // y: 0 + 8 (titlebar)
      );
    });

    it("should warp pointer to stored position", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 100, y: 100, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Store pointer position
      nodeWindow.pointer = { x: 200, y: 300 };

      wm().warpPointerToNodeWindow(nodeWindow);

      expect(mockSeat.warp_pointer).toHaveBeenCalledWith(
        300, // x: 100 + 200
        400 // y: 100 + 300
      );
    });
  });

  describe("movePointerWith()", () => {
    it("should not warp when move-pointer-focus-enabled is false", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "move-pointer-focus-enabled") return false;
        return false;
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      wm().movePointerWith(nodeWindow);

      expect(mockSeat.warp_pointer).not.toHaveBeenCalled();
    });

    it("should warp when move-pointer-focus-enabled is true", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "move-pointer-focus-enabled") return true;
        return false;
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      wm().movePointerWith(nodeWindow);

      expect(mockSeat.warp_pointer).toHaveBeenCalled();
    });

    it("should warp when force is true regardless of setting", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "move-pointer-focus-enabled") return false;
        return false;
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      wm().movePointerWith(nodeWindow, { force: true });

      expect(mockSeat.warp_pointer).toHaveBeenCalled();
    });

    it("should not warp when pointer is already inside window", () => {
      ctx.settings.get_boolean.mockImplementation((key) => {
        if (key === "move-pointer-focus-enabled") return true;
        return false;
      });

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer inside window
      global.get_pointer.mockReturnValue([480, 540]);

      wm().movePointerWith(nodeWindow);

      expect(mockSeat.warp_pointer).not.toHaveBeenCalled();
    });

    it("should update lastFocusedWindow", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      wm().movePointerWith(nodeWindow);

      expect(wm().lastFocusedWindow).toBe(nodeWindow);
    });
  });

  describe("focusWindowUnderPointer()", () => {
    it("should focus and raise window under pointer when hover enabled", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
      });

      // Mock window actor
      const mockActor = {
        meta_window: metaWindow,
      };

      global.get_window_actors.mockReturnValue([mockActor]);
      global.get_pointer.mockReturnValue([480, 540]);

      // Enable shouldFocusOnHover
      wm().shouldFocusOnHover = true;

      const focusSpy = vi.spyOn(metaWindow, "focus");
      const raiseSpy = vi.spyOn(metaWindow, "raise");

      const result = wm()._focusWindowUnderPointer();

      expect(focusSpy).toHaveBeenCalledWith(12345);
      expect(raiseSpy).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("storePointerLastPosition()", () => {
    it("should store pointer position when inside window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 100, y: 100, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer inside window
      global.get_pointer.mockReturnValue([300, 400]);

      wm().storePointerLastPosition(nodeWindow);

      expect(nodeWindow.pointer).toEqual({ x: 200, y: 300 });
    });

    it("should not store when pointer is outside window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 100, y: 100, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      // Pointer outside window
      global.get_pointer.mockReturnValue([1500, 540]);

      wm().storePointerLastPosition(nodeWindow);

      expect(nodeWindow.pointer).toBeNull();
    });
  });

  describe("getPointerPositionInside()", () => {
    it("should return center position when no stored pointer", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 100, y: 100, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      const result = wm().getPointerPositionInside(nodeWindow);

      expect(result).toEqual({
        x: 580, // 100 + 960/2
        y: 108, // 100 + 8
      });
    });

    it("should return stored pointer position", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 100, y: 100, width: 960, height: 1080 }),
          workspace: workspace0(),
        },
      });

      nodeWindow.pointer = { x: 200, y: 300 };

      const result = wm().getPointerPositionInside(nodeWindow);

      expect(result).toEqual({
        x: 300, // 100 + 200
        y: 400, // 100 + 300
      });
    });
  });
});

/**
 * focus-no-reflow: Meta "focus" must update chrome/restack only — not force a
 * full tree apply (Wayland Chrome PWA ¼-height flicker).
 */
describe("WindowManager - Meta focus signal (no reflow)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function fireFocus(metaWindow) {
    const captured = [];
    vi.spyOn(wm(), "queueEvent").mockImplementation((eventObj) => captured.push(eventObj));
    ctx.display.get_focus_window.mockReturnValue(metaWindow);
    metaWindow.emit("focus", metaWindow);
    return captured;
  }

  it("does not call renderTree('focus') on ordinary tile focus", () => {
    const metaWindow = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    expect(wm().tree.findNode(metaWindow)).toBeTruthy();

    const renderSpy = vi.spyOn(wm(), "renderTree");
    fireFocus(metaWindow);

    expect(renderSpy).not.toHaveBeenCalledWith("focus", true);
    expect(renderSpy).not.toHaveBeenCalledWith("focus");
    expect(renderSpy.mock.calls.some((c) => c[0] === "focus")).toBe(false);
  });

  it("queues focus-update chrome work via afterFocus (restack, decoration, border)", () => {
    const metaWindow = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    const node = wm().tree.findNode(metaWindow);

    const afterSpy = vi.spyOn(wm(), "afterFocus");
    const stackedSpy = vi.spyOn(wm(), "updateStackedFocus");
    const tabbedSpy = vi.spyOn(wm(), "updateTabbedFocus");
    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    const borderSpy = vi.spyOn(wm(), "updateBorderLayout");
    const pointerSpy = vi.spyOn(wm(), "movePointerWith");

    const captured = fireFocus(metaWindow);
    const update = captured.find((e) => e.name === "focus-update");
    expect(update).toBeDefined();
    update.callback();

    expect(afterSpy).toHaveBeenCalledWith(node, { source: "meta-focus" });
    expect(stackedSpy).toHaveBeenCalledWith(node);
    expect(tabbedSpy).toHaveBeenCalledWith(node);
    expect(decoSpy).toHaveBeenCalledWith({ scope: "focus", focusNode: node });
    expect(borderSpy).toHaveBeenCalled();
    expect(pointerSpy).toHaveBeenCalledWith(node, { force: false });
    expect(wm().tree.attachNode).toBe(node);
  });

  it("short-circuits deferred-open focus without queue or render", () => {
    const metaWindow = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    vi.spyOn(wm(), "_isDeferredOpen").mockReturnValue(true);

    const queueSpy = vi.spyOn(wm(), "queueEvent");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    ctx.display.get_focus_window.mockReturnValue(metaWindow);
    metaWindow.emit("focus", metaWindow);

    expect(queueSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("still queues raise-float render for focused floats (not focus reason)", () => {
    const metaWindow = createMockWindow({ wm_class: "FloatApp", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    const node = wm().tree.findNode(metaWindow);
    node.mode = WINDOW_MODES.FLOAT;

    const renderSpy = vi.spyOn(wm(), "renderTree");
    const captured = fireFocus(metaWindow);

    expect(renderSpy.mock.calls.some((c) => c[0] === "focus")).toBe(false);
    const raise = captured.find((e) => e.name === "raise-float");
    expect(raise).toBeDefined();
    raise.callback();
    expect(renderSpy).toHaveBeenCalledWith("raise-float-queue");
  });

  it("tab focus reasserts only open leaf when off-slot; buried siblings skip move", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;

    const slot = { x: 100, y: 50, width: 800, height: 600 };
    const off = { x: 10, y: 10, width: 200, height: 150 };

    const wOff = createMockWindow({
      id: "tab-off",
      wm_class: "Off",
      rect: off,
      workspace: ctx.workspaces[0],
    });
    const wOn = createMockWindow({
      id: "tab-on",
      wm_class: "On",
      rect: slot,
      workspace: ctx.workspaces[0],
    });
    const nOff = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOff);
    const nOn = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOn);
    nOff.mode = WINDOW_MODES.TILE;
    nOn.mode = WINDOW_MODES.TILE;
    nOff.rect = { ...slot };
    nOff.renderRect = { ...slot };
    nOn.rect = { ...slot };
    nOn.renderRect = { ...slot };
    tab.lastTabFocus = wOff;

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const renderSpy = vi.spyOn(wm(), "renderTree");
    wOn.raise = vi.fn();

    // Open leaf (wOn) is on-slot → no move; buried wOff off-slot → still no move.
    wm().updateTabbedFocus(nOn);

    expect(moveSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalledWith("focus", true);
    expect(renderSpy).not.toHaveBeenCalledWith("focus");
    expect(wOn.raise).toHaveBeenCalled();
    expect(tab.lastTabFocus).toBe(wOn);
  });

  it("tab focus is lastTabFocus + raise only (no move_resize reassert)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;

    const slot = { x: 100, y: 50, width: 800, height: 600 };
    const off = { x: 10, y: 10, width: 200, height: 150 };

    const wBuried = createMockWindow({
      id: "tab-buried",
      rect: off,
      workspace: ctx.workspaces[0],
    });
    const wOpen = createMockWindow({
      id: "tab-open",
      rect: off,
      workspace: ctx.workspaces[0],
    });
    const nBuried = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wBuried);
    const nOpen = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOpen);
    nBuried.mode = WINDOW_MODES.TILE;
    nOpen.mode = WINDOW_MODES.TILE;
    nBuried.rect = { ...slot };
    nBuried.renderRect = { ...slot };
    nOpen.rect = { ...slot };
    nOpen.renderRect = { ...slot };

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const renderSpy = vi.spyOn(wm(), "renderTree");
    wOpen.raise = vi.fn();

    wm().updateTabbedFocus(nOpen);

    // Focus path must not move_resize (Chrome PWA flicker). Geometry → verify.
    expect(moveSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalledWith("focus");
    expect(wOpen.raise).toHaveBeenCalled();
    expect(tab.lastTabFocus).toBe(wOpen);
  });

  it("reassertTilesByIds moves only listed off-slot TILE windows", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    const off = { x: 10, y: 10, width: 100, height: 80 };

    const wA = createMockWindow({ id: 11, rect: off, workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: 22, rect: slot, workspace: ctx.workspaces[0] });
    const wC = createMockWindow({ id: 33, rect: off, workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wB);
    const nC = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wC);
    for (const n of [nA, nB, nC]) {
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...slot };
      n.renderRect = { ...slot };
    }

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const n = wm().reassertTilesByIds([11, 22], { force: false });
    // wA off-slot → move; wB on-slot → skip; wC not in ids → skip
    expect(n).toBe(1);
    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(moveSpy).toHaveBeenCalledWith(
      wA,
      expect.objectContaining(slot),
      null,
      expect.objectContaining({ force: false })
    );
  });

  it("activateFromTab reasserts the revealed child to slot (R025), no focus render", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;

    const slot = { x: 0, y: 0, width: 900, height: 700 };
    const off = { x: 50, y: 50, width: 100, height: 80 };

    const wA = createMockWindow({ id: "af-a", rect: off, workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: "af-b", rect: off, workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    nA.mode = WINDOW_MODES.TILE;
    nB.mode = WINDOW_MODES.TILE;
    nA.rect = { ...slot };
    nA.renderRect = { ...slot };
    nB.rect = { ...slot };
    nB.renderRect = { ...slot };

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const renderSpy = vi.spyOn(wm(), "renderTree");
    wB.raise = vi.fn();
    wB.focus = vi.fn();
    wB.activate = vi.fn();

    nB._activateFromTab(wB);

    expect(moveSpy).toHaveBeenCalledWith(
      wB,
      expect.objectContaining(slot),
      null,
      expect.objectContaining({ force: false })
    );
    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).not.toHaveBeenCalledWith("focus");
    expect(renderSpy.mock.calls.some((c) => c[0] === "focus")).toBe(false);
    expect(wB.raise).toHaveBeenCalled();
    expect(tab.lastTabFocus).toBe(wB);
  });

  it("activateFromTab during a live layout pin adopts it (R026)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wA = createMockWindow({ id: "pin-a", workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: "pin-b", workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    nA.mode = WINDOW_MODES.TILE;
    nB.mode = WINDOW_MODES.TILE;
    wA.raise = vi.fn();
    wB.raise = vi.fn();
    wB.focus = vi.fn();
    wB.activate = vi.fn();
    tab.lastTabFocus = wA;
    wm().pinLayoutOpenLeaf(tab, wA);

    nB._activateFromTab(wB);

    expect(tab.lastTabFocus).toBe(wB);
    expect(wm().getLayoutOpenLeafPin(tab)?.meta).toBe(wB);
    expect(wm().restoreLayoutOpenLeafIfStolen(nB)).toBe(false);
  });

  it("workspace focus steal re-reveals lastTabFocus without adopting", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wOpen = createMockWindow({ id: "ws-open", workspace: ctx.workspaces[0] });
    const wSteal = createMockWindow({ id: "ws-steal", workspace: ctx.workspaces[0] });
    const nOpen = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOpen);
    const nSteal = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wSteal);
    nOpen.mode = WINDOW_MODES.TILE;
    nSteal.mode = WINDOW_MODES.TILE;
    wOpen.raise = vi.fn();
    wSteal.raise = vi.fn();
    tab.lastTabFocus = wOpen;

    expect(wm().restoreOpenLeafIfWorkspaceFocusSteal(nSteal)).toBe(true);
    expect(tab.lastTabFocus).toBe(wOpen);
    expect(wOpen.raise).toHaveBeenCalled();
    expect(wm().restoreOpenLeafIfWorkspaceFocusSteal(nOpen)).toBe(false);
  });

  it("reassertOpenLeavesOnActiveWs raises each group open leaf", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wOpen = createMockWindow({ id: "settle-open", workspace: ctx.workspaces[0] });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOpen);
    wOpen.raise = vi.fn();
    tab.lastTabFocus = wOpen;

    wm().reassertOpenLeavesOnActiveWs("workspace-settle");
    expect(wOpen.raise).toHaveBeenCalled();
  });

  it("focus-update uses focus-scoped decoration (not full hide/show)", () => {
    const metaWindow = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    const node = wm().tree.findNode(metaWindow);

    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    const captured = fireFocus(metaWindow);
    const update = captured.find((e) => e.name === "focus-update");
    update.callback();

    expect(decoSpy).toHaveBeenCalledWith({
      scope: "focus",
      focusNode: node,
    });
    // Never a bare full layout from ordinary focus-update.
    expect(decoSpy.mock.calls.some((c) => c.length === 0 || c[0] == null)).toBe(false);
  });
});

/**
 * intra-tab thrash: cross-mon focus must not hide-flash other mon tab strips;
 * on-slot tab siblings skip move; forge-caused geom skips decoration storm.
 */
describe("WindowManager - intra-tab thrash (cross-mon focus)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("focusing mon0 does not hide mon1 TABBED decoration", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;

    // mon0: plain Ghostty-like tile
    const ghostty = createMockWindow({
      id: "ghostty",
      wm_class: "Ghostty",
      rect: { x: 0, y: 0, width: 960, height: 1080 },
      workspace: ctx.workspaces[0],
    });
    const nGhost = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, ghostty);
    nGhost.mode = WINDOW_MODES.TILE;

    // mon1: TABBED pair with live decoration strip
    const tab = wm().tree.createNode(mon1.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const deco = { show: vi.fn(), hide: vi.fn() };
    tab.decoration = deco;
    const slot = { x: 1920, y: 0, width: 1920, height: 1000 };
    const wA = createMockWindow({
      id: "tab-a",
      rect: slot,
      workspace: ctx.workspaces[0],
    });
    const wB = createMockWindow({
      id: "tab-b",
      rect: slot,
      workspace: ctx.workspaces[0],
    });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    nA.mode = WINDOW_MODES.TILE;
    nB.mode = WINDOW_MODES.TILE;
    nA.rect = { ...slot };
    nA.renderRect = { ...slot };
    nB.rect = { ...slot };
    nB.renderRect = { ...slot };
    tab.lastTabFocus = wA;

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const restackSpy = vi.spyOn(wm().decorationManager, "_restackDecorationAboveGroup");
    const showSpy = vi.spyOn(wm().decorationManager, "_showAndRestackTabDecoration");

    // Same body as Meta focus-update queue (focus-no-reflow chrome path).
    wm().unfreezeRender();
    wm().updateStackedFocus(nGhost);
    wm().updateTabbedFocus(nGhost);
    wm().updateDecorationLayout({ scope: "focus", focusNode: nGhost });
    wm().updateBorderLayout();

    // Other mon's strip must not hide/flash.
    expect(deco.hide).not.toHaveBeenCalled();
    // Focused window is not in a tab group — no restack of mon1 either.
    expect(restackSpy).not.toHaveBeenCalledWith(tab, expect.anything());
    expect(showSpy).not.toHaveBeenCalledWith(tab);
    // No reassert moves on mon1 tabs when focusing mon0 Ghostty.
    expect(moveSpy.mock.calls.some((c) => c[0] === wA || c[0] === wB)).toBe(false);
  });

  it("tab switch restacks only the focused CON; on-slot siblings skip move", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;

    // mon0 tab group (must stay untouched)
    const tab0 = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.CON, new Bin());
    tab0.layout = LAYOUT_TYPES.TABBED;
    const deco0 = { show: vi.fn(), hide: vi.fn() };
    tab0.decoration = deco0;
    const slot0 = { x: 0, y: 0, width: 960, height: 1000 };
    const w0a = createMockWindow({ id: "m0a", rect: slot0, workspace: ctx.workspaces[0] });
    const w0b = createMockWindow({ id: "m0b", rect: slot0, workspace: ctx.workspaces[0] });
    const n0a = wm().tree.createNode(tab0.nodeValue, NODE_TYPES.WINDOW, w0a);
    const n0b = wm().tree.createNode(tab0.nodeValue, NODE_TYPES.WINDOW, w0b);
    n0a.mode = WINDOW_MODES.TILE;
    n0b.mode = WINDOW_MODES.TILE;
    n0a.rect = { ...slot0 };
    n0a.renderRect = { ...slot0 };
    n0b.rect = { ...slot0 };
    n0b.renderRect = { ...slot0 };

    // mon1 tab group — switch within this one
    const tab1 = wm().tree.createNode(mon1.nodeValue, NODE_TYPES.CON, new Bin());
    tab1.layout = LAYOUT_TYPES.TABBED;
    const deco1 = { show: vi.fn(), hide: vi.fn() };
    tab1.decoration = deco1;
    const slot1 = { x: 1920, y: 0, width: 1920, height: 1000 };
    const w1a = createMockWindow({ id: "m1a", rect: slot1, workspace: ctx.workspaces[0] });
    const w1b = createMockWindow({ id: "m1b", rect: slot1, workspace: ctx.workspaces[0] });
    const n1a = wm().tree.createNode(tab1.nodeValue, NODE_TYPES.WINDOW, w1a);
    const n1b = wm().tree.createNode(tab1.nodeValue, NODE_TYPES.WINDOW, w1b);
    n1a.mode = WINDOW_MODES.TILE;
    n1b.mode = WINDOW_MODES.TILE;
    n1a.rect = { ...slot1 };
    n1a.renderRect = { ...slot1 };
    n1b.rect = { ...slot1 };
    n1b.renderRect = { ...slot1 };
    tab1.lastTabFocus = w1a;

    const moveSpy = vi.spyOn(wm(), "move").mockImplementation(() => {});
    const restackSpy = vi.spyOn(wm().decorationManager, "_restackDecorationAboveGroup");
    w1b.raise = vi.fn();

    wm().updateTabbedFocus(n1b);
    wm().updateDecorationLayout({ scope: "focus", focusNode: n1b });

    // mon0 strip never hide/show/restack
    expect(deco0.hide).not.toHaveBeenCalled();
    expect(deco0.show).not.toHaveBeenCalled();
    expect(restackSpy.mock.calls.some((c) => c[0] === tab0)).toBe(false);
    // mon1 strip restacked (and shown) for the focused group only
    expect(deco1.show).toHaveBeenCalled();
    expect(restackSpy.mock.calls.some((c) => c[0] === tab1)).toBe(true);
    // Both mon1 tabs on-slot → no move
    expect(moveSpy).not.toHaveBeenCalled();
    expect(w1b.raise).toHaveBeenCalled();
    expect(tab1.lastTabFocus).toBe(w1b);
  });

  it("forge-caused size-changed does not call updateDecorationLayout", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    const meta = createMockWindow({
      id: "geo",
      rect: slot,
      workspace: ctx.workspaces[0],
    });
    const node = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...slot };
    node.renderRect = { ...slot };
    ctx.display.get_focus_window.mockReturnValue(meta);

    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    const borderSpy = vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => {});
    wm()._suppressGeom.enter();

    wm().updateMetaPositionSize(meta, "size-changed");

    expect(borderSpy).toHaveBeenCalled();
    expect(decoSpy).not.toHaveBeenCalled();
  });

  it("in-slot external size-changed does not call updateDecorationLayout", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const slot = { x: 10, y: 20, width: 900, height: 700 };
    const meta = createMockWindow({
      id: "inslot",
      rect: { x: slot.x + 1, y: slot.y, width: slot.width, height: slot.height },
      workspace: ctx.workspaces[0],
    });
    const node = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...slot };
    node.renderRect = { ...slot };
    ctx.display.get_focus_window.mockReturnValue(meta);

    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    const borderSpy = vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => {});
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});

    wm().updateMetaPositionSize(meta, "size-changed");

    expect(borderSpy).toHaveBeenCalled();
    expect(decoSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
