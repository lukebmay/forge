import { describe, it, expect } from "vitest";
import {
  dropChangesStructure,
  dropWouldOverflowMins,
  resolveDropMark2,
  resolveDropSurface,
  shouldMergeCenterGroup,
  swapWouldOverflowMins,
  unitMins,
} from "../../../lib/extension/drop-intent.js";
import {
  MIN_CLAMP_LEARN_DELAY_MS,
  clearClassMinFloorForTests,
  noteWindowMinFromClamp,
  noteWindowMinFromOversizedFrame,
  frameOverflowsSlotForLearn,
  parseWindowMinsJson,
  readWindowMinSize,
  rememberClassMin,
  loadClassMinFloor,
  exportClassMinFloor,
  classMinFloor,
  CLASS_MIN_ABSURD_W,
  CLASS_MIN_ABSURD_H,
} from "../../../lib/extension/tree-layout.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";

function attach(parent, child) {
  child.parentNode = parent;
  parent.childNodes.push(child);
  Object.defineProperty(child, "nextSibling", {
    configurable: true,
    get() {
      const i = parent.childNodes.indexOf(child);
      return i >= 0 ? parent.childNodes[i + 1] || null : null;
    },
  });
  return child;
}

function makeParent(layout, nodeType = "CON") {
  return {
    layout,
    nodeType,
    childNodes: [],
    isHSplit() {
      return this.layout === "HSPLIT";
    },
    isVSplit() {
      return this.layout === "VSPLIT";
    },
    isTabbed() {
      return this.layout === "TABBED";
    },
    isStacked() {
      return this.layout === "STACKED";
    },
    isStackedOrTabbed() {
      return this.isTabbed() || this.isStacked();
    },
  };
}

function vsplitPair() {
  const parent = makeParent("VSPLIT");
  const a = attach(parent, { id: "A" });
  const b = attach(parent, { id: "B" });
  return { parent, a, b };
}

function centerOp(overrides = {}) {
  return {
    isCenter: true,
    isSwap: false,
    isBefore: false,
    isHorizontal: false,
    shouldCreateCon: false,
    ...overrides,
  };
}

function edgeOp(overrides = {}) {
  return {
    isCenter: false,
    isSwap: false,
    isBefore: false,
    isHorizontal: false,
    shouldCreateCon: false,
    ...overrides,
  };
}

