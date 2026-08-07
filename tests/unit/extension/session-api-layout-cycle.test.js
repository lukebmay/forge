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
    const lcSpy = vi.spyOn(ctx.windowManager.layoutController, "requestLayout");
    const end = JSON.parse(a.LayoutBatch("end"));
    expect(end).toMatchObject({ ok: true, depth: 0, committed: true });
    expect(lcSpy).toHaveBeenCalledWith("open-batch");
    expect(ctx.windowManager.openLayoutBatchActive).toBe(false);
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
    expect(out.error).toMatch(/begin\|end\|release-deferred/);
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
