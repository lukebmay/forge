# Plan: Zero thrash for `forge workon` (product gate)

**Status:** **Shipped** TZ1…TZ-live; **open residual** Mode A nested companions  
**Priority:** **P0 product survival** (outranks polish, tidy, optional extracts)  
**Base:** this tree  
**Related:** [forge-workon-reconcile.md](./forge-workon-reconcile.md) WR11–WR16,
session H1 soft-rehome (different thrash class — lock/wake Meta)

### Session note (2026-07-27) — live residual (Mode B fallback OK)

**Shipped:** TZ-detect → recover → collect → tab-apply flatten → gate (`--safe`)
→ matrix → live dry-run on black.

| Mode | Behavior |
| --- | --- |
| **A** | roles + tab marginals by view overlap (first view) |
| **B** | roles only; soft-park non-roles (`destWindowId`) |
| **safe** | open+move only |

**Live black (interactive, user):** perfect `dev` → Nautilus under left Ghostty →
FB+Chess under right Ghostty → `workon dev`:

| | Result |
| --- | --- |
| Ideal Mode A | **Missed** (should tab Nautilus→left term, FB/Chess→right term) |
| Mode B fallback | **Worked** — all three soft-parked to mon1 last TABBED (chrome bag) |

Post tree + reconstructed pre: fixtures
`tree-live-mode-b-park-after-nested.json`,
`tree-live-pre-nested-companions.json`.

**Next session:** [TZ-mode-a-nested](../tasks/forge-workon-thrash-zero_tz-mode-a-nested.md)
— do not treat role+VSPLIT companions as thrash; Mode A collect into that view.


---

## Why this exists

A single dual-mon (or even one-mon) thrash after `forge workon` makes the
product feel unfinished. Users will stop running it. **Thrash cannot be a
normal outcome.**

| Word | Meaning (product) |
| --- | --- |
| **Thrash** | Tiles jump to odd places; groups uncouple into individuals; wrong split shape (e.g. nested HSPLIT columns instead of a tab bag); mon rebalance turns leftovers into full-height slivers |
| **Not thrash** | Quiet role re-tab when already almost correct; intentional open-app LFT |

---

## Container model (locked)

Exactly three physical container layouts for tiling structure:

| Type | Children arrangement | User language |
| --- | --- | --- |
| **HSPLIT** | Side by side (left \| right) | horizontal / hsplit |
| **VSPLIT** | Stacked (top / bottom) | vertical / vsplit |
| **TABBED** | Same rect, tab strip | tab group |

**Nesting:** HSPLIT and VSPLIT may nest arbitrarily. TABBED is a leaf bag of
windows (or, rarely, temporary nested CONs that should be flattened).

| Transition | Behavior |
| --- | --- |
| H/V → **TABBED** | **Flatten** nested arrays into one tab bag — **lossy** (split structure not recovered) |
| **TABBED** → H or V | Members become **slivers** along that axis (equal share unless percents set) |
| H ↔ V | Same children, flip axis |

The live mon1 dump after thrash:

```text
mo1 HSPLIT
├── CON HSPLIT                    ← should have been TABBED (term view)
│   ├── Ghostty
│   └── CON HSPLIT
│       ├── Facebook
│       └── Chess
└── CON TABBED  YT | Voice | Gmail   ← role rejoin OK
```

…is exactly “wanted TABBED, got nested HSPLIT slivers,” not an h/v variable swap.

---

## Strategy (locked) — two modes

### Mode A — Desk looks sane (not thrashed)

| Step | Behavior |
| --- | --- |
| Roles | Claim, open gaps, move only if wrong mon/view |
| **Views** | Profile mon children / nested splits = **viewable areas** |
| **Marginals** | Non-role tiled windows → assign by rect overlap; partial → **first** view; **tab into that view** |
| Structure | Each view: roles first + marginals; tabbed when ≥2 members |
| Mon ensure | Only if a **role** open/move requires mon split rewrite |
| Goal | `workon dev` **cleans** desk; second run ≈ no-op when already clean |

**Not Mode A:** leave marginals alone (TZ1 leave) — too weak for morning cleanup.

### Mode B — Thrash detected (desk already wrong)

| Step | Behavior |
| --- | --- |
| **Do not** | Trust thrash geometry for marginal homes |
| **Do** | Place **only workon role windows** into config views |
| **Park** | Every other tiled window → last mon last group (`destWindowId`) |
| Goal | Roles right; junk in one bag |

**Rationale:** Sane desk positions encode which view a marginal sits in → collect.
Thrashed positions do not → park non-roles.

---

## Thrash detection (TZ-detect)

Pure function over GetTree forest + validated profile → `{ thrashed: bool, reasons[] }`.

### Positive signals (any strong → thrash, or score ≥ threshold)

| Signal | Example |
| --- | --- |
| Role mon wrong for several roles | ghostty-right on mon0 |
| Desired mon-child view is nested H/V when profile wants **tabbed** multi-role | term region = nested HSPLIT(ghostty, …) |
| Mon has far more mon-level children than profile mon children | 5 mon kids vs 2 views |
| Role windows not co-grouped when profile says tabbed | YT/Gmail/Voice split across mons/CONs |
| `thrashRisk` from prior plan / live high structure+move | score ≥ N |

