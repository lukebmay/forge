import { describe, it, expect } from "vitest";
import {
  FORGE_MIN_TILE_WIDTH,
  FORGE_MIN_TILE_HEIGHT,
  DEFAULT_MIN_TILE_WIDTH,
  DEFAULT_MIN_TILE_HEIGHT,
  defaultMinTileSize,
} from "../../../lib/shared/min-tile-size.js";

describe("defaultMinTileSize", () => {
  it("defaults to 256×144 when env unset", () => {
    expect(DEFAULT_MIN_TILE_WIDTH).toBe(256);
    expect(DEFAULT_MIN_TILE_HEIGHT).toBe(144);
    expect(defaultMinTileSize({ env: {} })).toEqual({
      width: DEFAULT_MIN_TILE_WIDTH,
      height: DEFAULT_MIN_TILE_HEIGHT,
    });
    expect(defaultMinTileSize()).toEqual({ width: 256, height: 144 });
  });

  it("uses positive int env overrides", () => {
    expect(
      defaultMinTileSize({
        env: {
          [FORGE_MIN_TILE_WIDTH]: "400",
          [FORGE_MIN_TILE_HEIGHT]: "300",
        },
      })
    ).toEqual({ width: 400, height: 300 });
  });

  it("falls back on invalid or empty env values", () => {
    expect(
      defaultMinTileSize({
        env: {
          [FORGE_MIN_TILE_WIDTH]: "0",
          [FORGE_MIN_TILE_HEIGHT]: "-10",
        },
      })
    ).toEqual({ width: 256, height: 144 });
    expect(
      defaultMinTileSize({
        env: {
          [FORGE_MIN_TILE_WIDTH]: "nope",
          [FORGE_MIN_TILE_HEIGHT]: "  ",
        },
      })
    ).toEqual({ width: 256, height: 144 });
    expect(
      defaultMinTileSize({
        env: {
          [FORGE_MIN_TILE_WIDTH]: "12.5",
          [FORGE_MIN_TILE_HEIGHT]: null,
        },
      })
    ).toEqual({ width: 256, height: 144 });
  });

  it("allows custom keys and per-axis override", () => {
    expect(
      defaultMinTileSize({
        env: { W: "1", H: "2" },
        widthKey: "W",
        heightKey: "H",
      })
    ).toEqual({ width: 1, height: 2 });
    expect(
      defaultMinTileSize({
        env: { [FORGE_MIN_TILE_WIDTH]: "100" },
      })
    ).toEqual({ width: 100, height: 144 });
  });
});
