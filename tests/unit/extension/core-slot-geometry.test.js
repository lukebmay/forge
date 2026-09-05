import { afterEach, describe, expect, it, vi } from "vitest";
import * as PresentChrome from "../../../lib/extension/present-chrome.js";
import { mapAdmitWindow, onLateIdentity } from "../../../lib/extension/adapter-map-admit.js";
import {
  forestIdFromLive,
  forestMergeWindowsIntoGroup,
  forestSlotPaintRect,
  forestSlotPresentBuried,
  liveTabOpenLeafForPresent,
  moveLiveToForestSlot,
  presentWmSlots,
  seedLiveForest,
} from "../../../lib/extension/tom-live.js";
import { parent as tomParent } from "../../../lib/tom/index.js";
import { forestSlotRect } from "../../../lib/extension/reconcile.js";
import { attachWorld } from "../../../lib/world/index.js";
import { createHostBag } from "../../../lib/host/index.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  createWindowNode,
  getWorkspaceAndMonitor,
  parentOf,
} from "../../mocks/helpers/index.js";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree-types.js";

function makeLive(type, value, extra = {}) {
  const node = {
    nodeType: type,
    nodeValue: value,
    childNodes: [],
    parentNode: extra.parentNode ?? null,
    layout: extra.layout,
    percent: extra.percent ?? 0,
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
      if (i < 0) throw new Error("NodeNotFound");
      this.childNodes.splice(i, 1);
      child.parentNode = null;
      return [child];
    },
  };
  return node;
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

function windowIdOf(node) {
  const v = node?.nodeValue;
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v.id != null) return String(v.id);
  return null;
}

function createCon() {
  return makeLive(
    "CON",
    { id: `con-${Math.random().toString(16).slice(2)}` },
    { layout: "HSPLIT" }
  );
}

function seedTwoSplit() {
  const tree = twoSplitTree();
  const wm = {
    tree: tree.root,
    forest: null,
    hostBag: createHostBag(),
    liveById: null,
    _liveForestSeeded: false,
    calculateGaps: () => 0,
    move: vi.fn(),
  };
  seedLiveForest(wm, { windowIdOf, createCon });
  attachWorld(wm.forest, {
    geoms: {
      mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    },
  });
  const idA = wm.hostBag.idFromMeta(tree.metaA);
  const idB = wm.hostBag.idFromMeta(tree.metaB);
  wm.forest.nodes[idA].percent = 0.33;
  wm.forest.nodes[idB].percent = 0.33;
  return { ...tree, wm, idA, idB };
}

describe("SG1 seeded chrome slots from Forest paneRect", () => {
  it("seededChildRect leftover 0.33+0.33 matches paneRect 50/50", () => {
    const { wm, winA, winB, idA, idB } = seedTwoSplit();
    const slotA = forestSlotRect(wm.forest, idA);
    const slotB = forestSlotRect(wm.forest, idB);
    expect(slotA.width).toBeCloseTo(960);
    expect(slotB.width).toBeCloseTo(960);
    expect(slotB.x).toBeCloseTo(960);

    expect(PresentChrome.seededChildRect(wm, winA)).toMatchObject({
      x: slotA.x,
      y: slotA.y,
      width: slotA.width,
      height: slotA.height,
    });
    expect(PresentChrome.seededChildRect(wm, winB)).toMatchObject({
      x: slotB.x,
      y: slotB.y,
      width: slotB.width,
      height: slotB.height,
    });
    expect(PresentChrome.seededChildRect({ ...wm, _liveForestSeeded: false }, winA)).toBeNull();
  });
});

