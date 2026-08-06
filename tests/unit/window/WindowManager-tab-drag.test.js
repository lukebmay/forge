import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TAB_DRAG_THRESHOLD_PX,
  tabDragExceededThreshold,
} from "../../../lib/extension/drag-drop.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
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

  it("uses begin_grab_op when present and does not force synthetic", () => {
    const meta = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 400, height: 400 }),
      workspace: ctx.workspaces[0],
    });
    meta.begin_grab_op = vi.fn(() => true);
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    ctx.display.get_focus_window = vi.fn(() => meta);

    dd().armTabDrag(meta, makePressEvent(10, 10));
    const status = dd().noteTabDragMotion(10 + TAB_DRAG_THRESHOLD_PX + 1, 10);
    expect(status).toBe("started");
    expect(meta.begin_grab_op).toHaveBeenCalled();
    // Mutter would emit grab-op-begin; we do not synthesize GRAB_TILE here.
    expect(node.mode).toBe(WINDOW_MODES.TILE);
    dd().finishTabDragRelease();
    expect(dd()._tabDrag).toBeNull();
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
});
