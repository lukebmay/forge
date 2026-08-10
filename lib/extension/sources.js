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
 * Owned GLib sources (timeout/idle). Named slots + cancelAll so disable/destroy
 * cannot forget a timer. Schedule/cancel injectable for unit tests.
 *
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L1 SourceBag).
 */

import GLib from "gi://GLib";
import { Logger } from "../shared/logger.js";

/**
 * Default GLib timeout: one-shot; callback returns SOURCE_REMOVE.
 * @param {number} delayMs
 * @param {() => void} cb
 * @returns {number} source id
 */
export function glibSchedule(delayMs, cb) {
  const ms = Math.max(0, Number(delayMs) || 0);
  return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    try {
      cb();
    } catch (e) {
      Logger.warn(`[sources] glibSchedule callback threw: ${e}`);
    }
    return GLib.SOURCE_REMOVE ?? false;
  });
}

/**
 * Default GLib idle: one-shot.
 * @param {() => void} cb
 * @returns {number} source id
 */
export function glibIdleSchedule(cb) {
  return GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    try {
      cb();
    } catch (e) {
      Logger.warn(`[sources] glibIdleSchedule callback threw: ${e}`);
    }
    return GLib.SOURCE_REMOVE ?? false;
  });
}

/**
 * @param {number|string|null|undefined} id
 */
export function glibCancel(id) {
  if (id == null || id === 0 || id === false) return;
  try {
    GLib.Source.remove(id);
  } catch (e) {
    Logger.debug(`[sources] glibCancel id=${id} already gone: ${e}`);
  }
}

/**
 * @typedef {'timeout'|'idle'} SourceKind
 */

/**
 * @typedef {{
 *   id: number|string,
 *   kind: SourceKind,
 *   delayMs: number,
 *   setAt: number,
 * }} SourceSlot
 */

/**
 * Named-slot owner for one-shot GLib sources.
 *
 * Logging (dev builds, logging-enabled + log-level ≥ DEBUG):
 *  - set / replace / cancel / fire / cancelAll / dispose with bag label + slot + id
 *  - WARN on use-after-dispose and callback throws
 * snapshot() is always available for failure dumps (no log gate).
 */
export class SourceBag {
  /**
   * @param {object} [opts]
   * @param {string} [opts.label] bag name in logs (e.g. "wm", "open-commit")
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {(cb: () => void) => number|string} [opts.scheduleIdle]
   * @param {() => number} [opts.nowMs] clock for snapshots (default Date.now)
   */
  constructor(opts = {}) {
    this.label = opts.label != null && opts.label !== "" ? String(opts.label) : "sources";
    this._schedule = typeof opts.schedule === "function" ? opts.schedule : glibSchedule;
    this._cancel = typeof opts.cancel === "function" ? opts.cancel : glibCancel;
    this._scheduleIdle =
      typeof opts.scheduleIdle === "function" ? opts.scheduleIdle : glibIdleSchedule;
    this._nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
    /** @type {Map<string, SourceSlot>} */
    this._slots = new Map();
    this._disposed = false;
    this._setCount = 0;
    this._fireCount = 0;
    this._cancelCount = 0;
    this._replaceCount = 0;
  }

  get disposed() {
    return this._disposed;
  }

  /** Number of live named slots. */
  get size() {
    return this._slots.size;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._slots.has(String(name));
  }

  /**
   * @param {string} name
   * @returns {number|string|null}
   */
  getId(name) {
    const slot = this._slots.get(String(name));
    return slot ? slot.id : null;
  }

  /**
   * Schedule (or replace) a one-shot timeout on a named slot.
   * @param {string} name
   * @param {number} delayMs
   * @param {() => void} cb
   * @returns {number|string|null} source id, or null if disposed
   */
  set(name, delayMs, cb) {
    return this._arm(String(name), "timeout", Math.max(0, Number(delayMs) || 0), cb);
  }

  /**
   * Schedule (or replace) a one-shot idle on a named slot.
   * @param {string} name
   * @param {() => void} cb
   * @returns {number|string|null}
   */
  setIdle(name, cb) {
    return this._arm(String(name), "idle", 0, cb);
  }

  /**
   * Cancel one slot. Safe if missing.
   * @param {string} name
   * @returns {boolean} true if a source was cancelled
   */
  cancel(name) {
    const key = String(name);
    const slot = this._slots.get(key);
    if (!slot) {
      Logger.trace(`[SourceBag:${this.label}] cancel miss name=${key}`);
      return false;
    }
    this._slots.delete(key);
    this._safeCancel(slot.id, key, "cancel");
    this._cancelCount += 1;
    Logger.debug(
      `[SourceBag:${this.label}] cancel name=${key} id=${slot.id} kind=${slot.kind} ageMs=${
        this._nowMs() - slot.setAt
      }`
    );
    return true;
  }

  /**
   * Cancel every slot. Safe to call repeatedly.
   * @returns {number} count cancelled
   */
  cancelAll() {
    if (this._slots.size === 0) {
      Logger.trace(`[SourceBag:${this.label}] cancelAll empty`);
      return 0;
    }
    const n = this._slots.size;
    const names = [...this._slots.keys()];
    Logger.debug(`[SourceBag:${this.label}] cancelAll n=${n} names=${names.join(",") || "-"}`);
    for (const key of names) {
      const slot = this._slots.get(key);
      this._slots.delete(key);
      if (slot) {
        this._safeCancel(slot.id, key, "cancelAll");
        this._cancelCount += 1;
      }
    }
    return n;
  }

