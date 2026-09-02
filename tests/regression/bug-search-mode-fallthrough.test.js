import { describe, it, expect, beforeEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Bug: Missing break in tree._search() MODE case causes fallthrough to LAYOUT case
 *
 * Problem: In Tree._search(), the MODE case was missing a `break` statement,
 * causing it to fall through to the LAYOUT case. This meant that searching
 * by MODE would incorrectly also match nodes by LAYOUT if both conditions
 * happened to be satisfied.
 *
 * G8n: ROOT GObject childNodes are empty (Forest spine). Search from the live
 * monitor via getNodeByMode / getNodeByLayout instead of tree._search.
 */
describe("Bug: _search() MODE case fallthrough to LAYOUT", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture();
  });

  describe("_search by MODE", () => {
    it("should only match nodes by mode, not by layout", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const { nodeWindow: windowNode } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1001, wm_class: "test-window", allows_resize: true },
        mode: "TILE",
      });

      monitor.layout = LAYOUT_TYPES.HSPLIT;

      const modeResults = monitor.getNodeByMode(WINDOW_MODES.TILE);
      expect(modeResults).toContain(windowNode);

      // MODE search must not treat LAYOUT values as modes (old fallthrough).
      const incorrectResults = monitor.getNodeByMode(LAYOUT_TYPES.HSPLIT);
      expect(incorrectResults).not.toContain(monitor);
    });

    it("should not include nodes in MODE search that match by layout", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.STACKED;

      const { nodeWindow: node1 } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, wm_class: "test1", allows_resize: true },
        mode: "TILE",
      });
      const { nodeWindow: node2 } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "test2", allows_resize: true },
        mode: "FLOAT",
      });

      const floatResults = monitor.getNodeByMode(WINDOW_MODES.FLOAT);
      expect(floatResults.length).toBe(1);
      expect(floatResults[0]).toBe(node2);
      expect(floatResults).not.toContain(node1);
    });

    it("should search by LAYOUT independently from MODE", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.VSPLIT;

      const { nodeWindow: windowNode } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, wm_class: "test", allows_resize: true },
        mode: "TILE",
      });

      const layoutResults = monitor.getNodeByLayout(LAYOUT_TYPES.VSPLIT);
      expect(layoutResults).toContain(monitor);
      expect(layoutResults).not.toContain(windowNode);
    });
  });

  describe("getNodeByMode", () => {
    it("should only return nodes matching the specified mode", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);

      const { nodeWindow: tileNode } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 1, wm_class: "tile", allows_resize: true },
        mode: "TILE",
      });
      const { nodeWindow: floatNode } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: 2, wm_class: "float", allows_resize: true },
        mode: "FLOAT",
      });

      const tileNodes = monitor.getNodeByMode(WINDOW_MODES.TILE);
      expect(tileNodes).toContain(tileNode);
      expect(tileNodes).not.toContain(floatNode);
    });
  });
});
