/*
 * This file is part of the Forge extension for GNOME
 *
 * Portable session layout for disable→enable (install/update) survival.
 * Live tree-snapshot keeps Meta.Window refs; those die with the extension
 * instance. This module rewrites leaves to stable window ids so a JSON file
 * can restore topology after reload while apps stay open.
 *
 * Pure helpers — unit-testable without Mutter.
 */

import { isWindowDescriptor, SNAPSHOT_VERSION } from "./tree-snapshot.js";

/** Schema version for on-disk session-layout.json */
export const SESSION_LAYOUT_VERSION = 1;

/** Default max age (µs) for a session layout to still apply after disable. */
export const DEFAULT_MAX_AGE_US = 30 * 60 * 1000 * 1000; // 30 minutes

/**
 * @param {any} metaWindow
 * @returns {string|number|null}
 */
export function windowStableId(metaWindow) {
  if (!metaWindow) return null;
  try {
    if (typeof metaWindow.get_id === "function") {
      const id = metaWindow.get_id();
      if (id !== undefined && id !== null) return id;
    }
  } catch (_e) {
    // finalized window
  }
  return metaWindow.id ?? null;
}

/**
 * Convert a live T6 forest (Meta.Window leaves) into a JSON-safe forest.
 * @param {{ version?: number, monitors?: any[] }|null} liveForest
 * @returns {{ version: number, monitors: any[] }|null}
 */
export function toPortableForest(liveForest) {
  if (!liveForest || !Array.isArray(liveForest.monitors)) return null;
  const monitors = liveForest.monitors.map((m) => portableMonitor(m)).filter(Boolean);
  if (monitors.length === 0) return null;
  return {
    version: liveForest.version ?? SNAPSHOT_VERSION,
    monitors,
  };
}

/** @param {any} monDesc */
function portableMonitor(monDesc) {
  if (!monDesc) return null;
  const children = (monDesc.children || []).map((c) => portableNode(c)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    id: monDesc.id,
    layout: monDesc.layout,
    children,
  };
  if (monDesc.stableKey) out.stableKey = monDesc.stableKey;
  return out;
}

/** @param {any} descriptor */
function portableNode(descriptor) {
  if (!descriptor) return null;
  if (isWindowDescriptor(descriptor)) {
    const id = windowStableId(descriptor.window);
    if (id === null || id === undefined) return null;
    const out = {
      id,
      percent: descriptor.percent ?? 0,
      userSized: !!descriptor.userSized,
    };
    try {
      const w = descriptor.window;
      if (typeof w.get_wm_class === "function") out.wmClass = w.get_wm_class() ?? null;
      if (typeof w.get_title === "function") out.title = w.get_title() ?? null;
    } catch (_e) {
      // optional identity hints only
    }
    return out;
  }
  const children = (descriptor.children || []).map((c) => portableNode(c)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    layout: descriptor.layout,
    percent: descriptor.percent ?? 0,
    userSized: !!descriptor.userSized,
    children,
  };
  if (descriptor.lastTabFocus !== undefined) {
    out.lastTabFocusId = windowStableId(descriptor.lastTabFocus);
  }
  return out;
}

/**
 * Build Map of stable id → Meta.Window from currently tracked windows.
 * @param {Iterable<any>} metaWindows
 * @returns {Map<string|number, any>}
 */
export function indexWindowsById(metaWindows) {
  const map = new Map();
  for (const w of metaWindows || []) {
    const id = windowStableId(w);
    if (id !== null && id !== undefined) map.set(id, w);
  }
  return map;
}

/**
 * Count portable window leaves and how many resolve via idMap.
 * @param {{ monitors?: any[] }|null} portableForest
 * @param {Map<string|number, any>} idMap
 * @returns {{ total: number, matched: number }}
 */
export function matchStats(portableForest, idMap) {
  let total = 0;
  let matched = 0;
  const walk = (d) => {
    if (!d) return;
    if (isPortableWindow(d)) {
      total += 1;
      if (idMap.has(d.id)) matched += 1;
      return;
    }
    for (const c of d.children || []) walk(c);
  };
  for (const m of portableForest?.monitors || []) {
    for (const c of m.children || []) walk(c);
  }
  return { total, matched };
}

/** @param {any} d */
export function isPortableWindow(d) {
  return (
    !!d &&
    Object.prototype.hasOwnProperty.call(d, "id") &&
    !Object.prototype.hasOwnProperty.call(d, "children")
  );
}

