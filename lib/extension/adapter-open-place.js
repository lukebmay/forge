/*
 * ForgeAdapterGnome — open/place orchestration (PlaceNext, open-min, open-commit).
 * trackWindow validate/ignore stays on WM; this module ends at mapAdmitWindow.
 */

import { Logger } from "../shared/logger.js";
import { assert, assertionFailed } from "../shared/assert.js";
import * as Utils from "./utils.js";
import * as Compat from "./compat.js";
import { LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree-types.js";
import { WINDOW_MODES } from "./window-modes.js";
import {
  forestAdmitMonitor,
  forestBindWindow,
  forestIdFromLive,
  forestReparent,
  forestSetLayout,
  forestSetWindowFloating,
  forestSlotSplit,
  forestSplit,
  forestWrapForTabStack,
  forestWrapNode,
  liveAncestorMonitorId,
  liveChildrenForPresent,
  liveParentForPresent,
  liveStackedOrTabbedConsForPresent,
  placeDeskMatches,
} from "./tom-live.js";
import { safeMoveToMonitor } from "./monitor-recovery.js";
import { extractWmClass } from "./app-thrash-catalog.js";
import { computeOpenMinQuietMs, isFirstOpenOfClass } from "./layout-open.js";
import {
  hideDeferredActor,
  isDeferredOpen as storeIsDeferredOpen,
  markDeferredOpen as storeMarkDeferredOpen,
  rehideDeferredIfNeeded as storeRehideDeferredIfNeeded,
  shouldDeferHiddenOpen,
  showDeferredActor,
  takeAllDeferredOpens,
  takeDeferredOpen,
} from "./layout-deferred-open.js";
import { fallbackMonitorNode, resolveTrackDestId } from "./window-census.js";
import { sessionLayoutTrace } from "./session-layout-restore.js";
import {
  collectLiveWindowNodes,
  findSiblingLayoutPlaceholder,
  isPlaceholderNode,
  layoutPlaceholderMatchesWant,
  pickLayoutPlaceholder,
} from "./layout-placeholder.js";
import {
  isTabOrStackParent,
  shouldTabInsteadOfSplit,
  resolveOpenAppPlacement,
  matchPendingDockLaunch,
  monitorIndexFromPoint,
  DOCK_STICKY_GRACE_MS,
} from "./lft-mru.js";
import {
  consumePlaceHint,
  consumeProvisionalPlaceHint,
  enqueuePlaceHint,
  findMatchingPlaceHintIndex,
  formatPlaceHint,
  matchesPlaceHint,
  metaHasPlaceIdentity,
  metaTitle,
  metaWmClass,
  normalizePlaceHint,
  placeHintIdentityReady,
  pruneExpiredPlaceHints,
  resolvePlaceMonitorIndex,
} from "./place-hint.js";
import { parseSelector, matchNodes, matchWindows, pickMatch } from "./tile-select.js";
import { bfsOpenMinTabCandidates, resolveOpenMinPlacement, tabJoinUnit } from "./open-min-place.js";
import { formatFloatFlagTags } from "../shared/float-reason.js";
import { HUNT_TILE_SLOT_FLOAT, huntTileSlotFloat } from "./hunt-logs.js";
import { recordFallback } from "./metrics.js";
import { mapAdmitWindow } from "./adapter-map-admit.js";
import { readWindowMinSize } from "./tree-layout.js";

/**
 * Map-path place + admit after validate/ignore. Ends at mapAdmitWindow.
 * @param {object} wm
 * @param {object} metaWindow
 */
export function openPlaceTrack(wm, metaWindow) {
  const existNodeWindow = wm.findNodeWindow(metaWindow);
  Logger.debug(`Meta Window ${metaWindow.get_title()} ${metaWindow.get_window_type()}`);
  if (existNodeWindow) return;

  const openPlan = wm._planOpenAppPlacement(metaWindow);
  // forge-3hsv / CL8: willTile before aspect-split so LayoutBatch skips carve.
  const willTile = !wm.isFloatingExempt(metaWindow);
  const batchSkipOpenMin = !!wm.openLayoutBatchActive;

  // D032 only for free opens. PlaceNext pin skips wrap (R036); R028/R031
  // still adopt on FLOAT→TILE for non-pin maps.
  const placePinned = !!openPlan.fromPlaceHint;
  let insertUnit = wm._resolveInsertUnit(openPlan.attachLft);
  let leftoverSlot = placePinned ? null : wm._hvSlotToJoin(insertUnit);
  let openMinTabTarget = null;
  let openMinFloat = false;
  if (willTile && !placePinned && !batchSkipOpenMin) {
    const minDecision = wm._decideOpenMinPlacement(metaWindow, openPlan.attachLft);
    /** @type {string} */
    let insertBranch = "aspect-split+slotSplit";
    if (minDecision?.kind === "tab" && minDecision.targetUnit) {
      // Downstream single-dock chain: nearest-groupable (= open-min tab BFS).
      insertBranch = "nearest-groupable";
      openMinTabTarget = wm._ensureTabbedForOpen(minDecision.targetUnit);
      leftoverSlot = null;
      insertUnit = openMinTabTarget || insertUnit;
    } else if (minDecision?.kind === "float") {
      insertBranch = "open-min-float";
      openMinFloat = true;
      leftoverSlot = null;
    } else if (leftoverSlot) {
      insertBranch = "leftover-hv-slot";
      const leftoverLay = wm._layoutFromOrientation(wm._orientationFromUnit(leftoverSlot));
      if (!forestSetLayout(wm, leftoverSlot, leftoverLay)) {
        if (wm._liveForestSeeded) recordFallback("setLayout", "ids-miss");
        else leftoverSlot.layout = leftoverLay;
      }
    } else {
      wm._maybeAspectSplitForOpen(openPlan.attachLft);
      wm.slotSplitForInsert(insertUnit);
    }
    Logger.debug(
      `track insert branch=${insertBranch} min=${minDecision?.kind || "split"} ` +
        `dock=${!!openPlan.isDock} emptyHead=${!!openPlan.isEmptyHead} ` +
        `home=${openPlan.homeMonitor} placePinned=${placePinned} ` +
        `attach=${openPlan.attachMode || "-"}`
    );
  } else if (willTile && !placePinned) {
    if (leftoverSlot) {
      const leftoverLay = wm._layoutFromOrientation(wm._orientationFromUnit(leftoverSlot));
      if (!forestSetLayout(wm, leftoverSlot, leftoverLay)) {
        if (wm._liveForestSeeded) recordFallback("setLayout", "ids-miss");
        else leftoverSlot.layout = leftoverLay;
      }
    } else {
      wm.slotSplitForInsert(insertUnit);
    }
  }

  const activeWorkspace = global.display.get_workspace_manager().get_active_workspace_index();
  const dest = resolveTrackDestId({
    homeMonitor: openPlan.homeMonitor,
    windowMonitor: metaWindow.get_monitor?.() ?? -1,
    activeWorkspace,
    createId: (m, w) => Utils.createMonitorWorkspaceId(m, w),
  });
  let metaMonWsNode = dest ? wm.tree.findNode(dest.id) : null;
  if (
    !metaMonWsNode &&
    dest &&
    (openPlan.isEmptyHead || openPlan.isDock || openPlan.fromPlaceHint)
  ) {
    metaMonWsNode = resolveDestMonitorLive(wm, dest);
  }
  if (!metaMonWsNode) {
    metaMonWsNode = fallbackMonitorNode(wm.tree.getNodeByType(NODE_TYPES.MONITOR), activeWorkspace);
  }
  if (!metaMonWsNode) {
    sessionLayoutTrace(
      `layout-track: drop no-dest class=${metaWindow.get_wm_class()} title=${JSON.stringify(
        metaWindow.get_title()
      )}`
    );
    wm.reloadTree("no-meta-monws");
    return;
  }
  if (dest && metaMonWsNode.nodeValue !== dest.id) {
    sessionLayoutTrace(
      `layout-track: dest-fallback want=${dest.id} used=${metaMonWsNode.nodeValue}`
    );
  }

  let windowNodes = metaMonWsNode.getNodeByType(NODE_TYPES.WINDOW);
  if (!windowNodes.length) {
    windowNodes = wm._windowsUnderLive(metaMonWsNode);
  }
  let hasWindows = windowNodes.length > 0;

  // Pin: parent of attach leaf. Else leftover HV slot / D032 bag parent.
  let attachTarget = null;
  let placeBefore = null;
  if (placePinned && openPlan.attachLft) {
    const pin =
      openPlan.attachLft.nodeValue != null
        ? wm.findNodeWindow(openPlan.attachLft.nodeValue) || openPlan.attachLft
        : openPlan.attachLft;
    if (pin) {
      if (pin.isWindow?.() || pin.nodeType === NODE_TYPES.WINDOW) {
        attachTarget = wm._membershipParentLive(pin) || pin.parentNode || metaMonWsNode;
        placeBefore = pin;
      } else if (pin.isCon?.() || pin.isMonitor?.()) {
        attachTarget = pin;
      }
    }
  }
  if (!attachTarget && openMinFloat) {
    attachTarget = metaMonWsNode;
  }
  if (!attachTarget && openMinTabTarget) {
    const tabLive =
      openMinTabTarget.nodeValue != null
        ? wm.findNodeWindow(openMinTabTarget.nodeValue) || openMinTabTarget
        : openMinTabTarget;
    const tabParent = tabLive ? wm._membershipParentLive(tabLive) || tabLive.parentNode : null;
    if (tabLive?.isStackedOrTabbed?.()) {
      attachTarget = tabLive;
    } else if (isTabOrStackParent(tabParent, LAYOUT_TYPES)) {
      attachTarget = tabParent;
    } else if (tabLive?.isWindow?.()) {
      attachTarget = tabLive;
    }
  }
  if (!attachTarget) {
    attachTarget = leftoverSlot
      ? leftoverSlot
      : insertUnit && insertUnit.isCon?.()
      ? wm._membershipParentLive(insertUnit) || insertUnit.parentNode || metaMonWsNode
      : wm._resolveAttachTarget(metaMonWsNode, windowNodes, hasWindows, openPlan.attachLft);
  }

  assert(!!attachTarget, "launch-insert-target", {
    ws: activeWorkspace,
    mon: dest?.id ?? metaMonWsNode?.nodeValue,
  });
  if (assertionFailed() || !attachTarget) return;

  const deferHidden = shouldDeferHiddenOpen({
    willTile,
    openMinFloat,
    openLayoutBatchActive: wm.openLayoutBatchActive,
  });

  mapAdmitWindow(wm, metaWindow, {
    openPlan,
    willTile,
    deferHidden,
    placePinned,
    attachTarget,
    placeBefore,
    metaMonWsNode,
    openMinFloat,
    insertUnit,
    floatMode: WINDOW_MODES.FLOAT,
    openLayoutBatchActive: !!wm.openLayoutBatchActive,
  });
}

/**
 * CL8: true while meta is a deferred LayoutBatch map (hidden FLOAT).
 * @param {Meta.Window|null|undefined} metaWindow
 * @returns {boolean}
 */
export function isDeferredOpen(wm, metaWindow) {
  return storeIsDeferredOpen(wm._deferredOpenStore, metaWindow);
}

/**
 * CL8: mark + hide actor/border for deferred LayoutBatch admit.
 * SL2: snapshot mappedAt so release can stamp settle t0 from map time.
 * @param {Meta.Window} metaWindow
 * @param {object|null|undefined} windowActor
 */
export function markDeferredOpen(wm, metaWindow, windowActor) {
  if (!metaWindow) return;
  const actor = windowActor || metaWindow.get_compositor_private?.();
  const snap = hideDeferredActor(actor);
  storeMarkDeferredOpen(wm._deferredOpenStore, metaWindow, {
    ...snap,
    mappedAt: Date.now(),
  });
}

/**
 * CL11: re-hide deferred map when actor was late/null or opacity restored.
 * @param {Meta.Window|null|undefined} metaWindow
 */
export function rehideDeferredIfNeeded(wm, metaWindow) {
  if (!metaWindow || !wm._isDeferredOpen(metaWindow)) return;
  let actor = null;
  try {
    actor = metaWindow.get_compositor_private?.();
  } catch (_e) {
    actor = null;
  }
  storeRehideDeferredIfNeeded(wm._deferredOpenStore, metaWindow, actor);
}

/**
 * CL8: unhide one deferred map and clear mark.
 * SL2: note settle pending (mappedAt or now) for time-to-stable.
 * @param {Meta.Window} metaWindow
 */
export function releaseDeferredOpen(wm, metaWindow) {
  if (!metaWindow) return;
  const snap = takeDeferredOpen(wm._deferredOpenStore, metaWindow);
  if (!snap) return;
  let actor = null;
  try {
    actor = metaWindow.get_compositor_private?.();
  } catch (_e) {
    actor = null;
  }
  showDeferredActor(actor, snap);
  wm._noteDeferredReleaseForSettle(metaWindow, snap);
}

/**
 * SL2: stamp settle pending after deferred LayoutBatch release.
 * Idempotent vs open-commit note (earliest t0 wins).
 * @param {Meta.Window|null|undefined} metaWindow
 * @param {{ mappedAt?: number }|null|undefined} state
 */
export function noteDeferredReleaseForSettle(wm, metaWindow, state) {
  if (!metaWindow) return;
  const mapped = Number(state?.mappedAt);
  const t0 = Number.isFinite(mapped) ? mapped : Date.now();
  wm.layoutController?.noteOpenPendingForSettle?.(metaWindow, t0);
}

/** CL8: unhide every deferred map (batch end / disable / CL9 pre-residual). */
export function releaseAllDeferredOpens(wm) {
  const released = takeAllDeferredOpens(wm._deferredOpenStore);
  for (const { meta, state } of released) {
    let actor = null;
    try {
      actor = meta?.get_compositor_private?.();
    } catch (_e) {
      actor = null;
    }
    showDeferredActor(actor, state);
    wm._noteDeferredReleaseForSettle(meta, state);
  }
  return released.length;
}

/**
 * CL9: unhide deferred LayoutBatch maps without ending the batch.
 * Residual RunSteps can then TILE/place; endOpenLayoutBatch still runs after.
 * processFloats so just-opened leave FLOAT before residual layout/move
 * (batch still blocks requestLayout; without this residual structure no-ops).
 * @returns {{ ok: true, released: number, depth: number }}
 */
export function releaseDeferredOpens(wm) {
  const released = wm._releaseAllDeferredOpens();
  try {
    wm.processFloats();
  } catch (e) {
    Logger.warn?.(`releaseDeferredOpens processFloats: ${e}`);
  }
  return {
    ok: true,
    released,
    depth: wm._openLayoutBatchDepth || 0,
  };
}

/**
 * CL4: schedule open layout commit after quiet (or max wait).
 * recordOpen on catalog; external geom resets quiet timer.
 * @param {Meta.Window} metaWindow
 * @param {{ isDock?: boolean }} openPlan
 */
export function scheduleOpenCommit(wm, metaWindow, openPlan) {
  if (!metaWindow || !wm._openCommit) return;

  const catalog = wm.appThrashCatalog;
  const wmClass = extractWmClass(metaWindow);
  let entry = null;
  let firstOpen = true;
  if (wmClass && catalog) {
    firstOpen = isFirstOpenOfClass(catalog.lookup(wmClass));
    entry = catalog.recordOpen(wmClass);
  }

  const isDock = !!openPlan?.isDock;
  const minQuietMs = computeOpenMinQuietMs({
    isDock,
    catalogMinQuietMs: entry?.minQuietMs ?? 0,
    // Dock keeps short floor; skip first-open extra so sticky mon stays snappy.
    firstOpen: isDock ? false : firstOpen,
  });

  const now = Date.now();
  wm._openCommit.schedule(metaWindow, {
    minQuietMs,
    isDock,
    wmClass: wmClass || null,
    firstOpen,
  });
  // SL1: time-to-stable from open stamp until first Meta↔slot agreement.
  wm.layoutController?.noteOpenPendingForSettle?.(metaWindow, now);
}

/**
 * CL4: cancel pending open commit for one window (destroy / re-schedule).
 * @param {Meta.Window} metaWindow
 */
export function cancelOpenCommit(wm, metaWindow) {
  wm._openCommit?.cancel(metaWindow);
}

/** CL4: cancel all pending open commits (disable / teardown). */
export function cancelAllOpenCommits(wm) {
  wm._openCommit?.cancelAll({
    clearSettle: (mw) => wm.layoutController?.clearOpenPendingForSettle?.(mw),
  });
}

/**
 * CL4: external size/pos for a window with pending open — reset quiet.
 * Also records identity when wm_class lands late.
 * @param {Meta.Window} metaWindow
 * @returns {boolean} true if this window had a pending open commit
 */
export function touchOpenCommitExternalGeometry(wm, metaWindow) {
  if (!metaWindow || !wm._openCommit?.has(metaWindow)) return false;
  wm._refreshOpenCommitIdentity(metaWindow);
  return wm._openCommit.touchExternalGeometry(metaWindow);
}

/**
 * CL4: when wm_class was null at map, update catalog / minQuiet once it lands.
 * @param {Meta.Window} metaWindow
 * @param {object} [state]
 */
export function refreshOpenCommitIdentity(wm, metaWindow, state) {
  const st = state || wm._openCommit?.get(metaWindow);
  if (!st || !metaWindow) return;
  const cls = extractWmClass(metaWindow);
  if (!cls) return;
  if (st.wmClass === cls) return;

  const catalog = wm.appThrashCatalog;
  let entry = null;
  if (catalog) {
    // First usable class for this open: count as an open observation.
    const firstOpen = isFirstOpenOfClass(catalog.lookup(cls));
    entry = catalog.recordOpen(cls);
    if (entry && !st.isDock && firstOpen) {
      const raised = computeOpenMinQuietMs({
        isDock: false,
        catalogMinQuietMs: entry.minQuietMs,
        firstOpen: true,
      });
      if (raised > st.minQuietMs) st.minQuietMs = raised;
    } else if (entry) {
      const raised = computeOpenMinQuietMs({
        isDock: st.isDock,
        catalogMinQuietMs: entry.minQuietMs,
        firstOpen: false,
      });
      if (raised > st.minQuietMs) st.minQuietMs = raised;
    }
  }
  st.wmClass = cls;
}

/**
 * @param {Meta.Window} metaWindow
 */
export function armOpenCommitTimer(wm, metaWindow) {
  wm._openCommit?.arm(metaWindow);
}

/**
 * CL4/CL5: quiet met or max-wait — unmaximize + layout commit.
 *
 * OpenApp: Cq via commitLayout (requestLayout); Cf when frozen or no LC.
 * LayoutBatch: unmaximize only + latch need-commit — residual one Cf at end.
 *
 * @param {Meta.Window} metaWindow
 */
export function fireOpenCommit(wm, metaWindow) {
  if (!wm._openCommit?.has(metaWindow)) return;
  wm._cancelOpenCommit(metaWindow);

  const node = wm.findNodeWindow(metaWindow);
  if (!node) return;

  // queueEvent: serialize with other WM work; unmaximize + commit after quiet.
  wm.queueEvent(
    {
      name: "window-create-queue",
      callback: () => {
        const still = wm.findNodeWindow(metaWindow);
        if (!still) return;
        try {
          Compat.unmaximize(metaWindow);
        } catch (_e) {
          // window may be disposing
        }
        // Multi-open batch: admit + quiet per window, one commit at batch end.
        if (wm._openLayoutBatchDepth > 0) {
          wm._openLayoutBatchNeedsCommit = true;
          return;
        }
        // OpenApp Cq; Cf when frozen (or no layoutController fallback).
        wm.commitLayout("window-create", {
          force: !!wm._freezeRender || !wm.layoutController,
        });
      },
    },
    0
  );
}

/**
 * OP1 + FC2: resolve monitor home + LFT attach (or PlaceNext hint).
 * Place hint wins over LFT/dock when the new window matches.
 * @param {Meta.Window} metaWindow
 */
export function planOpenAppPlacement(wm, metaWindow) {
  const placePlan = wm._tryPlanFromPlaceHint(metaWindow);
  if (placePlan) {
    Logger.trace(
      `open-plan branch=place-hint home=${placePlan.homeMonitor} mode=${
        placePlan.attachMode || "-"
      }`
    );
    return placePlan;
  }

  const dockMonitor = wm.detectDockLaunchMonitor(metaWindow);
  const globalLft = wm.lftMru?.globalHead?.() ?? null;
  const lftMonitor = wm._monitorIndexOfNode(globalLft);
  /** @type {any} */
  let monLft = null;
  /** @type {string} */
  let branch = "placement";
  // Single-dock / same-mon chain: last-focused → LFT(m) → end-of-tree →
  // (open-min nearest-groupable → float at track). Dual-mon dock never
  // rehomes off dock mon via cross-mon focus (D007).
  const focusMeta = wm.focusMetaWindow;
  if (dockMonitor >= 0) {
    if (focusMeta) {
      const focusNode = wm.findNodeWindow(focusMeta);
      if (focusNode?.isWindow?.() && focusNode.isTile?.() && !focusNode.isFloat?.()) {
        const focusMon = wm._monitorIndexOfNode(focusNode);
        if (focusMon >= 0 && focusMon === dockMonitor) {
          monLft = focusNode;
          branch = "dock-same-mon-focus";
        }
      }
    }
    if (!monLft) {
      monLft = wm.lftMru?.monHead?.(dockMonitor) ?? null;
      if (monLft) branch = "dock-mon-lft";
    }
    // LFT mon ring empty after layout (mon never focused) → last tiled leaf
    // (not mon-root 3rd HSPLIT covering the left tab group).
    if (!monLft) {
      monLft = wm._lastTileOnMonitor(dockMonitor);
      if (monLft) branch = "dock-end-of-tree";
    }
  }
  const windowMonitor = metaWindow?.get_monitor?.() ?? -1;
  const pointerMonitor = wm._pointerMonitorIndex();
  const emptyMonitors = wm._emptyTileMonitorIndices();
  let placement = "pointer";
  try {
    placement = wm.ext.settings.get_string("new-window-placement") || "pointer";
  } catch (_e) {
    // settings unavailable in some fixtures
  }

  const plan = resolveOpenAppPlacement({
    dockMonitor,
    monLft,
    globalLft,
    lftMonitor,
    windowMonitor,
    pointerMonitor,
    emptyMonitors,
    placement,
  });

  // Empty dest head must not pick last-tile from another workspace.
  if (!plan.attachLft && plan.homeMonitor >= 0 && !plan.isEmptyHead) {
    const last = wm._lastTileOnMonitor(plan.homeMonitor);
    if (last) {
      plan.attachLft = last;
      plan.attachMode = "after-lft";
      if (branch === "placement") branch = "end-of-tree";
    }
  }

  // Re-resolve attach LFT against the live tree when possible.
  if (plan.attachLft?.nodeValue) {
    const live = wm.findNodeWindow(plan.attachLft.nodeValue);
    if (live) plan.attachLft = live;
  }

  // Prefer the currently focused tile (user "selected" that unit). LFT can be
  // a different mon (agent terminal / layout restore); open-under-focus must
  // follow focus, not stale cross-mon LFT. Dock / empty-head home is never
  // rehomed by focus (right-head open while focus is on left must stay).
  if (focusMeta && !plan.isDock && !plan.isEmptyHead) {
    const focusNode = wm.findNodeWindow(focusMeta);
    if (focusNode?.isWindow?.() && focusNode.isTile?.() && !focusNode.isFloat?.()) {
      const focusMon = wm._monitorIndexOfNode(focusNode);
      if (focusMon >= 0) {
        plan.homeMonitor = focusMon;
        plan.attachLft = focusNode;
        plan.attachMode = "after-lft";
        branch = "last-focused";
      }
    }
  }
  // D077: selected CON (focus.parent) is the Launch slot when on this head.
  const focusUnit = wm.tree?.focusUnit;
  if (
    focusUnit &&
    !plan.isDock &&
    !plan.isEmptyHead &&
    (focusUnit.isCon?.() || focusUnit.nodeType === NODE_TYPES.CON)
  ) {
    const unitMon = wm._monitorIndexOfNode(focusUnit);
    if (unitMon >= 0) {
      plan.homeMonitor = unitMon;
      plan.attachLft = focusUnit;
      plan.attachMode = "after-lft";
      branch = "focus-unit";
    }
  }
  if (plan.isDock && branch === "placement") branch = "dock-mon-lft";
  Logger.debug(
    `open-plan branch=${branch} home=${plan.homeMonitor} dock=${!!plan.isDock} ` +
      `emptyHead=${!!plan.isEmptyHead} mode=${plan.attachMode || "-"} ` +
      `dockMon=${dockMonitor}`
  );
  return plan;
}

/**
 * FC2: queue a one-shot PlaceNext hint (from DBus or tests).
 * @param {object} options
 * @returns {{ ok: true, hint: object } | { ok: false, error: string }}
 */
export function placeNext(wm, options) {
  const now = Date.now();
  const norm = normalizePlaceHint(options, now);
  if (!norm.ok) return norm;
  if (!wm._pendingPlaceHints) wm._pendingPlaceHints = [];
  enqueuePlaceHint(wm._pendingPlaceHints, norm.hint, now);
  return { ok: true, hint: norm.hint };
}

/** Drop expired PlaceNext hints. */
export function clearExpiredPlaceHints(wm) {
  if (!wm._pendingPlaceHints?.length) return;
  pruneExpiredPlaceHints(wm._pendingPlaceHints, Date.now());
}

/**
 * If a PlaceNext hint matches this window, consume it and build a plan.
 * Null class/title (Wayland Chrome/PWA): FIFO provisional slot hint so open
 * lands in PH CON (no free mon0 aspect-split). Identity re-check on late adopt.
 * @param {Meta.Window} metaWindow
 * @returns {{ homeMonitor: number, isDock: boolean, attachLft: any, attachMode: string, fromPlaceHint: boolean }|null}
 */
export function tryPlanFromPlaceHint(wm, metaWindow) {
  if (!wm._pendingPlaceHints?.length) return null;
  const now = Date.now();
  const hint = consumePlaceHint(wm._pendingPlaceHints, metaWindow, now);
  if (hint) {
    try {
      delete metaWindow._forgeProvisionalPlaceHint;
    } catch (_e) {
      /* */
    }
    Logger.info(
      `place-hint match ${formatPlaceHint(hint)} winClass=${metaWmClass(metaWindow)} ` +
        `winTitle=${JSON.stringify(metaTitle(metaWindow))} queueLeft=${
          wm._pendingPlaceHints.length
        }`
    );
    return wm._placePlanFromConsumedHint(hint);
  }
  // R036: identity not ready — claim oldest slot PlaceNext (spawn order).
  if (!metaHasPlaceIdentity(metaWindow)) {
    const provisional = consumeProvisionalPlaceHint(wm._pendingPlaceHints, now);
    if (provisional) {
      try {
        metaWindow._forgeProvisionalPlaceHint = provisional;
      } catch (_e) {
        /* meta may be sealed in tests */
      }
      Logger.info(
        `place-hint provisional claim ${formatPlaceHint(provisional)} ` +
          `queueLeft=${wm._pendingPlaceHints.length}`
      );
      return wm._placePlanFromConsumedHint(provisional);
    }
    Logger.debug(
      `place-hint no provisional (null identity, no slot hints) queue=${wm._pendingPlaceHints.length}`
    );
  }
  return null;
}

/**
 * Build open plan from an already-consumed PlaceNext hint.
 * @param {object} hint
 * @returns {{ homeMonitor: number, isDock: boolean, attachLft: any, attachMode: string, fromPlaceHint: boolean }|null}
 */
export function placePlanFromConsumedHint(wm, hint) {
  if (!hint || typeof hint !== "object") return null;

  let attachNode = null;
  let attachVia = null;
  if (hint.attachSelector) {
    attachNode = wm._resolvePlaceAttachSelector(hint.attachSelector, !!hint.first);
    if (attachNode) attachVia = "selector";
  }
  if (!attachNode && hint.treePath) {
    const pathSel = hint.treePath.startsWith("path:") ? hint.treePath : `path:${hint.treePath}`;
    attachNode = wm._resolvePlaceAttachSelector(pathSel, !!hint.first);
    if (attachNode) attachVia = "tree-path";
  }

  let homeMonitor = resolvePlaceMonitorIndex(hint.monitor, {
    liveMap: wm._monitorLiveMap,
    primaryMonitor: wm._primaryMonitorIndex(),
  });

  if (attachNode) {
    const monOfAttach = wm._monitorIndexOfNode(attachNode);
    if (homeMonitor < 0 && monOfAttach >= 0) homeMonitor = monOfAttach;
    if (hint.monitor != null && hint.monitor !== "") {
      const explicit = resolvePlaceMonitorIndex(hint.monitor, {
        liveMap: wm._monitorLiveMap,
        primaryMonitor: wm._primaryMonitorIndex(),
      });
      if (explicit >= 0) homeMonitor = explicit;
    }
  }

  if (homeMonitor < 0) homeMonitor = 0;

  let attachLft = null;
  if (attachNode) {
    const monOfAttach = wm._monitorIndexOfNode(attachNode);
    if (monOfAttach < 0 || monOfAttach === homeMonitor) {
      attachLft = attachNode;
    }
  }
  // Shared-slot PlaceNext pins first PH id; after bind it is gone (R049b).
  if (!attachLft) {
    const slotAttach = wm._resolvePlaceSlotAttachFromHint(hint, homeMonitor);
    if (slotAttach?.attachLft) {
      attachLft = slotAttach.attachLft;
      attachVia = slotAttach.via || "slot";
      Logger.info(
        `place-hint slot-join attach via=${attachVia} ` +
          `role=${hint.layoutRole || "-"} slot=${hint.layoutSlot || "-"} ` +
          `class=${hint.wmClass || "-"}`
      );
    }
  }
  if (!attachLft) {
    attachLft = wm.lftMru?.monHead?.(homeMonitor) ?? null;
    if (attachLft) attachVia = attachVia || "lft";
  }

  const workspace =
    hint.workspace != null && Number.isFinite(Number(hint.workspace))
      ? Math.floor(Number(hint.workspace))
      : null;

  return {
    homeMonitor,
    isDock: false,
    attachLft,
    attachMode: attachLft ? "after-lft" : "mon-root",
    fromPlaceHint: true,
    workspace,
    placeHint: hint,
    attachVia: attachVia || (attachLft ? "lft" : "mon-root"),
  };
}

/**
 * Role/slot attach when shared PH id is stale (Forest SoT).
 * @param {object} hint
 * @param {number} [homeMonitor]
 * @returns {{ attachLft: any, via: string }|null}
 */
/**
 * Role/slot PH on PlaceNext's monitor+workspace (same slot names exist per desk).
 * @param {any} wm
 * @param {{ layoutRole?: string|null, layoutSlot?: string|null }} want
 * @param {number} [homeMonitor]
 * @param {number|null} [workspace]
 * @returns {any|null}
 */
function pickPlaceDeskPlaceholder(wm, want, homeMonitor = -1, workspace = null) {
  const nodes = collectLiveWindowNodes(wm, wm?.tree).filter((n) =>
    placeDeskMatches(wm, n, homeMonitor, workspace)
  );
  return pickLayoutPlaceholder(nodes, want);
}

export function resolvePlaceSlotAttachFromHint(wm, hint, homeMonitor = -1) {
  if (!hint || typeof hint !== "object") return null;
  // Role/slot only — bare wmClass would match any tagged PH (R049b).
  const want = {
    layoutRole: hint.layoutRole || null,
    layoutSlot: hint.layoutSlot || null,
    wmClass: null,
  };
  if (!want.layoutRole && !want.layoutSlot) return null;

  const workspace =
    hint.workspace != null && Number.isFinite(Number(hint.workspace))
      ? Math.floor(Number(hint.workspace))
      : null;

  const ph = pickPlaceDeskPlaceholder(wm, want, homeMonitor, workspace);
  if (ph) {
    Logger.debug(
      `place-hint desk-ph role=${want.layoutRole || "-"} slot=${want.layoutSlot || "-"} ` +
        `ws=${workspace ?? "-"} desk=${liveAncestorMonitorId(wm, ph) || "?"}`
    );
    return { attachLft: ph, via: "role-ph" };
  }

  const slot =
    want.layoutSlot != null && String(want.layoutSlot).trim() !== ""
      ? String(want.layoutSlot).trim()
      : null;
  const bags = liveStackedOrTabbedConsForPresent(wm) || [];
  for (const bag of bags) {
    if (!bag) continue;
    if (!placeDeskMatches(wm, bag, homeMonitor, workspace)) continue;
    const kids = liveChildrenForPresent(wm, bag) || bag.childNodes || [];
    for (const k of kids) {
      if (!k) continue;
      if (isPlaceholderNode(k) && layoutPlaceholderMatchesWant(k, want)) {
        return { attachLft: bag, via: "slot-bag" };
      }
      if (slot) {
        const kSlot = k.layoutSlot ?? k.nodeValue?.layoutSlot ?? null;
        if (kSlot != null && String(kSlot) === slot) {
          return { attachLft: bag, via: "slot-bag" };
        }
      }
    }
  }

  return null;
}

/**
 * Move Meta onto ApplyLayout / PlaceNext workspace when it mapped elsewhere.
 * @param {Meta.Window} metaWindow
 * @param {number|null|undefined} wantWs
 * @returns {boolean} true when a move was attempted
 */
export function ensureMetaOnWorkspace(wm, metaWindow, wantWs) {
  if (!metaWindow || wantWs == null || !Number.isFinite(Number(wantWs))) return false;
  const want = Math.max(0, Math.floor(Number(wantWs)));
  let cur = null;
  try {
    cur = metaWindow.get_workspace?.()?.index?.();
  } catch (_e) {
    cur = null;
  }
  try {
    if (typeof metaWindow.change_workspace_by_index === "function") {
      if (cur === want) {
        metaWindow.change_workspace_by_index(want, false);
        return false;
      }
      metaWindow.change_workspace_by_index(want, false);
      Logger.info(
        `place-hint workspace move ${cur ?? "?"}→${want} class=${metaWmClass(metaWindow)}`
      );
      return true;
    }
    const wsMgr = global.workspace_manager || global.display?.get_workspace_manager?.() || null;
    const ws = wsMgr?.get_workspace_by_index?.(want);
    if (ws && typeof metaWindow.change_workspace === "function") {
      metaWindow.change_workspace(ws);
      Logger.info(
        `place-hint workspace move ${cur ?? "?"}→${want} class=${metaWmClass(metaWindow)}`
      );
      return true;
    }
  } catch (e) {
    Logger.warn(`place-hint workspace move failed: ${e}`);
  }
  return false;
}

/**
 * R036: provisional pin at null map; confirm or rehome when identity is ready.
 * Incomplete class/title must keep the provisional (never re-queue on partial).
 * @param {Meta.Window} metaWindow
 * @returns {boolean}
 */
export function tryAdoptLatePlaceHint(wm, metaWindow) {
  if (!metaWindow || metaWindow._forgeLatePlaceAdoptBusy) return false;
  if (!metaWindow._forgeProvisionalPlaceHint && !wm._pendingPlaceHints?.length) {
    return false;
  }
  const node = wm.findNodeWindow(metaWindow);
  if (!node || isPlaceholderNode(node)) return false;

  const now = Date.now();
  let provisional = null;
  try {
    provisional = metaWindow._forgeProvisionalPlaceHint || null;
  } catch (_e) {
    provisional = null;
  }

  const cls = metaWmClass(metaWindow);
  const title = metaTitle(metaWindow);

  if (provisional) {
    // Wait until class/title fields the hint needs are present (and not loading).
    if (!placeHintIdentityReady(metaWindow, provisional)) {
      Logger.debug(
        `place-hint late wait identity ${formatPlaceHint(provisional)} ` +
          `winClass=${cls} winTitle=${JSON.stringify(title)}`
      );
      return false;
    }
    try {
      delete metaWindow._forgeProvisionalPlaceHint;
    } catch (_e) {
      /* */
    }
    if (matchesPlaceHint(metaWindow, provisional, now)) {
      Logger.info(
        `place-hint late confirm ${formatPlaceHint(provisional)} ` +
          `winClass=${cls} winTitle=${JSON.stringify(title)}`
      );
      const plan = wm._placePlanFromConsumedHint(provisional);
      if (!plan) return false;
      return wm._applyPlacePlanToExistingWindow(metaWindow, plan);
    }
    // Confirmed wrong role — return hint; match another pending by identity.
    Logger.info(
      `place-hint late mismatch re-queue ${formatPlaceHint(provisional)} ` +
        `winClass=${cls} winTitle=${JSON.stringify(title)}`
    );
    if (!wm._pendingPlaceHints) wm._pendingPlaceHints = [];
    enqueuePlaceHint(wm._pendingPlaceHints, provisional, now);
  }

  if (!wm._pendingPlaceHints?.length) return false;
  if (!metaHasPlaceIdentity(metaWindow)) return false;
  const idx = findMatchingPlaceHintIndex(wm._pendingPlaceHints, metaWindow, now);
  if (idx < 0) {
    Logger.debug(
      `place-hint late no match winClass=${cls} winTitle=${JSON.stringify(title)} ` +
        `queue=${wm._pendingPlaceHints.length}`
    );
    return false;
  }

  const hint = consumePlaceHint(wm._pendingPlaceHints, metaWindow, now);
  if (!hint) return false;
  Logger.info(
    `place-hint late adopt ${formatPlaceHint(hint)} winClass=${cls} ` +
      `winTitle=${JSON.stringify(title)}`
  );
  const plan = wm._placePlanFromConsumedHint(hint);
  if (!plan) return false;
  return wm._applyPlacePlanToExistingWindow(metaWindow, plan);
}

/**
 * Drop layout PH for this window's role/slot (R045). Never bind a foreign role PH.
 * @param {any} winNode
 * @param {{ placeHint?: object, attachLft?: any }} [plan]
 * @returns {boolean}
 */
export function consumeLeftoverLayoutPlaceholder(wm, winNode, plan = {}) {
  if (!winNode || isPlaceholderNode(winNode)) return false;
  const hint = plan.placeHint && typeof plan.placeHint === "object" ? plan.placeHint : {};
  const want = {
    layoutRole: hint.layoutRole || null,
    layoutSlot: hint.layoutSlot || null,
    wmClass: hint.wmClass || metaWmClass(winNode.nodeValue) || null,
  };
  const hasWant = !!(want.layoutRole || want.layoutSlot || want.wmClass);
  const planWs =
    plan.workspace != null && Number.isFinite(Number(plan.workspace))
      ? Math.floor(Number(plan.workspace))
      : hint.workspace != null && Number.isFinite(Number(hint.workspace))
      ? Math.floor(Number(hint.workspace))
      : null;
  const planHome = plan.homeMonitor >= 0 ? plan.homeMonitor : -1;

  /** @param {any} cand */
  const accept = (cand) => {
    if (!cand || !isPlaceholderNode(cand)) return false;
    if (!placeDeskMatches(wm, cand, planHome, planWs)) return false;
    if (!hasWant) return true;
    return layoutPlaceholderMatchesWant(cand, want);
  };

  let ph = null;
  if (hint.attachSelector) {
    try {
      const pinned = wm._resolvePlaceAttachSelector?.(hint.attachSelector, !!hint.first);
      if (accept(pinned)) ph = pinned;
    } catch (_e) {
      /* */
    }
  }
  if (!ph && plan.attachLft && accept(plan.attachLft)) {
    ph = plan.attachLft;
  }
  if (
    !ph &&
    plan.attachLft &&
    (plan.attachLft.isCon?.() || plan.attachLft.nodeType === NODE_TYPES.CON)
  ) {
    try {
      const kids = liveChildrenForPresent(wm, plan.attachLft) || plan.attachLft.childNodes || [];
      const picked = pickLayoutPlaceholder(kids, want);
      if (accept(picked)) ph = picked;
    } catch (_e) {
      /* */
    }
  }
  if (!ph) {
    const parent = liveParentForPresent(wm, winNode) || winNode.parentNode;
    const sibs = parent ? liveChildrenForPresent(wm, parent) || parent.childNodes || [] : [];
    const picked = pickLayoutPlaceholder(sibs, want);
    if (accept(picked)) ph = picked;
    else ph = findSiblingLayoutPlaceholder(winNode, want, wm);
  }
  if (!ph) {
    // Forest+liveById — GObject mon walk misses parentNode=null PHs (R049b).
    // Same slot names exist on every workspace; do not bind a foreign-desk PH.
    const picked = pickPlaceDeskPlaceholder(wm, want, planHome, planWs);
    if (accept(picked)) ph = picked;
  }
  if (!ph || !isPlaceholderNode(ph)) return false;
  if (hasWant && !layoutPlaceholderMatchesWant(ph, want)) return false;

  if (forestBindWindow(wm, winNode, ph)) {
    Logger.info(
      `place-hint leftover-ph bind class=${metaWmClass(winNode.nodeValue)} ` +
        `ph=${ph.nodeValue?.title || ph.layoutRole || "?"}`
    );
    return true;
  }
  const removed = wm.removePlaceholder(ph);
  if (removed?.ok) {
    Logger.info(
      `place-hint leftover-ph remove class=${metaWmClass(winNode.nodeValue)} ` +
        `ph=${ph.nodeValue?.title || ph.layoutRole || "?"}`
    );
    return true;
  }
  return false;
}

/**
 * Reparent + sticky mon after late PlaceNext match.
 * Tree ops only from notify path; Meta move_to_monitor is idle-deferred (R036 SEGV).
 * @param {Meta.Window} metaWindow
 * @param {{ homeMonitor: number, attachLft?: any, fromPlaceHint?: boolean }} plan
 * @returns {boolean}
 */
export function applyPlacePlanToExistingWindow(wm, metaWindow, plan) {
  if (!metaWindow || !plan?.fromPlaceHint) return false;
  if (metaWindow._forgeLatePlaceAdoptBusy) return false;
  const node = wm.findNodeWindow(metaWindow);
  if (!node || isPlaceholderNode(node)) return false;

  metaWindow._forgeLatePlaceAdoptBusy = true;
  try {
    const homeMonitor = plan.homeMonitor >= 0 ? plan.homeMonitor : 0;
    // ApplyLayout / PlaceNext target workspace (not Meta's current desk).
    wm._ensureMetaOnWorkspace(metaWindow, plan.workspace);
    // Sticky grace only — never sync move_to_monitor from title/wm-class notify.
    wm._applyOpenStickyHome(metaWindow, homeMonitor, { move: false });

    if (placeDeskMatches(wm, node, homeMonitor, plan.workspace)) {
      Logger.info(
        `place-hint late apply already-on-desk mon=${homeMonitor} ` +
          `ws=${plan.workspace ?? "-"} class=${metaWmClass(metaWindow)}`
      );
      wm._consumeLeftoverLayoutPlaceholder(node, plan);
      const winId =
        typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(Date.now());
      wm._scheduleLatePlaceHintMeta(metaWindow, homeMonitor, winId);
      return true;
    }

    let attachTarget = null;
    let placeBefore = null;
    if (plan.attachLft) {
      const pin =
        plan.attachLft.nodeValue != null
          ? wm.findNodeWindow(plan.attachLft.nodeValue) || plan.attachLft
          : plan.attachLft;
      if (pin) {
        if (pin.isWindow?.() || pin.nodeType === NODE_TYPES.WINDOW) {
          attachTarget = liveParentForPresent(wm, pin) || pin.parentNode;
          placeBefore = pin;
        } else if (pin.isCon?.() || pin.isMonitor?.()) {
          attachTarget = pin;
        }
      }
    }
    let ws =
      plan.workspace != null && Number.isFinite(Number(plan.workspace))
        ? Math.floor(Number(plan.workspace))
        : null;
    if (ws == null) {
      try {
        ws = metaWindow.get_workspace?.()?.index?.() ?? 0;
      } catch (_e) {
        ws = 0;
      }
    }
    const destMon = wm.tree.findNode(Utils.createMonitorWorkspaceId(homeMonitor, ws)) || null;
    if (!attachTarget) attachTarget = destMon;
    // Mon-root after stale shared PH id — rescue role PH / slot bag (R049b).
    {
      const attachIsMon =
        !attachTarget ||
        attachTarget === destMon ||
        attachTarget.isMonitor?.() ||
        attachTarget.nodeType === NODE_TYPES.MONITOR;
      if (attachIsMon && plan.placeHint) {
        const rescued = wm._resolvePlaceSlotAttachFromHint(plan.placeHint, homeMonitor);
        if (rescued?.attachLft) {
          const pin = rescued.attachLft;
          if (pin.isWindow?.() || pin.nodeType === NODE_TYPES.WINDOW) {
            attachTarget = liveParentForPresent(wm, pin) || pin.parentNode || attachTarget;
            placeBefore = pin;
          } else if (pin.isCon?.() || pin.isMonitor?.() || pin.nodeType === NODE_TYPES.CON) {
            attachTarget = pin;
            placeBefore = null;
          }
          Logger.info(
            `place-hint slot-join rescue via=${rescued.via} ` +
              `role=${plan.placeHint.layoutRole || "-"} slot=${plan.placeHint.layoutSlot || "-"}`
          );
        }
      }
    }
    if (!attachTarget) {
      Logger.warn(`place-hint late apply no attach target mon=${homeMonitor}`);
      return false;
    }

    const winId =
      typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(Date.now());
    let metaMonBefore = "?";
    try {
      metaMonBefore = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : "?";
    } catch (_e) {
      /* */
    }
    // Late identity: re-run float policy (null-class often floated at map).
    const decision = wm._ensureTiledForSlotPlace(metaWindow, node) || {
      action: "?",
      reason: "?",
    };
    Logger.debug(
      `place-hint late state id=${winId} class=${metaWmClass(metaWindow)} ` +
        `wantMon=${homeMonitor} metaMon=${metaMonBefore} treeMon=${wm._monitorIndexOfNode(node)} ` +
        `mode=${node.mode || "?"} floatAction=${decision.action} floatReason=${decision.reason}`
    );
    if (HUNT_TILE_SLOT_FLOAT) {
      huntTileSlotFloat("place-hint-adopt", {
        id: winId,
        class: metaWmClass(metaWindow),
        wantMon: homeMonitor,
        metaMon: metaMonBefore,
        treeMon: wm._monitorIndexOfNode(node),
        mode: node.mode || "?",
        float: `${decision.action}/${decision.reason}`,
        flags: decision.flags || {},
        flagsTag: formatFloatFlagTags(decision.flags || {}),
      });
    }

    const underAttach = wm._liveIsUnderAttach(attachTarget, node);
    const destPhLive =
      placeBefore && isPlaceholderNode(placeBefore) && forestIdFromLive(wm, placeBefore);
    // Map bind already consumed the dest PH; a stale attachLft PH must not
    // force reparent (that emptied WS2 after a good mo0ws1 bind).
    const alreadyInSlot =
      underAttach && placeDeskMatches(wm, node, homeMonitor, plan.workspace) && !destPhLive;

    if (alreadyInSlot) {
      Logger.info(
        `place-hint late apply already-in-slot mon=${homeMonitor} ` +
          `class=${metaWmClass(metaWindow)}`
      );
      // Still consume leftover layout PH sibling (R045).
      wm._consumeLeftoverLayoutPlaceholder(node, plan);
      // Tree slot OK is not Meta TILE/mon — still idle-correct.
      wm._scheduleLatePlaceHintMeta(metaWindow, homeMonitor, winId);
      return true;
    }

    const fromMon = wm._monitorIndexOfNode(node);
    wm._suppressRehome.enter();
    try {
      const placeParent = placeBefore
        ? liveParentForPresent(wm, placeBefore) || placeBefore.parentNode
        : null;
      if (placeBefore && placeParent === attachTarget) {
        if (isPlaceholderNode(placeBefore) && forestBindWindow(wm, node, placeBefore)) {
          /* Forest bind + paint */
        } else {
          const nodeParent = liveParentForPresent(wm, node) || node.parentNode;
          if (nodeParent !== attachTarget || node.nextSibling !== placeBefore) {
            if (
              !forestReparent(wm, node, placeBefore, {
                destIsWindow: true,
                position: "before",
              })
            ) {
              if (wm._liveForestSeeded) recordFallback("place-hint", "ids-miss");
              else attachTarget.insertBefore(node, placeBefore);
            }
          }
          if (isPlaceholderNode(placeBefore) && !wm._liveForestSeeded) {
            try {
              wm.tree.removeNode?.(placeBefore);
            } catch (_e) {
              /* PH may already be gone */
            }
          }
        }
      } else if (!wm._liveIsUnderAttach(attachTarget, node)) {
        // Slot attach first — destMon-only rehome leaves MONITOR siblings (R049).
        if (attachTarget) {
          if (!forestReparent(wm, node, attachTarget)) {
            const attachIsMon =
              attachTarget === destMon ||
              attachTarget.isMonitor?.() ||
              attachTarget.nodeType === NODE_TYPES.MONITOR;
            if (attachIsMon && destMon) {
              wm._rehomeWindowPreservingContainer(node, metaWindow, destMon);
            } else if (wm._liveForestSeeded) {
              recordFallback("place-hint", "ids-miss");
            } else if (typeof attachTarget.appendChild === "function") {
              attachTarget.appendChild(node);
            }
          }
        } else if (destMon && !wm._liveIsUnderAttach(destMon, node)) {
          wm._rehomeWindowPreservingContainer(node, metaWindow, destMon);
        }
      }

      wm._consumeLeftoverLayoutPlaceholder(node, plan);

      try {
        const liveParent = liveParentForPresent(wm, node) || node.parentNode;
        wm._resetSiblingPercent(liveParent);
      } catch (_e) {
        /* */
      }

      Logger.info(
        `place-hint late apply tree mon ${fromMon}→${homeMonitor} id=${winId} ` +
          `class=${metaWmClass(metaWindow)} title=${JSON.stringify(metaTitle(metaWindow))}`
      );

      wm._scheduleLatePlaceHintMeta(metaWindow, homeMonitor, winId);
      return (
        wm._monitorIndexOfNode(node) === homeMonitor ||
        wm._liveIsUnderAttach(attachTarget, node) ||
        wm._liveIsUnderAttach(destMon, node)
      );
    } finally {
      wm._suppressRehome.leave();
    }
  } catch (e) {
    Logger.warn(`place-hint late adopt failed: ${e?.message || e}`);
    return false;
  } finally {
    try {
      delete metaWindow._forgeLatePlaceAdoptBusy;
    } catch (_e) {
      metaWindow._forgeLatePlaceAdoptBusy = false;
    }
  }
}

/**
 * Idle Meta mon + render after late PlaceNext (never sync from notify).
 * @param {Meta.Window} metaWindow
 * @param {number} homeMonitor
 * @param {string|number} winId
 * @param {number} [attempt]
 */
export function scheduleLatePlaceHintMeta(wm, metaWindow, homeMonitor, winId, attempt = 0) {
  if (!metaWindow || !wm._wmSources?.set) return;
  const n = Math.max(0, Number(attempt) || 0);
  const delayMs = n === 0 ? 50 : 80;
  wm._wmSources.set(`latePlaceHintApply:${winId}`, delayMs, () => {
    const suppress = !!wm._suppressRehome?.active;
    let metaMon = "?";
    try {
      metaMon = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : "?";
    } catch (_e) {
      /* */
    }
    if (suppress) {
      Logger.debug(
        `place-hint late idle defer suppress id=${winId} attempt=${n} wantMon=${homeMonitor} metaMon=${metaMon}`
      );
      if (HUNT_TILE_SLOT_FLOAT) {
        huntTileSlotFloat("place-hint-idle-defer", {
          id: winId,
          reason: "suppress",
          attempt: n,
          wantMon: homeMonitor,
          metaMon,
        });
      }
      if (n < 4) wm._scheduleLatePlaceHintMeta(metaWindow, homeMonitor, winId, n + 1);
      return;
    }
    try {
      wm._ensureTiledForSlotPlace(metaWindow);
      if (
        typeof metaWindow.get_monitor === "function" &&
        metaWindow.get_monitor() !== homeMonitor
      ) {
        const moved = safeMoveToMonitor(metaWindow, homeMonitor, "late place-hint idle");
        Logger.info(`place-hint late idle move mon→${homeMonitor} ok=${moved} id=${winId}`);
        if (HUNT_TILE_SLOT_FLOAT) {
          let after = "?";
          try {
            after = metaWindow.get_monitor();
          } catch (_e) {
            /* */
          }
          huntTileSlotFloat("place-hint-idle-move", {
            id: winId,
            wantMon: homeMonitor,
            before: metaMon,
            after,
            ok: moved,
          });
        }
      } else {
        Logger.debug(
          `place-hint late idle skip already-mon id=${winId} mon=${metaMon} want=${homeMonitor}`
        );
        if (HUNT_TILE_SLOT_FLOAT) {
          huntTileSlotFloat("place-hint-idle-skip", {
            id: winId,
            reason: "already-mon",
            mon: metaMon,
            want: homeMonitor,
          });
        }
      }
      wm.renderTree("late-place-hint");
      if (HUNT_TILE_SLOT_FLOAT) {
        const n2 = wm.findNodeWindow(metaWindow);
        const d2 = n2 ? wm._processFloatDecision(n2, metaWindow) : null;
        let metaAfter = metaMon;
        try {
          metaAfter =
            typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : metaMon;
        } catch (_e) {
          /* */
        }
        huntTileSlotFloat("place-hint-idle-after-render", {
          id: winId,
          mode: n2?.mode || "?",
          metaMon: metaAfter,
          treeMon: n2 ? wm._monitorIndexOfNode(n2) : "?",
          float: d2 ? `${d2.action}/${d2.reason}` : "?",
          flags: d2?.flags || {},
          flagsTag: d2 ? formatFloatFlagTags(d2.flags || {}) : "-",
        });
      }
    } catch (e) {
      Logger.warn(`place-hint late idle failed: ${e?.message || e}`);
    }
  });
}

/**
 * @param {string} selector
 * @param {boolean} first
 * @returns {any|null}
 */
export function resolvePlaceAttachSelector(wm, selector, first) {
  try {
    let descriptor = parseSelector(selector);
    if (first) descriptor = { ...descriptor, first: true };
    const forest =
      typeof wm.tree?.getNodeByType === "function"
        ? wm.tree.getNodeByType(NODE_TYPES.MONITOR) || []
        : [];
    if (!forest.length) return null;
    const ctx = wm._placeSelectCtx();
    let matches;
    if (descriptor.kind === "path") {
      matches = matchNodes(forest, descriptor, ctx).matches;
    } else {
      matches = matchWindows(forest, descriptor, ctx).matches;
    }
    const picked = pickMatch(matches, { first: !!descriptor.first });
    return picked.ok ? picked.match.node : null;
  } catch (e) {
    Logger.debug(`place-hint attach resolve failed: ${e}`);
    return null;
  }
}

export function placeSelectCtx(wm) {
  return {
    getFocusWindow: () => {
      try {
        return wm.focusMetaWindow ?? null;
      } catch (_e) {
        return null;
      }
    },
    getLftNode: () => {
      try {
        return wm.lftMru?.globalHead?.() ?? null;
      } catch (_e) {
        return null;
      }
    },
    findNode: (val) => {
      try {
        return wm.tree?.findNode?.(val) ?? null;
      } catch (_e) {
        return null;
      }
    },
    liveMap: wm._monitorLiveMap,
    getActiveWorkspace: () => {
      try {
        return global.workspace_manager?.get_active_workspace_index?.() ?? null;
      } catch (_e) {
        return null;
      }
    },
  };
}

/**
 * Free-open mins: split if legal, else first same-mon tab that fits, else float.
 * PlaceNext pins skip this (caller). Env floor always supplies mins (D049).
 * @param {Meta.Window} metaWindow
 * @param {import('./tree.js').Node|null|undefined} lftNode
 * @returns {{ kind: "split" } | { kind: "tab", targetUnit: object } | { kind: "float" } | null}
 */
export function decideOpenMinPlacement(wm, metaWindow, lftNode) {
  if (!metaWindow || !lftNode) return null;
  const live = lftNode.nodeValue ? wm.findNodeWindow(lftNode.nodeValue) || lftNode : lftNode;
  if (!live) return null;
  const insertUnit = wm._resolveInsertUnit(live) || live;
  // Focus inside TABBED/STACKED → decide against the group CON (D032 wrap the
  // bag when split is legal). Always split-or-tab: tab-only here forced join
  // once mins are always known (D049 floor) and fought bag wrap / R031 unwind.
  // Mid-session overflow keeps tab-only via resolveTileOverflowPlacement.
  const liveParent = wm._membershipParentLive(live) || live.parentNode;
  const inTab = isTabOrStackParent(liveParent, LAYOUT_TYPES);
  const lftIsBag = !!(live.isStackedOrTabbed?.() || live.isTabbed?.() || live.isStacked?.());
  // WINDOW in a bag: insert as next sibling (never wrap the bag; no 10% floor).
  // Selected TAB/STACK CON still split-or-tab wraps the bag.
  if (inTab && !lftIsBag) {
    Logger.trace(`open-min kind=tab-insert inTab=true`);
    return { kind: "split" };
  }
  const startUnit = inTab
    ? tabJoinUnit(live, LAYOUT_TYPES, wm) || insertUnit
    : tabJoinUnit(insertUnit, LAYOUT_TYPES, wm) || insertUnit;
  const mon =
    wm._monitorLiveOfNode(startUnit) ||
    (typeof wm.tree.findParent === "function"
      ? wm.tree.findParent(startUnit, NODE_TYPES.MONITOR)
      : null);
  const candidates = bfsOpenMinTabCandidates(startUnit, mon, LAYOUT_TYPES, wm);
  const orientation =
    wm._orientationFromUnit(insertUnit) === ORIENTATION_TYPES.VERTICAL ? "vertical" : "horizontal";
  const decision = resolveOpenMinPlacement({
    lftUnit: startUnit,
    newMins: readWindowMinSize(metaWindow),
    orientation,
    mode: "split-or-tab",
    slotRectFor: (u) => wm._slotRectForUnit(u),
    candidates,
  });
  Logger.trace(
    `open-min kind=${decision?.kind || "?"} orient=${orientation} cands=${candidates.length} ` +
      `inTab=${inTab}`
  );
  return decision;
}

/**
 * Ensure target is (or sits in) a TABBED CON for open-min tab join.
 * @param {import('./tree.js').Node|null|undefined} unit
 * @returns {import('./tree.js').Node|null}
 */
export function ensureTabbedForOpen(wm, unit) {
  if (!unit) return null;
  const live = unit.nodeValue ? wm.findNodeWindow(unit.nodeValue) || unit : unit;
  if (!live) return null;
  if (live.isStackedOrTabbed?.()) return live;
  const liveParent = wm._membershipParentLive(live) || live.parentNode;
  if (isTabOrStackParent(liveParent, LAYOUT_TYPES)) return liveParent;

  let leaf = live;
  const leafKids = liveChildrenForPresent(wm, leaf);
  if (!leaf.isWindow?.() && wm._isHvCon(leaf) && leafKids.length === 1) {
    const only = leafKids[0];
    if (only?.isWindow?.()) leaf = only;
  }
  if (!leaf?.isWindow?.()) return null;
  const leafParent = wm._membershipParentLive(leaf) || leaf.parentNode;
  if (isTabOrStackParent(leafParent, LAYOUT_TYPES)) return leafParent;

  const orientation = wm._orientationFromUnit(leaf);
  const forestWrap = forestWrapForTabStack(wm, leaf, LAYOUT_TYPES.TABBED);
  if (forestWrap) return forestWrap;
  if (wm._liveForestSeeded) {
    recordFallback("ensureTabbed", "ids-miss");
    return leafParent;
  }
  const tabCon = wm.tree.split(leaf, orientation, true);
  if (tabCon) {
    tabCon.layout = LAYOUT_TYPES.TABBED;
    tabCon.lastTabFocus = leaf.nodeValue;
  }
  return tabCon || leafParent;
}

/**
 * Aspect-split LFT when auto-split is on and LFT is not in a tab/stack group.
 * Uses LFT unit slot (OP1), not the pointer focus window.
 * OP-opt: optional tiny-pane → TABBED instead of H/V split.
 * @param {import('./tree.js').Node|null} lftNode
 */
export function maybeAspectSplitForOpen(wm, lftNode) {
  if (assertionFailed()) return;
  if (!lftNode || !wm.ext.settings.get_boolean("auto-split-enabled")) return;
  const live = lftNode.nodeValue ? wm.findNodeWindow(lftNode.nodeValue) : lftNode;
  const parent = live ? wm._membershipParentLive(live) || live.parentNode : null;
  if (!live || !parent) return;
  // PlaceNext may attach to CON/MONITOR — only split real windows.
  if (
    typeof live.isWindow === "function" ? !live.isWindow() : live.nodeType !== NODE_TYPES.WINDOW
  ) {
    return;
  }
  if (isTabOrStackParent(parent, LAYOUT_TYPES)) return;
  if (live.isFloat?.()) return;

  const meta = live.nodeValue;
  const rect = wm._slotRectForUnit(live);
  const orientation = wm._orientationFromUnit(live);
  const orientationStr = orientation === ORIENTATION_TYPES.VERTICAL ? "vertical" : "horizontal";

  const workareaMinEdge = wm._workareaMinEdgeForNode(live);
  const mins = readWindowMinSize(meta);
  const useTab =
    wm.ext.settings.get_boolean("tabbed-tiling-mode-enabled") &&
    shouldTabInsteadOfSplit({
      lftWidth: rect?.width ?? 0,
      lftHeight: rect?.height ?? 0,
      workareaMinEdge,
      minEdgePx: wm.ext.settings.get_uint("tiny-pane-min-edge"),
      appMinW: mins.width,
      appMinH: mins.height,
      enabled: wm.ext.settings.get_boolean("tiny-pane-tab-fallback-enabled"),
      orientation: orientationStr,
    });

  if (useTab) {
    Logger.trace(`aspect-split branch=tiny-pane-tab orient=${orientationStr}`);
    if (forestWrapForTabStack(wm, live, LAYOUT_TYPES.TABBED)) return;
    if (wm._liveForestSeeded) {
      recordFallback("aspect-split-tab", "ids-miss");
      return;
    }
    const tabCon = wm.tree.split(live, orientation, true);
    if (tabCon) {
      tabCon.layout = LAYOUT_TYPES.TABBED;
      tabCon.lastTabFocus = meta;
    }
    return;
  }

  // 1-child H/V toggle only. 2+ siblings are slotSplitForInsert (D032).
  if (liveChildrenForPresent(wm, parent).length !== 1) return;
  Logger.trace(`aspect-split branch=hv-toggle orient=${orientationStr}`);
  const toggleLay = wm._layoutFromOrientation(orientation);
  if (!forestSetLayout(wm, parent, toggleLay)) {
    if (wm._liveForestSeeded) recordFallback("aspect-split", "ids-miss");
    else wm.tree.split(live, orientation);
  }
}

/**
 * Map-time class/title missing — float-exempt until notify, but D032
 * still wraps so processFloats tiles in the slot (R028).
 * @param {Meta.Window|null|undefined} metaWindow
 * @returns {boolean}
 */
export function unknownOpenIdentity(wm, metaWindow) {
  if (!metaWindow) return false;
  let wmClass = null;
  let title = null;
  try {
    wmClass = metaWindow.get_wm_class?.() ?? null;
  } catch (_e) {
    wmClass = null;
  }
  try {
    title = metaWindow.get_title?.() ?? null;
  } catch (_e) {
    title = null;
  }
  return wmClass == null || title == null || title === "";
}

/**
 * Launch slot: selected WINDOW or CON (D077). A WINDOW inside TABBED/STACKED
 * stays the slot so Launch inserts a bag sibling (mark2.md). The bag CON is
 * the slot only when that CON itself is selected (focus.parent).
 * @param {import('./tree.js').Node|null|undefined} node
 * @returns {import('./tree.js').Node|null}
 */
export function resolveInsertUnit(wm, node) {
  if (!node) return null;
  const live =
    node.nodeType != null ? node : node.nodeValue ? wm.findNodeWindow(node.nodeValue) : null;
  if (!live) return null;
  if (live.isStackedOrTabbed?.()) return live;
  const parent0 = wm._membershipParentLive(live) || live.parentNode;
  if (isTabOrStackParent(parent0, LAYOUT_TYPES)) return live;
  let unit = live;
  for (let i = 0; i < 8; i++) {
    const parent = wm._membershipParentLive(unit) || unit.parentNode;
    if (!parent) break;
    if (!wm._isHvCon(parent) || liveChildrenForPresent(wm, parent).length !== 1) break;
    unit = parent;
  }
  return unit;
}

/** 1-child H/V CON already occupies the slot — join it, do not wrap again. */
export function hvSlotToJoin(wm, unit) {
  if (!wm._isHvCon(unit)) return null;
  if (liveChildrenForPresent(wm, unit).length !== 1) return null;
  return unit;
}

/**
 * D032: wrap the insert unit when its H/V parent already has siblings.
 * Pass the resolved unit (bag or leaf). Do not re-walk after a tiny-pane wrap.
 * @param {import('./tree.js').Node|null|undefined} unit
 * @returns {import('./tree.js').Node|null}
 */
export function slotSplitForInsert(wm, unit) {
  if (assertionFailed()) return null;
  if (!unit) return null;
  const parent = wm._membershipParentLive(unit) || unit.parentNode;
  assert(!!parent, "launch-insert-parent", {
    slot: typeof unit.nodeValue === "string" ? unit.nodeValue : unit.nodeType,
  });
  if (!parent) return null;
  if (isTabOrStackParent(parent, LAYOUT_TYPES)) {
    Logger.trace("slotSplit skip tab-stack parent");
    return parent;
  }
  const orient = wm._orientationFromUnit(unit);
  Logger.trace(`slotSplit orient=${orient} type=${unit.nodeType || "-"}`);
  const parentKids = liveChildrenForPresent(wm, parent);
  if (parent && (parent.isHSplit?.() || parent.isVSplit?.()) && parentKids.length >= 2) {
    const layout = wm._layoutFromOrientation(orient);
    const wrap = forestWrapNode(wm, unit, layout);
    if (wrap) return wrap;
    if (forestSlotSplit(wm, unit, orient)) {
      return wm._membershipParentLive(unit) || unit.parentNode;
    }
    if (wm._liveForestSeeded) {
      recordFallback("slotSplit", "ids-miss");
      return null;
    }
  } else if (wm._liveForestSeeded) {
    if (forestSplit(wm, unit, orient, { force: true })) {
      return wm._membershipParentLive(unit) || unit.parentNode;
    }
    recordFallback("slotSplit", "ids-miss");
    return null;
  }
  return wm.tree.slotSplitUnit(unit, orient);
}

/**
 * Late-identity / unfloat: join the remembered insert unit (R028) without
 * leaving a reserved TILE for windows that stay FLOAT (R031).
 * Applies free-open mins (tab / float) — map-time null identity skips open-min.
 * @param {import('./tree.js').Node|null|undefined} nodeWindow
 */
export function adoptOpenIntoTileSlot(wm, nodeWindow) {
  if (assertionFailed()) return;
  if (!nodeWindow) return;
  const nodeParent = wm._membershipParentLive(nodeWindow) || nodeWindow.parentNode;
  if (!nodeParent && !nodeWindow._tileInsertUnit) return;
  const unit = nodeWindow._tileInsertUnit;
  delete nodeWindow._tileInsertUnit;
  const meta = nodeWindow.nodeValue;
  const unitParent = unit ? wm._membershipParentLive(unit) || unit.parentNode : null;
  let liveUnit =
    unit && unitParent && unit !== nodeWindow
      ? unit.nodeValue
        ? wm.findNodeWindow(unit.nodeValue) || unit
        : unit
      : null;
  const liveUnitParent = liveUnit
    ? wm._membershipParentLive(liveUnit) || liveUnit.parentNode
    : null;
  if (liveUnit && meta) {
    let metaWs = -1;
    try {
      const wso = meta.get_workspace?.();
      if (wso && typeof wso.index === "function") metaWs = Number(wso.index());
    } catch (_e) {
      metaWs = -1;
    }
    const unitMon =
      wm._monitorLiveOfNode?.(liveUnit) ||
      (typeof wm.tree?.findParent === "function"
        ? wm.tree.findParent(liveUnit, NODE_TYPES.MONITOR)
        : null);
    const unitWs = Utils.workspaceIndex(unitMon?.nodeValue);
    if (metaWs >= 0 && unitWs >= 0 && unitWs !== metaWs) {
      liveUnit = null;
    }
  }
  const alreadySlotted =
    !!liveUnit &&
    (nodeParent === liveUnit || (nodeParent === liveUnitParent && wm._isHvCon(liveUnitParent)));
  if (liveUnit && !alreadySlotted) {
    // Same open-min as trackWindow free-open (null map skipped willTile path).
    const minDecision = meta ? wm._decideOpenMinPlacement(meta, liveUnit) : null;
    Logger.debug?.(`adopt-open-min kind=${minDecision?.kind || "split"}`);
    if (minDecision?.kind === "float") {
      try {
        if (meta) wm.addFloatOverride(meta, true);
      } catch (_e) {
        /* best-effort */
      }
      nodeWindow.float = true;
      wm.lftMru?.remove?.(nodeWindow);
      if (wm.forest && wm._liveForestSeeded) {
        forestSetWindowFloating(wm, nodeWindow, true);
      } else {
        const mon =
          typeof wm.tree.findParent === "function"
            ? wm.tree.findParent(nodeWindow, NODE_TYPES.MONITOR)
            : null;
        if (mon && nodeWindow.parentNode !== mon) mon.appendChild(nodeWindow);
      }
      return;
    }
    if (minDecision?.kind === "tab" && minDecision.targetUnit) {
      const tabCon = wm._ensureTabbedForOpen(minDecision.targetUnit);
      if (tabCon?.isStackedOrTabbed?.()) {
        if (nodeParent !== tabCon) {
          if (!forestReparent(wm, nodeWindow, tabCon)) {
            if (wm._liveForestSeeded) recordFallback("adopt-open", "ids-miss");
            else tabCon.appendChild(nodeWindow);
          }
        }
        const afterParent = wm._membershipParentLive(nodeWindow) || nodeWindow.parentNode;
        if (!(nodeWindow.percent > 0) && afterParent) {
          try {
            wm._insertChildPercent(afterParent, nodeWindow);
          } catch (_e) {
            /* best-effort share */
          }
        }
        return;
      }
    }
    const leftoverSlot = wm._hvSlotToJoin(liveUnit);
    if (leftoverSlot) {
      const leftoverLay = wm._layoutFromOrientation(wm._orientationFromUnit(leftoverSlot));
      if (!forestSetLayout(wm, leftoverSlot, leftoverLay)) {
        if (wm._liveForestSeeded) recordFallback("setLayout", "ids-miss");
        else leftoverSlot.layout = leftoverLay;
      }
      if (nodeParent !== leftoverSlot) {
        if (!forestReparent(wm, nodeWindow, leftoverSlot)) {
          if (wm._liveForestSeeded) recordFallback("adopt-open", "ids-miss");
          else leftoverSlot.appendChild(nodeWindow);
        }
      }
    } else {
      wm.slotSplitForInsert(liveUnit);
      const dest = wm._membershipParentLive(liveUnit) || liveUnit.parentNode;
      if (dest && nodeParent !== dest) {
        if (!forestReparent(wm, nodeWindow, dest)) {
          if (wm._liveForestSeeded) recordFallback("adopt-open", "ids-miss");
          else dest.appendChild(nodeWindow);
        }
      }
    }
  }
  const percentParent = wm._membershipParentLive(nodeWindow) || nodeWindow.parentNode;
  if (!(nodeWindow.percent > 0) && percentParent) {
    wm._insertChildPercent(percentParent, nodeWindow);
  }
}

/**
 * Mark a short sticky grace so map-time mon thrash cannot rehome the open.
 * Optionally force Meta onto the planned mon (dock / deferred PlaceNext).
 * @param {Meta.Window} metaWindow
 * @param {number} monitorIndex
 * @param {{ move?: boolean }} [opts]
 */
export function applyOpenStickyHome(wm, metaWindow, monitorIndex, opts = {}) {
  if (!metaWindow || monitorIndex < 0) return;
  metaWindow._forgeDockStickyMon = monitorIndex;
  metaWindow._forgeDockStickyUntil = Date.now() + DOCK_STICKY_GRACE_MS;
  if (opts.move) {
    safeMoveToMonitor(metaWindow, monitorIndex, "open sticky move_to_monitor");
  }
}

/** @deprecated use _applyOpenStickyHome */
export function applyDockStickyHome(wm, metaWindow, monitorIndex) {
  wm._applyOpenStickyHome(metaWindow, monitorIndex, { move: true });
}

/**
 * TILE WINDOWs under a live via Forest kids (GObject lists miss detached).
 * @param {object|null|undefined} root
 * @returns {object[]}
 */
export function windowsUnderLive(wm, root) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n !== root && (n.isWindow?.() || n.nodeType === NODE_TYPES.WINDOW)) out.push(n);
    for (const c of liveChildrenForPresent(wm, n)) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Live MONITOR for a dest id. Invent empty dest; do not pick a same-WS neighbor.
 * @param {{ id: string, mon: number, ws: number }} dest
 */
