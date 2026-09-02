import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * forge-d5mm: the metaWindow "focus" handler queued a "focus-update" callback
 * that called this.updateStackedFocus() and this.updateTabbedFocus() with NO
 * argument. Both early-return on a falsy node, so they were permanent no-ops on
 * the pointer/alt-tab/hover focus path — a STACKED container was never re-stacked
 * and a TABBED window never raised on plain focus (only Super+hjkl, which passes
 * the node, worked). Fix: resolve and pass the focused node.
 */
describe("forge-d5mm: focus handler re-stacks the focused window", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  // Capture the queued "focus-update" callback fired by the metaWindow "focus"
  // signal (GLib timeouts don't run in tests, so we invoke it directly).
  function fireFocusAndGetUpdate(metaWindow) {
    const captured = [];
    vi.spyOn(wm(), "queueEvent").mockImplementation((eventObj) => captured.push(eventObj));
    ctx.display.get_focus_window.mockReturnValue(metaWindow);
    metaWindow.emit("focus", metaWindow);
    const update = captured.find((e) => e.name === "focus-update");
    expect(update).toBeDefined();
    return update.callback;
  }

  it("passes the focused node to updateStackedFocus/updateTabbedFocus (not undefined)", () => {
    const metaWindow = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);
    const node = wm().tree.findNode(metaWindow);
    expect(node).toBeTruthy();

    const stackedSpy = vi.spyOn(wm(), "updateStackedFocus");
    const tabbedSpy = vi.spyOn(wm(), "updateTabbedFocus");

    fireFocusAndGetUpdate(metaWindow)();

    expect(stackedSpy).toHaveBeenCalledWith(node);
    expect(tabbedSpy).toHaveBeenCalledWith(node);
  });

  it("raises focused STACKED window without reordering childNodes (stable labels)", () => {
    const winA = createMockWindow({ wm_class: "A", workspace: ctx.workspaces[0] });
    const winB = createMockWindow({ wm_class: "B", workspace: ctx.workspaces[0] });
    const winC = createMockWindow({ wm_class: "C", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, winA);
    wm().trackWindow(null, winB);
    wm().trackWindow(null, winC);

    const nodeA = wm().findNodeWindow(winA);
    const group = parentOf(wm(), nodeA);
    expect(group).toBeTruthy();
    group.layout = LAYOUT_TYPES.STACKED;
    seedLiveForest(wm());
    const orderBefore = kidsOf(wm(), group).slice();
    expect(orderBefore[orderBefore.length - 1]).not.toBe(nodeA);

    winA.raise = vi.fn();
    fireFocusAndGetUpdate(winA)();

    // Labels stay put; focus is lastTabFocus + raise only.
    expect(kidsOf(wm(), group)).toEqual(orderBefore);
    expect(group.lastTabFocus).toBe(winA);
    expect(winA.raise).toHaveBeenCalled();
  });

  it("records lastTabFocus on TABBED focus so install flush keeps open tab", () => {
    const winA = createMockWindow({ wm_class: "A", workspace: ctx.workspaces[0] });
    const winB = createMockWindow({ wm_class: "B", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, winA);
    wm().trackWindow(null, winB);

    const nodeA = wm().findNodeWindow(winA);
    const group = parentOf(wm(), nodeA);
    expect(group).toBeTruthy();
    group.layout = LAYOUT_TYPES.TABBED;
    group.lastTabFocus = winA;
    seedLiveForest(wm());
    const orderBefore = kidsOf(wm(), group).slice();

    winB.raise = vi.fn();
    fireFocusAndGetUpdate(winB)();

    expect(kidsOf(wm(), group)).toEqual(orderBefore);
    expect(group.lastTabFocus).toBe(winB);
    expect(winB.raise).toHaveBeenCalled();
  });
});
