/*
 * This file is part of the Forge extension for GNOME
 *
 * Portable session layout for install/update survival (JSON forest).
 * Leaves: window id + wmClass/title for HUP id churn. Pure helpers.
 */

import { isWindowDescriptor, SNAPSHOT_VERSION, collectWindows } from "./tree-snapshot.js";
import * as MonitorIdentity from "./monitor-identity.js";

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

/** @param {any} metaWindow @returns {{ x: number, y: number, width: number, height: number }|null} */
function windowFrame(metaWindow) {
  try {
    const r =
      typeof metaWindow.get_frame_rect === "function"
        ? metaWindow.get_frame_rect()
        : metaWindow?._rect;
    if (!r) return null;
    const x = Number(r.x);
    const y = Number(r.y);
    const width = Number(r.width);
    const height = Number(r.height);
    if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
    return { x, y, width, height };
  } catch (_e) {
    return null;
  }
}

/** @param {any} a @param {any} b @returns {number} intersection area */
export function frameOverlapArea(a, b) {
  if (!a || !b) return 0;
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ix * iy;
}

/**
 * Higher is better. Survives uniform thrash translation better than overlap:
 * two Ghosttys piled on mon1 still rank by proximity to saved centers.
 * @param {any} saved
 * @param {any} live
 */
export function frameDistanceScore(saved, live) {
  if (!saved || !live) return 0;
  const sx = saved.x + (saved.width || 0) / 2;
  const sy = saved.y + (saved.height || 0) / 2;
  const lx = live.x + (live.width || 0) / 2;
  const ly = live.y + (live.height || 0) / 2;
  if (![sx, sy, lx, ly].every((n) => Number.isFinite(n))) return 0;
  const d = Math.hypot(sx - lx, sy - ly);
  return 1_000_000 / (1 + d);
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
      if (typeof w.get_pid === "function") {
        const pid = w.get_pid();
        if (pid > 0) out.pid = pid;
      }
      if (typeof w.get_monitor === "function") {
        const mon = w.get_monitor();
        if (typeof mon === "number" && mon >= 0) out.monitor = mon;
      }
      const frame = windowFrame(w);
      if (frame) out.frame = frame;
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
 * @param {any} metaWindow
 * @returns {{ wmClass: string|null, title: string|null }}
 */
function windowClassTitle(metaWindow) {
  let wmClass = null;
  let title = null;
  try {
    wmClass = typeof metaWindow.get_wm_class === "function" ? metaWindow.get_wm_class() : null;
  } catch (_e) {
    wmClass = null;
  }
  try {
    title = typeof metaWindow.get_title === "function" ? metaWindow.get_title() : null;
  } catch (_e) {
    title = null;
  }
  return { wmClass: wmClass ?? null, title: title ?? null };
}

/**
 * Resolve portable leaves. Order: id → pid (+geo if multi-window process) →
 * class+title → class+geometry → unique class.
 * Ghostty: one pid, many windows, titles churn — geometry ranking is required.
 * @param {Iterable<any>} metaWindows
 * @returns {(leaf: any) => any|null}
 */
export function createWindowResolver(metaWindows) {
  const list = [...(metaWindows || [])].filter(Boolean);
  const byId = new Map();
  /** @type {Map<number, any[]>} */
  const byPid = new Map();
  /** @type {Map<string, any[]>} */
  const byClassTitle = new Map();
  /** @type {Map<string, any[]>} */
  const byClass = new Map();
  const used = new Set();

  for (const w of list) {
    const id = windowStableId(w);
    if (id !== null && id !== undefined) byId.set(id, w);
    try {
      const pid = typeof w.get_pid === "function" ? w.get_pid() : w.pid;
      if (pid > 0) {
        if (!byPid.has(pid)) byPid.set(pid, []);
        byPid.get(pid).push(w);
      }
    } catch (_e) {
      // ignore
    }
    const { wmClass, title } = windowClassTitle(w);
    const ct = `${wmClass ?? ""}\0${title ?? ""}`;
    if (!byClassTitle.has(ct)) byClassTitle.set(ct, []);
    byClassTitle.get(ct).push(w);
    const c = wmClass ?? "";
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c).push(w);
  }

  const claim = (w) => {
    if (!w || used.has(w)) return null;
    used.add(w);
    return w;
  };

  /**
   * Rank candidates by mon match + frame center distance (not overlap alone).
   * Distance still ranks after thrash when both live on one head.
   */
  const pickByGeometry = (leaf, cands) => {
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    let best = null;
    let bestScore = -1;
    let second = -1;
    for (const w of cands) {
      let score = 0;
      try {
        const mon = typeof w.get_monitor === "function" ? w.get_monitor() : w._monitor;
        if (typeof leaf.monitor === "number" && mon === leaf.monitor) score += 10_000_000;
      } catch (_e) {
        // ignore
      }
      const liveFrame = windowFrame(w);
      score += frameOverlapArea(leaf.frame, liveFrame);
      score += frameDistanceScore(leaf.frame, liveFrame);
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = w;
      } else if (score > second) {
        second = score;
      }
    }
    // Require a clear winner so two equal scores do not flip arbitrarily.
    if (!best || bestScore <= 0) return null;
    if (second > 0 && bestScore - second < 1e-6) return null;
    return best;
  };

  return (leaf) => {
    if (!leaf) return null;
    if (leaf.id !== null && leaf.id !== undefined) {
      const hit = claim(byId.get(leaf.id));
      if (hit) return hit;
    }
    if (leaf.pid > 0) {
      const pidCands = (byPid.get(leaf.pid) || []).filter((w) => !used.has(w));
      if (pidCands.length === 1) return claim(pidCands[0]);
      const geoPid = pickByGeometry(leaf, pidCands);
      if (geoPid) return claim(geoPid);
    }
    const ct = `${leaf.wmClass ?? ""}\0${leaf.title ?? ""}`;
    const ctCands = (byClassTitle.get(ct) || []).filter((w) => !used.has(w));
    if (ctCands.length === 1) return claim(ctCands[0]);

    const classKey = leaf.wmClass ?? "";
    if (classKey) {
      const classCands = (byClass.get(classKey) || []).filter((w) => !used.has(w));
      const geo = pickByGeometry(leaf, classCands);
      if (geo) return claim(geo);
      if (classCands.length === 1) return claim(classCands[0]);
    }
    return null;
  };
}

