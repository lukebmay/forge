import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import St from "gi://St";
import { Node } from "../../../lib/extension/tree.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "../../../lib/extension/tree-types.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createTreeFixture,
  getWorkspaceAndMonitor,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { MotionDirection } from "../../mocks/gnome/Meta.js";

/**
 * Host/helper: Tree.split / Tree.move / Tree.group / swap* / next.
 * Product TILES user verbs go through wm.command / CommandHandler.
 */
describe("Tree Operations (Host/helper)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({ fullExtWm: true });
    // Setup currentMonWsNode for tests
    ctx.extWm.currentMonWsNode = ctx.tree.nodeWorkpaces[0].getNodeByType(NODE_TYPES.MONITOR)[0];
  });

  describe("next", () => {
    it("should find next sibling to the right", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const next = ctx.tree.next(node1, MotionDirection.RIGHT);

      expect(next).toBe(node2);
    });

    it("should find next sibling to the left", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const next = ctx.tree.next(node2, MotionDirection.LEFT);

      expect(next).toBe(node1);
    });

    it("should find next sibling downward", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const next = ctx.tree.next(node1, MotionDirection.DOWN);

      expect(next).toBe(node2);
    });

    it("should find next sibling upward", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const next = ctx.tree.next(node2, MotionDirection.UP);

      expect(next).toBe(node1);
    });

    it("should return null for node at end", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      const next = ctx.tree.next(node, MotionDirection.RIGHT);

      // A lone window at the end of an HSPLIT has no rightward neighbor; next()
      // returns the -1 end-of-list sentinel (toBeDefined() also passed for null
      // or any node, so it could never fail — assert the real contract).
      expect(next).toBe(-1);
    });

    it("should navigate across different orientations", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      // Try to navigate from container to sibling
      const next = ctx.tree.next(container, MotionDirection.RIGHT);

      expect(next).toBe(node2);
    });
  });

  describe("split (Host/helper)", () => {
    it("should create horizontal split container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      ctx.tree.split(node, ORIENTATION_TYPES.HORIZONTAL, true);

      expect(parentOf(ctx.extWm, node).nodeType).toBe(NODE_TYPES.CON);
      expect(parentOf(ctx.extWm, node).layout).toBe(LAYOUT_TYPES.HSPLIT);
    });

    it("should create vertical split container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      ctx.tree.split(node, ORIENTATION_TYPES.VERTICAL, true);

      expect(parentOf(ctx.extWm, node).nodeType).toBe(NODE_TYPES.CON);
      expect(parentOf(ctx.extWm, node).layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should toggle split direction if single child", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;

      const window = createMockWindow();
      const node = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window);

      // Split should toggle the parent layout
      ctx.tree.split(node, ORIENTATION_TYPES.VERTICAL, false);

      expect(container.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("should not toggle if forceSplit is true", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;

      const window = createMockWindow();
      const node = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window);

      ctx.tree.split(node, ORIENTATION_TYPES.VERTICAL, true);

      expect(parentOf(ctx.extWm, node).layout).toBe(LAYOUT_TYPES.VSPLIT);
      expect(parentOf(ctx.extWm, parentOf(ctx.extWm, node))).toBe(container);
    });

    it("should ignore floating windows", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);
      node.mode = WINDOW_MODES.FLOAT;

      const parentBefore = parentOf(ctx.extWm, node);
      ctx.tree.split(node, ORIENTATION_TYPES.HORIZONTAL);

      expect(parentOf(ctx.extWm, node)).toBe(parentBefore);
    });

    it("should preserve node rect and percent", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);
      node.rect = { x: 100, y: 100, width: 500, height: 500 };
      node.percent = 0.6;

      ctx.tree.split(node, ORIENTATION_TYPES.HORIZONTAL, true);

      const container = parentOf(ctx.extWm, node);
      expect(container.rect).toEqual({ x: 100, y: 100, width: 500, height: 500 });
      expect(container.percent).toBe(0.6);
    });

    it("should set attachNode to new container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      ctx.tree.split(node, ORIENTATION_TYPES.HORIZONTAL, true);

      expect(ctx.tree.attachNode).toBe(parentOf(ctx.extWm, node));
    });

    it("wraps the same window node (no value-twin)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      ctx.tree.split(node, ORIENTATION_TYPES.HORIZONTAL, true);

      const con = parentOf(ctx.extWm, node);
      expect(kidsOf(ctx.extWm, con)).toEqual([node]);
      expect(
        ctx.tree.getNodeByType(NODE_TYPES.WINDOW).filter((n) => n.nodeValue === window)
      ).toHaveLength(1);
    });
  });

  describe("slotSplitUnit", () => {
    it("wraps the last of two HSPLIT siblings", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const a = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const b = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      a.percent = 0.5;
      b.percent = 0.5;
      b.userSized = true;

      const wrap = ctx.tree.slotSplitUnit(b, ORIENTATION_TYPES.HORIZONTAL);

      expect(wrap).toBeTruthy();
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(wrap.percent).toBe(0.5);
      expect(wrap.userSized).toBe(true);
      expect(kidsOf(ctx.extWm, wrap)).toEqual([b]);
      expect(kidsOf(ctx.extWm, monitor)).toEqual([a, wrap]);
    });

    it("no-ops when the parent has a single child", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const only = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const parent = parentOf(ctx.extWm, only);

      expect(ctx.tree.slotSplitUnit(only, ORIENTATION_TYPES.HORIZONTAL)).toBeNull();
      expect(parentOf(ctx.extWm, only)).toBe(parent);
    });

    it("no-ops when the parent is TABBED", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const bag = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      bag.layout = LAYOUT_TYPES.TABBED;
      const a = ctx.tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      ctx.tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, createMockWindow());

      expect(ctx.tree.slotSplitUnit(a, ORIENTATION_TYPES.HORIZONTAL)).toBeNull();
      expect(parentOf(ctx.extWm, a)).toBe(bag);
    });
  });

  describe("mergeWindowsIntoGroup", () => {
    it("should convert a two-window HSPLIT CON to TABBED in place", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      con.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(node1, node2, LAYOUT_TYPES.TABBED);

      expect(group).toBe(con);
      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(con.lastTabFocus).toBe(window1);
      expect(parentOf(ctx.extWm, node1)).toBe(con);
      expect(parentOf(ctx.extWm, node2)).toBe(con);
    });

    it("should wrap two of three split siblings into a new TABBED CON", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      con.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node1 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window3);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;
      node3.mode = WINDOW_MODES.TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(node1, node2, LAYOUT_TYPES.TABBED);

      expect(group).not.toBe(con);
      expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(ctx.extWm, node1)).toBe(group);
      expect(parentOf(ctx.extWm, node2)).toBe(group);
      expect(parentOf(ctx.extWm, node3)).toBe(con);
      expect(parentOf(ctx.extWm, group)).toBe(con);
    });

    it("should merge windows from different parents", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const left = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      const right = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      left.layout = LAYOUT_TYPES.HSPLIT;
      right.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(right.nodeValue, NODE_TYPES.WINDOW, window2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(node1, node2, LAYOUT_TYPES.TABBED);

      expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(ctx.extWm, node1)).toBe(group);
      expect(parentOf(ctx.extWm, node2)).toBe(group);
      expect(parentOf(ctx.extWm, group)).toBe(left);
    });

    it("should convert in place when one sibling is GRAB_TILE (DnD CENTER)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      con.layout = LAYOUT_TYPES.VSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.GRAB_TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(node2, node1, LAYOUT_TYPES.TABBED);

      expect(group).toBe(con);
      expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(ctx.extWm, node1)).toBe(con);
      expect(parentOf(ctx.extWm, node2)).toBe(con);
      expect(kidsOf(ctx.extWm, con)).toEqual([node1, node2]);
    });

    it("should no-op when already co-grouped", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      con.layout = LAYOUT_TYPES.TABBED;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, window2);

      const group = ctx.tree.mergeWindowsIntoGroup(node1, node2, LAYOUT_TYPES.TABBED);

      expect(group).toBe(con);
      expect(kidsOf(ctx.extWm, con)).toHaveLength(2);
    });

    it("joins partner into existing TABBED at insertIndex (not always append)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const dest = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      dest.layout = LAYOUT_TYPES.TABBED;
      const src = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      src.layout = LAYOUT_TYPES.HSPLIT;

      const d0 = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const d1 = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const d2 = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const dragged = ctx.tree.createNode(src.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      for (const n of [d0, d1, d2, dragged]) n.mode = WINDOW_MODES.TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(d0, dragged, LAYOUT_TYPES.TABBED, {
        insertIndex: 1,
        group: dest,
      });

      expect(group).toBe(dest);
      expect(kidsOf(ctx.extWm, dest)).toEqual([d0, dragged, d1, d2]);
      expect(parentOf(ctx.extWm, dragged)).toBe(dest);
      expect(kidsOf(ctx.extWm, src)).not.toContain(dragged);
    });

    it("insertWindowIntoGroup appends when index omitted", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const dest = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      dest.layout = LAYOUT_TYPES.TABBED;
      const src = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      const a = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const b = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const extra = ctx.tree.createNode(src.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      for (const n of [a, b, extra]) n.mode = WINDOW_MODES.TILE;

      expect(ctx.tree.insertWindowIntoGroup(dest, extra)).toBe(dest);
      expect(kidsOf(ctx.extWm, dest)).toEqual([a, b, extra]);
    });

    it("insertWindowIntoGroup inserts at 0 and mid", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const dest = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      dest.layout = LAYOUT_TYPES.TABBED;
      const src = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      const a = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const b = ctx.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const first = ctx.tree.createNode(src.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const mid = ctx.tree.createNode(src.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      for (const n of [a, b, first, mid]) n.mode = WINDOW_MODES.TILE;

      ctx.tree.insertWindowIntoGroup(dest, first, 0);
      expect(kidsOf(ctx.extWm, dest)).toEqual([first, a, b]);
      ctx.tree.insertWindowIntoGroup(dest, mid, 2);
      expect(kidsOf(ctx.extWm, dest)).toEqual([first, a, mid, b]);
    });

    it("merge without insertIndex still wraps at focus (append partner)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const left = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      const right = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      left.layout = LAYOUT_TYPES.HSPLIT;
      right.layout = LAYOUT_TYPES.HSPLIT;
      const node1 = ctx.tree.createNode(left.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const node2 = ctx.tree.createNode(right.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const group = ctx.tree.mergeWindowsIntoGroup(node1, node2, LAYOUT_TYPES.TABBED);
      expect(kidsOf(ctx.extWm, group)).toEqual([node1, node2]);
    });
  });

  describe("groupHomeMonitor (D044)", () => {
    it("returns MONITOR ancestor index for CON and WINDOW", () => {
      const mon = getWorkspaceAndMonitor(ctx).monitor;
      const con = ctx.tree.createNode(mon.nodeValue, NODE_TYPES.CON, new Bin());
      con.layout = LAYOUT_TYPES.TABBED;
      const win = createMockWindow();
      const node = ctx.tree.createNode(con.nodeValue, NODE_TYPES.WINDOW, win);

      expect(ctx.tree.groupHomeMonitor(mon)).toBe(0);
      expect(ctx.tree.groupHomeMonitor(con)).toBe(0);
      expect(ctx.tree.groupHomeMonitor(node)).toBe(0);
      expect(ctx.tree.groupHomeMonitor(null)).toBe(-1);
    });
  });

  describe("D044 same-mon groups", () => {
    let dual;

    beforeEach(() => {
      dual = createTreeFixture({
        fullExtWm: true,
        globals: { display: { monitorCount: 2 } },
      });
    });

    afterEach(() => {
      dual.cleanup();
    });

    it("merge across mons lands TABBED on focus mon (dest)", () => {
      const mon0 = getWorkspaceAndMonitor(dual, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(dual, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      const win0 = createMockWindow({ id: "focus", monitor: 0, workspace: dual.workspaces[0] });
      const win1 = createMockWindow({ id: "partner", monitor: 1, workspace: dual.workspaces[0] });
      const focus = dual.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, win0);
      const partner = dual.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, win1);
      focus.mode = WINDOW_MODES.TILE;
      partner.mode = WINDOW_MODES.TILE;

      expect(dual.tree.groupHomeMonitor(focus)).toBe(0);
      expect(dual.tree.groupHomeMonitor(partner)).toBe(1);

      const group = dual.tree.mergeWindowsIntoGroup(focus, partner, LAYOUT_TYPES.TABBED);

      expect(group).toBeTruthy();
      expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(parentOf(dual.extWm, group)).toBe(mon0);
      expect(parentOf(dual.extWm, focus)).toBe(group);
      expect(parentOf(dual.extWm, partner)).toBe(group);
      expect(dual.tree.groupHomeMonitor(group)).toBe(0);
      expect(dual.tree.groupHomeMonitor(partner)).toBe(0);
      expect(kidsOf(dual.extWm, mon1)).not.toContain(partner);
      expect(kidsOf(dual.extWm, mon1)).not.toContain(group);
    });

    it("join-at-index across mons lands on dest group (D044, no span)", () => {
      const mon0 = getWorkspaceAndMonitor(dual, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(dual, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      const dest = dual.tree.createNode(mon1.nodeValue, NODE_TYPES.CON, new Bin());
      dest.layout = LAYOUT_TYPES.TABBED;
      const a = dual.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const b = dual.tree.createNode(dest.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const src = dual.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      for (const n of [a, b, src]) n.mode = WINDOW_MODES.TILE;

      const group = dual.tree.mergeWindowsIntoGroup(a, src, LAYOUT_TYPES.TABBED, {
        insertIndex: 1,
        group: dest,
      });

      expect(group).toBe(dest);
      expect(kidsOf(dual.extWm, dest)).toEqual([a, src, b]);
      expect(dual.tree.groupHomeMonitor(dest)).toBe(1);
      expect(dual.tree.groupHomeMonitor(src)).toBe(1);
      expect(kidsOf(dual.extWm, mon0)).not.toContain(src);
      expect(parentOf(dual.extWm, dest)).toBe(mon1);
    });

    it("Host/helper tree.move: TABBED last member mon-move peels that leaf only", () => {
      const mon0 = getWorkspaceAndMonitor(dual, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(dual, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;
      mon0.rect = { x: 0, y: 0, width: 1920, height: 1080 };
      mon1.rect = { x: 1920, y: 0, width: 1920, height: 1080 };
      dual.extWm.currentMonWsNode = mon0;
      dual.extWm.rectForMonitor.mockReturnValue({ x: 1920, y: 0, width: 960, height: 1080 });

      const tab = new Node(NODE_TYPES.CON, new Bin());
      tab.layout = LAYOUT_TYPES.TABBED;
      mon0.appendChild(tab);
      for (const id of ["a", "b", "nautilus"]) {
        const w = createMockWindow({ id, monitor: 0, workspace: dual.workspaces[0] });
        const n = new Node(NODE_TYPES.WINDOW, w);
        n.mode = WINDOW_MODES.TILE;
        n.rect = { x: 0, y: 0, width: 400, height: 1080 };
        tab.appendChild(n);
      }
      const node = tab.lastChild;

      const moved = dual.tree.move(node, MotionDirection.RIGHT);
      expect(moved).toBe(true);
      expect(parentOf(dual.extWm, node)).toBe(mon1);
      expect(kidsOf(dual.extWm, mon1)).toContain(node);
      expect(parentOf(dual.extWm, tab)).toBe(mon0);
      expect(kidsOf(dual.extWm, tab)).toHaveLength(2);
      expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
    });
  });

  describe("swapPairs (Host/helper)", () => {
    it("should swap two windows in same parent", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      ctx.tree.swapPairs(node1, node2, false);

      expect(kidsOf(ctx.extWm, monitor)).toEqual([node2, node1]);
    });

    it("should swap windows in different parents", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const container1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      const container2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(container1.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(container2.nodeValue, NODE_TYPES.WINDOW, window2);

      ctx.tree.swapPairs(node1, node2, false);

      expect(parentOf(ctx.extWm, node1)).toBe(container2);
      expect(parentOf(ctx.extWm, node2)).toBe(container1);
    });

    it("should exchange modes", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.FLOAT;

      ctx.tree.swapPairs(node1, node2, false);

      expect(node1.mode).toBe(WINDOW_MODES.FLOAT);
      expect(node2.mode).toBe(WINDOW_MODES.TILE);
    });

    it("should exchange percents", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.percent = 0.7;
      node2.percent = 0.3;

      ctx.tree.swapPairs(node1, node2, false);

      expect(node1.percent).toBe(0.3);
      expect(node2.percent).toBe(0.7);
    });

    it("should call WindowManager.move for both windows", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      ctx.tree.swapPairs(node1, node2, false);

      expect(ctx.extWm.move).toHaveBeenCalledTimes(2);
    });

    it("should focus first window if focus=true", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const raiseSpy = vi.spyOn(window1, "raise");
      const focusSpy = vi.spyOn(window1, "focus");

      ctx.tree.swapPairs(node1, node2, true);

      expect(raiseSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
    });

    it("should not swap if first node not swappable", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow({ minimized: true });
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const parentBefore = parentOf(ctx.extWm, node1);
      ctx.tree.swapPairs(node1, node2, false);

      expect(parentOf(ctx.extWm, node1)).toBe(parentBefore);
    });

    it("should not swap if second node not swappable", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow({ minimized: true });
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      const parentBefore = parentOf(ctx.extWm, node1);
      ctx.tree.swapPairs(node1, node2, false);

      expect(parentOf(ctx.extWm, node1)).toBe(parentBefore);
    });

    // forge-u7q6: destructive-op guard branches.
    it("is a structural no-op when swapping a node with itself", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const childrenBefore = kidsOf(ctx.extWm, monitor);
      const indexBefore = childrenBefore.indexOf(node1);

      // Same node as both args: the swap writes node1 back into its own slot,
      // so the parent's child array must keep its identity/order (no duplicated
      // or dropped reference) and node1 keeps its index.
      ctx.tree.swapPairs(node1, node1, false);

      expect(kidsOf(ctx.extWm, monitor).indexOf(node1)).toBe(indexBefore);
      expect(parentOf(ctx.extWm, node1)).toBe(monitor);
      expect(kidsOf(ctx.extWm, monitor)).toEqual(childrenBefore);
    });

    it("skips the swap when the fromNode window is dead (isWindowAlive guard)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      // A finalized MetaWindow throws on any method call; isWindowAlive probes
      // get_id(), so a throwing get_id() marks node1's window as dead.
      window1.get_id = () => {
        throw new Error("Object Meta.Window has been already deallocated");
      };

      const parent1Before = parentOf(ctx.extWm, node1);
      const parent2Before = parentOf(ctx.extWm, node2);
      ctx.extWm.move.mockClear();

      ctx.tree.swapPairs(node1, node2, false);

      expect(parentOf(ctx.extWm, node1)).toBe(parent1Before);
      expect(parentOf(ctx.extWm, node2)).toBe(parent2Before);
      expect(ctx.extWm.move).not.toHaveBeenCalled();
    });

    it("skips the swap when the toNode window is dead (isWindowAlive guard)", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);
      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      window2.get_id = () => {
        throw new Error("Object Meta.Window has been already deallocated");
      };

      const parent1Before = parentOf(ctx.extWm, node1);
      const parent2Before = parentOf(ctx.extWm, node2);
      ctx.extWm.move.mockClear();

      ctx.tree.swapPairs(node1, node2, false);

      expect(parentOf(ctx.extWm, node1)).toBe(parent1Before);
      expect(parentOf(ctx.extWm, node2)).toBe(parent2Before);
      expect(ctx.extWm.move).not.toHaveBeenCalled();
    });
  });

  describe("swap (Host/helper)", () => {
    it("should swap with next window to the right", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const result = ctx.tree.swap(node1, MotionDirection.RIGHT);

      expect(result).toBe(node2);
    });

    it("should swap with first window in container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      node1.mode = WINDOW_MODES.TILE;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;

      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      node2.mode = WINDOW_MODES.TILE;
      node3.mode = WINDOW_MODES.TILE;

      const result = ctx.tree.swap(node1, MotionDirection.RIGHT);

      // Should swap with first window in container
      expect(result).toBe(node2);
    });

    it("should swap with first window in stacked container when lastTabFocus unset", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      node1.mode = WINDOW_MODES.TILE;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      node2.mode = WINDOW_MODES.TILE;
      node3.mode = WINDOW_MODES.TILE;

      // Stable chrome: no lastTabFocus → first label in order.
      const result = ctx.tree.swap(node1, MotionDirection.RIGHT);
      expect(result).toBe(node2);
      expect(node3).toBeTruthy();
    });

    it("should swap with lastTabFocus window in stacked container when set", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      node1.mode = WINDOW_MODES.TILE;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      node2.mode = WINDOW_MODES.TILE;
      node3.mode = WINDOW_MODES.TILE;
      container.lastTabFocus = window3;

      const result = ctx.tree.swap(node1, MotionDirection.RIGHT);
      expect(result).toBe(node3);
    });

    it("should return undefined if no next node", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      // Mock next to return null
      vi.spyOn(ctx.tree, "next").mockReturnValue(null);

      const result = ctx.tree.swap(node, MotionDirection.RIGHT);

      expect(result).toBeUndefined();
    });

    it("should return undefined if nodes not in same monitor", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      // Mock sameParentMonitor to return false
      ctx.extWm.sameParentMonitor.mockReturnValue(false);

      const result = ctx.tree.swap(node1, MotionDirection.RIGHT);

      expect(result).toBeUndefined();
    });
  });

  describe("move (Host/helper)", () => {
    it("should move window to the right", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window3);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;
      node3.mode = WINDOW_MODES.TILE;

      const result = ctx.tree.move(node1, MotionDirection.RIGHT);

      expect(result).toBe(true);
      expect(kidsOf(ctx.extWm, monitor)).toEqual([node2, node1, node3]);
    });

    it("should move window to the left", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      const result = ctx.tree.move(node2, MotionDirection.LEFT);

      expect(result).toBe(true);
      expect(kidsOf(ctx.extWm, monitor)).toEqual([node2, node1]);
    });

    it("should swap sibling positions when moving into occupied space", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      expect(kidsOf(ctx.extWm, monitor)).toEqual([node1, node2]);

      ctx.tree.move(node1, MotionDirection.RIGHT);

      expect(kidsOf(ctx.extWm, monitor)).toEqual([node2, node1]);
    });

    it("should move window into container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      node1.mode = WINDOW_MODES.TILE;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.HSPLIT;

      const window2 = createMockWindow();
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      node2.mode = WINDOW_MODES.TILE;

      ctx.tree.move(node1, MotionDirection.RIGHT);

      expect(parentOf(ctx.extWm, node1)).toBe(container);
    });

    it("should swap window percentages when swapping adjacent siblings", () => {
      // When swapping adjacent siblings, the percentages are exchanged
      // so each position retains its size allocation
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      node1.mode = WINDOW_MODES.TILE;
      node2.mode = WINDOW_MODES.TILE;

      // Set specific percentages before swap
      node1.percent = 0.4;
      node2.percent = 0.6;

      ctx.tree.move(node1, MotionDirection.RIGHT);

      // Percentages should be exchanged (each position keeps its size)
      expect(node1.percent).toBe(0.6);
      expect(node2.percent).toBe(0.4);
    });

    it("should return false if no next node", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const window = createMockWindow();
      const node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window);

      // Mock next to return null
      vi.spyOn(ctx.tree, "next").mockReturnValue(null);

      const result = ctx.tree.move(node, MotionDirection.RIGHT);

      expect(result).toBe(false);
    });

    it("should handle moving into stacked container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);
      node1.mode = WINDOW_MODES.TILE;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window2 = createMockWindow();
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);

      ctx.tree.move(node1, MotionDirection.RIGHT);

      expect(parentOf(ctx.extWm, node1)).toBe(container);
      expect(kidsOf(ctx.extWm, container).at(-1)).toBe(node1);
    });
  });

  describe("next - Stacked Container Navigation", () => {
    it("should cycle through windows in stacked container using UP/DOWN", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      // Navigate down from first window
      const nextFromFirst = ctx.tree.next(node1, MotionDirection.DOWN);
      expect(nextFromFirst).toBe(node2);

      // Navigate down from second window
      const nextFromSecond = ctx.tree.next(node2, MotionDirection.DOWN);
      expect(nextFromSecond).toBe(node3);
    });

    it("should navigate up in stacked container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);

      // Navigate up from second window
      const prev = ctx.tree.next(node2, MotionDirection.UP);
      expect(prev).toBe(node1);
    });

    it("should exit stacked container when navigating left/right", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);

      const window2 = createMockWindow();
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      // Navigate right from stacked container should exit to sibling
      const nextRight = ctx.tree.next(node1, MotionDirection.RIGHT);
      expect(nextRight).toBe(node2);
    });
  });

  describe("next - Tabbed Container Navigation", () => {
    it("should cycle through tabs using LEFT/RIGHT", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.TABBED;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const window3 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      const node3 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      // Navigate right from first tab
      const nextFromFirst = ctx.tree.next(node1, MotionDirection.RIGHT);
      expect(nextFromFirst).toBe(node2);

      // Navigate right from second tab
      const nextFromSecond = ctx.tree.next(node2, MotionDirection.RIGHT);
      expect(nextFromSecond).toBe(node3);
    });

    it("should navigate left between tabs", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.TABBED;

      const window1 = createMockWindow();
      const window2 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);
      const node2 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);

      // Navigate left from second tab
      const prev = ctx.tree.next(node2, MotionDirection.LEFT);
      expect(prev).toBe(node1);
    });

    it("should exit tabbed container when navigating up/down", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.TABBED;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window1);

      const window2 = createMockWindow();
      const node2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window2);

      // Navigate down from tabbed container should exit to sibling
      const nextDown = ctx.tree.next(node1, MotionDirection.DOWN);
      expect(nextDown).toBe(node2);
    });
  });

  describe("next - Cross-Container Navigation", () => {
    it("should navigate from one container to another container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const container1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container1.layout = LAYOUT_TYPES.VSPLIT;

      const container2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container2.layout = LAYOUT_TYPES.VSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(container1.nodeValue, NODE_TYPES.WINDOW, window1);

      const window2 = createMockWindow();
      ctx.tree.createNode(container2.nodeValue, NODE_TYPES.WINDOW, window2);

      // Navigate right from window in container1 - returns the sibling container
      const next = ctx.tree.next(node1, MotionDirection.RIGHT);
      const nextParent = parentOf(ctx.extWm, next);
      expect(next).toBeDefined();
      expect(nextParent === monitor || parentOf(ctx.extWm, nextParent) === monitor).toBe(true);
    });

    it("should navigate into container and find appropriate node", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.VSPLIT;

      const window2 = createMockWindow();
      const window3 = createMockWindow();
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      // Navigate right from window1 should go to the container or its first window
      const next = ctx.tree.next(node1, MotionDirection.RIGHT);
      expect(next).toBeDefined();
      // Either we get the container or a window inside it
      expect(next === container || next.nodeType === NODE_TYPES.WINDOW).toBe(true);
    });

    it("should navigate into stacked container", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const window1 = createMockWindow();
      const node1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, window1);

      const container = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      container.layout = LAYOUT_TYPES.STACKED;

      const window2 = createMockWindow();
      const window3 = createMockWindow();
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window2);
      ctx.tree.createNode(container.nodeValue, NODE_TYPES.WINDOW, window3);

      // Navigate right from window1 should enter the stacked container
      const next = ctx.tree.next(node1, MotionDirection.RIGHT);
      expect(next).toBeDefined();
      expect(next === container || parentOf(ctx.extWm, next) === container).toBe(true);
    });
  });

  // forge-zrl: cyclic, non-directional focus/swap among tiled siblings.
  describe("cyclic focus/swap siblings (Host/helper)", () => {
    let monitor, n1, n2, n3;

    beforeEach(() => {
      ({ monitor } = getWorkspaceAndMonitor(ctx));
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      n1 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      n2 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      n3 = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
    });

    it("focuses the next sibling", () => {
      expect(ctx.tree.focusSibling(n1, 1)).toBe(n2);
    });

    it("wraps from the last sibling to the first when focusing next", () => {
      expect(ctx.tree.focusSibling(n3, 1)).toBe(n1);
    });

    it("wraps from the first sibling to the last when focusing previous", () => {
      expect(ctx.tree.focusSibling(n1, -1)).toBe(n3);
    });

    it("returns null when there is only one tiled sibling", () => {
      const solo = createTreeFixture({ fullExtWm: true });
      const { monitor: m } = getWorkspaceAndMonitor(solo);
      const only = solo.tree.createNode(m.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      expect(solo.tree.focusSibling(only, 1)).toBeNull();
      solo.cleanup();
    });

    it("skips floating siblings when cycling", () => {
      n2.mode = WINDOW_MODES.FLOAT;
      // From n1, next tiled sibling skips the floating n2 and lands on n3.
      expect(ctx.tree.focusSibling(n1, 1)).toBe(n3);
    });

    it("swaps with the next sibling and returns the moved node", () => {
      expect(ctx.tree.swapSibling(n1, 1)).toBe(n1);
      expect(kidsOf(ctx.extWm, monitor)).toEqual([n2, n1, n3]);
    });

    it("returns null from swapSibling when there is no valid target", () => {
      const solo = createTreeFixture({ fullExtWm: true });
      const { monitor: m } = getWorkspaceAndMonitor(solo);
      const only = solo.tree.createNode(m.nodeValue, NODE_TYPES.WINDOW, createMockWindow());
      expect(solo.tree.swapSibling(only, 1)).toBeNull();
      solo.cleanup();
    });
  });
});
