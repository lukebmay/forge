# Plan: In-process `ApplyLayout` (layout rearchitecture)

**Status:** **AL0 locked** · **AL1 + AL4 code done** · next AL2  
**Priority:** after Insert A live + tab-click residuals + **TD1** (all
done)  
**Decision:** [D037](../../docs/DECISIONS.md) · shape [D038](../../docs/DECISIONS.md)  
**Branch:** `master`  
**Related:** [forge-cli-node](./forge-cli-node.md) (thin client only
after DBus exists) · [project.md](../project.md) § Layout apply
architecture · D008–D019 · D021 · D034–D036  
**Created:** 2026-08-14  
**Updated:** 2026-08-15 (AL1+AL4)

## Why this exists

`forge layout` is a host Python process that **polls GetTree** and
drives RunSteps / LayoutBatch over DBus. That is why apply feels slow
and why planner logic cannot share Meta signals with the Shell.

A Node rewrite of `layout_plan.py` **inside `cli/`** would keep the
same poll loop. Do not do that (D036 / cancelled CN8–CN12).

## Goal (product)

User still types `forge layout <name>`.

- Extension owns the cold spine on Meta signals + existing bags.
- CLI loads the profile file and **attaches** / streams status.
- One planner: GetTree-shaped JSON in, actions out, **gi-free**.
- R027 chrome is the in-progress visual.
- IC4 waiter-fold is **skip** — those waiters die with the poll loop.

## Recommended design (locked)

One coherent architecture. Options that lost are below so implementers
do not re-open them.

### Spine ownership

Extension owns the **whole** D008 spine, in-process:

```text
skeleton → open → bind → order/size → hard-ready → focus once
         → soft residual → verify once
```

| Phase | In-process wait | Named APIs |
| --- | --- | --- |
| Skeleton | none (sync tree) | RunSteps `skeleton` / placeholders |
| Open | Meta map + windowId + D034/D035 pin/admit | PlaceNext + spawn facade; `OpenCommitManager`; `admitUntrackedWindows`; LayoutBatch begin |
| Bind / order / size | LayoutBatch release then residual steps | RunSteps `bind` / `order` / `size` / move; **not** `_layoutOp` flatten |
| Hard-ready | Meta TILE / rect / mon signals; ~5s call clock | Shared `windowIsSettled` predicate; `layout-sensors` attribution |
| Focus once | `revealGroupChild` + pin | D018 / D025 / R025 / R026 |
| Soft | learned quiet; steal → pin restore + reset quiet | `settle-math` + open-leaf pin; heuristics file write |
| Verify | one mismatch pass | existing verify helpers; correct at most once |
| Belt | only if just-opened pin roles still wrong mon | D014 moves-only |

Waits are **SignalBag / SourceBag / OpenCommitManager / pin / sensors**.
Not CLI `time.sleep` + GetTree.

Replan after open stays (today’s residual `plan_reconcile` with
`role_pins` / `just_opened_roles`). It runs **inside** the extension
on a fresh in-process forest snapshot, not a second CLI round-trip.

### DBus shape (lock)

**Method name: `ApplyLayout`.** New top-level on
`org.gnome.Shell.Extensions.Forge`. Do not overload `LayoutBatch`.

**Not a blocking call.** GNOME DBus method timeout (~25s default)
cannot hold a cold apply (map + 5s hard + learned soft). “One DBus
call” in the stub meant **one product entry**, not one synchronous
return-when-done.

| Member | Kind | Role |
| --- | --- | --- |
| `ApplyLayout(request_json) → result_json` | method | **Start** the run; return immediately |
| `GetLayoutApply(apply_id_or_empty) → result_json` | method | Current / named run snapshot (late attach) |
| `CancelLayoutApply(apply_id) → result_json` | method | Cooperative cancel |
| `LayoutApplyProgress` | signal `s` | Phase lines as JSON |
| `LayoutApplyDone` | signal `s` | Terminal JSON |

`ApplyLayout` request (all keys optional except `profile`):

