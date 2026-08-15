#!/usr/bin/env node
/**
 * forge run-steps — Node body (CN6). Extension-only RunSteps via DBus.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdResult } from "./cmd-result.mjs";
import { CLI_ONLY_OPS, payloadHasCliOnly } from "./launch-lib.mjs";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string | null} */
  let file = null;
  /** @type {string | null} */
  let jsonArg = null;
  /** @type {string | null} */
  let error = null;
  /** @type {string[]} */
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a === "--file" || a === "-f") {
      if (i + 1 >= argv.length) {
        error = "forge run-steps: --file requires a path";
        break;
      }
      file = argv[++i];
      continue;
    }
    if (a.startsWith("--file=")) {
      file = a.slice("--file=".length);
      continue;
    }
    if (a.startsWith("-")) {
      error = `forge run-steps: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, file, jsonArg: null, error };
  if (help) return { help, file, jsonArg: null, error: null };
  if (positionals.length > 1) {
    return {
      help,
      file,
      jsonArg: null,
      error: `forge run-steps: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }
  if (positionals.length === 1) jsonArg = positionals[0];
  if (!file && !jsonArg) {
    return {
      help,
      file,
      jsonArg: null,
      error: "forge run-steps: provide JSON string or --file PATH",
    };
  }
  return { help, file, jsonArg, error: null };
}

function printHelp(out) {
  out.write(`Usage: forge run-steps <JSON> | forge run-steps --file PATH

Batch extension-only ops via DBus RunSteps (freezeRender → ops → one render).

CLI-only ops (${CLI_ONLY_OPS.join(", ")}) are rejected here.
Use \`forge run FILE\` for mixed scripts.

Options:
  -f, --file PATH   Read steps JSON from file
  -h, --help        Show this help
`);
}

/**
 * @param {string} raw
 * @returns {unknown}
 */
export function loadStepsPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`invalid JSON: ${msg}`);
  }
}

/**
 * @param {string[]} argv
 * @param {object} [deps]
 * @returns {number}
 */
export function run(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, "utf8"));
  const isFile = deps.isFile ?? ((p) => fs.existsSync(p) && fs.statSync(p).isFile());

  const opts = parseArgv(argv);
  if (opts.help) {
    printHelp(stdout);
    return 0;
  }
  if (opts.error) {
    writeErr(opts.error);
    return 1;
  }

  /** @type {string | null} */
  let raw = null;
  if (opts.file) {
    const p = path.resolve(String(opts.file).replace(/^~/, process.env.HOME || ""));
    if (!isFile(p)) {
      writeErr(`forge run-steps: file not found: ${p}`);
      return 1;
    }
    try {
      raw = readFile(p);
    } catch (e) {
      writeErr(`forge run-steps: cannot read ${p}: ${e && e.message ? e.message : e}`);
      return 1;
    }
  } else {
    raw = opts.jsonArg;
  }

  raw = String(raw || "").trim();
  if (!raw) {
    writeErr("forge run-steps: empty payload");
    return 1;
  }

  let payload;
  try {
    payload = loadStepsPayload(raw);
  } catch (e) {
    writeErr(`forge run-steps: ${e && e.message ? e.message : e}`);
    return 1;
  }

  const cliOps = payloadHasCliOnly(payload);
  if (cliOps.length) {
    writeErr(
      "forge run-steps: launch/wait are CLI-only and not sent via DBus " +
        `(found: ${cliOps.join(", ")}). Use \`forge run\` / \`forge layout\` ` +
        "for mixed scripts, or `forge launch` then run-steps for tree ops."
    );
    return 1;
  }

  const stepsJson = JSON.stringify(payload);
  return cmdResult("RunSteps", [stepsJson], "run-steps", deps);
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
