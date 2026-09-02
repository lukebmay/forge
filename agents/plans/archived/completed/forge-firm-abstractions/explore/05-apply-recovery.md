# Exploration notes — apply / recovery (epochs)

**As of:** 2026-08-27 — Apply IR superseded 2026-08-29 (C6.6):
`projectForestFromTom`, not GetTree `projectForest` (Surface only).
**Domain:** apply-recovery
**Audience:** P0b layers / import-map. Epochs write a forest; they are
**not** the tiling model.

Apply, session restore, and H1 are three **writers of a forest**. TOM
owns kinds / child list / layout / percents. Presenter paints slots.
Host owns Meta signals and `move_to_monitor`. Mixing those jobs is how
`window.js` grew nets without a map.

## Scope

Opened (map, not dump):

- Scheme / product: `explore/00-scheme.md`, `agents/project.md` § Layout
  apply architecture, `agents/design.md` § Recovery architecture + T6/T7,
  `docs/dev/contracts.md` (ApplyLayout / ApplyEpoch / hard-ready /
  `Done.ok`)
- Apply spine: `lib/extension/layout-apply-run.js` (~2110),
  `layout-apply-epoch.js` (101), `layout-apply-slot.js` (~842),
  `layout-apply-structure.js` (265), `layout-apply-open.js` (~760),
  `layout-apply-settle.js` (~1860), `layout-apply-chrome.js` (header +
  policy)
- Planner: `lib/shared/layout-plan.js` (5256),
  `scripts/forge/layout_plan.py` (5799)
- Session: `session-layout.js` (~1025), `session-layout-restore.js` (800)
- H1: `monitor-recovery.js` (761), `monitor-identity.js`,
  `workareas-policy.js`
- T6: `tree-snapshot.js` (680); `tree.js` `snapshotTree` /
  `restoreTreeIfNeeded` (~L1294–1342)
- Adjacent: `place-hint.js`, `layout-open-leaf-pin.js`,
  `layout-placeholder.js`, `tree-query.js` `projectForest`,
  `session-api.js` ApplyLayout glue (`_snapshotForestForApply`,
  `_runApplyLayoutSteps`), `window.js` `beginApplyEpoch`,
  `layout-epoch.js` (name collision), `layout-controller.js` (sensor)

Did **not** open: proto TOM, Mark 2 body, `tree.js` mutation core,
`window.js` event hub, `drag-drop.js`, `run-steps.js` body, INDEX.md.

## Current objects (as the code is)

