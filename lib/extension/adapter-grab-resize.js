/*
 * ForgeAdapterGnome — I3 owning-split / grab-resize percent path.
 */

import Meta from "gi://Meta";
import * as Utils from "./utils.js";
import { POSITION, ORIENTATION_TYPES } from "./tree-types.js";
import { liveChildrenForPresent } from "./tom-live.js";

// forge-zlg: golden-ratio reciprocal (1/φ). Focused window claims this share
// of its split pair; the pair gets the remainder (1 - GOLDEN).
const GOLDEN = 0.6180339887;

/**
 * Keyboard edge resize: synthetic grab begin → move frame → debounced grab end.
 * Percents land via handleResizing on size-changed.
 * @param {object} wm
 * @param {number} grabOp
 * @param {number} amount
 */
export function resize(wm, grabOp, amount) {
  let metaWindow = wm.focusMetaWindow;
  if (!metaWindow) return;
  let display = global.display;

  // forge-h6z9: the debounced grab-end is a single instance-wide timer. If a
  // pending end belongs to a DIFFERENT window than the one now focused (focus
  // drifted between two keyboard resizes), flush that window's grab first so
  // its node isn't left with grabMode/initRect stranded forever. The end-fire
  // path reads wm.focusMetaWindow, so clean the prior node directly here.
  if (wm._wmSources.has("manualResizeEnd") && wm._manualResizeEndWindow !== metaWindow) {
    wm._wmSources.cancel("manualResizeEnd");
    const priorNode = wm.findNodeWindow(wm._manualResizeEndWindow);
    if (priorNode) {
      wm.unfreezeRender();
      wm._grabCleanup(priorNode);
    }
    wm._manualResizeEndWindow = null;
  }

  wm._handleGrabOpBegin(display, metaWindow, grabOp);

  let rect = metaWindow.get_frame_rect();
  let direction = Utils.directionFromGrab(grabOp);

  switch (direction) {
    case Meta.MotionDirection.RIGHT:
      rect.width = rect.width + amount;
      break;
    case Meta.MotionDirection.LEFT:
      rect.width = rect.width + amount;
      rect.x = rect.x - amount;
      break;
    case Meta.MotionDirection.UP:
      // forge-74em: N/UP grows the TOP edge, so shift y up (mirror of LEFT).
      rect.height = rect.height + amount;
      rect.y = rect.y - amount;
      break;
    case Meta.MotionDirection.DOWN:
      // S/DOWN grows the BOTTOM edge, so y stays put (mirror of RIGHT).
      rect.height = rect.height + amount;
      break;
  }
  wm.move(metaWindow, rect, null, { skipOffscreenClamp: true });

  // Percents: grab → handleResizing → tree.resolveOwningSplit (I3).

  // Bug #532 (forge-5v6): on key auto-repeat each press calls resize() again.
  // Restart a single debounced grab-end instead of queueing one per press, so
  // the grab (and its frozen initRect) stays open for the whole hold and the
  // resize accumulates smoothly; the layout settles once the key is released.
  // forge-h6z9: remember which window the pending end belongs to so a later
  // cross-window resize can flush it (above), and a real pointer grab
  // beginning within the debounce can cancel it (see _handleGrabOpBegin).
  wm._manualResizeEndWindow = metaWindow;
  wm._wmSources.set("manualResizeEnd", 120, () => {
    wm._manualResizeEndWindow = null;
    wm._handleGrabOpEnd(display, metaWindow, grabOp);
  });
}

/**
 * Grow/shrink the focused tile on both axes (REG-expand-dual-axis).
 * Two owning-split steps — H then V. Missing axis is a no-op.
 * @param {object} wm
 * @param {number} amount - pixels to grow each affected edge by (negative shrinks).
 */
export function expand(wm, amount) {
  if (!amount) return;
  let focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
  if (!focusNodeWindow || !focusNodeWindow.isTile()) return;

  const unit = wm.tree.layoutUnit(focusNodeWindow);
  const changedH = applyOwningSplit(wm, unit, ORIENTATION_TYPES.HORIZONTAL, amount);
  const changedV = applyOwningSplit(wm, unit, ORIENTATION_TYPES.VERTICAL, amount);

  if (changedH || changedV) wm.commitLayout("window-expand", { force: true });
}

