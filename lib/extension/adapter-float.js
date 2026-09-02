/*
 * ForgeAdapterGnome — float policy (processFloats, overrides, exempt, demotion).
 */

import Meta from "gi://Meta";
import { Logger } from "../shared/logger.js";
import * as Utils from "./utils.js";
import * as Compat from "./compat.js";
import { NODE_TYPES } from "./tree-types.js";
import { WINDOW_MODES } from "./window-modes.js";
import { forestSetWindowFloating } from "./tom-live.js";
import { isPlaceholderNode } from "./layout-placeholder.js";
import {
  allowsResizeForFloatPolicy,
  floatExemptReasonFromFlags,
  formatFloatFlagTags,
  isDingDesktopIconsSurface,
  processFloatDecisionFromFlags,
} from "../shared/float-reason.js";
import { HUNT_FLOAT_REASON_KEEP, HUNT_TILE_SLOT_FLOAT, huntTileSlotFloat } from "./hunt-logs.js";
import { metaWmClass } from "./place-hint.js";

/**
 * Load window overrides, apply an update function, then save.
 * @param {Function} updateFn - Receives (overrides, wmClass, wmId), returns updated overrides
 * @param {Meta.Window} metaWindow
 * @param {boolean} withWmId
 */
export function updateWindowOverrides(wm, updateFn, metaWindow, withWmId) {
  // windowDestroy runs the remove path on EVERY close, and a fast/Wayland close
  // can finalize the wrapper before this runs — get_wm_class()/get_id() would
  // throw "already deallocated" and abort the rest of windowDestroy (forge-h7ba).
  if (!Utils.isWindowAlive(metaWindow)) return;
  let currentProps = wm.ext.configMgr.windowProps;
  let wmClass = metaWindow.get_wm_class();
  let wmId = metaWindow.get_id();
  const beforeLength = currentProps.overrides.length;
  currentProps.overrides = updateFn(currentProps.overrides, wmClass, wmId, withWmId);
  // ALWAYS refresh the WM cache from this fresh config read: other writers
  // (prefs, the e2e bridge) update configMgr without touching wm.windowProps,
  // and isFloatingExempt reads the cache — keeping a stale one misroutes the
  // next float toggle (caught on the F39 lane).
  wm.windowProps = currentProps;
  // Both updateFns only add or remove entries; skip the DISK write when the
  // set is unchanged — windowDestroy runs the remove path on EVERY close.
  if (currentProps.overrides.length === beforeLength) return;
  wm.ext.configMgr.windowProps = currentProps;
}

export function addModeOverride(wm, metaWindow, withWmId, mode) {
  updateWindowOverrides(
    wm,
    (overrides, wmClass, wmId, withWmId) => {
      for (let override of overrides) {
        if (override.mode !== mode) continue;
        if (withWmId) {
          if (override.wmClass === wmClass && override.wmId === wmId) return overrides;
        } else {
          if (override.wmClass === wmClass && !override.wmId && !override.wmTitle)
            return overrides;
        }
      }
      overrides.push({
        wmClass: wmClass,
        wmId: withWmId ? wmId : undefined,
        mode: mode,
      });
      return overrides;
    },
    metaWindow,
    withWmId
  );
}

export function removeModeOverride(wm, metaWindow, withWmId, mode) {
  updateWindowOverrides(
    wm,
    (overrides, wmClass, wmId, withWmId) => {
      return overrides.filter(
        (override) =>
          !(
            override.mode === mode &&
            override.wmClass === wmClass &&
            !override.wmTitle &&
            (!withWmId || override.wmId === wmId)
          )
      );
    },
    metaWindow,
    withWmId
  );
}

export function addFloatOverride(wm, metaWindow, withWmId) {
  addModeOverride(wm, metaWindow, withWmId, "float");
}

export function removeFloatOverride(wm, metaWindow, withWmId) {
  removeModeOverride(wm, metaWindow, withWmId, "float");
}

export function addTileOverride(wm, metaWindow, withWmId) {
  addModeOverride(wm, metaWindow, withWmId, "tile");
}

