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
 * Owned open-commit pending state + SourceBag timers (CL4).
 * Pure quiet policy lives in layout-open.js; product fire stays on WM.
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L8).
 */

import { Logger } from "../shared/logger.js";
import { SourceBag } from "./sources.js";
import { OPEN_COMMIT_MAX_WAIT_MS, nextOpenCommitDelayMs } from "./layout-open.js";

/**
 * @typedef {{
 *   timerId: number|string|null,
 *   slot: string,
 *   openedAt: number,
 *   minQuietMs: number,
 *   lastExternalGeomAt: number,
 *   isDock: boolean,
 *   wmClass: string|null,
 * }} OpenCommitState
 */

/**
 * Per-window quiet timers until open layout commit.
 * Inject schedule/cancel for unit tests (same pattern as WM open-commit fields).
 */
export class OpenCommitManager {
  /**
   * @param {object} [opts]
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {() => number} [opts.nowMs]
   * @param {(metaWindow: object) => void} [opts.onFire] called when quiet/max-wait met
   */
  constructor(opts = {}) {
    this._nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
    this._onFire = typeof opts.onFire === "function" ? opts.onFire : null;
    /** Injectable for tests (WM sets _openCommitSchedule wrappers). */
    this._scheduleImpl =
      typeof opts.schedule === "function"
        ? opts.schedule
        : (delayMs, cb) => {
            throw new Error("OpenCommitManager: schedule not configured");
          };
    this._cancelImpl =
      typeof opts.cancel === "function"
        ? opts.cancel
        : (_id) => {
            throw new Error("OpenCommitManager: cancel not configured");
          };

    this._sources = new SourceBag({
      label: "open-commit",
      schedule: (delayMs, cb) => this._scheduleImpl(delayMs, cb),
      cancel: (id) => this._cancelImpl(id),
      nowMs: () => this._nowMs(),
    });
    /** @type {Map<object, OpenCommitState>} */
    this._pending = new Map();
    /** @type {WeakMap<object, string>} */
    this._slotKeys = new WeakMap();
    this._anonSeq = 0;
  }

  /** @returns {SourceBag} */
  get sources() {
    return this._sources;
  }

  /** @returns {number} */
  get size() {
    return this._pending.size;
  }

  /**
   * @param {object|null|undefined} metaWindow
   * @returns {boolean}
   */
  has(metaWindow) {
    return !!metaWindow && this._pending.has(metaWindow);
  }

  /**
   * @param {object|null|undefined} metaWindow
   * @returns {OpenCommitState|undefined}
   */
  get(metaWindow) {
    if (!metaWindow) return undefined;
    return this._pending.get(metaWindow);
  }

  /**
   * Stable SourceBag slot for a window.
   * @param {object} metaWindow
   * @returns {string|null}
   */
  slotName(metaWindow) {
    if (!metaWindow) return null;
    let key = this._slotKeys.get(metaWindow);
    if (key) return key;
    let id = null;
    try {
      id = typeof metaWindow.get_id === "function" ? metaWindow.get_id() : null;
    } catch (_e) {
      id = null;
    }
    key = id != null && id !== "" ? `oc:${id}` : `oc:a${++this._anonSeq}`;
    this._slotKeys.set(metaWindow, key);
    return key;
  }

  /**
   * Start (or replace) open-commit for a window.
   * @param {object} metaWindow
   * @param {{
   *   minQuietMs: number,
   *   isDock?: boolean,
   *   wmClass?: string|null,
   *   firstOpen?: boolean,
   * }} fields
   */
  schedule(metaWindow, fields) {
    if (!metaWindow) return;
    this.cancel(metaWindow);

    const now = this._nowMs();
    const slot = this.slotName(metaWindow);
    /** @type {OpenCommitState} */
    const state = {
      timerId: null,
      slot,
      openedAt: now,
      minQuietMs: Number(fields.minQuietMs) || 0,
      lastExternalGeomAt: now,
      isDock: !!fields.isDock,
      wmClass: fields.wmClass != null ? fields.wmClass : null,
    };
    this._pending.set(metaWindow, state);
    Logger.debug(
      `[open-commit] schedule slot=${slot} class=${state.wmClass || "?"} dock=${
        state.isDock
      } firstOpen=${!!fields.firstOpen} minQuietMs=${state.minQuietMs} pending=${
        this._pending.size
      }`
    );
    this.arm(metaWindow);
  }

