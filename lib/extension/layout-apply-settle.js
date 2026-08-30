/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyLayout settle bag (AL7 / D019 / SM2 / SM5): in-slot hard-ready,
 * soft residual after all-hard focus, verify-once (not Done.ok).
 * Signal-driven — not a GetTree poll twin. Belt deleted (D042/SM6).
 */

import { lastRollingLatencies, softTimeoutFromLatencies, ROLLING_N, PAD } from "./settle-math.js";
import { collectWindows, planReconcile, planActionsToSteps } from "../shared/layout-plan.js";
import { LAYOUT_VERIFY_EPSILON_PX, rectsAgree } from "./layout-verify.js";

export const HARD_TIMEOUT_MS = 5000;
export const SOFT_FOCUS_WALL_MULT = 3;
export const SOFT_FOCUS_WALL_CAP_MS = 15000;
export const COLD_FOCUS_SOFT_FLOOR_MS = 2000;
export const LEARNING_TRIAL_SOFT_CAP_MS = 10000;
export const HEURISTICS_FILENAME = "settle-heuristics.json";
export const HEURISTICS_SCHEMA_VERSION = 1;
export const TREE_STABLE_TIMEOUT_MS = 7000;
export const TREE_STABLE_SAMPLES = 3;

export const SOFT_FLOOR_MS = Object.freeze({ focus: 400, geom: 200 });
export const SOFT_CLAMP_MS = Object.freeze({ focus: 3000, geom: 5000 });

const SETTLED_MODES = new Set(["TILE", "tile"]);
const SETTLED_MODES_LOOSE = new Set(["TILE", "tile", "GRAB_TILE", "grab_tile"]);
const _KEY_SEP = "|";
const GROUP_LAYOUTS = new Set(["TABBED", "STACKED"]);

export { ROLLING_N, PAD };

function _nonNegInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

