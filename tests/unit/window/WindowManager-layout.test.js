import { describe, it, expect, beforeEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle, WindowType } from "../../mocks/gnome/Meta.js";
import { createHostBag } from "../../../lib/host/index.js";

/**
 * WindowManager layout and mode behavior tests
 *
 * Tests for behaviors:
 * - Default layout preferences for new workspaces
 * - Focus behavior after window destruction
 * - Workspace layout independence
 */
describe("WindowManager - Layout and Mode Behaviors", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-on-hover-enabled": false,
        "move-pointer-focus-enabled": false,
        "auto-exit-tabbed": true,
        "default-split-layout": 0, // HSPLIT
      },
      globals: {
        display: {
          monitorCount: 1,
        },
        workspaceManager: {
          workspaceCount: 2,
        },
      },
    });

    // Add additional mocks needed for these tests
    ctx.display.get_monitor_neighbor_index = vi.fn(() => -1);
    ctx.display.sort_windows_by_stacking = vi.fn((windows) => windows);
    ctx.display.focus_window = null;

    setPointer(960, 540);
    global.get_window_actors = vi.fn(() => []);

    global.Main = {
      overview: {
        visible: false,
      },
    };

    global.Meta = {
      WindowType,
    };
  });

  // Convenience accessor
  const wm = () => ctx.windowManager;

  describe("Default Layout Preferences", () => {
    it("should use HSPLIT layout by default", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      expect(monitor.layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should pick HSPLIT from determineSplitLayout on a landscape monitor", () => {
      const layout = wm().determineSplitLayout();

      expect(layout).toBe(LAYOUT_TYPES.HSPLIT);
    });
  });

  describe("Focus After Window Destruction", () => {
    it("should track lastFocusedWindow through movePointerWith (the focus path)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
          workspace: ctx.workspaces[0],
        },
      });

      expect(wm().lastFocusedWindow).toBeNull();
      wm().movePointerWith(nodeWindow);

      expect(wm().lastFocusedWindow).toBe(nodeWindow);
    });

    it("should remove the closed window's node from the tree", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
          workspace: ctx.workspaces[0],
        },
      });

      wm().lastFocusedWindow = nodeWindow;
      ctx.tree.removeNode(nodeWindow);

      // After removal, lastFocusedWindow may still reference the node
      // The important thing is the node is no longer in the tree
      const foundNode = wm().findNodeWindow(metaWindow);
      expect(foundNode).toBeNull();
    });
  });

  describe("Workspace Layout Independence", () => {
    it("should maintain separate monitor nodes per workspace", () => {
      const { workspace: workspace0, monitor: monitor0 } = getWorkspaceAndMonitor(ctx, 0);
      const { workspace: workspace1, monitor: monitor1 } = getWorkspaceAndMonitor(ctx, 1);

      expect(monitor0).not.toBe(monitor1);
    });

    it("should preserve windows in each workspace independently", () => {
      const { monitor: monitor0 } = getWorkspaceAndMonitor(ctx, 0);
      const { monitor: monitor1 } = getWorkspaceAndMonitor(ctx, 1);

      const { nodeWindow: node1 } = createWindowNode(ctx.tree, monitor0, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
          workspace: ctx.workspaces[0],
        },
      });
      const { nodeWindow: node2 } = createWindowNode(ctx.tree, monitor1, {
        windowOverrides: {
          rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
          workspace: ctx.workspaces[1],
        },
      });

      // Each workspace should have its window
      expect(monitor0.childNodes).toContain(node1);
      expect(monitor1.childNodes).toContain(node2);
      expect(monitor0.childNodes).not.toContain(node2);
      expect(monitor1.childNodes).not.toContain(node1);
    });

    it("should track window count per workspace", () => {
      const { workspace: workspace0, monitor: monitor0 } = getWorkspaceAndMonitor(ctx, 0);
      const { workspace: workspace1, monitor: monitor1 } = getWorkspaceAndMonitor(ctx, 1);

      createWindowNode(ctx.tree, monitor0, { windowOverrides: { workspace: ctx.workspaces[0] } });
      createWindowNode(ctx.tree, monitor0, { windowOverrides: { workspace: ctx.workspaces[0] } });
      createWindowNode(ctx.tree, monitor1, { windowOverrides: { workspace: ctx.workspaces[1] } });

      const ws0Windows = workspace0.getNodeByType(NODE_TYPES.WINDOW);
      const ws1Windows = workspace1.getNodeByType(NODE_TYPES.WINDOW);

      expect(ws0Windows).toHaveLength(2);
      expect(ws1Windows).toHaveLength(1);
    });
  });

  describe("Layout Container Management", () => {
    it("Split command wraps an HSPLIT pair and flips to VSPLIT", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const a = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, workspace: ctx.workspaces[0] },
      });
      const b = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "Other", workspace: ctx.workspaces[0] },
      });
      a.nodeWindow.mode = WINDOW_MODES.TILE;
      b.nodeWindow.mode = WINDOW_MODES.TILE;
      ctx.display.get_focus_window.mockReturnValue(a.metaWindow);

      wm().command({ name: "Split" });

      expect(monitor.childNodes).toHaveLength(1);
      expect(monitor.childNodes[0].nodeType).toBe(NODE_TYPES.CON);
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(monitor.childNodes[0].childNodes).toEqual([a.nodeWindow, b.nodeWindow]);
    });

    it("toggleSplit flips the wrap HSPLIT ↔ VSPLIT", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const a = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, workspace: ctx.workspaces[0] },
      });
      createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "Other", workspace: ctx.workspaces[0] },
      }).nodeWindow.mode = WINDOW_MODES.TILE;
      a.nodeWindow.mode = WINDOW_MODES.TILE;
      ctx.display.get_focus_window.mockReturnValue(a.metaWindow);

      wm().command({ name: "toggleSplit" });
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.VSPLIT);

      wm().command({ name: "toggleSplit" });
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should set STACKED via two LayoutStackedToggle commands (toggleTabStack)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const a = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, workspace: ctx.workspaces[0] },
      });
      const b = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "Other", workspace: ctx.workspaces[0] },
      });
      a.nodeWindow.mode = WINDOW_MODES.TILE;
      b.nodeWindow.mode = WINDOW_MODES.TILE;
      ctx.display.get_focus_window.mockReturnValue(a.metaWindow);

      wm().command({ name: "LayoutStackedToggle" });
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.TABBED);

      wm().command({ name: "LayoutStackedToggle" });
      expect(monitor.childNodes[0].nodeType).toBe(NODE_TYPES.CON);
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.STACKED);
    });

    it("should set TABBED via the real LayoutTabbedToggle command", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const a = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, workspace: ctx.workspaces[0] },
      });
      createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "Other", workspace: ctx.workspaces[0] },
      }).nodeWindow.mode = WINDOW_MODES.TILE;
      a.nodeWindow.mode = WINDOW_MODES.TILE;
      ctx.display.get_focus_window.mockReturnValue(a.metaWindow);

      wm().command({ name: "LayoutTabbedToggle" });

      expect(monitor.childNodes[0].nodeType).toBe(NODE_TYPES.CON);
      expect(monitor.childNodes[0].layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("findNodeWindow", () => {
    it("should find window node by metaWindow", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { workspace: ctx.workspaces[0] },
      });

      const found = wm().findNodeWindow(metaWindow);

      expect(found).toBe(nodeWindow);
    });

    it("should return null for unknown window", () => {
      const metaWindow = createMockWindow({ workspace: ctx.workspaces[0] });

      const found = wm().findNodeWindow(metaWindow);

      expect(found).toBeNull();
    });

    it("should find window across different workspaces", () => {
      const { monitor: monitor0 } = getWorkspaceAndMonitor(ctx, 0);
      const { monitor: monitor1 } = getWorkspaceAndMonitor(ctx, 1);

      createWindowNode(ctx.tree, monitor0, {
        windowOverrides: { workspace: ctx.workspaces[0] },
      });
      const { nodeWindow: node2, metaWindow: metaWindow2 } = createWindowNode(ctx.tree, monitor1, {
        windowOverrides: { workspace: ctx.workspaces[1] },
      });

      const found = wm().findNodeWindow(metaWindow2);

      expect(found).toBe(node2);
    });

    it("uses host bag reverse index when Forest is seeded", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { workspace: ctx.workspaces[0] },
      });
      const decoy = { decoy: true, nodeValue: metaWindow };
      wm()._liveForestSeeded = true;
      wm().hostBag = createHostBag();
      wm().liveById = new Map();
      wm().hostBag.set("nid-bag", { meta: metaWindow, windowId: "1" });
      wm().liveById.set("nid-bag", decoy);
      const walk = vi.spyOn(ctx.tree, "getNodeByValue");

      const found = wm().findNodeWindow(metaWindow);

      expect(found).toBe(decoy);
      expect(walk).not.toHaveBeenCalled();
    });

    it("falls back to tree walk when Forest is unseeded", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { workspace: ctx.workspaces[0] },
      });
      wm()._liveForestSeeded = false;
      wm().hostBag = createHostBag();
      wm().liveById = new Map();
      wm().hostBag.set("nid-unseeded", { meta: metaWindow, windowId: "1" });
      wm().liveById.set("nid-unseeded", { decoy: true });

      const found = wm().findNodeWindow(metaWindow);

      expect(found).toBe(nodeWindow);
    });
  });
});
