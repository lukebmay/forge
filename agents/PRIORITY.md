# forge (lukebmay) — active priorities

**Updated:** 2026-08-13  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Operator campaign **2026-08-13** — first-layout FLOAT residual,
Wave Z zoom (Vim maximize), container insert + Chrome-DnD **design lock**.
R021–R024 still in tree; tip-load/smoke stays residual behind this.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | Container insert + Chrome-like DnD — **operator pick A/B/C** before Shell motion | [task](./tasks/forge-container-insert-dnd-design.md) |
| residual | First-layout FLOAT: **host not on tip** — logout (or nest) then one `_forge-test-*` / `dev` smoke. Do not re-patch R024 | [task](./tasks/forge-layout-first-apply-float.md) |
| residual | Wave Z zoom shipped (L0 green) — same logout to try Super+Enter | [task](./tasks/forge-zoom-maximize.md) |
| residual | Load tip then smoke R021–R024 + leftover Grok→Chrome CENTER + VLC | [R021](./REGRESSIONS.md)–[R024](./REGRESSIONS.md) · [R019](./REGRESSIONS.md) |
| later | Test-suite honesty analysis (product tests, not patch mirrors) | [task](./tasks/forge-test-suite-honest-analysis.md) |
| done | **IC2** `revealGroupChild` (D025) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic2-reveal-open-leaf.md) |
| done | **IC0** catalog + D024–D026 | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic0-catalog.md) |
| done | **IC3** tile-slot authority (R020) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic3-tile-slot-authority.md) |
| done | **IC1** drop-intent + CENTER group both directions (R019) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic1-drop-intent.md) |
| later | **IC4** fold leftover CLI waiters | [task](./tasks/forge-canonical-contracts_ic4-settle-fold.md) |
| later | FCC Wave C (setLayout / group) after insert lock | [plan](./plans/forge-first-class-containers.md) |
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

1. **First-layout FLOAT** — operator still needs a second `layout dev`.
   Diagnose tip-vs-remaining-skip before more R024 paint crutches.  
2. **Zoom** — operator asked now; D026 presentation flag (not Meta max).
   Vim Super+Return currently swap-last — move that chord.  
3. **Container insert** is a **design pick** (A slot-split / B sibling
   never-equalize / C same-app tabs). Do not patch 3-Nautilus HSPLIT
   until the pick. Chrome-tab DnD follows that lock.  
4. R021–R024 tip smoke + test-suite honesty + IC4 stay queued.

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
