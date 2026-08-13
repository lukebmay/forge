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
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

// Shared state
import { Logger } from "../shared/logger.js";
import { production } from "../shared/settings.js";
import { forgeConfigDir } from "../shared/forge-config-home.js";

// App imports
import * as Utils from "./utils.js";
import * as SessionLayout from "./session-layout.js";
import * as TreeSnapshot from "./tree-snapshot.js";
import { LOCK_SHIELD_AFTER_UNLOCK_US } from "./monitor-recovery.js";

/** Logger.debug + file trace when !production. */
export function sessionLayoutTrace(msg) {
  try {
    Logger.debug(msg);
  } catch (_e) {
    // ignore
  }
  // File path keeps HUP traces when production=false without journal spam.
  if (production) return;
  try {
    const line = `${new Date().toISOString()} ${msg}`;
    const dir = forgeConfigDir();
    GLib.mkdir_with_parents(dir, 0o755);
    const path = GLib.build_filenamev([dir, "session-layout-trace.log"]);
    const file = Gio.File.new_for_path(path);
    const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
    stream.write_all(`${line}\n`, null);
    stream.close(null);
  } catch (_e) {
    // best-effort diagnostics only
  }
}

function metaWinLabel(metaWin) {
  if (!metaWin) return "null";
  let id = "?";
  let cls = "?";
  let title = "";
  let mon = -1;
  let pid = -1;
  try {
    id = typeof metaWin.get_id === "function" ? metaWin.get_id() : metaWin.id;
  } catch (_e) {
    // ignore
  }
  try {
    cls = typeof metaWin.get_wm_class === "function" ? metaWin.get_wm_class() : "";
  } catch (_e) {
    // ignore
  }
  try {
    title = typeof metaWin.get_title === "function" ? (metaWin.get_title() || "").slice(0, 40) : "";
  } catch (_e) {
    // ignore
  }
  try {
    mon = typeof metaWin.get_monitor === "function" ? metaWin.get_monitor() : -1;
  } catch (_e) {
    // ignore
  }
  try {
    pid = typeof metaWin.get_pid === "function" ? metaWin.get_pid() : -1;
  } catch (_e) {
    // ignore
  }
  return `id=${id} pid=${pid} mon=${mon} class=${cls} title=${JSON.stringify(title)}`;
}

/** Save/restore/rehome/raise/shield for portable session-layout.json. State live on `_extWm`. */
export class SessionLayoutRestoreManager extends GObject.Object {
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

  /** @returns {boolean} */
  sessionLayoutShieldActive() {
    const wm = this._extWm;
    const shield = wm._sessionLayoutShield;
    if (!shield?.liveForest) return false;
    // While locked, lock shield never auto-expires (DPMS thrash overnight).
    if (wm._sessionLocked && shield.fromLock) return true;
    const now = Utils.monoTimeUs();
    if (typeof shield.untilMonoUs === "number" && now > shield.untilMonoUs) {
      wm._sessionLayoutShield = null;
      return false;
    }
    return true;
  }

  /**
   * Snapshot quiet tree + last-good for lock→sleep thrash recovery.
   * Called when entering unlock-dialog (tree stays loaded; Meta may thrash under DPMS).
   * @returns {boolean}
   */
  armLockLayoutShield() {
    const wm = this._extWm;
    if (!wm.tree) return false;
    // Force last-good from quiet tree (not thrash frames).
    const prevPending = wm._workareasThrashPending;
    wm._workareasThrashPending = false;
    try {
      wm._snapshotLastGoodHomes?.();
    } finally {
      wm._workareasThrashPending = prevPending;
    }
    const forest = wm.tree.snapshotTree?.();
    if (!forest?.monitors?.length) {
      sessionLayoutTrace("session-layout: lock shield empty (no mon children)");
      return false;
    }
    this._enrichLiveForestFrames(forest);
    let focusMeta = null;
    try {
      focusMeta = wm.focusMetaWindow ?? null;
    } catch (_e) {
      focusMeta = null;
    }
    const now = Utils.monoTimeUs();
    // Long TTL; unlock shortens to LOCK_SHIELD_AFTER_UNLOCK_US via onSessionUnlocked.
    wm._sessionLayoutShield = {
      liveForest: forest,
      focusMeta,
      untilMonoUs: now + 86_400_000_000,
      fromLock: true,
    };
    sessionLayoutTrace(
      `session-layout: lock shield armed mon=${forest.monitors.length} focus=${metaWinLabel(
        focusMeta
      )}`
    );
    return true;
  }

