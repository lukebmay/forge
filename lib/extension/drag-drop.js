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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Gnome imports
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import { DROP_ZONES, isHorizontalZone, isBeforeZone } from "./utils.js";
import {
  buildDropZones,
  hitTestDropZone,
  zonePaintRect,
  zonePaintRects,
  PAINT_ZONE_ORDER,
} from "./drop-zones.js";
import { dropChangesStructure, shouldMergeCenterGroup } from "./drop-intent.js";
import { Node, LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree.js";
import { WINDOW_MODES, GRAB_TYPES } from "./window.js";
import * as Compat from "./compat.js";
import { safeMoveToMonitor } from "./monitor-recovery.js";

/** Hard cap: preview actors must never outlive a stuck drag (ms). */
const PREVIEW_HINT_FAILSAFE_MS = 4000;

/** Light outline fill for non-hovered zones during drag. */
const ZONE_PREVIEW_CLASS = "window-tilepreview-zone";

/** Primary-tab press → move-grab only after this many pixels of travel. */
export const TAB_DRAG_THRESHOLD_PX = 8;

/**
 * Pure: whether pointer travel from press origin exceeds the tab-drag threshold.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} [threshold=TAB_DRAG_THRESHOLD_PX]
 * @returns {boolean}
 */
export function tabDragExceededThreshold(x0, y0, x1, y1, threshold = TAB_DRAG_THRESHOLD_PX) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy >= threshold * threshold;
}

/**
 * Pure: TILE leaf eligible as a DnD drop target (any monitor on the active ws).
 * Excludes the dragged meta, GRAB_TILE, FLOAT, minimized, and dead wrappers.
 * @param {any} node tree WINDOW node
 * @param {any} [excludeMeta] Meta.Window being dragged
 * @returns {boolean}
 */
export function isEligibleDragDropTargetNode(node, excludeMeta = null) {
  if (!node?.nodeValue || node.nodeValue === excludeMeta) return false;
  if (node.isGrabTile?.() || node.mode === WINDOW_MODES.GRAB_TILE) return false;
  if (!node.isTile?.() && node.mode !== WINDOW_MODES.TILE) return false;
  try {
    if (node.nodeValue.minimized) return false;
  } catch (_e) {
    return false;
  }
  return Utils.isWindowAlive(node.nodeValue);
}

/**
 * Pure: Meta.Window list for sortedWindows / hit-test (workspace-wide, all mons).
 * @param {any[]} windowNodes WINDOW nodes under the active workspace
 * @param {any} [excludeMeta]
 * @returns {any[]}
 */
export function collectDragDropTargetMetaWindows(windowNodes, excludeMeta = null) {
  const list = Array.isArray(windowNodes) ? windowNodes : [];
  return list.filter((n) => isEligibleDragDropTargetNode(n, excludeMeta)).map((n) => n.nodeValue);
}

/**
 * Hit rect for a drop target. During grab prefer the tree slot so the
 * dragged live frame cannot mask the destination.
 * @param {any} node
 * @param {any} metaWindow
 * @param {boolean} duringGrab
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function dropTargetHitRect(node, metaWindow, duringGrab) {
  if (duringGrab && node) {
    const slot = node.renderRect || node.initRect || node.rect;
    if (slot && slot.width > 0 && slot.height > 0) return slot;
  }
  try {
    return metaWindow?.get_frame_rect?.() ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Pure: when grab-tile has no TILE under the pointer, decide whether to rehome
 * onto the pointer's monitor (empty mon or gap). R012 blocks mid-drag rehome,
 * so grab-end must own this — otherwise commitLayout snaps the window back.
 *
 * @param {{
 *   hasWindowTarget: boolean,
 *   pointerMonIndex: number,
 *   sourceTreeMonIndex: number,
 * }} p
 * @returns {{ destMonIndex: number } | null}
 */
export function resolveEmptyMonitorDrop(p) {
  if (!p || p.hasWindowTarget) return null;
  const dest = p.pointerMonIndex;
  const src = p.sourceTreeMonIndex;
  if (typeof dest !== "number" || dest < 0) return null;
  if (typeof src !== "number" || src < 0) return null;
  if (dest === src) return null;
  return { destMonIndex: dest };
}

/**
 * @param {any} event Clutter.Event-like
 * @returns {[number, number] | null}
 */
function _eventCoords(event) {
  if (!event || typeof event.get_coords !== "function") return null;
  try {
    const coords = event.get_coords();
    if (Array.isArray(coords) && coords.length >= 2) {
      // GJS: [x, y]. Some bindings may yield [ok, x, y].
      if (coords.length >= 3 && typeof coords[0] === "boolean") {
        return [coords[1], coords[2]];
      }
      return [coords[0], coords[1]];
    }
  } catch (_e) {
    // finalized event
  }
  return null;
}

/**
 * DragDropManager owns grab-tile / drag-drop tiling for WindowManager.
 * Shared grab state (grabOp, _draggedNodeWindow, _grabStartPointer, nodeWinAtPointer,
 * freeze/unfreeze) stays on WM and is read LIVE via this._extWm. Cross-calls go
 * through this._extWm so unit spies on WindowManager still intercept.
 */
