# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (Wayland residual code fixes; re-smoke next)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead of origin**; **not pushed**)  
**HEAD:** master has CL0–CL7; plan branch has CL8–CL11 + preflight + **Wayland residual fixes**  
**Wayland:** first smoke mostly OK; residual fixes unit-green — **install + re-smoke**  
**Stash:** `stash@{0}` still present (applied content landed on this branch; safe to drop after you confirm)  
**Remotes:** **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Wayland residual smoke:** [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
**Residual fixes (done unit):** [completed wayland residual](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_wayland-residual-fixes.md)  
**Historical Wayland plan:** on branch `plan/forge-wayland-live` (diverged; W1–W5 + W-storm)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL7 X11 | **Done** (operator green; on master) |
| CL8–CL11 + X11 polish | **Done** (plan branch) |
| Pre-Wayland prep (SEGV + move + rivals) | **Done** |
| Wayland residual smoke | **Partial** — first pass OK; residual code landed |
| Residual re-smoke | **Next — human** after `./install` |
| Merge plan → master | After re-smoke green enough |

---

## Pre-Wayland prep (landed on control-loop)

| Item | Why |
| --- | --- |
| `safeMoveToMonitor` hard gates | Wayland `get_monitor() === -1` + `move_to_monitor` **SEGVs** Shell (stash) |
| `move()` dest mon + 4px epsilon | Cross-mon tree place (YouTube stuck mon0); skip tiny reflow re-assert |
| Alive-window guard on `move()` | Dead Meta wrappers SEGV; try/catch insufficient |
| Rival GNOME tilers off | Install + enable disable TA/Pop/PaperWM/… (not i3/sway) |
| Tests | `safe-move-to-monitor`, `rival-tilers`, movement mon/epsilon; full vitest **2160** green |

**Installed (X11, needs Wayland logout to load ES modules fully):**

- path: `~/.local/share/gnome-shell/extensions/forge@jmmaranan.com`
- version: `v49-90-beta.2-155-gd81e4e2-dirty` (commit after this session will clean the dirty tag)
- `production=false`, `logging-enabled=true`, `log-level=4`
- `layout-apply-chrome-enabled=true` (disable if noisy)
- `org.gnome.shell disable-user-extensions` = **false** (if Forge vanishes after crash, check this first)

### Logging (schema is extension-local)

```bash
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 4   # INFO; 5 = DEBUG
```

### Agent git: stash

```sh
git stash list
# stash@{0}: On plan/forge-wayland-live: WIP … rival-tilers, soft-rehome, install scripts
```

Content was **applied** onto `plan/forge-layout-control-loop` (not popped onto wayland tip).  
**Do not drop** until human confirms this session’s commit is good; then `git stash drop` is fine.

---

## Operator action now (Wayland residual re-smoke)

Already on Wayland. Install latest plan branch, then re-check residuals:

```bash
cd ~/dev/me/forge
./install   # debug install; then reload Shell if needed (Wayland: logout/login or alt session)
forge ping
forge layout dev
forge tree
```

| Check | Expect |
| --- | --- |
| Tab icons | Gmail / YouTube / Grok each own icon (not swapped / bare Chrome) |
| Ghostty open | cwd ~ not the forge repo |
| Focus mon1 ghostty → open Nautilus | Aspect-split under ghostty (not mon-root end) |
| Drag vertical split | Top/bottom zones easier (nearest edge) |
| Preview hints on | Can enable; abort drag / disable setting — **never stuck dim** |

Full checklist: [residual-smoke](./tasks/forge-wayland-live_residual-smoke.md).

---

## CL8+ lock (user)

Parallel `forge layout` opens must:

1. **Hide** mapped windows (opacity) until residual  
2. **Not** carve temporary TILE/split geometry mid-batch  
3. Early **`move_to_monitor`** for PlaceNext home mon  
4. **No raise/activate** thrash during batch  
5. One residual plan + render; focus from **layout saved focus**  
6. Optional apply chrome (CL10) — **never stick** (hard clear ≤8s)  
7. Skip client position hints  

### Trial apply chrome

Default **on**. Dim ~50% + spinner + layout name. Disable if noisy:

```bash
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge layout-apply-chrome-enabled false
```

---

## Agent rules

| Rule | |
| --- | --- |
| Branch | `plan/forge-layout-control-loop` for CL8+ and this preflight |
| Push | Never unless human asks |
| Live data | No Dropbox/secrets mutate |
| Wayland load | Logout required (ES modules); HUP only works on X11 |
