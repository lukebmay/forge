import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run, withFirst } from "../../../cli/focus.mjs";

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

describe("cli/focus parseArgv", () => {
  it("parses selector and --first in any order", () => {
    expect(parseArgv(["wm:foo", "--first"])).toMatchObject({
      selector: "wm:foo",
      first: true,
      error: null,
    });
    expect(parseArgv(["--first", "wm:foo"])).toMatchObject({
      selector: "wm:foo",
      first: true,
      error: null,
    });
  });

  it("requires selector", () => {
    expect(parseArgv([]).error).toMatch(/selector required/);
  });

  it("detects help", () => {
    expect(parseArgv(["--help"]).help).toBe(true);
  });
});

describe("cli/focus run", () => {
  it("calls Focus with withFirst selector", () => {
    const c = capture();
    const sel = withFirst("wm:foo", true);
    const code = run(["wm:foo", "--first"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Focus`);
        expect(cmd).toContain(sel);
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

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    expect(
      run(["wm:x"], {
        which: () => null,
        stdout: c.stdout,
        stderr: c.stderr,
      })
    ).toBe(127);
  });

  it("help exits 0", () => {
    const c = capture();
    expect(run(["--help"], { stdout: c.stdout, stderr: c.stderr })).toBe(0);
    expect(c.out).toMatch(/Usage: forge focus/);
  });
});
