import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TAB_DRAG_THRESHOLD_PX,
  tabStripInsertIndex,
  tabStripGapFromFloatingChip,
  tabStripInsertIndexFromGap,
  tabStripFlowLayoutWithGap,
  tabStripEqualFillSizesWithGap,
  tabStripInsertIndex2D,
  applyTabStripReorder,
  pointerOnTabStrip,
  chipIntersectsTabStrip,
  tabActorScreenRect,
  foreignStripInsertIndex,
  findForeignTabStripAtPointer,
  findTabStripIntersectingChip,
} from "../../../lib/extension/drag-drop.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
  parentOf,
  kidsOf,
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
  // Remaining A (center 50), C (center 230). Chip size is layout-only.
  const flowHome = [
    { x: 0, y: 0, width: 100, height: 30 },
    { x: 180, y: 0, width: 100, height: 30 },
  ];
  const chip = { x: 100, y: 0, width: 80, height: 30 };

  it("index 0: pointer left of first sibling center", () => {
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        pointer: { x: 49, y: 15 },
        axis: "x",
      }).index
    ).toBe(0);
  });

  it("mid: pointer past first center, before last", () => {
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        pointer: { x: 51, y: 15 },
        axis: "x",
      }).index
    ).toBe(1);
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        pointer: { x: 229, y: 15 },
        axis: "x",
      }).index
    ).toBe(1);
  });

  it("end: pointer past last sibling center", () => {
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip,
        pointer: { x: 231, y: 15 },
        axis: "x",
      }).index
    ).toBe(2);
  });

  it("direction does not change pointer×center index", () => {
    const opts = {
      tabs: flowHome,
      chip,
      pointer: { x: 51, y: 15 },
      axis: "x",
    };
    expect(tabStripGapFromFloatingChip({ ...opts, dragDirection: 1 }).index).toBe(1);
    expect(tabStripGapFromFloatingChip({ ...opts, dragDirection: -1 }).index).toBe(1);
  });

  it("STACKED Y: pointer past last center → end", () => {
    const tabsY = [
      { x: 0, y: 40, width: 200, height: 40 },
      { x: 0, y: 80, width: 200, height: 40 },
    ];
    expect(
      tabStripGapFromFloatingChip({
        tabs: tabsY,
        chip: { x: 0, y: 70, width: 200, height: 40 },
        pointer: { x: 10, y: 101 },
        axis: "y",
        dragDirection: 1,
      }).index
    ).toBe(2);
    expect(
      tabStripGapFromFloatingChip({
        tabs: tabsY,
        chip: { x: 0, y: 70, width: 200, height: 40 },
        pointer: { x: 10, y: 59 },
        axis: "y",
      }).index
    ).toBe(0);
  });

  it("skips marked skip tabs and empty → 0", () => {
    expect(
      tabStripGapFromFloatingChip({
        tabs: [{ skip: true, x: 0, y: 0, width: 50, height: 20 }],
        chip: { x: 0, y: 0, width: 40, height: 20 },
        pointer: { x: 10, y: 10 },
        axis: "x",
      }).index
    ).toBe(0);
    expect(tabStripGapFromFloatingChip({ tabs: [], chip: null }).index).toBe(0);
  });

  it("chip-only fallback uses chip center (index 0 reachable)", () => {
    // Center 40 < A 50 → 0. Old leading-edge (80) would have been 1.
    expect(
      tabStripGapFromFloatingChip({
        tabs: flowHome,
        chip: { x: 0, y: 0, width: 80, height: 30 },
        axis: "x",
      }).index
    ).toBe(0);
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

describe("tabStripEqualFillSizesWithGap (pure)", () => {
  it("equal-fills remaining with chip reserved; sum + chip = available", () => {
    // 3 equal homes of 100; drag one → chip 80; remaining share 220.
    const sizes = tabStripEqualFillSizesWithGap({
      count: 2,
      available: 300,
      chipSize: 80,
    });
    expect(sizes).toHaveLength(2);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(220);
    expect(sizes[0] + sizes[1] + 80).toBe(300);
    // Remainder pixels go to the leading slots.
    expect(sizes).toEqual([110, 110]);
  });

  it("distributes remainder pixels across first slots", () => {
    expect(tabStripEqualFillSizesWithGap({ count: 3, available: 100, chipSize: 10 })).toEqual([
      30, 30, 30,
    ]);
    expect(tabStripEqualFillSizesWithGap({ count: 3, available: 101, chipSize: 10 })).toEqual([
      31, 30, 30,
    ]);
  });

  it("no gap → full equal-fill; empty count → []", () => {
    expect(tabStripEqualFillSizesWithGap({ count: 2, available: 200, chipSize: 0 })).toEqual([
      100, 100,
    ]);
    expect(tabStripEqualFillSizesWithGap({ count: 0, available: 200, chipSize: 40 })).toEqual([]);
  });

  it("chip larger than available → zero remaining sizes", () => {
    expect(tabStripEqualFillSizesWithGap({ count: 2, available: 50, chipSize: 80 })).toEqual([
      0, 0,
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

describe("chipIntersectsTabStrip (pure)", () => {
  const strip = [{ x: 0, y: 0, width: 300, height: 30 }];

  it("true when any part of the chip overlaps the band", () => {
    expect(
      chipIntersectsTabStrip({
        chip: { x: 10, y: 20, width: 80, height: 30 },
        tabs: strip,
        pad: 0,
      })
    ).toBe(true);
    // Pointer is south of the bar; chip still overlaps.
    expect(
      chipIntersectsTabStrip({
        chip: { x: 10, y: 20, width: 80, height: 30 },
        tabs: strip,
        pad: 4,
      })
    ).toBe(true);
  });

  it("false when chip is fully off the band", () => {
    expect(
      chipIntersectsTabStrip({
        chip: { x: 10, y: 80, width: 80, height: 30 },
        tabs: strip,
        pad: 4,
      })
    ).toBe(false);
  });
});

describe("findTabStripIntersectingChip (pure)", () => {
  const groupA = { id: "A" };
  const groupB = { id: "B" };
  const strips = [
    { group: groupA, rects: [{ x: 0, y: 0, width: 300, height: 30 }] },
    { group: groupB, rects: [{ x: 400, y: 0, width: 300, height: 30 }] },
  ];

  it("hits dest when chip overlaps even if pointer is off-band", () => {
    expect(
      findTabStripIntersectingChip({
        strips,
        chip: { x: 420, y: 18, width: 80, height: 30 },
        excludeGroup: groupA,
      })
    ).toBe(groupB);
    expect(
      findForeignTabStripAtPointer({
        strips,
        pointer: { x: 450, y: 40 },
        excludeGroup: groupA,
      })
    ).toBeNull();
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
      pointer: { x: 49, y: 20 }, // above strip → nearest row1; 49 < A center 50
      chip: chipOn(0, 10, 40),
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
      pointer: { x: 10, y: 110 },
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

describe("foreignStripInsertIndex (pure)", () => {
  const destTabs = [
    { x: 0, y: 0, width: 100, height: 30 },
    { x: 100, y: 0, width: 100, height: 30 },
    { x: 200, y: 0, width: 100, height: 30 },
  ];

  it("TABBED: chip leading edge before first center → 0", () => {
    const chip = { x: -40, y: 0, width: 80, height: 30 };
    expect(
      foreignStripInsertIndex({
        tabs: destTabs,
        pointer: { x: 10, y: 15 },
        chip,
        dragDirection: 1,
        axis: "x",
      }).index
    ).toBe(0);
  });

  it("TABBED: chip past first center, before second → mid index", () => {
    const chip = { x: 20, y: 0, width: 80, height: 30 };
    expect(
      foreignStripInsertIndex({
        tabs: destTabs,
        pointer: { x: 80, y: 15 },
        chip,
        dragDirection: 1,
        axis: "x",
      }).index
    ).toBe(1);
  });

  it("TABBED: chip past last center → append", () => {
    const chip = { x: 260, y: 0, width: 80, height: 30 };
    expect(
      foreignStripInsertIndex({
        tabs: destTabs,
        pointer: { x: 300, y: 15 },
        chip,
        dragDirection: 1,
        axis: "x",
      }).index
    ).toBe(3);
  });

  it("STACKED uses Y chip gap, not 2D", () => {
    const stacked = [
      { x: 0, y: 0, width: 200, height: 40 },
      { x: 0, y: 40, width: 200, height: 40 },
      { x: 0, y: 80, width: 200, height: 40 },
    ];
    const chip = { x: 0, y: 50, width: 200, height: 40 };
    expect(
      foreignStripInsertIndex({
        tabs: stacked,
        pointer: { x: 10, y: 70 },
        chip,
        dragDirection: 1,
        axis: "y",
      }).index
    ).toBe(2);
  });
});

describe("findForeignTabStripAtPointer (pure)", () => {
  const groupA = { id: "A" };
  const groupB = { id: "B" };
  const strips = [
    { group: groupA, rects: [{ x: 0, y: 0, width: 300, height: 30 }] },
    { group: groupB, rects: [{ x: 400, y: 0, width: 300, height: 30 }] },
  ];

  it("hits dest strip and skips origin", () => {
    expect(
      findForeignTabStripAtPointer({
        strips,
        pointer: { x: 450, y: 15 },
        excludeGroup: groupA,
      })
    ).toBe(groupB);
    expect(
      findForeignTabStripAtPointer({
        strips,
        pointer: { x: 50, y: 15 },
        excludeGroup: groupA,
      })
    ).toBeNull();
  });

  it("misses when pointer is in tile body, not strip", () => {
    expect(
      findForeignTabStripAtPointer({
        strips,
        pointer: { x: 450, y: 200 },
        excludeGroup: groupA,
      })
    ).toBeNull();
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
    const actor = {
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
        this._parent?._forgeRelayoutStrip?.();
      },
      set_height(h) {
        this.height = h;
        this._parent?._forgeRelayoutStrip?.();
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
      // Mimic St.BoxLayout: after remove/insert/set_width, pack children by width.
      _forgeRelayoutStrip() {
        let cursor = Number(this.x) || 0;
        for (const child of this.children) {
          if (!child) continue;
          const w = Math.max(0, Number(child.width) || 0);
          child.x = cursor;
          child.y = Number(this.y) || 0;
          cursor += w;
        }
      },
      add_child(child) {
        if (!child) return;
        if (!this.children.includes(child)) this.children.push(child);
        child._parent = this;
        this._forgeRelayoutStrip();
      },
      remove_child(child) {
        const i = this.children.indexOf(child);
        if (i !== -1) this.children.splice(i, 1);
        if (child && child._parent === this) child._parent = null;
        this._forgeRelayoutStrip();
      },
      contains(child) {
        return this.children.includes(child);
      },
      hide() {},
      show() {},
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
        this._forgeRelayoutStrip();
      },
    };
    return actor;
  }

  /** Painted range along X: allocation + translation (dual-layout failure detector). */
  function paintedXRange(tab) {
    const start = (Number(tab.x) || 0) + (Number(tab.translation_x) || 0);
    return { start, end: start + (Number(tab.width) || 0) };
  }

  function assertNoOverlapPainted(tabs, stripStart, stripEnd) {
    const ranges = tabs.map(paintedXRange).sort((a, b) => a.start - b.start);
    for (let i = 0; i < ranges.length; i++) {
      expect(ranges[i].start).toBeGreaterThanOrEqual(stripStart - 0.5);
      expect(ranges[i].end).toBeLessThanOrEqual(stripEnd + 0.5);
      if (i > 0) {
        expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end - 0.5);
      }
    }
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

  it("drag along strip reorders via Forest; layout and percents stay", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    expect(kidsOf(wm(), group)).toEqual([a.node, b.node, c.node]);

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

    // Pointer past C center → gap after C → insertIndex 3
    expect(dd().noteTabDragMotion(280, 15)).toBe("reorder");
    dd().finishTabDragRelease();

    expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), group)).toEqual([a.node, c.node, b.node]);
    expect(group.lastTabFocus).toBe(b.meta);
    expect(commit).toHaveBeenCalledWith("tab-strip-reorder", { force: true });
    expect(dd()._tabDrag).toBeNull();
    expect(b.node.tab.style_class).not.toContain("window-tabbed-tab-pressed");
  });

  it("short click on strip does not reorder or grab", () => {
    const { group, nodes } = makeTabbedTrio();
    const order = [...kidsOf(wm(), group)];
    dd().armTabDrag(nodes[0].meta, makePressEvent(20, 15));
    expect(nodes[0].node.tab.style_class).toContain("window-tabbed-tab-pressed");
    expect(dd().noteTabDragMotion(24, 15)).toBe("armed");
    dd().finishTabDragRelease();
    expect(kidsOf(wm(), group)).toEqual(order);
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

  it("floating chip under pointer does not block peel (strip AABB excludes chip)", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd()._tabDrag?.chipFloating).toBe(true);
    // Chip tracks pointer far south — pre-fix peel AABB contained the chip.
    const status = dd().noteTabDragMotion(150, 400);
    expect(status).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(wm()._draggedNodeWindow).toBe(b.node);
    expect(dd()._tabDrag?.reorder).toBeFalsy();
  });

  it("peel with preview-hint off still paints zones when tile mod is None", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    // Host: preview-hint-enabled=false, mod-mask-mouse-tile=None → allow true.
    const origGet = wm().ext.settings.get_boolean;
    wm().ext.settings.get_boolean = vi.fn((key) => {
      if (key === "preview-hint-enabled") return false;
      if (key === "tiling-mode-enabled") return true;
      return origGet.call(wm().ext.settings, key);
    });
    // DragDropManager.allowDragDropTile (kbd path), not only WM wrapper.
    vi.spyOn(dd(), "allowDragDropTile").mockReturnValue(true);
    const moveSpy = vi.spyOn(wm(), "moveWindowToPointer").mockImplementation(() => {});

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 250)).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);

    setPointer(300, 300);
    expect(dd().noteTabDragMotion(300, 300)).toBe("active");
    expect(moveSpy).toHaveBeenCalled();
    expect(moveSpy.mock.calls.some((c) => c[1] === true)).toBe(true);
  });

  it("PR10: peel with begin_grab_op true still enters synthetic GRAB_TILE", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    // Simulate host Meta.Window: begin_grab_op exists and claims success.
    b.meta.begin_grab_op = vi.fn(() => true);
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    const status = dd().noteTabDragMotion(150, 250);
    expect(status).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(dd()._tabDrag?.synthetic).toBe(true);
    expect(dd()._tabDrag?.started).toBe(true);
    // Must not hand ownership to a silent Mutter grab (stage still drives motion).
    expect(b.meta.begin_grab_op).not.toHaveBeenCalled();
    expect(wm()._draggedNodeWindow).toBe(b.node);
  });

  it("PR10: peel then edge drop commits structure (not no-op)", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    // Sibling tile on mon for edge drop target (outside the tab group body).
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const targetMeta = createMockWindow({
      rect: new Rectangle({ x: 900, y: 0, width: 900, height: 600 }),
      workspace: ctx.workspaces[0],
      id: "peel-edge-target",
    });
    delete targetMeta.begin_grab_op;
    const target = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, targetMeta);
    target.mode = WINDOW_MODES.TILE;
    target.rect = { x: 900, y: 0, width: 900, height: 600 };

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});
    // Sorted targets for findNodeWindowAtPointer during motion/commit.
    wm().sortedWindows = [b.meta, targetMeta, nodes[0].meta, nodes[2].meta];
    wm().trackCurrentMonWs = vi.fn();

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);

    // LEFT edge of target tile → slot-split / peel-out structure change.
    setPointer(920, 300);
    expect(dd().noteTabDragMotion(920, 300)).toBe("active");
    // Preview path used zone hit (target under pointer).
    expect(wm().nodeWinAtPointer).toBe(target);

    dd().finishTabDragRelease();

    expect(kidsOf(wm(), group)).not.toContain(b.node);
    expect(kidsOf(wm(), group)).toHaveLength(2);
    expect(parentOf(wm(), b.node)).not.toBe(group);
    expect(b.node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
  });

  it("PR10: peel CENTER onto sibling tile joins (structure change)", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const targetMeta = createMockWindow({
      rect: new Rectangle({ x: 900, y: 0, width: 900, height: 600 }),
      workspace: ctx.workspaces[0],
      id: "peel-center-target",
    });
    delete targetMeta.begin_grab_op;
    const target = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, targetMeta);
    target.mode = WINDOW_MODES.TILE;
    target.rect = { x: 900, y: 0, width: 900, height: 600 };

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});
    wm().sortedWindows = [b.meta, targetMeta, nodes[0].meta, nodes[2].meta];
    wm().trackCurrentMonWs = vi.fn();
    // dnd-center-layout tabbed (fixture default may vary).
    const origStr = wm().ext.settings.get_string;
    wm().ext.settings.get_string = vi.fn((key) => {
      if (key === "dnd-center-layout") return "tabbed";
      return origStr?.call?.(wm().ext.settings, key) ?? "";
    });

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");

    // Center of target.
    setPointer(1350, 300);
    expect(dd().noteTabDragMotion(1350, 300)).toBe("active");
    dd().finishTabDragRelease();

    expect(kidsOf(wm(), group)).not.toContain(b.node);
    // Joined with target into a TABBED/STACKED group.
    const joinedParent = parentOf(wm(), b.node);
    expect(joinedParent).toBe(parentOf(wm(), target));
    expect(joinedParent?.isStackedOrTabbed?.() || joinedParent?.isTabbed?.()).toBe(true);
    expect(b.node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
  });

  it("PR13: peel keeps chipFloating under pointer (no snap-back)", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd()._tabDrag?.chipFloating).toBe(true);
    const grabY = Number(dd()._tabDrag.grabOffsetY) || 0;

    const status = dd().noteTabDragMotion(150, 400);
    expect(status).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(dd()._tabDrag?.synthetic).toBe(true);
    expect(dd()._tabDrag?.chipFloating).toBe(true);
    expect(dd()._tabDrag?.gapSpacer).toBeFalsy();
    expect(b.node.tab.style_class).toContain("window-tabbed-tab-dragging");
    expect(b.node.tab.y).toBeCloseTo(400 - grabY, 0);
    // Origin siblings unfrozen; chip still the float.
    expect(nodes[0].node.tab.x_expand).toBe(true);
    expect(b.node.tab.x_expand).toBe(false);

    dd().noteTabDragMotion(180, 420);
    expect(dd()._tabDrag?.chipFloating).toBe(true);
    expect(b.node.tab.y).toBeCloseTo(420 - grabY, 0);
    expect(group.decoration.contains(b.node.tab) || b.node.tab.get_parent()).toBeTruthy();
  });

  it("PR13: after peel, getDragPointer prefers event coords over parked pointer", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const targetMeta = createMockWindow({
      rect: new Rectangle({ x: 900, y: 0, width: 900, height: 600 }),
      workspace: ctx.workspaces[0],
      id: "peel-zone-target",
    });
    delete targetMeta.begin_grab_op;
    const target = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, targetMeta);
    target.mode = WINDOW_MODES.TILE;
    target.rect = { x: 900, y: 0, width: 900, height: 600 };

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    vi.spyOn(dd(), "allowDragDropTile").mockReturnValue(true);
    wm().sortedWindows = [b.meta, targetMeta, nodes[0].meta, nodes[2].meta];
    wm().trackCurrentMonWs = vi.fn();
    const moveSpy = vi.spyOn(wm(), "moveWindowToPointer");

    setPointer(150, 15);
    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");

    // Host Wayland: global pointer stays parked on the origin strip.
    setPointer(150, 15);
    expect(dd().noteTabDragMotion(920, 300)).toBe("active");
    const ptr = dd().getDragPointer(b.node);
    expect(ptr[0]).toBe(920);
    expect(ptr[1]).toBe(300);
    expect(wm().nodeWinAtPointer).toBe(target);
    expect(moveSpy).toHaveBeenCalled();
    expect(moveSpy.mock.calls.some((c) => c[1] === true)).toBe(true);
  });

  it("PR13: peel then edge drop commits from event coords (parked get_pointer ignored)", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const targetMeta = createMockWindow({
      rect: new Rectangle({ x: 900, y: 0, width: 900, height: 600 }),
      workspace: ctx.workspaces[0],
      id: "peel-edge-parked",
    });
    delete targetMeta.begin_grab_op;
    const target = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, targetMeta);
    target.mode = WINDOW_MODES.TILE;
    target.rect = { x: 900, y: 0, width: 900, height: 600 };

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});
    wm().sortedWindows = [b.meta, targetMeta, nodes[0].meta, nodes[2].meta];
    wm().trackCurrentMonWs = vi.fn();
    b.meta.begin_grab_op = vi.fn(() => true);

    setPointer(150, 15);
    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");
    expect(b.meta.begin_grab_op).not.toHaveBeenCalled();

    // Leave global pointer parked; only event coords sit on the LEFT edge.
    setPointer(150, 15);
    expect(dd().noteTabDragMotion(920, 300)).toBe("active");
    expect(wm().nodeWinAtPointer).toBe(target);
    dd().finishTabDragRelease();

    expect(kidsOf(wm(), group)).not.toContain(b.node);
    expect(kidsOf(wm(), group)).toHaveLength(2);
    expect(parentOf(wm(), b.node)).not.toBe(group);
    expect(b.node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
    expect(dd()._syntheticDragPointer).toBeNull();
  });

  it("PR13: peel AABB uses planned strip, not inflated decoration", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd()._tabDrag?.chipFloating).toBe(true);

    // Live deco transform covers the whole tile — pre-fix this trapped peel.
    group.decoration.get_transformed_position = () => [0, 0];
    group.decoration.get_transformed_size = () => [900, 600];

    const status = dd().noteTabDragMotion(150, 200);
    expect(status).toBe("active");
    expect(b.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(dd()._tabDrag?.chipFloating).toBe(true);
    expect(dd()._tabDrag?.reorder).toBeFalsy();
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
    expect(kidsOf(wm(), group)).toEqual([b.node, c.node, a.node]);
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

    expect(kidsOf(wm(), group)).toEqual([winA, winC, conB]);
    expect(kidsOf(wm(), conB)[0]).toBe(winB);
  });

  it("peel onto foreign strip paints gap and joins at index (not append)", () => {
    const { group: groupA, nodes: nodesA } = makeTabbedTrio();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const groupBin = new Bin();
    const groupB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    groupB.layout = LAYOUT_TYPES.TABBED;
    groupB.rect = { x: 400, y: 0, width: 900, height: 600 };
    // Wide strip so chip floor (~20-char) leaves room for mid-index hit tests.
    const homeW = 300;
    const stripW = homeW * 3;
    const decoB = makeTabActor(400, 0, stripW, 30);
    groupB.decoration = decoB;
    const nodesB = [];
    for (let i = 0; i < 3; i++) {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 400, y: 40, width: 900, height: 560 }),
        workspace: ctx.workspaces[0],
        id: `dest-tab-${i}`,
      });
      delete meta.begin_grab_op;
      const node = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, meta);
      node.mode = WINDOW_MODES.TILE;
      node.tab = makeTabActor(400 + i * homeW, 0, homeW, 30);
      decoB.add_child(node.tab);
      nodesB.push({ node, meta });
    }
    ctx.settings.set_uint("min-tab-label-chars", 20);

    const dragged = nodesA[1];
    ctx.display.get_focus_window = vi.fn(() => dragged.meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    dd().armTabDrag(dragged.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");

    const srcTabParentBefore = dragged.node.tab.get_parent?.() || dragged.node.tab._parent;
    setPointer(400, 15);
    expect(dd().noteTabDragMotion(400, 15)).toBe("active");
    expect(dd()._foreignStrip?.groupNode).toBe(groupB);
    expect(dd()._foreignStrip?.gapSpacer).toBeTruthy();
    // PR9: foreign preview is spacer-only — never reparent the live tab.
    expect(dd()._foreignStrip?.chipFloating).toBe(false);
    expect(dd()._foreignStrip?.foreign).toBe(true);
    const srcTabParentMid = dragged.node.tab.get_parent?.() || dragged.node.tab._parent;
    expect(srcTabParentMid).toBe(srcTabParentBefore);
    // Dest remaining equal-fill; no dual-translation overlap.
    for (const s of dd()._foreignStrip?.siblingSnap || []) {
      expect(s.tab.translation_x).toBe(0);
    }
    assertNoOverlapPainted(
      (dd()._foreignStrip?.siblingSnap || []).map((s) => s.tab),
      400,
      400 + stripW
    );
    const firstGap = dd()._foreignStrip?.insertIndex;
    expect(firstGap).toBeGreaterThanOrEqual(0);
    expect(firstGap).toBeLessThan(3);

    // Farther right → insert index must move toward the end (not stuck / not only append).
    setPointer(400 + homeW * 2.2, 15);
    expect(dd().noteTabDragMotion(400 + homeW * 2.2, 15)).toBe("active");
    const gap = dd()._foreignStrip?.insertIndex;
    expect(gap).toBeGreaterThanOrEqual(1);
    expect(gap).toBeLessThanOrEqual(3);
    expect(gap).toBeGreaterThanOrEqual(firstGap);

    dd().finishTabDragRelease();

    expect(kidsOf(wm(), groupB)).toContain(dragged.node);
    expect(kidsOf(wm(), groupB).indexOf(dragged.node)).toBe(gap);
    expect(kidsOf(wm(), groupA)).not.toContain(dragged.node);
    expect(groupA.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(groupB.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(dd()._tabDrag).toBeNull();
    expect(dd()._foreignStrip).toBeNull();
  });

  it("Mutter-owned GRAB_TILE foreign hover never reparents source tab", () => {
    const { group: groupA, nodes: nodesA } = makeTabbedTrio();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const groupBin = new Bin();
    const groupB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    groupB.layout = LAYOUT_TYPES.TABBED;
    groupB.rect = { x: 400, y: 0, width: 900, height: 600 };
    const decoB = makeTabActor(400, 0, 300, 30);
    groupB.decoration = decoB;
    for (let i = 0; i < 2; i++) {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 400, y: 40, width: 900, height: 560 }),
        workspace: ctx.workspaces[0],
        id: `mutter-dest-${i}`,
      });
      delete meta.begin_grab_op;
      const node = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, meta);
      node.mode = WINDOW_MODES.TILE;
      node.tab = makeTabActor(400 + i * 100, 0, 100, 30);
      decoB.add_child(node.tab);
    }

    const dragged = nodesA[0];
    // Simulate real titlebar/Mutter grab (no synthetic _tabDrag).
    dragged.node.mode = WINDOW_MODES.GRAB_TILE;
    wm()._draggedNodeWindow = dragged.node;
    const parentBefore =
      typeof dragged.node.tab.get_parent === "function"
        ? dragged.node.tab.get_parent()
        : dragged.node.tab._parent;

    setPointer(450, 15);
    dd()._handleMoving(dragged.node);

    expect(dd()._foreignStrip?.groupNode).toBe(groupB);
    expect(dd()._foreignStrip?.chipFloating).toBe(false);
    expect(dd()._foreignStrip?.gapSpacer).toBeTruthy();
    const parentAfter =
      typeof dragged.node.tab.get_parent === "function"
        ? dragged.node.tab.get_parent()
        : dragged.node.tab._parent;
    expect(parentAfter).toBe(parentBefore);
    expect(kidsOf(wm(), groupA)).toContain(dragged.node);

    dd()._clearForeignStripPreview();
    dragged.node.mode = WINDOW_MODES.TILE;
    wm()._draggedNodeWindow = null;
  });

  it("chip min width uses measureMinTabWidth(min-tab-label-chars), not 80px hardcode", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    // Product floor (~20 chars) — fixtures default wrap-off (0).
    ctx.settings.set_uint("min-tab-label-chars", 20);
    const measured = ctx.tree.measureMinTabWidth({ minChars: 20 });
    expect(measured).toBeGreaterThan(80);

    const floor = dd()._tabDragChipMinWidth(100);
    expect(floor).toBe(Math.max(Math.round(measured), 1));
    // Prefer floor over tiny home (prior stuck-ellipsis bug).
    expect(dd()._tabDragChipMinWidth(40)).toBe(floor);

    ctx.display.get_focus_window = vi.fn(() => b.meta);
    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd()._tabDrag?.chipW).toBe(floor);
    expect(b.node.tab.width).toBe(floor);
    dd().cancelTabDrag();
  });

  it("enter REORDER: gap spacer == chipW; remaining equal-fill strip − chipW", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    // Wide equal-fill homes so chip min is smaller than home (host feel case).
    const homeW = 200;
    const stripW = homeW * 3;
    a.node.tab.width = homeW;
    a.node.tab.x = 0;
    b.node.tab.width = homeW;
    b.node.tab.x = homeW;
    c.node.tab.width = homeW;
    c.node.tab.x = homeW * 2;
    if (group.decoration) {
      group.decoration.width = stripW;
    }
    ctx.settings.set_uint("min-tab-label-chars", 20);
    const chipW = dd()._tabDragChipMinWidth(homeW);
    expect(chipW).toBeGreaterThan(0);
    expect(chipW).toBeLessThan(homeW);

    const pressX = homeW + homeW / 2;
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    dd().armTabDrag(b.meta, makePressEvent(pressX, 15));
    expect(dd().noteTabDragMotion(pressX + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");

    const state = dd()._tabDrag;
    expect(state.chipW).toBe(chipW);
    expect(state.gapSpacer?.width).toBe(chipW);
    expect(state.stripAvailable).toBe(stripW);

    const remaining = (state.siblingSnap || []).map((s) => s.size);
    expect(remaining).toHaveLength(2);
    const remSum = remaining.reduce((s, n) => s + n, 0);
    expect(remSum).toBe(stripW - chipW);
    expect(a.node.tab.width + c.node.tab.width).toBe(stripW - chipW);
    expect(a.node.tab.width).toBe(remaining[0]);
    expect(c.node.tab.width).toBe(remaining[1]);
    // Siblings must not claim the gap slot.
    expect(remSum + chipW).toBe(stripW);
    expect(a.node.tab.x_expand).toBe(false);
    expect(c.node.tab.x_expand).toBe(false);
    // PR12: one layout owner — no dual translation vs BoxLayout pack.
    expect(a.node.tab.translation_x).toBe(0);
    expect(c.node.tab.translation_x).toBe(0);
    assertNoOverlapPainted([a.node.tab, c.node.tab], 0, stripW);
    const paintedSum =
      paintedXRange(a.node.tab).end -
      paintedXRange(a.node.tab).start +
      paintedXRange(c.node.tab).end -
      paintedXRange(c.node.tab).start;
    expect(paintedSum + chipW).toBe(stripW);

    dd().cancelTabDrag();
  });

  it("REORDER after BoxLayout reallocate: remaining painted ranges stay disjoint", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    const homeW = 200;
    const stripW = homeW * 3;
    a.node.tab.width = homeW;
    a.node.tab.x = 0;
    b.node.tab.width = homeW;
    b.node.tab.x = homeW;
    c.node.tab.width = homeW;
    c.node.tab.x = homeW * 2;
    group.decoration.width = stripW;
    group.decoration.x = 0;
    ctx.settings.set_uint("min-tab-label-chars", 20);

    const pressX = homeW + homeW / 2;
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    dd().armTabDrag(b.meta, makePressEvent(pressX, 15));
    expect(dd().noteTabDragMotion(pressX + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");

    const chipW = dd()._tabDrag.chipW;
    // Host reallocate after chip leave + width change (St.BoxLayout class).
    group.decoration._forgeRelayoutStrip();
    assertNoOverlapPainted([a.node.tab, c.node.tab], 0, stripW);
    expect(a.node.tab.translation_x).toBe(0);
    expect(c.node.tab.translation_x).toBe(0);

    // Slide gap toward C — still one owner, no overlap.
    expect(dd().noteTabDragMotion(stripW - 10, 15)).toBe("reorder");
    group.decoration._forgeRelayoutStrip();
    assertNoOverlapPainted([a.node.tab, c.node.tab], 0, stripW);
    const remW = a.node.tab.width + c.node.tab.width;
    expect(remW + chipW).toBe(stripW);
    expect(remW + chipW).toBeLessThanOrEqual(stripW + 0.5);

    dd().cancelTabDrag();
  });

  it("minChars=0 still yields readable chrome+short-label chip floor", () => {
    ctx.settings.set_uint("min-tab-label-chars", 0);
    const short = ctx.tree.measureMinTabWidth({ minChars: 1 });
    expect(short).toBeGreaterThan(0);
    expect(dd()._tabDragChipMinWidth(0)).toBe(Math.max(Math.round(short), 1));
  });

  it("commit restore: chip+siblings regain x_expand, clear fixed width; same-order still layouts", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    const commit = vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    // Freeze-visible start widths
    a.node.tab.width = 100;
    b.node.tab.width = 100;
    c.node.tab.width = 100;
    a.node.tab.x_expand = true;
    b.node.tab.x_expand = true;
    c.node.tab.x_expand = true;

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    // During drag: siblings frozen, chip fixed/non-expand.
    expect(a.node.tab.x_expand).toBe(false);
    expect(c.node.tab.x_expand).toBe(false);
    expect(b.node.tab.x_expand).toBe(false);
    expect(b.node.tab.width).toBe(dd()._tabDrag?.chipW);

    // Same-order release (stay at home gap).
    dd().noteTabDragMotion(150, 15);
    dd().finishTabDragRelease();

    expect(kidsOf(wm(), group)).toEqual([a.node, b.node, c.node]);
    expect(a.node.tab.x_expand).toBe(true);
    expect(b.node.tab.x_expand).toBe(true);
    expect(c.node.tab.x_expand).toBe(true);
    expect(a.node.tab.width).toBe(-1);
    expect(b.node.tab.width).toBe(-1);
    expect(c.node.tab.width).toBe(-1);
    expect(commit).toHaveBeenCalledWith("tab-strip-reorder", { force: true });
    expect(dd()._tabDrag).toBeNull();
  });

  it("PR15: peel then re-enter origin strip shows gap again", () => {
    const { group, nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");
    expect(dd()._tabDrag?.gapSpacer).toBeFalsy();
    expect(dd()._originStripCommit).toBeFalsy();

    expect(dd().noteTabDragMotion(150, 15)).toBe("active");
    expect(dd()._tabDrag?.gapSpacer).toBeTruthy();
    expect(dd()._originStripCommit?.group).toBe(group);
    expect(dd()._originStripCommit?.insertIndex).toBeGreaterThanOrEqual(0);

    dd().finishTabDragRelease();
    expect(dd()._tabDrag).toBeNull();
    expect(dd()._originStripCommit).toBeNull();
    expect(parentOf(wm(), b.node)).toBe(group);
  });

  it("PR15: chip∩foreign strip shows gap when pointer is off the band", () => {
    const { nodes: nodesA } = makeTabbedTrio();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const groupBin = new Bin();
    const groupB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, groupBin);
    groupB.layout = LAYOUT_TYPES.TABBED;
    groupB.rect = { x: 400, y: 0, width: 900, height: 600 };
    const decoB = makeTabActor(400, 0, 300, 30);
    groupB.decoration = decoB;
    for (let i = 0; i < 2; i++) {
      const meta = createMockWindow({
        rect: new Rectangle({ x: 400, y: 40, width: 900, height: 560 }),
        workspace: ctx.workspaces[0],
        id: `chip-dest-${i}`,
      });
      delete meta.begin_grab_op;
      const node = ctx.tree.createNode(groupBin, NODE_TYPES.WINDOW, meta);
      node.mode = WINDOW_MODES.TILE;
      node.tab = makeTabActor(400 + i * 150, 0, 150, 30);
      decoB.add_child(node.tab);
    }

    const dragged = nodesA[1];
    ctx.display.get_focus_window = vi.fn(() => dragged.meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    dd().armTabDrag(dragged.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(dd().noteTabDragMotion(150, 200)).toBe("active");

    // Pointer y=40 is south of dest bar (0–30+4); chip still overlaps.
    expect(dd().noteTabDragMotion(450, 40)).toBe("active");
    expect(dd()._foreignStrip?.groupNode).toBe(groupB);
    expect(dd()._foreignStrip?.gapSpacer).toBeTruthy();
    expect(dragged.node.tab.previewHint || wm()._draggedNodeWindow?.previewHint).toBeFalsy();

    dd().finishTabDragRelease();
    expect(dd()._foreignStrip).toBeNull();
  });

  it("PR15: parked pointer after peel does not stick the chip", () => {
    const { nodes } = makeTabbedTrio();
    const b = nodes[1];
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    setPointer(150, 15);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    const grabX = Number(dd()._tabDrag.grabOffsetX) || 0;
    const grabY = Number(dd()._tabDrag.grabOffsetY) || 0;

    expect(dd().noteTabDragMotion(220, 180)).toBe("active");
    expect(b.node.tab.x).toBeCloseTo(220 - grabX, 0);
    expect(b.node.tab.y).toBeCloseTo(180 - grabY, 0);

    // Size-changed / parked Wayland pointer must not yank the chip back.
    setPointer(150, 15);
    dd()._handleMoving(b.node);
    expect(dd().getDragPointer(b.node)[0]).toBe(220);
    expect(dd().getDragPointer(b.node)[1]).toBe(180);
    expect(b.node.tab.x).toBeCloseTo(220 - grabX, 0);
    expect(b.node.tab.y).toBeCloseTo(180 - grabY, 0);

    dd().noteTabDragMotion(300, 240);
    expect(b.node.tab.x).toBeCloseTo(300 - grabX, 0);
    expect(b.node.tab.y).toBeCloseTo(240 - grabY, 0);
    dd().cancelTabDrag();
  });

  it("PR15: click-only clears pressed and leftover drop-zone paint", () => {
    const { nodes } = makeTabbedTrio();
    const a = nodes[0];
    ctx.display.get_focus_window = vi.fn(() => a.meta);

    dd().armTabDrag(a.meta, makePressEvent(20, 15));
    expect(a.node.tab.style_class).toContain("window-tabbed-tab-pressed");
    expect(dd().noteTabDragMotion(22, 15)).toBe("armed");
    // Leftover zone from a prior gesture — release must wipe it.
    a.node.previewHint = {
      hidden: false,
      hide() {
        this.hidden = true;
      },
      destroy() {
        this.destroyed = true;
      },
    };
    a.node.previewZoneActors = {
      CENTER: {
        hide() {
          this.hidden = true;
        },
        destroy() {},
      },
    };
    wm()._draggedNodeWindow = a.node;
    dd().finishTabDragRelease();

    expect(dd()._tabDrag).toBeNull();
    expect(a.node.tab.style_class).not.toContain("window-tabbed-tab-pressed");
    expect(a.node.tab.style_class).not.toContain("window-tabbed-tab-dragging");
    expect(a.node.previewHint).toBeNull();
    expect(a.node.previewZoneActors).toBeNull();
  });

  it("PR15: pointer past first remaining center scoots; index 0 is easy", () => {
    const { group, nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");

    // Left of A's center → insert before A (index 0).
    expect(dd().noteTabDragMotion(20, 15)).toBe("reorder");
    expect(dd()._tabDrag?.insertIndex).toBe(0);

    dd().finishTabDragRelease();
    expect(kidsOf(wm(), group)).toEqual([b.node, a.node, c.node]);
  });

  it("abort restore: cancelTabDrag restores expand/widths and re-layouts", () => {
    const { nodes } = makeTabbedTrio();
    const [a, b, c] = nodes;
    ctx.display.get_focus_window = vi.fn(() => b.meta);
    const commit = vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    dd().armTabDrag(b.meta, makePressEvent(150, 15));
    expect(dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15)).toBe("reorder");
    expect(a.node.tab.x_expand).toBe(false);
    expect(b.node.tab.x_expand).toBe(false);

    dd().cancelTabDrag();

    expect(a.node.tab.x_expand).toBe(true);
    expect(b.node.tab.x_expand).toBe(true);
    expect(c.node.tab.x_expand).toBe(true);
    expect(a.node.tab.width).toBe(-1);
    expect(b.node.tab.width).toBe(-1);
    expect(c.node.tab.width).toBe(-1);
    expect(commit).toHaveBeenCalledWith("tab-strip-reorder-cancel", { force: true });
    expect(dd()._tabDrag).toBeNull();
  });
});
