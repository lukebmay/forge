/*
 * Layout plan IR: normalize / validate / desugar (AL2) + planReconcile /
 * planActionsToSteps (AL3). Port of scripts/forge/layout_plan.py (+
 * layout_apply.actions_to_extension_steps). Pure JSON — no gi://, node:,
 * fs, Meta, or process I/O.
 */

export const PROFILE_VERSION = 2;
export const MODE_RECONCILE = "reconcile";

const TAG_OPTIONAL_KEYS = new Set(["id", "active", "share", "ratio"]);

const SLOT_RE = /^(mon\d+|primary)(?:\.(.+))?$/;
const MON_KEY_RE = /^mon(\d+)$/;
const NAME_RE = /^[A-Za-z0-9_-]+$/;
const GEOM_ROLE_KEYS = new Set(["left", "right", "top", "bottom"]);
const STABLE_KEY_RE = /^(?:geom:|conn:|name:).+/;

const SPLIT_ALIASES = {
  h: "hsplit",
  horizontal: "hsplit",
  hsplit: "hsplit",
  v: "vsplit",
  vertical: "vsplit",
  vsplit: "vsplit",
  t: "tabbed",
  tab: "tabbed",
  tabbed: "tabbed",
  s: "stacked",
  stack: "stacked",
  stacked: "stacked",
};
const CONTAINER_TAG_KEYS = new Set(Object.keys(SPLIT_ALIASES));

const CHROME_LAUNCHERS = new Set([
  "google-chrome",
  "google-chrome-stable",
  "google-chrome-beta",
  "google-chrome-unstable",
  "chromium",
  "chromium-browser",
  "chrome",
  "brave",
  "brave-browser",
]);
const CHROME_CLASS = "Google-chrome";
const KNOWN_PWA_TITLE = {
  grok: "Grok",
  youtube: "YouTube",
  gmail: "Gmail",
  "google voice": "Voice",
  voice: "Voice",
  "google calendar": "Calendar",
  calendar: "Calendar",
  "google drive": "Drive",
  drive: "Drive",
  "google docs": "Docs",
  docs: "Docs",
  "google sheets": "Sheets",
  sheets: "Sheets",
  "google slides": "Slides",
  slides: "Slides",
  "google meet": "Meet",
  meet: "Meet",
  "google maps": "Maps",
  maps: "Maps",
  "google chat": "Chat",
  chat: "Chat",
  discord: "Discord",
  slack: "Slack",
  spotify: "Spotify",
};

function deepClone(v) {
  // GJS Shell has no structuredClone; plan/profile JSON is plain data.
  if (typeof structuredClone === "function") {
    return structuredClone(v);
  }
  return JSON.parse(JSON.stringify(v));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(n) {
  return typeof n === "number" && Number.isInteger(n);
}

function casefold(s) {
  return String(s).toLowerCase();
}

/** Positive weights → fractions that sum to 1.0 (3 decimal places). */
export function normalizeShares(weights) {
  if (!Array.isArray(weights) || weights.length < 2) return null;
  const nums = [];
  for (const w of weights) {
    const f = Number(w);
    if (!Number.isFinite(f) || f <= 0) return null;
    nums.push(f);
  }
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const fracs = nums.map((x) => x / total);
  const rounded = fracs.map((f) => Math.round(f * 1000) / 1000);
  const head = rounded.slice(0, -1).reduce((a, b) => a + b, 0);
  const last = Math.round((1.0 - head) * 1000) / 1000;
  if (last <= 0) return rounded;
  rounded[rounded.length - 1] = last;
  return rounded;
}

function shareWeightsFromObj(obj) {
  if (!isPlainObject(obj)) return null;
  let raw = obj.share;
  if (raw === undefined || raw === null) raw = obj.ratio;
  return normalizeShares(raw);
}

function isStableKey(key) {
  return Boolean(key) && STABLE_KEY_RE.test(key);
}

function isBuiltinMonKey(key) {
  return key === "primary" || MON_KEY_RE.test(key);
}

function isGeomRoleKey(key) {
  return GEOM_ROLE_KEYS.has(key);
}

export function monHeadAndRest(slot, knownHeads = null) {
  if (!slot) return ["", null];
  const m = SLOT_RE.exec(slot);
  if (m) return [m[1], m[2] ?? null];

  if (knownHeads != null) {
    let best = null;
    for (const h of knownHeads) {
      if (typeof h !== "string" || !h) continue;
      if (slot === h || slot.startsWith(h + ".")) {
        if (best === null || h.length > best.length) best = h;
      }
    }
    if (best !== null) {
      if (slot === best) return [best, null];
      const rest = slot.slice(best.length + 1);
      return [best, rest !== "" ? rest : null];
    }
    return [slot, null];
  }

  if (slot.includes(".")) {
    const i = slot.indexOf(".");
    const head = slot.slice(0, i);
    const rest = slot.slice(i + 1);
    return [head, rest !== "" ? rest : null];
  }
  return [slot, null];
}

function validateMonitorsAliases(raw) {
  if (raw === undefined || raw === null) return {};
  if (Array.isArray(raw)) return {};
  if (!isPlainObject(raw)) {
    throw new Error(
      "monitors must be an array of mon bodies or an object " +
        "(alias → monN | primary | stableKey)"
    );
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || !k.trim()) {
      throw new Error("monitors keys must be non-empty strings");
    }
    const alias = k.trim();
    if (!NAME_RE.test(alias)) {
      throw new Error(`monitors alias ${JSON.stringify(alias)}: use A-Za-z0-9_-`);
    }
    if (isBuiltinMonKey(alias)) {
      throw new Error(`monitors alias ${JSON.stringify(alias)}: reserved (monN / primary)`);
    }
    if (isStableKey(alias)) {
      throw new Error(`monitors alias ${JSON.stringify(alias)}: use a short name, not a stableKey`);
    }
    if (typeof v !== "string" || !String(v).trim()) {
      throw new Error(`monitors.${alias}: target must be a non-empty string`);
    }
    const target = String(v).trim();
    if (!(isBuiltinMonKey(target) || isStableKey(target))) {
      throw new Error(
        `monitors.${alias}: target want monN, primary, or stableKey ` +
          `(got ${JSON.stringify(target)})`
      );
    }
    out[alias] = target;
  }
  return out;
}

function monKeyOk(key, aliases) {
  if (isBuiltinMonKey(key) || isStableKey(key) || isGeomRoleKey(key)) return true;
  return Object.prototype.hasOwnProperty.call(aliases, key);
}

function monKeyError(key, where, aliases) {
  const parts = ["monN", "primary", "left|right|top|bottom", "stableKey (geom:|conn:|name:…)"];
  const aliasKeys = Object.keys(aliases);
  if (aliasKeys.length) {
    parts.push(
      "or alias " +
        aliasKeys
          .sort()
          .map((a) => JSON.stringify(a))
          .join(", ")
    );
  }
  return new Error(`${where} ${JSON.stringify(key)}: want ${parts.join(" / ")}`);
}

function slotOk(slot, aliases, layoutKeys) {
  const known = new Set([...layoutKeys, ...Object.keys(aliases), ...GEOM_ROLE_KEYS]);
  const [head] = monHeadAndRest(slot, known);
  if (!head) return false;
  if (isBuiltinMonKey(head) || isGeomRoleKey(head)) return true;
  if (Object.prototype.hasOwnProperty.call(aliases, head) || layoutKeys.has(head)) {
    return true;
  }
  return false;
}

/**
 * Desugar tiles sugar → v2 IR and fill omit-noise defaults.
 *
 * @param {unknown} data
 * @param {{ mon_count?: number|null, mon_indices?: number[]|null, monCount?: number|null, monIndices?: number[]|null }} [opts]
 * @returns {object}
 */
export function normalizeProfile(data, opts = {}) {
  const monCount = opts.mon_count !== undefined ? opts.mon_count : opts.monCount ?? null;
  const monIndices = opts.mon_indices !== undefined ? opts.mon_indices : opts.monIndices ?? null;

  let input = data;
  if (Array.isArray(input)) {
    input = { tiles: input };
  }
  if (!isPlainObject(input)) {
    throw new Error("profile must be a JSON object or array");
  }

  const out = deepClone(input);
  const focusRaw = out.focus;
  const extracted = extractTilesFromProfile(out, monCount, monIndices);
  const tiles = extracted.tiles;
  const monExplicit = extracted.monExplicit;
  const hadSugar = extracted.fromSugar;

  if (tiles !== null) {
    if (!isPlainObject(tiles)) {
      throw new Error("tiles must resolve to a mon map object");
    }
    const { roles, layout } = desugarTiles(tiles);
    out.roles = roles;
    out.layout = layout;
    if (monExplicit) out.monExplicit = true;
  }

  const hasRoles = Array.isArray(out.roles) && (out.roles || []).length > 0;
  if (hasRoles || hadSugar) {
    if (out.version === undefined) out.version = PROFILE_VERSION;
    if (out.mode === undefined) out.mode = MODE_RECONCILE;
    if (!Object.prototype.hasOwnProperty.call(out, "overflow")) {
      out.overflow = { slot: "mon0.overflow", layout: "tabbed" };
    }
    if (!Object.prototype.hasOwnProperty.call(out, "marginal")) {
      out.marginal = {
        mode: "coexist",
        roleOrder: "first",
        residual: "leave",
      };
    }
  }

  if (roleRefPresent(focusRaw)) {
    if (hasRoles) {
      const rid = resolveRoleRef(focusRaw, out.roles || []);
      if (rid !== null) out.focus = rid;
      else if (typeof focusRaw === "string") out.focus = focusRaw.trim();
      else out.focus = focusRaw;
    } else {
      out.focus = typeof focusRaw === "string" ? focusRaw.trim() : focusRaw;
    }
  } else if (Object.prototype.hasOwnProperty.call(out, "focus")) {
    delete out.focus;
  }

  return out;
}

function extractTilesFromProfile(out, monCount, monIndices) {
  const monitorsRaw = out.monitors;
  if (Array.isArray(monitorsRaw)) {
    delete out.monitors;
    if (Object.prototype.hasOwnProperty.call(out, "tiles")) {
      throw new Error("profile: use monitors[] or tiles, not both");
    }
    const tiles = {};
    monitorsRaw.forEach((body, i) => {
      tiles[`mon${i}`] = body;
    });
    return { tiles, monExplicit: true, fromSugar: true };
  }

  const reserved = new Set([
    "version",
    "mode",
    "roles",
    "layout",
    "overflow",
    "marginal",
    "floating",
    "description",
    "tiles",
    "monitors",
    "monExplicit",
    "displays",
    "settings",
    "focus",
  ]);

  let topMonKeys = Object.keys(out).filter((k) => {
    if (typeof k !== "string") return false;
    const ks = k.trim();
    if (reserved.has(k)) return false;
    return isBuiltinMonKey(ks) || isStableKey(ks) || isGeomRoleKey(ks);
  });
  topMonKeys = topMonKeys.filter((k) => {
    const ks = String(k).trim();
    return isBuiltinMonKey(ks) || isStableKey(ks) || isGeomRoleKey(ks);
  });

  if (
    topMonKeys.length > 0 &&
    !Object.prototype.hasOwnProperty.call(out, "tiles") &&
    !Object.prototype.hasOwnProperty.call(out, "roles")
  ) {
    const tiles = {};
    for (const k of topMonKeys) {
      tiles[String(k).trim()] = out[k];
      delete out[k];
    }
    return { tiles, monExplicit: true, fromSugar: true };
  }

  if (!Object.prototype.hasOwnProperty.call(out, "tiles")) {
    return { tiles: null, monExplicit: false, fromSugar: false };
  }

  const tilesIn = out.tiles;
  delete out.tiles;
  if (Array.isArray(tilesIn)) {
    return {
      tiles: bareArrayToMonTiles(tilesIn, monCount, monIndices),
      monExplicit: false,
      fromSugar: true,
    };
  }
  if (isPlainObject(tilesIn)) {
    return { tiles: tilesIn, monExplicit: true, fromSugar: true };
  }
  throw new Error("tiles must be an object or array");
}

function looksLikeMonBody(item) {
  if (Array.isArray(item)) return true;
  if (!isPlainObject(item)) return false;
  if (item.open != null || item.match != null || item.app != null) {
    return false;
  }
  if (taggedContainerMode(item) !== null) return true;
  return (
    Object.prototype.hasOwnProperty.call(item, "split") ||
    Object.prototype.hasOwnProperty.call(item, "layout") ||
    Object.prototype.hasOwnProperty.call(item, "content") ||
    Object.prototype.hasOwnProperty.call(item, "children")
  );
}

function taggedContainerMode(item) {
  if (!isPlainObject(item)) return null;
  if (item.open != null || item.match != null || item.app != null) return null;
  const tags = Object.keys(item).filter((k) =>
    CONTAINER_TAG_KEYS.has(String(k).trim().toLowerCase())
  );
  const other = Object.keys(item).filter((k) => {
    const kl = String(k).trim().toLowerCase();
    return !CONTAINER_TAG_KEYS.has(kl) && !TAG_OPTIONAL_KEYS.has(kl);
  });
  if (tags.length !== 1 || other.length) return null;
  const mode = SPLIT_ALIASES[String(tags[0]).trim().toLowerCase()];
  const content = item[tags[0]];
  if (!Array.isArray(content)) return null;
  return mode;
}

function monBodyAsPaneList(body) {
  if (Array.isArray(body)) return body;
  if (isPlainObject(body)) {
    if (Array.isArray(body.content)) return body.content;
    if (Array.isArray(body.children)) return body.children;
    const tag = taggedContainerMode(body);
    if (tag !== null) {
      for (const [k, v] of Object.entries(body)) {
        if (CONTAINER_TAG_KEYS.has(String(k).trim().toLowerCase()) && Array.isArray(v)) {
          return [body];
        }
      }
    }
    return [body];
  }
  return [body];
}

function bareArrayToMonTiles(items, monCount = null, monIndices = null) {
  if (monCount != null) {
    // Match Python int(): truncate numbers; non-numeric → 0
    let n = 0;
    if (typeof monCount === "number" && Number.isFinite(monCount)) {
      n = Math.trunc(monCount);
    } else {
      const parsed = parseInt(String(monCount), 10);
      n = Number.isFinite(parsed) ? parsed : 0;
    }
    if (n <= 1) {
      if (items.length >= 2 && items.every(looksLikeMonBody)) {
        const panes = [];
        for (const body of items) {
          panes.push(...monBodyAsPaneList(body));
        }
        return { mon0: panes };
      }
      return { mon0: items };
    }
    if (n >= 2 && items.length === n && items.every(looksLikeMonBody)) {
      const idxs = normalizeMonIndices(monIndices, n);
      if (idxs !== null) {
        const out = {};
        items.forEach((body, i) => {
          out[`mon${idxs[i]}`] = body;
        });
        return out;
      }
      const out = {};
      items.forEach((body, i) => {
        out[`mon${i}`] = body;
      });
      return out;
    }
    return { mon0: items };
  }

  if (items.length >= 2 && items.every((x) => Array.isArray(x))) {
    const n = items.length;
    const idxs = normalizeMonIndices(monIndices, n);
    if (idxs !== null) {
      const out = {};
      items.forEach((body, i) => {
        out[`mon${idxs[i]}`] = body;
      });
      return out;
    }
    const out = {};
    items.forEach((body, i) => {
      out[`mon${i}`] = body;
    });
    return out;
  }
  return { mon0: items };
}

function normalizeMonIndices(monIndices, n) {
  if (!monIndices || n <= 0) return null;
  let idxs;
  try {
    idxs = monIndices.slice(0, n).map((x) => {
      const i = typeof x === "number" ? Math.trunc(x) : parseInt(String(x), 10);
      if (!Number.isFinite(i)) throw new Error("bad");
      return i;
    });
  } catch {
    return null;
  }
  if (idxs.length !== n || idxs.some((i) => i < 0)) return null;
  if (new Set(idxs).size !== n) return null;
  return idxs;
}

function desugarTiles(tiles) {
  const roles = [];
  const layout = {};
  const usedIds = new Set();

  for (const [rawKey, monBody] of Object.entries(tiles)) {
    if (typeof rawKey !== "string" || !rawKey.trim()) {
      throw new Error(
        "tiles keys must be non-empty strings " + "(monN, primary, stableKey, or monitors alias)"
      );
    }
    const monKey = rawKey.trim();
    if (
      !(
        isBuiltinMonKey(monKey) ||
        isStableKey(monKey) ||
        isGeomRoleKey(monKey) ||
        NAME_RE.test(monKey)
      )
    ) {
      throw new Error(
        `tiles key ${JSON.stringify(monKey)}: want monN, primary, left|right, ` +
          "stableKey, or alias name"
      );
    }

    let splitOverride = null;
    let content;
    let monShareSrc = null;
    if (Array.isArray(monBody)) {
      // Sole [{hsplit|vsplit, share?}] → mon-level split (same as {monN:{hsplit…}})
      const sole = monBody.length === 1 && isPlainObject(monBody[0]) ? monBody[0] : null;
      const soleTag = sole ? taggedContainerMode(sole) : null;
      if (soleTag === "hsplit" || soleTag === "vsplit") {
        monShareSrc = sole;
        splitOverride = soleTag;
        content = null;
        for (const [k, v] of Object.entries(sole)) {
          if (CONTAINER_TAG_KEYS.has(String(k).trim().toLowerCase()) && Array.isArray(v)) {
            content = v;
            break;
          }
        }
      } else {
        content = monBody;
      }
    } else if (isPlainObject(monBody)) {
      monShareSrc = monBody;
      const tag = taggedContainerMode(monBody);
      if (tag === "hsplit" || tag === "vsplit") {
        splitOverride = tag;
        for (const [k, v] of Object.entries(monBody)) {
          if (CONTAINER_TAG_KEYS.has(String(k).trim().toLowerCase())) {
            content = v;
            break;
          }
        }
      } else if (tag === "tabbed" || tag === "stacked") {
        content = [monBody];
        monShareSrc = null;
      } else {
        splitOverride = normalizeSplitAlias(monBody.split, `tiles.${monKey}`);
        if (Object.prototype.hasOwnProperty.call(monBody, "content")) {
          content = monBody.content;
        } else if (Object.prototype.hasOwnProperty.call(monBody, "children")) {
          content = monBody.children;
        } else {
          throw new Error(
            `tiles.${monKey}: need content array, bare array, ` +
              "or {hsplit|vsplit|tab|stack: […]}"
          );
        }
      }
    } else {
      throw new Error(`tiles.${monKey}: want array or {split|hsplit|vsplit|tab, content}`);
    }

    if (!Array.isArray(content)) {
      throw new Error(`tiles.${monKey}.content must be an array`);
    }

    const sNext = [0];
    const children = desugarPanes(content, monKey, monKey, roles, usedIds, sNext);
    const entry = { children };
    let split = splitOverride;
    if (split === null && children.length >= 2) split = "hsplit";
    if (split !== null) entry.split = split;
    const shares = shareWeightsFromObj(monShareSrc);
    if (shares !== null && shares.length === children.length && children.length >= 2) {
      entry.share = shares;
    }
    layout[monKey] = entry;
  }

  return { roles, layout };
}

function desugarPanes(items, monKey, pathPrefix, roles, usedIds, sNext) {
  const children = [];
  items.forEach((item, i) => {
    const where = `${pathPrefix}[${i}]`;
    children.push(desugarPane(item, monKey, pathPrefix, where, roles, usedIds, sNext));
  });
  return children;
}

