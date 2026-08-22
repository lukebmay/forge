/**
 * Node CLI plog init. Imports vendored third_party/pansi/plog.js (Node builtins).
 * GJS / extension must not import this module — use lib/shared/plog-adapter.js.
 */

import { log, logInit, LEVELS } from "../third_party/pansi/plog.js";

export { log, LEVELS };

const LEVEL_NAMES = new Set(["trace", "debug", "info", "warn", "error"]);
const FALSEY = new Set(["0", "false", "no", "off"]);
const TEE_VALUES = new Set(["none", "stderr", "stdout", "both"]);

const GSETTINGS_TO_PLOG = Object.freeze({
  0: "off",
  1: "error",
  2: "error",
  3: "warn",
  4: "info",
  5: "debug",
  6: "trace",
  7: "trace",
});

let ready = false;
let quiet = false;

function isTruthy(raw) {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  if (s === "" || FALSEY.has(s)) return false;
  return true;
}

function normalizeLevel(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "off") return "off";
  if (s === "fatal") return "error";
  if (LEVEL_NAMES.has(s)) return s;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 7) {
    return GSETTINGS_TO_PLOG[Math.trunc(n)] || "warn";
  }
  return "warn";
}

/**
 * Resolve CLI log level. Default warn (JSON stdout stays the user protocol).
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @param {{ level?: string, verbose?: boolean }} [opts]
 * @returns {string} plog level name (`off`|`error`|`warn`|`info`|`debug`|`trace`)
 */
export function parseForgeLogLevel(env = {}, opts = {}) {
  if (opts.level != null && String(opts.level).trim() !== "") {
    return normalizeLevel(opts.level);
  }
  const raw = env.FORGE_LOG_LEVEL;
  if (raw != null && String(raw).trim() !== "") {
    return normalizeLevel(raw);
  }
  if (opts.verbose || isTruthy(env.FORGE_LOG_DEBUG) || isTruthy(env.FORGE_VERBOSE)) {
    return "debug";
  }
  return "warn";
}

function resolveTee(env, opts) {
  if (opts.tee != null && String(opts.tee).trim() !== "") {
    const t = String(opts.tee).trim().toLowerCase();
    return TEE_VALUES.has(t) ? t : "none";
  }
  const raw = env.FORGE_LOG_TEE;
  if (raw != null && String(raw).trim() !== "") {
    const t = String(raw).trim().toLowerCase();
    return TEE_VALUES.has(t) ? t : "none";
  }
  return "none";
}

function resolveFile(env, opts) {
  if (opts.file !== undefined) return opts.file;
  const raw = env.FORGE_LOG_FILE;
  if (raw === "") return null;
  if (raw != null) return String(raw);
  return null;
}

/**
 * Initialize vendored Node plog for CLI. Idempotent after first success.
 * @param {{
 *   env?: NodeJS.ProcessEnv|Record<string, string|undefined>,
 *   level?: string,
 *   verbose?: boolean,
 *   tee?: string,
 *   file?: string | null,
 *   errorFile?: string | null,
 *   sessionId?: string,
 *   now?: () => string,
 *   randomId?: () => string,
 * }} [opts]
 * @returns {typeof log}
 */
export function initForgePlog(opts = {}) {
  const env = opts.env ?? process.env;
  const parsed = parseForgeLogLevel(env, opts);
  quiet = parsed === "off";
  const level = quiet ? "error" : parsed;
  const tee = quiet ? "none" : resolveTee(env, opts);
  const file = quiet ? null : resolveFile(env, opts);
  /** @type {Record<string, unknown>} */
  const initOpts = {
    level,
    tee,
    file,
    errorFile: opts.errorFile !== undefined ? opts.errorFile : null,
  };
  if (opts.sessionId !== undefined) initOpts.sessionId = opts.sessionId;
  if (typeof opts.now === "function") initOpts.now = opts.now;
  if (typeof opts.randomId === "function") initOpts.randomId = opts.randomId;
  try {
    logInit(initOpts);
  } catch {
    try {
      logInit({ level: "warn", tee: "none", file: null, errorFile: null });
      quiet = false;
    } catch {
      quiet = true;
    }
  }
  ready = true;
  return log;
}

function emit(level, args) {
  if (quiet) return "";
  try {
    if (!ready) initForgePlog();
    return log[level](...args);
  } catch {
    return "";
  }
}

export const forgeLog = {
  init: initForgePlog,
  trace: (...args) => emit("trace", args),
  debug: (...args) => emit("debug", args),
  info: (...args) => emit("info", args),
  warn: (...args) => emit("warn", args),
  error: (...args) => emit("error", args),
};

export function ensureForgePlog(opts = {}) {
  if (!ready) initForgePlog(opts);
  return forgeLog;
}

export function resetForgePlogForTests() {
  ready = false;
  quiet = false;
  try {
    logInit({
      level: "warn",
      tee: "none",
      file: null,
      errorFile: null,
      sessionId: "test0",
    });
  } catch {
    /* ignore */
  }
}
