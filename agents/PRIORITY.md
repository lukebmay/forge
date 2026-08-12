# forge (lukebmay) — active priorities

**Updated:** 2026-08-11  
**Lens:** healthy codebase first — ownership, pure reuse, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Queue clear of hard P1. **R017** scale/entered-monitor thrash fix in tree
([completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md)); L0 green.
Host **logout once** then gdisplays smoke residual. Cross-mon tabs later:
[D0](./tasks/forge-tab-groups-cross-mon_d0-discussion.md).

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| residual | **Logout once** (or nest) load tip: **R018** install HSPLIT order + R017/R016 JS. Do not host-`forge install` on old JS. Then gdisplays scale smoke; restore `default` + `layout dev` | [R018](./REGRESSIONS.md) · [R017](./REGRESSIONS.md) |
| later | Cross-mon TABBED/STACKED product design (D0) | [task](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
| residual | Host load tip for R015 if not already on tip | [REGRESSIONS R015](./REGRESSIONS.md) |
| done | **R017** gdisplays scale → no entered-monitor thrash | [completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md) · L0 48 green |
| done | **R016** no-op workareas + mon-loss collect-to-end | [completed](./tasks/completed/forge-monitor-noop-apply-thrash.md) · L0 guards green |
| optional | Per-window signals → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | **R015** empty-mon drag snap-back | L0 `bug-r015-empty-mon-dnd`; live `L1.r015-empty-mon-dnd` |
| done | Wayland RC **R013/R014** + host logout + suite | [completed](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | Nest isolation **D0 design lock** | [completed](./tasks/completed/forge-nested-isolation_d0-discussion.md) |
| done | Pure bags + **W1–W5** + **L8/L11**; **R011/R012**; D019; CLI jobs | [completed/](./plans/forge-lifecycle-abstractions/completed/) · [REGRESSIONS](./REGRESSIONS.md) |

### Why this order

1. **R015** was daily-driver (empty mon drag snap-back) — queue was empty of hard P1.  
2. Host Shell on Wayland cannot HUP — load tip via nest retest (dual mon) or one logout.  
3. Optional lifecycle residual only after operator can use cross-mon drag.

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.

**Handoff:** [HANDOFF.md](./HANDOFF.md).

```bash
forge nested run -- true    # campaign entry; always stops
forge nested status         # running: False
# After R015 JS install (dual-mon behavior under test):
./install && forge nested run --monitors=2 -- forge test live plan --tags R015
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [nest isolation plan](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health plan (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
