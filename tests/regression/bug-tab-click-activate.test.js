import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
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

  it("_activateFromTab raises, activates, sets lastTabFocus, restacks", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const wA = createMockWindow({ id: "a", wm_class: "A" });
    const wB = createMockWindow({ id: "b", wm_class: "B" });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;

    wB.raise = vi.fn();
    wB.activate = vi.fn();
    const tabbedSpy = vi.spyOn(wm(), "updateTabbedFocus");
    const stackedSpy = vi.spyOn(wm(), "updateStackedFocus");

    nB._activateFromTab(wB);

    expect(tab.lastTabFocus).toBe(wB);
    expect(wB.raise).toHaveBeenCalled();
    expect(wB.activate).toHaveBeenCalled();
    expect(tabbedSpy).toHaveBeenCalledWith(nB);
    expect(stackedSpy).toHaveBeenCalledWith(nB);
    expect(nA).toBeTruthy();
  });

  it("stacked focus path re-appends via updateStackedFocus after tab activate", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const stack = createCon(monitor.nodeValue, LAYOUT_TYPES.STACKED);
    const wA = createMockWindow({ id: "sa", wm_class: "A" });
    const wB = createMockWindow({ id: "sb", wm_class: "B" });
    const wC = createMockWindow({ id: "sc", wm_class: "C" });
    const nA = wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wA);
    wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wB);
    wm().tree.createNode(stack.nodeValue, NODE_TYPES.WINDOW, wC);

    wA.raise = vi.fn();
    wA.activate = vi.fn();
    expect(stack.lastChild).not.toBe(nA);

    nA._activateFromTab(wA);

    // updateStackedFocus appends focused window to end of STACKED container
    expect(stack.lastChild).toBe(nA);
    expect(wA.activate).toHaveBeenCalled();
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
});
