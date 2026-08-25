import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * D030 zoom: paint target wins over layout slot on reassert / tab-peer heal.
 *
 * Chrome/PWA zoom painted full, then tab-slot reassert (or client snap) put the
 * frame back on the unzoomed slot while zoomMode + magenta border stayed full.
 */
describe("D030 zoom paint vs slot reassert", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  function tabbedChromeWithSiblingSlot() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const slot = { x: 0, y: 40, width: 960, height: 1040 };
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "chrome", wm_class: "Google-chrome" },
    });
    nodeWindow.mode = WINDOW_MODES.TILE;
    nodeWindow.renderRect = { ...slot };
    nodeWindow.rect = { ...slot };
    con.lastTabFocus = metaWindow;
    createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "peer", wm_class: "Google-chrome" },
    });
    metaWindow.move_resize_frame(true, slot.x, slot.y, slot.width, slot.height);
    return { monitor, con, nodeWindow, metaWindow, slot };
  }

  it("reassertNodeToSlot moves a zoomed TILE to paintRect, not layout slot", () => {
    const { nodeWindow, metaWindow, slot } = tabbedChromeWithSiblingSlot();
    nodeWindow.zoomMode = "full";
    const painted = ctx.tree.paintRectForWindow(nodeWindow);
    expect(painted.width).toBeGreaterThan(slot.width);

    const moved = [];
    vi.spyOn(wm(), "move").mockImplementation((_mw, rect) => {
      moved.push({ ...rect });
      return true;
    });

    expect(wm().reassertNodeToSlot(nodeWindow, { force: true })).toBe(true);
    expect(moved.length).toBe(1);
    expect(moved[0].width).toBe(painted.width);
    expect(moved[0].height).toBe(painted.height);
    expect(moved[0].width).not.toBe(slot.width);
  });

  it("tab-peer heal does not shrink a zoomed open leaf back to the group slot", () => {
    const { nodeWindow, metaWindow, slot } = tabbedChromeWithSiblingSlot();
    nodeWindow.zoomMode = "full";
    const painted = ctx.tree.paintRectForWindow(nodeWindow);
    // Simulate post-apply zoom paint already committed.
    metaWindow.move_resize_frame(true, painted.x, painted.y, painted.width, painted.height);

    const moved = [];
    vi.spyOn(wm(), "move").mockImplementation((mw, rect) => {
      if (mw === metaWindow) moved.push({ ...rect });
      return true;
    });

    wm().reassertAllTabStackSlots({ force: false });

    // Already at paint → no move of the zoomed leaf (would have been slot before fix).
    expect(moved).toHaveLength(0);
    expect(wm()._tiledWindowAtTreeSlot(nodeWindow, metaWindow)).toBe(true);
  });

  it("D026 restores zoomed Chrome that snapped back to the layout slot", () => {
    const { nodeWindow, metaWindow, slot } = tabbedChromeWithSiblingSlot();
    nodeWindow.zoomMode = "full";
    // Client snap: frame at slot, zoomMode still full (magenta border path).
    metaWindow.move_resize_frame(true, slot.x, slot.y, slot.width, slot.height);
    ctx.display.get_focus_window.mockReturnValue(metaWindow);

    expect(wm()._shouldRestoreTileSlot(nodeWindow, metaWindow)).toBe(true);

    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");
    wm().updateMetaPositionSize(metaWindow, "size-changed");
    expect(reassertSpy).toHaveBeenCalledWith(nodeWindow, { force: true });
  });

  it("_reassertZoomedTiles force-moves drifted zoom paint", () => {
    const { nodeWindow, metaWindow, slot } = tabbedChromeWithSiblingSlot();
    nodeWindow.zoomMode = "full";
    metaWindow.move_resize_frame(true, slot.x, slot.y, slot.width, slot.height);
    const painted = ctx.tree.paintRectForWindow(nodeWindow);

    const moved = [];
    vi.spyOn(wm(), "move").mockImplementation((_mw, rect) => {
      moved.push({ ...rect });
      return true;
    });

    expect(wm()._reassertZoomedTiles()).toBe(1);
    expect(moved[0]?.width).toBe(painted.width);
  });
});
