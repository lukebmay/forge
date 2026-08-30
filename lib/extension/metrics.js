/*
 * Session counters for Forest vs host fallback, apply/paint cost, invariants.
 * Grep: `metric apply` / `metric fallback` / `metric invariant` / `metric paint`
 * / `metric agree` / `metric drift` / `metric resync`.
 */
import { Logger } from "../shared/logger.js";
import { tilesOf, walk } from "../tom/index.js";

/** @typedef {{ applies: number, applyFail: number, applyMs: number, paints: number, paintMs: number, fallbacks: number, invariants: number, agrees: number, agreeFail: number, drifts: number, resyncs: number, resyncFail: number }} MetricsCounters */

/** @type {MetricsCounters} */
const counters = {
  applies: 0,
  applyFail: 0,
  applyMs: 0,
  paints: 0,
  paintMs: 0,
  fallbacks: 0,
  invariants: 0,
  agrees: 0,
  agreeFail: 0,
  drifts: 0,
  resyncs: 0,
  resyncFail: 0,
};

/** @type {Set<string>} */
const seenInvariants = new Set();

const PAINT_DEBUG_MS = 20;

/** @returns {MetricsCounters} */
export function metricsSnapshot() {
  return { ...counters };
}

export function resetMetrics() {
  counters.applies = 0;
  counters.applyFail = 0;
  counters.applyMs = 0;
  counters.paints = 0;
  counters.paintMs = 0;
  counters.fallbacks = 0;
  counters.invariants = 0;
  counters.agrees = 0;
  counters.agreeFail = 0;
  counters.drifts = 0;
  counters.resyncs = 0;
  counters.resyncFail = 0;
  seenInvariants.clear();
}

/**
 * GObject / id-miss path taken instead of Forest.
 * @param {string} op
 * @param {string} reason
 * @param {Record<string, unknown>} [fields]
 */
export function recordFallback(op, reason, fields) {
  counters.fallbacks += 1;
  const title = `metric fallback op=${op} reason=${reason}`;
  if (fields && typeof fields === "object") {
    Logger.info(title, { fields });
    return;
  }
  Logger.info(title);
}

/**
 * Topology / paint invariant. WARN once per kind+key; always counted.
 * @param {string} kind
 * @param {string} [key]
 * @param {string} [detail]
 */
export function recordInvariant(kind, key, detail) {
  counters.invariants += 1;
  const k = `${kind}:${key || ""}`;
  if (seenInvariants.has(k)) return;
  seenInvariants.add(k);
  const extra = detail ? ` ${detail}` : key ? ` ${key}` : "";
  Logger.warn(`metric invariant ${kind}${extra}`);
}

/**
 * One tree paint / renderTree body.
 * @param {string} from
 * @param {number} ms
 */
export function recordPaint(from, ms) {
  const n = Number(ms);
  const dur = Number.isFinite(n) && n > 0 ? n : 0;
  counters.paints += 1;
  counters.paintMs += dur;
  if (dur >= PAINT_DEBUG_MS) {
    Logger.debug(`metric paint from=${from || "-"} ms=${Math.round(dur)}`);
  }
}

/**
 * One ApplyLayout terminal.
 * @param {{ applyId?: string, name?: string, ok?: boolean, ms?: number, phase?: string, fallbacks?: number, invariants?: number, paints?: number }} fields
 */
export function recordApply(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  counters.applies += 1;
  if (!f.ok) counters.applyFail += 1;
  const ms = Number(f.ms);
  if (Number.isFinite(ms) && ms > 0) counters.applyMs += ms;
  Logger.info("metric apply", {
    fields: {
      applyId: f.applyId || "-",
      name: f.name || "-",
      ok: !!f.ok,
      ms: Number.isFinite(ms) ? Math.round(ms) : 0,
      phase: f.phase || "-",
      fallbacks: f.fallbacks != null ? f.fallbacks : counters.fallbacks,
      invariants: f.invariants != null ? f.invariants : counters.invariants,
      paints: f.paints != null ? f.paints : counters.paints,
    },
  });
}

