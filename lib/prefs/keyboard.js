// Gnome imports
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";

// Extension Imports
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

// Prefs UI
import { EntryRow, PreferencesPage, RadioRow } from "./widgets.js";
import { accelStrvFromInput, findAccelConflicts } from "./keyboard-accel.js";
import { Logger } from "../shared/logger.js";
import { ConfigManager } from "../shared/settings.js";
import {
  applyKit,
  applyBindings,
  bindingsFromSettings,
  buildProfileProps,
  getKit,
  kitUsesBareSuper,
  listKits,
  sanitizeProfileName,
} from "../shared/keybind-presets.js";
import {
  analyzeBindingConflicts,
  collectGnomeExternalBindings,
} from "../shared/keybind-conflicts.js";
import {
  desktopLockAccelsForKit,
  SCREENSAVER_SCHEMA,
  SCREENSAVER_KEY,
} from "../shared/gnome-overrides.js";

export class KeyboardPage extends PreferencesPage {
  static {
    GObject.registerClass(this);
  }

  constructor({ kbdSettings, dir }) {
    super({ title: _("Keyboard"), icon_name: "input-keyboard-symbolic" });
    this.kbdSettings = kbdSettings;
    this._configMgr = dir ? new ConfigManager({ dir }) : null;
    this._profilesRow = null;
    this._conflictRow = null;

    this.add_group({
      title: _("About defaults"),
      description: _(
        "Install defaults use the Safe kit only so Forge does not steal Super+ " +
          "shortcuts from launchers or GNOME. Safe is not the recommended power-user " +
          "map — load a kit (Vim, i3), tweak chords below, then save your own kit. " +
          "Keybinds are the main way to drive a tiling WM; experiment freely."
      ),
      children: [],
    });

    this._conflictRow = new Adw.ActionRow({
      title: _("Shortcut conflicts"),
      subtitle: _("Scanning…"),
    });
    this.add_group({
      title: _("Conflicts"),
      description: _(
        "Forge shortcuts live in this extension (not GNOME Settings → Keyboard). " +
          "This list checks Forge vs itself and vs GNOME/wm/shell bindings."
      ),
      children: [this._conflictRow],
    });

    this.add_group({
      title: _("Drag-and-drop modifier key"),
      description: _(
        "Change the modifier key for tiling windows via drag-and-drop. Select 'None' to always tile"
      ),
      children: [
        new RadioRow({
          title: _("Modifier key"),
          settings: kbdSettings,
          bind: "mod-mask-mouse-tile",
          options: {
            Super: _("Super"),
            Ctrl: _("Ctrl"),
            Alt: _("Alt"),
            Shift: _("Shift"),
            None: _("None"),
          },
        }),
      ],
    });

    this.add_group({
      title: _("Keybind kits"),
      description: _(
        "Built-in full maps. Safe = install default (not recommended). " +
          "Vim and i3 use Super+ (user space) and may conflict — you will be warned."
      ),
      children: [this._createKitsRow()],
    });

    this._profilesRow = this._createProfilesRow();
    const profilesDir =
      this._configMgr?.keybindingProfilesDir ??
      `${GLib.get_user_config_dir()}/forge/config/keybinding-profiles`;
    this.add_group({
      title: _("Your kits"),
      description: _(
        "Load a built-in kit, adjust shortcuts, then save under a name. " +
          "Files: %s (override with FORGE_KEYBIND_PROFILES_DIR)"
      ).format(profilesDir),
      children: [this._profilesRow],
    });

    this.add_group({
      title: _("Shortcuts"),
      description: _(
        "Change individual shortcuts. Clear the field to unbind; press Enter to apply. " +
          '<a href="https://github.com/jcrussell/forge/blob/main/docs/user/keybindings.md">Keyboard shortcuts guide</a>'
      ),
      children: Object.entries({
        window: "Tiling shortcuts",
        con: "Container shortcuts",
        workspace: "Workspace shortcuts",
        focus: "Appearance shortcuts",
        layout: "Layout debug",
        prefs: "Other shortcuts",
      }).map(([prefix, gettextKey]) =>
        KeyboardPage.makeKeygroupExpander(prefix, gettextKey, kbdSettings)
      ),
    });

    this.add_group({
      title: _("Bulk Actions"),
      description: _("Disable all shortcuts or restore Safe install defaults"),
      children: [this._createBulkActionsRow()],
    });

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      try {
        this.refreshConflictBanner();
      } catch (e) {
        Logger.warn(`conflict refresh: ${e}`);
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  _toast(title) {
    const root = this.get_root();
    if (root?.add_toast) {
      root.add_toast(new Adw.Toast({ title, timeout: 3 }));
    }
  }

  _openSchema(schemaId) {
    try {
      const source = Gio.SettingsSchemaSource.get_default();
      if (!source?.lookup(schemaId, true)) return null;
      return new Gio.Settings({ schema_id: schemaId });
    } catch {
      return null;
    }
  }

  _collectExternalBindings() {
    return collectGnomeExternalBindings({
      openSchema: (id) => this._openSchema(id),
      extra: () => this._collectCustomKeybindings(),
    });
  }

  _collectCustomKeybindings() {
    const out = [];
    const mk = this._openSchema("org.gnome.settings-daemon.plugins.media-keys");
    if (!mk) return out;
    let paths = [];
    try {
      paths = mk.get_strv("custom-keybindings");
    } catch {
      return out;
    }
    for (const path of paths) {
      try {
        const custom = new Gio.Settings({
          schema_id: "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding",
          path,
        });
        const binding = custom.get_string("binding");
        const name = custom.get_string("name") || path;
        if (binding) {
          out.push({
            accel: binding,
            id: path,
            label: _("Custom: %s").format(name),
            source: "custom-keybinding",
          });
        }
      } catch {
        /* skip broken custom */
      }
    }
    return out;
  }

  _currentBindingsMap() {
    return bindingsFromSettings(this.kbdSettings).bindings;
  }

  refreshConflictBanner() {
    if (!this._conflictRow) return;
    try {
      const report = analyzeBindingConflicts(
        this._currentBindingsMap(),
        this._collectExternalBindings()
      );
      const n = report.all.length;
      if (n === 0) {
        this._conflictRow.title = _("No conflicts detected");
        this._conflictRow.subtitle = _(
          "Forge chords do not overlap each other or scanned GNOME shortcuts."
        );
        return;
      }
      this._conflictRow.title = _("%d conflict(s)").format(n);
      const sample = report.all
        .slice(0, 6)
        .map((c) => `${c.forgeKey} ↔ ${c.otherLabel} (${c.accel})`)
        .join("; ");
      const more = n > 6 ? _(" … +%d more").format(n - 6) : "";
      this._conflictRow.subtitle = sample + more;
    } catch (e) {
      Logger.warn(`conflict scan failed: ${e}`);
      this._conflictRow.title = _("Conflict scan unavailable");
      this._conflictRow.subtitle = String(e);
    }
  }

  _createKitsRow() {
    const row = new Adw.ActionRow({
      title: _("Apply a built-in kit"),
      subtitle: _("Overwrites all Forge shortcuts with that kit’s map"),
    });

    const buttonBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER,
    });

    for (const kit of listKits()) {
      const button = new Gtk.Button({
        label: kit.label,
        css_classes: kit.recommended ? ["suggested-action"] : [],
        tooltip_text: kit.description,
      });
      button.connect("clicked", () => this._requestApplyKit(kit.id));
      buttonBox.append(button);
    }

    row.add_suffix(buttonBox);
    return row;
  }

