/*
 * This file is part of the Forge extension for GNOME
 *
 * Last Focused Tile (LFT) MRU rings + pure open-app placement helpers (OP1).
 * Unit-testable without Mutter.
 */

/**
 * Global + per-monitor MRU of tiled window nodes.
 * LFT = global head; LFT(m) = mon m head. Floats never belong here.
 */
export class LftMru {
  constructor() {
    /** @type {any[]} */
    this._global = [];
    /** @type {Map<number, any[]>} */
    this._byMon = new Map();
  }

  /** @returns {any|null} */
  globalHead() {
    return this._global[0] ?? null;
  }

  /**
   * @param {number} monIndex
   * @returns {any|null}
   */
  monHead(monIndex) {
    if (monIndex == null || monIndex < 0) return null;
    const list = this._byMon.get(monIndex);
    return list && list.length ? list[0] : null;
  }

  /**
   * Move a tiled node to the front of the global ring and its monitor ring.
   * @param {any} node
   * @param {number} monIndex
   */
  touch(node, monIndex) {
    if (!node) return;
    this._moveToFront(this._global, node);
    if (monIndex == null || monIndex < 0) return;
    // Drop from any other mon ring first (rehome without full remove).
    for (const [mon, list] of this._byMon) {
      if (mon === monIndex) continue;
      const i = list.indexOf(node);
      if (i >= 0) list.splice(i, 1);
    }
    let list = this._byMon.get(monIndex);
    if (!list) {
      list = [];
      this._byMon.set(monIndex, list);
    }
    this._moveToFront(list, node);
  }

  /**
   * Remove from global and all mon rings (destroy / float / untrack).
   * @param {any} node
   */
  remove(node) {
    if (!node) return;
    this._removeFrom(this._global, node);
    for (const list of this._byMon.values()) {
      this._removeFrom(list, node);
    }
  }

  /**
   * Drop mon membership only; next touch re-enters under live mon.
   * @param {any} node
   */
  dropMonRings(node) {
    if (!node) return;
    for (const list of this._byMon.values()) {
      this._removeFrom(list, node);
    }
  }

  clear() {
    this._global.length = 0;
    this._byMon.clear();
  }

  /** @returns {any[]} */
  globalOrder() {
    return this._global.slice();
  }

  /**
   * @param {number} monIndex
   * @returns {any[]}
   */
  monOrder(monIndex) {
    const list = this._byMon.get(monIndex);
    return list ? list.slice() : [];
  }

  /**
   * @param {any[]} list
   * @param {any} node
   */
  _moveToFront(list, node) {
    const i = list.indexOf(node);
    if (i === 0) return;
    if (i > 0) list.splice(i, 1);
    list.unshift(node);
  }

  /**
   * @param {any[]} list
   * @param {any} node
   */
  _removeFrom(list, node) {
    const i = list.indexOf(node);
    if (i >= 0) list.splice(i, 1);
  }
}

/**
 * Aspect split orientation from LFT rect.
 * Taller than wide → vertical (VSPLIT); else horizontal (HSPLIT).
 * @param {{ width?: number, height?: number }|null|undefined} rect
 * @returns {"horizontal"|"vertical"}
 */
export function aspectOrientationFromRect(rect) {
  if (!rect) return "horizontal";
  const w = rect.width ?? 0;
  const h = rect.height ?? 0;
  return h > w ? "vertical" : "horizontal";
}

/**
 * Whether LFT parent is a tab/stack group (insert after LFT, no aspect split).
 * @param {{ layout?: string }|null|undefined} parentNode
 * @param {{ TABBED: string, STACKED: string }} layoutTypes
 * @returns {boolean}
 */
export function isTabOrStackParent(parentNode, layoutTypes) {
  if (!parentNode || !layoutTypes) return false;
  const layout = parentNode.layout;
  return layout === layoutTypes.TABBED || layout === layoutTypes.STACKED;
}

/**
 * Resolve open-app monitor home + which LFT head to attach after.
 *
 * @param {object} opts
 * @param {number} [opts.dockMonitor=-1] - dock mon when detected; else < 0
 * @param {number} [opts.lftMonitor=-1] - global LFT monitor index; < 0 if none
 * @param {number} [opts.windowMonitor=-1] - metaWindow.get_monitor()
 * @param {string} [opts.placement="pointer"] - new-window-placement setting
 * @param {any} [opts.globalLft=null]
 * @param {any} [opts.monLft=null] - LFT(m) for dock mon (caller supplies)
 * @returns {{ homeMonitor: number, isDock: boolean, attachLft: any|null, attachMode: "after-lft"|"mon-root" }}
 */
export function resolveOpenAppPlacement(opts = {}) {
  const dockMonitor = opts.dockMonitor ?? -1;
  const lftMonitor = opts.lftMonitor ?? -1;
  const windowMonitor = opts.windowMonitor ?? -1;
  const placement = opts.placement ?? "pointer";
  const globalLft = opts.globalLft ?? null;
  const monLft = opts.monLft ?? null;

  if (dockMonitor >= 0) {
    const attachLft = monLft || null;
    return {
      homeMonitor: dockMonitor,
      isDock: true,
      attachLft,
      attachMode: attachLft ? "after-lft" : "mon-root",
    };
  }

  // Escape hatch: trust the window's own monitor (app-restored geometry).
  if (placement === "window-actual" && windowMonitor >= 0) {
    const sameMonAsLft = globalLft && lftMonitor === windowMonitor;
    return {
      homeMonitor: windowMonitor,
      isDock: false,
      attachLft: sameMonAsLft ? globalLft : null,
      attachMode: sameMonAsLft ? "after-lft" : "mon-root",
    };
  }

  // OP1 generic: global LFT mon (not pointer). No LFT → mon 0.
  if (globalLft && lftMonitor >= 0) {
    return {
      homeMonitor: lftMonitor,
      isDock: false,
      attachLft: globalLft,
      attachMode: "after-lft",
    };
  }

  return {
    homeMonitor: 0,
    isDock: false,
    attachLft: null,
    attachMode: "mon-root",
  };
}

/** Default TTL for pending dock launches (ms). */
export const DOCK_LAUNCH_TTL_MS = 4000;

/** Grace after sticky dock home before Meta re-home is honored (ms). */
export const DOCK_STICKY_GRACE_MS = 800;

/**
 * Pure pending-dock-launch matcher (no GObject).
 * Prefer appId match; else most recent unexpired entry.
 *
 * @param {Array<{ monitor: number, appId?: string|null, ts: number }>} pending
 * @param {{ appId?: string|null, now?: number, ttlMs?: number }} query
 * @returns {{ monitor: number, index: number }|null}
 */
export function matchPendingDockLaunch(pending, query = {}) {
  if (!pending || !pending.length) return null;
  const now = query.now ?? Date.now();
  const ttl = query.ttlMs ?? DOCK_LAUNCH_TTL_MS;
  const appId = query.appId ?? null;

  let best = null;
  for (let i = pending.length - 1; i >= 0; i--) {
    const entry = pending[i];
    if (!entry || entry.monitor < 0) continue;
    if (now - entry.ts > ttl) continue;
    if (appId && entry.appId && entry.appId === appId) {
      return { monitor: entry.monitor, index: i };
    }
    if (!best) best = { monitor: entry.monitor, index: i };
  }
  // App-id mismatch: do not steal a different app's launch.
  if (appId) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const entry = pending[i];
      if (!entry || entry.monitor < 0) continue;
      if (now - entry.ts > ttl) continue;
      if (!entry.appId) return { monitor: entry.monitor, index: i };
    }
    return null;
  }
  return best;
}
