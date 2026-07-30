# forge-layout-settle-pure_d0-discussion

**Status:** ready  
**Plan:** [forge-layout-settle-pure.md](../plans/forge-layout-settle-pure.md)  
**Branch:** `plan/forge-layout-settle-pure` (create when implementing; discussion may stay on master)  
**Updated:** 2026-07-29

## Goal

**Discussion and further planning only** — no code for pure settle / low-jump
rehome. Capture consensus on approach after LF6 correctness.

## Context (problems encountered)

See plan for full table. Short list:

- Ghostty (and possibly others) **reposition after open** → residual Move too early
  loses mon placement (two Ghosttys mon0 after close chrome + right Ghostty).
- Stock Ghostty desktop **single-instance** broke multi-mon open (LF4).
- Per-window TILE settle (LF5) still raced app self-move.
- Whole-tree stable then batch rehome (LF6) **works** but is **jumpy**.
- PlaceNext class stem, role_pins, mon claim, survivor active, install≠layout
  all needed along the way (reliability plan LF1–LF6 / SI1 / OP2).

## Discussion agenda

1. **Keep LF6** as production path until replacement is ready (locked).
2. **Per-app settle times** in layout sugar, e.g.  
   `"settleTimes": { "ghostty": 1500 }` (ms after open before that role may rehome).
3. **Batch vs serial** rehome (desk-wide snap vs open-one-rehome-one vs hybrid).
4. **Purer settle signals** (Meta quiet, frame stable, apply shield).
5. **Jumpiness budget** metrics for “done” UX.
6. Next implement slice after user lock (schema? serial open? PlaceNext-only?).

## Acceptance

- [ ] Plan doc filled with **options + recommendation** after discussion with human.
- [ ] Explicit **user lock** on default path (batch / serial / hybrid + settleTimes).
- [ ] Follow-up implement tasks drafted only after lock (not in D0).
- [ ] No code required for D0 completion.

## Non-goals

- Changing LF6 behavior in this task.
- Implementing settleTimes schema yet.

## Session note

**2026-07-30:** Draft recommendation written into plan (hybrid: PlaceNext +
per-app `settleMs` + targeted residual Moves + LF6 batch fallback). Awaiting
**user lock** before PS1/PS2 implement tasks. No code.

Filed 2026-07-29 after LF6 live OK; plan for pure low-jump path.
