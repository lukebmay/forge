/**
 * AL3: JS planReconcile / planActionsToSteps parity with AL1 expected plans.
 *
 * Expected: tests/unit/cli/fixtures/layout/expected/*.json
 * Regenerate: python3 scripts/forge/dump_layout_expected.py
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planReconcile, planActionsToSteps } from "../../../lib/shared/layout-plan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED_DIR = join(__dirname, "../cli/fixtures/layout/expected");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const files = readdirSync(EXPECTED_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

function flagsForPlan(flags) {
  return {
    clean: !!flags.clean,
    keepOthers: !!flags.keepOthers,
    safe: !!flags.safe,
    rolePins: flags.rolePins ?? flags.role_pins ?? null,
    justOpenedRoles: flags.justOpenedRoles ?? flags.just_opened_roles ?? null,
    workspace: flags.workspace ?? 0,
  };
}

describe("layout-plan planReconcile (AL1 expected parity)", () => {
  it("has expected fixtures", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  for (const file of files) {
    it(file, () => {
      const c = loadJson(join(EXPECTED_DIR, file));
      expect(c.plan).toBeTruthy();
      const got = planReconcile(
        structuredClone(c.profile),
        structuredClone(c.forest),
        flagsForPlan(c.flags || {})
      );
      expect(got).toEqual(c.plan);

      // Cold ensure_layout must not appear without skeleton owning topology.
      if (got.coldEmpty) {
        const ensureLayout = (got.actions || []).filter((a) => a.op === "ensure_layout");
        expect(ensureLayout).toEqual([]);
        const sk = (got.actions || []).filter((a) => a.op === "ensure_skeleton");
        expect(sk.length).toBeGreaterThanOrEqual(1);
      }
    });
  }
});

describe("planActionsToSteps pure mapping", () => {
  it("maps open-only plan to empty place/structure (opens skipped)", () => {
    const steps = planActionsToSteps([
      {
        op: "open",
        role: "x",
        open: { app: "ghostty" },
        slot: "mon0",
        workspace: 0,
      },
    ]);
    expect(steps).toEqual([]);
  });

  it("maps ensure_skeleton → skeleton", () => {
    const steps = planActionsToSteps([
      {
        op: "ensure_skeleton",
        workspace: 0,
        mons: [{ mon: 0, slot: "mon0", split: "hsplit", children: [] }],
      },
    ]);
    expect(steps).toEqual([
      {
        op: "skeleton",
        workspace: 0,
        mons: [{ mon: 0, slot: "mon0", split: "hsplit", children: [] }],
      },
    ]);
  });

  it("maps move/park/close/ensure_layout/order/size/focus", () => {
    const steps = planActionsToSteps(
      [
        {
          op: "move",
          windowId: 10,
          slot: "mon1.term",
          workspace: 0,
          childIndex: 0,
          position: "start",
        },
        { op: "park", windowId: 11, slot: "mon0", destWindowId: 10 },
        { op: "close", windowId: 12 },
        {
          op: "ensure_layout",
          slot: "mon0.left-tab",
          mode: "tabbed",
          windowIds: [1, 2],
        },
        {
          op: "ensure_layout",
          slot: "mon0",
          mode: "hsplit",
          windowIds: [3],
        },
        {
          op: "ensure_order",
          slot: "mon0",
          mode: "hsplit",
          windowIds: [3, 4],
        },
        {
          op: "ensure_sizes",
          slot: "mon0",
          windowIds: [3, 4],
          shares: [0.5, 0.5],
        },
        {
          op: "focus",
          selector: "id:1",
          reason: "active",
        },
      ],
      { forceClose: true }
    );

    expect(steps).toEqual([
      {
        op: "move",
        tile: "id:10",
        dest: "path:mo1ws0",
        position: "start",
      },
      { op: "move", tile: "id:11", dest: "id:10" },
      { op: "close", selector: "id:12", force: true },
      { op: "layout", mode: "tabbed", selector: "id:1" },
      { op: "move", tile: "id:2", dest: "id:1" },
      { op: "layout", mode: "hsplit", selector: "id:3" },
      { op: "order", windowIds: ["id:1", "id:2"] },
      { op: "order", windowIds: ["id:3", "id:4"] },
      { op: "size", windowIds: ["id:3", "id:4"], shares: [0.5, 0.5] },
      { op: "focus", selector: "id:1", keyboard: false },
    ]);
  });

  it("maps residual-replan-pins plan actions without throw", () => {
    const c = loadJson(join(EXPECTED_DIR, "residual-replan-pins.json"));
    const plan = planReconcile(
      structuredClone(c.profile),
      structuredClone(c.forest),
      flagsForPlan(c.flags || {})
    );
    const steps = planActionsToSteps(plan.actions);
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.every((s) => s.op)).toBe(true);
  });
});

/**
 * Residual after cold open: skeleton PHs still present, real windows mapped as
 * mon siblings (map/PlaceNext missed the tab CON). Bind must run **and**
 * ensure_layout for ungrouped multi-role tab slots (host mon1.s0 class).
 */
