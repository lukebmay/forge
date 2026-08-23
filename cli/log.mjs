#!/usr/bin/env node
/**
 * forge log — Shell level control (D053) + plog-query forward (D066).
 *
 * Level ops (DBus): bare status, LEVEL, reset, --persist, --truncate.
 * Query ops: `query`/`show`/`q` or plog-query flags → vendored plog-query
 * defaulting to forge hunt tapes (~/.local/state/forge/forge.{log,jsonl}).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage } from "./dbus.mjs";
import { resolveDefaultLogFile, resolveJsonlFile } from "../lib/shared/plog-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const PLOG_QUERY = path.join(REPO_ROOT, "third_party", "plog-query", "plog-query");

const LEVEL_TOKENS = new Set([
  "off",
  "fatal",
  "error",
  "warn",
  "warning",
  "info",
  "debug",
  "trace",
  "all",
]);

const QUERY_HEADS = new Set(["query", "q", "show", "tail"]);

/** Flags that mean “this is a plog-query invocation”. */
const QUERY_FLAG_RE =
  /^--(session|level|since|until|last|grep|json|color|pretty|compact|hilight|bat-theme|version|help)(=|$)/;

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   mode: "level" | "query",
 *   op: "status" | "set" | "reset" | "truncate",
 *   level: string | null,
 *   persist: boolean,
 *   truncate: boolean,
 *   queryArgv: string[],
 *   error: string | null,
 * }}
 */
export function parseArgv(argv) {
  let help = false;
  let persist = false;
  let truncate = false;
  /** @type {string[]} */
  const positionals = [];
  /** @type {string[]} */
  const queryArgv = [];
  /** @type {string | null} */
  let error = null;
  let sawQueryFlag = false;
  let queryHead = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (i === 0 && QUERY_HEADS.has(String(a).toLowerCase())) {
      queryHead = true;
      // drop the head token; remainder is plog-query argv
      queryArgv.push(...argv.slice(1));
      return {
        help: false,
        mode: "query",
        op: "status",
        level: null,
        persist: false,
        truncate: false,
        queryArgv,
        error: null,
      };
    }

    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a === "--persist") {
      persist = true;
      continue;
    }
    if (a === "--truncate") {
      truncate = true;
      continue;
    }
    if (QUERY_FLAG_RE.test(a) || a === "--json") {
      sawQueryFlag = true;
      queryArgv.push(a);
      // take option values that are separate argv tokens
      if (
        (a === "--session" ||
          a === "--level" ||
          a === "--since" ||
          a === "--until" ||
          a === "--last" ||
          a === "--grep" ||
          a === "--color" ||
          a === "--pretty" ||
          a === "--hilight" ||
          a === "--bat-theme") &&
        i + 1 < argv.length &&
        !String(argv[i + 1]).startsWith("-")
      ) {
        queryArgv.push(argv[++i]);
      }
      continue;
    }
    if (a.startsWith("-")) {
      error = `forge log: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) {
    return {
      help,
      mode: "level",
      op: "status",
      level: null,
      persist,
      truncate,
      queryArgv: [],
      error,
    };
  }

  // Positional .jsonl / .log file with no level-op tokens → query
  const looksLikeFile =
    positionals.length === 1 &&
    /\.(jsonl|log)$/i.test(positionals[0]) &&
    !LEVEL_TOKENS.has(positionals[0].toLowerCase()) &&
    positionals[0].toLowerCase() !== "reset";

  if (sawQueryFlag || looksLikeFile) {
    // Rebuild query argv from original (minus forge-only --persist/--truncate)
    const forwarded = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--persist" || a === "--truncate") continue;
      if (a === "-h" || a === "--help") {
        forwarded.push("--help");
        continue;
      }
      forwarded.push(a);
    }
    return {
      help: false,
      mode: "query",
      op: "status",
      level: null,
      persist: false,
      truncate: false,
      queryArgv: forwarded,
      error: null,
    };
  }

  if (help) {
    return {
      help: true,
      mode: "level",
      op: "status",
      level: null,
      persist,
      truncate,
      queryArgv: [],
      error: null,
    };
  }

  if (positionals.length > 1) {
    return {
      help,
      mode: "level",
      op: "status",
      level: null,
      persist,
      truncate,
      queryArgv: [],
      error: `forge log: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }

  const head = positionals[0] ? String(positionals[0]).trim().toLowerCase() : "";

  if (!head) {
    if (truncate && !persist) {
      return {
        help,
        mode: "level",
        op: "truncate",
        level: null,
        persist: false,
        truncate: true,
        queryArgv: [],
        error: null,
      };
    }
    if (persist) {
      return {
        help,
        mode: "level",
        op: "status",
        level: null,
        persist,
        truncate,
        queryArgv: [],
        error: "forge log: --persist requires a level (e.g. forge log trace --persist)",
      };
    }
    return {
      help,
      mode: "level",
      op: "status",
      level: null,
      persist: false,
      truncate: false,
      queryArgv: [],
      error: null,
    };
  }

  if (head === "reset") {
    if (persist) {
      return {
        help,
        mode: "level",
        op: "reset",
        level: null,
        persist,
        truncate,
        queryArgv: [],
        error: "forge log: reset clears session only (do not pass --persist)",
      };
    }
    return {
      help,
      mode: "level",
      op: "reset",
      level: null,
      persist: false,
      truncate,
      queryArgv: [],
      error: null,
    };
  }

  if (LEVEL_TOKENS.has(head) || /^\d+$/.test(head)) {
    return {
      help,
      mode: "level",
      op: "set",
      level: head,
      persist,
      truncate,
      queryArgv: [],
      error: null,
    };
  }

  return {
    help,
    mode: "level",
    op: "status",
    level: null,
    persist,
    truncate,
    queryArgv: [],
    error: `forge log: unknown level or action ${JSON.stringify(
      positionals[0]
    )} (off|error|warn|info|debug|trace|reset|query …)`,
  };
}

