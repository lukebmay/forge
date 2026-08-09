import { describe, it, expect } from "vitest";
import {
  OPEN_COMMIT_MAX_WAIT_MS,
  OPEN_DEFAULT_QUIET_MS,
  OPEN_DOCK_QUIET_MS,
  OPEN_FIRST_OPEN_EXTRA_MS,
  computeOpenMinQuietMs,
  isFirstOpenOfClass,
  isMaxWaitExceeded,
  isQuietMet,
  nextOpenCommitDelayMs,
  shouldCommitOpen,
} from "../../../lib/extension/layout-open.js";
import {
  AppThrashCatalog,
  GHOSTTY_MIN_QUIET_MS,
  SETTLE_LEARN_PAD,
} from "../../../lib/extension/app-thrash-catalog.js";

describe("layout-open constants", () => {
  it("exports locked quiet / max-wait floors", () => {
    expect(OPEN_DEFAULT_QUIET_MS).toBe(200);
    expect(OPEN_DOCK_QUIET_MS).toBe(50);
    expect(OPEN_COMMIT_MAX_WAIT_MS).toBe(2500);
    expect(OPEN_FIRST_OPEN_EXTRA_MS).toBe(400);
  });
});

describe("computeOpenMinQuietMs", () => {
  it("default open uses OPEN_DEFAULT_QUIET_MS", () => {
    expect(computeOpenMinQuietMs({})).toBe(OPEN_DEFAULT_QUIET_MS);
    expect(computeOpenMinQuietMs({ firstOpen: false })).toBe(OPEN_DEFAULT_QUIET_MS);
  });

  it("dock uses short floor", () => {
    expect(computeOpenMinQuietMs({ isDock: true })).toBe(OPEN_DOCK_QUIET_MS);
    expect(computeOpenMinQuietMs({ isDock: true, firstOpen: true })).toBe(OPEN_DOCK_QUIET_MS);
  });

  it("ghostty / catalog: SE10 seed 0 falls to default open quiet", () => {
    const cat = new AppThrashCatalog();
    const g = cat.lookup("ghostty");
    expect(g.minQuietMs).toBe(0);
    expect(GHOSTTY_MIN_QUIET_MS).toBe(0);
    const ms = computeOpenMinQuietMs({
      catalogMinQuietMs: g.minQuietMs,
      firstOpen: false,
    });
    expect(ms).toBe(OPEN_DEFAULT_QUIET_MS);
  });

  it("dock + catalog raises above dock floor when thrashy", () => {
    // Learned geom quiet (not brand seed — SE10 dropped Ghostty minQuiet seed).
    const thrashyCatalogMs = 300;
    const ms = computeOpenMinQuietMs({
      isDock: true,
      catalogMinQuietMs: thrashyCatalogMs,
    });
    expect(ms).toBe(thrashyCatalogMs);
    expect(ms).toBeGreaterThan(OPEN_DOCK_QUIET_MS);
  });

  it("first-open adds extra quiet (non-dock)", () => {
    const ms = computeOpenMinQuietMs({ firstOpen: true });
    expect(ms).toBe(OPEN_DEFAULT_QUIET_MS + OPEN_FIRST_OPEN_EXTRA_MS);
  });

  it("first-open ghostty is catalog + first extra", () => {
    const ms = computeOpenMinQuietMs({
      catalogMinQuietMs: GHOSTTY_MIN_QUIET_MS,
      firstOpen: true,
    });
    expect(ms).toBe(
      Math.max(OPEN_DEFAULT_QUIET_MS, GHOSTTY_MIN_QUIET_MS) + OPEN_FIRST_OPEN_EXTRA_MS
    );
  });

  it("treats bad catalog values as zero", () => {
    expect(computeOpenMinQuietMs({ catalogMinQuietMs: -10 })).toBe(OPEN_DEFAULT_QUIET_MS);
    expect(computeOpenMinQuietMs({ catalogMinQuietMs: "x" })).toBe(OPEN_DEFAULT_QUIET_MS);
  });

  it("reads raised catalog minQuiet after settle samples (SL1)", () => {
    const cat = new AppThrashCatalog();
    cat.recordSettleSample("org.example.Learned", { ms: 500 });
    const entry = cat.lookup("org.example.Learned");
    expect(entry.minQuietMs).toBe(500 * SETTLE_LEARN_PAD);
    const ms = computeOpenMinQuietMs({
      catalogMinQuietMs: entry.minQuietMs,
      firstOpen: false,
    });
    expect(ms).toBe(Math.max(OPEN_DEFAULT_QUIET_MS, 500 * SETTLE_LEARN_PAD));
    expect(ms).toBeGreaterThan(OPEN_DEFAULT_QUIET_MS);
  });
});

