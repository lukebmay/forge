import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../mocks/helpers/index.js";
import { WindowType } from "../mocks/gnome/Meta.js";

/**
 * W1 (forge-wayland-live): late null/empty title never auto-tiles without
 * notify::title — mirror bug #482 wm-class path.
 *
 * On Wayland, apps often map as Meta Window null 0 (null title). isFloatingExempt
 * floats empty/null titles; without notify::title, processFloats never re-runs
 * and the window stays floated (and when it does tile later, share was missing).
 */
describe("W1: late title re-tiles", () => {
  let ctx;
  let win;
  let node;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    win = createMockWindow({
      wm_class: "org.gnome.Nautilus",
      id: 3001,
      title: null,
      allows_resize: true,
    });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    node = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    node.mode = WINDOW_MODES.TILE;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("floats a window while its title is null", () => {
    expect(ctx.windowManager.isFloatingExempt(win)).toBe(true);
    ctx.windowManager.processFloats();
    expect(node.isFloat()).toBe(true);
  });

  it("re-tiles the window once title arrives", () => {
    ctx.windowManager.processFloats();
    expect(node.isFloat()).toBe(true);

    win.set_title("Home");
    expect(ctx.windowManager.isFloatingExempt(win)).toBe(false);

    ctx.windowManager.processFloats();
    expect(node.isTile()).toBe(true);
  });

  it("wires notify::title in trackWindow so a late title re-renders", () => {
    const tracked = createMockWindow({
      wm_class: "org.gnome.Nautilus",
      id: 3002,
      title: "",
      allows_resize: true,
    });
    ctx.windowManager.trackWindow(null, tracked);

    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree");
    tracked.set_title("Documents");

    expect(renderSpy).toHaveBeenCalledWith("title-changed");
  });

  it("does not full re-tile on Nautilus path / shell prompt title spam", () => {
    const tracked = createMockWindow({
      wm_class: "org.gnome.Nautilus",
      id: 3003,
      title: "Home",
      allows_resize: true,
    });
    ctx.windowManager.trackWindow(null, tracked);

    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree");
    // Seeded at track: non-empty→non-empty path titles never flip float policy.
    tracked.set_title("Documents");
    tracked.set_title("Network");
    tracked.set_title("smb://server/share");
    tracked.set_title("smb://server/share/folder");
    tracked.set_title("user@host:~/dev");

    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("same title re-notify does not re-tile", () => {
    const tracked = createMockWindow({
      wm_class: "org.gnome.Nautilus",
      id: 3004,
      title: "Home",
      allows_resize: true,
    });
    ctx.windowManager.trackWindow(null, tracked);
    const renderSpy = vi.spyOn(ctx.windowManager, "renderTree");
    tracked.set_title("Home");
    expect(renderSpy).not.toHaveBeenCalled();
  });
});

describe("W1: late FLOAT→TILE carves sibling share", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("carves share when empty-title map later tiles beside percent=1 sibling", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 0, y: 0, width: 2510, height: 1400 };

    const ghostty = createMockWindow({
      id: "ghostty",
      title: "ghostty",
      wm_class: "com.mitchellh.ghostty",
      workspace: ctx.workspaces[0],
      monitor: 0,
    });
    const ghostNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghostty);
    ghostNode.mode = WINDOW_MODES.TILE;
    ghostNode.percent = 1.0;

    // Late identity at map: empty title → float-exempt, no insertChildPercent.
    const late = createMockWindow({
      id: "late",
      title: null,
      wm_class: "org.gnome.Nautilus",
      workspace: ctx.workspaces[0],
      monitor: 0,
    });
    const lateNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, late);
    lateNode.mode = WINDOW_MODES.FLOAT;
    lateNode.percent = 0;

    ctx.windowManager.processFloats();
    expect(lateNode.isFloat()).toBe(true);
    expect(ghostNode.percent).toBe(1.0);

    // Title lands → processFloats tiles and must carve share.
    late.set_title("Files");
    expect(ctx.windowManager.isFloatingExempt(late)).toBe(false);
    ctx.windowManager.processFloats();

    expect(lateNode.isTile()).toBe(true);
    const tiled = ctx.tree.getTiledChildren(monitor.childNodes);
    const sizes = ctx.tree.computeSizes(monitor, tiled);
    expect(sizes.every((s) => s > 0)).toBe(true);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(2510);
  });

  it("does not carve share for permanent dialog float (forge-3hsv)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;

    const winA = createMockWindow({ id: "A", workspace: ctx.workspaces[0], monitor: 0 });
    const nodeA = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winA);
    nodeA.mode = WINDOW_MODES.TILE;
    nodeA.percent = 0.6;
    nodeA.userSized = true;

    const winB = createMockWindow({ id: "B", workspace: ctx.workspaces[0], monitor: 0 });
    const nodeB = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, winB);
    nodeB.mode = WINDOW_MODES.TILE;
    nodeB.percent = 0.4;
    nodeB.userSized = true;

    const dialog = createMockWindow({
      id: "dialog",
      workspace: ctx.workspaces[0],
      monitor: 0,
      window_type: WindowType.DIALOG,
    });
    const dialogNode = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, dialog);
    dialogNode.mode = WINDOW_MODES.FLOAT;
    dialogNode.percent = 0;

    ctx.windowManager.processFloats();

    expect(dialogNode.isFloat()).toBe(true);
    expect(nodeA.percent).toBeCloseTo(0.6, 5);
    expect(nodeB.percent).toBeCloseTo(0.4, 5);
    expect(nodeA.percent + nodeB.percent).toBeCloseTo(1.0, 5);
  });
});
