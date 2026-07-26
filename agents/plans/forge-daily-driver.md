# Plan: Forge daily-driver path

**Status:** Core **Done** — T0–T7 + OP1 + OP-opt; live-drive + bugfixes  
**Priority:** P1 product  
**Base:** this tree (`jcrussell/forge`) — **not** `~/dev/me/forge_original`  
**Host:** `black` (dual 4K, X11, Shell 46, hybrid AMD+NVIDIA; displays via shellrc `gdisplays`)  
**Analysis (required reading):** [forge-layout-thrash-analysis.md](./forge-layout-thrash-analysis.md)  
**Related:** [forge-harden-and-session.md](./forge-harden-and-session.md), [forge-command.md](./forge-command.md)  
**Completed (prior):** [soft-rehome](./forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)

### Session note (2026-07-26)

**OP-opt Done (B AGREE)** — [completed task](./forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md).  
Enable live: `gsettings set org.gnome.shell.extensions.forge tiny-pane-tab-fallback-enabled true`  
T0–T7 + OP1 + OP-opt + FC0–FC5 done. Later: T9 multi-line tabs.
---

## Goals

1. **Tab groups work** — labels always present (never empty gap / 1-of-N missing); drag-to-tab reliable; stack optional/off.
2. **Blank/wake multi-mon** — windows stay on correct heads; tab groups survive thrash.
3. **Predictable tile sizing** — equal share by default until user sets size; clear policy (flex-like contract later).
4. **First-class keybinds** — safe defaults (no bare Super+ letter grabs); layout presets (e.g. vim); save/load custom profiles.
5. **Predictable open-app placement** — dock sticky mon; else LFT attach; tab join + aspect split; new tile takes focus (becomes next LFT).
6. **Path to `forge` CLI / scripting** — OP1 + snapshot → [forge-command](./forge-command.md) (launch/move/swap); `workon` later.

**Non-goals (now):** full rewrite; rebase on upstream; gdisplays v2 in this repo; pin-to-tile constraints; full CSS flex engine; multi-line tab wrap (North Star only); always-on production size chrome; full i3 IPC; inventing `workon` DSL before `forge` CLI.
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
| **Open — dock** | Dock on mon M → sticky home to M (force Meta; no restore-geometry steal). Attach: LFT **on M** if any, else mon root. | User 2026-07-25 |
| **Open — terminal / generic** | **LFT only** (global last focused tile). Terminal’s monitor is **not** intent. Optional explicit place later via `forge launch`. | User 2026-07-25 |
| **Open — no LFT** | No tiled windows → mon 0 (first) for generic/script; dock still uses dock mon. | User 2026-07-25 |
| **LFT definition** | Last Focused **Tile** (tiled mode only). Floats (Guake) never become LFT. New mapped tile takes focus → becomes LFT for next open. | User 2026-07-25 |
| **LFT MRU** | **Global + per-monitor** MRU rings of tiled windows (one structure, ship together in OP1). Move-to-front on focus; drop on destroy. Dock attach uses **per-mon** head; terminal/generic uses **global** head. Close-focus restore keeps a tile focused when possible → LFT rarely empty. | User 2026-07-25 |
| **Tab join** | If LFT in TABBED/STACKED → insert **after** LFT in that group. | User 2026-07-25 |
| **Split orient** | Else LFT taller than wide → **VSPLIT**; else **HSPLIT**. | User 2026-07-25 |
| **Tiny-pane fallback** | **V1: none** — allow split into small panes. Optional later brainstorm: **OP-opt** min-edge rule (not area %). | User 2026-07-25 |
| **CLI / workon** | User-facing control plane = **`forge` CLI** ([forge-command](./forge-command.md)). `workon` deferred (FC5) until forge subcommands exist. | User 2026-07-25 |
Full rationale and code citations: **[analysis](./forge-layout-thrash-analysis.md)**.
Open-app detail: **OP1** phase below; session: [forge-harden-and-session.md](./forge-harden-and-session.md) Phase 3.

### Reference daily layout (session profile target)

User’s usual dual-head morning layout (roles via gdisplays, not raw indices long-term):

| Monitor | Side | Content |
| --- | --- | --- |
| **left** | full left | Tab group: Chrome, Grok |
| **left** | full right | Ghostty (often → tab group or VSPLIT with Nautilus / other) |
| **right** | full left | Ghostty (often → tab group or VSPLIT) |
| **right** | full right | Tab group: YouTube, email, Google Voice, calendar, … |

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
        ├──► T5 keybind system (safe defaults + presets + save/load)  [done]
        │
        ├──► OP1 open-app placement policy  [done]
        │         │
        │         ▼
        ├──► T6 full in-memory tree snapshot  [done]
        │         │
        │         ▼
        │    T7 stable output keys / mon roles  [done]
        │         │
        │         ▼
        │    FC* forge CLI  (see forge-command.md)  ◄── NEXT
        │
        ├──► OP-opt tiny-pane / tab fallback  (optional; after P1s)
        │
        └──► T9 unified multi-line tabs  (after T1 solid; optional stack return)
