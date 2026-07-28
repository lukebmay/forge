# Plan: Forge codebase efficiency & organization audit

**Status:** **wave 1 complete** (CA0–CA9); **B1 Done** (DnD extract)

**Priority:** wave 1 + B1 done; residual size optional (open-app cluster B2, etc.)

**Mode:** A/B implement–verify per task; serial; one concern per change  
**Trigger:** thrash/session work layered safety nets without cleanup; user quality bar: clean code, files &lt;1K preferred, no rewrite  

---

## Goals

1. Shrink the two offenders (`window.js` ~5.1k, `tree.js` ~2.9k) via **extract-then-thin**, not rewrite.
2. Document thrash/session recovery so agents stop stacking redundant nets.
3. Remove exploratory/diagnostic residue left after problems were solved.
4. DRY obvious duplicated helpers (monotonic time, rehome move+parent, raise order).
5. Keep tests green; add tests only where extractions need a seam.

## Non-goals

- Full rewrite / flex engine / pin-to-tile  
- Merging gdisplays into Forge  
- Drive-by features (`workon`, multi-line tabs, FC5)  
- Prefs GTK rewrite or unit-testing prefs pages  
- Dropping recovery layers that still solve distinct failure modes  
- Big-bang file moves that risk Shell regressions on `black`

---

## Inventory findings

### Line counts — `lib/extension/*.js`

| Lines | File | Flag |
| ---: | --- | --- |
| **~5062** | `window.js` | **critical** — WM + session + soft rehome + place + DnD + resize |
| **~2910** | `tree.js` | **critical** — Node + Tree + chrome + layout + nav |
| **~993** | `session-api.js` | **>800** — DBus surface (leave alone in wave 1) |
| **~885** | `session-layout.js` | **>800** — pure helpers; already extracted; OK for now |
| ~674 | `tree-snapshot.js` | pure T6; healthy size |
| ~675 | `tile-select.js` | CLI selectors; fine |
| ~575 | `utils.js` | drop zones etc.; fine |
| ~552 | `command.js` | OK |
| ~455 | `decoration.js` | already extracted from WM |
| ~444 | `cheatsheet.js` | OK |
| ~372 | `run-steps.js` | OK |
| ~310 | `workspace.js` | OK |
| ~270 | `place-hint.js` | pure; good pattern |
| ~255 | `keybindings.js` | OK |
| ~246 | `lft-mru.js` | pure; good pattern |
| ~236 | `tree-query.js` | pure; good pattern |
| ~204 | `layout-debug-overlay.js` | OK |
| ~202 | `monitor-identity.js` | pure; good pattern |
| ~183 | `focus.js` | already extracted |
| ~166 | `monitor.js` | OK |
| ≤150 | indicator, enum, compat, shell-version, theme-manager | fine |

### Line counts — `lib/shared/*.js`

| Lines | File | Flag |
| ---: | --- | --- |
| ~680 | `config-sync.js` | near 800; not wave-1 |
| ~517 | `settings.js` | OK (session-layout file I/O lives here) |
| ~457 | `keybind-presets.js` | OK |
| ~333 | `theme.js` | OK |
| ~242 | `settings-control.js` | OK |
| ~200 | `keybind-conflicts.js` | OK |
| ~115 | `settings-keys.js` | OK |
| ~105 | `gnome-overrides.js` | OK |
| ~83 | `logger.js` | OK |

**Ceiling interest:** anything >1K is a split candidate; 1–2K is pressure; **window.js / tree.js only** are hard offenders.

### Existing pure-module pattern (reuse this)

| Module | Role |
| --- | --- |
| `session-layout.js` | Portable forest, match, assignByScore, richness, strict mon resolve |
| `tree-snapshot.js` | Capture/restore forest, majority mon remap, applyMonitorSnapshot |
| `monitor-identity.js` | stableKey ↔ index |
| `place-hint.js` / `lft-mru.js` / `tile-select.js` | Open-app / CLI pure helpers |
| `decoration.js` / `focus.js` | GObject managers extracted from WM (thin wrappers + live `_extWm`) |

