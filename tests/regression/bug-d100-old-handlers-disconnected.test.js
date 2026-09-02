import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
  parentOf,
} from "../mocks/helpers/index.js";
import { Logger } from "../../lib/shared/logger.js";
import { WorkspaceManager } from "../../lib/extension/workspace.js";
import { SourceBag } from "../../lib/extension/sources.js";

/**
 * D100: old-architecture Meta handlers are disconnected.
 * Idle signals must not rehome, restore-to-slot, or renderTree.
 */
describe("D100: old-architecture Meta handlers disconnected", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true },
      globals: { display: { monitorCount: 2 } },
    });
    vi.spyOn(Logger, "trace").mockImplementation(() => {});
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  it("entered-monitor does not rehome", () => {
    const meta = createMockWindow({
      title: "Rehome",
      workspace: ctx.workspaces[0],
      monitor: 0,
    });
    wm().trackWindow(null, meta);
    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor");
    const node = wm().findNodeWindow(meta);
    const parentBefore = parentOf(wm(), node);
    wm()._onWindowEnteredMonitor(ctx.display, 1, meta);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(parentOf(wm(), node)).toBe(parentBefore);
  });

  it("idle size-changed does not restore the TILE slot", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 800, height: 600 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(true, 200, 200, 400, 300);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(reassertSpy).not.toHaveBeenCalled();
    expect(onExt).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    const frame = first.metaWindow.get_frame_rect();
    expect(frame.width).toBe(400);
    expect(frame.height).toBe(300);
  });

  it("notify::title paints the tab label and does not renderTree", () => {
    const tracked = createMockWindow({
      wm_class: "Google-chrome",
      id: 9101,
      title: "",
      allows_resize: true,
    });
    wm().trackWindow(null, tracked);
    const node = wm().findNodeWindow(tracked);
    const renderSpy = vi.spyOn(wm(), "renderTree");
    const labelSpy = vi.spyOn(wm(), "_paintTitleChromeLabel");
    tracked.set_title("Grok");
    expect(renderSpy).not.toHaveBeenCalled();
    expect(labelSpy).toHaveBeenCalledWith(node);
  });

  it("notify::wm-class does not renderTree", () => {
    const tracked = createMockWindow({
      wm_class: null,
      id: 9102,
      title: "Opera",
      allows_resize: true,
    });
    wm().trackWindow(null, tracked);
    const renderSpy = vi.spyOn(wm(), "renderTree");
    tracked.set_wm_class("Opera");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("workspace window-added does not rehome", () => {
    const timeouts = [];
    const extWm = {
      updateMetaWorkspaceMonitor: vi.fn(),
      _wsWindowAddQueue: null,
      _wmSources: new SourceBag({
        schedule: (_ms, cb) => {
          timeouts.push(cb);
          return timeouts.length;
        },
        cancel: () => {},
      }),
    };
    const wsm = new WorkspaceManager({}, extWm);
    wsm.bindWorkspaceSignals(ctx.workspaces[0]);
    const win = createMockWindow({ wm_class: "AppA" });
    ctx.workspaces[0].emit("window-added", ctx.workspaces[0], win);
    expect(extWm.updateMetaWorkspaceMonitor).not.toHaveBeenCalled();
    expect(timeouts.length).toBe(0);
  });
});
