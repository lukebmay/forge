# Handoff — forge (lukebmay)

**Updated:** 2026-08-16 (chrome clear at soft-enter; tab restack on clear; logging)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest for **code→reload** loops only (default **1 mon**).  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Nest design:** [D022](../docs/DECISIONS.md) · [plan](./plans/forge-nested-isolation.md) · [D0](./tasks/completed/forge-nested-isolation_d0-discussion.md).  
**Repo tip:** `a63cdb0` (+ docs `57cc497`). Disk install: **`v49-90-beta.2-332-g57cc497`**.  
**Host Shell tip (live):** still **`g8ecb0f6-dirty` until logout** (Wayland).  
**Logging:** `logging-enabled=true`, `log-level=5` (DEBUG).  
**Queue:** **Logout** → tip load → spinner/tab eyes-on + R036 cold. [IDEAS](./IDEAS.md).

**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.  
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

### Hot — spinner + tab click (soft-enter chrome + restack)

| Field | Detail |
| --- | --- |
| Symptom | Spinner stays long; tab click often fails to activate app |
| Root | (1) Host Shell pre-fix tip. (2) Apply scrim is **reactive** until clear. (3) Soft quiet multi-second — clear-after-soft still blocked tabs whole wait. (4) Strip buried under raises until restack (R032) |
| Fix | Clear chrome at **soft-enter** (before quiet). Restack strips on chrome clear. INFO: chrome show/clear, `_activateFromTab`, restack, reveal adopt |
| Logging | enabled + log-level 5. Follow: `journalctl --user -f \| rg 'Forge.*(chrome|tab|restack|activate)'` |
| Paths | `layout-apply-run.js`; `session-api.js`; `tree.js`; `action-pipeline.js`; `window.js` |
| L0 | layout-apply-run + action-pipeline + bug-tab-click-activate green |
| Host | **Logout required.** Then ping ≠ g8ecb0f6; layout dev; spinner drops at soft-enter; tabs clickable |

```bash
./install --kit=vim
# Wayland: log out and back in, then:
forge ping   # want a63cdb0 / 57cc497, not g8ecb0f6
gsettings get org.gnome.shell.extensions.forge logging-enabled  # true
gsettings get org.gnome.shell.extensions.forge log-level        # uint32 5
forge layout dev
journalctl --user -b --no-pager | rg 'Forge.*(chrome|soft-enter|_activateFromTab|restack)' | tail -40
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/regression/bug-tab-click-activate.test.js
```

### Hot — R036 cold Wayland `forge layout dev` (beltStructure + unwrap)

| Field | Detail |
| --- | --- |
| Symptom | Cold job **ok** but tree wrong: mon0 `TABBED\|VSPLIT(ghostty)`; mon1 **flat** 4-wide. Soft OK. Mid re-apply fixes mon1 only |
| Root A | PlaceNext mon-root / D032 thrash (PH pin helps) |
| Root B | AL8 ApplyLayout belt mon moves **without** R013 `beltStructure` → mon1 TABBED flattened |
| Root C | Lone mon-direct VSPLIT never unwrapped after structure |
| Fix (code) | PH PlaceNext pin + pin no-D032; **runBeltStructureRebind** after belt moves; **unwrap mon-direct 1-child H/V** after order/size |
| Paths | `layout-apply-settle.js` beltStructure; `layout-apply-run.js`; `session-api.js` unwrap; prior PH pin files |
| L0 | settle + open + placeholder + open-app-policy **123** green |
| Nest | dual mon0 unwrap PASS (ghostty mon-direct); chrome open-miss nest flake |
| Host | **Logout** then cold `forge layout dev` for tip + cold sign-off |
| Task | [forge-layout-cold-apply-structure](./tasks/forge-layout-cold-apply-structure.md) · [R036](./REGRESSIONS.md) |
| Jobs | cold wrong-tree `…a3152f` / `…5aedd6`; mid mon1 `…41b16b` |

```bash
forge ping   # apiVersion 10; tip dirty until logout after install
./install --kit=vim
# Host cold (required):
#   log out and back in, then:
forge layout dev
forge tree
# mon0: TABBED(chrome,Grok) | ghostty
# mon1: ghostty | TABBED(YouTube,Gmail,Voice)
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/extension/layout-placeholder.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js
```

