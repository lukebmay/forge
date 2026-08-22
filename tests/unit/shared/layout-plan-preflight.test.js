/**
 * Layout profile preflight: float tiles refuse, dual-mon warn, unknown keys.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReconcileProfile } from "../../../lib/shared/layout-plan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../cli/fixtures/layout");

function load(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("layout-plan preflight", () => {
  it("accepts good dual-mon dev-like bare array", () => {
    const warnings = [];
    const prof = validateReconcileProfile(load("profile-preflight-dual-mon-good.json"), {
      warnings,
    });
    expect(Object.keys(prof.layout || {}).sort()).toEqual(["mon0", "mon1"]);
    expect(warnings).toEqual([]);
  });

  it("accepts flat single-mon without dual-mon warning", () => {
    const warnings = [];
    const prof = validateReconcileProfile(load("profile-preflight-flat-single-mon.json"), {
      warnings,
    });
    expect(Object.keys(prof.layout || {})).toEqual(["mon0"]);
    expect(warnings).toEqual([]);
    expect((prof.roles || []).some((r) => /guake/i.test(String(r.id || "")))).toBe(false);
  });

  it("refuses Guake / float-class roles baked into tiles", () => {
    expect(() => validateReconcileProfile(load("profile-preflight-float-guake.json"))).toThrow(
      /float\/ignore-class role\(s\) in tiles/i
    );
    expect(() => validateReconcileProfile(load("profile-preflight-float-guake.json"))).toThrow(
      /Guake/i
    );
  });

  it("warns on vinyl-style flat dual-mon intent; strict refuses", () => {
    const warnings = [];
    const prof = validateReconcileProfile(load("profile-preflight-vinyl-flat-dual.json"), {
      warnings,
    });
    expect(Object.keys(prof.layout || {})).toEqual(["mon0"]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/ambiguous dual-mon/i);
    expect(warnings[0]).toMatch(/\[\[mon0/);

    expect(() =>
      validateReconcileProfile(load("profile-preflight-vinyl-flat-dual.json"), {
        strictAmbiguousDualMon: true,
      })
    ).toThrow(/ambiguous dual-mon/i);
  });

  it("surfaces unknown role-cell keys normalize would drop", () => {
    expect(() =>
      validateReconcileProfile({
        tiles: [{ app: "ghostty", timeout: 5000 }],
      })
    ).toThrow(/unknown key\(s\).*timeout/i);
  });

  it("surfaces unknown top-level profile keys", () => {
    expect(() =>
      validateReconcileProfile({
        tiles: ["ghostty"],
        junkField: true,
      })
    ).toThrow(/profile unknown key\(s\).*junkField/i);
  });

  it("allows Guake under floating[] (not tiles)", () => {
    const prof = validateReconcileProfile({
      tiles: ["ghostty"],
      floating: ["Guake"],
    });
    expect((prof.roles || []).map((r) => r.id)).toContain("ghostty");
    expect(prof.floating).toEqual(["Guake"]);
  });
});