export function resolveDestMonitorLive(wm, dest) {
  if (!wm || !dest?.id) return null;
  const found = wm.tree?.findNode?.(dest.id);
  if (found && (found.isMonitor?.() || found.nodeType === NODE_TYPES.MONITOR)) {
    if (!found.nodeValue || found.nodeValue === dest.id) return found;
  }
  const live = wm.liveById?.get?.(dest.id);
  if (live && (live.isMonitor?.() || live.nodeType === NODE_TYPES.MONITOR)) return live;
  const admitted = forestAdmitMonitor(wm, dest.ws, dest.mon, { tree: wm.tree });
  return admitted?.live || null;
}

/**
 * Last tiled WINDOW under mon M (active workspace) — end-of-mon-tree attach.
 * Used when LFT(m) is empty after layout (no focus touch on that mon yet).
 * Same-WS neighbor / other-ws clones of this output do not count (D027/D112).
 * @param {number} monIndex
 * @returns {import('./tree.js').Node|null}
 */
export function lastTileOnMonitor(wm, monIndex) {
  if (monIndex == null || monIndex < 0 || !wm.tree) return null;
  let ws = 0;
  try {
    ws = global.display.get_workspace_manager().get_active_workspace_index();
  } catch (_e) {
    ws = 0;
  }
  const monId = Utils.createMonitorWorkspaceId?.(monIndex, ws);
  const monNode =
    (monId && wm.tree.findNode(monId)) || (monId && wm.liveById?.get?.(monId)) || null;
  if (monNode) {
    let last = null;
    const walkLive = (n) => {
      if (!n) return;
      if (n.isWindow?.() && n.isTile?.() && !n.isFloat?.()) {
        last = n;
      }
      const kids = liveChildrenForPresent(wm, n);
      for (const c of kids) walkLive(c);
    };
    walkLive(monNode);
    return last;
  }
  const tom = monId ? wm.forest?.nodes?.[monId] : null;
  if (!tom || tom.kind !== "MONITOR" || !(wm.liveById instanceof Map)) return null;
  let last = null;
  const visit = (tid) => {
    const n = wm.forest.nodes[tid];
    if (!n) return;
    if (n.kind === "WINDOW") {
      const live = wm.liveById.get(tid);
      if (live?.isWindow?.() && live.isTile?.() && !live.isFloat?.()) last = live;
    }
    for (const cid of n.childIds || []) visit(cid);
  };
  visit(monId);
  return last;
}

