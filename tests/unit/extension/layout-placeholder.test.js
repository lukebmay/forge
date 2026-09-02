import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PLACEHOLDER_WM_CLASS,
  PLACEHOLDER_ROLE,
  PLACEHOLDER_TITLE,
  PLACEHOLDER_ISOLATE_LAYOUT_REASON,
  PLACEHOLDER_REMOVE_LAYOUT_REASON,
  PLACEHOLDER_FAILED_OPEN_LAYOUT_REASON,
  PLACEHOLDER_SKELETON_LAYOUT_REASON,
  createPlaceholderStub,
  isPlaceholderValue,
  isPlaceholderNode,
  isPlaceholderWmClass,
  shouldSkipThrashIsolate,
  markPlaceholderNode,
  planIsolateThrash,
  planRemovePlaceholder,
  executeIsolateThrash,
  executeRemovePlaceholder,
  layoutPlaceholderTitle,
  parseLayoutPlaceholderTitle,
  findSiblingLayoutPlaceholder,
  layoutPlaceholderMatchesWant,
  pickLayoutPlaceholder,
  _resetPlaceholderStubSeqForTests,
} from "../../../lib/extension/layout-placeholder.js";
import { projectNode } from "../../../lib/extension/tree-query.js";
import { collectTileVerifyInputs } from "../../../lib/extension/layout-verify.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createTreeFixture,
  createWindowManagerFixture,
  createWindowNode,
  getWorkspaceAndMonitor,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";

