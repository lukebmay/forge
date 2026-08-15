#!/usr/bin/env node
/**
 * forge set — Node body (CN5).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdResult } from "./cmd-result.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   key: string | null,
 *   value: string | null,
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
    if (a.startsWith("-") && a !== "-") {
      // allow bare "-" as a value token; reject unknown flags
      error = `forge set: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, key: null, value: null, error };
  if (help) return { help, key: null, value: null, error: null };
  if (positionals.length < 1) {
    return { help, key: null, value: null, error: "forge set: key required" };
  }
  const key = positionals[0].trim();
  if (!key) {
    return { help, key: null, value: null, error: "forge set: key required" };
  }
  if (positionals.length < 2) {
    return { help, key: null, value: null, error: "forge set: value required" };
  }
  // Join remaining tokens like Python nargs="+"
  const value = positionals.slice(1).join(" ");
  return { help, key, value, error: null };
}

function printHelp(out) {
  out.write(`Usage: forge set <key> <value…>

Set a portable setting/keybinding (DBus SetSetting).
Value tokens are joined with spaces (JSON or plain text).

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
    printHelp(stdout);
    return 0;
  }
  if (opts.error) {
    writeErr(opts.error);
    return 1;
  }

  return cmdResult(
    "SetSetting",
    [/** @type {string} */ (opts.key), String(opts.value)],
    "set",
    deps
  );
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
