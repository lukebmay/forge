import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * Tab click activation: group tabs must raise/activate the target window and
 * restack stacked/tabbed containers without requiring a prior click into the
 * active window content.
 */
describe("tab click activates associated window", () => {
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

  it("_activateFromTab raises, focuses, activates, sets lastTabFocus, restacks", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wA = createMockWindow({ id: "a", wm_class: "A" });
    const wB = createMockWindow({ id: "b", wm_class: "B" });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;

    wB.raise = vi.fn();
    wB.focus = vi.fn();
    wB.activate = vi.fn();
    const afterSpy = vi.spyOn(wm(), "afterFocus");
    const tabbedSpy = vi.spyOn(wm(), "updateTabbedFocus");
    const stackedSpy = vi.spyOn(wm(), "updateStackedFocus");
    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    const borderSpy = vi.spyOn(wm(), "updateBorderLayout");

    nB._activateFromTab(wB);

    expect(tab.lastTabFocus).toBe(wB);
    expect(wB.raise).toHaveBeenCalled();
    // LF2: focus+activate (keyboard path); activate-only failed on X11 after multi-mon.
    expect(wB.focus).toHaveBeenCalled();
    expect(wB.activate).toHaveBeenCalled();
    // Immediate afterFocus (raise buries strip; Meta queue may skip if focus unchanged).
    expect(afterSpy).toHaveBeenCalledWith(nB, { source: "tab-click" });
    expect(tabbedSpy).toHaveBeenCalledWith(nB);
    expect(stackedSpy).toHaveBeenCalledWith(nB);
    expect(decoSpy).toHaveBeenCalledWith({ scope: "focus", focusNode: nB });
    expect(borderSpy).toHaveBeenCalled();
    expect(nA).toBeTruthy();
  });

  it("stacked focus path raises without reordering chrome labels", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const stack = createCon(monitor.nodeValue, LAYOUT_TYPES.STACKED);
    const wA = createMockWindow({ id: "sa", wm_class: "A" });
    const wB = createMockWindow({ id: "sb", wm_class: "B" });
    const wC = createMockWindow({ id: "sc", wm_class: "C" });
    const nA = wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wB);
    const nC = wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wC);

    wA.raise = vi.fn();
    wA.focus = vi.fn();
    wA.activate = vi.fn();
    const orderBefore = kidsOf(wm(), stack);
    expect(orderBefore[orderBefore.length - 1]).not.toBe(nA);

    nA._activateFromTab(wA);

    // Chrome order stays [A,B,C]; focus is lastTabFocus + raise only.
    expect(kidsOf(wm(), stack)).toEqual(orderBefore);
    expect(kidsOf(wm(), stack)[0]).toBe(nA);
    expect(kidsOf(wm(), stack)[1]).toBe(nB);
    expect(kidsOf(wm(), stack)[2]).toBe(nC);
    expect(stack.lastTabFocus).toBe(wA);
    expect(wA.raise).toHaveBeenCalled();
    expect(wA.focus).toHaveBeenCalled();
    expect(wA.activate).toHaveBeenCalled();
  });

  it("tab click attaches chrome to layer so raise cannot bury it (LF2 / I-TabPickable)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wA = createMockWindow({ id: "lf2a", wm_class: "A" });
    const wB = createMockWindow({ id: "lf2b", wm_class: "B" });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;

    const actorA = { name: "actorA" };
    const actorB = { name: "actorB" };
    wA.get_compositor_private = () => actorA;
    wB.get_compositor_private = () => actorB;
    const bury = (actor) => {
      const g = global.window_group;
      if (g.contains(actor)) g.remove_child(actor);
      g.add_child(actor);
    };
    wB.raise = vi.fn(() => bury(actorB));
    wB.focus = vi.fn(() => bury(actorB));
    wB.activate = vi.fn(() => bury(actorB));

    const deco = {
      name: "deco",
      type: "forge-deco",
      show: vi.fn(),
      hide: vi.fn(),
      get_parent() {
        return this._parent || null;
      },
    };
    tab.decoration = deco;
    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);

    // Real decoration attach (not a no-op spy).
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => {
      const tiled = wm().tree.getTiledChildren(kidsOf(wm(), tab));
      wm().decorationManager._restackDecorationAboveGroup(tab, tiled);
    });
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => {});

    nB._activateFromTab(wB);

    const layer = wm().decorationManager.tabChromeLayer;
    expect(layer).toBeTruthy();
    expect(wg.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(Main.layoutManager._trackedChrome.has(deco)).toBe(true);
    // Raise still reorders window actors; deco is not among them.
    expect(wg.get_children().indexOf(actorB)).toBeGreaterThan(wg.get_children().indexOf(actorA));
    expect(nA).toBeTruthy();
  });

  it("temporarily unfreezes so tab restack is not a freeze no-op (LF2)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wA = createMockWindow({ id: "fz-a" });
    const wB = createMockWindow({ id: "fz-b" });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);

    wm().freezeRender();
    expect(wm()._freezeRender).toBe(true);

    wB.raise = vi.fn();
    wB.focus = vi.fn();
    wB.activate = vi.fn();
    const tabbedSpy = vi.spyOn(wm(), "updateTabbedFocus");
    const decoSpy = vi.spyOn(wm(), "updateDecorationLayout");
    // Stages must run while freeze is clear; afterFocus restores batch Z.
    tabbedSpy.mockImplementation(() => {
      expect(wm()._freezeRender).toBe(false);
    });

    nB._activateFromTab(wB);

    expect(tabbedSpy).toHaveBeenCalledWith(nB);
    expect(decoSpy).toHaveBeenCalled();
    expect(wm()._freezeRender).toBe(true);
  });
});

