import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createMockWindow,
  createTreeFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { MotionDirection } from "../mocks/gnome/Meta.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * Host/helper: tree.move peel orientation (DnD / leftover Host path).
 * Product WindowMoveOut is command() → Mark 2 breakout.
 */
describe("LX2: tree.move tab extract split orientation (Host/helper)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({ fullExtWm: true });
  });

  afterEach(() => ctx.cleanup());

  function tabGroupOnMonitor(rect, n = 3, layout = LAYOUT_TYPES.TABBED) {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 3840, height: 2160 };

    const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    con.rect = { ...rect };

    const wins = [];
    for (let i = 0; i < n; i++) {
      const w = ctx.tree.createNode(
        con.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: i + 1 })
      );
      w.mode = WINDOW_MODES.TILE;
      wins.push(w);
    }
    return { monitor, con, wins };
  }

  it("portrait tab group peel → parent VSPLIT; group stays TABBED", () => {
    // ~2510×2864 style (taller than wide)
    const { monitor, con, wins } = tabGroupOnMonitor({
      x: 0,
      y: 0,
      width: 2510,
      height: 2864,
    });
    const [extracted, ...rest] = wins;

    vi.spyOn(ctx.tree, "next").mockReturnValue(-1);
    const ok = ctx.tree.move(extracted, MotionDirection.UP);

    expect(ok).toBe(true);
    expect(extracted.parentNode).toBe(monitor);
    expect(con.parentNode).toBe(monitor);
    expect(monitor.childNodes.length).toBe(2);
    expect(monitor.childNodes).toContain(con);
    expect(monitor.childNodes).toContain(extracted);
    // Remaining multi-member bag
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.childNodes).toEqual(rest);
    expect(monitor.layout).toBe(LAYOUT_TYPES.VSPLIT);
    expect(ctx.extWm.determineSplitLayoutForRect).toHaveBeenCalled();
  });

  it("landscape tab group peel → parent HSPLIT; group stays TABBED", () => {
    const { monitor, con, wins } = tabGroupOnMonitor({
      x: 0,
      y: 0,
      width: 3200,
      height: 1800,
    });
    // Force mon to VSPLIT first so the peel must flip it for landscape rect
    monitor.layout = LAYOUT_TYPES.VSPLIT;
    const [extracted] = wins;

    vi.spyOn(ctx.tree, "next").mockReturnValue(-1);
    const ok = ctx.tree.move(extracted, MotionDirection.RIGHT);

    expect(ok).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.childNodes.length).toBe(2);
    expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
  });

  it("STACKED portrait peel uses the same rect rule", () => {
    const { monitor, con, wins } = tabGroupOnMonitor(
      { x: 0, y: 0, width: 800, height: 1600 },
      3,
      LAYOUT_TYPES.STACKED
    );
    const [extracted] = wins;

    vi.spyOn(ctx.tree, "next").mockReturnValue(-1);
    ctx.tree.move(extracted, MotionDirection.LEFT);

    expect(con.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(con.childNodes.length).toBe(2);
    expect(monitor.layout).toBe(LAYOUT_TYPES.VSPLIT);
  });

  it("same-parent sibling swap inside TABBED does not reorient parent", () => {
    const { monitor, con, wins } = tabGroupOnMonitor({
      x: 0,
      y: 0,
      width: 600,
      height: 1200,
    });
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const [a, b] = wins;

    // Real next: adjacent tab (swap path — no _finishMove peel)
    const ok = ctx.tree.move(a, MotionDirection.RIGHT);

    expect(ok).toBe(true);
    expect(a.parentNode).toBe(con);
    expect(b.parentNode).toBe(con);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    // Parent of the bag must stay as set; swap never peels
    expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(monitor.childNodes.length).toBe(1);
    expect(monitor.childNodes[0]).toBe(con);
  });

  it("peel when mon already has another sibling does not reorient mon", () => {
    const { monitor, con, wins } = tabGroupOnMonitor({
      x: 0,
      y: 0,
      width: 600,
      height: 1200,
    });
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const other = ctx.tree.createNode(
      monitor.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 99 })
    );
    other.mode = WINDOW_MODES.TILE;
    // mon: [TABBED, other]
    expect(monitor.childNodes.length).toBe(2);

    const [extracted] = wins;
    vi.spyOn(ctx.tree, "next").mockReturnValue(-1);
    ctx.tree.move(extracted, MotionDirection.UP);

    // Three mon children — layout left alone (not a pure [group|extracted] pair)
    expect(monitor.childNodes.length).toBe(3);
    expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
  });
});
