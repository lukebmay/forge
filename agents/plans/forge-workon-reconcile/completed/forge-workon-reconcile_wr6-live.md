# WR6 — Live black acceptance (`forge workon dev`)

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P1 product  
**Depends:** WR1–WR5, WR10–WR15  

## Goal

Prove idempotent morning layout on **black** (dual 4K, X11, Shell 46) after
sugar + coexist + tab settle + `--clean`. Fix any match/structure blockers
that prevent “already perfect → nothing to do.”

## Acceptance (from plan)

1. [x] **Empty / offline empty tree:** dry-run plans opens for all 7 roles.
2. [x] **Already perfect:** second `forge workon dev` opens **0** (structure-only roleOrder residual OK).
3. [x] **Partial:** missing one role → one open; others reused (`--tree-file`).
4. [x] **Messy / doubled:** extras residual-parked or kept; no third Gmail spawn.
5. [x] **Companions:** unclaimed in a workon slot **kept** under coexist.
6. [x] **Sugar profile:** black `dev` is short `tiles` JSON; resolves from shellrc host path.
7. [x] **Host resolve:** `source=host` + path under `…/hosts/black/dev.json`.
8. [x] **`--dry-run`:** shows plan; no mutations.
9. [x] Unit tests still green for normalize/planner (`131` CLI tests).

## Known caveat (WR4) — **fixed**

`chrome-luke` now uses `title~="Google Chrome"` (substring). Matches
`New Tab - Google Chrome` / `… - Google Chrome`; does not match PWA titles
(Grok/Gmail/YouTube/Voice).

## Method

| Check | How |
| --- | --- |
| Live perfect / apply | `DISPLAY=:1` on black; dry-run → apply → dry-run again |
| Empty / partial / messy | `--tree-file` fixtures + live dry-run when safe |
| Host / sugar | `forge workon list` / `show dev` |
| No surprise kills | Never default `--clean` in trials |

## Out of scope

- WR7 capture, WR8 stableKey, WR9 env snippet  
- Process-kill / empty-desk by force-closing user windows  
- Personal fork / audit B1  

## Session note

**WR6 Done (A).** chrome-luke match fix + live black accept.

### Shipped
- shellrc `hosts/black/dev.json`: `title~="Google Chrome"`
- `scripts/forge/examples/workon-dev-v2.json`, `tests/.../profile-dev-v2.json`
- `docs/user/workon.md` + shellrc `workon/README.md` Chrome caveats
- unit: `test_title_substr_main_chrome_not_pwa` in `test_workon_plan.py`

### Live (black, DISPLAY=:1)
| Pass | reused | opened | structure | notes |
| --- | ---: | ---: | ---: | --- |
| Before match fix | 6 | **1** (chrome-luke) | 2 | companion kept: Walmart Chrome tab |
| After match fix dry-run | 7 | 0 | 1 | chrome-luke claimed |
| Apply | 7 | 0 | 1 | mon1.s0 tab order only |
| 2nd dry-run | 7 | 0 | 1 | roleOrder residual (YT/Gmail/Voice) — not settling fully |

### Offline `--tree-file`
- empty → opened 7
- partial (no Gmail) → opened 1 / reused 6
- doubled-black → opened 0, parked 4, kept 3
- two Gmail → opened 0, gmail reused once, extra kept

### Host
`forge workon list` → `source=host` → `…/hosts/black/dev.json`

### Tests
`pytest tests/unit/cli/` → **131 passed**

### Residual (not blocking)
mon1.s0 `ensure_layout` roleOrder (desired youtube→gmail→voice) may re-plan after apply; **opened always 0**. Optional follow-up if tab order thrash bothers.

### Next-agent
- WR7 capture (or PRIORITY next); do not re-open WR6 unless match/open regresses
- shellrc profile change may still be uncommitted outside this repo