| Name | File:symbol | What it actually does today |
| --- | --- | --- |
| **ApplyEpoch** | `layout-apply-epoch.js:ApplyEpoch` | Boolean home-authority: while live, desired forest is the only mon/TILE-home writer. `begin`/`end` only. |
| `isApplyEpochLive` / `shouldAllowIdleTileRestore` / `policyOnDisplaysChangedDuringApply` | same | Idle D026 restore off during apply/grab; workareas mid-apply → cancel apply + **skip H1**. |
| WM epoch glue | `window.js:beginApplyEpoch` (~L749) | Calls `ApplyEpoch.begin`, drops deferred entered-monitor rehomes. |
| **LayoutApplyRunBag** | `layout-apply-run.js:LayoutApplyRunBag` | Single-flight ApplyLayout: D008 **phase walk** (skeleton→open→bind→order→size→hard-ready→focus→soft→verify) then `_finishSpine` forest-match. |
| `parseApplyLayoutRequest` | `layout-apply-run.js` (~L116) | Validate profile via `validateReconcileProfile`; flags include D070 `forestFailsafe`. |
| `buildStructurePlan` | `layout-apply-structure.js` (~L78) | `planReconcile` + `planActionsToSteps`. Opens listed, not stepped. |
| `partitionStepsByPhase` | same (~L158) | Buckets RunSteps: skeleton / open(place moves) / bind / order / size / focus. |
| **Slot machines** | `layout-apply-slot.js:collectSlotMachines` / `startSlotMachines` | One machine per **slot** (TILE window **or** TABBED/STACKED CON). Place → in-slot wait 5s → retry place N=2 @ 2s. |
| `placeSlotWindows` | same (~L405) | Re-`planReconcile` for that slot only; hollow retry → `ensureMetaInSlot` (not a twin planner). |
| **Open phase** | `layout-apply-open.js:startOpenPhase` | Spawn + PlaceNext **into slot**, map-pin on Meta signals, residual replan with `rolePins`. |
| Hard-ready / `Done.ok` | `layout-apply-settle.js:windowIsSettled` / `matchRequiredTileSlots` | In-slot = TILE\|grab + desired mon + parent CON + ε rect. `Done.ok` = every **required** TILE slot in-slot (D041). Soft/verify ≠ success. |
| Soft barrier | `runSoftFocusBarrierOnSignals` + `settle-math.js` | Learned quiet; steal → pin restore. After all-hard + focus. |
| D070 failsafe | `layout-apply-run.js:_runForestFailsafe` (~L1856) | Prod only: one `ensure_layout`/`ensure_order` for failed slots → rematch. Dev stays loud. **Not** the spine. |
| Apply overlay | `layout-apply-chrome.js` | Presenter scrim. Code clears at **Done** (`_finish` / D071). File header still cites D043. |
| **Planner** | `layout-plan.js:planReconcile` (~L4413) | GetTree JSON in → actions out. gi-free. Does **not** emit a TOM snapshot. |
| `planActionsToSteps` | same (~L5068) | Actions → RunSteps (`skeleton`/`bind`/`move`/`layout`/`order`/`size`/`focus`). |
| Python twin | `scripts/forge/layout_plan.py:plan_reconcile` | Dry-run / dump / pytest oracle. Still ~5.8k. **Not** the product apply path. |
| PlaceNext | `place-hint.js` + `lib/shared/layout-open.js:placeNextDestKind` | One-shot map dest. Product apply dest = **slot** (PH / non-mon-root path), never mon-root-only (D042). |
| Placeholder | `layout-placeholder.js` | Host stub TILE leaf for skeleton / fail-open / thrash isolate. GetTree tags `placeholder`. |
| Open-leaf pin | `layout-open-leaf-pin.js` | 15s pin of intended tab leaf during soft residual. Not topology. |
| **T6 snapshot** | `tree-snapshot.js:captureForest` | In-memory forest: `{version:1, monitors[]}`; WINDOW leaf = `{window: Meta.Window, percent, userSized}`. |
| `resolveTargetMonitor` | `tree-snapshot.js` (~L142) | T6 restore: prefer snapshot mon if survivors live there; else **stableKey**; else **majority**. |
| `applyMonitorSnapshot` / `restoreForestIfNeeded` | same | Cohort rebuild via `replaceChildren`; intact mon → percents only. |
| Tree wrap | `tree.js:snapshotTree` (~L1300) | `captureForest` + liveMap; `createCon` = `new Node(CON, new St.Bin())`. |
| Layout-group snapshot | `tree.js:snapshotLayoutGroups` | Outer STACKED/TABBED only. **Compat / forge-bqa**, not production H1. |
| **Session portable** | `session-layout.js:toPortableForest` | T6 → JSON-safe leaves (`id`, pid, wmClass, title, frame, monitor, `lastTabFocusId`). |
| `resolveStrictMonitor` | `session-layout.js` (~L894) | Exact mon id / stableKey. **No majority.** |
| `createWindowResolver` | same | Match ≥50%: id → unique class+title → pid cohort → class. |
| Restore manager | `session-layout-restore.js:restoreSessionLayoutAfterTrack` | Match → rehome Meta+tree (retry) → `applyMonitorSnapshot` strict → raise DFS + focus → seed last-good → **~3s shield**. |
| Richness / hold | `forestRichness` / `holdSessionLayoutSave` | Refuse thrash-flat overwrite; 12s post-enable save hold. |
| **H1** | `monitor-recovery.js:recoverAfterWorkareas` | workareas settle 300ms (900ms post-unlock). Classify → retile / mon_loss / H1 body. |
| H1 body | `_runH1MonitorRecovery` (~L352) | Snapshot T6 **first**; resolve last-good (stableKey → frame ∩ → remapped idx); `move_to_monitor`; reconcile; `restoreTreeIfNeeded`. |
| T7 | `monitor-identity.js:fingerprintMonitor` | `conn:` → `name:` → `geom:x,y,w,h[#primary]`. Shared by last-good, T6, workareas fp. |
| Workareas policy | `workareas-policy.js:classifyWorkareasChange` | noop / retile / renumber / mon_loss / mon_gain / thrash. Geometry-equal same-N = renumber, not H1. |
| GetTree projection | `tree-query.js:projectForest` | CLI/DBus JSON (`nodeType`, `windowId`, `mode`, `rect`, placeholder tags). **Apply planner input.** |
| Apply wiring | `session-api.js:ApplyLayout` | DBus async start; `onApplyLive` → begin/end epoch; snapshot = `projectForest` **not** T6. |
| RunSteps dispatch | `session-api.js:_runApplyLayoutSteps` (~L1441) | Freeze → `runStepsDispatch` → `commitLayout("apply-layout")`. Apply overrides `layout` → `_setLayoutStructureOp` (no peel). |
| **LayoutCommandEpoch** | `layout-epoch.js:LayoutCommandEpoch` | Per-window **geom echo** after `move_resize` (~350ms). **Not** ApplyEpoch. |
| LayoutController | `layout-controller.js` | Debounced `requestLayout` / verify **sensor**. Never reasserts (AC1). |
| Python belt | `scripts/forge/layout_apply.py:belt_actions_from_plan` | Leftover CLI-era. Product JS belt **deleted** (SM6/D042). |

