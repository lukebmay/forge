import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { LAYOUT_TYPES, NODE_TYPES, Node, Tree } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  createWindowNode,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { MotionDirection, Workspace, WindowType } from "../../mocks/gnome/Meta.js";
import { agree } from "../../../lib/agree/index.js";
import { observeReality } from "../../../lib/extension/observe-reality.js";
import { ancestorMonitor } from "../../../lib/tom/index.js";
import { Logger } from "../../../lib/shared/logger.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import { metricsSnapshot, resetMetrics } from "../../../lib/extension/metrics.js";

/**
 * WindowManager lifecycle tests
 *
 * Tests for window lifecycle management including:
 * - trackWindow(): Adding windows to the tree
 * - windowDestroy(): Removing windows and cleanup
 * - minimizedWindow(): Minimize state checking
 * - postProcessWindow(): Post-creation processing
 */
describe("WindowManager - Window Lifecycle", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
    resetMetrics();
  });

  // Convenience accessor for tests
  const wm = () => ctx.windowManager;

  describe("live tree root (G8n)", () => {
    it("adapter tree is LiveHandle ROOT with managers, not GObject Tree", () => {
      const tree = wm().tree;
      expect(tree.nodeType).toBe(NODE_TYPES.ROOT);
      expect(tree.isRoot()).toBe(true);
      expect(tree.monitorManager).toBeTruthy();
      expect(tree.workspaceManager).toBeTruthy();
      expect(tree.extWm).toBe(wm());
      expect(wm().liveById.get("ROOT")).toBe(tree);
      expect(Object.getPrototypeOf(tree)).toBe(Object.prototype);
      expect(tree.addWorkspace).not.toBe(Tree.prototype.addWorkspace);
      expect(tree._initWorkspaces).not.toBe(Tree.prototype._initWorkspaces);
      expect(Object.getOwnPropertyDescriptor(tree, "monitorManager")?.get).not.toBe(
        Object.getOwnPropertyDescriptor(Tree.prototype, "monitorManager")?.get
      );
      expect(tree.appendChild).not.toBe(Node.prototype.appendChild);
      expect(tree.insertBefore).not.toBe(Node.prototype.insertBefore);
      expect(Object.getOwnPropertyDescriptor(tree, "index")?.get).not.toBe(
        Object.getOwnPropertyDescriptor(Node.prototype, "index")?.get
      );
      expect(Object.getOwnPropertyDescriptor(tree, "level")?.get).not.toBe(
        Object.getOwnPropertyDescriptor(Node.prototype, "level")?.get
      );
      expect(typeof tree.move).toBe("function");
      expect(typeof tree.moveIn).toBe("function");
      expect(typeof tree.moveOut).toBe("function");
      expect(tree.move).not.toBe(Tree.prototype.move);
      expect(tree.moveIn).not.toBe(Tree.prototype.moveIn);
      expect(tree.moveOut).not.toBe(Tree.prototype.moveOut);
    });

    it("finds workspace spine via liveById", () => {
      const ws = wm().tree.findNode("ws0");
      expect(ws).toBeTruthy();
      expect(ws.nodeType).toBe(NODE_TYPES.WORKSPACE);
    });
  });

  describe("minimizedWindow", () => {
    it("should return false for non-minimized window", () => {
      const metaWindow = createMockWindow({ minimized: false });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const result = wm().minimizedWindow(nodeWindow);

      expect(result).toBe(false);
    });

    it("should return true for minimized window", () => {
      const metaWindow = createMockWindow({ minimized: true });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const result = wm().minimizedWindow(nodeWindow);

      expect(result).toBe(true);
    });
  });

  describe("postProcessWindow", () => {
    it("does not center or warp the pointer for a regular window (forge-f081)", () => {
      const metaWindow = createMockWindow({ title: "Regular Window" });
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const movePointerSpy = vi.spyOn(wm(), "movePointerWith");
      const moveCenterSpy = vi.spyOn(wm(), "moveCenter");

      wm().postProcessWindow(nodeWindow);

      // The old movePointerWith(metaWindow) call was a dead no-op (wrong arg type)
      // and has been removed; a regular window is left for the focus path to warp.
      expect(moveCenterSpy).not.toHaveBeenCalled();
      expect(movePointerSpy).not.toHaveBeenCalled();
    });

    it("should center and activate preferences window", () => {
      wm().prefsTitle = "Forge Preferences";
      const metaWindow = createMockWindow({ title: "Forge Preferences" });

      const mockWorkspace = new Workspace({ index: 0 });
      metaWindow._workspace = mockWorkspace;
      mockWorkspace.activate_with_focus = vi.fn();

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const moveCenterSpy = vi.spyOn(wm(), "moveCenter");

      wm().postProcessWindow(nodeWindow);

      expect(mockWorkspace.activate_with_focus).toHaveBeenCalledWith(metaWindow, expect.anything());
      expect(moveCenterSpy).toHaveBeenCalledWith(metaWindow);
    });

    it("should not move pointer for preferences window", () => {
      wm().prefsTitle = "Forge Preferences";
      const metaWindow = createMockWindow({ title: "Forge Preferences" });

      const mockWorkspace = new Workspace({ index: 0 });
      metaWindow._workspace = mockWorkspace;
      mockWorkspace.activate_with_focus = vi.fn();

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const movePointerSpy = vi.spyOn(wm(), "movePointerWith");

      wm().postProcessWindow(nodeWindow);

      expect(movePointerSpy).not.toHaveBeenCalled();
    });
  });

  describe("trackWindow", () => {
    it("should not track invalid window types", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.MENU });
      const treeCreateSpy = vi.spyOn(ctx.tree, "createNode");

      wm().trackWindow(null, metaWindow);

      // Should not create node for invalid window type
      expect(treeCreateSpy).not.toHaveBeenCalled();
    });

    it("should not track duplicate windows", () => {
      const metaWindow = createMockWindow();
      const { monitor } = getWorkspaceAndMonitor(ctx);

      // Create window first time
      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const treeCreateSpy = vi.spyOn(ctx.tree, "createNode");

      // Try to track same window again
      wm().trackWindow(null, metaWindow);

      // Should not create duplicate node
      expect(treeCreateSpy).not.toHaveBeenCalled();
    });

    it("should track valid NORMAL windows", () => {
      const metaWindow = createMockWindow({
        window_type: WindowType.NORMAL,
        title: "Test Window",
      });

      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nodeWindow).not.toBeNull();
      expect(nid).toBeTruthy();
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      expect(wm().liveById?.has(nid)).toBe(true);
    });

    it("should track valid DIALOG windows", () => {
      const parent = createMockWindow({ title: "Parent" });
      const metaWindow = createMockWindow({
        window_type: WindowType.DIALOG,
        title: "Dialog Window",
        transient_for: parent,
      });

      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).not.toBeNull();
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      expect(wm().hostBag.get(nid)?.floating).toBe(true);
    });

    it("should track valid MODAL_DIALOG windows", () => {
      const parent = createMockWindow({ title: "Parent" });
      const metaWindow = createMockWindow({
        window_type: WindowType.MODAL_DIALOG,
        title: "Modal Dialog",
        transient_for: parent,
      });

      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).not.toBeNull();
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      expect(wm().hostBag.get(nid)?.floating).toBe(true);
    });

    it("should TILE after map RESYNC for normal opens", () => {
      const metaWindow = createMockWindow();

      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nodeWindow).not.toBeNull();
      expect(nodeWindow.mode).toBe(WINDOW_MODES.TILE);
      expect(wm().hostBag.get(nid)?.floating).toBe(false);
    });

    it("should attach window to current monitor/workspace", () => {
      const metaWindow = createMockWindow();

      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).not.toBeNull();

      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(ancestorMonitor(wm().forest, wm().forest.nodes[nid])?.id).toBe(monitor.nodeValue);
    });

    it("willTile map places to Forest slot and consumes firstRender", () => {
      const metaWindow = createMockWindow();
      const moveSpy = vi.spyOn(wm(), "move");

      wm().trackWindow(null, metaWindow);

      expect(moveSpy).toHaveBeenCalled();
      expect(metaWindow.firstRender).toBe(false);
    });
  });

  describe("windowDestroy", () => {
    it("should remove borders from actor", () => {
      const metaWindow = createMockWindow();
      const { monitor } = getWorkspaceAndMonitor(ctx);
      ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const actor = metaWindow.get_compositor_private();
      const border = { hide: vi.fn(), destroy: vi.fn() };
      const splitBorder = { hide: vi.fn(), destroy: vi.fn() };
      actor.border = border;
      actor.splitBorder = splitBorder;
      ctx.windowGroup.add_child(border);
      ctx.windowGroup.add_child(splitBorder);

      const removeChildSpy = vi.spyOn(ctx.windowGroup, "remove_child");

      wm().windowDestroy(actor);

      expect(removeChildSpy).toHaveBeenCalledWith(border);
      expect(removeChildSpy).toHaveBeenCalledWith(splitBorder);
      expect(border.hide).toHaveBeenCalled();
      expect(splitBorder.hide).toHaveBeenCalled();
    });

    it("should remove window node from tree", () => {
      const metaWindow = createMockWindow();
      wm().trackWindow(null, metaWindow);
      expect(wm().findNodeWindow(metaWindow)).toBeTruthy();

      const actor = metaWindow.get_compositor_private();
      wm().windowDestroy(actor);

      expect(wm().findNodeWindow(metaWindow)).toBeFalsy();
      expect(wm().hostBag.idFromMeta(metaWindow)).toBeFalsy();
    });

    it("should not remove non-window nodes", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const actor = { border: null, splitBorder: null };

      // Mock findNodeByActor to return monitor (non-window node)
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(monitor);

      const initialNodeCount = ctx.tree.getNodeByType(NODE_TYPES.MONITOR).length;

      wm().windowDestroy(actor);

      const finalNodeCount = ctx.tree.getNodeByType(NODE_TYPES.MONITOR).length;
      // Monitor should not be removed
      expect(finalNodeCount).toBe(initialNodeCount);
    });

    it("should remove float override for destroyed window", () => {
      const metaWindow = createMockWindow();
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const actor = metaWindow.get_compositor_private();
      actor.nodeWindow = nodeWindow;

      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(nodeWindow);
      const removeOverrideSpy = vi.spyOn(wm(), "removeFloatOverride");

      wm().windowDestroy(actor);

      expect(removeOverrideSpy).toHaveBeenCalledWith(metaWindow, true);
    });

    it("should queue render event after destruction", () => {
      const metaWindow = createMockWindow();
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const nodeWindow = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow);

      const actor = metaWindow.get_compositor_private();
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(nodeWindow);
      const queueEventSpy = vi.spyOn(wm(), "queueEvent");

      wm().windowDestroy(actor);

      expect(queueEventSpy).toHaveBeenCalledWith({
        name: "window-destroy",
        callback: expect.any(Function),
      });
    });
  });

  describe("Window Lifecycle Integration", () => {
    it("should track and then destroy window", () => {
      const metaWindow = createMockWindow({ title: "Test Window" });

      // Track window
      wm().trackWindow(null, metaWindow);

      let nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).not.toBeNull();
      expect(nodeWindow.mode).toBe(WINDOW_MODES.TILE);

      // Destroy window
      const actor = metaWindow.get_compositor_private();
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(nodeWindow);
      wm().windowDestroy(actor);

      // Window should be removed from tree
      nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).toBeNull();
    });

    it("C3.5 trackWindow inserts Forest WINDOW; destroy clears hostBag", () => {
      const metaWindow = createMockWindow({ title: "Forest Win" });
      wm().trackWindow(null, metaWindow);

      const nodeWindow = wm().findNodeWindow(metaWindow);
      expect(nodeWindow).not.toBeNull();
      expect(wm().hostBag).toBeTruthy();
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nid).toBeTruthy();
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      expect(wm().liveById?.get(nid)).toBe(nodeWindow);

      const actor = metaWindow.get_compositor_private();
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(nodeWindow);
      wm().windowDestroy(actor);

      expect(wm().hostBag.has(nid)).toBe(false);
      expect(wm().forest?.nodes?.[nid]).toBeUndefined();
      expect(wm().liveById?.has(nid)).toBe(false);
    });

    it("D096 windowDestroy clears Forest when GObject walk misses (detached live)", () => {
      const metaWindow = createMockWindow({ title: "Detached Win" });
      wm().trackWindow(null, metaWindow);
      const nodeWindow = wm().findNodeWindow(metaWindow);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nid).toBeTruthy();
      expect(nodeWindow).toBeTruthy();

      // Simulate Forest-only join: live leaves GObject child-list.
      nodeWindow.parentNode = null;
      const actor = metaWindow.get_compositor_private();
      actor.meta_window = metaWindow;
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(undefined);

      wm().windowDestroy(actor);

      expect(wm().hostBag.has(nid)).toBe(false);
      expect(wm().forest?.nodes?.[nid]).toBeUndefined();
      expect(wm().liveById?.has(nid)).toBe(false);
    });

    it("R6 windowDestroy does not rebuild Forest from GObject", () => {
      const metaWindow = createMockWindow({ title: "Forest Win" });
      wm().trackWindow(null, metaWindow);
      const nodeWindow = wm().findNodeWindow(metaWindow);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      const forest = wm().forest;
      expect(forest).toBeTruthy();

      const actor = metaWindow.get_compositor_private();
      vi.spyOn(ctx.tree, "findNodeByActor").mockReturnValue(nodeWindow);
      wm().windowDestroy(actor);

      expect(wm().forest).toBe(forest);
      expect(wm().forest.nodes[nid]).toBeUndefined();
    });

    it("R6 trackCurrentWindows does not rebuild Forest when seeded", () => {
      const metaWindow = createMockWindow({ title: "Retrack" });
      wm().trackWindow(null, metaWindow);
      const forest = wm().forest;
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(forest).toBeTruthy();
      expect(nid).toBeTruthy();

      Object.defineProperty(wm(), "windowsAllWorkspaces", {
        get: () => [metaWindow],
        configurable: true,
      });
      wm().trackCurrentWindows();

      expect(wm().forest).toBe(forest);
      expect(wm().forest.nodes[nid]?.kind).toBe("WINDOW");
    });

    it("R6 swapPairs Forest-first does not rebuild Forest from GObject", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const { nodeWindow: nodeA, metaWindow: winA } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, title: "A" },
      });
      const { nodeWindow: nodeB, metaWindow: winB } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, title: "B" },
      });
      const forest = wm().forest;
      const idA = wm().hostBag.idFromMeta(winA);
      const idB = wm().hostBag.idFromMeta(winB);
      const parentId = forest.nodes[idA].parentId;

      ctx.tree.swapPairs(nodeA, nodeB, false);

      expect(wm().forest).toBe(forest);
      expect(forest.nodes[parentId].childIds).toEqual([idB, idA]);
    });

    it("R6 swapPairs id-miss fails closed (no GObject twin / no Forest rebuild)", () => {
      resetMetrics();
      vi.spyOn(Logger, "warn").mockImplementation(() => {});
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const { nodeWindow: nodeA, metaWindow: winA } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, title: "A" },
      });
      const { nodeWindow: nodeB, metaWindow: winB } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, title: "B" },
      });
      const idA = wm().hostBag.idFromMeta(winA);
      const idB = wm().hostBag.idFromMeta(winB);
      const parentId = wm().forest.nodes[idA].parentId;
      const before = [...wm().forest.nodes[parentId].childIds];
      delete wm().forest.nodes[idA];
      const forest = wm().forest;

      const ok = ctx.tree.swapPairs(nodeA, nodeB, false);

      expect(ok).toBe(false);
      expect(wm().forest).toBe(forest);
      expect(metricsSnapshot().fallbacks).toBe(0);
      expect(forest.nodes[parentId].childIds).toEqual(before);
      expect(forest.nodes[idB]).toBeTruthy();
      expect(forest.nodes[idA]).toBeUndefined();
    });

    it("R6 tree.move sibling swap does not rebuild Forest after Forest-first swapPairs", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const { nodeWindow: nodeA, metaWindow: winA } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, title: "A" },
      });
      const { nodeWindow: nodeB, metaWindow: winB } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, title: "B" },
      });
      const forest = wm().forest;
      const idA = wm().hostBag.idFromMeta(winA);
      const idB = wm().hostBag.idFromMeta(winB);
      const parentId = forest.nodes[idA].parentId;

      const moved = ctx.tree.move(nodeA, MotionDirection.RIGHT);
      expect(moved).toBe(true);
      expect(wm().forest).toBe(forest);
      expect(forest.nodes[parentId].childIds).toEqual([idB, idA]);
    });

    it("R3 trackWindow admits Forest WINDOW then RESYNC AGREEs", () => {
      vi.spyOn(Logger, "info").mockImplementation(() => {});
      const metaWindow = createMockWindow({ title: "Map Win" });
      wm().trackWindow(null, metaWindow);

      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nid).toBeTruthy();
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      expect(wm().hostBag.get(nid)?.floating).toBe(false);
      expect(agree(wm().forest, observeReality(wm())).ok).toBe(true);
      const resyncCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric resync");
      expect(resyncCall?.[1]?.fields?.reason).toBe("window-map");
    });

    it("R3 dock open uses dock-open RESYNC reason", () => {
      vi.spyOn(Logger, "info").mockImplementation(() => {});
      const metaWindow = createMockWindow({ title: "Dock Win" });
      metaWindow._forgeDockMonitor = 0;
      wm().trackWindow(null, metaWindow);

      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nid).toBeTruthy();
      expect(wm().forest?.nodes?.[nid]?.kind).toBe("WINDOW");
      const resyncCall = Logger.info.mock.calls.find((c) => String(c[0]) === "metric resync");
      expect(resyncCall?.[1]?.fields?.reason).toBe("dock-open");
    });

    it("R3 entered-monitor does not rehome (D100 observe-only)", () => {
      ctx.cleanup();
      ctx = createWindowManagerFixture({ globals: { display: { monitorCount: 2 } } });

      const metaWindow = createMockWindow({
        title: "Rehome Win",
        workspace: ctx.workspaces[0],
        monitor: 0,
      });
      wm().trackWindow(null, metaWindow);
      const nid = wm().hostBag.idFromMeta(metaWindow);
      expect(nid).toBeTruthy();
      const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
      const homeBefore = ancestorMonitor(wm().forest, wm().forest.nodes[nid])?.id;
      expect(homeBefore).toBe(mon0.nodeValue);

      const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor");
      metaWindow._forgeDockStickyUntil = 0;
      metaWindow._forgeDockStickyMon = undefined;
      metaWindow._monitor = 1;
      wm()._onWindowEnteredMonitor(ctx.display, 1, metaWindow);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(ancestorMonitor(wm().forest, wm().forest.nodes[nid])?.id).toBe(homeBefore);
    });

    it("should handle window minimize state throughout lifecycle", () => {
      const metaWindow = createMockWindow({ minimized: false });

      // Track window
      wm().trackWindow(null, metaWindow);
      let nodeWindow = wm().findNodeWindow(metaWindow);

      // Initially not minimized
      expect(wm().minimizedWindow(nodeWindow)).toBe(false);

      // Minimize window
      metaWindow.minimized = true;
      expect(wm().minimizedWindow(nodeWindow)).toBe(true);

      // Unminimize window
      metaWindow.minimized = false;
      expect(wm().minimizedWindow(nodeWindow)).toBe(false);
    });

    it("post-processes a tracked regular window without warping the pointer", () => {
      const metaWindow = createMockWindow({ title: "Regular Window" });
      const movePointerSpy = vi.spyOn(wm(), "movePointerWith");

      // Track window
      wm().trackWindow(null, metaWindow);
      const nodeWindow = wm().findNodeWindow(metaWindow);

      // Post-process — the dead movePointerWith(metaWindow) call was removed (forge-f081).
      wm().postProcessWindow(nodeWindow);

      expect(nodeWindow).toBeTruthy();
      expect(movePointerSpy).not.toHaveBeenCalled();
    });
  });

  describe("_validWindow", () => {
    it("should accept NORMAL window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.NORMAL });
      expect(wm()._validWindow(metaWindow)).toBe(true);
    });

    it("should accept DIALOG window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.DIALOG });
      expect(wm()._validWindow(metaWindow)).toBe(true);
    });

    it("should accept MODAL_DIALOG window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.MODAL_DIALOG });
      expect(wm()._validWindow(metaWindow)).toBe(true);
    });

    it("should reject UTILITY window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.UTILITY });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject POPUP_MENU window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.POPUP_MENU });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject DROPDOWN_MENU window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.DROPDOWN_MENU });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject TOOLTIP window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.TOOLTIP });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject xwaylandvideobridge windows", () => {
      const metaWindow = createMockWindow({
        window_type: WindowType.NORMAL,
        wm_class: "Xwaylandvideobridge",
      });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject ddterm windows", () => {
      const metaWindow = createMockWindow({
        window_type: WindowType.NORMAL,
        wm_class: "com.github.amezin.ddterm",
      });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });

    it("should reject DESKTOP window type", () => {
      const metaWindow = createMockWindow({ window_type: WindowType.DESKTOP });
      expect(wm()._validWindow(metaWindow)).toBe(false);
    });
  });
});
