import { describe, it, expect } from "vitest";
import {
  createDeferredOpenStore,
  hideDeferredActor,
  isDeferredOpen,
  markDeferredOpen,
  shouldDeferHiddenOpen,
  shouldStickyMoveHomeMonitor,
  showDeferredActor,
  takeAllDeferredOpens,
  takeDeferredOpen,
} from "../../../lib/extension/layout-deferred-open.js";

describe("shouldDeferHiddenOpen", () => {
  it("true only when LayoutBatch active and will tile", () => {
    expect(shouldDeferHiddenOpen({ openLayoutBatchActive: true, willTile: true })).toBe(true);
    expect(shouldDeferHiddenOpen({ openLayoutBatchActive: true, willTile: false })).toBe(false);
    expect(shouldDeferHiddenOpen({ openLayoutBatchActive: false, willTile: true })).toBe(false);
    expect(shouldDeferHiddenOpen({})).toBe(false);
  });
});

describe("shouldStickyMoveHomeMonitor", () => {
  it("true for homeMonitor >= 0", () => {
    expect(shouldStickyMoveHomeMonitor(0)).toBe(true);
    expect(shouldStickyMoveHomeMonitor(1)).toBe(true);
  });

  it("false for missing / negative", () => {
    expect(shouldStickyMoveHomeMonitor(-1)).toBe(false);
    expect(shouldStickyMoveHomeMonitor(null)).toBe(false);
    expect(shouldStickyMoveHomeMonitor(undefined)).toBe(false);
    expect(shouldStickyMoveHomeMonitor("0")).toBe(false);
    expect(shouldStickyMoveHomeMonitor(NaN)).toBe(false);
  });
});

describe("deferred open store mark / release", () => {
  it("mark, is, take one", () => {
    const store = createDeferredOpenStore();
    const meta = { id: "a" };
    expect(isDeferredOpen(store, meta)).toBe(false);
    expect(markDeferredOpen(store, meta, { prevOpacity: 200 })).toBe(true);
    expect(isDeferredOpen(store, meta)).toBe(true);
    expect(takeDeferredOpen(store, meta)).toEqual({ prevOpacity: 200 });
    expect(isDeferredOpen(store, meta)).toBe(false);
    expect(takeDeferredOpen(store, meta)).toBeNull();
  });

  it("takeAll releases every marked window", () => {
    const store = createDeferredOpenStore();
    const a = { id: "a" };
    const b = { id: "b" };
    markDeferredOpen(store, a, { prevOpacity: 255 });
    markDeferredOpen(store, b, { prevOpacity: 128 });
    const all = takeAllDeferredOpens(store);
    expect(all).toHaveLength(2);
    expect(all.map((x) => x.meta.id).sort()).toEqual(["a", "b"]);
    expect(isDeferredOpen(store, a)).toBe(false);
    expect(isDeferredOpen(store, b)).toBe(false);
    expect(takeAllDeferredOpens(store)).toEqual([]);
  });

  it("mark rejects null store / meta", () => {
    expect(markDeferredOpen(null, {})).toBe(false);
    expect(markDeferredOpen(createDeferredOpenStore(), null)).toBe(false);
    expect(isDeferredOpen(null, {})).toBe(false);
  });
});

describe("hideDeferredActor / showDeferredActor", () => {
  function makeActor({ opacity = 255, withBorder = true } = {}) {
    const border = withBorder
      ? {
          hidden: false,
          hide() {
            this.hidden = true;
          },
          show() {
            this.hidden = false;
          },
        }
      : null;
    return { opacity, border };
  }

  it("hides actor opacity and border; restores on show", () => {
    const actor = makeActor({ opacity: 200 });
    const snap = hideDeferredActor(actor);
    expect(actor.opacity).toBe(0);
    expect(actor.border.hidden).toBe(true);
    expect(snap).toEqual({ prevOpacity: 200, hadBorder: true });

    showDeferredActor(actor, snap);
    expect(actor.opacity).toBe(200);
    expect(actor.border.hidden).toBe(false);
  });

  it("handles missing actor and borderless actor", () => {
    expect(hideDeferredActor(null)).toEqual({ prevOpacity: 255, hadBorder: false });
    showDeferredActor(null, { prevOpacity: 100 });

    const actor = makeActor({ withBorder: false });
    const snap = hideDeferredActor(actor);
    expect(snap.hadBorder).toBe(false);
    expect(actor.opacity).toBe(0);
    showDeferredActor(actor, snap);
    expect(actor.opacity).toBe(255);
  });

  it("default opacity when actor.opacity unset", () => {
    const actor = { border: null };
    const snap = hideDeferredActor(actor);
    expect(snap.prevOpacity).toBe(255);
    expect(actor.opacity).toBe(0);
  });
});

describe("CL8 no mid-batch percent carve (pure gate)", () => {
  it("shouldDefer implies no insert / no open commit path", () => {
    // Integration tests assert insertChildPercent / _scheduleOpenCommit are not
    // called; pure gate documents the decision predicate for trackWindow.
    const batch = shouldDeferHiddenOpen({ openLayoutBatchActive: true, willTile: true });
    expect(batch).toBe(true);
    const n1 = shouldDeferHiddenOpen({ openLayoutBatchActive: false, willTile: true });
    expect(n1).toBe(false);
  });
});
