import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
} from "../mocks/helpers/index.js";
import { Rectangle } from "../mocks/gnome/Meta.js";
import * as Utils from "../../lib/extension/utils.js";

/**
 * R031: always-float open (Kooha) must not reserve a blank TILE slot.
 * Floated red border follows the Meta frame, not a stale tree slot.
 */
describe("R031 always-float open: no ghost TILE; border follows frame", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "focus-border-toggle": true,
        "focus-border-hidden-on-single": false,
        "window-gap-size": 4,
      },
    });
    ctx.display.get_current_monitor.mockReturnValue(0);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  function tile(parent, spec) {
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, parent, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        ...spec,
      },
    });
    return { node: nodeWindow, meta: metaWindow };
  }

  function focusTile(pair) {
    wm().movePointerWith(pair.node);
    ctx.display.get_focus_window.mockReturnValue(pair.meta);
  }

  function mockBorder() {
    return {
      set_style_class_name: vi.fn(),
      add_style_class_name: vi.fn(),
      set_size: vi.fn(),
      set_position: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    };
  }

  function deskTwoTiles() {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    const bag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
    bag.layout = LAYOUT_TYPES.TABBED;
    bag._rect = { x: 0, y: 0, width: 960, height: 1080 };
    const tabA = tile(bag, {
      id: "tab-a",
      monitor: 0,
      wm_class: "google-chrome",
      rect: { x: 0, y: 35, width: 960, height: 1045 },
    });
    tile(bag, {
      id: "tab-b",
      monitor: 0,
      wm_class: "chrome-grok",
      rect: { x: 0, y: 35, width: 960, height: 1045 },
    });
    const ghost = tile(mon0, {
      id: "ghost",
      monitor: 0,
      wm_class: "com.mitchellh.ghostty",
      rect: { x: 960, y: 0, width: 960, height: 1080 },
    });
    focusTile(tabA);
    return { mon0, bag, tabA, ghost };
  }

  function tiledCount(root) {
    return ctx.tree.getTiledChildren(root.childNodes).length;
  }

  it("known always-float open does not wrap a TILE slot", () => {
    wm().windowProps = {
      overrides: [
        { wmClass: "io.github.seadve.Kooha", mode: "float" },
        { wmClass: "kooha", mode: "float" },
      ],
    };
    const { mon0, bag } = deskTwoTiles();
    const meta = createMockWindow({
      id: "kooha",
      workspace: ctx.workspaces[0],
      monitor: 0,
      wm_class: "io.github.seadve.Kooha",
      title: "Kooha",
      rect: { x: 200, y: 180, width: 640, height: 420 },
    });
    expect(wm().isFloatingExempt(meta)).toBe(true);
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);

    expect(node).toBeTruthy();
    expect(node.isFloat()).toBe(true);
    expect(bag.parentNode).toBe(mon0);
    expect(node.parentNode).toBe(mon0);
    expect(tiledCount(mon0)).toBe(2);
    expect(
      mon0.getNodeByType(NODE_TYPES.WINDOW).filter((w) => w.isTile() && !w.isPlaceholder?.())
    ).toHaveLength(3);

    wm().processFloats();
    expect(node.isFloat()).toBe(true);
    expect(bag.parentNode).toBe(mon0);
    expect(tiledCount(mon0)).toBe(2);
  });

  it("unknown identity then always-float class does not keep a TILE wrap", () => {
    wm().windowProps = {
      overrides: [{ wmClass: "io.github.seadve.Kooha", mode: "float" }],
    };
    const { mon0, bag } = deskTwoTiles();
    const meta = createMockWindow({
      id: "kooha-late",
      workspace: ctx.workspaces[0],
      monitor: 0,
      wm_class: null,
      title: null,
      rect: { x: 200, y: 180, width: 640, height: 420 },
    });
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);

    expect(node.isFloat()).toBe(true);
    expect(bag.parentNode).toBe(mon0);
    expect(node.parentNode).toBe(mon0);

    meta.set_wm_class("io.github.seadve.Kooha");
    meta.set_title("Kooha");
    expect(wm().isFloatingExempt(meta)).toBe(true);
    wm().processFloats();

    expect(node.isFloat()).toBe(true);
    expect(bag.parentNode).toBe(mon0);
    expect(node.parentNode).toBe(mon0);
    expect(tiledCount(mon0)).toBe(2);
    expect(node.mode).toBe(WINDOW_MODES.FLOAT);
  });

  it("floated border follows Meta frame, not a stale tree slot", () => {
    const { mon0 } = deskTwoTiles();
    const frame = { x: 240, y: 200, width: 520, height: 360 };
    const slot = { x: 0, y: 0, width: 960, height: 1080 };
    const meta = createMockWindow({
      id: "kooha-border",
      workspace: ctx.workspaces[0],
      monitor: 0,
      wm_class: "io.github.seadve.Kooha",
      title: "Kooha",
      rect: new Rectangle(frame),
    });
    wm().windowProps = {
      overrides: [{ wmClass: "io.github.seadve.Kooha", mode: "float" }],
    };
    const border = mockBorder();
    meta.get_compositor_private().border = border;
    ctx.display.get_focus_window.mockReturnValue(meta);

    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);
    node.mode = WINDOW_MODES.FLOAT;
    node.renderRect = slot;
    node.rect = slot;
    expect(ctx.tree.paintRectForWindow(node)).toBeNull();

    wm().showWindowBorders();

    const inset = 3 * Utils.dpi();
    expect(border.set_style_class_name).toHaveBeenCalledWith("window-floated-border");
    expect(border.set_size).toHaveBeenCalledWith(frame.width + inset * 2, frame.height + inset * 2);
    expect(border.set_position).toHaveBeenCalledWith(frame.x - inset, frame.y - inset);
    expect(border.set_position).not.toHaveBeenCalledWith(slot.x - inset, slot.y - inset);
    expect(mon0).toBeTruthy();
  });

  it("will-tile wrap then always-on-top does not keep a ghost TILE slot", () => {
    const { mon0, bag } = deskTwoTiles();
    const meta = createMockWindow({
      id: "kooha-above",
      workspace: ctx.workspaces[0],
      monitor: 0,
      wm_class: "io.github.seadve.Kooha",
      title: "Kooha",
      rect: { x: 200, y: 180, width: 640, height: 420 },
    });
    expect(wm().isFloatingExempt(meta)).toBe(false);
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);
    wm().processFloats();
    expect(node.isTile()).toBe(true);
    expect(bag.parentNode).not.toBe(mon0);

    meta.is_above = () => true;
    expect(wm().isFloatingExempt(meta)).toBe(true);
    wm().processFloats();

    expect(node.isFloat()).toBe(true);
    expect(bag.parentNode).toBe(mon0);
    expect(node.parentNode).toBe(mon0);
    expect(tiledCount(mon0)).toBe(2);
  });
});
