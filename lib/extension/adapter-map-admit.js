/*
 * ForgeAdapterGnome — map → Forest admit → sticky → RESYNC → open-commit.
 * Placement policy (PlaceNext / open-min / LayoutBatch) stays on the WM orchestrator.
 */

import St from "gi://St";

import { Logger } from "../shared/logger.js";
import { assert, assertionFailed } from "../shared/assert.js";
import {
  ensureLiveForest,
  forestAdmitMetaWindow,
  forestBindWindow,
  forestEnsureSpineNode,
  forestIdFromLive,
  liveChildrenForPresent,
} from "./tom-live.js";
import { resyncWmToReality } from "./observe-reality.js";
import { isPlaceholderNode } from "./layout-placeholder.js";
import { shouldStickyMoveHomeMonitor } from "./layout-deferred-open.js";
import { metaTitle, metaWmClass } from "./place-hint.js";
import { sessionLayoutTrace } from "./session-layout-restore.js";
import { recordD100Observe, recordFallback } from "./metrics.js";
import { NODE_TYPES } from "./tree-types.js";

/**
 * After placement plan is known: invent WINDOW, bind chrome, sticky home,
 * RESYNC, schedule open-commit.
 *
 * @param {object} wm
 * @param {object} metaWindow
 * @param {{
 *   openPlan: object,
 *   willTile: boolean,
 *   deferHidden: boolean,
 *   placePinned: boolean,
 *   attachTarget: object,
 *   placeBefore?: object|null,
 *   metaMonWsNode: object,
 *   openMinFloat: boolean,
 *   insertUnit?: object|null,
 *   floatMode?: string,
 * }} ctx
 * @returns {{ nodeWindow: object, admitted: { id?: string, live?: object } }|null}
 */
