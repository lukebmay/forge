/**
 * AL2: JS normalizeProfile / validateReconcileProfile parity with Python oracle.
 *
 * Expected fixtures: tests/unit/cli/fixtures/layout/expected-normalize/
 * Regenerate: python3 scripts/forge/dump_layout_normalize_expected.py
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeProfile,
  validateReconcileProfile,
  PROFILE_VERSION,
  MODE_RECONCILE,
  normalizeShares,
} from "../../../lib/shared/layout-plan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../cli/fixtures/layout");
const EXPECTED_DIR = join(FIXTURES, "expected-normalize");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadCase(fileName) {
  const c = loadJson(join(EXPECTED_DIR, fileName));
  let input = c.input;
  if (c.profileFile) {
    input = loadJson(join(FIXTURES, c.profileFile));
  }
  return { ...c, input };
}

function runOp(op, input, opts) {
  // Accept both Python mon_count and JS monCount in fixture opts
  const callOpts = {
    mon_count: opts.mon_count ?? opts.monCount ?? null,
    mon_indices: opts.mon_indices ?? opts.monIndices ?? null,
  };
  if (op === "normalize") return normalizeProfile(input, callOpts);
  if (op === "validate") return validateReconcileProfile(input, callOpts);
  throw new Error(`unknown op ${op}`);
}

const files = readdirSync(EXPECTED_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("layout-plan normalize/validate (Python parity)", () => {
  it("has expected fixtures", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(file, () => {
      const c = loadCase(file);
      expect(c.ok).toBe(true);
      const got = runOp(c.op, structuredClone(c.input), c.opts || {});
      expect(got).toEqual(c.output);
    });
  }
});

describe("_forge-test-inkscape-ws2 profile load", () => {
  it("normalizes vinyl-shaped dual-mon tiles with monCount 2", () => {
    const raw = loadJson(join(FIXTURES, "_forge-test-inkscape-ws2.json"));
    const got = normalizeProfile(structuredClone(raw), { monCount: 2 });
    expect(got.version).toBe(2);
    expect(got.layout.mon0).toBeTruthy();
    expect(got.layout.mon1).toBeTruthy();
    const ids = (got.roles || []).map((r) => String(r.id || ""));
    expect(ids).toContain("inkscape");
    const mon1Kids = got.layout.mon1.children || [];
    expect(mon1Kids.some((c) => String(c.layout || "").toLowerCase() === "tabbed")).toBe(true);
  });
});

describe("layout-plan exports", () => {
  it("exports constants", () => {
    expect(PROFILE_VERSION).toBe(2);
    expect(MODE_RECONCILE).toBe("reconcile");
  });

  it("normalizeShares matches Python rounding", () => {
    expect(normalizeShares([2, 1])).toEqual([0.667, 0.333]);
    expect(normalizeShares([1, 1])).toEqual([0.5, 0.5]);
    expect(normalizeShares([1])).toBeNull();
    expect(normalizeShares([0, 1])).toBeNull();
  });
});
