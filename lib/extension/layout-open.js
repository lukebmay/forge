/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Pure open-batch helpers (CL4 + CL5).
 *
 * Open = batch N=1: after admit, wait for client quiet (catalog minQuietMs /
 * built-in / default / dock floor), then one layout commit. Max wait forces
 * commit so broken clients cannot block forever.
 *
 * Multi-open (CL5 / forge layout): LayoutBatch begin → N admits with per-window
 * quiet (no mid-batch requestLayout) → residual RunSteps one Cf + settle →
 * LayoutBatch end. Same control loop as N=1. CLI may optionally wait on whole
 * GetTree fingerprint quiet (--wait-tree-stable); not required for place.
 *
 * No GObject imports — unit tests stay light.
 */

/** Default quiet after last external geometry for normal apps. */
export const OPEN_DEFAULT_QUIET_MS = 200;

/** Dock opens: short floor so sticky mon + first geometry land quickly. */
export const OPEN_DOCK_QUIET_MS = 50;

/** Cap from map/open: commit anyway even if never quiet. */
export const OPEN_COMMIT_MAX_WAIT_MS = 2500;

/** Extra quiet on first open of a class (observation; non-dock only). */
export const OPEN_FIRST_OPEN_EXTRA_MS = 400;

/**
 * Resolve min quiet ms for an open.
 *
 * - Dock: short floor (default 50); catalog may raise above it (e.g. Ghostty).
 * - Non-dock: max(default, catalog); first-open adds optional extra.
 *
 * @param {{
 *   isDock?: boolean,
 *   catalogMinQuietMs?: number|null,
 *   firstOpen?: boolean,
 *   defaultQuietMs?: number,
 *   dockQuietMs?: number,
 *   firstOpenExtraMs?: number,
 * }} [opts]
 * @returns {number}
 */
export function computeOpenMinQuietMs(opts = {}) {
  const dockQuiet = _nonNeg(opts.dockQuietMs, OPEN_DOCK_QUIET_MS);
  const defaultQ = _nonNeg(opts.defaultQuietMs, OPEN_DEFAULT_QUIET_MS);
  const catalog = _nonNeg(opts.catalogMinQuietMs, 0);
  const firstExtra = _nonNeg(opts.firstOpenExtraMs, OPEN_FIRST_OPEN_EXTRA_MS);

  if (opts.isDock) {
    // Dock short floor; thrashy dock apps (catalog) still raise quiet.
    return Math.max(dockQuiet, catalog);
  }

  let ms = Math.max(defaultQ, catalog);
  if (opts.firstOpen) {
    ms += firstExtra;
  }
  return ms;
}

/**
 * True when quiet has been met since last external geometry (or open).
 *
 * @param {{
 *   openedAt: number,
 *   lastExternalGeomAt?: number|null,
 *   minQuietMs: number,
 *   now: number,
 * }} ctx
 * @returns {boolean}
 */
export function isQuietMet(ctx) {
  const minQuiet = _nonNeg(ctx.minQuietMs, 0);
  const last =
    ctx.lastExternalGeomAt != null && Number.isFinite(ctx.lastExternalGeomAt)
      ? ctx.lastExternalGeomAt
      : ctx.openedAt;
  return ctx.now - last >= minQuiet;
}

/**
 * True when open has waited past max wait from openedAt.
 *
 * @param {{
 *   openedAt: number,
 *   maxWaitMs?: number,
 *   now: number,
 * }} ctx
 * @returns {boolean}
 */
export function isMaxWaitExceeded(ctx) {
  const maxWait = _nonNeg(ctx.maxWaitMs, OPEN_COMMIT_MAX_WAIT_MS);
  return ctx.now - ctx.openedAt >= maxWait;
}

/**
 * Quiet met or max wait → commit open layout.
 *
 * @param {{
 *   openedAt: number,
 *   lastExternalGeomAt?: number|null,
 *   minQuietMs: number,
 *   maxWaitMs?: number,
 *   now: number,
 * }} ctx
 * @returns {boolean}
 */
export function shouldCommitOpen(ctx) {
  return isQuietMet(ctx) || isMaxWaitExceeded(ctx);
}

/**
 * ms until open commit should fire (0 = now).
 * min(remaining quiet, remaining max-wait).
 *
 * @param {{
 *   openedAt: number,
 *   lastExternalGeomAt?: number|null,
 *   minQuietMs: number,
 *   maxWaitMs?: number,
 *   now: number,
 * }} ctx
 * @returns {number}
 */
export function nextOpenCommitDelayMs(ctx) {
  if (shouldCommitOpen(ctx)) return 0;
  const maxWait = _nonNeg(ctx.maxWaitMs, OPEN_COMMIT_MAX_WAIT_MS);
  const minQuiet = _nonNeg(ctx.minQuietMs, 0);
  const last =
    ctx.lastExternalGeomAt != null && Number.isFinite(ctx.lastExternalGeomAt)
      ? ctx.lastExternalGeomAt
      : ctx.openedAt;
  const quietRemain = Math.max(0, minQuiet - (ctx.now - last));
  const maxRemain = Math.max(0, maxWait - (ctx.now - ctx.openedAt));
  return Math.min(quietRemain, maxRemain);
}

/**
 * Whether first-open extra should apply for this catalog observation.
 * Built-ins start with seenOpens=0 / firstOpenObserved=false.
 *
 * @param {{ seenOpens?: number, firstOpenObserved?: boolean }|null|undefined} entryBeforeRecord
 * @returns {boolean}
 */
export function isFirstOpenOfClass(entryBeforeRecord) {
  if (!entryBeforeRecord) return true;
  const seen = Number(entryBeforeRecord.seenOpens) || 0;
  return seen === 0 && !entryBeforeRecord.firstOpenObserved;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function _nonNeg(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
