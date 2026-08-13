import { describe, it, expect } from "vitest";
import {
  isForgeCausedGeometrySignal,
  shouldChromeOnlyGeometry,
  shouldRestoreTileSlot,
  LAYOUT_VERIFY_EPSILON_PX,
} from "../../../lib/extension/layout-sensors.js";

describe("isForgeCausedGeometrySignal", () => {
  it("is false for null/empty wm", () => {
    expect(isForgeCausedGeometrySignal(null)).toBe(false);
    expect(isForgeCausedGeometrySignal(undefined)).toBe(false);
    expect(isForgeCausedGeometrySignal({})).toBe(false);
  });

  it("is true when _suppressGeom.active", () => {
    expect(isForgeCausedGeometrySignal({ _suppressGeom: { active: false } })).toBe(false);
    expect(isForgeCausedGeometrySignal({ _suppressGeom: { active: true } })).toBe(true);
  });

  it("stack suppress is WM-wide (metaWindow optional)", () => {
    const wm = { _suppressGeom: { active: true } };
    expect(isForgeCausedGeometrySignal(wm, { id: 1 })).toBe(true);
    expect(isForgeCausedGeometrySignal(wm)).toBe(true);
  });

  it("true when layoutEpoch.isEchoActive for that metaWindow", () => {
    const win = { id: 7 };
    const wm = {
      _suppressGeom: { active: false },
      layoutEpoch: {
        isEchoActive: (mw) => mw === win,
      },
    };
    expect(isForgeCausedGeometrySignal(wm, win)).toBe(true);
    expect(isForgeCausedGeometrySignal(wm, { id: 8 })).toBe(false);
    expect(isForgeCausedGeometrySignal(wm, null)).toBe(false);
  });
});

describe("shouldChromeOnlyGeometry", () => {
  const slot = { x: 100, y: 200, width: 800, height: 600 };

  function makeNode(mode = "TILE", rect = slot) {
    return { mode, renderRect: { ...rect }, rect: { ...rect } };
  }

  function makeMeta(frame, { fullscreen = false, maximized = 0 } = {}) {
    return {
      get_frame_rect: () => ({ ...frame }),
      is_fullscreen: () => fullscreen,
      get_maximized: () => maximized,
    };
  }

  it("exports LAYOUT_VERIFY_EPSILON_PX (default 4)", () => {
    expect(LAYOUT_VERIFY_EPSILON_PX).toBe(4);
  });

  it("true when TILE frame within ε of slot", () => {
    const node = makeNode();
    const meta = makeMeta({
      x: slot.x + 2,
      y: slot.y - 1,
      width: slot.width - 3,
      height: slot.height + 1,
    });
    expect(shouldChromeOnlyGeometry(node, meta)).toBe(true);
  });

  it("false when frame drifts beyond ε", () => {
    const node = makeNode();
    const meta = makeMeta({ x: 200, y: 200, width: 400, height: 300 });
    expect(shouldChromeOnlyGeometry(node, meta)).toBe(false);
  });

  it("false for FLOAT / missing node / missing meta", () => {
    const meta = makeMeta(slot);
    expect(shouldChromeOnlyGeometry({ mode: "FLOAT", renderRect: slot }, meta)).toBe(false);
    expect(shouldChromeOnlyGeometry(null, meta)).toBe(false);
    expect(shouldChromeOnlyGeometry(makeNode(), null)).toBe(false);
  });

  it("false when fullscreen or maximized", () => {
    const node = makeNode();
    expect(shouldChromeOnlyGeometry(node, makeMeta(slot, { fullscreen: true }))).toBe(false);
    expect(shouldChromeOnlyGeometry(node, makeMeta(slot, { maximized: 3 }))).toBe(false);
  });

  it("false when slot missing or zero-sized", () => {
    const meta = makeMeta(slot);
    expect(shouldChromeOnlyGeometry({ mode: "TILE" }, meta)).toBe(false);
    expect(
      shouldChromeOnlyGeometry(
        { mode: "TILE", renderRect: { x: 0, y: 0, width: 0, height: 10 } },
        meta
      )
    ).toBe(false);
  });

  it("accepts injectable isMaximized", () => {
    const node = makeNode();
    const meta = makeMeta(slot);
    expect(
      shouldChromeOnlyGeometry(node, meta, 4, {
        isMaximized: () => true,
      })
    ).toBe(false);
    expect(
      shouldChromeOnlyGeometry(node, meta, 4, {
        isMaximized: () => false,
      })
    ).toBe(true);
  });
});