export function removeTileOverride(wm, metaWindow, withWmId) {
  removeModeOverride(wm, metaWindow, withWmId, "tile");
}

export function toggleFloatingMode(wm, action, metaWindow) {
  let nodeWindow = wm.findNodeWindow(metaWindow);
  if (!nodeWindow || !action) return;
  if (nodeWindow.nodeType !== NODE_TYPES.WINDOW) return;

  let withWmId = action.name === "FloatToggle";

  if (wm.isFloatingExempt(metaWindow)) {
    // Toggle toward TILED. Drop any float override this window owns; if it is
    // still exempt (forge-fxf #387: floated only by a broader class rule), add
    // a winning per-window tile override so just this window tiles, leaving the
    // class rule and its siblings untouched.
    wm.removeFloatOverride(metaWindow, withWmId);
    if (wm.isFloatingExempt(metaWindow)) {
      wm.addTileOverride(metaWindow, withWmId);
    }
  } else {
    // Toggle toward FLOATING. Drop any tile override this window owns (clean
    // reversibility); if it is still tiled, add a float override.
    wm.removeTileOverride(metaWindow, withWmId);
    if (!wm.isFloatingExempt(metaWindow)) {
      wm.addFloatOverride(metaWindow, withWmId);
    }
  }

  const willFloat =
    wm.isFloatingExempt(metaWindow) ||
    !wm.isActiveWindowWorkspaceTiled(metaWindow) ||
    !wm.isActiveWindowMonitorTiled(metaWindow);

  // Forest FLOATS membership first; mode is paint bridge until C7.
  if (wm.forest && wm._liveForestSeeded) {
    forestSetWindowFloating(wm, nodeWindow, willFloat);
  }

  // Bug #319: use the float setter so _forgeSetAbove is handled. Mirror
  // processFloats so the node reflects the new decision before the trailing
  // renderTree reconciles the whole tree.
  nodeWindow.float = willFloat;
}

/**
 * Iterate the live FLOAT windows in the tree. Centralizes the mode filter and
 * the Utils.isWindowAlive() probe (forge-h7ba) so the always-on-top pin/unpin
 * paths can't throw on a finalized Meta.Window wrapper mid-forEach and leave
 * the remaining floats mis-pinned.
 */
export function forEachFloatNode(wm, fn) {
  wm.allNodeWindows.forEach((w) => {
    if (w.mode !== WINDOW_MODES.FLOAT) return;
    const metaWindow = w.nodeValue;
    if (!Utils.isWindowAlive(metaWindow)) return;
    fn(metaWindow, w);
  });
}

export function cleanupAlwaysFloat(wm) {
  // Always-on-top was turned off: unpin every float, dialogs included. Dialogs
  // are kept above the tiled grid by raise-on-focus, not a global pin, so a
  // dialog exception here would only strand a popup above other floats.
  forEachFloatNode(wm, (metaWindow) => {
    metaWindow.is_above() && metaWindow.unmake_above();
  });
}

export function restoreAlwaysFloat(wm) {
  forEachFloatNode(wm, (metaWindow) => {
    !metaWindow.is_above() && metaWindow.make_above();
  });
}

/**
 * forge-zo4 (#460): when a window goes fullscreen, Forge-pinned always-on-top
 * floats on the SAME monitor must drop below it instead of rendering over the
 * fullscreen surface. Recomputed from scratch on every (arg-less, infrequent)
 * in-fullscreen-changed, so no persistent per-monitor count is kept — the
 * per-node `_aboveDemotedForFullscreen` flag carries the "restore me once my
 * monitor has no fullscreen window" intent. Mirrors cleanupAlwaysFloat's
 * dialog/transient exclusion and only ever touches floats Forge itself pinned.
 */