/**
 * Best-effort dock launch monitor for a new window.
 * Explicit metaWindow._forgeDockMonitor wins; else pending noteDockLaunch matches.
 * @param {Meta.Window} metaWindow
 * @returns {number} monitor index or -1
 */
export function detectDockLaunchMonitor(wm, metaWindow) {
  if (!metaWindow) return -1;
  if (typeof metaWindow._forgeDockMonitor === "number" && metaWindow._forgeDockMonitor >= 0) {
    return metaWindow._forgeDockMonitor;
  }

  let appId = metaWindow._forgeAppId || null;
  if (!appId) {
    try {
      const tracked = Shell.WindowTracker.get_default().get_window_app(metaWindow);
      appId = tracked?.get_id?.() || null;
    } catch (_e) {
      appId = null;
    }
  }

  const match = matchPendingDockLaunch(wm._pendingDockLaunches, { appId });
  if (!match) return -1;
  wm._pendingDockLaunches.splice(match.index, 1);
  Logger.debug(`dock-launch match mon=${match.monitor} appId=${appId || "-"}`);
  return match.monitor;
}

/**
 * Monitor under the pointer, or -1 if geometry is unknown.
 * Empty-head open must not invent mon 0 from a stale current-mon fallback.
 * @returns {number}
 */
export function pointerMonitorIndex(wm) {
  try {
    const ptr = typeof global.get_pointer === "function" ? global.get_pointer() : null;
    if (ptr && (Array.isArray(ptr) || typeof ptr.length === "number") && ptr.length >= 2) {
      const n = global.display?.get_n_monitors?.() ?? 0;
      if (n > 0 && typeof global.display.get_monitor_geometry === "function") {
        const geos = [];
        for (let i = 0; i < n; i++) {
          geos.push(global.display.get_monitor_geometry(i));
        }
        const idx = monitorIndexFromPoint(ptr[0], ptr[1], geos);
        if (idx >= 0) return idx;
      }
    }
  } catch (_e) {
    /* unknown */
  }
  return -1;
}

