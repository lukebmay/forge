# Task: forge-wayland-live_residual-smoke

**Status:** superseded 2026-08-09 — use [forge-wayland-rc-test-suite](../plans/forge-wayland-rc-test-suite.md) + nest dual-mon  
**Plan:** historical (control-loop era). **Do not reimplement Mode B as cold success.**  
**Branch:** master  
**Created:** 2026-08-05  
**Host:** black — dual 4K @ 1.5; GNOME Shell 46

## Goal

Confirm Forge is daily-driver safe on **Wayland** after control-loop CL8–CL11 + preflight (SEGV-safe `move_to_monitor`, cross-mon move, rival tilers off).

## Preflight (agent done)

- [x] `safeMoveToMonitor` refuses mon=-1 / dead / no actor / no workspace
- [x] `move()` dest mon + 4px epsilon + alive guard
- [x] Rival GNOME Shell tilers disabled on install/enable
- [x] Unit tests green (2160)
- [x] Debug install + logging on (X11 HUP); **Wayland: `forge nested restart`** (AT-W1)

## Operator steps

1. Log out → **GNOME on Wayland**.
2. Confirm Forge:

```bash
forge ping
gsettings get org.gnome.shell disable-user-extensions   # false
```

3. Sole Ghostty (or clean-ish) → `forge layout dev` → `forge tree`.
4. Walk focus mon0 ↔ mon1; tab switches; Guake F12 if used.
5. Optional thrash (W4): Super+Delete lock → unlock → `forge tree` (no thrash / crash).
6. Note residuals only (do not redesign mid-smoke).

## Pass criteria

| Check | Expect |
| --- | --- |
| Enable | Forge ACTIVE; not in safe-mode (`disable-user-extensions` false) |
| Topology | mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice) (or current dev profile) |
| Cross-mon | YouTube Meta mon + frame on mon1 (not stuck mon0) |
| Focus | No page reflow on every tab/focus; windows stay at slot size |
| Open batch | No temporary sliver thrash mid-`layout dev`; residual focus correct |
| Chrome | Apply overlay never sticks (≤8s) |
| Borders | Focus ring roughly matches tile; does not steal clicks |
| Shell | No crash on Nautilus open/close or title path changes |
| Guake | F12 does not yank pointer under tab strip (if installed) |

## Fail → record

| Symptom | Capture |
| --- | --- |
| Shell crash | journal snippet; last app; mon count |
| Forge gone after crash | `gsettings get org.gnome.shell disable-user-extensions` |
| Wrong mon | `forge tree` + which app |
| Reflow / storm | focus action sequence; log level 5 if needed |
| Layout incomplete | which apps missing; open wait timeout? |

## Session note

**2026-08-08 Wayland RC agent smoke (black):** Session Wayland Shell 46 dual 4K.
Unit 2337 + pytest 431 green. Install tip `5ea572b` on disk; runtime during smoke
`a6699fe` (logout required). Cold `forge layout dev` Mode A: mon1 tabs on mon0.
Mode B thrash-recover: roles correct mon0 tab(Chrome,Grok)\|ghostty + mon1
ghostty\|tab(YT,Gmail,Voice). Focus walk OK, no ¼ stuck, Nautilus open/close no
crash (left single-child VSPLIT cruft). Guake FLOAT mon0 (named rehome still
reverted). Journal clean of give-up/mismatch. Nested mon0 HSPLIT + `order:mon0`
residual remains. **RC = usable with Mode B**, not perfect cold topology.

**2026-08-06 focus-no-reflow:** Root cause = Meta `focus` → `renderTree("focus", true)`.
Fixed on plan branch (`097807d`). Disk install **v49-90-beta.2-166-g097807d**;
runtime still **g4320b9f** (Wayland cannot live-reload). **Operator: log out → Wayland
again**, then confirm: focus walk (click + Super+hjkl) no Chrome ¼→full reflow; tab
switch stable; borders still track focus.

**2026-08-06 intra-tab thrash (A/B AGREE):** After focus-no-reflow, click mon0
Ghostty still thrashed mon1 tab strip — full `updateDecorationLayout` hide-all on
every focus. Fixed: focus-scoped restack only + forge-geom borders-only. See
[completed/forge-layout-control-loop_intra-tab-thrash.md](../plans/forge-layout-control-loop/completed/forge-layout-control-loop_intra-tab-thrash.md).
**Re-check after install/logout:** mon0 Ghostty click must not flash mon1 tabs.

**2026-08-06 follow-up (open place + focus border):** Operator re-smoke still saw (1) cyan focus outline on YouTube ~1/6 mon width (slot half) and (2) Nautilus from mon1 dock/focus at mon-root end, not under mon1 Ghostty. Reproduced: `forge focus path:mo1ws0/0/0` + launch → path `mo1ws0/2`. Root causes: Meta map thrash rehome flattens under-LFT attach; focus border used `get_frame_rect` slivers; DBus Focus did not touch LFT. Fixes on plan branch (unit 2173): open sticky when dock/LFT/PlaceNext; rehome after mon LFT; border from `renderRect`/`rect`; Focus → `movePointerWith`. Installed; **Wayland needs logout** to load. Then re-check both.

**2026-08-06 operator Wayland smoke:** layout dev mostly good (a bit slow). Residuals filed → wayland residual fixes (icons, cwd, DnD, hints) landed earlier.

**2026-08-05 prep:** Stash applied onto control-loop + move() port from wayland branch (dest mon / epsilon).

**2026-08-06 operator residuals → WR1+WR2 (merged master):**

**2026-08-06 operator Wayland re-smoke (post reinstall + WR tip):**
- `forge layout dev` mostly worked.
- **Fail:** mon0 left tab group — Grok was **not** the visible/open app unit.
- **Fail:** close all but Ghostty → `layout dev` again → mon0 became **one giant
  tab group** (no middle split; expect tab group left + Ghostty right).
- Decision: do **not** pile more WR one-offs; start mid **settle-learning** data
  collection ([plan](../plans/forge-settle-learning.md)). Topology residuals may
  still need a separate fix if samples show settle is fine.
Guake wrong mon; Grok not visible / ¼ height; focus flicker. Fixes on master
(`dd7e6ca` / `1f44c0b` via merge `db50561`). **Re-smoke after install+logout:**
layout dev open leaf Grok; focus walk no thrash; Guake F12 mon0/mon1.

