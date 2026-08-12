import { describe, it, expect } from "vitest";
import {
  buildWorkareasFingerprint,
  workareasFingerprintsEqual,
  workareasGeometryEqual,
  classifyWorkareasChange,
  pickCollectSurvivorIndex,
  homesMatchLastGoodSamples,
  deadMonitorIndices,
} from "../../../lib/extension/workareas-policy.js";

function mon(index, opts = {}) {
  return {
    index,
    connector: opts.connector ?? null,
    name: opts.name ?? null,
    isPrimary: opts.isPrimary ?? index === 0,
    x: opts.x ?? index * 1920,
    y: opts.y ?? 0,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
  };
}

describe("workareas-policy fingerprint", () => {
  it("builds ordered fingerprint with stableKey + geometry", () => {
    const fp = buildWorkareasFingerprint([
      mon(1, { connector: "HDMI-1", isPrimary: false }),
      mon(0, { connector: "DP-1", isPrimary: true }),
    ]);
    expect(fp.monitors).toHaveLength(2);
    expect(fp.monitors[0].index).toBe(0);
    expect(fp.monitors[0].stableKey).toBe("conn:DP-1");
    expect(fp.monitors[0].width).toBe(1920);
    expect(fp.monitors[1].stableKey).toBe("conn:HDMI-1");
  });

  it("equal when identical geometry and keys", () => {
    const a = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1" }),
      mon(1, { connector: "HDMI-1" }),
    ]);
    const b = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1" }),
      mon(1, { connector: "HDMI-1" }),
    ]);
    expect(workareasFingerprintsEqual(a, b)).toBe(true);
  });

  it("unequal when size/scale geometry changes", () => {
    const a = buildWorkareasFingerprint([mon(0, { width: 3840, height: 2160 })]);
    const b = buildWorkareasFingerprint([mon(0, { width: 2560, height: 1440 })]);
    expect(workareasFingerprintsEqual(a, b)).toBe(false);
  });

  it("unequal when primary moves", () => {
    const a = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", isPrimary: true }),
      mon(1, { connector: "HDMI-1", isPrimary: false }),
    ]);
    const b = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", isPrimary: false }),
      mon(1, { connector: "HDMI-1", isPrimary: true }),
    ]);
    expect(workareasFingerprintsEqual(a, b)).toBe(false);
  });

  it("geometry-equal ignores stableKey format (conn vs geom)", () => {
    const withConn = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", width: 2560, height: 1440 }),
      mon(1, { connector: "HDMI-1", x: 2560, width: 2560, height: 1440 }),
    ]);
    const geomOnly = buildWorkareasFingerprint([
      mon(0, { width: 2560, height: 1440 }),
      mon(1, { x: 2560, width: 2560, height: 1440 }),
    ]);
    expect(workareasFingerprintsEqual(withConn, geomOnly)).toBe(false);
    expect(workareasGeometryEqual(withConn, geomOnly)).toBe(true);
  });

  it("geometry-unequal when scale/size changes", () => {
    const scaled = buildWorkareasFingerprint([
      mon(0, { width: 2560, height: 1440 }),
      mon(1, { x: 2560, width: 2560, height: 1440 }),
    ]);
    const native = buildWorkareasFingerprint([
      mon(0, { width: 3840, height: 2160 }),
      mon(1, { x: 3840, width: 3840, height: 2160 }),
    ]);
    expect(workareasGeometryEqual(scaled, native)).toBe(false);
  });
});

