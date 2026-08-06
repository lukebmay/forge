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

// Debounce workareas thrash (blank/wake, DPMS); hybrid needs >200ms.
export const WORKAREAS_SETTLE_MS = 300;
/** After unlock-from-sleep, monitors/colord thrash longer — wait before settle. */
export const WORKAREAS_SETTLE_AFTER_UNLOCK_MS = 900;
/** Post-unlock shield so soft-rehome re-applies lock-time forest (µs). */
export const LOCK_SHIELD_AFTER_UNLOCK_US = 8_000_000;

/**
 * move_to_monitor when mon differs; never call native on unready windows.
 * try/catch cannot stop a Mutter SIGSEGV — gate hard before the call.
 * Wayland: get_monitor() === -1 (map/unmap, Nautilus close) + move_to_monitor
 * SEGVs gnome-shell (seen 2026-08-05: soft-rehome.js:58 via move() apply).
 */
export function safeMoveToMonitor(metaWindow, monIdx, logTag = "move_to_monitor") {
  if (!metaWindow || monIdx < 0) return false;
  if (!Utils.isWindowAlive(metaWindow)) return false;
  try {
    const n = global.display?.get_n_monitors?.() ?? 0;
    if (monIdx >= n) return false;
    // No logical monitor / no workspace / no actor: native move_to_monitor can
    // SIGSEGV (stack_position < 0). Skip; move_resize_frame may still place later.
    const cur = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : -1;
    if (cur < 0 || cur === monIdx) return false;
    if (typeof metaWindow.get_workspace === "function" && !metaWindow.get_workspace()) {
      return false;
    }
    if (typeof metaWindow.get_compositor_private === "function") {
      if (!metaWindow.get_compositor_private()) return false;
    }
    if (typeof metaWindow.move_to_monitor !== "function") return false;
    metaWindow.move_to_monitor(monIdx);
    return true;
  } catch (e) {
    Logger.debug(`${logTag} skipped: ${e}`);
  }
  return false;
}

/** Soft rehome (H1) + workareas settle. Thrash/last-good state is live on `_extWm`. */
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

  queueSoftRehomeOnWorkareas() {
    const wm = this._extWm;
    wm._workareasThrashPending = true;
    // While locked, hold the thrash flag (suppress entered-monitor reparent)
    // but do not settle against DPMS thrash — unlock arms shield + settle.
    if (wm._sessionLocked) {
      wm._clearTimeoutId("_workareasSettleSrcId");
      sessionLayoutTrace("session-layout: workareas while locked (hold, no settle)");
      return;
    }
    wm._clearTimeoutId("_workareasSettleSrcId");
    // Unlock-from-sleep: heads/colord often thrash longer than 300ms.
    const settleMs = wm._unlockWorkareasSettleBoost
      ? WORKAREAS_SETTLE_AFTER_UNLOCK_MS
      : WORKAREAS_SETTLE_MS;
    wm._workareasSettleSrcId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settleMs, () => {
      wm._workareasSettleSrcId = 0;
      wm._unlockWorkareasSettleBoost = false;
      try {
        // Via WM so unit spies on WindowManager still intercept.
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

  /** Rehome by last-good geometry; Meta mon first, then reconcile + T6 restore. */
  softRehomeAfterWorkareas() {
    const wm = this._extWm;
    if (global.display.get_n_monitors() === 0) {
      wm._workareasThrashPending = false;
      return;
    }
    // Lock/DPMS: do not settle against thrash geometry. Lock shield was armed
    // on unlock-dialog; reapply only after user session (see onSessionUnlocked).
    if (wm._sessionLocked) {
      sessionLayoutTrace("session-layout: soft-rehome → locked skip (shield held)");
      wm._workareasThrashPending = false;
      return;
    }
    // Defer until session restore seeds last-good.
    if (wm._sessionLayoutRestoring) {
      wm._queueSoftRehomeOnWorkareas();
      return;
    }
    // Post-restore / post-lock thrash: reapply shield forest instead of
    // snapshotTree() freezing Meta-piled windows into last-good.
    if (wm._sessionLayoutShieldActive()) {
      sessionLayoutTrace("session-layout: soft-rehome → shield path");
      if (wm._reapplySessionLayoutShield("workareas-session-shield")) {
        wm._workareasThrashPending = false;
        return;
      }
      sessionLayoutTrace("session-layout: soft-rehome shield failed → normal");
      wm._sessionLayoutShield = null;
    }

    sessionLayoutTrace("session-layout: soft-rehome → normal settle");
    const nMonitors = global.display.get_n_monitors();
    const geometries = [];
    for (let i = 0; i < nMonitors; i++) {
      geometries.push(global.display.get_monitor_geometry(i));
    }

    // Snapshot before identity refresh so stableKeys match quiet-time heads.
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
      // Prefer shield over wipe+track (session-layout.json already cleared).
      if (wm._sessionLayoutShieldActive() && wm._reapplySessionLayoutShield("soft-rehome-shield")) {
        wm._workareasThrashPending = false;
        return;
      }
      Logger.debug("soft-rehome: tree inconsistent, reloadTree (fresh snapshot inside)");
      wm.reloadTree("workareas-soft-rehome-inconsistent");
      return;
    }

    this.alignSoftRehomeGroupTargets(targets, nMonitors);

    for (const [wNode, targetMon] of targets) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) continue;
      safeMoveToMonitor(metaWindow, targetMon, "soft-rehome move_to_monitor");
    }

    // After Meta mon moves so containers migrate intact; T6 rebuilds if flat.
    wm._reconcileWindowHomes();
    wm.tree.restoreTreeIfNeeded(treeSnapshot);
    wm._lftTouchFocusAfterRestore();
    wm.renderTree("workareas-soft-rehome");
  }

  /** Majority-align outermost STACKED/TABBED targets (avoids partial unwrap). */
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

  /** stableKey → frame ∩ → last-good index → Meta mon. */
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

  /** Quiet-time mon+frame for thrash recovery. */
  snapshotLastGoodHomes() {
    const wm = this._extWm;
    if (wm._workareasThrashPending) return;
    const nMonitors = global.display.get_n_monitors();
    if (nMonitors === 0) return;

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
