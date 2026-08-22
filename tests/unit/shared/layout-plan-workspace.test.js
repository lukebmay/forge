/**
 * ApplyLayout workspace isolation: orphans / metaWindows must not leak
 * into another desk's clean/claim.
 */
import { describe, it, expect } from "vitest";
import {
  collectWindows,
  filterForestWorkspace,
  planReconcile,
} from "../../../lib/shared/layout-plan.js";

const TERM_PROFILE = {
  version: 2,
  mode: "reconcile",
  roles: [
    {
      id: "term",
      match: { class: "com.mitchellh.ghostty" },
      open: { app: "ghostty" },
      slot: "mon0.term",
    },
  ],
  layout: {
    mon0: {
      children: [{ roles: ["term"] }],
    },
  },
};

function mon(id, kids = []) {
  return {
    nodeType: "MONITOR",
    layout: "HSPLIT",
    id,
    rect: { x: 0, y: 0, width: 1000, height: 1000 },
    children: kids,
  };
}

function win(partial) {
  return {
    nodeType: "WINDOW",
    layout: null,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    percent: 0,
    userSized: false,
    children: [],
    mode: "TILE",
    ...partial,
  };
}

describe("filterForestWorkspace / collectWindows workspace isolation", () => {
  it("filterForestWorkspace drops other-ws and unknown-ws extras (fail-closed)", () => {
    const forest = {
      monitors: [mon("mo0ws0", [win({ windowId: 1, wmClass: "A" })]), mon("mo0ws1", [])],
      orphanWindows: [
        { windowId: 10, wmClass: "Same", workspace: 0 },
        { windowId: 11, wmClass: "Other", workspace: 1 },
        { windowId: 12, wmClass: "Path", path: "mo0ws1/0" },
        { windowId: 13, wmClass: "Unknown" },
      ],
      metaWindows: [
        { windowId: 20, wmClass: "MetaSame", workspace: 0, tracked: true },
        { windowId: 21, wmClass: "MetaOther", workspace: 1, tracked: true },
      ],
    };
    const scoped = filterForestWorkspace(forest, 0);
    expect(scoped.monitors.map((m) => m.id)).toEqual(["mo0ws0"]);
    expect(scoped.orphanWindows.map((w) => w.windowId)).toEqual([10]);
    expect(scoped.metaWindows.map((w) => w.windowId)).toEqual([20]);
  });

  it("collectWindows with workspace skips other-ws extras and keeps workspace field", () => {
    const forest = {
      monitors: [mon("mo0ws0", [win({ windowId: 1, wmClass: "A" })])],
      orphanWindows: [
        { windowId: 10, wmClass: "Same", workspace: 0, mode: "FLOAT" },
        { windowId: 11, wmClass: "Other", workspace: 1, mode: "TILE" },
      ],
    };
    const rows = collectWindows(forest, { workspace: 0 });
    expect(rows.map((w) => w.windowId).sort()).toEqual([1, 10]);
    const extra = rows.find((w) => w.windowId === 10);
    expect(extra.workspace).toBe(0);
    expect(collectWindows(forest, { workspace: 1 }).map((w) => w.windowId)).toEqual([11]);
  });

  it("planReconcile clean does not close other-workspace orphans", () => {
    const forest = {
      monitors: [
        mon("mo0ws0", [
          win({
            windowId: 1,
            wmClass: "com.mitchellh.ghostty",
            title: "Ghostty",
          }),
        ]),
        mon("mo0ws1", []),
      ],
      orphanWindows: [
        {
          windowId: 902,
          wmClass: "org.inkscape.Inkscape",
          title: "Inkscape",
          workspace: 1,
        },
      ],
    };
    const plan = planReconcile(TERM_PROFILE, forest, { workspace: 0, clean: true });
    const closeIds = (plan.actions || []).filter((a) => a.op === "close").map((a) => a.windowId);
    expect(closeIds).not.toContain(902);
    expect(plan.counts.closed).toBe(0);
    expect(plan.roles[0].windowId).toBe(1);
  });
});
