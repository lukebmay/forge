# Plan: Forge harden + session scripting

**Status:** H1 soft rehome **code done**; daily-driver execution owns near-term work  
**Priority:** P1 product (session scripting later)  
**Base:** **this tree** (`jcrussell/forge`) — **not** `~/dev/me/forge_original`  
**Upstream ref only:** `~/dev/me/forge_original` (`forge-ext/forge` @ `v49-89`)  
**Host:** `black`, dual 4K, X11, Shell 46; hybrid AMD iGPU + NVIDIA; displays via shellrc `gdisplays`  
**Related:** [forge-fork-eval.md](./forge-fork-eval.md), shellrc gdisplays v1  
**Execution now:** [forge-daily-driver.md](./forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md)  
**Completed:** [soft-rehome](./forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)  
**Completed (verify):** [h1-verify](./forge-harden-and-session/completed/forge-harden-and-session_h1-verify.md) (via daily-driver T3)  
**Next (this plan’s long arc):** after daily-driver T6–T8 → Phase 3 session / `workon`

### Session note (2026-07-25)

**Session-layout slice shipped (not full Phase 3):** disable saves portable
topology to `config/session-layout.json`; enable restores when fresh so
install/update does not flatten dual-head tiles. Full `workon` profiles still
later. Near-term CLI: **[forge-command.md](./forge-command.md)**.
---

## Goal

1. **Daily-drive multi-display** that survives blank/wake, mild topology thrash, and retab without shell crash or “all windows smooshed on one monitor.”  
2. **Resize that feels predictable** — keyboard + mouse, multi-sibling, tabbed containers, min-size, no percent drift.  
3. **No crashes** as a hard constraint (defensive path coverage + regression tests for every known abort class).  
4. **`workon dev`-class session scripting** — launch + place via batched atomic ops (then optional declarative profiles); one command opens and arranges the morning layout.

**Non-goals (for now):** full i3 IPC parity, EGO publish ownership, gdisplays v2, dynamic GNOME workspaces, perfect portrait multi-mon navigation.

---

## Executive recommendation

| Decision | Choice | Why |
| --- | --- | --- |
| **Codebase base** | **jcrussell (this repo)** | Already re-decided in Phase A; reanalysis confirms: modular WM, 100+ tracked `forge-*` fixes, Vitest + Docker E2E + fuzzer, stacked/tabbed survive reload, workarea/monitor-less abort guards |
| **Do not base on** | `forge_original` | Seeks maintainer; thin monolith (`window.js` does everything); almost no tests; missing most crash/hardening |
| **Cherry-pick from original** | Optional, selective | Upstream **live mouse-resize polling** (`_startLiveResizeLoop`, commit `b504512`) is the only clear feature gap worth evaluating — port *after* understanding jcrussell’s hardened `size-changed` path |
| **gdisplays** | Stay in shellrc; independent | Connector identity/remap is display config, not tiling. Forge must tolerate thrash; it must not re-implement monitors.xml |

**Order of work:**

```text
0. forge-fork-eval Phase B/C  → daily-driver on this fork (or stay EGO v89 + reassess)
1. Crash + multi-mon survival (P0)
2. Resize predictability (P1)
3. Session / layout scripting API (P1–P2)  ← enables `workon dev`
4. Monitor identity hardening (P2, only if index thrash remains after gdisplays v1)
```

---

## Reanalysis summary (both trees)

### Architecture delta

| Area | Upstream (`forge_original`) | This fork |
| --- | --- | --- |
| Core size | `window.js` ~2900, `tree.js` ~1700 | `window.js` ~3700 + extracted `command`/`focus`/`decoration`/`monitor`/`workspace` |
| Tests | prettier-as-test | 1,400+ unit/regression + multi-mon e2e + seeded fuzzer |
| Multi-mon | Basic `mo{n}ws{m}` tree | Same model + skip-tile, workareas guard, cross-mon clamp, rehome, layout-group restore |
| Tabbed/stacked | Present, fragile on reload | `snapshotLayoutGroups` / `restoreLayoutGroups` across `reloadTree` (forge-bqa) |
| Config | GSettings + windows.json | + portable config-sync, cheatsheet, more prefs |
| Shell support | metadata ≤50.1 | 45–50; active mid-2026 commits |

### Incident model (why multi-mon + crash couple)

Observed daily pain on `black` (from fork-eval plan):

