/*
 * This file is part of the Forge extension for GNOME
 *
 * Presentation zoom (D030): flag + paint rect. Not Meta maximize.
 */

export const ZOOM_FULL = "full";
export const ZOOM_HORIZONTAL = "horizontal";
export const ZOOM_VERTICAL = "vertical";

const ZOOM_MODES = new Set([ZOOM_FULL, ZOOM_HORIZONTAL, ZOOM_VERTICAL]);

export function isZoomMode(mode) {
  return ZOOM_MODES.has(mode);
}

/**
 * @param {{ x: number, y: number, width: number, height: number }|null|undefined} slot
 * @param {{ x: number, y: number, width: number, height: number }|null|undefined} workarea
 * @param {string|null|undefined} zoomMode
 * @returns {{ x: number, y: number, width: number, height: number }|null|undefined}
 */
export function zoomRect(slot, workarea, zoomMode) {
  if (!slot) return slot;
  if (!isZoomMode(zoomMode) || !workarea) {
    return { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  }
  switch (zoomMode) {
    case ZOOM_FULL:
      return { x: workarea.x, y: workarea.y, width: workarea.width, height: workarea.height };
    case ZOOM_HORIZONTAL:
      return { x: workarea.x, y: slot.y, width: workarea.width, height: slot.height };
    case ZOOM_VERTICAL:
      return { x: slot.x, y: workarea.y, width: slot.width, height: workarea.height };
    default:
      return { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  }
}

/** Any current zoom + any chord → clear. */
export function resolveZoomToggle(current, requested) {
  if (isZoomMode(current)) return null;
  return isZoomMode(requested) ? requested : null;
}

/** One zoomed TILE per monitor: set target, clear peers. */
export function applyOneZoomPerMonitor(windows, target, mode) {
  if (!windows) return;
  for (const w of windows) {
    if (!w) continue;
    if (w === target) w.zoomMode = isZoomMode(mode) ? mode : null;
    else if (w.zoomMode) w.zoomMode = null;
  }
}
