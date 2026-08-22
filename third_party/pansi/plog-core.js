/**
 * plog-core — action-pipeline logger (D064). Runtime-agnostic factory.
 * Node entry: plog.js; GJS entry: plog.gjs.js (Gio toFile).
 */

import { p, pstr, ansiStrip } from "./p.js";
import { colorEnabled } from "./ansi_color.js";

/**
 * @typedef {Object} PlogRuntime
 * @property {(key: string) => string|undefined} envGet
 * @property {(key: string, value: string) => void} envSet
 * @property {(key: string) => void} envDel
 * @property {() => number} pid
 * @property {() => number|null} getuid
 * @property {() => string|null} homeDir
 * @property {() => string|null} sudoUser
 * @property {(n: number) => Uint8Array} randomBytes
 * @property {(p: string) => string} resolvePath
 * @property {(p: string) => string} dirname
 * @property {(p: string) => string} basename
 * @property {(a: string, b: string) => string} pathJoin
 * @property {string} pathSep
 * @property {(p: string) => string} realpathOrResolve
 * @property {(p: string) => boolean} exists
 * @property {(p: string, data: string|Uint8Array) => void} appendFile
 * @property {(p: string) => string} readFile
 * @property {(filePath: string, content: string, tmpPath: string) => void} writeFileAtomic
 * @property {(filePath: string, content: string) => void} writeFileInPlace
 * @property {(p: string) => void} truncateFile
 * @property {(p: string) => void} unlinkQuiet
 * @property {(s: string) => void} writeStderr
 * @property {(s: string) => void} writeStdout
 * @property {{isTTY?: boolean}|null} stdout
 * @property {{isTTY?: boolean}|null} stderr
 */

/**
 * @param {PlogRuntime} rt
 */