/**
 * Active-ws display heads with no TILE leaf. Missing Forest/GObject MONITOR
 * still counts (empty dest is physical); lastTile is per moNwsW (D027/D112).
 * @returns {number[]}
 */
export function emptyTileMonitorIndices(wm) {
  const out = [];
  let n = 0;
  try {
    n = global.display?.get_n_monitors?.() ?? 0;
  } catch (_e) {
    n = 0;
  }
  for (let i = 0; i < n; i++) {
    if (!wm._lastTileOnMonitor(i)) out.push(i);
  }
  return out;
}

/**
 * Resolve the node a brand-new window should attach under, within the active
 * monitor/workspace container (metaMonWsNode). Precedence (OP1):
 *   1. attach LFT (global or mon head) under this mon;
 *   2. tree.attachNode when it still resolves under this mon (aspect split CON);
 *   3. mon root.
 * Cross-monitor attachNode must not shadow attachLft (dock LFT(m) case).
 */
export function resolveAttachTarget(wm, metaMonWsNode, windowNodes, hasWindows, attachLft = null) {
  let attachTarget = null;
  const underMon = (n) => wm._liveIsUnderAttach(metaMonWsNode, n);

  if (attachLft) {
    const lftNode = attachLft.nodeValue ? wm.findNodeWindow(attachLft.nodeValue) : attachLft;
    if (lftNode && underMon(lftNode)) {
      attachTarget = lftNode;
    }
  }

  if (!attachTarget) {
    attachTarget = wm.tree.attachNode;
    attachTarget = attachTarget ? wm.findNodeWindow(attachTarget.nodeValue) : null;
    if (attachTarget && !underMon(attachTarget)) {
      attachTarget = null;
    }
  }

  // Legacy: lastFocusedWindow if it is a tile under this mon (may be float-poisoned —
  // only use when still a tile). Prefer LFT path above.
  if (!attachTarget && wm.lastFocusedWindow) {
    const lastFocusNode = wm.findNodeWindow(wm.lastFocusedWindow.nodeValue);
    if (lastFocusNode && lastFocusNode.isTile?.() && underMon(lastFocusNode)) {
      attachTarget = lastFocusNode;
    }
  }

  if (!attachTarget) return metaMonWsNode;
  if (!hasWindows) return metaMonWsNode;
  return underMon(attachTarget) ? attachTarget : windowNodes[0] || metaMonWsNode;
}