  /**
   * Cancel one pending open commit.
   * @param {object|null|undefined} metaWindow
   */
  cancel(metaWindow) {
    if (!metaWindow) return;
    const state = this._pending.get(metaWindow);
    if (!state) return;
    const slot = state.slot || this.slotName(metaWindow);
    if (slot) {
      this._sources.cancel(slot);
    } else if (state.timerId != null) {
      try {
        this._cancelImpl(state.timerId);
      } catch (_e) {
        // source already gone
      }
    }
    state.timerId = null;
    this._pending.delete(metaWindow);
    Logger.debug(
      `[open-commit] cancel window slot=${slot || "?"} class=${state.wmClass || "?"} pending=${
        this._pending.size
      }`
    );
  }

  /**
   * Cancel every pending open commit (disable / teardown).
   * @param {{ clearSettle?: (mw: object) => void }} [opts]
   */
  cancelAll(opts = {}) {
    const n = this._pending.size;
    if (n > 0) {
      Logger.debug(
        `[open-commit] cancelAll n=${n} bag=${JSON.stringify(this._sources.snapshot())}`
      );
    }
    for (const mw of [...this._pending.keys()]) {
      this.cancel(mw);
      if (typeof opts.clearSettle === "function") {
        opts.clearSettle(mw);
      }
    }
    this._sources.cancelAll();
  }

  /**
   * External size/pos while pending — reset quiet and re-arm.
   * @param {object|null|undefined} metaWindow
   * @returns {boolean}
   */
  touchExternalGeometry(metaWindow) {
    if (!metaWindow) return false;
    const state = this._pending.get(metaWindow);
    if (!state) return false;
    state.lastExternalGeomAt = this._nowMs();
    this.arm(metaWindow);
    return true;
  }

  /**
   * Re-arm timer from current pending state.
   * @param {object} metaWindow
   */
  arm(metaWindow) {
    const state = this._pending.get(metaWindow);
    if (!state) return;
    const slot = state.slot || this.slotName(metaWindow);
    state.slot = slot;
    const now = this._nowMs();
    const delay = nextOpenCommitDelayMs({
      openedAt: state.openedAt,
      lastExternalGeomAt: state.lastExternalGeomAt,
      minQuietMs: state.minQuietMs,
      maxWaitMs: OPEN_COMMIT_MAX_WAIT_MS,
      now,
    });
    const quietElapsed = now - (state.lastExternalGeomAt || state.openedAt);
    const sinceOpen = now - state.openedAt;
    Logger.debug(
      `[open-commit] arm slot=${slot} delayMs=${delay} minQuietMs=${
        state.minQuietMs
      } quietElapsedMs=${quietElapsed} sinceOpenMs=${sinceOpen} class=${state.wmClass || "?"}`
    );
    state.timerId = this._sources.set(slot, delay, () => {
      state.timerId = null;
      Logger.debug(
        `[open-commit] fire slot=${slot} class=${state.wmClass || "?"} sinceOpenMs=${
          this._nowMs() - state.openedAt
        } minQuietMs=${state.minQuietMs}`
      );
      if (this._onFire) {
        this._onFire(metaWindow);
      }
    });
  }

  /**
   * Drop pending without bag cancel (after fire already cancelled).
   * Prefer cancel() for normal paths.
   * @param {object} metaWindow
   */
  take(metaWindow) {
    if (!metaWindow) return null;
    const state = this._pending.get(metaWindow);
    if (!state) return null;
    this.cancel(metaWindow);
    return state;
  }

  /**
   * @returns {ReturnType<SourceBag['snapshot']>}
   */
  snapshot() {
    return this._sources.snapshot();
  }
}
