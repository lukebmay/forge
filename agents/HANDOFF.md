# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (live X11 LX1–LX4 complete on plan branch)  
**Branch tip:** `plan/forge-layout-live-x11` (merge → master when integrating)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload  
**Stash:** `stash@{0}` still present (applied earlier; drop after human OK)  
**Remotes:** **no push** unless human asks  

**Plan:** [forge-layout-live-x11.md](./plans/forge-layout-live-x11.md) — **complete**  
**Shipped:** LX1 FLOAT tab ensure · LX2 peel aspect · LX3 cross-mon · LX4 tab drag  
**Operator:** reinstall/HUP; live-smoke tab drag (unit-only for LX4)  
**Next queue:** mon-order X11 reverse (soft evidence) · AP5 visual · MR0 rename  
**Pipeline (done):** [forge-action-pipeline.md](./plans/forge-action-pipeline.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL11 + Wayland residual | **On master** |
| **Action pipeline AP0–AP4** | **Done** (2219 unit tests) |
| **AP5 agent HUP** | **Done** — no SEGV; extension ACTIVE |
| AP5 op visual | Soft blocker |
| layout mon order reverse X11 | **Next agent task** |
| MR0 soft-rehome rename | Queued P1 |
| Stash drop | Human OK only |

---

## What just merged to master

| Area | Note |
| --- | --- |
| CL8–CL11 | deferred open, parallel map, apply chrome, residual mon-ensure |
| Wayland preflight | `safeMoveToMonitor`, move mon+ε, rival tilers |
| Wayland residual | PWA icons, cwd, place, DnD, hints |
| Lock shield | no settle while locked; unlock rehome window |
| Open under focus + border from slot | `c34c8a8` |
| focus-no-reflow | no `renderTree("focus")` |
| Intra-tab thrash | focus-scoped decoration; forge-geom borders-only |

---

## Operator / agent next

1. Log into **X11** on black (agent can HUP).
2. `./install` (debug) + enable logging if needed.
3. Implement **AP1** on `plan/forge-action-pipeline`.
4. Smoke: mon0 Ghostty click must not flash mon1 tabs; tab switch no ¼-height; focus keys no forest reflow.

```bash
# logging (extension-local schema)
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 4
```

---

## Agent git

| Rule | Detail |
| --- | --- |
| Queue on master | PRIORITY / plans / tasks canon after wrap-up |
| Feature work | `plan/forge-action-pipeline` for AP1+ |
| No push | unless human asks |
| Stash | do not drop until human confirms |

### Branches

| Branch | State |
| --- | --- |
| `master` | Tip = control-loop + AP0 |
| `plan/forge-layout-control-loop` | Fully merged — **delete local** after AP0 commit |
| `plan/forge-wayland-live` | **Keep** (divergent history; not fully merged) |
| `plan/forge-action-pipeline` | Create from master for implementation |

---

## Agent rules

- FIRM SSH / secrets / no unsolicited push — see AGENTS.md  
- Action checklist: [docs/dev/actions.md](../docs/dev/actions.md) § Agent checklist  
- Raise multi-path intentional — DESIGN § Raise / restack  
