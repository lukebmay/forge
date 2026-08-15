import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run } from "../../../cli/get.mjs";

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

describe("cli/get parseArgv", () => {
  it("parses key", () => {
    expect(parseArgv(["tiling-mode-enabled"])).toMatchObject({
      key: "tiling-mode-enabled",
      error: null,
    });
  });

  it("requires key", () => {
    expect(parseArgv([]).error).toMatch(/key required/);
  });
});

describe("cli/get run", () => {
  it("calls GetSetting", () => {
    const c = capture();
    const payload = { key: "tiling-mode-enabled", value: true };
    const code = run(["tiling-mode-enabled"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.GetSetting`);
        expect(cmd).toContain("tiling-mode-enabled");
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
  });

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    expect(
      run(["k"], {
        which: () => null,
        stdout: c.stdout,
        stderr: c.stderr,
      })
    ).toBe(127);
  });
});