1. **Display layer:** hybrid GPU + USB4/HDMI connector renames / DPMS blank → GNOME workareas thrash or windows collapse onto one head.  
2. **gdisplays v1** fixes *identity* for load/save scenes (EDID/class/capability/role bijection) so `gdisplays load default` remaps without hand-editing XML.  
3. **Forge layer:** tree is keyed by **volatile monitor indices** (`mo${index}ws${ws}`). Index renumber after thrash + retab on a damaged tree historically crashed Shell.  
4. **This fork already hardens many of the abort paths** that upstream still hits casually (see below). Remaining work is survival under *your* thrash sequence + better recovery UX, not a rewrite.

### Crash classes already fixed here (do not re-solve)

| ID / area | Guard |
| --- | --- |
| forge-tpgh | `getWorkAreaSafe` — never call `get_work_area_current_monitor` when `get_monitor() < 0` (libmutter **assert aborts shell**) |
| forge-4b6 | `pruneDeadWindows()` first in every render idle |
| forge-bqa | stacked/tabbed survive `reloadTree` |
| workareas `n_monitors==0` | ignore transient zero-monitor (KVM/lock) |
| forge-h7ba | alive probes before Meta.Window use |
| decoration / tab actor | multiple use-after-dispose fixes (forge-v2yz, forge-6asv, …) |
| finally on idle IDs | render/reload cannot wedge for the session (Bug #531) |

### Remaining multi-display gaps

| Gap | Severity | Notes |
| --- | --- | --- |
| **Index-only monitor identity** | High under thrash | After connector reorder, nodes may point at wrong geometry until reload; windows can “stick” to wrong head |
| **Recovery is flat-ish** | Medium | `reloadTree` restores **outer** stacked/tabbed groups only; nested H/V percents reset; complex layouts still degrade |
| **Portrait / vertical secondary** | Known limit | Docs: not fully supported; `monitor-skip-tile` workaround |
| **Dynamic workspaces** | Known limit | Unsupported by design |
| **Blank → wake placement** | Daily | Need live trial proof; may need “soft rehome” without full wipe |
| **No layout persistence** | Blocks scripting | Tree is memory-only; lock screen preserves, logout does not |

### Resize: state of the art here vs upstream

**This fork (stronger correctness):**

- Keyboard resize with debounce + percent normalize (Bug #305 / multi-sibling)  
- Golden-ratio resize (`forge-zlg`)  
- Expand/shrink both axes without fake overlapping grabs (`forge-gm0z`)  
- Tabbed/stacked resize of **container** not overlapping tab (`forge-ox8`)  
- Reject maximize during keyboard-resize debounce (`a6cc261`)  
- Min-size redistribution tests (`bug-s6g`, `bug-e3xm`)  
- Mouse resize via `size-changed` → `_handleResizing` with multi-fire delta guards (Mutter 48 multi-signal)

**Upstream-only interesting bit:**

- **Live resize polling loop (~16ms)** during mouse grab so neighbors update smoothly even when `size-changed` is sparse/late. jcrussell does **not** have `_startLiveResizeLoop`. Port only if daily mouse-resize feels laggy after trial; otherwise leave alone (less timer surface = fewer lifecycle bugs).

### Scripting: what exists today

| Piece | Status |
| --- | --- |
| Tree model (H/V/stack/tab + percents) | Solid runtime model |
| `CommandHandler.execute({name})` | In-process only (keybindings) |
| `windows.json` overrides | float/tile rules only — **not** placement |
| Portable settings JSON | prefs/keybinds — **not** layout |
| E2E `Shell.Eval` + `_forgeTestBridge` | Full tree query/mutate for **tests** — proof that an external control surface is feasible |
| DBus / CLI for users | **None** |
| Layout serialize / apply | **None** (only in-memory stack/tab snapshot across reload) |

**Implication:** `workon dev` cannot be a pure shell script against current Forge. Need a small **session API** in the extension + a CLI (or shellrc wrapper) that launches apps and places them.

---

## gdisplays strategy (boundary with Forge)

Keep the hybrid model:

```text
gdisplays load <scene>     →  correct connectors, modes, primary, arrangement
Forge                      →  windows per monitor/workspace tree, tabs, resize
workon / forge-session     →  open apps + apply layout profile (future)
```

| Layer | Owns | Must not |
| --- | --- | --- |
| **gdisplays** | monitors.xml / Mutter apply, connector identity remap, named scenes | Tile trees, app launch |
| **Forge** | tree, focus, resize, float rules, (future) session profiles | Connector remapping, EDID policy |
| **shellrc workon** | user profiles: which apps + which forge layout name | Direct Mutter geometry hacks that fight Forge |

**Coordination rules for future `workon`:**

1. Prefer `gdisplays load <scene>` **before** placing windows when the profile names a display scene.  
2. Wait until `global.display.get_n_monitors()` and workareas stabilize (short settle, not infinite).  
3. Never call Forge retab/reload while `n_monitors == 0`.  
4. gdisplays v2 (best-fit modes) remains **optional** and independent — only open if mode-policy pain is daily.

---

## Target architecture (improvements)

### A. Multi-display survival (P0)

1. **Soft rehome on workareas-changed**  
   - When monitor count/geometry changes but windows still alive: map each window to best monitor by **intersection area** (or last known center), re-parent tree nodes without full wipe when possible.  
   - Fall back to `reloadTree` + layout-group restore only when structure is inconsistent.

2. **Stable monitor keys (P2 if still needed)**  
   - Today: `mo${index}ws${ws}`.  
   - Target: prefer connector name / EDID serial when available from Mutter, with index as fallback.  
   - Migrate tree node IDs carefully; dual-write during transition.  
   - Align naming with gdisplays roles (`left`/`right`) only at the **session profile** layer, not inside every tree node.

3. **Retab/stack safety**  
   - Ensure layout toggles and decoration updates never touch finalized actors (already largely done; add e2e: blank/wake simulation if possible + unit for “toggle tab on rehomed tree”).

4. **User recovery chord**  
   - Keep `Super+Shift+r` config reload; add or document a **“re-tile from current geometry”** that does soft rehome without destroying splits when possible.

### B. Resize predictability (P1)

1. Inventory daily pain after trial (keyboard vs mouse, 3+ siblings, tabs).  
2. Harden percent invariants: after every resize path, siblings sum ≈ 1.0; clamp by min size; never write NaN/negative.  
3. Optionally port upstream live-resize loop **behind a setting** (`live-resize-enabled`, default off until proven).  
4. Regression: extend `bug-resize-three-windows`, `forge-ox8`, keyboard e2e.

### C. Crash budget (continuous)

1. Treat any `gnome-shell` abort as P0.  
2. Pattern from forge-tpgh: wrap every Mutter call that asserts on monitor/window liveness.  
3. Fuzzer already filters some multi-mon noise — extend oracle for “no overlapping tiled siblings on same monitor” after thrash sequences.  
4. Journal capture recipe stays on the spike task.

### D. Session scripting — `workon dev` (P1–P2)

North star:

```bash
workon dev
# → optional gdisplays load <scene>
# → switches to workspace N
# → launches apps if not running
# → applies layout via batched atomic ops (one quiet render)
```

Depends on daily-driver **OP1** (open-app policy) so interactive and scripted
paths share the same monitor/attach rules when apps map “naturally.”

#### D.0 Procedural vs declarative (locked direction)

| Approach | Pros | Cons |
| --- | --- | --- |
| **Procedural** (sequence of atomic ops = keybind command surface) | Each step is already tree-valid; easy to test; matches mental model of “what I would type” | Naive run = flicker; racey if render every step |
| **Declarative** (JSON tree of monitors/splits/tabs/apps) | One-shot apply; good for save/round-trip; compact profiles | Validation surface; apply bugs leave half-trees; hard to debug |

**Decision: hybrid with procedural as the runtime MVP.**

1. **Author / execute** a **step script** (YAML/JSON list of actions).  
2. Extension runs steps against the **same** `CommandHandler` / tree primitives
   used by keybindings (`Split`, `LayoutToggle` tabbed, move/swap, focus, …)
   plus `Launch` / `WaitFor` / `FocusMatch`.  
3. **`freezeRender` (or equivalent) for the whole batch** → single
   `renderTree("session-apply")` at end (or per-monitor checkpoints).  
   That gives declarative *UX* (no flicker) without inventing a second layout
   engine.  
4. **Declarative profile** = optional **compile target**:  
   - `save` walks tree → emits steps *or* nested JSON  
   - nested JSON can compile → steps for apply  
   - validation is “does compile succeed + dry-run on mock tree?”

Why not pure declarative-first: user daily layout is simple HSPLIT+tabs, but
edge cases (already-open windows, partial re-run, Guake open) are natural as
steps (`focus mon left`, `launch chrome`, `wait`, `tab-join`, …). Atomic ops
already exist; batching is the missing piece.

**Anti-goals for MVP:** full i3 IPC; live GUI recorder (nice later).

#### D.1 Step-script format (procedural MVP)

Store under e.g. `~/.config/forge/sessions/dev.json`:

```json
{
  "name": "dev",
  "displayScene": "default",
  "workspace": 0,
  "steps": [
    { "op": "focus-monitor", "role": "left" },
    { "op": "launch", "app": "google-chrome", "wmClass": "Google-chrome" },
    { "op": "wait-window", "wmClass": "Google-chrome", "timeoutMs": 15000 },
    { "op": "launch", "app": "…grok…", "wmClass": "…" },
    { "op": "wait-window", "wmClass": "…" },
    { "op": "layout", "mode": "tabbed" },
    { "op": "focus-monitor", "role": "left" },
    { "op": "launch", "app": "ghostty", "wmClass": "com.mitchellh.ghostty" },
    { "op": "split", "orientation": "horizontal" },
    { "op": "focus-monitor", "role": "right" },
    { "op": "launch", "app": "ghostty", "wmClass": "com.mitchellh.ghostty" },
    { "op": "split", "orientation": "horizontal" },
    { "op": "launch", "wmClass": "…", "app": "…" },
    { "op": "layout", "mode": "tabbed" }
  ]
}
```

Ops map 1:1 to existing commands where possible. Monitors use **roles**
(`left`/`right`) resolved via settings or gdisplays-aligned match (T7).

Reference morning layout (user): left = tabs(Chrome,Grok) | Ghostty(+often
VSPLIT/Nautilus); right = Ghostty | tabs(YouTube, mail, Voice, calendar, …).

#### D.1b Declarative profile (later compile/save)

Nested tree JSON (prior sketch) remains valid as a **save format** and as input
to a compiler → steps. Matchers: `wmClass` (place), optional `titleContains` /
`app` (launch). Not the first apply path.

#### D.2 Extension API (minimal, testable)

Expose **one** control plane (prefer **DBus** over relying on `Shell.Eval`):

| Method | Purpose |
| --- | --- |
| `GetTree(workspace?)` | JSON snapshot (reuse e2e bridge projection) |
| `RunSteps(stepsJson \| path)` | Batched atomic ops; one quiet render |
| `ApplyLayout(profileJson \| path)` | Later: compile declarative → `RunSteps` |
| `PlaceWindow(criteria, slot)` | Single-window placement (also an op) |
| `ReloadConfig()` | Existing Super+Shift+r semantics |
| `Ping()` | Health |

Implementation sketch:

- `lib/extension/session-api.js` owned by `WindowManager`.  
- `RunSteps`: freeze render → for each op dispatch command/tree helper → unfreeze
  → one `renderTree`.  
- Launch/wait may live in CLI (out of process) with extension only doing place
  ops; or extension spawns via `Gio` — prefer **CLI launch + extension place**
  to keep Shell light.  
- Idempotent re-run: `wait-window` / matchers prefer existing windows.

#### D.3 CLI / shellrc wrapper

```text
forge-session run dev            # launch missing + RunSteps
forge-session apply dev          # steps only (apps already up)
forge-session get-tree           # debug
workon dev                       # shellrc: gdisplays + forge-session run
```

Launch policy:

- Prefer `gio launch` / desktop files when `app` is an app-id.  
- Wait with backoff for `wmClass` (timeout + clear error).  
- Idempotent: second `workon dev` re-applies without duplicate windows if matchers hit existing.

#### D.4 Save current layout (stretch)

`forge-session save dev` — emit either step script (replayable) or nested
declarative profile with `wmClass`/`title`. User fills `app` launch ids.
---

## Phased delivery

### Phase 0 — Install trial (existing)

**Plan:** [forge-fork-eval.md](./forge-fork-eval.md)  
**Task:** [forge-fork-eval_spike.md](../tasks/forge-fork-eval_spike.md)

- Backup EGO v89 → Node 20+ → `make dev` → smoke + blank/wake/retab.  
- **Gate:** only promote harden/session work to daily coding once this fork is the running extension (or trial fails with a clear bug list).

### Phase 1 — Multi-mon + crash survival

| ID | Task | Outcome |
| --- | --- | --- |
| H1 | Soft rehome on workareas / monitors-changed | **Done** (unit/regression); manual black verify open |
| H2 | Harden layout toggles after rehome | Retab never aborts shell (regression + manual) |
| H3 | e2e thrash scenario | Virtual dual-head: geometry change → assert no crash + windows on both monitors |
| H4 | Document recovery | User docs: blank/wake, Super+Shift+r, when to `gdisplays load` |

### Phase 2 — Resize

| ID | Task | Outcome |
| --- | --- | --- |
| R1 | Daily pain notes from trial | Prioritize keyboard vs mouse |
| R2 | Percent/min-size invariant helper | Single chokepoint used by all resize paths |
| R3 | Optional live-resize port | Setting + tests; default off until stable |
| R4 | Tabbed middle-child + 3-wide e2e | No drift |

### Phase 3 — Session scripting MVP

**Superseded for user-facing CLI by [forge-command.md](./forge-command.md)**  
(FC0–FC5). Keep this section as the **in-process** engine sketch; task IDs
map roughly: S2/S3 → FC0/FC4, S4 → FC1–FC2, S5 → **FC5 deferred**, S6 stretch.

Prerequisite: daily-driver **OP1** + **T6** + **T7**.

| ID | Task | Outcome |
| --- | --- | --- |
| S1 | (optional) step-script schema | Prefer forge-command FC4 |
| S2 | In-process `RunSteps` + freezeRender | Unit tests; quiet render |
| S3 | DBus surface | Fold into FC0 |
| S4–S5 | CLI + workon | **forge-command** FC1–FC5 |
| S6 | Declarative compile + save | Stretch after FC4 |
### Phase 4 — Monitor identity (only if needed)

| ID | Task | Outcome |
| --- | --- | --- |
| M1 | Prototype stable monitor id from Mutter | Fallback to index |
| M2 | Migration + tests | Hotplug / reorder without layout loss |

---

## Testing strategy

| Layer | Use for |
| --- | --- |
| Vitest regression | Every crash guard, percent invariant, applyLayout pure logic |
| Docker e2e multi-mon | Placement across heads, thrash if simulable |
| Fuzzer | Random ops must not abort; extend post-conditions |
| Manual on `black` | DPMS blank/wake, `gdisplays load`, real `workon dev` |

Quality gate before claiming “no crashes”: blank → wake → retab × N + journal clean.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Shell.Eval disabled / unsafe for production scripting | Prefer proper DBus interface owned by the extension |
| Apply races (window not mapped yet) | Pending slots + CLI wait loop; never block shell main loop long |
| Fighting GNOME app restore geometry | Place after map; optional short float then tile |
| Over-scoping i3-like IPC | MVP = apply profile + get tree only |
| Live-resize port reintroduces timer leaks | Feature flag + disable() must stop sources |

---

## Acceptance (plan-level)

- [ ] Phase 0 trial done; daily driver chosen  
- [ ] Blank/wake/retab does not crash Shell on `black`  
- [ ] Dual-head tiling remains independent after mild thrash or soft rehome  
- [ ] Resize: no multi-sibling percent drift in automated tests; manual OK for daily use  
- [ ] `forge-session run <name>` opens/places a multi-app multi-tab layout on dual head  
- [ ] `workon <name>` documented (shellrc or forge docs)  
- [ ] gdisplays remains independent; no connector logic in Forge  

---

## Task breakdown (initial)

| ID | Task file | Status |
| --- | --- | --- |
| 0 | [forge-fork-eval_spike.md](../tasks/forge-fork-eval_spike.md) | Ready (Phase B) |
| 1 | [soft-rehome](./forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md) | **Done** |
| 1b | [h1-verify](./forge-harden-and-session/completed/forge-harden-and-session_h1-verify.md) | **Done** (via T3 live) |
| 2 | `forge-harden-and-session_r-resize.md` | After H or parallel small fixes |
| 3 | `forge-harden-and-session_s-apply-mvp.md` | After apply design review |
| 4 | `forge-harden-and-session_s-dbus-cli.md` | After S apply core |

---

## Session notes

**2026-07-23:** H1 soft rehome implemented (see completed task). Manual blank/wake still to confirm on black.

**2026-07-16:** Reanalyzed both trees + gdisplays boundary. Confirmed base = jcrussell. Upstream live mouse-resize is the only notable cherry-pick candidate. Session scripting requires new layout profiles + apply path + CLI; e2e bridge proves introspection shape. Plan filed; execution gated on install trial.