function desugarPane(item, monKey, pathPrefix, where, roles, usedIds, sNext) {
  if (isPlainObject(item)) {
    const tagMode = taggedContainerMode(item);
    if (tagMode !== null) {
      let content = null;
      for (const [k, v] of Object.entries(item)) {
        if (CONTAINER_TAG_KEYS.has(String(k).trim().toLowerCase())) {
          content = v;
          break;
        }
      }
      if (!Array.isArray(content) || content.length === 0) {
        throw new Error(`${where}: ${tagMode} needs a non-empty content array`);
      }
      const child = desugarTaggedContainer(
        tagMode,
        content,
        monKey,
        pathPrefix,
        where,
        roles,
        usedIds,
        sNext,
        item.id,
        tagMode === "hsplit" || tagMode === "vsplit" ? item : null
      );
      if (tagMode === "tabbed" || tagMode === "stacked") {
        applyActiveToChild(child, item.active, roles);
      }
      return child;
    }
  }

  if (isPlainObject(item)) {
    let modeRaw = item.layout;
    if (modeRaw === undefined || modeRaw === null) modeRaw = item.split;
    if (modeRaw !== undefined && modeRaw !== null) {
      const modeKey = String(modeRaw).trim().toLowerCase();
      const modeNorm = SPLIT_ALIASES[modeKey] ?? modeKey;
      if (modeNorm === "tabbed" || modeNorm === "stacked") {
        let content = item.content;
        if (content === undefined || content === null) content = item.children;
        if (Array.isArray(content) && content.length > 0 && content.every(isRoleCell)) {
          const child = desugarRolePane(
            content,
            monKey,
            pathPrefix,
            where,
            roles,
            usedIds,
            sNext,
            modeNorm
          );
          applyActiveToChild(child, item.active, roles);
          return child;
        }
      }
      if (modeNorm === "hsplit" || modeNorm === "vsplit") {
        let content = item.content;
        if (content === undefined || content === null) content = item.children;
        if (Array.isArray(content)) {
          return desugarSplitNode(
            modeNorm,
            content,
            monKey,
            pathPrefix,
            where,
            roles,
            usedIds,
            sNext,
            item.id,
            item
          );
        }
      }
    }
  }

  if (
    isPlainObject(item) &&
    (Object.prototype.hasOwnProperty.call(item, "split") ||
      Object.prototype.hasOwnProperty.call(item, "content") ||
      Object.prototype.hasOwnProperty.call(item, "children"))
  ) {
    if (
      Object.prototype.hasOwnProperty.call(item, "roles") &&
      item.content == null &&
      item.children == null
    ) {
      if (item.open != null || item.match != null || item.app != null) {
        return desugarRolePane([item], monKey, pathPrefix, where, roles, usedIds, sNext);
      }
    }
    let split = normalizeSplitAlias(item.split, where);
    let content = item.content;
    if (content === undefined || content === null) content = item.children;
    if (!Array.isArray(content)) {
      throw new Error(`${where}: nested split needs content array`);
    }
    if (split === null) split = "hsplit";
    if (split === "tabbed" || split === "stacked") {
      if (content.length && content.every(isRoleCell)) {
        const child = desugarRolePane(
          content,
          monKey,
          pathPrefix,
          where,
          roles,
          usedIds,
          sNext,
          split
        );
        applyActiveToChild(child, item.active, roles);
        return child;
      }
      throw new Error(`${where}: tabbed/stacked content must be role cells`);
    }
    return desugarSplitNode(
      split,
      content,
      monKey,
      pathPrefix,
      where,
      roles,
      usedIds,
      sNext,
      item.id,
      item
    );
  }

  if (Array.isArray(item)) {
    if (item.length === 0) throw new Error(`${where}: empty pane`);
    if (item.every(isRoleCell)) {
      return desugarRolePane(item, monKey, pathPrefix, where, roles, usedIds, sNext);
    }
    return desugarSplitNode("hsplit", item, monKey, pathPrefix, where, roles, usedIds, sNext, null);
  }

  if (isRoleCell(item)) {
    return desugarRolePane([item], monKey, pathPrefix, where, roles, usedIds, sNext);
  }

  throw new Error(
    `${where}: want string, role object, array, or ` + "{tab|stack|hsplit|vsplit|split, content}"
  );
}

function desugarTaggedContainer(
  mode,
  content,
  monKey,
  pathPrefix,
  where,
  roles,
  usedIds,
  sNext,
  cidRaw,
  shareSrc = null
) {
  if (mode === "tabbed" || mode === "stacked") {
    if (!content.every(isRoleCell)) {
      throw new Error(`${where}: ${mode} content must be role cells (strings/objects)`);
    }
    return desugarRolePane(content, monKey, pathPrefix, where, roles, usedIds, sNext, mode);
  }
  if (mode === "hsplit" || mode === "vsplit") {
    return desugarSplitNode(
      mode,
      content,
      monKey,
      pathPrefix,
      where,
      roles,
      usedIds,
      sNext,
      cidRaw,
      shareSrc
    );
  }
  throw new Error(`${where}: unsupported container mode ${JSON.stringify(mode)}`);
}

function desugarSplitNode(
  split,
  content,
  monKey,
  pathPrefix,
  where,
  roles,
  usedIds,
  sNext,
  cidRaw,
  shareSrc = null
) {
  let cid;
  if (cidRaw === undefined || cidRaw === null || String(cidRaw).trim() === "") {
    cid = `s${sNext[0]}`;
    sNext[0] += 1;
  } else {
    cid = String(cidRaw).trim();
    if (!NAME_RE.test(cid)) {
      throw new Error(`${where}.id: invalid ${JSON.stringify(cid)} (use A-Za-z0-9_-)`);
    }
  }
  const slotPath = `${pathPrefix}.${cid}`;
  const kids = desugarPanes(content, monKey, slotPath, roles, usedIds, sNext);
  const node = { id: cid, children: kids };
  if (split) node.split = split;
  else if (kids.length >= 2) node.split = "hsplit";
  const shares = shareWeightsFromObj(shareSrc);
  if (shares !== null && shares.length === kids.length && kids.length >= 2) {
    node.share = shares;
  }
  return node;
}

function isRoleCell(x) {
  if (typeof x === "string") return true;
  if (!isPlainObject(x)) return false;
  if (taggedContainerMode(x) !== null) return false;
  if (
    Object.prototype.hasOwnProperty.call(x, "content") ||
    Object.prototype.hasOwnProperty.call(x, "children")
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(x, "layout") &&
    x.open == null &&
    x.match == null &&
    x.app == null
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(x, "split") &&
    x.open == null &&
    x.match == null &&
    x.app == null
  ) {
    return false;
  }
  return true;
}

function desugarRolePane(cells, monKey, pathPrefix, where, roles, usedIds, sNext, mode = "tabbed") {
  const roleIds = [];
  cells.forEach((cell, j) => {
    const role = cellToRole(cell, usedIds, cells.length > 1 ? `${where}[${j}]` : where);
    roleIds.push(role.id);
    roles.push(role);
  });

  let child;
  let cid;
  if (roleIds.length === 1) {
    cid = roleIds[0];
    child = { id: cid, roles: roleIds };
  } else {
    cid = `s${sNext[0]}`;
    sNext[0] += 1;
    let modeS = String(mode).trim().toLowerCase();
    if (modeS !== "tabbed" && modeS !== "stacked") modeS = "tabbed";
    child = { id: cid, layout: modeS, roles: roleIds };
  }

  const fullSlot = `${pathPrefix}.${cid}`;
  for (const rid of roleIds) {
    for (const r of roles) {
      if (r.id === rid && !Object.prototype.hasOwnProperty.call(r, "slot")) {
        r.slot = fullSlot;
        break;
      }
    }
  }
  return child;
}

function roleRefPresent(raw) {
  if (raw === undefined || raw === null || typeof raw === "boolean") return false;
  if (isInt(raw)) return true;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") return Boolean(raw.trim());
  return Boolean(String(raw).trim());
}

function roleMatchesToken(token, role) {
  const t = String(token).trim();
  if (!t) return false;
  const tCf = casefold(t);
  const rid = role.id;
  if (rid != null) {
    if (String(rid) === t || casefold(String(rid)) === tCf) return true;
  }
  const openSpec = isPlainObject(role.open) ? role.open : {};
  for (const k of ["app", "desktop", "command"]) {
    const v = openSpec[k];
    if (v != null && casefold(String(v).trim()) === tCf) return true;
  }
  const match = isPlainObject(role.match) ? role.match : {};
  for (const mk of ["title~=", "title", "class", "wmClass", "wm_class"]) {
    const v = match[mk];
    if (v != null && casefold(String(v).trim()) === tCf) return true;
    if (mk === "title~=" && v != null && casefold(String(v)).includes(tCf)) {
      return true;
    }
  }
  return false;
}

function matchRoleTokenNth(token, roles, n = 0) {
  if (!isInt(n) || n < 0) return null;
  const matches = [];
  for (const r of roles) {
    if (r.id == null) continue;
    if (roleMatchesToken(token, r)) matches.push(String(r.id));
  }
  if (n < matches.length) return matches[n];
  return null;
}

function matchRoleToken(token, roles) {
  return matchRoleTokenNth(token, roles, 0);
}

function checkRoleRefShape(raw, where) {
  if (typeof raw === "boolean") {
    throw new Error(`${where}: must be string, int index, or [token, index]`);
  }
  if (isInt(raw)) {
    if (raw < 0) {
      throw new Error(`${where}: index must be >= 0 (0-based)`);
    }
    return;
  }
  if (Array.isArray(raw)) {
    if (raw.length !== 2) {
      throw new Error(`${where}: want [token, index] (0-based occurrence)`);
    }
    const [tok, n] = raw;
    if (!String(tok).trim()) {
      throw new Error(`${where}: token must be non-empty`);
    }
    if (!isInt(n) || n < 0) {
      throw new Error(`${where}: index must be int >= 0 (0-based)`);
    }
    return;
  }
  if (typeof raw === "string") return;
  throw new Error(`${where}: must be string, int index, or [token, index]`);
}

function resolveRoleRef(ref, roles) {
  if (!roleRefPresent(ref)) return null;
  if (isInt(ref)) {
    if (ref >= 0 && ref < roles.length) {
      const rid = roles[ref].id;
      return rid != null ? String(rid) : null;
    }
    return null;
  }
  if (Array.isArray(ref)) {
    if (ref.length !== 2) return null;
    const [tok, n] = ref;
    if (!isInt(n)) return null;
    return matchRoleTokenNth(String(tok), roles, n);
  }
  return matchRoleToken(String(ref).trim(), roles);
}

function resolveActiveRef(ref, roleIds, groupRoles) {
  if (!roleRefPresent(ref)) return null;
  if (isInt(ref)) {
    if (ref >= 0 && ref < roleIds.length) return String(roleIds[ref]);
    return null;
  }
  const rid = resolveRoleRef(ref, groupRoles);
  if (rid !== null) return rid;
  if (typeof ref === "string") {
    const token = ref.trim();
    for (const cr of roleIds) {
      if (casefold(String(cr)) === casefold(token)) return String(cr);
    }
  }
  return null;
}

function applyActiveToChild(child, activeRaw, roles) {
  if (!roleRefPresent(activeRaw)) return;
  const childRoles = child.roles || [];
  if (!Array.isArray(childRoles) || !childRoles.length) return;
  const roleIds = childRoles.map((rid) => String(rid));
  const byId = {};
  for (const r of roles) {
    if (r.id != null) byId[String(r.id)] = r;
  }
  const groupRoles = roleIds.filter((rid) => byId[rid]).map((rid) => byId[rid]);
  const rid = resolveActiveRef(activeRaw, roleIds, groupRoles);
  if (rid !== null) child.active = rid;
}

function resolveProfileFocusActive(prof) {
  const roles = prof.roles || [];
  if (!Array.isArray(roles)) return;
  const byId = {};
  for (const r of roles) {
    if (r.id != null) byId[String(r.id)] = r;
  }

  function walk(children) {
    if (!Array.isArray(children)) return;
    for (const ch of children) {
      if (!isPlainObject(ch)) continue;
      const nested = ch.children;
      if (Array.isArray(nested) && nested.length) walk(nested);
      const active = ch.active;
      if (!roleRefPresent(active)) {
        delete ch.active;
        continue;
      }
      const roleIds = (ch.roles || []).map((r) => String(r));
      const groupRoles = roleIds.filter((rid) => byId[rid]).map((rid) => byId[rid]);
      const rid = resolveActiveRef(active, roleIds, groupRoles);
      if (rid !== null) ch.active = rid;
      else if (typeof active === "string" && active.trim()) {
        ch.active = active.trim();
      } else {
        delete ch.active;
      }
    }
  }

  for (const monBody of Object.values(prof.layout || {})) {
    if (isPlainObject(monBody)) walk(monBody.children);
  }

  const focus = prof.focus;
  if (!roleRefPresent(focus)) {
    delete prof.focus;
    return;
  }
  const rid = resolveRoleRef(focus, roles);
  if (rid !== null) prof.focus = rid;
  else if (typeof focus === "string" && focus.trim()) {
    prof.focus = focus.trim();
  } else {
    delete prof.focus;
  }
}

function cellToRole(cell, usedIds, where) {
  if (typeof cell === "string") {
    const token = cell.trim();
    if (!token) throw new Error(`${where}: empty string cell`);
    const { open: openSpec, match } = inferOpenAndMatch(token);
    const rid = allocRoleId(stemToId(token), usedIds);
    return { id: rid, match, open: openSpec };
  }

  if (!isPlainObject(cell)) {
    throw new Error(`${where}: role cell must be string or object`);
  }

  let openSpec = cell.open;
  if (openSpec == null && cell.app != null) openSpec = cell.app;
  if (openSpec == null) {
    throw new Error(`${where}: open (or app) required on role object`);
  }
  if (typeof openSpec === "string" && openSpec.trim()) {
    openSpec = { app: openSpec.trim() };
  }
  if (!isPlainObject(openSpec)) {
    throw new Error(`${where}: open must be an object or string`);
  }

  const appStem = openStem(openSpec);
  let appFull = "";
  for (const k of ["app", "desktop", "command"]) {
    if (openSpec[k] != null && String(openSpec[k]).trim()) {
      appFull = String(openSpec[k]).trim();
      break;
    }
  }
  const ridRaw = cell.id;
  let rid;
  if (ridRaw === undefined || ridRaw === null || String(ridRaw).trim() === "") {
    rid = allocRoleId(stemToId(appFull || appStem || "app"), usedIds);
  } else {
    rid = String(ridRaw).trim();
    if (!NAME_RE.test(rid)) {
      throw new Error(`${where}.id: invalid ${JSON.stringify(rid)} (use A-Za-z0-9_-)`);
    }
    if (usedIds.has(rid)) rid = allocRoleId(rid, usedIds);
    else usedIds.add(rid);
  }

  let match = cell.match;
  if (match == null) {
    const flat = {};
    if (cell.class != null) flat.class = cell.class;
    if (cell["title~="] != null) flat["title~="] = cell["title~="];
    else if (cell.title != null) flat.title = cell.title;
    if (Object.keys(flat).length) match = flat;
  }
  if (match == null && cell.class != null) {
    match = { class: cell.class };
  }
  if (match == null) {
    const inferred = inferOpenAndMatch(appFull || appStem || rid);
    match = inferred.match;
    if (match.class === CHROME_CLASS && openSpec.wmClass == null && openSpec.wm_class == null) {
      openSpec = { ...openSpec, wmClass: CHROME_CLASS };
    }
  }

  const role = { id: rid, match, open: openSpec };
  if (cell.slot != null) role.slot = cell.slot;
  return role;
}

function inferOpenAndMatch(token) {
  token = token.trim();
  const openSpec = { app: token };
  const key = casefold(token);

  if (CHROME_LAUNCHERS.has(key) || CHROME_LAUNCHERS.has(key.replace(/_/g, "-"))) {
    openSpec.wmClass = CHROME_CLASS;
    return {
      open: openSpec,
      match: { class: CHROME_CLASS, "title~=": "Google Chrome" },
    };
  }

  const pwaTitle = KNOWN_PWA_TITLE[key];
  if (pwaTitle !== undefined) {
    openSpec.wmClass = CHROME_CLASS;
    return {
      open: openSpec,
      match: { class: CHROME_CLASS, "title~=": pwaTitle },
    };
  }

  if (looksLikeChromePwaToken(token)) {
    openSpec.wmClass = CHROME_CLASS;
    return {
      open: openSpec,
      match: { class: CHROME_CLASS, "title~=": token },
    };
  }

  const stem = token.split(/\s+/)[0];
  return { open: openSpec, match: { class: stem } };
}

function looksLikeChromePwaToken(token) {
  if (!token) return false;
  if (token.includes(" ")) return true;
  if (token.includes(".") || token.includes("-") || token.includes("_")) {
    return false;
  }
  return (
    token[0] === token[0].toUpperCase() &&
    token[0] !== token[0].toLowerCase() &&
    [...token.slice(1)].some((c) => c === c.toLowerCase() && c !== c.toUpperCase())
  );
}

function openStem(openSpec) {
  if (typeof openSpec === "string") {
    const s = openSpec.trim();
    return s ? s.split(/\s+/)[0] : "";
  }
  if (isPlainObject(openSpec)) {
    const app = openSpec.app || openSpec.desktop || openSpec.command;
    if (app == null) return "";
    return String(app).trim().split(/\s+/)[0];
  }
  return "";
}

function stemToId(stem) {
  let s = String(stem)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!s) return "app";
  if (/^\d/.test(s)) s = `a${s}`;
  return s;
}

function allocRoleId(base, used) {
  base = stemToId(base);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const rid = `${base}-${n}`;
  used.add(rid);
  return rid;
}

function normalizeSplitAlias(val, where) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SPLIT_ALIASES, s)) {
    throw new Error(`${where}: unsupported split ${JSON.stringify(val)}`);
  }
  return SPLIT_ALIASES[s];
}

/**
 * Validate version-2 reconcile profile; return normalized dict.
 * Raises Error with a clear message.
 *
 * @param {unknown} data
 * @param {{ mon_count?: number|null, mon_indices?: number[]|null, monCount?: number|null, monIndices?: number[]|null }} [opts]
 * @returns {object}
 */
