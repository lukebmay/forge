import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createWindowManagerFixture,
  createMockWindow,
  createWindowNode,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import {
  OPEN_COMMIT_MAX_WAIT_MS,
  OPEN_DEFAULT_QUIET_MS,
  OPEN_DOCK_QUIET_MS,
  OPEN_FIRST_OPEN_EXTRA_MS,
  computeOpenMinQuietMs,
} from "../../../lib/extension/layout-open.js";
import { GHOSTTY_MIN_QUIET_MS } from "../../../lib/extension/app-thrash-catalog.js";
import {
  LayoutController,
  LAYOUT_REQUEST_DEBOUNCE_MS,
} from "../../../lib/extension/layout-controller.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import GLib from "gi://GLib";

/**
 * Install injectable open-commit clock (GLib.timeout_add mock never fires).
 */
function installOpenFakeClock(wm) {
  let nextId = 1;
  const timers = new Map();
  let now = 1_000_000;

  // Drive Date.now used by open-commit state.
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

  wm._openCommitSchedule = schedule;
  wm._openCommitCancel = cancel;

  // queueEvent uses GLib.timeout_add which never fires — invoke commit body
  // by also routing queueEvent through the same clock for open tests.
  const origQueue = wm.queueEvent.bind(wm);
  wm.queueEvent = (eventObj, interval = 220) => {
    // Run open-create callbacks on our fake clock so tests can assert commit.
    if (eventObj?.name === "window-create-queue") {
      schedule(interval, () => {
        try {
          eventObj.callback();
        } catch (_e) {
          // mirror queueEvent warn path
        }
      });
      return;
    }
    return origQueue(eventObj, interval);
  };

  return {
    advance,
    get now() {
      return now;
    },
    setNow(t) {
      now = t;
    },
    restore() {
      dateSpy.mockRestore();
    },
    pendingCount: () => timers.size,
  };
}

