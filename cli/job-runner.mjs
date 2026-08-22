/**
 * Attachable one-shot job runner for durable forge CLI mutators (CN13).
 * Schema matches scripts/forge/job_runner.py (D021).
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureForgePlog } from "./plog.mjs";

export const SCHEMA_VERSION = 1;
export const DEFAULT_JOBS_SUBPATH = path.join("forge", "jobs");
export const STATUS_FILENAME = "status.json";
export const PID_FILENAME = "pid";
export const ARGV_FILENAME = "argv.json";
export const STDOUT_LOG = "stdout.log";
export const STDERR_LOG = "stderr.log";
export const MUTATOR_LOCK = "mutator.lock";

export const STATUS_PENDING = "pending";
export const STATUS_RUNNING = "running";
export const STATUS_OK = "ok";
export const STATUS_FAILED = "failed";
export const STATUS_CANCELLED = "cancelled";
export const STATUS_TIMEOUT = "timeout";

export const TERMINAL_STATUSES = new Set([
  STATUS_OK,
  STATUS_FAILED,
  STATUS_CANCELLED,
  STATUS_TIMEOUT,
]);
export const ACTIVE_STATUSES = new Set([STATUS_PENDING, STATUS_RUNNING]);

export const ENV_JOB_ENABLE = "FORGE_JOB";
export const ENV_JOB_WORKER = "FORGE_JOB_WORKER";
export const ENV_JOB_ID = "FORGE_JOB_ID";
export const ENV_JOB_DIR = "FORGE_JOB_DIR";
export const ENV_JOBS_DIR = "FORGE_JOBS_DIR";
export const ENV_JOB_TIMEOUT = "FORGE_JOB_TIMEOUT";

export const CLAIM_STALE_SEC = 30.0;
export const DEFAULT_ATTACH_POLL_SEC = 0.05;
export const DEFAULT_JOB_TIMEOUT_SEC = 300.0;

export const JOB_META_FLAGS = new Set(["--detach", "--foreground"]);

export const DEFAULT_TIMEOUT_BY_COMMAND = {
  layout: 300.0,
  run: 300.0,
  "run-steps": 300.0,
  install: 900.0,
  update: 1200.0,
  uninstall: 600.0,
  live: 1800.0,
  test: 1800.0,
};

const SIGNAL_NUM = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGTERM: 15,
  SIGKILL: 9,
};

export class JobError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobError";
  }
}

export class BusyError extends JobError {
  constructor(jobId, message) {
    super(message || `mutating job already running: ${jobId}`);
    this.name = "BusyError";
    this.jobId = jobId;
  }
}

export class JobNotFoundError extends JobError {
  constructor(jobId) {
    super(`job not found: ${jobId}`);
    this.name = "JobNotFoundError";
    this.jobId = jobId;
  }
}

export class JobHandle {
  constructor({ jobId, jobsRoot, pid, jobDir, proc = null }) {
    this.jobId = jobId;
    this.jobsRoot = jobsRoot;
    this.pid = pid;
    this.jobDir = jobDir;
    this.proc = proc;
  }

  get stdoutLog() {
    return path.join(this.jobDir, STDOUT_LOG);
  }

  get stderrLog() {
    return path.join(this.jobDir, STDERR_LOG);
  }
}

function nowSec(now) {
  return now == null ? Date.now() / 1000 : Number(now);
}

function sleepSync(ms) {
  const n = Math.max(0, Math.trunc(ms));
  if (n <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function envMap(env) {
  return env != null ? env : process.env;
}

export function defaultJobsRoot(env) {
  const e = envMap(env);
  const override = String(e[ENV_JOBS_DIR] || "").trim();
  if (override) return path.resolve(override.replace(/^~/, os.homedir()));
  const xdg = String(e.XDG_DATA_HOME || "").trim();
  if (xdg) return path.join(path.resolve(xdg.replace(/^~/, os.homedir())), DEFAULT_JOBS_SUBPATH);
  return path.join(os.homedir(), ".local", "share", DEFAULT_JOBS_SUBPATH);
}

export function jobDir(jobsRoot, jobId) {
  return path.join(String(jobsRoot), String(jobId));
}

export function jobModeEnabled(env, { foreground = false } = {}) {
  if (foreground) return false;
  const e = envMap(env);
  if (String(e[ENV_JOB_WORKER] || "").trim() === "1") return false;
  const raw = String(e[ENV_JOB_ENABLE] ?? "1")
    .trim()
    .toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

export function isJobWorker(env) {
  const e = envMap(env);
  if (String(e[ENV_JOB_WORKER] || "").trim() !== "1") return false;
  const jdirRaw = String(e[ENV_JOB_DIR] || "").trim();
  if (!jdirRaw) return true;
  const pid = readPid(jdirRaw);
  if (pid == null) return true;
  return Number(pid) === process.pid;
}

export function parseJobTimeoutSec(env, { default: def = DEFAULT_JOB_TIMEOUT_SEC } = {}) {
  const e = envMap(env);
  const raw = String(e[ENV_JOB_TIMEOUT] || "").trim();
  if (!raw) return def;
  const val = Number(raw);
  if (!Number.isFinite(val)) {
    throw new JobError(`invalid ${ENV_JOB_TIMEOUT}=${JSON.stringify(raw)}`);
  }
  if (val <= 0) return null;
  return val;
}

export function newJobId({ now, rand } = {}) {
  const t = nowSec(now);
  const d = new Date(t * 1000);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  const stamp = `${y}${mo}${day}T${h}${mi}${s}Z`;
  const suffix = (rand != null ? String(rand) : randomBytes(3).toString("hex")).toLowerCase();
  return `${stamp}-${suffix}`;
}

export function emptyStatus({
  jobId,
  command = "",
  argv = null,
  timeoutSec = null,
  now = null,
} = {}) {
  const ts = nowSec(now);
  return {
    schema: SCHEMA_VERSION,
    job_id: jobId,
    status: STATUS_PENDING,
    command: command || "",
    argv: Array.isArray(argv) ? [...argv] : [],
    pid: null,
    exit_code: null,
    started_at: ts,
    finished_at: null,
    deadline_at: timeoutSec ? ts + Number(timeoutSec) : null,
    error: null,
  };
}

export function writeJsonAtomic(filePath, data) {
  const p = String(filePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sortKeys(data), null, 2)}\n`, "utf8");
  fs.renameSync(tmp, p);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(String(filePath), "utf8"));
}

export function writeStatus(jdir, status) {
  writeJsonAtomic(path.join(String(jdir), STATUS_FILENAME), { ...status });
}

export function readStatus(jdir) {
  const p = path.join(String(jdir), STATUS_FILENAME);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    throw new JobNotFoundError(path.basename(String(jdir)));
  }
  const data = readJson(p);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new JobError(`corrupt status: ${p}`);
  }
  return data;
}

export function updateStatus(jdir, fields) {
  const st = readStatus(jdir);
  Object.assign(st, fields);
  writeStatus(jdir, st);
  return st;
}

export function writePid(jdir, pid) {
  fs.mkdirSync(String(jdir), { recursive: true });
  fs.writeFileSync(path.join(String(jdir), PID_FILENAME), `${Number(pid)}\n`, "utf8");
}

export function readPid(jdir) {
  const p = path.join(String(jdir), PID_FILENAME);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function writeArgv(jdir, argv) {
  writeJsonAtomic(path.join(String(jdir), ARGV_FILENAME), [...argv]);
}

export function markTerminal(jdir, status, { exitCode = null, error = null, now = null } = {}) {
  if (!TERMINAL_STATUSES.has(status)) {
    throw new JobError(`not a terminal status: ${status}`);
  }
  const st = readStatus(jdir);
  if (TERMINAL_STATUSES.has(String(st.status))) return st;
  const ts = nowSec(now);
  st.status = status;
  st.finished_at = ts;
  if (exitCode != null) {
    st.exit_code = Number(exitCode);
  } else if (status === STATUS_OK && st.exit_code == null) {
    st.exit_code = 0;
  }
  if (error != null) st.error = error;
  writeStatus(jdir, st);
  return st;
}

export function statusExitCode(st) {
  if (st.exit_code != null) return Number(st.exit_code);
  const status = String(st.status || "");
  if (status === STATUS_OK) return 0;
  if (status === STATUS_CANCELLED) return 130;
  if (status === STATUS_TIMEOUT) return 124;
  return 1;
}

export function pidAlive(pid) {
  if (pid == null || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (exc) {
    if (exc && (exc.code === "ESRCH" || exc.errno === os.constants.errno.ESRCH)) return false;
    if (exc && (exc.code === "EPERM" || exc.errno === os.constants.errno.EPERM)) return true;
    throw exc;
  }
}

function signalToNumber(sig) {
  if (sig == null) return null;
  if (typeof sig === "number") return sig;
  const name = String(sig).toUpperCase();
  if (name in SIGNAL_NUM) return SIGNAL_NUM[name];
  const n = Number(sig);
  return Number.isFinite(n) ? n : null;
}

function childExitCode(proc) {
  if (!proc) return null;
  if (proc.exitCode != null) return Number(proc.exitCode);
  if (proc.signalCode) {
    const n = signalToNumber(proc.signalCode);
    return n != null ? 128 + n : 1;
  }
  return null;
}

function lockPath(jobsRoot) {
  return path.join(String(jobsRoot), MUTATOR_LOCK);
}

function exclLockPath(filePath) {
  return `${filePath}.excl`;
}

function withFileLock(filePath, fn) {
  const excl = exclLockPath(filePath);
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      const fd = fs.openSync(excl, "wx");
      try {
        return fn();
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          fs.unlinkSync(excl);
        } catch {
          /* ignore */
        }
      }
    } catch (exc) {
      if (!exc || exc.code !== "EEXIST") throw exc;
      try {
        const st = fs.statSync(excl);
        if (Date.now() - st.mtimeMs > 30000) fs.unlinkSync(excl);
      } catch {
        /* ignore */
      }
      if (Date.now() > deadline) throw new JobError("mutator lock timeout");
      sleepSync(20);
    }
  }
}

