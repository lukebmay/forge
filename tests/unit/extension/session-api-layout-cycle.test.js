import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";

/**
 * Phase 1 RunSteps parity: layout-cycle, merge-group (session-api ops).
 */
describe("SessionApi layout-cycle / merge-group", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
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

    const out = api()._mergeGroupOp("id:41", "id:42", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.mode).toBe(LAYOUT_TYPES.TABBED);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(n1.parentNode).toBe(con);
    expect(n2.parentNode).toBe(con);
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

    // Profile order: chrome tab left, ghostty right
    const out = api()._orderMonChildrenOp(["id:302", "id:301"], { quiet: true });
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({ ok: true, reordered: true, scope: "mon" });
    // Wrapper gone; mon-direct = tab then ghostty leaf (VSPLIT unwrapped)
    expect(mon.childNodes.length).toBe(2);
    expect(mon.childNodes[0]).toBe(tab);
    expect(mon.childNodes[1]).toBe(nGhost);
    expect(nChrome.parentNode).toBe(tab);
    expect(nGrok.parentNode).toBe(tab);
    expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
  });
});

describe("SessionApi LayoutBatch (CL5)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
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
    expect(wm.tree.findNode(stray)).toBeTruthy();
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
