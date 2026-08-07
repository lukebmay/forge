import { describe, it, expect, beforeEach } from "vitest";
import {
  AppThrashCatalog,
  BUILT_IN_THRASH_DEFAULTS,
  GHOSTTY_MIN_QUIET_MS,
  SETTLE_EMA_ALPHA,
  SETTLE_LEARN_CAP_MS,
  SETTLE_LEARN_PAD,
  THRASH_SCORE_THRESHOLD,
  classStem,
  computeLearnedMinQuietMs,
  extractWmClass,
  hasThrashyManagedTile,
  normalizeWmClass,
  scoreFromCounters,
} from "../../../lib/extension/app-thrash-catalog.js";

describe("normalizeWmClass / classStem", () => {
  it("normalizes case and trims", () => {
    expect(normalizeWmClass("  Ghostty ")).toBe("ghostty");
    expect(normalizeWmClass("Com.Mitchellh.Ghostty")).toBe("com.mitchellh.ghostty");
    expect(normalizeWmClass(null)).toBe("");
    expect(normalizeWmClass(undefined)).toBe("");
  });

  it("stem is last package segment or whole string", () => {
    expect(classStem("com.mitchellh.ghostty")).toBe("ghostty");
    expect(classStem("Ghostty")).toBe("ghostty");
    expect(classStem("org.gnome.Nautilus")).toBe("nautilus");
    expect(classStem("")).toBe("");
  });
});

describe("scoreFromCounters", () => {
  it("weights postApplyDrift 2× and sums postMapSizeChanges", () => {
    expect(scoreFromCounters({})).toBe(0);
    expect(scoreFromCounters({ postMapSizeChanges: 2, postApplyDrift: 0 })).toBe(2);
    expect(scoreFromCounters({ postMapSizeChanges: 0, postApplyDrift: 1 })).toBe(2);
    expect(scoreFromCounters({ postMapSizeChanges: 1, postApplyDrift: 1 })).toBe(3);
    expect(scoreFromCounters({ postMapSizeChanges: 3, postApplyDrift: 2 })).toBe(7);
  });

  it("treats negative / NaN as zero", () => {
    expect(scoreFromCounters({ postMapSizeChanges: -1, postApplyDrift: -5 })).toBe(0);
    expect(scoreFromCounters({ postMapSizeChanges: "x", postApplyDrift: null })).toBe(0);
  });
});

describe("AppThrashCatalog built-in Ghostty", () => {
  /** @type {AppThrashCatalog} */
  let cat;

  beforeEach(() => {
    cat = new AppThrashCatalog();
  });

  it("exports ghostty defaults in the locked range", () => {
    expect(GHOSTTY_MIN_QUIET_MS).toBeGreaterThanOrEqual(150);
    expect(GHOSTTY_MIN_QUIET_MS).toBeLessThanOrEqual(300);
    expect(THRASH_SCORE_THRESHOLD).toBe(3);
    expect(BUILT_IN_THRASH_DEFAULTS.length).toBeGreaterThanOrEqual(1);
  });

  it("lookup by full reverse-DNS class", () => {
    const e = cat.lookup("com.mitchellh.ghostty");
    expect(e).toBeTruthy();
    expect(e.builtIn).toBe(true);
    expect(e.needsExtraVerify).toBe(true);
    expect(e.minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
  });

  it("lookup by stem and mixed case", () => {
    const a = cat.lookup("ghostty");
    const b = cat.lookup("Ghostty");
    const c = cat.lookup("COM.MITCHELLH.GHOSTTY");
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a.needsExtraVerify).toBe(true);
  });

  it("needsExtraVerify helper matches lookup", () => {
    expect(cat.needsExtraVerify("ghostty")).toBe(true);
    expect(cat.needsExtraVerify("com.mitchellh.ghostty")).toBe(true);
    expect(cat.needsExtraVerify("org.gnome.Nautilus")).toBe(false);
    expect(cat.needsExtraVerify(null)).toBe(false);
  });
});

