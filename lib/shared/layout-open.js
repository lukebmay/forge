/*
 * Layout open policy (AL6): launch fields, Ghostty rewrite, chrome-family
 * serialize, map-pin assign (D034). Pure JSON — no gi://, node:, or fs.
 */

import { monHeadAndRest, isChromeFamilyClass, classEq } from "./layout-plan.js";

export const GHOSTTY_MULTI_INSTANCE_FLAG = "--gtk-single-instance=false";
export const DEFAULT_OPEN_PIN_TIMEOUT_MS = 15000;
export const DEFAULT_OPEN_PIN_POLL_MS = 120;

const GHOSTTY_STEMS = new Set(["ghostty", "com.mitchellh.ghostty"]);

function baseName(p) {
  const s = String(p || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Basename / reverse-DNS last label, casefolded. */
export function ghosttyStem(token) {
  let t = String(token || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (!t) return "";
  let name = baseName(t);
  if (name.toLowerCase().endsWith(".desktop")) name = name.slice(0, -".desktop".length);
  const cf = name.toLowerCase();
  if (cf.includes(".")) {
    const parts = cf.split(".");
    return parts[parts.length - 1] || cf;
  }
  return cf;
}

/**
 * True when app is a filesystem path (argv spawn), not a .desktop Name/id.
 * Multi-word desktop Names (e.g. "Google Voice") must NOT count as shell argv.
 * @param {string} app
 * @returns {boolean}
 */
export function isPathLikeLaunchApp(app) {
  const s = String(app ?? "").trim();
  if (!s) return false;
  return s.startsWith("/") || s.startsWith(".");
}

/**
 * Desktop id / search tokens for ApplyLayout spawn (before shell argv fallback).
 * Prefers chrome PWA .desktop from wm_class, then app as id / Name search seed.
 * @param {string} app
 * @param {{ wm_class?: string, wmClass?: string }|null|undefined} [fields]
 * @returns {string[]}
 */
export function desktopLaunchTryIds(app, fields) {
  const out = [];
  const seen = new Set();
  const push = (id) => {
    const s = String(id ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  const wc = fields?.wm_class ?? fields?.wmClass;
  if (wc != null && String(wc).trim() !== "") {
    const n = String(wc).trim();
    // chrome-<id>-Default → chrome-<id>-Default.desktop (and lowercase)
    const m = n.match(/^chrome-(.+)-Default$/i);
    if (m && m[1]) {
      push(`chrome-${m[1]}-Default.desktop`);
      push(`chrome-${m[1]}-default.desktop`);
    }
    if (n.toLowerCase().endsWith(".desktop")) push(n);
    else push(`${n}.desktop`);
  }
  const raw = String(app ?? "").trim();
  if (raw) {
    if (raw.endsWith(".desktop")) push(raw);
    else {
      push(`${raw}.desktop`);
      push(raw);
    }
  }
  return out;
}

/**
 * Flatten Gio.DesktopAppInfo.search groups → ordered desktop ids.
 * @param {unknown} groups
 * @returns {string[]}
 */
export function flattenDesktopSearchGroups(groups) {
  if (!Array.isArray(groups)) return [];
  const out = [];
  for (const g of groups) {
    if (!Array.isArray(g)) continue;
    for (const id of g) {
      const s = String(id ?? "").trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Pick a desktop id from search results.
 * Prefer exact Name match (casefold) so "YouTube" does not launch "YouTube TV".
 * Then prefix match on Name; else first hit.
 *
 * @param {string} query app Name / short name
 * @param {unknown} groups DesktopAppInfo.search return value
 * @param {Record<string, string>|Map<string, string>|null|undefined} nameById
 *   desktop id → display Name (from DesktopAppInfo.get_name)
 * @returns {string|null}
 */
export function pickDesktopSearchResult(query, groups, nameById) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  const ids = flattenDesktopSearchGroups(groups);
  if (!ids.length) return null;
  if (!q) return ids[0];

  const nameOf = (id) => {
    if (!nameById) return "";
    if (typeof nameById.get === "function") return String(nameById.get(id) ?? "");
    return String(nameById[id] ?? "");
  };

  let prefix = null;
  for (const id of ids) {
    const name = nameOf(id).trim();
    if (!name) continue;
    const n = name.toLowerCase();
    if (n === q) return id;
    if (prefix == null && (n.startsWith(q) || q.startsWith(n))) prefix = id;
  }
  if (prefix) return prefix;
  return ids[0];
}

/**
 * POSIX-ish split (shlex). Unclosed quotes fall back to whitespace split.
 * @param {string} input
 * @returns {string[]}
 */
export function shellSplit(input) {
  const s = String(input ?? "");
  try {
    return shellSplitStrict(s);
  } catch {
    return s.split(/\s+/).filter(Boolean);
  }
}

function shellSplitStrict(s) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < s.length) {
        cur += s[++i];
        continue;
      }
      if (c === quote) {
        quote = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      continue;
    }
    cur += c;
  }
  if (quote) throw new Error("unclosed quote");
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {string[]} parts
 * @returns {string}
 */
export function shellJoin(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((p) => {
      const s = String(p);
      if (/^[A-Za-z0-9_./:=+@%,-]+$/.test(s)) return s;
      return `'${s.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}

/**
 * True when launch target is Ghostty (short name, desktop id, or argv0).
 * @param {string} app
 * @param {string|null} [desktop]
 * @returns {boolean}
 */
export function isGhosttyLaunchTarget(app, desktop = null) {
  if (desktop) {
    let stem = baseName(String(desktop));
    if (stem.toLowerCase().endsWith(".desktop")) {
      stem = stem.slice(0, -".desktop".length);
    }
    const cf = stem.toLowerCase();
    if (GHOSTTY_STEMS.has(cf) || cf.endsWith(".ghostty") || ghosttyStem(stem) === "ghostty") {
      return true;
    }
  }
  const raw = String(app || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (!raw) return false;
  if (ghosttyStem(raw) === "ghostty") return true;
  const parts = shellSplit(raw);
  if (!parts.length) return false;
  return ghosttyStem(parts[0]) === "ghostty";
}

function isGhosttyExecutableToken(token) {
  const t = String(token || "").trim();
  if (!t || t.toLowerCase().endsWith(".desktop")) return false;
  return baseName(t).toLowerCase() === "ghostty";
}

/**
 * Argv for a multi-instance Ghostty process (not gio of stock .desktop).
 * @param {string} [app]
 * @param {{ desktop?: string|null, exePath?: string|null }} [opts]
 * @returns {string[]}
 */
export function ghosttyMultiInstanceArgv(app = "ghostty", opts = {}) {
  void opts.desktop;
  let exe = String(opts.exePath || "").trim() || null;
  const raw = String(app || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  const extra = [];
  if (raw) {
    const parts = shellSplit(raw);
    if (parts.length && ghosttyStem(parts[0]) === "ghostty") {
      if (exe == null && isGhosttyExecutableToken(parts[0])) exe = parts[0];
      for (const p of parts.slice(1)) {
        if (String(p).startsWith("--gtk-single-instance=")) continue;
        extra.push(p);
      }
    }
  }
  if (!exe) exe = "ghostty";
  return [exe, GHOSTTY_MULTI_INSTANCE_FLAG, ...extra];
}

/**
 * Map ghostty app/desktop sugar to multi-instance argv string; else unchanged.
 * @param {string} app
 * @returns {string}
 */
export function rewriteGhosttyLaunchApp(app) {
  if (!isGhosttyLaunchTarget(app)) {
    return String(app || "").trim();
  }
  return shellJoin(ghosttyMultiInstanceArgv(app));
}

function actionWorkspace(a, defaultWs) {
  if (defaultWs == null) defaultWs = 0;
  const raw = a && a.workspace;
  if (raw == null) return defaultWs;
  const ws = parseInt(raw, 10);
  if (!Number.isFinite(ws)) return defaultWs;
  return ws >= 0 ? ws : defaultWs;
}

/**
 * mon0.left-tab → 0; primary → 0; unknown → null.
 * @param {string} slot
 * @returns {number|null}
 */
export function monIndexFromSlot(slot) {
  if (!slot) return null;
  const head = monHeadAndRest(String(slot))[0];
  if (!head) return null;
  if (head === "primary") return 0;
  const mm = /^mon(\d+)$/.exec(head);
  if (mm) return parseInt(mm[1], 10);
  return null;
}

/**
 * Bare mon path (moNwsW). Apply dest must not stop here (D042).
 * @param {string} slot
 * @param {number|string} [workspace]
 * @returns {string}
 */
export function slotToTreePath(slot, workspace) {
  if (workspace == null) workspace = 0;
  let mon = monIndexFromSlot(slot);
  if (mon == null) mon = 0;
  let ws = typeof workspace === "number" ? workspace : parseInt(String(workspace), 10);
  if (!Number.isFinite(ws)) ws = 0;
  if (ws < 0) ws = 0;
  return `mo${mon}ws${ws}`;
}

/**
 * True for monitor-root paths (moN / moNwsW), not a slot child.
 * @param {unknown} path
 * @returns {boolean}
 */
export function isMonRootTreePath(path) {
  if (path == null) return false;
  let s = String(path).trim();
  if (!s) return false;
  if (s.startsWith("path:")) s = s.slice(5).trim();
  if (!s) return false;
  return /^mo\d+(ws\d+)?$/i.test(s);
}

function isGroupLayout(layout) {
  const s = String(layout || "")
    .trim()
    .toUpperCase();
  return s === "TABBED" || s === "STACKED";
}

function isLayoutPlaceholderNode(n) {
  if (!n || typeof n !== "object") return false;
  if (n.placeholder === true) return true;
  return (
    String(n.wmClass || n.wm_class || "")
      .trim()
      .toLowerCase() === "forge-placeholder"
  );
}

/**
 * Skeleton/layout PHs with parent CON path (desired forest).
 * @param {object|null|undefined} forest
 * @returns {{
 *   id: string,
 *   role: string|null,
 *   slot: string|null,
 *   path: string,
 *   parentPath: string|null,
 *   parentLayout: string|null,
 * }[]}
 */
export function collectLayoutSlotPlaceholders(forest) {
  const mons = Array.isArray(forest?.monitors)
    ? forest.monitors
    : Array.isArray(forest)
    ? forest
    : [];
  /** @type {{ id: string, role: string|null, slot: string|null, path: string, parentPath: string|null, parentLayout: string|null }[]} */
  const hits = [];
  const walk = (n, path, parentPath, parentLayout) => {
    if (!n || typeof n !== "object") return;
    const ntype = n.nodeType || n.type;
    if (ntype === "WINDOW" || ntype === "window") {
      if (isLayoutPlaceholderNode(n)) {
        const r =
          n.layoutRole != null
            ? String(n.layoutRole)
            : n.layout_role != null
            ? String(n.layout_role)
            : null;
        const s =
          n.layoutSlot != null
            ? String(n.layoutSlot)
            : n.layout_slot != null
            ? String(n.layout_slot)
            : null;
        const id = n.windowId != null ? String(n.windowId).trim() : "";
        if (id) hits.push({ id, role: r, slot: s, path, parentPath, parentLayout });
      }
      return;
    }
    const kids = n.children || n.childNodes;
    if (!Array.isArray(kids)) return;
    const selfPath =
      ntype === "MONITOR" || ntype === "monitor" ? (n.id != null ? String(n.id) : path) : path;
    const selfLayout = n.layout != null ? String(n.layout) : parentLayout;
    for (let i = 0; i < kids.length; i++) {
      const childPath = selfPath ? `${selfPath}/${i}` : String(i);
      walk(kids[i], childPath, selfPath || null, selfLayout);
    }
  };
  for (const m of mons) {
    const monPath = m && m.id != null ? String(m.id) : "";
    walk(m, monPath, null, m && m.layout != null ? String(m.layout) : null);
  }
  return hits;
}

/**
 * Find a layout placeholder windowId in planner IR forest.
 * Prefer role match; when multiple, prefer matching slot.
 * @param {object|null|undefined} forest
 * @param {{ role?: string|null, slot?: string|null }} [want]
 * @returns {string|null} windowId for id: selector
 */
export function findLayoutPlaceholderId(forest, want = {}) {
  const role =
    want.role != null && String(want.role).trim() !== "" ? String(want.role).trim() : null;
  const slot =
    want.slot != null && String(want.slot).trim() !== "" ? String(want.slot).trim() : null;
  if (!role && !slot) return null;

  const hits = collectLayoutSlotPlaceholders(forest);
  if (!hits.length) return null;

  if (role && slot) {
    const both = hits.find((h) => h.role === role && h.slot === slot);
    if (both) return both.id;
  }
  if (role) {
    const byRole = hits.filter((h) => h.role === role);
    if (byRole.length === 1) return byRole[0].id;
    if (byRole.length > 1 && slot) {
      const bySlot = byRole.find((h) => h.slot === slot);
      if (bySlot) return bySlot.id;
    }
    if (byRole.length >= 1) return byRole[0].id;
  }
  if (slot) {
    const bySlot = hits.filter((h) => h.slot === slot);
    if (bySlot.length >= 1) return bySlot[0].id;
  }
  return null;
}

/**
 * Apply dest from desired forest: skeleton PH / shared TABBED CON, never mon-root.
 * @param {object|null|undefined} forest
 * @param {{ role?: string|null, slot?: string|null }} [want]
 * @returns {{
 *   destKind: 'slot',
 *   attachSelector: string,
 *   phId: string,
 *   slot: string|null,
 *   shared: boolean,
 *   parentPath: string|null,
 * }|null}
 */
export function findLayoutSlotDest(forest, want = {}) {
  const role =
    want.role != null && String(want.role).trim() !== "" ? String(want.role).trim() : null;
  const slot =
    want.slot != null && String(want.slot).trim() !== "" ? String(want.slot).trim() : null;
  if (!role && !slot) return null;

  const hits = collectLayoutSlotPlaceholders(forest);
  if (!hits.length) return null;

  /** @param {typeof hits} list */
  const pickShared = (list) => {
    if (!list.length) return null;
    const grouped = list.find((h) => isGroupLayout(h.parentLayout));
    const seed = grouped || list[0];
    if (isGroupLayout(seed.parentLayout) && seed.parentPath) {
      const peers = hits.filter((h) => h.parentPath === seed.parentPath);
      const first = peers[0] || seed;
      return { hit: first, shared: true };
    }
    return { hit: seed, shared: false };
  };

  let chosen = null;
  if (role && slot) {
    const both = hits.filter((h) => h.role === role && h.slot === slot);
    chosen = pickShared(both);
  }
  if (!chosen && role) {
    const byRole = hits.filter((h) => h.role === role);
    if (byRole.length === 1) chosen = pickShared(byRole);
    else if (byRole.length > 1 && slot) {
      const bySlot = byRole.filter((h) => h.slot === slot);
      chosen = pickShared(bySlot.length ? bySlot : byRole);
    } else if (byRole.length >= 1) chosen = pickShared(byRole);
  }
  if (!chosen && slot) {
    const bySlot = hits.filter((h) => h.slot === slot);
    chosen = pickShared(bySlot);
  }
  if (!chosen || !chosen.hit) return null;

  // Same-slot TABBED/STACKED peers dest to the first PH in that CON.
  if (slot) {
    const slotHits = hits.filter((h) => h.slot === slot);
    const shared = pickShared(slotHits);
    if (shared && shared.shared) chosen = shared;
  }

  const hit = chosen.hit;
  return {
    destKind: "slot",
    attachSelector: `id:${hit.id}`,
    phId: hit.id,
    slot: hit.slot,
    shared: !!chosen.shared,
    parentPath: hit.parentPath,
  };
}

/**
 * Map plan open action → launch fields (Python do_launch kwargs).
 * @param {object} action
 * @param {{ workspace?: number }} [opts]
 * @returns {object}
 */
export function openActionToLaunchFields(action, opts = {}) {
  const workspace = opts.workspace != null ? opts.workspace : 0;
  const a = action && typeof action === "object" ? action : {};
  const openSpec = a.open && typeof a.open === "object" && !Array.isArray(a.open) ? a.open : {};
  const app = openSpec.app || openSpec.desktop || openSpec.command;
  let appS = app != null ? String(app).trim() : "";
  if (isGhosttyLaunchTarget(appS)) appS = rewriteGhosttyLaunchApp(appS);
  const fields = { app: appS };
  const wc = openSpec.wmClass || openSpec.wm_class;
  if (wc != null && String(wc).trim() !== "") fields.wm_class = String(wc).trim();
  if ("timeout" in openSpec && openSpec.timeout != null) {
    fields.timeout = parseInt(openSpec.timeout, 10);
  }
  const noWait = "noWait" in openSpec ? openSpec.noWait : openSpec.no_wait;
  if (noWait != null) fields.no_wait = !!noWait;
  if (openSpec.first != null) fields.first = !!openSpec.first;

  let mon = openSpec.monitor;
  let tree = openSpec.treePath || openSpec.path || openSpec.tree_path;
  const slot = a.slot;
  const ws = actionWorkspace(a, workspace);
  if (mon == null && slot) {
    const monI = monIndexFromSlot(String(slot));
    if (monI != null) mon = monI;
  }
  if (tree == null && slot) tree = slotToTreePath(String(slot), ws);
  if (mon != null && String(mon).trim() !== "") fields.monitor = mon;
  if (tree != null && String(tree).trim() !== "") fields.tree_path = String(tree).trim();
  const attach = a.attachSelector || a.destWindowId;
  if (attach != null && String(attach).trim() !== "") {
    const s = String(attach).trim();
    fields.attach_selector = s.startsWith("id:") ? s : `id:${s}`;
  }
  const oaMatch = a.match && typeof a.match === "object" && !Array.isArray(a.match) ? a.match : {};
  const titleSub = oaMatch["title~="];
  const titleExact = oaMatch.title;
  if (titleSub != null && String(titleSub).trim() !== "") {
    fields.title_contains = String(titleSub).trim();
  }
  if (titleExact != null && String(titleExact).trim() !== "") {
    fields.title_exact = String(titleExact).trim();
  }
  return fields;
}

/**
 * True when a plan open will spawn Chrome or a Chrome PWA (same profile).
 * @param {unknown} action
 * @returns {boolean}
 */
export function openActionIsChromeFamily(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return false;
  const a = /** @type {Record<string, unknown>} */ (action);
  const openRaw = a.open;
  const openSpec =
    openRaw && typeof openRaw === "object" && !Array.isArray(openRaw)
      ? /** @type {Record<string, unknown>} */ (openRaw)
      : {};
  for (const key of ["wmClass", "wm_class"]) {
    const v = openSpec[key];
    if (v != null && isChromeFamilyClass(String(v))) return true;
  }
  const matchRaw = a.match;
  const match =
    matchRaw && typeof matchRaw === "object" && !Array.isArray(matchRaw)
      ? /** @type {Record<string, unknown>} */ (matchRaw)
      : {};
  const v = match.class || match.wmClass || match.wm_class;
  if (v != null && isChromeFamilyClass(String(v))) return true;
  return false;
}

/**
 * Unpinned chrome-family pins that must land before the next chrome spawn.
 * @param {object} action
 * @param {Set<string>|string[]} chromeRoles
 * @param {object[]} pendingPins
 * @param {object} rolePins
 * @returns {object[]}
 */
export function chromeSerialWaitPins(action, chromeRoles, pendingPins, rolePins) {
  if (!openActionIsChromeFamily(action)) return [];
  const roles = chromeRoles instanceof Set ? chromeRoles : new Set(chromeRoles || []);
  if (!roles.size) return [];
  const pins = rolePins && typeof rolePins === "object" ? rolePins : {};
  const pending = Array.isArray(pendingPins) ? pendingPins : [];
  return pending.filter((p) => {
    const rid = String(p?.role ?? "");
    return roles.has(rid) && pins[rid] == null && pins[String(rid)] == null;
  });
}

/**
 * PlaceNext options from launch fields (camelCase).
 * @param {object} fields
 * @returns {object}
 */
export function placeNextOptionsFromLaunchFields(fields) {
  const f = fields && typeof fields === "object" ? fields : {};
  const out = {};
  if (f.monitor != null && String(f.monitor).trim() !== "") out.monitor = f.monitor;
  const tree = f.treePath || f.tree_path;
  if (tree != null && String(tree).trim() !== "") out.treePath = String(tree).trim();
  const attach = f.attachSelector || f.attach_selector;
  if (attach != null && String(attach).trim() !== "") out.attachSelector = String(attach).trim();
  const wc = f.wmClass || f.wm_class;
  if (wc != null && String(wc).trim() !== "") out.wmClass = String(wc).trim();
  const tc = f.titleContains || f.title_contains;
  if (tc != null && String(tc).trim() !== "") out.titleContains = String(tc).trim();
  const te = f.titleExact || f.title_exact;
  if (te != null && String(te).trim() !== "") out.titleExact = String(te).trim();
  if (f.first != null) out.first = !!f.first;
  const timeout = f.timeout != null ? f.timeout : f.timeoutMs;
  if (timeout != null && Number.isFinite(Number(timeout))) {
    out.ttlMs = Math.max(Number(timeout), DEFAULT_OPEN_PIN_TIMEOUT_MS);
  }
  return out;
}

/**
 * True when PlaceNext has a dest (monitor / treePath / attach).
 * @param {object} opts
 * @returns {boolean}
 */
export function placeNextHasDest(opts) {
  return placeNextDestKind(opts) !== "none";
}

/**
 * Classify PlaceNext dest. Apply product dest must be `slot`.
 * @param {object} opts
 * @returns {'slot'|'mon-root'|'none'}
 */
export function placeNextDestKind(opts) {
  if (!opts || typeof opts !== "object") return "none";
  const attach =
    opts.attachSelector != null && String(opts.attachSelector).trim() !== ""
      ? String(opts.attachSelector).trim()
      : "";
  if (attach) return "slot";
  const tree = opts.treePath != null ? String(opts.treePath).trim() : "";
  if (tree) return isMonRootTreePath(tree) ? "mon-root" : "slot";
  if (opts.monitor != null && String(opts.monitor).trim() !== "") return "mon-root";
  return "none";
}

/**
 * True when dest is a PH / slot path (not monitor-root).
 * @param {object} opts
 * @returns {boolean}
 */
export function placeNextHasSlotDest(opts) {
  return placeNextDestKind(opts) === "slot";
}

/**
 * Apply PlaceNext dest: pin to skeleton PH / shared CON, fail mon-root-only.
 * @param {object} action
 * @param {object} [fields]
 * @param {object|null} [forest]
 * @returns {{
 *   ok: boolean,
 *   destKind: 'slot'|'mon-root'|'none',
 *   placeOpts: object,
 *   dest?: object|null,
 *   error?: string,
 * }}
 */
export function applyPlaceNextOptions(action, fields, forest) {
  const placeOpts = placeNextOptionsFromLaunchFields(
    fields && typeof fields === "object" ? fields : openActionToLaunchFields(action)
  );
  const dest = findLayoutSlotDest(forest, {
    role: action?.role ?? action?.layoutRole,
    slot: action?.slot ?? action?.layoutSlot,
  });
  if (dest && dest.attachSelector) {
    placeOpts.attachSelector = dest.attachSelector;
  }
  if (placeOpts.treePath && isMonRootTreePath(placeOpts.treePath)) {
    delete placeOpts.treePath;
  }
  const destKind = placeNextDestKind(placeOpts);
  if (destKind !== "slot") {
    return {
      ok: false,
      destKind,
      placeOpts,
      dest,
      error: "apply PlaceNext dest must be slot/PH (not mon-root)",
    };
  }
  return { ok: true, destKind, placeOpts, dest };
}

/**
 * @param {object} action
 * @param {object} [spawnResult]
 * @returns {string[]|null}
 */
export function waitClassesFromOpenAction(action, spawnResult) {
  if (spawnResult && Array.isArray(spawnResult.waitClasses) && spawnResult.waitClasses.length) {
    return spawnResult.waitClasses.slice();
  }
  const a = action && typeof action === "object" ? action : {};
  const fields = openActionToLaunchFields(a);
  const out = [];
  const seen = new Set();
  const push = (v) => {
    if (v == null || String(v).trim() === "") return;
    const s = String(v).trim();
    const cf = s.toLowerCase();
    if (seen.has(cf)) return;
    seen.add(cf);
    out.push(s);
  };
  push(fields.wm_class);
  const match = a.match && typeof a.match === "object" ? a.match : {};
  push(match.class || match.wmClass || match.wm_class);
  if (isGhosttyLaunchTarget(fields.app)) {
    push("ghostty");
    push("com.mitchellh.ghostty");
  }
  return out.length ? out : null;
}

/**
 * Pending pin item for assignOpenRolePins.
 * @param {object} action
 * @param {object} [spawnResult]
 * @returns {object|null}
 */
export function pinEntryFromOpenAction(action, spawnResult) {
  if (!action || typeof action !== "object") return null;
  if (action.role == null || String(action.role).trim() === "") return null;
  const waitClasses = waitClassesFromOpenAction(action, spawnResult);
  const acceptAny =
    spawnResult && spawnResult.acceptAnyNew != null
      ? !!spawnResult.acceptAnyNew
      : waitClasses == null;
  const entry = {
    role: String(action.role),
    wait_classes: waitClasses,
    accept_any_new: acceptAny,
  };
  const match =
    action.match && typeof action.match === "object" && !Array.isArray(action.match)
      ? action.match
      : {};
  const titleSub = match["title~="];
  const titleExact = match.title;
  if (titleSub != null && String(titleSub).trim() !== "") {
    entry.title_contains = String(titleSub).trim();
  }
  if (titleExact != null && String(titleExact).trim() !== "") {
    entry.title_exact = String(titleExact).trim();
  }
  return entry;
}

export function windowHasMapId(win) {
  if (!win || typeof win !== "object") return false;
  const wid = win.windowId;
  return wid != null && String(wid).trim() !== "";
}

function pendingTitleExact(item) {
  const v = item.title_exact;
  if (v != null && String(v).trim() !== "") return String(v).trim();
  if (item.title_contains != null || item["title~="] != null) return null;
  const t = item.title;
  if (t != null && String(t).trim() !== "") return String(t).trim();
  return null;
}

function pendingTitleContains(item) {
  for (const key of ["title_contains", "title~="]) {
    const v = item[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/**
 * Title identity for map-pin (X11 Chrome PWAs share wmClass=Google-chrome).
 * @param {object} win
 * @param {object} item
 * @returns {boolean}
 */
export function windowMatchesPinTitle(win, item) {
  if (!win || typeof win !== "object" || !item || typeof item !== "object") return false;
  const exact = pendingTitleExact(item);
  const contains = pendingTitleContains(item);
  if (exact == null && contains == null) return true;
  if (win.title == null) return false;
  const titleS = String(win.title);
  if (exact != null) return titleS === exact;
  return titleS.includes(contains);
}

function defaultClassEq(a, b) {
  return classEq(a, b);
}

/**
 * Greedy role → windowId pins (map/windowId, not TILE).
 * @param {object[]} pending
 * @param {object[]} windows
 * @param {Set<string>|string[]} [usedIds]
 * @param {{ classEq?: Function }} [opts]
 * @returns {object}
 */
export function assignOpenRolePins(pending, windows, usedIds, opts = {}) {
  const eq = typeof opts.classEq === "function" ? opts.classEq : defaultClassEq;
  const used = new Set();
  if (usedIds) {
    for (const x of usedIds) used.add(String(x));
  }
  const out = {};
  if (!pending || !pending.length) return out;

  const pool = [];
  for (const w of windows || []) {
    if (!w || typeof w !== "object" || !windowHasMapId(w)) continue;
    const wid = String(w.windowId).trim();
    if (used.has(wid)) continue;
    pool.push(w);
  }

  function popFromPool(w) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p === w || String(p.windowId).trim() === String(w.windowId).trim()) {
        return pool.splice(i, 1)[0];
      }
    }
    const idx = pool.indexOf(w);
    if (idx >= 0) return pool.splice(idx, 1)[0];
    return w;
  }

  function takeMatch(item) {
    const classes = item.wait_classes;
    let classList = [];
    if (typeof classes === "string" && classes.trim()) classList = [classes.trim()];
    else if (Array.isArray(classes)) {
      classList = classes.filter((c) => c && String(c).trim()).map((c) => String(c).trim());
    }
    const acceptAny = !!item.accept_any_new;
    const needTitle = pendingTitleExact(item) != null || pendingTitleContains(item) != null;
    const candidates = pool.filter((w) => windowMatchesPinTitle(w, item));
    if (needTitle && !candidates.length) return null;
    const search = needTitle ? candidates : pool;

    if (classList.length) {
      for (const w of search) {
        const cls = w.wmClass != null ? w.wmClass : w.wm_class;
        const inst = w.wmClassInstance != null ? w.wmClassInstance : w.wm_class_instance;
        if (classList.some((want) => eq(cls, want) || eq(inst, want))) {
          return popFromPool(w);
        }
      }
      if (needTitle && search.length) return popFromPool(search[0]);
      return null;
    }
    if (needTitle && search.length) return popFromPool(search[0]);
    if (acceptAny && pool.length) return pool.shift();
    return null;
  }

  for (const item of pending) {
    if (!item || typeof item !== "object") continue;
    const role = item.role;
    if (role == null || String(role).trim() === "") continue;
    const rid = String(role);
    if (rid in out) continue;
    const hit = takeMatch(item);
    if (hit == null) continue;
    const wid = String(hit.windowId).trim();
    out[rid] = hit.windowId;
    used.add(wid);
  }
  return out;
}

/**
 * Strip title identity so leftover maps can pin by class (D034).
 * @param {object[]} pending
 * @returns {object[]}
 */
export function pendingPinsWithoutTitle(pending) {
  const out = [];
  for (const item of pending || []) {
    if (!item || typeof item !== "object") continue;
    const q = { ...item };
    delete q.title_contains;
    delete q["title~="];
    delete q.title_exact;
    delete q.title;
    out.push(q);
  }
  return out;
}

export function summarizePinWindows(windows) {
  const out = [];
  for (const w of windows || []) {
    if (!w || typeof w !== "object") continue;
    if (w.placeholder === true) continue;
    const row = {
      windowId: w.windowId,
      wmClass: w.wmClass != null ? w.wmClass : w.wm_class,
      title: w.title,
      mode: w.mode,
    };
    const inst = w.wmClassInstance != null ? w.wmClassInstance : w.wm_class_instance;
    if (inst != null) row.wmClassInstance = inst;
    out.push(row);
  }
  return out;
}

/**
 * Assign pins until mapped or timeout; then class-only leftover (D034).
 * Injectable load/sleep/now for L0. Live ApplyLayout uses signal wait, not this loop.
 *
 * @param {() => object[]} loadWindows
 * @param {object[]} pending
 * @param {{
 *   baselineIds?: Iterable<string>,
 *   timeoutMs?: number,
 *   pollMs?: number,
 *   classEq?: Function,
 *   sleepFn?: (s: number) => void,
 *   nowFn?: () => number,
 * }} [opts]
 * @returns {object}
 */
export function waitForOpenRolePins(loadWindows, pending, opts = {}) {
  const sleep = typeof opts.sleepFn === "function" ? opts.sleepFn : null;
  const nowFn = typeof opts.nowFn === "function" ? opts.nowFn : () => Date.now() / 1000;
  const pollS =
    Math.max(0, Number(opts.pollMs != null ? opts.pollMs : DEFAULT_OPEN_PIN_POLL_MS)) / 1000;
  const timeoutMs = opts.timeoutMs != null ? Number(opts.timeoutMs) : DEFAULT_OPEN_PIN_TIMEOUT_MS;
  const deadline = nowFn() + Math.max(0, timeoutMs) / 1000;
  const t0 = nowFn();
  const used = new Set();
  for (const x of opts.baselineIds || []) used.add(String(x));
  const pins = {};
  let remaining = (pending || []).filter(
    (p) => p && typeof p === "object" && p.role != null && String(p.role).trim() !== ""
  );
  let polls = 0;
  let lastErr = null;
  let lastWins = [];
  const eqOpts = { classEq: opts.classEq };

  while (remaining.length && nowFn() <= deadline) {
    let wins;
    try {
      wins = loadWindows();
      if (!Array.isArray(wins)) wins = [];
      lastErr = null;
    } catch (e) {
      lastErr = String(e?.message || e);
      wins = [];
    }
    lastWins = wins;
    polls += 1;
    const assigned = assignOpenRolePins(remaining, wins, used, eqOpts);
    if (Object.keys(assigned).length) {
      for (const [rid, wid] of Object.entries(assigned)) {
        pins[rid] = wid;
        used.add(String(wid).trim());
      }
      remaining = remaining.filter((p) => !(String(p.role) in pins));
      if (!remaining.length) break;
    }
    if (pollS > 0 && remaining.length && sleep) sleep(pollS);
    else if (pollS > 0 && remaining.length && !sleep) break;
    if (pollS === 0) break;
  }

  if (remaining.length && lastWins.length) {
    const assigned = assignOpenRolePins(pendingPinsWithoutTitle(remaining), lastWins, used, eqOpts);
    if (Object.keys(assigned).length) {
      for (const [rid, wid] of Object.entries(assigned)) {
        pins[rid] = wid;
        used.add(String(wid).trim());
      }
      remaining = remaining.filter((p) => !(String(p.role) in pins));
    }
  }

  const missing = remaining.map((p) => String(p.role));
  return {
    ok: missing.length === 0,
    rolePins: pins,
    missing,
    polls,
    elapsedMs: Math.floor((nowFn() - t0) * 1000),
    seen: summarizePinWindows(lastWins),
    error: missing.length ? lastErr || `map wait timeout for roles: ${missing}` : null,
  };
}
