import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  afterFocus,
  commitLayout,
  settleTabFocus,
  revealGroupChild,
} from "../../../lib/extension/action-pipeline.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";

/**
 * AP1: afterFocus is the only FocusChanged body (F → Dfocus → B → P → A).
 * AP2: commitLayout (one C) + settleTabFocus (no C).
 */
describe("action-pipeline afterFocus", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function trackOne() {
    const meta = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, meta);
    return wm().tree.findNode(meta);
  }

  it("runs F → Dfocus → B → P → A in order and never renderTree", () => {
    const node = trackOne();
    const order = [];
    vi.spyOn(wm(), "updateStackedFocus").mockImplementation(() => order.push("Fstack"));
    vi.spyOn(wm(), "updateTabbedFocus").mockImplementation(() => order.push("Ftab"));
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => order.push("Dfocus"));
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => order.push("B"));
    vi.spyOn(wm(), "movePointerWith").mockImplementation(() => order.push("P"));
    const renderSpy = vi.spyOn(wm(), "renderTree");

    afterFocus(wm(), node, { source: "test" });

    expect(order).toEqual(["Fstack", "Ftab", "Dfocus", "B", "P"]);
    expect(wm().updateDecorationLayout).toHaveBeenCalledWith({
      scope: "focus",
      focusNode: node,
    });
    expect(wm().movePointerWith).toHaveBeenCalledWith(node, { force: false });
    expect(wm().tree.attachNode).toBe(node);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(renderSpy.mock.calls.some((c) => c[0] === "focus")).toBe(false);
  });

  it("passes forcePointer to movePointerWith", () => {
    const node = trackOne();
    const ptr = vi.spyOn(wm(), "movePointerWith").mockImplementation(() => {});
    afterFocus(wm(), node, { forcePointer: true });
    expect(ptr).toHaveBeenCalledWith(node, { force: true });
  });

  it("clears FC2 unfocus hover suppress on intentional focus", () => {
    const node = trackOne();
    wm()._unfocusHoverSuppressMeta = node.nodeValue;
    afterFocus(wm(), node, { source: "command-focus" });
    expect(wm()._unfocusHoverSuppressMeta).toBeNull();
  });

  it("no-ops on null node without calling stages", () => {
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    const tabbed = vi.spyOn(wm(), "updateTabbedFocus");
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    afterFocus(wm(), null);
    afterFocus(null, trackOne());
    expect(stacked).not.toHaveBeenCalled();
    expect(tabbed).not.toHaveBeenCalled();
    expect(deco).not.toHaveBeenCalled();
  });

  it("is idempotent on double call (no thrash / still focus-scoped)", () => {
    const node = trackOne();
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    afterFocus(wm(), node, { source: "once" });
    afterFocus(wm(), node, { source: "twice" });
    expect(deco).toHaveBeenCalledTimes(2);
    expect(deco.mock.calls.every((c) => c[0]?.scope === "focus")).toBe(true);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().tree.attachNode).toBe(node);
  });

  it("WindowManager.afterFocus delegates to pipeline", () => {
    const node = trackOne();
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    wm().afterFocus(node, { source: "wm-delegate" });
    expect(stacked).toHaveBeenCalledWith(node);
    expect(deco).toHaveBeenCalledWith({ scope: "focus", focusNode: node });
  });

  it("restores freeze after temporarily clearing for F/Dfocus", () => {
    const node = trackOne();
    wm().freezeRender();
    expect(wm()._freezeRender).toBe(true);
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    afterFocus(wm(), node, { source: "mid-batch" });
    expect(stacked).toHaveBeenCalledWith(node);
    expect(wm()._freezeRender).toBe(true);
  });

  it("does not leave freeze on when caller was unfrozen", () => {
    const node = trackOne();
    wm().unfreezeRender();
    afterFocus(wm(), node, { source: "normal" });
    expect(wm()._freezeRender).toBe(false);
  });

  it("meta-focus steal restores pin and skips adopting stealer (D018/SE5)", () => {
    const node = trackOne();
    const order = [];
    vi.spyOn(wm(), "restoreLayoutOpenLeafIfStolen").mockImplementation(() => {
      order.push("restore");
      return true;
    });
    vi.spyOn(wm(), "updateStackedFocus").mockImplementation(() => order.push("F"));
    vi.spyOn(wm(), "updateTabbedFocus").mockImplementation(() => order.push("Ftab"));
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => order.push("D"));
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => order.push("B"));
    vi.spyOn(wm(), "movePointerWith").mockImplementation(() => order.push("P"));

    afterFocus(wm(), node, { source: "meta-focus" });

    expect(wm().restoreLayoutOpenLeafIfStolen).toHaveBeenCalledWith(node);
    expect(order).toEqual(["restore", "B"]);
    expect(wm().updateStackedFocus).not.toHaveBeenCalled();
    expect(wm().movePointerWith).not.toHaveBeenCalled();
  });

  it("meta-focus without steal still runs full afterFocus", () => {
    const node = trackOne();
    vi.spyOn(wm(), "restoreLayoutOpenLeafIfStolen").mockReturnValue(false);
    const stacked = vi.spyOn(wm(), "updateStackedFocus");
    afterFocus(wm(), node, { source: "meta-focus" });
    expect(stacked).toHaveBeenCalledWith(node);
  });
});

