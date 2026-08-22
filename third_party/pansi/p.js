#!/usr/bin/env node

/**
 * p.js — High-performance colored printer (library + CLI)
 * Matches zsh `p` behavior when run directly as a script.
 *
 * - ESM primary; no top-level await (sync `require()` via Node require(esm) / Bun)
 * - CJS shim at the bottom for dual-module hosts that define `module.exports`
 * - When run directly: behaves like the zsh version
 *
 * Library usage (options object for kwargs-like):
 *   p("+r", "err")
 *   const s = pstr("+g", "ok")                 // prefer; alias: ps
 *   const s = p("+g", "ok", {str: true})       // compat
 *   p("a", "b", {sep: "|", end: "", color: "always"})
 *
 * CLI / --opt strings still fully supported and unchanged.
 *
 * Keep PANSI_VERSION in sync across language ports and vendored copies
 * (e.g. forge third_party/pansi). Bump when the p/pstr public contract changes.
 */

import { colorEnabled } from "./ansi_color.js";

/** Path of this module for CLI-main detection (no node:url — GJS-loadable). */
function metaFilePath() {
  try {
    return decodeURIComponent(new URL(import.meta.url).pathname);
  } catch {
    return "";
  }
}

/**
 * Trailing options for library calls (`p` / `pstr` / `ps`).
 * @typedef {Object} POptions
 * @property {string} [sep] Separator between items (default space).
 * @property {string} [end] Suffix after the last item (default newline).
 * @property {"auto"|"always"|"never"|string} [color] Color mode override.
 * @property {boolean} [str] Return string; do not write (compat with as_str).
 * @property {boolean} [as_str] Alias of str.
 * @property {boolean} [stderr] Write to stderr instead of stdout.
 * @property {boolean} ["--stderr"] CLI-shaped alias of stderr.
 * @property {boolean} [escaped] Escape ANSI in the output string.
 * @property {string} [default] Default style when no +token is active.
 */

/** Contract implementation version — pinable for vendoring. */
export const PANSI_VERSION = "1.0.0";

const RESET = "\x1b[0m";
const CSI = "\x1b[";
const END = "m";

const P_COLOR_DEFAULT =
  (typeof process !== "undefined" && process.env && process.env.P_COLOR_DEFAULT) || "auto";

const TABLE = Object.freeze({
  r: "31",
  g: "32",
  b: "34",
  c: "36",
  m: "35",
  y: "33",
  k: "30",
  w: "37",
  a: "38;5;244",
  n: "39",
  R: "41",
  G: "42",
  B: "44",
  C: "46",
  M: "45",
  Y: "43",
  K: "40",
  W: "47",
  A: "100",
  N: "49",
  "*": "1",
  "~": "2",
  "%": "3",
  _: "4",
  "!": "5",
  "^": "7",
  "#": "9",
});

const fgList = ["r", "g", "b", "c", "m", "y", "k", "w", "a", "n"];
const bgList = ["R", "G", "B", "C", "M", "Y", "K", "W", "A", "N"];
const spList = ["*", "~", "%", "_", "!", "^", "#"];

const exactCache = new Map();
const canonicalCache = new Map();

// Seed singles; combos fill on first use
function initCaches() {
  exactCache.clear();
  canonicalCache.clear();

  for (const ch of [...fgList, ...bgList, ...spList]) {
    const seq = CSI + TABLE[ch] + END;
    exactCache.set("+" + ch, seq);
    canonicalCache.set(ch, seq);
  }

  exactCache.set("+", RESET);
  exactCache.set("+-", RESET);
}

function cacheStyle(arg, seq) {
  if (!seq) return;
  exactCache.set(arg, seq);
  if (!arg.includes("h") && !arg.includes("H")) {
    canonicalCache.set([...arg.slice(1)].sort().join(""), seq);
  }
}

initCaches();

