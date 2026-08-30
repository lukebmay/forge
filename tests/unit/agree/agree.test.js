import { describe, expect, it } from "vitest";
import { DRIFT, agree } from "../../../lib/agree/index.js";
import { settleForest } from "../../../lib/rulesets/mark2.js";
import { moveWindowToFloats } from "../../../lib/tom/index.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

/**
 * @param {Record<string, { id: string }>} byLabel
 * @param {Record<string, object>} [byId]
 */
function tiledFacts(byLabel, byId = {}) {
  /** @type {Record<string, object>} */
  const windows = {};
  for (const n of Object.values(byLabel)) {
    windows[n.id] = {
      exists: true,
      floating: false,
      monitorId: "Mon1",
      mins: { width: 100, height: 100 },
      ...byId[n.id],
    };
  }
  return { windows };
}

/** @param {{ kind: string, id: string }[]} drifts @param {string} kind */
function kinds(drifts, kind) {
  return drifts.filter((d) => d.kind === kind);
}

describe("agree(forest, facts)", () => {
  it("AGREEs when facts match Mon1(H(A,B))", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(f, tiledFacts(byLabel));
    expect(r.ok).toBe(true);
    expect(r.drifts).toEqual([]);
  });

  it("AGREEs on existence-only facts (float/mon/mins omitted)", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(f, {
      windows: {
        [byLabel.A.id]: { exists: true },
        [byLabel.B.id]: { exists: true },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.drifts).toEqual([]);
  });

  it("missing-host when A is omitted from facts", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const facts = tiledFacts(byLabel);
    delete facts.windows[byLabel.A.id];
    const r = agree(f, facts);
    expect(r.ok).toBe(false);
    expect(kinds(r.drifts, DRIFT.MISSING_HOST).map((d) => d.id)).toEqual([byLabel.A.id]);
  });

  it("missing-host when A exists:false", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(f, tiledFacts(byLabel, { [byLabel.A.id]: { exists: false } }));
    expect(r.ok).toBe(false);
    const miss = kinds(r.drifts, DRIFT.MISSING_HOST);
    expect(miss).toHaveLength(1);
    expect(miss[0].id).toBe(byLabel.A.id);
    expect(miss[0].actual).toBe(false);
  });

  it("orphan-host when facts has an extra exists:true id", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const facts = tiledFacts(byLabel);
    facts.windows["ghost-id"] = { exists: true };
    const r = agree(f, facts);
    expect(r.ok).toBe(false);
    const orphans = kinds(r.drifts, DRIFT.ORPHAN_HOST);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe("ghost-id");
  });

  it("float-mismatch when A is under FLOATS but fact.floating is false", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    expect(moveWindowToFloats(f, byLabel.A).ok).toBe(true);
    const r = agree(f, tiledFacts(byLabel));
    expect(r.ok).toBe(false);
    const floats = kinds(r.drifts, DRIFT.FLOAT_MISMATCH);
    expect(floats).toHaveLength(1);
    expect(floats[0].id).toBe(byLabel.A.id);
    expect(floats[0].expected).toBe(true);
    expect(floats[0].actual).toBe(false);
    expect(kinds(r.drifts, DRIFT.MON_MISMATCH)).toEqual([]);
    expect(kinds(r.drifts, DRIFT.MINS)).toEqual([]);
  });

  it("float-mismatch when A is tiled but fact.floating is true", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(f, tiledFacts(byLabel, { [byLabel.A.id]: { floating: true } }));
    expect(r.ok).toBe(false);
    const floats = kinds(r.drifts, DRIFT.FLOAT_MISMATCH);
    expect(floats).toHaveLength(1);
    expect(floats[0].id).toBe(byLabel.A.id);
    expect(floats[0].expected).toBe(false);
    expect(floats[0].actual).toBe(true);
  });

  it("skips mon and mins for a FLOATS window that matches floating:true", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    expect(moveWindowToFloats(f, byLabel.A).ok).toBe(true);
    const r = agree(
      f,
      tiledFacts(byLabel, {
        [byLabel.A.id]: {
          floating: true,
          monitorId: "Mon2",
          mins: { width: 5000, height: 5000 },
        },
      })
    );
    expect(r.ok).toBe(true);
    expect(r.drifts).toEqual([]);
  });

  it("mon-mismatch when fact.monitorId is wrong for a tiled window", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(f, tiledFacts(byLabel, { [byLabel.A.id]: { monitorId: "Mon2" } }));
    expect(r.ok).toBe(false);
    const mons = kinds(r.drifts, DRIFT.MON_MISMATCH);
    expect(mons).toHaveLength(1);
    expect(mons[0].id).toBe(byLabel.A.id);
    expect(mons[0].expected).toBe("Mon1");
    expect(mons[0].actual).toBe("Mon2");
  });

  it("mins DRIFT when percent starves the slot below mins", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    byLabel.A.percent = 0.1;
    byLabel.A.userSized = true;
    byLabel.B.percent = 0.9;
    byLabel.B.userSized = true;
    const r = agree(
      f,
      tiledFacts(byLabel, { [byLabel.A.id]: { mins: { width: 300, height: 0 } } })
    );
    expect(r.ok).toBe(false);
    const mins = kinds(r.drifts, DRIFT.MINS);
    expect(mins).toHaveLength(1);
    expect(mins[0].id).toBe(byLabel.A.id);
    expect(mins[0].actual).toMatchObject({ width: 192, height: 1080 });
    expect(kinds(r.drifts, DRIFT.MINS).filter((d) => d.id === byLabel.B.id)).toEqual([]);
  });

  it("does not mins-DRIFT when the slot hosts small mins", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = agree(
      f,
      tiledFacts(byLabel, {
        [byLabel.A.id]: { mins: { width: 100, height: 100 } },
        [byLabel.B.id]: { mins: { width: 100, height: 100 } },
      })
    );
    expect(r.ok).toBe(true);
    expect(kinds(r.drifts, DRIFT.MINS)).toEqual([]);
  });

  it("singleton-tab when a TABBED CON has exactly one child", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A)");
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    const wrapped = api.wrapNodes(f, f.monitors[0], [byLabel.A], tab);
    expect(wrapped.ok).toBe(true);
    expect(tab.childIds).toEqual([byLabel.A.id]);
    const r = agree(f, { windows: { [byLabel.A.id]: { exists: true } } });
    expect(r.ok).toBe(false);
    const tabs = kinds(r.drifts, DRIFT.SINGLETON_TAB);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe(tab.id);
  });

  it("does not report singleton-tab on a settled forest", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A)");
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    api.wrapNodes(f, f.monitors[0], [byLabel.A], tab);
    settleForest(f);
    const r = agree(f, { windows: { [byLabel.A.id]: { exists: true } } });
    expect(kinds(r.drifts, DRIFT.SINGLETON_TAB)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("does not report singleton-tab for TAB(A,B)", () => {
    const { f, byLabel } = buildGiven("Mon1(TAB(A,B))");
    const r = agree(f, tiledFacts(byLabel));
    expect(kinds(r.drifts, DRIFT.SINGLETON_TAB)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
