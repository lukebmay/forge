#!/usr/bin/env node
/**
 * forge ping — Node body (CN4).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage } from "./dbus.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 * @returns {{ help: boolean, rest: string[] }}
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string[]} */
  const rest = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    rest.push(a);
  }
  return { help, rest };
}

function printHelp(out) {
  out.write(`Usage: forge ping

Ping extension DBus; print health JSON (pretty).

Options:
  -h, --help      Show this help
`);
}

/**
 * @param {unknown} data
 * @param {boolean} compact
 * @returns {string}
 */
export function formatJson(data, compact) {
  return compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
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
  const env = deps.env ?? process.env;
  const runCmd = deps.run ?? createDefaultRun(env);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const writeOut = (s) => {
    stdout.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };

  const opts = parseArgv(argv);
  if (opts.help) {
    printHelp(stdout);
    return 0;
  }
  if (opts.rest.length) {
    writeErr(`forge ping: unexpected argument(s): ${opts.rest.join(" ")}`);
    return 1;
  }

  let raw;
  try {
    raw = callMethod("Ping", [], {
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
      return EXIT_GDBUS_MISSING;
    }
    const msg = e && e.message ? e.message : String(e);
    writeErr(`forge ping: bus call failed (is the extension enabled?): ${msg}`);
    return 1;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    writeOut(raw);
    return 1;
  }
  writeOut(formatJson(data, false));
  if (data && typeof data === "object" && data.ok === true) {
    return 0;
  }
  return 1;
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