describe("AppThrashCatalog observation + sticky built-in", () => {
  /** @type {AppThrashCatalog} */
  let cat;

  beforeEach(() => {
    cat = new AppThrashCatalog();
  });

  it("score rises with postMapSizeChanges and postApplyDrift", () => {
    const e = cat.recordPostMapSizeChange("org.example.Thrashy");
    expect(e.builtIn).toBe(false);
    expect(e.postMapSizeChanges).toBe(1);
    expect(e.thrashScore).toBe(1);
    expect(e.needsExtraVerify).toBe(false);

    cat.recordPostMapSizeChange("org.example.Thrashy");
    expect(e.postMapSizeChanges).toBe(2);
    expect(e.thrashScore).toBe(2);
    expect(e.needsExtraVerify).toBe(false);

    cat.recordPostApplyDrift("org.example.Thrashy");
    expect(e.postApplyDrift).toBe(1);
    expect(e.thrashScore).toBe(4); // 2 + 2*1
    expect(e.needsExtraVerify).toBe(true);
  });

  it("crosses threshold on three postMapSizeChanges alone", () => {
    cat.recordPostMapSizeChange("Foo");
    cat.recordPostMapSizeChange("Foo");
    const e = cat.recordPostMapSizeChange("Foo");
    expect(e.thrashScore).toBe(3);
    expect(e.needsExtraVerify).toBe(true);
  });

  it("needsExtraVerify sticky for built-in (low observation does not clear)", () => {
    const e = cat.lookup("ghostty");
    expect(e.needsExtraVerify).toBe(true);
    expect(e.postMapSizeChanges).toBe(0);
    expect(e.thrashScore).toBe(0);
    // recompute via no-op-ish record path still sticky
    e.postMapSizeChanges = 0;
    e.postApplyDrift = 0;
    e.thrashScore = 0;
    // recordOpen must not clear built-in flag
    cat.recordOpen("ghostty");
    expect(e.needsExtraVerify).toBe(true);
    expect(e.builtIn).toBe(true);
    expect(e.seenOpens).toBe(1);
    expect(e.firstOpenObserved).toBe(true);
  });

  it("built-in still accumulates counters / score", () => {
    cat.recordPostMapSizeChange("com.mitchellh.ghostty");
    cat.recordPostApplyDrift("ghostty");
    const e = cat.lookup("ghostty");
    expect(e.postMapSizeChanges).toBe(1);
    expect(e.postApplyDrift).toBe(1);
    expect(e.thrashScore).toBe(3);
    expect(e.needsExtraVerify).toBe(true);
  });

  it("recordOpen bookkeeping for learned class", () => {
    const e = cat.recordOpen("org.gnome.Nautilus");
    expect(e.seenOpens).toBe(1);
    expect(e.firstOpenObserved).toBe(true);
    expect(e.builtIn).toBe(false);
    cat.recordOpen("org.gnome.Nautilus");
    expect(e.seenOpens).toBe(2);
  });

  it("getOrCreate aliases full class onto existing stem entry", () => {
    const stem = cat.lookup("ghostty");
    const viaFull = cat.getOrCreate("com.mitchellh.ghostty");
    expect(viaFull).toBe(stem);
  });

  it("null/empty class is a no-op", () => {
    expect(cat.recordOpen(null)).toBeNull();
    expect(cat.recordPostMapSizeChange("")).toBeNull();
    expect(cat.recordPostApplyDrift(undefined)).toBeNull();
    expect(cat.lookup("")).toBeNull();
  });
});

describe("extractWmClass / hasThrashyManagedTile", () => {
  it("extractWmClass from get_wm_class and plain fields", () => {
    expect(extractWmClass({ get_wm_class: () => "ghostty" })).toBe("ghostty");
    expect(extractWmClass({ wmClass: "Foo" })).toBe("Foo");
    expect(extractWmClass({ wm_class: "Bar" })).toBe("Bar");
    expect(extractWmClass(null)).toBeNull();
    expect(extractWmClass({ get_wm_class: () => null })).toBeNull();
  });

  it("hasThrashyManagedTile true only for TILE with thrashy class", () => {
    const cat = new AppThrashCatalog();
    const tree = {
      getNodeByType: (t) => {
        if (t !== "WINDOW") return [];
        return [
          {
            mode: "FLOAT",
            nodeValue: { get_wm_class: () => "ghostty" },
          },
          {
            mode: "TILE",
            nodeValue: { get_wm_class: () => "org.gnome.Nautilus" },
          },
        ];
      },
    };
    expect(hasThrashyManagedTile({ tree }, cat)).toBe(false);

    tree.getNodeByType = () => [
      {
        mode: "TILE",
        nodeValue: { get_wm_class: () => "com.mitchellh.ghostty" },
      },
    ];
    expect(hasThrashyManagedTile({ tree }, cat)).toBe(true);
    expect(hasThrashyManagedTile({ _tree: tree }, cat)).toBe(true);
  });

  it("hasThrashyManagedTile false without catalog or tree", () => {
    expect(hasThrashyManagedTile({}, new AppThrashCatalog())).toBe(false);
    expect(hasThrashyManagedTile({ tree: {} }, null)).toBe(false);
  });
});

