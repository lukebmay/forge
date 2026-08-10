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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Pure settle soft-timeout math (rolling max × pad, floor, clamp).
 * Shared formula with CLI settle_heuristics — floors/clamps stay caller-owned.
 */

/** Rolling residual-positive samples. */
export const ROLLING_N = 10;

/** Pad on residual max (D019). */
export const PAD = 1.25;

/**
 * Last N non-negative finite int latencies (ms); skip invalid.
 * @param {unknown} values
 * @param {number} [n=ROLLING_N]
 * @returns {number[]}
 */
export function lastRollingLatencies(values, n = ROLLING_N) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const v of values) {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) continue;
    out.push(Math.trunc(num));
  }
  const lim = Number(n);
  if (Number.isFinite(lim) && lim > 0 && out.length > lim) {
    return out.slice(-lim);
  }
  return out;
}

/**
 * Soft timeout from residual-positive latencies (ms).
 * Empty after filter → floor; else trunc(min(clamp, max(floor, max*pad))).
 *
 * @param {unknown} latencies
 * @param {{ pad?: number, floor?: number, clamp?: number }} [opts]
 * @returns {number}
 */
export function softTimeoutFromLatencies(latencies, opts = {}) {
  const pad =
    typeof opts.pad === "number" && Number.isFinite(opts.pad) && opts.pad > 0 ? opts.pad : PAD;
  const floor = _nonNegInt(opts.floor, 0);
  const clamp =
    typeof opts.clamp === "number" && Number.isFinite(opts.clamp) && opts.clamp >= 0
      ? Math.trunc(opts.clamp)
      : Number.MAX_SAFE_INTEGER;

  // Filter only (no rolling trim — compose with lastRollingLatencies).
  const samples = [];
  if (Array.isArray(latencies)) {
    for (const v of latencies) {
      const num = Number(v);
      if (!Number.isFinite(num) || num < 0) continue;
      samples.push(Math.trunc(num));
    }
  }

  if (samples.length === 0) return floor;

  let maxLat = samples[0];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] > maxLat) maxLat = samples[i];
  }
  const raw = maxLat * pad;
  return Math.trunc(Math.min(clamp, Math.max(floor, raw)));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function _nonNegInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}
