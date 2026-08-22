/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure layout math (sizes, gaps, split/stack rects). Tree thin-wraps; no St/GObject.
 * Env floor for mins uses GLib.getenv at the readWindowMinSize call site.
 */

import GLib from "gi://GLib";
import { Logger } from "../shared/logger.js";
import {
  FORGE_MIN_TILE_WIDTH,
  FORGE_MIN_TILE_HEIGHT,
  defaultMinTileSize,
} from "../shared/min-tile-size.js";

export {
  FORGE_MIN_TILE_WIDTH,
  FORGE_MIN_TILE_HEIGHT,
  DEFAULT_MIN_TILE_WIDTH,
  DEFAULT_MIN_TILE_HEIGHT,
  defaultMinTileSize,
} from "../shared/min-tile-size.js";

// Strings match tree.js createEnum values.
const HSPLIT = "HSPLIT";
const VSPLIT = "VSPLIT";
const STACKED = "STACKED";
const TABBED = "TABBED";
const HORIZONTAL = "HORIZONTAL";
const VERTICAL = "VERTICAL";
const GRAB_TILE = "GRAB_TILE";

/**
 * @param {string} layout
 * @returns {"HORIZONTAL"|"VERTICAL"|undefined}
 */
export function orientationFromLayout(layout) {
  switch (layout) {
    case HSPLIT:
    case TABBED:
      return HORIZONTAL;
    case VSPLIT:
    case STACKED:
      return VERTICAL;
    default:
      return undefined;
  }
}

/** Shrink work area by screen-edge margins. */
export function applyMargins(rect, margins = {}) {
  const marginTop = margins.top || 0;
  const marginBottom = margins.bottom || 0;
  const marginLeft = margins.left || 0;
  const marginRight = margins.right || 0;

  return {
    x: rect.x + marginLeft,
    y: rect.y + marginTop,
    width: rect.width - marginLeft - marginRight,
    height: rect.height - marginTop - marginBottom,
  };
}

/** Inset node rect by gap. Waydroid skips (non-standard frame extents). */
export function processGap(node, gap) {
  let nodeWidth = node.rect.width;
  let nodeHeight = node.rect.height;
  let nodeX = node.rect.x;
  let nodeY = node.rect.y;

  if (typeof node.isWindow === "function" && node.isWindow() && node.nodeValue) {
    const wmClass = node.nodeValue.get_wm_class?.();
    if (wmClass && wmClass.toLowerCase().includes("waydroid")) {
      return { x: nodeX, y: nodeY, width: nodeWidth, height: nodeHeight };
    }
  }

  if (nodeWidth > gap * 2 && nodeHeight > gap * 2) {
    nodeX += gap;
    nodeY += gap;
    nodeWidth -= gap * 2;
    nodeHeight -= gap * 2;
  }
  return { x: nodeX, y: nodeY, width: nodeWidth, height: nodeHeight };
}

/** Child rect for HSPLIT/VSPLIT at `index` from pixel sizes. */
export function splitChildRect(layout, nodeRect, sizes, index) {
  let nodeWidth;
  let nodeHeight;
  let nodeX;
  let nodeY;

  if (layout === HSPLIT) {
    nodeWidth = sizes[index];
    nodeHeight = nodeRect.height;
    nodeX = nodeRect.x;
    if (index != 0) {
      let i = 1;
      while (i <= index) {
        nodeX += sizes[i - 1];
        i++;
      }
    }
    nodeY = nodeRect.y;
  } else if (layout === VSPLIT) {
    nodeWidth = nodeRect.width;
    nodeHeight = sizes[index];
    nodeX = nodeRect.x;
    nodeY = nodeRect.y;
    if (index != 0) {
      let i = 1;
      while (i <= index) {
        nodeY += sizes[i - 1];
        i++;
      }
    }
  }

  return {
    x: nodeX,
    y: nodeY,
    width: nodeWidth,
    height: nodeHeight,
  };
}