  _requestApplyKit(kitId) {
    const kit = getKit(kitId);
    if (!kit) {
      this._toast(_("Unknown kit"));
      return;
    }

    let external = [];
    try {
      external = this._collectExternalBindings();
    } catch {
      external = [];
    }
    const report = analyzeBindingConflicts(kit.bindings, external);
    const bare = kitUsesBareSuper(kit);
    // Confirm when Super+ kit, any conflicts, or any recommended kit (encourages read).
    const needsConfirm = bare || report.all.length > 0 || kit.recommended;

    if (!needsConfirm) {
      this._doApplyKit(kit);
      return;
    }

    const lines = [];
    if (kit.recommended) {
      lines.push(_("Recommended power-user kit — not the Safe install default."));
    }
    if (bare) {
      lines.push(_("Uses bare Super+ chords (user space for launchers and GNOME)."));
    }
    if (report.all.length > 0) {
      lines.push(_("Conflicts (%d):").format(report.all.length));
      for (const c of report.all.slice(0, 8)) {
        lines.push(`• ${c.forgeKey} ↔ ${c.otherLabel}`);
      }
      if (report.all.length > 8) {
        lines.push(_("… and %d more").format(report.all.length - 8));
      }
    }
    lines.push(_("Apply, then tweak and save as your own kit if you like."));

    const root = this.get_root();
    const dialog = new Adw.MessageDialog({
      transient_for: root instanceof Gtk.Window ? root : null,
      modal: true,
      heading: _("Apply “%s” kit?").format(kit.label),
      body: lines.join("\n"),
    });
    dialog.add_response("cancel", _("Cancel"));
    dialog.add_response("apply", _("Apply kit"));
    dialog.set_response_appearance("apply", Adw.ResponseAppearance.SUGGESTED);
    dialog.connect("response", (_d, response) => {
      if (response === "apply") this._doApplyKit(kit);
    });
    dialog.present();
  }

