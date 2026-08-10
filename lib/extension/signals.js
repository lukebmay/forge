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
 * Owned GObject signal connections. Groups + safe disconnect so disable/destroy
 * cannot forget a handler. Pure enough for fake targets in unit tests.
 *
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L2 SignalBag).
 */

import { Logger } from "../shared/logger.js";

/**
 * Disconnect each id on target (Bug #328: try/catch per id) and clear the array.
 * @param {object|null|undefined} target
 * @param {number[]|null|undefined} signals
 */
export function disconnectSignals(target, signals) {
  if (!target || !signals) return;
  for (const signal of signals) {
    // Bug #328: a finalized GObject wrapper throws on disconnect; one bad
    // target must not abort cleanup of the remaining signals/targets.
    try {
      target.disconnect(signal);
    } catch (e) {
      Logger.debug(`disconnect on disposed target skipped: ${e}`);
    }
  }
  signals.length = 0;
}

/**
 * @typedef {{
 *   id: number|string,
 *   target: object,
 *   signal: string,
 *   group: string|null,
 *   setAt: number,
 * }} SignalEntry
 */

/**
 * Owner for connect() ids on one or more GObject-like targets.
 *
 * Logging (dev builds, logging-enabled + log-level ≥ DEBUG):
 *  - connect / disconnect / disconnectGroup / disconnectTarget / dispose
 *  - WARN on use-after-dispose
 * snapshot() is always available for failure dumps (no log gate).
 *
 * connect after dispose: no-op, returns null (matches SourceBag).
 */
export class SignalBag {
  /**
   * @param {object} [opts]
   * @param {string} [opts.label] bag name in logs (e.g. "wm", "settings")
   * @param {() => number} [opts.nowMs] clock for snapshots (default Date.now)
   */
  constructor(opts = {}) {
    this.label = opts.label != null && opts.label !== "" ? String(opts.label) : "signals";
    this._nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
    // List (not Map by id): GObject handler ids are unique per target only.
    /** @type {SignalEntry[]} */
    this._entries = [];
    this._disposed = false;
    this._connectCount = 0;
    this._disconnectCount = 0;
  }

  get disposed() {
    return this._disposed;
  }

  /** Number of live connections. */
  get size() {
    return this._entries.length;
  }

  /**
   * Connect handler on target; track id (optional group for bulk disconnect).
   * @param {object} target object with connect(name, cb) → id
   * @param {string} name signal name
   * @param {Function} cb handler
   * @param {{ group?: string }} [opts]
   * @returns {number|string|null} connection id, or null if disposed / invalid
   */
  connect(target, name, cb, opts = {}) {
    if (this._disposed) {
      Logger.warn(
        `[SignalBag:${this.label}] connect after dispose ignored signal=${name} group=${
          opts.group ?? "-"
        }`
      );
      return null;
    }
    if (!target || typeof target.connect !== "function") {
      Logger.warn(`[SignalBag:${this.label}] connect bad target signal=${name}`);
      return null;
    }
    if (typeof cb !== "function") {
      Logger.warn(`[SignalBag:${this.label}] connect non-function cb signal=${name}`);
      return null;
    }

    const signal = String(name);
    const group = opts.group != null && opts.group !== "" ? String(opts.group) : null;

    /** @type {number|string|null} */
    let id = null;
    try {
      id = target.connect(signal, cb);
    } catch (e) {
      Logger.warn(`[SignalBag:${this.label}] connect threw signal=${signal}: ${e}`);
      return null;
    }

    if (id == null || id === 0 || id === false) {
      Logger.warn(`[SignalBag:${this.label}] connect returned empty id signal=${signal}`);
      return null;
    }

    this._entries.push({
      id,
      target,
      signal,
      group,
      setAt: this._nowMs(),
    });
    this._connectCount += 1;
    Logger.debug(
      `[SignalBag:${this.label}] connect id=${id} signal=${signal} group=${group ?? "-"} size=${
        this._entries.length
      }`
    );
    return id;
  }

  /**
   * Disconnect one tracked id (first match if multi-target id collision).
   * Prefer disconnectTarget/group when ids may collide across targets.
   * @param {number|string} id
   * @returns {boolean} true if an entry was removed
   */
  disconnect(id) {
    const idx = this._entries.findIndex((e) => e.id === id);
    if (idx < 0) {
      Logger.trace(`[SignalBag:${this.label}] disconnect miss id=${id}`);
      return false;
    }
    const entry = this._entries[idx];
    this._entries.splice(idx, 1);
    this._safeDisconnect(entry, "disconnect");
    this._disconnectCount += 1;
    Logger.debug(
      `[SignalBag:${this.label}] disconnect id=${id} signal=${entry.signal} group=${
        entry.group ?? "-"
      } ageMs=${this._nowMs() - entry.setAt}`
    );
    return true;
  }

