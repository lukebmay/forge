# layout-mon-claim-order

**Status:** verified  
**Updated:** 2026-07-29

## Problem

After closing mon0 ghostty + mon0 chrome and running `forge layout dev`:

1. **Wrong mon:** remaining mon1 ghostty is stolen for mon0 role; new ghostty for mon1 often lands wrong / mon1 becomes fullscreen tabs; mon0 becomes 3-pane hsplit.
2. **Tab order:** mon1 tabs end wrong (e.g. YT, Voice, Gmail instead of YT, Gmail, Voice) — aggravated when mon hsplit ensure demotes TABBED.

## Root causes

1. **Single-pass role claim** in `plan_reconcile`: roles processed mon0→mon1; `_pick_window` falls back to any candidate when pref mon empty → mon0.ghostty steals mon1's ghostty before mon1.ghostty-2 claims it.
2. **`_mon_split_anchor_ids` fallback** to `_role_window_ids_for_mon` includes **tab members** when the only non-tab mon child role is still `open`. Then `ensure_layout mon1 hsplit` runs `layout HSPLIT` on a tab leaf → **demotes TABBED → HSPLIT**, thrashing tab order/structure.

## Fix

1. **Two-pass claim:** pass 1 claim only same-mon (pref) candidates; pass 2 fill remaining roles from leftover candidates (cross-mon move / open). Mirror in `_claim_roles_for_detect` if it shares the one-pass path.
2. **Safe mon anchors:** never fall back to tab/stack bag members for mon hsplit/vsplit ensure. Prefer empty → skip mon ensure (extension steps already skip when no selector).
3. **Tests:** dual-ghostty, mon0 empty / mon1 has ghostty → mon1 reuses, mon0 opens (not move). Tab-only mon after missing term → mon ensure has no tab-member windowIds. Tab order ensure still works.
4. Unit tests + brief task note.

## Acceptance

- [x] mon0 empty of ghostty, mon1 has one ghostty + tabs → plan: mon1 ghostty **reused**, mon0 ghostty **open** (not move steal)
- [x] mon ensure windowIds never list only-tab-bag members when non-tab role is open
- [x] existing mon order / tab order tests still pass
- [x] `npm test` / unit CLI tests for layout_plan green

## Session note

**Shipped + verified (do not close either Ghostty while testing):**

- **`_two_pass_claim_windows`**: pass1 same-mon only; pass2 leftover any-mon. Used by `plan_reconcile` + `_claim_roles_for_detect`.
- **`_mon_split_anchor_ids`**: no tab-member fallback; mon ensure omitted when anchors empty.
- **Unit:** `pytest tests/unit/cli/ -q` → 285 passed (`TestTwoPassMonClaim` green).
- **Synthetic steal** (`--tree-file`, mon0 empty / mon1 ghostty+tabs): mon1 ghostty **reused**, mon0 ghostty **open**, moves `[]`, mon ensure anchors = ghostty only (not tab bag).
- **Live black (no Ghostty closed):** started mon0=ghostty only, mon1=ghostty+YT/Gmail/Voice. `forge layout dev` opened Chrome+Grok on mon0; both original ghostty wids preserved (mon0 `1626097374`, mon1 `1626097373`); mon0 = tab(chrome,Grok)|ghostty; mon1 tabs order YT→Gmail→Voice. Post dry-run: 7 reused / 0 open / thrashRisk 0 (focus-only residual).
- **Medium sugar:** host `dev` uses `tab` keys; `layout save --stdout` round-trips medium `tab` + string ghostty.
- **No commit** (not requested).
