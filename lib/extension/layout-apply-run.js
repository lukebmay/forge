/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyLayout run bag (AL4–AL7 + SM4/SM5): single-flight apply + DBus shapes.
 * Product: epoch → materialize forest → slot machines (all-hard) →
 * focus once + soft + verify → forest-match Done → release epoch (D040/L4.6).
 * No mid-open/mid-place focus on the product path. Phase names stay as logs.
 * Plan: agents/plans/forge-layout-slot-machines.md · D038/D040
 */

import { Logger } from "../shared/logger.js";
import { metricsSnapshot, recordApply, recordWarn, scanForestInvariants } from "./metrics.js";
import {
  ASSERT_FAILED_CODE,
  assertApplyForestWorkspace,
  assertionFailed,
} from "../shared/assert.js";
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
  collectHardReadySlotTargets,
  matchRequiredTileSlots,
  mergeWindowSlotContext,
  focusActionWindowId,
  focusActionsFromRun,
  focusActionsStillNeeded,
  recordSoftFocusHeuristics,
  resolveFocusSoftTimeoutMs,
  resolveSettleHost,
  runSoftFocusBarrierOnSignals,
  syncRolePinsFromForest,
  verifyFocusOnce,
  waitTreeFingerprintQuietOnSignals,
  windowSettleFailureReasons,
  wmClassesForWindowIds,
  windowsFromForest,
} from "./layout-apply-settle.js";
import { APPLY_EPOCH_DISPLAYS_CHANGED, cancelErrorForCode } from "./layout-apply-epoch.js";
import {
  collectSlotMachines,
  placeSlotWindows,
  startSlotMachines,
  syncSlotMachineRoleWindowIds,
} from "./layout-apply-slot.js";
import {
  planReconcile,
  planActionsToSteps,
  validateReconcileProfile,
} from "../shared/layout-plan.js";
import { production } from "../shared/production.js";
import { HUNT_TILE_SLOT_FLOAT, huntTileSlotFloat } from "./hunt-logs.js";
import { formatFloatFlagTags } from "../shared/float-reason.js";

/** Settle/jitter line on apply chrome (keep gi-free of layout-apply-chrome). */
const CHROME_JITTER_NOTICE = "Settle jitter detected; check logs.";
const CHROME_SOFT_FAIL_NOTICE = "Settle soft-failure; check logs.";

/**
 * D008 phase names (logs). Product walk is epoch + machines + barriers.
 * SM5: focus/soft only after hard-ready (all slots hard-done or hard-failed).
 */
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
 * True when focus/soft may run: hard-ready finished (or not on this phase list).
 * @param {object|null|undefined} run
 * @param {string[]} [phases]
 * @returns {boolean}
 */
