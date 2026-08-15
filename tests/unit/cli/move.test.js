import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run, withFirst } from "../../../cli/move.mjs";

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

describe("cli/move parseArgv", () => {
  it("parses tile and dest", () => {
    expect(parseArgv(["tile", "dest"])).toMatchObject({
      tile: "tile",
      dest: "dest",
      first: false,
      error: null,
    });
  });
});

describe("cli/move run", () => {
  it("calls Move", () => {
    const c = capture();
    const tile = withFirst("t", false);
    const dest = withFirst("d", false);
    const code = run(["t", "d"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Move`);
        expect(cmd).toContain(tile);
        expect(cmd).toContain(dest);
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