function _uniqueIds(windowIds) {
  const out = [];
  const seen = new Set();
  for (const x of windowIds || []) {
    if (x == null) continue;
    const s = String(x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function _rectIsReasonable(rect) {
  if (rect == null) return true;
  if (typeof rect !== "object" || Array.isArray(rect)) return false;
  const w = Number(rect.width);
  const h = Number(rect.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  for (const k of ["x", "y"]) {
    const v = rect[k];
    if (v != null && typeof v !== "number" && typeof v !== "bigint") return false;
  }
  return true;
}

function _firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return undefined;
}

function _fullRect(rect) {
  if (!rect || typeof rect !== "object" || Array.isArray(rect)) return false;
  for (const k of ["x", "y", "width", "height"]) {
    if (typeof rect[k] !== "number" || !Number.isFinite(rect[k])) return false;
  }
  return true;
}

function _slotBag(opts) {
  const slot = opts?.slot;
  if (slot && typeof slot === "object" && !Array.isArray(slot)) return slot;
  return null;
}

/**
 * Settled predicate. Loose (launch): id + TILE|grab + sane rect + mon ≥ 0.
 * In-slot (ApplyLayout): also desired mon + parent CON + ε rect when given.
 * @param {unknown} win
 * @param {{
 *   requireTile?: boolean,
 *   allowGrab?: boolean,
 *   monitor?: number,
 *   parentId?: string,
 *   parentLayout?: string,
 *   parentType?: string,
 *   slotRect?: object,
 *   epsilon?: number,
 *   slot?: object,
 * }} [opts]
 * @returns {boolean}
 */
export function windowIsSettled(win, opts = {}) {
  if (!win || typeof win !== "object" || Array.isArray(win)) return false;
  const wid = win.windowId;
  if (wid == null || String(wid).trim() === "") return false;

  const requireTile = opts.requireTile !== false;
  const allowGrab = opts.allowGrab !== false;
  if (requireTile) {
    const mode = win.mode;
    const modes = allowGrab ? SETTLED_MODES_LOOSE : SETTLED_MODES;
    if (mode == null || !modes.has(String(mode))) return false;
  }
  if (!_rectIsReasonable(win.rect)) return false;
  if (win.monitor != null) {
    const mon = Number(win.monitor);
    if (!Number.isFinite(mon) || mon < 0) return false;
  }

  const slot = _slotBag(opts);
  const wantMon = _firstDefined(opts.monitor, slot?.monitor);
  if (wantMon != null && wantMon !== "") {
    const want = Number(wantMon);
    const have = win.monitor != null ? Number(win.monitor) : NaN;
    if (!Number.isFinite(want) || want < 0 || !Number.isFinite(have) || have !== want) {
      return false;
    }
  }

  const wantParentId = _firstDefined(opts.parentId, slot?.parentId);
  if (wantParentId != null && String(wantParentId).trim() !== "") {
    const have = win.parentId ?? win.parentPath ?? win.parent_path;
    if (have == null || String(have) !== String(wantParentId)) return false;
  }

  const wantParentLayout = _firstDefined(opts.parentLayout, slot?.parentLayout);
  if (wantParentLayout != null && String(wantParentLayout).trim() !== "") {
    const have = String(win.parentLayout ?? win.parent_layout ?? "").toUpperCase();
    if (have !== String(wantParentLayout).toUpperCase()) return false;
  }

  const wantParentType = _firstDefined(opts.parentType, slot?.parentType);
  if (wantParentType != null && String(wantParentType).trim() !== "") {
    const have = String(win.parentType ?? win.parent_type ?? "").toUpperCase();
    if (have !== String(wantParentType).toUpperCase()) return false;
  }

  const wantRect = _firstDefined(opts.slotRect, slot?.slotRect, slot?.rect);
  if (wantRect != null && _fullRect(wantRect) && _fullRect(win.rect)) {
    const eps = _firstDefined(opts.epsilon, slot?.epsilon, LAYOUT_VERIFY_EPSILON_PX);
    if (!rectsAgree(win.rect, wantRect, eps)) return false;
  }
  return true;
}

function _normalizeSlotMap(slots) {
  const out = {};
  if (!slots) return out;
  if (Array.isArray(slots)) {
    for (const s of slots) {
      if (!s || typeof s !== "object" || Array.isArray(s)) continue;
      const id = s.windowId;
      if (id == null || String(id).trim() === "") continue;
      out[String(id)] = s;
    }
    return out;
  }
  if (typeof slots === "object") {
    for (const [k, v] of Object.entries(slots)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      out[String(k)] = v;
    }
  }
  return out;
}

/**
 * @param {unknown} windows
 * @param {unknown} windowIds
 * @param {{ requireTile?: boolean, slots?: object|object[] }} [opts]
 * @returns {{ ok: boolean, settled: string[], pending: string[] }}
 */
export function hardReadyStatus(windows, windowIds, opts = {}) {
  const ids = _uniqueIds(windowIds);
  const list = Array.isArray(windows) ? windows : [];
  const slots = _normalizeSlotMap(opts.slots);
  const settled = [];
  const pending = [];
  for (const wid of ids) {
    const slot = slots[wid] || null;
    const winOpts = slot ? { ...opts, ...slot, slot } : opts;
    const hit = list.find(
      (w) => w && typeof w === "object" && String(w.windowId) === wid && windowIsSettled(w, winOpts)
    );
    if (hit) settled.push(wid);
    else pending.push(wid);
  }
  return { ok: pending.length === 0, settled, pending };
}

/**
 * Why a window fails in-slot (DEBUG). Names mode / mon / parent / ε rect.
 * @param {unknown} win
 * @param {{
 *   requireTile?: boolean,
 *   allowGrab?: boolean,
 *   monitor?: number,
 *   parentId?: string,
 *   parentLayout?: string,
 *   parentType?: string,
 *   slotRect?: object,
 *   epsilon?: number,
 *   slot?: object,
 * }} [opts]
 * @returns {string[]}
 */
export function windowSettleFailureReasons(win, opts = {}) {
  const reasons = [];
  if (!win || typeof win !== "object" || Array.isArray(win)) return ["missing"];
  if (win.windowId == null || String(win.windowId).trim() === "") reasons.push("no-id");

  const requireTile = opts.requireTile !== false;
  const allowGrab = opts.allowGrab !== false;
  if (requireTile) {
    const mode = win.mode != null ? String(win.mode) : "";
    const modes = allowGrab ? SETTLED_MODES_LOOSE : SETTLED_MODES;
    if (!mode || !modes.has(mode)) reasons.push(`mode=${mode || "none"}`);
  }
  if (!_rectIsReasonable(win.rect)) reasons.push("rect-invalid");

  const slot = _slotBag(opts);
  const wantMon = _firstDefined(opts.monitor, slot?.monitor);
  if (wantMon != null && wantMon !== "") {
    const want = Number(wantMon);
    const have = win.monitor != null ? Number(win.monitor) : NaN;
    if (!Number.isFinite(want) || want < 0) reasons.push("mon-target-invalid");
    else if (!Number.isFinite(have) || have !== want) {
      reasons.push(`mon=${Number.isFinite(have) ? have : "none"}→${want}`);
    }
  }

  const wantParentId = _firstDefined(opts.parentId, slot?.parentId);
  if (wantParentId != null && String(wantParentId).trim() !== "") {
    const have = win.parentId ?? win.parentPath ?? win.parent_path;
    if (have == null || String(have) !== String(wantParentId)) {
      reasons.push(`parent=${have != null ? have : "none"}→${wantParentId}`);
    }
  }

  const wantParentLayout = _firstDefined(opts.parentLayout, slot?.parentLayout);
  if (wantParentLayout != null && String(wantParentLayout).trim() !== "") {
    const have = String(win.parentLayout ?? win.parent_layout ?? "").toUpperCase();
    const want = String(wantParentLayout).toUpperCase();
    if (have !== want) reasons.push(`parentLayout=${have || "none"}→${want}`);
  }

  const wantParentType = _firstDefined(opts.parentType, slot?.parentType);
  if (wantParentType != null && String(wantParentType).trim() !== "") {
    const have = String(win.parentType ?? win.parent_type ?? "").toUpperCase();
    const want = String(wantParentType).toUpperCase();
    if (have !== want) reasons.push(`parentType=${have || "none"}→${want}`);
  }

  const wantRect = _firstDefined(opts.slotRect, slot?.slotRect, slot?.rect);
  if (wantRect != null && _fullRect(wantRect)) {
    if (!_fullRect(win.rect)) reasons.push("rect-ε(missing)");
    else {
      const eps = _firstDefined(opts.epsilon, slot?.epsilon, LAYOUT_VERIFY_EPSILON_PX);
      if (!rectsAgree(win.rect, wantRect, eps)) reasons.push("rect-ε");
    }
  }
  return reasons.length ? reasons : ["unsettled"];
}

/**
 * Sync run.rolePins to forest identity match (late place-hint adopt).
 * @param {object|null|undefined} run
 * @param {unknown} forest
 * @returns {{ changed: boolean, remaps: { role: string, from: string, to: string }[], pins: object }}
 */
export function syncRolePinsFromForest(run, forest) {
  const pins =
    run?.rolePins && typeof run.rolePins === "object" && !Array.isArray(run.rolePins)
      ? run.rolePins
      : {};
  const remaps = [];
  if (!run?.profile || !forest || typeof forest !== "object") {
    return { changed: false, remaps, pins };
  }
  let plan = null;
  try {
    plan = planReconcile(run.profile, forest, {
      ...(run.flags || {}),
      rolePins: pins,
      workspace: run.workspace ?? 0,
    });
  } catch {
    return { changed: false, remaps, pins };
  }
  if (!run.rolePins || typeof run.rolePins !== "object" || Array.isArray(run.rolePins)) {
    run.rolePins = pins;
  }
  let changed = false;
  for (const role of plan?.roles || []) {
    if (!role || role.id == null || role.windowId == null) continue;
    if (!isRequiredTileRole(role, run.profile)) continue;
    const rid = String(role.id);
    const wid = String(role.windowId);
    const prev = run.rolePins[rid];
    // Remap existing open/bind pins only — do not invent hard targets for every role.
    if (prev == null || String(prev).trim() === "") continue;
    if (String(prev) === wid) continue;
    remaps.push({ role: rid, from: String(prev), to: wid });
    run.rolePins[rid] = wid;
    changed = true;
  }
  return { changed, remaps, pins: run.rolePins, plan };
}

/**
 * @param {unknown} slot
 * @returns {number|null}
 */
export function desiredMonitorFromSlot(slot) {
  const s = String(slot || "").trim();
  if (!s) return null;
  if (s === "primary" || s.startsWith("primary.")) return 0;
  const m = /^mon(\d+)/.exec(s);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * FLOAT / ignore / non-tile roles are not required hard targets (D041).
 * @param {unknown} role
 * @param {unknown} [profile]
 * @returns {boolean}
 */
export function isRequiredTileRole(role, profile) {
  if (!role || typeof role !== "object" || Array.isArray(role)) return false;
  const mode = String(role.mode || "")
    .trim()
    .toLowerCase();
  if (mode === "float" || mode === "floating" || mode === "ignore") return false;
  const rid = role.id != null ? String(role.id).trim() : "";
  const floating = profile && Array.isArray(profile.floating) ? profile.floating : [];
  for (const cell of floating) {
    if (cell == null) continue;
    if (typeof cell === "string" && rid && cell === rid) return false;
    if (typeof cell === "object" && !Array.isArray(cell)) {
      const cid = cell.id != null ? String(cell.id) : cell.role != null ? String(cell.role) : "";
      if (rid && cid === rid) return false;
    }
  }
  return true;
}

/**
 * Live window → parent CON / mon / rect (planner IR forest).
 * @param {unknown} forest
 * @returns {Record<string, object>}
 */
export function windowSlotContextById(forest) {
  const out = {};
  const walk = (n, path, parentPath, parentLayout, parentType, monIdx) => {
    if (!n || typeof n !== "object" || Array.isArray(n)) return;
    const ntype = String(n.nodeType || n.type || "")
      .trim()
      .toUpperCase();
    const kids = Array.isArray(n.children)
      ? n.children
      : Array.isArray(n.childNodes)
      ? n.childNodes
      : [];
    let curMon = monIdx;
    if (ntype === "MONITOR") {
      const parsed = String(n.id || "");
      const mm = /^mo(\d+)/.exec(parsed);
      if (mm) curMon = parseInt(mm[1], 10);
    }
    if (ntype === "WINDOW") {
      const wid = n.windowId;
      if (wid == null || String(wid).trim() === "") return;
      const mon = n.monitor != null ? Number(n.monitor) : curMon;
      const parentId = parentPath != null && String(parentPath) !== "" ? String(parentPath) : "";
      out[String(wid)] = {
        windowId: String(wid),
        monitor: Number.isFinite(mon) ? mon : null,
        mode: n.mode,
        rect: n.rect || n.renderRect || null,
        parentPath: parentId,
        parentId,
        parentLayout: parentLayout != null ? String(parentLayout) : "",
        parentType: parentType != null ? String(parentType) : "",
        path: path != null ? String(path) : "",
        layoutRole: n.layoutRole != null ? String(n.layoutRole) : null,
      };
      return;
    }
    const monId = ntype === "MONITOR" ? n.id : null;
    const lay = n.layout;
    for (let i = 0; i < kids.length; i++) {
      let childPath;
      if (monId) childPath = `${monId}/${i}`;
      else if (path) childPath = `${path}/${i}`;
      else childPath = String(i);
      const nextParent = path ? path : monId;
      walk(kids[i], childPath, nextParent, lay, ntype, curMon);
    }
  };
  if (forest && typeof forest === "object" && !Array.isArray(forest)) {
    if (Array.isArray(forest.monitors)) {
      for (const m of forest.monitors) walk(m, "", null, null, null, null);
    } else {
      walk(forest, "", null, null, null, null);
    }
  } else if (Array.isArray(forest)) {
    for (const m of forest) walk(m, "", null, null, null, null);
  }
  return out;
}

/**
 * Meta/list windows plus forest parent CON fields (Meta mon/mode/rect win).
 * @param {unknown} windows
 * @param {unknown} forest
 * @returns {object[]}
 */
export function mergeWindowSlotContext(windows, forest) {
  const list = Array.isArray(windows) ? windows : [];
  const ctx = windowSlotContextById(forest);
  if (!Object.keys(ctx).length) return list.slice();
  return list.map((w) => {
    if (!w || typeof w !== "object") return w;
    const c = ctx[String(w.windowId)];
    if (!c) return w;
    return {
      ...c,
      ...w,
      parentPath: w.parentPath ?? w.parent_path ?? c.parentPath,
      parentId: w.parentId ?? c.parentId,
      parentLayout: w.parentLayout ?? w.parent_layout ?? c.parentLayout,
      parentType: w.parentType ?? w.parent_type ?? c.parentType,
    };
  });
}

function _slotGroupLayout(profile, slot) {
  const s = String(slot || "");
  const dot = s.indexOf(".");
  if (dot <= 0) return null;
  const monKey = s.slice(0, dot);
  const childId = s.slice(dot + 1).split(".")[0];
  const mon = profile?.layout?.[monKey];
  const children = mon && Array.isArray(mon.children) ? mon.children : [];
  for (const ch of children) {
    if (!ch || typeof ch !== "object") continue;
    if (String(ch.id || "") !== childId) continue;
    const lay = String(ch.layout || "")
      .trim()
      .toLowerCase();
    if (lay === "tabbed") return "TABBED";
    if (lay === "stacked") return "STACKED";
    return null;
  }
  return null;
}

function _buildSlotTarget(role, ctx, profile) {
  const wid = role.windowId != null ? String(role.windowId) : null;
  const live = wid ? ctx[wid] : null;
  const parentLayout = _slotGroupLayout(profile, role.slot);
  const target = {
    windowId: wid,
    slot: role.slot != null ? String(role.slot) : "",
    role: role.id != null ? String(role.id) : "",
    monitor: desiredMonitorFromSlot(role.slot),
  };
  if (parentLayout) {
    target.parentLayout = parentLayout;
    target.parentType = "CON";
  }
  if (live && _fullRect(live.rect)) target.slotRect = live.rect;
  return target;
}

function _roleByWindowId(run, forest) {
  const out = {};
  const pins = run?.rolePins && typeof run.rolePins === "object" ? run.rolePins : {};
  const profile = run?.profile;
  const roles = profile && Array.isArray(profile.roles) ? profile.roles : [];
  const byId = {};
  for (const r of roles) {
    if (r && r.id != null) byId[String(r.id)] = r;
  }
  for (const [role, wid] of Object.entries(pins)) {
    if (wid == null || String(wid).trim() === "") continue;
    const spec = byId[String(role)];
    if (spec) out[String(wid)] = { ...spec, windowId: wid };
  }
  if (!forest || !profile) return out;
  try {
    const plan = planReconcile(profile, forest, {
      ...(run.flags || {}),
      rolePins: run.rolePins,
      workspace: run.workspace ?? 0,
    });
    for (const r of plan.roles || []) {
      if (r.windowId == null) continue;
      out[String(r.windowId)] = r;
    }
  } catch {
    /* plan is optional context */
  }
  return out;
}

/**
 * In-slot targets for ApplyLayout hard-ready (pins + focus ids).
 * @param {object|null|undefined} run
 * @param {unknown} forest
 * @returns {{ ids: string[], slots: Record<string, object> }}
 */
export function collectHardReadySlotTargets(run, forest) {
  const ids = collectHardReadyWindowIds(run);
  const slots = {};
  if (!run?.profile || !ids.length) return { ids, slots };
  const ctx = windowSlotContextById(forest);
  const byWid = _roleByWindowId(run, forest);
  for (const id of ids) {
    const role = byWid[id];
    if (!role || !isRequiredTileRole(role, run.profile)) continue;
    slots[id] = _buildSlotTarget(role, ctx, run.profile);
  }
  return { ids, slots };
}

function _findWindow(windows, wid) {
  const id = String(wid);
  if (!Array.isArray(windows)) return null;
  return windows.find((w) => w && typeof w === "object" && String(w.windowId) === id) || null;
}

function _pushFailed(failed, name) {
  const s = name != null ? String(name).trim() : "";
  if (!s || failed.includes(s)) return;
  failed.push(s);
}

/**
 * Required TILE forest match (D041). FLOAT/ignore are not hard targets.
 * @param {{
 *   profile?: object,
 *   forest?: object,
 *   windows?: object[],
 *   rolePins?: object,
 *   flags?: object,
 *   workspace?: number,
 *   hardReady?: object,
 * }} [opts]
 * @returns {{ ok: boolean, failed: string[], settled: string[], pending: string[] }}
 */
export function matchRequiredTileSlots(opts = {}) {
  const failed = [];
  const settled = [];
  const pending = [];
  const profile = opts.profile;
  const forest = opts.forest;
  const hardReady = opts.hardReady;
  const windows = mergeWindowSlotContext(opts.windows, forest);
  const ctx = windowSlotContextById(forest);

  if (!profile || typeof profile !== "object") {
    return { ok: failed.length === 0, failed, settled, pending };
  }

  let plan = null;
  if (forest && typeof forest === "object") {
    try {
      plan = planReconcile(profile, forest, {
        ...(opts.flags || {}),
        rolePins: opts.rolePins,
        workspace: opts.workspace ?? 0,
      });
    } catch {
      plan = null;
    }
  }

  const currentRoleIds = new Set();
  for (const v of Object.values(opts.rolePins || {})) {
    if (v != null && String(v).trim() !== "") currentRoleIds.add(String(v));
  }
  for (const r of plan?.roles || []) {
    if (r?.windowId != null && String(r.windowId).trim() !== "") {
      currentRoleIds.add(String(r.windowId));
    }
  }

  if (
    hardReady &&
    hardReady.ok === false &&
    !hardReady.skipped &&
    !hardReady.cancelled &&
    (hardReady.timedOut || (Array.isArray(hardReady.pending) && hardReady.pending.length))
  ) {
    const byWid = _roleByWindowId({ profile, rolePins: opts.rolePins, flags: opts.flags }, forest);
    for (const id of hardReady.pending || []) {
      const sid = String(id);
      // Drop stale pre-adopt ids after rolePins remap to late-adopted windows.
      if (currentRoleIds.size && !currentRoleIds.has(sid)) continue;
      const role = byWid[sid];
      _pushFailed(failed, (role && role.slot) || `id:${sid}`);
      pending.push(sid);
    }
  }

  const roles = plan?.roles || [];
  for (const role of roles) {
    if (!isRequiredTileRole(role, profile)) continue;
    const slot = role.slot != null ? String(role.slot) : String(role.id || "");
    if (role.windowId == null) continue;
    const live = _findWindow(windows, role.windowId) || ctx[String(role.windowId)] || null;
    const target = _buildSlotTarget(role, ctx, profile);
    if (windowIsSettled(live, { ...target, slot: target })) {
      settled.push(String(role.windowId));
    } else {
      _pushFailed(failed, slot);
      pending.push(String(role.windowId));
    }
  }

  const claimedByMon = {};
  const onMonByMon = {};
  for (const role of roles) {
    if (!isRequiredTileRole(role, profile) || role.windowId == null) continue;
    const mon = desiredMonitorFromSlot(role.slot);
    if (mon == null) continue;
    if (!claimedByMon[mon]) claimedByMon[mon] = [];
    claimedByMon[mon].push(role);
    const live = _findWindow(windows, role.windowId) || ctx[String(role.windowId)] || null;
    const have = live && live.monitor != null ? Number(live.monitor) : NaN;
    if (Number.isFinite(have) && have === mon) {
      if (!onMonByMon[mon]) onMonByMon[mon] = [];
      onMonByMon[mon].push(role);
    }
  }
  for (const [monS, claimed] of Object.entries(claimedByMon)) {
    if (!claimed.length) continue;
    if ((onMonByMon[monS] || []).length === 0) {
      for (const role of claimed) _pushFailed(failed, role.slot);
    }
  }

  for (const mm of plan?.structureMismatches || []) {
    if (mm && mm.slot != null) _pushFailed(failed, mm.slot);
  }

  return { ok: failed.length === 0, failed, settled, pending };
}

/**
 * @param {unknown} action
 * @returns {string|null}
 */
export function focusActionWindowId(action) {
  if (!action || typeof action !== "object") return null;
  const sel = action.selector;
  if (sel != null) {
    const s = String(sel).trim();
    if (s.startsWith("id:")) {
      const wid = s.slice(3).trim();
      if (wid) return wid;
    }
  }
  if (action.windowId != null && String(action.windowId).trim() !== "") {
    return String(action.windowId).trim();
  }
  return null;
}

/**
 * @param {unknown} actions
 * @returns {object[]}
 */
export function focusActionsFromPlan(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      String(a.op || "")
        .trim()
        .toLowerCase() === "focus"
  );
}

/**
 * @param {unknown} actions
 * @returns {object[]}
 */
export function withoutFocusActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(
    (a) =>
      !(
        a &&
        typeof a === "object" &&
        String(a.op || "")
          .trim()
          .toLowerCase() === "focus"
      )
  );
}

/**
 * @param {unknown} forest
 * @returns {Record<string, string>}
 */
export function parentLastTabFocusByWindowId(forest) {
  const out = {};
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    const kids = Array.isArray(n.children)
      ? n.children
      : Array.isArray(n.childNodes)
      ? n.childNodes
      : [];
    const layout = String(n.layout || "")
      .trim()
      .toUpperCase();
    if (GROUP_LAYOUTS.has(layout)) {
      const ltf = n.lastTabFocusId;
      const ltfS = ltf != null && String(ltf).trim() !== "" ? String(ltf).trim() : "";
      for (const c of kids) {
        if (!c || typeof c !== "object") continue;
        const ntype = String(c.nodeType || c.type || "")
          .trim()
          .toUpperCase();
        if (ntype && ntype !== "WINDOW") continue;
        const wid = c.windowId;
        if (wid == null || String(wid).trim() === "") continue;
        out[String(wid)] = ltfS;
      }
    }
    for (const c of kids) walk(c);
  };
  if (forest && typeof forest === "object" && !Array.isArray(forest)) {
    if (Array.isArray(forest.monitors)) {
      for (const m of forest.monitors) walk(m);
    } else {
      walk(forest);
    }
  } else if (Array.isArray(forest)) {
    for (const m of forest) walk(m);
  }
  return out;
}

function _forestFocusWindowId(forest) {
  if (!forest || typeof forest !== "object" || Array.isArray(forest)) return "";
  let fw = forest.focusWindowId;
  if (fw == null && forest.meta && typeof forest.meta === "object") {
    fw = forest.meta.focusWindowId;
  }
  return fw != null && String(fw).trim() !== "" ? String(fw).trim() : "";
}

/**
 * Focus actions that did not stick (verify / soft check).
 * @param {unknown} forest
 * @param {unknown} focusActions
 * @returns {object[]}
 */
export function focusActionsStillNeeded(forest, focusActions) {
  if (!Array.isArray(focusActions) || !focusActions.length) return [];
  const parentLtf = parentLastTabFocusByWindowId(forest);
  const kbd = _forestFocusWindowId(forest);
  const needed = [];
  for (const a of focusActions) {
    if (!a || typeof a !== "object") continue;
    const wid = focusActionWindowId(a);
    if (wid == null) {
      needed.push(a);
      continue;
    }
    const reason = String(a.reason || "")
      .trim()
      .toLowerCase();
    if (reason === "active" || reason === "survivor") {
      if (!Object.prototype.hasOwnProperty.call(parentLtf, wid) || parentLtf[wid] !== wid) {
        needed.push(a);
      }
    } else if (reason === "profile") {
      if (kbd !== wid) needed.push(a);
    } else {
      needed.push(a);
    }
  }
  return needed;
}

/**
 * @param {unknown} steps
 * @returns {string[]}
 */
export function moveStepWindowIds(steps) {
  const out = [];
  if (!Array.isArray(steps)) return out;
  for (const s of steps) {
    if (!s || typeof s !== "object") continue;
    const op = String(s.op || "")
      .trim()
      .toLowerCase();
    if (op !== "move" && op !== "park") continue;
    const tile = s.tile != null ? s.tile : s.selector;
    if (tile == null) continue;
    const t = String(tile).trim();
    if (!t.startsWith("id:")) continue;
    const wid = t.slice(3).trim();
    if (wid && !out.includes(wid)) out.push(wid);
  }
  return out;
}

/**
 * @param {object|null|undefined} run
 * @returns {object[]}
 */
export function focusActionsFromRun(run) {
  const plan = run?.residualPlan || run?.structureBuilt?.plan;
  return focusActionsFromPlan(plan?.actions);
}

/**
 * Pin ids + focus targets that must be TILE/rect/mon before focus.
 * @param {object|null|undefined} run
 * @returns {string[]}
 */
export function collectHardReadyWindowIds(run) {
  const ids = [];
  const seen = new Set();
  const add = (w) => {
    if (w == null) return;
    const s = String(w).trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    ids.push(s);
  };
  const pins = run?.rolePins;
  if (pins && typeof pins === "object") {
    for (const v of Object.values(pins)) add(v);
  }
  for (const a of focusActionsFromRun(run)) add(focusActionWindowId(a));
  const focusSteps = run?.structureBuckets?.focus;
  if (Array.isArray(focusSteps)) {
    for (const s of focusSteps) add(focusActionWindowId(s));
  }
  return ids;
}

export function normalizeClass(wmClass) {
  if (wmClass == null) return "";
  return String(wmClass).trim().toLowerCase();
}

/**
 * @param {unknown} windows
 * @param {unknown} ids
 * @returns {string[]}
 */
export function wmClassesForWindowIds(windows, ids) {
  const want = new Set(_uniqueIds(ids));
  const out = [];
  const seen = new Set();
  if (!Array.isArray(windows) || !want.size) return ["unknown"];
  for (const w of windows) {
    if (!w || typeof w !== "object") continue;
    if (!want.has(String(w.windowId))) continue;
    const c = normalizeClass(w.wmClass != null ? w.wmClass : w.wm_class);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.length ? out : ["unknown"];
}

export function makeHeuristicsKey(host, wmClass, processKind, residualKind) {
  const h =
    String(host || "")
      .trim()
      .toLowerCase() || "unknown";
  const c = normalizeClass(wmClass) || "unknown";
  const pk =
    String(processKind || "")
      .trim()
      .toLowerCase() || "unknown";
  const rk =
    String(residualKind || "")
      .trim()
      .toLowerCase() || "unknown";
  return [h, c, pk, rk].join(_KEY_SEP);
}

export function parseHeuristicsKey(key) {
  const parts = String(key || "").split(_KEY_SEP);
  while (parts.length < 4) parts.push("");
  return {
    host: parts[0],
    class: parts[1],
    processKind: parts[2],
    residualKind: parts[3],
  };
}

export function emptyHeuristicsStore() {
  return { version: HEURISTICS_SCHEMA_VERSION, entries: {} };
}

export function emptyHeuristicsEntry(meta = {}) {
  return {
    host: String(meta.host || ""),
    class: normalizeClass(meta.wmClass != null ? meta.wmClass : meta.class),
    processKind: String(meta.processKind || "")
      .trim()
      .toLowerCase(),
    residualKind: String(meta.residualKind || "")
      .trim()
      .toLowerCase(),
    latenciesMs: [],
    trialCount: 0,
    zeroResidualCount: 0,
  };
}

export function softFloorMs(residualKind) {
  const rk = String(residualKind || "")
    .trim()
    .toLowerCase();
  return SOFT_FLOOR_MS[rk] != null ? SOFT_FLOOR_MS[rk] : 0;
}

export function softClampMs(residualKind) {
  const rk = String(residualKind || "")
    .trim()
    .toLowerCase();
  return SOFT_CLAMP_MS[rk] != null ? SOFT_CLAMP_MS[rk] : HARD_TIMEOUT_MS;
}

export function learningTrialSoftCapMs(residualKind) {
  const clamp = softClampMs(residualKind);
  return Math.min(LEARNING_TRIAL_SOFT_CAP_MS, Math.max(0, clamp * 2));
}

export function isFirstEverEntry(entry) {
  if (!entry || typeof entry !== "object") return true;
  return _nonNegInt(entry.trialCount, 0) <= 0;
}

export function recordHeuristicsTrial(entry, opts = {}) {
  if (!entry || typeof entry !== "object") return entry;
  entry.trialCount = _nonNegInt(entry.trialCount, 0) + 1;
  if (!opts.hadResidual) {
    entry.zeroResidualCount = _nonNegInt(entry.zeroResidualCount, 0) + 1;
    return entry;
  }
  const ms = _nonNegInt(opts.latencyMs, 0);
  const lats = lastRollingLatencies(entry.latenciesMs, 0);
  lats.push(ms);
  const n = opts.rollingN != null && opts.rollingN > 0 ? opts.rollingN : ROLLING_N;
  entry.latenciesMs = lats.slice(-n);
  return entry;
}

export function softTimeoutMs(entry, residualKind, opts = {}) {
  let rk = residualKind;
  if (rk == null && entry && typeof entry === "object") rk = entry.residualKind;
  const rkS =
    String(rk || "focus")
      .trim()
      .toLowerCase() || "focus";
  const floor = opts.floor != null ? Math.max(0, _nonNegInt(opts.floor, 0)) : softFloorMs(rkS);
  const clamp = opts.clamp != null ? Math.max(0, _nonNegInt(opts.clamp, 0)) : softClampMs(rkS);
  const pad = typeof opts.pad === "number" && opts.pad > 0 ? opts.pad : PAD;
  if (isFirstEverEntry(entry)) {
    const cap = learningTrialSoftCapMs(rkS);
    return Math.trunc(Math.min(Math.max(floor, cap), Math.max(clamp, cap)));
  }
  const lats = lastRollingLatencies(entry && entry.latenciesMs, opts.rollingN || ROLLING_N);
  return softTimeoutFromLatencies(lats, { pad, floor, clamp });
}

function _classProcessResidual(key) {
  const p = parseHeuristicsKey(key);
  return `${p.class}|${p.processKind}|${p.residualKind}`;
}

export function peerEntriesForKey(store, key) {
  const target = _classProcessResidual(key);
  const klass = parseHeuristicsKey(key).class;
  if (!klass || !key) return [];
  const entries = store && typeof store === "object" ? store.entries : null;
  if (!entries || typeof entries !== "object") return [];
  const out = [];
  for (const [k, ent] of Object.entries(entries)) {
    if (k === key || !ent || typeof ent !== "object") continue;
    if (_classProcessResidual(String(k)) !== target) continue;
    if (isFirstEverEntry(ent)) continue;
    out.push(ent);
  }
  return out;
}

export function softTimeoutForKey(store, key, residualKind) {
  const entries = store && typeof store === "object" ? store.entries : null;
  const entry = entries && key ? entries[key] : null;
  let rk = residualKind;
  if (rk == null) rk = parseHeuristicsKey(key).residualKind || "focus";
  const own = entry && typeof entry === "object" ? entry : null;
  if (!isFirstEverEntry(own)) return softTimeoutMs(own, rk);
  const peers = peerEntriesForKey(store, key);
  if (peers.length) return Math.max(...peers.map((p) => softTimeoutMs(p, rk)));
  return softTimeoutMs(own, rk);
}

export function resolveFocusSoftTimeoutMs(store, opts = {}) {
  const host = opts.host;
  const processKind = opts.processKind || "focus-phase";
  const residualKind = opts.residualKind || "focus";
  let classes = [];
  if (Array.isArray(opts.wmClasses)) {
    for (const c of opts.wmClasses) {
      const s = c != null ? String(c).trim() : "";
      if (s) classes.push(s);
    }
  } else if (opts.wmClasses != null && String(opts.wmClasses).trim()) {
    classes = [String(opts.wmClasses).trim()];
  }
  if (!classes.length) classes = ["unknown"];
  return Math.max(
    ...classes.map((c) =>
      softTimeoutForKey(store, makeHeuristicsKey(host, c, processKind, residualKind), residualKind)
    )
  );
}

export function softFocusWallMs(softTimeoutMsValue) {
  const st = Math.max(0, _nonNegInt(softTimeoutMsValue, 0));
  const raw = Math.max(st * SOFT_FOCUS_WALL_MULT, softClampMs("focus"));
  return Math.trunc(Math.min(SOFT_FOCUS_WALL_CAP_MS, Math.max(st, raw)));
}

/**
 * Parse on-disk heuristics JSON. Bad schema → empty (same as Python load_store).
 * @param {unknown} raw string or object
 * @returns {object}
 */
export function parseHeuristicsStore(raw) {
  let data = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return emptyHeuristicsStore();
    try {
      data = JSON.parse(s);
    } catch {
      return emptyHeuristicsStore();
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return emptyHeuristicsStore();
  if (_nonNegInt(data.version, -1) !== HEURISTICS_SCHEMA_VERSION) return emptyHeuristicsStore();
  const rawEntries = data.entries && typeof data.entries === "object" ? data.entries : {};
  const entries = {};
  for (const [k, v] of Object.entries(rawEntries)) {
    if (!k || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const meta = parseHeuristicsKey(k);
    const ent = emptyHeuristicsEntry({
      host: v.host != null ? v.host : meta.host,
      class: v.class != null ? v.class : meta.class,
      processKind: v.processKind != null ? v.processKind : meta.processKind,
      residualKind: v.residualKind != null ? v.residualKind : meta.residualKind,
    });
    ent.trialCount = _nonNegInt(v.trialCount, 0);
    ent.zeroResidualCount = _nonNegInt(v.zeroResidualCount, 0);
    ent.latenciesMs = lastRollingLatencies(v.latenciesMs, ROLLING_N);
    entries[k] = ent;
  }
  return { version: HEURISTICS_SCHEMA_VERSION, entries };
}

/**
 * Same keys as Python settle-heuristics.json (timings + class only).
 * @param {unknown} store
 * @returns {string}
 */
export function serializeHeuristicsStore(store) {
  const entries = {};
  const raw = store && typeof store === "object" ? store.entries : null;
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw).sort()) {
      const v = raw[k];
      if (!v || typeof v !== "object") continue;
      entries[k] = {
        class: normalizeClass(v.class),
        host: String(v.host || ""),
        latenciesMs: lastRollingLatencies(v.latenciesMs, ROLLING_N),
        processKind: String(v.processKind || "")
          .trim()
          .toLowerCase(),
        residualKind: String(v.residualKind || "")
          .trim()
          .toLowerCase(),
        trialCount: _nonNegInt(v.trialCount, 0),
        zeroResidualCount: _nonNegInt(v.zeroResidualCount, 0),
      };
    }
  }
  return `${JSON.stringify({ entries, version: HEURISTICS_SCHEMA_VERSION }, null, 2)}\n`;
}

export function heuristicsRelPath() {
  return `config/${HEURISTICS_FILENAME}`;
}

/**
 * @param {{ host?: string, hostname?: string, env?: Record<string, string|null|undefined> }} [opts]
 * @returns {string}
 */
export function resolveSettleHost(opts = {}) {
  const env = opts.env && typeof opts.env === "object" ? opts.env : {};
  const raw = env.FORGE_HOST;
  if (raw != null && String(raw).trim()) return String(raw).trim().toLowerCase();
  const name = opts.host != null ? opts.host : opts.hostname != null ? opts.hostname : "unknown";
  const short = String(name).split(".", 1)[0].trim().toLowerCase();
  return short || "unknown";
}

/**
 * In-memory heuristics session; I/O injected (no gi/fs).
 */
export class HeuristicsMemorySession {
  /**
   * @param {{
   *   read?: () => unknown,
   *   write?: (text: string, store: object) => void,
   * }} [opts]
   */
  constructor(opts = {}) {
    this._read = typeof opts.read === "function" ? opts.read : null;
    this._write = typeof opts.write === "function" ? opts.write : null;
    this._store = null;
    this._dirty = false;
  }

  get dirty() {
    return !!this._dirty;
  }

  get loaded() {
    return this._store != null;
  }

  ensureLoaded() {
    if (this._store) return this._store;
    let raw = null;
    try {
      raw = this._read ? this._read() : null;
    } catch {
      raw = null;
    }
    this._store = parseHeuristicsStore(raw);
    this._dirty = false;
    return this._store;
  }

  store() {
    return this.ensureLoaded();
  }

  record(opts = {}) {
    const st = this.ensureLoaded();
    const key = makeHeuristicsKey(opts.host, opts.wmClass, opts.processKind, opts.residualKind);
    if (!st.entries[key] || typeof st.entries[key] !== "object") {
      st.entries[key] = emptyHeuristicsEntry({
        host: opts.host,
        wmClass: opts.wmClass,
        processKind: opts.processKind,
        residualKind: opts.residualKind,
      });
    }
    recordHeuristicsTrial(st.entries[key], {
      hadResidual: !!opts.hadResidual,
      latencyMs: opts.latencyMs,
    });
    this._dirty = true;
    return st.entries[key];
  }

  flush() {
    if (this._store == null) return { persist: "skipped", reason: "not-loaded" };
    if (!this._dirty) return { persist: "skipped", reason: "clean" };
    if (!this._write) return { persist: "skipped", reason: "no-write" };
    try {
      this._write(serializeHeuristicsStore(this._store), this._store);
      this._dirty = false;
      return { persist: "ok" };
    } catch (e) {
      return { persist: "error", persistError: String(e?.message || e) };
    }
  }
}

function _clearTimer(id, cancel) {
  if (id == null || typeof cancel !== "function") return;
  try {
    cancel(id);
  } catch {
    /* */
  }
}

function _elapsed(nowMs, t0) {
  return Math.max(0, Math.trunc(nowMs() - t0));
}

/**
 * Hard-ready on Meta TILE/rect/mon signals. One timeout timer — no poll loop.
 * `windowIds` / slots may be live getters so late adopt remaps are honored.
 * @param {unknown|(() => unknown)} windowIds
 * @param {{
 *   loadWindows?: () => object[],
 *   onWindowEvent?: (cb: () => void) => (() => void)|null,
 *   schedule?: (ms: number, cb: () => void) => number|string,
 *   cancel?: (id: number|string) => void,
 *   isCancelled?: () => boolean,
 *   nowMs?: () => number,
 *   timeoutMs?: number,
 *   callStartedMs?: number,
 *   requireTile?: boolean,
 *   slots?: object|object[],
 *   getWindowIds?: () => unknown,
 *   getSlots?: () => object|object[],
 * }} opts
 * @param {(result: object) => void} done
 */
export function waitHardReadyOnSignals(windowIds, opts, done) {
  const nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
  const t0 = opts.callStartedMs != null ? Number(opts.callStartedMs) : nowMs();
  const timeoutMs = _nonNegInt(opts.timeoutMs, HARD_TIMEOUT_MS);
  const load = typeof opts.loadWindows === "function" ? opts.loadWindows : () => [];
  const requireTile = opts.requireTile !== false;
  const idsOf = () => {
    if (typeof opts.getWindowIds === "function") {
      try {
        return _uniqueIds(opts.getWindowIds());
      } catch {
        return [];
      }
    }
    if (typeof windowIds === "function") {
      try {
        return _uniqueIds(windowIds());
      } catch {
        return [];
      }
    }
    return _uniqueIds(windowIds);
  };
  const slotsOf = () => {
    if (typeof opts.getSlots === "function") {
      try {
        return opts.getSlots();
      } catch {
        return opts.slots;
      }
    }
    return opts.slots;
  };

  let finished = false;
  let timer = null;
  let unsub = null;

  const finish = (out) => {
    if (finished) return;
    finished = true;
    _clearTimer(timer, opts.cancel);
    timer = null;
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch {
        /* */
      }
    }
    unsub = null;
    done(out);
  };

  const statusOf = () => {
    if (typeof opts.isCancelled === "function" && opts.isCancelled()) {
      return { cancelled: true };
    }
    const ids = idsOf();
    if (!ids.length) {
      return { ok: true, settled: [], pending: [], skipped: true };
    }
    let wins = [];
    try {
      wins = load() || [];
    } catch (e) {
      return {
        ok: false,
        settled: [],
        pending: ids.slice(),
        error: String(e?.message || e),
      };
    }
    return hardReadyStatus(wins, ids, { requireTile, slots: slotsOf() });
  };

  const tick = (isTimeout) => {
    if (finished) return;
    const ids = idsOf();
    const st = statusOf();
    if (st.cancelled) {
      finish({
        ok: false,
        settled: [],
        pending: ids.slice(),
        elapsed_ms: _elapsed(nowMs, t0),
        hardTimeoutMs: timeoutMs,
        cancelled: true,
        error: "cancelled",
      });
      return;
    }
    if (st.ok) {
      finish({
        ok: true,
        settled: st.settled || ids.slice(),
        pending: [],
        elapsed_ms: _elapsed(nowMs, t0),
        hardTimeoutMs: timeoutMs,
        error: null,
        skipped: !!st.skipped,
      });
      return;
    }
    if (isTimeout) {
      const pending = st.pending || ids.slice();
      finish({
        ok: false,
        settled: st.settled || [],
        pending,
        elapsed_ms: _elapsed(nowMs, t0),
        hardTimeoutMs: timeoutMs,
        timedOut: true,
        error: st.error || `hard-ready timeout after ${timeoutMs}ms (pending ${pending})`,
      });
    }
  };

  tick(false);
  if (finished) return;

  if (typeof opts.onWindowEvent === "function") {
    try {
      unsub = opts.onWindowEvent(() => tick(false));
    } catch {
      unsub = null;
    }
  }
  if (typeof opts.schedule === "function") {
    timer = opts.schedule(timeoutMs, () => tick(true));
  }
}

