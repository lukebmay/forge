/*
 * Temporary hunt prefixes. Flip flags off / delete when the hunt closes.
 */
import { Logger } from "../shared/logger.js";

/** TEMP: required TILE slot stays FLOAT / wrong Meta mon (vinyl WS2). */
export const HUNT_TILE_SLOT_FLOAT = true;

/**
 * @param {string} msg
 * @param {...unknown} _rest
 */
export function huntTileSlotFloat(msg, ..._rest) {
  if (!HUNT_TILE_SLOT_FLOAT) return;
  const body = msg != null ? String(msg) : "";
  Logger.debug(`hunt:tile-slot-float ${body}`);
}
