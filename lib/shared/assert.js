/*
 * Debug/trace assertions (OH3 / O9). Never throw — Shell logout risk.
 * Active: log-level >= debug, or !production (dev). Production info-and-below → noop.
 */

import { production } from "./settings.js";
import { error as plogError, effectiveLevel, LOG_LEVELS } from "./plog-adapter.js";

export const ASSERT_FAILED_CODE = "assert-failed";

/** @type {boolean} */
let _failed = false;
/** @type {boolean|null} */
let _activeOverride = null;

/**
 * @returns {boolean}
 */
export function isAssertActive() {
  if (_activeOverride != null) return _activeOverride;
  if (!production) return true;
  return effectiveLevel() >= LOG_LEVELS.DEBUG;
}

/**
 * Graceful-stop flag. After a failure, skip further mutate / apply / grab commit.
 * @returns {boolean}
 */
export function assertionFailed() {
  return _failed;
}

export function clearAssertionFailed() {
  _failed = false;
}

/** Test helper: force active/inactive; null restores policy. */
export function setAssertActiveForTests(value) {
  _activeOverride = value == null ? null : !!value;
}

export function resetAssertForTests() {
  _failed = false;
  _activeOverride = null;
}

/**
 * @param {string} code
 * @param {Record<string, unknown>} [fields]
 * @returns {false}
 */
function fail(code, fields) {
  _failed = true;
  const extra = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  try {
    plogError("assert", { code, ...extra });
  } catch (_e) {
    /* sink must not throw */
  }
  return false;
}

/**
 * @param {unknown} cond
 * @param {string|Record<string, unknown>} [codeOrFields]
 * @param {Record<string, unknown>} [fields]
 * @returns {boolean} true if cond holds or inactive; false on failure (never throws)
 */
export function assert(cond, codeOrFields, fields) {
  if (!isAssertActive()) return true;
  if (cond) return true;
  let code = "assert";
  /** @type {Record<string, unknown>} */
  let extra = {};
  if (codeOrFields != null && typeof codeOrFields === "object" && !Array.isArray(codeOrFields)) {
    if (codeOrFields.code != null) code = String(codeOrFields.code);
    extra = { ...codeOrFields };
    delete extra.code;
  } else if (codeOrFields != null) {
    code = String(codeOrFields);
    if (fields && typeof fields === "object" && !Array.isArray(fields)) extra = fields;
  }
  return fail(code, extra);
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} [code]
 * @param {Record<string, unknown>} [fields]
 * @returns {boolean}
 */
export function assertEq(a, b, code, fields) {
  if (!isAssertActive()) return true;
  if (Object.is(a, b)) return true;
  return fail(code != null ? String(code) : "assert-eq", {
    actual: a,
    expected: b,
    ...(fields && typeof fields === "object" ? fields : {}),
  });
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} [code]
 * @param {Record<string, unknown>} [fields]
 * @returns {boolean}
 */
export function assertNe(a, b, code, fields) {
  if (!isAssertActive()) return true;
  if (!Object.is(a, b)) return true;
  return fail(code != null ? String(code) : "assert-ne", {
    value: a,
    ...(fields && typeof fields === "object" ? fields : {}),
  });
}

/**
 * Apply-snapshot monitors must belong to the apply workspace (no cross-ws claim).
 * @param {unknown} forest
 * @param {unknown} workspace
 * @param {Record<string, unknown>} [fields]
 * @returns {boolean}
 */
export function assertApplyForestWorkspace(forest, workspace, fields) {
  if (!isAssertActive()) return true;
  if (workspace == null || workspace === "") return true;
  const ws = Number(workspace);
  if (!Number.isFinite(ws)) return true;
  const bag =
    forest && typeof forest === "object" && !Array.isArray(forest)
      ? /** @type {{ monitors?: unknown }} */ (forest)
      : null;
  const mons = bag ? bag.monitors : null;
  if (!Array.isArray(mons)) return true;
  let ok = true;
  for (const m of mons) {
    const id = m && m.id;
    if (typeof id !== "string") continue;
    const match = /^mo\d+ws(\d+)$/.exec(id);
    if (!match) continue;
    const mws = Number.parseInt(match[1], 10);
    if (mws !== ws) {
      if (
        !assert(false, "apply-ws-filter", {
          ws,
          mon: id,
          ...(fields && typeof fields === "object" ? fields : {}),
        })
      ) {
        ok = false;
      }
    }
  }
  return ok;
}
