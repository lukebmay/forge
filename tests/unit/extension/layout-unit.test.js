import { describe, it, expect } from "vitest";
import {
  setLayout,
  isLayoutMode,
  LAYOUT_MODES,
  resolveUngroupTarget,
  isUngroupCon,
  resolveFocusParent,
  resolveFocusChild,
  resolveRepresentativeWindow,
  resolveMoveUnit,
  resolveMoveOut,
  resolveMoveInSibling,
  isElevatedSelection,
  resolveOpsTarget,
  clearOpsTarget,
  resolveAttachOnFocusChange,
  resolveLayoutOpsTarget,
  resolveUngroupOpsTarget,
  resolveResizeOpsSeed,
} from "../../../lib/extension/layout-unit.js";

describe("layout-unit (I1 setLayout spine)", () => {
  it("exports the four CON layout modes", () => {
    expect(LAYOUT_MODES).toEqual(["HSPLIT", "VSPLIT", "TABBED", "STACKED"]);
  });

  it("isLayoutMode accepts only the four modes", () => {
    expect(isLayoutMode("HSPLIT")).toBe(true);
    expect(isLayoutMode("TABBED")).toBe(true);
    expect(isLayoutMode("ROOT")).toBe(false);
    expect(isLayoutMode("PRESET")).toBe(false);
    expect(isLayoutMode("")).toBe(false);
  });

  it("setLayout changes mode only and returns true", () => {
    const kids = [{ id: "a" }, { id: "b" }];
    const con = { layout: "HSPLIT", childNodes: kids, lastTabFocus: "old" };
    expect(setLayout(con, "VSPLIT")).toBe(true);
    expect(con.layout).toBe("VSPLIT");
    expect(con.childNodes).toBe(kids);
    expect(con.lastTabFocus).toBe("old");
  });

  it("setLayout does not reparent or mutate children (I1)", () => {
    const a = { id: "a" };
    const b = { id: "b", nested: true };
    const con = { layout: "HSPLIT", childNodes: [a, b] };
    setLayout(con, "TABBED", { lastTabFocus: a });
    expect(con.childNodes).toEqual([a, b]);
    expect(con.childNodes[0]).toBe(a);
    expect(con.childNodes[1]).toBe(b);
    expect(con.lastTabFocus).toBe(a);
  });

  it("setLayout clearLastTabFocus / lastTabFocus opts", () => {
    const con = { layout: "TABBED", lastTabFocus: "x" };
    setLayout(con, "STACKED", { clearLastTabFocus: true });
    expect(con.layout).toBe("STACKED");
    expect(con.lastTabFocus).toBe(null);

    setLayout(con, "TABBED", { lastTabFocus: "y" });
    expect(con.lastTabFocus).toBe("y");
  });

  it("setLayout rejects null con, invalid mode", () => {
    expect(setLayout(null, "HSPLIT")).toBe(false);
    expect(setLayout({}, "ROOT")).toBe(false);
    expect(setLayout({ layout: "HSPLIT" }, "nope")).toBe(false);
  });

  // I1: mode cycle must keep nested CON identity and sibling percents.
  it("mode cycle keeps nested CON identity and percents (I1)", () => {
    const nested = { id: "nested-con", layout: "HSPLIT", percent: 0.4, childNodes: [] };
    const win = { id: "w1", percent: 0.6, userSized: true };
    const con = { layout: "HSPLIT", childNodes: [win, nested] };
    const modes = ["VSPLIT", "TABBED", "STACKED", "HSPLIT", "TABBED", "VSPLIT", "STACKED"];
    for (const m of modes) {
      expect(setLayout(con, m)).toBe(true);
      expect(con.layout).toBe(m);
      expect(con.childNodes).toHaveLength(2);
      expect(con.childNodes[0]).toBe(win);
      expect(con.childNodes[1]).toBe(nested);
      expect(win.percent).toBe(0.6);
      expect(win.userSized).toBe(true);
      expect(nested.percent).toBe(0.4);
      expect(nested.layout).toBe("HSPLIT");
    }
  });
});

describe("layout-unit resolveUngroupTarget (I2)", () => {
  it("isUngroupCon only for CON", () => {
    expect(isUngroupCon({ nodeType: "CON" })).toBe(true);
    expect(isUngroupCon({ isCon: () => true })).toBe(true);
    expect(isUngroupCon({ nodeType: "MONITOR" })).toBe(false);
    expect(isUngroupCon(null)).toBe(false);
  });

  it("returns nearest parent CON", () => {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon };
    const win = { nodeType: "WINDOW", parentNode: outer };
    expect(resolveUngroupTarget(win)).toBe(outer);
  });

  it("no-op when parent is MONITOR only", () => {
    const mon = { nodeType: "MONITOR" };
    const win = { nodeType: "WINDOW", parentNode: mon };
    expect(resolveUngroupTarget(win)).toBeNull();
  });

  it("prefers nearest CON over outer nest", () => {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon };
    const inner = { nodeType: "CON", parentNode: outer };
    const win = { nodeType: "WINDOW", parentNode: inner };
    expect(resolveUngroupTarget(win)).toBe(inner);
  });
});