```json
{
  "profile": {},
  "name": "dev",
  "workspace": 0,
  "hostJobId": "d021-id",
  "flags": {
    "clean": true,
    "keepOthers": false,
    "safe": false,
    "forceClose": false,
    "waitTreeStable": false
  }
}
```

Immediate result:

```json
{ "ok": true, "applyId": "…", "started": true, "phase": "skeleton" }
```

Busy (extension single-flight):

```json
{
  "ok": false,
  "code": "busy",
  "error": "apply already running",
  "applyId": "existing-id"
}
```

Progress payload: `{ applyId, phase, event, message, counts? }`.
`phase` uses D008 names (`skeleton` / `open` / `bind` / `order` /
`size` / `hard-ready` / `focus` / `soft` / `verify`). `event` is
`enter` | `leave` | `info` | `warn`.

Done payload: `{ applyId, ok, phase, result? | error, code? }`.

`GetLayoutApply("")` returns the current run, or the last terminal
snapshot if none is live (enough for `--detach` inspect + missed
signals).

Bump `SESSION_API_VERSION` when these land (today **9**). CLI
feature-detects via `Ping.apiVersion` (and method presence).

**LayoutBatch stays.** It is the open-all / defer-paint bag (CL5/CL8/CL9).
`ApplyLayout` **calls** `beginOpenLayoutBatch` / `releaseDeferredOpens` /
`endOpenLayoutBatch` / `admitUntrackedWindows` internally. External
`LayoutBatch` + `RunSteps` remain for `forge run` and tests until
cutover; they are not the product `forge layout` path.

**RunSteps stays.** Executor maps plan actions through the existing
ops (`skeleton`, `bind`, `order`, `size`, `move`, `focus`, …). Port
`actions_to_extension_steps` into `lib/shared` next to the planner.
Do not invent a second step engine.

### Job durability (lock)

**Split ownership. Do not replace D021.**

| Layer | Owns | Does not own |
| --- | --- | --- |
| Host job runner (`job_runner.py`, later Node) | TTY survival, attach/stream, `--detach`, `forge jobs`, mutator lock, disk `jobs/<id>/` | The spine, Meta waits |
| Extension apply run | Single-flight in-memory run, phase machine, unwind | Disk job dir, SIGHUP policy |

- Caller disconnect **does not** cancel. Apply keeps going.
- Host worker: load profile → `ApplyLayout` → listen to signals
  (fallback: poll `GetLayoutApply`) → print phase lines → exit on
  `LayoutApplyDone`.
- Host `job_id` ≠ extension `applyId`. Worker writes `applyId` into
  `status.json` for debug.
- `forge jobs cancel` / attached Ctrl+C → worker
  `CancelLayoutApply(applyId)` then exits. Cancel is **cooperative
  at the next phase boundary** (or when the current hard/map wait
  times out). Always unwind: LayoutBatch end if begun, chrome clear,
  no Mode B.
- Job timeout (D021, default 300s) still cancels via the same path.
- Double single-flight is fine: CLI mutator lock **and** extension
  apply lock. Extension lock is the real mutex (gdbus / second
  client). CLI treats `code=busy` as today’s `BusyError`.

No extension-side disk job. Shell crash loses the run either way;
windows would be mid-chaos anyway.

### Planner location (lock)

`plan_reconcile(profile, forestJson, flags) → plan` lives in
**`lib/shared/layout-plan.js`** (gi-free ESM).

- Input: the same GetTree-shaped forest `projectForest` already
  emits. ApplyLayout snapshots via the existing tree-query path
  (in-process; no DBus GetTree).
- Output: today’s plan object (`ok`, `actions`, `roles`, `counts`,
  `thrashState`, …). Expected fixtures freeze that JSON.
- Public names stay recognizable: `normalizeProfile`,
  `validateReconcileProfile`, `planReconcile` (JS camelCase; expected fixtures
  compare the **plan JSON**, not Python identifiers).
- D036: no `gi://`, no `node:`, no `fs` in this module. Extension
  and (later) Node CLI both import it.
- Do **not** plan against live `Node` / Meta objects. That would
  trap the planner in GJS and fork a second brain.
- `settle-math.js` may move to `lib/shared/` when the executor or
  Node store needs it (already called out in the CLI-node plan).
  Not a blocker for AL1.

