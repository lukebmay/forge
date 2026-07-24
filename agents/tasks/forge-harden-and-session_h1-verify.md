# Task — H1 soft rehome: manual blank/wake verify on black

**Status:** Ready  
**Plan:** [forge-harden-and-session.md](../plans/forge-harden-and-session.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-harden-and-session/completed/`

## Problem

H1 soft rehome is implemented + unit-tested, but **live** overnight-style thrash
on dual 4K / hybrid GPU still needs a pass. Manual Super+Delete often keeps
placement; idle lock + DPMS is the path that piles windows.

Also: after `make dev`, user focus colors must apply without rebooting.

## Goals

1. Install current tree (`make dev` or prod) so theme-loader + soft-rehome code is live.
2. Confirm user stylesheet colors apply (`reload-theme` / Super+Shift+r).
3. Dual-tile both heads → **idle** lock (not only Super+Delete) → wake → placement OK.
4. Retab/stack after wake does not crash Shell.
5. Record result in plan/PRIORITY; close this task.

## Tooling (this session)

| Script | Use |
| --- | --- |
| `./scripts/forge/reload-theme.zsh` | Live CSS reload (no reboot) |
| `./scripts/forge/restore-theme.zsh [bak]` | Restore colors from backup + reload |
| `./scripts/forge/trigger-idle-lock.zsh --idle 15` | Short idle → auto-lock |
| `./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10` | Closest to overnight |
| `./scripts/forge/trigger-idle-lock.zsh --lock-now` | Control (manual-style lock) |
| `./scripts/forge/trigger-idle-lock.zsh --restore-only` | If timers left short |

## Acceptance

- [ ] `make dev` (or prod) installed; extension active
- [ ] Focus border colors match `~/.config/forge/stylesheet/forge/stylesheet.css` without full reboot
- [ ] Idle lock (or idle+DPMS) → wake: windows not all stuck on one monitor when both heads up
- [ ] Retab after wake: no Shell abort
- [ ] Notes filled below; PRIORITY + plan session note updated

## Manual procedure

1. Tile ≥1 window on each monitor (same workspace).
2. Optional control: `--lock-now` → unlock → note placement.
3. `--idle-and-dpms --idle-delay=10` → hands off until lock → wake/unlock.
4. Observe placement + try tab/stack toggle.
5. If bad: `Super+Shift+r`, then `gdisplays load <scene>` if connectors wrong.
6. Journal: `journalctl -e -u gnome-shell` if crash.

## Session notes

_(overwrite per session)_

**2026-07-23:** Tooling + CSS fix shipped (user stylesheet always preferred;
ConfigReload reloads CSS; idle-lock / reload-theme scripts). Live verify on black
still open — run procedure above after `make dev`.
