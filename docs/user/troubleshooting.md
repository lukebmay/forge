# Troubleshooting

## First steps

- **Reload config** — `Super+Shift+r` re-reads `windows.json` / `keybindings.json`
  from disk without restarting.
- **Restart GNOME Shell** — on X11, `Alt+F2` → `r` → Enter (or `killall -HUP gnome-shell`).
  On Wayland the host Shell cannot HUP. `./install` copies files only and does
  **not** end the session (D048); load a new tip via nest, or log out later when
  you choose.
- **Check it's enabled** — `gnome-extensions list --enabled` should include
  `forge@jmmaranan.com`.

## Extension won't enable after a Shell crash

When GNOME Shell aborts while user extensions load, it sets a **session block**:

```bash
gsettings get org.gnome.shell disable-user-extensions   # true → all user extensions off
```

`./install` / `forge install` **clears** that flag and drops Forge from
`disabled-extensions` before `gnome-extensions enable`. If enable still fails:

```bash
gsettings set org.gnome.shell disable-user-extensions false
gnome-extensions enable forge@jmmaranan.com
# X11: Alt+F2 → r, or killall -HUP gnome-shell
# Wayland: nest for code loop, or log out later for host tip (install never forces this)
```

Also confirm Extensions app master toggle is on (same setting).

## A window won't tile (or won't float)

It probably matches a rule. Check **Preferences → Windows** and
`~/.config/forge/config/windows.json` for an override on its class, and confirm
`tiling-mode-enabled` is on and the workspace/monitor isn't excluded
(`workspace-skip-tile` / `monitor-skip-tile`). See [rules.md](rules.md) and
[monitors.md](monitors.md).

Maximized or fullscreen Meta often reports “cannot resize” until unmaximized —
Forge does **not** treat that as a permanent float (D051). Sole-tile maximize
snaps back when `window-maximize-on-single` is off (default).

## Stacked / tabbed shortcuts do nothing

- **Tabbed** and **stacked** modes are both **on** by default. Tabbed remains the
  default **group** type (DnD center, bare-array sugar, merge-group).
- If a toggle no-ops, confirm the matching flag in **Preferences → Tiling →
  Behavior**: `tabbed-tiling-mode-enabled` / `stacked-tiling-mode-enabled`.
- **Toggle tab/stack** (`con-stack-tab-layout-toggle`: Safe `Ctrl+Super+g`,
  Vim `Super+n`) is Mark 2 `toggleTabStack` (TABBED ↔ STACKED, or TABBED from
  a split). Needs `tabbed-tiling-mode-enabled` / `stacked-tiling-mode-enabled`.
  Dissolve with **promote** (`window-ungroup`: Safe `Ctrl+Shift+Super+m`,
  Vim `Super+{`).
- After installing a build that adds keys, reload Shell (X11: `Alt+F2` → `r`, or
  `killall -HUP gnome-shell`) so the extension re-registers bindings; then
  `forge keybind load vim` (or Safe/i3) if dconf still lacks the new chords.
