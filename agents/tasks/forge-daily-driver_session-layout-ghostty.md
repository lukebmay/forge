# Task: Session-layout Ghostty mon / stack residual

**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Related plan:** [forge-harden-and-session.md](../plans/forge-harden-and-session.md)  
**Design:** [docs/DESIGN.md](../../docs/DESIGN.md) — “Session layout across install/update”  
**Archive (prior ship):** [session-layout-tab-click](../archive/entries/session-layout-tab-click.md)  
**Status:** open — partial success; one residual class of bug  
**Host:** `black` — dual 4K, X11, Shell 46, hybrid AMD+NVIDIA  
**Mode:** next session = **A/B implement–verify loop** (fresh agents; serial)

---

## User-facing symptom (latest, 2026-07-25)

After `./install` (build + enable + X11 Shell HUP):

1. **Most layout survives** (tabs, dual-head, splits) — much better than full thrash.
2. **Partial thrash:** left-monitor **Ghostty** tile ends up wrong — previously observed as **moved onto the right monitor** (right becomes `Ghostty | TABBED | Ghostty`, left only `TABBED`).
3. **Latest report:** even when structure looks close, the **left-monitor Ghostty is hidden under the right-monitor Ghostty** (not visible; stacking / mon rehome / geometry). User may confuse which of the two terminals was buried.

**Desired layout (user daily driver):**

| Monitor | Content |
| --- | --- |
| **Left (`mo0`)** | TABBED group (Chrome tabs…) **\|** Ghostty |
| **Right (`mo1`)** | Ghostty **\|** TABBED group (YouTube, Gmail, Voice…) |

**Acceptable after install/HUP:** same topology and monitors; both Ghosttys visible; no window fully buried under a sibling on another head.

---

## What already shipped (do not re-litigate)

Commits on `main` (local, ahead of origin; tip may move):

| Commit | What |
| --- | --- |
| `7911e1d` | Portable session-layout save/restore; tab click restack |
| `e83c603` | Debounced last-good + install HUP flush + strict mon rehome |
| `24f04e8` | class+title match; save hold; richness guard |
| `85a5516` | Flush must not overwrite richer last-good with thrash-flat |
| `003a636` | Cleanup diagnostic residue |
| `d012c64` | pid + frame/monitor on leaves; raise after restore (v1) |
| `2df7002` | Same-pid multi-window: rank by **frame center distance** (Ghostty) |

### Architecture (current)

| Piece | Path / behavior |
| --- | --- |
| Portable helpers | `lib/extension/session-layout.js` |
| Save / restore / rehome / raise | `lib/extension/window.js` — `_saveSessionLayoutForReload`, `_restoreSessionLayoutAfterTrack`, `_rehomeWindowsForSessionForest`, `_restoreSessionForestStrict`, `_raiseAfterSessionRestore` |
| Disk | `~/.config/forge/config/session-layout.json` via `ConfigManager` in `lib/shared/settings.js` |
| DBus flush | `SessionApi.SaveSessionLayout` — `lib/extension/session-api.js` |
| CLI | `scripts/forge/forge save-session-layout` (DBus; GetTree→JSON fallback) |
| Install HUP | `scripts/forge/_lib.zsh` `forge_restart_shell` flushes before `killall -HUP gnome-shell` |
| Tree snapshot apply | `lib/extension/tree-snapshot.js` — `applyMonitorSnapshot`, `pruneEmptyConsUnder` |
| GetTree fields | `lib/extension/tree-query.js` — `windowId`, `pid`, `monitor`, `rect` |

### Match order (createWindowResolver)

1. Meta `get_id()` (often **changes** on Shell HUP)  
2. `pid` — if **unique** among unmatched; if **multiple windows share pid** (Ghostty), rank by geometry among pid-mates  
3. Exact `wmClass` + `title` (Chrome titles stable; **Ghostty titles churn**)  
4. Same class: mon match bonus + frame overlap + **frame center distance score**  
5. Unique remaining class member  

### Restore path (enable / empty live snapshot)

```text
trackCurrentWindows (flat)
→ match portable leaves → liveForest
→ _rehomeWindowsForSessionForest (move_to_monitor + tree reparent)
→ _restoreSessionForestStrict (resolveStrictMonitor + applyMonitorSnapshot)
→ _raiseAfterSessionRestore (raise DFS + lastTabFocus + focus restack)
→ clear session-layout.json on success
→ renderTree
```

### Guards

- Freshness: same boot mono (wall fallback for CLI stamp domain), ≤30m  
- Match ratio ≥50% or keep flat (file **kept** on low match for retry)  
- Auto-save held ~12s after enable; richness score blocks thrash-flat overwrite of richer last-good  
- Flush uses `force: false` so thrash cannot clobber richer file  

### Tests

- `tests/unit/extension/session-layout.test.js` — portable round-trip, pile-up dual-mon, **same-pid Ghostty thrash**, frame-without-pid  
- `tests/regression/bug-tab-click-activate.test.js` — tab activate / decoration restack  
- Mock: `tests/mocks/gnome/Meta.js` — `get_pid()`  

---

## Open bug (this task)

### Observed

- **Z-order / visibility:** left-monitor Ghostty ends up **not visible**, described as under the **right** Ghostty.  
- Earlier in the same arc: left Ghostty **rehomed to mo1** (structural); latest wording emphasizes **hidden under** the other Ghostty (stacking and/or Meta still on wrong mon while tree claims mo0).

### Likely failure modes (investigate in order)

