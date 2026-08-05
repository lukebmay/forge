import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
} from "../../mocks/helpers/index.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import Shell from "../../mocks/gnome/Shell.js";

/**
 * OP1: open-app placement — LFT MRU, dock sticky mon, tab-after, aspect split.
 */
describe("OP1 open-app placement policy", () => {
  let ctx;

  function setup(options = {}) {
    ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 2 } },
      settings: {
        "auto-split-enabled": true,
        "new-window-placement": "pointer",
        ...options.settings,
      },
    });
    // Default pointer on mon 0; tests assert LFT wins over pointer.
    ctx.display.get_current_monitor.mockReturnValue(0);
  }

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  const monitorOf = (node) => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    if (mon1.contains(node)) return 1;
    if (mon0.contains(node)) return 0;
    return -1;
  };

  const tileOn = (monIndex, overrides = {}) => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIndex);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        monitor: monIndex,
        rect: { x: monIndex * 1920, y: 0, width: 800, height: 600 },
        ...overrides,
      },
    });
    return { nodeWindow, metaWindow, monitor };
  };

  describe("LFT MRU via focus", () => {
    beforeEach(() => setup());

    it("tile focus moves to front of global + mon rings; float never enters", () => {
      const a = tileOn(0, { id: "a" });
      const b = tileOn(1, { id: "b" });
      const f = tileOn(0, { id: "float" });
      f.nodeWindow.mode = WINDOW_MODES.FLOAT;

      wm().movePointerWith(a.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(a.nodeWindow);
      expect(wm().lftMru.monHead(0)).toBe(a.nodeWindow);

      wm().movePointerWith(b.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(b.nodeWindow);
      expect(wm().lftMru.monHead(1)).toBe(b.nodeWindow);
      expect(wm().lftMru.monHead(0)).toBe(a.nodeWindow);

      wm().movePointerWith(f.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(b.nodeWindow);
      expect(wm().lftMru.globalOrder()).not.toContain(f.nodeWindow);
    });

    it("destroy removes from global and mon rings", () => {
      const a = tileOn(0, { id: "a" });
      const b = tileOn(0, { id: "b" });
      wm().movePointerWith(a.nodeWindow);
      wm().movePointerWith(b.nodeWindow);

      const actor = a.metaWindow.get_compositor_private();
      wm().windowDestroy(actor);

      expect(wm().lftMru.globalOrder()).not.toContain(a.nodeWindow);
      expect(wm().lftMru.monOrder(0)).not.toContain(a.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(b.nodeWindow);
    });
  });

  describe("generic open uses global LFT mon", () => {
    beforeEach(() => setup());

    it("homes to global LFT mon, not pointer mon", () => {
      const lft = tileOn(1, { id: "lft" });
      wm().movePointerWith(lft.nodeWindow);
      // Pointer stays on mon 0
      expect(ctx.display.get_current_monitor()).toBe(0);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "new-generic",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
    });

    it("no LFT → mon 0 root", () => {
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "no-lft",
      });
      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(0);
    });
  });

  describe("FC2 PlaceNext hint prefers over LFT", () => {
    beforeEach(() => setup());

    it("matching place hint homes to explicit monitor, not global LFT mon", () => {
      const lft = tileOn(0, { id: "lft0" });
      wm().movePointerWith(lft.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(lft.nodeWindow);

      const placed = wm().placeNext({
        wmClass: "PlacedApp",
        monitor: 1,
        expiresAt: Date.now() + 60_000,
      });
      expect(placed.ok).toBe(true);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "placed-win",
        wm_class: "PlacedApp",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      // Hint consumed (one-shot)
      expect(wm()._pendingPlaceHints.length).toBe(0);
    });

    it("mismatched class falls through to LFT", () => {
      const lft = tileOn(1, { id: "lft1" });
      wm().movePointerWith(lft.nodeWindow);

      wm().placeNext({
        wmClass: "OtherApp",
        monitor: 0,
        expiresAt: Date.now() + 60_000,
      });

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "no-match",
        wm_class: "NotOther",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      expect(wm()._pendingPlaceHints.length).toBe(1);
    });

    it("treePath attach uses path window as insert target on that mon", () => {
      const a = tileOn(1, { id: "path-a" });
      tileOn(1, { id: "path-b" });
      // Global LFT is mon 0 empty of focus — set LFT on mon 0 so default would differ
      const other = tileOn(0, { id: "other" });
      wm().movePointerWith(other.nodeWindow);

      const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
      const monId = mon1.nodeValue; // mo1ws0
      // children under mon: window a at 0, window b at 1
      wm().placeNext({
        wmClass: "PathApp",
        treePath: `${monId}/0`,
        expiresAt: Date.now() + 60_000,
      });

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "path-new",
        wm_class: "PathApp",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      // Inserted after path target (sibling of a)
      expect(node.parentNode).toBe(a.nodeWindow.parentNode);
    });

    it("W2: PlaceNext mon forces Meta sticky (not tree-only)", () => {
      const lft = tileOn(0, { id: "lft0" });
      wm().movePointerWith(lft.nodeWindow);

      wm().placeNext({
        wmClass: "Google-chrome",
        monitor: 0,
        expiresAt: Date.now() + 60_000,
      });

      // Meta maps on mon1 (restore/pointer) while PlaceNext wants mon0.
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "chrome-place",
        wm_class: "Google-chrome",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(0);
      expect(metaWindow.get_monitor()).toBe(0);
      expect(metaWindow._forgeDockStickyMon).toBe(0);

      // entered-monitor flip refused during sticky grace
      metaWindow.move_to_monitor(1);
      wm().updateMetaWorkspaceMonitor("window-entered-monitor", 1, metaWindow);
      expect(metaWindow.get_monitor()).toBe(0);
      expect(monitorOf(wm().findNodeWindow(metaWindow))).toBe(0);
    });

    it("W2: Chrome PWA class matches Google-chrome PlaceNext", () => {
      tileOn(1, { id: "lft1" });
      wm().placeNext({
        wmClass: "Google-chrome",
        monitor: 0,
        expiresAt: Date.now() + 60_000,
      });

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "pwa-win",
        wm_class: "chrome-ggjoabcdef-Default",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(0);
      expect(metaWindow.get_monitor()).toBe(0);
      expect(wm()._pendingPlaceHints.length).toBe(0);
    });

    it("W2: deferred PlaceNext when class lands after map", () => {
      const lft = tileOn(1, { id: "lft1" });
      wm().movePointerWith(lft.nodeWindow);

      wm().placeNext({
        wmClass: "Google-chrome",
        monitor: 0,
        expiresAt: Date.now() + 60_000,
      });

      // Null class at map: hint not consumed; homes to global LFT mon1.
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "late-chrome",
        wm_class: null,
        title: null,
      });
      wm().trackWindow(null, metaWindow);

      let node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      expect(wm()._pendingPlaceHints.length).toBe(1);
      expect(metaWindow._forgeDockStickyMon).toBeUndefined();

      // Class lands (Wayland) — consume PlaceNext and sticky-rehome to mon0.
      metaWindow.set_wm_class("chrome-ggjoabcdef-Default");
      node = wm().findNodeWindow(metaWindow);
      expect(wm()._pendingPlaceHints.length).toBe(0);
      expect(metaWindow.get_monitor()).toBe(0);
      expect(monitorOf(node)).toBe(0);
      expect(metaWindow._forgeDockStickyMon).toBe(0);
    });

    it("generic open without place hint does not sticky-force Meta mon", () => {
      const lft = tileOn(1, { id: "lft1" });
      wm().movePointerWith(lft.nodeWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "generic-no-sticky",
      });
      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      // Tree homes to LFT mon; Meta sticky flags are dock/PlaceNext only.
      expect(metaWindow._forgeDockStickyMon).toBeUndefined();
    });
  });

  describe("dock sticky mon + LFT(m)", () => {
    beforeEach(() => setup());

    it("dock path uses LFT on dock mon, not other mon's LFT", () => {
      const on0 = tileOn(0, { id: "on0" });
      const on1 = tileOn(1, { id: "on1" });
      // Global LFT is mon 0
      wm().movePointerWith(on1.nodeWindow);
      wm().movePointerWith(on0.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(on0.nodeWindow);
      expect(wm().lftMru.monHead(1)).toBe(on1.nodeWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "dock-app",
      });
      metaWindow._forgeDockMonitor = 1;

      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      // Inserted after LFT(1)=on1, not after global LFT on0
      expect(on1.monitor.contains(node)).toBe(true);
      expect(metaWindow.get_monitor()).toBe(1);
      expect(metaWindow._forgeDockStickyMon).toBe(1);
    });

    it("dock LFT(m) in TABBED wins over stale cross-mon attachNode", () => {
      // Global focus/attachNode on mon 0; dock mon 1 has tabbed LFT mid-stack.
      const on0 = tileOn(0, { id: "on0" });
      const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
      const con = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.CON, {});
      con.layout = LAYOUT_TYPES.TABBED;
      const first = createWindowNode(ctx.tree, con, {
        mode: "TILE",
        windowOverrides: {
          id: "tab-first",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 1920, y: 0, width: 800, height: 600 },
        },
      });
      const mid = createWindowNode(ctx.tree, con, {
        mode: "TILE",
        windowOverrides: {
          id: "tab-mid",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 1920, y: 0, width: 800, height: 600 },
        },
      });
      createWindowNode(ctx.tree, con, {
        mode: "TILE",
        windowOverrides: {
          id: "tab-last",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 1920, y: 0, width: 800, height: 600 },
        },
      });
      // mon1 LFT = mid; then focus mon0 so attachNode is cross-mon stale.
      wm().movePointerWith(mid.nodeWindow);
      wm().movePointerWith(on0.nodeWindow);
      expect(ctx.tree.attachNode).toBe(on0.nodeWindow);
      expect(wm().lftMru.monHead(1)).toBe(mid.nodeWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "dock-tab-after",
      });
      metaWindow._forgeDockMonitor = 1;
      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);

      expect(node.parentNode).toBe(con);
      const kids = con.childNodes.filter((n) => n.isWindow());
      expect(kids.indexOf(node)).toBe(kids.indexOf(mid.nodeWindow) + 1);
      expect(first.nodeWindow.parentNode).toBe(con);
    });

    it("dock hook refreshes active WM after disable/re-enable cycle", () => {
      // First manager installs the shared prototype hook.
      wm()._tryInstallDockLaunchHook();
      expect(Shell.App.prototype._forgeDockWm).toBe(wm());

      // Simulate extension disable: WM disabled and pointer cleared.
      wm().disabled = true;
      if (Shell.App.prototype._forgeDockWm === wm()) {
        Shell.App.prototype._forgeDockWm = null;
      }

      // Second manager (new enable) must re-bind the live pointer.
      const ctx2 = createWindowManagerFixture({
        globals: { display: { monitorCount: 2 } },
        settings: { "auto-split-enabled": true, "new-window-placement": "pointer" },
      });
      try {
        ctx2.windowManager._tryInstallDockLaunchHook();
        expect(Shell.App.prototype._forgeDockWm).toBe(ctx2.windowManager);
        expect(Shell.App.prototype._forgeDockLaunchHooked).toBe(true);

        // Activating an app notes launch on the *live* WM only.
        const app = new Shell.App({ id: "com.example.DockApp" });
        ctx2.display.get_current_monitor.mockReturnValue(1);
        app.activate();
        expect(ctx2.windowManager._pendingDockLaunches.some((e) => e.monitor === 1)).toBe(true);
        expect(wm()._pendingDockLaunches?.length ?? 0).toBe(0);
      } finally {
        ctx2.cleanup();
        Shell.App.prototype._forgeDockWm = null;
      }
    });

    it("dock sticky grace rejects re-home flip", () => {
      tileOn(1, { id: "seed" });
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "dock-flip",
      });
      metaWindow._forgeDockMonitor = 1;
      wm().trackWindow(null, metaWindow);
      expect(metaWindow.get_monitor()).toBe(1);

      // Simulate restore-geometry race flipping Meta to mon 0
      metaWindow.move_to_monitor(0);
      wm().updateMetaWorkspaceMonitor("window-entered-monitor", 0, metaWindow);

      expect(metaWindow.get_monitor()).toBe(1);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
    });

    it("noteDockLaunch is consumed by detectDockLaunchMonitor", () => {
      wm().noteDockLaunch(1, { appId: "com.example.App" });
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "from-note",
      });
      metaWindow._forgeAppId = "com.example.App";
      expect(wm().detectDockLaunchMonitor(metaWindow)).toBe(1);
      // Consumed
      expect(wm().detectDockLaunchMonitor(metaWindow)).toBe(-1);
    });

    it("OP2: second dock Ghostty on mon1 tiles without drag", () => {
      // mon0 already has Ghostty (global LFT); dock open on mon1 must home mon1.
      const mon0Term = tileOn(0, {
        id: "ghostty-mon0",
        wm_class: "com.mitchellh.ghostty",
        rect: { x: 0, y: 0, width: 900, height: 600 },
      });
      wm().movePointerWith(mon0Term.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(mon0Term.nodeWindow);

      // Dock notes .desktop id; WindowTracker may return bare app id.
      wm().noteDockLaunch(1, { appId: "com.mitchellh.ghostty.desktop" });
      const meta2 = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0, // Meta maps wrong mon; dock sticky rehomes
        id: "ghostty-dock-mon1",
        wm_class: "com.mitchellh.ghostty",
        rect: { x: 50, y: 50, width: 400, height: 300 },
      });
      meta2._forgeAppId = "com.mitchellh.ghostty";

      wm().trackWindow(null, meta2);
      const node2 = wm().findNodeWindow(meta2);
      expect(node2).toBeTruthy();
      expect(monitorOf(node2)).toBe(1);
      expect(meta2.get_monitor()).toBe(1);
      expect(meta2.firstRender).toBe(true);

      // FLOAT until processFloats; first create render tiles + places.
      expect(node2.mode).toBe(WINDOW_MODES.FLOAT);
      wm().processFloats();
      expect(node2.mode).toBe(WINDOW_MODES.TILE);
      // Assign mon1 work-area rect and apply first placement (no user drag).
      const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
      mon1.rect = { x: 1920, y: 0, width: 1920, height: 1080 };
      node2.rect = { x: 1920, y: 0, width: 960, height: 1080 };
      node2.renderRect = { x: 1920, y: 0, width: 960, height: 1080 };
      ctx.tree.apply(ctx.tree);
      expect(meta2.firstRender).toBe(false);
      const frame = meta2.get_frame_rect();
      expect(frame.x).toBe(1920);
      expect(frame.width).toBe(960);
    });
  });

  describe("tab-after and aspect split", () => {
    beforeEach(() => setup());

    it("inserts after LFT when LFT parent is TABBED", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      // Build TABBED CON with two windows
      const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, {});
      con.layout = LAYOUT_TYPES.TABBED;
      const a = createWindowNode(ctx.tree, con, {
        mode: "TILE",
        windowOverrides: {
          id: "tab-a",
          workspace: ctx.workspaces[0],
          monitor: 0,
          rect: { x: 0, y: 0, width: 800, height: 600 },
        },
      });
      const b = createWindowNode(ctx.tree, con, {
        mode: "TILE",
        windowOverrides: {
          id: "tab-b",
          workspace: ctx.workspaces[0],
          monitor: 0,
          rect: { x: 0, y: 0, width: 800, height: 600 },
        },
      });
      // LFT = first tab
      wm().movePointerWith(a.nodeWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "tab-new",
      });
      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);

      expect(node.parentNode).toBe(con);
      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      // createNode inserts after LFT (before nextSibling of a) → between a and b
      const kids = con.childNodes.filter((n) => n.isWindow());
      const idxNew = kids.indexOf(node);
      const idxA = kids.indexOf(a.nodeWindow);
      expect(idxNew).toBe(idxA + 1);
      expect(b.nodeWindow); // still present
    });

    it("aspect: tall LFT → VSPLIT; wide LFT → HSPLIT", () => {
      // Sole child on mon: split() toggles mon layout (no phantom single-child CON).
      const tall = tileOn(0, {
        id: "tall",
        rect: { x: 0, y: 0, width: 400, height: 900 },
      });
      wm().movePointerWith(tall.nodeWindow);

      const metaTall = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "after-tall",
      });
      wm().trackWindow(null, metaTall);
      const nodeTall = wm().findNodeWindow(metaTall);
      const parentTall = tall.nodeWindow.parentNode;
      expect(parentTall.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentTall.contains(nodeTall)).toBe(true);

      // Two existing tiles: aspect-split of LFT creates a real CON with HSPLIT.
      ctx.cleanup();
      setup();
      const seed = tileOn(0, {
        id: "seed",
        rect: { x: 0, y: 0, width: 600, height: 600 },
      });
      const wide = tileOn(0, {
        id: "wide",
        rect: { x: 600, y: 0, width: 1200, height: 400 },
      });
      wm().movePointerWith(wide.nodeWindow);
      const metaWide = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "after-wide",
      });
      wm().trackWindow(null, metaWide);
      const parentWide = wide.nodeWindow.parentNode;
      expect(parentWide.nodeType).toBe(NODE_TYPES.CON);
      expect(parentWide.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(seed.nodeWindow.parentNode).toBeTruthy();
    });
  });

  describe("OP-opt tiny-pane tab fallback", () => {
    // Mock workarea 1920×1080 → min edge 1080; 12%→129; min-edge 320 → thresh 320.
    // Small wide LFT 500×600 HSPLIT → halfW 250 < 320 → tab when enabled.

    it("enabled + small LFT → TABBED CON, not H/V split", () => {
      setup({
        settings: {
          "tiny-pane-tab-fallback-enabled": true,
          "tiny-pane-min-edge": 320,
        },
      });
      const seed = tileOn(0, {
        id: "seed-large",
        rect: { x: 0, y: 0, width: 1400, height: 600 },
      });
      // Wider than tall → would HSPLIT; halfW 250 < 320 → tab.
      const small = tileOn(0, {
        id: "small-lft",
        rect: { x: 1400, y: 0, width: 500, height: 400 },
      });
      wm().movePointerWith(small.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "tiny-open",
      });
      wm().trackWindow(null, meta);
      const node = wm().findNodeWindow(meta);
      const parent = small.nodeWindow.parentNode;

      expect(parent.nodeType).toBe(NODE_TYPES.CON);
      expect(parent.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parent.contains(node)).toBe(true);
      expect(parent.contains(small.nodeWindow)).toBe(true);
      // Sibling seed stays outside the new tab group
      expect(seed.nodeWindow.parentNode).not.toBe(parent);
    });

    it("enabled + large LFT → still aspect split", () => {
      setup({
        settings: {
          "tiny-pane-tab-fallback-enabled": true,
          "tiny-pane-min-edge": 320,
        },
      });
      tileOn(0, {
        id: "seed",
        rect: { x: 0, y: 0, width: 600, height: 600 },
      });
      const large = tileOn(0, {
        id: "large-lft",
        rect: { x: 600, y: 0, width: 1200, height: 800 },
      });
      wm().movePointerWith(large.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "large-open",
      });
      wm().trackWindow(null, meta);
      const parent = large.nodeWindow.parentNode;
      expect(parent.nodeType).toBe(NODE_TYPES.CON);
      expect(parent.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parent.layout).not.toBe(LAYOUT_TYPES.TABBED);
    });

    it("disabled (default) + small LFT → still aspect split (OP1)", () => {
      setup({
        settings: {
          "tiny-pane-tab-fallback-enabled": false,
          "tiny-pane-min-edge": 320,
        },
      });
      tileOn(0, {
        id: "seed",
        rect: { x: 0, y: 0, width: 1400, height: 600 },
      });
      // Wider than tall → HSPLIT; halfW 250 would be under thresh if fallback on.
      const small = tileOn(0, {
        id: "small-lft",
        rect: { x: 1400, y: 0, width: 500, height: 400 },
      });
      wm().movePointerWith(small.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "split-anyway",
      });
      wm().trackWindow(null, meta);
      const parent = small.nodeWindow.parentNode;
      expect(parent.nodeType).toBe(NODE_TYPES.CON);
      expect(parent.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parent.layout).not.toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("focus-on-create chains next open", () => {
    beforeEach(() => setup());

    it("new tile that takes focus becomes LFT for the next open", () => {
      const first = tileOn(0, { id: "first", rect: { x: 0, y: 0, width: 900, height: 500 } });
      wm().movePointerWith(first.nodeWindow);

      const meta2 = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "second",
        rect: { x: 0, y: 0, width: 900, height: 500 },
      });
      wm().trackWindow(null, meta2);
      const second = wm().findNodeWindow(meta2);
      // Simulate focus-on-map then processFloats → tile
      second.mode = WINDOW_MODES.TILE;
      vi.spyOn(wm(), "focusMetaWindow", "get").mockReturnValue(meta2);
      wm().movePointerWith(second);
      expect(wm().lftMru.globalHead()).toBe(second);

      const meta3 = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "third",
      });
      wm().trackWindow(null, meta3);
      const third = wm().findNodeWindow(meta3);
      // Attached relative to second (same parent CON after aspect split of second)
      expect(second.parentNode.contains(third) || third.parentNode === second.parentNode).toBe(
        true
      );
    });
  });
});