describe("action-pipeline commitLayout / settleTabFocus", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function trackOne() {
    const meta = createMockWindow({ wm_class: "App", workspace: ctx.workspaces[0] });
    wm().trackWindow(null, meta);
    return wm().tree.findNode(meta);
  }

  it("commitLayout force → one renderTree Cf", () => {
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const reqSpy = vi.spyOn(wm(), "requestLayout").mockImplementation(() => {});
    commitLayout(wm(), "move-window", { force: true });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith("move-window", true);
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it("commitLayout default → requestLayout Cq", () => {
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const reqSpy = vi.spyOn(wm(), "requestLayout").mockImplementation(() => {});
    commitLayout(wm(), "external");
    expect(reqSpy).toHaveBeenCalledWith("external");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("WindowManager.commitLayout delegates", () => {
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm().commitLayout("swap", { force: true });
    expect(renderSpy).toHaveBeenCalledWith("swap", true);
  });

  it("settleTabFocus runs F+Dfocus+B and never renderTree", () => {
    const node = trackOne();
    const order = [];
    vi.spyOn(wm(), "updateStackedFocus").mockImplementation(() => order.push("Fstack"));
    vi.spyOn(wm(), "updateTabbedFocus").mockImplementation(() => order.push("Ftab"));
    vi.spyOn(wm(), "updateDecorationLayout").mockImplementation(() => order.push("Dfocus"));
    vi.spyOn(wm(), "updateBorderLayout").mockImplementation(() => order.push("B"));
    const ptr = vi.spyOn(wm(), "movePointerWith").mockImplementation(() => {});
    const renderSpy = vi.spyOn(wm(), "renderTree");

    settleTabFocus(wm(), node);

    expect(order).toEqual(["Fstack", "Ftab", "Dfocus", "B"]);
    expect(ptr).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("WindowManager.settleTabFocus delegates", () => {
    const node = trackOne();
    const tab = vi.spyOn(wm(), "updateTabbedFocus");
    wm().settleTabFocus(node);
    expect(tab).toHaveBeenCalledWith(node);
  });

  it("settleTabFocus restores freeze when called under Z", () => {
    const node = trackOne();
    wm().freezeRender();
    settleTabFocus(wm(), node);
    expect(wm()._freezeRender).toBe(true);
  });
});

describe("action-pipeline revealGroupChild", () => {
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

  function tabbedPair() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wA = createMockWindow({ id: 101, wm_class: "A" });
    const wB = createMockWindow({ id: 102, wm_class: "B" });
    const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;
    wA.raise = vi.fn();
    wA.activate = vi.fn();
    wA.focus = vi.fn();
    wB.raise = vi.fn();
    wB.activate = vi.fn();
    wB.focus = vi.fn();
    return { tab, wA, wB, nA, nB };
  }

  it("keyboard:false writes LTF, raises, settle; does not activate", () => {
    const { tab, wB, nB } = tabbedPair();
    const settle = vi.spyOn(wm(), "settleTabFocus");
    const after = vi.spyOn(wm(), "afterFocus");

    revealGroupChild(wm(), nB, { keyboard: false });

    expect(tab.lastTabFocus).toBe(wB);
    expect(wB.raise).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledWith(nB);
    expect(wB.activate).not.toHaveBeenCalled();
    expect(wB.focus).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("R025: reasserts the revealed child to slot before raise", () => {
    const { nB, wB } = tabbedPair();
    const order = [];
    const reassert = vi.spyOn(wm(), "reassertNodeToSlot").mockImplementation(() => {
      order.push("reassert");
      return true;
    });
    wB.raise = vi.fn(() => order.push("raise"));

    revealGroupChild(wm(), nB, { keyboard: false });

    expect(reassert).toHaveBeenCalledWith(nB);
    expect(order[0]).toBe("reassert");
    expect(order).toContain("raise");
  });

  it("R025: skips slot reassert when zoomMode is set", () => {
    const { nB } = tabbedPair();
    nB.zoomMode = "full";
    const reassert = vi.spyOn(wm(), "reassertNodeToSlot");

    revealGroupChild(wm(), nB, { keyboard: false });

    expect(reassert).not.toHaveBeenCalled();
  });

  it("R025: afterFocus does not reassert (intra-tab PWA path)", () => {
    const { nA } = tabbedPair();
    const reassert = vi.spyOn(wm(), "reassertNodeToSlot");
    afterFocus(wm(), nA, { source: "meta-focus" });
    expect(reassert).not.toHaveBeenCalled();
  });

  it("keyboard:true activates and afterFocus", () => {
    const { tab, wB, nB } = tabbedPair();
    const after = vi.spyOn(wm(), "afterFocus");

    revealGroupChild(wm(), nB, { keyboard: true, source: "dbus-focus" });

    expect(tab.lastTabFocus).toBe(wB);
    expect(wB.raise).toHaveBeenCalled();
    expect(wB.activate).toHaveBeenCalled();
    expect(after).toHaveBeenCalledWith(nB, { source: "dbus-focus" });
  });

  it("pin:true pins open leaf so meta-focus steal restores", () => {
    const { tab, wA, wB, nA, nB } = tabbedPair();
    revealGroupChild(wm(), nA, { pin: true });
    expect(tab.lastTabFocus).toBe(wA);
    expect(wm().getLayoutOpenLeafPin(tab)?.meta).toBe(wA);

    nB.parentNode = tab;
    const restored = wm().restoreLayoutOpenLeafIfStolen(nB);
    expect(restored).toBe(true);
    expect(tab.lastTabFocus).toBe(wA);
    expect(wA.raise).toHaveBeenCalled();
    expect(wB.activate).not.toHaveBeenCalled();
  });

  it("R026: tab-click reveal adopts a live pin so meta-focus does not snap back", () => {
    const { tab, wA, wB, nA, nB } = tabbedPair();
    revealGroupChild(wm(), nA, { pin: true });
    expect(wm().getLayoutOpenLeafPin(tab)?.meta).toBe(wA);

    revealGroupChild(wm(), nB, { keyboard: true, source: "tab-click" });
    expect(tab.lastTabFocus).toBe(wB);
    expect(wm().getLayoutOpenLeafPin(tab)?.meta).toBe(wB);

    expect(wm().restoreLayoutOpenLeafIfStolen(nB)).toBe(false);
    afterFocus(wm(), nB, { source: "meta-focus" });
    expect(tab.lastTabFocus).toBe(wB);
  });

  it("R026: after adopt, late pin-sibling activate restores the clicked tab", () => {
    const { tab, wA, wB, nA, nB } = tabbedPair();
    revealGroupChild(wm(), nA, { pin: true });
    revealGroupChild(wm(), nB, { keyboard: true, source: "tab-click" });

    const restored = wm().restoreLayoutOpenLeafIfStolen(nA);
    expect(restored).toBe(true);
    expect(tab.lastTabFocus).toBe(wB);
  });

  it("R026: reveal without a live pin does not start one", () => {
    const { tab, wB, nB } = tabbedPair();
    revealGroupChild(wm(), nB, { keyboard: true, source: "tab-click" });
    expect(tab.lastTabFocus).toBe(wB);
    expect(wm().getLayoutOpenLeafPin(tab)).toBeNull();
  });

  it("WindowManager.revealGroupChild delegates", () => {
    const { nB, wB, tab } = tabbedPair();
    wm().revealGroupChild(nB, { keyboard: false });
    expect(tab.lastTabFocus).toBe(wB);
    expect(wB.raise).toHaveBeenCalled();
    expect(wB.activate).not.toHaveBeenCalled();
  });
});
