import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../lib/shared/logger.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import * as PresentChrome from "../../lib/extension/present-chrome.js";
import { paintLiveForest } from "../../lib/extension/tom-live.js";
import { chromeGroupEligible } from "../../lib/extension/node-chrome.js";
import { createHostBag } from "../../lib/host/index.js";
import { destroyNode } from "../../lib/tom/index.js";
import { buildGiven } from "../../lib/tom/shorthand.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * Unary TABBED/STACKED (1 child) must not paint group chrome. RuleSet collapses
 * the CON; present must not keep a 1-item strip if settle is skipped or the
 * CON is already gone from Forest.
 */
describe("Bug unary TAB chrome (1-item strip)", () => {
  describe("processNode", () => {
    let ctx;

    beforeEach(() => {
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: {
          "tiling-mode-enabled": true,
          "showtab-decoration-enabled": true,
        },
      });
      ctx.extWm.currentMonWsNode = ctx.tree.nodeWorkpaces[0].getNodeByType(NODE_TYPES.MONITOR)[0];
      vi.spyOn(Logger, "trace").mockImplementation(() => {});
    });

    afterEach(() => {
      ctx?.cleanup?.();
      vi.restoreAllMocks();
    });

    it("destroys TABBED chrome when the group has only one window", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const w0 = createWindowNode(ctx.tree, con, { windowOverrides: { id: "only" } }).nodeWindow;
      expect(con.decoration).toBeTruthy();
      const deco = con.decoration;
      let decoDestroyed = 0;
      const realDestroy = deco.destroy?.bind(deco);
      deco.destroy = () => {
        decoDestroyed++;
        if (realDestroy) realDestroy();
      };

      PresentChrome.processNode(ctx.tree, con);

      expect(con.decoration).toBe(null);
      expect(decoDestroyed).toBe(1);
      expect(w0.tab).toBeFalsy();
      expect(w0.rect).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
      const traces = Logger.trace.mock.calls.map((c) => String(c[0] ?? ""));
      expect(traces.some((t) => t.includes("chrome-unary skip"))).toBe(true);
    });

    it("still paints TABBED chrome for two windows", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const con = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const a = createWindowNode(ctx.tree, con, { windowOverrides: { id: "a" } }).nodeWindow;
      const b = createWindowNode(ctx.tree, con, { windowOverrides: { id: "b" } }).nodeWindow;

      PresentChrome.processNode(ctx.tree, con);

      expect(con.decoration).toBeTruthy();
      expect(con.decoration.visible).toBe(true);
      expect(a.tab).toBeTruthy();
      expect(b.tab).toBeTruthy();
    });
  });

  describe("paintLiveForest", () => {
    it("tears TABBED chrome when Forest is unary and drops gone CONs", () => {
      vi.spyOn(Logger, "trace").mockImplementation(() => {});
      const { f, byLabel } = buildGiven("Mon1(TAB(A,B))");
      const tabId = f.nodes[byLabel.A.id].parentId;
      const deco = {
        _forgeDisposed: false,
        hide: vi.fn(),
        get_parent: () => null,
        remove_child: vi.fn(),
        destroy_all_children: vi.fn(),
        destroy: vi.fn(function destroy() {
          this._forgeDisposed = true;
        }),
      };
      const tabA = { _forgeDisposed: false, destroy: vi.fn(), get_parent: () => deco };
      const liveTab = {
        nodeType: "CON",
        layout: "TABBED",
        decoration: deco,
        childNodes: [],
        parentNode: null,
        isCon: () => true,
        isWindow: () => false,
        isStackedOrTabbed: () => true,
      };
      const liveA = {
        nodeType: "WINDOW",
        nodeValue: { id: "A" },
        tab: tabA,
        parentNode: liveTab,
        childNodes: [],
        isWindow: () => true,
        isCon: () => false,
      };
      liveTab.childNodes.push(liveA);
      const liveById = new Map([
        [tabId, liveTab],
        [byLabel.A.id, liveA],
      ]);
      destroyNode(f, byLabel.B.id);
      expect(f.nodes[tabId].childIds).toEqual([byLabel.A.id]);

      const hostBag = createHostBag();
      paintLiveForest(f, liveById, {
        createCon: () => ({ nodeType: "CON", isCon: () => true }),
        hostBag,
      });

      expect(liveTab.decoration).toBe(null);
      expect(deco.destroy).toHaveBeenCalled();
      expect(tabA.destroy).toHaveBeenCalled();
      expect(liveById.get(tabId)).toBe(liveTab);
      const traces = Logger.trace.mock.calls.map((c) => String(c[0] ?? ""));
      expect(traces.some((t) => t.includes("chrome-unary teardown"))).toBe(true);
      vi.restoreAllMocks();
    });
  });

  it("chromeGroupEligible is false for one child", () => {
    const node = { layout: "TABBED", isStackedOrTabbed: () => true };
    expect(chromeGroupEligible(node, [{ id: "a" }])).toBe(false);
    expect(chromeGroupEligible(node, [{ id: "a" }, { id: "b" }])).toBe(true);
    expect(chromeGroupEligible({ layout: "HSPLIT", isStackedOrTabbed: () => false }, [1, 2])).toBe(
      false
    );
  });
});
