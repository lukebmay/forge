/*
 * Forge logging facade over vendored plog (D064 action pipelines).
 * GJS: setPlogRuntime(createGjsRuntime) before init (extension.js).
 * Node/vitest: setPlogRuntime(createNodeRuntime) in tests/setup.js.
 * Dual sink: file = TRACE…ERROR; journal = INFO/WARN/ERROR only.
 */

import { production } from "./production.js";
import { createPlog } from "../../third_party/pansi/plog-core.js";

/** @typedef {'off'|'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'all'} LogLevelName */

/**
 * @typedef {import("../../third_party/pansi/plog-core.js").PlogRuntime} PlogRuntime
 * @typedef {{ level: string, ansiText: string, plainText: string, originalArgs?: unknown[] }} PlogRecord
 */

export const LOG_LEVELS = Object.freeze({
  OFF: 0,
  FATAL: 1,
  ERROR: 2,
  WARN: 3,
  INFO: 4,
  DEBUG: 5,
  TRACE: 6,
  ALL: 7,
});

const NAME_BY_NUM = Object.freeze({
  0: "OFF",
  1: "FATAL",
  2: "ERROR",
  3: "WARN",
  4: "INFO",
  5: "DEBUG",
  6: "TRACE",
  7: "ALL",
});

/** gsettings / forge numeric → plog stock min level (OFF handled separately). */
const NUM_TO_PLOG_MIN = Object.freeze({
  1: "error",
  2: "error",
  3: "warn",
  4: "info",
  5: "debug",
  6: "trace",
  7: "trace",
});

/**
 * Custom plog level table mirroring forge prefs labels.
 * Stock emit methods cover trace…error; fatal → error pipeline with FATAL tag;
 * all/off are threshold aliases (not emit targets).
 */
