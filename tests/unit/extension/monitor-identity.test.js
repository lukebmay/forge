import { describe, it, expect } from "vitest";
import {
  fingerprintMonitor,
  buildLiveMap,
  remapIndex,
  resolveIndexByStableKey,
  resolveMonWsIdByStableKey,
  monIndexFromId,
  workspaceFromId,
  createMonWsId,
} from "../../../lib/extension/monitor-identity.js";

describe("monitor-identity fingerprint", () => {
  it("prefers connector over name and geometry", () => {
    expect(
      fingerprintMonitor({
        index: 0,
        connector: "DP-1",
        name: "Dell",
        isPrimary: true,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      })
    ).toBe("conn:DP-1");
  });

  it("falls back to name when connector missing", () => {
    expect(
      fingerprintMonitor({
        index: 1,
        name: "Built-in Display",
        x: 1920,
        y: 0,
        width: 1920,
        height: 1080,
      })
    ).toBe("name:Built-in Display");
  });

  it("falls back to geometry + primary without connector", () => {
    expect(
      fingerprintMonitor({
        index: 0,
        isPrimary: true,
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
      })
    ).toBe("geom:0,0,3840,2160#primary");
  });

  it("geometry without primary omits #primary", () => {
    expect(
      fingerprintMonitor({
        index: 1,
        x: 3840,
        y: 0,
        width: 1920,
        height: 1080,
      })
    ).toBe("geom:3840,0,1920,1080");
  });

  it("trims connector whitespace and ignores empty", () => {
    expect(fingerprintMonitor({ index: 0, connector: "  HDMI-A-1  " })).toBe("conn:HDMI-A-1");
    expect(
      fingerprintMonitor({
        index: 0,
        connector: "  ",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      })
    ).toBe("geom:1,2,3,4");
  });

  it("does not crash on null/empty info", () => {
    expect(fingerprintMonitor(null)).toMatch(/^geom:/);
    expect(fingerprintMonitor({})).toMatch(/^geom:/);
  });
});

describe("monitor-identity buildLiveMap + uniqueness", () => {
  it("maps dual connectors uniquely both ways", () => {
    const map = buildLiveMap([
      { index: 0, connector: "DP-1", isPrimary: true, x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    expect(map.byKey.get("conn:DP-1")).toBe(0);
    expect(map.byKey.get("conn:HDMI-1")).toBe(1);
    expect(map.byIndex.get(0)).toBe("conn:DP-1");
    expect(map.byIndex.get(1)).toBe("conn:HDMI-1");
    expect(map.fingerprints).toHaveLength(2);
  });

  it("disambiguates colliding geom fingerprints with #idx", () => {
    const map = buildLiveMap([
      { index: 0, x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    expect(map.byIndex.get(0)).toBe("geom:0,0,1920,1080");
    expect(map.byIndex.get(1)).toBe("geom:0,0,1920,1080#idx:1");
    expect(map.byKey.size).toBe(2);
  });
});

describe("monitor-identity renumber remap", () => {
  it("remaps old index through stable connector after flip", () => {
    const prev = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    // Indices flipped; connectors swapped assignment
    const live = buildLiveMap([
      { index: 0, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    expect(remapIndex(0, prev.fingerprints, live)).toBe(1);
    expect(remapIndex(1, prev.fingerprints, live)).toBe(0);
    expect(resolveIndexByStableKey("conn:DP-1", live)).toBe(1);
  });

  it("remaps via geometry when connectors unknown", () => {
    const prev = buildLiveMap([
      { index: 0, isPrimary: true, x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    // Mutter renumbered: left geom now index 1
    const live = buildLiveMap([
      { index: 0, x: 1920, y: 0, width: 1920, height: 1080 },
      { index: 1, isPrimary: true, x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    expect(remapIndex(0, prev.fingerprints, live)).toBe(1);
    expect(remapIndex(1, prev.fingerprints, live)).toBe(0);
  });

  it("returns -1 when stable key gone (unplugged)", () => {
    const prev = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
      { index: 1, connector: "HDMI-1", x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    const live = buildLiveMap([
      { index: 0, connector: "DP-1", x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    expect(remapIndex(1, prev.fingerprints, live)).toBe(-1);
    expect(resolveIndexByStableKey("conn:HDMI-1", live)).toBe(-1);
  });
});

describe("monitor-identity mon-ws helpers", () => {
  it("parses and builds moNwsW ids", () => {
    expect(monIndexFromId("mo1ws2")).toBe(1);
    expect(workspaceFromId("mo1ws2")).toBe(2);
    expect(createMonWsId(1, 2)).toBe("mo1ws2");
    expect(monIndexFromId("bad")).toBe(-1);
  });

  it("resolveMonWsIdByStableKey rewrites mon index for workspace", () => {
    const live = buildLiveMap([
      { index: 0, connector: "HDMI-1" },
      { index: 1, connector: "DP-1" },
    ]);
    expect(resolveMonWsIdByStableKey({ id: "mo0ws0", stableKey: "conn:DP-1" }, live)).toBe(
      "mo1ws0"
    );
    expect(resolveMonWsIdByStableKey({ id: "mo0ws0", stableKey: "conn:MISSING" }, live)).toBe(null);
  });
});