## Intended layer vs actual layer

Target names from `00-scheme.md`. Contamination called out.

| Object | Intended | Actual today |
| --- | --- | --- |
| ApplyEpoch | **Epochs** (home lock) | Clean. Thin flag + cancel policy. Host glue in `window.js`. |
| LayoutApplyRunBag | **Epochs** orchestrator | Epoch + **Surfaces** (DBus shapes) + leftover D008 phase names as the walk. Product contract is machines + forest-match; file still advances `APPLY_LAYOUT_PHASES`. |
| Slot machines | **Epochs** strategy | Keep. Predicate reads Host+Presenter (mode/mon/parent/ε), not TOM equality. |
| `planReconcile` | **Surfaces** → epoch (profile → desired forest / steps) | Giant **product-policy** module: sugar, Chrome-family class, FLOAT class list, Mode B detect, PH, claim, thrash park. gi-free (good). Not TOM. Not OpSet. |
| `planActionsToSteps` / RunSteps | **Surfaces** (DBus language) | Forge calls ops `move`/`layout`/`order`; Mark 2 calls Move / Join / Peel / `setLayout`. Translator, not kernel. |
| Open + PlaceNext + PH | **Host** (map) + **Epochs** (bind into slot) | Correct-ish. PH is a Host stub sitting in the tree — not a TOM kind. |
| Hard/soft settle | **Host** sensors + **Presenter** slot rect | Correct. Heuristics file = **Product data**. |
| Overlay chrome | **Presenter** | Correct. Stale D043 comment vs D071 clear-at-Done. |
| D070 failsafe | **Product** guardrail | Lives inside epoch finish. Must not become TreeOps or OpSet. |
| T6 `captureForest` | **TOM** serialize (in-memory) | Closest TOM snapshot. Leaves hold **Meta.Window** (Host). Restore `createCon` builds **St.Bin** (Presenter/Host) inside `tree.js`. |
| `resolveTargetMonitor` | **Epochs** (H1 policy) | Pure, in T6 module — fine as sibling, **not** TOM. |
| Session portable | **TOM** serialize (disk) + identity | T6-shaped CON tree + Host identity on leaves. Envelope (`kind`, monotonic, `focusWindowId`) = product data. |
| `resolveStrictMonitor` | **Epochs** (session policy) | Must stay distinct from T6 majority. |
| H1 manager | **Epochs** + **Host** (`move_to_monitor`) | GObject on WM. Last-good WeakMap = Host cache, not TOM. |
| T7 liveMap | **Host** (logical output keys) | Shared helper. gdisplays still owns monitors.xml. |
| GetTree `projectForest` | **Surfaces** | Used as apply/planner forest — a **twin serialization** of TOM. |
| LayoutCommandEpoch | **Host** (echo) | Name says “layout epoch”; it is **not** a forest writer. |
| LayoutController | leftover sensor | Not an epoch. Do not fold into TOM or ApplyLayout. |

