import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";
import { hostPresentHoldActive } from "../../lib/extension/monitor-recovery.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * Unlock after idle lock/DPMS: desk often already looks correct, then Shell
 * dies if Forge rehomes/presents into unready Meta (get_monitor() === -1).
 */
describe("sleep/wake shield rehome uses safeMoveToMonitor", () => {
  let ctx;

  const dualGeoms = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: dualGeoms,
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const tree = () => ctx.tree;

  function addTiled(id, monIdx, frame, monitorOverride = monIdx) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIdx);
    monitor.layout = "HSPLIT";
    monitor.rect = dualGeoms[monIdx];
    const win = createMockWindow({
      id,
      workspace: ctx.workspaces[0],
      monitor: monitorOverride,
      rect: frame,
    });
    const node = tree().createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...frame };
    seedLiveForest(wm());
    return { win, node, monitor };
  }

  it("skips move_to_monitor when get_monitor() is -1 (Wayland wake race)", () => {
    const { win: ready } = addTiled("ready", 0, {
      x: 10,
      y: 10,
      width: 800,
      height: 600,
    });
    const { win: unready } = addTiled(
      "unready",
      1,
      { x: 2000, y: 10, width: 800, height: 600 },
      -1
    );

    const spyReady = vi.spyOn(ready, "move_to_monitor");
    const spyUnready = vi.spyOn(unready, "move_to_monitor");

    const forest = tree().snapshotTree();
    wm().sessionLayoutRestore.rehomeWindowsForSessionForest(forest);

    expect(spyUnready).not.toHaveBeenCalled();
    expect(spyReady.mock.calls.every((c) => c[0] >= 0)).toBe(true);
  });

  it("shield reapply does not call move_to_monitor on unready windows", () => {
    addTiled("L", 0, { x: 10, y: 10, width: 800, height: 600 });
    const { win: right } = addTiled("R", 1, { x: 2000, y: 10, width: 900, height: 700 }, -1);

    vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    wm()._sessionLocked = true;
    expect(wm().sessionLayoutRestore.armLockLayoutShield()).toBe(true);

    const spyRight = vi.spyOn(right, "move_to_monitor");
    expect(wm()._reapplySessionLayoutShield("test-wake")).toBe(true);
    expect(spyRight).not.toHaveBeenCalled();
  });

  it("renderTree is a no-op while locked (no chrome, no Meta writes)", () => {
    const { win } = addTiled("A", 0, { x: 10, y: 10, width: 800, height: 600 });
    const deco = vi.spyOn(wm(), "updateDecorationLayout");
    const border = vi.spyOn(wm(), "updateBorderLayout");
    const floats = vi.spyOn(wm(), "processFloats");
    const move = vi.spyOn(win, "move_to_monitor");

    wm().onSessionLocked();
    expect(hostPresentHoldActive(wm())).toBe(true);

    wm().renderTree("locked");

    expect(deco).not.toHaveBeenCalled();
    expect(border).not.toHaveBeenCalled();
    expect(floats).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("unlock keeps present hold until settle; quiet homes skip shield reapply", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { win: leftWin } = addTiled("L", 0, leftFrame);
    const { win: rightWin } = addTiled("R", 1, rightFrame);
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    wm().onSessionLocked();
    const reapply = vi.spyOn(wm(), "_reapplySessionLayoutShield");
    const spyL = vi.spyOn(leftWin, "move_to_monitor");
    const spyR = vi.spyOn(rightWin, "move_to_monitor");
    const deco = vi.spyOn(wm(), "updateDecorationLayout");

    wm().onSessionUnlocked();
    expect(wm()._sessionLocked).toBe(false);
    expect(hostPresentHoldActive(wm())).toBe(true);

    wm().renderTree("post-unlock-pre-settle");
    expect(deco).not.toHaveBeenCalled();

    wm()._recoverAfterWorkareas();

    expect(reapply).not.toHaveBeenCalled();
    expect(spyL).not.toHaveBeenCalled();
    expect(spyR).not.toHaveBeenCalled();
    expect(hostPresentHoldActive(wm())).toBe(false);
  });
});
