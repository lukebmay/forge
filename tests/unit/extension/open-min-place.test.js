import { describe, it, expect } from "vitest";
import {
  splitWouldOverflowMins,
  tabWouldOverflowMins,
  slotOverflowsMins,
  resolveOpenMinPlacement,
  resolveTileOverflowPlacement,
  tabJoinUnit,
  bfsOpenMinTabCandidates,
} from "../../../lib/extension/open-min-place.js";

function mins(w, h) {
  return { width: w, height: h };
}

function rect(w, h) {
  return { width: w, height: h, x: 0, y: 0 };
}

function unit(id, minW, minH, slot) {
  return {
    id,
    layout: "WINDOW",
    nodeType: "WINDOW",
    isWindow: () => true,
    isFloat: () => false,
    isGrabTile: () => false,
    isStackedOrTabbed: () => false,
    nodeValue: {
      get_size_hints: () => (minW || minH ? { min_width: minW || 0, min_height: minH || 0 } : null),
    },
    renderRect: slot,
    rect: slot,
    parentNode: null,
    childNodes: [],
  };
}

describe("splitWouldOverflowMins", () => {
  it("vertical half too short", () => {
    expect(splitWouldOverflowMins(mins(0, 400), mins(0, 0), rect(800, 600), "vertical")).toBe(true);
  });

  it("horizontal OK when only vertical would overflow", () => {
    expect(splitWouldOverflowMins(mins(0, 400), mins(0, 0), rect(800, 600), "horizontal")).toBe(
      false
    );
  });

  it("fail-open on missing rect", () => {
    expect(splitWouldOverflowMins(mins(0, 400), mins(0, 0), null, "vertical")).toBe(false);
  });
});

describe("slotOverflowsMins", () => {
  it("true when min exceeds slot by more than ε", () => {
    expect(slotOverflowsMins(rect(800, 200), mins(0, 400), 4)).toBe(true);
    expect(slotOverflowsMins(rect(200, 800), mins(360, 0), 4)).toBe(true);
  });

  it("false when overage is within ε", () => {
    expect(slotOverflowsMins(rect(800, 396), mins(0, 400), 4)).toBe(false);
    expect(slotOverflowsMins(rect(800, 400), mins(0, 400), 4)).toBe(false);
  });

  it("fail-open on missing/zero rect", () => {
    expect(slotOverflowsMins(null, mins(400, 400))).toBe(false);
    expect(slotOverflowsMins(rect(0, 200), mins(400, 400))).toBe(false);
  });
});

describe("tabWouldOverflowMins", () => {
  it("full pane OK when half would overflow", () => {
    expect(tabWouldOverflowMins(mins(0, 400), mins(0, 0), rect(800, 600))).toBe(false);
  });

  it("blocks when pane shorter than either min", () => {
    expect(tabWouldOverflowMins(mins(0, 400), mins(0, 0), rect(800, 300))).toBe(true);
    expect(tabWouldOverflowMins(mins(0, 100), mins(0, 500), rect(800, 400))).toBe(true);
  });
});

describe("resolveOpenMinPlacement", () => {
  const lft = unit("lft", 100, 100, rect(800, 600));
  const slotRectFor = (u) => u.renderRect || u.rect;

  it("fail-open to split when mins unknown", () => {
    const bare = unit("bare", 0, 0, rect(200, 200));
    bare.nodeValue.get_size_hints = () => null;
    expect(
      resolveOpenMinPlacement({
        lftUnit: bare,
        newMins: mins(0, 0),
        orientation: "vertical",
        slotRectFor,
        candidates: [bare],
        // Bypass env floor so this asserts the pure unknown-mins path.
        unitMinsFor: () => mins(0, 0),
      })
    ).toEqual({ kind: "split" });
  });

  it("env floor on tiny LFT → float when split and tab overflow", () => {
    const bare = unit("bare", 0, 0, rect(200, 200));
    bare.nodeValue.get_size_hints = () => null;
    // Product floor 256×144 (setup uses tiny env for other fixtures).
    const productMins = () => mins(256, 144);
    expect(
      resolveOpenMinPlacement({
        lftUnit: bare,
        newMins: productMins(),
        orientation: "vertical",
        slotRectFor,
        candidates: [bare],
        unitMinsFor: productMins,
      })
    ).toEqual({ kind: "float" });
  });

  it("legal split → split", () => {
    expect(
      resolveOpenMinPlacement({
        lftUnit: lft,
        newMins: mins(200, 200),
        orientation: "horizontal",
        slotRectFor,
        candidates: [lft],
      })
    ).toEqual({ kind: "split" });
  });

  it("unknown slot geom → split (D032; do not tab blindly)", () => {
    const bare = unit("bare", 0, 0, null);
    bare.renderRect = null;
    bare.rect = null;
    expect(
      resolveOpenMinPlacement({
        lftUnit: bare,
        newMins: mins(320, 240),
        orientation: "horizontal",
        slotRectFor: () => null,
        candidates: [bare],
      })
    ).toEqual({ kind: "split" });
  });

  it("illegal split, LFT tab fits → tab on LFT", () => {
    const short = unit("short", 100, 100, rect(800, 600));
    const r = resolveOpenMinPlacement({
      lftUnit: short,
      newMins: mins(0, 400),
      orientation: "vertical",
      slotRectFor,
      candidates: [short],
    });
    expect(r).toEqual({ kind: "tab", targetUnit: short });
  });

  it("LFT tab illegal, neighbor fits → tab on neighbor", () => {
    const tiny = unit("tiny", 50, 50, rect(400, 300));
    const roomy = unit("roomy", 50, 50, rect(1200, 800));
    const r = resolveOpenMinPlacement({
      lftUnit: tiny,
      newMins: mins(0, 400),
      orientation: "vertical",
      slotRectFor,
      candidates: [tiny, roomy],
    });
    expect(r).toEqual({ kind: "tab", targetUnit: roomy });
  });

  it("all candidates illegal → float", () => {
    const a = unit("a", 50, 50, rect(400, 300));
    const b = unit("b", 50, 50, rect(500, 320));
    expect(
      resolveOpenMinPlacement({
        lftUnit: a,
        newMins: mins(0, 400),
        orientation: "vertical",
        slotRectFor,
        candidates: [a, b],
      })
    ).toEqual({ kind: "float" });
  });

  it("tab-only skips split even when half would fit", () => {
    // Horizontal half of 800 fits width 200; tab-only still returns tab.
    const r = resolveOpenMinPlacement({
      lftUnit: lft,
      newMins: mins(200, 200),
      orientation: "horizontal",
      mode: "tab-only",
      slotRectFor,
      candidates: [lft],
    });
    expect(r).toEqual({ kind: "tab", targetUnit: lft });
  });
});