export function reconcileFullscreenFloatDemotion(wm) {
  if (!wm.tree) return;
  // Only meaningful when Forge manages float stacking.
  if (!wm.ext.settings.get_boolean("float-always-on-top-enabled")) {
    restoreAllDemotedFloats(wm);
    return;
  }

  const nodes = wm.allNodeWindows;
  // Count qualifying fullscreen windows per monitor (dialogs/transients are
  // forced above by design and never block floats).
  const fullscreenCounts = new Map();
  nodes.forEach((w) => {
    const metaWindow = w.nodeValue;
    if (!metaWindow || !metaWindow.is_fullscreen()) return;
    if (isDialogLike(wm, metaWindow)) return;
    const monIdx = wm._monitorIndexOfNode(w);
    fullscreenCounts.set(monIdx, (fullscreenCounts.get(monIdx) || 0) + 1);
  });

  withSuppressedAboveHandler(wm, () => {
    nodes.forEach((w) => {
      if (w.mode !== WINDOW_MODES.FLOAT) return;
      const metaWindow = w.nodeValue;
      if (!metaWindow) return;
      const blocked = (fullscreenCounts.get(wm._monitorIndexOfNode(w)) || 0) > 0;

      // Demote: a Forge-pinned float on a monitor that now has a fullscreen
      // window. Never the fullscreen window itself, a dialog, or a user pin.
      if (
        blocked &&
        w._forgeSetAbove &&
        metaWindow.is_above() &&
        !metaWindow.is_fullscreen() &&
        !isDialogLike(wm, metaWindow)
      ) {
        metaWindow.unmake_above();
        // unmake_above() only drops the always-on-top pin; e2e
        // (test_fullscreen_demote_float) showed the float still stacks above
        // the fullscreen window in the normal layer, so lower it explicitly.
        metaWindow.lower();
        w._aboveDemotedForFullscreen = true;
        return;
      }

      // Restore: a previously-demoted float whose monitor is now clear.
      if (!blocked && w._aboveDemotedForFullscreen) {
        if (w._forgeSetAbove && !metaWindow.is_above()) metaWindow.make_above();
        w._aboveDemotedForFullscreen = false;
      }
    });
  });
}

export function restoreAllDemotedFloats(wm) {
  if (!wm.tree) return;
  withSuppressedAboveHandler(wm, () => {
    wm.allNodeWindows.forEach((w) => {
      if (!w._aboveDemotedForFullscreen) return;
      const metaWindow = w.nodeValue;
      if (w._forgeSetAbove && metaWindow && !metaWindow.is_above()) metaWindow.make_above();
      w._aboveDemotedForFullscreen = false;
    });
  });
}

/**
 * forge-zo4: run `fn` while suppressing _handleUserAboveChange so Forge's own
 * make_above/unmake_above (which emit notify::above) are not mistaken for the
 * user toggling "Always on Top".
 */
export function withSuppressedAboveHandler(wm, fn) {
  return wm._suppressAbove.run(fn);
}

export function isDialogLike(wm, metaWindow) {
  return (
    metaWindow.get_window_type() === Meta.WindowType.DIALOG ||
    metaWindow.get_window_type() === Meta.WindowType.MODAL_DIALOG ||
    metaWindow.get_transient_for() !== null
  );
}

/**
 * @param {{ fromPresent?: boolean }} [opts]
 */
export function processFloats(wm, opts = null) {
  const fromPresent = !!(opts && opts.fromPresent);
  wm.allNodeWindows.forEach((nodeWindow) => {
    let metaWindow = nodeWindow.nodeValue;
    // Skeleton / thrash placeholders are Meta-like stubs — never float-classify.
    if (isPlaceholderNode(nodeWindow) || !metaWindow) return;
    applyProcessFloatDecision(wm, nodeWindow, metaWindow, {
      adoptSlot: true,
      fromPresent,
    });
  });
}

/**
 * One-window processFloats body (canonical float↔tile mode update).
 * @param {object} nodeWindow
 * @param {Meta.Window} metaWindow
 * @param {{ adoptSlot?: boolean, fromPresent?: boolean }} [opts] — adoptSlot false = mode only
 *   (late place / ensureMetaInSlot own attach; default true for processFloats).
 *   fromPresent skips GObject invent (Forest membership + paint only).
 * @returns {{ action: string, reason: string, flags?: object }|null}
 */
