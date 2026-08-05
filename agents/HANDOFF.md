# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (X11 polish green; ready for Wayland residual)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead of origin**; **not pushed**)  
**HEAD:** master has CL0–CL7; plan branch has CL8–CL11 + chrome/ghost-deco polish  
**Wayland residual:** **next** (X11 operator green on auto-exit CSD + layout apply)  
**Stashed WIP:** `plan/forge-wayland-live` — **do not drop**; do not pop onto control-loop/master  
**Remotes:** **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Next:** Wayland residual on `black` (logout/session; see [forge-wayland-live](./plans/forge-wayland-live.md))  
**Completed CL11 mon-ensure:** [cl11-residual-mon-ensure](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl11-residual-mon-ensure.md)  
**Completed CL10:** [cl10-apply-chrome](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl10-apply-chrome.md)  
**Completed CL9:** [cl9-parallel-deferred-open](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl9-parallel-deferred-open.md)  
**Completed CL8:** [cl8-deferred-hidden-open](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl8-deferred-hidden-open.md)  
**Completed CL7 live:** [cl7-live-ghostty](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-live-ghostty.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL7 X11 | **Done** (operator green; on master) |
| **CL8** deferred hidden LayoutBatch admit | **Done** (plan branch) |
| **CL9** parallel CLI open + map wait + unhide | **Done** (plan branch) |
| **CL10** apply chrome | **Done** (plan branch; default on; spinner + name) |
| **CL11** residual mon-ensure + structure verifier | **Done** (plan branch) |
| X11 polish (ghost deco / chrome UI) | **Done** (operator green 2026-08-05) |
| Wayland residual | **Next** |

---

## CL8+ lock (user)

Parallel `forge layout` opens must:

1. **Hide** mapped windows (opacity) until residual  
2. **Not** carve temporary TILE/split geometry mid-batch  
3. Early **`move_to_monitor`** for PlaceNext home mon  
4. **No raise/activate** thrash during batch  
5. One residual plan + render; focus from **layout saved focus**  
6. Optional apply chrome (CL10) — **never stick** (default off; hard clear)  
7. Skip client position hints  

See plan § *Deferred hidden open (CL8+)*.

### Trial apply chrome

Default **on**. Dim ~50% + spinner + `Forge` / `Loading layout "name"...`.
Disable if noisy:

```bash
gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled false
```

### Recent X11 polish (plan branch)

| Commit area | Note |
| --- | --- |
| Ghost decoration after auto-exit-tabbed | `9beebdc` — native CSD × was blocked by leftover reactive strip |
| Apply chrome presentation | `20c8d8f` — darker scrim, spinner, layout name via `begin:name` |
| CL11 residual mon-ensure | Structure verifier + mon hsplit residual |

---

## Agent git: stashed Wayland WIP

```sh
git stash list
# stash@{N}: On plan/forge-wayland-live: WIP plan/forge-wayland-live: rival-tilers...
```

Never drop; never pop onto `plan/forge-layout-control-loop` or `master`.

---

## Agent rules

| Rule | |
| --- | --- |
| Branch | `plan/forge-layout-control-loop` for CL8+ |
| Push | Never unless human asks |
| Live data | No Dropbox/secrets mutate |
