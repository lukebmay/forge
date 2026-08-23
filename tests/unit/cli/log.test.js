import { describe, it, expect, vi } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import {
  formatLogStatus,
  parseArgv,
  run,
  resolveForgeLogTapes,
  resolvePlogQueryStdio,
  runPlogQuery,
} from "../../../cli/log.mjs";

function capture() {
  let out = "";
  let err = "";
  return {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

const statusPayload = {
  ok: true,
  durable: { enabled: true, level: 5, levelName: "DEBUG" },
  session: null,
  effective: { level: 5, levelName: "DEBUG" },
  file: "/tmp/forge.log",
};

describe("cli/log parseArgv", () => {
  it("defaults to status", () => {
    expect(parseArgv([])).toMatchObject({
      op: "status",
      level: null,
      persist: false,
      truncate: false,
      error: null,
    });
  });

  it("parses session level", () => {
    expect(parseArgv(["trace"])).toMatchObject({
      op: "set",
      level: "trace",
      persist: false,
      error: null,
    });
  });

  it("parses persist + truncate", () => {
    expect(parseArgv(["debug", "--persist", "--truncate"])).toMatchObject({
      op: "set",
      level: "debug",
      persist: true,
      truncate: true,
      error: null,
    });
  });

  it("parses reset and truncate-only", () => {
    expect(parseArgv(["reset"])).toMatchObject({ op: "reset", error: null });
    expect(parseArgv(["--truncate"])).toMatchObject({
      op: "truncate",
      error: null,
    });
  });

  it("rejects persist without level and reset --persist", () => {
    expect(parseArgv(["--persist"]).error).toMatch(/--persist requires a level/);
    expect(parseArgv(["reset", "--persist"]).error).toMatch(/reset clears session/);
  });

  it("rejects unknown level", () => {
    expect(parseArgv(["loud"]).error).toMatch(/unknown level/);
  });

  it("routes query head and plog-query flags to query mode", () => {
    expect(parseArgv(["query", "--last", "5"])).toMatchObject({
      mode: "query",
      queryArgv: ["--last", "5"],
      error: null,
    });
    expect(parseArgv(["--grep", "slot", "--last", "10"])).toMatchObject({
      mode: "query",
      error: null,
    });
    expect(parseArgv(["--level", "warn+"])).toMatchObject({
      mode: "query",
      error: null,
    });
    expect(parseArgv(["show"])).toMatchObject({ mode: "query", queryArgv: [] });
    expect(parseArgv(["--pretty", "internal", "--hilight", "off", "--compact"])).toMatchObject({
      mode: "query",
      error: null,
    });
    expect(parseArgv(["--pretty=bat", "--bat-theme", "Monokai Extended"]).mode).toBe("query");
  });

  it("keeps positional level as level mode (not query)", () => {
    expect(parseArgv(["warn"])).toMatchObject({ mode: "level", op: "set", level: "warn" });
  });
});

describe("cli/log formatLogStatus", () => {
  it("prints durable/session/effective", () => {
    const c = capture();
    formatLogStatus(
      {
        durable: { enabled: true, level: 5, levelName: "DEBUG" },
        session: { level: 6, levelName: "TRACE" },
        effective: { level: 6, levelName: "TRACE" },
        file: "/tmp/forge.log",
        jsonl: "/tmp/forge.jsonl",
      },
      c.stdout
    );
    expect(c.out).toMatch(/durable:\s+DEBUG \(5\)/);
    expect(c.out).toMatch(/session:\s+TRACE \(6\)/);
    expect(c.out).toMatch(/effective:\s+TRACE \(6\)/);
    expect(c.out).toMatch(/file:\s+\/tmp\/forge\.log/);
    expect(c.out).toMatch(/jsonl:\s+\/tmp\/forge\.jsonl/);
  });
});

describe("cli/log run", () => {
  it("calls Log status and prints human status", () => {
    const c = capture();
    const code = run([], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Log`);
        expect(cmd[cmd.length - 1]).toBe(JSON.stringify({ op: "status" }));
        return {
          stdout: `('${JSON.stringify(statusPayload)}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(c.out).toMatch(/effective:\s+DEBUG \(5\)/);
  });

  it("calls Log set with persist", () => {
    const c = capture();
    let seen;
    const code = run(["trace", "--persist"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        seen = JSON.parse(cmd[cmd.length - 1]);
        return {
          stdout: `('${JSON.stringify({
            ...statusPayload,
            op: "set",
            persist: true,
            durable: { enabled: true, level: 6, levelName: "TRACE" },
            effective: { level: 6, levelName: "TRACE" },
          })}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(seen).toEqual({ op: "set", level: "trace", persist: true });
    expect(c.out).toMatch(/TRACE/);
  });

  it("set + truncate issues two Log calls", () => {
    const c = capture();
    /** @type {unknown[]} */
    const ops = [];
    const code = run(["info", "--truncate"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        ops.push(JSON.parse(cmd[cmd.length - 1]));
        return {
          stdout: `('${JSON.stringify({
            ...statusPayload,
            session: { level: 4, levelName: "INFO" },
            effective: { level: 4, levelName: "INFO" },
          })}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(ops).toEqual([{ op: "set", level: "info", persist: false }, { op: "truncate" }]);
  });

  it("help exits 0", () => {
    const c = capture();
    expect(run(["--help"], { stdout: c.stdout, stderr: c.stderr })).toBe(0);
    expect(c.out).toMatch(/Usage:/);
    expect(c.out).toMatch(/forge log/);
  });

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    expect(run([], { which: () => null, stdout: c.stdout, stderr: c.stderr })).toBe(127);
  });

  it("query mode forwards to plog-query with forge tape env", () => {
    const c = capture();
    /** @type {{ bin?: string, argv?: string[], env?: NodeJS.ProcessEnv, stdio?: unknown }} */
    const seen = {};
    const code = run(["query", "--last", "3", "--grep", "slot"], {
      env: {
        FORGE_LOG_FILE: "/tmp/forge-test.log",
        FORGE_LOG_JSONL: "/tmp/forge-test.jsonl",
      },
      spawnSync: (bin, argv, opts) => {
        seen.bin = bin;
        seen.argv = argv;
        seen.env = opts.env;
        seen.stdio = opts.stdio;
        return { status: 0, stdout: "ok-line\n", stderr: "", error: null };
      },
      plogQueryPath: "/fake/plog-query",
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(seen.bin).toBe("/fake/plog-query");
    expect(seen.argv).toEqual(["--last", "3", "--grep", "slot"]);
    expect(seen.env?.P_LOG_FILE).toBe("/tmp/forge-test.log");
    expect(seen.env?.P_LOG_JSONL).toBe("/tmp/forge-test.jsonl");
    // Capture sinks are not process TTYs → pipe so parent can forward.
    expect(seen.stdio).toEqual(["inherit", "pipe", "pipe"]);
    expect(c.out).toBe("ok-line\n");
  });

  it("resolveForgeLogTapes mirrors adapter defaults", () => {
    const tapes = resolveForgeLogTapes({
      FORGE_LOG_FILE: "/tmp/x.log",
    });
    expect(tapes.file).toBe("/tmp/x.log");
    expect(tapes.jsonl).toBe("/tmp/x.jsonl");
  });
});

describe("cli/log plog-query TTY stdio (Q0)", () => {
  it("resolvePlogQueryStdio inherits only flagged TTY sinks", () => {
    expect(resolvePlogQueryStdio({})).toEqual(["inherit", "pipe", "pipe"]);
    expect(resolvePlogQueryStdio({ stdoutIsTTY: true })).toEqual(["inherit", "inherit", "pipe"]);
    expect(resolvePlogQueryStdio({ stderrIsTTY: true })).toEqual(["inherit", "pipe", "inherit"]);
    expect(resolvePlogQueryStdio({ stdoutIsTTY: true, stderrIsTTY: true })).toEqual([
      "inherit",
      "inherit",
      "inherit",
    ]);
  });

  it("runPlogQuery inherits stdout/stderr when parent TTY overrides are set", () => {
    /** @type {{ stdio?: unknown }} */
    const seen = {};
    const code = runPlogQuery(["--last", "1", "--grep", "slot"], {
      env: {
        FORGE_LOG_FILE: "/tmp/forge-tty.log",
        FORGE_LOG_JSONL: "/tmp/forge-tty.jsonl",
      },
      stdoutIsTTY: true,
      stderrIsTTY: true,
      spawnSync: (_bin, _argv, opts) => {
        seen.stdio = opts.stdio;
        // inherit → no buffered stdout; child would write ESC directly
        return {
          status: 0,
          stdout: null,
          stderr: null,
          error: null,
        };
      },
      plogQueryPath: "/fake/plog-query",
    });
    expect(code).toBe(0);
    expect(seen.stdio).toEqual(["inherit", "inherit", "inherit"]);
  });

  it("interactive inherit path can surface ESC from child (fake TTY spawn)", () => {
    const ESC = "\u001b[31m";
    const c = capture();
    /** @type {{ stdio?: unknown }} */
    const seen = {};
    // Simulate: parent is TTY so we inherit; child still returns a buffer in
    // this unit (real inherit leaves stdout null — contract is stdio shape).
    // Separate branch: when forced pipe + color always, ESC is forwarded.
    const codePipe = runPlogQuery(["--last", "1", "--color=always"], {
      env: { FORGE_LOG_FILE: "/tmp/forge-esc.log" },
      stdoutIsTTY: false,
      stderrIsTTY: false,
      spawnSync: (_bin, _argv, opts) => {
        seen.stdio = opts.stdio;
        return {
          status: 0,
          stdout: `${ESC}WARN\u001b[0m colored\n`,
          stderr: "",
          error: null,
        };
      },
      plogQueryPath: "/fake/plog-query",
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(codePipe).toBe(0);
    expect(seen.stdio).toEqual(["inherit", "pipe", "pipe"]);
    expect(c.out).toContain("\u001b[");
    expect(c.out).toContain("WARN");

    const seenInherit = {};
    const codeInherit = runPlogQuery(["--last", "1"], {
      env: { FORGE_LOG_FILE: "/tmp/forge-esc.log" },
      stdoutIsTTY: true,
      stderrIsTTY: true,
      spawnSync: (_bin, _argv, opts) => {
        seenInherit.stdio = opts.stdio;
        return { status: 0, stdout: null, stderr: null, error: null };
      },
      plogQueryPath: "/fake/plog-query",
    });
    expect(codeInherit).toBe(0);
    expect(seenInherit.stdio).toEqual(["inherit", "inherit", "inherit"]);
  });
});
