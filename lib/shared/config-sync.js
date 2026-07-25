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

import GLib from "gi://GLib";
import GObject from "gi://GObject";

import { Logger } from "./logger.js";
import { SETTINGS_KEYS, KEYBINDING_KEYS, KEYBINDING_STRING_KEYS } from "./settings-keys.js";
import { resolvePortableKey, coerceForGSettingsType } from "./settings-control.js";

// Re-export allowlists for existing importers (keybind-presets, tests, …)
export { SETTINGS_KEYS, KEYBINDING_KEYS, KEYBINDING_STRING_KEYS };

// GSettings type string → getter/setter method names
const SETTINGS_TYPE_MAP = {
  b: { get: "get_boolean", set: "set_boolean" },
  u: { get: "get_uint", set: "set_uint" },
  i: { get: "get_int", set: "set_int" },
  s: { get: "get_string", set: "set_string" },
  d: { get: "get_double", set: "set_double" },
  as: { get: "get_strv", set: "set_strv" },
};

/**
 * ConfigSync handles bidirectional sync between GSettings and JSON config files.
 * Files are only created on explicit export; if files exist on startup, they are imported.
 */
// Category names derived from SETTINGS_KEYS for DRY iteration
const SETTINGS_CATEGORIES = Object.keys(SETTINGS_KEYS);