Python `layout_plan.py` stays until expected-fixture parity + live cutover.
Then delete the apply/wait path; list/show/save stay until a thin
Node facade (not this plan’s giant).

### Chrome (lock)

**R027 / D010 stay the in-progress signal.**

- `ApplyLayout` shows chrome at start (including no-open).
- Phase `message` updates the chrome detail line.
- Clear after verify **or** terminal error / cancel. LayoutBatch
  **end still does not clear**.
- CLI stops calling `chrome-show` / `chrome-clear` on the new path.
- Chrome lifetime **equals the apply run**. Today’s 30s hard-clear
  (`LAYOUT_APPLY_CHROME_HARD_MS`) is too short for cold multi-open
  + hard + soft. Reset/extend the safety timer on phase enter;
  safety cap aligns with the job-class ceiling (~300s), not 30s.
  Pointer-blocking scrim stays.

### Error model (lock)

| Case | Behavior |
| --- | --- |
| WM not ready / bad profile JSON | `ApplyLayout` returns `ok:false` immediately; no run |
| Already applying | `code=busy` + existing `applyId` |
| Mid-phase failure | stop at that phase; Done `ok:false` + `phase` + `error`; unwind bags/chrome; **no Mode B** |
| Open spawn fail | continue other roles (today’s “do not abort mid-loop”); fail the run if required roles still missing after pin wait |
| Cancel | cooperative; unwind; Done `code=cancel` |
| Partial tree | last committed phase stays; honest failure, not a second spine |
| Heuristics | flush learned residuals on terminal ok/fail; skip if cancel before any wait |

Name the **phase** in every error. That is the D008 contract.

### What stays in the CLI forever

- Profile path resolve + file load (`layout_lib.resolve_profile`)
- `forge layout list \| show \| save`
- Optional `gdisplays` scene load **before** ApplyLayout
- Optional SettingsLoad preamble if the profile asks
- D021 job wrap, attach, `--detach`, `forge jobs`
- `--dry-run`: host GetTree + shared `planReconcile` (no mutation).
  Do not require a dry-run DBus path.
- Feature-detect / `FORGE_LAYOUT_LEGACY=1` (AL8 only, then delete)

Launch / map-wait / hard / soft / focus / verify **leave** the CLI.
If GJS spawn fails, the open phase fails — no CLI-launch fallback
(that would revive polls).

### REG-ensure-flatten / C1 `setLayout` (I1)

ApplyLayout is how the **cold path** stops flattening.

- Executor **must not** call `SessionApi._layoutOp` for profile
  structure. That path still wraps/flattens for ensure
  (REG-ensure-flatten).
- Map `ensure_layout` actions to `tree.setLayout` (I1) +
  `mergeWindowsIntoGroup` / order / size / skeleton+bind.
- If a expected plan still *requires* flatten on the cold happy path,
  that is a **planner** bug (AL3), not an executor flatten.
- Mid-session keybind `layout` toggles already use `setLayout`.
  `_layoutOp` remains only until a later FCC slice deletes it.
  Do not mix C2 into ApplyLayout.

### Migration (lock)

```text
AL1 expected → AL2/AL3 planner pures
         ↘
AL4 DBus stub + chrome + signals   → AL5 structure (no-open)
                                   → AL6 open + map signals
                                   → AL7 D019 settle
                                   → AL8 thin CLI + delete Python waiters
```

- Dual path until AL8 live sign-off on `_forge-test-*` (not personal
  `dev` / `t1`).
- CLI: if `ApplyLayout` exists **and** `FORGE_LAYOUT_LEGACY` unset →
  new path. `FORGE_LAYOUT_LEGACY=1` forces Python apply during AL8
  only, then **delete**.
- CN13 (Node PATH router) is **independent**. Python may call
  ApplyLayout. Thin Node `cli/layout.mjs` is AL8 or a later CN
  facade — do not block CN13 on planner port.
- No feature-flag gsetting. Ping `apiVersion` is enough.

### Expected fixtures / parity (lock)

Freeze **Python output**, then delete Python. Do not keep a live
Python oracle (that blocks deletion).

