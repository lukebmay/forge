# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (RC: workspace scope WS0–WS3 on plan branch)  
**Branch tip:** `plan/forge-layout-workspace-scope` (from master CSS tip)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload — operator after agent X11 green  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Stable RC (this arc)

| Required for RC code | Status |
| --- | --- |
| CSS dual-load + deltas | **Done** on master |
| Workspace scope WS0–WS3 | **Active** plan branch |
| Unit tests green | gate each task |
| X11 dual-ws + layout smoke | after WS3 |

| Required for release confidence | Owner |
| --- | --- |
| Wayland residual smoke | human (logout) |
| Session DPMS / daily layout | human B-manual |
| AP5 visual matrix | human soft |

| Explicitly **not** RC | Note |
| --- | --- |
| Container motion / peel | design + MD1 post-RC |
| Resize / autotile | design P3 |
| Tab chrome drag / S3+ | later |

---

## Just shipped

**CSS base + user overrides (D001)** — dual-load bundled then
`~/.config/forge/stylesheet/forge/stylesheet.css`; `patchCss` never full-clobbers;
Appearance writes deltas / Reset removes overrides. Docs: `docs/user/theming.md`.

---

## This session

1. Human blockers reviewed (all 3 still relevant; RC tags added).  
2. Implement **WS0→WS3** via A/B taskforces on `plan/forge-layout-workspace-scope`.  
3. X11 thorough test; hand Wayland to operator.

### Workspace scope tasks

| ID | Task |
| --- | --- |
| **WS0** | Claim/plan one workspace only |
| **WS1** | Apply path + current ws |
| **WS2** | CLI sequential XOR static |
| **WS3** | Docs + live dual-ws |

**CLI locks:** never steal from other workspaces; sequential XOR static; mix = error.

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