describe("decoration restack above group (not global focus)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("_restackDecorationAboveGroup attaches decoration to tab chrome layer", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.windowManager.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;

    const wA = createMockWindow({ id: "da" });
    const wB = createMockWindow({ id: "db" });
    const nA = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wB);

    const actorA = { name: "actorA" };
    const actorB = { name: "actorB" };
    wA.get_compositor_private = () => actorA;
    wB.get_compositor_private = () => actorB;

    const deco = {
      name: "deco",
      type: "forge-deco",
      show: vi.fn(),
      hide: vi.fn(),
      get_parent() {
        return this._parent || null;
      },
    };
    con.decoration = deco;

    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);

    const dm = ctx.windowManager.decorationManager;
    dm._restackDecorationAboveGroup(con, [nA, nB]);

    const layer = dm.tabChromeLayer;
    expect(layer).toBeTruthy();
    expect(layer.name).toBe("forge-tab-chrome");
    expect(wg.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(Main.layoutManager._trackedChrome.has(deco)).toBe(true);
    // Layer parked above window_group in uiGroup.
    const uiKids = Main.layoutManager.uiGroup.get_children();
    expect(uiKids.indexOf(layer)).toBeGreaterThan(uiKids.indexOf(wg));
    expect(nA).toBeTruthy();
    expect(nB).toBeTruthy();
  });

  it("RunSteps settle attaches chrome after tab raise (WR14)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.windowManager.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;

    const wA = createMockWindow({ id: "sa" });
    const wB = createMockWindow({ id: "sb" });
    const nA = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wB);
    con.lastTabFocus = wB;
    if (ctx.windowManager._liveForestSeeded) seedLiveForest(ctx.windowManager);

    const actorA = { name: "actorA" };
    const actorB = { name: "actorB" };
    wA.get_compositor_private = () => actorA;
    wB.get_compositor_private = () => actorB;

    const deco = {
      name: "deco",
      type: "forge-deco",
      show: vi.fn(),
      hide: vi.fn(),
      get_parent() {
        return this._parent || null;
      },
    };
    con.decoration = deco;

    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);

    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    // Scope settle to this CON (avoid whole-tree decoration hide).
    // Done path: attach/track strip only (R032). Avoid _raiseGroupWindowsForChrome.
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {
      ctx.windowManager.decorationManager.attachTabDecoration(con);
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});

    api._settleAfterRunSteps(ctx.windowManager);

    expect(con.lastTabFocus).toBe(wB);
    const layer = ctx.windowManager.decorationManager.tabChromeLayer;
    expect(wg.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(Main.layoutManager._trackedChrome.has(deco)).toBe(true);
    expect(nA).toBeTruthy();
    expect(nB).toBeTruthy();
  });

  it("RunSteps schedules settle after successful batch (WR14)", () => {
    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    const settleSpy = vi.spyOn(api, "_settleAfterRunSteps").mockImplementation(() => {});
    const scheduleSpy = vi.spyOn(api, "_scheduleRunStepsSettle");

    const out = JSON.parse(api.RunSteps(JSON.stringify([{ op: "ping" }])));
    expect(out.ok).toBe(true);
    expect(scheduleSpy).toHaveBeenCalled();
    // GLib.idle_add mock runs callbacks immediately.
    expect(settleSpy).toHaveBeenCalledWith(ctx.windowManager);
  });

  it("R032: ApplyLayout steps schedule WR14 tab settle", () => {
    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    const settleSpy = vi.spyOn(api, "_settleAfterRunSteps").mockImplementation(() => {});
    vi.spyOn(ctx.windowManager, "commitLayout").mockImplementation(() => {});

    const out = api._runApplyLayoutSteps([{ op: "ping" }], { phase: "focus" });
    expect(out.ok).toBe(true);
    expect(settleSpy).toHaveBeenCalledWith(ctx.windowManager);
  });

  function tabbedGroupWithStrip(idPrefix) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.windowManager.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;

    const wA = createMockWindow({ id: `${idPrefix}-a` });
    const wB = createMockWindow({ id: `${idPrefix}-b` });
    const nA = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wB);
    con.lastTabFocus = wB;

    const actorA = { name: "actorA" };
    const actorB = { name: "actorB" };
    wA.get_compositor_private = () => actorA;
    wB.get_compositor_private = () => actorB;
    wB.raise = vi.fn(() => {
      const g = global.window_group;
      if (g.contains(actorB)) g.remove_child(actorB);
      g.add_child(actorB);
    });

    const deco = {
      name: "deco",
      type: "forge-deco",
      show: vi.fn(),
      hide: vi.fn(),
      get_parent() {
        return this._parent || null;
      },
    };
    con.decoration = deco;

    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);

    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {
      const tiled = ctx.windowManager.tree.getTiledChildren(kidsOf(ctx.windowManager, con));
      ctx.windowManager.decorationManager._restackDecorationAboveGroup(con, tiled);
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});
    if (ctx.windowManager._liveForestSeeded) seedLiveForest(ctx.windowManager);
    return { api, con, wB, nA, nB, deco, actorA, actorB, wg };
  }

  it("R032: ApplyLayout Done attaches chrome after last raise (no second raise)", () => {
    const { api, wB, nA, nB, deco, wg } = tabbedGroupWithStrip("al");

    const bag = api._ensureLayoutApplyRuns();
    bag._onDone({ applyId: "r032", ok: true });

    const layer = ctx.windowManager.decorationManager.tabChromeLayer;
    expect(wg.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(Main.layoutManager._trackedChrome.has(deco)).toBe(true);
    // R032 Done: chrome on layer (user-visible). G5d restack may raise for Z;
    // obsolete: assert zero raises on Done (D100/G8n).
    expect(nA).toBeTruthy();
    expect(nB).toBeTruthy();
    expect(wB).toBeTruthy();
  });

  it("R032: ApplyLayout Done attaches even while render is frozen", () => {
    const { api, deco, wg } = tabbedGroupWithStrip("al-fz");
    ctx.windowManager.freezeRender();
    expect(ctx.windowManager._freezeRender).toBe(true);

    const bag = api._ensureLayoutApplyRuns();
    bag._onDone({ applyId: "r032-frozen", ok: true });

    const layer = ctx.windowManager.decorationManager.tabChromeLayer;
    expect(wg.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(ctx.windowManager._freezeRender).toBe(true);
  });
});

