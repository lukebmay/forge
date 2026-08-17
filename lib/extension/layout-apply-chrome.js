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
 * CL10: optional layout-apply chrome (dim scrim + spinner) during layout apply.
 *
 * Pure state machine is unit-testable without Mutter. Runtime manager shows a
 * non-reactive full-stage dim on Main.uiGroup when enabled, with a large spinner
 * and status label centered on each monitor.
 *
 * Policy:
 * - Default setting on; hard-clear always.
 * - Show on chrome-show (full apply) or LayoutBatch begin when setting on.
 * - ApplyLayout clears at all-hard (D043) — not soft residual; Done still
 *   clears on error/early exit. Soft may run after clear.
 * - Batch end does not clear — ApplyLayout owns lifetime for full apply.
 * - Clear on explicit chrome-clear, disable(), or hard timeout (always).
 * - Hard max lifetime ≤ LAYOUT_APPLY_CHROME_HARD_MS — never stick.
 * - Scrim is reactive and eats pointer events so tabs cannot be clicked.
 */

import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Logger } from "../shared/logger.js";

/**
 * Hard max chrome lifetime (ms). Always clears even if batch/CLI never ends.
 * Multi-open + residual bind/place on dual 4K cold can exceed 8s.
 */
export const LAYOUT_APPLY_CHROME_HARD_MS = 30000;

/** Dim scrim alpha (0–1). ~80% black overlay. */
export const LAYOUT_APPLY_CHROME_SCRIM_ALPHA = 0.8;

/**
 * Title ("Forge") **visual** height as a fraction of that monitor's stage height.
 * Target band ~5–10%; mid-band keeps dual 1080p/4K readable.
 */
export const LAYOUT_APPLY_CHROME_TITLE_HEIGHT_RATIO = 0.075;

/** Detail line font size as a fraction of the title size. */
export const LAYOUT_APPLY_CHROME_DETAIL_TITLE_RATIO = 0.5;

/** Hint line font size as a fraction of the detail size. */
export const LAYOUT_APPLY_CHROME_HINT_DETAIL_RATIO = 0.72;

/**
 * Delay before the first-apply note. Short applies never show it.
 */
export const LAYOUT_APPLY_CHROME_HINT_MS = 2500;

/** Shown after HINT_MS while chrome is still up. */
export const LAYOUT_APPLY_CHROME_FIRST_HINT =
  "First apply can take a while. Later ones are faster.";

/** Floor for title CSS font (logical px) on tiny/pathological heights. */
const TITLE_FONT_MIN_PX = 18;

/** Cap for title CSS font (logical px) on absurdly tall virtual monitors. */
const TITLE_FONT_MAX_PX = 200;

/** Degrees advanced per spinner tick (~60fps target). */
const SPINNER_DEG_PER_TICK = 8;

/** Spinner tick interval (ms). */
const SPINNER_TICK_MS = 16;

/** Brand line above the loading detail. */
export const LAYOUT_APPLY_CHROME_TITLE = "Forge";

/**
 * St/CSS theme scale for the stage. CSS `px` are logical; St multiplies by this.
 * Meta/layoutManager monitor geometry is already in stage coordinates.
 * @returns {number}
 */
export function applyChromeUiScale() {
  try {
    const s = St.ThemeContext.get_for_stage(global.stage)?.scale_factor;
    if (typeof s === "number" && Number.isFinite(s) && s > 0) return s;
  } catch (_e) {
    // stage / ThemeContext unavailable in unit tests
  }
  return 1;
}

/**
 * Per-monitor chrome metrics (pure; unit-testable).
 *
 * `monitorHeight` is in **stage/Meta** pixels (layoutManager.monitors). St CSS
 * `font-size` / style lengths are **logical** and are scaled by `scaleFactor`
 * (= `St.ThemeContext.scale_factor`, same as Utils.dpi()). Using stage height as
 * CSS px double-scales on HiDPI (e.g. 7.5% → ~15% visual).
 *
 * Title visual ≈ 7.5% of stage height; detail = half title; spinner/spacing
 * match. Actor sizes that Clutter consumes without CSS scaling use `*StagePx`.
 *
 * @param {number} monitorHeight stage pixels
 * @param {number} [scaleFactor=1] St scale_factor
 * @returns {{
 *   titlePx: number,
 *   detailPx: number,
 *   hintPx: number,
 *   spinnerPx: number,
 *   spinnerStagePx: number,
 *   spinnerBorderPx: number,
 *   spacingPx: number,
 *   scale: number,
 * }}
 */
