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
 */

import { KEYBINDING_KEYS } from "./settings-keys.js";

/** @type {readonly string[]} */
export const KEYBINDING_PRESET_KEYS = KEYBINDING_KEYS;

/**
 * Modifier grammar (Safe shipping kit):
 * - Primary: Ctrl+Super — almost all tiling actions
 * - Secondary: Ctrl+Shift+Super — twin of the same key (move vs focus, always-float vs float)
 * - Bare Super+* is user-space — Safe binds none of it
 * Recommended kits (vim, i3) may use bare Super; opt-in only
 */

/**
 * True when accel is Super/Meta only + a single letter (a-z) or digit (0-9).
 * @param {string} accel
 * @returns {boolean}
 */
export function isBareSuperLetterOrNumber(accel) {
  if (!isBareSuperAccel(accel)) return false;
  const key = accel.replace(/<[^>]+>/g, "").trim();
  return /^[a-z0-9]$/i.test(key);
}

/**
 * True when accel uses only Super/Meta (no Ctrl/Alt/Shift) — any key (arrows, equal, …).
 * @param {string} accel
 * @returns {boolean}
 */
export function isBareSuperAccel(accel) {
  if (!accel || typeof accel !== "string") return false;

  const mods = [];
  const modRe = /<([^>]+)>/g;
  let match;
  while ((match = modRe.exec(accel)) !== null) {
    mods.push(match[1].toLowerCase());
  }

  if (mods.length === 0) return false;

  const superish = new Set(["super", "meta"]);
  for (const mod of mods) {
    if (!superish.has(mod)) return false;
  }

  const key = accel.replace(/<[^>]+>/g, "").trim();
  return key.length > 0;
}

/**
 * Shared chords (same across kits unless a kit has its own tradition).
 * Lock: Super+Delete — session-level, not a letter grab.
 * Zoom (Vim/i3): Super+Return / Ctrl+Super+Return / Shift+Super+Return.
 * Float (Safe/Vim): Alt+Super+Return — Enter family, not a zoom chord.
 * Float (i3): Shift+Super+Space — Enter is zoom.
 * Always-float: Ctrl+Shift+Super+Space — leftover Space twin.
 * Run (Vim/i3): Super+Space.
 * Focus border: Ctrl+Super+b — "b"order (rare; multi-mod).
 * Tiling master: Ctrl+Super+e — "e"nable tiling (rare; multi-mod).
 */
const LOCK_SCREEN = ["<Super>Delete"];
const FLOAT_SAFE = ["<Alt><Super>Return"];
const FLOAT_VIM = ["<Alt><Super>Return"];
const FLOAT_I3 = ["<Shift><Super>space"];
const ALWAYS_FLOAT = ["<Ctrl><Shift><Super>space"];
const ZOOM_FULL = ["<Super>Return"];
const ZOOM_H = ["<Ctrl><Super>Return"];
const ZOOM_V = ["<Shift><Super>Return"];
const RUN_SPACE = ["<Super>space"];
const FOCUS_BORDER = ["<Ctrl><Super>b"];
const TILING_TOGGLE = ["<Ctrl><Super>e"];

