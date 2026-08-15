# forge-cli-node_cn3-paths — Extract gi-free config home

**Status:** ready — after CN2 (or with CN2 if the same agent still
has budget)  
**Plan:** [forge-cli-node](../plans/forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

`FORGE_CONFIG_HOME` resolution is one pure function. Node CLI and
GJS prefs/extension share it. This **is** the `lib/shared` purity
extract (D036) — not a mass-move of ConfigManager.

## Acceptance

- [ ] `lib/shared/paths.js` (pure): `FORGE_CONFIG_HOME_ENV`,
      `resolveForgeConfigHome({ env, userConfigDir })`
- [ ] Nest rule: non-empty `FORGE_CONFIG_HOME` **is** the root — do
      **not** append `/forge`
- [ ] Empty/whitespace env → `userConfigDir/forge`
- [ ] `lib/shared/forge-config-home.js` stays the GJS wrapper
      (`GLib.getenv` + `GLib.get_user_config_dir`) calling the pure
- [ ] `cli/keybind.mjs` uses the pure + `os.homedir()` /
      `path.join(..., ".config")`
- [ ] `tests/unit/shared/forge-config-home.test.js` tests the **pure**
      without GLib mocks (keep a thin wrapper test if cheap)
- [ ] No extract of `settings.js` / `config-sync.js` in this slice

## Context for the next agent (complete + succinct)

Existing wrapper: `lib/shared/forge-config-home.js` (23 lines).
Existing tests spy `GLib.getenv`. Prefer testing `resolveForgeConfigHome`
directly.

```bash
npm test -- tests/unit/shared/forge-config-home.test.js \
  tests/unit/cli/keybind.test.js
```

## Session note

**2026-08-14:** Task drafted at lock. This is the queued “shared
purity extract” — do not skip after CN2.
