/*
 * This file is part of the Forge extension for GNOME
 *
 * Session DBus API: Ping, GetTree, Focus, Swap, Move, PlaceNext (FC0–FC2),
 * GetSetting, SetSetting, SettingsSave, SettingsLoad (FC3),
 * RunSteps batch + freezeRender (FC4), LayoutBatch multi-open (CL5),
 * ApplyLayout / GetLayoutApply / CancelLayoutApply (AL4–AL7, D038).
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import St from "gi://St";

import { Logger } from "../shared/logger.js";
import { collectWindows } from "../shared/layout-plan.js";
import { forgeConfigDir } from "../shared/forge-config-home.js";
import { HEURISTICS_FILENAME } from "./layout-apply-settle.js";
import {
  DEFAULT_OPEN_PIN_TIMEOUT_MS,
  desktopLaunchTryIds,
  isPathLikeLaunchApp,
  pickDesktopSearchResult,
  shellSplit,
  waitClassesFromOpenAction,
} from "../shared/layout-open.js";
import { chromePwaDesktopIds } from "./place-hint.js";
import { parseSettingValueText } from "../shared/settings-control.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "./tree.js";
import {
  projectForest,
  projectNode,
  TREE_QUERY_API_VERSION,
  windowMetaFields,
} from "./tree-query.js";
import {
  matchNodes,
  matchWindows,
  pickMatch,
  parseSelector,
  candidatePublic,
} from "./tile-select.js";
import { parseStepsPayload, runStepsDispatch } from "./run-steps.js";
import * as Utils from "./utils.js";
import { buildDropZones } from "./drop-zones.js";
import { dropTargetHitRect } from "./drag-drop.js";
import { dropChangesStructure } from "./drop-intent.js";
import { WINDOW_MODES } from "./window.js";
import { safeMoveToMonitor } from "./monitor-recovery.js";
import * as SessionLayout from "./session-layout.js";
import {
  isPlaceholderNode,
  PLACEHOLDER_SKELETON_LAYOUT_REASON,
  PLACEHOLDER_BIND_LAYOUT_REASON,
  PLACEHOLDER_REMOVE_LAYOUT_REASON,
  parseLayoutPlaceholderTitle,
} from "./layout-placeholder.js";
import {
  LayoutApplyRunBag,
  LAYOUT_APPLY_RUN_HARD_MS,
  parseApplyLayoutRequest,
} from "./layout-apply-run.js";

export const FORGE_DBUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const FORGE_DBUS_PATH = "/org/gnome/Shell/Extensions/Forge";
export const FORGE_DBUS_INTERFACE = "org.gnome.Shell.Extensions.Forge";

/** Combined control-plane version (+ ApplyLayout AL4 / D038). */
export const SESSION_API_VERSION = 10;

/** Match keybindings DEFAULT_FLOAT_LAYOUT when RunSteps toggles float. */
const DEFAULT_FLOAT_LAYOUT = {
  mode: "float",
  x: "center",
  y: "center",
  width: 0.65,
  height: 0.75,
};

const FORGE_DBUS_XML = `
<node>
  <interface name="${FORGE_DBUS_INTERFACE}">
    <method name="Ping">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="GetTree">
      <arg type="s" direction="in" name="options_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="Focus">
      <arg type="s" direction="in" name="selector"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="Swap">
      <arg type="s" direction="in" name="selector_a"/>
      <arg type="s" direction="in" name="selector_b"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="Move">
      <arg type="s" direction="in" name="selector"/>
      <arg type="s" direction="in" name="dest"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="PlaceNext">
      <arg type="s" direction="in" name="options_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="GetSetting">
      <arg type="s" direction="in" name="key"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="SetSetting">
      <arg type="s" direction="in" name="key"/>
      <arg type="s" direction="in" name="value_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="SettingsSave">
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="SettingsLoad">
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="RunSteps">
      <arg type="s" direction="in" name="steps_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="LayoutBatch">
      <arg type="s" direction="in" name="action"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="SaveSessionLayout">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="GetThrashCatalog">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="ApplyLayout">
      <arg type="s" direction="in" name="request_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="GetLayoutApply">
      <arg type="s" direction="in" name="apply_id"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="CancelLayoutApply">
      <arg type="s" direction="in" name="apply_id"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <signal name="LayoutApplyProgress">
      <arg type="s" name="payload_json"/>
    </signal>
    <signal name="LayoutApplyDone">
      <arg type="s" name="payload_json"/>
    </signal>
  </interface>
</node>`;

/**
 * Owns the session-bus export for Forge control-plane methods.
 * Keep alive on unlock-dialog (tree stays loaded); tear down only on disable().
 */
export class SessionApi {
  /**
   * @param {import('../../extension.js').default} ext
   */
  constructor(ext) {
    this._ext = ext;
    this._export = null;
    this._ownerId = 0;
    this._enabled = false;
    this._runStepsSettleSrcId = 0;
    this._tabStripRestackSrcId = 0;
    /** @type {LayoutApplyRunBag|null} */
    this._layoutApplyRuns = null;
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;
    this._ensureLayoutApplyRuns();
    try {
      this._ownerId = Gio.bus_own_name(
        Gio.BusType.SESSION,
        FORGE_DBUS_NAME,
        Gio.BusNameOwnerFlags.NONE,
        this._onBusAcquired.bind(this),
        this._onNameAcquired.bind(this),
        this._onNameLost.bind(this)
      );
      Logger.info(`session-api: owning ${FORGE_DBUS_NAME}`);
    } catch (e) {
      Logger.warn(`session-api: own_name failed: ${e}`);
      this._ownerId = 0;
      this._enabled = false;
    }
  }

  disable() {
    this._enabled = false;
    this._clearRunStepsSettle();
    this._clearTabStripRestack();
    try {
      this._layoutApplyRuns?.dispose?.();
    } catch (e) {
      Logger.warn(`session-api: layout apply dispose: ${e}`);
    }
    this._layoutApplyRuns = null;
    try {
      if (this._export) {
        this._export.unexport();
        this._export = null;
      }
    } catch (e) {
      Logger.warn(`session-api: unexport failed: ${e}`);
      this._export = null;
    }
    try {
      if (this._ownerId) {
        Gio.bus_unown_name(this._ownerId);
        this._ownerId = 0;
      }
    } catch (e) {
      Logger.warn(`session-api: unown_name failed: ${e}`);
      this._ownerId = 0;
    }
    Logger.info("session-api: disabled");
  }

  /**
   * @param {Gio.DBusConnection} connection
   */
  _onBusAcquired(connection, _name) {
    // disable() may race before this fires; do not re-export after teardown.
    if (!this._enabled) return;
    try {
      this._export = Gio.DBusExportedObject.wrapJSObject(FORGE_DBUS_XML, this);
      this._export.export(connection, FORGE_DBUS_PATH);
      Logger.info(`session-api: exported ${FORGE_DBUS_PATH}`);
    } catch (e) {
      Logger.warn(`session-api: export failed: ${e}`);
      this._export = null;
    }
  }

  _onNameAcquired(_connection, _name) {
    Logger.debug("session-api: name acquired");
  }

  _onNameLost(_connection, _name) {
    // Drop export handle on loss; own_name may re-fire bus-acquired later.
    try {
      if (this._export) {
        this._export.unexport();
      }
    } catch (_e) {
      /* ignore */
    }
    this._export = null;
    if (this._enabled) {
      Logger.warn("session-api: bus name lost while enabled");
    }
  }