export function applyChromeMetrics(monitorHeight, scaleFactor = 1) {
  const scale =
    typeof scaleFactor === "number" && Number.isFinite(scaleFactor) && scaleFactor > 0
      ? scaleFactor
      : 1;
  const h =
    typeof monitorHeight === "number" && Number.isFinite(monitorHeight) && monitorHeight > 0
      ? monitorHeight
      : 1080;
  // Desired visual title height in stage pixels, then convert to logical CSS px.
  const titleStage = Math.round(h * LAYOUT_APPLY_CHROME_TITLE_HEIGHT_RATIO);
  const titlePx = Math.max(
    TITLE_FONT_MIN_PX,
    Math.min(TITLE_FONT_MAX_PX, Math.round(titleStage / scale))
  );
  const detailPx = Math.max(
    Math.round(TITLE_FONT_MIN_PX * LAYOUT_APPLY_CHROME_DETAIL_TITLE_RATIO),
    Math.round(titlePx * LAYOUT_APPLY_CHROME_DETAIL_TITLE_RATIO)
  );
  const hintPx = Math.max(11, Math.round(detailPx * LAYOUT_APPLY_CHROME_HINT_DETAIL_RATIO));
  // Ring ~same visual height as the title; CSS size is logical, actor size is stage.
  const spinnerPx = Math.max(24, Math.round(titlePx * 0.95));
  const spinnerStagePx = Math.max(24, Math.round(spinnerPx * scale));
  const spinnerBorderPx = Math.max(2, Math.round(spinnerPx * 0.07));
  const spacingPx = Math.max(8, Math.round(titlePx * 0.22));
  return {
    titlePx,
    detailPx,
    hintPx,
    spinnerPx,
    spinnerStagePx,
    spinnerBorderPx,
    spacingPx,
    scale,
  };
}

/**
 * Centered status under the spinner.
 * @param {string|null|undefined} layoutName profile / layout id (e.g. "dev")
 * @param {{ longRunning?: boolean }} [opts]
 * @returns {{ title: string, detail: string, hint: string }}
 */
