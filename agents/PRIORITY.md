# forge (lukebmay) — active priorities

**Updated:** 2026-08-10  
**Lens:** healthy codebase first — ownership, pure reuse, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Lifecycle **W1–W5 + L8/L11** + **R011** shipped (X11 live 9/9). **Wayland RC is P0.**  
Architecture = cold spine + D019 hard/soft (not patch thrash).

**FIRM:** `forge nested stop` after any nest tests — never leave subshells running.  
See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0 now** | Wayland nest dual-mon RC + host L1/L2 on `_forge-test-*` | [suite](./plans/forge-wayland-rc-test-suite.md) |
| optional | Per-window signals → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| parked | Nest isolation strategies discussion | [D0 nest](./tasks/forge-nested-isolation_d0-discussion.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | Pure bags + **W1–W5** + **L8/L11**; **R011**; D0; R007; D019; CLI jobs | [completed/](./plans/forge-lifecycle-abstractions/completed/) · [REGRESSIONS](./REGRESSIONS.md) |

**Handoff:** [HANDOFF.md](./HANDOFF.md) — bag map, dump commands, residual wire list.

```bash
# Residual work is unit-tested wire — not full Wayland RC.
# If nest is used anyway:
forge nested stop
forge nested status   # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | P0 health plan (locked) |
| [completed/](./plans/forge-lifecycle-abstractions/completed/) | A1–A6 + W1–W5 |
| [D0 rate](./tasks/forge-lifecycle-abstractions_d0-rate.md) | Done — lock record |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Parked RC |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
