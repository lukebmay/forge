# Handoff — forge (lukebmay)

**Updated:** 2026-08-22 (queue #2–#5 shipped on master; logging still blocked)
**Branch:** **`master`** (default). Shipped: preflight · slot-id remap ·
oversized-frame learn · DnD FLOAT skip diagnostics.
**Sessions:** **Wayland** daily driver (Guake agent; tip loaded).
**Logging (P0, blocked):** journal = INFO/WARN/ERROR only; independent forge
file = TRACE…ERROR; plog **hooks** fan-out. Design:
`~/dev/me/shellrc/agents/blockers/B-plog-hooks-design.md`. Forge task:
[forge-log-level-retarget](./tasks/forge-log-level-retarget.md). Circle back
after shellrc hooks ship + vendor.
**No operator questions** unless critical new finding (prefs locked in tasks).
**Jobs:** `~/.local/share/forge/jobs/<id>/`.
**Host:** recreate vinyl on WS2 (dual-mon JSON); `min-tab-label-chars` 12 if
still 20. Logout once to load tip before eyes-on.
**Retest (FIRM):** **Nest is the code→reload loop.** Entry:
**`./scripts/forge/forge-test nested …`** (not user `forge`; not `forge test`).
Primary logout is **rare** (tip load only after nest already green). Default nest
**1 mon**; dual only when multi-mon is under test. Stale Guake `XAUTHORITY`
used to break nest; `resolve_host_xauthority` picks a live mutter cookie.
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.
**Jobs (shipped):** Mutating `forge` durable by default.
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.
**Nest design:** [D022](../docs/DECISIONS.md) · [isolation](./plans/forge-nested-isolation.md) ·
[nested under test](./plans/forge-nested-cli-separation.md) (**done**) ·
[user surface](./plans/forge-cli-user-surface.md) (**done** — `forge-test`).
**Repo tip:** OH1–OH3 observability + ws-orphan multi-ws/min-float/DnD grab on
`master`. Env floor unset → **256×144**. Probe stays deleted (D049).
**Next (FIRM order):** **human host verify** —
[blocker](./blockers/oh-ws-orphan-host-verify.md) (logout once for tip; fold
titlebar DnD + FLOAT skip log + vinyl WS2 recreate). Then **P0** monitor
identity + same-mon dock launch **with traces** —
[plan](./plans/forge-observability-hardening.md) § Downstream. Soft —
[tiny-env Nautilus](./blockers/d049-tiny-env-nautilus.md) (also oversized
frame learn eyes-on). Logging still blocked on shellrc hooks.
**Shipped this session:** layout preflight · slot-id late-adopt remap ·
oversized-frame min learn · DnD FLOAT grab skip diagnostics. Prior:
OH1–OH3 + [ws-orphan](./tasks/completed/forge-layout-ws-orphan-min-float-dnd.md).
**Install:** **logout once** for host Shell tip before eyes-on.
**Do not close** durable-agent ghostty windows.
**L0 last:** combined #2–#5 focused **291** vitest + preflight pytest **19**;
slot-id nest mon=2 `_forge-test-clean`+`_forge-test-ghosttys` **ok**
(`running: False`).
**Logging (OH1 done):** `third_party/pansi/` pinned (shellrc `3226f7c`);
GJS `plog-adapter` + `Logger` shim; Node CLI `cli/plog.mjs` (default warn;
`FORGE_LOG_LEVEL` / `FORGE_LOG_TEE` / `FORGE_LOG_FILE`). Schema baseline INFO;
**dev install sets DEBUG (5)**. TRACE=6 nuclear. Hot-path debug/trace peppered.
**Asserts (OH3 done):** `lib/shared/assert.js` — active `!production` or
log-level ≥ debug; failure = plog error + `assertionFailed` (**never throw**);
apply / DnD commit / launch insert skip.
**Types (OH2 done):** focused gate `npm run typecheck:oh2` (`tsconfig.check.json`);
root `tsconfig.json` stays loose (no full-tree boil). Escape: gi/pansi/`LayoutJson`.
**Host settings:** `preview-hint-enabled=true`, `mod-mask-mouse-tile=None`.
**Host seed:** `~/.config/forge/config/window-mins.json` has Nautilus 360×380.
**2026-08-17:** User `forge` hard-breaks `test`/`nested`. Nest/live =
`forge-test` (clone path; `./install --with-test-cli` opt-in).

### Shipped — DnD cold titlebar zones + min floor 256×144 (2026-08-20)

| Field | Detail |
| --- | --- |
| Bug | Titlebar drag: no drop zones until a tab peel; then titlebar worked |
| Root | `updateMetaPositionSize` used display focus, not `_draggedNodeWindow` (Wayland focus lag). Stage track armed before drag snapshot |
| Fix | Grab node = `_draggedNodeWindow` when `grabMode` set; snapshot before `_armGrabPointerTrack` |
| Mins | Unset `FORGE_MIN_TILE_*` → **256×144** (was 320×240) |
| L0 | **167** (min-tile + drop-intent + open-min + drag-drop + tab-drag) |
| Nest | mon=1 ping + `_forge-test-clean` **ok**; `running: False` |
| Host | **Logout once**; titlebar DnD before any tab peel |
| Task | [completed](./tasks/completed/forge-dnd-titlebar-focus-lag.md) |

### Active next

| Pri | Slice | Status | Note |
| --- | --- | --- | --- |
| **P0** | OH1 pansi/plog + logging | **done** | **4.6 high** · vendor+adapter+CLI+pepper · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh1-plog-logging.md) |
| **P0** | OH3 assertions (debug/trace) | **done** | **4.6 high** · log+flag, no throw · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh3-assertions.md) |
| **P0** | OH2 JSDoc + checkJs / no `any` | **done** | **4.5 high** · `typecheck:oh2` green · [completed](./plans/forge-observability-hardening/completed/forge-observability-hardening_oh2-typescript-checkjs.md) |
| done | ws-orphan multi-ws / min-float / DnD grab | done | [completed](./tasks/completed/forge-layout-ws-orphan-min-float-dnd.md) |
| done | layout profile preflight | done | [completed](./tasks/completed/forge-layout-profile-preflight.md) · refuse Guake-in-tiles; vinyl flat dual-mon warn |
| done | slot-id late-adopt hard-fail | done | [completed](./tasks/completed/forge-layout-vinyl-hardfail-slot-ids.md) · remap pins; nest mon=2 ok |
| done | oversized settled frame → learn | done | [completed](./plans/forge-min-size-floor/completed/forge-min-learn-oversized-frame.md) |
| done | DnD titlebar preview miss | done | [completed](./tasks/completed/forge-dnd-preview-miss-titlebar.md) · root=FLOAT after bad apply; skip log |
| soft | **Human host verify OH + tip** | open | [blocker](./blockers/oh-ws-orphan-host-verify.md) · logout; vinyl WS2; TILE DnD; FLOAT skip |
| P0 next | monitor identity + same-mon dock launch | ready | after host verify · [plan](./plans/forge-observability-hardening.md) § Downstream |
| soft | D049 tiny-env Nautilus (+ oversized learn) | open | [blocker](./blockers/d049-tiny-env-nautilus.md) |
| done | D049 M5 L0 + nest | done | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m5-verify.md) |
| done | **D049 M4** docs/contracts/DESIGN | done | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m4-docs.md) |
| done | D049 M3 overflow rehome + gap | done | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m3-overflow-rehome.md) · L0 **135** |
| done | D049 M1+M2 env floor + probe delete | done | [completed/](./plans/forge-min-size-floor/completed/) |
| optional | Host eyes-on tab-drag poll tip | tip load | After logout; or defer until D049 tip |
| later | CN14 / CN15 | after CN13 | nest/live harness; delete Python router |
| blocked | Ratio / autotile (yuiop) | hard blocker | [blocker](./blockers/resize-autotile-design.md) |