**Rule for splits:** pure logic → pure module + unit tests; GObject glue → thin manager class with live `this._extWm` / `this.tree` (same as DecorationManager).

---

## `window.js` structure map

`WindowManager` is one GObject class (~line 186–5061). Major clusters by approximate line range:

| Lines (approx) | Cluster | Split candidate? |
| ---: | --- | --- |
| 82–138 | `sessionLayoutTrace`, `metaWinLabel` | With session restore (CA1/CA4) |
| 140–185 | enums, GOLDEN, window-type sets, disconnectSignals | stay / tiny util |
| 186–403 | ctor, float overrides, queueEvent | stay core |
| 403–543 | `_bindSignals` | stay core |
| **544–918** | **entered-monitor, session shield, soft rehome, last-good** | **→ soft-rehome + session-restore** |
| 919–1100 | fullscreen float demote, workspace track, command, resize/expand | stay / later |
| 1109–1272 | keyboard resize + golden | stay (has regression suite) |
| 1319–1484 | disable/enable, mon identity refresh | stay core |
| 1484–1860 | layout toggle, monocle, move, borders glue | stay / decoration already thin |
| 1860–2096 | signal teardown, renderTree, reloadTree | stay core |
| **2098–2415** | **session save/hold/flush/restore/rehome/raise/seed** | **→ session-layout-restore** |
| 2417–2580 | LFT touch, gaps, maximize single | stay |
| 2582–3070 | trackWindow, place-hint, dock sticky, attach target | optional later → open-app glue |
| 3074–3629 | window signals, destroy, rehome live/dock, reconcile homes | stay (coupled) |
| 3629–3870 | position/size, settings, float helpers | stay |
| **3872–4790** | **DnD drop + grab op resize/move** | backlog → `dnd-grab.js` |
| 4793–5061 | float override matching, overrides reload | optional later |

### Proposed extract boundaries (wave 1)

1. **`session-layout-restore.js`** (manager or free fns + thin WM methods)  
   Move: save queue/hold/flush, restore-after-track, rehome forest, strict apply, raise-after-restore, seed last-good, shield active/reapply, home-trace helpers.  
   Keeps calling `SessionLayout.*` and `TreeSnapshot.*`. Target: cut **~400–500** lines from `window.js`.

2. **`soft-rehome.js`**  
   Move: workareas settle debounce, `_softRehomeAfterWorkareas`, group majority align, resolve soft mon, snapshot last-good.  
   Target: cut **~350–400** lines.

3. Leave DnD/grab and open-app glue for backlog unless window.js still >3.5k after (1)+(2).

---

## `tree.js` structure map

| Lines (approx) | Cluster | Split candidate? |
| ---: | --- | --- |
| 39–67 | enums + DECORATION_ADJUST_FACTOR | stay or shared enum file |
| 68–870 | **Node** — tree ops + **tab/decoration chrome** | chrome high-risk; thin only |
| 870–893 | Queue | stay |
| 893–1246 | Tree scaffold, workspace/mon add/remove, T6 thin-wrap | stay |
| 1246–1960 | create/find, focus, move, swap, remove | stay wave 1 |
| **2067–2855** | **render pipeline + computeSizes + min-size** | **→ tree-layout.js** |
| 2856–2910 | debug helpers | optional trim |

### Proposed extract boundary (wave 1)

**`tree-layout.js` (pure-ish layout apply):**  
`computeSizes`, `_minSizeInOrientation`, `_redistributeForMinSizes`, `_mostShrinkableIndex`, `processGap`, `applyMargins`, parts of `processSplit` / stacked/tabbed geometry that do not touch St actors.  
Tree keeps `processNode` orchestration and decoration attachment.  
Target: cut **~400–600** lines; layout math becomes unit-testable without full Tree.

**Do not** extract Node tab/decoration in wave 1 — GObject + St lifecycle is the highest regression risk (empty chrome / tab click). DecorationManager already owns border restack.

