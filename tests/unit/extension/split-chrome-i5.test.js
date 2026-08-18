import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  SPLIT_CHROME_MODE,
  resolveSplitChromeMode,
  collectSplitAncestry,
  nearestHvAncestor,
  splitChromeForWindow,
} from "../../../lib/extension/split-chrome.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createContainerNode,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";

describe("split-chrome I5 — mode + ancestry", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const tree = () => ctx.windowManager.tree;

  function tileWin(parent, id, rect, percent = 0.5) {
    const meta = createMockWindow({
      id,
      wm_class: String(id),
      rect: new Rectangle(rect),
      workspace: ctx.workspaces[0],
    });
    const node = tree().createNode(parent.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    node.percent = percent;
    node.rect = { ...rect };
    return node;
  }

  /** MONITOR VSPLIT of HSPLIT[A,B] over C */
  function nestedOffAxis() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.VSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const top = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
      x: 0,
      y: 0,
      width: 1920,
      height: 540,
    });
    top.percent = 0.5;
    const a = tileWin(top, 201, { x: 0, y: 0, width: 960, height: 540 });
    const b = tileWin(top, 202, { x: 960, y: 0, width: 960, height: 540 });
    const c = tileWin(monitor, 203, { x: 0, y: 540, width: 1920, height: 540 });
    return { monitor, top, a, b, c };
  }

  /** H[ V[a,b], V[c,d] ] */
  function twoVsplitsUnderH() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const left = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
      x: 0,
      y: 0,
      width: 960,
      height: 1080,
    });
    left.percent = 0.5;
    const right = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
      x: 960,
      y: 0,
      width: 960,
      height: 1080,
    });
    right.percent = 0.5;
    const a = tileWin(left, 401, { x: 0, y: 0, width: 960, height: 540 });
    const b = tileWin(left, 402, { x: 0, y: 540, width: 960, height: 540 });
    const c = tileWin(right, 403, { x: 960, y: 0, width: 960, height: 540 });
    const d = tileWin(right, 404, { x: 960, y: 540, width: 960, height: 540 });
    return { monitor, left, right, a, b, c, d };
  }

  function tabBagBesideSibling() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const bag = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    bag.percent = 0.5;
    bag.rect = { x: 0, y: 0, width: 960, height: 1080 };
    const t1 = tileWin(bag, 301, { x: 0, y: 0, width: 960, height: 1080 });
    const t2 = tileWin(bag, 302, { x: 0, y: 0, width: 960, height: 1080 });
    const sib = tileWin(monitor, 303, { x: 960, y: 0, width: 960, height: 1080 });
    return { monitor, bag, t1, t2, sib };
  }

  it("resolveSplitChromeMode defaults to ancestry", () => {
    expect(resolveSplitChromeMode({})).toBe(SPLIT_CHROME_MODE.ANCESTRY);
    expect(resolveSplitChromeMode({ showAll: false, forceShowAll: false })).toBe(
      SPLIT_CHROME_MODE.ANCESTRY
    );
  });

  it("resolveSplitChromeMode: setting or force → all", () => {
    expect(resolveSplitChromeMode({ showAll: true })).toBe(SPLIT_CHROME_MODE.ALL);
    expect(resolveSplitChromeMode({ forceShowAll: true })).toBe(SPLIT_CHROME_MODE.ALL);
    expect(resolveSplitChromeMode({ showAll: false, forceShowAll: true })).toBe(
      SPLIT_CHROME_MODE.ALL
    );
  });

  it("collectSplitAncestry walks H/V parents including MONITOR", () => {
    const { monitor, top, a } = nestedOffAxis();
    const unit = tree().layoutUnit(a);
    expect(collectSplitAncestry(unit)).toEqual([top, monitor]);
  });

  it("collectSplitAncestry from tab bag skips the bag (not H/V)", () => {
    const { monitor, bag, t1 } = tabBagBesideSibling();
    const unit = tree().layoutUnit(t1);
    expect(unit).toBe(bag);
    expect(collectSplitAncestry(unit)).toEqual([monitor]);
  });

  it("ancestry mode: focus path + cousins via lowest qualifying H/V", () => {
    const { monitor, left, right, a, b, c, d } = twoVsplitsUnderH();
    const ancestry = new Set(collectSplitAncestry(tree().layoutUnit(a)));
    expect(ancestry.has(left)).toBe(true);
    expect(ancestry.has(monitor)).toBe(true);
    expect(ancestry.has(right)).toBe(false);

    const pa = splitChromeForWindow(a, { mode: SPLIT_CHROME_MODE.ANCESTRY, ancestry });
    const pb = splitChromeForWindow(b, { mode: SPLIT_CHROME_MODE.ANCESTRY, ancestry });
    const pc = splitChromeForWindow(c, { mode: SPLIT_CHROME_MODE.ANCESTRY, ancestry });
    const pd = splitChromeForWindow(d, { mode: SPLIT_CHROME_MODE.ANCESTRY, ancestry });

    expect(pa).toEqual({ splitCon: left, isVertical: true });
    expect(pb).toEqual({ splitCon: left, isVertical: true });
    // cousins: right VSPLIT not in ancestry → paint via MONITOR H
    expect(pc).toEqual({ splitCon: monitor, isVertical: false });
    expect(pd).toEqual({ splitCon: monitor, isVertical: false });
  });

  it("show-all mode: every leaf uses nearest H/V parent", () => {
    const { left, right, a, c } = twoVsplitsUnderH();
    expect(splitChromeForWindow(a, { mode: SPLIT_CHROME_MODE.ALL })).toEqual({
      splitCon: left,
      isVertical: true,
    });
    expect(splitChromeForWindow(c, { mode: SPLIT_CHROME_MODE.ALL })).toEqual({
      splitCon: right,
      isVertical: true,
    });
  });

  it("tab leaf nearest H/V is the bag's parent, not the bag", () => {
    const { monitor, t1, sib } = tabBagBesideSibling();
    expect(nearestHvAncestor(t1)).toBe(monitor);
    expect(
      splitChromeForWindow(t1, {
        mode: SPLIT_CHROME_MODE.ANCESTRY,
        ancestry: collectSplitAncestry(tree().layoutUnit(t1)),
      })
    ).toEqual({ splitCon: monitor, isVertical: false });
    expect(splitChromeForWindow(sib, { mode: SPLIT_CHROME_MODE.ALL })).toEqual({
      splitCon: monitor,
      isVertical: false,
    });
  });

  it("no H/V parent → null chrome", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const only = tileWin(monitor, 501, { x: 0, y: 0, width: 1920, height: 1080 }, 1);
    // Single child under H still has H parent — paint would apply. Use workspace alone:
    monitor.layout = LAYOUT_TYPES.TABBED;
    expect(nearestHvAncestor(only)).toBeNull();
    expect(splitChromeForWindow(only, { mode: SPLIT_CHROME_MODE.ALL })).toBeNull();
  });
});
