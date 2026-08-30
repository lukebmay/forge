import { describe, expect, it, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  childrenOf,
  ensureLiveForest,
  forestApplyLayoutStructure,
  forestApplySkeletonMon,
  forestEnsureSpineNode,
  forestInsertWindow,
  forestLiftToMonitor,
  forestMergeWindowsIntoGroup,
  forestOrderLiveChildren,
  forestOrderWindows,
  forestSizeWindows,
  forestRemoveWindow,
  forestReparent,
  forestSetLayout,
  forestSetWindowFloating,
  forestSlotSplit,
  forestSplit,
  forestSwapWindows,
  forestWrapForTabStack,
  forestWrapInsert,
  liveKind,
  liveWindowFromMeta,
  paintLiveForest,
  projectLiveForest,
  rebuildLiveById,
  resolveForestFocusId,
  seedLiveForest,
  syncForestFromTree,
} from "../../../lib/extension/tom-live.js";
import { createHostBag } from "../../../lib/host/index.js";
import { getOpSet, runOpAbstract } from "../../../lib/opsets/index.js";
import { wrapMonitorMax1 } from "../../../lib/rulesets/mark2.js";
import {
  createTomApi,
  floatsOf,
  isUnderFloats,
  isUnderTiles,
  moveWindowToFloats,
} from "../../../lib/tom/index.js";

