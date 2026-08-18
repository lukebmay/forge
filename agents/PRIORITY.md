# forge (lukebmay) — active priorities

**Updated:** 2026-08-18 (FCC C5 done; Wave C closed; PR7 docs / P3 next)
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.
**Branch:** **`master`** default
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037/D038 ApplyLayout ·
**D039–D043** slot machines (SM0) · **SM1–SM7 implement landed** ·
**R036 cold PASS** · **D044** TABBED/STACKED mon-local **shipped** ·
**PR1–PR15** tab chrome / click-drag **unit-shipped** (committed) ·
User CLI surface **shipped** (`forge` product-only; nest/live = **`forge-test`**) ·
**FCC C0–C5 + R1 + R2-docs shipped**.

**Active next (ordered):**
1. later PR7 docs · park
2. P3 strip `_layoutOp` flatten (REG-ensure-flatten)
3. FCC Wave Z when promoted (parked)

**PR15 done (unit):** chip track, chip∩strip gap, pointer×center scoot,
`clearTabDragResiduals`. Host tip may need reload for PR15 JS.
**PR12–PR15 done (unit).** Leave-strip is product.
**Retest (FIRM):** nest = normal Wayland code→reload via
`./scripts/forge/forge-test nested`; primary logout = rare tip load.
**Parked:** soft polish · scale smoke · FCC Wave Z · CN13 · TD4 docs · bag-API
review · MD1 motion prototype · PR7 docs — [IDEAS](./IDEAS.md).
**Agents:** default implement = **Grok 4.5**. Architecture locks = **4.6 xhigh**
or **4.6 high** when PRIORITY says so.

**FIRM:** Prefer `./scripts/forge/forge-test nested run -- …` (auto stop).
Interactive nest → `./scripts/forge/forge-test nested stop` when done.
Never leave subshells running. Default mon=1. See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md).
**FIRM:** Host `forge layout dev` is not a crash repro harness — use nest.
**FIRM:** User `forge test` / `forge nested` are **not** product (hard break →
`./scripts/forge/forge-test`).

---

## Orchestrator note

SM1–SM7 + R036 + Tab D0 + **D044 same-mon groups** + **user CLI no test toolkit**
+ **tab click-drag PR1–PR15** landed. **FCC Wave C (+R1/R2-docs) closed through
C5.** Next: PR7 docs (park) · P3 `_layoutOp` · Wave Z when promoted.
Preserve PR9 foreign spacer-only and PR10 synthetic peel ownership.
Do **not** re-litigate D039–D044. Do not reintroduce belt / TILE-anywhere hard
/ mon-root PlaceNext / soft-enter chrome clear / spanning tab chrome. Do not
teach `forge test` / `forge nested`.

| Slice | Status | Note |
| --- | --- | --- |
| SM1–SM7 | **done** | [completed/](./plans/forge-layout-slot-machines/completed/) |
| R036 host cold | **done** | [completed](./tasks/completed/forge-layout-cold-host-verify.md) |
| Tab D0 | **done** | [completed](./tasks/completed/forge-tab-work-planning.md) |
| Same-mon groups | **done** | [completed](./tasks/completed/forge-tab-groups-same-mon.md) · D044 |
| Tab click-drag | **PR15 done** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr15-host-residual-lock.md) |
| Nested off top-level CLI | **done** | [plan](./plans/forge-nested-cli-separation.md) · superseded by user surface |
| User CLI: no test toolkit | **done** | [plan](./plans/forge-cli-user-surface.md) · `forge-test` |
| FCC C2 group/ungroup | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c2-group-ungroup.md) · I2 |
| FCC R1 owning-split | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_r1-owning-split-resize.md) · I3 |
| FCC C3 split chrome | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c3-split-chrome.md) · I5 |
| FCC C4 move/focus parent | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c4-move-focus-parent.md) |
| FCC C5 kits/docs | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c5-kits-docs.md) |

**L0 last:** C5 keybind-presets + Keybindings **92**. Prior C4 suite **244**.
**Host cold:** R036 **PASS**. Nest not required for C5 (docs only).

---

## Queue

