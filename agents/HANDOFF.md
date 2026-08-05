# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (border harden; layout dev OK; gate before session-backend split)  
**Branch:** `plan/forge-wayland-live` (pushed `origin`)  
**HEAD:** `cfa5820` — border registry + node ownership + tighter slot prefer  
**Installed disk:** `v49-90-beta.2-176-gcfa5820` (shell still on older until logout)  
**Default:** `master` — **do not merge** until operator confirms borders clean post-logout  
**Remotes:** `test` / `prod` **not** touched  

**Plan:** [forge-wayland-live.md](./plans/forge-wayland-live.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Status snapshot

| Layer | Status |
| --- | --- |
| Layout `forge layout dev` | **OK** (operator + live tree): mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice); YouTube Meta mon=1 |
| Cross-mon move | Shipped `42c8751` (`move_to_monitor` before clamp) |
| Guake / float pointer | Shipped `42c8751` (no auto-warp floats; float under MONITOR) |
| **Borders (this wave)** | **Hardened** — needs **logout/in** then re-smoke (Wayland modules) |
| Soft-rehome thrash (W4) | **Not done** on Wayland |
| Session backend split (W6) | **Not started** — architecture below; plan after border smoke green |

---

## Operator action now

1. **Log out and back into GNOME Wayland** (ES modules do not reload on disable/enable).
2. Confirm:

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only origin plan/forge-wayland-live
forge ping   # versionName should match HEAD (not g42c8751-only)
```

3. Smoke:

```sh
forge layout dev
forge tree
# Then focus/move/resize across mon0/mon1 and tab switches
```

### Pass criteria (stable gate before refactor)

| Check | Expect |
| --- | --- |
| Topology | mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice) |
| YouTube Meta mon | `monitor: 1`; frame on mon1 (~x≥2600) |
| Active tabs | mon0 Grok; mon1 YouTube |
| Icons | Grok ≠ Chrome; Gmail ≠ YouTube |
| **Borders** | **No leftover red/yellow/cyan outlines** after focus change, resize, tab switch, or re-layout — only the **current** focus (+ split edge if enabled) |
| Guake F12 | Does not yank pointer; not under tab-strip geometry |
| Dry-run | Residual focus ops only |

4. If borders **still** wrong: note color (red focus / yellow split / cyan tabbed / green selection), when (after resize? thrash? focus mon?), screenshot if easy — stay on this branch; do **not** start session-backend split.  
5. If pass → **W4 thrash** (Super+Delete lock → unlock → `forge tree`) → then draft **session-backend** plan for approval (major redesign).

Logging (debug install):

```sh
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 5
```

---

## Border fix (this session)

### What was still wrong after `42c8751`

Live actor resolve fixed null `_actor` cache, but:

1. **Map-time `border.show()`** for every new tile → half-size rings during `layout dev` thrash.  
2. **No registry** — borders live on `global.window_group`; if actor prop was lost, hide never found them.  
3. **Meta-preferring rect** only when area &lt; 50% of slot → moderate Meta lag left smaller outlines.  
4. Destroy path did not always clear node-owned borders.

### What shipped

| Change | Where |
| --- | --- |
| `_borderRegistry` + hide all registered on every hide | `decoration.js` |
| Node ownership `_focusBorder` / `_splitBorders` + reattach | `decoration.js` |
| `ensureFocusBorder()` always starts **hidden** | `decoration.js` + `window.js` track |
| Prefer tree slot when Meta mon/size/pos off (tight thresholds) | `_borderRectForWindow` |
| Destroy unregisters + clears node props | `windowDestroy` / disable |
| Unit tests (orphan hide, moderate Meta lag, ensure hidden) | `WindowManager-borders.test.js` |

### Key code map (borders)

| Concern | Path |
| --- | --- |
| Hide/show/registry | `lib/extension/decoration.js` |
| Map-time create | `window.js` `trackWindow` → `ensureFocusBorder` |
| Destroy | `window.js` `windowDestroy` → `_destroyActorBorder(..., node)` |
| Tree slot | `node.renderRect` / `node.rect` |

---

## Architecture: Wayland vs X11 (honest status)

### Are we cleanly separating tracts?

**No — not as dual backends.** Today is shared-path hardening + a few `Meta.is_wayland_compositor()` branches.

Scattered sites (not a module boundary):

- `tree.js` — Wayland transient stacking pin  
- `window.js` — buffer-scale align, late title/class, map races, mon move  
- `decoration.js` — HiDPI border align + actor timing  
- Docs/comments (drag-drop, soft-rehome, session restore)

### Recommended structure (not implemented — **plan + approve** after smoke)

Keep **one product** (tree, CLI, prefs). Split **session mechanics**:

```text
lib/extension/
  layout/          # pure / shared tree math
  session/         # NEW
    types.js
    shared.js
    wayland.js     # map, place, move, activate, stack, border actor timing
    x11.js
    index.js       # pick at enable via Meta.is_wayland_compositor()
  window.js        # orchestration → backend
  tree.js          # structure; activate → backend
  compat.js        # Mutter *version* only — never “if wayland”
```

| Method | Why dual |
| --- | --- |
| `onWindowMapped` / track | Identity race, float-exempt timing |
| `moveWindow(meta, rect)` | mon + clamp + resize order |
| `activateWindow(meta)` | stacking pin vs raise/activate |
| `resolveWindowActor(node)` | border hide/show |
| `alignRect(rect)` | HiDPI / buffer scale |

**Rule until then:** prefer shared hardening when the bug is real on both; flag Wayland-only work in notes. **Do not** start the large move until borders + W4 thrash are green and the operator approved a plan slice (e.g. `forge-session-backend`).

---

## Follow-ups (do not lose)

### `move-pointer-focus-enabled`

**On black:** true. Better long-term: open/place use focus-monitor; warp only on keyboard tile nav or wrong-mon pointer.

### Guake

Float override; mon-follow only; attach under MONITOR. If still lowered after logout, compare Forge off vs on.

---

## Human blockers

None hard. **Operator: logout/in → border + layout pass criteria → W4 thrash → then session-backend plan.**

---

## Plans next

| Plan | Next |
| --- | --- |
| [forge-wayland-live](./plans/forge-wayland-live.md) | Border smoke → **W4 thrash** → optional W6 plan |
| Session backend split | Draft after stable gate (major redesign — user approve) |
| [forge-container-selection](./plans/forge-container-selection.md) | S3 after Wayland OK |
| [forge-desktop-keybinds](./plans/forge-desktop-keybinds.md) | KB1 after S3 |
