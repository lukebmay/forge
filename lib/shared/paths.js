/*
 * Pure path helpers shared by Node CLI and GJS wrappers.
 * No gi://, node:, fs, or process.
 */

export const FORGE_CONFIG_HOME_ENV = "FORGE_CONFIG_HOME";

/**
 * Forge config root: non-empty FORGE_CONFIG_HOME is the root (no /forge append);
 * empty/whitespace/missing → userConfigDir/forge.
 *
 * @param {{ env?: Record<string, string | null | undefined>, userConfigDir: string }} opts
 * @returns {string}
 */
export function resolveForgeConfigHome({ env = {}, userConfigDir }) {
  const raw = env[FORGE_CONFIG_HOME_ENV];
  if (raw != null) {
    const trimmed = String(raw).trim();
    if (trimmed) return trimmed;
  }
  return `${userConfigDir}/forge`;
}
