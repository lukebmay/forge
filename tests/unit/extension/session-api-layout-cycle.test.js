import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import { collectWindows } from "../../../lib/shared/layout-plan.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import {
  forestAdmitMetaWindow,
  forestSetLayout,
  liveChildrenForPresent,
  liveParentForPresent,
  seedLiveForest,
} from "../../../lib/extension/tom-live.js";
import { isPlaceholderNode } from "../../../lib/extension/layout-placeholder.js";
import { isUnderFloats, moveWindowToFloats } from "../../../lib/tom/index.js";

/**
 * Phase 1 RunSteps parity: layout-cycle, merge-group (session-api ops).
 */
describe("SessionApi layout-cycle / merge-group", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      // Forest-careful: explicit seedLiveForest; avoid invent reseed picking up GObject-only.
      reseedOnCreateNode: false,
      globals: { display: { monitorCount: 2 } },
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

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  function twoWindowTabbed() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    const w1 = createMockWindow({ id: 11, wm_class: "A" });
    const w2 = createMockWindow({ id: 12, wm_class: "B" });
    const n1 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;
    con.lastTabFocus = w1;
    return { con, w1, w2, n1, n2 };
  }

  it("green-dev shares survive first-apply batch paint (tab | ghostty)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const chrome = createMockWindow({ id: 10, wm_class: "google-chrome" });
    const grok = createMockWindow({
      id: 11,
      wm_class: "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
    });
    const ghost = createMockWindow({ id: 12, wm_class: "com.mitchellh.ghostty" });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    const nGrok = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, grok);
    const nGhost = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    nGhost.mode = WINDOW_MODES.TILE;
    bag.percent = 0.5;
    nGhost.percent = 0.5;
    seedLiveForest(wm());

    const sized = api()._sizeOp(["id:11", "id:12"], [0.687, 0.313], { quiet: true });
    expect(sized.ok).toBe(true);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.userSized).toBe(true);

    wm().beginOpenLayoutBatch("dev");
    wm().renderTree("run-steps", true);
    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end.committed).toBe(true);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.userSized).toBe(true);
  });

  it("post-size mon unwrap no-op keeps mon-level shares (green layout dev)", () => {
    // ApplyLayout runs unwrapMonDegenerate after size; must not equalize.
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const chrome = createMockWindow({ id: 20, wm_class: "Google-chrome" });
    const grok = createMockWindow({ id: 21, wm_class: "Google-chrome" });
    const ghost = createMockWindow({ id: 22, wm_class: "com.mitchellh.ghostty" });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    const nGrok = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, grok);
    const nGhost = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    nGhost.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    const sized = api()._sizeOp(["id:20", "id:22"], [0.687, 0.313], { quiet: true });
    expect(sized.ok).toBe(true);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);

    const out = api()._unwrapMonDirectSingleChildSplits();
    expect(out.unwrapped).toBe(0);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.userSized).toBe(true);
  });

  it("unwrap mon-direct 1-child H/V transfers wrapper shares to leaf", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const chrome = createMockWindow({ id: 30, wm_class: "Google-chrome" });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    nChrome.mode = WINDOW_MODES.TILE;
    bag.percent = 0.687;
    bag.userSized = true;

    const wrap = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.VSPLIT;
    wrap.percent = 0.313;
    wrap.userSized = true;
    const ghost = createMockWindow({ id: 31, wm_class: "com.mitchellh.ghostty" });
    const nGhost = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.WINDOW, ghost);
    nGhost.mode = WINDOW_MODES.TILE;
    nGhost.percent = 0;
    nGhost.userSized = false;
    seedLiveForest(wm());

    const out = api()._unwrapMonDirectSingleChildSplits();
    expect(out.unwrapped).toBe(1);
    expect(liveParentForPresent(wm(), nGhost)).toBe(monitor);
    expect(liveChildrenForPresent(wm(), monitor)).toEqual(expect.arrayContaining([bag, nGhost]));
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(nGhost.userSized).toBe(true);
  });

  it("_sizeOp soft-skips duplicate mon-directs instead of aborting apply", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const wrap = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.HSPLIT;
    const chrome = createMockWindow({ id: 51, wm_class: "google-chrome" });
    const grok = createMockWindow({ id: 52, wm_class: "Grok" });
    const nChrome = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.WINDOW, chrome);
    const inner = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.CON, new Bin());
    inner.layout = LAYOUT_TYPES.VSPLIT;
    const nGrok = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, grok);
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const sized = api()._sizeOp(["id:51", "id:52"], [0.687, 0.313], { quiet: true });
    expect(sized.ok).toBe(true);
    expect(sized.sized).toBe(false);
    expect(sized.reason).toBe("duplicate mon-direct for size targets");
    expect(sized.error).toBeUndefined();
  });

  it("_sizeOp soft-skips when mon-directs lack a common parent", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    const w0 = createMockWindow({ id: 41, wm_class: "A" });
    const w1 = createMockWindow({ id: 42, wm_class: "B" });
    const n0 = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = wm().tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.mode = WINDOW_MODES.TILE;
    n1.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const sized = api()._sizeOp(["id:41", "id:42"], [0.5, 0.5], { quiet: true });
    expect(sized.ok).toBe(true);
    expect(sized.sized).toBe(false);
    expect(sized.reason).toBe("size targets not under common parent");
    expect(sized.error).toBeUndefined();
  });

  it("R036 setLayout structure: lift nested H/V bag then TABBED wrap (no flatten refuse)", () => {
    // Free-open aspect-split shape: mon → HSPLIT CON → [chrome, VSPLIT→Grok]
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.HSPLIT;
    const chrome = createMockWindow({ id: 101, wm_class: "google-chrome" });
    const grok = createMockWindow({
      id: 102,
      wm_class: "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
    });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    const inner = wm().tree.createNode(bag.nodeValue, NODE_TYPES.CON, new Bin());
    inner.layout = LAYOUT_TYPES.VSPLIT;
    const nGrok = wm().tree.createNode(inner.nodeValue, NODE_TYPES.WINDOW, grok);
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    // Old refuse: parent bag has nested CON → ensure-flatten-refused
    const out = api()._setLayoutStructureOp("tabbed", "id:101", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.error).toBeUndefined();
    const nid = wm().hostBag?.idFromMeta?.(chrome);
    expect(nid).toBeTruthy();
    const tabId = wm().forest.nodes[nid].parentId;
    const tabParent = wm().liveById.get(tabId);
    expect(tabParent).toBeTruthy();
    expect(tabParent.isMonitor?.() || tabParent.nodeType === NODE_TYPES.MONITOR).toBe(false);
    expect(tabParent.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(wm().forest.nodes[tabId].layout).toBe(LAYOUT_TYPES.TABBED);
    expect(wm().forest.nodes[tabId].childIds).toEqual([nid]);
    expect(wm().forest.nodes[tabId].kind).toBe("CON");
    expect(liveChildrenForPresent(wm(), inner)).toContain(nGrok);
    expect(liveChildrenForPresent(wm(), bag)).toContain(inner);
  });

  it("layout TABBED re-affirm preserves valid lastTabFocus (belt anchor ≠ active)", () => {
    // Belt ensure_layout anchors on first role (chrome); profile active is Grok.
    const { con, w1, w2 } = twoWindowTabbed();
    con.lastTabFocus = w2; // Grok open leaf
    const out = api()._layoutOp(LAYOUT_TYPES.TABBED, "id:11", { quiet: true });
    expect(out.ok).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.lastTabFocus).toBe(w2);
    expect(con.lastTabFocus).not.toBe(w1);
  });

  it("layout TABBED sets lastTabFocus when previous open leaf is gone", () => {
    const { con, w1, w2 } = twoWindowTabbed();
    con.lastTabFocus = { id: 999, gone: true };
    const out = api()._layoutOp(LAYOUT_TYPES.TABBED, "id:11", { quiet: true });
    expect(out.ok).toBe(true);
    expect(con.lastTabFocus).toBe(w1);
    void w2;
  });

  it("layout-cycle group flips TABBED → STACKED", () => {
    const { con } = twoWindowTabbed();
    const out = api()._layoutCycleOp("group", "id:11", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.STACKED);
    expect(con.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(con.lastTabFocus).toBeNull();
  });

  it("layout-cycle group flips STACKED → TABBED", () => {
    const { con, w1 } = twoWindowTabbed();
    con.layout = LAYOUT_TYPES.STACKED;
    con.lastTabFocus = null;
    const out = api()._layoutCycleOp("group", "id:11", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.lastTabFocus).toBe(w1);
  });

  it("layout-cycle group no-ops on HSPLIT", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w = createMockWindow({ id: 21 });
    wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w);

    const out = api()._layoutCycleOp("group", "id:21", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(false);
    expect(con.layout).toBe(LAYOUT_TYPES.HSPLIT);
  });

  it("layout-cycle split flips H ↔ V", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w = createMockWindow({ id: 31 });
    wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w);

    const out = api()._layoutCycleOp("split", "id:31", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.VSPLIT);
    expect(con.layout).toBe(LAYOUT_TYPES.VSPLIT);
  });

  it("merge-group with explicit partner wraps into TABBED", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w1 = createMockWindow({ id: 41, wm_class: "L" });
    const w2 = createMockWindow({ id: 42, wm_class: "R" });
    const n1 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    const out = api()._mergeGroupOp("id:41", "id:42", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(n1.parentNode).toBe(con);
    expect(n2.parentNode).toBe(con);
  });

  it("merge-group uses Forest parent when GObject parentNode is null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w1 = createMockWindow({ id: 441, wm_class: "L" });
    const w2 = createMockWindow({ id: 442, wm_class: "R" });
    const n1 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    n1.parentNode = null;
    n2.parentNode = null;
    expect(liveParentForPresent(wm(), n1)).toBe(con);
    expect(liveParentForPresent(wm(), n2)).toBe(con);

    const out = api()._mergeGroupOp("id:441", "id:442", { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(liveParentForPresent(wm(), n1)).toBe(con);
    expect(liveParentForPresent(wm(), n2)).toBe(con);
    const id1 = wm().hostBag?.idFromMeta?.(w1);
    const id2 = wm().hostBag?.idFromMeta?.(w2);
    expect(wm().forest.nodes[id1].parentId).toBe(wm().forest.nodes[id2].parentId);
    expect(wm().forest.nodes[wm().forest.nodes[id1].parentId].layout).toBe("TABBED");
  });

  it("ungroup dissolves TABBED CON and keeps child order", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    const w1 = createMockWindow({ id: 61, wm_class: "L" });
    const w2 = createMockWindow({ id: 62, wm_class: "R" });
    const n1 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;

    const out = api()._ungroupOp("id:61", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    expect(n1.parentNode).toBe(monitor);
    expect(n2.parentNode).toBe(monitor);
    expect(monitor.childNodes).toEqual([n1, n2]);
    expect(con.parentNode).toBeFalsy();
  });

  it("ungroup no-ops a mon-direct window", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w = createMockWindow({ id: 71 });
    const n = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w);
    n.mode = WINDOW_MODES.TILE;

    const out = api()._ungroupOp("id:71", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(false);
    expect(n.parentNode).toBe(monitor);
  });

  it("merge-group fails without partner", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w = createMockWindow({ id: 51 });
    const n = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w);
    n.mode = WINDOW_MODES.TILE;
    ctx.display.get_tab_next = vi.fn(() => null);

    const out = api()._mergeGroupOp("id:51", null, { quiet: true });
    expect(out.error).toMatch(/no merge partner/);
  });

  it("order soft-skips when mon-directs not under same MONITOR", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    expect(mon0).toBeTruthy();
    expect(mon1).toBeTruthy();
    expect(mon0).not.toBe(mon1);

    const w0 = createMockWindow({ id: 201, wm_class: "A" });
    const w1 = createMockWindow({ id: 202, wm_class: "B" });
    const n0 = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = wm().tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.mode = WINDOW_MODES.TILE;
    n1.mode = WINDOW_MODES.TILE;

    const out = api()._orderMonChildrenOp(["id:201", "id:202"], { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({
      ok: true,
      reordered: false,
      reason: "mon-directs not under same MONITOR",
    });
  });

  it("order hoists nested mon HSPLIT wrapper then L/R reorders", () => {
    // mon: HSPLIT[ VSPLIT(ghostty) | TABBED(chrome,Grok) ] → tab | ghostty
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const wrap = wm().tree.createNode(mon.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.HSPLIT;
    const v = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.CON, new Bin());
    v.layout = LAYOUT_TYPES.VSPLIT;
    const tab = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const ghost = createMockWindow({ id: 301, wm_class: "ghostty" });
    const chrome = createMockWindow({ id: 302, wm_class: "google-chrome" });
    const grok = createMockWindow({ id: 303, wm_class: "Grok" });
    const nGhost = wm().tree.createNode(v.nodeValue, NODE_TYPES.WINDOW, ghost);
    const nChrome = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, chrome);
    const nGrok = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, grok);
    nGhost.mode = WINDOW_MODES.TILE;
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    // Profile order: chrome tab left, ghostty right
    const out = api()._orderMonChildrenOp(["id:302", "id:301"], { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({ ok: true, reordered: true, scope: "mon" });
    // Wrapper gone; mon-direct = tab then ghostty leaf (VSPLIT unwrapped)
    const monKids = liveChildrenForPresent(wm(), mon);
    expect(monKids.length).toBe(2);
    expect(monKids[0]).toBe(tab);
    expect(monKids[1]).toBe(nGhost);
    expect(liveChildrenForPresent(wm(), tab)).toEqual(expect.arrayContaining([nChrome, nGrok]));
    expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
  });

  it("skeleton invents layoutRole PH on Forest then paint", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const out = api()._skeletonOp(
      [{ mon: 0, split: "hsplit", children: [{ slot: "s1", roles: ["term"] }] }],
      { workspace: 0, quiet: true }
    );
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(api()._monHasLayoutSkeleton(monitor)).toBe(true);
    const ph = liveChildrenForPresent(wm(), monitor).find((n) => isPlaceholderNode(n));
    expect(ph).toBeTruthy();
    expect(ph.layoutRole).toBe("term");
    expect(ph.layoutSlot).toBe("s1");
    const pid = wm().hostBag?.idFromMeta?.(ph.nodeValue);
    expect(pid).toBeTruthy();
    expect(wm().forest.nodes[pid]?.kind).toBe("WINDOW");
    expect(wm().forest.nodes[pid]?.parentId).toBe(monitor.nodeValue);
    expect(wm().forest.nodes[pid]?.wmClass).toBe("forge-placeholder");
  });

  it("bind replaces a layout PH with the real window (Forest then paint)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const ph = wm().tree.createPlaceholderLeaf(monitor, {
      layoutSlot: "s1",
      layoutRole: "term",
    });
    expect(ph).toBeTruthy();
    const w = createMockWindow({ id: 401, wm_class: "ghostty" });
    const n = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, w);
    n.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const out = api()._bindOp("id:401", { layoutRole: "term", layoutSlot: "s1", quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    const winId = wm().hostBag?.idFromMeta?.(w);
    expect(winId).toBeTruthy();
    expect(wm().forest.nodes[winId]?.parentId).toBe(monitor.nodeValue);
    expect(liveParentForPresent(wm(), n)).toBe(monitor);
    expect(liveChildrenForPresent(wm(), monitor)).toContain(n);
    expect(liveChildrenForPresent(wm(), monitor)).not.toContain(ph);
    expect(liveChildrenForPresent(wm(), monitor).some(isPlaceholderNode)).toBe(false);
  });

  it("R048: bind consumes Forest PH when GObject parentNode is null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const skel = api()._skeletonOp(
      [{ mon: 0, split: "hsplit", children: [{ slot: "s1", roles: ["term"] }] }],
      { workspace: 0, quiet: true }
    );
    expect(skel.error).toBeUndefined();
    expect(skel.ok).toBe(true);
    const ph = liveChildrenForPresent(wm(), monitor).find((n) => isPlaceholderNode(n));
    expect(ph).toBeTruthy();
    expect(ph.parentNode).toBeFalsy();
    const phId = wm().hostBag?.idFromMeta?.(ph.nodeValue);
    expect(phId).toBeTruthy();
    expect(wm().forest.nodes[phId]?.parentId).toBe(monitor.nodeValue);

    const w = createMockWindow({ id: 501, wm_class: "ghostty" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      parentId: monitor.nodeValue,
      underFloats: false,
      mode: WINDOW_MODES.TILE,
    });
    expect(admitted?.id).toBeTruthy();
    expect(admitted.live.parentNode).toBeFalsy();

    const out = api()._bindOp("id:501", { layoutRole: "term", layoutSlot: "s1", quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.skipped).not.toBe("no-placeholder");
    expect(wm().forest.nodes[phId]).toBeUndefined();
    expect(wm().forest.nodes[admitted.id]?.parentId).toBe(monitor.nodeValue);
    expect(liveChildrenForPresent(wm(), monitor)).toContain(admitted.live);
    expect(liveChildrenForPresent(wm(), monitor).some(isPlaceholderNode)).toBe(false);
  });

  it("R048: bind by placeholder id does not require GObject parentNode", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const skel = api()._skeletonOp(
      [{ mon: 0, split: "hsplit", children: [{ slot: "s1", roles: ["term"] }] }],
      { workspace: 0, quiet: true }
    );
    expect(skel.ok).toBe(true);
    const ph = liveChildrenForPresent(wm(), monitor).find((n) => isPlaceholderNode(n));
    expect(ph).toBeTruthy();
    expect(ph.parentNode).toBeFalsy();
    const phId = wm().hostBag?.idFromMeta?.(ph.nodeValue);
    expect(phId).toBeTruthy();

    const w = createMockWindow({ id: 502, wm_class: "ghostty" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      parentId: monitor.nodeValue,
      underFloats: false,
      mode: WINDOW_MODES.TILE,
    });
    expect(admitted?.id).toBeTruthy();

    const out = api()._bindOp("id:502", {
      layoutRole: "term",
      layoutSlot: "s1",
      placeholder: `id:${phId}`,
      quiet: true,
    });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.error).not.toBe("placeholder has no parent");
    expect(wm().forest.nodes[phId]).toBeUndefined();
    expect(wm().forest.nodes[admitted.id]?.parentId).toBe(monitor.nodeValue);
    expect(liveChildrenForPresent(wm(), monitor)).toContain(admitted.live);
    expect(liveChildrenForPresent(wm(), monitor).some(isPlaceholderNode)).toBe(false);
  });

  it("R048: bind FLOATS window onto Forest TILES PH", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const skel = api()._skeletonOp(
      [{ mon: 0, split: "hsplit", children: [{ slot: "s1", roles: ["term"] }] }],
      { workspace: 0, quiet: true }
    );
    expect(skel.error).toBeUndefined();
    expect(skel.ok).toBe(true);
    const ph = liveChildrenForPresent(wm(), monitor).find((n) => isPlaceholderNode(n));
    expect(ph).toBeTruthy();
    expect(ph.parentNode).toBeFalsy();
    const phId = wm().hostBag?.idFromMeta?.(ph.nodeValue);
    expect(phId).toBeTruthy();

    const w = createMockWindow({ id: 601, wm_class: "google-chrome" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      underFloats: true,
      mode: WINDOW_MODES.FLOAT,
    });
    expect(admitted?.id).toBeTruthy();
    expect(isUnderFloats(wm().forest, wm().forest.nodes[admitted.id])).toBe(true);

    const out = api()._bindOp("id:601", { layoutRole: "term", layoutSlot: "s1", quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.skipped).not.toBe("no-placeholder");
    expect(wm().forest.nodes[phId]).toBeUndefined();
    const winTom = wm().forest.nodes[admitted.id];
    expect(winTom?.parentId).toBe(monitor.nodeValue);
    expect(isUnderFloats(wm().forest, winTom)).toBe(false);
    expect(wm().hostBag.get(admitted.id)?.floating).not.toBe(true);
    expect(admitted.live.mode).toBe(WINDOW_MODES.TILE);
    expect(liveChildrenForPresent(wm(), monitor)).toContain(admitted.live);
    expect(liveChildrenForPresent(wm(), monitor).some(isPlaceholderNode)).toBe(false);
    forestSetLayout(wm(), monitor, "HSPLIT");
    expect(isUnderFloats(wm().forest, wm().forest.nodes[admitted.id])).toBe(false);
    expect(liveChildrenForPresent(wm(), monitor)).toContain(admitted.live);
  });

  it("R049: 3rd tab role move joins existing TABBED, not MONITOR", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const youtube = createMockWindow({ id: 811, wm_class: "youtube" });
    const gmail = createMockWindow({ id: 812, wm_class: "gmail" });
    const voice = createMockWindow({ id: 813, wm_class: "voice" });
    const nY = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, youtube);
    const nG = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, gmail);
    const nV = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, voice);
    for (const n of [nY, nG, nV]) n.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const out = api()._moveOp("id:813", "id:811", { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    const idV = wm().hostBag?.idFromMeta?.(voice);
    const idY = wm().hostBag?.idFromMeta?.(youtube);
    expect(idV).toBeTruthy();
    expect(wm().forest.nodes[idV].parentId).toBe(wm().forest.nodes[idY].parentId);
    expect(wm().forest.nodes[idV].parentId).not.toBe(monitor.nodeValue);
    expect(liveParentForPresent(wm(), nV)).toBe(bag);
    expect(liveChildrenForPresent(wm(), bag)).toEqual(expect.arrayContaining([nY, nG, nV]));
  });

  it("R049: TABBED layout on MONITOR sibling joins slot bag", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const youtube = createMockWindow({ id: 821, wm_class: "youtube" });
    const gmail = createMockWindow({ id: 822, wm_class: "gmail" });
    const voice = createMockWindow({ id: 823, wm_class: "voice" });
    const nY = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, youtube);
    const nG = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, gmail);
    const nV = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, voice);
    for (const n of [nY, nG, nV]) n.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const out = api()._setLayoutStructureOp("tabbed", "id:823", { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    const idV = wm().hostBag?.idFromMeta?.(voice);
    const idY = wm().hostBag?.idFromMeta?.(youtube);
    expect(wm().forest.nodes[idV].parentId).toBe(wm().forest.nodes[idY].parentId);
    expect(wm().forest.nodes[idV].parentId).not.toBe(monitor.nodeValue);
    expect(liveParentForPresent(wm(), nV)).toBe(bag);
  });

  it("G8o: layout structure does not abort when GObject parentNode is null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w = createMockWindow({ id: 701, wm_class: "ghostty" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      parentId: monitor.nodeValue,
      underFloats: false,
      mode: WINDOW_MODES.TILE,
    });
    expect(admitted?.live?.parentNode).toBeFalsy();
    const out = api()._setLayoutStructureOp("hsplit", "id:701", { quiet: true });
    expect(out.error).not.toBe("window has no parent container");
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
  });

  it("G8o: layout op does not abort when GObject parentNode is null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w = createMockWindow({ id: 702, wm_class: "ghostty" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      parentId: monitor.nodeValue,
      underFloats: false,
      mode: WINDOW_MODES.TILE,
    });
    expect(admitted?.live?.parentNode).toBeFalsy();
    const out = api()._layoutOp(LAYOUT_TYPES.HSPLIT, "id:702", { quiet: true });
    expect(out.error).not.toBe("window has no parent container");
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
  });

  it("G8o: mon-direct ancestor / monitor index via Forest when parentNode null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const wa = createMockWindow({ id: 911, wm_class: "ghostty" });
    const wb = createMockWindow({ id: 912, wm_class: "org.gnome.Nautilus" });
    const a = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wa);
    const b = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wb);
    a.mode = WINDOW_MODES.TILE;
    b.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    a.parentNode = null;
    b.parentNode = null;
    expect(liveParentForPresent(wm(), a)).toBe(monitor);
    const apiInst = api();
    expect(apiInst._monDirectAncestor(a)).toBe(a);
    expect(apiInst._monitorIndexOfNode(a)).toBe(0);
    const out = apiInst._orderMonChildrenOp(["id:911", "id:912"], { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
  });

  it("nest join-tab: CENTER groups when GObject parentNode is null", () => {
    ctx.settings.get_string.mockImplementation((key) => {
      if (key === "dnd-center-layout") return "TABBED";
      return "";
    });
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const split = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    split.layout = LAYOUT_TYPES.HSPLIT;
    const wa = createMockWindow({ id: 901, wm_class: "ghostty" });
    const wb = createMockWindow({ id: 902, wm_class: "org.gnome.Nautilus" });
    const a = wm().tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, wa);
    const b = wm().tree.createNode(split.nodeValue, NODE_TYPES.WINDOW, wb);
    a.mode = WINDOW_MODES.TILE;
    b.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    // D096 residue: seeded TILES membership is Forest-only.
    a.parentNode = null;
    b.parentNode = null;
    expect(liveParentForPresent(wm(), a)).toBe(split);
    expect(liveParentForPresent(wm(), b)).toBe(split);

    const out = api()._dndDropOp("id:901", "id:902", "CENTER", {
      quiet: true,
      simulateEnteredMonitor: false,
    });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.parentLayout).toBe(LAYOUT_TYPES.TABBED);
    const idA = wm().hostBag?.idFromMeta?.(wa);
    const idB = wm().hostBag?.idFromMeta?.(wb);
    expect(idA).toBeTruthy();
    expect(wm().forest.nodes[idA].parentId).toBe(wm().forest.nodes[idB].parentId);
    const parentTom = wm().forest.nodes[wm().forest.nodes[idA].parentId];
    expect(parentTom.layout).toBe("TABBED");
    expect(parentTom.childIds).toEqual(expect.arrayContaining([idA, idB]));
  });

  it("D096 close drops Forest when GObject parentNode is null", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const w = createMockWindow({ id: 903, wm_class: "org.gnome.Nautilus" });
    const admitted = forestAdmitMetaWindow(wm(), w, {
      parentId: monitor.nodeValue,
      underFloats: false,
      mode: WINDOW_MODES.TILE,
    });
    expect(admitted?.id).toBeTruthy();
    expect(admitted.live.parentNode).toBeFalsy();
    const nid = admitted.id;

    const out = api()._closeOp(`id:${nid}`, { force: true });
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.closed).toBe(true);
    expect(out.forestRemoved).toBe(true);
    expect(wm().forest.nodes[nid]).toBeUndefined();
    expect(wm().hostBag.has(nid)).toBe(false);
  });
});