/**
 * Soft focus barrier on steal/focus signals. Learned quiet; steal → correct + reset.
 * @param {{
 *   checkNeeded: () => object[]|object|null,
 *   applyCorrect: (needed: object[]) => void,
 *   restorePin?: () => boolean,
 *   onFocusEvent?: (cb: () => void) => (() => void)|null,
 *   schedule?: (ms: number, cb: () => void) => number|string,
 *   cancel?: (id: number|string) => void,
 *   isCancelled?: () => boolean,
 *   nowMs?: () => number,
 *   softTimeoutMs?: number,
 *   maxWallMs?: number,
 *   maxCorrections?: number,
 *   callStartedMs?: number,
 * }} opts
 * @param {(result: object) => void} done
 */
export function runSoftFocusBarrierOnSignals(opts, done) {
  const nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
  const softMs = Math.max(0, _nonNegInt(opts.softTimeoutMs, 0));
  const wallMs =
    opts.maxWallMs != null ? Math.max(0, _nonNegInt(opts.maxWallMs, 0)) : softFocusWallMs(softMs);
  const maxCorrections = opts.maxCorrections != null ? _nonNegInt(opts.maxCorrections, 32) : 32;
  const t0 = opts.callStartedMs != null ? Number(opts.callStartedMs) : nowMs();
  let lastAct = t0;
  let quietTimer = null;
  let wallTimer = null;
  let unsub = null;
  let finished = false;
  /** Ignore nested focus ticks while applyCorrect is running (sync reentry → max-32 burn). */
  let correcting = false;
  let corrections = 0;
  const residuals = [];

  const finish = (out) => {
    if (finished) return;
    finished = true;
    correcting = false;
    _clearTimer(quietTimer, opts.cancel);
    _clearTimer(wallTimer, opts.cancel);
    quietTimer = null;
    wallTimer = null;
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch {
        /* */
      }
    }
    unsub = null;
    done(out);
  };

  const neededOf = () => {
    if (typeof opts.isCancelled === "function" && opts.isCancelled()) {
      return { cancelled: true, needed: [] };
    }
    let raw;
    try {
      raw = opts.checkNeeded();
    } catch (e) {
      return { error: String(e?.message || e), needed: [] };
    }
    const needed = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return { needed };
  };

  const armQuiet = () => {
    _clearTimer(quietTimer, opts.cancel);
    quietTimer = null;
    const quietLeft = softMs - (nowMs() - lastAct);
    if (quietLeft <= 0) {
      const st = neededOf();
      if (st.cancelled) {
        finish({
          ok: false,
          softSettled: false,
          cancelled: true,
          corrections,
          residuals,
          elapsed_ms: _elapsed(nowMs, t0),
          softTimeoutMs: softMs,
          wallMs,
          error: "cancelled",
          pendingCount: 0,
        });
        return;
      }
      if (st.needed.length) {
        handleNeeded(st.needed, { fromQuiet: true });
        return;
      }
      finish({
        ok: true,
        softSettled: true,
        clean: true,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: null,
        pendingCount: 0,
      });
      return;
    }
    if (typeof opts.schedule !== "function") return;
    quietTimer = opts.schedule(quietLeft, () => {
      quietTimer = null;
      if (finished) return;
      const st = neededOf();
      if (st.cancelled) {
        finish({
          ok: false,
          softSettled: false,
          cancelled: true,
          corrections,
          residuals,
          elapsed_ms: _elapsed(nowMs, t0),
          softTimeoutMs: softMs,
          wallMs,
          error: "cancelled",
          pendingCount: 0,
        });
        return;
      }
      if (st.needed.length) {
        handleNeeded(st.needed, { fromQuiet: true });
        return;
      }
      finish({
        ok: true,
        softSettled: true,
        clean: true,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: null,
        pendingCount: 0,
      });
    });
  };

  const handleNeeded = (needed, optsNeeded = {}) => {
    if (finished || correcting) return;
    const now = nowMs();
    // Quiet expiry is "still wrong after softMs", not a Meta residual latency.
    // Learning softMs here poisons softTimeout → wall (soft×3) toward 9s+.
    if (!optsNeeded.fromQuiet) {
      residuals.push({
        latencyMs: Math.max(0, Math.trunc(now - lastAct)),
        neededCount: needed.length,
        elapsedFromCallMs: Math.max(0, Math.trunc(now - t0)),
      });
    }
    if (corrections >= maxCorrections) {
      finish({
        ok: false,
        softSettled: false,
        clean: false,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: `soft focus: max corrections (${maxCorrections})`,
        pendingCount: needed.length,
      });
      return;
    }
    correcting = true;
    try {
      if (typeof opts.restorePin === "function") {
        try {
          opts.restorePin();
        } catch {
          /* pin restore is best-effort; reveal still runs */
        }
      }
      opts.applyCorrect(needed);
    } catch (e) {
      correcting = false;
      finish({
        ok: false,
        softSettled: false,
        clean: false,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: `soft focus correct failed: ${e?.message || e}`,
        pendingCount: needed.length,
      });
      return;
    }
    correcting = false;
    if (finished) return;
    corrections += 1;
    lastAct = nowMs();
    armQuiet();
  };

  const tick = () => {
    if (finished || correcting) return;
    const st = neededOf();
    if (st.cancelled) {
      finish({
        ok: false,
        softSettled: false,
        cancelled: true,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: "cancelled",
        pendingCount: 0,
      });
      return;
    }
    if (st.needed.length) handleNeeded(st.needed);
    else armQuiet();
  };

  if (typeof opts.onFocusEvent === "function") {
    try {
      unsub = opts.onFocusEvent(() => tick());
    } catch {
      unsub = null;
    }
  }
  if (typeof opts.schedule === "function") {
    wallTimer = opts.schedule(wallMs, () => {
      wallTimer = null;
      if (finished) return;
      finish({
        ok: false,
        softSettled: false,
        clean: true,
        corrections,
        residuals,
        elapsed_ms: _elapsed(nowMs, t0),
        softTimeoutMs: softMs,
        wallMs,
        error: `soft focus wall timeout after ${wallMs}ms`,
        pendingCount: 0,
        timedOut: true,
      });
    });
  }
  tick();
}

