import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TAB_DRAG_THRESHOLD_PX,
  tabStripInsertIndex,
  tabStripGapFromFloatingChip,
  tabStripInsertIndexFromGap,
  tabStripFlowLayoutWithGap,
  tabStripInsertIndex2D,
  applyTabStripReorder,
  pointerOnTabStrip,
  tabActorScreenRect,
} from "../../../lib/extension/drag-drop.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { Bin } from "../../mocks/gnome/St.js";

describe("tabStripInsertIndex (pure)", () => {
  const tabsX = [
    { x: 0, y: 0, width: 100, height: 30 },
    { x: 100, y: 0, width: 100, height: 30 },
    { x: 200, y: 0, width: 100, height: 30 },
  ];

  it("returns 0 when pointer is left of first midpoint", () => {
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: 10, axis: "x" })).toBe(0);
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: { x: 49, y: 5 }, axis: "x" })).toBe(0);
  });

  it("returns mid indices by midpoint rule", () => {
    // Mid of tab0 is 50; mid of tab1 is 150
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: 51, axis: "x" })).toBe(1);
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: 149, axis: "x" })).toBe(1);
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: 151, axis: "x" })).toBe(2);
  });

  it("returns length when past last midpoint", () => {
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: 251, axis: "x" })).toBe(3);
    expect(tabStripInsertIndex({ tabs: tabsX, pointer: [999, 0], axis: "x" })).toBe(3);
  });

  it("uses Y for STACKED axis", () => {
    const tabsY = [
      { x: 0, y: 0, width: 200, height: 40 },
      { x: 0, y: 40, width: 200, height: 40 },
      { x: 0, y: 80, width: 200, height: 40 },
    ];
    expect(tabStripInsertIndex({ tabs: tabsY, pointer: { x: 10, y: 10 }, axis: "y" })).toBe(0);
    expect(tabStripInsertIndex({ tabs: tabsY, pointer: { x: 10, y: 50 }, axis: "y" })).toBe(1);
    expect(tabStripInsertIndex({ tabs: tabsY, pointer: { x: 10, y: 110 }, axis: "y" })).toBe(3);
  });

  it("accepts start/end segments", () => {
    const segs = [
      { start: 0, end: 50 },
      { start: 50, end: 100 },
    ];
    expect(tabStripInsertIndex({ tabs: segs, pointer: 10, axis: "x" })).toBe(0);
    expect(tabStripInsertIndex({ tabs: segs, pointer: 60, axis: "x" })).toBe(1);
    expect(tabStripInsertIndex({ tabs: segs, pointer: 90, axis: "x" })).toBe(2);
  });

  it("empty tabs → 0", () => {
    expect(tabStripInsertIndex({ tabs: [], pointer: 0, axis: "x" })).toBe(0);
  });
});

