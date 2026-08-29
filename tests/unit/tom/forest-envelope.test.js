import { describe, expect, it } from "vitest";
import { getOpSet, runOpAbstract } from "../../../lib/opsets/index.js";
import { appendChild } from "../../../lib/tom/atomics.js";
import {
  cloneForest,
  createForest,
  ensureSpine,
  floatsOf,
  isUnderFloats,
  isUnderTiles,
  makeIdFactory,
  metaOf,
  parent,
  tilesOf,
} from "../../../lib/tom/kernel.js";
import { serializeForest } from "../../../lib/tom/shorthand.js";
import { createTomApi } from "../../../lib/tom/api.js";
import { wrapMonitorMax1 } from "../../../lib/rulesets/mark2.js";

const GEOMS = [{ id: "Mon1", x: 0, y: 0, width: 1920, height: 1080, primary: true }];

function forest() {
  const ids = makeIdFactory(1);
  return createForest(GEOMS, () => ids.nid());
}

function splitAB() {
  const api = createTomApi();
  const f = api.createForest(GEOMS);
  const a = api.makeWindow("A");
  const b = api.makeWindow("B");
  api._registerTree(f, a);
  api._registerTree(f, b);
  const split = api.makeCon("HSPLIT", []);
  api._registerTree(f, split);
  api.appendChild(f, split, a);
  api.appendChild(f, split, b);
  api.appendChild(f, f.monitors[0], split);
  a.percent = 0.5;
  b.percent = 0.5;
  api.setFocus(f, a.id);
  return { f, api, a, b };
}

describe("forest envelope META + FLOATS + TILES", () => {
  it("createForest has META, FLOATS, and TILES (ROOT) as siblings", () => {
    const f = forest();
    const meta = metaOf(f);
    const floats = floatsOf(f);
    const tiles = tilesOf(f);
    expect(meta?.kind).toBe("META");
    expect(floats?.kind).toBe("FLOATS");
    expect(tiles?.kind).toBe("ROOT");
    expect(tiles.id).toBe(f.rootId);
    expect(meta.parentId).toBeNull();
    expect(floats.parentId).toBeNull();
    expect(tiles.parentId).toBeNull();
    expect(tiles.childIds).not.toContain(meta.id);
    expect(tiles.childIds).not.toContain(floats.id);
  });

  it("FLOAT window sits under FLOATS, not TILES or a MONITOR", () => {
    const { f, api, a } = splitAB();
    const win = api.makeWindow("F");
    api._registerTree(f, win);
    appendChild(f, floatsOf(f), win);
    expect(parent(f, win)).toBe(floatsOf(f));
    expect(isUnderFloats(f, win)).toBe(true);
    expect(isUnderTiles(f, win)).toBe(false);
    expect(isUnderTiles(f, a)).toBe(true);
    expect(f.monitors[0].childIds).not.toContain(win.id);
  });

  it("Move on TILES ignores FLOATS membership", () => {
    const { f, api, a, b } = splitAB();
    const win = api.makeWindow("F");
    api._registerTree(f, win);
    appendChild(f, floatsOf(f), win);
    const set = getOpSet("mark2");
    const r = runOpAbstract(f, api, (draft) => {
      wrapMonitorMax1(draft, draft.nodes[draft.rootId]);
      api.hydrateSeq(draft);
      return set.ops.move(draft, api, "right");
    });
    expect(r?.ok).toBe(true);
    expect(serializeForest(f, api)).toBe("Mon1(H(B,A))");
    const a2 = f.nodes[a.id];
    const f2 = f.nodes[win.id];
    expect(parent(f, f2)).toBe(floatsOf(f));
    expect(parent(f, a2)?.childIds).toEqual([b.id, a.id]);
    expect(parent(f, a2)?.childIds).not.toContain(win.id);
  });

  it("Join on TILES ignores FLOATS membership", () => {
    const { f, api, a, b } = splitAB();
    const win = api.makeWindow("F");
    api._registerTree(f, win);
    appendChild(f, floatsOf(f), win);
    const set = getOpSet("mark2");
    const r = runOpAbstract(f, api, (draft) => {
      wrapMonitorMax1(draft, draft.nodes[draft.rootId]);
      api.hydrateSeq(draft);
      return set.ops.join(draft, api, "right");
    });
    expect(r?.ok).toBe(true);
    expect(serializeForest(f, api)).toBe("Mon1(V(A,B))");
    const a2 = f.nodes[a.id];
    const f2 = f.nodes[win.id];
    expect(parent(f, f2)).toBe(floatsOf(f));
    expect(isUnderTiles(f, a2)).toBe(true);
    expect(isUnderFloats(f, f2)).toBe(true);
    expect(parent(f, a2)?.childIds).toEqual([a.id, b.id]);
    expect(parent(f, a2)?.childIds).not.toContain(win.id);
  });

  it("Move/Join on a FLOAT leaf does not mutate TILES", () => {
    const { f, api, a, b } = splitAB();
    const win = api.makeWindow("F");
    api._registerTree(f, win);
    appendChild(f, floatsOf(f), win);
    api.setFocus(f, win.id);
    const set = getOpSet("mark2");
    const move = runOpAbstract(f, api, (draft) => set.ops.move(draft, api, "right"));
    expect(move?.ok).toBe(false);
    const join = runOpAbstract(f, api, (draft) => set.ops.join(draft, api, "right"));
    expect(join?.ok).toBe(false);
    expect(serializeForest(f, api)).toBe("Mon1(H(A,B))");
    expect(parent(f, f.nodes[a.id])?.childIds).toEqual([a.id, b.id]);
  });

  it("ensureSpine hydrates envelope onto an old TILES-only dump", () => {
    const ids = makeIdFactory(1);
    const f = createForest(GEOMS, () => ids.nid());
    delete f.nodes[f.metaId];
    delete f.nodes[f.floatsId];
    delete f.metaId;
    delete f.floatsId;
    ensureSpine(f, () => ids.nid());
    expect(metaOf(f)?.kind).toBe("META");
    expect(floatsOf(f)?.kind).toBe("FLOATS");
    expect(tilesOf(f)?.kind).toBe("ROOT");
  });

  it("cloneForest keeps envelope ids", () => {
    const f = forest();
    const c = cloneForest(f);
    expect(metaOf(c)?.id).toBe(metaOf(f)?.id);
    expect(floatsOf(c)?.id).toBe(floatsOf(f)?.id);
    expect(tilesOf(c)?.id).toBe(tilesOf(f)?.id);
  });
});
