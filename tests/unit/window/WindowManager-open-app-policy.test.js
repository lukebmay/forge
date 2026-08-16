import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
  setPointer,
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

    it("homes to global LFT mon when pointer sits on a tiled head", () => {
      tileOn(0, { id: "tiled-0" });
      const lft = tileOn(1, { id: "lft" });
      wm().movePointerWith(lft.nodeWindow);
      ctx.display.get_focus_window.mockReturnValue(lft.metaWindow);
      ctx.display.get_current_monitor.mockReturnValue(0);
      setPointer(100, 100);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "new-generic",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
    });

    it("pointer on empty mon0 beats LFT on mon1 (D027 empty-head)", () => {
      const lft = tileOn(1, { id: "lft" });
      wm().movePointerWith(lft.nodeWindow);
      ctx.display.get_current_monitor.mockReturnValue(1);
      setPointer(100, 100);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "new-on-empty",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(0);
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
      const on0 = tileOn(0, { id: "tiled-0" });
      const lft = tileOn(1, { id: "lft1" });
      wm().movePointerWith(on0.nodeWindow);
      wm().movePointerWith(lft.nodeWindow);
      setPointer(2000, 200);

      wm().placeNext({
        wmClass: "OtherApp",
        monitor: 0,
        expiresAt: Date.now() + 60_000,
      });

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
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

      expect(monitorOf(node)).toBe(1);
      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(con.childNodes).not.toContain(node);
      expect(node.parentNode).toBe(mon1);
      expect(first.nodeWindow.parentNode).toBe(con);
      expect(mid.nodeWindow.parentNode).toBe(con);
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
        // Pointer on mon1 (x≥1920) so geometry path agrees with current mon.
        global.get_pointer.mockReturnValue([2000, 100, 0]);
        app.activate();
        expect(ctx2.windowManager._pendingDockLaunches.some((e) => e.monitor === 1)).toBe(true);
        expect(wm()._pendingDockLaunches?.length ?? 0).toBe(0);
      } finally {
        ctx2.cleanup();
        Shell.App.prototype._forgeDockWm = null;
      }
    });

    it("focus mon0 + dock sticky mon1 homes to mon1 after LFT(1)", () => {
      const on0 = tileOn(0, { id: "focus0" });
      const on1 = tileOn(1, { id: "lft1" });
      wm().movePointerWith(on1.nodeWindow);
      wm().movePointerWith(on0.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(on0.nodeWindow);
      global.display.get_focus_window.mockReturnValue(on0.metaWindow);

      wm().noteDockLaunch(1, { appId: "org.gnome.Nautilus.desktop" });
      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "dock-vs-focus",
      });
      metaWindow._forgeAppId = "org.gnome.Nautilus";

      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      expect(metaWindow.get_monitor()).toBe(1);
      expect(metaWindow._forgeDockStickyMon).toBe(1);
      // After LFT(1), not mon0 focus tile.
      expect(node.parentNode).toBe(on1.nodeWindow.parentNode);
    });

    it("hook notes mon from pointer geometry over get_current_monitor", () => {
      wm()._tryInstallDockLaunchHook();
      // Stale/wrong current mon (focus mon); pointer is on mon1.
      ctx.display.get_current_monitor.mockReturnValue(0);
      global.get_pointer.mockReturnValue([2000, 200, 0]);

      const app = new Shell.App({ id: "com.example.PointerDock" });
      app.activate();

      const pending = wm()._pendingDockLaunches || [];
      expect(pending.some((e) => e.monitor === 1 && e.appId === "com.example.PointerDock")).toBe(
        true
      );
    });

    it("activate_full records dock launch when wrapped", () => {
      wm()._tryInstallDockLaunchHook();
      ctx.display.get_current_monitor.mockReturnValue(1);
      global.get_pointer.mockReturnValue([2100, 50, 0]);

      const app = new Shell.App({ id: "com.example.FullActivate" });
      expect(typeof app.activate_full).toBe("function");
      app.activate_full(0, null, true);

      expect(
        (wm()._pendingDockLaunches || []).some(
          (e) => e.monitor === 1 && e.appId === "com.example.FullActivate"
        )
      ).toBe(true);
    });

    it("focus-steal does not rehome when isDock", () => {
      const on0 = tileOn(0, { id: "steal-focus" });
      const on1 = tileOn(1, { id: "dock-lft" });
      wm().movePointerWith(on1.nodeWindow);
      wm().movePointerWith(on0.nodeWindow);
      global.display.get_focus_window.mockReturnValue(on0.metaWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "no-steal",
      });
      metaWindow._forgeDockMonitor = 1;

      const plan = wm()._planOpenAppPlacement(metaWindow);
      expect(plan.isDock).toBe(true);
      expect(plan.homeMonitor).toBe(1);
      expect(plan.attachLft).toBe(on1.nodeWindow);
      // Focus mon0 must not replace home or attach.
      expect(plan.attachLft).not.toBe(on0.nodeWindow);
    });

    it("pointer on empty mon1 homes there, not after left LFT (R021)", () => {
      const leftA = tileOn(0, { id: "left-a" });
      tileOn(0, { id: "left-b" });
      wm().movePointerWith(leftA.nodeWindow);
      global.display.get_focus_window.mockReturnValue(leftA.metaWindow);
      ctx.display.get_current_monitor.mockReturnValue(0);
      setPointer(2000, 200);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "opened-on-right",
      });
      wm().trackWindow(null, metaWindow);

      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(1);
      const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
      const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
      expect(mon1.contains(node)).toBe(true);
      expect(mon0.contains(node)).toBe(false);
      expect(mon0.childNodes.filter((c) => c.isWindow?.()).length).toBe(2);
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

    it("dock mon0 with empty LFT mon ring attaches after last mon0 tile (not mon-root)", () => {
      // After layout: mon0 has tab|ghostty structure but mon LFT never touched
      // (focus stayed on mon1). mon-root would add a 3rd HSPLIT sibling covering
      // the left tab group; end-of-tree last tile is correct.
      const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
      const tabCon = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      tabCon.layout = LAYOUT_TYPES.TABBED;
      const chrome = createWindowNode(ctx.tree, tabCon, {
        mode: "TILE",
        windowOverrides: {
          id: "chrome-tab",
          workspace: ctx.workspaces[0],
          monitor: 0,
          rect: { x: 0, y: 0, width: 900, height: 1000 },
        },
      });
      const ghost = createWindowNode(ctx.tree, mon0, {
        mode: "TILE",
        windowOverrides: {
          id: "ghost-mon0",
          workspace: ctx.workspaces[0],
          monitor: 0,
          rect: { x: 900, y: 0, width: 900, height: 1000 },
        },
      });
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      // Focus mon1 only — mon0 LFT ring empty.
      const right = tileOn(1, { id: "focus-right" });
      wm().movePointerWith(right.nodeWindow);
      expect(wm().lftMru.monHead(0)).toBeNull();
      expect(wm().lftMru.globalHead()).toBe(right.nodeWindow);
      global.display.get_focus_window.mockReturnValue(right.metaWindow);

      const metaWindow = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "dock-nautilus-left",
      });
      metaWindow._forgeDockMonitor = 0;
      wm().trackWindow(null, metaWindow);
      const node = wm().findNodeWindow(metaWindow);
      expect(monitorOf(node)).toBe(0);
      // After last mon0 tile (ghost), not mon-root third sibling of [tab, ghost].
      expect(node.parentNode).toBe(ghost.nodeWindow.parentNode);
      expect(node.parentNode).not.toBe(mon0);
      expect(metaWindow._forgeDockStickyMon).toBe(0);
      void chrome;
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

  describe("open under mon1 leftover LFT (layout-dev shape)", () => {
    beforeEach(() => setup());

    it("focused mon1 tile wins over stale mon0 LFT (not mon-root after rehome)", () => {
      // Agent terminal on mon0 is global LFT; user focuses mon1 ghostty then opens.
      const mon0 = tileOn(0, {
        id: "agent-term",
        rect: { x: 0, y: 0, width: 900, height: 600 },
      });
      const mon1Tile = tileOn(1, {
        id: "mon1-focus",
        rect: { x: 1920, y: 0, width: 960, height: 1080 },
      });
      wm().movePointerWith(mon0.nodeWindow);
      expect(wm().lftMru.globalHead()).toBe(mon0.nodeWindow);
      // Focus mon1 without updating LFT first (simulate lag), then plan uses focus.
      global.display.get_focus_window.mockReturnValue(mon1Tile.metaWindow);
      // Touch mon1 LFT the way real focus would after click.
      wm().movePointerWith(mon1Tile.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "open-under-focus",
      });
      wm().trackWindow(null, meta);
      const node = wm().findNodeWindow(meta);
      expect(monitorOf(node)).toBe(1);
      expect(mon1Tile.monitor.contains(node)).toBe(true);
      // Sibling of focused mon1 tile (aspect-split), not mon0.
      expect(node.parentNode).toBe(mon1Tile.nodeWindow.parentNode);
      expect(meta._forgeDockStickyMon).toBe(1);
    });

    it("focus mon1 ghostty under leftover VSPLIT → open is sibling of ghostty not mon-root", () => {
      // mon1 HSPLIT: CON(VSPLIT, sole ghostty) | CON(TABBED, chrome)
      const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
      mon1.layout = LAYOUT_TYPES.HSPLIT;
      const left = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.CON, {});
      left.layout = LAYOUT_TYPES.VSPLIT;
      const right = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.CON, {});
      right.layout = LAYOUT_TYPES.TABBED;
      const ghost = createWindowNode(ctx.tree, left, {
        mode: "TILE",
        windowOverrides: {
          id: "mon1-ghost",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 1920, y: 0, width: 960, height: 1080 },
        },
      });
      createWindowNode(ctx.tree, right, {
        mode: "TILE",
        windowOverrides: {
          id: "mon1-yt",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 2880, y: 0, width: 960, height: 1080 },
        },
      });
      // Global LFT was mon0; user focuses mon1 ghostty.
      tileOn(0, { id: "mon0-term" });
      wm().movePointerWith(ghost.nodeWindow);
      expect(wm().lftMru.monHead(1)).toBe(ghost.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0, // Meta maps primary first
        id: "nautilus-under-ghost",
        wm_class: "org.gnome.Nautilus",
      });
      wm().trackWindow(null, meta);
      const node = wm().findNodeWindow(meta);
      expect(node).toBeTruthy();
      // Under left CON with ghostty, not mon-root third sibling.
      expect(node.parentNode).toBe(left);
      expect(left.contains(node)).toBe(true);
      expect(mon1.childNodes.filter((n) => n.isWindow()).length).toBe(0);
      // Sticky planned mon set even for non-dock.
      expect(meta._forgeDockStickyMon).toBe(1);
    });

    it("entered-monitor rehome after open thrash attaches after mon LFT not mon-root", () => {
      const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
      const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
      mon1.layout = LAYOUT_TYPES.HSPLIT;
      const left = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.CON, {});
      left.layout = LAYOUT_TYPES.VSPLIT;
      const ghost = createWindowNode(ctx.tree, left, {
        mode: "TILE",
        windowOverrides: {
          id: "g1",
          workspace: ctx.workspaces[0],
          monitor: 1,
          rect: { x: 1920, y: 0, width: 960, height: 1080 },
        },
      });
      wm().movePointerWith(ghost.nodeWindow);

      // Wrong-mon tree attach (open landed under mon0); Meta then reports mon1.
      const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, mon0, {
        mode: "TILE",
        windowOverrides: {
          id: "thrash-open",
          workspace: ctx.workspaces[0],
          monitor: 0,
        },
      });
      metaWindow.get_monitor = vi.fn(() => 1);
      metaWindow.monitor = 1;

      // Direct rehome (skip renderTree — fixture CONs lack full St actors).
      wm()._rehomeWindowPreservingContainer(nodeWindow, metaWindow, mon1);

      const live = wm().findNodeWindow(metaWindow);
      expect(live).toBe(nodeWindow);
      expect(mon1.contains(live)).toBe(true);
      // After mon1 LFT (ghost), not mon-root alone.
      expect(live.parentNode).toBe(ghost.nodeWindow.parentNode);
      expect(mon1.childNodes.includes(live)).toBe(false);
    });
  });

  describe("tab-after and aspect split", () => {
    beforeEach(() => setup());

    it("does not join a TABBED bag; new tile is a sibling of the bag", () => {
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

      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(con.childNodes).toContain(a.nodeWindow);
      expect(con.childNodes).toContain(b.nodeWindow);
      expect(con.childNodes).not.toContain(node);
      expect(node.parentNode).toBe(monitor);
    });

    it("aspect: tall LFT → VSPLIT; wide LFT → HSPLIT", () => {
      // Sole child on mon: split() toggles mon layout (no phantom single-child CON).
      const tall = tileOn(0, {
        id: "tall",
        rect: { x: 0, y: 0, width: 400, height: 900 },
      });
      tall.nodeWindow.rect = { x: 0, y: 0, width: 400, height: 900 };
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
      expect(parentTall.childNodes[0]).toBe(tall.nodeWindow);
      expect(parentTall.childNodes[1]).toBe(nodeTall);

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
      wide.nodeWindow.rect = { x: 600, y: 0, width: 1200, height: 400 };
      wm().movePointerWith(wide.nodeWindow);
      const metaWide = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "after-wide",
      });
      wm().trackWindow(null, metaWide);
      const nodeWide = wm().findNodeWindow(metaWide);
      const parentWide = wide.nodeWindow.parentNode;
      expect(parentWide.nodeType).toBe(NODE_TYPES.CON);
      expect(parentWide.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(parentWide.childNodes[0]).toBe(wide.nodeWindow);
      expect(parentWide.childNodes[1]).toBe(nodeWide);
      expect(seed.nodeWindow.parentNode).toBeTruthy();
    });

    it("R033: 1-child mon toggle uses slot rect, not stale wide frame", () => {
      const tall = tileOn(0, {
        id: "slot-tall",
        rect: { x: 0, y: 0, width: 2000, height: 400 },
      });
      // Slot is portrait; Meta frame lies wide (pre-configure / restore).
      tall.nodeWindow.rect = { x: 0, y: 0, width: 900, height: 1400 };
      tall.metaWindow.get_frame_rect = () => ({ x: 0, y: 0, width: 2000, height: 400 });
      wm().movePointerWith(tall.nodeWindow);

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "after-slot",
      });
      wm().trackWindow(null, meta);
      const neu = wm().findNodeWindow(meta);
      const mon = tall.nodeWindow.parentNode;
      expect(mon.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(mon.childNodes[0]).toBe(tall.nodeWindow);
      expect(mon.childNodes[1]).toBe(neu);
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
