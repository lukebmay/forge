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
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
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

  it("ghostty uses default open quiet when catalog seed is 0 (SE10)", () => {
    // Seed: first open of ghostty so second uses no first-open extra
    wm().appThrashCatalog.recordOpen("com.mitchellh.ghostty");

    const meta = trackNew({
      id: "ghostty-2",
      wm_class: "com.mitchellh.ghostty",
    });
    const state = wm()._openCommitPending.get(meta);
    // SE10: no built-in minQuiet seed → OPEN_DEFAULT_QUIET_MS path
    expect(state.minQuietMs).toBe(
      computeOpenMinQuietMs({
        catalogMinQuietMs: GHOSTTY_MIN_QUIET_MS,
        firstOpen: false,
      })
    );
    expect(state.minQuietMs).toBe(OPEN_DEFAULT_QUIET_MS);
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

  it("CL5/CL8 open-layout batch: deferred hidden admit, no mid-batch layout", () => {
    const requestSpy = vi.spyOn(wm(), "requestLayout");
    const renderSpy = vi.spyOn(wm(), "renderTree");
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const insertSpy = vi.spyOn(wm(), "_insertChildPercent");
    const scheduleSpy = vi.spyOn(wm(), "_scheduleOpenCommit");

    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });
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

    // CL8: no open quiet commit / no percent carve while batch active.
    expect(metas.every((m) => !wm()._openCommitPending.has(m))).toBe(true);
    expect(metas.every((m) => wm()._isDeferredOpen(m))).toBe(true);
    expect(scheduleSpy).not.toHaveBeenCalled();
    // insertChildPercent only for non-deferred paths; none of these should carve.
    const deferredInserts = insertSpy.mock.calls.filter(([parent, child]) =>
      metas.some((m) => child?.nodeValue === m || child === m)
    );
    expect(deferredInserts).toHaveLength(0);

    for (const m of metas) {
      const actor = m.get_compositor_private();
      expect(actor.opacity).toBe(0);
      const node = wm().findNodeWindow(m) || wm().tree.findNode(m);
      expect(node).toBeTruthy();
      // Map RESYNC under TILES may TILE the live; CL8 contract is deferred+hidden.
      expect(wm()._isDeferredOpen(m)).toBe(true);
    }

    expect(requestSpy).not.toHaveBeenCalled();
    expect(lcSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalledWith("window-create", true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

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
    // end releases deferred (opacity restored) + force-paint (R024)
    expect(metas.every((m) => !wm()._isDeferredOpen(m))).toBe(true);
    for (const m of metas) {
      expect(m.get_compositor_private().opacity).toBe(255);
    }
    expect(lcSpy).not.toHaveBeenCalled();
    expect(commitSpy).toHaveBeenCalledWith("open-batch", { force: true });
    expect(wm()._openLayoutBatchNeedsCommit).toBe(false);
  });

  it("CL5 residual renderTree schedule clears need-commit (real path, no double fire)", () => {
    const lcSpy = vi.spyOn(wm().layoutController, "requestLayout");
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.Residual");
    const meta = trackNew({ id: "residual", wm_class: "org.example.Residual" });
    // CL8: deferred admit latches need immediately (no open quiet).
    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Residual RunSteps: real renderTree path (sync idle mock runs body).
    // Schedule-time clear so end does not requestLayout again.
    wm().renderTree("run-steps", true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(false);

    const commitSpy = vi.spyOn(wm(), "commitLayout");
    const end = wm().endOpenLayoutBatch("open-batch");
    expect(end.committed).toBe(true);
    expect(commitSpy).toHaveBeenCalledWith("open-batch", { force: true });
    expect(lcSpy).not.toHaveBeenCalled();
    expect(wm()._isDeferredOpen(meta)).toBe(false);
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
      // D100/G8n: seeded present uses presentSeededForest; processFloats is the shared body probe.
      const presentSpy = vi.spyOn(wm(), "processFloats");

      wm().beginOpenLayoutBatch();
      wm()._openLayoutBatchNeedsCommit = true;

      // Residual schedules idle; need-commit cleared at schedule time.
      wm().renderTree("run-steps", true);
      expect(wm()._wmSources.has("renderTree")).toBe(true);
      expect(wm()._openLayoutBatchNeedsCommit).toBe(false);
      expect(presentSpy).not.toHaveBeenCalled();

      const origRemove = GLib.Source.remove;
      GLib.Source.remove = (id) => {
        if (id >= 1 && id <= pending.length) pending[id - 1] = null;
        return true;
      };
      try {
        // End still force-paints after releasing deferred (R024).
        // endOpenLayoutBatch also calls processFloats sync before scheduling Cf.
        const end = wm().endOpenLayoutBatch("open-batch");
        expect(end.committed).toBe(true);
        expect(lcSpy).not.toHaveBeenCalled();
        expect(presentSpy).toHaveBeenCalledTimes(1);
      } finally {
        GLib.Source.remove = origRemove;
      }

      presentSpy.mockClear();
      while (pending.length) {
        const cb = pending.shift();
        if (cb) cb();
      }
      // Idle present body runs once (not a second layout-controller fire).
      expect(presentSpy).toHaveBeenCalledTimes(1);
      expect(lcSpy).not.toHaveBeenCalled();
    } finally {
      GLib.idle_add = realIdle;
    }
  });

  it("CL5/CL8 external geom mid-batch deferred does not fire layout", () => {
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
    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });

    wm().appThrashCatalog.recordOpen("org.example.ExtMid");
    const meta = trackNew({ id: "ext-mid", wm_class: "org.example.ExtMid" });
    // CL8: deferred admit — no open quiet; need-commit latched; still FLOAT.
    expect(wm()._openCommitPending.has(meta)).toBe(false);
    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // External geom is sensor-only (no requestLayout); need-commit stays latched
    // from deferred open, not from geometry.
    wm().layoutController.onExternalGeometry("size-changed", meta);
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm().layoutController.layoutPending).toBe(false);
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Explicit requestLayout still latches need-commit mid-batch (no mid-batch fire).
    wm().layoutController.requestLayout("batch-force");
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(wm()._openLayoutBatchNeedsCommit).toBe(true);

    // Full sensor path on a pre-existing TILE node mid-batch
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
    expect(wm()._isDeferredOpen(meta)).toBe(false);
    // End requests layout once after batch; debounce may schedule renderTree.
    advanceLc(LAYOUT_REQUEST_DEBOUNCE_MS + 10);
    expect(renderSpy).toHaveBeenCalled();
  });

  it("CL8 N=1 without LayoutBatch still schedules open commit", () => {
    const scheduleSpy = vi.spyOn(wm(), "_scheduleOpenCommit");
    const insertSpy = vi.spyOn(wm(), "_insertChildPercent");
    wm().appThrashCatalog.recordOpen("org.example.Solo");
    const meta = trackNew({ id: "solo", wm_class: "org.example.Solo" });
    expect(wm().openLayoutBatchActive).toBe(false);
    expect(wm()._isDeferredOpen(meta)).toBe(false);
    expect(wm()._openCommitPending.has(meta)).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalled();
  });

  it("CL8 PlaceNext deferred open moves to home monitor", () => {
    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });
    // Dual mon not required: home 0 still exercises sticky path when mon differs.
    const place = wm().placeNext({ monitor: 0, wmClass: "org.example.PlaceDef" });
    expect(place.ok).toBe(true);

    const meta = createMockWindow({
      id: "place-def",
      wm_class: "org.example.PlaceDef",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 10, y: 10, width: 400, height: 300 },
    });
    const moveSpy = vi.spyOn(meta, "move_to_monitor");
    // Force get_monitor !== home so safeMoveToMonitor actually calls move.
    meta._monitor = 1;
    wm().trackWindow(null, meta);

    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(moveSpy).toHaveBeenCalledWith(0);
    expect(wm()._openCommitPending.has(meta)).toBe(false);

    wm().endOpenLayoutBatch("open-batch");
    expect(wm()._isDeferredOpen(meta)).toBe(false);
  });

  it("CL8 disable releases deferred (no stuck invisible)", () => {
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.DisableDef");
    const meta = trackNew({ id: "disable-def", wm_class: "org.example.DisableDef" });
    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(meta.get_compositor_private().opacity).toBe(0);

    wm().disable();
    expect(wm()._isDeferredOpen(meta)).toBe(false);
    expect(meta.get_compositor_private().opacity).toBe(255);
  });

  it("CL9 releaseDeferredOpens unhides without ending batch", () => {
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.RelDef");
    const meta = trackNew({ id: "rel-def", wm_class: "org.example.RelDef" });
    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(meta.get_compositor_private().opacity).toBe(0);
    expect(wm().openLayoutBatchActive).toBe(true);

    const out = wm().releaseDeferredOpens();
    expect(out).toMatchObject({ ok: true, released: 1, depth: 1 });
    expect(wm()._isDeferredOpen(meta)).toBe(false);
    expect(meta.get_compositor_private().opacity).toBe(255);
    expect(wm().openLayoutBatchActive).toBe(true);

    // Second release is a no-op; end still closes batch.
    expect(wm().releaseDeferredOpens()).toMatchObject({ ok: true, released: 0, depth: 1 });
    expect(wm().endOpenLayoutBatch("open-batch")).toMatchObject({
      ok: true,
      depth: 0,
      wasActive: true,
    });
    expect(wm().openLayoutBatchActive).toBe(false);
  });

  it("SL2: deferred release notes settle pending (mappedAt t0)", () => {
    const tMap = 1_111_000;
    clock.setNow(tMap);
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.SettleDef");
    const meta = trackNew({ id: "settle-def", wm_class: "org.example.SettleDef" });
    expect(wm()._isDeferredOpen(meta)).toBe(true);
    expect(wm().layoutController._settlePending.has(meta)).toBe(false);

    clock.setNow(tMap + 200);
    const out = wm().releaseDeferredOpens();
    expect(out.released).toBe(1);
    expect(wm()._isDeferredOpen(meta)).toBe(false);

    const st = wm().layoutController._settlePending.get(meta);
    expect(st).toBeTruthy();
    expect(st.openedAt).toBe(tMap); // map time, not release time
    expect(st.mismatches).toBe(0);

    // end batch without re-noting a second pending entry
    wm().endOpenLayoutBatch("open-batch");
    expect(wm().layoutController._settlePending.size).toBe(1);
    expect(wm().layoutController._settlePending.get(meta).openedAt).toBe(tMap);
  });

  it("SL2: endOpenLayoutBatch release also notes settle pending", () => {
    const tMap = 2_222_000;
    clock.setNow(tMap);
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.SettleEnd");
    const meta = trackNew({ id: "settle-end", wm_class: "org.example.SettleEnd" });
    expect(wm()._isDeferredOpen(meta)).toBe(true);

    clock.setNow(tMap + 50);
    wm().endOpenLayoutBatch("open-batch");
    expect(wm()._isDeferredOpen(meta)).toBe(false);
    const st = wm().layoutController._settlePending.get(meta);
    expect(st).toBeTruthy();
    expect(st.openedAt).toBe(tMap);
  });

  it("SL2: open-commit note after deferred release keeps earliest t0", () => {
    const tMap = 3_333_000;
    clock.setNow(tMap);
    wm().beginOpenLayoutBatch();
    wm().appThrashCatalog.recordOpen("org.example.DoublePath");
    const meta = trackNew({ id: "double-path", wm_class: "org.example.DoublePath" });
    wm().releaseDeferredOpens();
    expect(wm().layoutController._settlePending.get(meta)?.openedAt).toBe(tMap);

    clock.setNow(tMap + 400);
    // Simulate open-commit path also noting (would use later now).
    wm().layoutController.noteOpenPendingForSettle(meta, Date.now());
    expect(wm().layoutController._settlePending.size).toBe(1);
    expect(wm().layoutController._settlePending.get(meta).openedAt).toBe(tMap);

    wm().endOpenLayoutBatch("open-batch");
  });

  it("CL5 nest depth: only outermost end commits", () => {
    const commitSpy = vi.spyOn(wm(), "commitLayout");
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
    expect(commitSpy).not.toHaveBeenCalled();
    expect(wm().openLayoutBatchActive).toBe(true);

    expect(wm().endOpenLayoutBatch("open-batch")).toMatchObject({
      ok: true,
      depth: 0,
      committed: true,
      wasActive: true,
    });
    expect(commitSpy).toHaveBeenCalledWith("open-batch", { force: true });
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

  it("CT1: endOpenLayoutBatch clears sticky _layoutBindPending", () => {
    wm()._layoutBindPending = true;
    expect(wm().beginOpenLayoutBatch()).toMatchObject({ ok: true, depth: 1 });
    expect(wm()._layoutBindPending).toBe(true);
    expect(wm().endOpenLayoutBatch("open-batch")).toMatchObject({
      ok: true,
      depth: 0,
      wasActive: true,
    });
    expect(wm()._layoutBindPending).toBe(false);
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
