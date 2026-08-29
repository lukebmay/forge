import { describe, expect, it } from "vitest";
import { preferredSplitVsParent } from "../../../lib/rulesets/mark2.js";
import { copySession, mergeTagsOf, sessionOf, toggleMergeTag } from "../../../lib/session/index.js";
import { cloneForest, createForest, dumpForest, makeIdFactory } from "../../../lib/tom/kernel.js";
import { runOpAbstract } from "../../../prototypes/container-motion/src/opsets/transact.mjs";

const GEOMS = [{ id: "mon0", x: 0, y: 0, width: 1920, height: 1080, primary: true }];

function forest() {
  const ids = makeIdFactory(1);
  return createForest(GEOMS, () => ids.nid());
}

describe("Forest session bag", () => {
  it("createForest has no decisions or mergeTags", () => {
    const f = forest();
    expect(f).not.toHaveProperty("decisions");
    expect(f).not.toHaveProperty("mergeTags");
    expect(sessionOf(f).decisions.edgeMove).toBe("wrap");
    expect(mergeTagsOf(f)).toEqual([]);
  });

  it("peels leftover dump fields off the forest object", () => {
    const f = forest();
    /** @type {any} */ (f).decisions = { edgeMove: "pop" };
    /** @type {any} */ (f).mergeTags = ["x"];
    const s = sessionOf(f);
    expect(s.decisions.edgeMove).toBe("pop");
    expect(s.mergeTags).toEqual(["x"]);
    expect(f).not.toHaveProperty("decisions");
    expect(f).not.toHaveProperty("mergeTags");
  });

  it("dumpForest and cloneForest strip leftover keys", () => {
    const f = forest();
    /** @type {any} */ (f).decisions = { edgeMove: "pop" };
    /** @type {any} */ (f).mergeTags = ["x"];
    expect(dumpForest(f).decisions).toBeUndefined();
    expect(dumpForest(f).mergeTags).toBeUndefined();
    const c = cloneForest(f);
    expect(c).not.toHaveProperty("decisions");
    expect(c).not.toHaveProperty("mergeTags");
  });

  it("cloneForest does not copy session; copySession does", () => {
    const f = forest();
    const id = f.monitors[0].id;
    sessionOf(f).decisions.edgeMove = "pop";
    toggleMergeTag(f, id);
    const c = cloneForest(f);
    expect(sessionOf(c).decisions.edgeMove).toBe("wrap");
    expect(mergeTagsOf(c)).toEqual([]);
    copySession(f, c);
    expect(sessionOf(c).decisions.edgeMove).toBe("pop");
    expect(mergeTagsOf(c)).toEqual([id]);
    sessionOf(c).decisions.edgeMove = "noop";
    expect(sessionOf(f).decisions.edgeMove).toBe("pop");
  });

  it("runOpAbstract copies session onto the draft and back", () => {
    const f = forest();
    sessionOf(f).decisions.edgeMove = "pop";
    const r = runOpAbstract(f, {}, (draft) => {
      expect(sessionOf(draft).decisions.edgeMove).toBe("pop");
      sessionOf(draft).decisions.edgeMove = "noop";
      return { ok: true, op: "test" };
    });
    expect(r.ok).toBe(true);
    expect(sessionOf(f).decisions.edgeMove).toBe("noop");
  });
});

describe("RuleSet aspectTieBreak", () => {
  it("takes a string, not Forest.decisions", () => {
    expect(preferredSplitVsParent("HSPLIT")).toBe("VSPLIT");
    expect(preferredSplitVsParent("TABBED", "VSPLIT")).toBe("VSPLIT");
    expect(preferredSplitVsParent("TABBED", "HSPLIT")).toBe("HSPLIT");
  });
});
