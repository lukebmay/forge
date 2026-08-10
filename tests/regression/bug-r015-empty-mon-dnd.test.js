import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { resolveEmptyMonitorDrop } from "../../lib/extension/drag-drop.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
} from "../mocks/helpers/index.js";
import { Rectangle, GrabOp } from "../mocks/gnome/Meta.js";

/**
 * R015: Drag TILE from mon0 onto empty mon1 work area → window must rehome.
 *
 * Symptom (host Wayland dual-4K): two dock-opened windows on left mon; click-drag
 * one to empty right mon; on release window snaps back. Keyboard mon-move works.
 *
 * Root: DnD only commits when nodeWinAtPointer is set. R012 skips mid-drag
 * rehome while GRAB_TILE. Empty dest mon → null target → grab-end no-op →
 * commitLayout snaps geometry to source tree mon.
 *
 * Fix: grab-end empty-mon path (resolveEmptyMonitorDrop + rehome).
 */
describe("R015: empty-monitor drag-drop rehome", () => {
  describe("resolveEmptyMonitorDrop (pure)", () => {
    it("returns null when a window target is under the pointer", () => {
      expect(
        resolveEmptyMonitorDrop({
          hasWindowTarget: true,
          pointerMonIndex: 1,
          sourceTreeMonIndex: 0,
        })
      ).toBeNull();
    });

    it("returns null when pointer stays on source mon", () => {
      expect(
        resolveEmptyMonitorDrop({
          hasWindowTarget: false,
          pointerMonIndex: 0,
          sourceTreeMonIndex: 0,
        })
      ).toBeNull();
    });

    it("returns null for invalid mon indices", () => {
      expect(
        resolveEmptyMonitorDrop({
          hasWindowTarget: false,
          pointerMonIndex: -1,
          sourceTreeMonIndex: 0,
        })
      ).toBeNull();
      expect(
        resolveEmptyMonitorDrop({
          hasWindowTarget: false,
          pointerMonIndex: 1,
          sourceTreeMonIndex: -1,
        })
      ).toBeNull();
    });

    it("returns dest mon when pointer mon differs and no window target", () => {
      expect(
        resolveEmptyMonitorDrop({
          hasWindowTarget: false,
          pointerMonIndex: 1,
          sourceTreeMonIndex: 0,
        })
      ).toEqual({ destMonIndex: 1 });
    });
  });

  describe("moveWindowToPointer empty mon commit", () => {
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
          "tiling-mode-enabled": true,
        },
      });
      ctx.extension.keybindings = { allowDragDropTile: () => true };
      global.Meta = { ...(global.Meta || {}), GrabOp };
    });

    afterEach(() => {
      ctx.cleanup();
    });

    const wm = () => ctx.windowManager;
    const workspace0 = () => ctx.workspaces[0];

    function twoOnLeftEmptyRight() {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      const metaA = createMockWindow({
        id: "left-a",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
        monitor: 0,
      });
      metaA.get_work_area_for_monitor = vi.fn((idx) => {
        if (idx === 1) return { x: 1920, y: 0, width: 1920, height: 1080 };
        return { x: 0, y: 0, width: 1920, height: 1080 };
      });
      metaA.move_to_monitor = vi.fn((idx) => {
        metaA.monitor = idx;
      });
      const nodeA = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaA);
      nodeA.mode = WINDOW_MODES.TILE;

      const metaB = createMockWindow({
        id: "left-b",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: workspace0(),
        monitor: 0,
      });
      const nodeB = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaB);
      nodeB.mode = WINDOW_MODES.TILE;

      return { mon0, mon1, metaA, nodeA, metaB, nodeB };
    }

    it("null target + pointer on empty mon1 rehomes dragged tile onto mon1", () => {
      const { mon0, mon1, metaA, nodeA, nodeB } = twoOnLeftEmptyRight();
      nodeA.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = nodeA;
      // Meta may already report mon1 mid-drag (visual); tree still mon0.
      metaA.get_monitor = vi.fn(() => 1);
      metaA.monitor = 1;

      setPointer(2400, 500);
      wm().nodeWinAtPointer = null;
      wm().moveWindowToPointer(nodeA, false);

      expect(mon1.contains(nodeA)).toBe(true);
      expect(mon0.contains(nodeA)).toBe(false);
      expect(mon0.contains(nodeB)).toBe(true);
    });

    it("null target + pointer still on source mon does not rehome", () => {
      const { mon0, mon1, nodeA } = twoOnLeftEmptyRight();
      nodeA.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = nodeA;

      setPointer(100, 100);
      wm().nodeWinAtPointer = null;
      wm().moveWindowToPointer(nodeA, false);

      expect(mon0.contains(nodeA)).toBe(true);
      expect(mon1.contains(nodeA)).toBe(false);
    });

    it("updateMetaWorkspaceMonitor still skips rehome while GRAB_TILE (R012)", () => {
      const { mon0, mon1, metaA, nodeA } = twoOnLeftEmptyRight();
      nodeA.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = nodeA;
      metaA.get_monitor = vi.fn(() => 1);
      metaA.monitor = 1;

      const rehomeSpy = vi.spyOn(wm(), "_rehomeWindowPreservingContainer");
      wm().updateMetaWorkspaceMonitor("window-entered-monitor", 1, metaA);

      expect(rehomeSpy).not.toHaveBeenCalled();
      expect(mon0.contains(nodeA)).toBe(true);
      expect(mon1.contains(nodeA)).toBe(false);
    });

    it("grab-end re-resolves then empty-mon commits via moveWindowToPointer", () => {
      const { mon1, metaA, nodeA } = twoOnLeftEmptyRight();
      nodeA.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = nodeA;
      ctx.display.get_focus_window.mockReturnValue(metaA);
      metaA.get_monitor = vi.fn(() => 1);
      metaA.monitor = 1;
      metaA.get_work_area_for_monitor = vi.fn((idx) => {
        if (idx === 1) return { x: 1920, y: 0, width: 1920, height: 1080 };
        return { x: 0, y: 0, width: 1920, height: 1080 };
      });

      setPointer(2400, 500);
      wm().nodeWinAtPointer = null;
      vi.spyOn(wm(), "findNodeWindowAtPointer").mockReturnValue(null);
      vi.spyOn(wm(), "trackCurrentMonWs").mockImplementation(() => {});
      vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
      vi.spyOn(wm(), "findNodeWindow").mockReturnValue(nodeA);
      vi.spyOn(wm(), "commitLayout").mockImplementation(() => {});
      vi.spyOn(wm(), "settleTabFocus").mockImplementation(() => {});

      wm()._handleGrabOpEnd(ctx.display, metaA, GrabOp.MOVING);

      expect(mon1.contains(nodeA)).toBe(true);
      expect(nodeA.mode).toBe(WINDOW_MODES.TILE);
    });
  });
});
