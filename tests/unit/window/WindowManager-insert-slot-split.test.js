import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
  setPointer,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";

/**
 * D032 insert A: new tiled open / same-axis edge drop slot-splits the
 * focused (or drop-target) unit. Never an even 3-wide H/V sibling list.
 */
describe("D032 slot-split insert", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
    });
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

  function openTiled(spec) {
    const meta = createMockWindow({
      workspace: ctx.workspaces[0],
      monitor: 0,
      ...spec,
    });
    wm().trackWindow(null, meta);
    return { node: wm().findNodeWindow(meta), meta };
  }

  function hvWideCount(root, n) {
    let count = 0;
    if ((root.isHSplit() || root.isVSplit()) && root.childNodes.length === n) count += 1;
    for (const con of root.getNodeByType(NODE_TYPES.CON)) {
      if ((con.isHSplit() || con.isVSplit()) && con.childNodes.length === n) count += 1;
    }
    return count;
  }

  describe("tiled open", () => {
    it("3rd tiled open, LFT=last → wrap last; mon is not 3-wide HSPLIT", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "a",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      const b = tile(mon0, {
        id: "b",
        monitor: 0,
        wm_class: "AppB",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      });
      focusTile(b);

      const c = openTiled({
        id: "c",
        wm_class: "AppC",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(a.node.parentNode).toBe(mon0);
      const wrap = b.node.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.isHSplit() || wrap.isVSplit()).toBe(true);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([b.node, c.node]));
      expect(wrap.childNodes).not.toContain(a.node);
    });

    it("3rd tiled open, LFT=first → wrap first; second sibling stays out", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "first",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      const b = tile(mon0, {
        id: "second",
        monitor: 0,
        wm_class: "AppB",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      });
      focusTile(a);

      const c = openTiled({
        id: "third",
        wm_class: "AppC",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(b.node.parentNode).toBe(mon0);
      const wrap = a.node.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([a.node, c.node]));
      expect(wrap.childNodes).not.toContain(b.node);
    });

    it("2nd open: no extra wrap", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "only",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 1920, height: 1080 },
      });
      focusTile(a);

      const b = openTiled({
        id: "second",
        wm_class: "AppB",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(a.node.parentNode).toBe(mon0);
      expect(b.node.parentNode).toBe(mon0);
      expect(mon0.childNodes.filter((n) => n.nodeType === NODE_TYPES.WINDOW)).toHaveLength(2);
      expect(mon0.getNodeByType(NODE_TYPES.CON)).toHaveLength(0);
    });

    it("leftover 1-child HSPLIT is the slot: join it as VSPLIT, not 3-wide MONITOR", () => {
      // After a prior wrap+close, ghostty sits in a leftover HSPLIT CON.
      // Next open joins that slot (retarget to VSPLIT from the tall rect).
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const bag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      bag.layout = LAYOUT_TYPES.TABBED;
      tile(bag, {
        id: "tab-a",
        monitor: 0,
        wm_class: "TabApp",
        rect: { x: 0, y: 35, width: 1255, height: 1365 },
      });
      const leftover = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      leftover.layout = LAYOUT_TYPES.HSPLIT;
      leftover._rect = { x: 1255, y: 0, width: 1255, height: 1400 };
      const ghost = tile(leftover, {
        id: "ghost",
        monitor: 0,
        wm_class: "com.mitchellh.ghostty",
        rect: { x: 1255, y: 0, width: 1255, height: 1400 },
      });
      focusTile(ghost);

      const opened = openTiled({
        id: "nautilus",
        wm_class: "org.gnome.Nautilus",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(bag.parentNode).toBe(mon0);
      expect(opened.node.parentNode).toBe(leftover);
      expect(leftover.isVSplit()).toBe(true);
      expect(leftover.childNodes).toEqual(expect.arrayContaining([ghost.node, opened.node]));
    });

    it("layout-batch open still slot-splits (does not skip D032)", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "tab-slot",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 1255, height: 1400 },
      });
      const b = tile(mon0, {
        id: "ghost-slot",
        monitor: 0,
        wm_class: "AppB",
        rect: { x: 1255, y: 0, width: 1255, height: 1400 },
      });
      focusTile(b);
      wm().beginOpenLayoutBatch("dev");
      expect(wm().openLayoutBatchActive).toBe(true);

      const c = openTiled({
        id: "dock-nautilus",
        wm_class: "org.gnome.Nautilus",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      wm().endOpenLayoutBatch("test");
      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(a.node.parentNode).toBe(mon0);
      const wrap = b.node.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([b.node, c.node]));
    });

    it("wrap orientation follows the unit slot rect, not a stale wide frame", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      tile(mon0, {
        id: "left-bag",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 1255, height: 1400 },
      });
      const b = tile(mon0, {
        id: "tall-slot",
        monitor: 0,
        wm_class: "AppB",
        rect: { x: 1255, y: 0, width: 1255, height: 1400 },
      });
      b.node.rect = { x: 1255, y: 0, width: 1255, height: 1400 };
      b.meta.get_frame_rect = () => ({ x: 1255, y: 0, width: 2000, height: 800 });
      focusTile(b);

      const c = openTiled({
        id: "nautilus",
        wm_class: "org.gnome.Nautilus",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      const wrap = b.node.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.isVSplit()).toBe(true);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([b.node, c.node]));
    });

    it("tab bag + new tile: bag stays TABBED; new is sibling of the bag under a new H/V CON", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const seed = tile(mon0, {
        id: "seed",
        monitor: 0,
        wm_class: "Seed",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      const bag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      bag.layout = LAYOUT_TYPES.TABBED;
      const tabA = tile(bag, {
        id: "tab-a",
        monitor: 0,
        wm_class: "TabApp",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      });
      tile(bag, {
        id: "tab-b",
        monitor: 0,
        wm_class: "TabApp",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      });
      focusTile(tabA);

      const opened = openTiled({
        id: "fresh",
        wm_class: "OtherApp",
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);
      expect(bag.childNodes).not.toContain(opened.node);
      expect(opened.node.parentNode).not.toBe(bag);
      const wrap = bag.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.isHSplit() || wrap.isVSplit()).toBe(true);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([bag, opened.node]));
      expect(seed.node.parentNode).toBe(mon0);
      expect(wrap.childNodes).not.toContain(seed.node);
    });

    it("late null class/title still slot-splits; processFloats tiles in the wrap", () => {
      // Live R028: Nautilus maps class=null title=null → isFloatingExempt.
      // Do not reserve a TILE wrap at map (R031 always-float ghost). Adopt
      // into D032 wrap when processFloats first tiles.
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const bag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, {});
      bag.layout = LAYOUT_TYPES.TABBED;
      bag._rect = { x: 0, y: 0, width: 1255, height: 1400 };
      const tabA = tile(bag, {
        id: "tab-a",
        monitor: 0,
        wm_class: "google-chrome",
        rect: { x: 0, y: 35, width: 1255, height: 1365 },
      });
      tile(bag, {
        id: "tab-b",
        monitor: 0,
        wm_class: "chrome-grok",
        rect: { x: 0, y: 35, width: 1255, height: 1365 },
      });
      const ghost = tile(mon0, {
        id: "ghost",
        monitor: 0,
        wm_class: "com.mitchellh.ghostty",
        rect: { x: 1255, y: 0, width: 1255, height: 1400 },
      });
      focusTile(tabA);

      const opened = openTiled({
        id: "nautilus",
        wm_class: null,
        title: null,
        rect: { x: 100, y: 100, width: 800, height: 600 },
      });

      expect(wm().isFloatingExempt(opened.meta)).toBe(true);
      expect(opened.node.isFloat()).toBe(true);
      expect(bag.parentNode).toBe(mon0);
      expect(opened.node.parentNode).toBe(mon0);

      opened.meta.set_wm_class("org.gnome.Nautilus");
      opened.meta.set_title("Home");
      expect(wm().isFloatingExempt(opened.meta)).toBe(false);
      wm().processFloats();

      expect(opened.node.isTile()).toBe(true);
      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(ghost.node.parentNode).toBe(mon0);
      const wrap = bag.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.isHSplit() || wrap.isVSplit()).toBe(true);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([bag, opened.node]));
    });
  });

  describe("same-axis edge drop", () => {
    it("RIGHT on 2-wide HSPLIT wraps target; dest parent does not gain a 3rd child", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      mon1.layout = LAYOUT_TYPES.HSPLIT;

      tile(mon0, {
        id: "left",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      });
      const b = tile(mon0, {
        id: "right",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
      });
      const c = tile(mon1, {
        id: "from-mon1",
        monitor: 1,
        rect: new Rectangle({ x: 1920, y: 0, width: 1920, height: 1080 }),
      });
      c.node.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(1850, 540);
      wm().nodeWinAtPointer = b.node;
      wm().moveWindowToPointer(c.node, false);

      expect(mon0.childNodes.length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      const wrap = b.node.parentNode;
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(wrap.childNodes).toEqual(expect.arrayContaining([b.node, c.node]));
    });

    it("same-parent RIGHT reorder still reorders (does not wrap)", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const a = tile(mon0, {
        id: "a",
        monitor: 0,
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
      });
      const b = tile(mon0, {
        id: "b",
        monitor: 0,
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
      });
      a.node.mode = WINDOW_MODES.GRAB_TILE;

      setPointer(1850, 540);
      wm().nodeWinAtPointer = b.node;
      wm().moveWindowToPointer(a.node, false);

      expect(a.node.parentNode).toBe(mon0);
      expect(b.node.parentNode).toBe(mon0);
      expect(mon0.childNodes).toEqual([b.node, a.node]);
      expect(mon0.getNodeByType(NODE_TYPES.CON)).toHaveLength(0);
    });
  });
});
