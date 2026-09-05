/*
 * Pure cheatsheet layout / grouping (no gi). Overlay widgets stay in cheatsheet.js.
 */

export const OVERLAY_MONITOR_FRACTION = 0.9;
/** width/height below this → one column + scroll (portrait / tall). */
export const TALL_ASPECT_MAX = 0.85;
/** width/height at or above this → three columns (ultrawide). */
export const ULTRAWIDE_ASPECT_MIN = 2;
export const WINDOW_TOGGLE_FLOAT_KEY = "window-toggle-float";

/** Prefix/match order matches the overlay; English names are gettext sources. */
export const CHEATSHEET_CATEGORY_DEFS = [
  { prefix: "window-focus", name: "Focus" },
  { match: /^window-swap-(left|down|up|right)$/, name: "Join" },
  { prefix: "window-swap", name: "Swap" },
  { prefix: "window-move", name: "Move" },
  { prefix: "window-resize", name: "Resize" },
  { prefix: "window-snap", name: "Snap" },
  { prefix: "window-toggle", name: "Window Toggle" },
  { prefix: "window-gap", name: "Gaps" },
  { prefix: "window-reset", name: "Window Reset" },
  { prefix: "window-expand", name: "Window Size" },
  { prefix: "window-shrink", name: "Window Size" },
  { prefix: "window-golden", name: "Window Size" },
  { prefix: "window-pointer", name: "Pointer" },
  { prefix: "window-zoom", name: "Zoom" },
  { prefix: "con-split", name: "Split" },
  { prefix: "con-stacked", name: "Stacked" },
  { prefix: "con-tabbed", name: "Tabbed" },
  { prefix: "con-layout", name: "Layout" },
  { prefix: "size", name: "Size" },
  { prefix: "workspace", name: "Workspace" },
  { prefix: "focus-border", name: "Appearance" },
  { prefix: "layout-debug", name: "Layout Debug" },
  { prefix: "prefs", name: "Preferences" },
];

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number } | null | undefined} aabb
 * @returns {{ columns: number, maxWidth: number, maxHeight: number, aspect: number }}
 */
export function overlayLayoutForMonitor(aabb) {
  const width = Math.max(0, Number(aabb?.width) || 0);
  const height = Math.max(0, Number(aabb?.height) || 0);
  const aspect = height > 0 ? width / height : 1;
  let columns = 2;
  if (aspect < TALL_ASPECT_MAX) columns = 1;
  else if (aspect >= ULTRAWIDE_ASPECT_MIN) columns = 3;
  return {
    columns,
    maxWidth: Math.floor(width * OVERLAY_MONITOR_FRACTION),
    maxHeight: Math.floor(height * OVERLAY_MONITOR_FRACTION),
    aspect,
  };
}

/**
 * @param {{ width?: number, height?: number }} natural
 * @param {{ maxWidth?: number, maxHeight?: number }} max
 * @returns {{ width: number, height: number }}
 */
export function clampOverlaySize(natural, max) {
  const natW = Math.max(0, Number(natural?.width) || 0);
  const natH = Math.max(0, Number(natural?.height) || 0);
  const maxW = Math.max(0, Number(max?.maxWidth) || 0);
  const maxH = Math.max(0, Number(max?.maxHeight) || 0);
  return {
    width: Math.min(natW, maxW),
    height: Math.min(natH, maxH),
  };
}

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number }} aabb
 * @param {{ width?: number, height?: number }} size
 * @returns {{ x: number, y: number }}
 */
export function overlayPosition(aabb, size) {
  const ax = Number(aabb?.x) || 0;
  const ay = Number(aabb?.y) || 0;
  const aw = Number(aabb?.width) || 0;
  const ah = Number(aabb?.height) || 0;
  const w = Number(size?.width) || 0;
  const h = Number(size?.height) || 0;
  return {
    x: ax + Math.floor((aw - w) / 2),
    y: ay + Math.floor((ah - h) / 2),
  };
}

/**
 * @param {string} accelerator
 * @returns {string}
 */