### Shipped — D049 M5 agent verify (L0 + nest)

| Field | Detail |
| --- | --- |
| L0 | min-tile + drop-intent + open-min + open-app + drag-drop + overflow-rehome **135** |
| Nest | mon=1 ping + `_forge-test-clean` **ok**; `running: False` |
| Probe journal | nest shell.log: **no** minProbe / `_forgeMinProb` |
| Host | tip installed; **logout once**; soft eyes-on [blocker](./blockers/d049-tiny-env-nautilus.md) |
| Task | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m5-verify.md) |

### Shipped — D049 M4 docs (env floor + learn + overflow; no probe)

| Field | Detail |
| --- | --- |
| Product docs | DESIGN / contracts / troubleshooting / DECISIONS match D049 L1–L8 |
| APIs named | `defaultMinTileSize` · `readWindowMinSize` · `noteWindowMinFromClamp` · overflow rehome |
| Forbidden | Shrink-probe / `ensureWindowMinSizeKnown` / fail-open “unknown mins” as product |
| Paths | `docs/DESIGN.md` · `docs/dev/contracts.md` · `docs/user/troubleshooting.md` · comments |
| Task | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m4-docs.md) |
| Next | **M5** nest/host tiny-env Nautilus prove |

### Shipped — D049 M3 mid-session overflow rehome

| Field | Detail |
| --- | --- |
| Product | TILE slot too small for mins → same-mon tab BFS → else float; vacated gap collapsed |
| APIs | `slotOverflowsMins` · `resolveTileOverflowPlacement` · `wm.rehomeIfSlotTooSmall` |
| D026 | Mins overflow **instead of** `_restoreTileToSlot`; max/fs/zoom still restore |
| Skip | ApplyEpoch · GRAB_TILE · fullscreen/maximized · zoom |
| Debounce | SourceBag `overflowRehome:<id>` |
| Paths | `open-min-place.js` · `window.js` · contracts mid-session + D026 rows |
| L0 | open-min + min-tile + drop + open-app + drag-drop + overflow-rehome **135** |
| Nest | not run (unit) |
| Task | [completed](./plans/forge-min-size-floor/completed/forge-min-size-floor_m3-overflow-rehome.md) |

### Shipped — D049 M1+M2 env floor + shrink-probe delete

| Field | Detail |
| --- | --- |
| Product | Always-on env floor **320×240** (`FORGE_MIN_TILE_WIDTH`/`HEIGHT`); no gsettings |
| API | `defaultMinTileSize` (`lib/shared/min-tile-size.js`); `readWindowMinSize` = hints∪known∪class∪**floor** |
| Deleted | All shrink-probe (`ensureWindowMinSizeKnown` + queue/cancel/abort + `_forgeMinProb*`) |
| Keep | Passive `noteWindowMinFromClamp` / class `window-mins.json`; DnD red zones; open-min BFS/float |
| Paths | `min-tile-size.js` · `tree-layout.js` · `window.js` · `drag-drop.js` |
| L0 | min-tile + drop-intent + open-min + open-app-policy + drag-drop **120** |
| Nest | not required (unit + dead-code) |
| Tasks | [M1](./plans/forge-min-size-floor/completed/forge-min-size-floor_m1-env-floor.md) · [M2](./plans/forge-min-size-floor/completed/forge-min-size-floor_m2-excise-probe.md) |

### Shipped — Tab-drag poll starve (chip lag / stuck release)