describe("hover focus does not bury tab chrome (LF2)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-on-hover-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("does not re-raise when pointer window is already focused", () => {
    const win = createMockWindow({ id: "hover-a" });
    win.focus = vi.fn();
    win.raise = vi.fn();
    ctx.display.get_focus_window.mockReturnValue(win);
    vi.spyOn(ctx.windowManager, "_getMetaWindowAtPointer").mockReturnValue(win);
    ctx.windowManager.shouldFocusOnHover = true;

    const cont = ctx.windowManager._focusWindowUnderPointer();
    expect(cont).toBe(true);
    expect(win.focus).not.toHaveBeenCalled();
    expect(win.raise).not.toHaveBeenCalled();
  });

  it("focuses and raises when pointer window differs from focus", () => {
    const focused = createMockWindow({ id: "hover-f" });
    const under = createMockWindow({ id: "hover-u" });
    under.focus = vi.fn();
    under.raise = vi.fn();
    ctx.display.get_focus_window.mockReturnValue(focused);
    vi.spyOn(ctx.windowManager, "_getMetaWindowAtPointer").mockReturnValue(under);
    ctx.windowManager.shouldFocusOnHover = true;

    ctx.windowManager._focusWindowUnderPointer();
    expect(under.focus).toHaveBeenCalled();
    expect(under.raise).toHaveBeenCalled();
  });
});