describe("dropChangesStructure", () => {
  it("missing nodes or operation → no change", () => {
    const { a, b } = vsplitPair();
    expect(dropChangesStructure(null, b, centerOp())).toBe(false);
    expect(dropChangesStructure(a, null, centerOp())).toBe(false);
    expect(dropChangesStructure(a, b, null)).toBe(false);
  });

  it("self drop → no change", () => {
    const { a } = vsplitPair();
    expect(dropChangesStructure(a, a, centerOp())).toBe(false);
  });

  it("different parent → change", () => {
    const { a } = vsplitPair();
    const other = makeParent("HSPLIT");
    const c = attach(other, { id: "C" });
    expect(dropChangesStructure(a, c, centerOp())).toBe(true);
    expect(dropChangesStructure(a, c, edgeOp({ isBefore: true }))).toBe(true);
  });

  it("CENTER into already TABBED same parent → no change", () => {
    const parent = makeParent("TABBED");
    const a = attach(parent, { id: "A" });
    const b = attach(parent, { id: "B" });
    const op = centerOp({ containerNode: parent });
    expect(dropChangesStructure(b, a, op, { stackedOrTabbed: true })).toBe(false);
    expect(dropChangesStructure(a, b, op, { stackedOrTabbed: true })).toBe(false);
  });

  it("CENTER into already STACKED same parent → no change", () => {
    const parent = makeParent("STACKED");
    const a = attach(parent, { id: "A" });
    const b = attach(parent, { id: "B" });
    expect(
      dropChangesStructure(b, a, centerOp({ containerNode: parent }), {
        stackedOrTabbed: true,
      })
    ).toBe(false);
  });

  it("CENTER on VSPLIT siblings → change (both directions)", () => {
    const ctx = createWindowManagerFixture({
      settings: {
        "dnd-center-layout": "TABBED",
        "tiling-mode-enabled": true,
      },
    });
    try {
      const wm = ctx.windowManager;
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const split = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      const top = ctx.tree.createNode(
        split.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          id: "A",
          rect: new Rectangle({ x: 0, y: 0, width: 960, height: 540 }),
          workspace: ctx.workspaces[0],
        })
      );
      const bot = ctx.tree.createNode(
        split.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({
          id: "B",
          rect: new Rectangle({ x: 0, y: 540, width: 960, height: 540 }),
          workspace: ctx.workspaces[0],
        })
      );
      top.mode = WINDOW_MODES.TILE;
      bot.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(480, 270);
      wm.nodeWinAtPointer = top;
      wm.moveWindowToPointer(bot, false);

      expect(split.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(split.childNodes).toHaveLength(2);
      expect(split.childNodes).toEqual(expect.arrayContaining([top, bot]));
      expect(top.parentNode).toBe(split);
      expect(bot.parentNode).toBe(split);
      expect(monitor.childNodes).toContain(split);
    } finally {
      ctx.cleanup();
    }
  });

  it("CENTER on HSPLIT siblings → change", () => {
    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A" });
    const b = attach(parent, { id: "B" });
    expect(dropChangesStructure(b, a, centerOp({ containerNode: parent }))).toBe(true);
  });

  it("CENTER SWAP on siblings → change", () => {
    const { a, b } = vsplitPair();
    expect(dropChangesStructure(b, a, centerOp({ isSwap: true }))).toBe(true);
  });

  it("D3: already bottom, drop BOTTOM on top sibling → no change", () => {
    const { a, b } = vsplitPair();
    const op = edgeOp({ isBefore: false, isHorizontal: false });
    expect(dropChangesStructure(b, a, op)).toBe(false);
  });

  it("already top, drop TOP on bottom sibling → no change", () => {
    const { a, b } = vsplitPair();
    expect(dropChangesStructure(a, b, edgeOp({ isBefore: true }))).toBe(false);
  });

  it("BOTTOM that would reorder (top onto bottom) → change", () => {
    const { a, b } = vsplitPair();
    expect(dropChangesStructure(a, b, edgeOp({ isBefore: false }))).toBe(true);
  });

  it("LEFT on VSPLIT (would flip H) → change", () => {
    const { a, b } = vsplitPair();
    const op = edgeOp({
      isBefore: true,
      isHorizontal: true,
      shouldCreateCon: true,
    });
    expect(dropChangesStructure(b, a, op)).toBe(true);
  });

  it("already right of HSPLIT, drop RIGHT → no change", () => {
    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A" });
    const b = attach(parent, { id: "B" });
    const op = edgeOp({ isBefore: false, isHorizontal: true });
    expect(dropChangesStructure(b, a, op)).toBe(false);
  });

  it("RIGHT on VSPLIT (would flip H) → change", () => {
    const { a, b } = vsplitPair();
    const op = edgeOp({
      isBefore: false,
      isHorizontal: true,
      shouldCreateCon: true,
    });
    expect(dropChangesStructure(b, a, op)).toBe(true);
  });
});