describe("planReconcile residual with layout PHs + ungrouped tab roles", () => {
  function mon(id, children, monIndex) {
    return {
      nodeType: "MONITOR",
      layout: "HSPLIT",
      id,
      stableKey: id,
      children,
      rect: { x: monIndex * 2560, y: 0, width: 2560, height: 1440 },
      percent: 0,
      userSized: false,
    };
  }
  function win(windowId, wmClass, title, monitor) {
    return {
      nodeType: "WINDOW",
      layout: null,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      percent: 0,
      userSized: false,
      children: [],
      wmClass,
      wmClassInstance: wmClass,
      title,
      windowId,
      pid: 1,
      monitor,
      mode: "TILE",
    };
  }
  function ph(windowId, role, slot, monitor) {
    return {
      nodeType: "WINDOW",
      layout: null,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      percent: 0,
      userSized: false,
      children: [],
      wmClass: "forge-placeholder",
      title: role,
      windowId,
      pid: 0,
      monitor,
      mode: "TILE",
      placeholder: true,
      layoutRole: role,
      layoutSlot: slot,
    };
  }
  function tab(children) {
    return {
      nodeType: "CON",
      layout: "TABBED",
      rect: { x: 0, y: 0, width: 100, height: 100 },
      percent: 0,
      userSized: false,
      children,
    };
  }

  const profile = {
    version: 2,
    mode: "reconcile",
    roles: [
      {
        id: "A",
        match: { class: "app-a" },
        open: { app: "A", wmClass: "app-a" },
        slot: "mon0.s0",
      },
      {
        id: "B",
        match: { class: "app-b" },
        open: { app: "B", wmClass: "app-b" },
        slot: "mon0.s0",
      },
      {
        id: "term",
        match: { class: "term" },
        open: { app: "term", wmClass: "term" },
        slot: "mon0.term",
      },
      {
        id: "Y",
        match: { class: "app-y" },
        open: { app: "Y", wmClass: "app-y" },
        slot: "mon1.s0",
      },
      {
        id: "G",
        match: { class: "app-g" },
        open: { app: "G", wmClass: "app-g" },
        slot: "mon1.s0",
      },
      {
        id: "V",
        match: { class: "app-v" },
        open: { app: "V", wmClass: "app-v" },
        slot: "mon1.s0",
      },
    ],
    layout: {
      mon0: {
        split: "hsplit",
        children: [
          { id: "s0", layout: "tabbed", roles: ["A", "B"], active: "B" },
          { id: "term", roles: ["term"] },
        ],
      },
      mon1: {
        split: "hsplit",
        children: [{ id: "s0", layout: "tabbed", roles: ["Y", "G", "V"], active: "Y" }],
      },
    },
    focus: "term",
  };

  it("emits bind + ensure_layout for mon1.s0 when PHs remain and roles are mon siblings", () => {
    const forest = {
      apiVersion: 1,
      monitors: [
        mon(
          "mo0ws0",
          [
            tab([ph(9001, "A", "mon0.s0", 0), ph(9002, "B", "mon0.s0", 0)]),
            ph(9003, "term", "mon0.term", 0),
            win(1, "app-a", "A", 0),
            win(2, "app-b", "B", 0),
            win(3, "term", "term", 0),
          ],
          0
        ),
        mon(
          "mo1ws0",
          [
            tab([
              ph(9004, "Y", "mon1.s0", 1),
              ph(9005, "G", "mon1.s0", 1),
              ph(9006, "V", "mon1.s0", 1),
            ]),
            win(4, "app-y", "Y", 1),
            win(5, "app-g", "G", 1),
            win(6, "app-v", "V", 1),
          ],
          1
        ),
      ],
      focusWindowId: 3,
      activeWorkspace: 0,
      nWorkspaces: 1,
    };
    const pins = { A: 1, B: 2, term: 3, Y: 4, G: 5, V: 6 };
    const plan = planReconcile(profile, forest, {
      clean: true,
      rolePins: pins,
      justOpenedRoles: Object.keys(pins),
      workspace: 0,
    });
    expect(plan.ok).toBe(true);
    expect(plan.coldEmpty).toBe(false);
    const binds = (plan.actions || []).filter((a) => a.op === "bind");
    expect(binds.length).toBe(6);
    const ensures = (plan.actions || []).filter((a) => a.op === "ensure_layout");
    const mon1Tab = ensures.find((a) => a.slot === "mon1.s0" && a.mode === "tabbed");
    expect(mon1Tab).toBeTruthy();
    expect(mon1Tab.windowIds.map(String).sort()).toEqual(["4", "5", "6"]);
    const mon0Tab = ensures.find((a) => a.slot === "mon0.s0" && a.mode === "tabbed");
    expect(mon0Tab).toBeTruthy();
    // Steps: binds before layout/join (partition order via planActionsToSteps).
    const steps = planActionsToSteps(plan.actions, { workspace: 0 });
    const firstLayout = steps.findIndex((s) => s.op === "layout");
    const lastBind = steps.map((s) => s.op).lastIndexOf("bind");
    expect(lastBind).toBeGreaterThanOrEqual(0);
    expect(firstLayout).toBeGreaterThan(lastBind);
  });
});