export function validateReconcileProfile(data, opts = {}) {
  const monCount = opts.mon_count !== undefined ? opts.mon_count : opts.monCount ?? null;
  const monIndices = opts.mon_indices !== undefined ? opts.mon_indices : opts.monIndices ?? null;

  data = normalizeProfile(data, {
    mon_count: monCount,
    mon_indices: monIndices,
  });

  const hasRoles = Array.isArray(data.roles) && (data.roles || []).length > 0;
  const hasRolesKey = Array.isArray(data.roles);

  let ver;
  if (!Object.prototype.hasOwnProperty.call(data, "version")) {
    if (!hasRoles && !hasRolesKey) {
      throw new Error("profile version required (want version: 2) or provide roles[]");
    }
    ver = PROFILE_VERSION;
  } else {
    ver = data.version;
    if (ver !== PROFILE_VERSION && ver !== String(PROFILE_VERSION)) {
      throw new Error(
        `unsupported profile version: ${JSON.stringify(ver)} (want ${PROFILE_VERSION})`
      );
    }
  }

  let mode = data.mode;
  if (mode === undefined || mode === null) {
    if (!hasRoles && !hasRolesKey) {
      throw new Error("mode required (want mode: reconcile) or provide roles");
    }
    mode = MODE_RECONCILE;
  }
  if (typeof mode !== "string" || mode.trim().toLowerCase() !== MODE_RECONCILE) {
    throw new Error(
      `unsupported mode: ${JSON.stringify(mode)} (want ${JSON.stringify(MODE_RECONCILE)})`
    );
  }
  mode = MODE_RECONCILE;

  if (!Object.prototype.hasOwnProperty.call(data, "roles")) {
    throw new Error("profile roles required (array)");
  }
  const rolesIn = data.roles;
  if (!Array.isArray(rolesIn)) {
    throw new Error("profile roles must be an array");
  }

  const aliases = validateMonitorsAliases(data.monitors);

  let layoutIn = data.layout;
  if (layoutIn === undefined || layoutIn === null) layoutIn = {};
  if (!isPlainObject(layoutIn)) {
    throw new Error("layout must be an object");
  }

  const layout = {};
  const slotIds = new Set();
  const monRoleMap = {};
  const layoutKeys = new Set();

  for (const [rawKey, monBody] of Object.entries(layoutIn)) {
    if (typeof rawKey !== "string" || !rawKey.trim()) {
      throw new Error(
        "layout keys must be non-empty strings " + "(monN, primary, stableKey, or monitors alias)"
      );
    }
    const monKey = rawKey.trim();
    if (!monKeyOk(monKey, aliases)) {
      throw monKeyError(monKey, "layout key", aliases);
    }
    if (!isPlainObject(monBody)) {
      throw new Error(`layout.${monKey}: must be an object`);
    }
    let childrenIn = monBody.children;
    if (childrenIn === undefined || childrenIn === null) childrenIn = [];
    if (!Array.isArray(childrenIn)) {
      throw new Error(`layout.${monKey}.children must be an array`);
    }
    const children = validateLayoutChildren(
      childrenIn,
      monKey,
      monKey,
      `layout.${monKey}`,
      slotIds,
      monRoleMap
    );

    let split = monBody.split;
    if ((split === undefined || split === null) && children.length >= 2) {
      split = "hsplit";
    }
    if (split !== undefined && split !== null) {
      const splitS = String(split).trim().toLowerCase();
      if (!["hsplit", "vsplit", "tabbed", "stacked"].includes(splitS)) {
        throw new Error(`layout.${monKey}.split: unsupported ${JSON.stringify(split)}`);
      }
      split = splitS;
    }
    const entry = { children };
    if (split !== undefined && split !== null) entry.split = split;
    let shares = normalizeShares(monBody.share);
    if (shares === null) shares = normalizeShares(monBody.ratio);
    if (shares !== null && shares.length === children.length && children.length >= 2) {
      entry.share = shares;
    }
    layout[monKey] = entry;
    layoutKeys.add(monKey);
  }

  const overflowIn = data.overflow;
  let overflow;
  if (overflowIn === undefined || overflowIn === null) {
    overflow = { slot: "mon0.overflow", layout: "tabbed" };
  } else if (!isPlainObject(overflowIn)) {
    throw new Error("overflow must be an object");
  } else {
    let oslot = overflowIn.slot;
    if (oslot === undefined || oslot === null || String(oslot).trim() === "") {
      throw new Error("overflow.slot required");
    }
    oslot = String(oslot).trim();
    if (!slotOk(oslot, aliases, layoutKeys)) {
      throw new Error(
        `overflow.slot invalid: ${JSON.stringify(oslot)} ` +
          "(want monN|primary|stableKey|alias . path)"
      );
    }
    let olayout = overflowIn.layout;
    if (olayout === undefined) olayout = "tabbed";
    const olayoutS = String(olayout).trim().toLowerCase();
    if (!["tabbed", "stacked", "hsplit", "vsplit"].includes(olayoutS)) {
      throw new Error(`overflow.layout unsupported: ${JSON.stringify(olayout)}`);
    }
    overflow = { slot: oslot, layout: olayoutS };
  }

  const roles = [];
  const seenIds = new Set();
  rolesIn.forEach((role, i) => {
    if (!isPlainObject(role)) {
      throw new Error(`roles[${i}]: must be an object`);
    }
    let rid = role.id;
    if (rid === undefined || rid === null || String(rid).trim() === "") {
      throw new Error(`roles[${i}]: id required`);
    }
    rid = String(rid).trim();
    if (!NAME_RE.test(rid)) {
      throw new Error(`roles[${i}].id: invalid ${JSON.stringify(rid)} (use A-Za-z0-9_-)`);
    }
    if (seenIds.has(rid)) {
      throw new Error(`duplicate role id: ${rid}`);
    }
    seenIds.add(rid);

    let match = role.match;
    if (match == null && role.class != null) {
      match = { class: role.class };
    }
    if (typeof match === "string" && match.trim()) {
      match = { class: match.trim() };
    }
    if (!isPlainObject(match) || !Object.keys(match).length) {
      throw new Error(
        `roles[${i}] (${rid}): match object required ` + '(or match:"WmClass" / class:"WmClass")'
      );
    }
    const normMatch = normalizeMatch(match, `roles[${i}].match`);

    let openSpec = role.open;
    if (openSpec == null && role.app != null) {
      openSpec = { app: role.app };
    }
    if (typeof openSpec === "string" && openSpec.trim()) {
      openSpec = { app: openSpec.trim() };
    }
    if (openSpec == null) {
      throw new Error(
        `roles[${i}] (${rid}): open object required ` + '(or open:"app" / app:"app")'
      );
    }
    if (!isPlainObject(openSpec)) {
      throw new Error(`roles[${i}] (${rid}): open must be an object or string`);
    }
    const app = openSpec.app || openSpec.desktop || openSpec.command;
    if (app == null || String(app).trim() === "") {
      throw new Error(`roles[${i}] (${rid}): open.app required`);
    }
    const normOpen = { app: String(app).trim() };
    const wc = openSpec.wmClass || openSpec.wm_class;
    if (wc != null && String(wc).trim() !== "") {
      normOpen.wmClass = String(wc).trim();
    } else if (normMatch.class) {
      normOpen.wmClass = String(normMatch.class).trim();
    }
    if (Object.prototype.hasOwnProperty.call(openSpec, "timeout") && openSpec.timeout != null) {
      const t = Number(openSpec.timeout);
      if (!Number.isFinite(t) || !Number.isInteger(t)) {
        // Python int() accepts floats that are whole; match int() trunc behavior
        if (!Number.isFinite(Number(openSpec.timeout))) {
          throw new Error(`roles[${i}] (${rid}): open.timeout must be int`);
        }
      }
      try {
        const ti =
          typeof openSpec.timeout === "number"
            ? Math.trunc(openSpec.timeout)
            : parseInt(String(openSpec.timeout), 10);
        if (!Number.isFinite(ti)) {
          throw new Error("bad");
        }
        normOpen.timeout = ti;
      } catch {
        throw new Error(`roles[${i}] (${rid}): open.timeout must be int`);
      }
    }
    const mon = openSpec.monitor;
    if (mon != null && String(mon).trim() !== "") {
      normOpen.monitor = mon;
    }
    const path = openSpec.treePath || openSpec.path || openSpec.tree_path;
    if (path != null && String(path).trim() !== "") {
      normOpen.treePath = String(path).trim();
    }
    if (openSpec.first != null) {
      normOpen.first = Boolean(openSpec.first);
    }
    const noWait = Object.prototype.hasOwnProperty.call(openSpec, "noWait")
      ? openSpec.noWait
      : openSpec.no_wait;
    if (noWait != null) {
      normOpen.noWait = Boolean(noWait);
    }

    let slot = role.slot;
    if (slot != null) {
      if (typeof slot !== "string" || !slot.trim()) {
        throw new Error(`roles[${i}] (${rid}): slot must be a non-empty string`);
      }
      slot = slot.trim();
      if (!slotOk(slot, aliases, layoutKeys)) {
        throw new Error(
          `roles[${i}] (${rid}): invalid slot ${JSON.stringify(slot)} ` +
            "(want monN|primary|stableKey|alias . path)"
        );
      }
    } else if (Object.prototype.hasOwnProperty.call(monRoleMap, rid)) {
      slot = monRoleMap[rid];
    } else {
      throw new Error(`roles[${i}] (${rid}): slot required (or list role under layout children)`);
    }

    roles.push({
      id: rid,
      match: normMatch,
      open: normOpen,
      slot,
    });
  });

  const out = {
    version: PROFILE_VERSION,
    mode,
    roles,
    layout,
    overflow,
  };
  if (data.monExplicit) out.monExplicit = true;

  const desc = data.description;
  if (desc != null) {
    if (typeof desc !== "string") {
      throw new Error("description must be a string");
    }
    out.description = desc;
  }

  const displays = data.displays;
  if (displays != null) {
    if (typeof displays !== "string" || !displays.trim()) {
      throw new Error("displays must be a non-empty string");
    }
    out.displays = displays.trim();
  }

  const settings = data.settings;
  if (settings != null) {
    if (typeof settings !== "string" || !settings.trim()) {
      throw new Error("settings must be a non-empty string");
    }
    out.settings = settings.trim();
  }

  const marginal = data.marginal;
  if (marginal === undefined || marginal === null) {
    out.marginal = {
      mode: "coexist",
      roleOrder: "first",
      residual: "leave",
    };
  } else {
    if (!isPlainObject(marginal)) {
      throw new Error("marginal must be an object");
    }
    let mMode = marginal.mode;
    if (mMode === undefined) mMode = "coexist";
    if (mMode == null || String(mMode).trim() === "") mMode = "coexist";
    mMode = String(mMode).trim().toLowerCase();
    if (mMode !== "coexist" && mMode !== "strict") {
      throw new Error(`marginal.mode: unsupported ${JSON.stringify(mMode)} (want coexist|strict)`);
    }
    let roleOrder = marginal.roleOrder || marginal.role_order || "first";
    if (roleOrder == null || String(roleOrder).trim() === "") {
      roleOrder = "first";
    }
    roleOrder = String(roleOrder).trim().toLowerCase();
    let residual = marginal.residual || "leave";
    if (residual == null || String(residual).trim() === "") {
      residual = "leave";
    }
    residual = String(residual).trim().toLowerCase();
    if (residual !== "leave" && residual !== "park") {
      throw new Error(
        `marginal.residual: unsupported ${JSON.stringify(residual)} (want leave|park)`
      );
    }
    out.marginal = {
      mode: mMode,
      roleOrder,
      residual,
    };
  }

  const floating = data.floating;
  if (floating != null) {
    if (!Array.isArray(floating)) {
      throw new Error("floating must be an array");
    }
    out.floating = floating;
  }

  const focus = data.focus;
  if (roleRefPresent(focus)) {
    checkRoleRefShape(focus, "focus");
    out.focus = focus;
  }

  if (Object.keys(aliases).length) {
    out.monitors = aliases;
  }

  resolveProfileFocusActive(out);

  return out;
}

function validateLayoutChildren(childrenIn, monKey, pathPrefix, where, slotIds, monRoleMap) {
  const children = [];
  childrenIn.forEach((ch, i) => {
    const chWhere = `${where}.children[${i}]`;
    if (!isPlainObject(ch)) {
      throw new Error(`${chWhere}: must be an object`);
    }

    const nestedIn = ch.children;
    const hasNested = Array.isArray(nestedIn);

    let rolesList = ch.roles;
    if (rolesList != null) {
      if (!Array.isArray(rolesList) || !rolesList.every((r) => typeof r === "string" && r.trim())) {
        throw new Error(`${chWhere}.roles must be a string array`);
      }
      rolesList = rolesList.map((r) => String(r).trim());
    } else {
      rolesList = null;
    }

    if (hasNested && rolesList) {
      throw new Error(`${chWhere}: use roles or nested children, not both`);
    }

    let cid = ch.id;
    if (cid === undefined || cid === null || String(cid).trim() === "") {
      if (rolesList && rolesList.length === 1 && !hasNested) {
        cid = rolesList[0];
      } else {
        throw new Error(`${chWhere}: id required (or single roles:[id] to default id)`);
      }
    }
    cid = String(cid).trim();
    if (!NAME_RE.test(cid)) {
      throw new Error(`${chWhere}.id: invalid ${JSON.stringify(cid)} (use A-Za-z0-9_-)`);
    }
    const fullSlot = `${pathPrefix}.${cid}`;
    if (slotIds.has(fullSlot)) {
      throw new Error(`duplicate slot id: ${fullSlot}`);
    }
    slotIds.add(fullSlot);

    const child = { id: cid };

    if (hasNested) {
      const nested = validateLayoutChildren(
        nestedIn,
        monKey,
        fullSlot,
        chWhere,
        slotIds,
        monRoleMap
      );
      child.children = nested;
      let split = ch.split;
      if ((split === undefined || split === null) && nested.length >= 2) {
        split = "hsplit";
      }
      if (split !== undefined && split !== null) {
        const splitS = String(split).trim().toLowerCase();
        if (!["hsplit", "vsplit", "tabbed", "stacked"].includes(splitS)) {
          throw new Error(`${chWhere}.split: unsupported ${JSON.stringify(split)}`);
        }
        child.split = splitS;
      }
      let shares = normalizeShares(ch.share);
      if (shares === null) shares = normalizeShares(ch.ratio);
      if (shares !== null && shares.length === nested.length && nested.length >= 2) {
        child.share = shares;
      }
    } else {
      let lay = ch.layout;
      if ((lay === undefined || lay === null) && rolesList && rolesList.length >= 2) {
        lay = "tabbed";
      }
      if (lay !== undefined && lay !== null) {
        const layS = String(lay).trim().toLowerCase();
        if (!["tabbed", "stacked", "hsplit", "vsplit"].includes(layS)) {
          throw new Error(`${chWhere}.layout: unsupported ${JSON.stringify(lay)}`);
        }
        child.layout = layS;
      }
      if (rolesList != null) {
        child.roles = rolesList;
        for (const rid of child.roles) {
          if (Object.prototype.hasOwnProperty.call(monRoleMap, rid)) {
            throw new Error(`role ${JSON.stringify(rid)} listed in multiple layout slots`);
          }
          monRoleMap[rid] = fullSlot;
        }
      }
      const active = ch.active;
      if (roleRefPresent(active)) {
        checkRoleRefShape(active, `${chWhere}.active`);
        child.active = active;
      }
    }

    children.push(child);
  });
  return children;
}

function normalizeMatch(match, where) {
  const out = {};
  const cls = match.class || match.wmClass || match.wm_class;
  if (cls != null) {
    if (typeof cls !== "string" || !cls.trim()) {
      throw new Error(`${where}: class must be a non-empty string`);
    }
    out.class = cls.trim();
  }

  if (Object.prototype.hasOwnProperty.call(match, "title") && match.title != null) {
    if (typeof match.title !== "string") {
      throw new Error(`${where}: title must be a string`);
    }
    out.title = match.title;
  }

  const titleSub = match["title~="];
  if (titleSub != null) {
    if (typeof titleSub !== "string" || titleSub === "") {
      throw new Error(`${where}: title~= must be a non-empty string`);
    }
    out["title~="] = titleSub;
  }

  const mon = Object.prototype.hasOwnProperty.call(match, "mon") ? match.mon : match.monitor;
  if (mon != null && mon !== "") {
    out.mon = mon;
  }

  if (!("class" in out || "title" in out || "title~=" in out)) {
    throw new Error(`${where}: need class, title, and/or title~=`);
  }
  return out;
}

// Internal desugar entry for tests / AL3 if needed
export {
  desugarTiles as _desugarTiles,
  bareArrayToMonTiles as _bareArrayToMonTiles,
  extractTilesFromProfile as _extractTilesFromProfile,
};

/* ========== AL3: planReconcile + helpers + planActionsToSteps ========== */

const MON_ID_RE = /^mo(\d+)ws(\d+)$/;
const GEOM_SK_RE = /^geom:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/;
const PLACEHOLDER_WM_CLASS = "forge-placeholder";
const PH_TITLE_RE = /^forge-ph:(?<slot>[^:]+):(?<role>.+)$/i;
const THRASH_SCORE_THRESHOLD = 3;
const THRASH_WRONG_MON_K = 2;

function layoutMonSortKey(key) {
  const m = MON_KEY_RE.exec(String(key));
  if (m) return [0, parseInt(m[1], 10), ""];
  if (key === "primary") return [1, 0, ""];
  return [2, 0, String(key)];
}

function cmpTuple(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") return x - y;
    const sx = String(x);
    const sy = String(y);
    if (sx < sy) return -1;
    if (sx > sy) return 1;
  }
  return 0;
}

function sortByKey(arr, keyFn) {
  return arr
    .map((v, i) => ({ v, i, k: keyFn(v) }))
    .sort((a, b) => {
      const c = cmpTuple(a.k, b.k);
      return c !== 0 ? c : a.i - b.i;
    })
    .map((x) => x.v);
}

function normalizeWorkspace(workspace) {
  const ws = Number.parseInt(workspace, 10);
  if (!Number.isFinite(ws)) return 0;
  return ws >= 0 ? ws : 0;
}

function parseMonId(monId) {
  const m = MON_ID_RE.exec(String(monId || ""));
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function monIndexFromSlot(slot) {
  if (!slot) return null;
  const headRest = monHeadAndRest(slot);
  const head = headRest[0];
  if (!head) return null;
  if (head === "primary") return 0;
  const mm = MON_KEY_RE.exec(head);
  if (mm) return parseInt(mm[1], 10);
  return null;
}

function asRect(raw) {
  if (!isPlainObject(raw)) return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const w = Number(raw.width);
  const h = Number(raw.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

function monNodeRect(monNode) {
  const r = asRect(monNode && monNode.rect);
  if (r) return r;
  const sk = monNode && monNode.stableKey;
  if (typeof sk !== "string") return null;
  const m = GEOM_SK_RE.exec(sk.trim());
  if (!m) return null;
  return {
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
    width: parseFloat(m[3]),
    height: parseFloat(m[4]),
  };
}

function orderMonitors(mons) {
  return sortByKey(mons, (m) => {
    if (!isPlainObject(m)) return [99, 99, ""];
    const mid = m.id || "";
    const parsed = mid ? parseMonId(String(mid)) : null;
    if (parsed) return [parsed[1], parsed[0], String(mid)];
    return [50, 50, String(mid)];
  });
}

function iterForestMonitors(forest) {
  if (isPlainObject(forest)) {
    const mons = forest.monitors;
    if (Array.isArray(mons)) return orderMonitors(mons);
    return [forest];
  }
  if (Array.isArray(forest)) return orderMonitors(forest);
  return [];
}

function monitorNodeIndex(m) {
  const mid = m && m.id;
  if (typeof mid === "string") {
    const parsed = parseMonId(mid);
    if (parsed) return parsed[0];
  }
  const mon = m && m.monitor;
  if (isInt(mon) && mon >= 0) return mon;
  return null;
}

function forestPhysicalMonCount(forest) {
  const idxs = new Set();
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    const idx = monitorNodeIndex(m);
    if (idx != null) idxs.add(idx);
  }
  return Math.max(1, idxs.size);
}

function forestMonIndicesLeftToRight(forest) {
  const best = new Map();
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    const idx = monitorNodeIndex(m);
    if (idx == null) continue;
    const rect = monNodeRect(m);
    let x;
    let y;
    if (rect) {
      x = rect.x;
      y = rect.y;
    } else {
      x = idx * 1000000.0;
      y = 0.0;
    }
    const prev = best.get(idx);
    if (prev == null || cmpTuple([x, y], prev) < 0) best.set(idx, [x, y]);
  }
  return [...best.entries()]
    .sort((a, b) => cmpTuple([a[1][0], a[1][1], a[0]], [b[1][0], b[1][1], b[0]]))
    .map(([i]) => i);
}

function forestProfileMonKwargs(forest) {
  const idxs = forestMonIndicesLeftToRight(forest);
  if (!idxs.length) return { mon_count: 1, mon_indices: [0] };
  return { mon_count: idxs.length, mon_indices: idxs };
}

function monitorWorkspaceIndex(m) {
  const mid = m && m.id;
  if (typeof mid === "string") {
    const parsed = parseMonId(mid);
    if (parsed) return parsed[1];
  }
  return null;
}

function filterForestWorkspace(forest, workspace = 0) {
  const ws = normalizeWorkspace(workspace);
  if (!isPlainObject(forest)) return forest;
  const mons = forest.monitors;
  if (!Array.isArray(mons)) return forest;
  const kept = [];
  for (const m of mons) {
    if (!isPlainObject(m)) continue;
    const mws = monitorWorkspaceIndex(m);
    if (mws == null) {
      if (ws === 0) kept.push(m);
    } else if (mws === ws) {
      kept.push(m);
    }
  }
  return Object.assign({}, forest, { monitors: kept });
}

function primaryMonIndex(forest) {
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    const sk = m.stableKey || "";
    if (m.isPrimary === true || (typeof sk === "string" && sk.includes("#primary"))) {
      const idx = monitorNodeIndex(m);
      if (idx != null) return idx;
    }
  }
  return 0;
}

