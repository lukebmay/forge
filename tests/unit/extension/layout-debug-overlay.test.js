import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatLayoutDebugLabel,
  layoutDebugInfoFromNode,
} from "../../../lib/extension/layout-debug-overlay.js";
import { LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../../mocks/helpers/index.js";

describe("formatLayoutDebugLabel", () => {
  it("formats HSPLIT with user-sized percent and mon id", () => {
    expect(
      formatLayoutDebugLabel({
        parentLayout: LAYOUT_TYPES.HSPLIT,
        percent: 1 / 3,
        userSized: true,
        monWsId: "mo0ws0",
      })
    ).toBe("HSPLIT 33% mo0ws0");
  });

  it("uses auto when percent is 0 or missing", () => {
    expect(formatLayoutDebugLabel({ parentLayout: "VSPLIT", percent: 0, monWsId: "mo1ws0" })).toBe(
      "VSPLIT auto mo1ws0"
    );
    expect(formatLayoutDebugLabel({ parentLayout: "TABBED", monWsId: "mo0ws1" })).toBe(
      "TABBED auto mo0ws1"
    );
  });

  it("prefixes ~ for automatic non-zero percent (not user-sized)", () => {
    expect(
      formatLayoutDebugLabel({ parentLayout: "HSPLIT", percent: 0.5, monWsId: "mo0ws0" })
    ).toBe("HSPLIT ~50% mo0ws0");
    expect(
      formatLayoutDebugLabel({
        parentLayout: "HSPLIT",
        percent: 0.618,
        userSized: false,
        monWsId: "mo0ws0",
      })
    ).toBe("HSPLIT ~62% mo0ws0");
  });

  it("rounds user-sized percent to nearest whole percent", () => {
    expect(
      formatLayoutDebugLabel({
        parentLayout: "HSPLIT",
        percent: 0.5,
        userSized: true,
        monWsId: "mo0ws0",
      })
    ).toBe("HSPLIT 50% mo0ws0");
    expect(
      formatLayoutDebugLabel({
        parentLayout: "HSPLIT",
        percent: 0.618,
        userSized: true,
        monWsId: "mo0ws0",
      })
    ).toBe("HSPLIT 62% mo0ws0");
  });

  it("includes min size when both dimensions present and non-zero", () => {
    expect(
      formatLayoutDebugLabel({
        parentLayout: "VSPLIT",
        percent: 0.5,
        userSized: true,
        monWsId: "mo0ws0",
        minW: 400,
        minH: 200,
      })
    ).toBe("VSPLIT 50% mo0ws0 min:400x200");
  });

  it("omits min size when both are zero", () => {
    expect(
      formatLayoutDebugLabel({
        parentLayout: "HSPLIT",
        percent: 1,
        userSized: true,
        monWsId: "mo0ws0",
        minW: 0,
        minH: 0,
      })
    ).toBe("HSPLIT 100% mo0ws0");
  });

  it("falls back to ? for missing layout/mon", () => {
    expect(formatLayoutDebugLabel({})).toBe("? auto ?");
  });
});

describe("layoutDebugInfoFromNode", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("reads parent layout, percent, and monWsId", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT);
    const { nodeWindow } = createWindowNode(ctx.tree, con, {
      windowOverrides: { id: "w1" },
    });
    nodeWindow.percent = 0.5;
    nodeWindow.userSized = true;
    nodeWindow.mode = WINDOW_MODES.TILE;

    const info = layoutDebugInfoFromNode(nodeWindow, ctx.tree);
    expect(info.parentLayout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(info.percent).toBe(0.5);
    expect(info.userSized).toBe(true);
    expect(info.monWsId).toBe(monitor.nodeValue);
  });
});

describe("LayoutDebugOverlay", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "layout-debug-overlay-enabled": false },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  it("update is a no-op (no labels) when disabled", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    createWindowNode(ctx.tree, monitor, {
      windowOverrides: { id: "w1" },
      mode: "TILE",
    });

    const overlay = ctx.windowManager.layoutDebugOverlay;
    overlay.update();
    expect(overlay._labels.size).toBe(0);
  });

  it("creates labels for tiled windows when enabled", () => {
    ctx.settings._values["layout-debug-overlay-enabled"] = true;

    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.VSPLIT);
    const { nodeWindow } = createWindowNode(ctx.tree, con, {
      windowOverrides: {
        id: "w1",
        rect: { x: 10, y: 20, width: 400, height: 300 },
      },
      mode: "TILE",
    });
    nodeWindow.percent = 0.5;
    nodeWindow.userSized = true;

    const overlay = ctx.windowManager.layoutDebugOverlay;
    overlay.update();

    expect(overlay._labels.size).toBe(1);
    const label = [...overlay._labels.values()][0];
    expect(label.get_text()).toContain("VSPLIT");
    expect(label.get_text()).toContain("50%");
    expect(label.get_text()).not.toContain("~50%");
    expect(label.get_text()).toContain(monitor.nodeValue);
  });

  it("destroyAll removes all labels", () => {
    ctx.settings._values["layout-debug-overlay-enabled"] = true;

    const { monitor } = getWorkspaceAndMonitor(ctx);
    createWindowNode(ctx.tree, monitor, {
      windowOverrides: {
        id: "w1",
        rect: { x: 0, y: 0, width: 200, height: 200 },
      },
      mode: "TILE",
    });

    const overlay = ctx.windowManager.layoutDebugOverlay;
    overlay.update();
    expect(overlay._labels.size).toBe(1);

    overlay.destroyAll();
    expect(overlay._labels.size).toBe(0);
  });

  it("skips floating windows", () => {
    ctx.settings._values["layout-debug-overlay-enabled"] = true;

    const { monitor } = getWorkspaceAndMonitor(ctx);
    createWindowNode(ctx.tree, monitor, {
      windowOverrides: {
        id: "float",
        rect: { x: 0, y: 0, width: 200, height: 200 },
      },
      mode: "FLOAT",
    });

    const overlay = ctx.windowManager.layoutDebugOverlay;
    overlay.update();
    expect(overlay._labels.size).toBe(0);
  });
});
