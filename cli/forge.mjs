#!/usr/bin/env node
/**
 * PATH entry for user `forge` (CN13). Node bodies in-process; leftover Python
 * via spawn. Nest/live stay on forge-test (D045).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BusyError,
  defaultTimeoutForCommand,
  extractJobMetaFlags,
  forgeWorkerArgv,
  isJobWorker,
  isMutatingJobCommand,
  maybeRunAsJob,
  reapStaleJobs,
  defaultJobsRoot,
  workerInstallSignalPolicy,
  workerMarkDone,
} from "./job-runner.mjs";
import { initForgePlog } from "./plog.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const PYTHON_FORGE = path.join(REPO_ROOT, "scripts", "forge", "forge");

export const FORGE_VERSION = "fc5";
export const EXIT_PYTHON_MISSING = 127;

const NODE_COMMANDS = {
  ping: "./ping.mjs",
  tree: "./tree.mjs",
  focus: "./focus.mjs",
  swap: "./swap.mjs",
  move: "./move.mjs",
  get: "./get.mjs",
  set: "./set.mjs",
  settings: "./settings.mjs",
  launch: "./launch.mjs",
  run: "./run.mjs",
  "run-steps": "./run-steps.mjs",
  keybind: "./keybind.mjs",
};

const DEV_CLI = "forge-test";
const DEV_CLI_PATH = "./scripts/forge/forge-test";
export const TEST_MIGRATION = [
  "forge: 'test' is a developer tool, not a product command.",
  `  Use: ${DEV_CLI} <nested|live> …`,
  `  From a clone: ${DEV_CLI_PATH} nested run -- forge ping`,
].join("\n");
export const NESTED_MIGRATION = [
  "forge: 'nested' is a testing tool, not a product command.",
  `  Use: ${DEV_CLI} nested <action> …`,
  `  From a clone: ${DEV_CLI_PATH} nested run -- forge ping`,
].join("\n");

/**
 * Strip --color / --color=MODE. Bare --color ⇒ always.
 * @param {string[]} argv
 * @returns {{ rest: string[], colorMode: string | null }}
 */
export function parseColorFlag(argv) {
  const rest = [];
  let colorMode = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--color") {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        colorMode = argv[i + 1];
        i += 1;
      } else {
        colorMode = "always";
      }
      continue;
    }
    if (a.startsWith("--color=")) {
      colorMode = a.slice("--color=".length) || "always";
      continue;
    }
    rest.push(a);
  }
  return { rest, colorMode };
}

/**
 * Pull global --first that appears before the subcommand.
 * @param {string[]} argv
 * @returns {{ rest: string[], first: boolean }}
 */
export function parseGlobalFirst(argv) {
  let first = false;
  const pre = [];
  const after = [];
  let seenCmd = false;
  for (const a of argv) {
    if (!seenCmd && a === "--first") {
      first = true;
      continue;
    }
    if (!seenCmd && !a.startsWith("-")) seenCmd = true;
    if (seenCmd) after.push(a);
    else pre.push(a);
  }
  return { rest: [...pre, ...after], first };
}

/**
 * @param {string | null | undefined} mode
 */
export function applyColorMode(mode, env) {
  if (mode == null || String(mode).trim() === "") return env;
  const m = String(mode).trim().toLowerCase();
  if (m !== "auto" && m !== "always" && m !== "never") {
    throw new Error(`color mode must be auto|always|never, got ${JSON.stringify(mode)}`);
  }
  return { ...env, FORGE_COLOR: m };
}

export function findPython(env = process.env) {
  const override = String(env.FORGE_PYTHON || "").trim();
  if (override) return override;
  const r = spawnSync("sh", ["-c", "command -v python3"], { encoding: "utf8" });
  const p = String(r.stdout || "").trim();
  if (r.status === 0 && p) return p;
  return null;
}

export function pythonMissingMessage() {
  return (
    "python3 not found on PATH (required for leftover forge commands). " +
    "Install Python 3 (distro python3 package)."
  );
}

/**
 * @param {string} command
 * @param {string[]} argv command + rest
 */
export function shouldUseJobRunner(command, argv) {
  if (command === "layout") {
    const tokens = argv.slice(1);
    const head = tokens.length ? String(tokens[0]).trim() : "";
    const dryRun = argv.includes("--dry-run");
    return isMutatingJobCommand("layout", { layoutHead: head, dryRun });
  }
  return isMutatingJobCommand(command);
}

/**
 * @param {string[]} userArgv command + rest (no --detach/--foreground)
 * @param {object} deps
 * @returns {number}
 */
