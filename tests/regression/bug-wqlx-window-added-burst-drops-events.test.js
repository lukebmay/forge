import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WorkspaceManager } from "../../lib/extension/workspace.js";
import { SourceBag } from "../../lib/extension/sources.js";
import { createMockWindow, installGnomeGlobals } from "../mocks/helpers/index.js";

/**
 * forge-wqlx: window-added debounce queues every window and flushes them under
 * one SourceBag slot (wsWindowAdd), isolating each so a finalized window
 * cannot strand its siblings.
 */
describe("forge-wqlx: window-added debounce re-homes every window in a burst", () => {
  let ctx;
  let workspaceManager;
  let extWm;
  let workspace;
  let timeouts;

  beforeEach(() => {
    ctx = installGnomeGlobals();
    workspace = ctx.workspaces[0];
    timeouts = [];
    extWm = {
      updateMetaWorkspaceMonitor: vi.fn(),
      _wsWindowAddQueue: null,
      _wmSources: new SourceBag({
        schedule: (_ms, cb) => {
          timeouts.push(cb);
          return timeouts.length;
        },
        cancel: () => {},
      }),
    };
    workspaceManager = new WorkspaceManager({}, extWm);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("D100: window-added does not rehome (no debounce)", () => {
    workspaceManager.bindWorkspaceSignals(workspace);

    const winA = createMockWindow({ wm_class: "AppA" });
    const winB = createMockWindow({ wm_class: "AppB" });

    workspace.emit("window-added", workspace, winA);
    workspace.emit("window-added", workspace, winB);

    expect(timeouts.length).toBe(0);
    expect(extWm.updateMetaWorkspaceMonitor).not.toHaveBeenCalled();
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);
  });

  it("still does not rehome when a window-added Meta is finalized", () => {
    workspaceManager.bindWorkspaceSignals(workspace);

    const dead = createMockWindow({ wm_class: "Dead" });
    dead.get_monitor = vi.fn(() => {
      throw new Error("Object 0xdead has been already deallocated");
    });
    const live = createMockWindow({ wm_class: "Live" });

    expect(() => {
      workspace.emit("window-added", workspace, dead);
      workspace.emit("window-added", workspace, live);
    }).not.toThrow();
    expect(timeouts.length).toBe(0);
    expect(extWm.updateMetaWorkspaceMonitor).not.toHaveBeenCalled();
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);
  });
});
