// @ts-check
/**
 * TOM↔reality reconcile + FLOAT fail-safe (D092 / cutover C5).
 * Adapter-side; Meta stays out of the kernel.
 */

import { paneRect } from "../presenter/index.js";
import { mark2CleanupUnder } from "../rulesets/mark2.js";
import {
  SIZE_MIN,
  ancestorMonitor,
  children,
  containingSplit,
  equalizeChildren,
  floatsOf,
  moveWindowToFloats,
  redistributeShare,
  tilesParentBeforeFloat,
  windowIsFloating,
} from "../tom/index.js";
import { slotOverflowsMins } from "./open-min-place.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */

/** Adjust cycles before FLOAT fail-safe (C5.2). */
export const RECONCILE_MAX_RETRIES = 2;

/** Named adjust / terminal steps (not Mark 2 SurfaceOps). */
export const ADJUST = Object.freeze({
  SHARE: "share-redistribute",
  TAB: "tab-join",
  FLOAT: "float-fail-safe",
});

/**
 * C5.1 — proposed slot cannot honor host mins.
 * @param {{ width?: number, height?: number }|null|undefined} slotRect
 * @param {{ width?: number, height?: number }|null|undefined} mins
 * @param {number} [eps=4]
 */
export function placementRejected(slotRect, mins, eps = 4) {
  return slotOverflowsMins(slotRect, mins, eps);
}

/**
 * Slot from Forest presenter (`{width,height}` for open-min helpers).
 * @param {Forest} f
 * @param {string|Node} windowOrId
 * @returns {{ width: number, height: number, x?: number, y?: number }|null}
 */