/** forge-gm0z: WindowShrink is WindowExpand with a negative amount. */
export function shrink(wm, amount) {
  expand(wm, -amount);
}

/**
 * I3: resolve owning split for `(unit, axis|edge)` and debit pair percents.
 * @param {object} wm
 * @param {object} unit
 * @param {string|number} axisOrEdge
 * @param {number} deltaPx
 * @param {{ direction?: string|number }} [opts]
 * @returns {boolean}
 */
export function applyOwningSplit(wm, unit, axisOrEdge, deltaPx, opts = {}) {
  const resolved = wm.tree.resolveOwningSplit(unit, axisOrEdge, opts);
  if (!resolved) return false;
  return adjustOwningSplitPercents(wm, resolved, deltaPx);
}

export function adjustOwningSplitPercents(wm, resolved, deltaPx) {
  const { target, pair, parent, axis } = resolved;
  const parentRect = parent.rect;
  if (!parentRect) return false;
  const parentSize = axis === ORIENTATION_TYPES.HORIZONTAL ? parentRect.width : parentRect.height;
  if (!parentSize || parentSize <= 0) return false;

  const delta = deltaPx / parentSize;
  target.percent = effectivePercent(target, axis, parentSize) + delta;
  pair.percent = effectivePercent(pair, axis, parentSize) - delta;
  target.userSized = true;
  pair.userSized = true;
  normalizeSiblingPercents(wm, parent);
  return true;
}

/**
 * Grow `node`'s layout unit on its parent axis via applyOwningSplit.
 * @returns {boolean}
 */
export function expandNodeAgainstPair(wm, node, deltaPx) {
  if (!node) return false;
  const unit = wm.tree.layoutUnit(node);
  const parent = unit?.parentNode;
  if (!parent) return false;
  const axis = Utils.orientationFromLayout(parent.layout);
  if (axis !== ORIENTATION_TYPES.HORIZONTAL && axis !== ORIENTATION_TYPES.VERTICAL) {
    return false;
  }
  return applyOwningSplit(wm, unit, axis, deltaPx);
}

/**
 * forge-gm0z: a node's share of its parent split. Prefer the stored percent;
 * fall back to its current rect proportion (as normalizeSiblingPercents does)
 * so expand works even before any manual resize has set an explicit percent.
 */
export function effectivePercent(node, orientation, parentSize) {
  if (node.percent && node.percent > 0) return node.percent;
  if (node.rect && parentSize > 0) {
    const size =
      orientation === ORIENTATION_TYPES.HORIZONTAL ? node.rect.width : node.rect.height;
    return size / parentSize;
  }
  return 0;
}

/**
 * forge-zlg: resize the focused tiled window to the golden-ratio share of its
 * split, on demand. Unlike expand()/shrink() (a pixel delta applied on both
 * axes), this sets an ABSOLUTE ratio on a SINGLE axis — golden ratio is a
 * statement about one split, and a two-axis pass would compound to ~0.382 in
 * nested layouts. No-op (no render) when there is no focused tiled window.
 */
export function applyGoldenRatio(wm) {
  let focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
  if (!focusNodeWindow || !focusNodeWindow.isTile()) return;
  if (goldenRatioAgainstPair(wm, focusNodeWindow)) {
    wm.commitLayout("window-golden-ratio", { force: true });
  }
}

/**
 * forge-zlg: give `node` the golden share of the space it shares with its split
 * pair, debiting the pair — mirroring expandNodeAgainstPair() (same guards and
 * pair-selection) but absolute instead of incremental. The pair is the next
 * tiled sibling, or the previous one when `node` is last, so the FOCUSED window
 * takes the larger (φ) share regardless of its position. Operating on the
 * pair's combined share (not the whole parent) leaves any other siblings in a
 * 3+ window split untouched. Returns true when a percent was changed.
 */
