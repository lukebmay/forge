import { describe, it, expect, beforeEach, vi } from "vitest";
import St from "gi://St";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "../../../lib/extension/tree-types.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { Bin } from "../../mocks/gnome/St.js";
import {
  createMockWindow,
  createTreeFixture,
  createWindowNode,
  getWorkspaceAndMonitor,
  parentOf,
} from "../../mocks/helpers/index.js";
import { createHostBag } from "../../../lib/host/index.js";

/**
 * Tree class tests
 *
 * Note: Tree constructor requires complex GNOME global objects and WindowManager.
 * These tests focus on the core tree operations that can be tested in isolation.
 */
describe("Tree", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture();
  });

  describe("Constructor", () => {
    it("should initialize workspaces", () => {
      // Should have created workspace nodes
      const workspaces = ctx.tree.nodeWorkpaces;
      expect(workspaces.length).toBeGreaterThan(0);
    });
  });

  describe("findNode", () => {
    it("should find root node by value", () => {
      const found = ctx.tree.findNode(ctx.tree.nodeValue);

      expect(found).toBe(ctx.tree);
    });

    it("should find workspace node", () => {
      const workspaces = ctx.tree.nodeWorkpaces;
      if (workspaces.length > 0) {
        const ws = workspaces[0];
        const found = ctx.tree.findNode(ws.nodeValue);

        expect(found).toBe(ws);
      }
    });

    it("should return null for non-existent node", () => {
      const found = ctx.tree.findNode("nonexistent-node");

      expect(found).toBeNull();
    });

    it("should find nested nodes", () => {
      // Create a nested structure
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const containerBin = new St.Bin();
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, containerBin);

      // Find by the actual nodeValue (the St.Bin instance)
      const found = ctx.tree.findNode(containerBin);

      expect(found).toBe(container);
    });

    it("finds Meta WINDOW via host bag before walking", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor);
      const decoy = { decoy: true, nodeValue: metaWindow };
      const wm = ctx.tree.extWm;
      wm._liveForestSeeded = true;
      wm.hostBag = createHostBag();
      wm.liveById = new Map();
      wm.hostBag.set("nid-tree", { meta: metaWindow, windowId: "1" });
      wm.liveById.set("nid-tree", decoy);
      const walk = vi.spyOn(ctx.tree, "getNodeByValue");

      expect(ctx.tree.findNode(metaWindow)).toBe(decoy);
      expect(walk).not.toHaveBeenCalled();
    });

    it("finds workspace string ids without bag", () => {
      const wm = ctx.tree.extWm;
      wm._liveForestSeeded = true;
      wm.hostBag = createHostBag();
      const idFromMeta = vi.spyOn(wm.hostBag, "idFromMeta");
      const found = ctx.tree.findNode("ws0");

      expect(found).toBeTruthy();
      expect(found.nodeValue).toBe("ws0");
      expect(idFromMeta).not.toHaveBeenCalled();
    });
  });

  describe("createNode", () => {
    it("should create node under parent", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const containerBin = new St.Bin();
      const newNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, containerBin);

      expect(newNode).toBeDefined();
      expect(newNode.nodeType).toBe(NODE_TYPES.CON);
      // nodeValue is the St.Bin instance passed to createNode
      expect(newNode.nodeValue).toBe(containerBin);
    });

    it("should add node to parent children", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const before = monitor.childNodes.length;

      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());

      expect(monitor.childNodes).toHaveLength(before + 1);
    });

    it("should set node settings from tree", () => {
      const workspace = ctx.tree.nodeWorkpaces[0];
      const newNode = ctx.tree.createNode(workspace.nodeValue, NODE_TYPES.CON, new St.Bin());

      expect(newNode.settings).toBe(ctx.tree.settings);
    });

    it("should create node with default TILE mode", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      // WINDOW nodes get the default `mode` (TILE) assigned in createNode.
      const newNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());

      expect(newNode.mode).toBe(WINDOW_MODES.TILE);
    });

    it("should return undefined if parent not found", () => {
      const newNode = ctx.tree.createNode("nonexistent-parent", NODE_TYPES.CON, new St.Bin());

      expect(newNode).toBeUndefined();
    });

    it("fails closed without _allowGObjectCreateNode (D096 G8a)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const before = Array.isArray(monitor.childNodes) ? monitor.childNodes.length : 0;
      ctx.extWm._allowGObjectCreateNode = false;

      const denied = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());

      expect(denied).toBeNull();
      expect(Array.isArray(monitor.childNodes) ? monitor.childNodes.length : 0).toBe(before);

      ctx.extWm._allowGObjectCreateNode = true;
    });

    it("G8j: seeded TILES appendChild fail-closed without fixture allow", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const child = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());
      expect(monitor.childNodes).toContain(child);
      monitor.removeChild(child);
      expect(child.parentNode).toBeNull();

      ctx.extWm._liveForestSeeded = true;
      ctx.extWm._allowGObjectCreateNode = false;
      const before = monitor.childNodes.length;
      expect(monitor.appendChild(child)).toBeNull();
      expect(monitor.childNodes.length).toBe(before);
      expect(child.parentNode).toBeNull();

      ctx.extWm._allowGObjectCreateNode = true;
    });

    it("G8k: seeded split delegates fail-closed without Forest ids", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const win = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      ctx.extWm._liveForestSeeded = true;
      ctx.extWm._allowGObjectCreateNode = false;
      ctx.extWm.forest = ctx.extWm.forest || { nodes: {}, monitors: [] };
      expect(ctx.tree.split(win, ORIENTATION_TYPES.HORIZONTAL, true)).toBeNull();
      ctx.extWm._allowGObjectCreateNode = true;
    });

    it("should handle inserting after window parent", () => {
      // This tests the special case where parent is a window
      // Window's parent becomes the actual parent for the new node
      const { monitor } = getWorkspaceAndMonitor(ctx);

      // Create two nodes - second should be sibling to first, not child
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());

      expect(monitor.childNodes).toContain(node1);
      expect(monitor.childNodes).toContain(node2);
    });
  });

  describe("nodeWorkspaces", () => {
    it("should return all workspace nodes", () => {
      const workspaces = ctx.tree.nodeWorkpaces;

      expect(Array.isArray(workspaces)).toBe(true);
      workspaces.forEach((ws) => {
        expect(ws.nodeType).toBe(NODE_TYPES.WORKSPACE);
      });
    });

    it("should find workspaces initialized in constructor", () => {
      const workspaces = ctx.tree.nodeWorkpaces;

      // Should have at least one workspace (from mock returning 1)
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("nodeWindows", () => {
    it("should return empty array when no windows", () => {
      const windows = ctx.tree.nodeWindows;

      expect(Array.isArray(windows)).toBe(true);
      expect(windows.length).toBe(0);
    });

    it("should return all window nodes when windows exist", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const windowNode = ctx.tree.createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow()
      );

      const windows = ctx.tree.nodeWindows;
      expect(windows.length).toBe(1);
      expect(windows).toContain(windowNode);
    });
  });

  describe("addWorkspace", () => {
    it("should add new workspace", () => {
      ctx.workspaceManager.get_n_workspaces.mockReturnValue(2);
      ctx.workspaceManager.get_workspace_by_index.mockImplementation((i) => ({
        index: () => i,
      }));

      const initialCount = ctx.tree.nodeWorkpaces.length;
      const result = ctx.tree.addWorkspace(1);

      expect(result).toBe(true);
      expect(ctx.tree.nodeWorkpaces.length).toBe(initialCount + 1);
    });

    it("should not add duplicate workspace", () => {
      const initialCount = ctx.tree.nodeWorkpaces.length;

      // Try to add workspace that already exists (index 0)
      const result = ctx.tree.addWorkspace(0);

      expect(result).toBe(false);
      expect(ctx.tree.nodeWorkpaces.length).toBe(initialCount);
    });

    it("should set workspace layout to HSPLIT", () => {
      ctx.workspaceManager.get_n_workspaces.mockReturnValue(2);

      ctx.tree.addWorkspace(1);
      const workspace = ctx.tree.findNode("ws1");

      if (workspace) {
        expect(workspace.layout).toBe(LAYOUT_TYPES.HSPLIT);
      }
    });

    it("should create monitors for workspace", () => {
      ctx.workspaceManager.get_n_workspaces.mockReturnValue(2);
      global.display.get_n_monitors.mockReturnValue(2);

      ctx.tree.addWorkspace(1);
      const workspace = ctx.tree.findNode("ws1");

      if (workspace) {
        const monitors = workspace.getNodeByType(NODE_TYPES.MONITOR);
        expect(monitors.length).toBe(2);
      }
    });
  });

  describe("removeWorkspace", () => {
    it("should remove existing workspace", () => {
      const workspaces = ctx.tree.nodeWorkpaces;
      const initialCount = workspaces.length;

      if (initialCount > 0) {
        const result = ctx.tree.removeWorkspace(0);

        expect(result).toBe(true);
        expect(ctx.tree.nodeWorkpaces.length).toBe(initialCount - 1);
      }
    });

    it("should return false for non-existent workspace", () => {
      const result = ctx.tree.removeWorkspace(999);

      expect(result).toBe(false);
    });

    it("should remove workspace from tree", () => {
      const workspaces = ctx.tree.nodeWorkpaces;

      if (workspaces.length > 0) {
        ctx.tree.removeWorkspace(0);

        const found = ctx.tree.findNode("ws0");
        expect(found).toBeNull();
      }
    });
  });

  describe("Tree Structure Integrity", () => {
    it("should maintain parent-child relationships", () => {
      // forestAdmit spine is liveById/Forest; fixture forces GObject SoT off.
      ctx.extWm._liveForestSeeded = true;
      const workspace = ctx.tree.nodeWorkpaces[0];
      const monitors = workspace.getNodeByType(NODE_TYPES.MONITOR);

      monitors.forEach((monitor) => {
        expect(parentOf(ctx.extWm, monitor)).toBe(workspace);
      });
    });

    it("should have proper node hierarchy", () => {
      // Root -> Workspace -> Monitor -> (Containers/Windows)
      ctx.extWm._liveForestSeeded = true;
      expect(ctx.tree.nodeType).toBe(NODE_TYPES.ROOT);

      const workspaces = ctx.tree.getNodeByType(NODE_TYPES.WORKSPACE);
      workspaces.forEach((ws) => {
        expect(parentOf(ctx.extWm, ws)).toBe(ctx.tree);

        const monitors = ws.getNodeByType(NODE_TYPES.MONITOR);
        monitors.forEach((mon) => {
          expect(parentOf(ctx.extWm, mon)).toBe(ws);
        });
      });
    });

    it("should allow deep nesting", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const bin1 = new St.Bin();
      const bin2 = new St.Bin();
      const bin3 = new St.Bin();

      const container1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, bin1);
      const container2 = ctx.tree.createNode(bin1, NODE_TYPES.CON, bin2);
      const container3 = ctx.tree.createNode(bin2, NODE_TYPES.CON, bin3);

      expect(container3.level).toBe(container1.level + 2);
      // Find by the actual nodeValue (St.Bin instance)
      expect(ctx.tree.findNode(bin3)).toBe(container3);
    });
  });

  describe("CT1 skeleton placeholders", () => {
    it("createPlaceholderLeaf tags layoutSlot/layoutRole and survives cleanTree", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const tabCon = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new St.Bin());
      tabCon.layout = LAYOUT_TYPES.TABBED;
      const ph1 = ctx.tree.createPlaceholderLeaf(tabCon, {
        layoutSlot: "mon0.left-tab",
        layoutRole: "chrome-luke",
        reason: "layout-skeleton",
      });
      const ph2 = ctx.tree.createPlaceholderLeaf(tabCon, {
        layoutSlot: "mon0.left-tab",
        layoutRole: "grok",
        reason: "layout-skeleton",
      });
      const termPh = ctx.tree.createPlaceholderLeaf(monitor, {
        layoutSlot: "mon0.term",
        layoutRole: "ghostty-left",
        reason: "layout-skeleton",
      });
      expect(ph1.placeholder).toBe(true);
      expect(ph1.layoutRole).toBe("chrome-luke");
      expect(ph2.layoutSlot).toBe("mon0.left-tab");
      expect(termPh.layoutRole).toBe("ghostty-left");
      expect(tabCon.childNodes).toHaveLength(2);
      expect(monitor.childNodes.length).toBeGreaterThanOrEqual(2);

      // cleanTree must not strip slot-tagged PH leaves (non-empty CONs)
      ctx.tree.cleanTree();
      expect(tabCon.childNodes).toHaveLength(2);
      expect(isPlaceholderAlive(ctx.extWm, ph1)).toBe(true);
      expect(isPlaceholderAlive(ctx.extWm, ph2)).toBe(true);
      expect(isPlaceholderAlive(ctx.extWm, termPh)).toBe(true);

      // Bind-style replace: insert real window, drop PH (parent.removeChild path)
      const meta = createMockWindow({ id: 101, wm_class: "Google-chrome" });
      const real = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, meta);
      tabCon.insertBefore(real, ph1);
      tabCon.removeChild(ph1);
      expect(tabCon.childNodes).toContain(real);
      expect(tabCon.childNodes).not.toContain(ph1);
      expect(tabCon.childNodes).toContain(ph2);
    });
  });
});

function isPlaceholderAlive(wm, node) {
  return !!(node && parentOf(wm, node) && node.placeholder);
}
