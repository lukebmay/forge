/*
 * Pure default tile min floor (env). No gi://, node:, fs, or process.
 */

export const FORGE_MIN_TILE_WIDTH = "FORGE_MIN_TILE_WIDTH";
export const FORGE_MIN_TILE_HEIGHT = "FORGE_MIN_TILE_HEIGHT";
export const DEFAULT_MIN_TILE_WIDTH = 320;
export const DEFAULT_MIN_TILE_HEIGHT = 240;

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntEnv(raw, fallback) {
  if (raw == null) return fallback;
  const trimmed = String(raw).trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return fallback;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Policy lower bound for tile mins. Invalid/missing env → 320×240.
 *
 * @param {{
 *   env?: Record<string, string | null | undefined>,
 *   widthKey?: string,
 *   heightKey?: string,
 * }} [opts]
 * @returns {{ width: number, height: number }}
 */
export function defaultMinTileSize({
  env = {},
  widthKey = FORGE_MIN_TILE_WIDTH,
  heightKey = FORGE_MIN_TILE_HEIGHT,
} = {}) {
  return {
    width: positiveIntEnv(env[widthKey], DEFAULT_MIN_TILE_WIDTH),
    height: positiveIntEnv(env[heightKey], DEFAULT_MIN_TILE_HEIGHT),
  };
}