describe("resolveDropMark2", () => {
  function hsplitPair() {
    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A", nodeType: "WINDOW" });
    const b = attach(parent, { id: "B", nodeType: "WINDOW" });
    return { parent, a, b };
  }

  function tabGroupSibling() {
    const outer = makeParent("HSPLIT");
    const src = attach(outer, { id: "S", nodeType: "WINDOW" });
    const group = attach(outer, makeParent("TABBED"));
    const t1 = attach(group, { id: "T1", nodeType: "WINDOW" });
    const t2 = attach(group, { id: "T2", nodeType: "WINDOW" });
    return { outer, src, group, t1, t2 };
  }

  it("CENTER sibling of TABBED CON → join toward the group", () => {
    const { src, t1, t2, outer } = tabGroupSibling();
    expect(resolveDropMark2(src, t1, centerOp())).toEqual({ op: "join", dir: "right" });
    expect(resolveDropMark2(src, t2, centerOp())).toEqual({ op: "join", dir: "right" });
    const flipped = attach(outer, { id: "R", nodeType: "WINDOW" });
    expect(resolveDropMark2(flipped, t1, centerOp())).toEqual({ op: "join", dir: "left" });
  });

  it("CENTER into TABBED under MONITOR parent → null", () => {
    const mon = makeParent("HSPLIT", "MONITOR");
    const src = attach(mon, { id: "S", nodeType: "WINDOW" });
    const group = attach(mon, makeParent("TABBED"));
    const t1 = attach(group, { id: "T1", nodeType: "WINDOW" });
    expect(resolveDropMark2(src, t1, centerOp())).toBeNull();
  });

  it("CENTER H/V sibling merge-group → null (Join would wrap-split)", () => {
    const { a, b } = hsplitPair();
    expect(shouldMergeCenterGroup(b, a, centerOp())).toBe(true);
    expect(resolveDropMark2(b, a, centerOp())).toBeNull();
    expect(resolveDropMark2(a, b, centerOp())).toBeNull();
  });

  it("adjacent HSPLIT SWAP → move (in-axis neighbor)", () => {
    const { a, b } = hsplitPair();
    expect(resolveDropMark2(b, a, centerOp({ isSwap: true }))).toEqual({
      op: "move",
      dir: "left",
    });
    expect(resolveDropMark2(a, b, centerOp({ isSwap: true }))).toEqual({
      op: "move",
      dir: "right",
    });
  });

  it("SWAP MONITOR / TABBED / non-adjacent → null", () => {
    const mon = makeParent("HSPLIT", "MONITOR");
    const m1 = attach(mon, { id: "M1", nodeType: "WINDOW" });
    const m2 = attach(mon, { id: "M2", nodeType: "WINDOW" });
    expect(resolveDropMark2(m1, m2, centerOp({ isSwap: true }))).toBeNull();

    const tab = makeParent("TABBED");
    const t1 = attach(tab, { id: "T1", nodeType: "WINDOW" });
    const t2 = attach(tab, { id: "T2", nodeType: "WINDOW" });
    expect(resolveDropMark2(t2, t1, centerOp({ isSwap: true }))).toBeNull();

    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A", nodeType: "WINDOW" });
    attach(parent, { id: "B", nodeType: "WINDOW" });
    const c = attach(parent, { id: "C", nodeType: "WINDOW" });
    expect(resolveDropMark2(a, c, centerOp({ isSwap: true }))).toBeNull();
  });

  it("wrap / detach / createCon → null", () => {
    const { a, b } = hsplitPair();
    expect(
      resolveDropMark2(a, b, edgeOp({ shouldWrapTargetCon: true, isHorizontal: true }))
    ).toBeNull();
    expect(resolveDropMark2(a, b, edgeOp({ shouldDetachWindow: true }))).toBeNull();
    expect(
      resolveDropMark2(a, b, edgeOp({ shouldCreateCon: true, isHorizontal: true, isBefore: true }))
    ).toBeNull();
  });

  it("same-parent HSPLIT adjacent RIGHT → move right", () => {
    const { a, b } = hsplitPair();
    expect(resolveDropMark2(a, b, edgeOp({ isBefore: false, isHorizontal: true }))).toEqual({
      op: "move",
      dir: "right",
    });
    expect(resolveDropMark2(b, a, edgeOp({ isBefore: true, isHorizontal: true }))).toEqual({
      op: "move",
      dir: "left",
    });
  });

  it("non-adjacent reorder / MONITOR parent / empty-mon → null", () => {
    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A", nodeType: "WINDOW" });
    const b = attach(parent, { id: "B", nodeType: "WINDOW" });
    const c = attach(parent, { id: "C", nodeType: "WINDOW" });
    expect(resolveDropMark2(a, c, edgeOp({ isBefore: false, isHorizontal: true }))).toBeNull();

    const mon = makeParent("HSPLIT", "MONITOR");
    const m1 = attach(mon, { id: "M1", nodeType: "WINDOW" });
    const m2 = attach(mon, { id: "M2", nodeType: "WINDOW" });
    expect(resolveDropMark2(m1, m2, edgeOp({ isBefore: false, isHorizontal: true }))).toBeNull();

    expect(
      resolveDropMark2(a, b, edgeOp({ isHorizontal: true }), { emptyMonitor: true })
    ).toBeNull();
  });
});

