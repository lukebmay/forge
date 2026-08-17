# forge (lukebmay) — active priorities

**Updated:** 2026-08-17 (tab click-drag PR1 handoff)
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.
**Branch:** **`master`** default
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037/D038 ApplyLayout ·
**D039–D043** slot machines (SM0) · **SM1–SM7 implement landed** ·
**R036 cold PASS** · **D044** TABBED/STACKED mon-local **shipped**.

**Active next:** [PR1 chrome layer](./tasks/forge-tab-click-drag_pr1-chrome-layer.md)
— `grok-4.5` **medium**. Design is locked; do not reshape attach.
Wrap-on waits for PR4 (`min-tab-label-chars=20`); `max-tab-rows=0` unbounded.
**Retest (FIRM):** nest = normal Wayland code→reload; primary logout = rare tip load.
**Parked:** soft polish · scale smoke · FCC C2+ · CN13 · TD4 docs.
**Agents:** default implement = **Grok 4.5**. Architecture locks = **4.6 xhigh** only.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).
**FIRM:** Host `forge layout dev` is not a crash repro harness — use nest.

---

## Orchestrator note

SM1–SM7 + R036 + Tab D0 + **D044 same-mon groups** **done**. Do **not**
re-litigate D039–D044. Do not reintroduce belt / TILE-anywhere hard /
mon-root apply PlaceNext / soft-enter chrome clear / spanning tab chrome.

| Slice | Status | Note |
| --- | --- | --- |
| SM1–SM7 | **done** | [completed/](./plans/forge-layout-slot-machines/completed/) |
| R036 host cold | **done** | [completed](./tasks/completed/forge-layout-cold-host-verify.md) |
| Tab D0 | **done** | [planning](./tasks/forge-tab-work-planning.md) |
| Same-mon groups | **done** | [completed](./tasks/completed/forge-tab-groups-same-mon.md) · D044 |
| Tab click-drag | **PR1 ready** | [task](./tasks/forge-tab-click-drag_pr1-chrome-layer.md) · 4.5 med |

**L0:** D044 suite **159** green (tree ops + DnD + normalize + LX3 + H1).
**Host cold:** R036 **PASS**. Overlay clear = all-hard (no chrome implement).

---

## Queue

| Pri | Item | Agent | Status |
| --- | --- | --- | --- |
| P1 | **Tab click-drag PR1** (chrome layer) | **4.5 med** | [task](./tasks/forge-tab-click-drag_pr1-chrome-layer.md) — escalate 4.6 if attach reshape |
| later | Tab click-drag PR2–PR6 | **4.5 med** | [plan](./plans/forge-tab-click-drag.md) after PR1 |
| done | **Same-mon TABBED/STACKED** (D044) | **4.5 high** | [completed](./tasks/completed/forge-tab-groups-same-mon.md) |
| done | Tab work D0 lock | **4.6 xhigh** | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) |
| done | **R036** nest multi-open + host cold | **4.5** | [completed](./tasks/completed/forge-layout-cold-host-verify.md) |
| optional | Bag-API review `layout-apply-slot.js` | **4.6 high** | after SM4 note |
| P2 | FCC **C2** group/ungroup | **4.6 med** if ops reshape, else **4.5 high** | [FCC plan](./plans/forge-first-class-containers.md) |
| P2 | FCC **C4** move-in/out + focus parent | **4.5 high** | after C2 |
| P2 | **R1** owning-split resize | **4.6 med** | after C2; not yuiop |
| P2 | FCC **C3** split chrome | **4.5 med** | after C2 · H/V chrome (not tab strip) |
| P3 | Strip `_layoutOp` flatten | **4.5 high** | after C2 explicit ungroup |
| P3 | Session restore vs ApplyLayout | **4.6 high** | after SM honest |
| P3 | Freeze Python `layout_plan.py` as dump/oracle | **4.5 lo** | after SM6 · **never** `cli/` port |
| P3 | **CN13** Node PATH `forge` + jobs | **4.6 med** | after apply thin client is boring |
| later | CN14 nest/live; CN15 delete Python CLI | **4.6 med** / **4.5 lo** | after CN13 |
| later | Soft-only polish (R014 class) | **4.5 med** | only if cold forest green and soft still burns |
| later | TD4 user-docs one-liner | **4.5 lo** | folds into click-drag PR6 |
| later | L1 scale smoke | Human + **4.5 lo** notes | R017 shipped |
| later | **STACKED** product D0 | **4.6 xhigh** | own plan |
| later | Ratio / autotile (yuiop) | Human blocker → **4.6 xhigh** D0 | [blocker](./blockers/resize-autotile-design.md) |
| done | **SM0–SM7** slot machines | multi | [completed/](./plans/forge-layout-slot-machines/completed/) |
| done (code) | R036 PH pin + beltStructure + unwrap + live rehome → evolved into SM1–SM6 | — | host logout residual |
| done | R035 residual tab ensure · R033 aspect split · R029–R032 | — | HANDOFF / REGRESSIONS |
| done | TD1 strip reorder · TD2/TD3 skip · R025/R026 · R028 | — | completed |
| done | CLI-node **CN0–CN6** (CN7 skip) · AL0–AL8 · FCC C0/C1 | — | completed |
| done | IC0–IC3 · IC4 skipped · nest isolation · Wayland RC | — | completed |

