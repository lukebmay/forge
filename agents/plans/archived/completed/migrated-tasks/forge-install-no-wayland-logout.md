# forge-install-no-wayland-logout — Install must not end Wayland session

**Status:** done  
**Branch:** master  
**Updated:** 2026-08-19  
**Agent:** Grok 4.5

## Goal

`./install` / `forge install` must **never** cause a Wayland host logout /
session death.

## Root

Journal 2026-08-19 10:52:27: install `disable` → `enable` →
`GNOME Shell crashed with signal 5` (stack in `keybindings.js` enable) → new
Shell + GDM session register. Looked like logout; killed agents.

## Fix (D048)

- `forge_live_extension_cycle_ok` — true only on X11 (or
  `FORGE_ALLOW_LIVE_EXTENSION_CYCLE=1`)
- Wayland install: skip live disable/enable; overlay files via
  `forge_install_temp_to_ext_dir` (rsync/python; no `rm -rf` of loaded dir)
- `forge_enable_extension` no longer force-disables first
- Checklist: tip deferred (nest or later logout); no “must log out to complete”
- L0: `test_install_safe_replace.py` **14** green

## Acceptance

- [x] Wayland install path does not call `gnome-extensions disable` on live Forge
- [x] X11 still disables before replace
- [x] Unit tests cover both
- [x] Decision D048

## Note

Do **not** re-run live `./install` on the operator desk to prove this unless
they ask — tip already has split-chrome removal; this change is installer-only.
