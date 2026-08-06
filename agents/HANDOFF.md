# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (CSS overrides C0–C2 complete)  
**Branch tip:** merge `plan/forge-css-overrides` → `master` (local, **not pushed**)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Just shipped

**CSS base + user overrides (D001)** — dual-load bundled then
`~/.config/forge/stylesheet/forge/stylesheet.css`; `patchCss` never full-clobbers;
Appearance writes deltas / Reset removes overrides. Docs: `docs/user/theming.md`.

Operator purple theme already on disk; reinstall + Super+Shift+r to pick up dual-load.

---

## Next session

1. **Layout workspace scope (P0)** — [plan](./plans/forge-layout-workspace-scope.md) WS0–WS3  
2. Operator **Wayland** residual smoke  
3. RC candidate after both green  

### Workspace scope

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
