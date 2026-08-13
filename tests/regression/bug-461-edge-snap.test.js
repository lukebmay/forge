import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES, GRAB_TYPES } from "../../lib/extension/window.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../mocks/helpers/index.js";

/**
 * Bug #461 / D026 IC3: unsolicited TILE geom restores to slot.
 *
 * Native maximize / edge-snap / Meta-fullscreen / bare size-changed on a TILE
 * (no live grab, no forge echo) unmaximize + unfullscreen + reassertNodeToSlot.
 * Multi-tile full max no longer floats. Lone-tile maximize-on-single is left
 * alone. Live grab RESIZING still updates percents.
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

  it("keeps a fully-maximized tiled window TILE and restores the slot", () => {
    const { first, slot } = twoTiles();
    const maxed = first.metaWindow;
    maxed.maximize();
    maxed.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(maxed);

    const floatSpy = vi.spyOn(wm(), "toggleFloatingMode");
    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");

    wm().updateMetaPositionSize(maxed, "size-changed");

    expect(floatSpy).not.toHaveBeenCalled();
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    expect(maxed.is_maximized()).toBe(false);
    expect(reassertSpy).toHaveBeenCalledWith(first.nodeWindow, { force: true });
    const frame = maxed.get_frame_rect();
    expect(frame.width).toBe(slot.width);
    expect(frame.height).toBe(slot.height);
  });

  it("unmaximizes an edge-snapped (single-axis) tiled window that has tiled siblings", () => {
    const { first, slot } = twoTiles();
    const snapped = first.metaWindow;
    snapped.maximized_vertically = true;
    snapped.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(snapped);

    wm().updateMetaPositionSize(snapped, "size-changed");

    expect(snapped.maximized_vertically).toBe(false);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    const frame = snapped.get_frame_rect();
    expect(frame.width).toBe(slot.width);
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

  it("unfullscreens a tiled window and restores the slot (size-changed)", () => {
    const { first, slot } = twoTiles();
    const fs = first.metaWindow;
    fs.make_fullscreen();
    fs.maximize();
    fs.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(fs);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(fs, "size-changed");

    expect(fs.is_fullscreen()).toBe(false);
    expect(fs.is_maximized()).toBe(false);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    expect(reassertSpy).toHaveBeenCalledWith(first.nodeWindow, { force: true });
    expect(fs.get_frame_rect().width).toBe(slot.width);
  });

  it("notify::fullscreen uses the same restore path", () => {
    const { first, slot } = twoTiles();
    const fs = first.metaWindow;
    fs.make_fullscreen();
    fs.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(fs);

    wm().updateMetaPositionSize(fs, "notify::fullscreen");

    expect(fs.is_fullscreen()).toBe(false);
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
    expect(fs.get_frame_rect().width).toBe(slot.width);
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

    expect(onExt).toHaveBeenCalled();
    expect(reassertSpy).not.toHaveBeenCalled();
  });
});
