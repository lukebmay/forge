# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (session wrap — RC path after workspace scope + Wayland)  
**Branch tip:** `master` @ `67b0256` (local, **ahead of origin — not pushed**)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload (operator will test after WS work)  
**Stash:** `stash@{0}` still present (applied earlier) — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Release-candidate story

After **workspace-scoped layouts** land and pass **X11 + Wayland** smoke, this tip
is a **reasonable RC** for daily dual-session use — **before** peel / container
motion redesign and browser-like tab DnD.

| In RC scope | Explicitly **after** RC |
| --- | --- |
| Action pipeline, control-loop, mon-order L→R bare | [Container motion design](./plans/forge-container-motion-design.md) (peel B, joins) |
| Monitor-recovery rename | HTML prototype → Shell MI* |
| Layout live X11 LX1–LX4 (partial tab drag) | [Tab chrome drag](./plans/forge-tab-chrome-drag.md) |
| **Workspace-scoped layout** (next session) | Selection S3+ / keybinds polish on containers branch |

---

## Next session (operator intent)

1. **Implement workspace scope** (P0) on `plan/forge-layout-workspace-scope` from up-to-date master.  
2. Live X11 verify (no cross-ws steal).  
3. Operator **Wayland** login → full residual + layout workspace smoke.  
4. If green → treat as RC candidate (still local until human asks to push/tag).

### Workspace scope — start here

**Plan:** [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md)

| ID | Task | Path |
| --- | --- | --- |
| **WS0** | Claim/plan **one workspace only** | [tasks/…_ws0-claim-scope.md](./tasks/forge-layout-workspace-scope_ws0-claim-scope.md) |
| **WS1** | Apply path + current ws (stop `ws0` hardcode) | [tasks/…_ws1-apply-current.md](./tasks/forge-layout-workspace-scope_ws1-apply-current.md) |
| **WS2** | CLI: sequential **XOR** static; preflight | [tasks/…_ws2-cli-grammar.md](./tasks/forge-layout-workspace-scope_ws2-cli-grammar.md) |
| **WS3** | Docs + live dual-ws | [tasks/…_ws3-docs-live.md](./tasks/forge-layout-workspace-scope_ws3-docs-live.md) |

**CLI locks (do not re-litigate):**

- Scope: target workspace only; **never** claim/move from other workspaces.  
- **Sequential** = all bare names → current, current+1, …  
- **Static** = all `W:name` and/or `name@W` (1-based).  
- **Mix sequential + numbered = error, apply nothing.**  
- Preflight all-or-nothing (missing profile / OOR ws / too few ws).  
- Layout names: no `:` or `@`. No `--on`.  

**Incident that forced this:** X11 smoke `forge layout dev` pulled **Inkscape from another workspace** into mon0 tabs.

### After WS (or parallel, design-only)

| Item | Note |
| --- | --- |
| [forge-container-motion-design.md](./plans/forge-container-motion-design.md) | Peel Model B lean; no edge auto-pop; join mess; **no Shell until MD2** |
| MD1 HTML prototype | [tasks/…_md1-html-prototype.md](./tasks/forge-container-motion-design_md1-html-prototype.md) |
| Wayland residual | [tasks/forge-wayland-live_residual-smoke.md](./tasks/forge-wayland-live_residual-smoke.md) |
| AP5 visual | Soft [blockers/B-ap5-operator-visual-matrix.md](./blockers/B-ap5-operator-visual-matrix.md) |

---

## Shipped this arc (master local, not pushed)

| Commit / area | Note |
| --- | --- |
| `0e8c2f7` | Bare dual layout arrays → **physical L→R** (not Meta mon0) |
| `ed77e04` + `b9e3040` | soft-rehome → **monitor-recovery** |
| `91ee417` … `67b0256` | Queue/docs: WS plan, exclusive CLI, motion design |
| Prior | CL0–CL11, action pipeline AP0–AP5 agent, LX1–LX4 |

**X11 live (this machine, before WS fix):** install/HUP green @ tip; mon0=left tabs\|ghostty, mon1=right ghostty\|tabs; **cross-ws steal still possible** until WS0–WS3.

---

## Operator checklist — Wayland RC smoke (after WS lands)

```bash
# after Wayland login
cd ~/dev/me/forge && ./install   # debug
SCHEMA=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA" set org.gnome.shell.extensions.forge log-level 4

forge ping
forge layout dev --dry-run    # candidates only on current ws; moved=0 if desk matches
# dual-ws: app on other ws must NOT appear after forge layout dev
forge layout list
# sequential / static grammar once WS2 ships
```

Also: residual Wayland checklist in [forge-wayland-live_residual-smoke.md](./tasks/forge-wayland-live_residual-smoke.md); soft AP5 gesture matrix if eyes-on.

---

## Open human blockers

| Severity | Item |
| --- | --- |
| soft | AP5 visual gesture matrix |
| hard | B-manual-black-session-verify |
| hard | resize-autotile-design (P3) |

---

## Agent git

| Rule | Detail |
| --- | --- |
| Queue canon | `agents/*` on **master** after wrap-up |
| WS implement | `plan/forge-layout-workspace-scope` ← merge master first |
| No push | unless human asks |
| Stash | do not drop until human confirms |

### Branches worth knowing

| Branch | State |
| --- | --- |
| `master` | Tip = mon-order + rename + queue docs |
| `plan/forge-layout-workspace-scope` | **Create** when starting WS |
| `plan/forge-first-class-containers` | Selection S2+ unmerged; rebase later |
| `plan/forge-wayland-live` | Keep (divergent) |

---

## Agent rules

FIRM SSH / secrets / no unsolicited push — see AGENTS.md.  
Do **not** implement peel/container motion Shell changes until motion design MD2 locks.  