describe("computeLearnedMinQuietMs", () => {
  it("exports pad / cap in the locked range", () => {
    expect(SETTLE_LEARN_PAD).toBeGreaterThanOrEqual(1.15);
    expect(SETTLE_LEARN_PAD).toBeLessThanOrEqual(1.25);
    expect(SETTLE_LEARN_CAP_MS).toBe(2000);
    expect(SETTLE_EMA_ALPHA).toBeGreaterThan(0);
    expect(SETTLE_EMA_ALPHA).toBeLessThan(1);
  });

  it("pads sample and respects seed floor", () => {
    expect(
      computeLearnedMinQuietMs({
        seedFloor: 250,
        previousMinQuiet: 250,
        sampleMs: 100,
        pad: 1.2,
        cap: 2000,
      })
    ).toBe(250);
    expect(
      computeLearnedMinQuietMs({
        seedFloor: 250,
        previousMinQuiet: 250,
        sampleMs: 400,
        pad: 1.2,
        cap: 2000,
      })
    ).toBe(480);
  });

  it("raise-only vs previous when later samples are faster", () => {
    const raised = computeLearnedMinQuietMs({
      seedFloor: 0,
      previousMinQuiet: 0,
      sampleMs: 500,
      pad: 1.2,
      cap: 2000,
    });
    expect(raised).toBe(600);
    expect(
      computeLearnedMinQuietMs({
        seedFloor: 0,
        previousMinQuiet: raised,
        sampleMs: 100,
        pad: 1.2,
        cap: 2000,
      })
    ).toBe(600);
  });

  it("caps at SETTLE_LEARN_CAP_MS and never goes below 0", () => {
    expect(
      computeLearnedMinQuietMs({
        seedFloor: 0,
        previousMinQuiet: 0,
        sampleMs: 5000,
        pad: 1.2,
        cap: SETTLE_LEARN_CAP_MS,
      })
    ).toBe(SETTLE_LEARN_CAP_MS);
    expect(
      computeLearnedMinQuietMs({
        seedFloor: -10,
        previousMinQuiet: -5,
        sampleMs: -20,
      })
    ).toBe(0);
  });
});

describe("AppThrashCatalog recordSettleSample + snapshot", () => {
  /** @type {AppThrashCatalog} */
  let cat;

  beforeEach(() => {
    cat = new AppThrashCatalog();
  });

  it("records settle stats and raises minQuiet with pad", () => {
    const e = cat.recordSettleSample("org.example.Slow", {
      ms: 500,
      kind: "open",
      mismatches: 2,
    });
    expect(e.settleSampleCount).toBe(1);
    expect(e.settleMsLast).toBe(500);
    expect(e.settleMsMax).toBe(500);
    expect(e.settleMsEma).toBe(500);
    expect(e.mismatchBeforeSettle).toBe(2);
    expect(e.minQuietMs).toBe(Math.round(500 * SETTLE_LEARN_PAD * 1000) / 1000);
    expect(e.minQuietMs).toBe(500 * SETTLE_LEARN_PAD);
    expect(e.seedMinQuietMs).toBe(0);
  });

  it("EMA updates and minQuiet is raise-only", () => {
    cat.recordSettleSample("Foo", { ms: 400 });
    const e = cat.lookup("Foo");
    const quietAfterSlow = e.minQuietMs;
    expect(quietAfterSlow).toBe(400 * SETTLE_LEARN_PAD);

    cat.recordSettleSample("Foo", { ms: 100, mismatches: 1 });
    expect(e.settleSampleCount).toBe(2);
    expect(e.settleMsLast).toBe(100);
    expect(e.settleMsMax).toBe(400);
    const expectedEma = SETTLE_EMA_ALPHA * 100 + (1 - SETTLE_EMA_ALPHA) * 400;
    expect(e.settleMsEma).toBeCloseTo(expectedEma, 5);
    expect(e.minQuietMs).toBe(quietAfterSlow); // raise-only
    expect(e.mismatchBeforeSettle).toBe(1);
  });

  it("Ghostty seed stays floor; needsExtraVerify sticky; samples can raise", () => {
    const e = cat.lookup("ghostty");
    expect(e.seedMinQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
    expect(e.minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
    expect(e.needsExtraVerify).toBe(true);

    cat.recordSettleSample("com.mitchellh.ghostty", { ms: 50 });
    expect(e.minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
    expect(e.needsExtraVerify).toBe(true);
    expect(e.builtIn).toBe(true);

    cat.recordSettleSample("ghostty", { ms: 800 });
    expect(e.minQuietMs).toBe(800 * SETTLE_LEARN_PAD);
    expect(e.minQuietMs).toBeGreaterThan(GHOSTTY_MIN_QUIET_MS);
    expect(e.needsExtraVerify).toBe(true);
  });

  it("snapshot includes settle fields; does not persist to disk", () => {
    cat.recordSettleSample("org.gnome.Nautilus", { ms: 300, mismatches: 1 });
    const snap = cat.snapshot();
    const row = snap.find((r) => r.key === "org.gnome.nautilus");
    expect(row).toBeTruthy();
    expect(row.settleSampleCount).toBe(1);
    expect(row.settleMsLast).toBe(300);
    expect(row.settleMsMax).toBe(300);
    expect(row.settleMsEma).toBe(300);
    expect(row.mismatchBeforeSettle).toBe(1);
    expect(row.minQuietMs).toBe(300 * SETTLE_LEARN_PAD);
    expect(row.seedMinQuietMs).toBe(0);

    const ghost = snap.find((r) => r.key === "com.mitchellh.ghostty" || r.key === "ghostty");
    expect(ghost).toBeTruthy();
    expect(ghost.builtIn).toBe(true);
    expect(ghost.minQuietMs).toBe(GHOSTTY_MIN_QUIET_MS);
  });

  it("null class is a no-op for settle", () => {
    expect(cat.recordSettleSample(null, { ms: 100 })).toBeNull();
    expect(cat.recordSettleSample("", { ms: 100 })).toBeNull();
  });
});
