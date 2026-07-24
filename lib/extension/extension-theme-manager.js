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
    // Prefer ~/.config/forge stylesheet even when make dev sets production=false.
    // production only gates logging / DEV banner — not user theme colors.
    const sheet = stylesheetFile || defaultStylesheetFile;
    let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

    try {
      if (defaultStylesheetFile) theme.unload_stylesheet(defaultStylesheetFile);
      if (stylesheetFile) theme.unload_stylesheet(stylesheetFile);
      if (sheet) {
        theme.load_stylesheet(sheet);
        this.stylesheet = sheet;
      }
    } catch (e) {
      Logger.error(`${uuid} - ${e}`);
      return;
    }
  }

  /**
   * Unload the stylesheet that reloadStylesheet() loaded, so disable() doesn't
   * leak theme state (forge-wwn8).
   */
  unloadStylesheet() {
    if (!this.stylesheet) return;
    const uuid = this.metadata.uuid;
    try {
      let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
      theme.unload_stylesheet(this.stylesheet);
      this.stylesheet = null;
    } catch (e) {
      Logger.error(`${uuid} - ${e}`);
    }
  }
}
