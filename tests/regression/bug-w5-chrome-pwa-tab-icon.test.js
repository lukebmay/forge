import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import * as Shell from "../mocks/gnome/Shell.js";

/**
 * W5: Chrome PWA tabs must not keep the browser icon after class/app resolves.
 *
 * WindowTracker often returns Google Chrome for PWAs. Prefer chrome-<id>-Default
 * .desktop via AppSystem, and rebuild the tab when app id changes (refreshApp
 * used to only rebuild on null-app fallback).
 */
describe("W5: Chrome PWA tab icon from desktop + app-id refresh", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    Shell.AppSystem.__clearApps();
  });

  afterEach(() => {
    Shell.AppSystem.__clearApps();
    ctx.cleanup();
  });

  it("prefers chrome-*-Default.desktop app over tracker browser app", () => {
    const pwaApp = new Shell.App({ id: "chrome-yt.desktop", name: "YouTube" });
    Shell.AppSystem.__setApp("chrome-agimnkijcaahngcdmfeangaknmldooml-Default.desktop", pwaApp);

    const win = createMockWindow({
      wm_class: "chrome-agimnkijcaahngcdmfeangaknmldooml-Default",
      title: "YouTube",
      id: 9001,
    });
    // Tracker returns browser
    vi.spyOn(Shell.WindowTracker.prototype, "get_window_app").mockReturnValue(
      new Shell.App({ id: "google-chrome.desktop", name: "Google Chrome" })
    );

    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.refreshApp();

    expect(node.app?.get_id?.()).toBe("chrome-yt.desktop");
  });

  it("rebuilds tab when resolved app id changes", () => {
    const browser = new Shell.App({ id: "google-chrome.desktop", name: "Chrome" });
    const grok = new Shell.App({ id: "chrome-grok.desktop", name: "Grok" });
    Shell.AppSystem.__setApp("chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default.desktop", grok);

    const win = createMockWindow({
      wm_class: null,
      title: "",
      id: 9002,
    });
    const tracker = vi.spyOn(Shell.WindowTracker.prototype, "get_window_app");
    tracker.mockReturnValue(browser);

    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    // Force tab with browser app first
    node.app = browser;
    node._tabFallback = false;
    node.tab = { destroy: vi.fn(), connect: () => 0 };
    const destroySpy = vi.spyOn(node, "_destroyTab");

    win.set_wm_class?.("chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default");
    if (typeof win.set_wm_class !== "function") {
      win.wm_class = "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default";
    }

    node.refreshApp();
    expect(destroySpy).toHaveBeenCalled();
    expect(node.app?.get_id?.()).toBe("chrome-grok.desktop");
  });
});
