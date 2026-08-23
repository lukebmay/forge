#!/usr/bin/env node
/**
 * forge log — session / durable Shell log level (no tip reload).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage } from "./dbus.mjs";

const __filename = fileURLToPath(import.meta.url);

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

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   op: "status" | "set" | "reset" | "truncate",
 *   level: string | null,
 *   persist: boolean,
 *   truncate: boolean,
 *   error: string | null,
 * }}
 */
export function parseArgv(argv) {
  let help = false;
  let persist = false;
  let truncate = false;
  /** @type {string[]} */
  const positionals = [];
  /** @type {string | null} */
  let error = null;

  for (const a of argv) {
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
    if (a.startsWith("-")) {
      error = `forge log: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) {
    return { help, op: "status", level: null, persist, truncate, error };
  }
  if (help) {
    return { help, op: "status", level: null, persist, truncate, error: null };
  }
  if (positionals.length > 1) {
    return {
      help,
      op: "status",
      level: null,
      persist,
      truncate,
      error: `forge log: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }

  const head = positionals[0] ? String(positionals[0]).trim().toLowerCase() : "";

  if (!head) {
    if (truncate && !persist) {
      return { help, op: "truncate", level: null, persist: false, truncate: true, error: null };
    }
    if (persist) {
      return {
        help,
        op: "status",
        level: null,
        persist,
        truncate,
        error: "forge log: --persist requires a level (e.g. forge log trace --persist)",
      };
    }
    return { help, op: "status", level: null, persist: false, truncate: false, error: null };
  }

  if (head === "reset") {
    if (persist) {
      return {
        help,
        op: "reset",
        level: null,
        persist,
        truncate,
        error: "forge log: reset clears session only (do not pass --persist)",
      };
    }
    return { help, op: "reset", level: null, persist: false, truncate, error: null };
  }

  if (LEVEL_TOKENS.has(head) || /^\d+$/.test(head)) {
    return { help, op: "set", level: head, persist, truncate, error: null };
  }

  return {
    help,
    op: "status",
    level: null,
    persist,
    truncate,
    error: `forge log: unknown level or action ${JSON.stringify(
      positionals[0]
    )} (off|error|warn|info|debug|trace|reset)`,
  };
}

function printHelp(out) {
  out.write(`Usage: forge log [LEVEL | reset] [--persist] [--truncate]

Change extension log level without tip reload / logout.

  forge log                 Status: durable / session / effective
  forge log trace           Session-only (until disable/enable or reset)
  forge log debug|info|warn|error|off
  forge log reset           Clear session → durable
  forge log trace --persist Write gsettings (multi-session)
  forge log --truncate      Empty forge.log now (same as enable)

Session wins when set. CLI FORGE_LOG_LEVEL is process-only (never Shell).

Options:
  --persist       Write logging-enabled + log-level via gsettings
  --truncate      Truncate hunt file (alone or with a level change)
  -h, --help      Show this help
`);
}

/**
 * @param {{
 *   durable: { enabled: boolean, level: number, levelName: string },
 *   session: { level: number, levelName: string } | null,
 *   effective: { level: number, levelName: string },
 *   file: string | null,
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
