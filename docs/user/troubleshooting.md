# Troubleshooting

## First steps

- **Reload config** — `Super+Shift+r` re-reads `windows.json` / `keybindings.json`
  from disk without restarting.
- **Restart GNOME Shell** — on X11, `Alt+F2` → `r` → Enter. On Wayland, log out and
  back in.
- **Check it's enabled** — `gnome-extensions list --enabled` should include
  `forge@jmmaranan.com`.

## A window won't tile (or won't float)

It probably matches a rule. Check **Preferences → Windows** and
`~/.config/forge/config/windows.json` for an override on its class, and confirm
`tiling-mode-enabled` is on and the workspace/monitor isn't excluded
(`workspace-skip-tile` / `monitor-skip-tile`). See [rules.md](rules.md) and
[monitors.md](monitors.md).

## Stacked / tabbed shortcuts do nothing

Stacked and tabbed are **on by default**. If the shortcuts no-op, the modes were
turned off — confirm `stacked-tiling-mode-enabled` / `tabbed-tiling-mode-enabled`
are enabled in **Preferences → Tiling → Behavior**. See [layouts.md](layouts.md).

## After lock / blank, all windows on one monitor

Forge debounces workarea thrash and soft-rehomes from last known geometry (see
[monitors.md](monitors.md)). If tiles stay piled on one head after both monitors
are back:

1. `Super+Shift+r` (config reload / re-render).
2. Confirm both heads are live (`gdisplays` / Settings → Displays).
3. If the layout is connector-level wrong, `gdisplays load <scene>` then retile.
4. Retab/stack after rehome should not crash; if Shell aborts, capture journal
   (`journalctl -e -u gnome-shell`) and file a bug.

To **reproduce** idle blank/wake without waiting overnight:

```bash
./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10
```

## After install / update, tiles flatten (full-height columns)

Extension reload wipes the in-memory tree. This fork keeps a **last-good**
layout at `~/.config/forge/config/session-layout.json` (window ids + splits/tabs):

- Written after quiet renders (debounced) and flushed before Shell HUP by
  `./install` / `forge save-session-layout`.
- On enable, windows are moved back to their snapshot monitors, then groups
  are rebuilt (so a Mutter pile-up on one head does not block restore).
- Freshness: same boot, roughly ≤30 minutes, ≥50% of window ids still open.

Tips:

- Keep apps open across install so ids still match.
- Cold login / reboot correctly starts without resurrecting an old file.
- Full named layouts / `forge workon` are a separate path (see
  [workon.md](workon.md)).

If it still flattens: check that the file exists **before** reload
(`ls ~/.config/forge/config/session-layout.json`), run
`forge save-session-layout` manually, then reinstall. Journal lines mention
`session-layout:`.

## Tab click does nothing until I focus the window first

Group tab strips are restacked above that group's window actors and should
activate on click without a prior click into the content. If a tab still ignores
clicks:

1. Confirm `showtab-decoration-enabled` and that the group is TABBED/STACKED.
2. Toggle layout debug overlay (`Ctrl+Super+d`) to confirm which CON owns the strip.
3. After a Shell reload, click the tab again; if it still fails, note whether
   focus was on another monitor and capture `journalctl -e -u gnome-shell`.

## Focus borders / colors look stock after install

This fork stores colors in `~/.config/forge/stylesheet/forge/stylesheet.css`, not
only in gsettings. After `make dev` / `./install` / migrate scripts:

```bash
./scripts/forge/restore-theme.zsh ~/.local/share/forge-manage/backups/latest
# or just re-apply the live file:
./scripts/forge/reload-theme.zsh
```

No full reboot needed. `Super+Shift+r` also reloads the stylesheet. If Shell was
installed with an older build that ignored the user CSS in debug mode, reinstall
(`make dev` or `make prod`) once so the fixed theme loader is live, then
`reload-theme.zsh`.

## Layout debug overlay

Opt-in labels on each **tiled** window show parent layout (`HSPLIT` / `VSPLIT` /
`TABBED` / `STACKED`), sibling `percent` (or `auto` when unset), and the monitor
workspace id (`mo0ws0`-style). Optional min-size from window size hints when
present.

**Off by default.** Toggle live (no reload):

- **Shortcut:** `Ctrl+Super+d` (keybinding `layout-debug-overlay-toggle`)
- **GSettings:**
  ```bash
  gsettings set org.gnome.shell.extensions.forge layout-debug-overlay-enabled true
  ```
- **Preferences → Settings → Debugging → Layout debug overlay**

Use this to confirm 1:2 vs 50–50 shares and which `moNwsW` a window sits under
after blank/wake. Disabling the extension removes all overlay actors.

## Enabling debug logs

Logging is **off by default** and only active in development builds. Turn it on:

```bash
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 5   # 0=OFF … 5=DEBUG 6=TRACE 7=ALL
```

Then watch the logs:

```bash
# X11
journalctl -f -o cat /usr/bin/gnome-shell
# or, generally
journalctl -f -u gnome-shell        # follow
journalctl -e -u gnome-shell        # jump to the end (Wayland)
```

(`make log` wraps this during development.) Set `log-level` back to `0` when done.

## Reporting a bug

Include your GNOME version (`gnome-shell --version`), session type (X11/Wayland),
the steps to reproduce, and any relevant `journalctl` output. File issues against
this project: <https://github.com/lukebmay/forge/issues>.

## Known limitations

No dynamic workspaces; no full vertical-monitor support (see
[monitors.md](monitors.md)).
