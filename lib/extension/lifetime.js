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
 * Thin compose of SourceBag + SignalBag: one dispose path for both.
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L3 Lifetime).
 */

import { Logger } from "../shared/logger.js";
import { SourceBag } from "./sources.js";
import { SignalBag } from "./signals.js";

/**
 * Owns (or wraps) a SourceBag and SignalBag. dispose() seals both.
 *
 * Dispose order: signals first, then sources — handlers may arm timers;
 * after signals are gone, cancel residual timers.
 */
export class Lifetime {
  /**
   * @param {object} [opts]
   * @param {string} [opts.label]
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {(cb: () => void) => number|string} [opts.scheduleIdle]
   * @param {() => number} [opts.nowMs]
   * @param {SourceBag} [opts.sources] inject existing bag
   * @param {SignalBag} [opts.signals] inject existing bag
   */
  constructor(opts = {}) {
    this.label = opts.label != null && opts.label !== "" ? String(opts.label) : "lifetime";
    this._disposed = false;

    if (opts.sources) {
      this._sources = opts.sources;
    } else {
      /** @type {ConstructorParameters<typeof SourceBag>[0]} */
      const sourceOpts = { label: this.label };
      if (typeof opts.schedule === "function") sourceOpts.schedule = opts.schedule;
      if (typeof opts.cancel === "function") sourceOpts.cancel = opts.cancel;
      if (typeof opts.scheduleIdle === "function") sourceOpts.scheduleIdle = opts.scheduleIdle;
      if (typeof opts.nowMs === "function") sourceOpts.nowMs = opts.nowMs;
      this._sources = new SourceBag(sourceOpts);
    }

    if (opts.signals) {
      this._signals = opts.signals;
    } else {
      /** @type {ConstructorParameters<typeof SignalBag>[0]} */
      const signalOpts = { label: this.label };
      if (typeof opts.nowMs === "function") signalOpts.nowMs = opts.nowMs;
      this._signals = new SignalBag(signalOpts);
    }
  }

  get disposed() {
    return this._disposed;
  }

  /** @returns {SourceBag} */
  get sources() {
    return this._sources;
  }

  /** @returns {SignalBag} */
  get signals() {
    return this._signals;
  }

  /**
   * Dispose signals then sources. Idempotent.
   */
  dispose() {
    if (this._disposed) {
      Logger.trace(`[Lifetime:${this.label}] dispose already sealed`);
      return;
    }
    // Signals first: drop handlers that might arm timers; then cancel residuals.
    this._signals.dispose();
    this._sources.dispose();
    this._disposed = true;
    Logger.debug(`[Lifetime:${this.label}] dispose sealed`);
  }

  /**
   * Combined residual dump for failure analysis.
   * @returns {{
   *   label: string,
   *   disposed: boolean,
   *   sources: ReturnType<SourceBag['snapshot']>,
   *   signals: ReturnType<SignalBag['snapshot']>,
   * }}
   */
  snapshot() {
    return {
      label: this.label,
      disposed: this._disposed,
      sources: this._sources.snapshot(),
      signals: this._signals.snapshot(),
    };
  }
}
