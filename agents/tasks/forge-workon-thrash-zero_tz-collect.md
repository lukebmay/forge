# TZ-collect — Mode A: tab marginals into view areas

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (after TZ-detect; with or after TZ-recover)  
**Priority:** P0  
**Depends:** TZ-detect (view geometry helpers shared with thrash detect)  
**Task force:** A implement → B verify  

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Role** | Window claimed by a profile role matcher |
| **Marginal** | Tiled window not claimed by any role (aka old “residual”) |
| **View area** | Profile mon-child / nested pane region (geometry from mon + splits) |

## Goal

When **not** thrashed (`thrashState.thrashed === false`):

1. Build view regions from profile layout (equal splits default).  
2. For each marginal window, assign to view(s) by **rect overlap**; if multiple, **first** view in profile order.  
3. Plan structure: each view’s members = role windows (order) + assigned marginals → **tabbed** when ≥2.  
4. Apply via existing ensure_layout tab path (needs TZ-tab-apply reliability).  

**Not:** leave marginals in place (TZ1 leave). User wants `workon dev` to **clean** the desk.

When thrashed: **do not** run Mode A collect — TZ-recover parks non-roles.

## Acceptance

- [ ] Fixture: perfect mon1 + mon-direct FB/Chess in ghostty half → collect to mon1.term tab; no park  
- [ ] Fixture: marginal only overlapping chrome half → mon1.comms tab  
- [ ] Partial straddle → first view  
- [ ] Second plan after collect → nothingToDo / no thrash  
- [ ] tests green; plan + task notes  

## Non-goals

- Mode B park  
- Extension tab bug (TZ-tab-apply) unless plan-only  

## Session note

(next agent fills)