| Field | Detail |
| --- | --- |
| Bugs | Fresh Wayland: 1st tab DnD OK; 2nd/3rd chip far behind pointer; stayed dragging after release |
| Root | 8 ms `tabDragPointer` + DEBUG SourceBag set/fire/replace (+ failsafe) starved main loop |
| Fix | SourceBag routine logs → TRACE; poll skip when xy synced; poll primary-up → finish |
| Owner | Still only `DragDropManager` (tree press-arm; stage capture + poll) |
| Paths | `sources.js` · `drag-drop.js` · contracts |
| L0 | tab-drag + sources + DnD **197** |
| Nest | mon=1 `_forge-test-clean` **ok**; `running: False` |
| Host | **Logout once**; then `layout dev` → Nautilus → peel tab repeatedly |
| Task | [completed](./tasks/completed/forge-tab-drag-poll-starve.md) |

### Shipped — DnD min-probe grab fight

> **Superseded by D049:** shrink-probe APIs deleted; product is env floor + passive learn.

| Field | Detail |
| --- | --- |
| Bugs | After layout+Nautilus: tab stuck / no zones; titlebar DnD dead; wrong tile sizes; recovered later in-session |
| Root | Grab-end flushed dest shrink probes; Chrome never learns → forever-retry raced tile/`move()` |
| Fix (historical) | `_cancelMinSizeProbes` on grab-begin; no mid-drag dest queue; grab-end dragged-only delayed; `_forgeMinProbeGaveUp` |
| Paths | `window.js` · `drag-drop.js` · contracts/DESIGN |
| L0 | drag-drop (+drop-intent/open-min/open-app) **116** |
| Nest | mon=1 `_forge-test-clean` **ok**; `running: False` |
| Host | **Logout once**; then `layout dev` → Nautilus → titlebar+tab DnD |
| Task | [completed](./tasks/completed/forge-dnd-minprobe-grab-fight.md) |

### Shipped — Open-min / DnD cold Wayland

> **Superseded by D049** for probe/persist path: env floor always; passive learn only; no post-open/grab probe. Titlebar stage paint + `window-mins.json` **kept**.

| Field | Detail |
| --- | --- |
| Bugs | Fresh Wayland: dock Nautilus kept splitting (mins unknown); titlebar DnD dead until tab peel (probe mid-grab + no stage paint); false reds (premature learn of prior frame) |
| Fix (historical) | No min probe during MOVING grab (queue after); titlebar `_armGrabPointerTrack` → `_handleMoving`; durable `window-mins.json` + post-open probe; clamp learn skips glued-to-prior; ratchet-down on accept |
| Paths | `drag-drop.js` · `window.js` · `tree-layout.js` · contracts/DESIGN |
| L0 | drop-intent + open-min + open-app-policy + drag-drop **112** |
| Nest | mon=1 `_forge-test-clean` **ok**; `running: False` |
| Host | **Logout once** for tip; then titlebar DnD before any tab; dock Nautilus ×N onto short/tall LFT |
| Task | [completed](./tasks/completed/forge-open-min-dnd-cold-wayland.md) |

### Shipped — Free open min → tab walk → float

> **Policy kept (D049).** Residual “fail-open until class floor” is **obsolete** — env floor always applies.

| Field | Detail |
| --- | --- |
| Product | Free open: illegal split → BFS same-mon tab → else float override |
| Scope | Dock / forge launch / focus LFT; **not** PlaceNext pins; **not** DnD |
| Pure | `open-min-place.js` `resolveOpenMinPlacement` + BFS candidates |
| Wire | `trackWindow` + `_rehomeAttachAfterMonLft`; tiny-pane QoL unchanged |
| L0 | open-min-place + open-app-policy (+ drop-intent/lft-mru) **123** |
| Task | [completed](./tasks/completed/forge-open-min-tab-walk-float.md) |

### Shipped — R039/R040/R041 + quiet layout

| Field | Detail |
| --- | --- |
| R040 | Node job `.isatty()` vs `.isTTY` → no `FORGE_COLOR=always` |
| R039 | Bare splits (no `share[]`) skipped `ensure_sizes` → enlarge stuck |
| R041 | Wayland install disable→enable restored **stale** open leaf (YouTube→Voice) |
| Quiet | `forge layout` default = `forge layout: ok`; `-v` for phase trace |
| Fix | streamIsTTY; equal sizeActions; flush session-layout before disable (`force:true`) |
| L0 | job-runner · layout-plan R039 · layout_apply_client quiet · install flush-before-disable |
| Live | PTY install colors; nest equal sizes; host: install must keep visible tab |
| Residual | **Logout once** if host ApplyLayout tip still pre-R039 |
| Task | [completed](./tasks/completed/forge-install-color-layout-size.md) · R039–R041 |

### Shipped — DnD min-size red zones (Wayland)

> **Red zones kept (D049).** Mins input **superseded**: env floor ∪ passive learn ∪ class `window-mins.json` — **no** `ensureWindowMinSizeKnown` probe.

| Field | Detail |
| --- | --- |
| Product | Per-zone red preview when drop would shrink any involved app below min; HSPLIT / VSPLIT / TAB independent; refuse commit |
| Wayland mins (historical) | No `get_size_hints`/`get_min_size` on Mutter 14 → learn from clamp + grab probe + `wm_class` floor |
| Fix (historical) | Learn on forge-caused size signals; `_scheduleMinClampLearn`; probe restore must not re-poison known mins |
| Nest | Nautilus class floor → **360×380**; 800×600 target → VSPLIT overflow, HSPLIT/TAB OK |
| L0 | drop-intent + drag-drop **54** |
| Tasks | [gate](./tasks/completed/forge-dnd-minsize-gate-titlebar.md) · [red zones](./tasks/completed/forge-dnd-minsize-red-zones-wayland.md) |
| Residual | **Logout once** for host tip; then drag Nautilus onto a short pane’s TOP/BOTTOM (red) vs LEFT/RIGHT/CENTER (not red) |

### Shipped — DnD min-size gate + palette (earlier)

