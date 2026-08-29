import { describe, expect, it } from "vitest";
import {
  applyLiveForest,
  childrenOf,
  liveKind,
  projectLiveForest,
} from "../../../lib/extension/tom-live.js";
import { getOpSet, runOpAbstract } from "../../../lib/opsets/index.js";
import { wrapMonitorMax1 } from "../../../lib/rulesets/mark2.js";
import { floatsOf, isUnderFloats, isUnderTiles, tilesOf } from "../../../lib/tom/kernel.js";

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

function runOp(root, op, dir, focusId) {
  const hooks = { windowIdOf, createCon, focusId, workareas: [] };
  const projected = projectLiveForest(root, hooks);
  expect(projected).toBeTruthy();
  const { forest, liveById, api } = projected;
  const set = getOpSet("mark2");
  const r = runOpAbstract(forest, api, (draft) => {
    const draftRoot = draft.nodes[draft.rootId];
    if (draftRoot) wrapMonitorMax1(draft, draftRoot);
    api.hydrateSeq(draft);
    return set.ops[op](draft, api, dir);
  });
  if (r?.ok) applyLiveForest(forest, liveById, hooks);
  return { r, forest, liveById };
}

describe("tom-live project + apply-back", () => {
  it("roundtrip preserves WINDOW identity and sibling order", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const hooks = { windowIdOf, createCon, focusId: "A" };
    const projected = projectLiveForest(root, hooks);
    expect(projected.forest.focusId).toBe("A");
    expect(projected.liveById.get("A")).toBe(winA);
    expect(projected.liveById.get("B")).toBe(winB);

    applyLiveForest(projected.forest, projected.liveById, hooks);
    expect(con.childNodes).toEqual([winA, winB]);
    expect(con.childNodes[0]).toBe(winA);
    expect(con.childNodes[1]).toBe(winB);
    expect(winA.parentNode).toBe(con);
    expect(winB.parentNode).toBe(con);
  });

  it("in-axis Mark 2 Move on two HSPLIT siblings swaps them", () => {
    // Given: Mon(H(A,B))  Actions: Select(A); Move(right)  Expect: Mon(H(B,A))
    const { root, con, winA, winB } = twoSplitTree();
    const { r } = runOp(root, "move", "right", "A");
    expect(r?.ok).toBe(true);
    expect(con.childNodes).toEqual([winB, winA]);
    expect(con.childNodes[0]).toBe(winB);
    expect(con.childNodes[1]).toBe(winA);
    expect(winA.parentNode).toBe(con);
    expect(winB.parentNode).toBe(con);
  });

  it("Join wraps the pair when the two windows were the split", () => {
    // Given: Mon1(H(A,B))  Join(A, right)  Expect: Mon1(V(A,B))
    const { root, mon, con, winA, winB } = twoSplitTree();
    const { r } = runOp(root, "join", "right", "A");
    expect(r?.ok).toBe(true);
    expect(mon.childNodes).toHaveLength(1);
    const wrap = mon.childNodes[0];
    expect(liveKind(wrap)).toBe("CON");
    expect(wrap.layout).toBe("VSPLIT");
    expect(wrap.childNodes).toEqual([winA, winB]);
    expect(wrap.childNodes[0]).toBe(winA);
    expect(wrap.childNodes[1]).toBe(winB);
    expect(con.parentNode).toBeNull();
    expect(idsOf(wrap)).toEqual(["A", "B"]);
  });

  it("projects FLOAT windows into FLOATS, not TILES", () => {
    const { root, con, winA } = twoSplitTree();
    const winF = makeLive("WINDOW", { id: "F", title: "float" });
    winF.isFloat = () => true;
    winF.mode = "FLOAT";
    con.appendChild(winF);
    const projected = projectLiveForest(root, { windowIdOf, createCon, focusId: "A" });
    const bag = floatsOf(projected.forest);
    const tiles = tilesOf(projected.forest);
    const fNode = projected.forest.nodes.F;
    expect(bag.childIds).toContain("F");
    expect(fNode.parentId).toBe(bag.id);
    expect(isUnderFloats(projected.forest, fNode)).toBe(true);
    expect(isUnderTiles(projected.forest, fNode)).toBe(false);
    expect(isUnderTiles(projected.forest, projected.forest.nodes.A)).toBe(true);
    expect(projected.liveById.get("F")).toBe(winF);
    expect(projected.liveById.get("A")).toBe(winA);
  });

  it("float sibling stays outside the tiled wrap and not under MONITOR", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const floatMeta = { id: "F", title: "float" };
    const winF = makeLive("WINDOW", floatMeta);
    winF.isFloat = () => true;
    winF.mode = "FLOAT";
    con.appendChild(winF);
    const { r, forest } = runOp(root, "join", "right", "A");
    expect(r?.ok).toBe(true);
    expect(winF.isFloat()).toBe(true);
    const wrap = mon.childNodes.find((n) => liveKind(n) === "CON" && n !== winF);
    expect(wrap).toBeTruthy();
    expect(wrap.childNodes).toEqual([winA, winB]);
    expect(wrap.childNodes).not.toContain(winF);
    expect(mon.childNodes).not.toContain(winF);
    expect(winF.parentNode).toBe(root);
    expect(childrenOf(winF.parentNode)).toContain(winF);
    expect(floatsOf(forest).childIds).toContain("F");
    expect(isUnderFloats(forest, forest.nodes.F)).toBe(true);
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

  it("minimized tiled WINDOW stays in TILES", () => {
    const { root, winA } = twoSplitTree();
    winA.nodeValue.minimized = true;
    const projected = projectLiveForest(root, { windowIdOf, createCon, focusId: "A" });
    expect(projected.forest.nodes.A).toBeTruthy();
    expect(isUnderTiles(projected.forest, projected.forest.nodes.A)).toBe(true);
    expect(floatsOf(projected.forest).childIds).not.toContain("A");
  });
});
