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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * CL10: optional layout-apply chrome (soft dim scrim) during LayoutBatch.
 *
 * Pure state machine is unit-testable without Mutter. Runtime manager shows a
 * non-reactive full-stage dim on Main.uiGroup when enabled.
 *
 * Policy:
 * - Default setting off (opt-in).
 * - Show on LayoutBatch begin when depth >= 1 and setting on.
 * - Clear when batch depth hits 0, disable(), or hard timeout (always).
 * - Hard max lifetime ≤ LAYOUT_APPLY_CHROME_HARD_MS — never stick.
 * - Scrim is non-reactive so input is never blocked even if visible.
 */

import GLib from "gi://GLib";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Logger } from "../shared/logger.js";

/** Hard max chrome lifetime (ms). Always clears even if batch never ends. */
export const LAYOUT_APPLY_CHROME_HARD_MS = 8000;

/**
 * @typedef {{ visible: boolean, hardClearTimerId: number|string|null }} ApplyChromeState
 */

/**
 * @returns {ApplyChromeState}
 */
export function createApplyChromeState() {
  return { visible: false, hardClearTimerId: null };
}

/**
 * Show when setting is on and LayoutBatch depth is at least 1 (begin path).
 * @param {{ enabled?: boolean, depth?: number }} [opts]
 * @returns {boolean}
 */
export function shouldShowChrome(opts = {}) {
  const depth = opts.depth;
  const n = typeof depth === "number" && Number.isFinite(depth) ? depth : 0;
  return !!opts.enabled && n >= 1;
}

/**
 * Request show. Idempotent when already visible; arms hard clear only if none.
 * @param {ApplyChromeState|null|undefined} state
 * @returns {{ next: ApplyChromeState, showActor: boolean, armHardClear: boolean }}
 */
export function transitionShow(state) {
  const s = state && typeof state === "object" ? state : createApplyChromeState();
  const alreadyVisible = !!s.visible;
  const hasTimer = s.hardClearTimerId != null && s.hardClearTimerId !== 0;
  return {
    next: {
      visible: true,
      hardClearTimerId: hasTimer ? s.hardClearTimerId : null,
    },
    showActor: !alreadyVisible,
    armHardClear: !hasTimer,
  };
}

/**
 * Request clear. Idempotent when already clear; cancels hard-clear timer if any.
 * @param {ApplyChromeState|null|undefined} state
 * @returns {{
 *   next: ApplyChromeState,
 *   hideActor: boolean,
 *   cancelHardClear: boolean,
 *   cancelledTimerId: number|string|null
 * }}
 */
export function transitionClear(state) {
  const s = state && typeof state === "object" ? state : createApplyChromeState();
  const timerId =
    s.hardClearTimerId != null && s.hardClearTimerId !== 0 ? s.hardClearTimerId : null;
  return {
    next: createApplyChromeState(),
    hideActor: !!s.visible,
    cancelHardClear: timerId != null,
    cancelledTimerId: timerId,
  };
}

/**
 * Record armed hard-clear timer id on state.
 * @param {ApplyChromeState|null|undefined} state
 * @param {number|string|null} timerId
 * @returns {ApplyChromeState}
 */
export function withHardClearTimer(state, timerId) {
  return {
    visible: !!(state && state.visible),
    hardClearTimerId: timerId != null && timerId !== 0 ? timerId : null,
  };
}

/**
 * Injectable state + timer controller (no St). Used by unit tests and runtime.
 */
export class ApplyChromeController {
  /**
   * @param {object} [opts]
   * @param {number} [opts.hardMs]
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {() => void} [opts.onShow]
   * @param {() => void} [opts.onHide]
   */
  constructor(opts = {}) {
    this.hardMs =
      typeof opts.hardMs === "number" && opts.hardMs > 0
        ? opts.hardMs
        : LAYOUT_APPLY_CHROME_HARD_MS;
    this._schedule = typeof opts.schedule === "function" ? opts.schedule : null;
    this._cancel = typeof opts.cancel === "function" ? opts.cancel : null;
    this._onShow = typeof opts.onShow === "function" ? opts.onShow : null;
    this._onHide = typeof opts.onHide === "function" ? opts.onHide : null;
    /** @type {ApplyChromeState} */
    this._state = createApplyChromeState();
  }

  get visible() {
    return !!this._state.visible;
  }

  get hardClearArmed() {
    return this._state.hardClearTimerId != null && this._state.hardClearTimerId !== 0;
  }

  /**
   * @param {{ enabled?: boolean, depth?: number }} opts
   */
  sync(opts = {}) {
    if (shouldShowChrome(opts)) {
      this.show();
    } else {
      this.clear("depth-or-disabled");
    }
  }

  show() {
    const t = transitionShow(this._state);
    this._state = t.next;
    if (t.showActor && this._onShow) {
      try {
        this._onShow();
      } catch (_e) {
        // Never leave chrome up without hard clear path after a failed show.
        this.clear("show-failed");
        return;
      }
    }
    if (t.armHardClear) {
      this._armHardClear();
    }
  }