| Field | Detail |
| --- | --- |
| Product intent | Invalid drop preview + refuse; keybind skip; Luke palette; titlebar peel |
| In tree | `dropWouldOverflowMins` / wiring / `.window-tilepreview-invalid` / live-pointer preference |
| Follow-up | Red zones live — see above |

### Shipped — tab-drag event owner (fast leave-behind)

| Field | Detail |
| --- | --- |
| Bug | Fast drag left chip behind; dual tree actor + stage handlers |
| Fix | `DragDropManager` only: stage `captured-event` (STOP) + `tabDragPointer` poll; tree press→`armTabDrag` only |
| L0 | tab-drag + press-arm + strip-reorder + comprehensive DnD **152** |
| Nest | ping + `_forge-test-clean` **ok**; `running: False` |
| Docs | contracts row “Tab drag pointer events” |
| Task | [completed](./tasks/completed/forge-tab-drag-event-owner.md) |
| Residual | Host Wayland **logout** once for tip desk feel |

### Shipped — R038 layout share bare-array lift

| Field | Detail |
| --- | --- |
| Bug | Gray `tiles:[{hsplit,share}]` nested under mon0 `s0`; green mon-keyed OK |
| Fix | Desugar lifts sole mon-body `[{hsplit\|vsplit}]` to mon-level (JS+Python) |
| L0 | TestShareSugar gray fixture; layout_* **363**; normalize vitest **66** |
| Nest | `_forge-test-share-gray` bare share → **0.691/0.309**; stopped |
| Live | Gray mon-keyed rewrite + apply **ok**; green **0.687/0.313** still |
| REG | [R038](./REGRESSIONS.md) |
| Task | [completed](./tasks/completed/forge-layout-share-restore-green-gray.md) |
| Residual | Host Wayland logout to load dirty tip for bare-array ApplyLayout on gray/black host Shell |

### Shipped — CN13 Node PATH `forge`

| Field | Detail |
| --- | --- |
| PATH | `~/.local/bin/forge` → `$repo/cli/forge.mjs` (one entry) |
| Jobs | `cli/job-runner.mjs`; worker argv `[node, cli/forge.mjs, …cleaned]` |
| Leftover Python | spawn `scripts/forge/forge` (`layout`, install family, `jobs`, `thrash`, help) |
| D045 | Nest/live still **`forge-test` only**; `forge test`/`nested` exit 2 |
| L0 | Vitest cli **169**; pytest job_runner/node_exec/install_safe **56** |
| Live | `forge ping` ok; `forge layout list` ok; ours-detect true; foreign refused |
| Residual | Node O_EXCL vs Python `fcntl` on same mutator.lock if `python3 scripts/forge/forge layout` runs beside a Node job — PATH `forge` safe (`FORGE_JOB=0` on leftover spawn) |
| Task | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn13-path-entry.md) |
| Next | optional CN14/CN15 |

### Shipped — PR7 tab click-drag docs (D046)

| Field | Detail |
| --- | --- |
| Docs | contracts · actions · DESIGN · layouts · troubleshooting · keybindings TD4 |
| Decision | **D046** Chrome live tab strip DnD |
| Plan | TD4 done via PR7 (`forge-tab-chrome-drag.md`) |
| Code | none (docs only) |
| Task | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr7-docs.md) |

### Shipped — P3 strip `_layoutOp` flatten (REG-ensure-flatten)

| Field | Detail |
| --- | --- |
| API | `_layoutOp` TABBED/STACKED: lift focus to mon then wrap, or `ensure-flatten-refused` |
| Deleted | `_flattenLayoutParentToWindows` |
| REG | REG-ensure-flatten **dropped** (FCC plan + DESIGN + contracts) |
| L0 | tz-tab + set-layout-i1 + layout-cycle + layout-apply-structure + CommandHandler **123** |
| Nest | not required; `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_p3-strip-layoutop-flatten.md) |

### Shipped — FCC C5 kits/docs/DESIGN

| Field | Detail |
| --- | --- |
| Docs | `keybindings.md` (no Unfocus; show-all; R2 Resize≠Size); `layouts.md` RunSteps + focus/move parent |
| DESIGN | Wave C (+R1) **shipped** through C5; zoom/float later |
| Kits | unchanged — already matched presets; no Super+m/+f → zoom |
| REG | ensure-flatten P3 done; expand-dual-axis R2 docs done; i3-super-f still Z |
| L0 | keybind-presets **37** + Keybindings **55** = **92** |
| Nest | not required; `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c5-kits-docs.md) |

### Verify — fresh Wayland session (2026-08-18)

Guake agent; tip `…-gdf07302`; `can_true_cold` / `can_nested` true.

| Layer | Result |
| --- | --- |
| Host L2 true-cold | `L2.true-cold-dev` + `L2.layout-clean` **PASS** → `agents/test-results/wayland/black-wayland-20260818T073850Z.json` |
| L0 pytest | nested_wayland + layout_apply + live_matrix **170** |
| L0 vitest | C4-touched **156**; C5 presets/keybindings **92** |
| Nest mon=1 | ping + `_forge-test-clean` **PASS** |
| Nest mon=2 | `_forge-test-ghosttys` verify match **PASS** |
| Nest status | `running: False` |

### Shipped — FCC C4 move + focus parent

