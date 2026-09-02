import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import St, { __setScaleFactor, __resetScaleFactor } from "gi://St";
import Clutter from "gi://Clutter";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { Node, NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import * as PresentChrome from "../../../lib/extension/present-chrome.js";
import {
  applyMargins,
  minTabWidthFromChars,
  planTabbedWrap,
  planTabRows,
  processGap as pureProcessGap,
  splitChildRect,
  tabbedBarHeight,
  tabbedChildRect,
  stackedChildRect,
} from "../../../lib/extension/tree-layout.js";
import {
  createTreeFixture,
  createWindowManagerFixture,
  createContainerNode,
  createHorizontalLayout,
  createWindowNode,
  getMonitors,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";

/**
 * Tree layout algorithm tests — apply-contract O8 / plan §5.0
 *
 * Guards pure slot math so wrong geometry is a correctness bug, not thrash:
 * mon workareas → root slots, H/V percent distribution, nested splits,
 * gaps / outer margins, tab chrome / stack insets on leaf rects.
 * Slot walk SoT = PresentChrome.processNode (Tree.processNode is a thin
 * delegate). Pure helpers stay on tree-layout.js (no live HUP).
 *
 * Core algorithms: processSplit, processStacked, processTabbed, computeSizes,
 * processGap, applyMargins.
 */
describe("planTabRows / tabbedBarHeight (T9 pure)", () => {
  it("max=0 (or unset) yields a single unlimited row", () => {
    expect(planTabRows(5, 0)).toEqual({ rows: [[0, 1, 2, 3, 4]], rowCount: 1 });
    expect(planTabRows(5, -1)).toEqual({ rows: [[0, 1, 2, 3, 4]], rowCount: 1 });
    expect(tabbedBarHeight(35, 5, 0)).toBe(35);
  });

  it("max=N wraps after N tabs", () => {
    expect(planTabRows(5, 3)).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4],
      ],
      rowCount: 2,
    });
    expect(tabbedBarHeight(35, 5, 3)).toBe(70);
  });

  it("max=1 yields one row per tab (stack-like height)", () => {
    expect(planTabRows(4, 1)).toEqual({
      rows: [[0], [1], [2], [3]],
      rowCount: 4,
    });
    expect(tabbedBarHeight(35, 4, 1)).toBe(140);
  });

  it("empty count is zero rows / zero height", () => {
    expect(planTabRows(0, 3)).toEqual({ rows: [], rowCount: 0 });
    expect(tabbedBarHeight(35, 0, 3)).toBe(0);
  });

  it("tabbedChildRect insets content by total multi-row bar height", () => {
    const rect = { x: 0, y: 10, width: 1000, height: 800 };
    const laid = tabbedChildRect(rect, 70, "top", true);
    expect(laid.y).toBe(80);
    expect(laid.height).toBe(730);
  });

  it("tabbedChildRect bottom keeps content at rect top", () => {
    const rect = { x: 10, y: 20, width: 800, height: 600 };
    const laid = tabbedChildRect(rect, 40, "bottom", true);
    expect(laid).toEqual({ x: 10, y: 20, width: 800, height: 560 });
  });

  it("stackedChildRect insets by N× bar height (top)", () => {
    const rect = { x: 0, y: 0, width: 500, height: 400 };
    const laid = stackedChildRect(rect, 30, 3, "top");
    expect(laid.totalBars).toBe(90);
    expect(laid.rect).toEqual({ x: 0, y: 90, width: 500, height: 310 });
  });
});

/** Readable-fill wrap planner (PR2 pure; processTabbed uses this via planTabbedWrap). */
describe("planTabbedWrap / minTabWidthFromChars", () => {
  it("minTabWidthFromChars returns 0 when minChars is 0 (no chrome floor)", () => {
    expect(minTabWidthFromChars(0, 10, 24)).toBe(0);
    expect(minTabWidthFromChars(20, 8, 16)).toBe(20 * 8 + 16);
  });

  it("width wrap fills rows from minTabWidth", () => {
    // 900 / 180 = 5 tabs per row → 12 tabs → 3 rows
    const plan = planTabbedWrap({
      count: 12,
      rowInnerWidth: 900,
      minTabWidth: 180,
      maxPerLine: 0,
      maxRows: 0,
    });
    expect(plan.perRow).toBe(5);
    expect(plan.rowCount).toBe(3);
    expect(plan.capped).toBe(false);
    expect(plan.rows).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11],
    ]);
  });

  it("count cap ANDs with width fit", () => {
    // width would allow 5; maxPerLine 3 wins
    const plan = planTabbedWrap({
      count: 10,
      rowInnerWidth: 900,
      minTabWidth: 180,
      maxPerLine: 3,
      maxRows: 0,
    });
    expect(plan.perRow).toBe(3);
    expect(plan.rowCount).toBe(4);
    expect(plan.capped).toBe(false);
  });

  it("row cap shrinks perRow and sets capped", () => {
    // width fit 5 → would be 4 rows for 20 tabs; maxRows 3 → ceil(20/3)=7
    const plan = planTabbedWrap({
      count: 20,
      rowInnerWidth: 900,
      minTabWidth: 180,
      maxPerLine: 0,
      maxRows: 3,
    });
    expect(plan.perRow).toBe(7);
    expect(plan.rowCount).toBe(3);
    expect(plan.capped).toBe(true);
  });

  it("minChars=0 + maxPerLine=0 + width keeps a single row", () => {
    const plan = planTabbedWrap({
      count: 8,
      rowInnerWidth: 200,
      minTabWidth: minTabWidthFromChars(0, 10, 24),
      maxPerLine: 0,
      maxRows: 0,
    });
    expect(plan.rowCount).toBe(1);
    expect(plan.perRow).toBe(8);
    expect(plan.capped).toBe(false);
  });

  it("empty count yields empty plan", () => {
    expect(planTabbedWrap({ count: 0, rowInnerWidth: 900, minTabWidth: 180 })).toEqual({
      rows: [],
      rowCount: 0,
      perRow: 0,
      capped: false,
    });
  });

  it("rowInnerWidth < minTabWidth yields one tab per row until maxRows", () => {
    const unbounded = planTabbedWrap({
      count: 4,
      rowInnerWidth: 100,
      minTabWidth: 180,
      maxPerLine: 0,
      maxRows: 0,
    });
    expect(unbounded.perRow).toBe(1);
    expect(unbounded.rowCount).toBe(4);
    expect(unbounded.capped).toBe(false);

    const capped = planTabbedWrap({
      count: 4,
      rowInnerWidth: 100,
      minTabWidth: 180,
      maxPerLine: 0,
      maxRows: 2,
    });
    expect(capped.perRow).toBe(2);
    expect(capped.rowCount).toBe(2);
    expect(capped.capped).toBe(true);
  });
});