export function formatCheatsheetShortcut(accelerator) {
  return String(accelerator ?? "")
    .replace(/<Super>/g, "Super+")
    .replace(/<Shift>/g, "Shift+")
    .replace(/<Ctrl>/g, "Ctrl+")
    .replace(/<Alt>/g, "Alt+")
    .replace(/<Primary>/g, "Ctrl+")
    .replace(/Left$/, "\u2190")
    .replace(/Right$/, "\u2192")
    .replace(/Up$/, "\u2191")
    .replace(/Down$/, "\u2193");
}

/**
 * @param {string} key
 * @returns {string}
 */
export function keyToCheatsheetDescription(key) {
  return String(key ?? "")
    .replace(/-/g, " ")
    .replace(/^(window|con|workspace|focus|prefs)\s+/, "")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * @param {Array<{ key: string, type?: string, shortcuts?: string[], summary?: string }>} items
 * @param {Array<{ prefix?: string, match?: RegExp, name: string }>} categories
 * @param {string} [otherName]
 * @returns {Array<[string, Array<{ key: string, shortcut: string, description: string }>]>}
 */
export function groupCheatsheetBindings(items, categories, otherName = "Other") {
  const groups = new Map();
  const cats = Array.isArray(categories) ? categories : [];

  for (const item of items ?? []) {
    if (!item || (item.type != null && item.type !== "as")) continue;
    const shortcuts = Array.isArray(item.shortcuts) ? item.shortcuts.filter(Boolean) : [];
    if (shortcuts.length === 0) continue;

    let categoryName = otherName;
    for (const cat of cats) {
      const hit = cat.match ? cat.match.test(item.key) : item.key.startsWith(cat.prefix);
      if (hit) {
        categoryName = cat.name;
        break;
      }
    }

    if (!groups.has(categoryName)) groups.set(categoryName, []);
    const summary = item.summary ? String(item.summary) : "";
    groups.get(categoryName).push({
      key: item.key,
      shortcut: shortcuts.map((s) => formatCheatsheetShortcut(s)).join(", "),
      description: summary || keyToCheatsheetDescription(item.key),
    });
  }

  const ordered = [];
  const categoryOrder = [...new Set([...cats.map((c) => c.name), otherName])];
  for (const catName of categoryOrder) {
    if (groups.has(catName)) ordered.push([catName, groups.get(catName)]);
  }
  return ordered;
}

/**
 * Greedy balance by header + row count.
 * @param {Array<[string, unknown[]]>} groups
 * @param {number} columnCount
 * @returns {Array<Array<[string, unknown[]]>>}
 */
export function splitGroupsIntoColumns(groups, columnCount) {
  const n = Math.max(1, Math.floor(Number(columnCount) || 1));
  const cols = Array.from({ length: n }, () => []);
  const counts = Array(n).fill(0);
  for (const group of groups ?? []) {
    const bindings = group?.[1];
    if (!Array.isArray(bindings) || bindings.length === 0) continue;
    let i = 0;
    for (let j = 1; j < n; j++) {
      if (counts[j] < counts[i]) i = j;
    }
    cols[i].push(group);
    counts[i] += bindings.length + 1;
  }
  return cols;
}

/**
 * Default: every section expanded. `firstN` expands only the first N names.
 * @param {string[]} sectionNames
 * @param {{ firstN?: number }} [opts]
 * @returns {Map<string, boolean>}
 */
export function initialSectionExpanded(sectionNames, opts = {}) {
  const firstN = opts.firstN == null ? Infinity : Number(opts.firstN);
  const map = new Map();
  const names = Array.isArray(sectionNames) ? sectionNames : [];
  for (let i = 0; i < names.length; i++) {
    map.set(names[i], i < firstN);
  }
  return map;
}

/**
 * @param {Map<string, boolean>} expandedMap
 * @param {string} name
 * @returns {Map<string, boolean>}
 */
export function toggleSectionExpanded(expandedMap, name) {
  const next = new Map(expandedMap ?? []);
  next.set(name, !next.get(name));
  return next;
}
