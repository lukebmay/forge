# Multi-monitor

Forge maintains a separate tiling tree per monitor, per workspace. Each monitor's
default split direction follows its **own** geometry — portrait monitors split
vertically, landscape monitors split horizontally.

## Where new windows open

Forge uses an **open-app placement policy** (LFT = last focused **tile**):

| How the app opened | Monitor | Where it attaches |
| --- | --- | --- |
| **Dock / favorites** (when detected) | Sticky **dock’s** monitor | After last focused tile **on that monitor**, else empty monitor root |
| **Terminal / generic** | **Last focused tile’s** monitor (not the pointer, not the terminal’s seat) | After that tile (join tab/stack group, or aspect split) |
| **No tiles left** | Monitor **0** (first) for generic; dock still uses dock mon | Monitor root |

Floats (e.g. Guake) never become the last focused tile.

`new-window-placement` (Preferences → general settings) is a narrower knob:

- **`pointer`** (default label; OP1 behavior) — for **generic** opens, home follows
  **LFT’s monitor** as above (not the raw pointer monitor). Kept as the default
  id for existing configs.
- **`window-actual`** — home to the window’s own monitor (app-restored geometry).
  Attach still follows LFT when that LFT is on the same monitor.

Dock sticky homes always win when a dock launch is detected, regardless of this
setting.

If windows open on the "wrong" monitor: focus the tile you want as the parent
first, or try `window-actual` for apps that restore geometry aggressively.

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

## Identity boundary (gdisplays vs Forge)

| Tool | Responsibility |
| --- | --- |
| **shellrc `gdisplays`** | Physical display config: connectors, modes, primary, arrangement (`monitors.xml`). Named scenes and EDID-style identity live there. |
| **Forge** | Tiling **tree** per logical monitor. After thrash or index renumber, Forge remaps tree structure with best-effort **stable output keys** (connector name when Shell exposes it, else geometry). It does **not** call gdisplays or rewrite display config. |

If heads themselves are wrong (missing monitor, wrong primary, swapped cables at
the compositor level), fix with `gdisplays load <scene>` first, then retile
(`Super+Shift+r` if needed). Forge cannot invent EDID identity that Mutter did
not expose to GJS.

## Blank / wake and display thrash

After **idle auto-lock**, DPMS blank, or hybrid-GPU re-probe, GNOME can fire a
burst of `workareas-changed` while Mutter briefly reassigns windows to the
primary head. Forge **soft-rehomes** on a short settle: it maps each tiled window
back using last-quiet **stable output keys** when available, then geometry
intersection, and re-parents tree nodes without a full wipe when structure is
still consistent. Forest snapshots tag monitors with those keys so restore
survives Mutter index renumber of the same physical heads.

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
   first with shellrc `gdisplays load <scene>` (gdisplays owns that layer), then
   retile in Forge.