describe("resolveTileOverflowPlacement", () => {
  const slotRectFor = (u) => u.renderRect || u.rect;

  it("never splits even when half would fit", () => {
    const self = unit("self", 100, 100, rect(800, 600));
    const neighbor = unit("n", 50, 50, rect(1200, 800));
    const r = resolveTileOverflowPlacement({
      selfUnit: self,
      lftUnit: self,
      newMins: mins(200, 200),
      slotRectFor,
      candidates: [self, neighbor],
    });
    expect(r).toEqual({ kind: "tab", targetUnit: neighbor });
  });

  it("skips self and a group that already contains self", () => {
    const self = unit("self", 50, 50, rect(400, 200));
    const group = {
      layout: "TABBED",
      isStackedOrTabbed: () => true,
      contains: (n) => n === self,
    };
    const roomy = unit("roomy", 50, 50, rect(1200, 800));
    const r = resolveTileOverflowPlacement({
      selfUnit: self,
      lftUnit: self,
      newMins: mins(0, 400),
      slotRectFor,
      candidates: [self, group, roomy],
    });
    expect(r).toEqual({ kind: "tab", targetUnit: roomy });
  });

  it("all remaining candidates illegal → float", () => {
    const self = unit("self", 50, 50, rect(400, 200));
    const tiny = unit("tiny", 50, 50, rect(400, 300));
    expect(
      resolveTileOverflowPlacement({
        selfUnit: self,
        lftUnit: self,
        newMins: mins(0, 400),
        slotRectFor,
        candidates: [self, tiny],
      })
    ).toEqual({ kind: "float" });
  });

  it("missing self → float", () => {
    expect(resolveTileOverflowPlacement({ newMins: mins(200, 200) })).toEqual({
      kind: "float",
    });
  });
});

describe("tabJoinUnit / bfsOpenMinTabCandidates", () => {
  it("tabJoinUnit lifts window under TABBED parent", () => {
    const group = {
      layout: "TABBED",
      isStackedOrTabbed: () => true,
      isWindow: () => false,
      childNodes: [],
    };
    const leaf = {
      nodeType: "WINDOW",
      isWindow: () => true,
      isFloat: () => false,
      isGrabTile: () => false,
      parentNode: group,
    };
    group.childNodes = [leaf];
    expect(tabJoinUnit(leaf, { TABBED: "TABBED", STACKED: "STACKED" })).toBe(group);
  });

  it("BFS lists start then sibling then uncle", () => {
    const mon = {
      nodeType: "MONITOR",
      isMonitor: () => true,
      childNodes: [],
      parentNode: null,
    };
    const left = unit("left", 0, 0, rect(900, 800));
    const right = unit("right", 0, 0, rect(900, 800));
    const split = {
      nodeType: "CON",
      layout: "HSPLIT",
      isCon: () => true,
      isStackedOrTabbed: () => false,
      isWindow: () => false,
      isMonitor: () => false,
      parentNode: mon,
      childNodes: [left, right],
    };
    left.parentNode = split;
    right.parentNode = split;
    mon.childNodes = [split];

    const order = bfsOpenMinTabCandidates(left, mon, { TABBED: "TABBED", STACKED: "STACKED" });
    expect(order[0]).toBe(left);
    expect(order).toContain(right);
    expect(order.indexOf(left)).toBeLessThan(order.indexOf(right));
  });

  it("BFS includes MONITOR child siblings", () => {
    const mon = {
      nodeType: "MONITOR",
      isMonitor: () => true,
      childNodes: [],
      parentNode: null,
    };
    const a = unit("a", 0, 0, rect(400, 300));
    const b = unit("b", 0, 0, rect(1400, 900));
    a.parentNode = mon;
    b.parentNode = mon;
    mon.childNodes = [a, b];
    const order = bfsOpenMinTabCandidates(a, mon, { TABBED: "TABBED", STACKED: "STACKED" });
    expect(order).toEqual([a, b]);
  });
});
