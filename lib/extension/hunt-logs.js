/*
 * Temporary hunt prefixes. Flip flags off / delete when the hunt closes.
 */
import { Logger } from "../shared/logger.js";

/** TEMP: required TILE slot stays FLOAT / wrong Meta mon (vinyl WS2). */
export const HUNT_TILE_SLOT_FLOAT = true;

/**
 * Structured tile-slot-float hunt (D054/D067): short title + `{ fields }` payload.
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function huntTileSlotFloat(event, fields) {
  if (!HUNT_TILE_SLOT_FLOAT) return;
  const title = event != null ? String(event) : "event";
  if (fields != null && typeof fields === "object" && !Array.isArray(fields)) {
    Logger.debug(`hunt:tile-slot-float ${title}`, { fields });
    return;
  }
  Logger.debug(`hunt:tile-slot-float ${title}`);
}
