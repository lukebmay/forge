# forge (lukebmay) — active priorities

**Updated:** 2026-08-16  
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037/D038 ApplyLayout ·
**D039–D043** slot machines (SM0).

**Active P0 (orchestrator):** **SM1–SM7** implement — next session
**Grok 4.5 med orchestrator** assigns work (does not re-litigate).
**Human residual:** **R036** host cold after logout (`_layoutApplyLive` dirty;
Guake-only `layout dev`). Mid-session host tree **PASS**.
**Parked (after SM7 / structure):** tab product D0 · soft polish · scale smoke.
**Agents:** default implement = **Grok 4.5**. Slot-machine **contracts +
runtime** = **4.6 high**. Architecture locks = **4.6 xhigh** only.

**FIRM:** Prefer `forge nested run -- …` (auto stop). Interactive nest → `stop` when done.  
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).

---

## Orchestrator (this is you if 4.5 med)

Read [HANDOFF](./HANDOFF.md) + [slot-machines plan](./plans/forge-layout-slot-machines.md).
**Do not redesign D039–D043.** Spawn implementers; do not implement SM1–SM4
yourself.

| Assign next | Agent | Task |
| --- | --- | --- |
| **First** | **4.5 high** | [SM1 ApplyEpoch](./tasks/forge-layout-slot-machines_sm1-apply-epoch.md) |
| **Then / parallel** | **4.6 high** | [SM2 in-slot hard](./tasks/forge-layout-slot-machines_sm2-in-slot-hard.md) — no `window.js` rehome overlap with SM1 |
| After SM1 | **4.6 high** | [SM3 open-into-slot](./tasks/forge-layout-slot-machines_sm3-open-into-slot.md) |
| After SM2+SM3 | **4.6 high** (+ later **4.6 high** review) | [SM4 runtime](./tasks/forge-layout-slot-machines_sm4-runtime.md) |
| After SM4 | **4.5 med** | SM5 · SM7 (can be separate agents) |
| After SM4+SM5 nest mon=1 | **4.5 med** | SM6 delete crutches |

**Do not assign:** SM4 before SM2+SM3 · tab **code** · `layout_plan.py` →
`cli/` · Mode B · dual-mon nest by default · FCC C2/resize/STACKED into this DAG.

Prompt the role (`4.5 high`, `4.6 high`, …) in the spawn. There is no
separate medium slug.

---

## Queue

| Pri | Item | Agent | Status |
| --- | --- | --- | --- |
| **P0** | **SM1** ApplyEpoch / home authority | **4.5 high** | [task](./tasks/forge-layout-slot-machines_sm1-apply-epoch.md) · D039 |
| **P0** | **SM2** in-slot hard + forest-match `Done.ok` | **4.6 high** | [task](./tasks/forge-layout-slot-machines_sm2-in-slot-hard.md) · D040/D041 |
| **P0** | **SM3** open into slot (no mon-root PlaceNext) | **4.6 high** | [task](./tasks/forge-layout-slot-machines_sm3-open-into-slot.md) · D042 · after SM1 |
| **P0** | **SM4** slot-machine runtime + retry | **4.6 high** | [task](./tasks/forge-layout-slot-machines_sm4-runtime.md) · after SM2+SM3 |
| **P1** | **SM5** focus + soft after all-hard | **4.5 med** | [task](./tasks/forge-layout-slot-machines_sm5-focus-after-hard.md) |
| **P1** | **SM7** overlay clear = all-hard | **4.5 med** | [task](./tasks/forge-layout-slot-machines_sm7-overlay-all-hard.md) |
| **P1** | **SM6** delete belt / continue-on-timeout / focus-only-ok | **4.5 med** | [task](./tasks/forge-layout-slot-machines_sm6-delete-crutches.md) |
| human | **R036** host cold `layout dev` after logout | Human | [task](./tasks/forge-layout-cold-apply-structure.md) · [R036](./REGRESSIONS.md) |
| **plan first** | **Tab work D0** after **SM7** | **4.6 xhigh** | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) |
| P2 | FCC **C2** group/ungroup | **4.6 med** if ops reshape, else **4.5 high** | [FCC plan](./plans/forge-first-class-containers.md) · after apply honesty |
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
| done | **SM0** slot-machines D0 | 4.6 xhigh | [completed](./plans/forge-layout-slot-machines/completed/forge-layout-slot-machines_d0-discussion.md) |
| done (code) | R036 PH pin + beltStructure + unwrap + live rehome suppress | — | same R036 task; host logout residual |
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
| Cross-mon TABBED D0 as lone later row | folded into **Tab work D0** (after SM7) |

### Why this order

1. **SM1–SM3 contracts** — epoch, in-slot hard, `Done.ok`, open-into-slot.
   Machines on today’s predicates retry into the same lie.
2. **SM4 runtime** — parallel independent slots, hard retry.
3. **SM5–SM7** — focus after barrier, overlay, delete crutches.
4. **R036 host cold** — human logout; does not block SM assign.
5. **Tab D0** — after SM7 overlay gate. Chrome A is not SM1–SM4.
6. FCC / resize / CN13 / STACKED — after apply is honest, or later.

### Worth (do not forget)

| Item | Why | Task |
| --- | --- | --- |
| ApplyEpoch | One writer of home during apply | SM1 · D039 |
| In-slot hard + honest `ok` | TILE-anywhere + false-ok was R036 | SM2 · D040/D041 |
| Open into slot | Kill four-pass place | SM3 · D042 |
| Slot machines | Parallel place + hard retry | SM4 |
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 **done** |
| Skip IC4 if ApplyLayout | Waiters deleted | IC4 note |
| Tab D0 before implement | Spinner gate + cross-mon + TD triage | after SM7 |

**Do not** start dual-mon nest by default. **Do not** nest for no-code host smokes.  
**Do not** start tab implementation until [tab planning](./tasks/forge-tab-work-planning.md) locks.  
**Do not** start SM4 until SM2+SM3 land.

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
| [slot machines](./plans/forge-layout-slot-machines.md) | **P0** SM1–SM7 |
| [ApplyLayout](./plans/forge-layout-in-process.md) | AL0–AL8 done |
| [cli-node](./plans/forge-cli-node.md) | D036 CN0–CN6 |
| [tab planning](./tasks/forge-tab-work-planning.md) | After SM7 |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
