/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyLayout run bag (AL4): single-flight in-memory apply + DBus shapes.
 * Stub executor walks D008 phases and emits Progress/Done; AL5+ fills real work.
 * Plan: agents/plans/forge-layout-in-process.md · D038
 */

import { Logger } from "../shared/logger.js";

/** D008 phase names (ApplyLayout progress). */
export const APPLY_LAYOUT_PHASES = Object.freeze([
  "skeleton",
  "open",
  "bind",
  "order",
  "size",
  "hard-ready",
  "focus",
  "soft",
  "verify",
]);

/**
 * Chrome hard-clear while ApplyLayout owns the run (job-class ceiling).
 * LayoutBatch / CLI chrome-show still use LAYOUT_APPLY_CHROME_HARD_MS (30s).
 */
export const LAYOUT_APPLY_RUN_HARD_MS = 300_000;

let _applySeq = 0;

/**
 * @returns {string}
 */
export function newApplyId() {
  _applySeq = (_applySeq + 1) % 1_000_000;
  const t = Date.now().toString(36);
  const n = _applySeq.toString(36).padStart(3, "0");
  return `al-${t}-${n}`;
}

/**
 * @param {unknown} raw JSON string or object
 * @returns {{ ok: true, request: object } | { ok: false, error: string }}
 */
export function parseApplyLayoutRequest(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) {
      return { ok: false, error: "ApplyLayout: empty request" };
    }
    try {
      obj = JSON.parse(s);
    } catch (e) {
      return { ok: false, error: `ApplyLayout: invalid JSON: ${e?.message || e}` };
    }
  }
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "ApplyLayout: request must be an object" };
  }
  const profile = obj.profile;
  if (profile == null || typeof profile !== "object" || Array.isArray(profile)) {
    return { ok: false, error: "ApplyLayout: profile required (object)" };
  }
  const flagsIn =
    obj.flags && typeof obj.flags === "object" && !Array.isArray(obj.flags) ? obj.flags : {};
  const flags = {
    clean: flagsIn.clean !== undefined ? !!flagsIn.clean : true,
    keepOthers: !!flagsIn.keepOthers,
    safe: !!flagsIn.safe,
    forceClose: !!flagsIn.forceClose,
    waitTreeStable: !!flagsIn.waitTreeStable,
  };
  const name = obj.name != null && String(obj.name).trim() !== "" ? String(obj.name).trim() : null;
  const hostJobId =
    obj.hostJobId != null && String(obj.hostJobId).trim() !== ""
      ? String(obj.hostJobId).trim()
      : null;
  let workspace = 0;
  if (obj.workspace != null && obj.workspace !== "") {
    const w = Number(obj.workspace);
    if (!Number.isFinite(w) || w < 0) {
      return { ok: false, error: "ApplyLayout: workspace must be >= 0" };
    }
    workspace = Math.floor(w);
  }
  return {
    ok: true,
    request: {
      profile,
      name,
      hostJobId,
      workspace,
      flags,
    },
  };
}

/**
 * @param {string} applyId
 * @returns {object}
 */
export function busyResult(applyId) {
  return {
    ok: false,
    code: "busy",
    error: "apply already running",
    applyId: applyId != null ? String(applyId) : "",
  };
}

/**
 * @param {string} applyId
 * @param {string} [phase]
 * @returns {object}
 */
export function startResult(applyId, phase = "skeleton") {
  return {
    ok: true,
    applyId: String(applyId),
    started: true,
    phase: String(phase || "skeleton"),
  };
}

/**
 * @param {object} p
 * @returns {object}
 */
export function progressPayload(p = {}) {
  return {
    applyId: String(p.applyId ?? ""),
    phase: String(p.phase ?? ""),
    event: String(p.event ?? "info"),
    message: p.message != null ? String(p.message) : "",
    ...(p.counts != null ? { counts: p.counts } : {}),
  };
}

/**
 * @param {object} p
 * @returns {object}
 */
export function donePayload(p = {}) {
  const out = {
    applyId: String(p.applyId ?? ""),
    ok: !!p.ok,
    phase: String(p.phase ?? ""),
  };
  if (p.error != null) out.error = String(p.error);
  if (p.code != null) out.code = String(p.code);
  if (p.result != null) out.result = p.result;
  return out;
}

/**
 * Snapshot of a run for GetLayoutApply.
 * @param {object|null} run
 * @returns {object}
 */
export function snapshotRun(run) {
  if (!run) {
    return { ok: true, live: false, applyId: null, phase: null, terminal: null };
  }
  return {
    ok: true,
    live: !!run.live,
    applyId: run.applyId,
    phase: run.phase,
    name: run.name ?? null,
    hostJobId: run.hostJobId ?? null,
    cancelRequested: !!run.cancelRequested,
    terminal: run.terminal ?? null,
    startedAt: run.startedAt ?? null,
  };
}

