import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * Bug #78: windows must not detach from the tree on transient monitor loss
 * (KVM switch, lock). The "workareas-changed" handler guards on monitor count
 * being zero; this test exercises that guard via the extracted named handler.
 *
 * H1 soft rehome: non-zero workareas changes debounce into soft rehome + render
 * (not an immediate renderTree("workareas-changed")).
 */
describe("Bug #78: workareas-changed monitor-count guard", () => {
  let ctx;
  let settleCallbacks;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    settleCallbacks = [];
    vi.spyOn(GLib, "timeout_add").mockImplementation((_priority, _interval, cb) => {
      settleCallbacks.push(cb);
      return 9001;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  // A tracked window so that getNodeByType("WINDOW").length > 0 — without it the
  // guard assertion would be vacuous (the handler skips rendering on an empty tree).
  function addTrackedWindow() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const metaWindow = createMockWindow({ workspace: ctx.workspaces[0] });
    return ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);
  }

  function fireSettle() {
    const cbs = settleCallbacks.splice(0);
    for (const cb of cbs) cb();
  }

  it("does nothing when no monitors are present, even with windows in the tree", () => {
    addTrackedWindow();
    ctx.display.get_n_monitors = vi.fn(() => 0);
    const render = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const track = vi.spyOn(wm(), "trackCurrentWindows").mockImplementation(() => {});
    const soft = vi.spyOn(wm(), "_queueSoftRehomeOnWorkareas");

    wm()._onWorkareasChanged(ctx.display);

    expect(render).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(soft).not.toHaveBeenCalled();
  });

  it("soft-rehomes (then re-renders) on a normal workareas change", () => {
    addTrackedWindow();
    ctx.display.get_n_monitors = vi.fn(() => 1);
    const render = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const track = vi.spyOn(wm(), "trackCurrentWindows").mockImplementation(() => {});
    wm().workspaceAdded = false;
    wm().workspaceRemoved = false;

    wm()._onWorkareasChanged(ctx.display);

    // Debounced: no immediate render
    expect(render).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(wm()._workareasThrashPending).toBe(true);

    fireSettle();

    expect(render).toHaveBeenCalledWith("workareas-soft-rehome");
    expect(track).not.toHaveBeenCalled();
    // Post-rehome cooldown holds thrash pending for late Meta peels.
    expect(wm()._workareasThrashPending).toBe(true);
    fireSettle(); // cooldown timer
    expect(wm()._workareasThrashPending).toBe(false);
  });

  it("re-tracks windows (not just re-render) after a workspace add/remove", () => {
    addTrackedWindow();
    ctx.display.get_n_monitors = vi.fn(() => 1);
    const render = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const track = vi.spyOn(wm(), "trackCurrentWindows").mockImplementation(() => {});
    wm().workspaceAdded = true;

    wm()._onWorkareasChanged(ctx.display);

    expect(track).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(wm().workspaceAdded).toBe(false);
    expect(wm().workspaceRemoved).toBe(false);
  });
});
