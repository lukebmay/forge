# forge (lukebmay) — active priorities

**Updated:** 2026-08-10  
**Lens:** healthy codebase first — ownership, pure reuse, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks (this session: user asked commit+push).

**Active:** Lifecycle **W1–W5 + L8/L11** + **R011/R012** shipped.  
**Nest isolation v1 done** (N3→N1→N4→N2). **Next product: Wayland RC** (P1).  
Architecture = cold spine + D019 hard/soft (not patch thrash).

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P1 now** | Wayland RC suite — **host L1 first**; nest only for code/reload or multi-mon cases (default mon=1) | [suite](./plans/forge-wayland-rc-test-suite.md) |
| optional | Per-window signals → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | Nest isolation **D0 design lock** | [completed](./tasks/completed/forge-nested-isolation_d0-discussion.md) |
| done | Pure bags + **W1–W5** + **L8/L11**; **R011/R012**; D019; CLI jobs | [completed/](./plans/forge-lifecycle-abstractions/completed/) · [REGRESSIONS](./REGRESSIONS.md) |

### Why this order

1. ~~**N3** auto-cleanup~~ done — `forge nested run` always stops; stale reaper.  
2. ~~**N1** nest host id + CLI data root~~ done — nest CLI no longer rewrites parent heuristics keys.  
3. ~~**N4** docs~~ done — agents prefer `run`, mon=1, nest-only-for-reload.  
4. ~~**N2** extension data root~~ done — nest JS writes under `FORGE_CONFIG_HOME`.  
5. **Wayland RC** — host L1 does not need nest; nest multi-mon only when testing multi-mon; safer after N1+N2.

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.

**Handoff:** [HANDOFF.md](./HANDOFF.md).

```bash
forge nested run -- true    # campaign entry; always stops
forge nested status         # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [nest isolation plan](./plans/forge-nested-isolation.md) | **P0 implement** |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | P1 RC procedure |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health plan (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