/**
 * Single-flight ApplyLayout run bag. Stub walks phases; AL5+ executes real work.
 *
 * Disconnect does **not** cancel. CancelLayoutApply sets cancelRequested;
 * cooperative stop at next phase boundary.
 */
export class LayoutApplyRunBag {
  /**
   * @param {object} [opts]
   * @param {(delayMs: number, cb: () => void) => number|string} [opts.schedule]
   * @param {(id: number|string) => void} [opts.cancel]
   * @param {(payload: object) => void} [opts.onProgress]
   * @param {(payload: object) => void} [opts.onDone]
   * @param {(ctx: { applyId: string, name: string|null, hardMs: number }) => void} [opts.onChromeShow]
   * @param {(ctx: { applyId: string, reason: string }) => void} [opts.onChromeClear]
   * @param {(ctx: { applyId: string, phase: string }) => void} [opts.onPhaseEnter]
   * @param {() => number} [opts.nowMs]
   * @param {number} [opts.phaseDelayMs] delay between stub phases (0 in tests)
   * @param {number} [opts.hardMs] chrome hard-clear for this run
   * @param {string[]} [opts.phases]
   */
  constructor(opts = {}) {
    this._schedule = typeof opts.schedule === "function" ? opts.schedule : null;
    this._cancelTimer = typeof opts.cancel === "function" ? opts.cancel : null;
    this._onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    this._onDone = typeof opts.onDone === "function" ? opts.onDone : null;
    this._onChromeShow = typeof opts.onChromeShow === "function" ? opts.onChromeShow : null;
    this._onChromeClear = typeof opts.onChromeClear === "function" ? opts.onChromeClear : null;
    this._onPhaseEnter = typeof opts.onPhaseEnter === "function" ? opts.onPhaseEnter : null;
    this._nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
    this._phaseDelayMs =
      typeof opts.phaseDelayMs === "number" && opts.phaseDelayMs >= 0 ? opts.phaseDelayMs : 0;
    this._hardMs =
      typeof opts.hardMs === "number" && opts.hardMs > 0 ? opts.hardMs : LAYOUT_APPLY_RUN_HARD_MS;
    this._phases =
      Array.isArray(opts.phases) && opts.phases.length ? opts.phases : APPLY_LAYOUT_PHASES;

    /** @type {object|null} live run */
    this._live = null;
    /** @type {object|null} last terminal snapshot */
    this._lastTerminal = null;
    /** @type {number|string|null} */
    this._stepTimer = null;
    this._disposed = false;
  }

  get live() {
    return this._live;
  }

  get lastTerminal() {
    return this._lastTerminal;
  }

  get disposed() {
    return !!this._disposed;
  }

  /**
   * @param {object} request parsed request
   * @returns {object} startResult or busyResult or error
   */
  start(request) {
    if (this._disposed) {
      return { ok: false, error: "ApplyLayout: session disposed" };
    }
    if (this._live?.live) {
      return busyResult(this._live.applyId);
    }
    const applyId = newApplyId();
    const phase0 = this._phases[0] || "skeleton";
    const run = {
      applyId,
      live: true,
      phase: phase0,
      phaseIndex: 0,
      name: request?.name ?? null,
      hostJobId: request?.hostJobId ?? null,
      workspace: request?.workspace ?? 0,
      flags: request?.flags ?? {},
      profile: request?.profile ?? null,
      cancelRequested: false,
      startedAt: this._nowMs(),
      terminal: null,
      batchBegun: false,
    };
    this._live = run;

    try {
      this._onChromeShow?.({
        applyId,
        name: run.name,
        hardMs: this._hardMs,
      });
    } catch (e) {
      Logger.warn(`layout-apply-run chrome show: ${e}`);
    }

    this._emitProgress({
      applyId,
      phase: phase0,
      event: "enter",
      message: `enter ${phase0}`,
    });
    try {
      this._onPhaseEnter?.({ applyId, phase: phase0 });
    } catch (e) {
      Logger.warn(`layout-apply-run phase enter: ${e}`);
    }

    this._scheduleNextStep();
    return startResult(applyId, phase0);
  }

  /**
   * @param {string} [applyIdOrEmpty]
   * @returns {object}
   */
  get(applyIdOrEmpty) {
    const want = applyIdOrEmpty != null ? String(applyIdOrEmpty).trim() : "";
    if (this._live?.live) {
      if (!want || want === this._live.applyId) {
        return snapshotRun(this._live);
      }
      return {
        ok: false,
        error: "unknown applyId",
        applyId: want,
        live: false,
      };
    }
    if (this._lastTerminal) {
      if (!want || want === this._lastTerminal.applyId) {
        return {
          ...snapshotRun({
            ...this._lastTerminal,
            live: false,
            terminal: this._lastTerminal.terminal,
          }),
          terminal: this._lastTerminal.terminal,
        };
      }
      return {
        ok: false,
        error: "unknown applyId",
        applyId: want,
        live: false,
      };
    }
    return snapshotRun(null);
  }

