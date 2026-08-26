# Task: settle learning (overview — see plan)

**Status:** superseded — use [forge-layout-settle-contract](../plans/forge-layout-settle-contract.md) (SE0–SE9 shipped)  
**Priority:** none  
**Plan:** historical [forge-settle-learning.md](../plans/forge-settle-learning.md)  
**Created:** 2026-08-06  

Active implement task: [forge-settle-learning_sl1-time-to-stable.md](./forge-settle-learning_sl1-time-to-stable.md).

## Intent (locked)

Replace hard-coded thrash seeds over time with **observation from Meta↔tree verify**:

1. On open / move / apply: assert slot vs frame (existing verify).  
2. Count mismatches after corrections; record **time since map / since last move**.  
3. Learn per-wm_class settle delay (quiet floor) until agreement; pad slightly.  
4. Next launches: start near learned line; on new mismatch, extend.  
5. Same machinery for moves — not only first map.

## Session note

**2026-08-06:** Operator Wayland residuals + user lock → plan active; SL1 next.
Do not remove Ghostty seed until SL3 evidence.