describe("resolveDropSurface", () => {
  function hsplitPair() {
    const parent = makeParent("HSPLIT");
    const a = attach(parent, { id: "A", nodeType: "WINDOW" });
    const b = attach(parent, { id: "B", nodeType: "WINDOW" });
    return { parent, a, b };
  }

  it("SWAP → swapPairs (Mark 2 may still take adjacent H/V CON first)", () => {
    const { a, b } = hsplitPair();
    expect(resolveDropSurface(b, a, centerOp({ isSwap: true }))).toEqual({ op: "swapPairs" });
  });

  it("CENTER H/V siblings → group", () => {
    const { a, b } = hsplitPair();
    expect(shouldMergeCenterGroup(b, a, centerOp())).toBe(true);
    expect(resolveDropSurface(b, a, centerOp())).toEqual({ op: "group" });
  });

  it("CENTER invent on MONITOR → wrap (dest CON, not source-parent group)", () => {
    const mon = makeParent("HSPLIT", "MONITOR");
    const a = attach(mon, { id: "A", nodeType: "WINDOW" });
    const b = attach(mon, { id: "B", nodeType: "WINDOW" });
    expect(
      resolveDropSurface(a, b, centerOp({ shouldCreateCon: true, containerNode: mon }))
    ).toEqual({ op: "wrap" });
  });

  it("edge wrap-target / detach / invent / insert / empty-mon", () => {
    const { a, b } = hsplitPair();
    expect(
      resolveDropSurface(a, b, edgeOp({ shouldWrapTargetCon: true, isHorizontal: true }))
    ).toEqual({ op: "slotSplit" });
    expect(resolveDropSurface(a, b, edgeOp({ shouldDetachWindow: true }))).toEqual({
      op: "split",
    });
    expect(
      resolveDropSurface(
        a,
        b,
        edgeOp({ shouldCreateCon: true, isHorizontal: true, isBefore: true })
      )
    ).toEqual({ op: "wrap" });
    expect(resolveDropSurface(a, b, edgeOp({ isBefore: false, isHorizontal: true }))).toEqual({
      op: "insert",
    });
    expect(
      resolveDropSurface(a, b, edgeOp({ isHorizontal: true }), { emptyMonitor: true })
    ).toEqual({ op: "emptyMonitorDrop" });
  });
});

describe("shouldMergeCenterGroup", () => {
  it("true for CENTER on H/V CON siblings", () => {
    const { a, b } = vsplitPair();
    expect(shouldMergeCenterGroup(b, a, centerOp())).toBe(true);
    expect(shouldMergeCenterGroup(a, b, centerOp())).toBe(true);
  });

  it("false for TABBED parent, SWAP, different parents, monitor parent", () => {
    const tab = makeParent("TABBED");
    const t1 = attach(tab, { id: "T1" });
    const t2 = attach(tab, { id: "T2" });
    expect(shouldMergeCenterGroup(t2, t1, centerOp())).toBe(false);

    const { a, b } = vsplitPair();
    expect(shouldMergeCenterGroup(b, a, centerOp({ isSwap: true }))).toBe(false);

    const other = makeParent("HSPLIT");
    const c = attach(other, { id: "C" });
    expect(shouldMergeCenterGroup(a, c, centerOp())).toBe(false);

    const mon = makeParent("VSPLIT", "MONITOR");
    const m1 = attach(mon, { id: "M1" });
    const m2 = attach(mon, { id: "M2" });
    expect(shouldMergeCenterGroup(m2, m1, centerOp())).toBe(false);
  });
});

