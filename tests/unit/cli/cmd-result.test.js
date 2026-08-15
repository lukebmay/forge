import { describe, it, expect } from "vitest";
import { INTERFACE } from "../../../cli/dbus.mjs";
import { cmdResult, formatJson, withFirst } from "../../../cli/cmd-result.mjs";

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

describe("withFirst", () => {
  it("passes selector through when first is false", () => {
    expect(withFirst("wm:foo", false)).toBe("wm:foo");
    expect(withFirst('{"selector":"x"}', false)).toBe('{"selector":"x"}');
  });

  it("wraps plain selector when first is true", () => {
    expect(JSON.parse(withFirst("wm:foo", true))).toEqual({
      selector: "wm:foo",
      first: true,
    });
  });

  it("merges first into JSON object selector", () => {
    const out = withFirst('{"selector":"wm:bar","other":1}', true);
    expect(JSON.parse(out)).toEqual({
      selector: "wm:bar",
      other: 1,
      first: true,
    });
  });

  it("wraps invalid JSON object-looking string", () => {
    const raw = "{not-json";
    expect(JSON.parse(withFirst(raw, true))).toEqual({
      selector: raw,
      first: true,
    });
  });

  it("uses original selector (not stripped) in wrap", () => {
    const raw = "  spaced  ";
    // strip only for { detection; wrap keeps original
    expect(JSON.parse(withFirst(raw, true))).toEqual({
      selector: raw,
      first: true,
    });
  });
});

describe("cmdResult", () => {
  it("pretty-prints success with ok true", () => {
    const c = capture();
    const payload = { ok: true, focused: "w1" };
    const code = cmdResult("Focus", ["wm:x"], "focus", {
      which: () => "/usr/bin/gdbus",
      run: (cmd) => {
        expect(cmd).toContain(`${INTERFACE}.Focus`);
        expect(cmd).toContain("wm:x");
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
    expect(c.out).toBe(formatJson(payload, false) + "\n");
  });

  it("exits 1 when ok is false", () => {
    const c = capture();
    const code = cmdResult("Focus", ["x"], "focus", {
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: '(\'{"ok":false,"results":[]}\',)',
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
  });

  it("prints error + candidates subset and exits 1", () => {
    const c = capture();
    const payload = {
      error: "ambiguous",
      candidates: ["a", "b"],
      extra: "ignored-on-stdout",
    };
    const code = cmdResult("Focus", ["x"], "focus", {
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
    expect(c.err).toMatch(/forge focus: ambiguous/);
    expect(JSON.parse(c.out)).toEqual({
      error: "ambiguous",
      candidates: ["a", "b"],
    });
  });

  it("prints full dict on error with which", () => {
    const c = capture();
    const payload = { error: "not found", which: "wm:nope" };
    const code = cmdResult("Focus", ["x"], "focus", {
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
    expect(JSON.parse(c.out)).toEqual(payload);
  });

  it("prints raw and exits 1 on invalid JSON", () => {
    const c = capture();
    const code = cmdResult("GetSetting", ["k"], "get", {
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: "('not-json',)",
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.out.trim()).toBe("not-json");
  });

  it("exits 1 on bus failure", () => {
    const c = capture();
    const code = cmdResult("Focus", ["x"], "focus", {
      which: () => "/usr/bin/gdbus",
      run: () => ({ stdout: "", stderr: "timeout", code: 1 }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(1);
    expect(c.err).toMatch(/bus call failed/);
  });

  it("exits 127 when gdbus missing", () => {
    const c = capture();
    const code = cmdResult("Focus", ["x"], "focus", {
      which: () => null,
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(127);
    expect(c.err).toMatch(/gdbus not found/);
  });

  it("exits 0 for dict without ok or error", () => {
    const c = capture();
    const payload = { key: "tiling-mode-enabled", value: true };
    const code = cmdResult("GetSetting", ["tiling-mode-enabled"], "get", {
      which: () => "/usr/bin/gdbus",
      run: () => ({
        stdout: `('${JSON.stringify(payload)}',)`,
        stderr: "",
        code: 0,
      }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.out)).toEqual(payload);
  });
});
