# Handoff — forge (lukebmay)

**Updated:** 2026-08-24 (post open-miss + DING fixes; host verify next)
**Branch:** **`master`** @ **`29c39cd`** (pushed). Nest **stopped**.
**Sessions:** **Wayland** daily driver. **green** = X11 NVIDIA.

## Next session (FIRM)

1. **Tip load** — `cd ~/dev/me/forge && ./install --dev` then logout **or**
   disable→enable (Wayland). Confirm `forge ping` tip ≥ `29c39cd`.
2. **Host verify (ordered):**
   1. Partial desk / post-enable `forge layout:dev` — must **not** open-miss
      ([task](./tasks/forge-layout-enable-open-miss.md)).
   2. Optional: disable→enable Ghostty ~½ (DING)
      ([task](./tasks/forge-enable-ding-percent-thrash.md)).
3. **Super+2 bounce** — [task](./tasks/forge-ws-super2-bounce.md). **External
   to Forge** (bounces with extension off; Guake-off still bounces). Do **not**
   add forge WS activate/pin fallbacks. Next suspect: Mutter focus / sticky /
   other extension.
4. Soft: OH remainder — [blocker](./blockers/oh-ws-orphan-host-verify.md).
5. Soft: D049 tiny-env — [blocker](./blockers/d049-tiny-env-nautilus.md).

## Shipped this arc (tip)

| Commit | What |
| --- | --- |
| `67eaedc` | DING Desktop Icons product-ignore; mon percent scale on remove |
| `29c39cd` | Partial-flat desk → `ensure_skeleton` so enable→`layout:dev` can PlaceNext |

## Log digest — `ZNRcA` open-miss (why #3 failed)

| Observation | Insight |
| --- | --- |
| `structure-plan … steps=1 open=6` | Only `focus` — **no skeleton** |
| No `open spawn role=` | PlaceNext dest failed before spawn (needs PH/slot) |
| Same-second `open-miss` | Not map-wait — launches never pinned |
| Job | `roles still missing after launch: google-chrome,Grok,…` |

**Fix:** skeleton when opens + no PH + not thrashed + **no existing tab/stack**.
Extra-copy (already TABBED) keeps `ensure_layout`.

## Super+2

| Trial | Bounce? |
| --- | --- |
| Guake killed, forge on | **yes** |
| Guake killed, forge off | **yes** |

## Verify hunts

```bash
# after tip load + layout:dev
forge log --grep 'skeleton|open spawn|PlaceNext dest|open-miss' --level debug --since 15m
# Super+2 (if hunting with forge on)
forge log --grep 'active-workspace-changed|pin-restore' --level trace --since 10m
forge tree   # DING: mon0 Ghostty pct ~0.5, childPctSum ~1
```

**Hunts (FIRM):** `forge log --grep/--session/--level` only — never `tail` at
TRACE. Enable **truncates** tapes.

**Retest (FIRM):** nest = `./scripts/forge/forge-test nested …`. After JS tip:
`./install --dev` then nest restart **or** logout for host. See [testing.md](./testing.md).

## Active next (summary)

| Pri | Slice | Status |
| --- | --- | --- |
| soft | layout enable open-miss host verify | [task](./tasks/forge-layout-enable-open-miss.md) |
| soft | DING ⅓ host verify | [task](./tasks/forge-enable-ding-percent-thrash.md) |
| P0 | Super+2 external | [task](./tasks/forge-ws-super2-bounce.md) |
| soft | OH host verify | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env | [blocker](./blockers/d049-tiny-env-nautilus.md) |

**FIRM:** Prefer nest for code→reload. Host `forge layout:dev` ≠ crash harness.
User `forge test` / `forge nested` are not product → `forge-test`.