```text
proven  ApplyLayout snapshots via projectForest (session-api.js
        _snapshotForestForApply ~L1268), not tree.snapshotTree
proven  Session save: snapshotTree → toPortableForest
        (session-layout-restore.js saveSessionLayoutForReload ~L359)
proven  H1: snapshotTree FIRST then restoreTreeIfNeeded
        (monitor-recovery.js recoverAfterWorkareas ~L254 / L428)
```

## Strengths (keep)

- **Three forest writers on purpose.** Apply = desired profile. Session
  disk = last-good after HUP. H1 T6 = live thrash. Design.md map is
  still what the code does.
- **Two monitor-resolve policies.** `resolveTargetMonitor` (majority /
  stableKey) vs `resolveStrictMonitor` (exact). Merging them re-breaks
  one path (majority after HUP = pile-up; strict after GPU renumber =
  wrong head).
- **Shield vs H1.** While session shield is live, workareas settle
  **reapplies the restored forest** and does not `snapshotTree()` Meta
  pile (`monitor-recovery.js` ~L239–248). Distinct race from H1.
- **ApplyEpoch interleave rule.** Displays-changed during apply:
  **cancel apply, skip H1** (`policyOnDisplaysChangedDuringApply`).
  Do not run two writers at once.
- **Slot = window \| CON.** Machines are independent across slots,
  serial inside a slot. TABBED/STACKED is one machine (D040/D044).
- **`Done.ok` = forest match**, not focus verify, not hard-ready
  continue. Hard-failed required slot → `ok: false`; peers still finish.
- **Open into slot; belt deleted** on the product JS path (D042/SM6).
- **Hard vs soft named.** Hard retries **place**. Soft is residual
  quiet + pin. Soft failure continues to verify; does not rewrite
  topology.
- **T6 is a real forest snapshot** (H/V + tabs + order + percents +
  `userSized` + LTF), not outer-group-only. Layout-group APIs remain
  for tests.
- **Planner is gi-free** (`lib/shared/`, D036). Product apply is
  in-process (`ApplyLayout`, D037). CLI is observer.
- **T7 stableKey** shared by last-good, T6 mon descriptors, workareas
  fingerprint — not a third identity system.
- **Placeholders / pin / overlay** are already *beside* the tree, not
  pretending to be layout kinds.

## Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| Epoch vs phase fiction | `APPLY_LAYOUT_PHASES` still walks skeleton/open/bind/…; comments say product is epoch+machines+barriers | Historical D008 names are the control loop. Strategy (spine) is buried in a state machine that looks like the tiling model. |
| Planner is a product OS | 5256-line `layout-plan.js`: desugar, Chrome PWA tokens, FLOAT classes, claim, PH, thrash detect, Mode B park, ensure_layout | Policy + IR + GetTree walking in one module. Not TOM, not OpSet, not a small compiler. Size is the symptom. |
| Dual planner | JS product + Python oracle (`layout_plan.py` 5799) + Python `belt_actions_from_plan` still in `layout_apply.py` | Two languages for one algorithm. Drift is the historical bug (D036). Belt in Python invites revival. |
| Three forest JSON shapes | T6 `{window: Meta}`, portable `{id,…}`, GetTree `{nodeType,windowId,mode,rect}` | Apply plans against a **projection**, restore applies a **T6-like** tree, H1 captures **Meta leaves**. Same TOM, three codecs. |
| Apply does not write via T6 | RunSteps splice `tree.js`; forest-match re-runs `planReconcile` on GetTree | Epoch mutates through a DBus step language instead of “here is the desired TOM.” |
| Replan-as-retry | `placeSlotWindows` and D070 both call `planReconcile` again | Slot retry and failsafe are strategy; they look like a second belt. |
| Overlay comment drift | `layout-apply-chrome.js` header: clear after hard+soft (D043). Run bag: clear at Done (D071) | Stale contract in the Presenter file. |
| Name collision | `LayoutCommandEpoch` vs `ApplyEpoch` | Two “epochs.” Only ApplyEpoch writes the forest. |
| T6 restore Host leak | `tree.js` `_treeSnapshotCtx.createCon` constructs `St.Bin` | Snapshot apply is TOM topology + Presenter actor birth in one wrap. |
| Planner Mode B still in IR | `detectThrash` / `forceParkResiduals` / `suppressThrashPark` on cold | Mid-session chaos policy inside the desired-forest compiler. |
| LayoutController leftover | Debounced verify sensor next to apply | Looks like a fourth settle brain. Contracts say it must not reassert. |

