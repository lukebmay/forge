import { describe, it, expect, beforeEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../../mocks/helpers/index.js";
import { Rectangle, GrabOp, MotionDirection } from "../../mocks/gnome/Meta.js";

/**
 * WindowManager resize operations tests
 *
 * Tests for resize operations including:
 * - resize(): Resize windows in all directions (UP, DOWN, LEFT, RIGHT)
 * - Testing resize with different amounts (positive/negative)
 * - Testing grab operation handling during resize
 * - Testing event queue management during resize
 */
describe("WindowManager - Resize Operations", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-on-hover-enabled": false,
      },
    });

    // Add sort_windows_by_stacking to display mock
    ctx.display.sort_windows_by_stacking = vi.fn((windows) => windows);

    // Mock Meta namespace for GrabOp and MotionDirection
    global.Meta = {
      GrabOp,
      MotionDirection,
    };
  });

  // Convenience accessor
  const wm = () => ctx.windowManager;

  describe("resize() - Right/East Direction", () => {
    it("should increase width when resizing right", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, 50);

      expect(moveSpy).toHaveBeenCalled();
      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(850); // 800 + 50
      expect(movedRect.height).toBe(600); // unchanged
      expect(movedRect.x).toBe(100); // unchanged
      expect(movedRect.y).toBe(100); // unchanged
    });

    it("should decrease width when resizing right with negative amount", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, -50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(750); // 800 - 50
    });

    it("should handle keyboard resize right", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(850);
    });
  });

  describe("resize() - Left/West Direction", () => {
    it("should increase width and move left when resizing left", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_W, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(850); // 800 + 50
      expect(movedRect.x).toBe(50); // 100 - 50 (moved left to compensate)
      expect(movedRect.height).toBe(600); // unchanged
      expect(movedRect.y).toBe(100); // unchanged
    });

    it("should decrease width and move right when resizing left with negative amount", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_W, -50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(750); // 800 - 50
      expect(movedRect.x).toBe(150); // 100 - (-50) = 100 + 50
    });

    it("should handle keyboard resize left", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.KEYBOARD_RESIZING_W, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(850);
      expect(movedRect.x).toBe(50);
    });
  });

  describe("resize() - Up/North Direction", () => {
    it("should increase height when resizing up", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_N, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(650); // 600 + 50
      expect(movedRect.width).toBe(800); // unchanged
      expect(movedRect.x).toBe(100); // unchanged
      expect(movedRect.y).toBe(50); // forge-74em: 100 - 50, top edge grows up
    });

    it("should decrease height when resizing up with negative amount", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_N, -50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(550); // 600 - 50
    });

    it("should handle keyboard resize up", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.KEYBOARD_RESIZING_N, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(650);
      expect(movedRect.y).toBe(50); // forge-74em: top edge grows up
    });
  });

  describe("resize() - Down/South Direction", () => {
    it("should increase height at the bottom edge when resizing down", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_S, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(650); // 600 + 50
      expect(movedRect.y).toBe(100); // forge-74em: bottom edge grows, y unchanged
      expect(movedRect.width).toBe(800); // unchanged
      expect(movedRect.x).toBe(100); // unchanged
    });

    it("should decrease height at the bottom edge when resizing down with negative amount", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_S, -50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(550); // 600 - 50
      expect(movedRect.y).toBe(100); // forge-74em: bottom edge shrinks, y unchanged
    });

    it("should handle keyboard resize down", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.KEYBOARD_RESIZING_S, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.height).toBe(650);
      expect(movedRect.y).toBe(100); // forge-74em: bottom edge grows, y unchanged
    });
  });

  describe("resize() - Grab Operation Handling", () => {
    it("should call _handleGrabOpBegin at start of resize", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const beginSpy = vi.spyOn(wm(), "_handleGrabOpBegin");

      wm().resize(GrabOp.RESIZING_E, 50);

      expect(beginSpy).toHaveBeenCalledWith(ctx.display, metaWindow, GrabOp.RESIZING_E);
    });

    it("should schedule a debounced grab-end (forge-5v6/#532)", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      wm().resize(GrabOp.RESIZING_E, 50);

      // A single debounced grab-end is pending; the shared event queue is unused.
      expect(wm()._manualResizeEndId).toBeTruthy();
      expect(wm().eventQueue.length).toBe(0);
    });

    it("should keep one pending grab-end across repeats (forge-5v6/#532)", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      // Auto-repeat: holding the key fires resize() several times.
      wm().resize(GrabOp.RESIZING_E, 50);
      wm().resize(GrabOp.RESIZING_E, 50);
      wm().resize(GrabOp.RESIZING_E, 50);

      // The grab stays open (one pending end), not one queued event per repeat.
      expect(wm()._manualResizeEndId).toBeTruthy();
      expect(wm().eventQueue.length).toBe(0);
    });
  });

  describe("resize() - Edge Cases", () => {
    it("should handle zero resize amount", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, 0);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(800); // unchanged
      expect(movedRect.height).toBe(600); // unchanged
    });

    it("should handle large resize amounts", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, 1000);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(1800); // 800 + 1000
    });

    it("should handle very negative resize amounts", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, -500);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.width).toBe(300); // 800 - 500
    });
  });

  describe("resize() - Integration with move()", () => {
    it("should call move() with updated rectangle", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      wm().resize(GrabOp.RESIZING_E, 50);

      // Bug #6: resize() passes skipOffscreenClamp so move() resizes only.
      expect(moveSpy).toHaveBeenCalledWith(metaWindow, expect.any(Object), null, {
        skipOffscreenClamp: true,
      });
    });

    it("should preserve original rect properties not affected by direction", () => {
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 200, width: 800, height: 600 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      const moveSpy = vi.spyOn(wm(), "move");

      // Resize horizontally should not affect y or height
      wm().resize(GrabOp.RESIZING_E, 50);

      const movedRect = moveSpy.mock.calls[0][1];
      expect(movedRect.y).toBe(200); // unchanged
      expect(movedRect.height).toBe(600); // unchanged
    });
  });

  describe("resize() - Off-screen clamp (Bug #6)", () => {
    it("should not reposition the window when growing the bottom edge past the work area", () => {
      // Window sits low in the 1920x1080 work area. Growing its bottom edge down
      // makes y+height overflow 1080, which used to trip the forge-aydd off-screen
      // clamp in move() and shift the whole window UP. A resize must change size
      // only, never reposition.
      const metaWindow = createMockWindow({
        rect: new Rectangle({ x: 100, y: 900, width: 400, height: 150 }),
        workspace: ctx.workspaces[0],
      });

      ctx.display.get_focus_window.mockReturnValue(metaWindow);

      // Drive a real resize through move() (no spy), then inspect the committed frame.
      wm().resize(GrabOp.RESIZING_S, 100);

      const committed = metaWindow.get_frame_rect();
      expect(committed.height).toBe(250); // 150 + 100, bottom edge grew
      expect(committed.y).toBe(900); // y UNCHANGED — not shifted up by the clamp
    });
  });

  describe("resize() - All Directions Combined", () => {
    it("should correctly resize in all four cardinal directions", () => {
      // y=400 with height 600 means a +100 S resize pushes the bottom edge to
      // y+height=1100, past the 1080 work-area bottom. Since resize() now skips
      // the forge-aydd off-screen clamp (Bug #6), this still exercises direction
      // math alone — the dragged edge grows without repositioning the window.
      const initialRect = new Rectangle({ x: 500, y: 400, width: 800, height: 600 });

      const directions = [
        { grabOp: GrabOp.RESIZING_E, amount: 100, expectWidth: 900, expectX: 500 },
        { grabOp: GrabOp.RESIZING_W, amount: 100, expectWidth: 900, expectX: 400 },
        // forge-74em: N grows the top edge (y up, mirror of W); S grows the
        // bottom edge (y fixed, mirror of E).
        { grabOp: GrabOp.RESIZING_N, amount: 100, expectHeight: 700, expectY: 300 },
        { grabOp: GrabOp.RESIZING_S, amount: 100, expectHeight: 700, expectY: 400 },
      ];

      directions.forEach(({ grabOp, amount, expectWidth, expectX, expectHeight, expectY }) => {
        const metaWindow = createMockWindow({
          rect: initialRect.copy(),
          workspace: ctx.workspaces[0],
        });
        ctx.display.get_focus_window.mockReturnValue(metaWindow);

        const moveSpy = vi.spyOn(wm(), "move");

        wm().resize(grabOp, amount);

        const movedRect = moveSpy.mock.calls[0][1];
        if (expectWidth) expect(movedRect.width).toBe(expectWidth);
        if (expectX !== undefined) expect(movedRect.x).toBe(expectX);
        if (expectHeight) expect(movedRect.height).toBe(expectHeight);
        if (expectY !== undefined) expect(movedRect.y).toBe(expectY);

        moveSpy.mockRestore();
      });
    });
  });

  describe("resize() - Guard Branches (forge-6f5o)", () => {
    it("no-ops when there is no focused window (null-focus early return)", () => {
      // focusMetaWindow is null, so resize() must bail before touching move()
      // or the grab machinery (window.js ~698).
      ctx.display.get_focus_window.mockReturnValue(null);

      const moveSpy = vi.spyOn(wm(), "move");
      const beginSpy = vi.spyOn(wm(), "_handleGrabOpBegin");

      wm().resize(GrabOp.RESIZING_E, 50);

      expect(moveSpy).not.toHaveBeenCalled();
      expect(beginSpy).not.toHaveBeenCalled();
      expect(wm()._manualResizeEndId).toBeFalsy();
    });

    it("flushes a pending grab-end for a DIFFERENT window before resizing (forge-h6z9)", () => {
      // Float path still uses Meta grab debounce; tiled uses owning-split (R1b).
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      // Bypass monitor/workspace plumbing not under test here.
      wm().trackCurrentMonWs = () => {};

      const winA = createMockWindow({
        allows_resize: true,
        rect: new Rectangle({ x: 0, y: 0, width: 300, height: 600 }),
        workspace: ctx.workspaces[0],
      });
      const winB = createMockWindow({
        allows_resize: true,
        rect: new Rectangle({ x: 300, y: 0, width: 300, height: 600 }),
        workspace: ctx.workspaces[0],
      });
      const nodeA = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winA);
      const nodeB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winB);
      nodeA.mode = WINDOW_MODES.FLOAT;
      nodeB.mode = WINDOW_MODES.FLOAT;

      // Arm the debounced grab-end for window A.
      ctx.display.get_focus_window.mockReturnValue(winA);
      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 10);
      expect(nodeA.grabMode).toBeTruthy();
      expect(wm()._manualResizeEndWindow).toBe(winA);

      const cleanupSpy = vi.spyOn(wm(), "_grabCleanup");

      // Focus drifts to B; a resize within the debounce must flush A's grab first
      // so A's node isn't stranded with grabMode/initRect.
      ctx.display.get_focus_window.mockReturnValue(winB);
      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 10);

      expect(cleanupSpy).toHaveBeenCalledWith(nodeA);
      expect(nodeA.grabMode).toBeNull();
      expect(nodeA.initRect).toBeNull();
      // The pending end now belongs to B.
      expect(wm()._manualResizeEndWindow).toBe(winB);
    });
  });

  /**
   * R1b: tiled keyboard edge resize uses resolveOwningSplit + percent delta
   * (one axis). Positive amount grows focused layout-unit share; L and R share
   * the same sign (no edge-direction flip). Grab/Meta path is bypassed.
   */
  describe("resize() - tiled owning-split (R1b)", () => {
    function build2x2() {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };

      const colL = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      colL.percent = 0.5;
      const colR = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      colR.percent = 0.5;

      const mkWin = (parent, rect, id) => {
        const meta = createMockWindow({ id, workspace: ctx.workspaces[0] });
        const node = ctx.tree.createNode(parent.nodeValue, NODE_TYPES.WINDOW, meta);
        node.mode = WINDOW_MODES.TILE;
        node.percent = 0.5;
        node.rect = rect;
        return node;
      };

      const tl = mkWin(colL, { x: 0, y: 0, width: 960, height: 540 }, "TL");
      const bl = mkWin(colL, { x: 0, y: 540, width: 960, height: 540 }, "BL");
      const tr = mkWin(colR, { x: 960, y: 0, width: 960, height: 540 }, "TR");
      const br = mkWin(colR, { x: 960, y: 540, width: 960, height: 540 }, "BR");
      return { tl, bl, tr, br, colL, colR, monitor };
    }

    it("horizontal edge grows focused column share (nested H-in-V off-axis walk)", () => {
      const { tl, bl, colL, colR } = build2x2();
      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      const moveSpy = vi.spyOn(wm(), "move");
      const beginSpy = vi.spyOn(wm(), "_handleGrabOpBegin");
      ctx.display.get_focus_window.mockReturnValue(tl.nodeValue);

      // 96px of 1920 monitor width = 5% → colL 0.55 / colR 0.45
      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 96);

      expect(colL.percent).toBeCloseTo(0.55, 5);
      expect(colR.percent).toBeCloseTo(0.45, 5);
      // Vertical siblings unchanged (one axis only — not dual expand).
      expect(tl.percent).toBe(0.5);
      expect(bl.percent).toBe(0.5);
      expect(moveSpy).not.toHaveBeenCalled();
      expect(beginSpy).not.toHaveBeenCalled();
      expect(wm()._manualResizeEndId).toBeFalsy();
    });

    it("WindowResizeLeft uses same sign as Right (no L/R flip; grows focused share)", () => {
      const { tl, colL, colR } = build2x2();
      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      ctx.display.get_focus_window.mockReturnValue(tl.nodeValue);

      wm().resize(GrabOp.KEYBOARD_RESIZING_W, 96);

      expect(colL.percent).toBeCloseTo(0.55, 5);
      expect(colR.percent).toBeCloseTo(0.45, 5);
    });

    it("vertical edge grows focused row share within column", () => {
      const { tl, bl, colL, colR } = build2x2();
      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      ctx.display.get_focus_window.mockReturnValue(tl.nodeValue);

      // 54px of 1080 column height = 5%
      wm().resize(GrabOp.KEYBOARD_RESIZING_S, 54);

      expect(tl.percent).toBeCloseTo(0.55, 5);
      expect(bl.percent).toBeCloseTo(0.45, 5);
      // Horizontal columns unchanged.
      expect(colL.percent).toBe(0.5);
      expect(colR.percent).toBe(0.5);
    });

    it("negative amount shrinks focused share", () => {
      const { tl, bl } = build2x2();
      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      ctx.display.get_focus_window.mockReturnValue(tl.nodeValue);

      wm().resize(GrabOp.KEYBOARD_RESIZING_S, -54);

      expect(tl.percent).toBeCloseTo(0.45, 5);
      expect(bl.percent).toBeCloseTo(0.55, 5);
    });

    it("no-op when no owning split on that axis (does not thrash Meta)", () => {
      // Flat VSPLIT only — horizontal edge has no ancestor pair.
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };

      const mkWin = (parent, rect, id) => {
        const meta = createMockWindow({ id, workspace: ctx.workspaces[0] });
        const node = ctx.tree.createNode(parent.nodeValue, NODE_TYPES.WINDOW, meta);
        node.mode = WINDOW_MODES.TILE;
        node.percent = 0.5;
        node.rect = rect;
        return node;
      };
      const a = mkWin(monitor, { x: 0, y: 0, width: 1920, height: 540 }, "A");
      mkWin(monitor, { x: 0, y: 540, width: 1920, height: 540 }, "B");

      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      const moveSpy = vi.spyOn(wm(), "move");
      const beginSpy = vi.spyOn(wm(), "_handleGrabOpBegin");
      ctx.display.get_focus_window.mockReturnValue(a.nodeValue);

      const aPct = a.percent;
      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 50);

      expect(a.percent).toBe(aPct);
      expect(moveSpy).not.toHaveBeenCalled();
      expect(beginSpy).not.toHaveBeenCalled();
    });

    it("tab bag is the layout unit (edge resizes bag vs split pair)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };

      const bag = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      bag.percent = 0.5;
      const otherMeta = createMockWindow({ id: "other", workspace: ctx.workspaces[0] });
      const other = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, otherMeta);
      other.mode = WINDOW_MODES.TILE;
      other.percent = 0.5;
      other.rect = { x: 960, y: 0, width: 960, height: 1080 };

      const w1Meta = createMockWindow({ id: "w1", workspace: ctx.workspaces[0] });
      const w1 = ctx.tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, w1Meta);
      w1.mode = WINDOW_MODES.TILE;
      w1.percent = 1;
      w1.rect = { x: 0, y: 0, width: 960, height: 1080 };

      vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
      ctx.display.get_focus_window.mockReturnValue(w1Meta);

      wm().resize(GrabOp.KEYBOARD_RESIZING_E, 96);

      expect(bag.percent).toBeCloseTo(0.55, 5);
      expect(other.percent).toBeCloseTo(0.45, 5);
      // Leaf inside bag is not the resize target.
      expect(w1.percent).toBe(1);
    });
  });
});