describe("shouldRestoreTileSlot", () => {
  const slot = { x: 100, y: 200, width: 800, height: 600 };

  function makeNode(mode = "TILE", rect = slot) {
    return { mode, renderRect: { ...rect }, rect: { ...rect } };
  }

  function makeMeta(frame, { fullscreen = false, maximized = 0 } = {}) {
    return {
      get_frame_rect: () => ({ ...frame }),
      is_fullscreen: () => fullscreen,
      get_maximized: () => maximized,
    };
  }

  it("false for FLOAT / missing node / missing meta", () => {
    const meta = makeMeta(slot);
    expect(shouldRestoreTileSlot({ mode: "FLOAT", renderRect: slot }, meta)).toBe(false);
    expect(shouldRestoreTileSlot(null, meta)).toBe(false);
    expect(shouldRestoreTileSlot(makeNode(), null)).toBe(false);
  });

  it("false when tilingEnabled is false", () => {
    const node = makeNode();
    const meta = makeMeta({ x: 0, y: 0, width: 400, height: 300 });
    expect(shouldRestoreTileSlot(node, meta, 4, { tilingEnabled: false })).toBe(false);
  });

  it("false for lone-tile maximize-on-single", () => {
    const node = makeNode();
    const meta = makeMeta(slot, { maximized: 3 });
    expect(
      shouldRestoreTileSlot(node, meta, 4, {
        isLoneMaximized: () => true,
      })
    ).toBe(false);
  });

  it("true for fullscreen even when lone-max predicate is false", () => {
    const node = makeNode();
    const meta = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { fullscreen: true });
    expect(
      shouldRestoreTileSlot(node, meta, 4, {
        isLoneMaximized: () => false,
      })
    ).toBe(true);
  });

  it("true for maximize flags with siblings (not lone)", () => {
    const node = makeNode();
    const meta = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { maximized: 3 });
    expect(
      shouldRestoreTileSlot(node, meta, 4, {
        isLoneMaximized: () => false,
      })
    ).toBe(true);
  });

  it("true when TILE frame drifts beyond ε", () => {
    const node = makeNode();
    const meta = makeMeta({ x: 200, y: 200, width: 400, height: 300 });
    expect(shouldRestoreTileSlot(node, meta)).toBe(true);
  });

  it("false when TILE frame is already in slot", () => {
    const node = makeNode();
    const meta = makeMeta({
      x: slot.x + 1,
      y: slot.y,
      width: slot.width,
      height: slot.height,
    });
    expect(shouldRestoreTileSlot(node, meta)).toBe(false);
  });

  it("false when node.zoomMode is set (D030), even if Meta-maxed", () => {
    const node = { ...makeNode(), zoomMode: "full" };
    const maxed = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { maximized: 3 });
    const fs = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { fullscreen: true });
    const drifted = makeMeta({ x: 0, y: 0, width: 400, height: 300 });
    expect(shouldRestoreTileSlot(node, maxed)).toBe(false);
    expect(shouldRestoreTileSlot(node, fs)).toBe(false);
    expect(shouldRestoreTileSlot(node, drifted)).toBe(false);
  });

  it("true for unsolicited Meta max/fs on a non-zoomed TILE (R020)", () => {
    const node = makeNode();
    const maxed = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { maximized: 3 });
    const fs = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { fullscreen: true });
    expect(shouldRestoreTileSlot(node, maxed)).toBe(true);
    expect(shouldRestoreTileSlot(node, fs)).toBe(true);
  });

  it("forGrab is true only for max/fs, not bare size drift", () => {
    const node = makeNode();
    const drifted = makeMeta({ x: 200, y: 200, width: 400, height: 300 });
    const maxed = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { maximized: 3 });
    const fs = makeMeta({ x: 0, y: 0, width: 1920, height: 1080 }, { fullscreen: true });
    expect(shouldRestoreTileSlot(node, drifted, 4, { forGrab: true })).toBe(false);
    expect(shouldRestoreTileSlot(node, maxed, 4, { forGrab: true })).toBe(true);
    expect(shouldRestoreTileSlot(node, fs, 4, { forGrab: true })).toBe(true);
  });
});
