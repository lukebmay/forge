import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "../../../lib/shared/logger.js";
import { resetMetrics } from "../../../lib/extension/metrics.js";
import { createHostBag } from "../../../lib/host/index.js";
import { runLiveForest } from "../../../lib/extension/forest-run.js";
import { children, serializeForest } from "../../../lib/tom/index.js";
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