## Twins / bypasses

Catalog: `docs/dev/contracts.md`.

| Job (catalog) | Canonical | Twin / bypass |
| --- | --- | --- |
| Reconcile / `forge layout` | ApplyLayout + ApplyEpoch + slot machines + `planReconcile` | Port `layout_plan.py` into `cli/`; CLI GetTree poll; overload LayoutBatch as product entry |
| Apply-time home | `beginApplyEpoch` / `endApplyEpoch` | Extra `_layoutApplyLive2`; entered-monitor rehome during apply |
| Hard-ready | `windowIsSettled` + slot machines | TILE-anywhere; per-window tab machines; CLI poll |
| `Done.ok` | `matchRequiredTileSlots` | Focus-only verify; standing best-effort `ok` |
| Open dest | PlaceNext into slot / skeleton PH | Mon-root-only PlaceNext + **belt** |
| Soft residual | `runSoftFocusBarrierOnSignals` + pin | Third settle brain; twin of `revealGroupChild` |
| Monitor remap | `monitor-identity.js` via workareas + H1 + T6 | Parallel connector keying; raw index across thrash |
| Display settle | `workareas-policy.js` + `monitor-recovery.js` | Window TILE wait for mon remap |
| Forest apply (T6) | `TreeSnapshot.applyMonitorSnapshot` | New splice / assign `childNodes` |
| Session restore mon | `resolveStrictMonitor` | T6 majority (`resolveTargetMonitor`) |
| Child list | `Node.replaceChildren` (session / T6) | Direct `childNodes` |
| Layout-group snapshot | test/compat only | Using it as production H1 |

```text
proven  contracts.md ~L70–78, L88, L154: ApplyLayout owns product waits;
        belt deleted; verify ≠ Done.ok
proven  layout-apply.py still exports belt_actions_from_plan (~L704) —
        leftover CLI, not session-api ApplyLayout
```

## Import recommendation

Legend: `keep` | `port` | `reshape` | `discard` | `park`.

### Epoch: ApplyLayout (desired forest)

| Surface | Rec | Why |
| --- | --- | --- |
| ApplyEpoch home lock + skip-H1 | **keep** | Thin, correct. Import as the apply-epoch gate. |
| Spine: epoch → materialize → slot machines → forest-match → focus/soft | **keep** | Product strategy. Name it in layers.md; do not re-derive from phase array. |
| Slot = WINDOW \| TABBED/STACKED CON; parallel slots | **keep** | D040. Import as epoch scheduling, not TOM. |
| In-slot hard (TILE\|grab + mon + parent + ε); retry place N=2 | **keep** | Host+Presenter predicate. |
| `Done.ok` = required forest match | **keep** | D041. Success is topology+slot, not focus. |
| Open into slot / PH (D042) | **keep** | Dest policy. PlaceNext stays Host. |
| LayoutApplyRunBag phase walk | **reshape** | Keep single-flight + DBus shapes; drop D008 names as the real sequencer (logs only). |
| `planReconcile` gi-free | **reshape** | Split: profile IR / claim / desired-forest compile. Do not move into `cli/` (D036). Do not put Chrome tokens in TOM. |
| Emit TOM snapshot / OpSet from planner? | **park** | Possible later: desired TOM + TreeOps diff. Today actions→RunSteps works. Do not block kernel lift on a planner rewrite. |
| `planActionsToSteps` / RunSteps | **port** (as Surface) | Translator to tree mutations. Map later to TreeOps; not Mark 2 glossary. |
| Slot replan + `ensureMetaInSlot` | **keep** | Documented “not a twin planner.” |
| Placeholders | **park** (Host) | Not a TOM kind. Skeleton/bind/fail-open stay epoch+host. |
| Open-leaf pin | **keep** (Host+Presenter) | Soft residual, not topology. |
| Overlay chrome | **keep** (Presenter) | Clear at Done (D071). Fix stale D043 header when touching. |
| D070 forest failsafe | **park** | Prod guardrail only. Never kernel, never Mode B, never belt. Dev stays loud. |
| Chaos cocktail | **park** | Nest/hunt only. |
| Soft heuristics file | **keep** (Product data) | Timings/class keys only. |
| LayoutCommandEpoch | **keep** (Host) | Rename in docs: command **echo**, not forest epoch. |
| LayoutController | **park** / likely **discard** post-refactor | Sensor; not apply. |
| Belt / `beltStructure` | **discard** | Deleted on product path. Do not import Python belt. |
| Mode B as cold success | **discard** | Report-only on cold; mid-session only. |

