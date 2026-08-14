import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  setPointer,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";

/**
 * R021–R024: live dual-mon nautilus / first layout apply.
 *
 * Assert the observable forest after the user gesture — not helper internals.
 */
describe("R021–R024: empty-head open, leaf empty-mon drag, nest drop, first layout TILE", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        workspaceManager: { workspaceCount: 1 },
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
      settings: {
        "auto-split-enabled": true,
        "new-window-placement": "pointer",
        "tiling-mode-enabled": true,
        "dnd-center-layout": "TABBED",
        "preview-hint-enabled": true,
      },
    });
    ctx.extension.keybindings = { allowDragDropTile: () => true };
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  function tile(parent, spec) {
    const meta = createMockWindow({
      workspace: workspace0(),
      ...spec,
    });
    const node = ctx.tree.createNode(parent.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    return { meta, node };
  }

  function monitorOf(node) {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    if (mon1.contains(node)) return 1;
    if (mon0.contains(node)) return 0;
    return -1;
  }

  describe("R021 empty-head open", () => {
    it("third window opened with pointer on empty right mon stays on the right", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "nau-a",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      });
      tile(mon0, {
        id: "nau-b",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
      });
      wm().movePointerWith(a.node);
      global.display.get_focus_window.mockReturnValue(a.meta);
      ctx.display.get_current_monitor.mockReturnValue(0);
      setPointer(2400, 400);

      const opened = createMockWindow({
        id: "nau-c",
        workspace: workspace0(),
        monitor: 0,
        rect: new Rectangle({ x: 100, y: 100, width: 800, height: 600 }),
      });
      wm().trackWindow(null, opened);

      const node = wm().findNodeWindow(opened);
      expect(monitorOf(node)).toBe(1);
      expect(mon0.contains(node)).toBe(false);
      expect(mon0.getNodeByType(NODE_TYPES.WINDOW).length).toBe(2);
    });
  });

  describe("R022 empty-mon drag of a nested leaf", () => {
    it("dragging lower-right of HSPLIT(A, VSPLIT(B,C)) to empty mon1 moves only C", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      const a = tile(mon0, {
        id: "A",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      });
      const vsplit = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      vsplit.layout = LAYOUT_TYPES.VSPLIT;
      const b = tile(vsplit, {
        id: "B",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 540 }),
      });
      const c = tile(vsplit, {
        id: "C",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 540, width: 960, height: 540 }),
      });
      c.meta.get_work_area_for_monitor = vi.fn((idx) =>
        idx === 1
          ? { x: 1920, y: 0, width: 1920, height: 1080 }
          : { x: 0, y: 0, width: 1920, height: 1080 }
      );
      c.meta.move_to_monitor = vi.fn((idx) => {
        c.meta.monitor = idx;
      });
      c.node.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = c.node;
      c.meta.get_monitor = vi.fn(() => 1);
      b.meta.get_monitor = vi.fn(() => 1);

      setPointer(2400, 500);
      wm().nodeWinAtPointer = null;
      wm().moveWindowToPointer(c.node, false);

      expect(monitorOf(c.node)).toBe(1);
      expect(monitorOf(a.node)).toBe(0);
      expect(monitorOf(b.node)).toBe(0);
      expect(mon1.getNodeByType(NODE_TYPES.WINDOW).map((n) => n.nodeValue.id)).toEqual(["C"]);
      expect(mon0.contains(b.node)).toBe(true);
    });
  });

  describe("R023 BOTTOM nest under HSPLIT", () => {
    it("BOTTOM on the left of a 2-wide MONITOR HSPLIT nests VSPLIT + keeps the right sibling", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const left = tile(mon0, {
        id: "left",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      });
      const right = tile(mon0, {
        id: "right",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
      });
      const dragged = tile(mon0, {
        id: "from-right-mon",
        monitor: 0,
        rect: new Rectangle({ x: 400, y: 400, width: 200, height: 200 }),
      });
      dragged.node.mode = WINDOW_MODES.GRAB_TILE;
      wm()._draggedNodeWindow = dragged.node;

      setPointer(480, 1000);
      wm().nodeWinAtPointer = left.node;
      wm().moveWindowToPointer(dragged.node, false);

      expect(mon0.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(mon0.childNodes.length).toBe(2);
      expect(right.node.parentNode).toBe(mon0);
      const nest = dragged.node.parentNode;
      expect(nest.nodeType).toBe(NODE_TYPES.CON);
      expect(nest.layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(nest.parentNode).toBe(mon0);
      expect(nest.childNodes).toEqual(expect.arrayContaining([left.node, dragged.node]));
      expect(nest.childNodes).not.toContain(right.node);
    });
  });

  describe("R024 first layout apply still paints TILE", () => {
    it("RunSteps with leftover drag freeze still force-commits", () => {
      const api = new SessionApi({
        extWm: wm(),
        settings: ctx.settings,
      });
      wm()._freezeRender = true;
      const commit = vi.spyOn(wm(), "commitLayout");

      const out = JSON.parse(api.RunSteps(JSON.stringify({ steps: [{ op: "ping" }] })));
      expect(out.ok).toBe(true);
      expect(wm()._freezeRender).toBe(false);
      expect(commit).toHaveBeenCalledWith("run-steps", { force: true });
    });

    it("endOpenLayoutBatch processFloats + force-commits even with a stale render idle", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      const floated = tile(mon0, {
        id: "role-win",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
      });
      floated.node.mode = WINDOW_MODES.FLOAT;
      wm()._wmSources.setIdle("renderTree", () => {});
      wm().beginOpenLayoutBatch();
      wm()._openLayoutBatchNeedsCommit = true;

      const end = wm().endOpenLayoutBatch("open-batch");
      expect(end.committed).toBe(true);
      expect(floated.node.mode).toBe(WINDOW_MODES.TILE);
    });

    it("mid-batch renderTree clearing the latch still force-paints at batch end", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      const floated = tile(mon0, {
        id: "green-first",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 800, height: 600 }),
      });
      floated.node.mode = WINDOW_MODES.FLOAT;
      const commit = vi.spyOn(wm(), "commitLayout");
      wm().beginOpenLayoutBatch();
      wm()._openLayoutBatchNeedsCommit = true;
      wm().renderTree("run-steps", true);
      expect(wm()._openLayoutBatchNeedsCommit).toBe(false);

      const end = wm().endOpenLayoutBatch("open-batch");
      expect(end.committed).toBe(true);
      expect(commit).toHaveBeenCalledWith("open-batch", { force: true });
      expect(floated.node.mode).toBe(WINDOW_MODES.TILE);
    });
  });
});
