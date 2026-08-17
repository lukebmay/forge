/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure one-shot place-next hints (FC2). Unit-testable without Mutter.
 *
 * Hint shape:
 *   { wmClass?, titleContains?, titleExact?, monitor?, treePath?, attachSelector?, expiresAt, first? }
 *
 * Apply dest kind (D042) lives in layout-open; re-exported here for PlaceNext.
 */

export {
  isMonRootTreePath,
  placeNextDestKind,
  placeNextHasSlotDest,
} from "../shared/layout-open.js";

/** Default TTL for PlaceNext hints (ms). */
export const PLACE_HINT_TTL_MS = 15000;

/** Max pending hints retained (queue cap). */
export const PLACE_HINT_MAX = 8;

/**
 * @typedef {{
 *   wmClass?: string|null,
 *   titleContains?: string|null,
 *   titleExact?: string|null,
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
 * Window title from Meta-like or plain object.
 * @param {any} metaLike
 * @returns {string|null}
 */
export function metaTitle(metaLike) {
  if (!metaLike || typeof metaLike !== "object") return null;
  try {
    if (typeof metaLike.get_title === "function") {
      const t = metaLike.get_title();
      if (t != null && String(t).trim() !== "") return String(t);
    }
  } catch (_e) {
    /* ignore */
  }
  if (typeof metaLike.title === "string" && metaLike.title.trim() !== "") {
    return metaLike.title;
  }
  return null;
}

/**
 * Title identity for PlaceNext (X11 Chrome PWAs share wmClass).
 * @param {any} metaLike
 * @param {PlaceHint|null|undefined} hint
 * @returns {boolean} true when no title constraint, or title matches
 */
export function matchesPlaceHintTitle(metaLike, hint) {
  if (!hint || typeof hint !== "object") return false;
  const exact =
    hint.titleExact != null && String(hint.titleExact).trim() !== ""
      ? String(hint.titleExact).trim()
      : null;
  const contains =
    hint.titleContains != null && String(hint.titleContains).trim() !== ""
      ? String(hint.titleContains).trim()
      : null;
  if (!exact && !contains) return true;
  const title = metaTitle(metaLike);
  if (title == null) return false;
  if (exact != null) return title === exact;
  return title.includes(contains);
}

/**
 * Chrome/Chromium browser wm_class (not a PWA instance id).
 * @param {string} s already lower/trimmed preferred
 * @returns {boolean}
 */
export function isChromeBrowserClass(s) {
  if (!s) return false;
  const n = String(s).trim().toLowerCase();
  if (!n) return false;
  if (n === "google-chrome" || n === "chromium" || n === "chromium-browser" || n === "chrome") {
    return true;
  }
  // google-chrome-stable / -beta / -unstable
  if (n.startsWith("google-chrome-")) return true;
  return false;
}

/**
 * Stable Chrome PWA app id: StartupWMClass `crx_<id>` and Meta
 * `chrome-<id>-Default` / profile-ish share the same id.
 * @param {string} s
 * @returns {string|null}
 */
