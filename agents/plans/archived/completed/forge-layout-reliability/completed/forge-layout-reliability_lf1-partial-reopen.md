# forge-layout-reliability_lf1-partial-reopen

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

Fix `forge layout dev` after closing mon0 Ghostty + google-chrome so mon0 gets
its Ghostty back (not mon1 thrash) and Grok is the active tab leaf.

## Repro (black)

1. Desk matches host `dev` layout.
2. Close left (mon0) Ghostty.
3. Close google-chrome (Grok may remain alone or as sole tab).
4. `forge layout dev`

### Fail

- Chrome rejoins mon0 tab with Grok (OK).
- Grok is **not** open/active.
- New Ghostty lands on **mon1** → mon1 3-unit hsplit; mon0 1 unit.

### Pass

- mon0: `tab(chrome, Grok) | ghostty` (ghostty on mon0).
- mon1: `ghostty | tab(YT, Gmail, Voice)` (original mon1 ghostty reused).
- mon0 tab open leaf: **Grok** (documented rule).

## Scope

- Planner claim / open / residual after open (`layout_plan.py`, `layout_apply.py`, CLI apply loop in `scripts/forge/forge`).
- PlaceNext / launch mon targeting if opens ignore slot mon.
- Active / `lastTabFocus` after open batch (focus actions, preserve survivor).
- Unit tests + dry-run fixtures; live black verify if environment allows (no SSH).

## Non-goals

- Intermittent tab-click (LF2).
- STACKED chrome.

## Acceptance

- [x] Repro pass criteria above (unit + plan dry-run minimum; live preferred).
- [x] mon0 Ghostty open/place on mon0; mon1 Ghostty reused (no steal).
- [x] Grok open leaf after apply (rule documented in `docs/user/layout.md`).
- [x] Tests cover closed mon0 term + closed chrome + mon1 term present.
- [x] Existing two-pass / layout CLI tests stay green.

## Session note

**Root causes (unit + dry-run):**

1. **Mon ensure peer thrash:** any open/move forced mon ensure on *all* mons → mon1
   hsplit on live ghostty before opens, stealing LFT/focus; PlaceNext fallback
   worse if hint misses.
2. **Residual claim after chrome open:** `google-chrome` match is
   `title~= Google Chrome`; new windows titled `New Tab` failed match → residual
   still `open` → apply aborted before move of wrong-mon ghostty.
3. **No open-leaf without `active`:** bare `dev.json` has no `active`/`focus`;
   newly opened chrome stole tab focus from surviving Grok.
4. **PlaceNext wildcard:** ghostty launch set PlaceNext without `wmClass` (first
   class hint used only for wait) — peer windows could steal the mon0 hint.

**Fix:**

- Mon ensure only for mons with role open/move (`mons_with_placement`).
- `role_pins` + `just_opened_roles` on residual replan; apply loop pins launch
  `windowId`s.
- Survivor focus (`reason: survivor`) when profile omits `active` and companions
  join — prefer live lastTabFocus among survivors, else first survivor.
- `do_launch` PlaceNext uses first inferred class hint (not wildcard).

**Tests:** `TestPartialReopenLF1` + existing CLI suite **287 passed**.

**Docs:** survivor open-leaf rule in `docs/user/layout.md`.

**No commit** (A leaves dirty tree for B / parent wrap-up).

### Verifier (Task Force B — 2026-07-29)

**VERDICT: AGREE**

Reviewed on `plan/forge-layout-reliability` (dirty tree, no commit/push).

| Claim | Verdict |
| --- | --- |
| mon ensure only `mons_with_placement` | Correct; peer mon1 thrash skipped on plan1 + residual dry-runs |
| `role_pins` residual claim for "New Tab" chrome | Correct; without pins residual still `open` chrome → abort path |
| survivor focus when no profile `active` | Correct; plan1 (status=open companion) + residual (`just_opened_roles`) both emit Grok; explicit `active` still wins |
| PlaceNext first class hint | Correct wiring in `do_launch`; residual move still recovers wrong mon |
| Tests + docs | `TestPartialReopenLF1` covers repro shape; docs rule present |

**Tests:** `pytest tests/unit/cli/ -q` → **287 passed**.

**Synthetic dry-runs:** plan1 opens mon0 chrome+ghostty, reuses mon1 ghostty, no mon1 ensure, focus Grok survivor; residual with pins moves wrong-mon ghostty + focus Grok; happy residual focus-only.

**Risks remaining (not blocking):**
1. Live black not re-run this session (unit + dry-run only).
2. PlaceNext `wmClass` is exact (no reverse-DNS stem); first `class_hints[0]` mismatch → PlaceNext no-op, residual move/pin still covers mon.
3. mon ensure no longer repairs peer mons that only need split re-assert without open/move on that mon (intentional LF1 tradeoff).
4. `just_opened_roles` tied to `role_pins` keys — correct in apply loop; residual survivor depends on both.
