import { describe, expect, it } from "vitest";
import { resolveTargetMonitor } from "../../../lib/epochs/index.js";
import { conDesc, makeMonitor, makeWin, winDesc } from "./pojo.js";

function attach(mon, node) {
  mon.appendChild(node);
  return node;
}

function ctxFor(mons, wins) {
  const monById = new Map(mons.map((m) => [m.nodeValue, m]));
  const winById = new Map(wins.map((w) => [w.windowId, w]));
  const keyToMon = new Map();
  return {
    findMonitor: (id) => monById.get(id) || null,
    findNode: (id) => winById.get(String(id)) || null,
    findMonitorByStableKey: (key) => keyToMon.get(key) || null,
    setStable(key, mon) {
      keyToMon.set(key, mon);
    },
  };
}

describe("resolveTargetMonitor", () => {
  it("empty cohort → stableKey or preferred", () => {
    const preferred = makeMonitor("mo0ws0");
    const byStable = makeMonitor("mo1ws0");
    const ctx = ctxFor([preferred, byStable], []);
    ctx.setStable("conn:DP-1", byStable);

    expect(
      resolveTargetMonitor(
        {
          id: "mo0ws0",
          stableKey: "conn:DP-1",
          children: [winDesc("gone")],
        },
        ctx
      )
    ).toBe(byStable);

    expect(
      resolveTargetMonitor(
        {
          id: "mo0ws0",
          children: [winDesc("gone")],
        },
        ctx
      )
    ).toBe(preferred);
  });

  it("survivors on preferred keep it unless stableKey remaps with more", () => {
    const preferred = makeMonitor("mo0ws0");
    const other = makeMonitor("mo1ws0");
    const a = makeWin("a");
    const b = makeWin("b");
    const c = makeWin("c");
    attach(preferred, a);
    attach(preferred, b);
    attach(other, c);
    const ctx = ctxFor([preferred, other], [a, b, c]);
    ctx.setStable("conn:DP-1", other);

    const desc = {
      id: "mo0ws0",
      stableKey: "conn:DP-1",
      children: [winDesc("a"), winDesc("b"), winDesc("c")],
    };
    expect(resolveTargetMonitor(desc, ctx)).toBe(preferred);

    attach(other, a);
    attach(other, b);
    expect(resolveTargetMonitor(desc, ctx)).toBe(other);
  });

  it("index stale → stableKey before majority", () => {
    const stale = makeMonitor("mo0ws0");
    const keyed = makeMonitor("mo1ws0");
    const pile = makeMonitor("mo2ws0");
    const a = makeWin("a");
    const b = makeWin("b");
    const c = makeWin("c");
    attach(keyed, a);
    attach(pile, b);
    attach(pile, c);
    const ctx = ctxFor([stale, keyed, pile], [a, b, c]);
    ctx.setStable("conn:DP-1", keyed);

    expect(
      resolveTargetMonitor(
        {
          id: "mo0ws0",
          stableKey: "conn:DP-1",
          layout: "HSPLIT",
          children: [conDesc("TABBED", [winDesc("a"), winDesc("b"), winDesc("c")])],
        },
        ctx
      )
    ).toBe(keyed);
  });
});
