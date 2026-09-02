import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * R017: display geometry change (scale/mode) must not thrash via entered-monitor.
 * Compose with R016: suppress rehome while live geom ≠ quiet; settle → retile only.
 */
describe("R017: display geom change must not thrash via entered-monitor", () => {
  let ctx;
  let settleCallbacks;

  /** Quiet dual-mon (logical @1.5 scale-ish). */
  const quietGeoms = [
    { x: 0, y: 0, width: 2560, height: 1440 },
    { x: 2560, y: 0, width: 2560, height: 1440 },
  ];

  /** After scale 1.5→1.0: larger logical rects + mon1 x shifts. */
  const scaledGeoms = [
    { x: 0, y: 0, width: 3840, height: 2160 },
    { x: 3840, y: 0, width: 3840, height: 2160 },
  ];

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: quietGeoms,
        },
      },
    });
    settleCallbacks = [];
    vi.spyOn(GLib, "timeout_add").mockImplementation((_p, _i, cb) => {
      settleCallbacks.push(cb);
      return 8017;
    });
    vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
    // Host-like connectors so scale/size change classifies as retile (not thrash
    // from geom:-keyed stableKey rewrite).
    const mm = ctx.tree?.monitorManager;
    if (mm) {
      vi.spyOn(mm, "collectLiveMonitorsInfo").mockImplementation(() => {
        const n = ctx.display.get_n_monitors();
        const primary =
          typeof ctx.display.get_primary_monitor === "function"
            ? ctx.display.get_primary_monitor()
            : 0;
        const connectors = ["DP-1", "HDMI-1", "DP-2", "HDMI-2"];
        const infos = [];
        for (let i = 0; i < n; i++) {
          const g = ctx.display.get_monitor_geometry(i) || quietGeoms[i] || quietGeoms[0];
          infos.push({
            index: i,
            connector: connectors[i] || `OUT-${i}`,
            name: null,
            isPrimary: i === primary,
            x: g.x ?? 0,
            y: g.y ?? 0,
            width: g.width ?? 0,
            height: g.height ?? 0,
          });
        }
        return infos;
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const tree = () => ctx.tree;

  function fireSettle() {
    const cbs = settleCallbacks.splice(0);
    for (const cb of cbs) cb();
  }

  function setDisplayGeoms(geoms) {
    ctx.display.get_n_monitors = vi.fn(() => geoms.length);
    ctx.display.get_monitor_geometry = vi.fn((i) => {
      const g = geoms[i] || geoms[0];
      return { x: g.x, y: g.y, width: g.width, height: g.height };
    });
    // Invalidate identity map so any path that rebuilds sees new rects.
    wm()._monitorLiveMap = null;
  }

  function addTiled(id, monIdx, frame) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIdx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { ...quietGeoms[monIdx] };
    const win = createMockWindow({
      id,
      workspace: ctx.workspaces[0],
      monitor: monIdx,
      rect: frame,
    });
    const node = tree().createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...frame };
    return { win, node, monitor };
  }

  function addTabbedOnMon1() {
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon1.layout = LAYOUT_TYPES.HSPLIT;
    mon1.rect = { ...quietGeoms[1] };
    const tabs = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "tabs-m1");
    tabs.layout = LAYOUT_TYPES.TABBED;
    const frames = [
      { x: 2600, y: 50, width: 1200, height: 1300 },
      { x: 2700, y: 80, width: 1100, height: 1200 },
    ];
    const nodes = frames.map((frame, i) => {
      const win = createMockWindow({
        id: `T${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(tabs.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });
    return { mon1, tabs, nodes };
  }

  it("geom change + entered-monitor does not reparent (D100)", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    addTiled("L", 0, leftFrame);
    const { mon1, tabs, nodes } = addTabbedOnMon1();
    const rightWin = nodes[0].win;
    const rightNode = nodes[0].n;

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    expect(wm().monitorRecovery.displayGeometryChangedFromQuiet()).toBe(false);

    setDisplayGeoms(scaledGeoms);
    expect(wm().monitorRecovery.displayGeometryChangedFromQuiet()).toBe(true);

    rightWin._monitor = 0;
    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, rightWin);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(mon1.contains(tabs)).toBe(true);
    expect(tabs.contains(rightNode)).toBe(true);
    expect(wm()._workareasThrashPending).toBe(false);
  });

  it("entered-monitor before geom update is deferred; monitors-changed aborts rehome", () => {
    const { mon1, tabs, nodes } = addTabbedOnMon1();
    const rightWin = nodes[0].win;

    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    expect(wm().monitorRecovery.displayGeometryChangedFromQuiet()).toBe(false);

    // Race: entered-monitor while geometry still quiet (pre-monitors-changed).
    rightWin._monitor = 0;
    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, rightWin);
    // Deferred — not rehomed yet.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(wm()._workareasThrashPending).toBe(false);

    // Then geometry updates + workareas/monitors-changed arms thrash.
    setDisplayGeoms(scaledGeoms);
    wm()._queueMonitorRecoveryOnWorkareas();
    expect(wm()._workareasThrashPending).toBe(true);

    // Flush deferred entered-monitor timer(s) — must abort, not rehome.
    fireSettle(); // also runs workareas settle + enteredMonRehome if same mock queue
    // Fire any remaining deferred callbacks that settle didn't drain in order.
    fireSettle();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(mon1.contains(tabs)).toBe(true);
    expect(tabs.contains(nodes[0].n)).toBe(true);
  });

  it("same geometry + entered-monitor does not rehome (D100)", () => {
    const { win } = addTiled("A", 1, { x: 2600, y: 0, width: 400, height: 400 });
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    expect(wm().monitorRecovery.displayGeometryChangedFromQuiet()).toBe(false);

    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).not.toHaveBeenCalled();
    fireSettle();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(wm()._workareasThrashPending).toBe(false);
  });

  it("snapshotLastGoodHomes does not update quiet fp while live geom ≠ quiet", () => {
    addTiled("L", 0, { x: 100, y: 100, width: 400, height: 400 });
    addTiled("R", 1, { x: 2600, y: 100, width: 400, height: 400 });
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();
    const quiet = JSON.parse(JSON.stringify(wm()._lastQuietWorkareasFp));

    setDisplayGeoms(scaledGeoms);
    wm()._snapshotLastGoodHomes();
    expect(wm()._lastQuietWorkareasFp).toEqual(quiet);
  });
});
