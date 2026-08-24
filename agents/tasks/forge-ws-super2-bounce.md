# forge-ws-super2-bounce — Super+2 fakout (WS2 flash → back to WS1)

**Status:** in progress — **likely settle/urgency race**, not Guake; forge WS activate ruled out
**Plan:** (none)
**Branch:** master
**Blocker:** soft human — confirm urgency / dock-busy vs early Super+2
**Updated:** 2026-08-24

## Goal

Stop Super+2 (after `layout:dev` settle) from briefly showing WS2 then bouncing
back to WS1.

## Acceptance

- [x] Prove bounce is **not** forge `activate_workspace` / pin-restore
- [x] Guake-off repro: **bounce still happens** (Guake not sufficient cause)
- [x] Non-forge Desktop launcher after cold login: **no bounce**
- [x] Forge on + Guake autostart + `layout:dev`, wait until dock hover spinner
      stops and dock items stop urgency-wiggle, then Super+2: **no bounce**
- [x] Document as GNOME settle/urgency (not Forge WS) —
      [troubleshooting.md](../../docs/user/troubleshooting.md#workspace-switch-supern-flashes-then-snaps-back)
- [ ] Identify actor (Chrome/PWA urgency, dock busy, forge residual, Mutter focus)
- [ ] Host: Super+2 lands on WS2 and stays even when pressed right after modal clear

## Host findings (2026-08-24)

| Trial | Result |
| --- | --- |
| Fresh login → `layout:dev` → kill Guake → Super+2 | **still bounce** |
| Same with forge **disabled** | **still bounce** |
| Guake autostart off (separate trial) | layout:dev open-miss (separate bug; fixed) |
| Forge disabled; Guake not running; Super+2 | **still bounce** — Guake **ruled out** |
| Enable/disable open-miss | **fixed** (tip `29c39cd`; host verified) |
| Cold login + `~/Desktop/gnome-launch-test.py` then Super+2 | **no bounce** |
| Forge on + Guake on + `layout:dev`; wait dock spinner + no wiggle; Super+2 | **no bounce** |

Forge does not own `switch-to-workspace-N`. Pin-restore cannot run when disabled.

### Working theory (2026-08-24)

Snapback correlates with **pressing Super+2 before the desk is quiet**, not with
Guake presence or forge workspace APIs:

- Dock hover shows **busy spinner** after layout modal clears (same class of
  cursor the operator saw on tab hover) → apps/shell still “busy.”
- Dock icons **urgency-wiggle** → classic attention/urgency path can pull focus
  (and often workspace) back to the urgent window on WS1.
- Non-forge sequential launch had no bounce (likely quieter / already settled).
- Waiting until spinner gone **and** no wiggle → Super+2 sticks.

Earlier “forge off still bounces” may have been the same race: desk still busy
or urgent after a prior `layout:dev`, not forge code while disabled.

Host focus settings sample: `focus-mode=click`,
`focus-change-on-pointer-rest=true`, `focus-new-windows=smart`.

### Next experiments (ordered)

1. **Early vs late:** right after modal clear (spinner still on), Super+2 → expect
   bounce; after quiet → expect stick. Same session, both.
2. If early bounces: note whether a dock icon is wiggling / which app.
3. Optional TRACE (forge on): urgency / activate / workspace around the bounce:
   `forge log --grep 'active-workspace-changed|pin-restore|urgent|focus=' --level trace --since 10m`

### Next suspects (ranked)

1. **Urgency / demands-attention** on a WS1 window (Chrome/PWA/Guake/mail) + dock
2. Shell/app **busy** state still in progress after apply chrome clears
3. Mutter focus + `focus-new-windows=smart` during late maps
4. just-perfection / ubuntu-dock interaction (lower)

### Hunt (forge enabled)

```bash
forge log --grep 'active-workspace-changed|pin-restore|moved pointer' --level trace --since 10m
```

Lines include `focus=` / `focusWs=` / `overview=` (enriched TRACE).

## Architecture

Do **not** add forge WS activate/pin fallbacks for this class. Fix only if a
forge-owned residual remains after the external bounce is identified.