/** Prior power-user map (vim-style bare Super for navigation). */
const VIM_BINDINGS = {
  "focus-border-toggle": FOCUS_BORDER,
  "window-gap-size-increase": ["<Ctrl><Super>plus"],
  "window-gap-size-decrease": ["<Ctrl><Super>minus"],
  "con-split-layout-toggle": ["<Ctrl><Super>n"],
  "con-split-horizontal": ["<Super>z"],
  "con-split-vertical": ["<Super>v"],
  "con-stacked-layout-toggle": ["<Shift><Super>s"],
  "con-tabbed-layout-toggle": ["<Shift><Super>t"],
  "con-stack-tab-layout-toggle": ["<Shift><Super>n"],
  "window-merge-group": ["<Shift><Super>m"],
  "con-tabbed-showtab-decoration-toggle": ["<Ctrl><Alt>y"],
  "window-swap-left": ["<Ctrl><Super>h"],
  "window-swap-down": ["<Ctrl><Super>j"],
  "window-swap-up": ["<Ctrl><Super>k"],
  "window-swap-right": ["<Ctrl><Super>l"],
  "window-move-left": ["<Shift><Super>h"],
  "window-move-down": ["<Shift><Super>j"],
  "window-move-up": ["<Shift><Super>k"],
  "window-move-right": ["<Shift><Super>l"],
  "window-focus-left": ["<Super>h", "<Super>Left"],
  "window-focus-down": ["<Super>j", "<Super>Down"],
  "window-focus-up": ["<Super>k", "<Super>Up"],
  "window-focus-right": ["<Super>l", "<Super>Right"],
  "window-toggle-float": FLOAT_VIM,
  "window-toggle-always-float": ALWAYS_FLOAT,
  "workspace-active-tile-toggle": ["<Shift><Super>w"],
  "prefs-open": ["<Super>Period"],
  "prefs-tiling-toggle": TILING_TOGGLE,
  "window-swap-last-active": ["<Super>Tab"],
  "window-zoom-toggle": ZOOM_FULL,
  "window-zoom-horizontal": ZOOM_H,
  "window-zoom-vertical": ZOOM_V,
  "window-focus-next": [],
  "window-focus-prev": [],
  "window-swap-next": [],
  "window-swap-prev": [],
  "window-snap-one-third-right": ["<Ctrl><Alt>g"],
  "window-snap-two-third-right": ["<Ctrl><Alt>t"],
  "window-snap-one-third-left": ["<Ctrl><Alt>d"],
  "window-snap-two-third-left": ["<Ctrl><Alt>e"],
  "window-snap-center": ["<Ctrl><Alt>c"],
  "window-resize-left-increase": ["<Ctrl><Super>y"],
  "window-resize-left-decrease": ["<Ctrl><Shift><Super>o"],
  "window-resize-bottom-increase": ["<Ctrl><Super>u"],
  "window-resize-bottom-decrease": ["<Ctrl><Shift><Super>i"],
  "window-resize-top-increase": ["<Ctrl><Super>i"],
  "window-resize-top-decrease": ["<Ctrl><Shift><Super>u"],
  "window-resize-right-increase": ["<Ctrl><Super>o"],
  "window-resize-right-decrease": ["<Ctrl><Shift><Super>y"],
  "window-reset-sizes": ["<Super>equal"],
  "window-golden-ratio": [],
  "prefs-config-reload": ["<Shift><Super>r"],
  "window-pointer-to-focus": [],
  "workspace-monocle-toggle": [],
  "window-expand": ["<Super>bracketright"],
  "window-shrink": ["<Super>bracketleft"],
  "prefs-app-launch": RUN_SPACE,
  "prefs-cheatsheet-toggle": ["<Shift><Super>slash"],
  "prefs-lock-screen": LOCK_SCREEN,
  "prefs-config-export": [],
  "layout-debug-overlay-toggle": ["<Ctrl><Super>d"],
  // window-unfocus abandoned (Ctrl+Super+Esc chords poorly; not product)
  "window-unfocus": [],
};

/**
 * Safe shipping kit: primary Ctrl+Super; secondary Ctrl+Shift+Super for twins.
 * Bare Super+ only for lock (Super+Delete). Fraction snaps unbound.
 */
