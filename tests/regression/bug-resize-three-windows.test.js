import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * Bug: Three-window resize causes overflow
 *
 * Problem: When resizing windows with 3+ siblings (via mouse drag or keyboard
 * shortcuts Ctrl-Super-O/Y):
 * 1. Windows "fall behind" others (get obscured)
 * 2. Windows become "insanely wide"
 * 3. Snap-back behavior on mouse release
 *
 * Root Cause: Windows start with `percent = 0.0`. During resize, only 2 windows
 * get percentages set (focused + resize pair). The third window stays at
 * `percent = 0.0`. `_normalizeSiblingPercents()` skipped windows with
 * `percent <= 0`, but `computeSizes()` used default `1/N` for them, causing
 * total > 1.0 and overflow.
 *
 * Fix: `_normalizeSiblingPercents()` now initializes missing percentages based
 * on current rect proportions before normalizing.
 *
 * G8n: normalize reads liveChildrenForPresent — seed Forest after invent.
 */
describe("Bug: Three-window resize overflow", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function invent(monitor, specs) {
    const nodes = specs.map((spec, i) => {
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        mode: "TILE",
        windowOverrides: {
          wm_class: "TestApp",
          id: 1001 + i,
          title: `Window ${i + 1}`,
          allows_resize: true,
          ...spec.windowOverrides,
        },
      });
      if (spec.percent !== undefined) nodeWindow.percent = spec.percent;
      if (spec.rect !== undefined) nodeWindow.rect = spec.rect;
      return nodeWindow;
    });
    if (ctx.windowManager._liveForestSeeded) seedLiveForest(ctx.windowManager);
    return nodes;
  }

  describe("_normalizeSiblingPercents initialization", () => {
    it("should initialize zero-percent children based on current rect", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const [nodeWindow1, nodeWindow2, nodeWindow3] = invent(monitor, [
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
          },
          percent: 0,
          rect: { x: 0, y: 0, width: 300, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 300, y: 0, width: 300, height: 600 }),
          },
          percent: 0.4,
          rect: { x: 300, y: 0, width: 300, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 600, y: 0, width: 300, height: 600 }),
          },
          percent: 0.267,
          rect: { x: 600, y: 0, width: 300, height: 600 },
        },
      ]);

      ctx.windowManager._normalizeSiblingPercents(monitor);

      expect(nodeWindow1.percent).toBeGreaterThan(0);
      expect(nodeWindow2.percent).toBeGreaterThan(0);
      expect(nodeWindow3.percent).toBeGreaterThan(0);

      const total = nodeWindow1.percent + nodeWindow2.percent + nodeWindow3.percent;
      expect(total).toBeCloseTo(1.0, 3);
    });

    it("should preserve relative proportions when initializing missing percentages", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const [nodeWindow1, nodeWindow2, nodeWindow3] = invent(monitor, [
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
          },
          percent: 0,
          rect: { x: 0, y: 0, width: 300, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 300, y: 0, width: 450, height: 600 }),
          },
          percent: 0.5,
          rect: { x: 300, y: 0, width: 450, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 750, y: 0, width: 150, height: 600 }),
          },
          percent: 0.167,
          rect: { x: 750, y: 0, width: 150, height: 600 },
        },
      ]);

      ctx.windowManager._normalizeSiblingPercents(monitor);

      expect(nodeWindow1.percent).toBeGreaterThan(0);
      expect(nodeWindow2.percent).toBeGreaterThan(nodeWindow3.percent);

      const total = nodeWindow1.percent + nodeWindow2.percent + nodeWindow3.percent;
      expect(total).toBeCloseTo(1.0, 3);
    });

    it("should handle vertical layout (VSPLIT)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const [nodeWindow1, nodeWindow2] = invent(monitor, [
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 900, height: 200 }),
          },
          percent: 0,
          rect: { x: 0, y: 0, width: 900, height: 200 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 200, width: 900, height: 400 }),
          },
          percent: 0.5,
          rect: { x: 0, y: 200, width: 900, height: 400 },
        },
      ]);

      ctx.windowManager._normalizeSiblingPercents(monitor);

      expect(nodeWindow1.percent).toBeGreaterThan(0);
      expect(nodeWindow2.percent).toBeGreaterThan(0);

      const total = nodeWindow1.percent + nodeWindow2.percent;
      expect(total).toBeCloseTo(1.0, 3);
    });

    it("should use equal distribution when rect is not available", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const [nodeWindow1, nodeWindow2, nodeWindow3] = invent(monitor, [
        { percent: 0, rect: null },
        { percent: 0, rect: null },
        { percent: 0, rect: null },
      ]);

      ctx.windowManager._normalizeSiblingPercents(monitor);

      expect(nodeWindow1.percent).toBeCloseTo(1 / 3, 3);
      expect(nodeWindow2.percent).toBeCloseTo(1 / 3, 3);
      expect(nodeWindow3.percent).toBeCloseTo(1 / 3, 3);

      const total = nodeWindow1.percent + nodeWindow2.percent + nodeWindow3.percent;
      expect(total).toBeCloseTo(1.0, 3);
    });
  });

  describe("computeSizes with three windows", () => {
    it("should not exceed parent size when percentages are properly initialized", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const children = invent(
        monitor,
        Array.from({ length: 3 }, (_, i) => ({
          windowOverrides: {
            rect: new Rectangle({ x: i * 300, y: 0, width: 300, height: 600 }),
          },
          percent: 1.0 / 3,
          rect: { x: i * 300, y: 0, width: 300, height: 600 },
        }))
      );

      const sizes = ctx.tree.computeSizes(monitor, children);
      const total = sizes.reduce((a, b) => a + b, 0);

      expect(total).toBe(900);
    });

    it("should handle resize scenario where one window has percent=0 after normalization", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 900, height: 600 };

      const [nodeWindow1, nodeWindow2, nodeWindow3] = invent(monitor, [
        {
          windowOverrides: {
            rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
          },
          percent: 0,
          rect: { x: 0, y: 0, width: 300, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 300, y: 0, width: 300, height: 600 }),
          },
          percent: 0.5,
          rect: { x: 300, y: 0, width: 300, height: 600 },
        },
        {
          windowOverrides: {
            rect: new Rectangle({ x: 600, y: 0, width: 300, height: 600 }),
          },
          percent: 0.5,
          rect: { x: 600, y: 0, width: 300, height: 600 },
        },
      ]);

      ctx.windowManager._normalizeSiblingPercents(monitor);

      const children = [nodeWindow1, nodeWindow2, nodeWindow3];
      const sizes = ctx.tree.computeSizes(monitor, children);
      const total = sizes.reduce((a, b) => a + b, 0);

      expect(total).toBe(900);
    });
  });

  describe("_normalizeSiblingPercents guards", () => {
    it("should handle a null parent gracefully", () => {
      expect(() => ctx.windowManager._normalizeSiblingPercents(null)).not.toThrow();
    });

    it("should handle a parent with a single child", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const [node] = invent(monitor, [{ percent: 1.0 }]);
      expect(node).toBeTruthy();
      expect(() => ctx.windowManager._normalizeSiblingPercents(monitor)).not.toThrow();
    });
  });
});