export function goldenRatioAgainstPair(wm, node) {
  const parent = node.parentNode;
  if (!parent || parent.isStackedOrTabbed()) return false;

  const tiled = wm.tree.getTiledChildren(liveChildrenForPresent(wm, parent));
  if (tiled.length <= 1) return false;

  const orientation = Utils.orientationFromLayout(parent.layout);
  const parentRect = parent.rect;
  if (!parentRect) return false;
  const parentSize =
    orientation === ORIENTATION_TYPES.HORIZONTAL ? parentRect.width : parentRect.height;
  if (!parentSize || parentSize <= 0) return false;

  const index = tiled.indexOf(node);
  if (index < 0) return false;
  const pair = index + 1 < tiled.length ? tiled[index + 1] : tiled[index - 1];
  if (!pair) return false;

  const combined =
    effectivePercent(node, orientation, parentSize) +
    effectivePercent(pair, orientation, parentSize);
  node.percent = combined * GOLDEN;
  pair.percent = combined * (1 - GOLDEN);
  node.userSized = true;
  pair.userSized = true;
  normalizeSiblingPercents(wm, parent);
  return true;
}

/**
 * Bug #305 fix: Normalize sibling percentages to ensure they sum to 1.0
 * This prevents resize drift when resizing windows with 3+ siblings.
 * @param {object} wm
 * @param {object} parentNode - The parent node containing children to normalize
 */
export function normalizeSiblingPercents(wm, parentNode) {
  if (!parentNode) return;

  // Skip STACKED/TABBED - they don't use percent-based layout (children overlap)
  // Initializing from rect would produce invalid percents (each child rect = full container)
  if (typeof parentNode.isStackedOrTabbed === "function" && parentNode.isStackedOrTabbed())
    return;

  const children = wm.tree.getTiledChildren(liveChildrenForPresent(wm, parentNode));
  if (children.length <= 1) return;

  // Get parent size for calculating proportions
  const orientation = Utils.orientationFromLayout(parentNode.layout);
  const parentSize =
    orientation === ORIENTATION_TYPES.HORIZONTAL
      ? parentNode.rect?.width
      : parentNode.rect?.height;

  // First pass: initialize uninitialized children based on current rect
  children.forEach((child) => {
    if (!child.percent || child.percent <= 0) {
      // Calculate percent from current rect if available
      if (child.rect && parentSize && parentSize > 0) {
        const childSize =
          orientation === ORIENTATION_TYPES.HORIZONTAL ? child.rect.width : child.rect.height;
        child.percent = childSize / parentSize;
      } else {
        // Fallback to equal distribution
        child.percent = 1.0 / children.length;
      }
    }
  });

  // Second pass: normalize all percentages to sum to 1.0
  let totalPercent = 0;
  children.forEach((child) => {
    totalPercent += child.percent;
  });

  if (totalPercent > 0 && Math.abs(totalPercent - 1.0) > 0.001) {
    const scale = 1.0 / totalPercent;
    children.forEach((child) => {
      child.percent *= scale;
    });
  }
}

/**
 * forge-12f (gh-305): start-of-grab anchor for the resize pair. On X11
 * (observed on Mutter 48) one move_resize_frame emits SEVERAL size-changed
 * events, so handleResizing runs multiple times per step with a CUMULATIVE
 * changePx. The focused window is anchored on its frozen initRect; the pair
 * must be anchored the same way, or every extra pass re-debits its live,
 * already-debited node rect and the slack drifts into the other siblings on
 * normalize (the opposite boundary moves). Snapshots live on the focus node
 * and are released with the grab in _grabCleanup.
 */
export function pairInitRect(focusNodeWindow, resizePairForWindow) {
  if (!focusNodeWindow.pairInitRects) focusNodeWindow.pairInitRects = new Map();
  let init = focusNodeWindow.pairInitRects.get(resizePairForWindow);
  if (!init) {
    init = { ...resizePairForWindow.rect };
    focusNodeWindow.pairInitRects.set(resizePairForWindow, init);
  }
  return init;
}

/**
 * Grab-time percent debit for a resolved owning split. changePx is the
 * grabbed frame vs initRect (cumulative); who is target/pair is I3.
 */