function makeLive(type, value, extra = {}) {
  const node = {
    nodeType: type,
    nodeValue: value,
    childNodes: [],
    parentNode: null,
    layout: extra.layout,
    percent: extra.percent ?? 0,
    userSized: extra.userSized ?? false,
    lastTabFocus: extra.lastTabFocus ?? null,
    isWindow: () => type === "WINDOW",
    isCon: () => type === "CON",
    isMonitor: () => type === "MONITOR",
    isWorkspace: () => type === "WORKSPACE",
    isRoot: () => type === "ROOT",
    isFloat: () => false,
    isGrabTile: () => false,
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(newNode, ref) {
      if (!ref) return this.appendChild(newNode);
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      const i = this.childNodes.indexOf(ref);
      this.childNodes.splice(i, 0, newNode);
      newNode.parentNode = this;
      return newNode;
    },
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i < 0) throw new Error("NodeNotFound");
      this.childNodes.splice(i, 1);
      child.parentNode = null;
      return [child];
    },
    replaceChildren(ordered) {
      const next = [];
      const seen = new Set();
      for (const n of ordered || []) {
        if (!n || seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
      for (const c of [...this.childNodes]) {
        if (!seen.has(c)) this.removeChild(c);
      }
      for (const n of next) this.appendChild(n);
      return this;
    },
    setLayout(layout) {
      this.layout = layout;
      return true;
    },
    findNode(meta) {
      const walk = (n) => {
        if (n.nodeValue === meta) return n;
        for (const c of n.childNodes || []) {
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    },
  };
  return node;
}

function windowIdOf(node) {
  const v = node?.nodeValue;
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v.id != null) return String(v.id);
  return null;
}

function createCon() {
  const id = `con-${Math.random().toString(16).slice(2)}`;
  return makeLive("CON", { id }, { layout: "HSPLIT" });
}

function twoSplitTree() {
  const root = makeLive("ROOT", "ROOT");
  const ws = makeLive("WORKSPACE", "ws0");
  const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
  const con = makeLive("CON", { id: "split" }, { layout: "HSPLIT" });
  const metaA = { id: "A", title: "A" };
  const metaB = { id: "B", title: "B" };
  const winA = makeLive("WINDOW", metaA);
  const winB = makeLive("WINDOW", metaB);
  root.appendChild(ws);
  ws.appendChild(mon);
  mon.appendChild(con);
  con.appendChild(winA);
  con.appendChild(winB);
  return { root, ws, mon, con, winA, winB, metaA, metaB };
}

function idsOf(parent) {
  return childrenOf(parent).map((n) => windowIdOf(n) || n.nodeValue?.id || liveKind(n));
}

function makeWm(root) {
  return {
    tree: root,
    _tree: root,
    forest: null,
    hostBag: createHostBag(),
    liveById: null,
    _liveForestSeeded: false,
  };
}

/** Mutate durable seeded forest then paint live chrome (C3.6). */
function runOpLive(wm, op, dir, focusNode) {
  const hooks = { windowIdOf, createCon, workareas: [], hostBag: wm.hostBag };
  const forest = ensureLiveForest(wm, hooks);
  expect(forest).toBeTruthy();
  const focusId = resolveForestFocusId(wm, focusNode);
  expect(focusId).toBeTruthy();
  forest.focusId = focusId;
  forest.selectionId = focusId;
  const api = createTomApi();
  api.hydrateSeq(forest);
  const set = getOpSet("mark2");
  const r = runOpAbstract(forest, api, (draft) => {
    const draftRoot = draft.nodes[draft.rootId];
    if (draftRoot) wrapMonitorMax1(draft, draftRoot);
    api.hydrateSeq(draft);
    return set.ops[op](draft, api, dir);
  });
  if (r?.ok) {
    const liveById = rebuildLiveById(wm, forest);
    paintLiveForest(forest, liveById, hooks);
    wm.liveById = liveById;
  }
  return { r, forest, liveById: wm.liveById };
}

describe("tom-live seed + mutate live forest", () => {
  it("seedLiveForest remaps WINDOW to nanoid and fills hostBag", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    const seeded = seedLiveForest(wm, { windowIdOf, createCon, focusId: "A" });
    expect(seeded).toBeTruthy();
    expect(wm.forest).toBe(seeded.forest);
    expect(wm._liveForestSeeded).toBe(true);
    expect(wm.forest.nodes.A).toBeUndefined();
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(nid).toBeTruthy();
    expect(nid).not.toBe("A");
    expect(wm.hostBag.idFromWindowId("A")).toBe(nid);
    expect(wm.hostBag.get(nid)?.windowId).toBe("A");
    expect(wm.liveById.get(nid)).toBe(winA);
    expect(wm.forest.nodes[nid]?.kind).toBe("WINDOW");
    expect(wm.forest.focusId).toBe(nid);
  });

  it("ensureLiveForest seeds once and returns the same forest", () => {
    const { root } = twoSplitTree();
    const wm = makeWm(root);
    const a = ensureLiveForest(wm, { windowIdOf, createCon });
    const b = ensureLiveForest(wm, { windowIdOf, createCon });
    expect(a).toBe(b);
    expect(wm._liveForestSeeded).toBe(true);
  });

  it("in-axis Mark 2 Move mutates Forest then paint mirrors sibling order", () => {
    const { root, con, winA, winB, metaA } = twoSplitTree();
    const wm = makeWm(root);
    const { r, forest } = runOpLive(wm, "move", "right", winA);
    expect(r?.ok).toBe(true);
    const nid = wm.hostBag.idFromMeta(metaA);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    expect(forest.nodes[conId].childIds).toEqual([wm.hostBag.idFromMeta(winB.nodeValue), nid]);
    expect(con.childNodes).toEqual([winB, winA]);
    expect(wm.forest.nodes[nid]).toBeTruthy();
    expect(wm.forest.focusId).toBe(nid);
  });

  it("second Mark 2 mutates the same forest (no re-project)", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    const first = runOpLive(wm, "move", "right", winA);
    expect(first.r?.ok).toBe(true);
    const forestRef = wm.forest;
    const { r } = runOpLive(wm, "move", "right", winB);
    expect(r?.ok).toBe(true);
    expect(wm.forest).toBe(forestRef);
    expect(con.childNodes).toEqual([winA, winB]);
  });

  it("Join wraps the pair when the two windows were the split", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    const { r } = runOpLive(wm, "join", "right", winA);
    expect(r?.ok).toBe(true);
    expect(mon.childNodes).toHaveLength(1);
    const wrap = mon.childNodes[0];
    expect(liveKind(wrap)).toBe("CON");
    expect(wrap.layout).toBe("VSPLIT");
    expect(wrap.childNodes).toEqual([winA, winB]);
    expect(con.parentNode).toBeNull();
    expect(idsOf(wrap)).toEqual(["A", "B"]);
    const wrapId = [...wm.liveById.entries()].find(([, live]) => live === wrap)?.[0];
    expect(wrapId).toBeTruthy();
    expect(wm.hostBag.has(wrapId)).toBe(true);
  });

  it("resolveForestFocusId uses hostBag only (no Meta-as-forest-id)", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(resolveForestFocusId(wm, winA)).toBe(nid);
    expect(nid).not.toBe("A");
    wm.hostBag.clear();
    expect(resolveForestFocusId(wm, winA)).toBeNull();
  });

  it("liveWindowFromMeta uses bag reverse index when seeded", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    wm._liveForestSeeded = true;
    wm.hostBag.set("nid-a", { meta: metaA, windowId: "A" });
    wm.liveById = new Map([["nid-a", winA]]);
    expect(liveWindowFromMeta(wm, metaA)).toBe(winA);
    wm._liveForestSeeded = false;
    expect(liveWindowFromMeta(wm, metaA)).toBeNull();
  });

  it("rebuildLiveById WINDOW prefers hostBag findNode(meta)", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    wm.liveById.delete(nid);
    const map = rebuildLiveById(wm, wm.forest);
    expect(map.get(nid)).toBe(winA);
  });

  it("forestInsertWindow adds nanoid WINDOW under MONITOR + bag", () => {
    const { root, mon } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const metaC = { id: "C", title: "C", wm_class: "c" };
    const winC = makeLive("WINDOW", metaC);
    mon.appendChild(winC);
    const nid = forestInsertWindow(wm, winC);
    expect(nid).toBeTruthy();
    expect(nid).not.toBe("C");
    expect(wm.forest.nodes[nid]?.kind).toBe("WINDOW");
    expect(wm.forest.nodes[nid]?.parentId).toBe("mo0ws0");
    expect(wm.hostBag.get(nid)?.windowId).toBe("C");
    expect(wm.hostBag.get(nid)?.floating).toBe(false);
    expect(wm.hostBag.idFromMeta(metaC)).toBe(nid);
    expect(wm.liveById.get(nid)).toBe(winC);
    expect(forestInsertWindow(wm, winC)).toBe(nid);
  });

  it("forestInsertWindow underFloats:false keeps FLOAT-mode live on TILES", () => {
    const { root, mon } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const metaT = { id: "T1", title: "tile-pending" };
    const winT = makeLive("WINDOW", metaT);
    winT.mode = "FLOAT";
    winT.isFloat = () => true;
    mon.appendChild(winT);
    const nid = forestInsertWindow(wm, winT, { underFloats: false });
    expect(nid).toBeTruthy();
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(wm.hostBag.get(nid)?.floating).toBe(false);
  });

  it("forestInsertWindow underFloats lands in FLOATS", () => {
    const { root, mon } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const metaF = { id: "F2", title: "float2" };
    const winF = makeLive("WINDOW", metaF);
    mon.appendChild(winF);
    const nid = forestInsertWindow(wm, winF, { underFloats: true });
    expect(nid).toBeTruthy();
    expect(floatsOf(wm.forest).childIds).toContain(nid);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
  });

  it("forestSetWindowFloating moves TILES↔FLOATS and mirrors bag.floating", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(forestSetWindowFloating(wm, winA, true)).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);

    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(winA.parentNode).toBeNull();
    expect(winA.mode).toBe("FLOAT");

    expect(forestSetWindowFloating(wm, winA, false)).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(false);
  });

  it("alignForestFloatsToLiveTiles repairs bag.floating when live is TILES-parented", () => {
    const infoSpy = vi.spyOn(Logger, "info").mockImplementation(() => {});
    const { root, mon, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(forestSetWindowFloating(wm, winA, true)).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
    mon.appendChild(winA);
    expect(forestSetLayout(wm, mon, "HSPLIT")).toBe(true);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(wm.hostBag.get(nid)?.floating).toBe(false);
    const texts = infoSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("align-floats-to-tiles"))).toBe(true);
    infoSpy.mockRestore();
  });

  it("forestRemoveWindow drops Forest node and bag", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(forestRemoveWindow(wm, winA)).toBe(true);
    expect(wm.forest.nodes[nid]).toBeUndefined();
    expect(wm.hostBag.has(nid)).toBe(false);
    expect(wm.liveById.has(nid)).toBe(false);
    expect(wm.hostBag.idFromMeta(metaA)).toBeUndefined();
  });

  it("syncForestFromTree preserves WINDOW nanoids", () => {
    const { root, mon, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const metaC = { id: "C", title: "C" };
    const winC = makeLive("WINDOW", metaC);
    mon.appendChild(winC);
    forestInsertWindow(wm, winC);
    const idC = wm.hostBag.idFromMeta(metaC);
    expect(idC).toBeTruthy();

    const forest = syncForestFromTree(wm, { windowIdOf, createCon });
    expect(forest).toBe(wm.forest);
    expect(wm.hostBag.idFromMeta(metaA)).toBe(idA);
    expect(wm.hostBag.idFromMeta(metaB)).toBe(idB);
    expect(wm.hostBag.idFromMeta(metaC)).toBe(idC);
    expect(wm.forest.nodes[idA]?.kind).toBe("WINDOW");
    expect(wm.forest.nodes[idC]?.kind).toBe("WINDOW");
  });

  it("forestEnsureSpineNode mirrors MONITOR id", () => {
    const { root } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const ws1 = makeLive("WORKSPACE", "ws1");
    const mon1 = makeLive("MONITOR", "mo0ws1", { layout: "VSPLIT" });
    root.appendChild(ws1);
    ws1.appendChild(mon1);
    expect(forestEnsureSpineNode(wm, mon1)).toBe("mo0ws1");
    expect(wm.forest.nodes.ws1?.kind).toBe("WORKSPACE");
    expect(wm.forest.nodes.mo0ws1?.kind).toBe("MONITOR");
    expect(wm.forest.nodes.mo0ws1.layout).toBe("VSPLIT");
    expect(wm.liveById.get("mo0ws1")).toBe(mon1);
  });

  it("forestReparent moves a WINDOW after dest then paints", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestReparent(wm, winA, winB, { destIsWindow: true })).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(wm.forest.nodes[conId].childIds).toEqual([idB, idA]);
    expect(con.childNodes).toEqual([winB, winA]);
  });

  it("forestSwapWindows swaps sibling WINDOW ids", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSwapWindows(wm, winA, winB)).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(wm.forest.nodes[conId].childIds).toEqual([idB, idA]);
    expect(con.childNodes).toEqual([winB, winA]);
  });

  it("forestOrderWindows reorders same-parent siblings", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestOrderWindows(wm, [winB, winA]);
    expect(out).toMatchObject({ ok: true, reordered: true, scope: "siblings" });
    expect(con.childNodes).toEqual([winB, winA]);
  });

  it("forestSizeWindows sets sibling percents then paint", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestSizeWindows(wm, [winA, winB], [0.7, 0.3]);
    expect(out).toMatchObject({ ok: true, sized: true, scope: "siblings" });
    expect(winA.percent).toBeCloseTo(0.7, 5);
    expect(winB.percent).toBeCloseTo(0.3, 5);
    expect(winA.userSized).toBe(true);
    expect(winB.userSized).toBe(true);
  });

  it("forestSizeWindows skips duplicate mon-directs without error", () => {
    const { root, mon, winA, winB } = twoSplitTree();
    const ghostMeta = { id: "G", title: "G" };
    const winG = makeLive("WINDOW", ghostMeta);
    mon.appendChild(winG);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const skip = forestSizeWindows(wm, [winA, winB, winG], [0.4, 0.4, 0.2]);
    expect(skip).toMatchObject({
      ok: true,
      sized: false,
      reason: "duplicate mon-direct for size targets",
    });
  });

  it("forestInsertWindow parents under live CON when Forest has that CON", () => {
    const { root, con } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    const metaC = { id: "C", title: "C", wm_class: "c" };
    const winC = makeLive("WINDOW", metaC);
    con.appendChild(winC);
    const nid = forestInsertWindow(wm, winC);
    expect(nid).toBeTruthy();
    expect(wm.forest.nodes[nid]?.parentId).toBe(conId);
    expect(wm.forest.nodes[conId].childIds).toContain(nid);
    expect(wm.forest.nodes[nid].parentId).not.toBe("mo0ws0");
  });

  it("forestSetLayout writes CON layout then paint mirrors", () => {
    const { root, con } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "VSPLIT", { resetPercents: true })).toBe(true);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    expect(wm.forest.nodes[conId].layout).toBe("VSPLIT");
    expect(con.layout).toBe("VSPLIT");
  });

  it("forestMergeWindowsIntoGroup flips a 2-child HSPLIT CON to TABBED", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const group = forestMergeWindowsIntoGroup(wm, winA, winB, "TABBED");
    expect(group).toBe(con);
    expect(con.layout).toBe("TABBED");
    expect(con.childNodes).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(wm.forest.nodes[conId].layout).toBe("TABBED");
    expect(wm.forest.nodes[conId].childIds).toEqual(
      expect.arrayContaining([wm.hostBag.idFromMeta(metaA), wm.hostBag.idFromMeta(metaB)])
    );
  });

  it("forestWrapInsert wraps pointer then inserts focus before it", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestWrapInsert(wm, winB, winA, "VSPLIT", { before: true })).toBe(true);
    const wrap = winB.parentNode;
    expect(wrap).not.toBe(con);
    expect(wrap.layout).toBe("VSPLIT");
    expect(wrap.childNodes).toEqual([winA, winB]);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const wrapId = wm.forest.nodes[idB].parentId;
    expect(wm.forest.nodes[wrapId].layout).toBe("VSPLIT");
    expect(wm.forest.nodes[wrapId].childIds).toEqual([idA, idB]);
  });

  it("forestSlotSplit wraps a sibling unit then inserts the other WINDOW", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSlotSplit(wm, winB, "HORIZONTAL", { insertLive: winA, before: true })).toBe(true);
    const wrap = winB.parentNode;
    expect(wrap.layout).toBe("HSPLIT");
    expect(wrap.childNodes).toEqual([winA, winB]);
    expect(con.childNodes).toContain(wrap);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(wm.forest.nodes[idA].parentId).toBe(wm.forest.nodes[idB].parentId);
  });

  it("forestSplit wraps a WINDOW then moves the wrap before dest", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSplit(wm, winA, "VERTICAL", { moveToLive: mon, moveBeforeLive: con })).toBe(true);
    expect(winA.parentNode.layout).toBe("VSPLIT");
    expect(winA.parentNode.parentNode).toBe(mon);
    expect(mon.childNodes.indexOf(winA.parentNode)).toBeLessThan(mon.childNodes.indexOf(con));
    expect(con.childNodes).toContain(winB);
  });

  it("forestOrderLiveChildren reorders CON kids then paint mirrors", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestOrderLiveChildren(wm, con, [winB, winA])).toBe(true);
    expect(con.childNodes).toEqual([winB, winA]);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    const idA = wm.hostBag.idFromMeta(winA.nodeValue);
    const idB = wm.hostBag.idFromMeta(winB.nodeValue);
    expect(wm.forest.nodes[conId].childIds).toEqual([idB, idA]);
  });

  it("forestWrapForTabStack wraps one WINDOW; Forest parent is TABBED", () => {
    const { root, mon, con, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const wrap = forestWrapForTabStack(wm, winA, "TABBED");
    expect(wrap).toBeTruthy();
    const idA = wm.hostBag.idFromMeta(metaA);
    const parentId = wm.forest.nodes[idA].parentId;
    expect(wm.forest.nodes[parentId].kind).toBe("CON");
    expect(wm.forest.nodes[parentId].layout).toBe("TABBED");
    expect(wm.forest.nodes[parentId].childIds).toEqual([idA]);
    expect(wm.forest.nodes[parentId].lastTabFocusId).toBe(idA);
    expect(con.childNodes).toContain(wrap);
    expect(wrap.childNodes).toContain(winA);
    expect(mon.childNodes).toContain(con);
  });

  it("forestApplyLayoutStructure TABBED joins bag sibling; wrap stays HSPLIT", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const wrap = makeLive("CON", { id: "wrap" }, { layout: "HSPLIT" });
    const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
    const metaG = { id: "G", title: "G" };
    const metaY = { id: "Y", title: "Y" };
    const metaM = { id: "M", title: "M" };
    const winG = makeLive("WINDOW", metaG);
    const winY = makeLive("WINDOW", metaY);
    const winM = makeLive("WINDOW", metaM);
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(wrap);
    wrap.appendChild(winG);
    wrap.appendChild(tab);
    tab.appendChild(winM);
    wrap.appendChild(winY);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplyLayoutStructure(wm, winY, "TABBED", { structure: true });
    expect(out.ok).toBe(true);
    const idY = wm.hostBag.idFromMeta(metaY);
    const idM = wm.hostBag.idFromMeta(metaM);
    const idG = wm.hostBag.idFromMeta(metaG);
    const parentY = wm.forest.nodes[wm.forest.nodes[idY].parentId];
    expect(parentY.layout).toBe("TABBED");
    expect(parentY.childIds).toEqual(expect.arrayContaining([idY, idM]));
    expect(parentY.childIds).not.toContain(idG);
    expect(parentY.childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")).toBe(true);
    const wrapTom = wm.forest.nodes[parentY.parentId];
    expect(wrapTom.layout).toBe("HSPLIT");
    expect(wrap.layout).toBe("HSPLIT");
    expect(winG.parentNode).toBe(wrap);
    expect(winY.parentNode).toBe(tab);
  });

  it("forestApplyLayoutStructure lifts nested WINDOW then TABBED-wraps", () => {
    const { root, mon, con, winA, winB, metaA } = twoSplitTree();
    const inner = makeLive("CON", { id: "inner" }, { layout: "VSPLIT" });
    con.appendChild(inner);
    inner.appendChild(winB);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplyLayoutStructure(wm, winA, "TABBED");
    expect(out.ok).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const tabId = wm.forest.nodes[idA].parentId;
    expect(wm.forest.nodes[tabId].layout).toBe("TABBED");
    expect(wm.forest.nodes[tabId].childIds).toEqual([idA]);
    expect(wm.forest.nodes[tabId].parentId).toBe("mo0ws0");
    const innerId = [...wm.liveById.entries()].find(([, live]) => live === inner)?.[0];
    expect(innerId).toBeTruthy();
    expect(wm.forest.nodes[innerId].parentId).toBe(
      [...wm.liveById.entries()].find(([, live]) => live === con)?.[0]
    );
    expect(winB.parentNode).toBe(inner);
    expect(inner.parentNode).toBe(con);
    expect(mon.childNodes).toContain(con);
  });

  it("forestLiftToMonitor moves a nested WINDOW onto MONITOR", () => {
    const { root, mon, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestLiftToMonitor(wm, winA)).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    expect(wm.forest.nodes[idA].parentId).toBe("mo0ws0");
    expect(mon.childNodes).toContain(winA);
  });

  it("forestApplySkeletonMon invents PH WINDOW under MONITOR", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    root.appendChild(ws);
    ws.appendChild(mon);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [{ slot: "s1", roles: ["term"] }],
    });
    expect(out.ok).toBe(true);
    expect(out.created).toHaveLength(1);
    expect(out.created[0]).toMatchObject({ slot: "s1", role: "term" });
    const phIds = Object.values(wm.forest.nodes).filter(
      (n) => n.kind === "WINDOW" && n.wmClass === "forge-placeholder"
    );
    expect(phIds.length).toBeGreaterThanOrEqual(1);
    expect(phIds[0].parentId).toBe("mo0ws0");
  });
});

