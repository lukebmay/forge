import { describe, it, expect } from "vitest";
import {
  RESIZE_AXIS,
  isSplitLayout,
  isTabOrStackLayout,
  splitAxis,
  layoutUnit,
  pickSplitPair,
  resolveOwningSplit,
  resolveOwningSplitsBothAxes,
} from "../../../lib/extension/layout-resize.js";

/** Minimal tree node for pure resolver tests. */
function node(props = {}) {
  return {
    id: props.id ?? "n",
    layout: props.layout ?? null,
    parentNode: null,
    childNodes: [],
    percent: props.percent ?? 0.5,
    tiled: props.tiled !== false,
    ...props,
  };
}

function link(parent, children) {
  parent.childNodes = children;
  for (const c of children) c.parentNode = parent;
  return parent;
}

/** Tiled = marked tiled; CONs with any tiled descendant count as tiled. */
function getTiledChildren(items) {
  if (!items) return [];
  return items.filter((n) => {
    if (n.tiled === false) return false;
    if (n.layout && n.childNodes?.length) {
      return getTiledChildren(n.childNodes).length > 0;
    }
    return n.tiled !== false;
  });
}

const accessors = { getTiledChildren };

describe("layout-resize pure helpers", () => {
  it("isSplitLayout / isTabOrStackLayout / splitAxis", () => {
    expect(isSplitLayout("HSPLIT")).toBe(true);
    expect(isSplitLayout("VSPLIT")).toBe(true);
    expect(isSplitLayout("TABBED")).toBe(false);
    expect(isTabOrStackLayout("TABBED")).toBe(true);
    expect(isTabOrStackLayout("STACKED")).toBe(true);
    expect(isTabOrStackLayout("HSPLIT")).toBe(false);
    expect(splitAxis("HSPLIT")).toBe(RESIZE_AXIS.HORIZONTAL);
    expect(splitAxis("VSPLIT")).toBe(RESIZE_AXIS.VERTICAL);
    expect(splitAxis("TABBED")).toBe(null);
    expect(splitAxis("STACKED")).toBe(null);
  });

  it("layoutUnit is the node when parent is a split", () => {
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    link(mon, [a, b]);
    expect(layoutUnit(a)).toBe(a);
  });

  it("layoutUnit is the bag when focus is inside TABBED/STACKED", () => {
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const bag = node({ id: "bag", layout: "TABBED" });
    const other = node({ id: "other" });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(mon, [bag, other]);
    expect(layoutUnit(w1)).toBe(bag);
    expect(layoutUnit(w2)).toBe(bag);

    bag.layout = "STACKED";
    expect(layoutUnit(w1)).toBe(bag);
  });

  it("layoutUnit walks nested tab bags", () => {
    const outer = node({ id: "outer", layout: "TABBED" });
    const inner = node({ id: "inner", layout: "STACKED" });
    const w = node({ id: "w" });
    link(inner, [w]);
    link(outer, [inner]);
    expect(layoutUnit(w)).toBe(outer);
  });

  it("pickSplitPair prefers next, else previous", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    const c = node({ id: "c" });
    expect(pickSplitPair(a, [a, b, c])).toBe(b);
    expect(pickSplitPair(c, [a, b, c])).toBe(b);
    expect(pickSplitPair(a, [a])).toBe(null);
    expect(pickSplitPair(a, [])).toBe(null);
  });
});