/** Content vs bar Y anchors for stacked/tabbed chrome. */
export function decorationLayout(rectY, height, barSize, position) {
  if (position === "bottom") {
    return { contentY: rectY, decorationY: rectY + height - barSize };
  }
  return { contentY: rectY + barSize, decorationY: rectY };
}

/** STACKED content rect + total bar column height. */
export function stackedChildRect(nodeRect, stackedHeight, tiledCount, tabPosition) {
  const totalBars = stackedHeight * tiledCount;
  const cappedBars = Math.min(totalBars, Math.max(nodeRect.height - 1, 0));
  const { contentY } = decorationLayout(nodeRect.y, nodeRect.height, cappedBars, tabPosition);
  return {
    rect: {
      x: nodeRect.x,
      y: contentY,
      width: nodeRect.width,
      height: Math.max(nodeRect.height - cappedBars, 1),
    },
    totalBars,
    cappedBars,
  };
}

/**
 * Plan tab indices into rows.
 * maxPerLine <= 0 → one unlimited row; maxPerLine >= 1 → wrap after N.
 * @returns {{ rows: number[][], rowCount: number }}
 */
export function planTabRows(count, maxPerLine) {
  const n = Math.max(0, count | 0);
  if (n === 0) return { rows: [], rowCount: 0 };
  if (!maxPerLine || maxPerLine < 1) {
    return { rows: [Array.from({ length: n }, (_, i) => i)], rowCount: 1 };
  }
  const rows = [];
  for (let i = 0; i < n; i += maxPerLine) {
    const row = [];
    for (let j = i; j < Math.min(i + maxPerLine, n); j++) row.push(j);
    rows.push(row);
  }
  return { rows, rowCount: rows.length };
}

/** Readable min tab width; 0 when minChars === 0 (no chrome-only floor). */
export function minTabWidthFromChars(minChars, avgGlyphPx, chromePx) {
  const chars = Math.max(0, minChars | 0);
  if (chars === 0) return 0;
  const glyph = Math.max(0, Number(avgGlyphPx) || 0);
  const chrome = Math.max(0, Number(chromePx) || 0);
  return chars * glyph + chrome;
}

/**
 * Readable-fill wrap: width fit AND count cap, optional max-rows shrink.
 * @returns {{ rows: number[][], rowCount: number, perRow: number, capped: boolean }}
 */
export function planTabbedWrap({
  count = 0,
  rowInnerWidth = 0,
  minTabWidth = 0,
  maxPerLine = 0,
  maxRows = 0,
} = {}) {
  const n = Math.max(0, count | 0);
  if (n === 0) return { rows: [], rowCount: 0, perRow: 0, capped: false };

  const minW = Math.max(0, Number(minTabWidth) || 0);
  const width = Math.max(0, Number(rowInnerWidth) || 0);
  let fit = minW > 0 ? Math.max(1, Math.floor(width / minW)) : n;
  const lineCap = maxPerLine | 0;
  let perRow = lineCap >= 1 ? Math.min(fit, lineCap) : fit;
  if (perRow < 1) perRow = 1;

  let { rows, rowCount } = planTabRows(n, perRow);
  let capped = false;
  const rowCap = maxRows | 0;
  if (rowCap >= 1 && rowCount > rowCap) {
    perRow = Math.ceil(n / rowCap);
    ({ rows, rowCount } = planTabRows(n, perRow));
    capped = true;
  }
  return { rows, rowCount, perRow, capped };
}

/** Total tab bar height: rowCount × rowHeight (0 max → 1 row). */
export function tabbedBarHeight(rowHeight, count, maxPerLine) {
  const { rowCount } = planTabRows(count, maxPerLine);
  if (rowCount === 0 || !rowHeight) return 0;
  return rowHeight * rowCount;
}

/** TABBED content rect; barHeight is total chrome (one or more rows). */
export function tabbedChildRect(nodeRect, barHeight, tabPosition, showDecoration = true) {
  let nodeWidth = nodeRect.width;
  let nodeX = nodeRect.x;
  let nodeY = nodeRect.y;
  let nodeHeight = nodeRect.height;

  if (showDecoration) {
    ({ contentY: nodeY } = decorationLayout(nodeRect.y, nodeRect.height, barHeight, tabPosition));
    nodeHeight = Math.max(nodeRect.height - barHeight, 1);
  }

  return {
    x: nodeX,
    y: nodeY,
    width: nodeWidth,
    height: nodeHeight,
  };
}

