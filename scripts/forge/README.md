# Forge install / settings migration scripts

Helpers to move between **extensions.gnome.org (EGO / SweetTooth)** Forge and
this tree (**jcrussell/forge**), while keeping prefs, keybindings, window rules,
and CSS.

Both builds share UUID `forge@jmmaranan.com`, so installs **replace each other
in place**. Always backup first.

## Settings safety (switch scripts)

`switch-to-jcrussell` / `switch-to-ego` are designed so prefs are hard to lose:

1. **Save first** — extension tree + full dconf dump + `~/.config/forge` under
   `~/.local/share/forge-manage/backups/`.
2. **Preflight** — refuses to uninstall if the backup dconf is empty/shorter than
   live, or if translate would drop most keys.
3. **Build before uninstall** — `install-jcrussell --build-only` while the old
   extension is still installed; only then remove + `--install-only`.
4. **Uninstall does not purge** — dconf and `~/.config/forge` stay on disk
   (never passes `--purge-dconf` / `--purge-config`).
5. **Apply is belt-and-suspenders** — reloads the backup after install; refuses
   empty dumps; verifies user keys (ignoring `css-last-update` stamps).
6. **Theme / colors** — jcrussell stores focus/split colors in
   `~/.config/forge/stylesheet/forge/stylesheet.css`. First enable can run
   `patchCss()` and overwrite that file when `css-last-update` ≠ `cssTag`.
   Switch/apply restore the backup stylesheet and stamp `css-last-update`
   **after enable**. Manual fix: `./scripts/forge/restore-theme.zsh [backup]`.
7. **Rollback** — `$BACKUP/emergency-rollback.zsh` or `rollback.zsh`.
8. **Shell reload** — on X11, `gnome-extensions info` may show a stale EGO
   Version until `killall -HUP gnome-shell` (or use `--restart-shell`).

Your keybindings and window rules live in dconf + `windows.json`. Colors live in
the user stylesheet (EGO gsettings color keys are only merged if the focus
border still looks stock).

## Quick start

### Fresh machine → jcrussell from this tree (no prior Forge)

```bash
cd ~/dev/me/forge_jcrussell   # clone first if needed
./scripts/forge/install-jcrussell.zsh   # npm + make dev/install
# log out/in (or X11: killall -HUP gnome-shell)
gnome-extensions enable forge@jmmaranan.com
./scripts/forge/status.zsh
```

### EGO/SweetTooth already installed → jcrussell (keep settings + colors)

```bash
cd ~/dev/me/forge_jcrussell
./scripts/forge/switch-to-jcrussell.zsh --force --restart-shell
# or interactive without --force
./scripts/forge/status.zsh
```

That one script: save → build → uninstall → install → apply dconf/CSS → enable →
re-restore theme (so `patchCss` cannot clobber colors).

### Colors look wrong after an upgrade

```bash
./scripts/forge/restore-theme.zsh ~/.local/share/forge-manage/backups/latest
# Super+Shift+r
```

### Host keyboard defaults (lock / quit / maximize)

`host-defaults.conf` + `apply-host-defaults.zsh` set:

| Action | Chord |
| --- | --- |
| Lock screen | `Super+Delete` (Forge `prefs-lock-screen`) |
| Close window | `Super+q` (GNOME) |
| Toggle maximize | `Super+Return` (GNOME `toggle-maximized`) |

Forge clears GNOME `screensaver` on enable (frees `Super+l` for focus-right), so
lock must use Forge’s binding, not Ubuntu’s Lock setting alone. Applied
automatically after `switch-to-jcrussell` / `install-jcrussell`; re-run anytime:

```bash
./scripts/forge/apply-host-defaults.zsh
```

### Rollback

```bash
./scripts/forge/rollback.zsh
# or: ./scripts/forge/switch-to-ego.zsh
```

## Commands