  /**
   * Disconnect every connection on this target.
   * @param {object} target
   * @returns {number} count disconnected
   */
  disconnectTarget(target) {
    if (!target) return 0;
    const doomed = this._entries.filter((e) => e.target === target);
    if (doomed.length === 0) {
      Logger.trace(`[SignalBag:${this.label}] disconnectTarget empty`);
      return 0;
    }
    Logger.debug(`[SignalBag:${this.label}] disconnectTarget n=${doomed.length}`);
    for (const entry of doomed) {
      this._removeEntry(entry, "disconnectTarget");
    }
    return doomed.length;
  }

  /**
   * Disconnect every connection in a named group; other groups remain.
   * @param {string} group
   * @returns {number} count disconnected
   */
  disconnectGroup(group) {
    const key = String(group);
    const doomed = this._entries.filter((e) => e.group === key);
    if (doomed.length === 0) {
      Logger.trace(`[SignalBag:${this.label}] disconnectGroup empty group=${key}`);
      return 0;
    }
    Logger.debug(`[SignalBag:${this.label}] disconnectGroup group=${key} n=${doomed.length}`);
    for (const entry of doomed) {
      this._removeEntry(entry, "disconnectGroup");
    }
    return doomed.length;
  }

  /**
   * Disconnect every tracked connection. Safe to call repeatedly.
   * @returns {number} count disconnected
   */
  disconnectAll() {
    if (this._entries.length === 0) {
      Logger.trace(`[SignalBag:${this.label}] disconnectAll empty`);
      return 0;
    }
    const n = this._entries.length;
    const doomed = this._entries.splice(0, n);
    Logger.debug(`[SignalBag:${this.label}] disconnectAll n=${n}`);
    for (const entry of doomed) {
      this._safeDisconnect(entry, "disconnectAll");
      this._disconnectCount += 1;
    }
    return n;
  }

  /**
   * disconnectAll + seal bag (further connect no-ops + warn). Idempotent.
   */
  dispose() {
    if (this._disposed) {
      Logger.trace(`[SignalBag:${this.label}] dispose already sealed`);
      return;
    }
    const snap = this.snapshot();
    const n = this.disconnectAll();
    this._disposed = true;
    Logger.debug(
      `[SignalBag:${this.label}] dispose disconnected=${n} lifetime connect=${
        this._connectCount
      } disconnect=${this._disconnectCount} last=${JSON.stringify(snap.connections)}`
    );
  }

  /**
   * Failure-analysis dump (always pure data; no log side effects).
   * @returns {{
   *   label: string,
   *   disposed: boolean,
   *   size: number,
   *   connectCount: number,
   *   disconnectCount: number,
   *   connections: Array<{
   *     id: number|string,
   *     signal: string,
   *     group: string|null,
   *     ageMs: number,
   *   }>,
   * }}
   */
  snapshot() {
    const now = this._nowMs();
    const connections = this._entries.map((entry) => ({
      id: entry.id,
      signal: entry.signal,
      group: entry.group,
      ageMs: now - entry.setAt,
    }));
    connections.sort((a, b) => {
      const sa = String(a.signal);
      const sb = String(b.signal);
      if (sa !== sb) return sa.localeCompare(sb);
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    return {
      label: this.label,
      disposed: this._disposed,
      size: this._entries.length,
      connectCount: this._connectCount,
      disconnectCount: this._disconnectCount,
      connections,
    };
  }

  /**
   * @param {SignalEntry} entry
   * @param {string} reason
   */
  _removeEntry(entry, reason) {
    const idx = this._entries.indexOf(entry);
    if (idx < 0) return;
    this._entries.splice(idx, 1);
    this._safeDisconnect(entry, reason);
    this._disconnectCount += 1;
  }

  /**
   * @param {SignalEntry} entry
   * @param {string} reason
   */
  _safeDisconnect(entry, reason) {
    try {
      if (entry.target && typeof entry.target.disconnect === "function") {
        entry.target.disconnect(entry.id);
      }
    } catch (e) {
      Logger.debug(
        `[SignalBag:${this.label}] disconnect threw id=${entry.id} signal=${entry.signal} reason=${reason}: ${e}`
      );
    }
  }
}
