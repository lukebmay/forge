# forge (lukebmay) — active priorities

**Updated:** 2026-08-10  
**Lens:** healthy codebase first — ownership, pure reuse, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** **Lifecycle abstractions — A1 SourceBag done; next L6 settle-math / SignalBag.**  
Wayland nest dual-mon RC and nest isolation discussion are **parked** until that track moves.  
Architecture = cold spine + D019 hard/soft (not patch thrash). No mega-rewrite before bags.

**FIRM:** `forge nested stop` after any nest tests — never leave subshells running.  
See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0 now** | **L6 settle-math kernel** + JS↔CLI golden parity (formula only) | [plan](./plans/forge-lifecycle-abstractions.md) |
| **P0 next** | SignalBag pure → more WM SourceBag slots → Lifetime / suppress / L4 | plan locked order |
| parked | Nest isolation strategies discussion | [D0 nest](./tasks/forge-nested-isolation_d0-discussion.md) |
| parked | Nest dual-mon RC + layout smoke (`_forge-test-*`) | [suite](./plans/forge-wayland-rc-test-suite.md) |
| parked | Host dual-mon L1 / live matrix on `_forge-test-*` | [AI live matrix](./plans/forge-ai-live-test-matrix.md) |
| next (later) | R010 only if structure still fails first-shot after resume | [REGRESSIONS](./REGRESSIONS.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | **A1 SourceBag** + open-commit wire; D0 lock; R007; D019 SE0–SE9; AT-W1 nest; CLI jobs | [A1](./tasks/forge-lifecycle-abstractions_a1-source-bag.md) · completed/ |

**Handoff:** [HANDOFF.md](./HANDOFF.md) — SourceBag live; DEBUG logs for open-commit; stop nest if used.

```bash
# P0 is pure unit tests + thin wire — not full Wayland RC.
# If nest is used anyway:
forge nested stop
forge nested status   # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | P0 health plan (locked) |
| [A1 SourceBag](./tasks/forge-lifecycle-abstractions_a1-source-bag.md) | **Done** |
| [D0 rate](./tasks/forge-lifecycle-abstractions_d0-rate.md) | Done — lock record |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Parked RC |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
