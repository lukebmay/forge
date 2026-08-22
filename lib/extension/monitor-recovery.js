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
import St from "gi://St";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import * as Utils from "./utils.js";
import { LAYOUT_TYPES, NODE_TYPES } from "./tree.js";
import * as MonitorIdentity from "./monitor-identity.js";
import {
  buildWorkareasFingerprint,
  classifyWorkareasChange,
  deadMonitorIndices,
  homesMatchLastGoodSamples,
  pickCollectSurvivorIndex,
  workareasFingerprintsEqual,
  workareasGeometryEqual,
} from "./workareas-policy.js";
import { sessionLayoutTrace } from "./session-layout-restore.js";
import { policyOnDisplaysChangedDuringApply } from "./layout-apply-epoch.js";

// Debounce workareas thrash (blank/wake, DPMS); hybrid needs >200ms.
export const WORKAREAS_SETTLE_MS = 300;
/** After unlock-from-sleep, monitors/colord thrash longer — wait before settle. */
export const WORKAREAS_SETTLE_AFTER_UNLOCK_MS = 900;
/** Post-unlock shield so monitor-recovery re-applies lock-time forest (µs). */
export const LOCK_SHIELD_AFTER_UNLOCK_US = 8_000_000;
/**
 * R017: defer entered-monitor rehome so monitors-changed / workareas can arm
 * thrash-pending during ApplyMonitorsConfig (entered-monitor often races first
 * while geometry still matches quiet).
 */
export const ENTERED_MONITOR_REHOME_DEFER_MS = 80;
/** After workareas settle (retile/H1), keep suppressing entered-monitor rehomes. */
export const DISPLAY_RECONFIG_GRACE_MS = 600;

/**
 * move_to_monitor when mon differs; never call native on unready windows.
 * try/catch cannot stop a Mutter SIGSEGV — gate hard before the call.
 * Wayland: get_monitor() === -1 (map/unmap, Nautilus close) + move_to_monitor
 * SEGVs gnome-shell (seen 2026-08-05: monitor-recovery.js:58 via move() apply).
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

/** Monitor-recovery (H1; formerly soft-rehome) + workareas settle. State on `_extWm`. */
export class MonitorRecoveryManager extends GObject.Object {
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
   * R016: true no-op when geometry fingerprint matches last quiet and homes OK.
   * Skip thrash-pending entirely (no debounce / entered-monitor suppress).
   *
   * Uses **fresh display geometry** (not stale `_monitorLiveMap`) so a lagging
   * identity map cannot false-noop while Mutter is mid-reconfig (R017 host smoke).
   */
  shouldSkipWorkareasAsNoop() {
    const wm = this._extWm;
    if (
      wm._sessionLocked ||
      wm._unlockWorkareasSettleBoost ||
      wm._sessionLayoutRestoring ||
      wm._sessionLayoutShieldActive?.()
    ) {
      return false;
    }
    const quiet = wm._lastQuietWorkareasFp;
    if (!quiet?.monitors?.length) return false;
    // Geometry-only + fresh display: map may still hold pre-scale rects.
    const liveDisp = this._buildDisplayWorkareasFingerprint();
    if (!workareasGeometryEqual(quiet, liveDisp)) return false;
    if (!this.homesMatchLastGood()) return false;
    return true;
  }

  /**
   * R017: quiet baseline exists and live display geometry (scale/mode/pos) differs.
   * Reads display geometry fresh — not `_monitorLiveMap`, which can lag Mutter
   * reconfig while `window-entered-monitor` already fires.
   * Geometry-only compare so connector-keyed quiet fps still detect scale drift.
   * @returns {boolean}
   */
  displayGeometryChangedFromQuiet() {
    const wm = this._extWm;
    const quiet = wm._lastQuietWorkareasFp;
    if (!quiet?.monitors?.length) return false;
    const liveFp = this._buildDisplayWorkareasFingerprint();
    return !workareasGeometryEqual(quiet, liveFp);
  }