  /**
   * @param {string} applyId
   * @returns {object}
   */
  cancel(applyId) {
    const id = applyId != null ? String(applyId).trim() : "";
    if (!this._live?.live) {
      return { ok: false, error: "no live apply", applyId: id || null };
    }
    if (id && id !== this._live.applyId) {
      return {
        ok: false,
        error: "applyId mismatch",
        applyId: this._live.applyId,
      };
    }
    this._live.cancelRequested = true;
    return {
      ok: true,
      cancelRequested: true,
      applyId: this._live.applyId,
    };
  }

  /**
   * Session disable / bag dispose: cancel live, clear chrome, drop timers.
   */
  dispose() {
    this._disposed = true;
    if (this._live?.live) {
      this._live.cancelRequested = true;
      this._finish(false, {
        phase: this._live.phase,
        error: "session disposed",
        code: "disposed",
      });
    } else {
      this._clearStepTimer();
    }
  }

  // --- internal ---

  _clearStepTimer() {
    if (this._stepTimer != null && this._cancelTimer) {
      try {
        this._cancelTimer(this._stepTimer);
      } catch (_e) {
        /* */
      }
    }
    this._stepTimer = null;
  }

  _scheduleNextStep() {
    this._clearStepTimer();
    if (!this._live?.live) return;
    const tick = () => {
      this._stepTimer = null;
      this._advance();
    };
    if (!this._schedule) {
      // No scheduler: stay on current phase until cancel/dispose or inject
      // a scheduler. Unit tests use an explicit queue schedule.
      return;
    }
    this._stepTimer = this._schedule(this._phaseDelayMs, tick);
  }

  /**
   * Test helper: run one phase step when no external schedule is used.
   * @returns {boolean} true if a live run advanced
   */
  stepOnce() {
    if (!this._live?.live) return false;
    this._advance();
    return true;
  }

  /**
   * Test helper: drain until terminal or maxSteps.
   * @param {number} [maxSteps=64]
   */
  drain(maxSteps = 64) {
    let n = 0;
    while (this._live?.live && n < maxSteps) {
      this._advance();
      n += 1;
    }
  }

  _advance() {
    const run = this._live;
    if (!run?.live) return;

    if (run.cancelRequested) {
      this._finish(false, {
        phase: run.phase,
        error: "cancelled",
        code: "cancel",
      });
      return;
    }

    const idx = run.phaseIndex;
    const phase = this._phases[idx];
    if (phase) {
      this._emitProgress({
        applyId: run.applyId,
        phase,
        event: "leave",
        message: `leave ${phase}`,
      });
    }

    const next = idx + 1;
    if (next >= this._phases.length) {
      this._finish(true, {
        phase: "verify",
        result: { stub: true, phases: this._phases.slice() },
      });
      return;
    }

    const nextPhase = this._phases[next];
    run.phaseIndex = next;
    run.phase = nextPhase;
    this._emitProgress({
      applyId: run.applyId,
      phase: nextPhase,
      event: "enter",
      message: `enter ${nextPhase}`,
    });
    try {
      this._onPhaseEnter?.({ applyId: run.applyId, phase: nextPhase });
    } catch (e) {
      Logger.warn(`layout-apply-run phase enter: ${e}`);
    }
    this._scheduleNextStep();
  }

  _emitProgress(p) {
    const payload = progressPayload(p);
    try {
      this._onProgress?.(payload);
    } catch (e) {
      Logger.warn(`layout-apply-run onProgress: ${e}`);
    }
  }

  /**
   * @param {boolean} ok
   * @param {object} opts
   */
  _finish(ok, opts = {}) {
    this._clearStepTimer();
    const run = this._live;
    if (!run) return;
    const phase = opts.phase != null ? String(opts.phase) : run.phase;
    const terminal = donePayload({
      applyId: run.applyId,
      ok,
      phase,
      error: opts.error,
      code: opts.code,
      result: opts.result,
    });
    run.live = false;
    run.phase = phase;
    run.terminal = terminal;
    this._lastTerminal = {
      applyId: run.applyId,
      live: false,
      phase,
      name: run.name,
      hostJobId: run.hostJobId,
      cancelRequested: run.cancelRequested,
      startedAt: run.startedAt,
      terminal,
    };
    this._live = null;

    try {
      this._onChromeClear?.({
        applyId: terminal.applyId,
        reason: ok ? "done" : opts.code || "error",
      });
    } catch (e) {
      Logger.warn(`layout-apply-run chrome clear: ${e}`);
    }

    try {
      this._onDone?.(terminal);
    } catch (e) {
      Logger.warn(`layout-apply-run onDone: ${e}`);
    }
  }
}
