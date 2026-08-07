/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Pure helpers for CL8 deferred hidden open during LayoutBatch.
 * No GObject imports — unit tests stay light.
 *
 * LayoutBatch admits will-tile windows as FLOAT (no percent carve / no open
 * TILE commit), hides the actor, and releases on batch end or disable.
 */

/**
 * True when a new will-tile window should use deferred hidden admit.
 * @param {{ openLayoutBatchActive?: boolean, willTile?: boolean }} opts
 * @returns {boolean}
 */
export function shouldDeferHiddenOpen(opts = {}) {
  return !!opts.openLayoutBatchActive && !!opts.willTile;
}

/**
 * True when homeMonitor warrants early move_to_monitor (PlaceNext sticky).
 * @param {unknown} homeMonitor
 * @returns {boolean}
 */
export function shouldStickyMoveHomeMonitor(homeMonitor) {
  return typeof homeMonitor === "number" && Number.isFinite(homeMonitor) && homeMonitor >= 0;
}

/**
 * @returns {{ windows: Set<object>, states: WeakMap<object, object> }}
 */
export function createDeferredOpenStore() {
  return {
    windows: new Set(),
    states: new WeakMap(),
  };
}

/**
 * @param {{ windows: Set<object>, states: WeakMap<object, object> }|null|undefined} store
 * @param {object|null|undefined} metaWindow
 * @param {object} [state]
 * @returns {boolean}
 */
export function markDeferredOpen(store, metaWindow, state = {}) {
  if (!store?.windows || !metaWindow) return false;
  store.windows.add(metaWindow);
  store.states.set(metaWindow, { ...state });
  return true;
}

/**
 * @param {{ windows?: Set<object> }|null|undefined} store
 * @param {object|null|undefined} metaWindow
 * @returns {boolean}
 */
export function isDeferredOpen(store, metaWindow) {
  return !!(store?.windows && metaWindow && store.windows.has(metaWindow));
}

/**
 * Clear one mark; return prior state or null.
 * @param {{ windows: Set<object>, states: WeakMap<object, object> }|null|undefined} store
 * @param {object|null|undefined} metaWindow
 * @returns {object|null}
 */
export function takeDeferredOpen(store, metaWindow) {
  if (!store?.windows || !metaWindow || !store.windows.has(metaWindow)) return null;
  store.windows.delete(metaWindow);
  const st = store.states.get(metaWindow) ?? null;
  try {
    store.states.delete(metaWindow);
  } catch (_e) {
    // WeakMap delete always ok
  }
  return st;
}

/**
 * Release every deferred window; returns [{ meta, state }, ...].
 * @param {{ windows: Set<object>, states: WeakMap<object, object> }|null|undefined} store
 * @returns {Array<{ meta: object, state: object|null }>}
 */
export function takeAllDeferredOpens(store) {
  if (!store?.windows?.size) return [];
  const out = [];
  for (const meta of [...store.windows]) {
    out.push({ meta, state: takeDeferredOpen(store, meta) });
  }
  return out;
}

/**
 * Hide compositor actor + border. Returns snapshot for restore.
 * @param {{ opacity?: number, border?: { hide?: () => void, show?: () => void } }|null|undefined} actor
 * @param {{ defaultOpacity?: number }} [opts]
 * @returns {{ prevOpacity: number, hadBorder: boolean, pendingHide?: boolean }}
 */
export function hideDeferredActor(actor, opts = {}) {
  const defaultOp =
    typeof opts.defaultOpacity === "number" && Number.isFinite(opts.defaultOpacity)
      ? opts.defaultOpacity
      : 255;
  if (!actor) return { prevOpacity: defaultOp, hadBorder: false, pendingHide: true };

  const prevOpacity = typeof actor.opacity === "number" ? actor.opacity : defaultOp;
  try {
    actor.opacity = 0;
  } catch (_e) {
    // actor may be disposing
  }

  let hadBorder = false;
  if (actor.border) {
    hadBorder = true;
    try {
      if (typeof actor.border.hide === "function") actor.border.hide();
    } catch (_e) {
      // border may be gone
    }
  }
  return { prevOpacity, hadBorder, pendingHide: false };
}

/**
 * True when a still-deferred map needs hide re-applied (null actor earlier,
 * client map restored opacity, or pendingHide latch).
 * @param {{ opacity?: number }|null|undefined} actor
 * @param {boolean} isDeferred
 * @param {{ pendingHide?: boolean }|null|undefined} [state]
 * @returns {boolean}
 */
export function needsDeferredHideReapply(actor, isDeferred, state = null) {
  if (!isDeferred) return false;
  if (!actor) return !!state?.pendingHide;
  if (state?.pendingHide) return true;
  const op = typeof actor.opacity === "number" ? actor.opacity : 255;
  return op !== 0;
}

/**
 * Re-hide a deferred map when actor appears late or opacity was restored.
 * Preserves original prevOpacity when known. Returns true if hide ran.
 * @param {{ windows: Set<object>, states: WeakMap<object, object> }|null|undefined} store
 * @param {object|null|undefined} metaWindow
 * @param {{ opacity?: number, border?: { hide?: () => void, show?: () => void } }|null|undefined} actor
 * @returns {boolean}
 */
export function rehideDeferredIfNeeded(store, metaWindow, actor) {
  if (!store?.windows || !metaWindow || !store.windows.has(metaWindow)) return false;
  const prev = store.states.get(metaWindow) || {};
  if (!needsDeferredHideReapply(actor, true, prev)) return false;
  if (!actor) return false;
  const defaultOp =
    typeof prev.prevOpacity === "number" && Number.isFinite(prev.prevOpacity)
      ? prev.prevOpacity
      : 255;
  const snap = hideDeferredActor(actor, { defaultOpacity: defaultOp });
  store.states.set(metaWindow, {
    ...prev,
    prevOpacity:
      typeof prev.prevOpacity === "number" && Number.isFinite(prev.prevOpacity)
        ? prev.prevOpacity
        : snap.prevOpacity,
    hadBorder: !!(prev.hadBorder || snap.hadBorder),
    pendingHide: false,
  });
  return true;
}

/**
 * Restore actor opacity + border after deferred open.
 * @param {{ opacity?: number, border?: { hide?: () => void, show?: () => void } }|null|undefined} actor
 * @param {{ prevOpacity?: number, hadBorder?: boolean }|null|undefined} snap
 */
export function showDeferredActor(actor, snap = null) {
  if (!actor) return;
  const op =
    snap && typeof snap.prevOpacity === "number" && Number.isFinite(snap.prevOpacity)
      ? snap.prevOpacity
      : 255;
  try {
    actor.opacity = op;
  } catch (_e) {
    // actor may be disposing
  }
  if (snap?.hadBorder && actor.border && typeof actor.border.show === "function") {
    try {
      actor.border.show();
    } catch (_e) {
      // border may be gone
    }
  }
}