describe("layout-placeholder pure helpers", () => {
  beforeEach(() => {
    _resetPlaceholderStubSeqForTests();
  });

  it("createPlaceholderStub has known class/role and alive get_id", () => {
    const s = createPlaceholderStub({ reason: "timeout" });
    expect(s._forgePlaceholder).toBe(true);
    expect(s.wm_class).toBe(PLACEHOLDER_WM_CLASS);
    expect(s.role).toBe(PLACEHOLDER_ROLE);
    expect(s.get_wm_class()).toBe(PLACEHOLDER_WM_CLASS);
    expect(s.get_title()).toBe(PLACEHOLDER_TITLE);
    expect(s.get_id()).toMatch(/^forge-ph-/);
    expect(isPlaceholderValue(s)).toBe(true);
    expect(isPlaceholderWmClass(PLACEHOLDER_WM_CLASS)).toBe(true);
    // Meta surface used by paint / processFloats / decoration paths
    expect(typeof s.get_window_type).toBe("function");
    expect(s.get_window_type()).toBe(0);
    expect(s.showing_on_its_workspace()).toBe(true);
    expect(s.get_frame_rect()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    // windowHomeReconcile calls get_workspace (R036)
    expect(typeof s.get_workspace).toBe("function");
    expect(s.get_workspace().index()).toBe(0);
  });

  it("slot-tagged skeleton stub encodes title and layout fields (CT1)", () => {
    const s = createPlaceholderStub({
      layoutSlot: "mon0.left-tab",
      layoutRole: "chrome-luke",
      reason: PLACEHOLDER_SKELETON_LAYOUT_REASON,
    });
    expect(s.layoutSlot).toBe("mon0.left-tab");
    expect(s.layoutRole).toBe("chrome-luke");
    expect(s.get_title()).toBe("forge-ph:mon0.left-tab:chrome-luke");
    expect(layoutPlaceholderTitle("mon0.term", "ghostty-left")).toBe(
      "forge-ph:mon0.term:ghostty-left"
    );
    expect(parseLayoutPlaceholderTitle(s.get_title())).toEqual({
      slot: "mon0.left-tab",
      role: "chrome-luke",
    });
  });

  it("isPlaceholderNode respects flag and stub value", () => {
    expect(isPlaceholderNode(null)).toBe(false);
    expect(isPlaceholderNode({ placeholder: true })).toBe(true);
    const stub = createPlaceholderStub();
    expect(isPlaceholderNode({ nodeValue: stub })).toBe(true);
    expect(isPlaceholderNode({ nodeValue: { wm_class: "ghostty" } })).toBe(false);
  });

  it("R045: findSiblingLayoutPlaceholder finds PH beside a real window", () => {
    const parent = { childNodes: [] };
    const win = { placeholder: false, nodeValue: { wm_class: "inkscape" }, parentNode: parent };
    const ph = {
      placeholder: true,
      layoutRole: "inkscape",
      layoutSlot: "mon0.inkscape",
      nodeValue: createPlaceholderStub({
        layoutSlot: "mon0.inkscape",
        layoutRole: "inkscape",
      }),
      parentNode: parent,
    };
    parent.childNodes.push(win, ph);
    expect(findSiblingLayoutPlaceholder(win)).toBe(ph);
    expect(findSiblingLayoutPlaceholder(ph)).toBeNull();
    expect(findSiblingLayoutPlaceholder(win)).not.toBe(win);
  });

  it("R045: findSiblingLayoutPlaceholder refuses foreign-role PH", () => {
    const parent = { childNodes: [] };
    const win = { placeholder: false, nodeValue: { wm_class: "Grok" }, parentNode: parent };
    const ghostPh = {
      placeholder: true,
      layoutRole: "ghostty",
      layoutSlot: "mon0.ghostty",
      nodeValue: createPlaceholderStub({
        layoutSlot: "mon0.ghostty",
        layoutRole: "ghostty",
      }),
      parentNode: parent,
    };
    parent.childNodes.push(win, ghostPh);
    expect(
      findSiblingLayoutPlaceholder(win, { layoutRole: "Grok", wmClass: "chrome-ggjo-Default" })
    ).toBeNull();
    expect(layoutPlaceholderMatchesWant(ghostPh, { layoutRole: "Grok" })).toBe(false);
    expect(layoutPlaceholderMatchesWant(ghostPh, { layoutRole: "ghostty" })).toBe(true);
  });

  it("Forest-only PH sibling (parentNode null) is found when wm is passed", () => {
    const ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 1 } },
    });
    try {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      monitor.layout = "HSPLIT";
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        mode: "TILE",
        windowOverrides: {
          id: "ink",
          workspace: ctx.workspaces[0],
          monitor: 0,
          wm_class: "inkscape",
          rect: { x: 0, y: 0, width: 800, height: 600 },
        },
      });
      const ph = ctx.tree.createPlaceholderLeaf(monitor, {
        layoutSlot: "mon0.inkscape",
        layoutRole: "inkscape",
        reason: "layout-skeleton",
      });
      seedLiveForest(ctx.windowManager);
      try {
        monitor.removeChild(ph);
      } catch (_e) {
        /* */
      }
      nodeWindow.parentNode = null;
      ph.parentNode = null;
      expect(nodeWindow.parentNode).toBeNull();
      expect(ph.parentNode).toBeNull();
      expect(findSiblingLayoutPlaceholder(nodeWindow, { layoutRole: "inkscape" })).toBeNull();
      expect(
        findSiblingLayoutPlaceholder(
          nodeWindow,
          { layoutRole: "inkscape" },
          ctx.windowManager
        )
      ).toBe(ph);
    } finally {
      ctx.cleanup();
    }
  });

  it("R045: pickLayoutPlaceholder prefers role when slot mismatches", () => {
    const ph = {
      placeholder: true,
      layoutRole: "inkscape",
      layoutSlot: "mon0.inkscape",
      nodeValue: createPlaceholderStub({
        layoutSlot: "mon0.inkscape",
        layoutRole: "inkscape",
      }),
    };
    const other = {
      placeholder: true,
      layoutRole: "ghostty",
      layoutSlot: "mon1.ghostty",
      nodeValue: createPlaceholderStub({
        layoutSlot: "mon1.ghostty",
        layoutRole: "ghostty",
      }),
    };
    expect(
      pickLayoutPlaceholder([ph, other], {
        layoutRole: "inkscape",
        layoutSlot: "mon0",
      })
    ).toBe(ph);
    expect(
      pickLayoutPlaceholder([ph, other], {
        layoutRole: "inkscape",
        layoutSlot: "mon0.inkscape",
      })
    ).toBe(ph);
    expect(pickLayoutPlaceholder([ph, other], { layoutRole: "missing" })).toBeNull();
  });

  it("shouldSkipThrashIsolate prevents placeholder thrash loop", () => {
    const ph = markPlaceholderNode({ nodeType: "WINDOW", mode: "TILE" });
    expect(shouldSkipThrashIsolate(ph)).toBe(true);
    expect(shouldSkipThrashIsolate({ nodeValue: createPlaceholderStub() })).toBe(true);
    expect(shouldSkipThrashIsolate({ nodeValue: { wm_class: "App" } })).toBe(false);
  });

  it("planIsolateThrash floats mapped client and inserts placeholder", () => {
    const parent = { id: "p" };
    const client = {
      nodeType: "WINDOW",
      mode: "TILE",
      percent: 0.4,
      userSized: true,
      parentNode: parent,
      nodeValue: { id: 1 },
    };
    const plan = planIsolateThrash({ clientNode: client, reason: "budget" });
    expect(plan.ok).toBe(true);
    expect(plan.floatClient).toBe(true);
    expect(plan.insertPlaceholder).toBe(true);
    expect(plan.percent).toBe(0.4);
    expect(plan.userSized).toBe(true);
    expect(plan.layoutReason).toBe(PLACEHOLDER_ISOLATE_LAYOUT_REASON);
  });

  it("planIsolateThrash refuses placeholder client (no thrash loop)", () => {
    const ph = markPlaceholderNode({
      nodeType: "WINDOW",
      parentNode: {},
      nodeValue: createPlaceholderStub(),
    });
    const plan = planIsolateThrash({ clientNode: ph });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("is-placeholder");
    expect(plan.insertPlaceholder).toBe(false);
  });

  it("planIsolateThrash failed-open needs parent only", () => {
    const parent = { id: "mon" };
    const plan = planIsolateThrash({ parentNode: parent, reason: "open-timeout" });
    expect(plan.ok).toBe(true);
    expect(plan.floatClient).toBe(false);
    expect(plan.insertPlaceholder).toBe(true);
    expect(plan.layoutReason).toBe(PLACEHOLDER_FAILED_OPEN_LAYOUT_REASON);
  });

  it("executeIsolateThrash floats client, inserts PH, one layout commit", () => {
    const parent = { children: [] };
    const client = {
      nodeType: "WINDOW",
      mode: "TILE",
      percent: 0.5,
      userSized: false,
      parentNode: parent,
      nodeValue: { id: "thrashy" },
    };
    const layouts = [];
    const epochs = [];
    let placeholder = null;

    const out = executeIsolateThrash(
      { clientNode: client, reason: "thrash" },
      {
        floatClient: (n) => {
          n.mode = "FLOAT";
        },
        createPlaceholder: (opts) => {
          placeholder = markPlaceholderNode({
            nodeType: "WINDOW",
            mode: "TILE",
            percent: opts.percent,
            parentNode: opts.parentNode,
            nodeValue: createPlaceholderStub({ reason: opts.reason }),
          });
          return placeholder;
        },
        requestLayout: (r) => layouts.push(r),
        clearEpoch: (m) => epochs.push(m),
      }
    );

    expect(out.ok).toBe(true);
    expect(out.floated).toBe(true);
    expect(client.mode).toBe("FLOAT");
    expect(out.placeholder).toBe(placeholder);
    expect(isPlaceholderNode(placeholder)).toBe(true);
    expect(placeholder.percent).toBe(0.5);
    expect(layouts).toEqual([PLACEHOLDER_ISOLATE_LAYOUT_REASON]);
    expect(out.layoutCalls).toBe(1);
    expect(epochs).toEqual([client.nodeValue]);
  });

  it("executeIsolateThrash does not re-isolate a placeholder", () => {
    const layouts = [];
    const ph = markPlaceholderNode({
      nodeType: "WINDOW",
      parentNode: {},
      nodeValue: createPlaceholderStub(),
    });
    const out = executeIsolateThrash(
      { clientNode: ph },
      {
        createPlaceholder: () => ({}),
        requestLayout: (r) => layouts.push(r),
      }
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("is-placeholder");
    expect(layouts).toEqual([]);
    expect(out.layoutCalls).toBe(0);
  });

  it("executeRemovePlaceholder drops leaf and reflows once", () => {
    const removed = [];
    const layouts = [];
    const ph = markPlaceholderNode({
      nodeType: "WINDOW",
      nodeValue: createPlaceholderStub(),
    });
    const out = executeRemovePlaceholder(
      { node: ph },
      {
        removeNode: (n) => removed.push(n),
        requestLayout: (r) => layouts.push(r),
      }
    );
    expect(out.ok).toBe(true);
    expect(removed).toEqual([ph]);
    expect(layouts).toEqual([PLACEHOLDER_REMOVE_LAYOUT_REASON]);
    expect(out.layoutCalls).toBe(1);
  });

  it("executeRemovePlaceholder rejects non-placeholder", () => {
    const layouts = [];
    const out = executeRemovePlaceholder(
      { node: { nodeType: "WINDOW", nodeValue: { wm_class: "App" } } },
      {
        removeNode: () => {},
        requestLayout: (r) => layouts.push(r),
      }
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("not-placeholder");
    expect(layouts).toEqual([]);
  });

  it("planRemovePlaceholder pure", () => {
    expect(planRemovePlaceholder({ node: null }).ok).toBe(false);
    expect(
      planRemovePlaceholder({
        node: markPlaceholderNode({ nodeValue: createPlaceholderStub() }),
      }).ok
    ).toBe(true);
  });
});

