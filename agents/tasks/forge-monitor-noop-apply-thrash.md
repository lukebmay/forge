# forge-monitor-noop-apply-thrash — No-op monitor re-apply must not thrash tiles

**Status:** ready  
**Plan:** (none) — regression class R016; related recovery: H1 / monitor-recovery  
**Branch:** master (default)  
**Blocker:** (none)  
**Priority:** P1 (daily driver; dual-mon + gdisplays)  
**Updated:** 2026-08-11  
**Regression id:** **R016** (see [REGRESSIONS.md](../REGRESSIONS.md))

---

## Goal

When Mutter re-applies a **geometry-identical** monitor config (same connectors, modes, scale, positions, primary), Forge must **not** thrash tiled windows. Prefer quiet no-op or a **structure-preserving retile** (recompute frames only). Do not enter the full workareas thrash / monitor-recovery rebuild path for no-op layout signals.

Ship **unit + live** guards so this class cannot regress.

---

## Why this is “thrash” not “retile”

| Expectation | Reality today |
| --- | --- |
| **Retile** | Same tree topology; recompute tile frames for new workareas; preserve mon homes, TABBED/STACKED, order, focus, percents. Cheap, local. |
| **Thrash** (observed) | `ApplyMonitorsConfig` / `workareas-changed` burst → thrash-pending → suppress/ignore mid-flight rehomes → monitor-recovery (H1) rehome + T6 forest restore + reconcile + render → windows **jump**, tabs **flatten or reshuffle**, focus **storm**. |

H1 recovery is correct for **real** dual-head chaos (lock/wake, GPU renumber, head peel). It is the **wrong** path when Meta fires the same signal class for a **no-op** config re-apply: geometry did not change, but the thrash pipeline still runs.

Root product gap: **no “workareas signal, geometry unchanged” short-circuit** before thrash-pending / recovery.

---

## Incident (2026-08-10/11, host `black`, shellrc gdisplays)

| Field | Detail |
| --- | --- |
| Host | `black` — dual MSI 4K @ **1.5**, AMD+NVIDIA hybrid, Forge daily driver |
| Sessions | Wayland (and X11 daily too); gdisplays profiles universal |
| Operator action | `gdisplays load default` after X11↔Wayland / scale heal |
| Live layout | Already correct: `*DP-4` + `HDMI-3`, scale 1.5, primary left |
| gdisplays behavior (pre-6.4.2) | Always called Mutter **`ApplyMonitorsConfig`** even when layout matched |
| Forge symptom | Tiled desk **thrashed** (not a calm retile) |
| Operator expectation | Loadout apply when already correct should be a no-op for windows |

### Upstream / sibling mitigation (shellrc — **not** a Forge fix)

shellrc **gdisplays 6.4.2** (`~/dev/me/shellrc`): skip D-Bus apply when live already matches loadout; message `(already applied)`.

- Code: `scripts/devices/displays/gdisplays/live.py` — `logicals_match_live`, `apply_logicals(..., force=False)`
- Docs: `configs/displays/README.md` (no-op apply note)
- Unit: `gdisplays.test_live_apply.TestLogicalsMatchLive`

**Forge still owns resilience.** Other tools (GNOME Settings apply, gsettings, dock, GPU probe) can re-fire the same signals without gdisplays. Do not depend on callers skipping apply.

### Signals / code map (Forge)

| Piece | Path / notes |
| --- | --- |
| workareas thrash → recovery | [docs/DESIGN.md](../../docs/DESIGN.md) § Monitor-recovery on workareas thrash (H1) |
| Debounce ~300ms thrash-pending | extension path; ignore `window-entered-monitor` while pending |
| T6 snapshot / restore | `tree-snapshot.js` / monitor-recovery rehome |
| T7 mon identity | `monitor-identity.js` — index renumber after hybrid |
| Existing H1 tests | `tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js` |
| Display disconnect (related, not same) | `tests/regression/bug-078-display-disconnect.test.js` |

Do **not** merge gdisplays runtime into Forge (prior design lock). Identity ideas stay separate; this task is **signal handling / settle policy**.

---

## Desired product behavior