| Field | Detail |
| --- | --- |
| API | `tree.focusParent` / `focusChild` / `moveIn` / `moveOut` + `focusUnit` |
| Focus | Elevate/descend unit; leaf via `revealGroupChild` / `afterFocus` |
| Move | Layout unit → sibling CON / out to grandparent; D044 normalize on tab dest |
| Command | `FocusParent` / `FocusChild` / `WindowMoveIn` / `WindowMoveOut` |
| RunSteps | `focus-parent` / `focus-child` / `move-in` / `move-out` |
| Keys | i3/Vim `Super+a` / `Shift+Super+a`; move `,` family; Safe `Ctrl+Super+a`/`,` |
| L0 | move-focus-parent-c4 **12**; touched suite **244** |
| Nest | skipped (unit); `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c4-move-focus-parent.md) |

### Shipped — FCC C3 split chrome (I5)

| Field | Detail |
| --- | --- |
| API | `resolveSplitChromeMode` · `collectSplitAncestry` · `splitChromeForWindow` (`split-chrome.js`) |
| Paint | existing `.window-split-border` on tiled leaves under qualifying H/V |
| Modes | focus-ancestry (default); `split-chrome-show-all`; grab `setSplitChromeForceShowAll` |
| Toggle | `SplitChromeShowAllToggle` / kbd unbound; prefs Appearance switch |
| L0 | touched **219** (I5 pure 8 + decoration/borders/commands/keybinds/…) |
| Nest | skipped (unit); `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c3-split-chrome.md) |

### Shipped — FCC R1 owning-split resize (I3)

