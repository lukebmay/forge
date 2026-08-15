#!/usr/bin/env node
/**
 * forge focus — Node body (CN5).
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
 *   selector: string | null,
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
      error = `forge focus: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, first, selector: null, error };
  if (help) return { help, first, selector: null, error: null };
  if (positionals.length < 1) {
    return { help, first, selector: null, error: "forge focus: selector required" };
  }
  if (positionals.length > 1) {
    return {
      help,
      first,
      selector: null,
      error: `forge focus: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }
  return { help, first, selector: positionals[0], error: null };
}

function printHelp(out) {
  out.write(`Usage: forge focus <selector> [--first]

Focus a tile by selector.

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

  const sel = withFirst(/** @type {string} */ (opts.selector), opts.first);
  return cmdResult("Focus", [sel], "focus", deps);
}

export { withFirst };

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