function printHelp(out) {
  out.write(`Usage:
  forge log [LEVEL | reset] [--persist] [--truncate]
  forge log query|show|q [plog-query flags…]
  forge log --last N | --grep PAT | --since WHEN | …

Shell log level (no tip reload) and searchable dual-tape query.

Level control:
  forge log                 Status: durable / session / effective / files
  forge log trace           Session-only (until disable/enable or reset)
  forge log debug|info|warn|error|off
  forge log reset           Clear session → durable
  forge log trace --persist Write gsettings (multi-session)
  forge log --truncate      Empty forge.log + forge.jsonl now

Query (forwards to vendored plog-query; defaults to forge JSONL tape):
  forge log query                     Last 30 records (color reprint)
  forge log --last 50 --grep slot
  forge log --level warn+ --since 2h
  forge log --json --last 10
  forge log show --session Ab3xK

Session wins when set. CLI FORGE_LOG_LEVEL is process-only (never Shell).
JSONL is on by default beside the hunt file (FORGE_LOG_JSONL=0 to disable).

Options (level):
  --persist       Write logging-enabled + log-level via gsettings
  --truncate      Truncate hunt tapes (alone or with a level change)
  -h, --help      Show this help

plog-query flags: --session --level --since --until --last --grep --json
  --color --pretty --compact --hilight --bat-theme --version
`);
}

/**
 * @param {{
 *   durable: { enabled: boolean, level: number, levelName: string },
 *   session: { level: number, levelName: string } | null,
 *   effective: { level: number, levelName: string },
 *   file: string | null,
 *   jsonl?: string | null,
 * }} status
 * @param {{ write: (s: string) => void }} out
 */
export function formatLogStatus(status, out) {
  const d = status.durable;
  const durableLine = d.enabled
    ? `${d.levelName} (${d.level})`
    : `${d.levelName} (${d.level}, logging-enabled=false)`;
  const sessionLine = status.session
    ? `${status.session.levelName} (${status.session.level})`
    : "(none)";
  const eff = status.effective;
  out.write(`durable:   ${durableLine}\n`);
  out.write(`session:   ${sessionLine}\n`);
  out.write(`effective: ${eff.levelName} (${eff.level})\n`);
  if (status.file) out.write(`file:      ${status.file}\n`);
  if (status.jsonl) out.write(`jsonl:     ${status.jsonl}\n`);
  else if (status.file) out.write(`jsonl:     (off)\n`);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ file: string | null, jsonl: string | null }}
 */
export function resolveForgeLogTapes(env = process.env) {
  const file = resolveDefaultLogFile({
    envGet: (k) => env[k],
    homeDir: () => os.homedir(),
    pathJoin: (a, b) => path.join(a, b),
    dirname: (p) => path.dirname(p),
  });
  const jsonl = resolveJsonlFile(file, {
    envGet: (k) => env[k],
    pathJoin: (a, b) => path.join(a, b),
    dirname: (p) => path.dirname(p),
  });
  return { file, jsonl };
}

/**
 * --color=auto needs child isatty; inherit TTY sinks, pipe captures/redirects.
 * @param {{ stdoutIsTTY?: boolean, stderrIsTTY?: boolean }} [opts]
 * @returns {["inherit", "inherit"|"pipe", "inherit"|"pipe"]}
 */
export function resolvePlogQueryStdio(opts = {}) {
  return ["inherit", opts.stdoutIsTTY ? "inherit" : "pipe", opts.stderrIsTTY ? "inherit" : "pipe"];
}

/**
 * @param {string[]} queryArgv
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   spawnSync?: typeof spawnSync,
 *   plogQueryPath?: string,
 *   stdout?: { write: (s: string) => void, isTTY?: boolean },
 *   stderr?: { write: (s: string) => void, isTTY?: boolean },
 *   stdoutIsTTY?: boolean,
 *   stderrIsTTY?: boolean,
 * }} [deps]
 * @returns {number}
 */
