import { describe, it, expect, beforeEach, vi } from "vitest";
import { safeMoveToMonitor } from "../../lib/extension/monitor-recovery.js";
import { createMockWindow, createWindowManagerFixture } from "../mocks/helpers/index.js";

/**
 * 2026-08-05: gnome-shell SIGSEGV (signal 11) twice on Wayland when closing
 * Nautilus / during title-changed reflow:
 *   soft-rehome.js:58  metaWindow.move_to_monitor
 *   window.js:1435     move() → safeMoveToMonitor
 *   tree.js apply      every render
 *
 * Root: commit 42c8751 called move_to_monitor on every tile apply. When
 * get_monitor() is -1 (map/unmap, stack_position invalid) Mutter SEGVs —
 * try/catch cannot catch native signals. Gate before the call.
 */
describe("safeMoveToMonitor skips unready windows (Wayland SEGV)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: {
            0: { x: 0, y: 0, width: 1920, height: 1080 },
            1: { x: 1920, y: 0, width: 2560, height: 1440 },
          },
        },
      },
    });
  });

  it("does not call move_to_monitor when get_monitor() is -1", () => {
    const metaWindow = createMockWindow({
      monitor: -1,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 0, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call move_to_monitor when monIdx is out of range", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 99, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call move_to_monitor when already on dest mon", () => {
    const metaWindow = createMockWindow({
      monitor: 1,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 1, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call move_to_monitor without a workspace", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: null,
    });
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 1, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call move_to_monitor without compositor actor", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    metaWindow.get_compositor_private = () => null;
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 1, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call move_to_monitor when window is finalized", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    metaWindow.get_id = () => {
      throw new Error("Object finalized");
    };
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 1, "test")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("moves when window is live and mon differs", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(metaWindow, "move_to_monitor");
    expect(safeMoveToMonitor(metaWindow, 1, "test")).toBe(true);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it("move() skips dead windows entirely", () => {
    const metaWindow = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    metaWindow.get_id = () => {
      throw new Error("Object finalized");
    };
    const monSpy = vi.spyOn(metaWindow, "move_to_monitor");
    const frameSpy = vi.spyOn(metaWindow, "move_resize_frame");
    ctx.windowManager.move(metaWindow, { x: 2000, y: 100, width: 800, height: 600 });
    expect(monSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();
  });
});
