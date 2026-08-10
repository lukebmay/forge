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
 * Per-window command epoch (apply-contract AC2).
 *
 * Stack `_suppressGeom` only covers in-call re-entrancy.
 * After move_resize returns, clients still snap (cell grid, min-size) and
 * re-fire size/position — those must stay echo, not forest markUnsettled.
 *
 * No GObject imports — unit tests stay light.
 */

/** Post-apply residual window (ms). Mid of 250–500; not multi-second Meta sleeps. */
export const COMMAND_ECHO_RESIDUAL_MS = 350;

/**
 * @typedef {{
 *   waveId: number,
 *   commandId: number,
 *   until: number,
 *   mode: "echo",
 *   t0: number,
 *   targetRect: object|null,
 * }} CommandEpoch
 */

/**
 * Wave + per-window echo epochs. Injectable clock for tests.
 */
export class LayoutCommandEpoch {
  /**
   * @param {{
   *   now?: () => number,
   *   residualMs?: number,
   * }=} [opts]
   */
  constructor(opts = {}) {
    /** @type {() => number} */
    this._now = typeof opts.now === "function" ? opts.now : () => Date.now();
    const r = Number(opts.residualMs);
    this._residualMs = Number.isFinite(r) && r >= 0 ? Math.floor(r) : COMMAND_ECHO_RESIDUAL_MS;
    /** @type {number} */
    this._waveId = 0;
    /** @type {number} */
    this._commandSeq = 0;
    /** @type {WeakMap<object, CommandEpoch>} */
    this._epochs = new WeakMap();
  }

  /** @returns {number} current residual ms */
  get residualMs() {
    return this._residualMs;
  }

  /** @returns {number} latest beginWave id (0 = none yet) */
  get waveId() {
    return this._waveId;
  }

  /**
   * Replace clock (tests).
   * @param {() => number} nowFn
   */
  setNow(nowFn) {
    if (typeof nowFn === "function") this._now = nowFn;
  }

  /**
   * Start or advance a layout wave (LayoutBatch begin / explicit apply wave).
   * @returns {number} new waveId
   */
  beginWave() {
    this._waveId += 1;
    return this._waveId;
  }

  /**
   * Wave end marker (epochs still expire by `until`; no global clear).
   * @returns {number} current waveId
   */
  endWave() {
    return this._waveId;
  }

  /**
   * @returns {number}
   */
  nextCommandId() {
    this._commandSeq += 1;
    return this._commandSeq;
  }

  /**
   * After a successful tile move/apply to a slot: start or refresh echo epoch.
   * If no wave has begun yet, begins wave 1.
   *
   * @param {object|null|undefined} metaWindow
   * @param {{
   *   targetRect?: object|null,
   *   waveId?: number,
   *   residualMs?: number,
   *   t0?: number,
   * }=} [opts]
   * @returns {CommandEpoch|null}
   */
  startEcho(metaWindow, opts = {}) {
    if (!metaWindow) return null;

    let waveId = opts.waveId;
    if (waveId == null || !Number.isFinite(waveId) || waveId <= 0) {
      if (this._waveId <= 0) this.beginWave();
      waveId = this._waveId;
    }

    const residualMs =
      opts.residualMs != null && Number.isFinite(Number(opts.residualMs))
        ? Math.max(0, Math.floor(Number(opts.residualMs)))
        : this._residualMs;

    const t0 = opts.t0 != null && Number.isFinite(Number(opts.t0)) ? Number(opts.t0) : this._now();
    const commandId = this.nextCommandId();
    /** @type {CommandEpoch} */
    const epoch = {
      waveId,
      commandId,
      t0,
      until: t0 + residualMs,
      mode: "echo",
      targetRect: opts.targetRect ?? null,
    };
    this._epochs.set(metaWindow, epoch);
    return epoch;
  }

  /**
   * @param {object|null|undefined} metaWindow
   * @returns {CommandEpoch|null}
   */
  getEpoch(metaWindow) {
    if (!metaWindow) return null;
    return this._epochs.get(metaWindow) ?? null;
  }

  /**
   * True while mode is echo and now &lt; until.
   * @param {object|null|undefined} metaWindow
   * @param {number=} [now] override clock
   * @returns {boolean}
   */
  isEchoActive(metaWindow, now) {
    if (!metaWindow) return false;
    const e = this._epochs.get(metaWindow);
    if (!e || e.mode !== "echo") return false;
    const t = now != null && Number.isFinite(Number(now)) ? Number(now) : this._now();
    return t < e.until;
  }

  /**
   * @param {object|null|undefined} metaWindow
   */
  clearEpoch(metaWindow) {
    if (metaWindow) this._epochs.delete(metaWindow);
  }
}