| Field | Detail |
| --- | --- |
| API | `tree.layoutUnit` · `tree.resolveOwningSplit` · `wm.applyOwningSplit` |
| Grab | `_handleResizing` → resolver + `_applyOwningSplitFromGrab` (cumulative) |
| Expand | two `applyOwningSplit` calls (H then V; REG-expand-dual-axis) |
| Keyboard | `WindowResize*` → `wm.resize` grab → same `_handleResizing` resolver |
| L0 | owning-split-i3 **13**; touched resize/command **180** total |
| Nest | not required; `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_r1-owning-split-resize.md) |

### Shipped — FCC C2 group/ungroup (I2)

| Field | Detail |
| --- | --- |
| API | `tree.group` → `mergeWindowsIntoGroup`; `tree.ungroup` dissolves one CON |
| Command | `WindowMergeGroup` → `group`; `WindowUngroup` + `window-ungroup` (`Ctrl+Shift+Super+m`) |
| RunSteps | `merge-group` + alias `group`; `ungroup` |
| REG-auto-exit-tabbed | **kept** (single-child chrome exit, not multi-child flatten) |
| L0 | ungroup-i2 + C1/ops/command/session/run-steps **210** (orch recheck) |
| Nest | not required; `running: False` |
| Task | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c2-group-ungroup.md) |

**Do not reopen** PR10/PR12/PR13/PR15 tab-drag ownership unless new host repro.
[IDEAS](./IDEAS.md) parked.



**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

### Shipped — D044 same-mon TABBED/STACKED

| Field | Detail |
| --- | --- |
| Product | TABBED/STACKED CON is mon-local; no spanning chrome |
| APIs | `tree.groupHomeMonitor` · `wm.normalizeGroupToHomeMonitor` · merge rehome+join |
| Paths | `tree.js` · `window.js` · `command.js` · `session-api.js` · `drag-drop.js` |
| L0 | tree ops + DnD + normalize + LX3 + H1 **159** green |
| Nest | not required (structure unit-proven) |
| Task | [completed](./tasks/completed/forge-tab-groups-same-mon.md) |
| Do not | Auto-peel on mix; Meta `sameParentMonitor` as home; profile span sugar |

### Shipped — SM1–SM7 slot machines

| Field | Detail |
| --- | --- |
| Locked | Slot **not** window; hard = **in-slot**; `Done.ok` = required forest match; belt **deleted** (SM6/D042); overlay = all-hard (SM7); group chrome A = existing CON strip |
| Decisions | [D039–D044](../docs/DECISIONS.md) · [plan](./plans/forge-layout-slot-machines.md) |
| Bags | `layout-apply-epoch.js` · `layout-apply-slot.js` · settle in-slot/forest-match · open-into-slot dest |
| Tasks | [completed/](./plans/forge-layout-slot-machines/completed/) SM1–SM7 |
| L0 | Combined SM suite **235** green |
| Nest | mon=1 clean **PASS**; mon=2 ghosttys **PASS** (re-apply after clean) |
| Host cold | **PASS** 2026-08-16 — see R036 shipped below |
| Next | Queue open (FCC C4 / R1 / C3) |
| Do not | Restore belt; Mode B as cold success; spanning tab chrome; overlay before all-hard |

### Shipped — R036 cold host SEGV + forest match

| Field | Detail |
| --- | --- |
| Host deaths (pre-fix) | Jobs `…-f380d0` + `…-af18e4` (`layout dev` → NoReply / session death) |
| Stack | `trackWindow` → PlaceNext sticky **move:true** → `move_to_monitor` SEGV on null chrome |
| Fix | No map-time PlaceNext Meta move; late tree + **idle** move; loading titles not ready; place-hint INFO |
| L0 | place-hint + open-app-policy + layout-cycle + apply-run **128** green |
| Nest | mon=1 clean PASS; mon=2 ghosttys PASS (sticky **move=false** + late idle) |
| Host cold | `forge layout dev` **ok** · open 7/7 · verify match · chrome clear **all-hard** |
| Host tree | mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice) |
| Task | [completed](./tasks/completed/forge-layout-cold-host-verify.md) · [R036](./REGRESSIONS.md) |

```bash
# Nest prove (code loop):
./install --kit=vim
forge test nested --monitors=1 run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
forge test nested --monitors=2 start --replace
forge test nested exec -- env FORGE_JOB=0 forge layout _forge-test-ghosttys
rg 'place-hint' ~/.local/state/forge/nested/forge/shell.log | tail -40
forge test nested stop
# Host cold (tip already loaded):
forge layout dev && forge tree
```

### Shipped — spinner chrome clear at soft-enter + tab restack

| Field | Detail |
| --- | --- |
| Symptom | Spinner stays long; tab click often fails to activate app |
| Fix | Clear chrome at **soft-enter** (before quiet). Restack strips on chrome clear |
| Host mid | Soft quiet logs `chrome cleared`; mid layout ok on tip `g0a8e4a8` this session |
| Residual | **Superseded by D043/SM7:** overlay now dies at **all-hard**, not soft-enter. Tab D0: no extra chrome implement unless leftover actor after `all-hard` |

```bash
journalctl --user -b --no-pager | rg 'Forge.*(chrome|soft-enter|restack|_activateFromTab)' | tail -40
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
forge test nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
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
forge test nested start --replace
forge test nested exec -- forge ping   # apiVersion 10
forge test nested exec -- env FORGE_JOB=0 forge layout _forge-test-clean
# also: forge test nested exec -- env FORGE_JOB=0 forge layout _forge-test-ghosttys
forge test nested stop
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
| Nest | **Not run** — retest: `forge test nested run --monitors=1 -- …` after install |
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
# forge test nested run --monitors=1 -- forge ping
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
| Nest | **Not run** — retest: `forge test nested run --monitors=1 -- …` after install |
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
# forge test nested run --monitors=1 -- forge ping
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
| Nest | **Not run** — retest: `forge test nested run --monitors=1 -- …` after install |
| Task | [AL5](./plans/forge-layout-in-process/completed/forge-layout-in-process_al5-executor-structure.md) |
| Next | **AL7 done** → **AL8** |

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js
# After commit + nest/host load tip:
# forge test nested run --monitors=1 -- forge ping
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
# When nest works: ./install --kit=vim && forge test nested run -- forge ping  # apiVersion 10
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
| Residual | `_layoutOp` peel **dropped** (P3); lift/refuse parity with structure op |
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
| Related | Cross-mon tabs **D044** (unsupported product): [same-mon](./tasks/forge-tab-groups-same-mon.md) |

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Cold / apply execution | **D040:** ApplyEpoch → materialize forest → slot machines → forest-match `Done.ok` → focus/soft → release epoch. Old phase names may remain as logs |
| Slot vs window | A slot is a TILE window **or** one TABBED/STACKED CON. Parallel only across independent slots |
| Hard-ready | **In-slot** (TILE\|grab + desired mon + parent CON + ε). Timeout retries place (N=2). TILE-anywhere is not ready |
| `Done.ok` | Required forest match (D041). Hard-failed → `ok: false`; peers still finish. No best-effort `ok` |
| Soft residual (D019) | **Product** — Meta has no settle ACK; learned quiet + correct-on-miss. Not a bug class. |
| Mode B as cold success | **Forbidden** — Mode B = true mid-session chaos only |
| Belt after bind | **D014 superseded.** Not product. Delete leftover code in SM6 (D042) |
| Profiles | Data only — no personal-layout product branches |
| Child list (D023) | `Node.appendChild` / `insertBefore` / `removeChild` / `replaceChildren` only |
| Job → API (D024–D026) | [contracts.md](../docs/dev/contracts.md) — extend the named API; no one-off twins |
| CLI language (D036) | Node under `cli/`; PATH `cli/forge.mjs` (CN13); leftover Python via spawn; `lib/shared/` gi-free; **no** layout port to `cli/` |
| User CLI (D045) | `forge` product-only; nest/live = `./scripts/forge/forge-test`; normal install does not ship `forge-test` |
| Layout rearch (D037–D043) | ApplyLayout in-process **done**. Slot machines **locked**. IC4 skip |
| Insert / same-axis edge (D032) | Slot-split the focused/target unit when H/V parent already has siblings — never even 3rd sibling. Join leftover 1-child H/V as the slot (R028). Orientation from slot rect |
| TABBED/STACKED mon (D044) | Mon-local. Mixed members rehome to CON MONITOR ancestor (keep group). Join = move-then-join onto dest. One-tab mon-move peels that leaf. No span chrome |
| Overlay (D043) | Dies at all-hard (or cancel/error). Soft does not keep it. Existing CON strip is group chrome A |
| Focus | Post-settle phase; open-leaf pin on steal (D018); user reveal adopts the pin (R026) |
| Unfocus key (`Ctrl+Super+Esc`) | **Abandoned** — not product; keybind unbound |
| Close → focus | **Kept** (FC1) — LFT/sibling restore |
| CLI jobs | Durable mutators (D021) |
| Wayland retest | Prefer `./scripts/forge/forge-test nested run` (or `restart`+stop); never logout loops for JS |
| Nest purpose (D022) | Code/test loop only (avoid logout); no-code smokes on **host** |
| Nest mon count | **Default 1.** `--monitors=N` only when testing multi-mon behavior |
| Nest mon size | Default size policy may shrink later; dual: each dummy ≈ primary logical historically |
| Nest after tests | **FIRM** — prefer `./scripts/forge/forge-test nested run` (always stops); interactive → `stop` |
| Nest isolation v1 | `FORGE_HOST=…-sub-…` + `FORGE_CONFIG_HOME` on CLI **and** nest Shell (N1/N2); extension `forgeConfigHome()`; shared layout profiles + install UUID OK; **no** UNIX test user |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

Lifecycle: prefer **owned bags** (sources/signals/lifetime/attach) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

**Next / active:** **human host verify** —
[blocker](./blockers/oh-ws-orphan-host-verify.md) (logout for tip; multi-ws +
mins + TILE titlebar DnD + FLOAT skip log). Recreate **vinyl** dual-mon on
WS2. Agents (after verify or soft-parallel): **P0** monitor identity +
same-mon dock launch **with debug/trace** —
[plan](./plans/forge-observability-hardening.md) § Downstream. Soft D049
tiny-env (+ oversized learn eyes-on) —
[blocker](./blockers/d049-tiny-env-nautilus.md). Logging still blocked on
shellrc plog hooks. Optional later: CN14/CN15; yuiop blocked. See
[IDEAS](./IDEAS.md).