---

## Thrash recovery layers (inventory)

These are **complementary**, not a stack of failed attempts to delete casually.

```text
                    ┌─────────────────────────────────────┐
  quiet render ──►  │ last-good homes WeakMap (frame+mon  │
                    │ + stableKey)                        │
                    └──────────────┬──────────────────────┘
                                   │
  workareas-changed ── debounce 300ms ──► soft rehome (H1)
         │                                  │
         │                         snapshotTree (T6) FIRST
         │                                  │
         │                         refresh T7 liveMap
         │                                  │
         │                         resolve mon: stableKey →
         │                           frame ∩ → remapped idx
         │                                  │
         │                         majority-align tab/stack
         │                                  │
         │                         move_to_monitor + reconcile
         │                                  │
         │                         restoreTreeIfNeeded (T6)
         │                           resolveTargetMonitor =
         │                           stableKey / majority
         │
  install HUP ── flush session-layout.json (richness + hold)
         │
  enable ── flat track ── portable match ── session restore
         │                    │
         │              resolveStrictMonitor (NO majority)
         │                    │
         │              rehome Meta+tree (retry) → applySnapshot
         │                    │
         │              raise DFS + focus
         │                    │
         │              seed last-good + shield ~3s
         │                    │
         └──── while shield: soft rehome REAPPLIES forest
               (does not snapshot thrash topology)
```

| Layer | Trigger | Policy | Overlap | **Verdict** |
| --- | --- | --- | --- | --- |
| Soft rehome (H1) | workareas thrash | last-good geometry | uses T6 | **Keep** |
| T6 snapshot | soft rehome + reloadTree | full forest in-memory | backbone | **Keep** |
| Majority mon remap | T6 `resolveTargetMonitor` | pile survivors | **not** used by session | **Keep** (document boundary) |
| Session-layout strict | enable after HUP | disk portable + strict mon | different failure | **Keep** |
| Richness guard | save/flush | block thrash-flat overwrite | save-only | **Keep** |
| 12s save hold | post-enable | suppress auto-save | complements richness | **Keep** |
| Session shield ~3s | post-restore | soft rehome → reapply forest | glue H1↔session | **Keep** |
| entered-monitor suppress | thrash / restore / shield | ignore Meta rehomes | needed | **Keep** |

**Cleanup angle:** document once in DESIGN.md (CA0); do **not** merge strict+majority into one function; do **not** remove shield/hold/richness without live dual-Ghostty proof.

**Possible future simplification (backlog only):** if shield proves always sufficient, revisit whether soft-rehome path during shield needs both rehome+strict+raise or a single `applyRestoredForest(forest)` helper — that is **API DRY**, not layer deletion.

---

## Debounce / timers inventory (`lib/extension`)

| Timer / idle | Owner | MS / notes | Justified? |
| --- | --- | --- | --- |
| `_workareasSettleSrcId` | window | 300ms (`WORKAREAS_SETTLE_MS`) | **Yes** — hybrid thrash |
| `_sessionLayoutSaveSrcId` | window | 1500ms debounce | **Yes** |
| `_sessionLayoutSaveHoldUntil` | window | 12s mono hold | **Yes** — thrash after enable |
| `_sessionLayoutShield.untilMonoUs` | window | 3s sliding | **Yes** — post-HUP peel |
| `_renderTreeSrcId` | window | idle coalesce | **Yes** |
| `_reloadTreeSrcId` | window | idle low | **Yes** |
| `_windowHomeReconcileSrcId` | window | idle | **Yes** — entered-monitor burst |
| `_manualResizeEndId` | window | 120ms keyboard resize | **Yes** (h6z9) |
| `_queueSourceId` | window | 220ms event queue | **Yes** |
| `_workspaceChangingTimeoutId` | window | 300ms | **Yes** |
| `_pointerFocusTimeoutId` | focus→wm | hover focus | **Yes** |
| `_wsWindowAddSrcId` | workspace | 200ms window-added | **Yes** (wqlx) |
| `_forgeStackTimeoutId` | tree per-window | 50ms Wayland stack | **Yes** — keep cleanup on disable |

