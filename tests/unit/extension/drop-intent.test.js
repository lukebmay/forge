import { describe, it, expect } from "vitest";
import {
  dropChangesStructure,
  shouldMergeCenterGroup,
} from "../../../lib/extension/drop-intent.js";

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
    const { parent, a, b } = vsplitPair();
    const op = centerOp({ containerNode: parent });
    expect(dropChangesStructure(b, a, op, { stackedOrTabbed: false })).toBe(true);
    expect(dropChangesStructure(a, b, op, { stackedOrTabbed: false })).toBe(true);
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