export function spawnPythonLeftover(userArgv, deps = {}) {
  const envIn = deps.env ?? process.env;
  const stderr = deps.stderr ?? process.stderr;
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const python = (deps.findPython ?? findPython)(envIn);
  if (!python) {
    writeErr(pythonMissingMessage());
    return EXIT_PYTHON_MISSING;
  }
  const args = [];
  if (deps.colorMode) args.push(`--color=${deps.colorMode}`);
  if (deps.first) args.push("--first");
  args.push(...userArgv);
  const env = { ...envIn, FORGE_JOB: "0" };
  const spawn = deps.spawnSync ?? spawnSync;
  const r = spawn(python, [deps.pythonForge ?? PYTHON_FORGE, ...args], {
    stdio: "inherit",
    env,
  });
  if (r && r.error && r.error.code === "ENOENT") {
    writeErr(pythonMissingMessage());
    return EXIT_PYTHON_MISSING;
  }
  if (r && r.status == null && r.signal) return 1;
  return r && r.status != null ? r.status : 1;
}

function writeLine(stream, s) {
  stream.write(s.endsWith("\n") ? s : `${s}\n`);
}

/**
 * @param {string[]} rawArgv
 * @param {object} [deps]
 * @returns {Promise<number>}
 */
export async function main(rawArgv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let env = deps.env ?? process.env;

  const meta = extractJobMetaFlags(rawArgv);
  let argv = meta.cleaned;
  const detach = meta.detach;
  const foreground = meta.foreground;

  const color = parseColorFlag(argv);
  argv = color.rest;
  if (color.colorMode != null) {
    try {
      env = applyColorMode(color.colorMode, env);
    } catch (e) {
      writeLine(stderr, `forge: ${e.message}`);
      return 1;
    }
  }

  try {
    initForgePlog({ env });
  } catch {
    /* logging must never throw */
  }

  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") {
    return (deps.spawnPython ?? spawnPythonLeftover)(["--help"], {
      env,
      colorMode: color.colorMode,
      stdout,
      stderr,
    });
  }
  if (argv[0] === "--version") {
    writeLine(stdout, `forge ${FORGE_VERSION}`);
    return 0;
  }
  if (argv[0] === "help") {
    return (deps.spawnPython ?? spawnPythonLeftover)(["help"], {
      env,
      colorMode: color.colorMode,
      stdout,
      stderr,
    });
  }
  if (argv[0] === "test") {
    writeLine(stderr, TEST_MIGRATION);
    return 2;
  }
  if (argv[0] === "nested") {
    writeLine(stderr, NESTED_MIGRATION);
    return 2;
  }

  const firstParsed = parseGlobalFirst(argv);
  argv = firstParsed.rest;
  const globalFirst = firstParsed.first;

  const command = argv[0] || "";
  const cmdArgv = argv.slice(1);
  const nodeArgv = globalFirst && !cmdArgv.includes("--first") ? ["--first", ...cmdArgv] : cmdArgv;

  const isWorker = (deps.isJobWorker ?? isJobWorker)(env);
  if (shouldUseJobRunner(command, argv) && !isWorker && !foreground) {
    try {
      (deps.reapStaleJobs ?? reapStaleJobs)(defaultJobsRoot(env));
    } catch {
      /* ignore */
    }
    const forgeMjs = deps.forgeMjs ?? __filename;
    const workerArgv = forgeWorkerArgv(forgeMjs, argv, { node: deps.node });
    const timeoutSec = defaultTimeoutForCommand(command, env);
    try {
      const jobRc = await (deps.maybeRunAsJob ?? maybeRunAsJob)(workerArgv, {
        detach,
        foreground: false,
        command,
        timeoutSec,
        env,
        streamOut: stdout,
        streamErr: stderr,
      });
      if (jobRc != null) return Number(jobRc);
    } catch (e) {
      if (e instanceof BusyError) {
        writeLine(stderr, `forge: another mutating job is running: ${e.jobId}`);
        writeLine(stderr, `  status: ${path.join(defaultJobsRoot(env), e.jobId, "status.json")}`);
        writeLine(stderr, "  wait for it to finish, or set FORGE_JOB=0 / --foreground to bypass");
        return 1;
      }
      writeLine(stderr, `forge: job runner failed: ${e && e.message ? e.message : e}`);
      return 1;
    }
  }

  const nodeRel = NODE_COMMANDS[command];
  if (nodeRel) {
    const load = deps.loadNodeCommand ?? ((rel) => import(rel));
    const mod = await load(nodeRel);
    return Number(mod.run(nodeArgv, { env, stdout, stderr }));
  }

  return Number(
    (deps.spawnPython ?? spawnPythonLeftover)(argv, {
      env,
      colorMode: color.colorMode,
      first: globalFirst,
      stdout,
      stderr,
    })
  );
}

export function isMainModule() {
  if (process.argv[1] == null) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(__filename);
  }
}

if (isMainModule()) {
  const worker = isJobWorker();
  if (worker) workerInstallSignalPolicy();
  let exitCode = 1;
  try {
    exitCode = await main(process.argv.slice(2));
  } catch (e) {
    if (e && e.name === "AbortError") {
      exitCode = 130;
    } else {
      if (worker) workerMarkDone(1);
      throw e;
    }
  }
  if (worker) workerMarkDone(exitCode, { cancelled: exitCode === 130 });
  process.exit(exitCode);
}