  _doApplyKit(kit) {
    if (applyKit(this.kbdSettings, kit.id)) {
      Logger.info(`Applied keybind kit: ${kit.id}`);
      // Manage GNOME lock chords for kit (Safe: Super+L+Delete; Vim/i3: Delete only).
      this._applyDesktopLockForKit(kit.id);
      this._toast(_("Applied “%s” kit").format(kit.label));
      this.refreshConflictBanner();
    } else {
      this._toast(_("Failed to apply kit"));
    }
  }

  /**
   * Write GNOME media-keys screensaver for the kit (does not implement lock).
   * @param {string} kitId
   */
  _applyDesktopLockForKit(kitId) {
    try {
      const accels = desktopLockAccelsForKit(kitId);
      const schema = Gio.SettingsSchemaSource.get_default()?.lookup(SCREENSAVER_SCHEMA, true);
      if (!schema || !schema.has_key(SCREENSAVER_KEY)) {
        Logger.warn("GNOME screensaver key unavailable; skip desktop lock chords");
        return;
      }
      const gsettings = new Gio.Settings({ schema_id: SCREENSAVER_SCHEMA });
      gsettings.set_strv(SCREENSAVER_KEY, accels);
      Logger.info(`GNOME lock chords for kit ${kitId}: ${accels.join(", ")}`);
    } catch (e) {
      Logger.warn(`Failed to set GNOME lock chords: ${e}`);
    }
  }