describe("resolveOwningSplit — nested H-in-V (off-axis walks ancestor)", () => {
  // monitor HSPLIT of two VSPLIT columns (same shape as gm0z 2x2)
  function build2x2() {
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const colL = node({ id: "colL", layout: "VSPLIT", percent: 0.5 });
    const colR = node({ id: "colR", layout: "VSPLIT", percent: 0.5 });
    const tl = node({ id: "tl", percent: 0.5 });
    const bl = node({ id: "bl", percent: 0.5 });
    const tr = node({ id: "tr", percent: 0.5 });
    const br = node({ id: "br", percent: 0.5 });
    link(colL, [tl, bl]);
    link(colR, [tr, br]);
    link(mon, [colL, colR]);
    return { mon, colL, colR, tl, bl, tr, br };
  }

  it("vertical edge owns the column VSPLIT (window vs row sibling)", () => {
    const { tl, bl, colL } = build2x2();
    const res = resolveOwningSplit(tl, RESIZE_AXIS.VERTICAL, accessors);
    expect(res).not.toBeNull();
    expect(res.target).toBe(tl);
    expect(res.pair).toBe(bl);
    expect(res.parent).toBe(colL);
    expect(res.axis).toBe(RESIZE_AXIS.VERTICAL);
  });

  it("horizontal edge walks off-axis column to monitor HSPLIT (column vs column)", () => {
    const { tl, colL, colR, mon } = build2x2();
    const res = resolveOwningSplit(tl, RESIZE_AXIS.HORIZONTAL, accessors);
    expect(res).not.toBeNull();
    expect(res.target).toBe(colL);
    expect(res.pair).toBe(colR);
    expect(res.parent).toBe(mon);
    expect(res.axis).toBe(RESIZE_AXIS.HORIZONTAL);
  });

  it("rightmost column still finds horizontal pair (previous sibling)", () => {
    const { tr, colL, colR, mon } = build2x2();
    const res = resolveOwningSplit(tr, RESIZE_AXIS.HORIZONTAL, accessors);
    expect(res.target).toBe(colR);
    expect(res.pair).toBe(colL);
    expect(res.parent).toBe(mon);
  });

  it("both-axes resolve returns horizontal then vertical targets", () => {
    const { tl, bl, colL, colR } = build2x2();
    const both = resolveOwningSplitsBothAxes(tl, accessors);
    expect(both).toHaveLength(2);
    expect(both[0].axis).toBe(RESIZE_AXIS.HORIZONTAL);
    expect(both[0].target).toBe(colL);
    expect(both[0].pair).toBe(colR);
    expect(both[1].axis).toBe(RESIZE_AXIS.VERTICAL);
    expect(both[1].target).toBe(tl);
    expect(both[1].pair).toBe(bl);
  });
});

describe("resolveOwningSplit — tab/stack unit is bag", () => {
  it("resizes bag against split parent, not a leaf inside the bag", () => {
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const bag = node({ id: "bag", layout: "TABBED", percent: 0.5 });
    const other = node({ id: "other", percent: 0.5 });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(mon, [bag, other]);

    const res = resolveOwningSplit(w1, RESIZE_AXIS.HORIZONTAL, accessors);
    expect(res).not.toBeNull();
    expect(res.target).toBe(bag);
    expect(res.pair).toBe(other);
    expect(res.parent).toBe(mon);
    // Must not treat w1 as target (leaf inside bag)
    expect(res.target).not.toBe(w1);
  });

  it("STACKED bag same as TABBED for unit lift", () => {
    const mon = node({ id: "mon", layout: "VSPLIT" });
    const bag = node({ id: "bag", layout: "STACKED", percent: 0.5 });
    const other = node({ id: "other", percent: 0.5 });
    const w = node({ id: "w" });
    link(bag, [w]);
    link(mon, [bag, other]);

    const res = resolveOwningSplit(w, RESIZE_AXIS.VERTICAL, accessors);
    expect(res.target).toBe(bag);
    expect(res.pair).toBe(other);
  });
});

describe("resolveOwningSplit — no-op when no ancestor on axis has pair", () => {
  it("returns null for sole tiled child (no pair)", () => {
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const only = node({ id: "only" });
    link(mon, [only]);
    expect(resolveOwningSplit(only, RESIZE_AXIS.HORIZONTAL, accessors)).toBeNull();
    expect(resolveOwningSplit(only, RESIZE_AXIS.VERTICAL, accessors)).toBeNull();
  });

  it("returns null when only off-axis split exists (no ancestor on requested axis)", () => {
    // Flat VSPLIT only — no horizontal owning split
    const mon = node({ id: "mon", layout: "VSPLIT" });
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    link(mon, [a, b]);
    expect(resolveOwningSplit(a, RESIZE_AXIS.VERTICAL, accessors)).not.toBeNull();
    expect(resolveOwningSplit(a, RESIZE_AXIS.HORIZONTAL, accessors)).toBeNull();
  });

  it("returns null for null focus / bad axis / missing accessors", () => {
    expect(resolveOwningSplit(null, RESIZE_AXIS.HORIZONTAL, accessors)).toBeNull();
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const a = node({ id: "a" });
    link(mon, [a, node({ id: "b" })]);
    expect(resolveOwningSplit(a, "DIAGONAL", accessors)).toBeNull();
    expect(resolveOwningSplit(a, RESIZE_AXIS.HORIZONTAL, {})).toBeNull();
  });

  it("skips TABBED parent as split (no pair inside bag)", () => {
    // Two tabs only under monitor via bag — bag has no H/V split pair outside
    const mon = node({ id: "mon", layout: "HSPLIT" });
    const bag = node({ id: "bag", layout: "TABBED" });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(mon, [bag]); // sole child of mon → no pair for bag either
    expect(resolveOwningSplit(w1, RESIZE_AXIS.HORIZONTAL, accessors)).toBeNull();
    expect(resolveOwningSplit(w1, RESIZE_AXIS.VERTICAL, accessors)).toBeNull();
  });
});