/** Index of child with most room above min (Bug #330 remainder). */
export function mostShrinkableIndex(sizes, mins) {
  let best = 0;
  let bestSlack = -Infinity;
  for (let i = 0; i < sizes.length; i++) {
    const slack = sizes[i] - (mins[i] || 0);
    if (slack > bestSlack) {
      bestSlack = slack;
      best = i;
    }
  }
  return best;
}

/** Floor each child at min; shrink siblings for the deficit. Mutates `sizes`. */
export function redistributeForMinSizes(sizes, mins, minTotal, totalSize) {
  if (minTotal >= totalSize) {
    for (let i = 0; i < sizes.length; i++) {
      sizes[i] = Math.floor((mins[i] / minTotal) * totalSize);
    }
    return;
  }
  let deficit = 0;
  let slackTotal = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] < mins[i]) deficit += mins[i] - sizes[i];
    else slackTotal += sizes[i] - mins[i];
  }
  if (deficit === 0) return;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] < mins[i]) sizes[i] = mins[i];
  }
  if (slackTotal <= 0) return;
  // slackTotal always exceeds deficit here (totalSize - minTotal > 0).
  for (let i = 0; i < sizes.length && deficit > 0; i++) {
    const slack = sizes[i] - mins[i];
    if (slack <= 0) continue;
    const take = Math.min(slack, Math.round((deficit * slack) / slackTotal));
    sizes[i] -= take;
  }
}

/** Session floors by wm_class when Mutter does not expose hints (Wayland/46). */
const _classMinFloor = new Map();

/** Optional persist hook: (map) => void. Set by WM enable. */
let _classMinFloorPersist = null;

/** Absurd learn / persist caps — half-pane frames must not become mins. */
export const CLASS_MIN_ABSURD_W = 800;
export const CLASS_MIN_ABSURD_H = 600;

/**
 * @param {string|null|undefined} wmClass
 * @returns {{ width: number, height: number }}
 */
export function classMinFloor(wmClass) {
  if (!wmClass) return { width: 0, height: 0 };
  const prev = _classMinFloor.get(String(wmClass));
  return prev ? { width: prev.width || 0, height: prev.height || 0 } : { width: 0, height: 0 };
}

/**
 * @param {string|null|undefined} wmClass
 * @param {number} width
 * @param {number} height
 * @param {{ lower?: boolean, silent?: boolean }} [opts]
 */
export function rememberClassMin(wmClass, width, height, opts = {}) {
  if (!wmClass) return;
  const key = String(wmClass);
  const prev = _classMinFloor.get(key) || { width: 0, height: 0 };
  const w = Number(width);
  const h = Number(height);
  const lower = !!opts.lower;
  const nextW =
    Number.isFinite(w) && w > 0 && w <= CLASS_MIN_ABSURD_W
      ? lower
        ? prev.width > 0
          ? Math.min(prev.width, w)
          : w
        : Math.max(prev.width || 0, w)
      : prev.width || 0;
  const nextH =
    Number.isFinite(h) && h > 0 && h <= CLASS_MIN_ABSURD_H
      ? lower
        ? prev.height > 0
          ? Math.min(prev.height, h)
          : h
        : Math.max(prev.height || 0, h)
      : prev.height || 0;
  if (nextW === (prev.width || 0) && nextH === (prev.height || 0)) return;
  _classMinFloor.set(key, { width: nextW, height: nextH });
  if (opts.silent) return;
  try {
    _classMinFloorPersist?.(_exportClassMinFloorRaw());
  } catch (_e) {
    /* ignore */
  }
}

/**
 * Accepted forge resize below a poisoned floor — ratchet known + class down.
 * @param {any} meta
 * @param {{ width?: number, height?: number }|null} frame
 */