export const FORGE_PLOG_LEVELS = Object.freeze([
  "all",
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

/** @type {null | { get_boolean?: (k: string) => boolean, get_uint?: (k: string) => number }} */
let settings = null;

/** @type {null | ((...args: unknown[]) => void)} */
let journalSink = null;

/** @type {null | (() => PlogRuntime)} */
let runtimeFactory = null;

/** @type {PlogRuntime | null} */
let runtime = null;

/** @type {ReturnType<typeof createPlog> | null} */
let api = null;

/** @type {string | null | undefined} */
let fileOverride = undefined;

/** @type {((dir: string) => void) | null} */
let ensureDirFn = null;

/** @type {boolean} */
let quiet = false;

/**
 * Inject plog I/O runtime (GJS Gio or Node fs). Required before first emit.
 * @param {() => PlogRuntime} factory
 */
export function setPlogRuntime(factory) {
  runtimeFactory = factory;
  runtime = null;
  api = null;
}

/**
 * @param {typeof settings} s
 * @param {{
 *   sink?: (...args: unknown[]) => void,
 *   runtime?: PlogRuntime,
 *   file?: string | null,
 *   ensureDir?: (dir: string) => void,
 *   truncateFile?: boolean,
 * }} [opts]
 */
export function init(s, opts = {}) {
  settings = s ?? null;
  if (opts.sink) journalSink = opts.sink;
  if (opts.file !== undefined) fileOverride = opts.file;
  if (opts.ensureDir) ensureDirFn = opts.ensureDir;

  if (opts.runtime) {
    runtime = opts.runtime;
    api = createPlog(runtime);
  } else if (runtimeFactory) {
    runtime = runtimeFactory();
    api = createPlog(runtime);
  } else if (!api) {
    api = null;
    runtime = null;
  }

  // Extension enable passes truncateFile:true — empty hunt file per Shell session.
  // CLI shares the path and must not truncate (default false).
  reconfigure({ truncateFile: opts.truncateFile === true });
}

/** Test / CLI override for journal lines. */
export function setSink(fn) {
  journalSink = fn;
  if (api) reconfigure();
}

export function resetForTests() {
  settings = null;
  journalSink = null;
  fileOverride = undefined;
  ensureDirFn = null;
  quiet = false;
  if (api) {
    try {
      api.log.init({
        level: "error",
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
  api = null;
  runtime = null;
}

/**
 * Default independent log path.
 * FORGE_LOG_FILE wins; nest (FORGE_CONFIG_HOME) → sibling forge.log; else
 * $XDG_STATE_HOME/forge/forge.log.
 * @param {{
 *   envGet?: (k: string) => string | undefined | null,
 *   homeDir?: () => string | null,
 *   pathJoin?: (a: string, b: string) => string,
 *   dirname?: (p: string) => string,
 * }} [rt]
 * @returns {string | null}
 */
export function resolveDefaultLogFile(rt = {}) {
  const envGet = rt.envGet || (() => undefined);
  const pathJoin =
    rt.pathJoin || ((a, b) => `${String(a).replace(/\/+$/, "")}/${String(b).replace(/^\/+/, "")}`);
  const dirname =
    rt.dirname ||
    ((p) => {
      const s = String(p);
      const i = s.lastIndexOf("/");
      return i <= 0 ? "/" : s.slice(0, i);
    });
  const homeDir = rt.homeDir || (() => null);

  const explicit = envGet("FORGE_LOG_FILE");
  if (explicit === "") return null;
  if (explicit != null && String(explicit).length) return String(explicit);

  const configHome = envGet("FORGE_CONFIG_HOME");
  if (configHome != null && String(configHome).trim()) {
    return pathJoin(dirname(String(configHome).trim()), "forge.log");
  }

  const xdg = envGet("XDG_STATE_HOME");
  const state =
    xdg != null && String(xdg).trim()
      ? String(xdg).trim()
      : pathJoin(homeDir() || "/tmp", ".local/state");
  return pathJoin(pathJoin(state, "forge"), "forge.log");
}

/**
 * Effective numeric level (prefs / production).
 * @returns {number}
 */
export function effectiveLevel() {
  if (production) return LOG_LEVELS.OFF;
  if (!settings) return LOG_LEVELS.DEBUG;
  if (settings.get_boolean && !settings.get_boolean("logging-enabled")) {
    return LOG_LEVELS.OFF;
  }
  const n = settings.get_uint?.("log-level");
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return LOG_LEVELS.DEBUG;
}

/** @returns {boolean} */
export function isDebugEnabled() {
  return effectiveLevel() >= LOG_LEVELS.DEBUG;
}

/** @returns {boolean} */
export function isTraceEnabled() {
  return effectiveLevel() >= LOG_LEVELS.TRACE;
}

/**
 * Legacy Logger gating used `level > threshold` (not >=).
 * @param {number} methodThreshold
 */
function shouldEmit(methodThreshold) {
  return effectiveLevel() > methodThreshold;
}

function ensureApi() {
  if (api) return api;
  if (runtimeFactory) {
    runtime = runtimeFactory();
    api = createPlog(runtime);
    reconfigure();
    return api;
  }
  return null;
}

const TAG_FATAL = "__forge_tag_FATAL__";
const TAG_LOG = "__forge_tag_LOG__";

/**
 * Journal action: Shell log / test sink. Prefer originalArgs (legacy shape).
 * @param {PlogRecord} record
 */
function toJournal(record) {
  const write =
    journalSink ||
    (typeof globalThis.log === "function"
      ? globalThis.log.bind(globalThis)
      : (...a) => {
          console.error(...a);
        });
  /** @type {unknown[]} */
  let args = Array.isArray(record.originalArgs) ? record.originalArgs.slice() : [];
  // Drop leading +style tokens from pstr grammar
  while (args.length && typeof args[0] === "string" && /^\+[A-Za-z0-9*~hH]*$/.test(args[0])) {
    args.shift();
  }
  let tag = String(record.level || "").toUpperCase();
  if (args[0] === TAG_FATAL) {
    tag = "FATAL";
    args.shift();
  } else if (args[0] === TAG_LOG) {
    tag = "LOG";
    args.shift();
  }
  write(`[Forge] [${tag}]`, ...args);
}

/** @param {number} n */
function plogMinForEffective(n) {
  if (n <= LOG_LEVELS.OFF) return null;
  return NUM_TO_PLOG_MIN[n] || "info";
}

/**
 * @param {{ truncateFile?: boolean }} [opts]
 */
function reconfigure(opts = {}) {
  const a = api;
  if (!a) return;

  const eff = effectiveLevel();
  quiet = eff <= LOG_LEVELS.OFF;
  if (quiet) {
    a.log.init({
      level: "error",
      file: null,
      console: false,
      levels: [...FORGE_PLOG_LEVELS],
      actions: Object.fromEntries(FORGE_PLOG_LEVELS.map((l) => [l, []])),
      sessionId: "forge",
    });
    return;
  }

  /** @type {string | null} */
  let file =
    fileOverride !== undefined
      ? fileOverride
      : resolveDefaultLogFile(
          runtime
            ? {
                envGet: (k) => runtime.envGet(k),
                homeDir: () => runtime.homeDir(),
                pathJoin: (x, y) => runtime.pathJoin(x, y),
                dirname: (p) => runtime.dirname(p),
              }
            : {}
        );

  if (file && ensureDirFn && runtime) {
    try {
      ensureDirFn(runtime.dirname(file));
    } catch {
      /* best-effort */
    }
  }

  if (file && opts.truncateFile && runtime?.truncateFile) {
    try {
      runtime.truncateFile(file);
    } catch {
      /* best-effort */
    }
  }

  const min = plogMinForEffective(eff) || "info";
  const fileAction = file ? a.actions.toFile(file) : null;

  /** @param {string} level */
  function pipeline(level) {
    /** @type {((r: PlogRecord) => void)[]} */
    const list = [];
    if (fileAction) list.push(fileAction);
    // Journal: INFO+ only. TRACE/DEBUG stay file-only.
    if (level === "info" || level === "warn" || level === "error" || level === "fatal") {
      list.push(toJournal);
    }
    return list;
  }

  /** @type {Record<string, ReturnType<typeof pipeline>>} */
  const actionsMap = {};
  for (const level of FORGE_PLOG_LEVELS) {
    actionsMap[level] = pipeline(level);
  }

  a.log.init({
    level: min,
    file: null,
    console: false,
    levels: [...FORGE_PLOG_LEVELS],
    actions: actionsMap,
  });
}

/**
 * @param {string} level
 * @param {unknown[]} args
 */
function emitPlog(level, args) {
  const a = ensureApi();
  if (!a || quiet) {
    if (!a && !quiet) emitLegacy(level, args);
    return;
  }
  try {
    if (level === "fatal") {
      a.log.error(TAG_FATAL, ...args);
      return;
    }
    if (level === "log") {
      // Unleveled: must clear plog min (FATAL threshold → min error).
      const min = String(a.log.options?.level || "info");
      if (min === "error") a.log.error(TAG_LOG, ...args);
      else if (min === "warn") a.log.warn(TAG_LOG, ...args);
      else a.log.info(TAG_LOG, ...args);
      return;
    }
    const fn = a.log[level];
    if (typeof fn === "function") fn(...args);
  } catch {
    emitLegacy(level, args);
  }
}

/** Fallback when plog runtime was never bound. */
function emitLegacy(tag, args) {
  const write =
    journalSink ||
    (typeof globalThis.log === "function"
      ? globalThis.log.bind(globalThis)
      : (...a) => {
          console.error(...a);
        });
  write(`[Forge] [${String(tag).toUpperCase()}]`, ...args);
}

/**
 * @param {unknown} msg
 * @param {...unknown} params
 * @returns {string}
 */
export function format(msg, ...params) {
  /** @type {string} */
  let out = String(msg);
  for (const val of params) {
    out = out.replace("{}", String(val));
  }
  return out;
}

/** @param {...unknown} args */
export function fatal(...args) {
  if (shouldEmit(LOG_LEVELS.OFF)) emitPlog("fatal", args);
}

/** @param {...unknown} args */
export function error(...args) {
  if (shouldEmit(LOG_LEVELS.FATAL)) emitPlog("error", args);
}

/** @param {...unknown} args */
export function warn(...args) {
  if (shouldEmit(LOG_LEVELS.ERROR)) emitPlog("warn", args);
}

/** @param {...unknown} args */
export function info(...args) {
  if (shouldEmit(LOG_LEVELS.WARN)) emitPlog("info", args);
}

/** @param {...unknown} args */
export function debug(...args) {
  if (shouldEmit(LOG_LEVELS.INFO)) emitPlog("debug", args);
}

/** @param {...unknown} args */
export function trace(...args) {
  if (shouldEmit(LOG_LEVELS.DEBUG)) emitPlog("trace", args);
}

/** Unleveled log — any level above OFF. */
/** @param {...unknown} args */
export function log(...args) {
  if (shouldEmit(LOG_LEVELS.OFF)) emitPlog("log", args);
}

/** plog-style namespace for new call sites. */
export const plog = {
  init,
  setSink,
  setPlogRuntime,
  resolveDefaultLogFile,
  effectiveLevel,
  isDebugEnabled,
  isTraceEnabled,
  format,
  fatal,
  error,
  warn,
  info,
  debug,
  trace,
  log,
  LEVELS: LOG_LEVELS,
  FORGE_PLOG_LEVELS,
  levelName(n = effectiveLevel()) {
    return NAME_BY_NUM[n] ?? String(n);
  },
};

export default plog;
