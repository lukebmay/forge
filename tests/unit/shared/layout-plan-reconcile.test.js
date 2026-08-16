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
