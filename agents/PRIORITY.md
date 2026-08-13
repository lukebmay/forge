# forge (lukebmay) — active priorities

**Updated:** 2026-08-13  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Canonical contracts **IC0–IC3 done** (D024–D026, R019/R020).
Catalog: [docs/dev/contracts.md](../docs/dev/contracts.md). Next: load tip
and smoke Grok→Chrome CENTER + VLC. IC4 later. FCC Wave C / zoom after.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| residual | Load tip then smoke Grok→Chrome CENTER + VLC end-of-video | [R019](./REGRESSIONS.md) · [R020](./REGRESSIONS.md) |
| done | **IC2** `revealGroupChild` (D025) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic2-reveal-open-leaf.md) |
| done | **IC0** catalog + D024–D026 | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic0-catalog.md) |
| done | **IC3** tile-slot authority (R020) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic3-tile-slot-authority.md) |
| done | **IC1** drop-intent + CENTER group both directions (R019) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic1-drop-intent.md) |
| later | **IC4** fold leftover CLI waiters | [task](./tasks/forge-canonical-contracts_ic4-settle-fold.md) |
| later | FCC Wave C / zoom full-width/height (after contracts) | [plan](./plans/forge-first-class-containers.md) |
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

1. **Contracts IC0–IC3 are in tree.** Next is host/nest **load tip + smoke** (R019/R020).  
2. **IC4** folds leftover CLI waiters — do not invent a third settle brain.  
3. **Zoom / FCC Wave C** after live smoke. Zoom is a presentation flag on D026.  
4. Host logout / R018 remains residual, not a reason to skip the catalog.

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
| [contracts](../docs/dev/contracts.md) | Job → API |
| [canonical contracts plan](./plans/forge-canonical-contracts.md) | IC0–IC4 |
| [nest isolation plan](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health plan (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
