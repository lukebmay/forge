// @ts-nocheck — vendored; typed boundary is cli/plog.mjs + lib/shared/plog-adapter.js
/**
 * plog.js — product logger (pansi). ESM-only; vendoring pin next to p.js.
 * File bytes are always ANSI; tee honors ansi_color / NO_COLOR.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { p, ansiStrip } from "./p.js";
import { colorEnabled } from "./ansi_color.js";

export const PLOG_VERSION = "1.0.0";

export const LEVELS = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
});

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
  return process.env[key] !== undefined;
}

function envSessionIdSet() {
  const v = process.env.P_LOG_SESSION_ID;
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
  const buf = crypto.randomBytes(5);
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
    return p("", { str: true, color: "always", end: "" });
  }
  return p(...args, { str: true, color: "always", end: "" });
}

function defaultFilePath() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, ".plog.log");
}

function resolveDest(explicit, envKey, fallback) {
  if (explicit === null || explicit === false || explicit === "") return null;
  if (explicit !== undefined) return String(explicit);
  if (envDefined(envKey)) {
    const v = process.env[envKey];
    if (v === "") return null;
    return v;
  }
  return fallback;
}

function resolveLevel(explicit) {
  if (explicit !== undefined) return parseLevel(explicit);
  if (envDefined("P_LOG_LEVEL")) return parseLevel(process.env.P_LOG_LEVEL);
  if (isTruthy(process.env.P_LOG_DEBUG)) return "debug";
  return "info";
}

function resolveTee(explicit) {
  if (explicit !== undefined) return parseTee(explicit);
  if (envDefined("P_LOG_TEE")) return parseTee(process.env.P_LOG_TEE);
  return "none";
}

function luminance(r, g, b) {
  return Math.trunc((299 * r + 587 * g + 114 * b) / 1000);
}

function rgbToHex(r, g, b) {
  return [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function sampleRgb() {
  const buf = crypto.randomBytes(3);
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

function resolveMaybe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function resolveForCreate(filePath) {
  const abs = path.resolve(filePath);
  try {
    return fs.realpathSync(abs);
  } catch {
    const dir = path.dirname(abs);
    try {
      return path.join(fs.realpathSync(dir), path.basename(abs));
    } catch {
      return abs;
    }
  }
}

function homesToProtect() {
  const homes = [];
  if (process.env.HOME) homes.push(resolveMaybe(process.env.HOME));
  if (process.env.SUDO_USER) {
    homes.push(path.resolve(`/home/${process.env.SUDO_USER}`));
  }
  return homes;
}

function isUnderHome(filePath) {
  const resolved = resolveForCreate(filePath);
  return homesToProtect().some((home) => {
    return resolved === home || resolved.startsWith(home + path.sep);
  });
}

function d054RefuseCreate(filePath) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return false;
  return isUnderHome(filePath);
}

function pathsEqual(a, b) {
  if (a == null || b == null) return false;
  return path.resolve(a) === path.resolve(b);
}

function warnLine(msg) {
  try {
    const encoded = pstrAlways("+r", msg) + "\n";
    const on = colorEnabled(process.stderr, { toolColorKeys: COLOR_TOOL_KEYS });
    process.stderr.write(on ? encoded : ansiStrip(encoded));
  } catch {
    /* ignore */
  }
}

function tryAppend(filePath, bytes) {
  const exists = fs.existsSync(filePath);
  if (!exists && d054RefuseCreate(filePath)) {
    warnLine(`plog: refuse to create ${filePath} as root (D054)`);
    return 0;
  }
  try {
    const fd = fs.openSync(
      filePath,
      fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT,
      0o600
    );
    try {
      fs.writeSync(fd, bytes);
    } finally {
      fs.closeSync(fd);
    }
    return 1;
  } catch (err) {
    warnLine(`plog: cannot write ${filePath}: ${err.code || err.message}`);
    return 0;
  }
}

function tryTee(stream, bytes, label) {
  try {
    const on = colorEnabled(stream, { toolColorKeys: COLOR_TOOL_KEYS });
    const out = on ? bytes : ansiStrip(bytes);
    stream.write(out);
    return 1;
  } catch (err) {
    warnLine(`plog: cannot write ${label}: ${err.code || err.message}`);
    return 0;
  }
}

const state = {
  calledInit: false,
  sessionReady: false,
  materialized: false,
  file: null,
  errorFile: null,
  level: "info",
  tee: "none",
  sessionId: null,
  sessionFg: null,
  sessionBg: null,
  now: defaultNow,
  randomId: defaultRandomId,
};