describe("SG1 processNode assigns Forest slots when seeded", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("leftover 0.33+0.33 chrome rects are 50/50 even when live.percent is stale", () => {
    ctx = createWindowManagerFixture();
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg1-a", wm_class: "AppA" },
    });
    const b = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg1-b", wm_class: "AppB" },
    });
    expect(wm._liveForestSeeded).toBe(true);

    const idA = wm.hostBag.idFromMeta(a.metaWindow);
    const idB = wm.hostBag.idFromMeta(b.metaWindow);
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    wm.forest.nodes[idA].percent = 0.33;
    wm.forest.nodes[idB].percent = 0.33;
    a.nodeWindow.percent = 0.1;
    b.nodeWindow.percent = 0.9;
    attachWorld(wm.forest, {
      geoms: {
        [wm.forest.monitors[0].id]: {
          id: wm.forest.monitors[0].id,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
      },
    });

    PresentChrome.processNode(wm.tree, monitor);

    const slotA = forestSlotRect(wm.forest, idA);
    const slotB = forestSlotRect(wm.forest, idB);
    expect(slotA.width).toBeCloseTo(960);
    expect(slotB.width).toBeCloseTo(960);
    expect(a.nodeWindow.rect).toMatchObject({
      x: slotA.x,
      y: slotA.y,
      width: slotA.width,
      height: slotA.height,
    });
    expect(b.nodeWindow.rect).toMatchObject({
      x: slotB.x,
      y: slotB.y,
      width: slotB.width,
      height: slotB.height,
    });
  });
});

function forestPair(wm, { monId, conId, con, liveMonValue }) {
  const wsId = monId.replace(/^mo\d+/, "");
  wm._liveForestSeeded = true;
  wm.forest = {
    rootId: "ROOT",
    monitors: [{ id: monId, kind: "MONITOR", parentId: wsId, childIds: [conId] }],
    nodes: {
      ROOT: { id: "ROOT", kind: "ROOT", childIds: [wsId] },
      [wsId]: { id: wsId, kind: "WORKSPACE", parentId: "ROOT", childIds: [monId] },
      [monId]: {
        id: monId,
        kind: "MONITOR",
        parentId: wsId,
        childIds: [conId],
        layout: "HSPLIT",
      },
      [conId]: { id: conId, kind: "CON", parentId: monId, childIds: [], layout: "HSPLIT" },
    },
  };
  if (!(wm.liveById instanceof Map)) wm.liveById = new Map();
  wm.liveById.set(conId, con);
  wm.liveById.set(monId, { nodeType: "MONITOR", nodeValue: liveMonValue ?? monId });
}

function mockBorder() {
  return {
    set_style_class_name: vi.fn(),
    add_style_class_name: vi.fn(),
    set_size: vi.fn(),
    set_position: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  };
}

describe("SG2 chrome WS gate via Forest", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("inactive WS CON with null parentNode hides chrome", () => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 2, activeWorkspaceIndex: 0 } },
    });
    const wm = ctx.windowManager;
    const con = makeLive("CON", { id: "ghost-con" }, { layout: "HSPLIT" });
    con.parentNode = null;
    const monId = "mo0ws1";
    forestPair(wm, { monId, conId: "sg2-con", con });

    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, con)).toBe(false);
    expect(wm.tree.findAncestorMonitor(con)?.nodeValue).toBe(monId);
    expect(wm.decorationManager._conOnActiveWorkspace(con)).toBe(false);
  });

  it("defaults true when workspace cannot be determined", () => {
    ctx = createWindowManagerFixture();
    const orphan = makeLive("CON", { id: "orphan" }, { layout: "HSPLIT" });
    orphan.parentNode = null;
    expect(PresentChrome.decorationOnActiveWorkspace(ctx.windowManager.tree, orphan)).toBe(true);
  });
});