### Shipped — R033 open/launch LFT aspect → VSPLIT/HSPLIT

| Field | Detail |
| --- | --- |
| Symptom | Dock / `forge launch` wrong split: tall LFT not VSPLIT [LFT, new]; or mon-sibling thrash |
| Phase | OP1 open orientation + bag attach (`_maybeAspectSplitForOpen` / D032 `_orientationFromUnit`) |
| Root | Frame-first / `unit.rect`-only aspect ignored `renderRect`; MONITOR `!isWindow` attach → workspace then mon-root rehome |
| Fix | `_slotRectForUnit` (paint/renderRect/rect/frame); both open aspect paths use it; bag attach requires `isCon()` |
| Paths | `lib/extension/window.js` |
| L0 | insert-slot-split 12 + open-app-policy 30 (+ r021, lft-mru) **88** green |
| Nest | Client maps did not enter nest tree this run; structure unit-proven |
| Host | **Logout** then focus tall vs wide LFT + dock/`forge launch` |
| Task | [completed](./tasks/completed/forge-r033-open-aspect-split.md) · [R033](./REGRESSIONS.md) |

```bash
npm test -- tests/unit/window/WindowManager-insert-slot-split.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js
./install --kit=vim
# Wayland host tip:
#   log out and back in, then:
#   focus a tall half-tile → forge launch nautilus → VSPLIT [LFT, new]
#   focus a wide unit → HSPLIT [LFT, new]
```

### Shipped — R035 residual tab ensure (cold mon1 flat tabs)

| Field | Detail |
| --- | --- |
| Symptom | New Wayland session: `forge layout dev` “ok” but mon1 YouTube/Gmail/Voice are HSPLIT mon siblings (not one TABBED CON). mon0 tab OK |
| Root | Residual `skipWindowStructure = coldEmpty \|\| hasLayoutPh` skipped all window-anchored `ensure_layout` while skeleton PHs lived. Bind alone when map missed PH CON left multi-role tabs flat. Verify = focus only → false ok |
| Fix | `skipWindowStructure = coldEmpty` only; tab/stack ensure while PHs present; mon-level ensure still off while `hasLayoutPh`. Bind phase then order-phase ensure |
| Paths | `lib/shared/layout-plan.js`, `scripts/forge/layout_plan.py` |
| L0 | Vitest residual PH+ungrouped tab; pytest multi-role PH ensure; layout_plan 212; expected 6 |
| Host | Mid-session re-apply grouped mon1. Logout tip loaded 2026-08-16 |
| Task | [completed](./tasks/completed/forge-layout-residual-tab-ensure.md) · [R035](./REGRESSIONS.md) |
| Residual | Cold host still fails as **R036** (structure/soft), not “tip missing” |

```bash
npm test -- tests/unit/shared/layout-plan-reconcile.test.js
python3 -m pytest tests/unit/cli/test_layout_plan.py -q -k 'has_layout_ph or residual_bind'
./install --kit=vim
# Wayland host tip:
#   log out and back in, then cold:
forge layout dev
# mon1: ghostty | TABBED(YouTube,Gmail,Voice)
```

### Hotfix — host `forge layout dev` no tile/resize (ApplyLayout open-miss)

| Field | Detail |
| --- | --- |
| Symptom | New Wayland session: `forge layout dev` fails; windows do not tile/resize |
| Not expected | AL8 product path is ApplyLayout; nest `_forge-test-clean` had passed — host personal `dev` still required to work |
| Root A | `_spawnApplyLaunch` treated **any** space as shell argv → `"Google Voice"` → exec `Google` → spawn fail → `code=open-miss` aborts at hard-ready |
| Root B | Skeleton placeholders lacked Meta surface (`get_window_type`, `showing_on_its_workspace`) → TypeError in `processFloats` / decoration paint |
| Root C | Residual `close` / `bind` hard-failed on already-gone PH or window → `steps-failed` mid-spine |
| Root D | **R034:** Name search `"YouTube"` can rank **YouTube TV** first — pick exact Name |
| Fix | DesktopAppInfo first (chrome PWA id + exact Name search); path-only argv gate; expand PH stub + skip PH in `processFloats`; soft-ok residual close gone + bind no-PH |
| Paths | `lib/extension/session-api.js`, `lib/shared/layout-open.js`, `lib/extension/layout-placeholder.js`, `lib/extension/window.js`, `lib/extension/decoration.js` |
| L0 | `layout-open` (YouTube vs TV + multi-word) + `layout-placeholder` |
| Nest | `_forge-test-clean` **PASS**; cold nest open map can flake (separate) |
| Host | Logout tip loaded 2026-08-16; open-miss path fixed; **R036** is the cold residual |
| Open queue | **R036** (structure + soft) — see hot section |
| Job evidence | `~/.local/share/forge/jobs/20260816T010248Z-1fda4a` (`open spawn failed … "Google"`) — historical |

