import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../lib/shared/settings.js", () => ({
  production: false,
}));

import { LOG_LEVELS, init, resetForTests as resetPlog } from "../../../lib/shared/plog-adapter.js";
import {
  ASSERT_FAILED_CODE,
  assert,
  assertEq,
  assertNe,
  assertApplyForestWorkspace,
  assertionFailed,
  clearAssertionFailed,
  isAssertActive,
  resetAssertForTests,
  setAssertActiveForTests,
} from "../../../lib/shared/assert.js";

describe("assert (OH3)", () => {
  let sink;

  beforeEach(() => {
    sink = vi.fn();
    resetPlog();
    resetAssertForTests();
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.DEBUG,
      },
      { sink }
    );
  });

  afterEach(() => {
    resetAssertForTests();
    resetPlog();
  });

  it("is active in dev (!production)", () => {
    expect(isAssertActive()).toBe(true);
  });

  it("passing assert returns true and does not set the flag", () => {
    expect(assert(true, "tree-parent")).toBe(true);
    expect(assertEq(1, 1, "eq")).toBe(true);
    expect(assertNe(1, 2, "ne")).toBe(true);
    expect(assertionFailed()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });

  it("failure logs error with stable code + fields and sets the flag", () => {
    expect(assert(false, "tree-parent", { ws: 1, mon: 0, windowId: 9 })).toBe(false);
    expect(assertionFailed()).toBe(true);
    expect(sink).toHaveBeenCalledTimes(1);
    const args = sink.mock.calls[0];
    expect(args[0]).toBe("[Forge] [ERROR]");
    expect(args[1]).toBe("assert");
    expect(args[2]).toMatchObject({ code: "tree-parent", ws: 1, mon: 0, windowId: 9 });
  });

  it("never throws on failure", () => {
    expect(() => assert(false, "no-throw")).not.toThrow();
    expect(() => assertEq("a", "b", "eq")).not.toThrow();
    expect(() => assertNe(1, 1, "ne")).not.toThrow();
    expect(() => assertApplyForestWorkspace({ monitors: [{ id: "mo0ws1" }] }, 0)).not.toThrow();
  });

  it("flag is readable and clearable", () => {
    assert(false, "x");
    expect(assertionFailed()).toBe(true);
    clearAssertionFailed();
    expect(assertionFailed()).toBe(false);
  });

  it("inactive is a cheap noop: no log, no flag, returns true", () => {
    setAssertActiveForTests(false);
    expect(isAssertActive()).toBe(false);
    expect(assert(false, "tree-parent", { ws: 0 })).toBe(true);
    expect(assertEq(1, 2, "eq")).toBe(true);
    expect(assertNe(1, 1, "ne")).toBe(true);
    expect(assertionFailed()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });

  it("accepts object as codeOrFields", () => {
    assert(false, { code: "dnd-grab-owner", windowId: "w1", slot: "s0" });
    expect(sink.mock.calls[0][2]).toMatchObject({
      code: "dnd-grab-owner",
      windowId: "w1",
      slot: "s0",
    });
  });

  it("assertEq / assertNe compare with Object.is", () => {
    expect(assertEq(0, -0, "z")).toBe(false);
    clearAssertionFailed();
    expect(assertEq(NaN, NaN, "nan")).toBe(true);
    expect(assertNe(0, -0, "z")).toBe(true);
  });

  it("assertApplyForestWorkspace flags cross-ws monitors", () => {
    expect(assertApplyForestWorkspace({ monitors: [{ id: "mo0ws0" }] }, 0)).toBe(true);
    expect(assertionFailed()).toBe(false);
    expect(assertApplyForestWorkspace({ monitors: [{ id: "mo0ws1" }, { id: "mo1ws0" }] }, 0)).toBe(
      false
    );
    expect(assertionFailed()).toBe(true);
    expect(sink.mock.calls.some((c) => c[2]?.code === "apply-ws-filter")).toBe(true);
  });

  it("ASSERT_FAILED_CODE is stable", () => {
    expect(ASSERT_FAILED_CODE).toBe("assert-failed");
  });
});