function forestStableKeyMap(forest) {
  const out = {};
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    let sk = m.stableKey;
    if (typeof sk !== "string" || !sk.trim()) continue;
    sk = sk.trim();
    const idx = monitorNodeIndex(m);
    if (idx == null) continue;
    if (!(sk in out)) out[sk] = idx;
  }
  return out;
}

function geomRoleMonIndex(role, forest) {
  const idxs = forestMonIndicesLeftToRight(forest);
  if (!idxs.length) return 0;
  if (role === "left") return idxs[0];
  if (role === "right") return idxs[idxs.length - 1];
  const best = new Map();
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    const idx = monitorNodeIndex(m);
    if (idx == null) continue;
    const rect = monNodeRect(m);
    let x;
    let y;
    if (rect) {
      x = rect.x;
      y = rect.y;
    } else {
      x = idx * 1000000.0;
      y = 0.0;
    }
    const prev = best.get(idx);
    if (prev == null || cmpTuple([y, x], prev) < 0) best.set(idx, [y, x]);
  }
  const ordered = [...best.entries()]
    .sort((a, b) => cmpTuple([a[1][0], a[1][1], a[0]], [b[1][0], b[1][1], b[0]]))
    .map(([i]) => i);
  if (!ordered.length) return idxs[0];
  if (role === "top") return ordered[0];
  return ordered[ordered.length - 1];
}

function resolveMonKey(key, forest, aliases) {
  if (!key || !String(key).trim()) throw new Error("empty monitor key");
  key = String(key).trim();
  aliases = aliases || {};
  if (key === "primary") return primaryMonIndex(forest);
  const mm = MON_KEY_RE.exec(key);
  if (mm) return parseInt(mm[1], 10);
  if (Object.prototype.hasOwnProperty.call(aliases, key)) {
    return resolveMonKey(aliases[key], forest, {});
  }
  if (isGeomRoleKey(key)) return geomRoleMonIndex(key, forest);
  const skMap = forestStableKeyMap(forest);
  if (Object.prototype.hasOwnProperty.call(skMap, key)) return skMap[key];
  const available = Object.keys(skMap).sort().join(", ") || "(none)";
  let aliasHint = "";
  if (Object.keys(aliases).length) {
    aliasHint = "; profile aliases: " + Object.keys(aliases).sort().join(", ");
  }
  throw new Error(
    "monitor key " +
      JSON.stringify(key) +
      " not in forest (available stableKeys: " +
      available +
      aliasHint +
      "; also monN / primary / left|right|top|bottom)"
  );
}

function resolveMonKeyToMonN(key, forest, aliases) {
  return "mon" + resolveMonKey(key, forest, aliases);
}

function rewriteSlotMon(slot, forest, aliases, cache, knownHeads) {
  const hr = monHeadAndRest(slot, knownHeads);
  const head = hr[0];
  const rest = hr[1];
  if (!head) return slot;
  if (!(head in cache)) {
    cache[head] = resolveMonKeyToMonN(head, forest, aliases);
  }
  const monN = cache[head];
  if (rest == null || rest === "") return monN;
  return monN + "." + rest;
}

function resolveProfileMonKeys(profile, forest) {
  const out = deepClone(profile);
  const aliasesRaw = isPlainObject(out.monitors) ? out.monitors : {};
  const aliases = {};
  for (const [k, v] of Object.entries(aliasesRaw)) {
    aliases[String(k)] = String(v);
  }
  const cache = {};
  const skMap = forestStableKeyMap(forest);
  const knownHeads = new Set([...Object.keys(skMap), ...Object.keys(aliases), ...GEOM_ROLE_KEYS]);
  if (isPlainObject(out.layout)) {
    for (const k of Object.keys(out.layout)) knownHeads.add(String(k));
  }
  const layoutIn = out.layout;
  if (isPlainObject(layoutIn)) {
    const newLayout = {};
    for (const [monKey, monBody] of Object.entries(layoutIn)) {
      const monN = cache[String(monKey)] || resolveMonKeyToMonN(String(monKey), forest, aliases);
      cache[String(monKey)] = monN;
      if (Object.prototype.hasOwnProperty.call(newLayout, monN)) {
        throw new Error(
          "monitor keys " + JSON.stringify(monKey) + " and another key both resolve to " + monN
        );
      }
      newLayout[monN] = monBody;
    }
    out.layout = newLayout;
  }
  for (const role of out.roles || []) {
    if (!isPlainObject(role)) continue;
    const slot = role.slot;
    if (typeof slot === "string" && slot.trim()) {
      role.slot = rewriteSlotMon(slot.trim(), forest, aliases, cache, knownHeads);
    }
  }
  const overflow = out.overflow;
  if (isPlainObject(overflow)) {
    const oslot = overflow.slot;
    if (typeof oslot === "string" && oslot.trim()) {
      overflow.slot = rewriteSlotMon(oslot.trim(), forest, aliases, cache, knownHeads);
    }
  }
  delete out.monitors;
  return out;
}

function windowMonitorIndex(w) {
  const path = (w && w.path) || "";
  if (typeof path === "string" && path) {
    const first = path.split("/")[0];
    const parsed = parseMonId(first);
    if (parsed) return parsed[0];
  }
  const mon = w && w.monitor;
  if (isInt(mon) && mon >= 0) return mon;
  return null;
}

