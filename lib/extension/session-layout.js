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

/**
 * Higher is better. −d² so global assignment prefers balanced pairs over one
 * exact hit + one far window (1/(1+d) swapped order-preserving thrash).
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
  return -(d * d);
}

/**
 * Mon match + center distance. Higher is better.
 * Overlap omitted: after thrash it double-counts with distance and can swap pairs.
 * @param {any} leaf portable window leaf
 * @param {any} metaWindow
 */
export function geometryMatchScore(leaf, metaWindow) {
  if (!leaf || !metaWindow) return 0;
  let score = 0;
  try {
    const mon =
      typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : metaWindow._monitor;
    // Above max multi-monitor d² (~1e8–1e9 px²) so mon still dominates distance.
    if (typeof leaf.monitor === "number" && mon === leaf.monitor) score += 1_000_000_000_000;
  } catch (_e) {
    // ignore
  }
  score += frameDistanceScore(leaf.frame, windowFrame(metaWindow));
  return score;
}

/** Stable sort key for live windows (x, y, id). */
function stableWindowSortKey(metaWindow) {
  const f = windowFrame(metaWindow);
  const id = windowStableId(metaWindow);
  const x = f && Number.isFinite(f.x) ? f.x : 0;
  const y = f && Number.isFinite(f.y) ? f.y : 0;
  return `${x}\0${y}\0${id ?? ""}`;
}

/**
 * Global bipartite assignment maximizing sum of scoreFn(leaf, cand).
 * Small n (≤8): full search. Larger: greedy by best free edge.
 * Equal totals break ties by pairing walk-order leaves with sorted candidates.
 *
 * @param {any[]} leaves
 * @param {any[]} candidates
 * @param {(leaf: any, cand: any) => number} scoreFn
 * @returns {Map<any, any>} leaf → candidate
 */
