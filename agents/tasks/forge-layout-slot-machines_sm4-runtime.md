# forge-layout-slot-machines_sm4-runtime — Slot-machine executor

**Status:** ready (do not start before SM2 + SM3)  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high** implement. After merge, orchestrator assigns
a **separate 4.6 high** review of the bag API.  
**Depends:** **SM2** + **SM3**

## Goal

Run **slot machines** on the product ApplyLayout path: parallel
independent slots, serial inside a slot, hard retry N=2, late resume
only while ApplyEpoch is live (D040).

## Acceptance

- [ ] Per-slot state: `open/map → place → hard wait → retry place (≤2)
      → hard-done | hard-failed`
- [ ] TABBED/STACKED CON = **one** machine (members not independent)
- [ ] Parallel only across independent slots
- [ ] First hard wait 5s; retry waits 2s; clock from our place act
- [ ] Late Meta after `hard-failed` resumes **only if epoch still live**
- [ ] All required slots terminal → forest-match (SM2) → then SM5 will
      own focus; this slice may still call today’s focus **after** the
      barrier if SM5 has not landed — do not focus mid-open
- [ ] L0 pure machines: parallel independence, group-as-one, retry then
      fail, no resume after epoch end
- [ ] Nest mon=1 `_forge-test-clean` + `_forge-test-ghosttys` after
      install. Dual nest only for mon-ownership cases
- [ ] No dual forever-path comment left as “temporary default”

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| New bag (prefer) | `lib/extension/layout-apply-slot.js` (or similar) |
| Spine | `layout-apply-run.js` — shrink phase walk to epoch + machines + barriers |
| Hard | SM2 in-slot helpers in `layout-apply-settle.js` |
| Open | SM3 dest contract |
| Epoch | SM1 `beginApplyEpoch` / `endApplyEpoch` |

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-settle.test.js
# plus new slot-machine unit file
./install --kit=vim
forge nested run --monitors=1 -- env FORGE_JOB=0 forge layout _forge-test-clean
forge nested run --monitors=1 -- env FORGE_JOB=0 forge layout _forge-test-ghosttys
```

### Do not

- Start before SM2+SM3
- Per-window machines for tab peers
- Resume machines after Done
- Implement group chrome A (tab D0)
- Delete belt in the same slice unless it is already unused (prefer SM6)
- `_layoutOp` / Mode B

## Session note

**2026-08-16:** Drafted at SM0 lock. Blocked on SM2+SM3.