/**
 * Resolve portable forest → live T6 forest (window leaves are Meta.Window).
 * Unmatched windows are dropped (restore collapses as usual).
 * @param {{ version?: number, monitors?: any[] }|null} portableForest
 * @param {Map<string|number, any>} idMap
 * @returns {{ version: number, monitors: any[] }|null}
 */
export function toLiveForest(portableForest, idMap) {
  if (!portableForest || !Array.isArray(portableForest.monitors) || !idMap) return null;
  const monitors = portableForest.monitors.map((m) => liveMonitor(m, idMap)).filter(Boolean);
  if (monitors.length === 0) return null;
  return {
    version: portableForest.version ?? SNAPSHOT_VERSION,
    monitors,
  };
}

/** @param {any} monDesc @param {Map} idMap */
function liveMonitor(monDesc, idMap) {
  if (!monDesc) return null;
  const children = (monDesc.children || []).map((c) => liveNode(c, idMap)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    id: monDesc.id,
    layout: monDesc.layout,
    children,
  };
  if (monDesc.stableKey) out.stableKey = monDesc.stableKey;
  return out;
}

/** @param {any} descriptor @param {Map} idMap */
function liveNode(descriptor, idMap) {
  if (!descriptor) return null;
  if (isPortableWindow(descriptor)) {
    const window = idMap.get(descriptor.id);
    if (!window) return null;
    return {
      window,
      percent: descriptor.percent ?? 0,
      userSized: !!descriptor.userSized,
    };
  }
  const children = (descriptor.children || []).map((c) => liveNode(c, idMap)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    layout: descriptor.layout,
    percent: descriptor.percent ?? 0,
    userSized: !!descriptor.userSized,
    children,
  };
  if (descriptor.lastTabFocusId !== undefined && descriptor.lastTabFocusId !== null) {
    out.lastTabFocus = idMap.get(descriptor.lastTabFocusId) ?? null;
  }
  return out;
}

/**
 * Whether a saved session envelope is still usable.
 * Discard on reboot (monotonic went backwards) or when older than maxAgeUs.
 *
 * @param {{ savedMonotonicUs?: number }|null} envelope
 * @param {number} nowMonotonicUs
 * @param {number} [maxAgeUs]
 * @returns {boolean}
 */
export function isSessionLayoutFresh(envelope, nowMonotonicUs, maxAgeUs = DEFAULT_MAX_AGE_US) {
  if (!envelope || typeof envelope.savedMonotonicUs !== "number") return false;
  if (typeof nowMonotonicUs !== "number") return false;
  // Reboot: monotonic clock restarts lower than the stamp we saved.
  if (nowMonotonicUs < envelope.savedMonotonicUs) return false;
  if (nowMonotonicUs - envelope.savedMonotonicUs > maxAgeUs) return false;
  return true;
}

/**
 * Minimum fraction of portable windows that must still exist to restore.
 * Below this we keep the flat re-track (safer than a half-applied topology).
 */
export const MIN_MATCH_RATIO = 0.5;

/**
 * @param {{ total: number, matched: number }} stats
 * @param {number} [minRatio]
 * @returns {boolean}
 */
export function isMatchGoodEnough(stats, minRatio = MIN_MATCH_RATIO) {
  if (!stats || stats.total < 1) return false;
  if (stats.matched < 1) return false;
  return stats.matched / stats.total >= minRatio;
}

/**
 * Wrap a portable forest for disk (timestamp + kind).
 * @param {{ version?: number, monitors?: any[] }} portableForest
 * @param {number} savedMonotonicUs
 * @param {number} [savedAtMs]
 */
export function makeEnvelope(portableForest, savedMonotonicUs, savedAtMs = Date.now()) {
  return {
    kind: "forge-session-layout",
    sessionVersion: SESSION_LAYOUT_VERSION,
    savedMonotonicUs,
    savedAtMs,
    forest: portableForest,
  };
}

/**
 * @param {any} raw
 * @returns {{ kind: string, sessionVersion: number, savedMonotonicUs: number, forest: any }|null}
 */
export function parseEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== "forge-session-layout") return null;
  if (raw.sessionVersion !== SESSION_LAYOUT_VERSION) return null;
  if (!raw.forest || !Array.isArray(raw.forest.monitors)) return null;
  if (typeof raw.savedMonotonicUs !== "number") return null;
  return raw;
}