function readLockPayload(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.job_id) return data;
    return null;
  } catch {
    return { job_id: raw, pid: null };
  }
}

function writeLockPayload(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sortKeys({ ...payload }))}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

export function holderIsActive(
  jobsRoot,
  holder,
  { now = null, claimStaleSec = CLAIM_STALE_SEC } = {}
) {
  const jobId = String(holder.job_id || "").trim();
  if (!jobId) return false;
  const jdir = jobDir(jobsRoot, jobId);
  let st = null;
  const statusPath = path.join(jdir, STATUS_FILENAME);
  if (fs.existsSync(statusPath) && fs.statSync(statusPath).isFile()) {
    try {
      st = readStatus(jdir);
    } catch (exc) {
      if (!(exc instanceof JobError)) throw exc;
      st = null;
    }
  }
  if (st && TERMINAL_STATUSES.has(String(st.status))) return false;
  let pid = holder.pid;
  if (pid == null) {
    pid = fs.existsSync(jdir) ? readPid(jdir) : null;
  }
  if (pid != null && pidAlive(Number(pid))) return true;
  if (st && ACTIVE_STATUSES.has(String(st.status))) {
    const started = Number(st.started_at || 0);
    const ts = nowSec(now);
    if (started && ts - started < Number(claimStaleSec)) return true;
  }
  return false;
}