**No orphan timers found.** Wave-1 action: document only (CA0); optionally centralize mono-time helper (CA3). Teardown list in `_removeSignals` already clears the set — keep in sync when extracting.

---

## Diagnostic / exploratory debt

| Item | Location | Action |
| --- | --- | --- |
| `sessionLayoutTrace` → **always `Logger.info`** then file if `!production` | `window.js:83–103` | CA1: info → debug for per-window chatter; keep one info line on restore success/fail; file trace OK for `production===false` |
| `_traceSessionLayoutHomes` / `metaWinLabel` | window.js | CA1: keep behind trace only |
| `session-layout-trace.log` | `~/.config/forge/config/` | keep non-production; document in DESIGN (already noted) |
| `debugNode` / `debugParentNodes` | tree.js ~2856+ | CA8: leave if Logger.debug-gated; drop if unused outside debug |
| prefs `experimental: true` flags | prefs UI | **out of scope** (product flags, not thrash residue) |
| console.log leftovers | — | **none found** in `lib/` |
| TODO TEMP / thrash-diag / commented post-mortems | — | **none found** (cleanup commit `003a636` already landed) |

---

## Duplication hotspots

| Area | Instances | Action |
| --- | --- | --- |
| Mono time `GLib.get_monotonic_time` fallback | **14×** in window.js session paths | CA3: one `monoTimeUs()` helper (utils or session-layout) |
| `move_to_monitor` + try/catch | soft rehome, session rehome, dock sticky, live rehome | CA5: small `safeMoveToMonitor(meta, idx)` |
| Raise / restack | focus.js tab/stack, tree `_activateFromTab`, session `_raiseAfterSessionRestore`, command.js, focus-after-close | CA6: document policy; optional shared `raiseWindowNode(meta, {group})` — **do not unify blindly** (fullscreen demote must stay) |
| Monitor resolve | `resolveStrictMonitor` vs `resolveTargetMonitor` | **intentional dual policy** — document only (CA0) |
| Leaf walks | session-layout `walkLiveWindowLeaves` vs tree-snapshot `collectWindows` | backlog if extracting more session code |
| Percent renormalize | tree-snapshot + tree insert paths | already shared helpers; leave |

---

## Tests coverage vs extractions seams

| Area | Existing | Gap for extractions |
| --- | --- | --- |
| session-layout pure | `tests/unit/extension/session-layout.test.js` (rich: match, assignByScore, richness, rehome Meta mon) | Move tests with pure helpers if any leave window |
| tree-snapshot | `tests/unit/extension/tree-snapshot.test.js` | good for T6 |
| soft rehome + shield | `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js` | **must stay green** after soft-rehome extract; import paths only |
| tab click restack | `bug-tab-click-activate.test.js` | touch only if raise DRY |
| sizing / min-size | `t4-sizing-policy`, `bug-s6g-*` | tree-layout extract must re-run these |
| monitor identity | `monitor-identity.test.js` | no change expected |

**Test plan default per task:** `npm test` (or `make unit-test`) + named suites above when the cluster moves.

---

## Logging patterns

| Pattern | Assessment |
| --- | --- |
| Logger gated by `logging-enabled` + level; production forces OFF | Good |
| Session restore uses **Logger.info via sessionLayoutTrace** for every leaf | **Too noisy** when logging on (CA1) |
| Soft rehome failures → warn; success mostly debug | Good |
| `tree.render` debug banner | Fine at DEBUG |
| Operational high-value (keep): restore success ratio, save skipped-by-richness (debug), shield reapply fail (warn) | CA1 codifies |

---

## Ordered task table (wave 1)

Task IDs: **CA0…CA9**. Execute in order unless noted parallel-safe.  
**B review merged:** residue dir, dead `_monitorIndexOfNode`, mon-ws helper dual home, layout-group=test/compat, DnD extract kept as B1.

