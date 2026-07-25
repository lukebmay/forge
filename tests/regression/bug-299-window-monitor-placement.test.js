import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Bug #299 / OP1: new-window monitor placement.
 *
 * Historical bug: windows ignored the intended home monitor.
 * OP1 (2026): generic opens home to the **global LFT** monitor (not pointer).
 * No LFT → mon 0. Dock sticky is covered in WindowManager-open-app-policy tests.
 * `new-window-placement=window-actual` still homes to the window's own monitor.
 */
describe("Bug #299: Window monitor placement", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({ globals: { display: { monitorCount: 2 } } });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("no LFT: places a new window on mon 0 (not pointer mon 1)", () => {
    ctx.display.get_current_monitor.mockReturnValue(1);

    const metaWindow = createMockWindow({ workspace: ctx.workspaces[0] });
    wm().trackWindow(null, metaWindow);

    const node = wm().findNodeWindow(metaWindow);
    expect(node).not.toBeNull();

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);

    expect(mon0.contains(node)).toBe(true);
    expect(mon1.contains(node)).toBe(false);
  });

  it("with LFT on mon 1: places next window on LFT mon (not pointer mon 0)", () => {
    ctx.display.get_current_monitor.mockReturnValue(0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    const { nodeWindow: lft } = createWindowNode(ctx.tree, mon1, {
      mode: "TILE",
      windowOverrides: { workspace: ctx.workspaces[0], monitor: 1, id: "lft" },
    });
    wm().movePointerWith(lft);

    const metaWindow = createMockWindow({ workspace: ctx.workspaces[0], monitor: 0 });
    wm().trackWindow(null, metaWindow);

    const node = wm().findNodeWindow(metaWindow);
    expect(node).not.toBeNull();

    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    expect(mon1.contains(node)).toBe(true);
    expect(mon0.contains(node)).toBe(false);
  });
});
