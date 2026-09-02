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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Placeholder thrash / fail-open isolation (apply-contract AC4).
 *
 * One bad client never thrash-reapplies the forest: float it (if mapped) and
 * reserve its slot with a first-class placeholder TILE leaf. Closing the
 * placeholder drops the leaf and reflows once.
 *
 * No GObject imports — unit tests stay light. Tree/WM glue lives in tree.js /
 * window.js and calls these helpers.
 */

import { liveChildrenForPresent, liveParentForPresent } from "./tom-live.js";

/** Known class for real GTK helper or tree stub (GetTree / catalog). */
export const PLACEHOLDER_WM_CLASS = "forge-placeholder";

/** Window role / product id (not a profile app). */
export const PLACEHOLDER_ROLE = "forge-placeholder";

/** Default title for stub / future GTK chrome. */
export const PLACEHOLDER_TITLE = "Forge Placeholder Tile";

/** Layout commit reasons (spyable; never reassert/mismatch war). */
export const PLACEHOLDER_ISOLATE_LAYOUT_REASON = "thrash-isolate";
export const PLACEHOLDER_REMOVE_LAYOUT_REASON = "placeholder-remove";
export const PLACEHOLDER_FAILED_OPEN_LAYOUT_REASON = "failed-open-isolate";
export const PLACEHOLDER_SKELETON_LAYOUT_REASON = "layout-skeleton";
export const PLACEHOLDER_BIND_LAYOUT_REASON = "layout-bind";

/**
 * Encode slot+role into PH title when GetTree tags are unavailable (CT0 fallback).
 * @param {string} slot
 * @param {string} role
 * @returns {string}
 */
export function layoutPlaceholderTitle(slot, role) {
  const s = slot != null ? String(slot) : "";
  const r = role != null ? String(role) : "";
  return `forge-ph:${s}:${r}`;
}

/**
 * Parse forge-ph:slot:role title encoding.
 * @param {string|null|undefined} title
 * @returns {{ slot: string, role: string }|null}
 */
export function parseLayoutPlaceholderTitle(title) {
  if (title == null || typeof title !== "string") return null;
  const m = /^forge-ph:([^:]+):(.+)$/i.exec(title.trim());
  if (!m) return null;
  return { slot: m[1], role: m[2] };
}

let _stubSeq = 0;

/**
 * @returns {number}
 */
function nextStubSeq() {
  _stubSeq += 1;
  return _stubSeq;
}

/**
 * Reset stub id sequence (tests only).
 */
export function _resetPlaceholderStubSeqForTests() {
  _stubSeq = 0;
}

/**
 * Synthetic Meta-like value for tree-only placeholders (MVP). Future GTK
 * windows use the same wm_class / role and the same remove path.
 *
 * @param {{
 *   id?: string|number,
 *   title?: string,
 *   reason?: string|null,
 *   actor?: object|null,
 * }} [opts]
 * @returns {object}
 */
