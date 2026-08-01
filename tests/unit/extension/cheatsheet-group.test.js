import { describe, it, expect } from "vitest";
import {
  categoryDisplayOrder,
  cheatsheetCategoryDefs,
  resolveCategoryId,
  resizeSortRank,
  sortBindingsInCategory,
} from "../../../lib/extension/cheatsheet-group.js";

describe("cheatsheet-group", () => {
  describe("resolveCategoryId", () => {
    it("maps edge, expand, shrink, golden, and reset under Resize", () => {
      expect(resolveCategoryId("window-resize-left-increase")).toBe("Resize");
      expect(resolveCategoryId("window-expand")).toBe("Resize");
      expect(resolveCategoryId("window-shrink")).toBe("Resize");
      expect(resolveCategoryId("window-golden-ratio")).toBe("Resize");
      expect(resolveCategoryId("window-reset-sizes")).toBe("Resize");
    });

    it("keeps other window prefixes distinct", () => {
      expect(resolveCategoryId("window-focus-left")).toBe("Focus");
      expect(resolveCategoryId("window-snap-center")).toBe("Snap");
      expect(resolveCategoryId("window-toggle-float")).toBe("Window Toggle");
      expect(resolveCategoryId("window-gap-size-increase")).toBe("Gaps");
    });

    it("returns null for unknown prefixes", () => {
      expect(resolveCategoryId("totally-made-up-key")).toBeNull();
    });

    it("does not leave a separate Window Size or Window Reset id", () => {
      const ids = new Set(cheatsheetCategoryDefs().map((d) => d.id));
      expect(ids.has("Window Size")).toBe(false);
      expect(ids.has("Window Reset")).toBe(false);
      expect(ids.has("Resize")).toBe(true);
    });
  });

  describe("categoryDisplayOrder", () => {
    it("lists Resize once among unique section ids", () => {
      const order = categoryDisplayOrder();
      expect(order.filter((id) => id === "Resize")).toHaveLength(1);
      expect(order.indexOf("Resize")).toBeLessThan(order.indexOf("Snap"));
    });
  });

  describe("resizeSortRank / sortBindingsInCategory", () => {
    it("orders edges → expand → shrink → golden → reset", () => {
      expect(resizeSortRank("window-resize-right-increase")).toBe(0);
      expect(resizeSortRank("window-expand")).toBe(1);
      expect(resizeSortRank("window-shrink")).toBe(2);
      expect(resizeSortRank("window-golden-ratio")).toBe(3);
      expect(resizeSortRank("window-reset-sizes")).toBe(4);
    });

    it("sorts Resize bindings into the product order", () => {
      const input = [
        { key: "window-reset-sizes", shortcut: "=" },
        { key: "window-expand", shortcut: "]" },
        { key: "window-resize-left-increase", shortcut: "y" },
        { key: "window-golden-ratio", shortcut: "g" },
        { key: "window-shrink", shortcut: "[" },
        { key: "window-resize-right-increase", shortcut: "o" },
      ];
      const sorted = sortBindingsInCategory("Resize", input);
      expect(sorted.map((b) => b.key)).toEqual([
        "window-resize-left-increase",
        "window-resize-right-increase",
        "window-expand",
        "window-shrink",
        "window-golden-ratio",
        "window-reset-sizes",
      ]);
    });

    it("does not reorder non-Resize categories", () => {
      const input = [
        { key: "window-focus-right", shortcut: "l" },
        { key: "window-focus-left", shortcut: "h" },
      ];
      expect(sortBindingsInCategory("Focus", input)).toBe(input);
    });
  });
});