export class ConfigSync extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {boolean} Whether config files were loaded on startup */
  configFilesLoaded = false;

  /** @type {boolean} True while importAll() is applying file values to GSettings */
  _importing = false;

  /** @type {number|null} Idle source ID that clears _importing after import drains */
  _importClearId = null;

  /** @type {number|null} Debounce timeout ID for auto-export */
  _exportDebounceId = null;

  /**
   * @type {{settings: number|null, keybindings: number|null}}
   * On-disk mtime of each config file as of our last write. The debounced
   * auto-export compares against these to skip writes that would clobber an
   * out-of-band change — a prefs Export/Import or a hand edit (forge-nn0m).
   * null means "no baseline yet", which never blocks.
   */
  _lastWrittenMtimes = { settings: null, keybindings: null };

  /** @type {number} Debounce delay in milliseconds */
  static DEBOUNCE_MS = 500;

  /**
   * @param {Object} params
   * @param {import('./settings.js').ConfigManager} params.configMgr
   * @param {Gio.Settings} params.settings
   * @param {Gio.Settings} params.kbdSettings
   */
  constructor({ configMgr, settings, kbdSettings }) {
    super();
    this._configMgr = configMgr;
    this._settings = settings;
    this._kbdSettings = kbdSettings;
    this._settingsSignalIds = [];
    this._kbdSettingsSignalIds = [];
  }

  /**
   * Initialize the config sync system.
   * If config files exist, import them and enable auto-sync.
   */
  init() {
    if (this._configMgr.hasPortableConfig()) {
      Logger.info("Portable config files found, importing...");
      this.importAll();
    }

    // Respect the user's stored choice instead of force-enabling sync whenever
    // files exist (forge-orrf). The key only flips to true via an explicit Export
    // (enablePortableConfig); a user who turned it off stays off across restarts.
    this.configFilesLoaded = this._settings.get_boolean("config-file-sync-enabled");

    // Always listen so the "Auto-sync changes" toggle is honored at runtime
    // (forge-el01); auto-export stays gated on configFilesLoaded in the handler.
    this._connectSettingsSignals();

    // Seed the clobber-guard baseline from the files on disk so the first
    // post-startup auto-export already detects out-of-band writes (forge-nn0m).
    this._recordWrittenMtimes();

    Logger.info(`ConfigSync initialized, configFilesLoaded: ${this.configFilesLoaded}`);
  }

  /**
   * Clean up signal connections
   */
  destroy() {
    this._disconnectSettingsSignals();
    if (this._exportDebounceId) {
      GLib.source_remove(this._exportDebounceId);
      this._exportDebounceId = null;
    }
    if (this._importClearId) {
      GLib.source_remove(this._importClearId);
      this._importClearId = null;
    }
  }

  /**
   * Build a file:// URL to a schema in the extension's config directory
   * @param {string} name - Schema name without extension (e.g., "settings", "keybindings")
   * @returns {string}
   */
  _schemaUrl(name) {
    return `file://${this._configMgr.extensionPath}/config/${name}.schema.json`;
  }

  /**
   * Connect to GSettings changed signals for auto-export
   */
  _connectSettingsSignals() {
    const settingsId = this._settings.connect("changed", (settings, key) => {
      this._onSettingsChanged(key, false);
    });
    this._settingsSignalIds.push(settingsId);

    const kbdId = this._kbdSettings.connect("changed", (settings, key) => {
      this._onSettingsChanged(key, true);
    });
    this._kbdSettingsSignalIds.push(kbdId);
  }

  /**
   * Disconnect all signal connections
   */
  _disconnectSettingsSignals() {
    for (const id of this._settingsSignalIds) {
      this._settings.disconnect(id);
    }
    this._settingsSignalIds = [];

    for (const id of this._kbdSettingsSignalIds) {
      this._kbdSettings.disconnect(id);
    }
    this._kbdSettingsSignalIds = [];
  }

  /**
   * Handle settings changes - debounce and export if sync is enabled
   * @param {string} key
   * @param {boolean} isKeybinding
   */
  _onSettingsChanged(key, isKeybinding) {
    // React to the "Auto-sync changes" toggle at runtime (forge-el01). The key
    // lives only on the main settings schema, so always read it from _settings.
    if (key === "config-file-sync-enabled") {
      this.configFilesLoaded = this._settings.get_boolean(key);
      return;
    }

    // Drop changes the import path itself is making (forge-3t3a) — otherwise the
    // per-key set_* calls would schedule an export that rewrites the file we just
    // imported.
    if (this._importing) {
      return;
    }

    // Skip internal tracking keys
    if (
      key === "config-last-import" ||
      key === "config-last-export" ||
      key === "css-updated" ||
      key === "css-last-update" ||
      key === "window-overrides-reload-trigger"
    ) {
      return;
    }

    if (!this.configFilesLoaded) {
      return;
    }

    // Don't resurrect portable files the user deleted (forge-qj5n). If neither
    // file exists, an ordinary settings change must not recreate them — only an
    // explicit Export / enablePortableConfig may (re)create deleted files.
    if (!this._configMgr.hasPortableConfig()) {
      return;
    }

    // Debounce exports to batch rapid changes
    if (this._exportDebounceId) {
      GLib.source_remove(this._exportDebounceId);
    }

    this._exportDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ConfigSync.DEBOUNCE_MS, () => {
      this._exportDebounceId = null;
      // Don't let a background auto-export clobber a file another writer changed
      // since our last write (forge-nn0m). User-initiated Export/Import bypass
      // this path and always win.
      if (!this._configChangedExternally()) {
        this._autoExport();
      } else {
        // Adopt the external writer's file as our new baseline so we skip only
        // THIS stale export — the next genuine change exports normally instead
        // of latching auto-export off until restart.
        this._recordWrittenMtimes();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Record the on-disk mtime of each config file as our new baseline. Called
   * after every write so subsequent auto-exports compare against what we left.
   */
  _recordWrittenMtimes() {
    this._lastWrittenMtimes.settings = this._configMgr.getConfigMtime("settings");
    this._lastWrittenMtimes.keybindings = this._configMgr.getConfigMtime("keybindings");
  }

  /**
   * True when a config file changed on disk since our last write — i.e. another
   * writer (prefs Export/Import, a hand edit) touched it. A null baseline (we've
   * never written) never blocks. (forge-nn0m)
   * @returns {boolean}
   */
  _configChangedExternally() {
    for (const name of ["settings", "keybindings"]) {
      const baseline = this._lastWrittenMtimes[name];
      if (baseline == null) continue;
      const current = this._configMgr.getConfigMtime(name);
      if (current != null && current !== baseline) {
        Logger.warn(
          `${name}.json changed outside the extension; skipping auto-export to avoid clobbering it (use Export to overwrite)`
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Import settings for a category from props into GSettings
   * @param {Object} props - The props object containing settings
   * @param {string} category - The category name (e.g., 'behavior', 'appearance')
   */
  _importSettingsCategory(props, category) {
    if (props[category]) {
      for (const key of SETTINGS_KEYS[category]) {
        if (props[category][key] !== undefined) {
          this._setSettingValue(key, props[category][key]);
        }
      }
    }
  }

  /**
   * Export settings for a category from GSettings to props object
   * @param {Object} props - The props object to export to
   * @param {string} category - The category name (e.g., 'behavior', 'appearance')
   */
  _exportSettingsCategory(props, category) {
    for (const key of SETTINGS_KEYS[category]) {
      props[category][key] = this._getSettingValue(key);
    }
  }

  /**
   * Import settings from settings.json into GSettings
   * @returns {boolean} Whether import was successful
   */
  importSettings() {
    const props = this._configMgr.settingsProps;
    if (!props) {
      Logger.debug("No settings.json found, skipping import");
      return false;
    }

    try {
      for (const category of SETTINGS_CATEGORIES) {
        this._importSettingsCategory(props, category);
      }

      this._settings.set_uint64("config-last-import", Math.floor(Date.now() / 1000));
      Logger.info("Settings imported from settings.json");
      return true;
    } catch (e) {
      Logger.error(`Failed to import settings: ${e}`);
      return false;
    }
  }

  /**
   * Import keybindings from keybindings.json into GSettings
   * @returns {boolean} Whether import was successful
   */
  importKeybindings() {
    const props = this._configMgr.keybindingsProps;
    if (!props) {
      Logger.debug("No keybindings.json found, skipping import");
      return false;
    }

    try {
      if (props["mod-mask-mouse-tile"] !== undefined) {
        this._kbdSettings.set_string("mod-mask-mouse-tile", props["mod-mask-mouse-tile"]);
      }

      if (props.bindings) {
        for (const key of KEYBINDING_KEYS) {
          if (props.bindings[key] !== undefined) {
            const value = props.bindings[key];
            if (Array.isArray(value)) {
              this._kbdSettings.set_strv(key, value);
            }
          }
        }
      }

      this._settings.set_uint64("config-last-import", Math.floor(Date.now() / 1000));
      Logger.info("Keybindings imported from keybindings.json");
      return true;
    } catch (e) {
      Logger.error(`Failed to import keybindings: ${e}`);
      return false;
    }
  }

  /**
   * Import all config files
   */
  importAll() {
    this._importing = true;
    this.importSettings();
    this.importKeybindings();
    // dconf delivers the "changed" notifications for the keys we just set on a
    // later main-loop turn, so the guard must survive past this synchronous
    // burst. Clear it on a low-priority idle that runs AFTER those notifications
    // have been dispatched (forge-3t3a).
    if (this._importClearId) {
      GLib.source_remove(this._importClearId);
    }
    this._importClearId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._importing = false;
      this._importClearId = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Export settings from GSettings to settings.json
   * @returns {boolean} Whether export was successful
   */
  exportSettings() {
    try {
      const props = {
        $schema: this._schemaUrl("settings"),
        version: 1,
      };
      for (const category of SETTINGS_CATEGORIES) {
        props[category] = {};
        this._exportSettingsCategory(props, category);
      }

      this._configMgr.settingsProps = props;
      this._settings.set_uint64("config-last-export", Math.floor(Date.now() / 1000));
      Logger.info("Settings exported to settings.json");
      return true;
    } catch (e) {
      Logger.error(`Failed to export settings: ${e}`);
      return false;
    }
  }

  /**
   * Export keybindings from GSettings to keybindings.json
   * @returns {boolean} Whether export was successful
   */
  exportKeybindings() {
    try {
      const props = {
        $schema: this._schemaUrl("keybindings"),
        version: 1,
        "mod-mask-mouse-tile": this._kbdSettings.get_string("mod-mask-mouse-tile"),
        bindings: {},
      };

      for (const key of KEYBINDING_KEYS) {
        props.bindings[key] = this._kbdSettings.get_strv(key);
      }

      this._configMgr.keybindingsProps = props;
      this._settings.set_uint64("config-last-export", Math.floor(Date.now() / 1000));
      Logger.info("Keybindings exported to keybindings.json");
      return true;
    } catch (e) {
      Logger.error(`Failed to export keybindings: ${e}`);
      return false;
    }
  }

  /**
   * Export all settings and keybindings to config files
   */
  exportAll() {
    this.exportSettings();
    this.exportKeybindings();
    this._recordWrittenMtimes();
  }

  /**
   * Background auto-export (the debounced settings-changed path). Unlike the
   * explicit exportAll(), this only (re)writes a portable file that CURRENTLY
   * exists — re-checking per file at fire time. So a file the user deleted is
   * not resurrected by an ordinary settings change (forge-rt10), while a partial
   * deletion still keeps the surviving file in sync. Explicit Export /
   * enablePortableConfig deliberately still (re)create both (forge-qj5n).
   */
  _autoExport() {
    if (this._configMgr.settingsConfigFile !== null) this.exportSettings();
    if (this._configMgr.keybindingsConfigFile !== null) this.exportKeybindings();
    this._recordWrittenMtimes();
  }

  /**
   * Manually trigger export and enable sync
   * This is called when user explicitly requests export
   */
  enablePortableConfig() {
    this.exportAll();
    this.configFilesLoaded = true;
    this._settings.set_boolean("config-file-sync-enabled", true);

    if (this._settingsSignalIds.length === 0) {
      this._connectSettingsSignals();
    }

    Logger.info("Portable config enabled and exported");
  }

  /**
   * Get a setting value from GSettings based on its type
   * @param {string} key
   * @returns {any}
   */
  _getSettingValue(key) {
    const typeString = this._settings.get_value(key).get_type_string();
    const entry = SETTINGS_TYPE_MAP[typeString];
    if (entry) return this._settings[entry.get](key);
    Logger.warn(`Unknown setting type for ${key}: ${typeString}`);
    return null;
  }

  /**
   * Set a setting value in GSettings based on its type
   * @param {string} key
   * @param {any} value
   */
  _setSettingValue(key, value) {
    const typeString = this._settings.get_value(key).get_type_string();
    const entry = SETTINGS_TYPE_MAP[typeString];
    if (entry) return this._settings[entry.set](key, value);
    Logger.warn(`Unknown setting type for ${key}: ${typeString}`);
  }

  /**
   * Type string for a key on the main or keybindings schema.
   * @param {"settings"|"keybindings"} schema
   * @param {string} key
   * @returns {string|null}
   */
  _typeStringFor(schema, key) {
    try {
      const gset = schema === "keybindings" ? this._kbdSettings : this._settings;
      return gset.get_value(key).get_type_string();
    } catch (_e) {
      return null;
    }
  }

  /**
   * Read one allowlisted portable key (FC3).
   * @param {string} rawKey - key or settings:key / kbd:key
   * @returns {{ ok: true, key: string, schema: string, value: any, type: string } | { ok: false, error: string }}
   */
  getPortable(rawKey) {
    const resolved = resolvePortableKey(rawKey);
    if (!resolved.ok) return resolved;

    const { schema, key } = resolved.resolved;
    try {
      if (schema === "settings") {
        const typeString = this._typeStringFor("settings", key);
        if (!typeString) {
          return { ok: false, error: `cannot read type for settings key: ${key}` };
        }
        const value = this._getSettingValue(key);
        return { ok: true, key, schema, value, type: typeString };
      }

      // keybindings
      if (KEYBINDING_STRING_KEYS.includes(key)) {
        const value = this._kbdSettings.get_string(key);
        return { ok: true, key, schema, value, type: "s" };
      }
      const value = this._kbdSettings.get_strv(key);
      return { ok: true, key, schema, value, type: "as" };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * Write one allowlisted portable key (FC3).
   * @param {string} rawKey
   * @param {any} value - already JSON-parsed JS value
   * @returns {{ ok: true, key: string, schema: string, value: any, type: string } | { ok: false, error: string }}
   */
  setPortable(rawKey, value) {
    const resolved = resolvePortableKey(rawKey);
    if (!resolved.ok) return resolved;

    const { schema, key } = resolved.resolved;
    try {
      if (schema === "settings") {
        const typeString = this._typeStringFor("settings", key);
        if (!typeString) {
          return { ok: false, error: `cannot read type for settings key: ${key}` };
        }
        const coerced = coerceForGSettingsType(value, typeString);
        if (!coerced.ok) return coerced;
        this._setSettingValue(key, coerced.value);
        return { ok: true, key, schema, value: coerced.value, type: typeString };
      }

      if (KEYBINDING_STRING_KEYS.includes(key)) {
        const coerced = coerceForGSettingsType(value, "s");
        if (!coerced.ok) return coerced;
        this._kbdSettings.set_string(key, coerced.value);
        return { ok: true, key, schema, value: coerced.value, type: "s" };
      }
      const coerced = coerceForGSettingsType(value, "as");
      if (!coerced.ok) return coerced;
      this._kbdSettings.set_strv(key, coerced.value);
      return { ok: true, key, schema, value: coerced.value, type: "as" };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * Snapshot current GSettings into plain portable props (no disk write).
   * @returns {{ settings: Object, keybindings: Object }}
   */
  buildPortableProps() {
    const settings = {
      $schema: this._schemaUrl("settings"),
      version: 1,
    };
    for (const category of SETTINGS_CATEGORIES) {
      settings[category] = {};
      this._exportSettingsCategory(settings, category);
    }

    const keybindings = {
      $schema: this._schemaUrl("keybindings"),
      version: 1,
      "mod-mask-mouse-tile": this._kbdSettings.get_string("mod-mask-mouse-tile"),
      bindings: {},
    };
    for (const key of KEYBINDING_KEYS) {
      keybindings.bindings[key] = this._kbdSettings.get_strv(key);
    }
    return { settings, keybindings };
  }

  /**
   * Apply portable props objects into GSettings (import style, no auto-export loop).
   * @param {Object|null} settingsProps
   * @param {Object|null} keybindingsProps
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  applyPortableProps(settingsProps, keybindingsProps) {
    try {
      this._importing = true;
      if (settingsProps) {
        for (const category of SETTINGS_CATEGORIES) {
          this._importSettingsCategory(settingsProps, category);
        }
      }
      if (keybindingsProps) {
        if (keybindingsProps["mod-mask-mouse-tile"] !== undefined) {
          this._kbdSettings.set_string(
            "mod-mask-mouse-tile",
            keybindingsProps["mod-mask-mouse-tile"]
          );
        }
        if (keybindingsProps.bindings) {
          for (const key of KEYBINDING_KEYS) {
            if (keybindingsProps.bindings[key] !== undefined) {
              const value = keybindingsProps.bindings[key];
              if (Array.isArray(value)) {
                this._kbdSettings.set_strv(key, value);
              }
            }
          }
        }
      }
      this._settings.set_uint64("config-last-import", Math.floor(Date.now() / 1000));
      if (this._importClearId) {
        GLib.source_remove(this._importClearId);
      }
      this._importClearId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._importing = false;
        this._importClearId = null;
        return GLib.SOURCE_REMOVE;
      });
      return { ok: true };
    } catch (e) {
      this._importing = false;
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * Save named profile under ~/.config/forge/profiles/<name>/
   * @param {string} name
   * @returns {{ ok: true, name: string, path: string } | { ok: false, error: string }}
   */
  saveNamedProfile(name) {
    try {
      const { settings, keybindings } = this.buildPortableProps();
      const result = this._configMgr.saveSettingsProfile(name, settings, keybindings);
      if (!result.ok) return result;
      return { ok: true, name: String(name).trim(), path: result.path };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * Load named profile into live GSettings.
   * @param {string} name
   * @returns {{ ok: true, name: string, path: string } | { ok: false, error: string }}
   */
  loadNamedProfile(name) {
    try {
      const loaded = this._configMgr.loadSettingsProfile(name);
      if (!loaded.ok) return loaded;
      const applied = this.applyPortableProps(loaded.settings, loaded.keybindings);
      if (!applied.ok) return applied;
      return { ok: true, name: String(name).trim(), path: loaded.path };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }
}
