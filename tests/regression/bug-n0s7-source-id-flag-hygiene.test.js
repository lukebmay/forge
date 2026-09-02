import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";

/**
 * forge-n0s7: two stale-state leaks.
 *
 * (a) The pointer-focus poll ends when _focusWindowUnderPointer returns false
 * (no re-arm). SourceBag clears the slot on fire, so cancel/re-init never
 * Source.remove's a dead id (GLib-CRITICAL spam).
 *
 * (b) workspaceAdded/workspaceRemoved were only consumed inside
 * _onWorkareasChanged's tree-has-windows branch; a workspace change on an
 * empty tree left the flag set, making the NEXT unrelated workareas-changed
 * take the expensive trackCurrentWindows branch instead of monitor-recovery.
 */
describe("forge-n0s7: source-id and flag hygiene", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("pointer-focus loop drops its bag slot when it self-terminates", () => {
    const callbacks = [];
    vi.spyOn(GLib, "timeout_add").mockImplementation((priority, interval, cb) => {
      callbacks.push(cb);
      return 42;
    });
    const wm = ctx.windowManager;
    wm.shouldFocusOnHover = true;
    wm.pointerLoopInit();
    expect(wm._wmSources.has("pointerFocus")).toBe(true);
    expect(wm._wmSources.getId("pointerFocus")).toBe(42);

    // User turns the feature off; the next tick ends the loop (no re-arm).
    wm.shouldFocusOnHover = false;
    callbacks[callbacks.length - 1]();

    expect(wm._wmSources.has("pointerFocus")).toBe(false);
  });

  it("consumes workspaceAdded even when the tree has no windows", () => {
    const wm = ctx.windowManager;
    const trackSpy = vi.spyOn(wm, "trackCurrentWindows").mockImplementation(() => {});
    const softSpy = vi.spyOn(wm, "_queueMonitorRecoveryOnWorkareas").mockImplementation(() => {});

    // Workspace added while the tree is empty: nothing to re-track, but the
    // flag must still be consumed.
    wm.workspaceAdded = true;
    wm._onWorkareasChanged(ctx.display);
    expect(wm.workspaceAdded).toBe(false);

    // The next workareas-changed with windows present must take monitor-recovery,
    // not trackCurrentWindows.
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const win = createMockWindow({ wm_class: "App" });
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;

    wm._onWorkareasChanged(ctx.display);
    expect(trackSpy).not.toHaveBeenCalled();
    expect(softSpy).toHaveBeenCalled();
  });

  it("still re-tracks when a workspace changed and windows exist", () => {
    const wm = ctx.windowManager;
    const trackSpy = vi.spyOn(wm, "trackCurrentWindows").mockImplementation(() => {});

    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const win = createMockWindow({ wm_class: "App" });
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;

    wm.workspaceRemoved = true;
    wm._onWorkareasChanged(ctx.display);

    expect(trackSpy).toHaveBeenCalled();
    expect(wm.workspaceRemoved).toBe(false);
  });
});