export function createPlaceholderStub(opts = {}) {
  const id = opts.id != null ? opts.id : `forge-ph-${nextStubSeq()}`;
  let title =
    opts.title != null && String(opts.title).length > 0 ? String(opts.title) : PLACEHOLDER_TITLE;
  const reason = opts.reason != null ? String(opts.reason) : null;
  const actor = opts.actor ?? null;
  const layoutSlot = opts.layoutSlot != null ? String(opts.layoutSlot) : null;
  const layoutRole = opts.layoutRole != null ? String(opts.layoutRole) : null;
  // Title fallback for CLI claim when GetTree omits layout* fields.
  if (
    (layoutSlot || layoutRole) &&
    (title === PLACEHOLDER_TITLE || !String(title).startsWith("forge-ph:"))
  ) {
    title = layoutPlaceholderTitle(layoutSlot || "", layoutRole || "");
  }

  // Minimal Meta.Window surface so accidental call sites (paint, processFloats,
  // decorations) do not TypeError mid-layout. Prefer isPlaceholderNode guards.
  const emptyRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
  return {
    _forgePlaceholder: true,
    id,
    wm_class: PLACEHOLDER_WM_CLASS,
    title,
    role: PLACEHOLDER_ROLE,
    _forgePlaceholderReason: reason,
    layoutSlot,
    layoutRole,
    minimized: false,
    firstRender: false,
    get_id: () => id,
    get_wm_class: () => PLACEHOLDER_WM_CLASS,
    get_title: () => title,
    get_wm_class_instance: () => PLACEHOLDER_WM_CLASS,
    get_pid: () => 0,
    get_monitor: () => -1,
    get_compositor_private: () => actor,
    get_frame_rect: emptyRect,
    get_buffer_rect: emptyRect,
    get_window_type: () => 0, // Meta.WindowType.NORMAL
    get_transient_for: () => null,
    get_maximized: () => 0,
    get_maximize_flags: () => 0,
    is_maximized: () => false,
    is_fullscreen: () => false,
    is_above: () => false,
    is_minimized: () => false,
    is_on_all_workspaces: () => false,
    is_always_on_all_workspaces: () => false,
    showing_on_its_workspace: () => true,
    allows_resize: () => false,
    allows_move: () => false,
    get_work_area_current_monitor: emptyRect,
    get_work_area_for_monitor: () => emptyRect(),
    // windowHomeReconcile / sameParentMonitor call get_workspace().
    get_workspace: () => ({
      index: () => 0,
      list_windows: () => [],
    }),
    make_above: () => {},
    unmake_above: () => {},
    raise: () => {},
    lower: () => {},
    focus: () => {},
    activate: () => {},
    delete: () => {},
    move_resize_frame: () => {},
    move_frame: () => {},
    unmaximize: () => {},
    maximize: () => {},
  };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlaceholderValue(value) {
  if (!value || typeof value !== "object") return false;
  // Finalized Meta wrappers throw on ANY property read — never throw here.
  try {
    if (value._forgePlaceholder === true) return true;
  } catch (_e) {
    return false;
  }
  try {
    const cls =
      typeof value.get_wm_class === "function"
        ? value.get_wm_class()
        : typeof value.wm_class === "string"
        ? value.wm_class
        : null;
    if (cls === PLACEHOLDER_WM_CLASS) return true;
  } catch (_e) {
    return false;
  }
  try {
    if (value.role === PLACEHOLDER_ROLE) return true;
  } catch (_e) {
    return false;
  }
  return false;
}

/**
 * @param {string|null|undefined} wmClass
 * @returns {boolean}
 */
export function isPlaceholderWmClass(wmClass) {
  return wmClass === PLACEHOLDER_WM_CLASS;
}

/**
 * First-class tree leaf: flag and/or known class/role.
 * @param {any} node
 * @returns {boolean}
 */
export function isPlaceholderNode(node) {
  if (!node) return false;
  try {
    if (node.placeholder === true) return true;
  } catch (_e) {
    return false;
  }
  let val = null;
  try {
    val = node.nodeValue ?? node._data ?? null;
  } catch (_e) {
    return false;
  }
  return isPlaceholderValue(val);
}

/**
 * Role/slot tags from a layout PH node (bag fields or forge-ph title).
 * @param {any} node
 * @returns {{ role: string|null, slot: string|null }}
 */
export function layoutPlaceholderTags(node) {
  if (!node) return { role: null, slot: null };
  let role = node.layoutRole ?? node.nodeValue?.layoutRole ?? null;
  let slot = node.layoutSlot ?? node.nodeValue?.layoutSlot ?? null;
  if ((!role || !slot) && node.nodeValue?.title) {
    const parsed = parseLayoutPlaceholderTitle(node.nodeValue.title);
    if (parsed) {
      role = role || parsed.role;
      slot = slot || parsed.slot;
    }
  }
  return {
    role: role != null && String(role).trim() !== "" ? String(role) : null,
    slot: slot != null && String(slot).trim() !== "" ? String(slot) : null,
  };
}

/**
 * True when PH role/slot is compatible with want (empty want → any tagged PH).
 * @param {any} node
 * @param {{ layoutRole?: string|null, layoutSlot?: string|null, wmClass?: string|null }} [want]
 * @returns {boolean}
 */
export function layoutPlaceholderMatchesWant(node, want = {}) {
  if (!isPlaceholderNode(node)) return false;
  const tags = layoutPlaceholderTags(node);
  const role =
    want.layoutRole != null && String(want.layoutRole).trim() !== ""
      ? String(want.layoutRole).trim()
      : null;
  const slot =
    want.layoutSlot != null && String(want.layoutSlot).trim() !== ""
      ? String(want.layoutSlot).trim()
      : null;
  const wm =
    want.wmClass != null && String(want.wmClass).trim() !== ""
      ? String(want.wmClass).trim()
      : null;
  if (!role && !slot && !wm) return !!(tags.role || tags.slot);
  if (role && tags.role && String(tags.role) === role) {
    if (!slot || !tags.slot || String(tags.slot) === slot) return true;
  }
  if (wm && tags.role) {
    const a = String(tags.role).toLowerCase();
    const b = wm.toLowerCase();
    if (a === b || b.endsWith("." + a) || a.endsWith("." + b)) {
      if (!slot || !tags.slot || String(tags.slot) === slot) return true;
    }
  }
  if (!role && !wm && slot && tags.slot && String(tags.slot) === slot) return true;
  return false;
}

/**
 * Layout PH sitting as a sibling of a real window (bind miss / already-in-slot).
 * @param {any} winNode
 * @param {{ layoutRole?: string|null, layoutSlot?: string|null, wmClass?: string|null }} [want]
 * @param {any} [wm] Forest-first parent/kids when seeded
 * @returns {any|null}
 */
export function findSiblingLayoutPlaceholder(winNode, want = {}, wm = null) {
  if (!winNode || isPlaceholderNode(winNode)) return null;
  const parent = (wm && liveParentForPresent(wm, winNode)) || winNode.parentNode;
  if (!parent) return null;
  let kids = wm ? liveChildrenForPresent(wm, parent) : null;
  if (!kids || !kids.length) {
    try {
      kids = parent.childNodes;
    } catch (_e) {
      kids = null;
    }
  }
  if (!kids || typeof kids[Symbol.iterator] !== "function") {
    try {
      kids = parent.children;
    } catch (_e2) {
      kids = null;
    }
  }
  if (!kids || typeof kids[Symbol.iterator] !== "function") return null;
  const filtered = [];
  for (const c of kids) {
    if (c && c !== winNode && isPlaceholderNode(c)) filtered.push(c);
  }
  if (!filtered.length) return null;
  const hasWant = !!(want.layoutRole || want.layoutSlot || want.wmClass);
  if (hasWant) {
    const hit = pickLayoutPlaceholder(filtered, want);
    if (hit) return hit;
    return filtered.find((n) => layoutPlaceholderMatchesWant(n, want)) || null;
  }
  return filtered[0];
}

/**
 * Pick a layout PH by role/slot. Role match wins when slot disagrees.
 * @param {any[]} nodes
 * @param {{ layoutRole?: string|null, layoutSlot?: string|null }} [want]
 * @returns {any|null}
 */
export function pickLayoutPlaceholder(nodes, want = {}) {
  const role = want.layoutRole != null ? String(want.layoutRole) : null;
  const slot = want.layoutSlot != null ? String(want.layoutSlot) : null;
  const list = Array.isArray(nodes) ? nodes : [];
  let roleOnly = null;
  let slotOnly = null;
  let anyTagged = null;
  for (const n of list) {
    if (!isPlaceholderNode(n)) continue;
    let nRole = n.layoutRole ?? n.nodeValue?.layoutRole ?? null;
    let nSlot = n.layoutSlot ?? n.nodeValue?.layoutSlot ?? null;
    if ((!nRole || !nSlot) && n.nodeValue?.title) {
      const parsed = parseLayoutPlaceholderTitle(n.nodeValue.title);
      if (parsed) {
        nRole = nRole || parsed.role;
        nSlot = nSlot || parsed.slot;
      }
    }
    if (!nRole && !nSlot) continue;
    anyTagged = anyTagged || n;
    if (role && nRole && String(nRole) === role) {
      if (!slot || !nSlot || String(nSlot) === slot) return n;
      if (!roleOnly) roleOnly = n;
    }
    if (!role && slot && nSlot && String(nSlot) === slot) {
      slotOnly = slotOnly || n;
    }
  }
  if (role) return roleOnly;
  if (slot) return slotOnly;
  return anyTagged;
}

/**
 * WINDOW lives from Tree + Forest liveById (D096 — GObject walk alone misses PH).
 * @param {any} wm
 * @param {any} [tree]
 * @returns {any[]}
 */
export function collectLiveWindowNodes(wm, tree = null) {
  const windows = [];
  const seen = new Set();
  const add = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    windows.push(n);
  };
  const t = tree || wm?.tree || null;
  // NODE_TYPES.WINDOW === "WINDOW"
  for (const n of t?.getNodeByType?.("WINDOW") || []) add(n);
  if (wm?.liveById instanceof Map) {
    for (const live of wm.liveById.values()) {
      if (!live) continue;
      const isWin =
        live.nodeType === "WINDOW" ||
        (typeof live.isWindow === "function" && live.isWindow());
      if (!isWin) continue;
      add(live);
    }
  }
  return windows;
}