export class DragDropManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./tree.js').Tree} */
  _tree;

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /** @type {null | {
   *   metaWindow: any,
   *   startX: number,
   *   startY: number,
   *   started: boolean,
   *   synthetic: boolean,
   *   grabOp: any,
   *   stageIds: number[],
   * }} */
  _tabDrag = null;

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
  }

  swapWindowsUnderPointer(focusNodeWindow) {
    const wm = this._extWm;
    // Bug #354 fix: Validate nodes before swap
    if (!focusNodeWindow || !focusNodeWindow.nodeValue) {
      Logger.warn("swapWindowsUnderPointer: invalid focusNodeWindow");
      return;
    }
    let nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    if (!nodeWinAtPointer || !nodeWinAtPointer.nodeValue) {
      return;
    }
    if (!focusNodeWindow.parentNode || !nodeWinAtPointer.parentNode) {
      Logger.warn("swapWindowsUnderPointer: missing parent node");
      return;
    }
    this._tree.swapPairs(focusNodeWindow, nodeWinAtPointer);
  }

  /**
   * Execute a drop operation, modifying the tree structure.
   *
   * @param {Object} focusNodeWindow - The window node being dragged
   * @param {Object} operation - The drop operation object from _buildDropOperation
   * @param {Object} nodeWinAtPointer - The target window node under the pointer
   * @param {Object} ctx - Context with parent info (isMonParent, isConParent, centerLayout)
   */
  _executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx) {
    const wm = this._extWm;
    const { containerNode, referenceNode, isCenter, isHorizontal, isBefore } = operation;
    const { isConParent, centerLayout, parentNodeTarget, stackedOrTabbed } = ctx;

    const previousParent = focusNodeWindow.parentNode;
    this._tree.resetSiblingPercent(containerNode);
    this._tree.resetSiblingPercent(previousParent);

    // Bug #328 fix: Add try-catch around tab decoration removal
    if (focusNodeWindow.tab) {
      try {
        const decoParent = focusNodeWindow.tab.get_parent();
        if (decoParent) decoParent.remove_child(focusNodeWindow.tab);
      } catch (e) {
        Logger.warn(`Failed to remove tab decoration: ${e}`);
      }
    }

    if (operation.isSwap) {
      // M only — single C is grab-op-end commitLayout (AP2 StructureChanged).
      this._tree.swapPairs(referenceNode, focusNodeWindow);
    } else if (shouldMergeCenterGroup(focusNodeWindow, nodeWinAtPointer, operation)) {
      const layout = centerLayout === "STACKED" ? LAYOUT_TYPES.STACKED : LAYOUT_TYPES.TABBED;
      this._tree.mergeWindowsIntoGroup(focusNodeWindow, nodeWinAtPointer, layout);
    } else if (operation.shouldCreateCon) {
      const numWin = parentNodeTarget.childNodes.filter(
        (c) => c.nodeType === NODE_TYPES.WINDOW
      ).length;
      const numChild = parentNodeTarget.childNodes.length;
      const sameNumChild = numWin === numChild;

      let childNode;
      // Single-child CON: flip that CON's axis. Never reuse a MONITOR that
      // already has siblings — that flattens the new axis across them (R023).
      if (!isCenter && isConParent && numWin === 1 && sameNumChild) {
        childNode = parentNodeTarget;
      } else {
        childNode = new Node(NODE_TYPES.CON, new St.Bin());
        containerNode.insertBefore(childNode, referenceNode);
        childNode.appendChild(nodeWinAtPointer);
      }

      // Insert dragged window in correct position
      childNode.insertBefore(focusNodeWindow, isBefore ? nodeWinAtPointer : null);

      // Set layout based on edge direction
      if (isHorizontal) {
        childNode.layout = LAYOUT_TYPES.HSPLIT;
      } else if (!isCenter) {
        childNode.layout = LAYOUT_TYPES.VSPLIT;
      } else {
        childNode.layout = LAYOUT_TYPES[centerLayout];
      }
    } else if (operation.shouldWrapTargetCon) {
      // Edge onto a tab/stack CON: wrap that CON + dragged into H/VSPLIT in place
      // so TOP/BOTTOM become a true VSPLIT under the mon (not mon-level HSPLIT siblings).
      const targetCon = referenceNode;
      const parent = containerNode;
      if (!targetCon || !parent || targetCon.parentNode !== parent) {
        Logger.warn("shouldWrapTargetCon: invalid target/parent");
      } else {
        const wrap = new Node(NODE_TYPES.CON, new St.Bin());
        wrap.layout = isHorizontal ? LAYOUT_TYPES.HSPLIT : LAYOUT_TYPES.VSPLIT;
        wrap.percent = targetCon.percent;
        wrap.userSized = !!targetCon.userSized;
        parent.insertBefore(wrap, targetCon);
        wrap.appendChild(targetCon);
        if (isBefore) {
          wrap.insertBefore(focusNodeWindow, targetCon);
        } else {
          wrap.appendChild(focusNodeWindow);
        }
        this._tree.resetSiblingPercent(wrap);
      }
    } else if (operation.shouldDetachWindow) {
      const orientation = isHorizontal ? ORIENTATION_TYPES.HORIZONTAL : ORIENTATION_TYPES.VERTICAL;
      this._tree.split(focusNodeWindow, orientation);
      containerNode.insertBefore(focusNodeWindow.parentNode, referenceNode);
    } else {
      // Simple insert without creating container
      containerNode.insertBefore(focusNodeWindow, referenceNode);
      if (isHorizontal) {
        containerNode.layout = LAYOUT_TYPES.HSPLIT;
      } else if (!isCenter) {
        if (!stackedOrTabbed) containerNode.layout = LAYOUT_TYPES.VSPLIT;
      } else if (containerNode.isHSplit() || containerNode.isVSplit()) {
        containerNode.layout = LAYOUT_TYPES[centerLayout];
      } else if (isCenter && containerNode.isStacked() && centerLayout === "TABBED") {
        // Join existing STACKED as TABBED when stack mode is off (or dnd prefers tabbed).
        containerNode.layout = LAYOUT_TYPES.TABBED;
      }
    }

    // Never leave a STACKED group after center drop when stack mode is disabled.
    if (
      isCenter &&
      !operation.isSwap &&
      !wm.ext.settings.get_boolean("stacked-tiling-mode-enabled")
    ) {
      const joined = focusNodeWindow.parentNode;
      if (joined && joined.isStacked()) {
        joined.layout = LAYOUT_TYPES.TABBED;
      }
    }

    previousParent.resetLayoutSingleChild();

    // Reset these flags on focusNodeWindow, not childNode — the two can differ.
    focusNodeWindow.createCon = false;
    focusNodeWindow.detachWindow = false;
  }

  /**
   * Destroy every live preview actor (node-owned + registry). Safe if already gone.
   * Call on grab end, disable, setting off, and failsafe timeout — never leave dim.
   */
  clearAllPreviewHints() {
    const wm = this._extWm;
    wm._wmSources.cancel("previewHintFailsafe");
    const seen = new Set();
    const destroyActor = (actor) => {
      if (!actor || seen.has(actor)) return;
      seen.add(actor);
      try {
        actor.hide?.();
        if (global.window_group?.contains?.(actor)) {
          global.window_group.remove_child(actor);
        }
        actor.destroy?.();
      } catch (e) {
        Logger.warn(`clearAllPreviewHints: ${e}`);
      }
    };
    const destroyOne = (node) => {
      if (!node) return;
      if (node.previewZoneActors) {
        for (const a of Object.values(node.previewZoneActors)) {
          destroyActor(a);
        }
        node.previewZoneActors = null;
      }
      if (node.previewHint) {
        destroyActor(node.previewHint);
        node.previewHint = null;
      }
    };
    if (wm._draggedNodeWindow) destroyOne(wm._draggedNodeWindow);
    if (wm.allNodeWindows) {
      for (const n of wm.allNodeWindows) destroyOne(n);
    }
    if (wm._previewHintRegistry) {
      for (const actor of wm._previewHintRegistry) {
        destroyActor(actor);
      }
      wm._previewHintRegistry.clear();
    }
  }

  _armPreviewHintFailsafe() {
    const wm = this._extWm;
    // Never leave a dim overlay after a missed grab-end (Wayland/session ruin).
    // set replaces prior slot; fire → clearAll cancels already-cleared slot (miss OK).
    wm._wmSources.set("previewHintFailsafe", PREVIEW_HINT_FAILSAFE_MS, () => {
      this.clearAllPreviewHints();
    });
  }

  /**
   * Show the drop preview hint for a drag operation.
   *
   * @param {Object} focusNodeWindow - The window node being dragged
   * @param {Object} operation - The drop operation object with previewRect and previewClass
   */
  /**
   * Whether to paint drop-zone hints during a grab.
   * Setting on → always (while tiling). Setting off → only while tile mod held
   * (default Super), so operators can leave hints off and still Super-peek.
   */
  _previewHintsWanted() {
    const wm = this._extWm;
    try {
      if (wm.ext.settings.get_boolean("preview-hint-enabled")) return true;
    } catch (_e) {
      /* schema */
    }
    return this.allowDragDropTile();
  }

  /**
   * Create container + five zone bins on the dragged node (live path).
   * Tests may inject a single mock previewHint without zone children.
   */
  _ensurePreviewActors(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow) return null;
    if (focusNodeWindow.previewHint && focusNodeWindow.previewZoneActors) {
      return focusNodeWindow.previewHint;
    }
    if (focusNodeWindow.previewHint && !focusNodeWindow.previewZoneActors) {
      // Injected single-bin mock or legacy — keep as-is.
      return focusNodeWindow.previewHint;
    }
    try {
      // St.Widget hosts multiple zone bins; St.Bin is single-child only.
      const container = new St.Widget({ reactive: false, style_class: "" });
      global.window_group.add_child(container);
      focusNodeWindow.previewHint = container;
      const zoneActors = {};
      for (const z of PAINT_ZONE_ORDER) {
        const bin = new St.Bin({ reactive: false });
        container.add_child(bin);
        zoneActors[z] = bin;
      }
      focusNodeWindow.previewZoneActors = zoneActors;
      if (!wm._previewHintRegistry) wm._previewHintRegistry = new Set();
      wm._previewHintRegistry.add(container);
      return container;
    } catch (e) {
      Logger.warn(`_ensurePreviewActors: ${e}`);
      return null;
    }
  }

  _showDropPreview(focusNodeWindow, operation) {
    if (!this._previewHintsWanted()) {
      this.clearAllPreviewHints();
      return;
    }
    const previewHint = focusNodeWindow?.previewHint;
    if (!previewHint) return;
    if (!operation || !operation.previewRect) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }

    const zoneActors = focusNodeWindow.previewZoneActors;
    const dropZones = operation.dropZones;
    const paintRects = dropZones ? zonePaintRects(dropZones) : null;

    if (zoneActors && paintRects && dropZones?.unit) {
      const unit = dropZones.unit;
      previewHint.set_position(unit.x, unit.y);
      previewHint.set_size(unit.width, unit.height);
      previewHint.set_style_class_name?.("");
      for (const z of PAINT_ZONE_ORDER) {
        const actor = zoneActors[z];
        const rect = paintRects[z];
        if (!actor || !rect) continue;
        actor.set_position(rect.x - unit.x, rect.y - unit.y);
        actor.set_size(rect.width, rect.height);
        const hover = z === operation.zone;
        actor.set_style_class_name(
          hover ? operation.previewClass || ZONE_PREVIEW_CLASS : ZONE_PREVIEW_CLASS
        );
        // Raise hovered zone above siblings so emphasis is not occluded.
        if (
          hover &&
          typeof previewHint.remove_child === "function" &&
          typeof previewHint.add_child === "function"
        ) {
          try {
            previewHint.remove_child(actor);
            previewHint.add_child(actor);
          } catch (_e) {
            /* mock / finalized */
          }
        }
        actor.show?.();
      }
      previewHint.show();
    } else {
      // Single-bin path (unit tests inject mock without zone children).
      previewHint.set_style_class_name(operation.previewClass || "");
      previewHint.set_position(operation.previewRect.x, operation.previewRect.y);
      previewHint.set_size(operation.previewRect.width, operation.previewRect.height);
      previewHint.show();
    }
    this._armPreviewHintFailsafe();
  }

  _hidePreviewActors(focusNodeWindow) {
    if (!focusNodeWindow) return;
    if (focusNodeWindow.previewZoneActors) {
      for (const a of Object.values(focusNodeWindow.previewZoneActors)) {
        a.hide?.();
      }
    }
    focusNodeWindow.previewHint?.hide?.();
  }

  /**
   * Build a declarative drop operation object based on the zone and context.
   *
   * @param {string} zone - DROP_ZONES value
   * @param {Object} ctx - Context object containing:
   *   - nodeWinAtPointer: target window node
   *   - parentNodeTarget: parent container of target
   *   - horizontal: boolean, is parent horizontal layout
   *   - isMonParent: boolean, is parent a monitor node
   *   - stackedOrTabbed: boolean, is parent stacked or tabbed
   *   - centerLayout: string, center layout preference (SWAP/STACKED/TABBED)
   *   - previewRegions: regions for preview display
   *   - tree: tree reference for processGap
   * @returns {Object|null} Operation object or null if no valid operation
   */
  _buildDropOperation(zone, ctx) {
    const wm = this._extWm;
    const {
      nodeWinAtPointer,
      parentNodeTarget,
      horizontal,
      isMonParent,
      stackedOrTabbed,
      stacked,
      centerLayout,
      dropZones,
      targetRect,
    } = ctx;

    // Precompute zone characteristics for use in operation
    const isCenter = zone === DROP_ZONES.CENTER;
    const isHorizontal = isHorizontalZone(zone);
    const isBefore = isBeforeZone(zone);
    const edgePreviewRect = zonePaintRect(dropZones, zone) || targetRect;

    // Handle CENTER zone
    if (isCenter) {
      const baseOp = { zone, isCenter, isHorizontal, isBefore, dropZones };
      if (centerLayout === "SWAP") {
        return {
          ...baseOp,
          isSwap: true,
          referenceNode: nodeWinAtPointer,
          previewRect: targetRect,
          previewClass: wm._getDragDropCenterPreviewStyle(),
        };
      }
      if (stackedOrTabbed) {
        // When stack mode is off, joining a STACKED parent converts to TABBED —
        // preview must match (never show stacked if we will force tabbed).
        const showStacked =
          stacked &&
          centerLayout !== "TABBED" &&
          wm.ext.settings.get_boolean("stacked-tiling-mode-enabled");
        return {
          ...baseOp,
          containerNode: parentNodeTarget,
          referenceNode: null,
          previewRect: targetRect,
          previewClass: showStacked ? "window-tilepreview-stacked" : "window-tilepreview-tabbed",
        };
      }
      if (isMonParent) {
        return {
          ...baseOp,
          shouldCreateCon: true,
          containerNode: parentNodeTarget,
          referenceNode: nodeWinAtPointer,
          previewRect: targetRect,
          previewClass: wm._getDragDropCenterPreviewStyle(),
        };
      }
      // CON parent
      return {
        ...baseOp,
        containerNode: parentNodeTarget,
        referenceNode: null,
        previewRect: this._tree.processGap(parentNodeTarget),
        previewClass: wm._getDragDropCenterPreviewStyle(),
      };
    }

    // Edge drops share common patterns
    const baseEdgeOp = {
      zone,
      isCenter,
      isHorizontal,
      isBefore,
      dropZones,
      previewRect: edgePreviewRect,
      previewClass: "window-tilepreview-tiled",
    };

    // Stacked/tabbed: mon-direct windows peel via detach; CON groups wrap in place.
    if (stackedOrTabbed) {
      if (!isMonParent) {
        // Wrap the whole tab/stack CON + dragged into H/VSPLIT where the CON sat.
        // Old path inserted a mon-level sibling under HSPLIT → TOP/BOTTOM never VSPLIT.
        return {
          ...baseEdgeOp,
          shouldWrapTargetCon: true,
          containerNode: parentNodeTarget.parentNode,
          referenceNode: parentNodeTarget,
        };
      }
      return {
        ...baseEdgeOp,
        shouldDetachWindow: true,
        containerNode: parentNodeTarget,
        referenceNode: isBefore ? parentNodeTarget.firstChild : null,
      };
    }

    // Normal container: create con when orientation doesn't match edge direction
    return {
      ...baseEdgeOp,
      shouldCreateCon: isHorizontal !== horizontal,
      containerNode: parentNodeTarget,
      referenceNode: isBefore ? nodeWinAtPointer : nodeWinAtPointer.nextSibling,
    };
  }

  /**
   * Effective dnd-center-layout for drop/preview. STACKED is forced to TABBED
   * when stacked tiling mode is disabled.
   */
  _resolveDndCenterLayout() {
    const wm = this._extWm;
    const raw = wm.ext.settings.get_string("dnd-center-layout") || "tabbed";
    const layout = raw.toUpperCase();
    if (layout === "STACKED" && !wm.ext.settings.get_boolean("stacked-tiling-mode-enabled")) {
      return "TABBED";
    }
    return layout;
  }

  /**
   * Handle previewing and applying where a drag-drop window is going to be tiled.
   */
  moveWindowToPointer(focusNodeWindow, preview = false) {
    const wm = this._extWm;
    // Early exits
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;

    const nodeWinAtPointer = wm.nodeWinAtPointer;
    if (!nodeWinAtPointer) {
      // R015: no TILE under pointer — empty mon / gap cross-mon drop.
      // Mid-drag rehome is skipped (R012); grab-end must commit mon move.
      if (preview) {
        this._previewEmptyMonitorDrop(focusNodeWindow);
      } else {
        this._commitEmptyMonitorDrop(focusNodeWindow);
      }
      return;
    }

    // Bug #328 fix: Validate node structure before accessing
    if (!nodeWinAtPointer.nodeValue || !nodeWinAtPointer.parentNode) {
      Logger.warn("moveWindowToPointer: invalid nodeWinAtPointer structure");
      return;
    }

    const parentNodeTarget = nodeWinAtPointer.parentNode;
    if (!parentNodeTarget.childNodes || !Array.isArray(parentNodeTarget.childNodes)) {
      Logger.warn("moveWindowToPointer: invalid parent structure");
      return;
    }

    // D0 five-zone hit (independent of grab origin). Not old edge-band regions.
    const targetRect = nodeWinAtPointer.nodeValue.get_frame_rect();
    const dropZones = buildDropZones(targetRect);
    const pointer = wm.getDragPointer(focusNodeWindow);
    const zone = hitTestDropZone(dropZones, pointer);
    if (zone === DROP_ZONES.NONE) {
      if (preview) this._hidePreviewActors(focusNodeWindow);
      return;
    }

    // Build context for operation
    const ctx = {
      nodeWinAtPointer,
      parentNodeTarget,
      horizontal: parentNodeTarget.isHSplit() || parentNodeTarget.isTabbed(),
      isMonParent: parentNodeTarget.nodeType === NODE_TYPES.MONITOR,
      isConParent: parentNodeTarget.nodeType === NODE_TYPES.CON,
      stacked: parentNodeTarget.isStacked(),
      stackedOrTabbed: parentNodeTarget.isStacked() || parentNodeTarget.isTabbed(),
      centerLayout: wm._resolveDndCenterLayout(),
      dropZones,
      targetRect,
    };

    const operation = wm._buildDropOperation(zone, ctx);
    if (!operation) return;

    // Same slot / already correct relative place → paint zone, skip structure change.
    if (this._isNoOpDrop(focusNodeWindow, nodeWinAtPointer, operation, ctx)) {
      if (preview) {
        wm._showDropPreview(focusNodeWindow, operation);
      }
      return;
    }

    // Execute or preview
    if (preview) {
      wm._showDropPreview(focusNodeWindow, operation);
    } else {
      wm._executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx);
    }
  }

  /**
   * True when drop would not change parent, order, or layout (D0 + D024).
   */
  _isNoOpDrop(focusNodeWindow, nodeWinAtPointer, operation, ctx) {
    return !dropChangesStructure(focusNodeWindow, nodeWinAtPointer, operation, ctx);
  }

  /**
   * Bug #151: reference coordinate for drag-target resolution. On Wayland,
   * touch/stylus drags move the window while global.get_pointer() (mouse
   * only) stays parked. While the pointer has not moved since grab start,
   * derive the coordinate from the dragged window's frame, which Mutter
   * moves with the touch point. A real pointer drag is untouched.
   */
  getDragPointer(focusNodeWindow) {
    const wm = this._extWm;
    const pointerCoord = wm.getPointer();
    const start = wm._grabStartPointer;
    if (!start || pointerCoord[0] !== start[0] || pointerCoord[1] !== start[1]) {
      return pointerCoord;
    }
    const inside = wm.getPointerPositionInside(focusNodeWindow);
    return inside ? [inside.x, inside.y, pointerCoord[2]] : pointerCoord;
  }

  findNodeWindowAtPointer(focusNodeWindow) {
    const wm = this._extWm;
    let pointerCoord = wm.getDragPointer(focusNodeWindow);

    let nodeWinAtPointer = wm._findNodeWindowAtPointer(focusNodeWindow.nodeValue, pointerCoord);
    return nodeWinAtPointer;
  }

  /**
   * Resolve pointer mon vs source tree mon for empty-mon / gap drops (R015).
   * @param {Object} focusNodeWindow
   * @param {number|null} [destMonOverride] Synthetic path (session-api / live matrix)
   * @returns {{ destMonIndex: number } | null}
   */
  _resolveEmptyMonitorDropDecision(focusNodeWindow, destMonOverride = null) {
    const wm = this._extWm;
    if (!focusNodeWindow?.nodeValue) return null;
    const sourceMonNode = this._tree.findAncestorMonitor?.(focusNodeWindow);
    const sourceTreeMon =
      sourceMonNode?.nodeValue != null ? Utils.monitorIndex(sourceMonNode.nodeValue) : -1;
    let pointerMon = -1;
    if (typeof destMonOverride === "number" && destMonOverride >= 0) {
      pointerMon = destMonOverride;
    } else {
      const pointer = wm.getDragPointer(focusNodeWindow);
      if (!pointer || pointer.length < 2) return null;
      pointerMon =
        typeof wm._monitorIndexForRect === "function"
          ? wm._monitorIndexForRect({
              x: pointer[0],
              y: pointer[1],
              width: 1,
              height: 1,
            })
          : -1;
    }
    return resolveEmptyMonitorDrop({
      hasWindowTarget: false,
      pointerMonIndex: pointerMon,
      sourceTreeMonIndex: sourceTreeMon,
    });
  }

  /**
   * Preview full dest-mon work area when pointer is over another mon with no TILE hit.
   * @param {Object} focusNodeWindow
   */
  _previewEmptyMonitorDrop(focusNodeWindow) {
    const wm = this._extWm;
    if (!this._previewHintsWanted()) {
      this.clearAllPreviewHints();
      return;
    }
    const decision = this._resolveEmptyMonitorDropDecision(focusNodeWindow);
    if (!decision) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }
    const meta = focusNodeWindow.nodeValue;
    let workArea = null;
    try {
      workArea = meta?.get_work_area_for_monitor?.(decision.destMonIndex);
    } catch (_e) {
      workArea = null;
    }
    if (!workArea || !(workArea.width > 0) || !(workArea.height > 0)) {
      this._hidePreviewActors(focusNodeWindow);
      return;
    }
    this._ensurePreviewActors(focusNodeWindow);
    // Single full-mon bin (no five-zone geometry without a unit tile).
    const operation = {
      zone: DROP_ZONES.CENTER,
      previewRect: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      },
      previewClass: "window-tilepreview-tiled",
      dropZones: null,
    };
    // Hide multi-zone bins if present; use container as one solid preview.
    if (focusNodeWindow.previewZoneActors) {
      for (const a of Object.values(focusNodeWindow.previewZoneActors)) {
        a.hide?.();
      }
    }
    const previewHint = focusNodeWindow.previewHint;
    if (!previewHint) return;
    previewHint.set_style_class_name?.(operation.previewClass);
    previewHint.set_position(operation.previewRect.x, operation.previewRect.y);
    previewHint.set_size(operation.previewRect.width, operation.previewRect.height);
    previewHint.show?.();
    this._armPreviewHintFailsafe();
  }

  /**
   * Grab-end: rehome GRAB_TILE onto pointer mon when no window target (R015).
   * @param {Object} focusNodeWindow
   * @param {number|null} [destMonOverride] Synthetic empty-mon drop (session-api)
   * @returns {boolean} true when rehomed
   */
  _commitEmptyMonitorDrop(focusNodeWindow, destMonOverride = null) {
    const wm = this._extWm;
    const decision = this._resolveEmptyMonitorDropDecision(focusNodeWindow, destMonOverride);
    if (!decision) return false;

    const meta = focusNodeWindow.nodeValue;
    if (!meta || !Utils.isWindowAlive(meta)) return false;

    let wsIndex = 0;
    try {
      wsIndex = meta.get_workspace?.()?.index?.() ?? 0;
    } catch (_e) {
      wsIndex = 0;
    }
    const destId = Utils.createMonitorWorkspaceId(decision.destMonIndex, wsIndex);
    const destNode = this._tree.findNode(destId);
    if (!destNode) {
      Logger.warn(`empty-mon-dnd: missing mon node ${destId}`);
      return false;
    }
    // Already under dest mon (stale nodeWinAtPointer null mid-structure) — no-op.
    if (destNode.contains?.(focusNodeWindow)) return false;

    const previousParent = focusNodeWindow.parentNode;
    this._tree.resetSiblingPercent?.(previousParent);
    this._tree.resetSiblingPercent?.(destNode);

    // Meta mon first (when still on source); SEGV-safe no-op if already there / -1.
    safeMoveToMonitor(meta, decision.destMonIndex, "empty-mon-dnd");

    // Geometry onto dest work area before reparent (tree.move mon path).
    try {
      const targetMonRect =
        typeof wm.rectForMonitor === "function"
          ? wm.rectForMonitor(focusNodeWindow, decision.destMonIndex)
          : null;
      const workArea =
        typeof meta.get_work_area_for_monitor === "function"
          ? meta.get_work_area_for_monitor(decision.destMonIndex)
          : null;
      if (targetMonRect && typeof wm.move === "function") {
        wm.move(meta, targetMonRect, workArea);
      }
    } catch (e) {
      Logger.debug?.(`empty-mon-dnd geometry: ${e}`);
    }

    // User dragged one leaf — never walk up a CON (workspace-migrate helper).
    let attached = false;
    if (typeof wm._rehomeAttachAfterMonLft === "function") {
      attached = !!wm._rehomeAttachAfterMonLft(focusNodeWindow, destNode);
    }
    if (!attached) {
      destNode.appendChild?.(focusNodeWindow);
    }

    previousParent?.resetLayoutSingleChild?.();
    this._tree.resetSiblingPercent?.(previousParent);
    this._tree.resetSiblingPercent?.(focusNodeWindow.parentNode || destNode);
    Logger.debug?.(`empty-mon-dnd: rehomed → mo${decision.destMonIndex}ws${wsIndex}`);
    return true;
  }

  /**
   * Finds the NodeWindow under pointer coords using workspace-wide sortedWindows
   * (all monitors). Frame rects are stage-global, so mon1 at x≥1920 hits normally.
   * Excludes the dragged meta. During grab, hit the target tree slot so a moving
   * live frame cannot self-hit.
   */
  _findNodeWindowAtPointer(metaWindow, pointer) {
    const wm = this._extWm;
    if (!metaWindow) return undefined;

    let sortedWindows = wm.sortedWindows;

    if (!sortedWindows) {
      Logger.warn("No sorted windows");
      return;
    }

    const draggedNode = this._tree.getNodeByValue(metaWindow);
    const duringGrab = !!(
      wm._draggedNodeWindow ||
      draggedNode?.mode === WINDOW_MODES.GRAB_TILE ||
      draggedNode?.isGrabTile?.()
    );

    for (let i = 0, n = sortedWindows.length; i < n; i++) {
      const w = sortedWindows[i];
      // forge-xom3: sortedWindows is snapshotted at grab start and not pruned
      // when a window closes mid-drag; skip dead wrappers so get_frame_rect()
      // can't throw and a disposed window can't mask a live drop target beneath.
      if (w === metaWindow) continue;
      if (!Utils.isWindowAlive(w)) continue;
      const node = this._tree.getNodeByValue(w);
      if (!isEligibleDragDropTargetNode(node, metaWindow)) continue;
      const hitRect = dropTargetHitRect(node, w, duringGrab);
      if (hitRect && Utils.rectContainsPoint(hitRect, pointer)) return node;
    }

    return null;
  }

  _handleGrabOpBegin(_display, metaWindow, grabOp) {
    const wm = this._extWm;
    // forge-h6z9: cancel any pending debounced keyboard-resize end so a delayed
    // _handleGrabOpEnd can't fire into this grab (e.g. a real pointer grab that
    // begins <120ms after a keyboard resize, which would unfreeze/cleanup and
    // kill the live drag). The keyboard key-repeat path calls this from resize()
    // and immediately re-arms the timer afterward, so accumulation is preserved.
    wm._wmSources.cancel("manualResizeEnd");
    wm._manualResizeEndWindow = null;

    wm.grabOp = grabOp;
    // Prefer the grab signal's window (tab synthetic grab, focus lag) over
    // display focus — trackCurrentMonWs also needs a live Meta.Window.
    let focusMetaWindow =
      metaWindow && typeof wm.findNodeWindow === "function" && wm.findNodeWindow(metaWindow)
        ? metaWindow
        : wm.focusMetaWindow;
    // Snapshot sortedWindows for the grabbed window (focus may lag after tab arm).
    wm.trackCurrentMonWs(focusMetaWindow || null);
    // Bug #151: snapshot the pointer so getDragPointer() can tell a real
    // pointer drag (pointer moves) from a touch/stylus drag (pointer parked).
    wm._grabStartPointer = wm.getPointer();

    if (focusMetaWindow) {
      let focusNodeWindow = wm.findNodeWindow(focusMetaWindow);
      if (!focusNodeWindow) return;

      const frameRect = focusMetaWindow.get_frame_rect();
      const gaps = wm.calculateGaps(focusNodeWindow);

      focusNodeWindow.grabMode = Utils.grabMode(grabOp);
      if (
        focusNodeWindow.grabMode === GRAB_TYPES.MOVING &&
        focusNodeWindow.mode === WINDOW_MODES.TILE
      ) {
        wm.freezeRender();
        focusNodeWindow.mode = WINDOW_MODES.GRAB_TILE;
      }

      focusNodeWindow.initGrabOp = grabOp;
      // Only set initRect if not already tracking a resize (preserves original during key repeat)
      if (!focusNodeWindow.initRect) {
        focusNodeWindow.initRect = Utils.removeGapOnRect(frameRect, gaps);
      }

      // Bug #497 (forge-pak): snapshot the enclosing tabbed/stacked container's
      // start slice so a tab resize maps onto the container consistently while
      // the tree re-renders mid-drag.
      // forge-ue92: record the exact ancestors we snapshot so _grabCleanup can
      // clear THESE nodes. _handleGrabOpEnd reparents the dragged node
      // (moveWindowToPointer) BEFORE cleanup, so re-walking parentNode at cleanup
      // time would clear the post-reparent chain and strand initRect on the
      // original container — skewing its next tab resize.
      const grabbedTabbedAncestors = [];
      let tabbedAncestor = focusNodeWindow.parentNode;
      while (tabbedAncestor && tabbedAncestor.isStackedOrTabbed()) {
        if (!tabbedAncestor.initRect) tabbedAncestor.initRect = { ...tabbedAncestor.rect };
        grabbedTabbedAncestors.push(tabbedAncestor);
        tabbedAncestor = tabbedAncestor.parentNode;
      }
      focusNodeWindow.grabbedTabbedAncestors = grabbedTabbedAncestors;

      // Bug #433 fix: Track the window being dragged for preview hint cleanup
      wm._draggedNodeWindow = focusNodeWindow;
    }
  }

  _handleGrabOpEnd(_display, metaWindow, grabOp) {
    const wm = this._extWm;
    // Tab-drag arming ends with the Mutter grab (or our synthetic end).
    this._disarmTabDrag({ keepSynthetic: false });
    wm.unfreezeRender();
    // Prefer the grab-end window when still in the tree; else focus; else the
    // node we snapshotted at grab-begin (_draggedNodeWindow).
    let focusMetaWindow =
      (metaWindow && wm.findNodeWindow(metaWindow) && metaWindow) ||
      wm.focusMetaWindow ||
      wm._draggedNodeWindow?.nodeValue ||
      null;
    if (!focusMetaWindow) {
      // Focus lost mid-drag (window closed, monitor crossing): still release the
      // dragged window's preview hint so the overlay isn't orphaned on screen.
      if (wm._draggedNodeWindow) {
        wm._grabCleanup(wm._draggedNodeWindow);
        wm._draggedNodeWindow = null;
      }
      // forge-62ja: also clear the per-grab state the normal exit path clears
      // (below), so a stale grabOp from this finished drag can't defeat the
      // forge-leqs WINDOW_BASE guard in updateMetaWorkspaceMonitor on a later
      // cross-monitor/workspace re-home before the next grab re-sets it.
      wm.nodeWinAtPointer = null;
      wm.grabOp = null;
      return;
    }
    let focusNodeWindow = wm.findNodeWindow(focusMetaWindow);

    if (focusNodeWindow) {
      // WINDOW_BASE is when grabbing the window decoration
      // COMPOSITOR is when something like Overview requesting a grab, especially when Super is pressed.
      if (
        grabOp === Meta.GrabOp.WINDOW_BASE ||
        grabOp === Meta.GrabOp.COMPOSITOR ||
        grabOp === Meta.GrabOp.MOVING_UNCONSTRAINED ||
        grabOp === Meta.GrabOp.MOVING
      ) {
        if (wm.allowDragDropTile()) {
          // Fresh target at commit (stale motion / mid-drag mon thrash).
          wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);
          wm.nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
          wm.moveWindowToPointer(focusNodeWindow);
        }
      }
    }

    // Bug #433 fix: Clean up preview hint from the originally dragged window
    // This handles cases where focus changed during drag (e.g., crossing monitors)
    if (wm._draggedNodeWindow && wm._draggedNodeWindow !== focusNodeWindow) {
      wm._grabCleanup(wm._draggedNodeWindow);
    }
    wm._draggedNodeWindow = null;

    wm._grabCleanup(focusNodeWindow);

    // StructureChanged: exactly one C for the drop gesture (swap path no longer
    // commits in _executeDropOperation).
    if (Compat.isNotMaximized(focusMetaWindow)) {
      wm.commitLayout("grab-op-end", { force: true });
    }

    wm.settleTabFocus(focusNodeWindow);
    wm.nodeWinAtPointer = null;
    // forge-leqs: grabOp is the live grab; clear it once the grab ends so later
    // reads (e.g. the WINDOW_BASE guard in updateMetaWorkspaceMonitor) don't see
    // a stale op from a finished drag. A new grab re-sets it in _handleGrabOpBegin
    // before any size-changed handler runs.
    wm.grabOp = null;
  }

  _grabCleanup(focusNodeWindow) {
    // Always wipe every preview — not only focusNodeWindow — so a reparent/focus
    // race cannot leave a full-screen dim until logout.
    this.clearAllPreviewHints();

    if (!focusNodeWindow) return;
    focusNodeWindow.initRect = null;
    focusNodeWindow.grabMode = null;
    focusNodeWindow.initGrabOp = null;
    focusNodeWindow.pairInitRects = null;

    // Bug #497 (forge-pak): release any tabbed/stacked container snapshots too.
    // forge-ue92: clear the ancestors snapshotted at grab-begin, NOT the current
    // parentNode chain — the node may have been reparented (tab dragged out) or
    // left the tree before this runs, which would otherwise strand initRect on the
    // original container and skew/bake its next resize.
    if (focusNodeWindow.grabbedTabbedAncestors) {
      for (const ancestor of focusNodeWindow.grabbedTabbedAncestors) {
        ancestor.initRect = null;
      }
      focusNodeWindow.grabbedTabbedAncestors = null;
    }

    if (focusNodeWindow.mode === WINDOW_MODES.GRAB_TILE) {
      focusNodeWindow.mode = WINDOW_MODES.TILE;
    }
  }

  allowDragDropTile() {
    // kbd may be null mid-disable / partial test fixtures (bug-175).
    return !!this._extWm?.kbd?.allowDragDropTile?.();
  }

  /**
   * Arm a primary-button gesture on tab chrome. Short click = already activated
   * by the caller; travel past TAB_DRAG_THRESHOLD_PX starts a move grab for
   * `metaWindow` (same drop path as titlebar grab-tile).
   *
   * @param {any} metaWindow Meta.Window for the tile unit
   * @param {any} event Clutter button-press event
   * @returns {boolean} true if armed
   */
  armTabDrag(metaWindow, event) {
    const wm = this._extWm;
    if (!metaWindow || !event) return false;
    if (!wm?.ext?.settings?.get_boolean?.("tiling-mode-enabled")) return false;
    // Already mid grab-tile (titlebar or prior tab) — do not stack gestures.
    if (wm._draggedNodeWindow?.mode === WINDOW_MODES.GRAB_TILE) return false;

    this._disarmTabDrag({ keepSynthetic: false });

    const coords =
      _eventCoords(event) ||
      (() => {
        const p = wm.getPointer?.() || global.get_pointer?.() || [0, 0, 0];
        return [p[0], p[1]];
      })();
    const [startX, startY] = coords;

    const grabOp =
      Meta.GrabOp.MOVING_UNCONSTRAINED != null
        ? Meta.GrabOp.MOVING_UNCONSTRAINED
        : Meta.GrabOp.MOVING;

    this._tabDrag = {
      metaWindow,
      startX,
      startY,
      started: false,
      synthetic: false,
      grabOp,
      stageIds: [],
    };

    const stage = global.stage;
    if (stage && typeof stage.connect === "function") {
      // Capture so motion still arrives after the pointer leaves the tab actor.
      const id = stage.connect("captured-event", (_actor, ev) => {
        this._onTabDragStageEvent(ev);
        return Clutter.EVENT_PROPAGATE;
      });
      this._tabDrag.stageIds.push(id);
    }
    // Without stage.connect (unit mocks), drive via noteTabDragMotion /
    // finishTabDragRelease; tab actors also wire motion/release.
    return true;
  }

  /**
   * Test / fallback entry: report pointer position while a tab drag is armed.
   * @param {number} x
   * @param {number} y
   * @returns {"idle"|"armed"|"started"|"active"}
   */
  noteTabDragMotion(x, y) {
    const state = this._tabDrag;
    if (!state) return "idle";
    if (state.started) {
      if (state.synthetic) {
        const node = this._extWm.findNodeWindow?.(state.metaWindow);
        if (node) this._handleMoving(node);
      }
      return state.synthetic ? "active" : "started";
    }
    if (!tabDragExceededThreshold(state.startX, state.startY, x, y)) return "armed";
    this._startTabMoveGrab(state);
    return state.started ? (state.synthetic ? "active" : "started") : "armed";
  }

  /**
   * Test / fallback: primary button released while tab-drag armed or synthetic.
   */
  finishTabDragRelease() {
    const state = this._tabDrag;
    if (!state) return;
    if (state.started && state.synthetic) {
      this._endSyntheticTabMove(state);
      return;
    }
    // Click-only or Mutter-owned grab: drop arming. Real grab-op-end also disarms.
    this._disarmTabDrag({ keepSynthetic: false });
  }

  _onTabDragStageEvent(event) {
    const state = this._tabDrag;
    if (!state || !event) return;

    let type = null;
    try {
      type = typeof event.type === "function" ? event.type() : event.type;
    } catch (_e) {
      return;
    }

    const isMotion =
      type === Clutter.EventType?.MOTION ||
      type === "motion" ||
      // Some GJS builds expose numeric EventType only.
      (Clutter.EventType && type === Clutter.EventType.MOTION);
    const isRelease =
      type === Clutter.EventType?.BUTTON_RELEASE ||
      type === "button-release" ||
      (Clutter.EventType && type === Clutter.EventType.BUTTON_RELEASE);

    if (isMotion) {
      const coords = _eventCoords(event);
      if (!coords) return;
      this.noteTabDragMotion(coords[0], coords[1]);
      return;
    }

    if (isRelease) {
      const btn =
        typeof event.get_button === "function" ? event.get_button() : Clutter.BUTTON_PRIMARY;
      if (btn === Clutter.BUTTON_PRIMARY || btn === 1) {
        this.finishTabDragRelease();
      }
    }
  }

  _startTabMoveGrab(state) {
    if (!state || state.started) return;
    const wm = this._extWm;
    const metaWindow = state.metaWindow;
    if (!metaWindow) {
      this._disarmTabDrag({ keepSynthetic: false });
      return;
    }

    // Ensure focus targets this window so grab begin / trackCurrentMonWs match.
    try {
      const now = global.display.get_current_time();
      metaWindow.raise?.();
      metaWindow.focus?.(now);
      metaWindow.activate?.(now);
    } catch (_e) {
      // tests / finalized
    }

    let startedViaMutter = false;
    if (typeof metaWindow.begin_grab_op === "function") {
      try {
        // Mutter 46+: (op, device, sequence, timestamp, pos_hint) → bool
        const ok = metaWindow.begin_grab_op(
          state.grabOp,
          null,
          null,
          global.display.get_current_time(),
          null
        );
        // Require explicit true; undefined/void must not skip the synthetic path.
        startedViaMutter = ok === true;
      } catch (e) {
        Logger.warn(`tab drag begin_grab_op failed: ${e}`);
        startedViaMutter = false;
      }
    }

    if (startedViaMutter) {
      state.started = true;
      state.synthetic = false;
      // Mutter owns motion/release; drop our stage listeners.
      this._disconnectTabDragStage(state);
      return;
    }

    // Synthetic: same Forge grab-tile path as e2e fuzzDrag.
    state.started = true;
    state.synthetic = true;
    this._beginSyntheticTabMove(metaWindow, state.grabOp);
  }

  _beginSyntheticTabMove(metaWindow, grabOp) {
    const wm = this._extWm;
    const display = global.display;
    wm._handleGrabOpBegin(display, metaWindow, grabOp);
  }

  _endSyntheticTabMove(state) {
    const wm = this._extWm;
    const metaWindow = state?.metaWindow;
    const grabOp = state?.grabOp ?? Meta.GrabOp.MOVING_UNCONSTRAINED;
    // Clear arm before grab-end (grab-end also disarms — idempotent).
    this._disarmTabDrag({ keepSynthetic: false });
    wm._handleGrabOpEnd(global.display, metaWindow, grabOp);
  }

  /**
   * @param {{ keepSynthetic?: boolean }} [opts]
   *  keepSynthetic reserved; currently always clears full tab-drag state.
   */
  _disarmTabDrag(_opts = {}) {
    const state = this._tabDrag;
    if (!state) return;
    this._disconnectTabDragStage(state);
    this._tabDrag = null;
  }

  _disconnectTabDragStage(state) {
    if (!state?.stageIds?.length) return;
    const stage = global.stage;
    for (const id of state.stageIds) {
      try {
        stage?.disconnect?.(id);
      } catch (_e) {
        // stage gone
      }
    }
    state.stageIds = [];
  }

  /** Cancel an armed (not yet started) or synthetic tab drag. */
  cancelTabDrag() {
    const state = this._tabDrag;
    if (!state) return;
    if (state.started && state.synthetic) {
      this._endSyntheticTabMove(state);
      return;
    }
    this._disarmTabDrag({ keepSynthetic: false });
  }

  _handleMoving(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;

    // Refresh workspace-wide targets each motion (cross-mon + mid-drag maps).
    wm.trackCurrentMonWs(focusNodeWindow.nodeValue || null);

    const nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    wm.nodeWinAtPointer = nodeWinAtPointer;

    // Hints: setting on always, or tile-mod (Super) when setting is off.
    // Drop commit still requires allowDragDropTile() at grab-end.
    const showHints = this._previewHintsWanted();
    if (!showHints) {
      this.clearAllPreviewHints();
      return;
    }

    if (nodeWinAtPointer) {
      this._ensurePreviewActors(focusNodeWindow);
      // Paint all five zones + emphasize hover; Super-only when setting is off
      // still reaches here via _previewHintsWanted → allowDragDropTile.
      wm.moveWindowToPointer(focusNodeWindow, true);
    } else {
      // R015: empty mon / gap on foreign mon — full work-area preview (or hide).
      wm.moveWindowToPointer(focusNodeWindow, true);
    }
  }

  _getDragDropCenterPreviewStyle() {
    return `window-tilepreview-${this._extWm._resolveDndCenterLayout().toLowerCase()}`;
  }
}
