import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../../../lib/shared/production.js", () => ({
  production: false,
}));

import {
  LOG_LEVELS,
  FORGE_PLOG_LEVELS,
  init,
  resetForTests,
  effectiveLevel,
  info,
  debug,
  trace,
  warn,
  error,
  resolveDefaultLogFile,
  plog,
} from "../../../lib/shared/plog-adapter.js";

describe("plog-adapter", () => {
  let sink;
  /** @type {string | null} */
  let tmpFile;

  beforeEach(() => {
    sink = vi.fn();
    tmpFile = null;
    resetForTests();
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink, file: null }
    );
  });

  afterEach(() => {
    resetForTests();
    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      tmpFile = null;
    }
  });

  it("exports plog namespace + custom level table", () => {
    expect(plog.debug).toBeTypeOf("function");
    expect(plog.LEVELS.DEBUG).toBe(5);
    expect(FORGE_PLOG_LEVELS).toContain("fatal");
    expect(FORGE_PLOG_LEVELS).toContain("all");
  });

  it("debug level: journal silent for debug; info still journals", () => {
    debug("d");
    info("i");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("[Forge] [INFO]", "i");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [DEBUG]", "d");
  });

  it("info level hides debug and trace", () => {
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.INFO,
      },
      { sink, file: null }
    );
    info("i");
    debug("d");
    trace("t");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("[Forge] [INFO]", "i");
  });

  it("logging-enabled false → OFF", () => {
    init(
      {
        get_boolean: () => false,
        get_uint: () => LOG_LEVELS.ALL,
      },
      { sink, file: null }
    );
    expect(effectiveLevel()).toBe(LOG_LEVELS.OFF);
    info("nope");
    expect(sink).not.toHaveBeenCalled();
  });

  it("null settings → DEBUG rem default", () => {
    init(null, { sink, file: null });
    expect(effectiveLevel()).toBe(LOG_LEVELS.DEBUG);
  });

  it("dual-sink: TRACE/DEBUG → file only; INFO+ → file and journal", () => {
    tmpFile = path.join(os.tmpdir(), `forge-plog-dual-${process.pid}-${Date.now()}.log`);
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.TRACE,
      },
      { sink, file: tmpFile }
    );

    trace("hot-path");
    debug("named-problem");
    info("lifecycle");
    warn("soft-miss");
    error("hard-fail");

    expect(sink).toHaveBeenCalledTimes(3);
    expect(sink).toHaveBeenCalledWith("[Forge] [INFO]", "lifecycle");
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "soft-miss");
    expect(sink).toHaveBeenCalledWith("[Forge] [ERROR]", "hard-fail");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [TRACE]", "hot-path");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [DEBUG]", "named-problem");

    const text = fs.readFileSync(tmpFile, "utf8");
    expect(text).toMatch(/TRACE/);
    expect(text).toMatch(/hot-path/);
    expect(text).toMatch(/DEBUG/);
    expect(text).toMatch(/named-problem/);
    expect(text).toMatch(/INFO/);
    expect(text).toMatch(/lifecycle/);
    expect(text).toMatch(/ERROR/);
    expect(text).toMatch(/hard-fail/);
  });

  it("truncateFile:true empties the hunt file on init (session start)", () => {
    tmpFile = path.join(os.tmpdir(), `forge-plog-trunc-${process.pid}-${Date.now()}.log`);
    fs.writeFileSync(tmpFile, "STALE SESSION\n", "utf8");
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink, file: tmpFile, truncateFile: true }
    );
    info("fresh-enable");
    const text = fs.readFileSync(tmpFile, "utf8");
    expect(text).not.toMatch(/STALE SESSION/);
    expect(text).toMatch(/fresh-enable/);
  });

  it("truncateFile omitted leaves prior file contents (CLI share)", () => {
    tmpFile = path.join(os.tmpdir(), `forge-plog-keep-${process.pid}-${Date.now()}.log`);
    fs.writeFileSync(tmpFile, "KEEP ME\n", "utf8");
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink, file: tmpFile }
    );
    info("appended");
    const text = fs.readFileSync(tmpFile, "utf8");
    expect(text).toMatch(/KEEP ME/);
    expect(text).toMatch(/appended/);
  });

  it("resolveDefaultLogFile: FORGE_LOG_FILE, nest sibling, XDG state", () => {
    expect(
      resolveDefaultLogFile({
        envGet: (k) => (k === "FORGE_LOG_FILE" ? "/tmp/custom.log" : undefined),
      })
    ).toBe("/tmp/custom.log");

    expect(
      resolveDefaultLogFile({
        envGet: (k) => (k === "FORGE_CONFIG_HOME" ? "/state/nested/forge/forge-config" : undefined),
        dirname: (p) => p.replace(/\/[^/]+$/, ""),
        pathJoin: (a, b) => `${a}/${b}`,
      })
    ).toBe("/state/nested/forge/forge.log");

    expect(
      resolveDefaultLogFile({
        envGet: (k) => (k === "XDG_STATE_HOME" ? "/xdg/state" : undefined),
        pathJoin: (a, b) => `${a}/${b}`,
      })
    ).toBe("/xdg/state/forge/forge.log");
  });
});
