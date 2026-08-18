import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../../mocks/helpers/index.js";
import St from "../../mocks/gnome/St.js";

/**
 * Dedicated unit suite for lib/extension/decoration.js (DecorationManager).
 *
 * DecorationManager's methods are mixed onto WindowManager and were previously
 * only exercised incidentally by regression tests. This suite covers the two
 * decision-making entry points directly, asserting the SHOW vs HIDE outcome
 * (not merely "was called"):
 *   1. updateDecorationLayout() — the tab/stack header show/hide state machine.
 *   2. The border lifecycle — showWindowBorders() visibility gating and the
 *      idempotent _destroyActorBorder() teardown.
 */
describe("DecorationManager.updateDecorationLayout", () => {
  let ctx;
  let con;

  // A tabbed CON with two visible tiled windows is the canonical "decoration
  // should show" baseline (mirrors the forge-iwi fixture).
  function buildTabbedCon(settings) {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true, ...settings },
    });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    con.decoration = {
      show: vi.fn(),
      hide: vi.fn(),
      type: "forge-deco",
      get_parent() {
        return this._parent || null;
      },
    };
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-a" } });
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-b" } });
  }

  // Add a window directly on the monitor (sibling of the CON) in a given state.
  function addMonitorWindow({ maximize = false, fullscreen = false, minimized = false } = {}) {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "other" },
    });
    if (maximize) metaWindow.maximize();
    if (fullscreen) metaWindow.make_fullscreen();
    if (minimized) metaWindow.minimized = true;
    return metaWindow;
  }

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("shows tab decorations for a CON with visible tiled children when showtab is enabled", () => {
    buildTabbedCon();

    ctx.windowManager.updateDecorationLayout();

    // Decorations are always hidden up-front, then re-shown for eligible CONs.
    expect(con.decoration.hide).toHaveBeenCalled();
    expect(con.decoration.show).toHaveBeenCalled();
  });

  it("hides decorations but never re-shows them when showtab-decoration-enabled is off", () => {
    buildTabbedCon({ "showtab-decoration-enabled": false });

    ctx.windowManager.updateDecorationLayout();

    // The up-front hide-all pass still runs, but the show gate is closed.
    expect(con.decoration.hide).toHaveBeenCalled();
    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("early-returns (decorations stay hidden) when every window on the workspace is minimized", () => {
    buildTabbedCon();
    // Minimize both tabbed children -> allWindows.length === allHiddenWindows.length.
    con.childNodes.forEach((cn) => {
      cn.nodeValue.minimized = true;
    });

    ctx.windowManager.updateDecorationLayout();

    // Hidden by the up-front pass; the early return prevents any re-show.
    expect(con.decoration.hide).toHaveBeenCalled();
    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("suppresses decorations on a monitor that has a visible maximized window", () => {
    buildTabbedCon();
    addMonitorWindow({ maximize: true, minimized: false });

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("still shows decorations when the maximized window is merely minimized (forge-iwi)", () => {
    buildTabbedCon();
    addMonitorWindow({ maximize: true, minimized: true });

    ctx.windowManager.updateDecorationLayout();

    // A minimized maximized window covers nothing, so it must not keep the
    // tabbed decoration hidden.
    expect(con.decoration.show).toHaveBeenCalled();
  });

  it("still shows decorations when a fullscreen window is minimized (forge-iwi)", () => {
    buildTabbedCon();
    addMonitorWindow({ fullscreen: true, minimized: true });

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.show).toHaveBeenCalled();
  });

  it("does not re-show decoration when CON layout is no longer stacked/tabbed", () => {
    buildTabbedCon();
    // Auto-exit / layout toggle off TABBED leaves decoration until teardown;
    // re-show must stay gated on isStackedOrTabbed (ghost CSD hit plate).
    con.layout = LAYOUT_TYPES.HSPLIT;

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.hide).toHaveBeenCalled();
    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("scope:focus restacks focused CON only and does not hide-all", () => {
    buildTabbedCon();
    const focusChild = con.childNodes[0];
    const restackSpy = vi.spyOn(
      ctx.windowManager.decorationManager,
      "_restackDecorationAboveGroup"
    );

    ctx.windowManager.updateDecorationLayout({
      scope: "focus",
      focusNode: focusChild,
    });

    expect(con.decoration.hide).not.toHaveBeenCalled();
    expect(con.decoration.show).toHaveBeenCalled();
    expect(restackSpy).toHaveBeenCalledWith(con, expect.any(Array));
  });

  it("scope:focus is a no-op when focus is not in a tabbed/stacked CON", () => {
    buildTabbedCon();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "solo" },
    });
    const restackSpy = vi.spyOn(
      ctx.windowManager.decorationManager,
      "_restackDecorationAboveGroup"
    );

    ctx.windowManager.updateDecorationLayout({
      scope: "focus",
      focusNode: nodeWindow,
    });

    expect(con.decoration.hide).not.toHaveBeenCalled();
    expect(con.decoration.show).not.toHaveBeenCalled();
    expect(restackSpy).not.toHaveBeenCalled();
  });
});

describe("DecorationManager border lifecycle", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-border-toggle": true,
        "focus-border-hidden-on-single": false,
        "split-border-toggle": false,
        "window-gap-size": 4,
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  function mockBorder() {
    return {
      set_style_class_name: vi.fn(),
      add_style_class_name: vi.fn(),
      remove_style_class_name: vi.fn(),
      set_size: vi.fn(),
      set_position: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    };
  }

  // Two tiled HSPLIT windows; returns the focused window's border + metaWindow.
  function buildTwoTiled() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const { metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "focused", wm_class: "TestApp" },
    });
    createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "sibling", wm_class: "TestApp" },
    });
    const border = mockBorder();
    metaWindow.get_compositor_private().border = border;
    global.display.get_focus_window.mockReturnValue(metaWindow);
    return { border, metaWindow };
  }

  describe("showWindowBorders visibility gating (appears_focused && !minimized)", () => {
    it("sizes the border from the tile slot when Meta frame is a wrong sliver", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;
      // Meta reports a thin frame (Chrome PWA lag); tree slot is half-mon wide.
      metaWindow.get_frame_rect = vi.fn(() => ({ x: 100, y: 50, width: 200, height: 900 }));
      const node = wm().findNodeWindow(metaWindow);
      node.renderRect = { x: 0, y: 0, width: 960, height: 1080 };
      node.rect = { x: 0, y: 0, width: 960, height: 1080 };

      wm().showWindowBorders();

      expect(border.set_size).toHaveBeenCalled();
      const [w, h] = border.set_size.mock.calls.at(-1);
      // Slot 960×1080 + inset (3*dpi each side); dpi mock is often 1 → +6.
      expect(w).toBeGreaterThanOrEqual(960);
      expect(h).toBeGreaterThanOrEqual(1080);
      // Not the 200px Meta sliver (+ inset).
      expect(w).toBeGreaterThan(400);
    });

    it("shows the border when the window appears focused and is not minimized", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;

      wm().showWindowBorders();

      expect(border.show).toHaveBeenCalled();
    });

    it("does NOT show the border when the window is minimized", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = true;
      metaWindow.minimized = true;

      wm().showWindowBorders();

      // The border is still sized/positioned, but must not be made visible.
      expect(border.set_size).toHaveBeenCalled();
      expect(border.show).not.toHaveBeenCalled();
    });

    it("does NOT show the border when the window does not appear focused", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = false;
      metaWindow.minimized = false;

      wm().showWindowBorders();

      expect(border.show).not.toHaveBeenCalled();
    });
  });

  describe("showWindowBorders hides the focus border for covering windows", () => {
    it("does not draw the focus border for a maximized window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "max", wm_class: "TestApp" },
      });
      metaWindow.appears_focused = true;
      metaWindow.maximize();
      const border = mockBorder();
      metaWindow.get_compositor_private().border = border;
      global.display.get_focus_window.mockReturnValue(metaWindow);

      wm().showWindowBorders();

      // maximized() short-circuits the focus-border block: no class, no show.
      expect(border.set_style_class_name).not.toHaveBeenCalled();
      expect(border.show).not.toHaveBeenCalled();
    });

    it("does not draw the focus border for a fullscreen window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "fs", wm_class: "TestApp" },
      });
      metaWindow.appears_focused = true;
      metaWindow.make_fullscreen();
      const border = mockBorder();
      metaWindow.get_compositor_private().border = border;
      global.display.get_focus_window.mockReturnValue(metaWindow);

      wm().showWindowBorders();

      expect(border.set_style_class_name).not.toHaveBeenCalled();
      expect(border.show).not.toHaveBeenCalled();
    });
  });

  describe("_destroyActorBorder teardown is idempotent", () => {
    it("removes the border from window_group, hides it, and is safe to call twice", () => {
      const border = new St.Bin();
      global.window_group.add_child(border);
      const actor = { border };
      const hideSpy = vi.spyOn(border, "hide");

      expect(global.window_group.contains(border)).toBe(true);

      wm()._destroyActorBorder(actor, "border");

      // The actual teardown effect: detached from window_group and hidden.
      expect(global.window_group.contains(border)).toBe(false);
      expect(hideSpy).toHaveBeenCalled();

      // Second teardown must not throw or re-attach (no double-free).
      expect(() => wm()._destroyActorBorder(actor, "border")).not.toThrow();
      expect(global.window_group.contains(border)).toBe(false);
    });

    it("is a no-op when the named border slot is empty", () => {
      const actor = { border: null };
      expect(() => wm()._destroyActorBorder(actor, "border")).not.toThrow();
    });
  });
});

