import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree-types.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
  parentOf,
  kidsOf,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";

/**
 * Host/helper: Tree.moveIn/moveOut + focusParent/Child.
 * Product WindowMoveIn/Out is CommandHandler → Mark 2.
 * Session RunSteps uses Forest move-in/out then paint (C7.2).
 */
describe("C4 move-in/out + focus parent/child (Host/helper)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
        "auto-exit-tabbed": true,
        "dnd-center-layout": "tabbed",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const tree = () => ctx.windowManager.tree;
  const wm = () => ctx.windowManager;

  /** MONITOR → HSPLIT[ A | VSPLIT[ B, C ] ] */
  function nestedSplit() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const h = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    h.layout = LAYOUT_TYPES.HSPLIT;
    const a = tree().createNode(
      h.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 501, wm_class: "A" })
    );
    const v = tree().createNode(h.nodeValue, NODE_TYPES.CON, new Bin());
    v.layout = LAYOUT_TYPES.VSPLIT;
    const b = tree().createNode(
      v.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 502, wm_class: "B" })
    );
    const c = tree().createNode(
      v.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 503, wm_class: "C" })
    );
    for (const n of [a, b, c]) n.mode = WINDOW_MODES.TILE;
    seedLiveForest(wm());
    return { monitor, h, v, a, b, c };
  }

  /** MONITOR → HSPLIT[ WINDOW | TABBED[ w1, w2 ] ] */
  function splitWithTabSibling() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const h = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    h.layout = LAYOUT_TYPES.HSPLIT;
    const leaf = tree().createNode(
      h.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 601, wm_class: "Leaf" })
    );
    const tab = tree().createNode(h.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const w1 = tree().createNode(
      tab.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 602, wm_class: "T1" })
    );
    const w2 = tree().createNode(
      tab.nodeValue,
      NODE_TYPES.WINDOW,
      createMockWindow({ id: 603, wm_class: "T2" })
    );
    for (const n of [leaf, w1, w2]) n.mode = WINDOW_MODES.TILE;
    tab.lastTabFocus = w1.nodeValue;
    seedLiveForest(wm());
    return { monitor, h, leaf, tab, w1, w2 };
  }

  describe("focusParent / focusChild", () => {
    it("elevates focusUnit to parent CON and returns a leaf window id", () => {
      const { h, v, b, c } = nestedSplit();

      const win = tree().focusParent(b);

      expect(tree().focusUnit).toBe(v);
      expect(win).toBe(b);
      expect(win.nodeValue.get_id()).toBe(502);
      expect(kidsOf(wm(), h)).toContain(v);
      expect(kidsOf(wm(), v)).toEqual([b, c]);
    });

    it("climbs again to grandparent CON", () => {
      const { h, v, b } = nestedSplit();
      tree().focusParent(b);
      const win = tree().focusParent(b);

      expect(tree().focusUnit).toBe(h);
      expect(win).toBeTruthy();
      expect([501, 502, 503]).toContain(win.nodeValue.get_id());
      expect(parentOf(wm(), v)).toBe(h);
    });

    it("focusChild descends back toward the focused leaf", () => {
      const { h, v, b } = nestedSplit();
      tree().focusParent(b);
      tree().focusParent(b);
      expect(tree().focusUnit).toBe(h);

      const win = tree().focusChild(b);

      expect(tree().focusUnit).toBe(v);
      expect(win).toBe(b);
      expect(win.nodeValue.get_id()).toBe(502);
    });

    it("no-ops focusParent at MONITOR", () => {
      const { monitor, b } = nestedSplit();
      // Direct child of mon
      const solo = tree().createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: 599 })
      );
      solo.mode = WINDOW_MODES.TILE;
      seedLiveForest(wm());

      expect(tree().focusParent(solo)).toBeNull();
      expect(tree().focusUnit).toBeNull();
      expect(tree().focusParent(monitor)).toBeNull();
      expect(parentOf(wm(), b).layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("focusChild no-ops on a WINDOW with no elevation", () => {
      const { b } = nestedSplit();
      expect(tree().focusChild(b)).toBeNull();
      expect(tree().focusUnit).toBeNull();
    });
  });

  describe("moveIn / moveOut (Host/helper)", () => {
    it("moveIn reparents layout unit into sibling CON and keeps identity", () => {
      const { h, leaf, tab, w1, w2 } = splitWithTabSibling();

      const dest = tree().moveIn(leaf);
      seedLiveForest(wm()); // Host/helper mutates GObject; reproject for Forest asserts

      expect(dest).toBe(tab);
      expect(parentOf(wm(), leaf)).toBe(tab);
      expect(kidsOf(wm(), tab)).toEqual([w1, w2, leaf]);
      expect(kidsOf(wm(), h)).toEqual([tab]);
      expect(leaf.nodeValue.get_id()).toBe(601);
    });

    it("moveOut peels layout unit to grandparent preserving order slot", () => {
      const { monitor, h, v, a, b, c } = nestedSplit();

      const unit = tree().moveOut(b);
      seedLiveForest(wm());

      expect(unit).toBe(b);
      expect(parentOf(wm(), b)).toBe(h);
      expect(kidsOf(wm(), h)).toEqual([a, v, b]);
      expect(kidsOf(wm(), v)).toEqual([c]);
      expect(b.nodeValue.get_id()).toBe(502);
      expect(kidsOf(wm(), monitor)).toContain(h);
    });

    it("moveOut of tab bag (layoutUnit) reparents the CON, not a single leaf", () => {
      const { monitor, h, leaf, tab, w1, w2 } = splitWithTabSibling();

      const unit = tree().moveOut(w2);
      seedLiveForest(wm());

      expect(unit).toBe(tab);
      expect(parentOf(wm(), tab)).toBe(monitor);
      expect(parentOf(wm(), w1)).toBe(tab);
      expect(parentOf(wm(), w2)).toBe(tab);
      expect(kidsOf(wm(), tab)).toEqual([w1, w2]);
      expect(kidsOf(wm(), h)).toEqual([leaf]);
      expect(kidsOf(wm(), monitor)).toEqual([h, tab]);
    });

    it("moveOut no-ops when parent is MONITOR", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      const leaf = tree().createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: 701 })
      );
      leaf.mode = WINDOW_MODES.TILE;
      seedLiveForest(wm());

      expect(tree().moveOut(leaf)).toBeNull();
      expect(parentOf(wm(), leaf)).toBe(monitor);
    });

    it("moveIn no-ops without a sibling CON", () => {
      const { v, b, c } = nestedSplit();
      expect(tree().moveIn(b)).toBeNull();
      expect(parentOf(wm(), b)).toBe(v);
      expect(kidsOf(wm(), v)).toEqual([b, c]);
    });

    it("session move-in joins sibling TABBED", () => {
      const { leaf, tab } = splitWithTabSibling();
      const api = new SessionApi();
      api._ext = ctx.extension;
      api._wm = () => ctx.windowManager;

      const moved = api._moveInOp("id:601", { quiet: true });
      expect(moved.ok).toBe(true);
      expect(moved.changed).toBe(true);
      // Forest SoT after paint (G8e — GObject parentNode may stay stale).
      expect(kidsOf(wm(), tab)).toContain(leaf);
    });

    it("session focus-parent elevates unit", () => {
      const { v, b } = nestedSplit();
      const api = new SessionApi();
      api._ext = ctx.extension;
      api._wm = () => ctx.windowManager;

      const fp = api._focusParentOp("id:502", { quiet: true });
      expect(fp.ok).toBe(true);
      expect(fp.changed).toBe(true);
      expect(tree().focusUnit).toBe(v);
      expect(parentOf(wm(), b)).toBe(v);
    });
  });
});