describe("layout-unit resolveFocusParent / Child (C4)", () => {
  it("resolveFocusParent returns nearest parent CON", () => {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon };
    const win = { nodeType: "WINDOW", parentNode: outer };
    expect(resolveFocusParent(win)).toBe(outer);
  });

  it("resolveFocusParent no-ops at monitor root", () => {
    const mon = { nodeType: "MONITOR" };
    const win = { nodeType: "WINDOW", parentNode: mon };
    expect(resolveFocusParent(win)).toBeNull();
  });

  it("resolveFocusParent walks from CON node to its parent CON", () => {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon };
    const inner = { nodeType: "CON", parentNode: outer };
    expect(resolveFocusParent(inner)).toBe(outer);
    expect(resolveFocusParent(outer)).toBeNull();
  });

  it("resolveFocusChild prefers lastChildHint then lastTabFocus then first", () => {
    const a = { id: "a", nodeType: "WINDOW", nodeValue: "meta-a" };
    const b = { id: "b", nodeType: "WINDOW", nodeValue: "meta-b" };
    const con = { nodeType: "CON", childNodes: [a, b], lastTabFocus: "meta-b" };
    expect(resolveFocusChild(con, a)).toBe(a);
    expect(resolveFocusChild(con)).toBe(b);
    con.lastTabFocus = null;
    expect(resolveFocusChild(con)).toBe(a);
  });

  it("resolveFocusChild no-ops on non-CON", () => {
    expect(resolveFocusChild({ nodeType: "MONITOR", childNodes: [] })).toBeNull();
    expect(resolveFocusChild(null)).toBeNull();
  });

  it("resolveRepresentativeWindow prefers current focus under con", () => {
    const metaA = { id: 1 };
    const metaB = { id: 2 };
    const a = { nodeType: "WINDOW", nodeValue: metaA };
    const b = { nodeType: "WINDOW", nodeValue: metaB };
    const con = {
      nodeType: "CON",
      childNodes: [a, b],
      lastTabFocus: metaB,
      contains: (n) => n === a || n === b,
    };
    a.parentNode = con;
    b.parentNode = con;
    expect(resolveRepresentativeWindow(con, a)).toBe(a);
    expect(resolveRepresentativeWindow(con, null)).toBe(b);
  });
});

describe("layout-unit ops target / selection (S1)", () => {
  function nest() {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon, childNodes: [] };
    const inner = { nodeType: "CON", parentNode: outer, childNodes: [] };
    const win = { nodeType: "WINDOW", parentNode: inner, nodeValue: { id: "w1" } };
    const win2 = { nodeType: "WINDOW", parentNode: outer, nodeValue: { id: "w2" } };
    outer.childNodes = [inner, win2];
    inner.childNodes = [win];
    outer.contains = (n) => n === win || n === win2 || n === inner || nodeUnder(n, outer);
    inner.contains = (n) => n === win || nodeUnder(n, inner);
    return { mon, outer, inner, win, win2 };
  }

  function nodeUnder(n, anc) {
    let p = n;
    while (p) {
      if (p === anc) return true;
      p = p.parentNode;
    }
    return false;
  }

  it("isElevatedSelection only when attach is CON above focus", () => {
    const { outer, inner, win } = nest();
    expect(isElevatedSelection(null, win)).toBe(false);
    expect(isElevatedSelection(win, win)).toBe(false);
    expect(isElevatedSelection(inner, win)).toBe(true);
    expect(isElevatedSelection(outer, win)).toBe(true);
    expect(isElevatedSelection({ nodeType: "MONITOR" }, win)).toBe(false);
  });

  it("resolveOpsTarget returns elevated CON or focus leaf", () => {
    const { outer, win } = nest();
    expect(resolveOpsTarget(null, win)).toBe(win);
    expect(resolveOpsTarget(win, win)).toBe(win);
    expect(resolveOpsTarget(outer, win)).toBe(outer);
    expect(resolveOpsTarget(null, null)).toBeNull();
  });

  it("clearOpsTarget snaps to focus leaf", () => {
    const { win } = nest();
    expect(clearOpsTarget(win)).toBe(win);
    expect(clearOpsTarget(null)).toBeNull();
  });

  it("multi-parent elevate: ops target walks outer then clears", () => {
    const { outer, inner, win } = nest();
    expect(resolveOpsTarget(inner, win)).toBe(inner);
    expect(resolveOpsTarget(outer, win)).toBe(outer);
    expect(resolveOpsTarget(clearOpsTarget(win), win)).toBe(win);
  });

  it("resolveAttachOnFocusChange resets on different window", () => {
    const { outer, win, win2 } = nest();
    // Elevated then user focuses sibling window → leaf
    expect(resolveAttachOnFocusChange(win, win2, outer)).toBe(win2);
  });

  it("resolveAttachOnFocusChange keeps elevated CON on same-window re-focus", () => {
    const { outer, win } = nest();
    expect(resolveAttachOnFocusChange(win, win, outer)).toBe(outer);
    // Same Meta identity via nodeValue
    const winAgain = { nodeType: "WINDOW", parentNode: win.parentNode, nodeValue: win.nodeValue };
    outer.contains = (n) => n === win || n === winAgain || nodeUnder(n, outer);
    expect(resolveAttachOnFocusChange(win, winAgain, outer)).toBe(outer);
  });

  it("resolveAttachOnFocusChange drops stale elevated CON", () => {
    const { outer, win } = nest();
    // Same window but attach no longer contains focus → leaf
    const orphan = { nodeType: "CON", contains: () => false };
    expect(resolveAttachOnFocusChange(win, win, orphan)).toBe(win);
  });
});

