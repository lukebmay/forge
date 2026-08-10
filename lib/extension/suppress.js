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
 * Nestable suppress flag: depth counter + run(fn) try/finally.
 * Replaces sticky booleans that stick on throw / early return.
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L5 suppress).
 */

/**
 * Single re-entrancy suppress stack. Nest enter/leave or use run(fn).
 * Hold one instance per independent suppress concern (geom, above, rehome…).
 */
export class SuppressFlag {
  /**
   * @param {object} [opts]
   * @param {string} [opts.label]
   */
  constructor(opts = {}) {
    this.label = opts.label != null && opts.label !== "" ? String(opts.label) : "suppress";
    /** @type {number} */
    this._depth = 0;
  }

  /** @returns {number} */
  get depth() {
    return this._depth;
  }

  /** @returns {boolean} */
  get active() {
    return this._depth > 0;
  }

  /** Increment depth. */
  enter() {
    this._depth += 1;
  }

  /** Decrement depth; clamps at 0 (unbalanced leave is a no-op). */
  leave() {
    if (this._depth > 0) {
      this._depth -= 1;
    }
  }

  /**
   * Run `fn` while suppressed. Nestable; throw restores prior depth.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  run(fn) {
    this.enter();
    try {
      return fn();
    } finally {
      this.leave();
    }
  }

  /**
   * @returns {{ label: string, depth: number, active: boolean }}
   */
  snapshot() {
    return {
      label: this.label,
      depth: this._depth,
      active: this.active,
    };
  }
}