  /**
   * Fingerprint from live display geometry (and connectors when Shell provides them).
   * Does not consult or mutate `_monitorLiveMap`.
   * @returns {import('./workareas-policy.js').WorkareasFingerprint}
   */
  _buildDisplayWorkareasFingerprint() {
    const wm = this._extWm;
    let infos = null;
    try {
      infos = wm.tree?.monitorManager?.collectLiveMonitorsInfo?.(null);
    } catch (_e) {
      infos = null;
    }
    if (!infos?.length) infos = this._fallbackMonitorsInfo();
    return buildWorkareasFingerprint(infos);
  }

  queueMonitorRecoveryOnWorkareas() {
    const wm = this._extWm;
    // R016 L0: identical geometry + homes still correct → never arm thrash.
    if (this.shouldSkipWorkareasAsNoop()) {
      Logger.debug("workareas-noop: fingerprint match");
      return;
    }
    // D039: real workareas/monitors change mid-apply → cancel; do not interleave H1.
    const applyPolicy =
      typeof wm.notifyDisplaysChangedDuringApply === "function"
        ? wm.notifyDisplaysChangedDuringApply()
        : policyOnDisplaysChangedDuringApply(wm._applyEpoch);
    if (applyPolicy.skipH1) {
      Logger.debug("workareas during ApplyEpoch: cancel apply, skip H1");
      return;
    }
    wm._workareasThrashPending = true;
    // Suppress residual entered-monitor for the whole settle + post-settle window.
    this.armDisplayReconfigGrace(WORKAREAS_SETTLE_MS + DISPLAY_RECONFIG_GRACE_MS);
    // While locked, hold the thrash flag (suppress entered-monitor reparent)
    // but do not settle against DPMS thrash — unlock arms shield + settle.
    if (wm._sessionLocked) {
      wm._wmSources.cancel("workareasSettle");
      sessionLayoutTrace("session-layout: workareas while locked (hold, no settle)");
      return;
    }
    // Unlock-from-sleep: heads/colord often thrash longer than 300ms.
    const settleMs = wm._unlockWorkareasSettleBoost
      ? WORKAREAS_SETTLE_AFTER_UNLOCK_MS
      : WORKAREAS_SETTLE_MS;
    wm._wmSources.set("workareasSettle", settleMs, () => {
      wm._unlockWorkareasSettleBoost = false;
      try {
        // Via WM so unit spies on WindowManager still intercept.
        wm._recoverAfterWorkareas();
      } catch (e) {
        Logger.warn(`monitor-recovery settle failed, falling back to reloadTree: ${e}`);
        wm._workareasThrashPending = false;
        if (
          wm._sessionLayoutShieldActive() &&
          wm._reapplySessionLayoutShield("monitor-recovery-fallback-shield")
        ) {
          return;
        }
        wm.reloadTree("workareas-monitor-recovery-fallback");
      }
    });
  }