```bash
./install --kit=vim
# Wayland host tip:
#   log out and back in, then:
forge ping   # apiVersion 10
forge layout dev
# Nest code loop (no logout):
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
npm test -- tests/unit/shared/layout-open.test.js tests/unit/extension/layout-placeholder.test.js
```

### Shipped — R032 tab-strip click (ApplyLayout restack)

| Field | Detail |
| --- | --- |
| Root | Last raise after ApplyLayout left deco under window actors; Chrome/stale frames often cover the strip. Trailing/`settleTabFocus` raise re-buried |
| Fix | WR14 settle on ApplyLayout **steps**; **Done restack-only** (`_restackTabDecorations`, no second raise); keyboard `revealGroupChild` focus+activate then `afterFocus` |
| L0 | `bug-tab-click-activate` 12; `action-pipeline` keyboard order; live_matrix `L1.r032-tab-click-responsive` |
| Nest | After ApplyLayout: pick hitTab; repeated `_activateFromTab` switches LTF; chrome-clear. No XTEST (crashes nest). Nest stopped |
| Host | Wayland tip still `g1213cb7` until logout |
| Task | [completed](./tasks/completed/forge-tab-click-unresponsive.md) |

### Shipped — AL8 thin CLI cutover

| Field | Detail |
| --- | --- |
| Client | `scripts/forge/layout_apply_client.py` + `forge._layout_run_reconcile_apply_layout` |
| Product path | preamble → `ApplyLayout` → Progress/Done (poll GetLayoutApply belt) |
| Cancel | Ctrl+C → `CancelLayoutApply`; D021 `applyId` in status.json |
| Deleted | CLI LayoutBatch product chrome/begin, `_layout_final_focus_pass`, GetTree waiters (`wait_until_hard_ready` / `run_soft_*` / `wait_for_open_role_pins`) |
| GJS fix | `deepClone` without `structuredClone` (Shell) |
| Live | nest mon=1 `_forge-test-clean` + `_forge-test-ghosttys` **PASS**; nest stopped |
| IC4 | **skipped** (waiters deleted) |
| Tests | client 21; layout_apply+cli+lib 185; plan normalize+reconcile 63 |
| Task | [AL8](./plans/forge-layout-in-process/completed/forge-layout-in-process_al8-cli-cutover.md) |
| Residual | dual-mon `_forge-test-dual` not re-run this slice; host logout for host tip |

```bash
./install --kit=vim
# Nest (fix XAUTHORITY if :1 auth fails):
forge nested start --replace
forge nested exec -- forge ping   # apiVersion 10
forge nested exec -- env FORGE_JOB=0 forge layout _forge-test-clean
# also: forge nested exec -- env FORGE_JOB=0 forge layout _forge-test-ghosttys
forge nested stop
python3 -m pytest tests/unit/cli/test_layout_apply_client.py -q
```

### Shipped — AL7 settle (hard/soft/focus/verify)

