# forge (lukebmay) — active priorities

**Updated:** 2026-08-15  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037 (ApplyLayout,
not a `cli/` planner port).

**Active:** **AL0 locked** — operator ack, then **AL1** (gold) + **AL4**
(DBus stub) in parallel. R027 / Wave Z **done** (Wave Z host live PASS).

**Agents:** default implement = **Grok 4.5** (prompt as medium). Plan
reshape / AL0 / C1 / messy DnD = **Grok 4.6** (xhigh for design).
See [cli-node Which agent](./plans/forge-cli-node.md#which-agent).

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| done | R029/R030 green layout — first apply TILE, second reuses | [completed](./tasks/completed/forge-layout-green-reuse-double.md) |
| done | TD1 strip reorder **code** + nest live (L0 131) | [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| done | R028 late-identity wrap **code** + nest VSPLIT + **host** live PASS | [task](./tasks/forge-container-insert-a.md) |
| done | **R025** tab-click slot (host live) | [task](./tasks/forge-tab-click-slot.md) |
| done | **R026** first tab-click after layout stays (host live) | [task](./tasks/forge-tab-click-pin-adopt.md) |
| done | Insert/DnD design lock: **A** + Chrome drag table | [task](./tasks/forge-container-insert-dnd-design.md) |
| done | CLI language D0 lock (D036/D037) | [completed](./plans/forge-cli-node/completed/forge-cli-node_d0-discussion.md) |
| done | CLI-node **CN0** scaffold (`cli/` + gi-free canary) | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn0-scaffold.md) |
| done | CLI-node **CN1** Python `node_exec` helper | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn1-exec.md) |
| done | CLI-node **CN2** `keybind` (Node body + Python shim) | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn2-keybind.md) |
| done | CLI-node **CN3** paths extract (`lib/shared/paths.js`) | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn3-paths.md) |
| done | CLI-node **CN4** DBus + `ping`/`tree` | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn4-dbus-ping-tree.md) |
| done | CLI-node **CN5** thin DBus verbs | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn5-thin-dbus.md) |
| done | CLI-node **CN6** launch + run-steps (CN7 skip) | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn6-launch-run-steps.md) |
| done | **R027** overlay until apply returns; clicks blocked | [completed](./tasks/completed/forge-layout-chrome-until-ready.md) |
| done | Wave Z zoom on tip; Vim kit live | [completed](./tasks/completed/forge-zoom-maximize.md) |
| done | Test-suite honesty: rubric + 5 forest rewrites (do not re-sample) | [completed](./tasks/completed/forge-test-suite-honest-analysis.md) |
| done | First-layout FLOAT (R024): always force-paint at batch end; skip mid-batch percent write-back | [completed](./tasks/completed/forge-layout-first-apply-float.md) |
| done | Install `--kit=vim` + stale-kit warning | [task](./tasks/forge-install-reapply-kit.md) |
| later | Leftover Grok→Chrome CENTER + VLC slot (R019/R020) | [R019](./REGRESSIONS.md) · [R020](./REGRESSIONS.md) |
| done | **IC2** `revealGroupChild` (D025) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic2-reveal-open-leaf.md) |
| done | **IC0** catalog + D024–D026 | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic0-catalog.md) |
| done | **IC3** tile-slot authority (R020) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic3-tile-slot-authority.md) |
| done | **IC1** drop-intent + CENTER group both directions (R019) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic1-drop-intent.md) |
| later | **IC4** fold leftover CLI waiters — **skip** if ApplyLayout deletes them | [task](./tasks/forge-canonical-contracts_ic4-settle-fold.md) |
| done | In-process `ApplyLayout` AL0 design lock (D037/D038) | [task](./tasks/forge-layout-in-process_al0-design.md) · [plan](./plans/forge-layout-in-process.md) |
| next | AL1 gold dump + AL4 DBus stub (after operator ack) | [AL1](./tasks/forge-layout-in-process_al1-gold-dump.md) · [AL4](./tasks/forge-layout-in-process_al4-dbus-apply-layout.md) |
| done | FCC **C0** kill monocle + inventory | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c0-kill-monocle.md) |
| done | FCC **C1** `setLayout` I1 | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c1-set-layout.md) |
| later | L1 scale smoke: `gdisplays load default-no-scale` must not thrash; restore `default` + `layout dev` | [R017](./REGRESSIONS.md) |
| later | Cross-mon TABBED/STACKED product design (D0) | [task](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
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

1. **TD1 live** — **done** (nest on tip `b280f94`).
2. **R028 host** — **done** (VSPLIT of left unit, not 3-wide mon).
3. **CN0** — **done** (`cli/` + smoke-import; 2729 tests green).
4. **CN1** — **done** (`node_exec.py`; 45 pytest green).
5. **CN2** — **done** (`cli/keybind.mjs`; install kit via Node).
6. **CN3** — **done** (`lib/shared/paths.js` pure config home).
7. **CN4** — **done** (`cli/dbus.mjs` + ping/tree; live host green).
8. **CN5** — **done** (focus/swap/move/get/set/settings Node bodies).
9. **CN6** — **done** (launch/run/run-steps; CN7 skip).
10. **FCC C0** — **done** (monocle deleted; inventory for C1).
11. **FCC C1** — **done** (`tree.setLayout` / I1; `4740ba5`).
12. **R027 / Wave Z** — **done** (R027 nest; Wave Z host live PASS).
13. **AL0** — **locked** (D038). Implement AL1–AL8 after operator ack.
14. **IC4** — **skip** when AL8 deletes CLI waiters.

Do not assign a 4.5 agent `layout_plan.py` → JS.

### Worth (do not forget)

| Item | Why | Task |
| --- | --- | --- |
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 |
| TD1 strip reorder | Tabs match window DnD | **done** |
| FCC C1 `setLayout` I1 | Tabs stay groups when mode changes | **done** |
| Skip IC4 if ApplyLayout | Do not fold waiters we will delete | IC4 note |

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.

**Handoff:** [HANDOFF.md](./HANDOFF.md).

```bash
forge nested run -- true    # campaign entry; always stops
forge nested status         # running: False
# After TD1/R028 JS install (structure under test):
./install --kit=vim && forge nested run -- forge ping
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
| [cli-node](./plans/forge-cli-node.md) | D036 CN0–CN6 |
| [ApplyLayout](./plans/forge-layout-in-process.md) | D037 |
| [tab chrome](./plans/forge-tab-chrome-drag.md) | TD1 |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