export function isChromeBrowserClass(s) {
  const n = String(s || "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  if (n === "google-chrome" || n === "chromium" || n === "chromium-browser" || n === "chrome")
    return true;
  if (n.startsWith("google-chrome-")) return true;
  return false;
}

export function chromePwaAppId(s) {
  const n = String(s || "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (n.startsWith("crx_") && n.length > 4) return n.slice(4);
  if (!n.startsWith("chrome-")) return null;
  const rest = n.slice("chrome-".length);
  if (rest.endsWith("-default") && rest.length > "-default".length) {
    return rest.slice(0, -"-default".length);
  }
  const m = /^(.+)-profile(?:[._-].+)?$/.exec(rest);
  if (m && m[1]) return m[1];
  return null;
}

export function isChromePwaClass(s) {
  return chromePwaAppId(s) != null;
}

export function isChromeFamilyClass(s) {
  return isChromeBrowserClass(s) || isChromePwaClass(s);
}

export function classEq(a, b) {
  if (a == null || b == null) return false;
  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (sa.endsWith("." + sb) || sb.endsWith("." + sa)) return true;
  const aId = chromePwaAppId(sa);
  const bId = chromePwaAppId(sb);
  if (aId && bId && aId === bId) return true;
  const aBrowser = isChromeBrowserClass(sa);
  const bBrowser = isChromeBrowserClass(sb);
  const aPwa = isChromePwaClass(sa);
  const bPwa = isChromePwaClass(sb);
  if ((aBrowser && bPwa) || (aPwa && bBrowser)) return true;
  if (aBrowser && bBrowser) return true;
  return false;
}

function parseRegexLiteral(body) {
  if (!body.startsWith("/")) throw new Error("regex must start with /");
  let i = 1;
  let source = "";
  let escaped = false;
  while (i < body.length) {
    const ch = body[i];
    if (escaped) {
      source += ch;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      source += ch;
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === "/") break;
    source += ch;
    i += 1;
  }
  if (i >= body.length || body[i] !== "/") throw new Error("unterminated regex");
  const flags = body.slice(i + 1);
  if (flags && !/^[gimsuy]*$/.test(flags)) {
    throw new Error("invalid regex flags: " + flags);
  }
  // validate
  new RegExp(source, reFlagsToJs(flags));
  return [source, flags];
}

function reFlagsToJs(flags) {
  let f = "";
  if (!flags) return f;
  if (flags.includes("i")) f += "i";
  if (flags.includes("m")) f += "m";
  if (flags.includes("s")) f += "s";
  return f;
}

function windowMatches(w, match) {
  const clsWant = match.class;
  if (clsWant != null) {
    const got = w.wmClass || w.wm_class || "";
    if (!classEq(got, clsWant)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(match, "title")) {
    const title = w.title;
    if (title == null || String(title) !== match.title) return false;
  }
  if (Object.prototype.hasOwnProperty.call(match, "title~=")) {
    const body = match["title~="];
    const title = w.title;
    if (title == null) return false;
    const titleS = String(title);
    if (String(body).startsWith("/")) {
      let source;
      let flags;
      try {
        const pr = parseRegexLiteral(body);
        source = pr[0];
        flags = pr[1];
      } catch (_e) {
        return false;
      }
      let cre;
      try {
        cre = new RegExp(source, reFlagsToJs(flags));
      } catch (_e2) {
        return false;
      }
      if (!cre.test(titleS)) return false;
    } else if (!titleS.includes(body)) {
      return false;
    }
  }
  return true;
}

function isPlaceholderWindowNode(n) {
  if (n.placeholder === true) return true;
  const wm = n.wmClass || n.wm_class;
  if (wm === PLACEHOLDER_WM_CLASS) return true;
  return false;
}

function windowKey(w) {
  const wid = w.windowId;
  if (wid != null) return "id:" + wid;
  return "path:" + w.path;
}

function windowSummary(w) {
  const out = {
    windowId: w.windowId,
    path: w.path,
    wmClass: w.wmClass || w.wm_class,
    title: w.title,
  };
  const mon = windowMonitorIndex(w);
  if (mon != null) out.monitor = mon;
  return out;
}

export function collectWindows(forest, opts) {
  opts = opts || {};
  let workspace = opts.workspace;
  if (workspace !== undefined && workspace != null) {
    forest = filterForestWorkspace(forest, workspace);
  }
  const out = [];

  function walk(n, path, monIdx) {
    if (!isPlainObject(n)) return;
    const ntype = n.nodeType || n.type;
    if (ntype === "WINDOW") {
      if (isPlaceholderWindowNode(n)) return;
      const w = {
        windowId: n.windowId,
        wmClass: n.wmClass || n.wm_class,
        title: n.title,
        path: path || n.path,
        monitor: isInt(n.monitor) ? n.monitor : monIdx,
        mode: n.mode,
        pid: n.pid,
      };
      if (isPlainObject(n.rect)) w.rect = n.rect;
      if (w.windowId == null && !w.path) return;
      out.push(w);
      const kids = n.children || n.childNodes || [];
      if (Array.isArray(kids)) {
        for (let i = 0; i < kids.length; i++) {
          walk(kids[i], path ? path + "/" + i : String(i), monIdx);
        }
      }
      return;
    }
    const kids = n.children || n.childNodes || [];
    if (!Array.isArray(kids)) return;
    let curMon = monIdx;
    const monId = ntype === "MONITOR" ? n.id : null;
    if (ntype === "MONITOR" && typeof monId === "string") {
      const parsed = parseMonId(monId);
      if (parsed) curMon = parsed[0];
    }
    for (let i = 0; i < kids.length; i++) {
      let childPath;
      if (monId) childPath = monId + "/" + i;
      else if (path) childPath = path + "/" + i;
      else childPath = String(i);
      walk(kids[i], childPath, curMon);
    }
  }

  if (isPlainObject(forest)) {
    const mons = forest.monitors;
    if (Array.isArray(mons)) {
      for (const m of orderMonitors(mons)) walk(m, "", null);
    } else {
      walk(forest, "", null);
    }
  } else if (Array.isArray(forest)) {
    for (const m of orderMonitors(forest)) walk(m, "", null);
  }

  if (isPlainObject(forest)) {
    const seen = new Set(out.filter((w) => w.windowId != null).map((w) => String(w.windowId)));
    for (const extra of [...(forest.orphanWindows || []), ...(forest.metaWindows || [])]) {
      if (!isPlainObject(extra)) continue;
      if (extra.placeholder === true) continue;
      if (extra.tracked === false) continue;
      const wid = extra.windowId;
      if (wid == null || seen.has(String(wid))) continue;
      seen.add(String(wid));
      out.push({
        windowId: wid,
        wmClass: extra.wmClass || extra.wm_class,
        title: extra.title,
        path: extra.path,
        monitor: isInt(extra.monitor) ? extra.monitor : null,
        mode: extra.mode,
        pid: extra.pid,
      });
    }
  }
  return out;
}

function collectLayoutPlaceholders(forest, opts) {
  opts = opts || {};
  let workspace = opts.workspace;
  if (workspace !== undefined && workspace != null) {
    forest = filterForestWorkspace(forest, workspace);
  }
  const out = [];

  function walk(n, path, monIdx) {
    if (!isPlainObject(n)) return;
    const ntype = n.nodeType || n.type;
    if (ntype === "WINDOW") {
      if (!isPlaceholderWindowNode(n)) return;
      let role = n.layoutRole;
      let slot = n.layoutSlot;
      const title = n.title;
      if ((role == null || slot == null) && typeof title === "string") {
        const m = PH_TITLE_RE.exec(title.trim());
        if (m) {
          slot = slot || (m.groups && m.groups.slot) || m[1];
          role = role || (m.groups && m.groups.role) || m[2];
        }
      }
      if (role == null && slot == null) return;
      out.push({
        windowId: n.windowId,
        path: path || n.path,
        monitor: isInt(n.monitor) ? n.monitor : monIdx,
        layoutRole: role != null ? String(role) : null,
        layoutSlot: slot != null ? String(slot) : null,
        title,
        placeholder: true,
      });
      return;
    }
    const kids = n.children || n.childNodes || [];
    if (!Array.isArray(kids)) return;
    let curMon = monIdx;
    const monId = ntype === "MONITOR" ? n.id : null;
    if (ntype === "MONITOR" && typeof monId === "string") {
      const parsed = parseMonId(monId);
      if (parsed) curMon = parsed[0];
    }
    for (let i = 0; i < kids.length; i++) {
      let childPath;
      if (monId) childPath = monId + "/" + i;
      else if (path) childPath = path + "/" + i;
      else childPath = String(i);
      walk(kids[i], childPath, curMon);
    }
  }

  if (isPlainObject(forest)) {
    const mons = forest.monitors;
    if (Array.isArray(mons)) {
      for (const m of orderMonitors(mons)) walk(m, "", null);
    } else {
      walk(forest, "", null);
    }
  } else if (Array.isArray(forest)) {
    for (const m of orderMonitors(forest)) walk(m, "", null);
  }
  return out;
}

function buildEnsureSkeletonAction(prof, opts) {
  opts = opts || {};
  const workspace = opts.workspace != null ? opts.workspace : 0;
  const layout = prof.layout;
  if (!isPlainObject(layout) || !Object.keys(layout).length) return null;
  const mons = [];

  function childSpec(ch, prefix) {
    const cid = ch.id;
    if (cid == null || String(cid).trim() === "") return null;
    const full = prefix + "." + cid;
    const nested = ch.children;
    if (Array.isArray(nested) && nested.length) {
      const kids = [];
      for (const sub of nested) {
        if (isPlainObject(sub)) {
          const spec = childSpec(sub, full);
          if (spec != null) kids.push(spec);
        }
      }
      if (!kids.length) return null;
      let split = String(ch.split || "hsplit")
        .trim()
        .toLowerCase();
      if (split !== "hsplit" && split !== "vsplit") split = "hsplit";
      const entry = {
        id: String(cid),
        slot: full,
        split,
        children: kids,
      };
      const shares = normalizeShares(ch.share || ch.shares);
      if (shares != null) entry.shares = shares;
      return entry;
    }
    const rolesRaw = ch.roles || [];
    const roles = rolesRaw
      .filter((r) => r != null && String(r).trim() !== "")
      .map((r) => String(r));
    let mode =
      String(ch.layout || "")
        .trim()
        .toLowerCase() || null;
    if (mode && mode !== "tabbed" && mode !== "stacked" && mode !== "hsplit" && mode !== "vsplit") {
      mode = null;
    }
    if (
      roles.length > 1 &&
      mode !== "tabbed" &&
      mode !== "stacked" &&
      mode !== "hsplit" &&
      mode !== "vsplit"
    ) {
      mode = "tabbed";
    } else if (roles.length <= 1) {
      mode = null;
    }
    const entry = {
      id: String(cid),
      slot: full,
      roles,
    };
    if (mode) entry.mode = mode;
    const shares = normalizeShares(ch.share || ch.shares);
    if (shares != null) entry.shares = shares;
    return entry;
  }

  const monKeys = Object.keys(layout).sort((a, b) =>
    cmpTuple(layoutMonSortKey(a), layoutMonSortKey(b))
  );
  for (const monKey of monKeys) {
    const monBody = layout[monKey];
    if (!isPlainObject(monBody)) continue;
    const monI = monIndexFromSlot(String(monKey));
    if (monI == null) continue;
    const childrenOut = [];
    for (const ch of monBody.children || []) {
      if (!isPlainObject(ch)) continue;
      const spec = childSpec(ch, String(monKey));
      if (spec != null) childrenOut.push(spec);
    }
    if (!childrenOut.length) continue;
    let split = String(monBody.split || "hsplit")
      .trim()
      .toLowerCase();
    if (split !== "hsplit" && split !== "vsplit") split = "hsplit";
    const monEntry = {
      mon: monI,
      slot: String(monKey),
      split,
      children: childrenOut,
    };
    const shares = normalizeShares(monBody.share || monBody.shares);
    if (shares != null) monEntry.shares = shares;
    mons.push(monEntry);
  }
  if (!mons.length) return null;
  return {
    op: "ensure_skeleton",
    workspace: parseInt(workspace, 10) || 0,
    mons,
  };
}

function buildBindActions(roleResults, placeholders) {
  const byRole = {};
  const bySlotRole = {};
  for (const ph of placeholders) {
    if (!isPlainObject(ph)) continue;
    const role = ph.layoutRole;
    const slot = ph.layoutSlot;
    if (role != null && String(role).trim() !== "") {
      if (!(String(role) in byRole)) byRole[String(role)] = ph;
    }
    if (role != null && slot != null && String(role).trim() !== "" && String(slot).trim() !== "") {
      const k = String(slot) + "\0" + String(role);
      if (!(k in bySlotRole)) bySlotRole[k] = ph;
    }
  }
  const out = [];
  const usedPh = new Set();
  for (const r of roleResults) {
    if (!isPlainObject(r)) continue;
    const rid = r.id;
    const wid = r.windowId;
    if (rid == null || wid == null || String(wid).trim() === "") continue;
    const slot = String(r.slot || "");
    const ph = bySlotRole[slot + "\0" + String(rid)] || byRole[String(rid)] || null;
    if (ph == null) continue;
    const phId = ph.windowId;
    const phKey = String(phId != null ? phId : ph.path || Object.keys(ph).join());
    if (usedPh.has(phKey)) continue;
    usedPh.add(phKey);
    const act = {
      op: "bind",
      role: rid,
      slot,
      windowId: wid,
      layoutRole: String(ph.layoutRole || rid),
      layoutSlot: String(ph.layoutSlot || slot),
    };
    if (phId != null) act.placeholderId = phId;
    out.push(act);
  }
  return out;
}

function floatingCellToMatch(cell) {
  if (typeof cell === "string") {
    const token = cell.trim();
    if (!token) return null;
    const im = inferOpenAndMatch(token);
    const match = im[1];
    return isPlainObject(match) && Object.keys(match).length ? match : null;
  }
  if (!isPlainObject(cell)) return null;
  let match = cell.match;
  if (typeof match === "string" && match.trim()) return { class: match.trim() };
  if (isPlainObject(match) && Object.keys(match).length) return { ...match };
  const flat = {};
  if (cell.class != null) flat.class = cell.class;
  if (cell["title~="] != null) flat["title~="] = cell["title~="];
  else if (cell.title != null) flat.title = cell.title;
  if (Object.keys(flat).length) return flat;
  const app = cell.app;
  if (app != null && String(app).trim()) {
    const im = inferOpenAndMatch(String(app).trim());
    match = im[1];
    if (isPlainObject(match) && Object.keys(match).length) return match;
  }
  return null;
}

function claimFloatingWindows(floating, windows, claimed) {
  if (!Array.isArray(floating) || !floating.length) return 0;
  let n = 0;
  for (const cell of floating) {
    const match = floatingCellToMatch(cell);
    if (!match) continue;
    const candidates = windows.filter((w) => !claimed.has(windowKey(w)) && windowMatches(w, match));
    if (!candidates.length) continue;
    const floats = candidates.filter((w) => String(w.mode || "").toUpperCase() === "FLOAT");
    const pick = floats.length ? floats[0] : candidates[0];
    const key = windowKey(pick);
    if (key) {
      claimed.add(key);
      n += 1;
    }
  }
  return n;
}

function matchMonPref(match, slotMon) {
  const mon = match.mon;
  if (mon == null || mon === "") return slotMon;
  if (isInt(mon)) return mon;
  const s = String(mon).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.startsWith("mo") && /^\d+$/.test(s.slice(2))) return parseInt(s.slice(2), 10);
  const mm = MON_KEY_RE.exec(s);
  if (mm) return parseInt(mm[1], 10);
  const parsed = parseMonId(s);
  if (parsed) return parsed[0];
  return slotMon;
}

function pickWindow(candidates, prefMon, opts) {
  opts = opts || {};
  const monOnly = !!opts.monOnly;
  if (!candidates.length) return null;
  if (prefMon != null) {
    const onMon = candidates.filter((w) => windowMonitorIndex(w) === prefMon);
    if (onMon.length) return onMon[0];
    if (monOnly) return null;
  } else if (monOnly) {
    return null;
  }
  return candidates[0];
}

function twoPassClaimWindows(roles, windows) {
  const claimed = new Set();
  const chosen = roles.map(() => null);

  function freeMatches(role) {
    const match = role.match || {};
    return windows.filter((w) => !claimed.has(windowKey(w)) && windowMatches(w, match));
  }

  function prefFor(role) {
    const slot = String(role.slot || "");
    const desiredMon = monIndexFromSlot(slot);
    return matchMonPref(role.match || {}, desiredMon);
  }

  for (let i = 0; i < roles.length; i++) {
    const pick = pickWindow(freeMatches(roles[i]), prefFor(roles[i]), {
      monOnly: true,
    });
    if (pick != null) {
      chosen[i] = pick;
      claimed.add(windowKey(pick));
    }
  }
  for (let i = 0; i < roles.length; i++) {
    if (chosen[i] != null) continue;
    const pick = pickWindow(freeMatches(roles[i]), prefFor(roles[i]), {
      monOnly: false,
    });
    if (pick != null) {
      chosen[i] = pick;
      claimed.add(windowKey(pick));
    }
  }
  return chosen;
}

function roleClassWant(role) {
  const match = isPlainObject(role.match) ? role.match : {};
  let cls = match.class || match.wmClass || match.wm_class;
  if (cls != null && String(cls).trim()) return String(cls).trim();
  const openSpec = isPlainObject(role.open) ? role.open : {};
  cls = openSpec.wmClass || openSpec.wm_class;
  if (cls != null && String(cls).trim()) return String(cls).trim();
  return null;
}

function claimClassOnlyWindows(roles, windows, chosen) {
  if (!roles || !roles.length || !windows || !windows.length) return chosen;
  const claimed = new Set();
  for (const w of chosen) {
    if (w != null) claimed.add(windowKey(w));
  }
  const out = chosen.slice();

  function prefFor(role) {
    const slot = String(role.slot || "");
    const desiredMon = monIndexFromSlot(slot);
    return matchMonPref(role.match || {}, desiredMon);
  }

  for (let i = 0; i < roles.length; i++) {
    if (out[i] != null) continue;
    const want = roleClassWant(roles[i]);
    if (!want) continue;
    const candidates = [];
    for (const w of windows) {
      if (!isPlainObject(w) || claimed.has(windowKey(w))) continue;
      if (w.placeholder === true) continue;
      const got = w.wmClass || w.wm_class || "";
      if (String(got).toLowerCase().startsWith("forge-placeholder")) continue;
      if (classEq(got, want)) candidates.push(w);
    }
    const pick = pickWindow(candidates, prefFor(roles[i]), { monOnly: false });
    if (pick == null) continue;
    out[i] = pick;
    claimed.add(windowKey(pick));
  }
  return out;
}

function normalizeRolePins(rolePins) {
  if (!isPlainObject(rolePins)) return {};
  const out = {};
  for (const [rid, wid] of Object.entries(rolePins)) {
    if (rid == null || wid == null || String(wid).trim() === "") continue;
    const key = String(rid).trim();
    if (key) out[key] = wid;
  }
  return out;
}

function applyRolePins(roles, windows, chosen, rolePins) {
  if (!rolePins || !Object.keys(rolePins).length) return chosen;
  const byWid = {};
  for (const w of windows) {
    const wid = w.windowId;
    if (wid != null && String(wid).trim() !== "") byWid[String(wid)] = w;
  }
  const claimed = new Set();
  for (const w of chosen) {
    if (w != null) claimed.add(windowKey(w));
  }
  const out = chosen.slice();
  for (let i = 0; i < roles.length; i++) {
    if (out[i] != null) continue;
    const rid = roles[i].id;
    if (rid == null) continue;
    const pin = rolePins[String(rid)];
    if (pin == null) continue;
    const w = byWid[String(pin)];
    if (w == null) continue;
    const key = windowKey(w);
    if (claimed.has(key)) continue;
    out[i] = w;
    claimed.add(key);
  }
  return out;
}

function slotMonKey(slot) {
  if (slot == null) return null;
  const s = String(slot).trim();
  if (!s) return null;
  const head = s.split(".")[0];
  if (MON_KEY_RE.test(head) || head === "primary") return head;
  return null;
}

function focusActionsFromProfile(prof, roleResults, opts) {
  opts = opts || {};
  const forest = opts.forest;
  const justOpenedRoles = opts.justOpenedRoles || new Set();
  const byId = {};
  for (const r of roleResults) {
    if (r.id != null) byId[String(r.id)] = r;
  }
  const actions = [];
  const seenSels = new Set();
  const opened = justOpenedRoles;
  const lastTabByWid = forest != null ? lastTabFocusWindowIds(forest) : new Set();

  function addRoleFocus(rid, reason) {
    if (rid == null) return;
    const key = String(rid);
    const r = byId[key];
    if (!r) return;
    const wid = r.windowId;
    if (wid == null || wid === "") return;
    const sel = "id:" + wid;
    if (seenSels.has(sel)) return;
    seenSels.add(sel);
    actions.push({
      op: "focus",
      selector: sel,
      role: key,
      reason,
    });
  }

  function walk(children) {
    if (!Array.isArray(children)) return;
    for (const ch of children) {
      if (!isPlainObject(ch)) continue;
      const nested = ch.children;
      if (Array.isArray(nested) && nested.length) walk(nested);
      const lay = String(ch.layout || "")
        .trim()
        .toLowerCase();
      const rolesList = Array.isArray(ch.roles) ? ch.roles : [];
      const isGroup = lay === "tabbed" || lay === "stacked" || rolesList.length >= 2;
      if (!isGroup) continue;
      const active = ch.active;
      if (active != null && String(active).trim()) {
        addRoleFocus(String(active).trim(), "active");
        continue;
      }
      const survivor = pickSurvivorOpenRole(rolesList, byId, opened, lastTabByWid);
      if (survivor != null) addRoleFocus(survivor, "survivor");
    }
  }

  for (const monBody of Object.values(prof.layout || {})) {
    if (isPlainObject(monBody)) walk(monBody.children);
  }

  const focus = prof.focus;
  if (focus != null && String(focus).trim()) {
    addRoleFocus(String(focus).trim(), "profile");
  }
  return actions;
}

function lastTabFocusWindowIds(forest) {
  const out = new Set();
  function walk(n) {
    if (!isPlainObject(n)) return;
    const tf = n.lastTabFocusId;
    if (tf != null && String(tf).trim() !== "") out.add(String(tf));
    for (const c of n.children || n.childNodes || []) walk(c);
  }
  if (isPlainObject(forest)) {
    const mons = forest.monitors;
    if (Array.isArray(mons)) {
      for (const m of mons) walk(m);
    } else {
      walk(forest);
    }
  } else if (Array.isArray(forest)) {
    for (const m of forest) walk(m);
  }
  return out;
}

function pickSurvivorOpenRole(roleIds, byId, justOpened, lastTabFocusWids) {
  const members = [];
  for (const rid of roleIds) {
    if (rid == null) continue;
    const r = byId[String(rid)];
    if (r) members.push(r);
  }
  if (members.length < 2) return null;

  let joining = false;
  const survivors = [];
  for (const r of members) {
    const rid = String(r.id);
    const status = String(r.status || "");
    const isOpenStatus = status === "open";
    const isJustOpened = justOpened.has(rid);
    if (isOpenStatus || isJustOpened) joining = true;
    const wid = r.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    if (isOpenStatus || isJustOpened) continue;
    survivors.push(r);
  }
  if (!joining || !survivors.length) return null;
  for (const r of survivors) {
    if (lastTabFocusWids.has(String(r.windowId))) return String(r.id);
  }
  return String(survivors[0].id);
}

function slotLayoutModes(prof) {
  const modes = {};
  function walk(children, prefix) {
    if (!Array.isArray(children)) return;
    for (const ch of children) {
      if (!isPlainObject(ch) || !ch.id) continue;
      const full = prefix + "." + ch.id;
      const nested = ch.children;
      if (Array.isArray(nested) && nested.length) {
        const split = String(ch.split || "")
          .trim()
          .toLowerCase();
        if (split === "hsplit" || split === "vsplit") modes[full] = split;
        walk(nested, full);
        continue;
      }
      if (ch.layout) modes[full] = ch.layout;
      else if (ch.roles && (ch.roles || []).length > 1) modes[full] = "tabbed";
    }
  }
  for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
    if (isPlainObject(monBody)) walk(monBody.children || [], monKey);
  }
  const overflow = prof.overflow || {};
  if (overflow.slot && overflow.layout) {
    if (!(overflow.slot in modes)) modes[overflow.slot] = overflow.layout;
  }
  return modes;
}

function roleWindowIdsForSlot(roleResults, slot) {
  const out = [];
  for (const r of roleResults) {
    if (r.slot !== slot) continue;
    const wid = r.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    out.push(wid);
  }
  return out;
}

function roleWindowIdsForSlotPrefix(roleResults, slotPrefix) {
  const out = [];
  const prefix = String(slotPrefix || "");
  if (!prefix) return out;
  for (const r of roleResults) {
    const s = String(r.slot || "");
    if (s !== prefix && !s.startsWith(prefix + ".")) continue;
    const wid = r.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    out.push(wid);
  }
  return out;
}

function parentHvSplitSlot(slot, layoutSlotModes) {
  if (!slot || !String(slot).includes(".")) return null;
  const parts = String(slot).split(".");
  for (let i = parts.length; i > 1; i--) {
    const cand = parts.slice(0, i).join(".");
    const mode = String(layoutSlotModes[cand] || "")
      .trim()
      .toLowerCase();
    if (mode === "hsplit" || mode === "vsplit") return cand;
  }
  return null;
}

function markLayoutSlotsForRole(slot, layoutSlotModes, slotsNeedingLayout) {
  if (!slot) return;
  const mode = layoutSlotModes[slot];
  if (mode) slotsNeedingLayout[slot] = mode;
  const parent = parentHvSplitSlot(slot, layoutSlotModes);
  if (parent) {
    const pmode = layoutSlotModes[parent];
    if (pmode) slotsNeedingLayout[parent] = pmode;
  }
}

function nestedSplitJoinDest(roles, roleWindows, slot, layoutSlotModes, excludeRoleId) {
  const parent = parentHvSplitSlot(slot, layoutSlotModes);
  if (!parent) return null;
  const exclude = excludeRoleId != null ? String(excludeRoleId) : "";
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const win = roleWindows[i];
    if (!isPlainObject(role) || win == null) continue;
    const rid = role.id;
    if (rid != null && String(rid) === exclude) continue;
    const rslot = String(role.slot || "");
    if (rslot !== parent && !rslot.startsWith(parent + ".")) continue;
    const wid = win.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    return wid;
  }
  return null;
}

function monChildLoc(path) {
  if (path == null) return null;
  const parts = String(path).split("/");
  if (parts.length < 2 || !parts[0]) return null;
  const idx = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(idx)) return null;
  return [parts[0], idx];
}

function firstRoleIdsInLayoutNode(node) {
  if (!isPlainObject(node)) return [];
  const roles = node.roles;
  if (Array.isArray(roles) && roles.length) return roles.map((x) => String(x));
  for (const sub of node.children || []) {
    if (isPlainObject(sub)) {
      const found = firstRoleIdsInLayoutNode(sub);
      if (found.length) return found;
    }
  }
  return [];
}

function monChildReps(roleResults, prof, monKey) {
  const byId = {};
  for (const r of roleResults) {
    if (r.id != null) byId[String(r.id)] = r;
  }
  const monBody = (prof.layout || {})[monKey];
  if (!isPlainObject(monBody)) return [];
  const out = [];
  for (const ch of monBody.children || []) {
    if (!isPlainObject(ch)) continue;
    for (const rid of firstRoleIdsInLayoutNode(ch)) {
      const r = byId[rid];
      if (!r) continue;
      const wid = r.windowId;
      if (wid == null || String(wid).trim() === "") continue;
      out.push(wid);
      break;
    }
  }
  return out;
}

function monOrderMatches(parentInfo, reps) {
  if (reps.length < 2) return true;
  const indices = [];
  let monId = null;
  for (const wid of reps) {
    const info = parentInfo[String(wid)] || {};
    const path = info.path;
    const loc = monChildLoc(path);
    if (loc == null) return false;
    if (monId == null) monId = loc[0];
    else if (loc[0] !== monId) return false;
    indices.push(loc[1]);
  }
  for (let i = 0; i < indices.length - 1; i++) {
    if (!(indices[i] < indices[i + 1])) return false;
  }
  return true;
}

function monOrderActions(roleResults, parentInfo, prof) {
  const actions = [];
  for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
    if (!isPlainObject(monBody)) continue;
    const split = String(monBody.split || "")
      .trim()
      .toLowerCase();
    if (split !== "hsplit" && split !== "vsplit") continue;
    const children = monBody.children || [];
    if (!Array.isArray(children) || children.length < 2) continue;
    const reps = monChildReps(roleResults, prof, monKey);
    if (reps.length < 2) continue;
    if (monOrderMatches(parentInfo, reps)) continue;
    actions.push({
      op: "ensure_order",
      slot: monKey,
      mode: split,
      windowIds: reps,
    });
  }
  return actions;
}

function layoutNodeChildReps(roleResults, node) {
  const byId = {};
  for (const r of roleResults) {
    if (r.id != null) byId[String(r.id)] = r;
  }
  const out = [];
  for (const ch of node.children || []) {
    if (!isPlainObject(ch)) continue;
    let found = false;
    for (const rid of firstRoleIdsInLayoutNode(ch)) {
      const r = byId[rid];
      if (!r) continue;
      const wid = r.windowId;
      if (wid == null || String(wid).trim() === "") continue;
      out.push(wid);
      found = true;
      break;
    }
    if (!found) return [];
  }
  return out;
}

function sizeActions(roleResults, prof) {
  const actions = [];
  function visit(node, slot) {
    if (!isPlainObject(node)) return;
    const children = node.children;
    // Missing share ⇒ equal siblings (profile desired state).
    let shares = normalizeShares(node.share);
    if (shares == null && Array.isArray(children) && children.length >= 2) {
      shares = normalizeShares(children.map(() => 1));
    }
    if (
      shares != null &&
      Array.isArray(children) &&
      children.length >= 2 &&
      shares.length === children.length
    ) {
      const reps = layoutNodeChildReps(roleResults, node);
      if (reps.length >= 2 && reps.length === shares.length) {
        actions.push({
          op: "ensure_sizes",
          slot,
          windowIds: reps,
          shares,
        });
      }
    }
    if (Array.isArray(children)) {
      for (const ch of children) {
        if (!isPlainObject(ch)) continue;
        const cid = ch.id;
        if (cid == null || String(cid).trim() === "") continue;
        const childSlot = slot ? slot + "." + cid : String(cid);
        visit(ch, childSlot);
      }
    }
  }
  for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
    if (!isPlainObject(monBody)) continue;
    visit(monBody, String(monKey));
  }
  return actions;
}

function softParkWindowSortKey(w, parentInfo) {
  const mon = windowMonitorIndex(w);
  if (mon == null) return null;
  const wid = w.windowId;
  if (wid == null) return null;
  const info = parentInfo[String(wid)] || {};
  const path = String(info.path || w.path || "");
  const loc = monChildLoc(path);
  const childI = loc ? loc[1] : -1;
  let leaf = 0;
  try {
    leaf = parseInt(path.split("/").pop(), 10);
    if (!Number.isFinite(leaf)) leaf = 0;
  } catch (_e) {
    leaf = 0;
  }
  return [mon | 0, childI, leaf];
}

function softParkAnchorsByMon(windows, parentInfo, claimed) {
  const bestByMon = new Map();
  for (const w of windows) {
    if (!claimed.has(windowKey(w))) continue;
    const key = softParkWindowSortKey(w, parentInfo);
    if (key == null) continue;
    const mon = key[0];
    const prev = bestByMon.get(mon);
    if (prev == null || cmpTuple(key, prev[0]) > 0) bestByMon.set(mon, [key, w]);
  }
  const out = {};
  for (const [mon, pair] of bestByMon.entries()) {
    out[mon] = pair[1];
  }
  return out;
}

function softParkAnchor(windows, parentInfo, claimed) {
  const byMon = softParkAnchorsByMon(windows, parentInfo, claimed);
  const keys = Object.keys(byMon).map((k) => parseInt(k, 10));
  if (keys.length) {
    const bestMon = Math.max(...keys);
    return byMon[bestMon];
  }
  let best = null;
  let bestKey = null;
  for (const w of windows) {
    const key = softParkWindowSortKey(w, parentInfo);
    if (key == null) continue;
    if (bestKey == null || cmpTuple(key, bestKey) > 0) {
      bestKey = key;
      best = w;
    }
  }
  return best;
}

