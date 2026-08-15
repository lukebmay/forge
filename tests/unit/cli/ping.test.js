import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { formatJson, parseArgv, run } from "../../../cli/ping.mjs";

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

describe("cli/ping parseArgv", () => {
  it("detects help", () => {
    expect(parseArgv(["--help"]).help).toBe(true);
    expect(parseArgv(["-h"]).help).toBe(true);
  });
});

describe("cli/ping formatJson", () => {
  it("pretty-prints by default path", () => {
    expect(formatJson({ ok: true }, false)).toBe(JSON.stringify({ ok: true }, null, 2));
  });
});

describe("cli/ping run (mocked gdbus)", () => {
  it("prints health JSON and exits 0 when ok", () => {
    const c = capture();
    const payload = { ok: true, apiVersion: 1 };
    const code = run([], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Ping`);
        return {
          stdout: `('${JSON.stringify(payload)}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.out)).toEqual(payload);
    expect(c.out).toContain("\n");
  });

  it("exits 1 when ok is not true", () => {
    const c = capture();
    const code = run([], {
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: "('{\"ok\":false}',)",
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
  });

  it("exits 1 on bus failure", () => {
    const c = capture();
    const code = run([], {
      which: () => "/usr/bin/gdbus",
      run: () => ({ stdout: "", stderr: "timeout", code: 1 }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.err).toMatch(/bus call failed/);
  });

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    const code = run([], {
      which: () => null,
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(127);
    expect(c.err).toMatch(/gdbus not found/);
  });

  it("help exits 0", () => {
    const c = capture();
    expect(run(["--help"], { stdout: c.stdout, stderr: c.stderr })).toBe(0);
    expect(c.out).toMatch(/Usage: forge ping/);
  });

  it("rejects extra args", () => {
    const c = capture();
    expect(run(["extra"], { stdout: c.stdout, stderr: c.stderr })).toBe(1);
    expect(c.err).toMatch(/unexpected/);
  });
});
