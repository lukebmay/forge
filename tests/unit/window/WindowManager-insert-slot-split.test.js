import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  createWindowNode,
  setPointer,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import { Bin } from "../../mocks/gnome/St.js";

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
    const visit = (node) => {
      if (!node) return;
      const kids = kidsOf(wm(), node);
      if ((node.isHSplit?.() || node.isVSplit?.()) && kids.length === n) count += 1;
      for (const c of kids) visit(c);
    };
    visit(root);
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

      expect(kidsOf(wm(), mon0).length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(parentOf(wm(), a.node)).toBe(mon0);
      const wrap = parentOf(wm(), b.node);
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.isHSplit() || wrap.isVSplit()).toBe(true);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([b.node, c.node]));
      expect(kidsOf(wm(), wrap)).not.toContain(a.node);
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

      expect(kidsOf(wm(), mon0).length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(parentOf(wm(), b.node)).toBe(mon0);
      const wrap = parentOf(wm(), a.node);
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([a.node, c.node]));
      expect(kidsOf(wm(), wrap)).not.toContain(b.node);
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

      expect(parentOf(wm(), a.node)).toBe(mon0);
      expect(parentOf(wm(), b.node)).toBe(mon0);
      expect(kidsOf(wm(), mon0).filter((n) => n.nodeType === NODE_TYPES.WINDOW)).toHaveLength(2);
      expect(kidsOf(wm(), mon0).every((n) => n.isWindow?.())).toBe(true);
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

      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(parentOf(wm(), opened.node)).toBe(leftover);
      expect(leftover.isVSplit()).toBe(true);
      expect(kidsOf(wm(), leftover)).toEqual(expect.arrayContaining([ghost.node, opened.node]));
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
      expect(kidsOf(wm(), mon0).length).toBe(2);
      expect(hvWideCount(mon0, 3)).toBe(0);
      expect(parentOf(wm(), a.node)).toBe(mon0);
      const wrap = parentOf(wm(), b.node);
      expect(wrap).not.toBe(mon0);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([b.node, c.node]));
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

      const wrap = parentOf(wm(), b.node);
      expect(wrap).not.toBe(mon0);
      expect(wrap.isVSplit()).toBe(true);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([b.node, c.node]));
      // R033: LFT first, new second
      expect(kidsOf(wm(), wrap)[0]).toBe(b.node);
      expect(kidsOf(wm(), wrap)[1]).toBe(c.node);
    });

    it("R033: tall LFT unit → VSPLIT [LFT, new]; wide → HSPLIT [LFT, new]", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      tile(mon0, {
        id: "seed",
        monitor: 0,
        wm_class: "Seed",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      const tall = tile(mon0, {
        id: "tall-lft",
        monitor: 0,
        wm_class: "TallApp",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      });
      tall.node.rect = { x: 960, y: 0, width: 960, height: 1080 };
      focusTile(tall);

      const afterTall = openTiled({
        id: "after-tall",
        wm_class: "NewTall",
        rect: { x: 100, y: 100, width: 400, height: 400 },
      });
      const wrapTall = parentOf(wm(), tall.node);
      expect(wrapTall).not.toBe(mon0);
      expect(wrapTall.isVSplit()).toBe(true);
      expect(kidsOf(wm(), wrapTall)[0]).toBe(tall.node);
      expect(kidsOf(wm(), wrapTall)[1]).toBe(afterTall.node);
      expect(hvWideCount(mon0, 3)).toBe(0);

      // Wide LFT unit on a fresh mon pair
      ctx.cleanup();
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
      const monW = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      monW.layout = LAYOUT_TYPES.VSPLIT;
      tile(monW, {
        id: "top",
        monitor: 0,
        wm_class: "Top",
        rect: { x: 0, y: 0, width: 1920, height: 540 },
      });
      const wide = tile(monW, {
        id: "wide-lft",
        monitor: 0,
        wm_class: "WideApp",
        rect: { x: 0, y: 540, width: 1920, height: 540 },
      });
      wide.node.rect = { x: 0, y: 540, width: 1920, height: 540 };
      focusTile(wide);
      const afterWide = openTiled({
        id: "after-wide",
        wm_class: "NewWide",
        rect: { x: 100, y: 100, width: 400, height: 400 },
      });
      const wrapWide = parentOf(wm(), wide.node);
      expect(wrapWide).not.toBe(monW);
      expect(wrapWide.isHSplit()).toBe(true);
      expect(kidsOf(wm(), wrapWide)[0]).toBe(wide.node);
      expect(kidsOf(wm(), wrapWide)[1]).toBe(afterWide.node);
      expect(hvWideCount(monW, 3)).toBe(0);
    });

    it("R033: renderRect-only tall slot beats stale wide frame", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      tile(mon0, {
        id: "left",
        monitor: 0,
        wm_class: "AppA",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      const b = tile(mon0, {
        id: "render-slot",
        monitor: 0,
        wm_class: "AppB",
        // Frame claims wide landscape
        rect: { x: 960, y: 0, width: 2000, height: 400 },
      });
      // Live paint path often has renderRect while node.rect is empty
      b.node._rect = null;
      b.node.renderRect = { x: 960, y: 0, width: 960, height: 1080 };
      b.meta.get_frame_rect = () => ({ x: 960, y: 0, width: 2000, height: 400 });
      focusTile(b);

      const c = openTiled({
        id: "new",
        wm_class: "AppC",
        rect: { x: 100, y: 100, width: 400, height: 400 },
      });
      const wrap = parentOf(wm(), b.node);
      expect(wrap).not.toBe(mon0);
      expect(wrap.isVSplit()).toBe(true);
      expect(kidsOf(wm(), wrap)[0]).toBe(b.node);
      expect(kidsOf(wm(), wrap)[1]).toBe(c.node);
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
      expect(kidsOf(wm(), bag)).not.toContain(opened.node);
      expect(parentOf(wm(), opened.node)).not.toBe(bag);
      const wrap = parentOf(wm(), bag);
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.isHSplit() || wrap.isVSplit()).toBe(true);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([bag, opened.node]));
      expect(parentOf(wm(), seed.node)).toBe(mon0);
      expect(kidsOf(wm(), wrap)).not.toContain(seed.node);
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
      expect(parentOf(wm(), bag)).toBe(mon0);

      opened.meta.set_wm_class("org.gnome.Nautilus");
      opened.meta.set_title("Home");
      expect(wm().isFloatingExempt(opened.meta)).toBe(false);
      wm().processFloats();

      expect(opened.node.isTile()).toBe(true);
      expect(parentOf(wm(), opened.node)).not.toBe(mon0);
      const wrap = parentOf(wm(), opened.node);
      expect(wrap.isHSplit?.() || wrap.isVSplit?.() || wrap.isStackedOrTabbed?.()).toBe(true);
      expect(kidsOf(wm(), wrap)).toContain(opened.node);
    });

    it("slotSplit / aspect-split / adopt run when Forest parent is TABBED and parentNode is null", () => {
      const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
      mon0.layout = LAYOUT_TYPES.HSPLIT;
      const bag = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.CON, new Bin());
      bag.layout = LAYOUT_TYPES.TABBED;
      const a = tile(bag, {
        id: "tab-a",
        monitor: 0,
        wm_class: "TabA",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      tile(bag, {
        id: "tab-b",
        monitor: 0,
        wm_class: "TabB",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      });
      seedLiveForest(wm());
      a.node.parentNode = null;
      bag.parentNode = null;
      expect(a.node.parentNode).toBeNull();
      expect(parentOf(wm(), a.node)).toBe(bag);

      const unit = wm()._resolveInsertUnit(a.node);
      expect(unit).toBe(bag);
      wm()._maybeAspectSplitForOpen(a.node);
      expect(parentOf(wm(), a.node)).toBe(bag);
      expect(bag.layout).toBe(LAYOUT_TYPES.TABBED);

      const wrap = wm().slotSplitForInsert(unit);
      expect(wrap).toBeTruthy();

      const meta = createMockWindow({
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "adopt-me",
        wm_class: "AdoptApp",
        rect: { x: 100, y: 100, width: 400, height: 400 },
      });
      wm().trackWindow(null, meta);
      const adopted = wm().findNodeWindow(meta);
      adopted._tileInsertUnit = a.node;
      wm()._adoptOpenIntoTileSlot(adopted);
      expect(parentOf(wm(), adopted)).toBeTruthy();
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

      expect(hvWideCount(mon0, 3)).toBe(0);
      const wrap = parentOf(wm(), b.node);
      expect(wrap).not.toBe(mon0);
      expect(wrap.nodeType).toBe(NODE_TYPES.CON);
      expect(wrap.layout).toBe(LAYOUT_TYPES.HSPLIT);
      expect(kidsOf(wm(), wrap)).toEqual(expect.arrayContaining([b.node, c.node]));
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

      expect(parentOf(wm(), a.node)).toBe(mon0);
      expect(parentOf(wm(), b.node)).toBe(mon0);
      expect(kidsOf(wm(), mon0)).toEqual([b.node, a.node]);
    });
  });
});