export function acceptWindowSizeBelowFloor(meta, frame) {
  if (!meta || !frame) return;
  const fw = Number(frame.width);
  const fh = Number(frame.height);
  if (Number.isFinite(fw) && fw > 0 && fw <= CLASS_MIN_ABSURD_W) {
    if ((Number(meta._forgeKnownMinW) || 0) > fw) meta._forgeKnownMinW = fw;
  }
  if (Number.isFinite(fh) && fh > 0 && fh <= CLASS_MIN_ABSURD_H) {
    if ((Number(meta._forgeKnownMinH) || 0) > fh) meta._forgeKnownMinH = fh;
  }
  const cls = _wmClassOf(meta);
  if (!cls) return;
  const floor = classMinFloor(cls);
  const needLower =
    (Number.isFinite(fw) && fw > 0 && floor.width > fw) ||
    (Number.isFinite(fh) && fh > 0 && floor.height > fh);
  if (!needLower) return;
  rememberClassMin(cls, fw > 0 ? fw : floor.width || 0, fh > 0 ? fh : floor.height || 0, {
    lower: true,
  });
}

/** @param {(map: Record<string, { width: number, height: number }>) => void} [fn] */
export function setClassMinFloorPersist(fn) {
  _classMinFloorPersist = typeof fn === "function" ? fn : null;
}

function _capFloorDims(width, height) {
  const w = Number(width);
  const h = Number(height);
  return {
    width: Number.isFinite(w) && w > 0 && w <= CLASS_MIN_ABSURD_W ? w : 0,
    height: Number.isFinite(h) && h > 0 && h <= CLASS_MIN_ABSURD_H ? h : 0,
  };
}

function _exportClassMinFloorRaw() {
  /** @type {Record<string, { width: number, height: number }>} */
  const out = {};
  for (const [k, v] of _classMinFloor) {
    const c = _capFloorDims(v?.width, v?.height);
    if (c.width > 0 || c.height > 0) out[k] = c;
  }
  return out;
}

/** @returns {Record<string, { width: number, height: number }>} */
export function exportClassMinFloor() {
  return _exportClassMinFloorRaw();
}

/**
 * Merge persisted / test floors into the session map (raise-only).
 * @param {Record<string, { width?: number, height?: number }>|null|undefined} classes
 */
export function loadClassMinFloor(classes) {
  if (!classes || typeof classes !== "object") return;
  for (const [k, v] of Object.entries(classes)) {
    if (!k || !v) continue;
    const c = _capFloorDims(v.width, v.height);
    if (c.width > 0 || c.height > 0) rememberClassMin(k, c.width, c.height, { silent: true });
  }
}

/** Parse window-mins.json text. Null if invalid. */
export function parseWindowMinsJson(text) {
  try {
    const o = JSON.parse(String(text || ""));
    if (!o || typeof o !== "object") return null;
    const classes = o.classes && typeof o.classes === "object" ? o.classes : o;
    if (!classes || typeof classes !== "object") return null;
    /** @type {Record<string, { width: number, height: number }>} */
    const out = {};
    for (const [k, v] of Object.entries(classes)) {
      if (!k || !v || typeof v !== "object") continue;
      const c = _capFloorDims(v.width, v.height);
      if (c.width > 0 || c.height > 0) out[k] = c;
    }
    return out;
  } catch (_e) {
    return null;
  }
}

/** @internal tests only */
export function clearClassMinFloorForTests() {
  _classMinFloor.clear();
  _classMinFloorPersist = null;
}

function _wmClassOf(meta) {
  try {
    if (typeof meta?.get_wm_class === "function") return meta.get_wm_class() || null;
  } catch (_e) {
    /* ignore */
  }
  return meta?.wm_class || null;
}

/**
 * Client min size: hints ∪ known ∪ class ∪ env floor (never below floor).
 * @param {any} meta Meta.Window-like
 * @param {{ env?: Record<string, string | null | undefined> }} [opts] inject env in tests
 * @returns {{ width: number, height: number }}
 */
