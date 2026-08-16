# forge-layout-slot-machines_sm3-open-into-slot — Bind opens to slot ids

**Status:** ready  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high**  
**Depends:** **SM1** (epoch owns mon during open)

## Goal

Apply opens attach **into the desired slot** (skeleton PH or slot id).
Product apply PlaceNext dest is never mon-root-only (D042).

## Acceptance

- [ ] ApplyLayout spawn PlaceNext dest = PH node / slot path from the
      desired forest, not monitor-root + later belt
- [ ] D034 chrome-family **serialize opens** still holds
- [ ] Shared TABBED/STACKED: members target the **same CON/PH**, not N
      mon-root hints
- [ ] Placeholder taxonomy: reuse skeleton PH; do **not** invent a
      fourth PH kind. AC4 thrash-isolate and D006 fail-open stay distinct
- [ ] L0: dest is slot/PH; mon-root-only apply open is a failed unit
- [ ] Belt may still exist until SM6 — do not rely on it for happy-path
      apply place
- [ ] Nest dual only if you change mon ownership; default mon=1

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Open | `lib/extension/layout-apply-open.js` |
| PlaceNext | `place-hint.js` · `window.js` `placeNext` |
| Launch fields | `lib/shared/layout-open.js` |
| PH | `layout-placeholder.js` · skeleton from `layout-plan.js` |
| R036 pin note | PlaceNext already pins PH when present — finish the “never mon-root-only” contract |

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js
```

(Add/adjust the place-hint file if the dest contract lives there.)

### Do not

- Start SM4
- Delete belt here (SM6)
- Parallel chrome-family opens
- Call `_layoutOp`
- Personal role branches

## Session note

**2026-08-16:** Drafted at SM0 lock. Blocked on SM1.
