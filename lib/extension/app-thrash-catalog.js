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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * In-memory app thrash catalog (CL3 + SL1/SE6 settle learning).
 *
 * Geometry thrash counters + open quiet. minQuiet uses D019 pad/clamp (same
 * math as settle-heuristics geom soft). Durable geom samples: CLI file;
 * catalog may seed from that store once. Built-in needsExtraVerify sticky.
 *
 * SE10: Ghostty minQuiet seed dropped (live ~225ms settle; thrashScore 0).
 */

import { Logger } from "../shared/logger.js";
import { PAD, ROLLING_N, lastRollingLatencies, softTimeoutFromLatencies } from "./settle-math.js";

/** Score at/above which needsExtraVerify becomes true for learned classes. */
export const THRASH_SCORE_THRESHOLD = 3;

/** Historical Ghostty seed; SE10 no longer applies as minQuiet floor. */
export const GHOSTTY_MIN_QUIET_MS = 0;

/** Pad on settle samples (D019 / settle-heuristics PAD). */
export const SETTLE_LEARN_PAD = PAD;

/** Hard cap (D019 geom soft clamp). */
export const SETTLE_LEARN_CAP_MS = 5000;

/** Rolling residual-positive samples (match settle-heuristics ROLLING_N). */
export const SETTLE_ROLLING_N = ROLLING_N;

/** EMA alpha for settleMsEma (first sample seeds EMA). */
export const SETTLE_EMA_ALPHA = 0.3;

/**
 * Built-in seeds. Ghostty keeps needsExtraVerify; minQuiet seed 0 (SE10).
 * @type {ReadonlyArray<{ keys: string[], minQuietMs: number, needsExtraVerify: boolean }>}
 */
export const BUILT_IN_THRASH_DEFAULTS = Object.freeze([
  Object.freeze({
    keys: Object.freeze(["com.mitchellh.ghostty", "ghostty"]),
    minQuietMs: 0,
    needsExtraVerify: true,
  }),
]);
/**
 * Normalize a wm_class for lookup (trim + lower-case).
 * @param {unknown} wmClass
 * @returns {string}
 */
export function normalizeWmClass(wmClass) {
  if (wmClass == null) return "";
  return String(wmClass).trim().toLowerCase();
}

/**
 * Parse settle-heuristics.json text (schema v1). Null if invalid.
 * @param {unknown} text
 * @returns {{ version: number, entries: Record<string, object> }|null}
 */
