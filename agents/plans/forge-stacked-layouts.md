# Plan: STACKED layouts as a supported product path

**Status:** defaults + keybinds done — next SL5 live (ops, optional)  
**Updated:** 2026-07-28  

**Session note:** Live STACKED on black (Shell 46):

1. **Horizontal chrome** — `Compat.setBoxOrientation` (`.vertical` pre-48).
2. **Bar height** — pin `set_height(stackedHeight)`; no column `y_expand`. Scale:
   gdisplays 1.5 + X 2× fb; `dpi()`=St.scale_factor is correct once (not ×1.5 again).
3. **Stable labels** — `updateStackedFocus` no longer `appendChild`s focused to
   end (that shuffled chrome on every click). Raise + `lastTabFocus` only;
   `stackedFocusWindow()` for enter-stack focus.  
**Spike task:** [completed/forge-stacked-layouts_spike.md](./forge-stacked-layouts/completed/forge-stacked-layouts_spike.md)  
**SL0 task:** [completed/forge-stacked-layouts_sl0-docs-schema.md](./forge-stacked-layouts/completed/forge-stacked-layouts_sl0-docs-schema.md)  
**SL1 task:** [completed/forge-stacked-layouts_sl1-save-roundtrip.md](./forge-stacked-layouts/completed/forge-stacked-layouts_sl1-save-roundtrip.md)  
**SL3 task:** [completed/forge-stacked-layouts_sl3-thrash-parity.md](./forge-stacked-layouts/completed/forge-stacked-layouts_sl3-thrash-parity.md)  
**SL4 task:** [completed/forge-stacked-layouts_sl4-regression.md](./forge-stacked-layouts/completed/forge-stacked-layouts_sl4-regression.md)  
**Defaults/keybinds:** [completed/forge-stacked-layouts_defaults-keybinds.md](./forge-stacked-layouts/completed/forge-stacked-layouts_defaults-keybinds.md)

## Why

Daily-driver work intentionally preferred **TABBED** over **STACKED** (stack-off
default, DnD → tab). Some users still want i3-style stacked containers. Stacks
should be a deliberate, documented mode — not half-broken residue.

## Goals (draft)

1. **Clear opt-in** (recommended) or on-by-default — decide product default.
2. **Layout profiles** can express and round-trip `stacked` cells (tiles sugar + ensure).
3. **Keybinds / DnD / chrome** behave predictably for STACKED when mode is on.
4. **No thrash** with mon order, soft rehome, or session restore.
5. Docs: when to use stacked vs tabbed; defaults match schema.

## Non-goals (v1)

- Replacing tabbed as Luke’s personal default on black.
- Full i3 feature parity for every stack edge case.
- Flipping product default to stack-on for all installs without an explicit product call.

## Recommended product default

| Choice | Recommendation |
| --- | --- |
| **`stacked-tiling-mode-enabled`** | **`true`** — mode available; stack keybinds and STACKED profiles work |
| **`dnd-center-layout`** | Keep **`tabbed`** (default group type) |
| **`default-window-layout`** | Keep **`tiled`** (split) |
| **Layout sugar** | Bare arrays → **tabbed**; stacks → object form `{layout:stacked,content}` |

**Rationale (updated 2026-07-28)**

- Allow stacks without making them the ambient group type.
- Tab-first DnD / bare-array sugar stay tabbed so daily-driver thrash stays calm.
- Explicit product call: enable mode; keep tabbed as default container/group.

---

## Spike inventory (2026-07-28)

### 1. Settings / defaults

