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
    expect(tabbedSpy).toHaveBeenCalledWith(nB);
    expect(stackedSpy).toHaveBeenCalledWith(nB);
    // Raise buries chrome; restack immediately (do not wait for focus-update queue).
    expect(decoSpy).toHaveBeenCalled();
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
    const orderBefore = stack.childNodes.slice();
    expect(stack.lastChild).not.toBe(nA);

    nA._activateFromTab(wA);

    // Chrome order stays [A,B,C]; focus is lastTabFocus + raise only.
    expect(stack.childNodes).toEqual(orderBefore);
    expect(stack.childNodes[0]).toBe(nA);
    expect(stack.childNodes[1]).toBe(nB);
    expect(stack.childNodes[2]).toBe(nC);
    expect(stack.lastTabFocus).toBe(wA);
    expect(wA.raise).toHaveBeenCalled();
    expect(wA.focus).toHaveBeenCalled();
    expect(wA.activate).toHaveBeenCalled();
  });

  it("tab click restacks chrome above group after raise buries it (LF2)", () => {
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
    wB.raise = vi.fn(() => {
      const wg = global.window_group;
      if (wg.contains(actorB)) wg.remove_child(actorB);
      wg.add_child(actorB);
    });
    wB.focus = vi.fn();
    wB.activate = vi.fn();

    const deco = { name: "deco", show: vi.fn(), hide: vi.fn() };
    tab.decoration = deco;
    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);
    wg.add_child(deco);

    // Real decoration restack (not a no-op spy).
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => {
      const tiled = wm().tree.getTiledChildren(tab.childNodes);
      wm().decorationManager._restackDecorationAboveGroup(tab, tiled);
    });
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => {});

    nB._activateFromTab(wB);

    const children = wg.get_children();
    expect(children.indexOf(deco)).toBeGreaterThan(children.indexOf(actorA));
    expect(children.indexOf(deco)).toBeGreaterThan(children.indexOf(actorB));
    expect(nA).toBeTruthy();
  });

  it("unfreezes render so tab restack is not a freeze no-op (LF2)", () => {
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

    nB._activateFromTab(wB);

    expect(wm()._freezeRender).toBe(false);
    expect(tabbedSpy).toHaveBeenCalledWith(nB);
    expect(decoSpy).toHaveBeenCalled();
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

  it("_restackDecorationAboveGroup inserts decoration above group actors", () => {
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

    const deco = { name: "deco", show: vi.fn(), hide: vi.fn() };
    con.decoration = deco;

    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(actorB);
    wg.add_child(deco);

    const dm = ctx.windowManager.decorationManager;
    dm._restackDecorationAboveGroup(con, [nA, nB]);

    const children = wg.get_children();
    const decoIdx = children.indexOf(deco);
    const aIdx = children.indexOf(actorA);
    const bIdx = children.indexOf(actorB);
    expect(decoIdx).toBeGreaterThan(aIdx);
    expect(decoIdx).toBeGreaterThan(bIdx);
  });

  it("RunSteps settle restacks chrome after tab raise (WR14)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.windowManager.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;

    const wA = createMockWindow({ id: "sa" });
    const wB = createMockWindow({ id: "sb" });
    const nA = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wB);
    con.lastTabFocus = wB;

    const actorA = { name: "actorA" };
    const actorB = { name: "actorB" };
    wA.get_compositor_private = () => actorA;
    wB.get_compositor_private = () => actorB;
    wB.raise = vi.fn(() => {
      // Simulate Meta.raise burying chrome under the window actor.
      const wg = global.window_group;
      if (wg.contains(actorB)) wg.remove_child(actorB);
      wg.add_child(actorB);
    });

    const deco = { name: "deco", show: vi.fn(), hide: vi.fn() };
    con.decoration = deco;

    const wg = global.window_group;
    wg.add_child(actorA);
    wg.add_child(deco);
    wg.add_child(actorB); // window above chrome (broken post-batch state)

    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    // Scope settle to this CON (avoid whole-tree decoration hide).
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {
      const tiled = ctx.windowManager.tree.getTiledChildren(con.childNodes);
      ctx.windowManager.decorationManager._restackDecorationAboveGroup(con, tiled);
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});

    api._settleAfterRunSteps(ctx.windowManager);

    expect(wB.raise).toHaveBeenCalled();
    const children = wg.get_children();
    expect(children.indexOf(deco)).toBeGreaterThan(children.indexOf(actorA));
    expect(children.indexOf(deco)).toBeGreaterThan(children.indexOf(actorB));
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
