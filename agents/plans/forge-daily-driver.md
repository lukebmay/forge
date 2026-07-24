# Plan: Forge daily-driver path

**Status:** Ready — analysis locked; implement in task order  
**Priority:** P1 product  
**Base:** this tree (`jcrussell/forge`) — **not** `~/dev/me/forge_original`  
**Host:** `black` (dual 4K, X11, Shell 46, hybrid AMD+NVIDIA; displays via shellrc `gdisplays`)  
**Analysis (required reading):** [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md)  
**Related:** [forge-harden-and-session.md](./forge-harden-and-session.md) (H1 soft rehome code done; live verify still open)  
**Completed (prior):** [soft-rehome](./forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)

### Session note (2026-07-24)

**T5 done** (+ follow-up grammar/kits). Safe = **Ctrl+Super** only (no bare Super+);
kits **safe / vim / i3**; conflict scan + confirm; “Safe ≠ recommended” prefs copy;
save/load your kits. Completed:
[t5](./forge-daily-driver/completed/forge-daily-driver_t5-keybind-system.md).
**Next:** **T6** full in-memory tree snapshot (or later T7–T9 per priority).

**T4 done** (A/B **AGREE**). Completed:
[t4](./forge-daily-driver/completed/forge-daily-driver_t4-sizing-policy.md).

**T3 done** — blank/wake + tab survival (live black).  
**T2 done** — layout debug overlay (`Ctrl+Super+d`).  
**T1 done** — tab chrome reliability.  
**T0 done** — stack default off; DnD force tab.

---

## Goals

1. **Tab groups work** — labels always present (never empty gap / 1-of-N missing); drag-to-tab reliable; stack optional/off.
2. **Blank/wake multi-mon** — windows stay on correct heads; tab groups survive thrash.
3. **Predictable tile sizing** — equal share by default until user sets size; clear policy (flex-like contract later).
4. **First-class keybinds** — safe defaults (no bare Super+ letter grabs); layout presets (e.g. vim); save/load custom profiles.
5. **Path to session scripting** — full in-memory layout snapshot → stable outputs → disk/`workon` later.

**Non-goals (now):** full rewrite; rebase on upstream; gdisplays v2 in this repo; pin-to-tile constraints; full CSS flex engine; multi-line tab wrap (North Star only); always-on production size chrome.

---

## Locked product decisions

| Topic | Decision | Source |
| --- | --- | --- |
| Base tree | Stay on jcrussell; re-arch in place | Both taskforces |
| Stacking | **Off by default**; tab-first; optional later as chrome of tabs | User + both TF |
| Stack labels | Real chrome bug (empty gap / partial labels) — fix reliability | User correction + code |
| Convert stack↔tab | Must **preserve group**; ungroup is separate | Both TF + user |
| Sizing | Equalize until user resizes; hybrid flex later; not big-bang flex now | Both TF; user flex intuition accepted as *contract* |
| Debug overlays | **Sooner rather than later** for human debugging (opt-in); not permanent always-on chrome | User 2026-07-24 |
| Disk tree | After full in-memory snapshot + soft rehome; not first thrash fix | Both TF |
| Multi-line tabs | North Star (`max_tabs_per_line=1` ≈ stack); after single-row reliable | Both TF + user |
| Keybinds | **First-class:** bare Super+ is user-space; defaults use Shift/Alt/Ctrl+Super combos; presets + save/load | User 2026-07-24 — **agreed** |
| gdisplays | Identity ideas only; no Python in Forge | Plan boundary |

Full rationale and code citations: **[analysis](./forge-layout-thrash-analysis.md)**.

---

## Dependency graph

```text
T0 stack-off + DND force-tab
        │
        ▼
T1 tab chrome reliability  ──────────────┐
        │                                 │
        ▼                                 │
T2 layout debug overlay (opt-in)  ◄───────┤  (can start after T1; helps T3+)
        │                                 │
        ▼                                 │
T3 H1 live verify + soft-rehome tab survival
        │
        ▼
T4 sizing policy (equalize / userSized)
        │
        ├──► T5 keybind system (safe defaults + presets + save/load)
        │
        ├──► T6 full in-memory tree snapshot
        │         │
        │         ▼
        │    T7 stable output keys
        │         │
        │         ▼
        │    T8 disk session / workon apply  (later; harden-and-session Phase 3)
        │
        └──► T9 unified multi-line tabs  (after T1 solid; optional stack return)
```