export function chromePwaAppId(s) {
  const n = String(s ?? "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (n.startsWith("crx_") && n.length > 4) return n.slice(4);
  if (!n.startsWith("chrome-")) return null;
  const rest = n.slice("chrome-".length);
  if (rest.endsWith("-default") && rest.length > "-default".length) {
    return rest.slice(0, -"-default".length);
  }
  // chrome-<id>-profile / chrome-<id>-profile_1 / chrome-<id>-profile.foo
  const m = rest.match(/^(.+)-profile(?:[._-].+)?$/);
  if (m && m[1]) return m[1];
  return null;
}

/**
 * Desktop file ids for a Chrome PWA Meta class (`chrome-<id>-Default`).
 * StartupWMClass is often `crx_<id>` while Meta reports chrome-*-Default, so
 * WindowTracker may bind bare Chrome — callers lookup these via AppSystem.
 * @param {string} s
 * @returns {string[]}
 */
export function chromePwaDesktopIds(s) {
  const id = chromePwaAppId(s);
  if (!id) return [];
  // Desktop files on disk use capital Default; also try lowercase.
  return [`chrome-${id}-Default.desktop`, `chrome-${id}-default.desktop`];
}

/**
 * Prefer the PWA Shell.App over a generic Chrome tracker hit when possible.
 * @param {string|null|undefined} wmClass
 * @param {{ get_id?: () => string }|null|undefined} trackedApp
 * @param {{ lookup_app?: (id: string) => any }|null|undefined} appSystem
 * @returns {any|null} PWA app if resolved; null to keep trackedApp
 */
export function preferChromePwaApp(wmClass, trackedApp, appSystem) {
  const ids = chromePwaDesktopIds(wmClass);
  if (!ids.length || !appSystem?.lookup_app) return null;
  const trackedId = String(trackedApp?.get_id?.() ?? "")
    .trim()
    .toLowerCase();
  const pwaId = chromePwaAppId(wmClass);
  // Tracker already bound the matching chrome-<id> desktop — keep it.
  if (pwaId && trackedId.includes(pwaId) && trackedId.startsWith("chrome-")) {
    return trackedApp;
  }
  for (const did of ids) {
    try {
      const app = appSystem.lookup_app(did);
      if (app) return app;
    } catch (_e) {
      // AppSystem unavailable / lookup throws
    }
  }
  return null;
}

/**
 * Chrome PWA / extension app window class (Meta often uses these, not Google-chrome).
 * @param {string} s
 * @returns {boolean}
 */
export function isChromePwaClass(s) {
  return chromePwaAppId(s) != null;
}

/** @param {string} s @returns {boolean} */
export function isChromeFamilyClass(s) {
  const n = String(s ?? "")
    .trim()
    .toLowerCase();
  return isChromeBrowserClass(n) || isChromePwaClass(n);
}

/**
 * wm_class equality: case-insensitive, reverse-DNS stem sugar
 * (ghostty ↔ com.mitchellh.ghostty), plus Chrome browser ↔ PWA ids
 * (Google-chrome ↔ chrome-*-Default / crx_*). Same PWA app id matches across
 * crx_* and chrome-*-Default; distinct PWAs never match unless exact.
 * Browser ↔ browser is allowed.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function wmClassEqual(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  // Stem sugar: last DNS label matches short class (PlaceNext / layout wait).
  if (sa.endsWith("." + sb) || sb.endsWith("." + sa)) return true;
  // Same Chrome PWA app: crx_<id> ↔ chrome-<id>-Default
  const aId = chromePwaAppId(sa);
  const bId = chromePwaAppId(sb);
  if (aId && bId && aId === bId) return true;
  // Browser ↔ PWA (either side); browser ↔ browser. Never PWA ↔ different PWA.
  const aBrowser = isChromeBrowserClass(sa);
  const bBrowser = isChromeBrowserClass(sb);
  const aPwa = isChromePwaClass(sa);
  const bPwa = isChromePwaClass(sb);
  if ((aBrowser && bPwa) || (aPwa && bBrowser)) return true;
  if (aBrowser && bBrowser) return true;
  return false;
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
  // Title first: multi Chrome maps share Google-chrome on X11.
  if (!matchesPlaceHintTitle(metaLike, hint)) return false;

  const want = hint.wmClass != null && hint.wmClass !== "" ? String(hint.wmClass) : null;
  if (want) {
    const got = metaWmClass(metaLike);
    if (!got) return false;
    const wantCf = want.trim().toLowerCase();
    const gotCf = String(got).trim().toLowerCase();
    // PWA-specific hint + bare browser class: only via title (already checked).
    // Do not let every Google-chrome steal every chrome-* PlaceNext.
    if (isChromePwaClass(wantCf) && isChromeBrowserClass(gotCf)) {
      const hasTitle =
        (hint.titleContains != null && String(hint.titleContains).trim() !== "") ||
        (hint.titleExact != null && String(hint.titleExact).trim() !== "");
      if (!hasTitle) return false;
      // Title matched above; allow browser class for this PWA role.
    } else if (!wmClassEqual(got, want)) {
      return false;
    }
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
  let best = -1;
  let bestScore = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    const h = queue[i];
    if (!matchesPlaceHint(metaLike, h, now)) continue;
    const want = h.wmClass != null && h.wmClass !== "" ? String(h.wmClass) : null;
    const hasTitle =
      (h.titleContains != null && String(h.titleContains).trim() !== "") ||
      (h.titleExact != null && String(h.titleExact).trim() !== "");
    // Prefer title identity, then exact class, then loose class, then wildcard.
    let score = 0;
    if (hasTitle) score += 100;
    if (want && got) {
      const wantCf = want.trim().toLowerCase();
      const gotCf = String(got).trim().toLowerCase();
      if (wantCf === gotCf || chromePwaAppId(wantCf) === chromePwaAppId(gotCf)) {
        score += 50;
      } else if (wmClassEqual(got, want)) {
        score += 10;
      }
    } else if (!want) {
      score += 1; // wildcard
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
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

  let titleContains = options.titleContains ?? options.title_contains ?? options["title~="] ?? null;
  if (titleContains != null) titleContains = String(titleContains).trim() || null;

  let titleExact = options.titleExact ?? options.title_exact ?? options.title ?? null;
  // Bare title only when title~= not set (same as CLI pin fields).
  if (titleContains != null) titleExact = null;
  if (titleExact != null) titleExact = String(titleExact).trim() || null;

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
    titleContains,
    titleExact,
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