| Item | Current |
| --- | --- |
| GSchema `stacked-tiling-mode-enabled` | **`false`** — `schemas/org.gnome.shell.extensions.forge.gschema.xml` ~L101–104 |
| GSchema `tabbed-tiling-mode-enabled` | `true` |
| GSchema `dnd-center-layout` | `'tabbed'` (~L145–150); enum tabbed\|stacked (prefs also offers swap) |
| GSchema `default-window-layout` | `'tiled'` (tiled\|tabbed\|stacked) |
| Prefs UI | Switch “Stacked tiling” binds flag — `lib/prefs/settings.js` ~L107–111; DnD dropdown includes Stacked ~L170–180 |
| `config/settings.schema.json` | **`stacked-tiling-mode-enabled` default `false`** — matches gschema (SL0) |
| Daily-driver T0 | Done: stack-off + DnD force-tab; STACKED→TABBED on disable preserve children — `agents/plans/forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md` |
| Mode toggle handler | `_handleLayoutModeToggle` — STACKED off → TABBED; re-enable restores `prevLayout === STACKED` — `lib/extension/window.js` ~L1124–1155 |

### 2. Keybinds

| Item | Current |
| --- | --- |
| Toggle stack | `con-stacked-layout-toggle` → `LayoutStackedToggle` — no-ops if flag false (`command.js` ~L320–347) |
| Safe default chord | `<Ctrl><Super>s` (gschema); kits: Vim `<Shift><Super>s`, i3-ish `<Super>s` — `keybind-presets.js` |
| Toggle tabbed | `con-tabbed-layout-toggle` (symmetric; tabbed flag) |
| Focus / cycle in stack | No dedicated “cycle stack” binding. STACKED is **VERTICAL** (`utils.js` / `tree-layout.js`); focus **up/down** walks siblings; enter/exit left/right (`Tree-operations` tests) |
| Restack on focus | `FocusManager.updateStackedFocus` appends focused child + raise siblings (`focus.js` ~L113–128); also tab-click / move / run-steps settle |
| Session API | `_layoutOp("STACKED")` refuses if flag false (`session-api.js` ~L1168–1171); flattens nested CONs like TABBED |

### 3. DnD

| Item | Current |
| --- | --- |
| Center layout resolve | `_resolveDndCenterLayout` forces TABBED when stack mode off — `drag-drop.js` ~L320–331 |
| Center drop create | Uses `LAYOUT_TYPES[centerLayout]` when creating CON |
| Join existing STACKED | If effective center is TABBED → convert parent STACKED→TABBED (~L160–163) |
| Post-drop guard | Center drop never leaves STACKED when flag off (~L166–176) |
| Preview class | Stacked preview only when stack mode on — else tabbed hint (~L253–265) |
| Tests | Unit: STACKED path with flag on + stack-off force tab — `tests/unit/window/WindowManager-drag-drop.test.js` |

### 4. Decoration / chrome

| Item | Current |
| --- | --- |
| Layout math | `stackedChildRect` — N bars × height; focused content fills rest — `tree-layout.js` ~L120–135 |
| Render | `processStacked`: VERTICAL decoration column, `tabExpand=true` — `tree.js` ~L2491–2506 |
| Shared with tabs | Same tab actors / `showtab-decoration-enabled` / `stacked-tab-bar-height` / tab position top\|bottom |
| Borders | `window-stacked-border` vs `window-tabbed-border` — `decoration.js` ~L143–157 |
| Theme | `.window-stacked-border`, `.window-tilepreview-stacked`, palette `.stacked` |
| Difference vs TABBED | Tabbed = horizontal strip (+ multi-row T9); stacked = full-width title-bar column (i3-like). Shared host code path |

### 5. Layout profiles / sugar

| Item | Current |
| --- | --- |
| IR modes | `tabbed` \| `stacked` \| hsplit \| vsplit accepted in `layout_plan.py` (aliases, overflow, children) |
| Multi-role default | Bare list / omitted layout → **tabbed**; explicit mode via `_desugar_role_pane(..., mode=)` |
| Bare sugar | `["app1","app2"]` → **always tabbed**; stacked = `{ "layout": "stacked", "content": […] }` |
| `ensure_layout` | Emits/applies `mode: stacked` when profile says so; apply folds ids into group (`layout_apply.py` ~L176, ~L245) |
| `layout save` | **SL1:** TABBED → bare list; STACKED → `{layout:stacked, content}` — round-trips |
| Thrash scoring | Multi-role tabbed **and** stacked co-group + nested-split thrash (**SL3**) |
| CLI unit tests | SL1: stacked save + desugar cases in `test_layout_save` / `test_layout_plan` |

