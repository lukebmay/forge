#!/usr/bin/env node
/**
 * forge swap — Node body (CN5).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdResult, withFirst } from "./cmd-result.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   first: boolean,
 *   selectorA: string | null,
 *   selectorB: string | null,
 *   error: string | null,
 * }}
 */
export function parseArgv(argv) {
  let help = false;
  let first = false;
  /** @type {string[]} */
  const positionals = [];
  /** @type {string | null} */
  let error = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a === "--first") {
      first = true;
      continue;
    }
    if (a.startsWith("-")) {
      error = `forge swap: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) {
    return { help, first, selectorA: null, selectorB: null, error };
  }
  if (help) {
    return { help, first, selectorA: null, selectorB: null, error: null };
  }
  if (positionals.length < 2) {
    return {
      help,
      first,
      selectorA: null,
      selectorB: null,
      error: "forge swap: two selectors required",
    };
  }
  if (positionals.length > 2) {
    return {
      help,
      first,
      selectorA: null,
      selectorB: null,
      error: `forge swap: unexpected argument(s): ${positionals.slice(2).join(" ")}`,
    };
  }
  return {
    help,
    first,
    selectorA: positionals[0],
    selectorB: positionals[1],
    error: null,
  };
}

function printHelp(out) {
  out.write(`Usage: forge swap <selector_a> <selector_b> [--first]

Swap two tiles.

Options:
  --first         Use first match when ambiguous
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

  const a = withFirst(/** @type {string} */ (opts.selectorA), opts.first);
  const b = withFirst(/** @type {string} */ (opts.selectorB), opts.first);
  return cmdResult("Swap", [a, b], "swap", deps);
}

export { withFirst };

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
