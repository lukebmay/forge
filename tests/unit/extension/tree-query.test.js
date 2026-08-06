import { describe, it, expect } from "vitest";
import {
  projectRect,
  windowMetaFields,
  projectNode,
  projectTree,
  projectForest,
  monitorMatches,
  TREE_QUERY_API_VERSION,
} from "../../../lib/extension/tree-query.js";
import { buildLiveMap } from "../../../lib/extension/monitor-identity.js";

function mockWin({ title = "T", wmClass = "App", id = 1 } = {}) {
  return {
    title,
    get_wm_class: () => wmClass,
    get_id: () => id,
    // Deliberately not serializable as plain JSON if leaked
    _meta: { live: true },
  };
}

function node(partial) {
  return {
    nodeType: partial.nodeType ?? "CON",
    layout: partial.layout ?? "HSPLIT",
    rect: partial.rect ?? null,
    percent: partial.percent ?? 0,
    userSized: partial.userSized ?? false,
    mode: partial.mode,
    nodeValue: partial.nodeValue,
    childNodes: partial.childNodes ?? [],
    isWindow: partial.isWindow,
    isMonitor: partial.isMonitor,
    stableKey: partial.stableKey,
    lastTabFocus: partial.lastTabFocus,
  };
}

describe("tree-query projectRect / windowMetaFields", () => {
  it("projectRect maps finite numbers or null", () => {
    expect(projectRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(projectRect(null)).toBeNull();
    expect(projectRect({ x: NaN, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it("windowMetaFields never returns the window object", () => {
    const win = mockWin({ title: "Hello", wmClass: "Foo", id: 42 });
    const f = windowMetaFields(win);
    expect(f).toEqual({
      wmClass: "Foo",
      title: "Hello",
      id: 42,
      pid: null,
      monitor: null,
    });
    expect(JSON.stringify(f)).toContain("Foo");
  });

  it("windowMetaFields swallows get_* throws", () => {
    const win = {
      get_wm_class: () => {
        throw new Error("dead");
      },
      get_title: () => {
        throw new Error("dead");
      },
      get_id: () => {
        throw new Error("dead");
      },
    };
    expect(windowMetaFields(win)).toEqual({
      wmClass: null,
      title: null,
      id: null,
      pid: null,
      monitor: null,
    });
  });
});

describe("tree-query projectNode / projectTree", () => {
  it("projects CON with children shape", () => {
    const win = mockWin();
    const root = node({
      nodeType: "CON",
      layout: "VSPLIT",
      percent: 0.5,
      userSized: true,
      rect: { x: 0, y: 0, width: 100, height: 200 },
      childNodes: [
        node({
          nodeType: "WINDOW",
          layout: null,
          mode: "TILE",
          nodeValue: win,
          percent: 1,
        }),
      ],
    });
    const p = projectTree(root);
    expect(p.nodeType).toBe("CON");
    expect(p.layout).toBe("VSPLIT");
    expect(p.percent).toBe(0.5);
    expect(p.userSized).toBe(true);
    expect(p.rect).toEqual({ x: 0, y: 0, width: 100, height: 200 });
    expect(p.children).toHaveLength(1);
    expect(p.children[0].nodeType).toBe("WINDOW");
    expect(p.children[0].wmClass).toBe("App");
    expect(p.children[0].title).toBe("T");
    expect(p.children[0].mode).toBe("TILE");
    expect(p.children[0].windowId).toBe(1);
    // No Meta-like object embedded
    expect(p.children[0].nodeValue).toBeUndefined();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("MONITOR gets id and optional stableKey from liveMap", () => {
    const liveMap = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    const mon = node({
      nodeType: "MONITOR",
      layout: "HSPLIT",
      nodeValue: "mo0ws0",
      childNodes: [],
    });
    const p = projectNode(mon, { liveMap });
    expect(p.id).toBe("mo0ws0");
    expect(p.stableKey).toBe("conn:DP-1");
  });

  it("respects maxDepth (include node, no deeper children)", () => {
    const deep = node({
      nodeType: "CON",
      childNodes: [
        node({
          nodeType: "CON",
          childNodes: [
            node({
              nodeType: "WINDOW",
              nodeValue: mockWin(),
              mode: "TILE",
            }),
          ],
        }),
      ],
    });
    const p = projectTree(deep, { maxDepth: 0 });
    expect(p.nodeType).toBe("CON");
    expect(p.children).toEqual([]);

    const p1 = projectTree(deep, { maxDepth: 1 });
    expect(p1.children).toHaveLength(1);
    expect(p1.children[0].children).toEqual([]);
  });
});

describe("tree-query projectForest / monitorMatches", () => {
  const mon0 = node({
    nodeType: "MONITOR",
    nodeValue: "mo0ws0",
    layout: "HSPLIT",
    childNodes: [
      node({
        nodeType: "WINDOW",
        nodeValue: mockWin({ title: "A" }),
        mode: "TILE",
      }),
    ],
  });
  const mon1 = node({
    nodeType: "MONITOR",
    nodeValue: "mo1ws0",
    layout: "HSPLIT",
    childNodes: [],
  });
  const monWs1 = node({
    nodeType: "MONITOR",
    nodeValue: "mo0ws1",
    layout: "HSPLIT",
    childNodes: [node({ nodeType: "CON", childNodes: [] })],
  });

  it("projectForest returns apiVersion and monitors", () => {
    const forest = projectForest([mon0, mon1]);
    expect(forest.apiVersion).toBe(TREE_QUERY_API_VERSION);
    expect(forest.monitors).toHaveLength(2);
    expect(forest.monitors[0].id).toBe("mo0ws0");
    expect(forest.monitors[0].children[0].title).toBe("A");
  });

  it("projectForest includes focusWindowId when provided", () => {
    const forest = projectForest([mon0], { focusWindowId: 99 });
    expect(forest.focusWindowId).toBe(99);
  });

  it("projectForest includes activeWorkspace and nWorkspaces when provided", () => {
    const forest = projectForest([mon0], {
      activeWorkspace: 2,
      nWorkspaces: 4,
    });
    expect(forest.activeWorkspace).toBe(2);
    expect(forest.nWorkspaces).toBe(4);
  });

  it("projectForest omits workspace meta when not provided", () => {
    const forest = projectForest([mon0]);
    expect(forest.activeWorkspace).toBeUndefined();
    expect(forest.nWorkspaces).toBeUndefined();
  });

  it("projectNode exports lastTabFocusId for tab/stack CONs", () => {
    const wFocus = mockWin({ title: "Grok", id: 7 });
    const tab = node({
      nodeType: "CON",
      layout: "TABBED",
      lastTabFocus: wFocus,
      childNodes: [
        node({ nodeType: "WINDOW", nodeValue: mockWin({ title: "A", id: 6 }), mode: "TILE" }),
        node({ nodeType: "WINDOW", nodeValue: wFocus, mode: "TILE" }),
      ],
    });
    const proj = projectNode(tab);
    expect(proj.lastTabFocusId).toBe(7);
  });

  it("filters by monitor index and workspace", () => {
    expect(monitorMatches(mon0, { monitor: 0 })).toBe(true);
    expect(monitorMatches(mon1, { monitor: 0 })).toBe(false);
    expect(monitorMatches(mon0, { monitor: "mo0ws0" })).toBe(true);
    expect(monitorMatches(monWs1, { workspace: 1 })).toBe(true);
    expect(monitorMatches(mon0, { workspace: 1 })).toBe(false);

    const f = projectForest([mon0, mon1, monWs1], { monitor: 0, workspace: 0 });
    expect(f.monitors.map((m) => m.id)).toEqual(["mo0ws0"]);
  });

  it("onlyWithChildren skips empty mons", () => {
    const f = projectForest([mon0, mon1], { onlyWithChildren: true });
    expect(f.monitors.map((m) => m.id)).toEqual(["mo0ws0"]);
  });

  it("filters by stableKey via liveMap", () => {
    const liveMap = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 100, height: 100 },
      { index: 1, connector: "HDMI-1", x: 100, y: 0, width: 100, height: 100 },
    ]);
    const f = projectForest([mon0, mon1], { monitor: "conn:HDMI-1", liveMap });
    expect(f.monitors.map((m) => m.id)).toEqual(["mo1ws0"]);
  });
});
