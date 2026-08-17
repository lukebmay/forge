/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure layout math (sizes, gaps, split/stack rects). Tree thin-wraps; no St/GObject.
 */

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

/** Min size along orientation (CON: sum on-axis, else max). */
export function minSizeInOrientation(node, orientation, getTiledChildren) {
  if (typeof node.isWindow === "function" && node.isWindow()) {
    if (!node.nodeValue) return 0;
    const hints = node.nodeValue.get_size_hints?.();
    if (!hints) return 0;
    const min = orientation === HORIZONTAL ? hints.min_width : hints.min_height;
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
