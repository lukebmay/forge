# forge (lukebmay) — active priorities

**Updated:** 2026-08-23 (plog TRACE hunts closed; D068)
**Lens:** healthy codebase first — ownership, **named APIs**, unit tests. Size is a symptom.
**Branch:** **`master`** default
**Push:** only when human asks.

**Locked:** D036 (Node CLI + `lib/shared` pures) · D037/D038 ApplyLayout ·
**D039–D043** slot machines (SM0) · **SM1–SM7 implement landed** ·
**R036 cold PASS** · **D044** TABBED/STACKED mon-local **shipped** ·
**D046** Chrome live tab strip DnD **docs shipped** ·
**D049** mins env floor + passive learn (**M1–M5 agent done**; oversized-frame
learn **done**; soft human tiny-env) ·
**D050** dual-sink (journal WARN+) · **D068** regular INFO · `--dev`→TRACE · `--prod`→WARN ·
**D053** `forge log` session + persist + live reconfigure **shipped** ·
**D054** dual-tape JSONL + `forge log` query forward **shipped** ·
**sink policy** prod no longer forces logs OFF **shipped** ·
**PR1–PR15** tab chrome / click-drag **unit-shipped** · PR7 docs **done** ·
User CLI surface **shipped** (`forge` product-only; nest/live = **`forge-test`**) ·
**FCC C0–C5 + R1 + R2-docs + P3 flatten strip shipped** · Wave Z0/Z1 (D030) shipped ·
**OH1–OH3 + ws-orphan shipped** · layout preflight · slot-id late-adopt remap ·
DnD FLOAT skip · open-min late-adopt **agent done**.

**Active next (ordered):**
1. soft human — host verify OH + tip (+ vinyl WS2 + TILE DnD + optional dual-mon dock eyes-on + `forge log` apiVersion 11 + jsonl + Q0 color + Q5/Q6 pretty/fields) — [blocker](./blockers/oh-ws-orphan-host-verify.md)
2. soft human — D049 tiny-env Nautilus (+ oversized learn eyes-on) — [blocker](./blockers/d049-tiny-env-nautilus.md)
3. **P2 mid** (design only) — multi-ws pinned slots — [blocker](./blockers/pinned-slots-multi-ws-design.md) · [task](./tasks/forge-pinned-slots-multi-ws_d0-discussion.md)
4. later CN14/CN15 · blocked yuiop
**Agents:** plog TRACE dig **done**
([completed](./tasks/completed/forge-plog-trace-hunts.md)) — place-hint FIFO
wrong-window **accepted**+test; P2 bad-slot = late-adopt settle jitter.
Uncommitted with OH Downstream. Soft human verify is next eyes-on only. Do
**not** start #3 until the operator schedules that design meeting. Do **not**
stop to ask the operator unless a **critical new finding**.
**Hunts:** `forge log --grep` / `--session` / `--level` only — never `tail` at
TRACE (project.md § Logging; catalog `plog`). Prefer JSONL `text` when pretty
collapses duplicate `class=` (place-hint now logs `winClass=`). Interactive
query color + pretty (D067). **Host:** dirty tip installed `--dev`; nest ping
green / **stopped**; primary tip reload via nest restart or later logout.

**Tab-drag owner:** `DragDropManager` sole gesture sink (stage capture + poll);
tree press-arm only. Poll skips synced xy; SourceApp hot logs are TRACE.
**Retest (FIRM):** nest = normal Wayland code→reload via
`./scripts/forge/forge-test nested`; primary logout = rare tip load.
After nest **`./install --dev`**, **`forge-test nested restart`** so extension
reloads (TRACE for hunts — [testing.md](./testing.md)).
**Later (real only):** CN14/CN15 · yuiop blocker — [IDEAS](./IDEAS.md).
Hygiene / eyes-on / superseded rows were **pruned** 2026-08-18 (see IDEAS
“Dropped”).
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
+ **tab click-drag PR1–PR15 + PR7 docs (D046)** landed. **FCC Wave C (+R1/R2-docs)
closed through C5; P3 `_layoutOp` flatten strip done.** Wave Z0/Z1 shipped.
**D053 `forge log` shipped** ([completed](./tasks/completed/forge-log-cli-session.md)).
**Active:** OH Downstream **done**
([completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh-downstream-mon-dock.md)).
plog TRACE hunts **done**
([completed](./tasks/completed/forge-plog-trace-hunts.md)). Soft human host
verify — [blocker](./blockers/oh-ws-orphan-host-verify.md). **D049** M1–M5 +
oversized learn agent shipped; soft tiny-env. Optional later: CN14/CN15 · yuiop
(blocked). Preserve PR9 foreign spacer-only and PR10 synthetic peel ownership.
Do **not** reintroduce shrink-probe.
Do **not** re-litigate D039–D044. Do not reintroduce belt / TILE-anywhere hard
/ mon-root PlaceNext / soft-enter chrome clear / spanning tab chrome / silent
`_layoutOp` peel. Do not teach `forge test` / `forge nested`. Nest hunts:
`./install --dev` then `forge-test nested` ([testing.md](./testing.md)).

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
| P3 `_layoutOp` strip | **done** | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_p3-strip-layoutop-flatten.md) |
| Tab PR7 docs | **done** | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr7-docs.md) · D046 |
| CN13 Node PATH | **done** | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn13-path-entry.md) |