describe("tom-live paint contract (Forest SoT)", () => {
  it("paint mirrors TILES sibling order without inventing topology", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const hooks = { windowIdOf, createCon, focusId: "A", hostBag: createHostBag() };
    const projected = projectLiveForest(root, hooks);
    expect(projected.forest.focusId).toBe("A");
    expect(projected.liveById.get("A")).toBe(winA);
    expect(projected.liveById.get("B")).toBe(winB);

    paintLiveForest(projected.forest, projected.liveById, hooks);
    expect(con.childNodes).toEqual([winA, winB]);
  });

  it("paint writes layout/percent from Forest onto existing live nodes", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    wm.forest.nodes[conId].layout = "VSPLIT";
    wm.forest.nodes[conId].percent = 0.4;
    const idA = wm.hostBag.idFromMeta(winA.nodeValue);
    wm.forest.nodes[idA].percent = 0.25;
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(con.layout).toBe("VSPLIT");
    expect(con.percent).toBe(0.4);
    expect(winA.percent).toBe(0.25);
    expect(winB.parentNode).toBe(con);
  });

  it("paint reuses hostBag-keyed CON actor instead of anonymous invent", () => {
    const { root, mon, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const { r } = runOpLive(wm, "join", "right", winA);
    expect(r?.ok).toBe(true);
    const wrap = mon.childNodes[0];
    expect(liveKind(wrap)).toBe("CON");
    const wrapId = [...wm.liveById.entries()].find(([, live]) => live === wrap)?.[0];
    expect(wrapId).toBeTruthy();
    expect(wm.hostBag.get(wrapId)?.actor).toBe(wrap.nodeValue);
    wm.liveById.delete(wrapId);
    const map = rebuildLiveById(wm, wm.forest);
    paintLiveForest(wm.forest, map, { windowIdOf, createCon, hostBag: wm.hostBag });
    expect(map.get(wrapId)).toBe(wrap);
    expect(wrap.childNodes).toEqual([winA, winB]);
  });

  it("projects FLOAT windows into FLOATS, not TILES", () => {
    const { root, con, winA } = twoSplitTree();
    const winF = makeLive("WINDOW", { id: "F", title: "float" });
    winF.isFloat = () => true;
    winF.mode = "FLOAT";
    con.appendChild(winF);
    const projected = projectLiveForest(root, { windowIdOf, createCon, focusId: "A" });
    const bag = floatsOf(projected.forest);
    const fNode = projected.forest.nodes.F;
    expect(bag.childIds).toContain("F");
    expect(fNode.parentId).toBe(bag.id);
    expect(isUnderFloats(projected.forest, fNode)).toBe(true);
    expect(isUnderTiles(projected.forest, fNode)).toBe(false);
    expect(isUnderTiles(projected.forest, projected.forest.nodes.A)).toBe(true);
    expect(projected.liveById.get("F")).toBe(winF);
    expect(projected.liveById.get("A")).toBe(winA);
  });

  it("paint does not ROOT-park FLOATS; float leaves TILES spine", () => {
    const { root, mon, winA, winB } = twoSplitTree();
    const floatMeta = { id: "F", title: "float" };
    const winF = makeLive("WINDOW", floatMeta);
    winF.isFloat = () => true;
    winF.mode = "FLOAT";
    mon.childNodes[0].appendChild(winF);
    const wm = makeWm(root);
    const { r, forest } = runOpLive(wm, "join", "right", winA);
    expect(r?.ok).toBe(true);
    expect(winF.isFloat()).toBe(true);
    const wrap = mon.childNodes.find((n) => liveKind(n) === "CON" && n !== winF);
    expect(wrap).toBeTruthy();
    expect(wrap.childNodes).toEqual([winA, winB]);
    expect(wrap.childNodes).not.toContain(winF);
    expect(mon.childNodes).not.toContain(winF);
    expect(winF.parentNode).not.toBe(root);
    expect(childrenOf(root)).not.toContain(winF);
    const fid = wm.hostBag.idFromWindowId("F");
    expect(fid).toBeTruthy();
    expect(floatsOf(forest).childIds).toContain(fid);
    expect(isUnderFloats(forest, forest.nodes[fid])).toBe(true);
    expect(wm.hostBag.get(fid)?.floating).toBe(true);
    expect(winF.mode).toBe("FLOAT");
    expect(winF.parentNode).toBeNull();
  });

  it("GRAB_TILE projects into FLOATS", () => {
    const { root, con } = twoSplitTree();
    const winG = makeLive("WINDOW", { id: "G", title: "grab" });
    winG.isGrabTile = () => true;
    winG.mode = "GRAB_TILE";
    con.appendChild(winG);
    const projected = projectLiveForest(root, { windowIdOf, createCon });
    expect(floatsOf(projected.forest).childIds).toContain("G");
    expect(isUnderTiles(projected.forest, projected.forest.nodes.G)).toBe(false);
  });

  it("treatGrabTileAsTiles keeps GRAB_TILE under TILES", () => {
    const { root, con } = twoSplitTree();
    const winG = makeLive("WINDOW", { id: "G", title: "grab" });
    winG.isGrabTile = () => true;
    winG.mode = "GRAB_TILE";
    con.appendChild(winG);
    const projected = projectLiveForest(root, {
      windowIdOf,
      createCon,
      treatGrabTileAsTiles: true,
    });
    expect(floatsOf(projected.forest).childIds).not.toContain("G");
    expect(isUnderTiles(projected.forest, projected.forest.nodes.G)).toBe(true);
    expect(projected.forest.nodes.G.parentId).not.toBe(floatsOf(projected.forest).id);
    expect(con.childNodes).toContain(winG);
  });

  it("treatGrabTileAsTiles still parks true FLOAT in FLOATS", () => {
    const { root, con } = twoSplitTree();
    const winF = makeLive("WINDOW", { id: "F", title: "float" });
    winF.isFloat = () => true;
    winF.mode = "FLOAT";
    con.appendChild(winF);
    const projected = projectLiveForest(root, {
      windowIdOf,
      createCon,
      treatGrabTileAsTiles: true,
    });
    expect(floatsOf(projected.forest).childIds).toContain("F");
    expect(isUnderTiles(projected.forest, projected.forest.nodes.F)).toBe(false);
  });

  it("minimized tiled WINDOW stays in TILES", () => {
    const { root, winA } = twoSplitTree();
    winA.nodeValue.minimized = true;
    const projected = projectLiveForest(root, { windowIdOf, createCon, focusId: "A" });
    expect(projected.forest.nodes.A).toBeTruthy();
    expect(isUnderTiles(projected.forest, projected.forest.nodes.A)).toBe(true);
    expect(floatsOf(projected.forest).childIds).not.toContain("A");
  });

  it("paint does not put a leftover HSPLIT CON under TABBED", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    const extra = makeLive("CON", { id: "extra-hsplit" }, { layout: "HSPLIT" });
    con.appendChild(extra);
    expect(con.childNodes).toContain(extra);
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(con.childNodes).toEqual([winA, winB]);
    expect(con.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(extra.parentNode).not.toBe(con);
  });

  it("paint lifts leftover WINDOW in a TABBED extra CON onto MONITOR", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    const extra = makeLive("CON", { id: "extra-hsplit" }, { layout: "HSPLIT" });
    const winZ = makeLive("WINDOW", { id: "Z", title: "Z" });
    extra.appendChild(winZ);
    con.appendChild(extra);
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(con.childNodes).toEqual([winA, winB]);
    expect(con.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(winZ.parentNode).toBe(mon);
    expect(extra.parentNode).not.toBe(con);
  });

  it("paint keeps a FLOAT-mode TILES window parented", () => {
    const { root, con, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const idA = wm.hostBag.idFromMeta(metaA);
    winA.isFloat = () => true;
    winA.mode = "FLOAT";
    wm.hostBag.set(idA, { floating: false });
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(winA.parentNode).toBe(con);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[idA])).toBe(true);
    expect(floatsOf(wm.forest).childIds).not.toContain(idA);
  });

  it("paint does not detach TILES-parented FLOATS window without bag.floating", () => {
    const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
    const { root, con, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const idA = wm.hostBag.idFromMeta(metaA);
    winA.isFloat = () => true;
    winA.mode = "FLOAT";
    expect(moveWindowToFloats(wm.forest, wm.forest.nodes[idA]).ok).toBe(true);
    wm.hostBag.set(idA, { floating: false });
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(winA.parentNode).toBe(con);
    expect(floatsOf(wm.forest).childIds).toContain(idA);
    const warnTexts = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnTexts.some((t) => t.includes("metric invariant paint-detach-tiles"))).toBe(true);
    warnSpy.mockRestore();
  });
});

