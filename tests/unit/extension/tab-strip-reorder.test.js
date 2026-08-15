import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TAB_DRAG_THRESHOLD_PX,
  tabStripInsertIndex,
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
      style_class: "",
      add_style_class_name(name) {
        if (!this.style_class.includes(name)) this.style_class += ` ${name}`;
      },
      remove_style_class_name(name) {
        this.style_class = this.style_class.replace(name, "").trim();
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
    // Travel right past threshold, still on strip → over tab c right half
    const status = dd().noteTabDragMotion(150 + TAB_DRAG_THRESHOLD_PX + 2, 15);
    expect(status).toBe("reorder");
    expect(b.node.mode).toBe(WINDOW_MODES.TILE);
    expect(wm()._draggedNodeWindow).toBeFalsy();

    // Move to right of last tab midpoint (250) so insertIndex = 3
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
  });

  it("short click on strip does not reorder or grab", () => {
    const { group, nodes } = makeTabbedTrio();
    const order = [...group.childNodes];
    dd().armTabDrag(nodes[0].meta, makePressEvent(20, 15));
    expect(dd().noteTabDragMotion(24, 15)).toBe("armed");
    dd().finishTabDragRelease();
    expect(group.childNodes).toEqual(order);
    expect(nodes[0].node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
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
      nodes.push({ node, meta });
    }

    const [a, b, c] = nodes;
    ctx.display.get_focus_window = vi.fn(() => a.meta);
    vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});

    // Press top tab; drag down past mid of last
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
