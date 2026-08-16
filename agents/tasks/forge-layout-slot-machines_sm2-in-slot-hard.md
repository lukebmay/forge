# forge-layout-slot-machines_sm2-in-slot-hard — In-slot hard + forest-match Done.ok

**Status:** ready  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high**. Contract change — keep D040/D041.  
**Depends:** SM0 **done**. May overlap SM1 if you do **not** edit
`window.js` rehome.

## Goal

Hard-ready means the window is **in the desired slot**, not TILE
somewhere. `Done.ok` is a **required forest match**. Hard timeout must
not continue the product path as success.

## Acceptance

- [ ] `windowIsSettled` / hard-ready grows an **in-slot** variant used by
      ApplyLayout: TILE\|grab + desired mon + desired parent CON + ε rect
- [ ] TILE on the wrong mon is **pending**, not settled
- [ ] Hard timeout no longer `_applyHardReadyResult` warn-and-`ok: true`
      as the terminal success path. Record pending; do not mark the run
      successful because focus later passed
- [ ] `_finishSpine` / Done: `ok: false`, `code: hard-failed` when any
      **required** TILE slot is not in-slot (named list in result)
- [ ] Focus-only verify is **not** the `ok` definition (may still run)
- [ ] FLOAT / `ignore` / non-tile roles are not required hard targets
- [ ] Retry loop is **SM4**. This slice may expose “pending after one
      wait” without implementing N=2 retries
- [ ] L0: wrong-mon TILE pending; empty required mon fails Done; timeout
      is not success
- [ ] No PlaceNext dest change (SM3). No belt delete (SM6)

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Predicate | `lib/extension/layout-apply-settle.js` `windowIsSettled` / `hardReadyStatus` |
| Timeout continue | `layout-apply-run.js` `_applyHardReadyResult` (~warn + `return { ok: true }`) |
| Done | `layout-apply-run.js` `_finishSpine` |
| Forest | snapshot + `planReconcile` expected vs live |
| Tests | `tests/unit/extension/layout-apply-settle.test.js` · `layout-apply-run.test.js` |

### Keep

Existing loose `windowIsSettled` for **non-apply** launch waits if those
callers only need “has a TILE somewhere.” ApplyLayout must use the
in-slot predicate. Extend the named helper; do not fork a twin in
`session-api.js`.

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js
```

### Do not

- Implement slot-machine runtime (SM4)
- Flip `ok` true on required hard-fail (D041)
- Touch `window.js` rehome if SM1 is in flight
- GetTree poll twins

## Session note

**2026-08-16:** Drafted at SM0 lock. Ready for 4.6 high.