1. **Geometry fingerprint** (or equivalent) of live workareas/monitors after settle.  
2. On `workareas-changed` (or equivalent monitor config signal): if fingerprint **unchanged** vs last quiet snapshot → **do not** set thrash-pending; **do not** run H1 rehome/rebuild. Optional: single quiet frame recompute if Meta lied about workarea pixels.  
3. If geometry **did** change (scale, mode, mon count, positions, primary) → existing thrash/recovery path.  
4. Preserve: mon homes, TABBED/STACKED, leaf order, lastTabFocus / open-leaf pin, percents.  
5. Logging: one clear line when no-op short-circuit fires (debug), so live diagnosis is cheap.

---

## Acceptance

### L0 (unit / pure)

- [ ] Pure helper (or regression test) that models: workareas-changed + **identical** mon geometry fingerprint → **no** thrash-pending / **no** monitor-recovery rehome call.  
- [ ] Contrasting case: geometry **changes** (e.g. scale 1.25→1.5 or mon count) → thrash/recovery path still armed.  
- [ ] Guard test name stable enough for REGRESSIONS row (e.g. `bug-r016-noop-workareas-no-thrash` or under `tests/unit/…`).  
- [ ] L0 green: relevant pytest/jest for touched modules.

### L1 (live — host or nest)

- [ ] Live case in `scripts/forge/live_matrix.py` tagged **`R016`** (and behaviors as appropriate).  
- [ ] Scenario sketch (implement with `_forge-test-*` layouts only):  
  1. Dual-mon quiet desk with ≥2 tiles (tab group preferred).  
  2. Snapshot tree fingerprint (mons, structure, leaf order, focus).  
  3. Trigger **no-op** monitor re-apply:  
     - Preferred automation: Mutter DisplayConfig apply of **current** config (same serial path as gdisplays), **or** inject workareas-changed if harness allows without real GPU thrash.  
     - Manual fallback: `gdisplays load default` **with** `GDISPLAYS_FORCE_APPLY=1` only if shellrc adds a force flag later; until then use D-Bus apply of current state from nest/host script.  
  4. After settle: tree structure + mon homes + focus **unchanged** (allow frame pixel epsilon if workareas truly identical).  
  5. Fail if: mon pile-up, tab flatten, focus thrash max-corrections, Mode B thrash-recover as “success”.  
- [ ] `forge test live plan --tags R016` documents the case; run when implementing.

### Docs / queue

- [ ] REGRESSIONS **R016** row: symptom, root cause, fix, guard tests (update when fixed).  
- [ ] DESIGN one-liner under H1: no-op workareas short-circuit (when implemented).  
- [ ] Task → `agents/tasks/completed/` when done.

---

## Context for the next agent (complete + succinct)

- **Proven:** gdisplays load with already-correct dual 4K@1.5 called `ApplyMonitorsConfig` → Forge thrash. shellrc 6.4.2 skips no-op apply; Forge still unprotected against other callers.  
- **Failed/why not enough:** Relying only on gdisplays skip — other tools re-apply.  
- **H1 path is intentional** for real thrash; R016 is **false thrash** (signal without geometry change).  
- **Do not** treat soft residual (D019) as this bug.  
- **Do not** start dual-mon nest by default for no-code docs; when coding, prefer `forge nested run` for retest.  
- **Layouts:** only `_forge-test-*` for live matrix.  
- **Related shipped:** H1 workareas recovery, T6/T7, R010–R015 structure/focus thrash classes — read REGRESSIONS before inventing a third recovery system.  
- **shellrc cross-ref:** `~/dev/me/shellrc` gdisplays 6.4.2 `logicals_match_live` (caller-side skip pattern to mirror at signal level).

---

## Suggested implementation slices (optional split)

| Slice | Work |
| --- | --- |
| A | Geometry fingerprint + pure no-op predicate + unit tests |
| B | Wire short-circuit on workareas-changed before thrash-pending |
| C | LIVE_CASES R016 + live harness trigger for no-op apply |
| D | DESIGN + REGRESSIONS fix columns; archive task |

---

## Session note

**2026-08-11:** Opened from shellrc gdisplays session. Operator: loadout load thrashed Forge windows; expected calm retile/no-op. gdisplays now skips no-op apply; Forge task owns false-thrash on identical monitor reconfigure + test suite coverage.
