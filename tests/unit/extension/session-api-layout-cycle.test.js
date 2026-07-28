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
});
