import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createContainerNode,
  setPointer,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { Rectangle, GrabOp } from "../mocks/gnome/Meta.js";

/**
 * R012: Cross-mon grab-tile must not rehome mid-drag via window-entered-monitor.
 *
 * Symptom (live X11 dual-4K): drag Nautilus from right mon (tabbed with Ghostty)
 * onto left mon Ghostty for center-tab join → ends as mon-level HSPLIT instead.
 * Workaround: TOP (vsplit) then center join.
 *
 * Root cause: Meta fires entered-monitor while GRAB_TILE; rehome attaches after
 * dest mon LFT as HSPLIT sibling, shrinks target frame, pointer lands on self →
 * null drop target → structure stuck as rehome HSPLIT.
 *
 * Fix: skip rehome while window is GRAB_TILE / _draggedNodeWindow; drop gesture
 * owns placement. Grab-end re-resolves nodeWinAtPointer before commit.
 */
describe("R012: no mid-drag rehome; cross-mon center tab join", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        workspaceManager: { workspaceCount: 1 },
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
      settings: {
        "dnd-center-layout": "TABBED",
        "stacked-tiling-mode-enabled": false,
        "preview-hint-enabled": true,
        "tiling-mode-enabled": true,
      },
    });
    ctx.extension.keybindings = { allowDragDropTile: () => true };
    global.Meta = { ...(global.Meta || {}), GrabOp };
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;
  const workspace0 = () => ctx.workspaces[0];

  function dualMonScene() {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    // Left mon: solo Ghostty (full frame — not yet split by mid-drag rehome).
    const metaGhost = createMockWindow({
      id: "left-ghostty",
      rect: new Rectangle({ x: 0, y: 0, width: 1920, height: 1080 }),
      workspace: workspace0(),
      monitor: 0,
    });
    const nodeGhost = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaGhost);
    nodeGhost.mode = WINDOW_MODES.TILE;

    // Right mon: Ghostty + Nautilus already tabbed (source of peel).
    const tabCon = createContainerNode(mon1, LAYOUT_TYPES.TABBED, {
      x: 1920,
      y: 0,
      width: 1920,
      height: 1080,
    });

    const metaRightGhost = createMockWindow({
      id: "right-ghostty",
      rect: new Rectangle({ x: 1920, y: 0, width: 1920, height: 1080 }),
      workspace: workspace0(),
      monitor: 1,
    });
    const nodeRightGhost = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaRightGhost);
    nodeRightGhost.mode = WINDOW_MODES.TILE;

    const metaNautilus = createMockWindow({
      id: "nautilus",
      rect: new Rectangle({ x: 1920, y: 0, width: 1920, height: 1080 }),
      workspace: workspace0(),
      monitor: 1,
    });
    const nodeNautilus = ctx.tree.createNode(tabCon.nodeValue, NODE_TYPES.WINDOW, metaNautilus);
    nodeNautilus.mode = WINDOW_MODES.TILE;

    return {
      mon0,
      mon1,
      metaGhost,
      nodeGhost,
      metaRightGhost,
      nodeRightGhost,
      metaNautilus,
      nodeNautilus,
      tabCon,
    };
  }

  it("_onWindowEnteredMonitor does not rehome a GRAB_TILE window", () => {
    const { mon0, mon1, nodeNautilus, metaNautilus, tabCon } = dualMonScene();
    nodeNautilus.mode = WINDOW_MODES.GRAB_TILE;
    wm()._draggedNodeWindow = nodeNautilus;
    // Meta reports window now on mon0 (left).
    metaNautilus.get_monitor = vi.fn(() => 0);
    metaNautilus.monitor = 0;

    const rehomeSpy = vi.spyOn(wm(), "_rehomeWindowPreservingContainer");
    const updateSpy = vi.spyOn(wm(), "updateMetaWorkspaceMonitor");

    wm()._onWindowEnteredMonitor(ctx.display, 0, metaNautilus);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(rehomeSpy).not.toHaveBeenCalled();
    // Still under right tab group — drop owns move.
    expect(parentOf(wm(), nodeNautilus)).toBe(tabCon);
    expect(parentOf(wm(), tabCon)).toBe(mon1);
    expect(kidsOf(wm(), mon0)).not.toContain(nodeNautilus);
  });

  it("updateMetaWorkspaceMonitor skips rehome while mode is GRAB_TILE", () => {
    const { mon0, mon1, nodeNautilus, metaNautilus, tabCon } = dualMonScene();
    nodeNautilus.mode = WINDOW_MODES.GRAB_TILE;
    metaNautilus.get_monitor = vi.fn(() => 0);
    metaNautilus.monitor = 0;

    const rehomeSpy = vi.spyOn(wm(), "_rehomeWindowPreservingContainer");
    wm().updateMetaWorkspaceMonitor("window-entered-monitor", 0, metaNautilus);

    expect(rehomeSpy).not.toHaveBeenCalled();
    expect(parentOf(wm(), nodeNautilus)).toBe(tabCon);
    expect(kidsOf(wm(), mon0)).not.toContain(nodeNautilus);
    expect(parentOf(wm(), tabCon)).toBe(mon1);
  });

  it("without GRAB_TILE, entered-monitor still rehomes TILE windows", () => {
    const { mon0, mon1, nodeNautilus, metaNautilus, tabCon } = dualMonScene();
    nodeNautilus.mode = WINDOW_MODES.TILE;
    metaNautilus.get_monitor = vi.fn(() => 0);
    metaNautilus.monitor = 0;

    // Direct update path (fixture CONs may lack St actors for full render).
    wm().updateMetaWorkspaceMonitor("window-entered-monitor", 0, metaNautilus);

    expect(parentOf(wm(), nodeNautilus)).not.toBe(tabCon);
    let home = nodeNautilus;
    while (home && home.nodeType !== NODE_TYPES.MONITOR) home = parentOf(wm(), home);
    expect(home?.nodeValue).toBe(mon0.nodeValue);
    expect(home?.nodeValue).not.toBe(mon1.nodeValue);
  });

  it("center drop on left mon Ghostty joins TABBED when not mid-rehomed (happy path)", () => {
    const { mon0, nodeGhost, nodeNautilus, tabCon } = dualMonScene();

    // Still under right tab group — as when entered-monitor rehome is skipped.
    nodeNautilus.mode = WINDOW_MODES.GRAB_TILE;
    expect(kidsOf(wm(), tabCon)).toContain(nodeNautilus);

    // Pointer dead-center of left Ghostty (full 1920×1080 frame).
    setPointer(960, 540);
    wm().nodeWinAtPointer = nodeGhost;
    wm().moveWindowToPointer(nodeNautilus, false);

    // Joined left Ghostty as TABBED — not mon0 sibling HSPLIT.
    const join = parentOf(wm(), nodeNautilus);
    expect(parentOf(wm(), nodeGhost)).toBe(join);
    expect(join.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(join.nodeType).toBe(NODE_TYPES.CON);
    expect(parentOf(wm(), join)).toBe(mon0);
    expect(kidsOf(wm(), tabCon)).not.toContain(nodeNautilus);
    expect(kidsOf(wm(), join)).toEqual(expect.arrayContaining([nodeGhost, nodeNautilus]));
  });

  it("grab-end re-resolves nodeWinAtPointer before drop commit", () => {
    const { nodeGhost, nodeNautilus, metaNautilus } = dualMonScene();
    nodeNautilus.mode = WINDOW_MODES.GRAB_TILE;
    wm()._draggedNodeWindow = nodeNautilus;
    ctx.display.get_focus_window.mockReturnValue(metaNautilus);

    // Stale: last motion left null (e.g. pointer over self after rehome).
    wm().nodeWinAtPointer = null;
    const findSpy = vi.spyOn(wm(), "findNodeWindowAtPointer").mockReturnValue(nodeGhost);
    const trackSpy = vi.spyOn(wm(), "trackCurrentMonWs").mockImplementation(() => {});
    const moveSpy = vi.spyOn(wm().dragDrop, "moveWindowToPointer").mockImplementation(() => {});
    vi.spyOn(wm(), "allowDragDropTile").mockReturnValue(true);
    vi.spyOn(wm(), "findNodeWindow").mockReturnValue(nodeNautilus);

    wm().grabOp = GrabOp.WINDOW_BASE;
    wm()._handleGrabOpEnd(ctx.display, metaNautilus, GrabOp.WINDOW_BASE);

    expect(trackSpy).toHaveBeenCalled();
    expect(findSpy).toHaveBeenCalledWith(nodeNautilus);
    expect(moveSpy).toHaveBeenCalledWith(nodeNautilus);
    // Cleared after grab-end epilogue.
    expect(wm().nodeWinAtPointer).toBeNull();
  });

  it("mid-drag rehome would leave HSPLIT (documents failure class without skip)", () => {
    // Proves the old path: rehome as mon LFT sibling → mon-level HSPLIT kids.
    const { mon0, nodeGhost, nodeNautilus, metaNautilus } = dualMonScene();
    nodeNautilus.mode = WINDOW_MODES.TILE; // not grab — force rehome
    metaNautilus.get_monitor = vi.fn(() => 0);
    metaNautilus.monitor = 0;
    // Seed mon LFT so rehome attaches after ghostty.
    wm().lftMru = {
      monHead: () => nodeGhost,
      dropMonRings: () => {},
    };

    wm()._rehomeWindowPreservingContainer(nodeNautilus, metaNautilus, mon0);

    // Same parent as ghostty under mon (or under ghostty's parent CON).
    const rehomeParent = parentOf(wm(), nodeNautilus);
    expect(rehomeParent).toBe(parentOf(wm(), nodeGhost));
    expect(rehomeParent === mon0 || parentOf(wm(), rehomeParent) === mon0).toBe(true);
    // Not a TABBED join — just a split sibling.
    expect(rehomeParent.layout).not.toBe(LAYOUT_TYPES.TABBED);
  });
});
