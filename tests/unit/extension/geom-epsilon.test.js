import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import {
  edgeDeltas,
  classifyEpsilonSample,
  buildGeomEpsilonFields,
  decideGeomWrite,
  decideNearMissForgiveness,
  decideUndersizeDestRetry,
  TILE_DEST_UNDERSIZE_RETRIES,
  createClassEpsilonStore,
  defaultNearBand,
  faultInjectObserved,
  getEffectiveClassEpsilon,
  adjustCommandForNearMiss,
  commandFingerprint,
  logGeomEpsilonSample,
  GEOM_EPSILON_TOKEN,
  GEOM_EPSILON0_PX,
  NEAR_MISS_FAILS_BEFORE_BUMP,
} from "../../../lib/extension/geom-epsilon.js";

describe("geom-epsilon", () => {
  it("edgeDeltas computes per-edge and dMax", () => {
    const d = edgeDeltas(
      { x: 10, y: 20, width: 100, height: 200 },
      { x: 12, y: 18, width: 104, height: 200 }
    );
    expect(d).toEqual({ dx: 2, dy: -2, dw: 4, dh: 0, dMax: 4 });
  });

  it("edgeDeltas returns null on bad rects", () => {
    expect(edgeDeltas(null, { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it("classify agree / near / far", () => {
    expect(classifyEpsilonSample({ dMax: 3, epsilon: 4 })).toBe("agree");
    expect(classifyEpsilonSample({ dMax: 8, epsilon: 4, nearBand: 12 })).toBe("near");
    expect(
      classifyEpsilonSample({
        dMax: 40,
        epsilon: 4,
        nearBand: 12,
        sentSize: { width: 100, height: 100 },
        dw: 2,
        dh: 2,
      })
    ).toBe("far");
  });

  it("classify min-known when sent below known mins", () => {
    expect(
      classifyEpsilonSample({
        dMax: 50,
        epsilon: 4,
        knownMin: { width: 400, height: 200 },
        sentSize: { width: 300, height: 200 },
      })
    ).toBe("min-known");
  });

  it("classify ambiguous on large size miss without mins", () => {
    expect(
      classifyEpsilonSample({
        dMax: 80,
        epsilon: 4,
        nearBand: 12,
        sentSize: { width: 200, height: 200 },
        dw: 80,
        dh: 0,
      })
    ).toBe("ambiguous");
  });

  describe("undersize dest retry (R062)", () => {
    const sent = { x: 42, y: 32, width: 1878, height: 1048 };
    const observed = { x: 0, y: 0, width: 700, height: 651 };

    it("retries the same slot dest on far/ambiguous undersize", () => {
      const r = decideUndersizeDestRetry({
        tag: "ambiguous",
        sent,
        observed,
        retryCount: 0,
      });
      expect(r.retry).toBe(true);
      expect(r.dest).toEqual(sent);
      expect(decideUndersizeDestRetry({ tag: "far", sent, observed, retryCount: 0 }).retry).toBe(
        true
      );
    });

    it("does not retry near/agree or after the cap", () => {
      expect(decideUndersizeDestRetry({ tag: "near", sent, observed, retryCount: 0 }).retry).toBe(
        false
      );
      expect(decideUndersizeDestRetry({ tag: "agree", sent, observed, retryCount: 0 }).retry).toBe(
        false
      );
      expect(
        decideUndersizeDestRetry({
          tag: "ambiguous",
          sent,
          observed,
          retryCount: TILE_DEST_UNDERSIZE_RETRIES,
        }).retry
      ).toBe(false);
    });
  });

  it("buildGeomEpsilonFields includes greppable tag and edges", () => {
    const f = buildGeomEpsilonFields({
      phase: "post-write-settle",
      sent: { x: 0, y: 0, width: 100, height: 100 },
      observed: { x: 0, y: 0, width: 103, height: 100 },
      windowId: 9,
      wmClass: "Ghostty",
      wrote: true,
      epsilon: 4,
    });
    expect(f.phase).toBe("post-write-settle");
    expect(f.tag).toBe("agree");
    expect(f.dMax).toBe(3);
    expect(f.wmClass).toBe("Ghostty");
    expect(f.wrote).toBe(true);
  });

  describe("decideGeomWrite", () => {
    const desired = { x: 10, y: 20, width: 100, height: 80 };

    it("skips when desired unchanged and observed within ε", () => {
      const d = decideGeomWrite({
        desired,
        bagDesired: { ...desired },
        observed: { x: 12, y: 20, width: 100, height: 80 },
        epsilon: 4,
      });
      expect(d).toEqual({ write: false, desiredChanged: false, reason: "skip-stable" });
    });

    it("skips when desired changed but observed already agrees", () => {
      const d = decideGeomWrite({
        desired,
        bagDesired: { x: 0, y: 0, width: 50, height: 50 },
        observed: { ...desired },
        epsilon: 4,
      });
      expect(d.write).toBe(false);
      expect(d.desiredChanged).toBe(true);
      expect(d.reason).toBe("skip-agree");
    });

    it("writes when desired unchanged but observed disagrees", () => {
      const d = decideGeomWrite({
        desired,
        bagDesired: { ...desired },
        observed: { x: 40, y: 20, width: 100, height: 80 },
        epsilon: 4,
      });
      expect(d).toEqual({
        write: true,
        desiredChanged: false,
        reason: "observed-disagree",
      });
    });

    it("writes on force / maximized / mon mismatch", () => {
      expect(
        decideGeomWrite({
          desired,
          bagDesired: desired,
          observed: desired,
          force: true,
        }).reason
      ).toBe("force");
      expect(
        decideGeomWrite({
          desired,
          bagDesired: desired,
          observed: desired,
          maximized: true,
        }).reason
      ).toBe("maximized");
      expect(
        decideGeomWrite({
          desired,
          bagDesired: desired,
          observed: desired,
          monMismatch: true,
        }).reason
      ).toBe("mon-mismatch");
    });

    it("treats missing bag desired as changed", () => {
      const d = decideGeomWrite({
        desired,
        observed: { x: 80, y: 20, width: 100, height: 80 },
        epsilon: 4,
      });
      expect(d.write).toBe(true);
      expect(d.desiredChanged).toBe(true);
      expect(d.reason).toBe("desired-changed");
    });
  });

  describe("logGeomEpsilonSample", () => {
    let spy;
    beforeEach(() => {
      spy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("emits geom-epsilon token", () => {
      logGeomEpsilonSample(
        buildGeomEpsilonFields({
          phase: "post-write-immediate",
          sent: { x: 1, y: 2, width: 3, height: 4 },
          observed: { x: 1, y: 2, width: 3, height: 4 },
          wrote: true,
        })
      );
      expect(spy).toHaveBeenCalled();
      const title = String(spy.mock.calls[0][0] ?? "");
      expect(title.includes(GEOM_EPSILON_TOKEN)).toBe(true);
    });
  });

  describe("S6 near-band + class ε store", () => {
    it("locks near-band as max(2ε, ε+8) — ε₀=4 → 12", () => {
      expect(GEOM_EPSILON0_PX).toBe(4);
      expect(defaultNearBand(4)).toBe(12);
      expect(defaultNearBand(10)).toBe(20);
    });

    it("adjustCommandForNearMiss compensates delta", () => {
      const adj = adjustCommandForNearMiss(
        { x: 10, y: 20, width: 100, height: 80 },
        { x: 16, y: 20, width: 100, height: 80 }
      );
      expect(adj).toEqual({ x: 4, y: 20, width: 100, height: 80 });
      expect(commandFingerprint(adj)).toBe("4,20,100,80");
    });

    it("faultInjectObserved lies near-miss when enabled", () => {
      const sent = { x: 0, y: 0, width: 100, height: 100 };
      const real = { ...sent };
      expect(faultInjectObserved(sent, real, { enabled: false })).toEqual(real);
      const lied = faultInjectObserved(sent, real, { enabled: true, epsilon: 4 });
      const d = edgeDeltas(sent, lied);
      expect(d.dMax).toBeGreaterThan(4);
      expect(d.dMax).toBeLessThanOrEqual(12);
      expect(classifyEpsilonSample({ dMax: d.dMax, epsilon: 4 })).toBe("near");
    });

    it("bumps class ε after N near-miss failures; no bump on far/min/ambiguous", () => {
      const store = createClassEpsilonStore({ failsBeforeBump: 3, now: () => 1 });
      const sent = { x: 0, y: 0, width: 100, height: 100 };
      const nearObs = { x: 8, y: 0, width: 100, height: 100 };

      for (let i = 0; i < NEAR_MISS_FAILS_BEFORE_BUMP - 1; i++) {
        const r = decideNearMissForgiveness({
          store,
          wmClass: "Ghostty",
          windowId: 1,
          tag: "near",
          dMax: 8,
          sent,
          observed: nearObs,
        });
        expect(r.action).toBe("retry");
        expect(r.bumped).toBe(false);
      }
      const bumped = decideNearMissForgiveness({
        store,
        wmClass: "Ghostty",
        windowId: 1,
        tag: "near",
        dMax: 8,
        sent,
        observed: nearObs,
      });
      expect(bumped.action).toBe("bumped");
      expect(bumped.eps).toBeGreaterThan(4);
      expect(store.getEpsilon("Ghostty")).toBe(bumped.eps);

      const farStore = createClassEpsilonStore();
      expect(
        decideNearMissForgiveness({
          store: farStore,
          key: "Chrome",
          tag: "far",
          dMax: 40,
        }).action
      ).toBe("far-no-bump");
      expect(farStore.getEpsilon("Chrome")).toBe(4);

      expect(
        decideNearMissForgiveness({
          store: farStore,
          key: "Chrome",
          tag: "min-known",
          dMax: 50,
        }).action
      ).toBe("mins-path");
      expect(farStore.getEpsilon("Chrome")).toBe(4);

      expect(
        decideNearMissForgiveness({
          store: farStore,
          key: "Chrome",
          tag: "ambiguous",
          dMax: 80,
        }).action
      ).toBe("no-bump");
      expect(farStore.getEpsilon("Chrome")).toBe(4);
    });

    it("fault-inject path drives bump without Mutter", () => {
      const store = createClassEpsilonStore({ failsBeforeBump: 3, now: () => 42 });
      const sent = { x: 10, y: 20, width: 200, height: 150 };
      const real = { ...sent };
      for (let i = 0; i < 3; i++) {
        const observed = faultInjectObserved(sent, real, {
          enabled: true,
          epsilon: getEffectiveClassEpsilon(store, "InjectApp", 9),
        });
        const d = edgeDeltas(sent, observed);
        const tag = classifyEpsilonSample({
          dMax: d.dMax,
          epsilon: getEffectiveClassEpsilon(store, "InjectApp", 9),
          sentSize: sent,
          dw: d.dw,
          dh: d.dh,
        });
        expect(tag).toBe("near");
        decideNearMissForgiveness({
          store,
          wmClass: "InjectApp",
          windowId: 9,
          tag,
          dMax: d.dMax,
          sent,
          observed,
        });
      }
      expect(store.getEpsilon("InjectApp")).toBeGreaterThan(4);
      const snap = store.snapshot().find((s) => s.wmClass === "InjectApp");
      expect(snap.bumps.length).toBe(1);
      expect(snap.bumps[0].reason).toMatch(/near-miss/);
    });

    it("stops identical useless near-miss loop (same command+adjust)", () => {
      const store = createClassEpsilonStore({ failsBeforeBump: 2, now: () => 1 });
      const sent = { x: 0, y: 0, width: 50, height: 50 };
      const observed = { x: 10, y: 0, width: 50, height: 50 };
      decideNearMissForgiveness({
        store,
        key: "App",
        tag: "near",
        dMax: 10,
        sent,
        observed,
      });
      const bump = decideNearMissForgiveness({
        store,
        key: "App",
        tag: "near",
        dMax: 10,
        sent,
        observed,
      });
      expect(bump.action).toBe("bumped");

      // Re-arm nearFails past threshold with the same fingerprints → skip.
      const e = store.ensure("App");
      e.nearFails = store.failsBeforeBump;
      e.lastCommandKey = commandFingerprint(sent);
      e.lastAdjustedKey = commandFingerprint(adjustCommandForNearMiss(sent, observed));
      const stop = store.noteNearMiss("App", {
        dMax: 10,
        commandKey: e.lastCommandKey,
        adjustedKey: e.lastAdjustedKey,
        reason: "repeat",
      });
      expect(stop.skippedIdentical).toBe(true);
      expect(stop.bumped).toBe(false);
      expect(stop.shouldRetry).toBe(false);

      // Ceiling: eps already at nearBand for current eps → no further bump.
      e.eps = defaultNearBand(GEOM_EPSILON0_PX); // 12
      e.nearFails = store.failsBeforeBump;
      e.lastCommandKey = null;
      e.lastAdjustedKey = null;
      const ceil = store.noteNearMiss("App", {
        dMax: 8,
        commandKey: "a",
        adjustedKey: "b",
        reason: "ceil",
      });
      // target = min(12, max(13, 10)) = 12 → atCeiling
      expect(ceil.atCeiling).toBe(true);
      expect(ceil.bumped).toBe(false);
    });
  });
});
