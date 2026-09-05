/*
 * ApplyLayout visible-open (D117): spawn bands, visible TILE set,
 * visible-hard overlay, raise-when-group-has-window, focus-after-mapped.
 * Pure — no GObject.
 */

import { windowIsSettled } from "./layout-apply-settle.js";

export const SPAWN_BAND = Object.freeze({
  OPEN_LEAF: 0,
  VISIBLE_TILE: 1,
  BURIED: 2,
});

const GROUP_LAY = new Set(["tabbed", "stacked", "TABBED", "STACKED"]);

function _roleId(raw) {
  if (raw == null) return "";
  return String(raw).trim();
}

function _isGroupNode(ch) {
  if (!ch || typeof ch !== "object") return false;
  const lay = String(ch.layout || ch.mode || "")
    .trim()
    .toLowerCase();
  const roles = Array.isArray(ch.roles) ? ch.roles : [];
  return GROUP_LAY.has(lay) || (roles.length >= 2 && (lay === "tabbed" || lay === "stacked"));
}

function _walkLayoutGroups(node, visit) {
  if (!node || typeof node !== "object") return;
  if (_isGroupNode(node)) visit(node);
  const kids = node.children;
  if (Array.isArray(kids)) {
    for (const ch of kids) _walkLayoutGroups(ch, visit);
  }
}

/**
 * Role id → { band, active, members } from profile layout / role slots.
 * @param {object|null|undefined} profile
 * @returns {Map<string, { band: number, active: string, members: string[] }>}
 */
export function indexSpawnBands(profile) {
  const out = new Map();
  const prof = profile && typeof profile === "object" ? profile : {};
  const layout = prof.layout && typeof prof.layout === "object" ? prof.layout : {};

  const markGroup = (members, activeRaw) => {
    const ids = members.map(_roleId).filter(Boolean);
    if (ids.length < 2) {
      for (const id of ids) {
        if (!out.has(id)) out.set(id, { band: SPAWN_BAND.VISIBLE_TILE, active: id, members: ids });
      }
      return;
    }
    const active = _roleId(activeRaw) || ids[0];
    for (const id of ids) {
      const band = id === active ? SPAWN_BAND.OPEN_LEAF : SPAWN_BAND.BURIED;
      out.set(id, { band, active, members: ids });
    }
  };

  for (const monBody of Object.values(layout)) {
    _walkLayoutGroups(monBody, (ch) => {
      const roles = Array.isArray(ch.roles) ? ch.roles : [];
      markGroup(roles, ch.active);
    });
  }

  const bySlot = new Map();
  for (const role of Array.isArray(prof.roles) ? prof.roles : []) {
    if (!role || typeof role !== "object") continue;
    const id = _roleId(role.id);
    if (!id) continue;
    const slot = role.slot != null ? String(role.slot).trim() : "";
    if (!slot) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(id);
  }
  for (const members of bySlot.values()) {
    if (members.length < 2) continue;
    const already = members.filter((id) => out.has(id));
    if (already.length === members.length) continue;
    markGroup(members, members[0]);
  }

  return out;
}

/**
 * @param {object|null|undefined} action
 * @param {object|null|undefined} profile
 * @returns {number}
 */
export function spawnBandForOpenAction(action, profile) {
  const role = _roleId(action?.role);
  if (!role) return SPAWN_BAND.VISIBLE_TILE;
  const idx = indexSpawnBands(profile);
  const hit = idx.get(role);
  if (hit) return hit.band;
  return SPAWN_BAND.VISIBLE_TILE;
}

/**
 * Stable visible-first spawn order. Does not shuffle.
 * @param {object[]} actions
 * @param {object|null|undefined} profile
 * @returns {object[]}
 */
export function orderOpenActionsVisibleFirst(actions, profile) {
  const list = Array.isArray(actions) ? actions.filter(Boolean) : [];
  const keyed = list.map((a, i) => ({ a, i, band: spawnBandForOpenAction(a, profile) }));
  keyed.sort((x, y) => x.band - y.band || x.i - y.i);
  return keyed.map((k) => k.a);
}

function _monIndex(node) {
  if (!node || typeof node !== "object") return null;
  if (node.monitor != null && Number.isFinite(Number(node.monitor))) {
    return Number(node.monitor);
  }
  const id = String(node.id || node.nodeValue || "");
  const m = id.match(/^mo(\d+)/i);
  return m ? Number(m[1]) : null;
}

function _wsIndex(node) {
  if (!node || typeof node !== "object") return null;
  if (node.workspace != null && Number.isFinite(Number(node.workspace))) {
    return Number(node.workspace);
  }
  const id = String(node.id || node.nodeValue || "");
  const m = id.match(/ws(\d+)/i);
  return m ? Number(m[1]) : null;
}

function _winId(node) {
  if (!node || typeof node !== "object") return "";
  if (node.windowId != null && String(node.windowId).trim() !== "") {
    return String(node.windowId).trim();
  }
  if (node.id != null && String(node.id).trim() !== "" && node.nodeType === "WINDOW") {
    return String(node.id).trim();
  }
  return "";
}