/** Pure tree-layout helpers — apply-contract O8 slot math. */
describe("applyMargins / pure processGap / splitChildRect (O8)", () => {
  it("applyMargins shrinks workarea by screen-edge margins", () => {
    const rect = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(applyMargins(rect, { top: 32, bottom: 0, left: 8, right: 8 })).toEqual({
      x: 8,
      y: 32,
      width: 1904,
      height: 1048,
    });
  });

  it("applyMargins with empty margins is identity", () => {
    const rect = { x: 100, y: 50, width: 800, height: 600 };
    expect(applyMargins(rect, {})).toEqual(rect);
  });

  it("pure processGap insets when both axes exceed 2× gap", () => {
    const node = { rect: { x: 10, y: 20, width: 100, height: 80 } };
    expect(pureProcessGap(node, 5)).toEqual({ x: 15, y: 25, width: 90, height: 70 });
  });

  it("pure processGap skips inset when rect is too small", () => {
    const node = { rect: { x: 0, y: 0, width: 12, height: 100 } };
    expect(pureProcessGap(node, 10)).toEqual({ x: 0, y: 0, width: 12, height: 100 });
  });

  it("splitChildRect HSPLIT places children by cumulative sizes", () => {
    const nodeRect = { x: 100, y: 50, width: 1000, height: 400 };
    const sizes = [300, 200, 500];
    expect(splitChildRect("HSPLIT", nodeRect, sizes, 0)).toEqual({
      x: 100,
      y: 50,
      width: 300,
      height: 400,
    });
    expect(splitChildRect("HSPLIT", nodeRect, sizes, 1)).toEqual({
      x: 400,
      y: 50,
      width: 200,
      height: 400,
    });
    expect(splitChildRect("HSPLIT", nodeRect, sizes, 2)).toEqual({
      x: 600,
      y: 50,
      width: 500,
      height: 400,
    });
  });

  it("splitChildRect VSPLIT stacks by cumulative sizes", () => {
    const nodeRect = { x: 0, y: 10, width: 800, height: 900 };
    const sizes = [200, 300, 400];
    expect(splitChildRect("VSPLIT", nodeRect, sizes, 1)).toEqual({
      x: 0,
      y: 210,
      width: 800,
      height: 300,
    });
    expect(splitChildRect("VSPLIT", nodeRect, sizes, 2)).toEqual({
      x: 0,
      y: 510,
      width: 800,
      height: 400,
    });
  });
});

