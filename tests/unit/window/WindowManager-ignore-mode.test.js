import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { WindowType } from "../../mocks/gnome/Meta.js";

/**
 * mode: "ignore" — stronger than float: never create a tree node, drop on
 * override reload / late wm-class when a rule matches. User config only.
 */
describe("WindowManager - ignore mode (D020)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const setOverrides = (overrides) => {
    wm().windowProps = { overrides };
  };

  describe("isWindowIgnored", () => {
    it("matches class-only ignore override", () => {
      setOverrides([{ wmClass: "OverlayApp", mode: "ignore" }]);
      const win = createMockWindow({
        wm_class: "OverlayApp",
        title: "HUD",
        allows_resize: true,
        window_type: WindowType.NORMAL,
      });
      expect(wm().isWindowIgnored(win)).toBe(true);
    });

    it("does not match a different class", () => {
      setOverrides([{ wmClass: "OverlayApp", mode: "ignore" }]);
      const win = createMockWindow({
        wm_class: "OtherApp",
        title: "Main",
        allows_resize: true,
      });
      expect(wm().isWindowIgnored(win)).toBe(false);
    });

    it("matches title+class ignore", () => {
      setOverrides([{ wmClass: "Browser", wmTitle: "Picture-in-Picture", mode: "ignore" }]);
      const pip = createMockWindow({
        wm_class: "Browser",
        title: "Picture-in-Picture",
        allows_resize: true,
      });
      const tab = createMockWindow({
        wm_class: "Browser",
        title: "Example",
        allows_resize: true,
      });
      expect(wm().isWindowIgnored(pip)).toBe(true);
      expect(wm().isWindowIgnored(tab)).toBe(false);
    });

    it("float rules do not count as ignore", () => {
      setOverrides([{ wmClass: "Guake", mode: "float" }]);
      const win = createMockWindow({ wm_class: "Guake", title: "Guake", allows_resize: true });
      expect(wm().isWindowIgnored(win)).toBe(false);
      expect(wm().isFloatingExempt(win)).toBe(true);
    });

    it("returns false for null", () => {
      expect(wm().isWindowIgnored(null)).toBe(false);
    });
  });

  describe("trackWindow", () => {
    it("does not create a tree node for ignored windows", () => {
      setOverrides([{ wmClass: "OverlayApp", mode: "ignore" }]);
      const metaWindow = createMockWindow({
        wm_class: "OverlayApp",
        title: "HUD",
        window_type: WindowType.NORMAL,
        allows_resize: true,
      });
      const createSpy = vi.spyOn(ctx.tree, "createNode");
      const before = ctx.tree.getNodeByType(NODE_TYPES.WINDOW).length;

      wm().trackWindow(null, metaWindow);

      expect(createSpy).not.toHaveBeenCalled();
      expect(ctx.tree.getNodeByType(NODE_TYPES.WINDOW).length).toBe(before);
      expect(wm().findNodeWindow(metaWindow)).toBeFalsy();
    });

    it("still tracks a normal window when ignore rules do not match", () => {
      setOverrides([{ wmClass: "OverlayApp", mode: "ignore" }]);
      const metaWindow = createMockWindow({
        wm_class: "NormalApp",
        title: "Doc",
        window_type: WindowType.NORMAL,
        allows_resize: true,
      });

      wm().trackWindow(null, metaWindow);

      expect(wm().findNodeWindow(metaWindow)).not.toBeNull();
    });
  });

  describe("_dropIfIgnored / reload", () => {
    it("drops an already-tracked window when ignore rule is applied", () => {
      const metaWindow = createMockWindow({
        wm_class: "OverlayApp",
        title: "HUD",
        window_type: WindowType.NORMAL,
        allows_resize: true,
        id: 9001,
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);
      expect(wm().findNodeWindow(metaWindow)).not.toBeNull();

      setOverrides([{ wmClass: "OverlayApp", mode: "ignore" }]);
      expect(wm()._dropIfIgnored(metaWindow)).toBe(true);
      expect(wm().findNodeWindow(metaWindow)).toBeFalsy();
    });

    it("reloadWindowOverrides drops newly ignored tracked windows", () => {
      const metaWindow = createMockWindow({
        wm_class: "OverlayApp",
        title: "HUD",
        window_type: WindowType.NORMAL,
        allows_resize: true,
        id: 9002,
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      // Simulate configMgr returning ignore rule on reload
      ctx.configMgr.windowProps = {
        overrides: [{ wmClass: "OverlayApp", mode: "ignore" }],
      };
      wm().reloadWindowOverrides(false);

      expect(wm().isWindowIgnored(metaWindow)).toBe(true);
      expect(wm().findNodeWindow(metaWindow)).toBeFalsy();
    });
  });
});
