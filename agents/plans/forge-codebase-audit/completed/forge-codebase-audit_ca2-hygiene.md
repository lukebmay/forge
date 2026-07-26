# Task: CA2 — Hygiene: residue + dead method + timer clear

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** implemented (await B)  
**Risk:** low  
**Mode:** A/B implement–verify  

---

## Goal

1. Delete leftover debug tree `temp-before-debug/` (not used by build/tests; not properly gitignored as `temp`).
2. Remove dead duplicate `_monitorIndexOfNode` in `window.js` (defined twice; later wins). Keep the null-safe implementation.
3. Align `_sessionLayoutSaveSrcId` teardown with other timers when safe.

No restore/rehome behavior change.

---

## Primary files

- `temp-before-debug/` — delete entire tree
- `lib/extension/window.js` — `_monitorIndexOfNode` at ~1047 and ~2916; session-save timer clear

---

## Acceptance

- [x] `temp-before-debug/` gone; no make/test/import refs
- [x] Single null-safe `_monitorIndexOfNode`
- [x] Session-save timeout cleared with other timers in teardown when safe
- [x] No restore/rehome behavior change
- [x] `npm test` green
- [x] Task + plan session notes updated

---

## Out of scope

- mon-ws helper unify (B5b)
- logger noise (CA1 done)
- extractions (CA4+)

---

## Test plan

```sh
npm test
```

---

## Session note

**2026-07-25 (CA2 A):** Hygiene landed.
1. `rm -rf temp-before-debug/` (~900K old extension snapshot). No Makefile/package.json/tests/docs/import refs (only agents plan/task docs mentioned it).
2. Removed dead first `_monitorIndexOfNode` (~1047, non-null-safe). Kept single null-safe impl (tree `findAncestor` MONITOR → `Utils.monitorIndex`, else `meta.get_monitor()`).
3. `_sessionLayoutSaveSrcId` now cleared via `_clearTimeoutId` in `_removeSignals` with other timers; `flushSessionLayout` uses same helper; redundant manual clear in `disable()` removed (still saves immediately after `_removeSignals`). Debounce 1500ms / hold / richness unchanged.
- `npm test`: 184 files, 1868 tests passed.
