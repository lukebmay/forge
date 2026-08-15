import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run } from "../../../cli/settings.mjs";

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

describe("cli/settings parseArgv", () => {
  it("parses save and load", () => {
    expect(parseArgv(["save", "myname"])).toMatchObject({
      action: "save",
      name: "myname",
      error: null,
    });
    expect(parseArgv(["load", "myname"])).toMatchObject({
      action: "load",
      name: "myname",
      error: null,
    });
  });

  it("rejects unknown action", () => {
    expect(parseArgv(["dump", "x"]).error).toMatch(/save or load/);
  });

  it("requires name", () => {
    expect(parseArgv(["save"]).error).toMatch(/name required/);
  });
});

describe("cli/settings run", () => {
  it("calls SettingsSave", () => {
    const c = capture();
    const code = run(["save", "prof"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.SettingsSave`);
        expect(cmd).toContain("prof");
        return {
          stdout: "('{\"ok\":true}',)",
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
  });

  it("calls SettingsLoad", () => {
    const c = capture();
    const code = run(["load", "prof"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.SettingsLoad`);
        return {
          stdout: "('{\"ok\":true}',)",
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
  });

  it("labels bus errors with settings action", () => {
    const c = capture();
    const code = run(["save", "prof"], {
      which: () => "/usr/bin/gdbus",
      run: () => ({ stdout: "", stderr: "nope", code: 1 }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.err).toMatch(/forge settings save: bus call failed/);
  });
});
