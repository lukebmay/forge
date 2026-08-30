import { describe, expect, it } from "vitest";
import { DRIFT, agree, factsFromWindowMap, resyncToReality } from "../../../lib/agree/index.js";
import {
  ancestorMonitor,
  children,
  floatsOf,
  isUnderTiles,
  serializeForest,
  windowIsFloating,
} from "../../../lib/tom/index.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

/** @param {Record<string, { id: string }>} byLabel */
function existsFacts(byLabel) {
  /** @type {Record<string, { exists: boolean }>} */
  const windows = {};
  for (const n of Object.values(byLabel)) windows[n.id] = { exists: true };
  return { windows };
}

describe("resyncToReality", () => {
  it("destroys gone TAB sibling and unary-collapses singleton TAB", () => {
    const { f, byLabel } = buildGiven("Mon1(TAB(A,B))");
    const facts = {
      windows: {
        [byLabel.A.id]: { exists: true },
        [byLabel.B.id]: { exists: false },
      },
    };
    const r = resyncToReality(f, facts);
    expect(r.ok).toBe(true);
    expect(f.nodes[byLabel.B.id]).toBeUndefined();
    expect(f.nodes[byLabel.A.id]?.kind).toBe("WINDOW");
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
    expect(agree(f, { windows: { [byLabel.A.id]: { exists: true } } }).ok).toBe(true);
    expect(r.steps.some((s) => s.startsWith("destroyNode:"))).toBe(true);
    expect(r.steps).toContain("settleForest");
  });

  it("moves a tiled window to FLOATS when host is floating", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const r = resyncToReality(f, {
      windows: {
        [byLabel.A.id]: { exists: true, floating: true },
        [byLabel.B.id]: { exists: true, floating: false },
      },
    });
    expect(r.ok).toBe(true);
    expect(windowIsFloating(f, byLabel.A)).toBe(true);
    expect(floatsOf(f)?.childIds).toContain(byLabel.A.id);
    expect(windowIsFloating(f, byLabel.B)).toBe(false);
    expect(
      agree(f, {
        windows: {
          [byLabel.A.id]: { exists: true, floating: true },
          [byLabel.B.id]: { exists: true, floating: false },
        },
      }).ok
    ).toBe(true);
  });

  it("settles a singleton TABBED with the host still present", () => {
    const { f, api, byLabel } = buildGiven("Mon1(A)");
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    const wrapped = api.wrapNodes(f, f.monitors[0], [byLabel.A], tab);
    expect(wrapped.ok).toBe(true);
    expect(agree(f, { windows: { [byLabel.A.id]: { exists: true } } }).ok).toBe(false);

    const r = resyncToReality(f, { windows: { [byLabel.A.id]: { exists: true } } });
    expect(r.ok).toBe(true);
    expect(f.nodes[tab.id]).toBeUndefined();
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
    expect(r.steps).toContain("settleForest");
  });

  it("no-ops when the forest already AGREEs", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const facts = existsFacts(byLabel);
    const before = JSON.stringify(f.nodes);
    const r = resyncToReality(f, facts);
    expect(r.ok).toBe(true);
    expect(r.rounds === 0 || r.rounds === 1).toBe(true);
    expect(r.drifts).toEqual([]);
    expect(r.steps).toEqual([]);
    expect(JSON.stringify(f.nodes)).toBe(before);
  });

  it("retile FLOATS→TILES when host is tiled and a MONITOR is known", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    const floated = resyncToReality(f, {
      windows: {
        [byLabel.A.id]: { exists: true, floating: true },
        [byLabel.B.id]: { exists: true, floating: false },
      },
    });
    expect(floated.ok).toBe(true);
    expect(windowIsFloating(f, byLabel.A)).toBe(true);

    const r = resyncToReality(f, {
      windows: {
        [byLabel.A.id]: { exists: true, floating: false, monitorId: "Mon1" },
        [byLabel.B.id]: { exists: true, floating: false, monitorId: "Mon1" },
      },
    });
    expect(r.ok).toBe(true);
    expect(windowIsFloating(f, byLabel.A)).toBe(false);
    expect(isUnderTiles(f, byLabel.A)).toBe(true);
    expect(ancestorMonitor(f, byLabel.A)?.id).toBe("Mon1");
  });

  it("leaves orphan-host as remaining drift (no invented WINDOW)", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const r = resyncToReality(f, {
      windows: {
        [byLabel.A.id]: { exists: true },
        ghost: { exists: true },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.drifts.some((d) => d.kind === DRIFT.ORPHAN_HOST && d.id === "ghost")).toBe(true);
    expect(f.nodes.ghost).toBeUndefined();
  });

  it("factsFromWindowMap accepts a Map", () => {
    const { f, byLabel } = buildGiven("Mon1(A)");
    const map = new Map([[byLabel.A.id, { exists: true }]]);
    const r = resyncToReality(f, factsFromWindowMap(map));
    expect(r.ok).toBe(true);
    expect(r.rounds).toBe(0);
  });
});
