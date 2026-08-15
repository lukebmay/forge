import { describe, it, expect, vi } from "vitest";
import { parseArgv, run } from "../../../cli/launch.mjs";
import {
  classEq,
  ghosttyMultiInstanceArgv,
  isGhosttyLaunchTarget,
  mergeLaunchWaitClasses,
  preferLaunchPlaceClass,
  shellJoin,
  shellSplit,
  GHOSTTY_MULTI_INSTANCE_FLAG,
} from "../../../cli/launch-lib.mjs";

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

describe("cli/launch parseArgv", () => {
  it("parses app and flags", () => {
    expect(parseArgv(["nautilus", "--path=mo0ws0", "--no-wait", "--first"])).toMatchObject({
      app: "nautilus",
      treePath: "mo0ws0",
      noWait: true,
      first: true,
      error: null,
    });
  });

  it("requires app", () => {
    expect(parseArgv([]).error).toMatch(/app required/);
  });

  it("help", () => {
    expect(parseArgv(["--help"]).help).toBe(true);
  });
});

describe("cli/launch-lib pure helpers", () => {
  it("classEq reverse-DNS and chrome family", () => {
    expect(classEq("ghostty", "com.mitchellh.ghostty")).toBe(true);
    expect(classEq("Google-chrome", "chrome-aaa-Default")).toBe(true);
    expect(classEq("chrome-aaa-Default", "chrome-bbb-Default")).toBe(false);
  });

  it("ghostty multi-instance flag", () => {
    expect(isGhosttyLaunchTarget("ghostty")).toBe(true);
    const argv = ghosttyMultiInstanceArgv("ghostty");
    expect(argv).toContain(GHOSTTY_MULTI_INSTANCE_FLAG);
    expect(shellJoin(argv)).toContain("--gtk-single-instance=false");
  });

  it("merge wait classes keeps PWA forms", () => {
    const wait = mergeLaunchWaitClasses("Google-chrome", ["chrome-id-Default", "crx_id"]);
    expect(wait[0]).toBe("chrome-id-Default");
    expect(wait).toContain("Google-chrome");
  });

  it("prefer place class prefers chrome-*-Default", () => {
    expect(preferLaunchPlaceClass("Google-chrome", ["crx_id", "chrome-id-Default"])).toBe(
      "chrome-id-Default"
    );
  });

  it("shellSplit handles simple quotes", () => {
    expect(shellSplit(`ghostty --title='hi there'`)).toEqual(["ghostty", "--title=hi there"]);
  });
});

describe("cli/launch run", () => {
  it("no-wait spawns PATH binary when no desktop", () => {
    const c = capture();
    const spawn = vi.fn((_cmd, _args, _opts) => ({ pid: 4242, unref: () => {} }));
    const code = run(["true", "--no-wait"], {
      whichBin: (cmd) => (cmd === "true" ? "/usr/bin/true" : null),
      spawn,
      env: { ...process.env, XDG_DATA_DIRS: "/nonexistent-xdg", HOME: "/tmp" },
      run: () => ({ stdout: "", stderr: "", code: 1 }),
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("true");
    const payload = JSON.parse(c.out);
    expect(payload).toMatchObject({ ok: true, waited: false, app: "true" });
  });

  it("ghostty no-wait uses multi-instance flag", () => {
    const c = capture();
    const spawn = vi.fn((_cmd, args) => {
      expect(args).toContain(GHOSTTY_MULTI_INSTANCE_FLAG);
      return { pid: 99, unref: () => {} };
    });
    const code = run(["ghostty", "--no-wait"], {
      whichBin: (cmd) => (cmd === "ghostty" ? "/usr/bin/ghostty" : null),
      spawn,
      env: { ...process.env, XDG_DATA_DIRS: "/nonexistent-xdg", HOME: "/tmp" },
      stdout: c.stdout,
      stderr: c.stderr,
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalled();
  });

  it("help exits 0", () => {
    const c = capture();
    expect(run(["--help"], { stdout: c.stdout, stderr: c.stderr })).toBe(0);
    expect(c.out).toMatch(/Usage: forge launch/);
  });

  it("missing app exits 1", () => {
    const c = capture();
    expect(run([], { stdout: c.stdout, stderr: c.stderr })).toBe(1);
    expect(c.err).toMatch(/app required/);
  });
});