1. **`move_to_monitor` vs tree reparent race**  
   `_rehomeWindowsForSessionForest` calls `move_to_monitor` then `appendChild` on mon node. If Meta still reports mon1 while tree says mo0, render uses tree rects but compositor placement may lag or fight → window drawn on wrong head / under sibling.

2. **Raise order buries the wrong actor**  
   `_raiseAfterSessionRestore` raises all windows DFS then `lastTabFocus` then focus. Raising **right** Ghostty **after** left may not matter if rects don’t overlap — unless both still share mon1 geometry.

3. **Same-pid geometry match still swaps or drops left Ghostty**  
   If thrash renumbers columns so distance ranking swaps the two Ghosttys, left mon leaf gets the “right” terminal (or leaves one unmatched → flat on mon1 under the other).

4. **Apply snapshot without rehome completing**  
   `applyMonitorSnapshot` only cohorts windows **already under** target mon. If rehome failed, left Ghostty stays under mo1; mo0 rebuild omits it; mo1 HSPLIT gets an extra Ghostty (matches earlier structural thrash).

5. **Wayland-style stacking / X11 restack**  
   Cross-monitor “under” might mean stacked in `window_group` with wrong allocation still covering the left tile area (e.g. unmoved frame).

### Facts that bite agents

| Fact | Implication |
| --- | --- |
| Ghostty **one pid, many windows** | pid alone cannot disambiguate |
| Ghostty **title changes every prompt** | class+title fails after HUP |
| Meta **window id changes on HUP** | id-only restore fails |
| Dual 4K: mon0 ~x 0–5120, mon1 ~x 5120–10240 | Saved frames are absolute; thrash often piles both Ghosttys on mon1 with new x |
| Chrome multi-window **same pid** too | Geometry/title still needed; titles more stable than Ghostty |
| Flush saves **current** tree | If thrash already wrong, install preserves wrong layout — test only after a **known-good** layout |

### Live good layout (example after user retile)

```text
mo0ws0: HSPLIT → [ TABBED(chrome…), Ghostty ]
mo1ws0: HSPLIT → [ Ghostty, TABBED(chrome…) ]
Both Ghostty pid=4452 (example); different windowIds; different frames.
```

---

## Acceptance criteria (next session)

- [ ] After `forge save-session-layout` (or quiet render) on a **known-good** dual-Ghostty layout, `./install --force` (or HUP path) restores:
  - [ ] Left Ghostty still under **mo0** (tree + Meta `get_monitor()`)
  - [ ] Right Ghostty under **mo1**
  - [ ] **Both Ghosttys visible** (no buried under the other)
  - [ ] Tab groups on both heads intact
- [ ] Unit/regression covering: same-pid dual mon + thrash pile + rehome asserts **monitor index** on Meta mock after restore (not only tree parent)
- [ ] Optional: assert raise / compositor order does not leave non-focused mon windows unmapped incorrectly
- [ ] No leftover debug residue; `npm test` green
- [ ] Update this task + plan session note; archive only when **AGREE**

---

## Suggested A/B approach

### Task Force A (implement)

1. Reproduce on black: good layout → `forge save-session-layout` → inspect JSON (pid, frame, monitor per Ghostty) → `./install --force` → `forge tree --compact` + visual check.  
2. Instrument or assert: after `_rehomeWindowsForSessionForest`, each Ghostty `get_monitor()` matches plan; after render, frames don’t overlap cross-mon.  
3. Fix likely in:
   - rehome: wait/retry `move_to_monitor`, or re-track after Meta settle  
   - match: bipartite assignment for same-class cohort (avoid greedy swap)  
   - raise: raise **per-monitor** bottom-to-top; don’t global-raise right mon last in a way that steals focus/vis  
   - render: force `renderTree` after Meta mon settle  
4. Prefer small tests with two same-pid windows, thrash both to mon1, restore, expect mon0+mon1.

### Task Force B (verify)

1. Fresh agent; review diff only.  
2. Re-run unit tests; walk rehome + raise paths for collateral.  
3. If possible, reason about dual same-pid + pile; **DISAGREE** if Meta mon not asserted.  
4. No broad redesign unless A’s fix is wrong.

### Orchestrator

- Serial A→B; max 5 rounds; handoff only in this task + plan note.  
- Do not SSH unless user message includes **explicit**.  
- No commit/push unless user asks.

---

## Reproduce (black)

```bash
# 1. Arrange known-good dual Ghostty layout (see table above)
# 2. Flush
./scripts/forge/forge save-session-layout
# 3. Inspect leaves (pid/frame/monitor on both Ghosttys)
python3 -c "import json;from pathlib import Path;print(Path.home().joinpath('.config/forge/config/session-layout.json').read_text()[:2000])"
# 4. Install / HUP
./install --force
# 5. Inspect
./scripts/forge/forge tree --compact
# 6. Visual: both Ghosttys visible on correct heads
```

**Weak control:** only files copy without HUP does not exercise restore.

---

## Out of scope (this task)

- Full disk session / `workon` profiles (FC5+)  
- Perfect EDID identity (T7 partial; gdisplays stays shellrc)  
- Tab click (already fixed separately; re-open only if regressed)

---

## Session note (handoff)

**2026-07-25:** Session-layout install path largely works (tabs + dual-head). Residual: **Ghostty left/right identity + visibility** after HUP — same pid, title churn; frame-distance ranking shipped (`2df7002`) but user still sees left Ghostty **hidden under** right Ghostty (and earlier structural move to mo1). Next agents: A/B on rehome Meta mon + stacking/raise + match assignment; acceptance requires **both Ghosttys visible on correct monitors** after install from a known-good save.
