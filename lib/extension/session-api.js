/*
 * This file is part of the Forge extension for GNOME
 *
 * Session DBus API (FC0): Ping + GetTree for CLI / scripts.
 */

import Gio from "gi://Gio";

import { Logger } from "../shared/logger.js";
import { NODE_TYPES } from "./tree.js";
import { projectForest, TREE_QUERY_API_VERSION } from "./tree-query.js";

export const FORGE_DBUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const FORGE_DBUS_PATH = "/org/gnome/Shell/Extensions/Forge";
export const FORGE_DBUS_INTERFACE = "org.gnome.Shell.Extensions.Forge";

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
        apiVersion: TREE_QUERY_API_VERSION,
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
}
