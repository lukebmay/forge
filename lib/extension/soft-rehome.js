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
import GLib from "gi://GLib";
import GObject from "gi://GObject";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import { LAYOUT_TYPES, NODE_TYPES } from "./tree.js";
import * as MonitorIdentity from "./monitor-identity.js";
import { sessionLayoutTrace } from "./session-layout-restore.js";

// Debounce workareas thrash (blank/wake, DPMS, dock struts) before soft-rehome.
// Hybrid GPU (AMD+NVIDIA) blank/wake can fire longer geometry bursts than 200ms.
export const WORKAREAS_SETTLE_MS = 300;

/**
 * Try/catch Meta.Window.move_to_monitor when the monitor actually differs.
 * @param {Meta.Window|null|undefined} metaWindow
 * @param {number} monIdx
 * @param {string} [logTag]
 * @returns {boolean} true if move_to_monitor was invoked
 */
export function safeMoveToMonitor(metaWindow, monIdx, logTag = "move_to_monitor") {
  if (!metaWindow || monIdx < 0) return false;
  try {
    if (typeof metaWindow.move_to_monitor === "function" && metaWindow.get_monitor() !== monIdx) {
      metaWindow.move_to_monitor(monIdx);
      return true;
    }
  } catch (e) {
    Logger.debug(`${logTag} skipped: ${e}`);
  }
  return false;
}

/**
 * SoftRehomeManager owns workareas settle debounce + soft rehome (H1).
 * Extracted from window.js (WindowManager). Shared thrash/last-good state lives
 * on WindowManager and is read LIVE via this._extWm:
 *   _workareasThrashPending, _workareasSettleSrcId, _lastGoodHomes,
 *   _sessionLayoutRestoring, _sessionLayoutShield, _monitorLiveMap*, tree, …
 */