describe("SessionApi LayoutBatch (CL5)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      reseedOnCreateNode: false,
      settings: { "tiling-mode-enabled": true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  it("begin/end nest and end commits when need-commit latched", () => {
    const a = api();
    const begin = JSON.parse(a.LayoutBatch("begin"));
    expect(begin).toMatchObject({ ok: true, depth: 1 });
    expect(ctx.windowManager.openLayoutBatchActive).toBe(true);

    ctx.windowManager._openLayoutBatchNeedsCommit = true;
    const commitSpy = vi.spyOn(ctx.windowManager, "commitLayout");
    const end = JSON.parse(a.LayoutBatch("end"));
    expect(end).toMatchObject({ ok: true, depth: 0, committed: true });
    expect(commitSpy).toHaveBeenCalledWith("open-batch", { force: true });
    expect(ctx.windowManager.openLayoutBatchActive).toBe(false);
  });

  it("chrome-show shows without begin; chrome-clear hides it", () => {
    const a = api();
    const wm = ctx.windowManager;
    wm.layoutApplyChrome = {
      visible: false,
      setLayoutName: vi.fn(),
      show: vi.fn(() => {
        wm.layoutApplyChrome.visible = true;
      }),
      clear: vi.fn(() => {
        wm.layoutApplyChrome.visible = false;
      }),
    };
    ctx.settings.set_boolean("layout-apply-chrome-enabled", true);
    const shown = JSON.parse(a.LayoutBatch("chrome-show:dev"));
    expect(shown).toMatchObject({ ok: true, shown: true });
    expect(wm.layoutApplyChrome.setLayoutName).toHaveBeenCalledWith("dev");
    expect(wm.layoutApplyChrome.show).toHaveBeenCalled();
    expect(wm.openLayoutBatchActive).toBe(false);
    const clr = JSON.parse(a.LayoutBatch("chrome-clear"));
    expect(clr).toMatchObject({ ok: true });
    expect(wm.layoutApplyChrome.clear).toHaveBeenCalled();
  });

  it("end does not clear chrome; chrome-clear hides it (CLI after end)", () => {
    const a = api();
    const wm = ctx.windowManager;
    const show = vi.fn();
    const hide = vi.fn();
    // Minimal chrome controller stand-in (LayoutApplyChrome shape).
    wm.layoutApplyChrome = {
      visible: false,
      setLayoutName: vi.fn(),
      syncFromBatch: vi.fn((depth) => {
        if (depth >= 1) {
          wm.layoutApplyChrome.visible = true;
          show();
        }
      }),
      clear: vi.fn(() => {
        wm.layoutApplyChrome.visible = false;
        hide();
      }),
    };
    JSON.parse(a.LayoutBatch("begin:dev"));
    expect(wm.layoutApplyChrome.syncFromBatch).toHaveBeenCalled();
    JSON.parse(a.LayoutBatch("end"));
    // end() never auto-clears; product CLI clears after focus/soft (finally).
    expect(wm.layoutApplyChrome.clear).not.toHaveBeenCalled();
    expect(wm.layoutApplyChrome.visible).toBe(true);
    const clr = JSON.parse(a.LayoutBatch("chrome-clear"));
    expect(clr).toMatchObject({ ok: true });
    expect(wm.layoutApplyChrome.clear).toHaveBeenCalled();
    expect(wm.layoutApplyChrome.visible).toBe(false);
  });

  it("CL9 release-deferred unhides without ending batch", () => {
    const a = api();
    const wm = ctx.windowManager;
    JSON.parse(a.LayoutBatch("begin"));
    const releaseSpy = vi.spyOn(wm, "releaseDeferredOpens");
    const out = JSON.parse(a.LayoutBatch("release-deferred"));
    expect(out).toMatchObject({ ok: true, released: 0, depth: 1 });
    expect(releaseSpy).toHaveBeenCalled();
    expect(wm.openLayoutBatchActive).toBe(true);

    const alias = JSON.parse(a.LayoutBatch("unhide"));
    expect(alias.ok).toBe(true);
    expect(wm.openLayoutBatchActive).toBe(true);
  });

  it("rejects unknown action", () => {
    const out = JSON.parse(api().LayoutBatch("nope"));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/begin\|end\|release-deferred\|admit/);
  });

  it("resolves id when the window is not under a MONITOR", () => {
    const stray = createMockWindow({ id: 99, wm_class: "Google-chrome", title: "Grok" });
    const ws = ctx.tree.findNode("ws0") || ctx.tree.root;
    ctx.tree.createNode(ws.nodeValue ?? ws, NODE_TYPES.WINDOW, stray);
    const out = api()._resolveWindow("id:99");
    expect(out.ok).toBe(true);
    expect(out.match.node.nodeValue).toBe(stray);
  });

  it("LayoutBatch admit tracks untracked Meta windows", () => {
    const a = api();
    const wm = ctx.windowManager;
    const stray = createMockWindow({ id: 88, wm_class: "ghostty", title: "Ghostty" });
    Object.defineProperty(wm, "windowsAllWorkspaces", {
      configurable: true,
      get: () => [stray],
    });
    const out = JSON.parse(a.LayoutBatch("admit"));
    expect(out.ok).toBe(true);
    expect(out.admitted).toBeGreaterThanOrEqual(1);
    expect(wm.findNodeWindow(stray)).toBeTruthy();
  });

  it("Ping reports apiVersion ≥ 9", () => {
    const ping = JSON.parse(api().Ping());
    expect(ping.ok).toBe(true);
    expect(ping.apiVersion).toBeGreaterThanOrEqual(9);
  });

  it("SL2 GetThrashCatalog returns catalog.snapshot shape", () => {
    const a = api();
    const cat = ctx.windowManager.appThrashCatalog;
    cat.recordSettleSample("org.example.Dump", { ms: 250, kind: "open", mismatches: 1 });

    const out = JSON.parse(a.GetThrashCatalog());
    expect(out.ok).toBe(true);
    expect(out.apiVersion).toBeGreaterThanOrEqual(9);
    expect(Array.isArray(out.entries)).toBe(true);

    const row = out.entries.find((e) => e.key === "org.example.dump");
    expect(row).toBeTruthy();
    expect(row.settleSampleCount).toBe(1);
    expect(row.settleMsLast).toBe(250);
    expect(row.mismatchBeforeSettle).toBe(1);
    expect(typeof row.minQuietMs).toBe("number");
    expect(typeof row.thrashScore).toBe("number");

    const ghost = out.entries.find((e) => e.key === "com.mitchellh.ghostty" || e.key === "ghostty");
    expect(ghost).toBeTruthy();
    expect(ghost.builtIn).toBe(true);
  });
});

