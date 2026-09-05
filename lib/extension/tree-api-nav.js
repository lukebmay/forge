// @ts-check
/**
 * Forest-first nav peel off class Tree (G8n-s4).
 * Sibling cycle, focus walkers, move epilogue, Wayland activate.
 * GObject move()/moveIn()/moveOut() stay on Tree (appendChild +
 * _syncForestIfSeeded dual-write — do not grow).
 */

import Meta from "gi://Meta";

import { Logger } from "../shared/logger.js";
import * as Utils from "./utils.js";
import { LAYOUT_TYPES, NODE_TYPES, ORIENTATION_TYPES, POSITION } from "./tree-types.js";
import { WINDOW_MODES } from "./window-modes.js";
import { swapWouldOverflowMins } from "./drop-intent.js";
import { liveParentForPresent } from "./tom-live.js";

/** Names createLiveTree must not copy from Node/Tree.prototype. */
export const NAV_NAMES = new Set([
  "_cyclicSiblingWindow",
  "focusSibling",
  "swapSibling",
  "_nextMoveCandidate",
  "next",
  "nextVisible",
  "nextMonitor",
  "_neighborMonitorByGeometry",
  "layoutUnit",
  "resolveOwningSplit",
  "_owningSplitAxis",
  "_owningSplitDirection",
  "_isHvOnAxis",
  "_isOwningSplitCeiling",
  "_owningSplitPair",
  "_tiledWindowsIn",
  "stackedFocusWindow",
  "_selectFocusWindow",
  "_isFocusMoveCeiling",
  "focus",
  "focusParent",
  "focusChild",
  "_resolveNavUnit",
  "_windowForFocusUnit",
  "_moveUnit",
  "_siblingConForMoveIn",
  "_finishMove",
  "_activateWindowNode",
]);

/**
 * Cyclic neighbour among immediate tiled siblings (i3 next|prev wrap).
 * @param {any} tree
 * @param {any} node
 * @param {number} offset
 */
export function cyclicSiblingWindow(tree, node, offset) {
  if (!node || !node.parentNode) return null;
  const siblings = tree.getTiledChildren(node.parentNode.childNodes);
  if (siblings.length <= 1) return null;
  const idx = siblings.indexOf(node);
  if (idx < 0) return null;
  let target = siblings[(idx + offset + siblings.length) % siblings.length];
  if (target && target.isCon()) target = tree._selectFocusWindow(target, offset < 0);
  return target && target !== node ? target : null;
}

/**
 * @param {any} tree
 * @param {any} node
 * @param {number} offset
 */
export function treeFocusSibling(tree, node, offset) {
  return tree._activateWindowNode(cyclicSiblingWindow(tree, node, offset), undefined);
}

/**
 * @param {any} tree
 * @param {any} node
 * @param {number} offset
 */
export function treeSwapSibling(tree, node, offset) {
  const siblings = node?.parentNode ? tree.getTiledChildren(node.parentNode.childNodes) : [];
  if (siblings.length <= 1) return null;
  let idx = siblings.indexOf(node);
  if (idx < 0) return null;
  const n = siblings.length;
  for (let step = 1; step < n; step++) {
    const target = siblings[(idx + offset * step + n * 16) % n];
    let win = target;
    if (win?.isCon?.()) win = tree._selectFocusWindow(win, offset < 0);
    if (!win || win === node || win.nodeType !== NODE_TYPES.WINDOW) continue;
    if (swapWouldOverflowMins(node, win)) continue;
    tree.swapPairs(node, win);
    return node;
  }
  return null;
}

/**
 * Next sibling/parent/descendant for Meta.MotionDirection (i3 tree.c).
 * @param {any} tree
 * @param {any} node
 * @param {any} direction
 */