/**
 * @param {unknown} windows
 * @returns {string}
 */
export function treeSettleFingerprint(windows) {
  const rows = [];
  if (!Array.isArray(windows)) return "";
  for (const w of windows) {
    if (!w || typeof w !== "object" || w.windowId == null) continue;
    const r = w.rect && typeof w.rect === "object" ? w.rect : {};
    rows.push(
      [
        String(w.windowId),
        String(w.mode || ""),
        String(w.monitor ?? ""),
        Math.round(Number(r.x) || 0),
        Math.round(Number(r.y) || 0),
        Math.round(Number(r.width) || 0),
        Math.round(Number(r.height) || 0),
      ].join(":")
    );
  }
  rows.sort();
  return rows.join("|");
}

/**
 * Opt-in LF6 fingerprint quiet on window signals (flags.waitTreeStable).
 * @param {{
 *   loadWindows?: () => object[],
 *   onWindowEvent?: (cb: () => void) => (() => void)|null,
 *   schedule?: (ms: number, cb: () => void) => number|string,
 *   cancel?: (id: number|string) => void,
 *   isCancelled?: () => boolean,
 *   nowMs?: () => number,
 *   timeoutMs?: number,
 *   samples?: number,
 *   callStartedMs?: number,
 * }} opts
 * @param {(result: object) => void} done
 */
