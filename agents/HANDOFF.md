# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (CSS overrides P0; theme restored on host)  
**Branch tip:** `master` (local, **ahead of origin — not pushed**)  
**X11:** preferred for agent `./install` + `killall -HUP gnome-shell`  
**Wayland:** ES modules need **logout** to reload  
**Stash:** `stash@{0}` still present (applied earlier) — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Next session (operator intent)

1. **CSS base + user overrides (P0)** — [plan](./plans/forge-css-overrides.md)  
   - **C0:** dual-load + kill `patchCss` clobber — [task](./tasks/forge-css-overrides_c0-dual-load.md)  
   - Branch: `plan/forge-css-overrides`  
2. Then layout workspace scope (WS0–WS3).  
3. Operator Wayland residual smoke.  

### CSS incident (why P0)

User colors live in `~/.config/forge/stylesheet/forge/stylesheet.css`.  
`patchCss()` full-replaced that file with bundled defaults on cssTag mismatch.  
Operator purple focus restored manually (2026-08-06); side split indicator keeps `border-radius: 0`.  
Design: always load **bundled base** then **user overrides**; never clobber.

### After CSS

| Item | Note |
| --- | --- |
| [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md) | WS0–WS3; exclusive sequential XOR static |
| Wayland residual smoke | After WS |
| [forge-container-motion-design.md](./plans/forge-container-motion-design.md) | Post-RC |

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
- Queue docs (`agents/*`) live on default branch after wrap-up merge.