export function applyProcessFloatDecision(wm, nodeWindow, metaWindow, opts = null) {
  if (!nodeWindow || !metaWindow) return null;
  const decision = processFloatDecision(wm, nodeWindow, metaWindow);
  if (decision.action === "skip") return decision;

  const adoptSlot = !opts || opts.adoptSlot !== false;
  const fromPresent = !!(opts && opts.fromPresent);
  const wasFloat = nodeWindow.mode === WINDOW_MODES.FLOAT;
  const willFloat = decision.action === "float";
  logFloatDecision(wm, nodeWindow, metaWindow, decision, wasFloat);

  if (willFloat) {
    nodeWindow.float = true;
    wm.lftMru?.remove(nodeWindow);
    if (decision.reason !== "deferred" && !wm._unknownOpenIdentity(metaWindow)) {
      delete nodeWindow._tileInsertUnit;
    }
    if (decision.reason !== "deferred") {
      // Present: Forest FLOATS only — no GObject wrap unwind invent (D096 G2).
      if (!fromPresent) wm._unwindOpenSlotWrap(nodeWindow);
      repositionOccludedDialog(wm, metaWindow);
    }
    if (wm.forest && wm._liveForestSeeded) {
      forestSetWindowFloating(wm, nodeWindow, true);
    }
    return decision;
  }

  try {
    nodeWindow.float = false;
  } catch (_e) {
    /* duck */
  }
  if (nodeWindow.mode !== WINDOW_MODES.TILE) nodeWindow.mode = WINDOW_MODES.TILE;
  if (wasFloat && adoptSlot && !fromPresent) wm._adoptOpenIntoTileSlot(nodeWindow);
  if (wasFloat && adoptSlot && wm.focusMetaWindow === metaWindow) {
    wm._lftTouchIfTile(nodeWindow);
  }
  if (wm.forest && wm._liveForestSeeded) {
    forestSetWindowFloating(wm, nodeWindow, false);
  }
  // slotSplit while still under FLOATS can paintFloatModeBridge→FLOAT; re-assert.
  if (nodeWindow.isFloat?.() || nodeWindow.mode === WINDOW_MODES.FLOAT) {
    try {
      nodeWindow.float = false;
    } catch (_e) {
      /* duck */
    }
    if (nodeWindow.mode !== WINDOW_MODES.TILE) nodeWindow.mode = WINDOW_MODES.TILE;
  }
  return decision;
}

/**
 * Apply-time / late-identity: TILE mode + drop Meta max so slot place can paint.
 * Does not adopt into LFT — caller owns attach/reparent (D026 idle-only in epoch).
 * @param {Meta.Window} metaWindow
 * @param {object|null|undefined} [node]
 * @returns {{ action: string, reason: string }|null}
 */
export function ensureTiledForSlotPlace(wm, metaWindow, node = null) {
  if (!metaWindow) return null;
  const n = node || wm.findNodeWindow(metaWindow);
  if (!n || isPlaceholderNode(n)) return null;
  const decision = applyProcessFloatDecision(wm, n, metaWindow, { adoptSlot: false });
  if (!decision || decision.action !== "tile") return decision;
  try {
    if (Compat.getMaximizeFlags(metaWindow) !== 0) {
      Compat.unmaximize(metaWindow);
    }
  } catch (_e) {
    /* disposing */
  }
  return decision;
}

/**
 * Meta → pure float flags (gi-free classifier in float-reason.js).
 * @param {Meta.Window} metaWindow
 * @returns {import('../shared/float-reason.js').ProcessFloatFlags}
 */
