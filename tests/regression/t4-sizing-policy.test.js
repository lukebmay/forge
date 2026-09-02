import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Node, NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import * as TreeLayout from "../../lib/extension/tree-layout.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createTreeFixture,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * T4 sizing policy: equal until user resize; min-size write-back; userSized flag.
 */
describe("T4 sizing policy", () => {
  describe("resetSiblingPercent clears userSized", () => {
    let ctx, tree, monitor;

    beforeEach(() => {
      ctx = createTreeFixture({
        globals: { workspaceManager: { workspaceCount: 1, activeWorkspaceIndex: 0 } },
      });
      tree = ctx.tree;
      monitor = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      monitor.layout = LAYOUT_TYPES.HSPLIT;
    });

    afterEach(() => ctx.cleanup());

    it("zeros percents and userSized on all children", () => {
      const win = createMockWindow({ id: "A" });
      const node = tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
      node.mode = WINDOW_MODES.TILE;
      node.percent = 0.75;
      node.userSized = true;

      tree.resetSiblingPercent(monitor);

      expect(node.percent).toBe(0.0);
      expect(node.userSized).toBe(false);
    });
  });

  describe("computeSizes min-size write-back", () => {
    let ctx;

    beforeEach(() => {
      ctx = createTreeFixture();
    });

    afterEach(() => ctx.cleanup());

    function buildSplit(layout, rect, specs) {
      const con = new Node(NODE_TYPES.CON, new Bin());
      con.layout = layout;
      con.rect = rect;
      const children = specs.map((spec, i) => {
        const metaWindow = createMockWindow({
          id: `w${i}`,
          rect: new Rectangle(rect),
          size_hints:
            spec.min_width != null || spec.min_height != null
              ? { min_width: spec.min_width ?? 0, min_height: spec.min_height ?? 0 }
              : null,
        });
        const child = new Node(NODE_TYPES.WINDOW, metaWindow);
        child.percent = spec.percent ?? 0;
        child.userSized = false;
        con.appendChild(child);
        return child;
      });
      return { con, children };
    }

    it("writes effective percents after min redistrib without userSized", () => {
      const { con, children } = buildSplit(
        LAYOUT_TYPES.HSPLIT,
        { x: 0, y: 0, width: 1800, height: 1080 },
        [{ percent: 1 / 3, min_width: 900 }, { percent: 1 / 3 }, { percent: 1 / 3 }]
      );

      const sizes = ctx.tree.computeSizes(con, children);
      const sum = sizes.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1800);
      expect(sizes[0]).toBeGreaterThanOrEqual(900);

      expect(children[0].percent).toBeCloseTo(sizes[0] / 1800, 5);
      expect(children[1].percent).toBeCloseTo(sizes[1] / 1800, 5);
      expect(children[2].percent).toBeCloseTo(sizes[2] / 1800, 5);
      expect(children.every((c) => c.userSized === false)).toBe(true);
    });

    it("does not write back when no min hints apply", () => {
      const { con, children } = buildSplit(
        LAYOUT_TYPES.HSPLIT,
        { x: 0, y: 0, width: 1000, height: 1080 },
        [{ percent: 0.7 }, { percent: 0.3 }]
      );

      ctx.tree.computeSizes(con, children);

      expect(children[0].percent).toBe(0.7);
      expect(children[1].percent).toBe(0.3);
    });

    it("skips min-size write-back when skipWriteBack is set", () => {
      const { con, children } = buildSplit(
        LAYOUT_TYPES.HSPLIT,
        { x: 0, y: 0, width: 1800, height: 1080 },
        [{ percent: 1 / 3, min_width: 900 }, { percent: 1 / 3 }, { percent: 1 / 3 }]
      );

      TreeLayout.computeSizes(con, children, (items) => items, { skipWriteBack: true });

      expect(children[0].percent).toBeCloseTo(1 / 3, 5);
      expect(children[1].percent).toBeCloseTo(1 / 3, 5);
      expect(children[2].percent).toBeCloseTo(1 / 3, 5);
    });

    it("preserves intentional shares when any sibling is userSized", () => {
      const { con, children } = buildSplit(
        LAYOUT_TYPES.HSPLIT,
        { x: 0, y: 0, width: 1800, height: 1080 },
        [{ percent: 0.67, min_width: 900 }, { percent: 0.33 }]
      );
      children[0].userSized = true;
      children[1].userSized = true;

      const sizes = ctx.tree.computeSizes(con, children);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(1800);
      // Min paint may grow child0, but stored shares stay user intent.
      expect(children[0].percent).toBe(0.67);
      expect(children[1].percent).toBe(0.33);
      expect(children[0].userSized).toBe(true);
      expect(children[1].userSized).toBe(true);
    });
  });

  describe("user resize marks userSized", () => {
    let ctx;

    beforeEach(() => {
      ctx = createWindowManagerFixture({
        globals: { workspaceManager: { workspaceCount: 1, activeWorkspaceIndex: 0 } },
      });
    });

    afterEach(() => ctx.cleanup());

    it("expand marks focus and pair userSized", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const a = ctx.tree.createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: "A" })
      );
      const b = ctx.tree.createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: "B" })
      );
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;
      a.percent = 0.5;
      b.percent = 0.5;
      a.rect = { x: 0, y: 0, width: 500, height: 800 };
      b.rect = { x: 500, y: 0, width: 500, height: 800 };

      const changed = ctx.windowManager._expandNodeAgainstPair(a, 50);
      expect(changed).toBe(true);
      expect(a.userSized).toBe(true);
      expect(b.userSized).toBe(true);
    });

    it("golden ratio marks focus and pair userSized", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const a = ctx.tree.createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: "A" })
      );
      const b = ctx.tree.createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: "B" })
      );
      a.mode = WINDOW_MODES.TILE;
      b.mode = WINDOW_MODES.TILE;
      a.percent = 0.5;
      b.percent = 0.5;
      a.rect = { x: 0, y: 0, width: 500, height: 800 };
      b.rect = { x: 500, y: 0, width: 500, height: 800 };

      const changed = ctx.windowManager._goldenRatioAgainstPair(a);
      expect(changed).toBe(true);
      expect(a.userSized).toBe(true);
      expect(b.userSized).toBe(true);
    });
  });
});