### Epoch: session disk (strict mon)

| Surface | Rec | Why |
| --- | --- | --- |
| Portable forest + envelope | **reshape** | Should be **TOM serialization + identity adapter**, not a third schema. Keep match ≥50%, freshness, `focusWindowId`. |
| `resolveStrictMonitor` | **keep** | Must not merge with T6 majority. |
| Richness guard, 12s hold, ~3s shield | **keep** | Three distinct dual-head races. Do not remove without live proof. |
| `toLiveForest` → `applyMonitorSnapshot` | **port** | Same T6 apply as H1, different resolve ctx. |
| Raise-after-restore DFS | **keep** (Host Z-order) | Not TOM. Do not unify with tab-click raise. |

### Epoch: H1 / T6 (majority / stableKey)

| Surface | Rec | Why |
| --- | --- | --- |
| T6 capture / restore / percents | **port** as TOM snapshot API | Closest in-memory TOM. Strip Meta/St from the **pure** module; Tree wrap may create actors. |
| `resolveTargetMonitor` | **keep** | H1-only policy. |
| Last-good WeakMap + T7 keys | **keep** (Host) | Pre-thrash truth; Meta lies mid-burst. |
| workareas classify (R016/R017) | **keep** | Compose with H1; not a third recovery system. |
| `safeMoveToMonitor` | **keep** (Host) | SEGV gates. |
| Shield reapply vs snapshot-thrash | **keep** | See do-not-rescan. |
| Layout-group snapshot | **park** | Test/compat. Production uses T6 only. |
| `extractOuterLayoutGroups` | **park** | Compat bridge. |

### Shared / not an epoch

| Surface | Rec | Why |
| --- | --- | --- |
| `lib/shared/layout-plan.js` | **reshape** | Stay gi-free. Split domains (below). |
| `scripts/forge/layout_plan.py` | **park** | Oracle / `forge layout` dump / pytest. Freeze; no `cli/` port (D036). |
| GetTree `projectForest` | **keep** (Surfaces) | CLI/DBus. Stop treating it as the TOM snapshot. |
| T7 `monitor-identity.js` | **keep** | Shared Host helper. |

## Entry points for later agents

- Apply DBus: `session-api.js:ApplyLayout` → `LayoutApplyRunBag.start`.
- Home lock: `window.js:beginApplyEpoch` / `endApplyEpoch`.
- Plan: `layout-plan.js:planReconcile` (GetTree JSON) →
  `layout-apply-structure.js:buildStructurePlan`.
- Mutate tree: `session-api.js:_runApplyLayoutSteps` (RunSteps).
- Machines: `layout-apply-slot.js:startSlotMachines`; predicate
  `layout-apply-settle.js:windowIsSettled`.
- Success: `matchRequiredTileSlots` then `_finishSpine` (D070 optional).
- Session save: `snapshotTree` → `toPortableForest` → envelope.
- Session restore: `restoreSessionLayoutAfterTrack` →
  `resolveStrictMonitor` + `applyMonitorSnapshot`.
- H1: `MonitorRecoveryManager.queueMonitorRecoveryOnWorkareas` →
  `recoverAfterWorkareas` → `_runH1MonitorRecovery`.
- T6: `tree.js:snapshotTree` / `restoreTreeIfNeeded`.
- Identity: `monitor-identity.js`; workareas:
  `workareas-policy.js:classifyWorkareasChange`.

## Open questions

1. After TOM lift, should apply **set a desired TOM** and TreeOps-diff,
   or keep RunSteps as the epoch language? Blocks whether
   `planActionsToSteps` is port vs park.
2. One TOM snapshot codec + adapters (live Meta / portable identity /
   GetTree DTO), or keep three shapes? Blocks session/T6/GetTree
   import.
