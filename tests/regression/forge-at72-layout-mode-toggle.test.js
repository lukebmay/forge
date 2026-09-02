import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  kidsOf,
} from "../mocks/helpers/index.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * forge-at72 / daily-driver T0: layout mode toggles rewrite live containers.
 * - STACKED disable → TABBED (preserve group); re-enable restores STACKED via prevLayout.
 * - TABBED disable → split; re-enable restores TABBED from splits with matching prevLayout.
 */
describe("forge-at72: _handleLayoutModeToggle disable/enable round-trip", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
        "tabbed-tiling-mode-enabled": true,
      },
    });
    // _handleLayoutModeToggle ends with renderTree(); keep it inert so the test
    // targets the tree mutation, not the placement pipeline.
    vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  // A CON of `layout` with `count` window children under monitor 0/ws 0.
  function buildGroup(layout, count) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    const windows = [];
    for (let i = 0; i < count; i++) {
      const meta = createMockWindow({ id: `${layout}-w${i}`, workspace: ctx.workspaces[0] });
      ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, meta);
      windows.push(meta);
    }
    return { con, windows };
  }

  describe("STACKED mode", () => {
    const layoutType = LAYOUT_TYPES.STACKED;
    const settingName = "stacked-tiling-mode-enabled";

    it("converts a live STACKED container to TABBED when disabled, keeping every window", () => {
      const { con, windows } = buildGroup(layoutType, 3);
      expect(ctx.tree.getNodeByLayout(layoutType)).toHaveLength(1);

      ctx.settings.set_boolean(settingName, false);
      wm()._handleLayoutModeToggle(settingName, layoutType);

      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(con.prevLayout).toBe(layoutType);
      expect(ctx.tree.getNodeByLayout(layoutType)).toHaveLength(0);
      expect(kidsOf(wm(), con)).toHaveLength(3);
      expect(kidsOf(wm(), con).map((n) => n.nodeValue)).toEqual(windows);
    });

    it("restores the STACKED container when the mode is re-enabled", () => {
      const { con } = buildGroup(layoutType, 2);

      ctx.settings.set_boolean(settingName, false);
      wm()._handleLayoutModeToggle(settingName, layoutType);
      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);

      ctx.settings.set_boolean(settingName, true);
      wm()._handleLayoutModeToggle(settingName, layoutType);

      expect(con.layout).toBe(layoutType);
      expect(kidsOf(wm(), con)).toHaveLength(2);
    });
  });

  describe("TABBED mode", () => {
    const layoutType = LAYOUT_TYPES.TABBED;
    const settingName = "tabbed-tiling-mode-enabled";

    it("converts a live TABBED container to a split when disabled, keeping every window", () => {
      const { con, windows } = buildGroup(layoutType, 3);
      expect(ctx.tree.getNodeByLayout(layoutType)).toHaveLength(1);

      ctx.settings.set_boolean(settingName, false);
      wm()._handleLayoutModeToggle(settingName, layoutType);

      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT]).toContain(con.layout);
      expect(con.prevLayout).toBe(layoutType);
      expect(ctx.tree.getNodeByLayout(layoutType)).toHaveLength(0);
      expect(kidsOf(wm(), con)).toHaveLength(3);
      expect(kidsOf(wm(), con).map((n) => n.nodeValue)).toEqual(windows);
    });

    it("restores the TABBED container when the mode is re-enabled", () => {
      const { con } = buildGroup(layoutType, 2);

      ctx.settings.set_boolean(settingName, false);
      wm()._handleLayoutModeToggle(settingName, layoutType);
      expect([LAYOUT_TYPES.HSPLIT, LAYOUT_TYPES.VSPLIT]).toContain(con.layout);

      ctx.settings.set_boolean(settingName, true);
      wm()._handleLayoutModeToggle(settingName, layoutType);

      expect(con.layout).toBe(layoutType);
      expect(kidsOf(wm(), con)).toHaveLength(2);
    });
  });
});
