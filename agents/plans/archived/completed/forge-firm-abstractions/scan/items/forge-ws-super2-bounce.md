# forge-ws-super2-bounce

**Verdict:** abandon
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-ws-super2-bounce.md

## Stated status
in progress — likely settle/urgency race, not Guake; forge WS activate ruled out

## Leftovers
- Identify actor (Chrome/PWA urgency, dock busy, Mutter focus) — not proven Forge
- Host: Super+2 right after modal clear still bounces (busy-desk race)
- Soft human: confirm urgency / dock-busy vs early Super+2

## Why this verdict
Evidence is **not Forge**: bounce with forge **disabled**; Forge does not own
`switch-to-workspace-N`; pin-restore cannot run while disabled; quiet desk
(no dock spinner / urgency-wiggle) Super+2 sticks. Documented as GNOME
settle/urgency in `docs/user/troubleshooting.md`. Plan itself: do **not**
add Forge WS activate/pin fallbacks. Remaining experiments are host GNOME
hunts, not a kernel slice. Do not keep as P0 beside TOM import.

## Destination
archive → `agents/plans/archived/abandoned/forge-ws-super2-bounce.md`

## Absorb
- Do **not** invent Forge `activate_workspace` / pin-restore fallbacks for
  Super+N snapback
- Forge does not own `switch-to-workspace-N`
