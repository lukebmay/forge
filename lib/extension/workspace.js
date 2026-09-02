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

// Shared state
import { Logger } from "../shared/logger.js";
import { recordD100Observe } from "./metrics.js";

// App imports
import { NODE_TYPES, LAYOUT_TYPES } from "./tree-types.js";
import {
  forestAdmitWorkspace,
  forestRekeySpine,
  forestRemoveSpine,
} from "./tom-live.js";
import * as Utils from "./utils.js";

/**
 * WorkspaceManager handles workspace-related operations for the tiling tree.
 * Extracted from tree.js and window.js to consolidate workspace logic.
 */
export class WorkspaceManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./tree.js').Tree} */
  _tree;

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /** @type {Map<number, number[]>} Map of workspace index to signal IDs */
  _workspaceSignals = new Map();

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
  }

  /**
   * WORKSPACE already present in Forest / bag / liveById / live tree.
   * @param {number} wsIndex
   * @returns {boolean}
   */
  _workspaceExists(wsIndex) {
    const id = `ws${wsIndex}`;
    const wm = this._extWm;
    if (wm?.forest?.nodes?.[id]?.kind === "WORKSPACE") return true;
    if (wm?.liveById?.get?.(id)) return true;
    if (wm?.hostBag?.has?.(id)) return true;
    return !!this._tree.findNode(id);
  }

  /**
   * Add a workspace — Forest invent first; live Node is chrome mirror (D096 / G3).
   * @param {number} wsIndex - Workspace index
   * @returns {boolean} True if workspace was added, false if it already exists
   */
  addWorkspace(wsIndex) {
    let wsManager = global.display.get_workspace_manager();

    if (this._workspaceExists(wsIndex)) {
      Logger.trace(`workspace add skip exists idx=${wsIndex}`);
      return false;
    }
    Logger.debug(`workspace add idx=${wsIndex}`);

    const admitted = forestAdmitWorkspace(this._extWm, wsIndex, {
      layout: LAYOUT_TYPES.HSPLIT,
      tree: this._tree,
    });
    if (!admitted?.live) return false;

    let workspace = wsManager.get_workspace_by_index(wsIndex);
    this.bindWorkspaceSignals(workspace);
    this._tree.addMonitor(wsIndex);

    return true;
  }

  /**
   * Remove a workspace from Forest + live chrome.
   * @param {number} wsIndex - Workspace index
   * @returns {boolean} True if workspace was removed, false if it didn't exist
   */
  removeWorkspace(wsIndex) {
    let workspaceNodeData = `ws${wsIndex}`;
    const wm = this._extWm;
    let existingWsNode =
      wm?.liveById?.get?.(workspaceNodeData) || this._tree.findNode(workspaceNodeData);
    if (!existingWsNode && wm?.forest?.nodes?.[workspaceNodeData]?.kind !== "WORKSPACE") {
      Logger.trace(`workspace remove miss idx=${wsIndex}`);
      return false;
    }
    Logger.debug(`workspace remove idx=${wsIndex}`);

    // forge-98sa: monitor bins parent into window_group; tear WS + MONs together.
    const monLives = existingWsNode?.getNodeByType?.(NODE_TYPES.MONITOR) || [];
    const forestMonIds = (wm?.forest?.nodes?.[workspaceNodeData]?.childIds || []).filter(
      (cid) => wm.forest.nodes[cid]?.kind === "MONITOR"
    );
    for (const mid of forestMonIds) {
      const live = wm.liveById?.get?.(mid);
      if (live && !monLives.includes(live)) monLives.push(live);
    }
    const scaffoldBins = [
      existingWsNode?.actorBin || wm?.hostBag?.get?.(workspaceNodeData)?.actor,
      ...monLives.map((monNode) => monNode?.actorBin),
      ...forestMonIds.map((mid) => wm?.hostBag?.get?.(mid)?.actor),
    ];
    for (const bin of scaffoldBins) {
      if (!bin) continue;
      try {
        if (global.window_group.contains(bin)) global.window_group.remove_child(bin);
      } catch (_e) {
        /* disposed */
      }
      if (bin.destroy) bin.destroy();
    }

    if (existingWsNode?.parentNode) {
      try {
        this._tree.removeChild(existingWsNode);
      } catch (_e) {
        /* already detached */
      }
    }

    forestRemoveSpine(wm, workspaceNodeData);

    this.unbindWorkspaceSignals(wsIndex);

    return true;
  }

  /**
   * Bind signals to a workspace for window tracking
   * @param {Meta.Workspace} metaWorkspace - The workspace to bind signals to
   */
  bindWorkspaceSignals(metaWorkspace) {
    if (!metaWorkspace) return;

    // Check if workspace supports signal connection (may be missing in tests)
    if (typeof metaWorkspace.connect !== "function") return;

    const wsIndex = typeof metaWorkspace.index === "function" ? metaWorkspace.index() : -1;

    if (wsIndex >= 0 && this._workspaceSignals.has(wsIndex)) {
      return;
    }

    const signals = [
      metaWorkspace.connect("window-added", () => {
        recordD100Observe("workspace-window-added");
      }),
    ];

    if (wsIndex >= 0) {
      // forge-gw2c: store the workspace OBJECT with its signal ids. Disconnect
      // must target the object the ids were connected on — after a reorder,
      // re-resolving by index would hit (and strand) a different workspace.
      this._workspaceSignals.set(wsIndex, { workspace: metaWorkspace, signals });
    }
  }

  /**
   * Unbind signals from a workspace
   * @param {number} wsIndex - Workspace index
   */
  unbindWorkspaceSignals(wsIndex) {
    const entry = this._workspaceSignals.get(wsIndex);
    if (!entry) return;

    // forge-gw2c: disconnect from the STORED object, not a get_workspace_by_index
    // re-resolution — the two diverge after a reorder, which is exactly when a
    // re-resolved disconnect strands a survivor's handler / leaks the real one.
    const { workspace, signals } = entry;
    try {
      if (workspace && typeof workspace.disconnect === "function") {
        signals.forEach((signalId) => {
          try {
            workspace.disconnect(signalId);
          } catch (e) {
            // Signal may already be disconnected
          }
        });
      }
    } catch (e) {
      Logger.debug(`Error unbinding workspace signals for ws${wsIndex}: ${e}`);
    }

    this._workspaceSignals.delete(wsIndex);
  }

  /**
   * Internal method to renumber workspace and monitor nodes.
   * @param {Object} opts
   * @param {function(number): boolean} opts.shouldRenumber - Predicate for which indices to renumber
   * @param {function(Object, Object): number} opts.compareFn - Sort comparator for processing order
   * @param {function(number): number} opts.newIndex - Maps old index to new index
   */
  _renumberWorkspaces({ shouldRenumber, compareFn, newIndex }) {
    const workspaceNodes = this._tree.getNodeByType(NODE_TYPES.WORKSPACE);
    if (!workspaceNodes || workspaceNodes.length === 0) return;

    const toRenumber = [];
    for (const wsNode of workspaceNodes) {
      const wsVal = wsNode.nodeValue;
      if (typeof wsVal !== "string" || !wsVal.startsWith("ws")) continue;
      const idx = parseInt(wsVal.slice(2));
      if (isNaN(idx) || !shouldRenumber(idx)) continue;
      toRenumber.push({ node: wsNode, oldIndex: idx });
    }

    toRenumber.sort(compareFn);

    // forge-2jxz: collect the signal-map rekeys and apply them in two phases
    // (delete every source key, then set every target key) AFTER the node pass,
    // making the rekey independent of processing order so it can never
    // overwrite a live signal array.
    const signalMoves = [];
    const wm = this._extWm;
    for (const { node: wsNode, oldIndex } of toRenumber) {
      const idx = newIndex(oldIndex);
      const oldWsId = `ws${oldIndex}`;
      const newWsId = `ws${idx}`;

      wsNode.nodeValue = newWsId;
      forestRekeySpine(wm, oldWsId, newWsId);

      const monitorNodes = wsNode.getNodeByType(NODE_TYPES.MONITOR);
      if (monitorNodes) {
        for (const monNode of monitorNodes) {
          const moIdx = Utils.monitorIndex(monNode.nodeValue);
          if (moIdx >= 0) {
            const oldMonId = monNode.nodeValue;
            const newMonId = Utils.createMonitorWorkspaceId(moIdx, idx);
            monNode.nodeValue = newMonId;
            forestRekeySpine(wm, oldMonId, newMonId);
          }
        }
      }

      if (this._workspaceSignals.has(oldIndex)) {
        // Move the whole {workspace, signals} entry — the object is unchanged by
        // an add/remove renumber, only its index shifts (forge-gw2c).
        signalMoves.push({ oldIndex, idx, entry: this._workspaceSignals.get(oldIndex) });
      }
    }

    for (const { oldIndex } of signalMoves) {
      this._workspaceSignals.delete(oldIndex);
    }
    for (const { idx, entry } of signalMoves) {
      this._workspaceSignals.set(idx, entry);
    }
  }

  /**
   * Renumber workspace nodes after a workspace is removed.
   * @param {number} removedIndex - The index of the workspace that was removed
   */
  renumberWorkspacesAfterRemoval(removedIndex) {
    this._renumberWorkspaces({
      shouldRenumber: (idx) => idx > removedIndex,
      compareFn: (a, b) => a.oldIndex - b.oldIndex,
      newIndex: (oldIndex) => oldIndex - 1,
    });
  }

  /**
   * Renumber workspace nodes after a workspace is added at a non-end position.
   * @param {number} insertedIndex - The index where the new workspace will be inserted
   */
  renumberWorkspacesAfterAddition(insertedIndex) {
    this._renumberWorkspaces({
      shouldRenumber: (idx) => idx >= insertedIndex,
      compareFn: (a, b) => b.oldIndex - a.oldIndex,
      newIndex: (oldIndex) => oldIndex + 1,
    });
  }

  /**
   * Clean up all workspace signals
   */
  destroy() {
    for (const wsIndex of this._workspaceSignals.keys()) {
      this.unbindWorkspaceSignals(wsIndex);
    }
    this._workspaceSignals.clear();
  }
}
