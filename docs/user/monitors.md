# Multi-monitor

Forge maintains a separate tiling tree per monitor, per workspace. Each monitor's
default split direction follows its **own** geometry — portrait monitors split
vertically, landscape monitors split horizontally.

## Where new windows open

`new-window-placement` (Preferences → general settings):

- **`pointer`** (default) — a new window tiles on the monitor with the pointer /
  active window.
- **`window-actual`** — a new window tiles on the monitor it actually opened on
  (respects app-restored geometry).

If windows open on the "wrong" monitor, try switching this setting.

## Excluding a monitor from tiling

`monitor-skip-tile` — a comma-separated list of monitor **indices** to leave alone
(windows there are never tiled). Likewise `workspace-skip-tile` excludes whole
workspaces by index. Use these for a monitor dedicated to a floating app (chat,
media) — or as a workaround for the vertical-monitor limitation below.

## Known limitations

- **Vertical / portrait monitor setups are not fully supported** — focus and
  navigation across a portrait secondary monitor can misbehave. Excluding that
  monitor via `monitor-skip-tile` is the current workaround.
- **Dynamic workspaces are not supported** — use a fixed number of workspaces.

Hot-plugging a monitor is handled (the tree adds/repairs monitor nodes on
`monitors-changed`); if a layout looks wrong after a display change, reload with
`Super+Shift+r` and see [troubleshooting.md](troubleshooting.md).

## Blank / wake and display thrash

After **idle auto-lock**, DPMS blank, or hybrid-GPU re-probe, GNOME can fire a
burst of `workareas-changed` while Mutter briefly reassigns windows to the
primary head. Forge **soft-rehomes** on a short settle: it maps each tiled window
back to the monitor that best matches its last quiet geometry (intersection area)
and re-parents tree nodes without a full wipe when structure is still consistent.

Manual lock (`Super+Delete` / lock now) often **does not** thrash the same way as
overnight idle lock. To force the idle path for testing:

```bash
# Short idle → auto-lock (hands off keyboard/mouse ~15s), restores timers after unlock
./scripts/forge/trigger-idle-lock.zsh --idle 15

# Closest to overnight: idle lock then DPMS off (X11)
./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10

# DPMS only / immediate lock (controls)
./scripts/forge/trigger-idle-lock.zsh --dpms
./scripts/forge/trigger-idle-lock.zsh --lock-now

# If you interrupted mid-run:
./scripts/forge/trigger-idle-lock.zsh --restore-only
```

Or via `./scripts/forge/forge-ctl.zsh idle-lock --idle 15`.

If placement is still wrong after wake:

1. Wait a moment for the settle (sub-second).
2. Reload Forge config: `Super+Shift+r`.
3. If connectors themselves are wrong (wrong primary, missing head), fix displays
   first with shellrc `gdisplays load <scene>`, then retile.
