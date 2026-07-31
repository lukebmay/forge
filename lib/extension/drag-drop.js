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
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import {
  calculateDropRegions,
  detectDropZone,
  DROP_ZONES,
  isHorizontalZone,
  isBeforeZone,
} from "./utils.js";
import { Node, LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree.js";
import { WINDOW_MODES, GRAB_TYPES } from "./window.js";
import * as Compat from "./compat.js";

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
    const { isMonParent, isConParent, centerLayout, parentNodeTarget, stackedOrTabbed } = ctx;

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
      this._tree.swapPairs(referenceNode, focusNodeWindow);
      wm.renderTree("drag-swap");
    } else if (operation.shouldCreateCon) {
      const numWin = parentNodeTarget.childNodes.filter(
        (c) => c.nodeType === NODE_TYPES.WINDOW
      ).length;
      const numChild = parentNodeTarget.childNodes.length;
      const sameNumChild = numWin === numChild;

      let childNode;
      // Reuse existing container if conditions are met
      if (
        !isCenter &&
        ((isConParent && numWin === 1 && sameNumChild) ||
          (isMonParent && numWin === 2 && sameNumChild))
      ) {
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
   * Show the drop preview hint for a drag operation.
   *
   * @param {Object} focusNodeWindow - The window node being dragged
   * @param {Object} operation - The drop operation object with previewRect and previewClass
   */
  _showDropPreview(focusNodeWindow, operation) {
    const wm = this._extWm;
    const previewHint = focusNodeWindow.previewHint;
    const previewHintEnabled = wm.ext.settings.get_boolean("preview-hint-enabled");
    if (previewHint && previewHintEnabled) {
      if (!operation || !operation.previewRect) {
        previewHint.hide();
        return;
      }
      previewHint.set_style_class_name(operation.previewClass || "");
      previewHint.set_position(operation.previewRect.x, operation.previewRect.y);
      previewHint.set_size(operation.previewRect.width, operation.previewRect.height);
      previewHint.show();
    }
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
      previewRegions,
      targetRect,
    } = ctx;

    // Precompute zone characteristics for use in operation
    const isCenter = zone === DROP_ZONES.CENTER;
    const isHorizontal = isHorizontalZone(zone);
    const isBefore = isBeforeZone(zone);

    // Handle CENTER zone
    if (isCenter) {
      const baseOp = { zone, isCenter, isHorizontal, isBefore };
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
      previewRect: previewRegions[zone.toLowerCase()],
      previewClass: "window-tilepreview-tiled",
    };

    // Stacked/tabbed containers: detach and split
    if (stackedOrTabbed) {
      let referenceNode, containerNode;
      if (!isMonParent) {
        referenceNode = isBefore ? parentNodeTarget : parentNodeTarget.nextSibling;
        containerNode = parentNodeTarget.parentNode;
      } else {
        containerNode = parentNodeTarget;
        referenceNode = isBefore ? parentNodeTarget.firstChild : null;
      }
      return { ...baseEdgeOp, shouldDetachWindow: true, containerNode, referenceNode };
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
    if (!nodeWinAtPointer) return;

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

    // Calculate regions and detect zone
    const targetRect = nodeWinAtPointer.nodeValue.get_frame_rect();
    const hoverRegions = calculateDropRegions(targetRect, 0.3);
    const zone = detectDropZone(hoverRegions, wm.getDragPointer(focusNodeWindow));
    if (zone === DROP_ZONES.NONE) return;

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
      previewRegions: calculateDropRegions(targetRect, 0.5),
      targetRect,
    };

    const operation = wm._buildDropOperation(zone, ctx);
    if (!operation) return;

    // Execute or preview
    if (preview) {
      wm._showDropPreview(focusNodeWindow, operation);
    } else {
      wm._executeDropOperation(focusNodeWindow, operation, nodeWinAtPointer, ctx);
    }
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
   * Finds the NodeWindow under the Meta.Window and the
   * current pointer coordinates;
   */
  _findNodeWindowAtPointer(metaWindow, pointer) {
    const wm = this._extWm;
    if (!metaWindow) return undefined;

    let sortedWindows = wm.sortedWindows;

    if (!sortedWindows) {
      Logger.warn("No sorted windows");
      return;
    }

    for (let i = 0, n = sortedWindows.length; i < n; i++) {
      const w = sortedWindows[i];
      // forge-xom3: sortedWindows is snapshotted at grab start and not pruned
      // when a window closes mid-drag; skip dead wrappers so get_frame_rect()
      // can't throw and a disposed window can't mask a live drop target beneath.
      if (!Utils.isWindowAlive(w)) continue;
      const metaRect = w.get_frame_rect();
      const atPointer = Utils.rectContainsPoint(metaRect, pointer);
      if (atPointer) return this._tree.getNodeByValue(w);
    }

    return null;
  }

  _handleGrabOpBegin(_display, _metaWindow, grabOp) {
    const wm = this._extWm;
    // forge-h6z9: cancel any pending debounced keyboard-resize end so a delayed
    // _handleGrabOpEnd can't fire into this grab (e.g. a real pointer grab that
    // begins <120ms after a keyboard resize, which would unfreeze/cleanup and
    // kill the live drag). The keyboard key-repeat path calls this from resize()
    // and immediately re-arms the timer afterward, so accumulation is preserved.
    wm._clearTimeoutId("_manualResizeEndId");
    wm._manualResizeEndWindow = null;

    wm.grabOp = grabOp;
    // C3: force split-chrome show-all for the grab duration (cleared on grab end)
    wm._splitChromeForceShowAll = true;
    wm.trackCurrentMonWs();
    // Bug #151: snapshot the pointer so getDragPointer() can tell a real
    // pointer drag (pointer moves) from a touch/stylus drag (pointer parked).
    wm._grabStartPointer = wm.getPointer();
    let focusMetaWindow = wm.focusMetaWindow;

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

  _handleGrabOpEnd(_display, _metaWindow, grabOp) {
    const wm = this._extWm;
    wm.unfreezeRender();
    // C3: restore user show-all setting (no sticky force after drag)
    wm._splitChromeForceShowAll = false;
    let focusMetaWindow = wm.focusMetaWindow;
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
        grabOp === Meta.GrabOp.MOVING_UNCONSTRAINED
      ) {
        if (wm.allowDragDropTile()) {
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

    if (Compat.isNotMaximized(focusMetaWindow)) {
      wm.renderTree("grab-op-end");
    }

    wm.updateStackedFocus(focusNodeWindow);
    wm.updateTabbedFocus(focusNodeWindow);
    wm.nodeWinAtPointer = null;
    // forge-leqs: grabOp is the live grab; clear it once the grab ends so later
    // reads (e.g. the WINDOW_BASE guard in updateMetaWorkspaceMonitor) don't see
    // a stale op from a finished drag. A new grab re-sets it in _handleGrabOpBegin
    // before any size-changed handler runs.
    wm.grabOp = null;
  }

  _grabCleanup(focusNodeWindow) {
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

    // Bug #175 fix: Ensure preview hint is always cleaned up (add try-catch)
    if (focusNodeWindow.previewHint) {
      try {
        focusNodeWindow.previewHint.hide();
        if (global.window_group && global.window_group.contains(focusNodeWindow.previewHint)) {
          global.window_group.remove_child(focusNodeWindow.previewHint);
        }
        focusNodeWindow.previewHint.destroy();
      } catch (e) {
        Logger.warn(`Failed to cleanup preview hint: ${e}`);
      } finally {
        focusNodeWindow.previewHint = null;
      }
    }

    if (focusNodeWindow.mode === WINDOW_MODES.GRAB_TILE) {
      focusNodeWindow.mode = WINDOW_MODES.TILE;
    }
  }

  allowDragDropTile() {
    return this._extWm.kbd.allowDragDropTile();
  }

  _handleMoving(focusNodeWindow) {
    const wm = this._extWm;
    if (!focusNodeWindow || focusNodeWindow.mode !== WINDOW_MODES.GRAB_TILE) return;

    const nodeWinAtPointer = wm.findNodeWindowAtPointer(focusNodeWindow);
    wm.nodeWinAtPointer = nodeWinAtPointer;

    const hidePreview = () => {
      if (focusNodeWindow.previewHint) {
        focusNodeWindow.previewHint.hide();
      }
    };

    if (nodeWinAtPointer) {
      if (!focusNodeWindow.previewHint) {
        let previewHint = new St.Bin();
        global.window_group.add_child(previewHint);
        focusNodeWindow.previewHint = previewHint;
      }

      if (wm.allowDragDropTile()) {
        wm.moveWindowToPointer(focusNodeWindow, true);
      } else {
        hidePreview();
      }
    } else {
      hidePreview();
    }
  }

  _getDragDropCenterPreviewStyle() {
    return `window-tilepreview-${this._extWm._resolveDndCenterLayout().toLowerCase()}`;
  }
}
