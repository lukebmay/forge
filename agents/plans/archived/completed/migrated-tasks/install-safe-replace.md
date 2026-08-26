# install-safe-replace

**Status:** done  
**Branch:** `task/install-safe-replace`  
**Created:** 2026-08-08  
**Completed:** 2026-08-08

## Goal

Never `rm -rf` a still-loaded Forge install (same UUID for EGO / jcrussell / luke).
Disable first, then replace.

## Acceptance

1. Any install that replaces an existing extension disables `forge@jmmaranan.com` before deleting/replacing the extension directory.
2. EGO migrate still works (backup + uninstall disable + install-only).
3. jcrussell / luke / unknown: disable → remove → install-only; checklist shows Disable previous.
4. `forge update` inherits via install.
5. Help documents safe replace of prior EGO/jcrussell/luke installs.
6. Tests mock FORGE_EXT_DIR / gnome-extensions; assert disable before rm.

## Session note

**What was wrong:** `forge_do_install` / luke·jcrussell path did `rm -rf "$FORGE_EXT_DIR"` while the extension could still be enabled/loaded → Shell freeze/logout risk.

**What fixed:**
- `forge_disable_extension` in `_lib.zsh` (stdout status: disabled|already-off|not-installed|skip|fail)
- `build-install.zsh` `forge_do_install`: disable before `rm -rf` (covers install-only + full path + rebuild/check-updates)
- `scripts/install.zsh`: checklist **Disable previous (lineage)**; help text
- `uninstall.zsh` / `install-ego.zsh`: shared helper
- CLI/README help: safe replace wording
- Tests: `tests/unit/cli/test_install_safe_replace.py` (5)

**How verified:** `pytest tests/unit/cli/test_install_safe_replace.py -v` → 5 passed; `zsh -n` on touched scripts.

**Residual risks:** best-effort if `gnome-extensions` missing or disable fails (warn, still replace); Shell may still need HUP for new code; dual disable (checklist + install-only) is intentional.
