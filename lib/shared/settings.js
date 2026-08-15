/*
 * This file is part of the Forge Window Manager extension for Gnome 3
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

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

import { Logger } from "./logger.js";
import { isReservedKitName, sanitizeProfileName } from "./keybind-presets.js";
import { forgeConfigHome } from "./forge-config-home.js";

// Dev or Prod mode, see Makefile:debug
export const production = true;

// File permission mode for creating config directories and files
export const PERMISSIONS_MODE = 0o744;

export class ConfigManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  constructor({ dir }) {
    super();
    this.extensionPath = dir.get_path();
  }

  /** Forge config root (~/.config/forge, or FORGE_CONFIG_HOME when nest-isolated). */
  get confDir() {
    return forgeConfigHome();
  }

  get defaultStylesheetFile() {
    const defaultStylesheet = GLib.build_filenamev([this.extensionPath, `stylesheet.css`]);

    Logger.trace(`default-stylesheet: ${defaultStylesheet}`);

    const defaultStylesheetFile = Gio.File.new_for_path(defaultStylesheet);
    if (defaultStylesheetFile.query_exists(null)) {
      return defaultStylesheetFile;
    }
    return null;
  }

  get stylesheetFile() {
    const profileSettingPath = `${this.confDir}/stylesheet/forge`;
    const settingFile = "stylesheet.css";
    // Dual-load: bundled stylesheet is always the base. Never seed a full default
    // copy into the user path (that fork was clobbered on cssTag bumps).
    return this.loadFile(profileSettingPath, settingFile, null, {
      seedContents: "/* forge user overrides */\n",
      returnIfCreated: true,
    });
  }

  get defaultWindowConfigFile() {
    const defaultWindowConfig = GLib.build_filenamev([
      this.extensionPath,
      `config`,
      `windows.json`,
    ]);

    Logger.trace(`default-window-config: ${defaultWindowConfig}`);
    const defaultWindowConfigFile = Gio.File.new_for_path(defaultWindowConfig);

    if (defaultWindowConfigFile.query_exists(null)) {
      return defaultWindowConfigFile;
    }
    return null;
  }

  loadDefaultWindowConfigContents() {
    // forge-96e (#515): route through the guarded loader (no unguarded
    // JSON.parse) and always hand back an overrides-safe shape — the prefs
    // "Reset" button derefs .overrides on the result.
    return (
      this._loadJsonConfig(this.defaultWindowConfigFile, "default window config") ?? {
        overrides: [],
      }
    );
  }

  get windowConfigFile() {
    const profileSettingPath = `${this.confDir}/config`;
    const settingFile = "windows.json";
    const defaultSettingFile = this.defaultWindowConfigFile;
    return this.loadFile(profileSettingPath, settingFile, defaultSettingFile);
  }

  /**
   * @param {string} path - directory for the profile file
   * @param {string} file - basename
   * @param {Gio.File|null} defaultFile - if present, seed full contents from this file
   * @param {{ seedContents?: string, returnIfCreated?: boolean }} [options]
   *   seedContents: when defaultFile is null, write this instead (stylesheet overrides)
   *   returnIfCreated: return the Gio.File after a successful seed (default false keeps
   *   windows.json first-run null-then-exists behavior)
   */
  loadFile(path, file, defaultFile, options = {}) {
    const customSetting = GLib.build_filenamev([path, file]);
    Logger.trace(`custom-setting-file: ${customSetting}`);

    const customSettingFile = Gio.File.new_for_path(customSetting);
    if (customSettingFile.query_exists(null)) {
      return customSettingFile;
    } else {
      // First run: seed the profile copy. Every GIO call here throws on failure
      // (mkdir on a racing/readonly path, create() losing a race with prefs, a
      // missing bundled default) — never let it escape (windowProps / stylesheet).
      try {
        const profileCustomSettingDir = Gio.File.new_for_path(path);
        if (!profileCustomSettingDir.query_exists(null)) {
          if (!profileCustomSettingDir.make_directory_with_parents(null)) {
            return null;
          }
        }
        // Dir may already exist with no file yet (stylesheet seed path).
        if (!customSettingFile.query_exists(null)) {
          let contents;
          if (options.seedContents !== undefined) {
            contents = options.seedContents;
          } else if (defaultFile) {
            contents = this.loadFileContents(defaultFile);
          }
          Logger.trace(contents);
          if (contents !== undefined) {
            const createdStream = customSettingFile.create(Gio.FileCreateFlags.NONE, null);
            createdStream.write_all(contents, null);
            if (options.returnIfCreated) {
              return customSettingFile;
            }
          }
        } else if (options.returnIfCreated) {
          return customSettingFile;
        }
      } catch (e) {
        Logger.error(`Failed to seed ${file} from defaults: ${e}`);
      }
    }

    return null;
  }

  loadFileContents(configFile) {
    let [success, contents] = configFile.load_contents(null);
    if (success) {
      const stringContents = new TextDecoder().decode(contents);
      return stringContents;
    }
  }

  /**
   * Load and parse JSON from a config file
   * @param {Gio.File|null} configFile - The config file to load
   * @param {string} configName - Name for error messages
   * @returns {Object|null} Parsed JSON object or null
   */
  _loadJsonConfig(configFile, configName) {
    if (!configFile) {
      return null;
    }

    try {
      let [success, contents] = configFile.load_contents(null);
      if (success) {
        const stringContents = new TextDecoder().decode(contents);
        if (stringContents && stringContents.trim().length > 0) {
          return JSON.parse(stringContents);
        } else {
          Logger.warn(`${configName} is empty`);
        }
      }
    } catch (e) {
      Logger.error(`Failed to parse ${configName}: ${e}`);
    }
    return null;
  }

  /**
   * Save JSON to a config file
   * @param {Gio.File} configFile - The config file to save to
   * @param {Object} props - The object to serialize
   * @param {string} configName - Name for log messages
   * @param {number} [indent=2] - JSON indentation
   */
  _saveJsonConfig(configFile, props, configName, indent = 2) {
    const contents = JSON.stringify(props, null, indent);
    const parentPath = configFile.get_parent().get_path();

    if (GLib.mkdir_with_parents(parentPath, PERMISSIONS_MODE) === 0) {
      try {
        configFile.replace_contents(
          contents,
          null,
          false,
          Gio.FileCreateFlags.REPLACE_DESTINATION,
          null
        );
        Logger.trace(`Saved ${configName} to ${configFile.get_path()}`);
      } catch (e) {
        Logger.error(`Failed to save ${configName}: ${e}`);
      }
    }
  }

  get windowProps() {
    // forge-96e (#515): the bundled default (config/windows.json) is already the
    // `||` fallback, so the {overrides:[]} default below only fires when BOTH the
    // user file and the bundled default are unreadable/corrupt. Coalesce on the
    // RESULT so callers never deref `.overrides` on null/{}/an array and crash.
    const props = this._loadJsonConfig(
      this.windowConfigFile || this.defaultWindowConfigFile,
      "window config"
    );
    if (props && Array.isArray(props.overrides)) return props;
    return { overrides: [] };
  }

  get windowConfigPath() {
    return this._getConfigPath("windows.json");
  }

  set windowProps(props) {
    // forge-3sv2: always write to the user config path (like settingsProps /
    // keybindingsProps). The old fallback to defaultWindowConfigFile targeted the
    // read-only bundled install file, so the first override on a fresh profile was
    // silently lost. _saveJsonConfig creates the file if it does not exist yet.
    this._saveJsonConfig(this.windowConfigPath, props, "window config", 4);
  }

  // ==================== Session layout (install/update survival) ====================
  // Ephemeral topology across disable→enable. Not a user-edited profile.

  get sessionLayoutConfigPath() {
    return this._getConfigPath("session-layout.json");
  }

  get sessionLayoutConfigFile() {
    return this._getConfigFile("session-layout.json");
  }

  /**
   * @param {Object} envelope - from session-layout.makeEnvelope
   */
  saveSessionLayout(envelope) {
    if (!envelope) return;
    this._saveJsonConfig(this.sessionLayoutConfigPath, envelope, "session layout");
  }

  /**
   * @returns {Object|null}
   */
  loadSessionLayout() {
    return this._loadJsonConfig(this.sessionLayoutConfigFile, "session layout");
  }

  clearSessionLayout() {
    const file = this.sessionLayoutConfigPath;
    try {
      if (file.query_exists(null)) file.delete(null);
    } catch (e) {
      Logger.warn(`Failed to clear session layout: ${e}`);
    }
  }

  // ==================== Config File Helpers ====================

  /**
   * Get a config file if it exists, or null
   * @param {string} fileName - Config file name (e.g., "settings.json")
   * @returns {Gio.File|null}
   */
  _getConfigFile(fileName) {
    const filePath = GLib.build_filenamev([`${this.confDir}/config`, fileName]);
    const file = Gio.File.new_for_path(filePath);
    return file.query_exists(null) ? file : null;
  }

  /**
   * Get the path where a config file should be written
   * @param {string} fileName - Config file name (e.g., "settings.json")
   * @returns {Gio.File}
   */
  _getConfigPath(fileName) {
    return Gio.File.new_for_path(GLib.build_filenamev([`${this.confDir}/config`, fileName]));
  }

  // ==================== Settings Config ====================

  get settingsConfigFile() {
    return this._getConfigFile("settings.json");
  }

  get settingsConfigPath() {
    return this._getConfigPath("settings.json");
  }

  get settingsProps() {
    return this._loadJsonConfig(this.settingsConfigFile, "settings.json");
  }

  set settingsProps(props) {
    this._saveJsonConfig(this.settingsConfigPath, props, "settings.json");
  }

  // ==================== Keybindings Config ====================

  get keybindingsConfigFile() {
    return this._getConfigFile("keybindings.json");
  }

  get keybindingsConfigPath() {
    return this._getConfigPath("keybindings.json");
  }

  /**
   * On-disk modification time of a portable config file as a comparable number
   * (microseconds since epoch), or null if the file is absent / cannot be
   * stat'd. ConfigSync uses this to detect out-of-band writes before its
   * debounced auto-export, so it won't clobber a prefs Export/Import or a hand
   * edit (forge-nn0m).
   * @param {"settings"|"keybindings"} name
   * @returns {number|null}
   */
  getConfigMtime(name) {
    const file = name === "settings" ? this.settingsConfigFile : this.keybindingsConfigFile;
    if (!file) return null;
    try {
      const info = file.query_info(
        "time::modified,time::modified-usec",
        Gio.FileQueryInfoFlags.NONE,
        null
      );
      const sec = info.get_attribute_uint64("time::modified");
      const usec = info.get_attribute_uint32("time::modified-usec");
      return sec * 1000000 + usec;
    } catch (e) {
      return null;
    }
  }

  get keybindingsProps() {
    return this._loadJsonConfig(this.keybindingsConfigFile, "keybindings.json");
  }

  set keybindingsProps(props) {
    this._saveJsonConfig(this.keybindingsConfigPath, props, "keybindings.json");
  }

  /**
   * Check if portable config files exist
   * @returns {boolean}
   */
  hasPortableConfig() {
    return this.settingsConfigFile !== null || this.keybindingsConfigFile !== null;
  }

  // ==================== Keybinding Profiles ====================

  /**
   * Named profiles dir. FORGE_KEYBIND_PROFILES_DIR overrides XDG default
   * (~/.config/forge/config/keybinding-profiles). Empty env is ignored.
   */
  get keybindingProfilesDir() {
    const env = GLib.getenv("FORGE_KEYBIND_PROFILES_DIR");
    if (env != null) {
      const trimmed = env.trim();
      if (trimmed) return trimmed;
    }
    return `${this.confDir}/config/keybinding-profiles`;
  }

  /**
   * @returns {string[]} profile name stems (no .json)
   */
  listKeybindingProfiles() {
    const dir = Gio.File.new_for_path(this.keybindingProfilesDir);
    if (!dir.query_exists(null)) return [];

    const names = [];
    try {
      const enumerator = dir.enumerate_children(
        "standard::name,standard::type",
        Gio.FileQueryInfoFlags.NONE,
        null
      );
      let info;
      while ((info = enumerator.next_file(null)) !== null) {
        if (info.get_file_type() !== Gio.FileType.REGULAR) continue;
        const fileName = info.get_name();
        if (!fileName.endsWith(".json")) continue;
        const stem = sanitizeProfileName(fileName.slice(0, -".json".length));
        if (stem && !isReservedKitName(stem)) names.push(stem);
      }
      enumerator.close(null);
    } catch (e) {
      Logger.error(`Failed to list keybinding profiles: ${e}`);
    }
    return names.sort();
  }

  /**
   * @param {string} name
   * @param {Object} props - same shape as keybindings.json
   * @returns {boolean}
   */
  saveKeybindingProfile(name, props) {
    const safe = sanitizeProfileName(name);
    if (!safe || !props) return false;
    if (isReservedKitName(safe)) return false;

    // Ensure stem in JSON matches filename (CLI does the same).
    const toWrite = { ...props, name: safe };
    const path = GLib.build_filenamev([this.keybindingProfilesDir, `${safe}.json`]);
    const file = Gio.File.new_for_path(path);
    try {
      // Trailing newline matches `forge keybind save` (json.dumps + "\n").
      const contents = `${JSON.stringify(toWrite, null, 2)}\n`;
      const parentPath = file.get_parent().get_path();
      if (GLib.mkdir_with_parents(parentPath, PERMISSIONS_MODE) !== 0) {
        return false;
      }
      file.replace_contents(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
      Logger.trace(`Saved keybinding profile ${safe} to ${path}`);
      return file.query_exists(null);
    } catch (e) {
      Logger.error(`Failed to save keybinding profile ${safe}: ${e}`);
      return false;
    }
  }

  /**
   * @param {string} name
   * @returns {Object|null}
   */
  loadKeybindingProfile(name) {
    const safe = sanitizeProfileName(name);
    if (!safe) return null;

    const path = GLib.build_filenamev([this.keybindingProfilesDir, `${safe}.json`]);
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null)) return null;
    return this._loadJsonConfig(file, `keybinding profile ${safe}`);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  deleteKeybindingProfile(name) {
    const safe = sanitizeProfileName(name);
    if (!safe) return false;

    const path = GLib.build_filenamev([this.keybindingProfilesDir, `${safe}.json`]);
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null)) return false;
    try {
      return file.delete(null);
    } catch (e) {
      Logger.error(`Failed to delete keybinding profile ${safe}: ${e}`);
      return false;
    }
  }

  // ==================== Settings profiles (FC3) ====================
  // Named snapshots: ~/.config/forge/profiles/<name>/{settings,keybindings}.json

  get settingsProfilesDir() {
    return `${this.confDir}/profiles`;
  }

  /**
   * @param {string} name
   * @returns {string|null} absolute dir path, or null if name invalid
   */
  settingsProfileDir(name) {
    const safe = sanitizeProfileName(name);
    if (!safe) return null;
    return GLib.build_filenamev([this.settingsProfilesDir, safe]);
  }

  /**
   * Write portable settings + keybindings JSON into a named profile dir.
   * @param {string} name
   * @param {Object} settingsProps
   * @param {Object} keybindingsProps
   * @returns {{ ok: true, path: string } | { ok: false, error: string }}
   */
  saveSettingsProfile(name, settingsProps, keybindingsProps) {
    const dirPath = this.settingsProfileDir(name);
    if (!dirPath) {
      return { ok: false, error: "invalid profile name (use A-Za-z0-9_-)" };
    }
    if (!settingsProps || !keybindingsProps) {
      return { ok: false, error: "missing settings or keybindings props" };
    }
    try {
      if (GLib.mkdir_with_parents(dirPath, PERMISSIONS_MODE) !== 0) {
        return { ok: false, error: `cannot create profile dir: ${dirPath}` };
      }
      const settingsFile = Gio.File.new_for_path(GLib.build_filenamev([dirPath, "settings.json"]));
      const kbdFile = Gio.File.new_for_path(GLib.build_filenamev([dirPath, "keybindings.json"]));
      this._saveJsonConfig(settingsFile, settingsProps, `profile ${name} settings`);
      this._saveJsonConfig(kbdFile, keybindingsProps, `profile ${name} keybindings`);
      if (!settingsFile.query_exists(null) || !kbdFile.query_exists(null)) {
        return { ok: false, error: "profile write failed" };
      }
      return { ok: true, path: dirPath };
    } catch (e) {
      Logger.error(`Failed to save settings profile ${name}: ${e}`);
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * Load portable settings + keybindings from a named profile dir.
   * @param {string} name
   * @returns {{ ok: true, settings: Object, keybindings: Object, path: string } | { ok: false, error: string }}
   */
  loadSettingsProfile(name) {
    const dirPath = this.settingsProfileDir(name);
    if (!dirPath) {
      return { ok: false, error: "invalid profile name (use A-Za-z0-9_-)" };
    }
    const dir = Gio.File.new_for_path(dirPath);
    if (!dir.query_exists(null)) {
      return { ok: false, error: `profile not found: ${name}` };
    }
    const settingsFile = Gio.File.new_for_path(GLib.build_filenamev([dirPath, "settings.json"]));
    const kbdFile = Gio.File.new_for_path(GLib.build_filenamev([dirPath, "keybindings.json"]));
    if (!settingsFile.query_exists(null) && !kbdFile.query_exists(null)) {
      return { ok: false, error: `profile empty or missing files: ${name}` };
    }
    const settings = this._loadJsonConfig(settingsFile, `profile ${name} settings`);
    const keybindings = this._loadJsonConfig(kbdFile, `profile ${name} keybindings`);
    if (!settings && !keybindings) {
      return { ok: false, error: `failed to parse profile: ${name}` };
    }
    return {
      ok: true,
      settings: settings ?? null,
      keybindings: keybindings ?? null,
      path: dirPath,
    };
  }
}