export class SoftRehomeManager extends GObject.Object {
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
   * Debounce workareas thrash, then soft-rehome + re-render once geometries settle.
   */
  queueSoftRehomeOnWorkareas() {
    const wm = this._extWm;
    wm._workareasThrashPending = true;
    wm._clearTimeoutId("_workareasSettleSrcId");
    wm._workareasSettleSrcId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WORKAREAS_SETTLE_MS, () => {
      wm._workareasSettleSrcId = 0;
      try {
        // Route through WM so spies on WindowManager still intercept.
        wm._softRehomeAfterWorkareas();
      } catch (e) {
        Logger.warn(`soft-rehome settle failed, falling back to reloadTree: ${e}`);
        wm._workareasThrashPending = false;
        if (
          wm._sessionLayoutShieldActive() &&
          wm._reapplySessionLayoutShield("soft-rehome-fallback-shield")
        ) {
          return false;
        }
        wm.reloadTree("workareas-soft-rehome-fallback");
      }
      return false;
    });
  }

  /**
   * Restore windows to the best monitor by last-good geometry (intersection area),
   * re-parenting the tree without a full wipe when structure is still consistent.
   * Assign Meta.Window monitors first, then one reconcile pass so intact CONs migrate
   * together (forge-6pe). Tab/stack groups are majority-aligned and re-wrapped if
   * partial migration still flattened them (T3 / daily-driver blank-wake).
   */
  softRehomeAfterWorkareas() {
    const wm = this._extWm;
    if (global.display.get_n_monitors() === 0) {
      wm._workareasThrashPending = false;
      return;
    }
    // Defer until session restore seeds last-good from portable frames.
    if (wm._sessionLayoutRestoring) {
      // Route through WM so spies intercept.
      wm._queueSoftRehomeOnWorkareas();
      return;
    }
    // Install HUP: Meta thrash after restore can break the tree; soft-rehome would
    // snapshotTree() that thrash and freeze mo0 tabs-only + extra Ghostty on mo1.
    // Re-apply the restored forest instead (seeded last-good alone is not enough).
    if (wm._sessionLayoutShieldActive()) {
      sessionLayoutTrace("session-layout: soft-rehome → shield path");
      if (wm._reapplySessionLayoutShield("workareas-session-shield")) {
        wm._workareasThrashPending = false;
        return;
      }
      // Malformed shield — fall through to normal soft rehome.
      sessionLayoutTrace("session-layout: soft-rehome shield failed → normal");
      wm._sessionLayoutShield = null;
    }

    sessionLayoutTrace("session-layout: soft-rehome → normal settle");
    const nMonitors = global.display.get_n_monitors();
    const geometries = [];
    for (let i = 0; i < nMonitors; i++) {
      geometries.push(global.display.get_monitor_geometry(i));
    }

    // T6: full forest before rehome (H/V + tabs + percents). Snapshot uses the
    // pre-refresh identity map so mon stableKeys still match quiet-time heads.
    // Then T7 refreshes the map for rehome / resolveTargetMonitor.
    const treeSnapshot = wm.tree.snapshotTree();
    wm._refreshMonitorIdentityMap();

    const windowNodes = [...wm.tree.getNodeByType(NODE_TYPES.WINDOW)];
    /** @type {Map<object, number>} WINDOW node → target monitor index */
    const targets = new Map();
    let structureOk = true;

    for (const wNode of windowNodes) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow) || !wm._validWindow(metaWindow)) continue;
      const ws = metaWindow.get_workspace();
      if (!ws) continue;

      // Route through WM so spies intercept.
      const targetMon = wm._resolveSoftRehomeMonitor(wNode, geometries, nMonitors);
      if (targetMon < 0 || targetMon >= nMonitors) {
        structureOk = false;
        break;
      }

      const destId = Utils.createMonitorWorkspaceId(targetMon, ws.index());
      if (!wm.tree.findNode(destId)) {
        structureOk = false;
        break;
      }
      targets.set(wNode, targetMon);
    }

    wm._workareasThrashPending = false;

    if (!structureOk) {
      // Prefer session shield over full wipe+track (would lose cleared session-layout.json).
      if (wm._sessionLayoutShieldActive() && wm._reapplySessionLayoutShield("soft-rehome-shield")) {
        wm._workareasThrashPending = false;
        return;
      }
      Logger.debug("soft-rehome: tree inconsistent, reloadTree (fresh snapshot inside)");
      wm.reloadTree("workareas-soft-rehome-inconsistent");
      return;
    }

    // Force STACKED/TABBED members onto the majority target so CON migrates intact.
    this.alignSoftRehomeGroupTargets(targets, nMonitors);

    for (const [wNode, targetMon] of targets) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) continue;
      safeMoveToMonitor(metaWindow, targetMon, "soft-rehome move_to_monitor");
    }

    // Single pass: containerFullyMigrates sees final Meta.Window monitors.
    wm._reconcileWindowHomes();
    // Intact mon topology → percents only; unwrapped/flat → full rebuild.
    wm.tree.restoreTreeIfNeeded(treeSnapshot);
    wm._lftTouchFocusAfterRestore();
    wm.renderTree("workareas-soft-rehome");
  }

  /**
   * Align soft-rehome targets for outermost STACKED/TABBED groups to the majority
   * monitor among members. Prevents one divergent last-good frame from peeling a
   * single tab out of the group (partial CON migrate → unwrap).
   *
   * @param {Map<object, number>} targets - WINDOW node → monitor index
   * @param {number} nMonitors
   */
  alignSoftRehomeGroupTargets(targets, nMonitors) {
    const wm = this._extWm;
    for (const layout of [LAYOUT_TYPES.STACKED, LAYOUT_TYPES.TABBED]) {
      for (const con of wm.tree.getNodeByLayout(layout)) {
        if (con.childNodes.length < 2) continue;
        if (wm.tree._hasStackedOrTabbedAncestor(con)) continue;

        const members = con.getNodeByType(NODE_TYPES.WINDOW).filter((wn) => targets.has(wn));
        if (members.length < 2) continue;

        const counts = new Map();
        for (const wn of members) {
          const mon = targets.get(wn);
          counts.set(mon, (counts.get(mon) || 0) + 1);
        }
        let bestMon = -1;
        let bestCount = 0;
        for (const [mon, count] of counts) {
          if (count > bestCount) {
            bestCount = count;
            bestMon = mon;
          }
        }
        if (bestMon < 0 || bestMon >= nMonitors) continue;
        for (const wn of members) {
          targets.set(wn, bestMon);
        }
      }
    }
  }

  /**
   * Pick monitor index for a window during soft rehome:
   * stableKey remap (survives index renumber), then max intersection with
   * last-good frame, then last-good index, then Meta's current monitor.
   */
  resolveSoftRehomeMonitor(wNode, geometries, nMonitors) {
    const wm = this._extWm;
    const metaWindow = wNode.nodeValue;
    const home = wm._lastGoodHomes.get(metaWindow);

    if (home?.stableKey && wm._monitorLiveMap) {
      const byKey = MonitorIdentity.resolveIndexByStableKey(home.stableKey, wm._monitorLiveMap);
      if (byKey >= 0 && byKey < nMonitors) return byKey;
    }

    const frame =
      (home && home.frame) ||
      (wNode.rect && wNode.rect.width > 0 ? wNode.rect : null) ||
      (typeof metaWindow.get_frame_rect === "function" ? metaWindow.get_frame_rect() : null);

    if (frame) {
      const byArea = Utils.bestMonitorIndexForRect(frame, geometries);
      if (byArea >= 0 && byArea < nMonitors) return byArea;
    }

    if (home && home.monitorIndex >= 0) {
      const remapped = MonitorIdentity.remapIndex(
        home.monitorIndex,
        wm._monitorLiveMapPrevFingerprints,
        wm._monitorLiveMap
      );
      if (remapped >= 0 && remapped < nMonitors) return remapped;
      if (home.monitorIndex < nMonitors) return home.monitorIndex;
    }
    const live = metaWindow.get_monitor();
    if (live >= 0 && live < nMonitors) return live;
    return nMonitors > 0 ? 0 : -1;
  }

  /**
   * Record last quiet monitor + frame for each live window (used after thrash).
   */
  snapshotLastGoodHomes() {
    const wm = this._extWm;
    if (wm._workareasThrashPending) return;
    const nMonitors = global.display.get_n_monitors();
    if (nMonitors === 0) return;

    // Keep map fresh so homes get current stableKeys.
    if (!wm._monitorLiveMap) wm._refreshMonitorIdentityMap();

    for (const wNode of wm.tree.getNodeByType(NODE_TYPES.WINDOW)) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) continue;
      const monIdx = wm._monitorIndexOfNode(wNode);
      if (monIdx < 0) continue;
      let frame = null;
      if (wNode.rect && wNode.rect.width > 0 && wNode.rect.height > 0) {
        frame = {
          x: wNode.rect.x,
          y: wNode.rect.y,
          width: wNode.rect.width,
          height: wNode.rect.height,
        };
      } else if (typeof metaWindow.get_frame_rect === "function") {
        const r = metaWindow.get_frame_rect();
        if (r) frame = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      if (!frame) continue;
      const stableKey = wm._monitorLiveMap?.byIndex?.get(monIdx) ?? null;
      wm._lastGoodHomes.set(metaWindow, {
        monitorIndex: monIdx,
        stableKey,
        frame,
      });
    }
  }
}