export function collectProcessFloatFlags(wm, metaWindow) {
  if (!metaWindow) {
    return { ignored: true, wmClassNull: true, titleEmpty: true, allowsResize: false };
  }
  const title = metaWindow.get_title?.();
  const wmClass = metaWindow.get_wm_class?.();
  const wt = metaWindow.get_window_type?.();
  let windowType = "other";
  try {
    if (wt === Meta.WindowType.DIALOG) windowType = "dialog";
    else if (wt === Meta.WindowType.MODAL_DIALOG) windowType = "modal-dialog";
    else if (wt === Meta.WindowType.NORMAL) windowType = "normal";
  } catch (_e) {
    /* */
  }
  const { hasSpecific, hasClassOnly } = classifyTileOverrides(wm, metaWindow);
  const maximized = Compat.getMaximizeFlags(metaWindow) !== 0;
  const fullscreen = !!(metaWindow.is_fullscreen && metaWindow.is_fullscreen());
  const rawAllows =
    typeof metaWindow.allows_resize === "function" ? !!metaWindow.allows_resize() : true;
  return {
    ignored: isWindowIgnored(wm, metaWindow),
    windowType,
    transient: metaWindow.get_transient_for?.() != null,
    wmClassNull: wmClass == null,
    titleEmpty: title == null || title === "" || title.length === 0,
    above: !!metaWindow.is_above?.(),
    forgeTransientAbove: !!metaWindow._forgeTransientAbove,
    alwaysOnAllWorkspaces: !!Compat.isAlwaysOnAllWorkspaces(metaWindow),
    // D051: Meta false-while-max/fs must not become permanent no-resize float.
    allowsResize: allowsResizeForFloatPolicy({
      allowsResize: rawAllows,
      maximized,
      fullscreen,
    }),
    hasSpecificTile: !!hasSpecific,
    hasSpecificFloat: matchesSpecificFloatOverride(wm, metaWindow),
    hasClassOnlyTile: !!hasClassOnly,
    matchesClassFloatOverride: matchesFloatOverride(wm, metaWindow),
    wsTiled: wm.isActiveWindowWorkspaceTiled(metaWindow),
    monTiled: wm.isActiveWindowMonitorTiled(metaWindow),
    deferred: wm._isDeferredOpen(metaWindow),
    grabTile: false,
  };
}

/**
 * @param {object} nodeWindow
 * @param {Meta.Window} metaWindow
 * @returns {{ action: "skip"|"float"|"tile", reason: string, flags: object }}
 */
export function processFloatDecision(wm, nodeWindow, metaWindow) {
  if (nodeWindow?.isGrabTile?.()) {
    return { action: "skip", reason: "grab-tile", flags: { grabTile: true } };
  }
  const flags = collectProcessFloatFlags(wm, metaWindow);
  const decision = processFloatDecisionFromFlags(flags);
  return { ...decision, flags };
}

/**
 * @param {object} nodeWindow
 * @param {Meta.Window} metaWindow
 * @param {{ action: string, reason: string, flags?: object }} decision
 * @param {boolean} wasFloat
 */
export function logFloatDecision(wm, nodeWindow, metaWindow, decision, wasFloat) {
  const willFloat = decision.action === "float";
  const reason = decision.reason || (willFloat ? "float" : "tile");
  const prevReason = nodeWindow._lastFloatReason || "";
  const changed = willFloat !== wasFloat || (willFloat && reason !== prevReason);
  nodeWindow._lastFloatReason = willFloat ? reason : "tile";

  let id = "?";
  try {
    id = typeof metaWindow.get_id === "function" ? String(metaWindow.get_id()) : "?";
  } catch (_e) {
    /* */
  }
  const cls = metaWmClass(metaWindow) || "null";
  let metaMon = "?";
  let treeMon = "?";
  try {
    metaMon = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : "?";
  } catch (_e) {
    /* */
  }
  try {
    treeMon = wm._monitorIndexOfNode?.(nodeWindow);
    if (treeMon == null) treeMon = "?";
  } catch (_e) {
    /* */
  }

  if (changed) {
    Logger.debug(
      `float-reason id=${id} class=${cls} ${wasFloat ? "FLOAT" : "TILE"}→${
        willFloat ? "FLOAT" : "TILE"
      } reason=${reason} metaMon=${metaMon} treeMon=${treeMon}`
    );
  } else if (HUNT_FLOAT_REASON_KEEP) {
    Logger.trace(
      `float-reason id=${id} class=${cls} keep=${willFloat ? "FLOAT" : "TILE"} reason=${reason}`
    );
  }

  const applyLive = wm.isApplyEpochLive?.();
  const placeOwned =
    !!metaWindow._forgeProvisionalPlaceHint ||
    !!metaWindow._forgeLatePlaceAdoptBusy ||
    (Array.isArray(wm._pendingPlaceHints) && wm._pendingPlaceHints.length > 0);
  if (HUNT_TILE_SLOT_FLOAT && (applyLive || placeOwned || (willFloat && changed))) {
    huntTileSlotFloat("processFloats", {
      id,
      class: cls,
      action: decision.action,
      reason,
      wasFloat,
      metaMon,
      treeMon,
      applyLive: !!applyLive,
      flags: decision.flags || {},
      flagsTag: formatFloatFlagTags(decision.flags || {}),
    });
  }
}