export function mapAdmitWindow(wm, metaWindow, ctx) {
  const {
    openPlan,
    willTile,
    deferHidden,
    placePinned,
    attachTarget,
    metaMonWsNode,
    openMinFloat,
    insertUnit = null,
    floatMode = "FLOAT",
  } = ctx;
  let placeBefore = ctx.placeBefore ?? null;

  assert(!!attachTarget, "launch-insert-target", {
    ws: global.display.get_workspace_manager().get_active_workspace_index(),
    mon: metaMonWsNode?.nodeValue,
  });
  if (assertionFailed() || !attachTarget) return null;

  ensureLiveForest(wm);
  let admitParentLive = attachTarget;
  let admitBeforeLive = placeBefore;
  if (
    attachTarget &&
    (attachTarget.isWindow?.() || attachTarget.nodeType === NODE_TYPES.WINDOW)
  ) {
    admitParentLive =
      wm._membershipParentLive(attachTarget) || attachTarget.parentNode || metaMonWsNode;
    if (!admitBeforeLive) {
      const parent = admitParentLive;
      const kids = parent ? liveChildrenForPresent(wm, parent) : [];
      const i = kids.indexOf(attachTarget);
      admitBeforeLive =
        i >= 0 && i + 1 < kids.length ? kids[i + 1] : attachTarget.nextSibling || null;
    }
  }
  let parentId = forestIdFromLive(wm, admitParentLive);
  if (
    !parentId &&
    admitParentLive &&
    (admitParentLive.isMonitor?.() || admitParentLive.nodeType === NODE_TYPES.MONITOR)
  ) {
    parentId = forestEnsureSpineNode(wm, admitParentLive);
  }
  const beforeId = admitBeforeLive ? forestIdFromLive(wm, admitBeforeLive) : null;
  const monitorId =
    typeof metaMonWsNode?.nodeValue === "string" ? metaMonWsNode.nodeValue : null;
  const underFloats = !placePinned && (openMinFloat || !willTile);
  const admitted = forestAdmitMetaWindow(wm, metaWindow, {
    parentId: parentId || undefined,
    beforeId: beforeId || undefined,
    underFloats,
    monitorId,
    mode: floatMode,
  });
  let nodeWindow = admitted?.live || null;
  if (!nodeWindow) {
    sessionLayoutTrace(
      `layout-track: admit-fail class=${metaWindow.get_wm_class()} title=${JSON.stringify(
        metaWindow.get_title()
      )}`
    );
    return null;
  }

  if (
    !underFloats &&
    !wm._liveForestSeeded &&
    !nodeWindow.parentNode &&
    admitParentLive &&
    typeof admitParentLive.appendChild === "function"
  ) {
    sessionLayoutTrace(`layout-track: paint-orphan class=${metaWindow.get_wm_class()}`);
    try {
      admitParentLive.appendChild(nodeWindow);
    } catch (_e) {
      /* chrome attach best-effort */
    }
  }
  if (openMinFloat && nodeWindow) {
    try {
      wm.addFloatOverride(metaWindow, true);
    } catch (_e) {
      /* best-effort */
    }
    nodeWindow.float = true;
    wm.lftMru?.remove?.(nodeWindow);
    Logger.info?.(
      `open-min-float class=${metaWmClass(metaWindow)} title=${JSON.stringify(
        metaTitle(metaWindow)
      )}`
    );
  } else if (nodeWindow && insertUnit && insertUnit !== nodeWindow && !placePinned) {
    nodeWindow._tileInsertUnit = insertUnit;
  }

  metaWindow.firstRender = true;

  if (
    openPlan.homeMonitor >= 0 &&
    (openPlan.isDock || openPlan.isEmptyHead || openPlan.attachLft || openPlan.fromPlaceHint)
  ) {
    const stickyMove =
      openPlan.isDock ||
      openPlan.isEmptyHead ||
      (deferHidden && shouldStickyMoveHomeMonitor(openPlan.homeMonitor));
    if (openPlan.fromPlaceHint) {
      wm._ensureMetaOnWorkspace(metaWindow, openPlan.workspace);
      Logger.info(
        `place-hint map sticky mon=${openPlan.homeMonitor} move=${stickyMove} ` +
          `class=${metaWmClass(metaWindow)} title=${JSON.stringify(metaTitle(metaWindow))} ` +
          `attach=${openPlan.attachMode || "?"} provisional=${!!metaWindow._forgeProvisionalPlaceHint}` +
          (openPlan.workspace != null ? ` ws=${openPlan.workspace}` : "")
      );
    }
    wm._applyOpenStickyHome(metaWindow, openPlan.homeMonitor, {
      move: stickyMove,
    });
  }

  let windowActor = metaWindow.get_compositor_private();

  if (nodeWindow) {
    const t0 = metaWindow.get_title?.();
    nodeWindow._lastTitleEmpty = t0 == null || t0 === "" || t0.length === 0;
  }

  wm._bindWindowSignals(metaWindow, windowActor);

  if (!windowActor.border) {
    let border = new St.Bin({ style_class: "window-tiled-border" });
    if (global.window_group) global.window_group.add_child(border);
    windowActor.border = border;
    border.show();
  }
  {
    const bagId = admitted?.id || wm.hostBag?.idFromMeta?.(metaWindow);
    if (bagId && wm.hostBag && windowActor.border) {
      wm.hostBag.set(bagId, { border: windowActor.border });
    }
  }
  try {
    wm.decorationManager?.restackBorderForMeta?.(metaWindow);
  } catch (_e) {
    /* best-effort */
  }

  wm.postProcessWindow(nodeWindow);

  if (nodeWindow && placePinned) {
    if (placeBefore && isPlaceholderNode(placeBefore)) {
      if (!forestBindWindow(wm, nodeWindow, placeBefore)) {
        if (wm._liveForestSeeded) recordFallback("place-bind", "ids-miss");
        else {
          try {
            wm.tree.removeNode?.(placeBefore);
          } catch (_e) {
            /* PH may already be gone */
          }
        }
      }
      placeBefore = null;
    } else {
      wm._consumeLeftoverLayoutPlaceholder(nodeWindow, openPlan);
    }
  }

  wm.handleUnmaximizeForTiling(nodeWindow);

  if (willTile && !deferHidden && !openMinFloat) {
    wm._insertChildPercent(nodeWindow.parentNode, nodeWindow);
  }

  try {
    resyncWmToReality(wm, openPlan.isDock ? "dock-open" : "window-map", {
      skipSingletonSettle: wm.isApplyEpochLive?.(),
    });
  } catch (_e) {
    /* best-effort */
  }

  if (willTile && !deferHidden && !openMinFloat) {
    wm._scheduleOpenCommit(metaWindow, openPlan);
  } else if (deferHidden) {
    wm._markDeferredOpen(metaWindow, windowActor);
    wm._layoutBatch?.latchCommit();
  } else if (openMinFloat) {
    wm.renderTree?.("open-min-float");
  }

  let attachId = attachTarget?.nodeType || "?";
  try {
    const av = attachTarget?.nodeValue;
    if (typeof av === "string" || typeof av === "number") attachId = String(av);
    else if (av && typeof av.get_id === "function") attachId = `win:${av.get_id()}`;
    else if (attachTarget?.layoutSlot) attachId = String(attachTarget.layoutSlot);
  } catch (_e) {
    /* */
  }
  {
    const attachLine =
      `layout-track: attached class=${metaWindow.get_wm_class()} title=${JSON.stringify(
        metaWindow.get_title()
      )} dest=${metaMonWsNode.nodeValue} attach=${attachId} home=${openPlan.homeMonitor} ` +
      `placeHint=${!!placePinned} provisional=${!!metaWindow._forgeProvisionalPlaceHint} ` +
      `deferred=${!!deferHidden}`;
    if (placePinned || metaWindow._forgeProvisionalPlaceHint) {
      sessionLayoutTrace(attachLine);
    } else {
      Logger.trace(attachLine);
    }
    Logger.info("metric open", {
      fields: {
        home: openPlan.homeMonitor,
        dest: String(metaMonWsNode.nodeValue || ""),
        dock: !!openPlan.isDock,
        class: metaWindow.get_wm_class(),
      },
    });
  }

  return { nodeWindow, admitted };
}

