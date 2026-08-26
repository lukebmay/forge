# Task: CA1 — Session diagnostic noise

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** implemented (await B)  
**Risk:** low  
**Mode:** A/B implement–verify  

---

## Goal

Keep useful session/HUP diagnostics; stop `Logger.info` spam from per-window session traces when logging is enabled. Production path stays quiet; non-production file trace remains available.

---

## Primary files

- `lib/extension/window.js` — `sessionLayoutTrace`, `_traceSessionLayoutHomes`, restore/save outcome logs

---

## Acceptance

- [x] Per-window / homes traces use `Logger.debug` (or file-only)
- [x] At most one `Logger.info` (or `warn` on failure) per restore/save outcome
- [x] File trace still works when `production === false` (e.g. `session-layout-trace.log`)
- [x] No behavior change to restore/rehome/shield/hold/richness
- [x] `npm test` green; focus `session-layout` + `bug-h1-soft-rehome-workareas-thrash` suites
- [x] Task + plan session notes updated

---

## Out of scope

- Module extractions (CA4+)
- Removing shield / trace file entirely
- CA2 residue/dead-method hygiene

---

## Test plan

```sh
npm test
# or at least targeted session + h1 suites if full suite is slow
```

---

## Session note

**2026-07-25 (A):** `sessionLayoutTrace` → `Logger.debug` (was `Logger.info`); file append
unchanged when `production === false`. Restore success: one `Logger.info` (`restored
topology …`); restore fail still `Logger.warn`. Save outcome already one info / warn.
Per-window homes / rehome / shield chatter is debug + file only. Touch: `window.js`
~+5/−5. `npm test`: 184 files / 1868 tests green.
