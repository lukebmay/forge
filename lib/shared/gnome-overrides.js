// GTK-free descriptors + gating policy for the GNOME settings Forge overrides
// while enabled. Kept out of extension.js so the policy is unit-testable without
// importing the Shell Extension base class (which breaks under vitest).

/**
 * Descriptors for GNOME settings Forge overrides while enabled. Each entry saves
 * the original value during enable() and restores it during disable().
 *
 * An optional `gatedBy` names a Forge boolean setting (or an array of settings,
 * all of which must be true) that gates whether the override applies, letting
 * users opt out of a specific override (e.g. keep GNOME's native edge/half-
 * tiling). When `gatedBy` is absent the override always applies. A gated-off
 * override is never applied and never saved, so there is nothing to restore for
 * it on disable().
 *
 * forge-abk: edge-tiling is gated by BOTH `disable-edge-tiling` AND
 * `tiling-mode-enabled`, so toggling Forge tiling off at runtime restores
 * GNOME's native edge-tiling (and re-applies the override when toggled back on).
 * See reconcileAction() + the change-signal wiring in extension.js.
 */
export const SETTINGS_OVERRIDES = [
  {
    schemaId: "org.gnome.mutter",
    key: "edge-tiling",
    type: "boolean",
    newValue: false,
    gatedBy: ["disable-edge-tiling", "tiling-mode-enabled"],
  },
  { schemaId: "org.gnome.mutter", key: "auto-maximize", type: "boolean", newValue: false },
  {
    schemaId: "org.gnome.mutter.keybindings",
    key: "toggle-tiled-left",
    type: "strv",
    newValue: [],
  },
  {
    schemaId: "org.gnome.mutter.keybindings",
    key: "toggle-tiled-right",
    type: "strv",
    newValue: [],
  },
  { schemaId: "org.gnome.desktop.wm.keybindings", key: "maximize", type: "strv", newValue: [] },
  { schemaId: "org.gnome.desktop.wm.keybindings", key: "unmaximize", type: "strv", newValue: [] },
  { schemaId: "org.gnome.desktop.wm.keybindings", key: "minimize", type: "strv", newValue: [] },
  {
    schemaId: "org.gnome.shell.keybindings",
    key: "toggle-message-tray",
    type: "strv",
    newValue: [],
  },
  // screensaver (lock chord) is kit-aware — see desktopLockAccels* below.
  // Applied separately in extension enable / kit apply so Safe keeps Super+L.
];

/** GNOME media-keys schema for lock screen chord. */
export const SCREENSAVER_SCHEMA = "org.gnome.settings-daemon.plugins.media-keys";
/** GNOME media-keys key for lock screen. */
export const SCREENSAVER_KEY = "screensaver";

/**
 * Safe / install: keep Ubuntu Super+L, also Super+Delete.
 * GNOME owns lock behavior; Forge only sets the chord(s).
 */
export const DESKTOP_LOCK_SAFE = ["<Super>l", "<Super>Delete"];

/**
 * Vim / i3: free Super+L for focus-right; lock on Super+Delete only.
 */
export const DESKTOP_LOCK_POWER = ["<Super>Delete"];

/**
 * True if accel is bare Super+L (not Ctrl+Super+L etc.).
 * @param {string} accel
 * @returns {boolean}
 */
export function isBareSuperL(accel) {
  if (!accel || typeof accel !== "string") return false;
  const mods = [];
  const modRe = /<([^>]+)>/gi;
  let match;
  while ((match = modRe.exec(accel)) !== null) {
    let m = match[1].toLowerCase();
    if (m === "control") m = "ctrl";
    if (m === "meta") m = "super";
    mods.push(m);
  }
  const key = accel
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase();
  return key === "l" && mods.length === 1 && mods[0] === "super";
}

/**
 * Lock chords for a named kit.
 * @param {string} kitId
 * @returns {string[]}
 */
export function desktopLockAccelsForKit(kitId) {
  if (kitId === "vim" || kitId === "i3") return [...DESKTOP_LOCK_POWER];
  return [...DESKTOP_LOCK_SAFE];
}

/**
 * Lock chords from live Forge focus-right bindings (enable-time inference).
 * Bare Super+L on focus-right ⇒ power-user kits claim Super+L.
 * @param {string[]|null|undefined} focusRightAccels
 * @returns {string[]}
 */
export function desktopLockAccelsForFocusRight(focusRightAccels) {
  if ((focusRightAccels || []).some(isBareSuperL)) return [...DESKTOP_LOCK_POWER];
  return [...DESKTOP_LOCK_SAFE];
}

/**
 * Descriptor for applying kit-aware GNOME lock chords (manage, not own).
 * @param {string[]} accels
 * @returns {{ schemaId: string, key: string, type: string, newValue: string[] }}
 */
export function screensaverOverrideDesc(accels) {
  return {
    schemaId: SCREENSAVER_SCHEMA,
    key: SCREENSAVER_KEY,
    type: "strv",
    newValue: accels,
  };
}

/**
 * Whether a GNOME override should be applied, given Forge's settings (forge-9fo).
 *
 * @param {object} desc - a SETTINGS_OVERRIDES entry
 * @param {{ get_boolean: (key: string) => boolean }} forgeSettings
 * @returns {boolean} true when the override should be applied
 */
export function shouldApplyOverride(desc, forgeSettings) {
  if (!desc.gatedBy) return true;
  const keys = Array.isArray(desc.gatedBy) ? desc.gatedBy : [desc.gatedBy];
  return keys.every((key) => forgeSettings.get_boolean(key));
}

/**
 * Override descriptors whose gating includes `settingKey` — i.e. those a runtime
 * change to that Forge boolean must reconcile (forge-abk).
 *
 * @param {string} settingKey - a Forge boolean setting name
 * @returns {object[]} the matching SETTINGS_OVERRIDES entries
 */
export function overridesGatedBy(settingKey) {
  return SETTINGS_OVERRIDES.filter((desc) => {
    if (!desc.gatedBy) return false;
    const keys = Array.isArray(desc.gatedBy) ? desc.gatedBy : [desc.gatedBy];
    return keys.includes(settingKey);
  });
}

/**
 * Decide what to do with one override when a gating setting changes at runtime
 * (forge-abk). Pure so it can be unit-tested without live Gio.Settings; the
 * caller performs the actual apply/restore I/O.
 *
 * @param {object} desc - a SETTINGS_OVERRIDES entry
 * @param {{ get_boolean: (key: string) => boolean }} forgeSettings
 * @param {boolean} isCurrentlySaved - whether the override is currently applied
 *   (i.e. its original value has been saved for restore)
 * @returns {"apply" | "restore" | "noop"}
 */
export function reconcileAction(desc, forgeSettings, isCurrentlySaved) {
  const shouldApply = shouldApplyOverride(desc, forgeSettings);
  if (shouldApply && !isCurrentlySaved) return "apply";
  if (!shouldApply && isCurrentlySaved) return "restore";
  return "noop";
}
