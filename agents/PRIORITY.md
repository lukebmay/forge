# forge (lukebmay) — active priorities

**Updated:** 2026-08-10  
**Lens:** healthy codebase first — ownership, pure reuse, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** **Lifecycle / pure abstractions** (rate → lock → implement with tests).  
Wayland nest dual-mon RC and nest isolation discussion are **parked** until that track moves.  
Architecture = cold spine + D019 hard/soft (not patch thrash).

**FIRM:** `forge nested stop` after any nest tests — never leave subshells running.  
See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0 now** | **Lifecycle abstractions D0:** rate L1–L9, invent more, utils audit, unit-test plan; **user lock** before code | [plan](./plans/forge-lifecycle-abstractions.md) · [D0](./tasks/forge-lifecycle-abstractions_d0-rate.md) |
| **P0 after lock** | Pure modules + comprehensive unit tests; wire one owner at a time | tasks TBD from D0 |
| parked | Nest isolation strategies discussion | [D0 nest](./tasks/forge-nested-isolation_d0-discussion.md) |
| parked | Nest dual-mon RC + layout smoke (`_forge-test-*`) | [suite](./plans/forge-wayland-rc-test-suite.md) |
| parked | Host dual-mon L1 / live matrix on `_forge-test-*` | [AI live matrix](./plans/forge-ai-live-test-matrix.md) |
| next (later) | R010 only if structure still fails first-shot after resume | [REGRESSIONS](./REGRESSIONS.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | R007; D019 SE0–SE9; AT-W1 nest; CLI jobs; leader true-cold; place→structure residual | completed/ |

**Handoff:** [HANDOFF.md](./HANDOFF.md) — abstractions P0; spine over band-aids; stop nest if used.

```bash
# P0 is discussion + pure unit tests — not full Wayland RC.
# If nest is used anyway:
forge nested stop
forge nested status   # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | P0 health plan |
| [D0 rate](./tasks/forge-lifecycle-abstractions_d0-rate.md) | Rate + invent + utils |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Parked RC |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
