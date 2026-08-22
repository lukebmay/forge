/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyLayout slot machines (SM4 / D040). Parallel independent slots;
 * serial inside a slot. Hard = in-slot retry. Late Meta resume only
 * while ApplyEpoch is live.
 */

import {
  collectHardReadySlotTargets,
  hardReadyStatus,
  waitHardReadyOnSignals,
} from "./layout-apply-settle.js";
import { planReconcile, planActionsToSteps } from "../shared/layout-plan.js";
import { Logger } from "../shared/logger.js";

export const SLOT_HARD_FIRST_WAIT_MS = 5000;
export const SLOT_HARD_RETRY_WAIT_MS = 2000;
export const SLOT_HARD_RETRY_N = 2;
export const SLOT_PLACE_ATTEMPTS = 1 + SLOT_HARD_RETRY_N;

export const SLOT_STATE = Object.freeze({
  OPEN: "open",
  MAP: "map",
  PLACE: "place",
  HARD_WAIT: "hard-wait",
  RETRY_PLACE: "retry-place",
  HARD_DONE: "hard-done",
  HARD_FAILED: "hard-failed",
});

const GROUP_LAYOUTS = new Set(["TABBED", "STACKED"]);

function _nonNegInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

/**
 * @param {unknown} state
 * @returns {boolean}
 */
export function isSlotTerminal(state) {
  const s = String(state || "");
  return s === SLOT_STATE.HARD_DONE || s === SLOT_STATE.HARD_FAILED;
}

/**
 * TABBED/STACKED CON = one machine; TILE window = its own.
 * @param {object|null|undefined} target from collectHardReadySlotTargets
 * @returns {string}
 */
export function slotMachineKey(target) {
  const lay = String(target?.parentLayout || "").toUpperCase();
  const slot = target?.slot != null ? String(target.slot).trim() : "";
  if (GROUP_LAYOUTS.has(lay) && slot) return slot;
  if (target?.windowId != null && String(target.windowId).trim() !== "") {
    return `id:${target.windowId}`;
  }
  if (slot) return slot;
  if (target?.role != null && String(target.role).trim() !== "") {
    return `role:${target.role}`;
  }
  return "slot";
}

/**
 * Independent slot machines from SM2 targets. Does not fork the in-slot predicate.
 * @param {object|null|undefined} run
 * @param {unknown} forest
 * @returns {object[]}
 */
export function collectSlotMachines(run, forest) {
  const { ids, slots } = collectHardReadySlotTargets(run, forest);
  const groups = new Map();
  for (const id of ids) {
    const target = slots[id];
    if (!target) continue;
    const key = slotMachineKey(target);
    let g = groups.get(key);
    if (!g) {
      const lay = String(target.parentLayout || "").toUpperCase();
      g = {
        id: key,
        key,
        kind: GROUP_LAYOUTS.has(lay) ? lay : "TILE",
        windowIds: [],
        slots: {},
        roles: [],
        state: SLOT_STATE.PLACE,
        placeAttempts: 0,
        placeAt: null,
        epochEnded: false,
        lateResume: false,
      };
      groups.set(key, g);
    }
    g.windowIds.push(String(id));
    g.slots[String(id)] = target;
    if (target.role != null && String(target.role).trim() !== "") {
      const role = String(target.role);
      if (!g.roles.includes(role)) g.roles.push(role);
    }
  }
  const out = [...groups.values()];
  Logger.debug(`slot-machines n=${out.length}`);
  return out;
}

/**
 * First place waits 5s; retries wait 2s. `attempt` is 1-based place count.
 * @param {unknown} attempt
 * @param {{ firstWaitMs?: number, retryWaitMs?: number }} [opts]
 * @returns {number}
 */
export function hardWaitMsForAttempt(attempt, opts = {}) {
  const n = Math.max(1, _nonNegInt(attempt, 1));
  if (n <= 1) {
    return opts.firstWaitMs != null
      ? _nonNegInt(opts.firstWaitMs, SLOT_HARD_FIRST_WAIT_MS)
      : SLOT_HARD_FIRST_WAIT_MS;
  }
  return opts.retryWaitMs != null
    ? _nonNegInt(opts.retryWaitMs, SLOT_HARD_RETRY_WAIT_MS)
    : SLOT_HARD_RETRY_WAIT_MS;
}

/**
 * Late Meta after hard-failed resumes only while the apply epoch is live.
 * @param {object|null|undefined} machine
 * @param {unknown} epochLive
 * @returns {boolean}
 */
export function canLateResumeSlot(machine, epochLive) {
  if (!epochLive) return false;
  if (!machine || machine.epochEnded) return false;
  return String(machine.state || "") === SLOT_STATE.HARD_FAILED;
}