describe("layout-placeholder GetTree + verify", () => {
  it("projectNode exports placeholder flag", () => {
    const stub = createPlaceholderStub({ id: "ph-1" });
    const node = {
      nodeType: "WINDOW",
      layout: null,
      rect: { x: 0, y: 0, width: 100, height: 80 },
      percent: 0.5,
      userSized: false,
      mode: "TILE",
      placeholder: true,
      placeholderReason: "thrash",
      nodeValue: stub,
      childNodes: [],
      isWindow: () => true,
    };
    const out = projectNode(node);
    expect(out.placeholder).toBe(true);
    expect(out.placeholderReason).toBe("thrash");
    expect(out.wmClass).toBe(PLACEHOLDER_WM_CLASS);
    expect(out.mode).toBe("TILE");
  });

  it("projectNode exports layoutSlot/layoutRole for skeleton PHs", () => {
    const stub = createPlaceholderStub({
      id: "ph-slot",
      layoutSlot: "mon0.left-tab",
      layoutRole: "chrome-luke",
    });
    const node = {
      nodeType: "WINDOW",
      layout: null,
      rect: null,
      percent: 0,
      userSized: false,
      mode: "TILE",
      placeholder: true,
      layoutSlot: "mon0.left-tab",
      layoutRole: "chrome-luke",
      nodeValue: stub,
      childNodes: [],
      isWindow: () => true,
    };
    const out = projectNode(node);
    expect(out.placeholder).toBe(true);
    expect(out.layoutSlot).toBe("mon0.left-tab");
    expect(out.layoutRole).toBe("chrome-luke");
  });

  it("collectTileVerifyInputs skips placeholders", () => {
    const inputs = collectTileVerifyInputs([
      {
        nodeType: "WINDOW",
        mode: "TILE",
        placeholder: true,
        nodeValue: createPlaceholderStub(),
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(inputs).toEqual([]);
  });
});

describe("layout-placeholder tree leaf", () => {
  /** @type {ReturnType<typeof createTreeFixture>} */
  let ctx;

  beforeEach(() => {
    _resetPlaceholderStubSeqForTests();
    ctx = createTreeFixture({ fullExtWm: true });
  });

  it("createPlaceholderLeaf is TILE first-class leaf in getTiledChildren", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const win = createMockWindow({ id: "real-1" });
    const real = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    real.mode = WINDOW_MODES.TILE;
    real.percent = 0.6;

    const ph = ctx.tree.createPlaceholderLeaf(monitor, {
      percent: 0.4,
      reason: "test",
    });
    expect(ph).toBeTruthy();
    expect(ph.isPlaceholder()).toBe(true);
    expect(ph.mode).toBe(WINDOW_MODES.TILE);
    expect(ph.percent).toBe(0.4);

    const tiled = ctx.tree.getTiledChildren(kidsOf(ctx.extWm, monitor));
    expect(tiled).toContain(real);
    expect(tiled).toContain(ph);
  });

  it("apply skips placeholders (no move_resize war)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const moves = [];
    ctx.extWm.move = (meta, rect) => moves.push({ meta, rect });
    ctx.extWm._isLoneMaximizedTile = () => false;

    const real = ctx.tree.createNode(
      monitor.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "r" })
    );
    real.mode = WINDOW_MODES.TILE;
    real.renderRect = { x: 1, y: 2, width: 100, height: 80 };
    real.nodeValue.firstRender = false;

    const ph = ctx.tree.createPlaceholderLeaf(monitor, { percent: 0.5 });
    ph.renderRect = { x: 10, y: 10, width: 50, height: 50 };
    ph.mode = WINDOW_MODES.TILE;

    ctx.tree.apply(monitor);
    expect(moves.length).toBe(1);
    expect(moves[0].meta).toBe(real.nodeValue);
  });
});