export function readWindowMinSize(meta, opts = {}) {
  const envFloor = defaultMinTileSize({
    env: opts.env ?? {
      [FORGE_MIN_TILE_WIDTH]: GLib.getenv(FORGE_MIN_TILE_WIDTH),
      [FORGE_MIN_TILE_HEIGHT]: GLib.getenv(FORGE_MIN_TILE_HEIGHT),
    },
  });
  if (!meta) return { width: envFloor.width, height: envFloor.height };
  let width = 0;
  let height = 0;
  try {
    const hints = meta.get_size_hints?.();
    if (hints) {
      const mw = Number(hints.min_width);
      const mh = Number(hints.min_height);
      if (Number.isFinite(mw) && mw > 0) width = mw;
      if (Number.isFinite(mh) && mh > 0) height = mh;
    }
  } catch (_e) {
    // ignore
  }
  if ((!width || !height) && typeof meta.get_min_size === "function") {
    try {
      const r = meta.get_min_size();
      // GJS may return [ok, w, h] or {0:ok,1:w,2:h}
      let w = 0;
      let h = 0;
      if (Array.isArray(r)) {
        if (r.length >= 3 && r[0]) {
          w = Number(r[1]);
          h = Number(r[2]);
        } else if (r.length === 2) {
          w = Number(r[0]);
          h = Number(r[1]);
        }
      } else if (r && typeof r === "object") {
        w = Number(r.width ?? r[1]);
        h = Number(r.height ?? r[2]);
      }
      if (!width && Number.isFinite(w) && w > 0) width = w;
      if (!height && Number.isFinite(h) && h > 0) height = h;
    } catch (_e) {
      // ignore
    }
  }
  let knownW = Number(meta._forgeKnownMinW);
  let knownH = Number(meta._forgeKnownMinH);
  // Drop absurd learns (pre-delay size-changed raced with a large frame).
  if (Number.isFinite(knownW) && knownW > CLASS_MIN_ABSURD_W) {
    delete meta._forgeKnownMinW;
    knownW = 0;
  }
  if (Number.isFinite(knownH) && knownH > CLASS_MIN_ABSURD_H) {
    delete meta._forgeKnownMinH;
    knownH = 0;
  }
  if (!width && Number.isFinite(knownW) && knownW > 0) width = knownW;
  if (!height && Number.isFinite(knownH) && knownH > 0) height = knownH;
  if (!width || !height) {
    const classFloor = classMinFloor(_wmClassOf(meta));
    if (!width && classFloor.width > 0) width = classFloor.width;
    if (!height && classFloor.height > 0) height = classFloor.height;
  }
  return {
    width: Math.max(width > 0 ? width : 0, envFloor.width),
    height: Math.max(height > 0 ? height : 0, envFloor.height),
  };
}

/** Ignore size-changed races right after move_resize (ms). Wayland often needs longer. */
export const MIN_CLAMP_LEARN_DELAY_MS = 100;
/** Extra settle before learning a raise on Wayland (async clamp). */
export const MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS = 180;

/**
 * Learn mins when the client refuses a smaller move_resize.
 * `requested` should include `{ width, height, at, priorW, priorH }` from move().
 * @param {any} meta
 * @param {{ width?: number, height?: number, at?: number, priorW?: number, priorH?: number }|null} requested
 * @param {{ width?: number, height?: number }|null} frame
 * @param {number} [eps=4]
 * @param {number} [nowMs]
 */
