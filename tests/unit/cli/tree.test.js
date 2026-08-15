import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { buildTreeOptions, formatJson, parseArgv, run } from "../../../cli/tree.mjs";

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

describe("cli/tree parseArgv", () => {
  it("parses --monitor= form", () => {
    const o = parseArgv(["--monitor=mo0ws0", "--compact"]);
    expect(o.monitor).toBe("mo0ws0");
    expect(o.compact).toBe(true);
    expect(o.error).toBeNull();
  });

  it("parses spaced --monitor / --workspace / --max-depth", () => {
    const o = parseArgv(["--monitor", "0", "--workspace", "1", "--max-depth", "2"]);
    expect(o.monitor).toBe("0");
    expect(o.workspace).toBe(1);
    expect(o.maxDepth).toBe(2);
  });

  it("errors on unknown flag", () => {
    expect(parseArgv(["--nope"]).error).toMatch(/unexpected/);
  });
});

describe("cli/tree buildTreeOptions", () => {
  it("uses maxDepth camelCase like Python", () => {
    expect(buildTreeOptions({ monitor: "0", workspace: 1, maxDepth: 3 })).toEqual({
      monitor: "0",
      workspace: 1,
      maxDepth: 3,
    });
  });

  it("omits unset keys", () => {
    expect(buildTreeOptions({ monitor: null, workspace: null, maxDepth: null })).toEqual({});
  });
});

describe("cli/tree formatJson", () => {
  it("compact is single-line", () => {
    const s = formatJson({ a: 1, b: 2 }, true);
    expect(s).toBe('{"a":1,"b":2}');
    expect(s.includes("\n")).toBe(false);
  });

  it("pretty uses indent 2", () => {
    expect(formatJson({ a: 1 }, false)).toBe('{\n  "a": 1\n}');
  });
});

describe("cli/tree run (mocked gdbus)", () => {
  it("pretty-prints forest by default", () => {
    const c = capture();
    const forest = { monitors: [], activeWorkspace: 0 };
    const code = run([], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.GetTree`);
        expect(cmd[cmd.length - 1]).toBe("{}");
        return {
          stdout: `('${JSON.stringify(forest)}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.out)).toEqual(forest);
    expect(c.out).toContain("\n  ");
  });

  it("sends filter options JSON and compact output", () => {
    const c = capture();
    let optionsArg;
    const forest = { monitors: [{ id: 0 }] };
    const code = run(["--monitor=0", "--workspace=1", "--compact"], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        optionsArg = cmd[cmd.length - 1];
        return {
          stdout: `('${JSON.stringify(forest)}',)`,
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(optionsArg)).toEqual({
      monitor: "0",
      workspace: 1,
    });
    expect(c.out.trim()).toBe(JSON.stringify(forest));
  });

  it("prints error JSON and exits 1", () => {
    const c = capture();
    const payload = { error: "bad filter" };
    const code = run(["--compact"], {
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: `('${JSON.stringify(payload)}',)`,
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.err).toMatch(/bad filter/);
    expect(JSON.parse(c.out.trim())).toEqual(payload);
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
    expect(c.out).toMatch(/Usage: forge tree/);
    expect(c.out).toMatch(/--compact/);
  });
});
