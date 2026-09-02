import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TAB_DRAG_THRESHOLD_PX,
  tabDragExceededThreshold,
} from "../../../lib/extension/drag-drop.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { NODE_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { GrabOp } from "../../mocks/gnome/Meta.js";

/**
 * LX4: tab chrome drag threshold + synthetic grab-tile arming.
 */
describe("tab drag threshold (pure)", () => {
  it("does not start under threshold", () => {
    expect(tabDragExceededThreshold(100, 100, 100 + TAB_DRAG_THRESHOLD_PX - 1, 100)).toBe(false);
    expect(tabDragExceededThreshold(0, 0, 0, 0)).toBe(false);
  });

  it("starts at exact threshold distance (axis-aligned)", () => {
    expect(tabDragExceededThreshold(0, 0, TAB_DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(tabDragExceededThreshold(0, 0, 0, TAB_DRAG_THRESHOLD_PX)).toBe(true);
  });

  it("starts for diagonal travel past threshold", () => {
    // 6²+6² = 72 > 64 (threshold 8)
    expect(tabDragExceededThreshold(0, 0, 6, 6)).toBe(true);
  });

  it("honors custom threshold", () => {
    expect(tabDragExceededThreshold(0, 0, 3, 0, 4)).toBe(false);
    expect(tabDragExceededThreshold(0, 0, 4, 0, 4)).toBe(true);
  });
});

describe("DragDropManager tab drag arm → synthetic grab", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "preview-hint-enabled": false,
        "dnd-center-layout": "TABBED",
      },
    });
  });

  const wm = () => ctx.windowManager;
  const dd = () => wm().dragDrop;

  function makePressEvent(x, y) {
    return {
      get_coords: () => [x, y],
      get_button: () => 1,
      get_time: () => 1,
      get_device: () => null,
    };
  }

  it("arm + short release does not enter GRAB_TILE", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);

    const armed = dd().armTabDrag(meta, makePressEvent(50, 50));
    expect(armed).toBe(true);
    expect(dd().noteTabDragMotion(52, 50)).toBe("armed");
    dd().finishTabDragRelease();
    expect(node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
  });

  it("motion past threshold starts synthetic GRAB_TILE when begin_grab_op missing", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    // No begin_grab_op → synthetic path
    delete meta.begin_grab_op;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    setPointer(50, 50);
    // Fixture has null keybindings; grab-end drop gate is not under test here.
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    dd().armTabDrag(meta, makePressEvent(50, 50));
    const status = dd().noteTabDragMotion(50 + TAB_DRAG_THRESHOLD_PX + 2, 50);
    expect(status).toBe("active");
    expect(node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(wm()._draggedNodeWindow).toBe(node);
    expect(wm().grabOp).toBe(GrabOp.MOVING_UNCONSTRAINED);

    setPointer(300, 300);
    dd().finishTabDragRelease();
    expect(node.mode).toBe(WINDOW_MODES.TILE);
    expect(dd()._tabDrag).toBeNull();
    expect(wm().grabOp).toBeNull();
  });

  it("PR10: begin_grab_op true still uses synthetic GRAB_TILE (tab chrome peel)", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    // Host Wayland: begin_grab_op can return true without grab-op-begin.
    // Tab peel must not trust that as ownership (PR10).
    meta.begin_grab_op = vi.fn(() => true);
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    const device = { id: "pointer-dev" };
    const press = makePressEvent(10, 10);
    press.get_device = () => device;
    dd().armTabDrag(meta, press);
    expect(dd()._tabDrag?.device).toBe(device);
    const status = dd().noteTabDragMotion(10 + TAB_DRAG_THRESHOLD_PX + 1, 10);
    expect(status).toBe("active");
    // Forge owns peel: GRAB_TILE now, not wait-for-Mutter.
    expect(node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(dd()._tabDrag?.synthetic).toBe(true);
    expect(meta.begin_grab_op).not.toHaveBeenCalled();
    dd().finishTabDragRelease();
    expect(dd()._tabDrag).toBeNull();
    expect(node.mode).toBe(WINDOW_MODES.TILE);
  });

  it("PR13: synthetic peel getDragPointer returns event coords, not parked pointer", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    meta.begin_grab_op = vi.fn(() => true);
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    setPointer(10, 10);
    dd().armTabDrag(meta, makePressEvent(10, 10));
    expect(dd().noteTabDragMotion(10 + TAB_DRAG_THRESHOLD_PX + 1, 10)).toBe("active");
    expect(node.mode).toBe(WINDOW_MODES.GRAB_TILE);
    expect(meta.begin_grab_op).not.toHaveBeenCalled();

    setPointer(10, 10);
    expect(dd().noteTabDragMotion(320, 240)).toBe("active");
    const ptr = dd().getDragPointer(node);
    expect(ptr[0]).toBe(320);
    expect(ptr[1]).toBe(240);
    dd().finishTabDragRelease();
    expect(dd()._syntheticDragPointer).toBeNull();
  });

  it("does not arm when tiling mode is disabled", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 100, height: 100 }),
      workspace: ctx.workspaces[0],
    });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);

    const orig = wm().ext.settings.get_boolean;
    wm().ext.settings.get_boolean = vi.fn((key) => {
      if (key === "tiling-mode-enabled") return false;
      return orig.call(wm().ext.settings, key);
    });

    expect(dd().armTabDrag(meta, makePressEvent(0, 0))).toBe(false);
  });

  it("stage owner keeps tracking after pointer leaves the tab actor", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    delete meta.begin_grab_op;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    // Mock stage capture like Shell: arm registers captured-event.
    const handlers = [];
    global.stage = {
      connect: (_sig, cb) => {
        handlers.push(cb);
        return handlers.length;
      },
      disconnect: () => {},
    };

    dd().armTabDrag(meta, makePressEvent(50, 50));
    expect(handlers.length).toBe(1);

    // Fast leave: motion far from the tab actor, delivered only via stage.
    const motion = {
      type: () => "motion",
      get_coords: () => [50 + TAB_DRAG_THRESHOLD_PX + 40, 200],
      get_button: () => 1,
    };
    const stop = handlers[0](null, motion);
    expect(stop).toBeTruthy();
    expect(dd()._tabDrag?.lastX).toBe(50 + TAB_DRAG_THRESHOLD_PX + 40);
    expect(dd()._tabDrag?.lastY).toBe(200);

    const release = {
      type: () => "button-release",
      get_coords: () => [400, 300],
      get_button: () => 1,
    };
    handlers[0](null, release);
    expect(dd()._tabDrag).toBeNull();
  });

  it("pointer poll updates chip when stage motion is silent", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    delete meta.begin_grab_op;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    // No stage.connect → poll must carry the gesture alone.
    global.stage = { connect: undefined, disconnect: () => {} };

    const setSpy = vi.spyOn(wm()._wmSources, "set");
    setPointer(10, 10);
    dd().armTabDrag(meta, makePressEvent(10, 10));
    expect(wm()._wmSources.has("tabDragPointer")).toBe(true);

    const pollCall = setSpy.mock.calls.find((c) => c[0] === "tabDragPointer");
    expect(pollCall).toBeTruthy();
    const tick = pollCall[2];
    setPointer(10 + TAB_DRAG_THRESHOLD_PX + 5, 80);
    tick();

    expect(dd()._tabDrag?.lastX).toBe(10 + TAB_DRAG_THRESHOLD_PX + 5);
    expect(dd()._tabDrag?.lastY).toBe(80);
    dd().finishTabDragRelease();
    expect(wm()._wmSources.has("tabDragPointer")).toBe(false);
  });

  it("pointer poll skips noteTabDragMotion when xy already synced", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    delete meta.begin_grab_op;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);

    global.stage = { connect: undefined, disconnect: () => {} };
    const setSpy = vi.spyOn(wm()._wmSources, "set");
    setPointer(40, 40, 256);
    dd().armTabDrag(meta, makePressEvent(40, 40));
    const tick = setSpy.mock.calls.find((c) => c[0] === "tabDragPointer")[2];
    const motionSpy = vi.spyOn(dd(), "noteTabDragMotion");

    // Same coords as arm lastX/Y — must not re-enter motion (starve fix).
    setPointer(40, 40, 256);
    tick();
    expect(motionSpy).not.toHaveBeenCalled();

    setPointer(40 + TAB_DRAG_THRESHOLD_PX + 1, 40, 256);
    tick();
    expect(motionSpy).toHaveBeenCalledTimes(1);
    dd().finishTabDragRelease();
  });

  it("pointer poll finishes gesture when primary button goes up after down", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    delete meta.begin_grab_op;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(false);

    global.stage = { connect: undefined, disconnect: () => {} };
    const setSpy = vi.spyOn(wm()._wmSources, "set");
    setPointer(10, 10, 0);
    // Press event carries BUTTON1_MASK so arm marks seenPrimaryDown.
    const press = makePressEvent(10, 10);
    press.get_state = () => 256;
    dd().armTabDrag(meta, press);
    expect(dd()._tabDrag?.seenPrimaryDown).toBe(true);

    const tick = setSpy.mock.calls.find((c) => c[0] === "tabDragPointer")[2];
    setPointer(10 + TAB_DRAG_THRESHOLD_PX + 20, 60, 256);
    tick();
    expect(dd()._tabDrag).toBeTruthy();

    // Release missed by stage: mods clear → poll ends gesture.
    setPointer(10 + TAB_DRAG_THRESHOLD_PX + 20, 60, 0);
    tick();
    expect(dd()._tabDrag).toBeNull();
    expect(wm()._wmSources.has("tabDragPointer")).toBe(false);
  });
});
