/*
 * ForgeAdapterGnome — renderTree idle coalesce + layout-request / freeze shell.
 * processFloats lives in adapter-float; commitLayout stays action-pipeline.
 */

import GLib from "gi://GLib";
import { Logger } from "../shared/logger.js";
import { recordInvariant, recordPaint } from "./metrics.js";
import { presentSeededForest } from "./adapter-present.js";
import { hostPresentHoldActive } from "./monitor-recovery.js";

/**
 * Debounced layout commit (CL0). Prefer over raw renderTree for sensor storms.
 * CL5: while open-layout batch is active, latch need-commit only (no mid-batch fire).
 * @param {object} wm
 * @param {string} [reason]
 */
export function requestLayout(wm, reason) {
  if (wm._layoutBatch?.active) {
    wm._layoutBatch.latchCommit();
    return;
  }
  wm.layoutController?.requestLayout(reason);
}

/** @param {object} wm */
export function freezeRender(wm) {
  wm._freezeRender = true;
}

/** @param {object} wm */
export function unfreezeRender(wm) {
  wm._freezeRender = false;
}

/**
 * Temporarily unfreeze, schedule render, then restore freeze.
 * @param {object} wm
 * @param {string} from
 */
export function renderWithFreezeState(wm, from) {
  let prevFrozen = wm._freezeRender;
  if (prevFrozen) unfreezeRender(wm);
  renderTree(wm, from);
  if (prevFrozen) freezeRender(wm);
}

/**
 * Coalesce present onto a SourceBag idle (force replaces a stale slot).
 * @param {object} wm
 * @param {string} [from]
 * @param {boolean} [force]
 */
export function renderTree(wm, from, force = false) {
  if (hostPresentHoldActive(wm)) {
    Logger.trace(`present-hold skip from=${from || "-"}`);
    return;
  }
  let wasFrozen = wm._freezeRender;
  if (force && wasFrozen) unfreezeRender(wm);
  if (wm._freezeRender || !wm.ext.settings.get_boolean("tiling-mode-enabled")) {
    wm.updateDecorationLayout();
    wm.updateBorderLayout();
    wm.layoutDebugOverlay?.update();
  } else {
    // Force replaces a stale idle so first layout apply cannot no-op behind
    // a leftover grab-end renderTree slot (R024).
    if (force && wm._wmSources.has("renderTree")) {
      wm._wmSources.cancel("renderTree");
    }
    if (!wm._wmSources.has("renderTree")) {
      // Bug #531: SourceBag clears the slot on fire (before cb); throw cannot wedge.
      wm._wmSources.setIdle("renderTree", () => {
        runPresentIdle(wm, from, wasFrozen);
      });
    }
    // CL5: residual/force owns the commit while batch open — clear at schedule
    // so endOpenLayoutBatch before idle does not double requestLayout.
    if (wm._layoutBatch?.active) {
      wm._layoutBatch.clearNeedsCommit();
    }
  }
}

/**
 * Idle present body: prune → floats → paint → chrome → last-good.
 * @param {object} wm
 * @param {string} [from]
 * @param {boolean} wasFrozen
 */
export function runPresentIdle(wm, from, wasFrozen) {
  if (hostPresentHoldActive(wm)) {
    Logger.trace(`present-hold idle skip from=${from || "-"}`);
    if (wasFrozen) freezeRender(wm);
    return;
  }
  let renderOk = false;
  const t0 = typeof GLib.get_monotonic_time === "function" ? GLib.get_monotonic_time() : 0;
  try {
    // forge-4b6: must run before anything walks the tree — one dead
    // wrapper would throw out of this callback and abort the render.
    wm.tree.pruneDeadWindows();
    // D044: TABBED/STACKED members share the CON MONITOR ancestor.
    wm.normalizeTabGroupsToHomeMonitors();
    wm._inPresent = true;
    try {
      wm.processFloats({ fromPresent: true });
      // forge-zo4: processFloats re-pins always-on-top floats via `set float`,
      // so the fullscreen demotion must run AFTER it to win, on every render.
      wm._reconcileFullscreenFloatDemotion();
      if (wm._liveForestSeeded && wm.forest && wm.hostBag) {
        presentSeededForest(wm, from);
      } else {
        wm.tree.render(from);
      }
    } finally {
      wm._inPresent = false;
      wm._presentPaintMirror = false;
    }
    // D095 S5: primary present sizes peers; no opportunistic reassert.
    wm.handleMaximizeOnSingle();
    wm.updateDecorationLayout();
    wm.updateBorderLayout();
    wm.layoutDebugOverlay?.update();
    // Quiet render: remember per-window monitor + frame for blank/wake rehome.
    // Skip while locked — DPMS thrash would poison last-good / session-layout.json.
    if (!wm._sessionLocked) {
      wm._snapshotLastGoodHomes();
      // Keep last-good topology on disk (install/HUP often skips clean disable).
      wm._queueSessionLayoutSave();
    }
    renderOk = true;
  } catch (e) {
    recordInvariant("render-throw", String(from || ""), `from=${from} ${e}`);
    throw e;
  } finally {
    recordPaint(
      from,
      typeof GLib.get_monotonic_time === "function" ? (GLib.get_monotonic_time() - t0) / 1000 : 0
    );
    if (wasFrozen) freezeRender(wm);
  }
  // Post-render verify only after a successful body (CL0 hook for CL1).
  if (renderOk) {
    // CL5: residual already applied (also cleared at schedule time).
    if (wm._layoutBatch?.active) {
      wm._layoutBatch.clearNeedsCommit();
    }
    wm.layoutController?.onRenderComplete(from);
  }
}