  /**
   * Attach frame/monitor onto WINDOW leaves from last-good or live Meta.
   * @param {{ monitors?: any[] }} forest
   */
  _enrichLiveForestFrames(forest) {
    const wm = this._extWm;
    const walk = (desc, monIndex) => {
      if (!desc) return;
      if (desc.window) {
        const meta = desc.window;
        const home = wm._lastGoodHomes?.get?.(meta);
        if (home?.frame) {
          desc.frame = { ...home.frame };
          desc.monitor = home.monitorIndex >= 0 ? home.monitorIndex : monIndex;
        } else {
          try {
            const r = meta?.get_frame_rect?.();
            if (r && r.width > 0) {
              desc.frame = { x: r.x, y: r.y, width: r.width, height: r.height };
            }
          } catch (_e) {
            // ignore
          }
          if (desc.monitor == null) desc.monitor = monIndex;
        }
        return;
      }
      for (const c of desc.children || []) walk(c, monIndex);
    };
    for (const mon of forest.monitors || []) {
      let monIndex = -1;
      try {
        const id = mon.id || "";
        const m = String(id).match(/^mo(\d+)/);
        if (m) monIndex = parseInt(m[1], 10);
      } catch (_e) {
        // ignore
      }
      walk(mon, monIndex);
    }
  }

  /** Enter unlock-dialog: arm shield; freeze thrash monitor-recovery until unlock. */
  onSessionLocked() {
    const wm = this._extWm;
    wm._sessionLocked = true;
    this.armLockLayoutShield();
  }

  /**
   * Return to user session: keep lock forest as short shield and settle once
   * heads are stable (longer debounce).
   */
  onSessionUnlocked() {
    const wm = this._extWm;
    const wasLocked = !!wm._sessionLocked;
    wm._sessionLocked = false;
    if (!wasLocked && !wm._sessionLayoutShield?.fromLock) {
      // First enable / non-lock user mode — nothing to rehome.
      return;
    }
    const now = Utils.monoTimeUs();
    if (wm._sessionLayoutShield?.liveForest) {
      wm._sessionLayoutShield.untilMonoUs = now + LOCK_SHIELD_AFTER_UNLOCK_US;
      wm._sessionLayoutShield.fromLock = true;
      sessionLayoutTrace(
        `session-layout: unlock shield active ${LOCK_SHIELD_AFTER_UNLOCK_US / 1e6}s`
      );
    } else {
      this.armLockLayoutShield();
      if (wm._sessionLayoutShield) {
        wm._sessionLayoutShield.untilMonoUs = now + LOCK_SHIELD_AFTER_UNLOCK_US;
      }
    }
    wm._unlockWorkareasSettleBoost = true;
    // One settle after unlock (workareas may already have fired under lock).
    wm._queueMonitorRecoveryOnWorkareas?.();
  }

