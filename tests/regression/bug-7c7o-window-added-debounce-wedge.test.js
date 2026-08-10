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

  it("clears the debounce slot even when the captured window throws", () => {
    workspaceManager.bindWorkspaceSignals(workspace);

    const deadWindow = createMockWindow({ wm_class: "ShortLived" });
    deadWindow.get_monitor = vi.fn(() => {
      throw new Error("Object 0xdead has been already deallocated");
    });

    workspace.emit("window-added", workspace, deadWindow);
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(true);

    // The debounce fires after the window was finalized: the per-window guard
    // swallows the throw (forge-wqlx) and the bag slot is cleared on fire.
    expect(() => timeouts[0]()).not.toThrow();
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);

    // A later window-added must schedule a fresh debounce and reach the
    // reconcile — this is what the wedge silently suppressed.
    const liveWindow = createMockWindow({ wm_class: "App" });
    workspace.emit("window-added", workspace, liveWindow);
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(true);

    timeouts[1]();
    expect(extWm.updateMetaWorkspaceMonitor).toHaveBeenCalledWith(
      "window-added",
      liveWindow.get_monitor(),
      liveWindow
    );
    expect(extWm._wmSources.has("wsWindowAdd")).toBe(false);
  });
});