describe("Tree Layout Algorithms", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({ fullExtWm: true });
    ctx.extWm.calculateGaps = vi.fn(() => 10); // 10px gap
  });

  describe("computeSizes", () => {
    it("should divide space equally for horizontal split", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());

      const sizes = ctx.tree.computeSizes(container, [child1, child2]);

      expect(sizes).toHaveLength(2);
      expect(sizes[0]).toBe(500); // 1000 / 2
      expect(sizes[1]).toBe(500);
    });

    it("should divide space equally for vertical split", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 600 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());

      const sizes = ctx.tree.computeSizes(container, [child1, child2]);

      expect(sizes).toHaveLength(2);
      expect(sizes[0]).toBe(300); // 600 / 2
      expect(sizes[1]).toBe(300);
    });

    it("should respect custom percent values", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      child1.percent = 0.7; // 70%

      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      child2.percent = 0.3; // 30%

      const sizes = ctx.tree.computeSizes(container, [child1, child2]);

      expect(sizes[0]).toBe(700); // 1000 * 0.7
      expect(sizes[1]).toBe(300); // 1000 * 0.3
    });

    it("should handle three children equally", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 900, height: 500 };

      const children = [
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
      ];

      const sizes = ctx.tree.computeSizes(container, children);

      expect(sizes).toHaveLength(3);
      expect(sizes[0]).toBe(300); // 900 / 3
      expect(sizes[1]).toBe(300);
      expect(sizes[2]).toBe(300);
    });

    it("should floor the sizes to integers", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const children = [
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
      ];

      const sizes = ctx.tree.computeSizes(container, children);

      // 1000 / 3 = 333.333... should floor to 333
      sizes.forEach((size) => {
        expect(Number.isInteger(size)).toBe(true);
      });
    });

    it("should handle single child", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());

      const sizes = ctx.tree.computeSizes(container, [child1]);

      expect(sizes).toHaveLength(1);
      expect(sizes[0]).toBe(1000); // Full width
    });

    // Percent edge cases (apply-contract O8): computeSizes does not renormalize
    // user percents before flooring; remainder folds into the last child.
    it("folds floor remainder into the last sibling so sizes sum to total", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const children = [
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
      ];
      // 1/3 each → floor 333; remainder 1 goes to last → 333,333,334
      const sizes = ctx.tree.computeSizes(container, children);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
      expect(sizes[0]).toBe(333);
      expect(sizes[1]).toBe(333);
      expect(sizes[2]).toBe(334);
    });

    it("treats zero/missing percent as equal share (not a zero slot)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      child1.percent = 0;
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      // undefined percent
      const sizes = ctx.tree.computeSizes(container, [child1, child2]);
      expect(sizes).toEqual([500, 500]);
    });

    it("does not renormalize percents that sum past 1.0 (last absorbs remainder)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      child1.percent = 0.7;
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      child2.percent = 0.7;

      const sizes = ctx.tree.computeSizes(container, [child1, child2]);
      // floor(700)+floor(700)=1400 → last gets 1000-1400 = -400 → 300
      expect(sizes[0]).toBe(700);
      expect(sizes[1]).toBe(300);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it("honors unequal percents that sum under 1.0 (last absorbs remainder)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;
      container.rect = { x: 0, y: 0, width: 800, height: 1000 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      child1.percent = 0.2;
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      child2.percent = 0.2;

      const sizes = ctx.tree.computeSizes(container, [child1, child2]);
      // floor(200)+floor(200)=400 → last += 600 → 200,800
      expect(sizes[0]).toBe(200);
      expect(sizes[1]).toBe(800);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
    });
  });

  describe("processSplit - Horizontal", () => {
    it("should split two windows horizontally", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 500 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { sizes: [500, 500] };

      ctx.tree.processSplit(container, child1, params, 0);
      ctx.tree.processSplit(container, child2, params, 1);

      // First child should be on the left
      expect(child1.rect.x).toBe(0);
      expect(child1.rect.y).toBe(0);
      expect(child1.rect.width).toBe(500);
      expect(child1.rect.height).toBe(500);

      // Second child should be on the right
      expect(child2.rect.x).toBe(500);
      expect(child2.rect.y).toBe(0);
      expect(child2.rect.width).toBe(500);
      expect(child2.rect.height).toBe(500);
    });

    it("should split three windows with custom sizes", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 100, y: 50, width: 1200, height: 600 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      const child3 = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { sizes: [300, 500, 400] };

      ctx.tree.processSplit(container, child1, params, 0);
      ctx.tree.processSplit(container, child2, params, 1);
      ctx.tree.processSplit(container, child3, params, 2);

      // Check x positions
      expect(child1.rect.x).toBe(100);
      expect(child2.rect.x).toBe(400); // 100 + 300
      expect(child3.rect.x).toBe(900); // 100 + 300 + 500

      // All should have same height
      expect(child1.rect.height).toBe(600);
      expect(child2.rect.height).toBe(600);
      expect(child3.rect.height).toBe(600);

      // Check widths
      expect(child1.rect.width).toBe(300);
      expect(child2.rect.width).toBe(500);
      expect(child3.rect.width).toBe(400);
    });

    it("should handle offset container position", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 200, y: 100, width: 800, height: 400 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const params = { sizes: [800] };

      ctx.tree.processSplit(container, child, params, 0);

      // Should respect container offset
      expect(child.rect.x).toBe(200);
      expect(child.rect.y).toBe(100);
    });
  });

  describe("processSplit - Vertical", () => {
    it("should split two windows vertically", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { sizes: [400, 400] };

      ctx.tree.processSplit(container, child1, params, 0);
      ctx.tree.processSplit(container, child2, params, 1);

      // First child should be on top
      expect(child1.rect.x).toBe(0);
      expect(child1.rect.y).toBe(0);
      expect(child1.rect.width).toBe(1000);
      expect(child1.rect.height).toBe(400);

      // Second child should be below
      expect(child2.rect.x).toBe(0);
      expect(child2.rect.y).toBe(400);
      expect(child2.rect.width).toBe(1000);
      expect(child2.rect.height).toBe(400);
    });

    it("should split three windows vertically", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;
      container.rect = { x: 0, y: 0, width: 1000, height: 900 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      const child3 = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { sizes: [300, 300, 300] };

      ctx.tree.processSplit(container, child1, params, 0);
      ctx.tree.processSplit(container, child2, params, 1);
      ctx.tree.processSplit(container, child3, params, 2);

      // Check y positions
      expect(child1.rect.y).toBe(0);
      expect(child2.rect.y).toBe(300);
      expect(child3.rect.y).toBe(600);

      // All should have same width
      expect(child1.rect.width).toBe(1000);
      expect(child2.rect.width).toBe(1000);
      expect(child3.rect.width).toBe(1000);
    });
  });

  describe("processStacked", () => {
    it("should give a unary stacked child the full pane (no chrome)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };
      const child = new Node(NODE_TYPES.CON, new St.Bin());

      const stackHeight = 35;
      const params = { stackedHeight: stackHeight, tiledChildren: [child] };

      ctx.tree.processStacked(container, child, params, 0);

      expect(child.rect.x).toBe(0);
      expect(child.rect.y).toBe(0);
      expect(child.rect.width).toBe(1000);
      expect(child.rect.height).toBe(800);
    });

    it("should place every stacked window below the full title-bar column", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      const child3 = new Node(NODE_TYPES.CON, new St.Bin());

      const stackHeight = 35;
      const params = {
        stackedHeight: stackHeight,
        tiledChildren: [child1, child2, child3],
      };
      const totalBars = stackHeight * 3;

      ctx.tree.processStacked(container, child1, params, 0);
      ctx.tree.processStacked(container, child2, params, 1);
      ctx.tree.processStacked(container, child3, params, 2);

      // i3 stacked: N title bars at the top, every window fills the same area below.
      [child1, child2, child3].forEach((child) => {
        expect(child.rect.x).toBe(0);
        expect(child.rect.y).toBe(totalBars);
        expect(child.rect.width).toBe(1000);
        expect(child.rect.height).toBe(800 - totalBars);
      });

      // The decoration hosts the title-bar column vertically and is shown.
      expect(container.decoration.orientation).toBe(Clutter.Orientation.VERTICAL);
      expect(container.decoration.visible).toBe(true);
      expect(container.decoration.height).toBe(totalBars);

      // Each title bar is one strip height — not the full column (N×) via y_expand.
      [child1, child2, child3].forEach((child) => {
        if (child.tab) {
          expect(child.tab.height).toBe(stackHeight);
          expect(child.tab.y_expand).toBe(false);
        }
      });
    });

    it("should respect container offset", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 100, y: 50, width: 800, height: 600 };
      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const sibling = new Node(NODE_TYPES.CON, new St.Bin());

      const stackHeight = 35;
      const params = { stackedHeight: stackHeight, tiledChildren: [child, sibling] };

      ctx.tree.processStacked(container, child, params, 0);

      expect(child.rect.x).toBe(100);
      expect(child.rect.y).toBe(50 + stackHeight * 2);
    });

    // forge-aydd: when the title-bar column (stackHeight * count) is taller than the
    // container, the window content's y must not be pushed below the container bottom.
    it("should keep the window content within the container when bars overflow", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 100 };

      const children = [
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
      ];

      // 5 bars * 35 = 175 > container height 100 (overflow regime).
      const params = { stackedHeight: 35, tiledChildren: children };

      children.forEach((child, i) => {
        ctx.tree.processStacked(container, child, params, i);
        const bottom = child.rect.y + child.rect.height;
        expect(bottom).toBeLessThanOrEqual(container.rect.y + container.rect.height);
      });
    });

    // Bug #8: a degenerate (<=0) container height must not make cappedBars negative,
    // which would push the child's y above the container origin.
    it("should clamp cappedBars to 0 when the container height is zero", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 0 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const sibling = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { stackedHeight: 35, tiledChildren: [child, sibling] };

      ctx.tree.processStacked(container, child, params, 0);

      // cappedBars clamped to 0, so the child never floats above the container.
      expect(child.rect.y).toBeGreaterThanOrEqual(container.rect.y);
      expect(child.rect.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("processTabbed", () => {
    it("should show single tab with full container", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const params = { stackedHeight: 0, tiledChildren: [child] };

      ctx.tree.processTabbed(container, child, params, 0);

      // With alwaysShowDecorationTab and stackedHeight=0, should show full size
      expect(child.rect.x).toBe(0);
      expect(child.rect.y).toBe(0);
      expect(child.rect.width).toBe(1000);
      expect(child.rect.height).toBe(800);
    });

    it("should lay the header tabs out as a horizontal row", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const sibling = new Node(NODE_TYPES.CON, new St.Bin());

      const params = { stackedHeight: 35, tiledChildren: [child, sibling] };

      ctx.tree.processTabbed(container, child, params, 0);

      expect(container.decoration.orientation).toBe(Clutter.Orientation.HORIZONTAL);
    });

    it("should account for tab decoration height", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const stackedHeight = 35; // Tab bar height
      const params = {
        stackedHeight,
        tiledChildren: [child, new Node(NODE_TYPES.CON, new St.Bin())],
      };

      ctx.tree.processTabbed(container, child, params, 0);

      // Y should be offset by tab bar
      expect(child.rect.y).toBe(stackedHeight);
      expect(child.rect.height).toBe(800 - stackedHeight);

      // X and width should match container
      expect(child.rect.x).toBe(0);
      expect(child.rect.width).toBe(1000);
    });

    // forge-aydd: a container shorter than the tab bar must not yield a negative height.
    it("should never give a tab a negative height", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 20 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      ctx.tree.processTabbed(
        container,
        child,
        {
          stackedHeight: 35,
          tiledChildren: [child, new Node(NODE_TYPES.CON, new St.Bin())],
        },
        0
      );

      expect(child.rect.height).toBeGreaterThanOrEqual(1);
    });

    it("should show all tabs at same position (only one visible)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      const child3 = new Node(NODE_TYPES.CON, new St.Bin());

      const stackedHeight = 35;
      const params = { stackedHeight, tiledChildren: [child1, child2, child3] };

      ctx.tree.processTabbed(container, child1, params, 0);
      ctx.tree.processTabbed(container, child2, params, 1);
      ctx.tree.processTabbed(container, child3, params, 2);

      // All tabs should have same rect (overlapping, only one shown)
      [child1, child2, child3].forEach((child) => {
        expect(child.rect.x).toBe(0);
        expect(child.rect.y).toBe(stackedHeight);
        expect(child.rect.width).toBe(1000);
        expect(child.rect.height).toBe(800 - stackedHeight);
      });
    });

    it("should respect container offset", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 200, y: 100, width: 800, height: 600 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const params = { stackedHeight: 0, tiledChildren: [child] };

      ctx.tree.processTabbed(container, child, params, 0);

      expect(child.rect.x).toBe(200);
      expect(child.rect.y).toBe(100);
    });

    // T9: multi-line tabs when max-tabs-per-line >= 1
    it("max=3 with 5 tabs: content inset by 2× row height and outer is vertical", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const kids = Array.from({ length: 5 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 3,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      const totalBar = stackedHeight * 2;
      kids.forEach((child) => {
        expect(child.rect.y).toBe(totalBar);
        expect(child.rect.height).toBe(800 - totalBar);
        expect(child.tab.height).toBe(stackedHeight);
        expect(child.tab.y_expand).toBe(false);
      });
      expect(container.decoration.orientation).toBe(Clutter.Orientation.VERTICAL);
      expect(container.decoration.height).toBe(totalBar);
      expect(container._tabRowHosts).toHaveLength(2);
      expect(container._tabRowHosts[0].children).toHaveLength(3);
      expect(container._tabRowHosts[1].children).toHaveLength(2);
      container._tabRowHosts.forEach((row) => {
        expect(row.height).toBe(stackedHeight);
        expect(row.y_expand).toBe(false);
      });
    });

    it("max=1 with K tabs: K bar rows (stack-like height) still TABBED", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const kids = Array.from({ length: 4 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 1,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      const totalBar = stackedHeight * 4;
      kids.forEach((child) => {
        expect(child.rect.y).toBe(totalBar);
        expect(child.rect.height).toBe(800 - totalBar);
      });
      expect(container.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(container._tabRowHosts).toHaveLength(4);
      container._tabRowHosts.forEach((row) => {
        expect(row.children).toHaveLength(1);
      });
    });

    it("max=0 keeps single-row horizontal host (default unchanged)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const kids = Array.from({ length: 5 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 0,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      kids.forEach((child) => {
        expect(child.rect.y).toBe(stackedHeight);
        expect(child.rect.height).toBe(800 - stackedHeight);
      });
      expect(container.decoration.orientation).toBe(Clutter.Orientation.HORIZONTAL);
      expect(container.decoration.height).toBe(stackedHeight);
      expect(container._tabRowHosts).toBeFalsy();
      // Tabs attach directly to the outer decoration.
      expect(
        container.decoration.children.filter((c) => kids.some((k) => k.tab === c))
      ).toHaveLength(5);
    });

    // PR3: schema defaults (minChars=0, maxRows=0, maxPerLine=0) stay single-row.
    it("default wrap keys (minChars=0) keep single-row for many tabs", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 400, height: 600 };

      const kids = Array.from({ length: 12 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 0,
        minTabLabelChars: 0,
        maxTabRows: 0,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      kids.forEach((child) => {
        expect(child.rect.y).toBe(stackedHeight);
        expect(child.rect.height).toBe(600 - stackedHeight);
      });
      expect(container.decoration.orientation).toBe(Clutter.Orientation.HORIZONTAL);
      expect(container._tabRowHosts).toBeFalsy();
      expect(ctx.tree.measureMinTabWidth({ minChars: 0 })).toBe(0);
    });

    // PR3: forced min tab width multi-row via planTabbedWrap (not count-only).
    it("forced minTabWidth paints multi-row when tiles are narrow", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 900, height: 800 };

      const kids = Array.from({ length: 6 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      // 900/180 = 5 fit → 6 tabs → 2 rows (perRow 5)
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 0,
        minTabLabelChars: 20,
        minTabWidth: 180,
        rowInnerWidth: 900,
        maxTabRows: 0,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      const totalBar = stackedHeight * 2;
      kids.forEach((child) => {
        expect(child.rect.y).toBe(totalBar);
        expect(child.rect.height).toBe(800 - totalBar);
        expect(child.tab.height).toBe(stackedHeight);
      });
      expect(container.decoration.orientation).toBe(Clutter.Orientation.VERTICAL);
      expect(container._tabRowHosts).toHaveLength(2);
      expect(container._tabRowHosts[0].children).toHaveLength(5);
      expect(container._tabRowHosts[1].children).toHaveLength(1);
      container._tabRowHosts.forEach((row) => {
        expect(row.height).toBe(stackedHeight);
      });
    });

    it("max-tab-rows caps plan.rowCount and still multi-row hosts", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 200, height: 800 };

      const kids = Array.from({ length: 6 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      // minW 180 on 200px → fit=1 → 6 rows unbounded; maxRows=2 → perRow=3
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 0,
        minTabWidth: 180,
        rowInnerWidth: 200,
        maxTabRows: 2,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      const totalBar = stackedHeight * 2;
      kids.forEach((child) => {
        expect(child.rect.y).toBe(totalBar);
      });
      expect(container._tabRowHosts).toHaveLength(2);
      expect(container._tabRowHosts[0].children).toHaveLength(3);
      expect(container._tabRowHosts[1].children).toHaveLength(3);
    });

    it("maxPerLine set but one row uses horizontal host (rowCount gate)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const kids = Array.from({ length: 2 }, () => new Node(NODE_TYPES.CON, new St.Bin()));
      kids.forEach((c) => {
        c.tab = new St.Bin();
        c._createWindowTab = vi.fn();
        c._ensureConTab = vi.fn();
      });

      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: kids,
        maxTabsPerLine: 5,
      };

      kids.forEach((child, i) => ctx.tree.processTabbed(container, child, params, i));

      expect(container.decoration.orientation).toBe(Clutter.Orientation.HORIZONTAL);
      expect(container._tabRowHosts).toBeFalsy();
      kids.forEach((child) => {
        expect(child.rect.y).toBe(stackedHeight);
      });
    });
  });

  describe("tab-position: bottom", () => {
    let bottomCtx;

    beforeEach(() => {
      bottomCtx = createTreeFixture({
        settings: { "tab-position": "bottom" },
        fullExtWm: true,
      });
      bottomCtx.extWm.calculateGaps = vi.fn(() => 10);
    });

    afterEach(() => {
      bottomCtx.cleanup();
    });

    it("places stacked content at the container top with the bar column at the bottom", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      const child3 = new Node(NODE_TYPES.CON, new St.Bin());

      const stackHeight = 35;
      const params = {
        stackedHeight: stackHeight,
        tiledChildren: [child1, child2, child3],
      };
      const totalBars = stackHeight * 3;

      bottomCtx.tree.processStacked(container, child1, params, 0);
      bottomCtx.tree.processStacked(container, child2, params, 1);
      bottomCtx.tree.processStacked(container, child3, params, 2);

      // Bottom: content sits at the container top, the bar column fills the bottom.
      [child1, child2, child3].forEach((child) => {
        expect(child.rect.x).toBe(0);
        expect(child.rect.y).toBe(container.rect.y);
        expect(child.rect.width).toBe(1000);
        expect(child.rect.height).toBe(800 - totalBars);
      });

      // Decoration anchored near the bottom of the (gap-shrunk) render rect.
      const renderRect = bottomCtx.tree.processGap(container);
      expect(container.decoration.height).toBe(totalBars);
      expect(container.decoration.y).toBe(renderRect.y + renderRect.height - totalBars);
    });

    it("places tabbed content at the container top with the tab strip at the bottom", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      const stackedHeight = 35;
      const params = {
        stackedHeight,
        tiledChildren: [child, new Node(NODE_TYPES.CON, new St.Bin())],
      };

      bottomCtx.tree.processTabbed(container, child, params, 0);

      expect(child.rect.x).toBe(0);
      expect(child.rect.y).toBe(container.rect.y);
      expect(child.rect.width).toBe(1000);
      expect(child.rect.height).toBe(800 - stackedHeight);

      const renderRect = bottomCtx.tree.processGap(container);
      expect(container.decoration.y).toBe(renderRect.y + renderRect.height - stackedHeight);
    });

    // forge-aydd clamp must still hold at the bottom: a tiny container yields height >= 1.
    it("keeps content height >= 1 for a tiny container (stacked, bottom)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.STACKED;
      container.rect = { x: 0, y: 0, width: 1000, height: 100 };

      const children = [
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
        new Node(NODE_TYPES.CON, new St.Bin()),
      ];

      const params = { stackedHeight: 35, tiledChildren: children };

      children.forEach((child, i) => {
        bottomCtx.tree.processStacked(container, child, params, i);
        expect(child.rect.height).toBeGreaterThanOrEqual(1);
        // Content still starts at the container top in the overflow regime.
        expect(child.rect.y).toBe(container.rect.y);
      });
    });

    it("keeps content height >= 1 for a tiny container (tabbed, bottom)", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.TABBED;
      container.rect = { x: 0, y: 0, width: 1000, height: 20 };

      const child = new Node(NODE_TYPES.CON, new St.Bin());
      bottomCtx.tree.processTabbed(
        container,
        child,
        {
          stackedHeight: 35,
          tiledChildren: [child, new Node(NODE_TYPES.CON, new St.Bin())],
        },
        0
      );

      expect(child.rect.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("processGap", () => {
    it("should add gaps to all sides", () => {
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      node.rect = { x: 0, y: 0, width: 1000, height: 800 };

      const gap = 10;
      ctx.extWm.calculateGaps.mockReturnValue(gap);

      const result = ctx.tree.processGap(node);

      // Position should be offset by gap
      expect(result.x).toBe(gap);
      expect(result.y).toBe(gap);

      // Size should be reduced by gap * 2
      expect(result.width).toBe(1000 - gap * 2);
      expect(result.height).toBe(800 - gap * 2);
    });

    it("should handle larger gaps", () => {
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      node.rect = { x: 100, y: 50, width: 1000, height: 800 };

      const gap = 20;
      ctx.extWm.calculateGaps.mockReturnValue(gap);

      const result = ctx.tree.processGap(node);

      expect(result.x).toBe(120); // 100 + 20
      expect(result.y).toBe(70); // 50 + 20
      expect(result.width).toBe(960); // 1000 - 40
      expect(result.height).toBe(760); // 800 - 40
    });

    it("should not add gap if rect too small", () => {
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      node.rect = { x: 0, y: 0, width: 15, height: 15 };

      const gap = 10;
      ctx.extWm.calculateGaps.mockReturnValue(gap);

      const result = ctx.tree.processGap(node);

      // Gap * 2 (20) > width (15), so no gap applied
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(15);
      expect(result.height).toBe(15);
    });

    it("should handle zero gap", () => {
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      node.rect = { x: 10, y: 20, width: 1000, height: 800 };

      ctx.extWm.calculateGaps.mockReturnValue(0);

      const result = ctx.tree.processGap(node);

      // No gap, should return original rect
      expect(result).toEqual({ x: 10, y: 20, width: 1000, height: 800 });
    });
  });

  describe("Layout Integration", () => {
    it("should compute sizes and apply split layout", () => {
      const container = new Node(NODE_TYPES.CON, new St.Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;
      container.rect = { x: 0, y: 0, width: 1200, height: 600 };

      const child1 = new Node(NODE_TYPES.CON, new St.Bin());
      child1.percent = 0.6;
      const child2 = new Node(NODE_TYPES.CON, new St.Bin());
      child2.percent = 0.4;

      const children = [child1, child2];
      const sizes = ctx.tree.computeSizes(container, children);
      const params = { sizes };

      ctx.tree.processSplit(container, child1, params, 0);
      ctx.tree.processSplit(container, child2, params, 1);

      // Should respect percentages
      expect(child1.rect.width).toBe(720); // 1200 * 0.6
      expect(child2.rect.width).toBe(480); // 1200 * 0.4
      expect(child1.rect.x).toBe(0);
      expect(child2.rect.x).toBe(720);
    });
  });

  /**
   * PresentChrome.processNode end-to-end slot math (apply-contract O8 / G8h).
   * Workarea → mon.rect (margins + gap) → nested splits/percents → leaf
   * renderRect (gap) and tab/stack chrome insets. No live Shell HUP.
   */
  describe("processNode slot math (apply-contract O8)", () => {
    afterEach(() => {
      // Local fixtures may replace ctx; outer suite does not always clean up.
      if (ctx?.cleanup) ctx.cleanup();
    });

    it("dual-mon different workareas yield independent root slots", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        globals: {
          display: {
            monitorCount: 2,
            monitorGeometries: [
              { x: 0, y: 0, width: 1920, height: 1080 },
              { x: 1920, y: 0, width: 2560, height: 1440 },
            ],
          },
        },
      });
      ctx.extWm.calculateGaps = vi.fn(() => 0);

      const ws = ctx.workspaceManager.get_active_workspace();
      ws.get_work_area_for_monitor = (idx) => {
        if (idx === 0) return new Rectangle({ x: 0, y: 0, width: 1920, height: 1040 });
        return new Rectangle({ x: 1920, y: 0, width: 2560, height: 1400 });
      };

      const monitors = getMonitors(ctx);
      expect(monitors).toHaveLength(2);

      const [w0a, w0b] = createHorizontalLayout(ctx.tree, monitors[0], 2);
      const [w1a] = createHorizontalLayout(ctx.tree, monitors[1], 1);

      // forestAdmit spine is liveById-only; ROOT GObject kids are empty — walk each mon.
      for (const mon of monitors) PresentChrome.processNode(ctx.tree, mon);

      expect(monitors[0].rect).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
      expect(monitors[1].rect).toEqual({ x: 1920, y: 0, width: 2560, height: 1400 });

      expect(w0a.nodeWindow.rect).toEqual({ x: 0, y: 0, width: 960, height: 1040 });
      expect(w0b.nodeWindow.rect).toEqual({ x: 960, y: 0, width: 960, height: 1040 });
      expect(w1a.nodeWindow.rect).toEqual({ x: 1920, y: 0, width: 2560, height: 1400 });
      expect(w1a.nodeWindow.renderRect).toEqual(w1a.nodeWindow.rect);
    });

    it("nested H then V with percents places quadrant leaves correctly", () => {
      ctx.cleanup();
      ctx = createTreeFixture({ fullExtWm: true });
      ctx.extWm.calculateGaps = vi.fn(() => 0);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const left = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT);
      left.percent = 0.4;
      const right = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT);
      right.percent = 0.6;

      const tl = createWindowNode(ctx.tree, left, { mode: "TILE" });
      tl.nodeWindow.percent = 0.25;
      const bl = createWindowNode(ctx.tree, left, { mode: "TILE" });
      bl.nodeWindow.percent = 0.75;

      const tr = createWindowNode(ctx.tree, right, { mode: "TILE" });
      const br = createWindowNode(ctx.tree, right, { mode: "TILE" });
      // equal V on right

      PresentChrome.processNode(ctx.tree, monitor);

      // mon workarea 1920×1080; left 40% → 768, right 60% → 1152
      expect(left.rect).toEqual({ x: 0, y: 0, width: 768, height: 1080 });
      expect(right.rect).toEqual({ x: 768, y: 0, width: 1152, height: 1080 });

      expect(tl.nodeWindow.rect).toEqual({ x: 0, y: 0, width: 768, height: 270 });
      expect(bl.nodeWindow.rect).toEqual({ x: 0, y: 270, width: 768, height: 810 });
      expect(tr.nodeWindow.rect).toEqual({ x: 768, y: 0, width: 1152, height: 540 });
      expect(br.nodeWindow.rect).toEqual({ x: 768, y: 540, width: 1152, height: 540 });

      expect(tl.nodeWindow.renderRect).toEqual(tl.nodeWindow.rect);
      expect(br.nodeWindow.renderRect).toEqual(br.nodeWindow.rect);
    });

    it("outer margins shrink mon root before split", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: {
          "window-margin-top": 40,
          "window-margin-bottom": 10,
          "window-margin-left": 20,
          "window-margin-right": 20,
        },
      });
      ctx.extWm.calculateGaps = vi.fn(() => 0);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const [left, right] = createHorizontalLayout(ctx.tree, monitor, 2);

      PresentChrome.processNode(ctx.tree, monitor);

      // 1920×1080 − margins → x20 y40 w1880 h1030
      expect(monitor.rect).toEqual({ x: 20, y: 40, width: 1880, height: 1030 });
      expect(left.nodeWindow.rect).toEqual({ x: 20, y: 40, width: 940, height: 1030 });
      expect(right.nodeWindow.rect).toEqual({ x: 960, y: 40, width: 940, height: 1030 });
    });

    it("gaps inset mon then leaf renderRect", () => {
      ctx.cleanup();
      ctx = createTreeFixture({ fullExtWm: true });
      const gap = 10;
      ctx.extWm.calculateGaps = vi.fn(() => gap);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const [left, right] = createHorizontalLayout(ctx.tree, monitor, 2);

      PresentChrome.processNode(ctx.tree, monitor);

      // mon workarea gapped once: 10,10,1900,1060
      expect(monitor.rect).toEqual({ x: 10, y: 10, width: 1900, height: 1060 });
      // split of mon.rect (not workarea)
      expect(left.nodeWindow.rect).toEqual({ x: 10, y: 10, width: 950, height: 1060 });
      expect(right.nodeWindow.rect).toEqual({ x: 960, y: 10, width: 950, height: 1060 });
      // leaf renderRect gapped again
      expect(left.nodeWindow.renderRect).toEqual({ x: 20, y: 20, width: 930, height: 1040 });
      expect(right.nodeWindow.renderRect).toEqual({ x: 970, y: 20, width: 930, height: 1040 });
    });

    it("margins + gaps compose on mon root", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: {
          "window-margin-top": 20,
          "window-margin-bottom": 20,
          "window-margin-left": 10,
          "window-margin-right": 10,
        },
      });
      const gap = 5;
      ctx.extWm.calculateGaps = vi.fn(() => gap);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      createWindowNode(ctx.tree, monitor, { mode: "TILE" });

      PresentChrome.processNode(ctx.tree, monitor);

      // margins → {10,20,1900,1040}; then gap → {15,25,1890,1030}
      expect(monitor.rect).toEqual({ x: 15, y: 25, width: 1890, height: 1030 });
    });

    it("TABBED processNode insets leaf content by bar height", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: { "stacked-tab-bar-height": 35, "showtab-decoration-enabled": true },
      });
      ctx.extWm.calculateGaps = vi.fn(() => 0);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.TABBED;
      const a = createWindowNode(ctx.tree, monitor, { mode: "TILE" });
      const b = createWindowNode(ctx.tree, monitor, { mode: "TILE" });

      PresentChrome.processNode(ctx.tree, monitor);

      // Both leaves share the full mon rect inset by one tab bar (top)
      const expected = { x: 0, y: 35, width: 1920, height: 1080 - 35 };
      expect(a.nodeWindow.rect).toEqual(expected);
      expect(b.nodeWindow.rect).toEqual(expected);
      expect(a.nodeWindow.renderRect).toEqual(expected);
    });

    it("STACKED processNode insets leaf content by N× bar height", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: { "stacked-tab-bar-height": 40, "showtab-decoration-enabled": true },
      });
      ctx.extWm.calculateGaps = vi.fn(() => 0);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.STACKED;
      const wins = [
        createWindowNode(ctx.tree, monitor, { mode: "TILE" }),
        createWindowNode(ctx.tree, monitor, { mode: "TILE" }),
        createWindowNode(ctx.tree, monitor, { mode: "TILE" }),
      ];

      PresentChrome.processNode(ctx.tree, monitor);

      const bars = 40 * 3;
      const expected = { x: 0, y: bars, width: 1920, height: 1080 - bars };
      for (const w of wins) {
        expect(w.nodeWindow.rect).toEqual(expected);
        expect(w.nodeWindow.renderRect).toEqual(expected);
      }
    });

    it("nested split under TABBED CON applies chrome then gap on leaves", () => {
      ctx.cleanup();
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: { "stacked-tab-bar-height": 30, "showtab-decoration-enabled": true },
      });
      const gap = 8;
      ctx.extWm.calculateGaps = vi.fn(() => gap);

      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const tabCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
      tabCon.percent = 0.5;
      const plain = createWindowNode(ctx.tree, monitor, { mode: "TILE" });
      plain.nodeWindow.percent = 0.5;

      const t0 = createWindowNode(ctx.tree, tabCon, { mode: "TILE" });
      const t1 = createWindowNode(ctx.tree, tabCon, { mode: "TILE" });

      PresentChrome.processNode(ctx.tree, monitor);

      // mon after gap: 8,8,1904,1064; half widths 952
      expect(tabCon.rect.width).toBe(952);
      expect(plain.nodeWindow.rect.x).toBe(8 + 952);

      // TABBED content: y = mon.y + 30, height = mon.h - 30
      expect(t0.nodeWindow.rect).toEqual({
        x: 8,
        y: 8 + 30,
        width: 952,
        height: 1064 - 30,
      });
      expect(t1.nodeWindow.rect).toEqual(t0.nodeWindow.rect);
      // leaf renderRect gap again
      expect(t0.nodeWindow.renderRect).toEqual({
        x: 8 + gap,
        y: 8 + 30 + gap,
        width: 952 - gap * 2,
        height: 1064 - 30 - gap * 2,
      });
    });

    it("buffer-scale align rounds slot edges to scale (move-time contract)", () => {
      // Tree plans pure rects; WindowManager.move aligns to buffer scale when
      // dpi>1. Document the pure rule used at apply (O8 surface adjacent).
      ctx.cleanup();
      const wmCtx = createWindowManagerFixture();
      const align = (v, scale) => wmCtx.windowManager._alignToBufferScale(v, scale);

      expect(align(0, 2)).toBe(0);
      expect(align(1, 2)).toBe(2);
      expect(align(960.4, 2)).toBe(960);
      expect(align(961, 2)).toBe(962);
      expect(align(100, 1.5)).toBe(100.5);
      expect(align(101, 1.5)).toBe(100.5);

      wmCtx.cleanup();
      // Restore suite fixture for sibling tests' beforeEach independence.
      ctx = createTreeFixture({ fullExtWm: true });
      ctx.extWm.calculateGaps = vi.fn(() => 10);
    });
  });

  // forge-1a5: the stacked/tabbed title-bar height is read from a gsetting
  // (DPI-scaled) instead of a hardcoded 35, and feeds params.stackedHeight in
  // processNode.
  describe("stackedBarHeight (forge-1a5)", () => {
    afterEach(() => __resetScaleFactor());

    it("defaults to the schema default (35) when unconfigured", () => {
      // createTreeFixture seeds DEFAULT_SETTINGS (stacked-tab-bar-height: 35).
      expect(ctx.tree.stackedBarHeight()).toBe(35);
    });

    it("reflects a configured height", () => {
      const custom = createTreeFixture({ settings: { "stacked-tab-bar-height": 50 } });
      expect(custom.tree.stackedBarHeight()).toBe(50);
      custom.cleanup();
    });

    it("scales the configured height by the DPI factor", () => {
      __setScaleFactor(2);
      const custom = createTreeFixture({ settings: { "stacked-tab-bar-height": 40 } });
      expect(custom.tree.stackedBarHeight()).toBe(80); // 40 * 2
      custom.cleanup();
    });
  });

  // forge-qy65: Shell.App.create_icon_texture(size) takes a LOGICAL icon-size that
  // St scales by scale_factor internally. Passing 24*dpi() double-scales the icon
  // (96 physical at 2x) so it overflows/distorts the dpi-scaled tab bar. The tab
  // bar height IS dpi-scaled (35*2=70), but the icon size must NOT be.
  describe("tab icon scaling (forge-qy65)", () => {
    afterEach(() => __resetScaleFactor());

    it("passes the logical icon size (24), not 24*dpi(), so St scales it once", () => {
      __setScaleFactor(2);
      // _buildTabBase is node-type agnostic (icon + title scaffold); a CON node
      // avoids the WINDOW constructor's compositor/app wiring.
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      const app = { create_icon_texture: vi.fn(() => new St.Bin()) };

      node._buildTabBase(app, "Title");

      // Before forge-qy65 this was called with 48 (24*dpi()=48), which St then
      // scaled again to 96 physical — double-scaled against the 70px bar.
      expect(app.create_icon_texture).toHaveBeenCalledWith(24);
      // Sanity: the bar the icon must fit IS dpi-scaled to 70, proving 24 is deliberate.
      expect(ctx.tree.stackedBarHeight()).toBe(70); // 35 * 2
    });

    // T1: null app must not throw — generic symbolic icon instead of create_icon_texture.
    it("tolerates a null app with a fallback icon and label", () => {
      const node = new Node(NODE_TYPES.CON, new St.Bin());
      let result;
      expect(() => {
        result = node._buildTabBase(null, "x");
      }).not.toThrow();
      expect(result.tabContents).toBeTruthy();
      expect(result.iconBin.child).toBeTruthy();
      expect(result.iconBin.child.icon_name).toBe("application-x-executable-symbolic");
      expect(result.titleButton.label).toBe("x");
    });
  });
});
