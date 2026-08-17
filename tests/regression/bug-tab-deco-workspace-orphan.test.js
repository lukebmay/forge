import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Tab chrome must not follow the user across workspaces, and orphan forge-deco
 * actors left on the tab-chrome layer after thrash must be swept.
 */
describe("Tab decoration: active workspace + orphan sweep", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
      },
    });
  });

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("does not re-show decoration when CON is on a non-active workspace", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    // Mark monitor as ws1 while active is ws0 (fixture default).
    monitor.nodeValue = "mo0ws1";
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    con.decoration = {
      show: vi.fn(),
      hide: vi.fn(),
      set_size: vi.fn(),
      reactive: true,
      get_parent() {
        return this._parent || null;
      },
    };
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "a" } });
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "b" } });

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.hide).toHaveBeenCalled();
    expect(con.decoration.show).not.toHaveBeenCalled();
  });

  it("re-shows decoration when CON is on the active workspace", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.nodeValue = "mo0ws0";
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    con.decoration = {
      show: vi.fn(),
      hide: vi.fn(),
      set_size: vi.fn(),
      reactive: true,
      get_parent() {
        return this._parent || null;
      },
    };
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "a" } });
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "b" } });

    ctx.windowManager.updateDecorationLayout();

    expect(con.decoration.show).toHaveBeenCalled();
  });

  it("destroys orphan forge-deco actors not owned by any CON", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED);
    const live = {
      type: "forge-deco",
      show: vi.fn(),
      hide: vi.fn(),
      set_size: vi.fn(),
      destroy: vi.fn(),
      reactive: true,
      get_parent() {
        return this._parent || null;
      },
    };
    con.decoration = live;
    createWindowNode(ctx.tree, con, { windowOverrides: { id: "a" } });

    const orphan = {
      type: "forge-deco",
      hide: vi.fn(),
      destroy: vi.fn(),
      get_parent() {
        return this._parent || null;
      },
    };

    const dm = ctx.windowManager.decorationManager;
    dm.ensureTabChromeLayer();
    const layer = dm.tabChromeLayer;
    layer.add_child(live);
    layer.add_child(orphan);

    ctx.windowManager.updateDecorationLayout();

    expect(orphan.destroy).toHaveBeenCalled();
    expect(live.destroy).not.toHaveBeenCalled();
    expect(layer.contains(orphan)).toBe(false);
  });
});
