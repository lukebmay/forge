/*
 * ForgeAdapterGnome — Meta geometry write (clamp + ε decideGeomWrite + bag).
 */

import Meta from "gi://Meta";

import * as Utils from "./utils.js";
import * as Compat from "./compat.js";
import { safeMoveToMonitor } from "./monitor-recovery.js";
import {
  MIN_CLAMP_LEARN_DELAY_MS,
  readWindowMinSize,
  acceptWindowSizeBelowFloor,
} from "./tree-layout.js";
import {
  decideGeomWrite,
  getEffectiveClassEpsilon,
} from "./geom-epsilon.js";

/**
 * Geometry commit with suppress + echo wrap.
 *
 * @param {object} wm
 * @param {object} metaWindow
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {object|null} [workArea]
 * @param {{ skipOffscreenClamp?: boolean, force?: boolean }} [opts]
 */
export function moveMetaWindow(
  wm,
  metaWindow,
  rect,
  workArea = null,
  { skipOffscreenClamp = false, force = false } = {}
) {
  if (!metaWindow) return;
  if (metaWindow.grabbed) return;
  if (!Utils.isWindowAlive(metaWindow)) return;

  wm._suppressGeom.run(() => {
    const committed = moveMetaWindowImpl(wm, metaWindow, rect, workArea, {
      skipOffscreenClamp,
      force,
    });
    if (committed) {
      wm.layoutEpoch?.startEcho(metaWindow, { targetRect: rect });
    }
  });
}

/**
 * Geometry commit body. Callers that need suppress use moveMetaWindow.
 *
 * @param {object} wm
 * @param {object} metaWindow
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {object|null} [workArea]
 * @param {{ skipOffscreenClamp?: boolean, force?: boolean }} [opts]
 * @returns {boolean} true when move_resize_frame was issued
 */
export function moveMetaWindowImpl(
  wm,
  metaWindow,
  rect,
  workArea = null,
  { skipOffscreenClamp = false, force = false } = {}
) {
  let x = rect.x;
  let y = rect.y;
  let width = rect.width;
  let height = rect.height;

  const destMon = wm._monitorIndexForRect(rect);
  if (destMon >= 0) {
    safeMoveToMonitor(metaWindow, destMon, "move target mon");
  }

  const known = readWindowMinSize(metaWindow);
  const minW = known.width > 0 ? known.width : width;
  const minH = known.height > 0 ? known.height : height;
  const priorFr = metaWindow.get_frame_rect?.();
  metaWindow._forgeLastResizeRequest = {
    width,
    height,
    at: Date.now(),
    priorW: priorFr?.width,
    priorH: priorFr?.height,
  };
  if (minW > width || minH > height) {
    const wa = wm._resolveTargetWorkArea(metaWindow, rect, workArea);
    if (wa) {
      if (minW > width) x = Math.max(wa.x, Math.min(x, wa.x + wa.width - minW));
      if (minH > height) y = Math.max(wa.y, Math.min(y, wa.y + wa.height - minH));
    }
  }

  if (Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
    const scale = Utils.dpi();
    if (scale > 1) {
      x = wm._alignToBufferScale(x, scale);
      y = wm._alignToBufferScale(y, scale);
      width = wm._alignToBufferScale(width, scale);
      height = wm._alignToBufferScale(height, scale);
    }
  }

  if (!skipOffscreenClamp) {
    const wa = wm._resolveTargetWorkArea(metaWindow, rect, workArea);
    if (wa) {
      const ew = Math.max(width, minW);
      const eh = Math.max(height, minH);
      if (x + ew > wa.x + wa.width) x = Math.max(wa.x, wa.x + wa.width - ew);
      if (y + eh > wa.y + wa.height) y = Math.max(wa.y, wa.y + wa.height - eh);
    }
  }

  const frame = metaWindow.get_frame_rect();
  const targetW = Math.max(width, minW);
  const targetH = Math.max(height, minH);
  const expectRect = { x, y, width: targetW, height: targetH };
  const commandRect = { x, y, width, height };
  const bagId = wm.hostBag?.idFromMeta?.(metaWindow);
  const bagEntry = bagId ? wm.hostBag.get(bagId) : undefined;
  const liveMon = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : -1;
  const { windowId: geomWindowId, wmClass: geomWmClass } = wm._geomEpsilonIdentity(metaWindow);
  const classEps = getEffectiveClassEpsilon(wm._classGeomEpsilon, geomWmClass, geomWindowId);
  const decision = decideGeomWrite({
    desired: expectRect,
    bagDesired: bagEntry?.desiredRect,
    observed: frame ?? bagEntry?.observed,
    epsilon: classEps,
    force,
    maximized: Compat.getMaximizeFlags(metaWindow) !== 0,
    monMismatch: destMon >= 0 && liveMon !== destMon,
  });

  if (!decision.write) {
    wm._settleHostBagGeometry(bagId, {
      desiredRect: expectRect,
      observed: frame,
      desiredChanged: decision.desiredChanged,
      commanded: null,
    });
    wm._logGeomEpsilon(metaWindow, {
      phase: decision.reason,
      sent: expectRect,
      observed: frame,
      knownMin: known,
      wrote: false,
      level: "trace",
      epsilon: classEps,
    });
    return false;
  }

  Compat.unmaximize(metaWindow);

  let windowActor = metaWindow.get_compositor_private();
  if (!windowActor) return false;
  if (metaWindow.firstRender) {
    metaWindow.firstRender = false;
  } else {
    windowActor.remove_all_transitions();
  }

  metaWindow.move_frame(true, x, y);
  metaWindow.move_resize_frame(true, x, y, width, height);
  const immediate = metaWindow.get_frame_rect?.() ?? null;
  wm._settleHostBagGeometry(bagId, {
    desiredRect: expectRect,
    observed: immediate ?? frame,
    desiredChanged: decision.desiredChanged,
    commanded: commandRect,
  });
  wm._logGeomEpsilon(metaWindow, {
    phase: "post-write-immediate",
    sent: commandRect,
    observed: immediate,
    knownMin: known,
    wrote: true,
    epsilon: classEps,
  });
  wm._scheduleGeomEpsilonObserve(metaWindow, commandRect, known, bagId, {
    expectRect,
    workArea,
    skipOffscreenClamp,
  });
  wm._scheduleMinClampLearn(metaWindow);
  try {
    const knownNow = readWindowMinSize(metaWindow);
    if (
      (knownNow.width > 0 && width > 0 && knownNow.width > width) ||
      (knownNow.height > 0 && height > 0 && knownNow.height > height)
    ) {
      let acceptId = "unknown";
      try {
        acceptId =
          typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(acceptId);
      } catch (_e) {
        /* ignore */
      }
      wm._wmSources?.set?.(`minAccept:${acceptId}`, MIN_CLAMP_LEARN_DELAY_MS + 40, () => {
        try {
          const fr = metaWindow.get_frame_rect?.();
          if (fr) acceptWindowSizeBelowFloor(metaWindow, fr);
        } catch (_e) {
          /* ignore */
        }
      });
    }
  } catch (_e) {
    /* ignore */
  }
  return true;
}
