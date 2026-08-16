/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyLayout run bag (AL4–AL7): single-flight apply + DBus shapes.
 * Structure: snapshot → planReconcile → RunSteps (no _layoutOp).
 * Open: spawn + PlaceNext + map-pin on signals + residual replan.
 * Settle: hard-ready / focus / soft / verify / D014 belt on Meta signals.
 * Plan: agents/plans/forge-layout-in-process.md · D038
 */

import { Logger } from "../shared/logger.js";
import {
  buildStructurePlan,
  partitionStepsByPhase,
  phaseHasStructureWork,
  stepsForPhase,
} from "./layout-apply-structure.js";
import { applyOpenResultToRun, startOpenPhase } from "./layout-apply-open.js";
import {
  HARD_TIMEOUT_MS,
  COLD_FOCUS_SOFT_FLOOR_MS,
  HeuristicsMemorySession,
  applyFocusSteps,
  collectHardReadyWindowIds,
  focusActionWindowId,
  focusActionsFromRun,
  focusActionsStillNeeded,
  recordSoftFocusHeuristics,
  resolveFocusSoftTimeoutMs,
  resolveSettleHost,
  runBeltMovesOnly,
  runBeltStructureRebind,
  runSoftFocusBarrierOnSignals,
  verifyFocusOnce,
  waitHardReadyOnSignals,
  waitTreeFingerprintQuietOnSignals,
  wmClassesForWindowIds,
  windowsFromForest,
} from "./layout-apply-settle.js";

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
 * Single-flight ApplyLayout run bag.
 *
 * With `structure` deps: snapshot → plan → phase RunSteps (AL5).
 * Without: phase walk only (unit tests / pre-structure).
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
   * @param {number} [opts.phaseDelayMs] delay between phases (0 in tests)
   * @param {number} [opts.hardMs] chrome hard-clear for this run
   * @param {string[]} [opts.phases]
   * @param {{
   *   snapshotForest: (run: object) => object,
   *   runSteps: (steps: object[], ctx: { phase: string, run: object }) =>
   *     { ok: boolean, error?: string, results?: object[] },
   * }} [opts.structure] AL5 structure executor hooks
   * @param {object} [opts.open] AL6 spawn / PlaceNext / admit / waitPins hooks
   * @param {object} [opts.settle] AL7 hard/soft/verify/belt hooks
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
    this._structure =
      opts.structure &&
      typeof opts.structure.snapshotForest === "function" &&
      typeof opts.structure.runSteps === "function"
        ? opts.structure
        : null;
    this._open = opts.open && typeof opts.open === "object" ? opts.open : null;
    this._settle = opts.settle && typeof opts.settle === "object" ? opts.settle : null;
    this._heuristics = null;

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
      structureBuilt: null,
      structureBuckets: null,
      executedSteps: [],
      openHeld: false,
      openRan: false,
      rolePins: null,
      openLaunched: 0,
      openMissing: [],
      settleHeld: false,
      settleWaited: false,
      hardReadyRan: false,
      softRan: false,
      verifyRan: false,
      verifyCorrected: false,
      treeStableRan: false,
      focusCallAt: null,
      hardReady: null,
      soft: null,
      verify: null,
      belt: null,
      heuristicsFlush: null,
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

    // Structure work on enter (skeleton plans here); fail → terminal Done.
    const work = this._runPhaseWork(run, phase0);
    if (!work.ok) {
      this._finish(false, {
        phase: work.phase || phase0,
        error: work.error || "structure phase failed",
        code: work.code || "structure-error",
      });
      return startResult(applyId, phase0);
    }
    if (!work.hold) this._scheduleNextStep();
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
    if (run.settleHeld || run.openHeld) return;

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
      this._finishSpine(run);
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

    const work = this._runPhaseWork(run, nextPhase);
    if (!work.ok) {
      this._finish(false, {
        phase: work.phase || nextPhase,
        error: work.error || "structure phase failed",
        code: work.code || "structure-error",
      });
      return;
    }
    if (!work.hold) this._scheduleNextStep();
  }

  /**
   * AL5: plan once on skeleton, run phase steps via structure.runSteps.
   * Without structure deps, no-op (phase walk only).
   * @param {object} run
   * @param {string} phase
   * @returns {{ ok: true } | { ok: false, error: string, code?: string, phase?: string }}
   */
  _runPhaseWork(run, phase) {
    if (!this._structure || !run) return { ok: true };

    if (!run.structureBuilt) {
      let forest;
      try {
        forest = this._structure.snapshotForest(run);
      } catch (e) {
        return {
          ok: false,
          error: `snapshot forest: ${e?.message || e}`,
          code: "snapshot-error",
          phase: "skeleton",
        };
      }
      if (forest == null || typeof forest !== "object" || Array.isArray(forest)) {
        return {
          ok: false,
          error: "snapshotForest must return a forest object",
          code: "snapshot-error",
          phase: "skeleton",
        };
      }

      const built = buildStructurePlan(run.profile, forest, run.flags || {}, {
        workspace: run.workspace ?? 0,
        forceClose: !!(run.flags && run.flags.forceClose),
      });
      if (!built.ok) {
        return {
          ok: false,
          error: built.error,
          code: built.code || "plan-failed",
          phase: built.phase || "skeleton",
        };
      }
      run.structureBuilt = built;
      run.structureBuckets = partitionStepsByPhase(built.steps);

      this._emitProgress({
        applyId: run.applyId,
        phase: phase || "skeleton",
        event: "info",
        message: `plan ok actions=${
          Array.isArray(built.plan?.actions) ? built.plan.actions.length : 0
        } steps=${built.steps.length} open=${built.openCount}`,
        counts: built.plan?.counts,
      });
      if (built.openCount > 0 && !this._hasOpenExecutor()) {
        this._emitProgress({
          applyId: run.applyId,
          phase: phase || "skeleton",
          event: "info",
          message: `open deferred (AL6): ${built.openCount} role(s) need launch/map`,
        });
      }
    }

    if (phase === "hard-ready" && this._openShouldFail(run)) {
      return this._openFailResult(run);
    }

    if (phase === "hard-ready") return this._runHardReadyPhase(run);
    if (phase === "soft") return this._runSoftPhase(run);
    if (phase === "verify") return this._runVerifyPhase(run);

    if (!phaseHasStructureWork(phase)) {
      return { ok: true };
    }

    if (phase === "open") {
      const opened = this._runOpenPhase(run);
      if (opened.hold || !opened.ok) return opened;
    }

    const buckets = run.structureBuckets || partitionStepsByPhase([]);
    const steps = stepsForPhase(buckets, phase);
    if (!steps.length) {
      if (phase === "focus") run.focusCallAt = this._nowMs();
      this._maybeUnwrapMonDegenerate(phase);
      return { ok: true };
    }

    this._emitProgress({
      applyId: run.applyId,
      phase,
      event: "info",
      message: `run ${steps.length} step(s)`,
    });

    let result;
    try {
      result = this._structure.runSteps(steps, { phase, run });
    } catch (e) {
      return {
        ok: false,
        error: `runSteps: ${e?.message || e}`,
        code: "steps-error",
        phase,
      };
    }

    if (result && result.ok === false) {
      return {
        ok: false,
        error: result.error != null ? String(result.error) : `${phase} steps failed`,
        code: result.code || "steps-failed",
        phase,
      };
    }

    if (Array.isArray(run.executedSteps)) {
      for (const s of steps) run.executedSteps.push(s);
    }
    if (phase === "focus") run.focusCallAt = this._nowMs();
    this._maybeUnwrapMonDegenerate(phase);
    return { ok: true };
  }

  /**
   * Collapse mon-direct 1-child H/V after order/size (D032 leftover lone VSPLIT).
   * @param {string} phase
   */
  _maybeUnwrapMonDegenerate(phase) {
    const p = String(phase || "")
      .trim()
      .toLowerCase();
    if (p !== "order" && p !== "size") return;
    try {
      this._structure?.unwrapMonDegenerate?.();
    } catch (e) {
      Logger.debug?.(`layout-apply unwrapMonDegenerate: ${e}`);
    }
  }

  _hasSettle() {
    return !!this._settle;
  }

  _settleSchedule() {
    return this._settle?.schedule || this._schedule;
  }

  _settleCancel() {
    return this._settle?.cancel || this._cancelTimer;
  }

  _ensureHeuristics() {
    if (this._heuristics) return this._heuristics;
    if (!this._settle) return null;
    this._heuristics = new HeuristicsMemorySession({
      read: this._settle.readHeuristics,
      write: this._settle.writeHeuristics,
    });
    return this._heuristics;
  }

  _snapshotForSettle(run) {
    if (typeof this._settle?.snapshotForest === "function") {
      return this._settle.snapshotForest(run);
    }
    if (this._structure && typeof this._structure.snapshotForest === "function") {
      return this._structure.snapshotForest(run);
    }
    return null;
  }

  _loadSettleWindows(run) {
    if (typeof this._settle?.loadWindows === "function") {
      return this._settle.loadWindows(run) || [];
    }
    const forest = this._snapshotForSettle(run);
    return windowsFromForest(forest);
  }

  _settleHost() {
    if (typeof this._settle?.resolveHost === "function") {
      return resolveSettleHost({ host: this._settle.resolveHost() });
    }
    return resolveSettleHost({});
  }

  _runFocusCorrect(run, needed, phase) {
    const runSteps =
      this._settle?.runSteps ||
      (this._structure ? (steps, ctx) => this._structure.runSteps(steps, ctx) : null);
    return applyFocusSteps(needed, runSteps, {
      workspace: run.workspace ?? 0,
      forceClose: !!(run.flags && run.flags.forceClose),
      phase,
      run,
    });
  }

  /**
   * Hard-ready: Meta TILE/rect/mon signals + 5s call clock. Timeout warns.
   * @param {object} run
   */
  _runHardReadyPhase(run) {
    if (run.hardReadyRan) return { ok: true };
    if (!this._hasSettle()) {
      run.hardReadyRan = true;
      run.hardReady = { skipped: true, reason: "no-settle-deps" };
      return { ok: true };
    }

    const ids = collectHardReadyWindowIds(run);
    if (!ids.length) {
      run.hardReadyRan = true;
      run.hardReady = { ok: true, skipped: true, settled: [], pending: [] };
      this._emitProgress({
        applyId: run.applyId,
        phase: "hard-ready",
        event: "info",
        message: "hard-ready skip (no TILE/rect/mon targets)",
      });
      return { ok: true };
    }

    run.settleWaited = true;
    let completed = null;
    waitHardReadyOnSignals(
      ids,
      {
        loadWindows: () => this._loadSettleWindows(run),
        onWindowEvent: this._settle.onWindowEvent,
        schedule: this._settleSchedule(),
        cancel: this._settleCancel(),
        isCancelled: () => !!(run.cancelRequested || this._disposed || this._live !== run),
        nowMs: this._nowMs,
        timeoutMs: this._settle.hardTimeoutMs ?? HARD_TIMEOUT_MS,
        callStartedMs: this._nowMs(),
      },
      (out) => {
        completed = out;
        if (run.settleHeld) this._resumeAfterSettle(run, "hard-ready", out);
      }
    );

    if (completed) {
      return this._applyHardReadyResult(run, completed);
    }
    run.settleHeld = true;
    return { ok: true, hold: true };
  }

  _applyHardReadyResult(run, out) {
    run.hardReadyRan = true;
    run.hardReady = out || { ok: true };
    if (out?.cancelled || out?.code === "cancel") {
      return { ok: false, error: out.error || "cancelled", code: "cancel", phase: "hard-ready" };
    }
    if (out && out.ok === false) {
      this._emitProgress({
        applyId: run.applyId,
        phase: "hard-ready",
        event: "warn",
        message: `hard-ready timeout pending ${(out.pending || []).join(",") || "?"} (continuing)`,
      });
      return { ok: true };
    }
    this._emitProgress({
      applyId: run.applyId,
      phase: "hard-ready",
      event: "info",
      message: `hard-ready ${(out.settled || []).length} window(s)`,
    });
    return { ok: true };
  }

  /**
   * Soft residual: settle-math quiet; steal → pin restore + reset quiet.
   * Structure + focus already applied — drop apply chrome before the quiet wait
   * so the reactive scrim/spinner do not block tab clicks during soft residual
   * (can be multi-second with pin floor / corrections).
   * @param {object} run
   */
  _runSoftPhase(run) {
    if (run.softRan) return { ok: true };
    if (!this._hasSettle()) {
      run.softRan = true;
      run.soft = { skipped: true, reason: "no-settle-deps" };
      // R027: chrome through structure/focus only — soft residual is non-blocking.
      this._clearChrome(run, "soft-skip");
      return { ok: true };
    }

    const focusActs = focusActionsFromRun(run);
    if (!focusActs.length) {
      run.softRan = true;
      run.soft = { ok: true, skipped: true, reason: "no-focus" };
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "info",
        message: "soft skip (no focus actions)",
      });
      this._clearChrome(run, "soft-skip");
      return { ok: true };
    }

    const session = this._ensureHeuristics();
    const store = session ? session.store() : { version: 1, entries: {} };
    const host = this._settleHost();
    const wins = this._loadSettleWindows(run);
    const focusIds = [];
    for (const a of focusActs) {
      const id = focusActionWindowId(a);
      if (id) focusIds.push(id);
    }
    const wmClasses = wmClassesForWindowIds(wins, focusIds);
    let softMs = resolveFocusSoftTimeoutMs(store, { host, wmClasses });
    const pinIds = Object.values(run.rolePins || {}).filter((v) => v != null && String(v).trim());
    if (pinIds.length) softMs = Math.max(softMs, COLD_FOCUS_SOFT_FLOOR_MS);
    if (this._settle.softTimeoutMs != null)
      softMs = Math.max(0, Number(this._settle.softTimeoutMs) || 0);

    run.settleWaited = true;
    run.softWmClasses = wmClasses;
    run.softHost = host;
    // Drop spinner/scrim before quiet wait — soft residual must not block tabs.
    this._clearChrome(run, "soft-enter");
    this._emitProgress({
      applyId: run.applyId,
      phase: "soft",
      event: "info",
      message: `soft quiet ${softMs}ms (chrome cleared)`,
    });

    let completed = null;
    runSoftFocusBarrierOnSignals(
      {
        checkNeeded: () => {
          const forest = this._snapshotForSettle(run);
          return forest ? focusActionsStillNeeded(forest, focusActs) : [];
        },
        applyCorrect: (needed) => {
          const r = this._runFocusCorrect(run, needed, "soft");
          if (r && r.ok === false) throw new Error(r.error || "soft correct failed");
        },
        restorePin: this._settle.restorePin,
        onFocusEvent: this._settle.onFocusEvent || this._settle.onWindowEvent,
        schedule: this._settleSchedule(),
        cancel: this._settleCancel(),
        isCancelled: () => !!(run.cancelRequested || this._disposed || this._live !== run),
        nowMs: this._nowMs,
        softTimeoutMs: softMs,
        callStartedMs: run.focusCallAt != null ? run.focusCallAt : this._nowMs(),
      },
      (out) => {
        completed = out;
        if (run.settleHeld) this._resumeAfterSettle(run, "soft", out);
      }
    );

    if (completed) {
      return this._applySoftResult(run, completed);
    }
    run.settleHeld = true;
    return { ok: true, hold: true };
  }

  _applySoftResult(run, out) {
    run.softRan = true;
    run.soft = out || { ok: true };
    if (out?.cancelled) {
      return { ok: false, error: out.error || "cancelled", code: "cancel", phase: "soft" };
    }
    const session = this._ensureHeuristics();
    recordSoftFocusHeuristics(session, {
      host: run.softHost || this._settleHost(),
      wmClasses: run.softWmClasses || ["unknown"],
      residuals: out?.residuals || [],
      softSettled: !!(out && out.softSettled),
    });
    if (out && out.ok === false && !out.timedOut) {
      return {
        ok: false,
        error: out.error || "soft barrier failed",
        code: "soft-error",
        phase: "soft",
      };
    }
    if (out && out.timedOut) {
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "warn",
        message: out.error || "soft wall timeout (continuing to verify)",
      });
    } else {
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "info",
        message: `soft settled corrections=${out?.corrections || 0}`,
      });
    }
    // Chrome usually already cleared at soft-enter; keep idempotent path.
    this._clearChrome(run, "soft");
    return { ok: true };
  }

  /**
   * Drop apply chrome once per run (soft-enter / soft-skip / terminal). Idempotent.
   * @param {object} run
   * @param {string} reason
   */
  _clearChrome(run, reason) {
    if (!run || run.chromeCleared) return;
    run.chromeCleared = true;
    const why = reason || "done";
    try {
      Logger.info(
        `layout-apply-run chrome clear reason=${why} applyId=${run.applyId || "?"} phase=${
          run.phase || "?"
        }`
      );
      this._onChromeClear?.({
        applyId: run.applyId,
        reason: why,
      });
    } catch (e) {
      Logger.warn(`layout-apply-run chrome clear: ${e}`);
    }
  }

  /**
   * Verify once (correct at most once) + optional LF6 + D014 belt.
   * @param {object} run
   */
  _runVerifyPhase(run) {
    if (run.flags && run.flags.waitTreeStable && this._hasSettle() && !run.treeStableRan) {
      return this._runTreeStablePhase(run);
    }
    return this._runVerifyOnceAndBelt(run);
  }

  _runTreeStablePhase(run) {
    run.settleWaited = true;
    this._emitProgress({
      applyId: run.applyId,
      phase: "verify",
      event: "info",
      message: "waitTreeStable (opt-in LF6 fingerprint quiet)",
    });
    let completed = null;
    waitTreeFingerprintQuietOnSignals(
      {
        loadWindows: () => this._loadSettleWindows(run),
        onWindowEvent: this._settle.onWindowEvent,
        schedule: this._settleSchedule(),
        cancel: this._settleCancel(),
        isCancelled: () => !!(run.cancelRequested || this._disposed || this._live !== run),
        nowMs: this._nowMs,
        callStartedMs: this._nowMs(),
      },
      (out) => {
        completed = out;
        if (run.settleHeld) this._resumeAfterSettle(run, "verify-stable", out);
      }
    );
    if (completed) {
      run.treeStableRan = true;
      run.treeStable = completed;
      if (completed.cancelled) {
        return { ok: false, error: "cancelled", code: "cancel", phase: "verify" };
      }
      return this._runVerifyOnceAndBelt(run);
    }
    run.settleHeld = true;
    return { ok: true, hold: true };
  }

  _runVerifyOnceAndBelt(run) {
    if (!run.verifyRan) {
      const focusActs = focusActionsFromRun(run);
      if (!this._hasSettle() || !focusActs.length) {
        run.verify = {
          ok: true,
          skipped: true,
          reason: this._hasSettle() ? "no-focus" : "no-settle-deps",
        };
      } else {
        let forest = null;
        try {
          forest = this._snapshotForSettle(run);
        } catch (e) {
          return {
            ok: false,
            error: `verify snapshot: ${e?.message || e}`,
            code: "snapshot-error",
            phase: "verify",
          };
        }
        const v = verifyFocusOnce({
          forest,
          focusActions: focusActs,
          applyCorrect: (needed) => this._runFocusCorrect(run, needed, "verify"),
        });
        run.verify = v;
        run.verifyCorrected = !!v.corrected;
        if (!v.ok) {
          return {
            ok: false,
            error: v.error || "verify failed",
            code: "verify-error",
            phase: "verify",
          };
        }
        this._emitProgress({
          applyId: run.applyId,
          phase: "verify",
          event: "info",
          message: v.skipped ? "verify match" : `verify corrected ${v.neededCount} focus action(s)`,
        });
      }
      run.verifyRan = true;
    }

    if (run.belt != null) return { ok: true };
    const pins = run.rolePins && typeof run.rolePins === "object" ? run.rolePins : {};
    if (!this._hasSettle() || !Object.keys(pins).length) {
      run.belt = {
        ok: true,
        skipped: true,
        reason: this._hasSettle() ? "no-pins" : "no-settle-deps",
      };
      run.beltStructure = { ok: true, skipped: true, reason: run.belt.reason };
      try {
        this._structure?.unwrapMonDegenerate?.();
      } catch (e) {
        Logger.debug?.(`layout-apply unwrapMonDegenerate: ${e}`);
      }
      return { ok: true };
    }

    let forest;
    try {
      forest = this._snapshotForSettle(run);
    } catch (e) {
      return {
        ok: false,
        error: `belt snapshot: ${e?.message || e}`,
        code: "snapshot-error",
        phase: "verify",
      };
    }
    const runSteps =
      this._settle?.runSteps ||
      (this._structure ? (steps, ctx) => this._structure.runSteps(steps, ctx) : null);
    const belt = runBeltMovesOnly({
      profile: run.profile,
      forest,
      flags: run.flags || {},
      rolePins: pins,
      workspace: run.workspace ?? 0,
      forceClose: !!(run.flags && run.flags.forceClose),
      runSteps,
    });
    run.belt = belt;
    if (!belt.ok) {
      return {
        ok: false,
        error: belt.error || "belt moves failed",
        code: "belt-error",
        phase: "verify",
      };
    }
    if (!belt.skipped) {
      this._emitProgress({
        applyId: run.applyId,
        phase: "verify",
        event: "info",
        message: `belt ${belt.steps} move(s)`,
      });
      // R013 / R036: mon-root pin moves flatten TABBED; rebind structure once.
      const beltStruct = runBeltStructureRebind({
        profile: run.profile,
        flags: run.flags || {},
        rolePins: pins,
        workspace: run.workspace ?? 0,
        forceClose: !!(run.flags && run.flags.forceClose),
        runSteps,
        snapshotForest: () => this._snapshotForSettle(run),
      });
      run.beltStructure = beltStruct;
      if (!beltStruct.ok) {
        return {
          ok: false,
          error: beltStruct.error || "belt structure rebind failed",
          code: "belt-structure-error",
          phase: "verify",
        };
      }
      if (!beltStruct.skipped) {
        const n = (beltStruct.placeSteps || 0) + (beltStruct.structureSteps || 0);
        this._emitProgress({
          applyId: run.applyId,
          phase: "verify",
          event: "info",
          message: `beltStructure ${n} step(s)`,
        });
      }
    } else {
      run.beltStructure = { ok: true, skipped: true, reason: "no-belt-moves" };
    }
    try {
      this._structure?.unwrapMonDegenerate?.();
    } catch (e) {
      Logger.debug?.(`layout-apply unwrapMonDegenerate: ${e}`);
    }
    return { ok: true };
  }

  _resumeAfterSettle(run, kind, out) {
    if (!run?.live || this._live !== run) return;
    run.settleHeld = false;
    if (kind === "hard-ready") {
      const work = this._applyHardReadyResult(run, out);
      if (!work.ok) {
        this._finish(false, {
          phase: work.phase || "hard-ready",
          error: work.error || "hard-ready failed",
          code: work.code || "hard-ready-error",
        });
        return;
      }
      this._scheduleNextStep();
      return;
    }
    if (kind === "soft") {
      const work = this._applySoftResult(run, out);
      if (!work.ok) {
        this._finish(false, {
          phase: work.phase || "soft",
          error: work.error || "soft failed",
          code: work.code || "soft-error",
        });
        return;
      }
      this._scheduleNextStep();
      return;
    }
    if (kind === "verify-stable") {
      run.treeStableRan = true;
      run.treeStable = out;
      if (out?.cancelled) {
        this._finish(false, { phase: "verify", error: "cancelled", code: "cancel" });
        return;
      }
      const work = this._runVerifyOnceAndBelt(run);
      if (!work.ok) {
        this._finish(false, {
          phase: work.phase || "verify",
          error: work.error || "verify failed",
          code: work.code || "verify-error",
        });
        return;
      }
      this._scheduleNextStep();
    }
  }

  _hasOpenExecutor() {
    return !!(this._open && typeof this._open.spawn === "function");
  }

  _openShouldFail(run) {
    if (!run?.openRan) return false;
    const miss = Array.isArray(run.openMissing) ? run.openMissing : [];
    const still = Array.isArray(run.openStillRoles) ? run.openStillRoles : [];
    const fails = Array.isArray(run.openFailures) ? run.openFailures : [];
    return miss.length > 0 || still.length > 0 || fails.length > 0;
  }

  _openFailResult(run) {
    const still = Array.isArray(run.openStillRoles) ? run.openStillRoles : [];
    const miss = Array.isArray(run.openMissing) ? run.openMissing : [];
    const fails = Array.isArray(run.openFailures) ? run.openFailures : [];
    if (still.length) {
      return {
        ok: false,
        error: `roles still missing after launch: ${still.join(",")}`,
        code: "open-miss",
        phase: "open",
      };
    }
    if (fails.length) {
      return {
        ok: false,
        error: `open failed for roles: ${fails.join(",")}`,
        code: "open-fail",
        phase: "open",
      };
    }
    return {
      ok: false,
      error: `map wait timeout for roles: ${miss.join(",")}`,
      code: "open-miss",
      phase: "open",
    };
  }

  /**
   * AL6 open: LayoutBatch begin → spawn/PlaceNext → map wait → release → end
   * → residual planReconcile. Place moves from residual run after.
   * @param {object} run
   * @returns {{ ok: true, hold?: boolean } | { ok: false, error: string, code?: string, phase?: string }}
   */
  _runOpenPhase(run) {
    const openCount = run.structureBuilt?.openCount ?? 0;
    const openActions = run.structureBuilt?.openActions || [];
    if (!openCount || !openActions.length) return { ok: true };
    if (!this._hasOpenExecutor()) {
      this._emitProgress({
        applyId: run.applyId,
        phase: "open",
        event: "info",
        message: `skip open launches (AL6); place moves only if already mapped`,
      });
      return { ok: true };
    }
    if (run.openRan) return { ok: true };

    let completed = null;
    const applyId = run.applyId;
    const started = startOpenPhase({
      openActions,
      workspace: run.workspace ?? 0,
      name: run.name,
      profile: run.profile,
      flags: run.flags || {},
      deps: {
        ...this._open,
        snapshotForest:
          this._open.snapshotForest ||
          (this._structure ? () => this._structure.snapshotForest(run) : undefined),
        schedule: this._open.schedule || this._schedule,
        cancel: this._open.cancel || this._cancelTimer,
      },
      isCancelled: () => !!(run.cancelRequested || this._disposed || this._live !== run),
      onProgress: (p) => {
        this._emitProgress({
          applyId,
          phase: "open",
          event: p?.event || "info",
          message: p?.message || "",
          ...(p?.counts != null ? { counts: p.counts } : {}),
        });
      },
      onComplete: (out) => {
        completed = out;
        if (run.openHeld) this._resumeAfterOpen(run, out);
      },
    });

    if (completed) {
      return this._applyCompletedOpen(run, completed);
    }
    if (started && started.sync) {
      return { ok: true };
    }
    run.openHeld = true;
    return { ok: true, hold: true };
  }

  /**
   * @param {object} run
   * @param {object} out
   */
  _applyCompletedOpen(run, out) {
    if (out?.cancelled || out?.code === "cancel") {
      return {
        ok: false,
        error: out.error || "cancelled",
        code: "cancel",
        phase: "open",
      };
    }
    if (out && out.ok === false) {
      return {
        ok: false,
        error: out.error || "open phase failed",
        code: out.code || "open-error",
        phase: "open",
      };
    }
    if (out?.residual && out.residual.ok === false) {
      return {
        ok: false,
        error: out.residual.error || "re-plan after open failed",
        code: out.residual.code || "replan-error",
        phase: "open",
      };
    }
    applyOpenResultToRun(run, out);
    this._emitProgress({
      applyId: run.applyId,
      phase: "open",
      event: "info",
      message: `open pinned ${Object.keys(run.rolePins || {}).length}/${run.openLaunched || 0}`,
    });
    return { ok: true };
  }

  /**
   * Async map-wait finished: apply residual + continue phases.
   * @param {object} run
   * @param {object} out
   */
  _resumeAfterOpen(run, out) {
    if (!run?.live || this._live !== run) return;
    run.openHeld = false;
    const work = this._applyCompletedOpen(run, out);
    if (!work.ok) {
      this._finish(false, {
        phase: work.phase || "open",
        error: work.error || "open phase failed",
        code: work.code || "open-error",
      });
      return;
    }
    // Residual place moves belong to this open phase.
    const placeWork = this._runPhaseSteps(run, "open");
    if (!placeWork.ok) {
      this._finish(false, {
        phase: placeWork.phase || "open",
        error: placeWork.error || "open place steps failed",
        code: placeWork.code || "steps-error",
      });
      return;
    }
    this._scheduleNextStep();
  }

  /**
   * Run already-bucketed steps for a phase (residual place after replan).
   * @param {object} run
   * @param {string} phase
   */
  _runPhaseSteps(run, phase) {
    if (!this._structure || !run) return { ok: true };
    const buckets = run.structureBuckets || partitionStepsByPhase([]);
    const steps = stepsForPhase(buckets, phase);
    if (!steps.length) {
      this._maybeUnwrapMonDegenerate(phase);
      return { ok: true };
    }
    this._emitProgress({
      applyId: run.applyId,
      phase,
      event: "info",
      message: `run ${steps.length} step(s)`,
    });
    let result;
    try {
      result = this._structure.runSteps(steps, { phase, run });
    } catch (e) {
      return {
        ok: false,
        error: `runSteps: ${e?.message || e}`,
        code: "steps-error",
        phase,
      };
    }
    if (result && result.ok === false) {
      return {
        ok: false,
        error: result.error != null ? String(result.error) : `${phase} steps failed`,
        code: result.code || "steps-failed",
        phase,
      };
    }
    if (Array.isArray(run.executedSteps)) {
      for (const s of steps) run.executedSteps.push(s);
    }
    this._maybeUnwrapMonDegenerate(phase);
    return { ok: true };
  }

  _finishSpine(run) {
    if (this._openShouldFail(run)) {
      const fail = this._openFailResult(run);
      this._finish(false, fail);
      return;
    }
    const built = run.structureBuilt;
    const openCount = run.openRan ? run.openLaunched || 0 : built?.openCount ?? 0;
    const openDeferred = !run.openRan && (built?.openCount ?? 0) > 0;
    this._finish(true, {
      phase: "verify",
      result: {
        structure: !!this._structure,
        phases: this._phases.slice(),
        openCount,
        openDeferred,
        openPinned: run.rolePins ? Object.keys(run.rolePins).length : 0,
        stepsExecuted: Array.isArray(run.executedSteps) ? run.executedSteps.length : 0,
        counts: built?.plan?.counts ?? null,
        hardReady: run.hardReady || null,
        soft: run.soft || null,
        verify: run.verify || null,
        belt: run.belt || null,
      },
    });
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
    const cancelBeforeWait = !ok && opts.code === "cancel" && !run.settleWaited;
    if (this._heuristics && !cancelBeforeWait) {
      try {
        run.heuristicsFlush = this._heuristics.flush();
      } catch (e) {
        run.heuristicsFlush = { persist: "error", persistError: String(e?.message || e) };
      }
    } else if (cancelBeforeWait) {
      run.heuristicsFlush = { persist: "skipped", reason: "cancel-before-wait" };
    }
    if (opts.result && typeof opts.result === "object" && run.heuristicsFlush) {
      opts.result.heuristics = run.heuristicsFlush;
    }
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

    // Soft already cleared on success; still clear on error / early exit.
    this._clearChrome(run, ok ? "done" : opts.code || "error");

    try {
      this._onDone?.(terminal);
    } catch (e) {
      Logger.warn(`layout-apply-run onDone: ${e}`);
    }
  }
}