export function waitTreeFingerprintQuietOnSignals(opts, done) {
  const nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
  const t0 = opts.callStartedMs != null ? Number(opts.callStartedMs) : nowMs();
  const timeoutMs = _nonNegInt(opts.timeoutMs, TREE_STABLE_TIMEOUT_MS);
  const need = Math.max(1, _nonNegInt(opts.samples, TREE_STABLE_SAMPLES));
  const load = typeof opts.loadWindows === "function" ? opts.loadWindows : () => [];
  let finished = false;
  let timer = null;
  let unsub = null;
  let last = null;
  let streak = 0;

  const finish = (out) => {
    if (finished) return;
    finished = true;
    _clearTimer(timer, opts.cancel);
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch {
        /* */
      }
    }
    done(out);
  };

  const tick = (isTimeout) => {
    if (finished) return;
    if (typeof opts.isCancelled === "function" && opts.isCancelled()) {
      finish({
        ok: false,
        cancelled: true,
        elapsed_ms: _elapsed(nowMs, t0),
        error: "cancelled",
      });
      return;
    }
    let fp = "";
    try {
      fp = treeSettleFingerprint(load() || []);
    } catch (e) {
      fp = `err:${e?.message || e}`;
    }
    if (fp === last) streak += 1;
    else {
      last = fp;
      streak = 1;
    }
    if (streak >= need) {
      finish({
        ok: true,
        stable: true,
        samples: streak,
        elapsed_ms: _elapsed(nowMs, t0),
        error: null,
      });
      return;
    }
    if (isTimeout) {
      finish({
        ok: false,
        stable: false,
        samples: streak,
        timedOut: true,
        elapsed_ms: _elapsed(nowMs, t0),
        error: `tree-stable timeout after ${timeoutMs}ms`,
      });
    }
  };

  tick(false);
  if (finished) return;
  if (typeof opts.onWindowEvent === "function") {
    try {
      unsub = opts.onWindowEvent(() => tick(false));
    } catch {
      unsub = null;
    }
  }
  if (typeof opts.schedule === "function") {
    timer = opts.schedule(timeoutMs, () => tick(true));
  }
}

