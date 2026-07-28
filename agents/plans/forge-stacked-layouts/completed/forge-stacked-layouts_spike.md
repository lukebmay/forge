# Task: STACKED layouts spike inventory

**Status:** complete (awaiting plan acceptance)  
**Plan:** [forge-stacked-layouts.md](../plans/forge-stacked-layouts.md)  
**Why:** P0 next product path — inventory gaps before implement.

## Goal

Spike only (no product implementation unless a one-line doc fix is essential).

1. Inventory **current** STACKED support across:
   - gsettings / defaults (`stacked-tiling-mode-enabled`, stack-off daily-driver T0)
   - Keybinds (cycle stack, focus in stack, convert to stack)
   - DnD (drag → stack vs tab)
   - Decorations / chrome (stack chrome vs tab)
   - Layout profiles / sugar (`stacked` cells, ensure_layout)
   - Session restore / soft rehome / thrash interaction
   - Unit / e2e tests already covering STACKED
2. Produce a **task breakdown** table in the plan (IDs, scope, deps, estimate size).
3. Recommend product default: opt-in flag vs on-by-default (with rationale for Luke/black vs general users).
4. Do **not** implement STACKED features until user accepts the breakdown.

## Acceptance

1. [x] Plan updated: gap inventory + next-task table; status stays spike/queued until accepted
2. [x] Task file session note + PRIORITY still points stacks first
3. [x] No speculative large refactors; code reads only (docs ok)

## Session note

**2026-07-28 TF-A spike done (read-only).**

- Engine: STACKED is real (layout, focus append/restack, vertical chrome, toggle, DnD when flag on, forest/session restore, soft-rehome align). Flag default **false** (T0); DnD force-tab when off.
- Gaps: bare sugar + `layout save` always multi-window → **tabbed** (STACKED lost on round-trip); thrash multi-role only checks tabbed; `config/settings.schema.json` + user docs still say stack **on**; no CLI stacked tests.
- Recommend: **keep opt-in**. Task IDs SL0–SL6 in plan; **next after accept = SL0** (docs/schema), then **SL1** (save/IR round-trip). No product code this session.

**B AGREE** — inventory spot-checked; next SL0 then SL1 after accept.