describe("layout-placeholder WM isolate/remove", () => {
  /** @type {ReturnType<typeof createWindowManagerFixture>} */
  let ctx;

  beforeEach(() => {
    _resetPlaceholderStubSeqForTests();
    ctx = createWindowManagerFixture();
  });

  it("isolateThrashWindow floats client, slot has placeholder, one requestLayout", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = "HSPLIT";
    const w1 = createMockWindow({ id: "good" });
    const w2 = createMockWindow({ id: "bad" });
    const good = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w1);
    const bad = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w2);
    good.mode = WINDOW_MODES.TILE;
    bad.mode = WINDOW_MODES.TILE;
    bad.percent = 0.55;
    bad.userSized = true;

    const layouts = [];
    const orig = ctx.windowManager.requestLayout.bind(ctx.windowManager);
    ctx.windowManager.requestLayout = (r) => {
      layouts.push(r);
      // do not schedule GLib debounce in unit
    };
    void orig;

    const out = ctx.windowManager.isolateThrashWindow(bad, { reason: "budget-exhausted" });
    expect(out.ok).toBe(true);
    expect(out.floated).toBe(true);
    expect(bad.mode).toBe(WINDOW_MODES.FLOAT);
    expect(out.placeholder).toBeTruthy();
    expect(out.placeholder.isPlaceholder()).toBe(true);
    expect(out.placeholder.percent).toBe(0.55);
    expect(out.placeholder.userSized).toBe(true);
    expect(layouts).toEqual([PLACEHOLDER_ISOLATE_LAYOUT_REASON]);
    const wm = ctx.windowManager;
    const kids = kidsOf(wm, monitor);
    expect(kids.indexOf(out.placeholder)).toBeLessThan(kids.indexOf(bad));
    const tiled = ctx.tree.getTiledChildren(kidsOf(wm, monitor));
    expect(tiled).toContain(good);
    expect(tiled).toContain(out.placeholder);
    expect(tiled).not.toContain(bad);
  });

  it("isolateThrashWindow refuses to thrash-loop a placeholder", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const ph = ctx.tree.createPlaceholderLeaf(monitor, { reason: "x" });
    const layouts = [];
    ctx.windowManager.requestLayout = (r) => layouts.push(r);
    const out = ctx.windowManager.isolateThrashWindow(ph);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("is-placeholder");
    expect(layouts).toEqual([]);
  });

  it("removePlaceholder drops leaf and requestLayout once", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const ph = ctx.tree.createPlaceholderLeaf(monitor, { percent: 0.3 });
    const wm = ctx.windowManager;
    expect(kidsOf(wm, monitor)).toContain(ph);

    const layouts = [];
    ctx.windowManager.requestLayout = (r) => layouts.push(r);
    const out = ctx.windowManager.removePlaceholder(ph);
    expect(out.ok).toBe(true);
    expect(kidsOf(wm, monitor)).not.toContain(ph);
    expect(parentOf(wm, ph)).toBeNull();
    expect(layouts).toEqual([PLACEHOLDER_REMOVE_LAYOUT_REASON]);
  });
});
