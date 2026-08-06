/*
 * GNOME Shell tiling extensions that must not run alongside Forge.
 * Install/update scripts mirror this list (scripts/forge/_lib.zsh).
 *
 * Scope: GNOME Shell extension UUIDs only — never session WMs (i3, sway,
 * Hyprland, etc.). Those are not gnome-extensions and are never touched.
 */

/** @type {readonly string[]} */
export const RIVAL_TILER_UUIDS = Object.freeze([
  // Ubuntu / upstream Tiling Assistant (edge snap + popup)
  "tiling-assistant@ubuntu.com",
  "tiling-assistant@leleat-on-github",
  // System76 Pop Shell
  "pop-shell@system76.com",
  // PaperWM (scrollable tiling)
  "paperwm@paperwm.github.com",
  // Tiling Shell (GNOME 45+ popular tiler)
  "tilingshell@ferrarodomenico.com",
  // gTile / gSnap / WinTile / ShellTile / Material Shell
  "gTile@vibou",
  "gSnap@micahosborne",
  "winTile@nowsci.com",
  "shelltile@emasab.it",
  "material-shell@papyelgringo",
  // Tactile (grid resize)
  "tactile@lundalomer.github.com",
]);

/**
 * @param {string} uuid
 * @returns {boolean}
 */
export function isRivalTilerUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return false;
  if (uuid === "forge@jmmaranan.com") return false;
  return RIVAL_TILER_UUIDS.includes(uuid);
}

/**
 * Disable enabled rival GNOME Shell tilers.
 * @param {{
 *   isEnabled?: (uuid: string) => boolean,
 *   disable: (uuid: string) => void | boolean,
 *   log?: (msg: string) => void,
 * }} hooks
 * @returns {string[]} UUIDs that were disabled
 */
export function disableRivalTilers(hooks) {
  const disabled = [];
  const isEnabled = hooks.isEnabled ?? (() => true);
  const log = hooks.log ?? (() => {});
  for (const uuid of RIVAL_TILER_UUIDS) {
    try {
      if (!isEnabled(uuid)) continue;
      hooks.disable(uuid);
      disabled.push(uuid);
      log(`Disabled rival tiler: ${uuid}`);
    } catch (_e) {
      /* best-effort — never fail enable/install for a missing rival */
    }
  }
  return disabled;
}
