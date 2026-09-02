/**
 * Log-contract: hunt tokens stay wired (JSONL / Logger.trace greps).
 * Pair with state oracles in the same suites; do not snapshot full TRACE.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import { revealGroupChild } from "../../../lib/extension/action-pipeline.js";
import { syncLastTabFocusFromFocus } from "../../../lib/extension/session-layout.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";

function traceTexts() {
  return Logger.trace.mock.calls.map((c) => String(c[0] ?? ""));
}

describe("log-contract hunt tokens", () => {
  let ctx;
  let traceSpy;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
    traceSpy = vi.spyOn(Logger, "trace").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("ws-change preserve hit emits greppable token", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wOpen = createMockWindow({ id: "yt", title: "YouTube", workspace: ctx.workspaces[0] });
    const wSteal = createMockWindow({
      id: "voice",
      title: "Voice",
      workspace: ctx.workspaces[0],
    });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOpen);
    const nSteal = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wSteal);
    tab.lastTabFocus = wOpen;
    wOpen.raise = vi.fn();

    expect(wm().restoreOpenLeafIfWorkspaceFocusSteal(nSteal)).toBe(true);
    expect(traceTexts().some((t) => t.includes("ws-change preserve hit"))).toBe(true);
  });

  it("ws-change preserve miss already-open emits reason token", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wOpen = createMockWindow({ id: "yt", title: "YouTube", workspace: ctx.workspaces[0] });
    const nOpen = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wOpen);
    tab.lastTabFocus = wOpen;

    expect(wm().restoreOpenLeafIfWorkspaceFocusSteal(nOpen)).toBe(false);
    expect(
      traceTexts().some((t) => t.includes("ws-change preserve miss reason=already-open"))
    ).toBe(true);
  });

  it("setOpenLeaf TRACE uses lastTabFocus tab token", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wA = createMockWindow({ id: "a", title: "A", workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: "b", title: "B", workspace: ctx.workspaces[0] });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;

    expect(wm().setOpenLeaf(nB)).toBe(true);
    expect(traceTexts().some((t) => t.includes("lastTabFocus tab"))).toBe(true);
    expect(tab.lastTabFocus).toBe(wB);
  });

  it("revealGroupChild routes LTF via setOpenLeaf (no silent twin)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wA = createMockWindow({ id: "a", title: "A", workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: "b", title: "B", workspace: ctx.workspaces[0] });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    const nB = wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.lastTabFocus = wA;
    nB.mode = "TILE";
    wB.raise = vi.fn();

    revealGroupChild(wm(), nB, { source: "test-reveal" });
    expect(traceTexts().some((t) => t.includes("revealGroupChild source=test-reveal"))).toBe(true);
    expect(traceTexts().some((t) => t.includes("lastTabFocus tab"))).toBe(true);
    expect(tab.lastTabFocus).toBe(wB);
  });

  it("syncLastTabFocusFromFocus keeps YouTube when focus=Voice (state contract)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wYouTube = createMockWindow({ id: 1, title: "YouTube" });
    const wVoice = createMockWindow({ id: 2, title: "Voice" });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wYouTube);
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wVoice);
    tab.lastTabFocus = wYouTube;
    expect(syncLastTabFocusFromFocus(wm().tree, wVoice)).toBe(false);
    expect(tab.lastTabFocus).toBe(wYouTube);
  });

  it("dnd empty-mon no-decision hunt token includes reason", () => {
    const debugSpy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const meta = createMockWindow({ id: "dnd-src", title: "Src", workspace: ctx.workspaces[0] });
    const node = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, meta);
    node.mode = WINDOW_MODES.GRAB_TILE;
    meta.get_monitor = () => 0;

    expect(wm().dragDrop._commitEmptyMonitorDrop(node)).toBe(false);
    const texts = debugSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(
      texts.some(
        (t) =>
          t.includes("dnd empty-mon no-decision") &&
          t.includes("reason=") &&
          t.includes("hasWindowTarget=")
      )
    ).toBe(true);
    debugSpy.mockRestore();
  });

  it("disposed tab chrome emits metric warn deco-disposed", () => {
    const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const tab = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    const wA = createMockWindow({ id: "a", title: "A", workspace: ctx.workspaces[0] });
    const wB = createMockWindow({ id: "b", title: "B", workspace: ctx.workspaces[0] });
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wA);
    wm().tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, wB);
    tab.decoration._forgeDisposed = true;
    tab.decoration.hide = () => {
      throw new Error("Object St.BoxLayout has been already disposed — impossible to access it.");
    };
    expect(() => wm().updateDecorationLayout()).not.toThrow();
    const texts = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("metric warn deco-disposed"))).toBe(true);
    expect(tab.decoration).toBeNull();
    warnSpy.mockRestore();
  });
});
