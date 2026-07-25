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
import St from "gi://St";

// App imports
import { NODE_TYPES } from "./tree.js";
import * as Utils from "./utils.js";

/**
 * MonitorManager handles monitor-related operations for the tiling tree.
 */
export class MonitorManager extends GObject.Object {
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

  /**
   * Add monitor nodes for a workspace
   * @param {number} wsIndex - Workspace index
   */
  addMonitor(wsIndex) {
    let monitors = global.display.get_n_monitors();
    for (let mi = 0; mi < monitors; mi++) {
      let monitorWsNode = this._tree.createNode(
        `ws${wsIndex}`,
        NODE_TYPES.MONITOR,
        Utils.createMonitorWorkspaceId(mi, wsIndex)
      );
      // forge-5ng (#311): default split orientation follows each monitor's own
      // geometry — portrait splits vertically, landscape horizontally.
      let monitorRect = global.display.get_monitor_geometry(mi);
      monitorWsNode.layout = this._extWm.determineSplitLayoutForRect(monitorRect);
      monitorWsNode.actorBin = new St.Bin();
      if (!global.window_group.contains(monitorWsNode.actorBin))
        global.window_group.add_child(monitorWsNode.actorBin);
    }
  }

  /**
   * Get the number of monitors
   * @returns {number} Number of monitors
   */
  getMonitorCount() {
    return global.display.get_n_monitors();
  }

  /**
   * Get monitor node for a workspace and monitor index
   * @param {number} wsIndex - Workspace index
   * @param {number} monitorIndex - Monitor index
   * @returns {import('./tree.js').Node|null} Monitor node or null
   */
  getMonitorNode(wsIndex, monitorIndex) {
    return this._tree.findNode(Utils.createMonitorWorkspaceId(monitorIndex, wsIndex));
  }

  /**
   * Best-effort live monitor descriptors for identity fingerprinting (T7).
   * Uses global.display geometry + optional Main.layoutManager.monitors fields
   * (connector / displayName when Shell exposes them). No EDID / DBus.
   *
   * @param {any[]|null} [layoutMonitors] - Main.layoutManager.monitors if available
   * @returns {import('./monitor-identity.js').MonitorInfo[]}
   */
  collectLiveMonitorsInfo(layoutMonitors = null) {
    const display = global.display;
    if (!display || typeof display.get_n_monitors !== "function") return [];

    let n = 0;
    try {
      n = display.get_n_monitors() || 0;
    } catch (_e) {
      return [];
    }

    let primaryIndex = 0;
    try {
      if (typeof display.get_primary_monitor === "function") {
        primaryIndex = display.get_primary_monitor();
      }
    } catch (_e) {
      primaryIndex = 0;
    }

    const lmList = Array.isArray(layoutMonitors) ? layoutMonitors : null;
    const infos = [];

    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let width = 0;
      let height = 0;
      try {
        const g = display.get_monitor_geometry(i);
        if (g) {
          x = g.x ?? 0;
          y = g.y ?? 0;
          width = g.width ?? 0;
          height = g.height ?? 0;
        }
      } catch (_e) {
        /* keep zeros */
      }

      const lm = lmList?.[i] ?? null;
      let connector = null;
      let name = null;
      if (lm && typeof lm === "object") {
        connector = lm.connector ?? lm.outputName ?? lm.output_name ?? null;
        name = lm.displayName ?? lm.display_name ?? lm.manufacturer ?? null;
        if (width <= 0 && (lm.width || lm.height)) {
          x = lm.x ?? x;
          y = lm.y ?? y;
          width = lm.width ?? width;
          height = lm.height ?? height;
        }
      }

      infos.push({
        index: i,
        connector: connector != null && String(connector).trim() ? String(connector) : null,
        name: name != null && String(name).trim() ? String(name) : null,
        isPrimary: i === primaryIndex,
        x,
        y,
        width,
        height,
      });
    }
    return infos;
  }
}
