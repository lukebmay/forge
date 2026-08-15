# forge-cli-node_cn3-paths — Extract gi-free config home

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

`FORGE_CONFIG_HOME` resolution is one pure function. Node CLI and
GJS prefs/extension share it. This **is** the `lib/shared` purity
extract (D036) — not a mass-move of ConfigManager.

## Acceptance

- [x] `lib/shared/paths.js` (pure): `FORGE_CONFIG_HOME_ENV`,
      `resolveForgeConfigHome({ env, userConfigDir })`
- [x] Nest rule: non-empty `FORGE_CONFIG_HOME` **is** the root — do
      **not** append `/forge`
- [x] Empty/whitespace env → `userConfigDir/forge`
- [x] `lib/shared/forge-config-home.js` stays the GJS wrapper
      (`GLib.getenv` + `GLib.get_user_config_dir`) calling the pure
- [x] `cli/keybind.mjs` uses the pure + `os.homedir()` /
      `path.join(..., ".config")`
- [x] `tests/unit/shared/forge-config-home.test.js` tests the **pure**
      without GLib mocks (keep a thin wrapper test if cheap)
- [x] No extract of `settings.js` / `config-sync.js` in this slice

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `lib/shared/paths.js` | Pure: `FORGE_CONFIG_HOME_ENV`, `resolveForgeConfigHome` (no gi/node/fs/process) |
| `lib/shared/forge-config-home.js` | GJS wrapper re-exports env const; `forgeConfigHome`/`forgeConfigDir` unchanged API |
| `cli/keybind.mjs` | `resolveProfilesDir` → pure + `path.join(os.homedir(), ".config")` |
| `tests/unit/shared/forge-config-home.test.js` | Pure cases + thin GLib wrapper spies |

### Test / smoke

```bash
npm test -- tests/unit/shared/forge-config-home.test.js \
  tests/unit/cli/keybind.test.js
node cli/keybind.mjs dir
node cli/keybind.mjs status --json
```

28 Vitest PASS. Live: dir + status matched vim.

### Next

CN4 — DBus adapter + `ping` + `tree`. Do not extract settings/config-sync.

## Session note

**2026-08-14:** Pure `paths.js` extract; GJS wrapper thinned; keybind
CLI shares resolve. Nest env rule preserved. Settings/config-sync
untouched.
