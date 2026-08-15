# forge-cli-node_cn2-keybind — Node `forge keybind`

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md)  
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

- [x] `cli/keybind.mjs`: `save` `load` `status` `list` `dir`
- [x] Flags: `--dir`, `--dry-run`, `-v`/`--verbose`, `--json`
- [x] Imports `getKit` / `listKits` / `buildProfileProps` /
      `matchKitId` / `sanitizeProfileName` / `isReservedKitName` /
      `KEYBINDING_PRESET_KEYS` from shared — **no** second match
      implementation
- [x] Profiles dir: `FORGE_KEYBIND_PROFILES_DIR` → else
      `FORGE_CONFIG_HOME/config/keybinding-profiles` → else
      `~/.config/forge/config/keybinding-profiles`
- [x] D031: `vim`/`safe`/`i3` reserved; no `--reset`/`--profile`
- [x] Exit codes: status **0** if matched kit, **2** if custom, **1**
      on error; missing node **127**
- [x] `status --json` slim object: `matched`, `closest`,
      `diffCount`, `hint`, `diffs` (install parses `matched`)
- [x] `save` prints written path on stdout
- [x] `load` stderr
      `forge keybind: loaded kit:vim (N keys)` (`dry-run ` prefix)
- [x] `list` first line `# <dir>` then names; `dir` prints path
- [x] `node cli/keybind.mjs status --json` works without PATH forge
- [x] Python `forge keybind` argparse stays; handler `exec_cli`
- [x] `scripts/install.zsh` `_install_keybind_kit` calls
      `node "$repo/cli/keybind.mjs"`; missing node → warn, do not
      fail install
- [x] No `node -e` kit loader left in `keybind_kit.py`
- [x] Python apply/match/save **body gone** (shim only)
- [x] Vitest for paths / reserved / status JSON with injected `run()`
- [x] Prefs `lib/prefs/keyboard.js` **unchanged** (still imports
      presets + Gio)

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `cli/keybind.mjs` | Node body: gsettings/dconf I/O + shared presets; injectable `run()` |
| `scripts/forge/keybind_kit.py` | Argparse + `exec_cli("keybind.mjs", argv_after_keybind)` only |
| `scripts/install.zsh` | `_install_keybind_kit` → `node "$FORGE_REPO_ROOT/cli/keybind.mjs"` |
| `tests/unit/cli/keybind.test.js` | Vitest paths/reserved/status/save/load with mock run |
| `tests/unit/cli/test_keybind_kit.py` | Thin shim: argv slice + exec mock |

### Dispatch

```text
forge keybind load vim
  → argparse help/validate
  → exec_cli("keybind.mjs", ["load", "vim", …])
```

Standalone: `node cli/keybind.mjs load vim` (install path).

### Test

```bash
npm test -- tests/unit/shared/keybind-presets.test.js \
  tests/unit/cli/keybind.test.js
python3 -m pytest tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_keybind_kit.py -q
```

### Do not (still)

- prefs `spawn("forge keybind")`
- Touch job runner production argv
- Port layout / CN3 extract (duplicating profiles-dir rule in cli/ is OK)

## Session note

**2026-08-14:** CN2 done. `cli/keybind.mjs` imports shared presets;
Python body deleted (shim + exec); install uses Node; Vitest 58 +
pytest 14 green; live `status --json` matched vim, load dry-run 63
keys. Prefs untouched. Next: CN3 config-home pure extract.