### CA0 — Recovery architecture doc (+ timer map in DESIGN)

| | |
| --- | --- |
| **Goal** | Single durable recovery diagram + “what stays / why” so agents stop layering nets |
| **Primary files** | `docs/DESIGN.md` (session layout + soft rehome sections); optional cross-link from this plan |
| **Acceptance** | [x] ASCII or markdown diagram of H1 / T6 / strict session / majority / shield / hold / richness [x] Explicit “dual mon resolve policies” (strict vs majority) [x] Note: production soft-rehome uses **T6 only**; layout-group APIs are **test/compat** [x] Timer table (or link to this plan § timers) [x] No code changes |
| **Risk** | low |
| **Test plan** | none (docs) |
| **Out of scope** | code moves; deleting layers |

### CA1 — Session diagnostic noise

| | |
| --- | --- |
| **Goal** | Keep useful diagnostics; stop info-spam and ensure production path is quiet |
| **Primary files** | `lib/extension/window.js` (`sessionLayoutTrace`, `_traceSessionLayoutHomes`) |
| **Acceptance** | [x] Per-window / homes traces use Logger.debug (or file-only) [x] At most one Logger.info (or warn on failure) per restore/save outcome [x] File trace still works when `production === false` [x] No behavior change to restore/rehome [x] `npm test` green; session-layout + h1 soft-rehome suites green |
| **Risk** | low |
| **Test plan** | `npm test` |
| **Out of scope** | extracting modules; removing shield/trace file entirely |

### CA2 — Hygiene: residue + dead method + timer clear

| | |
| --- | --- |
| **Goal** | Delete leftover debug tree; remove dead duplicate method; align session-save timer teardown |
| **Primary files** | `temp-before-debug/` (delete); `lib/extension/window.js` (`_monitorIndexOfNode` ×2; `_sessionLayoutSaveSrcId` clear path) |
| **Acceptance** | [x] `temp-before-debug/` gone; no make/test refs [x] Single null-safe `_monitorIndexOfNode` [x] Session-save timeout cleared with other timers in teardown when safe [x] No restore/rehome behavior change [x] `npm test` green |
| **Risk** | low |
| **Test plan** | `npm test` |
| **Out of scope** | mon-ws helper unify (optional tiny follow-up); logger noise (CA1) |

### CA3 — `monoTimeUs()` helper (tiny DRY)

| | |
| --- | --- |
| **Goal** | Collapse 14× monotonic fallback copies |
| **Primary files** | `lib/extension/utils.js` or `session-layout.js`; call sites in `window.js` |
| **Acceptance** | [x] Single helper [x] All session/shield/hold sites use it [x] Behavior identical [x] `npm test` green |
| **Risk** | low |
| **Test plan** | `npm test`; optional unit if pure |
| **Out of scope** | other DRY |

*Note: CA3 before CA4 so extract doesn’t copy the duplication.*

### CA4 — Extract session-layout restore orchestration

| | |
| --- | --- |
| **Goal** | Move save/restore/rehome/raise/shield from WindowManager into dedicated module; shrink window.js by ~400+ lines |
| **Primary files** | new `lib/extension/session-layout-restore.js` (name flexible); `window.js` thin delegates; keep pure logic in `session-layout.js` |
| **Acceptance** | [x] Public WM API preserved (`flushSessionLayout`, enable path restore, shield hooks used by soft rehome) [x] No change to match order / richness / hold / shield timing [x] window.js line count drops meaningfully (target ≥350 lines net) [x] session-layout + h1 regression green [x] `npm test` green |
| **Risk** | med |
| **Test plan** | `npm test`; focus `session-layout.test.js`, `bug-h1-soft-rehome-workareas-thrash.test.js` |
| **Out of scope** | soft-rehome body extract (CA5); changing recovery policy |

### CA5 — Extract soft rehome + `safeMoveToMonitor`

