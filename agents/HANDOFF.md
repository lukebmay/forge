# Handoff — forge (lukebmay)

**Updated:** 2026-08-24 (Super+2: settle/urgency race; quiet desk = no bounce)
**Branch:** **`master`** @ **`29c39cd`** (pushed). Nest **stopped**.
**Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Next session (FIRM)

1. **Super+2** — confirm early-vs-late in one session ([task](./tasks/forge-ws-super2-bounce.md)):
   - After `layout:dev` modal clears, Super+2 **while dock hover still spins /
     icons wiggle** → expect bounce.
   - After spinner gone + no wiggle → expect stick (already observed once).
   - Do **not** add forge WS activate/pin fallbacks unless a forge-owned residual
     remains after urgency/busy is ruled in or out.
2. Soft: OH remainder — [blocker](./blockers/oh-ws-orphan-host-verify.md).
3. Soft: D049 tiny-env — [blocker](./blockers/d049-tiny-env-nautilus.md).

## Super+2 (current picture)

| Trial | Bounce? |
| --- | --- |
| Guake killed / never started, forge off | **yes** (earlier; settle not controlled) |
| Non-forge `~/Desktop/gnome-launch-test.py` | **no** |
| Forge on + Guake on + wait until dock quiet | **no** |

**Working theory:** race — Super+2 during post-layout **busy cursor / dock
urgency**, not Guake-only and not forge `activate_workspace`. Modal clear ≠ desk
quiet.

## Host verify (landed)

| Item | Result |
| --- | --- |
| Enable → `forge layout dev` open-miss | **PASS** (`29c39cd`) |
| Guake as sole Super+2 cause | **ruled out** |

## Desktop helper

`~/Desktop/gnome-launch-test.py` — non-forge place; needs Looking Glass
`global.context.unsafe_mode = true` once per session for Shell.Eval.

## Shipped this arc (tip)

| Commit | What |
| --- | --- |
| `67eaedc` | DING Desktop Icons product-ignore; mon percent scale on remove |
| `29c39cd` | Partial-flat desk → `ensure_skeleton` so enable→`layout:dev` can PlaceNext |

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| P0 | Super+2 settle/urgency | [task](./tasks/forge-ws-super2-bounce.md) |
| soft | OH host verify | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout:dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
**Hunts:** `forge log --grep/--session/--level` only — never `tail` at TRACE.
