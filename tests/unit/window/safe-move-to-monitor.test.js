import { describe, it, expect, beforeEach, vi } from "vitest";
import { safeMoveToMonitor } from "../../../lib/extension/soft-rehome.js";
import { createMockWindow, createWindowManagerFixture } from "../../mocks/helpers/index.js";

/**
 * Wayland: get_monitor() === -1 + move_to_monitor can SIGSEGV gnome-shell.
 * try/catch cannot stop a native SEGV — gates must refuse before the call.
 */
describe("safeMoveToMonitor", () => {
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

  it("moves when window is ready and mon differs", () => {
    const meta = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 1)).toBe(true);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it("skips when get_monitor() is -1 (unmapped / Wayland race)", () => {
    const meta = createMockWindow({
      monitor: -1,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 0)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when already on target mon", () => {
    const meta = createMockWindow({
      monitor: 1,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 1)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when no workspace", () => {
    const meta = createMockWindow({
      monitor: 0,
      workspace: null,
    });
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 1)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when no compositor actor", () => {
    const meta = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    meta.get_compositor_private = vi.fn(() => null);
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 1)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when mon index is out of range", () => {
    const meta = createMockWindow({
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const spy = vi.spyOn(meta, "move_to_monitor");
    expect(safeMoveToMonitor(meta, 9)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips null window", () => {
    expect(safeMoveToMonitor(null, 0)).toBe(false);
  });
});
