import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStructurePlan,
  isOpenAction,
  isPlaceMove,
  isWindowJoinMove,
  listOpenActions,
  partitionStepsByPhase,
  phaseHasStructureWork,
  stepsForPhase,
} from "../../../lib/extension/layout-apply-structure.js";
import { planActionsToSteps } from "../../../lib/shared/layout-plan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = join(__dirname, "../cli/fixtures/layout/expected");

function loadExpected(id) {
  return JSON.parse(readFileSync(join(EXPECTED, `${id}.json`), "utf8"));
}

describe("layout-apply-structure pure", () => {
  it("isOpenAction detects plan open ops only", () => {
    expect(isOpenAction({ op: "open", role: "x" })).toBe(true);
    expect(isOpenAction({ op: "ensure_layout" })).toBe(false);
    expect(isOpenAction({ op: "move" })).toBe(false);
    expect(isOpenAction(null)).toBe(false);
  });

  it("classifies place vs join moves", () => {
    expect(isWindowJoinMove({ op: "move", tile: "id:1", dest: "id:2" })).toBe(true);
    expect(isPlaceMove({ op: "move", tile: "id:1", dest: "path:mo0ws0" })).toBe(true);
    expect(isPlaceMove({ op: "move", tile: "id:1", dest: "id:2" })).toBe(false);
  });

  it("perfect-clean: empty steps, no open", () => {
    const d = loadExpected("perfect-clean");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    expect(r.ok).toBe(true);
    expect(r.steps).toEqual([]);
    expect(r.openCount).toBe(0);
  });

  it("nested-hsplit-clean: order step only", () => {
    const d = loadExpected("nested-hsplit-clean");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.op)).toEqual(["order"]);
    const b = partitionStepsByPhase(r.steps);
    expect(stepsForPhase(b, "order")).toHaveLength(1);
    expect(stepsForPhase(b, "skeleton")).toHaveLength(0);
  });

  it("empty-clean: skeleton + deferred opens (no open steps)", () => {
    const d = loadExpected("empty-clean");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    expect(r.ok).toBe(true);
    expect(r.openCount).toBe(7);
    expect(listOpenActions(r.plan.actions)).toHaveLength(7);
    expect(r.steps.every((s) => s.op !== "open")).toBe(true);
    expect(r.steps.some((s) => s.op === "skeleton")).toBe(true);
    const b = partitionStepsByPhase(r.steps);
    expect(b.skeleton).toHaveLength(1);
    expect(b.open).toHaveLength(0);
  });

  it("wrong-mon-clean: place moves in open bucket; layout/joins in order", () => {
    const d = loadExpected("wrong-mon-clean");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    expect(r.ok).toBe(true);
    expect(r.openCount).toBe(0);
    const b = partitionStepsByPhase(r.steps);
    expect(b.open.every((s) => s.op === "move" && !String(s.dest).startsWith("id:"))).toBe(true);
    expect(b.open.length).toBeGreaterThanOrEqual(1);
    expect(b.order.some((s) => s.op === "layout")).toBe(true);
    expect(b.order.some((s) => s.op === "order" || isWindowJoinMove(s))).toBe(true);
  });

  it("ensure_layout maps to layout steps (executor uses setLayout path, not plan change)", () => {
    const d = loadExpected("residual-replan-pins");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    expect(r.ok).toBe(true);
    expect(r.plan.actions.some((a) => a.op === "ensure_layout")).toBe(true);
    expect(r.steps.some((s) => s.op === "layout")).toBe(true);
    // planActionsToSteps already skips open; structure buckets put layout in order
    expect(partitionStepsByPhase(r.steps).order.some((s) => s.op === "layout")).toBe(true);
  });

  it("planActionsToSteps matches buildStructurePlan steps", () => {
    const d = loadExpected("wrong-mon-clean");
    const r = buildStructurePlan(d.profile, d.forest, d.flags);
    const direct = planActionsToSteps(r.plan.actions, { workspace: 0 });
    expect(r.steps).toEqual(direct);
  });

  it("phaseHasStructureWork covers AL5 phases only", () => {
    expect(phaseHasStructureWork("skeleton")).toBe(true);
    expect(phaseHasStructureWork("order")).toBe(true);
    expect(phaseHasStructureWork("hard-ready")).toBe(false);
    expect(phaseHasStructureWork("soft")).toBe(false);
    expect(phaseHasStructureWork("verify")).toBe(false);
  });
});