| Pri | Item | Agent | Status |
| --- | --- | --- | --- |
| done | FCC **C5** kits/docs/DESIGN | **4.5** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c5-kits-docs.md) |
| done | FCC **C4** move-in/out + focus parent | **4.5** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c4-move-focus-parent.md) |
| done | FCC **C3** split chrome (I5) | **4.5** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c3-split-chrome.md) · I5 |
| done | FCC **R1** owning-split resize (I3) | **4.6** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_r1-owning-split-resize.md) · I3 |
| done | FCC **C2** group/ungroup (I2) | **4.6** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c2-group-ungroup.md) · I2 |
| done | Tab click-drag **PR15** host residual lock | **4.6 xhigh** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr15-host-residual-lock.md) · L0 297 |
| done | Tab click-drag **PR14** cross-mon prove | 4.5 med | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr14-crossmon-prove.md) · L0 289 |
| done | Tab click-drag **PR13** peel chip + event coords | **4.6 high** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr13-peel-pointer-coords.md) · L0 289 |
| done | Tab click-drag **PR12** one layout owner | 4.5 high | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr12-one-layout-owner.md) · L0 284 |
| done | Tab click-drag **PR11** mid-drag gap equalize | 4.5 | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr11-mid-drag-gap-equalize.md) · L0 283 |
| done | Tab click-drag **PR10** peel slot + cross-mon | 4.5 **high** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr10-peel-slot-crossmon.md) · L0 202 |
| done | Tab click-drag **PR5** 2D + wrap-on (20) | 4.5 **high** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr5-2d-wrap-default.md) · L0 152 |
| done | **User CLI: strip all test/dev utilities** | **4.6 high** | [plan](./plans/forge-cli-user-surface.md) · `forge-test` |
| done | Tab click-drag **PR6–PR9** | 4.5 | foreign strip; peel freeze; chip floor + equal-fill · [completed/](./plans/forge-tab-click-drag/completed/) |
| later | Tab click-drag PR7 docs | 4.5 lo | docs only |
| done | Tab click-drag **PR1–PR5** | 4.5 | [completed/](./plans/forge-tab-click-drag/completed/) |
| done | **Nested off top-level CLI** (under `forge test`) | **4.5 high** | [plan](./plans/forge-nested-cli-separation.md) · [completed/](./plans/forge-nested-cli-separation/completed/) |
| done | **Tab click-drag PR1** (chrome layer) | **4.5 med** | [task](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr1-chrome-layer.md) |
| done | **Same-mon TABBED/STACKED** (D044) | **4.5 high** | [completed](./tasks/completed/forge-tab-groups-same-mon.md) |
| done | Tab work D0 lock | **4.6 xhigh** | [completed](./tasks/completed/forge-tab-work-planning.md) |
| done | **R036** nest multi-open + host cold | **4.5** | [completed](./tasks/completed/forge-layout-cold-host-verify.md) |

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
| done | R035 residual tab ensure · R033 aspect split · R029–R032 | — | HANDOFF / REGRESSIONS |
| done | TD1 strip reorder · TD2/TD3 skip · R025/R026 · R028 | — | completed |
| done | CLI-node **CN0–CN6** (CN7 skip) · AL0–AL8 · FCC C0–C5/R1 | — | completed |
| done | IC0–IC3 · IC4 skipped · nest isolation · Wayland RC | — | completed |

### Dropped from active queue (not deleted — see IDEAS)

| Was | Disposition |
| --- | --- |
| optional bag-API review `layout-apply-slot.js` | → [IDEAS](./IDEAS.md) — no failure; park |
| optional dual-mon open-heavy nest mon=2 | → [IDEAS](./IDEAS.md) |
| optional per-window signals → WindowAttach | → [IDEAS](./IDEAS.md) |
| MD1 container-motion HTML prototype | → [IDEAS](./IDEAS.md) — not PRIORITY |
| CLI “nothing applied” wording | → [IDEAS](./IDEAS.md) |
| Cross-mon TABBED as product | **rejected** (D044) — implement is same-mon normalize |
| Top-level `forge nested` / `forge test` as product | **rejected** — `forge-test` only |
| Hover-spinner / tab-click residuals | **none** unless post-R036 overlay/click repro |

### Why this order

1. **SM1–SM7 done** — epoch, in-slot, open-into-slot, machines, focus, overlay, belt delete.
2. **R036 cold done** — nest multi-open + host `layout dev` forest match without Shell death.
3. **Tab D0 locked** — overlay=all-hard; groups mon-local; TD2/TD3 skip; click none.
4. **Same-mon (D044)** — shipped.
5. **Nested off top-level CLI** — then full strip: user `forge` has no test toolkit.
6. **User CLI: no test toolkit** — **done**; nest/live = `./scripts/forge/forge-test`.
7. FCC / resize / CN13 / STACKED / PR5+ — product need.

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
| Nested = testing tools | User CLI is not a dev toolkit | `forge-test nested` · [user surface](./plans/forge-cli-user-surface.md) |
| User `forge` product-only | Ordinary install must not ship test harness | user surface · **done** |
| `lib/shared` gi-free | Kernel prefs+CLI can share | D036 · CN0 · CN3 |
| ApplyLayout | Speed + one planner | D037 · AL0 **done** |

**Do not** start dual-mon nest by default.
**Do not** nest for no-code host smokes.
**Do not** reintroduce belt as happy path.
**Do not** drop overlay before all-hard.
**Do not** build spanning tab chrome.
**Do not** teach `forge test` or top-level `forge nested`.

**Handoff:** [HANDOFF.md](./HANDOFF.md).
**Parked ideas:** [IDEAS.md](./IDEAS.md).

```bash
# Nest campaign (dev CLI; not user forge)
./scripts/forge/forge-test nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
./scripts/forge/forge-test nested status   # running: False

# SM L0
npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js

python3 -m pytest tests/unit/cli/test_nested_wayland.py -q
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [IDEAS.md](./IDEAS.md) | Parked optionals / promote-later |
| [contracts](../docs/dev/contracts.md) | Job → API |
| [nested CLI separation](./plans/forge-nested-cli-separation.md) | Nested off top-level (**done**; superseded by user surface) |
| [user CLI surface](./plans/forge-cli-user-surface.md) | All test utilities off user `forge` (**done**; `forge-test`) |
| [slot machines](./plans/forge-layout-slot-machines.md) | SM0–SM7 |
| [ApplyLayout](./plans/forge-layout-in-process.md) | AL0–AL8 done |
| [cli-node](./plans/forge-cli-node.md) | D036 CN0–CN6 |
| [tab planning](./tasks/completed/forge-tab-work-planning.md) | D0 locked |
| [same-mon](./tasks/completed/forge-tab-groups-same-mon.md) | D044 shipped |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
