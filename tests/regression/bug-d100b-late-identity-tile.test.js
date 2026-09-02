import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../lib/extension/window-modes.js";
import {
  createMockWindow,
  createWindowManagerFixture,
} from "../mocks/helpers/index.js";
import { Logger } from "../../lib/shared/logger.js";

/**
 * D100b residual: null wm_class (or empty title) at map → FLOAT under FLOATS;
 * when identity lands, narrow processFloats promotes TILE without maze reconnect.
 */
describe("D100b: late identity promotes FLOAT→TILE", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: { "tiling-mode-enabled": true },
    });
    vi.spyOn(Logger, "trace").mockImplementation(() => {});
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  it("null wm_class at track → class lands → mode TILE (Forest bag)", () => {
    const meta = createMockWindow({
      wm_class: null,
      id: 9201,
      title: "Text Editor",
      allows_resize: true,
    });
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);
    const nid = wm().hostBag.idFromMeta(meta);
    expect(node).not.toBeNull();
    expect(wm().isFloatingExempt(meta)).toBe(true);
    expect(node.mode).toBe(WINDOW_MODES.FLOAT);
    expect(wm().hostBag.get(nid)?.floating).toBe(true);

    const renderSpy = vi.spyOn(wm(), "renderTree");
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    meta.set_wm_class("org.gnome.TextEditor");

    expect(wm().isFloatingExempt(meta)).toBe(false);
    expect(node.mode).toBe(WINDOW_MODES.TILE);
    expect(wm().hostBag.get(nid)?.floating).toBe(false);
    expect(commitSpy).toHaveBeenCalledWith("wm-class-identity");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("empty title at track → title lands → mode TILE when class known", () => {
    const meta = createMockWindow({
      wm_class: "org.gnome.Nautilus",
      id: 9202,
      title: "",
      allows_resize: true,
    });
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);
    const nid = wm().hostBag.idFromMeta(meta);
    expect(node.mode).toBe(WINDOW_MODES.FLOAT);
    expect(wm().hostBag.get(nid)?.floating).toBe(true);

    const renderSpy = vi.spyOn(wm(), "renderTree");
    meta.set_title("Home");

    expect(node.mode).toBe(WINDOW_MODES.TILE);
    expect(wm().hostBag.get(nid)?.floating).toBe(false);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("ordinary nonempty→nonempty title does not commitLayout", () => {
    const meta = createMockWindow({
      wm_class: "Google-chrome",
      id: 9203,
      title: "Tab A",
      allows_resize: true,
    });
    wm().trackWindow(null, meta);
    const node = wm().findNodeWindow(meta);
    expect(node.mode).toBe(WINDOW_MODES.TILE);

    const commitSpy = vi.spyOn(wm(), "commitLayout");
    meta.set_title("Tab B");
    expect(node.mode).toBe(WINDOW_MODES.TILE);
    expect(commitSpy).not.toHaveBeenCalledWith("title-identity");
  });

  it("second null-class open still TILE after adopt slotSplit", () => {
    const first = createMockWindow({
      wm_class: null,
      id: 9204,
      title: "Home",
      allows_resize: true,
    });
    wm().trackWindow(null, first);
    first.set_wm_class("org.gnome.Nautilus");
    expect(wm().findNodeWindow(first).mode).toBe(WINDOW_MODES.TILE);

    const second = createMockWindow({
      wm_class: null,
      id: 9205,
      title: "Home",
      allows_resize: true,
    });
    wm().trackWindow(null, second);
    const node2 = wm().findNodeWindow(second);
    const nid2 = wm().hostBag.idFromMeta(second);
    expect(node2.mode).toBe(WINDOW_MODES.FLOAT);

    const renderSpy = vi.spyOn(wm(), "renderTree");
    const commitSpy = vi.spyOn(wm(), "commitLayout");
    second.set_wm_class("org.gnome.Nautilus");

    expect(node2.mode).toBe(WINDOW_MODES.TILE);
    expect(wm().hostBag.get(nid2)?.floating).toBe(false);
    expect(commitSpy).toHaveBeenCalledWith("wm-class-identity");
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
