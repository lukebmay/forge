import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LAYOUT_TYPES, Node, NODE_TYPES } from "../../lib/extension/tree.js";
import { createWindowManagerFixture } from "../mocks/helpers/index.js";
import St from "../mocks/gnome/St.js";

/**
 * W1 (forge-wayland-live): computeSizes mixed absolute + zero percent.
 *
 * Sole sibling often keeps percent=1 after map; a late-tiled sibling stays at
 * percent=0. Old math used absolute percent when >0 else 1/n without
 * renormalizing → sum >1 → remainder fold → width 0 or negative.
 */
describe("W1: computeSizes mixed percent [1, 0]", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("parent 2510px, children percent [1, 0] → both sizes > 0 and sum exact", () => {
    const container = new Node(NODE_TYPES.CON, new St.Bin());
    container.layout = LAYOUT_TYPES.HSPLIT;
    container.rect = { x: 0, y: 0, width: 2510, height: 1400 };

    const child1 = new Node(NODE_TYPES.CON, new St.Bin());
    child1.percent = 1.0;

    const child2 = new Node(NODE_TYPES.CON, new St.Bin());
    child2.percent = 0;

    const sizes = ctx.tree.computeSizes(container, [child1, child2]);

    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeGreaterThan(0);
    expect(sizes[1]).toBeGreaterThan(0);
    expect(sizes[0] + sizes[1]).toBe(2510);
  });

  it("never emits negative sizes for mixed weights", () => {
    const container = new Node(NODE_TYPES.CON, new St.Bin());
    container.layout = LAYOUT_TYPES.HSPLIT;
    container.rect = { x: 0, y: 0, width: 1000, height: 500 };

    const a = new Node(NODE_TYPES.CON, new St.Bin());
    a.percent = 1.0;
    const b = new Node(NODE_TYPES.CON, new St.Bin());
    b.percent = 0;
    const c = new Node(NODE_TYPES.CON, new St.Bin());
    c.percent = 0;

    const sizes = ctx.tree.computeSizes(container, [a, b, c]);
    expect(sizes.every((s) => s >= 0)).toBe(true);
    expect(sizes.reduce((x, y) => x + y, 0)).toBe(1000);
  });
});
