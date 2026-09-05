/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure monitor identity / remap helpers (T7).
 * Best-effort fingerprints from GJS/Mutter fields — not EDID/gdisplays.
 *
 * Stable key formats:
 *   conn:<connector>              e.g. conn:DP-1
 *   name:<displayName>            when no connector
 *   geom:<x>,<y>,<w>,<h>[#primary][#idx:N]
 *     #primary when isPrimary; #idx:N only to break geom collisions
 */

/**
 * @typedef {{
 *   index: number,
 *   connector?: string|null,
 *   name?: string|null,
 *   isPrimary?: boolean,
 *   x?: number,
 *   y?: number,
 *   width?: number,
 *   height?: number,
 * }} MonitorInfo
 */

/**
 * @typedef {{
 *   byKey: Map<string, number>,
 *   byIndex: Map<number, string>,
 *   fingerprints: Array<MonitorInfo & { stableKey: string }>,
 * }} LiveMap
 */

/**
 * Parse monitor index from tree mon id `moNwsW`.
 * @param {string} id
 * @returns {number}
 */
export function monIndexFromId(id) {
  if (typeof id !== "string") return -1;
  const m = /^mo(\d+)ws(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Parse workspace index from tree mon id `moNwsW`.
 * @param {string} id
 * @returns {number}
 */
export function workspaceFromId(id) {
  if (typeof id !== "string") return -1;
  const m = /^mo(\d+)ws(\d+)$/.exec(id);
  return m ? parseInt(m[2], 10) : -1;
}

/**
 * Build mon-ws id for a remapped monitor index.
 * @param {number} monitorIndex
 * @param {number} workspaceIndex
 * @returns {string}
 */
export function createMonWsId(monitorIndex, workspaceIndex) {
  return `mo${monitorIndex}ws${workspaceIndex}`;
}

/**
 * Meta monitor+workspace → `moNwsW`. Null when either index is missing.
 * @param {any} meta
 * @returns {string|null}
 */
export function monWsIdFromMeta(meta) {
  let mon = -1;
  let ws = -1;
  try {
    if (typeof meta?.get_monitor === "function") mon = Number(meta.get_monitor());
  } catch (_e) {
    mon = -1;
  }
  try {
    const wso = typeof meta?.get_workspace === "function" ? meta.get_workspace() : null;
    if (wso && typeof wso.index === "function") ws = Number(wso.index());
    else if (typeof wso?.index === "number") ws = Number(wso.index);
  } catch (_e) {
    ws = -1;
  }
  if (!(mon >= 0) || !(ws >= 0)) return null;
  return createMonWsId(mon, ws);
}

/**
 * Fingerprint one monitor into a stable string key.
 * Prefers connector, then display name, then geometry (+ primary / index).
 *
 * @param {MonitorInfo} info
 * @returns {string}
 */
export function fingerprintMonitor(info) {
  if (!info || typeof info !== "object") return "geom:0,0,0,0";

  const connector = normalizeToken(info.connector);
  if (connector) return `conn:${connector}`;

  const name = normalizeToken(info.name);
  if (name) return `name:${name}`;

  const x = num(info.x, 0);
  const y = num(info.y, 0);
  const w = num(info.width, 0);
  const h = num(info.height, 0);
  // No #idx here — same geometry must remap across Mutter renumber.
  // buildLiveMap appends #idx only when two heads collide on this key.
  let key = `geom:${x},${y},${w},${h}`;
  if (info.isPrimary) key += "#primary";
  return key;
}

/**
 * Build stableKey ↔ index maps from live monitor infos.
 * Duplicate preferred keys (rare) disambiguate with #idx:N.
 *
 * @param {MonitorInfo[]} monitorsInfo
 * @returns {LiveMap}
 */
export function buildLiveMap(monitorsInfo) {
  /** @type {Map<string, number>} */
  const byKey = new Map();
  /** @type {Map<number, string>} */
  const byIndex = new Map();
  /** @type {Array<MonitorInfo & { stableKey: string }>} */
  const fingerprints = [];

  const list = Array.isArray(monitorsInfo) ? monitorsInfo : [];
  /** @type {Map<string, number>} */
  const seen = new Map();

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const index = num(raw.index, fingerprints.length);
    let stableKey = fingerprintMonitor({ ...raw, index });

    // If two connectors somehow collide after normalize, disambiguate.
    if (byKey.has(stableKey)) {
      const n = (seen.get(stableKey) || 1) + 1;
      seen.set(stableKey, n);
      stableKey = `${stableKey}#idx:${index}`;
    } else {
      seen.set(stableKey, 1);
    }

    byKey.set(stableKey, index);
    byIndex.set(index, stableKey);
    fingerprints.push({
      index,
      connector: raw.connector ?? null,
      name: raw.name ?? null,
      isPrimary: !!raw.isPrimary,
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      width: num(raw.width, 0),
      height: num(raw.height, 0),
      stableKey,
    });
  }

  return { byKey, byIndex, fingerprints };
}

/**
 * Resolve stableKey → current monitor index, or -1.
 * @param {string|null|undefined} stableKey
 * @param {LiveMap|null|undefined} liveMap
 * @returns {number}
 */
export function resolveIndexByStableKey(stableKey, liveMap) {
  if (!stableKey || !liveMap?.byKey) return -1;
  const idx = liveMap.byKey.get(stableKey);
  return typeof idx === "number" && idx >= 0 ? idx : -1;
}

/**
 * Remap an old monitor index through previous fingerprints → live map.
 * @param {number} oldIndex
 * @param {Array<{ index: number, stableKey: string }>|null|undefined} previousFingerprints
 * @param {LiveMap|null|undefined} liveMap
 * @returns {number} new index or -1
 */
export function remapIndex(oldIndex, previousFingerprints, liveMap) {
  if (!liveMap || oldIndex == null || oldIndex < 0) return -1;
  const prev = Array.isArray(previousFingerprints) ? previousFingerprints : [];
  const fp = prev.find((p) => p && p.index === oldIndex);
  if (!fp?.stableKey) {
    // No prior fingerprint: identity if still present, else -1
    if (liveMap.byIndex.has(oldIndex)) return oldIndex;
    return -1;
  }
  return resolveIndexByStableKey(fp.stableKey, liveMap);
}

/**
 * Index moves / losses between previous fingerprints and a live map.
 * Empty when identity (same index) for every prior key. `to: -1` = unplugged.
 *
 * @param {Array<{ index: number, stableKey: string }>|null|undefined} previousFingerprints
 * @param {LiveMap|null|undefined} liveMap
 * @returns {Array<{ from: number, to: number, stableKey: string }>}
 */
export function listIndexRemaps(previousFingerprints, liveMap) {
  if (!liveMap) return [];
  const prev = Array.isArray(previousFingerprints) ? previousFingerprints : [];
  /** @type {Array<{ from: number, to: number, stableKey: string }>} */
  const out = [];
  for (const fp of prev) {
    if (!fp || typeof fp.index !== "number" || fp.index < 0 || !fp.stableKey) continue;
    const to = resolveIndexByStableKey(fp.stableKey, liveMap);
    if (to === fp.index) continue;
    out.push({ from: fp.index, to, stableKey: String(fp.stableKey) });
  }
  return out;
}

/**
 * Build mon-ws id for monDesc using live stableKey map (workspace from monDesc.id).
 * @param {{ id?: string, stableKey?: string }} monDesc
 * @param {LiveMap|null|undefined} liveMap
 * @returns {string|null}
 */
export function resolveMonWsIdByStableKey(monDesc, liveMap) {
  if (!monDesc?.stableKey || !liveMap) return null;
  const idx = resolveIndexByStableKey(monDesc.stableKey, liveMap);
  if (idx < 0) return null;
  const ws = workspaceFromId(monDesc.id);
  if (ws < 0) return null;
  return createMonWsId(idx, ws);
}

/** @param {unknown} v @returns {string|null} */
function normalizeToken(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** @param {unknown} v @param {number} fallback */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
