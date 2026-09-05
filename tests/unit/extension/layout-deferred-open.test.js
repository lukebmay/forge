import { describe, it, expect } from "vitest";
import {
  createDeferredOpenStore,
  hideDeferredActor,
  isDeferredOpen,
  markDeferredOpen,
  needsDeferredHideReapply,
  rehideDeferredIfNeeded,
  shouldDeferHiddenOpen,
  shouldMapTimeStickyMove,
  shouldShowDeferredAfterDest,
  shouldStickyMoveHomeMonitor,
  showDeferredActor,
  takeAllDeferredOpens,
  takeDeferredOpen,
} from "../../../lib/extension/layout-deferred-open.js";

describe("shouldDeferHiddenOpen", () => {
  it("true for will-TILE maps including ordinary Launch", () => {
    expect(shouldDeferHiddenOpen({ willTile: true })).toBe(true);
    expect(shouldDeferHiddenOpen({ openLayoutBatchActive: false, willTile: true })).toBe(true);
    expect(shouldDeferHiddenOpen({ openLayoutBatchActive: true, willTile: true })).toBe(true);
    expect(shouldDeferHiddenOpen({ willTile: false })).toBe(false);
    expect(shouldDeferHiddenOpen({ willTile: true, openMinFloat: true })).toBe(false);
    expect(shouldDeferHiddenOpen({})).toBe(false);
  });
});

describe("shouldShowDeferredAfterDest", () => {
  it("shows after dest; LayoutBatch dest-miss stays hidden", () => {
    expect(shouldShowDeferredAfterDest({ destCommanded: true, openLayoutBatchActive: true })).toBe(
      true
    );
    expect(shouldShowDeferredAfterDest({ destCommanded: true, openLayoutBatchActive: false })).toBe(
      true
    );
    expect(
      shouldShowDeferredAfterDest({ destCommanded: false, openLayoutBatchActive: false })
    ).toBe(true);
    expect(shouldShowDeferredAfterDest({ destCommanded: false, openLayoutBatchActive: true })).toBe(
      false
    );
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

describe("shouldMapTimeStickyMove", () => {
  it("dock still map-time moves", () => {
    expect(shouldMapTimeStickyMove({ isDock: true, homeMonitor: 1 }, false)).toBe(true);
  });

  it("empty-head free-open is sticky-grace only (R036)", () => {
    expect(
      shouldMapTimeStickyMove({ isDock: false, isEmptyHead: true, homeMonitor: 1 }, false)
    ).toBe(false);
  });

  it("hide-place-show is not map-time sticky (Forest dest is place)", () => {
    expect(shouldMapTimeStickyMove({ isDock: false, homeMonitor: 1 }, true)).toBe(false);
    expect(shouldMapTimeStickyMove({ isDock: false, homeMonitor: -1 }, true)).toBe(false);
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
    expect(snap).toEqual({ prevOpacity: 200, hadBorder: true, pendingHide: false });

    showDeferredActor(actor, snap);
    expect(actor.opacity).toBe(200);
    expect(actor.border.hidden).toBe(false);
  });

  it("hide-place-show: hide before dest write, show after; not minimize", () => {
    const actor = makeActor({ opacity: 255 });
    actor.minimize = () => {
      actor.minimized = true;
    };
    const order = [];
    const snap = hideDeferredActor(actor);
    order.push("hide");
    expect(actor.opacity).toBe(0);
    expect(actor.minimized).toBeUndefined();
    order.push("dest");
    showDeferredActor(actor, snap);
    order.push("show");
    expect(actor.opacity).toBe(255);
    expect(order).toEqual(["hide", "dest", "show"]);
    expect(actor.minimized).toBeUndefined();
  });

  it("handles missing actor and borderless actor", () => {
    expect(hideDeferredActor(null)).toEqual({
      prevOpacity: 255,
      hadBorder: false,
      pendingHide: true,
    });
    showDeferredActor(null, { prevOpacity: 100 });

    const actor = makeActor({ withBorder: false });
    const snap = hideDeferredActor(actor);
    expect(snap.hadBorder).toBe(false);
    expect(snap.pendingHide).toBe(false);
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

describe("needsDeferredHideReapply / rehideDeferredIfNeeded", () => {
  function makeActor({ opacity = 255 } = {}) {
    return {
      opacity,
      border: {
        hidden: false,
        hide() {
          this.hidden = true;
        },
        show() {
          this.hidden = false;
        },
      },
    };
  }

  it("re-hides when actor was null at mark (pendingHide)", () => {
    const store = createDeferredOpenStore();
    const meta = { id: "late" };
    markDeferredOpen(store, meta, hideDeferredActor(null));
    expect(needsDeferredHideReapply(null, true, store.states.get(meta))).toBe(true);

    const actor = makeActor({ opacity: 255 });
    expect(rehideDeferredIfNeeded(store, meta, actor)).toBe(true);
    expect(actor.opacity).toBe(0);
    expect(store.states.get(meta).pendingHide).toBe(false);
    expect(store.states.get(meta).prevOpacity).toBe(255);
  });

  it("re-hides when client restored opacity while still deferred", () => {
    const store = createDeferredOpenStore();
    const meta = { id: "vis" };
    const actor = makeActor({ opacity: 200 });
    markDeferredOpen(store, meta, hideDeferredActor(actor));
    expect(actor.opacity).toBe(0);
    actor.opacity = 255;
    expect(needsDeferredHideReapply(actor, true, store.states.get(meta))).toBe(true);
    expect(rehideDeferredIfNeeded(store, meta, actor)).toBe(true);
    expect(actor.opacity).toBe(0);
    expect(store.states.get(meta).prevOpacity).toBe(200);
  });

  it("no-op when not deferred or already hidden", () => {
    const store = createDeferredOpenStore();
    const meta = { id: "ok" };
    const actor = makeActor({ opacity: 255 });
    expect(rehideDeferredIfNeeded(store, meta, actor)).toBe(false);
    markDeferredOpen(store, meta, hideDeferredActor(actor));
    expect(rehideDeferredIfNeeded(store, meta, actor)).toBe(false);
    expect(needsDeferredHideReapply(actor, false)).toBe(false);
  });
});

describe("CL8 no mid-batch percent carve (pure gate)", () => {
  it("will-TILE hide is independent of LayoutBatch", () => {
    const batch = shouldDeferHiddenOpen({ openLayoutBatchActive: true, willTile: true });
    expect(batch).toBe(true);
    const n1 = shouldDeferHiddenOpen({ openLayoutBatchActive: false, willTile: true });
    expect(n1).toBe(true);
  });
});
