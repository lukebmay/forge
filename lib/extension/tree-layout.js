/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure(ish) tiling layout math: percent→pixel sizes, min-size redistrib,
 * gaps, margins, split/stack content rects. Tree thin-wraps these.
 * No St/GObject — unit-testable with plain nodes.
 */

// Layout / orientation strings match tree.js createEnum values.
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

/**
 * Shrink work area by screen-edge margins.
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @param {{top?:number,bottom?:number,left?:number,right?:number}} margins
 */
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

/**
 * Inset a node rect by gap. Waydroid skips gaps (non-standard frame extents).
 * @param {{rect:{x:number,y:number,width:number,height:number}, isWindow?:Function, nodeValue?:any}} node
 * @param {number} gap
 */
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

/**
 * Child rect for HSPLIT/VSPLIT at `index` given pixel sizes along the split axis.
 * @param {string} layout
 * @param {{x:number,y:number,width:number,height:number}} nodeRect
 * @param {number[]} sizes
 * @param {number} index
 */
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

/**
 * Content vs bar Y anchors for stacked/tabbed chrome.
 * @param {number} rectY
 * @param {number} height
 * @param {number} barSize - already-capped bar span
 * @param {"top"|"bottom"} position
 */
export function decorationLayout(rectY, height, barSize, position) {
  if (position === "bottom") {
    return { contentY: rectY, decorationY: rectY + height - barSize };
  }
  return { contentY: rectY + barSize, decorationY: rectY };
}

/**
 * STACKED content rect + total bar column height.
 * @param {{x:number,y:number,width:number,height:number}} nodeRect
 * @param {number} stackedHeight - per-tab bar height
 * @param {number} tiledCount
 * @param {"top"|"bottom"} tabPosition
 */
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
 * TABBED content rect (single bar row).
 * @param {{x:number,y:number,width:number,height:number}} nodeRect
 * @param {number} stackedHeight
 * @param {"top"|"bottom"} tabPosition
 * @param {boolean} [showDecoration=true]
 */
export function tabbedChildRect(nodeRect, stackedHeight, tabPosition, showDecoration = true) {
  let nodeWidth = nodeRect.width;
  let nodeX = nodeRect.x;
  let nodeY = nodeRect.y;
  let nodeHeight = nodeRect.height;

  if (showDecoration) {
    ({ contentY: nodeY } = decorationLayout(
      nodeRect.y,
      nodeRect.height,
      stackedHeight,
      tabPosition
    ));
    nodeHeight = Math.max(nodeRect.height - stackedHeight, 1);
  }

  return {
    x: nodeX,
    y: nodeY,
    width: nodeWidth,
    height: nodeHeight,
  };
}

/**
 * Index of the child with the most room above its minimum (Bug #330 remainder).
 * @param {number[]} sizes
 * @param {number[]} mins
 */
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

/**
 * Floor each child at its minimum; shrink slack-bearing siblings for the deficit.
 * Mutates `sizes` in place.
 * @param {number[]} sizes
 * @param {number[]} mins
 * @param {number} minTotal
 * @param {number} totalSize
 */
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

/**
 * Minimum size along `orientation` for a WINDOW or CON.
 * CON: sum if split along axis, else max (perpendicular / stacked / tabbed).
 * @param {any} node
 * @param {"HORIZONTAL"|"VERTICAL"} orientation
 * @param {(childNodes:any[]) => any[]} getTiledChildren
 */
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

/**
 * Percent → pixel sizes along split axis; min-size redistrib; Bug #330 remainder;
 * T4 effective-percent write-back (no userSized).
 *
 * @param {any} node - container with layout + rect; may have getNodeByMode
 * @param {any[]} childItems - tiled children
 * @param {(childNodes:any[]) => any[]} getTiledChildren
 * @returns {number[]}
 */
export function computeSizes(node, childItems, getTiledChildren) {
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

  // Min-size only on real splits; skip during grab.
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

  // Remainder onto most-shrinkable when mins active, else last child.
  let totalAllocated = sizes.reduce((a, b) => a + b, 0);
  if (totalAllocated !== totalSize) {
    let foldIndex = minTotal > 0 ? mostShrinkableIndex(sizes, mins) : sizes.length - 1;
    sizes[foldIndex] += totalSize - totalAllocated;
  }

  // T4: store effective percents after min paint; do not set userSized.
  if (isSplit && !grabTiled && minTotal > 0 && totalSize > 0) {
    childItems.forEach((childNode, index) => {
      childNode.percent = sizes[index] / totalSize;
    });
  }
  return sizes;
}

/**
 * Clear percent + userSized on all direct children (equal-share reset).
 * @param {any} parentNode
 */
export function resetSiblingPercent(parentNode) {
  if (!parentNode) return;
  const children = parentNode.childNodes;
  if (!children) return;
  children.forEach((n) => {
    n.percent = 0.0;
    n.userSized = false;
  });
}

/**
 * T4 / forge-7m3: assign a newly-added child a share of its parent.
 * Policy: equal until any sibling is userSized; then preserve or equalize.
 * @param {any[]} existing - tiled siblings excluding newChild
 * @param {any} newChild
 * @param {"preserve"|"equalize"} policy
 */
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

/**
 * Renormalize sibling percents after a child is removed.
 * @param {any} parentNode
 */
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