describe("SessionApi _focusOp revealGroupChild (IC2)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
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

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  function twoWindowTabbed() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;
    const w1 = createMockWindow({ id: 11, wm_class: "A" });
    const w2 = createMockWindow({ id: 12, wm_class: "B" });
    const n1 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const n2 = wm().tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    n1.mode = WINDOW_MODES.TILE;
    n2.mode = WINDOW_MODES.TILE;
    con.lastTabFocus = w1;
    w1.raise = vi.fn();
    w1.activate = vi.fn();
    w2.raise = vi.fn();
    w2.activate = vi.fn();
    return { con, w1, w2, n1, n2 };
  }

  it("keyboard:false does not activate and still pins", () => {
    const { con, w2, n2 } = twoWindowTabbed();
    const reveal = vi.spyOn(wm(), "revealGroupChild");
    const out = api()._focusOp("id:12", { keyboard: false });
    expect(out.ok).toBe(true);
    expect(out.keyboard).toBe(false);
    expect(reveal).toHaveBeenCalledWith(n2, {
      keyboard: false,
      pin: true,
      source: "dbus-focus",
    });
    expect(con.lastTabFocus).toBe(w2);
    expect(w2.raise).toHaveBeenCalled();
    expect(w2.activate).not.toHaveBeenCalled();
    expect(wm().getLayoutOpenLeafPin(con)?.meta).toBe(w2);
  });

  it("pins when asked (default) and can skip pin", () => {
    const first = twoWindowTabbed();
    const pinSpy = vi.spyOn(wm(), "pinLayoutOpenLeaf");
    const a = api();
    expect(a._focusOp("id:12", { keyboard: false }).ok).toBe(true);
    expect(pinSpy).toHaveBeenCalled();
    expect(wm().getLayoutOpenLeafPin(first.con)?.meta).toBe(first.w2);

    pinSpy.mockClear();
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con2 = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con2.layout = LAYOUT_TYPES.TABBED;
    const w3 = createMockWindow({ id: 13, wm_class: "C" });
    const n3 = wm().tree.createNode(con2.nodeValue, NODE_TYPES.WINDOW, w3);
    n3.mode = WINDOW_MODES.TILE;
    con2.lastTabFocus = w3;
    expect(a._focusOp("id:13", { keyboard: false, pin: false }).ok).toBe(true);
    expect(pinSpy).not.toHaveBeenCalled();
    expect(wm().getLayoutOpenLeafPin(con2)).toBeNull();
  });

  it("GetTree does not sync lastTabFocus from Meta focus (R014)", () => {
    const { con, w1, w2 } = twoWindowTabbed();
    con.lastTabFocus = w1;
    ctx.display.get_focus_window.mockReturnValue(w2);

    const raw = api().GetTree("{}");
    const out = JSON.parse(raw);
    expect(out.error).toBeUndefined();
    expect(con.lastTabFocus).toBe(w1);
    expect(con.lastTabFocus).not.toBe(w2);
  });
});