/**
 * Pure per-slot stepper. Serial inside one machine.
 * @param {object} machine
 * @param {{ type: string, nowMs?: number, epochLive?: boolean }} event
 * @returns {object}
 */
export function applySlotEvent(machine, event) {
  if (!machine || typeof machine !== "object") return machine;
  const ev = event && event.type != null ? String(event.type) : "";
  const state = String(machine.state || "");
  const out = { ...machine };

  if (ev === "epoch-end") {
    out.epochEnded = true;
    return out;
  }

  if (state === SLOT_STATE.HARD_DONE) return out;

  if (state === SLOT_STATE.OPEN || state === SLOT_STATE.MAP) {
    if (ev === "mapped") out.state = SLOT_STATE.PLACE;
    return out;
  }

  if (state === SLOT_STATE.PLACE || state === SLOT_STATE.RETRY_PLACE) {
    if (ev === "placed") {
      out.placeAttempts = (out.placeAttempts || 0) + 1;
      if (event.nowMs != null) out.placeAt = event.nowMs;
      out.state = SLOT_STATE.HARD_WAIT;
    }
    return out;
  }

  if (state === SLOT_STATE.HARD_WAIT) {
    if (ev === "hard-ready") {
      out.state = SLOT_STATE.HARD_DONE;
      return out;
    }
    if (ev === "hard-timeout") {
      const attempts = out.placeAttempts || 0;
      out.state = attempts < SLOT_PLACE_ATTEMPTS ? SLOT_STATE.RETRY_PLACE : SLOT_STATE.HARD_FAILED;
      return out;
    }
    return out;
  }

  if (state === SLOT_STATE.HARD_FAILED) {
    if (ev === "late-meta" && event.epochLive && !out.epochEnded) {
      out.state = SLOT_STATE.HARD_DONE;
      out.lateResume = true;
    }
    return out;
  }

  return out;
}

function _actionWindowId(action) {
  if (!action || typeof action !== "object") return "";
  if (action.windowId != null && String(action.windowId).trim() !== "") {
    return String(action.windowId).trim();
  }
  const sel = action.selector != null ? String(action.selector).trim() : "";
  if (sel.startsWith("id:")) return sel.slice(3).trim();
  return "";
}

/**
 * Re-issue place moves for one slot (not the whole-desk belt).
 * @param {{
 *   profile?: object,
 *   forest?: object,
 *   rolePins?: object,
 *   flags?: object,
 *   workspace?: number,
 *   forceClose?: boolean,
 *   machine?: object,
 *   runSteps?: Function,
 *   phase?: string,
 *   run?: object,
 * }} opts
 * @returns {object}
 */
export function placeSlotWindows(opts = {}) {
  const machine = opts.machine;
  const roles = new Set((machine?.roles || []).map((r) => String(r)));
  const wids = new Set((machine?.windowIds || []).map((w) => String(w)));
  if (!opts.profile || !opts.forest || typeof opts.forest !== "object") {
    return { ok: true, skipped: true, steps: 0, reason: "no-plan" };
  }

  let plan;
  try {
    plan = planReconcile(opts.profile, opts.forest, {
      ...(opts.flags && typeof opts.flags === "object" ? opts.flags : {}),
      workspace: opts.workspace ?? 0,
      rolePins: opts.rolePins,
      justOpenedRoles: [...roles],
    });
  } catch (e) {
    return { ok: false, skipped: false, steps: 0, error: String(e?.message || e) };
  }
  if (!plan || plan.ok === false) {
    return {
      ok: false,
      skipped: false,
      steps: 0,
      error: plan?.error != null ? String(plan.error) : "slot place replan failed",
    };
  }

  const actions = (plan.actions || []).filter((a) => {
    if (!a || typeof a !== "object") return false;
    if (String(a.op || "").toLowerCase() !== "move") return false;
    if (a.role != null && roles.has(String(a.role))) return true;
    const wid = _actionWindowId(a);
    return !!(wid && wids.has(wid));
  });

  let steps;
  try {
    steps = planActionsToSteps(actions, {
      workspace: opts.workspace ?? 0,
      forceClose: !!opts.forceClose,
    });
  } catch (e) {
    return { ok: false, skipped: false, steps: 0, error: String(e?.message || e), plan };
  }
  steps = (Array.isArray(steps) ? steps : []).filter(
    (s) => s && String(s.op || "").toLowerCase() === "move"
  );
  Logger.trace(
    `slot-place key=${machine?.id || machine?.key || "-"} moves=${steps.length} ws=${
      opts.workspace ?? 0
    }`
  );
  if (!steps.length) {
    return { ok: true, skipped: true, steps: 0, reason: "no-moves", plan };
  }
  if (typeof opts.runSteps !== "function") {
    return { ok: true, skipped: true, steps: steps.length, reason: "no-runSteps", plan };
  }
  try {
    const r = opts.runSteps(steps, {
      phase: opts.phase || "hard-ready",
      run: opts.run,
    });
    if (r && r.ok === false) {
      return {
        ok: false,
        skipped: false,
        steps: steps.length,
        error: r.error || "slot place failed",
        plan,
      };
    }
  } catch (e) {
    return { ok: false, skipped: false, steps: steps.length, error: String(e?.message || e), plan };
  }
  return { ok: true, skipped: false, steps: steps.length, plan };
}

