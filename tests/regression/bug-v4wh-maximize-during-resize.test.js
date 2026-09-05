import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WINDOW_MODES, GRAB_TYPES } from "../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";
import { Rectangle, GrabOp } from "../mocks/gnome/Meta.js";

/**
 * Keyboard-resize grab: maximize must not bake the full-monitor frame into
 * the split. Restore the Forest slot (50/50 → 960). D026 idle restore is off.
 */
describe("forge-v4wh: maximize during keyboard-resize debounce keeps percents", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({ settings: { "tiling-mode-enabled": true } });
    global.Meta = { ...(global.Meta || {}), GrabOp };
  });

  afterEach(() => {
    ctx.cleanup();
    delete global.Meta;
  });

  function buildResizingSplit() {
    const metaWindow1 = createMockWindow({
      rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      workspace: ctx.workspaces[0],
    });
    const metaWindow2 = createMockWindow({
      rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
      workspace: ctx.workspaces[0],
    });

    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };

    const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow1);
    node1.mode = WINDOW_MODES.TILE;
    node1.percent = 0.5;
    node1.userSized = true;
    node1.rect = { x: 0, y: 0, width: 960, height: 1080 };
    node1.renderRect = { x: 0, y: 0, width: 960, height: 1080 };

    const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, metaWindow2);
    node2.mode = WINDOW_MODES.TILE;
    node2.percent = 0.5;
    node2.userSized = true;
    node2.rect = { x: 960, y: 0, width: 960, height: 1080 };
    node2.renderRect = { x: 960, y: 0, width: 960, height: 1080 };

    seedLiveForest(ctx.windowManager);

    node1.initRect = { x: 0, y: 0, width: 960, height: 1080 };
    node1.initGrabOp = GrabOp.RESIZING_E;
    node1.grabMode = GRAB_TYPES.RESIZING;

    ctx.windowManager.grabOp = GrabOp.RESIZING_E;
    global.display.get_focus_window.mockReturnValue(metaWindow1);

    return { monitor, metaWindow1, node1, node2 };
  }

  function forestChildPercents(monitor) {
    const forest = ctx.windowManager.forest;
    const mon = forest?.nodes?.[monitor.nodeValue];
    if (!mon) return [];
    return (mon.childIds || []).map((id) => forest.nodes[id]?.percent);
  }

  it("ends the grab and restores the slot instead of skewing the split", () => {
    const { monitor, metaWindow1, node1, node2 } = buildResizingSplit();

    metaWindow1.maximize();
    metaWindow1.move_resize_frame(false, 0, 0, 1920, 1080);

    ctx.windowManager.updateMetaPositionSize(metaWindow1, "size-changed");

    expect(node2.percent).toBeCloseTo(0.5, 5);
    expect(node1.percent).toBeCloseTo(0.5, 5);
    expect(forestChildPercents(monitor)).toEqual([0.5, 0.5]);
    expect(metaWindow1.is_maximized()).toBe(false);
    expect(node1.mode).toBe(WINDOW_MODES.TILE);
    expect(node1.grabMode).toBeNull();
    expect(metaWindow1.get_frame_rect().width).toBe(960);
  });

  it("still resizes normally when the window is not maximized", () => {
    const { metaWindow1, node1, node2 } = buildResizingSplit();

    metaWindow1.move_resize_frame(false, 0, 0, 1100, 1080);

    ctx.windowManager.updateMetaPositionSize(metaWindow1, "size-changed");

    expect(node1.percent).toBeGreaterThan(0.5);
    expect(node2.percent).toBeLessThan(0.5);
    expect(node1.percent + node2.percent).toBeCloseTo(1, 5);
  });
});
