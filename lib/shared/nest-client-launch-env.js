/**
 * Nest Shell → client launch env (spill guard).
 *
 * Nested gnome-shell embeds on the *host* WAYLAND_DISPLAY. Children spawned
 * via DesktopAppInfo / SubprocessLauncher inherit that unless rewritten to
 * FORGE_NEST_* (nest compositor + private XDG). Incomplete rewrite lets
 * GApplication/GTK attach to the host desk.
 *
 * Mirrors scripts/forge/nested_wayland.py client_env() keys for launches.
 * Pure — no gi:// / node: / fs.
 */

/**
 * @param {{
 *   nestStateDir?: string | null,
 *   nestWaylandDisplay?: string | null,
 *   forgeHost?: string | null,
 *   forgeConfigHome?: string | null,
 * }} opts
 * @returns {Record<string, string>}
 */
/** Keys to unset (empty DISPLAY is treated as X11 :0 — host spill). */
export const NEST_CLIENT_UNSET_KEYS = Object.freeze([
  "DISPLAY",
  "DBUS_STARTER_ADDRESS",
  "DBUS_STARTER_BUS_TYPE",
]);

/** Strip agent-sandbox color/job env so spawned desks are normal. */
export const APPLY_LAUNCH_COLOR_UNSET_KEYS = Object.freeze([
  "NO_COLOR",
  "FORCE_COLOR",
  "CLICOLOR",
  "CLICOLOR_FORCE",
  "CARGO_TERM_COLOR",
  "PIP_NO_COLOR",
  "NPM_CONFIG_COLOR",
  "PY_COLORS",
  "PYTHON_COLORS",
  "FORGE_JOB",
  "FORGE_JOB_WORKER",
  "FORGE_JOB_ID",
  "FORGE_JOB_DIR",
]);

/** Nest-only: also drop DISPLAY (host X11 must keep it). */
export function applyLaunchUnsetEnvKeys(nest) {
  const keys = [...APPLY_LAUNCH_COLOR_UNSET_KEYS];
  if (nest) keys.push(...NEST_CLIENT_UNSET_KEYS);
  return keys;
}

export function nestClientLaunchEnvVars(opts = {}) {
  const out = {
    GSK_RENDERER: "cairo",
    LIBGL_ALWAYS_SOFTWARE: "1",
    GTK_USE_PORTAL: "0",
    GIO_USE_VFS: "local",
    XDG_SESSION_TYPE: "wayland",
    GDK_BACKEND: "wayland",
  };

  const nestWl = String(opts.nestWaylandDisplay ?? "").trim();
  if (nestWl) {
    out.WAYLAND_DISPLAY = nestWl;
  }

  const state = String(opts.nestStateDir ?? "").trim().replace(/\/+$/, "");
  if (state) {
    out.XDG_RUNTIME_DIR = `${state}/runtime`;
    out.XDG_CONFIG_HOME = `${state}/config-home`;
    out.XDG_CACHE_HOME = `${state}/cache`;
    out.XDG_DATA_HOME = `${state}/data`;
    out.HOME = `${state}/home`;
  }

  const host = String(opts.forgeHost ?? "").trim();
  if (host) out.FORGE_HOST = host;

  const configHome = String(opts.forgeConfigHome ?? "").trim();
  if (configHome) out.FORGE_CONFIG_HOME = configHome;
  else if (state) out.FORGE_CONFIG_HOME = `${state}/forge-config`;

  return out;
}