describe("tom-live occupied skeleton + TABBED slot", () => {
  it("forestApplySkeletonMon on occupied MONITOR is spec children, not spec plus old CONs", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [
        { slot: "s0", roles: ["term"] },
        { slot: "s1", roles: ["files"] },
      ],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids.map((k) => k.kind)).toEqual(["WINDOW", "WINDOW"]);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(monTom.childIds).toEqual(expect.arrayContaining([idA, idB]));
    expect(monTom.childIds).toHaveLength(2);
    expect(con.parentNode).toBeNull();
    expect(mon.childNodes).toEqual([winA, winB]);
    expect(mon.childNodes.every((n) => liveKind(n) === "WINDOW")).toBe(true);
  });

  it("occupied nest-dual-like TABBED|TILE lifts live windows into spec", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [
        { slot: "s0", mode: "tabbed", roles: ["a", "b"] },
        { slot: "s1", roles: ["term"] },
      ],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids).toHaveLength(2);
    expect(kids[0].kind).toBe("CON");
    expect(kids[0].layout).toBe("TABBED");
    expect(kids[1].kind).toBe("WINDOW");
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(kids[0].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")).toBe(true);
    expect(kids[0].childIds).toEqual(expect.arrayContaining([idA, idB]));
    expect(con.parentNode).toBeNull();
    const tabLive = mon.childNodes.find((n) => liveKind(n) === "CON" && n.layout === "TABBED");
    expect(tabLive).toBeTruthy();
    expect(tabLive.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(tabLive.childNodes).toEqual(expect.arrayContaining([winA, winB]));
  });

  it("forestSlotSplit on a TABBED leaf does not wrap a CON inside the bag", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    forestSlotSplit(wm, winA, "VERTICAL", { force: true });
    expect(con.layout).toBe("TABBED");
    expect(con.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(con.childNodes).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    expect(
      wm.forest.nodes[conId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
    expect(mon.childNodes).not.toContain(winA);
  });

  it("forestSlotSplit on a TABBED leaf splits the bag vs siblings", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    const winC = makeLive("WINDOW", { id: "C", title: "C" });
    mon.appendChild(winC);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    expect(forestSlotSplit(wm, winA, "VERTICAL", { insertLive: winC, before: false })).toBe(true);
    expect(con.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(con.childNodes).toEqual(expect.arrayContaining([winA, winB]));
    expect(con.parentNode).not.toBe(mon);
    expect(con.parentNode.layout).toBe("VSPLIT");
    expect(con.parentNode.childNodes).toEqual(expect.arrayContaining([con, winC]));
    expect(mon.childNodes).toContain(con.parentNode);
    const idA = wm.hostBag.idFromMeta(metaA);
    const tabId = wm.forest.nodes[idA].parentId;
    expect(wm.forest.nodes[tabId].layout).toBe("TABBED");
    expect(
      wm.forest.nodes[tabId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
    const wrapId = wm.forest.nodes[tabId].parentId;
    expect(wm.forest.nodes[wrapId].layout).toBe("VSPLIT");
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(wm.forest.nodes[tabId].childIds).toEqual(expect.arrayContaining([idA, idB]));
  });

  it("forestSplit on a TABBED leaf does not nest a CON in the bag", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    forestSplit(wm, winA, "HORIZONTAL", { force: true });
    expect(con.childNodes.every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(con.childNodes).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(
      wm.forest.nodes[conId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
  });
});