describe("SG8 chrome identity is Forest MONITOR pair moNwsW", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("CON on mo0ws0 hides when active WS=1 even if monitor 0 is the current output; mo0ws1 shows", () => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 2, activeWorkspaceIndex: 1 } },
    });
    const wm = ctx.windowManager;
    const conOld = makeLive("CON", { id: "ws0-con" }, { layout: "HSPLIT" });
    conOld.parentNode = null;
    const conLive = makeLive("CON", { id: "ws1-con" }, { layout: "HSPLIT" });
    conLive.parentNode = null;

    forestPair(wm, { monId: "mo0ws0", conId: "sg8-con0", con: conOld });
    expect(PresentChrome.forestMonitorIdForChrome(wm.tree, conOld)).toBe("mo0ws0");
    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, conOld)).toBe(false);
    expect(wm.decorationManager._conOnActiveWorkspace(conOld)).toBe(false);

    forestPair(wm, { monId: "mo0ws1", conId: "sg8-con1", con: conLive });
    expect(PresentChrome.forestMonitorIdForChrome(wm.tree, conLive)).toBe("mo0ws1");
    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, conLive)).toBe(true);
    expect(wm.decorationManager._conOnActiveWorkspace(conLive)).toBe(true);
  });

  it("does not default-show when Forest MONITOR id exists but ws cannot be parsed", () => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 2, activeWorkspaceIndex: 1 } },
    });
    const wm = ctx.windowManager;
    const con = makeLive("CON", { id: "bad-pair-con" }, { layout: "HSPLIT" });
    con.parentNode = null;
    forestPair(wm, { monId: "mo0", conId: "sg8-bad", con });
    expect(PresentChrome.forestMonitorIdForChrome(wm.tree, con)).toBe("mo0");
    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, con)).toBe(false);
  });

  it("active WS2 + Guake FLOAT: no WS1 TILE borders/strips", () => {
    ctx = createWindowManagerFixture({
      globals: { workspaceManager: { workspaceCount: 2, activeWorkspaceIndex: 1 } },
      settings: {
        "focus-border-toggle": true,
        "focus-border-hidden-on-single": false,
        "showtab-decoration-enabled": true,
        "tiling-mode-enabled": true,
        "window-gap-size": 4,
        "window-gap-size-increment": 1,
      },
    });
    const wm = ctx.windowManager;
    const { monitor: monWs0 } = getWorkspaceAndMonitor(ctx, 0);
    const { monitor: monWs1 } = getWorkspaceAndMonitor(ctx, 1);
    monWs0.layout = LAYOUT_TYPES.TABBED;
    const strip = { hide: vi.fn(), show: vi.fn() };
    monWs0.decoration = strip;

    const tileA = createWindowNode(ctx.tree, monWs0, {
      mode: "TILE",
      windowOverrides: {
        id: "sg8-tile-a",
        wm_class: "TileA",
        workspace: ctx.workspaces[0],
        monitor: 0,
      },
    });
    const tileB = createWindowNode(ctx.tree, monWs0, {
      mode: "TILE",
      windowOverrides: {
        id: "sg8-tile-b",
        wm_class: "TileB",
        workspace: ctx.workspaces[0],
        monitor: 0,
      },
    });
    const guake = createWindowNode(ctx.tree, monWs1, {
      mode: "FLOAT",
      windowOverrides: {
        id: "sg8-guake",
        wm_class: "Guake",
        workspace: ctx.workspaces[1],
        monitor: 0,
      },
    });

    const tileBorder = mockBorder();
    const guakeBorder = mockBorder();
    const tileComp = tileA.metaWindow.get_compositor_private();
    const guakeComp = guake.metaWindow.get_compositor_private();
    tileComp.border = tileBorder;
    guakeComp.border = guakeBorder;
    global.window_group.add_child(tileComp);
    global.window_group.add_child(guakeComp);
    global.window_group.add_child(tileBorder);
    global.window_group.add_child(guakeBorder);
    const idTile = wm.hostBag.idFromMeta(tileA.metaWindow);
    const idGuake = wm.hostBag.idFromMeta(guake.metaWindow);
    wm.hostBag.set(idTile, { meta: tileA.metaWindow, border: tileBorder });
    wm.hostBag.set(idGuake, { meta: guake.metaWindow, border: guakeBorder });
    tileA.metaWindow.appears_focused = false;
    guake.metaWindow.appears_focused = true;
    global.display.get_focus_window.mockReturnValue(guake.metaWindow);

    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, tileA.nodeWindow)).toBe(false);
    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, monWs0)).toBe(false);
    expect(PresentChrome.decorationOnActiveWorkspace(wm.tree, guake.nodeWindow)).toBe(true);

    PresentChrome.processNode(wm.tree, monWs0);
    expect(strip.hide).toHaveBeenCalled();
    expect(strip.show).not.toHaveBeenCalled();

    wm.hideWindowBorders();
    wm.showWindowBorders();
    expect(guakeBorder.show).toHaveBeenCalled();
    expect(tileBorder.show).not.toHaveBeenCalled();

    const n = wm.restackAllWindowBorders();
    expect(n).toBe(1);
    expect(global.window_group.insert_child_above).toHaveBeenCalledWith(guakeBorder, guakeComp);
    expect(global.window_group.insert_child_above).not.toHaveBeenCalledWith(tileBorder, tileComp);
    expect(tileBorder.hide).toHaveBeenCalled();
    expect(tileB.nodeWindow).toBeTruthy();
  });
});