describe("layout-unit resolveMoveOut / MoveIn (C4)", () => {
  it("resolveMoveUnit prefers attach CON over window", () => {
    const win = { nodeType: "WINDOW" };
    const bag = {
      nodeType: "CON",
      contains: (n) => n === win,
    };
    expect(resolveMoveUnit(bag, win)).toBe(bag);
    expect(resolveMoveUnit(null, win)).toBe(win);
    expect(resolveMoveUnit(win, win)).toBe(win);
  });

  it("resolveMoveOut lifts unit when parent is CON under grandparent", () => {
    const mon = { nodeType: "MONITOR" };
    const con = { nodeType: "CON", parentNode: mon };
    const win = { nodeType: "WINDOW", parentNode: con };
    mon.childNodes = [con];
    con.childNodes = [win];
    const r = resolveMoveOut(win);
    expect(r).toEqual({ unit: win, parent: con, grandparent: mon });
  });

  it("resolveMoveOut no-ops under MONITOR", () => {
    const mon = { nodeType: "MONITOR" };
    const win = { nodeType: "WINDOW", parentNode: mon };
    expect(resolveMoveOut(win)).toBeNull();
  });

  it("resolveMoveInSibling prefers next then prev CON sibling", () => {
    const mon = { nodeType: "MONITOR" };
    const left = { nodeType: "CON", parentNode: mon };
    const win = { nodeType: "WINDOW", parentNode: mon };
    const right = { nodeType: "CON", parentNode: mon };
    mon.childNodes = [left, win, right];
    expect(resolveMoveInSibling(win)).toEqual({ unit: win, targetCon: right });

    mon.childNodes = [left, win];
    expect(resolveMoveInSibling(win)).toEqual({ unit: win, targetCon: left });

    mon.childNodes = [win, { nodeType: "WINDOW" }];
    expect(resolveMoveInSibling(win)).toBeNull();
  });
});

describe("layout-unit S2 ops matrix targets", () => {
  function nest() {
    const mon = { nodeType: "MONITOR" };
    const outer = { nodeType: "CON", parentNode: mon, layout: "HSPLIT" };
    const bag = { nodeType: "CON", parentNode: outer, layout: "TABBED" };
    const win = { nodeType: "WINDOW", parentNode: bag };
    const sibling = { nodeType: "WINDOW", parentNode: outer };
    mon.childNodes = [outer];
    outer.childNodes = [bag, sibling];
    bag.childNodes = [win];
    outer.contains = (n) => n === bag || n === win || n === sibling;
    bag.contains = (n) => n === win;
    return { mon, outer, bag, win, sibling };
  }

  it("resolveLayoutOpsTarget uses elevated CON else focus parent", () => {
    const { outer, bag, win } = nest();
    expect(resolveLayoutOpsTarget(outer, win)).toBe(outer);
    expect(resolveLayoutOpsTarget(bag, win)).toBe(bag);
    expect(resolveLayoutOpsTarget(null, win)).toBe(bag);
    expect(resolveLayoutOpsTarget(win, win)).toBe(bag);
    expect(resolveLayoutOpsTarget(null, null)).toBeNull();
  });

  it("resolveUngroupOpsTarget dissolves elevated CON else nearest parent", () => {
    const { outer, bag, win } = nest();
    expect(resolveUngroupOpsTarget(outer, win)).toBe(outer);
    expect(resolveUngroupOpsTarget(bag, win)).toBe(bag);
    // Leaf path: nearest parent CON of focus
    expect(resolveUngroupOpsTarget(null, win)).toBe(bag);
    expect(resolveUngroupOpsTarget(win, win)).toBe(bag);
  });

  it("resolveResizeOpsSeed matches ops target (elevated or leaf)", () => {
    const { outer, win } = nest();
    expect(resolveResizeOpsSeed(outer, win)).toBe(outer);
    expect(resolveResizeOpsSeed(null, win)).toBe(win);
    expect(resolveResizeOpsSeed(win, win)).toBe(win);
  });

  it("resolveMoveUnit aligns with resolveOpsTarget for directional move/swap", () => {
    const { outer, win } = nest();
    expect(resolveMoveUnit(outer, win)).toBe(resolveOpsTarget(outer, win));
    expect(resolveMoveUnit(null, win)).toBe(resolveOpsTarget(null, win));
  });
});
