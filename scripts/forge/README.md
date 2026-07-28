# Forge scripts

Helpers for **installing**, **backing up**, and **migrating** this Forge tree
([lukebmay/forge](https://github.com/lukebmay/forge)). Day-to-day tiling control
is the **`forge`** CLI (DBus), not these zsh tools.

UUID is always `forge@jmmaranan.com`. Any install **replaces** the live
extension in place — backup first if you care about a previous build.

## Preferred user path

```bash
# From a clone of lukebmay/forge
./install                 # build → install → enable → CLI → reload Shell (X11)

forge ping
forge tree
forge install             # re-run from stamped install origin
forge update              # clean master: fetch → pull if new → always install
forge uninstall           # extension + forge-owned CLI; keeps prefs
```

`./install` (and `forge install`) stamps
`~/.local/share/forge-manage/install-origin.json` so later reinstalls know which
git tree to use. It also symlinks `~/.local/bin/forge` → this tree’s CLI.

| Current install | What `./install` does |
| --- | --- |
| none / unknown | build + install this tree |
| luke / jcrussell | in-place rebuild from this tree |
| EGO / SweetTooth | full migrate (`migrate-from-ego`: backup + translate settings) |

Default output is a short ✓/✗ checklist. Use `--verbose` / `FORGE_VERBOSE=1` for
full make/npm chatter. Opt out of Shell reload with `--no-restart`.

```bash
./install --no-restart
./install --verbose
./scripts/forge/status.zsh
```

## Control CLI (`forge`)

User-facing control plane. Talks to the **enabled** extension over DBus
(`org.gnome.Shell.Extensions.Forge`). Install/uninstall/update do **not** need
DBus.

```bash
forge help
forge ping
forge tree
forge tree --monitor=0 --compact
forge focus 'class:Google-chrome'
forge launch nautilus
forge launch nautilus --path=mo1ws0/1/1
forge launch ghostty --monitor=1

# Batch steps + named layouts
forge run-steps '[{"op":"focus","selector":"class:Foo"}]'
forge run ./scripts/forge/examples/layout-dev.json
forge layout help
forge layout list
forge layout save mydesk
forge layout mydesk --dry-run
forge layout mydesk
```

`launch` resolves short names via XDG `.desktop` files, infers `wm_class`, and
waits for the new window. Default placement: LFT attach (see product docs).
`--path` / `--monitor` set PlaceNext. Path ids are mon×ws keys (`mo0ws0`).

### Layout profiles

**Tree root:** `FORGE_LAYOUT_DIR` if set, else `~/.config/forge/layout`
(same as `layout save`). `FORGE_HOST` overrides the short hostname.

Resolve order (show / apply — first hit wins):

```text
1. FORGE_LAYOUT_PATH                         # if set, exists, stem == name
2. <tree>/hosts/<host>/<name>.json
3. <tree>/hosts/<host>/<name>/profile.json
4. <tree>/common/<name>.json
5. <tree>/<name>.json                        # flat
6. ~/.config/forge/layout/<name>.json        # flat XDG when tree root differs
```

`forge layout list` is **this host only** (`hosts/<host>/…`): Name + Description
table on a TTY; JSON `[{name,description}]` when stdout is piped. Description is
file text or an auto one-liner. Common/flat/env-path profiles are not listed.

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (`tiles` or `roles` + layout) | GetTree → plan → open gaps, move/keep; idempotent |
| **v1 steps** | optional displays → SettingsLoad → mixed `steps` |
| **`--dry-run`** | plan only; no mutations |
| **`--force-launch`** | require `steps[]`; skip reconcile |
| **`--clean`** | close residuals (Meta delete) instead of leave/park |

Examples: `examples/layout-tiles-minimal.json`, `layout-tiles-nested.json`,
`layout-minimal.json`, `layout-dev-v2.json`. User guide: [docs/user/layout.md](../../docs/user/layout.md).

Deps: `python3` + `python3-gi` (preferred) or `gdbus`; `gio` or `gtk-launch`
for desktop ids. Extension must be enabled for DBus ops.

## Settings safety (migrate from EGO)

`migrate-from-ego` / `switch-to-ego` keep prefs hard to lose:

1. **Save first** — extension tree + full dconf dump + `~/.config/forge` under
   `~/.local/share/forge-manage/backups/`.
2. **Preflight** — refuses to uninstall if the backup dconf is empty/shorter than
   live, or if translate would drop most keys.
3. **Build before uninstall** — `build-install --build-only` while the old
   extension is still installed; only then remove + `--install-only`.
4. **Uninstall does not purge** — dconf and `~/.config/forge` stay on disk.
5. **Apply is belt-and-suspenders** — reloads the backup after install; verifies
   user keys (ignoring `css-last-update` stamps).
6. **Theme / colors** — focus/split colors live in
   `~/.config/forge/stylesheet/forge/stylesheet.css`. First enable can run
   `patchCss()` and overwrite that file; migrate restores the backup stylesheet
   and stamps `css-last-update` after enable. Manual fix:
   `./scripts/forge/restore-theme.zsh [backup]` then
   `./scripts/forge/reload-theme.zsh`.
7. **Rollback** — `$BACKUP/emergency-rollback.zsh` or `rollback.zsh`.

## Recipes

### Fresh machine (no prior Forge)

```bash
git clone https://github.com/lukebmay/forge.git
cd forge
./install
forge tree
./scripts/forge/status.zsh
```

### Already on EGO/SweetTooth → this tree

```bash
./install
# or explicitly:
./scripts/forge/migrate-from-ego.zsh --force
./scripts/forge/status.zsh
```

### Pick up local tree changes (already on this fork)

```bash
./install
# or:
forge install
# or low-level:
./scripts/forge/rebuild.zsh
```

### Colors look wrong after an upgrade

```bash
./scripts/forge/restore-theme.zsh ~/.local/share/forge-manage/backups/latest
./scripts/forge/reload-theme.zsh
# or Super+Shift+r
```

### Blank / wake test (soft rehome)

```bash
./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10
# after unlock: both heads tiled? retab? journal clean?
./scripts/forge/trigger-idle-lock.zsh --restore-only   # if you aborted
```

### Host keyboard defaults (lock / quit / maximize)

`host-defaults.conf` + `apply-host-defaults.zsh` set:

| Action | Chord |
| --- | --- |
| Lock screen | `Super+Delete` (Forge `prefs-lock-screen`) |
| Close window | `Super+q` (GNOME) |
| Toggle maximize | `Super+Return` (GNOME `toggle-maximized`) |

Applied automatically after install/migrate; re-run anytime:

```bash
./scripts/forge/apply-host-defaults.zsh
```

### Roll back to a backup or EGO

```bash
./scripts/forge/rollback.zsh
# or reinstall extensions.gnome.org build:
./scripts/forge/switch-to-ego.zsh
```

## Script inventory

| Script | Role |
| --- | --- |
| `../install.zsh` (root `./install`) | **Preferred:** lineage-aware install + origin stamp + CLI |
| `build-install.zsh` | Low-level `npm`/`make` build + copy to extension dir |
| `rebuild.zsh` | Build+install this tree over a live non-EGO install |
| `migrate-from-ego.zsh` | save → build → uninstall → install → apply (from EGO) |
| `install-ego.zsh` | Download+install from extensions.gnome.org |
| `switch-to-ego.zsh` | save → uninstall → install-ego → apply |
| `uninstall.zsh` / `forge uninstall` | Remove extension + forge-owned CLI (keeps dconf) |
| `status.zsh` | Installed lineage, enabled state, dconf, backups |
| `save-settings.zsh` | Backup extension + dconf + `~/.config/forge` |
| `apply-settings.zsh` | Restore dconf (+ config + theme CSS); optional `--translate=` |
| `translate-settings.zsh` | Drop/remap keys when schemas differ |
| `restore-theme.zsh` / `reload-theme.zsh` | Stylesheet colors + live CSS reload |
| `trigger-idle-lock.zsh` | Short idle / DPMS lock for blank/wake testing |
| `check-updates.zsh` | `git fetch`/compare; optional `--ego` |
| `rollback.zsh` | Restore `extension/` from a backup |
| `forge-ctl.zsh` | Multi-command front-end for the zsh helpers above |
| `forge` | **Tiling** control CLI (DBus + layout + install) |

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

## Settings model

| Store | Path | Survives uninstall? |
| --- | --- | --- |
| GSettings / dconf | `/org/gnome/shell/extensions/forge/` | **Yes** (until `--purge-dconf`) |
| Window rules / CSS | `~/.config/forge/` | **Yes** (until `--purge-config`) |
| Extension code | `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` | No |

EGO and this tree’s **schemas are not identical**. Examples of EGO-only keys
that the community schema dropped (appearance moved to CSS / new prefs):

- `focus-border-size`, `focus-border-color`, `split-border-color`
- `primary-layout-mode` (this tree uses `tiling-mode-enabled` + `default-window-layout`)

`translate-settings` / `apply --translate=jcrussell` filters the dconf dump so
only keys present in the target schema remain (`jcrussell` here means “this
schema family,” including lukebmay builds). Shared keys (gaps, tiling flags,
keybindings) keep their values.

Portable JSON via prefs (**Portability** → `settings.json` / `keybindings.json`)
is also supported; these scripts use **dconf** so EGO migrate works too.

## Dependencies

| Action | Tools |
| --- | --- |
| All | `zsh`, `python3`, `dconf`, `gnome-extensions` |
| install-ego | `curl`, `unzip` |
| install / build-install / rebuild | `node` ≥ 20, `npm`, `make`, gettext, `glib-compile-schemas` |
| check-updates | `git` (+ `curl` for `--ego`) |
| forge (DBus) | `python3-gi` or `gdbus` |

## Env vars

| Variable | Default |
| --- | --- |
| `FORGE_UUID` | `forge@jmmaranan.com` |
| `FORGE_BACKUP_ROOT` | `~/.local/share/forge-manage/backups` |
| `FORGE_REPO_ROOT` | repo root containing `scripts/forge` |
| `FORGE_FORCE` | `0` — set `1` for non-interactive yes |
| `FORGE_COLOR` | `auto` |
| `FORGE_VERBOSE` | `0` — set `1` for detailed install logs |
| `FORGE_LAYOUT_DIR` | unset → `~/.config/forge/layout`; else tree root for hosts/common |
| `FORGE_HOST` | short hostname for host profile paths |