### 6. Session / rehome

| Item | Current |
| --- | --- |
| Full forest snapshot | CON `layout` includes STACKED — `tree-snapshot.js` |
| Layout-group snapshot | Outer STACKED+TABBED — `tree.snapshotLayoutGroups` / `restoreLayoutGroups` / `restoreLayoutGroupsIfUnwrapped` — `tree.js` ~L1097–1200 |
| Soft rehome | `alignSoftRehomeGroupTargets` majority-aligns outermost STACKED **and** TABBED — `soft-rehome.js` ~L182–211 |
| Session-layout disk | Portable forest restore preserves group layouts when match quality OK — same path as tabs |
| Known risks | Nested stack/tab under splits historically fragile (forge-4y80, gdsz); thrash “stacked thrash” tie-break in session-layout pairing (~L153 comment). **No open code bug found this spike**; treat as regression-sensitive |
| Rendering note | `docs/dev/rendering.md`: plain reload without snapshot loses STACKED/TABBED (expected; session-layout / snapshotTree mitigates) |

### 7. Tests (existing STACKED coverage)

| Layer | Coverage |
| --- | --- |
| Unit tree | Focus/nav, move into stack, swap, cleanup decoration, layout rects — `Tree-operations`, `Tree-cleanup`, `Tree-layout` |
| Unit DnD | Stack on + stack-off — `WindowManager-drag-drop.test.js` |
| Unit command | `LayoutStackedToggle` — `CommandHandler.test.js` (fixtures often force stack mode on) |
| Regression | decoration off overlap (5qp1), flatten nested stack (gdsz), middle-child resize (ox8), tab activate restack, etc. |
| E2E bridge | Integrity allows STACKED; focused child last-in-STACKED invariant — `tests/e2e/framework/bridge.js` ~L1493+ |
| CLI layout | **SL1–SL4:** save/desugar + thrash + ensure stacked + nothingToDo RT |
| Test fixtures | `stacked-tiling-mode-enabled: true` in mocks (tests enable stacks; product default is off) |

### 8. Docs (stale vs product)

| Doc | Issue |
| --- | --- |
| `docs/user/layouts.md` | **SL0 fixed** — stacked vs tabbed; stack opt-in |
| `docs/user/troubleshooting.md` | **SL0 fixed** — stack opt-in, not both-on |
| `README.md` | Correctly states stack off + tab-first DnD |
| `docs/user/layout.md` | Sugar is tab-centric; no stacked recipe (SL1/SL2) |
| daily-driver plan | Doc/schema nits closed by SL0 |

---

## Gap inventory

| Area | Current | Gap | Severity |
| --- | --- | --- | --- |
| Core tree / focus / restack | STACKED first-class in engine | None for v1 when mode on | — |
| GSchema default | Stack **off** | Align product messaging; keep opt-in | Low (intentional) |
| `config/settings.schema.json` | default **false** (SL0) | — | — |
| Prefs | Full UI for flag + DnD + default layout | Optional: disable Stacked DnD choice when flag off (UX polish) | Low |
| Keybinds | Toggle + focus U/D | No dedicated “cycle stack”; optional only | Low |
| DnD when mode on | Creates/joins STACKED per `dnd-center-layout` | Confirm live on black when opting in; covered by unit | Low |
| DnD when mode off | Forced tabbed | Matches T0; keep | — |
| Chrome | Vertical stack bars shared with tab machinery | None critical; shared `showtab` toggle | Low |
| Layout IR | multi-role `layout: "stacked"` + sugar | — (SL1) | — |
| `layout save` | STACKED → stacked object sugar | — (SL1) | — |
| Thrash / verify | Tabbed + stacked multi-role co-group + nested-split | — (SL3) | — |
| Session / rehome | Same path as TABBED | Needs explicit STACKED regression if not already e2e | Med |
| Unit/e2e engine | Strong | — | — |
| CLI / profile tests | SL1–SL4 unit coverage | — | — |
| User docs | SL0: defaults + stacked-vs-tabbed | — | — |