function computeThrashRisk(actions, counts) {
  let monEnsures = 0;
  let structureGroups = 0;
  let parks = 0;
  const reasons = [];
  for (const a of actions) {
    if (!isPlainObject(a)) continue;
    const op = String(a.op || "")
      .trim()
      .toLowerCase();
    if (op === "park") {
      parks += 1;
      if (a.destWindowId == null) reasons.push("hard-park-mon-root");
      else reasons.push("soft-park→" + a.destWindowId);
    } else if (op === "move") {
      reasons.push("move:" + (a.role || a.windowId));
    } else if (op === "ensure_layout") {
      const slot = String(a.slot || "");
      const head = slot ? slot.split(".")[0] : "";
      if (head && !slot.includes(".")) {
        monEnsures += 1;
        reasons.push("mon-ensure:" + slot);
      } else {
        structureGroups += 1;
        reasons.push("structure:" + slot);
      }
    } else if (op === "ensure_skeleton") {
      structureGroups += 1;
      reasons.push("skeleton");
    } else if (op === "bind") {
      reasons.push("bind:" + (a.role || a.windowId));
    } else if (op === "ensure_order") {
      reasons.push("order:" + a.slot);
    } else if (op === "ensure_sizes") {
      reasons.push("size:" + a.slot);
    } else if (op === "open") {
      reasons.push("open:" + a.role);
    }
  }
  let crossMon = (counts.moved || 0) | 0;
  if (parks && reasons.some((r) => r.startsWith("hard-park"))) {
    crossMon += parks;
  }
  const ordered = (counts.ordered || 0) | 0;
  const score =
    3 * crossMon +
    2 * monEnsures +
    2 * structureGroups +
    parks +
    ordered +
    ((counts.closed || 0) | 0);
  const seen = new Set();
  const uniq = [];
  for (const r of reasons) {
    if (!seen.has(r)) {
      seen.add(r);
      uniq.push(r);
    }
  }
  return {
    score,
    crossMonMoves: crossMon,
    monEnsures,
    structureGroups,
    parks,
    reasons: uniq,
  };
}

function splitRect(parent, n, split) {
  if (n <= 0) return [];
  if (n === 1) return [{ ...parent }];
  const splitL = String(split || "hsplit")
    .trim()
    .toLowerCase();
  const out = [];
  if (splitL === "vsplit" || splitL === "v" || splitL === "vertical") {
    const h = parent.height / n;
    for (let i = 0; i < n; i++) {
      out.push({
        x: parent.x,
        y: parent.y + i * h,
        width: parent.width,
        height: h,
      });
    }
  } else {
    const w = parent.width / n;
    for (let i = 0; i < n; i++) {
      out.push({
        x: parent.x + i * w,
        y: parent.y,
        width: w,
        height: parent.height,
      });
    }
  }
  return out;
}

function rectOverlapArea(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0.0;
  return (ix2 - ix1) * (iy2 - iy1);
}

function buildViewRegions(prof, forest) {
  const views = [];
  let order = 0;

  function walk(nodes, parentRect, prefix, splitMode, monIdx) {
    const rects = splitRect(parentRect, nodes.length, splitMode);
    for (let i = 0; i < nodes.length; i++) {
      const ch = nodes[i];
      if (!isPlainObject(ch) || !ch.id) continue;
      const full = prefix + "." + ch.id;
      const r = i < rects.length ? rects[i] : { ...parentRect };
      const nested = ch.children;
      if (Array.isArray(nested) && nested.length) {
        let nestSplit = String(ch.split || ch.layout || "hsplit")
          .trim()
          .toLowerCase();
        if (nestSplit === "tabbed" || nestSplit === "stacked") {
          views.push({
            slot: full,
            mon_idx: monIdx,
            rect: r,
            order,
          });
          order += 1;
        } else {
          walk(nested, r, full, nestSplit, monIdx);
        }
      } else {
        views.push({
          slot: full,
          mon_idx: monIdx,
          rect: r,
          order,
        });
        order += 1;
      }
    }
  }

  for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
    if (!isPlainObject(monBody)) continue;
    const monIdx = monIndexFromSlot(monKey);
    if (monIdx == null) continue;
    const monNode = monitorForIndex(forest, monIdx);
    let monRect = monNode ? monNodeRect(monNode) : null;
    if (monRect == null) {
      monRect = {
        x: monIdx * 10000.0,
        y: 0.0,
        width: 1000.0,
        height: 1000.0,
      };
    }
    const children = monBody.children || [];
    if (!Array.isArray(children) || !children.length) continue;
    const split = String(monBody.split || "hsplit")
      .trim()
      .toLowerCase();
    walk(children, monRect, monKey, split, monIdx);
  }
  return views;
}

function assignViewByOverlap(winRect, monIdx, views) {
  const sorted = views.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const v of sorted) {
    if ((v.mon_idx | 0) !== (monIdx | 0)) continue;
    const vr = v.rect;
    if (!isPlainObject(vr)) continue;
    if (rectOverlapArea(winRect, vr) > 0) return String(v.slot);
  }
  return null;
}

function buildSlotMembership(roleResults, parentInfo, windows, prof, forest) {
  const byParent = {};
  for (const w of windows) {
    const wid = w.windowId;
    if (wid == null) continue;
    const info = parentInfo[String(wid)];
    if (!info) continue;
    const pt = String(info.parent_type || "").toUpperCase();
    const pp = info.parent_path;
    if (!pp || pt === "MONITOR") continue;
    if (!byParent[String(pp)]) byParent[String(pp)] = [];
    byParent[String(pp)].push(windowKey(w));
  }

  const membership = {};
  const monOwned = {};
  const claimedKeys = new Set();
  for (const r of roleResults) {
    const wid = r.windowId;
    const slot = r.slot;
    if (wid == null || !slot) continue;
    const key = "id:" + wid;
    claimedKeys.add(key);
    if (!membership[String(slot)]) membership[String(slot)] = new Set();
    membership[String(slot)].add(key);
    const info = parentInfo[String(wid)];
    if (!info) continue;
    const loc = monChildLoc(info.path);
    if (loc) {
      const monId = loc[0];
      const idx = loc[1];
      if (!monOwned[monId]) monOwned[monId] = {};
      if (!(idx in monOwned[monId])) monOwned[monId][idx] = String(slot);
    }
    const pt = String(info.parent_type || "").toUpperCase();
    const pp = info.parent_path;
    if (!pp || pt === "MONITOR") continue;
    for (const sib of byParent[String(pp)] || []) {
      membership[String(slot)].add(sib);
    }
  }

  const already = new Set(claimedKeys);
  for (const keys of Object.values(membership)) {
    for (const k of keys) already.add(k);
  }

  for (const w of windows) {
    const key = windowKey(w);
    if (already.has(key)) continue;
    const wid = w.windowId;
    if (wid == null) continue;
    const info = parentInfo[String(wid)];
    if (!info) continue;
    const loc = monChildLoc(info.path);
    if (!loc) continue;
    const monId = loc[0];
    const idx = loc[1];
    const slot = (monOwned[monId] || {})[idx];
    if (!slot) continue;
    if (!membership[slot]) membership[slot] = new Set();
    membership[slot].add(key);
    already.add(key);
  }

  let views = [];
  if (prof != null && forest != null) views = buildViewRegions(prof, forest);
  if (views.length) {
    for (const w of windows) {
      const key = windowKey(w);
      if (already.has(key)) continue;
      const wr = asRect(w.rect);
      if (!wr) continue;
      const mon = windowMonitorIndex(w);
      if (mon == null) continue;
      const slot = assignViewByOverlap(wr, mon, views);
      if (!slot) continue;
      if (!membership[slot]) membership[slot] = new Set();
      membership[slot].add(key);
      already.add(key);
    }
  }

  for (const w of windows) {
    const key = windowKey(w);
    if (already.has(key)) continue;
    const wid = w.windowId;
    if (wid == null) continue;
    const info = parentInfo[String(wid)];
    if (!info) continue;
    if (String(info.parent_type || "").toUpperCase() !== "MONITOR") continue;
    const loc = monChildLoc(info.path);
    if (!loc) continue;
    const monId = loc[0];
    const i = loc[1];
    const owned = monOwned[monId] || {};
    const prior = Object.keys(owned)
      .map((j) => parseInt(j, 10))
      .filter((j) => j <= i);
    if (!prior.length) continue;
    const slot = owned[Math.max(...prior)];
    if (!membership[slot]) membership[slot] = new Set();
    membership[slot].add(key);
    already.add(key);
  }
  return membership;
}

function orderedSlotWindowIds(roleResults, slot, kept, roleOrder) {
  void roleOrder;
  const roles = roleWindowIdsForSlot(roleResults, slot);
  const companions = [];
  const seen = new Set(roles.map((x) => String(x)));
  for (const k of kept) {
    if (String(k.slot || "") !== slot) continue;
    const wid = k.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    if (seen.has(String(wid))) continue;
    seen.add(String(wid));
    companions.push(wid);
  }
  return roles.concat(companions);
}

function siblingOrderIds(windowIds, parentInfo) {
  return windowIds.slice().sort((a, b) => {
    const infoA = parentInfo[String(a)] || {};
    const infoB = parentInfo[String(b)] || {};
    const pathA = String(infoA.path || "");
    const pathB = String(infoB.path || "");
    let idxA = 999;
    let idxB = 999;
    try {
      idxA = parseInt(pathA.split("/").pop(), 10);
      if (!Number.isFinite(idxA)) idxA = 999;
    } catch (_e) {
      idxA = 999;
    }
    try {
      idxB = parseInt(pathB.split("/").pop(), 10);
      if (!Number.isFinite(idxB)) idxB = 999;
    } catch (_e2) {
      idxB = 999;
    }
    if (idxA !== idxB) return idxA - idxB;
    const sa = String(a);
    const sb = String(b);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  });
}

function siblingOrderMatches(windowIds, parentInfo) {
  if (windowIds.length < 2) return true;
  const live = siblingOrderIds(windowIds, parentInfo);
  return live.map(String).join("\0") === windowIds.map(String).join("\0");
}

function roleWindowIdsForMon(roleResults, monKey) {
  const out = [];
  for (const r of roleResults) {
    const slot = String(r.slot || "");
    const head = slot ? slot.split(".")[0] : "";
    if (monKey === "primary") {
      if (head !== "primary" && head !== "mon0") continue;
    } else if (head !== monKey) {
      continue;
    }
    const wid = r.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    out.push(wid);
  }
  return out;
}

function isMonDirectPath(path) {
  if (path == null) return false;
  const parts = String(path).trim().split("/");
  if (parts.length !== 2 || !parts[0]) return false;
  const idx = Number.parseInt(parts[1], 10);
  return Number.isFinite(idx);
}

function monLayoutChildId(slot) {
  const s = String(slot || "").trim();
  if (!s || !s.includes(".")) return null;
  const parts = s.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  return parts[1];
}

function parentPathForWid(wid, parentInfo) {
  const info = wid != null ? parentInfo[String(wid)] : null;
  if (!info) return null;
  const pp = info.parent_path;
  if (pp == null || String(pp).trim() === "") return null;
  return String(pp);
}

function isConParent(wid, parentInfo) {
  const info = wid != null ? parentInfo[String(wid)] : null;
  if (!info) return false;
  const ptype = String(info.parent_type || "").toUpperCase();
  if (ptype === "MONITOR") return false;
  const path = String(info.path || "");
  if (ptype === "CON") return true;
  return path.split("/").length >= 3;
}

function slotParentHasForeignMonChild(slot, windowIds, roleResults, parentInfo) {
  const monChild = monLayoutChildId(slot);
  const monKey = slot ? String(slot).split(".")[0] : "";
  if (!monChild || !monKey) return false;
  const ownParents = new Set();
  for (const wid of windowIds) {
    if (!isConParent(wid, parentInfo)) continue;
    const pp = parentPathForWid(wid, parentInfo);
    if (pp != null) ownParents.add(pp);
  }
  if (!ownParents.size) return false;
  for (const r of roleResults) {
    if (r.windowId == null) continue;
    if (!isConParent(r.windowId, parentInfo)) continue;
    const rslot = String(r.slot || "");
    const rhead = rslot ? rslot.split(".")[0] : "";
    if (rhead !== monKey) continue;
    const rchild = monLayoutChildId(rslot);
    if (rchild == null || rchild === monChild) continue;
    const pp = parentPathForWid(r.windowId, parentInfo);
    if (pp != null && ownParents.has(pp)) return true;
  }
  return false;
}

function monChildTopologyMismatches(roleResults, parentInfo, prof) {
  const mismatches = [];
  const monKeys = Object.keys(prof.layout || {}).sort();
  for (const monKey of monKeys) {
    const monBody = (prof.layout || {})[monKey];
    if (!isPlainObject(monBody)) continue;
    const children = monBody.children || [];
    if (!Array.isArray(children) || children.length < 2) continue;
    const byChild = {};
    for (const r of roleResults) {
      if (r.windowId == null) continue;
      const slot = String(r.slot || "");
      const head = slot ? slot.split(".")[0] : "";
      if (head !== monKey) continue;
      const childId = monLayoutChildId(slot);
      if (!childId) continue;
      if (!byChild[childId]) byChild[childId] = [];
      byChild[childId].push(r);
    }
    if (Object.keys(byChild).length < 2) continue;
    const pathToChildren = {};
    const monDirectToChildren = {};
    for (const [childId, roles] of Object.entries(byChild)) {
      for (const r of roles) {
        const wid = r.windowId;
        const info = wid != null ? parentInfo[String(wid)] : null;
        const path = (info && info.path) || r.path;
        const loc = monChildLoc(path);
        if (loc != null) {
          const monDirectKey = loc[0] + "/" + loc[1];
          if (!monDirectToChildren[monDirectKey]) monDirectToChildren[monDirectKey] = new Set();
          monDirectToChildren[monDirectKey].add(childId);
        }
        if (!isConParent(wid, parentInfo)) continue;
        const pp = parentPathForWid(wid, parentInfo);
        if (pp == null) continue;
        if (!pathToChildren[pp]) pathToChildren[pp] = new Set();
        pathToChildren[pp].add(childId);
      }
    }
    const polluted = {};
    for (const [pp, kids] of Object.entries(pathToChildren)) {
      if (kids.size >= 2) polluted[pp] = [...kids].sort();
    }
    const collapsed = {};
    for (const [k, kids] of Object.entries(monDirectToChildren)) {
      if (kids.size >= 2) collapsed[k] = [...kids].sort();
    }
    if (!Object.keys(polluted).length && !Object.keys(collapsed).length) continue;
    const wantIds = children
      .filter((c) => isPlainObject(c) && c.id != null)
      .map((c) => String(c.id));
    const got = Object.keys(polluted).length ? polluted : collapsed;
    const detailKind = Object.keys(polluted).length
      ? "share parent CON path(s)"
      : "share mon-direct index (nested mon collapse)";
    mismatches.push({
      kind: "mon-child",
      slot: monKey,
      want: wantIds,
      got,
      detail: monKey + " mon-child roles " + detailKind + ": " + Object.keys(got).sort().join(", "),
    });
  }
  return mismatches;
}

function peelDemoteAnchor(monKey, roleResults, parentInfo, prof, mismatch) {
  void prof;
  let pollutedPaths = new Set();
  const got = mismatch.got;
  if (isPlainObject(got)) pollutedPaths = new Set(Object.keys(got).map(String));
  for (const r of roleResults) {
    const wid = r.windowId;
    if (wid == null || String(wid).trim() === "") continue;
    const slot = String(r.slot || "");
    const head = slot ? slot.split(".")[0] : "";
    if (head !== monKey) continue;
    const info = parentInfo[String(wid)] || {};
    const pp = info.parent_path;
    const parentLay = String(info.parent_layout || "").toUpperCase();
    const parentType = String(info.parent_type || "").toUpperCase();
    if (parentType === "MONITOR") continue;
    if (parentLay !== "TABBED" && parentLay !== "STACKED") continue;
    if (pollutedPaths.size && !pollutedPaths.has(String(pp))) continue;
    return wid;
  }
  return null;
}

function forestMonLayouts(forest) {
  const out = {};
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    const idx = monitorNodeIndex(m);
    if (idx == null) continue;
    const key = "mon" + idx;
    if (key in out) continue;
    const lay = m.layout;
    if (lay == null) continue;
    out[key] = String(lay).trim().toUpperCase();
  }
  return out;
}

function monsWithSplitMismatch(forest, prof, roleResults) {
  const live = forestMonLayouts(forest);
  const out = new Set();
  for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
    if (!isPlainObject(monBody)) continue;
    const split = String(monBody.split || "")
      .trim()
      .toLowerCase();
    if (split !== "hsplit" && split !== "vsplit") continue;
    if (!roleWindowIdsForMon(roleResults, monKey).length) continue;
    const liveLay = live[monKey];
    if (!liveLay) continue;
    const want = split.toUpperCase();
    if (liveLay !== want) out.add(monKey);
  }
  return out;
}

function monSplitAnchorIds(roleResults, monKey, prof) {
  const byId = {};
  for (const r of roleResults) {
    if (r.id != null) byId[String(r.id)] = r;
  }
  const monBody = (prof.layout || {})[monKey];
  const out = [];

  function firstRoleIds(node) {
    if (node.roles) return node.roles.map((x) => String(x));
    for (const sub of node.children || []) {
      if (isPlainObject(sub)) {
        const found = firstRoleIds(sub);
        if (found.length) return found;
      }
    }
    return [];
  }

  if (isPlainObject(monBody)) {
    for (const ch of monBody.children || []) {
      if (!isPlainObject(ch)) continue;
      const lay = String(ch.layout || "")
        .trim()
        .toLowerCase();
      if (lay === "tabbed" || lay === "stacked") continue;
      const split = String(ch.split || "")
        .trim()
        .toLowerCase();
      if ((split === "hsplit" || split === "vsplit") && ch.children) continue;
      for (const rid of firstRoleIds(ch)) {
        const r = byId[rid];
        if (!r) continue;
        const wid = r.windowId;
        if (wid == null || String(wid).trim() === "") continue;
        if (!isMonDirectPath(r.path)) continue;
        out.push(wid);
        break;
      }
    }
  }
  return out;
}

function slotMonChildIndex(prof, slot) {
  if (!slot || !String(slot).includes(".")) return null;
  const parts = slot.split(".");
  const monKey = parts[0];
  const rest = parts.slice(1).join(".");
  const childId = rest.split(".")[0];
  const monBody = (prof.layout || {})[monKey];
  if (!isPlainObject(monBody)) return null;
  const children = monBody.children || [];
  if (!Array.isArray(children)) return null;
  for (let i = 0; i < children.length; i++) {
    const ch = children[i];
    if (isPlainObject(ch) && ch.id === childId) return i;
  }
  return null;
}

function windowParentIndex(forest) {
  const out = {};

  function walk(n, path, parentPath, parentLayout, parentType) {
    if (!isPlainObject(n)) return;
    const ntype = n.nodeType || n.type;
    if (ntype === "WINDOW") {
      const wid = n.windowId;
      if (wid != null) {
        out[String(wid)] = {
          path,
          parent_path: parentPath,
          parent_layout: parentLayout,
          parent_type: parentType,
        };
      }
      return;
    }
    const kids = n.children || n.childNodes || [];
    if (!Array.isArray(kids)) return;
    const monId = ntype === "MONITOR" ? n.id : null;
    const lay = n.layout;
    for (let i = 0; i < kids.length; i++) {
      let childPath;
      if (monId) childPath = monId + "/" + i;
      else if (path) childPath = path + "/" + i;
      else childPath = String(i);
      walk(kids[i], childPath, path ? path : monId, lay, ntype);
    }
  }

  if (isPlainObject(forest)) {
    const mons = forest.monitors;
    if (Array.isArray(mons)) {
      for (const m of orderMonitors(mons)) {
        walk(m, isPlainObject(m) ? String(m.id || "") : "", null, null, null);
      }
    } else {
      walk(forest, "", null, null, null);
    }
  } else if (Array.isArray(forest)) {
    for (const m of orderMonitors(forest)) {
      walk(m, isPlainObject(m) ? String(m.id || "") : "", null, null, null);
    }
  }
  return out;
}