- Existing installs keep prior dconf values until you reset or re-apply a kit.
  See [layouts.md](layouts.md#stacked-vs-tabbed).

## After lock / blank, all windows on one monitor

Forge debounces workarea thrash and runs **monitor-recovery** from last known geometry
(see [monitors.md](monitors.md)). If tiles stay piled on one head after both monitors
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
**exact tree snapshot** at `~/.config/forge/config/session-layout.json`
(window ids + splits/tabs + open leaf + keyboard focus) — **not** a named
`forge layout` profile:

- Written after quiet renders (debounced) and flushed before an **X11** Shell
  HUP by `./install` / `forge save-session-layout` (install never runs
  `forge layout`). Wayland install does not flush after enable (no host HUP).
- On enable, windows are moved back to their snapshot monitors, then groups
  are rebuilt (so a Mutter pile-up on one head does not block restore).
- Open tab/stack leaf and keyboard focus are restored from that snapshot.
- Freshness: same boot, roughly ≤30 minutes, ≥50% of window ids still open.

Tips:

- Keep apps open across install so ids still match.
- Cold login / reboot correctly starts without resurrecting an old file.
- Named profiles / `forge layout` are a separate, explicit path (see
  [layout.md](layout.md)).

If it still flattens: check that the file exists **before** reload
(`ls ~/.config/forge/config/session-layout.json`), run
`forge save-session-layout` manually, then reinstall. Journal lines mention
`session-layout:`.

## Tab click does nothing until I focus the window first

Group tab strips live on the `#forge-tab-chrome` layer (above window actors,
below the shell top window group) and should activate on click without a
prior click into the content. Strips on a monitor hide while that monitor has
a covering window (Meta maximize/fullscreen or Forge zoom via Super+Enter) so
the covering app stays on top of chrome; the layout-apply modal is the
exception and stays above. If a tab still ignores clicks:

1. Confirm `showtab-decoration-enabled` and that the group is TABBED/STACKED.
1. Toggle layout debug overlay (`Ctrl+Super+d`) to confirm which CON owns the strip.
1. After a Shell reload / tip install, click the tab again; if it still fails,
   note whether focus was on another monitor and capture
   `journalctl -e -u gnome-shell`.

Do **not** confuse a leftover **layout apply dim** (full-screen scrim while
`forge layout` runs) with a missing tab strip. Apply overlay sits above
the tab-chrome layer on purpose; stuck dim is an overlay bug, not a
`trackChrome` / restack issue. The dim should drop once **visible** panes
are placed; hidden tabs may still finish — see [layout.md](layout.md).

## Tab stays pressed / floating chip or drop zones stick

After a click or tab drag, pressed highlight, a floating chip, or tile
drop-zone paint should clear on mouse release. If chrome sticks:

1. Click elsewhere once, or press Escape if a grab is still live.
1. Reload the extension tip (`./install --kit=…` then Shell reload / session
   as usual) — release cleanup is `clearTabDragResiduals` on every path.
1. If it still sticks after tip reload, capture whether it was click-only
   vs peel vs strip reorder, plus `journalctl -e -u gnome-shell`.

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

## Drop zone turns deep red / drop snaps back

Forge refuses a tile drop when the post-drop slot would be smaller than the
app’s effective minimum size (preview class `.window-tilepreview-invalid`).
HSPLIT, VSPLIT, and TAB (CENTER) zones are checked separately — a red
TOP/BOTTOM does not imply LEFT/RIGHT or CENTER are also refused. Use a
taller/wider target, fewer vertical stacks, or drop **CENTER** into a tab
group (shared full pane) instead of a thin edge split.

Effective mins = Mutter hints (if any) ∪ learned per-window ∪ class floor in
`~/.config/forge/config/window-mins.json` ∪ env floor
(`FORGE_MIN_TILE_WIDTH` / `FORGE_MIN_TILE_HEIGHT`; unset → **256×144**). On
Wayland, Mutter often omits hints: Forge **passively learns** when a client
stays larger than a forge resize or its tree slot, and writes class floors into
`window-mins.json`. There is **no** shrink-probe. If a TILE pane is still too
small mid-session, Forge rehomes (same-mon tab, else float) and collapses the
vacated gap. Env overrides must be visible to the GNOME session (not only a
terminal); logout/restart Shell after changing them.

## Layout apply chrome (multi-open dim)

~80% black full-screen dim with a spinner and “Forge: Loading layout…” while
`forge layout` runs. **On by default**. There is no timed “first apply is slow”
note — applies are usually fast. If settle retries or soft residual fail, the
modal shows a short notice (e.g. settle jitter / soft-failure; check logs).
Dev installs (`./install --dev`) also show a stage checklist on the modal.
Chrome eats pointer events and clears after hard+soft finish, on extension
disable, or a hard timer ≤ **30s** — it must never stick and leave the session
unusable.

```bash
# disable if the dim is annoying:
gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled false
# re-enable:
gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled true
```

Or **Preferences → Settings → Debugging → Layout apply chrome**.

## Workspace switch (Super+N) flashes then snaps back

After a cold `forge layout` (many apps opening at once), switching workspace
with **Super+2** (or similar) can briefly show the target desk and then bounce
back to the layout desk.

**This is GNOME Shell / Mutter behavior, not Forge driving the workspace.**
Forge does not own `switch-to-workspace-N`. The apply modal clearing only means
Forge finished placing windows; Chrome/PWAs (and the dock) may still be **busy**
or showing **urgency** (busy cursor on dock hover, icons “wiggling”). An urgent
or activating window on the layout workspace can pull focus — and the active
workspace — back.

**What to do:** wait until the dock is quiet (no busy cursor, no urgency wiggle),
then switch. If you switch during that busy window, the snapback can happen even
with Forge disabled.

## Periodic layout verify (debug only)

Optional **debug** timer that re-checks Meta frames against tree slots. Production
stays event-driven; leave this **off** (default **0**).

```bash
# e.g. every 5s while diagnosing open/tile desync — then set back to 0
gsettings set org.gnome.shell.extensions.forge layout-verify-interval-ms 5000
gsettings set org.gnome.shell.extensions.forge layout-verify-interval-ms 0
```

Requires a debug-capable install so verify scans run with logging if you need
journal detail (`logging-enabled` / `log-level` below).

## Enabling debug logs

Logging stays enabled in all installs (including `--prod`); **level** gates
volume. Preferred live control (no tip reload / logout):

```bash
forge log                 # durable / session / effective / file+jsonl paths
forge log trace           # session-only bump until reset or disable/enable
forge log debug           # session DEBUG
forge log reset           # clear session → durable gsettings
forge log trace --persist # write gsettings (survives new enable)
forge log --truncate      # rotate to *.prev.* then empty current tapes

# Searchable query (forwards to vendored plog-query; defaults forge tapes)
forge log query                     # last 30 (color reprint)
forge log --last 50 --grep slot
forge log --level warn+ --since 2h
forge log --json --last 10          # raw JSONL for jq
# Prior Shell session (after login / enable rotate):
forge log ~/.local/state/forge/forge.prev.jsonl --last 80 --grep 'metric warn'
```

Or write prefs directly (also live — extension reconfigures on change):

```bash
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 3   # WARN — ./install --prod
gsettings set org.gnome.shell.extensions.forge log-level 4   # INFO — schema / regular ./install
gsettings set org.gnome.shell.extensions.forge log-level 5   # DEBUG — forge log debug
gsettings set org.gnome.shell.extensions.forge log-level 6   # TRACE — ./install --dev (D068)
```

Forge uses **dual-sink + dual-tape** logging:

| Sink | What you get |
| --- | --- |
| **Journal** (`journalctl`) | WARN / ERROR / fatal only (quiet eyes-on) |
| **File** (`.log`) | ANSI human tape — default `~/.local/state/forge/forge.log` (`$FORGE_LOG_FILE`; nest sibling) |
| **JSONL** (`.jsonl`) | Machine tape beside the `.log` (forge default ON; `FORGE_LOG_JSONL=0` disables) |

Install defaults (**D068**): regular → **INFO**; `--dev` → **TRACE**; `--prod`
→ **WARN**. Dual-sink stays on in all modes — quiet prod is a **level**, not a
missing file tape (so `forge log trace` can still write searchable JSONL).
Below the selected level, lines are not emitted anywhere; INFO/DEBUG/TRACE
never go to the journal. On each extension **enable**, non-empty hunt tapes
are **copied** to `forge.prev.log` / `forge.prev.jsonl`, then the current
tapes are truncated (fresh session). CLI appends and does not wipe;
`forge log --truncate` does the same rotate-then-empty mid-session. Empty
current tapes leave any existing previous tapes alone. Session override from
`forge log LEVEL` wins over durable until `forge log reset` or disable/enable.
`./install --prod` still builds `production=true` (assert policy) but keeps
logging enabled at WARN.

**WARN/ERROR** lines keep values in the message text (so journal matches the
human log). **INFO/DEBUG/TRACE** may attach structured `fields` for
`forge log --json` / payload search.

Debug/trace **assertions** (`lib/shared/assert.js`) are active at log-level ≥ debug
or in a `!production` (dev) install. A failed invariant logs `[Forge] [ERROR] assert`
and sets `assertionFailed` so apply / DnD commit / launch insert **stop without
throwing** (no Shell logout). Production info-and-below is a noop.

Then watch the logs:

```bash
# Quiet journal (lifecycle / failures)
journalctl -f -o cat /usr/bin/gnome-shell
# Full hunt log
tail -f ~/.local/state/forge/forge.log
```

(`make log` wraps journal follow during development.) Set `log-level` back to
`0` when done.

## Reporting a bug

Include your GNOME version (`gnome-shell --version`), session type (X11/Wayland),
the steps to reproduce, and any relevant `journalctl` output. File issues against
this project: <https://github.com/lukebmay/forge/issues>.

## Known limitations

No dynamic workspaces; no full vertical-monitor support (see
[monitors.md](monitors.md)).
