import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../mocks/helpers/index.js";

/**
 * W-render-storm (forge-wayland-live): full renderTree on noisy Meta signals
 * (title path spam, apply→size-changed feedback, already-home entered-monitor)
 * thrashed Shell / disabled extensions.
 *
 * Guards: identity retile gates, _suppressGeometrySignalRetile around apply/move,
 * TILE-in-slot skip, entered-monitor no-op when tree mon/ws already matches Meta.
 */
describe("W-render-storm: geometry + entered-monitor feedback", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "window-maximize-on-single": true,
      },
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {});
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  it("size-changed during apply suppress does not schedule renderTree", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm()._suppressGeometrySignalRetile = true;
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});

    // Drift far from slot — would normally retile without suppress.
    meta.move_resize_frame(true, 50, 50, 400, 300);
    wm().updateMetaPositionSize(meta, "size-changed");

    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("TILE in-slot size-changed does not full renderTree (chrome only)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const [first, second] = createHorizontalLayout(ctx.tree, monitor, 2);

    const slot = { x: 10, y: 20, width: 900, height: 700 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    // Frame within epsilon of slot
    first.metaWindow.move_resize_frame(
      true,
      slot.x + 2,
      slot.y - 1,
      slot.width - 3,
      slot.height + 1
    );
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
    // Sibling still present so this is not a lone-window edge case.
    expect(second.nodeWindow).toBeTruthy();
  });

  it("TILE external drift beyond epsilon still renderTree", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(renderSpy).toHaveBeenCalledWith("size-changed");
  });

  it("tree.apply sets geometry suppress so nested size-changed does not retile", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 1);
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { x: 0, y: 0, width: 500, height: 400 };
    first.metaWindow.move_resize_frame(true, 0, 0, 100, 100);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const origMove = wm().move.bind(wm());
    vi.spyOn(wm(), "move").mockImplementation((meta, rect, ...rest) => {
      // Simulate Mutter size-changed mid-apply (sync).
      expect(wm()._suppressGeometrySignalRetile).toBe(true);
      wm().updateMetaPositionSize(meta, "size-changed");
      return origMove(meta, rect, ...rest);
    });

    ctx.tree.apply(monitor);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm()._suppressGeometrySignalRetile).toBe(false);
  });

  it("entered-monitor no-op when tree mon/ws already matches Meta", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const metaWindow = createMockWindow({
      id: "home",
      workspace: ctx.workspaces[0],
      monitor: 0,
    });
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().updateMetaWorkspaceMonitor("window-entered-monitor", 0, metaWindow);

    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("entered-monitor rehomes and renderTree when Meta mon/ws differs", () => {
    // Dual-head fixture (default ctx is single mon).
    ctx.cleanup();
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true },
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: {
            0: { x: 0, y: 0, width: 1920, height: 1080 },
            1: { x: 1920, y: 0, width: 1920, height: 1080 },
          },
        },
      },
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {});

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);

    const metaWindow = createMockWindow({
      id: "move-mon",
      workspace: ctx.workspaces[0],
      monitor: 0,
    });
    const node = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaWindow);
    // Meta now reports mon1
    metaWindow._monitor = 1;

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().updateMetaWorkspaceMonitor("window-entered-monitor", 1, metaWindow);

    expect(mon1.contains(node)).toBe(true);
    expect(renderSpy).toHaveBeenCalledWith("window-entered-monitor");
  });

  it("move() raises geometry suppress for the duration of the commit", () => {
    const metaWindow = createMockWindow({
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    let sawSuppress = false;
    const origResize = metaWindow.move_resize_frame.bind(metaWindow);
    metaWindow.move_resize_frame = (interactive, x, y, w, h) => {
      sawSuppress = wm()._suppressGeometrySignalRetile === true;
      return origResize(interactive, x, y, w, h);
    };

    expect(wm()._suppressGeometrySignalRetile).toBe(false);
    wm().move(metaWindow, { x: 50, y: 50, width: 400, height: 300 });
    expect(sawSuppress).toBe(true);
    expect(wm()._suppressGeometrySignalRetile).toBe(false);
  });
});
