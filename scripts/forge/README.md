# Forge install / settings migration scripts

Helpers to move between **extensions.gnome.org (EGO / SweetTooth)** Forge and
this product tree ([lukebmay/forge](https://github.com/lukebmay/forge), lineage
`luke`; Phase A base was **jcrussell/forge**), while keeping prefs, keybindings,
window rules, and CSS.

Script names `install-jcrussell` / `switch-to-jcrussell` / `update-jcrussell`
are historical: they mean **non-EGO / this-family tree**, not “community only.”
Lineage id (`ego` | `jcrussell` | `luke` | `none` | `unknown`) distinguishes
installs.

## Install from this tree

Project root **`./install`** (or `./install.zsh` / `scripts/install.zsh`) puts the
**on-disk** repo live. It detects the current lineage:

| Current install | What runs |
| --- | --- |
| none / unknown | build + install this tree |
| luke / jcrussell | in-place update from this tree |
| EGO / SweetTooth | full migrate (`switch-to-jcrussell`: backup + translate settings) |

After install, origin is stamped at
`~/.local/share/forge-manage/install-origin.json` so later:

```bash
forge install --force          # re-runs that tree's scripts/install.zsh
forge update                   # clean master only: fetch → pull if new → install
```

`forge update` refuses a dirty tree or any branch other than **`master`**. If
`origin/master` has nothing new, it exits 0 without reinstalling.

Install also symlinks the control CLI to **`~/.local/bin/forge`** (XDG user
bin). Uninstall removes that symlink only when it is forge-owned:

```bash
forge uninstall                # extension + CLI; keeps prefs
forge uninstall --purge-config # also wipe ~/.config/forge
```

If the clone was removed, `forge install` errors (no silent wrong tree). EGO
reinstall via `forge install` is reserved for later.

```bash
./install                      # quiet checklist; no prompts for routine paths
./install --no-restart         # files only; reload Shell yourself
./install --verbose            # full make/npm/gsettings chatter
forge tree                     # once ~/.local/bin is on PATH
./scripts/forge/status.zsh     # shows install origin + CLI bin
```

Default install output is a short ✓/✗ checklist (Build, Install extension,
Enable, Host defaults, CLI, Reload shell). Nested tools are silenced unless a
step fails (then the log tail is shown). Use `--verbose` or `FORGE_VERBOSE=1`
for the old detailed logs. EGO → this tree migrates with auto-backup (no Y/n).

## Tiling control CLI (`forge`)

User-facing control plane (FC0+). Talks to the **enabled** extension over DBus
(`org.gnome.Shell.Extensions.Forge`). **Not** the same as `forge-ctl` (install /
migrate) — except `forge install`, which is origin-aware reinstall (no DBus).

```bash
./scripts/forge/forge ping          # health JSON; exit 0 if ok
./scripts/forge/forge tree          # pretty JSON forest (paths = moNwsW/i/j…)
./scripts/forge/forge tree --monitor=0 --compact
./scripts/forge/forge focus 'class:Google-chrome'

# Human-friendly launch: short name; auto desktop + wm_class; optional --path
./scripts/forge/forge launch nautilus
./scripts/forge/forge launch nautilus --path=mo1ws0/1/1
./scripts/forge/forge launch nautilus --monitor=1
./scripts/forge/forge launch calculator --path=mo0ws0
./scripts/forge/forge launch ghostty --monitor=1

# Explicit still works for scripts
./scripts/forge/forge launch org.gnome.Nautilus.desktop --wm-class=org.gnome.Nautilus
./scripts/forge/forge install --force   # origin-aware reinstall (git tree)
./scripts/forge/forge update            # fetch+pull master (clean) then install
```

`launch` resolves short names via XDG `.desktop` files, infers `wm_class`, and
waits for the new window (no `--wm-class` required). Default placement: OP1 LFT
attach. `--path` / `--tree-path` and `--monitor` set PlaceNext. Path ids are OG
Forge mon×ws keys (`mo0ws0`); see `forge launch -h`.

### Batch steps + workon (FC4–FC6)

```bash
# Extension-only batch (quiet render) — rejects launch/wait
./scripts/forge/forge run-steps '[{"op":"focus","selector":"class:Foo"}]'

# Mixed script file (launch + tree ops; CLI orchestrates chunks)
./scripts/forge/forge run ./scripts/forge/examples/workon-dev.json

# Named profile (does NOT replace shellrc `workon` — always `forge workon`)
# Prefer shellrc host tree (multi-machine); XDG is the local fallback:
export FORGE_WORKON_DIR=$shellrc/configs/forge/workon   # hosts/<host>/<name>.json
# or: cp ./scripts/forge/examples/workon-dev-v2.json ~/.config/forge/workon/dev.json
./scripts/forge/forge workon help             # colorized guide + defaults
./scripts/forge/forge workon list
./scripts/forge/forge workon show dev
./scripts/forge/forge workon capture          # tiles sugar sketch from tree (stdout)
./scripts/forge/forge workon capture --tree-file forest.json
./scripts/forge/forge workon capture --out ~/.config/forge/workon/sketch.json
./scripts/forge/forge workon dev              # v1 steps or v2 reconcile
./scripts/forge/forge workon dev --dry-run    # plan only (no mutations)
./scripts/forge/forge workon dev --force-launch  # imperative steps[] only
```

**Authoring:** prefer compact **`tiles`** sugar (desugars to v2 IR). Examples:
`workon-tiles-minimal.json`, `workon-tiles-nested.json`, `workon-minimal.json`
(IR), `workon-dev-v2.json` (richer IR sample). Host profiles + resolve docs:
`$shellrc/configs/forge/workon/README.md` (black `dev` is sugar).

**Profile path resolve** (list / show / run):

```text
1. FORGE_WORKON_PATH                         # if set, exists, stem == name
2. $FORGE_WORKON_DIR/hosts/<host>/<name>.json
3. $FORGE_WORKON_DIR/hosts/<host>/<name>/profile.json
4. $FORGE_WORKON_DIR/common/<name>.json
5. ~/.config/forge/workon/<name>.json        # XDG
```

`FORGE_HOST` overrides hostname (else short hostname). When `FORGE_WORKON_DIR`
is unset, only PATH + XDG apply — export from shellrc:

```bash
export FORGE_WORKON_DIR=$shellrc/configs/forge/workon
# export FORGE_HOST=black   # optional override
```

Forge does not hardcode shellrc paths.

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (`tiles` or `roles` + layout) | GetTree → plan → open gaps, move/keep/park; idempotent |
| **v1 steps** | optional `gdisplays` → `SettingsLoad` → mixed `steps` |
| **`--dry-run` / `plan`** | print counts + plan JSON; no launch/RunSteps |
| **`--force-launch`** | require `steps[]`; skip reconcile |
| **`--clean`** | close residuals (Meta delete) instead of park; roles/keeps stay |
| **`--clean --force`** | stronger delete (skip can_close); never process-kill |
| **`--tree-file PATH`** | offline forest for dry-run (no live GetTree) |

Defaults: `marginal.mode=coexist` (slot companions **kept**), residuals
park to overflow; `strict` parks all unclaimed. Pure helpers:
`workon_lib.py` (resolve), `workon_plan.py` (normalize + planner),
`workon_apply.py` (action→steps / mode), `workon_capture.py` (tree → tiles
sugar). User guide: `docs/user/workon.md`.
Design: `docs/DESIGN.md`.

Deps: `python3` + `python3-gi` (preferred) or `gdbus`; `gio` or `gtk-launch`
for desktop ids. Extension must be enabled for DBus / wait / PlaceNext.
Optional: `gdisplays` on PATH when a profile sets `displays`.

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
   **after enable**. Manual fix: `./scripts/forge/restore-theme.zsh [backup]`
   then `./scripts/forge/reload-theme.zsh` (no reboot). `make dev` still loads
   the user stylesheet (logging-only debug flag).
7. **Rollback** — `$BACKUP/emergency-rollback.zsh` or `rollback.zsh`.
8. **Shell reload** — on X11, `gnome-extensions info` may show a stale EGO
   Version until `killall -HUP gnome-shell` (or use `--restart-shell`).

Your keybindings and window rules live in dconf + `windows.json`. Colors live in
the user stylesheet (EGO gsettings color keys are only merged if the focus
border still looks stock).

## Quick start

### Fresh machine → this tree (no prior Forge)

```bash
cd ~/dev/me/forge   # lukebmay/forge (or your clone)
./scripts/forge/install-jcrussell.zsh   # npm + make dev/install
# log out/in (or X11: killall -HUP gnome-shell)
gnome-extensions enable forge@jmmaranan.com
./scripts/forge/status.zsh   # lineage=luke when origin is lukebmay
```

### EGO/SweetTooth already installed → this tree (keep settings + colors)

```bash
cd ~/dev/me/forge
./scripts/forge/switch-to-jcrussell.zsh --force --restart-shell
# or interactive without --force
./scripts/forge/status.zsh
```

That one script: save → build → uninstall → install → apply dconf/CSS → enable →
re-restore theme (so `patchCss` cannot clobber colors).

### Already on luke/jcrussell → pick up local tree changes (daily loop)

```bash
cd ~/dev/me/forge
./scripts/forge/update-jcrussell.zsh
# or: forge-ctl update --force
# optional: --save  --reload-theme  --prod  --restart-shell
```

Builds this repo, replaces `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com`,
and enables. **Does not restart Shell by default** — reload yourself so new
code/gschema keys load (X11: `Alt+F2` → `r`, or `killall -HUP gnome-shell`;
Wayland: log out/in). Pass `--restart-shell` only if you want an automatic X11 HUP.

If the install is still EGO, the script refuses and points at `switch-to-jcrussell`
(or pass `--from-ego` to run that migrate path).

### Colors look wrong after an upgrade

```bash
./scripts/forge/restore-theme.zsh ~/.local/share/forge-manage/backups/latest
# live reload (no reboot):
./scripts/forge/reload-theme.zsh
# or Super+Shift+r
```

### Blank / wake test (soft rehome)

Manual lock often keeps placement; idle auto-lock is what thrashs multi-mon:

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
| Toggle maximize | `Super+Return` (GNOME `toggle-maximized`; multi-tile full max → float so it sticks) |

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
| `reload-theme.zsh` | Bump `css-updated` so a live Shell reloads user CSS |
| `trigger-idle-lock.zsh` | Short idle / DPMS lock for blank/wake testing |
| `../install.zsh` (root `./install`) | **Preferred:** lineage-aware install from this tree + origin stamp + `~/.local/bin/forge` |
| `install-ego.zsh` | Download+install from extensions.gnome.org |
| `uninstall.zsh` / `forge uninstall` | Remove extension + forge-owned CLI (keeps dconf by default) |
| `install-jcrussell.zsh` | `npm install` + `make dev` from this repo |
| `update-jcrussell.zsh` | Daily: build+install this tree (restart Shell yourself; optional `--restart-shell`) |
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
