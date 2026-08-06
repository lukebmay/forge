# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (mon-order + monitor-recovery rename on master)  
**Branch tip:** `master` @ `b9e3040` (local, **not pushed**)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload  
**Stash:** `stash@{0}` still present (applied earlier; drop after human OK)  
**Remotes:** **no push** unless human asks  

**Shipped this session**

| Item | Note |
| --- | --- |
| mon-order X11 | Bare dual arrays bind physical L→R — `0e8c2f7` |
| MR0–MR2 | soft-rehome → **monitor-recovery** — `ed77e04` + `b9e3040` |

**Next queue:** AP5 visual (soft) · rebase containers branch → S3 kit binds · Wayland residual after operator logout  
**Pipeline (done):** [forge-action-pipeline.md](./plans/forge-action-pipeline.md)  
**Queue:** [PRIORITY.md](./PRIORITY.md)

---

## Session strategy

| Phase | Status |
| --- | --- |
| CL0–CL11 + Wayland residual code | **On master** |
| Action pipeline AP0–AP5 agent | **Done** |
| AP5 op visual | Soft blocker (human) |
| layout mon order reverse X11 | **Done** A/B AGREE |
| MR0–MR2 monitor-recovery rename | **Done** merged master |
| Container selection S3 | Plan/task on `plan/forge-first-class-containers` (unmerged; rebase first) |
| Stash drop | Human OK only |

---

## Operator / agent next

1. **X11:** `./install` (debug) + logging + HUP; smoke layout + mon L/R.
2. Operator **logout → Wayland** when ready for residual smoke.
3. Next code: rebase `plan/forge-first-class-containers` onto master (rename conflicts expected), then S3 kit bindings.

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
| No push | unless human asks |
| Stash | do not drop until human confirms |

### Branches

| Branch | State |
| --- | --- |
| `master` | Tip = mon-order + monitor-recovery rename |
| `plan/forge-monitor-recovery-rename` | Merged → master |
| `task/forge-layout-mon-order-x11-reversed` | Merged → master |
| `plan/forge-first-class-containers` | **Keep** — selection S2+ unmerged; rebase before S3 |
| `plan/forge-wayland-live` | **Keep** (divergent) |

---

## Agent rules

- FIRM SSH / secrets / no unsolicited push — see AGENTS.md  
- Action checklist: [docs/dev/actions.md](../docs/dev/actions.md) § Agent checklist  
- Raise multi-path intentional — DESIGN § Raise / restack  