  /** Rehome by last-good geometry; Meta mon first, then reconcile + T6 restore. */
  recoverAfterWorkareas() {
    const wm = this._extWm;
    if (global.display.get_n_monitors() === 0) {
      wm._workareasThrashPending = false;
      return;
    }
    // Lock/DPMS: do not settle against thrash geometry. Lock shield was armed
    // on unlock-dialog; reapply only after user session (see onSessionUnlocked).
    if (wm._sessionLocked) {
      sessionLayoutTrace("session-layout: monitor-recovery → locked skip (shield held)");
      wm._workareasThrashPending = false;
      return;
    }
    // Defer until session restore seeds last-good.
    if (wm._sessionLayoutRestoring) {
      wm._queueMonitorRecoveryOnWorkareas();
      return;
    }
    // Post-restore / post-lock thrash: reapply shield forest instead of
    // snapshotTree() freezing Meta-piled windows into last-good.
    if (wm._sessionLayoutShieldActive()) {
      sessionLayoutTrace("session-layout: monitor-recovery → shield path");
      if (wm._reapplySessionLayoutShield("workareas-session-shield")) {
        wm._workareasThrashPending = false;
        return;
      }
      sessionLayoutTrace("session-layout: monitor-recovery shield failed → normal");
      wm._sessionLayoutShield = null;
    }

    // R016: classify vs last quiet fingerprint before H1 rehome storm.
    const prevFp = wm._lastQuietWorkareasFp;
    // Snapshot forest before identity refresh so stableKeys match quiet heads.
    const treeSnapshot = wm.tree.snapshotTree();
    wm._refreshMonitorIdentityMap();
    const nextFp = this._buildLiveWorkareasFingerprint();
    let kind = classifyWorkareasChange(prevFp, nextFp);
    Logger.trace(
      `workareas classify kind=${kind} prevN=${prevFp?.monitors?.length ?? 0} nextN=${
        nextFp?.monitors?.length ?? 0
      }`
    );
    const homesOk = this.homesMatchLastGood();

    if (kind === "noop") {
      if (homesOk) {
        Logger.debug("workareas-noop: settle fingerprint match");
        wm._workareasThrashPending = false;
        this._storeQuietWorkareasFingerprint(nextFp);
        return;
      }
      // Same geom, Meta piled / tree drift → H1.
      kind = "thrash";
    }

    if (kind === "retile" || kind === "mon_gain") {
      Logger.debug(`workareas-settle: kind=${kind}`);
      this._ensureLiveMonitorNodes();
      // Structure is truth after scale/mode: pull Meta onto tree mon (not rehome tree).
      this._alignMetaMonsToTree();
      wm._workareasThrashPending = false;
      this._storeQuietWorkareasFingerprint(nextFp);
      this.armDisplayReconfigGrace();
      wm.renderTree(kind === "mon_gain" ? "workareas-mon-gain" : "workareas-retile");
      return;
    }

    if (kind === "mon_loss") {
      Logger.debug("workareas-settle: kind=mon_loss");
      this._collectMonLossToSurvivor(prevFp, nextFp, treeSnapshot);
      this.armDisplayReconfigGrace();
      return;
    }

    // thrash / renumber / mixed / unclassifiable → H1 body
    Logger.debug(`workareas-settle: kind=${kind} → H1`);
    sessionLayoutTrace("session-layout: monitor-recovery → normal settle");
    this._runH1MonitorRecovery(treeSnapshot, nextFp);
    this.armDisplayReconfigGrace();
  }

  /**
   * After structure-preserving settle, suppress residual entered-monitor rehomes
   * while Meta finishes scale/mode geometry (R017 reverse thrash).
   * @param {number} [ms]
   */
  armDisplayReconfigGrace(ms = DISPLAY_RECONFIG_GRACE_MS) {
    const wm = this._extWm;
    const now =
      typeof GLib !== "undefined" && typeof GLib.get_monotonic_time === "function"
        ? GLib.get_monotonic_time()
        : Date.now() * 1000;
    const until = now + Math.max(0, ms) * 1000;
    wm._displayReconfigGraceUntilUs = Math.max(wm._displayReconfigGraceUntilUs || 0, until);
  }

  /** @returns {boolean} */
  inDisplayReconfigGrace() {
    const wm = this._extWm;
    const until = wm._displayReconfigGraceUntilUs || 0;
    if (until <= 0) return false;
    const now =
      typeof GLib !== "undefined" && typeof GLib.get_monotonic_time === "function"
        ? GLib.get_monotonic_time()
        : Date.now() * 1000;
    return now < until;
  }

  /**
   * Move Meta windows to match tree monitor (structure-preserving retile).
   * Does not reparent tree nodes.
   */
  _alignMetaMonsToTree() {
    const wm = this._extWm;
    const n = global.display?.get_n_monitors?.() ?? 0;
    if (n <= 0) return;
    for (const wNode of wm.tree.getNodeByType(NODE_TYPES.WINDOW) || []) {
      const meta = wNode.nodeValue;
      if (!Utils.isWindowAlive(meta)) continue;
      if (wm._validWindow && !wm._validWindow(meta)) continue;
      const treeMon = wm._monitorIndexOfNode?.(wNode) ?? -1;
      if (treeMon < 0 || treeMon >= n) continue;
      safeMoveToMonitor(meta, treeMon, "workareas-retile align Meta→tree");
    }
  }