function windowsShareGroup(windowIds, parentInfo, mode) {
  if (windowIds.length < 2) return true;
  const modeL = String(mode || "")
    .trim()
    .toLowerCase();
  const wantMap = {
    tabbed: "TABBED",
    stacked: "STACKED",
    hsplit: "HSPLIT",
    vsplit: "VSPLIT",
  };
  const want = wantMap[modeL];
  const infos = [];
  for (const wid of windowIds) {
    const info = parentInfo[String(wid)];
    if (!info) return false;
    infos.push(info);
  }
  const parents = new Set(infos.map((i) => i.parent_path));
  if (parents.size !== 1 || parents.has(null) || parents.has("")) return false;
  if (infos.some((i) => String(i.parent_type || "").toUpperCase() === "MONITOR")) return false;
  if (want) {
    const got = String(infos[0].parent_layout || "").toUpperCase();
    if (got !== want) return false;
  }
  return true;
}

function claimRolesForDetect(prof, windows) {
  const roles = (prof.roles || []).slice();
  const picks = twoPassClaimWindows(roles, windows);
  const results = [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const chosen = picks[i];
    const rid = role.id;
    const slot = String(role.slot || "");
    const entry = { id: rid, slot };
    if (chosen == null) {
      entry.status = "open";
    } else {
      entry.windowId = chosen.windowId;
      entry.path = chosen.path;
      entry.monitor = windowMonitorIndex(chosen);
      entry.status = "claimed";
    }
    results.push(entry);
  }
  return results;
}

function monitorForIndex(forest, monIdx) {
  for (const m of iterForestMonitors(forest)) {
    if (!isPlainObject(m)) continue;
    if (monitorNodeIndex(m) === monIdx) return m;
  }
  return null;
}

function nodeHasNestedHvSplit(node) {
  const ntype = String(node.nodeType || node.type || "").toUpperCase();
  if (ntype === "WINDOW") return false;
  const layout = String(node.layout || "").toUpperCase();
  const kids = node.children || node.childNodes || [];
  if (!Array.isArray(kids) || (layout !== "HSPLIT" && layout !== "VSPLIT")) return false;
  for (const c of kids) {
    if (!isPlainObject(c)) continue;
    const ct = String(c.nodeType || c.type || "").toUpperCase();
    if (ct === "WINDOW") continue;
    const cl = String(c.layout || "").toUpperCase();
    if (cl === "HSPLIT" || cl === "VSPLIT") return true;
    if (nodeHasNestedHvSplit(c)) return true;
  }
  return false;
}

