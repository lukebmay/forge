import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES, GRAB_TYPES } from "../../lib/extension/window-modes.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../mocks/helpers/index.js";

/**
 * Bug #461 / D026 IC3, amended D100: idle TILE geom is observe-only.
 * Grab RESIZING still updates percents. Helpers `_shouldRestoreTileSlot`
 * remain for grab-time reject.
 */
describe("Bug #461 / D026: TILE slot authority", () => {
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

  function twoTiles() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first, second] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 960, height: 1080 };
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(true, slot.x, slot.y, slot.width, slot.height);
    second.nodeWindow.renderRect = { x: 960, y: 0, width: 960, height: 1080 };
    return { first, second, slot };
  }

  it("idle maximize does not restore the slot (D100 observe)", () => {
    const { first } = twoTiles();
    const maxed = first.metaWindow;
    maxed.maximize();
    maxed.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(maxed);

    const floatSpy = vi.spyOn(wm(), "toggleFloatingMode");
    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");

    wm().updateMetaPositionSize(maxed, "size-changed");

    expect(floatSpy).not.toHaveBeenCalled();
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    expect(maxed.is_maximized()).toBe(true);
    expect(reassertSpy).not.toHaveBeenCalled();
    const frame = maxed.get_frame_rect();
    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
  });

  it("idle edge-snap does not unmaximize (D100)", () => {
    const { first } = twoTiles();
    const snapped = first.metaWindow;
    snapped.maximized_vertically = true;
    snapped.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(snapped);

    wm().updateMetaPositionSize(snapped, "size-changed");

    expect(snapped.maximized_vertically).toBe(true);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
  });

  it("does NOT unmaximize the sole tiled window on a monitor (maximize-on-single)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [only] = createHorizontalLayout(ctx.tree, monitor, 1);

    const maxed = only.metaWindow;
    maxed.maximize();
    ctx.display.get_focus_window.mockReturnValue(maxed);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(maxed, "size-changed");

    expect(maxed.is_maximized()).toBe(true);
    expect(reassertSpy).not.toHaveBeenCalled();
  });

  it("restores sole tiled maximize when maximize-on-single is OFF", () => {
    ctx.settings.set_boolean("window-maximize-on-single", false);
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [only] = createHorizontalLayout(ctx.tree, monitor, 1);
    const slot = { x: 0, y: 0, width: 1920, height: 1080 };
    only.nodeWindow.renderRect = { ...slot };
    only.nodeWindow.rect = { ...slot };

    const maxed = only.metaWindow;
    maxed.maximize();
    maxed.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(maxed);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(maxed, "size-changed");

    expect(maxed.is_maximized()).toBe(true);
    expect(reassertSpy).not.toHaveBeenCalled();
  });

  it("idle fullscreen does not restore (D100)", () => {
    const { first } = twoTiles();
    const fs = first.metaWindow;
    fs.make_fullscreen();
    fs.maximize();
    fs.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(fs);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(fs, "size-changed");

    expect(fs.is_fullscreen()).toBe(true);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    expect(reassertSpy).not.toHaveBeenCalled();
  });

  it("notify::fullscreen is observe-only (D100)", () => {
    const { first } = twoTiles();
    const fs = first.metaWindow;
    fs.make_fullscreen();
    fs.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(fs);

    wm().updateMetaPositionSize(fs, "notify::fullscreen");

    expect(fs.is_fullscreen()).toBe(true);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
  });

  it("binds notify::fullscreen next to size/position", () => {
    const meta = twoTiles().first.metaWindow;
    const actor = meta.get_compositor_private();
    delete meta.windowSignals;
    const connectSpy = vi.spyOn(meta, "connect");
    wm()._bindWindowSignals(meta, actor);
    const names = connectSpy.mock.calls.map((c) => c[0]);
    expect(names).toContain("notify::fullscreen");
    expect(names).toContain("size-changed");
    expect(names).toContain("position-changed");
  });

  it("grab RESIZING without max/fs does not snap to slot", () => {
    const { first } = twoTiles();
    first.nodeWindow.grabMode = GRAB_TYPES.RESIZING;
    first.metaWindow.move_resize_frame(false, 0, 0, 1100, 1080);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const resizeSpy = vi.spyOn(wm(), "_handleResizing").mockImplementation(() => {});
    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(reassertSpy).not.toHaveBeenCalled();
    expect(resizeSpy).toHaveBeenCalledWith(first.nodeWindow);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
  });

  it("verify / onExternalGeometry still does not reassert (AC1)", () => {
    const { first } = twoTiles();
    first.nodeWindow.mode = WINDOW_MODES.FLOAT;
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");
    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(onExt).not.toHaveBeenCalled();
    expect(reassertSpy).not.toHaveBeenCalled();
  });
});
