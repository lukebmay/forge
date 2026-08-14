/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure helpers for Meta-window census / untracked admit (R030).
 * No GObject imports — unit tests stay light.
 */

/**
 * Why a live Meta window should not be admitted into the tree.
 * @param {{
 *   tracked?: boolean,
 *   valid?: boolean,
 *   ignored?: boolean,
 * }} flags
 * @returns {string|null} skip reason, or null when admit should run
 */
export function untrackedSkipReason(flags = {}) {
  if (flags.tracked) return "tracked";
  if (flags.valid === false) return "invalid-type";
  if (flags.ignored) return "ignored";
  return null;
}

/**
 * Compact GetTree / log row for one census entry.
 * @param {object} row
 * @returns {object}
 */
export function summarizeCensusEntry(row = {}) {
  const out = {
    windowId: row.windowId ?? row.id ?? null,
    wmClass: row.wmClass ?? null,
    title: row.title ?? null,
    tracked: !!row.tracked,
    mode: row.mode ?? null,
  };
  if (row.wmClassInstance != null) out.wmClassInstance = row.wmClassInstance;
  if (row.pid != null) out.pid = row.pid;
  if (row.monitor != null) out.monitor = row.monitor;
  if (row.floatExempt != null) out.floatExempt = !!row.floatExempt;
  if (row.skip) out.skip = row.skip;
  return out;
}

/**
 * Counts for a census list.
 * @param {object[]} entries
 * @returns {{ total: number, tracked: number, untracked: number, skipped: number }}
 */
export function summarizeCensus(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let tracked = 0;
  let untracked = 0;
  let skipped = 0;
  for (const e of list) {
    if (e?.tracked) tracked += 1;
    else if (e?.skip) skipped += 1;
    else untracked += 1;
  }
  return { total: list.length, tracked, untracked, skipped };
}

/**
 * First monitor node that can host a new map (prefer matching ws).
 * @param {object[]} monitorNodes
 * @param {number} [workspaceIndex]
 * @returns {object|null}
 */
export function fallbackMonitorNode(monitorNodes, workspaceIndex) {
  const mons = Array.isArray(monitorNodes) ? monitorNodes : [];
  if (!mons.length) return null;
  const ws =
    typeof workspaceIndex === "number" && Number.isFinite(workspaceIndex) ? workspaceIndex : null;
  if (ws != null) {
    const hit = mons.find((n) => {
      const id = n?.nodeValue != null ? String(n.nodeValue) : String(n?.id ?? "");
      return id.includes(`ws${ws}`);
    });
    if (hit) return hit;
  }
  return mons[0] || null;
}

/**
 * Resolve a dest mon-ws id, falling back when homeMonitor is missing.
 * @param {{
 *   homeMonitor?: number,
 *   windowMonitor?: number,
 *   activeWorkspace?: number,
 *   createId?: (mon: number, ws: number) => string,
 * }} opts
 * @returns {{ mon: number, ws: number, id: string }|null}
 */
export function resolveTrackDestId(opts = {}) {
  const ws =
    typeof opts.activeWorkspace === "number" && Number.isFinite(opts.activeWorkspace)
      ? opts.activeWorkspace
      : 0;
  let mon = opts.homeMonitor;
  if (!(typeof mon === "number" && Number.isFinite(mon) && mon >= 0)) {
    mon = opts.windowMonitor;
  }
  if (!(typeof mon === "number" && Number.isFinite(mon) && mon >= 0)) {
    mon = 0;
  }
  const createId = typeof opts.createId === "function" ? opts.createId : (m, w) => `mo${m}ws${w}`;
  return { mon, ws, id: createId(mon, ws) };
}