**L0 last:** D054 dual-tape — plog-adapter + cli/log + plog-query **42** green.
Nest/tip reload needed for extension jsonl write; query CLI works from tree now.
**Host cold:** R036 **PASS**. Soft: logout tip + vinyl WS2 + tiny-env Nautilus.

---

## Queue

| Pri | Item | Agent | Status |
| --- | --- | --- | --- |
| done | dual-sink + level retarget (D050) | **4.5** | [completed](./tasks/completed/forge-log-level-retarget.md) · PLOG 1.2.0 |
| **P0** | **OH1** vendor+adapter+CLI+pepper | **4.6 high** | **done** · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh1-plog-logging.md) |
| **P0** | **OH3** debug/trace assertions | **4.6 high** | **done** · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh3-assertions.md) |
| **P0** | **OH2** JSDoc + checkJs; no casual `any` | **4.5 high** | **done** · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh2-typescript-checkjs.md) · `npm run typecheck:oh2` |
| done | ws-orphan multi-ws / min-float / DnD grab | **4.5** | [completed](./tasks/completed/forge-layout-ws-orphan-min-float-dnd.md) |
| done | layout profile preflight | **4.5** | [completed](./tasks/completed/forge-layout-profile-preflight.md) |
| done | slot-id late-adopt hard-fail | **4.5** | [completed](./tasks/completed/forge-layout-vinyl-hardfail-slot-ids.md) · nest mon=2 ok |
| done | oversized settled frame → learn | **4.5** | [completed](./plans/forge-min-size-floor/completed/forge-min-learn-oversized-frame.md) |
| done | DnD titlebar preview miss | **4.5** | [completed](./tasks/completed/forge-dnd-preview-miss-titlebar.md) · FLOAT skip log |
| done | **`forge log` session + persist + live reconfigure** | **4.5** | [completed](./tasks/completed/forge-log-cli-session.md) · **D053** |
| done | monitor identity + same-mon dock launch | **4.5** | [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh-downstream-mon-dock.md) |
| done | TRACE dial-back + place-hint / bad-slot hunts | **4.5** | [completed](./tasks/completed/forge-plog-trace-hunts.md) |
| soft | Host verify OH + tip (+ vinyl/DnD + forge log) | human | [blocker](./blockers/oh-ws-orphan-host-verify.md) |
| soft | D049 tiny-env Nautilus (human) | human | [blocker](./blockers/d049-tiny-env-nautilus.md) |
| done | open-min late-identity adopt | **4.5** | [completed](./tasks/completed/forge-open-min-late-adopt.md) |
| done | D052 `--dev` DEBUG + enable truncate | **4.5** | D052 · `531db43` |
| done | D049 M5 L0 + nest | **4.5** | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m5-verify.md) |
| done | D049 M4 docs/contracts/DESIGN | **4.5** | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m4-docs.md) |
| done | D049 M3 overflow BFS + remove gap | **4.6 high** | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m3-overflow-rehome.md) |
| done | D049 M2 excise shrink-probe | **4.5** | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m2-excise-probe.md) |
| done | D049 M1 env min floor + `readWindowMinSize` | **4.5** | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m1-env-floor.md) |
| done | D049 M0 decision + plan disk | **4.5** | D049 row; [plan](./plans/forge-min-size-floor.md) |
| later | CN14 / CN15 | **4.6 med** | after CN13 · [cli-node](./plans/forge-cli-node.md) § CN14 |
| blocked | Ratio / autotile (yuiop) | **4.6 xhigh** | [blocker](./blockers/resize-autotile-design.md) |

### Why this order

1. **P0 observability (OH1–OH3 + D053 + TRACE hunts done)** — instrument first; live `forge log`.
2. **ws-orphan + Downstream mon/dock done.** Remaining OH: soft host verify.
3. **SM1–SM7 + R036 + D044 + user CLI + PR1–PR15 + FCC C0–C5/R1 + P3 + Wave Z0/Z1 + CN13** — shipped.
4. **D049 M1–M5** agent shipped (soft human tiny-env open).
5. **Optional later** — CN14/CN15 · yuiop (human lock).

**Handoff:** [HANDOFF.md](./HANDOFF.md).
**Parked ideas:** [IDEAS.md](./IDEAS.md).
