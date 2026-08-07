import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
} from "../../mocks/helpers/index.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";

/**
 * WR2: Guake float rehomes to focus/LFT monitor (not GDK pointer mon on Wayland).
 */
describe("WR2 Guake focus/LFT monitor rehome", () => {
  let ctx;

  function setup() {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: {
            0: { x: 0, y: 0, width: 1920, height: 1080 },
            1: { x: 1920, y: 0, width: 2560, height: 1440 },
          },
        },
      },
      settings: {
        "auto-split-enabled": true,
        "new-window-placement": "pointer",
        "move-pointer-focus-enabled": false,
      },
    });
    ctx.configMgr.windowProps.overrides = [{ wmClass: "Guake", mode: "float" }];
    ctx.display.get_current_monitor.mockReturnValue(0);
  }

  beforeEach(() => setup());
  afterEach(() => ctx.cleanup());

  const wm = () => ctx.windowManager;

  const tileOn = (monIndex, overrides = {}) => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIndex);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        monitor: monIndex,
        rect: { x: monIndex * 1920, y: 0, width: 800, height: 600 },
        ...overrides,
      },
    });
    return { nodeWindow, metaWindow, monitor };
  };

  it("trackWindow moves Guake from mon1 to LFT mon0 without tiling", () => {
    const lft = tileOn(0, { id: "lft-left", wm_class: "Ghostty" });
    wm().movePointerWith(lft.nodeWindow);

    const guake = createMockWindow({
      id: "guake",
      wm_class: "Guake",
      title: "Guake!",
      workspace: ctx.workspaces[0],
      monitor: 1,
      rect: { x: 1920, y: 0, width: 2560, height: 400 },
    });
    const moveSpy = vi.spyOn(guake, "move_to_monitor");

    wm().trackWindow(null, guake);

    const node = wm().findNodeWindow(guake);
    expect(node).toBeTruthy();
    expect(node.mode).toBe(WINDOW_MODES.FLOAT);
    expect(wm().isFloatingExempt(guake)).toBe(true);
    expect(moveSpy).toHaveBeenCalledWith(0);
    expect(guake._forgeDockStickyMon).toBe(0);
  });

  it("trackWindow homes Guake to mon1 when LFT is on mon1", () => {
    const lft = tileOn(1, { id: "lft-right", wm_class: "Chrome" });
    wm().movePointerWith(lft.nodeWindow);
    ctx.display.get_current_monitor.mockReturnValue(0);

    const guake = createMockWindow({
      id: "guake-r",
      wm_class: "Guake",
      title: "Guake!",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 0, y: 0, width: 1920, height: 400 },
    });
    const moveSpy = vi.spyOn(guake, "move_to_monitor");

    wm().trackWindow(null, guake);

    expect(moveSpy).toHaveBeenCalledWith(1);
    const node = wm().findNodeWindow(guake);
    expect(node.mode).toBe(WINDOW_MODES.FLOAT);
  });

  it("_rehomeFocusFloatMonitor uses LFT when Guake itself is focused", () => {
    const lft = tileOn(0, { id: "tile0" });
    wm().movePointerWith(lft.nodeWindow);

    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 1);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      mode: "FLOAT",
      windowOverrides: {
        id: "guake-focus",
        wm_class: "Guake",
        title: "Guake!",
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: { x: 1920, y: 0, width: 2560, height: 400 },
      },
    });
    expect(nodeWindow.mode).toBe(WINDOW_MODES.FLOAT);

    // Simulate Guake focused (F12) while LFT remains the left tile.
    ctx.display.get_focus_window = vi.fn(() => metaWindow);
    const moveSpy = vi.spyOn(metaWindow, "move_to_monitor");

    expect(wm()._rehomeFocusFloatMonitor(metaWindow)).toBe(true);
    expect(moveSpy).toHaveBeenCalledWith(0);
    expect(nodeWindow.mode).toBe(WINDOW_MODES.FLOAT);
  });

  it("does not rehome non-Guake floats", () => {
    tileOn(0, { id: "tile" });
    const calc = createMockWindow({
      id: "calc",
      wm_class: "org.gnome.Calculator",
      title: "Calculator",
      workspace: ctx.workspaces[0],
      monitor: 1,
    });
    ctx.configMgr.windowProps.overrides = [
      { wmClass: "Guake", mode: "float" },
      { wmClass: "org.gnome.Calculator", mode: "float" },
    ];
    const moveSpy = vi.spyOn(calc, "move_to_monitor");
    expect(wm()._rehomeFocusFloatMonitor(calc)).toBe(false);
    expect(moveSpy).not.toHaveBeenCalled();
  });
});
