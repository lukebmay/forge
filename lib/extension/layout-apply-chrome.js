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
 * CL10: optional layout-apply chrome (dim scrim + spinner) during LayoutBatch.
 *
 * Pure state machine is unit-testable without Mutter. Runtime manager shows a
 * non-reactive full-stage dim on Main.uiGroup when enabled, with a large spinner
 * and status label centered on each monitor.
 *
 * Policy:
 * - Default setting on; hard-clear always.
 * - Show on LayoutBatch begin when depth >= 1 and setting on.
 * - Clear when batch depth hits 0, disable(), or hard timeout (always).
 * - Hard max lifetime ≤ LAYOUT_APPLY_CHROME_HARD_MS — never stick.
 * - Scrim is non-reactive so input is never blocked even if visible.
 */

import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Logger } from "../shared/logger.js";

/** Hard max chrome lifetime (ms). Always clears even if batch never ends. */
export const LAYOUT_APPLY_CHROME_HARD_MS = 8000;

/** Dim scrim alpha (0–1). ~50% black overlay. */
export const LAYOUT_APPLY_CHROME_SCRIM_ALPHA = 0.5;

/** Spinner ring size (px). */
const SPINNER_SIZE = 72;

/** Spinner ring stroke (px). */
const SPINNER_BORDER = 5;

/** Degrees advanced per spinner tick (~60fps target). */
const SPINNER_DEG_PER_TICK = 8;

/** Spinner tick interval (ms). */
const SPINNER_TICK_MS = 16;

/** Brand line above the loading detail. */
export const LAYOUT_APPLY_CHROME_TITLE = "Forge";

/**
 * Centered status under the spinner.
 * @param {string|null|undefined} layoutName profile / layout id (e.g. "dev")
 * @returns {{ title: string, detail: string }}
 */
