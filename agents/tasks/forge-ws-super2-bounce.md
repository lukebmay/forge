# forge-ws-super2-bounce — Super+2 fakout (WS2 flash → back to WS1)

**Status:** in progress — **external to Forge**; Guake ruled out as sole cause
**Plan:** (none)
**Branch:** master
**Blocker:** soft human — identify external actor (Mutter focus / sticky / other)
**Updated:** 2026-08-24

## Goal

Stop Super+2 (after `layout:dev` settle) from briefly showing WS2 then bouncing
back to WS1.

## Acceptance

- [x] Prove bounce is **not** forge `activate_workspace` / pin-restore
- [x] Guake-off repro: **bounce still happens** (Guake not sufficient cause)
- [ ] Identify remaining external actor (Mutter / sticky / urgency / other ext)
- [ ] Host: Super+2 lands on WS2 and stays

## Host findings (2026-08-24)

| Trial | Result |
| --- | --- |
| Fresh login → `layout:dev` → kill Guake → Super+2 | **still bounce** |
| Same with forge **disabled** | **still bounce** |
| Guake autostart off (separate trial) | layout:dev open-miss (separate bug; fixed) |

Forge does not own `switch-to-workspace-N`. Pin-restore cannot run when disabled.

### Next suspects (not Guake-only)

- Mutter focus policy (`focus-mode=click`, `focus-change-on-pointer-rest=true`)
- Sticky / urgency window on WS0 (non-Guake)
- just-perfection / ubuntu-dock interaction
- Key-repeat / double switch

### Hunt (forge enabled)

```bash
forge log --grep 'active-workspace-changed|pin-restore|moved pointer' --level trace --since 10m
```

Lines include `focus=` / `focusWs=` / `overview=` (enriched TRACE).

## Architecture

Do **not** add forge WS activate/pin fallbacks for this class. Fix only if a
forge-owned residual remains after the external bounce is identified.