function _snapshotMachines(machines) {
  const settled = [];
  const pending = [];
  const failed = [];
  for (const m of machines) {
    const ids = Array.isArray(m.windowIds) ? m.windowIds.slice() : [];
    if (m.state === SLOT_STATE.HARD_DONE) {
      for (const id of ids) settled.push(id);
    } else {
      for (const id of ids) pending.push(id);
      if (m.state === SLOT_STATE.HARD_FAILED) {
        failed.push(m.key || m.id);
      }
    }
  }
  return {
    ok: pending.length === 0,
    settled,
    pending,
    failed,
    timedOut: failed.length > 0,
    machines: machines.map((m) => ({
      id: m.id,
      key: m.key,
      kind: m.kind,
      state: m.state,
      placeAttempts: m.placeAttempts || 0,
      windowIds: Array.isArray(m.windowIds) ? m.windowIds.slice() : [],
      roles: Array.isArray(m.roles) ? m.roles.slice() : [],
      lateResume: !!m.lateResume,
    })),
  };
}

/**
 * Run independent slot machines in parallel. Serial inside each slot.
 *
 * @param {object[]} inputMachines
 * @param {{
 *   placeSlot?: (machine: object) => object,
 *   resolveWindowIds?: (machine: object) => string[],
 *   loadWindows?: () => object[],
 *   onWindowEvent?: (cb: () => void) => (() => void)|null,
 *   schedule?: Function,
 *   cancel?: Function,
 *   isCancelled?: () => boolean,
 *   isEpochLive?: () => boolean,
 *   nowMs?: () => number,
 *   firstWaitMs?: number,
 *   retryWaitMs?: number,
 *   hardTimeoutMs?: number,
 *   hardRetryTimeoutMs?: number,
 *   onLateResume?: (machine: object) => void,
 * }} opts
 * @param {(result: object) => void} done
 * @returns {{ dispose: () => void, snapshot: () => object, machines: object[], sync: boolean }}
 */