| | |
| --- | --- |
| **Goal** | Isolate workareas soft-rehome cluster; share safe Meta monitor move helper |
| **Primary files** | new `lib/extension/soft-rehome.js`; `window.js`; maybe tiny util for move |
| **Acceptance** | [x] Soft rehome behavior unchanged (settle ms, suppress entered-monitor, T6-first, majority tab align, shield branch) [x] Dock sticky uses `safeMoveToMonitor` (session rehome left with its own before/after trace) [x] h1 regression suite green [x] window.js further reduced (−239) [x] `npm test` green |
| **Risk** | med |
| **Test plan** | `npm test`; `bug-h1-soft-rehome-workareas-thrash.test.js` |
| **Out of scope** | changing WORKAREAS_SETTLE_MS; T6 algorithm changes |

### CA6 — Raise / restack policy note + light DRY

| | |
| --- | --- |
| **Goal** | Document one stacking policy; extract only **safe** shared raise helper if call sites are trivial duplicates |
| **Primary files** | `docs/DESIGN.md` short section; optionally `focus.js` / tiny helper; **avoid** touching fullscreen demote paths without tests |
| **Acceptance** | [x] DESIGN lists: tab click, focus mgr, session raise, float-under-fullscreen exception [x] No regression in `bug-tab-click-activate`, `bug-d5mm-focus-restack`, `bug-5l9b-raise-float-under-fullscreen`, `bug-jnfk-wayland-focus-stacking` [x] If code DRY: ≤ one small helper; no behavior change (**docs-only**, no helper) |
| **Risk** | med (stacking is brittle) |
| **Test plan** | listed regressions + `npm test` |
| **Out of scope** | rewriting Wayland stack timeouts; lastTabFocus id churn fix (product bug, not audit) |

### CA7 — Extract tree layout compute

| | |
| --- | --- |
| **Goal** | Move pure sizing/gap math out of `tree.js` |
| **Primary files** | new `lib/extension/tree-layout.js`; `tree.js` imports |
| **Acceptance** | [x] `computeSizes` / min-size redistrib / gap math live outside tree.js [x] tree.js line count drops (≥300 target: −332 → 2577) [x] t4 sizing + s6g + nested resize regressions green [x] `npm test` green (A/B AGREE) |
| **Risk** | med |
| **Test plan** | `npm test`; `t4-sizing-policy.test.js`, `bug-s6g-minsize-redistribution.test.js`, related resize bugs |
| **Out of scope** | tab chrome extract; processNode St decoration |

### CA8 — Dead debug helpers + comment trim on touched files

| | |
| --- | --- |
| **Goal** | Remove unused debug-only tree helpers if nothing calls them; trim thrash-era verbose comments on files already touched in CA4–CA7 |
| **Primary files** | `tree.js` debug*; recently extracted modules |
| **Acceptance** | [x] Grep shows no production callers of removed symbols (none removed) [x] comments.md style on touched blocks [x] `npm test` green (A/B AGREE) |
| **Risk** | low |
| **Test plan** | `npm test` |
| **Out of scope** | prefs experimental flags; mass comment rewrite across repo |

### CA9 — Line-count gate + handoff metrics

| | |
| --- | --- |
| **Goal** | Record post-wave sizes; decide if backlog DnD extract is worth a wave 2 |
| **Primary files** | this plan session note; `agents/PRIORITY.md` only if queue changes |
| **Acceptance** | [x] Table of window.js / tree.js / new modules line counts [x] window.js target aspirational &lt;4k (stretch &lt;3.5k); tree.js &lt;2.5k — **report honest** [x] Backlog entries confirmed or dropped [x] No required code if targets already met |
| **Risk** | low |
| **Test plan** | none or full `npm test` smoke |
| **Out of scope** | more extractions in same task |

---

## Backlog (wave 2+ — CA9 disposition)

