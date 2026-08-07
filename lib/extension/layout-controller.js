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

/**
 * Max layout re-applies requested from verify-mismatch in one settle wave.
 * Further mismatches reset agreement but do not storm requestLayout.
 */
export const LAYOUT_VERIFY_MISMATCH_MAX = 10;

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

/** Reason string used by the optional debug periodic verify timer (CL6). */
export const PERIODIC_VERIFY_REASON = "periodic";

/**
 * Layout control-loop API: requestLayout / requestVerify with independent
 * trailing debounces. CL1: Meta↔slot scan + agreement counter → SETTLED.
 * CL3: thrash catalog + one thrash-extra verify per settle wave.
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
   * @param {number} [options.agreementNeeded]
   * @param {import('./app-thrash-catalog.js').AppThrashCatalog|null} [options.catalog]
   * @param {() => boolean} [options.hasThrashyTile] inject thrashy-TILE probe (tests)
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
     * How many times verify-mismatch requested layout in the current wave.
     * Cap: LAYOUT_VERIFY_MISMATCH_MAX; then give-up until agreement/unsettled.
     */
    this.mismatchLayoutRequestCount = 0;
    /**
     * After max mismatch→layout retries: log once and stay quiet until
     * full agreement or markUnsettled starts a new wave.
     */
    this._mismatchGiveUp = false;
    /**
     * Latch: one thrash-extra verify per settle wave (CL3).
     * Cleared on markUnsettled so the next wave may request again.
     */
    this._thrashExtraLatch = false;
    /** How many times thrash-extra was requested (tests). */
    this.thrashExtraRequestCount = 0;

    /**
     * SL1: open windows awaiting first Meta↔slot agreement sample.
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
   * fire) — covers controller-direct callers (onExternalGeometry, verify-mismatch).
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
    // New settle wave: thrash-extra + mismatch→layout budget again.
    this._thrashExtraLatch = false;
    this._resetMismatchWave();
    Logger.debug(`layout-controller: markUnsettled (${r})`);
  }

  /** Fresh mismatch→layout budget after agreement or external unsettle. */
  _resetMismatchWave() {
    this.mismatchLayoutRequestCount = 0;
    this._mismatchGiveUp = false;
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
    this._hasThrashyTile = null;
  }

  /**
   * SL1: stamp open start for time-to-stable (called from open-commit schedule).
   * @param {object} metaWindow
   * @param {number} openedAt
   */
  noteOpenPendingForSettle(metaWindow, openedAt) {
    if (this._destroyed || !metaWindow) return;
    const t = Number(openedAt);
    if (!Number.isFinite(t)) return;
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
   * CL1: scan Meta↔slots, update agreement; mismatch may re-request layout
   * up to LAYOUT_VERIFY_MISMATCH_MAX times per wave.
   * @param {string[]} reasons
   */
  _defaultVerifyFire(reasons) {
    const result = this._runScan();
    this.lastVerifyResult = result;
    const ok = !!(result && result.ok);

    // SL1: mismatch counts + first-agreement settle samples (pending opens).
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
   * @param {string[]} reasons
   */
  _onVerifyAgreement(reasons) {
    // Full agreement ends the mismatch→layout budget for this wave.
    this._resetMismatchWave();
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
    const sample = result?.mismatches?.[0] ?? null;
    Logger.debug(
      `layout-controller: verify mismatch (${reasons.join(",")}) ` +
        `${nMis}/${checked} windows; sample=${JSON.stringify(sample)}`
    );

    // Already gave up this wave: keep agreement reset, stay quiet.
    if (this._mismatchGiveUp) {
      return;
    }

    // Budget exhausted: force-reassert mismatched tiles once (no more layout
    // storm), log, then one delayed verify so a successful recover can SETTLED.
    if (this.mismatchLayoutRequestCount >= LAYOUT_VERIFY_MISMATCH_MAX) {
      this._mismatchGiveUp = true;
      this._reassertMismatchedTiles(result, { force: true });
      const sampleJson = JSON.stringify((result?.mismatches || []).slice(0, 3));
      Logger.error(
        `layout-controller: verify mismatch give-up after ${LAYOUT_VERIFY_MISMATCH_MAX} ` +
          `layout retries; reasons=${JSON.stringify(reasons)} checked=${checked} ` +
          `mismatches=${nMis} sample=${sampleJson} ` +
          `mismatchLayoutRequestCount=${this.mismatchLayoutRequestCount} ` +
          `agreementCount=${this.agreementCount} ` +
          `lastUnsettledReason=${this.lastUnsettledReason ?? "null"}`
      );
      // Recover path: client may accept force reassert after give-up.
      this.requestVerify("mismatch-give-up-reassert");
      return;
    }

    this.mismatchLayoutRequestCount += 1;

    // Pure rect-mismatch: targeted slot reassert (no full forest apply).
    // mon/bad-slot still need processNode via requestLayout.
    const needsFull = this._mismatchNeedsFullLayout(result);
    if (!needsFull) {
      const force = this.mismatchLayoutRequestCount >= 3;
      this._reassertMismatchedTiles(result, { force });
      this.requestVerify("verify-mismatch-reassert");
      return;
    }

    this.requestLayout("verify-mismatch");
  }

  /**
   * True when any mismatch cannot be fixed by move-to-slot alone.
   * @param {{ mismatches?: Array<{ reasons?: string[] }> }|null|undefined} result
   * @returns {boolean}
   */
  _mismatchNeedsFullLayout(result) {
    const list = result?.mismatches;
    if (!Array.isArray(list) || list.length === 0) return true;
    for (const m of list) {
      const reasons = m?.reasons;
      if (!Array.isArray(reasons) || reasons.length === 0) return true;
      for (const r of reasons) {
        if (r !== "rect-mismatch") return true;
      }
    }
    return false;
  }

  /**
   * Move mismatched TILE Meta frames back to tree slots (no processNode).
   * @param {{ mismatches?: Array<{ id?: string|number|null }> }|null|undefined} result
   * @param {{ force?: boolean }} [opts]
   * @returns {number}
   */
  _reassertMismatchedTiles(result, opts = {}) {
    const wm = this._wm;
    if (!wm || typeof wm.reassertTilesByIds !== "function") return 0;
    const list = result?.mismatches;
    if (!Array.isArray(list) || list.length === 0) return 0;
    const ids = list.map((m) => m?.id).filter((id) => id != null);
    if (ids.length === 0) return 0;
    try {
      return wm.reassertTilesByIds(ids, { force: !!opts.force }) || 0;
    } catch (e) {
      Logger.debug(`layout-controller: reassert mismatched tiles: ${e}`);
      return 0;
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
