import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Clutter from "gi://Clutter";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * Tab strip close vs strip activate race.
 *
 * Window tabs put a close St.Button inside a reactive tab BoxLayout whose
 * button-press-event runs activate/restack (raise, focus, decoration restack).
 * On primary press, that parent path can fire before St.Button completes its
 * press→release→"clicked" gesture — especially when the tab is the last in a
 * STACKED/TABBED group — so close never runs.
 *
 * Fix: close handles primary/middle press with delete + EVENT_STOP; parent
 * skips activate when the event source is the close control.
 */
function makeButtonEvent(button, source = null) {
  return {
    get_button: () => button,
    get_source: () => source,
  };
}

function findCloseButton(tab) {
  return tab.get_children().find((c) => c.style_class === "window-tabbed-tab-close");
}

function emitPress(actor, event) {
  const handlers = actor._signals?.["button-press-event"] ?? [];
  let last = Clutter.EVENT_PROPAGATE;
  for (const { callback } of handlers) {
    last = callback(actor, event);
  }
  return last;
}

describe("Tab close button works for last window in group", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup?.();
    vi.restoreAllMocks();
  });

  it("primary press on close deletes and does not activate/restack", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    // Sole remaining window in the group (last-to-close case).
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, tabbed);
    expect(nodeWindow.tab).toBeTruthy();

    const closeButton = findCloseButton(nodeWindow.tab);
    expect(closeButton).toBeTruthy();

    const deleteSpy = vi.spyOn(metaWindow, "delete");
    const activateSpy = vi.spyOn(nodeWindow, "_activateFromTab");

    const ret = emitPress(closeButton, makeButtonEvent(Clutter.BUTTON_PRIMARY, closeButton));

    expect(ret).toBe(Clutter.EVENT_STOP);
    expect(deleteSpy).toHaveBeenCalled();
    // Parent strip must not restack on a close hit.
    expect(activateSpy).not.toHaveBeenCalled();
  });

  it("parent strip press skips activate when event source is the close control", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, tabbed);
    const closeButton = findCloseButton(nodeWindow.tab);
    const deleteSpy = vi.spyOn(metaWindow, "delete");
    const activateSpy = vi.spyOn(nodeWindow, "_activateFromTab");

    // Simulate bubble reaching the tab after a close hit (source = close).
    const ret = emitPress(nodeWindow.tab, makeButtonEvent(Clutter.BUTTON_PRIMARY, closeButton));

    expect(ret).toBe(Clutter.EVENT_PROPAGATE);
    expect(activateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("primary press on tab body still activates (not close)", () => {
    // G8n: in-module activateFromTab — assert STOP + active style + no delete.
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, tabbed);
    const deleteSpy = vi.spyOn(metaWindow, "delete");
    const raiseSpy = vi.spyOn(metaWindow, "raise").mockImplementation(() => {});

    const ret = emitPress(nodeWindow.tab, makeButtonEvent(Clutter.BUTTON_PRIMARY, nodeWindow.tab));

    expect(ret).toBe(Clutter.EVENT_STOP);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(raiseSpy).toHaveBeenCalled();
    expect(
      nodeWindow.tab.style_class?.includes?.("window-tabbed-tab-active") ||
        nodeWindow.tab.has_style_class_name?.("window-tabbed-tab-active")
    ).toBeTruthy();
  });

  it("middle-click press on close deletes", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const stacked = createContainerNode(monitor, LAYOUT_TYPES.STACKED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, stacked);
    const closeButton = findCloseButton(nodeWindow.tab);
    const deleteSpy = vi.spyOn(metaWindow, "delete");

    const ret = emitPress(closeButton, makeButtonEvent(Clutter.BUTTON_MIDDLE, closeButton));

    expect(ret).toBe(Clutter.EVENT_STOP);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("middle-click on tab body still deletes (strip middle-close)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, tabbed);
    const deleteSpy = vi.spyOn(metaWindow, "delete");

    const ret = emitPress(nodeWindow.tab, makeButtonEvent(Clutter.BUTTON_MIDDLE, nodeWindow.tab));

    expect(ret).toBe(Clutter.EVENT_STOP);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("treats close button icon child as close control (source walk)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow } = createWindowNode(ctx.tree, tabbed);
    const closeButton = findCloseButton(nodeWindow.tab);
    // St.Button child is the symbolic icon; pick target is often that child.
    const iconChild = closeButton.child || { get_parent: () => closeButton, _parent: closeButton };
    if (!iconChild.get_parent) iconChild.get_parent = () => closeButton;
    if (!iconChild._parent) iconChild._parent = closeButton;

    const activateSpy = vi.spyOn(nodeWindow, "_activateFromTab");
    const ret = emitPress(nodeWindow.tab, makeButtonEvent(Clutter.BUTTON_PRIMARY, iconChild));

    expect(ret).toBe(Clutter.EVENT_PROPAGATE);
    expect(activateSpy).not.toHaveBeenCalled();
  });
});