export function mutatorHolder(jobsRoot) {
  const payload = readLockPayload(lockPath(jobsRoot));
  if (!payload) return null;
  if (holderIsActive(jobsRoot, payload)) return payload;
  return null;
}

export function claimMutator(jobsRoot, jobId, { now = null } = {}) {
  const root = String(jobsRoot);
  fs.mkdirSync(root, { recursive: true });
  const filePath = lockPath(root);
  withFileLock(filePath, () => {
    const holder = readLockPayload(filePath);
    if (holder && holder.job_id && holderIsActive(root, holder, { now })) {
      throw new BusyError(String(holder.job_id));
    }
    writeLockPayload(filePath, {
      job_id: jobId,
      pid: null,
      claimed_at: nowSec(now),
    });
  });
}

export function setMutatorPid(jobsRoot, jobId, pid) {
  const filePath = lockPath(jobsRoot);
  withFileLock(filePath, () => {
    const raw = readLockPayload(filePath);
    let payload = { job_id: jobId, pid: Number(pid) };
    if (raw && raw.job_id === jobId) {
      payload = { ...raw, pid: Number(pid) };
    }
    writeLockPayload(filePath, payload);
  });
}

export function releaseMutator(jobsRoot, jobId) {
  const filePath = lockPath(jobsRoot);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  return withFileLock(filePath, () => {
    const raw = readLockPayload(filePath);
    const held = raw && raw.job_id ? String(raw.job_id) : "";
    if (held !== jobId) return false;
    fs.writeFileSync(filePath, "", "utf8");
    return true;
  });
}