describe("SG3 insertChildPercent via Forest parent", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("null GObject parent still equalizes Forest percents", () => {
    ctx = createWindowManagerFixture({
      settings: { "new-window-size-policy": "equalize" },
    });
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg3-a", wm_class: "AppA" },
    });
    const b = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg3-b", wm_class: "AppB" },
    });
    const idA = wm.hostBag.idFromMeta(a.metaWindow);
    const idB = wm.hostBag.idFromMeta(b.metaWindow);
    wm.forest.nodes[idA].percent = 0.33;
    wm.forest.nodes[idB].percent = 0.33;
    wm.forest.nodes[idA].userSized = false;
    wm.forest.nodes[idB].userSized = false;
    b.nodeWindow.parentNode = null;

    wm._insertChildPercent(null, b.nodeWindow);

    expect(wm.forest.nodes[idA].percent).toBeCloseTo(0.5);
    expect(wm.forest.nodes[idB].percent).toBeCloseTo(0.5);
  });
});

describe("SG4 launch direct to Forest slot", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("moveLiveToForestSlot dest matches forestSlotPaintRect", () => {
    const { wm, winA, metaA, idA } = seedTwoSplit();
    const slot = forestSlotPaintRect(wm, idA);
    expect(slot.width).toBeGreaterThan(0);
    expect(moveLiveToForestSlot(wm, metaA, winA)).toBe(true);
    expect(wm.move).toHaveBeenCalledWith(metaA, slot);
  });

  it("mapAdmit willTile moves Meta to Forest slot before idle present", () => {
    ctx = createWindowManagerFixture();
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const existing = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg4-exist", wm_class: "Exist" },
    });
    const meta = createMockWindow({
      id: "sg4-new",
      wm_class: "AppNew",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 12, y: 34, width: 400, height: 300 },
    });
    const moveSpy = vi.spyOn(wm, "move");
    const admitted = mapAdmitWindow(wm, meta, {
      openPlan: { homeMonitor: 0, isDock: false },
      willTile: true,
      deferHidden: false,
      placePinned: false,
      attachTarget: existing.nodeWindow,
      metaMonWsNode: monitor,
      openMinFloat: false,
    });
    expect(admitted?.nodeWindow).toBeTruthy();
    const dest = forestSlotPaintRect(wm, admitted.nodeWindow);
    expect(dest).toBeTruthy();
    expect(dest.width).toBeGreaterThan(0);
    const slotMoves = moveSpy.mock.calls.filter(
      ([m, d]) => m === meta && d && d.width === dest.width && d.height === dest.height
    );
    expect(slotMoves.length).toBeGreaterThan(0);
  });

  it("mapAdmit hide-place-show: hide before dest write, show after", () => {
    ctx = createWindowManagerFixture();
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const existing = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "hps-exist", wm_class: "Exist" },
    });
    const meta = createMockWindow({
      id: "hps-new",
      wm_class: "AppHps",
      workspace: ctx.workspaces[0],
      monitor: 0,
      rect: { x: 12, y: 34, width: 400, height: 300 },
    });
    const actor = meta.get_compositor_private();
    actor.minimize = () => {
      actor.minimized = true;
    };
    const destOpacity = [];
    const origMove = wm.move.bind(wm);
    vi.spyOn(wm, "move").mockImplementation((m, d) => {
      destOpacity.push(actor.opacity);
      return origMove(m, d);
    });
    const admitted = mapAdmitWindow(wm, meta, {
      openPlan: { homeMonitor: 0, isDock: false },
      willTile: true,
      deferHidden: true,
      placePinned: false,
      attachTarget: existing.nodeWindow,
      metaMonWsNode: monitor,
      openMinFloat: false,
      openLayoutBatchActive: false,
    });
    expect(admitted?.nodeWindow).toBeTruthy();
    expect(destOpacity.length).toBeGreaterThan(0);
    expect(destOpacity.every((op) => op === 0)).toBe(true);
    expect(actor.opacity).toBe(255);
    expect(actor.minimized).toBeUndefined();
    expect(wm._isDeferredOpen(meta)).toBe(false);
  });

  it("onLateIdentity TILE commit moves to Forest slot", () => {
    ctx = createWindowManagerFixture();
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: { id: "sg4-late", wm_class: "LateApp" },
    });
    let floating = true;
    nodeWindow.mode = "FLOAT";
    nodeWindow.isFloat = () => floating;
    const moveSpy = vi.spyOn(wm, "move");
    wm._applyProcessFloatDecision = () => {
      floating = false;
      nodeWindow.mode = "TILE";
      return { action: "tile" };
    };
    wm.commitLayout = vi.fn();
    const scheduleSpy = vi.spyOn(wm, "_scheduleOpenCommit");

    const out = onLateIdentity(wm, metaWindow, "wm-class", { node: nodeWindow });
    expect(out.promoted).toBe(true);
    expect(scheduleSpy).toHaveBeenCalled();
    const dest = forestSlotPaintRect(wm, nodeWindow);
    expect(dest?.width).toBeGreaterThan(0);
    expect(moveSpy).toHaveBeenCalledWith(metaWindow, dest);
  });
});