describe("applyTabStripReorder (pure)", () => {
  it("moves item forward and backward with insert-before semantics", () => {
    const kids = ["a", "b", "c"];
    // drag a to before end (insertIndex 3) → b,c,a
    expect(applyTabStripReorder(kids, 0, 3)).toEqual(["b", "c", "a"]);
    // drag c to start (insertIndex 0) → c,a,b
    expect(applyTabStripReorder(kids, 2, 0)).toEqual(["c", "a", "b"]);
    // drag b to before c (insertIndex 2) — already there after remove adjust
    expect(applyTabStripReorder(kids, 1, 2)).toEqual(["a", "b", "c"]);
    // drag b past c (insertIndex 3) → a,c,b
    expect(applyTabStripReorder(kids, 1, 3)).toEqual(["a", "c", "b"]);
  });

  it("no-ops on bad fromIndex", () => {
    expect(applyTabStripReorder(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(applyTabStripReorder(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("tabStripGapFromFloatingChip (pure)", () => {
  // Remaining A,C with gap reserved at home of B (100–180 chip).
  const flowHome = [
    { x: 0, y: 0, width: 100, height: 30 },
    { x: 180, y: 0, width: 100, height: 30 },
  ];
  // After slide: gap after C
  const flowAfterC = [
    { x: 0, y: 0, width: 100, height: 30 },
    { x: 100, y: 0, width: 100, height: 30 },
  ];

  it("home: leading before C center → gap between A and C", () => {
    // Chip over B home; right edge 180, C center 230
    const chip = { x: 100, y: 0, width: 80, height: 30 };
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        axis: "x",
        dragDirection: 1,
      }).index
    ).toBe(1);
  });

  it("leading right edge past C center → gap after all", () => {
    const chip = { x: 200, y: 0, width: 80, height: 30 }; // leading 280
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        axis: "x",
        dragDirection: 1,
      }).index
    ).toBe(2);
  });

  it("leading left edge before A center → gap at start", () => {
    const chip = { x: 0, y: 0, width: 80, height: 30 }; // leading 0 when dir -1
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowAfterC,
        chip,
        axis: "x",
        dragDirection: -1,
      }).index
    ).toBe(0);
  });

  it("direction flip uses min edge when moving left", () => {
    // Chip straddling C; left edge at 140, C center 150 → still before C
    const chip = { x: 140, y: 0, width: 80, height: 30 };
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowAfterC,
        chip,
        axis: "x",
        dragDirection: -1,
      }).index
    ).toBe(1);
    // Left edge past C center (151) → after C
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowAfterC,
        chip: { x: 151, y: 0, width: 80, height: 30 },
        axis: "x",
        dragDirection: -1,
      }).index
    ).toBe(2);
  });

  it("STACKED Y axis", () => {
    const tabsY = [
      { x: 0, y: 40, width: 200, height: 40 },
      { x: 0, y: 80, width: 200, height: 40 },
    ];
    // Drag first tab down; chip bottom past last center (100)
    expect(
      tabStripGapFromFloatingChip({
        tabs: tabsY,
        chip: { x: 0, y: 70, width: 200, height: 40 },
        axis: "y",
        dragDirection: 1,
      }).index
    ).toBe(2);
  });

  it("skips marked skip tabs and empty → 0", () => {
    expect(
      tabStripGapFromFloatingChip({
        tabs: [{ skip: true, x: 0, y: 0, width: 50, height: 20 }],
        chip: { x: 0, y: 0, width: 40, height: 20 },
        axis: "x",
        dragDirection: 1,
      }).index
    ).toBe(0);
    expect(tabStripGapFromFloatingChip({ tabs: [], chip: null }).index).toBe(0);
  });

  it("chip width only affects leading edge (gap size is layout input)", () => {
    const tabs = [
      { x: 0, y: 0, width: 100, height: 30 },
      { x: 200, y: 0, width: 100, height: 30 },
    ];
    // Narrow chip still crosses second center when right edge does
    expect(
      tabStripGapFromFloatingChip({
        tabs,
        chip: { x: 160, y: 0, width: 50, height: 30 },
        axis: "x",
        dragDirection: 1,
      }).index
    ).toBe(1);
    expect(
      tabStripGapFromFloatingChip({
        tabs,
        chip: { x: 160, y: 0, width: 100, height: 30 },
        axis: "x",
        dragDirection: 1,
      }).index
    ).toBe(2);
  });
});

describe("tabStripInsertIndexFromGap + applyTabStripReorder", () => {
  it("maps remaining gap + fromIndex for drag B in [A,B,C]", () => {
    const kids = ["a", "b", "c"];
    const from = 1;
    // gap 0 → before A
    expect(tabStripInsertIndexFromGap(from, 0)).toBe(0);
    expect(applyTabStripReorder(kids, from, 0)).toEqual(["b", "a", "c"]);
    // gap 1 → between A and C (home)
    expect(tabStripInsertIndexFromGap(from, 1)).toBe(2);
    expect(applyTabStripReorder(kids, from, 2)).toEqual(["a", "b", "c"]);
    // gap 2 → after C
    expect(tabStripInsertIndexFromGap(from, 2)).toBe(3);
    expect(applyTabStripReorder(kids, from, 3)).toEqual(["a", "c", "b"]);
  });

  it("maps drag A (from 0) to end", () => {
    expect(tabStripInsertIndexFromGap(0, 2)).toBe(3);
    expect(applyTabStripReorder(["a", "b", "c"], 0, 3)).toEqual(["b", "c", "a"]);
  });
});

describe("tabStripFlowLayoutWithGap (pure)", () => {
  it("inserts chip-sized hole at gapIndex", () => {
    const segs = tabStripFlowLayoutWithGap({
      sizes: [100, 100],
      gapIndex: 1,
      chipSize: 80,
      origin: 0,
    });
    expect(segs).toEqual([
      { start: 0, end: 100 },
      { start: 180, end: 280 },
    ]);
    const end = tabStripFlowLayoutWithGap({
      sizes: [100, 100],
      gapIndex: 2,
      chipSize: 80,
      origin: 10,
    });
    expect(end).toEqual([
      { start: 10, end: 110 },
      { start: 110, end: 210 },
    ]);
  });
});

