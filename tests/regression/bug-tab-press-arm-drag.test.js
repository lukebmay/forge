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
 * Tab press must reveal immediately and arm drag (Chrome-like).
 * Icon/title used to be reactive St.Buttons with only "clicked" (release),
 * so activate waited for mouse-up and strip reorder/peel never armed.
 */
function makePressEvent(button, source, x = 50, y = 20) {
  return {
    get_button: () => button,
    get_source: () => source,
    get_coords: () => [x, y],
  };
}

function emitPress(actor, event) {
  const handlers = actor._signals?.["button-press-event"] ?? [];
  let last = Clutter.EVENT_PROPAGATE;
  for (const { callback } of handlers) {
    last = callback(actor, event);
  }
  return last;
}

function findTitleWidget(tab) {
  return tab.get_child_at_index?.(1) ?? tab.get_children?.()?.[1] ?? null;
}

function findIconWidget(tab) {
  return tab.get_child_at_index?.(0) ?? tab.get_children?.()?.[0] ?? null;
}

describe("Tab press activates and arms drag (not release-only)", () => {
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

  it("icon and title are non-reactive so the tab owns the press", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow } = createWindowNode(ctx.tree, tabbed);
    const tab = nodeWindow.tab;
    expect(tab).toBeTruthy();
    expect(tab.reactive).toBe(true);

    const icon = findIconWidget(tab);
    const title = findTitleWidget(tab);
    expect(icon).toBeTruthy();
    expect(title).toBeTruthy();
    expect(icon.reactive).toBe(false);
    expect(title.reactive).toBe(false);
  });

  it("primary press on tab reveals and arms drag state", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, tabbed);
    const tab = nodeWindow.tab;
    const activateSpy = vi.spyOn(nodeWindow, "_activateFromTab");
    const armSpy = vi.spyOn(nodeWindow, "_armTabDragForWindow");

    const ret = emitPress(tab, makePressEvent(Clutter.BUTTON_PRIMARY, tab, 40, 18));

    expect(ret).toBe(Clutter.EVENT_STOP);
    expect(activateSpy).toHaveBeenCalledWith(metaWindow);
    expect(armSpy).toHaveBeenCalledWith(metaWindow, expect.anything());

    const dd = ctx.windowManager?.dragDrop || nodeWindow._resolveExtWm?.()?.dragDrop;
    // fullExtWm should expose dragDrop; if not, arm still called.
    if (dd) {
      expect(dd._tabDrag).toBeTruthy();
      expect(dd._tabDrag.metaWindow).toBe(metaWindow);
      expect(dd._tabDrag.started).toBe(false);
    }
  });

  it("tab actor does not wire motion/release — DragDropManager owns the gesture", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow } = createWindowNode(ctx.tree, tabbed);
    const tab = nodeWindow.tab;
    expect(tab._signals?.["motion-event"]?.length ?? 0).toBe(0);
    expect(tab._signals?.["button-release-event"]?.length ?? 0).toBe(0);
    expect(typeof nodeWindow._noteTabDragFromEvent).toBe("undefined");
    expect(typeof nodeWindow._finishTabDragFromEvent).toBe("undefined");
  });
});
