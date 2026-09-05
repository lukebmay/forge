import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  childrenOf,
  ensureLiveForest,
  forestAdmitMetaWindow,
  forestAdmitMonitor,
  forestAdmitWorkspace,
  forestApplyLayoutStructure,
  forestApplySkeletonMon,
  forestBindWindow,
  forestEnsureOnPlaceWorkspace,
  forestEnsureSpineNode,
  forestRemoveSpine,
  forestRekeySpine,
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
  forestSlotPaintRect,
  forestSlotSplit,
  forestSplit,
  forestSwapWindows,
  forestUngroup,
  forestWrapForTabStack,
  forestWrapInsert,
  liveAncestorMonitorId,
  liveKind,
  liveWindowFromActor,
  liveWindowFromMeta,
  liveChildrenForPresent,
  liveStackedOrTabbedConsForPresent,
  liveTabOpenLeafForPresent,
  paintLiveForest,
  placeDeskMatches,
  presentWmSlots,
  projectLiveForest,
  rebuildLiveById,
  resolveForestFocusId,
  seedLiveForest,
  syncForestFromTree,
} from "../../../lib/extension/tom-live.js";
import { forestSlotRect } from "../../../lib/extension/reconcile.js";
import { resetMetrics, metricsSnapshot } from "../../../lib/extension/metrics.js";
import { attachWorld } from "../../../lib/world/index.js";
import { projectForestFromTom } from "../../../lib/extension/forest-apply-snapshot.js";
import { createHostBag } from "../../../lib/host/index.js";
import { getOpSet, runOpAbstract } from "../../../lib/opsets/index.js";
import { wrapMonitorMax1 } from "../../../lib/rulesets/mark2.js";
import { applyPlaceNextOptions, findLayoutSlotDest } from "../../../lib/shared/layout-open.js";
import { resolvePlaceSlotAttachFromHint } from "../../../lib/extension/adapter-open-place.js";
import {
  createTomApi,
  floatsOf,
  isUnderFloats,
  isUnderTiles,
  moveWindowToFloats,
  parent as tomParent,
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

function occupiedOneWinTree(meta) {
  const root = makeLive("ROOT", "ROOT");
  const ws = makeLive("WORKSPACE", "ws0");
  const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
  const con = makeLive("CON", { id: "split" }, { layout: "HSPLIT" });
  const win = makeLive("WINDOW", meta);
  root.appendChild(ws);
  ws.appendChild(mon);
  mon.appendChild(con);
  con.appendChild(win);
  return { root, ws, mon, con, win, meta };
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

function forestHasLive(wm, live) {
  const id = [...(wm.liveById || [])].find(([, n]) => n === live)?.[0];
  return !!(id && wm.forest?.nodes?.[id]);
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
    const result = set.ops[op](draft, api, dir);
    if (result?.ok && typeof set.settle === "function") set.settle(draft);
    return result;
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

  it("in-axis Mark 2 Move mutates Forest sibling order (paint does not mirror GObject)", () => {
    const { root, con, winA, winB, metaA } = twoSplitTree();
    const wm = makeWm(root);
    const { r, forest } = runOpLive(wm, "move", "right", winA);
    expect(r?.ok).toBe(true);
    const nid = wm.hostBag.idFromMeta(metaA);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    expect(forest.nodes[conId].childIds).toEqual([wm.hostBag.idFromMeta(winB.nodeValue), nid]);
    expect(liveChildrenForPresent(wm, con)).toEqual([winB, winA]);
    expect(wm.liveById.get(nid)).toBe(winA);
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
    expect(liveChildrenForPresent(wm, con)).toEqual([winA, winB]);
  });

  it("Join wraps the pair when the two windows were the split", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    const { r } = runOpLive(wm, "join", "right", winA);
    expect(r?.ok).toBe(true);
    const monKids = liveChildrenForPresent(wm, mon);
    expect(monKids).toHaveLength(1);
    const wrap = monKids[0];
    expect(liveKind(wrap)).toBe("CON");
    expect(wrap.layout).toBe("VSPLIT");
    expect(liveChildrenForPresent(wm, wrap)).toEqual([winA, winB]);
    const wrapId = [...wm.liveById.entries()].find(([, live]) => live === wrap)?.[0];
    expect(wrapId).toBeTruthy();
    expect(wm.hostBag.has(wrapId)).toBe(true);
    expect(wm.forest.nodes.mo0ws0.childIds).toEqual([wrapId]);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeUndefined();
  });

  it("empty Forest CON does not present GObject leftover kids", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    ensureLiveForest(wm, { windowIdOf, createCon });
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    wm.forest.nodes[conId].childIds = [];
    con.childNodes = [winA, winB];
    expect(liveChildrenForPresent(wm, con)).toEqual([]);
  });

  it("empty Forest MONITOR does not present GObject leftover kids", () => {
    const { root, mon, winA } = occupiedOneWinTree({ id: "A", title: "A" });
    const wm = makeWm(root);
    ensureLiveForest(wm, { windowIdOf, createCon });
    const monId = [...wm.liveById.entries()].find(([, live]) => live === mon)?.[0];
    expect(monId).toBeTruthy();
    wm.forest.nodes[monId].childIds = [];
    mon.childNodes = [winA];
    expect(liveChildrenForPresent(wm, mon)).toEqual([]);
  });

  it("paintLiveForest drops empty CON chrome and does not invent it", () => {
    const { root, con } = twoSplitTree();
    const wm = makeWm(root);
    const forest = ensureLiveForest(wm, { windowIdOf, createCon });
    const empty = {
      id: "empty-con",
      kind: "CON",
      layout: "HSPLIT",
      parentId: forest.monitors[0].id,
      childIds: [],
      percent: 0.5,
      userSized: false,
    };
    forest.nodes[empty.id] = empty;
    forest.monitors[0].childIds.push(empty.id);
    const ghost = createCon();
    wm.liveById.set(empty.id, ghost);
    paintLiveForest(forest, wm.liveById, {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(wm.liveById.has(empty.id)).toBe(false);
    expect([...wm.liveById.values()]).not.toContain(ghost);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
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

  it("forestAdmitMetaWindow invents Forest WINDOW + bag without prior createNode attach", () => {
    const prevDisplay = global.display;
    global.display = { get_focus_window: () => null };
    try {
      const { root, mon, con } = twoSplitTree();
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
      expect(conId).toBeTruthy();
      const metaN = { id: "N1", title: "admit-n", wm_class: "admit" };
      expect(mon.childNodes.some((c) => c.nodeValue === metaN)).toBe(false);
      expect(con.childNodes.some((c) => c.nodeValue === metaN)).toBe(false);

      const admitted = forestAdmitMetaWindow(wm, metaN, {
        parentId: conId,
        underFloats: false,
        mode: "FLOAT",
      });
      expect(admitted?.id).toBeTruthy();
      expect(admitted.live).toBeTruthy();
      expect(admitted.live.nodeValue).toBe(metaN);
      expect(wm.forest.nodes[admitted.id]?.kind).toBe("WINDOW");
      expect(wm.forest.nodes[admitted.id]?.parentId).toBe(conId);
      expect(wm.hostBag.idFromMeta(metaN)).toBe(admitted.id);
      expect(wm.hostBag.get(admitted.id)?.windowId).toBe("N1");
      expect(wm.hostBag.get(admitted.id)?.floating).toBe(false);
      expect(wm.liveById.get(admitted.id)).toBe(admitted.live);
      expect(liveChildrenForPresent(wm, con)).toContain(admitted.live);
      expect(admitted.live.appendChild).toBeUndefined();
      expect(admitted.live.parentNode).toBeUndefined();
    } finally {
      global.display = prevDisplay;
    }
  });

  it("forestAdmitMetaWindow is idempotent on second admit of same meta", () => {
    const prevDisplay = global.display;
    global.display = { get_focus_window: () => null };
    try {
      const { root, con } = twoSplitTree();
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
      const metaN = { id: "N2", title: "admit-2", wm_class: "admit" };
      const first = forestAdmitMetaWindow(wm, metaN, { parentId: conId });
      const second = forestAdmitMetaWindow(wm, metaN, { parentId: conId, underFloats: true });
      expect(first?.id).toBeTruthy();
      expect(second?.id).toBe(first.id);
      expect(wm.hostBag.idFromMeta(metaN)).toBe(first.id);
      expect(
        Object.values(wm.forest.nodes).filter((n) => n.kind === "WINDOW" && n.label === "admit-2")
      ).toHaveLength(1);
      expect(floatsOf(wm.forest).childIds).toContain(first.id);
      expect(wm.hostBag.get(first.id)?.floating).toBe(true);
    } finally {
      global.display = prevDisplay;
    }
  });

  it("forestAdmitMetaWindow beforeId inserts before PH sibling in Forest", () => {
    const prevDisplay = global.display;
    global.display = { get_focus_window: () => null };
    try {
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
      const phTom = Object.values(wm.forest.nodes).find(
        (n) => n.kind === "WINDOW" && n.wmClass === "forge-placeholder"
      );
      expect(phTom).toBeTruthy();
      const parentId = phTom.parentId;
      const metaW = { id: "W-ph", title: "real", wm_class: "term" };
      const admitted = forestAdmitMetaWindow(wm, metaW, {
        parentId,
        beforeId: phTom.id,
        underFloats: false,
      });
      expect(admitted?.id).toBeTruthy();
      const kids = wm.forest.nodes[parentId].childIds;
      const iWin = kids.indexOf(admitted.id);
      const iPh = kids.indexOf(phTom.id);
      expect(iWin).toBeGreaterThanOrEqual(0);
      expect(iPh).toBeGreaterThanOrEqual(0);
      expect(iWin).toBeLessThan(iPh);
    } finally {
      global.display = prevDisplay;
    }
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

  it("forestSetWindowFloating retile uses Meta moNwsW not other-ws focus", () => {
    const prevDisplay = global.display;
    global.display = {
      get_focus_window: () => null,
      get_n_monitors: () => 1,
      get_workspace_manager: () => ({
        get_active_workspace_index: () => 1,
      }),
    };
    try {
      const root = makeLive("ROOT", "ROOT");
      const ws0 = makeLive("WORKSPACE", "ws0");
      const mon0 = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
      const metaFocus = {
        id: "F",
        title: "focus",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 0 }),
      };
      const winFocus = makeLive("WINDOW", metaFocus);
      root.appendChild(ws0);
      ws0.appendChild(mon0);
      mon0.appendChild(winFocus);
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      forestAdmitMonitor(wm, 1, 0, { layout: "HSPLIT", tree: root });
      expect(wm.forest.nodes.mo0ws1?.kind).toBe("MONITOR");

      const metaNew = {
        id: "N",
        title: "new",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 1 }),
      };
      const admitted = forestAdmitMetaWindow(wm, metaNew, {
        underFloats: true,
        mode: "FLOAT",
      });
      expect(admitted?.id).toBeTruthy();
      expect(isUnderFloats(wm.forest, wm.forest.nodes[admitted.id])).toBe(true);
      wm.forest.focusId = wm.hostBag.idFromMeta(metaFocus);
      expect(forestSetWindowFloating(wm, admitted.live, false)).toBe(true);
      expect(wm.forest.nodes[admitted.id].parentId).toBe("mo0ws1");
    } finally {
      global.display = prevDisplay;
    }
  });

  it("forestSetWindowFloating retile honors empty-head sticky mon over Meta", () => {
    const prevDisplay = global.display;
    global.display = {
      get_focus_window: () => null,
      get_n_monitors: () => 2,
      get_workspace_manager: () => ({
        get_active_workspace_index: () => 0,
      }),
    };
    try {
      const root = makeLive("ROOT", "ROOT");
      const ws0 = makeLive("WORKSPACE", "ws0");
      const mon0 = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
      const metaA = {
        id: "A",
        title: "a",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 0 }),
      };
      const winA = makeLive("WINDOW", metaA);
      root.appendChild(ws0);
      ws0.appendChild(mon0);
      mon0.appendChild(winA);
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      forestAdmitMonitor(wm, 0, 1, { layout: "HSPLIT", tree: root });
      expect(wm.forest.nodes.mo1ws0?.kind).toBe("MONITOR");

      const metaNew = {
        id: "C",
        title: "nautilus",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 0 }),
        _forgeDockStickyMon: 1,
        _forgeDockStickyUntil: Date.now() + 4000,
      };
      const admitted = forestAdmitMetaWindow(wm, metaNew, {
        underFloats: true,
        mode: "FLOAT",
      });
      expect(admitted?.id).toBeTruthy();
      expect(isUnderFloats(wm.forest, wm.forest.nodes[admitted.id])).toBe(true);
      expect(forestSetWindowFloating(wm, admitted.live, false)).toBe(true);
      expect(wm.forest.nodes[admitted.id].parentId).toBe("mo1ws0");
    } finally {
      global.display = prevDisplay;
    }
  });

  it("forestSetWindowFloating sticky occupied dest does not mon-root dump", () => {
    const prevDisplay = global.display;
    global.display = {
      get_focus_window: () => null,
      get_n_monitors: () => 2,
      get_workspace_manager: () => ({
        get_active_workspace_index: () => 0,
      }),
    };
    try {
      const root = makeLive("ROOT", "ROOT");
      const ws0 = makeLive("WORKSPACE", "ws0");
      const mon0 = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
      const metaA = {
        id: "A",
        title: "a",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 0 }),
      };
      const winA = makeLive("WINDOW", metaA);
      root.appendChild(ws0);
      ws0.appendChild(mon0);
      mon0.appendChild(winA);
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      forestAdmitMonitor(wm, 0, 1, { layout: "HSPLIT", tree: root });
      const metaSlot = {
        id: "S",
        title: "slot",
        get_monitor: () => 1,
        get_workspace: () => ({ index: () => 0 }),
      };
      const admittedSlot = forestAdmitMetaWindow(wm, metaSlot, {
        parentId: "mo1ws0",
        mode: "TILE",
      });
      expect(admittedSlot?.id).toBeTruthy();
      expect(wm.forest.nodes[admittedSlot.id].parentId).toBe("mo1ws0");

      const metaNew = {
        id: "C",
        title: "late",
        get_monitor: () => 0,
        get_workspace: () => ({ index: () => 0 }),
        _forgeDockStickyMon: 1,
        _forgeDockStickyUntil: Date.now() + 4000,
      };
      const admitted = forestAdmitMetaWindow(wm, metaNew, {
        underFloats: true,
        mode: "FLOAT",
      });
      expect(forestSetWindowFloating(wm, admitted.live, false)).toBe(true);
      expect(wm.forest.nodes[admitted.id].parentId).not.toBe("mo1ws0");
    } finally {
      global.display = prevDisplay;
    }
  });

  it("forestSetWindowFloating unfloat slot-splits occupied H not even-thirds", () => {
    const { root, winA, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    wm.lastFocusedWindow = winA;
    wm.forest.focusId = wm.hostBag.idFromMeta(metaA);
    const metaC = {
      id: "C",
      title: "c",
      get_monitor: () => 0,
      get_workspace: () => ({ index: () => 0 }),
    };
    const admitted = forestAdmitMetaWindow(wm, metaC, {
      underFloats: true,
      mode: "FLOAT",
    });
    expect(admitted?.id).toBeTruthy();
    expect(forestSetWindowFloating(wm, admitted.live, false)).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const idC = admitted.id;
    const parentA = tomParent(wm.forest, wm.forest.nodes[idA]);
    const parentB = tomParent(wm.forest, wm.forest.nodes[idB]);
    const parentC = tomParent(wm.forest, wm.forest.nodes[idC]);
    expect(parentC.id).toBe(parentA.id);
    expect(parentC.id).not.toBe(parentB.id);
    expect(parentA.childIds).toEqual(expect.arrayContaining([idA, idC]));
    expect(parentA.childIds).not.toContain(idB);
    expect(wm.forest.nodes[idB].percent).toBeCloseTo(0.5);
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
      wm,
    });
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(winA.mode).toBe("FLOAT");

    expect(forestSetWindowFloating(wm, winA, false)).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(false);
  });

  it("alignForestFloatsToLiveTiles does not pull float-class Guake onto TILES", () => {
    const metaG = { id: "G", title: "Guake!", wm_class: "Guake" };
    const { root, mon, win, meta } = occupiedOneWinTree(metaG);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(meta);
    expect(forestSetWindowFloating(wm, win, true)).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    mon.appendChild(win);
    expect(forestSetLayout(wm, mon, "HSPLIT")).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
  });

  it("alignForestFloatsToLiveTiles keeps FLOATS when GObject is chrome-parked under mon", () => {
    const infoSpy = vi.spyOn(Logger, "info").mockImplementation(() => {});
    const { root, mon, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(forestSetWindowFloating(wm, winA, true)).toBe(true);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
    mon.appendChild(winA);
    expect(forestSetLayout(wm, mon, "HSPLIT")).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
    const texts = infoSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("align-floats-to-tiles"))).toBe(false);
    infoSpy.mockRestore();
  });

  it("alignForestFloatsToLiveTiles heals bag.floating WINDOW stuck under TILES", () => {
    const infoSpy = vi.spyOn(Logger, "info").mockImplementation(() => {});
    const { root, mon, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    // Simulate thrash: TILES parent + bag.floating (old align / park residue).
    wm.hostBag.set(nid, { floating: true });
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(true);
    mon.appendChild(winA);
    expect(forestSetLayout(wm, mon, "HSPLIT")).toBe(true);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[nid])).toBe(true);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[nid])).toBe(false);
    expect(wm.hostBag.get(nid)?.floating).toBe(true);
    const texts = infoSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("heal-float-in-tiles"))).toBe(true);
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

  it("forestRemoveWindow accepts Forest nanoid string", () => {
    const { root, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nid = wm.hostBag.idFromMeta(metaA);
    expect(forestRemoveWindow(wm, nid)).toBe(true);
    expect(wm.forest.nodes[nid]).toBeUndefined();
    expect(wm.hostBag.has(nid)).toBe(false);
  });

  it("liveWindowFromActor finds detached live via bag meta", () => {
    const { root, winA, metaA } = twoSplitTree();
    const actor = { id: "actor-a" };
    metaA.get_compositor_private = () => actor;
    winA.parentNode = null;
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(liveWindowFromActor(wm, actor)).toBe(winA);
    expect(liveWindowFromMeta(wm, metaA)).toBe(winA);
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

  it("forestAdmitWorkspace invents Forest WS + bag without createNode", () => {
    const root = makeLive("ROOT", "ROOT");
    const wm = makeWm(root);
    const first = forestAdmitWorkspace(wm, 0, { layout: "HSPLIT", tree: root });
    expect(first?.id).toBe("ws0");
    expect(first.created).toBe(true);
    expect(wm.forest.nodes.ws0?.kind).toBe("WORKSPACE");
    expect(wm.hostBag.get("ws0")?.actor).toBeTruthy();
    expect(wm.liveById.get("ws0")).toBe(first.live);
    expect(first.live.nodeValue).toBe("ws0");
    expect(wm.forest.nodes.ws0.parentId).toBe(wm.forest.rootId);
    expect(wm.forest.nodes[wm.forest.rootId].childIds).toContain("ws0");

    const second = forestAdmitWorkspace(wm, 0, { tree: root });
    expect(second?.id).toBe("ws0");
    expect(second.live).toBe(first.live);
    expect(second.created).toBe(false);
  });

  it("forestAdmitMonitor invents parent WS + MONITOR; idempotent", () => {
    const root = makeLive("ROOT", "ROOT");
    const wm = makeWm(root);
    const first = forestAdmitMonitor(wm, 1, 0, { layout: "VSPLIT", tree: root });
    expect(first?.id).toBe("mo0ws1");
    expect(wm.forest.nodes.ws1?.kind).toBe("WORKSPACE");
    expect(wm.forest.nodes.mo0ws1?.kind).toBe("MONITOR");
    expect(wm.forest.nodes.mo0ws1.layout).toBe("VSPLIT");
    expect(wm.forest.monitors.some((m) => m.id === "mo0ws1")).toBe(true);
    expect(wm.hostBag.get("mo0ws1")?.actor).toBeTruthy();
    expect(wm.forest.nodes.mo0ws1.parentId).toBe("ws1");
    expect(wm.forest.nodes.ws1.childIds).toContain("mo0ws1");

    const second = forestAdmitMonitor(wm, 1, 0, { layout: "VSPLIT", tree: root });
    expect(second?.id).toBe(first.id);
    expect(second.live).toBe(first.live);
    expect(second.created).toBe(false);
  });

  it("forestRemoveSpine + forestRekeySpine keep Forest/bag/liveById coherent", () => {
    const root = makeLive("ROOT", "ROOT");
    const wm = makeWm(root);
    forestAdmitMonitor(wm, 2, 0, { layout: "HSPLIT", tree: root });
    expect(forestRekeySpine(wm, "ws2", "ws1")).toBe(true);
    expect(wm.forest.nodes.ws2).toBeUndefined();
    expect(wm.forest.nodes.ws1?.kind).toBe("WORKSPACE");
    expect(wm.liveById.get("ws1")?.nodeValue).toBe("ws1");
    expect(forestRekeySpine(wm, "mo0ws2", "mo0ws1")).toBe(true);
    expect(wm.forest.nodes.mo0ws1?.kind).toBe("MONITOR");
    expect(wm.forest.nodes.mo0ws1.parentId).toBe("ws1");
    expect(forestRemoveSpine(wm, "ws1")).toBe(true);
    expect(wm.forest.nodes.ws1).toBeUndefined();
    expect(wm.forest.nodes.mo0ws1).toBeUndefined();
    expect(wm.liveById.has("ws1")).toBe(false);
    expect(wm.liveById.has("mo0ws1")).toBe(false);
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
    expect(liveChildrenForPresent(wm, con)).toEqual([winB, winA]);
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
    expect(liveChildrenForPresent(wm, con)).toEqual([winB, winA]);
  });

  it("forestOrderWindows reorders same-parent siblings", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestOrderWindows(wm, [winB, winA]);
    expect(out).toMatchObject({ ok: true, reordered: true, scope: "siblings" });
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    const idA = wm.hostBag.idFromMeta(winA.nodeValue);
    const idB = wm.hostBag.idFromMeta(winB.nodeValue);
    expect(wm.forest.nodes[conId].childIds).toEqual([idB, idA]);
    expect(liveChildrenForPresent(wm, con)).toEqual([winB, winA]);
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

  it("forestMergeWindowsIntoGroup of MONITOR pair TAB fills the host slot", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const metaA = { id: "A", title: "A" };
    const metaB = { id: "B", title: "B" };
    const winA = makeLive("WINDOW", metaA);
    const winB = makeLive("WINDOW", metaB);
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(winA);
    mon.appendChild(winB);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    wm.forest.nodes[idA].percent = 0.5;
    wm.forest.nodes[idB].percent = 0.5;
    const group = forestMergeWindowsIntoGroup(wm, winA, winB, "TABBED");
    expect(group).toBeTruthy();
    const wrapId = wm.forest.nodes[idA].parentId;
    expect(wm.forest.nodes[idB].parentId).toBe(wrapId);
    expect(wm.forest.nodes[wrapId].layout).toBe("TABBED");
    expect(wm.forest.nodes[wrapId].percent).toBeCloseTo(1);
    expect(wm.forest.nodes[wrapId].parentId).toBe("mo0ws0");
  });

  it("forestMergeWindowsIntoGroup flips a 2-child HSPLIT CON to TABBED", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const group = forestMergeWindowsIntoGroup(wm, winA, winB, "TABBED");
    expect(group).toBe(con);
    expect(con.layout).toBe("TABBED");
    expect(liveChildrenForPresent(wm, con)).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(wm.forest.nodes[conId].layout).toBe("TABBED");
    expect(wm.forest.nodes[conId].childIds).toEqual(
      expect.arrayContaining([wm.hostBag.idFromMeta(metaA), wm.hostBag.idFromMeta(metaB)])
    );
  });

  it("forestWrapInsert TABBED wrap does not swallow a TABBED sibling CON", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    con.removeChild(winB);
    const tab = makeLive("CON", { id: "tabs" }, { layout: "TABBED" });
    const winC = makeLive("WINDOW", { id: "C", title: "YouTube" });
    tab.appendChild(winC);
    con.appendChild(tab);
    mon.appendChild(winB);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestWrapInsert(wm, winA, winB, "TABBED")).toBe(true);
    expect(con.layout).toBe("HSPLIT");
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const wrapId = wm.forest.nodes[idA].parentId;
    const wrap = wm.liveById.get(wrapId);
    expect(wrap.layout).toBe("TABBED");
    expect(liveChildrenForPresent(wm, wrap).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, wrap)).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    const tabId = [...wm.liveById.entries()].find(([, live]) => live === tab)?.[0];
    expect(wm.forest.nodes[tabId].parentId).toBe(conId);
    expect(wm.forest.nodes[tabId].childIds).toEqual([wm.hostBag.idFromMeta(winC.nodeValue)]);
    expect(liveChildrenForPresent(wm, con)).toEqual(expect.arrayContaining([wrap, tab]));
    expect(wm.forest.nodes[wrapId].layout).toBe("TABBED");
    expect(wm.forest.nodes[wrapId].childIds).toEqual(expect.arrayContaining([idA, idB]));
    expect(wm.forest.nodes[conId].layout).toBe("HSPLIT");
    expect(
      wm.forest.nodes[conId].childIds.every((id) => {
        const n = wm.forest.nodes[id];
        return n.kind === "CON" && (n.layout === "TABBED" ? true : n.layout === "HSPLIT");
      })
    ).toBe(true);
  });

  it("forestWrapInsert wraps pointer then inserts focus before it", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestWrapInsert(wm, winB, winA, "VSPLIT", { before: true })).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const wrapId = wm.forest.nodes[idB].parentId;
    const wrap = wm.liveById.get(wrapId);
    expect(wrap).not.toBe(con);
    expect(wrap.layout).toBe("VSPLIT");
    expect(liveChildrenForPresent(wm, wrap)).toEqual([winA, winB]);
    expect(wm.forest.nodes[wrapId].layout).toBe("VSPLIT");
    expect(wm.forest.nodes[wrapId].childIds).toEqual([idA, idB]);
  });

  it("forestSlotSplit wraps a sibling unit then inserts the other WINDOW", () => {
    const { root, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSlotSplit(wm, winB, "HORIZONTAL", { insertLive: winA, before: true })).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const wrapId = wm.forest.nodes[idB].parentId;
    const wrap = wm.liveById.get(wrapId);
    expect(wrap.layout).toBe("HSPLIT");
    expect(liveChildrenForPresent(wm, wrap)).toEqual([winA, winB]);
    expect(liveChildrenForPresent(wm, con)).toContain(wrap);
    expect(wm.forest.nodes[idA].parentId).toBe(wm.forest.nodes[idB].parentId);
  });

  it("forestUngroup promotes CON children onto MONITOR", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const grand = forestUngroup(wm, con);
    expect(grand).toBe(mon);
    expect(liveChildrenForPresent(wm, mon)).toEqual(expect.arrayContaining([winA, winB]));
    expect(liveChildrenForPresent(wm, mon)).not.toContain(con);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(wm.forest.nodes[idA].parentId).toBe("mo0ws0");
    expect(wm.forest.nodes[idB].parentId).toBe("mo0ws0");
  });

  it("forestUngroup WINDOW argument dissolves the parent CON", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestUngroup(wm, winA)).toBe(mon);
    expect(liveChildrenForPresent(wm, mon)).toEqual(expect.arrayContaining([winA, winB]));
    expect(liveChildrenForPresent(wm, mon)).not.toContain(con);
  });

  it("forestSplit wraps a WINDOW then moves the wrap before dest", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSplit(wm, winA, "VERTICAL", { moveToLive: mon, moveBeforeLive: con })).toBe(true);
    const idA = wm.hostBag.idFromMeta(winA.nodeValue);
    const wrapId = wm.forest.nodes[idA].parentId;
    const wrap = wm.liveById.get(wrapId);
    expect(wrap.layout).toBe("VSPLIT");
    expect(wm.forest.nodes[wrapId].parentId).toBe("mo0ws0");
    const monKids = liveChildrenForPresent(wm, mon);
    expect(monKids.indexOf(wrap)).toBeLessThan(monKids.indexOf(con));
    expect(liveChildrenForPresent(wm, con)).toContain(winB);
  });

  it("forestOrderLiveChildren reorders CON kids in Forest (no GObject mirror)", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestOrderLiveChildren(wm, con, [winB, winA])).toBe(true);
    expect(liveChildrenForPresent(wm, con)).toEqual([winB, winA]);
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
    expect(liveChildrenForPresent(wm, con)).toContain(wrap);
    expect(liveChildrenForPresent(wm, wrap)).toContain(winA);
    expect(liveChildrenForPresent(wm, mon)).toContain(con);
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
    expect(liveChildrenForPresent(wm, wrap)).toContain(winG);
    expect(liveChildrenForPresent(wm, tab)).toContain(winY);
  });

  it("R049: TABBED layout joins MONITOR sibling into existing TABBED", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const ghost = makeLive("WINDOW", { id: "G", title: "ghostty" });
    const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
    const winY = makeLive("WINDOW", { id: "Y", title: "YouTube" });
    const winM = makeLive("WINDOW", { id: "M", title: "Gmail" });
    const winV = makeLive("WINDOW", { id: "V", title: "Voice" });
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(ghost);
    mon.appendChild(tab);
    tab.appendChild(winY);
    tab.appendChild(winM);
    mon.appendChild(winV);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplyLayoutStructure(wm, winV, "TABBED", { structure: true });
    expect(out.ok).toBe(true);
    const idY = wm.hostBag.idFromMeta(winY.nodeValue);
    const idM = wm.hostBag.idFromMeta(winM.nodeValue);
    const idV = wm.hostBag.idFromMeta(winV.nodeValue);
    const parentV = wm.forest.nodes[wm.forest.nodes[idV].parentId];
    expect(parentV.kind).toBe("CON");
    expect(parentV.layout).toBe("TABBED");
    expect(parentV.childIds).toEqual(expect.arrayContaining([idY, idM, idV]));
    expect(parentV.parentId).toBe("mo0ws0");
    expect(wm.forest.nodes[idV].parentId).not.toBe("mo0ws0");
    expect(liveChildrenForPresent(wm, tab)).toContain(winV);
  });

  it("R049: forestReparent onto TABBED leaf keeps bag when GObject parent is MONITOR", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
    const winY = makeLive("WINDOW", { id: "Y", title: "YouTube" });
    const winM = makeLive("WINDOW", { id: "M", title: "Gmail" });
    const winV = makeLive("WINDOW", { id: "V", title: "Voice" });
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(tab);
    tab.appendChild(winY);
    tab.appendChild(winM);
    mon.appendChild(winV);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    winY.parentNode = mon;
    winM.parentNode = mon;
    winV.parentNode = mon;
    tab.parentNode = null;
    expect(forestReparent(wm, winV, winY, { destIsWindow: true })).toBe(true);
    const idY = wm.hostBag.idFromMeta(winY.nodeValue);
    const idV = wm.hostBag.idFromMeta(winV.nodeValue);
    const parentV = wm.forest.nodes[wm.forest.nodes[idV].parentId];
    expect(parentV.layout).toBe("TABBED");
    expect(parentV.childIds).toEqual(expect.arrayContaining([idY, idV]));
    expect(wm.forest.nodes[idV].parentId).toBe(wm.forest.nodes[idY].parentId);
    expect(wm.forest.nodes[idV].parentId).not.toBe("mo0ws0");
  });

  it("R049: forestMergeWindowsIntoGroup { group } joins MONITOR sibling", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
    const winY = makeLive("WINDOW", { id: "Y", title: "YouTube" });
    const winM = makeLive("WINDOW", { id: "M", title: "Gmail" });
    const winV = makeLive("WINDOW", { id: "V", title: "Voice" });
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(tab);
    tab.appendChild(winY);
    tab.appendChild(winM);
    mon.appendChild(winV);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const group = forestMergeWindowsIntoGroup(wm, winY, winV, "TABBED", { group: tab });
    expect(group).toBe(tab);
    const idV = wm.hostBag.idFromMeta(winV.nodeValue);
    expect(wm.forest.nodes[idV].parentId).toBe(
      wm.forest.nodes[wm.hostBag.idFromMeta(winY.nodeValue)].parentId
    );
    expect(wm.forest.nodes[idV].parentId).not.toBe("mo0ws0");
    expect(liveChildrenForPresent(wm, tab)).toContain(winV);
  });

  it("R050: liveStackedOrTabbedConsForPresent uses Forest when GObject CON walk is empty", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const tab0 = makeLive("CON", { id: "t0" }, { layout: "TABBED" });
    const tab1 = makeLive("CON", { id: "t1" }, { layout: "TABBED" });
    const winA = makeLive("WINDOW", { id: "A", title: "A" });
    const winB = makeLive("WINDOW", { id: "B", title: "B" });
    const winC = makeLive("WINDOW", { id: "C", title: "C" });
    const winD = makeLive("WINDOW", { id: "D", title: "D" });
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(tab0);
    mon.appendChild(tab1);
    tab0.appendChild(winA);
    tab0.appendChild(winB);
    tab1.appendChild(winC);
    tab1.appendChild(winD);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    root.getNodeByType = () => [];
    wm.tree.getNodeByType = () => [];
    wm.currentWsNode = ws;
    ws.getNodeByType = () => [];
    const cons = liveStackedOrTabbedConsForPresent(wm, { root: ws });
    expect(cons).toHaveLength(2);
    expect(cons).toEqual(expect.arrayContaining([tab0, tab1]));
    expect(liveTabOpenLeafForPresent(wm, tab0)).toBe(winA);
    expect(liveTabOpenLeafForPresent(wm, tab1)).toBe(winC);
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
    expect(liveChildrenForPresent(wm, inner)).toContain(winB);
    expect(liveChildrenForPresent(wm, con)).toContain(inner);
    expect(liveChildrenForPresent(wm, mon)).toContain(con);
  });

  it("forestLiftToMonitor moves a nested WINDOW onto MONITOR", () => {
    const { root, mon, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestLiftToMonitor(wm, winA)).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    expect(wm.forest.nodes[idA].parentId).toBe("mo0ws0");
    expect(liveChildrenForPresent(wm, mon)).toContain(winA);
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

  it("PlaceNext role-ph does not steal other-workspace same-slot PH", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws0 = makeLive("WORKSPACE", "ws0");
    const ws1 = makeLive("WORKSPACE", "ws1");
    const mon0 = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const mon1 = makeLive("MONITOR", "mo0ws1", { layout: "HSPLIT" });
    root.appendChild(ws0);
    root.appendChild(ws1);
    ws0.appendChild(mon0);
    ws1.appendChild(mon1);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const spec = {
      split: "hsplit",
      children: [
        { slot: "mon0.ghostty", roles: ["ghostty"] },
        { slot: "mon0.ghostty-2", roles: ["ghostty-2"] },
      ],
    };
    expect(forestApplySkeletonMon(wm, mon0, spec).ok).toBe(true);
    expect(forestApplySkeletonMon(wm, mon1, spec).ok).toBe(true);

    const phToms = Object.values(wm.forest.nodes).filter(
      (n) => n.kind === "WINDOW" && n.wmClass === "forge-placeholder"
    );
    const live0 = phToms
      .map((n) => wm.liveById.get(n.id))
      .find(
        (live) => live?.layoutRole === "ghostty" && liveAncestorMonitorId(wm, live) === "mo0ws0"
      );
    const live1 = phToms
      .map((n) => wm.liveById.get(n.id))
      .find(
        (live) => live?.layoutRole === "ghostty" && liveAncestorMonitorId(wm, live) === "mo0ws1"
      );
    expect(live0).toBeTruthy();
    expect(live1).toBeTruthy();
    expect(liveAncestorMonitorId(wm, live0)).toBe("mo0ws0");
    expect(liveAncestorMonitorId(wm, live1)).toBe("mo0ws1");
    expect(placeDeskMatches(wm, live0, 0, 1)).toBe(false);
    expect(placeDeskMatches(wm, live1, 0, 1)).toBe(true);

    const hit = resolvePlaceSlotAttachFromHint(
      wm,
      { layoutRole: "ghostty", layoutSlot: "mon0.ghostty", workspace: 1 },
      0
    );
    expect(hit?.via).toBe("role-ph");
    expect(hit.attachLft).toBe(live1);
    expect(liveAncestorMonitorId(wm, hit.attachLft)).toBe("mo0ws1");
  });

  it("forestEnsureOnPlaceWorkspace reparents a mapped window onto PlaceNext desk", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws0 = makeLive("WORKSPACE", "ws0");
    const ws1 = makeLive("WORKSPACE", "ws1");
    const mon0 = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const mon1 = makeLive("MONITOR", "mo0ws1", { layout: "HSPLIT" });
    root.appendChild(ws0);
    root.appendChild(ws1);
    ws0.appendChild(mon0);
    ws1.appendChild(mon1);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(
      forestApplySkeletonMon(wm, mon1, {
        split: "hsplit",
        children: [{ slot: "mon0.ghostty", roles: ["ghostty"] }],
      }).ok
    ).toBe(true);
    const meta = { id: 42, title: "Ghostty", get_wm_class: () => "com.mitchellh.ghostty" };
    const admitted = forestAdmitMetaWindow(wm, meta, { parentId: "mo0ws0", monitorId: "mo0ws0" });
    expect(admitted?.id).toBeTruthy();
    expect(wm.forest.nodes[admitted.id].parentId).toBe("mo0ws0");
    const moved = forestEnsureOnPlaceWorkspace(wm, admitted.live, {
      homeMonitor: 0,
      workspace: 1,
    });
    expect(moved).toBe(true);
    expect(liveAncestorMonitorId(wm, admitted.live)).toBe("mo0ws1");
    expect(wm.forest.nodes[admitted.id].parentId).toBe("mo0ws1");
  });

  it("R048: forestBindWindow consumes Forest PH when GObject parentNode is null", () => {
    const prevDisplay = global.display;
    global.display = { get_focus_window: () => null };
    try {
      const root = makeLive("ROOT", "ROOT");
      const ws = makeLive("WORKSPACE", "ws0");
      const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
      root.appendChild(ws);
      ws.appendChild(mon);
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      const skel = forestApplySkeletonMon(wm, mon, {
        split: "hsplit",
        children: [{ slot: "s1", roles: ["term"] }],
      });
      expect(skel.ok).toBe(true);
      const phTom = Object.values(wm.forest.nodes).find(
        (n) => n.kind === "WINDOW" && n.wmClass === "forge-placeholder"
      );
      expect(phTom).toBeTruthy();
      const phLive = wm.liveById.get(phTom.id);
      expect(phLive).toBeTruthy();
      expect(phLive.parentNode).toBeFalsy();

      const meta = { id: "bind-real", title: "ghostty", wm_class: "ghostty" };
      const admitted = forestAdmitMetaWindow(wm, meta, {
        parentId: "mo0ws0",
        underFloats: false,
        mode: "TILE",
      });
      expect(admitted?.id).toBeTruthy();
      expect(forestBindWindow(wm, admitted.live, phLive)).toBe(true);
      expect(wm.forest.nodes[phTom.id]).toBeUndefined();
      expect(wm.forest.nodes[admitted.id]?.parentId).toBe("mo0ws0");
      expect(liveChildrenForPresent(wm, mon)).toContain(admitted.live);
      expect(liveChildrenForPresent(wm, mon).some((n) => n === phLive)).toBe(false);
    } finally {
      global.display = prevDisplay;
    }
  });

  it("R048: forestBindWindow moves FLOATS window onto TILES PH", () => {
    const prevDisplay = global.display;
    global.display = { get_focus_window: () => null };
    try {
      const root = makeLive("ROOT", "ROOT");
      const ws = makeLive("WORKSPACE", "ws0");
      const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
      root.appendChild(ws);
      ws.appendChild(mon);
      const wm = makeWm(root);
      seedLiveForest(wm, { windowIdOf, createCon });
      const skel = forestApplySkeletonMon(wm, mon, {
        split: "hsplit",
        children: [{ slot: "s1", roles: ["term"] }],
      });
      expect(skel.ok).toBe(true);
      const phTom = Object.values(wm.forest.nodes).find(
        (n) => n.kind === "WINDOW" && n.wmClass === "forge-placeholder"
      );
      const phLive = wm.liveById.get(phTom.id);
      expect(phLive.parentNode).toBeFalsy();

      const meta = { id: "bind-float", title: "chrome", wm_class: "google-chrome" };
      const admitted = forestAdmitMetaWindow(wm, meta, {
        underFloats: true,
        mode: "FLOAT",
      });
      expect(admitted?.id).toBeTruthy();
      expect(isUnderFloats(wm.forest, wm.forest.nodes[admitted.id])).toBe(true);
      expect(forestBindWindow(wm, admitted.live, phLive)).toBe(true);
      expect(wm.forest.nodes[phTom.id]).toBeUndefined();
      expect(isUnderFloats(wm.forest, wm.forest.nodes[admitted.id])).toBe(false);
      expect(wm.hostBag.get(admitted.id)?.floating).not.toBe(true);
      expect(admitted.live.mode).toBe("TILE");
      expect(wm.forest.nodes[admitted.id]?.parentId).toBe("mo0ws0");
      expect(liveChildrenForPresent(wm, mon)).toContain(admitted.live);
      expect(forestSetLayout(wm, mon, "HSPLIT")).toBe(true);
      expect(isUnderFloats(wm.forest, wm.forest.nodes[admitted.id])).toBe(false);
    } finally {
      global.display = prevDisplay;
    }
  });
});