```

**Agent order:** FC0… (forge-command) → (T9 / OP-opt anytime after higher pri).
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
| **OP1** | [completed/forge-daily-driver_op1-open-app-policy.md](./forge-daily-driver/completed/forge-daily-driver_op1-open-app-policy.md) | **Done** | T4 | M | Dock sticky mon; global+per-mon LFT MRU; tab-after; aspect split; focus-on-create |
| **T6** | [completed/forge-daily-driver_t6-full-tree-snapshot.md](./forge-daily-driver/completed/forge-daily-driver_t6-full-tree-snapshot.md) | **Done** | T3; OP1 preferred | M | In-memory full tree for thrash restore |
| **T7** | [completed/forge-daily-driver_t7-stable-outputs.md](./forge-daily-driver/completed/forge-daily-driver_t7-stable-outputs.md) | **Done** | T6 | M | Connector/stable keys; remap layer (gdisplays-inspired) |
| **FC\*** | [forge-command.md](./forge-command.md) | **Done** (FC0–FC5) | OP1; T6–T7 | L | `forge` CLI + DBus + workon |
| **OP-opt** | [completed/…](./forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md) | **Done** | after OP1 + FC* | S | Min-edge tab fallback (default off) |
| **T9** | multi-line tabs North Star | Later | T1 proven | L | One group chrome; max_tabs_per_line |

When creating OP1/T6–T7/OP-opt task files, copy T0–T3 structure. FC\* tasks live under forge-command plan.

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

### Phase D2 — Open-app placement (OP1) — **done**

Fixes dock wrong-monitor intermittency + “new app no longer joins selected tab.”

#### Monitor + attach policy

| Source | Monitor home | Attach |
| --- | --- | --- |
| **Dock** (when detectable) | Sticky **dock’s** monitor (force Meta; grace vs re-home) | LFT **on that mon** if any; else mon root |
| **Terminal / generic / script without flags** | **LFT’s monitor** (not pointer, not terminal seat) | After LFT (tab / aspect) |
| **No LFT** (no tiles left) | mon **0** (first) for generic; dock still dock mon | mon root |
| **`forge launch` (later)** | Explicit `--monitor` / `--tree-path` or LFT default | Explicit or LFT |

#### LFT MRU (Last Focused Tile) — global + per-monitor **together in OP1**

Do **not** split global vs per-mon into separate tasks; one module, one review.

| Ring | Structure | Used when |
| --- | --- | --- |
| **Global** | ordered list of tiled nodes | Terminal / generic / `forge launch` default |
| **Per-monitor** | monIndex → ordered list of tiles on that mon | Dock sticky attach (“LFT on mon M”) |

- **LFT** = head of global ring; **LFT(m)** = head of mon `m` ring.
- On **tile** focus: move node to front of **global** and of **its monitor** ring.
- On destroy / untrack: remove from global and that mon’s ring. On rehome,
  drop from old mon ring and (on next focus) re-enter under live mon.
- Close path already restores focus to sibling / same-workspace NORMAL when
  possible (`_captureFocusRestore` / `_restoreFocusAfterWindowClosed`) → focus
  signal refreshes MRU. If no tiles left → rings empty.
- Floats (Guake) never enter either ring.
- **New window takes focus** after map → front of global + its mon ring → next
  open chains after it.
- Replace single `lastFocusedWindow` with this structure; keep `attachNode` in
  sync with the relevant head when practical. O(n) is fine for GUI window counts.

#### Insert shape

1. LFT parent TABBED/STACKED → insert **after** LFT in that CON.  
2. Else aspect split: LFT `height > width` → VSPLIT pair; else HSPLIT.  
3. **V1:** no auto-tab when small (see OP-opt).

#### Prefs / tests

- Clarify `new-window-placement` for dock sticky vs restore (`window-actual`).  
- Docs: `docs/user/monitors.md`.  
- Tests: dock sticky + no Meta flip; terminal uses **global LFT** mon not pointer;
  Guake focus does not enter MRU; tab-after; aspect H/V; global + per-mon MRU
  after close; focus-on-create chains opens; dock uses LFT(m) not other mon’s LFT.

### Phase D2-opt — Tiny-pane tab fallback (**optional**, after P1s)

**Status:** B AGREE (default off).  
**Task:** `agents/tasks/forge-daily-driver_op-opt-tiny-pane-tab.md` (ready complete)

**Shipped:** `shouldTabInsteadOfSplit` + `tiny-pane-tab-fallback-enabled` /
`tiny-pane-min-edge` (320). Open-app path only: if proposed 50/50 half-edge
&lt; max(min-edge, 12% workarea min, app min) → force TABBED CON around LFT.
Not area fraction; not manual splits.

### Phase E — Layout durability (T6–T7) + CLI handoff

- T6: serialize full tree in memory (layouts, order, size policy, window refs).
- T7: stable output keys / roles; remap on monitors-changed (gdisplays-inspired,
  not shellrc dependency).
- **Session / `workon`:** owned by **[forge-command.md](./forge-command.md)**
  (FC0–FC5). Do not invent workon DSL here.

### Phase F — Unified tabs (T9)

- After T1 rock-solid: `max_tabs_per_line`, wrap rows, stack = max 1.
- Deprecate STACKED as peer enum.
- **Also:** align doc/schema nits deferred from T0 (`config/settings.schema.json`
  stack default; `docs/user/layouts.md` “both modes on”) with the unified model.

---

## Next agent playbook

```text
1. Read this plan (OP1 locks + LFT MRU) + forge-command.md for later CLI.
2. Create + implement OP1 task if missing.
3. Then T6 → T7 → FC* (forge-command). Skip OP-opt and FC5 workon until asked.
4. npm test / make unit-test for logic changes.
5. Do not SSH to black without explicit user permission (AGENTS security).
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
