/*
 * Forge config root: FORGE_CONFIG_HOME if set, else ~/.config/forge.
 * Nest sets the env to …/forge-config (already the root — do not append /forge).
 */

import GLib from "gi://GLib";
import { FORGE_CONFIG_HOME_ENV, resolveForgeConfigHome } from "./paths.js";

export { FORGE_CONFIG_HOME_ENV };

/** @returns {string} forge config root */
export function forgeConfigHome() {
  return resolveForgeConfigHome({
    env: { [FORGE_CONFIG_HOME_ENV]: GLib.getenv(FORGE_CONFIG_HOME_ENV) },
    userConfigDir: GLib.get_user_config_dir(),
  });
}

/** @returns {string} forgeConfigHome()/config */
export function forgeConfigDir() {
  return GLib.build_filenamev([forgeConfigHome(), "config"]);
}
