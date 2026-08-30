import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES } from "../../../lib/extension/tree.js";
import { appendChild } from "../../../lib/tom/index.js";
import { seedLiveForest } from "../../../lib/extension/tom-live.js";
import {
  captureForestFromTom,
  forestFindWindowId,
  restoreWmForestIfNeeded,
  restoreWmForestStrict,
  rehomeWmForestWindows,
} from "../../../lib/extension/forest-restore.js";
import {
  toPortableForest,
  toLiveForest,
  planWindowMonitorHomes,
} from "../../../lib/extension/session-layout.js";
import { createWindowManagerFixture, getWorkspaceAndMonitor } from "../../mocks/helpers/index.js";
import { createMockWindow } from "../../mocks/helpers/mockWindow.js";
import { Bin } from "../../mocks/gnome/St.js";

describe("forest-restore (C7.7)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: [
            { x: 0, y: 0, width: 1920, height: 1080 },
            { x: 1920, y: 0, width: 1920, height: 1080 },
          ],
        },
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function createCon(parentValue, layout) {
    const con = ctx.tree.createNode(parentValue, NODE_TYPES.CON, new Bin());
    con.layout = layout;
    return con;
  }

  it("captureForestFromTom uses WINDOW nanoid", () => {
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const win = createMockWindow({ id: 11, workspace: ctx.workspaces[0], monitor: 0 });
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, win);
    seedLiveForest(wm);
    const nid = wm.hostBag.idFromMeta(win);
    const snap = captureForestFromTom(wm);
    expect(snap.monitors[0].id).toBe(monitor.nodeValue);
    expect(snap.monitors[0].children[0].windowId).toBe(nid);
    expect(snap.monitors[0].children[0].window).toBe(win);
    expect(forestFindWindowId(wm, snap.monitors[0].children[0])).toBe(nid);
  });

  it("restoreIfNeeded rebuilds TABBED on Forest then paints", () => {
    const wm = ctx.windowManager;
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const tab = createCon(monitor.nodeValue, LAYOUT_TYPES.TABBED);
    const w0 = createMockWindow({ id: 1, workspace: ctx.workspaces[0], monitor: 0 });
    const w1 = createMockWindow({ id: 2, workspace: ctx.workspaces[0], monitor: 0 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w1);
    seedLiveForest(wm);
    const nid0 = wm.hostBag.idFromMeta(w0);
    const nid1 = wm.hostBag.idFromMeta(w1);
    const snap = captureForestFromTom(wm);

    const monTom = wm.forest.nodes[monitor.nodeValue];
    appendChild(wm.forest, monTom, wm.forest.nodes[nid0]);
    appendChild(wm.forest, monTom, wm.forest.nodes[nid1]);
    monitor.appendChild(ctx.tree.findNode(w0));
    monitor.appendChild(ctx.tree.findNode(w1));
    expect(wm.forest.nodes[nid0].parentId).toBe(monitor.nodeValue);

    expect(restoreWmForestIfNeeded(wm, snap)).toBe(true);
    const p0 = wm.forest.nodes[nid0].parentId;
    const p1 = wm.forest.nodes[nid1].parentId;
    expect(p0).toBe(p1);
    expect(wm.forest.nodes[p0].kind).toBe("CON");
    expect(wm.forest.nodes[p0].layout).toBe("TABBED");
    const liveTab = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(liveTab).toHaveLength(1);
    expect(liveTab[0].childNodes.map((n) => n.nodeValue)).toEqual([w0, w1]);
  });

  it("strict restore + rehome recovers dual-mon tabs from a Forest pile", () => {
    const wm = ctx.windowManager;
    const { monitor: mon0 } = getWorkspaceAndMonitor(ctx, 0, 0);
    const { monitor: mon1 } = getWorkspaceAndMonitor(ctx, 0, 1);
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    const w0 = createMockWindow({ id: 100, workspace: ctx.workspaces[0], monitor: 0 });
    const w1 = createMockWindow({ id: 101, workspace: ctx.workspaces[0], monitor: 0 });
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w0);
    ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, w1);
    const tab = createCon(mon1.nodeValue, LAYOUT_TYPES.TABBED);
    const w2 = createMockWindow({ id: 200, workspace: ctx.workspaces[0], monitor: 1 });
    const w3 = createMockWindow({ id: 201, workspace: ctx.workspaces[0], monitor: 1 });
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w2);
    ctx.tree.createNode(tab.nodeValue, NODE_TYPES.WINDOW, w3);
    seedLiveForest(wm);

    const portable = toPortableForest(captureForestFromTom(wm));
    const liveForest = toLiveForest(
      portable,
      new Map([
        [wm.hostBag.idFromMeta(w0), w0],
        [wm.hostBag.idFromMeta(w1), w1],
        [wm.hostBag.idFromMeta(w2), w2],
        [wm.hostBag.idFromMeta(w3), w3],
      ])
    );

    const pile = wm.forest.nodes[mon1.nodeValue];
    for (const meta of [w0, w1, w2, w3]) {
      const id = wm.hostBag.idFromMeta(meta);
      appendChild(wm.forest, pile, wm.forest.nodes[id]);
      mon1.appendChild(ctx.tree.findNode(meta));
      meta._monitor = 1;
    }

    const homes = planWindowMonitorHomes(liveForest);
    for (const { window: metaWin, monIndex } of homes) {
      if (metaWin.get_monitor() !== monIndex) metaWin.move_to_monitor(monIndex);
    }
    rehomeWmForestWindows(wm, homes, liveForest);
    restoreWmForestStrict(wm, liveForest);

    expect(wm.forest.nodes[wm.hostBag.idFromMeta(w0)].parentId).toBe(mon0.nodeValue);
    expect(wm.forest.nodes[wm.hostBag.idFromMeta(w1)].parentId).toBe(mon0.nodeValue);
    const p2 = wm.forest.nodes[wm.hostBag.idFromMeta(w2)].parentId;
    const p3 = wm.forest.nodes[wm.hostBag.idFromMeta(w3)].parentId;
    expect(p2).toBe(p3);
    expect(wm.forest.nodes[p2].layout).toBe("TABBED");
    expect(wm.forest.nodes[p2].parentId).toBe(mon1.nodeValue);
    expect(mon0.childNodes.map((n) => n.nodeValue)).toEqual([w0, w1]);
    const tabbed = ctx.tree.getNodeByLayout(LAYOUT_TYPES.TABBED);
    expect(tabbed).toHaveLength(1);
    expect(tabbed[0].childNodes.map((n) => n.nodeValue)).toEqual([w2, w3]);
  });
});
