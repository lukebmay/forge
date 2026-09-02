import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES, ORIENTATION_TYPES } from "../../../lib/extension/tree.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createContainerNode,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { Rectangle, GrabOp, MotionDirection } from "../../mocks/gnome/Meta.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";

/**
 * FCC R1 / invariant I3: resize mutates percent of the owning split unit.
 */
describe("owning-split I3 — resolve + apply", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
      },
    });
    global.Meta = { ...(global.Meta || {}), GrabOp, MotionDirection };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const tree = () => ctx.windowManager.tree;
  const wm = () => ctx.windowManager;

  function tileWin(parent, id, rect, percent = 0.5) {
    const meta = createMockWindow({
      id,
      wm_class: String(id),
      rect: new Rectangle(rect),
      workspace: ctx.workspaces[0],
    });
    const node = tree().createNode(parent.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.TILE;
    node.percent = percent;
    node.rect = { ...rect };
    return node;
  }

  function twoPaneHsplit() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const a = tileWin(monitor, 101, { x: 0, y: 0, width: 960, height: 1080 });
    const b = tileWin(monitor, 102, { x: 960, y: 0, width: 960, height: 1080 });
    return { monitor, a, b };
  }

  /** MONITOR VSPLIT of HSPLIT[A,B] over C — off-axis nest. */
  function nestedOffAxis() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.VSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const top = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
      x: 0,
      y: 0,
      width: 1920,
      height: 540,
    });
    top.percent = 0.5;
    const a = tileWin(top, 201, { x: 0, y: 0, width: 960, height: 540 });
    const b = tileWin(top, 202, { x: 960, y: 0, width: 960, height: 540 });
    const c = tileWin(monitor, 203, { x: 0, y: 540, width: 1920, height: 540 });
    return { monitor, top, a, b, c };
  }

  function tabBagBesideSibling() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const bag = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    bag.percent = 0.5;
    bag.rect = { x: 0, y: 0, width: 960, height: 1080 };
    const t1 = tileWin(bag, 301, { x: 0, y: 0, width: 960, height: 1080 });
    const t2 = tileWin(bag, 302, { x: 0, y: 0, width: 960, height: 1080 });
    const sib = tileWin(monitor, 303, { x: 960, y: 0, width: 960, height: 1080 });
    return { monitor, bag, t1, t2, sib };
  }

  it("layoutUnit is the window when not inside a bag", () => {
    const { a } = twoPaneHsplit();
    expect(tree().layoutUnit(a)).toBe(a);
  });

  it("layoutUnit is the tab/stack bag, not the focused leaf", () => {
    const { bag, t1 } = tabBagBesideSibling();
    expect(tree().layoutUnit(t1)).toBe(bag);
    expect(tree().layoutUnit(bag)).toBe(bag);
  });

  it("same-axis edge hits the parent split", () => {
    const { a, b, monitor } = twoPaneHsplit();
    const hit = tree().resolveOwningSplit(a, ORIENTATION_TYPES.HORIZONTAL);
    expect(hit).not.toBeNull();
    expect(hit.target).toBe(a);
    expect(hit.pair).toBe(b);
    expect(hit.parent).toBe(monitor);
    expect(hit.axis).toBe(ORIENTATION_TYPES.HORIZONTAL);
  });

  it("nested off-axis edge hits the ancestor split", () => {
    const { a, b, c, top, monitor } = nestedOffAxis();
    const hit = tree().resolveOwningSplit(a, ORIENTATION_TYPES.VERTICAL);
    expect(hit).not.toBeNull();
    expect(hit.target).toBe(top);
    expect(hit.pair).toBe(c);
    expect(hit.parent).toBe(monitor);
    expect(parentOf(wm(), a)).toBe(top);
    expect(parentOf(wm(), b)).toBe(top);
  });

  it("same-axis still hits the inner parent when nested", () => {
    const { a, b, top } = nestedOffAxis();
    const hit = tree().resolveOwningSplit(a, ORIENTATION_TYPES.HORIZONTAL);
    expect(hit.target).toBe(a);
    expect(hit.pair).toBe(b);
    expect(hit.parent).toBe(top);
  });

  it("no-ops when there is no tiled pair", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const only = tileWin(monitor, 401, { x: 0, y: 0, width: 1920, height: 1080 }, 1);
    expect(tree().resolveOwningSplit(only, ORIENTATION_TYPES.HORIZONTAL)).toBeNull();
    expect(wm().applyOwningSplit(only, ORIENTATION_TYPES.HORIZONTAL, 50)).toBe(false);
    expect(only.percent).toBe(1);
  });

  it("no-ops an axis that has no ancestor split", () => {
    const { a } = twoPaneHsplit();
    expect(tree().resolveOwningSplit(a, ORIENTATION_TYPES.VERTICAL)).toBeNull();
    expect(wm().applyOwningSplit(a, ORIENTATION_TYPES.VERTICAL, 50)).toBe(false);
    expect(a.percent).toBe(0.5);
  });

  it("apply leaves child identity unchanged and percents sum to 1", () => {
    const { a, b, monitor } = twoPaneHsplit();
    const kids = [...kidsOf(wm(), monitor)];
    expect(wm().applyOwningSplit(a, ORIENTATION_TYPES.HORIZONTAL, 192)).toBe(true);
    expect(kidsOf(wm(), monitor)).toEqual(kids);
    expect(parentOf(wm(), a)).toBe(monitor);
    expect(parentOf(wm(), b)).toBe(monitor);
    expect(a.percent).toBeGreaterThan(0.5);
    expect(b.percent).toBeLessThan(0.5);
    expect(a.percent + b.percent).toBeCloseTo(1, 5);
    expect(a.userSized).toBe(true);
    expect(b.userSized).toBe(true);
  });

  it("apply on nested off-axis changes the ancestor CON, not the inner pair", () => {
    const { a, b, c, top } = nestedOffAxis();
    const innerKids = [...kidsOf(wm(), top)];
    expect(wm().applyOwningSplit(a, ORIENTATION_TYPES.VERTICAL, 54)).toBe(true);
    expect(kidsOf(wm(), top)).toEqual(innerKids);
    expect(a.percent).toBeCloseTo(0.5, 5);
    expect(b.percent).toBeCloseTo(0.5, 5);
    expect(top.percent).toBeGreaterThan(0.5);
    expect(c.percent).toBeLessThan(0.5);
    expect(top.percent + c.percent).toBeCloseTo(1, 5);
  });

  it("tab focus unit is the bag CON", () => {
    const { t1, t2, bag, sib } = tabBagBesideSibling();
    const hit = tree().resolveOwningSplit(t1, ORIENTATION_TYPES.HORIZONTAL);
    expect(hit.target).toBe(bag);
    expect(hit.pair).toBe(sib);
    expect(wm().applyOwningSplit(t1, ORIENTATION_TYPES.HORIZONTAL, 192)).toBe(true);
    expect(t1.percent).toBeCloseTo(0.5, 5);
    expect(t2.percent).toBeCloseTo(0.5, 5);
    expect(bag.percent).toBeGreaterThan(0.5);
    expect(sib.percent).toBeLessThan(0.5);
  });

  it("edge direction picks the adjacent tiled sibling", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 1800, height: 1080 };
    const a = tileWin(monitor, 501, { x: 0, y: 0, width: 600, height: 1080 }, 1 / 3);
    const b = tileWin(monitor, 502, { x: 600, y: 0, width: 600, height: 1080 }, 1 / 3);
    const c = tileWin(monitor, 503, { x: 1200, y: 0, width: 600, height: 1080 }, 1 / 3);
    const right = tree().resolveOwningSplit(b, MotionDirection.RIGHT);
    const left = tree().resolveOwningSplit(b, MotionDirection.LEFT);
    expect(right.target).toBe(b);
    expect(right.pair).toBe(c);
    expect(left.target).toBe(b);
    expect(left.pair).toBe(a);
  });

  it("expand applies H then V (REG-expand-dual-axis)", () => {
    const { a, b, c, top } = nestedOffAxis();
    vi.spyOn(wm(), "renderTree").mockImplementation(() => {});
    ctx.display.get_focus_window.mockReturnValue(a.nodeValue);
    wm().expand(54);
    expect(a.percent).toBeGreaterThan(0.5);
    expect(b.percent).toBeLessThan(0.5);
    expect(a.percent + b.percent).toBeCloseTo(1, 5);
    expect(top.percent).toBeGreaterThan(0.5);
    expect(c.percent).toBeLessThan(0.5);
    expect(top.percent + c.percent).toBeCloseTo(1, 5);
  });

  it("grab resize on a nested off-axis edge debits the ancestor", () => {
    const { a, b, c, top } = nestedOffAxis();
    a.initRect = { x: 0, y: 0, width: 960, height: 540 };
    a.initGrabOp = GrabOp.RESIZING_S;
    a.nodeValue.move_resize_frame(false, 0, 0, 960, 620);
    wm().grabOp = GrabOp.RESIZING_S;
    ctx.display.get_focus_window.mockReturnValue(a.nodeValue);
    wm()._handleResizing(a);
    expect(a.percent).toBeCloseTo(0.5, 5);
    expect(b.percent).toBeCloseTo(0.5, 5);
    expect(top.percent).toBeGreaterThan(0.5);
    expect(c.percent).toBeLessThan(0.5);
    expect(top.percent + c.percent).toBeCloseTo(1, 5);
    expect(parentOf(wm(), a)).toBe(top);
  });
});
