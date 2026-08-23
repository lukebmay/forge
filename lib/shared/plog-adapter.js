/*
 * Forge logging facade over vendored plog (D064/D066 action pipelines).
 * GJS: setPlogRuntime(createGjsRuntime) before init (extension.js).
 * Node/vitest: setPlogRuntime(createNodeRuntime) in tests/setup.js.
 * Dual sink: file(+jsonl) = at/above effective; journal = WARN/ERROR/fatal only.
 * Fields policy (D054): warn/error/fatal flatten `{ fields }` into the message
 * (journal parity); info/debug/trace may keep structured fields for JSONL.
 */

import { createPlog } from "../../third_party/pansi/plog-core.js";

/** @typedef {'off'|'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'all'} LogLevelName */

/**
 * @typedef {import("../../third_party/pansi/plog-core.js").PlogRuntime} PlogRuntime
 * @typedef {{
 *   level: string,
 *   ansiText: string,
 *   plainText: string,
 *   originalArgs?: unknown[],
 *   fields?: unknown,
 *   id?: string,
 *   levelN?: number,
 * }} PlogRecord
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

/** @type {null | {
 *   get_boolean?: (k: string) => boolean,
 *   get_uint?: (k: string) => number,
 *   connect?: (sig: string, cb: (...a: unknown[]) => void) => number,
 *   disconnect?: (id: number) => void,
 * }} */
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

/** Session override; wins over durable until clear/disable/enable. */
/** @type {number | null} */
let sessionLevelOverride = null;

/** @type {number[]} */
let settingsWatchIds = [];

/** CLI / DBus level names → numeric (schema 0–7). */
export const LEVEL_NAME_TO_NUM = Object.freeze({
  off: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  warning: 3,
  info: 4,
  debug: 5,
  trace: 6,
  all: 7,
});

/**
 * Inject plog I/O runtime (GJS Gio or Node fs). Required before first emit.
 * @param {() => PlogRuntime} factory
 */
export function setPlogRuntime(factory) {
  runtimeFactory = factory;
  runtime = null;
  api = null;
}

function disconnectSettingsWatch() {
  if (settings?.disconnect) {
    for (const id of settingsWatchIds) {
      try {
        settings.disconnect(id);
      } catch {
        /* ignore */
      }
    }
  }
  settingsWatchIds = [];
}

/** Live gsettings → plog min (no truncate). */
function connectSettingsWatch() {
  disconnectSettingsWatch();
  if (!settings?.connect) return;
  const onChange = () => reconfigure();
  for (const key of ["log-level", "logging-enabled"]) {
    try {
      settingsWatchIds.push(settings.connect(`changed::${key}`, onChange));
    } catch {
      /* ignore */
    }
  }
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
  disconnectSettingsWatch();
  settings = s ?? null;
  sessionLevelOverride = null;
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
  connectSettingsWatch();
}

/** Test / CLI override for journal lines. */
export function setSink(fn) {
  journalSink = fn;
  if (api) reconfigure();
}

/** Clear session override + settings watch (extension disable). */
export function shutdownLogging() {
  disconnectSettingsWatch();
  sessionLevelOverride = null;
  settings = null;
}

export function resetForTests() {
  disconnectSettingsWatch();
  sessionLevelOverride = null;
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
 * Sibling `.jsonl` path for a human `.log` tape (D066 derivation).
 * @param {string} filePath
 * @param {{
 *   pathJoin?: (a: string, b: string) => string,
 *   dirname?: (p: string) => string,
 * }} [rt]
 * @returns {string}
 */
export function siblingJsonlPath(filePath, rt = {}) {
  const pathJoin =
    rt.pathJoin || ((a, b) => `${String(a).replace(/\/+$/, "")}/${String(b).replace(/^\/+/, "")}`);
  const dirname =
    rt.dirname ||
    ((p) => {
      const s = String(p);
      const i = s.lastIndexOf("/");
      return i <= 0 ? "/" : s.slice(0, i);
    });
  const s = String(filePath);
  const base = s.slice(s.lastIndexOf("/") + 1);
  const dir = dirname(s);
  const i = base.lastIndexOf(".");
  if (i > 0) return pathJoin(dir, `${base.slice(0, i)}.jsonl`);
  return pathJoin(dir, `${base}.jsonl`);
}

/**
 * Resolve JSONL tape path for forge (product default: ON beside hunt file).
 * FORGE_LOG_JSONL: unset/`1`/`true` → sibling of log file; `0`/`false`/`off`/"" → off;
 * other non-empty → explicit path.
 * @param {string | null} logFile
 * @param {{
 *   envGet?: (k: string) => string | undefined | null,
 *   pathJoin?: (a: string, b: string) => string,
 *   dirname?: (p: string) => string,
 * }} [rt]
 * @returns {string | null}
 */
export function resolveJsonlFile(logFile, rt = {}) {
  const envGet = rt.envGet || (() => undefined);
  const raw = envGet("FORGE_LOG_JSONL");
  if (raw != null) {
    const s = String(raw).trim();
    const lower = s.toLowerCase();
    if (s === "" || lower === "0" || lower === "false" || lower === "no" || lower === "off") {
      return null;
    }
    if (lower !== "1" && lower !== "true" && lower !== "yes" && lower !== "on") {
      return s;
    }
  }
  if (logFile == null || !String(logFile).length) return null;
  return siblingJsonlPath(String(logFile), rt);
}

/**
 * @param {unknown[]} args
 * @returns {{ messageArgs: unknown[], fields: unknown | undefined }}
 */
export function peelTrailingFields(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return { messageArgs: Array.isArray(args) ? args.slice() : [], fields: undefined };
  }
  const last = args[args.length - 1];
  if (
    last != null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    Object.prototype.hasOwnProperty.call(last, "fields")
  ) {
    const raw = /** @type {{ fields?: unknown }} */ (last).fields;
    return {
      messageArgs: args.slice(0, -1),
      fields: raw === undefined ? {} : raw,
    };
  }
  return { messageArgs: args.slice(), fields: undefined };
}

