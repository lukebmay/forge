import { describe, expect, it } from "vitest";
import { rebuildNode, restoreForestIfNeeded } from "../../../lib/epochs/index.js";
import { conDesc, makeCon, makeMonitor, makeWin, winDesc } from "./pojo.js";

function restoreCtx(mon, wins) {
  const winById = new Map(wins.map((w) => [w.windowId, w]));
  return {
    findMonitor: (id) => (id === mon.nodeValue ? mon : null),
    findNode: (id) => winById.get(String(id)) || null,
    createCon: () => makeCon(),
    tabbedLayout: "TABBED",
  };
}

describe("epochs restore", () => {
  it("rebuild collapses 1-child CON using the CON percent", () => {
    const ghost = makeWin("ghost", { percent: 1, userSized: false });
    const desc = conDesc("VSPLIT", [winDesc("ghost", { percent: 1 })], {
      percent: 0.3,
      userSized: false,
    });
    const out = rebuildNode(desc, {
      findNode: (id) => (id === "ghost" ? ghost : null),
      cohortSet: new Set([ghost]),
      createCon: () => makeCon(),
    });
    expect(out).toBe(ghost);
    expect(out.percent).toBe(0.3);
    expect(out.userSized).toBe(false);
  });

  it("restoreForestIfNeeded matching topology → percents only", () => {
    const mon = makeMonitor("mo0ws0");
    const a = makeWin("a", { percent: 0, userSized: false });
    const b = makeWin("b", { percent: 0, userSized: false });
    mon.appendChild(a);
    mon.appendChild(b);
    const forest = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            winDesc("a", { percent: 0.7, userSized: true }),
            winDesc("b", { percent: 0.3, userSized: true }),
          ],
        },
      ],
    };
    restoreForestIfNeeded(forest, restoreCtx(mon, [a, b]));
    expect(mon.childNodes[0]).toBe(a);
    expect(mon.childNodes[1]).toBe(b);
    expect(a.percent).toBeCloseTo(0.7);
    expect(a.userSized).toBe(true);
    expect(b.percent).toBeCloseTo(0.3);
    expect(b.userSized).toBe(true);
  });

  it("restoreForestIfNeeded rebuilds when flattened", () => {
    const mon = makeMonitor("mo0ws0");
    const a = makeWin("a");
    const b = makeWin("b");
    mon.appendChild(a);
    mon.appendChild(b);
    const forest = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [conDesc("TABBED", [winDesc("a"), winDesc("b")])],
        },
      ],
    };
    restoreForestIfNeeded(forest, restoreCtx(mon, [a, b]));
    expect(mon.childNodes).toHaveLength(1);
    expect(mon.childNodes[0].isCon()).toBe(true);
    expect(mon.childNodes[0].layout).toBe("TABBED");
    expect(mon.childNodes[0].childNodes.map((n) => n.windowId)).toEqual(["a", "b"]);
  });
});
