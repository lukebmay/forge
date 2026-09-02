import { describe, expect, it } from "vitest";
import { pruneEmptyCons } from "../../../lib/rulesets/core.js";
import { children, parent } from "../../../lib/tom/kernel.js";
import { buildGiven, serializeForest } from "../../../lib/tom/shorthand.js";

describe("pruneEmptyCons", () => {
  it("removes a CON whose only childIds are dangling", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    const host = parent(f, byLabel.A);
    const empty = {
      id: "ghost",
      kind: "CON",
      layout: "HSPLIT",
      parentId: host.id,
      childIds: ["dead-id"],
      percent: 0.2,
      userSized: false,
    };
    f.nodes[empty.id] = empty;
    host.childIds.push(empty.id);
    pruneEmptyCons(f, f.monitors[0]);
    expect(f.nodes.ghost).toBeUndefined();
    expect(host.childIds).not.toContain("ghost");
    expect(serializeForest(f, { children })).toBe("Mon1(H(A,B))");
  });

  it("deletes a detached empty CON left in forest.nodes", () => {
    const { f } = buildGiven("Mon1(A)");
    f.nodes.orphan = {
      id: "orphan",
      kind: "CON",
      layout: "TABBED",
      parentId: null,
      childIds: [],
      percent: 1,
      userSized: false,
    };
    pruneEmptyCons(f, f.monitors[0]);
    expect(f.nodes.orphan).toBeUndefined();
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
  });
});