3. Are skeleton placeholders a Host-only leaf, or a TOM `kind`? Do not
   invent a kind without a Mark 2 lock.
4. Does `LayoutCommandEpoch` belong under Epochs in layers.md, or Host
   echo? Name collision will produce a third monitor-resolve-style
   merge if left unnamed.

## Do-not-rescan traps

- **Two resolve functions — do not merge.**
  `resolveTargetMonitor` (`tree-snapshot.js` ~L142) = T6/H1:
  survivors-on-snapshot-mon → stableKey → **majority**.
  `resolveStrictMonitor` (`session-layout.js` ~L894) = session HUP:
  stableKey / exact id, **no majority**. Majority after HUP
  re-implements the pile-up. Strict after hybrid renumber attaches
  to a dead `moN`.
- **Shield vs H1.** Post-restore ~3s (or lock-long) shield:
  `recoverAfterWorkareas` reapplies `liveForest` and **must not**
  `snapshotTree()` Meta-piled topology. H1 is the live thrash path
  when shield is down. Distinct from ApplyEpoch skip-H1.
- **Belt deleted.** Product apply opens into the slot (D042/SM6).
  `layout_apply.py:belt_actions_from_plan` is leftover Python, not
  architecture. D070 is **not** belt. Do not add `ensure_layout`
  after bind as the happy path.
- Apply planner forest is **GetTree `projectForest`**, not T6
  `captureForest`. WINDOW keys: `windowId` vs `window: Meta.Window`.
- `ApplyEpoch` ≠ `LayoutCommandEpoch` (geom echo ~350ms).
- Overlay: **D071** clears at Done; chrome.js header still says D043.
- D070 on only when `production` (or flag); `./install --dev` is loud
  on purpose.
- Production H1 uses T6 only; `snapshotLayoutGroups` is test/compat.
- `createCon` in T6 restore still births `St.Bin` in `tree.js`.
- Python planner size ~5799 vs JS ~5256 — not a line-for-line twin;
  product path is JS.

---

## Focus answers

### 1. Three forest writers must stay distinct

```text
Given:   dual-head; Meta piles both apps onto primary
```

| Writer | Trigger | Forest meaning | Mon policy | If used for the others |
| --- | --- | --- | --- | --- |
| **ApplyEpoch** | `forge layout` / ApplyLayout | **Desired** profile (may open/bind) | Profile slots / PlaceNext into slot | Running apply during H1 fights Meta and cancels anyway (skip H1). Session is “what was,” not “what I named.” |
| **Session disk** | disable / install HUP | Last-good **live** tree, portable ids | **Strict** | Majority here = pile-up (the HUP bug). T6 Meta refs do not survive HUP. |
| **H1 T6** | workareas thrash | Pre-burst **in-memory** tree (Meta leaves) | stableKey / **majority** | Strict here fails when `moN` renumbered. Apply desired mid-thrash is a different writer and is cancelled. |

```text
proven  design.md § Two monitor resolve policies (~L185–196)
proven  Apply displays-changed → cancel + skipH1
        (layout-apply-epoch.js:policyOnDisplaysChangedDuringApply ~L80;
         monitor-recovery.js ~L178–185)
```

They stay distinct because **failure mode, identity, and mon policy**
differ. Sharing geometry/fingerprint helpers is fine; sharing resolve
is not.

### 2. Strategy to import vs spaghetti

**Import (strategy):**

1. ApplyEpoch is the only home writer while live.
2. Materialize forest (skeleton + bind existing + open **into slots**).
3. Slot machines: slot = WINDOW or group CON; hard = in-slot; retry
   place N=2; peers independent.
4. `Done.ok` = required forest match.
5. Focus once + soft residual + verify-once **after** all-hard.
6. Overlay until Done (D071). Belt not a pass.

**Spaghetti (reshape/discard):** D008 phase array as sequencer;
5256-line planner mixing sugar/Chrome/Mode B; replan on every slot
retry *looking* like belt; D070 sitting in `_finishSpine`; GetTree
projection as the apply tree; Python belt still in-tree; chrome
header vs D071; `LayoutCommandEpoch` name.

### 3. `layout-plan.js`: purity vs leftover policy

gi-free: **proven** (file header; no `gi://`). Size ~5256.

Domains inside (line bands):

