import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run, loadStepsPayload } from "../../../cli/run-steps.mjs";

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

describe("cli/run-steps parseArgv", () => {
  it("accepts JSON positional", () => {
    expect(parseArgv(['[{"op":"ping"}]'])).toMatchObject({
      jsonArg: '[{"op":"ping"}]',
      error: null,
    });
  });

  it("accepts --file", () => {
    expect(parseArgv(["--file", "/tmp/x.json"])).toMatchObject({
      file: "/tmp/x.json",
      error: null,
    });
  });

  it("requires payload", () => {
    expect(parseArgv([]).error).toMatch(/provide JSON/);
  });
});

describe("cli/run-steps run", () => {
  it("rejects CLI-only launch op", () => {
    const c = capture();
    const code = run([JSON.stringify([{ op: "launch", app: "x" }])], {
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.err).toMatch(/CLI-only/);
  });

  it("calls RunSteps for extension payload", () => {
    const c = capture();
    const payload = [{ op: "ping" }];
    const code = run([JSON.stringify(payload)], {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.RunSteps`);
        expect(cmd.some((a) => String(a).includes("ping"))).toBe(true);
        return {
          stdout: '(\'{"ok":true,"results":[{"ok":true,"op":"ping"}]}\',)',
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.out)).toMatchObject({ ok: true });
  });

  it("reads --file", () => {
    const c = capture();
    const code = run(["--file", "/tmp/steps.json"], {
      isFile: () => true,
      readFile: () => JSON.stringify([{ op: "ping" }]),
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: "('{\"ok\":true}',)",
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
  });

  it("loadStepsPayload rejects bad JSON", () => {
    expect(() => loadStepsPayload("{")).toThrow(/invalid JSON/);
  });
});