function seedTabbedPair({ duckOpen = "B", forestOpen = "A" } = {}) {
  const root = makeLive("ROOT", "ROOT");
  const ws = makeLive("WORKSPACE", "ws0");
  const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
  const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
  tab.isStackedOrTabbed = () => true;
  const metaA = { id: "A", title: "A" };
  const metaB = { id: "B", title: "B" };
  const winA = makeLive("WINDOW", metaA);
  const winB = makeLive("WINDOW", metaB);
  root.appendChild(ws);
  ws.appendChild(mon);
  mon.appendChild(tab);
  tab.appendChild(winA);
  tab.appendChild(winB);
  tab.lastTabFocus = duckOpen === "A" ? metaA : metaB;
  tab.contains = (n) => n === winA || n === winB;
  const wm = {
    tree: root,
    forest: null,
    hostBag: createHostBag(),
    liveById: null,
    _liveForestSeeded: false,
    calculateGaps: () => 0,
    move: vi.fn(),
  };
  seedLiveForest(wm, { windowIdOf, createCon });
  attachWorld(wm.forest, {
    geoms: {
      mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    },
  });
  const idA = wm.hostBag.idFromMeta(metaA);
  const idB = wm.hostBag.idFromMeta(metaB);
  const tabId = wm.forest.nodes[idA].parentId;
  wm.forest.nodes[tabId].lastTabFocusId = forestOpen === "A" ? idA : idB;
  wm.forest.nodes[idA].percent = 1;
  wm.forest.nodes[idB].percent = 1;
  return { root, ws, mon, tab, winA, winB, metaA, metaB, wm, idA, idB, tabId };
}