export function reapStaleJobs(jobsRoot, { now = null } = {}) {
  const root = String(jobsRoot);
  const results = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return results;
  const ts = nowSec(now);
  const children = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  children.sort((a, b) => a.name.localeCompare(b.name));
  for (const childEnt of children) {
    const child = path.join(root, childEnt.name);
    if (!fs.existsSync(path.join(child, STATUS_FILENAME))) continue;
    let st;
    try {
      st = readStatus(child);
    } catch (exc) {
      if (exc instanceof JobError) continue;
      throw exc;
    }
    const status = String(st.status || "");
    if (TERMINAL_STATUSES.has(status)) continue;
    const jobId = String(st.job_id || childEnt.name);
    const pid = st.pid != null ? st.pid : readPid(child);
    const deadline = st.deadline_at;
    let action = null;
    if (deadline != null && ts >= Number(deadline) && pidAlive(pid)) {
      requestCancel(root, jobId, { sig: "SIGTERM" });
      sleepSync(50);
      if (!pidAlive(pid)) {
        markTerminal(child, STATUS_TIMEOUT, {
          exitCode: 124,
          error: "job deadline exceeded",
          now: ts,
        });
        action = "timeout";
      } else {
        action = "timeout_signaled";
      }
    } else if (!pidAlive(pid) && ACTIVE_STATUSES.has(status)) {
      if (pid == null && status === STATUS_PENDING) {
        const started = Number(st.started_at || 0);
        if (started && ts - started < CLAIM_STALE_SEC) continue;
      }
      markTerminal(child, STATUS_FAILED, {
        exitCode: 1,
        error: "worker process gone before terminal status",
        now: ts,
      });
      action = "orphaned";
    }
    if (action) {
      releaseMutator(root, jobId);
      results.push({ job_id: jobId, action });
    }
  }
  const holder = readLockPayload(lockPath(root));
  if (holder && !holderIsActive(root, holder, { now: ts })) {
    releaseMutator(root, String(holder.job_id || ""));
  }
  return results;
}

export function prepareJobDir(
  jobsRoot,
  { jobId = null, command = "", argv = null, timeoutSec = null, now = null } = {}
) {
  const jid = jobId || newJobId({ now });
  const jdir = jobDir(jobsRoot, jid);
  fs.mkdirSync(jdir, { recursive: false });
  const st = emptyStatus({
    jobId: jid,
    command,
    argv,
    timeoutSec,
    now,
  });
  writeStatus(jdir, st);
  if (argv != null) writeArgv(jdir, argv);
  fs.writeFileSync(path.join(jdir, STDOUT_LOG), "", "utf8");
  fs.writeFileSync(path.join(jdir, STDERR_LOG), "", "utf8");
  return { jobId: jid, jobDir: jdir, status: st };
}

/** Node WriteStream uses `.isTTY`; Python-style mocks may expose `.isatty()`. */
export function streamIsTTY(stream) {
  if (stream == null) return false;
  if (typeof stream.isTTY === "boolean") return stream.isTTY;
  if (typeof stream.isatty === "function") {
    try {
      return Boolean(stream.isatty());
    } catch {
      return false;
    }
  }
  return false;
}

export function workerShouldForceColor(env, { stream = null } = {}) {
  const e = envMap(env);
  const mode = String(e.FORGE_COLOR || "auto" || "auto")
    .trim()
    .toLowerCase();
  if (mode === "never") return false;
  if (mode === "always") return true;
  if (String(e.NO_COLOR || "").trim()) return false;
  const s = stream != null ? stream : process.stdout;
  return streamIsTTY(s);
}

