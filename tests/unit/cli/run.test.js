import { describe, it, expect, vi } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { parseArgv, run } from "../../../cli/run.mjs";
import { partitionMixedSteps } from "../../../lib/extension/run-steps.js";

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

describe("cli/run parseArgv", () => {
  it("requires file", () => {
    expect(parseArgv([]).error).toMatch(/file required/);
  });

  it("parses file", () => {
    expect(parseArgv(["/tmp/a.json"])).toMatchObject({
      file: "/tmp/a.json",
      error: null,
    });
  });
});

describe("cli/run uses partitionMixedSteps", () => {
  it("chunks like extension tests", () => {
    const chunks = partitionMixedSteps([
      { op: "set", key: "a", value: 1 },
      { op: "launch", app: "x" },
      { op: "wait-window", wmClass: "X" },
      { op: "focus", selector: "class:X" },
    ]);
    expect(chunks.map((c) => [c.kind, c.steps.length])).toEqual([
      ["extension", 1],
      ["cli", 2],
      ["extension", 1],
    ]);
  });
});

describe("cli/run run", () => {
  it("extension-only file → single RunSteps", () => {
    const c = capture();
    const code = run(["/tmp/ext.json"], {
      isFile: () => true,
      readFile: () => JSON.stringify([{ op: "ping" }]),
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.RunSteps`);
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

  it("mixed file runs wait CLI step without spawn", () => {
    const c = capture();
    const payload = {
      steps: [{ op: "wait", ms: 0 }, { op: "ping" }],
      stopOnError: true,
    };
    const code = run(["/tmp/mixed.json"], {
      isFile: () => true,
      readFile: () => JSON.stringify(payload),
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.RunSteps`);
        return {
          stdout: '(\'{"ok":true,"results":[{"ok":true,"op":"ping","index":0}]}\',)',
          stderr: "",
          code: 0,
        };
      },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    const agg = JSON.parse(c.out);
    expect(agg.ok).toBe(true);
    expect(agg.chunks).toHaveLength(2);
    expect(agg.chunks[0].kind).toBe("cli");
    expect(agg.chunks[1].kind).toBe("extension");
  });

  it("missing file exits 1", () => {
    const c = capture();
    expect(
      run(["/no/such/file.json"], {
        isFile: () => false,
        stdout: c.stdout,
        stderr: c.stderr,
      })
    ).toBe(1);
    expect(c.err).toMatch(/not found/);
  });
});