### Negative (not thrash)

| Signal | Example |
| --- | --- |
| All roles correct mon + tab groups share as profile | Perfect / leave-residuals only |
| Only order-of-tabs differs | TZ1: ignore order-only |

Ship as `detect_thrash(forest, profile) → { thrashed, score, reasons }` on every plan
(`plan.thrashState` next to `thrashRisk`).

---

## Safe dump (park target)

| Rule | Detail |
| --- | --- |
| Target | Last **monitor with windows** (highest mon index), last mon-level group’s last window (prefer last **claimed role** if any on that mon — TZ1 soft anchor) |
| Op | `park` with `destWindowId` only — move onto that id |
| Never | `path:mo0ws0` mon-root insert; mon0+mon1 ensure for park |
| Dump group | After parks, **one** tabbed bag preferred (layout tabbed on dump anchor + moves) only if dump is not already a multi-window CON — keep minimal |

---

## Role placement (both modes)

Profile defines **views** (sugar/IR mon children / nested splits):

```text
mon1: [ ghostty-right , [ youtube, gmail, voice ] ]
        view mon1.term      view mon1.comms (tabbed)
```

| Mode | Role path |
| --- | --- |
| A | Reuse if mon OK; structure if not co-grouped for multi-role views |
| B | Same for roles only; force structure to profile shape for role views |

**TABBED ensure must actually yield TABBED** (acceptance: no nested HSPLIT
leftover for the same windowIds). Fix apply if needed (extension wrap + move).

---

## Task table (task force A/B)

Serial A implement → B verify; max 5 rounds; fresh agents per task.

| ID | Task file | Goal | Size | Depends |
| --- | --- | --- | --- | --- |
| **TZ1** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz1-leave-soft-park.md) | Leave residual + soft park + thrashRisk | — | **Done** |
| **TZ-detect** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-detect.md) | `detect_thrash` + fixture from live mon1 dump | M | **Done** A/B AGREE |
| **TZ-recover** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-recover.md) | Mode B: roles only + park non-roles to safe dump | M | **Done** A/B AGREE |
| **TZ-collect** | [task](../tasks/forge-workon-thrash-zero_tz-collect.md) | Mode A: tab marginals into overlapping view areas | M | **Done** A (B verify) |
| **TZ-tab-apply** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-tab-apply.md) | Tab structure apply yields TABBED not nested HSPLIT | M | **Done** A/B AGREE |
| **TZ-gate** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-gate.md) | CLI: Mode A collect / Mode B recover; `--safe` / `--force` | S | **Done** A/B AGREE |
| **TZ-matrix** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-matrix.md) | Fixture matrix lock table for A/B modes | M | **Done** A/B AGREE |
| **TZ-live** | [completed](./forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-live.md) | Live black checklist | S | **Done** + interactive residual filed |
| **TZ-mode-a-nested** | [task](../tasks/forge-workon-thrash-zero_tz-mode-a-nested.md) | Mode A when marginals under role VSPLIT (not Mode B dump) | M | **Next** — live residual |

**Next task:** **TZ-mode-a-nested**.

---

## Thrash taxonomy (updated)

| ID | Class | Status |
| --- | --- | --- |
| T1–T2 | Park + mon ensure / mon-direct park | WR16 |
| T3–T5 | Hard park / overflow ensure / order-only | TZ1 |
| T6 | Companion structure → nested HSPLIT | **TZ-tab-apply + Mode B** |
| T7 | Role move mon ensure | TZ-gate / mon ensure only if needed |
| T8 | Post-open replan wave | later |
| T9 | Focus after batch | WR14 |
| T10 | Session H1 | out of scope |
| **T12** | Mode B recover | **TZ-recover** |
| **T13** | Nested VSPLIT companions → false thrash / wrong bag | **TZ-mode-a-nested** (open) |

---

## Non-goals

- Geometry “which half was this PWA meant for” after thrash  
- Nearest-slot residuals as default  
- Undo stack for H/V → tab flatten  
- Session lock/wake (H1)  
- Changing black `dev.json` sugar unless tests need it  

---

## Success criteria

1. Sane desk + FB/Chess: `workon` does not dual-mon thrash; second run no-op (roles).  
2. Voice pulled out: rejoins chrome **TABBED**; Ghostty/FB/Chess not left as full-height HSPLIT slivers (either leave alone in Mode A if not thrashed, or Mode B parks non-roles).  
3. Detected thrash: roles restored; all other tiles soft-parked to last mon last group.  
4. Tab ensure never leaves nested HSPLIT for a multi-window tab view.  
5. Fixture matrix + live checklist green.  

---

## Orchestrator notes (task force)

- One task at a time; A implement → B verify; do not resume transcripts.  
- Handoff: overwrite plan session note + task note only.  
- Pure planner tests first; extension tab apply needs unit/regression if touch GJS.  
- No commit/push unless user asks.  