/**
 * forge-2ew: A transient dialog can inherit Mutter placement that lands it
 * behind a tiled neighbor of its parent. When a dialog overlaps a tiled window
 * other than its own parent, recenter it over its parent (clamped to the work
 * area) so it is not occluded. Non-transient floats are left where the user
 * put them.
 */
export function repositionOccludedDialog(wm, metaWindow) {
  const parent = metaWindow.get_transient_for && metaWindow.get_transient_for();
  if (!parent) return;

  const dialogRect = metaWindow.get_frame_rect();
  const occluded = wm.allNodeWindows.some((n) => {
    const w = n.nodeValue;
    return n.isTile() && w && w !== parent && Utils.rectsOverlap(dialogRect, w.get_frame_rect());
  });
  if (!occluded) return;

  const parentRect = parent.get_frame_rect();
  let x = parentRect.x + Math.floor((parentRect.width - dialogRect.width) / 2);
  let y = parentRect.y + Math.floor((parentRect.height - dialogRect.height) / 2);

  const wa = Utils.getWorkAreaSafe(metaWindow);
  if (wa) {
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - dialogRect.width));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - dialogRect.height));
  }

  wm.move(metaWindow, { x, y, width: dialogRect.width, height: dialogRect.height });
}

/**
 * forge-w7e (#469): React to a window's "Always on Top" state changing.
 *
 * "Always on Top" is GNOME's Z-axis stacking pin (make_above). isFloatingExempt
 * treats an above window as floating, so a re-render is all that's needed to
 * move a newly-pinned window out of the tree (and retile it when unpinned).
 * Forge only ever pins windows it is already floating, so this stays a no-op
 * for normal tiled windows until the user toggles always-on-top.
 */
export function handleUserAboveChange(wm, _metaWindow) {
  // forge-zo4: ignore the notify::above that Forge itself emits while demoting
  // or restoring floats around a fullscreen window — only react to user pins.
  if (wm._suppressAbove.active) return;
  wm.renderTree("notify-above");
}

/**
 * Whether a window's WM class matches an override's wmClass value. The override may
 * list several classes comma-separated; each is compared for exact equality.
 */
export function wmClassMatches(wm, overrideWmClass, windowWmClass) {
  if (!overrideWmClass || !windowWmClass) return false;
  return overrideWmClass.split(",").some((c) => c.trim() === windowWmClass);
}

export function classifyTileOverrides(wm, metaWindow) {
  // Bug #294 fix: Check for explicit TILE override first (user preference takes precedence)
  const windowTitle = metaWindow.get_title();
  const wmClass = metaWindow.get_wm_class();
  const wmId = metaWindow.get_id();
  const allOverrides = wm.windowProps.overrides;

  let hasSpecific = false;
  let hasClassOnly = false;
  for (const override of allOverrides) {
    if (override.mode !== "tile") continue;

    let matchTitle = true;
    let matchClass = true;
    let matchId = true;

    if (override.wmTitle) {
      matchTitle = windowTitle && windowTitle.includes(override.wmTitle);
    }
    if (override.wmClass) {
      matchClass = wmClassMatches(wm, override.wmClass, wmClass);
    }
    if (override.wmId) {
      matchId = override.wmId === wmId;
    }

    if (!(matchTitle && matchClass && matchId)) continue;

    if (override.wmTitle || override.wmId) {
      hasSpecific = true;
    } else {
      hasClassOnly = true;
    }
  }

  return { hasSpecific, hasClassOnly };
}

