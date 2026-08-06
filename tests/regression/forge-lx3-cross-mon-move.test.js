import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES, Node } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createMockWindow,
  createTreeFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { MotionDirection } from "../mocks/gnome/Meta.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * LX3: directional Move across monitors.
 *
 * Root cause: Tree.move MONITOR case required node === mon firstChild|lastChild.
 * next() already means "directional edge of mon tree", so nested windows (tab
 * members, children of a mon CON) and VSPLIT-mon middle panes never crossed —
 * they only reparented to own-mon edge (often a no-op look) or required extra
 * gestures. Fix: when next is a neighbor MONITOR, always geometry-move then
 * reparent (e3k1 order). Tab-at-edge → one gesture peel+cross.
 */
describe("LX3: cross-monitor directional Move", () => {
  let ctx;
  let monA;
  let monB;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      globals: { display: { monitorCount: 2 } },
    });
    monA = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    monB = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    monA.layout = LAYOUT_TYPES.HSPLIT;
    monB.layout = LAYOUT_TYPES.HSPLIT;
    monA.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    monB.rect = { x: 1920, y: 0, width: 1920, height: 1080 };
    ctx.extWm.currentMonWsNode = monA;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function tiledOn(monNode, monIdx, id, rect) {
    const win = createMockWindow({
      id,
      monitor: monIdx,
      workspace: ctx.workspaces[0],
      rect: rect || { x: monNode.rect.x, y: 0, width: 400, height: 1080 },
    });
    const node = ctx.tree.createNode(monNode.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
    node.rect = { ...(rect || { x: monNode.rect.x, y: 0, width: 400, height: 1080 }) };
    return node;
  }

  it("mon-level last child RIGHT lands on target MONITOR with geometry-before-reparent", () => {
    tiledOn(monA, 0, "sib");
    const node = tiledOn(monA, 0, "nautilus");
    const order = [];
    ctx.extWm.move.mockImplementation(() => {
      order.push("move");
      // e3k1: still on origin mon when geometry runs
      expect(monA.contains(node)).toBe(true);
      expect(monB.contains(node)).toBe(false);
    });
    const origInsert = monB.insertBefore.bind(monB);
    monB.insertBefore = (n, ref) => {
      order.push("reparent");
      return origInsert(n, ref);
    };

    const moved = ctx.tree.move(node, MotionDirection.RIGHT);

    expect(moved).toBe(true);
    expect(monB.contains(node)).toBe(true);
    expect(node.parentNode).toBe(monB);
    expect(ctx.extWm.rectForMonitor).toHaveBeenCalled();
    expect(ctx.extWm.move).toHaveBeenCalled();
    expect(order.indexOf("move")).toBeLessThan(order.indexOf("reparent"));
  });

  it("mon-level only child crosses to neighbor", () => {
    const node = tiledOn(monA, 0, "solo");
    expect(ctx.tree.move(node, MotionDirection.RIGHT)).toBe(true);
    expect(monB.contains(node)).toBe(true);
    expect(node.parentNode).toBe(monB);
  });

  it("nested under mon CON at edge crosses in one gesture (not peel-only)", () => {
    const con = new Node(NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    monA.appendChild(con);
    const tab = new Node(NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    con.appendChild(tab);
    const t1 = new Node(
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "t1", monitor: 0, workspace: ctx.workspaces[0] })
    );
    t1.mode = WINDOW_MODES.TILE;
    t1.rect = { x: 0, y: 0, width: 400, height: 1080 };
    tab.appendChild(t1);
    const node = new Node(
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "nautilus", monitor: 0, workspace: ctx.workspaces[0] })
    );
    node.mode = WINDOW_MODES.TILE;
    node.rect = { x: 400, y: 0, width: 400, height: 1080 };
    con.appendChild(node);

    // Nested: not mon first/last — old gate fell into same-mon peel only.
    expect(node === monA.firstChild || node === monA.lastChild).toBe(false);

    const moved = ctx.tree.move(node, MotionDirection.RIGHT);
    expect(moved).toBe(true);
    expect(monB.contains(node)).toBe(true);
    expect(node.parentNode).toBe(monB);
    expect(ctx.extWm.move).toHaveBeenCalled();
  });

  it("TABBED last member at mon edge peels+crosses in one gesture", () => {
    const tab = new Node(NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    monA.appendChild(tab);
    for (const id of ["a", "b", "nautilus"]) {
      const w = createMockWindow({ id, monitor: 0, workspace: ctx.workspaces[0] });
      const n = new Node(NODE_TYPES.WINDOW, w);
      n.mode = WINDOW_MODES.TILE;
      n.rect = { x: 0, y: 0, width: 400, height: 1080 };
      tab.appendChild(n);
    }
    const node = tab.lastChild;

    const moved = ctx.tree.move(node, MotionDirection.RIGHT);
    expect(moved).toBe(true);
    expect(monB.contains(node)).toBe(true);
    expect(node.parentNode).toBe(monB);
    // Remaining tabs still under monA
    expect(tab.parentNode === monA || monA.contains(tab)).toBe(true);
    expect(tab.childNodes.length).toBe(2);
  });

  it("VSPLIT mon middle child can cross horizontally (not stuck as mon edge shuffle)", () => {
    monA.layout = LAYOUT_TYPES.VSPLIT;
    const top = tiledOn(monA, 0, "top", { x: 0, y: 0, width: 1920, height: 360 });
    const mid = tiledOn(monA, 0, "mid", { x: 0, y: 360, width: 1920, height: 360 });
    const bot = tiledOn(monA, 0, "bot", { x: 0, y: 720, width: 1920, height: 360 });

    expect(mid === monA.firstChild || mid === monA.lastChild).toBe(false);
    const moved = ctx.tree.move(mid, MotionDirection.RIGHT);
    expect(moved).toBe(true);
    expect(monB.contains(mid)).toBe(true);
    expect(monA.contains(top)).toBe(true);
    expect(monA.contains(bot)).toBe(true);
  });

  it("e3k1: throw from extWm.move does not reparent (nested path)", () => {
    const tab = new Node(NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    monA.appendChild(tab);
    const a = new Node(
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "a", monitor: 0, workspace: ctx.workspaces[0] })
    );
    a.mode = WINDOW_MODES.TILE;
    a.rect = { x: 0, y: 0, width: 400, height: 1080 };
    tab.appendChild(a);
    const node = new Node(
      NODE_TYPES.WINDOW,
      createMockWindow({ id: "w", monitor: 0, workspace: ctx.workspaces[0] })
    );
    node.mode = WINDOW_MODES.TILE;
    node.rect = { x: 0, y: 0, width: 400, height: 1080 };
    tab.appendChild(node);

    ctx.extWm.move.mockImplementation(() => {
      throw new Error("finalized window");
    });

    expect(() => ctx.tree.move(node, MotionDirection.RIGHT)).toThrow();
    expect(monA.contains(node)).toBe(true);
    expect(monB.contains(node)).toBe(false);
    expect(node.parentNode).toBe(tab);
  });

  it("display edge with no neighbor still wraps on own mon (s7ri)", () => {
    const node = tiledOn(monB, 1, "edge");
    ctx.extWm.currentMonWsNode = monA; // pointer on other mon
    const moved = ctx.tree.move(node, MotionDirection.RIGHT);
    expect(moved).toBe(true);
    expect(monB.contains(node)).toBe(true);
    expect(monA.contains(node)).toBe(false);
  });

  it("rectForMonitor null aborts without reparent", () => {
    const node = tiledOn(monA, 0, "solo");
    ctx.extWm.rectForMonitor.mockReturnValue(null);
    const moved = ctx.tree.move(node, MotionDirection.RIGHT);
    expect(moved).toBe(false);
    expect(monA.contains(node)).toBe(true);
    expect(monB.contains(node)).toBe(false);
  });
});

