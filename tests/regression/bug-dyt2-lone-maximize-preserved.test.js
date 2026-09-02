import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";

/**
 * forge-dyt2: with maximize-on-single ON, signal + tree.apply must agree that
 * a lone Meta-max TILE is left alone (apply used to unmaximize every render).
 * With the setting OFF (schema default), D026 restores like multi-pane tiles.
 */
describe("forge-dyt2: tree.apply preserves a lone tiled window's maximize", () => {
  let ctx;

  afterEach(() => ctx?.cleanup());

  function tileWindow(monitor, id) {
    const metaWindow = createMockWindow({
      id,
      rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
      workspace: ctx.workspaces[0],
    });
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    node.renderRect = { x: 0, y: 0, width: 1920, height: 1080 };
    return { metaWindow, node };
  }

  describe("maximize-on-single ON", () => {
    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: { "tiling-mode-enabled": true, "window-maximize-on-single": true },
      });
    });

    it("does not unmaximize the sole tiled window on render", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
      const { metaWindow, node } = tileWindow(monitor, 7001);

      metaWindow.maximize();
      metaWindow.move_resize_frame(false, 0, 0, 1920, 1080);

      expect(ctx.windowManager._isLoneMaximizedTile(node)).toBe(true);
      expect(ctx.windowManager._shouldRejectExternalMaximize(node, metaWindow)).toBe(false);

      ctx.tree.apply(ctx.tree);
      expect(metaWindow.is_maximized()).toBe(true);

      ctx.tree.apply(ctx.tree);
      ctx.tree.apply(ctx.tree);
      expect(metaWindow.is_maximized()).toBe(true);
    });

    it("still re-tiles (unmaximizes) a maximized window when it is NOT alone", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };

      const { metaWindow: win1, node: node1 } = tileWindow(monitor, 7101);
      tileWindow(monitor, 7102);
      node1.renderRect = { x: 0, y: 0, width: 960, height: 1080 };

      win1.maximize();

      expect(ctx.windowManager._isLoneMaximizedTile(node1)).toBe(false);
      ctx.tree.apply(ctx.tree);
      expect(win1.is_maximized()).toBe(false);
    });

    it("OP2: firstRender lone max still places once (dock/new map)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
      const { metaWindow, node } = tileWindow(monitor, 7201);
      metaWindow.maximize();
      metaWindow.move_resize_frame(false, 100, 100, 400, 300);
      metaWindow.firstRender = true;
      node.renderRect = { x: 0, y: 0, width: 1920, height: 1080 };

      expect(ctx.windowManager._isLoneMaximizedTile(node)).toBe(true);
      ctx.tree.apply(ctx.tree);
      expect(metaWindow.firstRender).toBe(false);
      const frame = metaWindow.get_frame_rect();
      expect(frame.width).toBe(1920);
      expect(frame.height).toBe(1080);
    });
  });

  describe("maximize-on-single OFF (schema default)", () => {
    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: { "tiling-mode-enabled": true, "window-maximize-on-single": false },
      });
    });

    it("helper still wants restore; idle size-changed does not (D100)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
      const { metaWindow, node } = tileWindow(monitor, 7301);
      metaWindow.maximize();
      metaWindow.move_resize_frame(false, 0, 0, 1920, 1080);

      expect(ctx.windowManager._isLoneMaximizedTile(node)).toBe(false);
      expect(ctx.windowManager._shouldRestoreTileSlot(node, metaWindow)).toBe(true);

      ctx.windowManager.updateMetaPositionSize(metaWindow, "size-changed");
      expect(metaWindow.is_maximized()).toBe(true);
    });

    it("D051: processFloats keeps TILE while Meta max reports no-resize", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
      const { metaWindow, node } = tileWindow(monitor, 7302);
      metaWindow.maximize();
      expect(metaWindow.allows_resize()).toBe(false);

      ctx.windowManager.processFloats();
      expect(node.mode).toBe(WINDOW_MODES.TILE);
      expect(ctx.windowManager.isFloatingExempt(metaWindow)).toBe(false);
      expect(ctx.windowManager._shouldRestoreTileSlot(node, metaWindow)).toBe(true);

      ctx.windowManager.updateMetaPositionSize(metaWindow, "size-changed");
      expect(metaWindow.is_maximized()).toBe(true);
      expect(node.mode).toBe(WINDOW_MODES.TILE);
    });
  });
});