function applyDestLevelTee(opts) {
  state.file = resolveDest(opts.file, "P_LOG_FILE", defaultFilePath());
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
    process.env.P_LOG_SESSION_ID = state.sessionId;
  } else {
    state.sessionId = null;
    delete process.env.P_LOG_SESSION_ID;
    delete process.env.P_LOG_SESSION_COLOR_FG;
    delete process.env.P_LOG_SESSION_COLOR_BG;
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

  if (state.sessionFg) process.env.P_LOG_SESSION_COLOR_FG = state.sessionFg;
  if (state.sessionBg) process.env.P_LOG_SESSION_COLOR_BG = state.sessionBg;
}

function materializeConfig() {
  if (state.materialized) return;
  applyDestLevelTee({});
  state.materialized = true;
}

function init(opts) {
  if (opts == null || typeof opts !== "object" || Array.isArray(opts)) opts = {};
  state.calledInit = true;
  state.sessionReady = false;
  applyHooks(opts);
  applyDestLevelTee(opts);
  applySessionFromInit(opts);
  state.materialized = true;
  return log;
}

function sessionEnsure() {
  if (state.sessionId == null) {
    if (envSessionIdSet()) {
      state.sessionId = parseSessionId(process.env.P_LOG_SESSION_ID);
    } else {
      state.sessionId = parseSessionId(state.randomId(), true);
    }
  }

  const fg = state.sessionFg || process.env.P_LOG_SESSION_COLOR_FG;
  const bg = state.sessionBg || process.env.P_LOG_SESSION_COLOR_BG;
  if (validHex(fg) && validHex(bg)) {
    state.sessionFg = String(fg).toLowerCase();
    state.sessionBg = String(bg).toLowerCase();
  } else {
    const sampled = sampleFgBg();
    state.sessionFg = sampled.fg;
    state.sessionBg = sampled.bg;
  }

  process.env.P_LOG_SESSION_ID = state.sessionId;
  process.env.P_LOG_SESSION_COLOR_FG = state.sessionFg;
  process.env.P_LOG_SESSION_COLOR_BG = state.sessionBg;
}

function sessionStyle() {
  return `+*h${state.sessionFg}H${state.sessionBg}`;
}

function prefixFor(level, ts) {
  const tsStyle = level === "error" ? "+wR" : "+a";
  const upper = level.toUpperCase();
  return (
    pstrAlways(tsStyle, ts) +
    " " +
    pstrAlways(LEVEL_STYLE[level], upper) +
    " " +
    pstrAlways(sessionStyle(), `[${state.sessionId}]`) +
    " | "
  );
}

function bannerLine(ts) {
  const prefixInfo =
    pstrAlways("+a", ts) +
    " " +
    pstrAlways("+n", "INFO") +
    " " +
    pstrAlways(sessionStyle(), `[${state.sessionId}]`) +
    " | ";
  const bannerMsg = pstrAlways(
    "+g",
    `### plog session start id=${state.sessionId} pid=${process.pid} ###`
  );
  return prefixInfo + bannerMsg + "\n";
}

function write(level, args) {
  materializeConfig();
  if (LEVELS[level] < LEVELS[state.level]) return "";

  const inherited = !state.calledInit && envSessionIdSet();
  sessionEnsure();
  const ts = state.now();
  const msg = pstrAlways(...args)
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
  const line = prefixFor(level, ts) + msg + "\n";

  let banner = "";
  if (!inherited && !state.sessionReady) {
    banner = bannerLine(ts);
  }
  const payload = banner + line;
  state.sessionReady = true;

  let ok = 0;
  let configured = 0;

  if (state.file) {
    configured++;
    ok += tryAppend(state.file, payload);
  }
  if (level === "error" && state.errorFile && !pathsEqual(state.errorFile, state.file)) {
    configured++;
    ok += tryAppend(state.errorFile, line);
  }
  if (state.tee === "stderr" || state.tee === "both") {
    configured++;
    ok += tryTee(process.stderr, payload, "stderr");
  }
  if (state.tee === "stdout" || state.tee === "both") {
    configured++;
    ok += tryTee(process.stdout, payload, "stdout");
  }

  if (configured > 0 && ok === 0) return "";
  return line;
}

export const log = {
  init,
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
      sessionId: state.sessionId,
    };
  },
};

export const plog = log;
export default log;

export function logInit(opts) {
  return log.init(opts);
}
