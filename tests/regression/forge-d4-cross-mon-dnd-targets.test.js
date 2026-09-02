import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  collectDragDropTargetMetaWindows,
  isEligibleDragDropTargetNode,
} from "../../lib/extension/drag-drop.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";

/**
 * D4: cross-monitor DnD targets — hit + five-zone paint on foreign mon.
 *
 * sortedWindows must include TILE leaves on every monitor of the active
 * workspace (not only get_current_monitor()). Pointer over mon1 must resolve
 * nodeWinAtPointer and paint zone previews at mon1 frame coords; leaving the
 * tile hides previews (no sticky overlay).
 */
describe("D4: cross-mon drag-drop targets (hit + paint)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        workspaceManager: { workspaceCount: 1 },
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
      settings: {
        "dnd-center-layout": "TABBED",
        "preview-hint-enabled": true,
      },
    });
    ctx.extension.keybindings = { allowDragDropTile: () => true };
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  function dualMonScene() {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const meta0 = createMockWindow({
      id: "mon0-tile",
      rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
      workspace: workspace0(),
      monitor: 0,
    });
    const node0 = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, meta0);
    node0.mode = WINDOW_MODES.TILE;

    const meta1 = createMockWindow({
      id: "mon1-tile",
      rect: new Rectangle({ x: 1920, y: 0, width: 1920, height: 1080 }),
      workspace: workspace0(),
      monitor: 1,
    });
    const node1 = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, meta1);
    node1.mode = WINDOW_MODES.TILE;

    const metaDrag = createMockWindow({
      id: "dragged",
      rect: new Rectangle({ x: 100, y: 100, width: 400, height: 400 }),
      workspace: workspace0(),
      monitor: 0,
    });
    const nodeDrag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaDrag);
    nodeDrag.mode = WINDOW_MODES.GRAB_TILE;

    return { mon0, mon1, meta0, node0, meta1, node1, metaDrag, nodeDrag };
  }

  function makeZoneActors() {
    const make = () => ({
      set_style_class_name: vi.fn(),
      set_position: vi.fn(),
      set_size: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    });
    return {
      TOP: make(),
      RIGHT: make(),
      BOTTOM: make(),
      LEFT: make(),
      CENTER: make(),
    };
  }

  describe("pure filter (no mon index)", () => {
    it("includes TILE on any mon, excludes GRAB_TILE / FLOAT / self", () => {
      const { meta0, node0, meta1, node1, metaDrag, nodeDrag } = dualMonScene();
      const floatMeta = createMockWindow({ id: "float", workspace: workspace0(), monitor: 1 });
      const floatNode = {
        nodeValue: floatMeta,
        mode: WINDOW_MODES.FLOAT,
        isTile: () => false,
        isGrabTile: () => false,
      };

      expect(isEligibleDragDropTargetNode(node0, metaDrag)).toBe(true);
      expect(isEligibleDragDropTargetNode(node1, metaDrag)).toBe(true);
      expect(isEligibleDragDropTargetNode(nodeDrag, metaDrag)).toBe(false);
      expect(isEligibleDragDropTargetNode(floatNode, metaDrag)).toBe(false);

      const metas = collectDragDropTargetMetaWindows([node0, node1, nodeDrag, floatNode], metaDrag);
      expect(metas).toContain(meta0);
      expect(metas).toContain(meta1);
      expect(metas).not.toContain(metaDrag);
      expect(metas).not.toContain(floatMeta);
    });
  });

  describe("trackCurrentMonWs + hit", () => {
    it("lists mon1 TILE even when get_current_monitor is mon0", () => {
      const { meta0, meta1, metaDrag } = dualMonScene();
      global.display.get_current_monitor.mockReturnValue(0);
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      global.display.get_focus_window.mockReturnValue(metaDrag);

      wm().trackCurrentMonWs(metaDrag);

      expect(wm().sortedWindows).toContain(meta1);
      expect(wm().sortedWindows).toContain(meta0);
      expect(wm().sortedWindows).not.toContain(metaDrag);
    });

    it("findNodeWindowAtPointer resolves mon1 tile under mon1 coords", () => {
      const { node1, nodeDrag, metaDrag } = dualMonScene();
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      wm().trackCurrentMonWs(metaDrag);

      // Pointer over mon1 center (stage coords).
      setPointer(1920 + 960, 540);
      wm()._grabStartPointer = [200, 200]; // mouse moved — trust pointer

      expect(wm().findNodeWindowAtPointer(nodeDrag)).toBe(node1);
    });

    it("findNodeWindowAtPointer returns null over inter-mon gap", () => {
      const { nodeDrag, metaDrag } = dualMonScene();
      // Leave a gap: mon1 tile only covers its frame; point between is invalid if
      // frames don't abut — use y far below both frames.
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      wm().trackCurrentMonWs(metaDrag);
      setPointer(960, 2000);
      wm()._grabStartPointer = [0, 0];

      expect(wm().findNodeWindowAtPointer(nodeDrag)).toBeNull();
    });
  });

  describe("hover paint on foreign mon + hide on leave", () => {
    it("paints five zones at mon1 frame when hovering mon1", () => {
      const { node1, nodeDrag, metaDrag } = dualMonScene();
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      global.display.get_current_monitor.mockReturnValue(0);

      const zoneActors = makeZoneActors();
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        remove_child: vi.fn(),
        add_child: vi.fn(),
      };
      nodeDrag.previewHint = previewHint;
      nodeDrag.previewZoneActors = zoneActors;

      wm().trackCurrentMonWs(metaDrag);
      // LEFT zone of mon1: unit x=1920..3840, center half starts at 1920+480=2400
      setPointer(1920 + 100, 540);
      wm()._grabStartPointer = [10, 10];
      wm().nodeWinAtPointer = node1;

      wm().moveWindowToPointer(nodeDrag, true);

      expect(previewHint.show).toHaveBeenCalled();
      expect(previewHint.set_position).toHaveBeenCalledWith(1920, 0);
      expect(previewHint.set_size).toHaveBeenCalledWith(1920, 1080);
      for (const z of ["TOP", "RIGHT", "BOTTOM", "LEFT", "CENTER"]) {
        expect(zoneActors[z].show).toHaveBeenCalled();
      }
      expect(zoneActors.LEFT.set_style_class_name).toHaveBeenCalledWith("window-tilepreview-tiled");
    });

    it("_handleMoving hides preview when pointer leaves all tiles", () => {
      const { nodeDrag, metaDrag } = dualMonScene();
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      global.display.get_focus_window.mockReturnValue(metaDrag);

      const zoneActors = makeZoneActors();
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        remove_child: vi.fn(),
        add_child: vi.fn(),
      };
      nodeDrag.previewHint = previewHint;
      nodeDrag.previewZoneActors = zoneActors;
      nodeDrag.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(100, 3000);
      wm()._grabStartPointer = [0, 0];
      wm()._handleMoving(nodeDrag);

      expect(wm().nodeWinAtPointer).toBeNull();
      expect(previewHint.hide).toHaveBeenCalled();
      for (const z of Object.values(zoneActors)) {
        expect(z.hide).toHaveBeenCalled();
      }
    });

    it("_handleMoving refreshes targets and hits mon1 mid-drag", () => {
      const { node1, nodeDrag, metaDrag } = dualMonScene();
      global.workspace_manager.get_active_workspace_index.mockReturnValue(0);
      global.display.get_current_monitor.mockReturnValue(0);
      global.display.get_focus_window.mockReturnValue(metaDrag);

      const zoneActors = makeZoneActors();
      const previewHint = {
        set_style_class_name: vi.fn(),
        set_position: vi.fn(),
        set_size: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        remove_child: vi.fn(),
        add_child: vi.fn(),
      };
      nodeDrag.previewHint = previewHint;
      nodeDrag.previewZoneActors = zoneActors;

      setPointer(1920 + 960, 540); // mon1 center
      wm()._grabStartPointer = [50, 50];
      wm()._handleMoving(nodeDrag);

      expect(wm().nodeWinAtPointer).toBe(node1);
      expect(previewHint.set_position).toHaveBeenCalledWith(1920, 0);
      expect(previewHint.show).toHaveBeenCalled();
    });
  });
});
