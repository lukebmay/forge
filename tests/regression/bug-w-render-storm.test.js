import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../mocks/helpers/index.js";
import { LayoutController } from "../../lib/extension/layout-controller.js";
import { isForgeCausedGeometrySignal } from "../../lib/extension/layout-sensors.js";

/**
 * W-render-storm / CL2: full layout on noisy Meta geometry signals
 * (apply→size-changed feedback, TILE already in slot) thrashed Shell.
 *
 * Guards: _suppressGeometrySignalRetile around apply/move, TILE-in-slot
 * chrome-only, external drift → markUnsettled + requestLayout/verify.
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

  /** Rebuild controller with fake clock so requestLayout does not need GLib fire. */
  function installFakeTimers() {
    let nextId = 1;
    const timers = new Map();
    let now = 0;
    const schedule = (delayMs, cb) => {
      const id = nextId++;
      timers.set(id, { due: now + delayMs, cb });
      return id;
    };
    const cancel = (id) => {
      timers.delete(id);
    };
    wm().layoutController.destroy();
    wm().layoutController = new LayoutController(wm(), { schedule, cancel });
    return {
      advance: (ms) => {
        now += ms;
        let progressed = true;
        while (progressed) {
          progressed = false;
          const due = [...timers.entries()]
            .filter(([, t]) => t.due <= now)
            .sort((a, b) => a[1].due - b[1].due);
          for (const [id, t] of due) {
            if (!timers.has(id)) continue;
            timers.delete(id);
            t.cb();
            progressed = true;
          }
        }
      },
    };
  }

  it("size-changed during apply suppress does not schedule layout/retile", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm()._suppressGeometrySignalRetile = true;
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

  it("TILE external drift → markUnsettled + requestLayout (not naked storm)", () => {
    installFakeTimers();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(markSpy).toHaveBeenCalled();
    expect(wm().layoutController.settled).toBe(false);
    expect(wm().layoutController.agreementCount).toBe(0);
    expect(wm().layoutController.layoutPending).toBe(true);
    expect(wm().layoutController.verifyPending).toBe(true);
    // Debounced — no immediate naked renderTree.
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("after SETTLED, external size-changed drops settled and schedules verify/layout", () => {
    installFakeTimers();
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
    lc.agreementCount = 2;

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(lc.settled).toBe(false);
    expect(lc.agreementCount).toBe(0);
    expect(lc.layoutPending).toBe(true);
    expect(lc.verifyPending).toBe(true);
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
      expect(wm()._suppressGeometrySignalRetile).toBe(true);
      expect(isForgeCausedGeometrySignal(wm())).toBe(true);
      wm().updateMetaPositionSize(meta, "size-changed");
      return origMove(meta, rect, ...rest);
    });

    ctx.tree.apply(monitor);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(wm()._suppressGeometrySignalRetile).toBe(false);
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
