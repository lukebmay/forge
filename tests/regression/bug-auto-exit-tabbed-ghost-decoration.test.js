import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createTreeFixture,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * Bug: auto-exit-tabbed (last window in a TABBED group) flipped layout to
 * H/VSPLIT but left the CON's decoration actor live. updateDecorationLayout
 * re-showed any CON with decoration + tiled kids when showtab was on — missing
 * isStackedOrTabbed() — then restacked that strip above the window as an
 * invisible reactive hit plate over native CSD (× does nothing until content
 * click).
 *
 * Fix (defense in depth):
 *   A) updateDecorationLayout only re-shows when con.isStackedOrTabbed()
 *   B) removeNode auto-exit tears down decoration + remaining child tabs
 *   C) processNode hides/zero-sizes leftover decoration on non-tab/stack layouts
 */
describe("Bug auto-exit-tabbed ghost decoration over native CSD", () => {
  describe("A — updateDecorationLayout isStackedOrTabbed gate", () => {
    let ctx;
    let con;

    afterEach(() => {
      ctx?.cleanup?.();
      vi.restoreAllMocks();
    });

    function buildTabbedCon() {
      ctx = createWindowManagerFixture({
        settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
      });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
      con.decoration = { show: vi.fn(), hide: vi.fn(), set_size: vi.fn(), reactive: true };
      createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-a" } });
      createWindowNode(ctx.tree, con, { windowOverrides: { id: "tab-b" } });
    }

    it("still re-shows decoration for a live TABBED CON with tiled kids", () => {
      buildTabbedCon();
      expect(con.isStackedOrTabbed()).toBe(true);

      ctx.windowManager.updateDecorationLayout();

      expect(con.decoration.hide).toHaveBeenCalled();
      expect(con.decoration.show).toHaveBeenCalled();
    });

    it("does NOT re-show decoration after layout leaves TABBED (ghost plate gate)", () => {
      buildTabbedCon();
      // Simulate auto-exit / layout toggle leaving a leftover decoration actor.
      con.layout = LAYOUT_TYPES.HSPLIT;
      // Drop to one tiled child as after closing the other tab.
      ctx.tree.removeNode(con.childNodes[1]);
      // removeNode with auto-exit may null decoration; re-attach a leftover to
      // isolate the gate (auto-exit off path / incomplete teardown).
      if (!con.decoration) {
        con.decoration = { show: vi.fn(), hide: vi.fn(), set_size: vi.fn(), reactive: true };
      } else {
        con.decoration.show = vi.fn();
        con.decoration.hide = vi.fn();
      }
      expect(con.isStackedOrTabbed()).toBe(false);
      expect(con.childNodes.length).toBe(1);

      ctx.windowManager.updateDecorationLayout();

      expect(con.decoration.hide).toHaveBeenCalled();
      expect(con.decoration.show).not.toHaveBeenCalled();
    });

    it("does NOT re-show decoration for STACKED→HSPLIT leftover either", () => {
      buildTabbedCon();
      con.layout = LAYOUT_TYPES.STACKED;
      ctx.windowManager.updateDecorationLayout();
      expect(con.decoration.show).toHaveBeenCalled();
      con.decoration.show.mockClear();
      con.decoration.hide.mockClear();

      con.layout = LAYOUT_TYPES.VSPLIT;
      ctx.windowManager.updateDecorationLayout();

      expect(con.decoration.hide).toHaveBeenCalled();
      expect(con.decoration.show).not.toHaveBeenCalled();
    });
  });

  describe("B — auto-exit tears down decoration + remaining child tabs", () => {
    let ctx;

    beforeEach(() => {
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: {
          "tiling-mode-enabled": true,
          "showtab-decoration-enabled": true,
          "auto-exit-tabbed": true,
        },
      });
      ctx.extWm.currentMonWsNode = ctx.tree.nodeWorkpaces[0].getNodeByType(NODE_TYPES.MONITOR)[0];
    });

    it("destroys decoration and remaining tab when last-but-one tab closes", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const w0 = createWindowNode(ctx.tree, con, { windowOverrides: { id: "keep" } }).nodeWindow;
      const w1 = createWindowNode(ctx.tree, con, { windowOverrides: { id: "close" } }).nodeWindow;

      expect(con.decoration).toBeTruthy();
      expect(w0.tab).toBeTruthy();
      expect(w1.tab).toBeTruthy();

      const deco = con.decoration;
      let decoDestroyed = 0;
      const realDestroy = deco.destroy?.bind(deco);
      deco.destroy = () => {
        decoDestroyed++;
        if (realDestroy) realDestroy();
      };

      ctx.tree.removeNode(w1);

      expect(con.layout).toBe(LAYOUT_TYPES.HSPLIT); // landscape mock default
      expect(con.childNodes.length).toBe(1);
      expect(con.childNodes[0]).toBe(w0);
      expect(con.decoration).toBe(null);
      expect(decoDestroyed).toBe(1);
      // Remaining child's Forge tab is gone (native CSD only; no rebuild).
      expect(w0.tab).toBe(null);
      expect(w1.tab).toBe(null);
    });

    it("does not rebuild a tab for the survivor via _resetTabForReparent", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const w0 = createWindowNode(ctx.tree, con).nodeWindow;
      const w1 = createWindowNode(ctx.tree, con).nodeWindow;
      const resetSpy = vi.spyOn(w0, "_resetTabForReparent");
      const destroyTabSpy = vi.spyOn(w0, "_destroyTab");

      ctx.tree.removeNode(w1);

      expect(resetSpy).not.toHaveBeenCalled();
      expect(destroyTabSpy).toHaveBeenCalled();
      expect(w0.tab).toBe(null);
    });
  });

  describe("C — processNode hides leftover non-tab decoration", () => {
    let ctx;

    beforeEach(() => {
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: {
          "tiling-mode-enabled": true,
          "showtab-decoration-enabled": true,
          "auto-exit-tabbed": false,
        },
      });
      ctx.extWm.currentMonWsNode = ctx.tree.nodeWorkpaces[0].getNodeByType(NODE_TYPES.MONITOR)[0];
    });

    it("hides and zero-sizes decoration when layout is HSPLIT but decoration remains", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      createWindowNode(ctx.tree, con);
      // CON constructor always creates decoration; leave it as a leftover plate.
      expect(con.decoration).toBeTruthy();
      con.decoration.reactive = true;
      con.decoration.set_size(800, 36);
      con.decoration.show();

      ctx.tree.processNode(monitor);

      expect(con.decoration.visible).toBe(false);
      expect(con.decoration.width).toBe(0);
      expect(con.decoration.height).toBe(0);
      expect(con.decoration.reactive).toBe(false);
    });

    it("re-arms decoration.reactive when layout toggles back to TABBED", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      createWindowNode(ctx.tree, con);
      createWindowNode(ctx.tree, con);
      ctx.tree.processNode(monitor);
      expect(con.decoration.reactive).toBe(false);

      con.layout = LAYOUT_TYPES.TABBED;
      ctx.tree.processNode(monitor);

      expect(con.decoration.reactive).toBe(true);
    });
  });

  describe("end-to-end: auto-exit + updateDecorationLayout never re-shows", () => {
    let ctx;

    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: {
          "tiling-mode-enabled": true,
          "showtab-decoration-enabled": true,
          "auto-exit-tabbed": true,
        },
      });
    });

    afterEach(() => {
      ctx?.cleanup?.();
      vi.restoreAllMocks();
    });

    it("after closing one of two tabs, decoration is gone and layout update stays quiet", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      createWindowNode(ctx.tree, con, { windowOverrides: { id: "keep" } });
      const close = createWindowNode(ctx.tree, con, {
        windowOverrides: { id: "close" },
      }).nodeWindow;

      ctx.tree.removeNode(close);

      expect(con.isStackedOrTabbed()).toBe(false);
      expect(con.decoration).toBe(null);

      // Even a forged leftover must not be re-shown (gate A).
      const leftover = { show: vi.fn(), hide: vi.fn() };
      con.decoration = leftover;
      ctx.windowManager.updateDecorationLayout();
      expect(leftover.hide).toHaveBeenCalled();
      expect(leftover.show).not.toHaveBeenCalled();
    });
  });
});
