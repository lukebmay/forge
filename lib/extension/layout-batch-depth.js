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
 * Nestable open-layout batch depth + deferred-commit latch (CL5).
 * Pure state machine — no GObject / timers.
 * Plan: agents/plans/forge-lifecycle-abstractions.md (L11).
 */

/**
 * Owns depth and needsCommit for multi-open LayoutBatch.
 * Side effects (chrome, epoch, commitLayout) stay on the WM.
 */
export class LayoutBatchDepth {
  constructor() {
    /** @type {number} */
    this._depth = 0;
    /** @type {boolean} */
    this._needsCommit = false;
  }

  /** @returns {number} */
  get depth() {
    return this._depth;
  }

  /** @returns {boolean} */
  get active() {
    return this._depth > 0;
  }

  /** @returns {boolean} */
  get needsCommit() {
    return this._needsCommit;
  }

  /**
   * Enter one nest level.
   * @returns {{ depth: number }}
   */
  begin() {
    this._depth += 1;
    return { depth: this._depth };
  }

  /**
   * Latch that a layout commit is needed when the batch fully ends.
   * No-op when depth is already 0.
   */
  latchCommit() {
    if (this._depth > 0) {
      this._needsCommit = true;
    }
  }

  /**
   * Drop the deferred-commit latch without ending the batch
   * (e.g. residual already scheduled C).
   */
  clearNeedsCommit() {
    this._needsCommit = false;
  }

  /**
   * Force latch on/off (tests / direct sites). Prefer latchCommit when active.
   * @param {boolean} [v=true]
   */
  setNeedsCommit(v = true) {
    this._needsCommit = !!v;
  }

  /**
   * Leave one nest level.
   * @returns {{
   *   depth: number,
   *   wasActive: boolean,
   *   shouldCommit: boolean,
   * }}
   * shouldCommit is true only when depth hits 0 and needsCommit was latched.
   */
  end() {
    if (this._depth <= 0) {
      this._depth = 0;
      return { depth: 0, wasActive: false, shouldCommit: false };
    }
    this._depth -= 1;
    if (this._depth > 0) {
      return { depth: this._depth, wasActive: true, shouldCommit: false };
    }
    const need = this._needsCommit;
    this._needsCommit = false;
    return { depth: 0, wasActive: true, shouldCommit: need };
  }

  /** Zero depth and latch (disable / teardown). */
  reset() {
    this._depth = 0;
    this._needsCommit = false;
  }

  /**
   * @returns {{ depth: number, needsCommit: boolean, active: boolean }}
   */
  snapshot() {
    return {
      depth: this._depth,
      needsCommit: this._needsCommit,
      active: this.active,
    };
  }
}
