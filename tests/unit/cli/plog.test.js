import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseForgeLogLevel,
  initForgePlog,
  resetForgePlogForTests,
  forgeLog,
} from "../../../cli/plog.mjs";

describe("parseForgeLogLevel", () => {
  it("defaults to warn", () => {
    expect(parseForgeLogLevel({})).toBe("warn");
  });

  it("reads FORGE_LOG_LEVEL names", () => {
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "debug" })).toBe("debug");
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "TRACE" })).toBe("trace");
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "off" })).toBe("off");
  });

  it("maps gsettings-style numeric levels", () => {
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "4" })).toBe("info");
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "5" })).toBe("debug");
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "6" })).toBe("trace");
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "0" })).toBe("off");
  });

  it("verbose / FORGE_LOG_DEBUG → debug", () => {
    expect(parseForgeLogLevel({}, { verbose: true })).toBe("debug");
    expect(parseForgeLogLevel({ FORGE_LOG_DEBUG: "1" })).toBe("debug");
    expect(parseForgeLogLevel({ FORGE_VERBOSE: "1" })).toBe("debug");
  });

  it("invalid names fall back to warn", () => {
    expect(parseForgeLogLevel({ FORGE_LOG_LEVEL: "nope" })).toBe("warn");
  });
});

describe("initForgePlog", () => {
  let tmp;
  const saved = {};

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forge-plog-"));
    for (const k of [
      "FORGE_LOG_LEVEL",
      "FORGE_LOG_TEE",
      "FORGE_LOG_FILE",
      "P_LOG_LEVEL",
      "P_LOG_TEE",
      "P_LOG_FILE",
      "P_LOG_SESSION_ID",
      "P_LOG_SESSION_COLOR_FG",
      "P_LOG_SESSION_COLOR_BG",
    ]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    resetForgePlogForTests();
  });

  afterEach(() => {
    resetForgePlogForTests();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("debug emits, warn hides debug/trace (file sink)", () => {
    const file = path.join(tmp, "cli.log");
    initForgePlog({
      env: { FORGE_LOG_LEVEL: "debug" },
      file,
      tee: "none",
      sessionId: "test1",
      now: () => "2026-08-21_00:00:00",
    });
    forgeLog.debug("dbg-line");
    forgeLog.trace("trc-line");
    const body = fs.readFileSync(file, "utf8");
    expect(body).toContain("dbg-line");
    expect(body).not.toContain("trc-line");
  });

  it("warn default hides debug", () => {
    const file = path.join(tmp, "cli.log");
    initForgePlog({
      env: {},
      file,
      tee: "none",
      sessionId: "test1",
      now: () => "2026-08-21_00:00:00",
    });
    forgeLog.debug("secret-debug");
    forgeLog.warn("visible-warn");
    const body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    expect(body).not.toContain("secret-debug");
    expect(body).toContain("visible-warn");
  });

  it("off is quiet", () => {
    const file = path.join(tmp, "cli.log");
    initForgePlog({
      env: { FORGE_LOG_LEVEL: "off" },
      file,
      tee: "none",
      sessionId: "test1",
    });
    forgeLog.error("nope");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("does not throw on invalid tee", () => {
    expect(() =>
      initForgePlog({
        env: { FORGE_LOG_TEE: "not-a-tee" },
        file: null,
        tee: "bogus",
        sessionId: "test1",
      })
    ).not.toThrow();
  });
});
