import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import { resetMetrics } from "../../../lib/extension/metrics.js";
import { createHostBag } from "../../../lib/host/index.js";
import { runLiveForest } from "../../../lib/extension/forest-run.js";
import { ensureMark2Decisions, mark2Group } from "../../../lib/opsets/mark2.js";
import { ancestorMonitor, children, serializeForest } from "../../../lib/tom/index.js";
import { buildGiven } from "../../../lib/tom/shorthand.js";

describe("runLiveForest AGREE gate (D093 R4)", () => {
  beforeEach(() => {
    resetMetrics();
    vi.spyOn(Logger, "info").mockImplementation(() => {});
    vi.spyOn(Logger, "warn").mockImplementation(() => {});
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMetrics();
  });

  it("refuses mutate when still DRIFT after gate resync", () => {
    const { wm, focus, byLabel, f } = seededFocusWm();
    const before = serializeForest(f, { children });
    const mutate = vi.fn(() => ({ ok: true }));
    const ok = runLiveForest(wm, focus, mutate, "move-window", {
      facts: {
        windows: {
          [byLabel.A.id]: { exists: true },
          ghost: { exists: true },
        },
      },
    });
    expect(ok).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
    expect(serializeForest(f, { children })).toBe(before);
    expect(wm.commitLayout).not.toHaveBeenCalled();
    const texts = Logger.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts).toContain("metric drift");
  });

  it("mutates when Forest AGREEs after gate resync", () => {
    const { wm, focus, f } = seededFocusWm();
    const mutate = vi.fn(() => ({ ok: true }));
    const ok = runLiveForest(wm, focus, mutate, "move-window", {
      getMins: () => ({ width: 1, height: 1 }),
    });
    expect(ok).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(wm.commitLayout).toHaveBeenCalled();
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
  });

  it("settles empty CON after mutate so it cannot occupy a slot", () => {
    const { wm, focus, f, byLabel } = seededFocusWm();
    const traceSpy = vi.spyOn(Logger, "trace").mockImplementation(() => {});
    const ok = runLiveForest(
      wm,
      focus,
      (draft, api) => {
        const win = draft.nodes[byLabel.A.id];
        const mon = ancestorMonitor(draft, win);
        const r = api.inventConUnder(draft, mon, "HSPLIT");
        expect(r?.ok).toBe(true);
        return { ok: true, op: "test-empty-con" };
      },
      "move-window",
      { getMins: () => ({ width: 1, height: 1 }) }
    );
    expect(ok).toBe(true);
    expect(serializeForest(f, { children })).toBe("Mon1(A)");
    const cons = Object.values(f.nodes).filter((n) => n.kind === "CON");
    expect(cons).toHaveLength(0);
    const texts = traceSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(texts.some((t) => t.includes("settle mark2-post"))).toBe(true);
  });

  it("group two tiles presents full-slot Meta dest before idle commitLayout", () => {
    const { f, byLabel } = buildGiven("Mon1(H(A,B))");
    ensureMark2Decisions(f);
    const metaA = { id: "A", get_id: () => "A" };
    const metaB = { id: "B", get_id: () => "B" };
    const liveA = { nodeValue: metaA, isFloat: () => false };
    const liveB = { nodeValue: metaB, isFloat: () => false };
    const hostBag = createHostBag();
    hostBag.set(byLabel.A.id, { meta: metaA, floating: false, windowId: "A" });
    hostBag.set(byLabel.B.id, { meta: metaB, floating: false, windowId: "B" });
    const dests = [];
    const wm = {
      tree: { getNodeByType: () => [], settings: { get_uint: () => 0 } },
      forest: f,
      _liveForestSeeded: true,
      hostBag,
      liveById: new Map([
        [byLabel.A.id, liveA],
        [byLabel.B.id, liveB],
      ]),
      unfreezeRender: vi.fn(),
      commitLayout: vi.fn(),
      settleTabFocus: vi.fn(),
      movePointerWith: vi.fn(),
      calculateGaps: () => 0,
      move: (meta, dest) => dests.push({ id: meta.id, dest }),
    };
    const ok = runLiveForest(
      wm,
      liveA,
      (draft, api) => mark2Group(draft, api, "right", { onto: byLabel.B.id }),
      "dnd-drop",
      {
        getMins: () => ({ width: 1, height: 1 }),
        facts: {
          windows: {
            [byLabel.A.id]: { exists: true },
            [byLabel.B.id]: { exists: true },
          },
        },
      }
    );
    expect(ok).toBe(true);
    expect(dests.length).toBeGreaterThan(0);
    expect(dests.every((d) => d.dest && d.dest.width > 1800)).toBe(true);
  });
});

function seededFocusWm() {
  const { f, byLabel } = buildGiven("Mon1(A)");
  const metaA = { id: "A", get_id: () => "A" };
  const focus = {
    nodeValue: metaA,
    isFloat: () => false,
  };
  const hostBag = createHostBag();
  hostBag.set(byLabel.A.id, { meta: metaA, floating: false, windowId: "A" });
  const wm = {
    tree: { getNodeByType: () => [] },
    forest: f,
    _liveForestSeeded: true,
    hostBag,
    liveById: new Map(),
    unfreezeRender: vi.fn(),
    commitLayout: vi.fn(),
    settleTabFocus: vi.fn(),
    movePointerWith: vi.fn(),
  };
  return { wm, focus, byLabel, f };
}
