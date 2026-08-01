/*
 * Pure cheatsheet category map + within-group order (no GObject / Shell).
 */

/**
 * Prefix → English category id. First matching prefix wins; ids are gettext
 * msgids in the cheatsheet UI.
 *
 * Resize covers edge grow/shrink, dual-axis expand/shrink, golden, and
 * equalize (reset) — one mental model for tile-share ops.
 *
 * @returns {{ prefix: string, id: string }[]}
 */
export function cheatsheetCategoryDefs() {
  return [
    { prefix: "window-focus", id: "Focus" },
    { prefix: "window-swap", id: "Swap" },
    { prefix: "window-move", id: "Move" },
    { prefix: "window-resize", id: "Resize" },
    { prefix: "window-expand", id: "Resize" },
    { prefix: "window-shrink", id: "Resize" },
    { prefix: "window-golden", id: "Resize" },
    { prefix: "window-reset", id: "Resize" },
    { prefix: "window-snap", id: "Snap" },
    { prefix: "window-toggle", id: "Window Toggle" },
    { prefix: "window-gap", id: "Gaps" },
    { prefix: "window-pointer", id: "Pointer" },
    { prefix: "con-split", id: "Split" },
    { prefix: "con-stacked", id: "Stacked" },
    { prefix: "con-tabbed", id: "Tabbed" },
    { prefix: "workspace", id: "Workspace" },
    { prefix: "focus-border", id: "Appearance" },
    { prefix: "layout-debug", id: "Layout Debug" },
    { prefix: "prefs", id: "Preferences" },
  ];
}

/**
 * @param {string} key GSettings key name
 * @param {{ prefix: string, id: string }[]} [defs]
 * @returns {string | null} English category id, or null → Other
 */
export function resolveCategoryId(key, defs = cheatsheetCategoryDefs()) {
  for (const d of defs) {
    if (key.startsWith(d.prefix)) return d.id;
  }
  return null;
}

/**
 * Section order: first appearance of each id in the defs list.
 * @param {{ prefix: string, id: string }[]} [defs]
 * @returns {string[]}
 */
export function categoryDisplayOrder(defs = cheatsheetCategoryDefs()) {
  return [...new Set(defs.map((d) => d.id))];
}

/**
 * Within Resize: edges → expand → shrink → golden → reset (equalize).
 * @param {string} key
 * @returns {number}
 */
export function resizeSortRank(key) {
  if (key.startsWith("window-resize")) return 0;
  if (key.startsWith("window-expand")) return 1;
  if (key.startsWith("window-shrink")) return 2;
  if (key.startsWith("window-golden")) return 3;
  if (key.startsWith("window-reset")) return 4;
  return 5;
}

/**
 * Sort bindings that carry a `key` field. Non-Resize categories keep order.
 * @template {{ key: string }} T
 * @param {string} categoryId English category id (gettext msgid in UI)
 * @param {T[]} bindings
 * @returns {T[]}
 */
export function sortBindingsInCategory(categoryId, bindings) {
  if (categoryId !== "Resize") return bindings;

  return [...bindings].sort((a, b) => {
    const ra = resizeSortRank(a.key);
    const rb = resizeSortRank(b.key);
    if (ra !== rb) return ra - rb;
    return a.key.localeCompare(b.key);
  });
}