export function noteWindowMinFromClamp(meta, requested, frame, eps = 4, nowMs = Date.now()) {
  if (!meta || !requested || !frame) return;
  const rw = Number(requested.width);
  const rh = Number(requested.height);
  const fw = Number(frame.width);
  const fh = Number(frame.height);
  const at = Number(requested.at) || 0;
  if (at > 0 && nowMs - at < MIN_CLAMP_LEARN_DELAY_MS) return;

  // Accepted request → known min cannot exceed this frame (clears poison).
  if (Number.isFinite(rw) && Number.isFinite(fw) && Math.abs(fw - rw) <= eps) {
    acceptWindowSizeBelowFloor(meta, frame);
  } else if (Number.isFinite(rw) && Number.isFinite(fw) && fw > rw + eps) {
    const pw = Number(requested.priorW);
    // Still glued to prior → resize not applied yet; do not learn prior as min.
    if (!Number.isFinite(pw) || Math.abs(fw - pw) <= eps) {
      Logger.debug(
        `min-learn skip axis=w reason=${
          !Number.isFinite(pw) ? "no-prior" : "glued-to-prior"
        } fw=${fw} rw=${rw} pw=${Number.isFinite(pw) ? pw : "-"}`
      );
    } else if (fw >= pw - eps) {
      Logger.debug(`min-learn skip axis=w reason=grew-or-flat fw=${fw} pw=${pw} rw=${rw}`);
    } else if (fw > CLASS_MIN_ABSURD_W) {
      Logger.debug(`min-learn skip axis=w reason=absurd fw=${fw} cap=${CLASS_MIN_ABSURD_W}`);
    } else if (fw <= CLASS_MIN_ABSURD_W && fw > rw + eps) {
      // Frame settled strictly between request and prior → real clamp.
      meta._forgeKnownMinW = Math.max(Number(meta._forgeKnownMinW) || 0, fw);
      Logger.trace(`min-learn axis=w fw=${fw} rw=${rw} pw=${pw}`);
    }
  }

  if (Number.isFinite(rh) && Number.isFinite(fh) && Math.abs(fh - rh) <= eps) {
    acceptWindowSizeBelowFloor(meta, frame);
  } else if (Number.isFinite(rh) && Number.isFinite(fh) && fh > rh + eps) {
    const ph = Number(requested.priorH);
    if (!Number.isFinite(ph) || Math.abs(fh - ph) <= eps) {
      Logger.debug(
        `min-learn skip axis=h reason=${
          !Number.isFinite(ph) ? "no-prior" : "glued-to-prior"
        } fh=${fh} rh=${rh} ph=${Number.isFinite(ph) ? ph : "-"}`
      );
    } else if (fh >= ph - eps) {
      Logger.debug(`min-learn skip axis=h reason=grew-or-flat fh=${fh} ph=${ph} rh=${rh}`);
    } else if (fh > CLASS_MIN_ABSURD_H) {
      Logger.debug(`min-learn skip axis=h reason=absurd fh=${fh} cap=${CLASS_MIN_ABSURD_H}`);
    } else if (fh <= CLASS_MIN_ABSURD_H && fh > rh + eps) {
      meta._forgeKnownMinH = Math.max(Number(meta._forgeKnownMinH) || 0, fh);
      Logger.trace(`min-learn axis=h fh=${fh} rh=${rh} ph=${ph}`);
    }
  }

  const knownW = Number(meta._forgeKnownMinW) || 0;
  const knownH = Number(meta._forgeKnownMinH) || 0;
  if (knownW > 0 || knownH > 0) {
    rememberClassMin(_wmClassOf(meta), knownW, knownH);
  }
}

/** Min size along orientation (CON: sum on-axis, else max). */
export function minSizeInOrientation(node, orientation, getTiledChildren) {
  if (typeof node.isWindow === "function" && node.isWindow()) {
    if (!node.nodeValue) return 0;
    const { width, height } = readWindowMinSize(node.nodeValue);
    const min = orientation === HORIZONTAL ? width : height;
    return min > 0 ? min : 0;
  }
  if (typeof node.isCon === "function" && node.isCon()) {
    const children = getTiledChildren(node.childNodes);
    if (children.length === 0) return 0;
    const mins = children.map((child) =>
      minSizeInOrientation(child, orientation, getTiledChildren)
    );
    const sideBySide =
      (node.layout === HSPLIT || node.layout === VSPLIT) &&
      orientationFromLayout(node.layout) === orientation;
    return sideBySide ? mins.reduce((a, b) => a + b, 0) : mins.reduce((a, b) => Math.max(a, b), 0);
  }
  return 0;
}

