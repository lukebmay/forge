<!-- migrated from agents/tasks/forge-layout-enable-open-miss.md by agents migrate-layout -->

# forge-layout-enable-open-miss — layout:dev open-miss after enable

**Status:** agent done — needs tip load + host verify
**Plan:** (none)
**Branch:** master
**Updated:** 2026-08-24

## Goal

`forge layout:dev` must work after disable→enable (or enable on a partial desk
with one Ghostty), not fail `open-miss` with no launches.

## Log root cause (session `ZNRcA`)

```text
structure-plan ws=0 actions=7 steps=1 open=6   # step was focus only — NO skeleton
open-phase n=6
# no "open spawn role=" TRACE (PlaceNext dest failed before spawn)
structure-plan … open=6                       # residual still missing all roles
code=open-miss  roles still missing after launch: google-chrome,Grok,…
```

Planner only emitted `ensure_skeleton` when **coldEmpty** (every role status
`open`). One surviving Ghostty → not coldEmpty → opens without PH slots →
`applyPlaceNextOptions` requires slot/PH → all dest fail → instant open-miss.

## Fix

| Piece | Change |
| --- | --- |
| JS + Python `planReconcile` | `needOpenSkeleton`: opens + no PH + not thrashed + **no existing tab/stack groups** |
| `skipWindowStructure` | also when `needOpenSkeleton` (skeleton owns topology) |
| Huntability | `Logger.warn` on PlaceNext dest failure |
| L0 | partial-desk skeleton test; extra-copy still `ensure_layout` |

## Host verify

```bash
cd ~/dev/me/forge && ./install --dev   # logout or disable→enable
# partial desk: one Ghostty (or enable then layout)
forge layout:dev
# expect skeleton then spawns; not instant open-miss
forge log --grep 'skeleton|open spawn|PlaceNext dest|open-miss' --level debug --since 10m
```