function detectThrash(forest, profile) {
  if (!isPlainObject(forest)) throw new Error("forest must be a JSON object");
  const kwargs = forestProfileMonKwargs(forest);
  let prof = validateReconcileProfile(profile, kwargs);
  prof = resolveProfileMonKeys(prof, forest);

  const windows = collectWindows(forest);
  const parentInfo = windowParentIndex(forest);
  const layoutSlotModes = slotLayoutModes(prof);
  const roleResults = claimRolesForDetect(prof, windows);

  let score = 0;
  const reasons = [];

  let wrongMon = 0;
  for (const r of roleResults) {
    if (r.windowId == null) continue;
    const desired = monIndexFromSlot(String(r.slot || ""));
    const winMon = r.monitor;
    if (desired != null && winMon != null && (winMon | 0) !== (desired | 0)) {
      wrongMon += 1;
    }
  }
  if (wrongMon >= THRASH_WRONG_MON_K) {
    score += 2 * wrongMon;
    reasons.push("roles-wrong-mon:" + wrongMon);
  }

  const slotModes = Object.keys(layoutSlotModes).sort();
  for (const slot of slotModes) {
    const mode = layoutSlotModes[slot];
    if (mode !== "tabbed" && mode !== "stacked") continue;
    if (String(slot).endsWith(".overflow")) continue;
    const wids = roleWindowIdsForSlot(roleResults, slot);
    if (wids.length < 2) continue;
    if (!windowsShareGroup(wids, parentInfo, mode)) {
      score += 3;
      reasons.push(mode + "-roles-not-grouped:" + slot);
    }
  }

  const monKeys = Object.keys(prof.layout || {}).sort();
  for (const monKey of monKeys) {
    const monBody = (prof.layout || {})[monKey];
    if (!isPlainObject(monBody)) continue;
    const monIdx = monIndexFromSlot(monKey);
    if (monIdx == null) continue;
    const monNode = monitorForIndex(forest, monIdx);
    if (monNode == null) continue;
    let liveKids = monNode.children || [];
    if (!Array.isArray(liveKids)) liveKids = [];
    let expected = monBody.children || [];
    if (!Array.isArray(expected)) expected = [];
    const nExp = expected.length;
    const nLive = liveKids.length;
    if (nExp > 0 && nLive > Math.max(nExp + 1, nExp * 2)) {
      score += 3;
      reasons.push("mon-children-excess:mon" + monIdx + ":" + nLive + ">" + nExp);
    }
    for (const view of expected) {
      if (!isPlainObject(view) || !view.id) continue;
      const viewId = String(view.id);
      const slot = monKey + "." + viewId;
      const viewRoles = view.roles || [];
      const mode = layoutSlotModes[slot];
      if ((mode !== "tabbed" && mode !== "stacked") || viewRoles.length < 2) continue;
      const wids = roleResults
        .filter(
          (r) =>
            r.windowId != null &&
            (String(r.slot || "") === slot || String(r.slot || "").startsWith(slot + "."))
        )
        .map((r) => r.windowId);
      if (!wids.length) continue;
      const info = parentInfo[String(wids[0])] || {};
      const loc = monChildLoc(info.path);
      if (!loc) continue;
      const childI = loc[1];
      if (childI < 0 || childI >= nLive) continue;
      const childNode = liveKids[childI];
      if (!isPlainObject(childNode)) continue;
      if (nodeHasNestedHvSplit(childNode)) {
        score += 4;
        reasons.push("nested-split-view:" + slot);
      }
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const r of reasons) {
    if (!seen.has(r)) {
      seen.add(r);
      uniq.push(r);
    }
  }
  const thrashed = uniq.length > 0 || score >= THRASH_SCORE_THRESHOLD;
  return { thrashed, score, reasons: uniq };
}

function compareLayoutStructure(forest, profile, opts) {
  opts = opts || {};
  if (!isPlainObject(forest)) throw new Error("forest must be a JSON object");
  let prof;
  if (opts.alreadyValidated && isPlainObject(profile) && "roles" in profile) {
    prof = profile;
  } else {
    const kwargs = forestProfileMonKwargs(forest);
    prof = validateReconcileProfile(profile, kwargs);
    prof = resolveProfileMonKeys(prof, forest);
  }

  const windows = collectWindows(forest);
  const pinfo = opts.parentInfo != null ? opts.parentInfo : windowParentIndex(forest);
  const layoutSlotModes = slotLayoutModes(prof);

  let roleResults = opts.roleResults;
  if (roleResults == null) {
    const roleWindows = twoPassClaimWindows(prof.roles, windows);
    const roles = [];
    for (let i = 0; i < prof.roles.length; i++) {
      const role = prof.roles[i];
      const chosen = roleWindows[i];
      const entry = { id: role.id, slot: role.slot };
      if (chosen == null) {
        entry.status = "open";
      } else {
        entry.windowId = chosen.windowId;
        entry.path = chosen.path;
        entry.monitor = windowMonitorIndex(chosen);
        entry.status = "claimed";
      }
      roles.push(entry);
    }
    roleResults = roles;
  }

  const mismatches = [];

  for (const r of roleResults) {
    if (r.windowId == null) continue;
    const slot = String(r.slot || "");
    const desired = monIndexFromSlot(slot);
    let winMon = r.monitor;
    if (winMon == null) {
      const info = pinfo[String(r.windowId)];
      const path = String((info && info.path) || r.path || "");
      if (path.startsWith("mo") && path.includes("ws")) {
        try {
          winMon = parseInt(path.slice(2, path.indexOf("ws")), 10);
          if (!Number.isFinite(winMon)) winMon = null;
        } catch (_e) {
          winMon = null;
        }
      }
    }
    if (desired != null && winMon != null && (winMon | 0) !== (desired | 0)) {
      mismatches.push({
        kind: "role-mon",
        slot,
        want: desired,
        got: winMon | 0,
        detail: "role " + r.id + " on mon" + winMon + ", want mon" + desired,
      });
    }
  }

  const splitMismatch = [...monsWithSplitMismatch(forest, prof, roleResults)].sort();
  for (const monKey of splitMismatch) {
    const monBody = (prof.layout || {})[monKey] || {};
    const want = String((monBody && monBody.split) || "")
      .trim()
      .toUpperCase();
    const live = forestMonLayouts(forest)[monKey];
    mismatches.push({
      kind: "mon-layout",
      slot: monKey,
      want,
      got: live,
      detail:
        monKey + " live layout " + JSON.stringify(live) + " != profile " + JSON.stringify(want),
    });
  }

  const slotsSorted = Object.keys(layoutSlotModes).sort();
  for (const slot of slotsSorted) {
    const mode = layoutSlotModes[slot];
    const modeL = String(mode || "")
      .trim()
      .toLowerCase();
    if (modeL !== "tabbed" && modeL !== "stacked" && modeL !== "hsplit" && modeL !== "vsplit")
      continue;
    if (String(slot).endsWith(".overflow")) continue;
    let wids;
    if (modeL === "hsplit" || modeL === "vsplit") {
      wids = roleWindowIdsForSlotPrefix(roleResults, slot);
    } else {
      wids = roleWindowIdsForSlot(roleResults, slot);
    }
    if (wids.length < 2) continue;
    if (!windowsShareGroup(wids, pinfo, modeL)) {
      mismatches.push({
        kind: "group",
        slot,
        want: modeL,
        got: null,
        detail: modeL + " roles not co-grouped under one CON: " + slot,
      });
      continue;
    }
    if (
      (modeL === "tabbed" || modeL === "stacked") &&
      slotParentHasForeignMonChild(slot, wids, roleResults, pinfo)
    ) {
      mismatches.push({
        kind: "group",
        slot,
        want: modeL,
        got: "polluted",
        detail: modeL + " group for " + slot + " shares parent with foreign mon-child role(s)",
      });
    }
  }

  mismatches.push(...monChildTopologyMismatches(roleResults, pinfo, prof));

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}

/**
 * planReconcile(profile, forestJson, flags) → plan
 * Mirrors Python plan_reconcile(forest, profile, **flags).
 * Accepts flags with camelCase or snake_case keys.
 */
export function planReconcile(profile, forestJson, flags) {
  flags = flags || {};
  const forestIn = forestJson;
  if (!isPlainObject(forestIn)) throw new Error("forest must be a JSON object");

  // Fixtures / callers pass clean explicitly (product CLI default is true).
  let clean = !!(flags.clean ?? false);
  let keepOthers = !!(flags.keepOthers ?? flags.keep_others ?? false);
  let safe = !!(flags.safe ?? false);
  const rolePinsIn = flags.rolePins ?? flags.role_pins ?? null;
  const justOpenedIn = flags.justOpenedRoles ?? flags.just_opened_roles ?? null;
  let workspace = flags.workspace != null ? flags.workspace : 0;

  workspace = normalizeWorkspace(workspace);
  let forest = filterForestWorkspace(forestIn, workspace);
  const kwargs = forestProfileMonKwargs(forest);
  let prof = validateReconcileProfile(profile, kwargs);
  prof = resolveProfileMonKeys(prof, forest);

  if (keepOthers) clean = false;
  const pins = normalizeRolePins(rolePinsIn);
  const openedRoles = new Set();
  for (const x of justOpenedIn || []) {
    if (x != null && String(x).trim()) openedRoles.add(String(x).trim());
  }

  const thrashState = detectThrash(forest, prof);
  const thrashed = !!thrashState.thrashed;

  const windows = collectWindows(forest);
  const layoutPlaceholders = collectLayoutPlaceholders(forest);
  const claimed = new Set();
  const roleResults = [];
  const actions = [];

  const counts = {
    reused: 0,
    opened: 0,
    moved: 0,
    parked: 0,
    kept: 0,
    left: 0,
    closed: 0,
    structure: 0,
    ordered: 0,
    sized: 0,
    focused: 0,
    skeleton: 0,
    bound: 0,
  };
  const slotsNeedingLayout = {};
  const monsWithPlacement = new Set();

  const layoutSlotModes = slotLayoutModes(prof);
  const overflowSlot = prof.overflow.slot;
  const parentInfo = windowParentIndex(forest);
  const marginal = prof.marginal || {};
  const marginalMode = String(marginal.mode || "coexist")
    .trim()
    .toLowerCase();
  const roleOrder = String(marginal.roleOrder || "first")
    .trim()
    .toLowerCase();
  let residualMode = String(marginal.residual || "leave")
    .trim()
    .toLowerCase();
  if (residualMode !== "leave" && residualMode !== "park") residualMode = "leave";

  let roleWindows = twoPassClaimWindows(prof.roles, windows);
  roleWindows = applyRolePins(prof.roles, windows, roleWindows, pins);
  roleWindows = claimClassOnlyWindows(prof.roles, windows, roleWindows);

  for (let i = 0; i < prof.roles.length; i++) {
    const role = prof.roles[i];
    const chosen = roleWindows[i];
    const rid = role.id;
    const slot = role.slot;
    const desiredMon = monIndexFromSlot(slot);
    const entry = { id: rid, slot };
    if (chosen == null) {
      entry.status = "open";
      counts.opened += 1;
      const openAct = {
        op: "open",
        role: rid,
        open: { ...role.open },
        slot,
        workspace,
      };
      const roleMatch = role.match;
      if (isPlainObject(roleMatch)) {
        const pinMatch = {};
        if (roleMatch["title~="] != null) pinMatch["title~="] = roleMatch["title~="];
        if (roleMatch.title != null) pinMatch.title = roleMatch.title;
        if (Object.keys(pinMatch).length) openAct.match = pinMatch;
      }
      if (!safe) {
        const joinWid = nestedSplitJoinDest(prof.roles, roleWindows, slot, layoutSlotModes, rid);
        if (joinWid != null) openAct.destWindowId = joinWid;
      }
      actions.push(openAct);
      const monHead = slotMonKey(slot);
      if (monHead) monsWithPlacement.add(monHead);
      if (!safe) {
        markLayoutSlotsForRole(slot, layoutSlotModes, slotsNeedingLayout);
      }
    } else {
      claimed.add(windowKey(chosen));
      entry.windowId = chosen.windowId;
      entry.path = chosen.path;
      entry.title = chosen.title;
      entry.wmClass = chosen.wmClass || chosen.wm_class;
      const winMon = windowMonitorIndex(chosen);
      if (winMon != null && desiredMon != null && winMon === desiredMon) {
        entry.status = "reused";
        counts.reused += 1;
      } else if (desiredMon == null) {
        entry.status = "reused";
        counts.reused += 1;
      } else {
        entry.status = "move";
        counts.moved += 1;
        const monHead = slotMonKey(slot);
        if (monHead) monsWithPlacement.add(monHead);
        const moveAct = {
          op: "move",
          role: rid,
          windowId: chosen.windowId,
          path: chosen.path,
          slot,
          workspace,
        };
        const childI = slotMonChildIndex(prof, slot);
        if (childI != null) {
          moveAct.childIndex = childI;
          if (childI === 0) moveAct.position = "start";
        }
        const joinWid = nestedSplitJoinDest(prof.roles, roleWindows, slot, layoutSlotModes, rid);
        if (joinWid != null) moveAct.destWindowId = joinWid;
        actions.push(moveAct);
        if (!safe) {
          markLayoutSlotsForRole(slot, layoutSlotModes, slotsNeedingLayout);
        }
      }
    }
    roleResults.push(entry);
  }

  const coldEmpty =
    !safe && roleResults.length > 0 && roleResults.every((r) => String(r.status || "") === "open");
  const suppressThrashPark = coldEmpty || openedRoles.size > 0;
  const forceParkResiduals =
    (keepOthers || (thrashed && !clean && !safe && !suppressThrashPark)) && !safe;
  const hasLayoutPh = layoutPlaceholders.length > 0;

  claimFloatingWindows(prof.floating || [], windows, claimed);

  const slotMembers =
    marginalMode !== "strict" && !thrashed && !safe
      ? buildSlotMembership(roleResults, parentInfo, windows, prof, forest)
      : {};
  const keyToSlot = {};
  for (const [slot, keys] of Object.entries(slotMembers)) {
    for (const k of keys) {
      if (!(k in keyToSlot)) keyToSlot[k] = slot;
    }
  }

  const wantPark = (residualMode === "park" || forceParkResiduals) && !clean && !safe;
  const anchorsByMon = wantPark ? softParkAnchorsByMon(windows, parentInfo, claimed) : {};
  const globalParkAnchor = wantPark ? softParkAnchor(windows, parentInfo, claimed) : null;
  const parkJoinByMon = {};

  const kept = [];
  const left = [];
  const unclaimed = [];
  const residualActions = [];

  for (const w of windows) {
    if (claimed.has(windowKey(w))) continue;
    const summary = windowSummary(w);
    const key = windowKey(w);
    const keepSlot = keyToSlot[key];
    if (coldEmpty && !safe) {
      const entry = { ...summary, status: "left" };
      left.push(entry);
      unclaimed.push(entry);
      counts.left += 1;
      continue;
    }
    if (keepSlot != null && !clean && !wantPark && !safe) {
      const entry = { ...summary, status: "kept", slot: keepSlot };
      kept.push(entry);
      unclaimed.push(entry);
      counts.kept += 1;
    } else if (clean && !safe) {
      const entry = { ...summary, status: "closed" };
      unclaimed.push(entry);
      counts.closed += 1;
      residualActions.push({
        op: "close",
        windowId: w.windowId,
        path: w.path,
      });
    } else if (safe || (residualMode === "leave" && !forceParkResiduals)) {
      const entry = { ...summary, status: "left" };
      left.push(entry);
      unclaimed.push(entry);
      counts.left += 1;
    } else {
      const entry = { ...summary, status: "parked" };
      unclaimed.push(entry);
      counts.parked += 1;
      const parkAct = {
        op: "park",
        windowId: w.windowId,
        path: w.path,
        slot: overflowSlot,
        workspace,
      };
      let monI = windowMonitorIndex(w);
      let anchor = null;
      if (monI != null) anchor = anchorsByMon[monI | 0];
      if (anchor == null) anchor = globalParkAnchor;
      if (anchor != null) {
        const awid = anchor.windowId;
        if (awid != null && String(awid) !== String(w.windowId)) {
          parkAct.destWindowId = awid;
          let monA = windowMonitorIndex(anchor);
          if (monA == null) monA = monI;
          if (monA != null) {
            parkAct.slot = "mon" + monA + ".overflow";
            if (!parkJoinByMon[monA | 0]) {
              parkJoinByMon[monA | 0] = { anchor: awid, parked: [] };
            }
            const join = parkJoinByMon[monA | 0];
            if (join.anchor == null) join.anchor = awid;
            const rwid = w.windowId;
            if (rwid != null && String(rwid).trim() !== "") {
              join.parked.push(rwid);
            }
          }
        }
      }
      residualActions.push(parkAct);
    }
  }

  const structureSlots = {};
  const slotOrderActions = [];
  // Cold empty: skeleton owns topology (no window-anchored ensure_layout).
  // Layout PHs: bind still consumes slots first (bind phase before order), but
  // do **not** skip ensure_layout — residual open often leaves multi-role tab
  // slots as mon siblings when map/PlaceNext missed the PH CON (host mon1.s0).
  // Order-phase ensure_layout repairs ungrouped roles after bind.
  const skipWindowStructure = coldEmpty;
  if (!safe && !skipWindowStructure) {
    const slotsForStructure = new Set(Object.keys(layoutSlotModes));
    for (const k of kept) {
      if (k.slot) slotsForStructure.add(String(k.slot));
    }

    for (const slot of slotsForStructure) {
      let mode = layoutSlotModes[slot];
      if (mode === "hsplit" || mode === "vsplit") {
        const wids = roleWindowIdsForSlotPrefix(roleResults, slot);
        if (wids.length < 2) continue;
        if (windowsShareGroup(wids, parentInfo, mode)) {
          if (!siblingOrderMatches(wids, parentInfo)) {
            slotOrderActions.push({
              op: "ensure_order",
              slot,
              mode,
              windowIds: wids,
            });
          }
          continue;
        }
        structureSlots[slot] = { mode, windowIds: wids };
        slotsNeedingLayout[slot] = mode;
        continue;
      }
      if (mode != null && mode !== "tabbed" && mode !== "stacked") continue;
      if (mode == null) mode = "tabbed";
      const wids = orderedSlotWindowIds(roleResults, slot, kept, roleOrder);
      if (wids.length < 2) continue;
      const share = windowsShareGroup(wids, parentInfo, mode);
      const roleWids = roleWindowIdsForSlot(roleResults, slot);
      if (
        share &&
        slotParentHasForeignMonChild(
          slot,
          roleWids.length ? roleWids : wids,
          roleResults,
          parentInfo
        )
      ) {
        const peelWids = roleWids.length >= 2 ? roleWids : wids;
        structureSlots[slot] = { mode, windowIds: peelWids };
        slotsNeedingLayout[slot] = mode;
        continue;
      }
      if (share) {
        if (roleWids.length >= 2 && !siblingOrderMatches(roleWids, parentInfo)) {
          slotOrderActions.push({
            op: "ensure_order",
            slot,
            mode,
            windowIds: roleWids,
          });
        }
        continue;
      }
      structureSlots[slot] = { mode, windowIds: wids };
      slotsNeedingLayout[slot] = mode;
    }

    if (wantPark && Object.keys(parkJoinByMon).length) {
      let overflowLayout = String((prof.overflow || {}).layout || "tabbed")
        .trim()
        .toLowerCase();
      if (overflowLayout !== "tabbed" && overflowLayout !== "stacked") {
        overflowLayout = "tabbed";
      }
      const monAs = Object.keys(parkJoinByMon)
        .map((k) => parseInt(k, 10))
        .sort((a, b) => a - b);
      for (const monA of monAs) {
        const join = parkJoinByMon[monA];
        const anchorWid = join.anchor;
        const parkedWids = join.parked || [];
        if (anchorWid == null || !parkedWids.length) continue;
        const widsJ = [anchorWid];
        const seenW = new Set([String(anchorWid)]);
        for (const pwid of parkedWids) {
          if (seenW.has(String(pwid))) continue;
          seenW.add(String(pwid));
          widsJ.push(pwid);
        }
        if (widsJ.length < 2) continue;
        const slotJ = "mon" + monA + ".overflow";
        if (!(slotJ in structureSlots)) {
          structureSlots[slotJ] = {
            mode: overflowLayout,
            windowIds: widsJ,
          };
          slotsNeedingLayout[slotJ] = overflowLayout;
        }
      }
    }
  }

  counts.structure = Object.keys(structureSlots).length;

  let orderActions = [];
  if (!safe) {
    orderActions = monOrderActions(roleResults, parentInfo, prof);
    orderActions = orderActions.concat(slotOrderActions);
  }
  counts.ordered = orderActions.length;

  let sizeActs = [];
  if (!safe) sizeActs = sizeActions(roleResults, prof);
  counts.sized = sizeActs.length;

  if (openedRoles.size && !safe) {
    for (const entry of roleResults) {
      const rid = entry.id;
      if (rid == null || !openedRoles.has(String(rid))) continue;
      if (entry.windowId == null) continue;
      const monHead = slotMonKey(entry.slot);
      if (monHead) monsWithPlacement.add(monHead);
      if (entry.status === "reused") {
        markLayoutSlotsForRole(String(entry.slot || ""), layoutSlotModes, slotsNeedingLayout);
      }
    }
  }

  let monsSplitMismatch = new Set();
  if (!safe) {
    monsSplitMismatch = monsWithSplitMismatch(forest, prof, roleResults);
    for (const monKey of monsSplitMismatch) monsWithPlacement.add(monKey);
  }

  const structureCmp = compareLayoutStructure(forest, prof, {
    roleResults,
    parentInfo,
    alreadyValidated: true,
  });

  const peelDemoteActions = [];
  const monChildPeelMons = new Set();
  if (!safe && !skipWindowStructure) {
    for (const mm of structureCmp.mismatches || []) {
      if (!isPlainObject(mm) || mm.kind !== "mon-child") continue;
      const monKey = String(mm.slot || "");
      if (!monKey) continue;
      monChildPeelMons.add(monKey);
      const monBody = (prof.layout || {})[monKey] || {};
      let split = String((monBody && monBody.split) || "hsplit")
        .trim()
        .toLowerCase();
      if (split !== "hsplit" && split !== "vsplit") split = "hsplit";
      const anchor = peelDemoteAnchor(monKey, roleResults, parentInfo, prof, mm);
      if (anchor == null) continue;
      peelDemoteActions.push({
        op: "ensure_layout",
        slot: monKey,
        mode: split,
        windowIds: [anchor],
      });
      monsWithPlacement.add(monKey);
      for (const [slot, mode] of Object.entries(layoutSlotModes)) {
        if (!String(slot).startsWith(monKey + ".")) continue;
        const modeL = String(mode || "")
          .trim()
          .toLowerCase();
        if (modeL !== "tabbed" && modeL !== "stacked") continue;
        const roleWids = roleWindowIdsForSlot(roleResults, slot);
        if (roleWids.length < 2) continue;
        if (!(slot in structureSlots)) {
          structureSlots[slot] = { mode: modeL, windowIds: roleWids };
          slotsNeedingLayout[slot] = modeL;
        }
      }
    }
    counts.structure = Object.keys(structureSlots).length;
  }

  const hasRolePlacement = counts.opened > 0 || counts.moved > 0;
  // Mon-level split ensure: skeleton already set mon H/V while layout PHs live.
  // Still allow mon ensure after PHs are gone (mid-session / thrash).
  const hasMonEnsure =
    !skipWindowStructure &&
    !hasLayoutPh &&
    (hasRolePlacement ||
      (openedRoles.size > 0 && !safe) ||
      monsSplitMismatch.size > 0 ||
      monChildPeelMons.size > 0);

  const skeletonActions = [];
  if (coldEmpty && !safe) {
    const sk = buildEnsureSkeletonAction(prof, { workspace });
    if (sk != null) {
      skeletonActions.push(sk);
      counts.skeleton = 1;
    }
  }

  let bindActions = [];
  if (!safe && hasLayoutPh && !coldEmpty) {
    bindActions = buildBindActions(roleResults, layoutPlaceholders);
    counts.bound = bindActions.length;
  }

  let hasWork =
    hasRolePlacement ||
    hasMonEnsure ||
    counts.parked > 0 ||
    counts.closed > 0 ||
    counts.structure > 0 ||
    counts.ordered > 0 ||
    counts.sized > 0 ||
    Object.keys(slotsNeedingLayout).length > 0 ||
    peelDemoteActions.length > 0 ||
    skeletonActions.length > 0 ||
    bindActions.length > 0 ||
    (!safe && !skipWindowStructure && !structureCmp.match);

  const structureEnsureActions = [];
  const monEnsureActions = [];
  if (hasWork && !safe && !skipWindowStructure) {
    const slotKeys = Object.keys(slotsNeedingLayout).sort();
    for (const slot of slotKeys) {
      const mode = slotsNeedingLayout[slot];
      let wids =
        structureSlots[slot] && structureSlots[slot].windowIds != null
          ? structureSlots[slot].windowIds
          : null;
      if (wids == null) {
        const modeL = String(mode || "")
          .trim()
          .toLowerCase();
        if (modeL === "hsplit" || modeL === "vsplit") {
          wids = roleWindowIdsForSlotPrefix(roleResults, slot);
        } else {
          wids = orderedSlotWindowIds(roleResults, slot, kept, roleOrder);
        }
      }
      if (!wids || !wids.length) continue;
      structureEnsureActions.push({
        op: "ensure_layout",
        slot,
        mode,
        windowIds: wids,
      });
    }

    const nestedStructureMons = new Set();
    for (const slot of Object.keys(slotsNeedingLayout)) {
      if (typeof slot === "string" && slot.includes(".")) {
        nestedStructureMons.add(slot.split(".")[0]);
      }
    }
    if (hasMonEnsure) {
      for (const [monKey, monBody] of Object.entries(prof.layout || {})) {
        if (!monsWithPlacement.has(monKey)) continue;
        if (monChildPeelMons.has(monKey)) continue;
        if (nestedStructureMons.has(monKey) && !monsSplitMismatch.has(monKey)) continue;
        if (!isPlainObject(monBody)) continue;
        const split = monBody.split;
        if (!split) continue;
        const anchors = monSplitAnchorIds(roleResults, monKey, prof);
        if (!anchors.length) continue;
        monEnsureActions.push({
          op: "ensure_layout",
          slot: monKey,
          mode: split,
          windowIds: anchors,
        });
      }
    }
  }

  const ensureActions = peelDemoteActions.concat(structureEnsureActions).concat(monEnsureActions);
  const seenEnsure = new Set();
  const dedupedEnsure = [];
  for (const a of ensureActions) {
    const key = a.slot;
    if (seenEnsure.has(key)) continue;
    seenEnsure.add(key);
    dedupedEnsure.push(a);
  }

  const focusActions = focusActionsFromProfile(prof, roleResults, {
    forest,
    justOpenedRoles: openedRoles,
  });
  counts.focused = focusActions.length;
  if (focusActions.length) hasWork = true;

  const finalActions = skeletonActions
    .concat(dedupedEnsure)
    .concat(actions)
    .concat(bindActions)
    .concat(residualActions)
    .concat(orderActions)
    .concat(sizeActs)
    .concat(focusActions);
  const nothing = !hasWork;
  const thrashRisk = computeThrashRisk(finalActions, counts);

  return {
    ok: true,
    workspace,
    nothingToDo: nothing,
    counts,
    roles: roleResults,
    actions: finalActions,
    structureMatch: !!structureCmp.match,
    structureMismatches: (structureCmp.mismatches || []).slice(),
    kept,
    left,
    unclaimed,
    clean,
    keepOthers,
    safe,
    coldEmpty,
    thrashRisk,
    thrashState,
  };
}

/* ---- planActionsToSteps (layout_apply.actions_to_extension_steps) ---- */

function slotToMonitorPath(slot, workspace) {
  if (workspace == null) workspace = 0;
  let mon = monIndexFromSlot(slot);
  if (mon == null) mon = 0;
  let ws = parseInt(workspace, 10);
  if (!Number.isFinite(ws)) ws = 0;
  if (ws < 0) ws = 0;
  return "path:mo" + mon + "ws" + ws;
}

function windowTileSelector(action) {
  const wid = action.windowId;
  if (wid != null && String(wid).trim() !== "") return "id:" + wid;
  const path = action.path;
  if (path == null || String(path).trim() === "") return null;
  const s = String(path).trim();
  if (s.startsWith("path:") || s.startsWith("id:")) return s;
  return "path:" + s;
}

function actionWorkspace(a, defaultWs) {
  if (defaultWs == null) defaultWs = 0;
  const raw = a.workspace;
  if (raw == null) return defaultWs;
  let ws = parseInt(raw, 10);
  if (!Number.isFinite(ws)) return defaultWs;
  return ws >= 0 ? ws : defaultWs;
}

function moveStepFromAction(a, workspace) {
  if (workspace == null) workspace = 0;
  const tile = windowTileSelector(a);
  if (!tile) return null;
  const ws = actionWorkspace(a, workspace);
  let dest;
  const destWid = a.destWindowId;
  if (destWid != null && String(destWid).trim() !== "") {
    dest = "id:" + destWid;
  } else {
    const slot = String(a.slot || "mon0");
    dest = slotToMonitorPath(slot, ws);
  }
  const step = { op: "move", tile, dest };
  let pos = a.position;
  if (pos == null && a.childIndex === 0) pos = "start";
  if (pos != null && String(pos).trim() !== "") {
    step.position = typeof pos === "string" ? pos : String(pos);
  }
  return step;
}

function windowIdsToSelectors(wids) {
  if (!Array.isArray(wids)) return [];
  const out = [];
  for (const wid of wids) {
    if (wid == null || String(wid).trim() === "") continue;
    const s = String(wid).trim();
    if (s.startsWith("id:")) out.push(s);
    else out.push("id:" + s);
  }
  return out;
}

/**
 * Map plan actions → extension RunSteps.
 * Port of scripts/forge/layout_apply.py actions_to_extension_steps.
 */
export function planActionsToSteps(actions, opts) {
  opts = opts || {};
  if (!Array.isArray(actions)) return [];
  let forceClose = !!(opts.forceClose ?? opts.force_close ?? false);
  let workspace = opts.workspace != null ? opts.workspace : 0;
  workspace = parseInt(workspace, 10);
  if (!Number.isFinite(workspace)) workspace = 0;
  if (workspace < 0) workspace = 0;

  const windowByMon = {};
  for (const a of actions) {
    if (!isPlainObject(a)) continue;
    const op = String(a.op || "")
      .trim()
      .toLowerCase();
    if (op !== "move" && op !== "park") continue;
    const tile = windowTileSelector(a);
    if (!tile || !tile.startsWith("id:")) continue;
    let mon = monIndexFromSlot(String(a.slot || "mon0"));
    if (mon == null) mon = 0;
    if (!(mon in windowByMon)) windowByMon[mon] = tile;
  }

  const skeletonSteps = [];
  const rolePlaceSteps = [];
  const residualSteps = [];
  const bindSteps = [];
  const layoutSteps = [];
  const orderSteps = [];
  const sizeSteps = [];
  const focusSteps = [];

  for (const a of actions) {
    if (!isPlainObject(a)) continue;
    const op = String(a.op || "")
      .trim()
      .toLowerCase();
    if (op === "ensure_skeleton") {
      const mons = a.mons;
      if (!Array.isArray(mons) || !mons.length) continue;
      const step = { op: "skeleton", mons };
      const wsA = a.workspace;
      if (wsA != null) {
        let w = parseInt(wsA, 10);
        if (!Number.isFinite(w)) w = workspace;
        step.workspace = w;
      } else {
        step.workspace = workspace;
      }
      skeletonSteps.push(step);
      continue;
    }
    if (op === "bind") {
      const tile = windowTileSelector(a);
      if (!tile) continue;
      const bindStep = { op: "bind", tile };
      if (a.layoutRole != null) bindStep.layoutRole = String(a.layoutRole);
      if (a.layoutSlot != null) bindStep.layoutSlot = String(a.layoutSlot);
      const ph = a.placeholderId;
      if (ph != null && String(ph).trim() !== "") {
        const p = String(ph).trim();
        bindStep.placeholder = p.startsWith("id:") ? p : "id:" + p;
      }
      bindSteps.push(bindStep);
      continue;
    }
    if (op === "move") {
      const step = moveStepFromAction(a, workspace);
      if (step) rolePlaceSteps.push(step);
      continue;
    }
    if (op === "park") {
      const step = moveStepFromAction(a, workspace);
      if (step) residualSteps.push(step);
      continue;
    }
    if (op === "close") {
      const tile = windowTileSelector(a);
      if (!tile) continue;
      const closeStep = { op: "close", selector: tile };
      if (forceClose || a.force) closeStep.force = true;
      residualSteps.push(closeStep);
      continue;
    }
    if (op === "focus") {
      let sel = a.selector;
      if (sel == null || String(sel).trim() === "") {
        const wid = a.windowId;
        if (wid != null && String(wid).trim() !== "") {
          const s = String(wid).trim();
          sel = s.startsWith("id:") ? s : "id:" + s;
        }
      }
      if (sel != null && String(sel).trim() !== "") {
        const stepF = { op: "focus", selector: String(sel).trim() };
        const reason = String(a.reason || "")
          .trim()
          .toLowerCase();
        const kbd = a.keyboard;
        if (kbd === false || kbd === 0 || reason === "active" || reason === "survivor") {
          stepF.keyboard = false;
        }
        focusSteps.push(stepF);
      }
      continue;
    }
    if (op === "ensure_order") {
      const idSels = windowIdsToSelectors(a.windowIds != null ? a.windowIds : a.selectors);
      if (idSels.length >= 2) {
        orderSteps.push({ op: "order", windowIds: idSels });
      }
      continue;
    }
    if (op === "ensure_sizes") {
      const idSels = windowIdsToSelectors(a.windowIds != null ? a.windowIds : a.selectors);
      const rawShares = a.shares != null ? a.shares : a.share;
      let shares = [];
      if (Array.isArray(rawShares)) {
        for (const s of rawShares) {
          const f = Number(s);
          if (!Number.isFinite(f) || f <= 0) {
            shares = [];
            break;
          }
          shares.push(f);
        }
      }
      if (idSels.length >= 2 && shares.length === idSels.length) {
        sizeSteps.push({ op: "size", windowIds: idSels, shares });
      }
      continue;
    }
    if (op !== "ensure_layout") continue;
    const modeRaw = a.mode;
    if (modeRaw == null || String(modeRaw).trim() === "") continue;
    const mode = String(modeRaw).trim().toLowerCase();
    const slot = String(a.slot || "mon0");
    let mon = monIndexFromSlot(slot);
    if (mon == null) mon = 0;
    const idSels = windowIdsToSelectors(a.windowIds);

    if ((mode === "tabbed" || mode === "stacked") && idSels.length) {
      const anchor = idSels[0];
      layoutSteps.push({ op: "layout", mode, selector: anchor });
      for (let i = 1; i < idSels.length; i++) {
        layoutSteps.push({ op: "move", tile: idSels[i], dest: anchor });
      }
      if (idSels.length >= 2) {
        orderSteps.push({ op: "order", windowIds: idSels.slice() });
      }
      continue;
    }

    if ((mode === "hsplit" || mode === "vsplit") && idSels.length >= 2 && slot.includes(".")) {
      const anchor = idSels[0];
      layoutSteps.push({ op: "layout", mode, selector: anchor });
      for (let i = 1; i < idSels.length; i++) {
        layoutSteps.push({ op: "move", tile: idSels[i], dest: anchor });
      }
      if (idSels.length >= 2) {
        orderSteps.push({ op: "order", windowIds: idSels.slice() });
      }
      continue;
    }

    const sel = idSels.length ? idSels[0] : windowByMon[mon];
    if (!sel) continue;
    layoutSteps.push({ op: "layout", mode, selector: sel });
  }

  return skeletonSteps
    .concat(rolePlaceSteps)
    .concat(bindSteps)
    .concat(residualSteps)
    .concat(layoutSteps)
    .concat(orderSteps)
    .concat(sizeSteps)
    .concat(focusSteps);
}