const SAFE_BINDINGS = {
  "focus-border-toggle": FOCUS_BORDER,
  "window-gap-size-increase": ["<Ctrl><Super>plus"],
  "window-gap-size-decrease": ["<Ctrl><Super>minus"],
  "con-split-layout-toggle": ["<Ctrl><Super>s"],
  "con-split-horizontal": ["<Ctrl><Super>z"],
  "con-split-vertical": ["<Ctrl><Super>v"],
  "con-stacked-layout-toggle": [],
  "con-tabbed-layout-toggle": ["<Ctrl><Super>t"],
  "con-stack-tab-layout-toggle": ["<Ctrl><Super>g"],
  "window-merge-group": ["<Ctrl><Super>m"],
  "con-tabbed-showtab-decoration-toggle": ["<Ctrl><Shift><Super>t"],
  "window-swap-left": ["<Ctrl><Super>h"],
  "window-swap-down": ["<Ctrl><Super>j"],
  "window-swap-up": ["<Ctrl><Super>k"],
  "window-swap-right": ["<Ctrl><Super>l"],
  "window-move-left": ["<Ctrl><Shift><Super>Left"],
  "window-move-down": ["<Ctrl><Shift><Super>Down"],
  "window-move-up": ["<Ctrl><Shift><Super>Up"],
  "window-move-right": ["<Ctrl><Shift><Super>Right"],
  "window-focus-left": ["<Ctrl><Super>Left"],
  "window-focus-down": ["<Ctrl><Super>Down"],
  "window-focus-up": ["<Ctrl><Super>Up"],
  "window-focus-right": ["<Ctrl><Super>Right"],
  "window-toggle-float": FLOAT_SAFE,
  "window-toggle-always-float": ALWAYS_FLOAT,
  "workspace-active-tile-toggle": ["<Ctrl><Shift><Super>w"],
  "prefs-open": ["<Ctrl><Super>period"],
  "prefs-tiling-toggle": TILING_TOGGLE,
  "window-swap-last-active": ["<Ctrl><Super>Return"],
  "window-zoom-toggle": [],
  "window-zoom-horizontal": [],
  "window-zoom-vertical": [],
  "window-focus-next": [],
  "window-focus-prev": [],
  "window-swap-next": [],
  "window-swap-prev": [],
  "window-snap-one-third-right": [],
  "window-snap-two-third-right": [],
  "window-snap-one-third-left": [],
  "window-snap-two-third-left": [],
  "window-snap-center": [],
  "window-resize-left-increase": ["<Ctrl><Super>y"],
  "window-resize-left-decrease": ["<Ctrl><Shift><Super>o"],
  "window-resize-bottom-increase": ["<Ctrl><Super>u"],
  "window-resize-bottom-decrease": ["<Ctrl><Shift><Super>i"],
  "window-resize-top-increase": ["<Ctrl><Super>i"],
  "window-resize-top-decrease": ["<Ctrl><Shift><Super>u"],
  "window-resize-right-increase": ["<Ctrl><Super>o"],
  "window-resize-right-decrease": ["<Ctrl><Shift><Super>y"],
  "window-reset-sizes": ["<Ctrl><Super>equal"],
  "window-golden-ratio": [],
  "prefs-config-reload": ["<Ctrl><Super>r"],
  "window-pointer-to-focus": [],
  "workspace-monocle-toggle": [],
  "window-expand": ["<Ctrl><Super>bracketright"],
  "window-shrink": ["<Ctrl><Super>bracketleft"],
  "prefs-app-launch": ["<Ctrl><Shift><Super>Return"],
  "prefs-cheatsheet-toggle": ["<Ctrl><Super>slash"],
  "prefs-lock-screen": LOCK_SCREEN,
  "prefs-config-export": [],
  "layout-debug-overlay-toggle": ["<Ctrl><Super>d"],
  // window-unfocus abandoned (Ctrl+Super+Esc chords poorly; not product)
  "window-unfocus": [],
};

/**
 * i3-inspired recommended kit (bare Super). Approximate mapping onto Forge actions.
 * Not a full i3 mode system — a loadout for muscle memory.
 */
