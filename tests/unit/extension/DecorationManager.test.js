import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { tabForNode } from "../../../lib/extension/decoration.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import St from "../../mocks/gnome/St.js";
import { Logger } from "../../../lib/shared/logger.js";

function disposeStActor(actor) {
  const boom = () => {
    throw new Error("Object St.BoxLayout has been already disposed — impossible to access it.");
  };
  for (const key of [
    "hide",
    "show",
    "get_parent",
    "add_child",
    "remove_child",
    "destroy",
    "destroy_all_children",
    "get_children",
    "set_size",
    "set_position",
    "contains",
  ]) {
    actor[key] = boom;
  }
}

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
    kidsOf(ctx.windowManager, con).forEach((cn) => {
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

  it("suppresses decorations on a monitor that has a Forge-zoomed window (D030)", () => {
    buildTabbedCon();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "zoomed-sibling" },
    });
    nodeWindow.zoomMode = "full";

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("scope:focus does not re-show chrome when the monitor has a Forge-zoomed window", () => {
    buildTabbedCon();
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "zoomed-sibling" },
    });
    nodeWindow.zoomMode = "full";
    const focusChild = kidsOf(ctx.windowManager, con)[0];

    ctx.windowManager.updateDecorationLayout({
      scope: "focus",
      focusNode: focusChild,
    });

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
    const focusChild = kidsOf(ctx.windowManager, con)[0];
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

