import { describe, it, expect } from "vitest";
import { pickFocusAfterClose } from "../../../lib/extension/focus-after-close.js";

describe("pickFocusAfterClose (FC0)", () => {
  it("returns null for empty / missing closedId", () => {
    expect(pickFocusAfterClose(null)).toBeNull();
    expect(pickFocusAfterClose({})).toBeNull();
    expect(pickFocusAfterClose({ closedId: null, siblingIds: [1] })).toBeNull();
  });

  it("prefers LFT survivor over later sibling", () => {
    // Children A B C; close C; LFT is A; next sibling would be none → prev B
    // but LFT A wins.
    const pick = pickFocusAfterClose({
      closedId: "C",
      preCloseChildIds: ["A", "B", "C"],
      siblingIds: ["A", "B"],
      lftMruIds: ["A", "B"],
      workspaceCandidateIds: ["A", "B", "X"],
    });
    expect(pick).toEqual({ id: "A", reason: "lft-mru" });
  });

  it("LFT on other mon (workspace candidate) beats sibling", () => {
    const pick = pickFocusAfterClose({
      closedId: "C",
      preCloseChildIds: ["B", "C"],
      siblingIds: ["B"],
      lftMruIds: ["X", "B"],
      workspaceCandidateIds: ["B", "X"],
    });
    expect(pick).toEqual({ id: "X", reason: "lft-mru" });
  });

  it("ignores LFT when id is not a survivor", () => {
    const pick = pickFocusAfterClose({
      closedId: "C",
      preCloseChildIds: ["A", "B", "C"],
      siblingIds: ["A", "B"],
      lftMruIds: ["gone", "closed-ghost"],
      workspaceCandidateIds: ["A", "B"],
    });
    // next sibling after C — none; prev = B
    expect(pick).toEqual({ id: "B", reason: "prev-sibling" });
  });

  it("next sibling when no usable LFT", () => {
    const pick = pickFocusAfterClose({
      closedId: "B",
      preCloseChildIds: ["A", "B", "C"],
      siblingIds: ["A", "C"],
      lftMruIds: [],
      workspaceCandidateIds: ["A", "C"],
    });
    expect(pick).toEqual({ id: "C", reason: "next-sibling" });
  });

  it("previous sibling when no next", () => {
    const pick = pickFocusAfterClose({
      closedId: "C",
      preCloseChildIds: ["A", "B", "C"],
      siblingIds: ["A", "B"],
      lftMruIds: [],
    });
    expect(pick).toEqual({ id: "B", reason: "prev-sibling" });
  });

  it("sole survivor (collapse) → that window", () => {
    const pick = pickFocusAfterClose({
      closedId: "A",
      preCloseChildIds: ["A", "B"],
      siblingIds: ["B"],
      lftMruIds: ["A"], // closed — must ignore
      workspaceCandidateIds: ["B"],
    });
    // LFT only had closed id; next after A is B
    expect(pick).toEqual({ id: "B", reason: "next-sibling" });
  });

  it("sole survivor via sibling fallback without preClose list", () => {
    const pick = pickFocusAfterClose({
      closedId: "A",
      siblingIds: ["B"],
    });
    expect(pick).toEqual({ id: "B", reason: "sibling" });
  });

  it("no siblings → first workspace NORMAL candidate", () => {
    const pick = pickFocusAfterClose({
      closedId: "A",
      siblingIds: [],
      preCloseChildIds: ["A"],
      lftMruIds: [],
      workspaceCandidateIds: ["W1", "W2"],
    });
    expect(pick).toEqual({ id: "W1", reason: "workspace" });
  });

  it("excludes closed id from all lists", () => {
    const pick = pickFocusAfterClose({
      closedId: 10,
      siblingIds: [10, 20],
      preCloseChildIds: [10, 20],
      lftMruIds: [10, 20],
      workspaceCandidateIds: [10, 20, 30],
    });
    expect(pick).toEqual({ id: 20, reason: "lft-mru" });
  });

  it("string/number id equality", () => {
    const pick = pickFocusAfterClose({
      closedId: 5,
      siblingIds: ["6"],
      preCloseChildIds: ["5", "6"],
      lftMruIds: [],
    });
    expect(pick).toEqual({ id: "6", reason: "next-sibling" });
  });

  it("returns null when nothing remains", () => {
    expect(
      pickFocusAfterClose({
        closedId: "only",
        siblingIds: [],
        workspaceCandidateIds: [],
        lftMruIds: ["only"],
      })
    ).toBeNull();
  });
});
