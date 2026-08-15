#!/usr/bin/env node
/**
 * forge launch — Node body (CN6).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson } from "./cmd-result.mjs";
import { DEFAULT_LAUNCH_TIMEOUT_MS, doLaunch, createDefaultRun } from "./launch-lib.mjs";
import { EXIT_GDBUS_MISSING, gdbusMissingMessage } from "./dbus.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string | null} */
  let app = null;
  /** @type {string | null} */
  let wmClass = null;
  /** @type {number | null} */
  let timeout = null;
  let noWait = false;
  /** @type {string | null} */
  let monitor = null;
  /** @type {string | null} */
  let treePath = null;
  let first = false;
  /** @type {string | null} */
  let error = null;
  /** @type {string[]} */
  const positionals = [];

  const needVal = (flag, i) => {
    if (i + 1 >= argv.length) {
      error = `forge launch: ${flag} requires a value`;
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
    if (a === "--no-wait") {
      noWait = true;
      continue;
    }
    if (a === "--first") {
      first = true;
      continue;
    }
    if (a === "--last-focused") {
      continue;
    }
    if (a === "--wm-class") {
      const v = needVal("--wm-class", i);
      if (v == null) break;
      wmClass = v;
      i++;
      continue;
    }
    if (a.startsWith("--wm-class=")) {
      wmClass = a.slice("--wm-class=".length);
      continue;
    }
    if (a === "--timeout") {
      const v = needVal("--timeout", i);
      if (v == null) break;
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge launch: --timeout must be an integer (got ${v})`;
        break;
      }
      timeout = n;
      i++;
      continue;
    }
    if (a.startsWith("--timeout=")) {
      const v = a.slice("--timeout=".length);
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) {
        error = `forge launch: --timeout must be an integer (got ${v})`;
        break;
      }
      timeout = n;
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
    if (a === "--path" || a === "--tree-path") {
      const v = needVal(a, i);
      if (v == null) break;
      treePath = v;
      i++;
      continue;
    }
    if (a.startsWith("--path=")) {
      treePath = a.slice("--path=".length);
      continue;
    }
    if (a.startsWith("--tree-path=")) {
      treePath = a.slice("--tree-path=".length);
      continue;
    }
    if (a.startsWith("-")) {
      error = `forge launch: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) {
    return { help, app: null, wmClass, timeout, noWait, monitor, treePath, first, error };
  }
  if (help) {
    return { help, app: null, wmClass, timeout, noWait, monitor, treePath, first, error: null };
  }
  if (positionals.length < 1) {
    return {
      help,
      app: null,
      wmClass,
      timeout,
      noWait,
      monitor,
      treePath,
      first,
      error: "forge launch: app required",
    };
  }
  if (positionals.length > 1) {
    return {
      help,
      app: null,
      wmClass,
      timeout,
      noWait,
      monitor,
      treePath,
      first,
      error: `forge launch: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }
  app = positionals[0];
  return { help, app, wmClass, timeout, noWait, monitor, treePath, first, error: null };
}

function printHelp(out) {
  out.write(`Usage: forge launch <app> [options]

Launch an app by short name, desktop id, or command.

Options:
  --wm-class CLASS   Force wm_class for wait/PlaceNext
  --timeout MS       Wait timeout (default ${DEFAULT_LAUNCH_TIMEOUT_MS})
  --no-wait          Do not wait for the window
  --monitor INDEX    PlaceNext home monitor
  --path PATH        PlaceNext attach path (alias: --tree-path)
  --first            Accept first matching class if several
  --last-focused     Default attach after LFT (no-op; documented default)
  -h, --help         Show this help
`);
}

/**
 * @param {string[]} argv
 * @param {object} [deps]
 * @returns {number}
 */
export function run(argv, deps = {}) {
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

  const callDeps = {
    run: deps.run ?? createDefaultRun(deps.env ?? process.env),
    env: deps.env ?? process.env,
    which: deps.which,
    whichBin: deps.whichBin,
    spawn: deps.spawn,
  };

  const { rc, result } = doLaunch({
    app: /** @type {string} */ (opts.app),
    wmClass: opts.wmClass,
    timeout: opts.timeout,
    noWait: opts.noWait,
    monitor: opts.monitor,
    treePath: opts.treePath,
    first: opts.first,
    deps: callDeps,
  });

  if (!result.ok) {
    const err = result.error || "launch failed";
    if (String(err).includes("gdbus not found") || result.exitCode === EXIT_GDBUS_MISSING) {
      writeErr(gdbusMissingMessage());
      return EXIT_GDBUS_MISSING;
    }
    writeErr(`forge launch: ${err}`);
    writeOut(formatJson(result, false));
    return rc || 1;
  }
  writeOut(formatJson(result, false));
  return rc;
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