  /** Re-apply shield forest while active (blocks thrash monitor-recovery snapshot). */
  reapplySessionLayoutShield(from = "session-layout-shield") {
    const wm = this._extWm;
    const shield = wm._sessionLayoutShield;
    const forest = shield?.liveForest;
    if (!forest?.monitors?.length) return false;
    const focusMeta = shield.focusMeta ?? null;
    sessionLayoutTrace(
      `session-layout: shield reapply begin from=${from} focus=${metaWinLabel(focusMeta)}`
    );
    const prev = wm._sessionLayoutRestoring;
    wm._sessionLayoutRestoring = true;
    try {
      // Via WM so unit spies on WindowManager still intercept.
      wm._rehomeWindowsForSessionForest(forest);
      wm._restoreSessionForestStrict(forest);
      // Keep pre-HUP focus across thrash reapply (do not fall back to Mutter).
      wm._raiseAfterSessionRestore(forest, { focusMeta });
      wm._seedLastGoodHomesFromSession(forest, null);
      // Extend shield while thrash continues; preserve focusMeta.
      const now = Utils.monoTimeUs();
      wm._sessionLayoutShield = {
        liveForest: forest,
        focusMeta,
        untilMonoUs: now + 3_000_000,
      };
      wm.renderTree?.(from);
      // Render/thrash can steal focus; re-touch after settle.
      this._scheduleSessionFocus(focusMeta);
      sessionLayoutTrace(`session-layout: shield reapply ok from=${from}`);
      wm._traceSessionLayoutHomes(forest, "after-shield-reapply");
      return true;
    } catch (e) {
      sessionLayoutTrace(`session-layout: shield reapply failed: ${e}`);
      Logger.warn(`session-layout: shield reapply failed: ${e}`);
      return false;
    } finally {
      wm._sessionLayoutRestoring = prev;
    }
  }

  /** @param {{ monitors?: any[] }} liveForest @param {string} tag */
  traceSessionLayoutHomes(liveForest, tag) {
    const wm = this._extWm;
    try {
      const homes = SessionLayout.planWindowMonitorHomes(liveForest);
      for (const { window: w, monIndex, monId } of homes) {
        let treeMon = "?";
        try {
          const node = wm.tree.findNode(w);
          const mon = node ? TreeSnapshot.findMonitorAncestor(node) : null;
          treeMon = mon?.nodeValue ?? "none";
        } catch (_e) {
          // ignore
        }
        sessionLayoutTrace(
          `session-layout: ${tag} plan mon=${monIndex} monId=${monId} treeMon=${treeMon} ${metaWinLabel(
            w
          )}`
        );
      }
    } catch (e) {
      sessionLayoutTrace(`session-layout: ${tag} homes trace failed: ${e}`);
    }
  }

  /** Debounced save (Shell HUP may skip disable). */
  queueSessionLayoutSave() {
    const wm = this._extWm;
    if (wm.disabled || wm._wmSources.has("sessionLayoutSave")) return;
    // Never persist thrash geometry written while locked / DPMS.
    if (wm._sessionLocked) return;
    if (wm._sessionLayoutSaveHoldUntil) {
      const now = Utils.monoTimeUs();
      if (now < wm._sessionLayoutSaveHoldUntil) return;
    }
    // Was PRIORITY_LOW; bag timeout is DEFAULT — debounce ms unchanged.
    wm._wmSources.set("sessionLayoutSave", 1500, () => {
      if (!wm.disabled) wm._saveSessionLayoutForReload();
    });
  }

  /** @param {number} [holdUs] */
  holdSessionLayoutSave(holdUs = 12_000_000) {
    this._extWm._sessionLayoutSaveHoldUntil = Utils.monoTimeUs() + holdUs;
  }

