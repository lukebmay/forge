import { describe, it, expect } from "vitest";
import {
  dropWouldOverflowMins,
  swapWouldOverflowMins,
} from "../../../lib/extension/drop-intent.js";
import {
  MIN_CLAMP_LEARN_DELAY_MS,
  clearClassMinFloorForTests,
  noteWindowMinFromClamp,
  noteWindowMinFromOversizedFrame,
  frameOverflowsSlotForLearn,
  parseWindowMinsJson,
  readWindowMinSize,
  rememberClassMin,
  loadClassMinFloor,
  exportClassMinFloor,
  classMinFloor,
  CLASS_MIN_ABSURD_W,
  CLASS_MIN_ABSURD_H,
} from "../../../lib/extension/tree-layout.js";

function centerOp(overrides = {}) {
  return {
    isCenter: true,
    isSwap: false,
    isBefore: false,
    isHorizontal: false,
    shouldCreateCon: false,
    ...overrides,
  };
}

function edgeOp(overrides = {}) {
  return {
    isCenter: false,
    isSwap: false,
    isBefore: false,
    isHorizontal: false,
    shouldCreateCon: false,
    ...overrides,
  };
}

describe("dropWouldOverflowMins", () => {
  function win(id, minW, minH) {
    return {
      id,
      nodeValue: {
        get_size_hints: () =>
          minW || minH ? { min_width: minW || 0, min_height: minH || 0 } : null,
      },
    };
  }

  it("env floor overflows tiny slots (no fail-open on unknown)", () => {
    const a = win("A", 0, 0);
    a.nodeValue.get_size_hints = () => null;
    // Product 256×144 (Vitest setup uses tiny FORGE_MIN_TILE_* for other fixtures).
    const productMin = (m) => readWindowMinSize(m, { env: {} });
    expect(
      dropWouldOverflowMins(
        a,
        win("B", 0, 0),
        edgeOp({ isHorizontal: false }),
        { targetRect: { width: 200, height: 200 } },
        productMin
      )
    ).toBe(true);
  });

  it("custom getMin zeros still fail-open", () => {
    const zero = () => ({ width: 0, height: 0 });
    const a = win("A", 0, 0);
    expect(
      dropWouldOverflowMins(
        a,
        win("B", 0, 0),
        edgeOp({ isHorizontal: false }),
        { targetRect: { width: 200, height: 200 } },
        zero
      )
    ).toBe(false);
  });

  it("TOP/BOTTOM half too short for dragged min height", () => {
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(true);
  });

  it("TOP/BOTTOM OK when half fits", () => {
    const a = win("A", 0, 200);
    const b = win("B", 0, 200);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(false);
  });

  it("CENTER tab join uses full pane (not half)", () => {
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    // Half of 600 is 300 → would overflow; full pane 600 → OK.
    expect(
      dropWouldOverflowMins(a, b, centerOp(), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(false);
    expect(
      dropWouldOverflowMins(a, b, centerOp(), {
        targetRect: { width: 800, height: 300 },
      })
    ).toBe(true);
  });

  it("quarter-slot LEFT/CENTER/RIGHT legal for ~380 min height", () => {
    const a = win("A", 200, 380);
    const b = win("B", 100, 100);
    const quarter = { width: 960, height: 540 };
    expect(dropWouldOverflowMins(a, b, centerOp(), { targetRect: quarter })).toBe(false);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), { targetRect: quarter })
    ).toBe(false);
  });

  it("blocks when destination app cannot fit half", () => {
    const a = win("A", 100, 100);
    const b = win("B", 0, 400);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), {
        targetRect: { width: 800, height: 600 },
      })
    ).toBe(true);
  });

  it("LEFT/RIGHT blocks when either min exceeds half width", () => {
    const a = win("A", 500, 0);
    const b = win("B", 500, 0);
    expect(
      dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), {
        targetRect: { width: 900, height: 800 },
      })
    ).toBe(true);
  });

  it("empty-mon blocks when work area shorter than min", () => {
    const a = win("A", 0, 900);
    expect(
      dropWouldOverflowMins(a, null, centerOp(), {
        emptyMonitor: true,
        workArea: { width: 1920, height: 800 },
      })
    ).toBe(true);
  });

  it("HSPLIT can fit when only VSPLIT overflows height", () => {
    // Dragged min height 400: half of 600 = 300 → VSPLIT (TOP) overflow;
    // half width of 800 = 400 → HSPLIT (LEFT) OK; CENTER full pane OK.
    const a = win("A", 0, 400);
    const b = win("B", 0, 0);
    const slot = { width: 800, height: 600 };
    expect(dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: false }), { targetRect: slot })).toBe(
      true
    );
    expect(dropWouldOverflowMins(a, b, edgeOp({ isHorizontal: true }), { targetRect: slot })).toBe(
      false
    );
    expect(dropWouldOverflowMins(a, b, centerOp(), { targetRect: slot })).toBe(false);
  });

  it("swapWouldOverflowMins checks both slots", () => {
    const a = {
      rect: { width: 400, height: 1000 },
      nodeValue: { get_size_hints: () => ({ min_width: 0, min_height: 800 }) },
    };
    const b = {
      rect: { width: 400, height: 200 },
      nodeValue: { get_size_hints: () => ({ min_width: 0, min_height: 100 }) },
    };
    expect(swapWouldOverflowMins(a, b)).toBe(true);
    b.rect = { width: 400, height: 900 };
    expect(swapWouldOverflowMins(a, b)).toBe(false);
  });
});

