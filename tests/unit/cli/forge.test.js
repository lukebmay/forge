import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORGE_VERSION,
  NESTED_MIGRATION,
  TEST_MIGRATION,
  applyColorMode,
  main,
  parseColorFlag,
  parseGlobalFirst,
  shouldUseJobRunner,
  spawnPythonLeftover,
} from "../../../cli/forge.mjs";
import { BusyError, forgeWorkerArgv } from "../../../cli/job-runner.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FORGE_MJS = path.join(REPO, "cli", "forge.mjs");

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

describe("parseColorFlag", () => {
  it("strips --color=mode", () => {
    expect(parseColorFlag(["--color=always", "ping"])).toEqual({
      rest: ["ping"],
      colorMode: "always",
    });
  });

  it("bare --color is always", () => {
    expect(parseColorFlag(["--color"])).toEqual({
      rest: [],
      colorMode: "always",
    });
    expect(parseColorFlag(["--color", "--help"])).toEqual({
      rest: ["--help"],
      colorMode: "always",
    });
  });

  it("takes next token as mode", () => {
    expect(parseColorFlag(["--color", "never", "ping"])).toEqual({
      rest: ["ping"],
      colorMode: "never",
    });
  });
});

describe("parseGlobalFirst", () => {
  it("strips --first before command", () => {
    expect(parseGlobalFirst(["--first", "focus", "class:Foo"])).toEqual({
      rest: ["focus", "class:Foo"],
      first: true,
    });
  });

  it("leaves --first after command", () => {
    expect(parseGlobalFirst(["focus", "--first", "class:Foo"])).toEqual({
      rest: ["focus", "--first", "class:Foo"],
      first: false,
    });
  });
});

describe("applyColorMode", () => {
  it("rejects bad mode", () => {
    expect(() => applyColorMode("rainbow", {})).toThrow(/auto\|always\|never/);
  });

  it("sets FORGE_COLOR", () => {
    expect(applyColorMode("never", { A: "1" })).toEqual({ A: "1", FORGE_COLOR: "never" });
  });
});

describe("shouldUseJobRunner", () => {
  it("layout apply yes, list no", () => {
    expect(shouldUseJobRunner("layout", ["layout", "dev"])).toBe(true);
    expect(shouldUseJobRunner("layout", ["layout", "list"])).toBe(false);
    expect(shouldUseJobRunner("layout", ["layout", "dev", "--dry-run"])).toBe(false);
  });

  it("run / install yes, ping no", () => {
    expect(shouldUseJobRunner("run", ["run", "x.json"])).toBe(true);
    expect(shouldUseJobRunner("install", ["install"])).toBe(true);
    expect(shouldUseJobRunner("ping", ["ping"])).toBe(false);
  });
});