describe("pointerOnTabStrip (pure)", () => {
  const tabs = [
    { x: 10, y: 20, width: 80, height: 30 },
    { x: 90, y: 20, width: 80, height: 30 },
  ];

  it("true inside union (including gap between tabs)", () => {
    expect(pointerOnTabStrip({ tabs, pointer: [50, 30], pad: 0 })).toBe(true);
    expect(pointerOnTabStrip({ tabs, pointer: { x: 85, y: 25 }, pad: 0 })).toBe(true);
  });

  it("false outside union beyond pad", () => {
    expect(pointerOnTabStrip({ tabs, pointer: [5, 30], pad: 0 })).toBe(false);
    expect(pointerOnTabStrip({ tabs, pointer: [50, 100], pad: 0 })).toBe(false);
  });

  it("honors pad", () => {
    expect(pointerOnTabStrip({ tabs, pointer: [8, 30], pad: 4 })).toBe(true);
  });

  it("multi-row AABB keeps inter-row Y on-strip", () => {
    const multi = [
      { x: 0, y: 100, width: 100, height: 30 },
      { x: 100, y: 100, width: 100, height: 30 },
      { x: 0, y: 130, width: 100, height: 30 },
    ];
    // Between rows (y=125) stays inside union — peel only south of union.
    expect(pointerOnTabStrip({ tabs: multi, pointer: [50, 125], pad: 0 })).toBe(true);
    expect(pointerOnTabStrip({ tabs: multi, pointer: [50, 170], pad: 0 })).toBe(false);
  });
});

describe("tabStripInsertIndex2D (pure)", () => {
  // Two equal-fill rows: [A B C] / [D E] — child list 0..4
  const twoRows = [
    { x: 0, y: 40, width: 100, height: 30 },
    { x: 100, y: 40, width: 100, height: 30 },
    { x: 200, y: 40, width: 100, height: 30 },
    { x: 0, y: 70, width: 100, height: 30 },
    { x: 100, y: 70, width: 100, height: 30 },
  ];
  const chipOn = (x, y, w = 80, h = 30) => ({ x, y, width: w, height: h });

  it("two rows: chip on row 2 inserts among row-2 slots", () => {
    // Leading past D center (50) before E center (150) → between D and E → index 4
    expect(
      tabStripInsertIndex2D({
        tabs: twoRows,
        pointer: { x: 100, y: 85 },
        chip: chipOn(50, 70), // leading 130
        dragDirection: 1,
      }).index
    ).toBe(4);
    // Leading past E center → after last → index 5
    expect(
      tabStripInsertIndex2D({
        tabs: twoRows,
        pointer: { x: 200, y: 85 },
        chip: chipOn(160, 70), // leading 240
        dragDirection: 1,
      }).index
    ).toBe(5);
  });

  it("between rows picks nearest row by Y", () => {
    // South of strip → nearer row2; leading before D center → index 3
    const between = tabStripInsertIndex2D({
      tabs: twoRows,
      pointer: { x: 20, y: 100 },
      chip: chipOn(0, 90, 40), // leading 40 < D center 50
      dragDirection: 1,
    });
    expect(between.index).toBe(3);

    const nearerRow1 = tabStripInsertIndex2D({
      tabs: twoRows,
      pointer: { x: 50, y: 20 }, // above strip → nearest row1
      chip: chipOn(0, 10, 40), // leading 40 < A center 50
      dragDirection: 1,
    });
    expect(nearerRow1.index).toBe(0);
  });

  it("after last of row1 vs before first of row2 share child-list index", () => {
    // After C on row1: leading past C center (250) → rowLocal 3 → global 3
    const afterRow1 = tabStripInsertIndex2D({
      tabs: twoRows,
      pointer: { x: 280, y: 55 },
      chip: chipOn(250, 40),
      dragDirection: 1,
    });
    expect(afterRow1.index).toBe(3);

    // Before D on row2: leading before D center → rowLocal 0 → global 3
    const beforeRow2 = tabStripInsertIndex2D({
      tabs: twoRows,
      pointer: { x: 10, y: 85 },
      chip: chipOn(-40, 70),
      dragDirection: -1,
    });
    expect(beforeRow2.index).toBe(3);
  });

  it("centerline crosses mid-sibling on a row", () => {
    // On row1, leading past A center (50) before B center (150) → index 1
    expect(
      tabStripInsertIndex2D({
        tabs: twoRows,
        pointer: { x: 100, y: 50 },
        chip: chipOn(60, 40),
        dragDirection: 1,
      }).index
    ).toBe(1);
  });

  it("missing-tab placeholder stays on sibling Y band", () => {
    // Drag B (index 1): null placeholder inherits row1 Y from A
    const tabs = [twoRows[0], null, twoRows[2], twoRows[3], twoRows[4]];
    // Chip on row2 between D and E → global 4 (same as full strip)
    expect(
      tabStripInsertIndex2D({
        tabs,
        pointer: { x: 100, y: 85 },
        chip: chipOn(50, 70),
        dragDirection: 1,
      }).index
    ).toBe(4);
  });

  it("first missing inherits next real sibling Y (not y:0)", () => {
    // Strip far below stage top (tab-position bottom style)
    const low = [
      null, // dragged first tab
      { x: 100, y: 400, width: 100, height: 30 },
      { x: 200, y: 400, width: 100, height: 30 },
    ];
    // Pointer near y=400 band → row of inherited placeholders, not y=0
    const idx = tabStripInsertIndex2D({
      tabs: low,
      pointer: { x: 250, y: 410 },
      chip: chipOn(220, 400),
      dragDirection: 1,
    }).index;
    // After last real on that row → 3
    expect(idx).toBe(3);

    // With only missing + decoration (no real next): use deco Y
    const onlyMissing = [null, null];
    const deco = { x: 0, y: 500, width: 300, height: 30 };
    expect(
      tabStripInsertIndex2D({
        tabs: onlyMissing,
        pointer: { x: 10, y: 510 },
        chip: chipOn(0, 500),
        dragDirection: 1,
        decoration: deco,
      }).index
    ).toBe(0);
  });

  it("empty tabs → 0", () => {
    expect(tabStripInsertIndex2D({ tabs: [], pointer: { x: 0, y: 0 } }).index).toBe(0);
  });
});

