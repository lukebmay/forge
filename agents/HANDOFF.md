# Handoff — forge (lukebmay)

**Updated:** 2026-08-24 (layout enable open-miss fix; Super+2 Guake ruled out)
**Branch:** **`master`**. Nest **stopped**. **Wayland** daily driver.

## Next session (FIRM)

1. **Host verify** — tip load (`./install --dev` + logout or disable→enable):
   - Partial desk / post-enable `forge layout:dev` must **not** open-miss
     ([task](./tasks/forge-layout-enable-open-miss.md)).
   - Optional: DING ⅓ after disable→enable
     ([task](./tasks/forge-enable-ding-percent-thrash.md)).
2. **Super+2 bounce** — [task](./tasks/forge-ws-super2-bounce.md). **External**;
   Guake-off **still bounces**. Next: Mutter/sticky/other (not forge WS patches).
3. Soft: OH host verify — [blocker](./blockers/oh-ws-orphan-host-verify.md).
4. Soft: D049 tiny-env — [blocker](./blockers/d049-tiny-env-nautilus.md).

## Log digest — session `ZNRcA` (enable → layout:dev fail)

| Observation | Insight |
| --- | --- |
| `structure-plan … steps=1 open=6` | Only `focus` step — **no `ensure_skeleton`** |
| No `open spawn role=` TRACE | PlaceNext dest failed before spawn (slot/PH required) |
| Same-second `open-miss` | Not a map-wait timeout — launches never pinned |
| Job error | `roles still missing after launch: google-chrome,Grok,ghostty-2,…` |
| Admit `skipped=2` | DING ignore working (product-ignore) |

**Fix:** emit `ensure_skeleton` for **partial flat** desks (opens + no PH + no
tab/stack groups). Extra-copy (already has TABBED) keeps `ensure_layout`.

## Super+2

| Trial | Bounce? |
| --- | --- |
| Guake killed, forge on | **yes** |
| Guake killed, forge off | **yes** |

## Active next

| Pri | Slice | Status |
| --- | --- | --- |
| soft | layout enable open-miss host verify | [task](./tasks/forge-layout-enable-open-miss.md) |
| soft | DING ⅓ host verify | [task](./tasks/forge-enable-ding-percent-thrash.md) |
| P0 | Super+2 external | [task](./tasks/forge-ws-super2-bounce.md) |

**Hunts:** `forge log --grep/--session/--level` only — never `tail` at TRACE.
Enable truncates tapes.
