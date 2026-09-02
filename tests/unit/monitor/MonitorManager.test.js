import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MonitorManager } from "../../../lib/extension/monitor.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { createHostBag } from "../../../lib/host/index.js";
import { createEnvelope, makeIdFactory } from "../../../lib/tom/index.js";
import { installGnomeGlobals } from "../../mocks/helpers/index.js";

/**
 * MonitorManager unit tests
 *
 * Tests for the MonitorManager class which handles monitor-related operations:
 * - addMonitor(): Create monitor nodes for a workspace
 * - getMonitorCount(): Get the number of monitors
 * - getMonitorNode(): Get monitor node by workspace/monitor index
 */
describe("MonitorManager", () => {
  let monitorManager;
  let mockTree;
  let mockExtWm;
  let ctx;

  beforeEach(() => {
    // Set up GNOME globals with 2 monitors (default geometry: 1920x1080 per monitor)
    ctx = installGnomeGlobals({
      display: { monitorCount: 2 },
    });

    mockTree = {
      nodeValue: "ROOT",
      nodeType: NODE_TYPES.ROOT,
      childNodes: [],
      parentNode: null,
      settings: {},
      createNode: vi.fn(),
      appendChild(child) {
        if (child?.parentNode?.removeChild) child.parentNode.removeChild(child);
        this.childNodes.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const i = this.childNodes.indexOf(child);
        if (i >= 0) this.childNodes.splice(i, 1);
        if (child) child.parentNode = null;
        return [child];
      },
      findNode(nodeValue) {
        const walk = (n) => {
          if (n.nodeValue === nodeValue) return n;
          for (const c of n.childNodes || []) {
            const hit = walk(c);
            if (hit) return hit;
          }
          return null;
        };
        return walk(this);
      },
    };

    mockExtWm = {
      determineSplitLayout: vi.fn(() => LAYOUT_TYPES.HSPLIT),
      determineSplitLayoutForRect: vi.fn((rect) =>
        rect && rect.width < rect.height ? LAYOUT_TYPES.VSPLIT : LAYOUT_TYPES.HSPLIT
      ),
      forest: createEnvelope(() => makeIdFactory().nid()),
      hostBag: createHostBag(),
      liveById: new Map(),
      _liveForestSeeded: false,
      _tree: mockTree,
      tree: mockTree,
    };

    monitorManager = new MonitorManager(mockTree, mockExtWm);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("getMonitorCount()", () => {
    it("should return the number of monitors from display", () => {
      expect(monitorManager.getMonitorCount()).toBe(2);
      expect(global.display.get_n_monitors).toHaveBeenCalled();
    });

    it("should return updated count when monitors change", () => {
      global.display.get_n_monitors.mockReturnValue(3);

      expect(monitorManager.getMonitorCount()).toBe(3);
    });

    it("should return 1 for single monitor setup", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      expect(monitorManager.getMonitorCount()).toBe(1);
    });
  });

  describe("addMonitor()", () => {
    it("invents Forest MONITOR without createNode", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      monitorManager.addMonitor(0);

      expect(mockTree.createNode).not.toHaveBeenCalled();
      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.ws0?.kind).toBe("WORKSPACE");
      expect(mockExtWm.liveById.get("mo0ws0")?.nodeValue).toBe("mo0ws0");
      expect(mockExtWm.hostBag.get("mo0ws0")?.actor).toBeTruthy();
    });

    it("should create monitor nodes for all monitors", () => {
      global.display.get_n_monitors.mockReturnValue(2);

      monitorManager.addMonitor(0);

      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws0?.kind).toBe("MONITOR");
      expect(mockTree.createNode).not.toHaveBeenCalled();
    });

    it("should set layout on monitor nodes", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      monitorManager.addMonitor(0);

      expect(mockExtWm.liveById.get("mo0ws0").layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should create actorBin for each monitor node", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      monitorManager.addMonitor(0);

      expect(mockExtWm.liveById.get("mo0ws0").actorBin).toBeDefined();
    });

    it("should add actorBin to window_group", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      monitorManager.addMonitor(0);

      expect(global.window_group.add_child).toHaveBeenCalled();
    });

    it("should not add duplicate actorBin to window_group", () => {
      global.display.get_n_monitors.mockReturnValue(1);
      global.window_group.contains.mockReturnValue(true);

      monitorManager.addMonitor(0);

      expect(global.window_group.add_child).not.toHaveBeenCalled();
    });

    it("should use correct naming convention: mo{monitorIndex}ws{workspaceIndex}", () => {
      global.display.get_n_monitors.mockReturnValue(3);

      monitorManager.addMonitor(2);

      expect(mockExtWm.forest.nodes.mo0ws2?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws2?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo2ws2?.kind).toBe("MONITOR");
    });

    it("should determine split layout per monitor using each monitor's geometry", () => {
      global.display.get_n_monitors.mockReturnValue(2);

      monitorManager.addMonitor(0);

      expect(mockExtWm.determineSplitLayoutForRect).toHaveBeenCalledTimes(2);
      expect(global.display.get_monitor_geometry).toHaveBeenCalledWith(0);
      expect(global.display.get_monitor_geometry).toHaveBeenCalledWith(1);
    });
  });

  describe("getMonitorNode()", () => {
    beforeEach(() => {
      global.display.get_n_monitors.mockReturnValue(2);
      monitorManager.addMonitor(0);
      monitorManager.addMonitor(1);
    });

    it("should find monitor node by workspace and monitor index", () => {
      const node = monitorManager.getMonitorNode(0, 0);

      expect(node).toBeDefined();
      expect(node.nodeValue).toBe("mo0ws0");
    });

    it("should find monitor node on different workspace", () => {
      const node = monitorManager.getMonitorNode(1, 0);

      expect(node.nodeValue).toBe("mo0ws1");
    });

    it("should find second monitor on workspace", () => {
      const node = monitorManager.getMonitorNode(0, 1);

      expect(node.nodeValue).toBe("mo1ws0");
    });

    it("should return null for non-existent monitor node", () => {
      const node = monitorManager.getMonitorNode(99, 0);

      expect(node).toBeNull();
    });

    it("should return null for non-existent monitor index", () => {
      const node = monitorManager.getMonitorNode(0, 99);

      expect(node).toBeNull();
    });
  });

  describe("multi-monitor scenarios", () => {
    it("should handle single monitor setup", () => {
      global.display.get_n_monitors.mockReturnValue(1);

      monitorManager.addMonitor(0);

      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
    });

    it("should handle dual monitor setup", () => {
      global.display.get_n_monitors.mockReturnValue(2);

      monitorManager.addMonitor(0);

      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws0?.kind).toBe("MONITOR");
    });

    it("should handle triple monitor setup", () => {
      global.display.get_n_monitors.mockReturnValue(3);

      monitorManager.addMonitor(0);

      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo2ws0?.kind).toBe("MONITOR");
    });

    it("should create monitors for multiple workspaces", () => {
      global.display.get_n_monitors.mockReturnValue(2);

      monitorManager.addMonitor(0);
      monitorManager.addMonitor(1);
      monitorManager.addMonitor(2);

      expect(mockExtWm.forest.nodes.mo0ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws0?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo0ws1?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws1?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo0ws2?.kind).toBe("MONITOR");
      expect(mockExtWm.forest.nodes.mo1ws2?.kind).toBe("MONITOR");
    });
  });
});
