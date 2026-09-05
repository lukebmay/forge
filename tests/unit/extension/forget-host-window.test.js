import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import { forgetHostWindow } from "../../../lib/extension/adapter-destroy.js";
import { forestRemoveWindow, seedLiveForest } from "../../../lib/extension/tom-live.js";
import { createHostBag } from "../../../lib/host/index.js";
import { children, parent as tomParent } from "../../../lib/tom/index.js";
import { collectChromeKids } from "../../../lib/extension/node-chrome.js";

function makeLive(type, value, extra = {}) {
  const node = {
    nodeType: type,
    nodeValue: value,
    childNodes: [],
    parentNode: null,
    layout: extra.layout,
    percent: extra.percent ?? 0,
    userSized: extra.userSized ?? false,
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
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i < 0) return null;
      this.childNodes.splice(i, 1);
      child.parentNode = null;
      return [child];
    },
  };
  return node;
}

function windowIdOf(node) {
  const v = node?.nodeValue;
  if (v?.id != null) return String(v.id);
  return null;
}

function createCon() {
  return makeLive(
    "CON",
    { id: `con-${Math.random().toString(16).slice(2)}` },
    { layout: "HSPLIT" }
  );
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

function makeWm(root) {
  return {
    tree: root,
    _tree: root,
    forest: null,
    hostBag: createHostBag(),
    liveById: null,
    _liveForestSeeded: false,
    commitLayout: vi.fn(),
  };
}

describe("forgetHostWindow", () => {
  beforeEach(() => {
    vi.spyOn(Logger, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes Forest id, settles unary CON, and commits slots", () => {
    const { root, con, winA, winB, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nidA = wm.hostBag.idFromMeta(metaA);
    const conId = wm.forest.nodes[nidA].parentId;
    expect(wm.forest.nodes[conId].childIds).toHaveLength(2);

    expect(forgetHostWindow(wm, winA, "unit-close")).toBe(true);
    expect(wm.forest.nodes[nidA]).toBeUndefined();
    expect(wm.hostBag.has(nidA)).toBe(false);
    expect(wm.liveById.has(nidA)).toBe(false);
    expect(wm.forest.nodes[conId]).toBeUndefined();
    expect(winA.parentNode).toBeNull();
    expect(con.childNodes).toEqual([winB]);
    expect(wm.commitLayout).toHaveBeenCalledWith("unit-close", { force: true });
  });

  it("is idempotent when Forest id is already gone", () => {
    const { root, winA, metaA } = twoSplitTree();
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nidA = wm.hostBag.idFromMeta(metaA);
    expect(forestRemoveWindow(wm, winA)).toBe(true);
    expect(wm.forest.nodes[nidA]).toBeUndefined();

    expect(forgetHostWindow(wm, winA, "unit-close")).toBe(false);
    expect(forgetHostWindow(wm, metaA, "unmanaged")).toBe(false);
    expect(wm.commitLayout).toHaveBeenCalled();
  });

  it("H(V(A,C),B) Close(C) collapses unary V to H(A,B)", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const h = makeLive("CON", { id: "h" }, { layout: "HSPLIT" });
    const v = makeLive("CON", { id: "v" }, { layout: "VSPLIT" });
    const metaA = { id: "A", title: "A" };
    const metaB = { id: "B", title: "B" };
    const metaC = { id: "C", title: "C" };
    const winA = makeLive("WINDOW", metaA);
    const winB = makeLive("WINDOW", metaB);
    const winC = makeLive("WINDOW", metaC);
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(h);
    h.appendChild(v);
    h.appendChild(winB);
    v.appendChild(winA);
    v.appendChild(winC);
    const wm = makeWm(root);
    seedLiveForest(wm, { windowIdOf, createCon });
    const nidA = wm.hostBag.idFromMeta(metaA);
    const nidB = wm.hostBag.idFromMeta(metaB);
    const nidC = wm.hostBag.idFromMeta(metaC);
    const vId = wm.forest.nodes[nidC].parentId;

    expect(forgetHostWindow(wm, winC, "unit-close")).toBe(true);
    expect(wm.forest.nodes[nidC]).toBeUndefined();
    expect(wm.forest.nodes[vId]).toBeUndefined();
    const hNow = tomParent(wm.forest, wm.forest.nodes[nidA]);
    expect(hNow?.kind).toBe("CON");
    expect(
      children(wm.forest, hNow)
        .map((n) => n.id)
        .sort()
    ).toEqual([nidA, nidB].sort());
  });

  it("no-ops when Forest is not seeded", () => {
    const { root, winA } = twoSplitTree();
    const wm = makeWm(root);
    expect(forgetHostWindow(wm, winA, "unit-close")).toBe(false);
    expect(wm.commitLayout).not.toHaveBeenCalled();
  });
});

describe("collectChromeKids seeded Forest-only", () => {
  it("does not union GObject leftover kids when seeded", () => {
    const forestKid = { id: "keep" };
    const leftover = { id: "ghost" };
    const node = {
      childNodes: [leftover, forestKid],
      nodeType: "CON",
    };
    const wm = {
      _liveForestSeeded: true,
      forest: { nodes: { parent: { id: "parent", childIds: ["keep"] } } },
      liveById: new Map([
        ["parent", node],
        ["keep", forestKid],
      ]),
    };
    node.wm = wm;
    expect(collectChromeKids(node)).toEqual([forestKid]);
    expect(collectChromeKids(node)).not.toContain(leftover);
  });
});
