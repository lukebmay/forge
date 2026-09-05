// @ts-check
/**
 * After-act observe + undersize heal (D115). One owner; D111 jitter is rung 1.
 */

import Meta from "gi://Meta";
import { Logger } from "../shared/logger.js";
import { paneRect } from "../presenter/index.js";
import { ancestorMonitor, parent as tomParent, walk } from "../tom/index.js";
import {
  decideUndersizeDestRetry,
  defaultNearBand,
  frameUndersizedVsCommand,
} from "./geom-epsilon.js";
import { runMark2 } from "./forest-run.js";
import { LAYOUT_VERIFY_EPSILON_PX, normalizeRect, rectsAgree } from "./layout-verify.js";
import { slotOverflowsMins } from "./open-min-place.js";
import {
  MIN_CLAMP_LEARN_DELAY_MS,
  MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS,
  noteWindowMinFromHealUndersize,
  readWindowMinSize,
} from "./tree-layout.js";
import { forestSetWindowFloating, forestSlotPaintRect } from "./tom-live.js";
import * as Utils from "./utils.js";
import { WINDOW_MODES } from "./window-modes.js";

/** Grep: `forge log --grep heal-ladder` / nest `--grep heal-ladder --level info+` */
export const HEAL_LADDER_TOKEN = "heal-ladder";

