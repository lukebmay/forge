/*
 * This file is part of the Forge extension for GNOME
 *
 * Session DBus API: Ping, GetTree, Focus, Swap, Move, PlaceNext (FC0–FC2),
 * GetSetting, SetSetting, SettingsSave, SettingsLoad (FC3),
 * RunSteps batch + freezeRender (FC4), LayoutBatch multi-open (CL5).
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";

import { Logger } from "../shared/logger.js";
import { parseSettingValueText } from "../shared/settings-control.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "./tree.js";
import { projectForest, TREE_QUERY_API_VERSION, windowMetaFields } from "./tree-query.js";
import {
  matchNodes,
  matchWindows,
  pickMatch,
  parseSelector,
  candidatePublic,
} from "./tile-select.js";
import { parseStepsPayload, runStepsDispatch } from "./run-steps.js";
import * as Utils from "./utils.js";
import { safeMoveToMonitor } from "./soft-rehome.js";
import * as SessionLayout from "./session-layout.js";

export const FORGE_DBUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const FORGE_DBUS_PATH = "/org/gnome/Shell/Extensions/Forge";
export const FORGE_DBUS_INTERFACE = "org.gnome.Shell.Extensions.Forge";

/** Combined control-plane version (+ LayoutBatch release-deferred / CL9). */
export const SESSION_API_VERSION = 8;

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
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;
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
   * DBus: LayoutBatch(action) → JSON
   *
   * CL5 multi-open / forge layout: begin → open all → fingerprint batch quiet
   * → residual RunSteps (one render) → end. While active, per-app open commits
   * and requestLayout only latch need-commit (no mid-batch render flood).
   *
   * CL9: release | release-deferred | unhide — unhide deferred maps without
   * ending the batch (before residual plan + RunSteps).
   *
   * @param {string} action "begin" | "end" | "release-deferred" (optional end reason)
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
        error: `LayoutBatch action want begin|end|release-deferred (got ${raw || "empty"})`,
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
      // CLI GetTree → save-session-layout fallback: open leaf must match focus.
      try {
        SessionLayout.syncLastTabFocusFromFocus(tree, focusMeta);
      } catch (_e) {
        // ignore
      }

      const forest = projectForest(monitorNodes, {
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : null,
        liveMap,
        monitor,
        workspace,
        onlyWithChildren: !!options.onlyWithChildren,
        focusWindowId,
      });

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
   * Freezes render, runs extension ops, unfreezes, one renderTree("run-steps").
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
      const prevFrozen = !!wm?._freezeRender;
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
          if (!prevFrozen) {
            wm?.unfreezeRender?.();
          } else {
            wm?.freezeRender?.();
          }
        } catch (e) {
          Logger.warn(`session-api RunSteps unfreeze: ${e}`);
        }
        // Single quiet-batch render when we own freeze state.
        if (!prevFrozen && wm?.renderTree) {
          try {
            wm.renderTree("run-steps", true);
          } catch (e) {
            Logger.warn(`session-api RunSteps render: ${e}`);
          }
          // After idle render: raise tab focus then restack chrome (WR14).
          this._scheduleRunStepsSettle(wm);
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

  /**
   * Queue settle after RunSteps render idle (same priority → FIFO after render).
   * @param {import('./window.js').WindowManager} wm
   */
  _scheduleRunStepsSettle(wm) {
    if (!wm) return;
    this._clearRunStepsSettle();
    try {
      this._runStepsSettleSrcId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this._runStepsSettleSrcId = 0;
        try {
          this._settleAfterRunSteps(wm);
        } catch (e) {
          Logger.warn(`session-api RunSteps settle: ${e}`);
        }
        return GLib.SOURCE_REMOVE;
      });
    } catch (e) {
      Logger.warn(`session-api RunSteps settle schedule: ${e}`);
      try {
        this._settleAfterRunSteps(wm);
      } catch (e2) {
        Logger.warn(`session-api RunSteps settle: ${e2}`);
      }
    }
  }

  /**
   * Raise lastTabFocus (or first tiled child) per tab/stack CON, then restack
   * tab strips above their windows so chrome stays clickable after mass moves.
   * @param {import('./window.js').WindowManager} wm
   */
  _settleAfterRunSteps(wm) {
    if (!wm || wm._freezeRender || wm.disabled) return;

    try {
      const root = wm.currentWsNode;
      const cons = root
        ? root.getNodeByType(NODE_TYPES.CON)
        : wm.tree?.getNodeByType?.(NODE_TYPES.CON) || [];

      for (const con of cons) {
        if (!con?.isStackedOrTabbed?.()) continue;
        const focusNode = this._tabSettleFocusNode(wm, con);
        if (!focusNode) continue;
        try {
          if (con.isStacked?.()) wm.updateStackedFocus?.(focusNode);
          else wm.updateTabbedFocus?.(focusNode);
        } catch (_e) {
          /* best-effort raise */
        }
      }
    } catch (e) {
      Logger.warn(`session-api settle tab focus: ${e}`);
    }

    // Chrome last so strips sit above any raise above.
    try {
      wm.updateDecorationLayout?.();
      wm.updateBorderLayout?.();
    } catch (e) {
      Logger.warn(`session-api settle chrome: ${e}`);
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
      focus: (step) => this._focusOp(step.selector),
      swap: (step) => this._swapOp(step.a, step.b, { quiet: true }),
      move: (step) =>
        this._moveOp(step.tile, step.dest, {
          quiet: true,
          position: step.position,
        }),
      layout: (step) => this._layoutOp(step.mode, step.selector, { quiet: true }),
      "layout-cycle": (step) => this._layoutCycleOp(step.axis, step.selector, { quiet: true }),
      "merge-group": (step) => this._mergeGroupOp(step.selector, step.with, { quiet: true }),
      float: (step) => this._floatOp(step.selector, step.scope, { quiet: true }),
      order: (step) => this._orderMonChildrenOp(step.windowIds, { quiet: true }),
      size: (step) => this._sizeOp(step.windowIds, step.shares, { quiet: true }),
      "place-next": (step) => this._placeNextOp(step.options || {}),
      set: (step) => this._setOp(step.key, step.value),
      close: (step) => this._closeOp(step.selector, { force: !!step.force }),
    };
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
    if (!resolved.ok) return resolved;

    const node = resolved.match.node;
    const meta = node?.nodeValue;
    if (!meta) {
      return { error: "not found", candidates: [] };
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
   * @returns {object}
   */
  _focusOp(selector) {
    const resolved = this._resolveWindow(selector);
    if (!resolved.ok) return resolved;

    const node = resolved.match.node;
    const meta = node?.nodeValue;
    if (!meta) {
      return { error: "not found", candidates: [] };
    }

    const wm = this._wm();
    const now =
      typeof global !== "undefined" && global.display?.get_current_time
        ? global.display.get_current_time()
        : typeof global !== "undefined" && global.get_current_time
        ? global.get_current_time()
        : 0;

    try {
      if (typeof meta.activate === "function") {
        meta.activate(now);
      } else if (typeof meta.focus === "function") {
        meta.focus(now);
      }
    } catch (e) {
      return { error: `activate failed: ${e.message || e}` };
    }

    try {
      meta.raise?.();
    } catch (_e) {
      /* ignore */
    }

    if (wm) {
      // FocusChanged: F → Dfocus → B → P → A (includes LFT via movePointerWith).
      try {
        if (typeof wm.afterFocus === "function") {
          wm.afterFocus(node, { source: "dbus-focus" });
        } else {
          wm.updateStackedFocus?.(node);
          wm.updateTabbedFocus?.(node);
          wm.updateDecorationLayout?.({ scope: "focus", focusNode: node });
          wm.updateBorderLayout?.();
          try {
            wm.movePointerWith?.(node);
          } catch (_e) {
            try {
              wm._lftTouchIfTile?.(node);
            } catch (_e2) {
              /* best-effort LFT */
            }
          }
          if (wm.tree) wm.tree.attachNode = node;
        }
      } catch (_e) {
        /* best-effort focus chrome */
      }
    }

    return {
      ok: true,
      candidate: candidatePublic(resolved.match),
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
        wm?.renderTree?.("session-size", true);
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
    const monDirects = [];
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

    if (monDirects.length < 2) {
      return { ok: true, reordered: false, reason: "fewer than 2 distinct mon children" };
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

    parent.childNodes = ordered;

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
        wm?.renderTree?.("session-order", true);
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

    // Mirror CommandHandler: monitor parent → wrap in split first for tab/stack.
    let parent = focusNode.parentNode;
    if (
      typeof parent.isMonitor === "function" &&
      parent.isMonitor() &&
      (mode === "TABBED" ||
        mode === "STACKED" ||
        mode === LAYOUT_TYPES.TABBED ||
        mode === LAYOUT_TYPES.STACKED)
    ) {
      try {
        tree.split?.(focusNode, ORIENTATION_TYPES.HORIZONTAL, true);
        parent = focusNode.parentNode;
      } catch (e) {
        return { error: `split before layout failed: ${e.message || e}` };
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

    // H/V → TABBED|STACKED is lossy: peel nested CONs so the bag is window leaves only.
    if (layoutValue === LAYOUT_TYPES.TABBED || layoutValue === LAYOUT_TYPES.STACKED) {
      this._flattenLayoutParentToWindows(parent);
    }

    const prev = parent.layout;
    if (prev === LAYOUT_TYPES.TABBED && layoutValue !== LAYOUT_TYPES.TABBED) {
      parent.lastTabFocus = null;
    }
    parent.layout = layoutValue;
    if (layoutValue === LAYOUT_TYPES.TABBED || layoutValue === LAYOUT_TYPES.STACKED) {
      parent.lastTabFocus = focusNode.nodeValue ?? parent.lastTabFocus;
    }
    if (layoutValue === LAYOUT_TYPES.HSPLIT || layoutValue === LAYOUT_TYPES.VSPLIT) {
      try {
        tree.resetSiblingPercent?.(parent);
      } catch (_e) {
        /* best-effort */
      }
    }

    try {
      tree.attachNode = parent;
      if (!quiet) {
        wm?.unfreezeRender?.();
        wm?.renderTree?.("session-layout", true);
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

    if (ax === "group") {
      const stackOn = !settings || settings.get_boolean("stacked-tiling-mode-enabled");
      const tabOn = !settings || settings.get_boolean("tabbed-tiling-mode-enabled");
      if (prev === LAYOUT_TYPES.STACKED) {
        if (!tabOn) return { error: "tabbed-tiling-mode-enabled is false" };
        next = LAYOUT_TYPES.TABBED;
        parent.lastTabFocus = focusNode.nodeValue ?? parent.lastTabFocus;
      } else if (prev === LAYOUT_TYPES.TABBED) {
        if (!stackOn) return { error: "stacked-tiling-mode-enabled is false" };
        next = LAYOUT_TYPES.STACKED;
        parent.lastTabFocus = null;
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
      try {
        tree.resetSiblingPercent?.(parent);
      } catch (_e) {
        /* best-effort */
      }
    } else {
      return { error: `unsupported layout-cycle axis: ${axis}` };
    }

    parent.layout = next;
    try {
      tree.attachNode = parent;
      if (!quiet) {
        wm?.unfreezeRender?.();
        wm?.renderTree?.("session-layout-cycle", true);
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
        wm?.renderTree?.("session-merge-group", true);
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
   * Toggle float (window or class scope) via WindowManager.
   * @param {string} [selector]
   * @param {string} [scope] - window|class
   * @param {{ quiet?: boolean }} [opts]
   */
  _floatOp(selector, scope, opts = {}) {
    const quiet = !!opts.quiet;
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
      if (!quiet) {
        wm?.unfreezeRender?.();
        wm?.renderTree?.("session-float", true);
      }
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
    return pickMatch(matches, { first: !!descriptor.first });
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
