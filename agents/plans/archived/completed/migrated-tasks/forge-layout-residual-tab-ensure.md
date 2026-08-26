# forge-layout-residual-tab-ensure — Residual ensure_layout with layout PHs

**Status:** done  
**Plan:** (none) · residual of AL6/AL8 cold open  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Regression:** R035

## Goal

Cold `forge layout dev` on dual-mon host must finish with mon1 tab roles
co-grouped under one TABBED CON (YouTube/Gmail/Voice), not as HSPLIT mon
siblings. Apply must not report ok with structure mismatch.

## Acceptance

- [x] Residual plan with layout PHs + ungrouped multi-role tab slots emits
      `ensure_layout` (tabbed) for those slots, not only `bind`
- [x] Mon-level ensure still skipped while layout PHs remain (skeleton owns mon split)
- [x] Cold empty still skeleton-only (no window-anchored ensure)
- [x] L0: Vitest residual PH case; pytest multi-role PH case; full layout_plan + expected green
- [x] Host mid-session re-apply grouped mon1.s0 (pre-fix path)
- [ ] Host cold re-verify after logout loads tip with this fix (operator)

## Context for the next agent

### Symptom (host Wayland, new session)

`forge layout dev` exit 0 / verify match, but tree:

- mon0: TABBED (Chrome+Grok) | ghostty — OK
- mon1: ghostty | YouTube | Gmail | Voice as **four HSPLIT siblings** — wrong

Dry-run correctly planned `ensure_layout mon1.s0 tabbed` [YouTube,Gmail,Voice].
Second apply (no open) ran order 4 steps → mon1 TABBED n=3 — OK.

### Root

`planReconcile` set `skipWindowStructure = coldEmpty || hasLayoutPh`.

After open residual, skeleton PHs remain → **all** window structure ensure was
skipped. Bind alone was supposed to fill tab CONs; when map/PlaceNext left multi-role
tab roles as mon siblings (common on mon1.s0 with 3 chrome PWAs), bind soft-skip /
partial bind left them flat. Order phase never got ensure_layout. Verify only
checks focus → false “ok”. Job also ran belt 4 moves (mon pin moves), which
cannot form tab groups.

### Fix

| Layer | Change |
| --- | --- |
| `lib/shared/layout-plan.js` | `skipWindowStructure = coldEmpty` only; tab/stack structure ensure while PHs present |
| same | `hasMonEnsure` also requires `!hasLayoutPh` (skeleton owns mon H/V) |
| `scripts/forge/layout_plan.py` | same (dry-run / Python parity) |
| Tests | Vitest residual PH+ungrouped mon1.s0; pytest multi-role PH ensure + mon ensure still off |

Bind still runs first (bind phase); ensure_layout steps land in **order** phase after bind.

### Proven

- L0: `layout-plan-reconcile` 15; normalize 49; pytest layout_plan 212; expected 6
- Residual sim on black/dev: binds=7 + ensure mon0.s0 + mon1.s0
- Host second apply fixed mon1 without this tip; tip installed `g75da70e-dirty` tree
- Nest `_forge-test-ghosttys` open-miss flake (separate; HANDOFF known)

### Host

Logout once to load tip, then cold `forge layout dev` (or close chrome/tabs and re-apply).
Expect mon1: ghostty \| TABBED(YouTube,Gmail,Voice).

```bash
npm test -- tests/unit/shared/layout-plan-reconcile.test.js
python3 -m pytest tests/unit/cli/test_layout_plan.py -q -k 'has_layout_ph or residual_bind'
./install --kit=vim
# Wayland host tip:
#   log out and back in, then:
forge layout dev
forge tree   # mon1 children: WINDOW ghostty + CON TABBED n=3
```

## Session note

Orchestrator prioritized live mon1 structure over PRIORITY queue. **R033**
aspect open-split shipped same session. Do not reintroduce `hasLayoutPh` into
`skipWindowStructure`.
