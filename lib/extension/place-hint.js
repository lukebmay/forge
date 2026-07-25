/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure one-shot place-next hints (FC2). Unit-testable without Mutter.
 *
 * Hint shape:
 *   { wmClass?, monitor?, treePath?, attachSelector?, expiresAt, first? }
 */

/** Default TTL for PlaceNext hints (ms). */
export const PLACE_HINT_TTL_MS = 15000;

/** Max pending hints retained (queue cap). */
export const PLACE_HINT_MAX = 8;

/**
 * @typedef {{
 *   wmClass?: string|null,
 *   monitor?: string|number|null,
 *   treePath?: string|null,
 *   attachSelector?: string|null,
 *   expiresAt: number,
 *   first?: boolean,
 * }} PlaceHint
 */

/**
 * Extract wm_class from a Meta-like window or plain object.
 * @param {any} metaLike
 * @returns {string|null}
 */
export function metaWmClass(metaLike) {
  if (!metaLike || typeof metaLike !== "object") return null;
  try {
    if (typeof metaLike.get_wm_class === "function") {
      return metaLike.get_wm_class() || null;
    }
  } catch (_e) {
    /* ignore */
  }
  if (typeof metaLike.wmClass === "string") return metaLike.wmClass || null;
  if (typeof metaLike.wm_class === "string") return metaLike.wm_class || null;
  return null;
}

/**
 * wm_class equality (case-insensitive — GNOME classes are often Title-Case).
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function wmClassEqual(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Whether a mapped window matches a pending place hint.
 * Expired hints never match. When hint.wmClass is set, class match is
 * case-insensitive (Meta get_wm_class / wmClass / wm_class). No class → any window.
 *
 * @param {any} metaLike
 * @param {PlaceHint|null|undefined} hint
 * @param {number} [now]
 * @returns {boolean}
 */
export function matchesPlaceHint(metaLike, hint, now = Date.now()) {
  if (!hint || typeof hint !== "object") return false;
  if (hint.expiresAt != null && Number.isFinite(Number(hint.expiresAt))) {
    if (now > Number(hint.expiresAt)) return false;
  }
  const want = hint.wmClass != null && hint.wmClass !== "" ? String(hint.wmClass) : null;
  if (want) {
    const got = metaWmClass(metaLike);
    if (!got || !wmClassEqual(got, want)) return false;
  }
  return true;
}

/**
 * Drop expired entries (mutates queue).
 * @param {PlaceHint[]} queue
 * @param {number} [now]
 * @returns {PlaceHint[]}
 */
export function pruneExpiredPlaceHints(queue, now = Date.now()) {
  if (!queue || !queue.length) return queue || [];
  let w = 0;
  for (let i = 0; i < queue.length; i++) {
    const h = queue[i];
    if (!h) continue;
    if (h.expiresAt != null && Number.isFinite(Number(h.expiresAt)) && now > Number(h.expiresAt)) {
      continue;
    }
    queue[w++] = h;
  }
  queue.length = w;
  return queue;
}

/**
 * Find best matching hint index (LIFO; prefer wmClass-specific over wildcard).
 * Does not mutate. Returns -1 if none.
 *
 * @param {PlaceHint[]} queue
 * @param {any} metaLike
 * @param {number} [now]
 * @returns {number}
 */
export function findMatchingPlaceHintIndex(queue, metaLike, now = Date.now()) {
  if (!queue || !queue.length) return -1;
  const got = metaWmClass(metaLike);
  let wildcard = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    const h = queue[i];
    if (!matchesPlaceHint(metaLike, h, now)) continue;
    const want = h.wmClass != null && h.wmClass !== "" ? String(h.wmClass) : null;
    if (want) {
      // Specific match — prefer immediately (case-insensitive).
      if (got && wmClassEqual(got, want)) return i;
      continue;
    }
    // Wildcard only when window has no conflicting class requirement.
    if (wildcard < 0) wildcard = i;
  }
  // Specific-class pending must not be stolen by wrong class: already filtered.
  // If meta has a class and only wildcards remain, still allow wildcard (CLI
  // may set PlaceNext without --wm-class when waiting on another signal).
  return wildcard;
}

/**
 * Find + remove matching hint. Mutates queue. Returns hint or null.
 *
 * @param {PlaceHint[]} queue
 * @param {any} metaLike
 * @param {number} [now]
 * @returns {PlaceHint|null}
 */
