import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { setProductionForTests } from "../../../lib/shared/production.js";
import {
  LOG_LEVELS,
  FORGE_PLOG_LEVELS,
  init,
  resetForTests,
  effectiveLevel,
  durableLevel,
  sessionLevel,
  setSessionLevel,
  clearSessionLevel,
  getLogStatus,
  parseLevelName,
  info,
  debug,
  trace,
  warn,
  error,
  resolveDefaultLogFile,
  siblingJsonlPath,
  resolveJsonlFile,
  peelTrailingFields,
  formatFieldsSuffix,
  plog,
} from "../../../lib/shared/plog-adapter.js";

describe("plog-adapter", () => {
  let sink;
  /** @type {string | null} */
  let tmpFile;
  /** @type {string | undefined} */
  let prevJsonlEnv;

  beforeEach(() => {
    sink = vi.fn();
    tmpFile = null;
    prevJsonlEnv = process.env.FORGE_LOG_JSONL;
    setProductionForTests(false);
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
    setProductionForTests(false);
    resetForTests();
    if (prevJsonlEnv === undefined) delete process.env.FORGE_LOG_JSONL;
    else process.env.FORGE_LOG_JSONL = prevJsonlEnv;
    if (tmpFile) {
      for (const p of [tmpFile, siblingJsonlPath(tmpFile)]) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
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

  it("debug level: journal silent for debug and info; warn still journals", () => {
    debug("d");
    info("i");
    warn("w");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "w");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [INFO]", "i");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [DEBUG]", "d");
  });

  it("info level hides debug and trace; info does not journal", () => {
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
    warn("w");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "w");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [INFO]", "i");
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

  it("production=true does not force OFF; respects logging-enabled + log-level", () => {
    setProductionForTests(true);
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.INFO,
      },
      { sink, file: null }
    );
    expect(durableLevel()).toBe(LOG_LEVELS.INFO);
    expect(effectiveLevel()).toBe(LOG_LEVELS.INFO);
    expect(getLogStatus().durable.enabled).toBe(true);

    info("prod-info");
    warn("prod-warn");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "prod-warn");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [INFO]", "prod-info");
  });

  it("dual-sink: TRACE/DEBUG/INFO → file only; WARN/ERROR → file and journal", () => {
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

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "soft-miss");
    expect(sink).toHaveBeenCalledWith("[Forge] [ERROR]", "hard-fail");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [INFO]", "lifecycle");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [TRACE]", "hot-path");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [DEBUG]", "named-problem");

    const text = fs.readFileSync(tmpFile, "utf8");
    expect(text).toMatch(/TRACE/);
    expect(text).toMatch(/hot-path/);
    expect(text).toMatch(/DEBUG/);
    expect(text).toMatch(/named-problem/);
    expect(text).toMatch(/INFO/);
    expect(text).toMatch(/lifecycle/);
    expect(text).toMatch(/WARN/);
    expect(text).toMatch(/soft-miss/);
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

  it("parseLevelName accepts names and digits", () => {
    expect(parseLevelName("trace")).toMatchObject({ ok: true, num: 6, name: "TRACE" });
    expect(parseLevelName("5")).toMatchObject({ ok: true, num: 5 });
    expect(parseLevelName("nope").ok).toBe(false);
  });

  it("session override wins over durable until clear", () => {
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink, file: null }
    );
    expect(durableLevel()).toBe(LOG_LEVELS.DEBUG);
    expect(sessionLevel()).toBeNull();

    setSessionLevel(LOG_LEVELS.TRACE);
    expect(sessionLevel()).toBe(LOG_LEVELS.TRACE);
    expect(effectiveLevel()).toBe(LOG_LEVELS.TRACE);
    expect(durableLevel()).toBe(LOG_LEVELS.DEBUG);

    trace("session-hot");
    // journal is WARN+ only; TRACE is gated by shouldEmit and file may be null
    expect(sink).not.toHaveBeenCalledWith("[Forge] [TRACE]", "session-hot");

    clearSessionLevel();
    expect(sessionLevel()).toBeNull();
    expect(effectiveLevel()).toBe(LOG_LEVELS.DEBUG);
    expect(getLogStatus().session).toBeNull();
  });

  it("changed::log-level reconnects plog min without reload", () => {
    /** @type {Record<string, Function[]>} */
    const handlers = {};
    let level = LOG_LEVELS.INFO;
    init(
      {
        get_boolean: () => true,
        get_uint: () => level,
        connect: (sig, cb) => {
          (handlers[sig] ||= []).push(cb);
          return Object.keys(handlers).length;
        },
        disconnect: () => {},
      },
      { sink, file: null }
    );

    debug("hidden-at-info");
    expect(sink).not.toHaveBeenCalled();

    level = LOG_LEVELS.DEBUG;
    for (const cb of handlers["changed::log-level"] || []) cb();

    debug("visible-after-reconfigure");
    // DEBUG/INFO do not journal; prove via warn
    warn("visible-warn");
    expect(sink).toHaveBeenCalledWith("[Forge] [WARN]", "visible-warn");

    expect(plog.isDebugEnabled()).toBe(true);
    expect(effectiveLevel()).toBe(LOG_LEVELS.DEBUG);
  });

  it("init clears prior session override", () => {
    setSessionLevel(LOG_LEVELS.TRACE);
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.INFO,
      },
      { sink, file: null }
    );
    expect(sessionLevel()).toBeNull();
    expect(effectiveLevel()).toBe(LOG_LEVELS.INFO);
  });

  it("resolveJsonlFile defaults on beside hunt file; FORGE_LOG_JSONL=0 disables", () => {
    expect(siblingJsonlPath("/tmp/forge.log")).toBe("/tmp/forge.jsonl");
    expect(
      resolveJsonlFile("/tmp/forge.log", {
        envGet: () => undefined,
        pathJoin: (a, b) => `${a}/${b}`,
        dirname: (p) => p.replace(/\/[^/]+$/, "") || "/",
      })
    ).toBe("/tmp/forge.jsonl");
    expect(
      resolveJsonlFile("/tmp/forge.log", {
        envGet: (k) => (k === "FORGE_LOG_JSONL" ? "0" : undefined),
      })
    ).toBeNull();
    expect(
      resolveJsonlFile("/tmp/forge.log", {
        envGet: (k) => (k === "FORGE_LOG_JSONL" ? "/var/forge.jsonl" : undefined),
      })
    ).toBe("/var/forge.jsonl");
  });

  it("dual-tape: info fields land in JSONL payload; warn fields flatten into journal", () => {
    tmpFile = path.join(os.tmpdir(), `forge-plog-jsonl-${process.pid}-${Date.now()}.log`);
    delete process.env.FORGE_LOG_JSONL;
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.TRACE,
      },
      { sink, file: tmpFile }
    );

    info("layout-apply start", { fields: { applyId: "a1", ws: 2 } });
    warn("soft-miss", { fields: { slotId: "s1", mon: 0 } });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]).toEqual(["[Forge] [WARN]", "soft-miss", "slotId=s1 mon=0"]);

    const jsonlPath = siblingJsonlPath(tmpFile);
    expect(getLogStatus().jsonl).toBe(jsonlPath);
    const lines = fs
      .readFileSync(jsonlPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const infoRow = lines.find((r) => r.level === "info");
    const warnRow = lines.find((r) => r.level === "warn");
    expect(infoRow?.text).toBe("layout-apply start");
    expect(infoRow?.payload).toEqual({ applyId: "a1", ws: 2 });
    expect(warnRow?.text).toMatch(/soft-miss/);
    expect(warnRow?.text).toMatch(/slotId=s1/);
    // warn flattened — no structured payload
    expect(warnRow?.payload).toEqual({});

    const peeled = peelTrailingFields(["msg", { fields: { a: 1 } }]);
    expect(peeled).toEqual({ messageArgs: ["msg"], fields: { a: 1 } });
    expect(formatFieldsSuffix({ a: 1, b: "x" })).toBe("a=1 b=x");
  });

  it("truncateFile:true empties both .log and .jsonl", () => {
    tmpFile = path.join(os.tmpdir(), `forge-plog-both-${process.pid}-${Date.now()}.log`);
    const jsonlPath = siblingJsonlPath(tmpFile);
    fs.writeFileSync(tmpFile, "STALE LOG\n", "utf8");
    fs.writeFileSync(jsonlPath, '{"v":1,"text":"STALE JSONL"}\n', "utf8");
    delete process.env.FORGE_LOG_JSONL;
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink, file: tmpFile, truncateFile: true }
    );
    info("fresh", { fields: { n: 1 } });
    expect(fs.readFileSync(tmpFile, "utf8")).not.toMatch(/STALE LOG/);
    expect(fs.readFileSync(jsonlPath, "utf8")).not.toMatch(/STALE JSONL/);
    expect(fs.readFileSync(jsonlPath, "utf8")).toMatch(/fresh/);
  });
});
