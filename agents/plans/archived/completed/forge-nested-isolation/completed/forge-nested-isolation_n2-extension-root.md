# forge-nested-isolation_n2-extension-root — Nest Shell / extension data root

**Status:** done  
**Plan:** [forge-nested-isolation](../../forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** N1 done (CLI contract for data root)

## Goal

Nested gnome-shell + Forge extension must **not** mutate parent
`~/.config/forge` (windows.json, settle-heuristics seed, styles, profiles).

## Acceptance

- [x] Nest shell start env sets isolation consistent with N1
      (`FORGE_CONFIG_HOME` + `FORGE_HOST` on nest **shell** process; no full
      `XDG_CONFIG_HOME` rewrite)
- [x] Extension confDir / settle seed / session-layout paths use nest root when
      isolated (`forgeConfigHome()` / `forgeConfigDir()`)
- [x] Live: nest enable wrote nest `forge-config/{config,stylesheet}`; parent
      `~/.config/forge/config/{windows,settle-heuristics}.json` mtime+sha unchanged
- [x] Host: unset `FORGE_CONFIG_HOME` → `~/.config/forge` (units + host still
      pings; in-memory host code pre-reload until operator reloads Shell)
- [x] Units: JS `forge-config-home` + confDir; Python `shell_start_env` FORGE_*

## Context for the next agent

- **Helper:** `lib/shared/forge-config-home.js` — `forgeConfigHome()` /
  `forgeConfigDir()`. Env set → that path **is** the forge root (no `/forge`
  append). Unset → `GLib.get_user_config_dir()/forge`.
- **Wired:** ConfigManager `confDir`; settle seed in `window.js`; session
  layout trace in `session-layout-restore.js`; prefs keyboard fallback.
- **Nest shell:** `scripts/forge/nested_wayland.py` `shell_start_env` exports
  same `FORGE_CONFIG_HOME` / `FORGE_HOST` as `client_env`; `ensure_nest_cli_dirs`.
- **Remaining shared (intentional):** install UUID on disk; layout profiles
  (`FORGE_LAYOUT_DIR` / shared `layout/`); gsettings/dconf schemas.
- **Tests:** `tests/unit/shared/forge-config-home.test.js`, confDir cases in
  `settings.test.js`, `test_nested_wayland.py` shell env asserts.
- **Live (2026-08-10):** `forge install --no-restart` then
  `forge nested run -- forge ping` → nest version dirty; nest wrote
  `…/nested/forge/forge-config/config/windows.json` + stylesheet; parent
  mtimes OK; `running: False`.

## Session note

N2 implemented 2026-08-10. Approach: single conf-root helper + nest shell env,
not XDG rewrite. Units green; live mon=1 isolation OK; nest stopped.
