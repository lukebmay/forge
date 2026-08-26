# WR11 — Marginal coexist + roleOrder first + logical slots

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE 2026-07-27)  
**Depends on:** WR10 nice-to-have (defaults can land without sugar)  
**Priority:** P1 — second A/B after WR10 (highest *desk* usefulness)  
**Repo:** this tree (`scripts/forge/workon_plan.py`, apply if needed)

## Goal

Default lived-in desk behavior:

- `marginal.mode = "coexist"` (omit-noise default)  
- `roleOrder = "first"`  
- Every workon slot is a **logical membership set** (atomic group)  
- Physical tree: 1 member bare tile; 2+ tabbed/stacked CON  
- Unclaimed windows **already in** a slot set → **keep** (after roles)  
- True residuals → **park** overflow (not kill)

## Acceptance

1. Validator/normalize emits
   `"marginal": { "mode": "coexist", "roleOrder": "first" }` when omitted.
2. Planner counts: `kept` (companions), `parked` (residuals only).
3. Fixture: role windows + Nautilus already tabbed with Ghostty slot →
   Nautilus **kept**, roles first in group order plan (reorder if needed).
4. Fixture: unclaimed window on wrong mon / not in any slot set → **park**.
5. Extra copy of a role matcher not already in the role’s slot → residual
   (park), not silently treated as companion unless already in that slot CON.
6. `strict` mode (optional): park all unclaimed (today’s blunt behavior) when
   `"marginal": { "mode": "strict" }` — for users who want old park-all.
7. Unit tests cover keep vs park; dry-run JSON includes kept entries.
8. No close/kill in this task.

## Non-goals

- `--clean` (WR15)  
- Nearest-slot geometry  
- Shellrc profile migration  

## Session note

**Done (A/B AGREE).** Coexist: unclaimed in claimed role parent CON → keep;
residuals park; strict = park-all. Counts `kept`/`parked`; roleOrder first
via ensure windowIds. Tests **122 passed**. Next: **WR12** shellrc sugar.