/**
 * Count portable leaves and how many resolve.
 * @param {{ monitors?: any[] }|null} portableForest
 * @param {Map<string|number, any> | ((leaf: any) => any|null)} idMapOrResolver
 * @returns {{ total: number, matched: number }}
 */
export function matchStats(portableForest, idMapOrResolver) {
  const resolve =
    typeof idMapOrResolver === "function"
      ? idMapOrResolver
      : (leaf) => (leaf && idMapOrResolver?.get?.(leaf.id)) || null;
  let total = 0;
  let matched = 0;
  const walk = (d) => {
    if (!d) return;
    if (isPortableWindow(d)) {
      total += 1;
      if (resolve(d)) matched += 1;
      return;
    }
    for (const c of d.children || []) walk(c);
  };
  for (const m of portableForest?.monitors || []) {
    for (const c of m.children || []) walk(c);
  }
  return { total, matched };
}

/**
 * Match count with a fresh class/title resolver (each live window used once).
 * @param {{ monitors?: any[] }|null} portableForest
 * @param {Iterable<any>} metaWindows
 */
export function matchStatsAgainstWindows(portableForest, metaWindows) {
  return matchStats(portableForest, createWindowResolver(metaWindows));
}

/** @param {any} d */
export function isPortableWindow(d) {
  return (
    !!d &&
    Object.prototype.hasOwnProperty.call(d, "id") &&
    !Object.prototype.hasOwnProperty.call(d, "children")
  );
}

/** Higher = more multi-mon / tab structure (guards thrash-flat overwrites). */
export function forestRichness(forest) {
  if (!forest?.monitors?.length) return 0;
  let score = 0;
  let groups = 0;
  let wins = 0;
  const walk = (d) => {
    if (!d) return;
    if (isPortableWindow(d) || (d.window && !d.children)) {
      wins += 1;
      return;
    }
    if (d.layout === "TABBED" || d.layout === "STACKED") groups += 1;
    for (const c of d.children || []) walk(c);
  };
  for (const m of forest.monitors) {
    score += 10;
    walk(m);
  }
  score += groups * 5 + wins;
  return score;
}

/**
 * Resolve portable forest → live T6 forest (window leaves are Meta.Window).
 * Unmatched windows are dropped (restore collapses as usual).
 * @param {{ version?: number, monitors?: any[] }|null} portableForest
 * @param {Map<string|number, any> | ((leaf: any) => any|null)} idMapOrResolver
 * @returns {{ version: number, monitors: any[] }|null}
 */