**Naming:** do not use color-like labels (including “gold”) for layout
names or fixture dirs. Synthetic host = `forgetest`; synthetic layout
profiles = `layoutA`, `layoutB`, … Real hosts stay colors/plants/heroes.

- Existing inputs: `tests/unit/cli/fixtures/layout/`
- Expected: `tests/unit/cli/fixtures/layout/expected/<case-id>.json`
  `{ profile, forest, flags, plan }`
- Cover: empty / perfect / wrong-mon / extra copy / nested HSPLIT /
  thrash report-only / residual replan with `role_pins` /
  clean vs keepOthers vs safe
- AL1 is dump-only (4.5 low). AL2–AL3 must match frozen JSON.
- Live sign-off is still the partial-reload matrix on
  `_forge-test-*` (project.md), not units alone.

## Options considered

### 1. One blocking method vs begin/progress/end

| Option | Verdict |
| --- | --- |
| **A.** Blocking `ApplyLayout` returns when the spine finishes | **Reject.** DBus timeout cannot hold map + D019. |
| **B.** CLI still drives LayoutBatch begin / RunSteps / end and only moves waiters to JS | **Reject.** Keeps the poll loop in spirit; D036/D037 forbid it. |
| **C.** Async `ApplyLayout` start + Progress/Done signals + Get/Cancel | **Take.** One product method; streamable; attachable. |

Today’s CLI streams phase lines on **stderr** via `_eprint` (counts,
thrash, “ok”). That UX stays: host worker prints Progress `message`
lines. **Do not freeze** every current string. Freeze the **phase
vocabulary**, not byte-identical stderr.

### 2. LayoutBatch vs new ApplyLayout

| Option | Verdict |
| --- | --- |
| Grow LayoutBatch into the spine (`begin` means apply profile) | **Reject.** Batch is a paint/open bag; chrome lifetime is already *not* batch lifetime (D010). Overload would twin the job. |
| New `ApplyLayout` that **uses** LayoutBatch | **Take.** Catalog: extend named APIs; new job → new sibling on SessionApi. |

### 3. Job runner

| Option | Verdict |
| --- | --- |
| Drop D021; extension is the only durability | **Reject.** Loses attach/detach/`forge jobs`/TTY policy. Shell is not a job daemon. |
| Host worker still **orchestrates** DBus steps | **Reject.** That *is* today’s poll loop. |
| Host worker **observes**; extension owns the run | **Take.** D021 unchanged; apply survives TTY death *and* worker death (until cancel). |

### 4. Planner home

| Option | Verdict |
| --- | --- |
| `cli/layout-plan.mjs` | **Reject.** D036 / cancelled CN10. |
| `lib/extension/layout-plan.js` only | **Reject.** Couples policy to GJS; Node dry-run/tests suffer. |
| `lib/shared/layout-plan.js` (JSON in / actions out) | **Take.** D036 product kernel. |

### 5. Chrome

Keep R027. It is already the apply-in-progress signal. Do not add a
second overlay or a CLI-only spinner.

## OPEN (operator — not a hard stop)

None of these block AL1 or AL4. Ack the plan to start.

1. **Stderr strings.** Recommend: same phases + readable lines; not
   a freeze of today’s `_eprint` text. Say if a script parses
   current layout stderr.
2. **`FORGE_LAYOUT_LEGACY`.** Recommend: AL8 kill-switch only, then
   delete. Say if you want it longer.

## Non-goals

- Porting `layout_plan.py` / `layout_apply.py` into `cli/`
- Implementing production code in AL0
- Changing profile JSON schema
- Personal-layout product branches
- Mode B as cold success
- Extension-owned disk jobs / a layout daemon
- Blocking DBus `ApplyLayout`
- Deleting LayoutBatch or RunSteps primitives
- Folding IC4 waiters into the poll loop we are deleting
- CN13 / Node PATH router
- FCC C2 / deleting `_layoutOp` on the keybind path
- Cross-mon TABBED product (separate D0)

## Slice plan

Implementers start **AL1** and **AL4** after operator ack (parallel
OK: no shared files). Do not port the planner in AL4.

