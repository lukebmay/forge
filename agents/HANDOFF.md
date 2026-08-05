# Handoff — forge (lukebmay)

**Updated:** 2026-08-05 (CL8 done; CL9 next)  
**Implement on:** `plan/forge-layout-control-loop` (**ahead of origin**; **not pushed**)  
**HEAD:** master has CL0–CL7; plan branch has CL8 deferred hidden open  
**Wayland residual:** **after** CL8–CL10 + X11 retest (do not block on Wayland now)  
**Stashed WIP:** `plan/forge-wayland-live` — **do not drop**; do not pop onto control-loop/master  
**Remotes:** **no push** unless human asks  

**Active plan:** [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md)  
**Next:** CL9 parallel CLI open + wait-for-map + unhide gate  
**Completed CL8:** [cl8-deferred-hidden-open](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl8-deferred-hidden-open.md)  
**Completed CL7 live:** [cl7-live-ghostty](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_cl7-live-ghostty.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL7 X11 | **Done** (operator green; on master) |
| **CL8** deferred hidden LayoutBatch admit | **Done** (plan branch) |
| **CL9–CL10** parallel CLI + apply chrome | **Next** |
| X11 retest layout dev | After CL8–CL10 |
| Wayland residual | After X11 retest |

---

## CL8+ lock (user)

Parallel `forge layout` opens must:

1. **Hide** mapped windows (opacity) until residual  
2. **Not** carve temporary TILE/split geometry mid-batch  
3. Early **`move_to_monitor`** for PlaceNext home mon  
4. **No raise/activate** thrash during batch  
5. One residual plan + render; focus from **layout saved focus**  
6. Optional apply chrome later (CL10) — **never stick**  
7. Skip client position hints  

See plan § *Deferred hidden open (CL8+)*.

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
