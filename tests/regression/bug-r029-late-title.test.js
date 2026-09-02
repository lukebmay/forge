import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * R029: Chrome maps with an empty title, so isFloatingExempt floats it.
 * There was no notify::title handler (unlike notify::wm-class / #482),
 * so the window stayed FLOAT after the title landed.
 */
describe("R029: late title re-tiles", () => {
  let ctx;
  let win;
  let node;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    win = createMockWindow({
      wm_class: "Google-chrome",
      id: 3001,
      title: "",
      allows_resize: true,
    });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("floats a window while its title is empty", () => {
    expect(ctx.windowManager.isFloatingExempt(win)).toBe(true);
    ctx.windowManager.processFloats();
    expect(node.isFloat()).toBe(true);
  });

  it("re-tiles the window once the title arrives", () => {
    ctx.windowManager.processFloats();
    expect(node.isFloat()).toBe(true);

    win.set_title("New Tab - Google Chrome");
    expect(ctx.windowManager.isFloatingExempt(win)).toBe(false);

    ctx.windowManager.processFloats();
    expect(node.isTile()).toBe(true);
  });

  it("wires notify::title for chrome label only (D100; no renderTree)", () => {
    const tracked = createMockWindow({
      wm_class: "Google-chrome",
      id: 3002,
      title: "",
      allows_resize: true,
    });
    ctx.windowManager.trackWindow(null, tracked);

    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree");
    const labelSpy = vi.spyOn(ctx.windowManager, "_paintTitleChromeLabel");
    tracked.set_title("Grok");

    expect(renderSpy).not.toHaveBeenCalled();
    expect(labelSpy).toHaveBeenCalled();
  });

  it("skips full renderTree on non-empty title churn (spinner)", () => {
    const tracked = createMockWindow({
      wm_class: "com.mitchellh.ghostty",
      id: 3003,
      title: "forge",
      allows_resize: true,
    });
    ctx.windowManager.trackWindow(null, tracked);

    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree");
    tracked.set_title("⠋ Responding…");
    tracked.set_title("⠙ Responding…");

    expect(renderSpy).not.toHaveBeenCalled();
  });
});
