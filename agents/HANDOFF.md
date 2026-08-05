# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (post-reboot layout smoke + YouTube/borders/Guake fixes)  
**Branch:** `plan/forge-wayland-live`  
**Default:** `master` — **not** merged yet (need logout smoke of this fix)  
**Remotes:** `test` / `prod` **not** touched  
**Queue:** [PRIORITY.md](./PRIORITY.md)

**Plan:** [forge-wayland-live.md](./plans/forge-wayland-live.md)

---

## Where we are

| Layer | Status |
| --- | --- |
| Wayland **W1–W5** | Shipped earlier; operator rebooted / on Wayland |
| Layout `dev` topology | Tree shape OK after reboot: mon0 tabs(Chrome,Grok)\|ghostty; mon1 ghostty\|tabs(YouTube,Gmail,Voice) |
| **YouTube not visible** | **Root cause found + fixed (needs logout):** Meta stayed mon0; tree slot mon1. `move()` never called `move_to_monitor` before clamp → frame pinned ~mon0 right half |
| **Stale tile borders** | **Fixed (needs logout):** `hideWindowBorders` used null/stale `Node._actor`; old smaller borders stayed visible over new tiles |
| **Guake interference** | **Partial fix (needs logout):** no auto pointer-warp for floats; float-exempt attach under MONITOR not TABBED LFT; float-follow mon move only (W3) kept |
| Icons | OK after logout (Grok/Gmail/YouTube PWA classes) |
| Soft-rehome thrash | **W4 not done** on Wayland |
| Selection S3 / desktop keybinds | After thrash + this smoke |

### Live evidence (2026-08-05)

- `forge ping` → `v49-90-beta.2-171-g975ed17` (pre-fix install; reinstall after this commit)
- YouTube: tree `rect` mon1 (`x:3861`) but Meta `monitor:0`, frame often `x~1313` width half — classic offscreen clamp to mon0 work area
- Guake journal: `moved pointer to [Guake!] at (3861,…)` with `move-pointer-focus-enabled true`
- Dry-run after stable layout: only residual focus ops (Grok active, YouTube active, profile ghostty) — expected

---

## Fix just landed (this session)

| Fix | Where |
| --- | --- |
| `move()` → `safeMoveToMonitor` before clamp/resize | `lib/extension/window.js` |
| Live actor resolve for hide/show borders; tree `renderRect` when Meta lagging | `lib/extension/decoration.js`, `tree.js` `windowActor` |
| Skip auto pointer warp for FLOAT; force still warps | `lib/extension/focus.js` |
| Float-exempt attach under MONITOR (not LFT tab bag) | `lib/extension/window.js` `trackWindow` |
| Unit tests | movement, pointer, borders |

**Wayland:** install + **logout/in** required for modules to load. Disable/enable is not enough.

---

## Next agent — after install + logout/in

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only origin plan/forge-wayland-live
./install
# LOGOUT / LOGIN Wayland
forge ping   # version must include new commit
gsettings --schemadir ~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas \
  set org.gnome.shell.extensions.forge logging-enabled true
```

### 1. Layout smoke

```sh
forge layout dev
forge tree
# YouTube: monitor field must be 1; Meta frame on mon1 (session-layout frame x≥2600-ish)
# Tab order mon1: YouTube, Gmail, Voice; lastTab YouTube; icons OK
# No leftover small red/yellow border ghosts after focus/move
```

Toggle Guake F12: should **not** yank pointer; should not sit as if under a tab strip (monitor-root float). W3 may still `move_to_monitor` to focus mon.

### 2. W4 thrash

Lock Super+Delete → unlock → `forge tree` topology stable; journal soft-rehome.

### 3. Then selection smoke → S3 → KB1+

### 4. Merge gate

Merge → master only when layout + borders + thrash OK (or thrash explicitly deferred).

---

## Follow-up notes (do not lose)

### `move-pointer-focus-enabled` — why it exists / rethink

**Setting:** `move-pointer-focus-enabled` (prefs: “Move pointer with focused window”). Currently **true** on black.

**Why it exists (code):** keyboard focus left/right/up/down and swaps call `movePointerWith` so the pointer sits inside the newly focused tile. Comment in `focus.js`: *“useful for making sure that Forge calculates the attachNode properly”*. Related: `new-window-placement: pointer` uses pointer mon for opens; `focus-on-hover` is separate (off).

**Why operator needed it:** likely so keyboard-driven focus kept LFT / PlaceNext / open-app mon correct when pointer was left on the other head (dual 4K). Without warp, focus mon0 + pointer mon1 → next open / dock sticky can attach wrong.

**Problems:**
- Warps into Guake and other floats on map/focus (annoying; fixed for floats unless `force`)
- Feels aggressive for everyday focus

**Better options to investigate (product task, not P0 now):**
1. Prefer **focus-window monitor** for open/place (already partly W3 `resolveFocusMonitor`) over warping pointer
2. Warp only on **keyboard** focus commands, not every focus signal
3. Warp only when pointer is outside the destination monitor (not every tile change)
4. Drop setting default to false once open-app + PlaceNext never use pointer mon alone

File later under container/open-app or a small `forge-pointer-follow` task. Do not flip default until open path is proven without it.

### Guake product stance

- `windows.json` float override remains
- W3 float-follow mon move stays for multi-mon F12
- Do **not** tile Guake or put it under TABBED parents
- Do **not** auto pointer-warp to Guake

If Guake still looks “lowered” after logout, compare Guake-only geometry with Forge disabled (Guake prefs / XWayland).

---

## Known constraints

| Topic | Detail |
| --- | --- |
| **No Wayland HUP** | Logout/in only for extension module reload |
| **Focus residual** | Dry-run 3 focus ops when topology perfect — intentional |
| **Don’t close agent Ghostty** | Dual-head ghostty load-bearing for layout roles |
| **Fractional scale 1.5** | black dual 4K; borders use dpi-scaled inset |

---

## Human blockers

None hard. Operator: **logout/in after install**, then §1–2 above.