| Field | Detail |
| --- | --- |
| Bag | `lib/extension/layout-apply-settle.js` + `LayoutApplyRunBag` `settle` deps |
| Hard-ready | `windowIsSettled` + `waitHardReadyOnSignals` (Meta TILE/rect/mon; 5s call clock; **not** GetTree poll) |
| Focus | existing RunSteps → `revealGroupChild` + `pinLayoutOpenLeaf` |
| Soft | `runSoftFocusBarrierOnSignals` + `settle-math`; steal → pin restore + reset quiet |
| Heuristics | `forgeConfigDir()/settle-heuristics.json` (same Python shape; class/timings only) |
| Verify / belt | verify once; D014 pin-role moves only |
| LF6 | `waitTreeStable` opt-in only |
| Tests | `layout-apply-settle.test.js` (27) + 5 bag cases; suite **157** |
| Nest | **Not run** — retest: `forge nested run --monitors=1 -- …` after install |
| Task | [AL7](./plans/forge-layout-in-process/completed/forge-layout-in-process_al7-executor-settle.md) |
| Next | **AL8** thin CLI cutover |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/extension/layout-apply-settle.test.js
# After commit + nest/host load tip:
# forge nested run --monitors=1 -- forge ping
```

### Shipped — AL6 open/map (ApplyLayout spawn + pin)

| Field | Detail |
| --- | --- |
| Pure | `lib/shared/layout-open.js` — launch fields, Ghostty rewrite, chrome serialize, pin assign |
| Bag | `lib/extension/layout-apply-open.js` + `LayoutApplyRunBag` `open` deps |
| Session | GJS spawn / `wm.placeNext`; admit + census; Meta `window-created` + title/class |
| Batch | begin → spawn → map-wait → `releaseDeferredOpens` → end **then** residual replan |
| Pins | title wait then class leftover (D034); residual `rolePins` / `justOpenedRoles` |
| Tests | `layout-open.test.js` (24) + `layout-apply-open.test.js` (10); suite **125** |
| Nest | **Not run** — retest: `forge nested run --monitors=1 -- …` after install |
| Task | [AL6](./plans/forge-layout-in-process/completed/forge-layout-in-process_al6-executor-open.md) |
| Next | **AL7 done** → **AL8** |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/extension/layout-apply-open.test.js
# After commit + nest/host load tip:
# forge nested run --monitors=1 -- forge ping
```

### Shipped — AL5 structure executor (no-open ApplyLayout)