| ID | Idea | Disposition (CA9) |
| --- | --- | --- |
| **B1** | Extract DnD/grab cluster from window.js (~650–900 lines) | **Done (2026-07-27).** `drag-drop.js` + thin WM wrappers; window.js **3985** (−502). |
| B2 | Open-app / dock sticky glue module | **Keep low** — pain lower than DnD; only if open-app work touches that cluster |
| B3 | Node tab chrome extract | **Keep deferred** — high Shell regression risk; not size-critical now |
| B4 | Split `session-api.js` if it grows past 1.2k | **Keep parked** — still ~993; not blocking |
| B5 | Unify leaf walk helpers session vs snapshot | **Drop or micro** — not worth a task alone |
| B5b | Unify mon-ws id helpers (`Utils` ↔ `MonitorIdentity`) | **Keep micro** — opportunistically when mon code is open |
| B6 | e2e thrash harness in Docker | **Keep later** — live `black` remains gate |
| B7 | lastTabFocus survive HUP id churn | **Product bug** — not cleanup; track outside audit |
| B8 | Merge shield reapply into single `applyRestoredForest` API | **Keep optional** — CA4/CA5 landed; DRY only if shield path is next touched |
| B9 | Layout-group long-term: test API vs migrate H1 to T6 | **Keep decision-only** — CA0 docs done; no code urgency |

---

## Execution rules

1. **Serial A/B** per CA task; max 5 rounds; fresh B each verify.  
2. **One concern per PR/commit** (when user asks to commit).  
3. Prefer **extract + thin delegate** over behavior changes.  
4. After each task: update this plan session note (overwrite); update task file.  
5. Plan-linked completed tasks → `agents/plans/forge-codebase-audit/completed/`.  
6. Do not start while Ghostty/session residual is still on fire — product base is OK; residual task is separate.  
7. No SSH without **explicit** user permission.

---

## Related

- [forge-daily-driver_session-layout-ghostty.md](../tasks/forge-daily-driver_session-layout-ghostty.md) — audit debt seed  
- [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md) — recovery product history  
- [docs/DESIGN.md](../../docs/DESIGN.md) — soft rehome, session layout, T6, T7  
- [agents/PRIORITY.md](../PRIORITY.md) — queue (wave 1 done; optional B1)

---

## Session note (handoff)

**B1 A (2026-07-27):** Extract DnD/grab → `lib/extension/drag-drop.js` (`DragDropManager`).
Thin WM wrappers; grab state stays on WM. Resize path left on WM.

| File | Before B1 | After B1 | Δ |
| --- | ---: | ---: | ---: |
| `window.js` | 4487 | **3985** | **−502** |
| `drag-drop.js` | — | **638** | new |

**Tests:** drag-drop unit 69; grab regressions 13; `npm test` **185 / 1886** green.

**Task file:** `agents/plans/forge-codebase-audit/completed/forge-codebase-audit_b1-dnd-extract.md`

**Next for B:** independent verify (AGREE/DISAGREE). Residual size still &gt;3.5k stretch;
next size candidate is B2 open-app/track if wanted — not required.

### Post–wave-1 + B1 line counts

| File | Baseline (plan inventory) | Now | Δ |
| --- | ---: | ---: | ---: |
| `window.js` | ~5062 | **3985** | **−1077** (wave1+B1) |
| `tree.js` | ~2910 | **2572** | **−338** |
| `session-layout-restore.js` | — (CA4) | ~477 | extract |
| `soft-rehome.js` | — (CA5) | ~284 | extract |
| `tree-layout.js` | — (CA7) | ~337 | extract |
| `drag-drop.js` | — (B1) | **638** | extract |

### Targets (honest pass/fail)

| Target | Result |
| --- | --- |
| `window.js` aspirational **&lt;4k** | **PASS** (3985) after B1 |
| `window.js` stretch **&lt;3.5k** | **FAIL** (3985) |
| `tree.js` **&lt;2.5k** | **FAIL** by ~72 (2572) |

### Wave 1 + B1 summary

| Task | Outcome |
| --- | --- |
| CA0–CA9 | Wave 1 complete (see prior session) |
| **B1** | `drag-drop.js` — grab-tile / drop cluster |

**Next:** none required. Optional B2 open-app extract or T9 multi-line tabs.

