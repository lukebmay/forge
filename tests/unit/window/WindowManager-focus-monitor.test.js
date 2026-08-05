import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
} from "../../mocks/helpers/index.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import Shell from "../../mocks/gnome/Shell.js";

/**
 * W3: focus-monitor placement for dock sticky notes and Guake float-follow.
 * Prefer focused window's monitor over pointer-only get_current_monitor().
 */
describe("W3 focus monitor (dock + Guake float-follow)", () => {
  let ctx;

  function setup() {
    ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 2 } },
      settings: {
        "auto-split-enabled": true,
        "new-window-placement": "pointer",
      },
    });
    ctx.display.get_current_monitor.mockReturnValue(0);
  }

  afterEach(() => {
    ctx?.cleanup();
    if (Shell.App?.prototype) {
      Shell.App.prototype._forgeDockWm = null;
    }
  });

  const wm = () => ctx.windowManager;

  const tileOn = (monIndex, overrides = {}) => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIndex);
    return createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        monitor: monIndex,
        rect: { x: monIndex * 1920, y: 0, width: 800, height: 600 },
        ...overrides,
      },
    });
  };

  describe("resolveFocusMonitor", () => {
    beforeEach(() => setup());

    it("returns focused window monitor when valid", () => {
      const { metaWindow } = tileOn(0, { id: "focus0" });
      ctx.display.get_focus_window.mockReturnValue(metaWindow);
      ctx.display.get_current_monitor.mockReturnValue(1);
      expect(wm().resolveFocusMonitor()).toBe(0);
    });

    it("falls back to get_current_monitor when no focus", () => {
      ctx.display.get_focus_window.mockReturnValue(null);
      ctx.display.get_current_monitor.mockReturnValue(1);
      expect(wm().resolveFocusMonitor()).toBe(1);
    });

    it("falls back when focus monitor is invalid", () => {
      const { metaWindow } = tileOn(0, { id: "bad-mon" });
      metaWindow._monitor = -1;
      ctx.display.get_focus_window.mockReturnValue(metaWindow);
      ctx.display.get_current_monitor.mockReturnValue(1);
      expect(wm().resolveFocusMonitor()).toBe(1);
    });
  });

  describe("dock launch hook", () => {
    beforeEach(() => setup());

    it("notes focus monitor when pointer is on the other mon", () => {
      wm()._tryInstallDockLaunchHook();
      const { metaWindow: focusWin } = tileOn(0, { id: "focus-on-0" });
      ctx.display.get_focus_window.mockReturnValue(focusWin);
      ctx.display.get_current_monitor.mockReturnValue(1);

      const app = new Shell.App({ id: "com.example.DockApp" });
      app.activate();

      expect(wm()._pendingDockLaunches.some((e) => e.monitor === 0)).toBe(true);
      expect(wm()._pendingDockLaunches.some((e) => e.monitor === 1)).toBe(false);
    });
  });

  describe("Guake float-follow", () => {
    beforeEach(() => setup());

    it("moves Guake to focus mon0 while pointer reports mon1", () => {
      const { metaWindow: focusWin, nodeWindow: focusNode } = tileOn(0, {
        id: "focus-tile",
      });
      ctx.display.get_focus_window.mockReturnValue(focusWin);
      ctx.display.get_current_monitor.mockReturnValue(1);

      wm().windowProps.overrides.push({ wmClass: "Guake", mode: "float" });

      const guake = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "guake",
        wm_class: "Guake",
        title: "Guake",
      });
      wm().trackWindow(null, guake);

      expect(guake.get_monitor()).toBe(0);
      const node = wm().findNodeWindow(guake);
      expect(node).toBeTruthy();
      expect(node.mode).toBe(WINDOW_MODES.FLOAT);
      // Floats never enter LFT (focus still the tiled window).
      wm().movePointerWith(focusNode);
      expect(wm().lftMru.globalHead()).toBe(focusNode);
      expect(wm().lftMru.globalOrder()).not.toContain(node);
    });

    it("late wm-class Guake still float-follows focus mon", () => {
      const { metaWindow: focusWin } = tileOn(0, { id: "focus-tile" });
      ctx.display.get_focus_window.mockReturnValue(focusWin);
      ctx.display.get_current_monitor.mockReturnValue(1);

      wm().windowProps.overrides.push({ wmClass: "Guake", mode: "float" });

      const guake = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "guake-late",
        wm_class: null,
        title: "Guake",
      });
      wm().trackWindow(null, guake);
      // No class yet — not allowlisted; still on map mon.
      expect(guake.get_monitor()).toBe(1);

      guake.set_wm_class("Guake");
      expect(guake.get_monitor()).toBe(0);
    });

    it("case-insensitive Guake match", () => {
      const { metaWindow: focusWin } = tileOn(0, { id: "focus-tile" });
      ctx.display.get_focus_window.mockReturnValue(focusWin);
      ctx.display.get_current_monitor.mockReturnValue(1);

      const guake = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "guake-lower",
        wm_class: "guake",
        title: "guake",
      });
      wm().trackWindow(null, guake);
      expect(guake.get_monitor()).toBe(0);
    });

    it("does not float-follow ordinary apps", () => {
      const { metaWindow: focusWin } = tileOn(0, { id: "focus-tile" });
      ctx.display.get_focus_window.mockReturnValue(focusWin);
      ctx.display.get_current_monitor.mockReturnValue(1);

      const other = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 1,
        id: "nautilus",
        wm_class: "org.gnome.Nautilus",
        title: "Files",
      });
      // Dock sticky not applied; float-follow should not force mon0.
      wm().trackWindow(null, other);
      // Ordinary open may rehome via LFT/pointer policy — assert allowlist only.
      expect(wm()._isFloatFollowWindow(other)).toBe(false);
      expect(wm()._applyFloatFollowMonitor(other)).toBe(false);
    });
  });
});
