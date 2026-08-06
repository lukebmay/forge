# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (pre-Wayland prep landed; operator logout next)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead of origin**; **not pushed**)  
**HEAD:** master has CL0–CL7; plan branch has CL8–CL11 + chrome/ghost-deco + **Wayland preflight**  
**Wayland residual:** **operator next** — log out → GNOME **Wayland** session  
**Stash:** `stash@{0}` still present (applied content landed on this branch; safe to drop after you confirm)  
**Remotes:** **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Wayland residual smoke:** [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
**Historical Wayland plan:** on branch `plan/forge-wayland-live` (diverged; W1–W5 + W-storm)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL7 X11 | **Done** (operator green; on master) |
| CL8–CL11 + X11 polish | **Done** (plan branch) |
| Pre-Wayland prep (SEGV + move + rivals) | **Done** (this session; installed dirty) |
| Wayland residual smoke | **Next — human** (logout) |
| Merge plan → master | After Wayland smoke green enough |

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

## Operator action now (Wayland)

1. **Optional:** commit is local on control-loop — re-`./install` after commit for clean versionName.
2. **Log out** → at greeter pick **GNOME on Wayland** (not Xorg).
3. After login:

```bash
cd ~/dev/me/forge
forge ping          # ok + versionName
gsettings get org.gnome.shell disable-user-extensions   # must be false
forge layout dev
forge tree
```

4. Smoke checklist → [residual-smoke task](./tasks/forge-wayland-live_residual-smoke.md).
5. If Shell crashes: check `disable-user-extensions`; journal; note whether Nautilus/close/path-title was involved.

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
