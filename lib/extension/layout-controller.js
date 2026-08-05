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
 *
 */

// Gnome imports
import GLib from "gi://GLib";

// Shared state
import { Logger } from "../shared/logger.js";

/** Trailing debounce for requestLayout → renderTree (CL0). */
export const LAYOUT_REQUEST_DEBOUNCE_MS = 200;

/** Trailing debounce for requestVerify (CL0 stub; full scanner CL1). */
export const VERIFY_REQUEST_DEBOUNCE_MS = 150;

/**
 * Default GLib schedule: timeout_add; callback returns SOURCE_REMOVE.
 * @param {number} delayMs
 * @param {() => void} cb
 * @returns {number} source id
 */
export function glibSchedule(delayMs, cb) {
  return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
    cb();
    return GLib.SOURCE_REMOVE ?? false;
  });
}

/**
 * @param {number} id
 */
export function glibCancel(id) {
  if (id) GLib.Source.remove(id);
}

/**
 * Trailing-debounce channel: multiple request(reason) collapse to one fire
 * after delayMs from the last request. Reasons coalesce (unique, order preserved).
 *
 * schedule/cancel are injectable so unit tests need not rely on GLib mocks
 * (stock tests/mocks/gnome/GLib.js never fires timeout_add callbacks).
 */
export class DebouncedRequest {
  /**
   * @param {object} opts
   * @param {number} opts.delayMs
   * @param {(delayMs: number, cb: () => void) => number|string} opts.schedule
   * @param {(id: number|string) => void} opts.cancel
   * @param {(reasons: string[]) => void} opts.onFire
   */
  constructor({ delayMs, schedule, cancel, onFire }) {
    this.delayMs = delayMs;
    this._schedule = schedule;
    this._cancel = cancel;
    this._onFire = onFire;
    /** @type {(number|string|null)} */
    this._timerId = null;
    /** @type {string[]} insertion-order unique reasons */
    this._reasons = [];
    this._destroyed = false;
  }

  /** @returns {string[]} copy of pending reasons */
  get pendingReasons() {
    return this._reasons.slice();
  }

  get hasPending() {
    return this._timerId != null || this._reasons.length > 0;
  }

  /**
   * @param {string} [reason]
   */
  request(reason) {
    if (this._destroyed) return;
    const r = reason == null || reason === "" ? "unknown" : String(reason);
    if (!this._reasons.includes(r)) {
      this._reasons.push(r);
    }
    this._reschedule();
  }

  cancel() {
    if (this._timerId != null) {
      this._cancel(this._timerId);
      this._timerId = null;
    }
    this._reasons = [];
  }

  destroy() {
    this.cancel();
    this._destroyed = true;
  }

  _reschedule() {
    if (this._timerId != null) {
      this._cancel(this._timerId);
      this._timerId = null;
    }
    this._timerId = this._schedule(this.delayMs, () => {
      this._timerId = null;
      const reasons = this._reasons;
      this._reasons = [];
      if (reasons.length === 0) return;
      this._onFire(reasons);
    });
  }
}

/**
 * Layout control-loop API (CL0): requestLayout / requestVerify with independent
 * trailing debounces. Full Meta↔slot verify is CL1; verify path is a debug stub.
 */
export class LayoutController {
  /**
   * @param {import('./window.js').WindowManager|null|undefined} wm
   * @param {object} [options]
   * @param {(delayMs: number, cb: () => void) => number|string} [options.schedule]
   * @param {(id: number|string) => void} [options.cancel]
   * @param {number} [options.layoutDelayMs]
   * @param {number} [options.verifyDelayMs]
   * @param {(reasons: string[]) => void} [options.onLayout] override layout fire
   * @param {(reasons: string[]) => void} [options.onVerify] override verify fire
   */
  constructor(wm, options = {}) {
    this._wm = wm;
    this._schedule = options.schedule ?? glibSchedule;
    this._cancel = options.cancel ?? glibCancel;
    this.layoutDelayMs = options.layoutDelayMs ?? LAYOUT_REQUEST_DEBOUNCE_MS;
    this.verifyDelayMs = options.verifyDelayMs ?? VERIFY_REQUEST_DEBOUNCE_MS;

    /** @type {string[]|null} last layout fire reasons (tests / debug) */
    this.lastLayoutReasons = null;
    /** @type {string[]|null} last verify fire reasons (tests / debug) */
    this.lastVerifyReasons = null;
    /** @type {number} how many times stub verify ran */
    this.verifyFireCount = 0;

    this._layout = new DebouncedRequest({
      delayMs: this.layoutDelayMs,
      schedule: this._schedule,
      cancel: this._cancel,
      onFire: (reasons) => {
        this.lastLayoutReasons = reasons.slice();
        if (typeof options.onLayout === "function") {
          options.onLayout(reasons);
          return;
        }
        this._defaultLayoutFire(reasons);
      },
    });

    this._verify = new DebouncedRequest({
      delayMs: this.verifyDelayMs,
      schedule: this._schedule,
      cancel: this._cancel,
      onFire: (reasons) => {
        this.lastVerifyReasons = reasons.slice();
        this.verifyFireCount += 1;
        if (typeof options.onVerify === "function") {
          options.onVerify(reasons);
          return;
        }
        this._defaultVerifyFire(reasons);
      },
    });
  }

  /**
   * Debounced path toward renderTree. Reasons coalesce until fire.
   * @param {string} [reason]
   */
  requestLayout(reason) {
    this._layout.request(reason);
  }

  /**
   * Debounced verify (CL0 stub; CL1 fills Meta↔slot scan).
   * @param {string} [reason]
   */
  requestVerify(reason) {
    this._verify.request(reason);
  }

  /**
   * After a successful renderTree body: schedule post-render verify.
   * @param {string} [from]
   */
  onRenderComplete(from) {
    // Keep a breadcrumb of which render completed; verify reason stays stable for CL1.
    if (from) {
      Logger.debug(`layout-controller: render complete (${from})`);
    }
    this.requestVerify("post-render");
  }

  /** Cancel both channels and clear pending reasons. */
  cancel() {
    this._layout.cancel();
    this._verify.cancel();
  }

  /** Teardown: cancel timers; further requests are no-ops. */
  destroy() {
    this._layout.destroy();
    this._verify.destroy();
    this._wm = null;
  }

  get layoutPending() {
    return this._layout.hasPending;
  }

  get verifyPending() {
    return this._verify.hasPending;
  }

  get pendingLayoutReasons() {
    return this._layout.pendingReasons;
  }

  get pendingVerifyReasons() {
    return this._verify.pendingReasons;
  }

  /**
   * @param {string[]} reasons
   */
  _defaultLayoutFire(reasons) {
    const from = reasons.join(",");
    Logger.debug(`layout-controller: requestLayout fire → renderTree(${from})`);
    const wm = this._wm;
    if (wm && typeof wm.renderTree === "function") {
      wm.renderTree(from);
    }
  }

  /**
   * CL0 stub: log + record; real scanner lands in CL1.
   * @param {string[]} reasons
   */
  _defaultVerifyFire(reasons) {
    Logger.debug(`layout-controller: verify stub (${reasons.join(",")})`);
  }
}
