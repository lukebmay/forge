# Task: settle learning (verify-driven, no app seeds)

**Status:** draft (unfinalized — design + implement after RC smoke)  
**Priority:** mid / post-RC  
**Plan:** (none — may fold into layout-control-loop later)  
**Created:** 2026-08-06  

## Intent

Replace hard-coded thrash seeds (e.g. Ghostty `minQuietMs` / sticky `needsExtraVerify`) with **observation from Meta↔tree verify**:

1. On open / move / apply: assert slot vs frame (existing verify).  
2. Count mismatches after our corrections; record **time since map / since last move**.  
3. Learn per-wm_class settle delay (or quiet floor) until agreement; pad slightly.  
4. Next launches: start near learned line; on new mismatch, extend.  
5. Same machinery for moves and other thrashy ops — not only first map.

All apps use the same pipeline; data differentiates them. No brand defaults in shipped code (comments naming apps for archaeology OK).

## Relation to current thrash score

Today (session memory + seeds):

```text
thrashScore = postMapSizeChanges + 2 * postApplyDrift
needsExtraVerify if thrashScore >= 3 (or built-in sticky)
minQuietMs only from built-in seed today (Ghostty 250ms)
```

Counters are event counts, **not** elapsed ms. User vision is **time-to-stable** learning — stronger and more actionable for open-commit.

## Do not start until

- Operator Wayland re-smoke after reload  
- RC path clear enough that settle redesign won’t block release  

## Session note

**2026-08-06:** Captured operator design. Wait on removing Ghostty seed until after reload evidence.
