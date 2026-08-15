#!/usr/bin/env node
/**
 * forge run — Node body (CN6). Mixed CLI + extension steps from a JSON file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson, cmdResult } from "./cmd-result.mjs";
import {
  createDefaultRun,
  extractStepsAndStop,
  payloadHasCliOnly,
  runMixedStepsWithPartition,
} from "./launch-lib.mjs";
import { partitionMixedSteps } from "../lib/extension/run-steps.js";

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  let help = false;
  /** @type {string | null} */
  let file = null;
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
    if (a.startsWith("-")) {
      error = `forge run: unexpected option: ${a}`;
      break;
    }
    positionals.push(a);
  }

  if (error) return { help, file: null, error };
  if (help) return { help, file: null, error: null };
  if (positionals.length < 1) {
    return { help, file: null, error: "forge run: file required" };
  }
  if (positionals.length > 1) {
    return {
      help,
      file: null,
      error: `forge run: unexpected argument(s): ${positionals.slice(1).join(" ")}`,
    };
  }
  file = positionals[0];
  return { help, file, error: null };
}

function printHelp(out) {
  out.write(`Usage: forge run <FILE>

Run mixed steps from a JSON file (CLI launch/wait + extension RunSteps).

Payload: a steps array, or { "steps": [...], "stopOnError": true }.
CLI ops run in-process; extension ops go to DBus RunSteps in chunks.

Options:
  -h, --help   Show this help
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

  const filePath = path.resolve(String(opts.file).replace(/^~(?=\/|$)/, process.env.HOME || ""));
  if (!isFile(filePath)) {
    writeErr(`forge run: file not found: ${filePath}`);
    return 1;
  }
  let raw;
  try {
    raw = readFile(filePath);
  } catch (e) {
    writeErr(`forge run: cannot read ${filePath}: ${e && e.message ? e.message : e}`);
    return 1;
  }
  raw = String(raw || "").trim();
  if (!raw) {
    writeErr("forge run: empty file");
    return 1;
  }

  let payload;
  let steps;
  let stopOnError;
  try {
    payload = JSON.parse(raw);
    ({ steps, stopOnError } = extractStepsAndStop(payload));
  } catch (e) {
    writeErr(`forge run: ${e && e.message ? e.message : e}`);
    return 1;
  }

  const callDeps = {
    run: deps.run ?? createDefaultRun(deps.env ?? process.env),
    env: deps.env ?? process.env,
    which: deps.which,
    whichBin: deps.whichBin,
    spawn: deps.spawn,
  };

  const cliOps = payloadHasCliOnly(
    Array.isArray(payload) || (payload && typeof payload === "object") ? payload : { steps }
  );
  if (!cliOps.length) {
    const stepsJson = JSON.stringify(payload);
    return cmdResult("RunSteps", [stepsJson], "run", callDeps);
  }

  const { rc, aggregate } = runMixedStepsWithPartition(steps, {
    stopOnError,
    deps: callDeps,
    partition: partitionMixedSteps,
  });
  aggregate.file = filePath;
  writeOut(formatJson(aggregate, false));
  return rc;
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