| Field | Detail |
| --- | --- |
| Pure | `lib/extension/layout-apply-structure.js` — `buildStructurePlan`, phase partition |
| Bag | `LayoutApplyRunBag` `structure: { snapshotForest, runSteps }` |
| Session | `_snapshotForestForApply` (`projectForest`); `_runApplyLayoutSteps`; **`_setLayoutStructureOp`** (I1 `setLayout`, wrap OK, **never** `_layoutOp` / flatten) |
| Open | **AL6 done** (above) |
| Settle | AL7 done (hard/soft/verify/belt) |
| Tests | `layout-apply-structure.test.js` (9) + bag structure cases |
| Nest | **Not run** — retest: `forge nested run --monitors=1 -- …` after install |
| Task | [AL5](./plans/forge-layout-in-process/completed/forge-layout-in-process_al5-executor-structure.md) |
| Next | **AL7 done** → **AL8** |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js
# After commit + nest/host load tip:
# forge nested run --monitors=1 -- forge ping
```

### Shipped — AL3 planReconcile + planActionsToSteps (expected parity)

| Field | Detail |
| --- | --- |
| Module | `lib/shared/layout-plan.js` — `planReconcile`, `planActionsToSteps` (+ AL2 normalize) |
| Parity | All 9 AL1 `expected/*.json` plans deep-equal (Vitest) |
| Flatten | Cold empty → `ensure_skeleton` only; no happy-path flatten dependency |
| Tests | `tests/unit/shared/layout-plan-reconcile.test.js` — **14 pass** |
| Python | Apply path **unchanged** (still owns live apply) |
| Task | [AL3](./plans/forge-layout-in-process/completed/forge-layout-in-process_al3-shared-plan-reconcile.md) |
| Next | **AL7 done** → **AL8** |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js
python3 -m pytest tests/unit/cli/test_layout_expected.py -q
```

### Shipped — AL2 shared profile normalize/validate/desugar

| Field | Detail |
| --- | --- |
| Module | `lib/shared/layout-plan.js` — `normalizeProfile`, `validateReconcileProfile` (pure JSON; no gi/node/fs) |
| Oracle | `scripts/forge/dump_layout_normalize_expected.py` → `expected-normalize/` (46 cases) |
| Tests | `tests/unit/shared/layout-plan-normalize.test.js` — **49 pass** |
| Task | [AL2](./plans/forge-layout-in-process/completed/forge-layout-in-process_al2-shared-plan-normalize.md) |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js
python3 scripts/forge/dump_layout_normalize_expected.py  # regen oracle
```

### Shipped — AL1 expected plan dump + AL4 ApplyLayout DBus stub

| Field | Detail |
| --- | --- |
| AL1 | `scripts/forge/dump_layout_expected.py` + `tests/unit/cli/fixtures/layout/expected/` (9 cases) |
| AL1 tests | `tests/unit/cli/test_layout_expected.py` — 6 pass |
| AL4 | `lib/extension/layout-apply-run.js` + SessionApi methods/signals; `SESSION_API_VERSION=10` |
| AL4 chrome | Apply-run hard clear **300s** (`LAYOUT_APPLY_RUN_HARD_MS`); batch stays 30s |
| AL4 tests | `tests/unit/extension/layout-apply-run.test.js` (13) + chrome hardMs re-arm |
| Stub→structure | AL4 chrome/signals; AL5 fills structure (above) |
| Nest live | AL4 host green earlier; AL5 nest **not** re-run this session |
| Tasks | [AL1](./plans/forge-layout-in-process/completed/forge-layout-in-process_al1-expected-dump.md) · [AL2](./plans/forge-layout-in-process/completed/forge-layout-in-process_al2-shared-plan-normalize.md) · [AL3](./plans/forge-layout-in-process/completed/forge-layout-in-process_al3-shared-plan-reconcile.md) · [AL4](./plans/forge-layout-in-process/completed/forge-layout-in-process_al4-dbus-apply-layout.md) · [AL5](./plans/forge-layout-in-process/completed/forge-layout-in-process_al5-executor-structure.md) |
| Plan | [forge-layout-in-process.md](./plans/forge-layout-in-process.md) |
| Next | **AL8** thin CLI |

```bash
python3 -m pytest tests/unit/cli/test_layout_expected.py -q
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js
npm test -- tests/unit/extension/layout-apply-run.test.js
# When nest works: ./install --kit=vim && forge nested run -- forge ping  # apiVersion 10
```

### Residual host smoke (tip loaded this Wayland session)

| Check | Result |
| --- | --- |
| R019 CENTER both dirs | **PASS** (agent `dnd-drop`); no further human action required unless you want eyes-on |
| R020 VLC end-of-video | **Nest mon=1 PASS (2026-08-15 post-AL8):** tile VLC + `tests/fixtures/media/vlc-end-of-video.webm` play-to-EOS stayed TILE in slot; Meta max+fs after EOS restored via D026. Nest vout weak — host eyes-on optional. L0 green. No code change. live `L1.r020-vlc-end-of-video` |
| R031 float border (Kooha) | **Shipped** — no reserved TILE wrap; FLOAT border from Meta frame. L0 + nest Kooha FLOAT PASS. Host logout for tip |
| Host tip | Wayland needs logout for host tip; nest loads install. Ping host still `g1213cb7-dirty` / apiVersion 10 until logout |

### Shipped — R027 chrome until ready + Wave Z residual (nest)

| Field | Detail |
| --- | --- |
| R027 | Nest tip: `layout _forge-test-ghosttys` → `layoutChromeShow.shown=true`; post-apply `chrome-clear` already cleared |
| Wave Z | **Host live PASS** (operator); Vim zoom keys; L0; `paintRectForWindow` border |
| Tasks | [R027](./tasks/completed/forge-layout-chrome-until-ready.md) · [Wave Z](./tasks/completed/forge-zoom-maximize.md) |

### Shipped — FCC C1 setLayout I1 (`4740ba5`)

| Field | Detail |
| --- | --- |
| API | `Node.setLayout` / `Tree.setLayout` — layout field only; no reparent/flatten |
| Converted | Layout* toggles, `_layoutCycleOp`, mode toggles, reset/auto-exit, etc. |
| Residual | `_layoutOp` still flattens for profile ensure (**REG-ensure-flatten**) |
| Contracts | row “Change CON layout mode” in [contracts.md](../docs/dev/contracts.md) |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c1-set-layout.md) |
| Guards | 223 pass (`set-layout-i1` + Tree-ops/layout + CommandHandler + layout-cycle) |

```bash
npm test -- tests/unit/tree/set-layout-i1.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
```

### Shipped — FCC C0 kill monocle

| Field | Detail |
| --- | --- |
| C0 | Deleted `toggleWorkspaceMonocle` / `workspace-monocle-toggle` / i3 `Super+m` |
| REG | REG-monocle + REG-i3-super-m **C0 done**; Super+m free (zoom stays Enter) |
| Inventory | Lossy layout call-site list in completed task (used by C1) |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c0-kill-monocle.md) |
| Next | C1 **done** (above) |

```bash
npm test -- tests/unit/keybindings/ \
  tests/unit/shared/keybind-presets.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
```

### Shipped — CN6 launch + run / run-steps

| Field | Detail |
| --- | --- |
| CN6 | `launch` / `run` / `run-steps` → Node (`cli/launch*.mjs`, `run.mjs`, `run-steps.mjs`); Python shims |
| Jobs | PATH stays Python; worker `exec`s Node body (CN7 **skip** — flow in `cli/README.md`) |
| Partition | JS `partitionMixedSteps`; `layout_lib.partition_mixed_steps` deleted |
| Layout | Still Python `do_launch` / `run_mixed_steps` (not broken) |
| Task | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn6-launch-run-steps.md) |
| Guards | Vitest cli+run-steps 145; pytest cn6/cn5/layout_lib/job_runner/… 110 |

```bash
npm test -- tests/unit/cli/ tests/unit/extension/run-steps.test.js
python3 -m pytest tests/unit/cli/test_cn6_shim.py \
  tests/unit/cli/test_cn5_shim.py tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_layout_lib.py tests/unit/cli/test_job_runner.py -q
node cli/smoke-import.mjs
```

### Shipped — CN5 thin DBus verbs + install keybind parse fix

| Field | Detail |
| --- | --- |
| CN5 | `focus`/`swap`/`move`/`get`/`set`/`settings` → Node via `cli/cmd-result.mjs` + per-cmd `.mjs`; Python shims |
| Task | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn5-thin-dbus.md) |
| Install | `scripts/install.zsh` keybind status JSON one-liner missing `)` → fixed; kit shows `vim` |
| Live | `forge get tiling-mode-enabled` → ok/value true |
| Guards | Vitest cli 94; pytest CN5/shim/node_exec/class_eq 38 |

```bash
npm test -- tests/unit/cli/
python3 -m pytest tests/unit/cli/test_cn5_shim.py \
  tests/unit/cli/test_ping_tree_shim.py tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_forge_class_eq.py -q
forge get tiling-mode-enabled
```

### Shipped — TD1 strip reorder + R028 late-identity + R025/R026 live

| Field | Detail |
| --- | --- |
| TD1 | Code + nest live PASS on `gb280f94`: 3-tab reorder + peel→HSPLIT. Host pointer smoke not run (no xdotool; Shell.Eval off) |
| Task | [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| R028 (4) | Null class/title at map still slot-splits; nest + **host** PASS (left unit VSPLIT, mon still 2) on `b280f94` |
| Task | [forge-container-insert-a](./tasks/forge-container-insert-a.md) **done** |
| CN0–CN4 | scaffold · `node_exec` · `keybind` · `paths` · **dbus+ping+tree** — [completed/](./plans/forge-cli-node/completed/) |
| CN4 | `cli/dbus.mjs` via gdbus; Python ping/tree shims; live `forge ping` ok |
| R025/R026 | Host live PASS on tip `g4b2a374` (slot size + pin adopt) |
| Contracts | Strip reorder + D032 unknown-identity rows in [contracts.md](../docs/dev/contracts.md) |

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-insert-slot-split.test.js \
  tests/unit/extension/action-pipeline.test.js
node cli/smoke-import.mjs   # safe vim i3
python3 -m pytest tests/unit/cli/test_node_exec.py tests/unit/cli/test_job_runner.py -q
```

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
| R020 | D026 TILE slot authority — unsolicited max/Meta-fs/size → `_restoreTileToSlot` |
| Reveal | `wm.revealGroupChild({ keyboard, pin })` (D025) |
| Guards | L0 `drop-intent`, comprehensive CENTER both dirs, `bug-461-edge-snap`, `layout-sensors` restore |
| Residual | R019 host PASS. R020 nest EOS PASS post-AL8. R031/R032 shipped. Host tip logout optional |

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

**If you are Grok 4.5 / 4.6:** tip **`a63cdb0`** ships soft-enter chrome clear +
tab restack on clear + INFO logs. **Host Shell still g8ecb0f6 until logout.**
AL1–AL8 + R033–R036 code done. Do not redesign D036/D037. Never call `_layoutOp`.
Do **not** put `hasLayoutPh` back into `skipWindowStructure`.


| You can do | You must not |
| --- | --- |
| Logout → cold `forge layout dev` (R036 mon1 TABBED; mon0 no VSPLIT) | Personal `dev`/`t1` in live matrix |
| Logout → tall/wide LFT + launch (R033 eyes-on); drag mon0 tabs = full zones | GetTree poll twins of settle; Mode B as cold success |
| **Plan** tab D0 with high-reasoning model (spinner gate · cross-mon · TD triage) | Start tab **code** before tab planning locks |
| Promote from [IDEAS](./IDEAS.md) only with a real need | Dual-mon nest by default; reintroduce `skipWindowStructure \|\| hasLayoutPh` |

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **R036** host cold after logout (code shipped) | [task](./tasks/forge-layout-cold-apply-structure.md) |
| **plan first** | Tab work D0 (spinner residual · cross-mon · TD2–4) | [forge-tab-work-planning](./tasks/forge-tab-work-planning.md) |
| done | **R035** residual ensure_layout while layout PHs (mon1 flat tabs) | [completed](./tasks/completed/forge-layout-residual-tab-ensure.md) |
| done | **R033** open/launch LFT aspect → VSPLIT/HSPLIT | [completed](./tasks/completed/forge-r033-open-aspect-split.md) |
| done | R029/R030 green `layout dev` TILE + reuse | [completed](./tasks/completed/forge-layout-green-reuse-double.md) |
| done | TD1 strip reorder code + nest live | [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| done | R025 / R026 host live | [R025](./tasks/forge-tab-click-slot.md) · [R026](./tasks/forge-tab-click-pin-adopt.md) |
| done | R028 late-identity wrap nest + host | [task](./tasks/forge-container-insert-a.md) |
| done | CN0–CN6 | [completed/](./plans/forge-cli-node/completed/) |
| done | **R027** overlay until apply returns | [completed](./tasks/completed/forge-layout-chrome-until-ready.md) |
| done | Wave Z zoom (D030) host live PASS | [completed](./tasks/completed/forge-zoom-maximize.md) |
| done | **AL0–AL8** ApplyLayout | [plan](./plans/forge-layout-in-process.md) |
| done | **R032** tab-strip click dead (Done restack-only) | [completed](./tasks/completed/forge-tab-click-unresponsive.md) |
| done | **R031** float-border ghost | [completed](./tasks/completed/forge-float-border-ghost-tile.md) |
| done | R019 CENTER · R020 VLC EOS nest · IC4 skipped · FCC C0/C1 | HANDOFF / REGRESSIONS |
| later | Soft polish · L1 scale smoke · STACKED/resize | [PRIORITY](./PRIORITY.md) · [IDEAS](./IDEAS.md) |
| done | Wayland RC R013/R014 + nest isolation N1–N4 + lifecycle W1–W5 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | RC procedure (last run green) |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [forge-canonical-contracts.md](./plans/forge-canonical-contracts.md) | **P0** job→API catalog; IC1–IC3 |
| [docs/dev/contracts.md](../docs/dev/contracts.md) | Canonical APIs — extend these first |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete; optional residual) |
| [forge-tab-chrome-drag.md](./plans/forge-tab-chrome-drag.md) | TD1 done — [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| [forge-cli-node.md](./plans/forge-cli-node.md) | Node CLI CN0 done; CN1–CN6; no layout port |
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