/**
 * Forest-aware layout PH pick (role/slot). Same contract as session-api bind.
 * @param {any} wm
 * @param {{ layoutRole?: string|null, layoutSlot?: string|null, wmClass?: string|null }} [want]
 * @param {any} [tree]
 * @returns {any|null}
 */
export function findLiveLayoutPlaceholder(wm, want = {}, tree = null) {
  return pickLayoutPlaceholder(collectLiveWindowNodes(wm, tree), want);
}

/**
 * Placeholders must never be thrash-isolated or re-opened as profile apps.
 * @param {any} node
 * @returns {boolean}
 */
export function shouldSkipThrashIsolate(node) {
  return isPlaceholderNode(node);
}

/**
 * Whether apply() may call move_resize on this TILE leaf.
 * @param {any} node
 * @returns {boolean}
 */
export function shouldApplyPlaceholderMeta(node) {
  // Tree stubs and known class: no Meta geometry commit.
  return false;
}

/**
 * Mark a WINDOW node as placeholder (idempotent).
 * @param {any} node
 * @param {{ reason?: string|null }=} [opts]
 * @returns {any}
 */
export function markPlaceholderNode(node, opts = {}) {
  if (!node) return node;
  node.placeholder = true;
  if (opts.reason != null) node.placeholderReason = String(opts.reason);
  return node;
}