  /**
   * cancelAll + seal bag (further set/setIdle no-op + warn).
   * Idempotent.
   */
  dispose() {
    if (this._disposed) {
      Logger.trace(`[SourceBag:${this.label}] dispose already sealed`);
      return;
    }
    const snap = this.snapshot();
    const n = this.cancelAll();
    this._disposed = true;
    Logger.debug(
      `[SourceBag:${this.label}] dispose cancelled=${n} lifetime set=${this._setCount} fire=${
        this._fireCount
      } cancel=${this._cancelCount} replace=${this._replaceCount} last=${JSON.stringify(
        snap.slots
      )}`
    );
  }

  /**
   * Failure-analysis dump (always pure data; no log side effects).
   * @returns {{
   *   label: string,
   *   disposed: boolean,
   *   size: number,
   *   setCount: number,
   *   fireCount: number,
   *   cancelCount: number,
   *   replaceCount: number,
   *   slots: Array<{ name: string, id: number|string, kind: SourceKind, delayMs: number, ageMs: number }>,
   * }}
   */
  snapshot() {
    const now = this._nowMs();
    const slots = [];
    for (const [name, slot] of this._slots) {
      slots.push({
        name,
        id: slot.id,
        kind: slot.kind,
        delayMs: slot.delayMs,
        ageMs: now - slot.setAt,
      });
    }
    slots.sort((a, b) => a.name.localeCompare(b.name));
    return {
      label: this.label,
      disposed: this._disposed,
      size: this._slots.size,
      setCount: this._setCount,
      fireCount: this._fireCount,
      cancelCount: this._cancelCount,
      replaceCount: this._replaceCount,
      slots,
    };
  }

  /**
   * @param {string} key
   * @param {SourceKind} kind
   * @param {number} delayMs
   * @param {() => void} cb
   * @returns {number|string|null}
   */
  _arm(key, kind, delayMs, cb) {
    if (this._disposed) {
      Logger.warn(
        `[SourceBag:${this.label}] set after dispose ignored name=${key} kind=${kind} delayMs=${delayMs}`
      );
      return null;
    }
    if (typeof cb !== "function") {
      Logger.warn(`[SourceBag:${this.label}] set non-function cb name=${key}`);
      return null;
    }

    const prev = this._slots.get(key);
    if (prev) {
      this._slots.delete(key);
      this._safeCancel(prev.id, key, "replace");
      this._replaceCount += 1;
      Logger.debug(
        `[SourceBag:${this.label}] replace name=${key} oldId=${prev.id} oldKind=${prev.kind} → kind=${kind} delayMs=${delayMs}`
      );
    }

    /** @type {number|string|null} */
    let id = null;
    // Unit mocks may run idle/timeout callbacks synchronously inside schedule().
    // Track that so we do not re-insert a slot after the fire already completed.
    let firedSync = false;
    const setAt = this._nowMs();
    const wrapped = () => {
      // Sync path: schedule invoked cb before returning an id (id still null).
      if (id == null) {
        firedSync = true;
        this._fireCount += 1;
        Logger.debug(
          `[SourceBag:${this.label}] fire-sync name=${key} kind=${kind} delayMs=${delayMs}`
        );
        try {
          cb();
        } catch (e) {
          Logger.warn(`[SourceBag:${this.label}] fire callback threw name=${key}: ${e}`);
        }
        return;
      }
      const cur = this._slots.get(key);
      // Dropped or replaced before fire: ignore (source should already be cancelled).
      if (!cur || cur.id !== id) {
        Logger.trace(`[SourceBag:${this.label}] stale fire ignored name=${key} id=${id}`);
        return;
      }
      this._slots.delete(key);
      this._fireCount += 1;
      const ageMs = this._nowMs() - cur.setAt;
      Logger.debug(
        `[SourceBag:${this.label}] fire name=${key} id=${id} kind=${kind} delayMs=${delayMs} ageMs=${ageMs}`
      );
      try {
        cb();
      } catch (e) {
        Logger.warn(`[SourceBag:${this.label}] fire callback threw name=${key} id=${id}: ${e}`);
      }
    };

    try {
      id = kind === "idle" ? this._scheduleIdle(wrapped) : this._schedule(delayMs, wrapped);
    } catch (e) {
      Logger.warn(
        `[SourceBag:${this.label}] schedule failed name=${key} kind=${kind} delayMs=${delayMs}: ${e}`
      );
      return null;
    }

    if (id == null || id === 0 || id === false) {
      Logger.warn(`[SourceBag:${this.label}] schedule returned empty id name=${key} kind=${kind}`);
      return null;
    }

    this._setCount += 1;
    if (firedSync) {
      // Callback already ran; leave no residual slot (matches one-shot semantics).
      return id;
    }

    this._slots.set(key, {
      id,
      kind,
      delayMs,
      setAt,
    });
    if (!prev) {
      Logger.debug(
        `[SourceBag:${this.label}] set name=${key} id=${id} kind=${kind} delayMs=${delayMs}`
      );
    }
    return id;
  }

  /**
   * @param {number|string} id
   * @param {string} key
   * @param {string} reason
   */
  _safeCancel(id, key, reason) {
    try {
      this._cancel(id);
    } catch (e) {
      Logger.debug(
        `[SourceBag:${this.label}] cancel threw name=${key} id=${id} reason=${reason}: ${e}`
      );
    }
  }
}