describe("main dispatch", () => {
  it("prints version", async () => {
    const c = capture();
    const rc = await main(["--version"], { stdout: c.stdout, stderr: c.stderr });
    expect(rc).toBe(0);
    expect(c.out).toContain(`forge ${FORGE_VERSION}`);
  });

  it("hard-breaks test / nested", async () => {
    const c = capture();
    expect(await main(["test", "nested", "status"], { stdout: c.stdout, stderr: c.stderr })).toBe(
      2
    );
    expect(c.err).toContain(TEST_MIGRATION.split("\n")[0]);
    const c2 = capture();
    expect(await main(["nested", "status"], { stdout: c2.stdout, stderr: c2.stderr })).toBe(2);
    expect(c2.err).toContain(NESTED_MIGRATION.split("\n")[0]);
  });

  it("dispatches node ping --help", async () => {
    const c = capture();
    const rc = await main(["ping", "--help"], { stdout: c.stdout, stderr: c.stderr });
    expect(rc).toBe(0);
    expect(c.out).toMatch(/Usage: forge ping/);
  });

  it("passes global --first into focus argv", async () => {
    const c = capture();
    const rc = await main(["--first", "focus", "--help"], {
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(rc).toBe(0);
    expect(c.out).toMatch(/--first/);
  });

  it("spawns leftover Python for layout list", async () => {
    const c = capture();
    let called;
    const rc = await main(["--color=never", "layout", "list"], {
      stdout: c.stdout,
      stderr: c.stderr,
      spawnPython: (argv, deps) => {
        called = { argv, deps };
        return 0;
      },
    });
    expect(rc).toBe(0);
    expect(called.argv).toEqual(["layout", "list"]);
    expect(called.deps.colorMode).toBe("never");
  });

  it("wraps mutating leftover as job with node worker argv", async () => {
    const c = capture();
    let worker;
    const rc = await main(["layout", "dev"], {
      stdout: c.stdout,
      stderr: c.stderr,
      env: { FORGE_JOB: "1", FORGE_JOBS_DIR: "/tmp/unused-jobs" },
      maybeRunAsJob: async (argv) => {
        worker = argv;
        return 0;
      },
      spawnPython: () => {
        throw new Error("should not spawn leftover in parent");
      },
    });
    expect(rc).toBe(0);
    expect(worker[0]).toBe(process.execPath);
    expect(worker[1]).toBe(FORGE_MJS);
    expect(worker.slice(2)).toEqual(["layout", "dev"]);
  });

  it("foreground skips job wrap", async () => {
    const c = capture();
    let spawned;
    const rc = await main(["--foreground", "layout", "dev"], {
      stdout: c.stdout,
      stderr: c.stderr,
      maybeRunAsJob: async () => {
        throw new Error("should not job");
      },
      spawnPython: (argv) => {
        spawned = argv;
        return 0;
      },
    });
    expect(rc).toBe(0);
    expect(spawned).toEqual(["layout", "dev"]);
  });

  it("busy mutator prints job id", async () => {
    const c = capture();
    const rc = await main(["run", "x.json"], {
      stdout: c.stdout,
      stderr: c.stderr,
      env: { FORGE_JOBS_DIR: "/tmp/jobs-x" },
      maybeRunAsJob: async () => {
        throw new BusyError("job-1");
      },
    });
    expect(rc).toBe(1);
    expect(c.err).toMatch(/another mutating job is running: job-1/);
  });
});

describe("spawnPythonLeftover", () => {
  it("forces FORGE_JOB=0 and passes color/first", () => {
    let called;
    const rc = spawnPythonLeftover(["layout", "list"], {
      env: { FORGE_JOB: "1", PATH: process.env.PATH },
      colorMode: "always",
      first: true,
      findPython: () => "/usr/bin/python3",
      pythonForge: "/repo/scripts/forge/forge",
      spawnSync: (cmd, args, opts) => {
        called = { cmd, args, opts };
        return { status: 0 };
      },
    });
    expect(rc).toBe(0);
    expect(called.cmd).toBe("/usr/bin/python3");
    expect(called.args).toEqual([
      "/repo/scripts/forge/forge",
      "--color=always",
      "--first",
      "layout",
      "list",
    ]);
    expect(called.opts.env.FORGE_JOB).toBe("0");
  });

  it("exits 127 when python missing", () => {
    const c = capture();
    const rc = spawnPythonLeftover(["layout", "list"], {
      findPython: () => null,
      stderr: c.stderr,
    });
    expect(rc).toBe(127);
    expect(c.err.toLowerCase()).toContain("python3");
  });
});

describe("PATH symlink entry", () => {
  it("runs --version when argv[1] is a symlink to forge.mjs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-bin-"));
    try {
      const link = path.join(dir, "forge");
      fs.symlinkSync(FORGE_MJS, link);
      const r = spawnSync(process.execPath, [link, "--version"], {
        encoding: "utf8",
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`forge ${FORGE_VERSION}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("forgeWorkerArgv shape", () => {
  it("matches Node router worker", () => {
    expect(forgeWorkerArgv("/repo/cli/forge.mjs", ["run-steps", "[]"], { node: "node" })).toEqual([
      "node",
      "/repo/cli/forge.mjs",
      "run-steps",
      "[]",
    ]);
  });
});