export function parseSettleHeuristicsJson(text) {
  if (text == null) return null;
  try {
    const data = typeof text === "string" ? JSON.parse(text) : text;
    if (!data || typeof data !== "object") return null;
    if (Number(data.version) !== 1) return null;
    if (data.entries != null && typeof data.entries !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Last dotted package segment, or the whole string if no dots.
 * "com.mitchellh.ghostty" → "ghostty"; "Firefox" → "firefox" (after normalize).
 * @param {unknown} wmClass
 * @returns {string}
 */
export function classStem(wmClass) {
  const n = normalizeWmClass(wmClass);
  if (!n) return "";
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : n;
}

/**
 * Pure thrash score from observation counters.
 * postApplyDrift weighted 2× (client overwrote our apply).
 *
 * @param {{ postMapSizeChanges?: number, postApplyDrift?: number }} counters
 * @returns {number}
 */
export function scoreFromCounters(counters = {}) {
  const postMap = Number(counters.postMapSizeChanges) || 0;
  const drift = Number(counters.postApplyDrift) || 0;
  const map = postMap > 0 ? postMap : 0;
  const d = drift > 0 ? drift : 0;
  return map + 2 * d;
}

/**
 * Learned minQuiet from residual samples (D019 / SE6).
 *
 * Prefer rolling latencies when provided: max(last N)*pad, floored by seed,
 * clamped. Fallback single-sample: max(seed, previous, pad(sample)) clamped
 * (raise-only when no history array).
 *
 * @param {{
 *   seedFloor?: number,
 *   previousMinQuiet?: number,
 *   sampleMs?: number,
 *   latenciesMs?: number[],
 *   pad?: number,
 *   cap?: number,
 * }} [opts]
 * @returns {number}
 */
export function computeLearnedMinQuietMs(opts = {}) {
  const seedFloor = _nonNeg(opts.seedFloor, 0);
  const previous = _nonNeg(opts.previousMinQuiet, 0);
  const sample = _nonNeg(opts.sampleMs, 0);
  const pad =
    typeof opts.pad === "number" && Number.isFinite(opts.pad) && opts.pad > 0
      ? opts.pad
      : SETTLE_LEARN_PAD;
  const cap =
    typeof opts.cap === "number" && Number.isFinite(opts.cap) && opts.cap >= 0
      ? opts.cap
      : SETTLE_LEARN_CAP_MS;

  // Rolling path → shared kernel (seedFloor=floor, cap=clamp).
  if (Array.isArray(opts.latenciesMs)) {
    return softTimeoutFromLatencies(lastRollingLatencies(opts.latenciesMs, SETTLE_ROLLING_N), {
      pad,
      floor: seedFloor,
      clamp: cap,
    });
  }

  // Single-sample raise-only when no latenciesMs array (product path, not kernel).
  const padded = sample * pad;
  const raised = Math.max(seedFloor, previous, padded);
  return Math.trunc(Math.min(cap, Math.max(0, raised)));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function _nonNeg(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * @param {string} primaryKey normalized preferred key
 * @param {object} [seed]
 * @returns {object}
 */
function makeEntry(primaryKey, seed = {}) {
  const builtIn = !!seed.builtIn;
  const needsExtra = builtIn && seed.needsExtraVerify !== false ? true : !!seed.needsExtraVerify;
  const seedQuiet =
    seed.seedMinQuietMs != null
      ? Number(seed.seedMinQuietMs)
      : seed.minQuietMs != null
      ? Number(seed.minQuietMs)
      : 0;
  const seedFloor = Number.isFinite(seedQuiet) && seedQuiet > 0 ? seedQuiet : 0;
  const minQuiet =
    seed.minQuietMs != null && Number.isFinite(Number(seed.minQuietMs))
      ? Math.max(0, Number(seed.minQuietMs))
      : seedFloor;
  const latencies = Array.isArray(seed.latenciesMs)
    ? lastRollingLatencies(seed.latenciesMs, SETTLE_ROLLING_N)
    : [];
  return {
    /** Preferred normalized key (first full class or stem). */
    key: primaryKey,
    seenOpens: Number(seed.seenOpens) || 0,
    postMapSizeChanges: Number(seed.postMapSizeChanges) || 0,
    postApplyDrift: Number(seed.postApplyDrift) || 0,
    thrashScore: Number(seed.thrashScore) || 0,
    /** Effective open quiet floor (seed ∪ learned rolling). */
    minQuietMs: minQuiet,
    /** Built-in / initial floor; never lowered by learning. */
    seedMinQuietMs: seedFloor,
    /** Rolling residual-positive settle latencies (SE6 / D019). */
    latenciesMs: latencies,
    settleSampleCount: Number(seed.settleSampleCount) || 0,
    settleMsLast: Number(seed.settleMsLast) || 0,
    settleMsMax: Number(seed.settleMsMax) || 0,
    settleMsEma: Number(seed.settleMsEma) || 0,
    /** Cumulative mismatches observed while waiting to settle (SL1). */
    mismatchBeforeSettle: Number(seed.mismatchBeforeSettle) || 0,
    builtIn,
    needsExtraVerify: needsExtra,
    /** True once we observed at least one open of this class (CL4 uses). */
    firstOpenObserved: !!seed.firstOpenObserved,
  };
}

/**
 * Refresh thrashScore and needsExtraVerify from counters.
 * Built-in needsExtraVerify stays true.
 * @param {object} entry
 */
function recomputeEntry(entry) {
  entry.thrashScore = scoreFromCounters({
    postMapSizeChanges: entry.postMapSizeChanges,
    postApplyDrift: entry.postApplyDrift,
  });
  if (entry.builtIn && entry.needsExtraVerify) {
    // sticky — observation may raise score but not clear the flag
    return;
  }
  if (entry.thrashScore >= THRASH_SCORE_THRESHOLD) {
    entry.needsExtraVerify = true;
  }
}

/**
 * Session thrash catalog. Memory only (v1).
 */
export class AppThrashCatalog {
  constructor() {
    /** @type {Map<string, object>} normalized key → entry (aliases share ref) */
    this._byKey = new Map();
    this._seedBuiltIns();
  }

  _seedBuiltIns() {
    for (const def of BUILT_IN_THRASH_DEFAULTS) {
      const keys = def.keys.map((k) => normalizeWmClass(k)).filter(Boolean);
      if (keys.length === 0) continue;
      const entry = makeEntry(keys[0], {
        builtIn: true,
        needsExtraVerify: def.needsExtraVerify !== false,
        minQuietMs: def.minQuietMs ?? GHOSTTY_MIN_QUIET_MS,
      });
      recomputeEntry(entry);
      for (const k of keys) {
        this._byKey.set(k, entry);
      }
      // Ensure stem of full keys also points at the same entry
      for (const k of keys) {
        const stem = classStem(k);
        if (stem && !this._byKey.has(stem)) {
          this._byKey.set(stem, entry);
        }
      }
    }
  }

  /**
   * Lookup by wm_class (case-insensitive; full class or stem).
   * @param {unknown} wmClass
   * @returns {object|null} live entry or null
   */
  lookup(wmClass) {
    const n = normalizeWmClass(wmClass);
    if (!n) return null;
    if (this._byKey.has(n)) return this._byKey.get(n);
    const stem = classStem(n);
    if (stem && stem !== n && this._byKey.has(stem)) {
      return this._byKey.get(stem);
    }
    return null;
  }

  /**
   * Get existing entry or create a learned (non-built-in) one.
   * If stem matches a built-in, returns that shared entry and aliases full key.
   * @param {unknown} wmClass
   * @returns {object|null}
   */
  getOrCreate(wmClass) {
    const n = normalizeWmClass(wmClass);
    if (!n) return null;
    const existing = this.lookup(n);
    if (existing) {
      // Alias full class onto existing (e.g. first time we see reverse DNS for stem)
      if (!this._byKey.has(n)) {
        this._byKey.set(n, existing);
      }
      return existing;
    }
    const entry = makeEntry(n, { builtIn: false });
    recomputeEntry(entry);
    this._byKey.set(n, entry);
    const stem = classStem(n);
    if (stem && stem !== n && !this._byKey.has(stem)) {
      this._byKey.set(stem, entry);
    }
    return entry;
  }

  /**
   * First-map / open observation (optional bookkeeping for CL4).
   * @param {unknown} wmClass
   * @returns {object|null}
   */
  recordOpen(wmClass) {
    const entry = this.getOrCreate(wmClass);
    if (!entry) return null;
    entry.seenOpens += 1;
    entry.firstOpenObserved = true;
    return entry;
  }

  /**
   * External post-map size-changed (not Forge-suppressed).
   * @param {unknown} wmClass
   * @returns {object|null}
   */
  recordPostMapSizeChange(wmClass) {
    const entry = this.getOrCreate(wmClass);
    if (!entry) return null;
    entry.postMapSizeChanges += 1;
    recomputeEntry(entry);
    return entry;
  }

  /**
   * Frame left slot after our apply (not Forge-suppressed).
   * @param {unknown} wmClass
   * @returns {object|null}
   */
  recordPostApplyDrift(wmClass) {
    const entry = this.getOrCreate(wmClass);
    if (!entry) return null;
    entry.postApplyDrift += 1;
    recomputeEntry(entry);
    return entry;
  }

  /**
   * @param {unknown} wmClass
   * @returns {boolean}
   */
  needsExtraVerify(wmClass) {
    const entry = this.lookup(wmClass);
    return !!(entry && entry.needsExtraVerify);
  }

  /**
   * SL1/SE6: time-to-stable sample → rolling latencies + minQuiet (D019 math).
   *
   * @param {unknown} wmClass
   * @param {{ ms?: number, kind?: string, mismatches?: number }} [sample]
   * @returns {object|null} entry or null
   */
  recordSettleSample(wmClass, sample = {}) {
    const entry = this.getOrCreate(wmClass);
    if (!entry) return null;

    const ms = _nonNeg(sample.ms, 0);
    const mismatches = _nonNeg(sample.mismatches, 0);

    if (mismatches > 0) {
      entry.mismatchBeforeSettle += mismatches;
    }

    entry.settleSampleCount += 1;
    entry.settleMsLast = ms;
    if (ms > entry.settleMsMax) entry.settleMsMax = ms;

    if (entry.settleSampleCount === 1) {
      entry.settleMsEma = ms;
    } else {
      const a = SETTLE_EMA_ALPHA;
      entry.settleMsEma = a * ms + (1 - a) * entry.settleMsEma;
    }

    if (!Array.isArray(entry.latenciesMs)) entry.latenciesMs = [];
    // Residual-positive only: zero-ms samples do not push 0 (match Python store).
    if (ms > 0) {
      entry.latenciesMs.push(ms);
      entry.latenciesMs = lastRollingLatencies(entry.latenciesMs, SETTLE_ROLLING_N);
    }

    const prevQuiet = entry.minQuietMs;
    const nextQuiet = computeLearnedMinQuietMs({
      seedFloor: entry.seedMinQuietMs,
      previousMinQuiet: prevQuiet,
      sampleMs: ms,
      latenciesMs: entry.latenciesMs,
      pad: SETTLE_LEARN_PAD,
      cap: SETTLE_LEARN_CAP_MS,
    });
    entry.minQuietMs = nextQuiet;

    if (nextQuiet !== prevQuiet) {
      const kind = sample.kind != null ? String(sample.kind) : "open";
      Logger.debug(
        `app-thrash-catalog: minQuietMs ${entry.key} ` +
          `${prevQuiet}→${nextQuiet}ms (sample=${ms}ms kind=${kind})`
      );
    }

    return entry;
  }

  /**
   * SE6: seed minQuiet from settle-heuristics geom entries (load once).
   * Keys host|class|processKind|residualKind; only residualKind=geom used.
   *
   * @param {{ version?: number, entries?: Record<string, object> }|null|undefined} store
   * @param {{ host?: string }} [opts]
   * @returns {number} entries applied
   */
  applySettleHeuristicsStore(store, opts = {}) {
    if (!store || typeof store !== "object") return 0;
    const entries = store.entries;
    if (!entries || typeof entries !== "object") return 0;
    const hostFilter =
      opts.host != null && String(opts.host).trim() ? String(opts.host).trim().toLowerCase() : "";
    let applied = 0;
    for (const [key, raw] of Object.entries(entries)) {
      if (!raw || typeof raw !== "object") continue;
      const parts = String(key).split("|");
      if (parts.length < 4) continue;
      const [host, cls, _pk, rk] = parts;
      if (String(rk).toLowerCase() !== "geom") continue;
      if (hostFilter && String(host).toLowerCase() !== hostFilter) continue;
      const wmClass = String(raw.class || cls || "").trim();
      if (!wmClass) continue;
      const lats = Array.isArray(raw.latenciesMs)
        ? lastRollingLatencies(raw.latenciesMs, SETTLE_ROLLING_N)
        : [];
      if (!lats.length) continue;
      const entry = this.getOrCreate(wmClass);
      if (!entry) continue;
      // Merge rolling samples; recompute minQuiet from combined history.
      if (!Array.isArray(entry.latenciesMs)) entry.latenciesMs = [];
      for (const ms of lats) {
        entry.latenciesMs.push(ms);
      }
      entry.latenciesMs = lastRollingLatencies(entry.latenciesMs, SETTLE_ROLLING_N);
      entry.minQuietMs = computeLearnedMinQuietMs({
        seedFloor: entry.seedMinQuietMs,
        latenciesMs: entry.latenciesMs,
        pad: SETTLE_LEARN_PAD,
        cap: SETTLE_LEARN_CAP_MS,
      });

      applied += 1;
    }
    return applied;
  }

  /**
   * Snapshot of unique entries (for tests / debug). Live object refs.
   * @returns {object[]}
   */
  entries() {
    const seen = new Set();
    const out = [];
    for (const e of this._byKey.values()) {
      if (seen.has(e)) continue;
      seen.add(e);
      out.push(e);
    }
    return out;
  }

  /**
   * Plain-object snapshot including settle fields (tests / debug export).
   * @returns {object[]}
   */
  snapshot() {
    return this.entries().map((e) => ({
      key: e.key,
      builtIn: !!e.builtIn,
      needsExtraVerify: !!e.needsExtraVerify,
      thrashScore: e.thrashScore,
      postMapSizeChanges: e.postMapSizeChanges,
      postApplyDrift: e.postApplyDrift,
      seenOpens: e.seenOpens,
      firstOpenObserved: !!e.firstOpenObserved,
      minQuietMs: e.minQuietMs,
      seedMinQuietMs: e.seedMinQuietMs,
      latenciesMs: Array.isArray(e.latenciesMs) ? e.latenciesMs.slice() : [],
      settleSampleCount: e.settleSampleCount,
      settleMsLast: e.settleMsLast,
      settleMsMax: e.settleMsMax,
      settleMsEma: e.settleMsEma,
      mismatchBeforeSettle: e.mismatchBeforeSettle,
    }));
  }
}

/**
 * Extract wm_class from a Meta.Window-like or plain object.
 * @param {unknown} metaWindow
 * @returns {string|null}
 */
export function extractWmClass(metaWindow) {
  if (!metaWindow || typeof metaWindow !== "object") return null;
  try {
    if (typeof metaWindow.get_wm_class === "function") {
      const c = metaWindow.get_wm_class();
      return c != null && c !== "" ? String(c) : null;
    }
  } catch {
    return null;
  }
  if (metaWindow.wmClass != null && metaWindow.wmClass !== "") {
    return String(metaWindow.wmClass);
  }
  if (metaWindow.wm_class != null && metaWindow.wm_class !== "") {
    return String(metaWindow.wm_class);
  }
  return null;
}

/**
 * True if any managed TILE window's class needs extra verify.
 *
 * @param {{ tree?: { getNodeByType?: (t: string) => any[] }, _tree?: { getNodeByType?: (t: string) => any[] } }|null|undefined} wm
 * @param {AppThrashCatalog|null|undefined} catalog
 * @returns {boolean}
 */
export function hasThrashyManagedTile(wm, catalog) {
  if (!catalog) return false;
  const tree = wm?.tree ?? wm?._tree;
  if (!tree || typeof tree.getNodeByType !== "function") return false;

  let windows = [];
  try {
    windows = tree.getNodeByType("WINDOW") ?? [];
  } catch {
    return false;
  }

  for (const node of windows) {
    if (!node || node.mode !== "TILE") continue;
    const meta = node.nodeValue;
    const cls = extractWmClass(meta);
    if (cls && catalog.needsExtraVerify(cls)) return true;
  }
  return false;
}
