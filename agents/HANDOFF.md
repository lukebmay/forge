# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (operator logging out for fix smoke)  
**Branch:** `plan/forge-wayland-live` (pushed `origin`)  
**HEAD:** `42c8751` — cross-mon move, stale borders, Guake pointer  
**Installed disk:** `v49-90-beta.2-174-g42c8751` (logout required to run this)  
**Default:** `master` — **do not merge** until post-logout smoke OK  
**Remotes:** `test` / `prod` **not** touched  

**Plan:** [forge-wayland-live.md](./plans/forge-wayland-live.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Operator action now

1. **Log out and back into GNOME Wayland** (no HUP; disable/enable will not reload ES modules).
2. Confirm code:

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only origin plan/forge-wayland-live
forge ping   # versionName should include g42c8751 (or newer)
```

3. Smoke layout:

```sh
# Prefer cold-ish dual Ghostty; do not close the agent Ghostty
forge layout dev
forge tree
```

### Pass criteria

| Check | Expect |
| --- | --- |
| Topology | mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice) |
| YouTube Meta mon | `monitor: 1` (not 0); frame x on mon1 (~≥2600) |
| Active tabs | mon0 Grok; mon1 YouTube |
| Icons | Grok ≠ Chrome; Gmail ≠ YouTube |
| Borders | No leftover smaller red/yellow outlines after focus/move/resize |
| Guake F12 | Does **not** yank pointer; not under tab-strip geometry |
| Dry-run | At most residual focus ops (Grok/YouTube active + profile ghostty) |

4. If pass → **W4 thrash:** Super+Delete lock → unlock → `forge tree` + journal soft-rehome.  
5. If thrash OK → selection smoke → S3 → KB1+. Merge plan → master only then.

Logging (debug install):

```sh
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 5
```

---

## What shipped this wave (branch summary)

| Commit / area | What |
| --- | --- |
| W1–W5 | sizes, PlaceNext/PWA, Guake mon, residual belt, tab icons |
| **`42c8751`** | `move()` + `move_to_monitor`; live border actor hide; no float pointer-warp; float attach under MONITOR |

### Root causes found live (2026-08-05)

1. **YouTube invisible** — tree mon1, Meta mon0; clamp used mon0 work area → frame ~`x:1313`.  
2. **Stale borders** — `hideWindowBorders` used null/stale `Node._actor`.  
3. **Guake** — `move-pointer-focus` warped into float; float attached under LFT/TABBED.

---

## Architecture: Wayland vs X11 (honest status)

### Are we cleanly separating tracts?

**No — not as dual backends.** Today is:

| Layer | How session type is handled |
| --- | --- |
| **Tree / layout math** | Shared (good) — `tree-layout.js`, percents, tab/stack structure |
| **Mutter version drift** | Centralized — `compat.js` + `docs/dev/compat.md` (maximize flags, etc.) |
| **Wayland vs X11** | **Ad-hoc** — a few `Meta.is_wayland_compositor()` branches (HiDPI align, stacking pin, comments about map races). Most “Wayland fixes” are **shared-path hardening** (null class/title, late identity, move_to_monitor, actor cache) that also runs on X11 |

Scattered sites (not a module boundary):

- `tree.js` — Wayland transient `make_above` stacking pin on activate  
- `window.js` — buffer-scale align in `move()`; late title/class; map races  
- `decoration.js` — HiDPI border align  
- Docs/comments elsewhere (drag-drop, soft-rehome, session restore)

There is **no** `wayland/` vs `x11/` package, no session backend interface, no dual track for map → place → move → activate.

### Why that is risky (agrees with operator)

Mutter/X11 and Mutter/Wayland differ on:

- Map-time identity (null class/title)  
- Compositor private actor timing  
- Cross-monitor `move` / `move_to_monitor` semantics  
- Stacking / raise / focus  
- HiDPI coordinate spaces (fractional scale + `scale-monitor-framebuffer` on black)  
- Shell reload (X11 HUP vs logout-only)

Sprinkling `if (wayland)` inside `window.js` / `tree.js` will become spaghetti as black stays dual-session-capable.

### Recommended structure (not implemented — plan when smoke is green)

Keep **one product** (same tree model, same CLI, same prefs). Split **session mechanics**:

```text
lib/extension/
  layout/          # pure / shared: tree-layout, percent, query (no Meta session ifs)
  session/         # NEW boundary
    types.js       # SessionBackend interface
    shared.js      # helpers both use
    wayland.js     # map, place, move, activate, stack, border actor timing
    x11.js         # same surface, X11-safe behavior
    index.js       # pick backend once at enable via Meta.is_wayland_compositor()
  window.js        # orchestration only — calls backend, not raw session ifs
  tree.js          # structure; activate delegates to session backend
  compat.js        # KEEP for Mutter *version* (45/46/…), not X11 vs Wayland
```

**Surface area for dual implementations** (same method names):

| Method | Why dual |
| --- | --- |
| `onWindowMapped` / track | Identity race, float-exempt timing |
| `moveWindow(meta, rect)` | mon + clamp + resize order |
| `activateWindow(meta)` | stacking pin vs raise/activate |
| `resolveWindowActor(node)` | border hide/show |
| `alignRect(rect)` | HiDPI / buffer scale |

**Do not** fork the whole tiling tree or prefs. **Do** stop adding new `if (is_wayland)` in `window.js` — new session behavior goes behind the backend.

| Rule going forward (proposed) | Detail |
| --- | --- |
| New session-sensitive code | Backend method, not another mid-function if |
| Shared layout math | Stay pure; no Meta session checks |
| `compat.js` | Version only; never “if wayland” |
| Dual live smoke | black can stay dual; CI/unit mock both backends |

**When to plan this:** after logout smoke + W4, as a named plan slice (e.g. `forge-session-backend`) — **major redesign → plan + approve before large moves.** Until then, prefer shared hardening only when the bug is real on both; flag Wayland-only work clearly in notes.

---

## Follow-ups (do not lose)

### `move-pointer-focus-enabled`

**On black:** true. **Why:** keyboard focus warps pointer so attachNode / open-app / LFT stay coherent when pointer was on the other head.

**Better long-term:** open/place use **focus-monitor** (W3 started this); warp only on keyboard tile nav or only when pointer is on wrong mon; re-evaluate default false after open path proven.

See also Guake: floats no longer auto-warp (`force` keybind still can).

### Guake

Float override; mon-follow only; attach under MONITOR; no tile under TABBED. If still “lowered” after logout, compare Forge disabled vs enabled (Guake/XWayland prefs).

---

## Key code map

| Concern | Path |
| --- | --- |
| Cross-mon move | `window.js` `move`, `_monitorIndexForRect` |
| Borders hide/show | `decoration.js`, `tree.js` `windowActor` |
| Pointer / floats | `focus.js` `movePointerWith` |
| Float attach | `window.js` `trackWindow` |
| Guake mon | `window.js` `_applyFloatFollowMonitor` |
| Soft rehome | `soft-rehome.js` |
| Mutter version | `compat.js` |

---

## Human blockers

None hard. **Operator: logout/in → § pass criteria → W4 thrash.**

---

## Plans next

| Plan | Next |
| --- | --- |
| [forge-wayland-live](./plans/forge-wayland-live.md) | Logout smoke → **W4 thrash** |
| [forge-container-selection](./plans/forge-container-selection.md) | S3 after Wayland OK |
| [forge-desktop-keybinds](./plans/forge-desktop-keybinds.md) | KB1 after S3 |
| Session backend split | Draft after smoke (not started) |