describe("isQuietMet / isMaxWaitExceeded / shouldCommitOpen", () => {
  it("quiet not met before minQuiet from last external", () => {
    expect(
      isQuietMet({
        openedAt: 1000,
        lastExternalGeomAt: 1000,
        minQuietMs: 200,
        now: 1199,
      })
    ).toBe(false);
    expect(
      isQuietMet({
        openedAt: 1000,
        lastExternalGeomAt: 1000,
        minQuietMs: 200,
        now: 1200,
      })
    ).toBe(true);
  });

  it("quiet measured from last external, not open, when external later", () => {
    expect(
      isQuietMet({
        openedAt: 1000,
        lastExternalGeomAt: 1500,
        minQuietMs: 200,
        now: 1650,
      })
    ).toBe(false);
    expect(
      isQuietMet({
        openedAt: 1000,
        lastExternalGeomAt: 1500,
        minQuietMs: 200,
        now: 1700,
      })
    ).toBe(true);
  });

  it("null lastExternal falls back to openedAt", () => {
    expect(
      isQuietMet({
        openedAt: 1000,
        lastExternalGeomAt: null,
        minQuietMs: 200,
        now: 1200,
      })
    ).toBe(true);
  });

  it("max-wait forces commit", () => {
    const base = {
      openedAt: 0,
      lastExternalGeomAt: 2490,
      minQuietMs: 500,
      maxWaitMs: OPEN_COMMIT_MAX_WAIT_MS,
      now: OPEN_COMMIT_MAX_WAIT_MS - 1,
    };
    expect(isQuietMet(base)).toBe(false);
    expect(isMaxWaitExceeded(base)).toBe(false);
    expect(shouldCommitOpen(base)).toBe(false);

    const atCap = { ...base, now: OPEN_COMMIT_MAX_WAIT_MS };
    expect(isMaxWaitExceeded(atCap)).toBe(true);
    expect(shouldCommitOpen(atCap)).toBe(true);
  });
});

describe("nextOpenCommitDelayMs (quiet reset)", () => {
  it("returns remaining quiet after open", () => {
    expect(
      nextOpenCommitDelayMs({
        openedAt: 0,
        lastExternalGeomAt: 0,
        minQuietMs: 200,
        maxWaitMs: 2500,
        now: 50,
      })
    ).toBe(150);
  });

  it("resets when external geom moves lastExternal later", () => {
    // After 100ms quiet of 200 → 100 remain; external at t=100 → full 200 again
    expect(
      nextOpenCommitDelayMs({
        openedAt: 0,
        lastExternalGeomAt: 100,
        minQuietMs: 200,
        maxWaitMs: 2500,
        now: 100,
      })
    ).toBe(200);
  });

  it("caps delay by remaining max-wait", () => {
    expect(
      nextOpenCommitDelayMs({
        openedAt: 0,
        lastExternalGeomAt: 2400,
        minQuietMs: 500,
        maxWaitMs: 2500,
        now: 2400,
      })
    ).toBe(100); // max wait remaining, not 500 quiet
  });

  it("returns 0 when already should commit", () => {
    expect(
      nextOpenCommitDelayMs({
        openedAt: 0,
        lastExternalGeomAt: 0,
        minQuietMs: 200,
        maxWaitMs: 2500,
        now: 200,
      })
    ).toBe(0);
    expect(
      nextOpenCommitDelayMs({
        openedAt: 0,
        lastExternalGeomAt: 2490,
        minQuietMs: 500,
        maxWaitMs: 2500,
        now: 2500,
      })
    ).toBe(0);
  });
});

describe("isFirstOpenOfClass", () => {
  it("true when no entry or never opened", () => {
    expect(isFirstOpenOfClass(null)).toBe(true);
    expect(isFirstOpenOfClass(undefined)).toBe(true);
    expect(isFirstOpenOfClass({ seenOpens: 0, firstOpenObserved: false })).toBe(true);
  });

  it("false after recordOpen", () => {
    const cat = new AppThrashCatalog();
    cat.recordOpen("ghostty");
    expect(isFirstOpenOfClass(cat.lookup("ghostty"))).toBe(false);
  });
});
