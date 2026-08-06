import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { afterFocus } from "../../../lib/extension/action-pipeline.js";
import { createMockWindow, createWindowManagerFixture } from "../../mocks/helpers/index.js";

/**
 * AP1: afterFocus is the only FocusChanged body (F → Dfocus → B → P → A).
 */
describe("action-pipeline afterFocus", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function trackOne() {
    const meta = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, meta);
    return wm().tree.findNode(meta);
  }

  it("runs F → Dfocus → B → P → A in order and never renderTree", () => {
    const node = trackOne();
    const order = [];
    vi.spyOn(wm(), "updateStackedFocus").mockImplementation(() => order.push("Fstack"));
    vi.spyOn(wm(), "updateTabbedFocus").mockImplementation(() => order.push("Ftab"));
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => order.push("Dfocus"));
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => order.push("B"));
    vi.spyOn(wm(), "movePointerWith").mockImplementation(() => order.push("P"));
    const renderSpy = vi.spyOn(wm(), "renderTree");

    afterFocus(wm(), node, { source: "test" });

    expect(order).toEqual(["Fstack", "Ftab", "Dfocus", "B", "P"]);
    expect(wm().updateDecorationLayout).toHaveBeenCalledWith({
      scope: "focus",
      focusNode: node,
    });
    expect(wm().movePointerWith).toHaveBeenCalledWith(node, { force: false });
    expect(wm().tree.attachNode).toBe(node);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(renderSpy.mock.calls.some((c) => c[0] === "focus")).toBe(false);
  });

  it("passes forcePointer to movePointerWith", () => {
    const node = trackOne();
    const ptr = vi.spyOn(wm(), "movePointerWith").mockImplementation(() => {});
    afterFocus(wm(), node, { forcePointer: true });
    expect(ptr).toHaveBeenCalledWith(node, { force: true });
  });

  it("no-ops on null node without calling stages", () => {
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    const tabbed = vi.spyOn(wm(), "updateTabbedFocus");
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    afterFocus(wm(), null);
    afterFocus(null, trackOne());
    expect(stacked).not.toHaveBeenCalled();
    expect(tabbed).not.toHaveBeenCalled();
    expect(deco).not.toHaveBeenCalled();
  });

  it("is idempotent on double call (no thrash / still focus-scoped)", () => {
    const node = trackOne();
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    afterFocus(wm(), node, { source: "once" });
    afterFocus(wm(), node, { source: "twice" });
    expect(deco).toHaveBeenCalledTimes(2);
    expect(deco.mock.calls.every((c) => c[0]?.scope === "focus")).toBe(true);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().tree.attachNode).toBe(node);
  });

  it("WindowManager.afterFocus delegates to pipeline", () => {
    const node = trackOne();
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    wm().afterFocus(node, { source: "wm-delegate" });
    expect(stacked).toHaveBeenCalledWith(node);
    expect(deco).toHaveBeenCalledWith({ scope: "focus", focusNode: node });
  });
});