export function workerEnv(base, { jobId, jobDirPath, forceColor = null, colorStream = null } = {}) {
  const env = { ...(base != null ? base : process.env) };
  env[ENV_JOB_WORKER] = "1";
  env[ENV_JOB_ID] = jobId;
  env[ENV_JOB_DIR] = String(jobDirPath);
  env[ENV_JOB_ENABLE] = "0";
  let force = forceColor;
  if (force == null) force = workerShouldForceColor(env, { stream: colorStream });
  if (force) env.FORGE_COLOR = "always";
  return env;
}

export function spawnWorker(
  workerArgv,
  {
    jobsRoot,
    command = "",
    timeoutSec = null,
    env = null,
    cwd = null,
    jobId = null,
    now = null,
    spawnFn = null,
    colorStream = null,
  } = {}
) {
  const root = String(jobsRoot);
  const argv = [...workerArgv].map(String);
  if (!argv.length) throw new JobError("worker argv is empty");

  reapStaleJobs(root, { now });

  let prepared;
  try {
    prepared = prepareJobDir(root, {
      jobId,
      command,
      argv,
      timeoutSec,
      now,
    });
  } catch (exc) {
    throw exc;
  }
  const { jobId: jid, jobDir: jdir } = prepared;
  try {
    claimMutator(root, jid, { now });
  } catch (exc) {
    if (exc instanceof BusyError) {
      ensureForgePlog({ env }).debug(`job busy id=${exc.jobId} cmd=${command}`);
      try {
        for (const name of [STATUS_FILENAME, ARGV_FILENAME, STDOUT_LOG, STDERR_LOG]) {
          const p = path.join(jdir, name);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        fs.rmdirSync(jdir);
      } catch {
        /* ignore */
      }
    }
    throw exc;
  }

  const wenv = workerEnv(env, {
    jobId: jid,
    jobDirPath: jdir,
    colorStream: colorStream != null ? colorStream : process.stdout,
  });
  const outPath = path.join(jdir, STDOUT_LOG);
  const errPath = path.join(jdir, STDERR_LOG);
  const outFd = fs.openSync(outPath, "a");
  const errFd = fs.openSync(errPath, "a");
  ensureForgePlog({ env }).debug(`job spawn id=${jid} cmd=${command}`);
  const spawnImpl = spawnFn || spawn;
  let proc;
  try {
    proc = spawnImpl(argv[0], argv.slice(1), {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: wenv,
      cwd: cwd || undefined,
    });
  } catch (exc) {
    try {
      fs.closeSync(outFd);
    } catch {
      /* ignore */
    }
    try {
      fs.closeSync(errFd);
    } catch {
      /* ignore */
    }
    markTerminal(jdir, STATUS_FAILED, {
      exitCode: 1,
      error: `spawn failed: ${exc}`,
      now,
    });
    releaseMutator(root, jid);
    throw new JobError(`spawn failed: ${exc}`);
  }
  try {
    fs.closeSync(outFd);
  } catch {
    /* ignore */
  }
  try {
    fs.closeSync(errFd);
  } catch {
    /* ignore */
  }

  const pid = Number(proc.pid);
  if (!Number.isFinite(pid) || pid <= 0) {
    markTerminal(jdir, STATUS_FAILED, {
      exitCode: 1,
      error: "spawn failed: no pid",
      now,
    });
    releaseMutator(root, jid);
    throw new JobError("spawn failed: no pid");
  }
  writePid(jdir, pid);
  setMutatorPid(root, jid, pid);
  updateStatus(jdir, { status: STATUS_RUNNING, pid });
  return new JobHandle({ jobId: jid, jobsRoot: root, pid, jobDir: jdir, proc });
}

export function requestCancel(jobsRoot, jobId, { sig = "SIGINT" } = {}) {
  const jdir = jobDir(jobsRoot, jobId);
  if (!fs.existsSync(path.join(jdir, STATUS_FILENAME))) {
    throw new JobNotFoundError(jobId);
  }
  const st = readStatus(jdir);
  if (TERMINAL_STATUSES.has(String(st.status))) return false;
  const pid = st.pid != null ? st.pid : readPid(jdir);
  if (!pidAlive(pid)) return false;
  const nPid = Number(pid);
  try {
    process.kill(-nPid, sig);
    return true;
  } catch (exc) {
    if (exc && exc.code === "ESRCH") {
      try {
        process.kill(nPid, sig);
        return true;
      } catch (exc2) {
        if (exc2 && exc2.code === "ESRCH") return false;
        throw exc2;
      }
    }
    if (exc && exc.code === "EPERM") {
      try {
        process.kill(nPid, sig);
        return true;
      } catch {
        return false;
      }
    }
    throw exc;
  }
}

function readNew(filePath, offset) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { data: "", offset };
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const st = fs.fstatSync(fd);
    const len = Math.max(0, st.size - offset);
    if (len <= 0) return { data: "", offset };
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, offset);
    return { data: buf.slice(0, n).toString("utf8"), offset: offset + n };
  } finally {
    fs.closeSync(fd);
  }
}

