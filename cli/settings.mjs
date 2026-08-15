#!/usr/bin/env node
/**
 * forge settings save|load — Node body (CN5).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdResult } from "./cmd-result.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   action: string | null,
 *   name: string | null,
 *   error: string | null,
 * }}
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string[]} */
  const positionals = [];
  /** @type {string | null} */
  let error = null;

  for (const a of argv) {
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a.startsWith("-")) {
      error = `forge settings: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, action: null, name: null, error };
  if (help && positionals.length === 0) {
    return { help, action: null, name: null, error: null };
  }

  if (positionals.length < 1) {
    return {
      help,
      action: null,
      name: null,
      error: "forge settings: action must be save or load",
    };
  }
  const action = positionals[0].trim().toLowerCase();
  if (action !== "save" && action !== "load") {
    return {
      help,
      action: null,
      name: null,
      error: "forge settings: action must be save or load",
    };
  }
  if (help) {
    return { help, action, name: null, error: null };
  }
  if (positionals.length < 2) {
    return {
      help,
      action,
      name: null,
      error: `forge settings ${action}: name required`,
    };
  }
  if (positionals.length > 2) {
    return {
      help,
      action,
      name: null,
      error: `forge settings: unexpected argument(s): ${positionals.slice(2).join(" ")}`,
    };
  }
  const name = positionals[1].trim();
  if (!name) {
    return {
      help,
      action,
      name: null,
      error: `forge settings ${action}: name required`,
    };
  }
  return { help, action, name, error: null };
}

function printHelp(out, action) {
  if (action === "save") {
    out.write(`Usage: forge settings save <name>

Export current GSettings to a named profile.

Options:
  -h, --help      Show this help
`);
    return;
  }
  if (action === "load") {
    out.write(`Usage: forge settings load <name>

Import a named profile into live GSettings.

Options:
  -h, --help      Show this help
`);
    return;
  }
  out.write(`Usage: forge settings save|load <name>

Save/load named profiles under ~/.config/forge/profiles/<name>/.

Options:
  -h, --help      Show this help
`);
}

/**
 * @param {string[]} argv
 * @param {Parameters<typeof cmdResult>[3]} [deps]
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
    printHelp(stdout, opts.action);
    return 0;
  }
  if (opts.error) {
    writeErr(opts.error);
    return 1;
  }

  const action = /** @type {string} */ (opts.action);
  const method = action === "save" ? "SettingsSave" : "SettingsLoad";
  return cmdResult(method, [/** @type {string} */ (opts.name)], `settings ${action}`, deps);
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
