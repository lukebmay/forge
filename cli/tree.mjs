#!/usr/bin/env node
/**
 * forge tree — Node body (CN4). Dump tiling forest as JSON.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage } from "./dbus.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   monitor: string | null,
 *   workspace: number | null,
 *   maxDepth: number | null,
 *   compact: boolean,
 *   error: string | null,
 * }}
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string | null} */
  let monitor = null;
  /** @type {number | null} */
  let workspace = null;
  /** @type {number | null} */
  let maxDepth = null;
  let compact = false;
  /** @type {string | null} */
  let error = null;

  const needVal = (flag, i) => {
    if (i + 1 >= argv.length) {
      error = `forge tree: ${flag} requires a value`;
      return null;
    }
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a === "--compact") {
      compact = true;
      continue;
    }
    if (a === "--monitor") {
      const v = needVal("--monitor", i);
      if (v == null) break;
      monitor = v;
      i++;
      continue;
    }
    if (a.startsWith("--monitor=")) {
      monitor = a.slice("--monitor=".length);
      continue;
    }
    if (a === "--workspace") {
      const v = needVal("--workspace", i);
      if (v == null) break;
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge tree: --workspace must be an integer (got ${v})`;
        break;
      }
      workspace = n;
      i++;
      continue;
    }
    if (a.startsWith("--workspace=")) {
      const v = a.slice("--workspace=".length);
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge tree: --workspace must be an integer (got ${v})`;
        break;
      }
      workspace = n;
      continue;
    }
    if (a === "--max-depth") {
      const v = needVal("--max-depth", i);
      if (v == null) break;
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge tree: --max-depth must be an integer (got ${v})`;
        break;
      }
      maxDepth = n;
      i++;
      continue;
    }
    if (a.startsWith("--max-depth=")) {
      const v = a.slice("--max-depth=".length);
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge tree: --max-depth must be an integer (got ${v})`;
        break;
      }
      maxDepth = n;
      continue;
    }
    error = `forge tree: unexpected argument: ${a}`;
    break;
  }

  return { help, monitor, workspace, maxDepth, compact, error };
}

/**
 * Build GetTree options object (Python cmd_tree keys).
 * @param {{
 *   monitor: string | null,
 *   workspace: number | null,
 *   maxDepth: number | null,
 * }} opts
 * @returns {Record<string, unknown>}
 */
export function buildTreeOptions(opts) {
  /** @type {Record<string, unknown>} */
  const options = {};
  if (opts.monitor != null) options.monitor = opts.monitor;
  if (opts.workspace != null) options.workspace = opts.workspace;
  if (opts.maxDepth != null) options.maxDepth = opts.maxDepth;
  return options;
}

/**
 * @param {unknown} data
 * @param {boolean} compact
 * @returns {string}
 */
export function formatJson(data, compact) {
  return compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
}

function printHelp(out) {
  out.write(`Usage: forge tree [options]

Dump tiling forest as JSON.

Options:
  --monitor ID|INDEX   Filter by monitor index, moNwsW id, or stableKey
  --workspace N        Filter by workspace index
  --max-depth N        Cap tree projection depth
  --compact            Single-line JSON (default is pretty)
  -h, --help           Show this help
`);
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
  if (opts.error) {
    writeErr(opts.error);
    return 1;
  }

  const optionsJson = JSON.stringify(
    buildTreeOptions({
      monitor: opts.monitor,
      workspace: opts.workspace,
      maxDepth: opts.maxDepth,
    })
  );

  let raw;
  try {
    raw = callMethod("GetTree", [optionsJson], {
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
    writeErr(`forge tree: bus call failed (is the extension enabled?): ${msg}`);
    return 1;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    writeOut(raw);
    return 1;
  }
  if (data && typeof data === "object" && data.error) {
    writeErr(`forge tree: ${data.error}`);
    writeOut(formatJson(data, opts.compact));
    return 1;
  }
  writeOut(formatJson(data, opts.compact));
  return 0;
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
