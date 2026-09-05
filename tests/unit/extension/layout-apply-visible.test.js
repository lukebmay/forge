/**
 * D117 visible-open: spawn bands, raise, mapped-focus, visible-hard overlay.
 */
import { describe, it, expect } from "vitest";
import {
  SPAWN_BAND,
  collectVisibleTileWindowIds,
  focusAfterAllMappedAllowed,
  isVisibleHard,
  orderOpenActionsVisibleFirst,
  pickOpenLeafToRaise,
  spawnBandForOpenAction,
} from "../../../lib/extension/layout-apply-visible.js";

const profileTabPlusTile = {
  layout: {
    mon0: {
      split: "hsplit",
      children: [{ layout: "tabbed", roles: ["A", "B"], active: "A" }, { roles: ["C"] }],
    },
  },
  roles: [
    { id: "A", slot: "mon0.tab" },
    { id: "B", slot: "mon0.tab" },
    { id: "C", slot: "mon0.tile" },
  ],
};

function open(role) {
  return { op: "open", role, open: { app: role } };
}

describe("spawn order bands", () => {
  it("TAB(A active, B buried) + TILE C → A then C then B", () => {
    expect(spawnBandForOpenAction(open("A"), profileTabPlusTile)).toBe(SPAWN_BAND.OPEN_LEAF);
    expect(spawnBandForOpenAction(open("C"), profileTabPlusTile)).toBe(SPAWN_BAND.VISIBLE_TILE);
    expect(spawnBandForOpenAction(open("B"), profileTabPlusTile)).toBe(SPAWN_BAND.BURIED);
    const ordered = orderOpenActionsVisibleFirst(
      [open("B"), open("C"), open("A")],
      profileTabPlusTile
    );
    expect(ordered.map((a) => a.role)).toEqual(["A", "C", "B"]);
  });

  it("stable within a band (C before extra visible)", () => {
    const p = {
      layout: {
        mon0: {
          children: [
            { layout: "tabbed", roles: ["A", "B"], active: "A" },
            { roles: ["C"] },
            { roles: ["D"] },
          ],
        },
      },
    };
    const ordered = orderOpenActionsVisibleFirst([open("D"), open("B"), open("C"), open("A")], p);
    expect(ordered.map((a) => a.role)).toEqual(["A", "D", "C", "B"]);
  });
});

describe("raise open leaf when group has a window", () => {
  it("raises intended leaf once it is mapped; not a buried peer", () => {
    const a = { windowId: "10" };
    const b = { windowId: "11" };
    expect(pickOpenLeafToRaise([b], "10")).toBeNull();
    expect(pickOpenLeafToRaise([a, b], "10")).toBe(a);
    expect(pickOpenLeafToRaise([], "10")).toBeNull();
  });
});

describe("focus after all mapped", () => {
  it("false until required maps exist; not gated on all-hard", () => {
    expect(focusAfterAllMappedAllowed(null, ["open", "focus"])).toBe(false);
    expect(focusAfterAllMappedAllowed({ openHeld: true }, ["open", "focus"])).toBe(false);
    expect(
      focusAfterAllMappedAllowed(
        { structureBuilt: { openCount: 2 }, openRan: true, openMissing: ["B"] },
        ["open", "focus"]
      )
    ).toBe(false);
    expect(
      focusAfterAllMappedAllowed(
        { structureBuilt: { openCount: 2 }, openRan: true, openMissing: [], hardReadyRan: false },
        ["open", "focus", "hard-ready"]
      )
    ).toBe(true);
    expect(
      focusAfterAllMappedAllowed({ structureBuilt: { openCount: 2 }, openRan: false }, [
        "open",
        "focus",
      ])
    ).toBe(true);
  });
});

describe("visible-hard overlay", () => {
  const forest = {
    monitors: [
      {
        id: "mo0ws0",
        children: [
          {
            layout: "TABBED",
            lastTabFocusId: "10",
            children: [
              { nodeType: "WINDOW", windowId: "10" },
              { nodeType: "WINDOW", windowId: "11" },
            ],
          },
        ],
      },
    ],
  };

  it("visible set is open leaf only; overlay hard while buried pending", () => {
    expect(collectVisibleTileWindowIds(forest, { workspace: 0 })).toEqual(["10"]);
    const wins = [
      { windowId: "10", mode: "TILE", monitor: 0, rect: { x: 0, y: 0, width: 100, height: 80 } },
      { windowId: "11", mode: "FLOAT", monitor: 0, rect: { x: 0, y: 0, width: 10, height: 10 } },
    ];
    expect(isVisibleHard(wins, ["10"])).toBe(true);
    expect(isVisibleHard(wins, ["10", "11"])).toBe(true);
    expect(
      isVisibleHard(
        [
          {
            windowId: "10",
            mode: "FLOAT",
            monitor: 0,
            rect: { x: 0, y: 0, width: 40, height: 40 },
          },
        ],
        ["10"]
      )
    ).toBe(true);
    expect(isVisibleHard([], ["10"])).toBe(false);
  });

  it("D117 both heads of the apply workspace are visible", () => {
    const dual = {
      monitors: [
        { id: "mo0ws0", children: [{ nodeType: "WINDOW", windowId: "a" }] },
        { id: "mo1ws0", children: [{ nodeType: "WINDOW", windowId: "b" }] },
      ],
    };
    expect(collectVisibleTileWindowIds(dual, { workspace: 0 })).toEqual(["a"]);
    expect(
      collectVisibleTileWindowIds(dual, { workspace: 0, includeOtherMonitors: true })
    ).toEqual(["a", "b"]);
  });

  it("visible PH slot is not hard (maps still coming)", () => {
    const forest = {
      monitors: [
        {
          id: "mo0ws0",
          children: [
            { nodeType: "WINDOW", windowId: "a", mode: "TILE" },
            { nodeType: "WINDOW", id: "ph1", placeholder: true },
          ],
        },
      ],
    };
    const ids = collectVisibleTileWindowIds(forest, {
      workspace: 0,
      includeOtherMonitors: true,
    });
    expect(ids).toEqual(expect.arrayContaining(["a", "ph1"]));
    expect(
      isVisibleHard([{ windowId: "a", mode: "TILE", rect: { width: 80, height: 40 } }], ids)
    ).toBe(false);
  });
});
