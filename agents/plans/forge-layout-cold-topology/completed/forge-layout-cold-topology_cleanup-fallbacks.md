# CT-cleanup — Strip patchwork; architecture holds the weight

**Status:** done  
**Plan:** [forge-layout-cold-topology.md](../../forge-layout-cold-topology.md)  
**Branch:** `plan/forge-layout-cold-topology`  
**Test host:** **X11** preferred (agent `./install` + Shell HUP). Wayland logout for extension-only when needed.  
**Doctrine:** [HANDOFF.md](../../../HANDOFF.md) — patches bad; spine good; **no personal-layout special cases**

---

## Goal

Stop duct-taping cold/open/layout. **Delete or demote** fallbacks that only exist because construction order or open policy was wrong. After this task, the **CT0 phase model** is the only happy path — not belt + retry + re-focus + Mode B.

This is not “docs only.” Audit real call sites, remove weight, keep unit suite green with **abstract** fixtures (roles a/b/c, dual mon), not one host desk.

---

## Why this is P0

Stacked mitigations (belt ensure, preserve lastTabFocus, final focus quiet/reassert, postOpenRetry, Mode B as cold success, mon-root patches) make the next failure harder to see and encourage more patches. Operator: **architecture holds the weight; clean off the patchwork when the real fix exists.**

---

## Spine (do not invent another pass)

```text
skeleton → open → bind → order/size → focus once (post-settle) → residual
```

Thrash mid-batch forbidden. Mode B = true chaos / explicit recover only.

---

## Audit table (2026-08-08)

| Area | Verdict | Path / symbol | Notes |
| --- | --- | --- | --- |
| CLI belt structure re-ensure | **delete** (structure ops) | `layout_apply.belt_actions_from_plan`; `forge._layout_run_reconcile` belt block | Belt = pin-role **moves only**. Residual bind/order/size owns topology. D014 |
| Cold `postOpenRetry` / plan4 | **demote** (keep opt-in) | `forge` ~`FORGE_LAYOUT_POST_OPEN_RETRY` | Already off default (CT1). No change. D009 |
| Mid-flight focus before settle | **keep** stripped | `without_focus_actions` pre-open + residual | Final pass only. D015 |
| Extra final-focus reassert | **delete** default | `_layout_final_focus_pass`; `FINAL_FOCUS_REASSERT_MS=0` | Opt-in `FORGE_LAYOUT_FINAL_FOCUS_REASSERT_MS`. D015 |
| Preserve lastTabFocus on ensure | **keep** (generic) | `session-api.js` `_layoutOp` | Mid-session ensure still anchors first id. D016 |
| Mode B park on cold / just_opened | **keep** suppressed | `layout_plan.plan_reconcile` `suppress_thrash_park` | Report-only cold; Mode B mid-session only |
| Ensure-after-open topology rebuild | **keep** gated | `skip_window_structure` when `cold_empty` or layout PH | Skeleton/bind path; no invent on PH residual |
| Timing try-again sleeps | **demote** | Quiet 400ms before focus kept as Meta settle | Second reassert sleep removed |
| Docs/help Mode B as normal cold | **delete** framing | `cli_help.py`, `docs/user/layout.md` | Cold = one-shot spine; Mode B mid-session |
| Personal-layout framing | **keep** abstract tests | belt unit uses role `Grok` only as pin name in abstract list | No product app branches |
| Chrome-clear after residual | **keep** | LayoutBatch chrome-clear in finally | D010 — long residual phase |
| Dock sticky / last tile | **keep** | open-app policy (D007/D013) | Generic; not desk-specific |
| AC1–AC6 settle | **keep** | layout-controller sensor | Never reassert forest on mismatch |
| `--safe` / fail-open PH | **keep** | plan + AC4 | Unchanged |

---

## Acceptance

- [x] Written audit table: each candidate → **keep / demote / delete** + path/symbol  
- [x] Dead cold success paths removed or gated behind explicit recover  
- [x] No new happy-path “plan twice / belt invent / multi-focus” without removing an old one  
- [x] Unit suite green; tests describe **policy**, not one profile’s apps  
- [x] `docs/user/layout.md` cold section = one-shot spine only  
- [x] DECISIONS / archive: what was removed and why (D014–D016)  
- [x] HANDOFF + PRIORITY updated after ship  
- [x] Settled X11 re-run ok (CLI path live); **CT3 near-cold + partial matrix green (2026-08-09)**  

---

## Session note

**2026-08-09 (close):** CT3 near-cold X11 green + agent partial reload matrix green after settle SE0–SE5+SE7. Cleanup strip remains landed (belt moves-only, one focus phase, postOpenRetry opt-in). True cold-empty and CT2 Wayland still optional / human-logout — not required to keep this strip closed.

**2026-08-08 (cleanup implement):**

- **Deleted weight:** belt `ensure_layout`/`ensure_order`; default final-focus reassert (250ms second pass).  
- **Kept:** one quiet + one focus; pin-role belt moves; lastTabFocus preserve on `_layoutOp`; postOpenRetry env opt-in; Mode B mid-session; D010 chrome-clear.  
- **Docs:** DECISIONS D011/D012 superseded → D014–D016; layout.md cold; cli_help Mode B tips; REGRESSIONS R001/R002; DESIGN open-then-place steps.  
- **Tests:** `test_belt_actions_pin_moves_only_by_default`; CLI units **455 passed**.  
- **Live:** X11 session; settled `forge layout dev` → ok (focus-only work). Full cold empty one-shot = **CT3**.  

Created 2026-08-08; unparked as P0 same day; closed 2026-08-09.
