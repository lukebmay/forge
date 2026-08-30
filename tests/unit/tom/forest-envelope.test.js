import { describe, expect, it } from "vitest";
import { getOpSet, runOpAbstract } from "../../../lib/opsets/index.js";
import { appendChild } from "../../../lib/tom/atomics.js";
import { unwrapUnarySplit } from "../../../lib/tom/composed.js";
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
import { layoutUnit, monDirectAncestor, siblingCon } from "../../../lib/tom/queries.js";
import {
  moveWindowToFloats,
  moveWindowToTiles,
  windowIsFloating,
} from "../../../lib/tom/membership.js";
import { serializeForest } from "../../../lib/tom/shorthand.js";
import { createTomApi } from "../../../lib/tom/api.js";
import { settleForest, wrapMonitorMax1 } from "../../../lib/rulesets/mark2.js";

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

  it("moveWindowToFloats / moveWindowToTiles is the TILES↔FLOATS path", () => {
    const { f, a, b } = splitAB();
    const split = parent(f, a);
    expect(windowIsFloating(f, a)).toBe(false);
    const toFloat = moveWindowToFloats(f, a);
    expect(toFloat.ok).toBe(true);
    expect(windowIsFloating(f, a)).toBe(true);
    expect(parent(f, a)).toBe(floatsOf(f));
    expect(split?.childIds).toEqual([b.id]);
    expect(moveWindowToFloats(f, a).noop).toBe(true);

    const back = moveWindowToTiles(f, a, f.monitors[0]);
    expect(back.ok).toBe(true);
    expect(windowIsFloating(f, a)).toBe(false);
    expect(parent(f, a)).toBe(f.monitors[0]);
    expect(floatsOf(f).childIds).not.toContain(a.id);
    expect(moveWindowToTiles(f, a, floatsOf(f)).ok).toBe(false);
  });

  it("layoutUnit is the TABBED/STACKED bag; siblingCon finds a peer CON", () => {
    const api = createTomApi();
    const f = api.createForest(GEOMS);
    const leaf = api.makeWindow("L");
    const w1 = api.makeWindow("T1");
    const tab = api.makeCon("TABBED", []);
    const h = api.makeCon("HSPLIT", []);
    for (const n of [leaf, w1, tab, h]) api._registerTree(f, n);
    api.appendChild(f, tab, w1);
    api.appendChild(f, h, leaf);
    api.appendChild(f, h, tab);
    api.appendChild(f, f.monitors[0], h);
    expect(layoutUnit(f, w1)).toBe(tab);
    expect(layoutUnit(f, leaf)).toBe(leaf);
    expect(siblingCon(f, leaf)).toBe(tab);
    expect(monDirectAncestor(f, w1)).toBe(h);
  });

  it("unwrapUnarySplit promotes a 1-child H/V CON and keeps TABBED", () => {
    const api = createTomApi();
    const f = api.createForest(GEOMS);
    const ghost = api.makeWindow("G");
    const v = api.makeCon("VSPLIT", []);
    const tab = api.makeCon("TABBED", []);
    const w1 = api.makeWindow("C");
    const wrap = api.makeCon("HSPLIT", []);
    for (const n of [ghost, v, tab, w1, wrap]) api._registerTree(f, n);
    api.appendChild(f, v, ghost);
    api.appendChild(f, tab, w1);
    api.appendChild(f, wrap, v);
    api.appendChild(f, wrap, tab);
    api.appendChild(f, f.monitors[0], wrap);
    v.percent = 0.4;
    v.userSized = true;
    const promoted = unwrapUnarySplit(f, v);
    expect(promoted).toBe(ghost);
    expect(parent(f, ghost)).toBe(wrap);
    expect(ghost.percent).toBe(0.4);
    expect(ghost.userSized).toBe(true);
    expect(f.nodes[v.id]).toBeUndefined();
    expect(unwrapUnarySplit(f, tab)).toBe(tab);
    expect(parent(f, w1)).toBe(tab);
  });
});

function tabBagsWithConChild(f) {
  const bad = [];
  for (const n of Object.values(f.nodes)) {
    if (n.kind !== "CON") continue;
    if (n.layout !== "TABBED" && n.layout !== "STACKED") continue;
    for (const cid of n.childIds) {
      if (f.nodes[cid]?.kind === "CON") bad.push(`${n.id}:${cid}`);
    }
  }
  return bad;
}

describe("Mark 2 settle — mixed HSPLIT wrap (TILE | TABBED)", () => {
  it("H(H(A,B),C) still becomes H(TAB(A,B),C)", () => {
    const api = createTomApi();
    const f = api.createForest(GEOMS);
    const inner = api.makeCon("HSPLIT", []);
    const outer = api.makeCon("HSPLIT", []);
    const a = api.makeWindow("A");
    const b = api.makeWindow("B");
    const c = api.makeWindow("C");
    for (const n of [inner, outer, a, b, c]) api._registerTree(f, n);
    api.appendChild(f, inner, a);
    api.appendChild(f, inner, b);
    api.appendChild(f, outer, inner);
    api.appendChild(f, outer, c);
    api.appendChild(f, f.monitors[0], outer);
    settleForest(f);
    expect(serializeForest(f, api)).toBe("Mon1(H(TAB(A,B),C))");
    expect(tabBagsWithConChild(f)).toEqual([]);
  });

  it("settle does not TAB a mixed H(WINDOW, TABBED) when MONITOR gains an extra WINDOW", () => {
    const api = createTomApi();
    const f = api.createForest(GEOMS);
    const mon = f.monitors[0];
    mon.layout = "HSPLIT";
    const wrap = api.makeCon("HSPLIT", []);
    const tab = api.makeCon("TABBED", []);
    const g = api.makeWindow("G");
    const y = api.makeWindow("Y");
    const m = api.makeWindow("M");
    const extra = api.makeWindow("E");
    for (const n of [wrap, tab, g, y, m, extra]) api._registerTree(f, n);
    api.appendChild(f, tab, y);
    api.appendChild(f, tab, m);
    api.appendChild(f, wrap, g);
    api.appendChild(f, wrap, tab);
    api.appendChild(f, mon, wrap);
    api.appendChild(f, mon, extra);
    settleForest(f);
    expect(tabBagsWithConChild(f)).toEqual([]);
    expect(parent(f, g)?.layout).toBe("HSPLIT");
    expect(parent(f, y)?.layout).toBe("TABBED");
    expect(parent(f, y)).not.toBe(parent(f, g));
    expect(parent(f, extra)?.kind).not.toBe("MONITOR");
  });
});
