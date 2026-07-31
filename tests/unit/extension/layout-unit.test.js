import { describe, it, expect } from "vitest";
import {
  setLayout,
  isLayoutMode,
  LAYOUT_MODES,
  resolveUngroupTarget,
  isUngroupCon,
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