export function applyOwningSplitFromGrab(wm, resolved, focusNodeWindow, currentRect, orientation) {
  const { target, pair, parent } = resolved;
  const parentRect = parent.rect;
  const focusInit = focusNodeWindow.initRect;
  if (!parentRect || !focusInit || !currentRect) return;

  const sizeKey = orientation === ORIENTATION_TYPES.HORIZONTAL ? "width" : "height";
  if (!parentRect[sizeKey]) return;

  const firstRect =
    target === focusNodeWindow
      ? focusInit
      : target.initRect || pairInitRect(focusNodeWindow, target);
  const secondRect = pairInitRect(focusNodeWindow, pair);
  if (!firstRect || !secondRect) return;

  const changePx = currentRect[sizeKey] - focusInit[sizeKey];
  target.percent = (firstRect[sizeKey] + changePx) / parentRect[sizeKey];
  pair.percent = (secondRect[sizeKey] - changePx) / parentRect[sizeKey];
  target.userSized = true;
  pair.userSized = true;
  normalizeSiblingPercents(wm, parent);
}

export function handleResizing(wm, focusNodeWindow) {
  if (!focusNodeWindow || focusNodeWindow.isFloat()) return;
  if (!wm.focusMetaWindow) return;
  let grabOps = Utils.decomposeGrabOp(wm.grabOp);
  for (let grabOp of grabOps) {
    if (focusNodeWindow.initGrabOp === Meta.GrabOp.RESIZING_UNKNOWN) {
      return;
    }

    const direction = Utils.directionFromGrab(grabOp);
    const orientation = Utils.orientationFromGrab(grabOp);
    if (
      orientation !== ORIENTATION_TYPES.HORIZONTAL &&
      orientation !== ORIENTATION_TYPES.VERTICAL
    ) {
      continue;
    }

    const frameRect = wm.focusMetaWindow.get_frame_rect();
    const gaps = wm.calculateGaps(focusNodeWindow);
    const currentRect = Utils.removeGapOnRect(frameRect, gaps);
    const unit = wm.tree.layoutUnit(focusNodeWindow);
    const resolved = wm.tree.resolveOwningSplit(unit, orientation, { direction });
    if (!resolved) continue;

    applyOwningSplitFromGrab(wm, resolved, focusNodeWindow, currentRect, orientation);
  }
  repositionDuringResize(wm, focusNodeWindow);
}

/**
 * Repositions the focused window during resize to prevent "traveling".
 * Uses initRect as reference to calculate correct position based on which
 * edge is being dragged.
 */
export function repositionDuringResize(wm, focusNodeWindow) {
  if (!focusNodeWindow || !focusNodeWindow.initRect) return;

  const metaWindow = focusNodeWindow.nodeValue;
  if (!metaWindow) return;

  const frameRect = metaWindow.get_frame_rect();
  const initRect = focusNodeWindow.initRect;
  const gaps = wm.calculateGaps(focusNodeWindow);

  let grabOps = Utils.decomposeGrabOp(wm.grabOp);
  let targetX = frameRect.x;
  let targetY = frameRect.y;

  for (const grabOp of grabOps) {
    const position = Utils.positionFromGrabOp(grabOp);
    const orientation = Utils.orientationFromGrab(grabOp);

    if (orientation === ORIENTATION_TYPES.HORIZONTAL) {
      if (position === POSITION.AFTER) {
        // Resizing right edge - x should stay fixed at initRect.x + gaps
        targetX = initRect.x + gaps;
      } else if (position === POSITION.BEFORE) {
        // Resizing left edge - x should adjust based on width change
        // initRect.x is without gaps, so add gaps for actual position
        targetX = initRect.x + gaps - (frameRect.width - (initRect.width - gaps * 2));
      }
    } else if (orientation === ORIENTATION_TYPES.VERTICAL) {
      if (position === POSITION.AFTER) {
        // Resizing bottom edge - y should stay fixed at initRect.y + gaps
        targetY = initRect.y + gaps;
      } else if (position === POSITION.BEFORE) {
        // Resizing top edge - y should adjust based on height change
        targetY = initRect.y + gaps - (frameRect.height - (initRect.height - gaps * 2));
      }
    }
  }

  // Only reposition if position actually differs
  if (targetX !== frameRect.x || targetY !== frameRect.y) {
    metaWindow.move_frame(true, targetX, targetY);
  }
}