describe("dropWouldOverflowMins", () => {
  function win(id, minW, minH) {
    return {
      id,
      nodeValue: {
        get_size_hints: () =>
          minW || minH ? { min_width: minW || 0, min_height: minH || 0 } : null,
      },
    };
  }

  it("env floor overflows tiny slots (no fail-open on unknown)", () => {
    const a = win("A", 0, 0);
    a.nodeValue.get_size_hints = () => null;
    // Product 256×144 (Vitest setup uses tiny FORGE_MIN_TILE_* for other fixtures).
    const productMin = (m) => readWindowMinSize(m, { env: {} });
    expect(
      dropWouldOverflowMins(
        a,
        win("B", 0, 0),
        edgeOp({ isHorizontal: false }),
        { targetRect: { width: 200, height: 200 } },
        productMin
      )
    ).toBe(true);
  });

  it("custom getMin zeros still fail-open", () => {
    const zero = () => ({ width: 0, height: 0 });
    const a = win("A", 0, 0);
    expect(
      dropWouldOverflowMins(
        a,
        win("B", 0, 0),
        edgeOp({ isHorizontal: false }),
        { targetRect: { width: 200, height: 200 } },
        zero
      )
    ).toBe(false);
  });

  it("TOP/BOTTOM half too short for dragged min height", () => {
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(true);
  });

  it("TOP/BOTTOM OK when half fits", () => {
    const a = win("A", 0, 200);
    const b = win("B", 0, 200);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(false);
  });

  it("CENTER tab join uses full pane (not half)", () => {
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    // Half of 600 is 300 → would overflow; full pane 600 → OK.
    expect(
      dropWouldOverflowMins(a, b, centerOp(), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(false);
    expect(
      dropWouldOverflowMins(a, b, centerOp(), {
        targetRect: { width: 800, height: 300 },
      })
    ).toBe(true);
  });

  it("quarter-slot LEFT/CENTER/RIGHT legal for ~380 min height", () => {
    const a = win("A", 200, 380);
    const b = win("B", 100, 100);
    const quarter = { width: 960, height: 540 };
    expect(dropWouldOverflowMins(a, b, centerOp(), { targetRect: quarter })).toBe(false);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), { targetRect: quarter })
    ).toBe(false);
  });

  it("blocks when destination app cannot fit half", () => {
    const a = win("A", 100, 100);
    const b = win("B", 0, 400);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(true);
  });

  it("LEFT/RIGHT blocks when either min exceeds half width", () => {
    const a = win("A", 500, 0);
    const b = win("B", 500, 0);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), {
        targetRect: { width: 900, height: 800 },
      })
    ).toBe(true);
  });

  it("empty-mon blocks when work area shorter than min", () => {
    const a = win("A", 0, 900);
    expect(
      dropWouldOverflowMins(a, null, centerOp(), {
        emptyMonitor: true,
        workArea: { width: 1920, height: 800 },
      })
    ).toBe(true);
  });

  it("HSPLIT can fit when only VSPLIT overflows height", () => {
    // Dragged min height 400: half of 600 = 300 → VSPLIT (TOP) overflow;
    // half width of 800 = 400 → HSPLIT (LEFT) OK; CENTER full pane OK.
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    const slot = { width: 800, height: 600 };
    expect(dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), { targetRect: slot })).toBe(
      true
    );
    expect(dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), { targetRect: slot })).toBe(
      false
    );
    expect(dropWouldOverflowMins(a, b, centerOp(), { targetRect: slot })).toBe(false);
  });

  it("swapWouldOverflowMins checks both slots", () => {
    const a = {
      rect: { width: 400, height: 1000 },
      nodeValue: { get_size_hints: () => ({ min_width: 0, min_height: 800 }) },
    };
    const b = {
      rect: { width: 400, height: 200 },
      nodeValue: { get_size_hints: () => ({ min_width: 0, min_height: 100 }) },
    };
    expect(swapWouldOverflowMins(a, b)).toBe(true);
    b.rect = { width: 400, height: 900 };
    expect(swapWouldOverflowMins(a, b)).toBe(false);
  });
});

