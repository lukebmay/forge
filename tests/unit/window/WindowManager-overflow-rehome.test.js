import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, ORIENTATION_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import { clearClassMinFloorForTests } from "../../../lib/extension/tree-layout.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../../mocks/helpers/index.js";

/**
 * D049 M3: mid-session TILE overflow → tab / float + vacated gap gone.
 */
describe("D049 overflow rehome", () => {
  let ctx;

  beforeEach(() => {
    clearClassMinFloorForTests();
    ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 1 } },
      settings: { "auto-split-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    clearClassMinFloorForTests();
  });

  const wm = () => ctx.windowManager;

  function tileOn(parent, spec) {
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, parent, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        monitor: 0,
        ...spec,
      },
    });
    if (spec.rect) {
      nodeWindow.rect = { ...spec.rect };
      nodeWindow.renderRect = { ...spec.rect };
    }
    return { node: nodeWindow, meta: metaWindow };
  }

  function setSlot(pair, rect) {
    pair.node.rect = { ...rect };
    pair.node.renderRect = { ...rect };
  }

  /** Left column VSPLIT (overflow + sibling) | roomy right. */
  function vsplitPairPlusRoomy() {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    mon.layout = LAYOUT_TYPES.HSPLIT;
    const overflow = tileOn(mon, {
      id: "overflow",
      rect: { x: 0, y: 0, width: 800, height: 200 },
      size_hints: { min_width: 50, min_height: 400 },
    });
    const sibling = tileOn(mon, {
      id: "sibling",
      rect: { x: 0, y: 200, width: 800, height: 200 },
      size_hints: { min_width: 50, min_height: 50 },
    });
    const roomy = tileOn(mon, {
      id: "roomy",
      rect: { x: 800, y: 0, width: 1120, height: 1080 },
      size_hints: { min_width: 50, min_height: 50 },
    });
    const vsplit = ctx.tree.split(overflow.node, ORIENTATION_TYPES.VERTICAL, true);
    vsplit.appendChild(sibling.node);
    vsplit.rect = { x: 0, y: 0, width: 800, height: 400 };
    vsplit.renderRect = { ...vsplit.rect };
    setSlot(overflow, { x: 0, y: 0, width: 800, height: 200 });
    setSlot(sibling, { x: 0, y: 200, width: 800, height: 200 });
    setSlot(roomy, { x: 800, y: 0, width: 1120, height: 1080 });
    return { mon, overflow, sibling, roomy, vsplit };
  }

  it("tabs onto a same-mon neighbor that fits and removes the vacated VSPLIT", () => {
    const { mon, overflow, sibling, roomy, vsplit } = vsplitPairPlusRoomy();

    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(true);

    const tab = roomy.node.parentNode;
    expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(tab.contains(roomy.node)).toBe(true);
    expect(tab.contains(overflow.node)).toBe(true);
    expect(overflow.node.mode).toBe(WINDOW_MODES.TILE);
    expect(vsplit.parentNode).toBeNull();
    expect(sibling.node.parentNode).toBe(mon);
    expect(tab.parentNode).toBe(mon);
    expect(mon.contains(vsplit)).toBe(false);
  });

  it("oversized settled frame learns mins then tabs (no clamp request)", () => {
    const { mon, overflow, sibling, roomy, vsplit } = vsplitPairPlusRoomy();
    // Floor/class only — no hints / known / last resize. Frame taller than slot.
    overflow.meta._size_hints = null;
    delete overflow.meta._forgeKnownMinW;
    delete overflow.meta._forgeKnownMinH;
    delete overflow.meta._forgeLastResizeRequest;
    overflow.meta.wm_class = "org.gnome.Nautilus";
    overflow.meta.move_resize_frame(true, 0, 0, 800, 380);
    setSlot(overflow, { x: 0, y: 0, width: 800, height: 200 });

    expect(wm()._slotTooSmallForTile(overflow.node, overflow.meta)).toBe(false);
    expect(wm()._frameOverflowsTileSlot(overflow.node, overflow.meta)).toBe(true);
    expect(wm()._needsOverflowRehome(overflow.node, overflow.meta)).toBe(true);

    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(true);
    expect(overflow.meta._forgeKnownMinH).toBe(380);
    expect(overflow.meta._forgeKnownMinW).toBeFalsy();

    const tab = roomy.node.parentNode;
    expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(tab.contains(roomy.node)).toBe(true);
    expect(tab.contains(overflow.node)).toBe(true);
    expect(overflow.node.mode).toBe(WINDOW_MODES.TILE);
    expect(vsplit.parentNode).toBeNull();
    expect(sibling.node.parentNode).toBe(mon);
    expect(mon.contains(vsplit)).toBe(false);
  });

  it("oversized settled frame floats when no same-mon tab fits", () => {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    mon.layout = LAYOUT_TYPES.VSPLIT;
    const overflow = tileOn(mon, {
      id: "frame-overflow",
      rect: { x: 0, y: 0, width: 800, height: 200 },
    });
    const sibling = tileOn(mon, {
      id: "frame-sib",
      rect: { x: 0, y: 200, width: 800, height: 200 },
    });
    const vsplit = ctx.tree.split(overflow.node, ORIENTATION_TYPES.VERTICAL, true);
    vsplit.appendChild(sibling.node);
    setSlot(overflow, { x: 0, y: 0, width: 800, height: 200 });
    setSlot(sibling, { x: 0, y: 200, width: 800, height: 200 });
    overflow.meta._size_hints = null;
    delete overflow.meta._forgeLastResizeRequest;
    overflow.meta.move_resize_frame(true, 0, 0, 800, 380);

    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(true);
    expect(overflow.meta._forgeKnownMinH).toBe(380);
    expect(overflow.node.mode).toBe(WINDOW_MODES.FLOAT);
    expect(wm().isFloatingExempt(overflow.meta)).toBe(true);
    expect(vsplit.parentNode).toBeNull();
    expect(sibling.node.parentNode).toBe(mon);
  });

  it("floats when no same-mon tab fits and collapses the vacated split", () => {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    mon.layout = LAYOUT_TYPES.VSPLIT;
    const overflow = tileOn(mon, {
      id: "only-overflow",
      rect: { x: 0, y: 0, width: 800, height: 200 },
      size_hints: { min_width: 50, min_height: 400 },
    });
    const sibling = tileOn(mon, {
      id: "only-sib",
      rect: { x: 0, y: 200, width: 800, height: 200 },
      size_hints: { min_width: 50, min_height: 50 },
    });
    const vsplit = ctx.tree.split(overflow.node, ORIENTATION_TYPES.VERTICAL, true);
    vsplit.appendChild(sibling.node);
    setSlot(overflow, { x: 0, y: 0, width: 800, height: 200 });
    setSlot(sibling, { x: 0, y: 200, width: 800, height: 200 });

    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(true);

    expect(overflow.node.mode).toBe(WINDOW_MODES.FLOAT);
    expect(wm().isFloatingExempt(overflow.meta)).toBe(true);
    expect(overflow.node.parentNode).toBe(mon);
    expect(sibling.node.parentNode).toBe(mon);
    expect(vsplit.parentNode).toBeNull();
    expect(sibling.node.mode).toBe(WINDOW_MODES.TILE);
  });

  it("skips while ApplyEpoch is live", () => {
    const { overflow } = vsplitPairPlusRoomy();
    wm().beginApplyEpoch({ id: "m3-test" });
    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(false);
    expect(overflow.node.parentNode?.isStackedOrTabbed?.()).toBeFalsy();
    expect(overflow.node.mode).toBe(WINDOW_MODES.TILE);
    wm().endApplyEpoch({ id: "m3-test" });
  });

  it("skips GRAB_TILE", () => {
    const { overflow } = vsplitPairPlusRoomy();
    overflow.node.mode = WINDOW_MODES.GRAB_TILE;
    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(false);
    expect(overflow.node.mode).toBe(WINDOW_MODES.GRAB_TILE);
  });

  it("ratchets poisoned mins when Meta frame already fits the slot", () => {
    const { overflow } = vsplitPairPlusRoomy();
    overflow.meta._size_hints = null;
    overflow.meta._forgeKnownMinW = 50;
    overflow.meta._forgeKnownMinH = 400;
    const parent = overflow.node.parentNode;

    expect(wm()._slotTooSmallForTile(overflow.node, overflow.meta)).toBe(true);
    expect(wm().rehomeIfSlotTooSmall(overflow.node)).toBe(false);
    expect(overflow.node.mode).toBe(WINDOW_MODES.TILE);
    expect(overflow.node.parentNode).toBe(parent);
    expect(overflow.meta._forgeKnownMinH).toBe(200);
    expect(wm()._slotTooSmallForTile(overflow.node, overflow.meta)).toBe(false);
  });

  it("does not schedule min-clamp learn during ApplyEpoch", () => {
    const { overflow } = vsplitPairPlusRoomy();
    wm().beginApplyEpoch({ id: "min-learn-epoch" });
    const set = vi.spyOn(wm()._wmSources, "set");
    wm()._scheduleMinClampLearn(overflow.meta);
    expect(set.mock.calls.some(([slot]) => String(slot).startsWith("minClampLearn:"))).toBe(false);
    wm().endApplyEpoch({ id: "min-learn-epoch" });
  });

  it("size-changed does not live-learn mins", () => {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const pair = tileOn(mon, {
      id: "live-learn",
      rect: { x: 0, y: 0, width: 200, height: 380 },
    });
    pair.meta._forgeLastResizeRequest = {
      width: 200,
      height: 150,
      at: 0,
      priorW: 200,
      priorH: 800,
    };
    wm().updateMetaPositionSize(pair.meta, "size-changed");
    expect(pair.meta._forgeKnownMinH).toBeFalsy();
  });

  it("no-ops when mins already fit the slot", () => {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const legal = tileOn(mon, {
      id: "legal",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      size_hints: { min_width: 100, min_height: 100 },
    });
    const parent = legal.node.parentNode;
    expect(wm().rehomeIfSlotTooSmall(legal.node)).toBe(false);
    expect(legal.node.parentNode).toBe(parent);
    expect(legal.node.mode).toBe(WINDOW_MODES.TILE);
  });

  it("D026 restore is skipped when the slot overflows mins", () => {
    const { overflow } = vsplitPairPlusRoomy();
    const restore = vi.spyOn(wm(), "reassertNodeToSlot");
    wm()._restoreTileToSlot(overflow.node, overflow.meta);
    expect(restore).not.toHaveBeenCalled();
    expect(wm()._wmSources.has(`overflowRehome:${overflow.meta.get_id()}`)).toBe(true);
  });

  it("D026 still restores when mins fit (frame drift only)", () => {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const legal = tileOn(mon, {
      id: "drift",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      size_hints: { min_width: 100, min_height: 100 },
    });
    legal.meta.move_resize_frame(true, 10, 10, 900, 700);
    expect(wm()._slotTooSmallForTile(legal.node, legal.meta)).toBe(false);
    expect(wm()._shouldRestoreTileSlot(legal.node, legal.meta)).toBe(true);
    const restore = vi.spyOn(wm(), "reassertNodeToSlot");
    wm()._restoreTileToSlot(legal.node, legal.meta);
    expect(restore).toHaveBeenCalled();
  });

  it("debounces via a per-window SourceBag slot", () => {
    const { overflow } = vsplitPairPlusRoomy();
    wm()._scheduleOverflowRehome(overflow.node);
    wm()._scheduleOverflowRehome(overflow.node);
    const name = `overflowRehome:${overflow.meta.get_id()}`;
    expect(wm()._wmSources.has(name)).toBe(true);
    expect(wm()._wmSources.size).toBeGreaterThanOrEqual(1);
  });
});
