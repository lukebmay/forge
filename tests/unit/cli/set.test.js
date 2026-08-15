import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run } from "../../../cli/set.mjs";

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

describe("cli/set parseArgv", () => {
  it("joins multi-token values", () => {
    // nargs="+" join; quoted dashed values arrive as one token (like Python)
    expect(parseArgv(["window-gap-size", "8"])).toMatchObject({
      key: "window-gap-size",
      value: "8",
      error: null,
    });
    expect(parseArgv(["some-key", "hello", "world"])).toMatchObject({
      key: "some-key",
      value: "hello world",
      error: null,
    });
    expect(parseArgv(["launch-app-command", "guake -t"])).toMatchObject({
      key: "launch-app-command",
      value: "guake -t",
      error: null,
    });
  });

  it("requires value", () => {
    expect(parseArgv(["key"]).error).toMatch(/value required/);
  });
});

describe("cli/set run", () => {
  it("calls SetSetting with joined value", () => {
    const c = capture();
    const code = run(["tiling-mode-enabled", "true"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.SetSetting`);
        expect(cmd).toContain("tiling-mode-enabled");
        expect(cmd).toContain("true");
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
});