describe("DecorationManager split chrome I5", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-border-toggle": true,
        "focus-border-hidden-on-single": false,
        "split-border-toggle": true,
        "split-chrome-show-all": false,
        "window-gap-size": 4,
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  function mockBorder() {
    return {
      set_style_class_name: vi.fn(),
      add_style_class_name: vi.fn(),
      remove_style_class_name: vi.fn(),
      set_size: vi.fn(),
      set_position: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    };
  }

  it("ancestry paints split borders on both HSPLIT siblings", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const { metaWindow: focusedMeta, nodeWindow: focusedNode } = createWindowNode(
      ctx.tree,
      monitor,
      {
        windowOverrides: { id: "focused", wm_class: "TestApp" },
      }
    );
    const { metaWindow: sibMeta, nodeWindow: sibNode } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "sibling", wm_class: "TestApp" },
    });
    focusedMeta.appears_focused = true;
    focusedMeta.minimized = false;
    sibMeta.appears_focused = false;
    sibMeta.minimized = false;
    focusedNode.renderRect = { x: 0, y: 0, width: 960, height: 1080 };
    sibNode.renderRect = { x: 960, y: 0, width: 960, height: 1080 };
    focusedMeta.get_compositor_private().border = mockBorder();
    global.display.get_focus_window.mockReturnValue(focusedMeta);

    wm().showWindowBorders();

    const focusSplit = focusedMeta.get_compositor_private().splitBorder;
    const sibSplit = sibMeta.get_compositor_private().splitBorder;
    expect(focusSplit).toBeTruthy();
    expect(sibSplit).toBeTruthy();
    expect(focusSplit.get_style_class_name()).toContain("window-split-horizontal");
    expect(sibSplit.get_style_class_name()).toContain("window-split-horizontal");
    expect(focusSplit.visible).toBe(true);
    expect(sibSplit.visible).toBe(true);
  });

  it("setSplitChromeForceShowAll toggles the force flag and refreshes", () => {
    const dm = wm().decorationManager;
    const spy = vi.spyOn(dm, "updateBorderLayout");
    expect(dm._splitChromeForceShowAll).toBe(false);
    dm.setSplitChromeForceShowAll(true);
    expect(dm._splitChromeForceShowAll).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    dm.setSplitChromeForceShowAll(true);
    expect(spy).toHaveBeenCalledTimes(1);
    dm.setSplitChromeForceShowAll(false);
    expect(dm._splitChromeForceShowAll).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("DecorationManager.attachTabDecoration (I-TabPickable)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("attach twice does not throw and trackChrome runs once", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const deco = new St.BoxLayout();
    deco.type = "forge-deco";
    con.decoration = deco;

    const dm = ctx.windowManager.decorationManager;
    const trackSpy = Main.layoutManager.trackChrome;

    expect(() => dm.attachTabDecoration(con)).not.toThrow();
    expect(() => dm.attachTabDecoration(con)).not.toThrow();

    expect(trackSpy).toHaveBeenCalledTimes(1);
    expect(trackSpy).toHaveBeenCalledWith(deco, {
      affectsStruts: false,
      trackFullscreen: false,
      affectsInputRegion: true,
    });
    const layer = dm.tabChromeLayer;
    expect(layer).toBeTruthy();
    expect(layer.name).toBe("forge-tab-chrome");
    expect(layer.reactive).toBe(false);
    expect(global.window_group.contains(deco)).toBe(false);
    expect(deco.get_parent()).toBe(layer);
    expect(Main.layoutManager._trackedChrome.has(deco)).toBe(true);
    // Host is not tracked.
    expect(Main.layoutManager._trackedChrome.has(layer)).toBe(false);
  });

  it("layer visibility follows window_group.visible", () => {
    const dm = ctx.windowManager.decorationManager;
    const layer = dm.ensureTabChromeLayer();
    expect(layer.visible).toBe(true);

    global.window_group.visible = false;
    expect(layer.visible).toBe(false);

    global.window_group.visible = true;
    expect(layer.visible).toBe(true);
  });
});
