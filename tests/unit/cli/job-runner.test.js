import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS_CANCELLED,
  STATUS_FAILED,
  STATUS_OK,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_TIMEOUT,
  BusyError,
  attach,
  claimMutator,
  defaultJobsRoot,
  defaultTimeoutForCommand,
  extractJobMetaFlags,
  finalizeFromWait,
  forgeWorkerArgv,
  holderIsActive,
  isJobWorker,
  isMutatingJobCommand,
  jobModeEnabled,
  listJobs,
  loadHandle,
  markTerminal,
  mutatorHolder,
  newJobId,
  parseJobTimeoutSec,
  pidAlive,
  prepareJobDir,
  readStatus,
  reapStaleJobs,
  releaseMutator,
  requestCancel,
  runJob,
  setMutatorPid,
  spawnWorker,
  statusExitCode,
  updateStatus,
  streamIsTTY,
  workerEnv,
  workerMarkDone,
  workerShouldForceColor,
  writePid,
} from "../../../cli/job-runner.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function capture() {
  let out = "";
  let err = "";
  return {
    stdout: { write: (s) => (out += s), isatty: () => false },
    stderr: { write: (s) => (err += s), isatty: () => false },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forge-job-"));
}

function nodeWorker(body) {
  return [process.execPath, "-e", body];
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("job mode flags", () => {
  it("defaults enabled", () => {
    expect(jobModeEnabled({})).toBe(true);
    expect(jobModeEnabled({ FORGE_JOB: "1" })).toBe(true);
  });

  it("disables on foreground / FORGE_JOB=0 / worker", () => {
    expect(jobModeEnabled({}, { foreground: true })).toBe(false);
    expect(jobModeEnabled({ FORGE_JOB: "0" })).toBe(false);
    expect(jobModeEnabled({ FORGE_JOB: "false" })).toBe(false);
    expect(jobModeEnabled({ FORGE_JOB_WORKER: "1" })).toBe(false);
  });

  it("isJobWorker", () => {
    expect(isJobWorker({})).toBe(false);
    expect(isJobWorker({ FORGE_JOB_WORKER: "1" })).toBe(true);
  });

  it("parse timeout", () => {
    expect(parseJobTimeoutSec({})).toBe(300.0);
    expect(parseJobTimeoutSec({ FORGE_JOB_TIMEOUT: "90" })).toBe(90.0);
    expect(parseJobTimeoutSec({ FORGE_JOB_TIMEOUT: "0" })).toBeNull();
  });

  it("default jobs root override", () => {
    expect(defaultJobsRoot({ FORGE_JOBS_DIR: "/tmp/forge-jobs-test" })).toBe(
      "/tmp/forge-jobs-test"
    );
  });
});

describe("status machine", () => {
  it("newJobId shape", () => {
    const jid = newJobId({ now: 0, rand: "abcdef" });
    expect(jid.startsWith("19700101T000000Z-")).toBe(true);
    expect(jid.endsWith("abcdef")).toBe(true);
  });

  it("prepare and terminal", () => {
    const root = tmpRoot();
    try {
      const { jobId, jobDir, status } = prepareJobDir(root, {
        jobId: "j1",
        command: "layout",
        argv: ["forge", "layout", "dev"],
      });
      expect(jobId).toBe("j1");
      expect(status.status).toBe(STATUS_PENDING);
      expect(readStatus(jobDir).command).toBe("layout");
      markTerminal(jobDir, STATUS_OK, { exitCode: 0 });
      const st2 = readStatus(jobDir);
      expect(st2.status).toBe(STATUS_OK);
      expect(statusExitCode(st2)).toBe(0);
      markTerminal(jobDir, STATUS_FAILED, { exitCode: 1 });
      expect(readStatus(jobDir).status).toBe(STATUS_OK);
    } finally {
      rmrf(root);
    }
  });

  it("prepareJobDir creates missing jobs root", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "forge-job-"));
    const root = path.join(base, "forge", "jobs");
    try {
      expect(fs.existsSync(root)).toBe(false);
      const { jobId, jobDir } = prepareJobDir(root, {
        jobId: "fresh",
        command: "install",
      });
      expect(jobId).toBe("fresh");
      expect(fs.existsSync(jobDir)).toBe(true);
      expect(() => prepareJobDir(root, { jobId: "fresh", command: "install" })).toThrow(
        /EEXIST|file already exists/i
      );
    } finally {
      rmrf(base);
    }
  });

  it("statusExitCode defaults", () => {
    expect(statusExitCode({ status: STATUS_OK })).toBe(0);
    expect(statusExitCode({ status: STATUS_CANCELLED })).toBe(130);
    expect(statusExitCode({ status: STATUS_TIMEOUT })).toBe(124);
    expect(statusExitCode({ status: STATUS_FAILED })).toBe(1);
  });
});