/** Percent → pixel sizes; min redistrib; remainder; effective-percent write-back. */
export function computeSizes(node, childItems, getTiledChildren, opts = {}) {
  let sizes = [];
  let orientation = orientationFromLayout(node.layout);
  let totalSize = orientation === HORIZONTAL ? node.rect.width : node.rect.height;
  let grabTiled =
    typeof node.getNodeByMode === "function" ? node.getNodeByMode(GRAB_TILE).length > 0 : false;

  childItems.forEach((childNode, index) => {
    let percent =
      childNode.percent && childNode.percent > 0.0 && !grabTiled
        ? childNode.percent
        : 1.0 / childItems.length;
    sizes[index] = Math.floor(percent * totalSize);
  });

  // Skip min-size during grab.
  const isSplit = node.layout === HSPLIT || node.layout === VSPLIT;
  let mins = [];
  let minTotal = 0;
  if (isSplit && !grabTiled) {
    mins = childItems.map((childNode) =>
      minSizeInOrientation(childNode, orientation, getTiledChildren)
    );
    minTotal = mins.reduce((a, b) => a + b, 0);
    if (minTotal > 0) {
      redistributeForMinSizes(sizes, mins, minTotal, totalSize);
    }
  }

  // Remainder: most-shrinkable when mins active, else last.
  let totalAllocated = sizes.reduce((a, b) => a + b, 0);
  if (totalAllocated !== totalSize) {
    let foldIndex = minTotal > 0 ? mostShrinkableIndex(sizes, mins) : sizes.length - 1;
    sizes[foldIndex] += totalSize - totalAllocated;
  }

  // Store effective percents after min paint; do not set userSized.
  // Skip write-back when any sibling is userSized — keep intentional shares
  // (min paint still uses adjusted sizes; only stored percent is preserved).
  // Mid-batch layout apply paints an incomplete forest (deferred FLOAT) —
  // do not persist those automatic percents (R024 / green first apply).
  if (!opts.skipWriteBack && isSplit && !grabTiled && minTotal > 0 && totalSize > 0) {
    const anyUser = childItems.some((c) => c && c.userSized);
    if (!anyUser) {
      childItems.forEach((childNode, index) => {
        childNode.percent = sizes[index] / totalSize;
      });
    }
  }
  return sizes;
}

/** Clear percent + userSized on direct children. */
export function resetSiblingPercent(parentNode) {
  if (!parentNode) return;
  const children = parentNode.childNodes;
  if (!children) return;
  children.forEach((n) => {
    n.percent = 0.0;
    n.userSized = false;
  });
}

/** Assign new child a parent share (preserve/equalize once any sibling is userSized). */
export function insertChildPercent(existing, newChild, policy = "preserve") {
  if (!newChild) return;
  const anyUserSized = existing.some((n) => n.userSized);

  if (!anyUserSized || policy === "equalize") {
    existing.forEach((n) => {
      n.percent = 0.0;
      n.userSized = false;
    });
    newChild.percent = 0.0;
    newChild.userSized = false;
    return;
  }

  let existingTotal = existing.reduce((sum, n) => sum + (n.percent || 0), 0);
  if (existingTotal <= 0) {
    const each = existing.length > 0 ? 1.0 / existing.length : 1.0;
    existing.forEach((n) => {
      n.percent = each;
    });
    existingTotal = 1.0;
  }
  const share = 1.0 / (existing.length + 1);
  newChild.percent = share;
  newChild.userSized = false;
  const scale = (1.0 - share) / existingTotal;
  existing.forEach((n) => {
    n.percent = (n.percent || 0) * scale;
  });
}

/** Renormalize sibling percents after a child is removed. */
export function redistributeSiblingPercent(parentNode) {
  if (!parentNode) return;
  let children = parentNode.childNodes;
  if (!children || children.length === 0) return;

  let totalPercent = 0;
  children.forEach((n) => {
    totalPercent += n.percent || 0;
  });

  if (totalPercent > 0) {
    const scale = 1.0 / totalPercent;
    children.forEach((n) => {
      n.percent = (n.percent || 0) * scale;
    });
  } else {
    children.forEach((n) => {
      n.percent = 1.0 / children.length;
    });
  }
}