  /**
   * @param {{ immediate?: boolean, force?: boolean }} [opts]
   * @returns {boolean}
   */
  saveSessionLayoutForReload(opts = {}) {
    const wm = this._extWm;
    try {
      if (!wm.tree || wm.disabled) return false;
      if (!opts.force && !opts.immediate && wm._sessionLayoutSaveHoldUntil) {
        if (Utils.monoTimeUs() < wm._sessionLayoutSaveHoldUntil) return false;
      }
      // Sync open leaf from Mutter focus before snapshot — focus-update is deferred.
      const focusMeta = SessionLayout.resolveFocusMetaForSessionSave(wm);
      try {
        SessionLayout.syncLastTabFocusFromFocus(wm.tree, focusMeta);
      } catch (_e) {
        // best-effort; portable write still proceeds
      }
      const live = wm.tree.snapshotTree?.();
      const portable = SessionLayout.toPortableForest(live);
      if (!portable) return false;
      const configMgr = wm.ext?.configMgr;
      if (!configMgr?.saveSessionLayout) return false;
      const mono = Utils.monoTimeUs();

      // Richness guard: skip thrash-flat overwrite.
      if (!opts.force) {
        try {
          const existing = SessionLayout.parseEnvelope(configMgr.loadSessionLayout?.());
          if (existing && SessionLayout.isSessionLayoutFresh(existing, mono)) {
            const oldR = SessionLayout.forestRichness(existing.forest);
            const newR = SessionLayout.forestRichness(portable);
            if (newR + 5 < oldR) return false;
          }
        } catch (_e) {
          // ignore compare errors
        }
      }

      let focusWindowId = null;
      try {
        focusWindowId = SessionLayout.windowStableId(focusMeta);
      } catch (_e) {
        focusWindowId = null;
      }
      configMgr.saveSessionLayout(
        SessionLayout.makeEnvelope(portable, mono, Date.now(), { focusWindowId })
      );
      if (opts.immediate) {
        Logger.info(
          `session-layout: saved ${portable.monitors.length} monitor(s) focusId=${
            focusWindowId ?? "none"
          }`
        );
      }
      sessionLayoutTrace(
        `session-layout: save focusId=${focusWindowId ?? "none"} ${metaWinLabel(focusMeta)}`
      );
      return true;
    } catch (e) {
      Logger.warn(`session-layout: save failed: ${e}`);
      return false;
    }
  }

  /** Cancel debounce and write now (install flush). */
  flushSessionLayout() {
    const wm = this._extWm;
    wm._wmSources.cancel("sessionLayoutSave");
    return wm._saveSessionLayoutForReload({ immediate: true, force: false });
  }

  /** After flat track on enable: match + rehome + strict restore. */
  restoreSessionLayoutAfterTrack() {
    const wm = this._extWm;
    wm._holdSessionLayoutSave(12_000_000);
    wm._sessionLayoutRestoring = true;
    sessionLayoutTrace("session-layout: restore begin");
    try {
      const configMgr = wm.ext?.configMgr;
      if (!configMgr?.loadSessionLayout) {
        sessionLayoutTrace("session-layout: no configMgr.loadSessionLayout");
        return false;
      }
      const raw = configMgr.loadSessionLayout();
      const envelope = SessionLayout.parseEnvelope(raw);
      if (!envelope) {
        sessionLayoutTrace("session-layout: no envelope (missing/invalid file)");
        return false;
      }
      const now = Utils.monoTimeUs();
      if (!SessionLayout.isSessionLayoutFresh(envelope, now)) {
        sessionLayoutTrace("session-layout: stale or post-reboot; discarding");
        configMgr.clearSessionLayout?.();
        return false;
      }
      const wins = wm.windowsAllWorkspaces || [];
      sessionLayoutTrace(`session-layout: live windows=${wins.length}`);
      for (const w of wins) {
        sessionLayoutTrace(`session-layout: live ${metaWinLabel(w)}`);
      }
      const stats = SessionLayout.matchStatsAgainstWindows(envelope.forest, wins);
      sessionLayoutTrace(`session-layout: match ${stats.matched}/${stats.total}`);
      if (!SessionLayout.isMatchGoodEnough(stats)) {
        sessionLayoutTrace(
          `session-layout: match too low (${stats.matched}/${stats.total}); keeping flat tree`
        );
        return false;
      }
      const resolve = SessionLayout.createWindowResolver(wins, envelope.forest);
      const liveForest = SessionLayout.toLiveForest(envelope.forest, resolve);
      if (!liveForest?.monitors?.length) {
        sessionLayoutTrace("session-layout: toLiveForest empty");
        return false;
      }
      let focusMeta = null;
      if (envelope.focusWindowId !== undefined && envelope.focusWindowId !== null) {
        try {
          // resolve({id}) hits leafAssign after id churn (createWindowResolver).
          focusMeta = resolve({ id: envelope.focusWindowId }) ?? null;
        } catch (_e) {
          focusMeta = null;
        }
      }
      sessionLayoutTrace(
        `session-layout: focus resolve savedId=${envelope.focusWindowId ?? "none"} → ${metaWinLabel(
          focusMeta
        )}`
      );
      wm._traceSessionLayoutHomes(liveForest, "matched-before-rehome");
      wm._rehomeWindowsForSessionForest(liveForest);
      wm._traceSessionLayoutHomes(liveForest, "after-rehome");
      wm._restoreSessionForestStrict(liveForest);
      wm._traceSessionLayoutHomes(liveForest, "after-strict-apply");
      wm._raiseAfterSessionRestore(liveForest, { focusMeta });
      // Seed before pending monitor-recovery can use thrash frames.
      wm._seedLastGoodHomesFromSession(liveForest, envelope.forest);
      sessionLayoutTrace("session-layout: last-good seeded");
      // ~3s shield so post-HUP thrash cannot monitor-recovery a broken snapshot.
      // Keep focusMeta so thrash reapply does not re-activate Mutter's pick.
      const nowMono = Utils.monoTimeUs();
      wm._sessionLayoutShield = {
        liveForest,
        focusMeta,
        untilMonoUs: nowMono + 3_000_000,
      };
      wm._sessionRestoredFocusMeta = focusMeta;
      this._scheduleSessionFocus(focusMeta);
      sessionLayoutTrace(`session-layout: shield until mono+3s (${nowMono + 3_000_000})`);
      configMgr.clearSessionLayout?.();
      const restoredMsg = `session-layout: restored topology (${stats.matched}/${stats.total} windows matched)`;
      sessionLayoutTrace(restoredMsg);
      Logger.info(restoredMsg);
      return true;
    } catch (e) {
      sessionLayoutTrace(`session-layout: restore failed: ${e}`);
      Logger.warn(`session-layout: restore failed: ${e}`);
      return false;
    } finally {
      wm._sessionLayoutRestoring = false;
      sessionLayoutTrace("session-layout: restore end (flag clear)");
    }
  }

