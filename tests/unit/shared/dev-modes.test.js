import { describe, it, expect } from "vitest";
import {
  DEV_MODE_TOKENS,
  parseDevModesArg,
  parseInstallDevFlag,
  readDevModes,
  hasDevMode,
  formatGSettingsStrv,
} from "../../../lib/shared/dev-modes.js";

describe("dev-modes (D095 S4)", () => {
  it("lists the locked tokens", () => {
    expect([...DEV_MODE_TOKENS]).toEqual([
      "strict-geometry",
      "geom-epsilon-measure",
      "fault-inject-geometry",
      "geom-trace",
    ]);
  });

  it("parses empty / null as empty modes", () => {
    expect(parseDevModesArg("")).toEqual({ ok: true, modes: [] });
    expect(parseDevModesArg(null)).toEqual({ ok: true, modes: [] });
    expect(parseDevModesArg(undefined)).toEqual({ ok: true, modes: [] });
  });

  it("parses comma-separated modes and dedupes", () => {
    const r = parseDevModesArg("strict-geometry, geom-trace,strict-geometry");
    expect(r.ok).toBe(true);
    expect(r.modes).toEqual(["strict-geometry", "geom-trace"]);
  });

  it("rejects unknown tokens", () => {
    const r = parseDevModesArg("strict-geometry,nope");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown dev mode/);
    expect(r.error).toMatch(/nope/);
    expect(r.modes).toEqual([]);
  });

  it("parseInstallDevFlag covers --dev / --dev= / --dev=a,b", () => {
    expect(parseInstallDevFlag("--dev")).toEqual({ kind: "dev", modes: [] });
    expect(parseInstallDevFlag("--dev=")).toEqual({ kind: "dev", modes: [] });
    expect(parseInstallDevFlag("--dev=strict-geometry,geom-trace")).toEqual({
      kind: "dev",
      modes: ["strict-geometry", "geom-trace"],
    });
    expect(parseInstallDevFlag("--dev=bogus").kind).toBe("error");
    expect(parseInstallDevFlag("--prod")).toBeNull();
  });

  it("hasDevMode reads strv settings and lists", () => {
    expect(hasDevMode(["strict-geometry"], "strict-geometry")).toBe(true);
    expect(hasDevMode([], "strict-geometry")).toBe(false);
    const settings = {
      get_strv: (k) => (k === "dev-modes" ? ["geom-trace"] : []),
    };
    expect(hasDevMode(settings, "geom-trace")).toBe(true);
    expect(hasDevMode(settings, "strict-geometry")).toBe(false);
    expect(readDevModes(settings)).toEqual(["geom-trace"]);
  });

  it("formatGSettingsStrv matches gsettings as syntax", () => {
    expect(formatGSettingsStrv([])).toBe("@as []");
    expect(formatGSettingsStrv(["strict-geometry"])).toBe("['strict-geometry']");
    expect(formatGSettingsStrv(["strict-geometry", "geom-trace"])).toBe(
      "['strict-geometry', 'geom-trace']"
    );
  });

  it("scaffold modes are recognizable flags (S6 stubs ok)", () => {
    for (const t of ["geom-epsilon-measure", "fault-inject-geometry", "geom-trace"]) {
      expect(hasDevMode([t], t)).toBe(true);
    }
  });
});
