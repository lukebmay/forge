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

// Gnome imports
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

// Application imports
import { stringify, parse } from "../css/index.js";
import { PERMISSIONS_MODE } from "./settings.js";
import { Logger } from "./logger.js";

export class ThemeManagerBase extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  constructor({ configMgr, settings }) {
    super();
    this.configMgr = configMgr;
    this.settings = settings;
    this._importCss();
    this.defaultPalette = this.getDefaultPalette();

    // CSS version tag - increment when default stylesheet changes require user config update.
    this.cssTag = 38;

    // patchCss() is intentionally not called in constructor - it's triggered
    // by settings changes or explicitly called when CSS updates are detected.
  }

  /**
   * @param {string} value
   */
  addPx(value) {
    return `${value}px`;
  }

  /**
   * @param {string} value
   */
  removePx(value) {
    // A user stylesheet missing a rule yields undefined here (getCssProperty
    // returns {}); guard so getDefaults() doesn't throw and abort enable() (forge-lid6).
    return typeof value === "string" ? value.replace("px", "") : value;
  }

  getDefaultPalette() {
    return {
      tiled: this.getDefaults("tiled"),
      split: this.getDefaults("split"),
      floated: this.getDefaults("floated"),
      stacked: this.getDefaults("stacked"),
      tabbed: this.getDefaults("tabbed"),
    };
  }

  /**
   * The scheme name is in between the CSS selector name
   * E.g. window-tiled-color should return `tiled`
   * @param {string} selector
   */
  getColorSchemeBySelector(selector) {
    const parts = selector.split("-");
    return parts.length >= 3 ? parts[1] : null;
  }

  /**
   * @param {string} color
   */
  getDefaults(color) {
    return {
      color: this.getCssProperty(`.${color}`, "color").value,
      "border-width": this.removePx(this.getCssProperty(`.${color}`, "border-width").value),
      opacity: this.getCssProperty(`.${color}`, "opacity").value,
    };
  }

  /**
   * @param {object|null|undefined} ast
   * @param {string} selector
   */
  _getCssRuleFromAst(ast, selector) {
    if (!ast?.stylesheet?.rules) return {};
    // First match only; Forge class names should be unique.
    const matchRules = ast.stylesheet.rules.filter(
      (r) => r.selectors && r.selectors.filter((s) => s === selector).length > 0
    );
    return matchRules.length > 0 ? matchRules[0] : {};
  }

  /**
   * @param {object|null|undefined} ast
   * @param {string} selector
   * @param {string} propertyName
   */
  _getCssPropertyFromAst(ast, selector, propertyName) {
    const cssRule = this._getCssRuleFromAst(ast, selector);
    // Check both cssRule and declarations exist (#448)
    if (cssRule && cssRule.declarations) {
      const matchDeclarations = cssRule.declarations.filter((d) => d.property === propertyName);
      return matchDeclarations.length > 0 ? matchDeclarations[0] : {};
    }
    return {};
  }

  /**
   * User-file rule if present, else base. Property-level reads use getCssProperty.
   * @param {any} selector
   */
  getCssRule(selector) {
    const userRule = this._getCssRuleFromAst(this.cssAst, selector);
    if (userRule && userRule.declarations) return userRule;
    return this._getCssRuleFromAst(this.baseCssAst, selector);
  }

  /**
   * Effective property: user override if present, else bundled base.
   * @param {string} selector
   * @param {string} propertyName
   */
  getCssProperty(selector, propertyName) {
    const fromUser = this._getCssPropertyFromAst(this.cssAst, selector, propertyName);
    if (fromUser && fromUser.value !== undefined) return fromUser;
    return this._getCssPropertyFromAst(this.baseCssAst, selector, propertyName);
  }

  /**
   * Ensure selector+property exist on the user AST and set value (never mutates base).
   * @param {string} selector
   * @param {string} propertyName
   * @param {string} propertyValue
   */
  _setUserCssProperty(selector, propertyName, propertyValue) {
    if (!this.cssAst?.stylesheet) {
      this.cssAst = parse("/* forge user overrides */\n", { silent: true });
    }
    let rule = this._getCssRuleFromAst(this.cssAst, selector);
    if (!rule || !rule.declarations) {
      rule = {
        type: "rule",
        selectors: [selector],
        declarations: [],
      };
      this.cssAst.stylesheet.rules.push(rule);
    }
    const existing = rule.declarations.filter((d) => d.property === propertyName);
    if (existing.length > 0) {
      existing[0].value = propertyValue;
    } else {
      rule.declarations.push({
        type: "declaration",
        property: propertyName,
        value: propertyValue,
      });
    }
  }

  /**
   * Remove a property from the user AST only. Drops empty rules. Does not write.
   * @param {string} selector
   * @param {string} propertyName
   * @returns {boolean} true if the user AST changed
   */
  _removeUserCssProperty(selector, propertyName) {
    if (!this.cssAst?.stylesheet?.rules) return false;

    let changed = false;
    const next = [];
    for (const rule of this.cssAst.stylesheet.rules) {
      if (rule.type !== "rule" || !rule.selectors || !rule.declarations) {
        next.push(rule);
        continue;
      }
      if (!rule.selectors.includes(selector)) {
        next.push(rule);
        continue;
      }

      const kept = rule.declarations.filter((d) => {
        if (d.type === "declaration" && d.property === propertyName) {
          changed = true;
          return false;
        }
        return true;
      });

      const hasDecl = kept.some((d) => d.type === "declaration");
      if (!hasDecl) {
        // Drop rule with no remaining declarations (comments-only inside rule too).
        changed = true;
        continue;
      }
      if (kept.length !== rule.declarations.length) {
        rule.declarations = kept;
      }
      next.push(rule);
    }

    if (changed) {
      this.cssAst.stylesheet.rules = next;
    }
    return changed;
  }

  /**
   * Drop user declarations identical to bundled base; drop empty rules.
   * Leaves comment nodes and user-only deltas. No write.
   * @returns {boolean} true if the user AST changed
   */
  _stripIdenticalToBase() {
    if (!this.cssAst?.stylesheet?.rules || !this.baseCssAst) return false;

    let changed = false;
    const next = [];
    for (const rule of this.cssAst.stylesheet.rules) {
      if (rule.type !== "rule" || !rule.selectors?.length || !rule.declarations) {
        next.push(rule);
        continue;
      }

      const kept = [];
      for (const d of rule.declarations) {
        if (d.type !== "declaration") {
          kept.push(d);
          continue;
        }
        const matchesBase = rule.selectors.every((sel) => {
          const base = this._getCssPropertyFromAst(this.baseCssAst, sel, d.property);
          return base.value !== undefined && base.value === d.value;
        });
        if (matchesBase) {
          changed = true;
          continue;
        }
        kept.push(d);
      }

      const hasDecl = kept.some((d) => d.type === "declaration");
      if (!hasDecl) {
        changed = true;
        continue;
      }
      if (kept.length !== rule.declarations.length) {
        rule.declarations = kept;
        changed = true;
      }
      next.push(rule);
    }

    if (changed) {
      this.cssAst.stylesheet.rules = next;
    }
    return changed;
  }

  /**
   * Remove a user override so the bundled base cascade shows.
   * @param {string} selector
   * @param {string} propertyName
   * @returns {boolean} true if a user declaration was removed (and file updated)
   */
  removeCssProperty(selector, propertyName) {
    const removed = this._removeUserCssProperty(selector, propertyName);
    if (removed) {
      this._updateCss();
    }
    return removed;
  }

  /**
   * @param {string} selector
   * @param {string} propertyName
   * @param {string} propertyValue
   */
  setCssProperty(selector, propertyName, propertyValue) {
    const baseProp = this._getCssPropertyFromAst(this.baseCssAst, selector, propertyName);
    const userProp = this._getCssPropertyFromAst(this.cssAst, selector, propertyName);
    const effective =
      userProp && userProp.value !== undefined
        ? userProp
        : baseProp && baseProp.value !== undefined
        ? baseProp
        : null;

    // Bug #312: only set properties that exist on user or base (Appearance schemes).
    if (!effective || effective.value === undefined) {
      return false;
    }

    // Setting the base value clears any user override so cascade shows defaults.
    if (baseProp && baseProp.value !== undefined && propertyValue === baseProp.value) {
      if (userProp && userProp.value !== undefined) {
        this._removeUserCssProperty(selector, propertyName);
        this._updateCss();
      }
      return true;
    }

    // Idempotent: user already holds this override.
    if (userProp && userProp.value === propertyValue) {
      return true;
    }

    // Persist on the user AST only (base is read-only). Color-only files get
    // the rule/decl added so Appearance works without a full fork.
    this._setUserCssProperty(selector, propertyName, propertyValue);
    this._updateCss();
    return true;
  }

  /**
   * Writable user overrides file only (never the bundled install sheet).
   */
  _getUserStylesheetFile() {
    return this.configMgr.stylesheetFile;
  }

  /**
   * @deprecated Prefer dual-load (base + user). Kept for call sites that need a
   * single path; returns user file when present else bundled default.
   */
  _getStylesheetFile() {
    return this.configMgr.stylesheetFile || this.configMgr.defaultStylesheetFile;
  }

  /**
   * Load bundled base AST + user overrides AST (prefs write the latter only).
   */
  _importCss() {
    this.baseCssAst = null;
    this.cssAst = null;

    const def = this.configMgr.defaultStylesheetFile;
    if (def) {
      try {
        const [ok, defContents] = def.load_contents(null);
        if (ok) {
          this.baseCssAst = parse(new TextDecoder().decode(defContents), { silent: true });
        }
      } catch (e) {
        Logger.error(`Failed to parse bundled stylesheet: ${e}`);
      }
    }

    const userFile = this.configMgr.stylesheetFile;
    if (userFile) {
      try {
        const [success, contents] = userFile.load_contents(null);
        if (success) {
          // silent: malformed USER sheet yields partial AST instead of aborting enable (forge-lid6).
          this.cssAst = parse(new TextDecoder().decode(contents), { silent: true });
        }
      } catch (e) {
        Logger.error(`Failed to parse user stylesheet: ${e}`);
      }
    }

    // Writable AST for Appearance / setCssProperty when no user file yet.
    if (!this.cssAst) {
      this.cssAst = parse("/* forge user overrides */\n", { silent: true });
    }
  }

  /**
   * Ensures a stylesheet file is user-writable. Gio.copy() preserves the source's
   * permission mode, so a config stylesheet copied from the read-only install dir
   * (~0444) would otherwise reject replace_contents() silently and colors would never
   * persist. Bug #312 (forge-9sd). Only succeeds for files the user owns (always true
   * under ~/.config), so it is safe to call defensively before every write.
   * @param {Gio.File} file
   */
  _ensureWritable(file) {
    try {
      file.set_attribute_uint32("unix::mode", 0o644, Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
      Logger.error(`theme: could not make ${file.get_path?.()} writable: ${e}`);
    }
  }

  /**
   * Writes the user overrides AST to ~/.config/.../stylesheet.css and reloads.
   * Never writes the bundled install sheet. Strips declarations identical to base
   * so full-fork user files shrink toward deltas on every write.
   */
  _updateCss() {
    if (!this.cssAst) {
      return;
    }

    let cssFile = this._getUserStylesheetFile();
    // forge-0h9k: null when ~/.config/forge is unwritable and seeding failed.
    if (!cssFile) {
      Logger.error("theme: no writable user stylesheet path");
      return;
    }

    this._stripIdenticalToBase();
    const cssContents = stringify(this.cssAst);

    if (GLib.mkdir_with_parents(cssFile.get_parent().get_path(), PERMISSIONS_MODE) === 0) {
      this._ensureWritable(cssFile);
      let [success, _tag] = cssFile.replace_contents(
        cssContents,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
      if (success) {
        this.reloadStylesheet();
      } else {
        Logger.error(`theme: failed to write stylesheet ${cssFile.get_path?.()}`);
      }
    }
  }

  /**
   * Optional selector renames in the user file when cssTag advances.
   * C0: empty map (no-op). Future tags may list old → new selectors.
   * @returns {Record<string, string>}
   */
  _cssRenameMap() {
    return {};
  }

  /**
   * Apply rename map to the in-memory user AST and persist if anything changed.
   * Does not touch the bundled base file.
   */
  _applyCssRenameMigrations() {
    const renames = this._cssRenameMap();
    const entries = Object.entries(renames);
    if (entries.length === 0 || !this.cssAst?.stylesheet?.rules) return false;

    let changed = false;
    for (const rule of this.cssAst.stylesheet.rules) {
      if (!rule.selectors) continue;
      rule.selectors = rule.selectors.map((s) => {
        if (renames[s] !== undefined) {
          changed = true;
          return renames[s];
        }
        return s;
      });
    }
    if (changed) {
      this._updateCss();
    }
    return changed;
  }

  /**
   * On cssTag mismatch: stamp css-last-update and optionally rename selectors.
   * Never overwrites the user stylesheet with bundled defaults (dual-load base+user).
   */
  patchCss() {
    if (!this._needUpdate()) {
      return false;
    }

    // Ensure user path exists (minimal seed if missing). Null if unwritable —
    // leave css-last-update unset so we retry on a later launch (forge-0h9k).
    const configCss = this.configMgr.stylesheetFile;
    if (!configCss) return false;

    try {
      // Re-import so rename migrations see current disk contents.
      this._importCss();
      this._applyCssRenameMigrations();
    } catch (e) {
      Logger.error(`theme: patchCss migration failed: ${e}`);
      return false;
    }

    this.settings.set_uint("css-last-update", this.cssTag);
    return true;
  }

  /**
   * Credits: ExtensionSystem.js:_callExtensionEnable()
   */
  reloadStylesheet() {
    throw new Error("Must implement reloadStylesheet");
  }

  _needUpdate() {
    let cssTag = this.cssTag;
    return this.settings.get_uint("css-last-update") !== cssTag;
  }
}

/**
 * Credits: Color Space conversion functions from CSS Tricks
 * https://css-tricks.com/converting-color-spaces-in-javascript/
 */
export function RGBAToHexA(rgba) {
  const sep = rgba.indexOf(",") > -1 ? "," : " ";
  let parts = rgba.substring(5).split(")")[0].split(sep);

  // Strip the slash if using space-separated syntax
  if (parts.indexOf("/") > -1) parts.splice(3, 1);

  parts.forEach((val, i) => {
    if (val.indexOf("%") > -1) {
      const p = val.slice(0, -1) / 100;
      parts[i] = i < 3 ? Math.round(p * 255) : p;
    }
  });

  const padHex = (s) => s.padStart(2, "0");
  const r = padHex((+parts[0]).toString(16));
  const g = padHex((+parts[1]).toString(16));
  const b = padHex((+parts[2]).toString(16));
  const a = padHex(Math.round(+parts[3] * 255).toString(16));

  return "#" + r + g + b + a;
}

export function hexAToRGBA(h) {
  let r = 0,
    g = 0,
    b = 0,
    a = 1;

  if (h.length === 5) {
    r = "0x" + h[1] + h[1];
    g = "0x" + h[2] + h[2];
    b = "0x" + h[3] + h[3];
    a = "0x" + h[4] + h[4];
  } else if (h.length === 9) {
    r = "0x" + h[1] + h[2];
    g = "0x" + h[3] + h[4];
    b = "0x" + h[5] + h[6];
    a = "0x" + h[7] + h[8];
  }
  a = +(a / 255).toFixed(3);

  return "rgba(" + +r + "," + +g + "," + +b + "," + a + ")";
}
