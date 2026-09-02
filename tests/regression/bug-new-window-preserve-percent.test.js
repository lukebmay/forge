import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createTreeFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * Bug forge-7m3 + T4 sizing policy:
 *
 * trackWindow used to zero EVERY tiled sibling's percent when a window was added,
 * so computeSizes fell back to equal distribution and any user resizing was lost
 * (reproduced in real GNOME: [1227,669] -> [629,629,630]).
 *
 * T4: preserve only when siblings are userSized (explicit resize/golden/expand).
 * Non-zero automatic percents (normalize / min write-back) do not count as user
 * intent — insert equalizes until the user resizes. Setting
 * new-window-size-policy=equalize re-equalizes even after user resize.
 */
describe("Bug forge-7m3 / T4: new window size policy", () => {
  let ctx, tree, monitor;

  beforeEach(() => {
    ctx = createTreeFixture({
      globals: { workspaceManager: { workspaceCount: 1, activeWorkspaceIndex: 0 } },
    });
    tree = ctx.tree;
    monitor = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
  });

  afterEach(() => ctx.cleanup());

  function addWindow(id, percent, userSized = false) {
    const win = createMockWindow({ id });
    win._monitor = 0;
    const node = tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
    if (percent != null) node.percent = percent;
    node.userSized = userSized;
    return node;
  }

  it("scales user-resized siblings to make room for the newcomer (preserve)", () => {
    const a = addWindow("A", 0.7, true);
    const b = addWindow("B", 0.3, true);

    const c = addWindow("C", null);
    tree.insertChildPercent(monitor, c);

    expect(c.percent).toBeCloseTo(1 / 3, 5);
    expect(c.userSized).toBe(false);
    expect(a.percent + b.percent + c.percent).toBeCloseTo(1.0, 5);
    expect(a.percent / b.percent).toBeCloseTo(0.7 / 0.3, 5);
    expect(a.percent / b.percent).toBeGreaterThan(2.0);
    expect(a.userSized).toBe(true);
    expect(b.userSized).toBe(true);
  });

  it("keeps equal-split when no window was ever resized (zero percents)", () => {
    const a = addWindow("A", 0.0);
    const b = addWindow("B", 0.0);
    const c = addWindow("C", null);

    tree.insertChildPercent(monitor, c);

    expect(a.percent).toBe(0.0);
    expect(b.percent).toBe(0.0);
    expect(c.percent).toBe(0.0);
    expect(a.userSized).toBe(false);
    expect(b.userSized).toBe(false);
    expect(c.userSized).toBe(false);
  });

  it("equalizes when percents are non-zero but not user-sized (T4)", () => {
    // Min-size write-back / normalize can leave non-zero percents without intent.
    const a = addWindow("A", 0.7, false);
    const b = addWindow("B", 0.3, false);
    const c = addWindow("C", null);

    tree.insertChildPercent(monitor, c);

    expect(a.percent).toBe(0.0);
    expect(b.percent).toBe(0.0);
    expect(c.percent).toBe(0.0);
    expect(a.userSized).toBe(false);
    expect(b.userSized).toBe(false);
  });

  it("equalize policy re-equalizes even after user resize", () => {
    tree.settings = {
      get_string: (key) => (key === "new-window-size-policy" ? "equalize" : ""),
    };
    const a = addWindow("A", 0.7, true);
    const b = addWindow("B", 0.3, true);
    const c = addWindow("C", null);

    tree.insertChildPercent(monitor, c);

    expect(a.percent).toBe(0.0);
    expect(b.percent).toBe(0.0);
    expect(c.percent).toBe(0.0);
    expect(a.userSized).toBe(false);
    expect(b.userSized).toBe(false);
    expect(c.userSized).toBe(false);
  });
});
