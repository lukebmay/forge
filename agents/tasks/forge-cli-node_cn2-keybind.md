# forge-cli-node_cn2-keybind — Node `forge keybind`

**Status:** ready — after CN1  
**Plan:** [forge-cli-node](../plans/forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**. Review with `grok-4.6` if
save/load JSON drifts from prefs.

## Goal

`forge keybind` and install `--kit=` use Node that **imports**
`lib/shared/keybind-presets.js`. Delete the Python kit body and the
`node -e` loader. Prefs stay on Gio (do **not** shell out to `forge`).

## Acceptance

- [ ] `cli/keybind.mjs`: `save` `load` `status` `list` `dir`
- [ ] Flags: `--dir`, `--dry-run`, `-v`/`--verbose`, `--json`
- [ ] Imports `getKit` / `listKits` / `buildProfileProps` /
      `matchKitId` / `sanitizeProfileName` / `isReservedKitName` /
      `KEYBINDING_PRESET_KEYS` from shared — **no** second match
      implementation
- [ ] Profiles dir: `FORGE_KEYBIND_PROFILES_DIR` → else
      `FORGE_CONFIG_HOME/config/keybinding-profiles` → else
      `~/.config/forge/config/keybinding-profiles`
- [ ] D031: `vim`/`safe`/`i3` reserved; no `--reset`/`--profile`
- [ ] Exit codes: status **0** if matched kit, **2** if custom, **1**
      on error; missing node **127**
- [ ] `status --json` slim object: `matched`, `closest`,
      `diffCount`, `hint`, `diffs` (install parses `matched`)
- [ ] `save` prints written path on stdout
- [ ] `load` stderr
      `forge keybind: loaded kit:vim (N keys)` (`dry-run ` prefix)
- [ ] `list` first line `# <dir>` then names; `dir` prints path
- [ ] `node cli/keybind.mjs status --json` works without PATH forge
- [ ] Python `forge keybind` argparse stays; handler `exec_cli`
- [ ] `scripts/install.zsh` `_install_keybind_kit` calls
      `node "$repo/cli/keybind.mjs"`; missing node → warn, do not
      fail install
- [ ] No `node -e` kit loader left in `keybind_kit.py`
- [ ] Python apply/match/save **body gone** (shim only)
- [ ] Vitest for paths / reserved / status JSON with injected `run()`
- [ ] Prefs `lib/prefs/keyboard.js` **unchanged** (still imports
      presets + Gio)

## Context for the next agent (complete + succinct)

### I/O

Live map via `gsettings` / `dconf` subprocess, schema
`org.gnome.shell.extensions.forge.keybindings` +
`mod-mask-mouse-tile`. Inject `run(cmd) -> {stdout,stderr,code}` for
tests. Mirror `keybind_kit.py` parse of `gsettings list-recursively`.

CN3 extracts `resolveForgeConfigHome`. For CN2, duplicating the
three-step profiles-dir rule in `cli/` is OK if you do not import
`gi://`.

### Test

```bash
npm test -- tests/unit/shared/keybind-presets.test.js \
  tests/unit/cli/keybind.test.js
python3 -m pytest tests/unit/cli/test_node_exec.py -q
# delete or shrink tests/unit/cli/test_keybind_kit.py in this slice
```

Smoke (needs live dconf; skip in CI if no schema):

```bash
forge keybind dir
forge keybind status --json; echo exit:$?
forge keybind load vim --dry-run
```

### Do not

- Make prefs `spawn("forge keybind")`
- Touch job runner production argv
- Port layout

## Session note

**2026-08-14:** Task drafted at lock. No code.