  _createProfilesRow() {
    const row = new Adw.ActionRow({
      title: _("Saved kit name"),
      subtitle: this._profilesSubtitle(),
    });

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER,
    });

    const entry = new Gtk.Entry({
      placeholder_text: _("my-kit"),
      width_chars: 14,
      valign: Gtk.Align.CENTER,
    });

    const saveButton = new Gtk.Button({ label: _("Save") });
    saveButton.connect("clicked", () => this._saveProfile(entry, row));

    const loadButton = new Gtk.Button({
      label: _("Load"),
      css_classes: ["suggested-action"],
    });
    loadButton.connect("clicked", () => this._loadProfile(entry, row));

    box.append(entry);
    box.append(saveButton);
    box.append(loadButton);
    row.add_suffix(box);
    return row;
  }

  _profilesSubtitle() {
    if (!this._configMgr) {
      return _("Saved kits unavailable");
    }
    const names = this._configMgr.listKeybindingProfiles();
    if (names.length === 0) {
      return _("No saved kits yet — apply a kit, tweak, then Save");
    }
    return _("Saved: %s").format(names.join(", "));
  }

  _refreshProfilesSubtitle(row) {
    if (row) row.subtitle = this._profilesSubtitle();
  }

  _saveProfile(entry, row) {
    if (!this._configMgr) {
      this._toast(_("Saved kits unavailable"));
      return;
    }
    const name = sanitizeProfileName(entry.get_text());
    if (!name) {
      this._toast(_("Invalid name (letters, numbers, - or _)"));
      return;
    }
    const snap = bindingsFromSettings(this.kbdSettings);
    const props = buildProfileProps({
      modMaskMouseTile: snap.modMaskMouseTile,
      bindings: snap.bindings,
      name,
    });
    if (this._configMgr.saveKeybindingProfile(name, props)) {
      Logger.info(`Saved keybinding kit: ${name}`);
      this._toast(_("Saved kit “%s”").format(name));
      this._refreshProfilesSubtitle(row);
      this.refreshConflictBanner();
    } else {
      this._toast(_("Failed to save kit"));
    }
  }

  _loadProfile(entry, row) {
    if (!this._configMgr) {
      this._toast(_("Saved kits unavailable"));
      return;
    }
    const name = sanitizeProfileName(entry.get_text());
    if (!name) {
      this._toast(_("Invalid name (letters, numbers, - or _)"));
      return;
    }
    const props = this._configMgr.loadKeybindingProfile(name);
    if (!props) {
      this._toast(_("Kit “%s” not found").format(name));
      this._refreshProfilesSubtitle(row);
      return;
    }
    const ok = applyBindings(this.kbdSettings, {
      modMaskMouseTile: props["mod-mask-mouse-tile"],
      bindings: props.bindings ?? {},
    });
    if (ok) {
      Logger.info(`Loaded keybinding kit: ${name}`);
      this._toast(_("Loaded kit “%s”").format(name));
      this.refreshConflictBanner();
    } else {
      this._toast(_("Failed to load kit"));
    }
    this._refreshProfilesSubtitle(row);
  }

  _createBulkActionsRow() {
    const row = new Adw.ActionRow({
      title: _("Manage all shortcuts"),
      subtitle: _("Disable all, or restore Safe install defaults"),
    });

    const buttonBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER,
    });

    const disableAllButton = new Gtk.Button({
      label: _("Disable All"),
      css_classes: ["destructive-action"],
    });
    disableAllButton.connect("clicked", () => this._disableAllShortcuts());

    const restoreDefaultsButton = new Gtk.Button({
      label: _("Restore Safe defaults"),
    });
    restoreDefaultsButton.connect("clicked", () => this._restoreAllDefaults());

    buttonBox.append(disableAllButton);
    buttonBox.append(restoreDefaultsButton);
    row.add_suffix(buttonBox);

    return row;
  }

  _disableAllShortcuts() {
    const settings = this.kbdSettings;
    const keys = settings.list_keys().filter((key) => {
      const value = settings.get_value(key);
      return value && value.get_type_string() === "as";
    });
    for (const key of keys) {
      settings.set_strv(key, []);
    }
    Logger.info("Disabled all shortcuts");
    this._toast(_("All shortcuts disabled"));
    this.refreshConflictBanner();
  }

  _restoreAllDefaults() {
    const settings = this.kbdSettings;
    const keys = settings.list_keys().filter((key) => {
      const value = settings.get_value(key);
      return value && value.get_type_string() === "as";
    });
    for (const key of keys) {
      settings.reset(key);
    }
    if (settings.list_keys().includes("mod-mask-mouse-tile")) {
      settings.reset("mod-mask-mouse-tile");
    }
    Logger.info("Restored all shortcuts to Safe defaults");
    this._toast(_("Restored Safe install defaults"));
    this.refreshConflictBanner();
  }

  static makeKeygroupExpander(prefix, gettextKey, settings) {
    const expander = new Adw.ExpanderRow({ title: _(gettextKey) });
    KeyboardPage.createKeyList(settings, prefix).forEach((key) =>
      expander.add_row(
        new EntryRow({
          title: key,
          settings,
          bind: key,
          map: {
            from(settings, bind) {
              return settings.get_strv(bind).join(",");
            },
            to(settings, bind, value) {
              const { valid, strv } = accelStrvFromInput(value, {
                parse: Gtk.accelerator_parse,
                valid: Gtk.accelerator_valid,
                name: Gtk.accelerator_name,
              });
              if (!valid) return false;
              Logger.info("setting", bind, "to", strv);
              settings.set_strv(bind, strv);
              return true;
            },
            warn(settings, bind) {
              const shortcutKeys = settings
                .list_keys()
                .filter((key) => settings.get_default_value(key)?.get_type_string() === "as");
              const conflicts = findAccelConflicts(settings.get_strv(bind), {
                selfBind: bind,
                keys: shortcutKeys,
                getStrv: (key) => settings.get_strv(key),
              });
              if (conflicts.length === 0) return null;
              const others = [...new Set(conflicts.map((c) => c.key))].join(", ");
              return _("Shortcut also bound to:") + " " + others;
            },
          },
        })
      )
    );
    return expander;
  }

  static createKeyList(settings, categoryName) {
    return settings
      .list_keys()
      .filter((keyName) => !!keyName && !!categoryName && keyName.startsWith(categoryName))
      .sort((a, b) => {
        const aUp = a.toUpperCase();
        const bUp = b.toUpperCase();
        if (aUp < bUp) return -1;
        if (aUp > bUp) return 1;
        return 0;
      });
  }
}
