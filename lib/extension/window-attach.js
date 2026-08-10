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
 * WeakMap metaWindow → Lifetime so destroy/disable dispose one bag per window.
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L4 per-window attach).
 */

import { Logger } from "../shared/logger.js";
import { Lifetime } from "./lifetime.js";

/**
 * Best-effort window id for Lifetime labels.
 * @param {object} metaWindow
 * @returns {string}
 */
function windowIdPart(metaWindow) {
  try {
    if (typeof metaWindow.get_id === "function") {
      return String(metaWindow.get_id());
    }
    if (metaWindow.id != null) {
      return String(metaWindow.id);
    }
  } catch (_e) {
    // MetaWindow may already be finalizing
  }
  return "?";
}

/**
 * Registry: one Lifetime per metaWindow object identity.
 *
 * WeakMap holds the bag; a Set of keys supports disposeAll (WeakMap is not
 * iterable). Keys stay strongly held only while still tracked — dispose /
 * disposeAll drop them so a missed untrack is the only leak path, and disable
 * can still walk every live attach.
 */
export class WindowAttach {
  /**
   * @param {object} [opts]
   * @param {string} [opts.label] registry label (prefix for window lifetimes)
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {(cb: () => void) => number|string} [opts.scheduleIdle]
   * @param {() => number} [opts.nowMs]
   */
  constructor(opts = {}) {
    this.label = opts.label != null && opts.label !== "" ? String(opts.label) : "window-attach";
    /** @type {WeakMap<object, Lifetime>} */
    this._map = new WeakMap();
    /** @type {Set<object>} still-tracked metaWindows (disposeAll walk) */
    this._keys = new Set();
    this._attachCount = 0;
    this._disposeCount = 0;
    /** Default Lifetime inject options (schedule/cancel/…). */
    this._lifeOpts = {};
    if (typeof opts.schedule === "function") this._lifeOpts.schedule = opts.schedule;
    if (typeof opts.cancel === "function") this._lifeOpts.cancel = opts.cancel;
    if (typeof opts.scheduleIdle === "function") this._lifeOpts.scheduleIdle = opts.scheduleIdle;
    if (typeof opts.nowMs === "function") this._lifeOpts.nowMs = opts.nowMs;
  }

  /** Number of currently tracked windows. */
  get size() {
    return this._keys.size;
  }

  /**
   * Return existing Lifetime for metaWindow, or create one.
   * Recreates if a prior lifetime was disposed but still present.
   *
   * @param {object|null|undefined} metaWindow
   * @param {object} [opts]
   * @param {string} [opts.label] override Lifetime label
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {(cb: () => void) => number|string} [opts.scheduleIdle]
   * @param {() => number} [opts.nowMs]
   * @returns {Lifetime|null}
   */
  attach(metaWindow, opts = {}) {
    if (metaWindow == null || typeof metaWindow !== "object") {
      Logger.warn(`[WindowAttach:${this.label}] attach ignored non-object key`);
      return null;
    }
    const existing = this._map.get(metaWindow);
    if (existing && !existing.disposed) {
      return existing;
    }
    // Drop a sealed residual so disposeAll / size stay accurate.
    if (existing) {
      this._map.delete(metaWindow);
      this._keys.delete(metaWindow);
    }

    const lifeOpts = { ...this._lifeOpts };
    if (typeof opts.schedule === "function") lifeOpts.schedule = opts.schedule;
    if (typeof opts.cancel === "function") lifeOpts.cancel = opts.cancel;
    if (typeof opts.scheduleIdle === "function") lifeOpts.scheduleIdle = opts.scheduleIdle;
    if (typeof opts.nowMs === "function") lifeOpts.nowMs = opts.nowMs;
    lifeOpts.label =
      opts.label != null && opts.label !== ""
        ? String(opts.label)
        : `${this.label}:${windowIdPart(metaWindow)}`;

    const lt = new Lifetime(lifeOpts);
    this._map.set(metaWindow, lt);
    this._keys.add(metaWindow);
    this._attachCount += 1;
    Logger.debug(`[WindowAttach:${this.label}] attach label=${lt.label} size=${this._keys.size}`);
    return lt;
  }

  /**
   * @param {object|null|undefined} metaWindow
   * @returns {Lifetime|null}
   */
  get(metaWindow) {
    if (metaWindow == null || typeof metaWindow !== "object") return null;
    const lt = this._map.get(metaWindow);
    return lt && !lt.disposed ? lt : null;
  }

  /**
   * Dispose one window's Lifetime and untrack. Idempotent for missing keys.
   * @param {object|null|undefined} metaWindow
   * @returns {boolean} true if a lifetime was disposed
   */
  dispose(metaWindow) {
    if (metaWindow == null || typeof metaWindow !== "object") return false;
    const lt = this._map.get(metaWindow);
    this._map.delete(metaWindow);
    this._keys.delete(metaWindow);
    if (!lt) {
      Logger.trace(`[WindowAttach:${this.label}] dispose miss`);
      return false;
    }
    if (!lt.disposed) {
      lt.dispose();
      this._disposeCount += 1;
      Logger.debug(
        `[WindowAttach:${this.label}] dispose label=${lt.label} size=${this._keys.size}`
      );
    }
    return true;
  }

  /**
   * Dispose every still-tracked entry (disable path).
   * @returns {number} count disposed
   */
  disposeAll() {
    const keys = [...this._keys];
    if (keys.length === 0) {
      Logger.trace(`[WindowAttach:${this.label}] disposeAll empty`);
      return 0;
    }
    Logger.debug(`[WindowAttach:${this.label}] disposeAll n=${keys.length}`);
    let n = 0;
    for (const mw of keys) {
      if (this.dispose(mw)) n += 1;
    }
    return n;
  }

  /**
   * Failure-analysis dump.
   * @returns {{
   *   label: string,
   *   size: number,
   *   attachCount: number,
   *   disposeCount: number,
   *   windows: Array<{ windowId: string, lifetime: ReturnType<Lifetime['snapshot']> }>,
   * }}
   */
  snapshot() {
    const windows = [];
    for (const mw of this._keys) {
      const lt = this._map.get(mw);
      if (!lt) continue;
      windows.push({
        windowId: windowIdPart(mw),
        lifetime: lt.snapshot(),
      });
    }
    windows.sort((a, b) => a.windowId.localeCompare(b.windowId));
    return {
      label: this.label,
      size: this._keys.size,
      attachCount: this._attachCount,
      disposeCount: this._disposeCount,
      windows,
    };
  }
}
