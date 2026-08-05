import { describe, it, expect } from "vitest";
import {
  LAYOUT_VERIFY_EPSILON_PX,
  LAYOUT_VERIFY_AGREEMENT_NEEDED,
  normalizeRect,
  rectsAgree,
  windowAgrees,
  scanForest,
  monitorIndexFromValue,
  treeMonitorIndexOfNode,
  slotRectOfNode,
  collectTileVerifyInputs,
  scanWmTiles,
  readFrameRect,
  readMetaMonitor,
  isMetaAlive,
} from "../../../lib/extension/layout-verify.js";

const slot = { x: 100, y: 200, width: 800, height: 600 };

describe("layout-verify constants", () => {
  it("defaults match plan (ε=4, agreement×2)", () => {
    expect(LAYOUT_VERIFY_EPSILON_PX).toBe(4);
    expect(LAYOUT_VERIFY_AGREEMENT_NEEDED).toBe(2);
  });
});

describe("normalizeRect / rectsAgree", () => {
  it("exact match agrees", () => {
    expect(rectsAgree(slot, slot)).toBe(true);
    expect(rectsAgree({ ...slot }, slot, 0)).toBe(true);
  });

  it("within ε=4 agrees", () => {
    expect(rectsAgree({ x: 104, y: 196, width: 804, height: 596 }, slot, 4)).toBe(true);
    expect(rectsAgree({ x: 100, y: 200, width: 804, height: 600 }, slot)).toBe(true);
  });

  it("outside ε=4 fails", () => {
    expect(rectsAgree({ x: 105, y: 200, width: 800, height: 600 }, slot, 4)).toBe(false);
    expect(rectsAgree({ x: 100, y: 200, width: 805, height: 600 }, slot, 4)).toBe(false);
    expect(rectsAgree({ x: 100, y: 200, width: 800, height: 594 }, slot, 4)).toBe(false);
  });

  it("null / invalid rects never agree", () => {
    expect(rectsAgree(null, slot)).toBe(false);
    expect(rectsAgree(slot, null)).toBe(false);
    expect(rectsAgree(undefined, undefined)).toBe(false);
    expect(rectsAgree({ x: NaN, y: 0, width: 1, height: 1 }, slot)).toBe(false);
    expect(normalizeRect(null)).toBeNull();
    expect(normalizeRect({ x: 1, y: 2, width: 3, height: Infinity })).toBeNull();
  });
});