| Band (approx) | Domain |
| --- | --- |
| L1–300 | Profile constants, shares, mon keys |
| L300–1430 | `normalizeProfile` / desugar sugar |
| L1430–1935 | `validateReconcileProfile` |
| L1935–2600 | Forest walk, `classEq` / Chrome family, `collectWindows` |
| L2667–3008 | Skeleton, bind, claim, rolePins |
| L3017–4271 | Focus, order, size, park, `detectThrash`, structure compare |
| L4413–4993 | `planReconcile` (orchestrates all of the above) |
| L5068–5256 | `planActionsToSteps` |

Could it emit TOM snapshots / OpSet steps? **guess (open Q1):** a
desired-forest compiler could emit a TOM snapshot; TreeOps would
reconcile. Today it emits **plan actions** (`open`/`move`/
`ensure_layout`/`ensure_order`/`bind`/`ensure_skeleton`/park/focus)
then RunSteps. That is a Surface language, **not** Mark 2 OpSet
(Move/Join/Peel/Launch). Do not dump Chrome PWA / FLOAT class lists
into TOM to get there.

### 4. Settle: Host+Presenter sensors, not TOM

```text
proven  windowIsSettled (layout-apply-settle.js ~L103): mode TILE|grab,
        monitor, parentId/layout/type, ε rect vs slotRect
proven  soft: runSoftFocusBarrierOnSignals + pinLayoutOpenLeaf;
        heuristics keys host|class|processKind|residualKind
```

Hard waits Meta signals (`layout-sensors.js` / bags). Soft is focus
steal + learned quiet. Neither inspects TOM child-list equality;
`matchRequiredTileSlots` re-plans and checks in-slot +
`structureMismatches`. Keep settle **out of TOM**.

### 5. Must not fold into TOM

- **Placeholders** — Host stub + GetTree tag; slot reservation.
- **Open-leaf pin** — focus residual (D018).
- **Overlay** — Presenter scrim; pointer eater.
- **D070** — prod one-shot structure repair; “not the architecture.”
- Heuristics timings, last-good WeakMap, workareas fingerprints,
  PlaceNext queue, chaos cocktail, Chrome-family `classEq`, FLOAT
  class denylist, LayoutCommandEpoch echo, LayoutController verify
  sensor, belt.

### 6. Dual Python/JS planner (D036)

```text
proven  D036: product policy in lib/shared/ gi-free ESM; do not port
        layout_plan / layout_apply into cli/
proven  Product apply: layout-plan.js planReconcile (D037/D038)
proven  Python still: dump_layout_expected.py, layout_save.py,
        tests/unit/cli/test_layout_plan.py, forge layout dump
proven  JS tests: tests/unit/shared/layout-plan-reconcile.test.js
        (AL1 expected parity)
```

Status: **JS is product; Python is parked oracle.** Ideas.md: “Freeze
Python `layout_plan.py` as oracle — not a task.” Do not start a JS
rewrite for cleanliness. Do not merge belt from Python back into JS.

### 7. Are session-layout.json and T6 already TOM serializations?

**Partly.** Same recursive CON/WINDOW spine (layout, children,
percent, `userSized`, LTF). Gaps:

| | T6 in-memory | Session disk | GetTree (apply) |
| --- | --- | --- | --- |
| Leaf key | `window: Meta.Window` | `id` + class/title/pid/frame | `windowId` + wmClass/title |
| LTF | `lastTabFocus` Meta | `lastTabFocusId` | `lastTabFocusId` |
| Envelope | `{version, monitors}` | + `kind`, monotonic, `focusWindowId` | `apiVersion`, focus, ws meta, **orphans**, placeholder tags |
| ROOT/WS spine | monitors only | monitors only | monitors only |
| Apply? | `applyMonitorSnapshot` | convert → T6 apply (strict) | not applied; planned against |

```text
proven  toPortableForest comment: “Convert a live T6 forest … JSON-safe”
        (session-layout.js ~L119)
proven  toLiveForest: “Resolve portable → live T6 forest”
        (~L725)
```

If TOM is the in-memory tree, **T6 is the live snapshot**; session is
T6 + identity codec; GetTree is a DTO. Import: one TOM snapshot
schema, two adapters (portable match, query projection). Do not
pretend GetTree **is** TOM.
