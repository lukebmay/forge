# Task — FC3: forge settings get/set/save/load

**Status:** Done (A/B **AGREE**)
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

Scripts and agents need to read/write Forge GSettings and snapshot portable
config without opening prefs. ConfigSync already round-trips settings.json /
keybindings.json; expose get/set + named profile save/load via DBus + CLI.

## Goals

1. **DBus** (extend SessionApi):
   - `GetSetting(key: s) → s` JSON `{ok, key, value, type?}` or error
   - `SetSetting(key: s, value_json: s) → s` JSON ok/error
   - `SettingsSave(name: s) → s` write named profile under
     `~/.config/forge/profiles/<name>/` (settings + keybindings portable JSON)
   - `SettingsLoad(name: s) → s` import named profile into live GSettings
     (+ update portable files if that's ConfigSync's normal import path)
2. Keys: portable keys from `SETTINGS_KEYS` / `KEYBINDING_KEYS` (and string keys);
   reject unknown keys with clear error. Support bool/int/uint/string/strv via
   existing ConfigSync get/set helpers if public, or thin wrappers.
3. **CLI**:
   - `forge get <key>`
   - `forge set <key> <value>` (parse JSON or plain string/bool/number)
   - `forge settings save <name>`
   - `forge settings load <name>`
4. Unit tests for pure key allowlist / value parse where extractable; `npm test`.
5. DESIGN short note; no FC4 batch.

## Acceptance

- [x] Get/Set known keys via DBus + CLI
- [x] Unknown key → error JSON / exit non-zero
- [x] Save/load named profile round-trip (unit or mock where possible)
- [x] Reuses ConfigSync / GSettings — no parallel settings store
- [x] `npm test` green (1813 passed)
- [x] No RunSteps (FC4), workon (FC5)

## Out of scope

- Editing windows.json overrides (unless trivial existing API)
- CSS/theme color CLI
- Full dconf dump

## Session note

**(B 2026-07-25) AGREE.** Verified allowlist, fail-closed unknown/ambiguous keys,
profile save/load (ConfigSync + ConfigManager), DBus/CLI surface, no FC4/FC5,
enable/disable teardown, DESIGN. `npm test` **1813** green. No code fixes.

| Piece | Path / signature |
| --- | --- |
| Key allowlists | `lib/shared/settings-keys.js` (re-exported from config-sync) |
| Pure allowlist/coercion | `lib/shared/settings-control.js` — `resolvePortableKey`, `parseSettingValueText`, `coerceForGSettingsType` |
| ConfigSync | `getPortable` / `setPortable` / `buildPortableProps` / `applyPortableProps` / `saveNamedProfile` / `loadNamedProfile` |
| ConfigManager | `saveSettingsProfile` / `loadSettingsProfile` → `~/.config/forge/profiles/<name>/` |
| DBus | `GetSetting(s)`, `SetSetting(s,s)`, `SettingsSave(s)`, `SettingsLoad(s)`; `SESSION_API_VERSION=4` |
| CLI | `forge get/set`, `forge settings save\|load`; version `fc3` |
| Tests | `tests/unit/shared/settings-control.test.js` + ConfigSync portable/profile cases |

Ambiguous `focus-border-toggle` needs `settings:` or `kbd:` prefix.

**Orchestrator:** move task → `agents/plans/forge-command/completed/`; plan next FC4.


## Session note

**B AGREE.** apiVersion 4; 1813 tests; profiles under ~/.config/forge/profiles/.