export function forestSlotRect(f, windowOrId) {
  const node = typeof windowOrId === "string" ? f?.nodes?.[windowOrId] : windowOrId;
  if (!node || !f) return null;
  const r = paneRect(f, node);
  if (!r) return null;
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

/**
 * Move WINDOW under FLOATS + settle prior TILES parent (C5.3 membership).
 * Idempotent when already floating.
 * @param {Forest} f
 * @param {string|Node} windowOrId
 * @returns {{ ok: boolean, noop?: boolean, id?: string, reason?: string }}
 */
export function floatFailSafeMembership(f, windowOrId) {
  const node = typeof windowOrId === "string" ? f?.nodes?.[windowOrId] : windowOrId;
  if (!node || node.kind !== "WINDOW") {
    return { ok: false, reason: "not a WINDOW" };
  }
  if (windowIsFloating(f, node)) {
    return { ok: true, noop: true, id: node.id };
  }
  const prior = tilesParentBeforeFloat(f, node);
  const r = moveWindowToFloats(f, node);
  if (!r?.ok) return { ok: false, reason: r?.reason || "moveWindowToFloats", id: node.id };
  const mon = prior ? ancestorMonitor(f, prior) : null;
  if (mon) mark2CleanupUnder(f, mon);
  else if (prior && (prior.kind === "MONITOR" || prior.kind === "CON")) {
    mark2CleanupUnder(f, prior);
  }
  return { ok: true, id: node.id, noop: !!r.noop };
}

/**
 * Snapshot / restore H/V sibling size fields.
 * @param {Node[]} kids
 */
function snapShares(kids) {
  return kids.map((k) => ({
    id: k.id,
    percent: k.percent,
    userSized: k.userSized,
  }));
}

/**
 * @param {Forest} f
 * @param {{ id: string, percent?: number, userSized?: boolean }[]} snap
 */
function restoreShares(f, snap) {
  for (const s of snap) {
    const k = f.nodes[s.id];
    if (!k) continue;
    k.percent = s.percent;
    k.userSized = s.userSized;
  }
}

/**
 * C5.2 — try equalize / max in-axis share so pane meets mins.
 * @param {Forest} f
 * @param {string} windowId
 * @param {{ width?: number, height?: number }|null|undefined} mins
 * @param {number} [eps=4]
 * @returns {string|null} ADJUST.SHARE or null
 */
export function tryAdjustShareForMins(f, windowId, mins, eps = 4) {
  const node = f?.nodes?.[windowId];
  if (!node || node.kind !== "WINDOW") return null;
  if (windowIsFloating(f, node)) return null;

  const before = forestSlotRect(f, node);
  if (!before || !placementRejected(before, mins, eps)) return null;

  const split = containingSplit(f, node);
  if (!split?.parent) return null;
  const parentNode = split.parent;
  const kids = children(f, parentNode);
  if (kids.length < 2) return null;

  const snap = snapShares(kids);

  // 1) Equal share — often enough when one sibling was percent-starved.
  equalizeChildren(f, parentNode, { force: true });
  let after = forestSlotRect(f, node);
  if (after && !placementRejected(after, mins, eps)) return ADJUST.SHARE;

  // 2) Max legal percent on target; leftovers as share.
  restoreShares(f, snap);
  const n = kids.length;
  const maxShare = Math.max(SIZE_MIN, 1 - (n - 1) * SIZE_MIN);
  for (const k of kids) {
    if (k.id === split.target.id) {
      k.percent = maxShare;
      k.userSized = true;
    } else {
      k.userSized = false;
    }
  }
  const red = redistributeShare(f, parentNode);
  if (!red?.ok) {
    restoreShares(f, snap);
    return null;
  }
  after = forestSlotRect(f, node);
  if (after && !placementRejected(after, mins, eps)) return ADJUST.SHARE;

  restoreShares(f, snap);
  return null;
}

/**
 * Pure reconcile loop (C5.1–C5.3). Always terminates (FLOAT fail-safe).
 *
 * @param {{
 *   forest: Forest,
 *   windowId: string,
 *   getMins: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   getSlotRect?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   tryAdjust?: (attempt: number, ctx: object) => (string|null|undefined),
 *   floatFailSafe?: (id: string) => void,
 *   maxRetries?: number,
 *   eps?: number,
 * }} opts
 * @returns {{
 *   status: "ok"|"adjusted"|"floated"|"already-float"|"missing",
 *   attempts: number,
 *   adjust?: string|null,
 * }}
 */
export function reconcileWindowPlacement(opts) {
  const f = opts?.forest;
  const windowId = opts?.windowId;
  if (!f || !windowId || !f.nodes?.[windowId]) {
    return { status: "missing", attempts: 0 };
  }
  const node = f.nodes[windowId];
  if (windowIsFloating(f, node)) {
    return { status: "already-float", attempts: 0 };
  }

  const eps = opts.eps ?? 4;
  const maxRetries = Number.isFinite(opts.maxRetries)
    ? Math.max(0, /** @type {number} */ (opts.maxRetries))
    : RECONCILE_MAX_RETRIES;
  const getSlot =
    typeof opts.getSlotRect === "function" ? opts.getSlotRect : (id) => forestSlotRect(f, id);
  const getMins = opts.getMins;
  const tryAdjust =
    typeof opts.tryAdjust === "function"
      ? opts.tryAdjust
      : (_attempt, ctx) => tryAdjustShareForMins(f, ctx.windowId, ctx.mins, eps);
  const floatFn =
    typeof opts.floatFailSafe === "function"
      ? opts.floatFailSafe
      : (id) => {
          floatFailSafeMembership(f, id);
        };

  /** @type {string|null|undefined} */
  let lastAdjust = null;
  let attempts = 0;

  for (;;) {
    const slot = getSlot(windowId);
    const mins = getMins(windowId);
    if (!placementRejected(slot, mins, eps)) {
      return {
        status: attempts === 0 ? "ok" : "adjusted",
        attempts,
        adjust: lastAdjust ?? undefined,
      };
    }
    if (attempts >= maxRetries) break;

    const kind = tryAdjust(attempts, {
      forest: f,
      windowId,
      slot,
      mins,
      attempts,
    });
    if (!kind) break;
    lastAdjust = kind;
    attempts += 1;

    // Idempotent: adjust floated the window itself.
    if (windowIsFloating(f, f.nodes[windowId])) {
      return { status: "floated", attempts, adjust: ADJUST.FLOAT };
    }
  }

  floatFn(windowId);
  return { status: "floated", attempts, adjust: ADJUST.FLOAT };
}

/**
 * Reconcile every TILES WINDOW (skip FLOATS). Mins adjust inside RESYNC.
 * @param {Forest} f
 * @param {(id: string) => ({ width?: number, height?: number }|null|undefined)} getMins
 * @param {{
 *   getSlotRect?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   tryAdjust?: (attempt: number, ctx: object) => (string|null|undefined),
 *   floatFailSafe?: (id: string) => void,
 *   maxRetries?: number,
 *   eps?: number,
 *   windowIds?: string[],
 * }} [opts]
 * @returns {{ results: Record<string, object>, floated: string[] }}
 */
export function reconcileForestWindows(f, getMins, opts = {}) {
  /** @type {Record<string, object>} */
  const results = {};
  /** @type {string[]} */
  const floated = [];
  if (!f || typeof getMins !== "function") return { results, floated };

  const bag = floatsOf(f);
  const ids =
    Array.isArray(opts.windowIds) && opts.windowIds.length
      ? opts.windowIds
      : Object.keys(f.nodes || {}).filter((id) => {
          const n = f.nodes[id];
          return n && n.kind === "WINDOW" && (!bag || n.parentId !== bag.id);
        });

  for (const id of ids) {
    const r = reconcileWindowPlacement({
      forest: f,
      windowId: id,
      getMins,
      getSlotRect: opts.getSlotRect,
      tryAdjust: opts.tryAdjust,
      floatFailSafe: opts.floatFailSafe,
      maxRetries: opts.maxRetries,
      eps: opts.eps,
    });
    results[id] = r;
    if (r.status === "floated") floated.push(id);
  }
  return { results, floated };
}
