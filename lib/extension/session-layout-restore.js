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

// App imports
import * as Utils from "./utils.js";
import * as SessionLayout from "./session-layout.js";
import * as TreeSnapshot from "./tree-snapshot.js";

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
    const dir = GLib.build_filenamev([GLib.get_user_config_dir(), "forge", "config"]);
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
    const now = Utils.monoTimeUs();
    if (typeof shield.untilMonoUs === "number" && now > shield.untilMonoUs) {
      wm._sessionLayoutShield = null;
      return false;
    }
    return true;
  }

  /** Re-apply shield forest while active (blocks thrash soft-rehome snapshot). */
  reapplySessionLayoutShield(from = "session-layout-shield") {
    const wm = this._extWm;
    const forest = wm._sessionLayoutShield?.liveForest;
    if (!forest?.monitors?.length) return false;
    sessionLayoutTrace(`session-layout: shield reapply begin from=${from}`);
    const prev = wm._sessionLayoutRestoring;
    wm._sessionLayoutRestoring = true;
    try {
      // Via WM so unit spies on WindowManager still intercept.
      wm._rehomeWindowsForSessionForest(forest);
      wm._restoreSessionForestStrict(forest);
      wm._raiseAfterSessionRestore(forest);
      wm._seedLastGoodHomesFromSession(forest, null);
      // Extend shield while thrash continues.
      const now = Utils.monoTimeUs();
      wm._sessionLayoutShield = {
        liveForest: forest,
        untilMonoUs: now + 3_000_000,
      };
      wm.renderTree?.(from);
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
    if (wm.disabled || wm._sessionLayoutSaveSrcId) return;
    if (wm._sessionLayoutSaveHoldUntil) {
      const now = Utils.monoTimeUs();
      if (now < wm._sessionLayoutSaveHoldUntil) return;
    }
    wm._sessionLayoutSaveSrcId = GLib.timeout_add(GLib.PRIORITY_LOW, 1500, () => {
      wm._sessionLayoutSaveSrcId = 0;
      if (!wm.disabled) wm._saveSessionLayoutForReload();
      return false;
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

      configMgr.saveSessionLayout(SessionLayout.makeEnvelope(portable, mono));
      if (opts.immediate) {
        Logger.info(`session-layout: saved ${portable.monitors.length} monitor(s)`);
      }
      return true;
    } catch (e) {
      Logger.warn(`session-layout: save failed: ${e}`);
      return false;
    }
  }

  /** Cancel debounce and write now (install flush). */
  flushSessionLayout() {
    const wm = this._extWm;
    wm._clearTimeoutId("_sessionLayoutSaveSrcId");
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
      wm._traceSessionLayoutHomes(liveForest, "matched-before-rehome");
      wm._rehomeWindowsForSessionForest(liveForest);
      wm._traceSessionLayoutHomes(liveForest, "after-rehome");
      wm._restoreSessionForestStrict(liveForest);
      wm._traceSessionLayoutHomes(liveForest, "after-strict-apply");
      wm._raiseAfterSessionRestore(liveForest);
      // Seed before pending soft-rehome can use thrash frames.
      wm._seedLastGoodHomesFromSession(liveForest, envelope.forest);
      sessionLayoutTrace("session-layout: last-good seeded");
      // ~3s shield so post-HUP thrash cannot soft-rehome a broken snapshot.
      const nowMono = Utils.monoTimeUs();
      wm._sessionLayoutShield = {
        liveForest,
        untilMonoUs: nowMono + 3_000_000,
      };
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

  /** Raise tiles after restore so none stay buried. */
  raiseAfterSessionRestore(liveForest) {
    const wm = this._extWm;
    const raiseWin = (meta) => {
      try {
        meta?.raise?.();
      } catch (_e) {
        // ignore
      }
    };
    const walk = (desc) => {
      if (!desc) return;
      if (desc.window) {
        raiseWin(desc.window);
        return;
      }
      for (const c of desc.children || []) walk(c);
      if (desc.lastTabFocus) raiseWin(desc.lastTabFocus);
    };
    for (const monDesc of liveForest?.monitors || []) {
      for (const c of monDesc.children || []) walk(c);
    }
    try {
      const focus = wm.focusMetaWindow;
      if (focus) {
        raiseWin(focus);
        const node = wm.tree.findNode(focus);
        wm.updateTabbedFocus?.(node);
        wm.updateStackedFocus?.(node);
      }
    } catch (_e) {
      // ignore
    }
  }
}