export function consumePlaceHint(queue, metaLike, now = Date.now()) {
  pruneExpiredPlaceHints(queue, now);
  const idx = findMatchingPlaceHintIndex(queue, metaLike, now);
  if (idx < 0) return null;
  const [hint] = queue.splice(idx, 1);
  return hint || null;
}

/**
 * Normalize PlaceNext options into a queue entry.
 * Requires at least one of monitor / treePath / attachSelector.
 *
 * @param {object} options
 * @param {number} [now]
 * @returns {{ ok: true, hint: PlaceHint } | { ok: false, error: string }}
 */
export function normalizePlaceHint(options, now = Date.now()) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { ok: false, error: "options must be an object" };
  }

  let wmClass = options.wmClass ?? options.wm_class ?? null;
  if (wmClass != null) wmClass = String(wmClass).trim() || null;

  let monitor = options.monitor;
  if (monitor === "" || monitor === undefined) monitor = null;

  let treePath = options.treePath ?? options.tree_path ?? null;
  if (treePath != null) {
    treePath = String(treePath).trim();
    if (treePath.startsWith("path:")) treePath = treePath.slice(5).trim();
    if (!treePath) treePath = null;
  }

  let attachSelector = options.attachSelector ?? options.attach_selector ?? null;
  if (attachSelector != null) {
    attachSelector = String(attachSelector).trim() || null;
  }

  if (monitor == null && !treePath && !attachSelector) {
    return {
      ok: false,
      error: "PlaceNext requires monitor, treePath, or attachSelector",
    };
  }

  let expiresAt = options.expiresAt ?? options.expires_at ?? null;
  if (expiresAt != null) {
    expiresAt = Number(expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return { ok: false, error: "invalid expiresAt" };
    }
  } else {
    let ttl = options.ttlMs ?? options.ttl_ms ?? PLACE_HINT_TTL_MS;
    ttl = Number(ttl);
    if (!Number.isFinite(ttl) || ttl < 0) ttl = PLACE_HINT_TTL_MS;
    expiresAt = now + ttl;
  }

  /** @type {PlaceHint} */
  const hint = {
    wmClass,
    monitor,
    treePath,
    attachSelector,
    expiresAt,
    first: !!(options.first ?? false),
  };
  return { ok: true, hint };
}

/**
 * Push hint onto queue (prune + cap). Mutates queue.
 * @param {PlaceHint[]} queue
 * @param {PlaceHint} hint
 * @param {number} [now]
 * @param {number} [max]
 * @returns {PlaceHint[]}
 */
export function enqueuePlaceHint(queue, hint, now = Date.now(), max = PLACE_HINT_MAX) {
  if (!queue) return [hint];
  pruneExpiredPlaceHints(queue, now);
  queue.push(hint);
  while (queue.length > max) queue.shift();
  return queue;
}

/**
 * Resolve monitor option to a non-negative index, or -1.
 * Accepts number, "N", "moN", "moNwsW", "primary", liveMap stableKey.
 *
 * @param {string|number|null|undefined} spec
 * @param {{
 *   liveMap?: { byKey?: Map<string, number> }|null,
 *   primaryMonitor?: number,
 *   monCount?: number,
 * }} [ctx]
 * @returns {number}
 */
export function resolvePlaceMonitorIndex(spec, ctx = {}) {
  if (spec == null || spec === "") return -1;
  if (typeof spec === "number" && Number.isFinite(spec) && spec >= 0) {
    return Math.floor(spec);
  }
  const s = String(spec).trim();
  if (!s) return -1;

  if (s === "primary") {
    const p = ctx.primaryMonitor;
    return p != null && p >= 0 ? p : 0;
  }

  if (/^\d+$/.test(s)) {
    return parseInt(s, 10);
  }

  const moWs = /^mo(\d+)ws\d+$/.exec(s);
  if (moWs) return parseInt(moWs[1], 10);

  const moOnly = /^mo(\d+)$/.exec(s);
  if (moOnly) return parseInt(moOnly[1], 10);

  const liveMap = ctx.liveMap;
  if (liveMap?.byKey?.has?.(s)) {
    const idx = liveMap.byKey.get(s);
    return idx != null && idx >= 0 ? idx : -1;
  }

  return -1;
}
