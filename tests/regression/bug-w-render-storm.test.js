import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../mocks/helpers/index.js";
import { isForgeCausedGeometrySignal } from "../../lib/extension/layout-sensors.js";

/**
 * W-render-storm / CL2 / D026: noisy Meta geometry must not storm layout.
 *
 * Guards: _suppressGeom around apply/move, TILE-in-slot chrome-only,
 * unsolicited TILE drift restores the slot (not verify-driven).
 */
describe("W-render-storm / CL2: geometry feedback attribution", () => {
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

  it("size-changed during apply suppress does not schedule layout/retile", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm()._suppressGeom.enter();
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const layoutSpy = vi.spyOn(wm().layoutController, "requestLayout");
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");

    // Drift far from slot — would normally retile without suppress.
    meta.move_resize_frame(true, 50, 50, 400, 300);
    wm().updateMetaPositionSize(meta, "size-changed");

    expect(renderSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
  });

  it("TILE in-slot size-changed does not full renderTree (chrome only)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const [first, second] = createHorizontalLayout(ctx.tree, monitor, 2);

    const slot = { x: 10, y: 20, width: 900, height: 700 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(
      true,
      slot.x + 2,
      slot.y - 1,
      slot.width - 3,
      slot.height + 1
    );
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const layoutSpy = vi.spyOn(wm().layoutController, "requestLayout");
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(renderSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
    expect(second.nodeWindow).toBeTruthy();
  });

  it("TILE external drift is observe-only (D100)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const layoutSpy = vi.spyOn(wm().layoutController, "requestLayout");
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");
    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");
    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(reassertSpy).not.toHaveBeenCalled();
    expect(onExt).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    const frame = first.metaWindow.get_frame_rect();
    expect(frame.width).toBe(400);
    expect(frame.height).toBe(300);
  });

  it("after SETTLED, TILE size-changed does not restore (D100)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const lc = wm().layoutController;
    lc.settled = true;
    lc.agreementCount = 1;
    const layoutSpy = vi.spyOn(lc, "requestLayout");
    const onExt = vi.spyOn(lc, "onExternalGeometry");

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(onExt).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(lc.settled).toBe(true);
    expect(first.metaWindow.get_frame_rect().width).toBe(400);
  });

  it("tree.apply sets geometry suppress so nested size-changed does not retile", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 1);
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { x: 0, y: 0, width: 500, height: 400 };
    first.metaWindow.move_resize_frame(true, 0, 0, 100, 100);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");
    const origMove = wm().move.bind(wm());
    vi.spyOn(wm(), "move").mockImplementation((meta, rect, ...rest) => {
      expect(wm()._suppressGeom.active).toBe(true);
      expect(isForgeCausedGeometrySignal(wm())).toBe(true);
      wm().updateMetaPositionSize(meta, "size-changed");
      return origMove(meta, rect, ...rest);
    });

    ctx.tree.apply(monitor);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(wm()._suppressGeom.active).toBe(false);
  });

  it("move() raises geometry suppress for the duration of the commit", () => {
    const metaWindow = createMockWindow({
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    let sawSuppress = false;
    const origResize = metaWindow.move_resize_frame.bind(metaWindow);
    metaWindow.move_resize_frame = (interactive, x, y, w, h) => {
      sawSuppress = wm()._suppressGeom.active === true;
      return origResize(interactive, x, y, w, h);
    };

    expect(wm()._suppressGeom.active).toBe(false);
    wm().move(metaWindow, { x: 50, y: 50, width: 400, height: 300 });
    expect(sawSuppress).toBe(true);
    expect(wm()._suppressGeom.active).toBe(false);
  });

  it("AC2: after move, size-changed within echo residual does not markUnsettled", () => {
    let now = 10_000;
    wm().layoutEpoch.setNow(() => now);
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    const slot = { x: 10, y: 20, width: 500, height: 400 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm().move(meta, slot);
    expect(wm().layoutEpoch.isEchoActive(meta)).toBe(true);
    expect(wm()._suppressGeom.active).toBe(false);

    // Client snap far from slot while residual still open — still Forge echo.
    meta.move_resize_frame(true, 50, 50, 300, 200);
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");
    const layoutSpy = vi.spyOn(wm().layoutController, "requestLayout");
    wm().updateMetaPositionSize(meta, "size-changed");

    expect(markSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
  });

  it("AC2: after echo residual expires, TILE geom restores the slot (no requestLayout)", () => {
    let now = 20_000;
    wm().layoutEpoch.setNow(() => now);
    const residual = wm().layoutEpoch.residualMs;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm().move(meta, slot);
    now += residual;
    expect(wm().layoutEpoch.isEchoActive(meta)).toBe(false);

    meta.move_resize_frame(true, 200, 200, 400, 300);
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");
    const layoutSpy = vi.spyOn(wm().layoutController, "requestLayout");
    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");
    wm().updateMetaPositionSize(meta, "size-changed");

    expect(onExt).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(meta.get_frame_rect().width).toBe(400);
  });

  it("D100: idle maximize does not schedule post-echo slot reassert", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    const slot = { x: 0, y: 0, width: 900, height: 700 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    ctx.display.get_focus_window.mockReturnValue(meta);

    const setSpy = vi.spyOn(wm()._wmSources, "set");
    meta.maximize();
    meta.move_resize_frame(true, 0, 0, 1920, 1080);
    wm().updateMetaPositionSize(meta, "size-changed");
    expect(meta.is_maximized()).toBe(true);

    const post = setSpy.mock.calls.find((c) => String(c[0]).startsWith("postEchoSlot:"));
    expect(post).toBeFalsy();
  });

  it("AC2: LayoutBatch begin advances wave id", () => {
    expect(wm().layoutEpoch.waveId).toBe(0);
    const begin = wm().beginOpenLayoutBatch("demo");
    expect(begin.waveId).toBe(1);
    expect(wm().layoutEpoch.waveId).toBe(1);
    wm().beginOpenLayoutBatch();
    expect(wm().layoutEpoch.waveId).toBe(2);
    wm().endOpenLayoutBatch("open-batch");
    wm().endOpenLayoutBatch("open-batch");
  });
});