describe("workareas-policy classify", () => {
  const dual = () =>
    buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", isPrimary: true }),
      mon(1, { connector: "HDMI-1", isPrimary: false }),
    ]);

  it("noop for identical fingerprints", () => {
    const a = dual();
    expect(classifyWorkareasChange(a, dual())).toBe("noop");
  });

  it("thrash when prev missing (no quiet baseline)", () => {
    expect(classifyWorkareasChange(null, dual())).toBe("thrash");
    expect(classifyWorkareasChange({ monitors: [] }, dual())).toBe("thrash");
  });

  it("thrash when next empty", () => {
    expect(classifyWorkareasChange(dual(), { monitors: [] })).toBe("thrash");
  });

  it("retile when same mon set but geometry changes", () => {
    const prev = dual();
    const next = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", isPrimary: true, width: 2560, height: 1440 }),
      mon(1, { connector: "HDMI-1", isPrimary: false, x: 2560, width: 2560, height: 1440 }),
    ]);
    expect(classifyWorkareasChange(prev, next)).toBe("retile");
  });

  it("renumber when same geom, keys/indices only (GPU renumber)", () => {
    const prev = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1", isPrimary: true, x: 0 }),
      mon(1, { connector: "HDMI-1", isPrimary: false, x: 1920 }),
    ]);
    // Same physical layout geometry list order by index after renumber:
    // mon0 at x=1920, mon1 at x=0 — geometry per index changed → retile.
    // True renumber: same index→geom, only keys differ.
    const next = buildWorkareasFingerprint([
      mon(0, { connector: "HDMI-1", isPrimary: true, x: 0 }),
      mon(1, { connector: "DP-1", isPrimary: false, x: 1920 }),
    ]);
    expect(workareasGeometryEqual(prev, next)).toBe(true);
    expect(classifyWorkareasChange(prev, next)).toBe("renumber");
  });

  it("mon_loss when a head disappears", () => {
    const prev = dual();
    const next = buildWorkareasFingerprint([mon(0, { connector: "DP-1", isPrimary: true })]);
    expect(classifyWorkareasChange(prev, next)).toBe("mon_loss");
    expect(deadMonitorIndices(prev, next)).toEqual([1]);
  });

  it("mon_gain when a head appears", () => {
    const prev = buildWorkareasFingerprint([mon(0, { connector: "DP-1", isPrimary: true })]);
    const next = dual();
    expect(classifyWorkareasChange(prev, next)).toBe("mon_gain");
  });

  it("same mon count connector swap same geom is renumber (not thrash)", () => {
    // Key rewrite only (same rects): renumber path, not mon peel thrash.
    const prev = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1" }),
      mon(1, { connector: "HDMI-1" }),
    ]);
    const next = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1" }),
      mon(1, { connector: "DP-2" }),
    ]);
    expect(classifyWorkareasChange(prev, next)).toBe("renumber");
  });

  it("retile when geom: keys rewrite on scale (same mon count)", () => {
    const prev = buildWorkareasFingerprint([
      mon(0, { width: 3840, height: 2160, isPrimary: true }),
      mon(1, { x: 3840, width: 3840, height: 2160 }),
    ]);
    const next = buildWorkareasFingerprint([
      mon(0, { width: 2560, height: 1440, isPrimary: true }),
      mon(1, { x: 2560, width: 2560, height: 1440 }),
    ]);
    expect(prev.monitors[0].stableKey.startsWith("geom:")).toBe(true);
    expect(classifyWorkareasChange(prev, next)).toBe("retile");
  });

  it("retile on geom↔conn key churn with scale (R017 reverse)", () => {
    const prev = buildWorkareasFingerprint([
      mon(0, { width: 3840, height: 2160, isPrimary: true }),
      mon(1, { x: 3840, width: 3840, height: 2160 }),
    ]);
    const next = buildWorkareasFingerprint([
      mon(0, { connector: "DP-4", width: 2560, height: 1440, isPrimary: true }),
      mon(1, { connector: "HDMI-3", x: 2560, width: 2560, height: 1440 }),
    ]);
    expect(classifyWorkareasChange(prev, next)).toBe("retile");
  });

  it("thrash when mon count changes with mixed keys", () => {
    const prev = buildWorkareasFingerprint([
      mon(0, { connector: "DP-1" }),
      mon(1, { connector: "HDMI-1" }),
    ]);
    const next = buildWorkareasFingerprint([
      mon(0, { connector: "DP-2" }),
      mon(1, { connector: "HDMI-2" }),
      mon(2, { connector: "DP-3" }),
    ]);
    expect(classifyWorkareasChange(prev, next)).toBe("thrash");
  });
});

describe("workareas-policy helpers", () => {
  it("pickCollectSurvivorIndex prefers primary", () => {
    const fp = buildWorkareasFingerprint([
      mon(0, { connector: "A", isPrimary: false }),
      mon(1, { connector: "B", isPrimary: true }),
    ]);
    expect(pickCollectSurvivorIndex(fp)).toBe(1);
  });

  it("pickCollectSurvivorIndex falls back to lowest index", () => {
    const fp = buildWorkareasFingerprint([
      mon(2, { connector: "C", isPrimary: false }),
      mon(1, { connector: "B", isPrimary: false }),
    ]);
    expect(pickCollectSurvivorIndex(fp)).toBe(1);
  });

  it("homesMatchLastGoodSamples detects Meta vs tree drift", () => {
    expect(
      homesMatchLastGoodSamples([
        { treeMon: 0, metaMon: 0, lastGoodMon: 0 },
        { treeMon: 1, metaMon: 1, lastGoodMon: 1 },
      ])
    ).toBe(true);
    expect(homesMatchLastGoodSamples([{ treeMon: 1, metaMon: 0, lastGoodMon: 1 }])).toBe(false);
    expect(homesMatchLastGoodSamples([{ treeMon: 0, metaMon: 0, lastGoodMon: 1 }])).toBe(false);
  });

  it("homesMatchLastGoodSamples skips unready Meta mon", () => {
    expect(homesMatchLastGoodSamples([{ treeMon: 0, metaMon: -1, lastGoodMon: 0 }])).toBe(true);
  });
});
