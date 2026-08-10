/*
 * Forge config root: FORGE_CONFIG_HOME if set, else ~/.config/forge.
 * Nest sets the env to …/forge-config (already the root — do not append /forge).
 */

import GLib from "gi://GLib";

export const FORGE_CONFIG_HOME_ENV = "FORGE_CONFIG_HOME";

/** @returns {string} forge config root */
export function forgeConfigHome() {
  const raw = GLib.getenv(FORGE_CONFIG_HOME_ENV);
  if (raw != null) {
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return GLib.build_filenamev([GLib.get_user_config_dir(), "forge"]);
}

/** @returns {string} forgeConfigHome()/config */
export function forgeConfigDir() {
  return GLib.build_filenamev([forgeConfigHome(), "config"]);
}
