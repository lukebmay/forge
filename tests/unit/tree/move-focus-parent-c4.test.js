import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";

/**
 * FCC C4: focusParent/focusChild + moveIn/moveOut.
 */
describe("C4 move-in/out + focus parent/child", () => {
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
    return { monitor, h, leaf, tab, w1, w2 };
  }

  describe("focusParent / focusChild", () => {
    it("elevates focusUnit to parent CON and returns a leaf window id", () => {
      const { h, v, b, c } = nestedSplit();

      const win = tree().focusParent(b);

      expect(tree().focusUnit).toBe(v);
      expect(win).toBe(b);
      expect(win.nodeValue.get_id()).toBe(502);
      expect(h.childNodes).toContain(v);
      expect(v.childNodes).toEqual([b, c]);
    });

    it("climbs again to grandparent CON", () => {
      const { h, v, b } = nestedSplit();
      tree().focusParent(b);
      const win = tree().focusParent(b);

      expect(tree().focusUnit).toBe(h);
      expect(win).toBeTruthy();
      expect([501, 502, 503]).toContain(win.nodeValue.get_id());
      expect(v.parentNode).toBe(h);
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

      expect(tree().focusParent(solo)).toBeNull();
      expect(tree().focusUnit).toBeNull();
      expect(tree().focusParent(monitor)).toBeNull();
      expect(b.parentNode.layout).toBe(LAYOUT_TYPES.VSPLIT);
    });

    it("focusChild no-ops on a WINDOW with no elevation", () => {
      const { b } = nestedSplit();
      expect(tree().focusChild(b)).toBeNull();
      expect(tree().focusUnit).toBeNull();
    });
  });

  describe("moveIn / moveOut", () => {
    it("moveIn reparents layout unit into sibling CON and keeps identity", () => {
      const { h, leaf, tab, w1, w2 } = splitWithTabSibling();

      const dest = tree().moveIn(leaf);

      expect(dest).toBe(tab);
      expect(leaf.parentNode).toBe(tab);
      expect(tab.childNodes).toEqual([w1, w2, leaf]);
      expect(h.childNodes).toEqual([tab]);
      expect(leaf.nodeValue.get_id()).toBe(601);
    });

    it("moveOut peels layout unit to grandparent preserving order slot", () => {
      const { monitor, h, v, a, b, c } = nestedSplit();

      const unit = tree().moveOut(b);

      expect(unit).toBe(b);
      expect(b.parentNode).toBe(h);
      expect(h.childNodes).toEqual([a, v, b]);
      expect(v.childNodes).toEqual([c]);
      expect(b.nodeValue.get_id()).toBe(502);
      expect(monitor.childNodes).toContain(h);
    });

    it("moveOut of tab bag (layoutUnit) reparents the CON, not a single leaf", () => {
      const { monitor, h, leaf, tab, w1, w2 } = splitWithTabSibling();

      const unit = tree().moveOut(w2);

      expect(unit).toBe(tab);
      expect(tab.parentNode).toBe(monitor);
      expect(w1.parentNode).toBe(tab);
      expect(w2.parentNode).toBe(tab);
      expect(tab.childNodes).toEqual([w1, w2]);
      expect(h.childNodes).toEqual([leaf]);
      expect(monitor.childNodes).toEqual([h, tab]);
    });

    it("moveOut no-ops when parent is MONITOR", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      const leaf = tree().createNode(
        monitor.nodeValue,
        NODE_TYPES.WINDOW,
        createMockWindow({ id: 701 })
      );
      leaf.mode = WINDOW_MODES.TILE;

      expect(tree().moveOut(leaf)).toBeNull();
      expect(leaf.parentNode).toBe(monitor);
    });

    it("moveIn no-ops without a sibling CON", () => {
      const { v, b, c } = nestedSplit();
      expect(tree().moveIn(b)).toBeNull();
      expect(b.parentNode).toBe(v);
      expect(v.childNodes).toEqual([b, c]);
    });

    it("session move-in joins sibling TABBED", () => {
      const { leaf, tab } = splitWithTabSibling();
      const api = new SessionApi();
      api._ext = ctx.extension;
      api._wm = () => ctx.windowManager;

      const moved = api._moveInOp("id:601", { quiet: true });
      expect(moved.ok).toBe(true);
      expect(moved.changed).toBe(true);
      expect(leaf.parentNode).toBe(tab);
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
      expect(b.parentNode).toBe(v);
    });
  });
});