export function createPlog(rt) {
  /**
   * @typedef {"trace"|"debug"|"info"|"warn"|"error"} PlogLevel
   * @typedef {"none"|"stderr"|"stdout"|"both"} PlogTee
   *
   * @typedef {Object} PlogRecord
   * @property {string} level
   * @property {string} ansiText
   * @property {string} plainText
   * @property {string} timestamp
   * @property {string} sessionId
   * @property {number} pid
   * @property {any[]} originalArgs
   *
   * @typedef {(record: PlogRecord) => any} PlogAction
   *
   * @typedef {Object} PlogInitOptions
   * @property {string|null|false} [file] Log file path; null|false|"" disables. No home default.
   * @property {string|null|false} [errorFile] Extra error-file; null|false|"" disables.
   * @property {PlogLevel|string} [level] Minimum level (default info / env).
   * @property {boolean} [console] With file sugar: keep console actions after toFile.
   * @property {PlogTee|string} [tee] Legacy; non-none ⇒ console:true when using file sugar.
   * @property {string[]} [levels] Ordered level names (default stock).
   * @property {Object.<string, PlogAction|PlogAction[]>} [actions] Per-level pipelines.
   * @property {string} [sessionId] Explicit session id (omit on init to clear sticky).
   * @property {string} [sessionFg] Session fg hex (rrggbb); tests pass with sessionBg.
   * @property {string} [sessionBg] Session bg hex (rrggbb).
   * @property {() => string} [now] Test hook: timestamp `YYYY-MM-DD_HH:MM:SS`.
   * @property {() => string} [randomId] Test hook: generated 5-char id (≥1 letter).
   *
   * @typedef {Object} PlogViewOptions
   * @property {boolean} [all] Show full file.
   * @property {boolean} [list] List sessions from log records.
   * @property {string|null|false} [file] Target file (default log.dest).
   * @property {number} [lines] Tail N lines (default 30); mutex with list/sessions/regex/all.
   * @property {string|RegExp} [regex] Filter by regex against stripped lines.
   * @property {string[]} [sessions] Filter to these session ids.
   * @property {boolean} [stripHeaders] Drop `TS LEVEL [SID] | ` prefixes for display.
   * @property {"auto"|"always"|"never"|string} [color] Display color mode.
   * @property {boolean} [str] Return string; do not write stdout (tests).
   *
   * @typedef {Object} PlogClearOptions
   * @property {string|null|false} [file] Target file (default log.dest).
   * @property {string[]} [sessions] Drop only these sessions; empty/omit = truncate.
   *
   * @typedef {Object} PlogOptionsSnapshot
   * @property {string|null} file
   * @property {string|null} errorFile
   * @property {PlogLevel|string} level
   * @property {PlogTee|string} tee
   * @property {boolean} console
   * @property {string|null} sessionId
   *
   * @typedef {Object} PlogAddActionOpts
   * @property {number} [index]
   * @property {string} [name]
   *
   * @typedef {Object} Plog
   * @property {(opts?: PlogInitOptions|null) => Plog} init
   * @property {(level: string, action: PlogAction, opts?: PlogAddActionOpts|null) => string} addAction
   * @property {(level: string, idOrFn: string|PlogAction) => boolean} removeAction
   * @property {(level: string, actions: PlogAction|PlogAction[]) => void} setActions
   * @property {(level?: string) => void} clearActions
   * @property {(level?: string) => PlogAction[]|Object.<string, PlogAction[]>} listActions
   * @property {(...args: any[]) => string} trace
   * @property {(...args: any[]) => string} debug
   * @property {(...args: any[]) => string} info
   * @property {(...args: any[]) => string} warn
   * @property {(...args: any[]) => string} error
   * @property {(opts?: PlogViewOptions|null) => string} view
   * @property {(opts?: PlogClearOptions|null) => void} clear
   * @property {(path: string) => string} filePath
   * @property {(path: string) => string} fileName
   * @property {(path: string) => string} dirPath
   * @property {(path: string) => string} dirName
   * @property {(path: string) => string} fileExt
   * @property {(path: string) => string} fileBase
   * @property {(path: string) => string} fileNamePretty
   * @property {string|null} dest
   * @property {PlogOptionsSnapshot} options
   */

  /** @type {string} */
  const PLOG_VERSION = "1.2.0";

  /** @type {Readonly<{trace: number, debug: number, info: number, warn: number, error: number}>} */
  const LEVELS = Object.freeze({
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
  });

  /** @type {readonly string[]} */
  const STOCK_LEVELS = Object.freeze(["trace", "debug", "info", "warn", "error"]);

  const FALSEY = new Set(["0", "false", "no", "off"]);
  const TEE_VALUES = new Set(["none", "stderr", "stdout", "both"]);
  const SESSION_RE = /^[A-Za-z0-9_-]{1,32}$/;
  const GENERATED_RE = /^[A-Za-z0-9]{5}$/;
  const HEX6_RE = /^[0-9a-fA-F]{6}$/;
  const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  const LEVEL_STYLE = Object.freeze({
    trace: "+a~",
    debug: "+c",
    info: "+n",
    warn: "+y*",
    error: "+r*",
  });

  const COLOR_TOOL_KEYS = ["P_LOG_COLOR", "P_COLOR"];

  function isTruthy(raw) {
    if (raw == null) return false;
    const s = String(raw).trim().toLowerCase();
    if (s === "" || FALSEY.has(s)) return false;
    return true;
  }

  function envDefined(key) {
    return rt.envGet(key) !== undefined;
  }

  function envSessionIdSet() {
    const v = rt.envGet("P_LOG_SESSION_ID");
    return v != null && String(v).length > 0;
  }

  function defaultNow() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  function defaultRandomId() {
    const buf = rt.randomBytes(5);
    const chars = Array.from(buf, (b) => ALNUM[b % ALNUM.length]);
    if (!chars.some((c) => /[A-Za-z]/.test(c))) {
      chars[0] = LETTERS[buf[0] % LETTERS.length];
    }
    return chars.join("");
  }

  function parseLevel(raw) {
    const s = String(raw).trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(LEVELS, s)) {
      throw new Error(`plog: invalid level ${raw}`);
    }
    return s;
  }

  function parseTee(raw) {
    const s = String(raw).trim().toLowerCase();
    if (!TEE_VALUES.has(s)) {
      throw new Error(`plog: invalid tee ${raw}`);
    }
    return s;
  }

  function parseSessionId(raw, generated) {
    const s = String(raw);
    if (!SESSION_RE.test(s)) {
      throw new Error(`plog: invalid session id charset`);
    }
    if (generated && (!GENERATED_RE.test(s) || !/[A-Za-z]/.test(s))) {
      throw new Error(`plog: invalid session id charset`);
    }
    return s;
  }

  function validHex(raw) {
    return typeof raw === "string" && HEX6_RE.test(raw);
  }

  function pstrAlways(...args) {
    if (args.length === 0) {
      return pstr("", { color: "always", end: "" });
    }
    return pstr(...args, { color: "always", end: "" });
  }

  /** @param {string|null|false|undefined} explicit @param {string} envKey @param {string|null} fallback */
  function resolveDest(explicit, envKey, fallback) {
    if (explicit === null || explicit === false || explicit === "") return null;
    if (explicit !== undefined) return String(explicit);
    if (envDefined(envKey)) {
      const v = rt.envGet(envKey);
      if (v === "") return null;
      return v;
    }
    return fallback;
  }

  function resolveLevel(explicit) {
    if (explicit !== undefined) return parseLevel(explicit);
    if (envDefined("P_LOG_LEVEL")) return parseLevel(rt.envGet("P_LOG_LEVEL"));
    if (isTruthy(rt.envGet("P_LOG_DEBUG"))) return "debug";
    return "info";
  }

  function resolveTee(explicit) {
    if (explicit !== undefined) return parseTee(explicit);
    if (envDefined("P_LOG_TEE")) return parseTee(rt.envGet("P_LOG_TEE"));
    return "none";
  }

  function luminance(r, g, b) {
    return Math.trunc((299 * r + 587 * g + 114 * b) / 1000);
  }

  function rgbToHex(r, g, b) {
    return [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  function sampleRgb() {
    const buf = rt.randomBytes(3);
    return [buf[0], buf[1], buf[2]];
  }

  function sampleFgBg() {
    const fg = sampleRgb();
    const fgLight = luminance(fg[0], fg[1], fg[2]) > 128;
    for (let i = 0; i < 10000; i++) {
      const bg = sampleRgb();
      const lum = luminance(bg[0], bg[1], bg[2]);
      if (fgLight ? lum <= 86 : lum > 169) {
        return { fg: rgbToHex(fg[0], fg[1], fg[2]), bg: rgbToHex(bg[0], bg[1], bg[2]) };
      }
    }
    return { fg: rgbToHex(fg[0], fg[1], fg[2]), bg: fgLight ? "000000" : "ffffff" };
  }

  function resolveMaybe(p0) {
    return rt.realpathOrResolve(p0);
  }

  function resolveForCreate(filePath) {
    const abs = rt.resolvePath(filePath);
    try {
      if (rt.exists(abs)) return rt.realpathOrResolve(abs);
    } catch {
      /* continue */
    }
    const dir = rt.dirname(abs);
    try {
      if (rt.exists(dir)) return rt.pathJoin(rt.realpathOrResolve(dir), rt.basename(abs));
    } catch {
      /* continue */
    }
    return abs;
  }

  function homesToProtect() {
    const homes = [];
    const home = rt.homeDir();
    if (home) homes.push(resolveMaybe(home));
    const sudo = rt.sudoUser();
    if (sudo) homes.push(rt.resolvePath(`/home/${sudo}`));
    return homes;
  }

  function isUnderHome(filePath) {
    const resolved = resolveForCreate(filePath);
    return homesToProtect().some((home) => {
      return resolved === home || resolved.startsWith(home + rt.pathSep);
    });
  }

  function d054RefuseCreate(filePath) {
    const uid = rt.getuid();
    if (uid == null || uid !== 0) return false;
    return isUnderHome(filePath);
  }

  function pathsEqual(a, b) {
    if (a == null || b == null) return false;
    return rt.resolvePath(a) === rt.resolvePath(b);
  }

  const RECORD_RE =
    /^(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}) (TRACE|DEBUG|INFO|WARN|ERROR) \[([A-Za-z0-9_-]{1,32})\] \| (.*)$/;
  const HEADER_SPLIT = " | ";

  function warnLine(msg) {
    try {
      const encoded = pstrAlways("+r", msg) + "\n";
      const on = colorEnabled(rt.stderr, { toolColorKeys: COLOR_TOOL_KEYS });
      rt.writeStderr(on ? encoded : ansiStrip(encoded));
    } catch {
      /* ignore */
    }
  }

  function requirePathArg(raw) {
    if (raw == null || String(raw) === "") {
      throw new Error("plog: path required");
    }
    return String(raw);
  }

  function fileExtOf(p0) {
    const base = rt.basename(p0);
    const i = base.lastIndexOf(".");
    if (i < 0) return "";
    return base.slice(i + 1);
  }

  function fileBaseOf(p0) {
    const base = rt.basename(p0);
    const i = base.lastIndexOf(".");
    if (i <= 0) return base;
    return base.slice(0, i);
  }

  function splitContentLines(text) {
    if (text === "") return [];
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function parseRecord(stripped) {
    const m = stripped.match(RECORD_RE);
    if (!m) return null;
    return { ts: m[1], level: m[2], sessionId: m[3], message: m[4] };
  }

  function sessionIdOfLine(rawLine) {
    return parseRecord(ansiStrip(rawLine))?.sessionId ?? null;
  }

  function resolveViewClearFile(explicit) {
    materializeConfig();
    if (explicit !== undefined) {
      if (explicit === null || explicit === false || explicit === "") return null;
      return String(explicit);
    }
    return state.file;
  }

  function displayColorOn(cliMode) {
    return colorEnabled(rt.stdout, {
      cliMode: cliMode === undefined ? null : cliMode,
      toolColorKeys: COLOR_TOOL_KEYS,
    });
  }

  function formatDisplayLine(rawLine, { stripHeaders, colorOn }) {
    let piece = rawLine;
    if (stripHeaders) {
      const idx = rawLine.indexOf(HEADER_SPLIT);
      piece = idx >= 0 ? rawLine.slice(idx + HEADER_SPLIT.length) : rawLine;
    }
    return colorOn ? piece : ansiStrip(piece);
  }

  function viewHeading(titleParts, colorOn) {
    const line = pstrAlways(...titleParts);
    return (colorOn ? line : ansiStrip(line)) + "\n";
  }

  function viewSeparator(colorOn) {
    const line = pstrAlways("+a", "#".repeat(40));
    return (colorOn ? line : ansiStrip(line)) + "\n";
  }

  function listSessionsFromFile(text) {
    const seen = new Set();
    const rows = [];
    for (const raw of splitContentLines(text)) {
      const rec = parseRecord(ansiStrip(raw));
      if (!rec) continue;
      if (seen.has(rec.sessionId)) continue;
      seen.add(rec.sessionId);
      rows.push({ id: rec.sessionId, ts: rec.ts });
    }
    return rows;
  }

  function truncateInPlace(filePath) {
    rt.truncateFile(filePath);
  }

  function rewriteLogFile(filePath, content) {
    const dir = rt.dirname(filePath);
    const hex = Array.from(rt.randomBytes(4), (b) => b.toString(16).padStart(2, "0")).join("");
    const tmp = rt.pathJoin(dir, `.plog-clear.${rt.pid()}.${hex}`);
    if (d054RefuseCreate(tmp)) {
      rt.writeFileInPlace(filePath, content);
      return;
    }
    try {
      rt.writeFileAtomic(filePath, content, tmp);
    } catch (err) {
      rt.unlinkQuiet(tmp);
      warnLine(`plog: cannot clear ${filePath}: ${err.code || err.message}`);
      throw err;
    }
  }

  function appendAnsi(filePath, bytes) {
    const exists = rt.exists(filePath);
    if (!exists && d054RefuseCreate(filePath)) {
      throw new Error(`refuse to create ${filePath} as root (D054)`);
    }
    try {
      rt.appendFile(filePath, bytes);
    } catch (err) {
      throw new Error(`cannot write ${filePath}: ${err.code || err.message}`);
    }
  }

  function consoleText(record) {
    const stream = record.level === "warn" || record.level === "error" ? rt.stderr : rt.stdout;
    const on = colorEnabled(stream, { toolColorKeys: COLOR_TOOL_KEYS });
    const text = on ? record.ansiText : record.plainText;
    return text.endsWith("\n") ? text.slice(0, -1) : text;
  }

  /** Emit to console when present; else Shell log / print (GJS zero-config). */
  function emitConsole(level, text) {
    if (typeof console !== "undefined") {
      if (level === "warn" && typeof console.warn === "function") {
        console.warn(text);
        return;
      }
      if (level === "error" && typeof console.error === "function") {
        console.error(text);
        return;
      }
      if (typeof console.log === "function") {
        console.log(text);
        return;
      }
    }
    if (typeof globalThis.log === "function") {
      globalThis.log(text);
      return;
    }
    if (typeof globalThis.print === "function") {
      globalThis.print(text);
    }
  }

  /** @type {PlogAction} */
  function toConsole(record) {
    emitConsole(record.level, consoleText(record));
  }

  /** @type {PlogAction} */
  function toStdio(record) {
    const text = consoleText(record) + "\n";
    if (record.level === "warn" || record.level === "error") rt.writeStderr(text);
    else rt.writeStdout(text);
  }

  /**
   * @param {string} filePath
   * @returns {PlogAction}
   */
  function toFile(filePath) {
    const dest = String(filePath);
    return function toFile(record) {
      appendAnsi(dest, record.ansiText);
    };
  }

  /** @type {{ toConsole: PlogAction, toStdio: PlogAction, toFile: (path: string) => PlogAction }} */
  const actions = Object.freeze({
    toConsole,
    toStdio,
    toFile,
  });

  /** @type {{ pipelines: Readonly<Object.<string, readonly PlogAction[]>> }} */
  const defaults = Object.freeze({
    pipelines: Object.freeze({
      trace: Object.freeze([toConsole]),
      debug: Object.freeze([toConsole]),
      info: Object.freeze([toConsole]),
      warn: Object.freeze([toConsole]),
      error: Object.freeze([toConsole]),
    }),
  });

  let actionIdSeq = 0;

  /** @param {PlogAction} fn @param {string} [name] */
  function makeEntry(fn, name) {
    return {
      id: `a${++actionIdSeq}`,
      fn,
      name: name || fn.name || "anonymous",
    };
  }

  /** @param {PlogAction|PlogAction[]} raw */
  function normalizeActionList(raw) {
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((fn) => {
      if (typeof fn !== "function") {
        throw new Error("plog: action must be a function");
      }
      return makeEntry(fn);
    });
  }

  function cloneDefaultPipeline(level) {
    const src = defaults.pipelines[level] || [toConsole];
    return src.map((fn) => makeEntry(fn));
  }

  const state = {
    materialized: false,
    file: null,
    errorFile: null,
    level: "info",
    tee: "none",
    console: false,
    levelNames: STOCK_LEVELS.slice(),
    /** @type {Object.<string, {id: string, fn: PlogAction, name: string}[]>} */
    pipelines: {},
    sessionId: null,
    sessionFg: null,
    sessionBg: null,
    now: defaultNow,
    randomId: defaultRandomId,
  };

  function applyDestLevelTee(opts) {
    state.file = resolveDest(opts.file, "P_LOG_FILE", null);
    state.errorFile = resolveDest(opts.errorFile, "P_LOG_FILE_STDERR", state.file);
    state.level = resolveLevel(opts.level);
    state.tee = resolveTee(opts.tee);
  }

  function applyHooks(opts) {
    state.now = typeof opts.now === "function" ? opts.now : defaultNow;
    state.randomId = typeof opts.randomId === "function" ? opts.randomId : defaultRandomId;
  }

  function applySessionFromInit(opts) {
    if (opts.sessionId !== undefined) {
      state.sessionId = parseSessionId(opts.sessionId);
      rt.envSet("P_LOG_SESSION_ID", state.sessionId);
    } else {
      state.sessionId = null;
      rt.envDel("P_LOG_SESSION_ID");
      rt.envDel("P_LOG_SESSION_COLOR_FG");
      rt.envDel("P_LOG_SESSION_COLOR_BG");
    }

    if (opts.sessionFg !== undefined) {
      state.sessionFg = validHex(opts.sessionFg) ? String(opts.sessionFg).toLowerCase() : null;
    } else if (opts.sessionId === undefined) {
      state.sessionFg = null;
    }
    if (opts.sessionBg !== undefined) {
      state.sessionBg = validHex(opts.sessionBg) ? String(opts.sessionBg).toLowerCase() : null;
    } else if (opts.sessionId === undefined) {
      state.sessionBg = null;
    }

    if (state.sessionFg) rt.envSet("P_LOG_SESSION_COLOR_FG", state.sessionFg);
    if (state.sessionBg) rt.envSet("P_LOG_SESSION_COLOR_BG", state.sessionBg);
  }

  function resolveLevelNames(opts) {
    if (!Array.isArray(opts.levels) || opts.levels.length === 0) {
      return STOCK_LEVELS.slice();
    }
    return opts.levels.map((n) => String(n));
  }

  function resolveConsoleFlag(opts) {
    if (opts.console !== undefined) return !!opts.console;
    // Migration: P_LOG_TEE / tee non-none ⇒ dual sink with file sugar
    return state.tee !== "none";
  }

  /**
   * Build per-level pipelines from progressive sugar + explicit actions.
   * @param {PlogInitOptions} opts
   */
  function buildPipelines(opts) {
    const levelNames = resolveLevelNames(opts);
    state.levelNames = levelNames;

    const actionsOpt = opts.actions;
    const actionsProvided =
      actionsOpt != null && typeof actionsOpt === "object" && !Array.isArray(actionsOpt);
    const hasFile = state.file != null;
    const consoleFlag = resolveConsoleFlag(opts);
    state.console = hasFile ? consoleFlag : consoleFlag || !actionsProvided;

    /** @type {Object.<string, {id: string, fn: PlogAction, name: string}[]>} */
    const pipelines = {};

    for (const level of levelNames) {
      if (actionsProvided && Object.prototype.hasOwnProperty.call(actionsOpt, level)) {
        pipelines[level] = normalizeActionList(actionsOpt[level]);
        continue;
      }
      if (hasFile) {
        const list = [makeEntry(toFile(state.file))];
        if (level === "error" && state.errorFile && !pathsEqual(state.errorFile, state.file)) {
          list.push(makeEntry(toFile(state.errorFile)));
        }
        if (consoleFlag) list.push(makeEntry(toConsole));
        pipelines[level] = list;
      } else if (!actionsProvided && opts.console !== false) {
        pipelines[level] = cloneDefaultPipeline(level);
      } else {
        pipelines[level] = [];
      }
    }

    state.pipelines = pipelines;
  }

  function materializeConfig() {
    if (state.materialized) return;
    applyDestLevelTee({});
    buildPipelines({});
    state.materialized = true;
  }

  /**
   * Materialize config from opts / env / defaults. Full replace of pipelines.
   * @param {PlogInitOptions|null} [opts]
   * @returns {Plog}
   */
  function init(opts) {
    if (opts == null || typeof opts !== "object" || Array.isArray(opts)) opts = {};
    applyHooks(opts);
    applyDestLevelTee(opts);
    applySessionFromInit(opts);
    buildPipelines(opts);
    state.materialized = true;
    return log;
  }

  function sessionEnsure() {
    if (state.sessionId == null) {
      if (envSessionIdSet()) {
        state.sessionId = parseSessionId(rt.envGet("P_LOG_SESSION_ID"));
      } else {
        state.sessionId = parseSessionId(state.randomId(), true);
      }
    }

    const fg = state.sessionFg || rt.envGet("P_LOG_SESSION_COLOR_FG");
    const bg = state.sessionBg || rt.envGet("P_LOG_SESSION_COLOR_BG");
    if (validHex(fg) && validHex(bg)) {
      state.sessionFg = String(fg).toLowerCase();
      state.sessionBg = String(bg).toLowerCase();
    } else {
      const sampled = sampleFgBg();
      state.sessionFg = sampled.fg;
      state.sessionBg = sampled.bg;
    }

    rt.envSet("P_LOG_SESSION_ID", state.sessionId);
    rt.envSet("P_LOG_SESSION_COLOR_FG", state.sessionFg);
    rt.envSet("P_LOG_SESSION_COLOR_BG", state.sessionBg);
  }

  function sessionStyle() {
    return `+*h${state.sessionFg}H${state.sessionBg}`;
  }

  function levelRank(level) {
    if (Object.prototype.hasOwnProperty.call(LEVELS, level)) return LEVELS[level];
    const idx = state.levelNames.indexOf(level);
    return idx >= 0 ? (idx + 1) * 10 : 0;
  }

  function minRank() {
    return levelRank(state.level);
  }

  function prefixFor(level, ts) {
    const tsStyle = level === "error" ? "+wR" : "+a";
    const upper = String(level).toUpperCase();
    const style = LEVEL_STYLE[level] || "+n";
    return (
      pstrAlways(tsStyle, ts) +
      " " +
      pstrAlways(style, upper) +
      " " +
      pstrAlways(sessionStyle(), `[${state.sessionId}]`) +
      " | "
    );
  }

  function write(level, args) {
    materializeConfig();
    if (levelRank(level) < minRank()) return "";

    sessionEnsure();
    const ts = state.now();
    const originalArgs = args.slice();
    const msg = pstrAlways(...args)
      .replaceAll("\n", "\\n")
      .replaceAll("\r", "\\r");
    const ansiText = prefixFor(level, ts) + msg + "\n";
    const plainText = ansiStrip(ansiText);

    /** @type {PlogRecord} */
    const record = {
      level,
      ansiText,
      plainText,
      timestamp: ts,
      sessionId: state.sessionId,
      pid: rt.pid(),
      originalArgs,
    };

    const list = (state.pipelines[level] || []).slice();
    let ok = 0;
    const configured = list.length;

    for (const entry of list) {
      try {
        const ret = entry.fn(record);
        if (ret != null && typeof ret.then === "function") {
          warnLine(`plog: action ${entry.name}: async action ignored`);
        } else {
          ok++;
        }
      } catch (err) {
        warnLine(`plog: action ${entry.name}: ${err.code || err.message}`);
      }
    }

    if (configured > 0 && ok === 0) return "";
    return ansiText;
  }

  /**
   * @param {string} level
   * @param {PlogAction} action
   * @param {PlogAddActionOpts|null} [opts]
   * @returns {string}
   */
  function addAction(level, action, opts) {
    materializeConfig();
    if (typeof action !== "function") {
      throw new Error("plog: action must be a function");
    }
    const name = opts && opts.name != null ? String(opts.name) : undefined;
    const entry = makeEntry(action, name);
    if (!state.pipelines[level]) state.pipelines[level] = [];
    const list = state.pipelines[level];
    if (opts && typeof opts.index === "number" && Number.isFinite(opts.index)) {
      const i = Math.max(0, Math.min(list.length, opts.index | 0));
      list.splice(i, 0, entry);
    } else {
      list.push(entry);
    }
    return entry.id;
  }

  /**
   * @param {string} level
   * @param {string|PlogAction} idOrFn
   * @returns {boolean}
   */
  function removeAction(level, idOrFn) {
    materializeConfig();
    const list = state.pipelines[level];
    if (!list) return false;
    const i = list.findIndex((e) => e.id === idOrFn || e.fn === idOrFn);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  /**
   * @param {string} level
   * @param {PlogAction|PlogAction[]} actionList
   */
  function setActions(level, actionList) {
    materializeConfig();
    state.pipelines[level] = normalizeActionList(actionList == null ? [] : actionList);
  }

  /** @param {string} [level] */
  function clearActions(level) {
    materializeConfig();
    if (level === undefined) {
      for (const L of Object.keys(state.pipelines)) {
        state.pipelines[L] = [];
      }
      return;
    }
    state.pipelines[level] = [];
  }

  /**
   * @param {string} [level]
   * @returns {PlogAction[]|Object.<string, PlogAction[]>}
   */
  function listActions(level) {
    materializeConfig();
    if (level === undefined) {
      /** @type {Object.<string, PlogAction[]>} */
      const out = {};
      for (const L of Object.keys(state.pipelines)) {
        out[L] = state.pipelines[L].map((e) => e.fn);
      }
      return out;
    }
    return (state.pipelines[level] || []).map((e) => e.fn);
  }

  /**
   * View log contents (list / sessions / regex / all / tail).
   * @param {PlogViewOptions|null} [opts]
   * @returns {string}
   */
  function view(opts) {
    if (opts == null || typeof opts !== "object" || Array.isArray(opts)) opts = {};
    const filePath = resolveViewClearFile(opts.file);
    if (filePath == null || !rt.exists(filePath)) {
      const shown = filePath == null ? String(filePath) : filePath;
      try {
        p("Log file not found: ", "+c", shown, { stderr: true });
      } catch {
        /* ignore */
      }
      throw new Error(`Log file not found: ${shown}`);
    }

    const text = rt.readFile(filePath);
    const colorOn = displayColorOn(opts.color);
    const stripHeaders = !!opts.stripHeaders;
    const sessions = Array.isArray(opts.sessions) ? opts.sessions.map(String) : [];
    let body = "";
    let heading = "";

    if (opts.list) {
      const rows = listSessionsFromFile(text);
      body = rows
        .map((row) => {
          const line = pstrAlways("+b", `[${row.id}]`, "+g", ` ${row.ts}`);
          return colorOn ? line : ansiStrip(line);
        })
        .join("\n");
      if (body) body += "\n";
    } else if (sessions.length > 0) {
      const want = new Set(sessions);
      heading = viewHeading(
        ["+y", "Log entries for session(s): ", "+c", sessions.join(", ")],
        colorOn
      );
      const kept = [];
      for (const raw of splitContentLines(text)) {
        const sid = sessionIdOfLine(raw);
        if (sid != null && want.has(sid)) {
          kept.push(formatDisplayLine(raw, { stripHeaders, colorOn }));
        }
      }
      body = kept.length ? kept.join("\n") + "\n" : "";
    } else if (opts.regex != null && String(opts.regex) !== "") {
      const re = new RegExp(String(opts.regex));
      heading = viewHeading(
        ["+y", "Log entries matching regex: ", "+c", String(opts.regex)],
        colorOn
      );
      const kept = [];
      for (const raw of splitContentLines(text)) {
        if (re.test(ansiStrip(raw))) {
          kept.push(formatDisplayLine(raw, { stripHeaders, colorOn }));
        }
      }
      body = kept.length ? kept.join("\n") + "\n" : "";
    } else if (opts.all) {
      heading = viewHeading(["+y", "Full log: ", "+c", filePath], colorOn);
      const kept = splitContentLines(text).map((raw) =>
        formatDisplayLine(raw, { stripHeaders, colorOn })
      );
      body = kept.length ? kept.join("\n") + "\n" : "";
    } else {
      let n = opts.lines === undefined ? 30 : Number(opts.lines);
      if (!Number.isFinite(n) || n < 0) n = 30;
      heading = viewHeading(
        ["+y", "Last ", "+m", String(n), "+y", " lines of log file: ", "+c", filePath],
        colorOn
      );
      const all = splitContentLines(text);
      const slice = n === 0 ? [] : all.slice(-n);
      const kept = slice.map((raw) => formatDisplayLine(raw, { stripHeaders, colorOn }));
      body = kept.length ? kept.join("\n") + "\n" : "";
    }

    let out = heading + body;
    if (!opts.list) out += viewSeparator(colorOn);

    if (!opts.str) {
      try {
        rt.writeStdout(out);
      } catch (err) {
        warnLine(`plog: cannot write stdout: ${err.code || err.message}`);
      }
    }
    return out;
  }

  /**
   * Truncate the log file, or rewrite without selected sessions.
   * @param {PlogClearOptions|null} [opts]
   * @returns {void}
   */
  function clear(opts) {
    if (opts == null || typeof opts !== "object" || Array.isArray(opts)) opts = {};
    const filePath = resolveViewClearFile(opts.file);
    if (filePath == null) return;
    if (!rt.exists(filePath)) return;

    const sessions = Array.isArray(opts.sessions) ? opts.sessions.map(String) : [];
    if (sessions.length === 0) {
      truncateInPlace(filePath);
      return;
    }

    const drop = new Set(sessions);
    const text = rt.readFile(filePath);
    const kept = [];
    for (const raw of splitContentLines(text)) {
      const sid = sessionIdOfLine(raw);
      if (sid != null && drop.has(sid)) continue;
      kept.push(raw);
    }
    const out = kept.length === 0 ? "" : kept.join("\n") + "\n";
    rewriteLogFile(filePath, out);
  }

  function filePath(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [abs]);
  }

  function fileName(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [rt.basename(abs)]);
  }

  function dirPath(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [rt.dirname(abs)]);
  }

  function dirName(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [rt.basename(rt.dirname(abs))]);
  }

  function fileExt(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [fileExtOf(abs)]);
  }

  function fileBase(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    return write("info", [fileBaseOf(abs)]);
  }

  function fileNamePretty(p0) {
    const abs = rt.resolvePath(requirePathArg(p0));
    const name = rt.basename(abs);
    const pretty = pstr("+y", name, "+n", " (", "+c", abs, "+n", ")", {
      color: "always",
      end: "",
      sep: "",
    });
    return write("info", [pretty]);
  }

  /** @type {Plog} */
  const log = {
    init,
    addAction,
    removeAction,
    setActions,
    clearActions,
    listActions,
    trace(...args) {
      return write("trace", args);
    },
    debug(...args) {
      return write("debug", args);
    },
    info(...args) {
      return write("info", args);
    },
    warn(...args) {
      return write("warn", args);
    },
    error(...args) {
      return write("error", args);
    },
    view,
    clear,
    filePath,
    fileName,
    dirPath,
    dirName,
    fileExt,
    fileBase,
    fileNamePretty,
    get dest() {
      materializeConfig();
      return state.file;
    },
    get options() {
      materializeConfig();
      return {
        file: state.file,
        errorFile: state.errorFile,
        level: state.level,
        tee: state.tee,
        console: state.console,
        sessionId: state.sessionId,
      };
    },
  };

  /** @type {Plog} */
  const plog = log;

  /**
   * Convenience alias of `log.init`.
   * @param {PlogInitOptions|null} [opts]
   * @returns {Plog}
   */
  function logInit(opts) {
    return log.init(opts);
  }

  return {
    PLOG_VERSION,
    LEVELS,
    STOCK_LEVELS,
    actions,
    defaults,
    log,
    plog,
    logInit,
  };
}