**Proven this session on `master`:** layout preflight · slot-id late-adopt
remap · oversized-frame learn · DnD FLOAT skip diagnostics. L0 **291** +
pytest **19**. Nest mon=2 clean+ghosttys ok (slot-id). Prior wrap: OH1–OH3 +
ws-orphan.

**FCC Wave C (+R1/R2-docs) closed through C5; P3 done; PR7/D046 done; Wave Z0/Z1
shipped.** Tab-drag poll starve shipped. **Do not** reintroduce shrink-probe.

Do not reshape PR1 attach, PR5 2D/wrap-on, PR10 peel synthetic,
PR11/PR12 mid-drag pack, PR13 chip+event coords, or PR15 residual
locks. Preserve PR9 foreign spacer-only.
Do **not** re-litigate D039–D044. Do **not** teach `forge test` / top-level
`forge nested`. Do **not** close durable-agent ghostty windows.

Queue: [PRIORITY](./PRIORITY.md). Later/ideas: [IDEAS](./IDEAS.md).

User toggles / `_layoutOp` must not peel nested CONs (`setLayout` /
lift+refuse). Do **not** put `hasLayoutPh` back into `skipWindowStructure`.
Do **not** reintroduce `_flattenLayoutParentToWindows`.

**Locked (D039–D044):** slot machines (not per-window); hard = in-slot retry;
`Done.ok` = required forest match; ApplyEpoch home authority; open into slot;
overlay through all-hard; belt deleted; group chrome A is existing CON strip;
TABBED/STACKED is mon-local (`groupHomeMonitor` + `normalizeGroupToHomeMonitor`).

| You can do | You must not |
| --- | --- |
| CN14/CN15 when asked; nest for JS retest | Redesign D039–D044; restack latch; hit plates |
| Nest (`./scripts/forge/forge-test nested`, mon=1) | `forge test` / top-level `forge nested`; personal `dev`/`t1` in matrix; Mode B as cold success |
| Promote from IDEAS only with need | Re-queue pruned hygiene rows; close agent ghosttys |
| | Second chrome system; reopen peel ownership; reopen C4 APIs; silent flatten |

| Pri | Work | Path |
| --- | --- | --- |
| done | CN13 Node PATH `forge` | [completed](./plans/forge-cli-node/completed/forge-cli-node_cn13-path-entry.md) |
| blocked | Ratio / autotile (yuiop) | [blocker](./blockers/resize-autotile-design.md) |
| done | Tab click-drag **PR7** docs | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr7-docs.md) · D046 |
| done | P3 strip `_layoutOp` flatten | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_p3-strip-layoutop-flatten.md) |
| done | FCC **C5** kits/docs | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c5-kits-docs.md) |
| done | FCC **C4** move + focus parent | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c4-move-focus-parent.md) |
| done | FCC **C3** split chrome | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c3-split-chrome.md) |
| done | FCC **R1** owning-split resize | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_r1-owning-split-resize.md) |
| done | FCC **C2** group/ungroup | [completed](./plans/forge-first-class-containers/completed/forge-first-class-containers_c2-group-ungroup.md) |
| done | Tab **PR15** host residual lock | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr15-host-residual-lock.md) |
| done | Tab **PR14** cross-mon / foreign prove | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr14-crossmon-prove.md) |
| done | Tab **PR13** peel chip + event coords | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr13-peel-pointer-coords.md) |
| done | Tab **PR12** one layout owner | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr12-one-layout-owner.md) |
| done | Tab **PR11** mid-drag gap + remaining equal-fill | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr11-mid-drag-gap-equalize.md) |
| done | Tab **PR10** peel slot place + cross-mon | [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr10-peel-slot-crossmon.md) |
| done | User CLI: no test/dev toolkit | [plan](./plans/forge-cli-user-surface.md) |
| done | PR5–PR9 (chip/peel/foreign partial) | [completed/](./plans/forge-tab-click-drag/completed/) |
| done | Tab click-drag PR1–PR4 | [completed/](./plans/forge-tab-click-drag/completed/) |
| done | Nested off top-level CLI | [plan](./plans/forge-nested-cli-separation.md) |
| done | Tab chrome layer (PR1) | [task](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr1-chrome-layer.md) |
| done | Same-mon TABBED/STACKED (D044) | [completed](./tasks/completed/forge-tab-groups-same-mon.md) |
| done | Tab work D0 lock | [completed](./tasks/completed/forge-tab-work-planning.md) |
| done | **R036** nest multi-open + host cold | [completed](./tasks/completed/forge-layout-cold-host-verify.md) |
| done | **SM1–SM7** slot machines implement | [completed/](./plans/forge-layout-slot-machines/completed/) |
| done | **R035** residual ensure_layout while layout PHs (mon1 flat tabs) | [completed](./tasks/completed/forge-layout-residual-tab-ensure.md) |
| done | **R033** open/launch LFT aspect → VSPLIT/HSPLIT | [completed](./tasks/completed/forge-r033-open-aspect-split.md) |
| done | R029/R030 green `layout dev` TILE + reuse | [completed](./tasks/completed/forge-layout-green-reuse-double.md) |
| done | TD1 strip reorder · TD2/TD3 skip | [completed](./plans/forge-tab-chrome-drag/completed/forge-tab-chrome-drag_td1-strip-reorder.md) |
| done | R025 / R026 host live | [R025](./tasks/forge-tab-click-slot.md) · [R026](./tasks/forge-tab-click-pin-adopt.md) |
| done | R028 late-identity wrap nest + host | [task](./tasks/forge-container-insert-a.md) |
| done | CN0–CN6 | [completed/](./plans/forge-cli-node/completed/) |
| done | **R027** overlay until apply returns | [completed](./tasks/completed/forge-layout-chrome-until-ready.md) |
| done | Wave Z zoom (D030) host live PASS | [completed](./tasks/completed/forge-zoom-maximize.md) |
| done | **AL0–AL8** ApplyLayout | [plan](./plans/forge-layout-in-process.md) |
| done | **R032** tab-strip click dead (Done restack-only) | [completed](./tasks/completed/forge-tab-click-unresponsive.md) |
| done | **R031** float-border ghost | [completed](./tasks/completed/forge-float-border-ghost-tile.md) |
| done | R019 CENTER · R020 VLC EOS nest · IC4 skipped · FCC C0/C1 | HANDOFF / REGRESSIONS |
| done | Wayland RC R013/R014 + nest isolation N1–N4 + lifecycle W1–W5 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | RC procedure (last run green) |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [forge-nested-cli-separation.md](./plans/forge-nested-cli-separation.md) | Nested off top-level (superseded by user surface) |
| [forge-cli-user-surface.md](./plans/forge-cli-user-surface.md) | User `forge` product-only; nest/live = `forge-test` (**done**) |
| [forge-canonical-contracts.md](./plans/forge-canonical-contracts.md) | **P0** job→API catalog; IC1–IC3 |
| [docs/dev/contracts.md](../docs/dev/contracts.md) | Canonical APIs — extend these first |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete; optional residual) |
| [forge-tab-click-drag.md](./plans/forge-tab-click-drag.md) | Click-drag design; PR1 shipped |
| [forge-tab-chrome-drag.md](./plans/forge-tab-chrome-drag.md) | TD1 done; TD2/TD3 skip; TD4 done via PR7 |
| [forge-cli-node.md](./plans/forge-cli-node.md) | Node CLI CN0–CN6 + **CN13 PATH**; CN14/CN15 later; no layout port |
| [forge-layout-in-process.md](./plans/forge-layout-in-process.md) | ApplyLayout AL0–AL8 **done** |
| [forge-layout-slot-machines.md](./plans/forge-layout-slot-machines.md) | **P0** SM0 locked · SM1–SM7 implement **done** |
| [forge-layout-settle-contract.md](./plans/forge-layout-settle-contract.md) | D019 baseline; timeout-continue → D040 |

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
./install && ./scripts/forge/forge-test nested run --monitors=2 -- ./scripts/forge/forge-test live run --tags R015
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
`…/forge-config`, not parent `~/.config/forge`. Prefer `./scripts/forge/forge-test nested run` for campaigns.
Shared intentionally: install UUID, layout profiles, gsettings.

