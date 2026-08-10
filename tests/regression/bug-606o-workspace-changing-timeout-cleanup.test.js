import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { createWindowManagerFixture } from "../mocks/helpers/index.js";

/**
 * forge-606o: the 300ms workspace-transition timer (SourceBag slot
 * workspaceChanging) must be cancelled on _removeSignals so it cannot fire
 * into a dead WindowManager after disable().
 */
describe("forge-606o: workspace-changing timeout cleanup", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("cancels workspaceChanging on _removeSignals", () => {
    const removeSpy = vi.spyOn(GLib.Source, "remove");
    const wm = ctx.windowManager;

    // Arm via bag (schedule returns a fixed id so cancel hits Source.remove).
    wm._wmSchedule = (_ms, _cb) => 99;
    wm._wmCancel = (id) => GLib.Source.remove(id);
    wm._wmSources.set("workspaceChanging", 300, () => {});

    // _removeSignals only runs its cleanup block when signals are bound.
    wm._signalsBound = true;
    wm._removeSignals();

    expect(removeSpy).toHaveBeenCalledWith(99);
    expect(wm._wmSources.has("workspaceChanging")).toBe(false);
  });
});
