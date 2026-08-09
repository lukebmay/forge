import { describe, it, expect } from "vitest";
import {
  LAYOUT_OPEN_LEAF_PIN_MS,
  layoutOpenLeafPinActive,
  makeLayoutOpenLeafPin,
  shouldRestoreLayoutOpenLeaf,
} from "../../../lib/extension/layout-open-leaf-pin.js";

describe("layout-open-leaf-pin (SE5 / D018)", () => {
  it("pin duration matches soft-focus wall cap (not short 3s)", () => {
    expect(LAYOUT_OPEN_LEAF_PIN_MS).toBe(15000);
  });

  it("makeLayoutOpenLeafPin records until = now + residual", () => {
    const meta = { id: "grok" };
    const pin = makeLayoutOpenLeafPin(meta, 5000, 1_000_000);
    expect(pin).toEqual({ meta, until: 1_005_000 });
  });

  it("makeLayoutOpenLeafPin defaults residual to LAYOUT_OPEN_LEAF_PIN_MS", () => {
    const meta = { id: "a" };
    const pin = makeLayoutOpenLeafPin(meta, undefined, 0);
    expect(pin.until).toBe(LAYOUT_OPEN_LEAF_PIN_MS);
  });

  it("makeLayoutOpenLeafPin null meta → null", () => {
    expect(makeLayoutOpenLeafPin(null)).toBeNull();
  });

  it("layoutOpenLeafPinActive true only before until", () => {
    const pin = { meta: { id: 1 }, until: 1000 };
    expect(layoutOpenLeafPinActive(pin, 999)).toBe(true);
    expect(layoutOpenLeafPinActive(pin, 1000)).toBe(false);
    expect(layoutOpenLeafPinActive(null, 0)).toBe(false);
    expect(layoutOpenLeafPinActive({ meta: null, until: 9999 }, 0)).toBe(false);
  });

  it("shouldRestoreLayoutOpenLeaf when steal differs from pin", () => {
    const pinned = { id: "grok" };
    const stealer = { id: "chrome" };
    const pin = makeLayoutOpenLeafPin(pinned, 15_000, 0);
    expect(shouldRestoreLayoutOpenLeaf(pin, stealer, 100)).toBe(true);
    expect(shouldRestoreLayoutOpenLeaf(pin, pinned, 100)).toBe(false);
  });

  it("shouldRestoreLayoutOpenLeaf false after pin expires", () => {
    const pinned = { id: "grok" };
    const stealer = { id: "chrome" };
    const pin = makeLayoutOpenLeafPin(pinned, 1000, 0);
    expect(shouldRestoreLayoutOpenLeaf(pin, stealer, 1001)).toBe(false);
  });

  it("3.5s pin would expire before first-ever soft trial (6s) — regression guard", () => {
    // Old session-api used 3500ms; soft learning trial is 6000ms focus.
    const pinShort = makeLayoutOpenLeafPin({ id: "g" }, 3500, 0);
    expect(layoutOpenLeafPinActive(pinShort, 4000)).toBe(false);
    const pinWall = makeLayoutOpenLeafPin({ id: "g" }, LAYOUT_OPEN_LEAF_PIN_MS, 0);
    expect(layoutOpenLeafPinActive(pinWall, 6000)).toBe(true);
    expect(layoutOpenLeafPinActive(pinWall, 14_999)).toBe(true);
  });
});