/**
 * Pure plan for thrash / fail-open isolation (no side effects).
 *
 * @param {{
 *   clientNode?: any|null,
 *   parentNode?: any|null,
 *   reason?: string|null,
 *   hasMappedClient?: boolean,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   floatClient: boolean,
 *   insertPlaceholder: boolean,
 *   layoutReason: string,
 *   percent: number,
 *   userSized: boolean,
 *   clientNode: any|null,
 *   parentNode: any|null,
 * }}
 */
export function planIsolateThrash(input = {}) {
  const clientNode = input.clientNode ?? null;
  const reason = input.reason != null ? String(input.reason) : "thrash";

  if (clientNode && shouldSkipThrashIsolate(clientNode)) {
    return {
      ok: false,
      reason: "is-placeholder",
      floatClient: false,
      insertPlaceholder: false,
      layoutReason: PLACEHOLDER_ISOLATE_LAYOUT_REASON,
      percent: 0,
      userSized: false,
      clientNode,
      parentNode: clientNode?.parentNode ?? input.parentNode ?? null,
    };
  }

  // Failed-open: no mapped client — parent must host the slot.
  if (!clientNode) {
    const parentNode = input.parentNode ?? null;
    if (!parentNode) {
      return {
        ok: false,
        reason: "no-parent",
        floatClient: false,
        insertPlaceholder: false,
        layoutReason: PLACEHOLDER_FAILED_OPEN_LAYOUT_REASON,
        percent: 0,
        userSized: false,
        clientNode: null,
        parentNode: null,
      };
    }
    return {
      ok: true,
      reason: reason || "failed-open",
      floatClient: false,
      insertPlaceholder: true,
      layoutReason: PLACEHOLDER_FAILED_OPEN_LAYOUT_REASON,
      percent: 0,
      userSized: false,
      clientNode: null,
      parentNode,
    };
  }

  const parentNode = clientNode.parentNode ?? input.parentNode ?? null;
  if (!parentNode) {
    return {
      ok: false,
      reason: "no-parent",
      floatClient: false,
      insertPlaceholder: false,
      layoutReason: PLACEHOLDER_ISOLATE_LAYOUT_REASON,
      percent: 0,
      userSized: false,
      clientNode,
      parentNode: null,
    };
  }

  const hasMapped =
    input.hasMappedClient != null
      ? !!input.hasMappedClient
      : !!(clientNode.nodeValue ?? clientNode._data);

  const percent = typeof clientNode.percent === "number" ? clientNode.percent : 0;
  const userSized = !!clientNode.userSized;

  return {
    ok: true,
    reason,
    floatClient: hasMapped,
    insertPlaceholder: true,
    layoutReason: PLACEHOLDER_ISOLATE_LAYOUT_REASON,
    percent,
    userSized,
    clientNode,
    parentNode,
  };
}