export function startSlotMachines(inputMachines, opts, done) {
  const nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
  const waitOpts = {
    firstWaitMs: opts.firstWaitMs ?? opts.hardTimeoutMs,
    retryWaitMs: opts.retryWaitMs ?? opts.hardRetryTimeoutMs,
  };
  const machines = (Array.isArray(inputMachines) ? inputMachines : []).map((raw) => {
    const m = { ...raw };
    if (!m.state) {
      m.state =
        Array.isArray(m.windowIds) && m.windowIds.length ? SLOT_STATE.PLACE : SLOT_STATE.OPEN;
    }
    if (m.placeAttempts == null) m.placeAttempts = 0;
    if (!m.slots || typeof m.slots !== "object") m.slots = {};
    return m;
  });

  let disposed = false;
  let notified = false;
  let cancelledOut = null;
  const listeners = new Set();
  let rootUnsub = null;

  const finishOnce = (out) => {
    if (notified) return;
    notified = true;
    if (typeof done === "function") done(out);
  };

  const epochLive = () => {
    if (typeof opts.isEpochLive === "function") return !!opts.isEpochLive();
    return !disposed;
  };

  const cancelled = () => {
    if (disposed) return true;
    if (typeof opts.isCancelled === "function") return !!opts.isCancelled();
    return false;
  };

  const fanWindow = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  const fireWindow = () => {
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch {
        /* */
      }
    }
  };

  if (typeof opts.onWindowEvent === "function") {
    try {
      rootUnsub = opts.onWindowEvent(fireWindow);
    } catch {
      rootUnsub = null;
    }
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    if (typeof rootUnsub === "function") {
      try {
        rootUnsub();
      } catch {
        /* */
      }
    }
    rootUnsub = null;
  };

  const resultOf = () => {
    if (cancelledOut) return cancelledOut;
    return _snapshotMachines(machines);
  };

  const notifyIfAllTerminal = () => {
    if (disposed || notified) return;
    if (cancelled()) {
      cancelledOut = {
        ok: false,
        settled: [],
        pending: machines.flatMap((m) => m.windowIds || []),
        failed: [],
        timedOut: false,
        cancelled: true,
        machines: _snapshotMachines(machines).machines,
        error: "cancelled",
      };
      finishOnce(cancelledOut);
      return;
    }
    if (!machines.every((m) => isSlotTerminal(m.state))) return;
    finishOnce(resultOf());
  };

  const assign = (machine, event) => {
    Object.assign(machine, applySlotEvent(machine, event));
  };

  const issuePlace = (machine) => {
    if (disposed) return;
    if (typeof opts.placeSlot === "function") {
      try {
        opts.placeSlot(machine);
      } catch {
        /* place miss still waits; retry may recover */
      }
    }
    assign(machine, { type: "placed", nowMs: nowMs() });
    startHardWait(machine);
  };

  const startHardWait = (machine) => {
    const timeoutMs = hardWaitMsForAttempt(machine.placeAttempts, waitOpts);
    waitHardReadyOnSignals(
      machine.windowIds,
      {
        loadWindows: () => {
          try {
            return opts.loadWindows?.() || [];
          } catch {
            return [];
          }
        },
        onWindowEvent: fanWindow,
        schedule: opts.schedule,
        cancel: opts.cancel,
        isCancelled: cancelled,
        nowMs,
        timeoutMs,
        callStartedMs: machine.placeAt != null ? machine.placeAt : nowMs(),
        slots: machine.slots,
      },
      (out) => {
        if (disposed) return;
        if (out?.cancelled) {
          notifyIfAllTerminal();
          return;
        }
        if (out && out.ok) {
          assign(machine, { type: "hard-ready" });
          notifyIfAllTerminal();
          return;
        }
        assign(machine, { type: "hard-timeout" });
        if (machine.state === SLOT_STATE.RETRY_PLACE) {
          issuePlace(machine);
          return;
        }
        notifyIfAllTerminal();
      }
    );
  };

  const tryMap = (machine) => {
    if (machine.state !== SLOT_STATE.OPEN && machine.state !== SLOT_STATE.MAP) return false;
    let ids = machine.windowIds;
    if (typeof opts.resolveWindowIds === "function") {
      try {
        const got = opts.resolveWindowIds(machine);
        if (Array.isArray(got) && got.length) ids = got.map((x) => String(x));
      } catch {
        /* keep current */
      }
    }
    if (!ids || !ids.length) return false;
    machine.windowIds = ids.map((x) => String(x));
    assign(machine, { type: "mapped" });
    return true;
  };

  const tryLateResume = (machine) => {
    if (!canLateResumeSlot(machine, epochLive())) return;
    let wins = [];
    try {
      wins = opts.loadWindows?.() || [];
    } catch {
      wins = [];
    }
    const st = hardReadyStatus(wins, machine.windowIds, { slots: machine.slots });
    if (!st.ok) return;
    assign(machine, { type: "late-meta", epochLive: true });
    if (machine.state === SLOT_STATE.HARD_DONE) {
      opts.onLateResume?.(machine);
    }
  };

  fanWindow(() => {
    if (disposed) return;
    if (cancelled()) {
      notifyIfAllTerminal();
      return;
    }
    for (const m of machines) {
      if (m.state === SLOT_STATE.OPEN || m.state === SLOT_STATE.MAP) {
        if (tryMap(m) && (m.state === SLOT_STATE.PLACE || m.state === SLOT_STATE.RETRY_PLACE)) {
          issuePlace(m);
        }
      } else if (m.state === SLOT_STATE.HARD_FAILED) {
        tryLateResume(m);
      }
    }
  });

  if (!machines.length) {
    finishOnce({
      ok: true,
      settled: [],
      pending: [],
      failed: [],
      timedOut: false,
      skipped: true,
      machines: [],
    });
    return { dispose, snapshot: resultOf, machines, sync: true };
  }

  for (const m of machines) {
    if (m.state === SLOT_STATE.OPEN || m.state === SLOT_STATE.MAP) {
      if (tryMap(m) && (m.state === SLOT_STATE.PLACE || m.state === SLOT_STATE.RETRY_PLACE)) {
        issuePlace(m);
      }
    } else if (m.state === SLOT_STATE.PLACE || m.state === SLOT_STATE.RETRY_PLACE) {
      issuePlace(m);
    } else if (isSlotTerminal(m.state)) {
      /* already done */
    }
  }

  notifyIfAllTerminal();
  return { dispose, snapshot: resultOf, machines, sync: notified };
}
