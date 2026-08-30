/*
 * ApplyLayout structure half (AL5): plan + step partition for no-open apply.
 * Open/map waits are AL6; hard/soft/verify live in layout-apply-settle (AL7).
 * Structure layout uses _setLayoutStructureOp (lift/refuse), not peel.
 */

import { planReconcile, planActionsToSteps } from "../shared/layout-plan.js";
import { Logger } from "../shared/logger.js";

/** Plan-level ops that need launch/map (AL6). */
export const OPEN_ACTION_OPS = Object.freeze(["open"]);

/**
 * @param {unknown} action
 * @returns {boolean}
 */
export function isOpenAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return false;
  const op = String(action.op || "")
    .trim()
    .toLowerCase();
  return OPEN_ACTION_OPS.includes(op);
}

/**
 * @param {unknown[]} actions
 * @returns {object[]}
 */
export function listOpenActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(isOpenAction);
}

/**
 * Move dest is a window id (tab/stack join after ensure_layout wrap).
 * @param {object} step
 * @returns {boolean}
 */
export function isWindowJoinMove(step) {
  if (!step || typeof step !== "object") return false;
  const op = String(step.op || "")
    .trim()
    .toLowerCase();
  if (op !== "move") return false;
  const dest = String(step.dest || "").trim();
  return dest.startsWith("id:");
}

/**
 * Mon-path / residual place move (not a group join).
 * @param {object} step
 * @returns {boolean}
 */
export function isPlaceMove(step) {
  if (!step || typeof step !== "object") return false;
  const op = String(step.op || "")
    .trim()
    .toLowerCase();
  if (op !== "move") return false;
  return !isWindowJoinMove(step);
}

/**
 * Snapshot → planReconcile → planActionsToSteps. Open actions listed but not stepped.
 *
 * @param {object} profile
 * @param {object} forest planner IR from projectForestFromTom (not DBus GetTree)
 * @param {object} [flags] clean/keepOthers/safe + optional rolePins
 * @param {{ workspace?: number, forceClose?: boolean }} [opts]
 * @returns {{
 *   ok: true,
 *   plan: object,
 *   steps: object[],
 *   openActions: object[],
 *   openCount: number,
 * } | { ok: false, error: string, code?: string, phase?: string, plan?: object }}
 */
export function buildStructurePlan(profile, forest, flags, opts = {}) {
  if (profile == null || typeof profile !== "object" || Array.isArray(profile)) {
    return { ok: false, error: "profile required", code: "bad-profile", phase: "skeleton" };
  }
  if (forest == null || typeof forest !== "object" || Array.isArray(forest)) {
    return { ok: false, error: "forest required", code: "bad-forest", phase: "skeleton" };
  }

  const workspace =
    opts.workspace != null ? opts.workspace : flags?.workspace != null ? flags.workspace : 0;
  const forceClose = !!(opts.forceClose ?? flags?.forceClose ?? flags?.force_close);

  let plan;
  try {
    plan = planReconcile(profile, forest, {
      ...(flags && typeof flags === "object" ? flags : {}),
      workspace,
    });
  } catch (e) {
    return {
      ok: false,
      error: `planReconcile: ${e?.message || e}`,
      code: "plan-error",
      phase: "skeleton",
    };
  }

  if (!plan || plan.ok === false) {
    return {
      ok: false,
      error: plan?.error != null ? String(plan.error) : "planReconcile failed",
      code: "plan-failed",
      phase: "skeleton",
      plan: plan || null,
    };
  }

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const openActions = listOpenActions(actions);
  let steps;
  try {
    steps = planActionsToSteps(actions, { workspace, forceClose });
  } catch (e) {
    return {
      ok: false,
      error: `planActionsToSteps: ${e?.message || e}`,
      code: "steps-error",
      phase: "skeleton",
      plan,
    };
  }

  Logger.debug(
    `structure-plan ws=${workspace} actions=${actions.length} steps=${
      Array.isArray(steps) ? steps.length : 0
    } open=${openActions.length}`
  );
  return {
    ok: true,
    plan,
    steps: Array.isArray(steps) ? steps : [],
    openActions,
    openCount: openActions.length,
  };
}

/**
 * Bucket RunSteps for D008 ApplyLayout phases (structure half).
 * Open phase holds mon place moves only; launches are not steps.
 *
 * @param {object[]} steps
 * @returns {{
 *   skeleton: object[],
 *   open: object[],
 *   bind: object[],
 *   order: object[],
 *   size: object[],
 *   focus: object[],
 * }}
 */
export function partitionStepsByPhase(steps) {
  /** @type {{ skeleton: object[], open: object[], bind: object[], order: object[], size: object[], focus: object[] }} */
  const out = {
    skeleton: [],
    open: [],
    bind: [],
    order: [],
    size: [],
    focus: [],
  };
  if (!Array.isArray(steps)) return out;

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const op = String(step.op || "")
      .trim()
      .toLowerCase();
    if (op === "skeleton") {
      out.skeleton.push(step);
      continue;
    }
    if (op === "bind") {
      out.bind.push(step);
      continue;
    }
    if (op === "close") {
      out.bind.push(step);
      continue;
    }
    if (op === "layout") {
      out.order.push(step);
      continue;
    }
    if (op === "order") {
      out.order.push(step);
      continue;
    }
    if (op === "size") {
      out.size.push(step);
      continue;
    }
    if (op === "focus") {
      out.focus.push(step);
      continue;
    }
    if (op === "move") {
      if (isWindowJoinMove(step)) out.order.push(step);
      else out.open.push(step);
      continue;
    }
    // Unknown extension step: keep with place bucket so we do not drop it.
    out.open.push(step);
  }
  return out;
}

/**
 * @param {ReturnType<typeof partitionStepsByPhase>} buckets
 * @param {string} phase D008 name
 * @returns {object[]}
 */
export function stepsForPhase(buckets, phase) {
  const p = String(phase || "")
    .trim()
    .toLowerCase();
  if (!buckets || typeof buckets !== "object") return [];
  switch (p) {
    case "skeleton":
      return buckets.skeleton || [];
    case "open":
      return buckets.open || [];
    case "bind":
      return buckets.bind || [];
    case "order":
      return buckets.order || [];
    case "size":
      return buckets.size || [];
    case "focus":
      return buckets.focus || [];
    default:
      return [];
  }
}

/**
 * Phases that run structure RunSteps in AL5.
 * hard-ready / soft / verify are settle phases (AL7), not RunSteps.
 */
export const STRUCTURE_WORK_PHASES = Object.freeze([
  "skeleton",
  "open",
  "bind",
  "order",
  "size",
  "focus",
]);

/**
 * @param {string} phase
 * @returns {boolean}
 */
export function phaseHasStructureWork(phase) {
  const p = String(phase || "")
    .trim()
    .toLowerCase();
  return STRUCTURE_WORK_PHASES.includes(p);
}