function _isWindowNode(n) {
  if (!n || typeof n !== "object") return false;
  if (n.placeholder || n.isPlaceholder) return false;
  const t = String(n.nodeType || n.type || "").toUpperCase();
  if (t === "WINDOW") return true;
  return n.windowId != null && String(n.windowId).trim() !== "";
}

function _isGroupLayout(n) {
  const lay = String(n?.layout || "").toUpperCase();
  return lay === "TABBED" || lay === "STACKED";
}

function _pushVisibleWindow(n, ids, openId) {
  const id = _winId(n);
  if (!id) return;
  if (openId != null && String(openId) !== id) return;
  if (!ids.includes(id)) ids.push(id);
}

function _walkVisible(node, ids, groupOpenId) {
  if (!node || typeof node !== "object") return;
  if (_isWindowNode(node)) {
    _pushVisibleWindow(node, ids, groupOpenId);
    return;
  }
  const kids = Array.isArray(node.children) ? node.children : [];
  if (_isGroupLayout(node)) {
    let openId = node.lastTabFocusId != null ? String(node.lastTabFocusId) : "";
    if (!openId && node.lastTabFocus != null) openId = String(node.lastTabFocus);
    if (!openId) {
      const first = kids.find(_isWindowNode);
      openId = first ? _winId(first) : "";
    }
    for (const ch of kids) _walkVisible(ch, ids, openId || null);
    return;
  }
  for (const ch of kids) _walkVisible(ch, ids, groupOpenId);
}

/**
 * WINDOW ids the user can see on the apply workspace (open leaf + lone TILE).
 * Other-mon excluded unless includeOtherMonitors.
 * @param {object|null|undefined} forest
 * @param {{ workspace?: number, monitor?: number, includeOtherMonitors?: boolean }} [opts]
 * @returns {string[]}
 */
export function collectVisibleTileWindowIds(forest, opts = {}) {
  const ids = [];
  if (!forest || typeof forest !== "object") return ids;
  const wantWs =
    opts.workspace != null && Number.isFinite(Number(opts.workspace))
      ? Number(opts.workspace)
      : null;
  const includeOther = !!opts.includeOtherMonitors;
  const wantMon =
    opts.monitor != null && Number.isFinite(Number(opts.monitor)) ? Number(opts.monitor) : 0;
  const mons = Array.isArray(forest.monitors) ? forest.monitors : [];
  for (const mon of mons) {
    const ws = _wsIndex(mon);
    if (wantWs != null && ws != null && ws !== wantWs) continue;
    const mi = _monIndex(mon);
    if (!includeOther && mi != null && mi !== wantMon) continue;
    _walkVisible(mon, ids, null);
  }
  return ids;
}

/**
 * Visible-hard: every visible TILE is in-slot or honest FLOAT.
 * Empty visible set is not hard (maps still coming).
 * @param {object[]} windows
 * @param {string[]} visibleIds
 * @param {{ slots?: object }} [opts]
 * @returns {boolean}
 */
export function isVisibleHard(windows, visibleIds, opts = {}) {
  const ids = Array.isArray(visibleIds) ? visibleIds.map(String).filter(Boolean) : [];
  if (!ids.length) return false;
  const list = Array.isArray(windows) ? windows : [];
  const slots = opts.slots && typeof opts.slots === "object" ? opts.slots : {};
  for (const id of ids) {
    const win = list.find((w) => w && String(w.windowId) === id);
    if (!win) return false;
    const mode = String(win.mode || "");
    if (mode === "FLOAT" || mode === "float") continue;
    const slot = slots[id] && typeof slots[id] === "object" ? slots[id] : {};
    const settleOpts = { requireTile: true, allowGrab: true };
    if (slot.monitor != null) settleOpts.monitor = slot.monitor;
    if (!windowIsSettled(win, settleOpts)) return false;
  }
  return true;
}

/**
 * Raise the intended open leaf once the group has ≥1 mapped WINDOW.
 * @param {object[]} mappedKids
 * @param {string|null|undefined} intendedId
 * @returns {object|null}
 */
export function pickOpenLeafToRaise(mappedKids, intendedId) {
  const kids = Array.isArray(mappedKids) ? mappedKids.filter(Boolean) : [];
  if (!kids.length) return null;
  const want = intendedId != null ? String(intendedId).trim() : "";
  if (!want) return null;
  return (
    kids.find((k) => {
      const id = _winId(k) || (k.nodeValue?.get_id ? String(k.nodeValue.get_id()) : "");
      const nid = k.id != null ? String(k.id) : "";
      return id === want || nid === want;
    }) || null
  );
}

/**
 * True when focus may run: every required WINDOW is mapped (not ε-hard).
 * @param {object|null|undefined} run
 * @param {string[]} [phases]
 * @returns {boolean}
 */
export function focusAfterAllMappedAllowed(run, _phases) {
  if (!run) return false;
  if (run.openHeld) return false;
  if (run.openRan && Array.isArray(run.openMissing) && run.openMissing.length) return false;
  return true;
}