describe("LX3: rectForMonitor hardening", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      globals: { display: { monitorCount: 2 } },
    });
  });

  afterEach(() => ctx.cleanup());

  it("uses frame_rect when node.rect is unset (does not throw)", async () => {
    // Use real WindowManager rectForMonitor, not the fixture spy stub.
    const { createWindowManagerFixture, createMockWindow } = await import(
      "../mocks/helpers/index.js"
    );
    const wmCtx = createWindowManagerFixture({
      globals: { display: { monitorCount: 2 } },
    });
    try {
      const win = createMockWindow({
        id: "w",
        monitor: 0,
        workspace: wmCtx.workspaces[0],
        rect: { x: 10, y: 20, width: 800, height: 600 },
      });
      const node = {
        nodeType: NODE_TYPES.WINDOW,
        mode: WINDOW_MODES.TILE,
        rect: null,
        nodeValue: win,
      };
      const out = wmCtx.windowManager.rectForMonitor(node, 1);
      expect(out).toBeTruthy();
      expect(out.x).toBeGreaterThanOrEqual(1920);
      expect(out.width).toBeGreaterThan(0);
      expect(node.rect).toBeNull(); // must not mutate missing slot in place
    } finally {
      wmCtx.cleanup();
    }
  });

  it("does not mutate node.rect when remapping", async () => {
    const { createWindowManagerFixture, createMockWindow } = await import(
      "../mocks/helpers/index.js"
    );
    const wmCtx = createWindowManagerFixture({
      globals: { display: { monitorCount: 2 } },
    });
    try {
      const win = createMockWindow({
        id: "w2",
        monitor: 0,
        workspace: wmCtx.workspaces[0],
        rect: { x: 100, y: 50, width: 400, height: 300 },
      });
      const node = {
        nodeType: NODE_TYPES.WINDOW,
        mode: WINDOW_MODES.TILE,
        rect: { x: 100, y: 50, width: 400, height: 300 },
        nodeValue: win,
      };
      const before = { ...node.rect };
      const out = wmCtx.windowManager.rectForMonitor(node, 1);
      expect(out).toBeTruthy();
      expect(node.rect).toEqual(before);
      expect(out).not.toBe(node.rect);
    } finally {
      wmCtx.cleanup();
    }
  });
});
