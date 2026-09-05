import { describe, expect, it } from "vitest";
import { createTomApi } from "../../../lib/tom/api.js";
import { buildGiven, parent, serializeForest } from "../../../lib/tom/index.js";
import { makeNode } from "../../../lib/tom/kernel.js";
import {
  MARK2_OPSET,
  mark2Group,
  mark2Join,
  mark2Move,
  mark2PointerHover,
  mark2PointerRelease,
  resolvePointerWould,
  buildMark2Zones,
  hitTestMark2Zone,
  worldPointInMark2Zone,
} from "../../../lib/opsets/index.js";
import { ensureMark2Decisions } from "../../../lib/opsets/mark2.js";
import { geomOf, worldOf } from "../../../lib/world/index.js";

function forestHV() {
  const api = createTomApi();
  const f = api.createForest([
    { id: "Mon1", x: 0, y: 0, width: 1920, height: 1080, primary: true },
  ]);
  ensureMark2Decisions(f);
  const mon = f.monitors[0];
  const a = api.makeWindow("A");
  const b = api.makeWindow("B");
  api._registerTree(f, a);
  api._registerTree(f, b);
  const con = api.makeCon("HSPLIT", []);
  api._registerTree(f, con);
  api.appendChild(f, mon, con);
  api.appendChild(f, con, a);
  api.appendChild(f, con, b);
  a.percent = 0.5;
  b.percent = 0.5;
  api.setFocus(f, a.id);
  return { f, api, a, b, con, mon };
}

