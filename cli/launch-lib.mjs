/**
 * Launch / wait helpers for forge launch + run (CN6).
 * Mirrors scripts/forge/forge do_launch / launch_app / wait_for_wm_class.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callMethod, createDefaultRun } from "./dbus.mjs";
import { ensureForgePlog } from "./plog.mjs";

export const DEFAULT_LAUNCH_TIMEOUT_MS = 15000;
export const GHOSTTY_MULTI_INSTANCE_FLAG = "--gtk-single-instance=false";
export const CLI_ONLY_OPS = Object.freeze(["launch", "wait-window", "wait"]);

const CLI_ONLY_OP_SET = new Set(CLI_ONLY_OPS);
const SETTLED_MODES = new Set(["TILE", "tile"]);
const SETTLED_MODES_LOOSE = new Set(["TILE", "tile", "GRAB_TILE", "grab_tile"]);

const LAUNCH_ENV_DROP = new Set([
  "NO_COLOR",
  "FORCE_COLOR",
  "CLICOLOR",
  "CLICOLOR_FORCE",
  "CARGO_TERM_COLOR",
  "PIP_NO_COLOR",
  "NPM_CONFIG_COLOR",
  "PY_COLORS",
  "PYTHON_COLORS",
  "FORGE_JOB",
  "FORGE_JOB_WORKER",
  "FORGE_JOB_ID",
  "FORGE_JOB_DIR",
]);

/**
 * @param {number} ms
 */
export function sleepMs(ms) {
  const n = Math.max(0, Math.floor(ms));
  if (n <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
  } catch {
    const end = Date.now() + n;
    while (Date.now() < end) {
      /* spin */
    }
  }
}

/**
 * @param {string} cmd
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function which(cmd, env = process.env) {
  if (!cmd) return null;
  if (path.isAbsolute(cmd) && fs.existsSync(cmd)) return cmd;
  const pathEnv = env.PATH || process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, cmd);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * @param {string} input
 * @returns {string[]}
 */
export function shellSplit(input) {
  const s = String(input ?? "");
  try {
    return shellSplitStrict(s);
  } catch {
    return s.split(/\s+/).filter(Boolean);
  }
}

/**
 * @param {string} s
 * @returns {string[]}
 */
function shellSplitStrict(s) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < s.length) {
        cur += s[++i];
        continue;
      }
      if (c === quote) {
        quote = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      continue;
    }
    cur += c;
  }
  if (quote) throw new Error("unclosed quote");
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {string[]} parts
 * @returns {string}
 */