  /** Seed last-good from session frames (HUP empties WeakMap). */
  seedLastGoodHomesFromSession(liveForest, portableForest = null) {
    const wm = this._extWm;
    if (!wm._monitorLiveMap) wm._refreshMonitorIdentityMap();
    const plans = SessionLayout.planLastGoodHomes(liveForest, portableForest);
    for (const { window: metaWin, monitorIndex, frame, stableKey } of plans) {
      if (!metaWin || !Utils.isWindowAlive(metaWin)) continue;
      if (monitorIndex < 0) continue;
      const key = stableKey ?? wm._monitorLiveMap?.byIndex?.get(monitorIndex) ?? null;
      wm._lastGoodHomes.set(metaWin, {
        monitorIndex,
        stableKey: key,
        frame: frame || null,
      });
    }
  }

  /** @param {{ monitors: any[] }} liveForest */
  rehomeWindowsForSessionForest(liveForest) {
    const wm = this._extWm;
    const homes = SessionLayout.planWindowMonitorHomes(liveForest);
    const ctx = wm.tree._treeSnapshotCtx();
    sessionLayoutTrace(`session-layout: rehome ${homes.length} window(s)`);
    const applyOne = ({ window: metaWin, monIndex, monId }, pass) => {
      if (!metaWin) return;
      let before = -1;
      try {
        before = typeof metaWin.get_monitor === "function" ? metaWin.get_monitor() : -1;
        if (before !== monIndex && typeof metaWin.move_to_monitor === "function") {
          metaWin.move_to_monitor(monIndex);
        }
      } catch (e) {
        sessionLayoutTrace(`session-layout: rehome move failed pass=${pass}: ${e}`);
      }
      let after = before;
      try {
        after = typeof metaWin.get_monitor === "function" ? metaWin.get_monitor() : -1;
      } catch (_e) {
        // ignore
      }
      let treeBefore = "?";
      let treeAfter = "?";
      try {
        const node = wm.tree.findNode(metaWin);
        if (!node) {
          sessionLayoutTrace(
            `session-layout: rehome pass=${pass} NO_NODE plan=${monIndex} meta ${before}→${after} ${metaWinLabel(
              metaWin
            )}`
          );
          return;
        }
        const monAnc = TreeSnapshot.findMonitorAncestor(node);
        treeBefore = monAnc?.nodeValue ?? "none";
        const monDesc = (liveForest.monitors || []).find((m) => m.id === monId) || {
          id: monId,
        };
        const mon = SessionLayout.resolveStrictMonitor(monDesc, ctx) || wm.tree.findNode(monId);
        if (!mon) {
          sessionLayoutTrace(
            `session-layout: rehome pass=${pass} NO_MON_NODE monId=${monId} ${metaWinLabel(
              metaWin
            )}`
          );
          return;
        }
        if (!TreeSnapshot.hasAncestor(node, mon)) mon.appendChild(node);
        treeAfter = TreeSnapshot.findMonitorAncestor(node)?.nodeValue ?? "none";
      } catch (e) {
        sessionLayoutTrace(`session-layout: rehome tree pass=${pass} failed: ${e}`);
      }
      sessionLayoutTrace(
        `session-layout: rehome pass=${pass} plan=${monIndex} monId=${monId} meta ${before}→${after} tree ${treeBefore}→${treeAfter} ${metaWinLabel(
          metaWin
        )}`
      );
    };
    for (const home of homes) applyOne(home, 1);
    // One retry if Meta mon or tree parent still wrong.
    for (const home of homes) {
      const { window: metaWin, monIndex, monId } = home;
      if (!metaWin) continue;
      let needRetry = false;
      try {
        if (typeof metaWin.get_monitor === "function" && metaWin.get_monitor() !== monIndex) {
          needRetry = true;
        }
      } catch (_e) {
        // ignore
      }
      try {
        const node = wm.tree.findNode(metaWin);
        const monDesc = (liveForest.monitors || []).find((m) => m.id === monId) || {
          id: monId,
        };
        const mon = SessionLayout.resolveStrictMonitor(monDesc, ctx) || wm.tree.findNode(monId);
        if (node && mon && !TreeSnapshot.hasAncestor(node, mon)) needRetry = true;
      } catch (_e) {
        // ignore
      }
      if (needRetry) applyOne(home, 2);
    }
  }