/**
 * @param {{ forest: object, focusActions: object[], applyCorrect?: (needed: object[]) => object }} opts
 * @returns {{ ok: boolean, skipped: boolean, neededCount: number, corrected: boolean, error?: string }}
 */
export function verifyFocusOnce(opts) {
  const needed = focusActionsStillNeeded(opts.forest, opts.focusActions || []);
  if (!needed.length) {
    return { ok: true, skipped: true, neededCount: 0, corrected: false };
  }
  if (typeof opts.applyCorrect !== "function") {
    return {
      ok: false,
      skipped: false,
      neededCount: needed.length,
      corrected: false,
      error: "verify correct missing",
    };
  }
  try {
    const r = opts.applyCorrect(needed);
    if (r && r.ok === false) {
      return {
        ok: false,
        skipped: false,
        neededCount: needed.length,
        corrected: false,
        error: r.error || "verify correct failed",
      };
    }
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      neededCount: needed.length,
      corrected: false,
      error: String(e?.message || e),
    };
  }
  return { ok: true, skipped: false, neededCount: needed.length, corrected: true };
}

/**
 * Record soft residuals into the heuristics session (class keys only).
 * @param {HeuristicsMemorySession} session
 * @param {{ host: string, wmClasses: string[], residuals: object[], softSettled?: boolean }} rec
 */
