# forge-install-reapply-kit — install --kit + stale-kit warning

**Status:** ready (L0 green)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Daily install can reset + apply a kit (`--kit=vim`). Without that flag,
install keeps live chords and warns when they match no built-in kit.

## Acceptance

- [x] `./install --kit=vim` / `forge install --kit=vim` / `forge update --kit=vim`
- [x] `--kit` backups live, `gsettings reset-recursively` the keybind schema, applies kit
- [x] Default install does **not** rewrite keys
- [x] After install, warn when `forge keybind status` is custom
- [x] `forge keybind status` / `apply --reset`
- [x] L0: match/diff without gsettings

## Context for the next agent (complete + succinct)

- Canonical: `scripts/forge/keybind_kit.py` (`match_kit_id` = JS `matchKitId`)
- Install hook: `_install_keybind_kit` in `scripts/install.zsh`
- Not default-on: Safe remains schema default; operator asked for an
  **option** + warning, not silent Vim every install
- Saved profile JSON files are not deleted (`--reset` is dconf only)

```bash
python3 -m pytest tests/unit/cli/test_keybind_kit.py -q
```

## Session note

2026-08-13: Super+Enter missed on green because install left old Vim
dconf. Operator wants `--kit=vim` on most installs + a stale-kit warn.
