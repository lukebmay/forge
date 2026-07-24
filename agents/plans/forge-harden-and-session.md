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

### Session note (2026-07-24)

Near-term path is **[forge-daily-driver.md](./forge-daily-driver.md)**.  
T3 + h1-verify **done** on black (idle+DPMS dual-head + tab pair + retab safe).
This plan keeps **session scripting / workon** after durability (T6–T8 path).
---

## Goal

1. **Daily-drive multi-display** that survives blank/wake, mild topology thrash, and retab without shell crash or “all windows smooshed on one monitor.”  
2. **Resize that feels predictable** — keyboard + mouse, multi-sibling, tabbed containers, min-size, no percent drift.  
3. **No crashes** as a hard constraint (defensive path coverage + regression tests for every known abort class).  
4. **`workon dev`-class session scripting** — declare apps, monitors, splits, tabs/order; one command opens and places everything.

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
# → ensures display scene (optional)
# → switches to workspace N
# → launches apps if not running
# → applies layout profile: splits, tabs, order, monitors
```

#### D.1 Layout profile format (declarative)

Store under e.g. `~/.config/forge/layouts/dev.json` (or `~/.config/forge/sessions/dev.toml` — pick JSON first for consistency with windows.json):

```json
{
  "name": "dev",
  "displayScene": "default",
  "workspace": 0,
  "monitors": [
    {
      "role": "left",
      "match": { "index": 0 },
      "root": {
        "layout": "hsplit",
        "children": [
          {
            "layout": "tabbed",
            "percent": 0.55,
            "tabs": [
              { "app": "code", "wmClass": "Code", "titleContains": "forge" },
              { "app": "ghostty", "wmClass": "com.mitchellh.ghostty" }
            ]
          },
          {
            "layout": "vsplit",
            "percent": 0.45,
            "children": [
              { "app": "firefox", "wmClass": "firefox" },
              { "app": "slack", "wmClass": "Slack" }
            ]
          }
        ]
      }
    },
    {
      "role": "right",
      "match": { "index": 1 },
      "root": {
        "layout": "tabbed",
        "tabs": [
          { "app": "spotify", "wmClass": "Spotify" },
          { "wmClass": "org.gnome.Nautilus" }
        ]
      }
    }
  ]
}
```

Matchers: `wmClass` (required for place), optional `titleContains` / `app` (desktop-id or command for launch). Tab **order** = array order; focus last or first via `"focus": "first"|"last"`.

#### D.2 Extension API (minimal, testable)

Expose **one** control plane (prefer **DBus** over relying on `Shell.Eval`, which is often locked down):

| Method | Purpose |
| --- | --- |
| `GetTree(workspace?)` | JSON snapshot (reuse e2e bridge projection) |
| `ApplyLayout(profileJson \| path)` | Build/move containers; assign windows by matcher |
| `PlaceWindow(criteria, slot)` | Single-window placement |
| `ReloadConfig()` | Existing Super+Shift+r semantics |
| `Ping()` | Health |

Implementation sketch:

- New module `lib/extension/session-api.js` (or `layout-apply.js`) owned by `WindowManager`.  
- Apply algorithm:  
  1. Resolve monitor match → monitor node.  
  2. For each leaf: find existing Meta.Window by class/title, else mark “pending launch”.  
  3. Build CON tree skeleton with layouts + percents.  
  4. Attach matched windows in **tab order**.  
  5. `renderTree("session-apply", true)`.  
  6. Return list of unmatched slots for the CLI to launch + retry.

**Do not** require apps to open in the right place first — place **after** map (like i3 `for_window` + swallow, but batch).

#### D.3 CLI / shellrc wrapper

```text
forge-session apply dev          # apply layout only
forge-session run dev            # apply + launch missing
workon dev                       # shellrc alias: gdisplays + forge-session run
```

Launch policy:

- Prefer `gio launch` / desktop files when `app` is an app-id.  
- Wait with backoff for `wmClass` (timeout + clear error).  
- Idempotent: second `workon dev` re-applies without duplicate windows if matchers hit existing.

#### D.4 Save current layout (stretch)

`forge-session save dev` — walk tree, emit profile with `wmClass`/`title` of current windows (no autostart commands filled — user edits `app` fields). Enables “set up once, capture, tweak.”

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

| ID | Task | Outcome |
| --- | --- | --- |
| S1 | Profile schema + docs | JSON schema next to windows.schema.json |
| S2 | In-process `applyLayout(profile)` | Unit tests with mocks (no DBus yet) |
| S3 | DBus (or safe local IPC) surface | `GetTree` / `ApplyLayout` / `Ping` |
| S4 | `forge-session` CLI in-repo or shellrc | `run` / `apply` / dry-run |
| S5 | `workon` integration | `gdisplays load` + `forge-session run` |
| S6 | Capture `save` (stretch) | Round-trip edit loop |

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