function forestDualEmpty() {
  const api = createTomApi();
  const f = api.createForest([
    { id: "Mon1", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    { id: "Mon2", x: 1920, y: 0, width: 1920, height: 1080 },
  ]);
  ensureMark2Decisions(f);
  const mon1 = f.monitors[0];
  const mon2 = f.monitors[1];
  const a = api.makeWindow("A");
  const b = api.makeWindow("B");
  api._registerTree(f, a);
  api._registerTree(f, b);
  const con = api.makeCon("HSPLIT", []);
  api._registerTree(f, con);
  api.appendChild(f, mon1, con);
  api.appendChild(f, con, a);
  api.appendChild(f, con, b);
  a.percent = 0.5;
  b.percent = 0.5;
  api.setFocus(f, a.id);
  return { f, api, a, b, mon1, mon2 };
}

describe("Mark 2 five-zone", () => {
  it("center wins inside C; edges are trapezoids", () => {
    const zones = buildMark2Zones({ x: 0, y: 0, width: 400, height: 400 });
    expect(hitTestMark2Zone(zones, [200, 200])).toBe("center");
    expect(hitTestMark2Zone(zones, [20, 200])).toBe("left");
    expect(hitTestMark2Zone(zones, [380, 200])).toBe("right");
    expect(hitTestMark2Zone(zones, [200, 20])).toBe("top");
    expect(hitTestMark2Zone(zones, [200, 380])).toBe("bottom");
    expect(hitTestMark2Zone(zones, [-1, 200])).toBeNull();
  });

  it("worldPointInMark2Zone places harness points that hitTest confirms", () => {
    const rect = { x: 0, y: 0, width: 400, height: 400 };
    const zones = buildMark2Zones(rect);
    for (const z of ["center", "left", "right", "top", "bottom"]) {
      const p = worldPointInMark2Zone(rect, z);
      expect(p).toBeTruthy();
      expect(hitTestMark2Zone(zones, [p.x, p.y])).toBe(z);
    }
    expect(worldPointInMark2Zone(rect, "nope")).toBeNull();
  });
});

describe("OpSet.pointer", () => {
  it("MARK2_OPSET.pointer exposes hover/release", () => {
    expect(typeof MARK2_OPSET.pointer?.hover).toBe("function");
    expect(typeof MARK2_OPSET.pointer?.release).toBe("function");
  });

  it("hover does not write TOM; center → group would", () => {
    const { f, a, b, con } = forestHV();
    const before = {
      layout: con.layout,
      kids: con.childIds.slice(),
      focus: f.focusId,
    };
    const ev = {
      world: { x: 1440, y: 540 }, // center of B pane (960..1920)
      grab: { id: a.id, kind: "window" },
      hit: {
        tag: "window",
        id: b.id,
        paneRect: { x: 960, y: 0, width: 960, height: 1080 },
      },
    };
    const desc = mark2PointerHover(f, ev);
    expect(desc.would).toEqual({
      op: "group",
      args: { dir: "right", onto: b.id, place: "end" },
    });
    expect(desc.zone).toBe("center");
    expect(desc.paint).toBe("tile-zones");
    expect(desc.preview.style).toBe("tabbed");
    expect(con.layout).toBe(before.layout);
    expect(con.childIds).toEqual(before.kids);
    expect(f.focusId).toBe(before.focus);
  });

  it("release maps in-axis adjacent edge → move", () => {
    const { f, a, b } = forestHV();
    const ev = {
      world: { x: 1000, y: 540 }, // left edge of B (H axis)
      grab: { id: a.id, kind: "window" },
      hit: {
        tag: "window",
        id: b.id,
        paneRect: { x: 960, y: 0, width: 960, height: 1080 },
      },
    };
    expect(mark2PointerRelease(f, ev)).toEqual({
      op: "move",
      args: { dir: "right", onto: b.id },
    });
  });

  it("release maps other edge → join", () => {
    const { f, a, b } = forestHV();
    const ev = {
      world: { x: 1440, y: 40 }, // top of B (not in-axis adjacent move)
      grab: { id: a.id, kind: "window" },
      hit: {
        tag: "window",
        id: b.id,
        paneRect: { x: 960, y: 0, width: 960, height: 1080 },
      },
    };
    expect(resolvePointerWould(f, ev)).toEqual({
      op: "join",
      args: { dir: "up", onto: b.id },
    });
  });

  it("empty-monitor → move with onto MONITOR", () => {
    const { f, a, mon2 } = forestDualEmpty();
    const ev = {
      world: { x: 2400, y: 500 },
      grab: { id: a.id, kind: "window" },
      hit: {
        tag: "empty-monitor",
        id: mon2.id,
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
      },
    };
    expect(mark2PointerRelease(f, ev)).toEqual({
      op: "move",
      args: { dir: "right", onto: mon2.id },
    });
  });

  it("same-monitor empty hit → noop", () => {
    const { f, a, mon1 } = forestDualEmpty();
    const ev = {
      world: { x: 100, y: 100 },
      grab: { id: a.id, kind: "window" },
      hit: {
        tag: "empty-monitor",
        id: mon1.id,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    };
    expect(mark2PointerRelease(f, ev)).toEqual({ op: null });
  });

  it("foreign strip → group with onto CON", () => {
    const { f, api, a, b, con } = forestHV();
    const tabCon = api.makeCon("TABBED", []);
    api._registerTree(f, tabCon);
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, b);
    api.appendChild(f, tabCon, b);
    api.appendChild(f, tabCon, c);
    api.appendChild(f, con, tabCon);
    api.setFocus(f, a.id);

    const ev = {
      world: { x: 100, y: 20 },
      grab: { id: a.id, kind: "window" },
      hit: { tag: "strip", id: tabCon.id, axis: "x", insertIndex: 1 },
    };
    expect(mark2PointerRelease(f, ev)).toEqual({
      op: "group",
      args: { dir: "right", onto: tabCon.id, insertIndex: 1 },
    });
  });

  it("mins refuse → hover invalid + release noop", () => {
    const { f, a, b } = forestHV();
    const ev = {
      world: { x: 1440, y: 540 },
      grab: { id: a.id, kind: "window", mins: { width: 2000, height: 2000 } },
      hit: {
        tag: "window",
        id: b.id,
        paneRect: { x: 960, y: 0, width: 960, height: 1080 },
      },
    };
    const hover = mark2PointerHover(f, ev);
    expect(hover.refuse).toBe(true);
    expect(hover.preview.style).toBe("invalid");
    expect(hover.would).toBeNull();
    expect(mark2PointerRelease(f, ev)).toEqual({ op: null });
  });

  it("join edge mins use onto pane, not the zone strip", () => {
    const { f, api, a, b, con } = forestHV();
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, a);
    api.removeChild(f, con, b);
    api.appendChild(f, tab, a);
    api.appendChild(f, tab, b);
    api.appendChild(f, con, tab);
    api.appendChild(f, con, c);
    api.setLayoutField(con, "VSPLIT");
    const pane = { x: 960, y: 0, width: 931, height: 516 };
    const p = worldPointInMark2Zone(pane, "left");
    const ev = {
      world: p,
      grab: { id: c.id, kind: "window", mins: { width: 256, height: 144 } },
      hit: { tag: "window", id: a.id, paneRect: pane },
    };
    const hover = mark2PointerHover(f, ev);
    expect(hover.refuse).toBe(false);
    expect(mark2PointerRelease(f, ev).op).toBe("join");
  });

  it("move onto MONITOR transfers without edge gate", () => {
    const { f, api, a, mon2 } = forestDualEmpty();
    const r = mark2Move(f, api, "right", { onto: mon2.id });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("cross-mon");
    expect(f.nodes[a.id].parentId).toBe(mon2.id);
  });

  it("empty-monitor reverse → move with onto empty Mon1", () => {
    const { f, byLabel } = buildGiven("Mon1() Mon2(H(A,B))");
    const mon1 = f.monitors[0];
    const ev = {
      world: { x: 400, y: 500 },
      grab: { id: byLabel.A.id, kind: "window" },
      hit: {
        tag: "empty-monitor",
        id: mon1.id,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    };
    expect(mark2PointerRelease(f, ev)).toEqual({
      op: "move",
      args: { dir: "left", onto: mon1.id },
    });
  });

  it("move onto empty dest MONITOR both dirs", () => {
    const right = buildGiven("Mon1(H(A,B)) Mon2()");
    right.api.setFocus(right.f, right.byLabel.A.id);
    const rr = mark2Move(right.f, right.api, "right", {
      onto: right.f.monitors[1].id,
    });
    expect(rr.ok).toBe(true);
    expect(rr.mode).toBe("cross-mon");
    expect(serializeForest(right.f, right.api)).toBe("Mon1(B) Mon2(A)");

    const left = buildGiven("Mon1() Mon2(H(A,B))");
    left.api.setFocus(left.f, left.byLabel.A.id);
    const lr = mark2Move(left.f, left.api, "left", {
      onto: left.f.monitors[0].id,
    });
    expect(lr.ok).toBe(true);
    expect(lr.mode).toBe("cross-mon");
    expect(serializeForest(left.f, left.api)).toBe("Mon1(A) Mon2(B)");
  });

  it("Join onto empty dest MONITOR both dirs is transfer", () => {
    const right = buildGiven("Mon1(H(A,B)) Mon2()");
    right.api.setFocus(right.f, right.byLabel.B.id);
    const jr = mark2Join(right.f, right.api, "right");
    expect(jr.ok).toBe(true);
    expect(jr.mode).toBe("cross-mon");
    expect(jr.op).toBe("Join");
    expect(serializeForest(right.f, right.api)).toBe("Mon1(A) Mon2(B)");

    const left = buildGiven("Mon1() Mon2(H(A,B))");
    left.api.setFocus(left.f, left.byLabel.A.id);
    const jl = mark2Join(left.f, left.api, "left");
    expect(jl.ok).toBe(true);
    expect(jl.mode).toBe("cross-mon");
    expect(jl.op).toBe("Join");
    expect(serializeForest(left.f, left.api)).toBe("Mon1(A) Mon2(B)");
  });

  it("Join empty dest does not hop to another workspace's same-output MONITOR", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(A,B)) Mon2()");
    const tiles = f.nodes[f.tilesId || "ROOT"];
    const ws2 = makeNode(() => "WS2", { kind: "WORKSPACE", id: "WS2", label: "WS2" });
    api._registerTree(f, ws2);
    api.appendChild(f, tiles, ws2);
    const clone0 = makeNode(() => "Mon1b", {
      kind: "MONITOR",
      id: "Mon1b",
      label: "Mon1b",
      layout: "HSPLIT",
    });
    api._registerTree(f, clone0);
    api.appendChild(f, ws2, clone0);
    f.monitors.splice(1, 0, clone0);
    const g0 = geomOf(f, "Mon1");
    if (g0) worldOf(f).geoms[clone0.id] = { ...g0, id: clone0.id };
    api.setFocus(f, byLabel.B.id);
    const jr = mark2Join(f, api, "right");
    expect(jr.ok).toBe(true);
    expect(jr.mode).toBe("cross-mon");
    expect(parent(f, byLabel.B)?.id).toBe(f.nodes.Mon2.id);
    expect(clone0.childIds).toEqual([]);
    expect(parent(f, clone0)?.id).toBe(ws2.id);
  });

  it("empty dest Move of nested VSPLIT child is leaf-only both dirs (R022)", () => {
    const right = buildGiven("Mon1(H(A,V(B,C))) Mon2()");
    right.api.setFocus(right.f, right.byLabel.C.id);
    const rr = mark2Move(right.f, right.api, "right", {
      onto: right.f.monitors[1].id,
    });
    expect(rr.ok).toBe(true);
    expect(serializeForest(right.f, right.api)).toBe("Mon1(H(A,B)) Mon2(C)");

    const left = buildGiven("Mon1() Mon2(H(A,V(B,C)))");
    left.api.setFocus(left.f, left.byLabel.C.id);
    const lr = mark2Move(left.f, left.api, "left", {
      onto: left.f.monitors[0].id,
    });
    expect(lr.ok).toBe(true);
    expect(serializeForest(left.f, left.api)).toBe("Mon1(C) Mon2(H(A,B))");
  });

  it("join with onto peels leaf out of TAB toward sibling WINDOW", () => {
    const { f, api, a, b, con, mon } = forestHV();
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, a);
    api.removeChild(f, con, b);
    api.appendChild(f, tab, a);
    api.appendChild(f, tab, b);
    api.appendChild(f, con, tab);
    api.appendChild(f, con, c);
    api.setFocus(f, b.id);
    const r = mark2Join(f, api, "left", { onto: c.id });
    expect(r.ok).toBe(true);
    expect(f.nodes[b.id].parentId).not.toBe(tab.id);
    // Unary collapse may remove the emptied TAB after peel.
    if (f.nodes[tab.id]) {
      expect(f.nodes[tab.id].childIds.includes(b.id)).toBe(false);
    }
  });

  it("group with onto WINDOW flips H pair to TAB", () => {
    const { f, api, a, b } = forestHV();
    const r = mark2Group(f, api, "right", { onto: b.id });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("flip-tab");
  });

  it("group flip-tab of a lone MONITOR H CON fills the head", () => {
    const { f, api, a, b, con } = forestHV();
    con.percent = 0.5;
    const r = mark2Group(f, api, "right", { onto: b.id });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("flip-tab");
    expect(con.layout).toBe("TABBED");
    expect(con.percent).toBe(1);
  });

  it("group of MONITOR-direct pair fills the monitor", () => {
    const api = createTomApi();
    const f = api.createForest([
      { id: "Mon1", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    ]);
    ensureMark2Decisions(f);
    const mon = f.monitors[0];
    const a = api.makeWindow("A");
    const b = api.makeWindow("B");
    api._registerTree(f, a);
    api._registerTree(f, b);
    api.appendChild(f, mon, a);
    api.appendChild(f, mon, b);
    a.percent = 0.5;
    b.percent = 0.5;
    mon.layout = "HSPLIT";
    api.setFocus(f, a.id);
    const r = mark2Group(f, api, "right", { onto: b.id });
    expect(r.ok).toBe(true);
    const tab = f.nodes[a.id] && parent(f, f.nodes[a.id]);
    expect(tab?.layout).toBe("TABBED");
    if (tab.kind === "CON") expect(tab.percent).toBe(1);
  });

  it("group with onto WINDOW wrap-tabs a nested non-sibling pair", () => {
    const { f, api, a, b, con } = forestHV();
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, b);
    const v = api.makeCon("VSPLIT", []);
    api._registerTree(f, v);
    api.appendChild(f, con, v);
    api.appendChild(f, v, b);
    api.appendChild(f, v, c);
    a.percent = 0.5;
    v.percent = 0.5;
    b.percent = 0.5;
    c.percent = 0.5;
    api.setFocus(f, a.id);
    const r = mark2Group(f, api, "right", { onto: b.id });
    expect(r.ok).toBe(true);
    const tab = parent(f, a);
    expect(tab?.layout).toBe("TABBED");
    expect(tab.childIds.includes(a.id)).toBe(true);
    expect(tab.childIds.includes(b.id)).toBe(true);
    expect(tab.childIds.includes(c.id)).toBe(false);
    expect(parent(f, c)?.id).not.toBe(tab.id);
    expect(parent(f, b)?.id).toBe(tab.id);
  });

  it("join edge onto a tab WINDOW slot-splits the sibling bag", () => {
    const { f, api, a, b, con } = forestHV();
    const tab = api.makeCon("TABBED", []);
    api._registerTree(f, tab);
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, a);
    api.removeChild(f, con, b);
    api.appendChild(f, tab, a);
    api.appendChild(f, tab, b);
    api.appendChild(f, con, tab);
    api.appendChild(f, con, c);
    api.setLayoutField(con, "VSPLIT");
    api.setFocus(f, c.id);
    const r = mark2Join(f, api, "left", { onto: a.id });
    expect(r.ok).toBe(true);
    const split = parent(f, c);
    expect(split?.layout).toBe("HSPLIT");
    expect(split.childIds.includes(c.id)).toBe(true);
    expect(split.childIds.includes(tab.id)).toBe(true);
    expect(parent(f, a)?.id).toBe(tab.id);
    expect(split.childIds[0]).toBe(c.id);
  });

  it("group wrap-tab-onto then join LEFT slot-splits to HSPLIT", () => {
    const { f, api, a, b, con } = forestHV();
    const c = api.makeWindow("C");
    api._registerTree(f, c);
    api.removeChild(f, con, b);
    const v = api.makeCon("VSPLIT", []);
    api._registerTree(f, v);
    api.appendChild(f, con, v);
    api.appendChild(f, v, b);
    api.appendChild(f, v, c);
    a.percent = 0.5;
    v.percent = 0.5;
    b.percent = 0.5;
    c.percent = 0.5;
    api.setFocus(f, a.id);
    const g = mark2Group(f, api, "right", { onto: b.id });
    expect(g.ok).toBe(true);
    api.setFocus(f, c.id);
    const j = mark2Join(f, api, "left", { onto: a.id });
    expect(j.ok).toBe(true);
    const split = parent(f, c);
    expect(split?.layout).toBe("HSPLIT");
    const tab = parent(f, a);
    expect(tab?.layout).toBe("TABBED");
    expect(split.childIds.includes(tab.id)).toBe(true);
    expect(split.childIds.includes(c.id)).toBe(true);
  });

  it("group foreign strip from nested V enters the TAB", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(TAB(A,B),V(C,D)))");
    api.setFocus(f, byLabel.D.id);
    const tab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "right", { onto: tab.id, insertIndex: 1 });
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.D)?.id).toBe(tab.id);
    expect(parent(f, byLabel.A)?.id).toBe(tab.id);
    expect(parent(f, byLabel.B)?.id).toBe(tab.id);
    expect(tab.childIds.includes(byLabel.C.id)).toBe(false);
    expect(tab.childIds.indexOf(byLabel.D.id)).toBe(1);
  });

  it("group onto WINDOW in TAB from nested V enters the TAB", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(TAB(A,B),V(C,D)))");
    api.setFocus(f, byLabel.D.id);
    const tab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "right", { onto: byLabel.A.id });
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.D)?.id).toBe(tab.id);
    expect(tab.childIds.includes(byLabel.C.id)).toBe(false);
  });

  it("group onto dest-mon TAB CON after transfer enters that bag", () => {
    const { f, api, byLabel } = buildGiven("Mon1(TAB(A,B)) Mon2(D)");
    api.setFocus(f, byLabel.D.id);
    const tab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "right", { onto: tab.id });
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.D)?.id).toBe(tab.id);
    expect(tab.childIds.includes(byLabel.A.id)).toBe(true);
    expect(tab.childIds.includes(byLabel.B.id)).toBe(true);
  });

  it("group onto WINDOW in unary-monitor TAB from other mon enters", () => {
    const { f, api, byLabel } = buildGiven("Mon1(TAB(A,B)) Mon2(D)");
    api.setFocus(f, byLabel.D.id);
    const tab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "right", { onto: byLabel.A.id });
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.D)?.id).toBe(tab.id);
  });

  // R060: dest MONITOR-direct (TAB | tile). Group must not dump grab as a
  // third dest sibling (wrap-all-three thrashes dest).
  it("group from other-mon TAB onto dest TAB does not reflow dest siblings", () => {
    const { f, api, byLabel } = buildGiven("Mon1(TAB(A,B),C) Mon2(TAB(D,E))");
    api.setFocus(f, byLabel.E.id);
    const destTab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "left", { onto: destTab.id });
    expect(r.ok).toBe(true);
    const ser = serializeForest(f, api);
    expect(parent(f, byLabel.E)?.id).toBe(destTab.id);
    expect(destTab.childIds.includes(byLabel.A.id)).toBe(true);
    expect(destTab.childIds.includes(byLabel.B.id)).toBe(true);
    expect(destTab.childIds.includes(byLabel.C.id)).toBe(false);
    expect(parent(f, byLabel.C)?.id).not.toBe(destTab.id);
    expect(ser).toMatch(/TAB\(A,B,E\)|TAB\(E,A,B\)|TAB\(A,E,B\)/);
    expect(ser).not.toMatch(/,C,E\)|,E,C\)/);
    expect(parent(f, byLabel.D)?.id).not.toBe(destTab.id);
  });

  it("group from other-mon TAB onto nested dest H(TAB,C) keeps dest split", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(TAB(A,B),C)) Mon2(TAB(D,E))");
    api.setFocus(f, byLabel.E.id);
    const destTab = parent(f, byLabel.A);
    const destH = parent(f, destTab);
    const r = mark2Group(f, api, "left", { onto: destTab.id });
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.E)?.id).toBe(destTab.id);
    expect(parent(f, byLabel.C)?.id).toBe(destH.id);
    expect(destH.childIds.length).toBe(2);
    expect(destH.childIds.includes(byLabel.E.id)).toBe(false);
  });

  it("group from other-mon TAB onto dest WINDOW wrap-tabs that slot only", () => {
    const { f, api, byLabel } = buildGiven("Mon1(TAB(A,B),C) Mon2(TAB(D,E))");
    api.setFocus(f, byLabel.E.id);
    const destTab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "left", { onto: byLabel.C.id });
    expect(r.ok).toBe(true);
    const ser = serializeForest(f, api);
    expect(parent(f, byLabel.A)?.id).toBe(destTab.id);
    expect(parent(f, byLabel.B)?.id).toBe(destTab.id);
    expect(destTab.childIds.includes(byLabel.E.id)).toBe(false);
    expect(parent(f, byLabel.C)?.layout).toBe("TABBED");
    expect(parent(f, byLabel.E)?.id).toBe(parent(f, byLabel.C)?.id);
    expect(ser).not.toMatch(/TAB\(A,B\),C,E|TAB\(A,B\),E,C/);
    expect(parent(f, byLabel.A)?.id).not.toBe(parent(f, byLabel.C)?.id);
  });

  it("CENTER Group from the left still appends the joiner last", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(A,TAB(B,C)))");
    api.setFocus(f, byLabel.A.id);
    const pane = { x: 960, y: 0, width: 960, height: 1080 };
    const p = worldPointInMark2Zone(pane, "center");
    const ev = {
      world: p,
      grab: { id: byLabel.A.id, kind: "window" },
      hit: { tag: "window", id: byLabel.B.id, paneRect: pane },
    };
    const would = resolvePointerWould(f, ev);
    expect(would?.op).toBe("group");
    expect(would?.args.insertIndex).toBeUndefined();
    expect(would?.args.place).toBe("end");
    const tab = parent(f, byLabel.B);
    const r = mark2Group(f, api, would.args.dir, would.args);
    expect(r.ok).toBe(true);
    expect(parent(f, byLabel.A)?.id).toBe(tab.id);
    expect(tab.childIds).toEqual([byLabel.B.id, byLabel.C.id, byLabel.A.id]);
  });

  it("CENTER Group from the right still appends the joiner last", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(TAB(B,C),A))");
    api.setFocus(f, byLabel.A.id);
    const pane = { x: 0, y: 0, width: 960, height: 1080 };
    const p = worldPointInMark2Zone(pane, "center");
    const ev = {
      world: p,
      grab: { id: byLabel.A.id, kind: "window" },
      hit: { tag: "window", id: byLabel.B.id, paneRect: pane },
    };
    const would = resolvePointerWould(f, ev);
    expect(would?.op).toBe("group");
    expect(would?.args.insertIndex).toBeUndefined();
    expect(would?.args.place).toBe("end");
    const tab = parent(f, byLabel.B);
    const r = mark2Group(f, api, would.args.dir, would.args);
    expect(r.ok).toBe(true);
    expect(tab.childIds).toEqual([byLabel.B.id, byLabel.C.id, byLabel.A.id]);
  });

  it("Join(right) prepends into a TAB; Join(left) appends", () => {
    const left = buildGiven("Mon1(H(A,TAB(B,C)))");
    left.api.setFocus(left.f, left.byLabel.A.id);
    const jr = mark2Join(left.f, left.api, "right");
    expect(jr.ok).toBe(true);
    const tabL = parent(left.f, left.byLabel.B);
    expect(tabL.childIds).toEqual([left.byLabel.A.id, left.byLabel.B.id, left.byLabel.C.id]);

    const right = buildGiven("Mon1(H(TAB(A,B),C))");
    right.api.setFocus(right.f, right.byLabel.C.id);
    const jl = mark2Join(right.f, right.api, "left");
    expect(jl.ok).toBe(true);
    const tabR = parent(right.f, right.byLabel.A);
    expect(tabR.childIds).toEqual([right.byLabel.A.id, right.byLabel.B.id, right.byLabel.C.id]);
  });

  it("Group(right) prepends into a TAB; Group(left) appends", () => {
    const left = buildGiven("Mon1(H(A,TAB(B,C)))");
    left.api.setFocus(left.f, left.byLabel.A.id);
    const gr = mark2Group(left.f, left.api, "right");
    expect(gr.ok).toBe(true);
    const tabL = parent(left.f, left.byLabel.B);
    expect(tabL.childIds).toEqual([left.byLabel.A.id, left.byLabel.B.id, left.byLabel.C.id]);

    const right = buildGiven("Mon1(H(TAB(A,B),C))");
    right.api.setFocus(right.f, right.byLabel.C.id);
    const gl = mark2Group(right.f, right.api, "left");
    expect(gl.ok).toBe(true);
    const tabR = parent(right.f, right.byLabel.A);
    expect(tabR.childIds).toEqual([right.byLabel.A.id, right.byLabel.B.id, right.byLabel.C.id]);
  });

  it("strip insertIndex Group sits at that gap (not last)", () => {
    const { f, api, byLabel } = buildGiven("Mon1(H(D,TAB(A,B,C)))");
    api.setFocus(f, byLabel.D.id);
    const tab = parent(f, byLabel.A);
    const r = mark2Group(f, api, "right", { onto: tab.id, insertIndex: 1 });
    expect(r.ok).toBe(true);
    expect(tab.childIds).toEqual([byLabel.A.id, byLabel.D.id, byLabel.B.id, byLabel.C.id]);
  });
});