export function assignByScore(leaves, candidates, scoreFn) {
  const L = leaves?.length ?? 0;
  const C = candidates?.length ?? 0;
  if (!L || !C) return new Map();

  const sc = (i, j) => {
    const v = scoreFn(leaves[i], candidates[j]);
    return Number.isFinite(v) ? v : 0;
  };

  if (L > 8 || C > 8) {
    return greedyAssignByScore(leaves, candidates, sc);
  }

  // Prefer deterministic pairing when scores tie (stacked thrash).
  const candRank = candidates
    .map((w, j) => ({ j, key: stableWindowSortKey(w) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.j - b.j));
  const rankOf = new Array(C);
  candRank.forEach((c, rank) => {
    rankOf[c.j] = rank;
  });

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTie = "";
  /** @type {number[]|null} */
  let bestAssign = null; // leafIdx → candIdx

  const used = new Array(C).fill(false);
  const cur = new Array(L).fill(-1);

  const tieKey = (assign) => {
    // Earlier leaves should get earlier stable-ranked candidates when tied.
    let s = "";
    for (let i = 0; i < L; i++) {
      const j = assign[i];
      s += j < 0 ? "Z;" : `${String(rankOf[j]).padStart(4, "0")};`;
    }
    return s;
  };

  const consider = (total) => {
    const tk = tieKey(cur);
    if (total > bestScore + 1e-9 || (Math.abs(total - bestScore) <= 1e-9 && tk < bestTie)) {
      bestScore = total;
      bestTie = tk;
      bestAssign = cur.slice();
    }
  };

  const search = (i, total) => {
    if (i === L) {
      consider(total);
      return;
    }
    const free = used.reduce((n, u) => n + (u ? 0 : 1), 0);
    const left = L - i;
    let tried = false;
    for (let j = 0; j < C; j++) {
      if (used[j]) continue;
      tried = true;
      used[j] = true;
      cur[i] = j;
      search(i + 1, total + sc(i, j));
      cur[i] = -1;
      used[j] = false;
    }
    // Leave unmatched only when not enough free candidates for remaining leaves.
    if (!tried || free < left) {
      cur[i] = -1;
      search(i + 1, total);
      cur[i] = -1;
    }
  };

  search(0, 0);

  const out = new Map();
  if (!bestAssign) return out;
  for (let i = 0; i < L; i++) {
    const j = bestAssign[i];
    if (j >= 0) out.set(leaves[i], candidates[j]);
  }
  return out;
}

/** Greedy fallback for large cohorts. */
function greedyAssignByScore(leaves, candidates, sc) {
  const L = leaves.length;
  const C = candidates.length;
  const leafOrder = leaves
    .map((leaf, i) => ({ i, leaf }))
    .sort((a, b) => {
      const am = typeof a.leaf.monitor === "number" ? a.leaf.monitor : 999;
      const bm = typeof b.leaf.monitor === "number" ? b.leaf.monitor : 999;
      return am - bm || a.i - b.i;
    });
  const candMeta = candidates
    .map((w, j) => ({ j, key: stableWindowSortKey(w) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.j - b.j));
  const used = new Set();
  const out = new Map();
  for (const { i, leaf } of leafOrder) {
    let bestJ = -1;
    let bestS = Number.NEGATIVE_INFINITY;
    let bestKey = "";
    for (const { j, key } of candMeta) {
      if (used.has(j)) continue;
      const s = sc(i, j);
      if (s > bestS + 1e-9 || (Math.abs(s - bestS) <= 1e-9 && key < bestKey)) {
        bestS = s;
        bestJ = j;
        bestKey = key;
      }
    }
    if (bestJ >= 0) {
      used.add(bestJ);
      out.set(leaf, candidates[bestJ]);
    }
  }
  return out;
}

/** DFS walk-order portable window leaves. */
export function collectPortableLeaves(portableForest) {
  /** @type {any[]} */
  const leaves = [];
  const walk = (d) => {
    if (!d) return;
    if (isPortableWindow(d)) {
      leaves.push(d);
      return;
    }
    for (const c of d.children || []) walk(c);
  };
  for (const m of portableForest?.monitors || []) {
    for (const c of m.children || []) walk(c);
  }
  return leaves;
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
 * Resolve portable leaves. Order: id → pid cohort (global geo assign) →
 * class+title → class cohort (global geo assign) → unique class.
 * Ghostty: one pid, many windows, titles churn — geometry ranking is required.
 *
 * When `portableForest` is provided, multi-window cohorts are assigned with
 * {@link assignByScore} (maximizes total score; never drops both on a tie).
 *
 * @param {Iterable<any>} metaWindows
 * @param {{ monitors?: any[] }|null} [portableForest]
 * @returns {(leaf: any) => any|null}
 */
export function createWindowResolver(metaWindows, portableForest = null) {
  const list = [...(metaWindows || [])].filter(Boolean);
  const byId = new Map();
  /** @type {Map<number, any[]>} */
  const byPid = new Map();
  /** @type {Map<string, any[]>} */
  const byClassTitle = new Map();
  /** @type {Map<string, any[]>} */
  const byClass = new Map();
  const used = new Set();
  /** @type {Map<any, any>} portable leaf object → Meta.Window */
  const leafAssign = new Map();

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

  const applyAssign = (mapping) => {
    for (const [leaf, w] of mapping) {
      if (!w || used.has(w) || leafAssign.has(leaf)) continue;
      leafAssign.set(leaf, w);
      used.add(w);
    }
  };

  /** Free windows for a cohort of leaves (pid or class). */
  const freeFor = (cands) => (cands || []).filter((w) => !used.has(w));

  if (portableForest) {
    const allLeaves = collectPortableLeaves(portableForest);

    // 1) Exact Meta id (rare after HUP; still best when stable)
    for (const leaf of allLeaves) {
      if (leafAssign.has(leaf)) continue;
      if (leaf.id === null || leaf.id === undefined) continue;
      const hit = claim(byId.get(leaf.id));
      if (hit) leafAssign.set(leaf, hit);
    }

    // 2) Same-pid multi-window: global geometry assignment
    /** @type {Map<number, any[]>} */
    const pidLeaves = new Map();
    for (const leaf of allLeaves) {
      if (leafAssign.has(leaf)) continue;
      if (!(leaf.pid > 0)) continue;
      if (!pidLeaves.has(leaf.pid)) pidLeaves.set(leaf.pid, []);
      pidLeaves.get(leaf.pid).push(leaf);
    }
    for (const [pid, leaves] of pidLeaves) {
      const cands = freeFor(byPid.get(pid));
      if (!cands.length) continue;
      if (leaves.length === 1 && cands.length === 1) {
        applyAssign(new Map([[leaves[0], cands[0]]]));
        continue;
      }
      applyAssign(assignByScore(leaves, cands, geometryMatchScore));
    }

    // 3) Exact class+title (Chrome tabs often unique)
    for (const leaf of allLeaves) {
      if (leafAssign.has(leaf)) continue;
      const ct = `${leaf.wmClass ?? ""}\0${leaf.title ?? ""}`;
      const ctCands = freeFor(byClassTitle.get(ct));
      if (ctCands.length === 1) {
        applyAssign(new Map([[leaf, ctCands[0]]]));
      }
    }

    // 4) Same-class multi-window: global geometry assignment
    /** @type {Map<string, any[]>} */
    const classLeaves = new Map();
    for (const leaf of allLeaves) {
      if (leafAssign.has(leaf)) continue;
      const classKey = leaf.wmClass ?? "";
      if (!classKey) continue;
      if (!classLeaves.has(classKey)) classLeaves.set(classKey, []);
      classLeaves.get(classKey).push(leaf);
    }
    for (const [classKey, leaves] of classLeaves) {
      const cands = freeFor(byClass.get(classKey));
      if (!cands.length) continue;
      if (leaves.length === 1 && cands.length === 1) {
        applyAssign(new Map([[leaves[0], cands[0]]]));
        continue;
      }
      applyAssign(assignByScore(leaves, cands, geometryMatchScore));
    }
  }

  /**
   * Per-leaf fallback when forest was not pre-assigned (or synthetic leaves).
   * Still uses global assign for the free cohort so ties do not drop all.
   */
  const resolveOne = (leaf) => {
    if (!leaf) return null;
    if (leafAssign.has(leaf)) return leafAssign.get(leaf);

    if (leaf.id !== null && leaf.id !== undefined) {
      const byExact = byId.get(leaf.id);
      if (byExact && !used.has(byExact)) {
        used.add(byExact);
        return byExact;
      }
      // lastTabFocus: already claimed window, still resolve by id
      if (byExact && used.has(byExact)) return byExact;
    }

    if (leaf.pid > 0) {
      const pidCands = freeFor(byPid.get(leaf.pid));
      if (pidCands.length === 1) return claim(pidCands[0]);
      if (pidCands.length > 1) {
        const hit = assignByScore([leaf], pidCands, geometryMatchScore).get(leaf);
        if (hit) return claim(hit);
      }
    }

    const ct = `${leaf.wmClass ?? ""}\0${leaf.title ?? ""}`;
    const ctCands = freeFor(byClassTitle.get(ct));
    if (ctCands.length === 1) return claim(ctCands[0]);

    const classKey = leaf.wmClass ?? "";
    if (classKey) {
      const classCands = freeFor(byClass.get(classKey));
      if (classCands.length === 1) return claim(classCands[0]);
      if (classCands.length > 1) {
        const hit = assignByScore([leaf], classCands, geometryMatchScore).get(leaf);
        if (hit) return claim(hit);
      }
    }
    return null;
  };

  return resolveOne;
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
 * Passes the forest so multi-window cohorts use global assignment.
 * @param {{ monitors?: any[] }|null} portableForest
 * @param {Iterable<any>} metaWindows
 */
export function matchStatsAgainstWindows(portableForest, metaWindows) {
  return matchStats(portableForest, createWindowResolver(metaWindows, portableForest));
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
    const out = {
      window,
      percent: descriptor.percent ?? 0,
      userSized: !!descriptor.userSized,
    };
    // Keep saved frame/monitor for post-restore last-good seeding (soft rehome).
    if (descriptor.frame) out.frame = descriptor.frame;
    if (typeof descriptor.monitor === "number" && descriptor.monitor >= 0) {
      out.monitor = descriptor.monitor;
    }
    return out;
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

/**
 * Plan last-good home seeds after session restore so soft rehome uses saved
 * frames/mons (WeakMap is empty after HUP; thrash frames would pile both heads).
 *
 * Prefers leaf.frame / leaf.monitor from live leaves (toLiveForest preserves them
 * from portable). Optional portableForest fills gaps via structure walk.
 *
 * @param {{ monitors?: any[] }|null} liveForest
 * @param {{ monitors?: any[] }|null} [portableForest]
 * @returns {{
 *   window: any,
 *   monitorIndex: number,
 *   monId: string,
 *   frame: { x: number, y: number, width: number, height: number }|null,
 *   stableKey: string|null,
 * }[]}
 */
export function planLastGoodHomes(liveForest, portableForest = null) {
  /** @type {Map<any, any>} */
  const portableByWindow = new Map();
  /** @type {Map<string, string>} monId → stableKey */
  const stableByMonId = new Map();

  for (const mon of portableForest?.monitors || []) {
    if (mon?.id && mon.stableKey) stableByMonId.set(mon.id, mon.stableKey);
  }
  for (const mon of liveForest?.monitors || []) {
    if (mon?.id && mon.stableKey && !stableByMonId.has(mon.id)) {
      stableByMonId.set(mon.id, mon.stableKey);
    }
  }

  if (portableForest) {
    const liveWins = [];
    for (const mon of liveForest?.monitors || []) {
      for (const w of collectWindows(mon)) {
        if (w) liveWins.push(w);
      }
    }
    if (liveWins.length > 0) {
      const resolve = createWindowResolver(liveWins, portableForest);
      for (const leaf of collectPortableLeaves(portableForest)) {
        const w = resolve(leaf);
        if (w) portableByWindow.set(w, leaf);
      }
    }
  }

  const out = [];
  for (const monDesc of liveForest?.monitors || []) {
    const monId = monDesc?.id;
    if (!monId) continue;
    const monIndexFromId = MonitorIdentity.monIndexFromId(monId);
    const stableKey = monDesc.stableKey ?? stableByMonId.get(monId) ?? null;
    walkLiveWindowLeaves(monDesc, (leaf) => {
      const w = leaf.window;
      if (!w) return;
      const portable = portableByWindow.get(w);
      let monIndex = monIndexFromId;
      if (typeof leaf.monitor === "number" && leaf.monitor >= 0) monIndex = leaf.monitor;
      else if (typeof portable?.monitor === "number" && portable.monitor >= 0) {
        monIndex = portable.monitor;
      }
      if (monIndex < 0) return;

      const rawFrame = leaf.frame || portable?.frame || null;
      let frame = null;
      if (rawFrame) {
        const x = Number(rawFrame.x);
        const y = Number(rawFrame.y);
        const width = Number(rawFrame.width);
        const height = Number(rawFrame.height);
        if ([x, y, width, height].every((n) => Number.isFinite(n))) {
          frame = { x, y, width, height };
        }
      }
      out.push({
        window: w,
        monitorIndex: monIndex,
        monId,
        frame,
        stableKey,
      });
    });
  }
  return out;
}

/** @param {any} monDesc @param {(leaf: any) => void} cb */
function walkLiveWindowLeaves(monDesc, cb) {
  const walk = (d) => {
    if (!d) return;
    if (d.window && !d.children) {
      cb(d);
      return;
    }
    for (const c of d.children || []) walk(c);
  };
  for (const c of monDesc?.children || []) walk(c);
}
