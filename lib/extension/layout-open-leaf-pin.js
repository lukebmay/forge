/*
 * Layout open-leaf pin (D018 / SE5) — pure helpers for focus residual thrash.
 *
 * During layout focus, Chrome/PWA late activate must not rewrite lastTabFocus.
 * Pin duration covers the soft-focus wall (CLI settle heuristics), not a short
 * fixed 3s that expires mid soft-barrier.
 */

/** Match scripts/forge/layout_apply.SOFT_FOCUS_WALL_CAP_MS (D019 soft wall). */
export const LAYOUT_OPEN_LEAF_PIN_MS = 15000;

/**
 * @param {object|null|undefined} meta
 * @param {number} [residualMs]
 * @param {number} [nowMs]
 * @returns {{ meta: object, until: number }|null}
 */
export function makeLayoutOpenLeafPin(
  meta,
  residualMs = LAYOUT_OPEN_LEAF_PIN_MS,
  nowMs = Date.now()
) {
  if (meta == null) return null;
  const ms = Number.isFinite(Number(residualMs))
    ? Math.max(0, Math.floor(Number(residualMs)))
    : LAYOUT_OPEN_LEAF_PIN_MS;
  return { meta, until: Number(nowMs) + ms };
}

/**
 * @param {{ meta?: object, until?: number }|null|undefined} pin
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function layoutOpenLeafPinActive(pin, nowMs = Date.now()) {
  if (!pin || pin.meta == null) return false;
  const until = Number(pin.until);
  if (!Number.isFinite(until)) return false;
  return Number(nowMs) < until;
}

/**
 * True when meta-focus landed on a non-pinned sibling under a live pin.
 * @param {{ meta?: object, until?: number }|null|undefined} pin
 * @param {object|null|undefined} focusMeta
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function shouldRestoreLayoutOpenLeaf(pin, focusMeta, nowMs = Date.now()) {
  if (!layoutOpenLeafPinActive(pin, nowMs)) return false;
  if (focusMeta == null) return false;
  return focusMeta !== pin.meta;
}