describe("SessionApi workspace orphan isolation", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: { monitorCount: 1 },
        workspaceManager: { workspaceCount: 2 },
      },
      settings: {
        "tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  it("ApplyLayout snapshot / GetTree do not claim other-workspace windows", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 1, 0);
    const w0 = createMockWindow({ id: 101, wm_class: "DeskA", workspace: ctx.workspaces[0] });
    const w1 = createMockWindow({ id: 202, wm_class: "DeskB", workspace: ctx.workspaces[1] });
    const n0 = wm().tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    const n1 = wm().tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, w1);
    n0.mode = WINDOW_MODES.TILE;
    n1.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    const forest = api()._snapshotForestForApply({ workspace: 1 });
    const orphanMeta = (forest.orphanWindows || []).map((w) =>
      String(w.metaWindowId ?? w.windowId)
    );
    expect(orphanMeta).not.toContain("101");
    const collected = collectWindows(forest, { workspace: 1 });
    const collectedMeta = collected.map((w) => String(w.metaWindowId ?? w.windowId));
    const collectedIds = collected.map((w) => String(w.windowId));
    expect(collectedMeta).toContain("202");
    expect(collectedMeta).not.toContain("101");
    // Apply IR keys are Forest nanoids when live Forest is seeded (C6).
    expect(collectedIds).not.toContain("101");
    expect(
      collected.some((w) => String(w.metaWindowId) === "202" && String(w.windowId) !== "202")
    ).toBe(true);

    const raw = api().GetTree(JSON.stringify({ workspace: 1 }));
    const out = JSON.parse(raw);
    expect(out.error).toBeUndefined();
    // GetTree = Forest+bag (nanoid windowId); Meta id in metaWindowId.
    const getMeta = (out.orphanWindows || []).map((w) => String(w.metaWindowId ?? w.windowId));
    expect(getMeta).not.toContain("101");
    const getCollected = collectWindows(out, { workspace: 1 });
    expect(getCollected.map((w) => String(w.metaWindowId ?? w.windowId))).toContain("202");
    expect(getCollected.map((w) => String(w.metaWindowId ?? w.windowId))).not.toContain("101");
  });
});