describe("DecorationManager disposed chrome (apply/renderTree)", () => {
  let ctx;
  let warnSpy;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
    warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  function buildTabbed() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-a" } });
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-b" } });
    return con;
  }

  it("destroy signal nulls CON.decoration without a later walk", () => {
    const con = buildTabbed();
    const deco = con.decoration;
    expect(deco).toBeTruthy();
    deco.destroy();
    expect(con.decoration).toBeNull();
    expect(deco._forgeDisposed).toBe(true);
  });

  it("skips _forgeDisposed chrome, clears the pointer, and does not throw", () => {
    const con = buildTabbed();
    const deco = con.decoration;
    deco._forgeDisposed = true;
    disposeStActor(deco);

    expect(() => ctx.windowManager.updateDecorationLayout()).not.toThrow();
    expect(con.decoration).toBeNull();
    const texts = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("metric warn deco-disposed"))).toBe(true);
  });

  it("attachTabDecoration on a GObject-dead actor does not throw or rethrow", () => {
    const con = buildTabbed();
    disposeStActor(con.decoration);
    const dm = ctx.windowManager.decorationManager;
    expect(() => dm.attachTabDecoration(con)).not.toThrow();
    expect(con.decoration).toBeNull();
    const texts = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("metric warn deco-disposed"))).toBe(true);
  });

  it("sibling TABBED still shows after a disposed peer is skipped", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const dead = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    createWindowNode(ctx.tree, dead, { windowOverrides: { id: "dead-a" } });
    createWindowNode(ctx.tree, dead, { windowOverrides: { id: "dead-b" } });
    const live = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    createWindowNode(ctx.tree, live, { windowOverrides: { id: "live-a" } });
    createWindowNode(ctx.tree, live, { windowOverrides: { id: "live-b" } });
    const showLive = vi.spyOn(live.decoration, "show");
    dead.decoration._forgeDisposed = true;
    disposeStActor(dead.decoration);

    expect(() => ctx.windowManager.updateDecorationLayout()).not.toThrow();
    expect(dead.decoration).toBeNull();
    expect(showLive).toHaveBeenCalled();
    expect(live.decoration).toBeTruthy();
  });

  it("removeChild of a TABBED CON with disposed decoration nulls and does not throw", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "a" } });
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "b" } });
    con.decoration._forgeDisposed = true;
    disposeStActor(con.decoration);
    expect(() => monitor.removeChild(con)).not.toThrow();
    expect(con.decoration).toBeNull();
    expect(con.parentNode).toBeNull();
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

    it("does not throw when FLOATS paint has nulled parentNode", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;
      const node = wm().findNodeWindow(metaWindow);
      node.parentNode = null;
      expect(() => wm().showWindowBorders()).not.toThrow();
      expect(border.set_style_class_name).toHaveBeenCalled();
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

  describe("hostBag border prefer (D096 G5)", () => {
    it("showWindowBorders prefers bag border over compositor actor.border", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "focused", wm_class: "TestApp" },
      });
      createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "sibling", wm_class: "TestApp" },
      });
      const actorBorder = mockBorder();
      const bagBorder = mockBorder();
      metaWindow.get_compositor_private().border = actorBorder;
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;
      global.display.get_focus_window.mockReturnValue(metaWindow);
      global.window_group.add_child(bagBorder);

      wm().hostBag.set("win-bag", { meta: metaWindow, windowId: "focused", border: bagBorder });

      wm().showWindowBorders();

      expect(bagBorder.set_style_class_name).toHaveBeenCalledWith("window-tiled-border");
      expect(actorBorder.set_style_class_name).not.toHaveBeenCalled();
      expect(bagBorder.show).toHaveBeenCalled();
      expect(global.window_group.insert_child_above).toHaveBeenCalledWith(
        bagBorder,
        metaWindow.get_compositor_private()
      );
    });

    it("restackBorderForMeta inserts bag border above compositor and emits chrome-z", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "focused", wm_class: "TestApp" },
      });
      const bagBorder = mockBorder();
      const compositor = metaWindow.get_compositor_private();
      global.window_group.add_child(compositor);
      global.window_group.add_child(bagBorder);
      wm().hostBag.set("win-bag", { meta: metaWindow, windowId: "focused", border: bagBorder });

      const infoSpy = vi.spyOn(Logger, "info").mockImplementation(() => {});
      const ok = wm().decorationManager.restackBorderForMeta(metaWindow);

      expect(ok).toBe(true);
      expect(global.window_group.insert_child_above).toHaveBeenCalledWith(bagBorder, compositor);
      const chromeZ = infoSpy.mock.calls.find(
        (c) => c[0] === "metric chrome-z" && c[1]?.fields?.kind === "border"
      );
      expect(chromeZ).toBeTruthy();
      expect(chromeZ[1].fields.op).toBe("restack");
      expect(chromeZ[1].fields.id).toBe("win-bag");
    });

    it("showWindowBorders restacks via restackBorderForMeta helper", () => {
      const { border, metaWindow } = buildTwoTiled();
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;
      const restack = vi
        .spyOn(wm().decorationManager, "restackBorderForMeta")
        .mockReturnValue(true);

      wm().showWindowBorders();

      expect(restack).toHaveBeenCalledWith(metaWindow);
      expect(border.show).toHaveBeenCalled();
    });

    it("_destroyActorBorder clears bag.border by nanoid", () => {
      const border = new St.Bin();
      global.window_group.add_child(border);
      const meta = { id: "m1", get_compositor_private: () => actor };
      const actor = { border, meta_window: meta };
      wm().hostBag.set("nid-1", { meta, border });

      wm()._destroyActorBorder(actor, "border");

      expect(global.window_group.contains(border)).toBe(false);
      expect(actor.border).toBeUndefined();
      expect(wm().hostBag.get("nid-1")?.border).toBeUndefined();
      expect(wm().hostBag.has("nid-1")).toBe(true);
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

describe("DecorationManager hostBag strip prefer (D096 G5c)", () => {
  let ctx;

  function seedConBag(con, id = "con-bag") {
    const wm = ctx.windowManager;
    if (!wm.forest) wm.forest = { nodes: {}, rootId: "ROOT" };
    wm.forest.nodes[id] = { id, kind: "CON", layout: "TABBED" };
    if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
    wm.liveById.set(id, con);
    return id;
  }

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("_createDecoration dual-writes decoration/tabStrip to hostBag", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const id = seedConBag(con);
    ctx.windowManager.hostBag.set(id, { actor: con.nodeValue });

    con._createDecoration();

    const entry = ctx.windowManager.hostBag.get(id);
    expect(entry?.decoration).toBe(con.decoration);
    expect(entry?.tabStrip).toBe(con.decoration);
    expect(con.decoration?.type).toBe("forge-deco");
  });

  it("attachTabDecoration prefers bag strip over Node.decoration", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const id = seedConBag(con);
    const bagStrip = new St.BoxLayout();
    bagStrip.type = "forge-deco";
    const nodeStrip = new St.BoxLayout();
    nodeStrip.type = "forge-deco";
    con.decoration = nodeStrip;
    ctx.windowManager.hostBag.set(id, {
      actor: con.nodeValue,
      decoration: bagStrip,
      tabStrip: bagStrip,
    });

    const dm = ctx.windowManager.decorationManager;
    dm.attachTabDecoration(con);

    expect(bagStrip.get_parent()).toBe(dm.tabChromeLayer);
    expect(nodeStrip.get_parent()).not.toBe(dm.tabChromeLayer);
    expect(con.decoration).toBe(bagStrip);
  });

  it("_releaseDecorationActor clears bag chrome fields", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const id = seedConBag(con);
    ctx.windowManager.hostBag.set(id, { actor: con.nodeValue });
    con._createDecoration();
    expect(ctx.windowManager.hostBag.get(id)?.decoration).toBeTruthy();

    con._releaseDecorationActor();

    expect(con.decoration).toBeNull();
    expect(ctx.windowManager.hostBag.get(id)?.decoration).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.tabStrip).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.actor).toBe(con.nodeValue);
  });

  it("_restackDecorationAboveGroup emits metric chrome-z kind=strip", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const id = seedConBag(con);
    const deco = new St.BoxLayout();
    deco.type = "forge-deco";
    con.decoration = deco;
    ctx.windowManager.hostBag.set(id, {
      actor: con.nodeValue,
      decoration: deco,
      tabStrip: deco,
    });

    const infoSpy = vi.spyOn(Logger, "info").mockImplementation(() => {});
    const dm = ctx.windowManager.decorationManager;
    dm._restackDecorationAboveGroup(con, []);

    const chromeZ = infoSpy.mock.calls.find(
      (c) => c[0] === "metric chrome-z" && c[1]?.fields?.kind === "strip"
    );
    expect(chromeZ).toBeTruthy();
    expect(chromeZ[1].fields.id).toBe(id);
    expect(chromeZ[1].fields.op).toBe("restack");
  });

  it("_restackDecorationAboveGroup raises open leaf before strip restack (G5d)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const { metaWindow: metaA } = createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "tab-a" },
    });
    const { metaWindow: metaB } = createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "tab-b" },
    });
    metaA.raise = vi.fn();
    metaB.raise = vi.fn();
    con.lastTabFocus = metaB;
    const deco = new St.BoxLayout();
    deco.type = "forge-deco";
    con.decoration = deco;
    seedConBag(con);
    ctx.windowManager.hostBag.set("con-bag", {
      actor: con.nodeValue,
      decoration: deco,
      tabStrip: deco,
    });

    const dm = ctx.windowManager.decorationManager;
    const order = [];
    metaB.raise.mockImplementation(() => order.push("raise"));
    const attach = vi.spyOn(dm, "attachTabDecoration").mockImplementation(() => {
      order.push("attach");
    });

    dm._restackDecorationAboveGroup(con, kidsOf(ctx.windowManager, con));

    expect(metaB.raise).toHaveBeenCalled();
    expect(metaA.raise).not.toHaveBeenCalled();
    expect(attach).toHaveBeenCalled();
    expect(order[0]).toBe("raise");
    expect(order).toContain("attach");
  });

  it("_raiseStripToChromeTop puts focused strip above sibling strips", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const conA = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const conB = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const decoA = new St.BoxLayout();
    decoA.type = "forge-deco";
    const decoB = new St.BoxLayout();
    decoB.type = "forge-deco";
    conA.decoration = decoA;
    conB.decoration = decoB;

    const dm = ctx.windowManager.decorationManager;
    dm.attachTabDecoration(conA);
    dm.attachTabDecoration(conB);
    const layer = dm.tabChromeLayer;
    expect(layer.get_children()).toEqual([decoA, decoB]);

    dm._raiseStripToChromeTop(decoA);
    expect(layer.get_children()).toEqual([decoB, decoA]);
  });
});

