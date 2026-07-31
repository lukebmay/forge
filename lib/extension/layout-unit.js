/*
 * Layout unit helpers — first-class container spine (I1).
 * Pure: no GObject / Mutter. Tree nodes are plain objects with .layout.
 */

/** Modes a CON may hold (not ROOT/PRESET). */
export const LAYOUT_MODES = Object.freeze(["HSPLIT", "VSPLIT", "TABBED", "STACKED"]);

/**
 * @param {string} layout
 * @returns {boolean}
 */
export function isLayoutMode(layout) {
  return LAYOUT_MODES.includes(layout);
}

/**
 * Change container layout mode only (invariant I1).
 *
 * Does **not** reparent, flatten nested CONs, or reset sibling percents.
 * Callers that need structure change must use explicit group/ungroup (C2).
 *
 * @param {{ layout?: string, lastTabFocus?: unknown }} con
 * @param {string} layout - HSPLIT | VSPLIT | TABBED | STACKED
 * @param {{ lastTabFocus?: unknown, clearLastTabFocus?: boolean }} [opts]
 * @returns {boolean} true if applied
 */
export function setLayout(con, layout, opts = {}) {
  if (!con || !isLayoutMode(layout)) return false;
  con.layout = layout;
  if (opts.clearLastTabFocus) {
    con.lastTabFocus = null;
  } else if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocus")) {
    con.lastTabFocus = opts.lastTabFocus;
  }
  return true;
}

/** Parents that must never be dissolved by ungroup. */
const STRUCTURAL_PARENTS = new Set(["MONITOR", "WORKSPACE", "ROOT"]);

/**
 * Whether `node` is a dissolve-able CON (not MONITOR/WORKSPACE/ROOT).
 * @param {{ nodeType?: string, isCon?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
export function isUngroupCon(node) {
  if (!node) return false;
  if (typeof node.isCon === "function") return !!node.isCon();
  return node.nodeType === "CON";
}

/**
 * Nearest CON ancestor of `node` that ungroup may dissolve (I2).
 * Walks parents only — `node` itself is never the target.
 * Returns null when the only structural parents are MONITOR/WORKSPACE/ROOT.
 *
 * @param {{ parentNode?: unknown }|null|undefined} node
 * @returns {object|null}
 */
export function resolveUngroupTarget(node) {
  if (!node) return null;
  let p = node.parentNode;
  while (p) {
    const type = p.nodeType;
    if (isUngroupCon(p)) return p;
    if (STRUCTURAL_PARENTS.has(type)) return null;
    if (typeof p.isMonitor === "function" && p.isMonitor()) return null;
    if (typeof p.isWorkspace === "function" && p.isWorkspace()) return null;
    if (typeof p.isRoot === "function" && p.isRoot()) return null;
    p = p.parentNode;
  }
  return null;
}
