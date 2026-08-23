import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { formatLogStatus, parseArgv, run } from "../../../cli/log.mjs";

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
      },
      c.stdout
    );
    expect(c.out).toMatch(/durable:\s+DEBUG \(5\)/);
    expect(c.out).toMatch(/session:\s+TRACE \(6\)/);
    expect(c.out).toMatch(/effective:\s+TRACE \(6\)/);
    expect(c.out).toMatch(/file:\s+\/tmp\/forge\.log/);
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
    expect(c.out).toMatch(/Usage: forge log/);
  });

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    expect(run([], { which: () => null, stdout: c.stdout, stderr: c.stderr })).toBe(127);
  });
});