describe("DecorationManager hostBag tab chip dual-write (D096 G8b)", () => {
  let ctx;

  function seedWinBag(node, id = "win-bag") {
    const wm = ctx.windowManager;
    if (!wm.forest) wm.forest = { nodes: {}, rootId: "ROOT" };
    wm.forest.nodes[id] = { id, kind: "WINDOW" };
    if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
    wm.liveById.set(id, node);
    return id;
  }

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("_createWindowTab dual-writes tab/tabChip to hostBag", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win" },
    });
    const id = seedWinBag(nodeWindow);
    ctx.windowManager.hostBag.set(id, { meta: metaWindow, windowId: "tab-win" });

    nodeWindow._createWindowTab();

    const entry = ctx.windowManager.hostBag.get(id);
    expect(entry?.tab).toBe(nodeWindow.tab);
    expect(entry?.tabChip).toBe(nodeWindow.tab);
    expect(nodeWindow.tab).toBeTruthy();
  });

  it("_destroyTab clears bag tab fields", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win-2" },
    });
    const id = seedWinBag(nodeWindow);
    ctx.windowManager.hostBag.set(id, { meta: metaWindow, windowId: "tab-win-2" });
    nodeWindow._createWindowTab();
    expect(ctx.windowManager.hostBag.get(id)?.tab).toBeTruthy();

    nodeWindow._destroyTab();

    expect(nodeWindow.tab).toBeNull();
    expect(ctx.windowManager.hostBag.get(id)?.tab).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.tabChip).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.meta).toBe(metaWindow);
  });

  it("_tabForNode prefers bag tab over Node.tab", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win-3" },
    });
    const id = seedWinBag(nodeWindow);
    const bagChip = new St.BoxLayout();
    const nodeChip = new St.BoxLayout();
    nodeWindow.tab = nodeChip;
    ctx.windowManager.hostBag.set(id, {
      meta: metaWindow,
      windowId: "tab-win-3",
      tab: bagChip,
      tabChip: bagChip,
    });

    const dm = ctx.windowManager.decorationManager;
    expect(dm._tabForNode(nodeWindow)).toBe(bagChip);
    expect(nodeWindow.tab).toBe(bagChip);
  });

  it("tabForNode / DnD prefer bag when Node.tab differs or is null (D096 G8c)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win-g8c" },
    });
    const id = seedWinBag(nodeWindow);
    const bagChip = new St.BoxLayout();
    bagChip.x = 10;
    bagChip.y = 0;
    bagChip.width = 80;
    bagChip.height = 24;
    nodeWindow.tab = null;
    ctx.windowManager.hostBag.set(id, {
      meta: metaWindow,
      windowId: "tab-win-g8c",
      tab: bagChip,
      tabChip: bagChip,
    });

    expect(tabForNode(ctx.windowManager, nodeWindow)).toBe(bagChip);
    expect(nodeWindow.tab).toBe(bagChip);

    const stale = new St.BoxLayout();
    nodeWindow.tab = stale;
    const dd = ctx.windowManager.dragDrop;
    expect(dd._tabForNode(nodeWindow)).toBe(bagChip);
    expect(nodeWindow.tab).toBe(bagChip);

    const group = parentOf(ctx.windowManager, nodeWindow);
    const rects = dd._collectGroupTabRects(group);
    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBe(80);
  });

  it("_createWindowTab early-returns on bag chip when Node.tab is null (D096 G8d)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win-g8d-create" },
    });
    const id = seedWinBag(nodeWindow);
    const bagChip = new St.BoxLayout();
    nodeWindow.tab = null;
    ctx.windowManager.hostBag.set(id, {
      meta: metaWindow,
      windowId: "tab-win-g8d-create",
      tab: bagChip,
      tabChip: bagChip,
    });

    nodeWindow._createWindowTab();

    expect(nodeWindow.tab).toBe(bagChip);
    expect(ctx.windowManager.hostBag.get(id)?.tab).toBe(bagChip);
    expect(ctx.windowManager.hostBag.get(id)?.tabChip).toBe(bagChip);
  });

  it("_destroyTab clears bag when Node.tab is already null (D096 G8d)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "tab-win-g8d-destroy" },
    });
    const id = seedWinBag(nodeWindow);
    const bagChip = new St.BoxLayout();
    nodeWindow.tab = null;
    ctx.windowManager.hostBag.set(id, {
      meta: metaWindow,
      windowId: "tab-win-g8d-destroy",
      tab: bagChip,
      tabChip: bagChip,
    });

    nodeWindow._destroyTab();

    expect(nodeWindow.tab).toBeNull();
    expect(ctx.windowManager.hostBag.get(id)?.tab).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.tabChip).toBeUndefined();
    expect(ctx.windowManager.hostBag.get(id)?.meta).toBe(metaWindow);
  });

  it("_applyDecorationRect attaches prefer-bag chip when Node.tab is null (D096 G8d)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "tab-win-g8d-attach" },
    });
    const id = seedWinBag(nodeWindow);
    const bagChip = new St.BoxLayout();
    nodeWindow.tab = null;
    ctx.windowManager.hostBag.set(id, {
      meta: metaWindow,
      windowId: "tab-win-g8d-attach",
      tab: bagChip,
      tabChip: bagChip,
    });
    con._createDecoration();
    expect(con.decoration).toBeTruthy();

    const params = {
      tiledChildren: [nodeWindow],
      stackedHeight: 32,
    };
    ctx.tree._applyDecorationRect(con, nodeWindow, params, 32, false);

    expect(nodeWindow.tab).toBe(bagChip);
    expect(con.decoration.contains(bagChip)).toBe(true);
  });
});
