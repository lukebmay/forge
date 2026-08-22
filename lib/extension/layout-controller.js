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

// Shared state
import { Logger } from "../shared/logger.js";
import { AppThrashCatalog, extractWmClass } from "./app-thrash-catalog.js";
import {
  LAYOUT_VERIFY_AGREEMENT_NEEDED,
  LAYOUT_VERIFY_EPSILON_PX,
  scanWmTiles,
} from "./layout-verify.js";
import { glibSchedule, glibCancel } from "./sources.js";

/** Trailing debounce for requestLayout → renderTree (CL0). */
export const LAYOUT_REQUEST_DEBOUNCE_MS = 200;

/** Trailing debounce for requestVerify (CL0/CL1). */
export const VERIFY_REQUEST_DEBOUNCE_MS = 150;

export { LAYOUT_VERIFY_EPSILON_PX, LAYOUT_VERIFY_AGREEMENT_NEEDED };

// Back-compat: open-commit and tests import schedule helpers from this module.
export { glibSchedule, glibCancel };

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

/** Reason string used by the optional debug periodic verify timer (CL6). */
export const PERIODIC_VERIFY_REASON = "periodic";

/**
 * Layout control-loop API: requestLayout / requestVerify with independent
 * trailing debounces. Verify is a **sensor** (scan + store + log) — never
 * reasserts tiles or requestLayout from mismatch (apply-contract AC1).
 * Single ok → SETTLED; thrash catalog kept for open quiet / observe metrics.
 * CL6: optional debug periodic verify interval (default off).
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
   * @param {import('./app-thrash-catalog.js').AppThrashCatalog|null} [options.catalog]
   * @param {number} [options.verifyIntervalMs] CL6 debug periodic (0 = off)
   */
  constructor(wm, options = {}) {
    this._wm = wm;
    this._schedule = options.schedule ?? glibSchedule;
    this._cancel = options.cancel ?? glibCancel;
    this.layoutDelayMs = options.layoutDelayMs ?? LAYOUT_REQUEST_DEBOUNCE_MS;
    this.verifyDelayMs = options.verifyDelayMs ?? VERIFY_REQUEST_DEBOUNCE_MS;
    this._scan = typeof options.scan === "function" ? options.scan : null;
    this.verifyEpsilon = options.verifyEpsilon ?? LAYOUT_VERIFY_EPSILON_PX;
    /** Historical export; settle is first ok (sensor). */
    this.agreementNeeded = LAYOUT_VERIFY_AGREEMENT_NEEDED;

    /** @type {import('./app-thrash-catalog.js').AppThrashCatalog|null} */
    this.catalog =
      options.catalog !== undefined
        ? options.catalog
        : wm?.appThrashCatalog instanceof AppThrashCatalog
        ? wm.appThrashCatalog
        : new AppThrashCatalog();

    /** @type {string[]|null} last layout fire reasons (tests / debug) */
    this.lastLayoutReasons = null;
    /** @type {string[]|null} last verify fire reasons (tests / debug) */
    this.lastVerifyReasons = null;
    /** @type {number} how many times verify fire ran */
    this.verifyFireCount = 0;

    /** Consecutive full-agreement verify fires (debug counter). */
    this.agreementCount = 0;
    /** Forest SETTLED after a successful verify ok (sensor; not pixel lock). */
    this.settled = false;
    /** @type {object|null} last scan result */
    this.lastVerifyResult = null;
    /** @type {string|null} last markUnsettled reason */
    this.lastUnsettledReason = null;

    /**
     * SL1: open windows awaiting first Meta↔slot agreement sample (observe only).
     * metaWindow → { openedAt, mismatches }
     * @type {Map<object, { openedAt: number, mismatches: number }>}
     */
    this._settlePending = new Map();

    /** CL6: desired period ms; 0 = off. */
    this._verifyIntervalMs = 0;
    /** @type {number|string|null} one-shot timer id; re-armed after each tick */
    this._periodicTimerId = null;
    /** How many times the periodic arm fired (tests). */
    this.periodicFireCount = 0;
    this._destroyed = false;

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

    if (options.verifyIntervalMs != null) {
      this.setVerifyIntervalMs(options.verifyIntervalMs);
    }
  }

  /**
   * Debounced path toward renderTree. Reasons coalesce until fire.
   * CL5: while open-layout batch is active, latch need-commit only (no mid-batch
   * fire). Intentional apply writer only — verify mismatch must not call this.
   * @param {string} [reason]
   */
  requestLayout(reason) {
    const wm = this._wm;
    if (wm && (wm._openLayoutBatchDepth || 0) > 0) {
      wm._openLayoutBatchNeedsCommit = true;
      return;
    }
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
    Logger.debug(`layout-controller: markUnsettled (${r})`);
  }

  /**
   * External size/position (or mon) sensor — catalog observe + unsettle +
   * diagnostic verify. Does **not** requestLayout or reassert (apply-contract AC1).
   * Callers must skip Forge-suppressed geometry.
   * @param {string} [reason]
   * @param {unknown} [metaWindow]
   */
  onExternalGeometry(reason, metaWindow) {
    const r = reason == null || reason === "" ? "external-geometry" : String(reason);
    this._noteThrashFromExternal(metaWindow, r);
    this.markUnsettled(r);
    this.requestVerify(r);
  }

  /**
   * CL6: optional debug periodic verify. `ms <= 0` disables (production default).
   * Restarts the timer when the interval changes; cancels when set to 0.
   * @param {number} ms
   */
  setVerifyIntervalMs(ms) {
    if (this._destroyed) return;
    const n = Number(ms);
    const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    this._verifyIntervalMs = next;
    this._restartPeriodicVerify();
  }

  /** @returns {number} configured interval ms (0 = off) */
  get verifyIntervalMs() {
    return this._verifyIntervalMs;
  }

  /** @returns {boolean} whether a periodic timer is currently armed */
  get periodicPending() {
    return this._periodicTimerId != null;
  }

  /** Cancel layout/verify debounces and the debug periodic timer. */
  cancel() {
    this._layout.cancel();
    this._verify.cancel();
    this._clearPeriodicVerify();
  }

  /** Teardown: cancel timers; further requests are no-ops. */
  destroy() {
    this._destroyed = true;
    this._layout.destroy();
    this._verify.destroy();
    this._clearPeriodicVerify();
    this._verifyIntervalMs = 0;
    this._settlePending?.clear();
    this._wm = null;
    this._scan = null;
    this.catalog = null;
  }

  /**
   * SL1/SL2: stamp open start for time-to-stable.
   * Idempotent: re-note keeps earliest openedAt; does not reset mismatches.
   * @param {object} metaWindow
   * @param {number} openedAt
   */
  noteOpenPendingForSettle(metaWindow, openedAt) {
    if (this._destroyed || !metaWindow || !this._settlePending) return;
    const t = Number(openedAt);
    if (!Number.isFinite(t)) return;
    const prev = this._settlePending.get(metaWindow);
    if (prev) {
      if (t < prev.openedAt) prev.openedAt = t;
      return;
    }
    this._settlePending.set(metaWindow, { openedAt: t, mismatches: 0 });
  }

  /**
   * SL1: drop pending settle observation (cancel open / destroy).
   * @param {object} metaWindow
   */
  clearOpenPendingForSettle(metaWindow) {
    if (!metaWindow || !this._settlePending) return;
    this._settlePending.delete(metaWindow);
  }

  /** Stop the periodic arm without changing the configured interval. */
  _clearPeriodicVerify() {
    if (this._periodicTimerId != null) {
      this._cancel(this._periodicTimerId);
      this._periodicTimerId = null;
    }
  }

  /** Clear then re-arm when interval > 0. */
  _restartPeriodicVerify() {
    this._clearPeriodicVerify();
    this._armPeriodicVerify();
  }

  /**
   * One-shot schedule that re-arms after fire (works with injectable clocks).
   */
  _armPeriodicVerify() {
    if (this._destroyed || this._verifyIntervalMs <= 0) return;
    const ms = this._verifyIntervalMs;
    this._periodicTimerId = this._schedule(ms, () => {
      this._periodicTimerId = null;
      if (this._destroyed || this._verifyIntervalMs <= 0) return;
      this.periodicFireCount += 1;
      this.requestVerify(PERIODIC_VERIFY_REASON);
      this._armPeriodicVerify();
    });
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
    const wm = this._wm;
    // CL5 belt: timer scheduled before batch begin must not render mid-batch.
    if (wm && (wm._openLayoutBatchDepth || 0) > 0) {
      wm._openLayoutBatchNeedsCommit = true;
      return;
    }
    const from = reasons.join(",");
    Logger.debug(`layout-controller: requestLayout fire → renderTree(${from})`);
    if (wm && typeof wm.renderTree === "function") {
      wm.renderTree(from);
    }
  }

  /**
   * Sensor-only verify: scan Meta↔slots, store result, update settled flag.
   * Never reasserts tiles or requestLayout (apply-contract AC1).
   * @param {string[]} reasons
   */
  _defaultVerifyFire(reasons) {
    const result = this._runScan();
    this.lastVerifyResult = result;
    const ok = !!(result && result.ok);

    // SL1: observe metrics only (not a reassert driver).
    this._observeSettlePending(result);

    if (ok) {
      this._onVerifyAgreement(reasons);
    } else {
      this._onVerifyMismatch(reasons, result);
    }
  }

  /**
   * SL1: for pending open windows, accumulate mismatches; on first per-window
   * agreement (or forest ok only when scan has no per-window results), record
   * time-to-stable into the thrash catalog.
   * @param {{ ok?: boolean, mismatches?: any[], results?: any[] }|null} result
   */
  _observeSettlePending(result) {
    const pending = this._settlePending;
    const catalog = this.catalog;
    if (!pending || pending.size === 0 || !catalog) return;

    const okById = new Map();
    const results = result?.results;
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r && r.id != null) okById.set(r.id, !!r.ok);
      }
    }
    // Usable per-window results → only those ids may sample.
    // Empty/missing results (inject/degenerate) may use forest ok.
    const hasUsableResults = okById.size > 0;
    const mismatchIds = new Set();
    const mismatches = result?.mismatches;
    if (Array.isArray(mismatches)) {
      for (const m of mismatches) {
        if (m && m.id != null) mismatchIds.add(m.id);
      }
    }
    const forestOk = !!(result && result.ok);
    const now = Date.now();

    for (const [meta, st] of [...pending.entries()]) {
      const id = _metaWindowId(meta);
      let windowOk = false;
      if (id != null && okById.has(id)) {
        windowOk = okById.get(id) === true;
      } else if (forestOk && !hasUsableResults) {
        // No per-window breakdown (inject/degenerate scan); forest ok is enough.
        windowOk = true;
      }
      // else: results exist but this window was not checked (e.g. still FLOAT) —
      // leave pending; do not sample on forest-ok alone.

      if (!windowOk) {
        if (id != null && mismatchIds.has(id)) {
          st.mismatches += 1;
        } else if (!forestOk && (id == null || !hasUsableResults)) {
          st.mismatches += 1;
        }
        continue;
      }

      const cls = extractWmClass(meta);
      if (cls) {
        const ms = Math.max(0, now - st.openedAt);
        catalog.recordSettleSample(cls, {
          ms,
          kind: "open",
          mismatches: st.mismatches,
        });
      }
      pending.delete(meta);
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
   * First ok settles the forest (sensor). No auto second verify / thrash-extra.
   * @param {string[]} reasons
   */
  _onVerifyAgreement(reasons) {
    this.agreementCount += 1;
    this.settled = true;
    Logger.trace(
      `layout-controller: verify ok (${reasons.join(",")}) agreement=${
        this.agreementCount
      } → SETTLED`
    );
  }

  /**
   * Mismatch: log + store only. No reassert, no requestLayout.
   * @param {string[]} reasons
   * @param {{ mismatches?: any[], checked?: number }|null} result
   */
  _onVerifyMismatch(reasons, result) {
    this.agreementCount = 0;
    this.settled = false;
    const nMis = result?.mismatches?.length ?? 0;
    const checked = result?.checked ?? 0;
    const sample = result?.mismatches?.[0] ?? null;
    Logger.debug(
      `layout-controller: verify mismatch (${reasons.join(",")}) ` +
        `${nMis}/${checked} windows; sample=${JSON.stringify(sample)}`
    );
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

/**
 * @param {unknown} metaWindow
 * @returns {string|number|null}
 */
function _metaWindowId(metaWindow) {
  if (!metaWindow || typeof metaWindow !== "object") return null;
  try {
    if (typeof metaWindow.get_id === "function") {
      const id = metaWindow.get_id();
      return id != null ? id : null;
    }
  } catch {
    return null;
  }
  if (metaWindow.id != null) return metaWindow.id;
  return null;
}