export function formatApplyChromeStatus(layoutName, opts = {}) {
  const raw = layoutName == null ? "" : String(layoutName).trim();
  const name = raw.length > 0 ? raw : null;
  return {
    title: LAYOUT_APPLY_CHROME_TITLE,
    detail: name ? `Loading layout "${name}"...` : "Loading layout...",
    hint: opts.longRunning ? LAYOUT_APPLY_CHROME_FIRST_HINT : "",
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
   * Override hard-clear lifetime (ApplyLayout uses ~300s; batch stays 30s).
   * @param {number} ms
   */
  setHardMs(ms) {
    if (typeof ms === "number" && ms > 0) {
      this.hardMs = ms;
    }
  }

  /**
   * Reset the hard-clear timer while chrome stays visible (phase enter).
   */
  resetHardClear() {
    if (!this._state.visible) return;
    if (this._state.hardClearTimerId != null && this._cancel) {
      try {
        this._cancel(this._state.hardClearTimerId);
      } catch (_e) {
        /* */
      }
    }
    this._state = withHardClearTimer(this._state, null);
    this._armHardClear();
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
    /** @type {number|null} */
    this._hintSourceId = null;
    /** @type {boolean} */
    this._hintShown = false;
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

  show() {
    this._ctrl.show();
  }

  /**
   * ApplyLayout path: show chrome with apply-run hard lifetime (not batch 30s).
   * @param {{ layoutName?: string|null, hardMs?: number }} [opts]
   */
  showForApplyRun(opts = {}) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, "layoutName")) {
      this.setLayoutName(opts.layoutName);
    }
    if (typeof opts?.hardMs === "number" && opts.hardMs > 0) {
      this._ctrl.setHardMs(opts.hardMs);
    }
    this._ctrl.show();
  }

  /**
   * Re-arm hard clear on phase enter while ApplyLayout is live.
   * @param {number} [hardMs]
   */
  bumpApplyRunHardClear(hardMs) {
    if (typeof hardMs === "number" && hardMs > 0) {
      this._ctrl.setHardMs(hardMs);
    }
    this._ctrl.resetHardClear();
  }

  /**
   * Restore batch default hard lifetime after ApplyLayout ends.
   */
  restoreBatchHardMs() {
    this._ctrl.setHardMs(LAYOUT_APPLY_CHROME_HARD_MS);
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
    this._hintShown = false;
  }

  _ensureActor() {
    if (this._actor) {
      this._sizeActor();
      this._rebuildStatusHosts();
      this._startSpinner();
      this._armFirstApplyHint();
      try {
        this._actor.show();
      } catch (_e) {
        // actor disposed
      }
      return;
    }

    // Reactive: eat pointer so the user cannot click tabs mid-apply (R027).
    const alpha = LAYOUT_APPLY_CHROME_SCRIM_ALPHA;
    this._actor = new St.Widget({
      name: "forge-layout-apply-chrome",
      style_class: "forge-layout-apply-chrome",
      reactive: true,
      can_focus: false,
      opacity: 255,
      style: `background-color: rgba(0, 0, 0, ${alpha});`,
    });
    const eat = () => Clutter.EVENT_STOP;
    try {
      this._actor.connect("button-press-event", eat);
      this._actor.connect("button-release-event", eat);
      this._actor.connect("scroll-event", eat);
      this._actor.connect("touch-event", eat);
    } catch (_e) {
      // tests / headless may lack connect
    }
    this._spinners = [];

    const uiGroup = Main?.layoutManager?.uiGroup;
    if (uiGroup && typeof uiGroup.add_child === "function") {
      try {
        uiGroup.add_child(this._actor);
        // Park overlay above tab chrome; never lower the layer under the overlay.
        const layer = uiGroup.get_children?.()?.find?.((c) => c?.name === "forge-tab-chrome");
        if (layer && typeof uiGroup.set_child_above_sibling === "function") {
          uiGroup.set_child_above_sibling(this._actor, layer);
        }
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
    this._armFirstApplyHint();
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
   * Each monitor gets a full-rect BinLayout host so the stack is truly centered
   * (manual set_size on an oversized/undersized panel was top-packing content).
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

    const scale = applyChromeUiScale();
    const monitors = this._monitors();
    for (const mon of monitors) {
      if (!(mon.width > 0 && mon.height > 0)) continue;

      const m = applyChromeMetrics(mon.height, scale);

      // Full-monitor host: BinLayout + CENTER aligns → true visual center.
      const host = new St.Widget({
        style_class: "forge-layout-apply-chrome-host",
        reactive: false,
        can_focus: false,
        layout_manager: new Clutter.BinLayout(),
      });
      try {
        host.set_position(mon.x, mon.y);
        host.set_size(mon.width, mon.height);
      } catch (_e) {
        // ignore
      }

      const panel = new St.BoxLayout({
        style_class: "forge-layout-apply-chrome-panel",
        vertical: true,
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        style: `spacing: ${m.spacingPx}px;`,
      });

      // CSS lengths are logical (St × scale_factor). Actor width/height are stage px.
      const spinner = new St.Widget({
        style_class: "forge-layout-apply-chrome-spinner",
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        width: m.spinnerStagePx,
        height: m.spinnerStagePx,
        style:
          `width: ${m.spinnerPx}px; height: ${m.spinnerPx}px;` +
          ` border: ${m.spinnerBorderPx}px solid rgba(255, 255, 255, 0.22);` +
          ` border-top-color: rgba(255, 255, 255, 0.95);` +
          ` border-right-color: rgba(255, 255, 255, 0.55);` +
          ` border-radius: ${Math.floor(m.spinnerPx / 2)}px;`,
      });
      try {
        spinner.set_pivot_point(0.5, 0.5);
      } catch (_e) {
        // older Clutter may lack pivot helpers
      }
      this._spinners.push(spinner);

      const status = formatApplyChromeStatus(this._layoutName, {
        longRunning: this._hintShown,
      });
      const titleLabel = new St.Label({
        style_class: "forge-layout-apply-chrome-title",
        text: status.title,
        reactive: false,
        can_focus: false,
        x_align: Clutter.ActorAlign.CENTER,
        style:
          "color: rgba(255, 255, 255, 0.98);" +
          ` font-size: ${m.titlePx}px;` +
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
          ` font-size: ${m.detailPx}px;` +
          " font-weight: 500;" +
          " text-align: center;",
      });

      try {
        panel.add_child(spinner);
        panel.add_child(titleLabel);
        panel.add_child(detailLabel);
        if (status.hint) {
          const hintLabel = new St.Label({
            style_class: "forge-layout-apply-chrome-hint",
            text: status.hint,
            reactive: false,
            can_focus: false,
            x_align: Clutter.ActorAlign.CENTER,
            style:
              "color: rgba(255, 255, 255, 0.62);" +
              ` font-size: ${m.hintPx}px;` +
              " font-weight: 400;" +
              " text-align: center;",
          });
          panel.add_child(hintLabel);
        }
      } catch (_e) {
        // St API
      }

      try {
        host.add_child(panel);
        this._actor.add_child(host);
      } catch (_e) {
        try {
          host.destroy();
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

  _armFirstApplyHint() {
    if (this._hintShown || this._hintSourceId != null) return;
    this._hintSourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      LAYOUT_APPLY_CHROME_HINT_MS,
      () => {
        this._hintSourceId = null;
        if (!this._ctrl.visible || !this._actor) {
          return GLib.SOURCE_REMOVE ?? false;
        }
        this._hintShown = true;
        this._rebuildStatusHosts();
        this._startSpinner();
        return GLib.SOURCE_REMOVE ?? false;
      }
    );
  }

  _cancelFirstApplyHint() {
    const id = this._hintSourceId;
    this._hintSourceId = null;
    this._hintShown = false;
    if (id != null) {
      try {
        GLib.Source.remove(id);
      } catch (_e) {
        // already removed
      }
    }
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
    this._cancelFirstApplyHint();
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