describe("SessionApi Apply snapshot Forest authority", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      // GObject-only pickup asserts need invent without blanket Forest reseed.
      reseedOnCreateNode: false,
      globals: { display: { monitorCount: 1 } },
      settings: { "tiling-mode-enabled": true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  it("cold snapshot seeds Forest and projects TOM IR (C6.6)", () => {
    expect(wm()._liveForestSeeded).toBe(true);
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const wA = createMockWindow({ id: 101, wm_class: "DeskA", workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wA);
    nA.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());

    const forest = api()._snapshotForestForApply({ workspace: 0 });
    expect(wm()._liveForestSeeded).toBe(true);
    const nidA = wm().hostBag.idFromMeta(wA);
    expect(nidA).toBeTruthy();
    const collected = collectWindows(forest, { workspace: 0 });
    expect(collected.some((w) => w.windowId === nidA && String(w.metaWindowId) === "101")).toBe(
      true
    );
    expect(collected.every((w) => String(w.windowId) !== "101")).toBe(true);

    const raw = api().GetTree(JSON.stringify({ workspace: 0 }));
    const out = JSON.parse(raw);
    expect(out.error).toBeUndefined();
    const getWins = collectWindows(out, { workspace: 0 });
    expect(getWins.some((w) => w.windowId === nidA && String(w.metaWindowId) === "101")).toBe(true);
    expect(getWins.every((w) => String(w.windowId) !== "101")).toBe(true);
  });

  it("does not pick up GObject-only windows after Forest is seeded", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const wA = createMockWindow({ id: 101, wm_class: "DeskA", workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wA);
    nA.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const nidA = wm().hostBag.idFromMeta(wA);
    expect(nidA).toBeTruthy();

    const wB = createMockWindow({ id: 202, wm_class: "DeskB", workspace: ctx.workspaces[0] });
    const nB = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wB);
    nB.mode = WINDOW_MODES.TILE;

    const forest = api()._snapshotForestForApply({ workspace: 0 });
    const collected = collectWindows(forest, { workspace: 0 });
    const collectedMeta = collected.map((w) => String(w.metaWindowId ?? w.windowId));
    expect(collectedMeta).toContain("101");
    expect(collectedMeta).not.toContain("202");
    expect(collected.some((w) => w.windowId === nidA)).toBe(true);
  });

  it("follows Forest FLOATS over a GObject TILE parent", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const wA = createMockWindow({ id: 101, wm_class: "DeskA", workspace: ctx.workspaces[0] });
    const nA = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, wA);
    nA.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    const nidA = wm().hostBag.idFromMeta(wA);
    const tom = nidA ? wm().forest.nodes[nidA] : null;
    expect(tom?.kind).toBe("WINDOW");
    moveWindowToFloats(wm().forest, tom);

    const forest = api()._snapshotForestForApply({ workspace: 0 });
    const orphans = forest.orphanWindows || [];
    expect(orphans.some((w) => w.windowId === nidA && w.mode === "FLOAT")).toBe(true);
    const collected = collectWindows(forest, { workspace: 0 });
    expect(collected.some((w) => w.windowId === nidA)).toBe(false);
  });
});
