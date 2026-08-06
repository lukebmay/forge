import GObject from "gi://GObject";

import St from "gi://St";

import { ThemeManagerBase } from "../shared/theme.js";
import { Logger } from "../shared/logger.js";

export class ExtensionThemeManager extends ThemeManagerBase {
  static {
    GObject.registerClass(this);
  }

  /**
   * @param {import("../../extension.js").default} extension
   */
  constructor(extension) {
    super(extension);
    this.metadata = extension.metadata;
  }

  reloadStylesheet() {
    const uuid = this.metadata.uuid;
    // Re-parse from disk so Super+Shift+r / css-updated pick up edits without
    // a full shell restart (prefs and restore-theme write the user file).
    this._importCss();
    const stylesheetFile = this.configMgr.stylesheetFile;
    const defaultStylesheetFile = this.configMgr.defaultStylesheetFile;
    let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

    try {
      // Drop anything we previously loaded, plus known paths (defensive).
      const previous = this.stylesheets || (this.stylesheet ? [this.stylesheet] : []);
      for (const sheet of previous) {
        if (sheet) theme.unload_stylesheet(sheet);
      }
      if (defaultStylesheetFile && !previous.includes(defaultStylesheetFile)) {
        theme.unload_stylesheet(defaultStylesheetFile);
      }
      if (stylesheetFile && !previous.includes(stylesheetFile)) {
        theme.unload_stylesheet(stylesheetFile);
      }

      // Base first, then user overrides (cascade: user wins). Load each in its
      // own try so a bad user sheet cannot leave us with base-only silent fail
      // (looks like "install wiped my colors" when only bundled red applies).
      const loaded = [];
      if (defaultStylesheetFile) {
        try {
          theme.load_stylesheet(defaultStylesheetFile);
          loaded.push(defaultStylesheetFile);
        } catch (e) {
          Logger.error(`${uuid} - failed to load base stylesheet: ${e}`);
        }
      }
      if (stylesheetFile) {
        try {
          theme.load_stylesheet(stylesheetFile);
          loaded.push(stylesheetFile);
          Logger.info(
            `stylesheet: base+user dual-load (user=${stylesheetFile.get_path?.() ?? "?"})`
          );
        } catch (e) {
          Logger.error(
            `${uuid} - failed to load user stylesheet ${stylesheetFile.get_path?.()}: ${e}`
          );
        }
      } else {
        Logger.warn("stylesheet: no user overrides file; bundled base only");
      }
      this.stylesheets = loaded;
      // Last sheet for legacy single-handle readers.
      this.stylesheet = loaded.length > 0 ? loaded[loaded.length - 1] : null;
    } catch (e) {
      Logger.error(`${uuid} - ${e}`);
      return;
    }
  }

  /**
   * Unload every stylesheet reloadStylesheet() loaded (base + user), so disable()
   * doesn't leak theme state (forge-wwn8).
   */
  unloadStylesheet() {
    const sheets = this.stylesheets || (this.stylesheet ? [this.stylesheet] : []);
    if (sheets.length === 0) return;
    const uuid = this.metadata.uuid;
    try {
      let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
      for (const sheet of sheets) {
        if (sheet) theme.unload_stylesheet(sheet);
      }
      this.stylesheets = [];
      this.stylesheet = null;
    } catch (e) {
      Logger.error(`${uuid} - ${e}`);
    }
  }
}
