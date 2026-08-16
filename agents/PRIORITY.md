# forge (lukebmay) — active priorities

**Updated:** 2026-08-16  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037 (ApplyLayout,
not a `cli/` planner port).

**Active P0:** **R036** host cold sign-off after beltStructure + mon unwrap (code
in tree; **logout** for tip). Mid-session host tree OK after job `…4893e8`.
**Shipped this push:** R036 code (PH pin + beltStructure + unwrap) · chrome clear
after soft · DnD overlay from tree slot (not lagging Meta frame).
**Parked for tab planning (no implement yet):** hover-spinner residual + cross-mon
tabs + TD residuals — [tab planning](./tasks/forge-tab-work-planning.md).
**Agents:** default implement = **Grok 4.5** (prompt as medium). Plan reshape /
attach-policy design / **tab product D0** = **Grok 4.6** (xhigh if design forks).
See [cli-node Which agent](./plans/forge-cli-node.md#which-agent).

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | **R036** host cold `layout dev` after logout (beltStructure + unwrap in tree; L0 green) | [task](./tasks/forge-layout-cold-apply-structure.md) · [R036](./REGRESSIONS.md) · **human logout** |
| done (code) | R036 PH pin + ApplyLayout beltStructure (R013) + mon-direct 1-child unwrap | same task |
| done (code) | Chrome clear after soft; DnD overlay uses tree slot rect | HANDOFF post-apply UX |
| **plan first** | **Tab work D0** — hover/spinner clear gate · cross-mon tabs · TD2–4 triage | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) · **Grok 4.6 xhigh** |
| later | Soft-only polish if structure green but soft still thrashing (R014 class) | after R036 structure · [IDEAS](./IDEAS.md) |
| done | R029/R030 green layout — first apply TILE, second reuses | [completed](./tasks/completed/forge-layout-green-reuse-double.md) |
| done | TD1 strip reorder **code** + nest live (L0 131) | [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| done | R028 late-identity wrap **code** + nest VSPLIT + **host** live PASS | [task](./tasks/forge-container-insert-a.md) |
| done | **R025** tab-click slot (host live) | [task](./tasks/forge-tab-click-slot.md) |
| done | **R026** first tab-click after layout stays (host live) | [task](./tasks/forge-tab-click-pin-adopt.md) |
| done | Insert/DnD design lock: **A** + Chrome drag table | [task](./tasks/forge-container-insert-dnd-design.md) |
| done | CLI language D0 lock (D036/D037) | [completed](./plans/forge-cli-node/completed/forge-cli-node_d0-discussion.md) |
| done | CLI-node **CN0–CN6** (CN7 skip) | [completed/](./plans/forge-cli-node/completed/) |
| done | **R027** overlay until apply returns; clicks blocked | [completed](./tasks/completed/forge-layout-chrome-until-ready.md) |
| done | Wave Z zoom on tip; Vim kit live | [completed](./tasks/completed/forge-zoom-maximize.md) |
| done | Test-suite honesty: rubric + 5 forest rewrites (do not re-sample) | [completed](./tasks/completed/forge-test-suite-honest-analysis.md) |
| done | First-layout FLOAT (R024): always force-paint at batch end; skip mid-batch percent write-back | [completed](./tasks/completed/forge-layout-first-apply-float.md) |
| done | Install `--kit=vim` + stale-kit warning | [completed](./tasks/completed/forge-install-reapply-kit.md) |
| done | R019 CENTER both dirs host smoke (tip load) | HANDOFF residual |
| done | **R032** tab-strip click dead (WR14 on ApplyLayout + restack last) | [completed](./tasks/completed/forge-tab-click-unresponsive.md) |
| done | **R031** float-border ghost tile | [completed](./tasks/completed/forge-float-border-ghost-tile.md) · [REG](./REGRESSIONS.md) |
| done | R020 VLC EOS nest live residual | [R020](./REGRESSIONS.md) · `tests/fixtures/media/` |
| done | IC0–IC3 · IC4 **skipped** (AL8) | [canonical](./plans/forge-canonical-contracts.md) |
| done | In-process `ApplyLayout` AL0–AL8 | [plan](./plans/forge-layout-in-process.md) |
| done | **R035** cold residual mon1 flat tabs — ensure_layout while layout PHs | [completed](./tasks/completed/forge-layout-residual-tab-ensure.md) · [R035](./REGRESSIONS.md) |
| done | **R033** open/launch LFT aspect → VSPLIT/HSPLIT (LFT first) | [completed](./tasks/completed/forge-r033-open-aspect-split.md) · [R033](./REGRESSIONS.md) |
| done | FCC **C0** kill monocle + inventory | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c0-kill-monocle.md) |
| done | FCC **C1** `setLayout` I1 | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c1-set-layout.md) |
| later | L1 scale smoke: `gdisplays load default-no-scale` must not thrash; restore `default` + `layout dev` | [R017](./REGRESSIONS.md) · [IDEAS](./IDEAS.md) |
| later | STACKED / resize-autotile | separate plans · [blocker](./blockers/resize-autotile-design.md) — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | **R015** empty-mon drag snap-back | L0 `bug-r015-empty-mon-dnd`; live `L1.r015-empty-mon-dnd` |
| done | Wayland RC **R013/R014** + host logout + suite | [completed](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | Pure bags + **W1–W5** + **L8/L11**; **R011/R012**; D019; CLI jobs | [completed/](./plans/forge-lifecycle-abstractions/completed/) · [REGRESSIONS](./REGRESSIONS.md) |

### Dropped from active queue (not deleted — see IDEAS)

| Was | Disposition |
| --- | --- |
| optional dual-mon open-heavy nest mon=2 | → [IDEAS](./IDEAS.md) live coverage — not needed before tab planning |
| optional per-window signals → WindowAttach | → [IDEAS](./IDEAS.md) lifecycle residual — plan scope already complete |
| CLI “nothing applied” wording | → [IDEAS](./IDEAS.md) — promote if false-ok wording bites |
| Cross-mon TABBED D0 as lone later row | folded into **Tab work D0** planning task |

### Why this order

1. **R036 host cold** — code in tree; only **logout + cold `layout dev`** left (human).
2. **Tab product planning (4.6 xhigh)** — before any tab implement; includes spinner clear gate.
3. Soft polish / scale smoke / STACKED — after structure green or design locks.
4. Do not assign a 4.5 agent `layout_plan.py` → JS.

### Worth (do not forget)

| Item | Why | Task |
| --- | --- | --- |
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 |
| TD1 strip reorder | Tabs match window DnD | **done** |
| FCC C1 `setLayout` I1 | Tabs stay groups when mode changes | **done** |
| Skip IC4 if ApplyLayout | Do not fold waiters we will delete | IC4 note |
| Tab D0 before implement | Spinner gate + cross-mon + TD triage | [planning](./tasks/forge-tab-work-planning.md) |

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.  
**Do not** start tab implementation until [tab planning](./tasks/forge-tab-work-planning.md) locks.

**Handoff:** [HANDOFF.md](./HANDOFF.md).  
**Parked ideas:** [IDEAS.md](./IDEAS.md).

```bash
forge nested run -- true    # campaign entry; always stops
forge nested status         # running: False
./install --kit=vim && forge nested run -- forge ping
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [IDEAS.md](./IDEAS.md) | Parked optionals / promote-later |
| [contracts](../docs/dev/contracts.md) | Job → API |
| [canonical contracts plan](./plans/forge-canonical-contracts.md) | IC0–IC4 |
| [nest isolation plan](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health plan (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [cli-node](./plans/forge-cli-node.md) | D036 CN0–CN6 |
| [ApplyLayout](./plans/forge-layout-in-process.md) | D037 |
| [tab chrome](./plans/forge-tab-chrome-drag.md) | TD1 done; more via tab planning |
| [tab planning](./tasks/forge-tab-work-planning.md) | Spinner · cross-mon · TD triage |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
