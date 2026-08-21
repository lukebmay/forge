/**
 * ansi_color.js — portable color enablement (shellrc contract).
 * Decision order: agents-catalog ansi-colors.md
 * Keep ANSI_COLOR_VERSION in sync with util/python/ansi_color.py etc.
 */

export const ANSI_COLOR_VERSION = "1.0.0";

const FALSEY = new Set(["", "0", "false", "no", "off"]);

function truthyForce(raw) {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  if (FALSEY.has(s)) return false;
  return s.length > 0;
}

function envMode(env, toolColorKeys) {
  const keys = [...(toolColorKeys || []), "COLOR"];
  for (const key of keys) {
    const raw = String(env[key] || "")
      .trim()
      .toLowerCase();
    if (raw === "always" || raw === "never" || raw === "auto") return raw;
  }
  return null;
}

/**
 * @param {string|null|undefined} cliMode
 * @param {{env?: Record<string,string>, toolColorKeys?: string[]}} [opts]
 * @returns {"always"|"never"|"auto"}
 */
export function resolveColorMode(cliMode, opts = {}) {
  const env = opts.env || (typeof process !== "undefined" ? process.env : {});
  let m = "auto";
  if (cliMode != null && String(cliMode).trim() !== "") {
    m = String(cliMode).trim().toLowerCase();
    if (m !== "always" && m !== "never" && m !== "auto") {
      throw new Error(`color mode must be auto|always|never, got ${cliMode}`);
    }
    if (m === "always" || m === "never") return m;
  }

  if (String(env.NO_COLOR || "").trim()) return "never";
  if (truthyForce(env.FORCE_COLOR) || truthyForce(env.CLICOLOR_FORCE)) {
    return "always";
  }
  const em = envMode(env, opts.toolColorKeys);
  if (em === "always" || em === "never") return em;
  return "auto";
}

/**
 * @param {{isTTY?: boolean}|null|undefined} stream
 * @param {{cliMode?: string|null, env?: Record<string,string>, toolColorKeys?: string[]}} [opts]
 */
export function colorEnabled(stream, opts = {}) {
  const mode = resolveColorMode(opts.cliMode, opts);
  if (mode === "always") return true;
  if (mode === "never") return false;
  try {
    if (stream && typeof stream.isTTY === "boolean") return !!stream.isTTY;
    if (typeof process !== "undefined" && process.stdout) {
      return !!process.stdout.isTTY;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

const CODE_SEQS = Object.freeze({
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
});

/**
 * Role sequences, or empty strings when color is off.
 * opts.enabled optional override; else colorEnabled(stream, opts).
 */
export function colorCodes(stream, opts = {}) {
  const on = opts.enabled !== undefined ? !!opts.enabled : colorEnabled(stream, opts);
  if (on) return { ...CODE_SEQS };
  const off = {};
  for (const k of Object.keys(CODE_SEQS)) off[k] = "";
  return off;
}

export const color_codes = colorCodes;

// CJS interop for require()
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ANSI_COLOR_VERSION,
    resolveColorMode,
    colorEnabled,
    colorCodes,
    resolve_color_mode: resolveColorMode,
    color_enabled: colorEnabled,
    color_codes: colorCodes,
  };
}
