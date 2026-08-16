# forge-layout-slot-machines_sm6-delete-crutches — Delete belt and false-ok

**Status:** ready (do not start before SM4 + SM5)  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5 med**  
**Depends:** **SM4** + **SM5** nest mon=1 green

## Goal

Delete product-path crutches the machines replace (D042 / L7). No dual
spine.

## Acceptance

- [ ] Product ApplyLayout does not run belt or `beltStructure`
- [ ] No hard-timeout warn-and-continue success path
- [ ] No focus-only `Done.ok`
- [ ] D014 already **superseded** (D042) — delete leftover belt **code** and
      tests that treat belt-as-success as the contract
- [ ] Dead helpers / tests that exist only for belt-as-success deleted
      or rewritten to forest-match
- [ ] Nest mon=1 clean + ghosttys still pass without belt

## Context for the next agent

### Paths

`layout-apply-settle.js` `runBeltMovesOnly` / `runBeltStructureRebind` ·
`layout-apply-run.js` belt phases · tests that assert belt counts as
success

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-settle.test.js
./install --kit=vim
forge nested run --monitors=1 -- env FORGE_JOB=0 forge layout _forge-test-clean
```

### Do not

- Leave “belt if machines miss” as default
- Mode B as cold success
- Delete nest/host live cases that still document R036 history — keep
  the **symptom** tests, change the **fix** they encode

## Session note

**2026-08-16:** Drafted at SM0 lock. Blocked on SM4+SM5.