describe("SG5 present buried/open via Forest lastTabFocusId", () => {
  it("TABBED lastTabFocusId=A classifies B buried even when duck lastTabFocus is B", () => {
    const { wm, idA, idB, tab, metaB } = seedTabbedPair({ duckOpen: "B", forestOpen: "A" });
    expect(tab.lastTabFocus).toBe(metaB);
    expect(forestSlotPresentBuried(wm.forest, wm.forest.nodes[idA])).toBe(false);
    expect(forestSlotPresentBuried(wm.forest, wm.forest.nodes[idB])).toBe(true);

    presentWmSlots(wm, "sg5-tabbed");

    const order = wm.move.mock.calls.map(([meta]) => meta.id);
    expect(order).toEqual(["A", "B", "A"]);
  });

  it("liveTabOpenLeafForPresent uses Forest lastTabFocusId not parentNode.contains", () => {
    const { wm, tab, winA, winB, metaB } = seedTabbedPair({ duckOpen: "B", forestOpen: "A" });
    tab.lastTabFocus = metaB;
    tab.contains = (n) => n === winB;
    wm.tree.findNode = (meta) => (meta === metaB ? winB : null);
    expect(liveTabOpenLeafForPresent(wm, tab)).toBe(winA);
  });

  it("liveTabOpenLeafForPresent resolves lastTabFocusId via bag meta when liveById key misses", () => {
    const { wm, tab, winA, idA } = seedTabbedPair({ duckOpen: "B", forestOpen: "A" });
    const liveA = wm.liveById.get(idA);
    wm.liveById.delete(idA);
    wm.liveById.set("stale-key", liveA);
    expect(liveTabOpenLeafForPresent(wm, tab)).toBe(winA);
  });

  it("TABBED Meta dest insets by tab bar so app chrome is not under Forge tabs", () => {
    const { wm, idA, idB } = seedTabbedPair();
    const slot = forestSlotRect(wm.forest, idA);
    const destA = forestSlotPaintRect(wm, idA);
    const destB = forestSlotPaintRect(wm, idB);
    expect(slot.height).toBe(1080);
    expect(destA).toMatchObject({ x: slot.x, y: slot.y + 35, width: slot.width, height: 1045 });
    expect(destB).toMatchObject({ x: slot.x, y: slot.y + 35, width: slot.width, height: 1045 });
  });

  it("STACKED Meta dest insets by all title bars", () => {
    const { wm, idA, tabId } = seedTabbedPair();
    wm.forest.nodes[tabId].layout = "STACKED";
    const slot = forestSlotRect(wm.forest, idA);
    const dest = forestSlotPaintRect(wm, idA);
    expect(dest).toMatchObject({ x: slot.x, y: slot.y + 70, width: slot.width, height: 1010 });
  });

  it("TABBED dest is full slot when tab chrome is disabled", () => {
    const { wm, idA } = seedTabbedPair();
    wm.tree.settings = {
      get_boolean: (k) => (k === "showtab-decoration-enabled" ? false : true),
      get_uint: () => 0,
      get_string: () => "top",
    };
    const slot = forestSlotRect(wm.forest, idA);
    expect(forestSlotPaintRect(wm, idA)).toMatchObject({
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
    });
  });

  it("VSPLIT leftover half-height is not the TABBED dest after wrap", () => {
    const root = makeLive("ROOT", "ROOT");
    const ws = makeLive("WORKSPACE", "ws0");
    const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
    const vcon = makeLive("CON", { id: "vsplit" }, { layout: "VSPLIT" });
    vcon.isStackedOrTabbed = function () {
      return this.layout === "TABBED" || this.layout === "STACKED";
    };
    const metaA = { id: "A", title: "A" };
    const metaB = { id: "B", title: "B" };
    const metaC = { id: "C", title: "C" };
    const winA = makeLive("WINDOW", metaA);
    const winB = makeLive("WINDOW", metaB);
    const winC = makeLive("WINDOW", metaC);
    root.appendChild(ws);
    ws.appendChild(mon);
    mon.appendChild(vcon);
    mon.appendChild(winC);
    vcon.appendChild(winA);
    vcon.appendChild(winB);
    const wm = {
      tree: root,
      forest: null,
      hostBag: createHostBag(),
      liveById: null,
      _liveForestSeeded: false,
      calculateGaps: () => 0,
      move: vi.fn(),
    };
    wm.tree.settings = tabChromeSettings();
    seedLiveForest(wm, { windowIdOf, createCon });
    attachWorld(wm.forest, {
      geoms: {
        mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true },
      },
    });
    const idA = wm.hostBag.idFromMeta(metaA);
    const idB = wm.hostBag.idFromMeta(metaB);
    const idC = wm.hostBag.idFromMeta(metaC);
    const vId = wm.forest.nodes[idA].parentId;
    wm.forest.nodes[idA].percent = 0.5;
    wm.forest.nodes[idB].percent = 0.5;
    wm.forest.nodes[vId].percent = 0.5;
    wm.forest.nodes[idC].percent = 0.5;

    const before = forestSlotPaintRect(wm, idA);
    expect(before.height).toBeCloseTo(540);

    expect(forestMergeWindowsIntoGroup(wm, winA, winB, "TABBED")).toBeTruthy();
    expect(wm.forest.nodes[wm.forest.nodes[idA].parentId].layout).toBe("TABBED");
    expect(wm.forest.nodes[idA].parentId).toBe(wm.forest.nodes[idB].parentId);

    const destA = forestSlotPaintRect(wm, idA);
    const destB = forestSlotPaintRect(wm, idB);
    expect(destA).toMatchObject({
      x: destB.x,
      y: destB.y,
      width: destB.width,
      height: destB.height,
    });
    expect(destA.height).toBe(1045);
    expect(destA.y).toBe(35);
    expect(destA.height).toBeGreaterThan(before.height);

    presentWmSlots(wm, "vsplit-to-tab");
    const heights = wm.move.mock.calls
      .filter(([m]) => m.id === "A" || m.id === "B")
      .map(([, d]) => d.height);
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((h) => h === destA.height)).toBe(true);
  });
});