/**
 * Whether a single float override (`kf`) matches `metaWindow`. Shared by
 * _matchesFloatOverride and _matchesSpecificFloatOverride so the per-rule
 * title/class/id matching logic lives in exactly one place (DRY).
 */
export function matchesFloatRule(wm, kf, metaWindow) {
  const windowTitle = metaWindow.get_title();
  let matchTitle = false;
  let matchClass = false;
  let matchId = false;

  if (kf.wmTitle) {
    if (kf.wmTitle === " ") {
      matchTitle = kf.wmTitle === windowTitle;
    } else {
      // forge-11k: titles are matched by substring (.includes), never exact,
      // so lowercasing both sides is safe and gives locale/casing fidelity for
      // titles like "Picture-in-Picture". The !-negation and comma-split are
      // preserved.
      const haystack = windowTitle ? windowTitle.toLowerCase() : windowTitle;
      let titles = kf.wmTitle.split(",");
      matchTitle =
        titles.filter((t) => {
          if (windowTitle) {
            if (t.startsWith("!")) {
              return !haystack.includes(t.slice(1).toLowerCase());
            } else {
              return haystack.includes(t.toLowerCase());
            }
          }
          return false;
        }).length > 0;
    }
  }
  if (kf.wmClass) {
    matchClass = wmClassMatches(wm, kf.wmClass, metaWindow.get_wm_class());
  }
  if (kf.wmId) {
    matchId = kf.wmId === metaWindow.get_id();
  }

  // Bug #172 fix: If override has wmId (per-window), REQUIRE it to match
  // If no wmId (class-based), match all windows of that class
  if (kf.wmId) {
    return matchId && matchClass;
  }
  // forge-n29i: a class-less float rule must be allowed to match on title
  // alone — when wmClass is absent, don't require matchClass. A rule with no
  // criteria at all (no wmClass, no wmTitle, no wmId) must match nothing.
  if (!kf.wmClass) {
    return Boolean(kf.wmTitle) && matchTitle;
  }
  return (!kf.wmTitle || matchTitle) && matchClass;
}

export function matchesFloatOverride(wm, metaWindow) {
  return wm.windowProps.overrides.some(
    (kf) => kf.mode === "float" && matchesFloatRule(wm, kf, metaWindow)
  );
}

export function matchesSpecificFloatOverride(wm, metaWindow) {
  return wm.windowProps.overrides.some(
    (kf) =>
      kf.mode === "float" && (kf.wmTitle || kf.wmId) && matchesFloatRule(wm, kf, metaWindow)
  );
}

/**
 * mode: "ignore" — never manage (no tree node / session claim). Stronger than
 * float. User overrides via windows.json; DING Desktop Icons are product-ignore.
 */
export function isWindowIgnored(wm, metaWindow) {
  if (!metaWindow) return false;
  try {
    if (
      isDingDesktopIconsSurface({
        wmClass: metaWindow.get_wm_class?.() ?? metaWindow.wm_class,
        title: metaWindow.get_title?.() ?? metaWindow.title,
      })
    ) {
      return true;
    }
  } catch (_e) {
    /* ignore */
  }
  const overrides = wm.windowProps?.overrides;
  if (!overrides?.length) return false;
  return overrides.some((kf) => kf.mode === "ignore" && matchesFloatRule(wm, kf, metaWindow));
}

export function isFloatingExempt(wm, metaWindow) {
  if (!metaWindow) return true;
  // Reasons live in lib/shared/float-reason.js (same order as historical checks).
  const flags = collectProcessFloatFlags(wm, metaWindow);
  // processFloatFlags includes deferred/ws/mon — exempt path ignores those.
  return floatExemptReasonFromFlags(flags) != null;
}

/**
 * @param {Meta.Window} metaWindow
 * @returns {string|null}
 */
export function floatExemptReason(wm, metaWindow) {
  if (!metaWindow) return "missing";
  return floatExemptReasonFromFlags(collectProcessFloatFlags(wm, metaWindow));
}