export function finalizeFromWait(
  handle,
  waitCode,
  { cancelled = false, timedOut = false, now = null } = {}
) {
  const jdir = handle.jobDir;
  let st;
  try {
    st = readStatus(jdir);
  } catch (exc) {
    if (!(exc instanceof JobError)) throw exc;
    st = emptyStatus({ jobId: handle.jobId });
  }
  if (TERMINAL_STATUSES.has(String(st.status))) {
    releaseMutator(handle.jobsRoot, handle.jobId);
    return st;
  }
  if (timedOut) {
    st = markTerminal(jdir, STATUS_TIMEOUT, {
      exitCode: 124,
      error: "job deadline exceeded",
      now,
    });
  } else if (cancelled) {
    let code = 130;
    if (waitCode != null && Number(waitCode) !== 0) {
      code = Number(waitCode) >= 128 ? Number(waitCode) : 130;
    }
    st = markTerminal(jdir, STATUS_CANCELLED, {
      exitCode: code,
      error: "cancelled",
      now,
    });
  } else if (Number(waitCode) === 0) {
    st = markTerminal(jdir, STATUS_OK, { exitCode: 0, now });
  } else {
    st = markTerminal(jdir, STATUS_FAILED, { exitCode: Number(waitCode), now });
  }
  releaseMutator(handle.jobsRoot, handle.jobId);
  return st;
}

function writeChunk(stream, chunk) {
  if (!chunk) return;
  if (stream && typeof stream.write === "function") stream.write(chunk);
}