### AL1 — Expected plan dump of Python plans

**Agent:** 4.5 low. **No port.**

- [ ] Dump script reads existing
      `tests/unit/cli/fixtures/layout/` (+ residual-pin cases)
      through current `plan_reconcile`
- [ ] Writes
      `tests/unit/cli/fixtures/layout/expected/<case-id>.json`
      `{ profile, forest, flags, plan }`
- [ ] Document how to regenerate; do not “improve” plans
- [ ] No JS planner; no DBus

### AL2 — Shared normalize / validate / desugar

**Depends:** AL1 (or can start against live Python, then lock to expected fixtures). **Agent:** 4.6. **gi-free.**

- [ ] `lib/shared/layout-plan.js` exports normalize + validate +
      desugar used by `validate_reconcile_profile`
- [ ] Vitest expected: those stages match frozen profile IR
- [ ] No `gi://` / `node:` / `fs`
- [ ] Python still owns apply

### AL3 — Shared `planReconcile` expected-fixture parity

**Depends:** AL1 + AL2. **Agent:** 4.6. Do not simplify D034/D035.

- [ ] `planReconcile` matches frozen `plan` JSON (actions + roles +
      counts + thrashState) for every expected case
- [ ] Includes residual replan with `rolePins` / `justOpenedRoles`
- [ ] `planActionsToSteps` port of `actions_to_extension_steps`
      (still unused by CLI)
- [ ] Cold `ensure_layout` actions must be executable **without**
      `_layoutOp` flatten (or the expected/planner is wrong — fix here)

### AL4 — DBus `ApplyLayout` surface

**Depends:** AL0 ack. **Parallel with AL1–AL3.** **Agent:** 4.6.

- [ ] SessionApi: `ApplyLayout` / `GetLayoutApply` /
      `CancelLayoutApply` + Progress/Done signals
- [ ] In-memory single-flight run bag (`LayoutApplyRun` or
      equivalent Lifetime/SourceBag — not new one-off timer fields
      on WM)
- [ ] R027 show at start / clear on terminal; chrome safety cap
      aligned to apply lifetime (not 30s)
- [ ] Stub executor may emit phases and Done without planning
- [ ] Units: parse request, busy, cancel unwind, chrome lifetime
- [ ] Bump `SESSION_API_VERSION`

### AL5 — Structure executor (no-open)

**Depends:** AL3 + AL4. **Agent:** 4.6.

- [ ] Snapshot forest via tree-query → `planReconcile` →
      `planActionsToSteps` → existing RunSteps / LayoutBatch
- [ ] No-open apply (already-mapped roles) runs the structure
      half of the spine
- [ ] Does **not** call `_layoutOp`
- [ ] L0: expected plan → mocked tree/WM steps
- [ ] Nest `_forge-test-*` no-open smoke when JS lands

### AL6 — Open + map on Meta signals

**Depends:** AL5. **Agent:** 4.6.

- [ ] Port `open_action_to_launch_fields` / ghostty rewrite /
      chrome-family serialize (D034) to `lib/shared`
- [ ] GJS spawn + PlaceNext facade; no CLI launch fallback
- [ ] Map wait: admit + Meta census (D035) + title-then-class pin
      (D034) on signals, not GetTree poll
- [ ] Residual replan with pins; LayoutBatch begin → release → end
      before residual structure
- [ ] Nest/host `_forge-test-*` open path

### AL7 — D019 hard / soft / focus / verify in-process

**Depends:** AL6 (no-open hard/soft may land at end of AL5 if
cheaper). **Agent:** 4.6.

- [ ] Hard-ready on Meta signals + shared settled predicate;
      `HARD_TIMEOUT_MS` call clock
- [ ] Focus once via `revealGroupChild` + pin (D018)
- [ ] Soft barrier via `settle-math` + pin restore; heuristics
      write under `forgeConfigHome`
- [ ] Verify once; belt moves-only (D014)
- [ ] LF6 tree-stable stays **opt-in** (`waitTreeStable` flag)
- [ ] No JS function named as a GetTree poll twin of
      `wait_until_hard_ready`