const I3_BINDINGS = {
  "focus-border-toggle": FOCUS_BORDER,
  "window-gap-size-increase": ["<Ctrl><Super>plus"],
  "window-gap-size-decrease": ["<Ctrl><Super>minus"],
  "con-split-layout-toggle": ["<Super>e"],
  "con-split-horizontal": ["<Super>b"],
  "con-split-vertical": ["<Super>v"],
  "con-stacked-layout-toggle": ["<Super>s"],
  "con-tabbed-layout-toggle": ["<Super>w"],
  "con-stack-tab-layout-toggle": ["<Shift><Super>n"],
  "window-merge-group": ["<Shift><Super>m"],
  "con-tabbed-showtab-decoration-toggle": ["<Shift><Super>w"],
  "window-swap-left": ["<Ctrl><Super>h"],
  "window-swap-down": ["<Ctrl><Super>j"],
  "window-swap-up": ["<Ctrl><Super>k"],
  "window-swap-right": ["<Ctrl><Super>l"],
  "window-move-left": ["<Shift><Super>h", "<Shift><Super>Left"],
  "window-move-down": ["<Shift><Super>j", "<Shift><Super>Down"],
  "window-move-up": ["<Shift><Super>k", "<Shift><Super>Up"],
  "window-move-right": ["<Shift><Super>l", "<Shift><Super>Right"],
  "window-focus-left": ["<Super>h", "<Super>Left"],
  "window-focus-down": ["<Super>j", "<Super>Down"],
  "window-focus-up": ["<Super>k", "<Super>Up"],
  "window-focus-right": ["<Super>l", "<Super>Right"],
  "window-toggle-float": FLOAT_I3,
  "window-toggle-always-float": ALWAYS_FLOAT,
  "workspace-active-tile-toggle": ["<Shift><Super>e"],
  "prefs-open": ["<Super>Period"],
  "prefs-tiling-toggle": TILING_TOGGLE,
  "window-swap-last-active": ["<Super>Tab"],
  "window-zoom-toggle": ZOOM_FULL,
  "window-zoom-horizontal": ZOOM_H,
  "window-zoom-vertical": ZOOM_V,
  "window-focus-next": [],
  "window-focus-prev": [],
  "window-swap-next": [],
  "window-swap-prev": [],
  "window-snap-one-third-right": [],
  "window-snap-two-third-right": [],
  "window-snap-one-third-left": [],
  "window-snap-two-third-left": [],
  "window-snap-center": ["<Super>f"],
  "window-resize-left-increase": ["<Ctrl><Super>y"],
  "window-resize-left-decrease": ["<Ctrl><Shift><Super>o"],
  "window-resize-bottom-increase": ["<Ctrl><Super>u"],
  "window-resize-bottom-decrease": ["<Ctrl><Shift><Super>i"],
  "window-resize-top-increase": ["<Ctrl><Super>i"],
  "window-resize-top-decrease": ["<Ctrl><Shift><Super>u"],
  "window-resize-right-increase": ["<Ctrl><Super>o"],
  "window-resize-right-decrease": ["<Ctrl><Shift><Super>y"],
  "window-reset-sizes": ["<Super>equal"],
  "window-golden-ratio": [],
  "prefs-config-reload": ["<Shift><Super>r"],
  "window-pointer-to-focus": [],
  "workspace-monocle-toggle": ["<Super>m"],
  "window-expand": ["<Super>bracketright"],
  "window-shrink": ["<Super>bracketleft"],
  "prefs-app-launch": RUN_SPACE,
  "prefs-cheatsheet-toggle": ["<Shift><Super>slash"],
  "prefs-lock-screen": LOCK_SCREEN,
  "prefs-config-export": [],
  "layout-debug-overlay-toggle": ["<Ctrl><Super>d"],
  // window-unfocus abandoned (Ctrl+Super+Esc chords poorly; not product)
  "window-unfocus": [],
};

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   recommended: boolean,
 *   modMaskMouseTile: string,
 *   bindings: Record<string, string[]>
 * }} KeybindKit
 */

/** @type {Record<string, KeybindKit>} */
export const KITS = {
  safe: {
    id: "safe",
    label: "Safe",
    description:
      "Install default only — leaves all Super+ free. Not a power-user recommendation; try other kits.",
    recommended: false,
    modMaskMouseTile: "None",
    bindings: SAFE_BINDINGS,
  },
  vim: {
    id: "vim",
    label: "Vim",
    description: "Recommended starter: hjkl focus, Super+letter actions (uses user-space Super+).",
    recommended: true,
    modMaskMouseTile: "None",
    bindings: VIM_BINDINGS,
  },
  i3: {
    id: "i3",
    label: "i3",
    description:
      "Recommended i3-inspired Super+ map (focus hjkl, move Shift+hjkl, splits Super+b/v/e).",
    recommended: true,
    modMaskMouseTile: "None",
    bindings: I3_BINDINGS,
  },
};

/** @deprecated use KITS */
export const PRESETS = KITS;

/**
 * @returns {{ id: string, label: string, description: string, recommended: boolean }[]}
 */
export function listKits() {
  return Object.values(KITS).map(({ id, label, description, recommended }) => ({
    id,
    label,
    description,
    recommended,
  }));
}

/** @deprecated use listKits */
export function listPresets() {
  return listKits();
}

/**
 * @param {string} id
 * @returns {KeybindKit|null}
 */
export function getKit(id) {
  return KITS[id] ?? null;
}

/** @deprecated use getKit */
export function getPreset(id) {
  return getKit(id);
}

/**
 * Whether any binding in the kit uses bare Super+ (user-space).
 * @param {KeybindKit|{ bindings: Record<string, string[]> }} kit
 * @returns {boolean}
 */
