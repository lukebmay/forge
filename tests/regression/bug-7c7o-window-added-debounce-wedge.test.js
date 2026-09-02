import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WorkspaceManager } from "../../lib/extension/workspace.js";
import { SourceBag } from "../../lib/extension/sources.js";
import { createMockWindow, installGnomeGlobals } from "../mocks/helpers/index.js";

/**
 * forge-7c7o: a finalized window during window-added debounce must not wedge
 * the shared debounce guard (SourceBag slot wsWindowAdd). Per-window queue
 * isolation (forge-wqlx) + bag auto-clear on fire keep the path healthy.
 */
describe("forge-7c7o: window-added debounce survives a finalized window", () => {
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

  it("D100: window-added observe does not wedge or rehome", () => {
    workspaceManager.bindWorkspaceSignals(workspace);

    const deadWindow = createMockWindow({ wm_class: "ShortLived" });
    deadWindow.get_monitor = vi.fn(() => {
      throw new Error("Object 0xdead has been already deallocated");
    });

    expect(() => workspace.emit("window-added", workspace, deadWindow)).not.toThrow();
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);

    const liveWindow = createMockWindow({ wm_class: "App" });
    expect(() => workspace.emit("window-added", workspace, liveWindow)).not.toThrow();
    expect(extWm.updateMetaWorkspaceMonitor).not.toHaveBeenCalled();
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);
    expect(timeouts.length).toBe(0);
  });
});
