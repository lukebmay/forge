import { describe, expect, it, vi } from "vitest";
import { activateWindowNode, treeFinishMove } from "../../../lib/extension/tree-api-nav.js";

describe("treeFinishMove (G8n-s4 peel)", () => {
  it("renormalizes both parents and collapses single-child tab/stack", () => {
    const resetLayoutSingleChild = vi.fn();
    const parentNode = {
      isStackedOrTabbed: () => false,
      resetLayoutSingleChild,
      parentNode: { childNodes: [1, 2] },
      childNodes: [],
    };
    const parentTarget = { childNodes: [parentNode, {}] };
    const tree = { resetSiblingPercent: vi.fn() };
    treeFinishMove(tree, parentNode, parentTarget);
    expect(tree.resetSiblingPercent).toHaveBeenCalledWith(parentNode);
    expect(tree.resetSiblingPercent).toHaveBeenCalledWith(parentTarget);
    expect(resetLayoutSingleChild).toHaveBeenCalled();
    expect(parentTarget.layout).toBeUndefined();
  });

  it("LX2: peeled tab pair takes layout from group rect", () => {
    const extracted = { id: "x" };
    const parentNode = {
      isStackedOrTabbed: () => true,
      rect: { width: 400, height: 800 },
      resetLayoutSingleChild: vi.fn(),
      childNodes: [],
    };
    const parentTarget = { childNodes: [parentNode, extracted] };
    parentNode.parentNode = parentTarget;
    const tree = {
      resetSiblingPercent: vi.fn(),
      extWm: { determineSplitLayoutForRect: vi.fn(() => "VSPLIT") },
    };
    treeFinishMove(tree, parentNode, parentTarget);
    expect(tree.extWm.determineSplitLayoutForRect).toHaveBeenCalledWith({
      width: 400,
      height: 800,
    });
    expect(parentTarget.layout).toBe("VSPLIT");
  });
});

describe("activateWindowNode (G8n-s4 peel)", () => {
  it("returns null when next or meta is missing", () => {
    const tree = { extWm: {} };
    expect(activateWindowNode(tree, null, 1)).toBeNull();
    expect(activateWindowNode(tree, { nodeValue: null }, 1)).toBeNull();
  });

  it("minimized without direction does not retry focus", () => {
    const tree = { extWm: { focusMetaWindow: null }, focus: vi.fn() };
    const next = { nodeValue: { minimized: true } };
    expect(activateWindowNode(tree, next, undefined)).toBeNull();
    expect(tree.focus).not.toHaveBeenCalled();
  });

  it("raises and activates a live TILE window", () => {
    const prevDisplay = global.display;
    global.display = { get_current_time: () => 1 };
    try {
      const metaWindow = {
        minimized: false,
        raise: vi.fn(),
        focus: vi.fn(),
        activate: vi.fn(),
        get_monitor: () => 0,
        get_work_area_current_monitor: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      };
      const next = { nodeValue: metaWindow };
      const tree = {
        extWm: {
          focusMetaWindow: null,
          getPointer: () => [10, 10],
          movePointerWith: vi.fn(),
        },
        settings: { get_boolean: () => false },
      };
      expect(activateWindowNode(tree, next, 1)).toBe(next);
      expect(metaWindow.raise).toHaveBeenCalled();
      expect(metaWindow.focus).toHaveBeenCalled();
      expect(metaWindow.activate).toHaveBeenCalled();
    } finally {
      global.display = prevDisplay;
    }
  });
});