describe("WindowManager open commit (CL4)", () => {
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
    clock = installOpenFakeClock(ctx.windowManager);
  });

  afterEach(() => {
    clock?.restore();
    ctx?.cleanup();
  });

  const wm = () => ctx.windowManager;

  function trackNew(overrides = {}) {
    const meta = createMockWindow({
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 10, y: 10, width: 400, height: 300 },
      ...overrides,
    });
    wm().trackWindow(null, meta);
    return meta;
  }

  it("schedules open commit with default quiet (not blind createDelay render)", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    const meta = trackNew({ id: "plain-app", wm_class: "org.example.App" });

    expect(wm()._openCommitPending.has(meta)).toBe(true);
    const state = wm()._openCommitPending.get(meta);
    expect(state.minQuietMs).toBe(
      computeOpenMinQuietMs({
        firstOpen: true,
        catalogMinQuietMs: 0,
      })
    );
    expect(state.minQuietMs).toBe(OPEN_DEFAULT_QUIET_MS + OPEN_FIRST_OPEN_EXTRA_MS);

    // Before quiet: no window-create layout
    clock.advance(state.minQuietMs - 1);
    expect(requestSpy).not.toHaveBeenCalledWith("window-create");
    // queueEvent for create may not have run
    expect(renderSpy).not.toHaveBeenCalledWith("window-create", true);

    clock.advance(1);
    // quiet → queueEvent(0) → requestLayout
    clock.advance(0);
    expect(requestSpy).toHaveBeenCalledWith("window-create");
    expect(wm()._openCommitPending.has(meta)).toBe(false);
  });

  it("ghostty uses catalog minQuiet ≥ built-in (after first open of class)", () => {
    // Seed: first open of ghostty so second uses no first-open extra
    wm().appThrashCatalog.recordOpen("com.mitchellh.ghostty");

    const meta = trackNew({
      id: "ghostty-2",
      wm_class: "com.mitchellh.ghostty",
    });
    const state = wm()._openCommitPending.get(meta);
    expect(state.minQuietMs).toBeGreaterThanOrEqual(GHOSTTY_MIN_QUIET_MS);
    expect(state.minQuietMs).toBe(
      computeOpenMinQuietMs({
        catalogMinQuietMs: GHOSTTY_MIN_QUIET_MS,
        firstOpen: false,
      })
    );
  });

  it("dock open uses short floor (50) via same pipeline", () => {
    wm().noteDockLaunch?.(0, { appId: "org.gnome.Nautilus.desktop" });
    // Without dock match, force openPlan via schedule directly after track
    const meta = trackNew({ id: "dockish", wm_class: "org.gnome.Nautilus" });
    // Re-schedule as dock to assert floor without depending on Shell App matcher
    wm()._scheduleOpenCommit(meta, { isDock: true });
    const state = wm()._openCommitPending.get(meta);
    expect(state.minQuietMs).toBe(OPEN_DOCK_QUIET_MS);
    expect(state.isDock).toBe(true);
  });

  it("quiet timer resets on external size-changed before fire", () => {
    wm().appThrashCatalog.recordOpen("org.example.Reset"); // not first-open extra
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const meta = trackNew({ id: "reset-app", wm_class: "org.example.Reset" });
    const quiet = wm()._openCommitPending.get(meta).minQuietMs;
    expect(quiet).toBe(OPEN_DEFAULT_QUIET_MS);

    clock.advance(quiet - 20);
    expect(requestSpy).not.toHaveBeenCalledWith("window-create");

    // External thrash resets quiet
    wm().updateMetaPositionSize(meta, "size-changed");
    expect(wm()._openCommitPending.has(meta)).toBe(true);

    clock.advance(quiet - 1);
    expect(requestSpy).not.toHaveBeenCalledWith("window-create");

    clock.advance(1);
    clock.advance(0);
    expect(requestSpy).toHaveBeenCalledWith("window-create");
  });

  it("max-wait forces commit even if never quiet", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const meta = trackNew({ id: "thrash-forever", wm_class: "org.example.Thrash" });
    const quiet = wm()._openCommitPending.get(meta).minQuietMs;

    // Keep resetting quiet just before fire until past max wait
    let elapsed = 0;
    while (elapsed < OPEN_COMMIT_MAX_WAIT_MS) {
      const step = Math.min(quiet - 1, OPEN_COMMIT_MAX_WAIT_MS - elapsed);
      if (step <= 0) break;
      clock.advance(step);
      elapsed += step;
      if (elapsed < OPEN_COMMIT_MAX_WAIT_MS && wm()._openCommitPending.has(meta)) {
        wm().updateMetaPositionSize(meta, "size-changed");
      }
    }
    // Cross max wait
    if (wm()._openCommitPending.has(meta)) {
      clock.advance(OPEN_COMMIT_MAX_WAIT_MS);
    }
    clock.advance(0);
    expect(requestSpy).toHaveBeenCalledWith("window-create");
    expect(wm()._openCommitPending.has(meta)).toBe(false);
  });

  it("cancels pending open commit on destroy", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const meta = trackNew({ id: "die-soon", wm_class: "org.example.Die" });
    expect(wm()._openCommitPending.has(meta)).toBe(true);

    const actor = meta.get_compositor_private();
    wm().windowDestroy(actor);

    expect(wm()._openCommitPending.has(meta)).toBe(false);
    clock.advance(OPEN_COMMIT_MAX_WAIT_MS + OPEN_DEFAULT_QUIET_MS + 100);
    expect(requestSpy).not.toHaveBeenCalledWith("window-create");
  });

  it("records catalog open for the class", () => {
    const before = wm().appThrashCatalog.lookup("org.example.Count");
    expect(before).toBeNull();
    trackNew({ id: "count-me", wm_class: "org.example.Count" });
    const e = wm().appThrashCatalog.lookup("org.example.Count");
    expect(e).toBeTruthy();
    expect(e.seenOpens).toBe(1);
    expect(e.firstOpenObserved).toBe(true);
  });

  it("force renderTree when frozen; still one open commit", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    wm().appThrashCatalog.recordOpen("org.example.Frozen");
    const meta = trackNew({ id: "frozen", wm_class: "org.example.Frozen" });
    wm()._freezeRender = true;

    const quiet = wm()._openCommitPending.get(meta).minQuietMs;
    clock.advance(quiet);
    clock.advance(0);

    expect(renderSpy).toHaveBeenCalledWith("window-create", true);
    expect(requestSpy).not.toHaveBeenCalledWith("window-create");
  });

  it("CL5 open-layout batch: N opens latch need-commit, no mid-batch layout", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");

    expect(wm().beginOpenLayoutBatch()).toEqual({ ok: true, depth: 1 });
    expect(wm().openLayoutBatchActive).toBe(true);

    const metas = [];
    for (let i = 0; i < 3; i++) {
      // Pre-seed class so quiet is default (not first-open extra) and equal.
      wm().appThrashCatalog.recordOpen(`org.example.Batch${i}`);
      metas.push(
        trackNew({
          id: `batch-${i}`,
          wm_class: `org.example.Batch${i}`,
        })
      );
    }

    expect(metas.every((m) => wm()._openCommitPending.has(m))).toBe(true);
    const maxQuiet = Math.max(...metas.map((m) => wm()._openCommitPending.get(m).minQuietMs));

    // One advance past all quiets → each open commit fires without layout
    clock.advance(maxQuiet + 1);
    clock.advance(0);

    expect(requestSpy).not.toHaveBeenCalled();
    expect(lcSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalledWith("window-create", true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);
    expect(metas.every((m) => !wm()._openCommitPending.has(m))).toBe(true);

    // Direct requestLayout during batch also only latches
    wm().requestLayout("sensor-noise");
    expect(lcSpy).not.toHaveBeenCalled();
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end).toMatchObject({
      ok: true,
      depth: 0,
      committed: true,
      wasActive: true,
    });
    expect(wm().openLayoutBatchActive).toBe(false);
    // end bypasses WM gate → layoutController.requestLayout once
    expect(lcSpy).toHaveBeenCalledTimes(1);
    expect(lcSpy).toHaveBeenCalledWith("open-batch");
    expect(wm()._openLayoutBatchNeedsCommit).toBe(false);
  });

  it("CL5 residual renderTree schedule clears need-commit (real path, no double fire)", () => {
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.Residual");
    const meta = trackNew({ id: "residual", wm_class: "org.example.Residual" });
    const quiet = wm()._openCommitPending.get(meta).minQuietMs;
    clock.advance(quiet + 1);
    clock.advance(0);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Residual RunSteps: real renderTree path (sync idle mock runs body).
    // Schedule-time clear so end does not requestLayout again.
    wm().renderTree("run-steps", true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(false);

    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end.committed).toBe(false);
    expect(lcSpy).not.toHaveBeenCalled();
  });

  it("CL5 residual+end race: deferred idle + end does not double-fire layout", () => {
    const realIdle = GLib.idle_add;
    const pending = [];
    GLib.idle_add = (_priority, cb) => {
      pending.push(cb);
      return pending.length;
    };
    try {
      const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
      const treeRenderSpy = vi.spyOn(wm().tree, "render");

      wm().beginOpenLayoutBatch();
      wm()._openLayoutBatchNeedsCommit = true;

      // Residual schedules idle; need-commit cleared at schedule time.
      wm().renderTree("run-steps", true);
      expect(wm()._renderTreeSrcId).not.toBe(0);
      expect(wm()._openLayoutBatchNeedsCommit).toBe(false);
      expect(treeRenderSpy).not.toHaveBeenCalled();

      // End before idle flushes — must not requestLayout (residual owns commit).
      const end = wm().endOpenLayoutBatch("open-batch");
      expect(end.committed).toBe(false);
      expect(lcSpy).not.toHaveBeenCalled();

      // Flush residual idle once.
      while (pending.length) {
        const cb = pending.shift();
        cb();
      }
      expect(treeRenderSpy).toHaveBeenCalledTimes(1);
      expect(lcSpy).not.toHaveBeenCalled();
    } finally {
      GLib.idle_add = realIdle;
    }
  });

  it("CL5 external geom after open-commit mid-batch does not fire layout", () => {
    let nextId = 1;
    const timers = new Map();
    let now = 0;
    const schedule = (delayMs, cb) => {
      const id = nextId++;
      timers.set(id, { due: now + delayMs, cb });
      return id;
    };
    const cancel = (id) => {
      timers.delete(id);
    };
    const advanceLc = (ms) => {
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
    wm().layoutController.destroy();
    wm().layoutController = new LayoutController(wm(), { schedule, cancel });

    const renderSpy = vi.spyOn(wm(), "renderTree");
    expect(wm().beginOpenLayoutBatch()).toEqual({ ok: true, depth: 1 });

    wm().appThrashCatalog.recordOpen("org.example.ExtMid");
    const meta = trackNew({ id: "ext-mid", wm_class: "org.example.ExtMid" });
    const quiet = wm()._openCommitPending.get(meta).minQuietMs;
    clock.advance(quiet + 1);
    clock.advance(0);
    // Open commit finished — pending cleared; need-commit latched.
    expect(wm()._openCommitPending.has(meta)).toBe(false);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Live path after open: controller onExternalGeometry (not wm.requestLayout gate alone).
    wm().layoutController.onExternalGeometry("size-changed", meta);
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().layoutController.layoutPending).toBe(false);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // verify-mismatch also goes through controller.requestLayout
    wm().layoutController.requestLayout("verify-mismatch");
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Full sensor path: TILE drift after open no longer open-pending
    const node = wm().findNodeWindow(meta) ?? wm().tree?.findNode?.(meta);
    if (node) {
      node.mode = WINDOW_MODES.TILE;
      node.renderRect = { x: 0, y: 0, width: 800, height: 600 };
      node.rect = { ...node.renderRect };
      meta.move_resize_frame?.(true, 200, 200, 400, 300);
    }
    ctx.display.get_focus_window.mockReturnValue(meta);
    // Seed a focusable TILE node if trackNew left FLOAT-only
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { metaWindow: focusMeta, nodeWindow } = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        id: "focus-ext-mid",
        workspace: ctx.workspaces[0],
        monitor: 0,
        rect: { x: 0, y: 0, width: 800, height: 600 },
      },
    });
    nodeWindow.renderRect = { x: 0, y: 0, width: 800, height: 600 };
    nodeWindow.rect = { ...nodeWindow.renderRect };
    focusMeta.move_resize_frame?.(true, 120, 120, 300, 200);
    ctx.display.get_focus_window.mockReturnValue(focusMeta);

    wm().updateMetaPositionSize(focusMeta, "size-changed");
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end.committed).toBe(true);
    // End requests layout once after batch; debounce may schedule renderTree.
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).toHaveBeenCalled();
  });

  it("CL5 nest depth: only outermost end commits", () => {
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });
    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 2 });
    expect(wm().openLayoutBatchActive).toBe(true);

    wm()._openLayoutBatchNeedsCommit = true;
    expect(wm().endOpenLayoutBatch("inner")).toMatchObject({
      ok: true,
      depth: 1,
      committed: false,
      wasActive: true,
    });
    expect(lcSpy).not.toHaveBeenCalled();
    expect(wm().openLayoutBatchActive).toBe(true);

    expect(wm().endOpenLayoutBatch("open-batch")).toMatchObject({
      ok: true,
      depth: 0,
      committed: true,
      wasActive: true,
    });
    expect(lcSpy).toHaveBeenCalledTimes(1);
    expect(lcSpy).toHaveBeenCalledWith("open-batch");
    expect(wm().openLayoutBatchActive).toBe(false);
  });

  it("CL5 end without begin is a no-op", () => {
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
    expect(wm().openLayoutBatchActive).toBe(false);
    expect(wm().endOpenLayoutBatch("open-batch")).toMatchObject({
      ok: true,
      depth: 0,
      committed: false,
      wasActive: false,
    });
    expect(lcSpy).not.toHaveBeenCalled();
  });

  it("does not requestLayout for external geom while open pending", () => {
    const onExt = vi.spyOn(wm().layoutController, "onExternalGeometry");
    const meta = trackNew({ id: "no-early", wm_class: "org.example.NoEarly" });
    // Seed a focus node so normal path would otherwise run
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        id: "focus-holder",
        workspace: ctx.workspaces[0],
        monitor: 0,
      },
    });

    wm().updateMetaPositionSize(meta, "size-changed");
    expect(onExt).not.toHaveBeenCalled();
    expect(wm()._openCommitPending.has(meta)).toBe(true);
  });

  it("disables cancel all open commits", () => {
    const meta = trackNew({ id: "disable-me", wm_class: "org.example.Disable" });
    expect(wm()._openCommitPending.has(meta)).toBe(true);
    wm()._cancelAllOpenCommits();
    expect(wm()._openCommitPending.size).toBe(0);
  });
});

describe("CL4 vs layout controller layering", () => {
  it("keeps requestLayout debounce constant", () => {
    expect(LAYOUT_REQUEST_DEBOUNCE_MS).toBe(200);
  });
});
