import { describe, it, expect } from "vitest";
import {
  nodeGetNodeByLayout,
  nodeGetNodeByMode,
  treeDebugNode,
  treeDebugParentNodes,
} from "../../../lib/extension/tree-api-query.js";

describe("query liveById merge (G8e empty GObject lists)", () => {
  it("getNodeByLayout finds live CON when ROOT.childNodes is empty", () => {
    const vsplit = { layout: "VSPLIT", nodeType: "CON", childNodes: [] };
    const tree = {
      layout: "ROOT",
      nodeType: "ROOT",
      childNodes: [],
      extWm: { liveById: new Map([["c1", vsplit]]) },
    };
    expect(nodeGetNodeByLayout(tree, "VSPLIT")).toEqual([vsplit]);
  });

  it("getNodeByMode finds live WINDOW when lists are empty", () => {
    const win = { mode: "TILE", nodeType: "WINDOW", childNodes: [] };
    const tree = {
      layout: "ROOT",
      nodeType: "ROOT",
      childNodes: [],
      wm: { liveById: new Map([["w1", win]]) },
    };
    expect(nodeGetNodeByMode(tree, "TILE")).toEqual([win]);
  });
});

describe("debug peel (no-op when debug off)", () => {
  it("debugNode / debugParentNodes do not throw on a stub node", () => {
    const tree = { extWm: { focusMetaWindow: null } };
    const node = {
      level: 0,
      index: 0,
      nodeType: "CON",
      nodeValue: "c",
      layout: "HSPLIT",
      parentNode: null,
      isWindow: () => false,
      isCon: () => true,
      isMonitor: () => false,
      isWorkspace: () => false,
    };
    expect(() => treeDebugNode(tree, node)).not.toThrow();
    expect(() => treeDebugParentNodes(tree, node)).not.toThrow();
    expect(() => treeDebugParentNodes(tree, null)).not.toThrow();
  });
});
