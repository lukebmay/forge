# Plan: Forge codebase efficiency & organization audit

**Status:** stub — filed from session-layout thrash work; not started  
**Priority:** later (after Ghostty live verify + daily-driver stability)  
**Trigger:** user concern that thrash fixes layered patches without cleanup  

---

## Why this exists

Install/HUP survival and multi-mon thrash were fixed incrementally
(“throw at wall, keep what sticks”). Product is usable enough to audit **before**
more recovery paths land. Goal: tidy organization and fewer overlapping safety
nets — not a rewrite.

---

## High-signal concerns (seed list)

| Area | Concern | First look |
| --- | --- | --- |
| `lib/extension/window.js` (~4.7k) | WM + session layout + soft rehome + place hints + focus + resize all in one file | Split session-layout orchestration? pure vs GObject |
| `lib/extension/tree.js` (~2.9k) | Tree + decoration hooks + layout compute density | What must stay coupled |
| Thrash recovery layers | Soft rehome (H1), T6 snapshot, session-layout strict rehome, majority mon remap, richness guard, 12s save hold | Document one recovery diagram; drop redundant guards |
| Session match history | id → pid → class+title → class + global assign | Keep assign; document order; remove dead scoring |
| Raise / restack | Tab click, focus manager, session raise, float-under-fullscreen | One stacking policy |
| Debounce timers | workareas settle, grab-end, session save 1.5s, render idle | Inventory: keep only justified |
| Prefs vs extension | prefs not unit-tested; shared settings OK | Note only |
| Tests | Strong unit/regression; live black still the gate | e2e thrash if cheap |

---

## Non-goals

- Full rewrite / flex engine / pin-to-tile  
- Merging gdisplays into Forge  
- Drive-by feature work during audit  

---

## Suggested approach (when started)

1. Map call graphs for enable, workareas-changed, install HUP, render.  
2. Inventory timers/debounces and thrash recovery entry points.  
3. Propose file splits only where boundaries are already pure modules
   (`session-layout.js`, `tree-snapshot.js` pattern).  
4. Small tidy PRs — one concern per change; tests stay green.  
5. Update `docs/DESIGN.md` with recovery architecture.

---

## Related

- [forge-daily-driver_session-layout-ghostty.md](../tasks/forge-daily-driver_session-layout-ghostty.md) (seeded debt table)  
- [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md)  
- [docs/DESIGN.md](../../docs/DESIGN.md) — session layout + soft rehome  

---

## Session note

**2026-07-25:** Stub created after Ghostty global-assign ship. No execution yet.
