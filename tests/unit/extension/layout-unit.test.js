import { describe, it, expect } from "vitest";
import { setLayout, isLayoutMode, LAYOUT_MODES } from "../../../lib/extension/layout-unit.js";

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
});