function parseStyleSpec(input = "") {
  if (!input) return [];
  const spec = input.replace(/[\s\[\]()<>{}.,;:\\\/+=&?`@]/g, "");
  if (!spec || spec === "-" || spec === "+") return ["-"];

  const tokens = [];
  let i = 0;
  const len = spec.length;

  while (i < len) {
    const ch = spec[i];
    if (ch === "h" || ch === "H") {
      const candidate = spec.slice(i, i + 7);
      if (/^[hH][0-9a-fA-F]{6}$/.test(candidate)) {
        tokens.push(candidate);
        i += 7;
        continue;
      }
    }
    if ("rRgGbByYcCmMwWkKaA*nN_!%~#^".includes(ch)) {
      tokens.push(ch);
    } else if (ch === "-") {
      tokens.length = 0;
    }
    i++;
  }
  return tokens;
}

let styleState = {
  fg: "",
  bg: "",
  bold: "",
  dim: "",
  italic: "",
  underline: "",
  blink: "",
  reverse: "",
  strike: "",
};

function resetStyleState() {
  styleState.fg = "";
  styleState.bg = "";
  styleState.bold = "";
  styleState.dim = "";
  styleState.italic = "";
  styleState.underline = "";
  styleState.blink = "";
  styleState.reverse = "";
  styleState.strike = "";
}

function applyToken(token) {
  if (!token) return;
  if (token === "-") {
    resetStyleState();
    return;
  }
  if (token === "n") {
    styleState.fg = "";
    return;
  }
  if (token === "N") {
    styleState.bg = "";
    return;
  }

  if (token[0] === "h" || token[0] === "H") {
    if (/^[hH][0-9a-fA-F]{6}$/.test(token)) {
      const hex = token.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (token[0] === "h") styleState.fg = `38;2;${r};${g};${b}`;
      else styleState.bg = `48;2;${r};${g};${b}`;
      return;
    }
  }

  const code = TABLE[token];
  if (!code) return;

  if ("rgbcmykwa".includes(token)) styleState.fg = code;
  else if ("RGBCMYKWA".includes(token)) styleState.bg = code;
  else if (token === "a") styleState.fg = TABLE.a;
  else if (token === "A") styleState.bg = TABLE.A;
  else {
    const attrMap = {
      "*": "bold",
      "~": "dim",
      "%": "italic",
      _: "underline",
      "!": "blink",
      "^": "reverse",
      "#": "strike",
    };
    if (attrMap[token]) styleState[attrMap[token]] = code;
  }
}

function renderCurrentStyle() {
  let out = "";
  if (styleState.fg) out += CSI + styleState.fg + END;
  if (styleState.bg) out += CSI + styleState.bg + END;
  for (const a of ["bold", "dim", "italic", "underline", "blink", "reverse", "strike"]) {
    if (styleState[a]) out += CSI + styleState[a] + END;
  }
  return out;
}

const hasStdoutWrite =
  typeof process !== "undefined" && process.stdout && typeof process.stdout.write === "function";

/**
 * Colored print (or string build when `{ str: true }` / `{ as_str: true }`).
 * Variadic style tokens (`+r`, …) and text; optional trailing {@link POptions}.
 *
 * @param {...(string|number|boolean|bigint|symbol|POptions|null|undefined)} args
 * @returns {string} Rendered line (including `end`), whether or not it was written.
 */
export function p(...args) {
  // Support trailing options object for library use: p("text", {sep: "|", end: "", str: true, color: "always"})
  // This provides pythonic-kwargs equivalent without breaking variadic string API or CLI.
  let opts = {};
  if (args.length > 0) {
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last) && typeof last !== "string") {
      opts = args.pop();
    }
  }

  // If as_str or str requested in opts, we'll suppress write at end.
  const asStr = !!(opts.str || opts.as_str);
  let useStderr = !!(opts.stderr || opts["--stderr"]);

  if (args.length === 0) {
    const out = "\n";
    if (!asStr) {
      if (useStderr) {
        if (process.stderr && typeof process.stderr.write === "function") process.stderr.write(out);
        else console.error(out);
      } else if (hasStdoutWrite) {
        process.stdout.write(out);
      } else {
        console.log(out);
      }
    }
    return out;
  }

  resetStyleState();
  let parts = [];
  let sep = opts.sep !== undefined ? opts.sep : " ";
  let end = opts.end !== undefined ? opts.end : "\n";
  let cliMode = opts.color !== undefined ? opts.color : null;
  let escaped = opts.escaped !== undefined ? !!opts.escaped : false;
  let defaultAnsi = "";
  let i = 0;

  // Parse leading --options (for CLI and legacy string calls); opts take precedence later
  while (i < args.length && typeof args[i] === "string" && args[i].startsWith("--")) {
    const a = args[i];
    if (a.startsWith("--sep=")) {
      sep = a.slice(6);
      i++;
      continue;
    }
    if (a.startsWith("--end=")) {
      end = a.slice(6);
      i++;
      continue;
    }
    if (a === "--reset" || a === "+-") {
      resetStyleState();
      i++;
      continue;
    }
    if (a.startsWith("--color=")) {
      cliMode = a.slice(8) || "always";
      i++;
      continue;
    }
    if (a === "--color") {
      cliMode = "always";
      i++;
      continue;
    }
    if (a === "--escaped" || a === "--escape" || a === "-E") {
      escaped = true;
      i++;
      continue;
    }
    if (a.startsWith("--default=")) {
      const style = a.slice(10);
      // Compute ANSI for default style
      resetStyleState();
      for (const t of parseStyleSpec(style.startsWith("+") ? style : "+" + style)) {
        applyToken(t);
      }
      defaultAnsi = renderCurrentStyle();
      resetStyleState();
      i++;
      continue;
    }
    if (a === "--stderr" || a === "-e") {
      opts.stderr = true; // will be read later
      i++;
      continue;
    }
    i++;
  }

  // Apply opts overrides (pythonic/JS object style)
  if (opts.sep !== undefined) sep = opts.sep;
  if (opts.end !== undefined) end = opts.end;
  if (opts.color !== undefined) {
    cliMode = opts.color;
  }
  if (opts.escaped !== undefined) escaped = !!opts.escaped;
  if (opts.default !== undefined) {
    const style = opts.default;
    resetStyleState();
    for (const t of parseStyleSpec(style.startsWith("+") ? style : "+" + style)) {
      applyToken(t);
    }
    defaultAnsi = renderCurrentStyle();
    resetStyleState();
  }

  useStderr = useStderr || !!(opts.stderr || opts["--stderr"]);

  if (cliMode == null || String(cliMode).trim() === "") {
    cliMode = P_COLOR_DEFAULT || "auto";
  }
  let useColor = false;
  try {
    const hasProcess = typeof process !== "undefined";
    const ttyStream = hasProcess
      ? useStderr && process.stderr
        ? process.stderr
        : process.stdout || {}
      : {};
    useColor = colorEnabled(ttyStream, {
      cliMode,
      toolColorKeys: ["P_COLOR"],
    });
  } catch {
    useColor = false;
  }

  while (i < args.length) {
    const arg = args[i];

    if (typeof arg === "string" && arg.startsWith("+")) {
      let ansi = exactCache.get(arg);
      if (!ansi) {
        const sorted = [...arg.slice(1)].sort().join("");
        ansi = canonicalCache.get(sorted);
      }

      const next = args[i + 1];
      const isTextNext =
        next != null && typeof next === "string" && !next.startsWith("+") && !next.startsWith("--");

      if (isTextNext) {
        if (ansi) {
          parts.push(useColor ? ansi + next + RESET : next);
          i += 2;
          resetStyleState();
          continue;
        }
        for (const t of parseStyleSpec(arg)) applyToken(t);
        const st = renderCurrentStyle();
        cacheStyle(arg, st);
        parts.push(useColor && st ? st + next + RESET : next);
        i += 2;
        resetStyleState();
        continue;
      }

      for (const t of parseStyleSpec(arg)) applyToken(t);
      i++;
      continue;
    }

    if (typeof arg === "string" && arg.startsWith("--")) {
      i++;
      continue;
    }

    // Plain text
    let st = renderCurrentStyle();
    if (!st && defaultAnsi) {
      st = defaultAnsi;
    }
    parts.push(useColor && st ? st + arg + RESET : arg);

    // Re-apply default for next item (zsh-like behavior)
    if (defaultAnsi) {
      resetStyleState();
      // We don't re-parse here for simplicity; just keep defaultAnsi ready
    } else {
      resetStyleState();
    }
    i++;
  }

  let output = parts.join(sep) + end;
  if (!useColor) output = output.replace(/\x1b\[[0-9;]*m/g, "");

  if (escaped) {
    output = ansiEscape(output);
    // Strip trailing newline if present (cleaner for pasting into other languages)
    if (output.endsWith("\\n")) {
      output = output.slice(0, -2);
    }
  }

  if (asStr) {
    return output;
  }
  if (useStderr) {
    if (process.stderr && typeof process.stderr.write === "function") {
      process.stderr.write(output);
    } else {
      console.error(output); // fallback
    }
  } else if (hasStdoutWrite) {
    process.stdout.write(output);
  } else {
    console.log(output);
  }

  return output;
}

/** Render styled string without printing. Prefer over p(..., {str: true}). Alias: ps. */
/**
 * Build a styled string without printing. Alias: {@link ps}.
 *
 * @param {...(string|number|boolean|bigint|symbol|POptions|null|undefined)} args
 * @returns {string}
 */
export function pstr(...args) {
  let opts = {};
  if (args.length > 0) {
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last) && typeof last !== "string") {
      opts = { ...last };
      args.pop();
    }
  }
  opts.str = true;
  opts.as_str = true;
  return p(...args, opts);
}

/** @type {typeof pstr} */
export const ps = pstr;

/**
 * Strip ANSI CSI sequences from a string.
 * @param {string} [str]
 * @returns {string}
 */
export function ansiStrip(str = "") {
  return str.replace(/\x1b\[[0-9;]*[@-~]/g, "");
}

/**
 * Escape control characters for readable dumps (`\x1b`, `\n`, …).
 * @param {string} [str]
 * @returns {string}
 */
export function ansiEscape(str = "") {
  if (typeof str !== "string") str = String(str);

  return str
    .replace(/\x1b/g, "\\x1b")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\x07/g, "\\a"); // Bell → \a (rare but complete)
}

/**
 * Inverse of {@link ansiEscape} (also accepts `\\e` / `\\033`).
 * @param {string} [str]
 * @returns {string}
 */
export function ansiUnescape(str = "") {
  if (typeof str !== "string") str = String(str);

  return str
    .replace(/\\x1b/gi, "\x1b")
    .replace(/\\e/gi, "\x1b")
    .replace(/\\033/g, "\x1b")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\a/g, "\x07");
}

// === Direct script execution (CLI parity with zsh); sync — no top-level await ===
try {
  if (typeof process !== "undefined" && process.argv[1] && process.argv[1] === metaFilePath()) {
    const cliArgs = process.argv.slice(2);

    if (cliArgs.includes("--help") || cliArgs.includes("-?")) {
      console.log("Usage: p [OPTIONS] [+STYLE|--STYLE ...] [TEXT ...]");
      console.log("");
      console.log("Options:");
      console.log("  --sep=STR           Separator between items (default: space)");
      console.log("  --end=STR           String appended at the end (default: newline)");
      console.log("  --color=auto|always|never");
      console.log("  --reset, +-         Reset all styles");
      console.log("  --stderr, -e        Output to stderr instead of stdout");
      console.log("");
      console.log("Styles: +r +g +b ...  +rG +rG*  +hff0000H00ff00");
      process.exit(0);
    }

    p(...cliArgs);
  }
} catch (_) {
  // Not direct script execution (or import.meta unavailable) — ignore
}

// === CJS shim for hosts that define module.exports while evaluating this graph ===
if (typeof module !== "undefined" && module.exports) {
  module.exports = p;
  module.exports.p = p;
  module.exports.pstr = pstr;
  module.exports.ps = ps;
  module.exports.PANSI_VERSION = PANSI_VERSION;
  module.exports.ansiStrip = ansiStrip;
  module.exports.ansiEscape = ansiEscape;
  module.exports.ansiUnescape = ansiUnescape;
}
