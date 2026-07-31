import { describe, it, expect } from "vitest";
import {
  splitChromeAxis,
  isChromeSplit,
  findAncestorMonitor,
  collectSplitChromeTargets,
} from "../../../lib/extension/layout-chrome.js";

/** Minimal tree node for pure resolver tests. */
function node(props = {}) {
  return {
    id: props.id ?? "n",
    layout: props.layout ?? null,
    nodeType: props.nodeType ?? "WINDOW",
    parentNode: null,
    childNodes: [],
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
    if (n.nodeType === "CON" || n.nodeType === "MONITOR" || (n.layout && n.childNodes?.length)) {
      return getTiledChildren(n.childNodes).length > 0;
    }
    return n.tiled !== false;
  });
}

const accessors = { getTiledChildren };

describe("layout-chrome pure helpers", () => {
  it("splitChromeAxis maps HSPLIT/VSPLIT only", () => {
    expect(splitChromeAxis("HSPLIT")).toBe("H");
    expect(splitChromeAxis("VSPLIT")).toBe("V");
    expect(splitChromeAxis("TABBED")).toBe(null);
    expect(splitChromeAxis("STACKED")).toBe(null);
    expect(splitChromeAxis(null)).toBe(null);
  });

  it("isChromeSplit requires H/V + ≥2 tiled children", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    const con = node({ id: "con", nodeType: "CON", layout: "HSPLIT" });
    link(con, [a]);
    expect(isChromeSplit(con, getTiledChildren)).toBe(false);
    link(con, [a, b]);
    expect(isChromeSplit(con, getTiledChildren)).toBe(true);

    const bag = node({ id: "bag", nodeType: "CON", layout: "TABBED" });
    link(bag, [a, b]);
    expect(isChromeSplit(bag, getTiledChildren)).toBe(false);
  });

  it("findAncestorMonitor walks to MONITOR", () => {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "HSPLIT" });
    const con = node({ id: "con", nodeType: "CON", layout: "VSPLIT" });
    const w = node({ id: "w" });
    link(con, [w, node({ id: "w2" })]);
    link(mon, [con]);
    expect(findAncestorMonitor(w)).toBe(mon);
    expect(findAncestorMonitor(mon)).toBe(mon);
  });
});

describe("collectSplitChromeTargets — nested H-in-V ancestry", () => {
  // mon HSPLIT of two VSPLIT columns (2x2)
  function build2x2() {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "HSPLIT" });
    const colL = node({ id: "colL", nodeType: "CON", layout: "VSPLIT", percent: 0.5 });
    const colR = node({ id: "colR", nodeType: "CON", layout: "VSPLIT", percent: 0.5 });
    const tl = node({ id: "tl" });
    const bl = node({ id: "bl" });
    const tr = node({ id: "tr" });
    const br = node({ id: "br" });
    link(colL, [tl, bl]);
    link(colR, [tr, br]);
    link(mon, [colL, colR]);
    return { mon, colL, colR, tl, bl, tr, br };
  }

  it("ancestry includes both V column and H monitor (nearest first)", () => {
    const { mon, colL, tl } = build2x2();
    const targets = collectSplitChromeTargets(tl, { mode: "ancestry", ...accessors });
    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual({ con: colL, axis: "V" });
    expect(targets[1]).toEqual({ con: mon, axis: "H" });
  });

  it("all includes sibling branch splits not on focus path", () => {
    const { mon, colL, colR, tl } = build2x2();
    const targets = collectSplitChromeTargets(tl, { mode: "all", ...accessors });
    const cons = targets.map((t) => t.con);
    expect(cons).toContain(mon);
    expect(cons).toContain(colL);
    expect(cons).toContain(colR);
    expect(targets.find((t) => t.con === colR)?.axis).toBe("V");
  });

  it("ancestry does not include sibling column", () => {
    const { colR, tl } = build2x2();
    const targets = collectSplitChromeTargets(tl, { mode: "ancestry", ...accessors });
    expect(targets.map((t) => t.con)).not.toContain(colR);
  });
});

describe("collectSplitChromeTargets — tab/stack bag as unit start", () => {
  it("starts from bag (not window) so parent H/V is included once", () => {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "HSPLIT" });
    const bag = node({ id: "bag", nodeType: "CON", layout: "TABBED" });
    const other = node({ id: "other" });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(mon, [bag, other]);

    const targets = collectSplitChromeTargets(w1, { mode: "ancestry", ...accessors });
    expect(targets).toEqual([{ con: mon, axis: "H" }]);
    // Bag itself is not a split chrome target
    expect(targets.map((t) => t.con)).not.toContain(bag);
  });

  it("stacked bag same unit idea as tabbed", () => {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "VSPLIT" });
    const bag = node({ id: "bag", nodeType: "CON", layout: "STACKED" });
    const other = node({ id: "other" });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(mon, [bag, other]);

    const targets = collectSplitChromeTargets(w2, { mode: "ancestry", ...accessors });
    expect(targets).toEqual([{ con: mon, axis: "V" }]);
  });

  it("nested bag under V-in-H includes both splits", () => {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "HSPLIT" });
    const col = node({ id: "col", nodeType: "CON", layout: "VSPLIT" });
    const bag = node({ id: "bag", nodeType: "CON", layout: "TABBED" });
    const sib = node({ id: "sib" });
    const otherCol = node({ id: "otherCol" });
    const w1 = node({ id: "w1" });
    const w2 = node({ id: "w2" });
    link(bag, [w1, w2]);
    link(col, [bag, sib]);
    link(mon, [col, otherCol]);

    const targets = collectSplitChromeTargets(w1, { mode: "ancestry", ...accessors });
    expect(targets.map((t) => ({ id: t.con.id, axis: t.axis }))).toEqual([
      { id: "col", axis: "V" },
      { id: "mon", axis: "H" },
    ]);
  });
});

describe("collectSplitChromeTargets — guards", () => {
  it("returns empty without focus or accessors", () => {
    expect(collectSplitChromeTargets(null, accessors)).toEqual([]);
    expect(collectSplitChromeTargets(node({ id: "w" }), {})).toEqual([]);
  });

  it("skips single-child split CONs", () => {
    const mon = node({ id: "mon", nodeType: "MONITOR", layout: "HSPLIT" });
    const alone = node({ id: "alone", nodeType: "CON", layout: "VSPLIT" });
    const w = node({ id: "w" });
    const other = node({ id: "other" });
    link(alone, [w]);
    link(mon, [alone, other]);
    const targets = collectSplitChromeTargets(w, { mode: "ancestry", ...accessors });
    // alone has only one tiled child — not chrome-worthy; mon is
    expect(targets).toEqual([{ con: mon, axis: "H" }]);
  });
});