export function recordSoftFocusHeuristics(session, rec) {
  if (!session) return;
  // Wall timeout / max-corrections must not train softTimeout (poison → 9s walls).
  if (!rec.softSettled) return;
  const classes =
    Array.isArray(rec.wmClasses) && rec.wmClasses.length ? rec.wmClasses : ["unknown"];
  const residuals = Array.isArray(rec.residuals) ? rec.residuals : [];
  if (residuals.length) {
    for (const res of residuals) {
      for (const cls of classes) {
        session.record({
          host: rec.host,
          wmClass: cls,
          processKind: "focus-phase",
          residualKind: "focus",
          hadResidual: true,
          latencyMs: res.latencyMs,
        });
      }
    }
    return;
  }
  for (const cls of classes) {
    session.record({
      host: rec.host,
      wmClass: cls,
      processKind: "focus-phase",
      residualKind: "focus",
      hadResidual: false,
    });
  }
}

/**
 * Windows list from an in-process forest snapshot (not DBus GetTree).
 * @param {object} forest
 * @returns {object[]}
 */
export function windowsFromForest(forest) {
  return collectWindows(forest || {});
}

export function applyFocusSteps(needed, runSteps, ctx = {}) {
  const steps = planActionsToSteps(needed || [], {
    workspace: ctx.workspace ?? 0,
    forceClose: !!ctx.forceClose,
  });
  const focusSteps = (Array.isArray(steps) ? steps : []).filter(
    (s) => s && String(s.op || "").toLowerCase() === "focus"
  );
  if (!focusSteps.length) return { ok: true, skipped: true, steps: 0 };
  if (typeof runSteps !== "function") return { ok: false, error: "runSteps missing" };
  const r = runSteps(focusSteps, { phase: ctx.phase || "focus", run: ctx.run });
  if (r && r.ok === false) return r;
  return { ok: true, steps: focusSteps.length };
}