| Script | Role |
| --- | --- |
| `status.zsh` | Installed lineage, enabled state, dconf, backups |
| `save-settings.zsh` | Backup extension + dconf + `~/.config/forge` |
| `apply-settings.zsh` | Restore dconf (+ config + theme CSS); optional `--translate=` |
| `translate-settings.zsh` | Drop/remap keys when schemas differ |
| `restore-theme.zsh` | Restore stylesheet colors + stamp `css-last-update` |
| `install-ego.zsh` | Download+install from extensions.gnome.org |
| `uninstall.zsh` | Remove user extension (keeps dconf by default) |
| `install-jcrussell.zsh` | `npm install` + `make dev` from this repo |
| `check-updates.zsh` | `git fetch`/compare; optional `--ego` |
| `switch-to-jcrussell.zsh` | save → uninstall → install-jcrussell → apply |
| `switch-to-ego.zsh` | save → uninstall → install-ego → apply |
| `rollback.zsh` | Restore `extension/` from a backup |
| `forge-ctl.zsh` | Single entry: `forge-ctl <command> …` |

All scripts support `-h` / `--help`, `--force` (non-interactive), and
`--color=auto|always|never`.

## Where backups live

Default: `~/.local/share/forge-manage/backups/<label>/`

```
dconf-forge.conf          # dconf dump (prefs + keybindings)
config/                   # ~/.config/forge (windows.json, stylesheet)
extension/                # full installed extension (for rollback)
gsettings-*.txt           # human dumps when schemas resolve
meta.json                 # host, shell, lineage, timestamps
```

Symlink: `…/backups/latest` → most recent save.

Override root: `FORGE_BACKUP_ROOT=…` or `--backup-root=`.

## Settings model (important)

| Store | Path | Survives uninstall? |
| --- | --- | --- |
| GSettings / dconf | `/org/gnome/shell/extensions/forge/` | **Yes** (until `--purge-dconf`) |
| Window rules / CSS | `~/.config/forge/` | **Yes** (until `--purge-config`) |
| Extension code | `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` | No |

EGO and jcrussell **schemas are not identical**. Examples of EGO-only keys that
jcrussell dropped (appearance moved to CSS / new prefs):

- `focus-border-size`, `focus-border-color`, `split-border-color`
- `primary-layout-mode` (jcrussell uses `tiling-mode-enabled` + `default-window-layout`)

`translate-settings` / `apply --translate=jcrussell` filters the dconf dump so
only keys present in the target schema remain. Shared keys (gaps, tiling flags,
your keybindings) keep their values.

jcrussell also supports portable JSON via prefs (**Portability** →
`settings.json` / `keybindings.json`); these scripts use **dconf** so they work
for EGO too.

## Recommended recipes

### A. Safe trial of this fork (daily path)

```bash
./scripts/forge/switch-to-jcrussell.zsh
# log out / in
./scripts/forge/status.zsh
# stress dual-monitor blank/wake/retab (see agents/tasks/forge-fork-eval_spike.md)
```

### B. Manual steps (same as the switch script)

```bash
./scripts/forge/save-settings.zsh
./scripts/forge/uninstall.zsh
./scripts/forge/install-jcrussell.zsh
./scripts/forge/apply-settings.zsh --translate=jcrussell
# log out / in; enable if needed:
gnome-extensions enable forge@jmmaranan.com
```

### C. Go back to EGO v89

```bash
./scripts/forge/switch-to-ego.zsh
# or restore exact pre-switch files:
./scripts/forge/rollback.zsh ~/.local/share/forge-manage/backups/switch-jcrussell-…
```

### D. Pull new jcrussell commits later

```bash
./scripts/forge/check-updates.zsh --fetch
./scripts/forge/check-updates.zsh --pull --install   # ff-only pull + make dev
```

### E. Reinstall EGO without touching settings

```bash
./scripts/forge/install-ego.zsh --force
# dconf already has your prefs
```

## Dependencies

| Action | Tools |
| --- | --- |
| All | `zsh`, `python3`, `dconf`, `gnome-extensions` |
| install-ego | `curl`, `unzip` |
| install-jcrussell | `node` ≥ 20, `npm`, `make`, gettext, `glib-compile-schemas` |
| check-updates | `git` (+ `curl` for `--ego`) |

## Env vars

| Variable | Default |
| --- | --- |
| `FORGE_UUID` | `forge@jmmaranan.com` |
| `FORGE_BACKUP_ROOT` | `~/.local/share/forge-manage/backups` |
| `FORGE_REPO_ROOT` | repo root containing `scripts/forge` |
| `FORGE_FORCE` | `0` — set `1` for non-interactive yes |
| `FORGE_COLOR` | `auto` |