export async function attach(
  handle,
  {
    streamOut = null,
    streamErr = null,
    pollInterval = DEFAULT_ATTACH_POLL_SEC,
    forwardSignals = true,
    nowFn = () => Date.now() / 1000,
  } = {}
) {
  const out = streamOut != null ? streamOut : process.stdout;
  const err = streamErr != null ? streamErr : process.stderr;
  let outOff = 0;
  let errOff = 0;
  let cancelled = false;
  let timedOut = false;
  let waitCode = null;
  const prev = {};

  const onSigint = () => {
    cancelled = true;
    requestCancel(handle.jobsRoot, handle.jobId, { sig: "SIGINT" });
  };

  if (forwardSignals) {
    for (const sig of ["SIGINT", "SIGTERM"]) {
      try {
        prev[sig] = process.listeners(sig).slice();
        process.on(sig, onSigint);
      } catch {
        /* ignore */
      }
    }
  }

  let exitSeen = childExitCode(handle.proc);
  if (handle.proc && exitSeen == null) {
    handle.proc.once("exit", (code, signal) => {
      if (code != null) exitSeen = Number(code);
      else if (signal) {
        const n = signalToNumber(signal);
        exitSeen = n != null ? 128 + n : 1;
      } else {
        exitSeen = 1;
      }
    });
  }

  try {
    while (true) {
      let chunk = readNew(handle.stdoutLog, outOff);
      outOff = chunk.offset;
      writeChunk(out, chunk.data);
      chunk = readNew(handle.stderrLog, errOff);
      errOff = chunk.offset;
      writeChunk(err, chunk.data);

      if (exitSeen != null) {
        waitCode = exitSeen;
        break;
      }

      let st = {};
      try {
        st = readStatus(handle.jobDir);
      } catch (exc) {
        if (!(exc instanceof JobError)) throw exc;
        st = {};
      }
      if (TERMINAL_STATUSES.has(String(st.status))) {
        waitCode = statusExitCode(st);
        if (exitSeen != null) waitCode = exitSeen;
        break;
      }

      if (!pidAlive(handle.pid)) {
        if (exitSeen != null) waitCode = exitSeen;
        break;
      }

      const deadline = st.deadline_at;
      if (deadline != null && Number(nowFn()) >= Number(deadline)) {
        timedOut = true;
        requestCancel(handle.jobsRoot, handle.jobId, { sig: "SIGTERM" });
        const deadlineKillAt = Number(nowFn()) + 2.0;
        while (Number(nowFn()) < deadlineKillAt) {
          if (exitSeen != null) {
            waitCode = exitSeen;
            break;
          }
          if (!pidAlive(handle.pid)) break;
          await sleep(pollInterval * 1000);
          chunk = readNew(handle.stdoutLog, outOff);
          outOff = chunk.offset;
          writeChunk(out, chunk.data);
        }
        if (waitCode == null && pidAlive(handle.pid)) {
          try {
            process.kill(-handle.pid, "SIGKILL");
          } catch {
            try {
              process.kill(handle.pid, "SIGKILL");
            } catch {
              /* ignore */
            }
          }
          for (let i = 0; i < 50; i++) {
            if (exitSeen != null) {
              waitCode = exitSeen;
              break;
            }
            if (!pidAlive(handle.pid)) break;
            await sleep(20);
          }
        }
        break;
      }

      await sleep(pollInterval * 1000);
    }
  } finally {
    if (forwardSignals) {
      for (const sig of Object.keys(prev)) {
        try {
          process.removeListener(sig, onSigint);
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (let i = 0; i < 20; i++) {
    let chunk = readNew(handle.stdoutLog, outOff);
    outOff = chunk.offset;
    writeChunk(out, chunk.data);
    chunk = readNew(handle.stderrLog, errOff);
    errOff = chunk.offset;
    writeChunk(err, chunk.data);
    if (!chunk.data) break;
    await sleep(10);
  }

  if (waitCode == null) {
    if (exitSeen != null) waitCode = exitSeen;
    else {
      try {
        const st = readStatus(handle.jobDir);
        if (TERMINAL_STATUSES.has(String(st.status))) return statusExitCode(st);
      } catch (exc) {
        if (!(exc instanceof JobError)) throw exc;
      }
      waitCode = 1;
    }
  }

  const st = finalizeFromWait(handle, Number(waitCode), {
    cancelled,
    timedOut,
  });
  return statusExitCode(st);
}

export function loadHandle(jobsRoot, jobId) {
  const jdir = jobDir(jobsRoot, jobId);
  if (!fs.existsSync(path.join(jdir, STATUS_FILENAME))) {
    throw new JobNotFoundError(jobId);
  }
  const st = readStatus(jdir);
  const pid = st.pid != null ? st.pid : readPid(jdir);
  if (pid == null) throw new JobError(`job ${jobId} has no pid`);
  return new JobHandle({
    jobId,
    jobsRoot: String(jobsRoot),
    pid: Number(pid),
    jobDir: jdir,
  });
}

export async function runJob(
  workerArgv,
  {
    detach = false,
    jobsRoot = null,
    command = "",
    timeoutSec = null,
    env = null,
    cwd = null,
    streamOut = null,
    streamErr = null,
    spawnFn = null,
  } = {}
) {
  const root = jobsRoot != null ? String(jobsRoot) : defaultJobsRoot(env);
  const out = streamOut != null ? streamOut : process.stdout;
  const handle = spawnWorker(workerArgv, {
    jobsRoot: root,
    command,
    timeoutSec,
    env,
    cwd,
    spawnFn,
    colorStream: out,
  });
  if (detach) {
    const msg = `job ${handle.jobId} started\n`;
    if (typeof out.write === "function") out.write(msg);
    return 0;
  }
  return attach(handle, { streamOut, streamErr });
}

export function listJobs(jobsRoot) {
  const root = String(jobsRoot);
  const out = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return out;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const child = path.join(root, ent.name);
    if (!fs.existsSync(path.join(child, STATUS_FILENAME))) continue;
    try {
      out.push(readStatus(child));
    } catch (exc) {
      if (exc instanceof JobError) continue;
      throw exc;
    }
  }
  out.sort((a, b) => Number(b.started_at || 0) - Number(a.started_at || 0));
  return out;
}

export function workerInstallSignalPolicy() {
  try {
    process.on("SIGHUP", () => {});
  } catch {
    /* ignore */
  }
}

export function workerMarkDone(exitCode, { env = null, cancelled = false } = {}) {
  const e = envMap(env);
  if (!isJobWorker(e)) return;
  const jdirRaw = String(e[ENV_JOB_DIR] || "").trim();
  const jobId = String(e[ENV_JOB_ID] || "").trim();
  if (!jdirRaw || !jobId) return;
  if (!fs.existsSync(path.join(jdirRaw, STATUS_FILENAME))) return;
  if (cancelled || exitCode === 130 || exitCode === -SIGNAL_NUM.SIGINT) {
    markTerminal(jdirRaw, STATUS_CANCELLED, { exitCode: 130, error: "cancelled" });
  } else if (exitCode === 0) {
    markTerminal(jdirRaw, STATUS_OK, { exitCode: 0 });
  } else {
    markTerminal(jdirRaw, STATUS_FAILED, { exitCode: Number(exitCode) });
  }
  releaseMutator(path.dirname(jdirRaw), jobId);
}

export async function maybeRunAsJob(
  workerArgv,
  {
    detach = false,
    foreground = false,
    command = "",
    timeoutSec = null,
    env = null,
    spawnFn = null,
    streamOut = null,
    streamErr = null,
  } = {}
) {
  const e = envMap(env);
  if (!jobModeEnabled(e, { foreground })) return null;
  const root = defaultJobsRoot(e);
  const to = timeoutSec != null ? timeoutSec : parseJobTimeoutSec(e);
  return runJob(workerArgv, {
    detach,
    jobsRoot: root,
    command,
    timeoutSec: to,
    env: e,
    spawnFn,
    streamOut,
    streamErr,
  });
}

export function extractJobMetaFlags(argv) {
  let detach = false;
  let foreground = false;
  const out = [];
  for (const a of argv) {
    if (a === "--detach") {
      detach = true;
      continue;
    }
    if (a === "--foreground") {
      foreground = true;
      continue;
    }
    out.push(a);
  }
  if (foreground) detach = false;
  return { cleaned: out, detach, foreground };
}

export function isMutatingJobCommand(
  command,
  { layoutHead = "", dryRun = false, testAction = "" } = {}
) {
  const cmd = String(command || "")
    .trim()
    .toLowerCase();
  if (
    cmd === "install" ||
    cmd === "update" ||
    cmd === "uninstall" ||
    cmd === "run" ||
    cmd === "run-steps"
  ) {
    return true;
  }
  if (cmd === "layout") {
    if (dryRun) return false;
    const head = String(layoutHead || "")
      .trim()
      .toLowerCase();
    if (!head || ["list", "show", "help", "-h", "--help", "save"].includes(head)) {
      return false;
    }
    return true;
  }
  if (cmd === "live" || cmd === "test") {
    return (
      String(testAction || "")
        .trim()
        .toLowerCase() === "run"
    );
  }
  return false;
}

export function defaultTimeoutForCommand(command, env) {
  const e = envMap(env);
  if (String(e[ENV_JOB_TIMEOUT] || "").trim()) {
    return parseJobTimeoutSec(e, { default: null });
  }
  const cmd = String(command || "")
    .trim()
    .toLowerCase();
  if (cmd in DEFAULT_TIMEOUT_BY_COMMAND) return Number(DEFAULT_TIMEOUT_BY_COMMAND[cmd]);
  return DEFAULT_JOB_TIMEOUT_SEC;
}

export function forgeWorkerArgv(forgeMjs, cleanedArgv, { node = null } = {}) {
  const exe = node || process.execPath;
  return [exe, String(forgeMjs), ...[...cleanedArgv].map(String)];
}

export function thisFilePath() {
  return fileURLToPath(import.meta.url);
}