  /** Strict mon resolve only (no majority pile remap). */
  restoreSessionForestStrict(liveForest) {
    const ctx = this._extWm.tree._treeSnapshotCtx();
    for (const monDesc of liveForest.monitors || []) {
      const mon = SessionLayout.resolveStrictMonitor(monDesc, ctx);
      if (!mon) continue;
      TreeSnapshot.applyMonitorSnapshot(mon, monDesc, ctx);
      TreeSnapshot.pruneEmptyConsUnder(mon);
    }
  }

  /**
   * Activate saved focus after install/HUP restore.
   * Uses roundtrip timestamp (get_current_time is 0 outside events — forge-191a).
   * @param {any} focus
   */
  activateSessionFocus(focus) {
    if (!focus) return false;
    try {
      if (typeof Utils.isWindowAlive === "function" && !Utils.isWindowAlive(focus)) return false;
    } catch (_e) {
      // ignore
    }
    let now = 0;
    try {
      if (typeof global !== "undefined" && global.display?.get_current_time_roundtrip) {
        now = global.display.get_current_time_roundtrip();
      } else if (typeof global !== "undefined" && global.display?.get_current_time) {
        now = global.display.get_current_time();
      } else if (typeof global !== "undefined" && global.get_current_time) {
        now = global.get_current_time();
      }
    } catch (_e) {
      now = 0;
    }
    try {
      focus.raise?.();
    } catch (_e) {
      // ignore
    }
    try {
      const ws = typeof focus.get_workspace === "function" ? focus.get_workspace() : null;
      if (ws && typeof ws.activate_with_focus === "function") {
        ws.activate_with_focus(focus, now);
      } else if (typeof focus.activate === "function") {
        focus.activate(now);
      } else if (typeof focus.focus === "function") {
        focus.focus(now);
      } else {
        return false;
      }
      if (typeof focus.focus === "function" && typeof focus.activate === "function") {
        // Mirror tree._activateWindowNode: focus + activate for X11 stacking.
        try {
          focus.focus(now);
        } catch (_e) {
          // ignore
        }
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Re-activate after idle so renderTree / workareas thrash cannot keep wrong focus.
   * @param {any} focusMeta
   */
  _scheduleSessionFocus(focusMeta) {
    const wm = this._extWm;
    if (!focusMeta) return;
    // setIdle replaces prior; SourceBag auto-clears slot on fire.
    const id = wm._wmSources.setIdle("sessionFocusRetry", () => {
      try {
        const focus =
          wm._sessionLayoutShield?.focusMeta || wm._sessionRestoredFocusMeta || focusMeta;
        if (!focus) return;
        const ok = this.activateSessionFocus(focus);
        const node = wm.tree?.findNode?.(focus);
        if (node) {
          if (typeof wm.revealGroupChild === "function") {
            wm.revealGroupChild(node);
          } else {
            wm.updateTabbedFocus?.(node);
            wm.updateStackedFocus?.(node);
          }
          wm._lftTouchIfTile?.(node);
        }
        sessionLayoutTrace(
          `session-layout: deferred focus ${ok ? "ok" : "fail"} ${metaWinLabel(focus)}`
        );
      } catch (e) {
        sessionLayoutTrace(`session-layout: deferred focus error: ${e}`);
      }
    });
    // schedule failed (GLib unavailable in some unit contexts) — focus now.
    if (id == null) {
      try {
        this.activateSessionFocus(focusMeta);
      } catch (_e2) {
        // ignore
      }
    }
  }

  /**
   * Raise tiles after restore so none stay buried.
   * @param {{ monitors?: any[] }|null} liveForest
   * @param {{ focusMeta?: any }} [opts] - pre-HUP focused window when resolved
   */
  raiseAfterSessionRestore(liveForest, opts = {}) {
    const wm = this._extWm;
    const raiseWin = (meta) => {
      try {
        meta?.raise?.();
      } catch (_e) {
        // ignore
      }
    };
    /** @type {any[]} */
    const groupOpenMetas = [];
    const walk = (desc) => {
      if (!desc) return;
      if (desc.window) {
        raiseWin(desc.window);
        return;
      }
      for (const c of desc.children || []) walk(c);
      // Per CON: which tab/stack leaf was open (order stays in children[]).
      if (desc.lastTabFocus) {
        groupOpenMetas.push(desc.lastTabFocus);
      }
    };
    for (const monDesc of liveForest?.monitors || []) {
      for (const c of monDesc.children || []) walk(c);
    }
    // Restack each group so chrome/active matches saved lastTabFocus (not only
    // the desk focus window — other mon tabs stay on the open leaf).
    for (const openMeta of groupOpenMetas) {
      try {
        const node = wm.tree?.findNode?.(openMeta);
        if (!node) continue;
        if (typeof wm.revealGroupChild === "function") {
          wm.revealGroupChild(node);
        } else {
          raiseWin(openMeta);
          wm.updateTabbedFocus?.(node);
          wm.updateStackedFocus?.(node);
        }
      } catch (_e) {
        // ignore
      }
    }
    try {
      // Prefer saved focus from install flush; fall back to Mutter's current focus.
      // Always last: group open leaves above must not keep desk keyboard focus wrong.
      const focus = opts.focusMeta || wm.focusMetaWindow;
      if (focus) {
        this.activateSessionFocus(focus);
        const node = wm.tree?.findNode?.(focus);
        // Pin open leaf to keyboard focus even if updateTabbedFocus no-ops (_freezeRender).
        SessionLayout.syncLastTabFocusFromFocus(wm.tree, focus);
        wm.updateTabbedFocus?.(node);
        wm.updateStackedFocus?.(node);
        wm._lftTouchIfTile?.(node);
        sessionLayoutTrace(`session-layout: raise focus ${metaWinLabel(focus)}`);
      } else {
        sessionLayoutTrace("session-layout: raise focus none");
      }
    } catch (_e) {
      // ignore
    }
  }
}