**Parallelism:** T5 (keybinds) can run after T0 if a separate agent wants UX work, but **do not** block T1–T3 on full keybind redesign. Ship a **schema default audit** note in T0 (which bare Super+ chords exist today).

---

## Task table

| ID | Task file | Status | Depends | Effort | Outcome |
| --- | --- | --- | --- | --- | --- |
| **T0** | [completed/forge-daily-driver_t0-stack-off-dnd-tab.md](./forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md) | **Done** | — | S | Stack off; DND center always tabbed; no join-as-stack when stack disabled |
| **T1** | [completed/forge-daily-driver_t1-tab-chrome.md](./forge-daily-driver/completed/forge-daily-driver_t1-tab-chrome.md) | **Done** | T0 preferred | S–M | Never empty gap; N labels for N children; fallback without app |
| **T2** | [completed/forge-daily-driver_t2-layout-debug-overlay.md](./forge-daily-driver/completed/forge-daily-driver_t2-layout-debug-overlay.md) | **Done** | T1 | S–M | Opt-in overlay: layout, %, auto/fixed, mon id — human + agent debug |
| **T3** | [completed/forge-daily-driver_t3-blank-wake-tabs.md](./forge-daily-driver/completed/forge-daily-driver_t3-blank-wake-tabs.md) | **Done** | T1; h1-verify | M | Live blank/wake OK; tab groups survive soft rehome |
| **T4** | [completed/forge-daily-driver_t4-sizing-policy.md](./forge-daily-driver/completed/forge-daily-driver_t4-sizing-policy.md) | **Done** | T1 | S–M | Equal until user resize; insert policy setting; min-size write-back |
| **T5** | [completed/forge-daily-driver_t5-keybind-system.md](./forge-daily-driver/completed/forge-daily-driver_t5-keybind-system.md) | **Done** | — (soft) | M–L | Safe defaults; presets (vim / safe); save/load profiles |
| **T6** | `agents/tasks/forge-daily-driver_t6-full-tree-snapshot.md` | Later | T3 | M | In-memory full tree for thrash restore |
| **T7** | `agents/tasks/forge-daily-driver_t7-stable-outputs.md` | Later | T6 | M | Connector/stable keys; remap layer (gdisplays-inspired) |
| **T8** | harden-and-session session API | Later | T6–T7 | L | Disk + `workon` apply |
| **T9** | multi-line tabs North Star | Later | T1 proven | L | One group chrome; max_tabs_per_line |

When creating T4–T9 task files, copy the structure of T0–T3 (problem, goals, acceptance, code touch list, tests).

---

## Phase detail (for implementers)

### Phase A — Group chrome reliability (T0–T1) — **start here**

**T0 — Stack off + DND force tab**

- Default `stacked-tiling-mode-enabled` → false.
- When stack disabled: center drop never produces/joins STACKED; convert existing STACKED→TABBED on drop or setting change (product: preserve children).
- Audit: list bare Super+ defaults in schema (for T5).
- Tests: DnD unit suite extended.

**T1 — Tab chrome invariant**

Invariant: *If CON is TABBED/STACKED and showtab on and tiledChildren ≥ 1, then decoration has one label per child (fallback OK); never reserve bar height with zero labels attached.*

- Fallback tab when `!app` (title/wm_class + generic icon).
- Self-heal if `decoration.get_n_children() < tiledChildren.length`.
- Prefer attach placeholders over hiding bar mid-session (hiding can flicker; empty gap is worse).
- Regression: null-app two-window tabbed; reparent/reset path.

### Phase B — Observability + thrash (T2–T3)

**T2 — Layout debug overlay (opt-in)**

User wants this **sooner** for human debugging; agents benefit too.

- Toggle: gsetting + keybind (use **modifier-heavy** chord, not bare Super+letter).
- Per tiled window or CON: layout type, percent / auto, monitor id `moNwsW`, optional min-size.
- Off by default; no effect on layout math.
- Helps verify T3/T4 without Shell.Eval archaeology.

**T3 — Blank/wake + tab survival**

