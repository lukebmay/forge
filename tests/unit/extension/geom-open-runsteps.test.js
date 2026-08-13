import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createHorizontalLayout,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";

/**
 * AP3: ExternalGeometry / OpenApp / RunSteps formula alignment.
 * docs/dev/actions.md — B-only forge/in-slot; open Cq; RunSteps one Cf + settleTabFocus.
 */
describe("AP3 ExternalGeometry B-only / Cq", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "window-maximize-on-single": true,
      },
    });
    vi.spyOn(ctx.windowManager, "updateBorderLayout").mockImplementation(() => {});
    vi.spyOn(ctx.windowManager, "updateDecorationLayout").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("forge-caused size-changed → B only (no C / markUnsettled)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const meta = first.metaWindow;
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm()._suppressGeom.enter();
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const markSpy = vi.spyOn(wm().layoutController, "markUnsettled");

    meta.move_resize_frame(true, 50, 50, 400, 300);
    wm().updateMetaPositionSize(meta, "size-changed");

    expect(renderSpy).not.toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
  });

  it("TILE in-slot → B only (no onExternalGeometry)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 10, y: 20, width: 900, height: 700 };
    first.nodeWindow.mode = WINDOW_MODES.TILE;
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    first.metaWindow.move_resize_frame(true, slot.x, slot.y, slot.width, slot.height);
    ctx.display.get_focus_window.mockReturnValue(first.metaWindow);

    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});

    wm().updateMetaPositionSize(first.metaWindow, "size-changed");

    expect(onExt).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().updateBorderLayout).toHaveBeenCalled();
  });

  it("external maximize restores the slot once (not commitLayout / float)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const [first] = createHorizontalLayout(ctx.tree, monitor, 2);
    const slot = { x: 0, y: 0, width: 960, height: 1080 };
    first.nodeWindow.renderRect = { ...slot };
    first.nodeWindow.rect = { ...slot };
    const maxed = first.metaWindow;
    maxed.maximize();
    maxed.move_resize_frame(false, 0, 0, 1920, 1080);
    ctx.display.get_focus_window.mockReturnValue(maxed);

    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    const reassertSpy = vi.spyOn(wm(), "reassertNodeToSlot");

    wm().updateMetaPositionSize(maxed, "size-changed");

    expect(reassertSpy).toHaveBeenCalledTimes(1);
    expect(reassertSpy).toHaveBeenCalledWith(first.nodeWindow, { force: true });
    expect(commitSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(first.nodeWindow.mode).toBe(WINDOW_MODES.TILE);
  });
});

describe("AP3 OpenApp commitLayout Cq", () => {
  let ctx;
  let clock;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-on-hover-enabled": false,
        "move-pointer-focus-enabled": false,
        "auto-split-enabled": true,
        "new-window-placement": "pointer",
      },
      globals: {
        display: { monitorCount: 1 },
        workspaceManager: { workspaceCount: 1 },
      },
    });

    // Same fake clock pattern as WindowManager-open-commit.
    let nextId = 1;
    const timers = new Map();
    let now = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    const schedule = (delayMs, cb) => {
      const id = nextId++;
      timers.set(id, { due: now + delayMs, cb });
      return id;
    };
    const cancel = (id) => {
      timers.delete(id);
    };
    const advance = (ms) => {
      now += ms;
      let progressed = true;
      while (progressed) {
        progressed = false;
        const due = [...timers.entries()]
          .filter(([, t]) => t.due <= now)
          .sort((a, b) => a[1].due - b[1].due);
        for (const [id, t] of due) {
          if (!timers.has(id)) continue;
          timers.delete(id);
          t.cb();
          progressed = true;
        }
      }
    };
    const wm = ctx.windowManager;
    wm._openCommitSchedule = schedule;
    wm._openCommitCancel = cancel;
    const origQueue = wm.queueEvent.bind(wm);
    wm.queueEvent = (eventObj, interval = 220) => {
      if (eventObj?.name === "window-create-queue") {
        schedule(interval, () => {
          try {
            eventObj.callback();
          } catch (_e) {
            /* ignore */
          }
        });
        return;
      }
      return origQueue(eventObj, interval);
    };
    clock = {
      advance,
      restore() {
        dateSpy.mockRestore();
      },
    };
  });

  afterEach(() => {
    clock?.restore();
    vi.restoreAllMocks();
    ctx?.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("quiet open uses commitLayout → requestLayout Cq (one path)", () => {
    wm().appThrashCatalog.recordOpen("org.example.Ap3Open");
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");

    const meta = createMockWindow({
      id: "ap3-open",
      wm_class: "org.example.Ap3Open",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 10, y: 10, width: 400, height: 300 },
    });
    wm().trackWindow(null, meta);

    const quiet = wm()._openCommitPending.get(meta).minQuietMs;
    clock.advance(quiet);
    clock.advance(0);

    expect(commitSpy).toHaveBeenCalledWith(
      "window-create",
      expect.objectContaining({ force: false })
    );
    expect(requestSpy).toHaveBeenCalledWith("window-create");
    expect(renderSpy).not.toHaveBeenCalledWith("window-create", true);
  });

  it("LayoutBatch end residual: one commitLayout Cf (not double)", () => {
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");

    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });
    wm().appThrashCatalog.recordOpen("org.example.Ap3Batch");
    const meta = createMockWindow({
      id: "ap3-batch",
      wm_class: "org.example.Ap3Batch",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 10, y: 10, width: 400, height: 300 },
    });
    wm().trackWindow(null, meta);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end.committed).toBe(true);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith("open-batch", expect.objectContaining({ force: true }));
    expect(lcSpy).not.toHaveBeenCalled();
  });
});

describe("AP3 RunSteps one Cf + settleTabFocus", () => {
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
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("RunSteps residual uses commitLayout force once + schedules settle", () => {
    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    const commitSpy = vi.spyOn(ctx.windowManager, "commitLayout").mockImplementation(() => {});
    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
    const settleSpy = vi.spyOn(api, "_settleAfterRunSteps").mockImplementation(() => {});

    const out = JSON.parse(api.RunSteps(JSON.stringify([{ op: "ping" }])));
    expect(out.ok).toBe(true);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith("run-steps", { force: true });
    // Cf only via commitLayout — no parallel naked renderTree from RunSteps.
    expect(renderSpy).not.toHaveBeenCalled();
    expect(settleSpy).toHaveBeenCalledWith(ctx.windowManager);
  });

  it("_settleAfterRunSteps uses settleTabFocus (no second C, no Dfull)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = ctx.windowManager.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.TABBED;

    const wA = createMockWindow({ id: "ap3-sa" });
    const wB = createMockWindow({ id: "ap3-sb" });
    ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = ctx.windowManager.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, wB);
    con.lastTabFocus = wB;

    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });

    const settleSpy = vi.spyOn(ctx.windowManager, "settleTabFocus").mockImplementation(() => {});
    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
    // Naked Dfull would call updateDecorationLayout() with no scope args.
    const decoSpy = vi
      .spyOn(ctx.windowManager, "updateDecorationLayout")
      .mockImplementation(() => {});

    api._settleAfterRunSteps(ctx.windowManager);

    expect(settleSpy).toHaveBeenCalledWith(nB);
    expect(renderSpy).not.toHaveBeenCalled();
    // settleTabFocus owns Dfocus; settle path must not also do unscoped Dfull.
    expect(decoSpy).not.toHaveBeenCalled();
  });
});