  /**
   * @param {string} [_reason]
   */
  clear(_reason) {
    const t = transitionClear(this._state);
    if (t.cancelHardClear && this._cancel && t.cancelledTimerId != null) {
      try {
        this._cancel(t.cancelledTimerId);
      } catch (_e) {
        // timer may already be gone
      }
    }
    this._state = t.next;
    if (t.hideActor && this._onHide) {
      try {
        this._onHide();
      } catch (_e) {
        // actor may already be disposed
      }
    }
  }

  destroy() {
    this.clear("destroy");
  }

  _armHardClear() {
    if (!this._schedule) {
      // No schedule (tests without timer) — still mark as needing external clear.
      this._state = withHardClearTimer(this._state, null);
      return;
    }
    const id = this._schedule(this.hardMs, () => {
      // Drop id first so clear does not cancel a fired one-shot.
      this._state = withHardClearTimer(this._state, null);
      this.clear("hard-timeout");
    });
    this._state = withHardClearTimer(this._state, id);
  }
}

/**
 * WindowManager-facing apply chrome: dim scrim + hard auto-clear.
 * Show on LayoutBatch begin (depth ≥ 1) when layout-apply-chrome-enabled.
 */
export class LayoutApplyChrome {
  /**
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(extWm) {
    this._extWm = extWm;
    /** @type {import('gi://St').Widget|null} */
    this._actor = null;
    this._ctrl = new ApplyChromeController({
      hardMs: LAYOUT_APPLY_CHROME_HARD_MS,
      schedule: (ms, cb) =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
          cb();
          return GLib.SOURCE_REMOVE ?? false;
        }),
      cancel: (id) => {
        if (id) GLib.Source.remove(id);
      },
      onShow: () => this._ensureActor(),
      onHide: () => this._destroyActor(),
    });
  }

  get visible() {
    return this._ctrl.visible;
  }

  /**
   * @param {number} depth current LayoutBatch depth after begin/end
   */
  syncFromBatch(depth) {
    let enabled = false;
    try {
      enabled = !!this._extWm?.ext?.settings?.get_boolean?.("layout-apply-chrome-enabled");
    } catch (_e) {
      enabled = false;
    }
    this._ctrl.sync({ enabled, depth: depth || 0 });
  }

  clear() {
    this._ctrl.clear("external");
  }

  destroy() {
    this._ctrl.destroy();
    this._destroyActor();
  }

  _ensureActor() {
    if (this._actor) {
      this._sizeActor();
      try {
        this._actor.show();
      } catch (_e) {
        // actor disposed
      }
      return;
    }

    // Non-reactive: never steal input even if chrome somehow remains visible.
    this._actor = new St.Widget({
      name: "forge-layout-apply-chrome",
      style_class: "forge-layout-apply-chrome",
      reactive: false,
      can_focus: false,
      opacity: 255,
      style: "background-color: rgba(0, 0, 0, 0.32);",
    });

    const uiGroup = Main?.layoutManager?.uiGroup;
    if (uiGroup && typeof uiGroup.add_child === "function") {
      try {
        uiGroup.add_child(this._actor);
      } catch (e) {
        Logger.warn?.(`layout-apply-chrome: add_child failed: ${e}`);
        try {
          this._actor.destroy();
        } catch (_e) {
          // ignore
        }
        this._actor = null;
        throw e;
      }
    }

    this._sizeActor();
    try {
      this._actor.show();
    } catch (_e) {
      // ignore
    }
  }

  _sizeActor() {
    if (!this._actor) return;
    let w = 0;
    let h = 0;
    try {
      w = global?.stage?.get_width?.() ?? 0;
      h = global?.stage?.get_height?.() ?? 0;
    } catch (_e) {
      // stage may be gone
    }
    if (!(w > 0 && h > 0)) {
      try {
        const mon = Main?.layoutManager?.primaryMonitor;
        if (mon) {
          w = (mon.x || 0) + (mon.width || 0);
          h = (mon.y || 0) + (mon.height || 0);
        }
      } catch (_e) {
        // ignore
      }
    }
    if (!(w > 0)) w = 1920;
    if (!(h > 0)) h = 1080;
    try {
      this._actor.set_position(0, 0);
      this._actor.set_size(w, h);
    } catch (_e) {
      // ignore
    }
  }

  _destroyActor() {
    const actor = this._actor;
    this._actor = null;
    if (!actor) return;
    try {
      actor.hide();
    } catch (_e) {
      // ignore
    }
    try {
      const parent = actor.get_parent?.();
      if (parent && typeof parent.remove_child === "function") {
        parent.remove_child(actor);
      } else {
        const uiGroup = Main?.layoutManager?.uiGroup;
        if (uiGroup && typeof uiGroup.remove_child === "function" && uiGroup.contains?.(actor)) {
          uiGroup.remove_child(actor);
        }
      }
    } catch (_e) {
      // ignore
    }
    try {
      actor.destroy();
    } catch (_e) {
      // ignore
    }
  }
}