---

## Task breakdown

| ID | Work | Depends | Size |
| --- | --- | --- | --- |
| **SL0** | **Docs + schema hygiene:** set `config/settings.schema.json` stack default `false`; fix `layouts.md` / `troubleshooting.md` “on by default”; README already OK; short “stacked vs tabbed” in `layouts.md` | Accept plan | **S** — **done** |
| **SL1** | **Profile IR + save round-trip:** `layout save` emit stacked groups as IR `layout: "stacked"` (or sugar that desugars to stacked); ensure bare multi-app array stays tabbed; tests in `test_layout_*` | Accept | **M** — **done** |
| **SL2** | **Tiles sugar for stacked:** `{ "layout": "stacked", "content": [...] }` + docs | SL1 | **S** — **done with SL1** |
| **SL3** | **Thrash / ensure parity:** multi-role `stacked` slots get same co-group thrash + ensure behavior as tabbed | SL1 | **S** — **done** |
| **SL4** | **Regression pack:** unit CLI + any missing DnD/toggle; optional e2e smoke with flag on (STACKED toggle + focus restack already partly in bridge) | SL1 | **S–M** — **done** |
| **SL5** | **Live verify on black (opt-in):** enable stack mode; toggle / DnD stacked / layout profile with stacked cell; soft rehome dual-mon; no Shell thrash | SL0–SL1 preferred | **S** (ops) |
| **SL6** | **Polish (optional):** prefs graying of DnD=stacked when flag off; cycle-stack keybind; auto-exit-stacked symmetry — only if product wants | SL0 | **S–M** |

**Out of scope unless requested:** flip default to stack-on; replace tabbed daily driver; nested stack redesign.

---

## Next task

→ **`SL5`** live verify on black (optional).  
SL0–SL4 + defaults/keybinds done. SL6 polish only if product wants.

## Related

- [forge-daily-driver](./forge-daily-driver.md) T0 stack-off (historical; product default revised)
- [docs/user/layout.md](../../docs/user/layout.md)
- [docs/user/layouts.md](../../docs/user/layouts.md)
- T0 completed: [forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md](./forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md)

## Session note

**2026-07-28 P1c (docs/help + install wrapup)**

- Phase 1 keys task **done** — docs/help consistency, install with new schema keys,
  Vim kit re-apply, unit suite, final commit.
- Fixed stale layouts.md split chords; troubleshooting reload/merge notes;
  config/README/cli_help/DESIGN polish.
- **Next product:** SL5 live verify on black (optional thrash); do **not** start Phase 2.
- Task file: [completed/forge-stacked-layouts_phase1-keys.md](./forge-stacked-layouts/completed/forge-stacked-layouts_phase1-keys.md)

**2026-07-28 P1b (extension handlers)**

- Shipped: `LayoutStackTabToggle`, `WindowMergeGroup`, `mergeWindowsIntoGroup`,
  RunSteps `layout-cycle` / `merge-group` / `float` (handlers + **EXTENSION_OPS** validation).
- Stack mode default on; tabbed remains default group type.
- Completed defaults task: [completed/forge-stacked-layouts_defaults-keybinds.md](./forge-stacked-layouts/completed/forge-stacked-layouts_defaults-keybinds.md)

**2026-07-28 defaults + keybinds**

- `stacked-tiling-mode-enabled` default **true**; tabbed stays default group (DnD, bare sugar, merge).
- New: `LayoutStackTabToggle` (`con-stack-tab-layout-toggle`), `WindowMergeGroup` (`window-merge-group`).
- Tree: `mergeWindowsIntoGroup`; kits Safe/Vim/i3; docs layouts/keybindings/README/DESIGN.
