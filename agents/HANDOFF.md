# Handoff — forge (lukebmay)

**Updated:** 2026-08-14 (**campaign lock:** D036 CLI-node · D037
ApplyLayout · TD1 after tab-click live)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest for **code→reload** loops only (default **1 mon**).  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Nest design:** [D022](../docs/DECISIONS.md) · [plan](./plans/forge-nested-isolation.md) · [D0](./tasks/completed/forge-nested-isolation_d0-discussion.md).  
**Last RC:** [forge-wayland-rc_r013-r014](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) · tip needs `./install` (+ nest or logout) for R016/**R017** JS.

**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.  
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

### Shipped — R021–R024 (empty-head open / leaf empty-mon / nest drop / first layout)

| Field | Detail |
| --- | --- |
| Task | [completed](./tasks/completed/forge-dual-mon-open-drop-layout.md) |
| R021 | Empty dest head (pointer then window mon) beats LFT/focus (D027) |
| R022 | Empty-mon user drop is leaf-only (D028) — not `_rehomeWindowPreservingContainer` |
| R023 | BOTTOM on MONITOR HSPLIT wraps a VSPLIT (D029) — never reuse multi-child MONITOR |
| R024 | RunSteps + batch end **always** force-paint after deferred release; skip min-size percent write-back while batch active |
| Guards | L0 `bug-r021-r024-open-drop-layout` + nested R015 + comprehensive MONITOR BOTTOM |
| Follow-up | [forge-test-suite-honest-analysis](./tasks/forge-test-suite-honest-analysis.md) |

```bash
npm test -- tests/regression/bug-r021-r024-open-drop-layout.test.js \
  tests/regression/bug-r015-empty-mon-dnd.test.js \
  tests/unit/extension/lft-mru.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js
```

### Shipped — canonical contracts (D024–D026)

| Field | Detail |
| --- | --- |
| Plan | [forge-canonical-contracts](./plans/forge-canonical-contracts.md) |
| Catalog | [docs/dev/contracts.md](../docs/dev/contracts.md) — extend the named API first |
| R019 | CENTER on H/V siblings groups via `mergeWindowsIntoGroup`; `dropChangesStructure` |
| R020 | Insert / same-axis edge (D032) | Slot-split the focused/target unit when H/V parent already has siblings — never even 3rd sibling. Join leftover 1-child H/V as the slot (R028). Orientation from slot rect |
| Reveal | `wm.revealGroupChild({ keyboard, pin })` (D025) |
| Guards | L0 `drop-intent`, comprehensive CENTER both dirs, `bug-461-edge-snap`, `layout-sensors` restore |
| Residual | **Load tip** then smoke Grok→Chrome CENTER + tiled VLC end-of-video. Live not run this session |

```bash
./install
# Wayland: nest reload (or one logout), then host desk:
# 1) VSPLIT Chrome above Grok → drag Grok onto Chrome CENTER → TABBED both ways
# 2) tiled VLC finishes a video → stays in slot (not Meta fullscreen)
```

### Shipped — R017 (scale/geom → no entered-monitor thrash)

| Field | Detail |
| --- | --- |
| Task | [completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md) |
| Behavior | Geom drift suppress; **defer** entered-monitor rehome; monitors-changed arms settle; no quiet-fp poison; settle R016 retile |
| Code | `workareasGeometryEqual`, `displayGeometryChangedFromQuiet`, deferred rehome, monitors-changed queue |
| Guards | L0 `bug-r017-…` (48 tests w/ R016/H1/R012); live note `--tags R017` |
| Residual | **Logout once** after latest install to load tip (classify same-count→retile). Nest: both scale dirs log `workareas-retile`. Host reverse thrash was H1+stale frames. Restore: `gdisplays load default && forge layout dev` |

### Shipped — R016 (display settle / no-op thrash)

| Field | Detail |
| --- | --- |
| Task | [completed](./tasks/completed/forge-monitor-noop-apply-thrash.md) |
| Behavior | **L0** fingerprint+homes no-op; **L1** retile; **mon loss** collect-to-end-as-group; **mon gain** empty; chaos → H1 |
| Code | `workareas-policy.js` + `monitor-recovery.js` graduated settle |
| Guards | L0 `workareas-policy` + `bug-r016-noop-workareas-no-thrash`; live `--tags R016` |
| Residual | Automated ApplyMonitorsConfig inject not in harness; manual gdisplays smoke |
| Related | Cross-mon tabs D0: [forge-tab-groups-cross-mon_d0-discussion](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Cold spine | `skeleton → open → bind → order/size → hard-ready → focus once → soft residual → verify once` |
| Soft residual (D019) | **Product** — Meta has no settle ACK; learned quiet + correct-on-miss. Not a bug class. |
| Mode B as cold success | **Forbidden** — Mode B = true mid-session chaos only |
| Belt after bind | **Moves-only** (D014) — no structure rewrite on happy path |
| Profiles | Data only — no personal-layout product branches |
| Child list (D023) | `Node.appendChild` / `insertBefore` / `removeChild` / `replaceChildren` only |
| Job → API (D024–D026) | [contracts.md](../docs/dev/contracts.md) — extend the named API; no one-off twins |
| CLI language (D036) | Node under `cli/`; `lib/shared/` gi-free; Python router until CN13; **no** layout port to `cli/` |
| Layout rearch (D037) | In-process `ApplyLayout` (4.6 xhigh design first). IC4 skip if waiters die |
| Insert / same-axis edge (D032) | Slot-split the focused/target unit when H/V parent already has siblings — never even 3rd sibling. Join leftover 1-child H/V as the slot (R028). Orientation from slot rect |
| Focus | Post-settle phase; open-leaf pin on steal (D018); user reveal adopts the pin (R026) |
| Unfocus key (`Ctrl+Super+Esc`) | **Abandoned** — not product; keybind unbound |
| Close → focus | **Kept** (FC1) — LFT/sibling restore |
| CLI jobs | Durable mutators (D021) |
| Wayland retest | Prefer `forge nested run` (or `restart`+stop); never logout loops for JS |
| Nest purpose (D022) | Code/test loop only (avoid logout); no-code smokes on **host** |
| Nest mon count | **Default 1.** `--monitors=N` only when testing multi-mon behavior |
| Nest mon size | Default size policy may shrink later; dual: each dummy ≈ primary logical historically |
| Nest after tests | **FIRM** — prefer `forge nested run` (always stops); interactive → `stop` |
| Nest isolation v1 | `FORGE_HOST=…-sub-…` + `FORGE_CONFIG_HOME` on CLI **and** nest Shell (N1/N2); extension `forgeConfigHome()`; shared layout profiles + install UUID OK; **no** UNIX test user |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

Lifecycle: prefer **owned bags** (sources/signals/lifetime/attach) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

**If you are Grok 4.5:** do **one** slice. Do not redesign D036/D037.
Do not port `layout_plan.py`. Live residuals before new code.

| You can do | You must not |
| --- | --- |
| Insert A R028 live smoke | ApplyLayout / CN8–CN12 / IC4 |
| R025 / R026 live | Touch `cli/` before TD1 unless operator says parallel |
| **TD1** (first new code) | New drop-intent twin; flatten tab groups |
| CN0 after TD1 | Flip root `package.json` `"type"` |

**If you are Grok 4.6 xhigh:** AL0 design only after TD1 is done or
explicitly deferred. C1 `setLayout` after C0.

| Pri | Work | Path |
| --- | --- | --- |
| done | R029/R030 green `layout dev` TILE + reuse | [completed](./tasks/completed/forge-layout-green-reuse-double.md) |
| **P0** | Insert A R028 — `./install` + nest or logout, then `layout dev` + left-dock Nautilus (must VSPLIT the slot, not 3-wide HSPLIT) | [task](./tasks/forge-container-insert-a.md) |
| residual | R025 tab-click slot: click a non-open tab — slot size, no ¼-height reflow | [task](./tasks/forge-tab-click-slot.md) |
| residual | **R026** immediately after `layout dev`, click the other tab — must stay (no flash-then-Grok) | [task](./tasks/forge-tab-click-pin-adopt.md) |
| next | **TD1** drag tab along strip to reorder (after R025/R026 live) | [task](./tasks/forge-tab-chrome-drag_td1-strip-reorder.md) |
| residual | **R027** `layout dev` overlay stays until the command returns; clicks do nothing during it | [task](./tasks/forge-layout-chrome-until-ready.md) |
| residual | Wave Z zoom (D030) on tip; Vim kit live. Super+Enter / C-S-Enter / S-S-Enter; Super+Space = Run | [task](./tasks/forge-zoom-maximize.md) |
| done | Test-suite honesty: rubric + 5 forest rewrites (do not re-sample) | [completed](./tasks/completed/forge-test-suite-honest-analysis.md) |
| done | First-layout FLOAT (R024): batch end always force-paints; no mid-batch percent write-back | [completed](./tasks/completed/forge-layout-first-apply-float.md) |
| done | Install `--kit=vim` + stale-kit warning. Daily: `./install --kit=vim` | [task](./tasks/forge-install-reapply-kit.md) |
| later | Smoke leftover R019/R020 (Grok→Chrome CENTER + tiled VLC) | [R019](./REGRESSIONS.md) · [R020](./REGRESSIONS.md) |
| done | **IC2** `revealGroupChild` (D025) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic2-reveal-open-leaf.md) |
| done | **IC0** catalog + D024–D026 | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic0-catalog.md) |
| done | **IC3** tile-slot / R020 (VLC fs → slot) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic3-tile-slot-authority.md) |
| done | **IC1** drop-intent / R019 (Grok→Chrome CENTER) | [task](./plans/forge-canonical-contracts/completed/forge-canonical-contracts_ic1-drop-intent.md) |
| later | IC4 fold leftover CLI waiters — skip if ApplyLayout deletes them | [IC4](./tasks/forge-canonical-contracts_ic4-settle-fold.md) |
| later | AL0 ApplyLayout design (4.6 xhigh; do not port planner to `cli/`) | [task](./tasks/forge-layout-in-process_al0-design.md) |
| later | CN0–CN3 after TD1 (shared purity + keybind) | [CN0](./tasks/forge-cli-node_cn0-scaffold.md) |
| later | FCC C0/C1 after TD1 (monocle + setLayout I1) | [C0](./tasks/forge-first-class-containers_c0-kill-monocle.md) · [C1](./tasks/forge-first-class-containers_c1-set-layout.md) |
| done | Host tip `7b9875e` (R018 + R016/R017 + R021–R027 JS) | `forge ping` versionName matches `git rev-parse --short HEAD` |
| later | L1 scale smoke after tip: `gdisplays load default-no-scale` must not thrash | [PRIORITY](./PRIORITY.md) · [R017](./REGRESSIONS.md) |
| later | Cross-mon TABBED product design (D0) | [task](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
| done | **R017** entered-monitor suppress on geom drift | [completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md) |
| done | **R016** no-op workareas + mon-loss collect | [completed](./tasks/completed/forge-monitor-noop-apply-thrash.md) |
| done | **R015** empty-mon DnD (grab-end rehome when no TILE under pointer) | L0 `bug-r015-empty-mon-dnd`; live `L1.r015-empty-mon-dnd` |
| done | Wayland RC R013/R014 + host logout + suite green | [completed](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | Lifecycle W1–W5 + L8/L11; R011; R012 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | RC procedure (last run green) |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [forge-canonical-contracts.md](./plans/forge-canonical-contracts.md) | **P0** job→API catalog; IC1–IC3 |
| [docs/dev/contracts.md](../docs/dev/contracts.md) | Canonical APIs — extend these first |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete; optional residual) |
| [forge-tab-chrome-drag.md](./plans/forge-tab-chrome-drag.md) | TD1 — [task](./tasks/forge-tab-chrome-drag_td1-strip-reorder.md) |
| [forge-cli-node.md](./plans/forge-cli-node.md) | Node CLI CN0–CN6; no layout port |
| [forge-layout-in-process.md](./plans/forge-layout-in-process.md) | ApplyLayout — 4.6 xhigh design first |

### R015 (empty-mon drag) — shipped in tree

**Symptom:** dual-mon Wayland; two dock windows on left; click-drag one to empty
right mon → snaps back on release. Keyboard mon-move works.

**Root:** DnD only commits with `nodeWinAtPointer`. R012 skips mid-drag rehome.
Empty dest → null target → grab-end no-op → render snaps back.

**Fix:** `resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop` in
`lib/extension/drag-drop.js`; session `dnd-drop` accepts `destMonitor` without
`onto`; live case `L1.r015-empty-mon-dnd`.

```bash
# L0
npm test -- tests/regression/bug-r015-empty-mon-dnd.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r015
# Load tip + dual-mon live (Wayland):
./install && forge nested run --monitors=2 -- forge test live run --tags R015
# Or host after one logout loads tip: human drag mon0 TILE onto empty mon1
```

### Nest isolation v1 (shipped)

| Slice | Goal | Status |
| --- | --- | --- |
| N3 | Campaign entry always cleans nest; stale reaper | done |
| N1 | `FORGE_HOST=<host>-sub-<name>` + nest CLI data dirs; shared layout profiles OK | done |
| N4 | testing.md / RC suite / HANDOFF process rules | done |
| N2 | Nest Shell/extension honor same data root (`forgeConfigHome`) | done |

**CLI + nest Shell:** `FORGE_HOST` / `FORGE_CONFIG_HOME`; extension writes under nest
`…/forge-config`, not parent `~/.config/forge`. Prefer `forge nested run` for campaigns.
Shared intentionally: install UUID, layout profiles, gsettings.

### Wayland RC (cleared 2026-08-10)

Procedure: [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) ·
process: [testing.md](./testing.md) § Wayland.

| Rule | Detail |
| --- | --- |
| Host first | L1 / dual-mon open-leaf / chrome RC authority on **host** desk |
| Layouts | **`_forge-test-*` only** — never personal `dev` / `t1` |
| Nest | Code→reload or multi-mon structure only; default **mon=1** |
| Campaign entry | `forge nested run -- …` (always stops); dual: `--monitors=2` only when needed |
| Isolation | Nest CLI+Shell use nest `forge-config`; parent `~/.config/forge` not rewritten |
| Results | `agents/test-results/wayland/<host>-wayland-<UTC>.json` |
| Wrap-up | `forge nested status` → `running: False` |

```bash
echo "$XDG_SESSION_TYPE"          # wayland
forge test live probe             # can_nested / can_retest
# L0
python3 -m pytest tests/unit/cli/test_layout_apply.py \
  tests/unit/cli/test_live_matrix.py tests/unit/cli/test_nested_wayland.py -q
# Host L1 / partial (no nest if no JS change)
forge test live plan --from-work wayland-rc
# After extension JS change: ./install && forge nested run -- …
# Host dual-mon RC needs tip already on host (one logout after install if needed)
```

**Last host run:** tip `…-dirty` after logout; full `wayland-rc` cleared (first
`L1.ghosttys-only` post-login hard-ready fluke; retest PASS). R013/R014 open-leaf
thrash **not** reproduced.

### Lifecycle bags (shipped — residual optional)

| Module | Path | Status |
| --- | --- | --- |
| SourceBag | `lib/extension/sources.js` | live |
| settle-math | `lib/extension/settle-math.js` | live |
| SignalBag | `lib/extension/signals.js` | live + W5 |
| Lifetime | `lib/extension/lifetime.js` | pure compose |
| SuppressFlag | `lib/extension/suppress.js` | live W4 |
| WindowAttach | `lib/extension/window-attach.js` | live W2 |
| OpenCommitManager | `lib/extension/open-commit-manager.js` | L8 |
| LayoutBatchDepth | `lib/extension/layout-batch-depth.js` | L11 |

**Failure dump:** `wm._wmSources|._wmSignals|._openCommit|._windowAttach|._layoutBatch|._suppress*.snapshot()`

### Nest lifecycle — STOP after tests (FIRM)

```bash
# Prefer campaign entry (always stops unless --keep):
forge nested run -- forge ping
forge nested status   # want: running: False

# Interactive multi-step still ends with:
forge nested stop
forge nested status   # want: running: False
```

**Prefer** `forge nested run -- …` for one-shot campaigns.  
Use `exec` / `restart` only when the nest must stay up for multi-step work; **still stop** when done.  
**Never** leave nest env on durable agent shells.  
**Default** mon=1. Dual only: `--monitors=2` when testing dual-mon behavior.  
Nest client + Shell env: `FORGE_HOST=…-sub-…`, `FORGE_CONFIG_HOME=<session>/forge-config` (N1/N2).

### Headless / true cold

Durable Grok leader (or Guake/float). After suites that close agent TILE: leader reopens ghostty; `grok -r`.

```bash
forge test live probe
# L0 before expensive live
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
```

### Nested Wayland (process)

```bash
# Code changed → one-shot retest without logout (preferred):
./install && forge nested run -- forge ping          # mon=1; auto stop
# Multi-mon behavior under test only:
forge nested run --monitors=2 -- forge tree
# Multi-step interactive:
./install && forge nested restart
forge nested exec -- forge ping
forge nested stop                                   # FIRM
```

No-code smoke → **host** only (no nest).

---

## Abandoned / do not revive

| Item | Note |
| --- | --- |
| Unfocus key `Ctrl+Super+Esc` | Abandoned; unbound |
| Mode B as cold success | Forbidden |
| Personal layouts in live matrix | Use `_forge-test-*` only |
| Separate UNIX nest user (v1) | Rejected until data-root isolation fails |

---

## Doc map

| Doc | Role |
| --- | --- |
| [PRIORITY.md](./PRIORITY.md) | Queue |
| [nest isolation](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [contracts](../docs/dev/contracts.md) | Job → API (extend first) |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
