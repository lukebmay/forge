import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Bug forge-v4u0 / T1: _createWindowTab() must not dereference a null app, and
 * must still create a fallback tab (generic icon + title/wm_class label).
 *
 * A WINDOW node's `app` is set from Shell.WindowTracker.get_window_app(), which can
 * return null. Older code either threw on app.create_icon_texture() or skipped the
 * tab entirely (empty decoration gap when showtab reserved height). T1 always
 * attaches a fallback tab when app is null.
 *
 * The default Shell mock's WindowTracker.get_window_app() always returns an App, so
 * no existing test exercises the null path — we force `app = null` directly.
 */
describe("Bug forge-v4u0 / T1: _createWindowTab tolerates a null app", () => {
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

  it("does not throw and creates a fallback tab when the window has no app", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow } = createWindowNode(ctx.tree, monitor);

    // Simulate WindowTracker returning no app, then re-run tab creation. Clear the
    // tab built during construction so the icon-building path is actually reached.
    nodeWindow.tab = null;
    nodeWindow.app = null;

    expect(() => nodeWindow._createWindowTab()).not.toThrow();
    expect(nodeWindow.tab).toBeTruthy();
    expect(nodeWindow._tabFallback).toBe(true);

    // A window with a fallback tab must still render (and stay a valid tiled window).
    expect(() => nodeWindow.render()).not.toThrow();
    expect(nodeWindow.isWindow()).toBe(true);
  });
});