function tabChromeSettings({ maxPerLine = 0, barH = 35, show = true } = {}) {
  return {
    get_boolean: (k) => (k === "showtab-decoration-enabled" ? show : true),
    get_uint: (k) => {
      if (k === "stacked-tab-bar-height") return barH;
      if (k === "max-tabs-per-line") return maxPerLine;
      if (k === "min-tab-label-chars") return 0;
      if (k === "max-tab-rows") return 0;
      return 0;
    },
    get_string: () => "top",
  };
}

function seedTabbedCount(count) {
  const root = makeLive("ROOT", "ROOT");
  const ws = makeLive("WORKSPACE", "ws0");
  const mon = makeLive("MONITOR", "mo0ws0", { layout: "HSPLIT" });
  const tab = makeLive("CON", { id: "tab" }, { layout: "TABBED" });
  tab.isStackedOrTabbed = () => true;
  const metas = [];
  const wins = [];
  root.appendChild(ws);
  ws.appendChild(mon);
  mon.appendChild(tab);
  for (let i = 0; i < count; i++) {
    const letter = String.fromCharCode(65 + i);
    const meta = { id: letter, title: letter };
    const win = makeLive("WINDOW", meta);
    tab.appendChild(win);
    metas.push(meta);
    wins.push(win);
  }
  tab.lastTabFocus = metas[0];
  tab.contains = (n) => wins.includes(n);
  const wm = {
    tree: root,
    forest: null,
    hostBag: createHostBag(),
    liveById: null,
    _liveForestSeeded: false,
    calculateGaps: () => 0,
    move: vi.fn(),
  };
  wm.tree.settings = tabChromeSettings({ maxPerLine: 2, barH: 35 });
  seedLiveForest(wm, { windowIdOf, createCon });
  attachWorld(wm.forest, {
    geoms: {
      mo0ws0: { id: "mo0ws0", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    },
  });
  const ids = metas.map((m) => wm.hostBag.idFromMeta(m));
  const tabId = wm.forest.nodes[ids[0]].parentId;
  wm.forest.nodes[tabId].lastTabFocusId = ids[0];
  for (const id of ids) wm.forest.nodes[id].percent = 1;
  return { wm, ids, tabId, metas, wins };
}

describe("SG7 multi-row tab chrome shrinks/grows the window slot", () => {
  it("wrap 1→2 drops forestSlotPaintRect height by one barH; 2→1 grows it back", () => {
    const { wm, ids, tabId } = seedTabbedCount(3);
    const barH = 35;
    const slot = forestSlotRect(wm.forest, ids[0]);
    wm.forest.nodes[tabId].childIds = [ids[0], ids[1]];
    const oneRow = forestSlotPaintRect(wm, ids[0]);
    expect(oneRow.height).toBe(slot.height - barH);
    expect(oneRow.y).toBe(slot.y + barH);

    wm.forest.nodes[tabId].childIds = ids;
    const twoRows = forestSlotPaintRect(wm, ids[0]);
    expect(oneRow.height - twoRows.height).toBe(barH);
    expect(twoRows.height).toBe(slot.height - barH * 2);
    expect(twoRows.y).toBe(slot.y + barH * 2);

    wm.forest.nodes[tabId].childIds = [ids[0], ids[1]];
    const grown = forestSlotPaintRect(wm, ids[0]);
    expect(grown.height).toBe(oneRow.height);
    expect(grown.y).toBe(oneRow.y);
  });

  it("presentWmSlots rewrites Meta dest when wrap rowCount changes", () => {
    const { wm, ids, tabId, metas } = seedTabbedCount(3);
    const barH = 35;
    wm.forest.nodes[tabId].childIds = [ids[0], ids[1]];
    presentWmSlots(wm, "sg7-one-row");
    const h1 = wm.move.mock.calls.find(([m]) => m === metas[0])[1].height;

    wm.move.mockClear();
    wm.forest.nodes[tabId].childIds = ids;
    presentWmSlots(wm, "sg7-two-rows");
    const h2 = wm.move.mock.calls.find(([m]) => m === metas[0])[1].height;
    expect(h1 - h2).toBe(barH);

    wm.move.mockClear();
    wm.forest.nodes[tabId].childIds = [ids[0], ids[1]];
    presentWmSlots(wm, "sg7-unwrap");
    const h3 = wm.move.mock.calls.find(([m]) => m === metas[0])[1].height;
    expect(h3).toBe(h1);
  });
});

describe("D032 insert does not n+1-carve the sibling split", () => {
  let ctx;

  afterEach(() => {
    ctx?.cleanup?.();
    vi.restoreAllMocks();
  });

  it("late dock FLOAT→TILE into 50/50 TAB|Ghostty keeps sibling ~1/2", () => {
    ctx = createWindowManagerFixture({
      settings: { "new-window-size-policy": "preserve" },
    });
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const bag = ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.CON, { id: "d032-bag" });
    bag.layout = LAYOUT_TYPES.TABBED;
    const tabA = createWindowNode(ctx.tree, bag, {
      mode: "TILE",
      windowOverrides: {
        id: "d032-chrome",
        wm_class: "google-chrome",
        workspace: ctx.workspaces[0],
        monitor: 0,
        rect: { x: 0, y: 0, width: 960, height: 1080 },
      },
    });
    createWindowNode(ctx.tree, bag, {
      mode: "TILE",
      windowOverrides: {
        id: "d032-grok",
        wm_class: "chrome-grok",
        workspace: ctx.workspaces[0],
        monitor: 0,
      },
    });
    const ghost = createWindowNode(ctx.tree, monitor, {
      mode: "TILE",
      windowOverrides: {
        id: "d032-ghost-live",
        wm_class: "com.mitchellh.ghostty",
        workspace: ctx.workspaces[0],
        monitor: 0,
        rect: { x: 960, y: 0, width: 960, height: 1080 },
      },
    });
    const bagId = forestIdFromLive(wm, bag);
    const idGhost = wm.hostBag.idFromMeta(ghost.metaWindow);
    const monTom = wm.forest.nodes[monitor.nodeValue];
    wm.forest.nodes[bagId].percent = 0.5;
    wm.forest.nodes[bagId].userSized = false;
    wm.forest.nodes[idGhost].percent = 0.5;
    wm.forest.nodes[idGhost].userSized = true;
    monTom.layout = "HSPLIT";

    wm.movePointerWith(tabA.nodeWindow);
    ctx.display.get_focus_window.mockReturnValue(tabA.metaWindow);

    const meta = createMockWindow({
      workspace: ctx.workspaces[0],
      monitor: 0,
      id: "d032-nautilus-live",
      wm_class: null,
      title: null,
      rect: { x: 100, y: 100, width: 800, height: 600 },
    });
    meta._forgeDockMonitor = 0;
    wm.trackWindow(null, meta);
    const opened = wm.findNodeWindow(meta);
    expect(opened.isFloat()).toBe(true);

    meta.set_wm_class("org.gnome.Nautilus");
    meta.set_title("Home");
    wm.processFloats();

    expect(opened.isTile()).toBe(true);
    const wrap = parentOf(wm, opened);
    expect(wrap).not.toBe(monitor);
    const wrapId = forestIdFromLive(wm, wrap);
    const wrapTom = wm.forest.nodes[wrapId];
    const tabTom = wm.forest.nodes[bagId];
    expect(tomParent(wm.forest, wrapTom).id).toBe(monTom.id);
    expect(tabTom.percent).toBeCloseTo(0.5, 5);
    expect(wrapTom.percent).toBeCloseTo(0.5, 5);
  });
});