export function runPlogQuery(queryArgv, deps = {}) {
  const env = { ...(deps.env ?? process.env) };
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const tapes = resolveForgeLogTapes(env);
  if (tapes.file && env.P_LOG_FILE == null) env.P_LOG_FILE = tapes.file;
  if (tapes.jsonl && env.P_LOG_JSONL == null) env.P_LOG_JSONL = tapes.jsonl;

  const bin = deps.plogQueryPath ?? PLOG_QUERY;
  const spawn = deps.spawnSync ?? spawnSync;
  // Skip exists check when tests inject spawnSync.
  if (!deps.spawnSync && !fs.existsSync(bin)) {
    writeErr(`forge log: missing plog-query at ${bin}`);
    return 1;
  }

  // Capture sinks stay piped; real TTY fds inherit so child isatty is true.
  const stdoutIsTTY =
    deps.stdoutIsTTY ?? (stdout === process.stdout && Boolean(process.stdout.isTTY));
  const stderrIsTTY =
    deps.stderrIsTTY ?? (stderr === process.stderr && Boolean(process.stderr.isTTY));
  const stdio = resolvePlogQueryStdio({ stdoutIsTTY, stderrIsTTY });

  const result = spawn(bin, queryArgv, {
    env,
    encoding: "utf8",
    stdio,
  });

  if (result.error) {
    writeErr(`forge log: plog-query failed: ${result.error.message || result.error}`);
    return 1;
  }
  if (stdio[1] === "pipe" && result.stdout) stdout.write(result.stdout);
  if (stdio[2] === "pipe" && result.stderr) stderr.write(result.stderr);
  const code = typeof result.status === "number" ? result.status : 1;
  return code;
}

/**
 * @param {Record<string, unknown>} req
 * @param {{
 *   run?: import("./dbus.mjs").RunFn,
 *   env?: NodeJS.ProcessEnv,
 *   which?: () => string | null,
 *   stdout?: { write: (s: string) => void },
 *   stderr?: { write: (s: string) => void },
 * }} deps
 * @returns {{ code: number, data: Record<string, unknown> | null }}
 */
function callLog(req, deps) {
  const env = deps.env ?? process.env;
  const stderr = deps.stderr ?? process.stderr;
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const runCmd = deps.run ?? createDefaultRun(env);

  let raw;
  try {
    raw = callMethod("Log", [JSON.stringify(req)], {
      run: runCmd,
      env,
      which: deps.which,
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "exitCode" in e
        ? /** @type {{ exitCode?: number }} */ (e).exitCode
        : undefined;
    if (code === EXIT_GDBUS_MISSING) {
      writeErr(gdbusMissingMessage());
      return { code: EXIT_GDBUS_MISSING, data: null };
    }
    const msg = e && e.message ? e.message : String(e);
    writeErr(`forge log: bus call failed (is the extension enabled?): ${msg}`);
    return { code: 1, data: null };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const stdout = deps.stdout ?? process.stdout;
    stdout.write(raw.endsWith("\n") ? raw : `${raw}\n`);
    return { code: 1, data: null };
  }

  if (data && typeof data === "object" && data.error) {
    writeErr(`forge log: ${data.error}`);
    return { code: 1, data };
  }
  if (data && typeof data === "object" && data.ok === false) {
    writeErr(`forge log: ${data.error || "failed"}`);
    return { code: 1, data };
  }
  return { code: 0, data };
}

/**
 * @param {string[]} argv
 * @param {{
 *   run?: import("./dbus.mjs").RunFn,
 *   env?: NodeJS.ProcessEnv,
 *   which?: () => string | null,
 *   stdout?: { write: (s: string) => void },
 *   stderr?: { write: (s: string) => void },
 *   spawnSync?: typeof spawnSync,
 *   plogQueryPath?: string,
 * }} [deps]
 * @returns {number}
 */
export function run(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };

  const opts = parseArgv(argv);
  if (opts.help) {
    printHelp(stdout);
    return 0;
  }
  if (opts.error) {
    writeErr(opts.error);
    return 1;
  }

  if (opts.mode === "query") {
    return runPlogQuery(opts.queryArgv, deps);
  }

  /** @type {Record<string, unknown>} */
  const req = { op: opts.op };
  if (opts.op === "set") {
    req.level = opts.level;
    req.persist = opts.persist;
  }

  let result = callLog(req, deps);
  if (result.code !== 0) return result.code;

  if (opts.truncate && opts.op === "set") {
    result = callLog({ op: "truncate" }, deps);
    if (result.code !== 0) return result.code;
  }

  const data = result.data;
  if (!data || typeof data !== "object") return 1;

  formatLogStatus(
    {
      durable: /** @type {*} */ (data.durable),
      session: data.session ?? null,
      effective: /** @type {*} */ (data.effective),
      file: data.file ?? null,
      jsonl: data.jsonl ?? null,
    },
    stdout
  );
  return 0;
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