/**
 * Flatten fields into a message suffix for journal-parity levels (D054).
 * @param {unknown} fields
 * @returns {string}
 */
export function formatFieldsSuffix(fields) {
  if (fields == null || typeof fields !== "object" || Array.isArray(fields)) return "";
  /** @type {string[]} */
  const parts = [];
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (fields))) {
    if (v === undefined) continue;
    parts.push(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  return parts.join(" ");
}

/**
 * @param {string | number} raw
 * @returns {{ ok: true, num: number, name: string } | { ok: false, error: string }}
 */
export function parseLevelName(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n < 0 || n > 7) {
      return { ok: false, error: `log level out of range 0–7: ${raw}` };
    }
    return { ok: true, num: n, name: NAME_BY_NUM[n] ?? String(n) };
  }
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return { ok: false, error: "log level required" };
  if (Object.prototype.hasOwnProperty.call(LEVEL_NAME_TO_NUM, s)) {
    const num = LEVEL_NAME_TO_NUM[/** @type {keyof typeof LEVEL_NAME_TO_NUM} */ (s)];
    return { ok: true, num, name: NAME_BY_NUM[num] ?? s.toUpperCase() };
  }
  if (/^\d+$/.test(s)) {
    return parseLevelName(Number(s));
  }
  return {
    ok: false,
    error: `unknown log level ${JSON.stringify(raw)} (off|error|warn|info|debug|trace|…)`,
  };
}

/**
 * Durable prefs level (ignores session override).
 * @returns {number}
 */
export function durableLevel() {
  if (!settings) return LOG_LEVELS.DEBUG;
  if (settings.get_boolean && !settings.get_boolean("logging-enabled")) {
    return LOG_LEVELS.OFF;
  }
  const n = settings.get_uint?.("log-level");
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return LOG_LEVELS.DEBUG;
}

/** @returns {number | null} */
export function sessionLevel() {
  return sessionLevelOverride;
}

/**
 * Effective numeric level (session → durable). production does not force OFF.
 * @returns {number}
 */
export function effectiveLevel() {
  if (sessionLevelOverride != null) return sessionLevelOverride;
  return durableLevel();
}

/** POSIX-ish join/dirname — avoid GLib.path_get_* (often unmocked in unit tests). */
function stringPathJoin(a, b) {
  return `${String(a).replace(/\/+$/, "")}/${String(b).replace(/^\/+/, "")}`;
}

/** @param {string} p */
function stringDirname(p) {
  const s = String(p);
  const i = s.lastIndexOf("/");
  return i <= 0 ? "/" : s.slice(0, i);
}

/**
 * @returns {{
 *   envGet: (k: string) => string | undefined | null,
 *   homeDir: () => string | null,
 *   pathJoin: (a: string, b: string) => string,
 *   dirname: (p: string) => string,
 * }}
 */
function pathRt() {
  if (runtime) {
    return {
      envGet: (k) => runtime.envGet(k),
      homeDir: () => runtime.homeDir(),
      pathJoin: stringPathJoin,
      dirname: stringDirname,
    };
  }
  return {
    envGet: () => undefined,
    homeDir: () => null,
    pathJoin: stringPathJoin,
    dirname: stringDirname,
  };
}

/**
 * @returns {{
 *   durable: { enabled: boolean, level: number, levelName: string },
 *   session: { level: number, levelName: string } | null,
 *   effective: { level: number, levelName: string },
 *   file: string | null,
 *   jsonl: string | null,
 * }}
 */
export function getLogStatus() {
  let enabled = true;
  if (settings?.get_boolean) enabled = !!settings.get_boolean("logging-enabled");

  const durNum = durableLevel();
  const effNum = effectiveLevel();
  /** @type {{ level: number, levelName: string } | null} */
  let session = null;
  if (sessionLevelOverride != null) {
    session = {
      level: sessionLevelOverride,
      levelName: NAME_BY_NUM[sessionLevelOverride] ?? String(sessionLevelOverride),
    };
  }

  const rt = pathRt();
  /** @type {string | null} */
  let file = fileOverride !== undefined ? fileOverride : resolveDefaultLogFile(rt);
  const jsonl = resolveJsonlFile(file, rt);

  return {
    durable: {
      enabled,
      level: durNum,
      levelName: NAME_BY_NUM[durNum] ?? String(durNum),
    },
    session,
    effective: {
      level: effNum,
      levelName: NAME_BY_NUM[effNum] ?? String(effNum),
    },
    file,
    jsonl,
  };
}

