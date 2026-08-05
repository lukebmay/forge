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

// Gnome imports
import GLib from "gi://GLib";

// Shared state
import { Logger } from "../shared/logger.js";
import { AppThrashCatalog, extractWmClass, hasThrashyManagedTile } from "./app-thrash-catalog.js";
import {
  LAYOUT_VERIFY_AGREEMENT_NEEDED,
  LAYOUT_VERIFY_EPSILON_PX,
  scanWmTiles,
} from "./layout-verify.js";

/** Trailing debounce for requestLayout → renderTree (CL0). */
export const LAYOUT_REQUEST_DEBOUNCE_MS = 200;

/** Trailing debounce for requestVerify (CL0/CL1). */
export const VERIFY_REQUEST_DEBOUNCE_MS = 150;

/** Verify reason for one extra thrash pass after SETTLED (CL3). */
export const THRASH_EXTRA_VERIFY_REASON = "thrash-extra";

export { LAYOUT_VERIFY_EPSILON_PX, LAYOUT_VERIFY_AGREEMENT_NEEDED };

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
 * Layout control-loop API: requestLayout / requestVerify with independent
 * trailing debounces. CL1: Meta↔slot scan + agreement counter → SETTLED.
 * CL3: thrash catalog + one thrash-extra verify per settle wave.
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
   * @param {() => { ok: boolean, checked?: number, mismatches?: any[] }} [options.scan]
   * @param {number} [options.verifyEpsilon]
   * @param {number} [options.agreementNeeded]
   * @param {import('./app-thrash-catalog.js').AppThrashCatalog|null} [options.catalog]
   * @param {() => boolean} [options.hasThrashyTile] inject thrashy-TILE probe (tests)
   */
  constructor(wm, options = {}) {
    this._wm = wm;
    this._schedule = options.schedule ?? glibSchedule;
    this._cancel = options.cancel ?? glibCancel;
    this.layoutDelayMs = options.layoutDelayMs ?? LAYOUT_REQUEST_DEBOUNCE_MS;
    this.verifyDelayMs = options.verifyDelayMs ?? VERIFY_REQUEST_DEBOUNCE_MS;
    this._scan = typeof options.scan === "function" ? options.scan : null;
    this.verifyEpsilon = options.verifyEpsilon ?? LAYOUT_VERIFY_EPSILON_PX;
    this.agreementNeeded = options.agreementNeeded ?? LAYOUT_VERIFY_AGREEMENT_NEEDED;

    /** @type {import('./app-thrash-catalog.js').AppThrashCatalog|null} */
    this.catalog =
      options.catalog !== undefined
        ? options.catalog
        : wm?.appThrashCatalog instanceof AppThrashCatalog
        ? wm.appThrashCatalog
        : new AppThrashCatalog();
    /** @type {(() => boolean)|null} */
    this._hasThrashyTile =
      typeof options.hasThrashyTile === "function" ? options.hasThrashyTile : null;

    /** @type {string[]|null} last layout fire reasons (tests / debug) */
    this.lastLayoutReasons = null;
    /** @type {string[]|null} last verify fire reasons (tests / debug) */
    this.lastVerifyReasons = null;
    /** @type {number} how many times verify fire ran */
    this.verifyFireCount = 0;

    /** Consecutive full-agreement verify fires. */
    this.agreementCount = 0;
    /** Forest SETTLED after agreementNeeded consecutive ok verifies. */
    this.settled = false;
    /** @type {object|null} last scan result */
    this.lastVerifyResult = null;
    /** @type {string|null} last markUnsettled reason */
    this.lastUnsettledReason = null;
    /**
     * Latch: requestLayout("verify-mismatch") at most once per mismatch wave
     * until a successful full agreement clears it.
     */
    this._mismatchLayoutRequested = false;
    /** How many times verify-mismatch requested layout (tests). */
    this.mismatchLayoutRequestCount = 0;
    /**
     * Latch: one thrash-extra verify per settle wave (CL3).
     * Cleared on markUnsettled so the next wave may request again.
     */
    this._thrashExtraLatch = false;
    /** How many times thrash-extra was requested (tests). */
    this.thrashExtraRequestCount = 0;

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
   * Debounced Meta↔slot verify.
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
    if (from) {
      Logger.debug(`layout-controller: render complete (${from})`);
    }
    this.requestVerify("post-render");
  }

  /**
   * External / sensor path: reset agreement so forest is not SETTLED.
   * @param {string} [reason]
   */
  markUnsettled(reason) {
    const r = reason == null || reason === "" ? "unsettled" : String(reason);
    this.lastUnsettledReason = r;
    this.agreementCount = 0;
    this.settled = false;
    // New settle wave may need thrash-extra again.
    this._thrashExtraLatch = false;
    Logger.debug(`layout-controller: markUnsettled (${r})`);
  }

  /**
   * CL2: external size/position (or mon) sensor — unsettle + debounce layout/verify.
   * CL3: record postMap / postApply counters (callers must skip Forge-suppressed).
   * Prefer this over naked renderTree for non-grab geometry drift.
   * @param {string} [reason]
   * @param {unknown} [metaWindow]
   */
  onExternalGeometry(reason, metaWindow) {
    const r = reason == null || reason === "" ? "external-geometry" : String(reason);
    this._noteThrashFromExternal(metaWindow, r);
    this.markUnsettled(r);
    this.requestLayout(r);
    this.requestVerify(r);
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
    this._scan = null;
    this.catalog = null;
    this._hasThrashyTile = null;
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
   * CL1: scan Meta↔slots, update agreement, optional single mismatch layout.
   * @param {string[]} reasons
   */
  _defaultVerifyFire(reasons) {
    const result = this._runScan();
    this.lastVerifyResult = result;
    const ok = !!(result && result.ok);

    if (ok) {
      this._onVerifyAgreement(reasons);
    } else {
      this._onVerifyMismatch(reasons, result);
    }
  }

  /**
   * @returns {{ ok: boolean, checked?: number, mismatches?: any[], results?: any[] }}
   */
  _runScan() {
    if (typeof this._scan === "function") {
      try {
        const r = this._scan();
        if (r && typeof r.ok === "boolean") return r;
        return { ok: false, checked: 0, mismatches: [{ id: null, reasons: ["bad-scan"] }] };
      } catch (e) {
        Logger.debug(`layout-controller: scan threw: ${e}`);
        return { ok: false, checked: 0, mismatches: [{ id: null, reasons: ["scan-error"] }] };
      }
    }
    return scanWmTiles(this._wm, this.verifyEpsilon);
  }

  /**
   * @param {string[]} reasons
   */
  _onVerifyAgreement(reasons) {
    // Successful full agreement ends the mismatch→layout wave latch.
    this._mismatchLayoutRequested = false;
    this.agreementCount += 1;
    const n = this.agreementCount;
    const need = this.agreementNeeded;

    if (n >= need) {
      const wasSettled = this.settled;
      this.settled = true;
      Logger.debug(`layout-controller: verify ok (${reasons.join(",")}) agreement=${n} → SETTLED`);
      // One thrash-extra only on transition into SETTLED (latch blocks loops).
      if (!wasSettled) {
        this._maybeExtraThrashVerify();
      }
      return;
    }

    this.settled = false;
    Logger.debug(`layout-controller: verify ok (${reasons.join(",")}) agreement=${n}/${need}`);
    // Auto second pass so post-render alone can reach SETTLED without external callers.
    this.requestVerify("agreement-confirm");
  }

  /**
   * @param {string[]} reasons
   * @param {{ mismatches?: any[], checked?: number }|null} result
   */
  _onVerifyMismatch(reasons, result) {
    this.agreementCount = 0;
    this.settled = false;
    // Mismatch opens a new settle wave for thrash-extra.
    this._thrashExtraLatch = false;
    const nMis = result?.mismatches?.length ?? 0;
    const checked = result?.checked ?? 0;
    Logger.debug(
      `layout-controller: verify mismatch (${reasons.join(",")}) ` +
        `${nMis}/${checked} windows; sample=${JSON.stringify(result?.mismatches?.[0] ?? null)}`
    );

    if (!this._mismatchLayoutRequested) {
      this._mismatchLayoutRequested = true;
      this.mismatchLayoutRequestCount += 1;
      this.requestLayout("verify-mismatch");
    }
  }

  /**
   * CL3: after first SETTLED in a wave, one extra verify if thrashy TILE present.
   */
  _maybeExtraThrashVerify() {
    if (this._thrashExtraLatch) return;
    if (!this._probeThrashyTile()) return;
    this._thrashExtraLatch = true;
    this.thrashExtraRequestCount += 1;
    Logger.debug("layout-controller: thrash-extra verify scheduled");
    this.requestVerify(THRASH_EXTRA_VERIFY_REASON);
  }

  /**
   * @returns {boolean}
   */
  _probeThrashyTile() {
    if (typeof this._hasThrashyTile === "function") {
      try {
        return !!this._hasThrashyTile();
      } catch {
        return false;
      }
    }
    return hasThrashyManagedTile(this._wm, this.catalog);
  }

  /**
   * Attribute external geometry to the thrash catalog (Forge-suppressed must not call).
   * @param {unknown} metaWindow
   * @param {string} reason
   */
  _noteThrashFromExternal(metaWindow, reason) {
    const catalog = this.catalog;
    if (!catalog) return;
    const cls = extractWmClass(metaWindow);
    if (!cls) return;

    const wasSettled = this.settled;
    const isSize = /size/i.test(reason);

    if (isSize) {
      catalog.recordPostMapSizeChange(cls);
    }
    // Client thrash after a good apply: forest was SETTLED before this signal.
    if (wasSettled) {
      catalog.recordPostApplyDrift(cls);
    }
  }
}
