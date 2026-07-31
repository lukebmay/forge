import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { Rectangle, GrabOp } from "../mocks/gnome/Meta.js";

/**
 * forge-5v6 (#532) + R1b:
 *
 * Originally: holding keyboard resize only resized one step because each
 * auto-repeat tore down the grab (frozen initRect) via a one-shot grab-end.
 * Debounced grab-end fixed float/Meta path accumulation.
 *
 * R1b: tiled keyboard edge bypasses grab and applies owning-split percent
 * deltas per press — accumulation is natural (no grab). Float path still uses
 * the debounced grab mechanism.
 */
describe("Bug #532: held resize accumulates (tiled owning-split + float grab)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    global.Meta = { ...(global.Meta || {}), GrabOp };
    ctx.windowManager.trackCurrentMonWs = () => {};
  });

  afterEach(() => {
    ctx.cleanup();
    delete global.Meta;
  });

  describe("tiled (R1b owning-split)", () => {
    let win1;
    let node1;
    let node2;

    beforeEach(() => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 600, height: 600 };

      win1 = createMockWindow({
        id: 5001,
        title: "Left",
        allows_resize: true,
        rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
      });
      const win2 = createMockWindow({
        id: 5002,
        title: "Right",
        allows_resize: true,
        rect: new Rectangle({ x: 300, y: 0, width: 300, height: 600 }),
      });
      node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win1);
      node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;
      node1.percent = 0.5;
      node2.percent = 0.5;
      node1.rect = { x: 0, y: 0, width: 300, height: 600 };
      node2.rect = { x: 300, y: 0, width: 300, height: 600 };

      ctx.display.get_focus_window.mockReturnValue(win1);
    });

    it("accumulates percent across rapid repeats without grab machinery", () => {
      vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
      const amount = 30; // 30/600 = 5% per press

      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);

      // Three presses: 0.5 + 3*0.05 = 0.65
      expect(node1.percent).toBeCloseTo(0.65, 5);
      expect(node2.percent).toBeCloseTo(0.35, 5);
      expect(node1.initRect).toBeFalsy();
      expect(ctx.windowManager._manualResizeEndId).toBeFalsy();
      expect(ctx.windowManager.eventQueue.length).toBe(0);
    });
  });

  describe("float (Meta grab debounce)", () => {
    let win1;
    let node1;

    beforeEach(() => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      win1 = createMockWindow({
        id: 5001,
        title: "FloatA",
        allows_resize: true,
        rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
      });
      const win2 = createMockWindow({
        id: 5002,
        title: "FloatB",
        allows_resize: true,
        rect: new Rectangle({ x: 300, y: 0, width: 300, height: 600 }),
      });
      node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win2);
      node1.mode = WINDOW_MODES.FLOAT;
      node2.mode = WINDOW_MODES.FLOAT;

      ctx.display.get_focus_window.mockReturnValue(win1);
    });

    it("does not end the grab between rapid repeats (single frozen initRect)", () => {
      const amount = 10;
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      const firstInit = node1.initRect;
      expect(firstInit).toBeTruthy();

      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);

      expect(node1.initRect).toBe(firstInit);
      expect(ctx.windowManager._manualResizeEndId).toBeTruthy();
      expect(ctx.windowManager.eventQueue.length).toBe(0);
    });

    it("accumulates the Meta frame resize across repeats", () => {
      const amount = 10;
      const startWidth = win1.get_frame_rect().width;

      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);
      ctx.windowManager.resize(GrabOp.KEYBOARD_RESIZING_E, amount);

      expect(win1.get_frame_rect().width).toBe(startWidth + 3 * amount);
    });
  });
});
