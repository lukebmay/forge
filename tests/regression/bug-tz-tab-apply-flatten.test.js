import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { Bin } from "../mocks/gnome/St.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * TZ-tab-apply (P3): `_layoutOp` TABBED/STACKED must not peel nested CONs.
 * Nested bags lift *this window* to the monitor then wrap (parity with
 * `_setLayoutStructureOp`), or refuse with `ensure-flatten-refused`.
 * Mon-direct / multi-window H/V wrap-before-tab + sibling moves stay.
 */
describe("TZ-tab-apply: layout tabbed no silent nested peel", () => {
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

  function reseed() {
    if (wm()._liveForestSeeded) seedLiveForest(wm());
  }

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  it("nested HSPLIT → lift focus + wrap; siblings stay nested (no flat 3-tab bag)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.HSPLIT);
    const wGhost = createMockWindow({ id: 201, wm_class: "Ghostty" });
    const nGhost = wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wGhost);

    const inner = createCon(outer.nodeValue, LAYOUT_TYPES.HSPLIT);
    const wFb = createMockWindow({ id: 301, wm_class: "Facebook" });
    const wChess = createMockWindow({ id: 302, wm_class: "Chess" });
    const nFb = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, wFb);
    const nChess = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, wChess);

    reseed();
    expect(kidsOf(wm(), outer)).toHaveLength(2);
    expect(kidsOf(wm(), inner)).toHaveLength(2);

    const out = api()._layoutOp("TABBED", "id:201", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.error).toBeUndefined();
    expect(out.code).not.toBe("ensure-flatten-refused");
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);

    const liveGhost = wm().tree.findNode(wGhost);
    const tabParent = parentOf(wm(), liveGhost);
    expect(tabParent).toBeTruthy();
    expect(tabParent).not.toBe(outer);
    expect(tabParent.nodeType).toBe(NODE_TYPES.CON);
    expect(tabParent.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), tabParent).map((c) => c.nodeValue)).toEqual([wGhost]);
    expect(tabParent.lastTabFocus).toBe(wGhost);

    // Sibling CON not peeled into the tab bag
    expect(parentOf(wm(), nFb)).toBe(inner);
    expect(parentOf(wm(), nChess)).toBe(inner);
    expect(parentOf(wm(), inner)).toBe(outer);
    expect(kidsOf(wm(), outer)).not.toContain(nGhost);
    expect(outer.layout).not.toBe(LAYOUT_TYPES.TABBED);
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
    reseed();

    const session = api();
    const layoutOut = session._layoutOp("TABBED", "id:10", { quiet: true });
    expect(layoutOut.ok).toBe(true);

    // split() replaces the mon-direct WINDOW with a fresh node under a new CON
    const liveG = wm().tree.findNode(wG);
    const bag = parentOf(wm(), liveG);
    expect(bag).not.toBe(monitor);
    expect(bag.nodeType).toBe(NODE_TYPES.CON);
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), bag).map((c) => c.nodeValue)).toEqual([wG]);
    expect(bag.lastTabFocus).toBe(wG);

    expect(session._moveOp("id:11", "id:10", { quiet: true }).ok).toBe(true);
    expect(session._moveOp("id:12", "id:10", { quiet: true }).ok).toBe(true);

    // insertBefore(nextSibling) may reverse later moves; membership is the contract
    expect(new Set(kidsOf(wm(), bag).map((c) => c.nodeValue))).toEqual(new Set([wG, wF, wC]));
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), bag).every((c) => c.nodeType === NODE_TYPES.WINDOW)).toBe(true);
    expect(kidsOf(wm(), bag)).toHaveLength(3);
  });

  it("layout HSPLIT does not flatten nested CONs", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.VSPLIT);
    const wA = createMockWindow({ id: 1 });
    wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wA);
    const inner = createCon(outer.nodeValue, LAYOUT_TYPES.HSPLIT);
    wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, createMockWindow({ id: 2 }));
    reseed();

    const out = api()._layoutOp("HSPLIT", "id:1", { quiet: true });
    expect(out.ok).toBe(true);
    expect(outer.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(kidsOf(wm(), outer)).toHaveLength(2);
    expect(kidsOf(wm(), outer)[1].nodeType).toBe(NODE_TYPES.CON);
  });

  it("FLOAT mon-direct: forceSplit wraps then TABBED (LX1)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const wChrome = createMockWindow({ id: 501, wm_class: "Google-chrome" });
    const wGrok = createMockWindow({ id: 502, wm_class: "Google-chrome" });
    const wGhost = createMockWindow({ id: 503, wm_class: "ghostty" });
    const nChrome = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wChrome);
    const nGrok = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wGrok);
    const nGhost = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wGhost);
    nChrome.mode = "FLOAT";
    nGrok.mode = "FLOAT";
    nGhost.mode = "TILE";
    reseed();

    const session = api();
    const layoutOut = session._layoutOp("TABBED", "id:501", { quiet: true });
    expect(layoutOut.ok).toBe(true);
    expect(layoutOut.error).toBeUndefined();

    const liveChrome = wm().tree.findNode(wChrome);
    const bag = parentOf(wm(), liveChrome);
    expect(bag).not.toBe(monitor);
    expect(bag.nodeType).toBe(NODE_TYPES.CON);
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(kidsOf(wm(), bag).map((c) => c.nodeValue)).toEqual([wChrome]);
    // Ghostty stays mon-direct sibling (subset bag). Sibling fold into the bag
    // is covered by the TILE mon-direct move case (G8n Forest SoT).
    expect(parentOf(wm(), nGhost)).toBe(monitor);
    expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
    void nGrok;
  });

  it("H/V CON multi-window: wrap subset, leave non-member sibling", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const outer = createCon(monitor.nodeValue, LAYOUT_TYPES.HSPLIT);
    const wChrome = createMockWindow({ id: 601, wm_class: "Chrome" });
    const wGrok = createMockWindow({ id: 602, wm_class: "Grok" });
    const wGhost = createMockWindow({ id: 603, wm_class: "ghostty" });
    wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wChrome);
    wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wGrok);
    const nGhost = wm().tree.createNode(outer.nodeValue, NODE_TYPES.WINDOW, wGhost);
    reseed();

    const session = api();
    expect(session._layoutOp("TABBED", "id:601", { quiet: true }).ok).toBe(true);
    const liveChrome = wm().tree.findNode(wChrome);
    const bag = parentOf(wm(), liveChrome);
    expect(bag).not.toBe(outer);
    expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(session._moveOp("id:602", "id:601", { quiet: true }).ok).toBe(true);
    expect(new Set(kidsOf(wm(), bag).map((c) => c.nodeValue))).toEqual(new Set([wChrome, wGrok]));
    expect(parentOf(wm(), nGhost)).toBe(outer);
  });
});
