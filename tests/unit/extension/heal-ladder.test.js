import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import { TILE_DEST_UNDERSIZE_RETRIES } from "../../../lib/extension/geom-epsilon.js";
import {
  HEAL_ACTION,
  HEAL_LADDER_TOKEN,
  decideHealStep,
  destAgrees,
  pickNearestHealTargets,
  observeHealAfterSettle,
} from "../../../lib/extension/heal-ladder.js";
import {
  clearClassMinFloorForTests,
  classMinFloor,
  noteWindowMinFromClamp,
  noteWindowMinFromHealUndersize,
  readWindowMinSize,
  MIN_CLAMP_LEARN_DELAY_MS,
} from "../../../lib/extension/tree-layout.js";
import {
  resolveOpenMinPlacement,
  slotOverflowsMins,
} from "../../../lib/extension/open-min-place.js";
import { createHostBag } from "../../../lib/host/index.js";
import { ensureMark2Decisions, mark2Group } from "../../../lib/opsets/mark2.js";
import {
  children,
  parent as tomParent,
  serializeForest,
  setFocus,
} from "../../../lib/tom/index.js";
import { createTomApi } from "../../../lib/tom/api.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

const SLOT = { x: 42, y: 32, width: 1878, height: 1048 };
const MAP = { x: 0, y: 0, width: 700, height: 651 };
const tinyEnv = { FORGE_MIN_TILE_WIDTH: "1", FORGE_MIN_TILE_HEIGHT: "1" };

