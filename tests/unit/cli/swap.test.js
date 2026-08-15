import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run, withFirst } from "../../../cli/swap.mjs";

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

describe("cli/swap parseArgv", () => {
  it("parses two selectors", () => {
    expect(parseArgv(["a", "b", "--first"])).toMatchObject({
      selectorA: "a",
      selectorB: "b",
      first: true,
      error: null,
    });
  });

  it("requires two selectors", () => {
    expect(parseArgv(["a"]).error).toMatch(/two selectors/);
  });
});

describe("cli/swap run", () => {
  it("calls Swap with both withFirst args", () => {
    const c = capture();
    const a = withFirst("a", true);
    const b = withFirst("b", true);
    const code = run(["--first", "a", "b"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Swap`);
        expect(cmd).toContain(a);
        expect(cmd).toContain(b);
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