/**
 * Late wm-class / title identity: promote FLOAT→TILE without reconnecting
 * idle maze handlers. Caller owns ignore drop + PlaceNext late-adopt.
 *
 * @param {object} wm
 * @param {object} metaWindow
 * @param {string} reason — d100-observe kind + commit suffix (`wm-class` / `title`)
 * @param {{ node?: object|null, titleEmptyFlip?: boolean }} [opts]
 * @returns {{ promoted: boolean }}
 */
export function onLateIdentity(wm, metaWindow, reason, opts = null) {
  if (!wm || !metaWindow) return { promoted: false };
  const kind = reason || "identity";
  recordD100Observe(kind);

  const node =
    opts?.node ||
    (typeof wm.findNodeWindow === "function" ? wm.findNodeWindow(metaWindow) : null);
  if (!node || isPlaceholderNode(node)) return { promoted: false };

  // Title: only empty↔nonempty flips float-exempt (D099 ordinary ticks = label).
  if (kind === "title") {
    const t = metaWindow.get_title?.();
    const empty = t == null || t === "" || t.length === 0;
    const prevEmpty = !!node._lastTitleEmpty;
    node._lastTitleEmpty = empty;
    const flip = opts?.titleEmptyFlip != null ? !!opts.titleEmptyFlip : prevEmpty !== empty;
    if (!flip) return { promoted: false };
  }

  const wasFloat =
    typeof node.isFloat === "function" ? node.isFloat() : node.mode === "FLOAT";
  if (!wasFloat || typeof wm._applyProcessFloatDecision !== "function") {
    return { promoted: false };
  }

  let decision = null;
  try {
    decision = wm._applyProcessFloatDecision(node, metaWindow);
  } catch (e) {
    Logger.warn?.(`onLateIdentity apply: ${e}`);
  }

  const stillFloat =
    typeof node.isFloat === "function" ? node.isFloat() : node.mode === "FLOAT";
  // Commit when classifier chose tile (even if adopt/open-min re-floats — present
  // must run after slotSplit). Skip only when still exempt-float.
  const wantTile = decision?.action === "tile" || (!stillFloat && decision?.action !== "float");
  if (!wantTile) return { promoted: false };

  try {
    wm.commitLayout?.(`${kind}-identity`);
  } catch (e) {
    Logger.warn?.(`onLateIdentity commit: ${e}`);
  }
  if (
    !stillFloat &&
    typeof wm._scheduleOpenCommit === "function" &&
    !wm._openCommitPending?.has?.(metaWindow)
  ) {
    try {
      wm._scheduleOpenCommit(metaWindow, { isDock: false });
    } catch (_e) {
      /* best-effort quiet path */
    }
  }
  return { promoted: !stillFloat };
}
