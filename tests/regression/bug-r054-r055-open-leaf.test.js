import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import {
  forestIdFromLive,
  liveTabOpenLeafForPresent,
  paintWmForest,
  seedLiveForest,
} from "../../lib/extension/tom-live.js";
import { getOpSet, runOpAbstract } from "../../lib/opsets/index.js";
import { sessionOf } from "../../lib/session/index.js";
import { children, createTomApi, parent } from "../../lib/tom/index.js";
import { buildGiven, serializeForest } from "../../lib/tom/shorthand.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
} from "../mocks/helpers/index.js";
import { Bin } from "../mocks/gnome/St.js";
import { Rectangle } from "../mocks/gnome/Meta.js";

/**
 * R054: layout `active` / setOpenLeaf must write Forest lastTabFocusId so
 * paint does not restore a stale sibling.
 * R055: DnD CENTER join into TAB must raise+focus the joiner.
 */
describe("R054/R055 open leaf (Forest lastTabFocusId + join/DnD)", () => {
  describe("setOpenLeaf Forest-first (R054)", () => {
    let ctx;

    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: {
          "tiling-mode-enabled": true,
          "tabbed-tiling-mode-enabled": true,
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      ctx.cleanup();
    });

    const wm = () => ctx.windowManager;

    function tabbedPairOpenA() {
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
      tab.layout = LAYOUT_TYPES.TABBED;
      const wA = createMockWindow({
        id: "open-a",
        title: "A",
        workspace: ctx.workspaces[0],
      });
      const wB = createMockWindow({
        id: "open-b",
        title: "B",
        workspace: ctx.workspaces[0],
      });
      const nA = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
      const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
      for (const n of [nA, nB]) n.mode = WINDOW_MODES.TILE;
      tab.lastTabFocus = wA;
      seedLiveForest(wm());
      const tabId = forestIdFromLive(wm(), tab);
      const idA = forestIdFromLive(wm(), nA);
      const idB = forestIdFromLive(wm(), nB);
      expect(tabId).toBeTruthy();
      expect(idA).toBeTruthy();
      expect(idB).toBeTruthy();
      wm().forest.nodes[tabId].lastTabFocusId = idA;
      paintWmForest(wm());
      expect(tab.lastTabFocus).toBe(wA);
      expect(liveTabOpenLeafForPresent(wm(), tab)).toBe(nA);
      return { tab, wA, wB, nA, nB, tabId, idA, idB };
    }

    it("setOpenLeaf writes Forest lastTabFocusId; paint does not restore the old leaf", () => {
      const { tab, wB, nB, tabId, idB } = tabbedPairOpenA();

      expect(wm().setOpenLeaf(nB)).toBe(true);
      expect(wm().forest.nodes[tabId].lastTabFocusId).toBe(idB);
      expect(tab.lastTabFocus).toBe(wB);

      paintWmForest(wm());

      expect(wm().forest.nodes[tabId].lastTabFocusId).toBe(idB);
      expect(tab.lastTabFocus).toBe(wB);
      expect(liveTabOpenLeafForPresent(wm(), tab)).toBe(nB);
    });

    it("layout active reveal (keyboard:false) sticks after paint", () => {
      const { tab, wB, nB, tabId, idB } = tabbedPairOpenA();
      wB.raise = vi.fn();
      wB.focus = vi.fn();
      wB.activate = vi.fn();

      wm().revealGroupChild(nB, { keyboard: false, pin: true, source: "dbus-focus" });
      paintWmForest(wm());

      expect(wm().forest.nodes[tabId].lastTabFocusId).toBe(idB);
      expect(tab.lastTabFocus).toBe(wB);
      expect(liveTabOpenLeafForPresent(wm(), tab)).toBe(nB);
      expect(wB.raise).toHaveBeenCalled();
      expect(wB.focus).not.toHaveBeenCalled();
      expect(wB.activate).not.toHaveBeenCalled();
    });
  });

  describe("Mark 2 Join open leaf (OL2)", () => {
    it("enter-con into TAB marks the joiner as lastTabFocusId", () => {
      const { f, byLabel } = buildGiven("Mon1(H(A,TAB(B,C)))");
      const api = createTomApi();
      const set = getOpSet("mark2");
      api.setFocus(f, byLabel.A.id);
      const r = runOpAbstract(f, api, (draft) => {
        const result = set.ops.join(draft, api, "right");
        if (result?.ok) set.settle(draft);
        return result;
      });
      expect(r?.ok).toBe(true);
      expect(serializeForest(f, { children })).toBe("Mon1(TAB(A,B,C))");
      const tab = parent(f, f.nodes[byLabel.A.id]);
      expect(tab.layout).toBe("TABBED");
      expect(tab.lastTabFocusId).toBe(byLabel.A.id);
    });

    it("wrap-pair with defaultJoinContainer=TAB marks the joiner as lastTabFocusId", () => {
      const { f, byLabel } = buildGiven("Mon1(H(A,B,C))");
      sessionOf(f).decisions.defaultJoinContainer = "TAB";
      const api = createTomApi();
      const set = getOpSet("mark2");
      api.setFocus(f, byLabel.B.id);
      const r = runOpAbstract(f, api, (draft) => {
        const result = set.ops.join(draft, api, "right");
        if (result?.ok) set.settle(draft);
        return result;
      });
      expect(r?.ok).toBe(true);
      expect(serializeForest(f, { children })).toBe("Mon1(H(A,TAB(B,C)))");
      const tab = parent(f, f.nodes[byLabel.B.id]);
      expect(tab.layout).toBe("TABBED");
      expect(tab.lastTabFocusId).toBe(byLabel.B.id);
      expect(tab.childIds).toEqual([byLabel.B.id, byLabel.C.id]);
    });
  });

  describe("DnD CENTER join raise+focus (R055)", () => {
    let ctx;

    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: {
          "tiling-mode-enabled": true,
          "tabbed-tiling-mode-enabled": true,
          "stacked-tiling-mode-enabled": false,
          "dnd-center-layout": "TABBED",
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      ctx.cleanup();
    });

    const wm = () => ctx.windowManager;

    function api() {
      return new SessionApi({
        extWm: ctx.windowManager,
        settings: ctx.settings,
      });
    }

    it("CENTER join into TAB makes the joiner open leaf and keyboard-focuses it", () => {
      ctx.settings.get_string.mockImplementation((key) => {
        if (key === "dnd-center-layout") return "TABBED";
        return "";
      });
      const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
      const row = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      const metaA = createMockWindow({
        id: "dnd-join-t",
        title: "T",
        rect: new Rectangle({ x: 960, y: 0, width: 960, height: 1080 }),
        workspace: ctx.workspaces[0],
      });
      const metaB = createMockWindow({
        id: "dnd-join-s",
        title: "S",
        rect: new Rectangle({ x: 0, y: 0, width: 960, height: 1080 }),
        workspace: ctx.workspaces[0],
      });
      const dragged = ctx.tree.createNode(row.nodeValue, NODE_TYPES.WINDOW, metaB);
      dragged.mode = WINDOW_MODES.TILE;
      dragged.rect = { x: 0, y: 0, width: 960, height: 1080 };
      const tabCon = createContainerNode(row, LAYOUT_TYPES.TABBED, {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
      const target = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaA);
      target.mode = WINDOW_MODES.TILE;
      target.rect = { x: 960, y: 0, width: 960, height: 1080 };
      tabCon.lastTabFocus = metaA;
      seedLiveForest(wm());
      const tabId = forestIdFromLive(wm(), tabCon);
      const idA = forestIdFromLive(wm(), target);
      wm().forest.nodes[tabId].lastTabFocusId = idA;
      paintWmForest(wm());

      metaB.raise = vi.fn();
      metaB.focus = vi.fn();
      metaB.activate = vi.fn();

      const out = api()._dndDropOp("id:dnd-join-s", "id:dnd-join-t", "CENTER", {
        quiet: true,
        simulateEnteredMonitor: false,
      });

      expect(out.ok).toBe(true);
      const idB = forestIdFromLive(wm(), dragged);
      const liveTab = liveTabOpenLeafForPresent(wm(), tabCon);
      expect(liveTab).toBe(dragged);
      expect(wm().forest.nodes[tabId].lastTabFocusId).toBe(idB);
      expect(tabCon.lastTabFocus).toBe(metaB);
      expect(metaB.raise).toHaveBeenCalled();
      expect(metaB.focus).toHaveBeenCalled();
      expect(metaB.activate).toHaveBeenCalled();
    });
  });
});
