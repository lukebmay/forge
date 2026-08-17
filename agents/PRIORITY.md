# forge (lukebmay) — active priorities

**Updated:** 2026-08-16 (SM1–SM7 done; agent cold verify next)  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037/D038 ApplyLayout ·
**D039–D043** slot machines (SM0) · **SM1–SM7 implement landed**.

**Active next:** **P0 agent** [cold host verify](./tasks/forge-layout-cold-host-verify.md)
after human logout+login · then **tab work D0** (plan first) · optional bag review.
**Human:** logout + login + start agents only (no layout by hand).
**Parked:** soft polish · scale smoke · FCC C2+ · CN13.
**Agents:** default implement = **Grok 4.5**. Architecture locks = **4.6 xhigh** only.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Orchestrator note

SM1–SM7 implement DAG finished this session (serial where shared files).
Do **not** re-litigate D039–D043. Do not reintroduce belt / TILE-anywhere hard /
mon-root apply PlaceNext / soft-enter chrome clear.

| Slice | Status | Note |
| --- | --- | --- |
| SM1 ApplyEpoch | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm1-apply-epoch.md) |
| SM2 in-slot hard | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm2-in-slot-hard.md) |
| SM3 open-into-slot | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm3-open-into-slot.md) |
| SM4 runtime | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm4-runtime.md) · nest clean PASS |
| SM5 focus after hard | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm5-focus-after-hard.md) |
| SM7 overlay all-hard | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm7-overlay-all-hard.md) |
| SM6 delete belt | **done** | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_sm6-delete-crutches.md) |

**L0:** combined SM suite **235** green. **Nest:** clean PASS; ghosttys cold open-miss residual.  
**Install:** `./install --kit=vim` this session — host tip needs **one logout**.

---

## Queue

| Pri | Item | Agent | Status |
| --- | --- | --- | --- |
| **P0** | **R036 cold host verify** (after human logout+login) | **4.5** | [task](./tasks/forge-layout-cold-host-verify.md) · [R036](./REGRESSIONS.md) |
| **plan first** | **Tab work D0** (SM7 gate open) | **4.6 xhigh** | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) |
| optional | Bag-API review `layout-apply-slot.js` | **4.6 high** | after SM4 note |
| P2 | FCC **C2** group/ungroup | **4.6 med** if ops reshape, else **4.5 high** | [FCC plan](./plans/forge-first-class-containers.md) |
| P2 | FCC **C4** move-in/out + focus parent | **4.5 high** | after C2 |
| P2 | **R1** owning-split resize | **4.6 med** | after C2; not yuiop |
| P2 | FCC **C3** split chrome | **4.5 med** | after C2 · group chrome A |
| P3 | Strip `_layoutOp` flatten | **4.5 high** | after C2 explicit ungroup |
| P3 | Session restore vs ApplyLayout | **4.6 high** | after SM honest |
| P3 | Freeze Python `layout_plan.py` as dump/oracle | **4.5 lo** | after SM6 · **never** `cli/` port |
| P3 | **CN13** Node PATH `forge` + jobs | **4.6 med** | after apply thin client is boring |
| later | CN14 nest/live; CN15 delete Python CLI | **4.6 med** / **4.5 lo** | after CN13 |
| later | Soft-only polish (R014 class) | **4.5 med** | only if cold forest green and soft still burns |
| later | L1 scale smoke | Human + **4.5 lo** notes | R017 shipped |
| later | **STACKED** product D0 | **4.6 xhigh** | own plan |
| later | Ratio / autotile (yuiop) | Human blocker → **4.6 xhigh** D0 | [blocker](./blockers/resize-autotile-design.md) |
| done | **SM0–SM7** slot machines | multi | [completed/](./plans/forge-layout-slot-machines/completed/) |
| done (code) | R036 PH pin + beltStructure + unwrap + live rehome → evolved into SM1–SM6 | — | host logout residual |
| done | R035 residual tab ensure · R033 aspect split · R029–R032 | — | HANDOFF / REGRESSIONS |
| done | TD1 strip reorder · R025/R026 · R028 | — | completed |
| done | CLI-node **CN0–CN6** (CN7 skip) · AL0–AL8 · FCC C0/C1 | — | completed |
| done | IC0–IC3 · IC4 skipped · nest isolation · Wayland RC | — | completed |

### Dropped from active queue (not deleted — see IDEAS)

| Was | Disposition |
| --- | --- |
| optional dual-mon open-heavy nest mon=2 | → [IDEAS](./IDEAS.md) |
| optional per-window signals → WindowAttach | → [IDEAS](./IDEAS.md) |
| CLI “nothing applied” wording | → [IDEAS](./IDEAS.md) |
| Cross-mon TABBED D0 as lone later row | folded into **Tab work D0** |

### Why this order

1. **SM1–SM7 done** — epoch, in-slot, open-into-slot, machines, focus, overlay, belt delete.
2. **R036 host cold** — human logout only; **agent** runs layout+tree verify/fix.
3. **Tab D0** — SM7 overlay gate cleared; plan before implement.
4. FCC / resize / CN13 / STACKED — after apply is honest, or later.

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
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 **done** |
| Tab D0 before implement | Spinner gate + cross-mon + TD triage | after SM7 |

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.  
**Do not** start tab implementation until [tab planning](./tasks/forge-tab-work-planning.md) locks.  
**Do not** reintroduce belt as happy path.

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
| [tab planning](./tasks/forge-tab-work-planning.md) | After SM7 |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