/**
 * AGREE predicate result (D093). Grep: `metric agree`.
 * @param {{ ok?: boolean, driftCount?: number, reason?: string }} fields
 */
export function recordAgree(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  counters.agrees += 1;
  if (!f.ok) counters.agreeFail += 1;
  Logger.info("metric agree", {
    fields: {
      ok: !!f.ok,
      driftCount: Number(f.driftCount) || 0,
      reason: f.reason || "-",
    },
  });
}

/**
 * One DRIFT kind (D093). Grep: `metric drift`.
 * @param {{ kind?: string, id?: string, reason?: string }} fields
 */
export function recordDrift(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  counters.drifts += 1;
  /** @type {Record<string, unknown>} */
  const out = {
    kind: f.kind || "-",
    id: f.id || "-",
    reason: f.reason || "-",
  };
  for (const k of [
    "expected",
    "actual",
    "bagFloating",
    "forestParent",
    "liveMode",
    "parentKind",
    "metaMon",
  ]) {
    if (f[k] !== undefined) out[k] = f[k];
  }
  Logger.info("metric drift", { fields: out });
}

/**
 * RESYNC loop result (D093). Grep: `metric resync`.
 * @param {{ ok?: boolean, rounds?: number, steps?: string[]|string, reason?: string }} fields
 */
export function recordResync(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  counters.resyncs += 1;
  if (!f.ok) counters.resyncFail += 1;
  const stepList = Array.isArray(f.steps) ? f.steps : f.steps ? [String(f.steps)] : [];
  Logger.info("metric resync", {
    fields: {
      ok: !!f.ok,
      rounds: Number(f.rounds) || 0,
      steps: stepList.join(",") || "-",
      reason: f.reason || "-",
    },
  });
}

export function logMetricsSession(reason) {
  Logger.info("metric session", {
    fields: { reason: reason || "dump", ...metricsSnapshot() },
  });
}

/**
 * Bad-state WARN (always; not once-capped). Grep: `metric warn`.
 * @param {string} kind
 * @param {Record<string, unknown>|string} [fieldsOrDetail]
 */
export function recordWarn(kind, fieldsOrDetail) {
  const k = String(kind || "unknown");
  if (fieldsOrDetail && typeof fieldsOrDetail === "object") {
    Logger.warn(`metric warn ${k}`, { fields: fieldsOrDetail });
    return;
  }
  const extra = fieldsOrDetail != null && String(fieldsOrDetail) ? ` ${fieldsOrDetail}` : "";
  Logger.warn(`metric warn ${k}${extra}`);
}

/**
 * Walk TILES for bad bag shapes: singleton TABBED/STACKED; CON under bag.
 * @param {import('../tom/kernel.js').Forest|null|undefined} forest
 * @returns {number} newly warned count
 */
export function scanForestInvariants(forest) {
  if (!forest || typeof forest !== "object") return 0;
  const root = tilesOf(forest);
  if (!root) return 0;
  const before = seenInvariants.size;
  walk(forest, root, (node) => {
    if (node?.kind !== "CON") return;
    const lay = node.layout;
    if (lay !== "TABBED" && lay !== "STACKED") return;
    const ids = Array.isArray(node.childIds) ? node.childIds : [];
    if (ids.length === 1) {
      recordInvariant("singleton-tab", node.id, `layout=${lay} kids=1 id=${node.id}`);
    }
    for (const cid of ids) {
      const child = forest.nodes?.[cid];
      if (child?.kind === "CON") {
        recordInvariant(
          "bag-con-child",
          `${node.id}:${cid}`,
          `layout=${lay} childLayout=${child.layout || "-"} id=${node.id}`
        );
      }
    }
  });
  return seenInvariants.size - before;
}