describe("windowAgrees", () => {
  it("ok when frame≈slot and mon match", () => {
    const r = windowAgrees({
      frame: { x: 102, y: 200, width: 800, height: 600 },
      slot,
      metaMon: 0,
      treeMon: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("mon mismatch alone fails", () => {
    const r = windowAgrees({
      frame: slot,
      slot,
      metaMon: 1,
      treeMon: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("mon-mismatch");
    expect(r.reasons).not.toContain("rect-mismatch");
  });

  it("rect mismatch reports rect-mismatch", () => {
    const r = windowAgrees({
      frame: { x: 0, y: 0, width: 10, height: 10 },
      slot,
      metaMon: 0,
      treeMon: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("rect-mismatch");
  });

  it("unknown mon sides fail when the other is known", () => {
    expect(windowAgrees({ frame: slot, slot, metaMon: 0, treeMon: -1 }).reasons).toContain(
      "tree-mon-unknown"
    );
    expect(windowAgrees({ frame: slot, slot, metaMon: -1, treeMon: 0 }).reasons).toContain(
      "meta-mon-unknown"
    );
  });
});

describe("scanForest", () => {
  it("all-agree when every window ok", () => {
    const r = scanForest([
      { id: 1, frame: slot, slot, metaMon: 0, treeMon: 0 },
      { id: 2, frame: { ...slot, x: 103 }, slot, metaMon: 1, treeMon: 1 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
    expect(r.mismatches).toEqual([]);
    expect(r.results).toHaveLength(2);
    expect(r.results.every((x) => x.ok)).toBe(true);
  });

  it("reports per-window mismatches; forest not ok", () => {
    const r = scanForest([
      { id: "a", frame: slot, slot, metaMon: 0, treeMon: 0 },
      { id: "b", frame: slot, slot, metaMon: 1, treeMon: 0 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.checked).toBe(2);
    expect(r.mismatches).toEqual([{ id: "b", reasons: ["mon-mismatch"] }]);
  });

  it("empty forest is vacuous ok", () => {
    const r = scanForest([]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });
});

describe("monitor helpers", () => {
  it("monitorIndexFromValue parses moNwsM", () => {
    expect(monitorIndexFromValue("mo0ws1")).toBe(0);
    expect(monitorIndexFromValue("mo2ws0")).toBe(2);
    expect(monitorIndexFromValue("")).toBe(-1);
    expect(monitorIndexFromValue(null)).toBe(-1);
  });

  it("treeMonitorIndexOfNode walks parent MONITOR", () => {
    const mon = { nodeType: "MONITOR", nodeValue: "mo1ws0", parentNode: null };
    const con = { nodeType: "CON", parentNode: mon };
    const win = { nodeType: "WINDOW", parentNode: con };
    expect(treeMonitorIndexOfNode(win)).toBe(1);
    expect(treeMonitorIndexOfNode(mon)).toBe(-1);
  });

  it("slotRectOfNode prefers renderRect over rect", () => {
    const renderRect = { x: 1, y: 2, width: 3, height: 4 };
    const rect = { x: 9, y: 9, width: 9, height: 9 };
    expect(slotRectOfNode({ renderRect, rect })).toEqual(renderRect);
    expect(slotRectOfNode({ rect })).toEqual(rect);
    expect(slotRectOfNode({})).toBeNull();
  });
});

describe("collectTileVerifyInputs / scanWmTiles", () => {
  function meta({
    id = 1,
    frame = slot,
    mon = 0,
    minimized = false,
    fullscreen = false,
    dead = false,
  } = {}) {
    return {
      get_id: () => {
        if (dead) throw new Error("finalized");
        return id;
      },
      get_frame_rect: () => frame,
      get_monitor: () => mon,
      is_minimized: () => minimized,
      is_fullscreen: () => fullscreen,
      minimized,
    };
  }

  function tileNode(partial = {}) {
    const monNode = {
      nodeType: "MONITOR",
      nodeValue: `mo${partial.treeMon ?? 0}ws0`,
      parentNode: null,
    };
    return {
      nodeType: "WINDOW",
      mode: partial.mode ?? "TILE",
      renderRect: partial.renderRect ?? slot,
      rect: partial.rect ?? null,
      nodeValue: partial.meta ?? meta(),
      parentNode: monNode,
      isWindow: () => true,
      isTile: () => (partial.mode ?? "TILE") === "TILE",
      isFloat: () => partial.mode === "FLOAT",
      isGrabTile: () => partial.mode === "GRAB_TILE",
    };
  }

  it("collects TILE with frame/slot/mon; skips floats and dead", () => {
    const nodes = [
      tileNode({ meta: meta({ id: 1 }) }),
      tileNode({ mode: "FLOAT", meta: meta({ id: 2 }) }),
      tileNode({ mode: "GRAB_TILE", meta: meta({ id: 3 }) }),
      tileNode({ meta: meta({ id: 4, dead: true }) }),
      tileNode({ meta: meta({ id: 5, minimized: true }) }),
      tileNode({ meta: meta({ id: 6, fullscreen: true }) }),
      tileNode({ mode: "DEFAULT", meta: meta({ id: 7 }) }),
    ];
    const inputs = collectTileVerifyInputs(nodes);
    expect(inputs.map((i) => i.id)).toEqual([1]);
    expect(inputs[0].metaMon).toBe(0);
    expect(inputs[0].treeMon).toBe(0);
    expect(inputs[0].frame).toEqual(slot);
    expect(inputs[0].slot).toEqual(slot);
  });

  it("scanWmTiles uses allNodeWindows and reports forest ok", () => {
    const wm = {
      allNodeWindows: [
        tileNode({ meta: meta({ id: 10, mon: 0 }), treeMon: 0 }),
        tileNode({
          meta: meta({ id: 11, mon: 1, frame: { x: 101, y: 200, width: 800, height: 600 } }),
          treeMon: 1,
        }),
      ],
    };
    // Fix parent mon for second node
    wm.allNodeWindows[1].parentNode.nodeValue = "mo1ws0";
    const r = scanWmTiles(wm);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
  });

  it("scanWmTiles reports mon mismatch", () => {
    const n = tileNode({ meta: meta({ id: 1, mon: 1 }), treeMon: 0 });
    n.parentNode.nodeValue = "mo0ws0";
    const r = scanWmTiles({ allNodeWindows: [n] });
    expect(r.ok).toBe(false);
    expect(r.mismatches[0].reasons).toContain("mon-mismatch");
  });

  it("null wm yields empty ok scan", () => {
    expect(scanWmTiles(null)).toEqual({
      ok: true,
      checked: 0,
      mismatches: [],
      results: [],
    });
  });
});

describe("read helpers", () => {
  it("readFrameRect / readMetaMonitor / isMetaAlive tolerate throws", () => {
    expect(readFrameRect(null)).toBeNull();
    expect(readMetaMonitor(null)).toBe(-1);
    expect(isMetaAlive(null)).toBe(false);
    const dead = {
      get_id: () => {
        throw new Error("dead");
      },
      get_frame_rect: () => {
        throw new Error("dead");
      },
      get_monitor: () => {
        throw new Error("dead");
      },
    };
    expect(isMetaAlive(dead)).toBe(false);
    expect(readFrameRect(dead)).toBeNull();
    expect(readMetaMonitor(dead)).toBe(-1);
  });
});