export function formatApplyChromeStatus(layoutName) {
  const raw = layoutName == null ? "" : String(layoutName).trim();
  const name = raw.length > 0 ? raw : null;
  return {
    title: LAYOUT_APPLY_CHROME_TITLE,
    detail: name ? `Loading layout "${name}"...` : "Loading layout...",
  };
}

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
 * WindowManager-facing apply chrome: dim scrim + spinner + hard auto-clear.
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
    /** @type {import('gi://St').Widget[]} */
    this._spinners = [];
    /** @type {number|null} */
    this._spinSourceId = null;
    /** @type {string|null} */
    this._layoutName = null;
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
   * Optional layout/profile name shown under the spinner.
   * @param {string|null|undefined} name
   */
  setLayoutName(name) {
    const raw = name == null ? "" : String(name).trim();
    this._layoutName = raw.length > 0 ? raw : null;
    if (this._actor && this._ctrl.visible) {
      this._rebuildStatusHosts();
    }
  }

  /**
   * @param {number} depth current LayoutBatch depth after begin/end
   * @param {{ layoutName?: string|null }} [opts]
   */
  syncFromBatch(depth, opts = {}) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, "layoutName")) {
      this.setLayoutName(opts.layoutName);
    }
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
    this._layoutName = null;
  }

  _ensureActor() {
    if (this._actor) {
      this._sizeActor();
      this._rebuildStatusHosts();
      this._startSpinner();
      try {
        this._actor.show();
      } catch (_e) {
        // actor disposed
      }
      return;
    }

    // Non-reactive: never steal input even if chrome somehow remains visible.
    const alpha = LAYOUT_APPLY_CHROME_SCRIM_ALPHA;
    this._actor = new St.Widget({
      name: "forge-layout-apply-chrome",
      style_class: "forge-layout-apply-chrome",
      reactive: false,
      can_focus: false,
      opacity: 255,
      style: `background-color: rgba(0, 0, 0, ${alpha});`,
    });
    this._spinners = [];

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
        this._spinners = [];
        throw e;
      }
    }

    this._sizeActor();
    this._rebuildStatusHosts();
    this._startSpinner();
    try {
      this._actor.show();
    } catch (_e) {
      // ignore
    }
  }

  _stageSize() {
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
    return { w, h };
  }

  _monitors() {
    try {
      const mons = Main?.layoutManager?.monitors;
      if (Array.isArray(mons) && mons.length > 0) {
        return mons.map((m) => ({
          x: m.x || 0,
          y: m.y || 0,
          width: m.width || 0,
          height: m.height || 0,
        }));
      }
    } catch (_e) {
      // layoutManager may be gone
    }
    const { w, h } = this._stageSize();
    return [{ x: 0, y: 0, width: w, height: h }];
  }

  _sizeActor() {
    if (!this._actor) return;
    const { w, h } = this._stageSize();
    try {
      this._actor.set_position(0, 0);
      this._actor.set_size(w, h);
    } catch (_e) {
      // ignore
    }
  }

  /**
   * Per-monitor center stack: large white spinner ring + status label.
   */
  _rebuildStatusHosts() {
    if (!this._actor) return;

    // Drop previous status children (keep the root scrim actor).
    try {
      const kids = this._actor.get_children?.() ?? [];
      for (const child of [...kids]) {
        try {
          this._actor.remove_child(child);
        } catch (_e) {
          // ignore
        }
        try {
          child.destroy();
        } catch (_e) {
          // ignore
        }
      }
    } catch (_e) {
      // ignore
    }
    this._spinners = [];

    const monitors = this._monitors();
    for (const mon of monitors) {
      if (!(mon.width > 0 && mon.height > 0)) continue;

      const panel = new St.BoxLayout({
        style_class: "forge-layout-apply-chrome-panel",
        vertical: true,
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 18px;",
      });

      // Simple CSS ring: dim track + bright top arc, rotated by timer.
      const spinner = new St.Widget({
        style_class: "forge-layout-apply-chrome-spinner",
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        width: SPINNER_SIZE,
        height: SPINNER_SIZE,
        style:
          `width: ${SPINNER_SIZE}px; height: ${SPINNER_SIZE}px;` +
          ` border: ${SPINNER_BORDER}px solid rgba(255, 255, 255, 0.22);` +
          ` border-top-color: rgba(255, 255, 255, 0.95);` +
          ` border-right-color: rgba(255, 255, 255, 0.55);` +
          ` border-radius: ${Math.floor(SPINNER_SIZE / 2)}px;`,
      });
      try {
        spinner.set_pivot_point(0.5, 0.5);
      } catch (_e) {
        // older Clutter may lack pivot helpers
      }
      this._spinners.push(spinner);

      const status = formatApplyChromeStatus(this._layoutName);
      const titleLabel = new St.Label({
        style_class: "forge-layout-apply-chrome-title",
        text: status.title,
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        style:
          "color: rgba(255, 255, 255, 0.98);" +
          " font-size: 22px;" +
          " font-weight: 700;" +
          " text-align: center;",
      });
      const detailLabel = new St.Label({
        style_class: "forge-layout-apply-chrome-label",
        text: status.detail,
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        style:
          "color: rgba(255, 255, 255, 0.92);" +
          " font-size: 16px;" +
          " font-weight: 500;" +
          " text-align: center;",
      });

      try {
        panel.add_child(spinner);
        panel.add_child(titleLabel);
        panel.add_child(detailLabel);
      } catch (_e) {
        // St API
      }

      // Wide enough for long layout names; center on this monitor.
      let panelW = 480;
      let panelH = SPINNER_SIZE + 18 + 28 + 12 + 24;
      try {
        const [, natW] = panel.get_preferred_width(-1);
        const [, natH] = panel.get_preferred_height(natW > 0 ? natW : -1);
        if (natW > 0) panelW = Math.max(panelW, Math.ceil(natW) + 24);
        if (natH > 0) panelH = Math.ceil(natH) + 8;
      } catch (_e) {
        // ignore; use estimate
      }
      const x = mon.x + Math.floor((mon.width - panelW) / 2);
      const y = mon.y + Math.floor((mon.height - panelH) / 2);
      try {
        panel.set_position(x, y);
        panel.set_size(panelW, panelH);
      } catch (_e) {
        // ignore
      }

      try {
        this._actor.add_child(panel);
      } catch (_e) {
        try {
          panel.destroy();
        } catch (_e2) {
          // ignore
        }
      }
    }
  }

  _startSpinner() {
    if (this._spinSourceId != null) return;
    if (!this._spinners.length) return;
    this._spinSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SPINNER_TICK_MS, () => {
      if (!this._actor || !this._spinners.length) {
        this._spinSourceId = null;
        return GLib.SOURCE_REMOVE ?? false;
      }
      for (const spinner of this._spinners) {
        try {
          const cur = typeof spinner.rotation_angle_z === "number" ? spinner.rotation_angle_z : 0;
          spinner.rotation_angle_z = (cur + SPINNER_DEG_PER_TICK) % 360;
        } catch (_e) {
          // actor may be disposed mid-tick
        }
      }
      return GLib.SOURCE_CONTINUE ?? true;
    });
  }

  _stopSpinner() {
    const id = this._spinSourceId;
    this._spinSourceId = null;
    if (id != null) {
      try {
        GLib.Source.remove(id);
      } catch (_e) {
        // already removed
      }
    }
    this._spinners = [];
  }

  _destroyActor() {
    this._stopSpinner();
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
