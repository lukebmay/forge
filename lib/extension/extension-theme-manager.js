import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

import St from "gi://St";

import { ThemeManagerBase } from "../shared/theme.js";
import { Logger } from "../shared/logger.js";
import { PERMISSIONS_MODE } from "../shared/settings.js";
import { parse, stringify } from "../css/index.js";

/**
 * St.Theme does not reliably cascade two load_stylesheet() calls, and may not
 * honor later duplicate selectors in a single concatenated file either. Build
 * one effective sheet by overlaying user rules onto base (each selector once).
 */
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

  /**
   * Overlay user rule declarations onto a deep-ish copy of base AST.
   * Matching selectors get user decls (user property wins; other base decls kept).
   * User-only selectors are appended.
   * @param {object|null} baseAst
   * @param {object|null} userAst
   * @returns {object|null}
   */
  _mergeStylesheetAst(baseAst, userAst) {
    const baseRules = baseAst?.stylesheet?.rules;
    const userRules = userAst?.stylesheet?.rules;

    if (!baseRules?.length && !userRules?.length) return null;
    if (!baseRules?.length) return userAst;
    if (!userRules?.length) return baseAst;

    // selectorKey -> rule (mutable working copy from base)
    const bySel = new Map();
    const order = [];
    const other = []; // comments / non-rules from base

    for (const rule of baseRules) {
      if (rule.type !== "rule" || !rule.selectors?.length) {
        other.push(rule);
        continue;
      }
      const key = rule.selectors.join(",");
      // Shallow-clone rule + decls so we do not mutate baseCssAst.
      const clone = {
        ...rule,
        selectors: [...rule.selectors],
        declarations: (rule.declarations || []).map((d) => ({ ...d })),
      };
      bySel.set(key, clone);
      order.push(key);
    }

    for (const rule of userRules) {
      if (rule.type !== "rule" || !rule.selectors?.length) {
        other.push(rule);
        continue;
      }
      const key = rule.selectors.join(",");
      const userDecls = (rule.declarations || []).filter((d) => d.type === "declaration");
      if (!userDecls.length) continue;

      if (bySel.has(key)) {
        const target = bySel.get(key);
        const props = new Map();
        for (const d of target.declarations || []) {
          if (d.type === "declaration" && d.property) props.set(d.property, d);
        }
        for (const d of userDecls) {
          props.set(d.property, { ...d });
        }
        target.declarations = [...props.values()];
      } else {
        const clone = {
          ...rule,
          selectors: [...rule.selectors],
          declarations: userDecls.map((d) => ({ ...d })),
        };
        bySel.set(key, clone);
        order.push(key);
      }
    }

    return {
      type: "stylesheet",
      stylesheet: {
        rules: [...other, ...order.map((k) => bySel.get(k))],
      },
    };
  }

  /**
   * Write merged CSS to confDir/stylesheet/forge/effective.css.
   * @returns {Gio.File|null}
   */
  _buildEffectiveStylesheetFile() {
    const confDir = this.configMgr.confDir;
    const baseFile = this.configMgr.defaultStylesheetFile;
    const userFile = this.configMgr.stylesheetFile;

    // Prefer already-imported ASTs from _importCss(); re-read if needed.
    let baseAst = this.baseCssAst;
    let userAst = this.cssAst;

    // Empty seed user AST (prefs placeholder) is not real overrides — treat as none.
    const userIsSeed =
      userAst?.stylesheet?.rules &&
      !userAst.stylesheet.rules.some(
        (r) => r.type === "rule" && r.declarations?.some((d) => d.type === "declaration")
      );

    if (userIsSeed) userAst = null;

    const merged = this._mergeStylesheetAst(baseAst, userAst);
    if (!merged) {
      return userFile || baseFile;
    }

    let cssText;
    try {
      cssText = stringify(merged);
    } catch (e) {
      Logger.error(`theme: stringify merged stylesheet failed: ${e}`);
      // Fallback: concatenate (user last) — better than stock-only.
      return this._buildConcatEffectiveFile(baseFile, userFile);
    }

    if (!confDir) {
      return this._writeTempEffective(cssText) || userFile || baseFile;
    }

    const dirPath = GLib.build_filenamev([confDir, "stylesheet", "forge"]);
    const outPath = GLib.build_filenamev([dirPath, "effective.css"]);
    const outFile = Gio.File.new_for_path(outPath);
    const header =
      "/* forge effective stylesheet: base overlaid with user overrides (one rule per selector) */\n";

    try {
      if (GLib.mkdir_with_parents(dirPath, PERMISSIONS_MODE) !== 0) {
        Logger.error(`theme: could not create ${dirPath}`);
        return userFile || baseFile;
      }
      const [success] = outFile.replace_contents(
        header + cssText,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
      if (!success) {
        Logger.error(`theme: failed to write effective stylesheet ${outPath}`);
        return userFile || baseFile;
      }
      try {
        outFile.set_attribute_uint32("unix::mode", 0o644, Gio.FileQueryInfoFlags.NONE, null);
      } catch (_e) {
        // non-fatal
      }
      return outFile;
    } catch (e) {
      Logger.error(`theme: effective stylesheet write failed: ${e}`);
      return userFile || baseFile;
    }
  }

  /**
   * Concat fallback when AST merge fails.
   * @param {Gio.File|null} baseFile
   * @param {Gio.File|null} userFile
   * @returns {Gio.File|null}
   */
  _buildConcatEffectiveFile(baseFile, userFile) {
    const confDir = this.configMgr.confDir;
    if (!confDir) return userFile || baseFile;

    const dirPath = GLib.build_filenamev([confDir, "stylesheet", "forge"]);
    const outPath = GLib.build_filenamev([dirPath, "effective.css"]);
    const outFile = Gio.File.new_for_path(outPath);
    const decoder = new TextDecoder();
    const parts = ["/* forge effective (concat fallback) */\n"];

    for (const f of [baseFile, userFile]) {
      if (!f) continue;
      try {
        const [ok, contents] = f.load_contents(null);
        if (ok) parts.push(decoder.decode(contents), "\n");
      } catch (_e) {
        // skip
      }
    }

    try {
      GLib.mkdir_with_parents(dirPath, PERMISSIONS_MODE);
      outFile.replace_contents(
        parts.join("\n"),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
      return outFile;
    } catch (_e) {
      return userFile || baseFile;
    }
  }

  /**
   * @param {string} cssText
   * @returns {Gio.File|null}
   */
  _writeTempEffective(cssText) {
    try {
      const outPath = GLib.build_filenamev([GLib.get_user_runtime_dir(), "forge-effective.css"]);
      const outFile = Gio.File.new_for_path(outPath);
      outFile.replace_contents(cssText, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
      return outFile;
    } catch (_e) {
      return null;
    }
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
      // Drop anything we previously loaded, plus known dual-load paths.
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

      const effective = this._buildEffectiveStylesheetFile();
      const loaded = [];
      if (effective) {
        theme.load_stylesheet(effective);
        loaded.push(effective);
        // Belt: if Shell or a prior path left the bundled sheet loaded, drop it
        // so stock red cannot sit on top of the effective sheet.
        if (defaultStylesheetFile) {
          try {
            theme.unload_stylesheet(defaultStylesheetFile);
          } catch (_e) {
            // ignore
          }
        }
        const userPath = stylesheetFile?.get_path?.() ?? "(none)";
        Logger.info(`stylesheet: effective overlay (user=${userPath})`);
      } else {
        Logger.warn("stylesheet: no base or user sheet to load");
      }

      this.stylesheets = loaded;
      this.stylesheet = loaded.length > 0 ? loaded[loaded.length - 1] : null;
    } catch (e) {
      Logger.error(`${uuid} - ${e}`);
      return;
    }
  }

  /**
   * Unload every stylesheet reloadStylesheet() loaded, so disable()
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