export function toLiveForest(portableForest, idMapOrResolver) {
  if (!portableForest || !Array.isArray(portableForest.monitors) || !idMapOrResolver) return null;
  const resolve =
    typeof idMapOrResolver === "function"
      ? idMapOrResolver
      : (leaf) => (leaf && idMapOrResolver.get(leaf.id)) || null;
  const monitors = portableForest.monitors.map((m) => liveMonitor(m, resolve)).filter(Boolean);
  if (monitors.length === 0) return null;
  return {
    version: portableForest.version ?? SNAPSHOT_VERSION,
    monitors,
  };
}

/** @param {any} monDesc @param {(leaf: any) => any|null} resolve */
function liveMonitor(monDesc, resolve) {
  if (!monDesc) return null;
  const children = (monDesc.children || []).map((c) => liveNode(c, resolve)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    id: monDesc.id,
    layout: monDesc.layout,
    children,
  };
  if (monDesc.stableKey) out.stableKey = monDesc.stableKey;
  return out;
}

/** @param {any} descriptor @param {(leaf: any) => any|null} resolve */
function liveNode(descriptor, resolve) {
  if (!descriptor) return null;
  if (isPortableWindow(descriptor)) {
    const window = resolve(descriptor);
    if (!window) return null;
    return {
      window,
      percent: descriptor.percent ?? 0,
      userSized: !!descriptor.userSized,
    };
  }
  const children = (descriptor.children || []).map((c) => liveNode(c, resolve)).filter(Boolean);
  if (children.length === 0) return null;
  const out = {
    layout: descriptor.layout,
    percent: descriptor.percent ?? 0,
    userSized: !!descriptor.userSized,
    children,
  };
  if (descriptor.lastTabFocusId !== undefined && descriptor.lastTabFocusId !== null) {
    // Resolve focus by synthetic leaf with id only (title unknown).
    out.lastTabFocus = resolve({ id: descriptor.lastTabFocusId }) ?? null;
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
export function isSessionLayoutFresh(
  envelope,
  nowMonotonicUs,
  maxAgeUs = DEFAULT_MAX_AGE_US,
  nowWallMs = Date.now()
) {
  if (!envelope || typeof envelope.savedMonotonicUs !== "number") return false;
  if (typeof nowMonotonicUs !== "number") return false;
  // Mono regress = reboot, unless wall age is still fresh (CLI stamp domain).
  if (nowMonotonicUs < envelope.savedMonotonicUs) {
    if (typeof envelope.savedAtMs === "number" && typeof nowWallMs === "number") {
      const wallAgeMs = nowWallMs - envelope.savedAtMs;
      return wallAgeMs >= 0 && wallAgeMs <= maxAgeUs / 1000;
    }
    return false;
  }
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

/**
 * Prefer snapshot mon id / stableKey — do not follow majority pile-up.
 * Used for install/update restore after Mutter shoves windows onto one head.
 *
 * @param {any} monDesc
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findMonitorByStableKey?: (stableKey: string, monDescId?: string) => any,
 * }} ctx
 * @returns {any|null}
 */
export function resolveStrictMonitor(monDesc, ctx) {
  if (!monDesc || !ctx) return null;
  if (monDesc.stableKey && typeof ctx.findMonitorByStableKey === "function") {
    const byStable = ctx.findMonitorByStableKey(monDesc.stableKey, monDesc.id);
    if (byStable) return byStable;
  }
  if (monDesc.id && typeof ctx.findMonitor === "function") {
    return ctx.findMonitor(monDesc.id) || null;
  }
  return null;
}

/**
 * Plan Meta monitor indices for each window from a live forest (after id resolve).
 * @param {{ monitors?: any[] }|null} liveForest
 * @returns {{ window: any, monIndex: number, monId: string }[]}
 */
export function planWindowMonitorHomes(liveForest) {
  const out = [];
  if (!liveForest?.monitors) return out;
  for (const monDesc of liveForest.monitors) {
    const monId = monDesc?.id;
    if (!monId) continue;
    const monIndex = MonitorIdentity.monIndexFromId(monId);
    if (monIndex < 0) continue;
    for (const w of collectWindows(monDesc)) {
      if (w) out.push({ window: w, monIndex, monId });
    }
  }
  return out;
}
