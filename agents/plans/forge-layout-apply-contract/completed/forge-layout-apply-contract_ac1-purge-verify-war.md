# Task: forge-layout-apply-contract_ac1-purge-verify-war

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract`  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Host:** black — unit tests only (Wayland; no live install/HUP)

## Goal

Purge **old pixel-war / forest thrash policy** from the layout control loop so
verify is a **sensor**, not an actuator. This is slice 1 of the locked apply
contract (§12 AC1 / plan §15.2). Do **not** implement command epoch (AC2) or
placeholder (AC4) here — only remove/gut KILL paths and fix tests.

## Scope (in)

### Production kill / gut

| Residue | Action |
| --- | --- |
| Verify mismatch → `reassertTilesByIds` / force reassert | **Remove** from verify fire path |
| Verify mismatch → `requestLayout("verify-mismatch")` | **Remove** |
| `LAYOUT_VERIFY_MISMATCH_MAX` + give-up force reassert | **Remove** (or leave dead export unused only if tests force a soft deprecation — prefer delete) |
| Agreement ×2 + auto `agreement-confirm` → SETTLED | **Replace** with sensor semantics (below) |
| thrash-extra verify after SETTLED | **Remove** (`THRASH_EXTRA_VERIFY_REASON`, latch, schedule) |
| `onExternalGeometry` → `requestLayout` + forest unsettle storm | **Stop requesting layout** for residual/external geom; do not re-open pixel war. Borders-only / diagnostic verify OK if already cheap; no full reassert |
| SL1 sample on first Meta↔slot agreement as **driver** of settle policy | Keep `recordSettleSample` **only** as observe metrics if call sites stay; do not couple to reassert |

### New settle semantics (minimal for AC1)

| Term | Meaning after AC1 |
| --- | --- |
| Verify fire | Scan Meta↔slot; log/store `lastVerifyResult`; **never** move windows or `requestLayout` from mismatch |
| `settled` | After a successful post-render verify (or first ok), set settled **without** requiring agreement×2 and **without** thrash-extra. Mismatch: `settled=false`, agreement counters reset if still useful for debug — but **no** reassert/layout |
| Dual path | **Forbidden:** do not leave “if thrashy then reassert” beside the sensor |

### Tests

**Delete or rewrite** tests that require:

- mismatch → N reasserts → give-up force  
- agreement 0→1→2 SETTLED via `agreement-confirm`  
- thrash-extra after SETTLED  
- `onExternalGeometry` schedules **layout** (full forest apply)

**Add/replace with:**

- verify mismatch does **not** call `reassertTilesByIds` / `requestLayout` / `renderTree`  
- verify ok → settled without second auto verify requirement (single ok is enough)  
- thrash-extra path gone (no schedule of that reason)  
- external geometry does **not** `requestLayout` (may still update diagnostics)

### Docs

Short update in `docs/dev/architecture.md` and/or `docs/dev/rendering.md`:
verify = sensor; SETTLED ≠ pixel equality forever; point at apply-contract plan.

## Out of scope (later tasks)

- Command epoch / replace `_suppressGeometrySignalRetile` (AC2)  
- Streaming admit / LF6 fingerprint drop (AC3)  
- Placeholder tile product (AC4)  
- Slot-math pure test hardening beyond what this purge forces (AC5)  
- Live smoke (AC6 deferred)  
- Residual nudge (AC7)

## Acceptance

1. No production path from `_defaultVerifyFire` / `_onVerifyMismatch` / `_onVerifyAgreement` causes tile reassert or `requestLayout("verify-mismatch")`.  
2. No thrash-extra verify schedule.  
3. `onExternalGeometry` does not call `requestLayout` (and does not reassert tiles).  
4. Unit suite green: `npm test` (or `make unit-test`) for touched files + full unit if practical.  
5. Old pixel-war tests rewritten or removed; new sensor tests present.  
6. Docs note sensor-only verify.  
7. No live install, no `killall -HUP gnome-shell`, no Wayland logout tests.  
8. Session notes overwritten on plan + this task.

## FIRM rules for agents

- Branch: `plan/forge-layout-apply-contract` only.  
- No push. No SSH. No secrets in output.  
- No design rewrite of tree/WM from zero — purge policy only.  
- DESIGN-FLAW if acceptance cannot be met without redesign — stop, do not invent dual path.  
- High reasoning; implement thoroughly.

## Session note

**2026-08-07 (A/B AGREE):** Purged pixel-war from `layout-controller.js`. Verify
is sensor-only: single ok → SETTLED; mismatch logs only (no reassert/layout).
thrash-extra + mismatch budget gone. `onExternalGeometry` → verify only.
Unit 2281 green. B AGREE. Wrap-up: stale comments fixed. Next: **AC2** command
epoch.