describe("readWindowMinSize / noteWindowMinFromClamp", () => {
  /** Tiny floor so merge/hint tests are not masked by the 256×144 default. */
  const tinyEnv = {
    FORGE_MIN_TILE_WIDTH: "1",
    FORGE_MIN_TILE_HEIGHT: "1",
  };
  /** Empty env → product defaults (Vitest setup sets process FORGE_MIN_TILE_*=1). */
  const productEnv = {};

  it("applies default env floor when unset", () => {
    clearClassMinFloorForTests();
    expect(readWindowMinSize(null, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
    expect(readWindowMinSize({}, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
  });

  it("honors env floor override", () => {
    clearClassMinFloorForTests();
    expect(
      readWindowMinSize({}, { env: { FORGE_MIN_TILE_WIDTH: "100", FORGE_MIN_TILE_HEIGHT: "50" } })
    ).toEqual({ width: 100, height: 50 });
  });

  it("reads size hints (floored by env)", () => {
    clearClassMinFloorForTests();
    const meta = {
      get_size_hints: () => ({ min_width: 120, min_height: 340 }),
    };
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 120, height: 340 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 340,
    });
  });

  it("ignores immediate race; does not learn while still at prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 200, height: 150, at: 1000, priorW: 200, priorH: 380 };
    noteWindowMinFromClamp(meta, req, { width: 200, height: 380 }, 4, 1000 + 10);
    expect(meta._forgeKnownMinH).toBeFalsy();
    // Frame still glued to prior → resize not applied; do not poison with prior.
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 200, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("learns clamp when frame settles between request and prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 200, height: 150, at: 1000, priorW: 200, priorH: 800 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 200, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 380 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 380,
    });
  });

  it("does not learn without a finite prior that already moved", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 400, height: 150, at: 1000 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 700, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("does not learn when frame grew or stayed flat vs prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 400, height: 150, at: 1000, priorW: 500, priorH: 300 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 700, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("rejects half-pane frames above absurd caps", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = {
      width: 400,
      height: 200,
      at: 1000,
      priorW: 1920,
      priorH: 1080,
    };
    const now = 1000 + MIN_CLAMP_LEARN_DELAY_MS + 1;
    noteWindowMinFromClamp(meta, req, { width: 900, height: 700 }, 4, now);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
    expect(900).toBeGreaterThan(CLASS_MIN_ABSURD_W);
    expect(700).toBeGreaterThan(CLASS_MIN_ABSURD_H);
    noteWindowMinFromClamp(meta, req, { width: 700, height: 500 }, 4, now);
    expect(meta._forgeKnownMinW).toBe(700);
    expect(meta._forgeKnownMinH).toBe(500);
  });

  it("ratchets known min down when request is accepted", () => {
    clearClassMinFloorForTests();
    const meta = { _forgeKnownMinH: 700 };
    const req = { width: 400, height: 500, at: 1000, priorW: 800, priorH: 800 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 400, height: 500 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinH).toBe(500);
  });

  it("discards absurd learned mins then applies env floor", () => {
    clearClassMinFloorForTests();
    const meta = { _forgeKnownMinH: 1032, _forgeKnownMinW: 1800 };
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 1 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
  });

  it("learns mins from settled frame larger than slot on overflow axes only", () => {
    clearClassMinFloorForTests();
    const meta = { get_wm_class: () => "org.gnome.Nautilus" };
    const slot = { width: 800, height: 200 };
    const frame = { width: 800, height: 380 };
    expect(frameOverflowsSlotForLearn(frame, slot, 4)).toBe(true);
    expect(noteWindowMinFromOversizedFrame(meta, frame, slot, 4)).toBe(true);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBe(380);
    expect(classMinFloor("org.gnome.Nautilus").height).toBe(380);
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 380 });
  });

  it("skips oversized-frame learn above absurd caps", () => {
    clearClassMinFloorForTests();
    const meta = {};
    expect(
      noteWindowMinFromOversizedFrame(
        meta,
        { width: 900, height: 700 },
        { width: 400, height: 200 },
        4
      )
    ).toBe(false);
    expect(
      frameOverflowsSlotForLearn({ width: 900, height: 700 }, { width: 400, height: 200 }, 4)
    ).toBe(false);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("falls back to class floor when meta has no hints; learned can raise above env", () => {
    clearClassMinFloorForTests();
    rememberClassMin("org.gnome.Nautilus", 360, 380);
    const meta = {
      get_wm_class: () => "org.gnome.Nautilus",
      get_size_hints: () => null,
    };
    expect(readWindowMinSize(meta)).toEqual({ width: 360, height: 380 });
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 360, height: 380 });
  });

  it("parseWindowMinsJson caps absurd and loads", () => {
    clearClassMinFloorForTests();
    const parsed = parseWindowMinsJson(
      JSON.stringify({
        v: 1,
        classes: {
          "org.gnome.Nautilus": { width: 360, height: 380 },
          Huge: { width: 2000, height: 900 },
        },
      })
    );
    expect(parsed["org.gnome.Nautilus"]).toEqual({ width: 360, height: 380 });
    expect(parsed.Huge).toBeUndefined();
    loadClassMinFloor(parsed);
    expect(exportClassMinFloor()["org.gnome.Nautilus"]).toEqual({ width: 360, height: 380 });
  });
});
