import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree-types.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";

/**
 * Host/helper: Tree.ungroup / Tree.group. Product ungroup/merge use command().
 */
describe("ungroup I2 — explicit dissolve (Host/helper)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
        "auto-exit-tabbed": true,
        "dnd-center-layout": "tabbed",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const tree = () => ctx.windowManager.tree;
  const wm = () => ctx.windowManager;

  function twoWindowTabbed() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    con.percent = 0.6;
    con.userSized = true;
    const w1 = createMockWindow({ id: 101, wm_class: "A" });
    const w2 = createMockWindow({ id: 102, wm_class: "B" });
    const n1 = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;
    return { monitor, con, n1, n2, w1, w2 };
  }

  function nestedGroup() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    const w1 = createMockWindow({ id: 201, wm_class: "A" });
    const n1 = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const inner = tree().createNode(con.nodeValue, NODE_TYPES.CON, new Bin());
    inner.layout = LAYOUT_TYPES.VSPLIT;
    const w2 = createMockWindow({ id: 202, wm_class: "B" });
    const w3 = createMockWindow({ id: 203, wm_class: "C" });
    const n2 = tree().createNode(inner.nodeValue, NODE_TYPES.WINDOW, w2);
    const n3 = tree().createNode(inner.nodeValue, NODE_TYPES.WINDOW, w3);
    const w4 = createMockWindow({ id: 204, wm_class: "D" });
    const n4 = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w4);
    for (const n of [n1, n2, n3, n4]) n.mode = WINDOW_MODES.TILE;
    return { monitor, con, inner, n1, n2, n3, n4 };
  }

  it("dissolves a CON and preserves child identity order", () => {
    const { monitor, con, n1, n2 } = twoWindowTabbed();
    const sibling = tree().createNode(
      monitor.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 199 })
    );
    sibling.mode = WINDOW_MODES.TILE;

    const parent = tree().ungroup(con);
    seedLiveForest(wm()); // Host/helper ungroup; reproject for Forest asserts

    expect(parent).toBe(monitor);
    expect(parentOf(wm(), con)).toBeNull();
    expect(kidsOf(wm(), monitor)).toEqual([n1, n2, sibling]);
    expect(parentOf(wm(), n1)).toBe(monitor);
    expect(parentOf(wm(), n2)).toBe(monitor);
    expect(n1.percent).toBeCloseTo(0.3, 5);
    expect(n2.percent).toBeCloseTo(0.3, 5);
    expect(n1.userSized).toBe(true);
    expect(n2.userSized).toBe(true);
  });

  it("WINDOW argument ungroups the parent CON", () => {
    const { monitor, con, n1, n2 } = twoWindowTabbed();

    expect(tree().ungroup(n1)).toBe(monitor);
    seedLiveForest(wm());
    expect(parentOf(wm(), con)).toBeNull();
    expect(kidsOf(wm(), monitor)).toEqual([n1, n2]);
  });

  it("does not recursively flatten nested CON children", () => {
    const { monitor, con, inner, n1, n2, n3, n4 } = nestedGroup();

    expect(tree().ungroup(con)).toBe(monitor);
    seedLiveForest(wm());
    expect(kidsOf(wm(), monitor)).toEqual([n1, inner, n4]);
    expect(parentOf(wm(), inner)).toBe(monitor);
    expect(inner.layout).toBe(LAYOUT_TYPES.VSPLIT);
    expect(kidsOf(wm(), inner)).toEqual([n2, n3]);
    expect(parentOf(wm(), n2)).toBe(inner);
    expect(parentOf(wm(), n3)).toBe(inner);
  });

  it("no-ops MONITOR and ROOT (does not peel windows off mon)", () => {
    const { monitor, con, n1, n2 } = twoWindowTabbed();
    const before = kidsOf(wm(), monitor);

    expect(tree().ungroup(monitor)).toBeNull();
    expect(tree().ungroup(tree())).toBeNull();
    expect(kidsOf(wm(), monitor)).toEqual(before);
    expect(parentOf(wm(), n1)).toBe(con);
    expect(parentOf(wm(), n2)).toBe(con);
  });

  it("WINDOW on MONITOR is a no-op (no CON to dissolve)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const leaf = tree().createNode(
      monitor.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 301 })
    );
    leaf.mode = WINDOW_MODES.TILE;

    expect(tree().ungroup(leaf)).toBeNull();
    expect(parentOf(wm(), leaf)).toBe(monitor);
    expect(kidsOf(wm(), monitor)).toContain(leaf);
  });

  it("mode-only setLayout still does not flatten (I1)", () => {
    const { con, inner, n1, n4 } = nestedGroup();
    const before = kidsOf(wm(), con);

    expect(tree().setLayout(con, LAYOUT_TYPES.HSPLIT)).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(kidsOf(wm(), con)).toEqual(before);
    expect(parentOf(wm(), inner)).toBe(con);
    expect(parentOf(wm(), n1)).toBe(con);
    expect(parentOf(wm(), n4)).toBe(con);
  });

  it("auto-exit-tabbed is single-child chrome exit, not multi-child ungroup", () => {
    const { monitor, con, n1, n2 } = twoWindowTabbed();

    tree().removeNode(n2);
    seedLiveForest(wm());

    expect(parentOf(wm(), con)).toBe(monitor);
    expect(kidsOf(wm(), con)).toEqual([n1]);
    expect(parentOf(wm(), n1)).toBe(con);
    expect(con.layout).not.toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), monitor)).toContain(con);
    expect(kidsOf(wm(), monitor)).not.toContain(n1);
  });

  it("group() wraps via mergeWindowsIntoGroup (default TABBED)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const wrap = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.HSPLIT;
    const n1 = tree().createNode(wrap.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 401 }));
    const n2 = tree().createNode(wrap.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 402 }));
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;

    const group = tree().group(n1, n2);
    expect(group).toBe(wrap);
    expect(wrap.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), wrap)).toEqual([n1, n2]);
  });

  it("group() uses STACKED when stacked mode + dnd-center-layout stacked", () => {
    ctx.settings.set_string("dnd-center-layout", "stacked");
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const wrap = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.HSPLIT;
    const n1 = tree().createNode(wrap.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 411 }));
    const n2 = tree().createNode(wrap.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 412 }));
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;

    const group = tree().group(n1, n2);
    expect(group.layout).toBe(LAYOUT_TYPES.STACKED);
  });

  it("session ungroup dissolves CON; layout-cycle still does not flatten", () => {
    const { con, inner, n1 } = nestedGroup();
    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });

    const cycled = api._layoutCycleOp("group", "id:201", { quiet: true });
    expect(cycled.ok).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(parentOf(wm(), inner)).toBe(con);

    const out = api._ungroupOp("id:201", { quiet: true });
    seedLiveForest(wm()); // Host/helper ungroup; reproject for Forest asserts
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    expect(parentOf(wm(), n1)).not.toBe(con);
    expect(parentOf(wm(), inner)).toBe(parentOf(wm(), n1));
    expect(kidsOf(wm(), inner)).toHaveLength(2);
  });
});
