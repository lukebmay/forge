/*
 * This file is part of the Forge extension for GNOME
 *
 * Session DBus API: Ping, GetTree, Focus, Swap, Move, PlaceNext (FC0–FC2),
 * GetSetting, SetSetting, SettingsSave, SettingsLoad (FC3).
 */

import Gio from "gi://Gio";

import { Logger } from "../shared/logger.js";
import { parseSettingValueText } from "../shared/settings-control.js";
import { NODE_TYPES } from "./tree.js";
import { projectForest, TREE_QUERY_API_VERSION } from "./tree-query.js";
import {
  matchNodes,
  matchWindows,
  pickMatch,
  parseSelector,
  candidatePublic,
} from "./tile-select.js";

export const FORGE_DBUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const FORGE_DBUS_PATH = "/org/gnome/Shell/Extensions/Forge";
export const FORGE_DBUS_INTERFACE = "org.gnome.Shell.Extensions.Forge";

/** Combined control-plane version (selectors + ops + PlaceNext + settings). */
export const SESSION_API_VERSION = 4;

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
      const resolved = this._resolveWindow(selector);
      if (!resolved.ok) return JSON.stringify(resolved);

      const node = resolved.match.node;
      const meta = node?.nodeValue;
      if (!meta) {
        return JSON.stringify({ error: "not found", candidates: [] });
      }

      const wm = this._ext?.extWm;
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
        return JSON.stringify({ error: `activate failed: ${e.message || e}` });
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

      return JSON.stringify({
        ok: true,
        candidate: candidatePublic(resolved.match),
      });
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
      const a = this._resolveWindow(selectorA);
      if (!a.ok) return JSON.stringify({ ...a, which: "a" });
      const b = this._resolveWindow(selectorB);
      if (!b.ok) return JSON.stringify({ ...b, which: "b" });

      if (a.match.node === b.match.node) {
        return JSON.stringify({ error: "same window" });
      }

      const tree = this._ext?.extWm?.tree;
      const wm = this._ext?.extWm;
      if (!tree?.swapPairs) {
        return JSON.stringify({ error: "Tree not available" });
      }

      try {
        wm?.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }

      tree.swapPairs(a.match.node, b.match.node);

      try {
        wm?.updateTabbedFocus?.(a.match.node);
        wm?.updateStackedFocus?.(a.match.node);
        wm?.renderTree?.("session-swap", true);
      } catch (e) {
        Logger.warn(`session-api Swap post: ${e}`);
      }

      return JSON.stringify({
        ok: true,
        a: candidatePublic(a.match),
        b: candidatePublic(b.match),
      });
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
      const src = this._resolveWindow(selector);
      if (!src.ok) return JSON.stringify({ ...src, which: "tile" });

      const destRes = this._resolveDest(dest);
      if (!destRes.ok) return JSON.stringify({ ...destRes, which: "dest" });

      const sourceNode = src.match.node;
      const destNode = destRes.match.node;
      if (sourceNode === destNode) {
        return JSON.stringify({ error: "same node" });
      }

      const tree = this._ext?.extWm?.tree;
      const wm = this._ext?.extWm;
      if (!tree) {
        return JSON.stringify({ error: "Tree not available" });
      }

      // Refuse moving into own descendant
      if (typeof sourceNode.contains === "function" && sourceNode.contains(destNode)) {
        return JSON.stringify({ error: "cannot move into own descendant" });
      }

      try {
        wm?.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }

      const priorParent = sourceNode.parentNode;
      const destType = destRes.match.nodeType;

      if (destType === "WINDOW") {
        const parent = destNode.parentNode;
        if (!parent) {
          return JSON.stringify({ error: "dest has no parent" });
        }
        // Insert after dest (end of sibling list if last).
        const next = destNode.nextSibling ?? null;
        if (typeof parent.insertBefore === "function") {
          if (next) parent.insertBefore(sourceNode, next);
          else parent.appendChild(sourceNode);
        } else {
          return JSON.stringify({ error: "cannot reparent" });
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
          return JSON.stringify({ error: "dest cannot accept children" });
        }
        destNode.appendChild(sourceNode);
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
        return JSON.stringify({
          error: `unsupported dest nodeType: ${destType}`,
        });
      }

      try {
        wm?.renderTree?.("session-move", true);
      } catch (e) {
        Logger.warn(`session-api Move post: ${e}`);
      }

      return JSON.stringify({
        ok: true,
        tile: candidatePublic(src.match),
        dest: candidatePublic(destRes.match),
      });
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
