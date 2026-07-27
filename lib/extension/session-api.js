/*
 * This file is part of the Forge extension for GNOME
 *
 * Session DBus API: Ping, GetTree, Focus, Swap, Move, PlaceNext (FC0–FC2),
 * GetSetting, SetSetting, SettingsSave, SettingsLoad (FC3),
 * RunSteps batch + freezeRender (FC4).
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { Logger } from "../shared/logger.js";
import { parseSettingValueText } from "../shared/settings-control.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "./tree.js";
import { projectForest, TREE_QUERY_API_VERSION } from "./tree-query.js";
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

export const FORGE_DBUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const FORGE_DBUS_PATH = "/org/gnome/Shell/Extensions/Forge";
export const FORGE_DBUS_INTERFACE = "org.gnome.Shell.Extensions.Forge";

/** Combined control-plane version (+ SaveSessionLayout for install flush). */
export const SESSION_API_VERSION = 6;

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

      const forest = projectForest(monitorNodes, {
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : null,
        liveMap,
        monitor,
        workspace,
        onlyWithChildren: !!options.onlyWithChildren,
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
      try {
        wm.updateStackedFocus?.(node);
        wm.updateTabbedFocus?.(node);
      } catch (_e) {
        /* best-effort tab/stack */
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
      wm?.updateTabbedFocus?.(a.match.node);
      wm?.updateStackedFocus?.(a.match.node);
      if (!quiet) {
        wm?.renderTree?.("session-swap", true);
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
        wm?.renderTree?.("session-move", true);
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

    const prev = parent.layout;
    if (prev === LAYOUT_TYPES.TABBED && layoutValue !== LAYOUT_TYPES.TABBED) {
      parent.lastTabFocus = null;
    }
    parent.layout = layoutValue;
    if (layoutValue === LAYOUT_TYPES.TABBED) {
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
