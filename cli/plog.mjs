/**
 * Node CLI plog init. Imports vendored third_party/pansi/plog.js (Node builtins).
 * GJS / extension must not import this module — use lib/shared/plog-adapter.js.
 */
// @ts-nocheck — Node builtins; typed boundary is forgeLog / parseForgeLogLevel.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log, logInit, LEVELS, actions } from "../third_party/pansi/plog.js";
import { resolveDefaultLogFile } from "../lib/shared/plog-adapter.js";

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

/** Mirror forge prefs labels as plog custom levels (emit via stock methods). */
const FORGE_PLOG_LEVELS = ["all", "trace", "debug", "info", "warn", "error", "fatal"];

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
  if (s === "all") return "trace";
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

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @param {{ file?: string | null }} opts
 * @returns {string | null}
 */
function resolveFile(env, opts) {
  if (opts.file !== undefined) return opts.file;
  const raw = env.FORGE_LOG_FILE;
  if (raw === "") return null;
  if (raw != null) return String(raw);
  // Same default as extension dual-sink file
  return resolveDefaultLogFile({
    envGet: (k) => env[k],
    homeDir: () => os.homedir(),
    pathJoin: (a, b) => path.join(a, b),
    dirname: (p) => path.dirname(p),
  });
}

function ensureParentDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Dual-sink pipelines: file gets all levels at/above min; stderr/console
 * (tee) only for info/warn/error — mirrors extension journal policy.
 * @param {string | null} file
 * @param {boolean} wantConsole
 */
function buildDualActions(file, wantConsole) {
  const fileAction = file ? actions.toFile(file) : null;
  /** @param {string} level */
  function pipeline(level) {
    /** @type {import("../third_party/pansi/plog.js").PlogAction[]} */
    const list = [];
    if (fileAction) list.push(fileAction);
    const journalish =
      level === "info" || level === "warn" || level === "error" || level === "fatal";
    if (wantConsole && journalish) list.push(actions.toConsole);
    return list;
  }
  /** @type {Record<string, ReturnType<typeof pipeline>>} */
  const out = {};
  for (const level of FORGE_PLOG_LEVELS) {
    out[level] = pipeline(level);
  }
  return out;
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
  const wantConsole = tee !== "none";

  if (file) ensureParentDir(file);

  /** @type {Record<string, unknown>} */
  const initOpts = {
    level,
    file: null,
    console: false,
    levels: [...FORGE_PLOG_LEVELS],
    actions: quiet
      ? Object.fromEntries(FORGE_PLOG_LEVELS.map((l) => [l, []]))
      : buildDualActions(file, wantConsole),
    errorFile: opts.errorFile !== undefined ? opts.errorFile : null,
  };
  if (opts.sessionId !== undefined) initOpts.sessionId = opts.sessionId;
  if (typeof opts.now === "function") initOpts.now = opts.now;
  if (typeof opts.randomId === "function") initOpts.randomId = opts.randomId;
  try {
    logInit(initOpts);
  } catch {
    try {
      logInit({
        level: "warn",
        file: null,
        console: false,
        actions: { warn: [actions.toConsole], error: [actions.toConsole] },
      });
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
      file: null,
      console: false,
      actions: {
        trace: [],
        debug: [],
        info: [],
        warn: [],
        error: [],
      },
      sessionId: "test0",
    });
  } catch {
    /* ignore */
  }
}