describe("STACKED path does not use tabStripInsertIndex2D", () => {
  it("STACKED Y column uses tabStripGapFromFloatingChip only (pure contract)", () => {
    // Document: STACKED reorder is Y chip gap — 2D would mis-bucket a column as rows.
    const stacked = [
      { x: 0, y: 0, width: 200, height: 40 },
      { x: 0, y: 40, width: 200, height: 40 },
      { x: 0, y: 80, width: 200, height: 40 },
    ];
    const chip = { x: 0, y: 70, width: 200, height: 40 };
    const gap = tabStripGapFromFloatingChip({
      tabs: stacked.slice(1), // remaining after dragging first
      chip,
      axis: "y",
      dragDirection: 1,
    }).index;
    // 2D on a column would treat each band as its own row and gap on X — different.
    const wrong2d = tabStripInsertIndex2D({
      tabs: [null, stacked[1], stacked[2]],
      pointer: { x: 10, y: 100 },
      chip,
      dragDirection: 1,
    }).index;
    // Contract: product STACKED path uses gap Y, not 2D. Values may differ.
    expect(gap).toBe(2);
    expect(typeof wrong2d).toBe("number");
    // Gesture suite below proves DragDropManager STACKED never needs 2D for correct order.
  });
});

describe("tabActorScreenRect", () => {
  it("reads x/y/width/height when no transform APIs", () => {
    expect(tabActorScreenRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });

  it("prefers get_transformed_position/size", () => {
    const actor = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      get_transformed_position: () => [10, 20],
      get_transformed_size: () => [30, 40],
    };
    expect(tabActorScreenRect(actor)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("null for missing or zero-size", () => {
    expect(tabActorScreenRect(null)).toBeNull();
    expect(tabActorScreenRect({ x: 0, y: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe("DragDropManager strip reorder", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "preview-hint-enabled": false,
        "dnd-center-layout": "TABBED",
      },
    });
  });

  const wm = () => ctx.windowManager;
  const dd = () => wm().dragDrop;

  function makePressEvent(x, y) {
    return {
      get_coords: () => [x, y],
      get_button: () => 1,
      get_time: () => 1,
      get_device: () => null,
    };
  }

  function makeTabActor(x, y, width, height) {
    return {
      x,
      y,
      width,
      height,
      x_expand: true,
      y_expand: false,
      translation_x: 0,
      translation_y: 0,
      style_class: "",
      _parent: null,
      children: [],
      add_style_class_name(name) {
        if (!this.style_class.includes(name)) this.style_class += ` ${name}`;
      },
      remove_style_class_name(name) {
        this.style_class = this.style_class.replace(name, "").trim();
      },
      get_parent() {
        return this._parent;
      },
      set_width(w) {
        this.width = w;
      },
      set_height(h) {
        this.height = h;
      },
      set_position(px, py) {
        this.x = px;
        this.y = py;
      },
      remove_all_transitions() {},
      ease(params = {}) {
        for (const [k, v] of Object.entries(params)) {
          if (k === "duration" || k === "mode" || k === "onComplete") continue;
          this[k] = v;
        }
        params.onComplete?.();
      },
      add_child(child) {
        if (!child) return;
        if (!this.children.includes(child)) this.children.push(child);
        child._parent = this;
      },
      remove_child(child) {
        const i = this.children.indexOf(child);
        if (i !== -1) this.children.splice(i, 1);
        if (child && child._parent === this) child._parent = null;
      },
      contains(child) {
        return this.children.includes(child);
      },
      get_children() {
        return this.children;
      },
      insert_child_at_index(child, index) {
        if (!child) return;
        if (child._parent && child._parent !== this) {
          child._parent.remove_child?.(child);
        }
        const i = this.children.indexOf(child);
        if (i !== -1) this.children.splice(i, 1);
        this.children.splice(Math.max(0, index), 0, child);
        child._parent = this;
      },
    };
  }

  function makeTabbedTrio() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    // CON group so monitor layout stays HSPLIT default; children are tabbed.
    const groupBin = new Bin();
    const group = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    group.layout = LAYOUT_TYPES.TABBED;
    group.rect = { x: 0, y: 0, width: 900, height: 600 };
    // Strip host for reparent/spacer (Chrome float lifecycle).
    const deco = makeTabActor(0, 0, 300, 30);
    group.decoration = deco;

    const nodes = [];
    for (let i = 0; i < 3; i++) {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 0, y: 40, width: 900, height: 560 }),
        workspace: ctx.workspaces[0],
        id: `tab-win-${i}`,
      });
      // Avoid Mutter grab path so synthetic vs reorder is explicit.
      delete meta.begin_grab_op;
      const node = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, meta);
      node.mode = WINDOW_MODES.TILE;
      node.percent = 0.2 + i * 0.1;
      node.tab = makeTabActor(i * 100, 0, 100, 30);
      deco.add_child(node.tab);
      nodes.push({ node, meta });
    }
    group.lastTabFocus = nodes[1].meta;
    return { group, nodes };
  }

  it("drag along strip reorders via replaceChildren; layout and percents stay", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    expect(group.childNodes.map((n) => n)).toEqual([a.node, b.node, c.node]);

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    const commit = vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    // Press on middle tab center (x=150)
    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(b.node.tab.style_class).toContain("window-tabbed-tab-pressed");
    // Travel right past threshold, still on strip → REORDER float+gap
    const status = dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15);
    expect(status).toBe("reorder");
    expect(b.node.mode).toBe(WINDOW_MODES.TILE);
    expect(wm()._draggedNodeWindow).toBeFalsy();
    expect(b.node.tab.style_class).toContain("window-tabbed-tab-dragging");
    // Outline-on-neighbor is not the live cue
    expect(a.node.tab.style_class).not.toContain("window-tabbed-tab-reorder-insert");
    expect(c.node.tab.style_class).not.toContain("window-tabbed-tab-reorder-insert");

    // Chip leading edge past C center → gap after C → insertIndex 3
    expect(dd().noteTabDragMotion(280, 15)).toBe("reorder");
    dd().finishTabDragRelease();

    expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(group.childNodes.map((n) => n)).toEqual([a.node, c.node, b.node]);
    expect(a.node.percent).toBeCloseTo(0.2);
    expect(b.node.percent).toBeCloseTo(0.3);
    expect(c.node.percent).toBeCloseTo(0.4);
    expect(group.lastTabFocus).toBe(b.meta);
    expect(commit).toHaveBeenCalledWith("tab-strip-reorder", { force: true });
    expect(dd()._tabDrag).toBeNull();
    expect(b.node.tab.style_class).not.toContain("window-tabbed-tab-pressed");
  });

  it("short click on strip does not reorder or grab", () => {
    const { group, nodes } = makeTabbedTrio();
    const order = [...group.childNodes];
    dd().armTabDrag(nodes[0].meta, makePressEvent(20, 15));
    expect(nodes[0].node.tab.style_class).toContain("window-tabbed-tab-pressed");
    expect(dd().noteTabDragMotion(24, 15)).toBe("armed");
    dd().finishTabDragRelease();
    expect(group.childNodes).toEqual(order);
    expect(nodes[0].node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
    expect(nodes[0].node.tab.style_class).not.toContain("window-tabbed-tab-pressed");
  });

  it("pointer leaving strip starts grab-tile once", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");

    // Leave strip vertically (tabs at y=0..30)
    const status = dd().noteTabDragMotion(150, 200);
    expect(status).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(wm()._draggedNodeWindow).toBe(b.node);

    // Further motion stays grab, does not re-enter reorder
    expect(dd().noteTabDragMotion(160, 220)).toBe("active");

    setPointer(300, 300);
    dd().finishTabDragRelease();
    expect(dd()._tabDrag).toBeNull();
  });

  it("STACKED group uses Y axis for reorder", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const groupBin = new Bin();
    const group = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    group.layout = LAYOUT_TYPES.STACKED;
    const deco = makeTabActor(0, 0, 200, 120);
    group.decoration = deco;

    const nodes = [];
    for (let i = 0; i < 3; i++) {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
        workspace: ctx.workspaces[0],
        id: `stack-win-${i}`,
      });
      delete meta.begin_grab_op;
      const node = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, meta);
      node.mode = WINDOW_MODES.TILE;
      node.tab = makeTabActor(0, i * 40, 200, 40);
      deco.add_child(node.tab);
      nodes.push({ node, meta });
    }

    const [a, b, c] = nodes;
    ctx.display.get_focus_window = vi.fn(() => a.meta);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    // Press top tab; drag down past last centerline
    dd().armTabDrag(a.meta, makePressEvent(20, 10));
    expect(dd().noteTabDragMotion(20, 10 + TAB_DRAG_THRESHOLD_PX + 2)).toBe("reorder");
    expect(dd().noteTabDragMotion(20, 110)).toBe("reorder");
    dd().finishTabDragRelease();

    expect(group.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(group.childNodes.map((n) => n)).toEqual([b.node, c.node, a.node]);
  });

  it("CON-rep tab reorders the CON unit, not an inner leaf", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const groupBin = new Bin();
    const group = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    group.layout = LAYOUT_TYPES.TABBED;

    const metaA = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
      id: "con-tab-a",
    });
    delete metaA.begin_grab_op;
    const winA = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, metaA);
    winA.mode = WINDOW_MODES.TILE;
    winA.tab = makeTabActor(0, 0, 100, 30);

    const conBin = new Bin();
    const conB = ctx.tree.createNode(groupBin, NODE_TYPES.CON, conBin);
    conB.layout = LAYOUT_TYPES.HSPLIT;
    conB.tab = makeTabActor(100, 0, 100, 30);
    const metaB = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 200, height: 400 }),
      workspace: ctx.workspaces[0],
      id: "con-tab-b-inner",
    });
    delete metaB.begin_grab_op;
    const winB = ctx.tree.createNode(conBin, NODE_TYPES.WINDOW, metaB);
    winB.mode = WINDOW_MODES.TILE;

    const metaC = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
      id: "con-tab-c",
    });
    delete metaC.begin_grab_op;
    const winC = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, metaC);
    winC.mode = WINDOW_MODES.TILE;
    winC.tab = makeTabActor(200, 0, 100, 30);

    ctx.display.get_focus_window = vi.fn(() => metaB);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    // Arm with rep window of CON B; drag to end of strip
    dd().armTabDrag(metaB, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(280, 15)).toBe("reorder");
    dd().finishTabDragRelease();

    expect(group.childNodes.map((n) => n)).toEqual([winA, winC, conB]);
    expect(conB.childNodes[0]).toBe(winB);
  });
});
