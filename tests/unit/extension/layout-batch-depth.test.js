import { describe, it, expect, beforeEach } from "vitest";
import { LayoutBatchDepth } from "../../../lib/extension/layout-batch-depth.js";

describe("LayoutBatchDepth", () => {
  /** @type {LayoutBatchDepth} */
  let b;

  beforeEach(() => {
    b = new LayoutBatchDepth();
  });

  it("starts inactive with zero depth and no latch", () => {
    expect(b.depth).toBe(0);
    expect(b.active).toBe(false);
    expect(b.needsCommit).toBe(false);
    expect(b.snapshot()).toEqual({ depth: 0, needsCommit: false, active: false });
  });

  it("begin nests depth", () => {
    expect(b.begin()).toEqual({ depth: 1 });
    expect(b.begin()).toEqual({ depth: 2 });
    expect(b.active).toBe(true);
    expect(b.depth).toBe(2);
  });

  it("latchCommit only while active", () => {
    b.latchCommit();
    expect(b.needsCommit).toBe(false);
    b.begin();
    b.latchCommit();
    expect(b.needsCommit).toBe(true);
  });

  it("end at depth 0 is no-op wasActive false", () => {
    expect(b.end()).toEqual({ depth: 0, wasActive: false, shouldCommit: false });
  });

  it("nested end only commits when leaving last level with latch", () => {
    b.begin();
    b.begin();
    b.latchCommit();
    expect(b.end()).toEqual({ depth: 1, wasActive: true, shouldCommit: false });
    expect(b.needsCommit).toBe(true);
    expect(b.end()).toEqual({ depth: 0, wasActive: true, shouldCommit: true });
    expect(b.needsCommit).toBe(false);
    expect(b.active).toBe(false);
  });

  it("end without latch yields shouldCommit false", () => {
    b.begin();
    expect(b.end()).toEqual({ depth: 0, wasActive: true, shouldCommit: false });
  });

  it("clearNeedsCommit drops latch mid-batch", () => {
    b.begin();
    b.latchCommit();
    b.clearNeedsCommit();
    expect(b.needsCommit).toBe(false);
    expect(b.end().shouldCommit).toBe(false);
  });

  it("setNeedsCommit forces latch (test/compat)", () => {
    b.setNeedsCommit(true);
    expect(b.needsCommit).toBe(true);
    b.setNeedsCommit(false);
    expect(b.needsCommit).toBe(false);
  });

  it("reset clears depth and latch", () => {
    b.begin();
    b.begin();
    b.latchCommit();
    b.reset();
    expect(b.snapshot()).toEqual({ depth: 0, needsCommit: false, active: false });
  });

  it("unbalanced end after reset stays clamped", () => {
    b.begin();
    b.reset();
    expect(b.end()).toEqual({ depth: 0, wasActive: false, shouldCommit: false });
  });
});