export function treeNext(tree, node, direction) {
  if (!node) return null;
  let orientation = Utils.orientationFromDirection(direction);
  let position = Utils.positionFromDirection(direction);
  let previous = position === POSITION.BEFORE;

  const type = node.nodeType;

  switch (type) {
    case NODE_TYPES.ROOT:
      if (node.childNodes.length > 1) {
        if (previous) {
          return node.firstChild;
        } else {
          return node.lastChild;
        }
      } else {
        return node.firstChild;
      }
    case NODE_TYPES.WORKSPACE:
      break;
    case NODE_TYPES.MONITOR: {
      const nodeWindow = tree.findFirstNodeWindowFrom(node);
      return tree.nextMonitor(nodeWindow, position, orientation);
    }
  }

  while (node && node.nodeType !== NODE_TYPES.WORKSPACE) {
    if (node.nodeType === NODE_TYPES.MONITOR) {
      return treeNext(tree, node, direction);
    }
    const parentNode = node.parentNode;
    if (!parentNode) return null;
    const parentOrientation = Utils.orientationFromLayout(parentNode.layout);

    if (parentNode.childNodes.length > 1 && orientation === parentOrientation) {
      const next = previous ? node.previousSibling : node.nextSibling;
      if (next) {
        return next;
      }
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Neighbor MONITOR in `orientation`/`position`, else -1 at a true edge.
 * @param {any} tree
 * @param {any} nodeWindow
 * @param {any} position
 * @param {any} orientation
 */
export function treeNextMonitor(tree, nodeWindow, position, orientation) {
  if (!nodeWindow || !nodeWindow.nodeValue) return null;
  let monitorDirection = Utils.directionFrom(position, orientation);
  let currentMonitor = -1;
  const ownMon = tree.findAncestorMonitor(nodeWindow);
  if (ownMon) currentMonitor = Utils.monitorIndex(ownMon.nodeValue);
  if (currentMonitor < 0) currentMonitor = nodeWindow.nodeValue.get_monitor();
  if (currentMonitor < 0) return null;
  let targetMonitor = global.display.get_monitor_neighbor_index(currentMonitor, monitorDirection);
  if (targetMonitor < 0) {
    targetMonitor = neighborMonitorByGeometry(currentMonitor, monitorDirection);
  }
  if (targetMonitor < 0) return targetMonitor;
  let wsIndex = 0;
  try {
    const ws = nodeWindow.nodeValue.get_workspace?.();
    if (ws && typeof ws.index === "function") wsIndex = ws.index();
  } catch (_e) {
    /* disposed Meta */
  }
  return tree.findNode(Utils.createMonitorWorkspaceId(targetMonitor, wsIndex));
}

/**
 * @param {number} currentMonitor
 * @param {any} direction
 */
export function neighborMonitorByGeometry(currentMonitor, direction) {
  const cur = global.display.get_monitor_geometry(currentMonitor);
  if (!cur) return -1;
  const count = global.display.get_n_monitors();
  const D = Meta.DisplayDirection;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    if (i === currentMonitor) continue;
    const c = global.display.get_monitor_geometry(i);
    if (!c) continue;
    const hOverlap = c.x < cur.x + cur.width && c.x + c.width > cur.x;
    const vOverlap = c.y < cur.y + cur.height && c.y + c.height > cur.y;
    let dist = -1;
    if (direction === D.UP && hOverlap && c.y < cur.y) dist = cur.y - c.y;
    else if (direction === D.DOWN && hOverlap && c.y > cur.y) dist = c.y - cur.y;
    else if (direction === D.LEFT && vOverlap && c.x < cur.x) dist = cur.x - c.x;
    else if (direction === D.RIGHT && vOverlap && c.x > cur.x) dist = c.x - cur.x;
    if (dist >= 0 && dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function treeNextVisible(tree, node, direction) {
  if (!node) return null;
  let next = treeNext(tree, node, direction);
  if (next === -1) return null;
  if (next && next.nodeType === NODE_TYPES.WINDOW && next.nodeValue && next.nodeValue.minimized) {
    next = treeNextVisible(tree, next, direction);
  }
  return next;
}

/**
 * Next move/swap target in `direction`, skipping min-overflow slots.
 * @param {any} tree
 * @param {any} node
 * @param {any} direction
 */
export function nextMoveCandidate(tree, node, direction) {
  const visited = new Set();
  let cursor = node;
  for (let i = 0; i < 24; i++) {
    const next = tree.next(cursor, direction);
    if (!next || next === -1) return next;
    if (visited.has(next)) return null;
    visited.add(next);

    let win = next;
    if (next.nodeType === NODE_TYPES.CON || next.nodeType === NODE_TYPES.MONITOR) {
      const kids = next
        .getNodeByMode?.(WINDOW_MODES.TILE)
        ?.filter((t) => t.nodeType === NODE_TYPES.WINDOW);
      win = kids?.[0] || null;
    }
    if (win && win.nodeType === NODE_TYPES.WINDOW && swapWouldOverflowMins(node, win)) {
      cursor = next;
      continue;
    }
    return next;
  }
  return null;
}

const NAV_DESCRIPTORS = {
  _cyclicSiblingWindow: {
    value: function navCyclicSiblingWindow(node, offset) {
      return cyclicSiblingWindow(this, node, offset);
    },
    writable: true,
    configurable: true,
  },
  focusSibling: {
    value: function navFocusSibling(node, offset) {
      return treeFocusSibling(this, node, offset);
    },
    writable: true,
    configurable: true,
  },
  swapSibling: {
    value: function navSwapSibling(node, offset) {
      return treeSwapSibling(this, node, offset);
    },
    writable: true,
    configurable: true,
  },
  _nextMoveCandidate: {
    value: function navNextMoveCandidate(node, direction) {
      return nextMoveCandidate(this, node, direction);
    },
    writable: true,
    configurable: true,
  },
  next: {
    value: function navNext(node, direction) {
      return treeNext(this, node, direction);
    },
    writable: true,
    configurable: true,
  },
  nextVisible: {
    value: function navNextVisible(node, direction) {
      return treeNextVisible(this, node, direction);
    },
    writable: true,
    configurable: true,
  },
  nextMonitor: {
    value: function navNextMonitor(nodeWindow, position, orientation) {
      return treeNextMonitor(this, nodeWindow, position, orientation);
    },
    writable: true,
    configurable: true,
  },
  _neighborMonitorByGeometry: {
    value: function navNeighborMonitorByGeometry(currentMonitor, direction) {
      return neighborMonitorByGeometry(currentMonitor, direction);
    },
    writable: true,
    configurable: true,
  },
  layoutUnit: {
    value: function navLayoutUnit(node) {
      return layoutUnit(node);
    },
    writable: true,
    configurable: true,
  },
  resolveOwningSplit: {
    value: function navResolveOwningSplit(unit, axisOrEdge, opts = {}) {
      return resolveOwningSplit(this, unit, axisOrEdge, opts);
    },
    writable: true,
    configurable: true,
  },
  _owningSplitAxis: {
    value: function navOwningSplitAxis(axisOrEdge) {
      return owningSplitAxis(this, axisOrEdge);
    },
    writable: true,
    configurable: true,
  },
  _owningSplitDirection: {
    value: function navOwningSplitDirection(value) {
      return owningSplitDirection(value);
    },
    writable: true,
    configurable: true,
  },
  _isHvOnAxis: {
    value: function navIsHvOnAxis(node, axis) {
      return isHvOnAxis(node, axis);
    },
    writable: true,
    configurable: true,
  },
  _isOwningSplitCeiling: {
    value: function navIsOwningSplitCeiling(node) {
      return isOwningSplitCeiling(node);
    },
    writable: true,
    configurable: true,
  },
  _owningSplitPair: {
    value: function navOwningSplitPair(tiled, target, direction) {
      return owningSplitPair(tiled, target, direction);
    },
    writable: true,
    configurable: true,
  },
  _tiledWindowsIn: {
    value: function navTiledWindowsIn(container) {
      return tiledWindowsIn(container);
    },
    writable: true,
    configurable: true,
  },
  stackedFocusWindow: {
    value: function navStackedFocusWindow(container) {
      return stackedFocusWindow(container);
    },
    writable: true,
    configurable: true,
  },
  _selectFocusWindow: {
    value: function navSelectFocusWindow(container, previous) {
      return selectFocusWindow(container, previous);
    },
    writable: true,
    configurable: true,
  },
  _isFocusMoveCeiling: {
    value: function navIsFocusMoveCeiling(node) {
      return isFocusMoveCeiling(node);
    },
    writable: true,
    configurable: true,
  },
  focus: {
    value: function navFocus(node, direction) {
      return treeFocus(this, node, direction);
    },
    writable: true,
    configurable: true,
  },
  focusParent: {
    value: function navFocusParent(node) {
      return treeFocusParent(this, node);
    },
    writable: true,
    configurable: true,
  },
  focusChild: {
    value: function navFocusChild(node) {
      return treeFocusChild(this, node);
    },
    writable: true,
    configurable: true,
  },
  _resolveNavUnit: {
    value: function navResolveNavUnit(node) {
      return resolveNavUnit(this, node);
    },
    writable: true,
    configurable: true,
  },
  _windowForFocusUnit: {
    value: function navWindowForFocusUnit(unit, prefer) {
      return windowForFocusUnit(this, unit, prefer);
    },
    writable: true,
    configurable: true,
  },
  _moveUnit: {
    value: function navMoveUnit(node) {
      return moveUnit(this, node);
    },
    writable: true,
    configurable: true,
  },
  _siblingConForMoveIn: {
    value: function navSiblingConForMoveIn(unit) {
      return siblingConForMoveIn(this, unit);
    },
    writable: true,
    configurable: true,
  },
  _finishMove: {
    value: function navFinishMove(parentNode, parentTarget) {
      return treeFinishMove(this, parentNode, parentTarget);
    },
    writable: true,
    configurable: true,
  },
  _activateWindowNode: {
    value: function navActivateWindowNode(next, direction) {
      return activateWindowNode(this, next, direction);
    },
    writable: true,
    configurable: true,
  },
};

/** @param {any} root */
export function attachRootNavApi(root) {
  Object.defineProperties(root, NAV_DESCRIPTORS);
}

/** @param {any} container */
export function tiledWindowsIn(container) {
  if (!container?.getNodeByType) return [];
  return container
    .getNodeByType(NODE_TYPES.WINDOW)
    .filter((w) => w.isTile() && !w.nodeValue?.minimized);
}

/** @param {any} container */
export function stackedFocusWindow(container) {
  if (!container) return null;
  const windows = tiledWindowsIn(container);
  if (windows.length === 0) return null;
  if (container.lastTabFocus) {
    const match = windows.find((w) => w.nodeValue === container.lastTabFocus);
    if (match) return match;
  }
  return windows[0];
}

/** @param {any} container @param {boolean} previous */
export function selectFocusWindow(container, previous) {
  const windows = tiledWindowsIn(container);
  if (windows.length === 0) return null;
  if (container.layout === LAYOUT_TYPES.STACKED) return stackedFocusWindow(container);
  if (windows.length > 1) {
    return previous ? windows[windows.length - 1] : windows[0];
  }
  return windows[0];
}

/** @param {any} node */
/**
 * Directional focus: resolve next TILE window, then Tree._activateWindowNode.
 * @param {any} tree
 * @param {any} node
 * @param {any} direction
 */
/** @param {any} tree @param {any} node */
export function resolveNavUnit(tree, node) {
  const unit = tree.focusUnit;
  if (unit) {
    const wm = tree.extWm;
    const inTree =
      !!unit.parentNode || unit.isRoot?.() === true || !!(wm && liveParentForPresent(wm, unit));
    if (!inTree) {
      tree.focusUnit = null;
    } else if (!node || unit === node || unit.contains?.(node)) {
      return unit;
    } else {
      tree.focusUnit = null;
    }
  }
  return node || null;
}

/** @param {any} tree @param {any} unit @param {any} [prefer] */
export function windowForFocusUnit(tree, unit, prefer) {
  if (!unit) return null;
  if (unit.nodeType === NODE_TYPES.WINDOW || unit.isWindow?.()) return unit;
  if (prefer && (unit === prefer || unit.contains?.(prefer))) {
    if (prefer.nodeType === NODE_TYPES.WINDOW || prefer.isWindow?.()) return prefer;
    const nested = windowForFocusUnit(tree, prefer);
    if (nested) return nested;
  }
  if (typeof unit.isStacked === "function" && unit.isStacked()) {
    return stackedFocusWindow(unit);
  }
  if (typeof unit.isTabbed === "function" && unit.isTabbed()) {
    const wins = tiledWindowsIn(unit);
    if (unit.lastTabFocus) {
      const match = wins.find((w) => w.nodeValue === unit.lastTabFocus);
      if (match) return match;
    }
    return wins[0] || null;
  }
  return selectFocusWindow(unit, false);
}

/** @param {any} tree @param {any} node */
/** @param {any} tree @param {any} node */
export function moveUnit(tree, node) {
  let start = node;
  if (tree.focusUnit) {
    const u = tree.focusUnit;
    const inTree = !!u.parentNode || u.isRoot?.() === true;
    if (!inTree) {
      tree.focusUnit = null;
    } else if (!node || u === node || u.contains?.(node) || node.contains?.(u)) {
      start = u;
    }
  }
  return layoutUnit(start) || start || null;
}

/** @param {any} tree @param {any} unit */
export function siblingConForMoveIn(tree, unit) {
  const parent = unit?.parentNode;
  if (!parent) return null;
  const kids = parent.childNodes || [];
  const idx = kids.indexOf(unit);
  if (idx < 0) return null;
  for (let i = idx + 1; i < kids.length; i++) {
    const n = kids[i];
    if (n && (n.nodeType === NODE_TYPES.CON || n.isCon?.()) && !isFocusMoveCeiling(n)) {
      return n;
    }
  }
  for (let i = idx - 1; i >= 0; i--) {
    const n = kids[i];
    if (n && (n.nodeType === NODE_TYPES.CON || n.isCon?.()) && !isFocusMoveCeiling(n)) {
      return n;
    }
  }
  return null;
}

/**
 * Structural-move epilogue (forge-qxqb / LX2). Not Forest dual-write.
 * @param {any} tree
 * @param {any} parentNode
 * @param {any} parentTarget
 */
export function treeFinishMove(tree, parentNode, parentTarget) {
  const wasTabOrStack = !!(parentNode && parentNode.isStackedOrTabbed());
  const groupRect = wasTabOrStack ? parentNode.rect : null;
  const peeledToPair =
    wasTabOrStack &&
    parentTarget &&
    parentNode.parentNode === parentTarget &&
    parentTarget.childNodes.length === 2 &&
    parentTarget.childNodes.includes(parentNode);

  tree.resetSiblingPercent(parentNode);
  tree.resetSiblingPercent(parentTarget);
  parentNode.resetLayoutSingleChild?.();

  if (peeledToPair && tree.extWm?.determineSplitLayoutForRect) {
    parentTarget.layout = tree.extWm.determineSplitLayoutForRect(groupRect);
  }
}

/**
 * Raise/focus a WINDOW node + Wayland stacking (forge-zrl). Not Forest dual-write.
 * @param {any} tree
 * @param {any} next
 * @param {any} [direction]
 */
export function activateWindowNode(tree, next, direction) {
  if (!next) return null;

  let metaWindow = next.nodeValue;
  if (!metaWindow) return null;
  const previousMetaWindow = tree.extWm.focusMetaWindow;
  if (metaWindow.minimized) {
    next = direction !== undefined ? tree.focus(next, direction) : null;
  } else {
    metaWindow.raise();
    metaWindow.focus(global.display.get_current_time());
    metaWindow.activate(global.display.get_current_time());

    if (Meta.is_wayland_compositor && Meta.is_wayland_compositor()) {
      try {
        const wasAbove = metaWindow.is_above();
        if (!wasAbove) {
          tree.extWm._withSuppressedAboveHandler(() => metaWindow.make_above());
          metaWindow._forgeTransientAbove = true;
          const lt = tree.extWm._windowAttach?.attach(metaWindow);
          lt?.sources.set("stack", 50, () => {
            try {
              if (
                Utils.isWindowAlive(metaWindow) &&
                metaWindow._forgeTransientAbove &&
                !next._forgeSetAbove &&
                !next._aboveDemotedForFullscreen
              ) {
                tree.extWm._withSuppressedAboveHandler(() => metaWindow.unmake_above());
              }
            } catch (_e) {
              /* window may have been destroyed */
            } finally {
              metaWindow._forgeTransientAbove = false;
            }
          });
        }
      } catch (e) {
        Logger.warn(`Failed to adjust Wayland stacking: ${e}`);
      }
    }

    const monitorArea = Utils.getWorkAreaSafe(metaWindow);
    const ptr = tree.extWm.getPointer();
    const pointerInside = monitorArea
      ? Utils.rectContainsPoint(monitorArea, [ptr[0], ptr[1]])
      : false;
    const monitorChanged =
      !!previousMetaWindow &&
      previousMetaWindow.get_monitor &&
      previousMetaWindow.get_monitor() !== metaWindow.get_monitor();

    if (tree.settings.get_boolean("move-pointer-focus-enabled")) {
      tree.extWm.movePointerWith(next);
    } else if (!pointerInside) {
      tree.extWm.movePointerWith(next, { force: monitorChanged });
    }
  }
  return next;
}

export function treeFocusParent(tree, node) {
  const start = resolveNavUnit(tree, node);
  if (!start) return null;
  const parent = liveParentForPresent(tree.extWm, start) || start.parentNode;
  if (!parent || isFocusMoveCeiling(parent)) return null;
  tree.focusUnit = parent;
  return windowForFocusUnit(tree, parent, node);
}

/** @param {any} tree @param {any} node */
export function treeFocusChild(tree, node) {
  const start = resolveNavUnit(tree, node);
  if (!start || isFocusMoveCeiling(start)) return null;
  if (start.nodeType === NODE_TYPES.WINDOW || start.isWindow?.()) return null;
  const tiled = tree.getTiledChildren(start.childNodes || []);
  if (tiled.length === 0) return null;
  let child = null;
  if (node && (node.nodeType === NODE_TYPES.WINDOW || node.isWindow?.())) {
    child = tiled.find((n) => n === node || n.contains?.(node)) || null;
  }
  if (!child && start.lastTabFocus) {
    const leaf = tree.findNode?.(start.lastTabFocus);
    if (leaf) {
      child = tiled.find((n) => n === leaf || n.contains?.(leaf)) || null;
    }
  }
  if (!child && typeof start.isStackedOrTabbed === "function" && start.isStackedOrTabbed()) {
    child = windowForFocusUnit(tree, start, node);
  }
  if (!child) child = tiled[0];
  if (!child) return null;
  tree.focusUnit = child;
  return windowForFocusUnit(tree, child, node);
}

export function treeFocus(tree, node, direction) {
  if (!node) return null;
  let next = treeNext(tree, node, direction);
  if (!next) return null;
  let type = next.nodeType;
  let position = Utils.positionFromDirection(direction);
  const previous = position === POSITION.BEFORE;
  switch (type) {
    case NODE_TYPES.WINDOW:
      break;
    case NODE_TYPES.CON:
      next = selectFocusWindow(next, previous);
      break;
    case NODE_TYPES.MONITOR:
      if (next.layout === LAYOUT_TYPES.STACKED) {
        next = stackedFocusWindow(next);
      } else {
        next = previous ? next.lastChild : next.firstChild;
      }
      if (next && next.nodeType === NODE_TYPES.CON) {
        next = selectFocusWindow(next, previous);
      }
      break;
  }
  return tree._activateWindowNode(next, direction);
}

export function isFocusMoveCeiling(node) {
  if (!node) return true;
  if (node.nodeType === NODE_TYPES.MONITOR || node.isMonitor?.()) return true;
  if (node.nodeType === NODE_TYPES.ROOT || node.isRoot?.()) return true;
  if (node.nodeType === NODE_TYPES.WORKSPACE || node.isWorkspace?.()) return true;
  return false;
}

/** @param {any} node */
export function layoutUnit(node) {
  if (!node) return null;
  let unit = node;
  while (
    unit.parentNode &&
    typeof unit.parentNode.isStackedOrTabbed === "function" &&
    unit.parentNode.isStackedOrTabbed()
  ) {
    unit = unit.parentNode;
  }
  return unit;
}

/** @param {any} tree @param {any} axisOrEdge */
export function owningSplitAxis(tree, axisOrEdge) {
  if (axisOrEdge === ORIENTATION_TYPES.HORIZONTAL || axisOrEdge === ORIENTATION_TYPES.VERTICAL) {
    return axisOrEdge;
  }
  const dir = owningSplitDirection(axisOrEdge);
  if (dir != null) return Utils.orientationFromDirection(dir);
  return null;
}

/** @param {any} value */
export function owningSplitDirection(value) {
  if (value == null) return null;
  const md = Meta.MotionDirection;
  if (value === md.LEFT || value === md.RIGHT || value === md.UP || value === md.DOWN) {
    return value;
  }
  if (typeof value === "string") {
    const resolved = Utils.resolveDirection(value);
    if (resolved != null) return resolved;
  }
  return null;
}

/** @param {any} node @param {any} axis */
export function isHvOnAxis(node, axis) {
  if (!node) return false;
  if (axis === ORIENTATION_TYPES.HORIZONTAL) {
    return typeof node.isHSplit === "function" && node.isHSplit();
  }
  if (axis === ORIENTATION_TYPES.VERTICAL) {
    return typeof node.isVSplit === "function" && node.isVSplit();
  }
  return false;
}

/** @param {any} node */
export function isOwningSplitCeiling(node) {
  if (!node) return true;
  return (
    node.nodeType === NODE_TYPES.WORKSPACE ||
    node.nodeType === NODE_TYPES.ROOT ||
    (typeof node.isWorkspace === "function" && node.isWorkspace()) ||
    (typeof node.isRoot === "function" && node.isRoot())
  );
}

/** @param {any[]} tiled @param {any} target @param {any} direction */
export function owningSplitPair(tiled, target, direction) {
  const i = tiled.indexOf(target);
  if (i < 0) return null;
  const md = Meta.MotionDirection;
  if (direction === md.LEFT || direction === md.UP) {
    return i > 0 ? tiled[i - 1] : null;
  }
  if (direction === md.RIGHT || direction === md.DOWN) {
    return i + 1 < tiled.length ? tiled[i + 1] : null;
  }
  return i + 1 < tiled.length ? tiled[i + 1] : i > 0 ? tiled[i - 1] : null;
}

/**
 * @param {any} tree
 * @param {any} unit
 * @param {any} axisOrEdge
 * @param {{ direction?: any }} [opts]
 */
export function resolveOwningSplit(tree, unit, axisOrEdge, opts = {}) {
  const axis = owningSplitAxis(tree, axisOrEdge);
  if (!axis) return null;
  const start = layoutUnit(unit);
  if (!start) return null;
  const direction =
    opts.direction !== undefined
      ? owningSplitDirection(opts.direction)
      : owningSplitDirection(axisOrEdge);

  let candidate = start;
  while (candidate && !isOwningSplitCeiling(candidate)) {
    const parent = candidate.parentNode;
    if (!parent || isOwningSplitCeiling(parent)) return null;
    if (isHvOnAxis(parent, axis)) {
      const tiled = tree.getTiledChildren(parent.childNodes);
      if (tiled.length >= 2 && tiled.includes(candidate)) {
        const pair = owningSplitPair(tiled, candidate, direction);
        if (pair) return { target: candidate, pair, parent, axis };
      }
    }
    candidate = parent;
  }
  return null;
}
