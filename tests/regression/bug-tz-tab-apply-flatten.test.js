import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../mocks/helpers/index.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * C1 / I1: absolute layout set is non-destructive.
 *
 * Pre-C1 (TZ-tab-apply): H/V → TABBED flattened nested CONs into a window bag.
 * C1: layout mode only — nested CON identity and percents stay. Explicit
 * ungroup (C2) owns flatten.
 */
describe("C1: layout set is non-destructive (I1)", () => {
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

  const wm = () => ctx.windowManager;

  function createCon(parentValue, layout) {
    const con = wm().tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  it("TABBED on nested HSPLIT keeps nested CON children", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.HSPLIT);
    const wGhost = createMockWindow({ id: 201, wm_class: "Ghostty" });
    const nGhost = wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wGhost);
    nGhost.percent = 0.55;
    nGhost.userSized = true;

    const inner = createCon(outer.nodeValue, LAYOUT_TYPES.HSPLIT);
    inner.percent = 0.45;
    const wFb = createMockWindow({ id: 301, wm_class: "Facebook" });
    const wChess = createMockWindow({ id: 302, wm_class: "Chess" });
    const nFb = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, wFb);
    const nChess = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, wChess);

    expect(outer.childNodes).toHaveLength(2);
    expect(inner.childNodes).toHaveLength(2);

    const out = api()._layoutOp("TABBED", "id:201", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);

    expect(outer.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(outer.childNodes).toHaveLength(2);
    expect(nGhost.parentNode).toBe(outer);
    expect(inner.parentNode).toBe(outer);
    expect(outer.childNodes[1]).toBe(inner);
    expect(nFb.parentNode).toBe(inner);
    expect(nChess.parentNode).toBe(inner);
    expect(nGhost.percent).toBe(0.55);
    expect(nGhost.userSized).toBe(true);
    expect(inner.percent).toBe(0.45);
    expect(outer.lastTabFocus).toBe(wGhost);
  });

  it("mon-direct window: wrap then TABBED (single leaf); moves fold siblings", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const wG = createMockWindow({ id: 10, wm_class: "G" });
    const wF = createMockWindow({ id: 11, wm_class: "F" });
    const wC = createMockWindow({ id: 12, wm_class: "C" });
    wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wG);
    wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wF);
    wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wC);

    const session = api();
    const layoutOut = session._layoutOp("TABBED", "id:10", { quiet: true });
    expect(layoutOut.ok).toBe(true);

    // split() replaces the mon-direct WINDOW with a fresh node under a new CON
    const liveG = wm().tree.findNode(wG);
    const bag = liveG.parentNode;
    expect(bag).not.toBe(monitor);
    expect(bag.nodeType).toBe(NODE_TYPES.CON);
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(bag.childNodes.map((c) => c.nodeValue)).toEqual([wG]);
    expect(bag.lastTabFocus).toBe(wG);

    expect(session._moveOp("id:11", "id:10", { quiet: true }).ok).toBe(true);
    expect(session._moveOp("id:12", "id:10", { quiet: true }).ok).toBe(true);

    // insertBefore(nextSibling) may reverse later moves; membership is the contract
    expect(new Set(bag.childNodes.map((c) => c.nodeValue))).toEqual(new Set([wG, wF, wC]));
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(bag.childNodes.every((c) => c.nodeType === NODE_TYPES.WINDOW)).toBe(true);
    expect(bag.childNodes).toHaveLength(3);
  });

  it("layout HSPLIT does not flatten nested CONs or wipe percents", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    const wA = createMockWindow({ id: 1 });
    const nA = wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wA);
    nA.percent = 0.3;
    nA.userSized = true;
    const inner = createCon(outer.nodeValue, LAYOUT_TYPES.HSPLIT);
    inner.percent = 0.7;
    wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 2 }));

    const out = api()._layoutOp("HSPLIT", "id:1", { quiet: true });
    expect(out.ok).toBe(true);
    expect(outer.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(outer.childNodes).toHaveLength(2);
    expect(outer.childNodes[1].nodeType).toBe(NODE_TYPES.CON);
    expect(outer.childNodes[1]).toBe(inner);
    expect(nA.percent).toBe(0.3);
    expect(nA.userSized).toBe(true);
    expect(inner.percent).toBe(0.7);
  });
});
