// @ts-check
/**
 * Prototype-local logger — plog line grammar, single sink, not forge tapes.
 * Default sink: console + in-memory ring (no JSONL, no forge paths).
 * Node tests may pass `append` for a file sink.
 */

/** @typedef {'trace'|'debug'|'info'|'warn'|'error'} Level */

const LEVEL_N = /** @type {const} */ ({
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
});

/** @type {Level} */
let minLevel = "debug";
let sessionId = "motion";
/** @type {string[]} */
const ring = [];
const RING_MAX = 500;
/** @type {((line: string) => void) | null} */
let appendSink = null;
let consoleSink = true;

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

/**
 * @param {Level} level
 * @param {string} msg
 * @param {Record<string, unknown>} [fields]
 */
function emit(level, msg, fields) {
  if (LEVEL_N[level] < LEVEL_N[minLevel]) return "";
  const extra =
    fields && Object.keys(fields).length
      ? " " +
        Object.entries(fields)
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(" ")
      : "";
  const line = `${nowStamp()} ${level.toUpperCase()} [${sessionId}] | ${msg}${extra}`;
  ring.push(line);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  if (consoleSink) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(line);
  }
  if (appendSink) {
    try {
      appendSink(line + "\n");
    } catch {
      /* ignore */
    }
  }
  return line;
}

/**
 * @param {{
 *   level?: Level | string,
 *   sessionId?: string,
 *   console?: boolean,
 *   append?: ((chunk: string) => void) | null,
 * }} [opts]
 */
export function initMotionPlog(opts = {}) {
  const lvl = /** @type {Level} */ (opts.level || "debug");
  if (lvl in LEVEL_N) minLevel = lvl;
  if (opts.sessionId) sessionId = opts.sessionId;
  if (opts.console != null) consoleSink = !!opts.console;
  appendSink = opts.append ?? null;
  return motionLog;
}

export const motionLog = {
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  trace: (msg, fields) => emit("trace", msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  debug: (msg, fields) => emit("debug", msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  info: (msg, fields) => emit("info", msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  warn: (msg, fields) => emit("warn", msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  error: (msg, fields) => emit("error", msg, fields),
  getLines: () => ring.slice(),
  clear: () => {
    ring.length = 0;
  },
  /** @param {Level | string} level */
  setLevel: (level) => {
    if (level in LEVEL_N) minLevel = /** @type {Level} */ (level);
  },
};

export default motionLog;