/**
 * Pure plan for remove placeholder → drop leaf + one reflow.
 *
 * @param {{ node?: any|null }} input
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   layoutReason: string,
 *   node: any|null,
 * }}
 */
export function planRemovePlaceholder(input = {}) {
  const node = input.node ?? null;
  if (!node) {
    return {
      ok: false,
      reason: "no-node",
      layoutReason: PLACEHOLDER_REMOVE_LAYOUT_REASON,
      node: null,
    };
  }
  if (!isPlaceholderNode(node)) {
    return {
      ok: false,
      reason: "not-placeholder",
      layoutReason: PLACEHOLDER_REMOVE_LAYOUT_REASON,
      node,
    };
  }
  return {
    ok: true,
    reason: "remove",
    layoutReason: PLACEHOLDER_REMOVE_LAYOUT_REASON,
    node,
  };
}

/**
 * Execute isolate with injectable deps (unit-testable without Shell).
 *
 * @param {{
 *   clientNode?: any|null,
 *   parentNode?: any|null,
 *   reason?: string|null,
 *   hasMappedClient?: boolean,
 *   floatMode?: string,
 * }} input
 * @param {{
 *   floatClient?: (node: any) => void,
 *   createPlaceholder: (opts: {
 *     parentNode: any,
 *     beforeNode?: any|null,
 *     percent: number,
 *     userSized: boolean,
 *     reason: string,
 *   }) => any,
 *   requestLayout: (reason: string) => void,
 *   clearEpoch?: (meta: any) => void,
 * }} deps
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   placeholder: any|null,
 *   clientNode: any|null,
 *   floated: boolean,
 *   layoutReason: string|null,
 *   layoutCalls: number,
 * }}
 */
export function executeIsolateThrash(input, deps) {
  const plan = planIsolateThrash(input);
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason,
      placeholder: null,
      clientNode: plan.clientNode,
      floated: false,
      layoutReason: null,
      layoutCalls: 0,
    };
  }

  if (
    !deps ||
    typeof deps.createPlaceholder !== "function" ||
    typeof deps.requestLayout !== "function"
  ) {
    return {
      ok: false,
      reason: "missing-deps",
      placeholder: null,
      clientNode: plan.clientNode,
      floated: false,
      layoutReason: null,
      layoutCalls: 0,
    };
  }

  let floated = false;
  if (plan.floatClient && plan.clientNode) {
    if (typeof deps.clearEpoch === "function") {
      try {
        deps.clearEpoch(plan.clientNode.nodeValue ?? plan.clientNode._data);
      } catch (_e) {
        // ignore
      }
    }
    if (typeof deps.floatClient === "function") {
      deps.floatClient(plan.clientNode);
    } else {
      // Default: mode only (no Meta float override).
      const mode = input.floatMode ?? "FLOAT";
      plan.clientNode.mode = mode;
    }
    floated = true;
  }

  const placeholder = deps.createPlaceholder({
    parentNode: plan.parentNode,
    beforeNode: plan.clientNode,
    percent: plan.percent,
    userSized: plan.userSized,
    reason: plan.reason,
  });

  if (placeholder) {
    markPlaceholderNode(placeholder, { reason: plan.reason });
  }

  deps.requestLayout(plan.layoutReason);

  return {
    ok: true,
    reason: plan.reason,
    placeholder,
    clientNode: plan.clientNode,
    floated,
    layoutReason: plan.layoutReason,
    layoutCalls: 1,
  };
}

/**
 * Execute remove with injectable deps.
 *
 * @param {{ node: any }} input
 * @param {{
 *   removeNode: (node: any) => void,
 *   requestLayout: (reason: string) => void,
 * }} deps
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   layoutReason: string|null,
 *   layoutCalls: number,
 * }}
 */
export function executeRemovePlaceholder(input, deps) {
  const plan = planRemovePlaceholder(input);
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason,
      layoutReason: null,
      layoutCalls: 0,
    };
  }
  if (!deps || typeof deps.removeNode !== "function" || typeof deps.requestLayout !== "function") {
    return {
      ok: false,
      reason: "missing-deps",
      layoutReason: null,
      layoutCalls: 0,
    };
  }

  deps.removeNode(plan.node);
  deps.requestLayout(plan.layoutReason);

  return {
    ok: true,
    reason: plan.reason,
    layoutReason: plan.layoutReason,
    layoutCalls: 1,
  };
}