1. Run [h1-verify](../tasks/forge-harden-and-session_h1-verify.md) on black after T0–T1 installed.
2. If tabs unwrap: snapshot layout groups (or full tree if T6 early) **around soft rehome**; relax `_containerFullyMigrates` (majority / cluster).
3. Consider settle >200ms if hybrid logs show longer thrash.
4. Document pass/fail in plan session note.

### Phase C — Sizing policy (T4)

- Equalize when no sibling is user-sized.
- Set user-sized only on explicit resize / golden / snap.
- Setting: equalize-on-new-window vs preserve (forge-7m3).
- After min-size redistrib, write back effective percents.
- Document Super+= / equalize; unit tests.
- **Not** full flex engine; design note for hybrid `{auto|%|px}` later in analysis.

### Phase D — Keybinds first-class (T5)

**Product lock (user 2026-07-24) — agreed:**

1. **Bare Super+ letter/number chords are user-space.** Defaults must not claim them aggressively (today many defaults *do*: focus hjkl, Super+c float, Super+x border, Super+g split, etc.).
2. Defaults should prefer **`Shift+Super` / `Alt+Super` / `Ctrl+Super`** (and further combos) so users keep Super+ for launchers/desktop.
3. **Preset layouts** (one click): e.g. `safe` (default shipping), `vim` (current hjkl-style Super+/Shift+Super set), maybe `i3-ish`.
4. **Save / load** custom keybind profiles (build on existing `keybindings.json` + config-sync; prefs UI to apply preset / export / import named profile).
5. Tedious one-by-one rebind to try styles is **unacceptable UX** for a tiling WM.

Implement as dedicated phase — do not half-fix by only changing two shortcuts. Schema migration: applying `safe` preset is the new default for fresh installs; existing users keep GSettings until they pick a preset.

### Phase E — Layout durability (T6–T8)

- T6: serialize full tree in memory (layouts, order, size policy, window refs).
- T7: stable output keys; remap on monitors-changed (ideas from gdisplays `identity.py`, not shellrc dependency).
- T8: disk + session apply for `workon` (coordinate with harden-and-session Phase 3).

### Phase F — Unified tabs (T9)

- After T1 rock-solid: `max_tabs_per_line`, wrap rows, stack = max 1.
- Deprecate STACKED as peer enum.
- **Also:** align doc/schema nits deferred from T0 (`config/settings.schema.json`
  stack default; `docs/user/layouts.md` “both modes on”) with the unified model.

---

## Next agent playbook

```text
1. Read this plan + forge-layout-thrash-analysis.md (skimming is OK for Round 1
   architecture if Round 2/3 + task table are loaded).
2. Work the next ready task under agents/tasks/ (or completed/ when done).
3. Implement T0 → T1 with unit tests; npm test / make unit-test.
4. Optionally T2 overlay if T1 done and thrash debug needed.
5. Do not SSH to black without explicit user permission (AGENTS security).
   H1 verify: prepare commands; user runs on black or grants explicit SSH.
6. Update this plan session note + task notes after each session.
7. Do not start T9 flex engine rewrite or pin-to-tile.
```

### Quality gates (any code task)

- `npm test` (or `make unit-test` / docker if preferred)
- `npm run format` if Prettier would fail husky
- No leftover `/tmp` test residue
- Update task file session note (overwrite, one note)
- Move plan-linked completed tasks to `agents/plans/forge-daily-driver/completed/` when done

---

## Relationship to other plans

| Plan | Role |
| --- | --- |
| **This plan** | Execution order for daily-driver correctness after dual analysis |
| [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md) | Why / evidence / taskforce answers — do not duplicate full analysis here |
| [forge-harden-and-session.md](./forge-harden-and-session.md) | H1 history; session scripting long-term; h1-verify task lives there until T3 closes it |
| [forge-fork-eval.md](./forge-fork-eval.md) | Fork choice already decided — use this tree |

---

## Explicit non-goals checklist

- [ ] Full greenfield rewrite  
- [ ] Rebase on `forge_original`  
- [ ] Merge gdisplays into this repo  
- [ ] Pin-to-tile constraint graph  
- [ ] Always-on size overlays in production chrome  
- [ ] Multi-line tabs before single-row reliability  
- [ ] Big-bang flexbox engine before T4 policy  
