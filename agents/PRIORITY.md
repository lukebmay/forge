# forge (lukebmay) — active priorities

**Updated:** 2026-08-13  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Operator campaign **2026-08-13** — insert **A** R028
(leftover wrap / batch skip). Host tip `b6cf05b` needs install + nest
or logout for R028 JS. Wave Z / R025–R027 live gestures only.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | Insert A R028 — install + nest/logout, then `layout dev` + left-dock Nautilus | [task](./tasks/forge-container-insert-a.md) |
| done | Insert/DnD design lock: **A** + Chrome drag table | [task](./tasks/forge-container-insert-dnd-design.md) |
| residual | Wave Z zoom on tip; Vim kit live — try Super+Enter / C-S-Enter / S-S-Enter; Super+Space = Run | [task](./tasks/forge-zoom-maximize.md) |
| residual | **R025** tab-click slot size after tip | [task](./tasks/forge-tab-click-slot.md) |
| residual | **R026** first tab-click after layout must stay | [task](./tasks/forge-tab-click-pin-adopt.md) |
| residual | **R027** overlay until apply returns; clicks blocked | [task](./tasks/forge-layout-chrome-until-ready.md) |
| done | Test-suite honesty: rubric + 5 forest rewrites (do not re-sample) | [completed](./tasks/completed/forge-test-suite-honest-analysis.md) |
| done | First-layout FLOAT (R024): always force-paint at batch end; skip mid-batch percent write-back | [completed](./tasks/completed/forge-layout-first-apply-float.md) |
| done | Install `--kit=vim` + stale-kit warning | [task](./tasks/forge-install-reapply-kit.md) |
| later | Leftover Grok→Chrome CENTER + VLC slot (R019/R020) | [R019](./REGRESSIONS.md) · [R020](./REGRESSIONS.md) |
| done | **IC2** `revealGroupChild` (D025) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic2-reveal-open-leaf.md) |
| done | **IC0** catalog + D024–D026 | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic0-catalog.md) |
| done | **IC3** tile-slot authority (R020) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic3-tile-slot-authority.md) |
| done | **IC1** drop-intent + CENTER group both directions (R019) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic1-drop-intent.md) |
| later | **IC4** fold leftover CLI waiters | [task](./tasks/forge-canonical-contracts_ic4-settle-fold.md) |
| later | FCC Wave C (setLayout / group) after insert lock | [plan](./plans/forge-first-class-containers.md) |
| later | L1 scale smoke: `gdisplays load default-no-scale` must not thrash; restore `default` + `layout dev` | [R017](./REGRESSIONS.md) |
| later | Cross-mon TABBED/STACKED product design (D0) | [task](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
| done | Host tip loaded (`7b9875e`) — R015–R024 JS on host Shell | [REGRESSIONS](./REGRESSIONS.md) |
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

1. **Insert A live** — `./install` + nest or logout, then `layout dev`
   + left-dock Nautilus (R028: VSPLIT slot, not 3-wide HSPLIT). TD1
   after that.
2. **Live gestures** on current tip (zoom / R025–R027) — try those
   **before** the next install if you have not yet.
3. IC4 stay queued.

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