export function kitUsesBareSuper(kit) {
  if (!kit?.bindings) return false;
  for (const accels of Object.values(kit.bindings)) {
    for (const accel of accels) {
      if (isBareSuperAccel(accel)) return true;
    }
  }
  return false;
}

/**
 * Apply every binding (and mouse-tile mod) from a named kit.
 * @param {{ set_strv: Function, set_string?: Function }} kbdSettings
 * @param {string} id
 * @returns {boolean}
 */
export function applyKit(kbdSettings, id) {
  const kit = getKit(id);
  if (!kit || !kbdSettings) return false;
  return applyBindings(kbdSettings, {
    modMaskMouseTile: kit.modMaskMouseTile,
    bindings: kit.bindings,
  });
}

/** @deprecated use applyKit */
export function applyPreset(kbdSettings, id) {
  return applyKit(kbdSettings, id);
}

/**
 * Snapshot current keybindings for saved-kit export.
 * @param {{ get_strv: Function, get_string?: Function }} kbdSettings
 * @returns {{ modMaskMouseTile: string, bindings: Record<string, string[]> }}
 */
export function bindingsFromSettings(kbdSettings) {
  const bindings = {};
  for (const key of KEYBINDING_PRESET_KEYS) {
    bindings[key] = kbdSettings.get_strv(key);
  }
  const modMaskMouseTile =
    typeof kbdSettings.get_string === "function"
      ? kbdSettings.get_string("mod-mask-mouse-tile")
      : "None";
  return { modMaskMouseTile, bindings };
}

/**
 * Compare two binding maps (order-sensitive per key).
 * @param {Record<string, string[]>} a
 * @param {Record<string, string[]>} b
 * @returns {boolean}
 */
export function bindingsEqual(a, b) {
  if (!a || !b) return false;
  for (const key of KEYBINDING_PRESET_KEYS) {
    const aa = Array.isArray(a[key]) ? a[key] : [];
    const bb = Array.isArray(b[key]) ? b[key] : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (String(aa[i]) !== String(bb[i])) return false;
    }
  }
  return true;
}

/**
 * Which built-in kit matches the snapshot, or `"custom"`.
 * @param {{ modMaskMouseTile?: string, bindings?: Record<string, string[]> }} snap
 * @returns {string} kit id or `"custom"`
 */
export function matchKitId(snap) {
  if (!snap || typeof snap !== "object") return "custom";
  const bindings = snap.bindings || {};
  const mod =
    snap.modMaskMouseTile != null && String(snap.modMaskMouseTile).trim() !== ""
      ? String(snap.modMaskMouseTile)
      : "None";
  for (const kit of Object.values(KITS)) {
    if ((kit.modMaskMouseTile || "None") !== mod) continue;
    if (bindingsEqual(kit.bindings, bindings)) return kit.id;
  }
  return "custom";
}

/**
 * Apply a partial or full binding map to GSettings-like kbdSettings.
 * @param {{ set_strv: Function, set_string?: Function }} kbdSettings
 * @param {{ modMaskMouseTile?: string, bindings?: Record<string, string[]> }} map
 * @returns {boolean}
 */
export function applyBindings(kbdSettings, map) {
  if (!kbdSettings || !map) return false;

  try {
    if (map.modMaskMouseTile !== undefined && typeof kbdSettings.set_string === "function") {
      kbdSettings.set_string("mod-mask-mouse-tile", map.modMaskMouseTile);
    }

    const bindings = map.bindings ?? {};
    for (const key of Object.keys(bindings)) {
      const value = bindings[key];
      if (Array.isArray(value)) {
        kbdSettings.set_strv(key, value);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe filename stem: alnum, dash, underscore only.
 * @param {string} name
 * @returns {string|null}
 */
export function sanitizeProfileName(name) {
  if (name == null || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** @deprecated alias */
export const sanitizeKitName = sanitizeProfileName;

/**
 * JSON shape matching portable keybindings.json (without $schema).
 * @param {{ modMaskMouseTile?: string, bindings?: Record<string, string[]>, name?: string }} opts
 * @returns {Object}
 */
export function buildProfileProps({ modMaskMouseTile, bindings, name } = {}) {
  const props = {
    version: 1,
    "mod-mask-mouse-tile": modMaskMouseTile ?? "None",
    bindings: bindings ?? {},
  };
  if (name) props.name = name;
  return props;
}

/** @deprecated alias */
export const buildKitProps = buildProfileProps;