describe("mutator lock", () => {
  it("claim and busy", () => {
    const root = tmpRoot();
    try {
      const { jobDir } = prepareJobDir(root, { jobId: "a", command: "layout" });
      writePid(jobDir, process.pid);
      updateStatus(jobDir, { status: STATUS_RUNNING, pid: process.pid });
      claimMutator(root, "a");
      setMutatorPid(root, "a", process.pid);
      const holder = mutatorHolder(root);
      expect(holder).not.toBeNull();
      expect(holder.job_id).toBe("a");
      expect(() => claimMutator(root, "b")).toThrow(BusyError);
      try {
        claimMutator(root, "b");
      } catch (e) {
        expect(e.jobId).toBe("a");
      }
      releaseMutator(root, "a");
      markTerminal(jobDir, STATUS_OK, { exitCode: 0 });
      claimMutator(root, "b");
      releaseMutator(root, "b");
    } finally {
      rmrf(root);
    }
  });

  it("stale claim allows takeover", () => {
    const root = tmpRoot();
    try {
      const { jobDir } = prepareJobDir(root, {
        jobId: "dead",
        command: "layout",
        now: Date.now() / 1000 - 120,
      });
      updateStatus(jobDir, { status: STATUS_RUNNING, pid: 999999999 });
      writePid(jobDir, 999999999);
      claimMutator(root, "dead", { now: Date.now() / 1000 - 120 });
      setMutatorPid(root, "dead", 999999999);
      expect(holderIsActive(root, { job_id: "dead", pid: 999999999 })).toBe(false);
      claimMutator(root, "fresh");
      releaseMutator(root, "fresh");
    } finally {
      rmrf(root);
    }
  });
});

describe("reaper", () => {
  it("reaps orphaned worker", () => {
    const root = tmpRoot();
    try {
      const { jobDir } = prepareJobDir(root, { jobId: "orph", command: "layout" });
      writePid(jobDir, 999999998);
      updateStatus(jobDir, { status: STATUS_RUNNING, pid: 999999998 });
      claimMutator(root, "orph");
      setMutatorPid(root, "orph", 999999998);
      const results = reapStaleJobs(root);
      expect(results.some((r) => r.job_id === "orph")).toBe(true);
      expect(readStatus(jobDir).status).toBe(STATUS_FAILED);
      expect(mutatorHolder(root)).toBeNull();
    } finally {
      rmrf(root);
    }
  });
});

