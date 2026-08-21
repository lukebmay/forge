import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../lib/shared/settings.js", () => ({
  production: false,
}));

import {
  LOG_LEVELS,
  init,
  resetForTests,
  effectiveLevel,
  info,
  debug,
  trace,
  plog,
} from "../../../lib/shared/plog-adapter.js";

describe("plog-adapter", () => {
  let sink;

  beforeEach(() => {
    sink = vi.fn();
    resetForTests();
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink }
    );
  });

  afterEach(() => {
    resetForTests();
  });

  it("exports plog namespace", () => {
    expect(plog.debug).toBeTypeOf("function");
    expect(plog.LEVELS.DEBUG).toBe(5);
  });

  it("debug level emits debug but not trace", () => {
    debug("d");
    trace("t");
    expect(sink).toHaveBeenCalledWith("[Forge] [DEBUG]", "d");
    expect(sink).not.toHaveBeenCalledWith("[Forge] [TRACE]", "t");
  });

  it("info level hides debug and trace", () => {
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.INFO,
      },
      { sink }
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
      { sink }
    );
    expect(effectiveLevel()).toBe(LOG_LEVELS.OFF);
    info("nope");
    expect(sink).not.toHaveBeenCalled();
  });

  it("null settings → DEBUG rem default", () => {
    init(null, { sink });
    expect(effectiveLevel()).toBe(LOG_LEVELS.DEBUG);
  });
});