describe("heal-ladder (D115)", () => {
  beforeEach(() => {
    clearClassMinFloorForTests();
    vi.spyOn(Logger, "info").mockImplementation(() => {});
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    clearClassMinFloorForTests();
    vi.restoreAllMocks();
  });

  describe("H1 agree vs disagree", () => {
    it("agree on desired vs observed skips the ladder", () => {
      const desired = { x: 10, y: 20, width: 800, height: 600 };
      const observed = { x: 12, y: 20, width: 800, height: 600 };
      expect(destAgrees(desired, observed, 4)).toBe(true);
      const step = decideHealStep({
        desired,
        observed,
        epsilon: 4,
        tag: "agree",
        jitterCount: 0,
      });
      expect(step.action).toBe(HEAL_ACTION.AGREE);
      expect(step.action).not.toBe(HEAL_ACTION.JITTER);
    });

    it("far undersize vs desired enters rung 1 jitter", () => {
      expect(destAgrees(SLOT, MAP, 4)).toBe(false);
      const step = decideHealStep({
        desired: SLOT,
        observed: MAP,
        epsilon: 4,
        tag: "ambiguous",
        jitterCount: 0,
      });
      expect(step.action).toBe(HEAL_ACTION.JITTER);
      expect(step.dest).toMatchObject({ width: SLOT.width, height: SLOT.height });
    });
  });

  describe("H2 jitter same dest, no topology", () => {
    it("Ghostty-like self-resize then same dest agrees without TAB/FLOAT", () => {
      const desired = { x: 0, y: 0, width: 800, height: 600 };
      const snapped = { x: 0, y: 0, width: 760, height: 560 };
      const first = decideHealStep({
        desired,
        observed: snapped,
        epsilon: 4,
        tag: "ambiguous",
        jitterCount: 0,
      });
      expect(first.action).toBe(HEAL_ACTION.JITTER);
      expect(first.dest).toMatchObject({ width: 800, height: 600 });
      const after = decideHealStep({
        desired,
        observed: desired,
        epsilon: 4,
        tag: "agree",
        jitterCount: 1,
      });
      expect(after.action).toBe(HEAL_ACTION.AGREE);
      expect(after.action).not.toBe(HEAL_ACTION.ENTER_TAB);
      expect(after.action).not.toBe(HEAL_ACTION.CREATE_TAB);
      expect(after.action).not.toBe(HEAL_ACTION.FLOAT);
    });
  });

  describe("H3 learn min after jitter, not before", () => {
    it("does not learn on first undersize-vs-command", () => {
      const meta = { get_wm_class: () => "org.example.App" };
      noteWindowMinFromClamp(
        meta,
        { width: SLOT.width, height: SLOT.height, at: 1000, priorW: 700, priorH: 651 },
        MAP,
        4,
        1000 + MIN_CLAMP_LEARN_DELAY_MS + 1
      );
      expect(meta._forgeKnownMinW).toBeFalsy();
      expect(classMinFloor("org.example.App")).toEqual({ width: 0, height: 0 });
      const step = decideHealStep({
        desired: SLOT,
        observed: MAP,
        tag: "ambiguous",
        jitterCount: 0,
      });
      expect(step.action).toBe(HEAL_ACTION.JITTER);
      expect(step.action).not.toBe(HEAL_ACTION.LEARN_MIN);
    });

    it("after jitter exhausted records min; next dest honors it", () => {
      const meta = { get_wm_class: () => "org.example.App" };
      const exhausted = decideHealStep({
        desired: SLOT,
        observed: MAP,
        tag: "ambiguous",
        jitterCount: TILE_DEST_UNDERSIZE_RETRIES,
      });
      expect(exhausted.action).toBe(HEAL_ACTION.LEARN_MIN);
      expect(exhausted.min).toMatchObject({ width: 700, height: 651 });
      expect(noteWindowMinFromHealUndersize(meta, MAP, SLOT)).toBe(true);
      expect(meta._forgeKnownMinW).toBe(700);
      expect(meta._forgeKnownMinH).toBe(651);
      expect(classMinFloor("org.example.App")).toEqual({ width: 700, height: 651 });
      const mins = readWindowMinSize(meta, { env: tinyEnv });
      expect(mins).toEqual({ width: 700, height: 651 });
      expect(slotOverflowsMins({ width: 400, height: 300, x: 0, y: 0 }, mins)).toBe(true);
      expect(slotOverflowsMins({ width: 1878, height: 1048, x: 0, y: 0 }, mins)).toBe(false);
      const dest = resolveOpenMinPlacement({
        newMins: mins,
        lftUnit: { id: "lft" },
        slotRectFor: () => ({ x: 0, y: 0, width: 400, height: 300 }),
        unitMinsFor: () => ({ width: 0, height: 0 }),
        candidates: [],
      });
      expect(dest.kind).toBe("float");
    });
  });

  describe("H4 TAB enter / wrap same monitor", () => {
    it("enters existing TAB on that mon with slot ≥ min; D108 end; skips other head", () => {
      const { f, byLabel } = buildGiven("Mon1(H(A,TAB(B,C))) Mon2(TAB(D,E))");
      ensureMark2Decisions(f);
      const min = { width: 700, height: 651 };
      const picked = pickNearestHealTargets(f, byLabel.A.id, min);
      const tab = tomParent(f, byLabel.B);
      const other = tomParent(f, byLabel.D);
      expect(picked.nearestTab?.id).toBe(tab.id);
      expect(picked.nearestTab?.id).not.toBe(other.id);
      const step = decideHealStep({
        desired: SLOT,
        observed: MAP,
        tag: "ambiguous",
        jitterCount: TILE_DEST_UNDERSIZE_RETRIES,
        learnedMin: true,
        min,
        nearestTab: picked.nearestTab,
        nearestTile: picked.nearestTile,
      });
      expect(step.action).toBe(HEAL_ACTION.ENTER_TAB);
      expect(step.targetId).toBe(tab.id);
      setFocus(f, byLabel.A.id);
      const api = createTomApi();
      api.hydrateSeq(f);
      const r = mark2Group(f, api, "right", { onto: tab.id, place: "end" });
      expect(r.ok).toBe(true);
      expect(tab.childIds[tab.childIds.length - 1]).toBe(byLabel.A.id);
      expect(tab.childIds).toContain(byLabel.B.id);
      expect(other.childIds).not.toContain(byLabel.A.id);
    });

    it("wraps nearest legal TILE neighbor when no TAB slot fits", () => {
      const { f, byLabel } = buildGiven("Mon1(H(A,B))");
      ensureMark2Decisions(f);
      const min = { width: 700, height: 651 };
      const picked = pickNearestHealTargets(f, byLabel.A.id, min);
      expect(picked.nearestTab).toBeNull();
      expect(picked.nearestTile?.id).toBe(byLabel.B.id);
      const step = decideHealStep({
        desired: SLOT,
        observed: MAP,
        tag: "ambiguous",
        jitterCount: TILE_DEST_UNDERSIZE_RETRIES,
        learnedMin: true,
        min,
        nearestTab: picked.nearestTab,
        nearestTile: picked.nearestTile,
      });
      expect(step.action).toBe(HEAL_ACTION.CREATE_TAB);
      setFocus(f, byLabel.A.id);
      const api = createTomApi();
      api.hydrateSeq(f);
      const r = mark2Group(f, api, "right", { onto: byLabel.B.id, place: "end" });
      expect(r.ok).toBe(true);
      const ser = serializeForest(f, { children });
      expect(ser).toMatch(/TAB/);
      expect(ser).toContain("A");
      expect(ser).toContain("B");
    });
  });

  describe("H5 FLOAT is Agree", () => {
    it("no legal TILE/TAB slot → FLOAT", () => {
      const { f, byLabel } = buildGiven("Mon1(A)");
      const min = { width: 700, height: 651 };
      const picked = pickNearestHealTargets(f, byLabel.A.id, min);
      expect(picked.nearestTab).toBeNull();
      expect(picked.nearestTile).toBeNull();
      const step = decideHealStep({
        desired: SLOT,
        observed: MAP,
        tag: "ambiguous",
        jitterCount: TILE_DEST_UNDERSIZE_RETRIES,
        learnedMin: true,
        min,
        nearestTab: null,
        nearestTile: null,
      });
      expect(step.action).toBe(HEAL_ACTION.FLOAT);
    });

    it("observe FLOAT moves the window into FLOATS", () => {
      const { f, byLabel } = buildGiven("Mon1(A)");
      const meta = {
        get_id: () => "A",
        get_frame_rect: () => ({ ...MAP }),
        get_wm_class: () => "org.example.App",
      };
      const live = {
        kind: "WINDOW",
        nodeType: "WINDOW",
        isWindow: () => true,
        isFloat: () => false,
        mode: "TILE",
        nodeValue: meta,
      };
      const hostBag = createHostBag();
      hostBag.set(byLabel.A.id, { meta, floating: false, windowId: "A" });
      const wm = {
        forest: f,
        _liveForestSeeded: true,
        hostBag,
        liveById: new Map([[byLabel.A.id, live]]),
        findNodeWindow: () => live,
        isApplyEpochLive: () => false,
        addFloatOverride: vi.fn(),
        commitLayout: vi.fn(),
        lftMru: { remove: vi.fn() },
        move: vi.fn(),
        _wmSources: { set: vi.fn() },
      };
      meta._forgeTileDestRetry = TILE_DEST_UNDERSIZE_RETRIES;
      const step = observeHealAfterSettle(wm, meta, {
        desired: SLOT,
        sent: SLOT,
        observed: MAP,
        tag: "ambiguous",
        bagId: byLabel.A.id,
        wmClass: "org.example.App",
        learnedMin: true,
        min: { width: 700, height: 651 },
      });
      expect(step.action).toBe(HEAL_ACTION.FLOAT);
      expect(wm.addFloatOverride).toHaveBeenCalled();
      expect(wm.commitLayout).toHaveBeenCalledWith("heal-ladder-float");
      const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
      expect(texts.some((t) => t.includes(`${HEAL_LADDER_TOKEN} rung=float`))).toBe(true);
    });
  });
});
