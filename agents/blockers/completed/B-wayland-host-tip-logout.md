# B-wayland-host-tip-logout — Load Forge tip on host Wayland

**Status:** done
**Severity:** hard
**Owner:** human
**Kind:** physical
**Plan:** forge-wayland-rc-test-suite
**Unblocks:** agents/plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md
**Priority:** P1
**Created:** 2026-08-10
**Updated:** 2026-08-10

## Why this is human-only

Wayland host GNOME Shell cannot HUP-reload extension JS. Tip is installed under
`~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` (includes R014 GetTree
fix) but the **running** host Shell still serves pre-install modules. `gnome-extensions
disable/enable` did not pick up the new `session-api.js`. Nested Shell already loads
tip without logout; host dual-mon RC must exercise host tip.

## Agent prep already done

- `./install` completed (Live reload failed with logout message — expected)
- R013 CLI beltStructure is live without logout
- R014 code in installed `session-api.js` (GetTree no longer calls `syncLastTabFocusFromFocus`)
- Nest verified tip version `…-dirty` via `forge nested run -- forge ping`
- Nest stopped (`forge nested status` → running: False)

## What the human must do

1. Log out of this Wayland session (or reboot).
2. Log back in to Wayland (Guake/float agent OK for true cold).
3. In a terminal:
   ```bash
   cd ~/dev/me/forge
   forge ping
   # want: versionName containing -dirty (or new tip hash after further commits)
   echo "$XDG_SESSION_TYPE"   # wayland
   forge test live probe      # can_nested / can_true_cold as expected
   ```
4. Tell the agent to continue Wayland RC (`forge test live run --from-work wayland-rc`).

## Done when

- `forge ping` shows tip that includes R014 (post-install version string)
- Agent can re-run host L1/L2 RC without GetTree open-leaf thrash

## Done note

2026-08-10: Human logged out/in. Host `forge ping` → `v49-90-beta.2-292-g89d5223-dirty`.
Wayland RC re-run: R013/R014 cases PASS; suite cleared (see completed task).
