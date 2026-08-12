/*
 * This file is part of the Forge extension for GNOME
 *
 * Workareas fingerprint + change classification (R016).
 * Pure — no GObject/GJS globals. Compose with H1 monitor-recovery.
 */

import { buildLiveMap, fingerprintMonitor } from "./monitor-identity.js";

/**
 * @typedef {{
 *   stableKey: string,
 *   index: number,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   isPrimary: boolean,
 * }} WorkareasMonFp
 */

/**
 * @typedef {{ monitors: WorkareasMonFp[] }} WorkareasFingerprint
 */

/**
 * Ordered geometry+identity fingerprint from MonitorInfo-like objects.
 * Includes dimensions (scale/mode) and stableKey (connector renumber).
 *
 * @param {import('./monitor-identity.js').MonitorInfo[]|null|undefined} monitorsInfo
 * @returns {WorkareasFingerprint}
 */
export function buildWorkareasFingerprint(monitorsInfo) {
  const live = buildLiveMap(Array.isArray(monitorsInfo) ? monitorsInfo : []);
  const monitors = live.fingerprints.map((fp) => ({
    stableKey: fp.stableKey || fingerprintMonitor(fp),
    index: num(fp.index, 0),
    x: num(fp.x, 0),
    y: num(fp.y, 0),
    width: num(fp.width, 0),
    height: num(fp.height, 0),
    isPrimary: !!fp.isPrimary,
  }));
  // Stable order by index for equality / classify.
  monitors.sort((a, b) => a.index - b.index);
  return { monitors };
}

/**
 * Deep equality of workareas fingerprints (no-op predicate).
 * @param {WorkareasFingerprint|null|undefined} a
 * @param {WorkareasFingerprint|null|undefined} b
 * @returns {boolean}
 */
export function workareasFingerprintsEqual(a, b) {
  if (a === b) return true;
  if (!a?.monitors || !b?.monitors) return false;
  if (a.monitors.length !== b.monitors.length) return false;
  for (let i = 0; i < a.monitors.length; i++) {
    const x = a.monitors[i];
    const y = b.monitors[i];
    if (!x || !y) return false;
    if (
      x.stableKey !== y.stableKey ||
      x.index !== y.index ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.width !== y.width ||
      x.height !== y.height ||
      !!x.isPrimary !== !!y.isPrimary
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Geometry-only equality (index, rect, primary). Ignores stableKey format
 * differences (conn: vs geom:) so R017 can detect scale/mode drift from
 * display geometry even when the quiet fp was connector-keyed.
 *
 * @param {WorkareasFingerprint|null|undefined} a
 * @param {WorkareasFingerprint|null|undefined} b
 * @returns {boolean}
 */
export function workareasGeometryEqual(a, b) {
  if (a === b) return true;
  if (!a?.monitors || !b?.monitors) return false;
  if (a.monitors.length !== b.monitors.length) return false;
  for (let i = 0; i < a.monitors.length; i++) {
    const x = a.monitors[i];
    const y = b.monitors[i];
    if (!x || !y) return false;
    if (
      x.index !== y.index ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.width !== y.width ||
      x.height !== y.height ||
      !!x.isPrimary !== !!y.isPrimary
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Classify workareas change for graduated settle (R016).
 *
 * @param {WorkareasFingerprint|null|undefined} prevFp
 * @param {WorkareasFingerprint|null|undefined} nextFp
 * @returns {"noop"|"retile"|"renumber"|"mon_loss"|"mon_gain"|"thrash"}
 */
export function classifyWorkareasChange(prevFp, nextFp) {
  if (!nextFp?.monitors?.length) return "thrash";
  if (!prevFp?.monitors?.length) return "thrash";

  if (workareasFingerprintsEqual(prevFp, nextFp)) return "noop";

  const prevN = prevFp.monitors.length;
  const nextN = nextFp.monitors.length;

  // Same mon count: scale/mode/pos and any stableKey rewrite (geom: keys change
  // on every scale) are structure-preserving retile — never H1 thrash.
  // (R017 reverse: no-scale→default was thrashing via geom-key lost+gained.)
  if (prevN === nextN) {
    if (workareasGeometryEqual(prevFp, nextFp)) {
      // Geometry quiet: index/primary/key-format only → renumber (H1 remap).
      return "renumber";
    }
    return "retile";
  }

  const prevKeys = multiset(prevFp.monitors.map((m) => m.stableKey));
  const nextKeys = multiset(nextFp.monitors.map((m) => m.stableKey));
  const lost = keysOnlyIn(prevKeys, nextKeys);
  const gained = keysOnlyIn(nextKeys, prevKeys);

  if (lost.length > 0 && gained.length > 0) return "thrash";
  if (lost.length > 0 && nextN > 0) return "mon_loss";
  if (gained.length > 0 && lost.length === 0) return "mon_gain";

  return "thrash";
}

/**
 * Survivor mon index for mon-loss collect: primary if live, else lowest index.
 * @param {WorkareasFingerprint|null|undefined} nextFp
 * @returns {number}
 */
export function pickCollectSurvivorIndex(nextFp) {
  const mons = nextFp?.monitors;
  if (!Array.isArray(mons) || mons.length === 0) return 0;
  const primary = mons.find((m) => m && m.isPrimary);
  if (primary && primary.index >= 0) return primary.index;
  let best = mons[0].index;
  for (const m of mons) {
    if (m && typeof m.index === "number" && m.index < best) best = m.index;
  }
  return best >= 0 ? best : 0;
}

/**
 * Pure homes-ok check from precollected samples.
 * Tree mon and Meta mon must agree; last-good mon (when set) must match Meta.
 *
 * @param {Array<{
 *   treeMon?: number,
 *   metaMon?: number,
 *   lastGoodMon?: number,
 * }>|null|undefined} samples
 * @returns {boolean}
 */
export function homesMatchLastGoodSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return true;
  for (const s of samples) {
    if (!s) continue;
    const meta = num(s.metaMon, -1);
    if (meta < 0) continue; // unready Meta — skip
    const tree = num(s.treeMon, -1);
    if (tree >= 0 && tree !== meta) return false;
    const good = num(s.lastGoodMon, -1);
    if (good >= 0 && good !== meta) return false;
  }
  return true;
}

/**
 * Prev mon indices whose stableKey is absent from next (dead heads).
 * @param {WorkareasFingerprint|null|undefined} prevFp
 * @param {WorkareasFingerprint|null|undefined} nextFp
 * @returns {number[]}
 */
export function deadMonitorIndices(prevFp, nextFp) {
  const nextKeys = new Set((nextFp?.monitors || []).map((m) => m.stableKey));
  const out = [];
  for (const m of prevFp?.monitors || []) {
    if (!m || nextKeys.has(m.stableKey)) continue;
    if (typeof m.index === "number" && m.index >= 0) out.push(m.index);
  }
  return out;
}

/** @param {string[]} keys */
function multiset(keys) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const k of keys) {
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** @param {Map<string, number>} a @param {Map<string, number>} b */
function keysOnlyIn(a, b) {
  const out = [];
  for (const [k, n] of a) {
    const bn = b.get(k) || 0;
    if (n > bn) {
      for (let i = 0; i < n - bn; i++) out.push(k);
    }
  }
  return out;
}

/** @param {unknown} v @param {number} fallback */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
