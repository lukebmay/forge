import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import GLib from "gi://GLib";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";

/**
 * H1 soft rehome: overnight auto-lock / workareas thrash can shove Meta.Windows
 * onto the primary. Forge must restore tree placement from last-good geometry
 * without a full wipe when both heads are still present.
 */
describe("H1 soft rehome on workareas thrash", () => {
  let ctx;
  let settleCallbacks;

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
    settleCallbacks = [];
    vi.spyOn(GLib, "timeout_add").mockImplementation((_p, _i, cb) => {
      settleCallbacks.push(cb);
      return 7001;
    });
    // Structure-only assertions; skip real render actors.
    vi.spyOn(ctx.windowManager, "renderTree").mockImplementation(() => {});
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

  function addTiled(id, monIdx, frame) {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, monIdx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = dualGeoms[monIdx];
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

  it("maps each window to max-intersection monitor from last-good frame", () => {
    const leftFrame = { x: 100, y: 100, width: 800, height: 600 };
    const rightFrame = { x: 2000, y: 100, width: 800, height: 600 };
    const { win: leftWin, node: leftNode } = addTiled("L", 0, leftFrame);
    const { win: rightWin, node: rightNode } = addTiled("R", 1, rightFrame);

    // Quiet snapshot (as after a normal render).
    wm()._workareasThrashPending = false;
    wm()._snapshotLastGoodHomes();

    // Thrash: Mutter piles both Meta.Windows onto primary; tree already wrong.
    leftWin._monitor = 0;
    rightWin._monitor = 0;
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    mon0.appendChild(rightNode);
    expect(mon0.contains(rightNode)).toBe(true);

    wm()._onWorkareasChanged(ctx.display);
    expect(wm()._workareasThrashPending).toBe(true);
    // window-entered-monitor would be suppressed while pending.
    fireSettle();

    const { monitor: mon0After } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1After } = getWorkspaceAndMonitor(ctx, 0, 1);
    expect(mon0After.contains(leftNode)).toBe(true);
    expect(mon1After.contains(rightNode)).toBe(true);
    expect(leftWin.get_monitor()).toBe(0);
    expect(rightWin.get_monitor()).toBe(1);
    expect(wm()._workareasThrashPending).toBe(false);
    expect(wm().renderTree).toHaveBeenCalledWith("workareas-soft-rehome");
  });

  it("suppresses window-entered-monitor rehome while thrash is pending", () => {
    const { win } = addTiled("A", 1, { x: 2000, y: 0, width: 400, height: 400 });
    wm()._snapshotLastGoodHomes();
    wm()._workareasThrashPending = true;

    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor").mockImplementation(() => {});
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).not.toHaveBeenCalled();

    wm()._workareasThrashPending = false;
    wm()._onWindowEnteredMonitor(ctx.display, 0, win);
    expect(updateSpy).toHaveBeenCalledWith("window-entered-monitor", 0, win);
  });

  it("falls back to reloadTree when destination monitor node is missing", () => {
    const { win, node } = addTiled("orphan", 0, { x: 10, y: 10, width: 100, height: 100 });
    // Force last-good onto monitor 1, then remove mon1 node.
    wm()._lastGoodHomes.set(win, {
      monitorIndex: 1,
      frame: { x: 2000, y: 10, width: 100, height: 100 },
    });
    const mon1 = tree().findNode("mo1ws0");
    if (mon1 && mon1.parentNode) mon1.parentNode.removeChild(mon1);

    const reload = vi.spyOn(wm(), "reloadTree").mockImplementation(() => {});
    wm()._softRehomeAfterWorkareas();
    expect(reload).toHaveBeenCalledWith("workareas-soft-rehome-inconsistent");
    // Window node still exists (not wiped by soft path).
    expect(tree().getNodeByType(NODE_TYPES.WINDOW)).toContain(node);
  });

  it("preserves an intact CON when both children soft-rehome to the same monitor", () => {
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const con = tree().createNode(mon1.nodeValue, NODE_TYPES.CON, "con-right");
    con.layout = LAYOUT_TYPES.VSPLIT;

    const frames = [
      { x: 2000, y: 0, width: 900, height: 500 },
      { x: 2000, y: 500, width: 900, height: 500 },
    ];
    const nodes = frames.map((frame, i) => {
      const win = createMockWindow({
        id: `C${i}`,
        workspace: ctx.workspaces[0],
        monitor: 1,
        rect: frame,
      });
      const n = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, win);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { ...frame };
      return { win, n };
    });

    wm()._snapshotLastGoodHomes();

    // Thrash piles CON onto mon0.
    mon0.appendChild(con);
    for (const { win } of nodes) win._monitor = 0;

    wm()._softRehomeAfterWorkareas();

    expect(mon1.contains(con)).toBe(true);
    expect(con.childNodes).toContain(nodes[0].n);
    expect(con.childNodes).toContain(nodes[1].n);
    expect(nodes[0].win.get_monitor()).toBe(1);
    expect(nodes[1].win.get_monitor()).toBe(1);
  });
});
