/*
 * Forge logging facade. GJS-safe sink; Node CLI may also use third_party/pansi/plog.js.
 * Level filter: a call at L emits only when effective level >= L (numeric table below).
 */

import { production } from "./settings.js";

/** @typedef {'off'|'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'all'} LogLevelName */

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

/** @type {null | { get_boolean?: (k: string) => boolean, get_uint?: (k: string) => number }} */
let settings = null;

/** @type {null | ((...args: unknown[]) => void)} */
let sink = null;

/**
 * @param {typeof settings} s
 * @param {{ sink?: (...args: unknown[]) => void }} [opts]
 */
export function init(s, opts = {}) {
  settings = s ?? null;
  if (opts.sink) sink = opts.sink;
}

/** Test / CLI override. */
export function setSink(fn) {
  sink = fn;
}

export function resetForTests() {
  settings = null;
  sink = null;
}

/**
 * Effective numeric level.
 * - production → OFF
 * - logging-enabled false → OFF (explicit quiet)
 * - no settings yet + !production → DEBUG (dev default before gsettings)
 * - else gsettings log-level
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

export function isDebugEnabled() {
  return effectiveLevel() >= LOG_LEVELS.DEBUG;
}

export function isTraceEnabled() {
  return effectiveLevel() >= LOG_LEVELS.TRACE;
}

/**
 * Legacy Logger gating used `level > threshold` (not >=). Keep that so
 * existing call sites and tests stay equivalent.
 * @param {number} methodThreshold  method's own level (FATAL=1 … TRACE=6); LOG uses 0
 */
function shouldEmit(methodThreshold) {
  return effectiveLevel() > methodThreshold;
}

function emit(tag, args) {
  const write =
    sink ||
    (typeof globalThis.log === "function"
      ? globalThis.log.bind(globalThis)
      : (...a) => {
          // Node / vitest fallback
          console.error(...a);
        });
  write(`[Forge] [${tag}]`, ...args);
}

export function format(msg, ...params) {
  return params.reduce((acc, val) => acc.replace("{}", String(val)), String(msg));
}

export function fatal(...args) {
  if (shouldEmit(LOG_LEVELS.OFF)) emit("FATAL", args);
}

export function error(...args) {
  if (shouldEmit(LOG_LEVELS.FATAL)) emit("ERROR", args);
}

export function warn(...args) {
  if (shouldEmit(LOG_LEVELS.ERROR)) emit("WARN", args);
}

export function info(...args) {
  if (shouldEmit(LOG_LEVELS.WARN)) emit("INFO", args);
}

export function debug(...args) {
  if (shouldEmit(LOG_LEVELS.INFO)) emit("DEBUG", args);
}

export function trace(...args) {
  if (shouldEmit(LOG_LEVELS.DEBUG)) emit("TRACE", args);
}

/** Unleveled log — any level above OFF. */
export function log(...args) {
  if (shouldEmit(LOG_LEVELS.OFF)) emit("LOG", args);
}

/** plog-style namespace for new call sites. */
export const plog = {
  init,
  setSink,
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
  levelName(n = effectiveLevel()) {
    return NAME_BY_NUM[n] ?? String(n);
  },
};

export default plog;
