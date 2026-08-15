import { describe, it, expect } from "vitest";
import {
  BUS_NAME,
  INTERFACE,
  METHOD_IN_ARGS,
  OBJECT_PATH,
  EXIT_GDBUS_MISSING,
  buildGdbusCallArgv,
  callMethod,
  decodePythonStringBody,
  parseGdbusStdout,
} from "../../../cli/dbus.mjs";

describe("cli/dbus METHOD_IN_ARGS", () => {
  it("mirrors Ping arity 0 and GetTree arity 1", () => {
    expect(METHOD_IN_ARGS.Ping).toBe(0);
    expect(METHOD_IN_ARGS.GetTree).toBe(1);
    expect(METHOD_IN_ARGS.Swap).toBe(2);
  });
});

describe("cli/dbus buildGdbusCallArgv", () => {
  it("builds Ping with no string args", () => {
    expect(buildGdbusCallArgv("Ping")).toEqual([
      "gdbus",
      "call",
      "--session",
      "--dest",
      BUS_NAME,
      "--object-path",
      OBJECT_PATH,
      "--method",
      `${INTERFACE}.Ping`,
    ]);
  });

  it("builds GetTree with options JSON", () => {
    const argv = buildGdbusCallArgv("GetTree", ['{"monitor":"0"}']);
    expect(argv[argv.length - 1]).toBe('{"monitor":"0"}');
    expect(argv).toContain(`${INTERFACE}.GetTree`);
  });

  it("pads missing string args with empty string", () => {
    const argv = buildGdbusCallArgv("Swap", ["a"]);
    expect(argv.slice(-2)).toEqual(["a", ""]);
  });

  it("rejects unknown methods", () => {
    expect(() => buildGdbusCallArgv("Nope")).toThrow(/unknown method/);
  });
});

describe("cli/dbus parseGdbusStdout", () => {
  it("parses single-quoted JSON tuple (common gdbus form)", () => {
    const payload = '{"ok":true,"apiVersion":1}';
    expect(parseGdbusStdout(`('${payload}',)`)).toBe(payload);
  });

  it("parses single-quoted with trailing spaces", () => {
    expect(parseGdbusStdout(`( '{"a":1}' , )`)).toBe('{"a":1}');
  });

  it("parses double-quoted JSON string tuple", () => {
    expect(parseGdbusStdout('("{\\"ok\\":true}",)')).toBe('{"ok":true}');
  });

  it("decodes escape sequences in single-quoted body", () => {
    expect(parseGdbusStdout("('line1\\nline2',)")).toBe("line1\nline2");
  });

  it("returns trimmed non-tuple stdout as-is", () => {
    expect(parseGdbusStdout('  {"raw":true}  ')).toBe('{"raw":true}');
  });

  it("decodePythonStringBody handles unicode", () => {
    expect(decodePythonStringBody("\\u0041")).toBe("A");
  });
});

describe("cli/dbus callMethod (injected run)", () => {
  it("returns parsed string from fixture stdout", () => {
    const payload = '{"ok":true}';
    const run = (cmd) => {
      expect(cmd[0]).toMatch(/gdbus$/);
      expect(cmd).toContain("--session");
      expect(cmd).toContain(`${INTERFACE}.Ping`);
      return { stdout: `('${payload}',)\n`, stderr: "", code: 0 };
    };
    expect(
      callMethod("Ping", [], {
        run,
        which: () => "/usr/bin/gdbus",
      })
    ).toBe(payload);
  });

  it("throws on non-zero gdbus exit", () => {
    expect(() =>
      callMethod("Ping", [], {
        run: () => ({ stdout: "", stderr: "No such name", code: 1 }),
        which: () => "/usr/bin/gdbus",
      })
    ).toThrow(/No such name/);
  });

  it("throws exitCode 127 when gdbus missing", () => {
    try {
      callMethod("Ping", [], { which: () => null });
      expect.unreachable();
    } catch (e) {
      expect(e.exitCode).toBe(EXIT_GDBUS_MISSING);
      expect(String(e.message)).toMatch(/gdbus not found/);
    }
  });

  it("passes GetTree options as last arg", () => {
    let seen;
    callMethod("GetTree", ["{}"], {
      run: (cmd) => {
        seen = cmd;
        return { stdout: "('{}',)", stderr: "", code: 0 };
      },
      which: () => "gdbus",
    });
    expect(seen[seen.length - 1]).toBe("{}");
  });
});