export function shellJoin(parts) {
  return parts
    .map((p) => {
      const s = String(p);
      if (/^[A-Za-z0-9_./:=+@%,-]+$/.test(s)) return s;
      return `'${s.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}

/**
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function launchEnv(base = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...base };
  for (const key of LAUNCH_ENV_DROP) {
    delete env[key];
  }
  return env;
}

/** @returns {string} */
export function launchHome() {
  return os.homedir() || "/";
}

/**
 * @param {string[]} argv
 * @param {{
 *   spawn?: typeof spawn,
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string,
 * }} [deps]
 * @returns {{ pid: number | undefined }}
 */
export function popenDetached(argv, deps = {}) {
  const spawnFn = deps.spawn ?? spawn;
  const env = launchEnv(deps.env ?? process.env);
  const cwd = deps.cwd ?? launchHome();
  const proc = spawnFn(argv[0], argv.slice(1), {
    detached: true,
    stdio: "ignore",
    cwd,
    env,
  });
  proc.unref();
  return { pid: proc.pid };
}

/** @returns {string[]} */
export function xdgDataDirs(env = process.env) {
  const dirs = [];
  const home = os.homedir();
  dirs.push(path.join(home, ".local", "share"));
  const xdg = env.XDG_DATA_DIRS || "/usr/local/share:/usr/share";
  for (const part of xdg.split(":")) {
    const p = part.trim();
    if (p && !dirs.includes(p)) dirs.push(p);
  }
  return dirs;
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function parseDesktopEntry(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return out;
  }
  let inEntry = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      inEntry = line === "[Desktop Entry]";
      continue;
    }
    if (!inEntry || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key.includes("[")) continue;
    if (key && !(key in out)) out[key] = val;
  }
  return out;
}

/**
 * @param {string} execLine
 * @returns {string}
 */
export function execBinary(execLine) {
  if (!execLine) return "";
  let cleaned = execLine;
  for (const code of ["%f", "%F", "%u", "%U", "%i", "%c", "%k"]) {
    cleaned = cleaned.split(code).join("");
  }
  const parts = shellSplit(cleaned);
  if (!parts.length) return "";
  return path.basename(parts[0]);
}

/**
 * @param {string} execLine
 * @returns {string}
 */
export function execBinaryPath(execLine) {
  if (!execLine) return "";
  let cleaned = execLine;
  for (const code of ["%f", "%F", "%u", "%U", "%i", "%c", "%k"]) {
    cleaned = cleaned.split(code).join("");
  }
  const parts = shellSplit(cleaned);
  return parts[0] || "";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function iterDesktopFiles(env = process.env) {
  const seen = new Set();
  /** @type {string[]} */
  const files = [];
  for (const data of xdgDataDirs(env)) {
    const appDir = path.join(data, "applications");
    let entries;
    try {
      entries = fs.readdirSync(appDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".desktop")) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      const full = path.join(appDir, name);
      try {
        if (!fs.statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      seen.add(key);
      files.push(full);
    }
  }
  return files;
}

/**
 * @param {string} app
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function resolveDesktopFile(app, env = process.env) {
  let raw = String(app || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!raw) return null;

  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  try {
    if (
      fs.existsSync(expanded) &&
      expanded.endsWith(".desktop") &&
      fs.statSync(expanded).isFile()
    ) {
      return path.resolve(expanded);
    }
  } catch {
    /* continue */
  }

  const name = raw.endsWith(".desktop") ? raw : `${raw}.desktop`;
  const base = path.basename(name);
  for (const data of xdgDataDirs(env)) {
    const candidate = path.join(data, "applications", base);
    try {
      if (fs.statSync(candidate).isFile()) return path.resolve(candidate);
    } catch {
      /* next */
    }
  }

  const baseCf = base.toLowerCase();
  for (const f of iterDesktopFiles(env)) {
    if (path.basename(f).toLowerCase() === baseCf) return path.resolve(f);
  }

  let q = raw.toLowerCase();
  if (q.endsWith(".desktop")) q = q.slice(0, -".desktop".length);
  /** @type {[number, string][]} */
  const candidates = [];
  for (const f of iterDesktopFiles(env)) {
    const entry = parseDesktopEntry(f);
    const typ = entry.Type || "Application";
    if (typ && typ !== "Application") continue;
    if ((entry.Hidden || "").toLowerCase() === "true" || entry.Hidden === "1") continue;
    const stem = path.basename(f, ".desktop").toLowerCase();
    const execBin = execBinary(entry.Exec || "").toLowerCase();
    let tryBin = (entry.TryExec || "").toLowerCase();
    if (tryBin) tryBin = path.basename(tryBin);
    const startup = (entry.StartupWMClass || "").toLowerCase();
    const appName = (entry.Name || "").toLowerCase();

    let score = null;
    if (execBin === q || tryBin === q) score = 0;
    else if (stem === q || stem.endsWith(`.${q}`)) score = 1;
    else if (startup === q) score = 2;
    else if (appName === q) score = 3;
    else if (stem.split(".").includes(q)) score = 4;
    else if (appName.startsWith(q) || appName.split(/\s+/).includes(q)) score = 5;
    if (score == null) continue;
    if ((entry.NoDisplay || "").toLowerCase() === "true" || entry.NoDisplay === "1") {
      score += 10;
    }
    candidates.push([score, path.resolve(f)]);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]));
  const best = candidates[0][0];
  const top = candidates.filter((c) => c[0] === best);
  if (top.length === 1) return top[0][1];
  top.sort((a, b) => {
    const sa = path.basename(a[1], ".desktop");
    const sb = path.basename(b[1], ".desktop");
    const ga = sa.startsWith("org.gnome.") ? 0 : 1;
    const gb = sb.startsWith("org.gnome.") ? 0 : 1;
    return ga - gb || sa.length - sb.length || sa.toLowerCase().localeCompare(sb.toLowerCase());
  });
  return top[0][1];
}

/**
 * @param {string} token
 * @returns {string}
 */
function ghosttyStem(token) {
  let t = String(token || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!t) return "";
  let name = path.basename(t);
  if (name.toLowerCase().endsWith(".desktop")) name = name.slice(0, -".desktop".length);
  const cf = name.toLowerCase();
  if (cf.includes(".")) return cf.split(".").pop() || cf;
  return cf;
}

/**
 * @param {string} app
 * @param {string | null} [desktop]
 * @returns {boolean}
 */
export function isGhosttyLaunchTarget(app, desktop = null) {
  if (desktop) {
    const stem = path.basename(String(desktop), path.extname(String(desktop))).toLowerCase();
    if (
      stem === "ghostty" ||
      stem === "com.mitchellh.ghostty" ||
      stem.endsWith(".ghostty") ||
      ghosttyStem(stem) === "ghostty"
    ) {
      return true;
    }
  }
  const raw = String(app || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!raw) return false;
  if (ghosttyStem(raw) === "ghostty") return true;
  const parts = shellSplit(raw);
  if (!parts.length) return false;
  return ghosttyStem(parts[0]) === "ghostty";
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function isGhosttyExecutableToken(token) {
  const t = String(token || "").trim();
  if (!t || t.toLowerCase().endsWith(".desktop")) return false;
  return path.basename(t).toLowerCase() === "ghostty";
}

/**
 * @param {string} [app]
 * @param {{ desktop?: string | null, exePath?: string | null }} [opts]
 * @returns {string[]}
 */
export function ghosttyMultiInstanceArgv(app = "ghostty", opts = {}) {
  let exe = (opts.exePath || "").trim() || null;
  const raw = String(app || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  /** @type {string[]} */
  const extra = [];
  if (raw) {
    const parts = shellSplit(raw);
    if (parts.length && ghosttyStem(parts[0]) === "ghostty") {
      if (exe == null && isGhosttyExecutableToken(parts[0])) exe = parts[0];
      for (const p of parts.slice(1)) {
        if (String(p).startsWith("--gtk-single-instance=")) continue;
        extra.push(p);
      }
    }
  }
  if (!exe) exe = "ghostty";
  return [exe, GHOSTTY_MULTI_INSTANCE_FLAG, ...extra];
}

/**
 * @param {string} app
 * @returns {string}
 */
export function rewriteGhosttyLaunchApp(app) {
  if (!isGhosttyLaunchTarget(app)) {
    return String(app || "").trim();
  }
  return shellJoin(ghosttyMultiInstanceArgv(app));
}

/**
 * @param {string | null | undefined} desktop
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function ghosttyExeFromDesktop(desktop, env = process.env) {
  if (!desktop) return null;
  let entry;
  try {
    entry = parseDesktopEntry(desktop);
  } catch {
    return null;
  }
  for (const key of ["TryExec", "Exec"]) {
    const raw = entry[key] || "";
    if (!raw) continue;
    const token = key === "Exec" ? execBinaryPath(raw) : String(raw).trim();
    if (!token) continue;
    if (path.isAbsolute(token)) {
      try {
        if (fs.statSync(token).isFile()) return token;
      } catch {
        /* next */
      }
    }
    const w = which(token, env);
    if (w) return w;
  }
  return null;
}

/**
 * @param {string} execLine
 * @returns {string | null}
 */
function chromeAppIdFromExec(execLine) {
  if (!execLine) return null;
  let cleaned = execLine;
  for (const code of ["%f", "%F", "%u", "%U", "%i", "%c", "%k"]) {
    cleaned = cleaned.split(code).join("");
  }
  const parts = shellSplit(cleaned);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("--app-id=")) {
      const aid = p.slice("--app-id=".length).trim();
      if (aid) return aid;
    }
    if (p === "--app-id" && i + 1 < parts.length) {
      const aid = String(parts[i + 1]).trim();
      if (aid) return aid;
    }
  }
  return null;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isChromeBrowserClass(s) {
  const n = String(s || "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  if (n === "google-chrome" || n === "chromium" || n === "chromium-browser" || n === "chrome") {
    return true;
  }
  return n.startsWith("google-chrome-");
}

/**
 * @param {string} s
 * @returns {string | null}
 */
export function chromePwaAppId(s) {
  const n = String(s || "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (n.startsWith("crx_") && n.length > 4) return n.slice(4);
  if (!n.startsWith("chrome-")) return null;
  const rest = n.slice("chrome-".length);
  if (rest.endsWith("-default") && rest.length > "-default".length) {
    return rest.slice(0, -"-default".length);
  }
  const m = rest.match(/^(.+)-profile(?:[._-].+)?$/);
  if (m && m[1]) return m[1];
  return null;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isChromePwaClass(s) {
  return chromePwaAppId(s) != null;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function classEq(a, b) {
  if (a == null || b == null) return false;
  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (sa.endsWith(`.${sb}`) || sb.endsWith(`.${sa}`)) return true;
  const aId = chromePwaAppId(sa);
  const bId = chromePwaAppId(sb);
  if (aId && bId && aId === bId) return true;
  const aBrowser = isChromeBrowserClass(sa);
  const bBrowser = isChromeBrowserClass(sb);
  const aPwa = isChromePwaClass(sa);
  const bPwa = isChromePwaClass(sb);
  if ((aBrowser && bPwa) || (aPwa && bBrowser)) return true;
  if (aBrowser && bBrowser) return true;
  return false;
}

/**
 * @param {string} app
 * @param {string | null} [desktop]
 * @returns {string[]}
 */
export function inferWmClassHints(app, desktop = null) {
  /** @type {string[]} */
  const hints = [];
  const seen = new Set();
  const add = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    const cf = s.toLowerCase();
    if (seen.has(cf)) return;
    seen.add(cf);
    hints.push(s);
  };

  if (desktop) {
    const entry = parseDesktopEntry(desktop);
    const startup = entry.StartupWMClass;
    const execLine = entry.Exec || "";
    const appId = chromePwaAppId(startup || "") || chromeAppIdFromExec(execLine);
    if (appId) {
      add(`chrome-${appId}-Default`);
      add(`crx_${appId}`);
    } else {
      add(startup);
    }
    const stem = path.basename(desktop, path.extname(desktop));
    add(stem);
    if (stem.includes(".")) add(stem.split(".").pop());
    add(execBinary(execLine));
    const te = entry.TryExec || "";
    if (te) add(path.basename(te));
  }

  const raw = String(app || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (raw) {
    add(path.basename(raw));
    if (raw.endsWith(".desktop")) add(path.basename(raw, ".desktop"));
    if (raw.includes(".") && !raw.endsWith(".desktop")) add(raw.split(".").pop());
  }
  return hints;
}

/**
 * @param {string | null | undefined} explicit
 * @param {string[]} hints
 * @returns {string[] | null}
 */
export function mergeLaunchWaitClasses(explicit, hints) {
  /** @type {string[]} */
  const wait = [];
  const seen = new Set();
  const push = (v) => {
    const cf = v.toLowerCase();
    if (seen.has(cf)) return;
    seen.add(cf);
    wait.push(v);
  };
  for (const h of hints || []) {
    if (!h) continue;
    const hv = String(h).trim();
    if (hv) push(hv);
  }
  if (explicit) {
    const e = String(explicit).trim();
    if (e) push(e);
  }
  return wait.length ? wait : null;
}

/**
 * @param {string | null | undefined} explicit
 * @param {string[]} hints
 * @returns {string | null}
 */
export function preferLaunchPlaceClass(explicit, hints) {
  for (const h of hints || []) {
    if (h && isChromePwaClass(h) && String(h).trim().toLowerCase().startsWith("chrome-")) {
      return String(h).trim();
    }
  }
  for (const h of hints || []) {
    if (h && isChromePwaClass(h)) return String(h).trim();
  }
  for (const h of hints || []) {
    if (!h) continue;
    if (explicit && isChromeBrowserClass(explicit) && !isChromeBrowserClass(h)) {
      return String(h).trim();
    }
  }
  if (hints && hints.length) {
    const first = String(hints[0]).trim();
    if (first) return first;
  }
  if (explicit) {
    const e = String(explicit).trim();
    return e || null;
  }
  return null;
}

/**
 * @param {unknown} rect
 * @returns {boolean}
 */
export function rectIsReasonable(rect) {
  if (rect == null) return true;
  if (typeof rect !== "object" || Array.isArray(rect)) return false;
  const r = /** @type {Record<string, unknown>} */ (rect);
  const w = Number(r.width);
  const h = Number(r.height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
  return w > 0 && h > 0;
}

/**
 * @param {unknown} win
 * @param {{ requireTile?: boolean, allowGrab?: boolean }} [opts]
 * @returns {boolean}
 */
export function windowIsSettled(win, opts = {}) {
  const requireTile = opts.requireTile !== false;
  const allowGrab = opts.allowGrab !== false;
  if (!win || typeof win !== "object" || Array.isArray(win)) return false;
  const w = /** @type {Record<string, unknown>} */ (win);
  const wid = w.windowId;
  if (wid == null || String(wid).trim() === "") return false;
  if (requireTile) {
    const mode = w.mode;
    const modes = allowGrab ? SETTLED_MODES_LOOSE : SETTLED_MODES;
    if (mode == null || !modes.has(String(mode))) return false;
  }
  if (!rectIsReasonable(w.rect)) return false;
  const mon = w.monitor;
  if (mon != null) {
    const n = Number(mon);
    if (!Number.isFinite(n) || n < 0) return false;
  }
  return true;
}

/**
 * @param {unknown} node
 * @returns {Record<string, unknown>[]}
 */
export function iterTreeWindows(node) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  const seen = new Set();

  const add = (w, pth = "") => {
    if (!w || typeof w !== "object" || Array.isArray(w)) return;
    const row = { ...w };
    if (!row.path && pth) row.path = pth;
    const wid = row.windowId;
    if (wid != null && String(wid).trim() !== "") {
      const key = String(wid).trim();
      if (seen.has(key)) return;
      seen.add(key);
    }
    out.push(row);
  };

  const walk = (n, pth) => {
    if (!n || typeof n !== "object" || Array.isArray(n)) return;
    const ntype = n.nodeType || n.type;
    if (ntype === "WINDOW") {
      add(n, pth);
      const kids = n.children || n.childNodes || [];
      if (Array.isArray(kids)) {
        for (let i = 0; i < kids.length; i++) {
          walk(kids[i], pth ? `${pth}/${i}` : String(i));
        }
      }
      return;
    }
    const kids = n.children || n.childNodes || [];
    if (!Array.isArray(kids)) return;
    const monId = ntype === "MONITOR" ? n.id : null;
    for (let i = 0; i < kids.length; i++) {
      let childPath;
      if (monId) childPath = `${monId}/${i}`;
      else if (pth) childPath = `${pth}/${i}`;
      else childPath = String(i);
      walk(kids[i], childPath);
    }
  };

  if (node && typeof node === "object" && !Array.isArray(node)) {
    const root = /** @type {Record<string, unknown>} */ (node);
    if (Array.isArray(root.monitors)) {
      for (const m of root.monitors) walk(m, "");
    } else {
      walk(node, "");
    }
    const orphans = Array.isArray(root.orphanWindows) ? root.orphanWindows : [];
    const metas = Array.isArray(root.metaWindows) ? root.metaWindows : [];
    for (const extra of [...orphans, ...metas]) {
      if (!extra || typeof extra !== "object") continue;
      const ex = /** @type {Record<string, unknown>} */ (extra);
      if (ex.placeholder === true) continue;
      if (ex.tracked === false) continue;
      add(ex);
    }
  } else if (Array.isArray(node)) {
    for (const m of node) walk(m, "");
  }
  return out;
}

/**
 * @param {string | string[] | null | undefined} wmClass
 * @returns {string[]}
 */
export function normalizeClassList(wmClass) {
  if (wmClass == null) return [];
  if (typeof wmClass === "string") return wmClass.trim() ? [wmClass] : [];
  return wmClass.filter((x) => x && String(x).trim()).map(String);
}

/**
 * @param {unknown} forest
 * @param {string | string[] | null} wmClass
 * @returns {Record<string, unknown>[]}
 */
export function windowsMatchingClass(forest, wmClass) {
  if (wmClass == null) return iterTreeWindows(forest);
  const wantList = typeof wmClass === "string" ? [wmClass] : [...wmClass];
  const filtered = wantList.filter(Boolean);
  if (!filtered.length) return iterTreeWindows(forest);
  return iterTreeWindows(forest).filter((w) => {
    const cls = w.wmClass || w.wm_class;
    return filtered.some((want) => classEq(cls, want));
  });
}

/**
 * @param {object} [deps]
 * @returns {Set<string>}
 */
export function baselineWindowIds(deps = {}) {
  try {
    const raw = callMethod("GetTree", ["{}"], deps);
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.error) return new Set();
    const ids = new Set();
    for (const w of iterTreeWindows(data)) {
      if (w.windowId != null) ids.add(String(w.windowId));
    }
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * @param {object} opts
 * @param {string | string[] | null} opts.wmClass
 * @param {number} opts.timeoutMs
 * @param {boolean} [opts.first]
 * @param {Set<string> | null} [opts.baselineIds]
 * @param {boolean} [opts.acceptAnyNew]
 * @param {boolean} [opts.requireSettled]
 * @param {object} [opts.deps]
 * @returns {Record<string, unknown>}
 */
export function waitForWmClass(opts) {
  const {
    wmClass,
    timeoutMs,
    first: _first = false,
    baselineIds = null,
    acceptAnyNew = false,
    requireSettled = true,
    deps = {},
  } = opts;
  void _first;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const baseline = baselineIds || new Set();
  let lastErr = "timeout";
  /** @type {Set<string>} */
  const seenClasses = new Set();
  const classList = normalizeClassList(wmClass);
  /** @type {Record<string, unknown>[]} */
  let lastFresh = [];
  /** @type {Record<string, unknown> | null} */
  let pendingUnsettled = null;

  const chosen = (pool, matchedBy) => {
    const c = pool[0];
    return {
      ok: true,
      windowId: c.windowId,
      title: c.title,
      wmClass: c.wmClass,
      path: c.path,
      mode: c.mode,
      matchedBy,
      settled: windowIsSettled(c),
    };
  };

  const pickSettledOrNote = (hits, matchedBy) => {
    if (!hits.length) return null;
    if (!requireSettled) {
      const withId = hits.filter((w) => w.windowId != null && String(w.windowId).trim() !== "");
      if (withId.length) return chosen(withId, matchedBy);
      if (pendingUnsettled == null) {
        pendingUnsettled = chosen(hits, matchedBy);
        pendingUnsettled.settled = false;
      }
      return null;
    }
    const settled = hits.filter((w) => windowIsSettled(w));
    if (settled.length) return chosen(settled, matchedBy);
    if (pendingUnsettled == null) {
      pendingUnsettled = chosen(hits, matchedBy);
      pendingUnsettled.settled = false;
    }
    return null;
  };

  while (Date.now() <= deadline) {
    let data;
    try {
      const raw = callMethod("GetTree", ["{}"], deps);
      data = JSON.parse(raw);
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
      sleepMs(150);
      continue;
    }
    if (data && typeof data === "object" && data.error) {
      lastErr = String(data.error);
      sleepMs(150);
      continue;
    }
    const allWins = iterTreeWindows(data);
    const fresh = allWins.filter((w) => w.windowId == null || !baseline.has(String(w.windowId)));
    for (const w of fresh) {
      const cls = w.wmClass || w.wm_class;
      if (cls) seenClasses.add(String(cls));
    }
    if (fresh.length) lastFresh = fresh;

    if (classList.length) {
      let hits = fresh.filter((w) =>
        classList.some((want) => classEq(w.wmClass || w.wm_class, want))
      );
      if (!hits.length && baseline.size === 0) {
        hits = windowsMatchingClass(data, classList);
      }
      const picked = pickSettledOrNote(hits, "wm-class");
      if (picked) return picked;
    } else {
      const picked = pickSettledOrNote(fresh, "new-window");
      if (picked) return picked;
    }

    if (requireSettled && pendingUnsettled && pendingUnsettled.windowId != null) {
      const wid = String(pendingUnsettled.windowId);
      const live = allWins.find(
        (w) => w.windowId != null && String(w.windowId) === wid && windowIsSettled(w)
      );
      if (live) {
        const out = chosen([live], pendingUnsettled.matchedBy || "wm-class");
        out.settled = true;
        return out;
      }
    }

    sleepMs(120);
  }

  if (acceptAnyNew && lastFresh.length) {
    const picked = pickSettledOrNote(lastFresh, "new-window");
    if (picked) return picked;
    if (pendingUnsettled) {
      pendingUnsettled.settleTimeout = true;
      return pendingUnsettled;
    }
    return chosen(lastFresh, "new-window");
  }

  if (pendingUnsettled) {
    pendingUnsettled.settleTimeout = true;
    pendingUnsettled.ok = true;
    return pendingUnsettled;
  }

  /** @type {Record<string, unknown>} */
  const out = {
    ok: false,
    error: `wait timeout after ${timeoutMs}ms (${lastErr})`,
  };
  if (classList.length === 1) out.wmClass = classList[0];
  else if (classList.length) out.wmClassCandidates = classList;
  if (seenClasses.size) out.seenClasses = [...seenClasses].sort();
  return out;
}

/**
 * @param {string} app
 * @param {{
 *   desktop?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   spawn?: typeof spawn,
 *   whichBin?: (cmd: string, env?: NodeJS.ProcessEnv) => string | null,
 * }} [opts]
 * @returns {{ pid: number | undefined }}
 */
export function launchApp(app, opts = {}) {
  const env = opts.env ?? process.env;
  const whichFn = opts.whichBin ?? which;
  let desktop = opts.desktop ?? null;
  if (desktop == null) {
    desktop = resolveDesktopFile(app, env);
    if (desktop == null && isGhosttyLaunchTarget(app)) {
      desktop =
        resolveDesktopFile("ghostty", env) || resolveDesktopFile("com.mitchellh.ghostty", env);
    }
  }

  if (isGhosttyLaunchTarget(app, desktop)) {
    const exe = ghosttyExeFromDesktop(desktop, env);
    const argv = ghosttyMultiInstanceArgv(app, { desktop, exePath: exe });
    const exe0 = argv[0];
    if (!path.isAbsolute(exe0) && !whichFn(exe0, env)) {
      throw new Error(
        `ghostty multi-instance launch: executable not found: ${JSON.stringify(
          exe0
        )} (app=${JSON.stringify(app)})`
      );
    }
    return popenDetached(argv, { spawn: opts.spawn, env });
  }

  if (desktop) {
    if (whichFn("gio", env))
      return popenDetached(["gio", "launch", desktop], { spawn: opts.spawn, env });
    if (whichFn("gtk-launch", env)) {
      const did = path.basename(desktop, path.extname(desktop));
      return popenDetached(["gtk-launch", did], { spawn: opts.spawn, env });
    }
    throw new Error(`found desktop file ${desktop} but neither gio nor gtk-launch is on PATH`);
  }

  const argv = shellSplit(
    String(app || "")
      .trim()
      .replace(/^['"]|['"]$/g, "")
  );
  if (!argv.length) throw new Error("empty app command");
  const exe = argv[0];
  if (!path.isAbsolute(exe) && !whichFn(exe, env)) {
    throw new Error(
      `app not found as desktop id, short name, or executable: ${JSON.stringify(
        app
      )} (tried *.desktop under XDG applications and PATH)`
    );
  }
  return popenDetached(argv, { spawn: opts.spawn, env });
}

/**
 * @param {object} step
 * @returns {Record<string, unknown>}
 */
export function launchFieldsFromStep(step) {
  const app = step.app || step.desktop || step.command;
  /** @type {Record<string, unknown>} */
  const fields = {
    app: app != null ? String(app).trim() : "",
  };
  const mon = step.monitor;
  if (mon != null && String(mon).trim() !== "") fields.monitor = mon;
  const pth = step.treePath || step.path || step.tree_path;
  if (pth != null && String(pth).trim() !== "") fields.treePath = String(pth).trim();
  const wc = step.wmClass || step.wm_class;
  if (wc != null && String(wc).trim() !== "") fields.wmClass = String(wc).trim();
  const timeout = "timeout" in step ? step.timeout : step.timeoutMs;
  if (timeout != null) fields.timeout = Number.parseInt(String(timeout), 10);
  const noWait = "noWait" in step ? step.noWait : step.no_wait;
  if (noWait != null) fields.noWait = Boolean(noWait);
  if (step.first != null) fields.first = Boolean(step.first);
  return fields;
}

/**
 * @param {object} opts
 * @param {string} opts.app
 * @param {string | null} [opts.wmClass]
 * @param {number | null} [opts.timeout]
 * @param {boolean} [opts.noWait]
 * @param {unknown} [opts.monitor]
 * @param {string | null} [opts.treePath]
 * @param {string | null} [opts.attachSelector]
 * @param {boolean} [opts.first]
 * @param {string | null} [opts.titleContains]
 * @param {string | null} [opts.titleExact]
 * @param {boolean} [opts.requireSettled]
 * @param {object} [opts.deps]
 * @returns {{ rc: number, result: Record<string, unknown> }}
 */
export function doLaunch(opts) {
  const deps = opts.deps || {};
  let app = String(opts.app || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!app) {
    return { rc: 1, result: { ok: false, error: "app required", op: "launch" } };
  }

  const timeoutMs = Number.isFinite(opts.timeout)
    ? /** @type {number} */ (opts.timeout)
    : DEFAULT_LAUNCH_TIMEOUT_MS;
  const env = deps.env ?? process.env;
  let desktop = resolveDesktopFile(app, env);
  if (desktop == null && isGhosttyLaunchTarget(app)) {
    desktop =
      resolveDesktopFile("ghostty", env) || resolveDesktopFile("com.mitchellh.ghostty", env);
  }
  const explicitClass = (opts.wmClass || "").trim() || null;
  let classHints = inferWmClassHints(app, desktop);
  if (!classHints.length && isGhosttyLaunchTarget(app, desktop)) {
    classHints = inferWmClassHints("ghostty", desktop);
  }
  const waitClasses = mergeLaunchWaitClasses(explicitClass, classHints);
  const placeClass = preferLaunchPlaceClass(explicitClass, classHints);

  /** @type {Record<string, unknown>} */
  const placeOpts = {};
  if (opts.monitor != null && String(opts.monitor).trim() !== "") {
    placeOpts.monitor = opts.monitor;
  }
  if (opts.treePath != null && String(opts.treePath).trim() !== "") {
    placeOpts.treePath = opts.treePath;
  }
  const attach = opts.attachSelector != null ? String(opts.attachSelector).trim() : "";
  if (attach) placeOpts.attachSelector = attach;
  if (placeClass) placeOpts.wmClass = placeClass;
  const tc = opts.titleContains != null ? String(opts.titleContains).trim() : "";
  const te = opts.titleExact != null ? String(opts.titleExact).trim() : "";
  if (tc) placeOpts.titleContains = tc;
  if (te) placeOpts.titleExact = te;
  if (opts.first) placeOpts.first = true;
  if (
    placeOpts &&
    ("monitor" in placeOpts || "treePath" in placeOpts || "attachSelector" in placeOpts)
  ) {
    placeOpts.ttlMs = Math.max(timeoutMs, DEFAULT_LAUNCH_TIMEOUT_MS);
  }

  if (
    placeOpts &&
    ("monitor" in placeOpts || "treePath" in placeOpts || "attachSelector" in placeOpts)
  ) {
    ensureForgePlog({ env }).debug(
      `launch PlaceNext app=${app} mon=${placeOpts.monitor ?? "-"} path=${
        placeOpts.treePath ?? "-"
      }`
    );
    let raw;
    let data;
    try {
      raw = callMethod("PlaceNext", [JSON.stringify(placeOpts)], deps);
      data = JSON.parse(raw);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return {
        rc: 1,
        result: {
          ok: false,
          error: `PlaceNext failed: ${msg}`,
          op: "launch",
          app,
        },
      };
    }
    if (!data || typeof data !== "object" || data.ok !== true) {
      const err = data && typeof data === "object" ? data.error : raw;
      /** @type {Record<string, unknown>} */
      const out = {
        ok: false,
        error: `PlaceNext error: ${err}`,
        op: "launch",
        app,
      };
      if (data && typeof data === "object") out.placeNext = data;
      return { rc: 1, result: out };
    }
  }

  /** @type {Set<string>} */
  let baseline = new Set();
  if (!opts.noWait) baseline = baselineWindowIds(deps);

  ensureForgePlog({ env }).debug(
    `launch spawn app=${app} wait=${opts.noWait ? "no" : "yes"} classes=${
      Array.isArray(waitClasses) ? waitClasses.join(",") : waitClasses || "-"
    }`
  );
  let proc;
  try {
    proc = launchApp(app, {
      desktop,
      env,
      spawn: deps.spawn,
      whichBin: deps.whichBin,
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return {
      rc: 1,
      result: { ok: false, error: msg, op: "launch", app },
    };
  }

  if (opts.noWait) {
    /** @type {Record<string, unknown>} */
    const payload = {
      ok: true,
      pid: proc.pid,
      waited: false,
      app,
      op: "launch",
      waitClasses,
      acceptAnyNew: waitClasses == null,
      timeoutMs,
    };
    if (desktop) payload.desktop = desktop;
    if (classHints.length) payload.wmClassCandidates = classHints;
    return { rc: 0, result: payload };
  }

  const requireSettled = opts.requireSettled !== false;
  const result = {
    ...waitForWmClass({
      wmClass: waitClasses,
      timeoutMs,
      first: Boolean(opts.first),
      baselineIds: baseline,
      acceptAnyNew: waitClasses == null,
      requireSettled,
      deps,
    }),
  };
  result.op = "launch";
  result.pid = proc.pid;
  result.waited = true;
  result.app = app;
  result.requireSettled = requireSettled;
  if (desktop) result.desktop = desktop;

  if (!result.ok) {
    const cands = waitClasses || classHints;
    if (cands && cands.length) {
      if (result.wmClassCandidates == null) result.wmClassCandidates = cands;
    }
    return { rc: 1, result };
  }
  return { rc: 0, result };
}

/**
 * @param {object} step
 * @param {object} [deps]
 * @returns {Record<string, unknown>}
 */
export function runCliStep(step, deps = {}) {
  const opRaw = step.op || step.action || step.type;
  const op = opRaw != null ? String(opRaw).trim().toLowerCase() : "";

  if (op === "launch") {
    const fields = launchFieldsFromStep(step);
    const { result } = doLaunch({
      app: /** @type {string} */ (fields.app || ""),
      wmClass: /** @type {string | null} */ (fields.wmClass ?? null),
      timeout: /** @type {number | null} */ (fields.timeout ?? null),
      noWait: Boolean(fields.noWait),
      monitor: fields.monitor,
      treePath: /** @type {string | null} */ (fields.treePath ?? null),
      first: Boolean(fields.first),
      deps,
    });
    return result;
  }

  if (op === "wait") {
    const ms = "ms" in step ? step.ms : step.timeout ?? 0;
    const n = Math.max(0, Number.parseInt(String(ms), 10));
    if (!Number.isFinite(n)) {
      return { ok: false, op: "wait", error: `invalid ms: ${JSON.stringify(ms)}` };
    }
    sleepMs(n);
    return { ok: true, op: "wait", ms: n };
  }

  if (op === "wait-window") {
    const wc = step.wmClass || step.wm_class;
    if (wc == null || String(wc).trim() === "") {
      return { ok: false, op: "wait-window", error: "wmClass required" };
    }
    const timeout = "timeout" in step ? step.timeout : step.timeoutMs;
    const timeoutMs =
      timeout != null ? Number.parseInt(String(timeout), 10) : DEFAULT_LAUNCH_TIMEOUT_MS;
    const result = {
      ...waitForWmClass({
        wmClass: String(wc).trim(),
        timeoutMs,
        first: Boolean(step.first),
        baselineIds: null,
        acceptAnyNew: false,
        deps,
      }),
    };
    result.op = "wait-window";
    return result;
  }

  return { ok: false, op: op || null, error: `unknown CLI op: ${JSON.stringify(op)}` };
}

/**
 * @param {unknown[]} steps
 * @param {{ stopOnError?: boolean, deps?: object }} [opts]
 * @returns {{ rc: number, aggregate: Record<string, unknown> }}
 */
export function runMixedSteps(steps, opts = {}) {
  // Lazy import avoids cycle if run-steps pulls launch-lib later.
  // partition lives in lib/extension/run-steps.js (pure).
  return runMixedStepsWithPartition(steps, opts);
}

/**
 * @param {unknown[]} steps
 * @param {{ stopOnError?: boolean, deps?: object, partition?: (s: unknown[]) => {kind:string,steps:unknown[]}[] }} [opts]
 * @returns {{ rc: number, aggregate: Record<string, unknown> }}
 */
export function runMixedStepsWithPartition(steps, opts = {}) {
  const stopOnError = opts.stopOnError !== false;
  const deps = opts.deps || {};
  const partition =
    opts.partition ||
    ((s) => {
      if (!Array.isArray(s)) return [];
      /** @type {{ kind: string, steps: unknown[] }[]} */
      const chunks = [];
      for (const step of s) {
        /** @type {unknown} */
        let opRaw = null;
        if (step && typeof step === "object" && !Array.isArray(step)) {
          const st = /** @type {Record<string, unknown>} */ (step);
          opRaw = st.op ?? st.action ?? st.type;
        }
        const op = opRaw != null ? String(opRaw).trim().toLowerCase() : "";
        const kind = CLI_ONLY_OP_SET.has(op) ? "cli" : "extension";
        const last = chunks[chunks.length - 1];
        if (last && last.kind === kind) last.steps.push(step);
        else chunks.push({ kind, steps: [step] });
      }
      return chunks;
    });

  const chunks = partition(steps);
  /** @type {Record<string, unknown>[]} */
  const chunkResults = [];
  let allOk = true;
  let stepIndex = 0;

  for (const chunk of chunks) {
    const kind = chunk.kind;
    const csteps = chunk.steps;
    if (kind === "cli") {
      /** @type {Record<string, unknown>[]} */
      const cliOut = [];
      for (const step of csteps) {
        if (!step || typeof step !== "object" || Array.isArray(step)) {
          const r = { ok: false, error: "step must be an object", index: stepIndex };
          cliOut.push(r);
          allOk = false;
          if (stopOnError) {
            chunkResults.push({ kind: "cli", ok: false, results: cliOut });
            return {
              rc: 1,
              aggregate: { ok: false, stoppedAt: stepIndex, chunks: chunkResults },
            };
          }
          stepIndex += 1;
          continue;
        }
        const r = { ...runCliStep(/** @type {object} */ (step), deps) };
        if (r.index == null) r.index = stepIndex;
        cliOut.push(r);
        if (!r.ok) {
          allOk = false;
          if (stopOnError) {
            chunkResults.push({ kind: "cli", ok: false, results: cliOut });
            return {
              rc: 1,
              aggregate: { ok: false, stoppedAt: stepIndex, chunks: chunkResults },
            };
          }
        }
        stepIndex += 1;
      }
      chunkResults.push({
        kind: "cli",
        ok: cliOut.every((x) => x.ok),
        results: cliOut,
      });
    } else {
      const payload = { steps: csteps, stopOnError };
      const stepsJson = JSON.stringify(payload);
      let raw;
      let data;
      try {
        raw = callMethod("RunSteps", [stepsJson], deps);
        data = JSON.parse(raw);
      } catch (e) {
        allOk = false;
        chunkResults.push({
          kind: "extension",
          ok: false,
          error: e && e.message ? e.message : String(e),
          stepIndexBase: stepIndex,
        });
        if (stopOnError) {
          return {
            rc: 1,
            aggregate: { ok: false, stoppedAt: stepIndex, chunks: chunkResults },
          };
        }
        stepIndex += csteps.length;
        continue;
      }
      if (!data || typeof data !== "object") {
        data = { ok: false, error: "invalid RunSteps response", raw };
      }
      const extResults = data.results;
      if (Array.isArray(extResults)) {
        for (const er of extResults) {
          if (er && typeof er === "object" && typeof er.index === "number") {
            er.index = stepIndex + er.index;
          }
        }
      }
      const ok = Boolean(data.ok);
      if (!ok) allOk = false;
      /** @type {Record<string, unknown>} */
      const entry = {
        kind: "extension",
        ok,
        results: Array.isArray(extResults) ? extResults : [],
      };
      if (data.stoppedAt != null) {
        const n = Number(data.stoppedAt);
        entry.stoppedAt = Number.isFinite(n) ? stepIndex + n : data.stoppedAt;
      }
      if (data.error) entry.error = data.error;
      chunkResults.push(entry);
      if (!ok && stopOnError) {
        const stopped = entry.stoppedAt != null ? entry.stoppedAt : stepIndex;
        return {
          rc: 1,
          aggregate: { ok: false, stoppedAt: stopped, chunks: chunkResults },
        };
      }
      stepIndex += csteps.length;
    }
  }

  return {
    rc: allOk ? 0 : 1,
    aggregate: { ok: allOk, chunks: chunkResults },
  };
}

/**
 * @param {unknown} payload
 * @returns {string[]}
 */
export function payloadHasCliOnly(payload) {
  /** @type {unknown[]} */
  let steps;
  if (Array.isArray(payload)) steps = payload;
  else if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const bag = /** @type {Record<string, unknown>} */ (payload);
    if (!Array.isArray(bag.steps)) return [];
    steps = bag.steps;
  } else return [];
  /** @type {string[]} */
  const found = [];
  for (const s of steps) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const row = /** @type {Record<string, unknown>} */ (s);
    const op = row.op || row.action || row.type;
    if (op == null) continue;
    const name = String(op).trim().toLowerCase();
    if (CLI_ONLY_OP_SET.has(name) && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * @param {unknown} payload
 * @returns {{ steps: unknown[], stopOnError: boolean }}
 */
export function extractStepsAndStop(payload) {
  if (Array.isArray(payload)) return { steps: payload, stopOnError: true };
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const bag = /** @type {Record<string, unknown>} */ (payload);
    const steps = bag.steps;
    if (!Array.isArray(steps)) {
      throw new Error("payload must be a steps array or {steps: [...]}");
    }
    const soe = bag.stopOnError;
    if (soe !== undefined && typeof soe !== "boolean") {
      throw new Error("stopOnError must be a boolean");
    }
    return { steps, stopOnError: soe !== false };
  }
  throw new Error("payload must be a steps array or {steps: [...]}");
}

export { callMethod, createDefaultRun };