  /**
   * H1 pile recovery (last-good rehome + T6 restore).
   * @param {object|null} treeSnapshot
   * @param {import('./workareas-policy.js').WorkareasFingerprint|null} nextFp
   */
  _runH1MonitorRecovery(treeSnapshot, nextFp) {
    const wm = this._extWm;
    const nMonitors = global.display.get_n_monitors();
    const geometries = [];
    for (let i = 0; i < nMonitors; i++) {
      geometries.push(global.display.get_monitor_geometry(i));
    }

    const windowNodes = [...wm.tree.getNodeByType(NODE_TYPES.WINDOW)];
    /** @type {Map<object, number>} WINDOW node → target monitor index */
    const targets = new Map();
    let structureOk = true;

    for (const wNode of windowNodes) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow) || !wm._validWindow(metaWindow)) continue;
      const ws = metaWindow.get_workspace();
      if (!ws) continue;

      const targetMon = wm._resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors);
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
      if (
        wm._sessionLayoutShieldActive() &&
        wm._reapplySessionLayoutShield("monitor-recovery-shield")
      ) {
        wm._workareasThrashPending = false;
        return;
      }
      Logger.debug("monitor-recovery: tree inconsistent, reloadTree (fresh snapshot inside)");
      wm.reloadTree("workareas-monitor-recovery-inconsistent");
      return;
    }

    this.alignMonitorRecoveryGroupTargets(targets, nMonitors);

    for (const [wNode, targetMon] of targets) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) continue;
      safeMoveToMonitor(metaWindow, targetMon, "monitor-recovery move_to_monitor");
    }

    // After Meta mon moves so containers migrate intact; T6 rebuilds if flat.
    wm._reconcileWindowHomes();
    wm.tree.restoreTreeIfNeeded(treeSnapshot);
    wm._lftTouchFocusAfterRestore();
    wm.renderTree("workareas-monitor-recovery");
    this._storeQuietWorkareasFingerprint(nextFp);
  }

  /**
   * Mon loss: append dead-mon forest to end of survivor as a group (no H/V geom infer).
   * @param {import('./workareas-policy.js').WorkareasFingerprint} prevFp
   * @param {import('./workareas-policy.js').WorkareasFingerprint} nextFp
   * @param {object|null} _treeSnapshot
   */
  _collectMonLossToSurvivor(prevFp, nextFp, _treeSnapshot) {
    const wm = this._extWm;
    const survivorIdx = pickCollectSurvivorIndex(nextFp);
    const deadIdxs = deadMonitorIndices(prevFp, nextFp);
    const nMonitors = global.display.get_n_monitors();
    if (survivorIdx < 0 || survivorIdx >= nMonitors || deadIdxs.length === 0) {
      // Degenerate: fall back to H1.
      this._runH1MonitorRecovery(wm.tree.snapshotTree(), nextFp);
      return;
    }

    this._ensureLiveMonitorNodes();

    const monNodes = wm.tree.getNodeByType(NODE_TYPES.MONITOR) || [];
    for (const deadIdx of deadIdxs) {
      for (const deadMon of monNodes) {
        if (!deadMon?.nodeValue) continue;
        const idx = Utils.monitorIndex(deadMon.nodeValue);
        if (idx !== deadIdx) continue;
        const ws = MonitorIdentity.workspaceFromId(deadMon.nodeValue);
        if (ws < 0) continue;
        const survivorId = Utils.createMonitorWorkspaceId(survivorIdx, ws);
        const survivorMon = wm.tree.findNode(survivorId);
        if (!survivorMon) continue;

        const children = [...(deadMon.childNodes || [])];
        if (children.length === 0) {
          this._pruneEmptyMonitorNode(deadMon);
          continue;
        }

        /** @type {any[]} windows under collected units (for Meta mon) */
        const collectedWins = [];
        for (const c of children) {
          if (typeof c.getNodeByType === "function") {
            collectedWins.push(...c.getNodeByType(NODE_TYPES.WINDOW));
          } else if (c.nodeType === NODE_TYPES.WINDOW) {
            collectedWins.push(c);
          }
        }

        if (children.length === 1) {
          survivorMon.appendChild(children[0]);
        } else {
          // CON nodeValue is St.Bin (same as split / T6 createCon).
          const con = wm.tree.createNode(survivorMon.nodeValue, NODE_TYPES.CON, new St.Bin());
          if (con) {
            con.layout = survivorMon.layout || LAYOUT_TYPES.HSPLIT;
            for (const c of children) {
              con.appendChild(c);
            }
          } else {
            for (const c of children) survivorMon.appendChild(c);
          }
        }

        for (const wNode of collectedWins) {
          const meta = wNode.nodeValue;
          if (!Utils.isWindowAlive(meta)) continue;
          safeMoveToMonitor(meta, survivorIdx, "workareas-mon-loss collect");
        }

        wm.tree.redistributeSiblingPercent?.(survivorMon);
        this._pruneEmptyMonitorNode(deadMon);
      }
    }

    wm._workareasThrashPending = false;
    this._storeQuietWorkareasFingerprint(nextFp);
    wm.renderTree("workareas-mon-loss-collect");
  }

  /** Drop empty dead MONITOR scaffold when safe. */
  _pruneEmptyMonitorNode(monNode) {
    if (!monNode || (monNode.childNodes && monNode.childNodes.length > 0)) return;
    const parent = monNode.parentNode;
    if (!parent) return;
    try {
      if (monNode.actorBin && global.window_group?.contains?.(monNode.actorBin)) {
        global.window_group.remove_child(monNode.actorBin);
        monNode.actorBin.destroy?.();
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      parent.removeChild(monNode);
    } catch (_e) {
      /* ignore */
    }
  }

  /** Ensure moNwsW exists for every live monitor index (mon_gain empty roots). */
  _ensureLiveMonitorNodes() {
    const wm = this._extWm;
    const n = global.display?.get_n_monitors?.() ?? 0;
    if (n <= 0) return;
    const wsNodes = wm.tree.getNodeByType(NODE_TYPES.WORKSPACE) || [];
    for (const wsNode of wsNodes) {
      const wsVal = wsNode?.nodeValue;
      if (typeof wsVal !== "string" || !wsVal.startsWith("ws")) continue;
      const wsIdx = parseInt(wsVal.slice(2), 10);
      if (!Number.isFinite(wsIdx) || wsIdx < 0) continue;
      for (let mi = 0; mi < n; mi++) {
        const id = Utils.createMonitorWorkspaceId(mi, wsIdx);
        if (wm.tree.findNode(id)) continue;
        try {
          const mon = wm.tree.createNode(wsVal, NODE_TYPES.MONITOR, id);
          if (!mon) continue;
          let monitorRect = null;
          try {
            monitorRect = global.display.get_monitor_geometry(mi);
          } catch (_e) {
            monitorRect = null;
          }
          mon.layout =
            wm.determineSplitLayoutForRect?.(monitorRect) || mon.layout || LAYOUT_TYPES.HSPLIT;
        } catch (e) {
          Logger.debug(`ensure mon node ${id}: ${e}`);
        }
      }
    }
  }

  /**
   * Tree mon + last-good mon agree with Meta mon for tiled windows.
   * @returns {boolean}
   */
  homesMatchLastGood() {
    const wm = this._extWm;
    const samples = [];
    const nMonitors = global.display?.get_n_monitors?.() ?? 0;
    for (const wNode of wm.tree.getNodeByType(NODE_TYPES.WINDOW) || []) {
      const metaWindow = wNode.nodeValue;
      if (!Utils.isWindowAlive(metaWindow)) continue;
      if (wm._validWindow && !wm._validWindow(metaWindow)) continue;
      let metaMon = -1;
      try {
        metaMon = typeof metaWindow.get_monitor === "function" ? metaWindow.get_monitor() : -1;
      } catch (_e) {
        metaMon = -1;
      }
      const treeMon = wm._monitorIndexOfNode?.(wNode) ?? -1;
      let lastGoodMon = -1;
      const home = wm._lastGoodHomes?.get?.(metaWindow);
      if (home) {
        if (home.stableKey && wm._monitorLiveMap) {
          const byKey = MonitorIdentity.resolveIndexByStableKey(home.stableKey, wm._monitorLiveMap);
          if (byKey >= 0 && byKey < nMonitors) lastGoodMon = byKey;
        }
        if (lastGoodMon < 0 && home.monitorIndex >= 0 && home.monitorIndex < nMonitors) {
          lastGoodMon = home.monitorIndex;
        }
      }
      samples.push({ treeMon, metaMon, lastGoodMon });
    }
    return homesMatchLastGoodSamples(samples);
  }

  /** @returns {import('./workareas-policy.js').WorkareasFingerprint} */
  _buildLiveWorkareasFingerprint() {
    const wm = this._extWm;
    // Prefer live identity map (connectors when Shell refresh saw layoutManager).
    const fps = wm._monitorLiveMap?.fingerprints;
    if (fps?.length) return buildWorkareasFingerprint(fps);
    const infos =
      wm.tree?.monitorManager?.collectLiveMonitorsInfo?.(null) ?? this._fallbackMonitorsInfo();
    return buildWorkareasFingerprint(infos);
  }

  /** Geometry-only infos when MonitorManager is unavailable. */
  _fallbackMonitorsInfo() {
    const display = global.display;
    if (!display?.get_n_monitors) return [];
    const n = display.get_n_monitors() || 0;
    let primary = 0;
    try {
      if (typeof display.get_primary_monitor === "function") {
        primary = display.get_primary_monitor();
      }
    } catch (_e) {
      primary = 0;
    }
    const infos = [];
    for (let i = 0; i < n; i++) {
      let g = { x: 0, y: 0, width: 0, height: 0 };
      try {
        g = display.get_monitor_geometry(i) || g;
      } catch (_e) {
        /* zeros */
      }
      infos.push({
        index: i,
        isPrimary: i === primary,
        x: g.x ?? 0,
        y: g.y ?? 0,
        width: g.width ?? 0,
        height: g.height ?? 0,
      });
    }
    return infos;
  }

  /** @param {import('./workareas-policy.js').WorkareasFingerprint|null} [fp] */
  _storeQuietWorkareasFingerprint(fp = null) {
    const wm = this._extWm;
    wm._lastQuietWorkareasFp = fp || this._buildLiveWorkareasFingerprint();
  }

  /** Majority-align outermost STACKED/TABBED targets (avoids partial unwrap). */
  alignMonitorRecoveryGroupTargets(targets, nMonitors) {
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
   * stableKey → last-good index (remapped) → frame ∩ → Meta mon.
   * Index before frame: after scale change last-good frames are in the old
   * logical coordinate space and mis-assign via max-intersection (R017 reverse).
   */
  resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors) {
    const wm = this._extWm;
    const metaWindow = wNode.nodeValue;
    const home = wm._lastGoodHomes.get(metaWindow);

    if (home?.stableKey && wm._monitorLiveMap) {
      const byKey = MonitorIdentity.resolveIndexByStableKey(home.stableKey, wm._monitorLiveMap);
      if (byKey >= 0 && byKey < nMonitors) return byKey;
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

    const frame =
      (home && home.frame) ||
      (wNode.rect && wNode.rect.width > 0 ? wNode.rect : null) ||
      (typeof metaWindow.get_frame_rect === "function" ? metaWindow.get_frame_rect() : null);

    if (frame) {
      const byArea = Utils.bestMonitorIndexForRect(frame, geometries);
      if (byArea >= 0 && byArea < nMonitors) return byArea;
    }

    const live = metaWindow.get_monitor();
    if (live >= 0 && live < nMonitors) return live;
    return nMonitors > 0 ? 0 : -1;
  }

  /** Quiet-time mon+frame for thrash recovery. */
  snapshotLastGoodHomes() {
    const wm = this._extWm;
    if (wm._workareasThrashPending) return;
    // R017: mid scale/mode reconfig — do not poison quiet fp or last-good homes
    // (renderTree after entered-monitor used to overwrite quiet with thrash geom).
    if (this.displayGeometryChangedFromQuiet()) return;
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
    // R016: quiet geometry baseline for no-op short-circuit.
    this._storeQuietWorkareasFingerprint();
  }
}