### AL8 — Thin CLI cutover + delete Python waiters

**Depends:** AL7 live `_forge-test-*` PASS. **Agent:** 4.5 medium
for the client; 4.6 for deletions.

- [ ] Python (then Node) client: load profile, gdisplays,
      `ApplyLayout`, stream Progress, wait Done, map cancel
- [ ] Default new path; `FORGE_LAYOUT_LEGACY=1` only this slice
- [ ] Delete CLI apply body: GetTree poll waiters,
      `_layout_final_focus_pass` sleep, LayoutBatch chrome/begin
      orchestration
- [ ] Close IC4 as **skipped**
- [ ] Contracts: collapse “two settle brains” — CLI layout no
      longer waits
- [ ] Delete `FORGE_LAYOUT_LEGACY` before the slice is done
- [ ] `layout list|show|save` may stay Python

## Risks / kill criteria

| Risk | Kill / response |
| --- | --- |
| Expected-fixture port of 5.5k-line planner drifts (“improve” D034/D035) | Stop. Match frozen expected JSON. File a design note; do not silent-simplify. |
| Implementer puts planner in `cli/` | Stop. D036. |
| Blocking `ApplyLayout` “to keep it simple” | Stop. DBus timeout will flake live. |
| `_layoutOp` used “because ensure_layout already works” | Stop. REG-ensure-flatten. Fix planner/executor mapping. |
| New GetTree poll inside GJS | Stop. That is the disease. |
| Chrome 30s hard-clear aborts a live apply | Fix lifetime in AL4; do not lengthen CLI sleeps. |
| Dual path forever | AL8 deletes legacy. If live parity cannot be shown on `_forge-test-*`, stop and name the phase — do not ship both spines. |
| Mode B as cold success | Forbidden (HANDOFF). |
| IC4 implemented against the poll loop | Skip. Close when AL8 deletes waiters. |

## Tasks

| Slice | Path | Status |
| --- | --- | --- |
| AL0 design | [al0-design](../tasks/forge-layout-in-process_al0-design.md) | ready (ack to start AL1/AL4) |
| AL1 expected | [al1-expected-dump](./completed/forge-layout-in-process_al1-expected-dump.md) | done |
| AL2 normalize | [al2-shared-plan-normalize](../tasks/forge-layout-in-process_al2-shared-plan-normalize.md) | next |
| AL3 reconcile | [al3-shared-plan-reconcile](../tasks/forge-layout-in-process_al3-shared-plan-reconcile.md) | next |
| AL4 DBus | [al4-dbus-apply-layout](./completed/forge-layout-in-process_al4-dbus-apply-layout.md) | done (L0; nest pending) |
| AL5 structure | [al5-executor-structure](../tasks/forge-layout-in-process_al5-executor-structure.md) | draft |
| AL6 open | [al6-executor-open](../tasks/forge-layout-in-process_al6-executor-open.md) | draft |
| AL7 settle | [al7-executor-settle](../tasks/forge-layout-in-process_al7-executor-settle.md) | draft |
| AL8 cutover | [al8-cli-cutover](../tasks/forge-layout-in-process_al8-cli-cutover.md) | draft |

## Which agent

| Slice | `model` | Prompt as | Notes |
| --- | --- | --- | --- |
| AL0 design | `grok-4.6` | 4.6 **xhigh**; design only | This document |
| AL1 expected plan dump | `grok-4.5` | 4.5 **low** | Fixture → JSON only; no port |
| AL2–AL3 planner | `grok-4.6` | do not simplify D034/D035 | After AL1 expected dump |
| AL4–AL7 executor | `grok-4.6` | named APIs in contracts.md | After / parallel as above |
| AL8 thin CLI | `grok-4.5` | 4.5 medium | After DBus + settle live |
| Review | `grok-4.6` | A then B if used | After first live `_forge-test-*` |

## Session note

**2026-08-15 (AL0):** Locked async `ApplyLayout` + signals; host D021
job is observer; `planReconcile` in `lib/shared/layout-plan.js`;
R027 chrome stays; IC4 skip. D038 proposed/landed. Implement AL1 +
AL4 after operator ack. No production code this session.