describe("spawn / attach", () => {
  it("streams and exit code", async () => {
    const root = tmpRoot();
    try {
      const handle = spawnWorker(
        nodeWorker("console.log('hello-out'); console.error('hello-err'); process.exit(7);"),
        { jobsRoot: root, command: "test", timeoutSec: 30 }
      );
      const c = capture();
      const rc = await attach(handle, {
        streamOut: c.stdout,
        streamErr: c.stderr,
        forwardSignals: false,
      });
      expect(rc).toBe(7);
      expect(c.out).toContain("hello-out");
      expect(c.err).toContain("hello-err");
      const st = readStatus(handle.jobDir);
      expect(st.status).toBe(STATUS_FAILED);
      expect(st.exit_code).toBe(7);
      expect(mutatorHolder(root)).toBeNull();
    } finally {
      rmrf(root);
    }
  });

  it("runJob ok", async () => {
    const root = tmpRoot();
    try {
      const c = capture();
      const rc = await runJob(nodeWorker("console.log('ok');"), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
        streamOut: c.stdout,
        streamErr: c.stderr,
      });
      expect(rc).toBe(0);
      expect(c.out).toContain("ok");
      const jobs = listJobs(root);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(STATUS_OK);
    } finally {
      rmrf(root);
    }
  });

  it("detach returns immediately", async () => {
    const root = tmpRoot();
    try {
      const marker = path.join(root, "done.txt");
      const code = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(
        marker
      )}, '1'), 400);`;
      const c = capture();
      const t0 = Date.now();
      const rc = await runJob(nodeWorker(code), {
        detach: true,
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
        streamOut: c.stdout,
      });
      const elapsed = Date.now() - t0;
      expect(rc).toBe(0);
      expect(elapsed).toBeLessThan(350);
      expect(c.out).toContain("job ");
      expect(c.out).toContain(" started");
      for (let i = 0; i < 50 && !fs.existsSync(marker); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(fs.existsSync(marker)).toBe(true);
      const jobs = listJobs(root);
      expect(jobs).toHaveLength(1);
      const handle = loadHandle(root, jobs[0].job_id);
      for (let i = 0; i < 50 && pidAlive(handle.pid); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      finalizeFromWait(handle, 0);
      expect(readStatus(handle.jobDir).status).toBe(STATUS_OK);
    } finally {
      rmrf(root);
    }
  });

  it("worker survives SIGHUP", async () => {
    const root = tmpRoot();
    try {
      const marker = path.join(root, "after-hup.txt");
      const code = [
        "process.on('SIGHUP', () => {});",
        "setTimeout(() => {",
        `  require('fs').writeFileSync(${JSON.stringify(marker)}, 'survived');`,
        "}, 350);",
      ].join("\n");
      const handle = spawnWorker(nodeWorker(code), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
      });
      await new Promise((r) => setTimeout(r, 50));
      process.kill(handle.pid, "SIGHUP");
      for (let i = 0; i < 40 && !fs.existsSync(marker); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(fs.existsSync(marker)).toBe(true);
      expect(fs.readFileSync(marker, "utf8")).toBe("survived");
      for (let i = 0; i < 40 && pidAlive(handle.pid); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const rc = await attach(handle, {
        streamOut: capture().stdout,
        streamErr: capture().stderr,
        forwardSignals: false,
      });
      expect(rc).toBe(0);
    } finally {
      rmrf(root);
    }
  });

  it("cooperative cancel", async () => {
    const root = tmpRoot();
    try {
      const code = [
        "process.on('SIGINT', () => process.exit(130));",
        "setTimeout(() => {}, 10000);",
      ].join("\n");
      const handle = spawnWorker(nodeWorker(code), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(requestCancel(root, handle.jobId, { sig: "SIGINT" })).toBe(true);
      const rc = await attach(handle, {
        streamOut: capture().stdout,
        streamErr: capture().stderr,
        forwardSignals: false,
      });
      expect([130, 1]).toContain(rc);
      const st = readStatus(handle.jobDir);
      expect([STATUS_CANCELLED, STATUS_FAILED]).toContain(st.status);
    } finally {
      rmrf(root);
    }
  });

  it("single-flight blocks second spawn", async () => {
    const root = tmpRoot();
    try {
      const h1 = spawnWorker(nodeWorker("setTimeout(() => {}, 800);"), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
      });
      expect(() =>
        spawnWorker(nodeWorker("console.log(1)"), {
          jobsRoot: root,
          command: "test",
          timeoutSec: 30,
        })
      ).toThrow(BusyError);
      await attach(h1, {
        streamOut: capture().stdout,
        streamErr: capture().stderr,
        forwardSignals: false,
      });
      const h2 = spawnWorker(nodeWorker("console.log(1)"), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 30,
      });
      const rc = await attach(h2, {
        streamOut: capture().stdout,
        streamErr: capture().stderr,
        forwardSignals: false,
      });
      expect(rc).toBe(0);
    } finally {
      rmrf(root);
    }
  });

  it("worker env disables nesting", () => {
    const env = workerEnv(
      { FORGE_JOB: "1", DISPLAY: ":0" },
      { jobId: "x", jobDirPath: "/tmp/x", forceColor: false }
    );
    expect(env.FORGE_JOB_WORKER).toBe("1");
    expect(env.FORGE_JOB).toBe("0");
    expect(env.FORGE_JOB_ID).toBe("x");
    expect(env.DISPLAY).toBe(":0");
    expect(jobModeEnabled(env)).toBe(false);
  });

  it("worker env forces color for tty attach", () => {
    const env = workerEnv(
      { FORGE_JOB: "1", DISPLAY: ":0" },
      { jobId: "x", jobDirPath: "/tmp/x", forceColor: true }
    );
    expect(env.FORGE_COLOR).toBe("always");
  });

  it("worker env respects color never", () => {
    const env = workerEnv(
      { FORGE_JOB: "1", FORGE_COLOR: "never" },
      {
        jobId: "x",
        jobDirPath: "/tmp/x",
        forceColor: null,
        colorStream: { isatty: () => false },
      }
    );
    expect(env.FORGE_COLOR).toBe("never");
    expect(
      workerShouldForceColor({ FORGE_COLOR: "never" }, { stream: { isatty: () => false } })
    ).toBe(false);
  });

  it("workerShouldForceColor auto tty", () => {
    expect(
      workerShouldForceColor({ FORGE_COLOR: "auto" }, { stream: { isatty: () => true } })
    ).toBe(true);
    expect(
      workerShouldForceColor(
        { FORGE_COLOR: "auto", NO_COLOR: "1" },
        { stream: { isatty: () => true } }
      )
    ).toBe(false);
    expect(
      workerShouldForceColor(
        { FORGE_COLOR: "auto" },
        { stream: { write() {}, isatty: () => false } }
      )
    ).toBe(false);
  });

  it("streamIsTTY accepts Node isTTY boolean (CN13 color regression)", () => {
    expect(streamIsTTY({ isTTY: true })).toBe(true);
    expect(streamIsTTY({ isTTY: false })).toBe(false);
    expect(streamIsTTY({ isatty: () => true })).toBe(true);
    expect(streamIsTTY({ isatty: () => false })).toBe(false);
    expect(streamIsTTY({})).toBe(false);
    expect(streamIsTTY(null)).toBe(false);
    expect(workerShouldForceColor({ FORGE_COLOR: "auto" }, { stream: { isTTY: true } })).toBe(true);
    expect(workerShouldForceColor({ FORGE_COLOR: "auto" }, { stream: { isTTY: false } })).toBe(
      false
    );
    const env = workerEnv(
      { FORGE_JOB: "1" },
      {
        jobId: "x",
        jobDirPath: "/tmp/x",
        colorStream: { isTTY: true },
      }
    );
    expect(env.FORGE_COLOR).toBe("always");
  });

  it("workerMarkDone", () => {
    const root = tmpRoot();
    try {
      const { jobDir } = prepareJobDir(root, { jobId: "w1", command: "layout" });
      writePid(jobDir, process.pid);
      updateStatus(jobDir, { status: STATUS_RUNNING, pid: process.pid });
      claimMutator(root, "w1");
      setMutatorPid(root, "w1", process.pid);
      workerMarkDone(0, {
        env: {
          FORGE_JOB_WORKER: "1",
          FORGE_JOB_ID: "w1",
          FORGE_JOB_DIR: jobDir,
        },
      });
      expect(readStatus(jobDir).status).toBe(STATUS_OK);
      expect(mutatorHolder(root)).toBeNull();
    } finally {
      rmrf(root);
    }
  });
});

describe("attach timeout", () => {
  it("deadline marks timeout", async () => {
    const root = tmpRoot();
    try {
      const handle = spawnWorker(nodeWorker("setTimeout(() => {}, 5000);"), {
        jobsRoot: root,
        command: "test",
        timeoutSec: 0.2,
      });
      const rc = await attach(handle, {
        streamOut: capture().stdout,
        streamErr: capture().stderr,
        forwardSignals: false,
      });
      expect(rc).toBe(124);
      expect(readStatus(handle.jobDir).status).toBe(STATUS_TIMEOUT);
    } finally {
      rmrf(root);
    }
  });
});

describe("cli helpers", () => {
  it("extractJobMetaFlags", () => {
    let r = extractJobMetaFlags(["layout", "dev", "--detach", "--verbose"]);
    expect(r.cleaned).toEqual(["layout", "dev", "--verbose"]);
    expect(r.detach).toBe(true);
    expect(r.foreground).toBe(false);
    r = extractJobMetaFlags(["--foreground", "layout", "dev", "--detach"]);
    expect(r.cleaned).toEqual(["layout", "dev"]);
    expect(r.detach).toBe(false);
    expect(r.foreground).toBe(true);
  });

  it("isMutatingJobCommand", () => {
    expect(isMutatingJobCommand("layout", { layoutHead: "dev" })).toBe(true);
    expect(isMutatingJobCommand("layout", { layoutHead: "clean" })).toBe(true);
    expect(isMutatingJobCommand("layout", { layoutHead: "list" })).toBe(false);
    expect(isMutatingJobCommand("layout", { layoutHead: "show" })).toBe(false);
    expect(isMutatingJobCommand("layout", { layoutHead: "save" })).toBe(false);
    expect(isMutatingJobCommand("layout", { layoutHead: "dev", dryRun: true })).toBe(false);
    expect(isMutatingJobCommand("install")).toBe(true);
    expect(isMutatingJobCommand("run")).toBe(true);
    expect(isMutatingJobCommand("live", { testAction: "run" })).toBe(true);
    expect(isMutatingJobCommand("live", { testAction: "plan" })).toBe(false);
    expect(isMutatingJobCommand("test", { testAction: "run" })).toBe(true);
    expect(isMutatingJobCommand("test", { testAction: "plan" })).toBe(false);
    expect(isMutatingJobCommand("ping")).toBe(false);
    expect(isMutatingJobCommand("tree")).toBe(false);
  });

  it("defaultTimeoutForCommand", () => {
    expect(defaultTimeoutForCommand("layout", {})).toBe(300.0);
    expect(defaultTimeoutForCommand("install", {})).toBe(900.0);
    expect(defaultTimeoutForCommand("layout", { FORGE_JOB_TIMEOUT: "42" })).toBe(42.0);
  });

  it("forgeWorkerArgv is node + forge.mjs + args", () => {
    const argv = forgeWorkerArgv("/path/cli/forge.mjs", ["layout", "dev"], {
      node: "/usr/bin/node",
    });
    expect(argv).toEqual(["/usr/bin/node", "/path/cli/forge.mjs", "layout", "dev"]);
  });

  it("spawnWorker node argv is opaque", () => {
    const root = tmpRoot();
    try {
      const worker = ["node", path.join(REPO, "cli", "x.mjs"), "load", "vim"];
      const fake = {
        pid: 424242,
        exitCode: null,
        signalCode: null,
        once() {},
        unref() {},
      };
      let called;
      const handle = spawnWorker(worker, {
        jobsRoot: root,
        command: "keybind",
        timeoutSec: 30,
        spawnFn: (cmd, args, opts) => {
          called = { cmd, args, opts };
          return fake;
        },
      });
      expect(handle.pid).toBe(424242);
      expect(called.cmd).toBe("node");
      expect([called.cmd, ...called.args]).toEqual(worker);
      expect(called.opts.detached).toBe(true);
    } finally {
      rmrf(root);
    }
  });

  it("isJobWorker pid-scoped", () => {
    const jdir = tmpRoot();
    try {
      writePid(jdir, process.pid);
      const env = { FORGE_JOB_WORKER: "1", FORGE_JOB_DIR: jdir };
      expect(isJobWorker(env)).toBe(true);
      writePid(jdir, process.pid + 99999);
      expect(isJobWorker(env)).toBe(false);
    } finally {
      rmrf(jdir);
    }
  });
});
