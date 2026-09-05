import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/** After-present work (D115 observe/heal, persist). Not the #324 queue. */
function isAfterPresentSlot(name) {
  const n = String(name || "");
  return /^(geomEpsilon|minClampLearn|minAccept|heal-ladder|sessionLayoutSave|renderTree)/.test(
    n
  );
}

/**
 * #324 was a 220ms queueEvent callback that mutated a stale Move node.
 * D115: after present `move`, geomEpsilon/minClampLearn timeouts are allowed.
 * D095: Forest sibling order is the contract — not commitLayout({ force: true }).
 */
describe("forge-ne1 (#324): Move has no delayed stale-node callback", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  function tiledPair() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createMockWindow({ id: "A", wm_class: "AppA" });
    const b = createMockWindow({ id: "B", wm_class: "AppB" });
    const nodeA = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, a);
    const nodeB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, b);
    nodeA.mode = WINDOW_MODES.TILE;
    nodeB.mode = WINDOW_MODES.TILE;
    seedLiveForest(ctx.windowManager);
    return { monitor, winA: a, nodeA, nodeB };
  }

  it("swaps Forest siblings; GLib timeouts are observe/heal only", () => {
    const { monitor, winA, nodeA, nodeB } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);

    ctx.windowManager.command({ name: "Move", direction: "Right" });

    const monKids = kidsOf(ctx.windowManager, monitor);
    expect(monKids).toHaveLength(1);
    expect(kidsOf(ctx.windowManager, monKids[0])).toEqual([nodeB, nodeA]);

    const snap = ctx.windowManager._wmSources?.snapshot?.() || { slots: [] };
    expect(snap.slots.some((s) => String(s.name) === "queue")).toBe(false);
    expect(ctx.windowManager.eventQueue?.length ?? 0).toBe(0);
    for (const slot of snap.slots) {
      expect(isAfterPresentSlot(slot.name)).toBe(true);
    }
  });

  it("presents once and swaps sibling order", () => {
    const { monitor, winA, nodeA, nodeB } = tiledPair();
    ctx.display.get_focus_window.mockReturnValue(winA);
    const commitSpy = vi.spyOn(ctx.windowManager, "commitLayout");

    ctx.windowManager.command({ name: "Move", direction: "Right" });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy.mock.calls[0][0]).toBe("move-window");
    const monKids = kidsOf(ctx.windowManager, monitor);
    expect(monKids).toHaveLength(1);
    expect(kidsOf(ctx.windowManager, monKids[0])).toEqual([nodeB, nodeA]);
  });
});