  /** DBus: Ping() → JSON string */
  Ping() {
    try {
      const ext = this._ext;
      const uuid = ext?.uuid ?? ext?.metadata?.uuid ?? "forge@jmmaranan.com";
      let versionName = null;
      try {
        const md = ext?.metadata;
        versionName = md?.["version-name"] ?? md?.version_name ?? md?.version ?? null;
        if (versionName != null) versionName = String(versionName);
      } catch (_e) {
        versionName = null;
      }
      return JSON.stringify({
        ok: true,
        uuid,
        versionName,
        apiVersion: SESSION_API_VERSION,
        queryApiVersion: TREE_QUERY_API_VERSION,
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /** DBus: SaveSessionLayout() → JSON */
  SaveSessionLayout() {
    try {
      const wm = this._ext?.extWm;
      if (!wm || typeof wm.flushSessionLayout !== "function") {
        return JSON.stringify({ ok: false, error: "window manager not ready" });
      }
      const ok = !!wm.flushSessionLayout();
      return JSON.stringify({
        ok,
        ...(ok ? {} : { error: "nothing to save (empty tree or no configMgr)" }),
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * DBus: GetThrashCatalog() → JSON of in-session thrash/settle catalog.
   * SL2 debug dump — session memory only (no disk).
   */
  GetThrashCatalog() {
    try {
      const wm = this._wm();
      const catalog = wm?.appThrashCatalog ?? wm?.layoutController?.catalog ?? null;
      if (!catalog || typeof catalog.snapshot !== "function") {
        return JSON.stringify({ ok: false, error: "thrash catalog not available" });
      }
      const entries = catalog.snapshot();
      return JSON.stringify({
        ok: true,
        apiVersion: SESSION_API_VERSION,
        entries: Array.isArray(entries) ? entries : [],
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * DBus: ApplyLayout(request_json) → start immediately (not blocking spine).
   * AL5: structure half (snapshot → plan → setLayout/order/size); open = AL6.
   * @param {string} request_json
   */
  ApplyLayout(request_json) {
    try {
      const wm = this._wm();
      if (!wm) {
        return JSON.stringify({ ok: false, error: "window manager not ready" });
      }
      const parsed = parseApplyLayoutRequest(request_json);
      if (!parsed.ok) {
        return JSON.stringify(parsed);
      }
      const bag = this._ensureLayoutApplyRuns();
      return JSON.stringify(bag.start(parsed.request));
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * DBus: GetLayoutApply(apply_id) → live or last terminal snapshot.
   * Empty apply_id selects current / last.
   * @param {string} apply_id
   */
  GetLayoutApply(apply_id) {
    try {
      const bag = this._ensureLayoutApplyRuns();
      return JSON.stringify(bag.get(apply_id));
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * DBus: CancelLayoutApply(apply_id) → cooperative cancel at phase boundary.
   * @param {string} apply_id
   */
  CancelLayoutApply(apply_id) {
    try {
      const bag = this._ensureLayoutApplyRuns();
      return JSON.stringify(bag.cancel(apply_id));
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * @returns {LayoutApplyRunBag}
   */
  _ensureLayoutApplyRuns() {
    if (this._layoutApplyRuns && !this._layoutApplyRuns.disposed) {
      return this._layoutApplyRuns;
    }
    const wm0 = this._wm();
    // Displays-changed mid-apply → bag.cancel(code: displays-changed).
    if (wm0 && typeof wm0.setApplyEpochCancelHook === "function") {
      wm0.setApplyEpochCancelHook((code) => {
        const bag = this._layoutApplyRuns;
        const live = bag?.live;
        if (!live?.live) return;
        try {
          bag.cancel(live.applyId, { code: code || "displays-changed" });
        } catch (e) {
          Logger.warn(`session-api ApplyEpoch displays-changed cancel: ${e}`);
        }
      });
    }
    this._layoutApplyRuns = new LayoutApplyRunBag({
      phaseDelayMs: 0,
      hardMs: LAYOUT_APPLY_RUN_HARD_MS,
      schedule: (ms, cb) =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(0, Number(ms) || 0), () => {
          try {
            cb();
          } catch (e) {
            Logger.warn(`session-api ApplyLayout step: ${e}`);
          }
          return GLib.SOURCE_REMOVE ?? false;
        }),
      cancel: (id) => {
        if (id) {
          try {
            GLib.Source.remove(id);
          } catch (_e) {
            /* */
          }
        }
      },
      onProgress: (payload) => this._emitLayoutApplySignal("LayoutApplyProgress", payload),
      onApplyLive: (active, run) => {
        const wm = this._wm();
        if (!wm) return;
        try {
          if (active) {
            if (typeof wm.beginApplyEpoch === "function") {
              wm.beginApplyEpoch(run);
            } else if (typeof wm.setLayoutApplyLive === "function") {
              wm.setLayoutApplyLive(true);
            }
          } else if (typeof wm.endApplyEpoch === "function") {
            wm.endApplyEpoch(run);
          } else if (typeof wm.setLayoutApplyLive === "function") {
            wm.setLayoutApplyLive(false);
          }
        } catch (e) {
          Logger.warn(`session-api ApplyLayout onApplyLive: ${e}`);
        }
        // On leave: Meta mon may lag tree (paint). Prefer tree, not rehome.
        if (!active) {
          try {
            wm._suppressRehome?.enter?.();
            wm.monitorRecovery?._alignMetaMonsToTree?.();
          } catch (e) {
            Logger.debug?.(`session-api ApplyLayout Meta→tree mon: ${e}`);
          } finally {
            try {
              wm._suppressRehome?.leave?.();
            } catch (_e) {
              /* */
            }
          }
        }
      },
      onDone: (payload) => {
        // WR14/R032: last raise already happened. Restack only — another
        // settleTabFocus raise re-buries chrome on Wayland after this idle.
        try {
          const wm = this._wm();
          if (wm) this._scheduleTabStripRestack(wm);
        } catch (e) {
          Logger.warn(`session-api ApplyLayout settle: ${e}`);
        }
        this._emitLayoutApplySignal("LayoutApplyDone", payload);
      },
      onChromeShow: ({ name, hardMs }) => {
        const wm = this._wm();
        try {
          Logger.info(
            `session-api ApplyLayout chrome show name=${name || "?"} hardMs=${
              hardMs || LAYOUT_APPLY_RUN_HARD_MS
            }`
          );
          if (wm?.layoutApplyChrome?.showForApplyRun) {
            let enabled = true;
            try {
              enabled = !!wm.ext?.settings?.get_boolean?.("layout-apply-chrome-enabled");
            } catch (_e) {
              enabled = true;
            }
            if (enabled) {
              wm.layoutApplyChrome.showForApplyRun({
                layoutName: name,
                hardMs: hardMs || LAYOUT_APPLY_RUN_HARD_MS,
              });
            } else {
              Logger.info("session-api ApplyLayout chrome show skipped (disabled)");
            }
          } else if (typeof wm?.showLayoutApplyChrome === "function") {
            wm.showLayoutApplyChrome(name);
          }
        } catch (e) {
          Logger.warn(`session-api ApplyLayout chrome show: ${e}`);
        }
      },
      onChromeClear: ({ reason } = {}) => {
        const wm = this._wm();
        try {
          Logger.info(`session-api ApplyLayout chrome clear reason=${reason || "done"}`);
          wm?.layoutApplyChrome?.restoreBatchHardMs?.();
          if (typeof wm?.clearLayoutApplyChrome === "function") {
            wm.clearLayoutApplyChrome();
          } else {
            wm?.layoutApplyChrome?.clear?.();
          }
          // R032: last raise often buried strips; restack as soon as scrim drops
          // so tab clicks work during soft residual / verify.
          if (wm) this._scheduleTabStripRestack(wm);
        } catch (e) {
          Logger.warn(`session-api ApplyLayout chrome clear: ${e}`);
        }
      },
      onPhaseEnter: () => {
        const wm = this._wm();
        try {
          wm?.layoutApplyChrome?.bumpApplyRunHardClear?.(LAYOUT_APPLY_RUN_HARD_MS);
        } catch (e) {
          Logger.warn(`session-api ApplyLayout phase enter: ${e}`);
        }
      },
      structure: {
        snapshotForest: (run) => this._snapshotForestForApply(run),
        runSteps: (steps, ctx) => this._runApplyLayoutSteps(steps, ctx),
        unwrapMonDegenerate: () => this._unwrapMonDirectSingleChildSplits(),
      },
      open: this._layoutApplyOpenDeps(),
      settle: this._layoutApplySettleDeps(),
    });
    return this._layoutApplyRuns;
  }

  /**
   * In-process spawn / PlaceNext / admit / signal wait for AL6.
   * No CLI-launch fallback.
   */
  _layoutApplyOpenDeps() {
    return {
      spawn: (fields, action) => this._spawnApplyLaunch(fields, action),
      placeNext: (options) => {
        const wm = this._wm();
        if (!wm?.placeNext) return { ok: false, error: "placeNext missing" };
        try {
          return wm.placeNext(options);
        } catch (e) {
          return { ok: false, error: String(e?.message || e) };
        }
      },
      admit: () => {
        const wm = this._wm();
        if (typeof wm?.admitUntrackedWindows !== "function") {
          return { ok: false, error: "admitUntrackedWindows missing" };
        }
        return wm.admitUntrackedWindows();
      },
      census: () => {
        const wm = this._wm();
        return typeof wm?.censusMetaWindows === "function" ? wm.censusMetaWindows() : [];
      },
      loadWindows: () => this._loadApplyPinWindows(),
      baselineIds: () => this._applyBaselineWindowIds(),
      beginBatch: (name) => {
        const wm = this._wm();
        if (typeof wm?.beginOpenLayoutBatch !== "function") {
          return { ok: false, error: "beginOpenLayoutBatch missing" };
        }
        return wm.beginOpenLayoutBatch(name);
      },
      releaseDeferred: () => {
        const wm = this._wm();
        if (typeof wm?.releaseDeferredOpens !== "function") {
          return { ok: false, error: "releaseDeferredOpens missing" };
        }
        return wm.releaseDeferredOpens();
      },
      endBatch: (reason) => {
        const wm = this._wm();
        if (typeof wm?.endOpenLayoutBatch !== "function") {
          return { ok: false, error: "endOpenLayoutBatch missing" };
        }
        return wm.endOpenLayoutBatch(reason || "open-batch");
      },
      onWindowEvent: (cb) => this._subscribeApplyOpenSignals(cb),
    };
  }

  /**
   * Hard/soft/verify: Meta TILE/rect/mon/focus signals + heuristics file.
   * Not a GetTree poll.
   */
  _layoutApplySettleDeps() {
    return {
      snapshotForest: (run) => this._snapshotForestForApply(run || this._applyLiveRun()),
      loadWindows: (run) => this._loadApplyPinWindows(run),
      onWindowEvent: (cb) => this._subscribeApplySettleSignals(cb),
      onFocusEvent: (cb) => this._subscribeApplySettleSignals(cb),
      restorePin: () => this._restoreApplyOpenLeafPin(),
      runSteps: (steps, ctx) => this._runApplyLayoutSteps(steps, ctx),
      readHeuristics: () => this._readSettleHeuristics(),
      writeHeuristics: (text) => this._writeSettleHeuristics(text),
      resolveHost: () => this._applySettleHost(),
    };
  }

  _loadApplyPinWindows(run) {
    const wm = this._wm();
    try {
      wm?.admitUntrackedWindows?.();
    } catch (e) {
      Logger.warn(`session-api apply admit: ${e}`);
    }
    const forest = this._snapshotForestForApply(run || this._applyLiveRun());
    try {
      const census = wm?.censusMetaWindows?.() || [];
      if (Array.isArray(census) && census.length) forest.metaWindows = census;
    } catch (e) {
      Logger.warn(`session-api apply census: ${e}`);
    }
    return collectWindows(forest);
  }

  _applyLiveRun() {
    return this._layoutApplyRuns?.live || {};
  }

  _applySettleHost() {
    const env = GLib.getenv("FORGE_HOST");
    if (env && String(env).trim()) return String(env).trim().toLowerCase();
    let name = "unknown";
    try {
      name = GLib.get_host_name() || "unknown";
    } catch (_e) {
      name = "unknown";
    }
    return String(name).split(".", 1)[0].trim().toLowerCase() || "unknown";
  }

  _settleHeuristicsFile() {
    return Gio.File.new_for_path(GLib.build_filenamev([forgeConfigDir(), HEURISTICS_FILENAME]));
  }

  _readSettleHeuristics() {
    try {
      const file = this._settleHeuristicsFile();
      if (!file.query_exists(null)) return null;
      const [ok, contents] = file.load_contents(null);
      if (!ok) return null;
      return new TextDecoder().decode(contents);
    } catch (e) {
      Logger.warn(`session-api settle-heuristics read: ${e}`);
      return null;
    }
  }

  _writeSettleHeuristics(text) {
    const dir = forgeConfigDir();
    GLib.mkdir_with_parents(dir, 0o755);
    const file = this._settleHeuristicsFile();
    file.replace_contents(
      String(text ?? ""),
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null
    );
  }

  _restoreApplyOpenLeafPin() {
    const wm = this._wm();
    if (typeof wm?.restoreLayoutOpenLeafIfStolen !== "function") return false;
    const focus = wm.focusMetaWindow;
    const node = focus && wm.tree?.findNode ? wm.tree.findNode(focus) : null;
    if (!node) return false;
    try {
      return !!wm.restoreLayoutOpenLeafIfStolen(node);
    } catch (e) {
      Logger.warn(`session-api apply restore pin: ${e}`);
      return false;
    }
  }

  /**
   * Meta TILE/rect/mon/focus → settle waiters (not GetTree poll).
   * @param {() => void} cb
   * @returns {() => void}
   */
  _subscribeApplySettleSignals(cb) {
    const display = global.display;
    const ids = [];
    const perWin = new Map();
    const fire = () => {
      try {
        cb();
      } catch (e) {
        Logger.warn(`session-api apply settle signal: ${e}`);
      }
    };
    const hookMeta = (meta) => {
      if (!meta || perWin.has(meta)) return;
      const sids = [];
      for (const sig of ["size-changed", "position-changed", "notify::fullscreen", "unmanaged"]) {
        try {
          sids.push(meta.connect(sig, fire));
        } catch (_e) {
          /* */
        }
      }
      perWin.set(meta, sids);
    };
    if (display) {
      try {
        ids.push(
          display.connect("window-created", (_d, meta) => {
            hookMeta(meta);
            fire();
          })
        );
      } catch (e) {
        Logger.warn(`session-api apply settle window-created: ${e}`);
      }
      try {
        ids.push(display.connect("notify::focus-window", fire));
      } catch (_e) {
        /* */
      }
      try {
        ids.push(display.connect("window-entered-monitor", fire));
      } catch (_e) {
        /* */
      }
      try {
        ids.push(display.connect("window-left-monitor", fire));
      } catch (_e) {
        /* */
      }
    }
    const wm = this._wm();
    try {
      for (const meta of wm?.windowsAllWorkspaces || []) hookMeta(meta);
    } catch (_e) {
      /* */
    }
    return () => {
      if (display) {
        for (const id of ids) {
          try {
            display.disconnect(id);
          } catch (_e) {
            /* */
          }
        }
      }
      for (const [meta, sids] of perWin) {
        for (const sid of sids) {
          try {
            meta.disconnect(sid);
          } catch (_e) {
            /* */
          }
        }
      }
      perWin.clear();
    };
  }

  _applyBaselineWindowIds() {
    const forest = this._snapshotForestForApply(this._applyLiveRun());
    const ids = [];
    for (const w of collectWindows(forest)) {
      if (w?.windowId != null && String(w.windowId).trim() !== "") {
        ids.push(String(w.windowId).trim());
      }
    }
    return ids;
  }

  /**
   * Meta map / title / class → pin waiter (not GetTree poll).
   * @param {() => void} cb
   * @returns {() => void}
   */
  _subscribeApplyOpenSignals(cb) {
    const display = global.display;
    const ids = [];
    const perWin = new Map();
    const fire = () => {
      try {
        cb();
      } catch (e) {
        Logger.warn(`session-api apply map signal: ${e}`);
      }
    };
    const hookMeta = (meta) => {
      if (!meta || perWin.has(meta)) return;
      const sids = [];
      try {
        sids.push(meta.connect("notify::title", fire));
      } catch (_e) {
        /* */
      }
      try {
        sids.push(meta.connect("notify::wm-class", fire));
      } catch (_e) {
        /* */
      }
      perWin.set(meta, sids);
    };
    if (display) {
      try {
        ids.push(
          display.connect("window-created", (_d, meta) => {
            hookMeta(meta);
            fire();
          })
        );
      } catch (e) {
        Logger.warn(`session-api apply window-created: ${e}`);
      }
    }
    const wm = this._wm();
    try {
      for (const meta of wm?.windowsAllWorkspaces || []) hookMeta(meta);
    } catch (_e) {
      /* */
    }
    return () => {
      if (display) {
        for (const id of ids) {
          try {
            display.disconnect(id);
          } catch (_e) {
            /* */
          }
        }
      }
      for (const [meta, sids] of perWin) {
        for (const sid of sids) {
          try {
            meta.disconnect(sid);
          } catch (_e) {
            /* */
          }
        }
      }
      perWin.clear();
    };
  }

  /**
   * GJS spawn / DesktopAppInfo launch. Never calls forge launch over DBus.
   *
   * Multi-word desktop Names ("Google Voice") must resolve via DesktopAppInfo
   * search — not shell-split into argv0 "Google" (AL8 open-miss on host dev).
   *
   * @param {object} fields
   * @param {object} action
   */
  _spawnApplyLaunch(fields, action) {
    const app = String(fields?.app || "").trim();
    if (!app) return { ok: false, error: "app required" };
    const waitClasses = waitClassesFromOpenAction(action, null);
    const timeoutMs =
      fields?.timeout != null && Number.isFinite(Number(fields.timeout))
        ? Number(fields.timeout)
        : DEFAULT_OPEN_PIN_TIMEOUT_MS;
    const payload = {
      waitClasses,
      acceptAnyNew: waitClasses == null,
      timeoutMs,
      app,
    };

    try {
      // Path-like only: never treat "Google Voice" as argv just because of spaces.
      if (isPathLikeLaunchApp(app)) {
        const argv = shellSplit(app);
        if (!argv.length) return { ok: false, error: "empty app command", ...payload };
        const pid = this._spawnArgvDetached(argv);
        return { ok: true, pid, ...payload };
      }

      const info = this._desktopAppInfoForLaunch(app, fields);
      if (info) {
        const ctx =
          typeof global.create_app_launch_context === "function"
            ? global.create_app_launch_context(0, -1)
            : null;
        const launched = info.launch([], ctx);
        if (!launched)
          return { ok: false, error: `DesktopAppInfo.launch failed: ${app}`, ...payload };
        return { ok: true, desktop: info.get_id?.() || app, ...payload };
      }

      // Ghostty rewrite / bare PATH cmds (may include flags and spaces).
      const argv = shellSplit(app);
      if (!argv.length) return { ok: false, error: `app not found: ${app}`, ...payload };
      const pid = this._spawnArgvDetached(argv);
      return { ok: true, pid, ...payload };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), ...payload };
    }
  }

  /**
   * @param {string} app
   * @param {object} [fields]
   * @returns {Gio.DesktopAppInfo|null}
   */
  _desktopAppInfoForLaunch(app, fields) {
    const raw = String(app || "").trim();
    const tryIds = [];
    const seen = new Set();
    const push = (id) => {
      const s = String(id ?? "").trim();
      if (!s || seen.has(s)) return;
      seen.add(s);
      tryIds.push(s);
    };
    const wc = fields?.wm_class ?? fields?.wmClass;
    for (const did of chromePwaDesktopIds(wc)) push(did);
    for (const id of desktopLaunchTryIds(raw, fields)) push(id);

    for (const id of tryIds) {
      try {
        const info = Gio.DesktopAppInfo.new(id);
        if (info) return info;
      } catch (_e) {
        /* */
      }
    }
    // Name search last ("Google Voice" → chrome-…-Default.desktop).
    // Prefer exact Name so "YouTube" does not pick "YouTube TV" (search ranks both).
    if (raw) {
      try {
        const found = Gio.DesktopAppInfo.search(raw);
        const ids = [];
        const nameById = {};
        const flat = Array.isArray(found) ? found : [];
        for (const group of flat) {
          if (!Array.isArray(group)) continue;
          for (const id of group) {
            const did = String(id ?? "").trim();
            if (!did || nameById[did] != null) continue;
            ids.push(did);
            try {
              const probe = Gio.DesktopAppInfo.new(did);
              if (probe) nameById[did] = String(probe.get_name?.() || "");
            } catch (_e) {
              nameById[did] = "";
            }
          }
        }
        const pick = pickDesktopSearchResult(raw, found, nameById);
        if (pick) {
          const info = Gio.DesktopAppInfo.new(pick);
          if (info) return info;
        }
      } catch (_e) {
        /* */
      }
    }
    return null;
  }

  _spawnArgvDetached(argv) {
    const launcher = new Gio.SubprocessLauncher({
      flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    });
    try {
      launcher.set_cwd(GLib.get_home_dir());
    } catch (_e) {
      /* */
    }
    for (const key of [
      "NO_COLOR",
      "FORCE_COLOR",
      "CLICOLOR",
      "CLICOLOR_FORCE",
      "CARGO_TERM_COLOR",
      "PIP_NO_COLOR",
      "NPM_CONFIG_COLOR",
      "PY_COLORS",
      "PYTHON_COLORS",
      "FORGE_JOB",
      "FORGE_JOB_WORKER",
      "FORGE_JOB_ID",
      "FORGE_JOB_DIR",
    ]) {
      try {
        launcher.unsetenv(key);
      } catch (_e) {
        /* */
      }
    }
    const proc = launcher.spawnv(argv);
    try {
      return Number(proc.get_identifier()) || proc.get_identifier() || null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * In-process forest for ApplyLayout (projectForest; not DBus GetTree).
   * @param {object} [run]
   * @returns {object}
   */
  _snapshotForestForApply(run = {}) {
    const tree = this._ext?.extWm?.tree;
    if (!tree) {
      throw new Error("Tree not available");
    }

    let liveMap = null;
    try {
      liveMap = this._ext.extWm.getMonitorLiveMap?.() ?? null;
    } catch (_e) {
      liveMap = null;
    }

    const workspace = run?.workspace != null ? run.workspace : null;
    const monitorNodes =
      typeof tree.getNodeByType === "function" ? tree.getNodeByType(NODE_TYPES.MONITOR) : [];

    let focusWindowId = null;
    try {
      const focusMeta = this._wm()?.focusMetaWindow ?? null;
      if (focusMeta) {
        const meta = windowMetaFields(focusMeta);
        if (meta.id != null) focusWindowId = meta.id;
      }
    } catch (_e) {
      focusWindowId = null;
    }

    let lastTileFocusWindowId = null;
    try {
      const wm = this._wm();
      const lftNode = wm?.lftMru?.globalHead?.() ?? wm?.lastFocusedWindow ?? null;
      const lftMeta = lftNode?.nodeValue ?? null;
      if (lftMeta) {
        const lm = windowMetaFields(lftMeta);
        if (lm.id != null) lastTileFocusWindowId = lm.id;
      }
    } catch (_e) {
      lastTileFocusWindowId = null;
    }

    let activeWorkspace = null;
    let nWorkspaces = null;
    try {
      const wsMgr = global.display?.get_workspace_manager?.() ?? global.workspace_manager ?? null;
      if (wsMgr) {
        if (typeof wsMgr.get_active_workspace_index === "function") {
          const idx = wsMgr.get_active_workspace_index();
          if (Number.isFinite(idx)) activeWorkspace = idx;
        }
        if (typeof wsMgr.get_n_workspaces === "function") {
          const n = wsMgr.get_n_workspaces();
          if (Number.isFinite(n)) nWorkspaces = n;
        }
      }
    } catch (_e) {
      /* optional session meta */
    }

    const forest = projectForest(monitorNodes, {
      liveMap,
      workspace,
      focusWindowId,
      lastTileFocusWindowId,
      activeWorkspace: activeWorkspace != null ? activeWorkspace : workspace,
      nWorkspaces,
    });

    try {
      const extra = [];
      const seen = new Set();
      const walk = (n) => {
        if (!n) return;
        if (n.nodeType === "WINDOW" && n.windowId != null) seen.add(String(n.windowId));
        for (const c of n.children || []) walk(c);
      };
      for (const m of forest.monitors || []) walk(m);
      for (const node of tree.getNodeByType?.(NODE_TYPES.WINDOW) || []) {
        if (node?.placeholder || node?.isPlaceholder?.()) continue;
        const proj = projectNode(node, {}, 0);
        const id = proj?.windowId;
        if (id == null || seen.has(String(id))) continue;
        seen.add(String(id));
        extra.push(proj);
      }
      if (extra.length) forest.orphanWindows = extra;
    } catch (_e) {
      /* optional orphans */
    }

    return forest;
  }

  /**
   * Structure RunSteps for ApplyLayout: layout uses setLayout (I1), never _layoutOp.
   * @param {object[]} steps
   * @param {{ phase?: string, run?: object }} [ctx]
   * @returns {{ ok: boolean, error?: string, results?: object[] }}
   */
  _runApplyLayoutSteps(steps, ctx = {}) {
    const wm = this._wm();
    if (!wm) {
      return { ok: false, error: "window manager not ready", code: "no-wm" };
    }

    try {
      wm?.unfreezeRender?.();
    } catch (e) {
      Logger.warn(`session-api ApplyLayout pre-unfreeze: ${e}`);
    }
    try {
      wm?.freezeRender?.();
    } catch (e) {
      Logger.warn(`session-api ApplyLayout freeze: ${e}`);
    }

    const handlers = {
      ...this._runStepHandlers(),
      // REG-ensure-flatten: profile structure must not peel nested CONs.
      layout: (step) => this._setLayoutStructureOp(step.mode, step.selector, { quiet: true }),
    };

    let dispatchResult;
    try {
      dispatchResult = runStepsDispatch(steps, handlers, { stopOnError: true });
    } finally {
      try {
        wm?.unfreezeRender?.();
      } catch (e) {
        Logger.warn(`session-api ApplyLayout unfreeze: ${e}`);
      }
      try {
        if (typeof wm.commitLayout === "function") {
          wm.commitLayout("apply-layout", { force: true });
        } else {
          wm.renderTree?.("apply-layout", true);
        }
      } catch (e) {
        Logger.warn(`session-api ApplyLayout commit: ${e}`);
      }
      this._scheduleRunStepsSettle(wm);
    }

    if (!dispatchResult?.ok) {
      const failed = (dispatchResult?.results || []).find((r) => r && r.ok === false);
      return {
        ok: false,
        error: failed?.error || `${ctx.phase || "structure"} steps failed`,
        code: "steps-failed",
        results: dispatchResult?.results,
      };
    }
    return { ok: true, results: dispatchResult.results };
  }

  /**
   * Ensure layout for ApplyLayout: setLayout (I1) + optional mon-wrap split.
   * Does not flatten nested CONs. Fails clearly if structure cannot map safely.
   * @param {string} mode
   * @param {string} [selector]
   * @param {{ quiet?: boolean }} [opts]
   */
  _setLayoutStructureOp(mode, selector, opts = {}) {
    const quiet = !!opts.quiet;
    const sel = selector != null && String(selector).trim() !== "" ? String(selector) : "focus";
    const resolved = this._resolveWindow(sel);
    if (!resolved.ok) return resolved;

    const focusNode = resolved.match.node;
    if (!focusNode?.parentNode) {
      return { error: "window has no parent container" };
    }

    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree) {
      return { error: "Tree not available" };
    }

    const settings = this._ext?.settings;
    if (
      mode === LAYOUT_TYPES.STACKED ||
      mode === "STACKED" ||
      String(mode).toLowerCase() === "stacked"
    ) {
      if (settings && !settings.get_boolean("stacked-tiling-mode-enabled")) {
        return { error: "stacked-tiling-mode-enabled is false" };
      }
    }
    if (
      mode === LAYOUT_TYPES.TABBED ||
      mode === "TABBED" ||
      String(mode).toLowerCase() === "tabbed"
    ) {
      if (settings && !settings.get_boolean("tabbed-tiling-mode-enabled")) {
        return { error: "tabbed-tiling-mode-enabled is false" };
      }
    }

    const layoutValue =
      mode === "TABBED" || mode === LAYOUT_TYPES.TABBED || String(mode).toLowerCase() === "tabbed"
        ? LAYOUT_TYPES.TABBED
        : mode === "STACKED" ||
          mode === LAYOUT_TYPES.STACKED ||
          String(mode).toLowerCase() === "stacked"
        ? LAYOUT_TYPES.STACKED
        : mode === "HSPLIT" ||
          mode === LAYOUT_TYPES.HSPLIT ||
          String(mode).toLowerCase() === "hsplit"
        ? LAYOUT_TYPES.HSPLIT
        : mode === "VSPLIT" ||
          mode === LAYOUT_TYPES.VSPLIT ||
          String(mode).toLowerCase() === "vsplit"
        ? LAYOUT_TYPES.VSPLIT
        : null;

    if (!layoutValue) {
      return { error: `unsupported layout mode: ${mode}` };
    }

    const isTabOrStack =
      layoutValue === LAYOUT_TYPES.TABBED || layoutValue === LAYOUT_TYPES.STACKED;

    let liveNode = focusNode;
    let parent = liveNode.parentNode;

    // Tab/stack wrap into own CON when mon-direct or multi-window H/V bag.
    // Structure create only — never _flattenLayoutParentToWindows.
    if (isTabOrStack && parent) {
      const isMon =
        (typeof parent.isMonitor === "function" && parent.isMonitor()) ||
        parent.nodeType === NODE_TYPES.MONITOR ||
        parent.nodeType === "MONITOR";
      const isHvCon =
        parent.nodeType === NODE_TYPES.CON &&
        (parent.isHSplit?.() ||
          parent.isVSplit?.() ||
          parent.layout === LAYOUT_TYPES.HSPLIT ||
          parent.layout === LAYOUT_TYPES.VSPLIT);
      let windowKids = 0;
      let hasNestedCon = false;
      if (Array.isArray(parent.childNodes)) {
        for (const c of parent.childNodes) {
          if (c?.nodeType === NODE_TYPES.WINDOW || c?.isWindow?.()) windowKids += 1;
          if ((typeof c?.isCon === "function" && c.isCon()) || c?.nodeType === NODE_TYPES.CON) {
            hasNestedCon = true;
          }
        }
      }
      if (hasNestedCon && !isMon) {
        return {
          error:
            "ensure_layout needs flatten of nested CONs; refused (use skeleton/bind or fix structure)",
          code: "ensure-flatten-refused",
        };
      }
      const needWrap = isMon || (isHvCon && windowKids > 1);
      if (needWrap) {
        try {
          tree.split?.(liveNode, ORIENTATION_TYPES.HORIZONTAL, true);
        } catch (e) {
          return { error: `split before setLayout failed: ${e.message || e}` };
        }
        const meta = liveNode.nodeValue;
        liveNode = (meta != null && tree.findNode?.(meta)) || liveNode;
        parent = liveNode.parentNode;
        if (
          !parent ||
          (typeof parent.isMonitor === "function" && parent.isMonitor()) ||
          parent.nodeType === NODE_TYPES.MONITOR ||
          parent.nodeType === "MONITOR"
        ) {
          return { error: "split before setLayout failed: still on monitor" };
        }
      }
    }

    const prev = parent.layout;
    const layoutOpts = {};
    if (prev === LAYOUT_TYPES.TABBED && layoutValue !== LAYOUT_TYPES.TABBED) {
      layoutOpts.lastTabFocus = null;
    }
    if (isTabOrStack) {
      const prevFocus =
        layoutOpts.lastTabFocus !== undefined ? layoutOpts.lastTabFocus : parent.lastTabFocus;
      let focusStillChild = false;
      if (prevFocus != null && Array.isArray(parent.childNodes)) {
        for (const c of parent.childNodes) {
          if (c && c.nodeValue === prevFocus) {
            focusStillChild = true;
            break;
          }
        }
      }
      if (!focusStillChild) {
        layoutOpts.lastTabFocus = liveNode.nodeValue ?? parent.lastTabFocus;
      }
    }
    if (layoutValue === LAYOUT_TYPES.HSPLIT || layoutValue === LAYOUT_TYPES.VSPLIT) {
      layoutOpts.resetPercents = true;
    }
    tree.setLayout(parent, layoutValue, layoutOpts);

    try {
      tree.attachNode = parent;
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("apply-layout-setLayout", { force: true });
        } else {
          wm?.renderTree?.("apply-layout-setLayout", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api setLayout structure post: ${e}`);
    }

    return {
      ok: true,
      mode: layoutValue,
      structure: true,
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * @param {"LayoutApplyProgress"|"LayoutApplyDone"} name
   * @param {object} payload
   */
  _emitLayoutApplySignal(name, payload) {
    try {
      if (!this._export) return;
      const body = JSON.stringify(payload ?? {});
      this._export.emit_signal(name, new GLib.Variant("(s)", [body]));
    } catch (e) {
      Logger.warn(`session-api emit ${name}: ${e}`);
    }
  }

  /**
   * DBus: LayoutBatch(action) → JSON
   *
   * CL5 multi-open / forge layout: begin → open all → residual RunSteps (one
   * render) → end. Optional CLI fingerprint quiet is debug-only. While active,
   * per-app open commits and requestLayout only latch need-commit (no mid-batch
   * render flood).
   *
   * CL9: release | release-deferred | unhide — unhide deferred maps without
   * ending the batch (before residual plan + RunSteps).
   *
   * chrome-show | show-chrome — show apply chrome without a batch (CLI at
   * apply start, including no-open). chrome-clear hides it after focus/soft.
   * end() does not clear.
   *
   * @param {string} action "begin" | "end" | "release-deferred" | "chrome-show" | "chrome-clear"
   */
  LayoutBatch(action) {
    try {
      const wm = this._wm();
      if (!wm) {
        return JSON.stringify({ ok: false, error: "window manager not ready" });
      }
      const raw = action == null ? "" : String(action).trim();
      const lower = raw.toLowerCase();
      // begin | start | begin:dev | begin dev | begin name=dev
      if (
        lower === "begin" ||
        lower === "start" ||
        lower.startsWith("begin:") ||
        lower.startsWith("begin ") ||
        lower.startsWith("start:") ||
        lower.startsWith("start ")
      ) {
        if (typeof wm.beginOpenLayoutBatch !== "function") {
          return JSON.stringify({ ok: false, error: "beginOpenLayoutBatch missing" });
        }
        let layoutName = null;
        if (lower.startsWith("begin:") || lower.startsWith("start:")) {
          layoutName = raw.slice(raw.indexOf(":") + 1).trim() || null;
        } else if (lower.startsWith("begin ") || lower.startsWith("start ")) {
          layoutName = raw.slice(raw.indexOf(" ") + 1).trim() || null;
        }
        if (layoutName && /^name\s*=/i.test(layoutName)) {
          layoutName = layoutName.replace(/^name\s*=\s*/i, "").trim() || null;
        }
        // Strip accidental quotes from CLI.
        if (
          layoutName &&
          ((layoutName.startsWith('"') && layoutName.endsWith('"')) ||
            (layoutName.startsWith("'") && layoutName.endsWith("'")))
        ) {
          layoutName = layoutName.slice(1, -1).trim() || null;
        }
        return JSON.stringify(wm.beginOpenLayoutBatch(layoutName));
      }
      if (lower === "admit" || lower === "admit-untracked" || lower === "admit_untracked") {
        if (typeof wm.admitUntrackedWindows === "function") {
          return JSON.stringify(wm.admitUntrackedWindows());
        }
        return JSON.stringify({ ok: false, error: "admitUntrackedWindows missing" });
      }
      if (
        lower === "release" ||
        lower === "release-deferred" ||
        lower === "unhide" ||
        lower === "release_deferred"
      ) {
        if (typeof wm.releaseDeferredOpens === "function") {
          return JSON.stringify(wm.releaseDeferredOpens());
        }
        if (typeof wm._releaseAllDeferredOpens === "function") {
          const n = wm._releaseAllDeferredOpens();
          return JSON.stringify({
            ok: true,
            released: typeof n === "number" ? n : 0,
            depth: wm._openLayoutBatchDepth || 0,
          });
        }
        return JSON.stringify({ ok: false, error: "releaseDeferredOpens missing" });
      }
      if (
        lower === "chrome-show" ||
        lower === "show-chrome" ||
        lower === "chrome-begin" ||
        lower.startsWith("chrome-show:") ||
        lower.startsWith("chrome-show ") ||
        lower.startsWith("show-chrome:") ||
        lower.startsWith("show-chrome ")
      ) {
        let layoutName = null;
        if (lower.startsWith("chrome-show:") || lower.startsWith("show-chrome:")) {
          layoutName = raw.slice(raw.indexOf(":") + 1).trim() || null;
        } else if (lower.startsWith("chrome-show ") || lower.startsWith("show-chrome ")) {
          layoutName = raw.slice(raw.indexOf(" ") + 1).trim() || null;
        }
        if (layoutName && /^name\s*=/i.test(layoutName)) {
          layoutName = layoutName.replace(/^name\s*=\s*/i, "").trim() || null;
        }
        if (
          layoutName &&
          ((layoutName.startsWith('"') && layoutName.endsWith('"')) ||
            (layoutName.startsWith("'") && layoutName.endsWith("'")))
        ) {
          layoutName = layoutName.slice(1, -1).trim() || null;
        }
        if (typeof wm.showLayoutApplyChrome === "function") {
          return JSON.stringify(wm.showLayoutApplyChrome(layoutName));
        }
        return JSON.stringify({ ok: false, error: "showLayoutApplyChrome missing" });
      }
      if (
        lower === "chrome-clear" ||
        lower === "clear-chrome" ||
        lower === "chrome-end" ||
        lower === "chrome_clear"
      ) {
        if (typeof wm.clearLayoutApplyChrome === "function") {
          return JSON.stringify(wm.clearLayoutApplyChrome());
        }
        try {
          wm.layoutApplyChrome?.setLayoutName?.(null);
          wm.layoutApplyChrome?.clear?.();
        } catch (_e) {
          // ignore
        }
        return JSON.stringify({ ok: true, cleared: false });
      }
      // end | end:open-batch | end open-batch
      let reason = "open-batch";
      let isEnd = false;
      if (lower === "end" || lower === "finish" || lower === "close") {
        isEnd = true;
      } else if (lower.startsWith("end:") || lower.startsWith("end ")) {
        isEnd = true;
        reason = raw.slice(4).trim() || "open-batch";
      }
      if (isEnd) {
        if (typeof wm.endOpenLayoutBatch !== "function") {
          return JSON.stringify({ ok: false, error: "endOpenLayoutBatch missing" });
        }
        return JSON.stringify(wm.endOpenLayoutBatch(reason));
      }
      return JSON.stringify({
        ok: false,
        error: `LayoutBatch action want begin|end|release-deferred|admit|chrome-show|chrome-clear (got ${
          raw || "empty"
        })`,
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message || e) });
    }
  }

  /**
   * DBus: GetTree(options_json) → JSON string
   * @param {string} optionsJson
   */
  GetTree(optionsJson) {
    try {
      let options = {};
      if (optionsJson && String(optionsJson).trim()) {
        try {
          options = JSON.parse(optionsJson);
          if (!options || typeof options !== "object" || Array.isArray(options)) {
            options = {};
          }
        } catch (e) {
          return JSON.stringify({ error: `invalid options_json: ${e.message || e}` });
        }
      }

      const tree = this._ext?.extWm?.tree;
      if (!tree) {
        return JSON.stringify({ error: "Tree not available" });
      }

      let liveMap = null;
      try {
        liveMap = this._ext.extWm.getMonitorLiveMap?.() ?? null;
      } catch (_e) {
        liveMap = null;
      }

      const maxDepth =
        options.maxDepth != null && options.maxDepth !== "" ? Number(options.maxDepth) : null;
      const monitor = options.monitor != null ? options.monitor : null;
      const workspace = options.workspace != null ? options.workspace : null;

      const monitorNodes =
        typeof tree.getNodeByType === "function" ? tree.getNodeByType(NODE_TYPES.MONITOR) : [];

      let focusWindowId = null;
      let focusMeta = null;
      try {
        // Same as session-layout save: live Mutter focus, not stale LFT alone.
        focusMeta = this._wm()?.focusMetaWindow ?? null;
        if (focusMeta) {
          const meta = windowMetaFields(focusMeta);
          if (meta.id != null) focusWindowId = meta.id;
        }
      } catch (_e) {
        focusWindowId = null;
        focusMeta = null;
      }
      // Do NOT sync lastTabFocus from Meta keyboard focus here (D018).
      // Open leaf and keyboard focus are distinct (profile focus on ghostty while
      // mon0 tab shows Grok). Mutating the live tree on every GetTree made soft
      // focus barrier thrash: keyboard:false focus set LTF, then the next GetTree
      // poll stomped LTF back to the focused TILE sibling. Session save has its
      // own syncLastTabFocusFromFocus path when flushing layout to disk.

      // Last focused TILE (LFT) for layout save when keyboard focus is a float
      // not included in the profile (default save omits floats).
      let lastTileFocusWindowId = null;
      try {
        const wm = this._wm();
        const lftNode = wm?.lftMru?.globalHead?.() ?? wm?.lastFocusedWindow ?? null;
        const lftMeta = lftNode?.nodeValue ?? (lftNode?.isWindow?.() ? lftNode.nodeValue : null);
        if (lftMeta) {
          const lm = windowMetaFields(lftMeta);
          if (lm.id != null) lastTileFocusWindowId = lm.id;
        }
      } catch (_e) {
        lastTileFocusWindowId = null;
      }

      // Layout CLI (WS1): current Meta workspace index + session count.
      let activeWorkspace = null;
      let nWorkspaces = null;
      try {
        const wsMgr = global.display?.get_workspace_manager?.() ?? global.workspace_manager ?? null;
        if (wsMgr) {
          if (typeof wsMgr.get_active_workspace_index === "function") {
            const idx = wsMgr.get_active_workspace_index();
            if (Number.isFinite(idx)) activeWorkspace = idx;
          }
          if (typeof wsMgr.get_n_workspaces === "function") {
            const n = wsMgr.get_n_workspaces();
            if (Number.isFinite(n)) nWorkspaces = n;
          }
        }
      } catch (_e) {
        activeWorkspace = null;
        nWorkspaces = null;
      }

      const forest = projectForest(monitorNodes, {
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : null,
        liveMap,
        monitor,
        workspace,
        onlyWithChildren: !!options.onlyWithChildren,
        focusWindowId,
        lastTileFocusWindowId,
        activeWorkspace,
        nWorkspaces,
      });

      if (options.includeMeta || options.metaWindows) {
        try {
          forest.metaWindows = this._ext?.extWm?.censusMetaWindows?.() ?? [];
        } catch (_e) {
          forest.metaWindows = [];
        }
      }

      // Flatten every real WINDOW (incl. orphans not under a MONITOR).
      try {
        const extra = [];
        const seen = new Set();
        const walk = (n) => {
          if (!n) return;
          if (n.nodeType === "WINDOW" && n.windowId != null) seen.add(String(n.windowId));
          for (const c of n.children || []) walk(c);
        };
        for (const m of forest.monitors || []) walk(m);
        for (const node of tree.getNodeByType?.(NODE_TYPES.WINDOW) || []) {
          if (node?.placeholder || node?.isPlaceholder?.()) continue;
          const proj = projectNode(node, options, 0);
          const id = proj?.windowId;
          if (id == null || seen.has(String(id))) continue;
          seen.add(String(id));
          extra.push(proj);
        }
        if (extra.length) forest.orphanWindows = extra;
      } catch (_e) {
        // optional
      }

      return JSON.stringify(forest);
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: Focus(selector) → JSON
   * @param {string} selector
   */
  Focus(selector) {
    try {
      return JSON.stringify(this._focusOp(selector));
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: Swap(selector_a, selector_b) → JSON
   * @param {string} selectorA
   * @param {string} selectorB
   */
  Swap(selectorA, selectorB) {
    try {
      return JSON.stringify(this._swapOp(selectorA, selectorB, { quiet: false }));
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: Move(selector, dest) → JSON
   *
   * Dest WINDOW: reparent source after dest in dest's parent (not swapPairs).
   * Dest CON/MONITOR (path): append source as child, then reset sibling percents.
   *
   * @param {string} selector
   * @param {string} dest
   */
  Move(selector, dest) {
    try {
      return JSON.stringify(this._moveOp(selector, dest, { quiet: false }));
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: PlaceNext(options_json) → JSON
   *
   * One-shot placement for the next matching window map (FC2 launch).
   * Options: { wmClass?, monitor?, treePath?, attachSelector?, ttlMs?, expiresAt?, first? }
   *
   * @param {string} optionsJson
   */
  PlaceNext(optionsJson) {
    try {
      let options = {};
      if (optionsJson && String(optionsJson).trim()) {
        try {
          options = JSON.parse(optionsJson);
        } catch (e) {
          return JSON.stringify({ error: `invalid options_json: ${e.message || e}` });
        }
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        return JSON.stringify({ error: "options must be an object" });
      }

      const wm = this._wm();
      if (!wm?.placeNext) {
        return JSON.stringify({ error: "WindowManager not available" });
      }

      const result = wm.placeNext(options);
      if (!result?.ok) {
        return JSON.stringify({ error: result?.error || "PlaceNext failed" });
      }
      return JSON.stringify({
        ok: true,
        expiresAt: result.hint?.expiresAt ?? null,
        wmClass: result.hint?.wmClass ?? null,
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: GetSetting(key) → JSON {ok, key, value, type, schema?}
   * @param {string} key
   */
  GetSetting(key) {
    try {
      const sync = this._configSync();
      if (!sync?.getPortable) {
        return JSON.stringify({ error: "ConfigSync not available" });
      }
      const result = sync.getPortable(key);
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        ok: true,
        key: result.key,
        schema: result.schema,
        value: result.value,
        type: result.type,
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: SetSetting(key, value_json) → JSON
   * value_json may be JSON or plain text (same rules as CLI parseSettingValueText).
   * @param {string} key
   * @param {string} valueJson
   */
  SetSetting(key, valueJson) {
    try {
      const sync = this._configSync();
      if (!sync?.setPortable) {
        return JSON.stringify({ error: "ConfigSync not available" });
      }
      const parsed = parseSettingValueText(valueJson);
      if (!parsed.ok) {
        return JSON.stringify({ error: parsed.error });
      }
      const result = sync.setPortable(key, parsed.value);
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        ok: true,
        key: result.key,
        schema: result.schema,
        value: result.value,
        type: result.type,
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: SettingsSave(name) → JSON
   * Writes ~/.config/forge/profiles/<name>/{settings,keybindings}.json
   * @param {string} name
   */
  SettingsSave(name) {
    try {
      const sync = this._configSync();
      if (!sync?.saveNamedProfile) {
        return JSON.stringify({ error: "ConfigSync not available" });
      }
      if (!name || !String(name).trim()) {
        return JSON.stringify({ error: "profile name required" });
      }
      const result = sync.saveNamedProfile(String(name).trim());
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        ok: true,
        name: result.name,
        path: result.path,
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: SettingsLoad(name) → JSON
   * Imports named profile into live GSettings.
   * @param {string} name
   */
  SettingsLoad(name) {
    try {
      const sync = this._configSync();
      if (!sync?.loadNamedProfile) {
        return JSON.stringify({ error: "ConfigSync not available" });
      }
      if (!name || !String(name).trim()) {
        return JSON.stringify({ error: "profile name required" });
      }
      const result = sync.loadNamedProfile(String(name).trim());
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        ok: true,
        name: result.name,
        path: result.path,
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  /**
   * DBus: RunSteps(steps_json) → JSON
   *
   * Freezes render, runs extension ops quiet, unfreezes, one Cf ("run-steps"),
   * then settleTabFocus per tab/stack (no second structure C). AP3 / actions.md.
   * Payload: steps array or { steps, stopOnError? }. stopOnError default true.
   * Launch/wait are CLI-only — rejected here.
   *
   * @param {string} stepsJson
   */
  RunSteps(stepsJson) {
    try {
      const parsed = parseStepsPayload(stepsJson ?? "");
      if (!parsed.ok) {
        return JSON.stringify({ error: parsed.error });
      }

      const wm = this._wm();
      try {
        wm?.unfreezeRender?.();
      } catch (e) {
        Logger.warn(`session-api RunSteps pre-unfreeze: ${e}`);
      }
      try {
        wm?.freezeRender?.();
      } catch (e) {
        Logger.warn(`session-api RunSteps freeze: ${e}`);
      }

      let dispatchResult;
      try {
        dispatchResult = runStepsDispatch(parsed.steps, this._runStepHandlers(), {
          stopOnError: parsed.stopOnError,
        });
      } finally {
        try {
          wm?.unfreezeRender?.();
        } catch (e) {
          Logger.warn(`session-api RunSteps unfreeze: ${e}`);
        }
        // Always force-paint. Leftover drag freeze used to skip this and
        // leave the first layout apply at mapped FLOAT geometry (R024).
        if (wm) {
          try {
            if (typeof wm.commitLayout === "function") {
              wm.commitLayout("run-steps", { force: true });
            } else {
              wm.renderTree?.("run-steps", true);
            }
          } catch (e) {
            Logger.warn(`session-api RunSteps commit: ${e}`);
          }
          this._scheduleRunStepsSettle(wm);
          wm._layoutBindPending = false;
        }
      }

      return JSON.stringify({
        ok: !!dispatchResult.ok,
        results: dispatchResult.results,
        ...(dispatchResult.stoppedAt != null ? { stoppedAt: dispatchResult.stoppedAt } : {}),
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  _clearRunStepsSettle() {
    if (!this._runStepsSettleSrcId) return;
    try {
      GLib.Source.remove(this._runStepsSettleSrcId);
    } catch (_e) {
      /* already fired */
    }
    this._runStepsSettleSrcId = 0;
  }

  _clearTabStripRestack() {
    if (!this._tabStripRestackSrcId) return;
    try {
      GLib.Source.remove(this._tabStripRestackSrcId);
    } catch (_e) {
      /* already fired */
    }
    this._tabStripRestackSrcId = 0;
  }

  /**
   * Queue settle after RunSteps render idle (same priority → FIFO after render).
   * @param {import('./window.js').WindowManager} wm
   */
  _scheduleRunStepsSettle(wm) {
    if (!wm) return;
    this._clearRunStepsSettle();
    this._clearTabStripRestack();
    try {
      this._runStepsSettleSrcId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this._runStepsSettleSrcId = 0;
        try {
          this._settleAfterRunSteps(wm);
        } catch (e) {
          Logger.warn(`session-api RunSteps settle: ${e}`);
        }
        // F raise can bury chrome after this turn (Wayland). Restack, no raise.
        this._scheduleTabStripRestack(wm);
        return GLib.SOURCE_REMOVE;
      });
    } catch (e) {
      Logger.warn(`session-api RunSteps settle schedule: ${e}`);
      try {
        this._settleAfterRunSteps(wm);
      } catch (e2) {
        Logger.warn(`session-api RunSteps settle: ${e2}`);
      }
      this._scheduleTabStripRestack(wm);
    }
  }

  /**
   * After last raise: restack strips only (R032). No settleTabFocus / raise.
   * @param {import('./window.js').WindowManager} wm
   */
  _scheduleTabStripRestack(wm) {
    if (!wm) return;
    this._clearTabStripRestack();
    const idlePri = GLib.PRIORITY_DEFAULT_IDLE ?? 200;
    try {
      this._tabStripRestackSrcId = GLib.idle_add(idlePri, () => {
        this._tabStripRestackSrcId = 0;
        try {
          this._restackTabDecorations(wm);
        } catch (e) {
          Logger.warn(`session-api tab restack: ${e}`);
        }
        return GLib.SOURCE_REMOVE;
      });
    } catch (e) {
      Logger.warn(`session-api tab restack schedule: ${e}`);
      try {
        this._restackTabDecorations(wm);
      } catch (e2) {
        Logger.warn(`session-api tab restack: ${e2}`);
      }
    }
  }

  /**
   * Post-RunSteps settle: open leaf per tab/stack via settleTabFocus (F+Dfocus+B).
   * Residual C already did Dfull+B; no second structure commit (AP3).
   * @param {import('./window.js').WindowManager} wm
   */
  _settleAfterRunSteps(wm) {
    if (!wm || wm.disabled) return;

    const wasFrozen = !!wm._freezeRender;
    try {
      if (wasFrozen) wm.unfreezeRender?.();
      const root = wm.currentWsNode;
      const cons = root
        ? root.getNodeByType(NODE_TYPES.CON)
        : wm.tree?.getNodeByType?.(NODE_TYPES.CON) || [];

      for (const con of cons) {
        if (!con?.isStackedOrTabbed?.()) continue;
        const focusNode = this._tabSettleFocusNode(wm, con);
        if (!focusNode) continue;
        try {
          if (typeof wm.settleTabFocus === "function") {
            wm.settleTabFocus(focusNode);
          } else {
            // Fallback when pipeline not wired (tests / older WM).
            if (con.isStacked?.()) wm.updateStackedFocus?.(focusNode);
            else wm.updateTabbedFocus?.(focusNode);
            wm.updateDecorationLayout?.({ scope: "focus", focusNode });
            wm.updateBorderLayout?.();
          }
        } catch (_e) {
          /* best-effort per group */
        }
      }
    } catch (e) {
      Logger.warn(`session-api settle tab focus: ${e}`);
    } finally {
      if (wasFrozen) {
        try {
          wm.freezeRender?.();
        } catch (_e) {
          /* ignore */
        }
      }
    }
  }

  /**
   * Put each TABBED/STACKED strip above its group actors. Does not raise.
   * @param {import('./window.js').WindowManager} wm
   */
  _restackTabDecorations(wm) {
    if (!wm || wm.disabled) return;

    const wasFrozen = !!wm._freezeRender;
    let groups = 0;
    try {
      if (wasFrozen) wm.unfreezeRender?.();
      const root = wm.currentWsNode;
      const cons = root
        ? root.getNodeByType(NODE_TYPES.CON)
        : wm.tree?.getNodeByType?.(NODE_TYPES.CON) || [];

      for (const con of cons) {
        if (!con?.isStackedOrTabbed?.()) continue;
        const focusNode = this._tabSettleFocusNode(wm, con);
        if (!focusNode) continue;
        groups += 1;
        try {
          wm.updateDecorationLayout?.({ scope: "focus", focusNode });
        } catch (_e) {
          /* best-effort per group */
        }
      }
      try {
        wm.updateBorderLayout?.();
      } catch (_e) {
        /* best-effort */
      }
      Logger.info(`session-api tab strip restack groups=${groups}`);
    } catch (e) {
      Logger.warn(`session-api restack tab decorations: ${e}`);
    } finally {
      if (wasFrozen) {
        try {
          wm.freezeRender?.();
        } catch (_e) {
          /* ignore */
        }
      }
    }
  }

  /**
   * @param {import('./window.js').WindowManager} wm
   * @param {import('./tree.js').Node} con
   * @returns {import('./tree.js').Node|null}
   */
  _tabSettleFocusNode(wm, con) {
    if (con.lastTabFocus) {
      const n = wm.tree?.findNode?.(con.lastTabFocus);
      if (n && (n.parentNode === con || con.contains?.(n))) return n;
    }
    const tiled =
      typeof wm.tree?.getTiledChildren === "function"
        ? wm.tree.getTiledChildren(con.childNodes || [])
        : con.childNodes || [];
    for (const child of tiled) {
      if (child?.isWindow?.()) return child;
      if (child?.isCon?.()) {
        const w = child.getNodeByType?.(NODE_TYPES.WINDOW)?.[0];
        if (w) return w;
      }
    }
    return null;
  }

  // --- op cores (quiet for RunSteps batch) ---

  /**
   * @returns {Record<string, (step: object) => object>}
   */
  _runStepHandlers() {
    return {
      ping: () => ({ ok: true }),
      focus: (step) =>
        this._focusOp(step.selector, {
          // Open-leaf (tab/stack active): pin+raise only. Keyboard activate
          // is reserved for profile focus so active leaves do not steal keys.
          keyboard: step.keyboard !== false && step.keyboard !== 0,
        }),
      swap: (step) => this._swapOp(step.a, step.b, { quiet: true }),
      move: (step) =>
        this._moveOp(step.tile, step.dest, {
          quiet: true,
          position: step.position,
        }),
      layout: (step) => this._layoutOp(step.mode, step.selector, { quiet: true }),
      "layout-cycle": (step) => this._layoutCycleOp(step.axis, step.selector, { quiet: true }),
      "merge-group": (step) => this._mergeGroupOp(step.selector, step.with, { quiet: true }),
      "dnd-drop": (step) =>
        this._dndDropOp(step.tile, step.onto, step.zone, {
          quiet: true,
          simulateEnteredMonitor: step.simulateEnteredMonitor !== false,
          destMonitor:
            typeof step.destMonitor === "number"
              ? step.destMonitor
              : step.destMonitor != null
              ? Number(step.destMonitor)
              : null,
        }),
      float: (step) => this._floatOp(step.selector, step.scope, { quiet: true }),
      order: (step) => this._orderMonChildrenOp(step.windowIds, { quiet: true }),
      size: (step) => this._sizeOp(step.windowIds, step.shares, { quiet: true }),
      "place-next": (step) => this._placeNextOp(step.options || {}),
      set: (step) => this._setOp(step.key, step.value),
      close: (step) => this._closeOp(step.selector, { force: !!step.force }),
      // FC2/FC3: same as WindowUnfocus command (no TILE keyboard focus).
      unfocus: () => this._unfocusOp(),
      skeleton: (step) => this._skeletonOp(step.mons, { workspace: step.workspace, quiet: true }),
      bind: (step) =>
        this._bindOp(step.tile, {
          layoutRole: step.layoutRole,
          layoutSlot: step.layoutSlot,
          placeholder: step.placeholder,
          quiet: true,
        }),
    };
  }

  /**
   * Clear TILE keyboard focus (best-effort). Used by live matrix + scripts.
   * @returns {object}
   */
  _unfocusOp() {
    const wm = this._ext?.extWm;
    try {
      if (wm && typeof wm.unfocusTiles === "function") {
        wm.unfocusTiles();
      } else if (wm?.focusManager && typeof wm.focusManager.unfocusTiles === "function") {
        wm.focusManager.unfocusTiles();
      } else {
        return { ok: false, error: "unfocusTiles not available" };
      }
      return { ok: true, op: "unfocus" };
    } catch (e) {
      return { ok: false, error: String(e), op: "unfocus" };
    }
  }

  /**
   * Close via Meta.Window.delete (same as tab close). Never Meta.Window.kill.
   * force: skip can_close veto when present; still only delete(), not kill.
   *
   * @param {string} selector
   * @param {{ force?: boolean }} [opts]
   * @returns {object}
   */
  _closeOp(selector, opts = {}) {
    const force = !!opts.force;
    const resolved = this._resolveWindow(selector);
    // Residual close: already-gone is success (map thrash / prior close).
    if (!resolved.ok) {
      return { ok: true, closed: false, alreadyGone: true, selector: String(selector || "") };
    }

    const node = resolved.match.node;
    const meta = node?.nodeValue;
    if (!meta) {
      return { ok: true, closed: false, alreadyGone: true, selector: String(selector || "") };
    }

    if (!force && typeof meta.can_close === "function") {
      try {
        if (!meta.can_close()) {
          return {
            error: "window refuses close (can_close=false); try force or park",
            candidate: candidatePublic(resolved.match),
          };
        }
      } catch (_e) {
        /* ignore can_close probe failures */
      }
    }

    // Roundtrip timestamp: get_current_time() is CurrentTime(0) outside event
    // context (DBus/Shell.Eval) and can break delete() (forge-191a).
    let now = 0;
    try {
      if (typeof global !== "undefined" && global.display?.get_current_time_roundtrip) {
        now = global.display.get_current_time_roundtrip();
      } else if (typeof global !== "undefined" && global.get_current_time) {
        now = global.get_current_time();
      }
    } catch (_e) {
      now = 0;
    }

    if (typeof meta.delete !== "function") {
      return { error: "window has no delete()" };
    }

    try {
      meta.delete(now);
    } catch (e) {
      return { error: `delete failed: ${e.message || e}` };
    }

    return {
      ok: true,
      closed: true,
      force,
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * @param {string} selector
   * @param {{ keyboard?: boolean, pin?: boolean }} [opts]
   *   keyboard (default true): Meta.activate + full afterFocus (LFT/pointer).
   *   keyboard false: open-leaf only (no key steal).
   *   pin (default true): pin open leaf for residual steal (D018).
   * @returns {object}
   */
  _focusOp(selector, opts = {}) {
    const keyboard = opts.keyboard !== false;
    const pin = opts.pin !== false;
    const resolved = this._resolveWindow(selector);
    if (!resolved.ok) return resolved;

    const node = resolved.match.node;
    const meta = node?.nodeValue;
    if (!meta) {
      return { error: "not found", candidates: [] };
    }

    const wm = this._wm();
    try {
      if (typeof wm?.revealGroupChild === "function") {
        wm.revealGroupChild(node, { keyboard, pin, source: "dbus-focus" });
      } else {
        return { error: "revealGroupChild not available" };
      }
    } catch (e) {
      return { error: `activate failed: ${e.message || e}` };
    }

    return {
      ok: true,
      candidate: candidatePublic(resolved.match),
      keyboard,
    };
  }

  /**
   * @param {string} selectorA
   * @param {string} selectorB
   * @param {{ quiet?: boolean }} [opts]
   */
  _swapOp(selectorA, selectorB, opts = {}) {
    const quiet = !!opts.quiet;
    const a = this._resolveWindow(selectorA);
    if (!a.ok) return { ...a, which: "a" };
    const b = this._resolveWindow(selectorB);
    if (!b.ok) return { ...b, which: "b" };

    if (a.match.node === b.match.node) {
      return { error: "same window" };
    }

    const tree = this._wm()?.tree;
    const wm = this._wm();
    if (!tree?.swapPairs) {
      return { error: "Tree not available" };
    }

    if (!quiet) {
      try {
        wm?.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }

    tree.swapPairs(a.match.node, b.match.node);

    try {
      if (!quiet) {
        wm?.commitLayout?.("session-swap", { force: true });
        wm?.settleTabFocus?.(a.match.node);
      }
    } catch (e) {
      Logger.warn(`session-api Swap post: ${e}`);
    }

    return {
      ok: true,
      a: candidatePublic(a.match),
      b: candidatePublic(b.match),
    };
  }

  /**
   * Walk to MONITOR ancestor; return monitor index or -1.
   * @param {object} node
   * @returns {number}
   */
  _monitorIndexOfNode(node) {
    let n = node;
    while (n) {
      const ntype = n.nodeType;
      const isMon =
        ntype === NODE_TYPES.MONITOR ||
        ntype === "MONITOR" ||
        (typeof n.isMonitor === "function" && n.isMonitor());
      if (isMon) {
        const idx = Utils.monitorIndex(n.nodeValue);
        return Number.isFinite(idx) ? idx : -1;
      }
      n = n.parentNode;
    }
    return -1;
  }

  /**
   * @param {string} selector
   * @param {string} dest
   * @param {{ quiet?: boolean, position?: string|number }} [opts]
   */
  _moveOp(selector, dest, opts = {}) {
    const quiet = !!opts.quiet;
    const src = this._resolveWindow(selector);
    if (!src.ok) return { ...src, which: "tile" };

    const destRes = this._resolveDest(dest);
    if (!destRes.ok) return { ...destRes, which: "dest" };

    const sourceNode = src.match.node;
    const destNode = destRes.match.node;
    if (sourceNode === destNode) {
      return { error: "same node" };
    }

    const tree = this._wm()?.tree;
    const wm = this._wm();
    if (!tree) {
      return { error: "Tree not available" };
    }

    if (typeof sourceNode.contains === "function" && sourceNode.contains(destNode)) {
      return { error: "cannot move into own descendant" };
    }

    if (!quiet) {
      try {
        wm?.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }

    const priorParent = sourceNode.parentNode;
    const destType = destRes.match.nodeType;

    if (destType === "WINDOW") {
      const parent = destNode.parentNode;
      if (!parent) {
        return { error: "dest has no parent" };
      }
      const next = destNode.nextSibling ?? null;
      if (typeof parent.insertBefore === "function") {
        if (next) parent.insertBefore(sourceNode, next);
        else parent.appendChild(sourceNode);
      } else {
        return { error: "cannot reparent" };
      }
      try {
        if (priorParent && priorParent !== parent) {
          tree.resetSiblingPercent?.(priorParent);
          priorParent.resetLayoutSingleChild?.();
        }
        tree.resetSiblingPercent?.(parent);
      } catch (_e) {
        /* best-effort percents */
      }
    } else if (destType === "CON" || destType === "MONITOR") {
      if (typeof destNode.appendChild !== "function") {
        return { error: "dest cannot accept children" };
      }
      // position start/0 → first mon child (e.g. mon1.term left of comms)
      const pos = opts.position;
      const wantStart = pos === "start" || pos === "first" || pos === 0 || pos === "0";
      if (
        wantStart &&
        typeof destNode.insertBefore === "function" &&
        destNode.firstChild &&
        destNode.firstChild !== sourceNode
      ) {
        destNode.insertBefore(sourceNode, destNode.firstChild);
      } else {
        destNode.appendChild(sourceNode);
      }
      try {
        if (priorParent && priorParent !== destNode) {
          tree.resetSiblingPercent?.(priorParent);
          priorParent.resetLayoutSingleChild?.();
        }
        tree.resetSiblingPercent?.(destNode);
      } catch (_e) {
        /* best-effort */
      }
    } else {
      return { error: `unsupported dest nodeType: ${destType}` };
    }

    // Tree reparent alone leaves Meta on the old monitor (both Ghostties stuck
    // visually on mon0). Align Mutter before layout render.
    try {
      const metaWin = sourceNode.nodeValue;
      const destMon = this._monitorIndexOfNode(sourceNode);
      if (metaWin && destMon >= 0) {
        safeMoveToMonitor(metaWin, destMon, "session-move");
      }
    } catch (e) {
      Logger.debug?.(`session-api Move move_to_monitor: ${e}`);
    }

    if (!quiet) {
      try {
        wm?.commitLayout?.("session-move", { force: true });
        wm?.settleTabFocus?.(sourceNode);
      } catch (e) {
        Logger.warn(`session-api Move post: ${e}`);
      }
    }

    return {
      ok: true,
      tile: candidatePublic(src.match),
      dest: candidatePublic(destRes.match),
    };
  }

  /**
   * Walk window node up to the mon-direct ancestor (parent is MONITOR).
   * @param {object} node
   * @returns {object|null}
   */
  _monDirectAncestor(node) {
    let n = node;
    while (n?.parentNode) {
      const p = n.parentNode;
      const ptype = p.nodeType;
      const isMon =
        ptype === NODE_TYPES.MONITOR ||
        ptype === "MONITOR" ||
        (typeof p.isMonitor === "function" && p.isMonitor());
      if (isMon) return n;
      n = p;
    }
    return null;
  }

  /**
   * Set sibling percent + userSized for HSPLIT (width) / VSPLIT (height).
   * Same-parent leaves, or mon-direct ancestors under MONITOR (like order).
   *
   * @param {string[]} windowIds
   * @param {number[]} shares - positive weights (renormalized to sum 1)
   * @param {{ quiet?: boolean }} [opts]
   * @returns {object}
   */
  _sizeOp(windowIds, shares, opts = {}) {
    const quiet = !!opts.quiet;
    if (!Array.isArray(windowIds) || windowIds.length < 2) {
      return { error: "size requires ≥2 windowIds" };
    }
    if (!Array.isArray(shares) || shares.length !== windowIds.length) {
      return { error: "size requires shares[] matching windowIds length" };
    }
    const weights = [];
    for (const s of shares) {
      const f = Number(s);
      if (!Number.isFinite(f) || f <= 0) {
        return { error: "size shares must be positive numbers" };
      }
      weights.push(f);
    }
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) {
      return { error: "size shares must sum to a positive total" };
    }
    const fracs = weights.map((w) => w / total);

    const tree = this._wm()?.tree;
    const wm = this._wm();
    if (!tree) {
      return { error: "Tree not available" };
    }

    /** @type {object[]} */
    const winNodes = [];
    for (const raw of windowIds) {
      if (raw == null || String(raw).trim() === "") continue;
      let sel = String(raw).trim();
      if (!sel.includes(":") && /^\d+$/.test(sel)) {
        sel = `id:${sel}`;
      }
      const resolved = this._resolveWindow(sel);
      if (!resolved.ok) return { ...resolved, which: sel };
      winNodes.push(resolved.match.node);
    }

    if (winNodes.length !== fracs.length || winNodes.length < 2) {
      return { error: "size could not resolve all windowIds" };
    }

    // Prefer same parent (nested split leaves).
    const sharedParent = winNodes[0].parentNode;
    const sameParent = sharedParent && winNodes.every((n) => n.parentNode === sharedParent);
    /** @type {object[]} */
    let targets;
    /** @type {object|null} */
    let parent;
    let scope = "siblings";
    if (sameParent) {
      targets = winNodes;
      parent = sharedParent;
    } else {
      // Mon L/R: distinct mon-direct ancestors under MONITOR.
      /** @type {object[]} */
      const monDirects = [];
      const seen = new Set();
      for (const node of winNodes) {
        const monDirect = this._monDirectAncestor(node);
        if (!monDirect) {
          return { error: "no mon-direct ancestor for window" };
        }
        if (seen.has(monDirect)) {
          return { error: "duplicate mon-direct for size targets" };
        }
        seen.add(monDirect);
        monDirects.push(monDirect);
      }
      if (monDirects.length !== fracs.length) {
        return { error: "size mon-direct count mismatch" };
      }
      parent = monDirects[0].parentNode;
      if (!parent) {
        return { error: "mon-direct has no parent" };
      }
      for (const md of monDirects) {
        if (md.parentNode !== parent) {
          return { error: "size targets not under common parent" };
        }
      }
      targets = monDirects;
      scope = "mon";
    }

    for (let i = 0; i < targets.length; i++) {
      targets[i].percent = fracs[i];
      targets[i].userSized = true;
    }

    // Renormalize remaining siblings (unmentioned) so parent sum stays valid.
    try {
      const kids = parent.childNodes || [];
      let sum = 0;
      let anyUnset = false;
      for (const k of kids) {
        const p = k.percent || 0;
        if (p > 0) sum += p;
        else anyUnset = true;
      }
      if (sum > 0 && anyUnset) {
        // Leave percent=0 siblings as equal-magic; only scale mentioned if needed.
      } else if (sum > 0 && Math.abs(sum - 1) > 0.001) {
        const scale = 1 / sum;
        for (const k of kids) {
          if ((k.percent || 0) > 0) {
            k.percent = (k.percent || 0) * scale;
          }
        }
      }
    } catch (_e) {
      /* best-effort */
    }

    try {
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-size", { force: true });
        } else {
          wm?.renderTree?.("session-size", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api size post: ${e}`);
    }

    return {
      ok: true,
      sized: true,
      count: targets.length,
      scope,
      shares: fracs,
    };
  }

  /**
   * Reorder siblings by window representatives.
   * - Same parent (tab/stack bag): reorder those WINDOW nodes under the CON.
   * - Else: mon-direct ancestors under MONITOR (L/R panes; tabs collapse to one CON).
   * Unmentioned siblings stay after, stable. No swapPairs / layout demotion.
   *
   * @param {string[]} windowIds - id:N or raw ids, desired order
   * @param {{ quiet?: boolean }} [opts]
   * @returns {object}
   */
  _orderMonChildrenOp(windowIds, opts = {}) {
    const quiet = !!opts.quiet;
    if (!Array.isArray(windowIds) || windowIds.length < 2) {
      return { error: "order requires ≥2 windowIds" };
    }

    const tree = this._wm()?.tree;
    const wm = this._wm();
    if (!tree) {
      return { error: "Tree not available" };
    }

    /** @type {object[]} */
    const winNodes = [];
    for (const raw of windowIds) {
      if (raw == null || String(raw).trim() === "") continue;
      let sel = String(raw).trim();
      if (!sel.includes(":") && /^\d+$/.test(sel)) {
        sel = `id:${sel}`;
      }
      const resolved = this._resolveWindow(sel);
      if (!resolved.ok) return { ...resolved, which: sel };
      winNodes.push(resolved.match.node);
    }

    if (winNodes.length < 2) {
      return { ok: true, reordered: false, reason: "fewer than 2 windows" };
    }

    // Tab/stack role order: all windows share one CON parent → reorder leaves.
    const sharedParent = winNodes[0].parentNode;
    const sameParent = sharedParent && winNodes.every((n) => n.parentNode === sharedParent);
    if (sameParent) {
      return this._reorderParentChildren(sharedParent, winNodes, {
        quiet,
        tree,
        wm,
        count: winNodes.length,
        scope: "siblings",
      });
    }

    // Mon L/R: distinct mon-direct ancestors (WINDOW or CON) under MONITOR.
    /** @type {object[]} */
    let monDirects = [];
    const seen = new Set();
    for (const node of winNodes) {
      const monDirect = this._monDirectAncestor(node);
      if (!monDirect) {
        return { error: "no mon-direct ancestor for window" };
      }
      if (seen.has(monDirect)) continue;
      seen.add(monDirect);
      monDirects.push(monDirect);
    }

    // Nested mon wrapper: tab|ghostty collapsed under one mon-direct H/V CON.
    // Hoist those panes to MONITOR so L/R order can stick.
    if (monDirects.length < 2) {
      const hoisted = this._hoistNestedMonPanes(winNodes, tree);
      if (hoisted?.ok && Array.isArray(hoisted.monDirects) && hoisted.monDirects.length >= 2) {
        monDirects = hoisted.monDirects;
      } else {
        return { ok: true, reordered: false, reason: "fewer than 2 distinct mon children" };
      }
    }

    // Promote mon-direct single-child H/V (D032 leftover around a lone term).
    {
      const monParent = monDirects[0]?.parentNode;
      if (monParent) {
        const unwrapped = [];
        const seenU = new Set();
        for (const md of monDirects) {
          const u = this._unwrapSingleChildSplit(md, monParent, tree) || md;
          if (seenU.has(u)) continue;
          seenU.add(u);
          unwrapped.push(u);
        }
        monDirects = unwrapped;
      }
    }

    const parent = monDirects[0].parentNode;
    if (!parent) {
      return { error: "mon-direct has no parent" };
    }
    const ptype = parent.nodeType;
    const isMon =
      ptype === NODE_TYPES.MONITOR ||
      ptype === "MONITOR" ||
      (typeof parent.isMonitor === "function" && parent.isMonitor());
    if (!isMon) {
      return { error: "parent is not MONITOR" };
    }
    for (const md of monDirects) {
      if (md.parentNode !== parent) {
        // Soft skip: residual follow-up may order before move finishes
        // co-locating mon kids — do not hard-stop the whole chunk.
        return {
          ok: true,
          reordered: false,
          reason: "mon-directs not under same MONITOR",
        };
      }
    }

    return this._reorderParentChildren(parent, monDirects, {
      quiet,
      tree,
      wm,
      count: monDirects.length,
      scope: "mon",
    });
  }

  /**
   * When profile mon children collapse under one mon-direct H/V CON, promote
   * that CON's panes (TABBED bag, term leaf/wrapper) onto the MONITOR.
   * Unwraps single-child H/V CONs so mon-direct is the real pane.
   *
   * @param {object[]} winNodes
   * @param {object} [tree]
   * @returns {{ ok: true, monDirects: object[], parent: object } | { ok: false }}
   */
  _hoistNestedMonPanes(winNodes, tree) {
    if (!Array.isArray(winNodes) || winNodes.length < 2) {
      return { ok: false };
    }
    /** @type {object|null} */
    let wrapper = null;
    for (const node of winNodes) {
      const md = this._monDirectAncestor(node);
      if (!md) return { ok: false };
      if (wrapper == null) wrapper = md;
      else if (wrapper !== md) return { ok: false };
    }
    if (!wrapper) return { ok: false };

    const mon = wrapper.parentNode;
    if (!mon) return { ok: false };
    const monType = mon.nodeType;
    const isMon =
      monType === NODE_TYPES.MONITOR ||
      monType === "MONITOR" ||
      (typeof mon.isMonitor === "function" && mon.isMonitor());
    if (!isMon) return { ok: false };

    const wLay = String(wrapper.layout || "").toUpperCase();
    const isHv =
      wLay === LAYOUT_TYPES.HSPLIT ||
      wLay === LAYOUT_TYPES.VSPLIT ||
      wLay === "HSPLIT" ||
      wLay === "VSPLIT" ||
      (typeof wrapper.isHSplit === "function" && wrapper.isHSplit()) ||
      (typeof wrapper.isVSplit === "function" && wrapper.isVSplit());
    // Only hoist multi-pane H/V wrappers (not a lone TABBED mon bag).
    if (!isHv || (wrapper.childNodes || []).length < 2) {
      return { ok: false };
    }

    // Pane under wrapper that contains each window (order follows winNodes).
    /** @type {object[]} */
    const panes = [];
    const seenPane = new Set();
    for (const node of winNodes) {
      let cur = node;
      let pane = null;
      while (cur && cur !== wrapper) {
        if (cur.parentNode === wrapper) {
          pane = cur;
          break;
        }
        cur = cur.parentNode;
      }
      if (!pane) return { ok: false };
      if (seenPane.has(pane)) continue;
      seenPane.add(pane);
      panes.push(pane);
    }
    if (panes.length < 2) return { ok: false };

    // Promote wrapper children onto MONITOR at wrapper's index.
    const kids = [...(mon.childNodes || [])];
    const wIdx = kids.indexOf(wrapper);
    if (wIdx < 0) return { ok: false };
    const wrapperKids = [...(wrapper.childNodes || [])];
    const nextKids = [];
    for (let i = 0; i < kids.length; i++) {
      if (i === wIdx) nextKids.push(...wrapperKids);
      else nextKids.push(kids[i]);
    }
    mon.replaceChildren(nextKids);
    try {
      tree?.resetSiblingPercent?.(mon);
    } catch (_e) {
      /* best-effort */
    }

    // Unwrap single-child H/V CONs so mon-direct is the real pane (ghostty leaf).
    /** @type {object[]} */
    const promoted = [];
    for (const pane of panes) {
      promoted.push(this._unwrapSingleChildSplit(pane, mon, tree) || pane);
    }

    return { ok: true, monDirects: promoted, parent: mon };
  }

  /**
   * After ApplyLayout structure: mon-direct 1-child H/V (lone VSPLIT around
   * ghostty from D032 thrash) → promote the leaf so mon children match profile.
   * Skips while open batch or bind-pending still owns the tree.
   * @returns {{ ok: true, unwrapped: number }}
   */
  _unwrapMonDirectSingleChildSplits() {
    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree) return { ok: true, unwrapped: 0 };
    // Mid open-batch D032 may temporarily hold a 1-child wrap for the next map.
    if (wm.openLayoutBatchActive) {
      return { ok: true, unwrapped: 0, skipped: "open-batch" };
    }
    const mons = tree.getNodeByType?.(NODE_TYPES.MONITOR) || [];
    let unwrapped = 0;
    for (const mon of mons) {
      if (!mon) continue;
      const kids = [...(mon.childNodes || [])];
      for (const kid of kids) {
        if (!kid) continue;
        const before = kid;
        const after = this._unwrapSingleChildSplit(kid, mon, tree);
        if (after && after !== before) unwrapped += 1;
      }
    }
    if (unwrapped > 0) {
      try {
        wm.renderTree?.("apply-unwrap-mon-degenerate");
      } catch (_e) {
        /* optional */
      }
    }
    return { ok: true, unwrapped };
  }

  /**
   * Replace a mon-direct single-child H/V CON with its child (in place).
   * @param {object} node
   * @param {object} mon
   * @param {object} [tree]
   * @returns {object} mon-direct node after unwrap
   */
  _unwrapSingleChildSplit(node, mon, tree) {
    let cur = node;
    for (let guard = 0; guard < 8 && cur; guard++) {
      const kids = cur.childNodes || [];
      const lay = String(cur.layout || "").toUpperCase();
      const isCon =
        cur.nodeType === NODE_TYPES.CON ||
        cur.nodeType === "CON" ||
        (typeof cur.isWindow === "function" ? !cur.isWindow() : cur.nodeType !== "WINDOW");
      const isHv =
        lay === LAYOUT_TYPES.HSPLIT ||
        lay === LAYOUT_TYPES.VSPLIT ||
        lay === "HSPLIT" ||
        lay === "VSPLIT";
      if (!isCon || !isHv || kids.length !== 1) break;
      const only = kids[0];
      if (!only || !mon?.insertBefore || !mon.removeChild) break;
      if (mon.childNodes.indexOf(cur) < 0) break;
      mon.insertBefore(only, cur);
      mon.removeChild(cur);
      cur = only;
    }
    try {
      tree?.resetSiblingPercent?.(mon);
    } catch (_e) {
      /* best-effort */
    }
    return cur;
  }

  /**
   * Place `orderedNodes` first under parent (stable append for unmentioned kids).
   * @param {object} parent
   * @param {object[]} orderedNodes
   * @param {{ quiet?: boolean, tree?: object, wm?: object, count?: number, scope?: string }} ctx
   */
  _reorderParentChildren(parent, orderedNodes, ctx = {}) {
    const quiet = !!ctx.quiet;
    const kids = [...(parent.childNodes || [])];
    const ordered = [];
    const placed = new Set();
    for (const n of orderedNodes) {
      ordered.push(n);
      placed.add(n);
    }
    for (const k of kids) {
      if (!placed.has(k)) ordered.push(k);
    }

    let same = kids.length === ordered.length;
    if (same) {
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] !== ordered[i]) {
          same = false;
          break;
        }
      }
    }
    if (same) {
      return {
        ok: true,
        reordered: false,
        count: ctx.count ?? orderedNodes.length,
        scope: ctx.scope,
      };
    }

    if (typeof parent.replaceChildren !== "function") {
      return { error: "parent cannot replace children" };
    }
    parent.replaceChildren(ordered);

    const tree = ctx.tree;
    const wm = ctx.wm;
    try {
      tree?.resetSiblingPercent?.(parent);
    } catch (_e) {
      /* best-effort */
    }

    try {
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-order", { force: true });
        } else {
          wm?.renderTree?.("session-order", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api order post: ${e}`);
    }

    return {
      ok: true,
      reordered: true,
      count: ctx.count ?? orderedNodes.length,
      scope: ctx.scope,
    };
  }

  /**
   * Set parent container layout (absolute mode, not toggle).
   * @param {string} mode - TABBED|STACKED|HSPLIT|VSPLIT
   * @param {string} [selector] - window selector; default focus
   * @param {{ quiet?: boolean }} [opts]
   */
  _layoutOp(mode, selector, opts = {}) {
    const quiet = !!opts.quiet;
    const sel = selector != null && String(selector).trim() !== "" ? String(selector) : "focus";
    const resolved = this._resolveWindow(sel);
    if (!resolved.ok) return resolved;

    const focusNode = resolved.match.node;
    if (!focusNode?.parentNode) {
      return { error: "window has no parent container" };
    }

    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree) {
      return { error: "Tree not available" };
    }

    const settings = this._ext?.settings;
    if (mode === LAYOUT_TYPES.STACKED || mode === "STACKED") {
      if (settings && !settings.get_boolean("stacked-tiling-mode-enabled")) {
        return { error: "stacked-tiling-mode-enabled is false" };
      }
    }
    if (mode === LAYOUT_TYPES.TABBED || mode === "TABBED") {
      if (settings && !settings.get_boolean("tabbed-tiling-mode-enabled")) {
        return { error: "tabbed-tiling-mode-enabled is false" };
      }
    }

    const layoutValue =
      mode === "TABBED" || mode === LAYOUT_TYPES.TABBED
        ? LAYOUT_TYPES.TABBED
        : mode === "STACKED" || mode === LAYOUT_TYPES.STACKED
        ? LAYOUT_TYPES.STACKED
        : mode === "HSPLIT" || mode === LAYOUT_TYPES.HSPLIT
        ? LAYOUT_TYPES.HSPLIT
        : mode === "VSPLIT" || mode === LAYOUT_TYPES.VSPLIT
        ? LAYOUT_TYPES.VSPLIT
        : null;

    if (!layoutValue) {
      return { error: `unsupported layout mode: ${mode}` };
    }

    const isTabOrStack =
      layoutValue === LAYOUT_TYPES.TABBED || layoutValue === LAYOUT_TYPES.STACKED;

    // Tab/stack on mon-direct (or multi-window H/V bag) must wrap the focus leaf
    // into its own CON first. Setting MONITOR/parent HSPLIT to TABBED bags every
    // sibling (incl. ghostty). split() replaces the WINDOW node — re-find live.
    let liveNode = focusNode;
    let parent = liveNode.parentNode;
    if (isTabOrStack && parent) {
      const isMon =
        (typeof parent.isMonitor === "function" && parent.isMonitor()) ||
        parent.nodeType === NODE_TYPES.MONITOR ||
        parent.nodeType === "MONITOR";
      const isHvCon =
        parent.nodeType === NODE_TYPES.CON &&
        (parent.isHSplit?.() ||
          parent.isVSplit?.() ||
          parent.layout === LAYOUT_TYPES.HSPLIT ||
          parent.layout === LAYOUT_TYPES.VSPLIT);
      let windowKids = 0;
      if (isHvCon && Array.isArray(parent.childNodes)) {
        for (const c of parent.childNodes) {
          if (c?.nodeType === NODE_TYPES.WINDOW || c?.isWindow?.()) windowKids += 1;
        }
      }
      // MONITOR always wrap; H/V CON wrap when ≥2 window leaves so subset ensure
      // (chrome+Grok next to ghostty) does not tab the whole mon bag.
      const needWrap = isMon || (isHvCon && windowKids > 1);
      if (needWrap) {
        try {
          tree.split?.(liveNode, ORIENTATION_TYPES.HORIZONTAL, true);
        } catch (e) {
          return { error: `split before layout failed: ${e.message || e}` };
        }
        // split() leaves a stale node; live WINDOW is a fresh child of the new CON.
        const meta = liveNode.nodeValue;
        liveNode = (meta != null && tree.findNode?.(meta)) || liveNode;
        parent = liveNode.parentNode;
        if (
          !parent ||
          (typeof parent.isMonitor === "function" && parent.isMonitor()) ||
          parent.nodeType === NODE_TYPES.MONITOR ||
          parent.nodeType === "MONITOR"
        ) {
          return { error: "split before layout failed: still on monitor" };
        }
      }
    }

    // Profile/ensure path (REG-ensure-flatten): peel nested CONs so the bag is
    // window leaves. Not I1 — explicit reshape for layout apply. User toggles
    // and layout-cycle use setLayout only (no flatten).
    if (isTabOrStack) {
      this._flattenLayoutParentToWindows(parent);
    }

    const prev = parent.layout;
    const layoutOpts = {};
    if (prev === LAYOUT_TYPES.TABBED && layoutValue !== LAYOUT_TYPES.TABBED) {
      layoutOpts.lastTabFocus = null;
    }
    if (isTabOrStack) {
      // Preserve open leaf when re-affirming TABBED/STACKED (ensure_layout
      // selector is often first windowId = chrome while profile active differs).
      // Generic: only set lastTabFocus from selector when missing or not a child.
      const prevFocus =
        layoutOpts.lastTabFocus !== undefined ? layoutOpts.lastTabFocus : parent.lastTabFocus;
      let focusStillChild = false;
      if (prevFocus != null && Array.isArray(parent.childNodes)) {
        for (const c of parent.childNodes) {
          if (c && c.nodeValue === prevFocus) {
            focusStillChild = true;
            break;
          }
        }
      }
      if (!focusStillChild) {
        layoutOpts.lastTabFocus = liveNode.nodeValue ?? parent.lastTabFocus;
      }
    }
    if (layoutValue === LAYOUT_TYPES.HSPLIT || layoutValue === LAYOUT_TYPES.VSPLIT) {
      layoutOpts.resetPercents = true;
    }
    tree.setLayout(parent, layoutValue, layoutOpts);

    try {
      tree.attachNode = parent;
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-layout", { force: true });
        } else {
          wm?.renderTree?.("session-layout", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api layout post: ${e}`);
    }

    return {
      ok: true,
      mode: layoutValue,
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * Interactive layout cycles (parity with keybinds).
   * axis "group": TABBED ↔ STACKED only (no-op on split).
   * axis "split": HSPLIT ↔ VSPLIT only (no-op on group for now).
   * @param {string} axis - group|split
   * @param {string} [selector]
   * @param {{ quiet?: boolean }} [opts]
   */
  _layoutCycleOp(axis, selector, opts = {}) {
    const quiet = !!opts.quiet;
    const ax = String(axis || "group").toLowerCase();
    const sel = selector != null && String(selector).trim() !== "" ? String(selector) : "focus";
    const resolved = this._resolveWindow(sel);
    if (!resolved.ok) return resolved;

    const focusNode = resolved.match.node;
    const parent = focusNode?.parentNode;
    if (!parent) {
      return { error: "window has no parent container" };
    }

    const settings = this._ext?.settings;
    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree) {
      return { error: "Tree not available" };
    }

    const prev = parent.layout;
    let next = null;
    const layoutOpts = {};

    if (ax === "group") {
      const stackOn = !settings || settings.get_boolean("stacked-tiling-mode-enabled");
      const tabOn = !settings || settings.get_boolean("tabbed-tiling-mode-enabled");
      if (prev === LAYOUT_TYPES.STACKED) {
        if (!tabOn) return { error: "tabbed-tiling-mode-enabled is false" };
        next = LAYOUT_TYPES.TABBED;
        layoutOpts.lastTabFocus = focusNode.nodeValue ?? parent.lastTabFocus;
      } else if (prev === LAYOUT_TYPES.TABBED) {
        if (!stackOn) return { error: "stacked-tiling-mode-enabled is false" };
        next = LAYOUT_TYPES.STACKED;
        layoutOpts.lastTabFocus = null;
      } else {
        return {
          ok: true,
          changed: false,
          mode: prev,
          reason: "not a group container",
          candidate: candidatePublic(resolved.match),
        };
      }
    } else if (ax === "split") {
      if (prev === LAYOUT_TYPES.HSPLIT) {
        next = LAYOUT_TYPES.VSPLIT;
      } else if (prev === LAYOUT_TYPES.VSPLIT) {
        next = LAYOUT_TYPES.HSPLIT;
      } else {
        return {
          ok: true,
          changed: false,
          mode: prev,
          reason: "not a split container",
          candidate: candidatePublic(resolved.match),
        };
      }
      // H↔V percent reset allowed (documented); no flatten.
      layoutOpts.resetPercents = true;
    } else {
      return { error: `unsupported layout-cycle axis: ${axis}` };
    }

    tree.setLayout(parent, next, layoutOpts);
    try {
      tree.attachNode = parent;
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-layout-cycle", { force: true });
        } else {
          wm?.renderTree?.("session-layout-cycle", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api layout-cycle post: ${e}`);
    }

    return {
      ok: true,
      changed: true,
      mode: next,
      prev,
      axis: ax,
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * Merge focus (or selector) with last-active / sibling into a tabbed group.
   * @param {string} [selector]
   * @param {string} [withSel] - optional partner selector; default last-active
   * @param {{ quiet?: boolean }} [opts]
   */
  _mergeGroupOp(selector, withSel, opts = {}) {
    const quiet = !!opts.quiet;
    const sel = selector != null && String(selector).trim() !== "" ? String(selector) : "focus";
    const resolved = this._resolveWindow(sel);
    if (!resolved.ok) return resolved;

    const focusNode = resolved.match.node;
    if (!focusNode || (typeof focusNode.isFloat === "function" && focusNode.isFloat())) {
      return { error: "focus is not a tileable window" };
    }

    const settings = this._ext?.settings;
    if (settings && !settings.get_boolean("tabbed-tiling-mode-enabled")) {
      return { error: "tabbed-tiling-mode-enabled is false" };
    }

    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree?.mergeWindowsIntoGroup) {
      return { error: "Tree merge not available" };
    }

    let partner = null;
    if (withSel != null && String(withSel).trim() !== "") {
      const other = this._resolveWindow(String(withSel));
      if (!other.ok) return other;
      partner = other.match.node;
    } else {
      try {
        const lastActive = global.display.get_tab_next(
          Meta.TabList.NORMAL,
          global.display.get_workspace_manager().get_active_workspace(),
          focusNode.nodeValue,
          false
        );
        if (lastActive && lastActive !== focusNode.nodeValue) {
          partner = tree.findNode?.(lastActive) || null;
        }
      } catch (_e) {
        partner = null;
      }
      if (
        !partner ||
        partner === focusNode ||
        partner.nodeType !== NODE_TYPES.WINDOW ||
        (typeof partner.isFloat === "function" && partner.isFloat())
      ) {
        const parent = focusNode.parentNode;
        const siblings = tree
          .getTiledChildren?.(parent?.childNodes || [])
          ?.filter((n) => n.nodeType === NODE_TYPES.WINDOW && n !== focusNode);
        partner = siblings?.[0] || null;
      }
    }

    if (!partner || partner === focusNode) {
      return { error: "no merge partner" };
    }

    const group = tree.mergeWindowsIntoGroup(focusNode, partner, LAYOUT_TYPES.TABBED);
    if (!group) {
      return { error: "merge failed" };
    }

    try {
      tree.attachNode = group;
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-merge-group", { force: true });
        } else {
          wm?.renderTree?.("session-merge-group", true);
        }
        wm?.revealGroupChild?.(focusNode);
      }
    } catch (e) {
      Logger.warn(`session-api merge-group post: ${e}`);
    }

    return {
      ok: true,
      mode: LAYOUT_TYPES.TABBED,
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * Synthetic grab-tile drop (R012 / R015 / live matrix).
   * Window→window: optional entered-monitor mid GRAB_TILE (R012).
   * Empty mon: `destMonitor` without `onto` (R015).
   * @param {string} tileSel
   * @param {string} [ontoSel]
   * @param {string} [zone]
   * @param {{ quiet?: boolean, simulateEnteredMonitor?: boolean, destMonitor?: number|null }} [opts]
   */
  _dndDropOp(tileSel, ontoSel, zone, opts = {}) {
    const quiet = !!opts.quiet;
    const simulateEntered = opts.simulateEnteredMonitor !== false;
    const destMonOpt =
      typeof opts.destMonitor === "number" && !Number.isNaN(opts.destMonitor)
        ? opts.destMonitor
        : null;
    const tileResolved = this._resolveWindow(
      tileSel != null && String(tileSel).trim() !== "" ? String(tileSel) : "focus"
    );
    if (!tileResolved.ok) return tileResolved;

    const focusNode = tileResolved.match.node;
    if (!focusNode?.nodeValue) {
      return { error: "dnd-drop: missing window nodes" };
    }
    if (typeof focusNode.isFloat === "function" && focusNode.isFloat()) {
      return { error: "dnd-drop: tile is float" };
    }

    const ontoSelStr = ontoSel != null ? String(ontoSel).trim() : "";
    // R015: empty-mon / gap drop — no onto window, only dest monitor.
    if (!ontoSelStr && destMonOpt != null && destMonOpt >= 0) {
      return this._dndEmptyMonDropOp(focusNode, tileResolved, destMonOpt, {
        quiet,
        simulateEnteredMonitor: simulateEntered,
      });
    }

    const ontoResolved = this._resolveWindow(ontoSelStr);
    if (!ontoResolved.ok) return ontoResolved;

    const ontoNode = ontoResolved.match.node;
    if (!ontoNode?.nodeValue) {
      return { error: "dnd-drop: missing window nodes" };
    }
    if (focusNode === ontoNode) {
      return { error: "dnd-drop: tile and onto are the same window" };
    }
    if (typeof ontoNode.isFloat === "function" && ontoNode.isFloat()) {
      return { error: "dnd-drop: onto is float" };
    }

    const zoneRaw = zone != null && String(zone).trim() !== "" ? String(zone).trim() : "CENTER";
    const zoneKey = zoneRaw.toUpperCase();
    const validZones = new Set(["LEFT", "RIGHT", "TOP", "BOTTOM", "CENTER"]);
    if (!validZones.has(zoneKey)) {
      return { error: `dnd-drop: unknown zone ${zoneRaw}` };
    }

    const wm = this._wm();
    if (!wm?._buildDropOperation || !wm?._executeDropOperation) {
      return { error: "dnd-drop: drag-drop not available" };
    }

    const parentBefore = focusNode.parentNode;
    const prevMode = focusNode.mode;
    const prevDragged = wm._draggedNodeWindow;
    focusNode.mode = WINDOW_MODES.GRAB_TILE;
    wm._draggedNodeWindow = focusNode;

    let enteredSkipped = false;
    if (simulateEntered) {
      try {
        const ontoMeta = ontoNode.nodeValue;
        const destMon =
          typeof ontoMeta.get_monitor === "function" ? ontoMeta.get_monitor() : ontoMeta.monitor;
        if (typeof destMon === "number" && destMon >= 0) {
          const tileMeta = focusNode.nodeValue;
          // Align Meta mon report with dest so update path would rehome if not gated.
          try {
            if (typeof tileMeta.get_monitor === "function") {
              // Prefer real move only when not already there — live path.
              const cur = typeof tileMeta.get_monitor === "function" ? tileMeta.get_monitor() : -1;
              if (cur !== destMon && typeof tileMeta.move_to_monitor === "function") {
                // Do not Meta-move: drop owns placement. Only fire the signal.
              }
            }
          } catch (_e) {
            /* */
          }
          if (typeof wm._onWindowEnteredMonitor === "function") {
            wm._onWindowEnteredMonitor(global.display, destMon, focusNode.nodeValue);
          } else if (typeof wm.updateMetaWorkspaceMonitor === "function") {
            wm.updateMetaWorkspaceMonitor(
              "dnd-drop-simulate-entered",
              destMon,
              focusNode.nodeValue
            );
          }
          // R012: still under source parent after entered-monitor while GRAB_TILE.
          enteredSkipped = focusNode.parentNode === parentBefore;
        }
      } catch (e) {
        Logger.warn(`session-api dnd-drop entered-monitor: ${e}`);
      }
    }

    try {
      // Match live DnD: tree slot over Meta frame (inactive tab / lagging CSD).
      const targetRect = dropTargetHitRect(ontoNode, ontoNode.nodeValue, true) ||
        (typeof ontoNode.nodeValue?.get_frame_rect === "function"
          ? ontoNode.nodeValue.get_frame_rect()
          : null) ||
        ontoNode.rect || { x: 0, y: 0, width: 100, height: 100 };
      const dropZones = buildDropZones(targetRect);
      const parentNodeTarget = ontoNode.parentNode;
      if (!parentNodeTarget) {
        return { error: "dnd-drop: onto has no parent" };
      }
      const ctx = {
        nodeWinAtPointer: ontoNode,
        parentNodeTarget,
        horizontal: !!(parentNodeTarget.isHSplit?.() || parentNodeTarget.isTabbed?.()),
        isMonParent: parentNodeTarget.nodeType === NODE_TYPES.MONITOR,
        isConParent: parentNodeTarget.nodeType === NODE_TYPES.CON,
        stacked: !!parentNodeTarget.isStacked?.(),
        stackedOrTabbed: !!(parentNodeTarget.isStacked?.() || parentNodeTarget.isTabbed?.()),
        centerLayout: wm._resolveDndCenterLayout?.() || "TABBED",
        dropZones,
        targetRect,
      };
      const operation = wm._buildDropOperation(zoneKey, ctx);
      if (!operation) {
        return { error: `dnd-drop: no operation for zone ${zoneKey}` };
      }
      if (dropChangesStructure(focusNode, ontoNode, operation, ctx)) {
        wm._executeDropOperation(focusNode, operation, ontoNode, ctx);
      }
    } catch (e) {
      Logger.warn(`session-api dnd-drop execute: ${e}`);
      focusNode.mode = prevMode || WINDOW_MODES.TILE;
      wm._draggedNodeWindow = prevDragged || null;
      return { error: `dnd-drop failed: ${e}` };
    }

    focusNode.mode = WINDOW_MODES.TILE;
    wm._draggedNodeWindow = prevDragged || null;
    wm.nodeWinAtPointer = null;

    try {
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-dnd-drop", { force: true });
        } else {
          wm?.renderTree?.("session-dnd-drop", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api dnd-drop post: ${e}`);
    }

    return {
      ok: true,
      zone: zoneKey,
      enteredMonitorSkippedRehome: enteredSkipped,
      parentLayout: focusNode.parentNode?.layout || null,
      sameParentAsOnto: focusNode.parentNode === ontoNode.parentNode,
      candidate: candidatePublic(tileResolved.match),
    };
  }

  /**
   * R015 synthetic: empty-mon grab-tile drop (no window under pointer).
   * Fires entered-monitor while GRAB_TILE (must not rehome mid-drag), then
   * commits empty-mon rehome via DragDropManager.
   * @param {Object} focusNode
   * @param {{ match: any }} tileResolved
   * @param {number} destMon
   * @param {{ quiet?: boolean, simulateEnteredMonitor?: boolean }} [opts]
   */
  _dndEmptyMonDropOp(focusNode, tileResolved, destMon, opts = {}) {
    const quiet = !!opts.quiet;
    const simulateEntered = opts.simulateEnteredMonitor !== false;
    const wm = this._wm();
    if (!wm?.dragDrop?._commitEmptyMonitorDrop && !wm?._commitEmptyMonitorDrop) {
      return { error: "dnd-drop: empty-mon path not available" };
    }

    const parentBefore = focusNode.parentNode;
    const prevMode = focusNode.mode;
    const prevDragged = wm._draggedNodeWindow;
    focusNode.mode = WINDOW_MODES.GRAB_TILE;
    wm._draggedNodeWindow = focusNode;
    wm.nodeWinAtPointer = null;

    let enteredSkipped = false;
    if (simulateEntered) {
      try {
        if (typeof wm._onWindowEnteredMonitor === "function") {
          wm._onWindowEnteredMonitor(global.display, destMon, focusNode.nodeValue);
        } else if (typeof wm.updateMetaWorkspaceMonitor === "function") {
          wm.updateMetaWorkspaceMonitor(
            "dnd-empty-mon-simulate-entered",
            destMon,
            focusNode.nodeValue
          );
        }
        enteredSkipped = focusNode.parentNode === parentBefore;
      } catch (e) {
        Logger.warn(`session-api dnd empty-mon entered-monitor: ${e}`);
      }
    }

    let rehomed = false;
    try {
      const commit =
        wm.dragDrop?._commitEmptyMonitorDrop?.bind(wm.dragDrop) ||
        wm._commitEmptyMonitorDrop?.bind(wm);
      rehomed = !!commit?.(focusNode, destMon);
    } catch (e) {
      Logger.warn(`session-api dnd empty-mon commit: ${e}`);
      focusNode.mode = prevMode || WINDOW_MODES.TILE;
      wm._draggedNodeWindow = prevDragged || null;
      return { error: `dnd-drop empty-mon failed: ${e}` };
    }

    focusNode.mode = WINDOW_MODES.TILE;
    wm._draggedNodeWindow = prevDragged || null;
    wm.nodeWinAtPointer = null;

    try {
      if (!quiet) {
        wm?.unfreezeRender?.();
        if (typeof wm?.commitLayout === "function") {
          wm.commitLayout("session-dnd-empty-mon", { force: true });
        } else {
          wm?.renderTree?.("session-dnd-empty-mon", true);
        }
      }
    } catch (e) {
      Logger.warn(`session-api dnd empty-mon post: ${e}`);
    }

    const monAfter =
      typeof wm._monitorIndexOfNode === "function" ? wm._monitorIndexOfNode(focusNode) : -1;

    return {
      ok: rehomed,
      emptyMon: true,
      destMonitor: destMon,
      rehomed,
      enteredMonitorSkippedRehome: enteredSkipped,
      monitorAfter: monAfter,
      candidate: candidatePublic(tileResolved.match),
      ...(rehomed ? {} : { error: "dnd-drop: empty-mon rehome did not apply" }),
    };
  }

  /**
   * Toggle float (window or class scope) via WindowManager.
   * @param {string} [selector]
   * @param {string} [scope] - window|class
   * @param {{ quiet?: boolean }} [opts]
   */
  _floatOp(selector, scope, opts = {}) {
    // RunSteps quiet: freeze so FloatToggle is M-only; residual RunSteps Cf is the one C.
    const sel = selector != null && String(selector).trim() !== "" ? String(selector) : "focus";
    const resolved = this._resolveWindow(sel);
    if (!resolved.ok) return resolved;

    const wm = this._wm();
    if (!wm?.command) {
      return { error: "WindowManager not available" };
    }

    const sc = String(scope || "window").toLowerCase();
    const name = sc === "class" ? "FloatClassToggle" : "FloatToggle";
    try {
      // Activate target so command context matches selector when not focus.
      const meta = resolved.match.node?.nodeValue;
      if (meta && typeof meta.activate === "function") {
        try {
          meta.activate(global.display.get_current_time?.() || 0);
        } catch (_e) {
          /* best-effort */
        }
      }
      wm.command({
        name,
        ...DEFAULT_FLOAT_LAYOUT,
      });
    } catch (e) {
      return { error: `float failed: ${e.message || e}` };
    }

    return {
      ok: true,
      scope: sc === "class" ? "class" : "window",
      candidate: candidatePublic(resolved.match),
    };
  }

  /**
   * Peel nested CON children until `parent` has only WINDOW leaves (DFS order).
   * Used when setting TABBED/STACKED so structure ensure is not a nested H/V bag.
   * @param {import('./tree.js').Node} parent
   */
  _flattenLayoutParentToWindows(parent) {
    if (!parent?.childNodes) return;
    const isCon = (n) =>
      (typeof n.isCon === "function" && n.isCon()) || n?.nodeType === NODE_TYPES.CON;

    let changed = true;
    while (changed) {
      changed = false;
      const kids = [...parent.childNodes];
      for (const child of kids) {
        if (!isCon(child)) continue;
        const grandkids = [...(child.childNodes || [])];
        // Drop dangling tab actors before decoration teardown on removeChild.
        if (typeof child.isStackedOrTabbed === "function" && child.isStackedOrTabbed()) {
          for (const gk of grandkids) {
            if (gk?.tab && typeof gk._resetTabForReparent === "function") {
              gk._resetTabForReparent();
            }
          }
        }
        for (const gk of grandkids) {
          if (typeof parent.insertBefore === "function") {
            parent.insertBefore(gk, child);
          } else if (typeof parent.appendChild === "function") {
            parent.appendChild(gk);
          }
        }
        try {
          parent.removeChild(child);
        } catch (_e) {
          /* already detached */
        }
        changed = true;
        break;
      }
    }
  }

  /**
   * @param {object} options
   */
  _placeNextOp(options) {
    const wm = this._wm();
    if (!wm?.placeNext) {
      return { error: "WindowManager not available" };
    }
    const result = wm.placeNext(options);
    if (!result?.ok) {
      return { error: result?.error || "PlaceNext failed" };
    }
    return {
      ok: true,
      expiresAt: result.hint?.expiresAt ?? null,
      wmClass: result.hint?.wmClass ?? null,
    };
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  _setOp(key, value) {
    const sync = this._configSync();
    if (!sync?.setPortable) {
      return { error: "ConfigSync not available" };
    }
    // Accept already-parsed JSON values from step objects, or text like CLI.
    let parsedValue = value;
    if (typeof value === "string") {
      const parsed = parseSettingValueText(value);
      if (!parsed.ok) {
        return { error: parsed.error };
      }
      parsedValue = parsed.value;
    }
    const result = sync.setPortable(key, parsedValue);
    if (!result.ok) {
      return { error: result.error };
    }
    return {
      ok: true,
      key: result.key,
      schema: result.schema,
      value: result.value,
      type: result.type,
    };
  }

  /**
   * CT1 cold skeleton: mon layout + tab/stack CONs + slot-tagged PH leaves.
   * Idempotent when mon already has matching layoutRole PHs.
   *
   * @param {object[]} mons
   * @param {{ workspace?: number, quiet?: boolean }} [opts]
   */
  _skeletonOp(mons, opts = {}) {
    const quiet = !!opts.quiet;
    if (!Array.isArray(mons) || mons.length === 0) {
      return { error: "skeleton requires mons[]" };
    }
    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree?.createPlaceholderLeaf) {
      return { error: "Tree not available" };
    }

    let workspace = opts.workspace;
    if (workspace == null || !Number.isFinite(Number(workspace))) {
      try {
        workspace = global.workspace_manager?.get_active_workspace_index?.() ?? 0;
      } catch (_e) {
        workspace = 0;
      }
    }
    workspace = Math.max(0, Math.floor(Number(workspace)));

    // Suppress entered-monitor rehome while building skeleton.
    wm._suppressRehome.enter();
    let skeletonOk = false;

    const created = [];
    try {
      for (const monSpec of mons) {
        if (!monSpec || typeof monSpec !== "object") continue;
        const monIdx =
          monSpec.mon != null
            ? Number(monSpec.mon)
            : monSpec.monitor != null
            ? Number(monSpec.monitor)
            : null;
        if (monIdx == null || !Number.isFinite(monIdx)) {
          return { error: "skeleton mon requires mon index" };
        }
        const monNode = this._monitorNodeFor(monIdx, workspace);
        if (!monNode) {
          return { error: `monitor mo${monIdx}ws${workspace} not found` };
        }

        // Idempotent: mon already has any layoutRole PH → skip rewrite.
        if (this._monHasLayoutSkeleton(monNode)) {
          continue;
        }

        const splitRaw = String(monSpec.split || "hsplit").toLowerCase();
        monNode.layout =
          splitRaw === "vsplit" || splitRaw === "v" ? LAYOUT_TYPES.VSPLIT : LAYOUT_TYPES.HSPLIT;

        // Clear existing empty mon children only (cold path: empty desk).
        const kids = [...(monNode.childNodes || [])];
        for (const k of kids) {
          if (isPlaceholderNode(k)) {
            tree.removeNode?.(k);
          } else if (
            k?.nodeType === NODE_TYPES.CON &&
            (k.childNodes || []).every((c) => isPlaceholderNode(c))
          ) {
            tree.removeNode?.(k);
          } else if (k?.nodeType === NODE_TYPES.CON && (k.childNodes || []).length === 0) {
            tree.removeNode?.(k);
          }
        }

        const children = monSpec.children || [];
        for (const ch of children) {
          const built = this._skeletonBuildChild(tree, monNode, ch);
          if (built?.error) return built;
          if (built?.created) created.push(...built.created);
        }

        if (typeof tree.resetSiblingPercent === "function") {
          tree.resetSiblingPercent(monNode);
        }
      }

      try {
        wm.renderTree?.(PLACEHOLDER_SKELETON_LAYOUT_REASON);
      } catch (_e) {
        // optional
      }

      skeletonOk = true;
      // Bind-pending suppresses entered-monitor rehome until bind wave / batch end.
      wm._layoutBindPending = true;
      return quiet ? { ok: true, created: created.length } : { ok: true, created };
    } finally {
      wm._suppressRehome.leave();
      // Failure paths must not leave sticky suppress (cleared on batch end too).
      if (!skeletonOk) {
        wm._layoutBindPending = false;
      }
    }
  }

  /**
   * @param {number} monIdx
   * @param {number} workspace
   */
  _monitorNodeFor(monIdx, workspace) {
    const tree = this._wm()?.tree;
    if (!tree) return null;
    const id = `mo${monIdx}ws${workspace}`;
    const byVal = tree.findNode?.(id);
    if (byVal) return byVal;
    const mons = tree.getNodeByType?.(NODE_TYPES.MONITOR) || [];
    for (const m of mons) {
      if (m?.nodeValue === id) return m;
      const idx = Utils.monitorIndex?.(m.nodeValue);
      if (idx === monIdx) {
        // Prefer matching workspace when id encodes it.
        const mid = typeof m.nodeValue === "string" ? m.nodeValue : "";
        if (!mid || mid.includes(`ws${workspace}`)) return m;
      }
    }
    return null;
  }

  /** @param {object} monNode */
  _monHasLayoutSkeleton(monNode) {
    const walk = (n) => {
      if (!n) return false;
      if (isPlaceholderNode(n) && (n.layoutRole || n.layoutSlot)) return true;
      for (const c of n.childNodes || []) {
        if (walk(c)) return true;
      }
      return false;
    };
    return walk(monNode);
  }

  /**
   * Build one mon-child unit (PH leaf, tab/stack CON, or nested split CON).
   * @param {object} tree
   * @param {object} parentNode
   * @param {object} spec
   */
  _skeletonBuildChild(tree, parentNode, spec) {
    if (!spec || typeof spec !== "object") return { created: [] };
    const created = [];
    const nested = spec.children;
    if (Array.isArray(nested) && nested.length > 0) {
      const con = this._newLayoutCon(tree, parentNode, spec.split || "hsplit");
      if (!con) return { error: "failed to create nested CON" };
      for (const sub of nested) {
        const r = this._skeletonBuildChild(tree, con, sub);
        if (r?.error) return r;
        if (r?.created) created.push(...r.created);
      }
      if (typeof tree.resetSiblingPercent === "function") {
        tree.resetSiblingPercent(con);
      }
      return { created };
    }

    const roles = Array.isArray(spec.roles) ? spec.roles.map(String) : [];
    const mode = spec.mode != null ? String(spec.mode).toLowerCase() : null;
    const slot = spec.slot != null ? String(spec.slot) : "";

    if (mode === "tabbed" || mode === "stacked" || roles.length > 1) {
      const layout = mode === "stacked" ? LAYOUT_TYPES.STACKED : LAYOUT_TYPES.TABBED;
      const con = this._newLayoutCon(tree, parentNode, layout);
      if (!con) return { error: "failed to create group CON" };
      const roleList = roles.length > 0 ? roles : ["_slot"];
      for (const role of roleList) {
        const ph = tree.createPlaceholderLeaf(con, {
          layoutSlot: slot,
          layoutRole: role,
          reason: PLACEHOLDER_SKELETON_LAYOUT_REASON,
        });
        if (ph) created.push({ slot, role, id: ph.nodeValue?.id });
      }
      if (typeof tree.resetSiblingPercent === "function") {
        tree.resetSiblingPercent(con);
      }
      return { created };
    }

    // Single-role mon-direct PH leaf.
    const role = roles[0] || "_slot";
    const ph = tree.createPlaceholderLeaf(parentNode, {
      layoutSlot: slot,
      layoutRole: role,
      reason: PLACEHOLDER_SKELETON_LAYOUT_REASON,
    });
    if (ph) created.push({ slot, role, id: ph.nodeValue?.id });
    return { created };
  }

  /**
   * @param {object} tree
   * @param {object} parentNode
   * @param {string} layoutOrSplit
   */
  _newLayoutCon(tree, parentNode, layoutOrSplit) {
    const raw = String(layoutOrSplit || "hsplit").toLowerCase();
    let layout = LAYOUT_TYPES.HSPLIT;
    if (raw === "vsplit" || raw === "v" || raw === LAYOUT_TYPES.VSPLIT) {
      layout = LAYOUT_TYPES.VSPLIT;
    } else if (raw === "tabbed" || raw === "tab" || raw === LAYOUT_TYPES.TABBED) {
      layout = LAYOUT_TYPES.TABBED;
    } else if (raw === "stacked" || raw === "stack" || raw === LAYOUT_TYPES.STACKED) {
      layout = LAYOUT_TYPES.STACKED;
    } else if (raw === LAYOUT_TYPES.HSPLIT || raw === "hsplit" || raw === "h") {
      layout = LAYOUT_TYPES.HSPLIT;
    }

    const parentKey = parentNode?.nodeValue ?? parentNode;
    let con = null;
    try {
      con = tree.createNode?.(parentKey, NODE_TYPES.CON, new St.Bin());
    } catch (_e) {
      con = null;
    }
    if (!con || con.nodeType !== NODE_TYPES.CON) return null;
    con.layout = layout;
    return con;
  }

  /**
   * CT1 bind: replace slot-tagged PH with real window (move onto PH, drop PH).
   *
   * @param {string} tile
   * @param {{
   *   layoutRole?: string,
   *   layoutSlot?: string,
   *   placeholder?: string,
   *   quiet?: boolean,
   * }} [opts]
   */
  _bindOp(tile, opts = {}) {
    const quiet = !!opts.quiet;
    const src = this._resolveWindow(tile);
    if (!src.ok) return { ...src, which: "tile" };

    const wm = this._wm();
    const tree = wm?.tree;
    if (!tree) return { error: "Tree not available" };

    const winNode = src.match.node;
    if (!winNode) return { error: "window node not found" };
    if (isPlaceholderNode(winNode)) {
      return { error: "cannot bind a placeholder as the source window" };
    }

    // Residual bind wave: suppress rehome for this op (batch may already have ended).
    wm._layoutBindPending = true;

    let phNode = null;
    if (opts.placeholder) {
      const phRes = this._resolveWindow(opts.placeholder);
      if (phRes.ok && isPlaceholderNode(phRes.match?.node)) {
        phNode = phRes.match.node;
      }
    }
    if (!phNode) {
      phNode = this._findLayoutPlaceholder(tree, {
        layoutRole: opts.layoutRole,
        layoutSlot: opts.layoutSlot,
      });
    }
    if (!phNode) {
      // Open/map may already have claimed the slot (no PH left). Soft-ok so
      // residual bind does not abort an otherwise successful apply.
      this._clearLayoutBindPendingIfIdle(wm, tree);
      return {
        ok: true,
        bound: false,
        skipped: "no-placeholder",
        layoutRole: opts.layoutRole,
        layoutSlot: opts.layoutSlot,
      };
    }

    const parent = phNode.parentNode;
    if (!parent) {
      this._clearLayoutBindPendingIfIdle(wm, tree);
      return { error: "placeholder has no parent" };
    }

    wm._suppressRehome.enter();
    try {
      // Insert real window before PH, then drop PH (preserves mon-child index).
      if (winNode.parentNode === parent) {
        parent.insertBefore?.(winNode, phNode);
      } else if (typeof parent.insertBefore === "function") {
        parent.insertBefore(winNode, phNode);
      } else {
        parent.appendChild?.(winNode);
      }

      // Meta mon if needed
      try {
        const destMon = this._monitorIndexOfNode(parent);
        const meta = winNode.nodeValue;
        if (destMon >= 0 && meta && typeof meta.get_monitor === "function") {
          if (meta.get_monitor() !== destMon) {
            safeMoveToMonitor(meta, destMon);
          }
        }
      } catch (e) {
        Logger.debug?.(`session-api bind move_to_monitor: ${e}`);
      }

      try {
        tree.removeNode?.(phNode);
      } catch (_e) {
        // ignore
      }

      if (typeof tree.resetSiblingPercent === "function") {
        tree.resetSiblingPercent(parent);
      }

      try {
        wm.renderTree?.(PLACEHOLDER_BIND_LAYOUT_REASON);
      } catch (_e) {
        // optional
      }

      return quiet
        ? { ok: true }
        : {
            ok: true,
            tile: candidatePublic(src.match),
            layoutReason: PLACEHOLDER_BIND_LAYOUT_REASON,
            removedPlaceholder: PLACEHOLDER_REMOVE_LAYOUT_REASON,
          };
    } finally {
      wm._suppressRehome.leave();
      // Clear when no layoutRole PHs remain (wave done or no binds needed).
      this._clearLayoutBindPendingIfIdle(wm, tree);
    }
  }

  /**
   * Clear _layoutBindPending when no slot-tagged layout PHs remain.
   * @param {object} wm
   * @param {object} [tree]
   */
  _clearLayoutBindPendingIfIdle(wm, tree) {
    if (!wm) return;
    const t = tree || wm.tree;
    if (!t || !this._findLayoutPlaceholder(t, {})) {
      wm._layoutBindPending = false;
    }
  }

  /**
   * @param {object} tree
   * @param {{ layoutRole?: string, layoutSlot?: string }} want
   */
  _findLayoutPlaceholder(tree, want = {}) {
    const role = want.layoutRole != null ? String(want.layoutRole) : null;
    const slot = want.layoutSlot != null ? String(want.layoutSlot) : null;
    const windows = tree.getNodeByType?.(NODE_TYPES.WINDOW) || [];
    let slotOnly = null;
    let anyTagged = null;
    for (const n of windows) {
      if (!isPlaceholderNode(n)) continue;
      let nRole = n.layoutRole ?? n.nodeValue?.layoutRole ?? null;
      let nSlot = n.layoutSlot ?? n.nodeValue?.layoutSlot ?? null;
      if ((!nRole || !nSlot) && n.nodeValue?.title) {
        const parsed = parseLayoutPlaceholderTitle(n.nodeValue.title);
        if (parsed) {
          nRole = nRole || parsed.role;
          nSlot = nSlot || parsed.slot;
        }
      }
      if (!nRole && !nSlot) continue;
      anyTagged = anyTagged || n;
      if (role && nRole && String(nRole) === role) {
        if (!slot || !nSlot || String(nSlot) === slot) return n;
      }
      if (!role && slot && nSlot && String(nSlot) === slot) {
        slotOnly = slotOnly || n;
      }
    }
    if (role) return null;
    if (slot) return slotOnly;
    return anyTagged;
  }

  // --- resolve helpers ---

  _configSync() {
    return this._ext?.configSync ?? null;
  }

  _wm() {
    return this._ext?.extWm ?? null;
  }

  _monitorNodes() {
    const tree = this._wm()?.tree;
    if (!tree?.getNodeByType) return [];
    return tree.getNodeByType(NODE_TYPES.MONITOR) || [];
  }

  _selectCtx() {
    const wm = this._wm();
    const tree = wm?.tree;
    let liveMap = null;
    try {
      liveMap = wm?.getMonitorLiveMap?.() ?? null;
    } catch (_e) {
      liveMap = null;
    }
    return {
      getFocusWindow: () => {
        try {
          return wm?.focusMetaWindow ?? null;
        } catch (_e) {
          return null;
        }
      },
      getLftNode: () => {
        try {
          return wm?.lftMru?.globalHead?.() ?? null;
        } catch (_e) {
          return null;
        }
      },
      findNode: (val) => {
        try {
          return tree?.findNode?.(val) ?? null;
        } catch (_e) {
          return null;
        }
      },
      liveMap,
      getActiveWorkspace: () => {
        try {
          return global.workspace_manager?.get_active_workspace_index?.() ?? null;
        } catch (_e) {
          return null;
        }
      },
    };
  }

  /**
   * @param {string} selector
   * @returns {{ ok: true, match: any } | { ok: false, error: string, candidates?: object[] }}
   */
  _resolveWindow(selector) {
    let descriptor;
    try {
      descriptor = parseSelector(selector);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    const forest = this._monitorNodes();
    if (!forest.length) {
      return { ok: false, error: "Tree not available" };
    }
    const { matches } = matchWindows(forest, descriptor, this._selectCtx());
    const picked = pickMatch(matches, { first: !!descriptor.first });
    if (picked.ok) return picked;
    const all = this._wm()?.tree?.getNodeByType?.(NODE_TYPES.WINDOW) || [];
    if (!all.length) return picked;
    const { matches: more } = matchWindows(all, descriptor, this._selectCtx());
    return pickMatch(more, { first: !!descriptor.first });
  }

  /**
   * Dest may be WINDOW (any selector) or CON/MONITOR (path).
   * @param {string} dest
   */
  _resolveDest(dest) {
    let descriptor;
    try {
      descriptor = parseSelector(dest);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    const forest = this._monitorNodes();
    if (!forest.length) {
      return { ok: false, error: "Tree not available" };
    }
    const ctx = this._selectCtx();
    if (descriptor.kind === "path") {
      const { matches } = matchNodes(forest, descriptor, ctx);
      return pickMatch(matches, { first: !!descriptor.first });
    }
    const { matches } = matchWindows(forest, descriptor, ctx);
    return pickMatch(matches, { first: !!descriptor.first });
  }
}