### Wayland RC (cleared 2026-08-10)

Procedure: [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) ·
process: [testing.md](./testing.md) § Wayland.

| Rule | Detail |
| --- | --- |
| Host first | L1 / dual-mon open-leaf / chrome RC authority on **host** desk |
| Layouts | **`_forge-test-*` only** — never personal `dev` / `t1` |
| Nest | Code→reload or multi-mon structure only; default **mon=1** |
| Campaign entry | `./scripts/forge/forge-test nested run -- …` (always stops); dual: `--monitors=2` only when needed |
| Isolation | Nest CLI+Shell use nest `forge-config`; parent `~/.config/forge` not rewritten |
| Results | `agents/test-results/wayland/<host>-wayland-<UTC>.json` |
| Wrap-up | `./scripts/forge/forge-test nested status` → `running: False` |

```bash
echo "$XDG_SESSION_TYPE"          # wayland
./scripts/forge/forge-test live probe             # can_nested / can_retest
# L0
python3 -m pytest tests/unit/cli/test_layout_apply.py \
  tests/unit/cli/test_live_matrix.py tests/unit/cli/test_nested_wayland.py -q
# Host L1 / partial (no nest if no JS change)
./scripts/forge/forge-test live plan --from-work wayland-rc
# After extension JS change: ./install && ./scripts/forge/forge-test nested run -- …
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
./scripts/forge/forge-test nested run -- forge ping
./scripts/forge/forge-test nested status   # want: running: False

# Interactive multi-step still ends with:
./scripts/forge/forge-test nested stop
./scripts/forge/forge-test nested status   # want: running: False
```

**Prefer** `./scripts/forge/forge-test nested run -- …` for one-shot campaigns.
Use `exec` / `restart` only when the nest must stay up for multi-step work; **still stop** when done.
**Never** leave nest env on durable agent shells.
**Default** mon=1. Dual only: `--monitors=2` when testing dual-mon behavior.
Nest client + Shell env: `FORGE_HOST=…-sub-…`, `FORGE_CONFIG_HOME=<session>/forge-config` (N1/N2).

### Headless / true cold

Durable Grok leader (or Guake/float). After suites that close agent TILE: leader reopens ghostty; `grok -r`.

```bash
./scripts/forge/forge-test live probe
# L0 before expensive live
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
```

### Nested Wayland (process)

```bash
# Code changed → one-shot retest without logout (preferred):
./install && ./scripts/forge/forge-test nested run -- forge ping          # mon=1; auto stop
# Multi-mon behavior under test only:
./scripts/forge/forge-test nested run --monitors=2 -- forge tree
# Multi-step interactive:
./install && ./scripts/forge/forge-test nested restart
./scripts/forge/forge-test nested exec -- forge ping
./scripts/forge/forge-test nested stop                                   # FIRM
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
| Cross-mon TABBED/STACKED as product | **D044** — mon-local only |

---

## Doc map

| Doc | Role |
| --- | --- |
| [PRIORITY.md](./PRIORITY.md) | Queue |
| [tab D0](./tasks/forge-tab-work-planning.md) | Tab locks (done) |
| [same-mon](./tasks/forge-tab-groups-same-mon.md) | D044 implement |
| [nest isolation](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [contracts](../docs/dev/contracts.md) | Job → API (extend first) |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
