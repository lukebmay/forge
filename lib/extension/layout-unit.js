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
