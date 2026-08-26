# Task: forge-layout-control-loop_cl9-parallel-deferred-open

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Depends on:** CL8 (deferred hide in extension)  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Layout multi-open: **parallel** launches into CL8 deferred hide; wait for **map +
windowId** (not full TILE settle); **unhide before residual** RunSteps so one
structure pass + render can TILE/place; residual **focus from profile**.

## Scope (CL9)

| In | Out |
| --- | --- |
| `scripts/forge/forge` layout open loop: parallel spawn | Apply chrome (CL10) |
| Wait-for-map / pin without requiring TILE settle for just-opened | Soft-rehome rename |
| Explicit unhide / release deferred before residual (DBus if needed) | Live Wayland |
| Ensure PlaceNext mon+path still set per open | Full skeleton builder |
| Pytest for wait/parallel helpers where pure | |

## Acceptance

1. Layout open path no longer serial-waits TILE for each role before next launch. ✓
2. Role pins still collected for residual. ✓
3. Deferred windows unhidden before residual structure apply (not only at batch end). ✓
4. Existing CLI unit tests green; add/adjust tests for wait-without-TILE and/or parallel helper. ✓
5. `npm test` + `python3 -m pytest tests/unit/cli/ -q` green. ✓
6. Local commit; no push. ✓

## Session note

**2026-08-05 Task Force A:** CL9 shipped on `plan/forge-layout-control-loop`.

### Flow

```text
LayoutBatch begin
  parallel PlaceNext + launch (no_wait) all open roles
  wait_for_open_role_pins (map + windowId; require_settled=False path)
  wait_for_tree_stable
  LayoutBatch release-deferred
  residual plan_reconcile + RunSteps (focus from profile IR still last)
LayoutBatch end
```

### Files

| Path | Change |
| --- | --- |
| `lib/extension/window.js` | `releaseDeferredOpens()`; `_releaseAllDeferredOpens` returns count |
| `lib/extension/session-api.js` | LayoutBatch `release`/`release-deferred`/`unhide`; API v8 |
| `scripts/forge/layout_apply.py` | `assign_open_role_pins`, `wait_for_open_role_pins`, `window_has_map_id` |
| `scripts/forge/forge` | Parallel open loop; map wait; release before residual |
| `scripts/forge/cli_help.py` | LayoutBatch help text |
| Tests | pytest CLI pin helpers; vitest release + LayoutBatch |

### Residual focus

`plan_reconcile` still emits profile `focus` + tab active ops after structure;
`residual_follow_up` → `actions_to_extension_steps` keeps focus **last**. Unhide
runs before residual so focus targets are visible; no skip for just_opened on
profile focus.

### Tests

- `python3 -m pytest tests/unit/cli/ -q` → **365 passed**
- `npm test` → **2115 passed** (195 files)

### Risks

- Same-class multi-instance pin order is greedy by pending role order (race-y maps
  may need residual re-claim; title lag still handled by residual).
- Map wait timeout leaves partial pins; open continues residual for survivors.
- Older extension without `releaseDeferredOpens`: release call fails loudly;
  end still releases (CL8).