describe("tom-live paint contract (Forest SoT)", () => {
  it("paint keeps liveById presence without mirroring TILES via replaceChildren", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const hooks = { windowIdOf, createCon, focusId: "A", hostBag: createHostBag() };
    const projected = projectLiveForest(root, hooks);
    expect(projected.forest.focusId).toBe("A");
    expect(projected.liveById.get("A")).toBe(winA);
    expect(projected.liveById.get("B")).toBe(winB);
    const spy = vi.spyOn(con, "replaceChildren");
    paintLiveForest(projected.forest, projected.liveById, hooks);
    expect(spy).not.toHaveBeenCalled();
    expect(projected.liveById.get("A")).toBe(winA);
    expect(projected.liveById.get("B")).toBe(winB);
    spy.mockRestore();
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
    const wrap = liveChildrenForPresent(wm, mon)[0];
    expect(liveKind(wrap)).toBe("CON");
    const wrapId = [...wm.liveById.entries()].find(([, live]) => live === wrap)?.[0];
    expect(wrapId).toBeTruthy();
    const actor = wrap.nodeValue;
    expect(wm.hostBag.get(wrapId)?.actor).toBe(actor);
    wm.liveById.delete(wrapId);
    const map = rebuildLiveById(wm, wm.forest);
    paintLiveForest(wm.forest, map, {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
      createConFromActor: (a) => makeLive("CON", a, { layout: "VSPLIT" }),
    });
    expect(map.get(wrapId)?.nodeValue).toBe(actor);
    wm.liveById = map;
    expect(liveChildrenForPresent(wm, map.get(wrapId))).toEqual([winA, winB]);
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
    const wrap = liveChildrenForPresent(wm, mon).find((n) => liveKind(n) === "CON");
    expect(wrap).toBeTruthy();
    expect(liveChildrenForPresent(wm, wrap)).toEqual([winA, winB]);
    expect(liveChildrenForPresent(wm, wrap)).not.toContain(winF);
    expect(liveChildrenForPresent(wm, mon)).not.toContain(winF);
    expect(winF.parentNode).not.toBe(root);
    expect(childrenOf(root)).not.toContain(winF);
    const fid = wm.hostBag.idFromWindowId("F");
    expect(fid).toBeTruthy();
    expect(floatsOf(forest).childIds).toContain(fid);
    expect(isUnderFloats(forest, forest.nodes[fid])).toBe(true);
    expect(wm.hostBag.get(fid)?.floating).toBe(true);
    expect(winF.mode).toBe("FLOAT");
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

  it("paint does not mirror leftover GObject kids; Forest chrome kids stay WINDOW-only", () => {
    const { root, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    const extra = makeLive("CON", { id: "extra-hsplit" }, { layout: "HSPLIT" });
    con.appendChild(extra);
    expect(con.childNodes).toContain(extra);
    const spy = vi.spyOn(con, "replaceChildren");
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(liveChildrenForPresent(wm, con)).toEqual([winA, winB]);
    expect(liveChildrenForPresent(wm, con).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(
      wm.forest.nodes[conId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
  });

  it("paint does not rehome leftover WINDOW via replaceChildren mirror", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    const extra = makeLive("CON", { id: "extra-hsplit" }, { layout: "HSPLIT" });
    const winZ = makeLive("WINDOW", { id: "Z", title: "Z" });
    extra.appendChild(winZ);
    con.appendChild(extra);
    const spy = vi.spyOn(con, "replaceChildren");
    paintLiveForest(wm.forest, rebuildLiveById(wm, wm.forest), {
      windowIdOf,
      createCon,
      hostBag: wm.hostBag,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(liveChildrenForPresent(wm, con)).toEqual([winA, winB]);
    expect(liveChildrenForPresent(wm, con).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, mon)).not.toContain(winZ);
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

  it("paint FLOATS membership is Forest; bag.floating follows paint bridge", () => {
    const { root, winA, metaA } = twoSplitTree();
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
      wm,
    });
    expect(floatsOf(wm.forest).childIds).toContain(idA);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[idA])).toBe(true);
    expect(wm.hostBag.get(idA)?.floating).toBe(true);
    expect(winA.mode).toBe("FLOAT");
  });
});

describe("tom-live occupied skeleton + TABBED slot", () => {
  it("forestApplySkeletonMon on occupied MONITOR is spec children, not spec plus old CONs", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    metaA.wm_class = "term";
    metaB.wm_class = "files";
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
    expect(forestHasLive(wm, con)).toBe(false);
    expect(liveChildrenForPresent(wm, mon)).toEqual(expect.arrayContaining([winA, winB]));
    expect(liveChildrenForPresent(wm, mon).every((n) => liveKind(n) === "WINDOW")).toBe(true);
  });

  it("occupied nest-dual-like TABBED|TILE lifts live windows into spec", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    metaA.wm_class = "a";
    metaB.wm_class = "b";
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
    expect(forestHasLive(wm, con)).toBe(false);
    const tabLive = liveChildrenForPresent(wm, mon).find(
      (n) => liveKind(n) === "CON" && n.layout === "TABBED"
    );
    expect(tabLive).toBeTruthy();
    expect(liveChildrenForPresent(wm, tabLive).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, tabLive)).toEqual(expect.arrayContaining([winA, winB]));
  });

  it("unmatched float-class live WINDOW does not fill a TILE role; PlaceNext dest is PH", () => {
    const metaG = { id: "G", title: "Guake!", wm_class: "Guake" };
    const { root, mon, con, win, meta } = occupiedOneWinTree(metaG);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [{ slot: "mon0.inkscape", roles: ["inkscape"] }],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids).toHaveLength(1);
    expect(kids[0].kind).toBe("WINDOW");
    expect(kids[0].wmClass).toBe("forge-placeholder");
    expect(wm.liveById.get(kids[0].id)?.layoutRole).toBe("inkscape");
    const idG = wm.hostBag.idFromMeta(meta);
    expect(isUnderFloats(wm.forest, wm.forest.nodes[idG])).toBe(true);
    expect(isUnderTiles(wm.forest, wm.forest.nodes[idG])).toBe(false);
    expect(wm.hostBag.get(idG)?.floating).toBe(true);
    expect(forestHasLive(wm, con)).toBe(false);
    expect(liveChildrenForPresent(wm, mon)).not.toContain(win);
    const json = projectForestFromTom(wm.forest, wm.hostBag, { liveById: wm.liveById });
    const placed = applyPlaceNextOptions(
      { op: "open", role: "inkscape", slot: "mon0.inkscape", open: { app: "inkscape" } },
      null,
      json
    );
    expect(placed.ok).toBe(true);
    expect(placed.destKind).toBe("slot");
    expect(placed.error).toBeUndefined();
  });

  it("unmatched TILE leftover does not fill a role; PH dest stays slot", () => {
    const metaN = { id: "N", title: "Home", wm_class: "org.gnome.Nautilus" };
    const { root, mon, con, win, meta } = occupiedOneWinTree(metaN);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [{ slot: "mon0.inkscape", roles: ["inkscape"] }],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    const idN = wm.hostBag.idFromMeta(meta);
    const ph = kids.find((k) => k.wmClass === "forge-placeholder");
    expect(ph).toBeTruthy();
    expect(wm.liveById.get(ph.id)?.layoutRole).toBe("inkscape");
    expect(monTom.childIds).toContain(idN);
    expect(forestHasLive(wm, con)).toBe(false);
    const json = projectForestFromTom(wm.forest, wm.hostBag, { liveById: wm.liveById });
    const placed = applyPlaceNextOptions(
      { op: "open", role: "inkscape", slot: "mon0.inkscape", open: { app: "inkscape" } },
      null,
      json
    );
    expect(placed.ok).toBe(true);
    expect(placed.destKind).toBe("slot");
  });

  it("occupied 2-slot skeleton matches live WINDOW to second role; first stays PH", () => {
    const metaY = { id: "Y", title: "YouTube", wm_class: "Google-chrome" };
    const { root, mon, con, win, meta } = occupiedOneWinTree(metaY);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [
        { slot: "mon1.ghostty", roles: ["ghostty"] },
        { slot: "mon1.s0", roles: ["YouTube"] },
      ],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids.map((k) => k.kind)).toEqual(["WINDOW", "WINDOW"]);
    expect(kids).toHaveLength(2);
    expect(forestHasLive(wm, con)).toBe(false);
    const idY = wm.hostBag.idFromMeta(meta);
    expect(monTom.childIds[1]).toBe(idY);
    const ph = kids[0];
    expect(ph.wmClass).toBe("forge-placeholder");
    const phLive = wm.liveById.get(ph.id);
    expect(phLive?.layoutRole).toBe("ghostty");
    expect(wm.hostBag.get(ph.id)?.layoutRole).toBe("ghostty");
    expect(wm.hostBag.get(idY)?.layoutRole).toBe("YouTube");
    const monKids = liveChildrenForPresent(wm, mon);
    expect(monKids.every((n) => liveKind(n) === "WINDOW")).toBe(true);
    expect(monKids).toHaveLength(2);
    expect(monKids[1]).toBe(win);

    const json = projectForestFromTom(wm.forest, wm.hostBag, { liveById: wm.liveById });
    const dest = findLayoutSlotDest(json, { role: "ghostty", slot: "mon1.ghostty" });
    expect(dest).toBeTruthy();
    expect(dest.destKind).toBe("slot");
    const placed = applyPlaceNextOptions(
      { op: "open", role: "ghostty", slot: "mon1.ghostty", open: { app: "ghostty" } },
      null,
      json
    );
    expect(placed.ok).toBe(true);
    expect(placed.destKind).toBe("slot");
    expect(placed.error).toBeUndefined();
  });

  it("occupied 2-slot matches hyphenated reverse-DNS role id to live class", () => {
    const metaE = {
      id: "E",
      title: "Text Editor",
      wm_class: "org.gnome.TextEditor",
    };
    const { root, mon, con, win, meta } = occupiedOneWinTree(metaE);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [
        { slot: "mon1.ghostty-2", roles: ["ghostty-2"] },
        { slot: "mon1.org-gnome-TextEditor", roles: ["org-gnome-TextEditor"] },
      ],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids.map((k) => k.kind)).toEqual(["WINDOW", "WINDOW"]);
    const idE = wm.hostBag.idFromMeta(meta);
    expect(monTom.childIds[1]).toBe(idE);
    expect(kids[0].wmClass).toBe("forge-placeholder");
    expect(wm.liveById.get(kids[0].id)?.layoutRole).toBe("ghostty-2");
    expect(forestHasLive(wm, con)).toBe(false);
    expect(liveChildrenForPresent(wm, mon)[1]).toBe(win);
    const json = projectForestFromTom(wm.forest, wm.hostBag, { liveById: wm.liveById });
    const placed = applyPlaceNextOptions(
      { op: "open", role: "ghostty-2", slot: "mon1.ghostty-2", open: { app: "ghostty" } },
      null,
      json
    );
    expect(placed.ok).toBe(true);
    expect(placed.destKind).toBe("slot");
  });

  it("two live ghostty WINDOWs fill ghostty and ghostty-2 (R063)", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    metaA.wm_class = "com.mitchellh.ghostty";
    metaA.title = "one";
    metaB.wm_class = "com.mitchellh.ghostty";
    metaB.title = "two";
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const out = forestApplySkeletonMon(wm, mon, {
      split: "hsplit",
      children: [
        { slot: "mon0.ghostty", roles: ["ghostty"] },
        { slot: "mon0.ghostty-2", roles: ["ghostty-2"] },
      ],
    });
    expect(out.ok).toBe(true);
    const monTom = wm.forest.nodes.mo0ws0;
    const kids = monTom.childIds.map((id) => wm.forest.nodes[id]);
    expect(kids.map((k) => k.kind)).toEqual(["WINDOW", "WINDOW"]);
    expect(kids.every((k) => k.wmClass !== "forge-placeholder")).toBe(true);
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    expect(monTom.childIds).toEqual(expect.arrayContaining([idA, idB]));
    expect(monTom.childIds).toHaveLength(2);
    expect(forestHasLive(wm, con)).toBe(false);
    expect(wm.hostBag.get(idA)?.layoutRole).toBe("ghostty");
    expect(wm.hostBag.get(idB)?.layoutRole).toBe("ghostty-2");
  });

  it("forestSlotSplit on a TABBED leaf does not wrap a CON inside the bag", () => {
    const { root, mon, con, winA, winB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    forestSlotSplit(wm, winA, "VERTICAL", { force: true });
    expect(con.layout).toBe("TABBED");
    expect(liveChildrenForPresent(wm, con).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, con)).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(conId).toBeTruthy();
    expect(
      wm.forest.nodes[conId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
    expect(liveChildrenForPresent(wm, mon)).not.toContain(winA);
  });

  it("forestSlotSplit on a TABBED leaf splits the bag vs siblings", () => {
    const { root, mon, con, winA, winB, metaA, metaB } = twoSplitTree();
    const winC = makeLive("WINDOW", { id: "C", title: "C" });
    mon.appendChild(winC);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    expect(forestSetLayout(wm, con, "TABBED")).toBe(true);
    expect(forestSlotSplit(wm, winA, "VERTICAL", { insertLive: winC, before: false })).toBe(true);
    expect(liveChildrenForPresent(wm, con).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, con)).toEqual(expect.arrayContaining([winA, winB]));
    const idA = wm.hostBag.idFromMeta(metaA);
    const tabId = wm.forest.nodes[idA].parentId;
    const wrapId = wm.forest.nodes[tabId].parentId;
    const wrap = wm.liveById.get(wrapId);
    expect(wrap).not.toBe(mon);
    expect(wrap.layout).toBe("VSPLIT");
    expect(liveChildrenForPresent(wm, wrap)).toEqual(expect.arrayContaining([con, winC]));
    expect(liveChildrenForPresent(wm, mon)).toContain(wrap);
    expect(wm.forest.nodes[tabId].layout).toBe("TABBED");
    expect(
      wm.forest.nodes[tabId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
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
    expect(liveChildrenForPresent(wm, con).every((c) => liveKind(c) === "WINDOW")).toBe(true);
    expect(liveChildrenForPresent(wm, con)).toEqual(expect.arrayContaining([winA, winB]));
    const conId = [...wm.liveById.entries()].find(([, live]) => live === con)?.[0];
    expect(
      wm.forest.nodes[conId].childIds.every((id) => wm.forest.nodes[id].kind === "WINDOW")
    ).toBe(true);
  });
});

describe("presentWmSlots (D096 G2)", () => {
  beforeEach(() => {
    resetMetrics();
    vi.spyOn(Logger, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMetrics();
  });

  it("moves Meta from Forest paneRect and emits metric present", () => {
    const { root, winA, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    attachWorld(wm.forest, {
      geoms: {
        mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1000, height: 500, primary: true },
      },
    });
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const conId = wm.forest.nodes[idA].parentId;
    wm.forest.nodes[idA].percent = 0.5;
    wm.forest.nodes[idB].percent = 0.5;
    expect(conId).toBeTruthy();
    wm.calculateGaps = () => 0;
    const moved = [];
    wm.move = (meta, dest) => {
      moved.push({ id: meta.id, dest: { ...dest } });
    };

    const slotA = forestSlotRect(wm.forest, idA);
    const slotB = forestSlotRect(wm.forest, idB);
    expect(slotA?.width).toBeGreaterThan(0);
    expect(slotB?.width).toBeGreaterThan(0);
    expect(forestSlotPaintRect(wm, winA)).toMatchObject({
      x: slotA.x,
      y: slotA.y,
      width: slotA.width,
      height: slotA.height,
    });

    const out = presentWmSlots(wm, "unit-present");
    expect(out.ok).toBe(true);
    expect(out.moved).toBe(2);
    expect(moved).toHaveLength(2);
    expect(moved.find((m) => m.id === "A")?.dest).toMatchObject({
      x: slotA.x,
      y: slotA.y,
      width: slotA.width,
      height: slotA.height,
    });
    expect(moved.find((m) => m.id === "B")?.dest).toMatchObject({
      x: slotB.x,
      y: slotB.y,
      width: slotB.width,
      height: slotB.height,
    });
    expect(winA.renderRect).toMatchObject({
      x: slotA.x,
      y: slotA.y,
      width: slotA.width,
      height: slotA.height,
    });
    expect(metricsSnapshot().presents).toBe(1);
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric present");
  });

  it("does not invent GObject membership (no appendChild on TILES parents)", () => {
    const { root, con, mon, metaA, metaB } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    attachWorld(wm.forest, {
      geoms: {
        mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 800, height: 600, primary: true },
      },
    });
    wm.calculateGaps = () => 0;
    wm.move = () => {};
    const appendSpy = vi.spyOn(con, "appendChild");
    const monAppendSpy = vi.spyOn(mon, "appendChild");

    presentWmSlots(wm, "no-invent");

    expect(appendSpy).not.toHaveBeenCalled();
    expect(monAppendSpy).not.toHaveBeenCalled();
    expect(wm.hostBag.idFromMeta(metaA)).toBeTruthy();
    expect(wm.hostBag.idFromMeta(metaB)).toBeTruthy();
  });
});