### Dropped from active queue (not deleted — see IDEAS)

| Was | Disposition |
| --- | --- |
| optional dual-mon open-heavy nest mon=2 | → [IDEAS](./IDEAS.md) |
| optional per-window signals → WindowAttach | → [IDEAS](./IDEAS.md) |
| CLI “nothing applied” wording | → [IDEAS](./IDEAS.md) |
| Cross-mon TABBED as product | **rejected** (D044) — implement is same-mon normalize |
| Hover-spinner / tab-click residuals | **none** unless post-R036 overlay/click repro |

### Why this order

1. **SM1–SM7 done** — epoch, in-slot, open-into-slot, machines, focus, overlay, belt delete.
2. **R036 cold done** — nest multi-open + host `layout dev` forest match without Shell death.
3. **Tab D0 locked** — overlay=all-hard; groups mon-local; TD2/TD3 skip; click none.
4. **Same-mon (D044)** — shipped.
5. FCC / resize / CN13 / STACKED — after apply is honest, or later.

### Worth (do not forget)

| Item | Why | Task |
| --- | --- | --- |
| ApplyEpoch | One writer of home during apply | SM1 · D039 · **done** |
| In-slot hard + honest `ok` | TILE-anywhere + false-ok was R036 | SM2 · D040/D041 · **done** |
| Open into slot | Kill four-pass place | SM3 · D042 · **done** |
| Slot machines | Parallel place + hard retry | SM4 · **done** |
| Focus after all-hard | Soft residual only | SM5 · **done** |
| Overlay = all-hard | Spinner not soft | SM7 · D043 · **done** |
| Belt deleted | No dual spine | SM6 · **done** |
| Groups mon-local | One strip cannot span heads | D044 · shipped |
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 **done** |

**Do not** start dual-mon nest by default.
**Do not** nest for no-code host smokes.
**Do not** reintroduce belt as happy path.
**Do not** drop overlay before all-hard.
**Do not** build spanning tab chrome.

**Handoff:** [HANDOFF.md](./HANDOFF.md).
**Parked ideas:** [IDEAS.md](./IDEAS.md).

```bash
# SM L0
npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js

./install --kit=vim
# Wayland host tip: log out and back in, then cold:
forge layout dev
forge tree

forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
forge nested status   # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [IDEAS.md](./IDEAS.md) | Parked optionals / promote-later |
| [contracts](../docs/dev/contracts.md) | Job → API |
| [slot machines](./plans/forge-layout-slot-machines.md) | SM0–SM7 |
| [ApplyLayout](./plans/forge-layout-in-process.md) | AL0–AL8 done |
| [cli-node](./plans/forge-cli-node.md) | D036 CN0–CN6 |
| [tab planning](./tasks/forge-tab-work-planning.md) | D0 locked |
| [same-mon](./tasks/completed/forge-tab-groups-same-mon.md) | D044 shipped |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