/**
 * @param {number | null} level null clears session override
 * @returns {ReturnType<typeof getLogStatus>}
 */
export function setSessionLevel(level) {
  if (level == null) {
    sessionLevelOverride = null;
  } else {
    const n = Math.trunc(Number(level));
    if (!Number.isFinite(n) || n < 0 || n > 7) {
      throw new Error(`session log level out of range 0–7: ${level}`);
    }
    sessionLevelOverride = n;
  }
  reconfigure();
  return getLogStatus();
}

/** @returns {ReturnType<typeof getLogStatus>} */
export function clearSessionLevel() {
  return setSessionLevel(null);
}

/** Empty hunt file now (same as enable truncate). */
/** @returns {ReturnType<typeof getLogStatus>} */
export function truncateLogFile() {
  reconfigure({ truncateFile: true });
  return getLogStatus();
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
      jsonl: false,
      console: false,
      levels: [...FORGE_PLOG_LEVELS],
      actions: Object.fromEntries(FORGE_PLOG_LEVELS.map((l) => [l, []])),
      sessionId: "forge",
    });
    return;
  }

  const rt = pathRt();
  /** @type {string | null} */
  let file = fileOverride !== undefined ? fileOverride : resolveDefaultLogFile(rt);
  const jsonl = resolveJsonlFile(file, rt);

  if (file && ensureDirFn && runtime) {
    try {
      ensureDirFn(runtime.dirname(file));
    } catch {
      /* best-effort */
    }
  }
  if (jsonl && ensureDirFn && runtime) {
    try {
      ensureDirFn(runtime.dirname(jsonl));
    } catch {
      /* best-effort */
    }
  }

  if (opts.truncateFile && runtime?.truncateFile) {
    for (const p of [file, jsonl]) {
      if (!p) continue;
      try {
        runtime.truncateFile(p);
      } catch {
        /* best-effort */
      }
    }
  }

  const min = plogMinForEffective(eff) || "info";
  const fileAction = file ? a.actions.toFile(file) : null;
  const jsonlAction = jsonl ? a.actions.toJsonl(jsonl) : null;

  /** @param {string} level */
  function pipeline(level) {
    /** @type {((r: PlogRecord) => void)[]} */
    const list = [];
    if (fileAction) list.push(fileAction);
    if (jsonlAction) list.push(jsonlAction);
    // Journal: WARN+ only. INFO/DEBUG/TRACE stay file/jsonl-only.
    if (level === "warn" || level === "error" || level === "fatal") {
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
    jsonl: false,
    console: false,
    levels: [...FORGE_PLOG_LEVELS],
    actions: actionsMap,
  });
}

/**
 * Journal-parity levels: fold `{ fields }` into the message so journal text
 * matches the human `.log` line (D054). info/debug/trace keep structured fields.
 * @param {string} level
 * @param {unknown[]} args
 * @returns {unknown[]}
 */
function argsForEmit(level, args) {
  const journalish = level === "warn" || level === "error" || level === "fatal";
  if (!journalish) return args;
  const peeled = peelTrailingFields(args);
  if (peeled.fields === undefined) return args;
  const suffix = formatFieldsSuffix(peeled.fields);
  if (!suffix) return peeled.messageArgs;
  return [...peeled.messageArgs, suffix];
}

/**
 * @param {string} level
 * @param {unknown[]} args
 */
function emitPlog(level, args) {
  const a = ensureApi();
  const emitArgs = argsForEmit(level, args);
  if (!a || quiet) {
    if (!a && !quiet) emitLegacy(level, emitArgs);
    return;
  }
  try {
    if (level === "fatal") {
      a.log.error(TAG_FATAL, ...emitArgs);
      return;
    }
    if (level === "log") {
      // Unleveled: must clear plog min (FATAL threshold → min error).
      const min = String(a.log.options?.level || "info");
      if (min === "error") a.log.error(TAG_LOG, ...emitArgs);
      else if (min === "warn") a.log.warn(TAG_LOG, ...emitArgs);
      else a.log.info(TAG_LOG, ...emitArgs);
      return;
    }
    const fn = a.log[level];
    if (typeof fn === "function") fn(...emitArgs);
  } catch {
    emitLegacy(level, emitArgs);
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
  shutdownLogging,
  resolveDefaultLogFile,
  siblingJsonlPath,
  resolveJsonlFile,
  peelTrailingFields,
  formatFieldsSuffix,
  parseLevelName,
  durableLevel,
  sessionLevel,
  effectiveLevel,
  getLogStatus,
  setSessionLevel,
  clearSessionLevel,
  truncateLogFile,
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
  LEVEL_NAME_TO_NUM,
  levelName(n = effectiveLevel()) {
    return NAME_BY_NUM[n] ?? String(n);
  },
};

export default plog;