export function focusAfterAllHardAllowed(run, phases = APPLY_LAYOUT_PHASES) {
  const list = Array.isArray(phases) && phases.length ? phases : APPLY_LAYOUT_PHASES;
  if (!list.includes("hard-ready")) return true;
  return !!(run && run.hardReadyRan);
}

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
  const profileIn = obj.profile;
  if (profileIn == null || typeof profileIn !== "object" || Array.isArray(profileIn)) {
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
  // D070: optional override (else bag uses production default).
  if (flagsIn.forestFailsafe === true || flagsIn.forestFailsafe === 1) {
    flags.forestFailsafe = true;
  } else if (flagsIn.forestFailsafe === false || flagsIn.forestFailsafe === 0) {
    flags.forestFailsafe = false;
  }
  // Dev chaos (FORGE_LAYOUT_CHAOS / --chaos) — opt-in only.
  if (flagsIn.chaos === true || flagsIn.chaos === 1) {
    flags.chaos = true;
  }
  if (flagsIn.chaosSeed != null && String(flagsIn.chaosSeed).trim() !== "") {
    flags.chaosSeed = String(flagsIn.chaosSeed).trim();
  }
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
  // Validate + normalize before open/bind (refuse bad shapes; no partial desk).
  let profile;
  try {
    profile = validateReconcileProfile(profileIn);
  } catch (e) {
    const msg = e && e.message != null ? String(e.message) : String(e);
    return { ok: false, error: `ApplyLayout: ${msg}` };
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
   * @param {(active: boolean, run: object) => void} [opts.onApplyLive]
   * @param {(ctx: { applyId: string, name: string|null, hardMs: number }) => void} [opts.onChromeShow]
   * @param {(ctx: { applyId: string, reason: string }) => void} [opts.onChromeClear]
   * @param {(ctx: { applyId: string, notice: string|null }) => void} [opts.onChromeNotice]
   * @param {(ctx: { applyId: string, label: string, status: string }) => void} [opts.onChromeStage]
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
   * @param {object} [opts.settle] AL7 hard/soft/verify hooks
   */
  constructor(opts = {}) {
    this._schedule = typeof opts.schedule === "function" ? opts.schedule : null;
    this._cancelTimer = typeof opts.cancel === "function" ? opts.cancel : null;
    this._onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    this._onDone = typeof opts.onDone === "function" ? opts.onDone : null;
    this._onApplyLive = typeof opts.onApplyLive === "function" ? opts.onApplyLive : null;
    this._onChromeShow = typeof opts.onChromeShow === "function" ? opts.onChromeShow : null;
    this._onChromeClear = typeof opts.onChromeClear === "function" ? opts.onChromeClear : null;
    this._onChromeNotice = typeof opts.onChromeNotice === "function" ? opts.onChromeNotice : null;
    this._onChromeStage = typeof opts.onChromeStage === "function" ? opts.onChromeStage : null;
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
    if (assertionFailed()) {
      return { ok: false, error: "assertion failed", code: ASSERT_FAILED_CODE };
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
      cancelCode: null,
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
      focusRan: false,
      softRan: false,
      verifyRan: false,
      verifyCorrected: false,
      treeStableRan: false,
      focusCallAt: null,
      hardReady: null,
      slotMachines: null,
      soft: null,
      verify: null,
      heuristicsFlush: null,
      metricT0: metricsSnapshot(),
    };
    this._live = run;
    Logger.debug("layout-apply start", {
      fields: {
        applyId,
        name: run.name || "-",
        ws: run.workspace ?? 0,
      },
    });

    try {
      this._onApplyLive?.(true, run);
    } catch (e) {
      Logger.warn(`layout-apply-run onApplyLive enter: ${e}`);
    }

    try {
      this._onChromeShow?.({
        applyId,
        name: run.name,
        hardMs: this._hardMs,
      });
    } catch (e) {
      Logger.warn(`layout-apply-run chrome show: ${e}`);
    }

    this._chromeStage(run, phase0, "pending");
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
   * @param {{ code?: string }} [opts] optional terminal code (e.g. displays-changed)
   * @returns {object}
   */
  cancel(applyId, opts = {}) {
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
    const code =
      opts && opts.code != null && String(opts.code).trim()
        ? String(opts.code).trim()
        : this._live.cancelCode || "cancel";
    this._live.cancelCode = code;
    return {
      ok: true,
      cancelRequested: true,
      applyId: this._live.applyId,
      code,
    };
  }

  /**
   * Terminal fields when cancelRequested (user cancel, displays-changed, …).
   * @param {object} run
   * @param {string} [phase]
   * @returns {{ ok: false, error: string, code: string, phase: string }}
   */
  _cancelOutcome(run, phase) {
    const code = run?.cancelCode || "cancel";
    return {
      ok: false,
      error: cancelErrorForCode(code),
      code,
      phase: phase != null ? String(phase) : run?.phase || "",
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

    if (assertionFailed()) {
      this._finish(false, {
        phase: run.phase,
        error: "assertion failed",
        code: ASSERT_FAILED_CODE,
      });
      return;
    }

    if (run.cancelRequested) {
      const outcome = this._cancelOutcome(run, run.phase);
      this._finish(false, {
        phase: outcome.phase,
        error: outcome.error,
        code: outcome.code,
      });
      return;
    }

    const idx = run.phaseIndex;
    const phase = this._phases[idx];
    if (phase) {
      this._chromeStage(run, phase, "ok");
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
    this._chromeStage(run, nextPhase, "pending");
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
    Logger.trace(`layout-apply phase=${phase} applyId=${run?.applyId || "?"}`);
    if (assertionFailed()) {
      return {
        ok: false,
        error: "assertion failed",
        code: ASSERT_FAILED_CODE,
        phase,
      };
    }
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

      Logger.debug(
        `layout-apply snapshot applyId=${run.applyId} ws=${run.workspace ?? 0} mons=${
          Array.isArray(forest.monitors) ? forest.monitors.length : 0
        } orphans=${Array.isArray(forest.orphanWindows) ? forest.orphanWindows.length : 0}`
      );
      assertApplyForestWorkspace(forest, run.workspace, {
        ws: run.workspace,
        applyId: run.applyId,
      });
      if (assertionFailed()) {
        return {
          ok: false,
          error: "assertion failed",
          code: ASSERT_FAILED_CODE,
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
    // SM5: soft residual after all-hard + focus; not a structure fixer.
    if (phase === "soft") {
      if (!focusAfterAllHardAllowed(run, this._phases)) {
        return {
          ok: false,
          error: "soft before all-hard",
          code: "focus-order",
          phase: "soft",
        };
      }
      return this._runSoftPhase(run);
    }
    if (phase === "verify") return this._runVerifyPhase(run);

    if (!phaseHasStructureWork(phase)) {
      return { ok: true };
    }

    if (phase === "open") {
      const opened = this._runOpenPhase(run);
      if (opened.hold || !opened.ok) return opened;
    }

    // SM5: open leaves + keyboard focus once after all-hard (incl. hard-failed).
    if (phase === "focus") {
      if (!focusAfterAllHardAllowed(run, this._phases)) {
        return {
          ok: false,
          error: "focus before all-hard",
          code: "focus-order",
          phase: "focus",
        };
      }
    }

    const buckets = run.structureBuckets || partitionStepsByPhase([]);
    const steps = stepsForPhase(buckets, phase);
    if (!steps.length) {
      if (phase === "focus") {
        run.focusCallAt = this._nowMs();
        run.focusRan = true;
      }
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
    if (phase === "focus") {
      run.focusCallAt = this._nowMs();
      run.focusRan = true;
    }
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
    let wins;
    if (typeof this._settle?.loadWindows === "function") {
      wins = this._settle.loadWindows(run) || [];
    } else {
      wins = windowsFromForest(this._snapshotForSettle(run));
    }
    return mergeWindowSlotContext(wins, this._snapshotForSettle(run));
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
   * Re-issue this slot's place (clock starts at the act).
   * @param {object} run
   * @param {object} machine
   */
  _placeSlot(run, machine) {
    const forest = this._snapshotForSettle(run);
    const runSteps =
      this._settle?.runSteps ||
      (this._structure ? (steps, ctx) => this._structure.runSteps(steps, ctx) : null);
    const attempt = (machine?.placeAttempts || 0) + 1;
    const out = placeSlotWindows({
      profile: run.profile,
      forest,
      rolePins: run.rolePins,
      flags: run.flags || {},
      workspace: run.workspace ?? 0,
      forceClose: !!(run.flags && run.flags.forceClose),
      machine,
      runSteps,
      phase: "hard-ready",
      run,
      // Retries: forest may already look correct while Meta mode/mon is wrong.
      unsettled: attempt > 1,
      ensureMetaInSlot:
        typeof this._settle?.ensureMetaInSlot === "function"
          ? (m) => this._settle.ensureMetaInSlot(m, run)
          : null,
    });
    const key = machine?.key || machine?.id || "?";
    const n = out?.steps || 0;
    if (attempt > 1) {
      run.settleJitter = true;
      recordWarn("settle-jitter", {
        applyId: run.applyId || "-",
        phase: "hard-ready",
        slot: key,
        attempt,
      });
      this._chromeNotice(run, CHROME_JITTER_NOTICE);
      this._chromeStage(run, "hard-ready", "retry");
    }
    if (HUNT_TILE_SLOT_FLOAT && n === 0 && attempt > 1) {
      huntTileSlotFloat("slot-place-hollow", {
        key,
        attempt,
        windows: (machine?.windowIds || []).join(",") || "-",
      });
    }
    this._emitProgress({
      applyId: run.applyId,
      phase: "hard-ready",
      event: "info",
      message: `slot ${key} place attempt=${(machine.placeAttempts || 0) + 1} steps=${n}`,
    });
    return out;
  }

  _disposeSlotSession(run) {
    const session = run?.slotSession;
    if (!session) return;
    try {
      session.dispose?.();
    } catch (e) {
      Logger.debug?.(`layout-apply-run slot dispose: ${e}`);
    }
    if (run) run.slotSession = null;
  }

  /**
   * Rebind rolePins + machine windowIds to forest identity (late place-hint).
   * @param {object} run
   * @param {object} machine
   * @returns {boolean}
   */
  _refreshSlotMachineIds(run, machine) {
    let forest = null;
    try {
      forest = this._snapshotForSettle(run);
    } catch {
      forest = null;
    }
    if (!forest) return false;
    const sync = syncRolePinsFromForest(run, forest);
    for (const r of sync.remaps || []) {
      Logger.debug(`slot-id remap role=${r.role} ${r.from}→${r.to}`);
      this._emitProgress({
        applyId: run.applyId,
        phase: run.phase || "hard-ready",
        event: "info",
        message: `slot-id remap role=${r.role} ${r.from}→${r.to}`,
      });
    }
    const { slots } = collectHardReadySlotTargets(run, forest);
    const roleToWid = {};
    for (const [wid, target] of Object.entries(slots || {})) {
      if (target?.role != null && String(target.role).trim() !== "") {
        roleToWid[String(target.role)] = String(wid);
      }
    }
    for (const [role, wid] of Object.entries(run.rolePins || {})) {
      if (wid != null && String(wid).trim() !== "" && roleToWid[role] == null) {
        roleToWid[String(role)] = String(wid);
      }
    }
    return syncSlotMachineRoleWindowIds(machine, roleToWid, slots);
  }

  /**
   * DEBUG: name why pending ids fail in-slot (mode / mon / parent / ε).
   * @param {object} machine
   * @param {object[]} windows
   * @param {string[]} pending
   */
  _logSlotPendingWhy(machine, windows, pending) {
    const list = Array.isArray(windows) ? windows : [];
    const slots = machine?.slots && typeof machine.slots === "object" ? machine.slots : {};
    const explain =
      typeof this._settle?.explainWindowFloat === "function"
        ? this._settle.explainWindowFloat.bind(this._settle)
        : null;
    for (const wid of pending || []) {
      const id = String(wid);
      const slot = slots[id] || null;
      const win = list.find((w) => w && typeof w === "object" && String(w.windowId) === id);
      const why = windowSettleFailureReasons(win, slot ? { ...slot, slot } : {});
      const role = slot?.role || machine?.roles?.[0] || "?";
      const key = machine?.key || machine?.id || "-";
      Logger.debug("hard-ready why", {
        fields: {
          id,
          role,
          key,
          why: why.join(","),
        },
      });

      const modeFloat = why.some(
        (w) => String(w).startsWith("mode=") && String(w).includes("FLOAT")
      );
      if (!explain || (!modeFloat && !HUNT_TILE_SLOT_FLOAT)) continue;
      try {
        const info = explain(id);
        if (!info) continue;
        Logger.debug("hard-ready float", {
          fields: {
            id,
            role,
            key,
            float: `${info.action}/${info.reason}`,
            metaMon: info.metaMon ?? "?",
            treeMon: info.treeMon ?? "?",
            forestMode: win?.mode ?? "?",
            forestMon: win?.monitor ?? "?",
          },
        });
        if (HUNT_TILE_SLOT_FLOAT) {
          huntTileSlotFloat("hard-ready", {
            id,
            role,
            key,
            why: why.join(","),
            float: `${info.action}/${info.reason}`,
            metaMon: info.metaMon ?? "?",
            treeMon: info.treeMon ?? "?",
            flags: info.flags || {},
            flagsTag: formatFloatFlagTags(info.flags || {}),
          });
        }
      } catch (_e) {
        /* best-effort diagnostics */
      }
    }
  }

  /**
   * Slot machines: place → in-slot hard → retry N=2. Peers stay independent.
   * Overlay stays through Done (D071) — not cleared at hard/soft barrier.
   * @param {object} run
   */
  _runHardReadyPhase(run) {
    if (run.hardReadyRan) return { ok: true };
    if (!this._hasSettle()) {
      run.hardReadyRan = true;
      run.hardReady = { skipped: true, reason: "no-settle-deps" };
      return { ok: true };
    }

    let forest = this._snapshotForSettle(run);
    syncRolePinsFromForest(run, forest);
    forest = this._snapshotForSettle(run);
    const { ids } = collectHardReadySlotTargets(run, forest);
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

    const machines = collectSlotMachines(run, forest);
    run.slotMachines = machines;
    if (!machines.length) {
      run.hardReadyRan = true;
      run.hardReady = { ok: true, skipped: true, settled: [], pending: [], machines: [] };
      this._emitProgress({
        applyId: run.applyId,
        phase: "hard-ready",
        event: "info",
        message: "hard-ready skip (no required TILE slots)",
      });
      return { ok: true };
    }

    run.settleWaited = true;
    let completed = null;
    const session = startSlotMachines(
      machines,
      {
        placeSlot: (machine) => this._placeSlot(run, machine),
        refreshMachineIds: (machine) => this._refreshSlotMachineIds(run, machine),
        loadWindows: () => this._loadSettleWindows(run),
        onWindowEvent: this._settle.onWindowEvent,
        schedule: this._settleSchedule(),
        cancel: this._settleCancel(),
        isCancelled: () => !!(run.cancelRequested || this._disposed || this._live !== run),
        isEpochLive: () =>
          !!(this._live === run && run.live && !run.cancelRequested && !this._disposed),
        nowMs: this._nowMs,
        firstWaitMs: this._settle.hardTimeoutMs ?? HARD_TIMEOUT_MS,
        retryWaitMs: this._settle.hardRetryTimeoutMs,
        logPendingWhy: (machine, wins, pending) => this._logSlotPendingWhy(machine, wins, pending),
        onLateResume: (machine) => {
          this._emitProgress({
            applyId: run.applyId,
            phase: run.phase || "hard-ready",
            event: "info",
            message: `slot ${machine.key || machine.id} late resume`,
          });
        },
      },
      (out) => {
        completed = out;
        if (run.settleHeld) this._resumeAfterSettle(run, "hard-ready", out);
      }
    );
    run.slotSession = session;

    if (completed) {
      return this._applyHardReadyResult(run, completed);
    }
    run.settleHeld = true;
    return { ok: true, hold: true };
  }

  _applyHardReadyResult(run, out) {
    run.hardReadyRan = true;
    run.hardReady = out || { ok: true };
    if (out?.machines) run.slotMachines = out.machines;
    if (out?.cancelled || out?.code === "cancel" || out?.code === APPLY_EPOCH_DISPLAYS_CHANGED) {
      // Terminal finish clears with cancel/error — not all-hard.
      const outcome = this._cancelOutcome(run, "hard-ready");
      return {
        ok: false,
        error: out.error || outcome.error,
        code: run.cancelCode || out.code || outcome.code,
        phase: "hard-ready",
      };
    }
    if (out && out.ok === false) {
      run.settleJitter = true;
      run.hardPending = Array.isArray(out.pending) ? out.pending.slice() : [];
      recordWarn("settle-jitter", {
        applyId: run.applyId || "-",
        phase: "hard-ready",
        pending: run.hardPending.join(",") || "-",
        event: "hard-pending",
      });
      this._chromeNotice(run, CHROME_JITTER_NOTICE);
      this._chromeStage(run, "hard-ready", "fail");
      this._emitProgress({
        applyId: run.applyId,
        phase: "hard-ready",
        event: "warn",
        message: `hard-ready pending ${run.hardPending.join(",") || "?"} (not success)`,
      });
      // Continue spine; Done.ok is required-forest match. Chrome clears after soft.
      return { ok: true };
    }
    run.hardPending = [];
    this._chromeStage(run, "hard-ready", "ok");
    this._emitProgress({
      applyId: run.applyId,
      phase: "hard-ready",
      event: "info",
      message: `hard-ready ${(out.settled || []).length} window(s)`,
    });
    return { ok: true };
  }

  /**
   * Soft residual (D019 SE3): settle-math quiet; steal → pin restore + reset quiet.
   * After all-hard + focus. Chrome stays until Done (D071) so jitter/soft notices
   * remain visible through verify/forest-match.
   * @param {object} run
   */
  _runSoftPhase(run) {
    if (run.softRan) return { ok: true };
    if (!this._hasSettle()) {
      run.softRan = true;
      run.soft = { skipped: true, reason: "no-settle-deps" };
      // Chrome stays until Done (D071) — verify / forest-match still run.
      return { ok: true };
    }

    const focusActs = focusActionsFromRun(run);
    if (!focusActs.length) {
      run.softRan = true;
      run.soft = { ok: true, skipped: true, reason: "no-focus" };
      this._chromeStage(run, "soft", "ok");
      Logger.trace(`soft skip reason=no-focus applyId=${run.applyId || "?"}`);
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "info",
        message: "soft skip (no focus actions)",
      });
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
    Logger.trace(`soft quiet ${softMs}ms applyId=${run.applyId || "?"} nFocus=${focusActs.length}`);
    this._emitProgress({
      applyId: run.applyId,
      phase: "soft",
      event: "info",
      message: `soft quiet ${softMs}ms`,
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
    if (out?.cancelled || out?.code === APPLY_EPOCH_DISPLAYS_CHANGED) {
      const outcome = this._cancelOutcome(run, "soft");
      return {
        ok: false,
        error: out.error || outcome.error,
        code: run.cancelCode || out.code || outcome.code,
        phase: "soft",
      };
    }
    const session = this._ensureHeuristics();
    recordSoftFocusHeuristics(session, {
      host: run.softHost || this._settleHost(),
      wmClasses: run.softWmClasses || ["unknown"],
      residuals: out?.residuals || [],
      softSettled: !!(out && out.softSettled),
    });
    // Soft max-corrections / wall timeout: warn and continue to verify.
    // Soft residual thrash must not skip verify; Done.ok is forest-match.
    if (out && out.ok === false && !out.timedOut) {
      recordWarn("settle-soft-fail", {
        applyId: run.applyId || "-",
        phase: "soft",
        error: out.error || "soft-barrier-failed",
      });
      this._chromeNotice(run, CHROME_SOFT_FAIL_NOTICE);
      this._chromeStage(run, "soft", "fail");
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "warn",
        message: `${out.error || "soft barrier failed"} (continuing to verify)`,
      });
    } else if (out && out.timedOut) {
      recordWarn("settle-soft-fail", {
        applyId: run.applyId || "-",
        phase: "soft",
        error: out.error || "soft-wall-timeout",
        timedOut: true,
      });
      this._chromeNotice(run, CHROME_SOFT_FAIL_NOTICE);
      this._chromeStage(run, "soft", "fail");
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "warn",
        message: out.error || "soft wall timeout (continuing to verify)",
      });
    } else {
      this._chromeStage(run, "soft", "ok");
      this._emitProgress({
        applyId: run.applyId,
        phase: "soft",
        event: "info",
        message: `soft settled corrections=${out?.corrections || 0}`,
      });
    }
    // D071: do not clear here — keep overlay through verify + forest-match Done.
    return { ok: true };
  }

  /**
   * Drop apply chrome once per run (Done / error / cancel). Idempotent.
   * Soft/hard barriers must not clear early (D071) so the desk is not clickable
   * while forest-match or Meta frames are still wrong.
   * @param {object} run
   * @param {string} reason
   */
  _clearChrome(run, reason) {
    if (!run || run.chromeCleared) return;
    run.chromeCleared = true;
    const why = reason || "done";
    try {
      Logger.info("layout-apply-run chrome clear", {
        fields: {
          reason: why,
          applyId: run.applyId || "?",
          phase: run.phase || "?",
        },
      });
      this._onChromeClear?.({
        applyId: run.applyId,
        reason: why,
      });
    } catch (e) {
      Logger.warn(`layout-apply-run chrome clear: ${e}`);
    }
  }

  /**
   * @param {object} run
   * @param {string|null} notice
   */
  _chromeNotice(run, notice) {
    if (!run || run.chromeCleared) return;
    try {
      this._onChromeNotice?.({ applyId: run.applyId, notice: notice ?? null });
    } catch (e) {
      Logger.debug?.(`layout-apply-run chrome notice: ${e}`);
    }
  }

  /**
   * @param {object} run
   * @param {string} label
   * @param {string} status
   */
  _chromeStage(run, label, status) {
    if (!run || run.chromeCleared) return;
    try {
      this._onChromeStage?.({
        applyId: run.applyId,
        label: String(label || ""),
        status: String(status || "pending"),
      });
    } catch (e) {
      Logger.debug?.(`layout-apply-run chrome stage: ${e}`);
    }
  }

  /**
   * Verify once (correct at most once) + optional LF6.
   * @param {object} run
   */
  _runVerifyPhase(run) {
    if (run.flags && run.flags.waitTreeStable && this._hasSettle() && !run.treeStableRan) {
      return this._runTreeStablePhase(run);
    }
    return this._runVerifyOnce(run);
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
      if (completed.cancelled || completed.code === APPLY_EPOCH_DISPLAYS_CHANGED) {
        const outcome = this._cancelOutcome(run, "verify");
        return {
          ok: false,
          error: completed.error || outcome.error,
          code: run.cancelCode || completed.code || outcome.code,
          phase: "verify",
        };
      }
      return this._runVerifyOnce(run);
    }
    run.settleHeld = true;
    return { ok: true, hold: true };
  }

  /**
   * Focus verify-once (not Done.ok). Done.ok is required forest-match.
   * @param {object} run
   * @returns {{ ok: boolean, error?: string, code?: string, phase?: string }}
   */
  _runVerifyOnce(run) {
    if (run.verifyRan) return { ok: true };
    const focusActs = focusActionsFromRun(run);
    if (!this._hasSettle() || !focusActs.length) {
      run.verify = {
        ok: true,
        skipped: true,
        reason: this._hasSettle() ? "no-focus" : "no-settle-deps",
      };
      run.verifyRan = true;
      return { ok: true };
    }
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
    run.verifyRan = true;
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
      if (out?.cancelled || out?.code === APPLY_EPOCH_DISPLAYS_CHANGED) {
        const outcome = this._cancelOutcome(run, "verify");
        this._finish(false, {
          phase: "verify",
          error: out.error || outcome.error,
          code: run.cancelCode || out.code || outcome.code,
        });
        return;
      }
      const work = this._runVerifyOnce(run);
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
    if (out?.cancelled || out?.code === "cancel" || out?.code === APPLY_EPOCH_DISPLAYS_CHANGED) {
      const outcome = this._cancelOutcome(run, "open");
      return {
        ok: false,
        error: out.error || outcome.error,
        code: run.cancelCode || out.code || outcome.code,
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

  _matchRequiredTileForest(run) {
    let forest = null;
    try {
      forest = this._snapshotForSettle(run);
    } catch {
      forest = null;
    }
    if (forest) syncRolePinsFromForest(run, forest);
    let windows = [];
    try {
      windows = this._hasSettle() ? this._loadSettleWindows(run) : windowsFromForest(forest);
    } catch {
      windows = windowsFromForest(forest);
    }
    return matchRequiredTileSlots({
      profile: run.profile,
      forest,
      windows,
      rolePins: run.rolePins,
      flags: run.flags,
      workspace: run.workspace,
      hardReady: run.hardReady,
    });
  }

  /**
   * D070: last-resort structure repair after primary forest-match fail.
   * Default on only when production=true; flags.forestFailsafe overrides.
   * Dev stays loud so primary-path bugs are fixed (R042), not papered over.
   * @param {object} run
   * @returns {boolean}
   */
  _forestFailsafeEnabled(run) {
    const f = run?.flags && typeof run.flags === "object" ? run.flags : {};
    if (f.forestFailsafe === true || f.forestFailsafe === 1) return true;
    if (f.forestFailsafe === false || f.forestFailsafe === 0) return false;
    return !!production;
  }

  /**
   * One structure recovery pass for failed slot keys (ensure_layout/order).
   * Not the product spine — prod guardrail only (D070).
   * @param {object} run
   * @param {object} forestMatch
   * @returns {{ ok: boolean, steps?: number, error?: string, rematch?: object }}
   */
  _runForestFailsafe(run, forestMatch) {
    const failed = Array.isArray(forestMatch?.failed) ? forestMatch.failed : [];
    const failedKeys = new Set(failed.map((s) => String(s)));
    if (!failedKeys.size) return { ok: false, error: "no-failed-slots", steps: 0 };

    const runSteps =
      this._settle?.runSteps ||
      (this._structure ? (steps, ctx) => this._structure.runSteps(steps, ctx) : null);
    if (typeof runSteps !== "function") {
      return { ok: false, error: "no-runSteps", steps: 0 };
    }

    let forest = null;
    try {
      forest = this._snapshotForSettle(run);
    } catch (e) {
      return { ok: false, error: String(e?.message || e), steps: 0 };
    }
    if (!forest) return { ok: false, error: "no-forest", steps: 0 };

    let plan;
    try {
      plan = planReconcile(run.profile, forest, {
        ...(run.flags && typeof run.flags === "object" ? run.flags : {}),
        workspace: run.workspace ?? 0,
        rolePins: run.rolePins,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), steps: 0 };
    }
    if (!plan || plan.ok === false) {
      return {
        ok: false,
        error: plan?.error != null ? String(plan.error) : "failsafe replan failed",
        steps: 0,
      };
    }

    const actions = (plan.actions || []).filter((a) => {
      if (!a || typeof a !== "object") return false;
      const op = String(a.op || "")
        .trim()
        .toLowerCase();
      if (op !== "ensure_layout" && op !== "ensure_order") return false;
      const slot = a.slot != null ? String(a.slot).trim() : "";
      return !!(slot && failedKeys.has(slot));
    });
    if (!actions.length) {
      return { ok: false, error: "no-structure-actions", steps: 0 };
    }

    let steps;
    try {
      steps = planActionsToSteps(actions, {
        workspace: run.workspace ?? 0,
        forceClose: !!(run.flags && run.flags.forceClose),
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), steps: 0 };
    }
    const allowed = new Set(["move", "layout", "order"]);
    steps = (Array.isArray(steps) ? steps : []).filter((s) =>
      allowed.has(
        String(s?.op || "")
          .trim()
          .toLowerCase()
      )
    );
    if (!steps.length) return { ok: false, error: "no-structure-steps", steps: 0 };

    Logger.warn("layout-apply-run forest-failsafe", {
      fields: {
        applyId: run.applyId || "?",
        failed: [...failedKeys].join(","),
        steps: steps.length,
      },
    });
    this._emitProgress({
      applyId: run.applyId,
      phase: "verify",
      event: "warn",
      message: `forest-failsafe repairing ${[...failedKeys].join(",")}`,
    });

    try {
      const r = runSteps(steps, { phase: "forest-failsafe", run });
      if (r && r.ok === false) {
        return {
          ok: false,
          error: r.error || "failsafe steps failed",
          steps: steps.length,
        };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e), steps: steps.length };
    }

    // Primary hardReady pending must not veto rematch after structure repair.
    const savedHard = run.hardReady;
    run.hardReady = { ...(savedHard || {}), ok: true, pending: [], timedOut: false };
    const rematch = this._matchRequiredTileForest(run);
    run.hardReady = savedHard;
    return { ok: !!rematch.ok, steps: steps.length, rematch };
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
    try {
      const snap = this._snapshotForSettle?.(run) || run.forest || null;
      if (snap) scanForestInvariants(snap);
    } catch (_e) {
      /* best-effort hunt */
    }
    if (run.settleJitter) {
      recordWarn("settle-jitter", {
        applyId: run.applyId || "-",
        phase: "verify",
        event: "pre-forest-match",
      });
    }
    let forestMatch = this._matchRequiredTileForest(run);
    const result = {
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
      forestMatch,
      hardFailed: forestMatch.failed || [],
      slotMachines: run.hardReady?.machines || run.slotMachines || null,
    };
    if (!forestMatch.ok) {
      const named = (forestMatch.failed || []).join(",") || "?";
      if (this._forestFailsafeEnabled(run) && !run.forestFailsafeRan) {
        run.forestFailsafeRan = true;
        const fs = this._runForestFailsafe(run, forestMatch);
        result.failsafe = {
          attempted: true,
          ok: !!fs.ok,
          steps: fs.steps || 0,
          error: fs.error || null,
          primaryFailed: forestMatch.failed || [],
        };
        if (fs.ok && fs.rematch) {
          forestMatch = fs.rematch;
          result.forestMatch = forestMatch;
          result.hardFailed = forestMatch.failed || [];
          result.failsafe.recovered = true;
          Logger.warn(
            `layout-apply-run forest-failsafe recovered slots=${named} applyId=${
              run.applyId || "?"
            }`
          );
          this._finish(true, { phase: "verify", result });
          return;
        }
        Logger.error(
          `layout-apply-run forest-failsafe did not recover slots=${named} err=${
            fs.error || "rematch"
          }`
        );
      } else if (!this._forestFailsafeEnabled(run)) {
        Logger.error(
          `layout-apply-run forest-match failed slots=${named} (failsafe off; fix primary path)`
        );
      }
      this._finish(false, {
        phase: "verify",
        error: `required TILE slot(s) not in-slot: ${named}`,
        code: "hard-failed",
        result,
      });
      return;
    }
    this._finish(true, {
      phase: "verify",
      result,
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
    this._disposeSlotSession(run);
    const phase = opts.phase != null ? String(opts.phase) : run.phase;
    const cancelBeforeWait =
      !ok &&
      (opts.code === "cancel" || opts.code === APPLY_EPOCH_DISPLAYS_CHANGED) &&
      !run.settleWaited;
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

    try {
      const t0 = run.metricT0 || {};
      const now = metricsSnapshot();
      recordApply({
        applyId: run.applyId,
        name: run.name,
        ok,
        ms: this._nowMs() - (run.startedAt || this._nowMs()),
        phase,
        fallbacks: now.fallbacks - (t0.fallbacks || 0),
        invariants: now.invariants - (t0.invariants || 0),
        paints: now.paints - (t0.paints || 0),
      });
    } catch (e) {
      Logger.debug(`metric apply record: ${e}`);
    }

    // All-hard already cleared on success path; still clear on error / early exit.
    this._clearChrome(run, ok ? "done" : opts.code || "error");

    // Drop rehome suppress + deferred mon rehomes before Done restack.
    try {
      this._onApplyLive?.(false, run);
    } catch (e) {
      Logger.warn(`layout-apply-run onApplyLive leave: ${e}`);
    }

    try {
      this._onDone?.(terminal);
    } catch (e) {
      Logger.warn(`layout-apply-run onDone: ${e}`);
    }
  }
}
