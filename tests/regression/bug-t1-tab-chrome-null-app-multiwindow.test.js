import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * T1 tab chrome invariant: if parent layout is TABBED/STACKED, showtab is on, and
 * there is ≥1 tiled child, every tiled child has a label actor (fallback OK).
 * Never reserve bar height with zero labels attached.
 *
 * Root cause: _createWindowTab early-returned on !app; processNode only re-attached
 * existing tabs after clearing decoration children → empty gap or 1-of-N labels.
 */
describe("T1: tab chrome with null-app multi-window groups", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  function stripAndNullApp(nodeWindow) {
    if (nodeWindow.tab) {
      const parent = nodeWindow.tab.get_parent?.();
      if (parent) parent.remove_child(nodeWindow.tab);
    }
    nodeWindow.tab = null;
    nodeWindow.app = null;
    nodeWindow._tabFallback = undefined;
  }

  it("TABBED: two null-app windows each get a fallback label after processNode", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbedCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const a = createWindowNode(ctx.tree, tabbedCon).nodeWindow;
    const b = createWindowNode(ctx.tree, tabbedCon).nodeWindow;

    stripAndNullApp(a);
    stripAndNullApp(b);

    expect(() => ctx.tree.processNode(tabbedCon)).not.toThrow();

    expect(a.tab).toBeTruthy();
    expect(b.tab).toBeTruthy();
    expect(a._tabFallback).toBe(true);
    expect(b._tabFallback).toBe(true);
    expect(tabbedCon.decoration).toBeTruthy();
    expect(tabbedCon.decoration.get_children().length).toBe(2);
    expect(tabbedCon.decoration.visible).toBe(true);
  });

  it("TABBED: self-heals when one child.tab is nulled mid-session", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbedCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const a = createWindowNode(ctx.tree, tabbedCon).nodeWindow;
    const b = createWindowNode(ctx.tree, tabbedCon).nodeWindow;

    ctx.tree.processNode(tabbedCon);
    expect(tabbedCon.decoration.get_children().length).toBe(2);

    // Simulate destroy/reparent leaving .tab null while the other tab remains.
    if (a.tab?.get_parent?.()) a.tab.get_parent().remove_child(a.tab);
    a.tab = null;
    a.app = null;

    expect(() => ctx.tree.processNode(tabbedCon)).not.toThrow();

    expect(a.tab).toBeTruthy();
    expect(b.tab).toBeTruthy();
    expect(tabbedCon.decoration.get_children().length).toBe(2);
  });

  it("STACKED: two null-app windows each get a fallback label after processNode", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const stackedCon = createContainerNode(monitor, LAYOUT_TYPES.STACKED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const a = createWindowNode(ctx.tree, stackedCon).nodeWindow;
    const b = createWindowNode(ctx.tree, stackedCon).nodeWindow;

    stripAndNullApp(a);
    stripAndNullApp(b);

    expect(() => ctx.tree.processNode(stackedCon)).not.toThrow();

    expect(a.tab).toBeTruthy();
    expect(b.tab).toBeTruthy();
    expect(stackedCon.decoration.get_children().length).toBe(2);
    expect(stackedCon.decoration.visible).toBe(true);
  });

  it("_ensureConTab builds a fallback when rep has no app", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const nested = createContainerNode(monitor, LAYOUT_TYPES.HSPLIT, {
      x: 0,
      y: 0,
      width: 400,
      height: 600,
    });
    const win = createWindowNode(ctx.tree, nested).nodeWindow;
    win.app = null;
    nested.tab = null;
    nested._tabRep = null;

    expect(() => nested._ensureConTab()).not.toThrow();
    expect(nested.tab).toBeTruthy();
    expect(nested._tabFallback).toBe(true);
  });
});