export const HEAL_ACTION = Object.freeze({
  AGREE: "agree",
  DEFER_NEAR: "defer-near",
  JITTER: "jitter",
  LEARN_MIN: "learn-min",
  ENTER_TAB: "enter-tab",
  CREATE_TAB: "create-tab",
  FLOAT: "float",
  SKIP: "skip",
});

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number, w?: number, h?: number }|null|undefined} r
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function paneToRect(r) {
  if (!r || typeof r !== "object") return null;
  const width = Number(r.width ?? r.w);
  const height = Number(r.height ?? r.h);
  const x = Number(r.x);
  const y = Number(r.y);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

/**
 * @param {ReturnType<typeof paneToRect>} a
 * @param {ReturnType<typeof paneToRect>} b
 */
export function unionRects(a, b) {
  const A = paneToRect(a);
  const B = paneToRect(b);
  if (!A || !B) return null;
  const x = Math.min(A.x, B.x);
  const y = Math.min(A.y, B.y);
  const r = Math.max(A.x + A.width, B.x + B.width);
  const btm = Math.max(A.y + A.height, B.y + B.height);
  return { x, y, width: r - x, height: btm - y };
}

/** @param {ReturnType<typeof paneToRect>} desired @param {ReturnType<typeof paneToRect>} observed @param {number} [epsilon] */
export function destAgrees(desired, observed, epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  return rectsAgree(observed, desired, epsilon);
}

/**
 * @param {{ width?: number, height?: number }|null|undefined} slot
 * @param {{ width?: number, height?: number }|null|undefined} min
 */
export function slotFitsLearnedMin(slot, min) {
  const s = paneToRect(slot) || normalizeRect(slot);
  if (!s) return false;
  return !slotOverflowsMins(s, min);
}

/**
 * @param {ReturnType<typeof paneToRect>} from
 * @param {ReturnType<typeof paneToRect>} to
 * @returns {"left"|"right"|"up"|"down"}
 */
export function dirToward(from, to) {
  const a = paneToRect(from);
  const b = paneToRect(to);
  if (!a || !b) return "right";
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/**
 * Same-MONITOR TAB bags and TILE neighbors (not other heads / workspaces).
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {string} windowId
 * @returns {{
 *   alreadyInBag: boolean,
 *   tabs: import('../tom/kernel.js').Node[],
 *   tiles: import('../tom/kernel.js').Node[],
 * }}
 */
export function collectSameMonitorHealCandidates(forest, windowId) {
  const win = forest?.nodes?.[windowId];
  /** @type {import('../tom/kernel.js').Node[]} */
  const tabs = [];
  /** @type {import('../tom/kernel.js').Node[]} */
  const tiles = [];
  if (!win) return { alreadyInBag: false, tabs, tiles };
  const bagParent = tomParent(forest, win);
  const alreadyInBag = !!(
    bagParent &&
    bagParent.kind === "CON" &&
    (bagParent.layout === "TABBED" || bagParent.layout === "STACKED")
  );
  const mon = ancestorMonitor(forest, win);
  if (!mon) return { alreadyInBag, tabs, tiles };

  walk(forest, mon, (n) => {
    if (!n || n.id === windowId) return;
    if (n.kind === "CON" && (n.layout === "TABBED" || n.layout === "STACKED")) {
      if (alreadyInBag && bagParent && n.id === bagParent.id) return;
      tabs.push(n);
      return;
    }
    if (n.kind !== "WINDOW") return;
    const p = tomParent(forest, n);
    if (p && (p.layout === "TABBED" || p.layout === "STACKED")) return;
    tiles.push(n);
  });
  return { alreadyInBag, tabs, tiles };
}

/**
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {string} fromId
 * @param {import('../tom/kernel.js').Node[]} candidates
 * @returns {import('../tom/kernel.js').Node|null}
 */
export function nearestByPane(forest, fromId, candidates) {
  const from = forest?.nodes?.[fromId];
  const fromRect = paneToRect(from ? paneRect(forest, from) : null);
  if (!fromRect || !candidates?.length) return null;
  const fx = fromRect.x + fromRect.width / 2;
  const fy = fromRect.y + fromRect.height / 2;
  /** @type {import('../tom/kernel.js').Node|null} */
  let best = null;
  let bestD = Infinity;
  for (const n of candidates) {
    const r = paneToRect(n ? paneRect(forest, n) : null);
    if (!r) continue;
    const dx = r.x + r.width / 2 - fx;
    const dy = r.y + r.height / 2 - fy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * @param {import('../tom/kernel.js').Forest} forest
 * @param {string} windowId
 * @param {{ width?: number, height?: number }|null|undefined} min
 */
export function pickNearestHealTargets(forest, windowId, min) {
  const { alreadyInBag, tabs, tiles } = collectSameMonitorHealCandidates(forest, windowId);
  const win = forest?.nodes?.[windowId];
  const selfRect = paneToRect(win ? paneRect(forest, win) : null);
  const tabNode = nearestByPane(forest, windowId, tabs);
  const tileNode = nearestByPane(forest, windowId, tiles);
  /** @type {{ id: string, slot: ReturnType<typeof paneToRect> }|null} */
  let nearestTab = null;
  if (tabNode) {
    const slot = paneToRect(paneRect(forest, tabNode));
    if (slot && slotFitsLearnedMin(slot, min)) nearestTab = { id: tabNode.id, slot };
  }
  /** @type {{ id: string, wrapSlot: ReturnType<typeof paneToRect> }|null} */
  let nearestTile = null;
  if (tileNode) {
    const other = paneToRect(paneRect(forest, tileNode));
    const wrapSlot = unionRects(selfRect, other);
    if (wrapSlot && slotFitsLearnedMin(wrapSlot, min)) {
      nearestTile = { id: tileNode.id, wrapSlot };
    }
  }
  return { alreadyInBag, nearestTab, nearestTile };
}

/**
 * Next heal action from desired vs observed (real rects, not call order).
 * @param {object} input
 */
export function decideHealStep(input) {
  if (input?.floating) {
    return { action: HEAL_ACTION.AGREE, rung: "agree", reason: "float" };
  }
  const desired = paneToRect(input?.desired) || normalizeRect(input?.desired);
  const observed = paneToRect(input?.observed) || normalizeRect(input?.observed);
  const eps =
    typeof input?.epsilon === "number" && Number.isFinite(input.epsilon)
      ? Math.abs(input.epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  if (destAgrees(desired, observed, eps)) {
    return { action: HEAL_ACTION.AGREE, rung: "agree", reason: "in-slot" };
  }
  const tag = input?.tag;
  if (tag === "near") {
    return { action: HEAL_ACTION.DEFER_NEAR, rung: "agree", reason: "near-miss" };
  }

  const jitterCount = Number(input?.jitterCount) || 0;
  const undersizeRetry = decideUndersizeDestRetry({
    tag:
      tag === "far" || tag === "ambiguous"
        ? tag
        : frameUndersizedVsCommand(desired, observed)
        ? "far"
        : tag,
    sent: desired,
    observed,
    retryCount: jitterCount,
    nearBand: input?.nearBand ?? defaultNearBand(eps),
  });
  if (undersizeRetry.retry && undersizeRetry.dest) {
    return {
      action: HEAL_ACTION.JITTER,
      rung: "jitter",
      dest: undersizeRetry.dest,
      reason: "same-dest",
    };
  }

  if (!frameUndersizedVsCommand(desired, observed, input?.nearBand ?? defaultNearBand(eps))) {
    return { action: HEAL_ACTION.SKIP, rung: "agree", reason: "not-undersize" };
  }

  const min = input?.min || {
    width: Number(observed?.width) || 0,
    height: Number(observed?.height) || 0,
  };
  if (!input?.learnedMin) {
    return { action: HEAL_ACTION.LEARN_MIN, rung: "learn-min", min, reason: "after-jitter" };
  }
  if (input?.alreadyInBag) {
    return { action: HEAL_ACTION.FLOAT, rung: "float", reason: "bag-still-undersize" };
  }
  if (input?.nearestTab?.id && slotFitsLearnedMin(input.nearestTab.slot, min)) {
    return {
      action: HEAL_ACTION.ENTER_TAB,
      rung: "enter-tab",
      targetId: input.nearestTab.id,
      reason: "slot-fits-min",
    };
  }
  if (input?.nearestTile?.id && slotFitsLearnedMin(input.nearestTile.wrapSlot, min)) {
    return {
      action: HEAL_ACTION.CREATE_TAB,
      rung: "create-tab",
      targetId: input.nearestTile.id,
      reason: "wrap-fits-min",
    };
  }
  return { action: HEAL_ACTION.FLOAT, rung: "float", reason: "no-legal-tile-slot" };
}

function healSettleDelayMs() {
  let delay = MIN_CLAMP_LEARN_DELAY_MS + 20;
  try {
    if (Meta.is_wayland_compositor?.()) delay += MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS;
  } catch (_e) {
    /* ignore */
  }
  return delay;
}

/**
 * @param {string} rung
 * @param {Record<string, unknown>} [fields]
 * @param {"info"|"debug"} [level]
 */
function logHeal(rung, fields = {}, level = "info") {
  const wmClass = fields.wmClass != null ? String(fields.wmClass) : "-";
  const payload = {
    fields: { phase: "heal-ladder", rung, ...fields },
  };
  const msg = `${HEAL_LADDER_TOKEN} rung=${rung} wmClass=${wmClass}`;
  if (level === "debug") Logger.debug(msg, payload);
  else Logger.info(msg, payload);
}

function metaId(metaWindow) {
  try {
    if (typeof metaWindow?.get_id === "function") return String(metaWindow.get_id());
  } catch (_e) {
    /* ignore */
  }
  return "unknown";
}

/**
 * Fold D111: same-dest jitter then learn / Group / FLOAT. FLOAT is Agree.
 * @param {any} wm
 * @param {any} metaWindow
 * @param {object} [ctx]
 */
export function observeHealAfterSettle(wm, metaWindow, ctx = {}) {
  if (!wm || !metaWindow) return { action: HEAL_ACTION.SKIP, reason: "no-window" };
  try {
    if (!Utils.isWindowAlive(metaWindow)) return { action: HEAL_ACTION.SKIP, reason: "dead" };
  } catch (_e) {
    return { action: HEAL_ACTION.SKIP, reason: "dead" };
  }

  const bagId = ctx.bagId || wm.hostBag?.idFromMeta?.(metaWindow);
  const live = (bagId && wm.liveById?.get?.(bagId)) || wm.findNodeWindow?.(metaWindow) || null;
  if (live?.mode === WINDOW_MODES.GRAB_TILE || live?.isGrabTile?.()) {
    return { action: HEAL_ACTION.SKIP, reason: "grab" };
  }
  const floating =
    live?.mode === WINDOW_MODES.FLOAT || live?.isFloat?.() === true || !!ctx.floating;
  const desired =
    paneToRect(ctx.desired) ||
    normalizeRect(ctx.expectRect || ctx.sent) ||
    paneToRect((wm._liveForestSeeded && live && forestSlotPaintRect(wm, live)) || null);
  const observed = paneToRect(ctx.observed) || paneToRect(metaWindow.get_frame_rect?.());
  const tag = ctx.tag;
  const jitterCount = Number(metaWindow._forgeTileDestRetry) || 0;
  const forest = wm.forest;
  const winId = bagId && forest?.nodes?.[bagId] ? bagId : null;
  const known = ctx.min || (metaWindow ? readWindowMinSize(metaWindow) : null);
  const picked =
    forest && winId
      ? pickNearestHealTargets(forest, winId, known)
      : { alreadyInBag: false, nearestTab: null, nearestTile: null };

  const step = decideHealStep({
    floating,
    desired,
    observed,
    epsilon: ctx.epsilon,
    tag,
    jitterCount,
    learnedMin: !!ctx.learnedMin,
    alreadyInBag: picked.alreadyInBag,
    nearestTab: picked.nearestTab,
    nearestTile: picked.nearestTile,
    min: known,
    nearBand: ctx.nearBand,
  });

  const wmClass = ctx.wmClass != null ? String(ctx.wmClass) : "-";
  const windowId = ctx.windowId != null ? String(ctx.windowId) : metaId(metaWindow);

  if (step.action === HEAL_ACTION.AGREE) {
    metaWindow._forgeTileDestRetry = 0;
    logHeal("agree", { wmClass, windowId, reason: step.reason }, "debug");
    return step;
  }
  if (step.action === HEAL_ACTION.DEFER_NEAR || step.action === HEAL_ACTION.SKIP) {
    return step;
  }

  if (step.action === HEAL_ACTION.JITTER && step.dest) {
    const id = metaId(metaWindow);
    metaWindow._forgeTileDestRetry = jitterCount + 1;
    const delay = healSettleDelayMs();
    wm._wmSources?.set?.(`geomUndersizeRetry:${id}`, delay, () => {
      try {
        if (!Utils.isWindowAlive(metaWindow)) return;
        wm.move(metaWindow, step.dest);
        Logger.debug(
          `geom-epsilon phase=undersize-retry tag=${tag || "-"} wmClass=${wmClass} dMax=${
            ctx.dMax ?? "-"
          }`,
          {
            fields: {
              phase: "undersize-retry",
              tag: tag || "-",
              wmClass,
              windowId,
              dMax: ctx.dMax,
              dest: step.dest,
            },
          }
        );
        logHeal("jitter", { wmClass, windowId, dMax: ctx.dMax, dest: step.dest });
      } catch (_e) {
        /* ignore */
      }
    });
    return step;
  }

  if (step.action === HEAL_ACTION.LEARN_MIN) {
    noteWindowMinFromHealUndersize(metaWindow, observed, desired);
    logHeal("learn-min", {
      wmClass,
      windowId,
      ow: observed?.width,
      oh: observed?.height,
    });
    return observeHealAfterSettle(wm, metaWindow, {
      ...ctx,
      observed,
      desired,
      learnedMin: true,
      min: readWindowMinSize(metaWindow),
    });
  }

  if (wm.isApplyEpochLive?.()) {
    const id = metaId(metaWindow);
    logHeal("defer-epoch", { wmClass, windowId, next: step.action }, "debug");
    wm._wmSources?.set?.(`healLadder:${id}`, healSettleDelayMs(), () => {
      try {
        if (!Utils.isWindowAlive(metaWindow)) return;
        observeHealAfterSettle(wm, metaWindow, { ...ctx, learnedMin: true });
      } catch (_e) {
        /* ignore */
      }
    });
    return { ...step, deferred: true, reason: "apply-epoch" };
  }

  if (step.action === HEAL_ACTION.ENTER_TAB || step.action === HEAL_ACTION.CREATE_TAB) {
    const targetId = step.targetId;
    const ontoNode = targetId && forest?.nodes?.[targetId];
    const selfNode = winId ? forest.nodes[winId] : null;
    const dir = dirToward(
      selfNode ? paneRect(forest, selfNode) : desired,
      ontoNode ? paneRect(forest, ontoNode) : null
    );
    logHeal(step.rung, { wmClass, windowId, onto: targetId, dir, place: "end" });
    const ok = live
      ? runMark2(wm, live, "group", dir, `${HEAL_LADDER_TOKEN}-${step.rung}`, {
          onto: targetId,
          place: "end",
        })
      : false;
    if (ok) return step;
    logHeal("float", { wmClass, windowId, reason: "group-fail" });
    return healFloat(wm, live, metaWindow, { wmClass, windowId });
  }

  if (step.action === HEAL_ACTION.FLOAT) {
    logHeal("float", { wmClass, windowId, reason: step.reason });
    return healFloat(wm, live, metaWindow, { wmClass, windowId });
  }
  return step;
}

/**
 * @param {any} wm
 * @param {any} live
 * @param {any} metaWindow
 * @param {Record<string, unknown>} fields
 */
function healFloat(wm, live, metaWindow, fields) {
  try {
    if (metaWindow) wm.addFloatOverride?.(metaWindow, true);
  } catch (_e) {
    /* best-effort */
  }
  if (live) {
    try {
      live.float = true;
    } catch (_e) {
      /* duck */
    }
    wm.lftMru?.remove?.(live);
    forestSetWindowFloating(wm, live, true);
  }
  wm.commitLayout?.("heal-ladder-float");
  return { action: HEAL_ACTION.FLOAT, rung: "float", reason: fields.reason || "float" };
}
