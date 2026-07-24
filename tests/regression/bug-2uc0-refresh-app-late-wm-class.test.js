import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Shell from "../mocks/gnome/Shell.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Bug forge-2uc0 / T1: a window whose Shell.WindowTracker app is null at map time
 * still gets a fallback tab; when wm_class lands, refreshApp upgrades to a real icon.
 *
 * Node.app is snapshotted once in _initMetaWindow() at construction. T1 builds a
 * fallback tab when app is null (`_tabFallback`). Apps that report wm_class late
 * (Anki, Opera, many Flatpaks) resolve later via notify::wm-class → refreshApp(),
 * which re-snapshots the app and rebuilds the tab so the real app icon appears.
 */
describe("Bug forge-2uc0: Node.refreshApp rebuilds app + tab when wm_class lands", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("creates a fallback tab at map, then upgrades after the app resolves", () => {
    // App is null at map time (late wm_class apps).
    const spy = vi.spyOn(Shell.WindowTracker.prototype, "get_window_app").mockReturnValue(null);

    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow } = createWindowNode(ctx.tree, monitor);

    // Null app → fallback tab still present (T1); node remains a valid tiled window.
    expect(nodeWindow.app).toBeNull();
    expect(nodeWindow.tab).toBeTruthy();
    expect(nodeWindow._tabFallback).toBe(true);

    // wm_class lands: the tracker now resolves an app.
    const app = { get_name: () => "Late App", create_icon_texture: () => ({}) };
    spy.mockReturnValue(app);

    nodeWindow.refreshApp();

    expect(nodeWindow.app).toBe(app);
    expect(nodeWindow.tab).toBeTruthy();
    expect(nodeWindow._tabFallback).toBe(false);
  });
});