describe("readWindowMinSize / noteWindowMinFromClamp", () => {
  /** Tiny floor so merge/hint tests are not masked by the 256×144 default. */
  const tinyEnv = {
    FORGE_MIN_TILE_WIDTH: "1",
    FORGE_MIN_TILE_HEIGHT: "1",
  };
  /** Empty env → product defaults (Vitest setup sets process FORGE_MIN_TILE_*=1). */
  const productEnv = {};

  it("applies default env floor when unset", () => {
    clearClassMinFloorForTests();
    expect(readWindowMinSize(null, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
    expect(readWindowMinSize({}, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
  });

  it("honors env floor override", () => {
    clearClassMinFloorForTests();
    expect(
      readWindowMinSize({}, { env: { FORGE_MIN_TILE_WIDTH: "100", FORGE_MIN_TILE_HEIGHT: "50" } })
    ).toEqual({ width: 100, height: 50 });
  });

  it("reads size hints (floored by env)", () => {
    clearClassMinFloorForTests();
    const meta = {
      get_size_hints: () => ({ min_width: 120, min_height: 340 }),
    };
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 120, height: 340 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 340,
    });
  });

  it("R062: does not learn map-size as min when commanded dest is much larger", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = {
      width: 1878,
      height: 1048,
      at: 1000,
      priorW: 700,
      priorH: 651,
    };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 700, height: 651 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
    expect(
      noteWindowMinFromOversizedFrame(
        meta,
        { width: 700, height: 651 },
        { width: 1878, height: 1048 },
        4
      )
    ).toBe(false);
  });

  it("ignores immediate race; does not learn while still at prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 200, height: 150, at: 1000, priorW: 200, priorH: 380 };
    noteWindowMinFromClamp(meta, req, { width: 200, height: 380 }, 4, 1000 + 10);
    expect(meta._forgeKnownMinH).toBeFalsy();
    // Frame still glued to prior → resize not applied; do not poison with prior.
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 200, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("learns clamp when frame settles between request and prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 200, height: 150, at: 1000, priorW: 200, priorH: 800 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 200, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 380 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 380,
    });
  });

  it("does not learn without a finite prior that already moved", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 400, height: 150, at: 1000 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 700, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("does not learn when frame grew or stayed flat vs prior", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = { width: 400, height: 150, at: 1000, priorW: 500, priorH: 300 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 700, height: 380 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("rejects half-pane frames above absurd caps", () => {
    clearClassMinFloorForTests();
    const meta = {};
    const req = {
      width: 400,
      height: 200,
      at: 1000,
      priorW: 1920,
      priorH: 1080,
    };
    const now = 1000 + MIN_CLAMP_LEARN_DELAY_MS + 1;
    noteWindowMinFromClamp(meta, req, { width: 900, height: 700 }, 4, now);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
    expect(900).toBeGreaterThan(CLASS_MIN_ABSURD_W);
    expect(700).toBeGreaterThan(CLASS_MIN_ABSURD_H);
    noteWindowMinFromClamp(meta, req, { width: 700, height: 500 }, 4, now);
    expect(meta._forgeKnownMinW).toBe(700);
    expect(meta._forgeKnownMinH).toBe(500);
  });

  it("ratchets known min down when request is accepted", () => {
    clearClassMinFloorForTests();
    const meta = { _forgeKnownMinH: 700 };
    const req = { width: 400, height: 500, at: 1000, priorW: 800, priorH: 800 };
    noteWindowMinFromClamp(
      meta,
      req,
      { width: 400, height: 500 },
      4,
      1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
    );
    expect(meta._forgeKnownMinH).toBe(500);
  });

  it("discards absurd learned mins then applies env floor", () => {
    clearClassMinFloorForTests();
    const meta = { _forgeKnownMinH: 1032, _forgeKnownMinW: 1800 };
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 1 });
    expect(readWindowMinSize(meta, { env: productEnv })).toEqual({
      width: 256,
      height: 144,
    });
  });

  it("learns mins from settled frame larger than slot on overflow axes only", () => {
    clearClassMinFloorForTests();
    const meta = { get_wm_class: () => "org.gnome.Nautilus" };
    const slot = { width: 800, height: 200 };
    const frame = { width: 800, height: 380 };
    expect(frameOverflowsSlotForLearn(frame, slot, 4)).toBe(true);
    expect(noteWindowMinFromOversizedFrame(meta, frame, slot, 4)).toBe(true);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBe(380);
    expect(classMinFloor("org.gnome.Nautilus").height).toBe(380);
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 1, height: 380 });
  });

  it("skips oversized-frame learn above absurd caps", () => {
    clearClassMinFloorForTests();
    const meta = {};
    expect(
      noteWindowMinFromOversizedFrame(
        meta,
        { width: 900, height: 700 },
        { width: 400, height: 200 },
        4
      )
    ).toBe(false);
    expect(
      frameOverflowsSlotForLearn({ width: 900, height: 700 }, { width: 400, height: 200 }, 4)
    ).toBe(false);
    expect(meta._forgeKnownMinW).toBeFalsy();
    expect(meta._forgeKnownMinH).toBeFalsy();
  });

  it("falls back to class floor when meta has no hints; learned can raise above env", () => {
    clearClassMinFloorForTests();
    rememberClassMin("org.gnome.Nautilus", 360, 380);
    const meta = {
      get_wm_class: () => "org.gnome.Nautilus",
      get_size_hints: () => null,
    };
    expect(readWindowMinSize(meta)).toEqual({ width: 360, height: 380 });
    expect(readWindowMinSize(meta, { env: tinyEnv })).toEqual({ width: 360, height: 380 });
  });

  it("parseWindowMinsJson caps absurd and loads", () => {
    clearClassMinFloorForTests();
    const parsed = parseWindowMinsJson(
      JSON.stringify({
        v: 1,
        classes: {
          "org.gnome.Nautilus": { width: 360, height: 380 },
          Huge: { width: 2000, height: 900 },
        },
      })
    );
    expect(parsed["org.gnome.Nautilus"]).toEqual({ width: 360, height: 380 });
    expect(parsed.Huge).toBeUndefined();
    loadClassMinFloor(parsed);
    expect(exportClassMinFloor()["org.gnome.Nautilus"]).toEqual({ width: 360, height: 380 });
  });
});
