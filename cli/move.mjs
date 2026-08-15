#!/usr/bin/env node
/**
 * forge move — Node body (CN5).
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
 *   tile: string | null,
 *   dest: string | null,
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
      error = `forge move: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, first, tile: null, dest: null, error };
  if (help) return { help, first, tile: null, dest: null, error: null };
  if (positionals.length < 2) {
    return {
      help,
      first,
      tile: null,
      dest: null,
      error: "forge move: tile and dest selectors required",
    };
  }
  if (positionals.length > 2) {
    return {
      help,
      first,
      tile: null,
      dest: null,
      error: `forge move: unexpected argument(s): ${positionals.slice(2).join(" ")}`,
    };
  }
  return {
    help,
    first,
    tile: positionals[0],
    dest: positionals[1],
    error: null,
  };
}

function printHelp(out) {
  out.write(`Usage: forge move <tile> <dest> [--first]

Move tile to dest (window: insert after; path CON/MONITOR: append).

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

  const tile = withFirst(/** @type {string} */ (opts.tile), opts.first);
  const dest = withFirst(/** @type {string} */ (opts.dest), opts.first);
  return cmdResult("Move", [tile, dest], "move", deps);
}

export { withFirst };

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
