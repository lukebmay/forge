import { describe, expect, it, vi } from "vitest";
import GObject from "gi://GObject";
import { Logger } from "../../../lib/shared/logger.js";
import { makeLiveHandle, initWindowApp } from "../../../lib/extension/live-handle.js";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree-types.js";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";

describe("makeLiveHandle", () => {
  it("is a plain duck, not GObject Node", () => {
    const h = makeLiveHandle(NODE_TYPES.WINDOW, { id: "w1" });
    expect(h instanceof GObject.Object).toBe(false);
    expect(h.childNodes).toBeUndefined();
    expect(h.parentNode).toBeUndefined();
    expect(h.appendChild).toBeUndefined();
    expect(h.removeChild).toBeUndefined();
    expect(h.getNodeByType).toBeUndefined();
    expect(h.render).toBeUndefined();
  });

  it("sets identity fields and copies wm/settings", () => {
    const wm = { tree: { settings: { k: 1 } } };
    const settings = wm.tree.settings;
    const h = makeLiveHandle(NODE_TYPES.CON, { id: "bin" }, {
      wm,
      settings,
      layout: LAYOUT_TYPES.HSPLIT,
      percent: 0.4,
      userSized: true,
    });
    expect(h.nodeType).toBe(NODE_TYPES.CON);
    expect(h.nodeValue).toEqual({ id: "bin" });
    expect(h.wm).toBe(wm);
    expect(h.settings).toBe(settings);
    expect(h.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(h.percent).toBe(0.4);
    expect(h.userSized).toBe(true);
    expect(h.mode).toBe(WINDOW_MODES.DEFAULT);
  });

  it("predicates follow kind/mode/layout", () => {
    const win = makeLiveHandle(NODE_TYPES.WINDOW, { id: "w" }, { mode: WINDOW_MODES.FLOAT });
    expect(win.isWindow()).toBe(true);
    expect(win.isCon()).toBe(false);
    expect(win.isFloat()).toBe(true);
    expect(win.isTile()).toBe(false);
    expect(win.isGrabTile()).toBe(false);
    expect(win.isPlaceholder()).toBe(false);

    const con = makeLiveHandle(NODE_TYPES.CON, {}, { layout: LAYOUT_TYPES.TABBED });
    expect(con.isCon()).toBe(true);
    expect(con.isTabbed()).toBe(true);
    expect(con.isStackedOrTabbed()).toBe(true);
    expect(con.isHSplit()).toBe(false);

    const split = makeLiveHandle(NODE_TYPES.MONITOR, "mo0ws0", {
      layout: LAYOUT_TYPES.VSPLIT,
    });
    expect(split.isMonitor()).toBe(true);
    expect(split.isVSplit()).toBe(true);
    expect(split.isWorkspace()).toBe(false);
    expect(split.isRoot()).toBe(false);
  });

  it("marks placeholder WINDOWs and skips app snapshot", () => {
    const stub = { id: "ph", _forgePlaceholder: true };
    const h = makeLiveHandle(NODE_TYPES.WINDOW, stub, { placeholder: true });
    expect(h.placeholder).toBe(true);
    expect(h.isPlaceholder()).toBe(true);
    expect(h.app).toBeNull();
  });

  it("emits greppable invent hunt token once", () => {
    const spy = vi.spyOn(Logger, "info").mockImplementation(() => {});
    makeLiveHandle(NODE_TYPES.WORKSPACE, "ws0");
    const texts = spy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.filter((t) => t.includes("live-handle invent kind=WORKSPACE"))).toHaveLength(1);
    spy.mockRestore();
  });
});

describe("initWindowApp", () => {
  it("no-ops for non-WINDOW", () => {
    const con = makeLiveHandle(NODE_TYPES.CON, {});
    con.app = "keep";
    initWindowApp(con);
    expect(con.app).toBe("keep");
  });
});
